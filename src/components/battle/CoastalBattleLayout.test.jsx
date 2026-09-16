import { Children } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoastalBattleLayout, CoastalOpponents } from './CoastalBattleLayout';
import { SelfPlayerPanel } from './SelfPlayerPanel';
import { PileDisplay } from '../board';
import { BattleLogPanel } from '../log/BattleLogPanel';
import { HandArea } from './HandArea';

vi.mock('react', async importOriginal => ({
  ...await importOriginal(),
  useRef: () => ({ current: null }),
  useState: initial => [initial, () => {}],
  useLayoutEffect: () => {},
}));

beforeEach(() => vi.stubGlobal('window', { __PUBLIC_BASE__: '/' }));
afterEach(() => vi.unstubAllGlobals());

function slot(root, name) {
  return Children.toArray(root.props.children).find(child => child.props.className === `toe-coastal-${name}`);
}

describe('coastal battle composition', () => {
  it('moves the existing regions without losing refs, game data, or interaction callbacks', () => {
    const refs = Array.from({ length: 5 }, () => ({ current: null }));
    const handleTarget = vi.fn(), handleCard = vi.fn(), confirmDiscard = vi.fn();
    const discardCards = [{ id: 'visible-discard' }], visibleLog = ['展示日志'];
    const prompt = <div data-prompt-panel>请选择一张手牌</div>;
    const opponents = <div data-opponents />;
    const root = CoastalBattleLayout({
      opponents, prompt,
      middle: <div>
        <SelfPlayerPanel selfPanelRef={refs[0]} handleAIClick={handleTarget} />
        <PileDisplay deckRef={refs[1]} discardRef={refs[2]} discardCards={discardCards} />
        <BattleLogPanel logRef={refs[3]} visibleLog={visibleLog} />
      </div>,
      hand: <HandArea handAreaRef={refs[4]} handleMyCardClick={handleCard} confirmDiscard={confirmDiscard} />,
      counts: { inspection: 30, deck: 41, discard: 1 }, turn: 3, turnLabel: '你的回合',
    });
    const self = slot(root, 'self').props.children;
    const piles = slot(root, 'piles').props.children;
    const log = slot(root, 'log').props.children;
    const hand = slot(root, 'hand').props.children;
    expect(self.type).toBe(SelfPlayerPanel);
    expect(self.props.selfPanelRef).toBe(refs[0]);
    expect(piles.type).toBe(PileDisplay);
    expect(piles.props.deckRef).toBe(refs[1]);
    expect(piles.props.discardRef).toBe(refs[2]);
    expect(piles.props.discardCards).toBe(discardCards);
    expect(log.type).toBe(BattleLogPanel);
    expect(log.props.logRef).toBe(refs[3]);
    expect(log.props.visibleLog).toBe(visibleLog);
    expect(log.props.coastalBook).toBe(true);
    expect(slot(root, 'roles').props.children).toBe(opponents);
    expect(hand.type).toBe(HandArea);
    expect(hand.props.handAreaRef).toBe(refs[4]);
    expect(hand.props.phasePrompt).toBe(prompt);
    expect(hand.props.coastalGeometry.piles.height).toBe(piles.props.baseHeight);
    self.props.handleAIClick(2);
    hand.props.handleMyCardClick(4);
    hand.props.confirmDiscard();
    expect(handleTarget).toHaveBeenCalledWith(2);
    expect(handleCard).toHaveBeenCalledWith(4);
    expect(confirmDiscard).toHaveBeenCalledOnce();
  });

  it.each([
    { inspection: 30, deck: 41, discard: 5 },
    { inspection: 0, deck: 0, discard: 46 },
  ])('keeps the separate caption counts current, including empty piles: %j', counts => {
    const root = CoastalBattleLayout({
      middle: <div><div /><div /><div /></div>, hand: <div />, counts,
    });
    const badge = slot(root, 'counts');
    expect(badge.props['aria-label']).toBe('牌堆计数');
    const rows = Children.toArray(badge.props.children).map(row => {
      const [icon, label, count] = Children.toArray(row.props.children);
      expect(icon.props['aria-hidden']).toBe('true');
      return [label.props.children, count.props.children];
    });
    expect(rows).toEqual([['检定', counts.inspection], ['牌堆', counts.deck], ['弃牌', counts.discard]]);
  });

  it.each([false, true])('retains every crowded seat and raises the current turn, compact=%s', compact => {
    const ref = { current: null }, onClick = vi.fn();
    const root = CoastalOpponents({ ref, compact, currentTurn: 4,
      children: Array.from({ length: 8 }, (_, index) => <div key={index} data-pid={index + 1} style={{ position: 'relative', zIndex: 101 }} onClick={onClick} />),
    });
    const seats = Children.toArray(root.props.children);
    expect(root.props.ref).toBe(ref);
    expect(root.props['aria-label']).toBe('其他角色');
    expect(root.props['data-crowded']).toBe(true);
    expect(root.props.tabIndex).toBe(compact ? 0 : undefined);
    expect(seats.map(seat => seat.props['data-pid'])).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(seats.filter(seat => seat.props['data-current-turn'])).toHaveLength(1);
    expect(seats[3].props.style.zIndex).toBeGreaterThan(Math.max(...seats.filter((_, index) => index !== 3).map(seat => seat.props.style.zIndex)));
    seats.forEach(seat => {
      expect(seat.props.onClick).toBe(onClick);
      expect(seat.props.style.position).toBe('relative');
    });
  });
});
