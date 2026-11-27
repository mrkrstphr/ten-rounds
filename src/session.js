import G from './game.js';

export const SAVE_KEY = 'tenrounds.table.v1';

export function validSave(state) {
  if (!state || !Array.isArray(state.players) || state.players.length !== 2 ||
    !['playing', 'round', 'game'].includes(state.status) ||
    ![0, 1].includes(state.turn) || !['draw', 'play'].includes(state.step) ||
    !Number.isInteger(state.round) || state.round < 1 || !Array.isArray(state.log)) return false;
  if (state.status !== 'playing' && !state.result) return false;
  if (!state.players.every(player =>
    Number.isInteger(player.phase) && player.phase >= 0 &&
    player.phase <= (state.status === 'game' ? 10 : 9) &&
    Number.isInteger(player.score) && player.score >= 0 &&
    Array.isArray(player.hand) && Array.isArray(player.melds))) return false;
  try {
    const cards = [
      ...state.deck, ...state.discard,
      ...state.players.flatMap(player => [...player.hand, ...player.melds.flatMap(meld => meld.cards)]),
    ];
    const canonical = G.deck();
    return cards.length === 108 && new Set(cards.map(card => card.id)).size === 108 &&
      cards.every(card => {
        const reference = canonical[card.id];
        return reference && reference.kind === card.kind &&
          reference.color === card.color && reference.value === card.value;
      });
  } catch {
    return false;
  }
}

export function loadSession() {
  function readSession(raw) {
    try {
      const saved = JSON.parse(raw);
      if (saved?.state?.version !== 1 || !validSave(saved.state)) return null;
      return {
        state: {
          ...saved.state,
          log: saved.state.log.map(entry => typeof entry === 'string'
            ? entry.replace(/\bphase(s)?\b/gi, (word, plural) => `${word[0] === 'P' ? 'G' : 'g'}oal${plural ? 's' : ''}`)
            : entry),
        },
        sort: saved.sort === 'color' ? 'color' : 'number',
        sound: Boolean(saved.sound),
      };
    } catch {
      return null;
    }
  }
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw !== null) {
      const saved = readSession(raw);
      if (saved) return saved;
    } else {
      // Recognize older tables by their schema, without keeping a retired brand identifier.
      // The persistence effect writes the new key; the original save stays untouched.
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (!key?.endsWith('.table.v1') || key === SAVE_KEY) continue;
        const saved = readSession(localStorage.getItem(key));
        if (saved) return saved;
      }
    }
  } catch {
    // Missing, blocked, or invalid storage must never prevent a new game.
  }
  return { state: G.newGame(), sort: 'number', sound: false };
}
