import { describe, expect, it, vi } from 'vitest';
import { buildAnimQueue } from '../animQueueCore';
import { copyPlayers } from '../coreUtils';
import { buildMpRemoteReplayAction, MP_REMOTE_REPLAY } from '../multiplayerRemoteReplay';
import { rotateGsForViewer } from '../rotateState';
import { createCardEffectEvent, createEarthquakeEvent, createEndlessCorridorReplayEvent, createHuntResultEvent, createSphinxResultEvent, createSwapCardsEvent } from '../visualEvents';

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

  it('replays only the discard when another player abandons a pending god choice', () => {
    const godCard = { id: 'god-discard', name: '奈亚拉托提普', godKey: 'NYA', isGod: true, type: 'god' };
    const beforePlayers = [player('你'), player('艾伦'), player('贝拉')];
    const previousGs = makeState({
      players: beforePlayers,
      currentTurn: 1,
      phase: 'GOD_CHOICE',
      abilityData: { godCard, drawerIdx: 1 },
      log: ['艾伦 摸到 奈亚拉托提普'],
    });
    const buildQueue = vi.fn(() => [{ type: 'DRAW_CARD', card: godCard }]);
    const action = buildMpRemoteReplayAction({
      rotated: makeState({
        players: beforePlayers,
        currentTurn: 1,
        phase: 'ACTION',
        abilityData: {},
        discard: [godCard],
        log: ['艾伦 摸到 奈亚拉托提普', '艾伦 放弃了邪神的馈赠'],
        // The server can retain these turn-start hints until the next turn.
        _drawnCard: godCard,
        _turnStartLogs: ['—— 艾伦 的回合开始 ——'],
        _drawLogs: ['艾伦 摸到 奈亚拉托提普'],
      }),
      previousGs,
      roleRevealed: true,
      buildAnimQueue: buildQueue,
      buildFullHandSwapTransferQueueFromLogs: vi.fn(() => []),
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue[0]).toMatchObject({ type: 'DISCARD', card: godCard, targetPid: 1 });
    expect(action.queue.some(step => step.type === 'DRAW_CARD')).toBe(false);
    expect(buildQueue).not.toHaveBeenCalled();
  });

  it('does not replay the god draw after another player resolves a god choice', () => {
    const godCard = { id: 'god-worship', name: '阿波菲斯', godKey: 'APO', isGod: true, type: 'god' };
    const beforePlayers = [player('你'), player('艾伦'), player('贝拉')];
    const buildQueue = vi.fn(() => [
      { type: 'DRAW_CARD', card: godCard },
      { type: 'APOPHIS_ECLIPSE', msgs: ['黑夜降临'] },
    ]);
    const action = buildMpRemoteReplayAction({
      rotated: makeState({
        players: beforePlayers,
        currentTurn: 1,
        phase: 'ACTION',
        abilityData: {},
        log: ['艾伦 摸到 阿波菲斯', '艾伦 信仰了 阿波菲斯'],
        _drawnCard: godCard,
        _turnStartLogs: ['—— 艾伦 的回合开始 ——'],
        _drawLogs: ['艾伦 摸到 阿波菲斯'],
      }),
      previousGs: makeState({
        players: beforePlayers,
        currentTurn: 1,
        phase: 'GOD_CHOICE',
        abilityData: { godCard, drawerIdx: 1 },
        log: ['艾伦 摸到 阿波菲斯'],
      }),
      roleRevealed: true,
      buildAnimQueue: buildQueue,
      buildFullHandSwapTransferQueueFromLogs: vi.fn(() => []),
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue.some(step => step.type === 'DRAW_CARD')).toBe(false);
    expect(action.queue).toContainEqual(expect.objectContaining({ type: 'APOPHIS_ECLIPSE' }));
  });

  it('turns moldy-food logs into a moldy-food dice animation action', () => {
    const action = buildAction(makeState({
      log: ['【霉变食物】艾伦 掷出 1 点（单数），失去 1 HP，下回合开始时不能摸牌'],
    }));

    expect(action.type).toBe(MP_REMOTE_REPLAY.DICE_ROLL);
    expect(action.anim).toMatchObject({ type: 'DICE_ROLL', diceMode: 'moldyFood', d1: 1, rollerName: '艾伦' });
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
    expect(action.queue.map(step => step.type)).toEqual(['DICE_ROLL', 'RANDOM_TARGET', 'THROW_STONE', 'HP_DAMAGE', 'STATE_PATCH']);
    expect(action.queue[0]).toMatchObject({ diceMode: 'throwStone', d1: 4, rollerName: '艾伦' });
    expect(action.queue[0]).not.toHaveProperty('dodgeSuccess');
    expect(action.queue[1]).toMatchObject({ sourceIdx: 1, targetIdx: 2, label: '投掷石块', roll: 4, damage: 3 });
    expect(action.queue[2]).toMatchObject({ type: 'THROW_STONE', sourceIdx: 1, targetIdx: 2, damage: 3 });
    expect(action.queue[3]).toMatchObject({ hitIndices: [2] });
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
    expect(action.queue.some(step => step.type === 'CARD_TRANSFER' && step.effect === 'draw')).toBe(false);
    expect(action.queue.at(-1)).toMatchObject({ type: 'STATE_PATCH' });
    expect(action.visualLock.players[1].name).toBe('艾伦-before');
    expect(buildAnimQueue).toHaveBeenCalledOnce();
  });

  it('replays remote kept draw as effects followed by the keep-card transfer', () => {
    const beforePlayers = [player('你-before'), player('艾伦-before'), player('贝拉-before')];
    const afterPlayers = [player('你'), { ...player('艾伦'), hand: [card], hp: 8 }, player('贝拉')];
    const action = buildAction(
      makeState({
        currentTurn: 1,
        phase: 'ACTION',
        players: afterPlayers,
        _drawnCard: card,
        _aiDrawnCard: card,
        _playersBeforeThisDraw: beforePlayers,
        _turnStartLogs: ['── 艾伦 的回合开始 ──'],
        _drawLogs: ['艾伦 摸到 测试牌，选择收入手牌并触发效果'],
        _statLogs: ['艾伦 失去 2 HP'],
        log: ['── 艾伦 的回合开始 ──', '艾伦 摸到 测试牌，选择收入手牌并触发效果', '艾伦 失去 2 HP'],
      }),
      {
        previousGs: makeState({ currentTurn: 0, players: beforePlayers, log: [] }),
        buildAnimQueue: vi.fn(() => [{ type: 'HP_DAMAGE', hitIndices: [1] }]),
      },
    );

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    const damageIdx = action.queue.findIndex(step => step.type === 'HP_DAMAGE');
    const transferIdx = action.queue.findIndex(step => step.type === 'CARD_TRANSFER' && step.effect === 'draw');

    expect(transferIdx).toBeGreaterThan(damageIdx);
    expect(action.queue[transferIdx]).toMatchObject({
      fromPid: 1,
      dest: 'player',
      toPid: 1,
      sourceAnchor: 'playerArea',
      cards: [card],
    });
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

  it('does not replay a previous card bespoke effect before the next draw decision', () => {
    const previousCard = { id: 'night-wind', key: 'C4', name: '夜风呼啸', type: 'zone' };
    const nextCard = { id: 'burrower', key: 'D1', name: '钻地魔虫', type: 'zone' };
    const staleEffect = createCardEffectEvent({
      effectKey: 'snakeTrap',
      card: previousCard,
      actorIdx: 1,
      beforePlayers: [player('你'), player('黛安娜'), player('贝拉')],
      msgs: ['全体存活角色失去 1 HP 和 SAN'],
    });
    const staleStep = { type: 'SNAKE_TRAP', card: previousCard };
    const buildAnimQueue = vi.fn((oldState, newState) => (
      oldState._visualEvents?.some(event => event.id === staleEffect.id) &&
      newState._visualEvents?.some(event => event.id === staleEffect.id)
        ? []
        : [staleStep]
    ));

    const action = buildAction(makeState({
      currentTurn: 0,
      phase: 'DRAW_REVEAL',
      drawReveal: { card: nextCard, drawerIdx: 0, needsDecision: true },
      _turnStartLogs: ['── 你 的回合开始 ──'],
      _drawLogs: ['你 摸到 [D1] 钻地魔虫'],
      _visualEvents: [staleEffect],
    }), {
      previousGs: makeState({ currentTurn: 1, phase: 'ACTION' }),
      buildAnimQueue,
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.START_ANIM);
    expect(action.queue.some(step => step.type === 'SNAKE_TRAP')).toBe(false);
    expect(buildAnimQueue.mock.calls.some(([oldState]) => (
      oldState._visualEvents?.some(event => event.id === staleEffect.id)
    ))).toBe(true);
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

  it('keeps final SAN loss animation before cultist game over for remote bewitch replay', () => {
    const godGift = { id: 'god-vri', name: '弗栗多', godKey: 'VRI', isGod: true, type: 'god' };
    const beforePlayers = [
      { ...player('你'), role: '邪祀者', hand: [godGift] },
      { ...player('黛安娜'), role: '寻宝者', hp: 10, san: 5, hand: [] },
      { ...player('贝拉'), role: '追猎者' },
    ];
    const afterPlayers = [
      { ...player('你'), role: '邪祀者', hand: [] },
      { ...player('黛安娜'), role: '寻宝者', hp: 10, san: 0, hand: [godGift] },
      { ...player('贝拉'), role: '追猎者' },
    ];
    const action = buildAction(makeState({
      currentTurn: 0,
      phase: 'ACTION',
      players: afterPlayers,
      log: [
        '你对 黛安娜 【蛊惑】，赠予 弗栗多',
        '黛安娜 遭遇邪神 弗栗多（第4次），失去4SAN',
        '黛安娜 被迫改信新神，SAN-1',
        '黛安娜 信仰了 弗栗多，获得不灭之躯(Lv.1)',
      ],
      gameOver: { winner: '邪祀者', reason: '黛安娜 的理智归零，邪神苏醒！邪祀者（你）获胜！' },
      _statEventSeq: 2,
      _statEvents: [
        {
          seq: 1,
          type: 'SAN_LOSS',
          target: 1,
          from: { hp: 10, san: 5, isDead: false },
          to: { hp: 10, san: 1, isDead: false },
          reason: '邪神遭遇',
        },
        {
          seq: 2,
          type: 'SAN_LOSS',
          target: 1,
          from: { hp: 10, san: 1, isDead: false },
          to: { hp: 10, san: 0, isDead: false },
          reason: '改信新神',
        },
      ],
      _visualEvents: [
        { type: 'bewitchGift', sourceIdx: 0, targetIdx: 1, targetName: '黛安娜', card: godGift, msgs: ['你对 黛安娜 【蛊惑】，赠予 弗栗多'] },
        { type: 'statEvents', statEvents: [
          {
            seq: 1,
            type: 'SAN_LOSS',
            target: 1,
            from: { hp: 10, san: 5, isDead: false },
            to: { hp: 10, san: 1, isDead: false },
            reason: '邪神遭遇',
          },
          {
            seq: 2,
            type: 'SAN_LOSS',
            target: 1,
            from: { hp: 10, san: 1, isDead: false },
            to: { hp: 10, san: 0, isDead: false },
            reason: '改信新神',
          },
        ], msgs: ['黛安娜 遭遇邪神 弗栗多（第4次），失去4SAN', '黛安娜 被迫改信新神，SAN-1'] },
      ],
    }), {
      previousGs: makeState({ currentTurn: 0, phase: 'BEWITCH_SELECT_TARGET', players: beforePlayers, log: [] }),
      buildAnimQueue,
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue.map(step => step.type)).toContain('SAN_DAMAGE');
    expect(action.pendingGs.gameOver?.winner).toBe('邪祀者');
  });

  it('replays generic area-card SAN inspections for remote players', () => {
    const ratSwarm = { id: 'rats', name: '鼠群', key: 'D3', type: 'zone' };
    const calmCard = { id: 'calm', name: '暂时的平静', effect: 'calm' };
    const amnesiaCard = { id: 'amnesia', name: '失忆', effect: 'amnesia' };
    const beforePlayers = [
      { ...player('你'), san: 7, hand: [ratSwarm] },
      { ...player('诺亚'), san: 7 },
      { ...player('奥托'), san: 7 },
    ];
    const afterSanPlayers = copyPlayers(beforePlayers);
    afterSanPlayers[1].san = 6;
    afterSanPlayers[2].san = 6;
    const finalPlayers = copyPlayers(afterSanPlayers);
    finalPlayers[2].skillDisabledNextTurn = true;
    const log = [
      '你 收入了 [D3] 鼠群',
      '全体存活角色失去 1 SAN',
      '诺亚 的SAN检定结果为"暂时的平静"',
      '奥托 的SAN检定结果为"失忆"',
      '奥托 失忆，下一回合禁用技能',
    ];
    const action = buildAction(makeState({
      currentTurn: 0,
      phase: 'ACTION',
      players: finalPlayers,
      log,
      _statEventSeq: 1,
      _statEvents: [{
        seq: 1,
        type: 'SAN_LOSS',
        target: 1,
        from: { hp: 10, san: 7, isDead: false },
        to: { hp: 10, san: 6, isDead: false },
        reason: '鼠群',
      }, {
        seq: 1,
        type: 'SAN_LOSS',
        target: 2,
        from: { hp: 10, san: 7, isDead: false },
        to: { hp: 10, san: 6, isDead: false },
        reason: '鼠群',
      }],
      _inspectionSeq: 2,
      _inspectionEvents: [{
        seq: 1,
        card: calmCard,
        target: 1,
        beforePlayers: afterSanPlayers,
        beforeLog: log.slice(0, 2),
        afterPlayers: afterSanPlayers,
        afterLog: log.slice(0, 3),
        statEvents: [],
        statEventSeq: null,
      }, {
        seq: 2,
        card: amnesiaCard,
        target: 2,
        beforePlayers: afterSanPlayers,
        beforeLog: log.slice(0, 3),
        afterPlayers: finalPlayers,
        afterLog: log,
        statEvents: [],
        statEventSeq: null,
      }],
    }), {
      previousGs: makeState({ currentTurn: 0, phase: 'DRAW_REVEAL', players: beforePlayers, log: [] }),
      buildAnimQueue,
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    const sanIdx = action.queue.findIndex(step => step.type === 'SAN_DAMAGE');
    const inspectionDrawIdxs = action.queue
      .map((step, idx) => (step.type === 'DRAW_CARD' && step.triggerName === '检定牌' ? idx : -1))
      .filter(idx => idx >= 0);
    expect(sanIdx).toBeGreaterThanOrEqual(0);
    expect(inspectionDrawIdxs).toHaveLength(2);
    expect(inspectionDrawIdxs[0]).toBeGreaterThan(sanIdx);
    expect(action.pendingGs._visualEvents).toEqual([]);
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

  it('keeps both inspection chains during forced convert after god encounter in multiplayer draw replay', () => {
    const godCard = { id: 'god-zhu', name: '烛九阴', godKey: 'ZHU', isGod: true, type: 'god' };
    const selfHarmCard = { id: 'ins-self-2', name: '自残', effect: 'selfDamageHP', value: 1 };
    const insomniaCard = { id: 'ins-insomnia', name: '失眠', effect: 'disableRest', value: 1 };
    const beforeDrawPlayers = [
      { ...player('你'), hp: 10, san: 10 },
      { ...player('诺亚'), hp: 10, san: 9, godName: 'OLD', godLevel: 1 },
      player('贝拉'),
    ];
    const beforeFirstInspectionPlayers = [
      { ...player('你'), hp: 10, san: 10 },
      { ...player('诺亚'), hp: 10, san: 7, godName: 'OLD', godLevel: 1 },
      player('贝拉'),
    ];
    const afterFirstInspectionPlayers = [
      { ...player('你'), hp: 10, san: 10 },
      { ...player('诺亚'), hp: 9, san: 7, godName: 'OLD', godLevel: 1 },
      player('贝拉'),
    ];
    const beforeSecondInspectionPlayers = [
      { ...player('你'), hp: 10, san: 10 },
      { ...player('诺亚'), hp: 9, san: 6, godName: 'OLD', godLevel: 1 },
      player('贝拉'),
    ];
    const afterSecondInspectionPlayers = [
      { ...player('你'), hp: 10, san: 10 },
      { ...player('诺亚'), hp: 9, san: 6, godName: 'ZHU', godLevel: 1, disableRest: true },
      player('贝拉'),
    ];
    const baseLog = [
      '── 诺亚 的回合开始 ──',
      '诺亚 摸到 烛九阴',
      '诺亚 遭遇邪神 烛九阴（第2次），失去2SAN',
    ];
    const fullLog = [
      ...baseLog,
      '诺亚 的SAN检定结果为"自残"',
      '诺亚 自残，失去 1 HP',
      '诺亚 被迫改信新神，SAN-1',
      '诺亚 的SAN检定结果为"失眠"',
      '诺亚 失眠，下一回合禁用休息',
    ];
    const action = buildAction(makeState({
      currentTurn: 1,
      phase: 'GOD_CHOICE',
      players: afterSecondInspectionPlayers,
      abilityData: { godCard, drawerIdx: 1, godEncounterCost: 0 },
      log: fullLog,
      _turnStartLogs: ['── 诺亚 的回合开始 ──'],
      _drawLogs: ['诺亚 摸到 烛九阴', '诺亚 遭遇邪神 烛九阴（第2次），失去2SAN'],
      _playersBeforeThisDraw: beforeDrawPlayers,
      _statEventSeq: 3,
      _statEvents: [
        {
          seq: 1,
          type: 'SAN_LOSS',
          target: 1,
          from: { hp: 10, san: 9, isDead: false },
          to: { hp: 10, san: 7, isDead: false },
          reason: '邪神遭遇',
        },
        {
          seq: 2,
          type: 'HP_LOSS',
          target: 1,
          from: { hp: 10, san: 7, isDead: false },
          to: { hp: 9, san: 7, isDead: false },
          reason: '自残',
        },
        {
          seq: 3,
          type: 'SAN_LOSS',
          target: 1,
          from: { hp: 9, san: 7, isDead: false },
          to: { hp: 9, san: 6, isDead: false },
          reason: '改信新神',
        },
      ],
      _inspectionSeq: 2,
      _inspectionEvents: [
        {
          seq: 1,
          card: selfHarmCard,
          target: 1,
          beforePlayers: beforeFirstInspectionPlayers,
          beforeLog: baseLog,
          afterPlayers: afterFirstInspectionPlayers,
          afterLog: [
            ...baseLog,
            '诺亚 的SAN检定结果为"自残"',
            '诺亚 自残，失去 1 HP',
          ],
          statEvents: [{
            seq: 2,
            type: 'HP_LOSS',
            target: 1,
            from: { hp: 10, san: 7, isDead: false },
            to: { hp: 9, san: 7, isDead: false },
            reason: '自残',
          }],
          statEventSeq: 2,
        },
        {
          seq: 2,
          card: insomniaCard,
          target: 1,
          beforePlayers: beforeSecondInspectionPlayers,
          beforeLog: [
            ...baseLog,
            '诺亚 的SAN检定结果为"自残"',
            '诺亚 自残，失去 1 HP',
            '诺亚 被迫改信新神，SAN-1',
          ],
          afterPlayers: afterSecondInspectionPlayers,
          afterLog: fullLog,
          statEvents: [],
          statEventSeq: 3,
        },
      ],
      _visualEvents: [
        { type: 'turnStart', playerIdx: 1, playerName: '诺亚', msgs: ['── 诺亚 的回合开始 ──'] },
        { type: 'drawCard', playerIdx: 1, playerName: '诺亚', card: godCard, msgs: ['诺亚 摸到 烛九阴'] },
        {
          type: 'statEvents',
          statEvents: [
            {
              seq: 1,
              type: 'SAN_LOSS',
              target: 1,
              from: { hp: 10, san: 9, isDead: false },
              to: { hp: 10, san: 7, isDead: false },
            },
            {
              seq: 2,
              type: 'HP_LOSS',
              target: 1,
              from: { hp: 10, san: 7, isDead: false },
              to: { hp: 9, san: 7, isDead: false },
            },
            {
              seq: 3,
              type: 'SAN_LOSS',
              target: 1,
              from: { hp: 9, san: 7, isDead: false },
              to: { hp: 9, san: 6, isDead: false },
            },
          ],
          msgs: [
            '诺亚 遭遇邪神 烛九阴（第2次），失去2SAN',
            '诺亚 自残，失去 1 HP',
            '诺亚 被迫改信新神，SAN-1',
          ],
        },
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
    const sanDamageIndices = action.queue
      .map((step, idx) => ({ step, idx }))
      .filter(({ step }) => step.type === 'SAN_DAMAGE')
      .map(({ idx }) => idx);
    const inspectionRevealIndices = action.queue
      .map((step, idx) => ({ step, idx }))
      .filter(({ step }) => step.type === 'DRAW_CARD' && (step.card === selfHarmCard || step.card === insomniaCard))
      .map(({ idx }) => idx);
    const hpDamageIdx = action.queue.findIndex(step => step.type === 'HP_DAMAGE');

    expect(sanDamageIndices).toHaveLength(2);
    expect(inspectionRevealIndices).toHaveLength(2);
    expect(sanDamageIndices[0]).toBeGreaterThan(-1);
    expect(inspectionRevealIndices[0]).toBeGreaterThan(sanDamageIndices[0]);
    expect(hpDamageIdx).toBeGreaterThan(inspectionRevealIndices[0]);
    expect(sanDamageIndices[1]).toBeGreaterThan(hpDamageIdx);
    expect(inspectionRevealIndices[1]).toBeGreaterThan(sanDamageIndices[1]);
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
    expect(action.queue[2]).toMatchObject({ fromPid: 0, dest: 'player', toPid: 1, count: 1 });
    expect(action.queue[3]).toMatchObject({ fromPid: 1, dest: 'player', toPid: 0, count: 1 });
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

  it('commits the swapped hand before a following hand-limit discard animation', () => {
    const undergroundSpring = { id: 'spring', name: '地下泉', key: 'C2', type: 'zone' };
    const forestLord = { id: 'forest', name: '森之领主', isGod: true, godKey: 'SHU' };
    const volcano = { id: 'volcano', name: '活火山', key: 'C1', type: 'zone' };
    const beforePlayers = [
      { ...player('你'), hand: [undergroundSpring] },
      { ...player('黛安娜'), hand: [forestLord, volcano] },
      player('贝拉'),
    ];
    const afterSwapPlayers = [
      { ...player('你'), hand: [forestLord] },
      { ...player('黛安娜'), hand: [undergroundSpring, volcano] },
      player('贝拉'),
    ];
    const finalPlayers = [
      { ...player('你'), hand: [forestLord] },
      { ...player('黛安娜'), hand: [undergroundSpring] },
      player('贝拉'),
    ];
    const swapEvent = createSwapCardsEvent({
      sourceIdx: 1,
      targetIdx: 0,
      takenCard: undergroundSpring,
      givenCard: forestLord,
      beforePlayers,
      afterPlayers: afterSwapPlayers,
      beforeDiscard: [],
      afterDiscard: [],
      msgs: ['黛安娜（寻宝者）对 你 【掉包】'],
    });
    const action = buildAction(makeState({
      currentTurn: 1,
      phase: 'ACTION',
      players: finalPlayers,
      discard: [volcano],
      log: [
        '黛安娜（寻宝者）对 你 【掉包】',
        '黛安娜 弃 [C1] 活火山（上限）',
      ],
      _visualEvents: [
        swapEvent,
        {
          type: 'handLimitDiscard',
          playerIdx: 1,
          playerName: '黛安娜',
          cards: [volcano],
          msgs: ['黛安娜 弃 [C1] 活火山（上限）'],
        },
      ],
    }), {
      previousGs: makeState({
        currentTurn: 1,
        phase: 'ACTION',
        players: beforePlayers,
        discard: [],
        log: [],
      }),
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue.map(step => step.type)).toEqual([
      'SKILL_SWAP',
      'VISUAL_LOCK',
      'CARD_TRANSFER',
      'CARD_TRANSFER',
      'STATE_PATCH',
      'DISCARD',
      'STATE_PATCH',
    ]);
    expect(action.queue[4]).toMatchObject({
      type: 'STATE_PATCH',
      players: afterSwapPlayers,
      discard: [],
    });
    expect(action.queue[5]).toMatchObject({
      type: 'DISCARD',
      cards: [volcano],
      targetPid: 1,
    });
    expect(action.queue[6]).toMatchObject({
      type: 'STATE_PATCH',
      players: finalPlayers,
      discard: [volcano],
    });
  });

  it('hides swap card faces when the local viewer is not involved', () => {
    const players = [player('你'), player('艾伦'), player('贝拉')];
    const takenCard = { id: 'taken', name: '旧牌', key: 'B2', type: 'zone' };
    const givenCard = { id: 'given', name: '新牌', key: 'C3', type: 'zone' };
    const action = buildAction(makeState({
      currentTurn: 1,
      phase: 'ACTION',
      players,
      log: ['艾伦（寻宝者）对 贝拉 【掉包】'],
      _visualEvents: [
        {
          type: 'swapCards', sourceIdx: 1, targetIdx: 2, sourceCount: 1, targetCount: 1,
          takenCard, givenCard, msgs: ['艾伦（寻宝者）对 贝拉 【掉包】'],
        },
      ],
    }), {
      previousGs: makeState({ currentTurn: 1, phase: 'ACTION' }),
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    const transfers = action.queue.filter(step => step.type === 'CARD_TRANSFER');
    expect(transfers).toHaveLength(2);
    expect(transfers[0]).toMatchObject({ fromPid: 2, dest: 'player', toPid: 1, count: 1 });
    expect(transfers[1]).toMatchObject({ fromPid: 1, dest: 'player', toPid: 2, count: 1 });
    transfers.forEach(step => expect(step.cards).toBeUndefined());
  });

  it('keeps swap card faces when the local viewer is involved', () => {
    const players = [player('你'), player('艾伦'), player('贝拉')];
    const takenCard = { id: 'taken', name: '旧牌', key: 'B2', type: 'zone' };
    const givenCard = { id: 'given', name: '新牌', key: 'C3', type: 'zone' };
    const action = buildAction(makeState({
      currentTurn: 1,
      phase: 'ACTION',
      players,
      log: ['艾伦（寻宝者）对 你 【掉包】'],
      _visualEvents: [
        {
          type: 'swapCards', sourceIdx: 1, targetIdx: 0, sourceCount: 1, targetCount: 1,
          takenCard, givenCard, msgs: ['艾伦（寻宝者）对 你 【掉包】'],
        },
      ],
    }), {
      previousGs: makeState({ currentTurn: 1, phase: 'ACTION' }),
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    const transfers = action.queue.filter(step => step.type === 'CARD_TRANSFER');
    expect(transfers).toHaveLength(2);
    expect(transfers[0].cards).toEqual([takenCard]);
    expect(transfers[1].cards).toEqual([givenCard]);
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

  it('replays geomagnetic reversal visualEvents after the draw state has already resolved', () => {
    const geomagneticCard = { id: 'gm-card', name: '地磁反转', key: 'C2', type: 'geomagneticReversal' };
    const restoreCard = { id: 'gmr-card', name: '反转复原', type: 'geomagneticRestore', isGeomagneticRestore: true };
    const beforePlayers = [
      { ...player('你-before'), hand: [{ id: 'you-card' }] },
      { ...player('艾伦-before'), hand: [{ id: 'allen-card' }] },
      { ...player('贝拉-before'), hand: [{ id: 'bella-card' }] },
    ];
    const afterPlayers = [
      { ...player('你-after'), hand: [{ id: 'you-card' }] },
      { ...player('艾伦-after'), hand: [{ id: 'allen-card' }] },
      { ...player('贝拉-after'), hand: [{ id: 'bella-card' }] },
    ];
    const log = ['艾伦 收入了 [C2] 地磁反转', '【地磁反转】一张"反转复原"被洗入弃牌堆，场地被地磁反转笼罩！'];
    const event = createCardEffectEvent({
      effectKey: 'geomagneticReversal',
      card: geomagneticCard,
      actorIdx: 1,
      beforePlayers,
      beforeDiscard: [],
      afterPlayers,
      afterDiscard: [restoreCard],
      msgs: ['【地磁反转】一张"反转复原"被洗入弃牌堆，场地被地磁反转笼罩！'],
      payload: { restoreCard },
    });
    const action = buildAction(makeState({
      currentTurn: 1,
      phase: 'ACTION',
      players: afterPlayers,
      discard: [restoreCard],
      drawReveal: null,
      log,
      _visualEvents: [event],
    }), {
      previousGs: makeState({ currentTurn: 1, phase: 'DRAW_REVEAL', players: beforePlayers, log: [] }),
      buildAnimQueue,
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue.map(step => step.type)).toEqual(['GEOMAGNETIC_REVERSAL', 'GEOMAGNETIC_RESTORE_SHUFFLE', 'STATE_PATCH']);
    expect(action.queue[0]).toMatchObject({ actorIdx: 1 });
    expect(action.queue[1]).toMatchObject({ actorIdx: 1, restoreCard });
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

  it('replays an endless corridor decision draw without inserting a next-turn banner', () => {
    const replayCard = { id: 'corridor-zone', name: '重触发区域牌', key: 'A1', type: 'zone' };
    const replayEvent = createEndlessCorridorReplayEvent({
      actorIdx: 1,
      actorName: '艾伦',
      beforePlayers: [player('你-before'), player('艾伦-before'), player('贝拉-before')],
      beforeDiscard: [],
      queue: [
        { type: 'DRAW_CARD', card: replayCard, triggerName: '无尽通道', targetPid: 1, skipTravel: true, msgs: ['【无尽通道】重新摸到 重触发区域牌'] },
      ],
      msgs: ['【无尽通道】重新摸到 重触发区域牌'],
    });
    const action = buildAction(makeState({
      currentTurn: 1,
      phase: 'DRAW_REVEAL',
      drawReveal: { card: replayCard, drawerIdx: 1, needsDecision: true, fromEndTurnReplay: true },
      _endTurnReplay: { actorIndex: 1, cards: ['corridor-zone'], index: 0 },
      _visualEvents: [replayEvent],
    }), {
      previousGs: makeState({ currentTurn: 1, phase: 'ACTION' }),
      buildAnimQueue,
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue.filter(step => step.type === 'DRAW_CARD' && step.card === replayCard)).toHaveLength(1);
    expect(action.queue.some(step => step.type === 'YOUR_TURN')).toBe(false);
    expect(action.queue.at(-1)).toMatchObject({
      type: 'STATE_PATCH',
      currentTurn: 1,
      phase: 'DRAW_REVEAL',
      drawReveal: expect.objectContaining({ card: replayCard, drawerIdx: 1, fromEndTurnReplay: true }),
    });
    expect(action.pendingGs._endTurnReplay).toEqual({ actorIndex: 1, cards: ['corridor-zone'], index: 0 });
    expect(action.consumedVisualEventIds).toContain(replayEvent.id);
  });

  it('replays 拉莱耶之主 turn-end draws on the actor seat after rotating to a remote viewer', () => {
    const cthCard = { id: 'cth-draw', name: '拉莱耶摸牌', key: 'D2', type: 'zone' };
    const nextCard = { id: 'next-card', name: '下一回合牌', key: 'B1', type: 'zone' };
    // Raw frame (post-derotate on the actor's client): actor 艾伦 at seat 1, next turn 你 at seat 0.
    const replayEvent = createEndlessCorridorReplayEvent({
      actorIdx: 1,
      actorName: '艾伦',
      beforePlayers: [player('你'), player('艾伦-before'), player('贝拉')],
      beforeDiscard: [],
      queue: [
        { type: 'DRAW_CARD', card: cthCard, triggerName: '艾伦', targetPid: 1, msgs: ['  摸到 拉莱耶摸牌'] },
      ],
      msgs: ['艾伦（克苏鲁信徒Lv.1）梦访拉莱耶，翻面结束回合时额外摸1张牌'],
    });
    const rawState = makeState({
      currentTurn: 0,
      phase: 'DRAW_REVEAL',
      drawReveal: { card: nextCard, drawerIdx: 0, needsDecision: true },
      _turnStartLogs: ['── 你 的回合开始 ──'],
      _drawLogs: ['你 摸到 下一回合牌'],
      _visualEvents: [replayEvent],
    });
    // Viewer at raw seat 2 (贝拉): rotateIndex i -> (i-2+3)%3, so actor 1 -> 2, next-turn 0 -> 1.
    const rotated = rotateGsForViewer(rawState, 2);
    const previousGs = rotateGsForViewer(makeState({ currentTurn: 1, phase: 'ACTION' }), 2);
    const action = buildAction(rotated, { previousGs, buildAnimQueue });

    expect(rotated._visualEvents[0]).toMatchObject({ actorIdx: 2 });
    expect(rotated._visualEvents[0].queue[0]).toMatchObject({ targetPid: 2, triggerName: '艾伦' });
    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue[0]).toMatchObject({ type: 'DRAW_CARD', card: cthCard, targetPid: 2, triggerName: '艾伦' });
    const nextTurnIdx = action.queue.findIndex(step => step.type === 'YOUR_TURN');
    expect(nextTurnIdx).toBeGreaterThan(0);
    expect(action.queue[nextTurnIdx + 1]).toMatchObject({ type: 'DRAW_CARD', card: nextCard, targetPid: 1 });
    expect(action.queue.at(-1)).toMatchObject({ type: 'STATE_PATCH', currentTurn: 1 });
    expect(action.pendingGs._visualEvents).toEqual([]);
  });

  it('does not insert a turn banner while replaying a 拉莱耶之主 turn-end decision draw', () => {
    const cthCard = { id: 'cth-decision', name: '拉莱耶抉择牌', key: 'C1', type: 'zone' };
    const replayEvent = createEndlessCorridorReplayEvent({
      actorIdx: 1,
      actorName: '艾伦',
      beforePlayers: [player('你'), player('艾伦-before'), player('贝拉')],
      beforeDiscard: [],
      queue: [
        { type: 'DRAW_CARD', card: cthCard, triggerName: '艾伦', targetPid: 1, msgs: ['  摸到 拉莱耶抉择牌'] },
      ],
      msgs: ['艾伦（克苏鲁信徒Lv.1）梦访拉莱耶，翻面结束回合时额外摸1张牌'],
    });
    const rawState = makeState({
      currentTurn: 1,
      phase: 'DRAW_REVEAL',
      drawReveal: { card: cthCard, drawerIdx: 1, needsDecision: true, fromRest: true },
      abilityData: { fromRest: true, cthDrawsRemaining: 0 },
      _turnStartLogs: ['── 艾伦 的回合开始 ──'],
      _drawLogs: ['艾伦 摸到 拉莱耶抉择牌'],
      _visualEvents: [replayEvent],
    });
    const rotated = rotateGsForViewer(rawState, 2);
    const previousGs = rotateGsForViewer(makeState({ currentTurn: 1, phase: 'ACTION' }), 2);
    const action = buildAction(rotated, { previousGs, buildAnimQueue });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue.filter(step => step.type === 'DRAW_CARD' && step.card === cthCard)).toHaveLength(1);
    expect(action.queue.some(step => step.type === 'YOUR_TURN')).toBe(false);
    expect(action.queue.at(-1)).toMatchObject({
      type: 'STATE_PATCH',
      currentTurn: 2,
      phase: 'DRAW_REVEAL',
      drawReveal: expect.objectContaining({ card: cthCard, drawerIdx: 2, fromRest: true }),
    });
  });

  it('keeps turn-end boundary events before replaying 拉莱耶之主 turn-end draws remotely', () => {
    const cthCard = { id: 'cth-draw-boundary', name: '拉莱耶摸牌', key: 'D2', type: 'zone' };
    const slime = { id: 'slime-boundary', name: '撒托古亚的赐福黏液', isTsathogguaSlime: true };
    const replayEvent = createEndlessCorridorReplayEvent({
      actorIdx: 1,
      actorName: '艾伦',
      beforePlayers: [player('你'), player('艾伦-before'), player('贝拉')],
      beforeDiscard: [],
      queue: [
        { type: 'VISUAL_LOCK', players: [player('你'), player('艾伦-before'), player('贝拉')] },
        {
          type: 'CARD_TRANSFER',
          fromPid: 1,
          toPid: 1,
          cards: [slime],
          count: 1,
          effect: 'tsgSlime',
          msgs: ['【无定形体】艾伦 获得1张撒托古亚的赐福黏液'],
        },
        { type: 'STATE_PATCH', players: [player('你'), { ...player('艾伦-after'), hand: [slime] }, player('贝拉')] },
        { type: 'TURN_BOUNDARY_PAUSE', durationMs: 180 },
        { type: 'DRAW_CARD', card: cthCard, triggerName: '艾伦', targetPid: 1, msgs: ['  摸到 拉莱耶摸牌'] },
      ],
      msgs: ['艾伦（克苏鲁信徒Lv.1）梦访拉莱耶，翻面结束回合时额外摸1张牌'],
    });
    const rawState = makeState({
      currentTurn: 0,
      phase: 'DRAW_REVEAL',
      drawReveal: { card: { id: 'next', name: '下一回合牌', key: 'B1', type: 'zone' }, drawerIdx: 0, needsDecision: true },
      _turnStartLogs: ['── 你 的回合开始 ──'],
      _drawLogs: ['你 摸到 下一回合牌'],
      _visualEvents: [replayEvent],
    });
    const rotated = rotateGsForViewer(rawState, 2);
    const previousGs = rotateGsForViewer(makeState({ currentTurn: 1, phase: 'ACTION' }), 2);
    const action = buildAction(rotated, { previousGs, buildAnimQueue });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    const slimeIdx = action.queue.findIndex(step => step.type === 'CARD_TRANSFER' && step.effect === 'tsgSlime');
    const cthDrawIdx = action.queue.findIndex(step => step.type === 'DRAW_CARD' && step.card.id === cthCard.id);
    const nextTurnIdx = action.queue.findIndex(step => step.type === 'YOUR_TURN');
    expect(slimeIdx).toBeGreaterThanOrEqual(0);
    expect(cthDrawIdx).toBeGreaterThan(slimeIdx);
    expect(nextTurnIdx).toBeGreaterThan(cthDrawIdx);
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

  it('replays Apophis night dice before remote hunt target lock', () => {
    const action = buildAction(makeState({
      currentTurn: 1,
      phase: 'HUNT_WAIT_REVEAL',
      abilityData: { huntTi: 2 },
      apophisNight: { active: true, threshold: 2, count: 1, limit: 12 },
      _apophisTargetSeq: 2,
      _apophisTargetEvent: {
        seq: 2,
        actorIdx: 1,
        actorName: '艾伦',
        selectedIdx: 2,
        targetIdx: 2,
        roll: 6,
        changed: false,
        label: '选择【追捕】目标',
        log: '【黑夜】艾伦 选择【追捕】目标掷出 6，目标未偏移',
      },
      log: ['【黑夜】艾伦 选择【追捕】目标掷出 6，目标未偏移', '没有追捕关键字的日志'],
      _visualEvents: [
        { type: 'huntTarget', sourceIdx: 1, targetIdx: 2, msgs: ['事件追捕'] },
      ],
    }), {
      previousGs: makeState({ currentTurn: 1, phase: 'ACTION', _apophisTargetSeq: 1 }),
      buildAnimQueue,
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue[0]).toMatchObject({
      type: 'DICE_ROLL',
      diceMode: 'apophisNight',
      d1: 6,
      rollerName: '艾伦',
    });
    expect(action.queue[1]).toMatchObject({ type: 'SKILL_HUNT', targetIdx: 2 });
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
    const wrongGuessAnimQueue = vi.fn(() => [
      { type: 'DRAW_CARD', card: sphinxCard, targetPid: 1 },
      { type: 'CARD_TRANSFER', dest: 'discard', fromPid: -1, count: 1 },
      { type: 'HP_DAMAGE', hitIndices: [1] },
    ]);
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
    expect(action.queue.slice(1).some(step => step.type === 'DRAW_CARD')).toBe(false);
    expect(action.queue.some(step => step.type === 'CARD_TRANSFER')).toBe(false);
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

  it('does not suppress an explicit sphinx reveal when a later draw boundary shares the sync packet', () => {
    const sphinxCard = { id: 'sphinx1', name: '斯芬克斯', key: 'SPH', type: 'zone' };
    const nextCard = { id: 'next1', name: '下一张牌', key: 'A1', type: 'zone' };
    const event = createSphinxResultEvent({
      actorIdx: 1,
      card: sphinxCard,
      guessCorrect: false,
      msgs: ['艾伦 猜测错误'],
    });
    const action = buildAction(makeState({
      currentTurn: 2,
      phase: 'ACTION',
      players: [player('你'), player('艾伦'), player('贝拉')],
      log: ['艾伦 猜测错误', '── 贝拉 的回合开始 ──', `贝拉 摸到 [A1] ${nextCard.name}`],
      _visualEvents: [event],
    }), {
      previousGs: makeState({
        currentTurn: 1,
        phase: 'SPHINX_GUESS',
        players: [player('你'), player('艾伦'), player('贝拉')],
        log: [],
      }),
      buildAnimQueue: vi.fn(() => []),
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue[0]).toMatchObject({
      type: 'DRAW_CARD',
      card: sphinxCard,
      triggerName: '斯芬克斯',
      targetPid: 1,
      guessCorrect: false,
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
    expect(action.anim).toMatchObject({ type: 'DISCARD', targetPid: 1, card: discarded, cards: [discarded], count: 1 });
    expect(action.queue[0]).toMatchObject({ type: 'YOUR_TURN' });
    expect(action.queue[1]).toMatchObject({ type: 'DRAW_CARD', card: nextCard, targetPid: 0 });
    expect(action.pendingGs._visualEvents).toEqual([]);
  });

  it('replays Tsathoggua slime grants to the believer seat before the next local draw replay', () => {
    const nextCard = { id: 'next-card', name: '下一张牌', key: 'B2', type: 'zone' };
    const slime = { id: 'slime-1', name: '撒托古亚的赐福黏液', isTsathogguaSlime: true };
    const beforeGrantPlayers = [
      { ...player('蟾蜍信徒'), hand: [] },
      player('艾伦'),
      player('你'),
    ];
    const afterGrantPlayers = [
      { ...player('蟾蜍信徒'), hand: [slime] },
      player('艾伦'),
      player('你'),
    ];
    const rawState = makeState({
      currentTurn: 1,
      phase: 'DRAW_REVEAL',
      players: afterGrantPlayers,
      drawReveal: { card: nextCard, drawerIdx: 1, needsDecision: true },
      _turnStartLogs: ['── 艾伦 的回合开始 ──'],
      _drawLogs: ['艾伦 摸到 [B2] 下一张牌'],
      _playersBeforeThisDraw: afterGrantPlayers,
      _tsgSlimeGrantEvents: [{
        ownerIdx: 0,
        count: 1,
        cards: [slime],
        msgs: ['蟾蜍信徒 获得1张撒托古亚的赐福黏液'],
        playersBefore: beforeGrantPlayers,
        playersAfter: afterGrantPlayers,
      }],
      log: ['蟾蜍信徒 获得1张撒托古亚的赐福黏液', '── 艾伦 的回合开始 ──', '艾伦 摸到 [B2] 下一张牌'],
    });
    const rawPreviousGs = makeState({
      currentTurn: 0,
      phase: 'ACTION',
      players: beforeGrantPlayers,
    });
    const rotated = rotateGsForViewer(rawState, 2);
    const previousGs = rotateGsForViewer(rawPreviousGs, 2);
    const action = buildAction(rotated, {
      previousGs,
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.queue[0]).toMatchObject({ type: 'VISUAL_LOCK' });
    expect(action.queue[0].players[0].name).toBe('你');
    expect(action.queue[0].players[1].name).toBe('蟾蜍信徒');
    expect(action.queue[1]).toMatchObject({ type: 'CARD_TRANSFER', effect: 'tsgSlime', fromPid: 1, toPid: 1 });
    expect(action.queue[2]).toMatchObject({ type: 'STATE_PATCH' });
    expect(action.queue[2].players[1].hand).toContain(slime);
    expect(action.queue[3]).toMatchObject({ type: 'TURN_BOUNDARY_PAUSE' });
    expect(action.queue[4]).toMatchObject({ type: 'YOUR_TURN', name: '艾伦' });
    expect(action.queue[5]).toMatchObject({ type: 'DRAW_CARD', card: nextCard, targetPid: 2 });
  });

  it('replays remote black-goat pulse and damage before the remote turn-start draw', () => {
    const goat = { id: 'goat-1', name: '黑山羊幼仔', type: 'blackGoatYoung', isBlackGoatYoung: true };
    const nextCard = { id: 'next-card', name: '下一张牌', key: 'B2', type: 'zone' };
    const preTurnPlayers = [
      player('你'),
      { ...player('艾伦'), hand: [goat], hp: 10, san: 10 },
      player('贝拉'),
    ];
    const beforeDrawPlayers = [
      player('你'),
      { ...player('艾伦'), hand: [goat], hp: 9, san: 9 },
      player('贝拉'),
    ];
    const goatLog = '【黑山羊幼仔】艾伦 失去 1 HP 和 1 SAN';
    const rotated = makeState({
      currentTurn: 1,
      phase: 'DRAW_REVEAL',
      players: beforeDrawPlayers,
      drawReveal: { card: nextCard, drawerIdx: 1, needsDecision: true },
      _preTurnPlayers: preTurnPlayers,
      _playersBeforeThisDraw: beforeDrawPlayers,
      _turnStartLogs: ['── 艾伦 的回合开始 ──'],
      _drawLogs: ['艾伦 摸到 [B2] 下一张牌'],
      _statEventSeq: 7,
      _statEvents: [
        { type: 'HP_LOSS', target: 1, from: { hp: 10, san: 10, isDead: false }, to: { hp: 9, san: 10, isDead: false }, reason: '黑山羊幼仔', logHint: goatLog, seq: 7 },
        { type: 'SAN_LOSS', target: 1, from: { hp: 10, san: 10, isDead: false }, to: { hp: 9, san: 9, isDead: false }, reason: '黑山羊幼仔', logHint: goatLog, seq: 7 },
      ],
      log: ['── 艾伦 的回合开始 ──', goatLog, '艾伦 摸到 [B2] 下一张牌'],
    });
    const action = buildAction(rotated, {
      previousGs: makeState({
        currentTurn: 0,
        players: preTurnPlayers,
        _statEventSeq: 7,
        log: [],
      }),
    });
    const types = action.queue.map(step => step.type);

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(types.slice(0, 5)).toEqual(['YOUR_TURN', 'BLACK_GOAT_PULSE', 'HP_DAMAGE', 'SAN_DAMAGE', 'STATE_PATCH']);
    expect(types.indexOf('DRAW_CARD')).toBeGreaterThan(types.indexOf('STATE_PATCH'));
    expect(action.queue.find(step => step.type === 'DRAW_CARD')).toMatchObject({ card: nextCard, targetPid: 1 });
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
