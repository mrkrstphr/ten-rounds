import { redirect } from 'react-router';
import App from '../../src/App.jsx';
import { readRoomCredentials } from '../../src/room-session.js';

export function loader({ request }) {
  const code = new URL(request.url).searchParams.get('room');
  if (code) return redirect(`/rooms/${encodeURIComponent(code.toUpperCase())}`);
  return { initialCode: '' };
}

export async function clientLoader({ request, params }) {
  const url = new URL(request.url);
  const legacy = url.searchParams.get('room');
  if (legacy && !params.code) return redirect(`/rooms/${encodeURIComponent(legacy.toUpperCase())}`);
  const code = params.code?.toUpperCase() || '';
  const credentials = readRoomCredentials(code);
  if (!code || !credentials) return { initialCode: code, room: null };
  try {
    const response = await fetch(`/api/rooms/${encodeURIComponent(code)}`, {
      headers: { Authorization: `Bearer ${credentials.token}` }, signal: request.signal, cache: 'no-store',
    });
    const result = await response.json();
    return { initialCode: code, room: result.room || null, error: result.error || '' };
  } catch (error) {
    if (request.signal.aborted) throw error;
    return { initialCode: code, room: null, error: 'Could not load the room. Reconnecting…' };
  }
}
clientLoader.hydrate = true;

export function HydrateFallback() {
  return <main className="mx-auto max-w-[1392px] px-6 py-8"><p className="font-display text-2xl">TenRounds</p><p className="mt-4 text-secondary" role="status">Getting your table ready…</p></main>;
}

export default App;
