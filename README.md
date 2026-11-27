# TenRounds

A minimal card table for you and Arlo, built with **React 19**, **Tailwind CSS 4**,
and **Vite 8**. Complete ten goals with sets, runs, and matching colors. Includes
scoring, Wilds, hitting, round progression, tie-break playoffs, and automatic
local saves. No account, API key, or backend.

## Run locally

Use Node.js 20.19+, 22.13+, or a current LTS release, with npm.
From this project's directory:

```powershell
npm install
npm run dev
```

Open the URL Vite prints, normally http://127.0.0.1:3000.
If Node was just installed on Windows, restart your terminal so `node` and `npm`
are on PATH. Use `npm.cmd` if your PowerShell execution policy blocks `npm.ps1`.

```powershell
npm run build
npm run preview
```

The production build is in `dist/`. Deploy that directory to any static web
server. The React source must run through Vite; opening the source `index.html`
directly as a file does not work.

## GitHub Pages

The public GitHub repository is named `ten-rounds`. In its **Settings → Pages**,
set **Source** to **GitHub Actions** once. Pushes to `main` and manual workflow
runs install the locked dependencies, run lint and engine/save tests, build
`dist/`, and deploy that artifact to Pages. Pull requests run the same checks
and build without deploying.

The workflow is `.github/workflows/deploy.yml` and uses Node.js 24. It uses
GitHub's built-in token with read-only source access and grants deployment
permissions only to the deploy job; no personal access token or other repository
secret is required. Vite's relative asset paths support the `/ten-rounds/` site
path as well as local previews. The deployed URL appears on the workflow run
and in **Settings → Pages**.

## Play

Draw from either pile, select cards, then **Lay goal** or **Discard**.
**Find my goal** selects a valid combination. After laying your goal, select a
single card and click a highlighted group to hit it. A Wild at either end of a
run asks which value it should represent. On small screens your hand scrolls.

The computer evaluates its own hand and the public table only. It never uses
your hidden cards. Sound is optional. Dialogs pause the computer. Starting a new
game asks before replacing your progress.

Light and forest-dark themes follow the browser's `prefers-color-scheme`,
including live changes. High-contrast text and reduced-motion preferences are
preserved. Existing cards have stable React keys and memoized faces, so selection,
drawing, sorting, and turns do not rebuild or re-deal the hand. Only a new card
animates; a genuinely new game or round deals a fresh hand.

The stock contains 108 playing cards. Skips resolve immediately, so consecutive
Skips are allowed. The in-game help explains the deck, goals, turns, scoring,
Wilds, hitting, and final-goal playoffs.

## Saves

TenRounds uses `tenrounds.table.v1`. When that entry is absent, compatible older
table saves are recognized by their complete game schema and loaded automatically.
The next persistence effect stores the migrated game under the new key; the
original entry is retained. An existing current save takes precedence, and a
corrupt current save starts a fresh game rather than resurrecting older progress.

Saved games, sort order, and sound preferences resume **on the same browser
origin**. Keep the same hostname and port when replacing a local server.
`localhost`, `127.0.0.1`, different ports, and file URLs have separate storage.
Saves are never uploaded. If storage is unavailable, play continues with a warning.

Google Fonts is optional; the game falls back to system fonts offline.
React, Tailwind's generated CSS, and all game code are bundled locally.

## Code

- `src/App.jsx`: application composition.
- `src/components/`: cards, hand, table, progress, controls, and native dialogs.
- `src/useGame.js`: React state, immutable engine transitions, computer timer,
  selection, sound, notifications, and persistence effects.
- `src/session.js`: save loading, compatibility migration, and validation.
- `src/styles.css`: Tailwind theme tokens, browser-managed palettes, and custom
  card details.
- `engine.js`: independently tested rules and computer strategy, exposed as
  `TenRoundsGame`. Existing internal schema fields remain compatible with saves.

## Checks

```powershell
npm run lint
npm test
npm run build
npm run test:ui
```

`npm test` runs 29 engine checks and eight save/migration checks. Engine coverage
includes independent fixtures for all goals and four complete computer-vs-computer
matches. The engine checks are also available at `/tests.html` on a dev or
production server.

Open `/ui-tests.html` for the 26 interface checks. They use real controls,
deterministic saves, full turn and round transitions, save failure/recovery,
stable card elements and focus, and layouts at 320, 390, 680, 768, 1024, and 1440
pixels. Branding is checked in normal play, help, confirmations, Wild choices, and
round/game summaries, including accessible labels. Text contrast is audited
against 4.5:1 across card colors and selected, disabled, meld, toast, dialog, and
summary states. The table gradient is measured at both extremes.

Inside a Factory session with `AGENT_BROWSER_CDP`, `npm run test:ui` serves the
**production build** temporarily on loopback and runs both browser themes,
reduced motion, and live theme switching. To check a running development server:

```powershell
python tools/verify_themes.py --url http://127.0.0.1:3000
```

Interface tests restore the original save afterward. Avoid playing in another tab
while they run. Tests are separate entry points and are not loaded by the game.
Browser screenshots require the Factory browser pane to be visible.
