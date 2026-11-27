# TenRounds

A compact card table against **Arlo** or a friend in a private two-player room.
Built with **React Router 8 framework mode**, React 19, Tailwind CSS 4, and Vite 8.
Complete ten goals with sets, runs, and matching colors. Includes scoring, Wilds,
hitting, round progression, tie-break playoffs, and automatic saves.

**One deployable app, one Node process, one port.** React Router loaders read room
state; actions create/join rooms and validate moves. Same-origin WebSockets notify
the browser to revalidate its loader, and track presence/reconnects. The same
server serves the framework app, assets, `/room`, and `/health`. No separate
backend URL, managed realtime service, database, account, or API key is needed.
Computer play stays entirely in the browser and never uploads its save.

## Run locally

Use **Node.js 24+** and npm:

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:3000. That single command also runs multiplayer and
development hot reload. Use `npm.cmd` if PowerShell blocks `npm.ps1`.
Keep an existing server on port 3000? Set `PORT` in your environment or `.env`.
`npm run dev` and `npm start` load an optional `.env`; `.env.example` lists the
settings. Environment variables take precedence.

Production, without Docker:

```powershell
npm run build
npm start
```

Build output is `build/client` and `build/server`. Run the app from this repository
with its production dependencies installed, not from either build directory by
itself. `npm run preview` is an alias for the actual production server.
**This is not a static-site build.** GitHub Pages cannot host the full app.
The branch's workflow checks the app/image rather than deploying SSR to Pages;
the existing live Pages site is not changed by work on this branch.

## Docker, VPS, or NAS

```powershell
docker compose up --build -d
docker compose logs -f tenrounds
```

Compose builds one image, runs as UID/GID **1000**, binds
`127.0.0.1:3000`, and persists private room data in the named `rooms` volume.
The container filesystem is read-only except `/data` and temporary storage.
`GET /health` checks the same Node server used by the game. Production needs no
Vite/dev dependencies or second port.

For a DigitalOcean VPS, point a domain at the VPS and place Caddy, nginx, or your
existing HTTPS proxy in front of `127.0.0.1:3000`. For example, a host-installed
Caddy can use:

```caddyfile
cards.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Set `ALLOWED_ORIGINS=https://cards.example.com` in `.env`, then run
`docker compose up -d` again. Use your actual public origin, including a port if
nonstandard, with **no path or trailing slash**. Multiple origins are comma-separated.
Caddy handles WebSocket upgrades automatically; other proxies must pass upgrades
for `/room`, preserve `Host` and `Origin`, and allow long-lived connections.
Do not set a short proxy read timeout on the WebSocket connection.
Only the proxy needs a public listener; keep Node on loopback.

On a NAS, use its HTTPS reverse proxy and mount a persistent volume at `/data`.
If the proxy runs outside this Docker host, set `BIND_ADDRESS` to the NAS's
specific LAN address and restrict the port with your firewall. Use HTTPS/WSS
when connecting over a network: seat credentials and private hands must not
travel over untrusted plaintext HTTP. The app expects the **root of its origin**,
not a subdirectory such as `/ten-rounds/`.

The Dockerfile can also be built with `docker build -t tenrounds .`. If replacing
the named volume with a NAS bind mount, make its host directory writable by
UID/GID 1000. Do not mount private data below `build/client` or a proxy's web root.

Without Docker, set `ROOM_DATA_DIR` to a persistent private directory and run
`npm start` under your process manager after `npm ci` and `npm run build`.
The default is git-ignored `rooms.local/`. The service user needs write permission.
`HOST` defaults to loopback and `PORT` to 3000; the container explicitly binds
its internal listener to `0.0.0.0`.

Run **one process/replica per data directory**. File-backed rooms do not support
horizontal scaling. Each accepted move is written by atomic rename before it is
acknowledged, and rooms reload after a normal server/container restart. Rooms
expire 24 hours after their last accepted action; capacity is 500 rooms.
Keep backups private and take them while the service is stopped. `docker compose
down` preserves the named volume; **`down -v` deletes it**. Host power-loss
durability and backups still depend on your filesystem/storage.

## Private multiplayer

Choose **Play online**, create a room, and share its six-character code or invite
link. A friend enters a name and joins. The host starts the game and deals
subsequent rounds/rematches. Use independent tabs for two players.
**Computer play** returns to the separately saved game against Arlo.

The server owns the shuffled deck and validates all commands. Private loaders
return only your own hand plus public table information, not opponent cards or
deck order. Notifications contain no game state or credentials. Revisions reject
stale moves; command IDs deduplicate retries. There is no AI in an online room.
HTTP actions and WebSocket upgrades check origins, request sizes, and rate limits.
Development also blocks private room files, including Vite's `/@fs` aliases.
IP limits use the direct network peer, not spoofable forwarded headers; behind
one proxy those limits are shared by its clients.

Seat credentials live in **sessionStorage**, never invite URLs or cookies.
Refreshes/disconnects resume the same seat; another tab using that credential
replaces its socket. Closing the tab can lose the credential. A code can claim
an empty chair, not take over an occupied one. Keep invite links private.
There is no password, account, spectator mode, host migration, or seat replacement.
Stored files contain full private state and hashed seat tokens. Either player
may disconnect and reconnect without resetting the match.

## Play and saves

Draw from either pile, select cards, then **Lay goal** or **Discard**.
**Find my goal** selects a valid combination. After laying your goal, select a
card and click a highlighted group to hit it. A Wild at either end of a run asks
which value it represents. The stock contains 108 cards. Skips resolve immediately;
consecutive Skips are allowed. The in-game help explains all ten goals and scoring.

Arlo considers only his hand and the public table, never your hidden cards.
Dialogs pause the computer. Sound is optional; a new game asks for confirmation.
Light/dark themes follow the browser, including live changes and reduced motion.
Stable card keys and memoized faces preserve cards during selection, drawing,
sorting, and network updates. Mobile hands overlap slightly without horizontal
scrolling.

Computer saves use `tenrounds.table.v1`. Compatible older table saves migrate only
when the current key is absent. Existing current saves take precedence; a corrupt
current save starts fresh rather than restoring older progress.
Cards, goals, scores, turn, sort, and sound resume on the **same browser origin**.
Changing hostname, scheme, or port does not transfer browser storage, including
moving from Pages to your own domain. Computer saves never go to the server;
online matches are persisted in the server volume. Blocked local storage does
not prevent computer play, but shows a warning. Game code, React, generated CSS,
and fonts are bundled locally, with no external font requests blocking startup.
DM Sans and Manrope use the SIL Open Font License; copies ship in `public/licenses`.

## Code and checks

- `app/root.jsx`, `app/routes.js`: framework document and routes.
- `app/routes/table.jsx`: browser-only saved-game hydration and private room client loader.
- `app/routes/create-room.js`, `room-state.js`: HTTP actions/private server loader.
- `src/App.jsx`, `Game.jsx`, `components/`: lobby and shared game presentation.
- `src/useGame.js`, `session.js`: local play, AI, stable selection, and saves.
- `src/useRooms.js`, `room-session.js`: fetcher actions, notifications, seat storage, reconnect.
- `server/index.js`, `app.js`, `realtime.js`: one HTTP/SSR/WebSocket server and presence.
- `server/rooms.js`: authoritative validation, private projections, atomic persistence.
- `engine.js`, `src/actions.js`: shared independent rules and command dispatch.

```powershell
npm run lint
npm test
```

`npm test` runs the 29 engine checks, eight save/migration checks, two seat-storage
checks, and eight room checks, builds the production app, then runs five production
HTTP/WebSocket checks and a real development-entry-point/privacy check.
Coverage includes all goals, four complete AI games, a complete seeded
two-human-command match, private views, illegal/stale/duplicate commands, CSRF,
payload/rate limits, reconnect/replacement, and restart persistence.
`npm run test:unit` skips the framework build/integration checks.
CI also builds the Docker image and smoke-tests it with production-only dependencies.

For browser checks, first run `npm start` after building (or `npm run dev`).
Inside a Factory session with its browser pane available:

```powershell
npm run test:ui
npm run test:multiplayer:ui
# Different app port:
python tools/verify_themes.py --url http://127.0.0.1:3040
python tools/verify_multiplayer.py --url http://127.0.0.1:3040
```

`/tests.html` runs engine checks, `/ui-tests.html` runs 30 solo UI checks, and
`/multiplayer-tests.html` exercises two real browser players. The scripts check
both themes, contrast at 4.5:1 or better, narrow/desktop layouts, stable card DOM,
save isolation, delayed acknowledgements overlapping another player's move,
reconnect/refresh, and returning to Arlo. Solo checks also cover
reduced motion and live theme switching. Public summary/long-name presentation
fixtures render the real table component without adding server mutation backdoors.
Tests restore the original solo save; do not play in another tab on that origin
while they run. These entry points are separate and never loaded by normal play.
