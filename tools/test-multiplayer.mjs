import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import G from '../src/game.js';
import { validSave } from '../src/session.js';
import { RoomStore, playerView, validCode } from '../server/rooms.js';

function table(options) {
  const store = new RoomStore(options), host = store.create('River'), guest = store.join(host.code, 'Sky');
  const act = (index, action, extra = {}) => store.act(host.code, index, {
    id: randomUUID(), revision: store.get(host.code).revision, action, ...extra,
  });
  return { store, host, guest, act, room: () => store.get(host.code) };
}

test('rooms use shareable codes, private seat tokens, names, and a two-seat lobby', () => {
  const store = new RoomStore(), host = store.create(' River ');
  assert.ok(validCode(host.code));
  assert.equal(host.token.length, 43);
  assert.deepEqual(store.authenticate(host.code, host.token), { code: host.code, index: 0 });
  const guest = store.join(host.code, 'River');
  assert.equal(store.get(host.code).players[0].name, 'River');
  assert.notEqual(guest.token, host.token);
  assert.throws(() => store.join(host.code, 'Third'), /full/);
  assert.throws(() => store.authenticate(host.code, 'x'.repeat(43)), /rejoin/);
  assert.throws(() => store.authenticate(host.code, {}), /rejoin/);
  assert.throws(() => store.create(' '.repeat(5)), /name/);
  assert.throws(() => store.create('x'.repeat(25)), /name/);
  assert.throws(() => store.get('../bad'), /not found/);
});

test('only the host starts a full room; moves obey identity, turn, and draw/play state', () => {
  const { host, store, act, room } = table();
  assert.throws(() => act(1, { type: 'start' }), /host/);
  assert.throws(() => act(0, { type: 'draw', source: 'deck' }), /host to start/);
  act(0, { type: 'start' });
  assert.equal(room().state.players[0].name, 'River');
  assert.equal(room().state.players[1].name, 'Sky');
  assert.throws(() => act(0, { type: 'start' }), /already started/);
  const turn = room().state.turn;
  assert.throws(() => act(1 - turn, { type: 'draw', source: 'deck' }), /your turn/);
  assert.throws(() => act(turn, { type: 'discard', id: room().state.players[turn].hand[0].id }), /Draw a card/);
  act(turn, { type: 'draw', source: 'deck' });
  assert.throws(() => act(turn, { type: 'draw', source: 'deck' }), /already drew/);
  assert.equal(room().state.players[turn].hand.length, 11);
  const stolen = room().state.players[1 - turn].hand[0].id;
  const before = structuredClone(room());
  assert.throws(() => act(turn, { type: 'discard', id: stolen }), /Select one card/);
  assert.deepEqual(room(), before);
  assert.equal(store.authenticate(host.code, host.token).index, 0);
});

test('private views rotate seats and results without exposing opponent cards or the deck', () => {
  const { act, room } = table();
  act(0, { type: 'start' });
  for (const index of [0, 1]) {
    const state = room().state, view = playerView(state, index);
    assert.deepEqual(view.players[0].hand, state.players[index].hand);
    assert.deepEqual(view.players[1].hand, Array(10).fill(null));
    assert.deepEqual(view.deck, Array(87).fill(null));
    assert.equal(view.turn, state.turn === index ? 0 : 1);
    assert.equal(view.players[0].name, index === 0 ? 'River' : 'Sky');
    assert.ok(!JSON.stringify(view).includes('token'));
    view.players[0].hand.pop();
    assert.equal(state.players[index].hand.length, 10);
  }
  const state = structuredClone(room().state);
  state.status = 'game';
  state.result = { winner: 1, gameWinner: 0, gained: [5, 25], advanced: [true, false], phases: [9, 8], tieBreak: false };
  assert.deepEqual(playerView(state, 1).result, {
    winner: 0, gameWinner: 1, gained: [25, 5], advanced: [false, true], phases: [8, 9], tieBreak: false,
  });
});

test('duplicate commands are harmless; stale, malformed, and illegal commands are atomic', () => {
  const { store, host, act, room } = table();
  act(0, { type: 'start' });
  const request = { id: randomUUID(), revision: room().revision, action: { type: 'draw', source: 'deck' } };
  const turn = room().state.turn;
  store.act(host.code, turn, request);
  const after = structuredClone(room());
  assert.deepEqual(store.act(host.code, turn, request), { duplicate: true });
  assert.deepEqual(room(), after);
  assert.throws(() => act(turn, { type: 'discard', id: room().state.players[turn].hand[0].id }, { revision: request.revision }), /table changed/);
  for (const action of [null, [], { type: '__proto__' }, { type: 'computerTurn' },
    { type: 'draw', source: '__proto__' }, { type: 'discard', id: -1 }, { type: 'discard', id: '1' },
    { type: 'lay', ids: [0, null] }, { type: 'hit', id: 1, target: 2, group: 0 }]) {
    assert.throws(() => act(turn, action), /valid move/);
    assert.deepEqual(room(), after);
  }
  assert.throws(() => act(turn, { type: 'lay', ids: [1, 1, 1, 1, 1, 1] }), /twice/);
  assert.deepEqual(room(), after);
  assert.throws(() => act(0, { type: 'nextRound' }), /Finish/);
  assert.throws(() => act(0, { type: 'rematch' }), /Finish/);
});

test('laying goals and hitting use real controls commands, including the guest’s rotated target', () => {
  const { store, act, room } = table();
  act(0, { type: 'start' });
  const fixture = structuredClone(room()), state = fixture.state, pool = G.deck();
  const take = (value, color) => pool.splice(pool.findIndex(c => c.value === value && c.color === color), 1)[0];
  const set = value => ['red', 'blue', 'green'].map(color => take(value, color));
  state.players[0].hand = [...set(1), ...set(2), take(1, 'yellow'), take(8, 'red'), take(9, 'blue'), take(10, 'green'), take(12, 'yellow')];
  state.players[1].hand = [...set(3), ...set(4), take(1, 'yellow'), take(7, 'red'), take(8, 'blue'), take(9, 'green')];
  state.discard = [take(9, 'yellow')];
  state.deck = pool;
  state.turn = 0;
  state.step = 'play';
  store.save(fixture);
  act(0, { type: 'lay', ids: state.players[0].hand.slice(0, 6).map(c => c.id) });
  act(0, { type: 'hit', id: state.players[0].hand[6].id, target: 0, group: 0 });
  act(0, { type: 'discard', id: state.players[0].hand[7].id });
  act(1, { type: 'draw', source: 'deck' });
  act(1, { type: 'lay', ids: state.players[1].hand.slice(0, 6).map(c => c.id) });
  act(1, { type: 'hit', id: state.players[1].hand[6].id, target: 1, group: 0 });
  assert.equal(room().state.players[0].melds[0].cards.length, 5);
  assert.equal(room().state.players[1].melds[0].cards.length, 3);
  assert.ok(validSave(room().state), 'All 108 original cards remain accounted for');
});

test('room snapshots and deduplication survive a server restart; tokens are hashed at rest', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tenrounds-rooms-'));
  try {
    const { host, guest, store, act, room } = table({ directory });
    act(0, { type: 'start' });
    const index = room().state.turn;
    const request = { id: randomUUID(), revision: room().revision, action: { type: 'draw', source: 'deck' } };
    store.act(host.code, index, request);
    const acknowledged = structuredClone(room());
    store.directory = join(directory, 'missing-directory');
    assert.throws(() => act(index, { type: 'discard', id: room().state.players[index].hand[0].id }), { code: 'ENOENT' });
    assert.deepEqual(room(), acknowledged, 'A failed disk write must not commit an in-memory move');
    store.directory = directory;
    const restarted = new RoomStore({ directory });
    assert.deepEqual(restarted.get(host.code), room());
    assert.equal(restarted.authenticate(host.code, guest.token).index, 1);
    assert.deepEqual(restarted.act(host.code, index, request), { duplicate: true });
    const raw = readFileSync(join(directory, `${host.code}.json`), 'utf8');
    assert.ok(!raw.includes(host.token) && !raw.includes(guest.token));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('abandoned rooms expire and room capacity is bounded', () => {
  let time = 0;
  const store = new RoomStore({ now: () => time, ttl: 100, maxRooms: 1 });
  const host = store.create('Host');
  assert.throws(() => store.create('Another'), /full/);
  assert.throws(() => store.act(host.code, 0, { id: 'start', revision: 0, action: { type: 'start' } }), /friend/);
  time = 100;
  assert.throws(() => store.authenticate(host.code, host.token), /expired/);
  store.cleanup();
  assert.equal(store.rooms.size, 0);
  assert.ok(store.create('Another'));
});

test('a complete two-human command match covers goals, hits, skips, rounds, and rematch', { timeout: 60000 }, () => {
  let seed = 31;
  const { store, act, room } = table({ random: () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  } });
  act(0, { type: 'start' });
  let turns = 0, hits = 0, lays = 0, skips = 0, rounds = 0;
  while (room().state.status !== 'game' && turns < 2500) {
    if (room().state.status === 'round') {
      assert.throws(() => act(1, { type: 'nextRound' }), /host/);
      act(0, { type: 'nextRound' });
      rounds++;
      continue;
    }
    const index = room().state.turn;
    const send = action => act(index, action);
    send({ type: 'draw', source: 'deck' });
    let state = room().state, player = state.players[index];
    if (!player.melds.length) {
      const goal = G.findPhase(player.hand, player.phase);
      if (goal) { send({ type: 'lay', ids: goal.flatMap(m => m.cards.map(c => c.id)) }); lays++; }
    }
    let moved = true;
    while (moved && room().state.status === 'playing') {
      moved = false;
      state = room().state; player = state.players[index];
      if (!player.melds.length) break;
      outer: for (const card of player.hand) {
        for (const target of [0, 1]) {
          for (let group = 0; group < state.players[target].melds.length; group++) {
            const options = G.hitOptions(state.players[target].melds[group], card);
            if (options.length) {
              send({ type: 'hit', id: card.id, target: target === index ? 0 : 1, group, side: options[0] });
              hits++; moved = true; break outer;
            }
          }
        }
      }
    }
    if (room().state.status === 'playing') {
      state = room().state;
      const card = G.chooseDiscard(state, index);
      send({ type: 'discard', id: card.id });
      if (card.kind === 'skip') { skips++; assert.equal(room().state.turn, index); }
    }
    assert.ok(validSave(room().state), 'Card conservation and valid progression after each turn');
    turns++;
  }
  assert.equal(room().state.status, 'game');
  assert.ok(hits > 0 && lays >= 10 && skips > 0 && rounds >= 9);
  assert.throws(() => act(1, { type: 'rematch' }), /host/);
  const match = room().match;
  act(0, { type: 'rematch' });
  assert.equal(room().state.round, 1);
  assert.equal(room().match, match + 1);
  assert.ok(room().state.players.every(p => p.score === 0 && p.phase === 0));
  console.log(`Online command match: ${turns} turns, ${rounds + 1} rounds, ${lays} goals, ${hits} hits, ${skips} skips; ${store.rooms.size} room.`);
});
