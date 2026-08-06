import { describe, expect, it } from 'vitest';
import {
  END_TURN_EVENT,
  END_TURN_PRIORITY,
  getCthRestDrawCount,
  getEndTurnEvents,
  getEndTurnReplayHandCards,
  hasEndTurnReplayHandEvent,
  runEndTurnEvents,
  resolveReverseTurnOrderAtEnd,
} from '../endTurnEvents';
import { makePlayer, makeZoneCard } from './factory';

const corridor = (id = 'corridor') => makeZoneCard('A3', 0, { id, name: '无尽通道', type: 'endTurnReplayHand' });
const leftCard = (id = 'left') => makeZoneCard('A1', 0, { id });

describe('endTurnEvents', () => {
  it('detects CTH rest draw as an active god end-turn event', () => {
    const player = makePlayer({ isResting: true, godName: 'CTH', godLevel: 2 });

    expect(getCthRestDrawCount(player)).toBe(2);
    expect(getEndTurnEvents([player], 0)).toEqual([
      expect.objectContaining({ id: END_TURN_EVENT.CTH_REST_DRAW, drawCount: 2 }),
      expect.objectContaining({ id: END_TURN_EVENT.END_TURN_REPLAY_HAND, dynamicHandCheck: true }),
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

  // ── Phase A: 黄液(蟾蜍之神)登记为回合结束事件，按优先级排序 ──
  it('蟾蜍之神回合结束发放黄液登记为 PASSIVE_GOD 事件', () => {
    const player = makePlayer({ godName: 'TSG', godLevel: 2 });
    expect(getEndTurnEvents([player], 0)).toEqual([
      expect.objectContaining({ id: END_TURN_EVENT.TSG_SLIME_GRANT, priority: END_TURN_PRIORITY.PASSIVE_GOD, slimeCount: 2 }),
    ]);
  });

  it('引燃火把免疫时不登记黄液事件', () => {
    const player = makePlayer({ godName: 'TSG', godLevel: 1, godPowerImmuneThisTurn: true });
    expect(getEndTurnEvents([player], 0)).toEqual([]);
  });

  it('黄液(神牌)排在无尽通道(其他卡牌)之前', () => {
    const player = makePlayer({ godName: 'TSG', godLevel: 1, hand: [leftCard(), corridor()] });
    expect(getEndTurnEvents([player], 0).map(e => e.id)).toEqual([
      END_TURN_EVENT.TSG_SLIME_GRANT,
      END_TURN_EVENT.END_TURN_REPLAY_HAND,
    ]);
  });

  it('逆流登记为回合结束事件并锁定本阶段的反转次数', () => {
    const player = makePlayer({ pendingTurnDirectionReversals: 1 });
    expect(getEndTurnEvents([player], 0)).toEqual([
      expect.objectContaining({
        id: END_TURN_EVENT.REVERSE_TURN_ORDER,
        priority: END_TURN_PRIORITY.ACTIVE_OTHER,
        reverseCount: 1,
      }),
    ]);
  });

  it('逆流结算时反转方向并清除待结算标记', () => {
    const player = makePlayer({ name: '艾伦', pendingTurnDirectionReversals: 1 });
    const log = [];
    const result = resolveReverseTurnOrderAtEnd([player], 0, 1, log, 1);

    expect(result.turnDirection).toBe(-1);
    expect(player.pendingTurnDirectionReversals).toBeUndefined();
    expect(result.msgs[0]).toContain('逆流');
  });

  it('getEndTurnEvents 始终按优先级升序返回（守卫：新增事件不会乱序）', () => {
    const players = [
      makePlayer({ godName: 'TSG', godLevel: 1, hand: [leftCard(), corridor()] }),
      makePlayer({ isResting: true, godName: 'CTH', godLevel: 2, hand: [leftCard('l2'), corridor('c2')] }),
    ];
    players.forEach((p, i) => {
      const prios = getEndTurnEvents([p], i).map(e => e.priority);
      expect(prios).toEqual([...prios].sort((a, b) => a - b));
    });
  });
});

// ── Phase B: 回合结束事件统一调度器（可续跑游标） ──
describe('runEndTurnEvents', () => {
  const events = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('按列表顺序逐个执行并最终完成', () => {
    const seen = [];
    let completed = false;
    runEndTurnEvents(events, {
      runEvent: (event, _i, advance) => { seen.push(event.id); advance(); },
      onComplete: () => { completed = true; },
    });
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(completed).toBe(true);
  });

  it('事件暂停（不调用 advance）时停住，可用游标从下一个续跑', () => {
    const seen = [];
    let completed = false;
    let resumeCursor = null;
    // 在 'b' 处暂停（模拟进入玩家决策）
    runEndTurnEvents(events, {
      runEvent: (event, cursor, advance) => {
        seen.push(event.id);
        if (event.id === 'b') { resumeCursor = cursor + 1; return; }
        advance();
      },
      onComplete: () => { completed = true; },
    });
    expect(seen).toEqual(['a', 'b']);
    expect(completed).toBe(false);
    expect(resumeCursor).toBe(2);

    // 决策结算后从游标续跑
    runEndTurnEvents(events, {
      runEvent: (event, _i, advance) => { seen.push(event.id); advance(); },
      onComplete: () => { completed = true; },
      cursor: resumeCursor,
    });
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(completed).toBe(true);
  });

  it('空事件列表直接完成', () => {
    let completed = false;
    runEndTurnEvents([], { runEvent: () => { throw new Error('should not run'); }, onComplete: () => { completed = true; } });
    expect(completed).toBe(true);
  });
});
