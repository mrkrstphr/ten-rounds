import useGame from './useGame.js';
import Header from './components/Header.jsx';
import Table from './components/Table.jsx';
import Hand from './components/Hand.jsx';
import Sidebar from './components/Sidebar.jsx';
import GameDialog from './components/GameDialog.jsx';
import { RoomBar } from './components/OnlineLobby.jsx';

export default function Game({ online, onOnline }) {
  const game = useGame(online);
  return <>
    <div className="app-shell mx-auto max-w-[1392px] px-[18px] tablet:px-6 wide:px-8 desktop:px-14 roomy:px-16">
      <Header game={game} onOnline={onOnline} />
      {online && <RoomBar online={online} />}
      <main>
        <div className="game-layout grid grid-cols-[minmax(0,1fr)] gap-6 tablet:grid-cols-[minmax(0,1fr)_210px] tablet:gap-[18px] wide:grid-cols-[minmax(0,1fr)_230px] wide:gap-[22px] desktop:grid-cols-[minmax(0,1fr)_260px] desktop:gap-[30px]">
          <section className="play-column min-w-0" aria-label="Card table">
            <Table game={game} />
            <Hand key={`${game.gameId}:${game.state.round}`} game={game} />
          </section>
          <Sidebar state={game.state} />
        </div>
      </main>
    </div>
    <GameDialog game={game} />
    <div id="toast" role="status" aria-live="polite" className={`toast pointer-events-none fixed bottom-[25px] left-1/2 z-10 w-max max-w-[calc(100%_-_32px)] -translate-x-1/2 rounded-[7px] border border-action bg-action px-[22px] py-[13px] text-center text-[11px] text-action-ink shadow-[0_5px_25px_var(--shadow)] transition-[opacity,translate] tablet:text-left tablet:text-xs ${game.toast.visible ? 'visible translate-y-0 opacity-100' : 'translate-y-[15px] opacity-0'}`}>{game.toast.message}</div>
  </>;
}
