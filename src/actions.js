import G from './game.js';

// Both transports use the same commands; online callers never submit game state.
export function applyAction(state, player, action, rng = Math.random) {
  switch (action.type) {
    case 'draw': return G.draw(state, player, action.source, rng);
    case 'lay': return G.lay(state, player, action.ids);
    case 'hit': return G.hit(state, player, action.id, action.target, action.group, action.side);
    case 'discard': return G.discard(state, player, action.id);
    default: throw Error('Choose a valid move.');
  }
}
