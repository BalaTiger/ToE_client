import { Children, StrictMode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import AuthorityBattlePresentation from './presentation/AuthorityBattlePresentation';
import AuthorityApp from './AuthorityApp';
import { UiAppearanceProvider } from '../ui/UiAppearance';

const probe = vi.hoisted(() => {
  const storage = () => {
    const entries = new Map();
    return { getItem: key => entries.get(key) ?? null,
      setItem: (key, value) => entries.set(key, String(value)), removeItem: key => entries.delete(key) };
  };
  const root = { id: 'root' };
  vi.stubGlobal('window', { innerWidth: 1600, innerHeight: 1000, __PUBLIC_BASE__: '/',
    location: { search: '', href: 'http://localhost/', protocol: 'http:' },
    localStorage: storage(), sessionStorage: storage() });
  vi.stubGlobal('document', { body: { style: { setProperty: vi.fn() } },
    getElementById: id => id === 'root' ? root : null });
  vi.stubGlobal('navigator', {});
  return { root: null, element: null, opponentTrees: [] };
});

// Replace browser mounting/portal destinations only. React hooks, the entry,
// controller, presentation hooks, and original screen components remain real.
vi.mock('react-dom/client', () => ({ createRoot: node => {
  probe.root = node;
  return { render: element => { probe.element = element; } };
} }));
vi.mock('react-dom', async original => ({ ...await original(), createPortal: children => children }));
vi.mock('../ui/mobileLandscape.js', async original => ({ ...await original(), mountMobileLandscape: () => null }));
vi.mock('../ui/gameLayers.js', async original => ({ ...await original(), mountGameLayers: () => {} }));
vi.mock('../components/board', async original => {
  const actual = await original();
  return { ...actual, PlayerPanel: function ObservedPlayerPanel(props) {
    // Called during React's render, with its real dispatcher. Return the original
    // tree unchanged; retain its actual card-back callback before SSR drops it.
    const tree = actual.PlayerPanel(props);
    if (props.onCardSelect) probe.opponentTrees.push(tree);
    return tree;
  } };
});

// Let Vitest load/transform the complete shipped import graph as module setup,
// rather than charging cold application compilation to a test's 5-second body.
import '../main.jsx';

function elements(node) {
  if (!node?.props) return [];
  return [node, ...Children.toArray(node.props.children).flatMap(elements)];
}

beforeEach(() => {
  probe.opponentTrees = [];
});

afterAll(() => vi.unstubAllGlobals());

describe('authority entry and original screens with real React rendering', () => {
  it('mounts main through AuthorityApp and the appearance provider into the original lobby', () => {
    expect(probe.root).toEqual({ id: 'root' });
    expect(probe.element.type).toBe(StrictMode);
    expect(probe.element.props.children.type).toBe(UiAppearanceProvider);
    expect(probe.element.props.children.props.children.type).toBe(AuthorityApp);
    const markup = renderToStaticMarkup(probe.element);
    expect(markup).toContain('class="toe-start-screen"');
    expect(markup).toContain('data-start-scale=');
    expect(markup).toContain('alt="邪神的宝藏"');
    expect(markup).toContain('踏入黑暗');
    expect(markup).toContain('联机对战');
    expect(markup).toContain('新手教学');
    expect(markup).not.toContain('authority-table');
  });

  it('renders a stable blind-swap board and forwards its original card-back tap as one semantic intent', async () => {
    const view = { version: 2, matchId: 'entry-blind-swap', revision: 7, viewerSeat: 1,
      phase: 'SWAP_STEAL_CARD', currentSeat: 1, turn: 2, expansionKey: '地神的潜影',
      deckCount: 30, inspectionDeckCount: 6, discard: [], inspectionDiscard: [], events: [], peeks: [],
      players: [{ seat: 0, name: '暗抽目标', hp: 8, san: 9, handCount: 3, roleRevealed: false },
        { seat: 1, name: '本人', role: '欺诈师', hp: 10, san: 10, handCount: 0, hand: [], godZone: [], zoneCards: [] }],
      swapTargetSeat: 0, decision: { id: 'blind-decision', deadline: null, actions: [{ type: 'swap.takeBlind' }] } };
    let finishSubmit;
    const submit = vi.fn(() => new Promise(resolve => { finishSubmit = resolve; }));
    const report = vi.fn();
    const session = { freshStart: false, getSnapshot: () => view, submit, socket: { connected: true } };
    const markup = renderToStaticMarkup(<UiAppearanceProvider>
      <AuthorityBattlePresentation view={view} session={session} offline={false} report={report}
        preferences={{ gamma: 1, musicVolume: .5, sfxVolume: .5 }} />
    </UiAppearanceProvider>);
    expect(markup).toContain('data-hand-composition="coastal"');
    expect(markup).toContain('toe-self-player-panel');
    expect(markup).toContain('data-player-hand-strip="1"');
    expect(markup).not.toContain('toe-blind-draw-title');
    expect(markup).not.toContain('authority-table');
    const controls = probe.opponentTrees.flatMap(elements).filter(node => node.props.role === 'button'
      && node.props['aria-label']?.startsWith('暗抽第 '));
    expect(controls).toHaveLength(3);
    expect(controls[1].props['aria-label']).toBe('暗抽第 2 张牌');
    const event = { stopPropagation: vi.fn() };
    controls[1].props.onClick(event);
    controls[2].props.onClick(event);
    expect(event.stopPropagation).toHaveBeenCalledTimes(2);
    expect(submit).toHaveBeenCalledExactlyOnceWith('swap.takeBlind', {});
    finishSubmit({ ok: true });
    await Promise.resolve();
    expect(report).not.toHaveBeenCalled();
  });
});
