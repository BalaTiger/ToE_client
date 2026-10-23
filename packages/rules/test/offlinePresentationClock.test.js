import test from 'node:test';
import assert from 'node:assert/strict';
import { OfflineSession } from '../../../src/authority/offlineSession.js';
import { createOfflineRecord, decodeOfflineSave } from '../src/offline.js';

function fixture() {
  let wall = 1000;
  const record = createOfflineRecord({ id: 'offline:clock', seed: 16, now: 1000 });
  Object.assign(record.state, { phase: 'ACTION', currentTurn: 0, drawReveal: null, abilityData: {}, gameOver: null,
    houndsOfTindalosActive: true, houndsOfTindalosElapsed: 0 });
  record.state.players.forEach(player => Object.assign(player, { hand: [], godZone: [], godName: null,
    hp: 10, san: 10, isDead: false, isResting: false }));
  record.houndsClock = { id: 'offline:clock:hounds', remainingMs: 15000, lastAt: 1000 };
  const values = new Map(), storage = { setItem: (key, value) => values.set(key, value) };
  return { session: new OfflineSession({ record, now: () => wall, storage }), values, wall: value => { wall = value; } };
}
test('presentation freezes the offline rule clock without pausing animation status or consuming RNG', () => {
  const f = fixture(), session = f.session;
  f.wall(2000); session.setPresentationBusy(true);
  const before = decodeOfflineSave(session.save());
  assert.equal(session.getSnapshot().status.paused, false);
  f.wall(20000); session.tickTime(); assert.equal(session.stepBot(), false);
  assert.throws(() => session.submit('turn.end'), /presentation_pending/);
  assert.deepEqual(decodeOfflineSave(session.save()), before);
  session.setPresentationBusy(false);
  assert.equal(session.getSnapshot().hounds.deadline, 34000);
  f.wall(33999); session.tickTime(); assert.equal(session.getSnapshot().players[0].hp, 10);
  f.wall(34000); session.tickTime(); assert.equal(session.getSnapshot().players[0].hp, 6);
  assert.deepEqual(decodeOfflineSave(f.values.get('toe.offline.v2')), decodeOfflineSave(session.save()));
});
test('presentation then manual pause overlap: clearing presentation cannot restart the paused rule clock', () => {
  const f = fixture(), session = f.session;
  f.wall(2000); session.setPresentationBusy(true);
  f.wall(7000); session.setPaused(true);
  assert.equal(session.getSnapshot().status.paused, true);
  f.wall(10000); session.setPresentationBusy(false); session.tickTime();
  assert.equal(session.getSnapshot().status.paused, true);
  assert.equal(decodeOfflineSave(session.save()).houndsClock.remainingMs, 14000);
  assert.throws(() => session.submit('turn.end'), /offline_paused/);
  f.wall(15000); session.setPaused(false);
  assert.equal(session.getSnapshot().hounds.deadline, 29000);
  f.wall(28999); session.tickTime(); assert.equal(session.getSnapshot().players[0].hp, 10);
  f.wall(29000); session.tickTime(); assert.equal(session.getSnapshot().players[0].hp, 6);
});
test('manual then presentation overlap: clearing manual pause lets animation resume but keeps rules frozen', () => {
  const f = fixture(), session = f.session;
  f.wall(2000); session.setPaused(true);
  f.wall(7000); session.setPresentationBusy(true);
  f.wall(10000); session.setPaused(false);
  assert.equal(session.getSnapshot().status.paused, false);
  const saved = session.save();
  f.wall(40000); session.tickTime(); assert.equal(session.save(), saved);
  assert.equal(session.stepBot(), false);
  session.setPresentationBusy(false);
  assert.equal(session.getSnapshot().hounds.deadline, 54000);
});
test('repeated pause reasons are idempotent; saves restore RNG and remaining hounds without persisting playback busy', () => {
  const f = fixture(), session = f.session;
  f.wall(2000); session.setPresentationBusy(true); session.setPresentationBusy(true);
  const record = decodeOfflineSave(session.save());
  f.wall(5000); session.setPresentationBusy(false); session.setPresentationBusy(false);
  assert.equal(session.getSnapshot().hounds.deadline, 19000);
  const restored = new OfflineSession({ record, now: () => 1000000 });
  assert.equal(restored.freshStart, false);
  assert.equal(restored.getSnapshot().hounds.deadline, 1014000);
  assert.equal(restored.getSnapshot().status.paused, false);
  assert.deepEqual(decodeOfflineSave(restored.save()).random, record.random);
  assert.throws(() => restored.setPresentationBusy(1), TypeError);
  assert.throws(() => restored.setPaused('true'), TypeError);
});
test('freshStart distinguishes new sessions from restored saves and permits an explicit fixture override', () => {
  const fresh = new OfflineSession({ id: 'offline:fresh-clock', seed: 16, now: () => 1000 });
  assert.equal(fresh.freshStart, true);
  const record = decodeOfflineSave(fresh.save());
  assert.equal(new OfflineSession({ record, now: () => 1000 }).freshStart, false);
  assert.equal(new OfflineSession({ record, now: () => 1000, freshStart: true }).freshStart, true);
});
