import { describe, expect, it } from 'vitest';
import {
  addTurnScopedDamageBonus,
  clearExpiredTurnScopedEffects,
  getCurrentExecutionTurnOwner,
  grantTurnScopedGodPowerImmunity,
} from '../turnScopedEffects';

describe('turnScopedEffects', () => {
  it('grants and clears effects by execution turn owner', () => {
    const players = [
      { name: '执行者' },
      { name: '被触发者' },
    ];
    addTurnScopedDamageBonus(players[1], 0, 1);
    grantTurnScopedGodPowerImmunity(players[1], 0);

    expect(players[1]).toMatchObject({
      damageBonus: 1,
      damageBonusTurnOwner: 0,
      godPowerImmuneThisTurn: true,
      godPowerImmuneTurnOwner: 0,
    });

    const cleaned = clearExpiredTurnScopedEffects(players, 0);
    expect(cleaned[1].damageBonus).toBeUndefined();
    expect(cleaned[1].damageBonusTurnOwner).toBeUndefined();
    expect(cleaned[1].godPowerImmuneThisTurn).toBeUndefined();
    expect(cleaned[1].godPowerImmuneTurnOwner).toBeUndefined();
  });

  it('keeps effects owned by another execution turn', () => {
    const players = [{ damageBonus: 1, damageBonusTurnOwner: 2 }];
    expect(clearExpiredTurnScopedEffects(players, 0)[0]).toMatchObject({
      damageBonus: 1,
      damageBonusTurnOwner: 2,
    });
  });

  it('resolves current execution owner from game state', () => {
    expect(getCurrentExecutionTurnOwner({ currentTurn: 3 }, 1)).toBe(3);
    expect(getCurrentExecutionTurnOwner({}, 1)).toBe(1);
  });
});
