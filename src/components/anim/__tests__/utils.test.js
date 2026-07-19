import { describe, expect, it } from 'vitest';
import { INSPECTION_DECK } from '../../../constants/card';
import { getInspectionCardPolarity } from '../utils';

describe('getInspectionCardPolarity', () => {
  it('uses positive atmosphere for Superman Will and Reveal the Truth', () => {
    expect(getInspectionCardPolarity({ effect: 'healSAN', type: 'negative' })).toBe('positive');
    expect(getInspectionCardPolarity({ effect: 'drawCard', type: 'negative' })).toBe('positive');
  });

  it('uses neutral atmosphere only for Temporary Calm', () => {
    expect(getInspectionCardPolarity({ effect: 'nothing', type: 'negative' })).toBe('neutral');
  });

  it('defaults every other current or future inspection effect to negative', () => {
    const otherCards = INSPECTION_DECK.filter(card => !['healSAN', 'drawCard', 'nothing'].includes(card.effect));
    expect(otherCards.length).toBeGreaterThan(0);
    expect(otherCards.every(card => getInspectionCardPolarity(card) === 'negative')).toBe(true);
    expect(getInspectionCardPolarity({ effect: 'futureInspectionEffect', type: 'neutral' })).toBe('negative');
  });
});
