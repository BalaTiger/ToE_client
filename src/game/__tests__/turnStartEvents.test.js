import { describe, expect, it } from 'vitest';
import { createBlackGoatYoungCard } from '../../constants/card';
import {
  TURN_START_EVENT,
  TURN_START_PRIORITY,
  getTurnStartEvents,
} from '../turnStartEvents';
import { makePlayer } from './factory';

describe('turn-start event registry', () => {
  it('orders passive damage before link healing and active god powers for every controller', () => {
    const player = makePlayer({
      godName: 'NYA',
      godLevel: 1,
      poisonStacks: 2,
      hand: [createBlackGoatYoungCard()],
    });

    const events = getTurnStartEvents([player], 0, {
      pendingLinkHeals: [{ i: 0, partnerIdx: 1, amount: 4 }],
    });

    expect(events.map(event => event.id)).toEqual([
      TURN_START_EVENT.BLACK_GOAT_YOUNG_DAMAGE,
      TURN_START_EVENT.POISON_DAMAGE,
      TURN_START_EVENT.DAMAGE_LINK_HEAL,
      TURN_START_EVENT.NYA_BORROW,
    ]);
    expect(events.map(event => event.priority)).toEqual([
      TURN_START_PRIORITY.PASSIVE_GOD_DERIVATIVE,
      TURN_START_PRIORITY.PASSIVE_OTHER,
      TURN_START_PRIORITY.PASSIVE_OTHER,
      TURN_START_PRIORITY.ACTIVE_GOD,
    ]);
  });

  it('registers only the ZHU owner-turn refresh as an active-god event', () => {
    const player = makePlayer({ godName: 'ZHU', godLevel: 1 });
    expect(getTurnStartEvents([player], 0).map(event => event.id)).toEqual([
      TURN_START_EVENT.ZHU_LIGHT_REFRESH,
    ]);
  });
});
