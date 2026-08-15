import { describe, expect, it } from 'vitest';
import { attachApophisNightTimeline, buildApophisTargetQueueForState, mergeApophisTargetQueue, normalizeApophisQueueForPlayback } from '../apophisAnimQueue';

describe('apophisAnimQueue', () => {
  it('无日食变化的动画队列全程保持最终权威进度', () => {
    const staleNight = { active: true, count: 0, limit: 12 };
    const currentNight = { active: true, count: 5, limit: 12 };
    const queue = attachApophisNightTimeline(
      [{ type: 'YOUR_TURN' }, { type: 'DRAW_CARD' }, { type: 'SAN_DAMAGE' }],
      staleNight,
      currentNight,
    );

    expect(queue.map(step => step._apophisNight)).toEqual([
      currentNight,
      currentNight,
      currentNight,
    ]);
  });

  it('日食判定只在对应步骤推进并由后续动画保持', () => {
    const beforeNight = { active: true, count: 4, limit: 12 };
    const afterNight = { active: true, count: 5, limit: 12 };
    const queue = attachApophisNightTimeline([
      { type: 'YOUR_TURN' },
      { type: 'DICE_ROLL', _apophisNight: afterNight },
      { type: 'SKILL_HUNT' },
    ], beforeNight, afterNight);

    expect(queue.map(step => step._apophisNight)).toEqual([
      beforeNight,
      afterNight,
      afterNight,
    ]);
  });

  it('日食结束后的动画显式保持空状态而不会回退', () => {
    const beforeNight = { active: true, count: 11, limit: 12 };
    const queue = attachApophisNightTimeline([
      { type: 'DICE_ROLL', _apophisNight: null },
      { type: 'SAN_DAMAGE' },
    ], beforeNight, null);

    expect(queue.map(step => step._apophisNight)).toEqual([null, null]);
  });

  const oldState = { _apophisTargetSeq: 1 };
  const nextState = {
    _apophisTargetEvent: { seq: 2 },
  };
  const buildQueue = () => [
    { type: 'DICE_ROLL', diceMode: 'apophisNight', _apophisTargetSeq: 2 },
    { type: 'SKILL_HUNT', _apophisTargetSeq: 2, targetIdx: 2 },
    { type: 'HP_DAMAGE' },
  ];

  it('只取当前阿波菲斯目标事件对应的动画步骤', () => {
    expect(buildApophisTargetQueueForState(oldState, nextState, buildQueue)).toEqual([
      { type: 'DICE_ROLL', diceMode: 'apophisNight', _apophisTargetSeq: 2 },
      { type: 'SKILL_HUNT', _apophisTargetSeq: 2, targetIdx: 2 },
    ]);
  });

  it('跨入下一回合后从 action-owned 视觉事件恢复目标事务', () => {
    const actionEvent = {
      id: 'apophis-action-2',
      type: 'apophisTarget',
      scope: 'action',
      legacySeq: 2,
      statSeq: 7,
      order: 0,
    };
    const crossedTurnState = {
      _apophisTargetSeq: 2,
      _apophisTargetEvent: null,
      _visualEvents: [actionEvent],
    };
    const built = () => [
      { type: 'DICE_ROLL', diceMode: 'apophisNight', _apophisTargetSeq: 2, visualEventId: actionEvent.id },
      { type: 'SAN_DAMAGE', statEvents: [{ seq: 7 }] },
    ];

    expect(mergeApophisTargetQueue(
      [{ type: 'SKILL_BEWITCH' }, { type: 'CARD_TRANSFER' }, ...built()],
      oldState,
      crossedTurnState,
      built,
    ).map(step => step.type)).toEqual([
      'DICE_ROLL',
      'SAN_DAMAGE',
      'SKILL_BEWITCH',
      'CARD_TRANSFER',
    ]);
  });

  it('黑夜目标错乱后保留同次结算的 SAN 扣减动画', () => {
    const stateWithSanLoss = {
      _apophisTargetEvent: { seq: 2, statSeq: 7 },
    };
    const buildQueueWithSanLoss = () => [
      { type: 'DICE_ROLL', diceMode: 'apophisNight', _apophisTargetSeq: 2 },
      { type: 'SAN_DAMAGE', hitIndices: [0], statEvents: [{ type: 'SAN_LOSS', target: 0, seq: 7 }] },
      { type: 'CARD_TRANSFER' },
    ];

    expect(buildApophisTargetQueueForState(oldState, stateWithSanLoss, buildQueueWithSanLoss)).toEqual([
      { type: 'DICE_ROLL', diceMode: 'apophisNight', _apophisTargetSeq: 2 },
      { type: 'SAN_DAMAGE', hitIndices: [0], statEvents: [{ type: 'SAN_LOSS', target: 0, seq: 7 }] },
    ]);
  });

  it('将黑夜目标动画作为前缀，并避免重复技能锁定动画', () => {
    const baseQueue = [{ type: 'SKILL_HUNT', targetIdx: 2, msgs: ['追捕'] }, { type: 'CARD_TRANSFER' }];

    expect(mergeApophisTargetQueue(baseQueue, oldState, nextState, buildQueue)).toEqual([
      { type: 'DICE_ROLL', diceMode: 'apophisNight', _apophisTargetSeq: 2 },
      { type: 'SKILL_HUNT', targetIdx: 2, msgs: ['追捕'] },
      { type: 'CARD_TRANSFER' },
    ]);
  });

  it('已有同一次黑夜骰子在后段队列时会移到最前并去重', () => {
    const baseQueue = [
      { type: 'SKILL_BEWITCH', targetIdx: 1, msgs: ['蛊惑'] },
      { type: 'CARD_TRANSFER' },
      { type: 'DRAW_CARD', card: { id: 'god' } },
      { type: 'DICE_ROLL', diceMode: 'apophisNight', _apophisTargetSeq: 2 },
      { type: 'SAN_DAMAGE' },
    ];
    const buildQueue = () => [
      { type: 'DICE_ROLL', diceMode: 'apophisNight', _apophisTargetSeq: 2 },
      { type: 'SKILL_BEWITCH', _apophisTargetSeq: 2, targetIdx: 2 },
    ];

    expect(mergeApophisTargetQueue(baseQueue, oldState, nextState, buildQueue)).toEqual([
      { type: 'DICE_ROLL', diceMode: 'apophisNight', _apophisTargetSeq: 2 },
      { type: 'SKILL_BEWITCH', targetIdx: 1, msgs: ['蛊惑'] },
      { type: 'CARD_TRANSFER' },
      { type: 'DRAW_CARD', card: { id: 'god' } },
      { type: 'SAN_DAMAGE' },
    ]);
  });

  it('回合开始续摸触发触底反弹时黑夜骰子先于整手交换', () => {
    const swapQueue = [
      { type: 'VISUAL_LOCK' },
      { type: 'CARD_TRANSFER', fromPid: 0, toPid: 2 },
      { type: 'CARD_TRANSFER', fromPid: 2, toPid: 0 },
    ];
    const buildQueue = () => [
      { type: 'DICE_ROLL', diceMode: 'apophisNight', _apophisTargetSeq: 2 },
      { type: 'SAN_DAMAGE', statEvents: [{ seq: 7 }] },
    ];
    const stateWithShift = { _apophisTargetEvent: { seq: 2, statSeq: 7 } };

    expect(mergeApophisTargetQueue(swapQueue, oldState, stateWithShift, buildQueue).map(step => step.type)).toEqual([
      'DICE_ROLL',
      'SAN_DAMAGE',
      'VISUAL_LOCK',
      'CARD_TRANSFER',
      'CARD_TRANSFER',
    ]);
  });

  it('蛊惑目标偏移时在黑夜骰子后立即结算 SAN，再播放技能与赠牌', () => {
    const nightSan = {
      type: 'SAN_DAMAGE',
      hitIndices: [0],
      statEvents: [{ type: 'SAN_LOSS', target: 0, seq: 7 }],
    };
    const baseQueue = [
      { type: 'SKILL_BEWITCH', targetIdx: 2 },
      { type: 'CARD_TRANSFER', fromPid: 0, toPid: 2 },
      { type: 'DRAW_CARD', targetPid: 2 },
      nightSan,
      { type: 'HP_DAMAGE', hitIndices: [2] },
    ];
    const stateWithShift = { _apophisTargetEvent: { seq: 2, statSeq: 7 } };
    const buildQueueWithShift = () => [
      { type: 'DICE_ROLL', diceMode: 'apophisNight', _apophisTargetSeq: 2 },
      { type: 'SKILL_BEWITCH', _apophisTargetSeq: 2, targetIdx: 2 },
      nightSan,
    ];

    expect(mergeApophisTargetQueue(baseQueue, oldState, stateWithShift, buildQueueWithShift).map(step => step.type)).toEqual([
      'DICE_ROLL',
      'SAN_DAMAGE',
      'SKILL_BEWITCH',
      'CARD_TRANSFER',
      'DRAW_CARD',
      'HP_DAMAGE',
    ]);
  });

  it.each([
    ['追捕', 'SKILL_HUNT'],
    ['掉包', 'SKILL_SWAP'],
    ['蛊惑', 'SKILL_BEWITCH'],
  ])('黑夜偏移的%s统一按骰子、SAN、身份技能顺序播放', (_label, skillType) => {
    const nightSan = {
      type: 'SAN_DAMAGE',
      statEvents: [{ type: 'SAN_LOSS', target: 0, seq: 7 }],
    };
    const stateWithShift = { _apophisTargetEvent: { seq: 2, statSeq: 7 } };
    const legacyQueue = [
      { type: skillType, targetIdx: 2 },
      nightSan,
    ];
    const legacyBuildQueue = () => [
      { type: 'DICE_ROLL', diceMode: 'apophisNight', _apophisTargetSeq: 2 },
      { type: skillType, _apophisTargetSeq: 2, targetIdx: 2 },
      nightSan,
    ];

    expect(mergeApophisTargetQueue(legacyQueue, oldState, stateWithShift, legacyBuildQueue).map(step => step.type)).toEqual([
      'DICE_ROLL',
      'SAN_DAMAGE',
      skillType,
    ]);
  });

  it('已包含同次 SAN 动画的队列重复归一化时不会重播', () => {
    const stateWithSanLoss = {
      _apophisTargetEvent: { seq: 2, statSeq: 7 },
    };
    const sanStep = {
      type: 'SAN_DAMAGE',
      hitIndices: [0],
      statEvents: [{ type: 'SAN_LOSS', target: 0, seq: 7 }],
    };
    const buildQueueWithSanLoss = () => [
      { type: 'DICE_ROLL', diceMode: 'apophisNight', _apophisTargetSeq: 2 },
      sanStep,
    ];
    const alreadyMerged = [
      { type: 'DICE_ROLL', diceMode: 'apophisNight', _apophisTargetSeq: 2 },
      sanStep,
      { type: 'CARD_TRANSFER' },
    ];

    const merged = mergeApophisTargetQueue(alreadyMerged, oldState, stateWithSanLoss, buildQueueWithSanLoss);
    expect(merged.filter(step => step.type === 'SAN_DAMAGE')).toHaveLength(1);
    expect(merged.map(step => step.type)).toEqual(['DICE_ROLL', 'SAN_DAMAGE', 'CARD_TRANSFER']);
  });

  it.each([
    ['掉包', [
      { type: 'SKILL_SWAP', targetIdx: 2 },
      { type: 'CARD_TRANSFER', fromPid: 1, toPid: 2 },
      { type: 'CARD_TRANSFER', fromPid: 2, toPid: 1 },
    ]],
    ['两人一绳', [
      { type: 'CARD_TRANSFER', fromPid: 1, toPid: 2, effect: 'damageLink' },
    ]],
    ['玫瑰倒刺', [
      { type: 'VISUAL_LOCK' },
      { type: 'CARD_TRANSFER', fromPid: 1, toPid: 2, count: 3 },
    ]],
    ['穴居人战争', [
      { type: 'CAVE_DUEL_REVEAL', sourceIdx: 1, targetIdx: 2 },
      { type: 'CARD_TRANSFER', fromPid: 2, toPid: 1 },
    ]],
  ])('黑夜中的%s行为统一先播放目标偏移骰，再播放行为动画', (_label, actionQueue) => {
    const stateWithTarget = {
      _apophisTargetEvent: { seq: 2 },
    };
    const buildTargetQueue = () => [{
      type: 'DICE_ROLL',
      diceMode: 'apophisNight',
      _apophisTargetSeq: 2,
    }];

    // 模拟旧组合器已经把同一颗骰子放进动作尾部；这正是蛊惑之外
    // 其他指定目标行为也可能遇到的“成员齐全但顺序错误”形态。
    const lateDice = buildTargetQueue()[0];
    const merged = mergeApophisTargetQueue(
      [...actionQueue, lateDice],
      oldState,
      stateWithTarget,
      buildTargetQueue,
    );

    expect(merged[0]).toMatchObject({
      type: 'DICE_ROLL',
      diceMode: 'apophisNight',
      _apophisTargetSeq: 2,
    });
    expect(merged.slice(1)).toEqual(actionQueue);
    expect(merged.filter(step => step.type === 'DICE_ROLL')).toHaveLength(1);
  });

  it('旧路径缺少事件序号时仍按同一条黑夜日志去重', () => {
    const log = '【黑夜】卡洛斯 选择【追捕】目标掷出 1，目标由 艾伦 错乱为 贝拉，失去 1 SAN';
    const baseQueue = [
      { type: 'DICE_ROLL', diceMode: 'apophisNight', d1: 1, msgs: [log] },
      { type: 'SKILL_HUNT', targetIdx: 2 },
    ];
    const buildQueue = () => [
      { type: 'DICE_ROLL', diceMode: 'apophisNight', d1: 1, _apophisTargetSeq: 2, msgs: [log] },
      { type: 'SKILL_HUNT', _apophisTargetSeq: 2, targetIdx: 2 },
    ];

    const merged = mergeApophisTargetQueue(baseQueue, oldState, nextState, buildQueue);
    expect(merged.filter(step => step.type === 'DICE_ROLL')).toHaveLength(1);
    expect(merged.filter(step => step.type === 'SKILL_HUNT')).toHaveLength(1);
  });

  it('二次合并连续追捕队列时保留最新黑夜骰子的原始位置', () => {
    const latestEvent = {
      seq: 4,
      actorIdx: 1,
      actorName: '艾伦',
      selectedIdx: 0,
      targetIdx: 0,
      roll: 6,
      changed: false,
      label: '选择【追捕】目标',
      log: '【黑夜】艾伦 选择【追捕】目标掷出 6，目标未偏移',
    };
    const oldState = { _apophisTargetSeq: 3 };
    const nextState = { _apophisTargetSeq: 4, _apophisTargetEvent: latestEvent };
    const queue = [
      { type: 'DICE_ROLL', diceMode: 'apophisNight', d1: 2, _apophisTargetSeq: 3 },
      { type: 'SKILL_HUNT', targetIdx: 2 },
      { type: 'HUNT_REVEAL_CARD' },
      { type: 'HP_DAMAGE', hitIndices: [2] },
      { type: 'DICE_ROLL', diceMode: 'apophisNight', d1: 6, _apophisTargetSeq: 4 },
      { type: 'SKILL_HUNT', targetIdx: 0 },
    ];
    const buildQueue = () => [{
      type: 'DICE_ROLL',
      diceMode: 'apophisNight',
      d1: 6,
      _apophisTargetSeq: 4,
      msgs: [latestEvent.log],
    }];

    const merged = mergeApophisTargetQueue(queue, oldState, nextState, buildQueue);
    expect(merged.map(step => step.type)).toEqual(queue.map(step => step.type));
    expect(merged.filter(step => step.type === 'DICE_ROLL').map(step => step.d1)).toEqual([2, 6]);
    expect(merged.findIndex(step => step.d1 === 6)).toBeGreaterThan(merged.findIndex(step => step.type === 'HP_DAMAGE'));
  });

  it('AI 放弃追捕后的最终合并复用已存在的黑夜骰子事务', () => {
    const latestEvent = {
      seq: 7,
      actorIdx: 1,
      actorName: '卡洛斯',
      selectedIdx: 2,
      targetIdx: 2,
      roll: 3,
      changed: false,
      label: '选择【追捕】目标',
      log: '【黑夜】卡洛斯 选择【追捕】目标掷出 3，目标未偏移',
    };
    const dice = {
      type: 'DICE_ROLL',
      diceMode: 'apophisNight',
      d1: 3,
      _apophisTargetSeq: 7,
      msgs: [latestEvent.log],
    };
    const queue = [
      { type: 'DICE_ROLL', diceMode: 'apophisNight', d1: 1, _apophisTargetSeq: 6 },
      dice,
      { type: 'SKILL_HUNT', targetIdx: 2 },
      { type: 'HUNT_REVEAL_CARD' },
      { type: 'ANIM_LOG', msgs: ['放弃追捕 艾伦'] },
    ];
    const nextState = { _apophisTargetSeq: 7, _apophisTargetEvent: latestEvent };
    const buildQueue = () => [{ ...dice }];

    const merged = mergeApophisTargetQueue(queue, { _apophisTargetSeq: 6 }, nextState, buildQueue);

    expect(merged).toBe(queue);
    expect(merged.filter(step => step.type === 'DICE_ROLL' && step._apophisTargetSeq === 7)).toHaveLength(1);
  });

  it('已分段的 AI 总队列在播放边界保持掉包、无尽通道和斯芬克斯的既定顺序', () => {
    const targetEvent = {
      seq: 6,
      actorIdx: 1,
      actorName: '黛安娜',
      targetIdx: 0,
      roll: 6,
      changed: false,
      label: '选择【掉包】目标',
      log: '【黑夜】黛安娜 选择【掉包】目标掷出 6，目标未偏移',
    };
    const queue = [
      { type: 'DICE_ROLL', diceMode: 'apophisNight', _apophisTargetSeq: 6 },
      { type: 'SKILL_SWAP', targetIdx: 0 },
      { type: 'CARD_TRANSFER', fromPid: 1, toPid: 0 },
      { type: 'ENDLESS_CORRIDOR_TUNNEL' },
      { type: 'DRAW_CARD', card: { key: 'D4', name: '斯芬克斯' } },
      { type: 'SPHINX_RESULT' },
    ];
    const nextState = { _apophisTargetSeq: 6, _apophisTargetEvent: targetEvent };

    const normalized = normalizeApophisQueueForPlayback(
      queue,
      { _apophisTargetSeq: 5 },
      nextState,
      { preserveQueueOrder: true },
    );

    expect(normalized).toBe(queue);
    expect(normalized.map(step => step.type)).toEqual([
      'DICE_ROLL',
      'SKILL_SWAP',
      'CARD_TRANSFER',
      'ENDLESS_CORRIDOR_TUNNEL',
      'DRAW_CARD',
      'SPHINX_RESULT',
    ]);
  });
});

