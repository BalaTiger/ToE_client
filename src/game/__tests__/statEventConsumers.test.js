import { describe, expect, it } from 'vitest';
import {
  getAiActionQueueCoverage,
  scopeAiActionReplayMetadata,
  scopeAiPreHuntReplayMetadata,
} from '../aiTurnPresentation';
import { buildFreshStatVisualEvents, createCardEffectEvent, createOrderedSettlementEvents, createStatEventsEvent, createSwapCardsEvent } from '../visualEvents';
import { compileRuleVisualEventsToAnimTransaction } from '../visualEventTransactionCompiler';

function loss(id, overrides = {}) {
  return {
    id,
    seq: 1,
    type: 'HP_LOSS',
    target: 2,
    from: { hp: 6, san: 8, isDead: false },
    to: { hp: 3, san: 8, isDead: false },
    ...overrides,
  };
}

describe('stat event consumers use event identity', () => {
  it('assigns one identity to a shared raw event at visual factory boundaries', () => {
    const raw = loss(undefined);
    const wrapper = createStatEventsEvent({ statEvents: [raw] });
    const owner = createCardEffectEvent({ effectKey: 'startledBats', statEvents: [raw] });

    expect(wrapper.statEvents[0].id).toEqual(expect.any(String));
    expect(owner.statEvents[0].id).toBe(wrapper.statEvents[0].id);
    expect(buildFreshStatVisualEvents({ _statEvents: [raw], _visualEvents: [owner] })).toEqual([]);
  });

  it('keeps an unowned loss when another loss with the same batch is owned', () => {
    const owned = loss('hunt-damage');
    const unowned = loss('other-target', { target: 1 });
    const events = buildFreshStatVisualEvents({
      _statEvents: [owned, unowned],
      _visualEvents: [{ id: 'hunt', type: 'huntResult', statEvents: [{ ...owned }] }],
    });

    expect(events.flatMap(event => event.statEvents)).toEqual([unowned]);
  });

  it('preserves separate settlements with identical payloads and distinct ids', () => {
    const owned = loss('first');
    const unowned = loss('second');
    const events = createOrderedSettlementEvents({
      events: [{ id: 'explicit', type: 'cardEffect', statEvents: [{ ...owned, logHint: 'owned log' }] }],
      statEvents: [owned, unowned],
    });

    expect(events.filter(event => event.type === 'statEvents').flatMap(event => event.statEvents)).toEqual([unowned]);
  });

  it('does not exclude the current action when next-turn metadata shares its batch and payload', () => {
    const actionLoss = loss('current-action');
    const nextTurnLoss = loss('next-turn');
    const excludedLoss = loss('corridor');
    const action = { id: 'action-owner', type: 'cardEffect', statEvents: [actionLoss] };
    const metadata = scopeAiActionReplayMetadata({
      _statEvents: [actionLoss, nextTurnLoss, excludedLoss],
      _visualEvents: [
        action,
        { id: 'next-turn-owner', type: 'statEvents', turnStartStage: 'draw', statEvents: [nextTurnLoss] },
        { id: 'corridor-owner', type: 'sphinxResult', statEvents: [excludedLoss] },
      ],
    }, { excludedVisualEventIds: ['corridor-owner'] });

    expect(metadata.visualEvents).toEqual([action]);
    expect(metadata.statEvents).toEqual([actionLoss]);
    expect(metadata.statEventSeq).toBe(1);
  });

  it('honors explicit stat exclusions without removing the rest of their batch', () => {
    const first = loss('first');
    const second = loss('second');
    const state = { _statEvents: [first, second], _visualEvents: [] };

    expect(scopeAiActionReplayMetadata(state, { excludedStatEventIds: ['first'] }).statEvents).toEqual([second]);
    expect(scopeAiActionReplayMetadata(state, { excludedStatEvents: [{ ...first }] }).statEvents).toEqual([second]);
  });

  it('keeps only the pre-hunt transaction owners even when all settlements reuse a batch', () => {
    const prelude = loss('prelude');
    const hunt = loss('hunt', { from: { hp: 3, san: 8 }, to: { hp: 0, san: 8 } });
    const otherAction = loss('other-action');
    const events = [
      { id: 'prelude-owner', type: 'statEvents', transactionId: 'action', order: 0, statEvents: [prelude] },
      { id: 'hunt-owner', type: 'huntResult', transactionId: 'action', order: 1, attemptId: 'attempt', statEvents: [hunt] },
      { id: 'other-owner', type: 'cardEffect', transactionId: 'other', order: 0, statEvents: [otherAction] },
    ];
    const metadata = scopeAiPreHuntReplayMetadata({
      _statEvents: [prelude, hunt, otherAction],
      _visualEvents: events,
    }, {
      _aiActionTransactionId: 'action',
      _aiHuntEvents: [{ attemptId: 'attempt' }],
    });

    expect(metadata.visualEvents).toEqual([events[0]]);
    expect(metadata.statEvents).toEqual([prelude]);
  });

  it('uses explicit faith-exit stat ids when a batch contains other action damage', () => {
    const faithLoss = loss('faith-loss');
    const otherLoss = loss('other-loss');
    const faith = {
      id: 'faith', type: 'godStatusChanged', transactionId: 'action', order: 0,
      faithSettlement: { previousFaithExit: { statEventIds: ['faith-loss'], statEventSeqBefore: 0, statEventSeqAfter: 1 } },
    };
    const metadata = scopeAiPreHuntReplayMetadata({
      _statEvents: [faithLoss, otherLoss],
      _visualEvents: [
        faith,
        { id: 'hunt', type: 'huntResult', transactionId: 'action', order: 1, attemptId: 'attempt', statEvents: [otherLoss] },
      ],
    }, { _aiActionTransactionId: 'action', _aiHuntEvents: [{ attemptId: 'attempt' }] });

    expect(metadata.statEvents).toEqual([faithLoss]);
  });

  it('does not count a HP impact as full HP/SAN wrapper coverage', () => {
    const combined = loss('combined', { type: 'HP_SAN_LOSS', to: { hp: 3, san: 7, isDead: false } });
    const state = { _visualEvents: [{ id: 'wrapper', type: 'statEvents', statEvents: [combined] }] };
    const hp = { type: 'HP_DAMAGE', statEvents: [combined] };
    const san = { type: 'SAN_DAMAGE', statEvents: [combined] };

    expect(getAiActionQueueCoverage(state, [hp]).uncoveredEventIds).toEqual(['wrapper']);
    expect(getAiActionQueueCoverage(
      state, [{ ...hp, visualEventId: 'wrapper' }], steps => steps.map(step => step.visualEventId),
    ).uncoveredEventIds).toEqual(['wrapper']);
    expect(getAiActionQueueCoverage(state, [hp, san]).uncoveredEventIds).toEqual([]);
  });

  it('requires both card transfers after a swap lock even when a caller returns the owner id', () => {
    const event = createSwapCardsEvent({
      sourceIdx: 0,
      targetIdx: 1,
      takenCard: { id: 'taken', key: 'A1', name: '石块' },
      givenCard: { id: 'given', key: 'B1', name: '火把' },
    });
    const state = { _visualEvents: [event] };
    const queue = compileRuleVisualEventsToAnimTransaction(state).queue;
    const transfers = queue.filter(step => step.type === 'CARD_TRANSFER');
    expect(transfers).toHaveLength(2);
    expect(getAiActionQueueCoverage(
      state, queue.filter(step => step.type === 'SKILL_SWAP'), () => [event.id],
    ).uncoveredEventIds).toEqual([event.id]);
    expect(getAiActionQueueCoverage(
      state, queue.filter(step => step !== transfers[1]), () => [event.id],
    ).uncoveredEventIds).toEqual([event.id]);
    expect(getAiActionQueueCoverage(state, queue).uncoveredEventIds).toEqual([]);
  });
});
