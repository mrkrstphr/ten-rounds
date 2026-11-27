import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import G from '../src/game.js';
import { loadSession, SAVE_KEY, validSave } from '../src/session.js';

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
function memoryStorage() {
  const entries = new Map();
  return {
    get length() { return entries.size; },
    key: index => [...entries.keys()][index] ?? null,
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)),
  };
}
beforeEach(() => Object.defineProperty(globalThis, 'localStorage', {
  configurable: true, value: memoryStorage(),
}));
after(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else delete globalThis.localStorage;
});
const serialize = (state, preferences = {}) => JSON.stringify({ state, sort: 'color', sound: true, ...preferences });

test('TenRounds starts with a valid game and a new save identifier', () => {
  const session = loadSession();
  assert.equal(SAVE_KEY, 'tenrounds.table.v1');
  assert.equal(session.state.round, 1);
  assert.equal(session.sort, 'number');
  assert.equal(session.sound, false);
  assert.ok(validSave(session.state));
  assert.equal(localStorage.length, 0, 'React initialization must not write storage');
});

test('The current save takes precedence over compatible older tables', () => {
  const state = G.newGame();
  state.round = 4;
  const old = G.newGame();
  old.round = 8;
  localStorage.setItem('previous-table.table.v1', serialize(old));
  localStorage.setItem(SAVE_KEY, serialize(state));
  assert.equal(loadSession().state.round, 4);
});

test('Older tables retain cards, turn, scores, goals, and preferences without changing the original', () => {
  const state = G.newGame();
  state.turn = 0;
  state.round = 4;
  state.players[0].phase = 6;
  state.players[0].score = 85;
  G.draw(state, 0);
  state.log.push('You laid down a phase.');
  const original = serialize(state);
  localStorage.setItem('previous-table.table.v1', original);
  const migrated = loadSession();
  assert.deepEqual(migrated.state, {
    ...state, log: state.log.map(line => line.replace('a phase.', 'a goal.')),
  });
  assert.equal(migrated.sort, 'color');
  assert.equal(migrated.sound, true);
  assert.equal(localStorage.getItem('previous-table.table.v1'), original);
  assert.equal(localStorage.getItem(SAVE_KEY), null, 'Persistence belongs to the React effect');
});

test('Malformed and unrelated storage entries are skipped before a valid older table', () => {
  localStorage.setItem('unrelated', serialize(G.newGame()));
  localStorage.setItem('broken.table.v1', 'not-json');
  const invalid = G.newGame();
  invalid.deck.pop();
  localStorage.setItem('incomplete.table.v1', serialize(invalid));
  const state = G.newGame();
  state.round = 7;
  localStorage.setItem('previous-table.table.v1', serialize(state));
  assert.equal(loadSession().state.round, 7);
});

test('An explicitly corrupt current save does not resurrect older progress', () => {
  const old = G.newGame();
  old.round = 8;
  localStorage.setItem('previous-table.table.v1', serialize(old));
  localStorage.setItem(SAVE_KEY, 'not-json');
  assert.equal(loadSession().state.round, 1);
});

test('Unavailable storage never prevents a playable game', () => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, get() { throw Error('Storage unavailable'); },
  });
  assert.ok(validSave(loadSession().state));
});

test('Saved preferences are normalized without altering gameplay', () => {
  const state = G.newGame();
  localStorage.setItem(SAVE_KEY, serialize(state, { sort: 'unsupported', sound: false }));
  const session = loadSession();
  assert.deepEqual(session.state, state);
  assert.equal(session.sort, 'number');
  assert.equal(session.sound, false);
});

test('Completed games retain the tenth goal and result after loading', () => {
  const state = G.newGame();
  state.status = 'game';
  state.players[0].phase = 10;
  state.result = { winner: 0, gameWinner: 0, gained: [0, 5], advanced: [true, false], phases: [9, 8], tieBreak: false };
  localStorage.setItem('previous-table.table.v1', serialize(state));
  const session = loadSession();
  assert.equal(session.state.players[0].phase, 10);
  assert.deepEqual(session.state.result, state.result);
});
