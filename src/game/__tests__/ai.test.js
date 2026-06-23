import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiChooseRevealCard, aiShouldKeepZoneCard, canCultistEmptyHandByBewitch, getHunterChaseTargets } from '../ai';
import { aiStep, processAiEndTurnReplayHand } from '../aiTurn';
import { ROLE_CULTIST, ROLE_HUNTER, ROLE_TREASURE } from '../coreUtils';
import { createBlackGoatYoungCard } from '../../constants/card';
import { makeGs, makePlayer, makeZoneCard } from './factory';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('aiShouldKeepZoneCard', () => {
  it('AI 会收入能获得多层防护的半物质化', () => {
    const card = {
      id: 'eth-card',
      key: 'C4',
      name: '半物质化',
      type: 'etherealize',
      isZone: true,
      letter: 'C',
      number: 4,
      polarity: 'neutral',
    };
    const players = [
      makePlayer({ name: '你', hand: [{ id: 'p-card' }] }),
      makePlayer({
        name: '贝拉',
        role: ROLE_HUNTER,
        hp: 6,
        san: 6,
        hand: [{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }],
      }),
      makePlayer({ name: '卡洛斯', hand: [{ id: 'c-card' }] }),
    ];

    expect(aiShouldKeepZoneCard(card, 1, players)).toBe(true);
  });

  it('AI 孤立时不会收入无法转移伤害的半物质化', () => {
    const card = {
      id: 'eth-card',
      key: 'C4',
      name: '半物质化',
      type: 'etherealize',
      isZone: true,
      letter: 'C',
      number: 4,
      polarity: 'neutral',
    };
    const players = [
      makePlayer({ name: '你', isDead: true }),
      makePlayer({
        name: '贝拉',
        role: ROLE_HUNTER,
        hp: 6,
        san: 6,
        hand: [{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }],
      }),
      makePlayer({ name: '卡洛斯', isDead: true }),
    ];

    expect(aiShouldKeepZoneCard(card, 1, players)).toBe(false);
  });

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

  it('未亮明邪祀者会弃置只回复自己 SAN 的圣甲虫', () => {
    const card = makeZoneCard('B1', 0);
    const players = [
      makePlayer({ name: '你', hp: 8, san: 8 }),
      makePlayer({
        name: '贝拉',
        role: ROLE_CULTIST,
        roleRevealed: false,
        hp: 3,
        san: 7,
        hand: [],
      }),
      makePlayer({ name: '卡洛斯', hp: 8, san: 8 }),
    ];

    expect(aiShouldKeepZoneCard(card, 1, players)).toBe(false);
  });

  it('追猎者会收入能清场非追猎者的活火山', () => {
    const card = {
      id: 'volcano',
      key: 'C1',
      name: '活火山',
      type: 'allDamageHP',
      val: 4,
      isZone: true,
      letter: 'C',
      number: 1,
      polarity: 'negative',
    };
    const players = [
      makePlayer({ name: '你', role: ROLE_TREASURE, hp: 4, san: 8 }),
      makePlayer({ name: '艾伦', role: ROLE_HUNTER, hp: 3, san: 8 }),
      makePlayer({ name: '贝拉', role: ROLE_CULTIST, hp: 4, san: 8 }),
      makePlayer({ name: '卡洛斯', role: ROLE_HUNTER, hp: 8, san: 8 }),
    ];

    expect(aiShouldKeepZoneCard(card, 1, players)).toBe(true);
  });
});

describe('aiChooseRevealCard', () => {
  it('AI 被追捕时不会亮出黑山羊幼仔或撒托古亚黏液', () => {
    const blackGoatYoung = createBlackGoatYoungCard();
    const slime = { id: 'slime-1', name: '撒托古亚的赐福黏液', isTsathogguaSlime: true };
    const revealable = { id: 'zone-1', name: '可亮出的区域牌', type: 'drawCard', key: 'A1', isZone: true };

    expect(aiChooseRevealCard([blackGoatYoung, slime, revealable])).toBe(revealable);
    expect(aiChooseRevealCard([blackGoatYoung, slime])).toBeNull();
  });
});

describe('AI end-turn endless corridor replay', () => {
  it('按每张牌依次播放无尽通道、翻牌、弃牌或结算动画', () => {
    const badCard = {
      id: 'bad',
      key: 'D1',
      name: '危险回声',
      type: 'selfDamageHP',
      val: 4,
      isZone: true,
      letter: 'D',
      number: 1,
      polarity: 'negative',
    };
    const healCard = {
      id: 'heal',
      key: 'B1',
      name: '圣甲虫',
      type: 'selfHealSAN',
      val: 3,
      isZone: true,
      letter: 'B',
      number: 1,
      polarity: 'positive',
    };
    const corridor = {
      id: 'corridor',
      key: 'A3',
      name: '无尽通道',
      type: 'endTurnReplayHand',
      isZone: true,
      letter: 'A',
      number: 3,
    };
    const players = [
      makePlayer({ name: '你', hp: 8, san: 8 }),
      makePlayer({ name: '艾伦', role: ROLE_HUNTER, hp: 6, san: 6, hand: [badCard, healCard, corridor] }),
    ];
    const gs = makeGs({ players, currentTurn: 1, phase: 'AI_TURN', log: ['旧日志'] });

    const result = processAiEndTurnReplayHand(
      gs.players.map(player => ({ ...player, hand: [...(player.hand || [])] })),
      [],
      [],
      [...gs.log],
      1,
      gs
    );
    const types = result.replayQueue.map(step => step.type);

    expect(types.slice(0, 4)).toEqual(['ENDLESS_CORRIDOR_TUNNEL', 'DRAW_CARD', 'DISCARD', 'STATE_PATCH']);
    expect(types[4]).toBe('DRAW_CARD');
    expect(types.indexOf('SAN_HEAL')).toBeGreaterThan(4);
    expect(types.lastIndexOf('STATE_PATCH')).toBeGreaterThan(types.indexOf('SAN_HEAL'));
    expect(result.replayQueue[0].msgs).toEqual([expect.stringContaining('【无尽通道】艾伦 展示所有手牌')]);
  });
});

describe('hunter chase target validity', () => {
  it('追捕目标必须持有可亮出的暗牌', () => {
    const players = [
      makePlayer({ name: '追猎者', role: ROLE_HUNTER, hand: [{ id: 'h', key: 'A1', isZone: true, letter: 'A', number: 1 }] }),
      makePlayer({ name: '只有黑山羊', hand: [createBlackGoatYoungCard()] }),
      makePlayer({ name: '只有黏液', hand: [{ id: 'slime-1', name: '撒托古亚的赐福黏液', isTsathogguaSlime: true }] }),
      makePlayer({ name: '有暗牌', hand: [{ id: 'z', key: 'B1', isZone: true, letter: 'B', number: 1 }] }),
    ];

    expect(getHunterChaseTargets(players, 0).map(t => t.idx)).toEqual([3]);
  });
});

describe('aiStep optional action limits', () => {
  it('3HP 邪祀者有三张手牌时不会因蛊惑清手牌例外跳过休息', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const cultistHand = [
      makeZoneCard('B1', 0),
      makeZoneCard('A1', 0),
      makeZoneCard('C1', 0),
    ];
    const players = [
      makePlayer({ name: '你', hp: 10, san: 10 }),
      makePlayer({
        name: '贝拉',
        role: ROLE_CULTIST,
        roleRevealed: false,
        hp: 3,
        san: 7,
        hand: cultistHand,
      }),
      makePlayer({ name: '卡洛斯', hp: 10, san: 10 }),
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

    expect(newLogs.some(line => line.includes('贝拉 选择【休息】'))).toBe(true);
  });

  it('邪祀者三张手牌不应被视为可通过一次蛊惑清空手牌', () => {
    const players = [
      makePlayer({ name: '你', hp: 10, san: 10 }),
      makePlayer({
        name: '贝拉',
        role: ROLE_CULTIST,
        roleRevealed: true,
        hp: 4,
        san: 7,
        hand: [
          makeZoneCard('B1', 0),
          makeZoneCard('A1', 0),
          makeZoneCard('C1', 0),
        ],
      }),
      makePlayer({ name: '卡洛斯', hp: 10, san: 10 }),
    ];

    expect(canCultistEmptyHandByBewitch(players, 1)).toBe(false);
  });

  it('邪祀者蛊惑区域牌让寻宝者集齐时会立即记录完整胜利日志', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const gift = makeZoneCard('B3', 2);
    const players = [
      makePlayer({
        name: '你',
        role: ROLE_TREASURE,
        roleRevealed: true,
        hand: [
          makeZoneCard('A1', 0),
          makeZoneCard('C2', 0),
          makeZoneCard('D4', 0),
        ],
      }),
      makePlayer({
        name: '贝拉',
        role: ROLE_CULTIST,
        roleRevealed: true,
        hp: 9,
        san: 8,
        hand: [gift],
      }),
      makePlayer({ name: '艾伦', hp: 10, san: 10 }),
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

    expect(result.gameOver).toMatchObject({
      winner: ROLE_TREASURE,
      reason: '你集齐了全部编号并获胜！',
      winnerIdx: 0,
    });
    expect(result.log.slice(gs.log.length)).toEqual(expect.arrayContaining([
      '贝拉（邪祀者）对 你 【蛊惑】，赠予 [B3] 窒息矿坑',
      '你集齐了全部编号！',
    ]));
  });

  it('邪祀者只有低 SAN 伤害手牌时优先繁衍且不继续蛊惑', () => {
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
      makePlayer({ name: '你', hp: 8, san: 10 }),
      makePlayer({
        name: '艾伦',
        role: ROLE_CULTIST,
        roleRevealed: true,
        hp: 9,
        hand: [createBlackGoatYoungCard(), sanCard],
      }),
      makePlayer({ name: '贝拉', hp: 10, san: 10 }),
    ];
    const gs = makeGs({
      players,
      inspectionDeck: [{ id: 'check-1', name: '乏力', type: 'weak' }],
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

  it('黑山羊幼仔繁衍不受火把邪神之力免疫限制', () => {
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
      makePlayer({ name: '你', hp: 6, san: 10, godPowerImmuneThisTurn: true, godPowerImmuneTurnOwner: 0 }),
      makePlayer({
        name: '艾伦',
        role: ROLE_CULTIST,
        roleRevealed: true,
        hp: 9,
        hand: [createBlackGoatYoungCard(), sanCard],
        godPowerImmuneThisTurn: true,
        godPowerImmuneTurnOwner: 1,
      }),
      makePlayer({ name: '贝拉', hp: 10, san: 10 }),
    ];
    const gs = makeGs({
      players,
      inspectionDeck: [{ id: 'check-1', name: '乏力', type: 'weak' }],
      currentTurn: 1,
      phase: 'AI_TURN',
      skillUsed: false,
      restUsed: false,
      multiplyUsed: false,
      log: ['旧日志'],
    });

    const result = aiStep(gs);
    const newLogs = result.log.slice(gs.log.length);

    expect(newLogs).toContain('【繁衍】艾伦 将黑山羊幼仔传播给了 你');
    expect(result.players[0].hand.some(card => card.isBlackGoatYoung)).toBe(true);
  });

  it('邪祀者有更高 SAN 伤害手牌时优先蛊惑而不是繁衍', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const sanCard = {
      id: 'san-card',
      key: 'C4',
      name: '恶毒诅咒',
      type: 'selfDamageSAN',
      val: 2,
      isZone: true,
      letter: 'C',
      number: 4,
    };
    const players = [
      makePlayer({ name: '你', hp: 8, san: 10 }),
      makePlayer({
        name: '艾伦',
        role: ROLE_CULTIST,
        roleRevealed: true,
        hp: 9,
        hand: [createBlackGoatYoungCard(), sanCard],
      }),
      makePlayer({ name: '贝拉', hp: 10, san: 10 }),
    ];
    const gs = makeGs({
      players,
      inspectionDeck: [{ id: 'check-2', name: '乏力', effect: 'weakness', value: 1 }],
      inspectionDiscard: [],
      currentTurn: 1,
      phase: 'AI_TURN',
      skillUsed: false,
      restUsed: false,
      multiplyUsed: false,
      log: ['旧日志'],
    });

    const result = aiStep(gs);
    const newLogs = result.log.slice(gs.log.length);

    expect(newLogs.some(line => line.includes('【蛊惑】'))).toBe(true);
    expect(newLogs.some(line => line.includes('黑山羊幼仔') && line.includes('【蛊惑】'))).toBe(false);
    expect(newLogs.some(line => line.includes('【繁衍】'))).toBe(false);
  });

  it('追猎者近期追捕链耗尽且手牌变化很小时优先繁衍', () => {
    const staleCard = { id: 'stale-zone', key: 'A1', name: '旧牌', type: 'selfHealHP', val: 1, isZone: true, letter: 'A', number: 1 };
    const newCard = { id: 'new-zone', key: 'B1', name: '新牌', type: 'selfHealHP', val: 1, isZone: true, letter: 'B', number: 1 };
    const players = [
      makePlayer({ name: '你', hp: 10, hand: [{ id: 'p-card' }] }),
      makePlayer({
        name: '艾伦',
        role: ROLE_HUNTER,
        roleRevealed: true,
        hp: 9,
        hand: [createBlackGoatYoungCard(), staleCard, newCard],
        huntQualityMemory: { turn: 1, handIds: ['stale-zone'], handSize: 2, failedTargetCount: 2 },
      }),
      makePlayer({ name: '贝拉', hp: 5, hand: [{ id: 'b-card' }] }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 1,
      turn: 4,
      phase: 'AI_TURN',
      skillUsed: false,
      restUsed: false,
      multiplyUsed: false,
      log: ['旧日志'],
    });

    const result = aiStep(gs);
    const newLogs = result.log.slice(gs.log.length);

    expect(newLogs.some(line => line.includes('【繁衍】'))).toBe(true);
    expect(newLogs.some(line => line.includes('【追捕】'))).toBe(false);
  });

  it('追猎者有直接斩杀目标时不会因低质量记忆优先繁衍', () => {
    const staleCard = { id: 'stale-zone', key: 'A1', name: '旧牌', type: 'selfHealHP', val: 1, isZone: true, letter: 'A', number: 1 };
    const players = [
      makePlayer({ name: '你', hp: 10, hand: [{ id: 'p-card' }] }),
      makePlayer({
        name: '艾伦',
        role: ROLE_HUNTER,
        roleRevealed: true,
        hp: 9,
        hand: [createBlackGoatYoungCard(), staleCard],
        huntQualityMemory: { turn: 1, handIds: ['stale-zone'], handSize: 2, failedTargetCount: 2 },
      }),
      makePlayer({ name: '贝拉', hp: 3, hand: [{ id: 'b-card' }] }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 1,
      turn: 4,
      phase: 'AI_TURN',
      skillUsed: false,
      restUsed: false,
      multiplyUsed: false,
      log: ['旧日志'],
    });

    const result = aiStep(gs);
    const newLogs = result.log.slice(gs.log.length);

    expect(newLogs.some(line => line.includes('【繁衍】'))).toBe(false);
    expect(newLogs.some(line => line.includes('【追捕】'))).toBe(true);
  });

  it('追猎者首追在同等公开条件下按等权随机选择目标', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.26);
    const hunterCard = { id: 'hunter-a1', key: 'A1', name: '霉变食物', type: 'selfHealHP', val: 1, isZone: true, letter: 'A', number: 1 };
    const targetCard = name => ({ id: `target-${name}`, key: 'B2', name, type: 'selfHealHP', val: 1, isZone: true, letter: 'B', number: 2 });
    const players = [
      makePlayer({ name: '你', hp: 8, hand: [targetCard('玩家手牌')] }),
      makePlayer({ name: '卡洛斯', role: ROLE_HUNTER, roleRevealed: true, hp: 9, hand: [hunterCard] }),
      makePlayer({ name: '艾伦', hp: 8, hand: [targetCard('艾伦手牌')] }),
      makePlayer({ name: '贝拉', hp: 8, hand: [targetCard('贝拉手牌')] }),
      makePlayer({ name: '达贡', hp: 8, hand: [targetCard('达贡手牌')] }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 1,
      phase: 'AI_TURN',
      skillUsed: false,
      restUsed: false,
      log: ['旧日志'],
    });

    const result = aiStep(gs);

    expect(result.log.some(line => line.includes('放弃追捕 艾伦'))).toBe(true);
    expect(result.log.some(line => line.includes('向你发动【追捕】'))).toBe(false);
  });

  it('追猎者放弃追捕后本回合不再追捕其他目标', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const hunterCard = { id: 'hunter-a1', key: 'A1', name: '霉变食物', type: 'selfHealHP', val: 1, isZone: true, letter: 'A', number: 1 };
    const failedTargetCard = { id: 'target-b2', key: 'B2', name: '迷途石阶', type: 'selfHealHP', val: 1, isZone: true, letter: 'B', number: 2 };
    const nextTargetCard = { id: 'target-c3', key: 'C3', name: '地动山摇', type: 'selfHealHP', val: 1, isZone: true, letter: 'C', number: 3 };
    const players = [
      makePlayer({ name: '你', hp: 10, hand: [] }),
      makePlayer({ name: '卡洛斯', role: ROLE_HUNTER, roleRevealed: true, hp: 9, hand: [hunterCard] }),
      makePlayer({ name: '艾伦', role: ROLE_CULTIST, hp: 3, hand: [failedTargetCard] }),
      makePlayer({ name: '贝拉', hp: 9, hand: [nextTargetCard] }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 1,
      phase: 'AI_TURN',
      skillUsed: false,
      restUsed: false,
      log: ['旧日志'],
    });

    const result = aiStep(gs);

    expect(result.log.some(line => line.includes('无匹配手牌，放弃追捕 艾伦'))).toBe(true);
    expect(result.log.some(line => line.includes('对 贝拉 【追捕】'))).toBe(false);
    expect(result.currentTurn).not.toBe(1);
  });
});
