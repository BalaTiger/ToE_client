import { Children } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpponentRoster } from './OpponentRoster';
import { getOpponentRosterLayout } from './opponentRosterLayout';

const hooks = vi.hoisted(() => ({ values: [], index: 0 }));
vi.mock('react', async original => ({
  ...await original(),
  useRef: () => ({ current: null }),
  useLayoutEffect: () => {}, useEffect: () => {},
  useState: initial => {
    const index = hooks.index++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], next => { hooks.values[index] = typeof next === 'function' ? next(hooks.values[index]) : next; }];
  },
}));
beforeEach(() => { hooks.values = []; hooks.index = 0; });

function render(currentTurn = 4) {
  hooks.index = 0;
  const root = OpponentRoster({ currentTurn, children: Array.from({ length: 11 }, (_, index) =>
    <div key={index} data-pid={index + 1}><div player={{ name: `角色${index + 1}` }} /></div>) });
  const seats = Children.toArray(root.props.children);
  const surface = index => Children.toArray(seats[index].props.children.props.children).at(-1);
  const bridge = index => Children.toArray(seats[index].props.children.props.children).find(child => child.props.className === 'toe-opponent-entry-bridge');
  return { root, seats, surface, bridge, panel: index => surface(index).props.children };
}

describe('crowded opponent seats', () => {
  it.each([0, 1, 6, 11])('fits eleven seats without changing frame sizes, turn=%s', currentTurn => {
    const { seats } = getOpponentRosterLayout({ count: 11, currentTurn, width: 630 });
    expect(seats).toHaveLength(11);
    seats.forEach((seat, index) => {
      expect(seat.width).toBe(index + 1 === currentTurn ? 154 : 64);
      expect(seat.x).toBeGreaterThanOrEqual(0);
      expect(seat.x + seat.width).toBeLessThanOrEqual(630.00001);
      if (index) expect(seat.x).toBeGreaterThan(seats[index - 1].x);
    });
  });

  it('uses gaps when five seats fit, overlap only when needed', () => {
    const spacious = getOpponentRosterLayout({ count: 5, currentTurn: 2, width: 630 }).seats;
    expect(spacious[1].x - spacious[0].x - spacious[0].width).toBe(16);
    expect(spacious[4].x - spacious[3].x - spacious[3].width).toBe(6);
    const crowded = getOpponentRosterLayout({ count: 11, currentTurn: 2, width: 630 }).seats;
    expect(crowded[1].x).toBeGreaterThan(crowded[0].x + crowded[0].width);
    expect(crowded[4].x).toBeLessThan(crowded[3].x + crowded[3].width);
  });

  it('reserves both full panels while hovering and keeps the pointer entry path across reflow', () => {
    const before = render();
    expect(before.panel(1).props.simplified).toBe(true);
    before.seats[1].props.onPointerEnter({ pointerType: 'mouse' });
    const opened = render();
    expect(opened.panel(1).props.simplified).toBe(false);
    expect(opened.panel(3).props.simplified).toBe(false);
    expect(opened.seats[1].props.style.zIndex).toBeGreaterThan(opened.seats[3].props.style.zIndex);
    expect(opened.seats[1].props.style.width).toBe(154);
    expect(opened.root.props.style.height).toBe(before.root.props.style.height);
    const bridge = opened.bridge(1).props.style;
    expect(opened.seats[1].props.style.left + bridge.left).toBeLessThanOrEqual(before.seats[1].props.style.left);
    expect(opened.seats[1].props.style.left + bridge.left + bridge.width).toBeGreaterThanOrEqual(before.seats[1].props.style.left + 64);
    opened.surface(1).props.onPointerMove();
    expect(render().bridge(1)).toBeUndefined();
    expect(render().panel(1).props.simplified).toBe(false);
    opened.seats[1].props.onPointerLeave({ pointerType: 'mouse' });
    expect(render().panel(1).props.simplified).toBe(true);
    expect(render().panel(3).props.simplified).toBe(false);
  });

  it.each([0, 1, 2, 6, 10, 11])('only overlaps compact neighbours, including any hovered seat; turn=%s', currentTurn => {
    for (let expandedPid = 0; expandedPid <= 11; expandedPid++) {
      const { seats } = getOpponentRosterLayout({ count: 11, currentTurn, expandedPid, width: 630 });
      const isFull = index => index + 1 === currentTurn || index + 1 === expandedPid;
      expect(seats[0].x).toBeGreaterThanOrEqual(0);
      expect(seats.at(-1).x + seats.at(-1).width).toBeCloseTo(630);
      seats.forEach((seat, index) => {
        expect(seat.width).toBe(isFull(index) ? 154 : 64);
        if (!index) return;
        const gap = seat.x - seats[index - 1].x - seats[index - 1].width;
        if (isFull(index) || isFull(index - 1)) expect(gap).toBeCloseTo(16);
        else expect(gap).toBeLessThan(0);
      });
    }
  });

  it('keeps focus inside the expanded content and closes only when focus leaves', () => {
    render().seats[1].props.onFocusCapture({ target: { matches: () => true } });
    const inside = render();
    inside.seats[1].props.onBlurCapture({ currentTarget: { contains: () => true }, relatedTarget: {} });
    expect(render().panel(1).props.simplified).toBe(false);
    render().seats[1].props.onBlurCapture({ currentTarget: { contains: () => false }, relatedTarget: {} });
    expect(render().panel(1).props.simplified).toBe(true);
  });

  it('first touch opens without selecting a game target, while the next click is left intact', () => {
    render().seats[1].props.onPointerEnter({ pointerType: 'touch' });
    expect(render().panel(1).props.simplified).toBe(true);
    const stopPropagation = vi.fn();
    render().seats[1].props.onClickCapture({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(render().panel(1).props.simplified).toBe(false);
    stopPropagation.mockClear();
    render().seats[1].props.onClickCapture({ stopPropagation });
    expect(stopPropagation).not.toHaveBeenCalled();
  });

  it('follows the presented turn, including returning to the player turn', () => {
    expect(render(4).panel(3).props.simplified).toBe(false);
    expect(render(6).panel(3).props.simplified).toBe(true);
    expect(render(6).panel(5).props.simplified).toBe(false);
    expect(render(0).seats.every(seat => seat.props['data-opponent-collapsible'])).toBe(true);
  });
});
