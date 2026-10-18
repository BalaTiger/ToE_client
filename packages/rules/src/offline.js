import { initializeRules } from './initialization.js';
import { createPrivateMatch, resolveCommand } from './authority/command.js';
import { migratedActions } from './authority/coverage.js';
import { chooseAiIntent } from './authority/policies.js';
import { projectMatch } from './authority/view.js';
import { executeRuleResolution } from './execution.js';
import { advanceRuleTime } from './authority/time.js';

export const OFFLINE_SAVE_KEY = 'toe.offline.v2';
const SAVE_SCHEMA = 'toe.offline-save/v2';

export function createOfflineRecord({ id, seed, now, expansionKey, roleCounts }) {
  if (typeof id !== 'string' || !id.startsWith('offline:')) throw new TypeError('Expected an offline session identity');
  const { state, random } = initializeRules({ mode: 'offline', seed, now, namespace: `${id}:0`, expansionKey, roleCounts });
  return { ...createPrivateMatch({ id, state, seed, now }), random, origin: 'offline' };
}
function assertOffline(record) {
  if (record?.schema !== 'toe.private-match/v2' || record.origin !== 'offline'
    || typeof record.id !== 'string' || !record.id.startsWith('offline:')
    || record.state?._isMP !== false || record.state?._intentEngine !== true
    || !Number.isSafeInteger(record.revision) || record.revision < 0
    || !Array.isArray(record.state.players) || record.state.players.length < 1 || record.state.players.length > 12
    || !Array.isArray(record.state.deck) || !Array.isArray(record.state.discard)
    || record.random?.algorithm !== 'mulberry32-v1' || !Number.isInteger(record.random.value)
    || record.random.value < 0 || record.random.value > 0xffffffff
    || !Number.isSafeInteger(record.random.draws) || record.random.draws < 0) {
    throw new TypeError('Invalid offline save; online state and projections are not offline saves');
  }
}
export function dispatchOffline(record, seat, intent, { now, actions = migratedActions }) {
  assertOffline(record);
  record = advanceRuleTime(record, now);
  return resolveCommand(record, { permission: 'player', seat }, {
    version: 2, matchId: record.id, revision: record.revision, decisionId: record.decision.id,
    actionId: `offline:${record.revision + 1}`, type: intent.type, payload: intent.payload,
  }, { now, actions, source: 'offline' }).match;
}
export function stepOfflineAi(record, seat, { now, policy = chooseAiIntent } = {}) {
  assertOffline(record);
  record = advanceRuleTime(record, now);
  if (!Number.isInteger(seat) || seat <= 0 || !record.state.players[seat] || record.state.players[seat].isDead) {
    throw new TypeError('Not an offline AI seat');
  }
  const draft = structuredClone(record);
  const view = projectMatch(draft, { permission: 'player', seat }, { actions: migratedActions,
    handleForCard: (viewer, cardId) => `local:${viewer}:${cardId}` });
  const intent = executeRuleResolution({ cursor: draft.random, now, namespace: `${record.id}:policy:${draft.revision}` },
    () => policy(structuredClone(view)));
  if (!intent) throw new Error('Offline AI action has not been migrated');
  return dispatchOffline(draft, seat, intent, { now });
}
export function encodeOfflineSave(record) {
  assertOffline(record);
  return JSON.stringify({ schema: SAVE_SCHEMA, record });
}
export function decodeOfflineSave(text) {
  if (typeof text !== 'string' || text.length > 4 * 1024 * 1024) throw new TypeError('Invalid offline save size');
  const parsed = JSON.parse(text);
  if (parsed?.schema !== SAVE_SCHEMA || Object.keys(parsed).some(key => !['schema', 'record'].includes(key))) throw new TypeError('Unsupported offline save format');
  assertOffline(parsed.record); return structuredClone(parsed.record);
}
export function storeOfflineSave(storage, record) { storage.setItem(OFFLINE_SAVE_KEY, encodeOfflineSave(record)); }
export function loadOfflineSave(storage) {
  const text = storage.getItem(OFFLINE_SAVE_KEY);
  return text == null ? null : decodeOfflineSave(text);
}
