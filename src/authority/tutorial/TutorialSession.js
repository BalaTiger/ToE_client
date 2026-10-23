import { createTutorialRecord, TUTORIAL_CHAPTERS } from './fixtures.js';
import { TUTORIAL_FLOW as F, TUTORIAL_STEPS, TUTORIAL_STEP_BY_ID, nextTutorialStepAfterAction } from '../../game/tutorialScenario.js';
import { dispatchOffline, encodeOfflineSave, decodeOfflineSave } from '../../../packages/rules/src/offline.js';
import { projectMatch } from '../../../packages/rules/src/authority/view.js';
import { migratedActions } from '../../../packages/rules/src/authority/coverage.js';
import { createAuthorityCommandDispatcher } from '../presentation/commands.js';

export const TUTORIAL_SAVE_KEY = 'toe.tutorial.v2';
export const TUTORIAL_DONE_KEY = 'cthulhu_tutorial_v2_done';
const SCHEMA = 'toe.tutorial-save/v2';
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const chapterByStep = {};
let chapter = 'treasure';
for (const step of TUTORIAL_STEPS) { if (step.setup) chapter = step.setup; chapterByStep[step.id] = chapter; }
const intentTypes = { drawKeep: ['draw.keep'], dodgeRoll: ['treasureDodge.reply'], useSkill: ['skill.begin'],
  selectTarget: ['swap.selectTarget', 'hunt.selectTarget', 'bewitch.selectTarget'], swapSteal: ['swap.takeBlind'],
  handCard: ['swap.give', 'hunt.attack', 'bewitch.chooseCard'], godKeepHand: ['god.choose'] };
function lessonActions(view, step, waiting) {
  const allowed = TUTORIAL_STEP_BY_ID[step]?.allowedAction;
  if (!allowed || waiting) return [];
  return view.decision.actions.filter(action => intentTypes[allowed.type]?.includes(action.type)).map(action => {
    const next = { ...action };
    if (allowed.pid !== undefined) next.targetSeats = (action.targetSeats || action.targets || []).filter(seat => seat === allowed.pid);
    if (allowed.cardId) {
      const ids = [].concat(allowed.cardId).map(id => `local:0:${id}`);
      next.cardIndices = action.cardIndices.filter(index => ids.includes(view.players[0].hand[index]?.id));
      next.allowAbandon = false;
    }
    if (allowed.type === 'godKeepHand') next.choices = ['keepHand'];
    if (allowed.type === 'dodgeRoll') next.choices = [true];
    return next;
  });
}
export function loadTutorialSave(storage) {
  const text = storage.getItem(TUTORIAL_SAVE_KEY);
  if (text == null) return null;
  if (text.length > 5 * 1024 * 1024) throw new TypeError('Invalid tutorial save size');
  const saved = JSON.parse(text);
  if (!saved || saved.schema !== SCHEMA || Object.keys(saved).some(key => !['schema', 'chapter', 'step', 'pending', 'record'].includes(key))
    || !TUTORIAL_CHAPTERS.includes(saved.chapter) || chapterByStep[saved.step] !== saved.chapter
    || saved.pending !== null && chapterByStep[saved.pending] !== saved.chapter) throw new TypeError('Invalid tutorial save');
  const record = decodeOfflineSave(saved.record);
  if (record.id !== `offline:tutorial:${saved.chapter}`) throw new TypeError('Invalid tutorial identity');
  return { ...saved, record };
}

/** Local lesson orchestration. Every change after chapter initialization uses a real semantic intent. */
export class TutorialSession {
  #record; #step; #chapter; #pending = null; #snapshot; #listeners = new Set(); #settled = null; #paused = false; #resumed;
  constructor({ saved = null, storage = null, now = Date.now, onSaveError = () => {} } = {}) {
    this.isTutorial = true; this.storage = storage; this.now = now; this.onSaveError = onSaveError;
    this.#chapter = saved?.chapter || 'treasure'; this.#step = saved?.step || F.INTRO;
    this.#pending = saved?.pending || null; this.#record = saved ? structuredClone(saved.record) : createTutorialRecord(this.#chapter, { now: now() });
    this.#resumed = !!saved; this.#publish();
  }
  subscribe = listener => { this.#listeners.add(listener); return () => this.#listeners.delete(listener); };
  getSnapshot = () => this.#snapshot;
  #publish() {
    const view = projectMatch(this.#record, { permission: 'player', seat: 0 }, { actions: migratedActions, now: this.now(), handleForCard: (seat, id) => `local:${seat}:${id}` });
    view.decision.actions = lessonActions(view, this.#step, !!this.#pending);
    this.#snapshot = freeze({ ...view, status: { paused: this.#paused }, tutorial: {
      chapter: this.#chapter, step: this.#step, waiting: !!this.#pending, resumed: this.#resumed,
    } });
    if (this.storage) { try { this.storage.setItem(TUTORIAL_SAVE_KEY, this.save()); } catch (error) { this.onSaveError(error); } }
    this.#listeners.forEach(listener => listener());
  }
  #dispatch(seat, type, payload, next) {
    this.#record = dispatchOffline(this.#record, seat, { type, payload }, { now: this.now() });
    this.#pending = next; this.#settled = null; this.#publish();
  }
  submit(type, payload = {}) {
    const action = TUTORIAL_STEP_BY_ID[this.#step]?.allowedAction;
    const next = action && nextTutorialStepAfterAction(this.#step, action);
    const dispatcher = createAuthorityCommandDispatcher({ getView: this.getSnapshot,
      submit: (intent, data) => this.#dispatch(0, intent, data, next === F.TREASURE_MAP_ANIM ? F.TREASURE_RESULT : next) });
    if (!next) throw new Error('tutorial_action_unavailable');
    return dispatcher.submit(type, payload);
  }
  presentationStatus(busy, { matchId, revision } = {}) {
    if (matchId !== this.#record.id || revision !== this.#record.revision) return;
    this.#settled = busy ? null : { matchId, revision };
  }
  #isSettled() { return !this.#paused && this.#settled?.matchId === this.#record.id && this.#settled?.revision === this.#record.revision; }
  advanceTutorialStep(next) {
    const step = TUTORIAL_STEP_BY_ID[this.#step];
    if (!this.#isSettled() || this.#pending || step.allowedAction || step.auto || step.next !== next) throw new Error('tutorial_step_unavailable');
    if (this.#step === F.CULTIST_GOD_PLAYER_DRAW) { this.#dispatch(1, 'turn.end', {}, next); return; }
    const setup = TUTORIAL_STEP_BY_ID[next]?.setup;
    if (setup && setup !== this.#chapter) {
      this.#chapter = setup; this.#record = createTutorialRecord(setup, { now: this.now() }); this.#settled = null; this.#resumed = false;
    }
    this.#step = next; this.#publish();
  }
  stepBot() {
    if (!this.#isSettled()) return false;
    if (this.#pending) {
      if ([F.HUNTER_REVEAL, F.HUNTER_REVEAL_2].includes(this.#pending) && this.#record.state.phase === 'HUNT_WAIT_REVEAL') {
        this.#dispatch(1, 'hunt.reveal', { cardIndex: 0 }, this.#pending); return true;
      }
      this.#step = this.#pending; this.#pending = null; this.#publish(); return true;
    }
    const automatic = {
      [F.TREASURE_DRAW_CARD]: [1, 'turn.end', {}, F.TREASURE_DRAW_REVEAL],
      [F.CULTIST_GOD_OPPONENT_DRAW_START]: [0, 'turn.end', {}, F.CULTIST_GOD_OPPONENT_DRAW],
      [F.CULTIST_GOD_CONVERT_RESOLVE]: [1, 'god.choose', { choice: 'worship' }, F.CULTIST_GOD_CONVERT_CHECK],
    }[this.#step];
    if (automatic) { this.#dispatch(...automatic); return true; }
    return false;
  }
  // Authored chapters contain no running hound clock. Explanation time never advances a rule decision.
  tickTime() {}
  setPaused(paused) {
    if (typeof paused !== 'boolean') throw new TypeError('Expected pause state');
    if (this.#paused !== paused) { this.#paused = paused; this.#publish(); }
  }
  complete() {
    if (this.#step !== F.COMPLETE || this.#pending || !this.#isSettled()) throw new Error('tutorial_not_complete');
    this.storage?.removeItem(TUTORIAL_SAVE_KEY); this.storage?.setItem(TUTORIAL_DONE_KEY, '1');
  }
  save() { return JSON.stringify({ schema: SCHEMA, chapter: this.#chapter, step: this.#step, pending: this.#pending, record: encodeOfflineSave(this.#record) }); }
}
