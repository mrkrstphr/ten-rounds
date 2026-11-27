import G from '../game.js';
import { Card, cardLabel, DrawPile } from './Card.jsx';
import Melds from './Melds.jsx';

function TurnSteps({ drawing, canPlay, selection }) {
  return <div className="turn-steps flex items-center gap-[7px] text-[8px] text-muted wide:gap-2.5 wide:text-[9px]" aria-label="Turn steps">
    {['Draw', 'Play', 'Discard'].map((label, index) => {
      const active = index === 0 ? drawing : index === 1 ? canPlay : canPlay && selection.size === 1;
      return <span key={label} className="contents">
        {index > 0 && <i className="h-px w-2.5 bg-strong-line wide:w-[17px]" />}
        <span id={`step-${label.toLowerCase()}`} className={`flex items-center gap-1.5 ${active ? 'active text-phase-ink' : ''}`}>
          <b className={`grid size-[15px] place-items-center rounded-full border border-strong-line text-[8px] font-medium ${active ? 'bg-phase-active' : ''}`}>{index + 1}</b>{label}
        </span>
      </span>;
    })}
  </div>;
}

export default function Table({ game }) {
  const { state, selection, move } = game, human = state.players[0], computer = state.players[1];
  const playing = state.status === 'playing', myTurn = playing && state.turn === 0;
  const drawing = myTurn && state.step === 'draw', canPlay = myTurn && state.step === 'play';
  const top = state.discard.at(-1);
  const message = !playing ? `${state.players[state.result.winner].name} went out. A fresh round awaits.`
    : !myTurn ? 'A little thinking. A little strategy.' : drawing
      ? state.log[0]?.includes('skipped') ? state.log[0] : 'Your move. Draw from the deck or pick up the discard.'
      : human.melds.length ? 'Goal complete. Find a home for your remaining cards.'
        : 'Find your combination, or select one card to discard.';
  return <>
    <div className="table-topline flex h-9 items-center justify-between pb-[11px] tablet:h-[42px] tablet:pb-[13px]">
      <span id="turn-label" className={`turn-badge flex items-center gap-1.5 rounded-sm border border-line bg-phase-active px-2 py-[5px] text-[7px] font-bold tracking-[1.1px] text-phase-ink tablet:px-2.5 tablet:py-1.5 tablet:text-[8px] ${playing && !myTurn ? 'thinking' : ''}`}>{!playing ? 'ROUND COMPLETE' : myTurn ? 'YOUR TURN' : 'ARLO’S TURN'}</span>
      <TurnSteps drawing={drawing} canPlay={canPlay} selection={selection} />
    </div>
    <div className="game-table relative flex min-h-[349px] flex-col items-center overflow-hidden rounded-[13px] border border-line bg-table p-[21px] tablet:min-h-[366px] tablet:px-[19px] wide:min-h-[388px] wide:px-[27px] wide:pt-[22px] wide:pb-[25px] roomy:min-h-[414px]">
      <div className="pointer-events-none absolute top-2.5 left-2.5 size-8 rounded-tl-[7px] border-t border-l border-strong-line" />
      <div className="pointer-events-none absolute right-2.5 bottom-2.5 size-8 rounded-br-[7px] border-r border-b border-strong-line" />
      <div className="opponent-row flex w-full items-center gap-2.5">
        <div className="computer-avatar relative grid size-[30px] shrink-0 place-items-center rounded-full bg-subtle font-serif text-2xl text-phase-ink italic tablet:size-[34px]" aria-hidden="true">a<span className="absolute top-[3px] right-1 font-sans text-xs not-italic">✳</span></div>
        <div className="player-details flex flex-col gap-1">
          <strong className="flex items-center gap-[7px] text-xs font-[550]">Arlo <span className="computer-tag text-[7px] font-medium tracking-[1px] text-table-muted">COMPUTER</span></strong>
          <span id="computer-detail" className="text-[9px] text-table-muted">Goal {Math.min(computer.phase + 1, 10)} · {computer.hand.length} cards{computer.melds.length ? ' · laid down' : ''}</span>
        </div>
        <div className="score-chip ml-auto flex items-center gap-2.5"><span className="text-[7px] tracking-[1.1px] text-table-muted">POINTS</span><strong id="computer-score" className="font-display text-xl font-[450] text-table-ink">{computer.score}</strong></div>
      </div>
      <div id="computer-hand" className="computer-hand mt-[5px] mb-4 flex h-[52px] justify-center pl-[22px] tablet:-mt-[3px] tablet:mb-3 roomy:mb-[17px]" aria-label={`Arlo has ${computer.hand.length} hidden cards`}>
        {computer.hand.map((_, index) => <span key={index} className="mini-back relative -ml-[13px] h-[47px] w-8 origin-[50%_140%] rounded-sm border-[3px] border-card-face bg-card-back shadow-[0_2px_3px_var(--shadow)]" style={{ transform: `rotate(${(index - (computer.hand.length - 1) / 2) * 3}deg)` }} />)}
      </div>
      <Melds game={game} playerIndex={1} />
      <div className="table-center flex items-center justify-center gap-[25px] tablet:mt-[3px] tablet:gap-7 roomy:mt-2.5">
        <div className="pile-area flex flex-col items-center gap-[13px]">
          <DrawPile count={state.deck.length} disabled={!drawing} onDraw={() => move(next => G.draw(next, 0, 'deck'))} />
          <span className="pile-label flex gap-1.5 text-[8px] font-medium tracking-[1.3px] text-table-muted">DRAW PILE <span id="deck-count" className="min-w-4 rounded-[3px] bg-subtle px-1 py-px text-center text-[7px] tracking-normal">{state.deck.length}</span></span>
        </div>
        <span className="pile-or pb-[22px] font-serif text-[13px] text-table-muted italic">or</span>
        <div className="pile-area flex flex-col items-center gap-[13px]">
          <Card id="discard-pile" card={top} disabled={!drawing || !top || top.kind === 'skip'} onClick={() => move(next => G.draw(next, 0, 'discard'))}
            aria-label={top ? `Pick up ${cardLabel(top)}${top.kind === 'skip' ? ' (cannot be picked up)' : ''}` : 'Discard pile is empty'} />
          <span className="pile-label text-[8px] font-medium tracking-[1.3px] text-table-muted">DISCARD PILE</span>
        </div>
      </div>
      <div id="table-message" className="table-message mt-[22px] min-h-3.5 text-center text-[9px] leading-normal text-table-muted tablet:text-[10px]" role="status" aria-live="polite">{message}</div>
      <Melds game={game} playerIndex={0} />
      <div className="table-watermark mt-auto pt-[22px] text-[6px] tracking-[2.1px] text-table-muted tablet:pt-6">MAKE YOURSELF AT HOME.</div>
    </div>
  </>;
}
