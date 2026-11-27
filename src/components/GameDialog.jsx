import { useLayoutEffect, useRef } from 'react';
import { Button, Eyebrow } from './ui.jsx';

function Heading({ children }) {
  return <h2 id="modal-title" className="mt-2 mb-3.5 font-display text-[28px] font-medium tracking-[-1px]">{children}</h2>;
}

function Help() {
  return <>
    <Eyebrow>PULL UP A CHAIR</Eyebrow><Heading>A little guide to the table.</Heading>
    <p>In TenRounds, complete all ten goals in order. You’re playing against Arlo, who builds combinations from his own hand, never yours.</p>
    <ol className="rules-steps">
      {[
        ['Draw one card.', 'Take the top card from either pile. You can’t pick up a Skip.'],
        ['Make your goal.', 'Select all the cards you need and tap “Lay goal.” A set shares a number; a run is consecutive (1–12, no wrapping). Colors only matter in Goal 8. “Find my goal” helps you spot a combination.'],
        ['Lighten your hand.', 'Once your goal is down, select a card and tap a highlighted group to add it to your own or Arlo’s groups. You can do this as often as you like.'],
        ['Discard one card.', 'Select a card, then tap “Discard.” A Skip makes Arlo miss a turn. In this two-player game, you go again.'],
      ].map(([title, text], index) => <li key={title} className="my-4 flex gap-[9px] text-[11px] leading-[1.8] text-secondary">
        <span className="grid size-[21px] shrink-0 place-items-center rounded-full bg-subtle text-[10px] text-phase-ink">{index + 1}</span>
        <span><strong className="text-ink">{title}</strong> {text}</span>
      </li>)}
    </ol>
    <h3 className="mt-6 text-xs font-semibold">The little details</h3>
    <p>Wilds stand for any number or color and stay fixed once played. A goal needs at least one numbered card. You can go out by hitting or discarding your last card. The round ends immediately. Anyone who laid their goal advances next round.</p>
    <p>Cards left in hand score against you: 1–9 = 5 points, 10–12 = 10, Skip = 15, Wild = 25. Finish Goal 10 to win; if both players do, lower total score wins. On a tie, replay the final goal: first to go out wins.</p>
    <p>A Skip resolves as soon as it is discarded, so you may play another on a later turn. The starting player alternates each round. An opening Skip skips that starting player.</p>
  </>;
}

function Result({ state, onNext }) {
  const result = state.result, over = state.status === 'game', won = (over ? result.gameWinner : result.winner) === 0;
  return <>
    <span className="result-symbol mb-5 grid size-12 place-items-center rounded-full bg-subtle text-[28px] text-phase-ink" aria-hidden="true">{won ? '✳' : '↗'}</span>
    <Eyebrow>{over ? 'TEN GOALS. NICELY PLAYED.' : `ROUND ${String(state.round).padStart(2, '0')} · IN THE BOOKS`}</Eyebrow>
    <Heading>{over ? won ? 'The table is yours.' : 'This one goes to Arlo.' : won ? 'A lovely little victory.' : 'A good round for Arlo.'}</Heading>
    <p>{over ? 'A whole journey, one hand at a time. Shall we do it again?' : result.tieBreak
      ? 'All ten goals, and the same score. Replay the final goal: first to go out wins.'
      : 'Your completed goal carries forward. Your leftover cards add to your score.'}</p>
    {state.players.map((player, index) => <div key={player.name} className="round-score flex justify-between gap-4 border-t border-line py-3.5 text-xs">
      <span>{player.name}<small className="mt-1.5 block text-[10px] text-secondary">{result.advanced[index] ? `Goal ${result.phases[index] + 1} complete` : `Still working on Goal ${result.phases[index] + 1}`}</small></span>
      <strong className="text-lg font-medium">+{result.gained[index]} <small className="mt-1.5 block text-[10px] font-normal text-secondary">{player.score} points total</small></strong>
    </div>)}
    <div className="modal-actions mt-[25px] flex gap-2.5"><Button id="next-round" onClick={onNext}>{over ? 'Another game' : 'Deal the next round'} <span>→</span></Button></div>
  </>;
}

export default function GameDialog({ game }) {
  const { state, modal, setModal, newGame, nextRound, hit } = game;
  const result = state.status !== 'playing', type = result ? 'result' : modal?.type;
  const element = useRef(null), open = Boolean(type);
  useLayoutEffect(() => {
    const dialog = element.current;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);
  function dismiss() {
    if (!result) setModal(null);
  }
  return <dialog id="modal" ref={element} aria-labelledby="modal-title"
    className="m-auto max-h-[85dvh] w-[min(510px,calc(100%_-_32px))] overflow-y-auto rounded-2xl border border-strong-line bg-paper p-0 text-ink shadow-[0_20px_100px_var(--shadow)] backdrop:bg-overlay backdrop:backdrop-blur-[5px]"
    onCancel={event => { event.preventDefault(); dismiss(); }}
    onClose={() => {
      if (element.current.open) return;
      if (result) element.current.showModal(); else setModal(null);
    }}
    onClick={event => {
      if (event.target !== element.current) return;
      const bounds = element.current.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dismiss();
    }}>
    <div className="modal-inner relative px-[25px] py-[31px] tablet:p-[38px]">
      <button type="button" id="close-modal" className="icon-button modal-close absolute top-3 right-3 grid size-[30px] place-items-center bg-transparent text-2xl text-secondary" aria-label="Close dialog" onClick={dismiss}>×</button>
      <div id="modal-content" className="[&>p:not(.eyebrow)]:my-3 [&>p:not(.eyebrow)]:text-xs [&>p:not(.eyebrow)]:leading-[1.8] [&>p:not(.eyebrow)]:text-secondary">
        {type === 'help' && <Help />}
        {type === 'new' && <>
          <Eyebrow>A CLEAN SLATE</Eyebrow><Heading>Shuffle things up?</Heading>
          <p>This replaces your saved game and starts you and Arlo at Goal 1. Your current progress will be lost.</p>
          <div className="modal-actions mt-[25px] flex gap-2.5"><Button id="cancel-new" variant="secondary" onClick={dismiss}>Keep playing</Button><Button id="confirm-new" onClick={newGame}>Deal a new game <span>→</span></Button></div>
        </>}
        {type === 'wild' && <>
          <Eyebrow>A LITTLE CHOICE</Eyebrow><Heading>Where does your wild go?</Heading><p>A wild’s value stays fixed for the rest of the round.</p>
          <div className="modal-actions mt-[25px] flex gap-2.5">
            <Button id="wild-start" variant="secondary" onClick={() => hit(modal.card, modal.target, modal.group, 'start')}>As {modal.start - 1}, at the start</Button>
            <Button id="wild-end" onClick={() => hit(modal.card, modal.target, modal.group, 'end')}>As {modal.start + modal.length}, at the end</Button>
          </div>
        </>}
        {type === 'result' && <Result state={state} onNext={nextRound} />}
      </div>
    </div>
  </dialog>;
}
