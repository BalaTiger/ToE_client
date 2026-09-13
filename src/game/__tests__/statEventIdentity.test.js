import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildStatEvents, createPlayerDefeatedStatEvent, statEventsToAnimQueue } from '../statEvents';
import { adaptLegacyStatEventGraph, ensureStatEventId, statEventIdentity } from '../statEventIdentity';
import { rotateStatEvent } from '../rotateEvents';
import { makePlayer } from './factory';

afterEach(() => vi.restoreAllMocks());
const loss = (extra = {}) => ({ type: 'HP_LOSS', target: 1, seq: 7,
  from: { hp: 6, san: 8 }, to: { hp: 3, san: 8 }, ...extra });

describe('stat event identity', () => {
  it('assigns once at creation without consuming rule randomness or reusing a caller prefix', () => {
    const random = vi.spyOn(Math, 'random');
    const before = [makePlayer({ hp: 6, san: 8 })];
    const after = [{ ...before[0], hp: 3, san: 9 }];
    const first = buildStatEvents(before, after, [], { eventIdPrefix: 'same-hunt', seq: 1 });
    const second = buildStatEvents(before, after, [], { eventIdPrefix: 'same-hunt', seq: 1 });
    expect(first.every(event => typeof event.id === 'string' && event.id.length > 0)).toBe(true);
    expect(new Set([...first, ...second].map(event => event.id)).size).toBe(4);
    expect(random).not.toHaveBeenCalled();
  });

  it('preserves explicit identity and keeps identical new payloads independent', () => {
    const first = ensureStatEventId(loss());
    const second = ensureStatEventId(loss());
    expect(first.id).not.toBe(second.id);
    expect(ensureStatEventId(first)).toBe(first);
    expect(ensureStatEventId({ ...first })).toEqual(first);
    expect(statEventIdentity(first)).toBe(statEventIdentity({ ...first, phaseOrder: 42 }));
    expect(createPlayerDefeatedStatEvent({ target: 1, id: 'authored-death' }).id).toBe('authored-death');
  });

  it('keeps identity through phase projection, rotation and JSON serialization', () => {
    const event = ensureStatEventId(loss({ type: 'HP_SAN_LOSS', phaseOrder: 2, to: { hp: 3, san: 7 } }));
    const queue = statEventsToAnimQueue([event], [makePlayer(), makePlayer()]);
    expect(queue.filter(step => step.statEvents).map(step => step.statEvents[0].id)).toEqual([event.id, event.id]);
    expect(queue.flatMap(step => step.statEvents || []).every(stat => !('phaseOrder' in stat))).toBe(true);
    const rotated = rotateStatEvent(JSON.parse(JSON.stringify(event)), index => 1 - index, 1);
    expect(rotated.target).toBe(0);
    expect(statEventIdentity(rotated)).toBe(statEventIdentity(event));
  });

  it('tags death consequences with their originating event identity', () => {
    const before = [makePlayer({ hp: 3 })];
    const after = [{ ...before[0], hp: 0, isDead: true }];
    const events = buildStatEvents(before, after);
    const death = events.find(event => event.type === 'PLAYER_DEFEATED');
    const queue = statEventsToAnimQueue(events, before);
    expect(queue.filter(step => ['GUILLOTINE', 'DEATH', 'STATE_PATCH'].includes(step.type))
      .every(step => step.sourceStatEventIds?.includes(death.id))).toBe(true);
  });
});

describe('legacy stat event graph boundary', () => {
  it('assigns a standalone old projection an independent id without requiring an owner', () => {
    const queue = [{ type: 'SAN_DAMAGE', statEvents: [loss({ type: 'SAN_LOSS' })] }];
    const result = adaptLegacyStatEventGraph({ queue });
    expect(result.issues).toEqual([]);
    expect(result.queue[0].statEvents[0].id).toEqual(expect.any(String));
  });

  it('binds serialized journal, semantic owner, generic wrapper and HP/SAN projections once', () => {
    const stat = loss({ type: 'HP_SAN_LOSS', phaseOrder: 2, to: { hp: 3, san: 7 } });
    const state = JSON.parse(JSON.stringify({ _statEvents: [stat], _visualEvents: [
      { id: 'hunt-owner', type: 'huntResult', statEvents: [stat] },
      { id: 'generic-wrapper', type: 'statEvents', statEvents: [stat] },
    ] }));
    const projection = { ...stat };
    delete projection.phaseOrder;
    const queue = ['HP_DAMAGE', 'SAN_DAMAGE'].map(type => ({ type, visualEventId: 'hunt-owner', statEvents: [{ ...projection }] }));
    const result = adaptLegacyStatEventGraph({ state, queue });
    expect(result.issues).toEqual([]);
    const id = result.state._statEvents[0].id;
    expect(id).toBeTruthy();
    expect(result.state._visualEvents.flatMap(event => event.statEvents).every(event => event.id === id)).toBe(true);
    expect(result.queue.flatMap(step => step.statEvents).every(event => event.id === id)).toBe(true);
    expect(state._statEvents[0]).not.toHaveProperty('id');
    expect(adaptLegacyStatEventGraph({ state: result.state, queue: result.queue })).toMatchObject({ state: result.state, queue: result.queue, issues: [] });
    expect(adaptLegacyStatEventGraph({ state: JSON.parse(JSON.stringify(state)) }).state._statEvents[0].id).toBe(id);
  });

  it('uses a preserved id when only one side of a journal/owner graph is upgraded', () => {
    const state = { _statEvents: [loss({ id: 'already-persisted' })], _visualEvents: [
      { id: 'old-owner', type: 'huntResult', statEvents: [loss()] },
    ] };
    const result = adaptLegacyStatEventGraph({ state });
    expect(result.issues).toEqual([]);
    expect(result.state._visualEvents[0].statEvents[0].id).toBe('already-persisted');
  });

  it('preserves an identity already assigned to an original legacy object', () => {
    const stat = loss();
    const priorId = ensureStatEventId(stat).id;
    const result = adaptLegacyStatEventGraph({ state: { _statEvents: [stat], _visualEvents: [
      { id: 'later-owner', type: 'huntResult', statEvents: [stat] },
    ] } });
    expect(result.state._statEvents[0].id).toBe(priorId);
    expect(statEventIdentity(stat)).toBe(`id:${priorId}`);
  });

  it.each(['projection', 'owner slot'])('does not merge different explicit ids via an old %s', route => {
    const first = loss({ id: 'first-loss' });
    const second = loss({ id: 'second-loss' });
    const previousState = route === 'owner slot' ? { _visualEvents: [
      { id: 'same-owner', type: 'huntResult', statEvents: [second] },
    ] } : null;
    const state = { _statEvents: [first, second, loss()], _visualEvents: [
      { id: 'same-owner', type: 'huntResult', statEvents: [first] },
    ] };
    const queue = route === 'projection' ? [{ type: 'HP_DAMAGE', visualEventId: 'same-owner', statEvents: [second] }] : [];
    const result = adaptLegacyStatEventGraph({ state, previousState, queue });
    expect(result.state._statEvents.map(event => event.id).slice(0, 2)).toEqual(['first-loss', 'second-loss']);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'CONFLICTING_STAT_EVENT_IDENTITY' }),
    ]));
    expect(result.state._statEvents[2].id).not.toBe('first-loss');
    expect(result.state._statEvents[2].id).not.toBe('second-loss');
  });

  it('preserves repeated identical journal events and reports ambiguous unowned clones', () => {
    const state = { _statEvents: [loss(), loss()], _visualEvents: [
      { id: 'unknown-owner', type: 'huntResult', statEvents: [loss()] },
    ] };
    const result = adaptLegacyStatEventGraph({ state });
    expect(new Set(result.state._statEvents.map(event => event.id)).size).toBe(2);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'AMBIGUOUS_LEGACY_STAT_EVENT_IDENTITY' }),
    ]));
  });

  it('does not invent shared identity for unrelated old wrappers with the same payload', () => {
    const result = adaptLegacyStatEventGraph({ state: { _visualEvents: [
      { id: 'first-wrapper', type: 'statEvents', statEvents: [loss()] },
      { id: 'second-wrapper', type: 'statEvents', statEvents: [loss()] },
    ] } });
    const ids = result.state._visualEvents.map(event => event.statEvents[0].id);
    expect(new Set(ids).size).toBe(2);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'AMBIGUOUS_LEGACY_STAT_EVENT_IDENTITY' }),
    ]));
  });

  it('shared references and explicit owners disambiguate identical payloads', () => {
    const first = loss();
    const second = loss();
    const state = { _statEvents: [first, second], _visualEvents: [
      { id: 'owner-one', type: 'huntResult', statEvents: [first] },
      { id: 'owner-two', type: 'huntResult', statEvents: [second] },
    ] };
    const queue = [{ type: 'HP_DAMAGE', visualEventId: 'owner-two', statEvents: [loss()] }];
    const result = adaptLegacyStatEventGraph({ state, queue });
    expect(result.issues).toEqual([]);
    expect(result.state._statEvents[0].id).not.toBe(result.state._statEvents[1].id);
    expect(result.queue[0].statEvents[0].id).toBe(result.state._statEvents[1].id);
  });

  it('upgrades old draw, god encounter and faith metadata using their explicit owners', () => {
    const damage = ensureStatEventId(loss());
    const san = ensureStatEventId(loss({ type: 'SAN_LOSS', target: 0, seq: 8, to: { hp: 6, san: 7 } }));
    const state = { _statEvents: [damage, san], _visualEvents: [
      { id: 'damage-owner', type: 'cardEffect', statEvents: [damage] },
      { id: 'san-owner', type: 'statEvents', statEvents: [san] },
      { id: 'draw-owner', type: 'drawCard', statEventSeqs: [7], statVisualEventIds: ['damage-owner'],
        godEncounter: { statSeqs: [8], visualEventIds: ['san-owner'] } },
      { id: 'faith-owner', type: 'faithChanged', statEvents: [san],
        faithSettlement: { previousFaithExit: { playerIdx: 0, statEventSeqBefore: 7, statEventSeqAfter: 8 } } },
    ] };
    const result = adaptLegacyStatEventGraph({ state });
    expect(result.issues).toEqual([]);
    expect(result.state._visualEvents[2].statEventIds).toEqual([damage.id]);
    expect(result.state._visualEvents[2].godEncounter.statEventIds).toEqual([san.id]);
    expect(result.state._visualEvents[3].faithSettlement.previousFaithExit.statEventIds).toEqual([san.id]);
    expect(state._visualEvents[2]).not.toHaveProperty('statEventIds');
  });

  it('does not upgrade a naked legacy sequence that refers to unrelated owners', () => {
    const first = ensureStatEventId(loss());
    const second = ensureStatEventId(loss({ target: 2 }));
    const result = adaptLegacyStatEventGraph({ state: { _statEvents: [first, second], _visualEvents: [
      { id: 'hunt-one', type: 'huntResult', statEvents: [first] },
      { id: 'hunt-two', type: 'huntResult', statEvents: [second] },
      { id: 'draw', type: 'drawCard', statEventSeqs: [7] },
    ] } });
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'AMBIGUOUS_LEGACY_STAT_METADATA' }),
    ]));
    expect(result.state._visualEvents[2]).not.toHaveProperty('statEventIds');
  });
});
