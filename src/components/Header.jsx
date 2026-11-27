import { TextButton } from './ui.jsx';

export default function Header({ game }) {
  const { state, sound, toggleSound, setModal } = game;
  return <>
    <header className="site-header flex h-[75px] items-center justify-between border-b border-line tablet:h-[82px] wide:h-[104px]">
      <a className="brand flex items-center gap-[7px] font-display text-xl font-[650] tracking-[-1px] min-[390px]:text-[23px] tablet:text-[27px]" href="./" aria-label="TenRounds home">
        <span className="brand-mark relative mr-1 hidden h-[29px] w-7 scale-90 min-[390px]:block tablet:mr-2 tablet:scale-100" aria-hidden="true">
          <i className="absolute top-0.5 left-px h-[23px] w-[15px] -rotate-[19deg] rounded-[3px] border-[1.6px] border-accent bg-paper" />
          <i className="absolute top-[3px] left-2 h-[23px] w-[15px] rotate-[22deg] rounded-[3px] border-[1.6px] border-accent bg-paper" />
          <i className="absolute top-0 left-[5px] h-[23px] w-[15px] rotate-[3deg] rounded-[3px] border-[1.6px] border-accent bg-accent" />
        </span>TenRounds
      </a>
      <nav className="flex items-center gap-[15px] tablet:gap-[18px] wide:gap-6" aria-label="Game controls">
        <TextButton id="help-button" className="gap-[5px] text-[10px] tablet:gap-2 tablet:text-xs" onClick={() => setModal({ type: 'help' })}><span className="help-icon inline-grid size-[15px] place-items-center rounded-full border border-current text-[10px]">?</span> How to play</TextButton>
        <span className="nav-divider hidden h-[17px] w-px bg-line tablet:block" />
        <button type="button" id="sound-button" className="icon-button grid size-[30px] place-items-center border-0 bg-transparent text-secondary" onClick={toggleSound} aria-label={sound ? 'Turn sound off' : 'Turn sound on'} title={sound ? 'Turn sound off' : 'Turn sound on'}>
          <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M11 5 6 9H3v6h3l5 4V5Z" />
            <path d={sound ? 'M15 8c2 2 2 6 0 8m3-11c4 4 4 10 0 14' : 'm16 9 5 6m0-6-5 6'} />
          </svg>
        </button>
        <TextButton id="new-button" className="new-game gap-0 text-[0px] tablet:gap-2 tablet:text-xs" onClick={() => setModal({ type: 'new' })}><span className="text-[23px] leading-none tablet:text-xl" aria-hidden="true">↻</span><span className="sr-only tablet:not-sr-only">New game</span></TextButton>
      </nav>
    </header>
    <div className="page-heading flex items-center justify-between gap-3 py-3.5 tablet:py-4">
      <p className="subtitle text-[10px] text-muted tablet:text-xs">Ten goals. One good hand at a time.</p>
      <div className="session-label flex items-center gap-[5px] text-[7px] tracking-[.6px] text-muted tablet:gap-1.5 tablet:text-[8px] wide:gap-2.5 wide:text-[9px] wide:tracking-[1.35px]">
        <span className="live-dot size-[5px] rounded-full bg-accent" /><span className="hidden tablet:inline">SOLO TABLE</span>
        <span className="session-separator mx-0.5 hidden tablet:inline">/</span>
        <span id="round-label">ROUND {String(state.round).padStart(2, '0')}</span>
      </div>
    </div>
  </>;
}
