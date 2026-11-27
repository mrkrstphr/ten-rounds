import { WebSocketServer, WebSocket } from 'ws';
import { RoomStore, playerView } from './rooms.js';

export function attachRooms(server, { store = new RoomStore(), origins = [], development = false } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8192, perMessageDeflate: false });
  const attempts = new Map();
  function allowed(origin, host) {
    if (origins.length) return origins.includes(origin);
    try { const url = new URL(origin); return ['http:', 'https:'].includes(url.protocol) && url.host === host; }
    catch { return false; }
  }
  function limit(ip, kind) {
    const now = Date.now(), previous = attempts.get(ip);
    if (!previous && attempts.size >= 10000) throw Error('The server is busy. Please try again.');
    const bucket = previous && now - previous.start < 60000 ? previous : { start: now, sockets: 0, requests: 0, rooms: 0 };
    attempts.set(ip, bucket);
    const maximum = kind === 'sockets' ? 60 : kind === 'rooms' ? 20 : 120;
    if (++bucket[kind] > maximum) throw Error('Too many requests. Please try again later.');
  }
  const connected = (code, index) => [...wss.clients].some(s =>
    s.identity?.code === code && s.identity.index === index && s.readyState === WebSocket.OPEN);
  const send = (socket, message) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 128 * 1024) return socket.terminate();
    socket.send(JSON.stringify(message));
  };
  function snapshot(code, index) {
    const room = store.get(code);
    return {
      code, host: index === 0, revision: room.revision, match: room.match,
      players: [index, 1 - index].map(i => room.players[i]
        ? { name: room.players[i].name, connected: connected(code, i) } : null),
      game: playerView(room.state, index),
    };
  }
  function broadcast(code) {
    let revision;
    try { revision = store.get(code).revision; } catch { return; }
    for (const socket of wss.clients) if (socket.identity?.code === code) {
      send(socket, { type: 'changed', code, revision });
    }
  }
  function act(identity, command) {
    if (command.action?.type === 'start' && !connected(identity.code, 1 - identity.index)) {
      throw Error('Wait for your friend to connect.');
    }
    store.act(identity.code, identity.index, command);
    broadcast(identity.code);
  }
  server.on('upgrade', (request, socket, head) => {
    // Vite's HMR socket belongs to Vite, not the room protocol.
    if (development && request.headers['sec-websocket-protocol'] === 'vite-hmr') return;
    const ip = request.socket.remoteAddress;
    try {
      limit(ip, 'sockets');
      if (request.url !== '/room' || !allowed(request.headers.origin, request.headers.host) ||
        [...wss.clients].filter(client => client.ip === ip).length >= 20 || wss.clients.size >= 1000) throw Error('Forbidden');
    } catch { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
    wss.handleUpgrade(request, socket, head, client => { client.ip = ip; wss.emit('connection', client); });
  });
  wss.on('connection', socket => {
    socket.alive = true;
    let count = 0, windowStart = Date.now();
    const timer = setTimeout(() => { if (!socket.identity) socket.close(4003, 'Join a room first.'); }, 10000);
    socket.on('error', () => {});
    socket.on('pong', () => { socket.alive = true; });
    socket.on('message', raw => {
      if (Date.now() - windowStart >= 10000) { windowStart = Date.now(); count = 0; }
      if (++count > 40) { socket.close(4008, 'Too many requests.'); return; }
      let message;
      try {
        message = JSON.parse(raw.toString());
        if (!message || typeof message.id !== 'string' || !/^[\w-]{1,64}$/.test(message.id)) throw Error('Invalid request.');
        if (message.type !== 'resume' || socket.identity) throw Error('Use an HTTP action to change the room.');
        const identity = store.authenticate(message.code, message.token);
        for (const other of wss.clients) if (other !== socket &&
          other.identity?.code === identity.code && other.identity.index === identity.index) {
          other.identity = null; other.close(4001, 'This seat is open in another tab.');
        }
        socket.identity = identity;
        clearTimeout(timer);
        send(socket, { id: message.id, ok: true });
        broadcast(identity.code);
      } catch (error) {
        send(socket, { id: message?.id, ok: false, error: error instanceof SyntaxError ? 'Invalid request.' : error.message });
      }
    });
    socket.on('close', () => { clearTimeout(timer); if (socket.identity) broadcast(socket.identity.code); });
  });
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.alive) { socket.terminate(); continue; }
      socket.alive = false; socket.ping();
    }
    for (const [ip, bucket] of attempts) if (Date.now() - bucket.start >= 60000) attempts.delete(ip);
    try { store.cleanup(); } catch { console.error('Unable to clean up expired rooms. Check the room data volume.'); }
  }, 30000);
  heartbeat.unref();
  return {
    store, snapshot, act, broadcast, allowed, limit,
    close: () => new Promise(resolve => {
      clearInterval(heartbeat);
      for (const socket of wss.clients) socket.close(1012, 'Server restarting.');
      const force = setTimeout(() => { for (const socket of wss.clients) socket.terminate(); }, 1000);
      wss.close(() => { clearTimeout(force); resolve(); });
    }),
  };
}
