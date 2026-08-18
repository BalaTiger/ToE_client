import { describe, expect, it } from 'vitest';
import {
  assertValidRuleResolutionEvents,
  createRuleResolutionTransaction,
  orderRuleResolutionEvents,
  validateRuleResolutionEvents,
} from '../ruleResolutionTransaction';

describe('rule resolution transactions', () => {
  it('keeps one transaction atomic and orders it by its explicit cursor', () => {
    const transaction = createRuleResolutionTransaction({
      id: 'resolution:1',
      events: [
        { id: 'damage', type: 'statEvents', order: 2 },
        { id: 'reveal', type: 'drawCard', order: 0 },
        { id: 'decision', type: 'inspection', order: 1 },
      ],
    });
    const ordered = orderRuleResolutionEvents([
      transaction.events[0],
      { id: 'outside', type: 'godPowerBlocked' },
      transaction.events[1],
      transaction.events[2],
    ]);

    expect(ordered.map(event => event.id)).toEqual(['reveal', 'decision', 'damage', 'outside']);
  });

  it('rejects two semantic visual owners for one stat event', () => {
    const statEvent = { seq: 4, type: 'SAN_LOSS', target: 1, phaseOrder: 0 };
    expect(validateRuleResolutionEvents([
      { id: 'card', type: 'cardEffect', statEvents: [statEvent] },
      { id: 'inspection', type: 'inspection', statEvents: [{ ...statEvent }] },
    ])).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DUPLICATE_STAT_EVENT_OWNER' }),
    ]));
  });

  it('requires one unique order for each action transaction event', () => {
    expect(validateRuleResolutionEvents([
      { id: 'a', type: 'drawCard', transactionId: 'tx', order: 0 },
      { id: 'b', type: 'statEvents', transactionId: 'tx', order: 0 },
    ])).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DUPLICATE_RULE_TRANSACTION_ORDER', transactionId: 'tx' }),
    ]));
  });

  it('throws before compiling an ambiguous rule transaction', () => {
    expect(() => assertValidRuleResolutionEvents([
      { id: 'a', type: 'drawCard', transactionId: 'tx', order: 0 },
      { id: 'b', type: 'statEvents', transactionId: 'tx', order: 0 },
    ])).toThrow(/DUPLICATE_RULE_TRANSACTION_ORDER/);
  });

  it('distinguishes sequential stat transitions within one sequence', () => {
    const first = { seq: 4, type: 'HP_GAIN', target: 1, from: { hp: 4, san: 8 }, to: { hp: 5, san: 8 } };
    const second = { seq: 4, type: 'HP_GAIN', target: 1, from: { hp: 5, san: 8 }, to: { hp: 6, san: 8 } };
    expect(validateRuleResolutionEvents([
      { id: 'first', type: 'cardEffect', statEvents: [first] },
      { id: 'second', type: 'inspection', statEvents: [second] },
    ])).toEqual([]);
  });
});
