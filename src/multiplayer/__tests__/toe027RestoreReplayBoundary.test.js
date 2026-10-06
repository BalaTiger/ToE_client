import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { registerMultiplayerSocketHandlers } from '../registerMultiplayerSocketHandlers';
import { processIncomingMultiplayerStateSync } from '../multiplayerRemoteReplayExecutor';
import { derotateGs, rotateGsForViewer } from '../../game/rotateState';
import { createLogOnlyVisualEvent } from '../../game/visualEvents';
import { makeBlankZoneCard, makeGodCard, makeGs, makePlayer } from '../../game/__tests__/factory';

const appSource = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const flushStart = appSource.indexOf('  useEffect(()=>{\n    if(gameOverPresentationFrozenRef.current||!isMultiplayerRef.current){');
const flushEnd = appSource.indexOf('  },[roleRevealAnim,anim,animExiting,gs?.phase,gs?._turnKey,gs?.log?.length]);', flushStart);
if (flushStart < 0 || flushEnd < 0) throw new Error('Missing actual App multiplayer pending replay effect');
const flushSource = appSource.slice(flushStart, flushEnd + '  },[roleRevealAnim,anim,animExiting,gs?.phase,gs?._turnKey,gs?.log?.length]);'.length);

function roomState(turn, dead = false) {
  return makeGs({
    _isMP: true, turn, _turnKey: turn, currentTurn: dead ? 2 : 0,
    log: [`对局回合 ${turn}`], _visualEvents: [],
    players: [
      makePlayer({ id: 'survivor-b', name: 'P3-B', role: '寻宝者', hp: 7, san: 9 }),
      makePlayer({ id: 'drawer-a', name: 'P3-A', role: '追猎者',
        hp: dead ? 0 : 2, san: dead ? 6 : 8, isDead: dead }),
      makePlayer({ id: 'survivor-c', name: 'P3-C', role: '邪祀者' }),
    ],
  });
}

function client(viewer = 1) {
  const handlers = new Map();
  const socket = { on: vi.fn((event, callback) => handlers.set(event, callback)), emit: vi.fn() };
  let current = rotateGsForViewer(roomState(11), viewer);
  const latestGsRef = { current };
  const setGs = vi.fn(value => {
    current = typeof value === 'function' ? value(current) : value;
    latestGsRef.current = current;
  });
  const context = {
    socket, socketRef: { current: socket }, playerUUIDRef: { current: roomState(11).players[viewer].id },
    identityTokenRef: { current: null }, leavingRoomRef: { current: false },
    myPlayerIndexRef: { current: viewer }, isMultiplayerRef: { current: true },
    mpRoleRevealedRef: { current: true }, mpOpeningRoleRevealPendingRef: { current: false },
    consumedVisualEventIdsRef: { current: new Set() }, mpAiTakeoverSeqRef: { current: 0 },
    pendingMpAiTakeoverRef: { current: null }, gameEndSentRef: { current: false },
    gameOverPresentationFrozenRef: { current: false },
    animQueueRef: { current: [] }, pendingGsRef: { current: null },
    pendingMpRawQueueRef: { current: [] }, pendingMpLatestStateRawRef: { current: null },
    receivedGsRef: { current: false }, suppressNextBroadcastRef: { current: false },
    latestGsRef, setGs, visualStateLocks: { lock: vi.fn(), clear: vi.fn() },
    triggerAnimQueue: vi.fn(), restoreVisibleLog: vi.fn(),
  };
  for (const name of ['setRoomModal', 'setFirstBattleStarted', 'setOnlineOptionsModal',
    'setMultiLoading', 'setMyPlayerIndex', 'setIsMultiplayer', 'setIsDisconnected',
    'setAnimExiting', 'clearDamageAnimations', 'setAnim', 'setRoleRevealAnim', 'addToast',
    'markInspectionEventsSeen', 'cleanupConnection', 'onConnected', 'handleMpAiTakeover']) context[name] = vi.fn();
  const processIncomingMpStateSync = vi.fn((rawState, options = {}) => processIncomingMultiplayerStateSync({
    rawState, currentState: current, roleRevealAnim: null, anim: null,
    animExiting: false, context, ...options,
  }));
  context.processIncomingMpStateSync = processIncomingMpStateSync;
  registerMultiplayerSocketHandlers(context);
  return {
    context, processIncomingMpStateSync,
    get state() { return current; },
    buffer(rawState) {
      return processIncomingMultiplayerStateSync({ rawState, currentState: current,
        roleRevealAnim: null, anim: { type: 'DRAW_CARD' }, animExiting: false, context });
    },
    restore(rawState = roomState(14, true), { aiAuthorityUuid } = {}) {
      return handlers.get('matchRestored')({ roomId: 'LOCAL-027', owner: 'local-test-b',
        aiAuthorityUuid,
        players: rawState.players.map(player => ({ uuid: player.id, username: player.name, isAI: !!player.isAI })),
        count: rawState.players.length, max: 12, playerIndex: viewer, gs: rawState, takeoverSeq: 2 });
    },
    flushActualAppEffect() {
      let effect;
      runInNewContext(flushSource, { ...context, gs: current,
        roleRevealAnim: null, anim: null, animExiting: false,
        useEffect: callback => { effect = callback; }, processIncomingMpStateSync });
      effect();
    },
    deliver(rawState) { return handlers.get('mpStateSync')({ gs: rawState }); },
  };
}

describe('TOE027 restore boundary discards superseded buffered replay', () => {
  it.each(['ordered', 'latest', 'both'])('does not roll a restored spectator back through the %s cache', slot => {
    const p = client();
    const ordered = { ...roomState(12), _visualEvents: [createLogOnlyVisualEvent({ msgs: ['旧动画通知'] })] };
    const latest = roomState(12);
    if (slot !== 'latest') {
      expect(p.buffer(ordered)).toBe('buffered');
      expect(p.context.pendingMpRawQueueRef.current).toHaveLength(1);
    }
    if (slot !== 'ordered') {
      expect(p.buffer(latest)).toBe('buffered');
      expect(p.context.pendingMpLatestStateRawRef.current).toBe(latest);
    }
    p.restore();
    expect(p.state.turn).toBe(14);
    expect(p.state.players[0]).toMatchObject({ id: 'drawer-a', hp: 0, san: 6, isDead: true });
    p.flushActualAppEffect();
    expect(p.state.turn).toBe(14);
    expect(p.state.players[0]).toMatchObject({ id: 'drawer-a', hp: 0, san: 6, isDead: true });
    expect(p.processIncomingMpStateSync).not.toHaveBeenCalled();
    expect(p.context.pendingMpRawQueueRef.current).toEqual([]);
    expect(p.context.pendingMpLatestStateRawRef.current).toBeNull();
  });

  it('still accepts fresh gameplay state after the reconnect reset', () => {
    const p = client();
    p.buffer(roomState(12));
    p.restore();
    p.flushActualAppEffect();
    const fresh = roomState(15, true);
    p.deliver(fresh);
    expect(p.processIncomingMpStateSync).toHaveBeenLastCalledWith(fresh);
    expect(p.state.turn).toBe(15);
    expect(p.state.players[0]).toMatchObject({ hp: 0, san: 6, isDead: true });
    expect(p.state.players[p.state.currentTurn].id).toBe('survivor-c');
  });
});

function legacyDeadGodChoice(count = 2, dead = true) {
  const raw = roomState(13, dead);
  if (count === 2) raw.players = raw.players.slice(0, 2);
  return { ...raw, currentTurn: 1, phase: 'GOD_CHOICE',
    abilityData: { drawerIdx: 1, godCard: makeGodCard('VRI', { id: 'legacy-pending-vri' }), godEncounterCost: 0 },
    deck: [makeBlankZoneCard({ id: 'after-dead-drawer' })],
  };
}

describe('TOE027 real matchRestored dead god owner recovery', () => {
  it('lets the restored human drawer settle a sole surviving treasure winner exactly once', () => {
    const p = client(1);
    const raw = legacyDeadGodChoice();
    const inputBytes = JSON.stringify(raw);
    p.restore(raw);
    expect(p.state.gameOver).toMatchObject({ winner: '寻宝者', winnerIdx: 1 });
    expect(p.state.players[1].id).toBe('survivor-b');
    expect(p.state.phase).not.toBe('GOD_CHOICE');
    expect(p.state.discard.filter(card => card.id === 'legacy-pending-vri')).toHaveLength(1);
    expect(p.context.receivedGsRef.current).toBe(false);
    expect(JSON.stringify(raw)).toBe(inputBytes);
    p.restore(derotateGs(p.state, 1));
    expect(p.state.discard.filter(card => card.id === 'legacy-pending-vri')).toHaveLength(1);
    expect(p.context.receivedGsRef.current).toBe(true);
  });

  it('lets the human drawer continue to the next living seat when several players remain', () => {
    const p = client(1);
    p.restore(legacyDeadGodChoice(3));
    expect(p.state.gameOver).toBeFalsy();
    expect(p.state.phase).not.toBe('GOD_CHOICE');
    expect(p.state.players[p.state.currentTurn]).toMatchObject({ id: 'survivor-c', isDead: false });
    expect(p.state.discard.filter(card => card.id === 'legacy-pending-vri')).toHaveLength(1);
    expect(p.state.drawReveal.card.id).toBe('after-dead-drawer');
    expect(p.context.receivedGsRef.current).toBe(false);
  });

  it.each([0, 2])('keeps observer %s from racing to resolve another human drawer', viewer => {
    const p = client(viewer);
    p.restore(legacyDeadGodChoice(3));
    expect(p.state.phase).toBe('GOD_CHOICE');
    expect(p.state.gameOver).toBeFalsy();
    expect(p.state.discard).toEqual([]);
    expect(p.context.receivedGsRef.current).toBe(true);
  });

  it('does not cancel a living drawer ordinary god decision on restore', () => {
    const p = client(1);
    p.restore(legacyDeadGodChoice(3, false));
    expect(p.state.players[0].isDead).toBe(false);
    expect(p.state.phase).toBe('GOD_CHOICE');
    expect(p.state.discard).toEqual([]);
    expect(p.context.receivedGsRef.current).toBe(true);
  });

  it('lets the existing AI authority recover a dead off-turn AI God owner', () => {
    const p = client(0);
    const raw = legacyDeadGodChoice(3);
    raw.currentTurn = 0;
    raw.phase = 'AI_GOD_CHOICE';
    raw.players[1].isAI = true;
    raw.abilityData = { playerIndex: 1, godCard: raw.abilityData.godCard };
    const inputBytes = JSON.stringify(raw);
    p.restore(raw, { aiAuthorityUuid: 'survivor-b' });
    expect(p.state.gameOver).toBeFalsy();
    expect(p.state.phase).toBe('ACTION');
    expect(p.state.currentTurn).toBe(0);
    expect(p.state.players[1]).toMatchObject({ id: 'drawer-a', hp: 0, san: 6, isDead: true });
    expect(p.state.discard.filter(card => card.id === 'legacy-pending-vri')).toHaveLength(1);
    expect(p.state.abilityData).toEqual({});
    expect(p.context.receivedGsRef.current).toBe(false);
    expect(JSON.stringify(raw)).toBe(inputBytes);
  });

  it('keeps another human observer from repairing the dead AI God owner', () => {
    const p = client(2);
    const raw = legacyDeadGodChoice(3);
    raw.currentTurn = 0;
    raw.phase = 'AI_GOD_CHOICE';
    raw.players[1].isAI = true;
    raw.abilityData = { playerIndex: 1, godCard: raw.abilityData.godCard };
    p.restore(raw, { aiAuthorityUuid: 'survivor-b' });
    expect(p.state.gameOver).toBeFalsy();
    expect(p.state.phase).toBe('AI_GOD_CHOICE');
    expect(p.state.players[p.state.abilityData.playerIndex]).toMatchObject({
      id: 'drawer-a', hp: 0, san: 6, isDead: true,
    });
    expect(p.state.discard).toEqual([]);
    expect(p.context.receivedGsRef.current).toBe(true);
  });
});
