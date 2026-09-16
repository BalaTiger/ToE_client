import { Children } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BattleScreen } from './BattleScreen';
import { BattleHeader } from './BattleHeader';
import { BattleSceneContent } from './BattleSceneContent';
import { getCoastalViewport } from './coastalViewport';
import { COASTAL_CORNER } from './coastalGeometry';
import { GammaSlider } from '../ui/GammaSlider';

const appearance = vi.hoisted(() => ({ id: 'coastal', battleLayout: 'coastal' }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal(),
  useRef: value => ({ current: value }),
  useState: initial => [typeof initial === 'function' ? initial() : initial, vi.fn()],
  useEffect: vi.fn(),
  useLayoutEffect: vi.fn(),
}));
vi.mock('react-dom', () => ({ createPortal: children => children }));
vi.mock('../../ui/UiAppearance', () => ({ useUiAppearance: () => ({ appearance, appearances: [appearance], setAppearance: vi.fn() }) }));

function collect(node, nodes = []) {
  if (!node?.props) return nodes;
  nodes.push(node);
  Children.toArray(node.props.children).forEach(child => collect(child, nodes));
  return nodes;
}

function renderBattle(overrides = {}) {
  return BattleScreen({
    vw: 1600, vh: 1000,
    gs: { players: [], deck: [], inspectionDeck: [], expansionKey: '群星呼唤' },
    visualPlayers: [], visualDiscard: [], phase: 'ACTION', baseFontSizes: { body: 12 },
    mobileCssPx: value => value, boardCssPx: value => value,
    setIsSoloPaused: vi.fn(), requestExitMatch: vi.fn(),
    ...overrides,
  });
}

beforeEach(() => {
  Object.assign(appearance, { id: 'coastal', battleLayout: 'coastal' });
  vi.stubGlobal('window', { __PUBLIC_BASE__: '/' });
  vi.stubGlobal('document', { body: {} });
});
afterEach(() => vi.unstubAllGlobals());

describe('coastal B system controls', () => {
  it.each([[1600, 1000], [1900, 1000], [2560, 720], [390, 844]])('shares the corner scale and viewport anchor at %ix%i', (vw, vh) => {
    const nodes = collect(renderBattle({ vw, vh }));
    const root = nodes.find(node => node.props.className?.startsWith('toe-battle-root'));
    const settings = Children.toArray(root.props.children).find(node => node.type === GammaSlider);
    const frame = getCoastalViewport(vw, vh);
    const style = settings.props.battleControls.style;

    expect(style.top).toBeCloseTo(frame.top + (COASTAL_CORNER.top + COASTAL_CORNER.controlsTop) * frame.scale);
    expect(style.right).toBeCloseTo(frame.left + (COASTAL_CORNER.right + COASTAL_CORNER.controlsRight) * frame.scale);
    expect(style['--toe-coastal-system-scale']).toBe(frame.scale);
    expect(root.props.style.transform).toBeUndefined();
  });

  it.each([
    { pendingRoleSelection: {} },
    { roleRevealAnim: { role: '寻宝者' } },
  ])('does not mount controls before the identity reveal ends: %j', flags => {
    expect(collect(renderBattle(flags)).some(node => node.type === GammaSlider)).toBe(false);
    Object.assign(appearance, { id: 'arcane-table', battleLayout: 'arch' });
    const nodes = collect(renderBattle(flags));
    expect(nodes.some(node => node.type === GammaSlider)).toBe(false);
    expect(nodes.find(node => node.type === BattleHeader).props.hidePauseButton).toBe(true);
  });

  it.each([false, true])('uses identical discs and graphical icons, multiplayer=%s', isMultiplayer => {
    const onPause = vi.fn();
    const tree = GammaSlider({ gamma: 1, battleControls: { isMultiplayer, onPause } });
    const triggers = collect(tree).find(node => node.props.className === 'toe-settings-triggers');
    const buttons = Children.toArray(triggers.props.children);
    expect(triggers.props['data-single']).toBe(isMultiplayer);
    expect(buttons.map(button => button.props['aria-label'])).toEqual(isMultiplayer ? ['对局菜单'] : ['暂停游戏', '对局菜单']);
    expect(buttons.at(-1).props['aria-expanded']).toBe(false);
    for (const button of buttons) {
      const images = collect(button).filter(node => node.type === 'img');
      expect(images.map(image => image.props.className)).toEqual(['toe-coastal-system-disc', 'toe-coastal-system-glyph']);
      expect(images[0].props.src).toBe('/img/ui/coastal/corner-b-control.webp');
      expect(images[1].props.src).toBe(`/img/ui/coastal/corner-b-${button.props['aria-label'] === '暂停游戏' ? 'pause' : 'settings'}.svg`);
      expect(images.every(image => image.props['aria-hidden'] === 'true' && image.props.alt === '')).toBe(true);
      expect(Children.toArray(button.props.children).some(child => typeof child === 'string')).toBe(false);
    }
    if (!isMultiplayer) {
      buttons[0].props.onClick();
      expect(onPause).toHaveBeenCalledOnce();
    }
  });

  it.each([false, true])('synchronizes only the buttons with the board shake, paused=%s', isSoloPaused => {
    const sceneShake = { keyframes: [{ transform: 'translateX(0)' }, { transform: 'translateX(8px)' }], timing: { duration: 400 } };
    const battle = collect(renderBattle({ sceneShake, isSoloPaused }));
    const board = battle.find(node => node.type === BattleSceneContent);
    const settings = battle.find(node => node.type === GammaSlider);
    const tree = GammaSlider({ ...settings.props, defaultOpen: true });
    const [motion, panel] = Children.toArray(tree.props.children);

    expect(motion.type).toBe(BattleSceneContent);
    expect(motion.props.shake).toBe(board.props.shake);
    expect(motion.props.shake).toBe(sceneShake);
    expect(motion.props.paused).toBe(board.props.paused);
    expect(motion.props.paused).toBe(isSoloPaused);
    expect(motion.props.className).toBe('toe-settings-trigger-motion');
    expect(motion.props.children.props.className).toBe('toe-settings-triggers');
    expect(motion.props.style?.zoom).toBeUndefined();
    expect(panel.props.className).toContain('toe-settings-panel');
    expect(tree.props.style.transform).toBeUndefined();
    expect(collect(motion).some(node => node.props.className?.includes('toe-settings-panel'))).toBe(false);
  });

  it('keeps the main-menu controls outside the scene-shake implementation', () => {
    expect(collect(GammaSlider({ gamma: 1, startControlScale: .8 })).some(node => node.type === BattleSceneContent)).toBe(false);
  });

  it('retains the request-confirmation callback and tutorial restrictions', () => {
    const requestExitMatch = vi.fn(), returnToMainMenu = vi.fn();
    const settings = collect(renderBattle({ requestExitMatch, returnToMainMenu }))
      .find(node => node.type === GammaSlider);
    const tree = GammaSlider({ ...settings.props, defaultOpen: true });
    collect(tree).find(node => node.props.className?.includes('toe-settings-exit')).props.onClick();
    expect(requestExitMatch).toHaveBeenCalledOnce();
    expect(returnToMainMenu).not.toHaveBeenCalled();

    const tutorial = collect(GammaSlider({ gamma: 1, defaultOpen: true, battleControls: { showTutorial: true } }));
    expect(tutorial.find(node => node.props['aria-label'] === '暂停游戏').props.disabled).toBe(true);
    expect(tutorial.find(node => node.props.className?.includes('toe-settings-exit')).props.disabled).toBe(true);
  });
});
