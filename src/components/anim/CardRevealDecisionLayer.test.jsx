import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CardRevealDecisionLayer } from './CardRevealDecisionLayer';
import { getRevealDecision, matchesRevealDecision } from './revealDecision';
import { DrawRevealActions, GodChoiceActions } from '../battle/RevealDecisionActions';
import { TUTORIAL_FLOW } from '../../game/tutorialScenario';

const hook = vi.hoisted(() => ({ value: null, changed: false }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal(),
  // Exercise the host across queue renders without mounting DOM animations.
  useState: initial => [hook.value ?? initial, next => {
    const value = typeof next === 'function' ? next(hook.value) : next;
    hook.changed = value !== hook.value;
    hook.value = value;
  }],
}));

const zone = { id: 'zone-a', key: 'B1', name: '幽闭恐惧', type: 'adjacentSanLoss', isZone: true };
const god = { id: 'god-a', godKey: 'CTH', name: '克苏鲁', isGod: true };
const players = [{ name: '本地', role: '邪祀者' }, { name: '远方旅者', role: '寻宝者' }];
const actionState = { phase: 'ACTION', currentTurn: 0, players, abilityData: {} };
const drawState = (extra = {}) => ({
  ...actionState, phase: 'DRAW_REVEAL',
  drawReveal: { card: zone, drawerIdx: 0, needsDecision: true }, ...extra,
});
const godState = (extra = {}) => ({
  ...actionState, phase: 'GOD_CHOICE', abilityData: { godCard: god, drawerIdx: 0 }, ...extra,
});
const draw = (card = zone, extra = {}) => ({ type: 'DRAW_CARD', card, targetPid: 0, _playbackId: `reveal-${card.id}`, ...extra });
const decisionProps = (gs, extra = {}) => ({
  gs, me: gs.players[0], canShowTurnDecisionModal: false,
  isLocalDrawDecision: true, isLocalGodChoice: true,
  decisionContext: { localCanAct: true }, ...extra,
});

function renderLayer(props) {
  let result;
  let renders = 0;
  do {
    hook.changed = false;
    result = CardRevealDecisionLayer(props);
    if (++renders > 5) throw new Error('Reveal host did not settle its render-state update');
  } while (hook.changed);
  return result;
}

beforeEach(() => {
  hook.value = null;
  hook.changed = false;
});

describe('reveal decision presentation lifecycle', () => {
  it('keeps the playback key and card through the pending queue, then exposes options only after commit', () => {
    const gs = drawState();
    const running = renderLayer({ anim: draw(), pendingState: gs, decisionProps: decisionProps(actionState) });
    expect(running.props.preserveOnExit).toBe(true);
    expect(running.props.showBackdrop).toBe(true);
    expect(running.props.children).toBeNull();

    const held = renderLayer({ anim: { type: 'SAN_DAMAGE' }, pendingState: gs, decisionProps: decisionProps(actionState) });
    expect(held.key).toBe(running.key);
    expect(held.props).toMatchObject({ card: zone, settled: true, decisionKind: 'draw-reveal' });
    expect(held.props.showBackdrop).toBe(false);
    expect(held.props.children).toBeNull();

    const ready = renderLayer({ decisionProps: decisionProps(gs, { canShowTurnDecisionModal: true }) });
    expect(ready.key).toBe(running.key);
    expect(ready.props.card).toBe(zone);
    expect(ready.props.settled).toBe(true);
    expect(ready.props.showBackdrop).toBe(true);
    expect(ready.props.children.type).toBe(DrawRevealActions);
    expect(ready.props.children.props.canChoose).toBe(true);
  });

  it('does not unlock god choices during encounter inspection or status animations', () => {
    const gs = godState();
    const running = renderLayer({ anim: draw(god), pendingState: gs, decisionProps: decisionProps(actionState) });
    const inspection = { id: 'inspection-a', effect: 'sanLoss', name: '理智检定' };
    const inspecting = renderLayer({ anim: draw(inspection), pendingState: gs, decisionProps: decisionProps(actionState) });
    expect(inspecting.props.card).toBe(inspection);
    expect(inspecting.props.preserveOnExit).toBe(false);
    expect(inspecting.props.showBackdrop).toBe(true);
    expect(inspecting.props.children).toBeNull();

    const status = renderLayer({ anim: { type: 'SAN_DAMAGE' }, pendingState: gs, decisionProps: decisionProps(actionState) });
    expect(status.key).toBe(running.key);
    expect(status.props.card).toBe(god);
    expect(status.props.showBackdrop).toBe(false);
    expect(status.props.children).toBeNull();
    const ready = renderLayer({ decisionProps: decisionProps(gs, { canShowTurnDecisionModal: true }) });
    expect(ready.key).toBe(running.key);
    expect(ready.props.showBackdrop).toBe(true);
    expect(ready.props.children.type).toBe(GodChoiceActions);
  });

  it.each([['draw-reveal', drawState()], ['god-choice', godState()]])(
    'restores %s directly from a snapshot without a previous animation', (kind, gs) => {
      const held = renderLayer({ decisionProps: decisionProps(gs, { canShowTurnDecisionModal: true }) });
      expect(held.props).toMatchObject({ settled: true, skipTravel: true, decisionKind: kind });
      expect(held.props.children).not.toBeNull();
    },
  );

  it('withdraws a card and its options immediately on submission or resolved pending state', () => {
    const gs = drawState();
    renderLayer({ anim: draw(), pendingState: gs, decisionProps: decisionProps(actionState) });
    expect(renderLayer({ decisionProps: decisionProps(gs, { canShowTurnDecisionModal: true, decisionSubmitting: true }) })).toBeNull();
    expect(renderLayer({ pendingState: actionState, decisionProps: decisionProps(gs) })).toBeNull();
    // Pending state must win even if an external UI-ready flag is briefly stale.
    expect(renderLayer({ pendingState: actionState, decisionProps: decisionProps(gs, { canShowTurnDecisionModal: true }) })).toBeNull();
  });

  it('does not retain an old reveal for a different pending card', () => {
    const first = drawState();
    renderLayer({ anim: draw(), pendingState: first, decisionProps: decisionProps(actionState) });
    const next = drawState({ drawReveal: { ...first.drawReveal, card: { ...zone, id: 'zone-b' } } });
    expect(renderLayer({ pendingState: next, decisionProps: decisionProps(actionState) })).toBeNull();
  });

  it.each([
    ['forced keep', drawState({ drawReveal: { card: zone, needsDecision: true, forcedKeep: true } }), draw()],
    ['automatic keep', drawState({ drawReveal: { card: zone, needsDecision: false } }), draw()],
    ['travel-only draw', drawState(), draw(zone, { travelOnly: true })],
    ['hidden draw', drawState(), draw({ ...zone, hiddenDraw: true })],
  ])('does not keep a %s in the presentation queue', (_, pendingState, anim) => {
    const running = renderLayer({ anim, pendingState, decisionProps: decisionProps(actionState) });
    expect(running.props.preserveOnExit).toBe(false);
    expect(renderLayer({ pendingState, decisionProps: decisionProps(actionState) })).toBeNull();
  });

  it('uses the drawer rather than currentTurn for a remote waiting view', () => {
    const gs = drawState({ _isMP: true, currentTurn: 0, drawReveal: { card: zone, drawerIdx: 1, needsDecision: true } });
    const layer = renderLayer({ decisionProps: decisionProps(gs, {
      canShowTurnDecisionModal: true, isLocalDrawDecision: false, decisionContext: { localCanAct: false },
    }) });
    expect(layer.props.targetPid).toBe(1);
    const choices = layer.props.children;
    expect(choices.props.canChoose).toBe(false);
    expect(choices.props.thinkingText).toContain('远方旅者');
    const markup = renderToStaticMarkup(choices);
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain('<button');
  });

  it('retains blind identity metadata without changing the drawer or playback match', () => {
    const gs = drawState({ currentTurn: 1, drawReveal: { card: zone, drawerIdx: 0, needsDecision: true, blindZoneIdentity: true } });
    const decision = getRevealDecision(gs);
    expect(decision).toMatchObject({ actorIdx: 0, card: { blindZoneIdentity: true } });
    expect(matchesRevealDecision(draw(), decision)).toBe(true);
    expect(matchesRevealDecision(draw(zone, { targetPid: 1 }), decision)).toBe(false);
  });

  it('preserves tutorial draw permissions, highlighted ref, and original callbacks', () => {
    const keep = vi.fn(), discard = vi.fn(), allowed = vi.fn(() => true), keepRef = { current: null };
    const layer = renderLayer({ decisionProps: decisionProps(drawState(), {
      canShowTurnDecisionModal: true, isTutorialDrawKeepStep: true, isTutorialActionAllowed: allowed,
      handleDrawKeepFromModal: keep, handleDrawDiscardFromModal: discard, drawRevealKeepButtonRef: keepRef,
    }) });
    const choices = layer.props.children.props;
    expect(allowed).toHaveBeenCalledWith({ type: 'drawKeep' });
    expect(choices).toMatchObject({ canKeep: true, canDiscard: false, keepButtonRef: keepRef });
    choices.onKeep();
    expect(keep).toHaveBeenCalledTimes(1);
    expect(choices.onDiscard).toBe(discard);
  });

  it('keeps tutorial god income routed through the existing transaction callback', () => {
    const resolve = vi.fn(), allowed = vi.fn(() => true), keepRef = { current: null };
    const run = vi.fn((_, action) => action());
    const layer = renderLayer({ decisionProps: decisionProps(godState(), {
      canShowTurnDecisionModal: true, showTutorial: true, tutorialStep: TUTORIAL_FLOW.CULTIST_GOD_KEEP_HAND,
      isTutorialActionAllowed: allowed, runDecision: run, godResolvePlayer: resolve, godKeepHandButtonRef: keepRef,
    }) });
    const choices = layer.props.children.props;
    expect(choices).toMatchObject({ allowWorship: false, allowKeepHand: true, allowDiscard: false, keepButtonRef: keepRef });
    expect(allowed).toHaveBeenCalledWith({ type: 'godKeepHand' });
    choices.onKeepHand();
    expect(run).toHaveBeenCalledWith('god-choice:keep:CTH', expect.any(Function));
    expect(resolve).toHaveBeenCalledExactlyOnceWith('keepHand');
  });
});
