import { Children } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DDCard } from '../cards';
import { HandArea } from './HandArea';
import { getCoastalGeometry } from './coastalGeometry';
import { ActionIcon } from './ActionIcon';

const runtime = vi.hoisted(() => ({ layout: 'coastal', space: null, measure: null }));
vi.mock('../../ui/UiAppearance', () => ({
  useUiAppearance: () => ({ appearance: { id: runtime.layout, battleLayout: runtime.layout } }),
}));
vi.mock('react', async importOriginal => ({
  ...await importOriginal(),
  useRef: initial => ({ current: initial }),
  useState: initial => [runtime.space ?? initial, update => { runtime.space = typeof update === 'function' ? update(runtime.space ?? initial) : update; }],
  useLayoutEffect: setup => { runtime.measure = setup; },
}));

function descendants(node) {
  return [node, ...Children.toArray(node?.props?.children).flatMap(descendants)];
}

function makeProps(overrides = {}) {
  const hand = Array.from({ length: 5 }, (_, index) => ({ id: `card-${index}` }));
  hand[0].isBlackGoatYoung = true;
  const me = { hand, role: '寻宝者' };
  return {
    gs: { players: [me], abilityData: {} }, me, visualMe: me,
    ri: { icon: '✦' }, skillRi: { icon: '✦' },
    phase: 'ACTION', myTurn: true, isVisualPlayerTurn: true,
    phasePrompt: <div data-test-prompt>请选择行动</div>,
    isLocalCurrentTurn: () => true, effectiveHandLimit: 4,
    effectiveSkillName: '掉包', canShowEndTurnButton: true,
    interactionFontSizes: { body: 14 }, mobileCssPx: value => value,
    selfHandCardScale: 1, scaleRatio: 1,
    isMyCardClickable: () => false, canPlayerRespondWithAnyHandCard: () => true,
    canPlayerRespondWithFireHandCard: () => false,
    mobileGodCardRefs: { current: new Map() },
    useAbility: vi.fn(), doRest: vi.fn(), endTurn: vi.fn(), setGs: vi.fn(),
    cancelAction: vi.fn(), confirmDiscard: vi.fn(), confirmBuryAliveSelection: vi.fn(),
    confirmIgniteTorchDiscard: vi.fn(), huntConfirm: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal('window', {});
  runtime.layout = 'coastal';
  runtime.space = null;
  runtime.measure = null;
});
afterEach(() => vi.unstubAllGlobals());

describe('coastal hand composition', () => {
  it('uses the shared pile/hand fit and keeps a small hand anchored beside the actions', () => {
    const props = makeProps();
    props.visualMe.hand = props.visualMe.hand.slice(0, 2);
    props.coastalGeometry = getCoastalGeometry({ width: 1200, height: 620, handCount: 2, rolesBottom: 210 });
    const nodes = descendants(HandArea(props));
    const strip = nodes.find(node => node?.props?.['data-self-hand-strip'] !== undefined);
    expect(strip.props.style.justifyContent).toBe('flex-end');
    expect(runtime.measure()).toBeUndefined();
    nodes.filter(node => node?.type === DDCard).forEach(face => {
      expect(face.props.frameStyle.width).toBe(props.coastalGeometry.hand.cardWidth);
    });
  });
  it('fits the hand to its own column without requiring the removed reliefs', () => {
    const props = makeProps();
    const tree = HandArea(props);
    const nodes = descendants(tree);
    expect(tree.props['data-hand-composition']).toBe('coastal');
    expect(nodes.filter(node => node?.props?.['data-test-prompt'])).toHaveLength(1);
    const badge = nodes.find(node => node?.props?.className === 'toe-hand-count');
    expect(badge.props['aria-label']).toBe('手牌 5 张，上限 4 张');
    expect(badge.props['data-over-limit']).toBe(true);
    expect(Children.toArray(tree.props.children).some(node => node?.props?.className === 'toe-hand-count')).toBe(true);

    const strip = nodes.find(node => node?.props?.['data-self-hand-strip'] !== undefined);
    const element = { clientWidth: 708, offsetWidth: 708, getBoundingClientRect: () => ({ width: 708 }) };
    strip.props.ref.current = element;
    const observer = { observe: vi.fn(), disconnect: vi.fn() };
    vi.stubGlobal('ResizeObserver', class { constructor() { return observer; } });
    const cleanup = runtime.measure();
    expect(observer.observe).toHaveBeenCalledExactlyOnceWith(element);
    const resized = descendants(HandArea(props));
    const faces = resized.filter(node => node?.type === DDCard);
    const width = 708 / 4.2;
    expect(faces).toHaveLength(5);
    faces.forEach(face => {
      expect(face.props.frameStyle.width).toBeCloseTo(width);
      expect(face.props.showCaption).toBe(false);
      expect(face.props.hoverPreview).toBe(false);
      expect(face.props.disabled).toBe(true);
    });
    const cards = resized.filter(node => node?.props?.['data-self-hand-card'] !== undefined);
    expect(cards[1].props.style.marginLeft).toBeCloseTo(-width * .2);
    cleanup();
    expect(observer.disconnect).toHaveBeenCalledOnce();
  });

  it('keeps the live action handlers and places every action inside the control group', () => {
    const props = makeProps();
    const controls = descendants(HandArea(props)).find(node => node?.props?.className === 'toe-hand-controls');
    const buttons = descendants(controls).filter(node => node?.type === 'button');
    expect(buttons).toHaveLength(4);
    expect(descendants(controls).filter(node => node?.type === ActionIcon).map(node => node.props.kind)).toEqual(['treasure', 'rest', 'multiply', 'end']);
    buttons[0].props.onClick();
    buttons[1].props.onClick();
    buttons[2].props.onClick();
    buttons[3].props.onClick();
    expect(props.useAbility).toHaveBeenCalledOnce();
    expect(props.doRest).toHaveBeenCalledOnce();
    expect(props.setGs).toHaveBeenCalledWith(expect.objectContaining({ phase: 'MULTIPLY_SELECT_TARGET' }));
    expect(props.endTurn).toHaveBeenCalledOnce();
  });

  it.each([
    ['追猎者', '☩', 'hunt'],
    ['邪祀者', '☽', 'cult'],
    ['邪祀者', '✦', 'treasure'],
    ['寻宝者', '☩', 'hunt'],
    ['寻宝者', '☽', 'cult'],
  ])('uses the upstream effective skill %s / %s, including borrowed professions', (role, effectiveIcon, icon) => {
    const props = makeProps();
    props.me.role = role;
    props.skillRi = { icon: effectiveIcon };
    const skill = descendants(HandArea(props)).find(node => node?.props?.className?.includes('toe-turn-skill'));
    const renderedIcon = descendants(skill).find(node => node?.type === ActionIcon);
    expect(renderedIcon.props.kind).toBe(icon);
    const svg = ActionIcon(renderedIcon.props);
    expect(svg.type).toBe('svg');
    expect(svg.props['aria-hidden']).toBe('true');
    expect(svg.props.viewBox).toBe('0 0 24 24');
  });

  it.each([.55, 1, 1.6])('keeps worship and upgrade hints readable at board scale %s without widening cards', scaleRatio => {
    const props = makeProps({ scaleRatio });
    props.visualMe.godName = 'CTH';
    props.visualMe.godLevel = 1;
    props.visualMe.hand = [
      { id: 'upgrade', isGod: true, godKey: 'CTH' },
      { id: 'worship', isGod: true, godKey: 'VRT' },
    ];
    const nodes = descendants(HandArea(props));
    const hints = nodes.filter(node => node?.props?.['data-hand-card-hint'] !== undefined);
    expect(hints).toHaveLength(2);
    hints.forEach(hint => {
      const logicalSize = Number(hint.props.style.fontSize.match(/calc\(([\d.]+)px/)[1]);
      expect(logicalSize * scaleRatio).toBeGreaterThanOrEqual(12);
      expect(hint.props.style.fontSize).toContain('/ var(--toe-mobile-screen-scale, 1)');
      expect(hint.props.style.maxWidth).toBe('calc(100% - 8px)');
      expect(hint.props.style.boxSizing).toBe('border-box');
      expect(hint.props.style.whiteSpace).toBe('normal');
      expect(hint.props.style.pointerEvents).toBe('none');
    });
    expect(nodes.filter(node => node?.type === DDCard).map(node => node.props.frameStyle.width)).toEqual([200, 200]);
  });

  it.each([
    ['DISCARD_PHASE', { discardSelected: [0] }, 'confirmDiscard'],
    ['BURY_ALIVE_SELECT', { buryAliveSelectedIndex: 0 }, 'confirmBuryAliveSelection'],
    ['IGNITE_TORCH_DISCARD', { igniteTorchSelectedIndex: 0 }, 'confirmIgniteTorchDiscard'],
  ])('preserves cancel and confirmation handlers during %s', (phase, abilityData, confirm) => {
    const props = makeProps({ phase, gs: { abilityData }, cancelable: true, showCancelBtn: true });
    const controls = descendants(HandArea(props)).find(node => node?.props?.className === 'toe-hand-controls');
    const buttons = descendants(controls).filter(node => node?.type === 'button');
    expect(buttons).toHaveLength(2);
    expect(descendants(controls).filter(node => node?.type === ActionIcon).map(node => node.props.kind)).toEqual(['cancel', 'confirm']);
    expect(buttons[1].props.disabled).toBe(false);
    buttons[0].props.onClick();
    buttons[1].props.onClick();
    expect(props.cancelAction).toHaveBeenCalledOnce();
    expect(props[confirm]).toHaveBeenCalledOnce();
  });

});
