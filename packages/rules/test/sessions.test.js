import test from 'node:test';
import assert from 'node:assert/strict';
import { OfflineSession } from '../../../src/authority/offlineSession.js';
import { RemoteSession } from '../../../src/authority/remoteSession.js';
import { createOfflineRecord, decodeOfflineSave } from '../src/offline.js';
class Socket {
  connected = true; listeners = new Map(); packets = []; uncertain = false;
  on(event, fn) { this.listeners.set(event, fn); }
  off(event) { this.listeners.delete(event); }
  timeout() { return this; }
  emit(event, packet, ack) {
    this.packets.push({ event, packet: structuredClone(packet) });
    queueMicrotask(() => this.uncertain ? ack(new Error('timeout')) : ack(null, { ok: true, duplicate: true }));
  }
}
const view = revision => ({ version: 2, matchId: 'match', revision, viewerSeat: 0,
  players: [{ hand: [{ id: 'own', name: 'own' }] }, { handCount: 2 }],
  decision: { id: 'window', actions: [{ type: 'draw.keep' }] }, events: [] });
test('remote client sends semantic commands only, rejects stale views and never commits a local outcome from an acknowledgement', async () => {
  const socket = new Socket(), session = new RemoteSession(socket, 'match', { sessionId: 'fixed' });
  session.accept(view(3)); assert.equal(session.accept(view(2)), false);
  await session.submit('draw.keep');
  const command = socket.packets[0].packet;
  assert.deepEqual(Object.keys(command).sort(), ['version', 'matchId', 'revision', 'decisionId', 'actionId', 'type', 'payload'].sort());
  assert.equal(command.revision, 3); assert.equal(session.getSnapshot().revision, 3);
  const observer = { ...view(3), viewerSeat: null, players: [{ handCount: 1 }, { handCount: 2 }], decision: { id: 'window', actions: [] } };
  session.accept(observer); assert.equal(session.getSnapshot().players[0].hand, undefined);
  assert.throws(() => { session.getSnapshot().players.push({}); }, TypeError);
  session.dispose();
});
test('uncertain acknowledgement retains the exact action identity and prevents another fresh action until retry resolves', async () => {
  const socket = new Socket(), session = new RemoteSession(socket, 'match', { sessionId: 'fixed' });
  session.accept(view(0)); socket.uncertain = true;
  await assert.rejects(session.submit('draw.keep'), /ack_uncertain/);
  await assert.rejects(session.submit('draw.keep'), /previous_command_uncertain/);
  socket.uncertain = false; await session.retry();
  assert.deepEqual(socket.packets[1], socket.packets[0]);
  assert.equal(session.getSnapshot().revision, 0); session.dispose();
});
test('canonical state, decks and random seeds are not accepted as client views', () => {
  const errors = [], session = new RemoteSession(new Socket(), 'match', { sessionId: 'fixed', onError: error => errors.push(error.message) });
  assert.equal(session.accept({ ...view(0), deck: [{ name: 'secret' }] }), false);
  assert.equal(session.getSnapshot(), null); assert.equal(errors.length, 1); session.dispose();
});
test('offline session executes the same real turn and AI rules without network and restores its RNG/save envelope', () => {
  const record = createOfflineRecord({ id: 'offline:adapter', seed: 16, now: 1 });
  Object.assign(record.state, { phase: 'ACTION', currentTurn: 0, drawReveal: null, abilityData: {}, gameOver: null,
    deck: [{ id: 'local-next', name: 'local-next', isZone: true, type: 'selfHealHP', val: 1 }], discard: [] });
  record.state.players.forEach(player => { Object.assign(player, { hand: [], godZone: [], godName: null, hp: 10, san: 10, isDead: false, isResting: false }); });
  const values = new Map(), storage = { setItem: (key, value) => values.set(key, value) };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Offline attempted network'); };
  try {
    const session = new OfflineSession({ record, now: () => 1000000, storage });
    session.submit('turn.end'); assert.equal(session.getSnapshot().currentSeat, 1);
    assert.equal(session.stepBot(), true);
    const saved = session.save(), restoredRecord = decodeOfflineSave(saved);
    assert.equal(restoredRecord.origin, 'offline'); assert.equal(restoredRecord.state._isMP, false);
    assert.equal(values.size, 1); assert.ok(values.has('toe.offline.v2'));
    const restored = new OfflineSession({ record: restoredRecord, now: () => 1000000 });
    assert.deepEqual(restored.getSnapshot(), session.getSnapshot());
    assert.equal(restoredRecord.random.algorithm, 'mulberry32-v1');
  } finally { globalThis.fetch = originalFetch; }
});
