import G from './game.js';
import '../tools/contrast-audit.js';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import Game from './Game.jsx';

const KEY = 'tenrounds.table.v1';
const original = localStorage.getItem(KEY);
const results = [];
const frames = [];
const credentials = {};
let code, baseline;
const assert = (condition, message) => { if (!condition) throw Error(message); };
const nextTask = () => new Promise(resolve => {
  const channel = new MessageChannel();
  channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); };
  channel.port2.postMessage(null);
});
async function until(predicate, message, timeout = 10000) {
  const end = performance.now() + timeout;
  while (performance.now() < end) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw Error(message);
}
const doc = frame => frame.contentDocument;
const scope = frame => doc(frame).getElementById('qa-fixture') || doc(frame);
const find = (frame, selector) => scope(frame).querySelector(selector);
async function click(frame, selector) {
  const element = typeof selector === 'string' ? find(frame, selector) : selector;
  assert(element && !element.disabled, `Enabled control missing: ${selector}`);
  element.click();
  await nextTask();
}
async function input(frame, selector, value) {
  const element = find(frame, selector);
  Object.getOwnPropertyDescriptor(frame.contentWindow.HTMLInputElement.prototype, 'value').set.call(element, value);
  element.dispatchEvent(new frame.contentWindow.Event('input', { bubbles: true }));
  await nextTask();
}
async function load(frame, query = '') {
  window.multiplayerStep = 'Loading player document';
  const url = new URL(`./?qa=${crypto.randomUUID()}${query}`, location.href).href;
  frame.src = 'about:blank';
  await until(() => frame.contentWindow.location.href === 'about:blank', 'Previous player document did not close');
  frame.src = url;
  await until(() => frame.contentWindow.location.origin === location.origin &&
    find(frame, '#online-button, #online-name, #room-code'),
  'Game or invitation did not hydrate', 30000);
  window.multiplayerStep = 'Player controls ready';
}
function makeFrame(title) {
  const frame = document.createElement('iframe');
  frame.title = title; document.body.append(frame); frames.push(frame); return frame;
}
const hand = frame => [...scope(frame).querySelectorAll('#human-hand .card')];
const nodes = frame => new Map(hand(frame).map(card => [card.dataset.id, card]));
async function activePlayer() {
  let active;
  await until(() => (active = frames.find(frame => {
    const draw = find(frame, '#draw-pile');
    return draw && !draw.disabled;
  })), 'Wait for the human turn');
  return active;
}
function retained(frame, before) {
  for (const card of hand(frame)) if (before.has(card.dataset.id)) {
    assert(before.get(card.dataset.id) === card, 'An existing card was rebuilt');
  }
}
function observeSocket(frame) {
  const prototype = frame.contentWindow.WebSocket.prototype, originalSend = prototype.send;
  prototype.send = function (...args) {
    if (new URL(this.url).pathname === '/room') frame.contentWindow.qaSocket = this;
    return originalSend.apply(this, args);
  };
  const win = frame.contentWindow, originalFetch = win.fetch;
  win.qaRequests = [];
  win.fetch = async (...args) => {
    const response = await originalFetch.apply(win, args);
    win.qaRequests.push({ url: String(args[0]?.url || args[0]), status: response.status });
    if (response.headers.get('content-type')?.includes('application/json')) {
      const result = await response.clone().json();
      if (result.room) win.qaRoom = result.room;
    }
    return response;
  };
}
// Exercise the real table's public result/long-name states without a production
// backdoor or pretending WebSocket notifications contain authoritative game data.
const fixtures = new Map();
function present(frame, room) {
  let fixture = fixtures.get(frame);
  if (!fixture) {
    const hidden = [...doc(frame).body.children].map(element => [element, element.style.display]);
    for (const [element] of hidden) element.style.display = 'none';
    const element = doc(frame).createElement('div');
    element.id = 'qa-fixture'; doc(frame).body.append(element);
    fixture = { element, root: createRoot(element), hidden };
    fixtures.set(frame, fixture);
  }
  flushSync(() => fixture.root.render(createElement(Game, { online: {
    room, status: 'connected', connected: true, busy: false, error: '',
    leave: () => {}, send: () => Promise.resolve(),
  } })));
}
function restore(frame) {
  const fixture = fixtures.get(frame);
  if (!fixture) return;
  flushSync(() => fixture.root.unmount());
  fixture.element.remove();
  for (const [element, display] of fixture.hidden) element.style.display = display;
  fixtures.delete(frame);
}
async function test(name, fn) {
  window.multiplayerCurrentTest = name;
  try { await fn(); results.push({ name, pass: true }); }
  catch (error) {
    const diagnostics = frames.map(frame => {
      const state = frame.contentWindow.__reactRouterDataRouter?.state;
      return {
        url: frame.contentWindow.location.href,
        heading: find(frame, 'h1')?.textContent,
        alert: find(frame, '[role="alert"]')?.textContent,
        navigation: state?.navigation.state,
        fetchers: state ? [...state.fetchers.values()].map(f => ({ state: f.state, ok: f.data?.ok, id: f.data?.id })) : [],
        loaders: Object.entries(state?.loaderData || {}).map(([id, value]) => ({
          id, code: value?.initialCode, hasRoom: Boolean(value?.room),
          revision: value?.room?.revision, turn: value?.room?.game?.turn, step: value?.room?.game?.step,
        })),
        connection: find(frame, '#connection-status')?.textContent,
        busy: find(frame, '[aria-label="Online room"]')?.getAttribute('aria-busy'),
        requests: frame.contentWindow.qaRequests,
      };
    });
    results.push({ name, pass: false, error: error.stack + '\n' + JSON.stringify(diagnostics) });
  }
  document.getElementById('output').textContent = results.map(r =>
    `${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.error ? `\n${r.error}` : ''}`).join('\n');
}
function audit(frame) {
  const style = doc(frame).createElement('style');
  style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}';
  doc(frame).head.append(style);
  const modal = find(frame, '#modal');
  const report = globalThis.auditTextContrast(doc(frame), modal?.open ? modal : doc(frame).body);
  assert(!report.failures.length && !report.unknown.length, `Contrast failed: ${JSON.stringify(report)}`);
  const width = frame.clientWidth;
  assert(doc(frame).documentElement.scrollWidth <= width + 1, `Page must not scroll horizontally at ${width}px: ${JSON.stringify(
    [...doc(frame).querySelectorAll('body *')].filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width && (rect.left < -1 || rect.right > width + 1);
    }).slice(0, 12).map(element => ({ element: element.id || String(element.className), text: element.textContent.slice(0, 60) })),
  )}`);
}
async function run() {
  const host = makeFrame('Host player'), guest = makeFrame('Guest player');
  try {
    await test('Create a private room without altering the computer-game save', async () => {
      const state = G.newGame(() => 0.41); state.turn = 0;
      baseline = JSON.stringify({ state, sort: 'number', sound: false });
      localStorage.setItem(KEY, baseline);
      host.style.width = '320px';
      await load(host);
      observeSocket(host);
      await click(host, '#online-button');
      await until(() => find(host, '#online-name'), 'Online entry missing', 30000);
      audit(host);
      await input(host, '#online-name', 'River');
      await click(host, '#enter-room');
      await until(() => find(host, '#room-code'), 'Room navigation did not complete', 30000);
      code = find(host, '#room-code').textContent;
      credentials.host = sessionStorage.getItem(`tenrounds.room.v1:${code}`);
      assert(credentials.host, 'Seat credentials must survive a refresh');
      assert(localStorage.getItem(KEY) === baseline, 'Creating a room changed the solo save');
      assert(find(host, '#start-online').disabled, 'Host must wait for a friend');
      const invite = find(host, 'input[readonly]').value;
      assert(new URL(invite).pathname === `/rooms/${code}`, 'Invite URL must carry the room code');
      assert(!invite.includes(JSON.parse(credentials.host).token), 'Invite must not contain a private seat token');
      audit(host);
    });
    await test('A friend follows an invitation, joins the lobby, and starts with a private hand', async () => {
      assert(code, 'Create a room first');
      // Frames share tab storage. Separate real tabs have independent sessionStorage.
      sessionStorage.removeItem(`tenrounds.room.v1:${code}`);
      guest.style.width = '390px';
      await load(guest, `&room=${code}`);
      observeSocket(guest);
      assert(find(guest, '#online-code').value === code, 'Invite must prefill the code');
      await input(guest, '#online-name', 'Sky');
      await click(guest, '#enter-room');
      await until(() => find(guest, '#room-code') && !find(host, '#start-online')?.disabled, 'Both players did not join');
      credentials.guest = sessionStorage.getItem(`tenrounds.room.v1:${code}`);
      assert(credentials.guest !== credentials.host, 'Players must have distinct private seats');
      await click(host, '#start-online');
      await until(() => hand(host).length === 10 && hand(guest).length === 10, 'Both hands were not dealt');
      assert(find(host, '#computer-hand').getAttribute('aria-label').includes('Sky'), 'Host sees the guest');
      assert(find(guest, '#computer-hand').getAttribute('aria-label').includes('River'), 'Guest sees the host');
      assert(find(host, '#turn-label').textContent !== find(guest, '#turn-label').textContent, 'Turns must be player-relative');
    });
    await test('Both humans draw and discard; selections and network updates retain existing cards', async () => {
      let active = find(host, '#turn-label').textContent === 'YOUR TURN' ? host : guest;
      const other = active === host ? guest : host;
      for (const player of [active, other]) {
        await until(() => find(player, '#draw-pile') && !find(player, '#draw-pile').disabled, 'Wait for the human turn');
        const before = nodes(player), peer = player === host ? guest : host, peerBefore = nodes(peer);
        await click(player, '#draw-pile');
        await until(() => hand(player).length === 11 && hand(player).every(c => !c.disabled), 'Draw was not acknowledged');
        retained(player, before); retained(peer, peerBefore);
        const chosen = hand(player).find(card => !card.classList.contains('skip'));
        const faces = [...chosen.children];
        await click(player, chosen);
        assert(chosen.getAttribute('aria-pressed') === 'true', 'Selection must stay selected');
        assert(faces.every((node, i) => chosen.children[i] === node), 'Selection rebuilt a card face');
        await click(player, '#discard-button');
        await until(() => hand(player).length === 10 && find(peer, '#turn-label').textContent === 'YOUR TURN', 'Discard did not pass the turn');
        retained(player, before);
      }
      assert(localStorage.getItem(KEY) === baseline, 'Online moves changed the solo save');
      const before = [host, guest].map(frame => `${hand(frame).map(c => c.dataset.id)}:${find(frame, '#deck-count').textContent}`);
      await new Promise(resolve => setTimeout(resolve, 1200));
      assert([host, guest].every((frame, i) => `${hand(frame).map(c => c.dataset.id)}:${find(frame, '#deck-count').textContent}` === before[i]),
        'An online opponent must not take an automatic computer turn');
    });
    await test('A delayed action response cannot roll back a newer opponent move', async () => {
      const active = await activePlayer();
      const peer = active === host ? guest : host;
      await until(() => !find(active, '#draw-pile').disabled, 'Wait for the human turn');
      const before = nodes(active);
      await click(active, '#draw-pile');
      await until(() => hand(active).length === 11 && hand(active).every(card => !card.disabled), 'Draw was not acknowledged');
      await click(active, hand(active).find(card => !card.classList.contains('skip')));
      const win = active.contentWindow, originalFetch = win.fetch;
      let release, paused = true;
      win.fetch = async (...args) => {
        const response = await originalFetch.apply(win, args);
        const method = args[1]?.method || args[0]?.method || 'GET';
        if (paused && method.toUpperCase() === 'POST') await new Promise(resolve => { release = resolve; });
        return response;
      };
      try {
        await click(active, '#discard-button');
        await until(() => release && !find(peer, '#draw-pile').disabled, 'The peer must see the move before its acknowledgement');
        await click(peer, '#draw-pile');
        await until(() => hand(peer).length === 11 && hand(peer).every(card => !card.disabled), 'Peer draw was not acknowledged');
        const expected = find(peer, '#deck-count').textContent;
        paused = false; release();
        await until(() => find(active, '[aria-label="Online room"]').getAttribute('aria-busy') === 'false',
          'Delayed action did not finish');
        await nextTask();
        assert(find(active, '#deck-count').textContent === expected, 'An old acknowledgement rolled back the newer table');
        retained(active, before);
        await click(peer, hand(peer).find(card => !card.classList.contains('skip')));
        await click(peer, '#discard-button');
        await until(() => hand(active).length === 10 && hand(peer).length === 10, 'Both moves did not settle');
      } finally { paused = false; release?.(); win.fetch = originalFetch; }
    });
    await test('A lost connection automatically rejoins the same seat without rebuilding the hand', async () => {
      const before = nodes(host), ids = hand(host).map(c => c.dataset.id).join(',');
      assert(host.contentWindow.qaSocket, 'Capture the real room socket');
      host.contentWindow.qaSocket.close();
      await until(() => find(host, '#connection-status').textContent.includes('Reconnecting'), 'Disconnected status missing');
      assert(find(host, '#draw-pile').disabled, 'Moves must be disabled while disconnected');
      await until(() => find(host, '#connection-status').textContent === 'Both players connected', 'Room did not reconnect');
      assert(hand(host).map(c => c.dataset.id).join(',') === ids, 'Reconnection changed the hand');
      retained(host, before);
    });
    await test('Online round/game summaries name the correct winner and only let the host deal', async () => {
      const saved = [host.contentWindow.qaRoom, guest.contentWindow.qaRoom];
      assert(saved.every(Boolean), 'Capture both public player views');
      try {
        for (const status of ['round', 'game']) {
          for (const [i, frame] of [host, guest].entries()) {
            const room = structuredClone(saved[i]);
            // Public result fixtures, not a way to mutate the authoritative server.
            room.game.status = status;
            room.game.result = {
              winner: i === 0 ? 1 : 0, gameWinner: status === 'game' ? i === 0 ? 1 : 0 : null,
              gained: i === 0 ? [15, 5] : [5, 15], advanced: i === 0 ? [false, true] : [true, false],
              phases: [9, 9], tieBreak: false,
            };
            present(frame, room);
            await until(() => find(frame, '#modal').open, 'Online result dialog did not open');
          }
          assert(find(host, '#modal-title').textContent.includes('Sky'), 'Host summary names the wrong winner');
          assert(find(guest, '#modal-title').textContent === (status === 'game' ? 'The table is yours.' : 'A lovely little victory.'),
            'Guest summary must recognize their own victory');
          assert(find(host, '#next-round') && !find(guest, '#next-round'), 'Only the host can deal');
          audit(host); audit(guest);
          for (const [i, frame] of [host, guest].entries()) {
            present(frame, saved[i]);
            await until(() => !find(frame, '#modal').open, 'Next-round state did not close the summary');
          }
        }
      } finally {
        for (const frame of [host, guest]) restore(frame);
      }
    });
    await test('Refreshing an invitation URL resumes the host and leaves the guest connected', async () => {
      sessionStorage.setItem(`tenrounds.room.v1:${code}`, credentials.host);
      const ids = hand(host).map(c => c.dataset.id).join(',');
      await load(host, `&room=${code}`);
      await until(() => hand(host).length === 10 && find(host, '#connection-status').textContent === 'Both players connected', 'Refresh did not resume');
      assert(hand(host).map(c => c.dataset.id).join(',') === ids, 'Refresh changed the private hand');
      assert(find(host, '#computer-hand').getAttribute('aria-label').includes('Sky'), 'Refresh resumed the wrong seat');
      assert(localStorage.getItem(KEY) === baseline, 'Refresh overwrote the solo game');
    });
    await test('Online tables and private hands fit mobile and desktop with readable contrast', async () => {
      const saved = guest.contentWindow.qaRoom, longNames = structuredClone(saved);
      for (const player of [...longNames.players, ...longNames.game.players]) player.name = 'W'.repeat(24);
      longNames.game.turn = 1;
      present(guest, longNames);
      await nextTask();
      try {
        for (const player of [host, guest]) for (const width of [320, 390, 480, 680, 1440]) {
          player.style.width = `${width}px`;
          await nextTask();
          window.multiplayerStep = 'Waiting for table fonts';
          await doc(player).fonts.ready;
          window.multiplayerStep = 'Measuring table layout';
          for (const card of hand(player)) for (const animation of card.getAnimations()) animation.finish();
          const element = find(player, '#human-hand'), bounds = element.getBoundingClientRect();
          assert(element.scrollWidth <= element.clientWidth + 1, 'Online hand overflows');
          for (const card of hand(player)) {
            const rect = card.getBoundingClientRect();
            assert(rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1, 'Online card extends outside hand');
          }
          audit(player);
        }
      } finally { restore(guest); }
    });
    await test('Returning to computer play restores the untouched game and Arlo still takes turns', async () => {
      await click(guest, '#leave-room');
      await until(() => find(guest, '#online-button'), 'Computer table did not return');
      assert(localStorage.getItem(KEY) === baseline, 'The saved computer game was not restored');
      await click(host, '#leave-room');
      await until(() => find(host, '#online-button'), 'Host did not return to computer play');
      await click(host, '#draw-pile');
      await until(() => hand(host).length === 11, 'Solo draw failed');
      await click(host, hand(host).find(card => !card.classList.contains('skip')));
      await click(host, '#discard-button');
      await until(() => {
        const state = JSON.parse(localStorage.getItem(KEY)).state;
        return state.turn === 0 && state.step === 'draw' && state.log.some(line => line.includes('Arlo drew'));
      }, 'Arlo did not take his computer turn', 15000);
    });
  } finally {
    for (const frame of frames) { restore(frame); frame.remove(); }
    if (code) sessionStorage.removeItem(`tenrounds.room.v1:${code}`);
    if (original === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, original);
    window.multiplayerTestResults = results;
    window.multiplayerTestsDone = true;
  }
}
run();
