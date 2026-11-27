import { randomBytes, randomInt, createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import G from '../src/game.js';
import { applyAction } from '../src/actions.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DAY = 24 * 60 * 60 * 1000;
const rng = () => randomInt(0x100000000) / 0x100000000;
const hash = token => createHash('sha256').update(token).digest('hex');
export const validCode = code => typeof code === 'string' && /^[A-HJ-NP-Z2-9]{6}$/.test(code);

function playerName(value) {
  if (typeof value !== 'string') throw Error('Enter your name.');
  const name = value.replace(/[\p{C}]/gu, '').replace(/\s+/g, ' ').trim();
  if (!name || name.length > 24) throw Error('Use a name between 1 and 24 characters.');
  return name;
}

function seat(name) {
  const token = randomBytes(32).toString('base64url');
  return { token, player: { name: playerName(name), tokenHash: hash(token), requests: [] } };
}

export function playerView(state, index) {
  if (!state) return null;
  const order = [index, 1 - index];
  return {
    version: state.version, round: state.round, status: state.status, step: state.step,
    turn: state.turn === index ? 0 : 1, tieBreak: state.tieBreak,
    players: order.map((i, position) => ({
      name: state.players[i].name, phase: state.players[i].phase, score: state.players[i].score,
      hand: position === 0 ? structuredClone(state.players[i].hand) : Array(state.players[i].hand.length).fill(null),
      melds: structuredClone(state.players[i].melds),
    })),
    deck: Array(state.deck.length).fill(null),
    discard: structuredClone(state.discard), log: state.log.slice(),
    result: state.result && {
      winner: state.result.winner === index ? 0 : 1,
      gameWinner: state.result.gameWinner === null ? null : state.result.gameWinner === index ? 0 : 1,
      gained: order.map(i => state.result.gained[i]),
      advanced: order.map(i => state.result.advanced[i]),
      phases: order.map(i => state.result.phases[i]),
      tieBreak: state.result.tieBreak,
    },
  };
}

function validateAction(action) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) throw Error('Choose a valid move.');
  const card = id => Number.isInteger(id) && id >= 0 && id < 108;
  const valid = {
    start: () => true,
    nextRound: () => true,
    rematch: () => true,
    draw: () => ['deck', 'discard'].includes(action.source),
    discard: () => card(action.id),
    lay: () => Array.isArray(action.ids) && action.ids.length <= 11 && action.ids.every(card),
    hit: () => card(action.id) && [0, 1].includes(action.target) &&
      Number.isInteger(action.group) && action.group >= 0 && action.group < 2 &&
      (action.side === undefined || ['start', 'end'].includes(action.side)),
  };
  if (!Object.hasOwn(valid, action.type) || !valid[action.type]()) throw Error('Choose a valid move.');
}

export class RoomStore {
  constructor({ directory = null, ttl = DAY, maxRooms = 500, now = Date.now, random = rng } = {}) {
    this.directory = directory;
    this.ttl = ttl;
    this.maxRooms = maxRooms;
    this.now = now;
    this.random = random;
    this.rooms = new Map();
    if (directory) {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      for (const file of readdirSync(directory)) {
        if (!/^[A-HJ-NP-Z2-9]{6}\.json$/.test(file)) continue;
        const room = JSON.parse(readFileSync(join(directory, file), 'utf8'));
        if (room.code !== file.slice(0, -5) || room.version !== 1) throw Error(`Invalid room file: ${file}`);
        this.rooms.set(room.code, room);
      }
    }
    this.cleanup();
  }

  save(room) {
    if (this.directory) {
      const path = join(this.directory, `${room.code}.json`);
      writeFileSync(`${path}.tmp`, JSON.stringify(room), { mode: 0o600 });
      renameSync(`${path}.tmp`, path);
    }
    this.rooms.set(room.code, room);
  }

  cleanup() {
    for (const [code, room] of this.rooms) {
      if (this.now() - room.updatedAt < this.ttl) continue;
      if (this.directory) unlinkSync(join(this.directory, `${code}.json`));
      this.rooms.delete(code);
    }
  }

  get(code) {
    const room = validCode(code) && this.rooms.get(code);
    if (!room || this.now() - room.updatedAt >= this.ttl) throw Error('Room not found or expired.');
    return room;
  }

  create(name) {
    this.cleanup();
    if (this.rooms.size >= this.maxRooms) throw Error('The server is full. Please try again later.');
    const { token, player } = seat(name);
    let code;
    do { code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(''); }
    while (this.rooms.has(code));
    const room = { version: 1, code, players: [player], state: null, revision: 0, match: 0, updatedAt: this.now() };
    this.save(room);
    return { code, token, index: 0 };
  }

  join(code, name) {
    const room = structuredClone(this.get(code));
    if (room.players.length !== 1 || room.state) throw Error('This room is full.');
    const { token, player } = seat(name);
    room.players.push(player);
    room.revision++;
    room.updatedAt = this.now();
    this.save(room);
    return { code, token, index: 1 };
  }

  authenticate(code, token) {
    const room = this.get(code);
    if (typeof token !== 'string' || !/^[\w-]{43}$/.test(token)) throw Error('Unable to rejoin this seat.');
    const digest = Buffer.from(hash(token), 'hex');
    const index = room.players.findIndex(player => timingSafeEqual(Buffer.from(player.tokenHash, 'hex'), digest));
    if (index < 0) throw Error('Unable to rejoin this seat.');
    return { code, index };
  }

  act(code, index, request) {
    const previous = this.get(code);
    const player = previous.players[index];
    if (!player) throw Error('Join the room first.');
    // Retried commands remain harmless, including after reconnects/server restarts.
    if (player.requests.includes(request.id)) return { duplicate: true };
    if (request.revision !== previous.revision) throw Error('The table changed. Please try your move again.');
    validateAction(request.action);
    const room = structuredClone(previous), action = request.action;
    if (['start', 'nextRound', 'rematch'].includes(action.type)) {
      if (index !== 0) throw Error('Only the host can deal.');
      if (room.players.length !== 2) throw Error('Wait for a friend to join.');
      if (action.type === 'start' && room.state) throw Error('The game has already started.');
      if (action.type === 'nextRound' && room.state?.status !== 'round') throw Error('Finish this round first.');
      if (action.type === 'rematch' && room.state?.status !== 'game') throw Error('Finish this game first.');
      if (action.type === 'nextRound') G.startRound(room.state, this.random);
      else {
        room.state = G.newGame(this.random);
        room.state.players.forEach((p, i) => { p.name = room.players[i].name; });
        room.state.log = room.state.log.map(line => line.replace(/\b(You|Arlo)\b/g,
          name => room.players[name === 'You' ? 0 : 1].name));
        room.match++;
      }
    } else {
      if (!room.state) throw Error('Wait for the host to start.');
      // Commands use the caller's view: 0 is always self and 1 is the opponent.
      applyAction(room.state, index, action.type === 'hit'
        ? { ...action, target: action.target === 0 ? index : 1 - index } : action, this.random);
    }
    room.players[index].requests = [...player.requests.slice(-63), request.id];
    room.revision++;
    room.updatedAt = this.now();
    this.save(room);
    return { duplicate: false };
  }
}
