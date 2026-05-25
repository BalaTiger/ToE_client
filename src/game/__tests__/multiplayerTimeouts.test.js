import { describe, expect, it } from 'vitest';
import { resolveMpTimeoutToAction } from '../multiplayerTimeouts';
import { makeGodCard, makeGs, makePlayer, makeZoneCard } from './factory';

describe('resolveMpTimeoutToAction', () => {
  it('超时放弃摸牌决策时将牌弃置并回到行动阶段', () => {
    const card = makeZoneCard('A1', 0);
    const gs = makeGs({
      players: [makePlayer({ name: '玩家' })],
      discard: [],
      phase: 'DRAW_REVEAL',
      drawReveal: { card, needsDecision: true, drawerName: '玩家' },
      log: ['摸牌'],
    });

    const next = resolveMpTimeoutToAction(gs);

    expect(next.phase).toBe('ACTION');
    expect(next.drawReveal).toBeNull();
    expect(next.discard).toEqual([card]);
    expect(next.log.at(-1)).toContain('弃置了');
  });

  it('强制收入摸牌决策会把牌加入摸牌者手牌', () => {
    const card = makeZoneCard('A1', 0);
    const gs = makeGs({
      players: [makePlayer({ name: '玩家', hand: [] })],
      deck: [],
      discard: [],
      phase: 'DRAW_REVEAL',
      drawReveal: { card, needsDecision: true, forcedKeep: true, drawerIdx: 0, drawerName: '玩家' },
      log: [],
    });

    const next = resolveMpTimeoutToAction(gs);

    expect(next.phase).toBe('ACTION');
    expect(next.players[0].hand).toContain(card);
    expect(next.log[0]).toContain('被迫收入');
  });

  it('邪神选择超时会放弃邪神馈赠', () => {
    const godCard = makeGodCard('NYA');
    const gs = makeGs({
      players: [makePlayer()],
      discard: [],
      phase: 'GOD_CHOICE',
      abilityData: { godCard },
      log: [],
    });

    const next = resolveMpTimeoutToAction(gs);

    expect(next.phase).toBe('ACTION');
    expect(next.abilityData).toEqual({});
    expect(next.discard[0]).toMatchObject({ id: godCard.id, godKey: 'NYA' });
    expect(next.log.at(-1)).toBe('(超时) 放弃了邪神的馈赠');
  });

  it('奈亚借身超时会跳过借身并处理后续摸牌决策', () => {
    const drawn = makeZoneCard('B2', 0);
    const gs = makeGs({
      players: [makePlayer({ name: '玩家', hand: [] })],
      deck: [drawn],
      discard: [],
      phase: 'NYA_BORROW',
      log: [],
    });

    const next = resolveMpTimeoutToAction(gs);

    expect(next.phase).toBe('ACTION');
    expect(next.discard).toContain(drawn);
    expect(next.log[0]).toBe('(超时) 跳过借身');
    expect(next.log.at(-1)).toContain('弃置了');
  });
});
