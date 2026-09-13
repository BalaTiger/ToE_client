import { describe, expect, it } from 'vitest';
import { createStatEventsEvent, createHuntResultEvent, createSwapCardsEvent } from '../visualEvents';
import { ANIMATION_COMPILED_SCHEMA_VERSION, compileRuleVisualEventsToAnimTransaction, getVisualEventIdsCoveredByAnimationQueue, validateAnimationQueueEventDependencies, validateVisualEventTransaction } from '../visualEventTransactionCompiler';

const players = [0, 1].map(index => ({ name: `玩家${index}`, hp: 6, san: 6, hand: [], godZone: [] }));
const loss = (id, type = 'HP_LOSS', target = 1) => ({
  id, seq: 1, type, target,
  from: { hp: 6, san: 6, isDead: false },
  to: { hp: type === 'SAN_LOSS' ? 6 : 3, san: type === 'HP_LOSS' ? 6 : 5, isDead: false },
});
const stateFor = events => ({ players, _visualEvents: events });
const compile = event => compileRuleVisualEventsToAnimTransaction(stateFor([event])).queue;
const withoutField = (value, field) => {
  const copy = { ...value };
  delete copy[field];
  return copy;
};

describe('complete visual event coverage at queue preparation', () => {
  it('never covers another wrapper because its stat event reused the same sequence', () => {
    const first = createStatEventsEvent({ statEvents: [loss('hunt-1')] });
    const second = createStatEventsEvent({ statEvents: [loss('night-1', 'SAN_LOSS', 0)] });
    const firstQueue = compile(first);
    expect(getVisualEventIdsCoveredByAnimationQueue(stateFor([first, second]), firstQueue)).toEqual([first.id]);
  });

  it('does not treat the appearance of the event owner as its complete transaction', () => {
    const event = createStatEventsEvent({ statEvents: [loss('hp'), loss('san', 'SAN_LOSS')] });
    const queue = compile(event);
    expect(queue.map(step => step.type)).toEqual(['HP_DAMAGE', 'SAN_DAMAGE']);
    expect(getVisualEventIdsCoveredByAnimationQueue(stateFor([event]), queue.slice(0, 1))).toEqual([]);
    expect(getVisualEventIdsCoveredByAnimationQueue(stateFor([event]), queue)).toEqual([event.id]);
  });

  it('requires both HP and SAN projections when they carry the same stat event id', () => {
    const event = createStatEventsEvent({ statEvents: [loss('combined', 'HP_SAN_LOSS')] });
    const queue = compile(event).map(step => withoutField(step, 'visualEventId'));
    expect(queue.map(step => step.type)).toEqual(['HP_DAMAGE', 'SAN_DAMAGE']);
    expect(getVisualEventIdsCoveredByAnimationQueue(stateFor([event]), queue.slice(0, 1))).toEqual([]);
    expect(getVisualEventIdsCoveredByAnimationQueue(stateFor([event]), queue)).toEqual([event.id]);
  });

  it('requires death presentation and settlement after a lethal HP projection', () => {
    const hp = { ...loss('lethal'), to: { hp: 0, san: 6, isDead: false } };
    const defeated = { id: 'defeat', seq: 1, type: 'PLAYER_DEFEATED', target: 1,
      from: hp.from, to: { hp: 0, san: 6, isDead: true } };
    const event = createStatEventsEvent({ statEvents: [hp, defeated] });
    const queue = compile(event);
    expect(queue.map(step => step.type)).toContain('GUILLOTINE');
    for (const missingType of ['GUILLOTINE', 'DEATH']) {
      expect(getVisualEventIdsCoveredByAnimationQueue(stateFor([event]), queue.filter(step => step.type !== missingType))).toEqual([]);
    }
    expect(getVisualEventIdsCoveredByAnimationQueue(stateFor([event]), queue)).toEqual([event.id]);
  });

  it('allows an explicit hunt owner to cover a stat wrapper only after all projections exist', () => {
    const stat = loss('shared-combined', 'HP_SAN_LOSS');
    const wrapper = createStatEventsEvent({ statEvents: [stat] });
    const hunt = createHuntResultEvent({ hunterIdx: 0, targetIdx: 1, statEvents: [stat],
      beforePlayers: players, afterPlayers: players });
    const queue = compile(hunt);
    expect(getVisualEventIdsCoveredByAnimationQueue(stateFor([wrapper, hunt]), queue.filter(step => step.type !== 'SAN_DAMAGE'))).toEqual([]);
    expect(getVisualEventIdsCoveredByAnimationQueue(stateFor([wrapper, hunt]), queue)).toEqual([wrapper.id, hunt.id]);
  });

  it('counts every owned action step instead of accepting one repeated transfer type', () => {
    const event = createSwapCardsEvent({ sourceIdx: 0, targetIdx: 1,
      takenCard: { id: 'taken', key: 'A1' }, givenCard: { id: 'given', key: 'A2' } });
    const queue = compile(event);
    const transfers = queue.filter(step => step.type === 'CARD_TRANSFER');
    expect(transfers).toHaveLength(2);
    expect(getVisualEventIdsCoveredByAnimationQueue(stateFor([event]), queue.filter(step => step !== transfers[1]))).toEqual([]);
    expect(getVisualEventIdsCoveredByAnimationQueue(stateFor([event]), queue)).toEqual([event.id]);
  });

  it('walks nested composites and inherits the container owner without skipping projections', () => {
    const event = createStatEventsEvent({ statEvents: [loss('nested', 'HP_SAN_LOSS')] });
    const children = compile(event).map(step => withoutField(step, 'visualEventId'));
    const nested = steps => [{ type: 'COMPOSITE', visualEventId: event.id,
      steps: [{ type: 'COMPOSITE', steps }] }];
    expect(getVisualEventIdsCoveredByAnimationQueue(stateFor([event]), nested(children.slice(0, 1)))).toEqual([]);
    expect(getVisualEventIdsCoveredByAnimationQueue(stateFor([event]), nested(children))).toEqual([event.id]);
  });

  it('records the complete compiled projection manifest without collapsing a shared stat id', () => {
    const event = createStatEventsEvent({ statEvents: [loss('manifest-combined', 'HP_SAN_LOSS')] });
    const transaction = compileRuleVisualEventsToAnimTransaction(stateFor([event]));
    expect(transaction.compiledSchemaVersion).toBe(ANIMATION_COMPILED_SCHEMA_VERSION);
    expect(transaction.stepManifest).toEqual([
      expect.objectContaining({ visualEventId: event.id, type: 'HP_DAMAGE', statEventKeys: ['id:manifest-combined'] }),
      expect.objectContaining({ visualEventId: event.id, type: 'SAN_DAMAGE', statEventKeys: ['id:manifest-combined'] }),
    ]);
    expect(validateVisualEventTransaction(transaction, [event])).toEqual([]);
    expect(validateVisualEventTransaction({ ...transaction, queue: transaction.queue.slice(0, 1) }, [event]))
      .toContainEqual({ code: 'INCOMPLETE_COMPILED_STEP_MANIFEST' });
  });

  it('requires the immortality reveal and subsequent recovery as well as lethal damage', () => {
    const hp = { ...loss('vritra-loss'), phaseOrder: 0, to: { hp: 0, san: 6, isDead: false },
      vritraImmortalReveal: { targetIdx: 1, cards: [], succeeded: true, msgs: [] } };
    const heal = { ...loss('vritra-recovery', 'HP_GAIN'), phaseOrder: 2,
      from: hp.to, to: { hp: 1, san: 6, isDead: false } };
    const event = createStatEventsEvent({ statEvents: [hp, heal] });
    const queue = compile(event);
    expect(queue.map(step => step.type)).toEqual(['HP_DAMAGE', 'VRI_IMMORTAL_REVEAL', 'HP_HEAL']);
    for (const missingType of ['VRI_IMMORTAL_REVEAL', 'HP_HEAL']) {
      expect(getVisualEventIdsCoveredByAnimationQueue(stateFor([event]), queue.filter(step => step.type !== missingType))).toEqual([]);
    }
    expect(getVisualEventIdsCoveredByAnimationQueue(stateFor([event]), queue)).toEqual([event.id]);
  });

  it('does not substitute a different defeat with the same owner, type and target', () => {
    const hp = { ...loss('owned-lethal'), to: { hp: 0, san: 6, isDead: false } };
    const defeated = { id: 'owned-defeat', seq: 1, type: 'PLAYER_DEFEATED', target: 1,
      from: hp.from, to: { hp: 0, san: 6, isDead: true } };
    const event = createStatEventsEvent({ statEvents: [hp, defeated] });
    const queue = compile(event).map(step => step.type === 'GUILLOTINE'
      ? { ...step, sourceStatEventIds: ['foreign-defeat'] } : step);
    expect(getVisualEventIdsCoveredByAnimationQueue(stateFor([event]), queue)).toEqual([]);
  });

  it('adapts unambiguous legacy JSON copies once without relying on sequence equality', () => {
    const stat = { ...loss('legacy-combined', 'HP_SAN_LOSS') };
    delete stat.id;
    const event = { id: 'legacy-wrapper', type: 'statEvents', statEvents: [stat] };
    const state = stateFor([event]);
    const copiedStat = JSON.parse(JSON.stringify(stat));
    const queue = ['HP_DAMAGE', 'SAN_DAMAGE'].map(type => ({ type, hitIndices: [1], statEvents: [{ ...copiedStat }] }));
    expect(getVisualEventIdsCoveredByAnimationQueue(state, queue.slice(0, 1))).toEqual([]);
    expect(getVisualEventIdsCoveredByAnimationQueue(state, queue)).toEqual([event.id]);
  });

  it('leaves ambiguous untagged legacy projections uncovered instead of merging two owners', () => {
    const makeLegacyStat = () => {
      const stat = loss('ambiguous');
      delete stat.id;
      return stat;
    };
    const hunts = [0, 1].map(index => ({ id: `old-hunt-${index}`, type: 'huntResult', hunterIdx: 0, targetIdx: 1,
      statEvents: [makeLegacyStat()], beforePlayers: players, afterPlayers: players, skipIntro: true, skipReveal: true }));
    const queue = [{ type: 'HP_DAMAGE', statEvents: [makeLegacyStat()], hitIndices: [1] }];
    expect(getVisualEventIdsCoveredByAnimationQueue(stateFor(hunts), queue)).toEqual([]);
  });

  it('does not call a reversed projection or reveal timeline complete', () => {
    const event = createStatEventsEvent({ statEvents: [loss('ordered-combined', 'HP_SAN_LOSS')] });
    const queue = compile(event);
    expect(getVisualEventIdsCoveredByAnimationQueue(stateFor([event]), [...queue].reverse())).toEqual([]);
  });

  it('requires distinct queued occurrences for repeated compiled projections', () => {
    const stat = loss('repeated-projection');
    const event = { id: 'two-projections', type: 'animTransaction', queue: [
      { type: 'HP_DAMAGE', statEvents: [stat] },
      { type: 'HP_DAMAGE', statEvents: [stat] },
    ] };
    const queue = compile(event);
    expect(getVisualEventIdsCoveredByAnimationQueue(stateFor([event]), queue.slice(0, 1))).toEqual([]);
    expect(getVisualEventIdsCoveredByAnimationQueue(stateFor([event]), queue)).toEqual([event.id]);
  });

  it('does not infer ambiguous old death consequences after their source ids were removed', () => {
    const defeated = id => ({ id, seq: 1, type: 'PLAYER_DEFEATED', target: 1,
      from: { hp: 3, san: 6 }, to: { hp: 0, san: 6, isDead: true } });
    const event = createStatEventsEvent({ statEvents: [defeated('death-first'), defeated('death-second')] });
    const queue = compile(event).map(step => withoutField(step, 'sourceStatEventIds'));
    expect(getVisualEventIdsCoveredByAnimationQueue(stateFor([event]), queue)).toEqual([]);
  });

  it('rejects complete event blocks played before their explicit target dependency finishes', () => {
    const target = { id: 'target-night', type: 'apophisTarget' };
    const hunt = { id: 'target-hunt', type: 'huntResult', targetResolutionEventId: target.id };
    const dice = { type: 'DICE_ROLL', visualEventId: target.id };
    const san = { type: 'SAN_DAMAGE', visualEventId: target.id };
    const skill = { type: 'SKILL_HUNT', visualEventId: hunt.id };
    expect(validateAnimationQueueEventDependencies([dice, san, skill], [target, hunt])).toEqual([]);
    for (const queue of [[skill, dice, san], [dice, skill, san]]) {
      expect(validateAnimationQueueEventDependencies(queue, [target, hunt])).toEqual([
        expect.objectContaining({ code: 'VISUAL_EVENT_DEPENDENCY_PLAYBACK_OUT_OF_ORDER', eventId: hunt.id, dependencyId: target.id }),
      ]);
    }
    // The prelude can have completed in an earlier scoped transaction.
    expect(validateAnimationQueueEventDependencies([skill], [target, hunt])).toEqual([]);
  });

  it('allows a nested settlement to occur inside the steps of its owning parent', () => {
    const child = { id: 'nested-inspection', type: 'inspection', causedByEventId: 'gift-parent' };
    const parent = { id: 'gift-parent', type: 'bewitchGift', settlementEvents: [child] };
    const queue = [{ type: 'COMPOSITE', visualEventId: parent.id, steps: [
      { type: 'CARD_TRANSFER' },
      { type: 'DRAW_CARD', visualEventId: child.id },
      { type: 'STATE_PATCH' },
    ] }];
    expect(validateAnimationQueueEventDependencies(queue, [parent, child])).toEqual([]);
  });

  it.each(['playerIdx', 'actorIdx', 'deadIndices'])('checks the actual %s of a non-stat consequence', field => {
    const event = { id: `subject-${field}`, type: 'animTransaction', queue: [
      { type: 'STATE_PATCH', [field]: field === 'deadIndices' ? [1] : 1 },
    ] };
    const queue = compile(event);
    expect(getVisualEventIdsCoveredByAnimationQueue(stateFor([event]), queue)).toEqual([event.id]);
    const wrongTarget = queue.map(step => ({ ...step, [field]: field === 'deadIndices' ? [0] : 0 }));
    expect(getVisualEventIdsCoveredByAnimationQueue(stateFor([event]), wrongTarget)).toEqual([]);
  });
});
