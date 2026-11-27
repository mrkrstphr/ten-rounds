import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

function replaceGlobal(name, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  return () => previous ? Object.defineProperty(globalThis, name, previous) : delete globalThis[name];
}

test('a live seat stays stable if shared frame storage changes; a fresh page reads the saved seat', async () => {
  const values = new Map(), restore = replaceGlobal('sessionStorage', {
    getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value),
  });
  try {
    const live = await import(`../src/room-session.js?${randomUUID()}`);
    const host = { code: 'ABCDEF', token: 'h'.repeat(43) }, guest = { ...host, token: 'g'.repeat(43) };
    assert.equal(live.writeRoomCredentials(host), true);
    values.set(live.roomStorageKey(host.code), JSON.stringify(guest));
    assert.deepEqual(live.readRoomCredentials(host.code), host);
    const refreshed = await import(`../src/room-session.js?${randomUUID()}`);
    assert.deepEqual(refreshed.readRoomCredentials(host.code), guest);
    assert.equal(live.readRoomCredentials('ZZZZZZ'), null);
  } finally { restore(); }
});

test('blocked storage retains the live seat; request IDs work without secure-context randomUUID', async () => {
  const restoreStorage = replaceGlobal('sessionStorage', {
    getItem: () => { throw Error('Blocked'); }, setItem: () => { throw Error('Blocked'); },
  });
  const restoreCrypto = replaceGlobal('crypto', { getRandomValues: bytes => bytes.fill(7) });
  try {
    const room = await import(`../src/room-session.js?${randomUUID()}`);
    const seat = { code: 'ABCDEF', token: 'h'.repeat(43) };
    assert.equal(room.readRoomCredentials(seat.code), null);
    assert.equal(room.writeRoomCredentials(seat), false);
    assert.deepEqual(room.readRoomCredentials(seat.code), seat);
    assert.equal(room.roomRequestId(), '07'.repeat(16));
  } finally { restoreCrypto(); restoreStorage(); }
});
