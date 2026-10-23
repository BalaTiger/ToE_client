import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfflineRecord, decodeOfflineSave } from '../src/offline.js';
import { initializeRules } from '../src/initialization.js';
import { OfflineSession } from '../../../src/authority/offlineSession.js';

test('offline role choice is assigned before the first rule turn and does not open an online setup option', () => {
  for (const selectedRole of ['寻宝者', '追猎者', '邪祀者']) {
    const record = createOfflineRecord({ id: `offline:role:${selectedRole}`, seed: 17, now: 100, selectedRole });
    assert.equal(record.state.players[0].role, selectedRole);
    assert.equal(record.state._intentEngine, true);
    assert.equal(record.random.algorithm, 'mulberry32-v1');
  }
  assert.throws(() => initializeRules({ mode: 'online', selectedRole: '追猎者' }), /offline setup/);
  assert.throws(() => createOfflineRecord({ id: 'offline:invalid', seed: 1, now: 1, selectedRole: 'invalid' }), /offline setup/);
});

test('solo pause freezes rule time, AI and user intents and resumes with a wall-clock display deadline', () => {
  let wallNow = 1000;
  const record = createOfflineRecord({ id: 'offline:pause', seed: 16, now: wallNow });
  Object.assign(record.state, { phase: 'ACTION', currentTurn: 0, abilityData: {}, drawReveal: null,
    gameOver: null, houndsOfTindalosActive: true });
  record.houndsClock = { id: 'hounds', remainingMs: 15000, lastAt: wallNow };
  const session = new OfflineSession({ record, now: () => wallNow });
  wallNow = 4000;
  session.setPaused(true);
  const beforePause = decodeOfflineSave(session.save());
  assert.equal(session.getSnapshot().status.paused, true);
  wallNow = 34000;
  session.tickTime();
  assert.equal(session.stepBot(), false);
  assert.throws(() => session.submit('turn.end'), /paused/);
  assert.deepEqual(decodeOfflineSave(session.save()), beforePause);
  session.setPaused(false);
  assert.equal(session.getSnapshot().status.paused, false);
  assert.equal(session.getSnapshot().hounds.remainingMs, 12000);
  assert.equal(session.getSnapshot().hounds.deadline, 46000);
  assert.deepEqual(decodeOfflineSave(session.save()).random, beforePause.random);
  wallNow = 35000;
  session.tickTime();
  assert.equal(decodeOfflineSave(session.save()).houndsClock.remainingMs, 11000);
});
