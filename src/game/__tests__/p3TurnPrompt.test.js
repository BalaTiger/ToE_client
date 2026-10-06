import { Children, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPhaseUiState } from '../phaseUi';
import { BattleScreen } from '../../components/battle/BattleScreen';
import { CoastalBattleLayout } from '../../components/battle/CoastalBattleLayout';
import { BattlePhaseBar } from '../../components/phase/BattlePhaseBar';

vi.mock('react', async importOriginal => ({
  ...await importOriginal(),
  useLayoutEffect: vi.fn(),
}));
vi.mock('react-dom', async importOriginal => ({
  ...await importOriginal(),
  createPortal: children => children,
}));
vi.mock('../../ui/UiAppearance', () => ({
  useUiAppearance: () => ({ appearance: { id: 'coastal', battleLayout: 'coastal' } }),
}));

function makeGs(isMultiplayer = false) {
  return {
    _isMP: isMultiplayer,
    currentTurn: 2,
    phase: 'AI_TURN',
    abilityData: {},
    players: [
      { name: '你', hand: [] },
      { name: '艾伦', hand: [] },
      { name: '卡洛斯', hand: [] },
      { name: '黛安娜', hand: [] },
    ],
  };
}

describe('TOE007 turn prompt presentation ownership', () => {
  it.each([
    [false, '黛安娜 正在行动…'],
    [true, '等候 黛安娜 行动…'],
  ])('uses the same visual actor as the next banner while rule state still owns the prior turn (multiplayer=%s)', (isMultiplayer, expected) => {
    const gs = makeGs(isMultiplayer);
    const ui = buildPhaseUiState({
      gs, phase: 'AI_TURN', currentTurnPlayer: gs.players[2],
      visualTurnPlayer: gs.players[3],
      anim: { type: 'YOUR_TURN', playerIdx: 3, name: '黛安娜' },
      animQueueLength: 2, hasPendingGs: true,
    });
    expect(ui.displayPhaseLabel).toBe(expected);
    expect(ui.phaseLabel).toBe(expected);
    expect(ui.canShowTurnDecisionModal).toBe(false);
    expect(ui.canShowEndTurnButton).toBe(false);
    expect(ui.showCancelBtn).toBe(false);
  });

  it('keeps the visual actor through animation exit and a queued continuation', () => {
    const gs = makeGs();
    const ui = buildPhaseUiState({
      gs, phase: 'AI_TURN', visualTurnPlayer: gs.players[3],
      anim: null, animExiting: true, animQueueLength: 1, hasPendingGs: true,
    });
    expect(ui.displayPhaseLabel).toBe('黛安娜 正在行动…');
    expect(ui.canShowTurnDecisionModal).toBe(false);
  });

  it.each([
    [false, '艾伦 正在行动…'],
    [true, '等候 艾伦 行动…'],
  ])('replaces the stale local ACTION instructions during the next actor banner (multiplayer=%s)', (isMultiplayer, expected) => {
    const gs = { ...makeGs(isMultiplayer), currentTurn: 0, phase: 'ACTION' };
    const ui = buildPhaseUiState({
      gs, phase: 'ACTION', currentTurnPlayer: gs.players[0],
      visualTurnPlayer: gs.players[1], localCurrentTurn: true,
      anim: { type: 'YOUR_TURN', playerIdx: 1, name: '艾伦' },
      animQueueLength: 1, hasPendingGs: true,
    });
    expect(ui.displayPhaseLabel).toBe(expected);
    expect(ui.canShowEndTurnButton).toBe(false);
    expect(ui.canShowTurnDecisionModal).toBe(false);
  });

  it('keeps the visual ACTION actor through exit and queue-only playback', () => {
    const gs = { ...makeGs(), currentTurn: 0, phase: 'ACTION' };
    for (const playback of [
      { animExiting: true },
      { animQueueLength: 1 },
    ]) {
      const ui = buildPhaseUiState({
        gs, phase: 'ACTION', visualTurnPlayer: gs.players[1],
        localCurrentTurn: true, ...playback,
      });
      expect(ui.displayPhaseLabel).toBe('艾伦 正在行动…');
      expect(ui.canShowEndTurnButton).toBe(false);
    }
  });

  it('does not invite a local action before that visual turn finishes entering', () => {
    const gs = makeGs();
    const ui = buildPhaseUiState({
      gs, phase: 'ACTION', visualTurnPlayer: gs.players[0],
      localCurrentTurn: false, anim: { type: 'YOUR_TURN', playerIdx: 0 },
    });
    expect(ui.displayPhaseLabel).toBe('你 正在行动…');
    expect(ui.canShowEndTurnButton).toBe(false);
  });

  it('preserves the ready local ACTION instructions when presentation is idle', () => {
    const gs = { ...makeGs(), currentTurn: 0, phase: 'ACTION' };
    const ui = buildPhaseUiState({
      gs, phase: 'ACTION', visualTurnPlayer: gs.players[0],
      localCurrentTurn: true, isVisualPlayerTurn: true,
    });
    expect(ui.displayPhaseLabel).toBe('你的回合 — 可发动技能、休息，或结束回合');
    expect(ui.canShowEndTurnButton).toBe(true);
  });

  it('falls back to the existing current-turn name for callers without a visual actor', () => {
    const gs = makeGs();
    expect(buildPhaseUiState({ gs, phase: 'AI_TURN' }).displayPhaseLabel).toBe('卡洛斯 正在行动…');
    expect(buildPhaseUiState({ gs: { ...gs, _isMP: true }, phase: 'AI_TURN' }).displayPhaseLabel).toBe('等候 卡洛斯 行动…');
  });

  it('preserves the explicit decision owner instead of substituting the visual turn actor', () => {
    const gs = makeGs();
    const ui = buildPhaseUiState({
      gs, phase: 'BEWITCH_SELECT_TARGET', visualTurnPlayer: gs.players[3],
      decisionContext: { localCanAct: false, ownerSeats: [1] },
    });
    expect(ui.displayPhaseLabel).toBe('艾伦 正在思考…');
    expect(ui.showCancelBtn).toBe(false);
  });

  it('preserves the pending discard continuation actor and the spectator override', () => {
    const gs = makeGs();
    const pending = { ...gs, currentTurn: 1, phase: 'AI_TURN' };
    expect(buildPhaseUiState({
      gs, phase: 'DISCARD_PHASE', visualTurnPlayer: gs.players[3],
      isDiscardPhaseResolving: true, pendingAfterDiscardGs: pending,
    }).displayPhaseLabel).toBe('艾伦 正在行动…');
    expect(buildPhaseUiState({
      gs, phase: 'AI_TURN', visualTurnPlayer: gs.players[3], isSpectating: true,
    }).displayPhaseLabel).toBe('观战中……');
  });
});

function descendants(node) {
  if (!node?.props) return [];
  return [node, ...Children.toArray(node.props.children).flatMap(descendants)];
}

function renderVisiblePrompt({ role = '追猎者', isMultiplayer = false, idle = false, isSpectating = false, decision = false } = {}) {
  const players = [
    { id: 'local', name: '你', role, hand: [], hp: 10, san: 9, isResting: !idle },
    { id: 'next', name: '艾伦', hand: [], hp: 10, san: 10 },
  ];
  const gs = {
    _isMP: isMultiplayer, currentTurn: 0, phase: decision ? 'BEWITCH_SELECT_TARGET' : 'ACTION',
    turn: 1, players, deck: [], inspectionDeck: [], abilityData: {}, expansionKey: '群星呼唤',
  };
  const playback = idle ? {} : { anim: { type: 'YOUR_TURN', playerIdx: 1, name: '艾伦' }, animQueueLength: 1, hasPendingGs: true };
  const ui = buildPhaseUiState({
    gs, phase: gs.phase, me: players[0], currentTurnPlayer: players[0],
    visualTurnPlayer: players[idle ? 0 : 1], localCurrentTurn: true,
    isVisualPlayerTurn: idle && !isSpectating, isSpectating,
    ...(decision ? { decisionContext: { localCanAct: false, ownerSeats: [1] } } : {}),
    ...playback,
  });
  const tree = BattleScreen({
    vw: 1600, vh: 1000, gs, me: players[0], visualMe: players[0], visualPlayers: players,
    visualCurrentTurn: idle ? 0 : 1, visualDiscard: [], phase: gs.phase,
    myTurn: true, isVisualPlayerTurn: idle && !isSpectating, isMultiplayer, isSpectating,
    baseFontSizes: { body: 12 }, interactionFontSizes: { body: 12 },
    mobileCssPx: value => value, boardCssPx: value => value,
    hitIndices: [], sanHitIndices: [], hpHealIndices: [], sanHealIndices: [],
    guillotinedPids: new Set(), godHighlightPanelBursts: {},
    ...playback, ...ui,
  });
  const board = descendants(tree).find(node => node.type === CoastalBattleLayout);
  const prompt = descendants(board.props.prompt).find(node => node.type === BattlePhaseBar);
  // This is the actual prompt node embedded beside the hand, after BattleScreen's override.
  expect(prompt).toBeDefined();
  const html = renderToStaticMarkup(createElement(BattlePhaseBar, prompt.props));
  return { html, ui, prompt, board };
}

describe('TOE007 visible bottom prompt through BattleScreen', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { __PUBLIC_BASE__: '/' });
    vi.stubGlobal('document', { body: {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [false, '追猎者', '艾伦 正在行动…'],
    [false, '寻宝者', '艾伦 正在行动…'],
    [false, '邪祀者', '艾伦 正在行动…'],
    [true, '追猎者', '等候 艾伦 行动…'],
  ])('renders the visual actor while old local ACTION is blocked (multiplayer=%s, role=%s)', (isMultiplayer, role, expected) => {
    const { html, ui, prompt, board } = renderVisiblePrompt({ isMultiplayer, role });
    expect(ui.canShowEndTurnButton).toBe(false);
    expect(board.props.turnLabel).toBe('艾伦的回合');
    expect(prompt.props.displayPhaseLabel).toBe(expected);
    expect(html).toContain(expected);
    expect(html).not.toContain('你的回合 · 请选择行动');
  });

  it('retains the compact idle local action prompt when controls are actually ready', () => {
    const { html, ui } = renderVisiblePrompt({ idle: true });
    expect(ui.canShowEndTurnButton).toBe(true);
    expect(html).toContain('你的回合 · 请选择行动');
  });

  it('preserves the spectator notice even if the authoritative actor is the local seat', () => {
    const { html, ui } = renderVisiblePrompt({ isSpectating: true });
    expect(ui.canShowEndTurnButton).toBe(false);
    expect(html).toContain('观战中……');
    expect(html).not.toContain('你的回合 · 请选择行动');
  });

  it('retains the explicit decision owner in the rendered phase bar', () => {
    const { html } = renderVisiblePrompt({ decision: true });
    expect(html).toContain('艾伦 正在思考…');
    expect(html).not.toContain('你的回合 · 请选择行动');
  });
});
