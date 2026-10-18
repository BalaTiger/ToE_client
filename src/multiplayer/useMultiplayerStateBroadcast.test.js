import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROLE_CULTIST, ROLE_HUNTER, ROLE_TREASURE } from '../game/coreUtils';
import {
  buildNormalStateBroadcast,
  buildPlayerWinWaitBroadcast,
  emitMultiplayerGameEnd,
  getMultiplayerWinnerRole,
  isEndTurnReplayDecisionState,
  shouldSuppressNormalStateBroadcast,
  useMultiplayerStateBroadcast,
} from './useMultiplayerStateBroadcast';

const hooks = vi.hoisted(() => ({ current: null }));
vi.mock('react', () => ({
  useEffect: (...args) => hooks.current.useEffect(...args),
  useRef: (...args) => hooks.current.useRef(...args),
}));

// Retain dependency slots between renders and execute the production effects.
// Calling the pure broadcast builders cannot reproduce a roomUpdated rerender.
function renderBroadcast(args) {
  const slots = [];
  const refs = [];
  let cursor = 0;
  let refCursor = 0;
  const runtime = {
    useRef(value) { return (refs[refCursor++] ||= { current: value }); },
    useEffect(callback, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        slots[index] = { deps, callback, cleanup: previous?.cleanup, pending: true };
      }
    },
  };
  return {
    render(patch = {}) {
      Object.assign(args, patch);
      if (Object.hasOwn(patch, 'gs')) args.latestGsRef.current = patch.gs;
      cursor = 0;
      refCursor = 0;
      hooks.current = runtime;
      // eslint-disable-next-line react-hooks/rules-of-hooks -- Run the actual hook with retained effect dependencies.
      runtime.result = useMultiplayerStateBroadcast(args);
      slots.filter(slot => slot.pending).forEach(slot => {
        slot.pending = false;
        slot.cleanup?.();
        slot.cleanup = slot.callback();
      });
    },
    unmount() { slots.forEach(slot => slot.cleanup?.()); },
    get result() { return runtime.result; },
  };
}

const renderers = [];
afterEach(() => {
  renderers.splice(0).forEach(renderer => renderer.unmount());
  hooks.current = null;
  vi.useRealTimers();
});

function setupBroadcast(patch = {}) {
  const gs = {
    _isMP: true,
    phase: 'HUNT_WAIT_REVEAL',
    currentTurn: 0,
    _turnKey: 5,
    players: [{ name: '追猎者' }, { name: '目标' }, { name: '观察者' }],
    abilityData: { huntTi: 1, huntPromptId: 'hunt-prompt-5' },
    log: ['等待目标亮牌'],
    _visualEvents: [],
  };
  const socket = { connected: true, emit: vi.fn(), timeout: vi.fn(function () { return this; }) };
  const args = {
    gs,
    setGs: vi.fn(),
    isMultiplayer: true,
    playerUUID: 'hunter',
    roomModal: { roomId: 'room-1', aiAuthorityUuid: 'observer', players: [{ uuid: 'hunter' }, { uuid: 'target', isAI: false }, { uuid: 'observer' }] },
    socketRef: { current: socket },
    myPlayerIndexRef: { current: 0 },
    gameEndSentRef: { current: false },
    receivedGsRef: { current: false },
    latestGsRef: { current: gs },
    consumedVisualEventIdsRef: { current: new Set() },
    anim: null,
    animExiting: false,
    showTutorial: false,
    animQueueRef: { current: [] },
    pendingGsRef: { current: null },
    ...patch,
  };
  const renderer = renderBroadcast(args);
  renderers.push(renderer);
  return { args, socket, renderer };
}

function aiRoomUpdate(room) {
  return { ...room, players: room.players.map(player => player.uuid === 'target' ? { ...player, isAI: true } : player) };
}

describe('useMultiplayerStateBroadcast room metadata rerenders', () => {
  it('preserves one requested return through same-match restored snapshots and cancels it when gameplay is cleared', () => {
    const { args, socket, renderer } = setupBroadcast();
    const terminal = { ...args.gs, _mpMatchId: 'match-a', gameOver: { winner: ROLE_TREASURE } };
    renderer.render({ gs: terminal, roomModal: { ...args.roomModal, matchId: 'match-a', inGame: true } });
    const onReturn = vi.fn();
    renderer.result.requestReturnToRoom(onReturn);
    const oldAck = socket.emit.mock.calls.find(([event]) => event === 'gameEnd')[2];
    renderer.render({ gs: JSON.parse(JSON.stringify(terminal)) });
    oldAck(null, { ok: true, matchId: 'match-a' });
    expect(onReturn).not.toHaveBeenCalled();
    socket.emit.mock.calls.filter(([event]) => event === 'gameEnd').at(-1)[2](null, { ok: true, matchId: 'match-a' });
    expect(onReturn).toHaveBeenCalledOnce();
    renderer.result.requestReturnToRoom(vi.fn());
    expect(onReturn).toHaveBeenCalledOnce();
    renderer.render({ gs: null, isMultiplayer: false });
    oldAck(null, { ok: true, matchId: 'match-a' });
    expect(onReturn).toHaveBeenCalledOnce();
  });

  it.each(['gameOver', 'roomId', 'matchId'])('refuses an unsafe return without %s', missing => {
    const { args, renderer } = setupBroadcast();
    const gs = { ...args.gs, _mpMatchId: 'match-a', gameOver: { winner: ROLE_TREASURE } };
    const roomModal = { ...args.roomModal, matchId: 'match-a', inGame: false };
    if (missing === 'gameOver') gs.gameOver = null;
    if (missing === 'matchId') delete gs._mpMatchId;
    if (missing === 'roomId') delete roomModal.roomId;
    renderer.render({ gs, roomModal });
    const onReturn = vi.fn();
    expect(renderer.result.requestReturnToRoom(onReturn)).toBe(false);
    expect(onReturn).not.toHaveBeenCalled();
  });

  it('retries a lost terminal packet and returns once only after its matching acknowledgement', async () => {
    vi.useFakeTimers();
    const { args, socket, renderer } = setupBroadcast();
    const terminal = { ...args.gs, _mpMatchId: 'match-a', gameOver: { winner: ROLE_TREASURE, winnerIdx: 0 } };
    renderer.render({ gs: terminal, roomModal: { ...args.roomModal, matchId: 'match-a', inGame: true } });
    const onReturn = vi.fn();
    const duplicateReturn = vi.fn();
    expect(renderer.result.requestReturnToRoom(onReturn)).toBe(false);
    expect(renderer.result.requestReturnToRoom(duplicateReturn)).toBe(false);
    expect(args.gameEndSentRef.current).toBe(false);
    await vi.advanceTimersByTimeAsync(2500);
    const endCalls = socket.emit.mock.calls.filter(([event]) => event === 'gameEnd');
    expect(endCalls).toHaveLength(2);
    endCalls[1][2](null, { ok: true, matchId: 'match-a' });
    expect(args.gameEndSentRef.current).toBe(true);
    expect(onReturn).toHaveBeenCalledOnce();
    expect(duplicateReturn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(socket.emit.mock.calls.filter(([event]) => event === 'gameEnd')).toHaveLength(2);
    renderer.unmount();
    vi.useRealTimers();
  });

  it('lets a guest return on matching waiting-room confirmation and ignores an old acknowledgement after rematch', () => {
    const { args, socket, renderer } = setupBroadcast();
    const terminal = { ...args.gs, _mpMatchId: 'match-a', gameOver: { winner: ROLE_TREASURE } };
    renderer.render({ gs: terminal, roomModal: { ...args.roomModal, matchId: 'match-a', inGame: true } });
    const onReturn = vi.fn();
    renderer.result.requestReturnToRoom(onReturn);
    const oldAck = socket.emit.mock.calls.find(([event]) => event === 'gameEnd')[2];
    oldAck(null, { ok: false, reason: 'not_authority', matchId: 'match-a' });
    renderer.render({ roomModal: { ...args.roomModal, inGame: true, count: 3 } });
    expect(onReturn).not.toHaveBeenCalled();
    renderer.render({ roomModal: { ...args.roomModal, inGame: false } });
    expect(onReturn).toHaveBeenCalledOnce();
    args.gameEndSentRef.current = false;
    renderer.render({ gs: { ...terminal, _mpMatchId: 'match-b', gameOver: null }, roomModal: { ...args.roomModal, matchId: 'match-b', inGame: true } });
    oldAck(null, { ok: true, matchId: 'match-a' });
    expect(args.gameEndSentRef.current).toBe(false);
    expect(onReturn).toHaveBeenCalledOnce();
  });

  it('does not consume the terminal broadcast while disconnected and sends it after an authoritative restore', () => {
    const { args, socket, renderer } = setupBroadcast();
    socket.connected = false;
    const terminal = { ...args.gs, _mpMatchId: 'match-a', gameOver: { winner: ROLE_TREASURE, winnerIdx: 0 } };
    renderer.render({ gs: terminal });
    expect(args.gameEndSentRef.current).toBe(false);
    expect(socket.emit).not.toHaveBeenCalled();
    socket.connected = true;
    renderer.render({ gs: JSON.parse(JSON.stringify(terminal)) });
    socket.emit.mock.calls.find(([event]) => event === 'gameEnd')[2](null, { ok: true, matchId: 'match-a' });
    expect(args.gameEndSentRef.current).toBe(true);
    expect(socket.emit.mock.calls.map(([event]) => event)).toEqual(['mpStateSync', 'gameEnd']);
    renderer.render({ roomModal: aiRoomUpdate(args.roomModal) });
    expect(socket.emit).toHaveBeenCalledTimes(2);
  });

  it('does not echo a received hunt wait when the same room announces AI takeover', () => {
    const { args, socket, renderer } = setupBroadcast({ receivedGsRef: { current: true } });
    const waitingGs = args.gs;
    renderer.render();
    expect(args.receivedGsRef.current).toBe(false);
    expect(socket.emit).not.toHaveBeenCalled();

    renderer.render({ roomModal: aiRoomUpdate(args.roomModal) });
    expect(args.gs).toBe(waitingGs);
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('does not resend a locally published hunt wait for same-room metadata changes', () => {
    const { args, socket, renderer } = setupBroadcast();
    renderer.render();
    expect(socket.emit).toHaveBeenCalledTimes(1);

    renderer.render({ roomModal: aiRoomUpdate(args.roomModal) });
    expect(socket.emit).toHaveBeenCalledTimes(1);
  });

  it('still publishes a fresh local state after skipping a received wait', () => {
    const { args, socket, renderer } = setupBroadcast({ receivedGsRef: { current: true } });
    renderer.render();
    const nextGs = { ...args.gs, phase: 'HUNT_CONFIRM', abilityData: { ...args.gs.abilityData, revCard: { id: 'revealed' } } };
    renderer.render({ gs: nextGs });

    expect(socket.emit).toHaveBeenCalledExactlyOnceWith('mpStateSync', { roomId: 'room-1', gs: nextGs });
  });

  it('still publishes the current local state when animation blocking ends', () => {
    const { args, socket, renderer } = setupBroadcast({ anim: { type: 'HUNT_TARGET' } });
    renderer.render();
    renderer.render({ roomModal: aiRoomUpdate(args.roomModal) });
    expect(socket.emit).not.toHaveBeenCalled();

    renderer.render({ anim: null });
    expect(socket.emit).toHaveBeenCalledExactlyOnceWith('mpStateSync', { roomId: 'room-1', gs: args.gs });
  });

  it('still publishes when the actual room ID changes', () => {
    const { args, socket, renderer } = setupBroadcast();
    renderer.render();
    renderer.render({ roomModal: { ...args.roomModal, roomId: 'room-2' } });

    expect(socket.emit).toHaveBeenCalledTimes(2);
    expect(socket.emit).toHaveBeenLastCalledWith('mpStateSync', { roomId: 'room-2', gs: args.gs });
  });
});

describe('useMultiplayerStateBroadcast helpers', () => {
  it('only forwards multiplayer winner roles to gameEnd', () => {
    expect(getMultiplayerWinnerRole({ winner: ROLE_TREASURE })).toBe(ROLE_TREASURE);
    expect(getMultiplayerWinnerRole({ winner: ROLE_HUNTER })).toBe(ROLE_HUNTER);
    expect(getMultiplayerWinnerRole({ winner: ROLE_CULTIST })).toBe(ROLE_CULTIST);
    expect(getMultiplayerWinnerRole({ winner: 'LOSE_ALL' })).toBe('LOSE_ALL');
    expect(getMultiplayerWinnerRole(null)).toBe(null);
  });

  it('detects end-turn replay decision states that still need syncing', () => {
    expect(isEndTurnReplayDecisionState({
      _endTurnReplay: true,
      phase: 'DRAW_REVEAL',
      drawReveal: { fromEndTurnReplay: true },
    })).toBe(true);
    expect(isEndTurnReplayDecisionState({
      _endTurnReplay: true,
      phase: 'GOD_CHOICE',
      abilityData: { fromEndTurnReplay: true },
    })).toBe(true);
    expect(isEndTurnReplayDecisionState({
      _endTurnReplay: true,
      phase: 'ACTION',
    })).toBe(false);
  });

  it('suppresses private, wait-only, timeout-marker, and non-decision replay states', () => {
    expect(shouldSuppressNormalStateBroadcast({ phase: 'MP_PLAYER_WIN_WAIT' })).toBe(true);
    expect(shouldSuppressNormalStateBroadcast({ phase: 'SWAP_STEAL_CARD' })).toBe(true);
    expect(shouldSuppressNormalStateBroadcast({ phase: 'SWAP_GIVE_CARD' })).toBe(true);
    expect(shouldSuppressNormalStateBroadcast({ phase: 'ACTION', _mpEndTurn: true })).toBe(true);
    expect(shouldSuppressNormalStateBroadcast({ phase: 'ACTION', _mpAutoDiscard: true })).toBe(true);
    expect(shouldSuppressNormalStateBroadcast({ phase: 'ACTION', _mpAutoCthDecision: true })).toBe(true);
    expect(shouldSuppressNormalStateBroadcast({ phase: 'ACTION', _endTurnReplay: true })).toBe(true);
    expect(shouldSuppressNormalStateBroadcast({
      phase: 'DRAW_REVEAL',
      _endTurnReplay: true,
      drawReveal: { fromEndTurnReplay: true },
    })).toBe(false);
    expect(shouldSuppressNormalStateBroadcast({ phase: 'ACTION' })).toBe(false);
  });

  it('builds a wait-state broadcast for local treasure win screens', () => {
    const swapEvent = {
      id: 'swap-win-1',
      type: 'swapCards',
      sourceIdx: 0,
      targetIdx: 1,
      sourceCount: 1,
      targetCount: 1,
    };
    const broadcast = buildPlayerWinWaitBroadcast({
      gs: {
        phase: 'TREASURE_WIN',
        drawReveal: { card: { id: 'hidden' } },
        abilityData: { winReason: 'done' },
        _visualEvents: [swapEvent],
        players: [{ name: '我' }],
      },
      room: { roomId: 'room-1' },
      myPlayerIndex: 0,
    });

    expect(broadcast.roomId).toBe('room-1');
    expect(broadcast.rawGs.phase).toBe('MP_PLAYER_WIN_WAIT');
    expect(broadcast.rawGs.drawReveal).toBe(null);
    expect(broadcast.rawGs.abilityData).toMatchObject({
      winReason: 'done',
      winnerIdx: 0,
      waitingForTreasureReveal: true,
    });
    expect(broadcast.rawGs._visualEvents).toEqual([swapEvent]);
    expect(broadcast.clearLocalVisualEvents).toBe(false);
  });

  it('rotates the wait-state winnerIdx so remote viewers see the correct winner seat', async () => {
    const { rotateGsForViewer } = await import('../game/rotateState');
    const broadcast = buildPlayerWinWaitBroadcast({
      gs: {
        phase: 'TREASURE_WIN',
        drawReveal: null,
        abilityData: {},
        players: [{ name: '甲' }, { name: '乙' }, { name: '丙' }],
      },
      room: { roomId: 'room-1' },
      myPlayerIndex: 2,
    });

    // 获胜者（自己视角 seat 0）在原始座位表中位于 seat 2
    expect(broadcast.rawGs.abilityData.winnerIdx).toBe(2);
    // 远端（原始 seat 1）旋转后，获胜者应显示在远端视角的 seat 1，且就是获胜者本人（甲）
    const rotated = rotateGsForViewer(broadcast.rawGs, 1);
    expect(rotated.abilityData.winnerIdx).toBe(1);
    expect(rotated.players[rotated.abilityData.winnerIdx].name).toBe('甲');
  });

  it('prunes consumed visual events from normal state broadcasts', () => {
    const broadcast = buildNormalStateBroadcast({
      gs: {
        phase: 'ACTION',
        players: [{ name: '我' }],
        _visualEvents: [
          { type: 'drawCard', id: 'old-event' },
          { type: 'drawCard', id: 'fresh-event' },
        ],
      },
      room: { roomId: 'room-1' },
      myPlayerIndex: 0,
      consumedVisualEventIds: new Set(['old-event']),
    });

    expect(broadcast.roomId).toBe('room-1');
    expect(broadcast.clearLocalVisualEvents).toBe(true);
    expect(broadcast.freshVisualEvents).toEqual([{ type: 'drawCard', id: 'fresh-event', scope: 'action' }]);
    expect(broadcast.rawGs._visualEvents).toEqual([{ type: 'drawCard', id: 'fresh-event', scope: 'action' }]);
  });

  it('emits gameEnd and final state sync once the socket is connected', () => {
    const socket = { connected: true, emit: vi.fn() };
    const gs = {
      phase: 'ACTION',
      players: [{ name: '我' }],
      gameOver: { winner: ROLE_HUNTER },
    };

    expect(emitMultiplayerGameEnd({
      socket,
      gs,
      playerUUID: 'u1',
      roomId: 'room-1',
      myPlayerIndex: 0,
    })).toBe(true);

    expect(socket.emit).toHaveBeenCalledWith('gameEnd', {
      uuid: 'u1',
      roomId: 'room-1',
      winnerRole: ROLE_HUNTER,
    });
    expect(socket.emit).toHaveBeenCalledWith('mpStateSync', {
      roomId: 'room-1',
      gs,
    });
    expect(socket.emit.mock.calls.map(([event]) => event)).toEqual(['mpStateSync', 'gameEnd']);
  });
});

describe('private swap reconnect checkpoints', () => {
  it.each(['SWAP_STEAL_CARD', 'SWAP_GIVE_CARD'])('persists %s while keeping the normal broadcast suppressed', phase => {
    const {args,socket,renderer}=setupBroadcast();
    const gs={...args.gs,_mpMatchId:'match-swap',phase,skillUsed:phase==='SWAP_GIVE_CARD',abilityData:{swapTi:1,takenCard:{id:'taken'}}};
    renderer.render({gs});
    expect(socket.emit).toHaveBeenCalledWith('mpStateSync',expect.objectContaining({swapCheckpoint:true,matchId:'match-swap',gs}));
    expect(shouldSuppressNormalStateBroadcast(gs)).toBe(true);
  });
  it('does not echo a restored preview or buffer a disconnected preview', () => {
    const {args,socket,renderer}=setupBroadcast();
    args.receivedGsRef.current=true;
    renderer.render({gs:{...args.gs,phase:'SWAP_GIVE_CARD'}});
    expect(socket.emit).not.toHaveBeenCalled();
    socket.connected=false;
    renderer.render({gs:{...args.gs,phase:'SWAP_STEAL_CARD'}});
    expect(socket.emit).not.toHaveBeenCalled();
  });
});