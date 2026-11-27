import G from '../game.js';
import { cardColors, cardLabel } from './Card.jsx';

export function meldName(meld) {
  return meld.type === 'set' ? `Set of ${meld.value}s` : meld.type === 'run'
    ? `Run · ${meld.start}–${meld.start + meld.cards.length - 1}`
    : `${meld.color[0].toUpperCase() + meld.color.slice(1)} cards`;
}

export default function Melds({ game, playerIndex }) {
  const { state, selection, hit } = game, human = state.players[0], player = state.players[playerIndex];
  const chosen = human.hand.find(card => selection.has(card.id));
  const canPlay = state.status === 'playing' && state.turn === 0 && state.step === 'play';
  return <div id={playerIndex === 0 ? 'human-melds' : 'computer-melds'} className={`meld-row flex w-full flex-wrap justify-center gap-2 empty:hidden tablet:gap-4 ${playerIndex === 0 ? 'mt-[13px]' : 'computer-melds mt-px mb-3.5'}`}>
    {!player.melds.length && playerIndex === 0 && <span className="meld-placeholder rounded-[5px] border border-dashed border-strong-line px-3 py-2 text-[8px] tracking-[.2px] text-table-muted tablet:px-5 tablet:py-[9px] tablet:text-[9px]">{G.PHASES[Math.min(player.phase, 9)].label} · your next little victory</span>}
    {player.melds.map((meld, index) => {
      const ready = Boolean(canPlay && human.melds.length && selection.size === 1 && chosen && G.hitOptions(meld, chosen).length);
      return <button type="button" key={index} disabled={!ready} onClick={() => hit(chosen, playerIndex, index)}
        className={`meld-group min-w-[95px] rounded-md border p-1.5 text-center tablet:min-w-[110px] tablet:px-2.5 tablet:pt-1.5 tablet:pb-2 ${ready ? 'hit-ready border-control bg-subtle' : 'border-dashed border-strong-line bg-transparent'}`}
        aria-label={`${playerIndex === 0 ? 'Your' : 'Arlo’s'} ${meldName(meld)}${ready ? '. Add selected card' : ''}`}>
        <span className="meld-label mb-1.5 block text-[8px] tracking-[.4px] text-table-muted">{ready ? '+ Add here · ' : ''}{meldName(meld)}</span>
        <span className="meld-cards flex max-w-[260px] flex-wrap justify-center gap-[3px] tablet:max-w-[350px]">
          {meld.cards.map(card => <span key={card.id} className={`meld-card ${card.color} inline-grid h-[27px] w-5 place-items-center rounded-[3px] bg-card-face text-[13px] shadow-[0_1px_2px_var(--shadow)] tablet:h-[30px] tablet:w-[23px] ${cardColors[card.color]}`} title={card.kind === 'wild' ? `Wild as ${card.as}` : cardLabel(card)}>{card.kind === 'wild' ? '✳' : card.value}</span>)}
        </span>
      </button>;
    })}
  </div>;
}
