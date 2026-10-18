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
  #record; #snapshot; #listeners = new Set(); #lastClockSave = 0;
  constructor({ record, seed, id, now = Date.now, storage = null, onSaveError = () => {}, expansionKey } = {}) {
    this.now = now; this.storage = storage; this.onSaveError = onSaveError;
    this.#record = record ? structuredClone(record) : createOfflineRecord({ id, seed, now: now(), expansionKey });
    if (this.#record.houndsClock) this.#record.houndsClock.lastAt = now();
    encodeOfflineSave(this.#record); this.#publish();
  }
  subscribe = listener => { this.#listeners.add(listener); return () => this.#listeners.delete(listener); };
  getSnapshot = () => this.#snapshot;
  #publish() {
    this.#snapshot = freeze(projectMatch(this.#record, { permission: 'player', seat: 0 }, { actions: migratedActions, now: this.now(),
      handleForCard: (seat, id) => `local:${seat}:${id}` }));
    if (this.storage) {
      try { storeOfflineSave(this.storage, this.#record); } catch (error) { this.onSaveError(error); }
    }
    this.#listeners.forEach(listener => listener());
  }
  submit(type, payload = {}) {
    this.tickTime();
    this.#record = dispatchOffline(this.#record, 0, { type, payload }, { now: this.now() }); this.#publish();
  }
  stepBot() {
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
    const previous = this.#record;
    const now = this.now();
    this.#record = advanceRuleTime(previous, now);
    if (previous.revision !== this.#record.revision) this.#publish();
    else if (previous !== this.#record && this.storage && now - this.#lastClockSave >= 1000) {
      try { storeOfflineSave(this.storage, this.#record); this.#lastClockSave = now; } catch (error) { this.onSaveError(error); }
    }
  }
  save() { return encodeOfflineSave(this.#record); }
}
