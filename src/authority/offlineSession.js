import { createOfflineRecord, dispatchOffline, stepOfflineAi, encodeOfflineSave, storeOfflineSave } from '../../packages/rules/src/offline.js';
import { projectMatch } from '../../packages/rules/src/authority/view.js';
import { migratedActions } from '../../packages/rules/src/authority/coverage.js';
import { advanceRuleTime } from '../../packages/rules/src/authority/time.js';
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};
export class OfflineSession {
  #record; #snapshot; #listeners = new Set(); #lastClockSave = 0; #pausedAt = null; #pausedMs = 0;
  #manualPaused = false; #presentationBusy = false;
  constructor({ record, seed, id, now = Date.now, storage = null, onSaveError = () => {}, expansionKey, selectedRole, roleCounts, freshStart = !record } = {}) {
    this.freshStart = freshStart;
    this.wallNow = now; this.now = () => (this.#pausedAt ?? this.wallNow()) - this.#pausedMs;
    this.storage = storage; this.onSaveError = onSaveError;
    this.#record = record ? structuredClone(record) : createOfflineRecord({ id, seed, now: this.now(), expansionKey, selectedRole, roleCounts });
    if (this.#record.houndsClock) this.#record.houndsClock.lastAt = this.now();
    encodeOfflineSave(this.#record); this.#publish();
  }
  subscribe = listener => { this.#listeners.add(listener); return () => this.#listeners.delete(listener); };
  getSnapshot = () => this.#snapshot;
  #publish() {
    const view = projectMatch(this.#record, { permission: 'player', seat: 0 }, { actions: migratedActions, now: this.now(),
      handleForCard: (seat, id) => `local:${seat}:${id}` });
    // The local engine clock pauses, but display deadlines use the browser's wall clock.
    const displayOffset = this.wallNow() - this.now();
    if (view.hounds?.deadline !== null && view.hounds?.deadline !== undefined) view.hounds.deadline += displayOffset;
    view.decision.deadline += displayOffset;
    // Cosmetic playback pauses the rule clock, never the playback itself.
    this.#snapshot = freeze({ ...view, status: { paused: this.#manualPaused } });
    if (this.storage) {
      try { storeOfflineSave(this.storage, this.#record); } catch (error) { this.onSaveError(error); }
    }
    this.#listeners.forEach(listener => listener());
  }
  submit(type, payload = {}) {
    if (this.#pausedAt !== null) throw new Error(this.#manualPaused ? 'offline_paused' : 'presentation_pending');
    this.tickTime();
    this.#record = dispatchOffline(this.#record, 0, { type, payload }, { now: this.now() }); this.#publish();
  }
  stepBot() {
    if (this.#pausedAt !== null) return false;
    this.tickTime();
    if (this.#record.state.gameOver) return false;
    for (let seat = 1; seat < this.#record.state.players.length; seat++) {
      const view = projectMatch(this.#record, { permission: 'player', seat }, { actions: migratedActions,
        handleForCard: (viewer, id) => `local:${viewer}:${id}` });
      if (!view.decision.actions.length) continue;
      this.#record = stepOfflineAi(this.#record, seat, { now: this.now() }); this.#publish(); return true;
    }
    if (!this.#snapshot.decision.actions.length) throw new Error(`Offline decision not migrated: ${this.#snapshot.phase}`);
    return false;
  }
  tickTime() {
    if (this.#pausedAt !== null) return;
    const previous = this.#record;
    const now = this.now();
    this.#record = advanceRuleTime(previous, now);
    if (previous.revision !== this.#record.revision) this.#publish();
    else if (previous !== this.#record && this.storage && now - this.#lastClockSave >= 1000) {
      try { storeOfflineSave(this.storage, this.#record); this.#lastClockSave = now; } catch (error) { this.onSaveError(error); }
    }
  }
  setPaused(paused) {
    if (typeof paused !== 'boolean') throw new TypeError('Expected pause state');
    if (paused === this.#manualPaused) return;
    this.#setPauseReasons(paused, this.#presentationBusy);
  }
  setPresentationBusy(busy) {
    if (typeof busy !== 'boolean') throw new TypeError('Expected presentation state');
    if (busy === this.#presentationBusy) return;
    this.#setPauseReasons(this.#manualPaused, busy);
  }
  #setPauseReasons(manualPaused, presentationBusy) {
    const wasPaused = this.#pausedAt !== null, nextPaused = manualPaused || presentationBusy;
    if (nextPaused && !wasPaused) { this.tickTime(); this.#pausedAt = this.wallNow(); }
    else if (!nextPaused && wasPaused) { this.#pausedMs += Math.max(0, this.wallNow() - this.#pausedAt); this.#pausedAt = null; }
    this.#manualPaused = manualPaused; this.#presentationBusy = presentationBusy;
    this.#publish();
  }
  save() { return encodeOfflineSave(this.#record); }
}
