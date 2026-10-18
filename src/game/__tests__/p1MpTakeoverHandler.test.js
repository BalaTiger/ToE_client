import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { resolveMpAiTakeoverState } from '../multiplayerAiTakeover';
import {
  claimMpHuntRevealConfirmation,
  isResolvedMpHuntWaitState,
} from '../../multiplayer/multiplayerHuntReplayGuard';

const source = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
const start = source.indexOf('  function handleMpAiTakeover(');
const closing = /\n {2}}\r?\n/.exec(source.slice(start));
if (start < 0 || !closing) throw new Error('Missing App handleMpAiTakeover');
const handler = source.slice(start, start + closing.index + closing[0].length);

function bind(latest) {
  const context = {
    playerUUIDRef: { current: 'authority' }, isMultiplayerRef: { current: true },
    latestGsRef: { current: latest }, myPlayerIndexRef: { current: 0 },
    pendingMpAiTakeoverRef: { current: null },
    completedMpHuntRevealPromptIdsRef: { current: new Set() },
    pendingMpRawQueueRef: { current: [] }, pendingMpLatestStateRawRef: { current: null },
    roomModalRef: { current: { roomId: 'local-regression', aiAuthorityUuid: 'authority' } },
    socketRef: { current: { connected: true, emit: vi.fn() } },
    isMpReplayBusy: () => false,
    rotateGsForViewer: state => state, rotateRawSeatIndex: index => index,
    derotateGs: state => state, getHandLimitForPlayer: () => 4,
    resolveCaveDuelState: vi.fn(),
    claimMpHuntRevealConfirmation, isResolvedMpHuntWaitState,
    resolveMpAiTakeoverState: vi.fn(state => ({ ...state, phase: 'ACTION' })),
    processIncomingMpStateSync: vi.fn(),
  };
  runInNewContext(handler, context);
  return context;
}

describe('TOE016 buffered takeover uses the committed match state', () => {
  it('does not let a legacy echoed swap marker block later AI turns', () => {
    const latest={_mpMatchId:'m',_turnKey:12,currentTurn:1,phase:'DRAW_REVEAL',_mpPrivateSwapWaiting:true};
    const context=bind(latest);
    context.handleMpAiTakeover({authorityUuid:'authority',playerIndex:1,gs:latest});
    expect(context.resolveMpAiTakeoverState).toHaveBeenCalledOnce();
  });
  it('upgrades an obscured swap wait only from the matching authoritative takeover checkpoint', () => {
    const latest={_mpMatchId:'m',_turnKey:9,currentTurn:1,phase:'SWAP_GIVE_CARD',_mpPrivateSwapWaiting:true,abilityData:{}};
    const checkpoint={...latest,_mpPrivateSwapWaiting:undefined,abilityData:{takenCard:{id:'private'}}};
    const context=bind(latest);
    context.handleMpAiTakeover({authorityUuid:'authority',playerIndex:1,gs:checkpoint});
    expect(context.resolveMpAiTakeoverState.mock.calls[0][0]).toBe(checkpoint);
    for(const wrong of [{...checkpoint,_turnKey:8},{...checkpoint,_mpMatchId:'old'},{...checkpoint,currentTurn:2}]){
      const c=bind(latest);c.handleMpAiTakeover({authorityUuid:'authority',playerIndex:1,gs:wrong});
      expect(c.resolveMpAiTakeoverState).not.toHaveBeenCalled();
    }
  });
  it('discards a buffered takeover when a grace-period reconnect transfers authority', () => {
    const context = bind({ phase: 'DRAW_REVEAL', currentTurn: 2, _turnKey: 9 });
    context.roomModalRef.current.aiAuthorityUuid = 'restored-earlier-human';
    context.handleMpAiTakeover({ authorityUuid: 'authority', playerIndex: 2 });
    expect(context.resolveMpAiTakeoverState).not.toHaveBeenCalled();
    expect(context.socketRef.current.emit).not.toHaveBeenCalled();
    expect(context.processIncomingMpStateSync).not.toHaveBeenCalled();
  });
  it('does not roll a newer committed turn back to the original disconnect snapshot', () => {
    const latest = { phase: 'DRAW_REVEAL', currentTurn: 2, _turnKey: 9 };
    const context = bind(latest);
    context.handleMpAiTakeover({ authorityUuid: 'authority', playerIndex: 2,
      gs: { phase: 'ACTION', currentTurn: 1, _turnKey: 3 } });
    expect(context.resolveMpAiTakeoverState.mock.calls[0][0]).toBe(latest);
    expect(context.socketRef.current.emit.mock.calls[0][1].gs._turnKey).toBe(9);
  });

  it.each(['queue', 'latest'])('waits for queued incoming replay (%s)', kind => {
    const context = bind({ phase: 'DRAW_REVEAL', currentTurn: 2, _turnKey: 9 });
    if (kind === 'queue') context.pendingMpRawQueueRef.current = [{ _turnKey: 10 }];
    else context.pendingMpLatestStateRawRef.current = { _turnKey: 10 };
    const payload = { authorityUuid: 'authority', playerIndex: 2 };
    context.handleMpAiTakeover(payload);
    expect(context.resolveMpAiTakeoverState).not.toHaveBeenCalled();
    expect(context.pendingMpAiTakeoverRef.current).toBe(payload);
  });

  it('emits one hunt confirmation across both App entry paths and permits a new prompt in the same turn', () => {
    const card = { id: 'natural-apophis', name: '阿波菲斯', isGod: true, godKey: 'APO' };
    const waiting = { _isMP: true, phase: 'HUNT_WAIT_REVEAL', currentTurn: 1, _turnKey: 5,
      players: [{ name: 'A', hand: [] }, { name: 'B', hand: [] }, { name: 'C', hand: [card] }],
      deck: [], discard: [], log: ['B追捕C，等待亮牌'],
      abilityData: { huntTi: 2, huntPromptId: 'hunt:5:0:1:20' } };
    const context = bind(waiting);
    context.resolveMpAiTakeoverState = vi.fn(resolveMpAiTakeoverState);
    const payload = { authorityUuid: 'authority', playerIndex: 2 };
    // The real App handler is entered first by the socket and later by the
    // progress effect while its committed source can still be the old WAIT.
    context.handleMpAiTakeover(payload);
    context.handleMpAiTakeover(payload);
    expect(context.resolveMpAiTakeoverState).toHaveBeenCalledOnce();
    expect(context.socketRef.current.emit).toHaveBeenCalledOnce();
    expect(context.processIncomingMpStateSync).toHaveBeenCalledOnce();
    const emitted = context.socketRef.current.emit.mock.calls[0][1].gs;
    expect(emitted.phase).toBe('HUNT_CONFIRM');
    expect(emitted.abilityData.revCard).toBe(card);
    expect(emitted.log.filter(line => line.includes('(AI接管)'))).toHaveLength(1);
    expect(context.completedMpHuntRevealPromptIdsRef.current.has(waiting.abilityData.huntPromptId)).toBe(true);

    context.latestGsRef.current = { ...waiting, abilityData: {
      ...waiting.abilityData, huntPromptId: 'hunt:5:0:1:23',
    } };
    context.handleMpAiTakeover(payload);
    expect(context.socketRef.current.emit).toHaveBeenCalledTimes(2);
    expect(context.processIncomingMpStateSync).toHaveBeenCalledTimes(2);
    expect(context.completedMpHuntRevealPromptIdsRef.current.size).toBe(2);
  });
});
