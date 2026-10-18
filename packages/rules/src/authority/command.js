import { executeRuleResolution } from '../execution.js';
import { createRandomCursor } from '../runtime.js';
import { advanceAutomaticRules } from './automatic.js';
import { collectPublicRuleEvents, compactAuthorityState } from './events.js';
import { createTurnClock, updateTurnClock, decisionDuration, updateHoundsClock, remainingHounds, houndsRunning } from './clocks.js';

export const PROTOCOL_VERSION = 2;
export class RuleCommandError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new RuleCommandError(code); };
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
export function requireKeys(value, keys) {
  if (!plain(value) || Object.keys(value).some(key => !keys.includes(key))) fail('invalid_command');
}
export function createPrivateMatch({ id, state, seed, random = createRandomCursor(seed), now, durationMs = null }) {
  if (typeof id !== 'string' || !id || !Number.isFinite(now)
    || durationMs !== null && (!Number.isSafeInteger(durationMs) || durationMs <= 0)) fail('invalid_host');
  const record = { schema: 'toe.private-match/v2', id, revision: 0, state: structuredClone(state),
    random: structuredClone(random), durationMs, turnClock: createTurnClock(state, now), receipts: [], grants: [], publicEvents: [] };
  record.decision = { id: `${id}:decision:0`, deadline: now + decisionDuration(state, record) };
  record.houndsClock = updateHoundsClock(record, state, now, 0);
  return record;
}
export function resolveCommand(match, principal, command, { now, actions, random, source = 'client' }) {
  requireKeys(command, ['version', 'matchId', 'revision', 'decisionId', 'actionId', 'type', 'payload']);
  if (command.version !== PROTOCOL_VERSION) fail('protocol_version');
  if (command.matchId !== match.id) fail('wrong_match');
  if (principal?.permission !== 'player' || !Number.isInteger(principal.seat)
    || !match.state.players?.[principal.seat]) fail('read_only');
  if (typeof command.actionId !== 'string' || !/^[A-Za-z0-9:_-]{1,96}$/.test(command.actionId)
    || typeof command.type !== 'string' || !Number.isSafeInteger(command.revision)) fail('invalid_command');
  const action = Object.hasOwn(actions, command.type) ? actions[command.type] : null;
  if (!action) fail('unsupported_action');
  requireKeys(command.payload, action.payloadKeys || []);
  // Validate serialized size before retaining an untrusted receipt fingerprint.
  const fingerprint = JSON.stringify(command);
  if (fingerprint.length > 8192) fail('command_too_large');
  const receipt = match.receipts.find(item => item.seat === principal.seat && item.actionId === command.actionId);
  if (receipt) {
    if (receipt.fingerprint !== fingerprint) fail('action_id_reused');
    return { match, acknowledgement: { ...receipt.acknowledgement, duplicate: true } };
  }
  if (!Number.isFinite(now)) fail('invalid_host');
  if (houndsRunning(match.state) && remainingHounds(match, now) === 0) fail('host_clock_due');
  if (match.state.gameOver) fail('match_finished');
  if (source !== 'offline' && (source === 'timeout' ? now < match.decision.deadline : now >= match.decision.deadline)) {
    fail(source === 'timeout' ? 'timeout_too_early' : 'decision_expired');
  }
  if (command.decisionId !== match.decision.id) fail('stale_decision');
  if (command.revision > match.revision || command.revision < 0
    || (!action.concurrent && command.revision !== match.revision)) fail('stale_revision');
  if (match.state.players[principal.seat].isDead && !action.allowDead) fail('not_alive');
  if (!action.phases.includes(match.state.phase)
    || !action.authorize(match.state, principal.seat, command.payload)) fail('not_your_decision');
  if (action.validate && !action.validate(match.state, principal.seat, command.payload)) fail('illegal_action');

  // Prepare canonical state and the offline cursor in a draft. An external
  // entropy port is not rewound on failure, and no future entropy is retained.
  const draft = structuredClone(match);
  const next = executeRuleResolution({ cursor: draft.random, random, now, namespace: `${match.id}:${match.revision + 1}` },
    () => advanceAutomaticRules(action.apply(draft.state, principal.seat, structuredClone(command.payload)), match.state));
  if (!next || typeof next !== 'object' || next.then) fail('invalid_rule_result');
  draft.state = next;
  draft.revision += 1;
  draft.turnClock = updateTurnClock(match, next, now);
  draft.houndsClock = updateHoundsClock(match, next, now, draft.revision);
  const sameWindow = action.concurrent && action.windowKey
    && action.windowKey(next) === action.windowKey(match.state);
  if (!sameWindow) draft.decision = { id: `${match.id}:decision:${draft.revision}`, deadline: now + decisionDuration(next, draft) };
  // Read grants are scoped to a decision and cannot survive unrelated progress.
  draft.grants = draft.grants.filter(grant => grant.decisionId === draft.decision.id);
  for (const grant of next._pendingReadGrants || []) draft.grants.push({ ...grant, decisionId: draft.decision.id });
  delete next._pendingReadGrants;
  const newEvents = [...collectPublicRuleEvents(match.state, next), ...(next._pendingPublicEvents || [])];
  draft.publicEvents = [...draft.publicEvents, ...newEvents.map((event, index) => ({
    ...event, visibility: 'public', id: `${match.id}:event:${draft.revision}:${index}`,
  }))].slice(-256);
  delete next._pendingPublicEvents;
  draft.state = compactAuthorityState(next);
  const acknowledgement = { actionId: command.actionId, revision: draft.revision, decisionId: draft.decision.id };
  draft.receipts = [...draft.receipts.slice(-127), { seat: principal.seat, actionId: command.actionId, fingerprint, acknowledgement }];
  return { match: draft, acknowledgement };
}
