# 《邪神的宝藏》前端

React + Vite frontend for 《邪神的宝藏》(Treasures of Evils).

- Official site: https://www.toegame.online/
- Official QQ group: 787317460

## Commands

- `npm run dev` - Start local Vite dev server
- `npm run build` - Production build
- `npm run build:h5` - H5 build into `dist-h5/`
- `npm run preview` - Preview built output
- `npm run lint` - Run ESLint
- `npm run test:run` - Run Vitest once
- `npm run test` - Run Vitest watch mode
- `npm run sim:headless` - Run the headless rule/AI simulator
- `npm run flavor:template` - Regenerate the card-flavor TSV template

## Architecture At A Glance

- `src/App.jsx` - top-level game shell and remaining action/tutorial orchestration
- `src/game/` - rules, AI, turn flow, animation-state builders, stat-presentation transactions, multiplayer decisions
- `src/audio/` - standalone multi-track sound-sequence controllers
- `src/hooks/` - React-aware runtime subsystems
- `src/multiplayer/` - connection, socket handlers, state broadcast, remote replay execution
- `src/components/` - render-focused battle, lobby, modal, card, and animation layers

HP/SAN use a separate presentation timeline: authoritative values live in game state,
while visible stat bars advance only at the impact point of `HP_DAMAGE`, `SAN_DAMAGE`,
`HP_HEAL`, or `SAN_HEAL`. Generic player snapshots must not write visible HP/SAN.
`TSG_SLIME_POP` is the intentional special case for committing slime-balance values
without playing damage or recovery effects.

Multiplayer uses signed anonymous identities; account registration is not required. The server relays client-owned game snapshots rather than running authoritative card rules.

## Documentation Map

- `CLAUDE.md` - agent-facing working guide for this frontend
- `CODEX_WORKFLOW.md` - terminal encoding and workflow rules
- `src/README_structure.md` - current module boundaries, extracted areas, and refactor priorities
- `scripts/README.md` - asset-generation pipeline notes
- `src/game/TODO.md` - small rule TODOs that are still intentionally open

Historical refactor plans have been folded into `src/README_structure.md` so there is one current architecture source.
