import { describe, expect, it } from 'vitest';
import { aiShouldKeepZoneCard } from '../ai';
import { aiStep } from '../aiTurn';
import { ROLE_CULTIST, ROLE_HUNTER } from '../coreUtils';
import { createBlackGoatYoungCard } from '../../constants/card';
import { makeGs, makePlayer } from './factory';

describe('aiShouldKeepZoneCard', () => {
  it('AI 自己会成为同归深渊目标时不会收入', () => {
    const card = {
      id: 1,
      key: 'D4',
      name: '同归深渊',
      type: 'sameAbyssChoice',
      isZone: true,
      letter: 'D',
      number: 4,
      hpVal: 2,
    };
    const players = [
      makePlayer({ name: '你', hand: [{ id: 'a' }, { id: 'b' }] }),
      makePlayer({
        name: '贝拉',
        role: ROLE_HUNTER,
        hp: 10,
        hand: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }, { id: 'c5' }],
      }),
      makePlayer({ name: '卡洛斯', hand: [{ id: 'd' }] }),
    ];

    expect(aiShouldKeepZoneCard(card, 1, players)).toBe(false);
  });
});

describe('aiStep optional action limits', () => {
  it('AI 使用繁衍后不能在同回合继续蛊惑', () => {
    const sanCard = {
      id: 'san-card',
      key: 'A4',
      name: '空谷传音',
      type: 'allDamageSAN',
      val: 1,
      isZone: true,
      letter: 'A',
      number: 4,
    };
    const players = [
      makePlayer({ name: '你', hp: 8, san: 8 }),
      makePlayer({
        name: '艾伦',
        role: ROLE_CULTIST,
        roleRevealed: true,
        hp: 4,
        hand: [createBlackGoatYoungCard(), sanCard],
      }),
      makePlayer({ name: '贝拉', hp: 10, san: 8 }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 1,
      phase: 'AI_TURN',
      skillUsed: false,
      restUsed: false,
      multiplyUsed: false,
      log: ['旧日志'],
    });

    const result = aiStep(gs);
    const newLogs = result.log.slice(gs.log.length);

    expect(newLogs.some(line => line.includes('【繁衍】'))).toBe(true);
    expect(newLogs.some(line => line.includes('【蛊惑】'))).toBe(false);
  });
});
