# Frontend Structure And Refactor Status

This is the current source of truth for `src/` module boundaries. Historical split plans have been folded into this file so future refactors do not have to reconcile multiple stale documents.

## Current Goal

Keep `App.jsx` as the top-level game shell while continuing to move independent logic into smaller modules:

- pure data -> `constants/`
- pure rules and state transforms -> `game/`
- standalone sound-sequence lifecycles -> `audio/`
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
├─ audio/                   # standalone sound-sequence timing and cleanup controllers
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
- animation queue construction and React-state bridges around the extracted queue runtime
- multiplayer authority and broadcast bridges around local actions
- battle-screen prop composition and remaining decision overlays
- some global styles

Do not add pure data, pure rules, or standalone AI strategy here.

### `game/`

Pure logic modules with no React dependency. Important files include:

- `coreUtils.js` - shared rules, card predicates, player copying, card log text
- `setup.js` - deck, roles, and initial game construction helpers
- `turnEngine.js` - turn start, draw, god encounter, and turn flow helpers
- `ai.js` / `aiTurn.js` - AI choices and AI turn resolution
- `aiTurnPresentation.js` / `aiDecisionState.js` - AI presentation queues, recovery, and decision-state helpers
- `effectEngine.js` - zone/check card and public effect resolution
- `balancePatches.js` / `balanceCards.js` - explicit balance-rule switches and card side effects
- `caveDuel.js` - shared cave-duel choice and resolution rules used by player, AI, and takeover paths
- `rotateState.js` - multiplayer seat rotation and local-seat semantics
- `multiplayerRemoteReplay.js` / `multiplayerTimeouts.js` - replay construction and timeout transforms
- `multiplayerAiTakeover.js` - deterministic disconnect-takeover decisions
- `animQueueCore.js` / `animQueueHelpers.js` / `animLogs.js` - animation queue and animation-log helpers
- `visualEvents.js` - visual-event metadata used by animation and sync
- `statEvents.js` - HP/SAN event compilation, combined-effect normalization, presentation baselines, impact updates, and continuity validation
- `tutorialScenario.js` / `softGuides.js` - tutorial and soft-guide state helpers

When a rule helper can be expressed as input -> output without DOM or React state, prefer putting it here and testing it under `game/__tests__/`.

### `hooks/`

React state/effect modules that are reusable but still React-aware. Current examples:

- `useAnimationQueue.js`
- `useBattleResponsiveLayout.js`
- `useGameAudio.js`
- `useGamePreferences.js`
- `useAiTurnController.js` / `useAiWatchdog.js`
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
- `multiplayerRemoteReplayExecutor.js` - validates, buffers, and applies relayed state snapshots to animation/runtime refs

`App.jsx` retains the authority check, seat rotation, socket emission, and thin wrappers that provide current React refs/actions to these modules.

### `audio/`

Non-React controllers for sound sequences whose lifetime can outlive a visual animation:

- `caveDuelSoundSequence.js` - background/result tracks, independent win/lose fades, timers, animation frames, and cleanup

Keep playback policy and timing tests here when a sequence has multiple tracks or detached cleanup. `useGameAudio.js` should own browser audio objects and registration, not duplicate the full timeline.

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
- HP/SAN presentation transactions -> `game/statEvents.js` + `hooks/useAnimationQueue.js`
- socket connection and several multiplayer side effects -> `src/multiplayer/`
- multiplayer remote replay execution -> `src/multiplayer/multiplayerRemoteReplayExecutor.js`
- multiplayer disconnect takeover decisions -> `src/game/multiplayerAiTakeover.js`
- AI turn execution watchdog/controller -> `src/hooks/useAiTurnController.js`, `src/hooks/useAiWatchdog.js`
- AI presentation and recovery transforms -> `src/game/aiTurnPresentation.js`
- user preferences persistence -> `src/hooks/useGamePreferences.js`
- cave-duel rules and blind-choice policy -> `src/game/caveDuel.js`
- detached cave-duel audio timeline -> `src/audio/caveDuelSoundSequence.js`
- end-turn transition decision (`endTurn()` dispatch) -> `src/game/endTurnFlow.js`
- post-discard end-turn transition wrapper (`confirmDiscard` / `autoDiscardFromRight`) -> `src/game/postDiscardEndTurn.js`
- hand-limit discard helpers (`splitKeptDestroyedDiscarded`, `discardCardsFromHand*`, `applyHandDiscardSideEffectsWithAnim`) -> `src/game/handLimitDiscard.js`
- rest action end-turn transition wrapper (`doRest`) -> `src/game/restTurnFlow.js`
- target-action continuation state/routing -> `src/game/targetContinuation.js`
- battle screen JSX shell and primary sections -> `src/components/battle/BattleScreen.jsx`, `BattleHeader.jsx`, `SelfPlayerPanel.jsx`, `HandArea.jsx`, `BattleDecisionModals.jsx`, `SwapBlindDrawOverlay.jsx`

## Remaining High-Value Refactor Targets

### 1. Battle Actions / Turn Flow

Largest remaining block in `App.jsx`. The `endTurn()` dispatch decision has moved to `src/game/endTurnFlow.js`; the post-discard transition wrapper has moved to `src/game/postDiscardEndTurn.js`; hand-limit discard helpers have moved to `src/game/handLimitDiscard.js`; the rest action wrapper has moved to `src/game/restTurnFlow.js`. The battle screen JSX has moved to `src/components/battle/BattleScreen.jsx`. Remaining parts include draw decisions, target selection, skills, god choices, and replay/broadcast bridges around local actions.

Risk: high. It shares refs, tutorial gates, animation queues, multiplayer sync, and pending state. Extract in small slices with tests.

Suggested next slices:

- replay/broadcast bridges around the extracted target-action continuation flow
- draw/god-choice decision handlers
- small pure helpers still nested inside action handlers

### 2. Tutorial Controller

Tutorial state and step transitions are still strongly coupled to game actions and animations.

Risk: medium. Prefer extracting pure scenario/step decisions first; leave UI measurement and animation bridge in App until stable.

### 3. Additional Audio Sequences

`useGameAudio.js` still contains several multi-track timelines such as volcano, semi-materialization, burrowing worm, snake trap, and black goat movement. Use the cave-duel controller as the extraction pattern, but wait for a second concrete sequence before introducing a generic framework.

Risk: medium. Preserve detached lifetimes and cleanup semantics.

### 4. Battle Screen Composition

The main sections have moved out of `BattleScreen.jsx`. Remaining work should focus on reducing prop volume and separating decision-overlay groups without changing z-index or pointer-event behavior.

Risk: medium.

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
- multiplayer replay execution, buffering, and disconnect takeover phase matrices
- detached audio timing and cleanup behavior

Then run `npm.cmd run build` for integration confidence.

## HP/SAN Presentation Boundary

Authoritative HP/SAN remain in `gs.players`, but battle stat bars render from
`displayStats`. During an animation transaction:

- `statEvents.js` primes each affected resource from the first event's `from` value;
- only `HP_DAMAGE`, `SAN_DAMAGE`, `HP_HEAL`, and `SAN_HEAL` may advance that resource to `to`;
- combined HP/SAN effects are split into the corresponding generic steps at the playback boundary;
- generic `visualSetupPatch`, `visualTimeline`, `VISUAL_LOCK`, and `STATE_PATCH` player snapshots must not write `displayStats`;
- `GUILLOTINE` and `PETRIFY_DEATH` are presentation-only and do not change stat bars;
- `TSG_SLIME_POP` with `statPresentation` is the sole special path: it commits slime-balance HP/SAN on the slime animation impact without damage/heal effects;
- queue completion or a truly idle state may reconcile `displayStats` to authoritative state.

Keep the continuity invariant `previous.to === next.from` for sequential changes to
the same resource. Add focused `statEvents` tests whenever introducing a new stat-changing
animation path.

## Maintenance Rule

Update this file whenever a responsibility moves out of `App.jsx`, a module boundary changes, or a refactor plan changes. Avoid creating new long-lived plan documents unless they are clearly temporary and linked from here.
