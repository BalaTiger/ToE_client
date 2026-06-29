import { describe, expect, it } from 'vitest';
import { createBlackGoatYoungCard, createTsathogguaSlimeCard } from '../../constants/card';
import {
  appendProliferatingZOwnerDraw,
  buildProliferatingZOwnerDrawEntry,
  clearExpiredProliferatingZ,
  isProliferatingZGain,
  makeProliferatingZState,
} from '../proliferatingZ';
import { makeGodCard, makePlayer, makeZoneCard } from './factory';

describe('proliferatingZ', () => {
  it('只把邪神牌和邪神衍生牌视为获得触发源', () => {
    expect(isProliferatingZGain(makeGodCard('NYA'))).toBe(true);
    expect(isProliferatingZGain(createBlackGoatYoungCard())).toBe(true);
    expect(isProliferatingZGain(createTsathogguaSlimeCard())).toBe(true);
    expect(isProliferatingZGain(makeZoneCard('A1', 0))).toBe(false);
  });

  it('其他角色公开获得邪神牌时，只为增殖的Z持有者生成待摸牌队列', () => {
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '艾伦' }),
      makePlayer({ name: '贝拉', isDead: true }),
      makePlayer({ name: '卡洛斯' }),
    ];
    const gs = { proliferatingZ: makeProliferatingZState(0, 7), proliferatingZQueue: [] };
    const entry = buildProliferatingZOwnerDrawEntry(gs, players, 1, makeGodCard('SHU'));
    expect(entry).toMatchObject({ drawerIdx: 0, gainOwnerIdx: 1 });
  });

  it('持有者自己获得或非公开获得时不会触发', () => {
    const players = [makePlayer({ name: '你' }), makePlayer({ name: '艾伦' })];
    const gs = { proliferatingZ: makeProliferatingZState(0, 7), proliferatingZQueue: [] };
    expect(buildProliferatingZOwnerDrawEntry(gs, players, 0, makeGodCard('SHU'))).toBeNull();
    expect(buildProliferatingZOwnerDrawEntry(gs, players, 1, makeGodCard('SHU'), { publicGain: false })).toBeNull();
  });

  it('只在增殖的Z持有者的当前回合内触发', () => {
    const players = [makePlayer({ name: '你' }), makePlayer({ name: '艾伦' })];
    const gs = {
      currentTurn: 1,
      turn: 7,
      proliferatingZ: makeProliferatingZState(0, 7),
      proliferatingZQueue: [],
    };
    expect(buildProliferatingZOwnerDrawEntry(gs, players, 1, makeGodCard('SHU'))).toBeNull();
    expect(buildProliferatingZOwnerDrawEntry({ ...gs, currentTurn: 0 }, players, 1, makeGodCard('SHU'))).toMatchObject({
      drawerIdx: 0,
      gainOwnerIdx: 1,
    });
    expect(buildProliferatingZOwnerDrawEntry({ ...gs, currentTurn: 0, turn: 8 }, players, 1, makeGodCard('SHU'))).toBeNull();
  });

  it('Z摸牌期间由公开牌效产生的获得仍可继续触发', () => {
    const players = [makePlayer({ name: '你' }), makePlayer({ name: '艾伦' })];
    const gs = { proliferatingZ: makeProliferatingZState(0, 7), proliferatingZQueue: [], abilityData: { fromProliferatingZ: true } };
    const entry = buildProliferatingZOwnerDrawEntry(gs, players, 1, makeGodCard('SHU'));
    expect(entry).toMatchObject({ drawerIdx: 0, gainOwnerIdx: 1 });
  });

  it('追加队列但不直接摸牌', () => {
    const players = [makePlayer({ hand: [] }), makePlayer({ hand: [] })];
    const gs = { proliferatingZ: makeProliferatingZState(0, 7), proliferatingZQueue: [] };
    const patch = appendProliferatingZOwnerDraw(gs, players, 1, makeGodCard('ZHU'));
    expect(patch.proliferatingZQueue).toHaveLength(1);
    expect(patch.proliferatingZQueue[0].drawerIdx).toBe(0);
    expect(players[0].hand).toHaveLength(0);
  });

  it('在当前执行回合结束时清除状态', () => {
    const state = makeProliferatingZState(2, 4);
    expect(clearExpiredProliferatingZ({ proliferatingZ: state }, 2)).toBeNull();
    expect(clearExpiredProliferatingZ({ proliferatingZ: state }, 1)).toBe(state);
  });
});
