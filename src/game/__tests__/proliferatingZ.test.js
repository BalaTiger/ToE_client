import { describe, expect, it } from 'vitest';
import { createBlackGoatYoungCard, createTsathogguaSlimeCard } from '../../constants/card';
import {
  appendProliferatingZDraws,
  buildProliferatingZQueueEntries,
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

  it('为获得者以外的存活角色生成待摸牌队列', () => {
    const players = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '艾伦' }),
      makePlayer({ name: '贝拉', isDead: true }),
      makePlayer({ name: '卡洛斯' }),
    ];
    const entries = buildProliferatingZQueueEntries(players, 1, makeGodCard('SHU'));
    expect(entries.map(entry => entry.drawerIdx)).toEqual([0, 3]);
  });

  it('追加队列但不直接摸牌', () => {
    const players = [makePlayer({ hand: [] }), makePlayer({ hand: [] })];
    const gs = { proliferatingZ: makeProliferatingZState(0, 7), proliferatingZQueue: [] };
    const patch = appendProliferatingZDraws(gs, players, 0, makeGodCard('ZHU'));
    expect(patch.proliferatingZQueue).toHaveLength(1);
    expect(players[1].hand).toHaveLength(0);
  });

  it('在发动者本回合结束时清除状态', () => {
    const state = makeProliferatingZState(2, 4);
    expect(clearExpiredProliferatingZ({ proliferatingZ: state }, 2)).toBeNull();
    expect(clearExpiredProliferatingZ({ proliferatingZ: state }, 1)).toBe(state);
  });
});
