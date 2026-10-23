import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuthorityBattlePresentation from './AuthorityBattlePresentation';
import { AuthorityDecisionLayer } from './AuthorityDecisionLayer';
import { RoleSelectionDialog } from '../../components/battle/RoleSelectionDialog';
import { createAuthorityPresentation } from './model';

vi.hoisted(() => { globalThis.window = { __PUBLIC_BASE__: '/' }; });
const playback = vi.hoisted(() => ({ busy: false }));
vi.mock('react-dom', async original => ({ ...await original(), createPortal: children => children }));
vi.mock('../../components/battle/BattleScreen', async original => {
  const { BattleScreen } = await original();
  return { BattleScreen: props => { playback.battleProps = props; return <BattleScreen {...props} />; } };
});
vi.mock('../../components/anim/AnimOverlay', () => ({ AnimOverlay: props => { playback.animProps = props; return null; } }));
vi.mock('../../components/anim/WinAnims', async original => ({ ...await original(),
  GodResurrectionAnim: () => <div data-terminal-god />,
  TreasureMapAnim: props => { playback.mapProps = props; return <div data-terminal-map={props.sourcePlayerIndex}>{props.hand.map(card => card.name).join(',')}</div>; },
}));
// The shipped badge measures the board in an effect; inspect its public input in SSR.
vi.mock('../../components/anim/MoveOverlays', async original => ({ ...await original(),
  HuntRevealedCardBadge: ({ card, targetPid }) => <div data-hunt-reveal-badge={targetPid}>{card.name}</div>,
}));
vi.mock('../useAuthorityPresentation', () => ({ useAuthorityPresentation: ({ model, openingBlocked, freshStart }) => {
  playback.openingBlocked = openingBlocked; playback.freshStart = freshStart; return {
  gs: model.gs, displayStats: model.displayStats, visualPlayers: playback.visualPlayers || model.players,
  visualDiscard: model.discard, busy: playback.busy, visibleLog: [], ...playback.override,
}; } }));

function view(overrides = {}) {
  return { version: 2, matchId: 'render-test', revision: 1, viewerSeat: 1, phase: 'ACTION', currentSeat: 1, turn: 2,
    expansionKey: '群星呼唤', deckCount: 30, inspectionDeckCount: 6, discard: [], inspectionDiscard: [], events: [], peeks: [],
    players: [{ seat: 0, name: '隐藏对手', hp: 8, san: 9, handCount: 3, roleRevealed: false },
      { seat: 1, name: '本人', role: '寻宝者', hp: 10, san: 10, handCount: 0, hand: [], godZone: [], zoneCards: [] }],
    decision: { id: 'd1', deadline: null, actions: [{ type: 'skill.begin' }, { type: 'turn.end' }, { type: 'turn.rest' }] }, ...overrides };
}
function render(current, freshStart = false, audio) {
  const session = { freshStart, getSnapshot: () => current, submit: vi.fn(), socket: { connected: true } };
  return renderToStaticMarkup(<AuthorityBattlePresentation view={current} session={session} offline={false}
    preferences={{ gamma: 1, musicVolume: .5, sfxVolume: .5 }} audio={audio} onExit={vi.fn()} onReturn={vi.fn()} report={vi.fn()} />);
}
beforeEach(() => {
  playback.busy = false;
  playback.visualPlayers = null;
  playback.override = {};
  vi.stubGlobal('window', { innerWidth: 1600, innerHeight: 1000, location: { search: '' } });
  vi.stubGlobal('document', { body: {}, getElementById: () => null });
});
afterEach(() => vi.unstubAllGlobals());

describe('authority on original coastal presentation', () => {
  it('keeps transient ability grants current while queued visual snapshots remain behind', () => {
    const current = view(); playback.override = { gs: { ...createAuthorityPresentation(current).gs,
      abilityData: { revCard: { id: 'expired', name: '已经失效的窥视' } } }, blackGoatPulsePid: 1 };
    const sound = vi.fn(); render(current, false, { playEndlessCorridorTunnelSound: sound });
    expect(playback.battleProps.gs.abilityData.revCard).toBeUndefined();
    expect(playback.battleProps.blackGoatPulsePid).toBe(1);
    expect(playback.animProps.playEndlessCorridorTunnelSound).toBe(sound);
  });
  it.each([
    [{ type: 'DRAW_BACKGROUND_CAMERA_PRE' }, true], [{ type: 'DRAW_CARD', card: {} }, true],
    [{ type: 'DRAW_CARD', card: { effect: 'event' } }, false],
    [{ type: 'DRAW_CARD', disableDrawBackgroundCamera: true }, false], [{ type: 'ROLL' }, false],
  ])('preserves the original draw camera predicate for %j', (anim, expected) => {
    playback.override = { anim }; render(view());
    expect(playback.battleProps.drawBackgroundCameraActive).toBe(expected);
  });
  it('renders the first winner using public map DTO and settles restored terminal baselines immediately', () => {
    const current = view({ gameOver: { winner: '寻宝者', winnerIdx: 0, winnerIdx2: 1 }, decision: { actions: [] },
      treasureWinners: [{ seat: 0, cards: [{ id: 'public-map', name: '公开藏宝牌' }] }, { seat: 1, cards: [{ id: 'second', name: '第二位藏宝牌' }] }] });
    const markup = render(current, true);
    expect(markup).toContain('data-terminal-map="1">公开藏宝牌');
    expect(markup).not.toContain('第二位藏宝牌');
    expect(playback.mapProps.autoConfirmMs).toBe(3000);
    expect(render(current)).not.toContain('data-terminal-map');
  });
  it('renders the original resurrection scene for fresh all-player loss caused by god awakening', () => {
    expect(render(view({ gameOver: { winner: 'LOSE_ALL', reason: '邪神苏醒' }, decision: { actions: [] } }), true)).toContain('data-terminal-god');
  });
  it('does not dim the local final-dead player before its visual death cue commits', () => {
    const current = view(); current.players[1] = { ...current.players[1], hp: 0, isDead: true };
    playback.visualPlayers = createAuthorityPresentation(current).players.map((player, index) => index === 0 ? { ...player, hp: 10, isDead: false } : player);
    expect(render(current).includes('filter:grayscale(0.85) brightness(0.6)')).toBe(false);
    playback.visualPlayers[0].isDead = true;
    expect(render(current)).toContain('filter:grayscale(0.85) brightness(0.6)');
  });
  it('plays the original identity reveal only for a marked fresh player session and gates its opening queue', () => {
    expect(render(view({ serverNow: 0, presentation: { batchId: 'opening', notBefore: 10000 } }), true)).toContain('探索开始');
    expect(playback.openingBlocked).toBe(true); expect(playback.freshStart).toBe(true);
    expect(render(view())).not.toContain('toe-role-reveal');
    expect(playback.openingBlocked).toBe(false);
    expect(render(view({ viewerSeat: null }), true)).not.toContain('toe-role-reveal');
  });
  it('retains the original board and tutorial narration after the real hunter terminal state', () => {
    const markup = render(view({ gameOver: { winner: '追猎者', winnerIdx: 1 },
      tutorial: { chapter: 'hunter', step: 'hunterResult', resumed: false }, decision: { id: 'end', actions: [] } }));
    expect(markup).toContain('toe-self-player-panel');
    expect(markup).toContain('data-tutorial-step="hunterResult"');
    expect(markup).toContain('下一步');
    expect(markup).not.toContain('再来一局');
  });
  it('passes the original reveal and dodge button refs to their mounted decision views', () => {
    const refs = { drawRevealKeepButtonRef: { current: null }, godKeepHandButtonRef: { current: null }, dodgeRollButtonRef: { current: null } };
    const node = current => AuthorityDecisionLayer({ model: { ...createAuthorityPresentation(current), view: current }, send: vi.fn(), busy: false, tutorialRefs: refs });
    const card = { id: 'public', name: '封入石棺', key: 'B3', letter: 'B', number: 3 };
    expect(node(view({ phase: 'DRAW_REVEAL', draw: { owner: 1, card }, decision: { actions: [{ type: 'draw.keep' }] } })).props.children.props.keepButtonRef).toBe(refs.drawRevealKeepButtonRef);
    expect(node(view({ phase: 'GOD_CHOICE', godEncounter: { owner: 1, card: { ...card, godKey: 'ZHU' } }, decision: { actions: [{ type: 'god.choose', choices: ['keepHand'] }] } })).props.children.props.keepButtonRef).toBe(refs.godKeepHandButtonRef);
    expect(node(view({ phase: 'TREASURE_DODGE_DECISION', draw: { owner: 1, card }, decision: { actions: [{ type: 'treasureDodge.reply', choices: [true] }] } })).props.rollButtonRef).toBe(refs.dodgeRollButtonRef);
  });
  it('renders the shipped board, player panels, hand strip and legal action controls', () => {
    const markup = render(view());
    expect(markup).toContain('data-hand-composition="coastal"');
    expect(markup).toContain('toe-self-player-panel');
    expect(markup).toContain('data-board-zoom');
    expect(markup).toContain('结束回合');
    expect(markup).toContain('隐藏对手');
    expect(markup).not.toContain('authority-table');
    expect(markup).toContain('--toe-battle-bg-size:cover, cover');
    expect(markup).toContain('--toe-battle-bg-repeat:no-repeat, no-repeat');
    expect(markup).toContain('background-size:cover, cover');
    expect(markup).toContain('background-repeat:no-repeat, no-repeat');
    expect(markup).toContain('--toe-battle-bg-image:');
  });
  it('offers blind swap inside the opponent hand without a replacement dialog', () => {
    const current = view({ phase: 'SWAP_STEAL_CARD', swapTargetSeat: 0,
      decision: { id: 'blind', actions: [{ type: 'swap.takeBlind' }] } });
    const markup = render(current);
    expect(markup).toContain('data-player-hand-strip="1"');
    expect(markup).toContain('role="button" tabindex="0" aria-label="暗抽第 1 张牌"');
    expect(markup).not.toContain('toe-blind-draw-title');
    expect(markup).not.toContain('toe-dialog--decision');
  });
  it.each([0, 37])('shows the current public hunt card at baseline revision %s without replay events', revision => {
    const current = view({ revision, phase: 'HUNT_CONFIRM', hunt: { targetSeat: 0,
      revealedCard: { id: 'public-a1', name: '霉变食物', key: 'A1', letter: 'A', number: 1 } },
    decision: { id: 'hunt-confirm', actions: [{ type: 'hunt.attack', cardIndices: [], allowAbandon: true }] } });
    const markup = render(current);
    expect(markup).toContain('data-hunt-reveal-badge="1">霉变食物');
    expect(current.events).toEqual([]);
    expect(current.players[0].hand).toBeUndefined();
  });
  it('shows only an authoritative current reveal and leaves a live reveal animation in control', () => {
    const current = view({ phase: 'HUNT_CONFIRM', hunt: { targetSeat: 0 }, decision: { id: 'waiting', actions: [] } });
    expect(render(current)).not.toContain('data-hunt-reveal-badge');
    current.hunt.revealedCard = { id: 'public-a1', name: '霉变食物', key: 'A1' };
    playback.busy = true;
    expect(render(current)).not.toContain('data-hunt-reveal-badge');
    playback.busy = false;
    expect(render({ ...current, phase: 'ACTION' })).not.toContain('data-hunt-reveal-badge');
    expect(render({ ...current, viewerSeat: 0 })).not.toContain('data-hunt-reveal-badge');
    expect(render({ ...current, viewerSeat: null })).toContain('data-hunt-reveal-badge="0">霉变食物');
  });
  it.each([0, 37])('restores only openly revealed swap hand faces at baseline revision %s', revision => {
    const current = view({ revision, phase: 'SWAP_SELECT_TARGET_CARD', swapTargetSeat: 0,
      decision: { id: 'visible-swap', actions: [{ type: 'swap.takeVisible', cardIndices: [0] }] } });
    current.players[0] = { ...current.players[0], revealHand: true, handCount: 1,
      hand: [{ id: 'public-a1', name: '霉变食物', key: 'A1', letter: 'A', number: 1 }] };
    const markup = render(current);
    expect(markup).toContain('data-player-hand-strip="1"');
    expect(markup).toContain('霉变食物');
    expect(markup).toContain('role="button"');
    expect(current.events).toEqual([]);
    current.players[0].revealHand = false;
    current.decision = { id: 'private-swap', actions: [{ type: 'swap.takeBlind' }] };
    const hiddenMarkup = render(current);
    expect(hiddenMarkup).not.toContain('霉变食物');
    expect(hiddenMarkup).toContain('aria-label="暗抽第 1 张牌"');
  });
  it('renders an observer without requiring a private identity or fabricating hidden hands', () => {
    const current = view({ viewerSeat: null, decision: { id: 'observer', deadline: null, actions: [] } });
    current.players[1] = { seat: 1, name: '另一个隐藏对手', hp: 10, san: 10, handCount: 2, roleRevealed: false };
    const markup = render(current);
    expect(markup).toContain('旁观');
    expect(markup).not.toContain('data-main-actions="true"');
    expect(markup).not.toContain('秘密牌面');
  });
  it('keeps the original draw-card decision actions rather than the compact authority table', () => {
    const current = view({ phase: 'DRAW_REVEAL', draw: { owner: 1, hidden: true }, decision: { id: 'draw', actions: [{ type: 'draw.keep' }, { type: 'draw.discard' }] } });
    const model = { ...createAuthorityPresentation(current), view: current };
    const markup = renderToStaticMarkup(<AuthorityDecisionLayer model={model} send={vi.fn()} busy={false} />);
    expect(markup).toContain('暗牌抉择');
    expect(markup).toContain('收入手牌');
    expect(markup).toContain('弃置此牌');
  });
  it('reuses the original four identity choices before constructing an offline session', () => {
    const markup = renderToStaticMarkup(<RoleSelectionDialog onSelect={vi.fn()} onCancel={vi.fn()} />);
    expect((markup.match(/toe-battle-role-choice/g) || [])).toHaveLength(4);
    expect(markup).toContain('返回');
  });
});
