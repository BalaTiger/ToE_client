import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  aiChooseRevealCard,
  aiShouldKeepZoneCard,
  canCultistEmptyHandByBewitch,
  chooseAiCultistBewitchPlan,
  chooseAiDamageLinkTarget,
  decideAiSkillUsage,
  evaluateHunterChaseHandQuality,
  getHunterChaseTargets,
  orderHunterChaseTargets,
  shouldAiRest,
} from '../ai';
import { aiStep, chooseAiTreasureSwapPlan, continueAiCthRestDraws, discardAiHandToLimit, processAiEndTurnEvents, processAiEndTurnReplayHand } from '../aiTurn';
import { buildOwnedAiHuntEventQueue, getAiActionQueueCoverage, scopeAiActionReplayMetadata } from '../aiTurnPresentation';
import { cardLogText, ROLE_CULTIST, ROLE_HUNTER, ROLE_TREASURE } from '../coreUtils';
import { getAnimationQueueVisualEventIds, getVisualEventIdsCoveredByAnimationQueue } from '../visualEventTransactionCompiler';
import { startNextTurn } from '../turnEngine';
import { createBlackGoatYoungCard } from '../../constants/card';
import { makeGs, makeGodCard, makePlayer, makeZoneCard } from './factory';
import { makeProliferatingZState } from '../proliferatingZ';
import { addDamageLink } from '../damageLinks';

describe('AI 两人一绳策略', () => {
  const rope = () => makeZoneCard('B4', 0, { name: '两人一绳', type: 'damageLink', polarity: 'neutral' });

  it('满血追猎者跳过已揭晓追猎者并连接下一名可追捕敌人', () => {
    const players = [
      makePlayer({ name: '队友', role: ROLE_HUNTER, roleRevealed: true, hand: [makeZoneCard('A1')] }),
      makePlayer({ name: '追猎者', role: ROLE_HUNTER, hp: 10, hand: [makeZoneCard('B2'), makeZoneCard('C3')] }),
      makePlayer({ name: '敌人', role: ROLE_TREASURE, roleRevealed: true, hp: 8, hand: [makeZoneCard('B1')] }),
    ];

    expect(chooseAiDamageLinkTarget(players, 1, [0, 2])).toBe(2);
  });

  it('追捕排序优先已经连接的合法敌人以兑现断绳伤害', () => {
    const players = [
      makePlayer({ name: '追猎者', role: ROLE_HUNTER, hp: 10, hand: [makeZoneCard('A1'), makeZoneCard('B2')] }),
      makePlayer({ name: '低血敌人', role: ROLE_TREASURE, roleRevealed: true, hp: 4, hand: [makeZoneCard('C1')] }),
      makePlayer({ name: '绳索敌人', role: ROLE_CULTIST, roleRevealed: true, hp: 8, hand: [makeZoneCard('D1')] }),
    ];
    addDamageLink(players, 0, 2);
    const targets = getHunterChaseTargets(players, 0);

    expect(orderHunterChaseTargets(players, 0, targets, () => 0)[0].idx).toBe(2);
  });

  it('3HP追猎者不会把两人一绳当作固定高收益牌', () => {
    const players = [
      makePlayer({ name: '追猎者', role: ROLE_HUNTER, hp: 3, hand: [makeZoneCard('A1')] }),
      makePlayer({ name: '目标', role: ROLE_TREASURE, hp: 10, hand: [makeZoneCard('B1')] }),
    ];

    expect(aiShouldKeepZoneCard(rope(), 0, players)).toBe(false);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AI 寻宝者公开信息掉包策略', () => {
  it('可挑选的公开手牌中只要有推进牌，就压过日志中的双轴推进线索', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const players = [
      makePlayer({ name: '寻宝者', role: ROLE_TREASURE, hand: [makeZoneCard('A1'), makeZoneCard('B2')] }),
      makePlayer({
        name: '公开手牌目标',
        revealHand: true,
        pickInsteadOfRandom: true,
        hand: [makeZoneCard('A3')],
      }),
      makePlayer({ name: '日志目标', hand: [makeZoneCard('D4')] }),
    ];
    const log = ['日志目标 收入了 [C4] 双轴推进牌'];

    const plan = chooseAiTreasureSwapPlan(players, 0, [1, 2], log);

    expect(plan).toMatchObject({ targetIdx: 1, canPickPublicHand: true, progressPriority: 1 });
  });

  it('对可挑选的公开手牌精确拿走推进最多的牌', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const singleAxisCard = makeZoneCard('A3', 0, { id: 'public-single-axis' });
    const dualAxisCard = makeZoneCard('C4', 0, { id: 'public-dual-axis' });
    const players = [
      makePlayer({
        name: '你',
        revealHand: true,
        pickInsteadOfRandom: true,
        hand: [singleAxisCard, dualAxisCard],
      }),
      makePlayer({
        name: 'AI寻宝者',
        role: ROLE_TREASURE,
        hp: 10,
        hand: [
          makeZoneCard('A1', 0),
          makeZoneCard('B2', 0),
          makeZoneCard('B2', 0, { id: 'duplicate-b2-public-pick' }),
        ],
      }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 1,
      phase: 'AI_TURN',
      skillUsed: false,
      restUsed: false,
      multiplyUsed: false,
      globalOnlySwapOwner: null,
      log: ['旧日志'],
    });

    const result = aiStep(gs);

    expect(result._visualEvents?.[0]).toMatchObject({ targetIdx: 0, takenCard: dualAxisCard });
    expect(result.log).toContain(`AI寻宝者（寻宝者）从 你 的公开手牌中选择了 ${cardLogText(dualAxisCard, { alwaysShowName: true })}`);
  });

  it('优先选择日志中获得可同时推进字母和数字牌的角色', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const players = [
      makePlayer({ name: '寻宝者', role: ROLE_TREASURE, hand: [makeZoneCard('A1'), makeZoneCard('B2')] }),
      makePlayer({ name: '单轴目标', hand: [makeZoneCard('D4')] }),
      makePlayer({ name: '双轴目标', hand: [makeZoneCard('A1')] }),
    ];
    const log = [
      '单轴目标 摸到 [A3] 单轴牌，选择收入手牌并触发效果',
      '双轴目标 收入了 [C4] 双轴牌',
    ];

    const plan = chooseAiTreasureSwapPlan(players, 0, [1, 2], log);

    expect(plan).toMatchObject({ targetIdx: 2, progressPriority: 2 });
  });

  it('同进度且可换出非区域牌时，优先已确认非邪祀者，其次已确认邪祀者', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const self = makePlayer({
      name: '寻宝者',
      role: ROLE_TREASURE,
      hand: [makeZoneCard('A1'), { id: 'non-zone', name: '非区域牌' }],
    });
    const players = [
      self,
      makePlayer({ name: '邪祀者', role: ROLE_CULTIST, roleRevealed: true, hand: [makeZoneCard('D4')] }),
      makePlayer({ name: '追猎者', role: ROLE_HUNTER, roleRevealed: true, hand: [makeZoneCard('A2')] }),
      makePlayer({ name: '身份未知', role: ROLE_HUNTER, roleRevealed: false, hand: [makeZoneCard('B3')] }),
    ];
    const log = [
      '邪祀者 收入了 [B2] 推进牌',
      '追猎者 收入了 [B2] 推进牌',
      '身份未知 收入了 [B2] 推进牌',
    ];

    expect(chooseAiTreasureSwapPlan(players, 0, [1, 2, 3], log).targetIdx).toBe(2);
    expect(chooseAiTreasureSwapPlan(players, 0, [1, 3], log).targetIdx).toBe(1);
  });

  it('日志没有推进线索时随机选目标，不读取隐藏手牌也不套用身份优先级', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.75);
    const self = makePlayer({
      name: '寻宝者',
      role: ROLE_TREASURE,
      hand: [makeZoneCard('A1'), { id: 'non-zone', name: '非区域牌' }],
    });
    const firstPlayers = [
      self,
      makePlayer({ name: '目标甲', role: ROLE_CULTIST, roleRevealed: true, hand: [makeZoneCard('B2')] }),
      makePlayer({ name: '目标乙', role: ROLE_HUNTER, roleRevealed: true, hand: [makeZoneCard('D4')] }),
    ];
    const secondPlayers = [
      self,
      makePlayer({ name: '目标甲', role: ROLE_HUNTER, roleRevealed: true, hand: [makeZoneCard('D4')] }),
      makePlayer({ name: '目标乙', role: ROLE_CULTIST, roleRevealed: true, hand: [makeZoneCard('B2')] }),
    ];

    expect(chooseAiTreasureSwapPlan(firstPlayers, 0, [1, 2], ['旧日志']).targetIdx).toBe(2);
    expect(chooseAiTreasureSwapPlan(secondPlayers, 0, [1, 2], ['旧日志']).targetIdx).toBe(2);
  });
});

describe('AI hand-limit discard', () => {
  it('destroys derived cards instead of putting them into discard', () => {
    const normal = { id: 'normal', name: '普通牌' };
    const goat = createBlackGoatYoungCard();
    const slime = { id: 'slime', name: '黏液', isTsathogguaSlime: true };
    const players = [makePlayer({ name: 'AI', hand: [goat, slime, normal], _nyaHandLimit: 0 })];
    const discard = [];
    const discardedCards = [];

    discardAiHandToLimit(players, 0, discard, [], [], discardedCards);

    expect(players[0].hand).toEqual([]);
    expect(discard).toEqual([normal]);
    expect(discardedCards).toEqual([goat, slime, normal]);
  });
});

describe('AI visual event handoff', () => {
  it('AI-to-AI turn transition keeps TSG end-turn resolution before the next banner log', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({
        name: '蟾蜍AI',
        role: ROLE_CULTIST,
        roleRevealed: true,
        godName: 'TSG',
        godLevel: 1,
      }),
      makePlayer({ name: '下一名AI', role: ROLE_TREASURE }),
    ];
    const gs = makeGs({
      players,
      deck: [makeZoneCard('B1', 0, { id: 'next-ai-draw' })],
      currentTurn: 1,
      phase: 'AI_TURN',
      skillUsed: true,
      log: [],
    });
    const result = aiStep(gs);
    const slimeLogIdx = result.log.findIndex(line => line.includes('获得1张撒托古亚的赐福黏液'));
    const nextTurnIdx = result.log.findIndex(line => line.includes('── 下一名AI 的回合开始 ──'));

    expect(result.currentTurn).toBe(2);
    expect(slimeLogIdx).toBeGreaterThanOrEqual(0);
    expect(slimeLogIdx).toBeLessThan(nextTurnIdx);
    expect(result._aiEndTurnReplayQueue.map(step => step.type)).toContain('CARD_TRANSFER');
  });

  it('AI-to-player transition also finishes TSG boundary events before the player banner log', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const players = [
      makePlayer({ name: '你', role: ROLE_TREASURE }),
      makePlayer({
        name: '蟾蜍AI',
        role: ROLE_CULTIST,
        roleRevealed: true,
        godName: 'TSG',
        godLevel: 1,
      }),
    ];
    const gs = makeGs({
      players,
      deck: [makeZoneCard('B1', 0, { id: 'player-draw-after-tsg' })],
      currentTurn: 1,
      phase: 'AI_TURN',
      skillUsed: true,
      log: [],
    });
    const result = aiStep(gs);
    const slimeLogIdx = result.log.findIndex(line => line.includes('获得1张撒托古亚的赐福黏液'));
    const nextTurnIdx = result.log.findIndex(line => line.includes('── 你 的回合开始 ──'));

    expect(result.currentTurn).toBe(0);
    expect(slimeLogIdx).toBeGreaterThanOrEqual(0);
    expect(slimeLogIdx).toBeLessThan(nextTurnIdx);
    expect(result._aiEndTurnReplayQueue.map(step => step.type)).toContain('CARD_TRANSFER');
  });

  it('AI CTH rest resolves its registered end-turn draw before advancing', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({
        name: '克苏鲁AI',
        role: ROLE_CULTIST,
        hp: 1,
        godName: 'CTH',
        godLevel: 1,
      }),
      makePlayer({ name: '下一名AI', role: ROLE_TREASURE }),
    ];
    const gs = makeGs({
      players,
      deck: [
        makeZoneCard('B1', 0, { id: 'next-ai-draw-after-cth' }),
        makeZoneCard('C1', 0, { id: 'cth-end-turn-draw' }),
      ],
      currentTurn: 1,
      phase: 'AI_TURN',
      log: [],
    });
    const result = aiStep(gs);
    const dreamIdx = result.log.findIndex(line => line.includes('翻面结束回合时额外摸1张牌'));
    const nextTurnIdx = result.log.findIndex(line => line.includes('── 下一名AI 的回合开始 ──'));

    expect(result.currentTurn).toBe(2);
    expect(dreamIdx).toBeGreaterThanOrEqual(0);
    expect(dreamIdx).toBeLessThan(nextTurnIdx);
    expect(result._aiEndTurnReplayQueue.map(step => step.type)).toContain('CTH_RLYEH_DREAM');
  });

  it('uses the shared registry order for TSG grant before endless corridor and next turn', () => {
    const left = makeZoneCard('B1', 0, { id: 'left-of-corridor' });
    const corridor = makeZoneCard('A3', 0, {
      id: 'corridor-order',
      name: '无尽通道',
      type: 'endTurnReplayHand',
    });
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '蟾蜍AI', godName: 'TSG', godLevel: 1, hand: [left, corridor] }),
      makePlayer({ name: '下一名AI' }),
    ];
    const gs = makeGs({ players, currentTurn: 1, phase: 'AI_TURN', log: [] });
    const result = processAiEndTurnEvents(
      gs.players.map(item => ({ ...item, hand: [...item.hand] })),
      [], [], [], 1, gs,
    );
    const types = result.replayQueue.map(step => step.type);

    expect(result.events.map(event => event.id)).toEqual(['tsgSlimeGrant', 'endTurnReplayHand']);
    expect(types.indexOf('CARD_TRANSFER')).toBeLessThan(types.indexOf('ENDLESS_CORRIDOR_TUNNEL'));
    expect(result.statePatch._tsgSlimeGrantedAtTurnEnd).toBe(true);
    expect(result.P[1].hand.some(card => card.isTsathogguaSlime)).toBe(true);
  });

  it('resolves AI CTH face-down end-turn draws before endless corridor', () => {
    const left = makeZoneCard('B1', 0, { id: 'cth-left' });
    const corridor = makeZoneCard('A3', 0, {
      id: 'cth-corridor',
      name: '无尽通道',
      type: 'endTurnReplayHand',
    });
    const draw = makeZoneCard('C1', 0, { id: 'cth-end-draw' });
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '克苏鲁AI', godName: 'CTH', godLevel: 1, isResting: true, hand: [left, corridor] }),
    ];
    const gs = makeGs({ players, deck: [draw], currentTurn: 1, phase: 'AI_TURN', log: [] });
    const result = processAiEndTurnEvents(
      gs.players.map(item => ({ ...item, hand: [...item.hand] })),
      [...gs.deck], [], [], 1, gs,
    );
    const types = result.replayQueue.map(step => step.type);

    expect(result.events.map(event => event.id)).toEqual(['cthRestDraw', 'endTurnReplayHand']);
    expect(types.indexOf('CTH_RLYEH_DREAM')).toBeLessThan(types.indexOf('ENDLESS_CORRIDOR_TUNNEL'));
    expect(result.L.some(line => line.includes('翻面结束回合时额外摸1张牌'))).toBe(true);
    expect(result.D).toHaveLength(0);
  });

  it('pauses an AI CTH rest draw before revealing a ZHU-lit top card', () => {
    const litCard = makeZoneCard('C1', 0, { id: 'cth-zhu-lit' });
    const players = [
      makePlayer({ name: '烛九阴信徒', godName: 'ZHU', godLevel: 3 }),
      makePlayer({ name: '克苏鲁AI', godName: 'CTH', godLevel: 1, isResting: true }),
    ];
    const zhuLight = { ownerIdx: 0, level: 3, cardIds: [litCard.id], lightNonce: 1 };
    const gs = makeGs({ players, deck: [litCard], currentTurn: 1, phase: 'AI_TURN', zhuLight, log: [] });

    const result = processAiEndTurnEvents(
      gs.players.map(player => ({ ...player, hand: [...player.hand] })),
      [...gs.deck],
      [],
      [],
      1,
      gs,
    );

    expect(result.decision).toMatchObject({
      phase: 'ZHU_HIDE_AI_DRAW',
      abilityData: {
        drawerIdx: 1,
        fromRest: true,
        cthDrawsRemaining: 1,
        zhuGuard: { card: litCard, ownerIdx: 0 },
      },
    });
    expect(result.D).toEqual([litCard]);
    expect(result.P[1].hand).not.toContain(litCard);
    expect(result.replayQueue.map(step => step.type)).toEqual(['CTH_RLYEH_DREAM']);
  });

  it('AI CTH rest draw defers 穴居人战争 and preserves remaining draws', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const duelCard = makeZoneCard('D2', 0, { id: 'cth-duel' });
    const followUpCard = makeZoneCard('B1', 0, { id: 'cth-followup' });
    const sourceHandCard = makeZoneCard('A1', 0, { id: 'source-hand' });
    const targetHandCard = makeZoneCard('A2', 0, { id: 'target-hand' });
    const players = [
      makePlayer({ name: '你', hand: [] }),
      makePlayer({ name: '克苏鲁AI', godName: 'CTH', godLevel: 2, isResting: true, hand: [sourceHandCard] }),
      makePlayer({ name: '目标AI', hand: [targetHandCard] }),
    ];
    const gs = makeGs({ players, deck: [duelCard, followUpCard], currentTurn: 1, phase: 'AI_TURN', log: [] });
    const result = processAiEndTurnEvents(
      gs.players.map(p => ({ ...p, hand: [...p.hand] })),
      [...gs.deck], [], [], 1, gs,
    );

    expect(result.decision).toBeTruthy();
    expect(result.decision.phase).toBe('CAVE_DUEL_SELECT_TARGET');
    expect(result.decision.abilityData).toMatchObject({
      fromRest: true,
      cthDrawsRemaining: 1,
      caveDuelSource: 1,
    });
    expect(result.decision.abilityData.caveDuelTargets).toEqual([2]);
    // 穴居人战争已收入手牌，但第二张 CTH 摸牌尚未抽取
    expect(result.P[1].hand.some(card => card.id === 'cth-duel')).toBe(true);
    expect(result.P[1].hand.some(card => card.id === 'cth-followup')).toBe(false);
    expect(result.D.map(card => card.id)).toEqual(['cth-followup']);
  });

  it('continueAiCthRestDraws resumes the remaining CTH draw before advancing', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const followUpCard = makeZoneCard('B1', 0, { id: 'cth-followup' });
    const players = [
      makePlayer({ name: '你', hand: [] }),
      makePlayer({ name: '克苏鲁AI', godName: 'CTH', godLevel: 2, isResting: true, hand: [] }),
      makePlayer({ name: '目标AI', hand: [] }),
    ];
    // 决策前已经播放过的回合结束回放片段，续跑不应再携带（避免重复播放）
    const playedDreamStep = { type: 'CTH_RLYEH_DREAM', targetPid: 1 };
    const playedCardStep = { type: 'DRAW_CARD', card: { id: 'already-played' } };
    const gs = makeGs({
      players,
      deck: [followUpCard],
      currentTurn: 1,
      phase: 'AI_TURN',
      abilityData: { fromRest: true, cthDrawsRemaining: 1 },
      log: [],
      _aiEndTurnReplayQueue: [playedDreamStep, playedCardStep],
      _aiEndTurnReplayMsgs: ['已播放的旧日志'],
    });
    const result = continueAiCthRestDraws(gs, { allAi: true });

    // 剩余的那张梦访拉莱耶牌由克苏鲁AI在续跑中摸走（而非留给下一回合的角色）
    expect(result.log.some(line => (
      typeof line === 'string' && line.includes('克苏鲁AI 摸到') && line.includes(followUpCard.key)
    ))).toBe(true);
    expect(result.currentTurn).not.toBe(1);
    // 续跑只携带决策之后的回放，不重复携带已播放的片段
    expect(result._aiEndTurnReplayQueue || []).not.toContain(playedDreamStep);
    expect(result._aiEndTurnReplayQueue || []).not.toContain(playedCardStep);
    expect(result._aiEndTurnReplayMsgs || []).not.toContain('已播放的旧日志');
    // 行动动画的结束快照落在下一回合起手摸牌之前
    expect(Array.isArray(result._playersBeforeNextDraw)).toBe(true);
    expect(result._playersBeforeNextDraw[0].name).toBe('你');
  });

  it('does not restore a consumed earthquake after the next-turn state clears visual events', () => {
    const earthquake = {
      id: 'earthquake:previous-turn',
      type: 'cardEffect',
      effectKey: 'earthquake',
      card: { id: 'quake', name: '地动山摇', key: 'B2', type: 'allDiscard' },
    };
    const gs = makeGs({
      players: [
        makePlayer({ name: '你', role: ROLE_HUNTER }),
        makePlayer({ name: '贝拉', role: ROLE_HUNTER, hand: [] }),
      ],
      currentTurn: 1,
      phase: 'AI_TURN',
      skillUsed: true,
      deck: [makeZoneCard('A2', 0)],
      _visualEvents: [earthquake],
    });

    const result = aiStep(gs);

    expect(result._visualEvents || []).not.toContainEqual(
      expect.objectContaining({ id: earthquake.id }),
    );
  });
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

  it('满血追猎者会收入用于压血和补充追捕弹药的活火山', () => {
    const card = {
      id: 'volcano-pressure', key: 'C1', name: '活火山', type: 'allDamageHP', val: 4,
      isZone: true, letter: 'C', number: 1, polarity: 'negative',
    };
    const players = [
      makePlayer({ name: '艾伦', role: ROLE_TREASURE, hp: 10, hand: [{ letter: 'C' }] }),
      makePlayer({ name: '卡洛斯', role: ROLE_HUNTER, hp: 10, san: 10, hand: [] }),
      makePlayer({ name: '贝拉', role: ROLE_CULTIST, hp: 10, hand: [{ number: 1 }] }),
      makePlayer({ name: '黛安娜', role: ROLE_TREASURE, hp: 10 }),
    ];

    expect(aiShouldKeepZoneCard(card, 1, players)).toBe(true);
  });

  it('状态健康且缺少追捕弹药时，追猎者会接受轻度单体自伤牌', () => {
    const card = {
      id: 'healthy-self-damage', key: 'A2', name: '轻度自伤', type: 'selfDamageHP', val: 2,
      isZone: true, letter: 'A', number: 2, polarity: 'negative',
    };
    const players = [
      makePlayer({ name: '艾伦', role: ROLE_TREASURE }),
      makePlayer({ name: '卡洛斯', role: ROLE_HUNTER, hp: 10, san: 10, hand: [{ id: 'ammo' }] }),
      makePlayer({ name: '贝拉', role: ROLE_CULTIST }),
    ];

    expect(aiShouldKeepZoneCard(card, 1, players)).toBe(true);
  });

  it('满血追猎者有四张区域牌时仍会用1HP收入新的追捕弹药', () => {
    const thornyRoad = makeZoneCard('D2', 0, {
      name: '荆棘山路', type: 'selfDamageHP', val: 1, polarity: 'negative',
    });
    const players = [
      makePlayer({ name: '你', role: ROLE_TREASURE }),
      makePlayer({
        name: '艾伦', role: ROLE_HUNTER, hp: 10, san: 10,
        hand: [makeZoneCard('A1'), makeZoneCard('B2'), makeZoneCard('C3'), makeZoneCard('D4')],
      }),
      makePlayer({ name: '贝拉', role: ROLE_CULTIST }),
    ];

    expect(aiShouldKeepZoneCard(thornyRoad, 1, players)).toBe(true);
  });

  it('低血追猎者不会为了追捕弹药收入荆棘山路', () => {
    const thornyRoad = makeZoneCard('D2', 0, {
      name: '荆棘山路', type: 'selfDamageHP', val: 1, polarity: 'negative',
    });
    const players = [
      makePlayer({ name: '你', role: ROLE_TREASURE }),
      makePlayer({
        name: '艾伦', role: ROLE_HUNTER, hp: 4, san: 10,
        hand: [makeZoneCard('A1'), makeZoneCard('B2'), makeZoneCard('C3'), makeZoneCard('D4')],
      }),
      makePlayer({ name: '贝拉', role: ROLE_CULTIST }),
    ];

    expect(aiShouldKeepZoneCard(thornyRoad, 1, players)).toBe(false);
  });

  it('邪神牌和衍生牌不会虚增追猎者的区域弹药库存', () => {
    const thornyRoad = makeZoneCard('D2', 0, {
      name: '荆棘山路', type: 'selfDamageHP', val: 1, polarity: 'negative',
    });
    const players = [
      makePlayer({ name: '你', role: ROLE_TREASURE }),
      makePlayer({
        name: '艾伦', role: ROLE_HUNTER, hp: 10, san: 10,
        hand: [
          makeGodCard({ name: '烛九阴' }),
          createBlackGoatYoungCard(),
          { id: 'slime', name: '黏液', isTsathogguaSlime: true },
          makeGodCard({ name: '森之领主' }),
        ],
      }),
      makePlayer({ name: '贝拉', role: ROLE_CULTIST }),
    ];

    expect(aiShouldKeepZoneCard(thornyRoad, 1, players)).toBe(true);
  });

  it('不同身份按新规则评估增殖的Z', () => {
    const card = {
      id: 'z-card',
      key: 'B1',
      name: '增殖的Z',
      type: 'proliferatingZ',
      isZone: true,
      letter: 'B',
      number: 1,
      polarity: 'positive',
    };
    const players = [
      makePlayer({ name: '你', hand: [] }),
      makePlayer({ name: '邪祀者', role: ROLE_CULTIST, hand: [] }),
      makePlayer({ name: '寻宝者', role: ROLE_TREASURE, hand: [] }),
      makePlayer({ name: '追猎者', role: ROLE_HUNTER, hand: [createBlackGoatYoungCard()] }),
    ];

    expect(aiShouldKeepZoneCard(card, 1, players)).toBe(true);
    expect(aiShouldKeepZoneCard(card, 2, players)).toBe(true);
    expect(aiShouldKeepZoneCard(card, 3, players)).toBe(true);
  });

  it('满状态邪祀者会弃置没有实际收益的低风险牌', () => {
    const card = {
      id: 'heal-hp',
      key: 'A1',
      name: '温暖营火',
      type: 'selfHealHP',
      val: 2,
      isZone: true,
      letter: 'A',
      number: 1,
      polarity: 'positive',
    };
    const players = [
      makePlayer({ name: '你', hp: 8, san: 8 }),
      makePlayer({
        name: '邪祀者',
        role: ROLE_CULTIST,
        hp: 10,
        san: 10,
        hand: [makeZoneCard('B2', 0), makeZoneCard('C3', 0)],
      }),
    ];

    expect(aiShouldKeepZoneCard(card, 1, players)).toBe(false);
  });

  it('弃牌堆有邪神牌时邪祀者会收入掘墓', () => {
    const card = {
      id: 'grave-dig',
      key: 'A4',
      name: '掘墓',
      type: 'graveDigGod',
      isZone: true,
      letter: 'A',
      number: 4,
      polarity: 'positive',
    };
    const players = [
      makePlayer({ name: '你', hp: 8, san: 8 }),
      makePlayer({
        name: '邪祀者',
        role: ROLE_CULTIST,
        hp: 10,
        san: 10,
        hand: [],
      }),
    ];

    expect(aiShouldKeepZoneCard(card, 1, players, false, { discard: [makeGodCard('NYA')] })).toBe(true);
  });

  it('弃牌堆没有邪神牌时邪祀者不会空收掘墓', () => {
    const card = {
      id: 'grave-dig',
      key: 'A4',
      name: '掘墓',
      type: 'graveDigGod',
      isZone: true,
      letter: 'A',
      number: 4,
      polarity: 'positive',
    };
    const players = [
      makePlayer({ name: '你', hp: 8, san: 8 }),
      makePlayer({
        name: '邪祀者',
        role: ROLE_CULTIST,
        hp: 10,
        san: 10,
        hand: [],
      }),
    ];

    expect(aiShouldKeepZoneCard(card, 1, players, false, { discard: [makeZoneCard('B2', 0)] })).toBe(false);
  });

  it('寻宝者和追猎者会收入无实际治疗收益但能保留手牌价值的低风险牌', () => {
    const card = {
      id: 'heal-hp',
      key: 'A1',
      name: '温暖营火',
      type: 'selfHealHP',
      val: 2,
      isZone: true,
      letter: 'A',
      number: 1,
      polarity: 'positive',
    };
    const players = [
      makePlayer({
        name: '寻宝者',
        role: ROLE_TREASURE,
        hp: 10,
        san: 10,
        hand: [makeZoneCard('B2', 0), makeZoneCard('C3', 0)],
      }),
      makePlayer({
        name: '追猎者',
        role: ROLE_HUNTER,
        hp: 10,
        san: 10,
        hand: [makeZoneCard('B2', 0), makeZoneCard('C3', 0)],
      }),
    ];

    expect(aiShouldKeepZoneCard(card, 0, players)).toBe(true);
    expect(aiShouldKeepZoneCard(card, 1, players)).toBe(true);
  });

  it('满 HP AI 不会仅为手牌价值收入会公开手牌的荧光苔藓', () => {
    const card = makeZoneCard('A3', 0);
    const players = [
      makePlayer({ name: '你', hp: 8, san: 8 }),
      makePlayer({
        name: '追猎者',
        role: ROLE_HUNTER,
        hp: 10,
        san: 10,
        hand: [makeZoneCard('B2', 0), makeZoneCard('C3', 0)],
      }),
      makePlayer({ name: '寻宝者', role: ROLE_TREASURE, hp: 10, san: 10, hand: [makeZoneCard('B1', 0)] }),
    ];

    expect(aiShouldKeepZoneCard(card, 1, players)).toBe(false);
    expect(aiShouldKeepZoneCard(card, 2, players)).toBe(false);
  });

  it('低 HP AI 仍会收入荧光苔藓来恢复 HP 至 8', () => {
    const card = makeZoneCard('A3', 0);
    const players = [
      makePlayer({ name: '你', hp: 8, san: 8 }),
      makePlayer({
        name: '追猎者',
        role: ROLE_HUNTER,
        hp: 3,
        san: 10,
        hand: [makeZoneCard('B2', 0), makeZoneCard('C3', 0)],
      }),
      makePlayer({ name: '寻宝者', role: ROLE_TREASURE, hp: 3, san: 10, hand: [makeZoneCard('B1', 0)] }),
    ];

    expect(aiShouldKeepZoneCard(card, 1, players)).toBe(true);
    expect(aiShouldKeepZoneCard(card, 2, players)).toBe(true);
  });

  it('寻宝者血线安全时会为了补编号收入轻微负面牌', () => {
    const card = {
      id: 'risky-axis',
      key: 'A1',
      name: '擦伤通道',
      type: 'selfDamageHP',
      val: 1,
      isZone: true,
      letter: 'A',
      number: 1,
      polarity: 'negative',
    };
    const players = [
      makePlayer({
        name: '寻宝者',
        role: ROLE_TREASURE,
        hp: 10,
        san: 10,
        hand: [makeZoneCard('B2', 0), makeZoneCard('C3', 0)],
      }),
      makePlayer({ name: '艾伦', hp: 10, san: 10 }),
    ];

    expect(aiShouldKeepZoneCard(card, 0, players)).toBe(true);
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
  it('斯芬克斯结果只归属无尽通道中的 D4 子事务', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const legion = makeZoneCard('A2', 0, { id: 'diana-legion' });
    const sphinx = makeZoneCard('D4', 4, { id: 'diana-sphinx' });
    const corridor = makeZoneCard('A3', 3, { id: 'diana-corridor' });
    const claustrophobia = makeZoneCard('B1', 0, { id: 'diana-claustrophobia' });
    const prize = makeZoneCard('A1', 0, { id: 'sphinx-prize' });
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({
        name: '黛安娜',
        role: ROLE_TREASURE,
        hand: [legion, sphinx, corridor, claustrophobia],
      }),
    ];
    const gs = makeGs({ players, deck: [prize], currentTurn: 1, phase: 'AI_TURN', log: [] });

    const result = processAiEndTurnReplayHand(
      gs.players.map(player => ({ ...player, hand: [...player.hand] })),
      [...gs.deck],
      [],
      [],
      1,
      gs,
    );
    const sphinxEvent = (result.statePatch._visualEvents || [])
      .find(event => event?.type === 'sphinxResult');
    const ownedIds = new Set(getAnimationQueueVisualEventIds(result.replayQueue));
    const tunnelIndex = result.replayQueue.findIndex(step => step.type === 'ENDLESS_CORRIDOR_TUNNEL');
    const corridorD4Index = result.replayQueue.findIndex(step => step.type === 'DRAW_CARD' && step.card?.id === sphinx.id);
    const resultIndex = result.replayQueue.findIndex(step => step.visualEventId === sphinxEvent?.id);

    expect(sphinxEvent).toBeTruthy();
    expect(ownedIds.has(sphinxEvent.id)).toBe(true);
    expect(tunnelIndex).toBeLessThan(corridorD4Index);
    expect(corridorD4Index).toBeLessThan(resultIndex);
    expect(scopeAiActionReplayMetadata({
      _visualEvents: [sphinxEvent],
      _statEvents: result.statePatch._statEvents || [],
    }, {
      excludedVisualEventIds: ownedIds,
    }).visualEvents).toEqual([]);
  });

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
    const incomeIdx = types.indexOf('CARD_TRANSFER', 4);
    const healIdx = types.indexOf('SAN_HEAL');
    expect(incomeIdx).toBeGreaterThan(4);
    expect(healIdx).toBeGreaterThan(incomeIdx);
    expect(types.lastIndexOf('STATE_PATCH')).toBeGreaterThan(types.indexOf('SAN_HEAL'));
    expect(result.replayQueue[0].msgs).toEqual([expect.stringContaining('【无尽通道】艾伦 展示所有手牌')]);
  });

  it('为连续弃牌保留逐步状态快照，不让后续结算污染前一帧', () => {
    const discardA = {
      id: 'discard-a', key: 'C2', name: '惊扰蝙蝠', type: 'selfDamageHP', val: 1,
      isZone: true, letter: 'C', number: 2, polarity: 'negative',
    };
    const discardB = {
      id: 'discard-b', key: 'D3', name: '鼠群', type: 'selfDamageHP', val: 1,
      isZone: true, letter: 'D', number: 3, polarity: 'negative',
    };
    const corridor = {
      id: 'corridor', key: 'A3', name: '无尽通道', type: 'endTurnReplayHand',
      isZone: true, letter: 'A', number: 3,
    };
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '卡洛斯', role: ROLE_TREASURE, hand: [discardA, discardB, corridor] }),
    ];
    const gs = makeGs({ players, currentTurn: 1, phase: 'AI_TURN', log: [] });

    const result = processAiEndTurnReplayHand(
      gs.players.map(player => ({ ...player, hand: [...(player.hand || [])] })),
      [], [], [], 1, gs
    );
    const discardPatches = result.replayQueue.filter((step, index, queue) => (
      step.type === 'STATE_PATCH' && queue[index - 1]?.type === 'DISCARD'
    ));

    expect(discardPatches).toHaveLength(2);
    expect(discardPatches[0].discard.map(card => card.id)).toEqual(['discard-a']);
    expect(discardPatches[0].players[1].hand.map(card => card.id)).toEqual(['discard-b', 'corridor']);
    expect(discardPatches[1].discard.map(card => card.id)).toEqual(['discard-a', 'discard-b']);
    expect(discardPatches[1].players[1].hand.map(card => card.id)).toEqual(['corridor']);
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

  it('未揭晓的追猎者仍可能被当作目标，揭晓后会被排除', () => {
    const players = [
      makePlayer({ name: '追猎者', role: ROLE_HUNTER, roleRevealed: true, hand: [makeZoneCard('A1', 0)] }),
      makePlayer({ name: '隐藏队友', role: ROLE_HUNTER, roleRevealed: false, hand: [makeZoneCard('B1', 0)] }),
      makePlayer({ name: '已亮队友', role: ROLE_HUNTER, roleRevealed: true, hand: [makeZoneCard('C1', 0)] }),
      makePlayer({ name: '隐藏目标', role: ROLE_TREASURE, roleRevealed: false, hand: [makeZoneCard('D1', 0)] }),
    ];

    expect(getHunterChaseTargets(players, 0).map(target => target.idx)).toEqual([1, 3]);
  });
});

describe('hunter chase hand quality and target focus', () => {
  it('区域牌充足时适合追捕，近期同结构失败过多时降为低质量', () => {
    const zoneA = makeZoneCard('A1', 0, { id: 'zone-a' });
    const zoneB = makeZoneCard('B1', 0, { id: 'zone-b' });
    const players = [
      makePlayer({
        name: '追猎者',
        role: ROLE_HUNTER,
        hand: [zoneA, zoneB, createBlackGoatYoungCard()],
      }),
      makePlayer({ name: '目标', hand: [makeZoneCard('C1', 0)] }),
    ];
    const gs = makeGs({ players, turn: 5 });

    expect(evaluateHunterChaseHandQuality(gs, players, 0).suitable).toBe(true);

    players[0].huntQualityMemory = {
      turn: 5,
      handIds: ['zone-a', 'zone-b'],
      handSize: 3,
      failedChainCount: 2,
    };
    expect(evaluateHunterChaseHandQuality(gs, players, 0).suitable).toBe(false);

    players[0].hand = [
      makeZoneCard('C1', 0, { id: 'zone-c' }),
      makeZoneCard('D1', 0, { id: 'zone-d' }),
    ];
    expect(evaluateHunterChaseHandQuality(gs, players, 0).suitable).toBe(true);
  });

  it('手牌质量适合且有人受伤时必定追捕', () => {
    const players = [
      makePlayer({
        name: '追猎者',
        role: ROLE_HUNTER,
        hand: [makeZoneCard('A1', 0), makeZoneCard('B1', 0)],
      }),
      makePlayer({ name: '受伤目标', hp: 8, hand: [makeZoneCard('C1', 0)] }),
    ];
    const decision = decideAiSkillUsage(
      makeGs({ players, currentTurn: 0 }),
      players,
      0,
      ROLE_HUNTER,
      getHunterChaseTargets(players, 0),
    );

    expect(decision.hunterHandQuality.suitable).toBe(true);
    expect(decision.forceHunterChase).toBe(true);
    expect(decision.shouldHunterUseSkill).toBe(true);
  });

  it('身份安全时集中攻击最低HP目标，身份不明时向高HP目标分摊', () => {
    const hunter = makePlayer({ name: '追猎者', role: ROLE_HUNTER, roleRevealed: true });
    const revealedLow = makePlayer({ name: '亮明低HP', role: ROLE_TREASURE, roleRevealed: true, hp: 3 });
    const revealedHigh = makePlayer({ name: '亮明高HP', role: ROLE_CULTIST, roleRevealed: true, hp: 8 });
    const hiddenMid = makePlayer({ name: '隐藏身份', role: ROLE_TREASURE, roleRevealed: false, hp: 6 });
    const players = [hunter, revealedHigh, hiddenMid, revealedLow, makePlayer({ name: '隐藏队友', role: ROLE_HUNTER, roleRevealed: false, hp: 10 })];
    const targets = players.slice(1).map((player, offset) => ({ player, idx: offset + 1 }));

    expect(orderHunterChaseTargets(players, 0, targets, () => 0.5).map(target => target.idx)).toEqual([3, 1]);

    players[1].roleRevealed = false;
    players[3].roleRevealed = false;
    expect(orderHunterChaseTargets(players, 0, targets, () => 0.5)[0].player.hp).toBe(10);
  });

  it('追猎者人数上限均已揭晓后，把剩余隐藏目标视为安全并集中火力', () => {
    const players = [
      makePlayer({ name: '追猎者A', role: ROLE_HUNTER, roleRevealed: true }),
      makePlayer({ name: '追猎者B', role: ROLE_HUNTER, roleRevealed: true }),
      makePlayer({ name: '隐藏低HP', role: ROLE_TREASURE, roleRevealed: false, hp: 2 }),
      makePlayer({ name: '隐藏高HP', role: ROLE_CULTIST, roleRevealed: false, hp: 9 }),
      makePlayer({ name: '隐藏中HP', role: ROLE_TREASURE, roleRevealed: false, hp: 6 }),
    ];
    const targets = [2, 3, 4].map(idx => ({ player: players[idx], idx }));

    expect(orderHunterChaseTargets(players, 0, targets, () => 0.5).map(target => target.idx)).toEqual([2, 4, 3]);
  });
});

describe('aiStep optional action limits', () => {
  it('1HP 追猎者即使随机判定很高也会选择休息', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const hunter = makePlayer({
      name: '贝拉',
      role: ROLE_HUNTER,
      hp: 1,
      san: 8,
      hand: [
        makeZoneCard('A1', 0),
        makeZoneCard('B1', 0),
        makeZoneCard('C1', 0),
        makeZoneCard('D1', 0),
      ],
    });
    const gs = makeGs({
      players: [makePlayer({ name: '你' }), hunter],
      currentTurn: 1,
      phase: 'AI_TURN',
      skillUsed: false,
      restUsed: false,
      multiplyUsed: false,
    });

    expect(shouldAiRest(gs, hunter, ROLE_HUNTER)).toBe(true);
  });

  it('低HP追猎者在优质手牌且有人受伤时跳过休息并必定追捕', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const players = [
      makePlayer({
        name: '你',
        role: ROLE_TREASURE,
        hp: 7,
        hand: [makeZoneCard('A1', 0)],
      }),
      makePlayer({
        name: '贝拉',
        role: ROLE_HUNTER,
        hp: 3,
        hand: [makeZoneCard('A2', 0), makeZoneCard('B1', 0)],
      }),
      makePlayer({
        name: '卡洛斯',
        role: ROLE_CULTIST,
        hp: 10,
        hand: [makeZoneCard('C1', 0)],
      }),
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

    expect(newLogs.some(line => line.includes('选择【休息】'))).toBe(false);
    expect(newLogs.some(line => line.includes('【追捕】'))).toBe(true);
  });

  it('AI追捕进入虚化决策前保留完整追捕事件与成品队列', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const hunterCard = makeZoneCard('B1', 0, { id: 'hunter-b1' });
    const reserveCard = makeZoneCard('A2', 0, { id: 'hunter-a2' });
    const targetCard = makeZoneCard('C1', 0, { id: 'target-c1' });
    const players = [
      makePlayer({ name: '你', role: ROLE_TREASURE, hp: 10, hand: [] }),
      makePlayer({ name: '黛安娜', role: ROLE_HUNTER, roleRevealed: true, hp: 3, hand: [hunterCard, reserveCard] }),
      makePlayer({ name: '贝拉', role: ROLE_CULTIST, roleRevealed: true, hp: 7, etherealizeStacks: 1, hand: [targetCard] }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 1,
      phase: 'AI_TURN',
      skillUsed: false,
      restUsed: false,
      multiplyUsed: false,
      apophisNight: { active: true, count: 0, limit: 12, threshold: 2 },
      _apophisTargetSeq: 0,
      _visualEvents: [],
      log: ['旧日志'],
    });

    const result = aiStep(gs, { allAi: true });
    expect(result.phase).toBe('ETHEREALIZE_DECISION');
    expect(result._aiHuntEvents).toHaveLength(1);
    expect(result._visualEvents?.filter(event => event.type === 'huntResult')).toHaveLength(1);
    const rawHunt = result._aiHuntEvents[0];
    const apophisEvent = result._visualEvents.find(event => event.type === 'apophisTarget');
    const huntEvent = result._visualEvents.find(event => event.type === 'huntResult');
    expect(rawHunt).toMatchObject({
      attemptId: expect.any(String),
      phaseGroupId: expect.any(String),
      targetResolutionEventId: apophisEvent.id,
    });
    expect(apophisEvent.phaseGroupId).toBe(rawHunt.attemptId);
    expect(huntEvent).toMatchObject({
      attemptId: rawHunt.attemptId,
      phaseGroupId: rawHunt.attemptId,
      targetResolutionEventId: apophisEvent.id,
    });
    expect(rawHunt).not.toHaveProperty('apophisTargetEvent');
    expect(huntEvent).not.toHaveProperty('apophisTargetEvent');

    const presentation = buildOwnedAiHuntEventQueue({
      rawHuntEvents: result._aiHuntEvents,
      state: result,
      actorName: '黛安娜',
    });
    const types = presentation.queue.map(step => step.type);
    expect(presentation.targetEventIds).toEqual([apophisEvent.id]);
    expect(presentation.eventIds).toEqual(expect.arrayContaining([apophisEvent.id, huntEvent.id]));
    expect(types.indexOf('SKILL_HUNT')).toBeGreaterThanOrEqual(0);
    expect(types.indexOf('HUNT_REVEAL_CARD')).toBeGreaterThan(types.indexOf('SKILL_HUNT'));
    expect(types.indexOf('DISCARD')).toBeGreaterThan(types.indexOf('HUNT_REVEAL_CARD'));
    expect(getAiActionQueueCoverage(
      result,
      presentation.queue,
      queue => getVisualEventIdsCoveredByAnimationQueue(result, queue),
    ).uncoveredEventIds).toEqual([]);
  });

  it('追捕条件不足且不需休息时，把黑山羊幼仔繁衍给低HP高SAN目标', () => {
    const players = [
      makePlayer({
        name: '追猎者',
        role: ROLE_HUNTER,
        roleRevealed: true,
        hp: 8,
        hand: [createBlackGoatYoungCard(), makeZoneCard('A1', 0)],
      }),
      makePlayer({ name: '低HP低SAN', hp: 4, san: 4, hand: [makeZoneCard('B1', 0)] }),
      makePlayer({ name: '低HP高SAN', hp: 4, san: 9, hand: [makeZoneCard('C1', 0)] }),
      makePlayer({ name: '高HP', hp: 7, san: 10, hand: [makeZoneCard('D1', 0)] }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 0,
      phase: 'AI_TURN',
      skillUsed: false,
      restUsed: false,
      multiplyUsed: false,
      log: ['旧日志'],
    });

    const result = aiStep(gs, { allAi: true });

    expect(result.log.some(line => line.includes('【繁衍】追猎者 将黑山羊幼仔传播给了 低HP高SAN'))).toBe(true);
  });

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

  it('1HP 寻宝者因可掉包而跳过休息时必须实际执行掉包', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const players = [
      makePlayer({
        name: '你',
        hp: 10,
        hand: [makeZoneCard('D3', 0)],
      }),
      makePlayer({
        name: '贝拉',
        role: ROLE_TREASURE,
        roleRevealed: false,
        hp: 1,
        san: 8,
        hand: [
          makeZoneCard('A1', 0),
          makeZoneCard('B2', 0),
          makeZoneCard('C3', 0),
          makeZoneCard('C4', 0),
        ],
      }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 1,
      phase: 'AI_TURN',
      skillUsed: false,
      restUsed: false,
      multiplyUsed: false,
      log: ['你 摸到 [D3] 已公开的推进牌，选择收入手牌并触发效果'],
    });

    const result = aiStep(gs);
    const newLogs = result.log.slice(gs.log.length);

    expect(newLogs.some(line => line.includes('贝拉对 你 【掉包】'))).toBe(true);
    expect(newLogs.some(line => line.includes('贝拉 未使用技能，结束回合'))).toBe(false);
    expect(newLogs.some(line => line.includes('贝拉 选择【休息】'))).toBe(false);
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

  it('1HP 邪祀者在无法通过蛊惑立即击败任何人时必须休息', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const players = [
      makePlayer({ name: '你', hp: 10, san: 10 }),
      makePlayer({
        name: '贝拉',
        role: ROLE_CULTIST,
        roleRevealed: false,
        hp: 1,
        san: 8,
        hand: [
          makeZoneCard('A1', 0),
          makeZoneCard('B1', 0),
          makeZoneCard('C1', 0),
          makeZoneCard('D1', 0),
        ],
      }),
      makePlayer({ name: '卡洛斯', hp: 8, san: 9 }),
      makePlayer({ name: '黛安娜', hp: 10, san: 9 }),
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
    expect(newLogs.some(line => line.includes('贝拉 未使用技能，结束回合'))).toBe(false);
  });

  it('AI 新回合摸牌弃置后会清除上一回合的技能标志，允许低血量邪祀者休息', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const players = [
      makePlayer({ name: '艾伦', role: ROLE_HUNTER, hp: 8, san: 10 }),
      makePlayer({
        name: '贝拉',
        role: ROLE_CULTIST,
        roleRevealed: false,
        hp: 1,
        san: 8,
        hand: [
          makeZoneCard('A1', 0),
          makeZoneCard('B1', 0),
          makeZoneCard('C1', 0),
          makeZoneCard('D1', 0),
        ],
      }),
      makePlayer({ name: '卡洛斯', hp: 8, san: 9 }),
      makePlayer({ name: '黛安娜', hp: 10, san: 9 }),
    ];
    const previousGs = makeGs({
      players,
      deck: [makeZoneCard('D4', 0)],
      currentTurn: 0,
      phase: 'AI_TURN',
      skillUsed: true,
      restUsed: false,
      multiplyUsed: false,
      log: ['旧日志'],
    });

    const bellaTurn = startNextTurn(previousGs);
    expect(bellaTurn.currentTurn).toBe(1);
    expect(bellaTurn.skillUsed).toBe(false);
    expect(bellaTurn.restUsed).toBe(false);

    const result = aiStep(bellaTurn);
    const newLogs = result.log.slice(bellaTurn.log.length);
    expect(newLogs.some(line => line.includes('贝拉 选择【休息】'))).toBe(true);
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
    expect(result._visualEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'bewitchGift',
        sourceIdx: 1,
        targetIdx: 0,
        card: gift,
        msgs: ['贝拉（邪祀者）对 你 【蛊惑】，赠予 [B3] 窒息矿坑'],
      }),
    ]));
  });

  it('AI 邪祀者蛊惑邪神牌时目标会被强制信仰而不是按遭遇策略放弃', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.99).mockReturnValue(0);
    const shu = makeGodCard('SHU');
    const players = [
      makePlayer({ name: '你', role: ROLE_TREASURE, hp: 10, san: 8, godName: null, godLevel: 0, godZone: [] }),
      makePlayer({
        name: '贝拉',
        role: ROLE_CULTIST,
        roleRevealed: true,
        hp: 10,
        san: 10,
        hand: [shu],
      }),
      makePlayer({ name: '卡洛斯', role: ROLE_HUNTER, hp: 10, san: 10 }),
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

    expect(newLogs).toEqual(expect.arrayContaining([
      '贝拉（邪祀者）对 你 【蛊惑】，赠予 森之领主',
      '你 信仰了 森之领主，获得黑暗子嗣(Lv.1)',
    ]));
    expect(newLogs.some(line => line.includes('放弃了邪神的馈赠'))).toBe(false);
    expect(result.players[0]).toMatchObject({ godName: 'SHU', godLevel: 1 });
    expect(result.phase).toBe('SHU_SELECT_TARGET');
    expect(result.abilityData).toMatchObject({
      shuChooserIdx: 0,
      shuOffspringCount: 1,
      _turnOwner: 1,
    });
    expect(result.players.some(player => player.hand.some(card => card.isBlackGoatYoung))).toBe(false);
    const bewitchEvent = result._visualEvents.find(event => event.type === 'bewitchGift');
    expect(bewitchEvent?.encounterState?.players?.[0]).toMatchObject({
      godName: null,
      godLevel: 0,
    });
    expect(bewitchEvent?.encounterState?.log).toEqual(expect.arrayContaining([
      expect.stringContaining('遭遇邪神 森之领主'),
    ]));
    expect(bewitchEvent?.encounterState?.log.some(line => line.includes('信仰了 森之领主'))).toBe(false);
  });

  it('AI 黑夜蛊惑跨回合后保留 action-owned 目标与信仰抢夺事务', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.99)
      .mockReturnValue(0);
    const oldApo = makeGodCard('APO', { id: 'old-apo-follower' });
    const giftedApo = makeGodCard('APO', { id: 'gifted-apo' });
    const players = [
      makePlayer({ name: '你', role: ROLE_TREASURE, san: 10, godName: 'APO', godLevel: 1, godZone: [oldApo] }),
      makePlayer({ name: '艾伦', role: ROLE_CULTIST, roleRevealed: true, hand: [giftedApo] }),
      makePlayer({ name: '贝拉', role: ROLE_HUNTER, hand: [makeZoneCard('A1')] }),
      makePlayer({ name: '黛安娜', role: ROLE_TREASURE, hand: [makeZoneCard('A2')] }),
    ];
    const gs = makeGs({
      players,
      deck: [makeZoneCard('B1'), makeZoneCard('B2')],
      currentTurn: 1,
      phase: 'AI_TURN',
      skillUsed: false,
      restUsed: false,
      multiplyUsed: false,
      apophisNight: { active: true, count: 0, limit: 12, threshold: 2 },
      _apophisTargetSeq: 0,
      _visualEvents: [],
      log: [],
    });

    const result = aiStep(gs);
    const actionEvents = result._visualEvents
      .filter(event => !event?.turnStartStage)
      .sort((left, right) => left.order - right.order);
    const apophisEvent = actionEvents.find(event => event.type === 'apophisTarget');
    const bewitchEvent = actionEvents.find(event => event.type === 'bewitchGift');
    const faithEvent = actionEvents.find(event => event.type === 'godStatusChanged');

    expect(result._apophisTargetEvent).toBeNull();
    expect(actionEvents.map(event => event.type).slice(0, 3)).toEqual([
      'apophisTarget',
      'bewitchGift',
      'godStatusChanged',
    ]);
    expect(apophisEvent).toMatchObject({ legacySeq: 1, changed: true, targetIdx: 3, transactionId: expect.any(String) });
    expect(bewitchEvent).toMatchObject({ sourceIdx: 1, targetIdx: 3, transactionId: apophisEvent.transactionId });
    expect(faithEvent?.faithSettlement?.abandonedFollowers?.[0]).toMatchObject({
      playerIdx: 0,
      cards: [oldApo],
      effect: 'godAbandon',
    });
  });

  it('AI 邪祀者更倾向把邪神牌蛊惑给未信仰者而不是同神升级', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const shu = makeGodCard('SHU');
    const players = [
      makePlayer({ name: '你', role: ROLE_TREASURE, hp: 10, san: 9, godName: null, godLevel: 0, godZone: [] }),
      makePlayer({
        name: '贝拉',
        role: ROLE_CULTIST,
        roleRevealed: true,
        hp: 10,
        san: 10,
        hand: [shu],
      }),
      makePlayer({
        name: '卡洛斯',
        role: ROLE_HUNTER,
        hp: 10,
        san: 10,
        godName: 'SHU',
        godLevel: 1,
        godZone: [makeGodCard('SHU')],
      }),
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

    expect(newLogs.some(line => line.includes('对 卡洛斯 【蛊惑】'))).toBe(false);
    expect(newLogs.some(line => line.includes('对 你 【蛊惑】'))).toBe(true);
    expect(result.players[0]).toMatchObject({ godName: 'SHU', godLevel: 1 });
  });

  it('AI 邪祀者在普通局面更倾向把邪神牌蛊惑给未信仰者而不是同神升级', () => {
    const shu = makeGodCard('SHU');
    const players = [
      makePlayer({ name: '你', role: ROLE_TREASURE, hp: 10, san: 9, godName: null, godLevel: 0, godZone: [] }),
      makePlayer({
        name: '贝拉',
        role: ROLE_CULTIST,
        roleRevealed: true,
        hp: 10,
        san: 10,
        hand: [shu],
      }),
      makePlayer({
        name: '卡洛斯',
        role: ROLE_HUNTER,
        hp: 10,
        san: 10,
        godName: 'SHU',
        godLevel: 1,
        godZone: [makeGodCard('SHU')],
      }),
    ];

    const plan = chooseAiCultistBewitchPlan(players, 1);
    expect(plan).toMatchObject({ card: shu, targetIdx: 0 });
  });

  it('AI 邪祀者有改信目标时不会因同神目标SAN损失更高而选择升级', () => {
    const zhu = makeGodCard('ZHU');
    const players = [
      makePlayer({ name: '艾伦', role: ROLE_CULTIST, roleRevealed: true, hand: [zhu] }),
      makePlayer({
        name: '黛安娜',
        role: ROLE_HUNTER,
        hp: 10,
        san: 9,
        godName: 'ZHU',
        godLevel: 1,
        godEncounters: 1,
        godZone: [makeGodCard('ZHU')],
      }),
      makePlayer({
        name: '卡洛斯',
        role: ROLE_TREASURE,
        hp: 10,
        san: 9,
        godName: 'NYA',
        godLevel: 1,
        godEncounters: 0,
        godZone: [makeGodCard('NYA')],
      }),
    ];

    const plan = chooseAiCultistBewitchPlan(players, 0);
    expect(plan).toMatchObject({ card: zhu, targetIdx: 2 });
  });

  it('AI 已在本回合使用过技能后恢复收尾时不记录未使用技能', () => {
    const players = [
      makePlayer({ name: '你', role: ROLE_TREASURE, hp: 10, san: 9, hand: [{ id: 'p1', key: 'A1', name: '玩家手牌' }] }),
      makePlayer({
        name: '艾伦',
        role: ROLE_CULTIST,
        roleRevealed: true,
        hp: 10,
        san: 10,
        hand: [],
      }),
      makePlayer({ name: '贝拉', role: ROLE_HUNTER, hp: 10, san: 10, hand: [{ id: 'b1', key: 'B1', name: '贝拉手牌' }] }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 1,
      phase: 'AI_TURN',
      skillUsed: true,
      restUsed: false,
      multiplyUsed: false,
      log: ['旧日志', '艾伦（邪祀者）对 你 【蛊惑】，赠予 森之领主'],
    });

    const result = aiStep(gs);
    const newLogs = result.log.slice(gs.log.length);

    expect(newLogs).toContain('艾伦 结束回合');
    expect(newLogs.some(line => line.includes('艾伦 未使用技能，结束回合'))).toBe(false);
  });

  it('AI 追猎者连续追捕恢复后即使不再追捕也记录本轮已使用技能', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const matchingCard = makeZoneCard('C1', 0);
    const remainingCard = makeZoneCard('A1', 0);
    const players = [
      makePlayer({
        name: '你',
        role: ROLE_TREASURE,
        hp: 10,
        hand: [makeZoneCard('C4', 0)],
      }),
      makePlayer({
        name: '卡洛斯',
        role: ROLE_HUNTER,
        roleRevealed: true,
        hp: 10,
        hand: [matchingCard, remainingCard],
      }),
    ];
    const huntPrompt = aiStep(makeGs({
      players,
      currentTurn: 1,
      phase: 'AI_TURN',
      turn: 7,
      skillUsed: false,
      restUsed: false,
      multiplyUsed: false,
      log: ['旧日志'],
    }));
    expect(huntPrompt).toMatchObject({
      phase: 'PLAYER_REVEAL_FOR_HUNT',
      skillUsed: true,
      skillActivatedTurn: 7,
    });

    const resumedGs = {
      ...huntPrompt,
      players: huntPrompt.players.map((player, index) => index === 0
        ? { ...player, hp: 7 }
        : { ...player, hand: [remainingCard] }),
      phase: 'AI_TURN',
      abilityData: {},
      skillUsed: false,
      huntAbandoned: [],
      log: [...huntPrompt.log, '你亮出 [C4] 触底反弹', '卡洛斯 弃 [C1] 活火山，你受 3HP 伤害！'],
    };
    const result = aiStep(resumedGs);
    const newLogs = result.log.slice(resumedGs.log.length);

    expect(newLogs).toContain('卡洛斯 结束回合');
    expect(newLogs.some(line => line.includes('卡洛斯 未使用技能，结束回合'))).toBe(false);
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

  it('AI 寻宝者已有邪神时不会随机改信负收益阿波菲斯', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const zhu = makeGodCard('ZHU');
    const apo = makeGodCard('APO');
    const players = [
      makePlayer({ name: '你', role: ROLE_CULTIST }),
      makePlayer({
        name: '贝拉',
        role: ROLE_TREASURE,
        san: 8,
        godName: 'ZHU',
        godLevel: 1,
        godZone: [zhu],
        hand: [apo],
      }),
      makePlayer({ name: '卡洛斯', role: ROLE_HUNTER }),
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

    expect(newLogs.some(line => line.includes('从手牌信仰 阿波菲斯'))).toBe(false);
    expect(result.players[1]).toMatchObject({ godName: 'ZHU', godLevel: 1, san: 8 });
    expect(result.players[1].hand).toEqual(expect.arrayContaining([apo]));
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

  it('AI 寻宝者对玩家掉包时会记录被暗抽和归还的具体牌', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const stolen = makeZoneCard('A1', 0);
    const returned = makeZoneCard('B2', 0);
    const duplicate = makeZoneCard('B2', 0, { id: 'duplicate-b2' });
    const players = [
      makePlayer({ name: '你', hp: 10, hand: [stolen] }),
      makePlayer({
        name: '艾伦',
        role: ROLE_TREASURE,
        roleRevealed: true,
        hp: 10,
        hand: [returned, duplicate],
      }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 1,
      phase: 'AI_TURN',
      skillUsed: false,
      restUsed: false,
      multiplyUsed: false,
      globalOnlySwapOwner: null,
      log: ['旧日志'],
    });

    const result = aiStep(gs);
    const newLogs = result.log.slice(gs.log.length);

    expect(newLogs).toContain('艾伦（寻宝者）对 你 【掉包】');
    expect(newLogs).toContain(`你的手牌${cardLogText(stolen, { alwaysShowName: true })}被暗抽`);
    expect(newLogs).toContain(`艾伦（寻宝者）给你一张${cardLogText(returned, { alwaysShowName: true })}`);
    expect(result._visualEvents?.[0]).toMatchObject({
      type: 'swapCards',
      sourceIdx: 1,
      targetIdx: 0,
      sourceCount: 1,
      targetCount: 1,
      takenCard: stolen,
      givenCard: returned,
    });
    expect(result._visualEvents?.[0].beforePlayers[0].hand).toEqual([stolen]);
    expect(result._visualEvents?.[0].afterPlayers[0].hand).toEqual([returned]);
  });

  it('AI 从手牌信仰邪神后再掉包时，技能前快照保留新的邪神之力', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const vri = makeGodCard('VRI');
    const oldVri = makeGodCard('VRI');
    const stolen = makeZoneCard('A1', 0);
    const returned = makeZoneCard('B2', 0);
    const duplicate = makeZoneCard('B2', 0, { id: 'duplicate-b2-after-faith' });
    const players = [
      makePlayer({ name: '你', hp: 10, san: 10, hand: [stolen] }),
      makePlayer({
        name: '黛安娜',
        role: ROLE_TREASURE,
        roleRevealed: true,
        hp: 10,
        san: 10,
        hand: [vri, returned, duplicate],
      }),
      makePlayer({
        name: '贝拉',
        role: ROLE_CULTIST,
        hp: 10,
        san: 10,
        godName: 'VRI',
        godLevel: 1,
        godZone: [oldVri],
      }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 1,
      phase: 'AI_TURN',
      skillUsed: false,
      restUsed: false,
      multiplyUsed: false,
      globalOnlySwapOwner: null,
      log: ['旧日志'],
    });

    const result = aiStep(gs);
    const newLogs = result.log.slice(gs.log.length);

    expect(newLogs.findIndex(line => line.includes('从手牌信仰 弗栗多'))).toBeLessThan(
      newLogs.findIndex(line => line.includes('【掉包】'))
    );
    expect(result._playersBeforeSkillAction?.[1]).toMatchObject({
      name: '黛安娜',
      godName: 'VRI',
      godLevel: 1,
    });
    expect(result._playersBeforeSkillAction?.[1].godZone).toEqual(expect.arrayContaining([expect.objectContaining({ godKey: 'VRI' })]));
    expect(result._visualEvents?.[0]).toMatchObject({
      type: 'swapCards',
      sourceIdx: 1,
      targetIdx: 0,
    });
  });

  it('AI 从手牌抢夺信仰时先处理旧信徒的虚化，再继续行动', () => {
    const vri = makeGodCard('VRI');
    const oldVri = makeGodCard('VRI');
    const players = [
      makePlayer({ name: '你', hp: 10, san: 10, hand: [makeZoneCard('A1', 0)] }),
      makePlayer({
        name: '贝拉',
        role: ROLE_TREASURE,
        roleRevealed: true,
        hp: 10,
        san: 10,
        hand: [vri, makeZoneCard('B2', 0), makeZoneCard('C3', 0)],
      }),
      makePlayer({
        name: '艾伦',
        role: ROLE_CULTIST,
        hp: 10,
        san: 8,
        etherealizeStacks: 1,
        godName: 'VRI',
        godLevel: 1,
        godZone: [oldVri],
      }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 1,
      phase: 'AI_TURN',
      skillUsed: false,
      restUsed: false,
      log: [],
    });

    const result = aiStep(gs);

    expect(result.phase).toBe('ETHEREALIZE_DECISION');
    expect(result.abilityData).toMatchObject({
      type: 'etherealizeRedirect',
      targetIdx: 2,
      lostSan: 1,
      _turnOwner: 1,
    });
    expect(result.players[2]).toMatchObject({ san: 8, godName: null, etherealizeStacks: 1 });
    expect(result.log).toContain('艾伦 被邪神抛弃，即将失去 1 SAN');
    expect(result.log.some(line => line.includes('【掉包】'))).toBe(false);
  });

  it('AI 寻宝者不会根据目标的隐藏森之领主放弃原本决定的掉包', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const forestLord = makeGodCard('SHU');
    const usefulZone = makeZoneCard('A2', 0);
    const players = [
      makePlayer({ name: '你', hp: 10, hand: [forestLord] }),
      makePlayer({
        name: '艾伦',
        role: ROLE_TREASURE,
        roleRevealed: true,
        hp: 10,
        hand: [usefulZone],
      }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 1,
      phase: 'AI_TURN',
      skillUsed: false,
      restUsed: false,
      multiplyUsed: false,
      globalOnlySwapOwner: null,
      log: ['旧日志'],
    });

    const result = aiStep(gs);
    const newLogs = result.log.slice(gs.log.length);

    expect(newLogs.some(line => line.includes('【掉包】'))).toBe(true);
    expect(result._visualEvents?.[0]).toMatchObject({ takenCard: forestLord, givenCard: forestLord });
    expect(result.players[1].hand).toEqual([usefulZone]);
    expect(result.players[0].hand).toEqual([forestLord]);
  });

  it('存在已揭晓非追猎者时集中攻击低HP目标且不固定玩家位', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.26);
    const hunterCard = { id: 'hunter-a1', key: 'A1', name: '霉变食物', type: 'selfHealHP', val: 1, isZone: true, letter: 'A', number: 1 };
    const hunterCard2 = { id: 'hunter-c1', key: 'C1', name: '新鲜空气', type: 'selfHealHP', val: 1, isZone: true, letter: 'C', number: 1 };
    const targetCard = name => ({ id: `target-${name}`, key: 'B2', name, type: 'selfHealHP', val: 1, isZone: true, letter: 'B', number: 2 });
    const players = [
      makePlayer({ name: '你', role: ROLE_TREASURE, roleRevealed: true, hp: 8, hand: [targetCard('玩家手牌')] }),
      makePlayer({ name: '卡洛斯', role: ROLE_HUNTER, roleRevealed: true, hp: 9, hand: [hunterCard, hunterCard2] }),
      makePlayer({ name: '艾伦', role: ROLE_CULTIST, roleRevealed: true, hp: 5, hand: [targetCard('艾伦手牌')] }),
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

    expect(result.log.some(line => line.includes('卡洛斯（追猎者）放弃追捕 艾伦'))).toBe(true);
    expect(result.log.some(line => line.includes('向你发动【追捕】'))).toBe(false);
  });

  it('追猎者放弃追捕后本回合不再追捕其他目标', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const hunterCard = { id: 'hunter-a1', key: 'A1', name: '霉变食物', type: 'selfHealHP', val: 1, isZone: true, letter: 'A', number: 1 };
    const hunterCard2 = { id: 'hunter-a3', key: 'A3', name: '无尽通道', type: 'selfHealHP', val: 1, isZone: true, letter: 'A', number: 3 };
    const failedTargetCard = { id: 'target-b2', key: 'B2', name: '迷途石阶', type: 'selfHealHP', val: 1, isZone: true, letter: 'B', number: 2 };
    const nextTargetCard = { id: 'target-c3', key: 'C3', name: '地动山摇', type: 'selfHealHP', val: 1, isZone: true, letter: 'C', number: 3 };
    const players = [
      makePlayer({ name: '你', hp: 10, hand: [] }),
      makePlayer({ name: '卡洛斯', role: ROLE_HUNTER, roleRevealed: true, hp: 9, hand: [hunterCard, hunterCard2] }),
      makePlayer({ name: '艾伦', role: ROLE_CULTIST, roleRevealed: true, hp: 3, hand: [failedTargetCard] }),
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

    expect(result.log.some(line => line.includes('卡洛斯（追猎者）放弃追捕 艾伦'))).toBe(true);
    expect(result.log.some(line => line.includes('对 贝拉 【追捕】'))).toBe(false);
    expect(result.currentTurn).not.toBe(1);
  });

  it('AI 回合穴居人战争胜者拿走对方邪神牌时不会触发其他人的增殖的Z', () => {
    const sourceCard = makeZoneCard('A1', 0);
    const targetGod = makeGodCard('SHU');
    const players = [
      makePlayer({ name: 'Z持有者', hand: [] }),
      makePlayer({ name: '艾伦', hand: [sourceCard] }),
      makePlayer({ name: '贝拉', hand: [targetGod] }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 1,
      phase: 'AI_TURN',
      abilityData: { caveDuelTargets: [2], caveDuelSource: 1 },
      proliferatingZ: makeProliferatingZState(0, 1),
      proliferatingZQueue: [],
      log: ['旧日志'],
    });

    const result = aiStep(gs);

    expect(result.log.at(-1)).toContain('艾伦 胜出');
    expect(result.players[1].hand).toEqual(expect.arrayContaining([targetGod]));
    expect(result.proliferatingZQueue || []).toEqual([]);
  });

  it('AI 作为穴居人战争目标时不会根据发起者亮牌反制选牌', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const sourceCard = makeZoneCard('A2', 0, { id: 'source-2' });
    const targetWinningCard = makeZoneCard('A3', 0, { id: 'target-3' });
    const targetBlindPreferredCard = makeGodCard('SHU', { id: 'target-no-number' });
    const players = [
      makePlayer({ name: '你', hand: [] }),
      makePlayer({ name: '艾伦', hand: [sourceCard] }),
      makePlayer({ name: '贝拉', hand: [targetWinningCard, targetBlindPreferredCard] }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 1,
      phase: 'AI_TURN',
      abilityData: { caveDuelTargets: [2], caveDuelSource: 1 },
      log: ['旧日志'],
    });

    const result = aiStep(gs);

    expect(result.log.at(-1)).toContain('艾伦 胜出');
    expect(result.log.at(-1)).toContain('森之领主');
    expect(result.players[1].hand).toEqual(expect.arrayContaining([sourceCard, targetBlindPreferredCard]));
    expect(result.players[2].hand).toEqual(expect.arrayContaining([targetWinningCard]));
  });
});
