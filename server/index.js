import { createServer } from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { RoomStore } from './rooms.js';
import { attachRooms } from './realtime.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const QA_PAGES = ['/tests.html', '/ui-tests.html', '/multiplayer-tests.html'];

export async function createAppServer({
  production = process.env.NODE_ENV === 'production' || !process.argv.includes('--dev'),
  store = new RoomStore({ directory: resolve(process.env.ROOM_DATA_DIR || resolve(ROOT, 'rooms.local')) }),
  origins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
} = {}) {
  const app = express(), server = createServer(app);
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  const rooms = attachRooms(server, { store, origins, development: !production });
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    // Includes React Router's .data requests and all private room responses.
    if (!req.path.startsWith('/assets/')) {
      res.setHeader('Cache-Control', req.path.startsWith('/api/') ? 'private, no-store' : 'no-store');
    }
    next();
  });
  app.get('/health', (req, res) => res.json({ ok: true }));
  let vite;
  if (!production) {
    vite = await import('vite').then(({ createServer, normalizePath }) => createServer({
      root: ROOT, appType: 'custom',
      server: {
        middlewareMode: true, hmr: { server },
        // Extending fs.deny replaces Vite's defaults, so retain those as well.
        fs: { deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml',
          '**/.git/**', '**/*.local/**',
          ...(store.directory ? [`${normalizePath(resolve(store.directory))}/**`] : [])] },
      },
    }));
    app.get(QA_PAGES, async (req, res, next) => {
      try {
        const source = await readFile(resolve(ROOT, req.path.slice(1)), 'utf8');
        // Standalone component checks need the same refresh preamble as <Scripts>.
        const html = source.replace('<head>', '<head><script type="module" src="/@id/__x00__virtual:react-router/inject-hmr-runtime"></script>');
        res.type('html').send(await vite.transformIndexHtml(req.originalUrl, html));
      } catch (error) { next(error); }
    });
    app.use(vite.middlewares);
    app.use(async (req, res, next) => {
      try {
        const { createAppHandler } = await vite.ssrLoadModule('/server/app.js');
        await createAppHandler(rooms)(req, res, next);
      } catch (error) { vite.ssrFixStacktrace(error); next(error); }
    });
  } else {
    const { createAppHandler } = await import(pathToFileURL(resolve(ROOT, 'build/server/index.js')).href);
    app.use('/assets', express.static(resolve(ROOT, 'build/client/assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(resolve(ROOT, 'build/client'), { index: false, dotfiles: 'deny', redirect: false }));
    app.use(createAppHandler(rooms));
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    console.error('Unable to serve request.');
    res.status(500).type('text').send('The table is temporarily unavailable. Please try again.');
  });
  return {
    server, rooms, store,
    close: async () => {
      await rooms.close();
      await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
      await vite?.close();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const development = process.argv.includes('--dev');
  process.env.NODE_ENV = development ? 'development' : 'production';
  const app = await createAppServer({ production: !development });
  const port = Number(process.env.PORT || 3000), host = process.env.HOST || '127.0.0.1';
  app.server.listen(port, host, () => console.log(`TenRounds listening on http://${host}:${app.server.address().port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    const force = setTimeout(() => process.exit(1), 10000);
    force.unref();
    app.close().then(() => process.exit(0), () => process.exit(1));
  });
}
