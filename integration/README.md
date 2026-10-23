# Cross-repository presentation timing tests

This separate Vitest entry runs the existing 81 presentation-budget parity cases against the real client animation pipeline and a selected server checkout. The matrix is retained from the earlier QA acceptance test; only its server import is routed through the explicit alias `@toe-authority/presentationTiming`.

Both client and server checkouts must be available. Install the client's existing locked dependencies through the normal project setup; this suite adds no dependency and does not start either application or connect to a socket.

Set `TOE_AUTHORITY_SERVER_DIR` to the server checkout directory, then run from the client directory:

```powershell
$env:TOE_AUTHORITY_SERVER_DIR = 'C:\path\to\server'
npm run test:integration:timing
```

```sh
TOE_AUTHORITY_SERVER_DIR=/path/to/server npm run test:integration:timing
```

Prefer an absolute path in CI. The selected directory must contain `authority/presentationTiming.js`. A missing variable or missing module fails during configuration; no sibling-directory fallback or skipped-test success is used. The test file statically imports the alias, and the integration configuration maps it to that selected module.

The configuration fixes its root to the client checkout and includes only `integration/presentationBudgetParity.test.js`. Default `npm test` / `npm run test:run` discovery remains under `src` in the existing Vite configuration. CI must explicitly run this integration entry alongside the ordinary client and server checks.

The comparisons cover server budgets versus the actual client timing cues, including the private swap-take phase allowance. They do not replace browser background-tab, network, or reconnection acceptance tests.
