import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { WebSocket } from 'ws';
import { RoomStore } from '../server/rooms.js';
import { createAppServer } from '../server/index.js';

async function application(options = {}) {
  const app = await createAppServer({ production: true, store: new RoomStore(), ...options });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const post = async (path, command, headers = {}) => {
    const response = await fetch(origin + path, { method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ id: randomUUID(), ...command }) });
    return { response, ...await response.json() };
  };
  const view = async seat => {
    const response = await fetch(`${origin}/api/rooms/${seat.code}`, {
      headers: { Authorization: `Bearer ${seat.token}` },
    });
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    return response.json();
  };
  return { ...app, origin, post, view };
}

async function client(origin, path = '/room', socketOrigin = origin, protocol) {
  const socket = new WebSocket(origin.replace('http:', 'ws:') + path, protocol ? [protocol] : [], { origin: socketOrigin });
  const queue = [], listeners = new Set();
  socket.on('message', raw => {
    const message = JSON.parse(raw);
    for (const listener of listeners) if (listener(message)) return;
    queue.push(message);
  });
  await once(socket, 'open');
  function wait(predicate) {
    const existing = queue.findIndex(predicate);
    if (existing >= 0) return Promise.resolve(queue.splice(existing, 1)[0]);
    return new Promise((resolveWait, reject) => {
      const timeout = setTimeout(() => { listeners.delete(receive); reject(Error('Timed out waiting for server message')); }, 3000);
      function receive(message) {
        if (!predicate(message)) return false;
        clearTimeout(timeout); listeners.delete(receive); resolveWait(message); return true;
      }
      listeners.add(receive);
    });
  }
  return {
    socket, wait,
    call: async message => {
      const id = message.id || randomUUID(), response = wait(m => m.id === id);
      socket.send(JSON.stringify({ ...message, id }));
      return response;
    },
  };
}

test('one production port serves SSR, deep links, assets, health, and browser check entry points', async () => {
  const app = await application();
  try {
    for (const path of ['/', '/index.html', '/online', '/rooms/ABCDEF', '/tests.html', '/ui-tests.html', '/multiplayer-tests.html']) {
      const response = await fetch(app.origin + path), html = await response.text();
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('content-type'), /text\/html/);
      assert.match(html, /TenRounds/);
      if (path === '/') {
        assert.match(html, /Getting your table ready/);
        const script = html.match(/(?:src|import\s*)[="]*\s*"(\/assets\/[^"]+\.js)"/)?.[1] ||
          html.match(/"(\/assets\/entry\.client-[^"]+\.js)"/)?.[1];
        assert.ok(script, 'The SSR document loads the framework client');
        assert.equal((await fetch(app.origin + script)).status, 200);
        assert.match((await fetch(app.origin + script)).headers.get('cache-control'), /immutable/);
        const styles = [...html.matchAll(/href="(\/assets\/[^"]+\.css)"/g)].map(match => match[1]);
        assert.ok(styles.length, 'The document loads bundled styles');
        const fonts = new Set();
        for (const style of styles) {
          const css = await fetch(app.origin + style).then(r => r.text());
          assert.doesNotMatch(css, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
          for (const match of css.matchAll(/url\(["']?(\/assets\/[^"')]+\.woff2)/g)) fonts.add(match[1]);
        }
        assert.ok(fonts.size >= 2, 'Both fonts ship in the application');
        for (const font of fonts) {
          const response = await fetch(app.origin + font);
          assert.equal(response.status, 200);
          assert.match(response.headers.get('cache-control'), /immutable/);
          assert.ok((await response.arrayBuffer()).byteLength > 1000);
        }
      }
    }
    assert.deepEqual(await fetch(app.origin + '/health').then(r => r.json()), { ok: true });
    for (const path of ['/rooms.local/ABCDEF.json', '/server/rooms.js', '/.env', '/build/server/index.js']) {
      assert.equal((await fetch(app.origin + path)).status, 404, 'Private files must not be served');
    }
    const invitation = await fetch(app.origin + '/?room=ABCDEF', { redirect: 'manual' });
    assert.equal(invitation.status, 302);
    assert.equal(invitation.headers.get('location'), '/rooms/ABCDEF');
  } finally { await app.close(); }
});

test('HTTP actions own moves; loaders redact hands; WebSockets only authenticate and notify', { timeout: 15000 }, async () => {
  const app = await application();
  try {
    const created = await app.post('/api/rooms', { type: 'create', name: 'River' });
    assert.equal(created.ok, true);
    const host = created.credentials, path = `/api/rooms/${host.code}`;
    const joined = await app.post('/api/rooms', { type: 'join', code: host.code, name: 'Sky' });
    const guest = joined.credentials;
    const a = await client(app.origin), b = await client(app.origin);
    assert.equal((await a.call({ type: 'resume', ...host })).ok, true);
    assert.equal((await b.call({ type: 'resume', ...guest })).ok, true);
    assert.equal((await app.post(path, { ...guest, revision: 1, action: { type: 'start' } })).ok, false);
    assert.equal((await app.post(path, { ...host, revision: 1, action: { type: 'start' } })).ok, true);
    const changed = await b.wait(m => m.type === 'changed' && m.revision === 2);
    assert.deepEqual(Object.keys(changed).sort(), ['code', 'revision', 'type']);
    const h = (await app.view(host)).room, g = (await app.view(guest)).room;
    assert.deepEqual(h.game.players[1].hand, Array(10).fill(null));
    assert.deepEqual(g.game.players[1].hand, Array(10).fill(null));
    assert.deepEqual(h.game.deck, Array(87).fill(null));
    assert.notDeepEqual(h.game.players[0].hand, g.game.players[0].hand);
    assert.ok(!JSON.stringify(h).includes('token'));
    assert.equal(h.game.turn, 1 - g.game.turn);
    const seat = h.game.turn === 0 ? host : guest;
    const command = { ...seat, id: randomUUID(), revision: 2, action: { type: 'draw', source: 'deck' } };
    assert.equal((await app.post(path, command)).ok, true);
    assert.equal((await app.post(path, command)).ok, true);
    assert.equal(app.store.get(host.code).revision, 3, 'Retry must not draw twice');
    assert.equal((await app.post(path, { ...command, id: randomUUID() })).ok, false);
    assert.equal((await a.call({ type: 'action', action: { type: 'discard', id: 1 } })).ok, false);
    const disconnected = once(a.socket, 'close'); a.socket.close(); await disconnected;
    await b.wait(m => m.type === 'changed' && m.revision === 3);
    assert.equal((await app.view(guest)).room.players[1].connected, false);
    const resumed = await client(app.origin);
    assert.equal((await resumed.call({ type: 'resume', ...host })).ok, true);
    assert.equal((await app.view(host)).room.players[0].connected, true);
    const replacement = await client(app.origin), replaced = once(resumed.socket, 'close');
    assert.equal((await replacement.call({ type: 'resume', ...host })).ok, true);
    assert.equal((await replaced)[0], 4001);
    const impostor = await client(app.origin);
    assert.equal((await impostor.call({ type: 'resume', code: host.code, token: 'z'.repeat(43) })).ok, false);
  } finally { await app.close(); }
});

test('HTTP authentication, CSRF, invalid input, body size, save errors, and limits fail closed', async () => {
  const app = await application();
  try {
    const { credentials } = await app.post('/api/rooms', { type: 'create', name: 'River' });
    const path = `/api/rooms/${credentials.code}`;
    assert.equal((await fetch(app.origin + path).then(r => r.json())).ok, false);
    assert.equal((await app.view({ ...credentials, token: 'z'.repeat(43) })).ok, false);
    for (const headers of [{ Origin: 'https://untrusted.example' }, { Origin: '' }, { 'Content-Type': 'text/plain' }]) {
      const result = await app.post('/api/rooms', { type: 'create', name: 'Blocked' }, headers);
      assert.equal(result.ok, false);
      assert.equal(result.response.status, 400);
    }
    const large = await app.post('/api/rooms', { type: 'create', name: 'X'.repeat(9000) });
    assert.equal(large.ok, false);
    assert.match(large.error, /too large/);
    const stream = new ReadableStream({ start(controller) { controller.enqueue(Buffer.alloc(9000, 120)); controller.close(); } });
    const chunked = await fetch(app.origin + '/api/rooms', {
      method: 'POST', headers: { Origin: app.origin, 'Content-Type': 'application/json' },
      body: stream, duplex: 'half',
    });
    assert.equal(chunked.status, 413, 'The streaming size limit must work without Content-Length');
    assert.match((await chunked.json()).error, /too large/);
    const malformed = await fetch(app.origin + '/api/rooms', {
      method: 'POST', headers: { Origin: app.origin, 'Content-Type': 'application/json' }, body: '{',
    }).then(r => r.json());
    assert.equal(malformed.error, 'Invalid request.');
    app.store.directory = join(tmpdir(), randomUUID(), 'missing');
    const failed = await app.post('/api/rooms', { type: 'create', name: 'Unsaved' });
    assert.equal(failed.ok, false);
    assert.ok(!JSON.stringify(failed).includes(app.store.directory));
    assert.equal(app.store.rooms.size, 1);
    app.store.directory = null;
    let result;
    for (let i = 0; i < 21; i++) result = await app.post('/api/rooms', { type: 'create', name: 'Rate limited' });
    assert.match(result.error, /Too many/);
  } finally { await app.close(); }
});

test('WebSocket origins, paths, malformed requests, and payload sizes are checked', { timeout: 10000 }, async () => {
  const app = await application();
  try {
    await assert.rejects(client(app.origin, '/room', 'https://untrusted.example'), /403/);
    await assert.rejects(client(app.origin, '/other'), /403/);
    await assert.rejects(client(app.origin, '/other', app.origin, 'vite-hmr'), /403/);
    const guest = await client(app.origin);
    assert.equal((await guest.call({ type: 'create', name: 'Blocked' })).ok, false);
    guest.socket.send('{');
    assert.equal((await guest.wait(m => m.ok === false && !m.id)).error, 'Invalid request.');
    const closed = once(guest.socket, 'close'); guest.socket.send('x'.repeat(9000));
    assert.equal((await closed)[0], 1009);
    for (const raw of [id => JSON.stringify({ id, type: 'unknown' }), () => '{']) {
      const limited = await client(app.origin), done = once(limited.socket, 'close');
      for (let i = 0; i < 41; i++) limited.socket.send(raw(`rate-${i}`));
      assert.equal((await done)[0], 4008);
    }
  } finally { await app.close(); }
});

test('a new production server restores persisted room credentials and acknowledged moves', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tenrounds-app-'));
  let app = await application({ store: new RoomStore({ directory }) });
  try {
    const { credentials: host } = await app.post('/api/rooms', { type: 'create', name: 'River' });
    await app.post('/api/rooms', { type: 'join', code: host.code, name: 'Sky' });
    // Store checks cover the full match; this checks the actual deployable server's restart path.
    app.store.act(host.code, 0, { id: randomUUID(), revision: 1, action: { type: 'start' } });
    const before = (await app.view(host)).room;
    await app.close();
    app = await application({ store: new RoomStore({ directory }) });
    assert.deepEqual((await app.view(host)).room, before);
    const socket = await client(app.origin);
    assert.equal((await socket.call({ type: 'resume', ...host })).ok, true);
  } finally { await app.close(); rmSync(directory, { recursive: true, force: true }); }
});
