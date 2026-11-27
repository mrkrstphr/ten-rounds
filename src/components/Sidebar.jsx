import G from '../game.js';
import { Dot } from './ui.jsx';

const panelClass = 'rounded-[9px] border border-line bg-surface px-4 py-[19px] tablet:px-3.5 tablet:py-[18px] wide:px-[17px] wide:py-[22px] desktop:px-5';
const headingClass = 'font-display text-xs font-semibold tracking-[-.4px] tablet:text-[13px] wide:text-sm';

export default function Sidebar({ state }) {
  const [human, computer] = state.players;
  return <aside className="sidebar grid grid-cols-2 items-start gap-3 tablet:block" aria-label="Goal progress and score">
    <section className={`journey-panel ${panelClass}`}>
      <div className="panel-heading flex items-center justify-between"><h2 className={headingClass}>The journey</h2><span id="journey-count" className="text-[8px] tracking-[.5px] text-muted tablet:text-[9px]">{Math.min(human.phase + (human.melds.length && state.status === 'playing' ? 1 : 0), 10)} / 10</span></div>
      <p className="panel-subtitle mt-[7px] mb-[13px] text-[8px] leading-relaxed text-muted tablet:mb-5 tablet:text-[9px]">A small step. Then the next.</p>
      <ol id="phase-list" className="phase-list flex flex-col gap-[3px]">
        {G.PHASES.map((phase, index) => {
          const current = index === human.phase, complete = index < human.phase;
          return <li key={phase.label} aria-current={current ? 'step' : undefined}
            className={`relative flex min-h-[29px] items-center gap-[7px] py-[5px] text-[9px] tablet:min-h-[34px] tablet:py-[9px] wide:gap-2.5 wide:text-[10px] ${current ? 'current -mx-2.5 rounded-[5px] bg-phase-active px-2.5 text-phase-ink' : complete ? 'complete text-secondary' : 'text-muted'}`}>
            <span className={`phase-number grid size-[18px] shrink-0 place-items-center rounded-full border text-[8px] tablet:size-[19px] tablet:text-[9px] wide:size-[21px] ${current ? 'border-action bg-action text-action-ink' : complete ? 'border-transparent bg-subtle text-phase-ink' : 'border-strong-line text-muted'}`}>{complete ? '✓' : index + 1}</span>
            <span>{phase.label}</span>
            {index === computer.phase && <span className="phase-opponent ml-auto size-1.5 shrink-0 rounded-full border border-gold bg-gold" title={`${computer.name}’s current goal`} aria-label={`${computer.name}’s current goal`} />}
          </li>;
        })}
      </ol>
      <div className="phase-key mt-[13px] flex justify-center gap-4 border-t border-line pt-[13px] text-[8px] text-muted tablet:mt-[21px] tablet:gap-[22px] tablet:pt-[15px]">
        <span className="flex shrink-0 items-center gap-1.5"><Dot />You</span><span className="flex min-w-0 items-center gap-1.5"><Dot arlo /><span className="truncate" title={computer.name}>{computer.name}</span></span>
      </div>
    </section>
    <section className={`score-panel ${panelClass} tablet:mt-4 tablet:pb-3.5`}>
      <div className="panel-heading flex items-center justify-between"><h2 className={headingClass}>The scorecard</h2><span className="score-symbol text-[17px] text-secondary" aria-hidden="true">↘</span></div>
      <p className="panel-subtitle mt-[7px] mb-[15px] text-[8px] leading-relaxed text-muted tablet:text-[9px]">Fewer points. Bragging rights.</p>
      {state.players.map((player, index) => <div key={index} className="score-row mt-[15px] mb-1.5 flex items-center justify-between text-[10px]">
        <span className="flex min-w-0 items-center gap-2 text-muted"><Dot arlo={index === 1} /><span className="truncate" title={player.name}>{player.name}</span></span>
        <strong id={index === 0 ? 'human-score' : 'arlo-score'} className="shrink-0 text-[15px] font-[450]">{player.score} <small className="ml-1 text-[8px] font-normal text-muted">pts</small></strong>
      </div>)}
    </section>
  </aside>;
}
