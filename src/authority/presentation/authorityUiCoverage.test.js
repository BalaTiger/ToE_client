import { Children } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migratedActions } from '../../../packages/rules/src/authority/coverage.js';
import AuthorityBattlePresentation from './AuthorityBattlePresentation';
import { AuthorityDecisionLayer } from './AuthorityDecisionLayer';
import { createAuthorityPresentation } from './model.js';
import { createAuthorityCommandDispatcher } from './commands.js';
import { BattleScreen } from '../../components/battle/BattleScreen';
import { HandArea } from '../../components/battle/HandArea';
import { SelfPlayerPanel } from '../../components/battle/SelfPlayerPanel';
import { DDCard } from '../../components/cards';
import { PlayerPanel } from '../../components/board';

// A deterministic hook harness exercises the actual JSX event handlers without
// mounting timers, audio, sockets, animation reducers, or a browser DOM.
const hooks = vi.hoisted(() => ({ state: [], refs: [], cursor: 0, refCursor: 0, effects: [], collectEffects: false }));
vi.hoisted(() => { globalThis.window = { __PUBLIC_BASE__: '/', innerWidth: 1600, innerHeight: 1000 }; });
vi.mock('react', async original => {
  const actual = await original();
  const mocked = {
  useMemo: fn => fn(), useCallback: fn => fn,
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  useEffect: fn => { if (hooks.collectEffects) hooks.effects.push(fn); }, useLayoutEffect: () => {},
  useRef: value => { const i = hooks.refCursor++; return hooks.refs[i] ||= { current: value }; },
  useState: value => {
    const i = hooks.cursor++;
    if (!(i in hooks.state)) hooks.state[i] = typeof value === 'function' ? value() : value;
    return [hooks.state[i], next => { hooks.state[i] = typeof next === 'function' ? next(hooks.state[i]) : next; }];
  },
  };
  return { ...actual, ...mocked, default: { ...actual.default, ...mocked } };
});
vi.mock('../../hooks/useBattleResponsiveLayout', async original => {
  const { buildBattleResponsiveLayout } = await original();
  return { buildBattleResponsiveLayout, useBattleResponsiveLayout: () => buildBattleResponsiveLayout(1600, 1000) };
});
vi.mock('../../ui/UiAppearance', () => ({ useUiAppearance: () => ({ appearance: {} }) }));
vi.mock('react-dom', async original => ({ ...await original(), createPortal: children => children }));
vi.mock('../useAuthorityPresentation', () => ({ useAuthorityPresentation: ({ model }) => ({
  gs: model.gs, displayStats: model.displayStats, visualPlayers: model.players, visualDiscard: model.discard,
  busy: false, visibleLog: [],
}) }));

function reset() { hooks.state = []; hooks.refs = []; hooks.cursor = 0; hooks.refCursor = 0; hooks.effects = []; hooks.collectEffects = false; }
function render(fn) { hooks.cursor = 0; hooks.refCursor = 0; return fn(); }
const expandNames = new Set(['AuthorityDialog', 'Choice', 'CardChoice', 'PublicCardChoice',
  'DrawRevealActions', 'GodChoiceActions', 'RevealChoiceButton', 'StackedCardRow', 'BattleDecisionModals', 'NyaBorrowModal', 'TreasureDodgeModal', 'TortoiseOracleModal']);
function nodes(node, expand = false) {
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, expand));
  if (!node || typeof node !== 'object') return [node];
  if (expand && typeof node.type === 'function' && expandNames.has(node.type.name)) return nodes(node.type(node.props), expand);
  return [node, ...['children', 'opponents', 'hand', 'middle'].flatMap(key => Children.toArray(node.props?.[key]).flatMap(child => nodes(child, expand)))];
}
function label(node) { return nodes(node).filter(item => typeof item === 'string' || typeof item === 'number').join(''); }
function buttons(tree) { return nodes(tree, true).filter(node => node?.type === 'button' && !node.props.disabled && node.props.onClick); }
function button(tree, text) { const found = buttons(tree).find(node => label(node).includes(text)); expect(found, `clickable button ${text}`).toBeTruthy(); return found; }
function cardButtons(tree) { return nodes(tree, true).filter(node => node?.type === DDCard && node.props.onClick && !node.props.disabled); }
const cards = [
  { id: 'visible-a', key: 'A1', name: '公开牌 A', letter: 'A', number: 1, isZone: true },
  { id: 'visible-b', key: 'B2', name: '公开牌 B', letter: 'B', number: 2, isZone: true },
  { id: 'visible-c', key: 'C3', name: '黑山羊幼崽', isBlackGoatYoung: true },
];
function descriptor(type, overrides = {}) {
  const keys = migratedActions[type].payloadKeys;
  return { type,
    ...(keys.includes('targetSeat') ? { targetSeats: [0], allowSkip: type === 'nya.borrow' } : {}),
    ...(keys.includes('cardIndex') || keys.includes('cardIndices') || type === 'stone.arrange' ? { cardIndices: [0, 1, 2] } : {}),
    ...(keys.includes('cardIndices') ? { count: 2 } : {}),
    ...(keys.includes('choice') ? { choices: type === 'god.choose' ? ['discard'] : ['discard', 'damage'], actorSeat: 0 } : {}),
    ...(['slime.answer', 'etherealize.answer'].includes(type) ? { choices: [false, true] } : {}),
    ...(type === 'tortoise.choose' ? { keys: ['A1'] } : {}),
    ...(type === 'hunt.attack' ? { allowAbandon: true } : {}),
    ...(type === 'skill.begin' ? { targetSeats: [0, 2] } : {}), ...overrides };
}
function fixture(type, overrides = {}) {
  const action = descriptor(type);
  const view = { version: 2, matchId: 'ui-coverage', revision: 1, viewerSeat: 1,
    phase: migratedActions[type].phases[0], currentSeat: 1, turn: 2, expansionKey: '群星呼唤',
    deckCount: 30, inspectionDeckCount: 6, discard: [], inspectionDiscard: [], events: [], peeks: [],
    players: [{ seat: 0, name: '公开手牌对手', hp: 8, san: 9, handCount: 3, revealHand: true, hand: cards },
      { seat: 1, name: '本人', role: '寻宝者', hp: 10, san: 10, handCount: 3, hand: cards, godZone: [], zoneCards: [] },
      { seat: 2, name: '未知身份', hp: 8, san: 9, handCount: 2 }],
    draw: { owner: 1, card: cards[0] }, godEncounter: { owner: 1, card: { id: 'god', name: '克苏鲁', godKey: 'CTH', isGod: true } },
    publicReveals: cards, privateReveals: cards, swapTargetSeat: 0, hunt: { targetSeat: 0, revealedCard: cards[0] },
    decision: { id: 'd1', actions: [action], deadline: null }, ...overrides };
  if (type === 'swap.takeBlind') view.players[0] = { seat: 0, name: '暗抽目标', hp: 8, san: 9, handCount: 3 };
  return view;
}
function setup(current) {
  const submit = vi.fn().mockResolvedValue({ ok: true });
  const report = vi.fn();
  const session = { getSnapshot: () => current, submit, socket: { connected: true } };
  const root = () => render(() => AuthorityBattlePresentation({ view: current, session, offline: false, report, preferences: {} }));
  const board = () => nodes(root()).find(node => node?.type === BattleScreen).props;
  // HandArea is the exact shipped hand/buttons component receiving adapter props.
  const hand = () => { const props = board(); return HandArea(props); };
  const model = { ...createAuthorityPresentation(current), view: current };
  const dispatcher = createAuthorityCommandDispatcher({ getView: () => current, submit });
  const layer = () => render(() => AuthorityDecisionLayer({ model, send: dispatcher.submit, busy: false }));
  const embeddedLayer = () => { const element = board().decisionLayer; return element.type(element.props); };
  const publicPanel = () => nodes(BattleScreen(board())).find(node => node?.type === PlayerPanel && node.props.onCardSelect);
  const publicCards = () => {
    const panel = publicPanel(); expect(panel, 'original opponent hand panel').toBeTruthy();
    return nodes(PlayerPanel(panel.props)).filter(node => node?.props?.onClick &&
      (node.type === DDCard || node.props.role === 'button'));
  };
  return { current, submit, report, root, board, hand, model, layer, embeddedLayer, publicPanel, publicCards };
}
const ownCards = new Set(['god.useHand', 'swap.give', 'hunt.reveal', 'hunt.attack', 'bewitch.chooseCard', 'caveDuel.commit', 'albino.reveal']);
const ownConfirm = { 'turn.discard': '确认弃牌', 'bury.commit': '确认活埋', 'torch.discard': '确认引燃' };
const handButtons = { 'skill.begin': '身份技能', 'skill.cancel': '取消', 'turn.rest': '休息', 'turn.end': '结束回合', 'multiply.begin': '繁衍' };
const modalCards = new Set(['publicPick.choose', 'grave.choose']);

beforeEach(reset);
describe('all canonical authority actions have real original-UI intent exits', () => {
  it.each(Object.keys(migratedActions))('%s is clickable and submits only its exact advertised payload', async type => {
    const s = setup(fixture(type));
    let expected;
    if (handButtons[type]) {
      const control = type === 'skill.begin' ? buttons(s.hand()).find(node => node.props.className.includes('toe-turn-skill')) : button(s.hand(), handButtons[type]);
      expect(control).toBeTruthy(); await control.props.onClick(); expected = {};
    } else if (ownCards.has(type)) {
      const controls = cardButtons(s.hand()); expect(controls).toHaveLength(3);
      await controls[1].props.onClick(); expected = { cardIndex: 1 };
    } else if (ownConfirm[type]) {
      expect(buttons(s.hand()).some(node => label(node).includes(ownConfirm[type]))).toBe(false);
      cardButtons(s.hand())[0].props.onClick();
      if (type === 'turn.discard') cardButtons(s.hand())[1].props.onClick();
      await button(s.hand(), ownConfirm[type]).props.onClick();
      expected = type === 'turn.discard' ? { cardIndices: [0, 1] } : { cardIndex: 0 };
    } else if (migratedActions[type].payloadKeys.includes('targetSeat') && type !== 'nya.borrow') {
      const boardTree = BattleScreen(s.board());
      const targets = nodes(boardTree).filter(node => node?.type === PlayerPanel && node.props.isSelectable);
      expect(targets).toHaveLength(1); expect(targets[0].props.playerIndex).toBe(2);
      await PlayerPanel(targets[0].props).props.onClick(); expected = { targetSeat: 0 };
    } else if (modalCards.has(type)) {
      const controls = cardButtons(s.layer()); expect(controls).toHaveLength(3);
      await controls[1].props.onClick(); expected = { cardIndex: 1 };
    } else if (type === 'swap.takeVisible' || type === 'swap.takeBlind') {
      expect(s.embeddedLayer()).toBeNull();
      expect(s.publicPanel().props.playerIndex).toBe(2);
      const controls = s.publicCards(); expect(controls).toHaveLength(3);
      await controls[1].props.onClick({ stopPropagation: vi.fn() });
      expected = type === 'swap.takeBlind' ? {} : { cardIndex: 1 };
    } else if (type === 'hunt.loot') {
      expect(s.embeddedLayer()).toBeNull();
      expect(buttons(s.hand()).some(node => label(node).includes('确认战利品'))).toBe(false);
      s.publicCards()[0].props.onClick(); s.publicCards()[1].props.onClick();
      await button(s.hand(), '确认战利品').props.onClick(); expected = { cardIndices: [0, 1] };
      expect(s.board().authorityControls.publicCardsManaged).toBe(true);
    } else if (type === 'stone.arrange') {
      const overlay = s.layer(); expect(overlay.type.name).toBe('DecipherStoneCarvingOverlay');
      await overlay.props.onConfirm({ handCard: cards[1], deckTopCards: [cards[2]], deckBottomCards: [cards[0]] });
      expected = { handIndex: 1, topIndices: [2], bottomIndices: [0] };
    } else if (type === 'nya.borrow') {
      const modal = s.layer(); expect(modal.type.name).toBe('NyaBorrowModal');
      expect(modal.props.deadPlayers[0].seat).toBe(0);
      const controls = buttons(modal); expect(controls.length).toBeGreaterThan(0);
      await controls[0].props.onClick(); expected = { targetSeat: 0 };
    } else if (type === 'tortoise.choose') {
      const controls = buttons(s.layer()); expect(controls.length).toBeGreaterThan(0);
      await controls[0].props.onClick(); expected = { key: 'A1' };
    } else {
      const controls = buttons(s.layer()); expect(controls.length).toBeGreaterThan(0);
      await controls[0].props.onClick();
      const key = migratedActions[type].payloadKeys[0];
      expected = key === 'choice' ? { choice: 'discard' } : key ? { [key]: ['slime.answer', 'etherealize.answer', 'sphinx.guess', 'treasureDodge.reply', 'sphinx.dodge'].includes(type) } : {};
    }
    expect(s.report).not.toHaveBeenCalled();
    expect(s.submit).toHaveBeenCalledExactlyOnceWith(type, expected);
  });

  it('does not mistake the skill.begin target preview for a target-selection command', () => {
    const s = setup(fixture('skill.begin'));
    expect(s.board().selectingOther).toBe(false);
    expect(s.board().isTargetSelectable(2)).toBe(false);
  });

  it.each(['caveDuel.commit', 'hunt.reveal', 'bury.commit'])('off-turn %s still uses the responding hand', async type => {
    const s = setup(fixture(type, { currentSeat: 0 }));
    await cardButtons(s.hand())[1].props.onClick();
    if (type === 'bury.commit') await button(s.hand(), '确认活埋').props.onClick();
    expect(s.submit).toHaveBeenCalledExactlyOnceWith(type, { cardIndex: 1 });
  });

  it('sealed submissions expose no second choice or local cancel while waiting', () => {
    const current = fixture('caveDuel.commit', { duel: { sourceSeat: 0, targetSeat: 1, lockedCardIndex: 1 }, decision: { id: 'locked', actions: [] } });
    const s = setup(current);
    expect(cardButtons(s.hand())).toHaveLength(0);
    expect(buttons(s.hand())).toHaveLength(0);
    expect(s.board().cardHintText).toContain('已锁定');
  });

  it('hunt abandonment sends the explicit nullable card index', async () => {
    const s = setup(fixture('hunt.attack'));
    await button(s.hand(), '放弃追捕').props.onClick();
    expect(s.submit).toHaveBeenCalledExactlyOnceWith('hunt.attack', { cardIndex: null });
  });

  it('forced conversion at max level offers the legal discard', async () => {
    const current = fixture('god.choose');
    Object.assign(current.players[1], { godName: 'CTH', godLevel: 3 });
    current.godEncounter.forcedConvert = true;
    const s = setup(current);
    expect(buttons(s.layer())).toHaveLength(1);
    await buttons(s.layer())[0].props.onClick();
    expect(s.submit).toHaveBeenCalledExactlyOnceWith('god.choose', { choice: 'discard' });
  });

  it('a borrowed cultist skill exposes keepHand despite the original private role', async () => {
    const current = fixture('god.choose');
    current.players[1]._nyaBorrow = '邪祀者';
    current.decision.actions = [descriptor('god.choose', { choices: ['keepHand'] })];
    const s = setup(current);
    await button(s.layer(), '收入手牌').props.onClick();
    expect(s.submit).toHaveBeenCalledExactlyOnceWith('god.choose', { choice: 'keepHand' });
  });

  it('hidden role and hand stay unknown in the old board contract', () => {
    const s = setup(fixture('turn.end'));
    const hidden = s.board().visualPlayers[1];
    expect(hidden.role).toBeUndefined();
    expect(hidden.roleInfo.name).toBe('身份未揭晓');
    expect(hidden.hand).toHaveLength(2);
    expect(hidden.hand.every(card => card._back && !card.name)).toBe(true);
    expect(() => BattleScreen(s.board())).not.toThrow();
  });

  it.each(['slime.answer', 'etherealize.answer'])('%s honors a canonical false-only decision', async type => {
    const current = fixture(type);
    // These are real descriptor outputs when the resource has already gone.
    const ruleState = { players: [{}, { hand: [], etherealizeStacks: 0 }], abilityData: { targetIdx: 1, adjacentTargets: [] } };
    current.decision.actions = [{ type, ...migratedActions[type].describe(ruleState, 1) }];
    expect(current.decision.actions[0].choices).toEqual([false]);
    const s = setup(current);
    const controls = buttons(s.layer()); expect(controls).toHaveLength(1);
    await controls[0].props.onClick();
    expect(s.submit).toHaveBeenCalledExactlyOnceWith(type, { use: false });
  });

  it('blind draw remains reachable when every opponent card is a public derivative token', async () => {
    const current = fixture('swap.takeBlind');
    current.players[0] = { seat: 0, name: '公开衍生物目标', hp: 8, san: 9, handCount: 1,
      publicTokens: [cards[2]] };
    const s = setup(current);
    expect(s.publicCards()).toHaveLength(1);
    await s.publicCards()[0].props.onClick();
    expect(s.submit).toHaveBeenCalledExactlyOnceWith('swap.takeBlind', {});
  });

  it('deselects a public loot card and cannot confirm an incomplete or excessive selection', async () => {
    const s = setup(fixture('hunt.loot'));
    s.publicCards()[0].props.onClick(); s.publicCards()[1].props.onClick();
    s.publicCards()[2].props.onClick();
    expect(s.publicPanel().props.selectedCardIndices).toEqual([0, 1]);
    s.publicCards()[0].props.onClick();
    expect(buttons(s.hand()).some(node => label(node).includes('确认战利品'))).toBe(false);
    s.publicCards()[2].props.onClick();
    await button(s.hand(), '确认战利品').props.onClick();
    expect(s.submit).toHaveBeenCalledExactlyOnceWith('hunt.loot', { cardIndices: [1, 2] });
  });

  it('the original self panel maps display zero back to the actual recipient seat', async () => {
    const current = fixture('shu.selectTarget');
    current.decision.actions[0].targetSeats = [1];
    const s = setup(current);
    expect(s.board().isTargetSelectable(0)).toBe(true);
    const panel = nodes(BattleScreen(s.board())).find(node => node?.type === SelfPlayerPanel);
    const target = nodes(SelfPlayerPanel(panel.props)).find(node => node?.props?.['data-target-selectable']);
    expect(target?.props.onClick).toBeTypeOf('function');
    await target.props.onClick();
    expect(s.submit).toHaveBeenCalledExactlyOnceWith('shu.selectTarget', { targetSeat: 1 });
  });

  it('NYA can skip when no deceased target exists', async () => {
    const current = fixture('nya.borrow');
    current.decision.actions[0].targetSeats = [];
    const s = setup(current);
    const controls = buttons(s.layer()); expect(controls).toHaveLength(1);
    await controls[0].props.onClick();
    expect(s.submit).toHaveBeenCalledExactlyOnceWith('nya.borrow', { targetSeat: null });
  });

  it('unadvertised hand indices are inert, including nonmatching hunt cards', async () => {
    const current = fixture('hunt.attack');
    current.decision.actions[0].cardIndices = [1];
    const s = setup(current);
    const controls = cardButtons(s.hand()); expect(controls).toHaveLength(1);
    expect(controls[0].props.card.id).toBe(cards[1].id);
    s.board().handleMyCardClick(0);
    expect(s.submit).not.toHaveBeenCalled();
    await controls[0].props.onClick();
    expect(s.submit).toHaveBeenCalledExactlyOnceWith('hunt.attack', { cardIndex: 1 });
  });

  it('stone drag zones and the real confirmation button preserve the complete private arrangement', async () => {
    const s = setup(fixture('stone.arrange'));
    const element = s.layer();
    reset(); hooks.collectEffects = true;
    const listeners = new Map();
    let dropZone = 'hand';
    vi.stubGlobal('window', { ...window, addEventListener: (event, callback) => listeners.set(event, callback), removeEventListener: event => listeners.delete(event) });
    vi.stubGlobal('document', { elementFromPoint: () => ({ closest: () => ({ dataset: { zone: dropZone }, querySelectorAll: () => [] }) }) });
    const overlay = () => {
      hooks.effects = [];
      const tree = render(() => element.type(element.props));
      hooks.effects.forEach(effect => effect());
      return tree;
    };
    try {
      expect(buttons(overlay())).toHaveLength(0);
      for (const [cardId, destination] of [[cards[1].id, 'hand'], [cards[0].id, 'bottom']]) {
        const draggable = nodes(overlay(), true).find(node => node?.props?.['data-card-id'] === cardId);
        expect(draggable?.props.onMouseDown).toBeTypeOf('function');
        draggable.props.onMouseDown({ clientX: 20, clientY: 20, preventDefault: vi.fn() });
        overlay(); dropZone = destination;
        listeners.get('mouseup')({ clientX: 30, clientY: 30 });
      }
      await button(overlay(), '确认').props.onClick();
      expect(s.submit).toHaveBeenCalledExactlyOnceWith('stone.arrange', { handIndex: 1, topIndices: [2], bottomIndices: [0] });
    } finally { vi.unstubAllGlobals(); }
  });
});
