# Frontend Structure And Refactor Status

This is the current source of truth for `src/` module boundaries. Historical split plans have been folded into this file so future refactors do not have to reconcile multiple stale documents.

## Current Goal

Keep `App.jsx` as the top-level game shell while continuing to move independent logic into smaller modules:

- pure data -> `constants/`
- pure rules and state transforms -> `game/`
- reusable React hooks -> `hooks/`
- multiplayer socket/session glue -> `multiplayer/`
- render-only UI -> `components/`
- generic runtime helpers -> `utils/`

## Directory Map

```text
src/
├─ App.jsx                  # top-level game component and screen composition
├─ App.css                  # legacy app-level styles
├─ index.css                # global base styles
├─ main.jsx                 # React mount entry
├─ README_structure.md      # this document
├─ assets/                  # bundled static assets
├─ components/
│  ├─ anim/                 # animation overlays and animation CSS snippets
│  ├─ board/                # player panels, piles, stat bars, board widgets
│  ├─ cards/                # card faces, card backs, hover tooltip helpers
│  ├─ lobby/                # lobby, room, privacy, tutorial intro, debug controls
│  ├─ log/                  # battle log panel
│  ├─ modals/               # game decision modals and informational modals
│  ├─ phase/                # battle phase bar
│  ├─ start/                # start screen
│  ├─ theme/                # theme ornament components
│  ├─ tutorial/             # in-game tutorial and soft guide overlays
│  └─ ui/                   # small reusable UI pieces
├─ constants/               # card data, theme data, flavor text
├─ game/                    # pure game logic and tested state helpers
├─ hooks/                   # React hooks for app subsystems
├─ multiplayer/             # socket connection, handlers, state broadcast, UI session hooks
└─ utils/                   # runtime config, DOM, scale, socket loader
```

## Major Modules

### `App.jsx`

Still owns:

- top-level `gs` state and screen branches
- battle action handlers and turn-flow orchestration
- tutorial controller glue
- animation queue orchestration that depends on React refs/state
- large battle-screen JSX composition
- some global styles

Do not add pure data, pure rules, or standalone AI strategy here.

### `game/`

Pure logic modules with no React dependency. Important files include:

- `coreUtils.js` - shared rules, card predicates, player copying, card log text
- `setup.js` - deck, roles, and initial game construction helpers
- `turnEngine.js` - turn start, draw, god encounter, and turn flow helpers
- `ai.js` / `aiTurn.js` - AI choices and AI turn resolution
- `effectEngine.js` - zone/check card and public effect resolution
- `rotateState.js` - multiplayer seat rotation and local-seat semantics
- `multiplayerRemoteReplay.js` / `multiplayerTimeouts.js` - multiplayer replay and timeout helpers
- `animQueueCore.js` / `animQueueHelpers.js` / `animLogs.js` - animation queue and animation-log helpers
- `visualEvents.js` / `statEvents.js` - event metadata used by animation and sync
- `tutorialScenario.js` / `softGuides.js` - tutorial and soft-guide state helpers

When a rule helper can be expressed as input -> output without DOM or React state, prefer putting it here and testing it under `game/__tests__/`.

### `hooks/`

React state/effect modules that are reusable but still React-aware. Current examples:

- `useAnimationQueue.js`
- `useBattleResponsiveLayout.js`
- `useGameAudio.js`
- `useDebugSettings.js`
- `useMultiplayerLobby.js`
- `useMultiplayerTimers.js`
- `useResourcePreload.js`
- animation effect hooks such as damage, card transfer, skill, earthquake, audio, visual discard sync

### `multiplayer/`

Socket/session code that has been extracted from `App.jsx`:

- `useMultiplayerConnection.js` - runtime Socket.io loading and connection setup
- `registerMultiplayerSocketHandlers.js` - socket event registration
- `useMultiplayerStateBroadcast.js` - local state broadcast and game-end sync
- `useMultiplayerUiSession.js` - waiting-room foreground reconnect and emoji sending

Keep this area in small slices. Remote replay and AI takeover are still partly in `App.jsx` because they depend heavily on animation refs and game action helpers.

### `components/`

Render-focused components. They should receive data and callbacks via props and avoid owning core game rules.

Important extracted layers:

- `cards/` - `DDCard`, `GodDDCard`, `DDCardBack`, `GodCardDisplay`, tooltip helpers, animated card backs
- `modals/` - decision and information modals
- `board/` - player panels, piles, stat widgets
- `anim/` - animation overlays and global animation layer
- `lobby/` - room/lobby/debug/tutorial intro controls
- `start/` - start screen

## Completed Refactor Areas

- card and god static data -> `constants/card.js`
- theme data -> `constants/theme.js`
- pure rules and state helpers -> `game/`
- AI strategy and AI turn flow -> `game/ai.js`, `game/aiTurn.js`
- state rotation and local-seat helpers -> `game/rotateState.js`
- animation queue helpers -> `game/animQueueCore.js`, `game/animQueueHelpers.js`, `game/animLogs.js`
- turn start animation state -> `game/turnAnimState.js`
- remote replay and visual-event helpers -> `game/multiplayerRemoteReplay.js`, `game/visualEvents.js`
- most rendering components -> `components/`
- resource preload -> `hooks/useResourcePreload.js`
- lobby/room state -> `hooks/useMultiplayerLobby.js`
- timers -> `hooks/useMultiplayerTimers.js`
- animation queue runtime -> `hooks/useAnimationQueue.js`
- socket connection and several multiplayer side effects -> `src/multiplayer/`

## Remaining High-Value Refactor Targets

### 1. Battle Actions / Turn Flow

Largest remaining block in `App.jsx`. This includes draw decisions, target selection, skills, god choices, discard, rest, end-turn event sequencing, and replay/broadcast bridges around local actions.

Risk: high. It shares refs, tutorial gates, animation queues, multiplayer sync, and pending state. Extract in small slices with tests.

Suggested first slices:

- hand-limit discard helpers
- default target/card choice helpers
- end-turn event scheduling wrappers
- small pure helpers currently nested inside action handlers

### 2. Multiplayer Remote Replay / AI Takeover

Still partly in `App.jsx` because it touches animation queues and action resolution helpers.

Risk: medium-high. Preserve ref read timing (`latestGsRef`, pending queues, role reveal gates).

### 3. Tutorial Controller

Tutorial state and step transitions are still strongly coupled to game actions and animations.

Risk: medium. Prefer extracting pure scenario/step decisions first; leave UI measurement and animation bridge in App until stable.

### 4. Battle Screen JSX

Large but lower rule-risk. It can be split into `BattleScreen` and smaller composition components once props are organized.

Risk: medium. Main risk is prop volume and accidentally changing z-index / layout behavior.

### 5. Global Styles

`GLOBAL_STYLES` can move to a stylesheet or style module.

Risk: low-medium. Verify animation names and global CSS variables after moving.

## Testing Priorities

When changing extracted logic, prefer focused tests first:

- turn order and draw/god encounter flow
- animation queue ordering around bewitch, inspection, card transfer, and deaths
- Zhu hidden-card interception and resumed draws
- CTH rest draws and remaining-draw continuation
- multiplayer state broadcast, socket handler registration, and timeout decisions

Then run `npm.cmd run build` for integration confidence.

## Maintenance Rule

Update this file whenever a responsibility moves out of `App.jsx`, a module boundary changes, or a refactor plan changes. Avoid creating new long-lived plan documents unless they are clearly temporary and linked from here.
