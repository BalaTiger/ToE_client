import { describe, it, expect } from 'vitest';
import { applyBalanceDiscardSideEffects } from '../balanceCards';
import { submitLossEvents } from '../effectEngine';
import { makeStandardPlayers } from './factory';

describe('balanceCards', () => {
  it('回合外弃置天平时先进入虚化决策且不提前扣除属性', () => {
    const players = makeStandardPlayers(3);
    players[1].hp = 8;
    players[1].etherealizeStacks = 1;
    const result = applyBalanceDiscardSideEffects({
      players,
      deck: [],
      discard: [],
      log: [],
      ownerIdx: 1,
      cards: [{ type: 'lifeBalance', name: '生命天平' }],
      currentTurn: 0,
      submitDamage: submitLossEvents,
    });

    expect(players[1].hp).toBe(8);
    expect(result.etherealizeDecision).toMatchObject({
      type: 'etherealizeRedirect',
      targetIdx: 1,
      lostHp: 3,
    });
  });

  it('天平牌从当前持有者手牌进入弃牌堆时惩罚当前持有者', () => {
    const players = makeStandardPlayers(3);
    players[1].hp = 8;
    players[2].san = 8;
    const lifeBalance = { type: 'lifeBalance', name: '生命天平' };
    const soulBalance = { type: 'soulBalance', name: '灵魂天平' };

    const life = applyBalanceDiscardSideEffects({
      players,
      deck: [],
      discard: [lifeBalance],
      log: ['贝拉 弃 生命天平（上限）'],
      ownerIdx: 1,
      cards: [lifeBalance],
      reason: '手牌上限弃牌',
    });

    const soul = applyBalanceDiscardSideEffects({
      players: life.players,
      deck: [],
      discard: [lifeBalance, soulBalance],
      log: life.log,
      ownerIdx: 2,
      cards: [soulBalance],
      reason: '手牌上限弃牌',
    });

    expect(soul.players[1].hp).toBe(5);
    expect(soul.players[2].san).toBe(5);
    expect(soul.log.at(-2)).toContain('生命天平');
    expect(soul.log.at(-1)).toContain('灵魂天平');
  });
});
