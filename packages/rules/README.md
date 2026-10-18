# @toe/rules

Canonical ESM rule source for local solo and authoritative multiplayer. There is no browser, storage or network dependency in `src`. Host adapters supply a random function (online) or serializable deterministic cursor (offline), current time and resolution namespace through `executeRuleResolution`; they never replace global `Math.random`. Online initialization requires an explicit host random function.

`authority/command.js` validates semantic intents and commits canonical rules atomically. Failed offline transactions discard their cloned RNG cursor. External online entropy is consumed without retaining or rewinding it; failure still commits no state, receipt or event. `authority/coverage.js` derives legal action/phase accounting from the registry. `authority/view.js` builds recipient projections with opaque card handles and explicit private grants. `authority/automatic.js` owns mandatory continuations independently of animation. `authority/time.js` owns domain clock consequences.

`offline.js` uses the same reducers and information-set AI locally, with the isolated `toe.offline.v2` save envelope. The server prepares a generated, SHA-256-verified copy for standalone distribution; edit this package only, then run the server's `prepare:rules` command.

Validation: `npm run test:rules` from the client root, the existing client rule tests, and `npm test` in the server. A coverage entry describes implemented decisions, not exhaustive parity proof.
