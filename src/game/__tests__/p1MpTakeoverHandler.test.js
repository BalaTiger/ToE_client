import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

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
    pendingMpRawQueueRef: { current: [] }, pendingMpLatestStateRawRef: { current: null },
    roomModalRef: { current: { roomId: 'local-regression', aiAuthorityUuid: 'authority' } },
    socketRef: { current: { connected: true, emit: vi.fn() } },
    isMpReplayBusy: () => false,
    rotateGsForViewer: state => state, rotateRawSeatIndex: index => index,
    derotateGs: state => state, getHandLimitForPlayer: () => 4,
    resolveCaveDuelState: vi.fn(),
    resolveMpAiTakeoverState: vi.fn(state => ({ ...state, phase: 'ACTION' })),
    processIncomingMpStateSync: vi.fn(),
  };
  runInNewContext(handler, context);
  return context;
}

describe('TOE016 buffered takeover uses the committed match state', () => {
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
});
