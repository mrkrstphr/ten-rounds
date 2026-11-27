import { useEffect, useRef, useState } from 'react';
import { useFetcher, useLoaderData, useLocation, useNavigate, useRevalidator } from 'react-router';
import { readRoomCredentials, writeRoomCredentials, roomRequestId } from './room-session.js';

export default function useRooms() {
  const data = useLoaderData(), location = useLocation(), navigate = useNavigate();
  const fetcher = useFetcher(), revalidator = useRevalidator();
  const code = data.initialCode;
  const token = readRoomCredentials(code)?.token;
  const [room, setRoom] = useState(data.room);
  const [status, setStatus] = useState(token ? 'connecting' : 'offline');
  const [error, setError] = useState(data.error || '');
  const [awaiting, setAwaiting] = useState(false);
  const pending = useRef(null), processed = useRef(null), refresh = useRef(null), current = useRef(room);
  refresh.current = revalidator.revalidate;
  current.current = room;

  useEffect(() => {
    if (data.room) setRoom(previous => !previous || data.room.code !== previous.code ||
      data.room.revision >= previous.revision ? data.room : previous);
    if (data.error) setError(data.error);
  }, [data]);

  useEffect(() => {
    const result = fetcher.data, entry = pending.current;
    if (!result || result === processed.current || !entry || result.id && result.id !== entry.id) return;
    processed.current = result;
    pending.current = null;
    setAwaiting(false);
    if (!result.ok) {
      setError(result.error);
      entry.reject(Error(result.error));
      return;
    }
    if (result.credentials) {
      if (!writeRoomCredentials(result.credentials)) setError('Keep this tab open. Your browser blocked reconnect storage.');
      const target = `/rooms/${result.credentials.code}`;
      if (location.pathname === target) refresh.current();
      else navigate(target, { replace: true });
    }
    entry.resolve();
  }, [fetcher.data, navigate, location.pathname]);

  useEffect(() => () => {
    pending.current?.reject(Error('You left the room.'));
    pending.current = null;
  }, []);

  useEffect(() => {
    if (!code || !token) return;
    let disposed = false, socket, timer, retries = 0, fatal = false;
    function connect() {
      if (disposed) return;
      setStatus(retries ? 'reconnecting' : 'connecting');
      const url = new URL('/room', window.location.href);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(url);
      const timeout = setTimeout(() => socket.close(), 10000);
      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'resume', id: roomRequestId(), code, token }));
      };
      socket.onmessage = event => {
        if (disposed) return;
        const message = JSON.parse(event.data);
        if (message.type === 'changed') refresh.current();
        else if (message.ok) {
          clearTimeout(timeout); retries = 0; setStatus('connected'); setError('');
        } else {
          fatal = true; setError(message.error || 'Unable to rejoin the room.'); socket.close();
        }
      };
      socket.onerror = () => {};
      socket.onclose = event => {
        clearTimeout(timeout);
        if (disposed) return;
        if (event.code === 4001) {
          fatal = true; setError('This seat is open in another tab. Return to computer play here.');
        }
        if (fatal) setStatus('offline');
        else {
          setStatus('reconnecting');
          timer = setTimeout(connect, Math.min(8000, 500 * 2 ** retries++));
        }
      };
    }
    connect();
    return () => { disposed = true; clearTimeout(timer); socket?.close(); };
  }, [code, token]);

  function submit(action, command) {
    if (pending.current) return Promise.reject(Error('Please wait for your previous move.'));
    const id = roomRequestId();
    setError('');
    return new Promise((resolve, reject) => {
      pending.current = { id, resolve, reject };
      setAwaiting(true);
      fetcher.submit({ ...command, id }, { method: 'post', action, encType: 'application/json' });
    });
  }
  return {
    room: room?.code === code ? room : null, status, busy: fetcher.state !== 'idle' || awaiting, error,
    screen: ['/', '/index.html'].includes(location.pathname) && !code ? 'solo' : 'entry',
    initialCode: code, active: Boolean(code && token), connected: status === 'connected',
    open: () => navigate('/online'),
    leave: () => navigate('/'),
    enter: (type, name, roomCode) => {
      if (type === 'join' && readRoomCredentials(roomCode)?.token) navigate(`/rooms/${roomCode}`);
      else submit('/api/rooms', { type, name, code: roomCode }).catch(() => {});
    },
    send: action => status === 'connected'
      ? submit(`/api/rooms/${code}`, { token, revision: current.current.revision, action })
      : Promise.reject(Error('Reconnect before making a move.')),
  };
}
