# CLAUDE.md

Agent guidance for `ToE_client_main`.

## Project Overview

《邪神的宝藏》(Treasures of Evils) frontend.

- React 19 + Vite 8 beta
- ES modules (`"type": "module"`)
- Runtime game is mostly client-side; multiplayer state is relayed by `ToE_server`

## Commands

- `npm run dev` - Start Vite dev server
- `npm run build` - Generate resource manifest and build production assets
- `npm run build:h5` - Build H5 package into `dist-h5/`
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint
- `npm run test:run` - Run Vitest once
- `npm run test` - Run Vitest watch mode
- `npm run sim:headless` - Run the headless game/AI simulator

Prefer focused test runs while working, for example:

```powershell
npm.cmd run test:run -- src/multiplayer/useMultiplayerStateBroadcast.test.js
```

## Current Architecture

Use `src/README_structure.md` as the current source of truth for module boundaries and refactor status.

Important directories:

- `src/App.jsx` - main game component, still large; owns the top-level React state and screen composition
- `src/game/` - pure game rules, AI, state rotation, animation queue helpers, remote replay helpers, and tested state transforms
- `src/audio/` - standalone sound-sequence controllers with timing/lifecycle tests
- `src/components/` - extracted UI components by layer: cards, board, modals, animation overlays, lobby, log, phase, start, tutorial, ui
- `src/hooks/` - React hooks for animation queues, audio, responsive layout, timers, debug settings, lobby state, resource preload
- `src/multiplayer/` - socket connection, handlers, state broadcast, remote replay execution, and multiplayer UI-session hooks
- `src/utils/` - runtime config, DOM helpers, scale helpers, Socket.io runtime loader
- `src/constants/` - card data, theme data, card flavor text

## App.jsx Constraints

`Game` in `src/App.jsx` has multiple early returns for loading, start screen, and game-over screens. React hooks must be declared before these conditional returns. Do not add a hook below an early return.

The biggest remaining App responsibilities are:

- battle actions / turn-flow controller
- tutorial controller
- multiplayer authority/broadcast bridges around local actions
- battle-screen prop composition and a few decision overlays
- global styles

When extracting logic, prefer small vertical slices with tests. Avoid moving the whole action controller in one step.

## Multiplayer Notes

- `socket.io-client` is loaded at runtime by `src/utils/socketIoClient.js`.
- Server URL/path come from runtime config helpers in `src/utils/runtime.js`.
- Seat rotation is handled by `src/game/rotateState.js`; every client views itself as seat 0.
- Connection and socket event registration live in `src/multiplayer/`.
- Remote replay execution lives in `src/multiplayer/multiplayerRemoteReplayExecutor.js`.
- Disconnect takeover decisions live in `src/game/multiplayerAiTakeover.js`; `App` retains authority checks and socket emission.
- State broadcast and UI-session socket side effects have focused tests under `src/multiplayer/`.
- Multiplayer uses signed anonymous identity tokens, not a registration/account flow.

## Testing Notes

Vitest tests exist and should be used for focused verification. Useful areas include:

- `src/game/__tests__/`
- `src/hooks/__tests__/`
- `src/multiplayer/*.test.js`
- component-adjacent tests such as `src/components/lobby/debugSettingsModel.test.js`

For refactors touching animation order, add or update nearby pure-function tests before relying on a full build.

HP/SAN presentation has a strict ownership boundary: `gs.players` is authoritative,
but visible bars use `displayStats`. During queued playback only the generic HP/SAN
damage/heal steps may update their matching resource. Generic player snapshots,
`VISUAL_LOCK`, and `STATE_PATCH` must not write visible stats. `TSG_SLIME_POP` with
`statPresentation` is the deliberate exception for slime balance; death overlays such
as `GUILLOTINE` and `PETRIFY_DEATH` never update HP directly.

## Encoding And Workflow

Read `CODEX_WORKFLOW.md` before broad text edits. In PowerShell, prefer explicit UTF-8 output and `Get-Content -Encoding UTF8`.

Do not change files outside the requested scope, and do not revert unrelated user work.
