import { Children, Fragment } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoastalBattleLayout, CoastalOpponents } from './CoastalBattleLayout';
import { SelfPlayerPanel } from './SelfPlayerPanel';
import { PileDisplay } from '../board';
import { BattleLogPanel } from '../log/BattleLogPanel';
import { HandArea } from './HandArea';
import { CoastalTorch } from './CoastalTorch';
import { SailingSpray, SailingTorchMist } from './SailingSpray';

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
  it('places the main spray behind the foreground and torch using the expanded board geometry', () => {
    const root = CoastalBattleLayout({
      middle: <div><SelfPlayerPanel /><div /><div /></div>, hand: <div />,
      counts: {}, sailingEnabled: true, width: 1000, height: 400,
    });
    const children = Children.toArray(root.props.children);
    const sprayIndex = children.findIndex(child => child.type === SailingSpray);
    const foregroundIndex = children.findIndex(child => child.props.className === 'toe-coastal-foreground');
    const torchIndex = children.findIndex(child => child.type === CoastalTorch);
    expect(sprayIndex).toBeGreaterThanOrEqual(0);
    expect(sprayIndex).toBeLessThan(foregroundIndex);
    expect(sprayIndex).toBeLessThan(torchIndex);
    const geometry = slot(root, 'hand').props.children.props.coastalGeometry;
    expect(geometry.height).toBeGreaterThan(400);
    expect(children[sprayIndex].props).toMatchObject({ width: geometry.width, height: geometry.height });
  });

  it('keeps wake and foam in independent sibling layers whose paths follow the foreground dimensions', () => {
    const pathsAt = (width, height) => {
      const spray = SailingSpray({ active: true, width, height });
      expect(spray.type).toBe(Fragment);
      const layers = Children.toArray(spray.props.children);
      expect(layers.map(layer => layer.props.className)).toEqual([
        'toe-sailing-spray toe-sailing-wake', 'toe-sailing-spray toe-sailing-crest',
      ]);
      const paths = layers.map(layer => Children.toArray(layer.props.children).map(rider =>
        rider.props.style.offsetPath.match(/-?\d+(?:\.\d+)?/g).map((value, index) =>
          Number(value) / (index % 2 ? height : width))));
      expect(paths[0]).toEqual(paths[1]);
      for (const path of paths[0]) expect(path.slice(0, 2)).toEqual([.5, .87]);
      expect(paths[0][0].at(-2)).toBeLessThan(.5);
      expect(paths[0][1].at(-2)).toBeGreaterThan(.5);
      return paths[0].flat();
    };
    const wide = pathsAt(1200, 620), tall = pathsAt(800, 800);
    wide.forEach((point, index) => expect(point).toBeCloseTo(tall[index], 5));
  });

  it.each([false, true])('gates sea effects by theme and shares activity/pause with both wet surfaces: %s', sailingEnabled => {
    const root = CoastalBattleLayout({
      middle: <div><SelfPlayerPanel /><div /><div /></div>, hand: <div />,
      counts: {}, sailingEnabled, sailingActive: true, paused: true,
    });
    const children = Children.toArray(root.props.children);
    const spray = children.find(child => child.type === SailingSpray);
    expect(!!spray).toBe(sailingEnabled);
    if (sailingEnabled) expect(spray.props).toMatchObject({ active: true, paused: true });
    const torch = children.find(child => child.type === CoastalTorch);
    expect(torch.props).toMatchObject({ sailingEnabled, sailingActive: true, sailingPaused: true });
    const self = slot(root, 'self').props.children;
    if (sailingEnabled) expect(self.props).toMatchObject({ sailingEnabled: true, sailingActive: true, sailingPaused: true });
    else expect(self.props.sailingEnabled).toBeUndefined();
  });

  it('throws the few foreground droplets up and left from the sea toward the torch', () => {
    const mist = SailingTorchMist({ active: true, paused: true });
    expect(mist.props['data-paused']).toBe(true);
    const droplets = Children.toArray(mist.props.children);
    expect(droplets).toHaveLength(3);
    for (const droplet of droplets) {
      expect(parseFloat(droplet.props.style['--spray-x'])).toBeLessThan(0);
      expect(parseFloat(droplet.props.style['--spray-y'])).toBeLessThan(0);
    }
  });

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
    expect(hand.props.coastalGeometry.piles.centerX).toBe(603);
    expect(root.props.style['--toe-coastal-self-left']).toBe('-5px');
    expect(root.props.style['--toe-coastal-self-top']).toBe('180px');
    expect(root.props.style['--toe-coastal-self-width']).toBe('150px');
    expect(root.props.style['--toe-coastal-self-height']).toBe('284px');
    expect(slot(root, 'drapery').props.children.props.className).toBe('toe-coastal-log-book');
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
