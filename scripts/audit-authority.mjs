import { writeFile } from 'node:fs/promises';
import { initializeRules } from '../packages/rules/src/initialization.js';
import { createPrivateMatch, resolveCommand } from '../packages/rules/src/authority/command.js';
import { migratedActions } from '../packages/rules/src/authority/coverage.js';
import { projectMatch } from '../packages/rules/src/authority/view.js';
import { chooseAiIntent, chooseTimeoutIntent } from '../packages/rules/src/authority/policies.js';
import { executeRuleResolution } from '../packages/rules/src/execution.js';
import { createRandomCursor, nextRandom } from '../packages/rules/src/runtime.js';

const failures = [], phases = {}, totals = { games: 0, commands: 0, timeoutChoices: 0, finished: 0, bounded: 0 };
for (let seed = 1; seed <= 32; seed++) {
  const cursor = createRandomCursor(seed);
  const initialized = initializeRules({ mode: 'online', names: ['A', 'B', 'C', 'D'], random: () => nextRandom(cursor), now: 0, namespace: `audit:${seed}:0` });
  let match = { ...createPrivateMatch({ id: `audit-${seed}`, state: initialized.state, seed, now: 0 }), random: cursor };
  totals.games++;
  for (let index = 0; index < 300; index++) {
    if (match.state.gameOver) { totals.finished++; break; }
    phases[match.state.phase] = (phases[match.state.phase] || 0) + 1;
    let view;
    for (let seat = 0; seat < 4; seat++) {
      const candidate = projectMatch(match, { permission: 'player', seat }, { actions: migratedActions,
        handleForCard: (viewer, id) => `opaque:${viewer}:${id}` });
      if (candidate.decision.actions.length) { view = candidate; break; }
    }
    const context = { seed, command: index, phase: match.state.phase, abilityType: match.state.abilityData?.type };
    if (!view) { failures.push({ ...context, error: 'unmigrated_decision', abilityKeys: Object.keys(match.state.abilityData || {}) }); break; }
    try {
      const timeoutDraft = structuredClone(match);
      const timeout = executeRuleResolution({ cursor: timeoutDraft.random, now: index, namespace: `audit:${seed}:timeout:${index}` },
        () => chooseTimeoutIntent(timeoutDraft.state));
      if (!timeout) throw new Error('unmigrated_timeout');
      resolveCommand(timeoutDraft, { permission: 'player', seat: timeout.seat }, {
        version: 2, matchId: match.id, revision: match.revision, decisionId: match.decision.id,
        actionId: `timeout-audit:${index}`, type: timeout.type, payload: timeout.payload,
      }, { now: index, actions: migratedActions, source: 'offline' });
      totals.timeoutChoices++;
      const draft = structuredClone(match);
      const intent = executeRuleResolution({ cursor: draft.random, now: index, namespace: `audit:${seed}:policy:${index}` }, () => chooseAiIntent(view));
      if (!intent) { failures.push({ ...context, error: 'unmigrated_policy', actions: view.decision.actions }); break; }
      match = resolveCommand(draft, { permission: 'player', seat: view.viewerSeat }, {
        version: 2, matchId: match.id, revision: match.revision, decisionId: match.decision.id,
        actionId: `audit:${index}`, type: intent.type, payload: intent.payload,
      }, { now: index, actions: migratedActions, source: 'offline' }).match;
      totals.commands++;
      if (index === 299) totals.bounded++;
    } catch (error) { failures.push({ ...context, error: error.code || error.message, stack: error.stack,
      context: { currentTurn: match.state.currentTurn, abilityData: match.state.abilityData,
        replay: match.state._endTurnReplay, continuation: match.state._ruleContinuation,
        end: match.state._authorityEnd, handIds: match.state.players.map(player => player.hand.map(card => card.id)) } }); break; }
  }
}
const result = { note: 'Discovery only. No coverage or parity claim follows from simulated games.', totals, phases, failures };
await writeFile(new URL('../../r11-authority-discovery.json', import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ totals, phases, failures: failures.map(failure => Object.fromEntries(
  Object.entries(failure).filter(([key]) => !['stack', 'context'].includes(key)))) }, null, 2));
