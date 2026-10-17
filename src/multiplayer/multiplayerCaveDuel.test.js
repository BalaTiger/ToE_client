import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { claimReadyCaveDuel } from './multiplayerCaveDuel';
import { resolveMpAiTakeoverState } from '../game/multiplayerAiTakeover';
import { getDecisionOwnerSeats } from '../game/decisionContext';
import { isLocalCaveDuelCardDecisionPhase } from '../game/multiplayerDecisionPolicy';
import { resolveHandCardSelection } from '../game/caveDuel';
import { makeGs, makePlayer, makeZoneCard } from '../game/__tests__/factory';

const source = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
function pending() {
  return makeGs({ _isMP: true, phase: 'CAVE_DUEL_SELECT_CARD',
    players: [makePlayer({ hand: [makeZoneCard('A2')] }), makePlayer({ hand: [makeZoneCard('B3')] })],
    abilityData: { caveDuelId: 'duel-1', caveDuelSource: 0, caveDuelTarget: 1,
      caveDuelResolverUuid: 'owner', caveDuelReady: false } });
}
function ready() {
  const gs = pending();
  return { ...gs, abilityData: { ...gs.abilityData, caveDuelReady: true,
    sourceCard: gs.players[0].hand[0], targetCard: gs.players[1].hand[0], sourceCardIndex: 0, targetCardIndex: 0 } };
}

describe('server-confirmed multiplayer cave duel', () => {
  it('the actual App selection handler publishes only a choice, even when its stale state contains both cards', () => {
    const start = source.indexOf('  function caveDuelSelectCard(');
    const end = source.indexOf('  function damageLinkSelectTarget(', start);
    const gs = ready(); gs.abilityData.caveDuelReady = false;
    delete gs.abilityData.sourceCard;
    const ctx = { gs, copyPlayers: structuredClone, isLocalSeatIndex: i => i === 0, resolveHandCardSelection,
      broadcastMpStateBeforeLocalReplay: vi.fn(() => true), setGs: vi.fn(), executeCaveDuel: vi.fn() };
    const select = runInNewContext(`(${source.slice(start, end).trim()})`, ctx);
    select(0, gs.players[0].hand[0]);
    expect(ctx.broadcastMpStateBeforeLocalReplay).toHaveBeenCalledOnce();
    expect(ctx.setGs).toHaveBeenCalledOnce();
    expect(ctx.executeCaveDuel).not.toHaveBeenCalled();
    gs.abilityData.sourceCardChosen = true;
    select(0, gs.players[0].hand[0]);
    expect(ctx.broadcastMpStateBeforeLocalReplay).toHaveBeenCalledOnce();
  });

  it('the actual App effect resolves exactly once, only on the ready resolver, after replay is idle', () => {
    const marker = source.indexOf('    if(!claimReadyCaveDuel(');
    const start = source.lastIndexOf('  useEffect(()=>{', marker);
    const end = source.indexOf('  const latestHoundsInspectionSeq=', marker);
    let effect;
    const ctx = { gs: ready(), playerUUID: 'owner', useEffect: fn => { effect = fn; },
      anim: null, animExiting: false, roleRevealAnim: null, animQueueRef: { current: [] },
      pendingGsRef: { current: null }, pendingMpRawQueueRef: { current: [] },
      pendingMpLatestStateRawRef: { current: null }, claimedCaveDuelsRef: { current: new Set() },
      socketRef: { current: { connected: true } }, claimReadyCaveDuel, copyPlayers: structuredClone,
      executeCaveDuel: vi.fn() };
    runInNewContext(source.slice(start, end), ctx);
    ctx.anim = {}; effect(); expect(ctx.executeCaveDuel).not.toHaveBeenCalled();
    ctx.anim = null; ctx.playerUUID = 'peer'; effect(); expect(ctx.executeCaveDuel).not.toHaveBeenCalled();
    ctx.playerUUID = 'owner'; effect(); effect();
    expect(ctx.executeCaveDuel).toHaveBeenCalledOnce();
  });

  it('waits for a server id, connectivity and both locked choices; does not settle single-player states', () => {
    const claimed = new Set();
    expect(claimReadyCaveDuel(pending(), 'owner', claimed, true)).toBe(false);
    expect(claimReadyCaveDuel(ready(), 'owner', claimed, false)).toBe(false);
    expect(claimReadyCaveDuel({ ...ready(), _isMP: false }, 'owner', claimed, true)).toBe(false);
    const missing = ready(); delete missing.abilityData.caveDuelId;
    expect(claimReadyCaveDuel(missing, 'owner', claimed, true)).toBe(false);
    expect(claimReadyCaveDuel(ready(), 'owner', claimed, true)).toBe(true);
    expect(claimReadyCaveDuel(ready(), 'owner', claimed, true)).toBe(false);
  });

  it('the actual duel execution passes its decision receipt to the final presentation publisher', () => {
    const start = source.indexOf('  function executeCaveDuel(');
    const end = source.indexOf('  function caveDuelSelectCard(', start);
    const state = ready();
    const ctx = { resolveCaveDuelState: vi.fn(() => ({ nextGs: { phase: 'ACTION' }, duelCompare: 1, L: ['duel'] })),
      finishTargetContinuation: vi.fn() };
    const execute = runInNewContext(`(${source.slice(start, end).trim()})`, ctx);
    const ad = state.abilityData;
    execute(state.players, 0, 1, 0, 0, ad.sourceCard, ad.targetCard, state);
    expect(ctx.finishTargetContinuation).toHaveBeenCalledWith(expect.objectContaining({
      caveDuelResolutionId: 'duel-1', queue: [expect.objectContaining({ type: 'CAVE_DUEL' })],
    }));
  });

  it('the actual continuation publisher sends the receipt with the animation and keeps it out of local state', () => {
    const start = source.indexOf('  function finishTargetContinuation(');
    const end = source.indexOf('  function resolveTsathogguaSlimeBalance(', start);
    const nextGs = { ...ready(), phase: 'ACTION', abilityData: {}, log: ['duel result'] };
    const queue = [{ type: 'CAVE_DUEL' }];
    const ctx = { gs: { ...ready(), log: [] }, mergeApophisTargetQueue: q => q,
      resumeSameAbyssContinuation: s => s, resolveTargetContinuation: state => ({ state, route: 'APPLY_STATE' }),
      strictActionQueueMeta: () => ({}), consumedVisualEventIdsRef: { current: new Set() },
      TARGET_CONTINUATION_ROUTE: {}, broadcastAnimTransaction: vi.fn(), triggerAnimQueue: vi.fn() };
    const finish = runInNewContext(`(${source.slice(start, end).trim()})`, ctx);
    finish({ queue, nextGs, caveDuelResolutionId: 'duel-1' });
    expect(ctx.broadcastAnimTransaction).toHaveBeenCalledWith(expect.objectContaining({
      _mpCaveDuelResolutionId: 'duel-1', phase: 'ACTION',
    }), queue, expect.objectContaining({ context: 'caveDuel' }));
    expect(ctx.triggerAnimQueue.mock.calls[0][1]._mpCaveDuelResolutionId).toBeUndefined();
  });

  it('AI takeover submits its own blind choice without resolving or replacing the hidden human choice', () => {
    const gs = pending();
    gs.players[1].isAI = true;
    gs.abilityData.sourceCardChosen = true;
    const resolve = vi.fn();
    const next = resolveMpAiTakeoverState(gs, 1, { resolveCaveDuelState: resolve });
    expect(next.abilityData.targetCard).toEqual(gs.players[1].hand[0]);
    expect(next.abilityData.sourceCard).toBeUndefined();
    expect(next.phase).toBe(gs.phase);
    expect(resolve).not.toHaveBeenCalled();
    expect(getDecisionOwnerSeats(next)).toEqual([]);
    expect(isLocalCaveDuelCardDecisionPhase(next)).toBe(false);
  });
});
