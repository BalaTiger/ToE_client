# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

《邪神的宝藏》(Treasures of Evils) — A Cthulhu-themed card game frontend built with React 19 + Vite 8 (beta).
Website: https://www.toegame.online/

This project uses ES modules (`"type": "module"` in package.json).

## Development Commands

- `npm run dev` — Start the Vite dev server (no special env vars needed)
- `npm run build` — Production build (outputs to `dist/`)
- `npm run preview` — Preview the production build locally
- `npm run lint` — Run ESLint

There are no formal tests in this project. Do not attempt to run `npm test`.

### Simulation Scripts (`sim_scripts/`)

Standalone Node.js scripts that replicate game logic outside the React app for balance testing and AI behavior validation:
- `simulate_claude.js` — Full game simulation with latest card definitions and AI logic
- `simulate_trae.js` — Alternative simulation variant
- `analyze_san_cards.js` — SAN card balance analysis

Run directly with Node: `node sim_scripts/simulate_claude.js`

## Architecture

### Monolithic Game Engine

`src/App.jsx` (~13,000 lines) is the entire game. It contains:
- Game state machine (turn flow, phase transitions, win conditions)
- Animation system (sequential queues, overlays, hit effects)
- All UI rendering (board, modals, player panels, card piles)
- Socket.io multiplayer integration
- AI turn orchestration

**Critical constraint**: The `Game` component in `App.jsx` has multiple early returns (`if(!gs)`, `if(gs.gameOver)`). React Hooks must **never** be added after these conditional returns. All hooks must run before any conditional logic. This has caused production bugs.

### Extracted Game Logic (`src/game/`)

Pure JavaScript modules with no React dependency:

- `coreUtils.js` — Shuffle, card type predicates, win conditions, rule helpers
- `ai.js` — AI decision strategies (card scoring, target selection, role-specific logic)
- `setup.js` — Deck generation (`mkDeck`), role assignment (`mkRoles`)
- `rotateState.js` — Multiplayer perspective rotation: `rotateGsForViewer(rawGs, myIdx)` rotates seat indices so every client sees itself as player 0
- `animQueueHelpers.js` — Animation queue construction helpers
- `animLogs.js` — Animation log parsing and chunking
- `index.js` — Barrel exports

### Card Data (`src/constants/card.js`)

Single source of truth for all game data:
- 48 zone cards (A1–D4, 3 copies each) with types like `selfHealHP`, `adjDamageHP`, `selfDamageDiscardHP`
- 8 god cards (NYA + CTH, 4 copies each)
- 3 roles: `寻宝者` (Treasure), `追猎者` (Hunter), `邪祀者` (Cultist)
- `RINFO`, `GOD_DEFS`, `FIXED_ZONE_CARD_VARIANTS_BY_KEY`

### Components (`src/components/cards/`)

Extracted card rendering components:
- `DDCard` — Zone card display
- `GodDDCard`, `GodCardDisplay` — God card display
- `GodTooltip`, `AreaTooltip`, `useCardHoverTooltip` — Hover tooltips

## Multiplayer Architecture

- Socket.io server connection is managed inside `App.jsx`
- `socket.io-client` is **loaded at runtime from CDN** (`https://cdn.socket.io/4.7.5/socket.io.min.js`), not imported as a module. Check `loadSocketIO()` in `App.jsx`
- Server URL/path are configured via `window.__TOE_SERVER_URL__` / `window.__TOE_SOCKET_PATH__` or Vite env vars (`VITE_SERVER_URL`, `VITE_SOCKET_PATH`)
- `rotateState.js` handles the core problem of multiplayer card games: every client sees itself as seat 0, so `currentTurn`, `drawerIdx`, `swapTi`, and other index fields must be rotated per-viewer
- `isLocalSeatIndex(idx)`, `isLocalCurrentTurn(gs)`, `isAiSeat(gs, idx)` are the canonical helpers for seat/turn checks

## Game State (`gs`)

The game state object shape (simplified):
- `players[]` — `{id, name, role, hand[], hp, san, godName, godLevel, isDead, ...}`
- `deck[]`, `discard[]`
- `currentTurn` — seat index of whose turn it is
- `phase` — `'ACTION' | 'DRAW_REVEAL' | 'DRAW_SELECT_TARGET' | 'GOD_CHOICE' | 'AI_TURN' | 'DISCARD_PHASE' | 'SWAP_SELECT_TARGET' | 'HUNT_SELECT_TARGET' | 'BEWITCH_SELECT_CARD' | 'PLAYER_WIN_PENDING' | ...`
- `drawReveal` — `{card, drawerIdx, needsDecision, forcedKeep}`
- `abilityData` — phase-specific context (swap target, hunt target, etc.)
- `gameOver` — `{winner, reason, winnerIdx}` or `null`

## Deployment

GitHub Actions workflow at `.github/workflows/deploy.yml` deploys the `release` branch to Tencent Cloud OpenCloudOS 9 via SSH on every push to `release`. The server runs `npm ci && npm run build` and copies `dist/*` to `/usr/share/nginx/html/`.

## Important Patterns

- **Animation system**: Animations are queued (`animQueueRef`) and advanced sequentially. `pendingGsRef` holds the final state to apply after all animations finish. `turnHighlightLockRef` and `visualPlayersLockRef` freeze visual state during animations.
- **Stuck/recovery watchdogs**: Multiple `useEffect` watchdogs detect AI turns stuck in bad phases and force-advance after timeouts (3.5s–20s).
- **Local test mode**: `isLocalTestHost()` enables debug settings (force cards, force roles). Toggle via a button in the top-left when running on localhost.
- **Artifact mode**: `isArtifact` detects Claude Artifacts iframe / sandboxed origin and disables features that require a real server (multiplayer, localStorage persistence).
