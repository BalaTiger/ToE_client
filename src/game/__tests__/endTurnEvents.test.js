import { describe, expect, it } from 'vitest';
import {
  END_TURN_EVENT,
  getCthRestDrawCount,
  getEndTurnEvents,
  getEndTurnReplayHandCards,
  hasEndTurnReplayHandEvent,
} from '../endTurnEvents';
import { makePlayer, makeZoneCard } from './factory';

const corridor = (id = 'corridor') => makeZoneCard('A3', 0, { id, name: '无尽通道', type: 'endTurnReplayHand' });

describe('endTurnEvents', () => {
  it('detects CTH rest draw as an active god end-turn event', () => {
    const player = makePlayer({ isResting: true, godName: 'CTH', godLevel: 2 });

    expect(getCthRestDrawCount(player)).toBe(2);
    expect(getEndTurnEvents([player], 0)).toEqual([
      expect.objectContaining({ id: END_TURN_EVENT.CTH_REST_DRAW, drawCount: 2 }),
    ]);
  });

  it('引燃火把免疫时不触发拉莱耶休息摸牌', () => {
    const player = makePlayer({ isResting: true, godName: 'CTH', godLevel: 2, godPowerImmuneThisTurn: true });

    expect(getCthRestDrawCount(player)).toBe(0);
    expect(getEndTurnEvents([player], 0)).toEqual([]);
  });

  it('uses only cards left of endless corridor for end-turn replay', () => {
    const leftA = makeZoneCard('A1', 0, { id: 'left-a' });
    const leftB = makeZoneCard('B2', 0, { id: 'left-b' });
    const right = makeZoneCard('C3', 0, { id: 'right' });
    const player = makePlayer({ hand: [leftA, leftB, corridor(), right] });

    expect(hasEndTurnReplayHandEvent([player], 0)).toBe(true);
    expect(getEndTurnReplayHandCards(player).map(card => card.id)).toEqual(['left-a', 'left-b']);
  });

  it('sorts active god events before passive card events', () => {
    const left = makeZoneCard('A1', 0, { id: 'left' });
    const player = makePlayer({
      isResting: true,
      godName: 'CTH',
      godLevel: 1,
      hand: [left, corridor()],
    });

    expect(getEndTurnEvents([player], 0).map(event => event.id)).toEqual([
      END_TURN_EVENT.CTH_REST_DRAW,
      END_TURN_EVENT.END_TURN_REPLAY_HAND,
    ]);
  });
});
