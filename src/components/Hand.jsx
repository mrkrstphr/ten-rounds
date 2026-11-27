import { useMemo, useRef } from 'react';
import G from '../game.js';
import { HandCard } from './Card.jsx';
import { Button, TextButton } from './ui.jsx';

export default function Hand({ game }) {
  const { state, selection, sort, toggleCard, sortHand, move, hint } = game;
  const human = state.players[0];
  const playing = state.status === 'playing', myTurn = playing && state.turn === 0;
  const canPlay = myTurn && state.step === 'play';
  const initialIds = useRef(new Set(human.hand.map(card => card.id)));
  const cards = useMemo(() => human.hand.slice().sort((a, b) => {
    const rank = card => card.kind === 'number' ? 0 : card.kind === 'wild' ? 1 : 2;
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return sort === 'color'
      ? G.COLORS.indexOf(a.color) - G.COLORS.indexOf(b.color) || a.value - b.value
      : a.value - b.value || G.COLORS.indexOf(a.color) - G.COLORS.indexOf(b.color);
  }), [human.hand, sort]);
  const instruction = !playing ? 'A good hand, well played.' : !myTurn ? 'Arlo is thinking. Make yourself comfortable.'
    : state.step === 'draw' ? 'Pick up a card from either pile.' : human.melds.length
      ? 'Add cards to completed groups, or discard one.' : 'Select cards to lay your goal, or discard one.';
  return <section className="hand-section pt-[22px] tablet:pt-6" aria-label="Your cards">
    <div className="hand-heading flex items-center justify-between gap-[7px]">
      <div className="your-identity flex items-center gap-2.5">
        <span className="human-avatar grid size-[30px] shrink-0 place-items-center rounded-full border border-line bg-subtle text-[10px] text-phase-ink" aria-hidden="true">Y</span>
        <div className="flex flex-col gap-1">
          <strong className="text-xs font-[550] tablet:text-[11px] wide:text-xs">Your hand <span id="hand-count" className="ml-1.5 text-[9px] font-normal text-muted">{human.hand.length} card{human.hand.length === 1 ? '' : 's'}</span></strong>
          <span id="hand-instruction" className="text-[9px] text-muted tablet:text-[8px] wide:text-[9px]">{instruction}</span>
        </div>
      </div>
      <TextButton id="sort-button" className="sort-button gap-1 text-[9px]" title="Switch between number and color sorting" onClick={sortHand}><span className="mr-[3px] text-sm" aria-hidden="true">⇅</span> Sort by <span id="sort-label">{sort}</span></TextButton>
    </div>
    <div id="human-hand" className="human-hand flex min-h-[131px] justify-start gap-[5px] overflow-x-auto px-1 pt-[26px] pb-[17px] [overflow-anchor:none] [scrollbar-width:thin] [scrollbar-color:var(--strong-line)_transparent] tablet:min-h-[127px] tablet:justify-center tablet:gap-1 tablet:overflow-visible tablet:pt-7 tablet:pb-3 wide:gap-1.5 desktop:min-h-[151px] desktop:gap-[9px]" aria-label="Select cards in your hand">
      {cards.map((card, index) => <HandCard key={card.id} card={card} selected={selection.has(card.id)} disabled={!canPlay} delay={initialIds.current.has(card.id) ? index * 18 : 0} onToggle={toggleCard} />)}
    </div>
    <div className="hand-actions flex min-h-[39px] items-center justify-between gap-2 tablet:min-h-[54px] tablet:flex-wrap tablet:pt-2 wide:flex-nowrap desktop:gap-3.5">
      <TextButton id="hint-button" className="hint-button gap-[5px] whitespace-nowrap text-[9px] wide:text-[10px]" disabled={!canPlay} onClick={hint}><span className="text-lg" aria-hidden="true">✧</span>{human.melds.length ? 'Find a hit' : 'Find my goal'}</TextButton>
      <span id="selection-label" className="selection-label mr-auto hidden text-[9px] text-muted desktop:block">{selection.size ? `${selection.size} card${selection.size === 1 ? '' : 's'} selected` : 'Select cards to make your move'}</span>
      <div className="primary-actions ml-auto flex gap-1.5 tablet:gap-2">
        <Button id="lay-button" variant="secondary" disabled={!canPlay || Boolean(human.melds.length) || !selection.size} onClick={() => move(next => G.lay(next, 0, [...selection]))}>Lay goal <span className="text-sm leading-[10px]" aria-hidden="true">↗</span></Button>
        <Button id="discard-button" disabled={!canPlay || selection.size !== 1} onClick={() => move(next => G.discard(next, 0, [...selection][0]))}>Discard <span className="text-sm leading-[10px]" aria-hidden="true">→</span></Button>
      </div>
    </div>
  </section>;
}
