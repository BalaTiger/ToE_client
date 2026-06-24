import { describe, expect, it } from 'vitest';
import {
  ALL_SOFT_GUIDE_IDS,
  SOFT_GUIDE_IDS,
  canPresentSoftGuide,
  getFirstRestingPlayerIndex,
  getQueuedSoftGuideId,
  hasNewRestingCharacter,
  markAllSoftGuidesDone,
  markSoftGuideDone,
  parseSoftGuideDone,
  serializeSoftGuideDone,
  shouldTriggerRestSoftGuide,
} from '../softGuides';

describe('softGuides', () => {
  it('解析本地已读状态时容错非法数据', () => {
    expect(parseSoftGuideDone('')).toEqual({});
    expect(parseSoftGuideDone('{bad')).toEqual({});
    expect(parseSoftGuideDone('[]')).toEqual({});
    expect(parseSoftGuideDone('{"rest":true}')).toEqual({ rest: true });
  });

  it('可以标记单个或全部软引导为已读', () => {
    const restDone = markSoftGuideDone({}, SOFT_GUIDE_IDS.REST);

    expect(restDone).toEqual({ rest: true });
    expect(markSoftGuideDone(restDone, 'unknown')).toBe(restDone);
    expect(markAllSoftGuidesDone()).toEqual(
      ALL_SOFT_GUIDE_IDS.reduce((acc, id) => ({ ...acc, [id]: true }), {}),
    );
  });

  it('序列化时只保留当前已定义的软引导', () => {
    const serialized = serializeSoftGuideDone({ rest: true, stale: true });

    expect(JSON.parse(serialized)).toEqual({ rest: true });
  });

  it('检测任意角色新进入翻面状态', () => {
    expect(hasNewRestingCharacter(
      [{ isResting: false }, { isResting: false }],
      [{ isResting: false }, { isResting: true }],
    )).toBe(true);
    expect(hasNewRestingCharacter(
      [{ isResting: true }],
      [{ isResting: true }],
    )).toBe(false);
  });

  it('翻面软引导只在单人模式首次新增翻面时排队', () => {
    const prevPlayers = [{ isResting: false }, { isResting: false }];
    const nextPlayers = [{ isResting: false }, { isResting: true }];

    expect(getQueuedSoftGuideId({ prevPlayers, nextPlayers, doneMap: {} })).toBe(SOFT_GUIDE_IDS.FLIP);
    expect(getQueuedSoftGuideId({ prevPlayers, nextPlayers, isMultiplayer: true, doneMap: {} })).toBe(null);
    expect(getQueuedSoftGuideId({ prevPlayers, nextPlayers, doneMap: { flip: true } })).toBe(null);
  });

  it('休息软引导只在本地玩家行动阶段 HP 不满且可休息时触发', () => {
    const base = {
      phase: 'ACTION',
      currentTurn: 0,
      players: [{ hp: 8, isDead: false, disableRest: false }],
      restUsed: false,
      skillUsed: false,
      multiplyUsed: false,
    };

    expect(shouldTriggerRestSoftGuide(base, {})).toBe(true);
    expect(shouldTriggerRestSoftGuide({ ...base, phase: 'DRAW_REVEAL' }, {})).toBe(false);
    expect(shouldTriggerRestSoftGuide({ ...base, players: [{ ...base.players[0], hp: 10 }] }, {})).toBe(false);
    expect(shouldTriggerRestSoftGuide(base, { rest: true })).toBe(false);
  });

  it('软引导展示前需要没有动画、教程和待应用状态', () => {
    const gs = { players: [{}], phase: 'ACTION' };

    expect(canPresentSoftGuide({ gs })).toBe(true);
    expect(canPresentSoftGuide({ gs, showTutorial: true })).toBe(false);
    expect(canPresentSoftGuide({ gs, anim: { type: 'DRAW_CARD' } })).toBe(false);
    expect(canPresentSoftGuide({ gs, animQueueLength: 1 })).toBe(false);
    expect(canPresentSoftGuide({ gs, hasPendingGs: true })).toBe(false);
  });

  it('可以定位第一个存活翻面角色', () => {
    expect(getFirstRestingPlayerIndex([
      { isResting: true, isDead: true },
      { isResting: false },
      { isResting: true },
    ])).toBe(2);
  });
});
