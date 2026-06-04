import { describe, expect, it, vi } from 'vitest';
import { buildAnimQueue } from '../animQueueCore';
import { buildMpRemoteReplayAction, MP_REMOTE_REPLAY } from '../multiplayerRemoteReplay';
import { rotateGsForViewer } from '../rotateState';
import { createEarthquakeEvent, createEndlessCorridorReplayEvent, createHuntResultEvent, createSphinxResultEvent, createSwapCardsEvent } from '../visualEvents';

const card = { id: 'c1', name: '测试牌', type: 'zone' };

function player(name) {
  return { name, hand: [], hp: 10, san: 10 };
}

function makeState(patch = {}) {
  return {
    players: [player('你'), player('艾伦'), player('贝拉')],
    currentTurn: 1,
    phase: 'ACTION',
    log: [],
    abilityData: {},
    drawReveal: null,
    discard: [],
    ...patch,
  };
}

function buildAction(rotated, extra = {}) {
  return buildMpRemoteReplayAction({
    rotated,
    previousGs: makeState({ currentTurn: 0 }),
    roleRevealed: true,
    buildAnimQueue: vi.fn(() => []),
    buildFullHandSwapTransferQueueFromLogs: vi.fn(() => []),
    ...extra,
  });
}

describe('buildMpRemoteReplayAction', () => {
  it('requests role reveal for the first non-game-over state', () => {
    const rotated = makeState({ players: [{ ...player('你'), role: '寻宝者' }, player('艾伦')] });
    const action = buildMpRemoteReplayAction({
      rotated,
      previousGs: null,
      roleRevealed: false,
      buildAnimQueue: vi.fn(),
      buildFullHandSwapTransferQueueFromLogs: vi.fn(),
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ROLE_REVEAL);
    expect(action.role).toBe('寻宝者');
    expect(action.maskedGs).toMatchObject({ phase: 'ACTION', drawReveal: null, abilityData: {} });
  });

  it('turns remote dice logs into a dice animation action', () => {
    const action = buildAction(makeState({ log: ['艾伦 掷出 5 点'] }));

    expect(action.type).toBe(MP_REMOTE_REPLAY.DICE_ROLL);
    expect(action.anim).toMatchObject({ type: 'DICE_ROLL', d1: 5, rollerName: '艾伦', dodgeSuccess: true });
    expect(action.pendingGs.log).toEqual(['艾伦 掷出 5 点']);
  });

  it('replays throw-stone random target queue instead of treating its roll as treasure dodge', () => {
    const beforePlayers = [player('你'), player('艾伦'), { ...player('贝拉'), hp: 10 }];
    const afterPlayers = [player('你'), player('艾伦'), { ...player('贝拉'), hp: 7 }];
    const log = ['艾伦 掷出 4 点，随机砸向 贝拉（距离1），造成 3 HP 伤害'];
    const action = buildAction(makeState({
      currentTurn: 1,
      players: afterPlayers,
      log,
      _randomTargetSeq: 1,
      _randomTargetEvents: [{
        seq: 1,
        sourceIdx: 1,
        targetIdx: 2,
        label: '投掷石块',
        roll: 4,
        distance: 1,
        damage: 3,
        diceBefore: true,
        phaseOrder: 1,
        resultText: '贝拉 被选中',
      }],
      _statEventSeq: 1,
      _statEvents: [{
        type: 'HP_LOSS',
        target: 2,
        from: { hp: 10, san: 10, isDead: false },
        to: { hp: 7, san: 10, isDead: false },
        seq: 1,
        phaseOrder: 2,
      }],
    }), {
      previousGs: makeState({
        currentTurn: 1,
        players: beforePlayers,
        log: [],
        _randomTargetSeq: 0,
        _statEventSeq: 0,
      }),
      buildAnimQueue,
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue.map(step => step.type)).toEqual(['DICE_ROLL', 'RANDOM_TARGET', 'HP_DAMAGE', 'STATE_PATCH']);
    expect(action.queue[0]).toMatchObject({ diceMode: 'throwStone', d1: 4, rollerName: '艾伦' });
    expect(action.queue[0]).not.toHaveProperty('dodgeSuccess');
    expect(action.queue[1]).toMatchObject({ sourceIdx: 1, targetIdx: 2, label: '投掷石块', roll: 4, damage: 3 });
    expect(action.queue[2]).toMatchObject({ hitIndices: [2] });
    expect(action.queue.at(-1)).toMatchObject({ players: afterPlayers, log });
  });

  it('builds a remote draw animation queue without exposing the decision phase first', () => {
    const buildAnimQueue = vi.fn(() => [{ type: 'HP_DAMAGE', target: 1 }]);
    const action = buildAction(
      makeState({
        phase: 'DRAW_REVEAL',
        drawReveal: { card, drawerIdx: 1, needsDecision: true },
        _drawLogs: ['艾伦 摸到 测试牌'],
        _statLogs: ['艾伦 失去 1 HP'],
        _playersBeforeThisDraw: [player('你-before'), player('艾伦-before'), player('贝拉-before')],
      }),
      { buildAnimQueue },
    );

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.maskedGs).toMatchObject({ phase: 'ACTION', drawReveal: null, abilityData: {} });
    expect(action.queue[0]).toMatchObject({ type: 'YOUR_TURN', name: '艾伦' });
    expect(action.queue[1]).toMatchObject({ type: 'DRAW_CARD', card, triggerName: '艾伦', targetPid: 1 });
    expect(action.queue.at(-1)).toMatchObject({ type: 'STATE_PATCH' });
    expect(action.visualLock.players[1].name).toBe('艾伦-before');
    expect(buildAnimQueue).toHaveBeenCalledOnce();
  });

  it('builds a local draw animation after role reveal without exposing the decision phase first', () => {
    const action = buildAction(makeState({
      currentTurn: 0,
      phase: 'DRAW_REVEAL',
      drawReveal: { card, drawerIdx: 0, needsDecision: true },
      _turnStartLogs: ['── 你 的回合开始 ──'],
      _drawLogs: ['你 摸到 测试牌'],
      _playersBeforeThisDraw: [player('你-before'), player('艾伦-before'), player('贝拉-before')],
    }));

    expect(action.type).toBe(MP_REMOTE_REPLAY.START_ANIM);
    expect(action.maskedGs).toMatchObject({ phase: 'ACTION', drawReveal: null, abilityData: {} });
    expect(action.anim).toMatchObject({ type: 'YOUR_TURN', msgs: ['── 你 的回合开始 ──'] });
    expect(action.queue[0]).toMatchObject({ type: 'DRAW_CARD', card, triggerName: '你', targetPid: 0 });
    expect(action.pendingGs.phase).toBe('DRAW_REVEAL');
  });

  it('does not flip a Zhu-lit card before the hide decision resolves', () => {
    const litCard = { id: 'lit-card', name: '被点亮牌', type: 'zone' };
    const action = buildAction(makeState({
      phase: 'DRAW_REVEAL',
      drawReveal: { card: litCard, drawerIdx: 1, needsDecision: true },
      zhuLight: { ownerIdx: 0, cardIds: ['lit-card'] },
      _turnStartLogs: ['── 艾伦 的回合开始 ──'],
      _drawLogs: ['艾伦 摸到 被点亮牌'],
    }));

    expect(action.type).toBe(MP_REMOTE_REPLAY.START_ANIM);
    expect(action.anim).toMatchObject({ type: 'YOUR_TURN', name: '艾伦' });
    expect(action.queue.some(step => step.type === 'DRAW_CARD')).toBe(false);
    expect(action.pendingGs.phase).toBe('DRAW_REVEAL');
    expect(action.pendingGs.drawReveal.card).toBe(litCard);
  });

  it('flips a Zhu-lit card after choosing not to hide without replaying the turn banner', () => {
    const litCard = { id: 'lit-card', name: '被点亮牌', type: 'zone' };
    const previousGs = makeState({
      phase: 'DRAW_REVEAL',
      drawReveal: { card: litCard, drawerIdx: 1, needsDecision: true },
      zhuLight: { ownerIdx: 0, cardIds: ['lit-card'] },
    });
    const action = buildMpRemoteReplayAction({
      rotated: makeState({
        phase: 'DRAW_REVEAL',
        drawReveal: { card: litCard, drawerIdx: 1, needsDecision: true, zhuResolved: true },
        zhuLight: { ownerIdx: 0, cardIds: [] },
        _turnStartLogs: [],
        _drawLogs: ['艾伦 摸到 被点亮牌'],
      }),
      previousGs,
      roleRevealed: true,
      buildAnimQueue: vi.fn(() => []),
      buildFullHandSwapTransferQueueFromLogs: vi.fn(() => []),
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue[0]).toMatchObject({ type: 'DRAW_CARD', card: litCard, triggerName: '艾伦', targetPid: 1 });
    expect(action.queue.some(step => step.type === 'YOUR_TURN')).toBe(false);
  });

  it('does not replay stale previous-turn stat differences between local draw flip and decision', () => {
    const nextCard = { id: 'next-local', name: '本回合摸牌', type: 'zone' };
    const staleSanDamage = { type: 'SAN_DAMAGE', hitIndices: [0], msgs: ['你 失去 2 SAN'] };
    const action = buildAction(makeState({
      currentTurn: 0,
      phase: 'DRAW_REVEAL',
      players: [{ ...player('你'), san: 8 }, player('艾伦'), player('贝拉')],
      drawReveal: { card: nextCard, drawerIdx: 0, needsDecision: true },
      _turnStartLogs: ['── 你 的回合开始 ──'],
      _drawLogs: ['你 摸到 本回合摸牌'],
      _statLogs: [],
    }), {
      previousGs: makeState({
        currentTurn: 1,
        phase: 'ACTION',
        players: [player('你'), player('艾伦'), player('贝拉')],
      }),
      buildAnimQueue: vi.fn(() => [staleSanDamage]),
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.START_ANIM);
    expect(action.queue[0]).toMatchObject({ type: 'DRAW_CARD', card: nextCard, triggerName: '你', targetPid: 0 });
    expect(action.queue.some(step => step.type === 'SAN_DAMAGE')).toBe(false);
  });

  it('replays a timed-out draw discard before the next local turn draw', () => {
    const previousGs = makeState({
      currentTurn: 1,
      phase: 'DRAW_REVEAL',
      drawReveal: { card, drawerIdx: 1, drawerName: '艾伦', needsDecision: true, forcedKeep: false },
      log: ['艾伦 摸到 测试牌'],
    });
    const nextCard = { id: 'c2', name: '下一张', type: 'zone' };
    const action = buildMpRemoteReplayAction({
      rotated: makeState({
        currentTurn: 0,
        phase: 'DRAW_REVEAL',
        drawReveal: { card: nextCard, drawerIdx: 0, needsDecision: true },
        log: ['艾伦 摸到 测试牌', '(超时) 艾伦 弃置了 测试牌', '── 你 的回合开始 ──', '你 摸到 下一张'],
        _turnStartLogs: ['── 你 的回合开始 ──'],
        _drawLogs: ['你 摸到 下一张'],
      }),
      previousGs,
      roleRevealed: true,
      buildAnimQueue: vi.fn(() => []),
      buildFullHandSwapTransferQueueFromLogs: vi.fn(() => []),
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.START_ANIM);
    expect(action.anim).toMatchObject({ type: 'DISCARD', card, targetPid: 1 });
    expect(action.queue[0]).toMatchObject({ type: 'YOUR_TURN', msgs: ['── 你 的回合开始 ──'] });
    expect(action.queue[1]).toMatchObject({ type: 'DRAW_CARD', card: nextCard, triggerName: '你', targetPid: 0 });
  });

  it('uses explicit timed-out draw metadata when previous local state is already masked', () => {
    const nextCard = { id: 'c2', name: '下一张', type: 'zone' };
    const action = buildMpRemoteReplayAction({
      rotated: makeState({
        currentTurn: 0,
        phase: 'DRAW_REVEAL',
        drawReveal: { card: nextCard, drawerIdx: 0, needsDecision: true },
        log: ['(超时) 艾伦 弃置了 测试牌', '── 你 的回合开始 ──', '你 摸到 下一张'],
        _turnStartLogs: ['── 你 的回合开始 ──'],
        _drawLogs: ['你 摸到 下一张'],
        _mpTimedOutDrawDiscard: { card, drawerIdx: 1, drawerName: '艾伦' },
      }),
      previousGs: makeState({ currentTurn: 1, phase: 'ACTION', drawReveal: null }),
      roleRevealed: true,
      buildAnimQueue: vi.fn(() => []),
      buildFullHandSwapTransferQueueFromLogs: vi.fn(() => []),
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.START_ANIM);
    expect(action.anim).toMatchObject({ type: 'DISCARD', card, triggerName: '艾伦', targetPid: 1 });
    expect(action.pendingGs._mpTimedOutDrawDiscard).toBeNull();
  });

  it('prefers visualEvents for timed-out draw discard replay', () => {
    const nextCard = { id: 'c2', name: '下一张', type: 'zone' };
    const action = buildMpRemoteReplayAction({
      rotated: makeState({
        currentTurn: 0,
        phase: 'DRAW_REVEAL',
        drawReveal: { card: nextCard, drawerIdx: 0, needsDecision: true },
        _turnStartLogs: ['── 你 的回合开始 ──'],
        _drawLogs: ['你 摸到 下一张'],
        _visualEvents: [{ type: 'timedOutDrawDiscard', card, drawerIdx: 1, drawerName: '艾伦' }],
      }),
      previousGs: makeState({ currentTurn: 1, phase: 'ACTION', drawReveal: null }),
      roleRevealed: true,
      buildAnimQueue: vi.fn(() => []),
      buildFullHandSwapTransferQueueFromLogs: vi.fn(() => []),
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.START_ANIM);
    expect(action.anim).toMatchObject({ type: 'DISCARD', card, triggerName: '艾伦', targetPid: 1 });
    expect(action.pendingGs._visualEvents).toEqual([]);
  });

  it('prefers visualEvents for turn banner and draw-card replay', () => {
    const eventCard = { id: 'ev-card', name: '事件牌', type: 'zone' };
    const fallbackCard = { id: 'fallback-card', name: '旧字段牌', type: 'zone' };
    const action = buildAction(makeState({
      phase: 'DRAW_REVEAL',
      drawReveal: { card: fallbackCard, drawerIdx: 1, needsDecision: true },
      _turnStartLogs: ['旧回合文字'],
      _drawLogs: ['旧摸牌文字'],
      _visualEvents: [
        { type: 'turnStart', playerIdx: 1, playerName: '艾伦', msgs: ['事件回合文字'] },
        { type: 'drawCard', playerIdx: 1, playerName: '艾伦', card: eventCard, msgs: ['事件摸牌文字'] },
      ],
    }));

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue[0]).toMatchObject({ type: 'YOUR_TURN', name: '艾伦', msgs: ['事件回合文字'] });
    expect(action.queue[1]).toMatchObject({ type: 'DRAW_CARD', card: eventCard, triggerName: '艾伦', targetPid: 1, msgs: ['事件摸牌文字'] });
    expect(action.pendingGs._visualEvents).toEqual([]);
  });

  it('prefers stat visualEvents over legacy stat animation inference', () => {
    const hpLossEvent = {
      type: 'HP_LOSS',
      target: 1,
      from: { hp: 10, san: 10, isDead: false },
      to: { hp: 7, san: 10, isDead: false },
    };
    const legacyBuildAnimQueue = vi.fn(() => [
      { type: 'HP_DAMAGE', hitIndices: [2], statEvents: [{ type: 'HP_LOSS', target: 2 }] },
    ]);
    const action = buildAction(
      makeState({
        phase: 'DRAW_REVEAL',
        drawReveal: { card, drawerIdx: 1, needsDecision: true },
        _playersBeforeThisDraw: [player('你-before'), player('艾伦-before'), player('贝拉-before')],
        _visualEvents: [
          { type: 'turnStart', playerIdx: 1, playerName: '艾伦', msgs: [] },
          { type: 'drawCard', playerIdx: 1, playerName: '艾伦', card, msgs: [] },
          { type: 'statEvents', statEvents: [hpLossEvent], msgs: ['事件 HP 变化'] },
        ],
      }),
      { buildAnimQueue: legacyBuildAnimQueue },
    );

    const hpDamageSteps = action.queue.filter(step => step.type === 'HP_DAMAGE');
    expect(hpDamageSteps).toHaveLength(1);
    expect(hpDamageSteps[0]).toMatchObject({ hitIndices: [1], msgs: ['事件 HP 变化'] });
    expect(hpDamageSteps[0].statEvents).toMatchObject([hpLossEvent]);
  });

  it('uses bewitch visualEvents instead of log parsing for gift animation', () => {
    const gift = { id: 'gift1', name: '蛊惑礼物', key: 'A1', type: 'zone' };
    const hpLossEvent = {
      type: 'HP_LOSS',
      target: 2,
      from: { hp: 10, san: 10, isDead: false },
      to: { hp: 8, san: 10, isDead: false },
    };
    const action = buildAction(makeState({
      currentTurn: 1,
      phase: 'ACTION',
      log: ['没有蛊惑关键字的日志'],
      _visualEvents: [
        { type: 'bewitchGift', sourceIdx: 1, targetIdx: 2, targetName: '贝拉', card: gift, msgs: ['事件蛊惑'] },
        { type: 'statEvents', statEvents: [hpLossEvent], msgs: ['事件伤害'] },
      ],
    }), {
      previousGs: makeState({ currentTurn: 1, phase: 'ACTION', players: [player('你'), player('艾伦'), player('贝拉')] }),
      buildAnimQueue: vi.fn(() => [{ type: 'HP_DAMAGE', hitIndices: [0], statEvents: [{ type: 'HP_LOSS', target: 0 }] }]),
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue.map(step => step.type).slice(0, 3)).toEqual(['SKILL_BEWITCH', 'CARD_TRANSFER', 'DRAW_CARD']);
    expect(action.queue[0]).toMatchObject({ targetIdx: 2, msgs: ['事件蛊惑'] });
    expect(action.queue[1]).toMatchObject({ fromPid: 1, toPid: 2, count: 1 });
    expect(action.queue[2]).toMatchObject({ card: gift, triggerName: '贝拉', targetPid: 2, skipTravel: true });
    expect(action.queue.find(step => step.type === 'HP_DAMAGE')).toMatchObject({ hitIndices: [2], msgs: ['事件伤害'] });
    expect(action.pendingGs._visualEvents).toEqual([]);
  });

  it('keeps inspection damage after the inspection card reveal for remote bewitch replay', () => {
    const godGift = { id: 'god1', name: '伏行之混沌', godKey: 'NYA', isGod: true, type: 'god' };
    const scratchCard = { id: 'ins1', name: '乱抓', effect: 'scratch', value: 1 };
    const beforeBewitchPlayers = [
      { ...player('你'), role: '邪祀者', hand: [godGift] },
      { ...player('卡洛斯'), hp: 10, san: 10, hand: [] },
      player('贝拉'),
    ];
    const beforeInspectionPlayers = [
      { ...player('你'), role: '邪祀者', hand: [] },
      { ...player('卡洛斯'), hp: 10, san: 7, hand: [godGift] },
      player('贝拉'),
    ];
    const afterInspectionPlayers = [
      { ...player('你'), role: '邪祀者', hand: [] },
      { ...player('卡洛斯'), hp: 9, san: 7, hand: [godGift] },
      player('贝拉'),
    ];
    const beforeInspectionLog = [
      '你对 卡洛斯 【蛊惑】，赠予 伏行之混沌',
      '卡洛斯 遭遇邪神 伏行之混沌（第3次），失去3SAN',
    ];
    const afterInspectionLog = [
      ...beforeInspectionLog,
      '卡洛斯 的SAN检定结果为"乱抓"',
      '卡洛斯 被乱抓，失去 1 HP',
    ];
    const action = buildAction(makeState({
      currentTurn: 0,
      phase: 'ACTION',
      players: afterInspectionPlayers,
      log: afterInspectionLog,
      _statEventSeq: 1,
      _statEvents: [{
        seq: 1,
        type: 'HP_LOSS',
        target: 1,
        from: { hp: 10, san: 7, isDead: false },
        to: { hp: 9, san: 7, isDead: false },
        reason: '乱抓',
      }],
      _inspectionSeq: 1,
      _inspectionEvents: [{
        seq: 1,
        card: scratchCard,
        target: 1,
        beforePlayers: beforeInspectionPlayers,
        beforeLog: beforeInspectionLog,
        afterPlayers: afterInspectionPlayers,
        afterLog: afterInspectionLog,
        statEvents: [{
          seq: 1,
          type: 'HP_LOSS',
          target: 1,
          from: { hp: 10, san: 7, isDead: false },
          to: { hp: 9, san: 7, isDead: false },
          reason: '乱抓',
        }],
        statEventSeq: 1,
      }],
      _visualEvents: [{
        type: 'bewitchGift',
        sourceIdx: 0,
        targetIdx: 1,
        targetName: '卡洛斯',
        card: godGift,
        msgs: ['你对 卡洛斯 【蛊惑】，赠予 伏行之混沌'],
      }],
    }), {
      previousGs: makeState({
        currentTurn: 0,
        phase: 'BEWITCH_SELECT_TARGET',
        players: beforeBewitchPlayers,
        log: [],
      }),
      buildAnimQueue,
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.inspectionEvents).toHaveLength(1);
    expect(action.inspectionEvents[0].card).toBe(scratchCard);
    const giftRevealIdx = action.queue.findIndex(step => step.type === 'DRAW_CARD' && step.card === godGift);
    const inspectionRevealIdx = action.queue.findIndex(step => step.type === 'DRAW_CARD' && step.card === scratchCard);
    const hpDamageIdx = action.queue.findIndex(step => step.type === 'HP_DAMAGE');
    expect(giftRevealIdx).toBeGreaterThan(-1);
    expect(inspectionRevealIdx).toBeGreaterThan(giftRevealIdx);
    expect(hpDamageIdx).toBeGreaterThan(inspectionRevealIdx);
  });

  it('keeps god encounter inspection damage after inspection reveal during multiplayer draw replay', () => {
    const godCard = { id: 'god-vri', name: '弗栗多', godKey: 'VRI', isGod: true, type: 'god' };
    const selfHarmCard = { id: 'ins-self', name: '自残', effect: 'selfDamageHP', value: 1 };
    const beforeDrawPlayers = [
      { ...player('你'), hp: 10, san: 10 },
      { ...player('黛安娜'), hp: 10, san: 8 },
      player('贝拉'),
    ];
    const beforeInspectionPlayers = [
      { ...player('你'), hp: 10, san: 10 },
      { ...player('黛安娜'), hp: 10, san: 6 },
      player('贝拉'),
    ];
    const afterInspectionPlayers = [
      { ...player('你'), hp: 10, san: 10 },
      { ...player('黛安娜'), hp: 9, san: 6 },
      player('贝拉'),
    ];
    const beforeInspectionLog = [
      '── 黛安娜 的回合开始 ──',
      '黛安娜 摸到 弗栗多',
      '黛安娜 遭遇邪神 弗栗多！（第2次）失去2SAN',
    ];
    const afterInspectionLog = [
      ...beforeInspectionLog,
      '黛安娜 的SAN检定结果为"自残"',
      '黛安娜 自残，失去 1 HP',
    ];
    const action = buildAction(makeState({
      currentTurn: 1,
      phase: 'GOD_CHOICE',
      players: afterInspectionPlayers,
      abilityData: { godCard, drawerIdx: 1, godEncounterCost: 0 },
      log: afterInspectionLog,
      _turnStartLogs: ['── 黛安娜 的回合开始 ──'],
      _drawLogs: ['黛安娜 摸到 弗栗多', '黛安娜 遭遇邪神 弗栗多！（第2次）失去2SAN'],
      _playersBeforeThisDraw: beforeDrawPlayers,
      _statEventSeq: 2,
      _statEvents: [
        {
          seq: 1,
          type: 'SAN_LOSS',
          target: 1,
          from: { hp: 10, san: 8, isDead: false },
          to: { hp: 10, san: 6, isDead: false },
          reason: '邪神遭遇',
        },
        {
          seq: 2,
          type: 'HP_LOSS',
          target: 1,
          from: { hp: 10, san: 6, isDead: false },
          to: { hp: 9, san: 6, isDead: false },
          reason: '自残',
        },
      ],
      _inspectionSeq: 1,
      _inspectionEvents: [{
        seq: 1,
        card: selfHarmCard,
        target: 1,
        beforePlayers: beforeInspectionPlayers,
        beforeLog: beforeInspectionLog,
        afterPlayers: afterInspectionPlayers,
        afterLog: afterInspectionLog,
        statEvents: [{
          seq: 2,
          type: 'HP_LOSS',
          target: 1,
          from: { hp: 10, san: 6, isDead: false },
          to: { hp: 9, san: 6, isDead: false },
          reason: '自残',
        }],
        statEventSeq: 2,
      }],
      _visualEvents: [
        { type: 'turnStart', playerIdx: 1, playerName: '黛安娜', msgs: ['── 黛安娜 的回合开始 ──'] },
        { type: 'drawCard', playerIdx: 1, playerName: '黛安娜', card: godCard, msgs: ['黛安娜 摸到 弗栗多'] },
        { type: 'statEvents', statEvents: [
          {
            seq: 1,
            type: 'SAN_LOSS',
            target: 1,
            from: { hp: 10, san: 8, isDead: false },
            to: { hp: 10, san: 6, isDead: false },
          },
          {
            seq: 2,
            type: 'HP_LOSS',
            target: 1,
            from: { hp: 10, san: 6, isDead: false },
            to: { hp: 9, san: 6, isDead: false },
          },
        ], msgs: ['黛安娜 遭遇邪神 弗栗多！（第2次）失去2SAN', '黛安娜 自残，失去 1 HP'] },
      ],
    }), {
      previousGs: makeState({
        currentTurn: 0,
        phase: 'ACTION',
        players: beforeDrawPlayers,
        log: [],
      }),
      buildAnimQueue,
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    const godRevealIdx = action.queue.findIndex(step => step.type === 'DRAW_CARD' && step.card === godCard);
    const sanDamageIdx = action.queue.findIndex(step => step.type === 'SAN_DAMAGE');
    const inspectionRevealIdx = action.queue.findIndex(step => step.type === 'DRAW_CARD' && step.card === selfHarmCard);
    const hpDamageIdx = action.queue.findIndex(step => step.type === 'HP_DAMAGE');
    expect(godRevealIdx).toBeGreaterThan(-1);
    expect(sanDamageIdx).toBeGreaterThan(godRevealIdx);
    expect(inspectionRevealIdx).toBeGreaterThan(sanDamageIdx);
    expect(hpDamageIdx).toBeGreaterThan(inspectionRevealIdx);
    expect(action.queue[sanDamageIdx].msgs).not.toContain('黛安娜 自残，失去 1 HP');
    expect(action.queue[hpDamageIdx].msgs).toContain('黛安娜 自残，失去 1 HP');
  });

  it('uses swap visualEvents as silent hand transfer without draw replay', () => {
    const staleDrawCard = { id: 'stale-draw', name: '上一张摸牌', key: 'A1', type: 'zone' };
    const players = [player('你'), player('艾伦'), player('贝拉')];
    const discard = [{ id: 'discarded' }];
    const abilityData = { swapDone: true };
    const action = buildAction(makeState({
      currentTurn: 1,
      phase: 'ACTION',
      players,
      discard,
      abilityData,
      drawReveal: { card: staleDrawCard, drawerIdx: 1, needsDecision: false },
      log: ['艾伦（寻宝者）对 你 【掉包】，暗抽了1张牌', '拿走 [B2] 旧牌，还给 你 [C3] 新牌'],
      _visualEvents: [
        { type: 'swapCards', sourceIdx: 1, targetIdx: 0, sourceCount: 1, targetCount: 1, msgs: ['拿走 [B2] 旧牌，还给 你 [C3] 新牌'] },
      ],
    }), {
      previousGs: makeState({ currentTurn: 1, phase: 'SWAP_GIVE_CARD' }),
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue.map(step => step.type)).toEqual(['SKILL_SWAP', 'VISUAL_LOCK', 'CARD_TRANSFER', 'CARD_TRANSFER', 'STATE_PATCH']);
    expect(action.queue.at(-1)).toMatchObject({
      type: 'STATE_PATCH',
      players,
      discard,
      log: ['艾伦（寻宝者）对 你 【掉包】，暗抽了1张牌', '拿走 [B2] 旧牌，还给 你 [C3] 新牌'],
      drawReveal: null,
      phase: 'ACTION',
      abilityData,
    });
    expect(action.queue.some(step => step.type === 'DRAW_CARD')).toBe(false);
    expect(action.pendingGs.drawReveal).toBeNull();
    expect(action.pendingGs._visualEvents).toEqual([]);
  });

  it('does not let stale swap visualEvents override the next draw replay', () => {
    const nextCard = { id: 'next1', name: '下一回合摸牌', key: 'B2', type: 'zone' };
    const staleSwapEvent = createSwapCardsEvent({
      sourceIdx: 1,
      targetIdx: 0,
      sourceCount: 1,
      targetCount: 1,
      msgs: ['拿走 [B2] 旧牌，还给 你 [C3] 新牌'],
    });
    const action = buildAction(makeState({
      currentTurn: 2,
      phase: 'DRAW_REVEAL',
      drawReveal: { card: nextCard, drawerIdx: 2, needsDecision: true },
      log: [
        '艾伦（寻宝者）对 你 【掉包】，暗抽了1张牌',
        '拿走 [B2] 旧牌，还给 你 [C3] 新牌',
        '── 贝拉 的回合开始 ──',
        '贝拉 摸到 下一回合摸牌',
      ],
      _turnStartLogs: ['── 贝拉 的回合开始 ──'],
      _drawLogs: ['贝拉 摸到 下一回合摸牌'],
      _visualEvents: [staleSwapEvent],
    }), {
      previousGs: makeState({ currentTurn: 1, phase: 'ACTION', log: [] }),
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue[0]).toMatchObject({ type: 'YOUR_TURN', name: '贝拉' });
    expect(action.queue[1]).toMatchObject({ type: 'DRAW_CARD', card: nextCard, triggerName: '贝拉', targetPid: 2 });
    expect(action.queue.some(step => step.type === 'SKILL_SWAP')).toBe(false);
  });

  it('does not replay already consumed visualEvents from repeated sync packets', () => {
    const gift = { id: 'gift1', name: '蛊惑礼物', key: 'A1', type: 'zone' };
    const rotated = makeState({
      currentTurn: 1,
      phase: 'ACTION',
      log: ['艾伦（邪祀者）对 贝拉 【蛊惑】，赠予 [A1] 蛊惑礼物'],
      _visualEvents: [
        { type: 'bewitchGift', sourceIdx: 1, targetIdx: 2, targetName: '贝拉', card: gift, msgs: ['事件蛊惑'] },
      ],
    });
    const first = buildAction(rotated, {
      previousGs: makeState({ currentTurn: 1, phase: 'ACTION', players: [player('你'), player('艾伦'), player('贝拉')] }),
    });
    expect(first.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(first.consumedVisualEventIds?.length).toBeGreaterThan(0);

    const second = buildAction(rotated, {
      previousGs: makeState({ currentTurn: 1, phase: 'ACTION', players: [player('你'), player('艾伦'), player('贝拉')] }),
      consumedVisualEventIds: new Set(first.consumedVisualEventIds),
    });
    expect(second.type).toBe(MP_REMOTE_REPLAY.SET_STATE);
    expect(second.gs._visualEvents).toEqual([]);
  });

  it('does not replay consumed bewitch inspection animations from repeated sync packets', () => {
    const gift = { id: 'gift1', name: '蛊惑礼物', key: 'A1', type: 'zone' };
    const inspectionCard = { id: 'inspect-paranoia', name: '迫害妄想', effect: 'discardRandom', value: 1 };
    const beforePlayers = [
      player('你'),
      { ...player('艾伦'), role: '邪祀者', hand: [gift] },
      { ...player('贝拉'), san: 8 },
    ];
    const beforeInspectionPlayers = [
      player('你'),
      { ...player('艾伦'), role: '邪祀者', hand: [] },
      { ...player('贝拉'), san: 6, hand: [gift] },
    ];
    const beforeInspectionLog = [
      '艾伦（邪祀者）对 贝拉 【蛊惑】，赠予 [A1] 蛊惑礼物',
      '贝拉 遭遇邪神 蛊惑礼物（第1次），失去2SAN',
    ];
    const afterInspectionLog = [
      ...beforeInspectionLog,
      '贝拉 的SAN检定结果为"迫害妄想"',
    ];
    const bewitchEvent = {
      type: 'bewitchGift',
      id: 'bewitch-repeat-inspection',
      sourceIdx: 1,
      targetIdx: 2,
      targetName: '贝拉',
      card: gift,
      msgs: ['艾伦（邪祀者）对 贝拉 【蛊惑】，赠予 [A1] 蛊惑礼物'],
    };
    const rotated = makeState({
      currentTurn: 1,
      phase: 'ACTION',
      players: beforeInspectionPlayers,
      log: afterInspectionLog,
      _inspectionSeq: 1,
      _inspectionEvents: [{
        seq: 1,
        card: inspectionCard,
        target: 2,
        beforePlayers: beforeInspectionPlayers,
        beforeLog: beforeInspectionLog,
        afterPlayers: beforeInspectionPlayers,
        afterLog: afterInspectionLog,
        statEvents: [],
        statEventSeq: 0,
      }],
      _visualEvents: [bewitchEvent],
    });
    const repeatedRotated = {
      ...rotated,
      drawReveal: { card: gift, drawerIdx: 2, needsDecision: false },
    };
    const first = buildAction(rotated, {
      previousGs: makeState({ currentTurn: 1, phase: 'ACTION', players: beforePlayers, log: [] }),
      buildAnimQueue,
    });
    expect(first.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    const sanDamageIndices = first.queue
      .map((step, idx) => (step.type === 'SAN_DAMAGE' ? idx : -1))
      .filter(idx => idx >= 0);
    const inspectionRevealIdx = first.queue.findIndex(step => step.type === 'DRAW_CARD' && step.card === inspectionCard);
    expect(sanDamageIndices).toHaveLength(1);
    expect(inspectionRevealIdx).toBeGreaterThan(-1);
    expect(sanDamageIndices[0]).toBeLessThan(inspectionRevealIdx);

    const second = buildAction(repeatedRotated, {
      previousGs: makeState({ currentTurn: 1, phase: 'ACTION', players: beforePlayers, log: [] }),
      consumedVisualEventIds: new Set(first.consumedVisualEventIds),
      buildAnimQueue,
    });
    expect(second.type).toBe(MP_REMOTE_REPLAY.SET_STATE);
    expect(second.gs._visualEvents).toEqual([]);
  });

  it('targets bewitch SAN damage at the bewitched player after rotating to their view', () => {
    const gift = { id: 'gift1', name: '蛊惑礼物', key: 'A1', type: 'zone' };
    const rawBeforePlayers = [
      player('你'),
      { ...player('艾伦'), role: '邪祀者', hand: [gift] },
      { ...player('贝拉'), san: 8 },
    ];
    const rawAfterPlayers = [
      player('你'),
      { ...player('艾伦'), role: '邪祀者', hand: [] },
      { ...player('贝拉'), san: 6, hand: [gift] },
    ];
    const rawState = makeState({
      currentTurn: 1,
      phase: 'ACTION',
      players: rawAfterPlayers,
      log: [
        '艾伦（邪祀者）对 贝拉 【蛊惑】，赠予 [A1] 蛊惑礼物',
        '贝拉 遭遇邪神 蛊惑礼物（第1次），失去2SAN',
      ],
      _statEventSeq: 1,
      _statEvents: [{
        seq: 1,
        type: 'SAN_LOSS',
        target: 2,
        from: { hp: 10, san: 8, isDead: false },
        to: { hp: 10, san: 6, isDead: false },
        reason: '邪神遭遇',
      }],
      _visualEvents: [{
        type: 'bewitchGift',
        id: 'bewitch-san-target',
        sourceIdx: 1,
        targetIdx: 2,
        targetName: '贝拉',
        card: gift,
        msgs: ['艾伦（邪祀者）对 贝拉 【蛊惑】，赠予 [A1] 蛊惑礼物'],
      }],
    });
    const rotated = rotateGsForViewer(rawState, 2);
    const previousGs = rotateGsForViewer(makeState({
      currentTurn: 1,
      phase: 'ACTION',
      players: rawBeforePlayers,
      log: [],
      _statEventSeq: 0,
    }), 2);
    const action = buildAction(rotated, { previousGs, buildAnimQueue });

    expect(rotated._visualEvents[0]).toMatchObject({ sourceIdx: 2, targetIdx: 0 });
    expect(rotated._statEvents[0].target).toBe(0);
    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue.find(step => step.type === 'SAN_DAMAGE')).toMatchObject({ hitIndices: [0] });
  });

  it('does not let stale bewitch visualEvents override the next draw replay', () => {
    const gift = { id: 'gift1', name: '蛊惑礼物', key: 'A1', type: 'zone' };
    const nextCard = { id: 'next1', name: '下一回合摸牌', key: 'B2', type: 'zone' };
    const action = buildAction(makeState({
      currentTurn: 2,
      phase: 'DRAW_REVEAL',
      drawReveal: { card: nextCard, drawerIdx: 2, needsDecision: true },
      _turnStartLogs: ['── 贝拉 的回合开始 ──'],
      _drawLogs: ['贝拉 摸到 下一回合摸牌'],
      _visualEvents: [
        { type: 'bewitchGift', sourceIdx: 1, targetIdx: 2, targetName: '贝拉', card: gift, msgs: ['旧蛊惑事件'] },
        { type: 'turnStart', playerIdx: 2, playerName: '贝拉', msgs: ['── 贝拉 的回合开始 ──'] },
        { type: 'drawCard', playerIdx: 2, playerName: '贝拉', card: nextCard, msgs: ['贝拉 摸到 下一回合摸牌'] },
      ],
    }), {
      previousGs: makeState({ currentTurn: 1, phase: 'ACTION' }),
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue[0]).toMatchObject({ type: 'YOUR_TURN', name: '贝拉' });
    expect(action.queue[1]).toMatchObject({ type: 'DRAW_CARD', card: nextCard, triggerName: '贝拉', targetPid: 2 });
    expect(action.queue.some(step => step.type === 'SKILL_BEWITCH')).toBe(false);
    expect(action.pendingGs._visualEvents).toEqual([]);
  });

  it('prefers the actual draw state even when only a stale bewitch visualEvent remains', () => {
    const gift = { id: 'gift1', name: '蛊惑礼物', key: 'A1', type: 'zone' };
    const nextCard = { id: 'next1', name: '下一回合摸牌', key: 'B2', type: 'zone' };
    const action = buildAction(makeState({
      currentTurn: 2,
      phase: 'DRAW_REVEAL',
      drawReveal: { card: nextCard, drawerIdx: 2, needsDecision: true },
      _turnStartLogs: ['── 贝拉 的回合开始 ──'],
      _drawLogs: ['贝拉 摸到 下一回合摸牌'],
      _visualEvents: [
        { type: 'bewitchGift', sourceIdx: 1, targetIdx: 2, targetName: '贝拉', card: gift, msgs: ['旧蛊惑事件'] },
      ],
    }), {
      previousGs: makeState({ currentTurn: 1, phase: 'ACTION' }),
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue[0]).toMatchObject({ type: 'YOUR_TURN', name: '贝拉' });
    expect(action.queue[1]).toMatchObject({ type: 'DRAW_CARD', card: nextCard, triggerName: '贝拉', targetPid: 2 });
    expect(action.queue.some(step => step.type === 'SKILL_BEWITCH')).toBe(false);
  });

  it('does not let stale bewitch log fallback override the next draw replay', () => {
    const gift = { id: 'gift1', name: '蛊惑礼物', key: 'A1', type: 'zone' };
    const nextCard = { id: 'next1', name: '下一回合摸牌', key: 'B2', type: 'zone' };
    const action = buildAction(makeState({
      currentTurn: 2,
      phase: 'DRAW_REVEAL',
      players: [player('你'), player('艾伦'), { ...player('贝拉'), hand: [gift] }],
      log: [
        '艾伦（邪祀者）对 贝拉 【蛊惑】，赠予 [A1] 蛊惑礼物',
        '── 贝拉 的回合开始 ──',
        '贝拉 摸到 下一回合摸牌',
      ],
      drawReveal: { card: nextCard, drawerIdx: 2, needsDecision: true },
      _turnStartLogs: ['── 贝拉 的回合开始 ──'],
      _drawLogs: ['贝拉 摸到 下一回合摸牌'],
    }), {
      previousGs: makeState({ currentTurn: 1, phase: 'ACTION', log: [] }),
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue[0]).toMatchObject({ type: 'YOUR_TURN', name: '贝拉' });
    expect(action.queue[1]).toMatchObject({ type: 'DRAW_CARD', card: nextCard, triggerName: '贝拉', targetPid: 2 });
    expect(action.queue.some(step => step.type === 'SKILL_BEWITCH')).toBe(false);
  });

  it('does not treat older bewitch logs followed by draw confirmation as a new bewitch action', () => {
    const gifted = { id: 'gift1', name: '蛊惑礼物', key: 'A1', type: 'zone' };
    const kept = { id: 'kept1', name: '收入牌', key: 'B2', type: 'zone' };
    const action = buildAction(makeState({
      currentTurn: 1,
      phase: 'ACTION',
      players: [
        { ...player('你'), hand: [gifted] },
        { ...player('艾伦'), hand: [kept] },
        player('贝拉'),
      ],
      log: [
        '你（邪祀者）对 艾伦 【蛊惑】，赠予 [A1] 蛊惑礼物',
        '── 艾伦 的回合开始 ──',
        '艾伦 摸到 [B2] 收入牌',
        '艾伦 收入了 [B2] 收入牌',
      ],
    }), {
      previousGs: makeState({
        currentTurn: 1,
        phase: 'DRAW_REVEAL',
        players: [
          { ...player('你'), hand: [] },
          player('艾伦'),
          player('贝拉'),
        ],
        log: [],
      }),
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.SET_STATE);
    expect(action.gs.log.at(-1)).toBe('艾伦 收入了 [B2] 收入牌');
  });

  it('does not replay stale bewitch visualEvents when a later draw is confirmed', () => {
    const gifted = { id: 'gift1', name: '蛊惑礼物', key: 'A1', type: 'zone' };
    const kept = { id: 'kept1', name: '收入牌', key: 'B2', type: 'zone' };
    const staleEvent = {
      type: 'bewitchGift',
      sourceIdx: 0,
      targetIdx: 1,
      targetName: '艾伦',
      card: gifted,
      msgs: ['你（邪祀者）对 艾伦 【蛊惑】，赠予 [A1] 蛊惑礼物'],
    };
    const action = buildAction(makeState({
      currentTurn: 1,
      phase: 'ACTION',
      players: [
        { ...player('你'), hand: [{ id: 'a-hand-1', name: '你的第一张手牌', key: 'C1', type: 'zone' }] },
        { ...player('艾伦'), hand: [gifted, kept] },
        player('贝拉'),
      ],
      log: [
        '你（邪祀者）对 艾伦 【蛊惑】，赠予 [A1] 蛊惑礼物',
        '── 艾伦 的回合开始 ──',
        '艾伦 摸到 [B2] 收入牌',
        '艾伦 收入了 [B2] 收入牌',
      ],
      _visualEvents: [staleEvent],
    }), {
      previousGs: makeState({
        currentTurn: 1,
        phase: 'DRAW_REVEAL',
        drawReveal: { card: kept, drawerIdx: 1, needsDecision: true },
        players: [
          { ...player('你'), hand: [{ id: 'a-hand-1', name: '你的第一张手牌', key: 'C1', type: 'zone' }] },
          { ...player('艾伦'), hand: [gifted] },
          player('贝拉'),
        ],
        log: [
          '你（邪祀者）对 艾伦 【蛊惑】，赠予 [A1] 蛊惑礼物',
          '── 艾伦 的回合开始 ──',
          '艾伦 摸到 [B2] 收入牌',
        ],
      }),
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.SET_STATE);
    expect(action.gs._visualEvents).toEqual([]);
    expect(action.consumedVisualEventIds?.length).toBeGreaterThan(0);
  });

  it('ignores a consumed stale bewitch event when the next draw state arrives', () => {
    const gift = { id: 'gift1', name: '蛊惑礼物', key: 'A1', type: 'zone' };
    const nextCard = { id: 'next1', name: '下一回合摸牌', key: 'B2', type: 'zone' };
    const staleEvent = { type: 'bewitchGift', sourceIdx: 1, targetIdx: 2, targetName: '贝拉', card: gift, msgs: ['旧蛊惑事件'] };
    const first = buildAction(makeState({
      currentTurn: 1,
      phase: 'ACTION',
      _visualEvents: [staleEvent],
    }));
    const action = buildAction(makeState({
      currentTurn: 2,
      phase: 'DRAW_REVEAL',
      drawReveal: { card: nextCard, drawerIdx: 2, needsDecision: true },
      _turnStartLogs: ['── 贝拉 的回合开始 ──'],
      _drawLogs: ['贝拉 摸到 下一回合摸牌'],
      _visualEvents: [staleEvent],
    }), {
      previousGs: makeState({ currentTurn: 1, phase: 'ACTION' }),
      consumedVisualEventIds: new Set(first.consumedVisualEventIds),
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue[0]).toMatchObject({ type: 'YOUR_TURN', name: '贝拉' });
    expect(action.queue[1]).toMatchObject({ type: 'DRAW_CARD', card: nextCard, triggerName: '贝拉', targetPid: 2 });
    expect(action.queue.some(step => step.type === 'SKILL_BEWITCH')).toBe(false);
  });

  it('uses earthquake visualEvents in remote draw replay and clears them afterward', () => {
    const quakeCard = { id: 'quake', name: '地动山摇', key: 'B2', type: 'allDiscard' };
    const beforePlayers = [
      { ...player('你-before'), hand: [{ id: 'you-card' }] },
      { ...player('艾伦-before'), hand: [{ id: 'allen-card' }] },
      { ...player('贝拉-before'), hand: [{ id: 'bella-card' }] },
    ];
    const afterPlayers = [
      { ...player('你-after'), hand: [{ id: 'you-card' }] },
      { ...player('艾伦-after'), hand: [] },
      { ...player('贝拉-after'), hand: [{ id: 'bella-card' }] },
    ];
    const event = createEarthquakeEvent({
      beforePlayers,
      beforeDiscard: [],
      discardEvents: [{ playerIndex: 1, card, afterPlayers, afterDiscard: [card] }],
      msgs: ['艾伦 摸到 [B2] 地动山摇（强制触发）', '艾伦 失去了 测试牌'],
    });
    const action = buildAction(makeState({
      currentTurn: 1,
      phase: 'DRAW_REVEAL',
      players: afterPlayers,
      drawReveal: { card: quakeCard, drawerIdx: 1, needsDecision: false },
      _turnStartLogs: ['── 艾伦 的回合开始 ──'],
      _drawLogs: ['艾伦 摸到 [B2] 地动山摇（强制触发）'],
      _playersBeforeThisDraw: beforePlayers,
      _visualEvents: [event],
    }), {
      previousGs: makeState({ currentTurn: 0, phase: 'ACTION', players: beforePlayers }),
      buildAnimQueue,
    });
    const types = action.queue.map(step => step.type);

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(types).toContain('EARTHQUAKE');
    expect(action.pendingGs._visualEvents).toEqual([]);
    expect(action.consumedVisualEventIds?.length).toBeGreaterThan(0);
  });

  it('replays earthquake visualEvents even after the draw state has already resolved', () => {
    const beforePlayers = [
      { ...player('你-before'), hand: [{ id: 'you-card' }] },
      { ...player('艾伦-before'), hand: [{ id: 'allen-card' }] },
      { ...player('贝拉-before'), hand: [{ id: 'bella-card' }] },
    ];
    const afterPlayers = [
      { ...player('你-after'), hand: [{ id: 'you-card' }] },
      { ...player('艾伦-after'), hand: [] },
      { ...player('贝拉-after'), hand: [{ id: 'bella-card' }] },
    ];
    const log = ['艾伦 收入了 [B2] 地动山摇', '艾伦 失去了 测试牌'];
    const event = createEarthquakeEvent({
      beforePlayers,
      beforeDiscard: [],
      discardEvents: [{ playerIndex: 1, card, afterPlayers, afterDiscard: [card] }],
      msgs: log,
    });
    const action = buildAction(makeState({
      currentTurn: 1,
      phase: 'ACTION',
      players: afterPlayers,
      discard: [card],
      drawReveal: null,
      log,
      _visualEvents: [event],
    }), {
      previousGs: makeState({ currentTurn: 1, phase: 'DRAW_REVEAL', players: beforePlayers, log: [] }),
      buildAnimQueue,
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue.map(step => step.type)).toEqual(['EARTHQUAKE', 'STATE_PATCH']);
    expect(action.queue[0]).toMatchObject({ beforePlayers, beforeDiscard: [] });
    expect(action.queue.at(-1)).toMatchObject({ players: afterPlayers, discard: [card], log, phase: 'ACTION' });
    expect(action.pendingGs._visualEvents).toEqual([]);
    expect(action.consumedVisualEventIds?.length).toBeGreaterThan(0);
  });

  it('does not mistake a new earthquake with the same visible payload for an already consumed one', () => {
    const quakeCard = { id: 'quake', name: '地动山摇', key: 'B2', type: 'allDiscard' };
    const drawLog = '艾伦 摸到 [B2] 地动山摇（强制触发）';
    const firstEvent = createEarthquakeEvent({ beforePlayers: [], beforeDiscard: [], discardEvents: [], msgs: [drawLog] });
    const secondEvent = createEarthquakeEvent({ beforePlayers: [], beforeDiscard: [], discardEvents: [], msgs: [drawLog] });
    expect(secondEvent.id).not.toBe(firstEvent.id);

    const action = buildAction(makeState({
      currentTurn: 1,
      phase: 'ACTION',
      drawReveal: { card: quakeCard, drawerIdx: 1, needsDecision: false },
      _turnStartLogs: ['── 艾伦 的回合开始 ──'],
      _drawLogs: [drawLog],
      _playersBeforeThisDraw: [player('你-before'), player('艾伦-before'), player('贝拉-before')],
      _visualEvents: [secondEvent],
    }), {
      previousGs: makeState({ currentTurn: 0, phase: 'ACTION' }),
      consumedVisualEventIds: new Set([firstEvent.id]),
      buildAnimQueue,
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue.map(step => step.type)).toContain('EARTHQUAKE');
    expect(action.consumedVisualEventIds).toContain(secondEvent.id);
  });

  it('prioritizes endless corridor replay queue before next-turn intro on remote final state', () => {
    const nextCard = { id: 'next', name: '下一回合牌', key: 'B1', type: 'zone' };
    const replayEvent = createEndlessCorridorReplayEvent({
      actorIdx: 1,
      actorName: '艾伦',
      beforePlayers: [player('你-before'), player('艾伦-before'), player('贝拉-before')],
      beforeDiscard: [{ id: 'old-discard' }],
      queue: [
        { type: 'ENDLESS_CORRIDOR_TUNNEL' },
        { type: 'DRAW_CARD', card, triggerName: '无尽通道', targetPid: 1, skipTravel: true, msgs: ['【无尽通道】重新摸到 测试牌'] },
        { type: 'DISCARD', card, triggerName: '艾伦', targetPid: 1, msgs: ['艾伦 弃置了 测试牌'] },
      ],
      msgs: ['【无尽通道】艾伦展示所有手牌：测试牌'],
    });
    const action = buildAction(makeState({
      currentTurn: 2,
      phase: 'DRAW_REVEAL',
      drawReveal: { card: nextCard, drawerIdx: 2, needsDecision: true },
      _turnStartLogs: ['── 贝拉 的回合开始 ──'],
      _drawLogs: ['贝拉 摸到 下一回合牌'],
      _visualEvents: [replayEvent],
    }), {
      previousGs: makeState({ currentTurn: 1, phase: 'ACTION' }),
      buildAnimQueue,
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue.slice(0, 3).map(step => step.type)).toEqual(['ENDLESS_CORRIDOR_TUNNEL', 'DRAW_CARD', 'DISCARD']);
    expect(action.queue[0]).toMatchObject({
      visualSetupTiming: 'queueStart',
      visualSetupPatch: {
        players: [player('你-before'), player('艾伦-before'), player('贝拉-before')],
        discard: [{ id: 'old-discard' }],
      },
    });
    const nextTurnIdx = action.queue.findIndex(step => step.type === 'YOUR_TURN');
    expect(nextTurnIdx).toBeGreaterThan(2);
    expect(action.queue[nextTurnIdx]).toMatchObject({ type: 'YOUR_TURN', name: '贝拉' });
    expect(action.queue[nextTurnIdx + 1]).toMatchObject({ type: 'DRAW_CARD', card: nextCard, triggerName: '贝拉', targetPid: 2 });
    expect(action.queue.at(-1)).toMatchObject({
      type: 'STATE_PATCH',
      currentTurn: 2,
      phase: 'DRAW_REVEAL',
      drawReveal: expect.objectContaining({ card: nextCard, drawerIdx: 2 }),
    });
    expect(action.pendingGs._visualEvents).toEqual([]);
    expect(action.consumedVisualEventIds).toContain(replayEvent.id);
  });

  it('uses hunt visualEvents for target lock animation', () => {
    const drawLog = '艾伦 摸到 [B2] 地动山摇（强制触发）';
    const action = buildAction(makeState({
      currentTurn: 1,
      phase: 'HUNT_WAIT_REVEAL',
      abilityData: { huntTi: 2 },
      log: [drawLog, '没有追捕关键字的日志'],
      _drawLogs: [drawLog],
      _playersBeforeThisDraw: [player('你-before'), player('艾伦-before'), player('贝拉-before')],
      _earthquakeSeq: 1,
      _earthquakeBeforePlayers: [player('你-quake'), player('艾伦-quake'), player('贝拉-quake')],
      _earthquakeBeforeDiscard: [{ id: 'old-discard' }],
      _earthquakeDiscardEvents: [{ playerIndex: 1, card, afterPlayers: [player('你-after'), player('艾伦-after'), player('贝拉-after')] }],
      _statEvents: [{ type: 'HP_LOSS', target: 2, seq: 9 }],
      _visualEvents: [
        { type: 'huntTarget', sourceIdx: 1, targetIdx: 2, msgs: ['事件追捕'] },
      ],
    }), {
      previousGs: makeState({ currentTurn: 1, phase: 'ACTION' }),
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.START_ANIM);
    expect(action.anim).toMatchObject({ type: 'SKILL_HUNT', targetIdx: 2, msgs: ['事件追捕'] });
    expect(action.pendingGs._visualEvents).toEqual([]);
    expect(action.pendingGs._earthquakeSeq).toBe(1);
    expect(action.pendingGs._drawLogs).toEqual([]);
    expect(action.pendingGs._playersBeforeThisDraw).toBeNull();
    expect(action.pendingGs._earthquakeBeforePlayers).toBeNull();
    expect(action.pendingGs._earthquakeBeforeDiscard).toBeNull();
    expect(action.pendingGs._earthquakeDiscardEvents).toBeNull();
    expect(action.pendingGs._statEvents).toEqual([{ type: 'HP_LOSS', target: 2, seq: 9 }]);
  });

  it('uses hunt reveal visualEvents for hand-to-player-area reveal animation', () => {
    const revealedCard = { id: 'rev1', name: '亮出的牌', key: 'C3', type: 'zone' };
    const action = buildAction(makeState({
      currentTurn: 1,
      phase: 'HUNT_CONFIRM',
      abilityData: { huntTi: 2, revCard: revealedCard },
      log: ['贝拉 亮出 [C3] 亮出的牌'],
      _visualEvents: [
        { type: 'huntReveal', sourceIdx: 1, targetIdx: 2, card: revealedCard, msgs: ['贝拉 亮出 [C3] 亮出的牌'] },
      ],
    }), {
      previousGs: makeState({ currentTurn: 1, phase: 'HUNT_WAIT_REVEAL' }),
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.START_ANIM);
    expect(action.anim).toMatchObject({
      type: 'HUNT_REVEAL_CARD',
      card: revealedCard,
      targetPid: 2,
      msgs: ['贝拉 亮出 [C3] 亮出的牌'],
    });
    expect(action.pendingGs.phase).toBe('HUNT_CONFIRM');
    expect(action.pendingGs._visualEvents).toEqual([]);
  });

  it('uses hunt result visualEvents to show discard before damage for remote players', () => {
    const discardedCard = { id: 'hunter-card', name: '同编号牌', key: 'C3', type: 'zone' };
    const revealedCard = { id: 'rev1', name: '亮出的牌', key: 'C3', type: 'zone' };
    const beforePlayers = [
      player('你'),
      { ...player('艾伦'), hand: [discardedCard] },
      { ...player('贝拉'), hp: 10, hand: [revealedCard] },
    ];
    const afterDiscardPlayers = [
      player('你'),
      { ...player('艾伦'), hand: [] },
      { ...player('贝拉'), hp: 10, hand: [revealedCard] },
    ];
    const afterPlayers = [
      player('你'),
      { ...player('艾伦'), hand: [] },
      { ...player('贝拉'), hp: 7, hand: [revealedCard] },
    ];
    const event = createHuntResultEvent({
      hunterIdx: 1,
      targetIdx: 2,
      revealedCard,
      discardedCard,
      beforePlayers,
      afterDiscardPlayers,
      afterDiscardDiscard: [discardedCard],
      afterPlayers,
      afterResultDiscard: [discardedCard],
      beforeLog: ['旧日志'],
      afterLog: ['旧日志', '弃 [C3] 同编号牌 → 贝拉 受 3HP 伤害'],
      msgs: ['弃 [C3] 同编号牌 → 贝拉 受 3HP 伤害'],
    });
    const action = buildAction(makeState({
      currentTurn: 1,
      phase: 'ACTION',
      players: afterPlayers,
      discard: [discardedCard],
      log: ['旧日志', '弃 [C3] 同编号牌 → 贝拉 受 3HP 伤害'],
      _visualEvents: [event],
    }), {
      previousGs: makeState({ currentTurn: 1, phase: 'HUNT_CONFIRM', players: beforePlayers, log: ['旧日志'] }),
      buildAnimQueue,
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    const types = action.queue.map(step => step.type);
    expect(types[0]).toBe('DISCARD');
    expect(types.indexOf('HP_DAMAGE')).toBeGreaterThan(types.indexOf('DISCARD'));
    expect(action.queue.at(-1)).toMatchObject({
      type: 'STATE_PATCH',
      players: afterPlayers,
      discard: [discardedCard],
      log: ['旧日志', '弃 [C3] 同编号牌 → 贝拉 受 3HP 伤害'],
      phase: 'ACTION',
      abilityData: {},
    });
    expect(action.queue.some(step => step.type === 'SKILL_HUNT')).toBe(false);
    expect(action.queue.some(step => step.type === 'HUNT_REVEAL_CARD')).toBe(false);
    expect(action.visualLock.players).toEqual(beforePlayers);
    expect(action.pendingGs._visualEvents).toEqual([]);
  });

  it('uses hunt result visualEvents for the hunted local player after they revealed a card', () => {
    const discardedCard = { id: 'hunter-card', name: '同编号牌', key: 'C3', type: 'zone' };
    const beforePlayers = [
      { ...player('你'), hp: 10 },
      { ...player('艾伦'), hand: [discardedCard] },
      player('贝拉'),
    ];
    const afterDiscardPlayers = [
      { ...player('你'), hp: 10 },
      { ...player('艾伦'), hand: [] },
      player('贝拉'),
    ];
    const afterPlayers = [
      { ...player('你'), hp: 7 },
      { ...player('艾伦'), hand: [] },
      player('贝拉'),
    ];
    const event = createHuntResultEvent({
      hunterIdx: 1,
      targetIdx: 0,
      discardedCard,
      beforePlayers,
      afterDiscardPlayers,
      afterDiscardDiscard: [discardedCard],
      afterPlayers,
      afterResultDiscard: [discardedCard],
      beforeLog: ['旧日志'],
      afterLog: ['旧日志', '弃 [C3] 同编号牌 → 你 受 3HP 伤害'],
      msgs: ['弃 [C3] 同编号牌 → 你 受 3HP 伤害'],
    });
    const action = buildAction(makeState({
      currentTurn: 1,
      phase: 'ACTION',
      players: afterPlayers,
      discard: [discardedCard],
      log: ['旧日志', '弃 [C3] 同编号牌 → 你 受 3HP 伤害'],
      _visualEvents: [event],
    }), {
      previousGs: makeState({ currentTurn: 1, phase: 'HUNT_CONFIRM', players: beforePlayers, log: ['旧日志'] }),
      buildAnimQueue,
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue.map(step => step.type)).toContain('DISCARD');
    expect(action.queue.map(step => step.type)).toContain('HP_DAMAGE');
    expect(action.visualLock.players).toEqual(beforePlayers);
  });

  it('uses sphinx result visualEvents for correct guess animation', () => {
    const sphinxCard = { id: 'sphinx1', name: '斯芬克斯', key: 'SPH', type: 'zone' };
    const beforePlayers = [player('你'), player('艾伦'), player('贝拉')];
    const afterPlayers = [
      player('你'),
      { ...player('艾伦'), hand: [sphinxCard] },
      player('贝拉'),
    ];
    const event = createSphinxResultEvent({
      actorIdx: 1,
      card: sphinxCard,
      guessCorrect: true,
      msgs: ['艾伦 猜测正确，获得 斯芬克斯'],
    });
    const action = buildAction(makeState({
      currentTurn: 1,
      phase: 'ACTION',
      players: afterPlayers,
      log: ['艾伦 猜测正确，获得 斯芬克斯'],
      _visualEvents: [event],
    }), {
      previousGs: makeState({ currentTurn: 1, phase: 'ACTION', players: beforePlayers, log: [] }),
      buildAnimQueue: vi.fn(() => []),
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue.map(step => step.type)).toEqual(['DRAW_CARD', 'CARD_TRANSFER', 'STATE_PATCH']);
    expect(action.queue[0]).toMatchObject({
      type: 'DRAW_CARD',
      card: sphinxCard,
      triggerName: '斯芬克斯',
      targetPid: 1,
      skipTravel: true,
      guessCorrect: true,
    });
    expect(action.queue[1]).toMatchObject({
      fromPid: -1,
      dest: 'player',
      toPid: 1,
      count: 1,
    });
    expect(action.pendingGs._visualEvents).toEqual([]);
  });

  it('uses sphinx result visualEvents for wrong guess animation', () => {
    const sphinxCard = { id: 'sphinx1', name: '斯芬克斯', key: 'SPH', type: 'zone' };
    const beforePlayers = [player('你'), player('艾伦'), player('贝拉')];
    const afterPlayers = [
      { ...player('你'), hp: 8 },
      player('艾伦'),
      player('贝拉'),
    ];
    const event = createSphinxResultEvent({
      actorIdx: 1,
      card: sphinxCard,
      guessCorrect: false,
      msgs: ['艾伦 猜测错误', '艾伦 失去 2 HP'],
    });
    const wrongGuessAnimQueue = vi.fn(() => [{ type: 'HP_DAMAGE', hitIndices: [1] }]);
    const action = buildAction(makeState({
      currentTurn: 1,
      phase: 'ACTION',
      players: afterPlayers,
      log: ['艾伦 猜测错误', '艾伦 失去 2 HP'],
      _visualEvents: [event],
    }), {
      previousGs: makeState({ currentTurn: 1, phase: 'ACTION', players: beforePlayers, log: [] }),
      buildAnimQueue: wrongGuessAnimQueue,
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue[0]).toMatchObject({
      type: 'DRAW_CARD',
      card: sphinxCard,
      triggerName: '斯芬克斯',
      targetPid: 1,
      skipTravel: true,
      guessCorrect: false,
    });
    expect(action.queue.some(step => step.type === 'HP_DAMAGE')).toBe(true);
    expect(action.pendingGs._visualEvents).toEqual([]);
  });

  it('targets sphinx result at the correct player after rotating to their view', () => {
    const sphinxCard = { id: 'sphinx1', name: '斯芬克斯', key: 'SPH', type: 'zone' };
    const rawBeforePlayers = [player('你'), player('艾伦'), player('贝拉')];
    const rawAfterPlayers = [
      player('你'),
      { ...player('艾伦'), hand: [sphinxCard] },
      player('贝拉'),
    ];
    const rawState = makeState({
      currentTurn: 1,
      phase: 'ACTION',
      players: rawAfterPlayers,
      log: ['艾伦 猜测正确，获得 斯芬克斯'],
      _visualEvents: [createSphinxResultEvent({
        actorIdx: 1,
        card: sphinxCard,
        guessCorrect: true,
        msgs: ['艾伦 猜测正确，获得 斯芬克斯'],
      })],
    });
    const rotated = rotateGsForViewer(rawState, 2);
    const previousGs = rotateGsForViewer(makeState({
      currentTurn: 1,
      phase: 'ACTION',
      players: rawBeforePlayers,
      log: [],
    }), 2);
    const action = buildAction(rotated, { previousGs, buildAnimQueue: vi.fn(() => []) });

    expect(rotated._visualEvents[0]).toMatchObject({ actorIdx: 2, guessCorrect: true });
    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue[0]).toMatchObject({
      type: 'DRAW_CARD',
      targetPid: 2,
      triggerName: '斯芬克斯',
      guessCorrect: true,
    });
    expect(action.queue[1]).toMatchObject({
      type: 'CARD_TRANSFER',
      toPid: 2,
    });
  });

  it('plays previous hand-limit discard before the next local draw replay', () => {
    const nextCard = { id: 'next-card', name: '下一张牌', key: 'B2', type: 'zone' };
    const discarded = { id: 'discarded-card', name: '超限弃牌', key: 'A1', type: 'zone' };
    const action = buildAction(makeState({
      currentTurn: 0,
      phase: 'DRAW_REVEAL',
      drawReveal: { card: nextCard, drawerIdx: 0, needsDecision: true },
      _turnStartLogs: ['── 你 的回合开始 ──'],
      _drawLogs: ['你 摸到 [B2] 下一张牌'],
      _playersBeforeThisDraw: [
        { ...player('你'), hand: [] },
        { ...player('艾伦'), hand: [discarded] },
        player('贝拉'),
      ],
      log: ['弃置：[A1] 超限弃牌', '── 你 的回合开始 ──', '你 摸到 [B2] 下一张牌'],
      _visualEvents: [
        { type: 'handLimitDiscard', playerIdx: 1, playerName: '艾伦', cards: [discarded], msgs: ['弃置：[A1] 超限弃牌'] },
        { type: 'turnStart', playerIdx: 0, playerName: '你', msgs: ['── 你 的回合开始 ──'] },
        { type: 'drawCard', playerIdx: 0, playerName: '你', card: nextCard, msgs: ['你 摸到 [B2] 下一张牌'] },
      ],
    }), {
      previousGs: makeState({
        currentTurn: 1,
        phase: 'DISCARD_PHASE',
        players: [
          { ...player('你'), hand: [] },
          { ...player('艾伦'), hand: [discarded] },
          player('贝拉'),
        ],
      }),
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.START_ANIM);
    expect(action.anim).toMatchObject({ type: 'DISCARD', targetPid: 1, card: discarded });
    expect(action.queue[0]).toMatchObject({ type: 'YOUR_TURN' });
    expect(action.queue[1]).toMatchObject({ type: 'DRAW_CARD', card: nextCard, targetPid: 0 });
    expect(action.pendingGs._visualEvents).toEqual([]);
  });

  it('does not play hunt reveal animation for the hunted local player', () => {
    const revealedCard = { id: 'rev1', name: '亮出的牌', key: 'C3', type: 'zone' };
    const action = buildAction(makeState({
      currentTurn: 1,
      phase: 'HUNT_CONFIRM',
      abilityData: { huntTi: 0, revCard: revealedCard },
      log: ['你亮出 [C3] 亮出的牌'],
      _visualEvents: [
        { type: 'huntReveal', sourceIdx: 1, targetIdx: 0, card: revealedCard, msgs: ['你亮出 [C3] 亮出的牌'] },
      ],
    }), {
      previousGs: makeState({ currentTurn: 1, phase: 'HUNT_WAIT_REVEAL' }),
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.SET_STATE);
    expect(action.gs.phase).toBe('HUNT_CONFIRM');
    expect(action.gs._visualEvents).toEqual([]);
  });

  it('masks discard phase for non-active remote players', () => {
    const action = buildAction(makeState({ phase: 'DISCARD_PHASE', currentTurn: 1, abilityData: { discardSelected: [] } }));

    expect(action.type).toBe(MP_REMOTE_REPLAY.SET_STATE);
    expect(action.gs).toMatchObject({ phase: 'ACTION', abilityData: {} });
  });
});
