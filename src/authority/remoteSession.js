import { presentationReadyPayload } from './presentationClock.js';

const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
};
export class RemoteSession {
  #view = null; #listeners = new Set(); #pending = new Map(); #sequence = 0;
  #presentationReceipt = null;
  constructor(socket, matchId, { onError = () => {}, sessionId = crypto.randomUUID(), freshStart = false } = {}) {
    this.socket = socket; this.matchId = matchId; this.onError = onError; this.sessionId = sessionId;
    this.freshStart = freshStart === true;
    this.onView = view => this.accept(view);
    socket.on('view', this.onView);
    this.onConnect = () => { this.resume().catch(onError); };
    socket.on('connect', this.onConnect);
  }
  subscribe = listener => { this.#listeners.add(listener); return () => this.#listeners.delete(listener); };
  getSnapshot = () => this.#view;
  accept(view) {
    if (!view || view.version !== 2 || view.matchId !== this.matchId || !Number.isSafeInteger(view.revision)
      || view.revision < 0 || !Array.isArray(view.players) || !Array.isArray(view.decision?.actions)
      || ['gs', 'state', 'deck', 'random', 'seed', 'abilityData'].some(key => Object.hasOwn(view, key))) {
      this.onError(new Error('Invalid authoritative view')); return false;
    }
    if (this.#view && view.revision < this.#view.revision) return false;
    // Replace, never merge: abandonment can revoke private visibility while
    // the canonical gameplay revision stays unchanged.
    this.#view = freeze(structuredClone(view)); this.#listeners.forEach(listener => listener()); return true;
  }
  #request(event, payload) {
    return new Promise((resolve, reject) => this.socket.timeout(5000).emit(event, payload, (error, result) => {
      if (error) { const uncertain = new Error('ack_uncertain'); uncertain.uncertain = true; reject(uncertain); }
      else if (!result?.ok) { const failed = new Error(result?.error || 'command_rejected'); failed.code = result?.error; reject(failed); }
      else resolve(result);
    }));
  }
  async resume() {
    const result = await this.#request('resume', { matchId: this.matchId });
    for (const id of this.#pending.keys()) await this.retry(id);
    return result;
  }
  async submit(type, payload = {}) {
    if (!this.#view || !this.socket.connected) throw new Error('not_connected');
    if (this.#pending.size) throw new Error('previous_command_uncertain');
    if (!this.#view.decision.actions.some(action => action.type === type)) throw new Error('not_your_decision');
    const actionId = `ui:${this.sessionId}:${++this.#sequence}`;
    const command = { version: 2, matchId: this.matchId, revision: this.#view.revision,
      decisionId: this.#view.decision.id, actionId, type, payload: structuredClone(payload) };
    this.#pending.set(actionId, command); return this.retry(actionId);
  }
  async retry(actionId = this.#pending.keys().next().value) {
    const command = this.#pending.get(actionId); if (!command) throw new Error('no_pending_command');
    try { const result = await this.#request('intent', command); this.#pending.delete(actionId); return result; }
    catch (error) { if (!error.uncertain) this.#pending.delete(actionId); throw error; }
  }
  async abandon() { return this.#request('abandon', { matchId: this.matchId }); }
  async presentationReady(view = this.#view) {
    const payload = presentationReadyPayload(view);
    if (!payload || view !== this.#view) return null;
    if (!this.socket.connected) throw new Error('not_connected');
    const key = `${payload.batchId}:${payload.revision}:${payload.decisionId}`;
    if (this.#presentationReceipt?.key === key) return this.#presentationReceipt.promise;
    const promise = this.#request('presentationReady', payload);
    this.#presentationReceipt = { key, promise };
    try { return await promise; }
    catch (error) {
      if (this.#presentationReceipt?.promise === promise) this.#presentationReceipt = null;
      throw error;
    }
  }
  dispose() { this.socket.off('view', this.onView); this.socket.off('connect', this.onConnect); this.#listeners.clear(); }
}
