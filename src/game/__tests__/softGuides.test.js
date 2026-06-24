import { describe, expect, it } from 'vitest';
import {
  ALL_SOFT_GUIDE_IDS,
  SOFT_GUIDE_IDS,
  hasNewRestingCharacter,
  markAllSoftGuidesDone,
  markSoftGuideDone,
  parseSoftGuideDone,
  serializeSoftGuideDone,
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
});
