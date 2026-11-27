import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { RoomStore } from '../server/rooms.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test('the real development entry point serves framework routes but never private room files', { timeout: 60000 }, async () => {
  // Deliberately inside Vite's root, and not covered by the *.local pattern.
  const directory = mkdtempSync(join(ROOT, 'room-storage-test-'));
  const store = new RoomStore({ directory }), host = store.create('Private host fixture');
  store.join(host.code, 'Private guest fixture');
  store.act(host.code, 0, { id: 'dev-start', revision: 1, action: { type: 'start' } });
  const child = spawn(process.execPath, ['--conditions=development', 'server/index.js', '--dev'], {
    cwd: ROOT, env: { ...process.env, HOST: '127.0.0.1', PORT: '0', ROOM_DATA_DIR: directory, ALLOWED_ORIGINS: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let diagnostics = '';
  child.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-10000); });
  try {
    const origin = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Development server did not start. ' + diagnostics)), 30000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(Error(`Development server exited (${code}). ${diagnostics}`)); });
      child.stdout.on('data', chunk => {
        const url = chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
        if (url) { clearTimeout(timer); resolve(url); }
      });
    });
    const html = await fetch(origin + '/online');
    assert.equal(html.status, 200);
    assert.match(await html.text(), /Getting your table ready/);
    for (const page of ['/multiplayer-tests.html', '/ui-tests.html']) {
      const source = await fetch(origin + page).then(r => r.text());
      assert.ok(source.indexOf('inject-hmr-runtime') > 0);
      assert.ok(source.indexOf('inject-hmr-runtime') < source.indexOf('src="/src/'),
        'The refresh runtime must initialize before standalone React modules');
    }
    const view = await fetch(`${origin}/api/rooms/${host.code}`, {
      headers: { Authorization: `Bearer ${host.token}` },
    }).then(r => r.json());
    assert.equal(view.room.game.players[0].hand.length, 10);
    assert.deepEqual(view.room.game.players[1].hand, Array(10).fill(null));
    const local = `/${basename(directory)}/${host.code}.json`;
    const absolute = `/@fs/${directory.replaceAll('\\', '/')}/${host.code}.json`;
    for (const path of [local, local + '?raw', absolute, absolute + '?import']) {
      const response = await fetch(origin + path);
      assert.equal(response.status, 403, 'Private data must be denied before Vite serves it');
      assert.ok(!(await response.text()).includes('Private host fixture'));
    }
  } finally {
    if (child.pid && child.exitCode === null && !child.signalCode) {
      const closed = once(child, 'close'); child.kill(); await closed;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
