import Game from './Game.jsx';
import OnlineLobby from './components/OnlineLobby.jsx';
import useRooms from './useRooms.js';

export default function App() {
  const online = useRooms();
  if (online.room?.game) return <Game key={online.room.code} online={online} />;
  if (online.screen === 'entry' || online.active) return <OnlineLobby online={online} />;
  return <Game key="solo" onOnline={online.open} />;
}
