import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfflineRecord, dispatchOffline, decodeOfflineSave, encodeOfflineSave } from '../src/offline.js';

test('fresh offline initialization retains explicit opening facts before journal compaction', () => {
  const record = createOfflineRecord({ id: 'offline:fresh', seed: 16, now: 0 });
  assert.deepEqual(record.publicEvents.map(event => event.type), ['turnStarted', 'cardRevealed']);
  assert.deepEqual(record.publicEvents.map(event => event.id), ['offline:fresh:event:0:0', 'offline:fresh:event:0:1']);
  assert.ok(record.openingPlayers.length > 1);
  assert.deepEqual(record.state._visualEvents, []);
  assert.deepEqual(record.state._statEvents, []);
  const resumed = decodeOfflineSave(encodeOfflineSave(record));
  assert.deepEqual(resumed.publicEvents, record.publicEvents);
  assert.deepEqual(resumed.random, record.random);
  const next = dispatchOffline(record, 0, { type: 'draw.keep', payload: {} }, { now: 0 });
  assert.equal(next.publicEvents.filter(event => event.id.includes(':event:0:')).length, 2);
  assert.equal(next.publicEvents.filter(event => event.type === 'cardRevealed' && event.reason === 'draw').length, 1);
});
