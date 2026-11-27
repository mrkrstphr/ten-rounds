import { useState } from 'react';
import { Button, TextButton } from './ui.jsx';

export function RoomBar({ online }) {
  const [copied, setCopied] = useState(false);
  const code = online.room?.code;
  const url = new URL(window.location.href);
  if (code) { url.pathname = `/rooms/${code}`; url.search = ''; url.hash = ''; }
  return <section className="room-bar flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-3 text-xs" aria-label="Online room" aria-busy={online.busy}>
    <span>Room <strong className="tracking-[2px]" id="room-code">{code || '…'}</strong></span>
    <span role="status" id="connection-status" className="text-secondary">{online.connected
      ? online.room.players[1]?.connected ? 'Both players connected' : online.room.players[1]
        ? 'Waiting for your friend to reconnect' : 'Waiting for a friend to join'
      : online.status === 'offline' ? 'Disconnected' : 'Reconnecting…'}</span>
    {code && <TextButton id="copy-invite" onClick={async () => {
      try { await navigator.clipboard.writeText(url.href); setCopied(true); }
      catch { setCopied(false); }
    }}>{copied ? 'Link copied' : 'Copy invite link'}</TextButton>}
    <TextButton id="leave-room" className="ml-auto" onClick={online.leave}>Computer play</TextButton>
    {online.error && <p role="alert" className="w-full text-secondary">{online.error}</p>}
  </section>;
}

export default function OnlineLobby({ online }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState(online.initialCode);
  const [joining, setJoining] = useState(Boolean(online.initialCode));
  const waiting = online.busy || online.active && online.status !== 'offline';
  return <main className="mx-auto max-w-[620px] px-[18px] py-10 tablet:py-16">
    <a href="/" className="font-display text-[27px] font-semibold tracking-[-1px]">TenRounds</a>
    {online.room ? <>
      <RoomBar online={online} />
      <section className="my-8 rounded-xl border border-line bg-surface p-6">
        <h1 className="font-display text-2xl">A table for two.</h1>
        <p className="my-4 text-secondary">Share this code or the invite link. No account needed.</p>
        <p className="my-5 font-display text-3xl tracking-[6px]" aria-label="Room code">{online.room.code}</p>
        <label className="room-label">Invite link
          <input className="room-input" readOnly value={(() => {
            const url = new URL(window.location.href);
            url.pathname = `/rooms/${online.room.code}`; url.search = ''; url.hash = '';
            return url.href;
          })()} onFocus={event => event.target.select()} />
        </label>
        <ul className="my-6 space-y-3">
          {online.room.players.map((player, index) => <li key={index} className="flex justify-between gap-4 text-sm">
            <span className="min-w-0 [overflow-wrap:anywhere]">{player ? `${player.name}${index === 0 ? ' (you)' : ''}` : 'An empty chair'}</span>
            <span className="shrink-0 text-secondary">{player?.connected ? 'Connected' : 'Waiting'}</span>
          </li>)}
        </ul>
        {online.room.host ? <Button id="start-online" disabled={!online.connected || online.busy || !online.room.players[1]?.connected}
          onClick={() => online.send({ type: 'start' }).catch(() => {})}>Start game →</Button>
          : <p className="text-secondary" role="status">Waiting for the host to deal.</p>}
      </section>
    </> : <>
      <section className="mt-8 rounded-xl border border-line bg-surface p-6">
        <h1 className="font-display text-2xl">Play with a friend.</h1>
        <p className="my-4 text-secondary">A private two-player table. Your game against Arlo stays saved separately.</p>
        <form onSubmit={event => {
          event.preventDefault();
          online.enter(joining ? 'join' : 'create', name.trim(), code.trim().toUpperCase());
        }}>
          <div className="mb-5 flex gap-4">
            <TextButton id="choose-create" aria-pressed={!joining} disabled={waiting} onClick={() => setJoining(false)}>Create a room</TextButton>
            <TextButton id="choose-join" aria-pressed={joining} disabled={waiting} onClick={() => setJoining(true)}>Join a room</TextButton>
          </div>
          <label className="room-label" htmlFor="online-name">Your name
            <input id="online-name" className="room-input" autoComplete="nickname" maxLength={24} required value={name} onChange={event => setName(event.target.value)} disabled={waiting} />
          </label>
          {joining && <label className="room-label" htmlFor="online-code">Room code
            <input id="online-code" className="room-input uppercase tracking-[3px]" autoCapitalize="characters" autoComplete="off" maxLength={6} minLength={6} pattern="[A-HJ-NP-Za-hj-np-z2-9]{6}" required value={code} onChange={event => setCode(event.target.value.toUpperCase())} disabled={waiting} />
          </label>}
          <Button type="submit" id="enter-room" disabled={waiting || !name.trim()}>{waiting ? 'Connecting…' : joining ? 'Join room →' : 'Create room →'}</Button>
        </form>
        {online.error && <p role="alert" className="mt-4 text-secondary">{online.error}</p>}
        {waiting && <p role="status" className="mt-4 text-secondary">{online.status === 'reconnecting' ? 'Rejoining your table…' : 'Connecting to the table…'}</p>}
      </section>
      <TextButton id="back-to-solo" className="mt-4" onClick={online.leave}>← Play against Arlo</TextButton>
    </>}
  </main>;
}
