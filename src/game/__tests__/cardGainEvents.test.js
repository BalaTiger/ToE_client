import { describe, expect, it } from 'vitest';
import {
  CARD_GAIN_VISIBILITY,
  appendCardGainTriggers,
  appendPublicCardGainTriggers,
  isPublicCardIdentityGain,
} from '../cardGainEvents';
import { makeGodCard, makePlayer, makeZoneCard } from './factory';
import { makeProliferatingZState } from '../proliferatingZ';

describe('cardGainEvents', () => {
  it('默认把公开且牌面身份全员可见的获得传递给增殖的Z', () => {
    const players = [makePlayer({ name: '你' }), makePlayer({ name: '艾伦' })];
    const gs = { proliferatingZ: makeProliferatingZState(0, 3), proliferatingZQueue: [] };

    const patch = appendCardGainTriggers(gs, players, 1, makeGodCard('SHU'));

    expect(patch.proliferatingZQueue).toHaveLength(1);
    expect(patch.proliferatingZQueue[0]).toMatchObject({ drawerIdx: 0, gainOwnerIdx: 1 });
  });

  it('参与者可见、私密、或牌面身份不全员可见时不触发', () => {
    const players = [makePlayer({ name: '你' }), makePlayer({ name: '艾伦' })];
    const gs = { proliferatingZ: makeProliferatingZState(0, 3), proliferatingZQueue: [] };
    const card = makeGodCard('SHU');

    expect(appendCardGainTriggers(gs, players, 1, card, { visibility: CARD_GAIN_VISIBILITY.PARTICIPANTS })).toEqual({});
    expect(appendCardGainTriggers(gs, players, 1, card, { visibility: CARD_GAIN_VISIBILITY.PRIVATE })).toEqual({});
    expect(appendCardGainTriggers(gs, players, 1, card, { cardIdentityVisibleToAll: false })).toEqual({});
  });

  it('非邪神或衍生牌，以及持有者自己获得时不触发', () => {
    const players = [makePlayer({ name: '你' }), makePlayer({ name: '艾伦' })];
    const gs = { proliferatingZ: makeProliferatingZState(0, 3), proliferatingZQueue: [] };

    expect(appendCardGainTriggers(gs, players, 1, makeZoneCard('A1'))).toEqual({});
    expect(appendCardGainTriggers(gs, players, 0, makeGodCard('SHU'))).toEqual({});
  });

  it('公开可见性判断只认全员公开牌面身份', () => {
    expect(isPublicCardIdentityGain()).toBe(true);
    expect(isPublicCardIdentityGain({ visibility: CARD_GAIN_VISIBILITY.PUBLIC })).toBe(true);
    expect(isPublicCardIdentityGain({ visibility: CARD_GAIN_VISIBILITY.PUBLIC, cardIdentityVisibleToAll: false })).toBe(false);
    expect(isPublicCardIdentityGain({ visibility: CARD_GAIN_VISIBILITY.PARTICIPANTS })).toBe(false);
    expect(isPublicCardIdentityGain({ visibility: CARD_GAIN_VISIBILITY.PRIVATE })).toBe(false);
  });

  it('公开牌面获得的语义化入口等价于公开可见调用', () => {
    const players = [makePlayer({ name: '你' }), makePlayer({ name: '艾伦' })];
    const gs = { proliferatingZ: makeProliferatingZState(0, 3), proliferatingZQueue: [] };

    expect(appendPublicCardGainTriggers(gs, players, 1, makeGodCard('SHU'))).toMatchObject({
      proliferatingZQueue: [expect.objectContaining({ drawerIdx: 0, gainOwnerIdx: 1 })],
    });
  });
});
