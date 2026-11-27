import { useCallback, useEffect, useRef, useState } from 'react';
import G from './game.js';
import { loadSession, SAVE_KEY } from './session.js';

export default function useGame() {
  const [session, setSession] = useState(loadSession);
  const current = useRef(session);
  const [selection, setSelection] = useState(() => new Set());
  const [modal, setModal] = useState(null);
  const [gameId, setGameId] = useState(0);
  const [toast, setToast] = useState({ message: '', visible: false });
  const toastTimer = useRef(null);
  const audio = useRef(null);
  const saveWarning = useRef(false);

  const notify = useCallback(message => {
    clearTimeout(toastTimer.current);
    setToast({ message, visible: true });
    toastTimer.current = setTimeout(() => setToast(previous => ({ ...previous, visible: false })), 3400);
  }, []);

  useEffect(() => () => {
    clearTimeout(toastTimer.current);
    audio.current?.close().catch(() => {});
  }, []);

  const tone = useCallback((enabled, kind = 'card') => {
    if (!enabled) return;
    try {
      const context = audio.current ||= new (window.AudioContext || window.webkitAudioContext)();
      context.resume();
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(kind === 'phase' ? 660 : 370, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(kind === 'phase' ? 990 : 220, context.currentTime + .11);
      gain.gain.setValueAtTime(.035, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .16);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(); oscillator.stop(context.currentTime + .17);
    } catch {
      // Sound is optional, including when a browser blocks audio.
    }
  }, []);

  const commit = useCallback(next => {
    current.current = next;
    setSession(next);
  }, []);

  const move = useCallback(action => {
    const previous = current.current, next = structuredClone(previous.state);
    try {
      action(next);
      commit({ ...previous, state: next });
      setSelection(new Set());
      tone(previous.sound);
    } catch (error) {
      notify(error.message);
    }
  }, [commit, notify, tone]);

  useEffect(() => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(session));
      saveWarning.current = false;
    } catch {
      if (!saveWarning.current) notify('Playing without saves. Progress will be lost when you close this page.');
      saveWarning.current = true;
    }
  }, [session, notify]);

  useEffect(() => {
    if (session.state.status !== 'playing' || session.state.turn !== 1 || modal) return;
    const timer = setTimeout(() => move(state => G.computerTurn(state)), 1000);
    return () => clearTimeout(timer);
  }, [session.state, modal, move]);

  const toggleCard = useCallback(id => {
    setSelection(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  function hint() {
    const state = current.current.state, human = state.players[0];
    if (state.status !== 'playing' || state.turn !== 0 || state.step !== 'play') return;
    if (human.melds.length) {
      const card = human.hand.find(card =>
        state.players.some(player => player.melds.some(meld => G.hitOptions(meld, card).length)));
      if (card) {
        setSelection(new Set([card.id]));
        notify('A perfect fit. Tap a highlighted group on the table.');
      } else notify('No hits just yet. Select a card to discard.');
      return;
    }
    const phase = G.findPhase(human.hand, human.phase);
    if (phase) {
      setSelection(new Set(phase.flatMap(meld => meld.cards.map(card => card.id))));
      notify('There it is. Tap “Lay goal” to play your combination.');
    } else {
      const needed = G.PHASES[human.phase].groups.reduce((sum, group) => sum + group[1], 0);
      const missing = needed - G.progress(human.hand, human.phase);
      notify(`Not quite yet. You’re ${missing} card${missing === 1 ? '' : 's'} away from your goal.`);
    }
  }

  function hit(card, target, group, side) {
    const meld = current.current.state.players[target].melds[group];
    if (!side && card.kind === 'wild' && meld.type === 'run' && G.hitOptions(meld, card).length === 2) {
      setModal({ type: 'wild', card, target, group, start: meld.start, length: meld.cards.length });
      return;
    }
    setModal(null);
    move(state => G.hit(state, 0, card.id, target, group, side));
  }

  function newGame() {
    commit({ ...current.current, state: G.newGame() });
    setGameId(previous => previous + 1);
    setSelection(new Set());
    setModal(null);
  }

  function nextRound() {
    if (current.current.state.status === 'game') return newGame();
    move(state => G.startRound(state));
    setModal(null);
  }

  return {
    ...session, selection, modal, gameId, toast, toggleCard, move, hint, hit,
    newGame, nextRound, setModal,
    sortHand: () => commit({ ...current.current, sort: current.current.sort === 'number' ? 'color' : 'number' }),
    toggleSound: () => {
      const sound = !current.current.sound;
      commit({ ...current.current, sound });
      tone(sound, 'phase');
      notify(sound ? 'A little sound, switched on.' : 'Sound off. A quieter kind of game.');
    },
  };
}
