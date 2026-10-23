import { describe, expect, it } from 'vitest';
import { TutorialSession, loadTutorialSave, TUTORIAL_SAVE_KEY, TUTORIAL_DONE_KEY } from './TutorialSession';
import { TUTORIAL_FLOW as F, TUTORIAL_STEP_BY_ID } from '../../game/tutorialScenario';

const storage = () => { const values = new Map([['toe.offline.v2', 'ordinary-save']]); return {
  getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key),
}; };
function idle(session) { const view = session.getSnapshot(); session.presentationStatus(false, { matchId: view.matchId, revision: view.revision }); }
function play(session, until = F.COMPLETE, snapshots = []) {
  for (let attempts = 0; attempts < 250; attempts++) {
    let view = session.getSnapshot(); snapshots.push(view);
    if (view.tutorial.step === until && !view.tutorial.waiting) return snapshots;
    idle(session);
    if (session.stepBot()) continue;
    view = session.getSnapshot();
    const definition = TUTORIAL_STEP_BY_ID[view.tutorial.step];
    const action = view.decision.actions[0];
    if (action) {
      const payload = action.type.endsWith('selectTarget') ? { targetSeat: action.targetSeats[0] }
        : ['swap.give', 'hunt.attack', 'bewitch.chooseCard'].includes(action.type) ? { cardIndex: action.cardIndices[0] }
          : action.type === 'god.choose' ? { choice: action.choices[0] }
            : action.type === 'treasureDodge.reply' ? { use: true } : {};
      session.submit(action.type, payload);
    } else if (definition.next) session.advanceTutorialStep(definition.next);
    else throw new Error(`Stuck on ${view.tutorial.step} (${view.phase})`);
  }
  throw new Error('Lesson did not finish');
}
describe('v2 tutorial session', () => {
  it('plays all original chapters via filtered real intents, retaining true terminal states', () => {
    const store = storage(), session = new TutorialSession({ storage: store, now: () => 100 });
    const views = play(session);
    expect(new Set(views.map(view => view.tutorial.chapter))).toEqual(new Set(['treasure', 'hunter', 'cultistZone', 'cultistGod']));
    for (const result of [F.TREASURE_RESULT, F.HUNTER_RESULT, F.CULTIST_ZONE_RESULT, F.CULTIST_GOD_RESULT]) {
      expect(views.find(view => view.tutorial.step === result).gameOver).toBeTruthy();
    }
    expect(views.every(view => view.viewerSeat === 0 && !('deck' in view) && !('random' in view))).toBe(true);
    idle(session); session.complete();
    expect(store.getItem(TUTORIAL_SAVE_KEY)).toBeNull(); expect(store.getItem(TUTORIAL_DONE_KEY)).toBe('1');
    expect(store.getItem('toe.offline.v2')).toBe('ordinary-save');
  });
  it('waits for the exact committed presentation and rejects forbidden actions/forced blind indices', () => {
    const session = new TutorialSession({ now: () => 0 });
    expect(() => session.advanceTutorialStep(F.BOARD_SELF)).toThrow('tutorial_step_unavailable');
    play(session, F.TREASURE_STEAL_CARD);
    expect(() => session.submit('swap.takeBlind', { cardIndex: 0 })).toThrow('invalid_presentation_payload');
    expect(() => session.submit('skill.cancel')).toThrow();
    session.submit('swap.takeBlind');
    const view = session.getSnapshot();
    expect(view.decision.actions).toEqual([]); expect(session.stepBot()).toBe(false);
    session.presentationStatus(false, { matchId: view.matchId, revision: view.revision - 1 });
    expect(session.stepBot()).toBe(false);
    session.presentationStatus(true, view); expect(session.stepBot()).toBe(false);
    idle(session); expect(session.stepBot()).toBe(true);
    expect(session.getSnapshot().tutorial.step).toBe(F.TREASURE_GIVE_CARD);
  });
  it('resumes an acknowledged or pending lesson without touching the ordinary save', () => {
    const store = storage(); let session = new TutorialSession({ storage: store, now: () => 0 });
    play(session, F.HUNTER_SELECT_TARGET);
    session.submit('hunt.selectTarget', { targetSeat: 1 });
    session = new TutorialSession({ saved: loadTutorialSave(store), storage: store, now: () => 2000 });
    expect(session.getSnapshot().tutorial.waiting).toBe(true);
    expect(session.stepBot()).toBe(false);
    play(session); idle(session); session.complete();
    expect(store.getItem('toe.offline.v2')).toBe('ordinary-save');
  });
  it('pauses narration, automatic opponent actions and input until explicitly resumed', () => {
    const session = new TutorialSession({ now: () => 0 });
    play(session, F.TREASURE_DRAW_CARD); idle(session); session.setPaused(true);
    const before = session.save(); session.tickTime(); expect(session.stepBot()).toBe(false); expect(session.save()).toBe(before);
    expect(() => session.advanceTutorialStep(F.TREASURE_DRAW_REVEAL)).toThrow();
    session.setPaused(false); expect(session.stepBot()).toBe(true);
  });
  it('rejects foreign/invalid tutorial saves and premature completion', () => {
    const store = storage(), session = new TutorialSession({ storage: store, now: () => 0 });
    expect(() => session.complete()).toThrow('tutorial_not_complete');
    const saved = JSON.parse(session.save()); saved.chapter = 'hunter'; store.setItem(TUTORIAL_SAVE_KEY, JSON.stringify(saved));
    expect(() => loadTutorialSave(store)).toThrow('Invalid tutorial save');
    saved.chapter = 'treasure'; const record = JSON.parse(saved.record); record.record.id = 'offline:ordinary';
    saved.record = JSON.stringify(record); store.setItem(TUTORIAL_SAVE_KEY, JSON.stringify(saved));
    expect(() => loadTutorialSave(store)).toThrow('Invalid tutorial identity');
  });
});
