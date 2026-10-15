import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
const start = source.indexOf('onReturnRoom={');
const end = source.indexOf('\n        onRestart=', start);
if (start < 0 || end < 0) throw new Error('Missing result return-to-room handler');
const handler = source.slice(start + 'onReturnRoom={'.length, end).trim().slice(0, -1);

describe('result return waits for multiplayer settlement', () => {
  it('keeps the result and playback state until the server confirms the completed match', () => {
    let confirm;
    const context = {
      requestReturnToRoom: vi.fn(callback => { confirm = callback; return false; }),
      gameEndSentRef: { current: false },
      socketRef: { current: { connected: true, emit: vi.fn() } },
      gs: { gameOver: { winner: 'LOSE_ALL' } }, playerUUID: 'me', roomModal: { roomId: 'room-a' },
      gameOverPresentationFrozenRef: { current: false },
      isMultiplayerRef: { current: true }, myPlayerIndexRef: { current: 1 },
      mpRoleRevealedRef: { current: true }, consumedVisualEventIdsRef: { current: new Set(['old']) },
      clearMultiplayerReplayState: vi.fn(), setIsMultiplayer: vi.fn(), setMyPlayerIndex: vi.fn(),
      setShowGodResurrection: vi.fn(), setShowFullLog: vi.fn(), setGs: vi.fn(), addToast: vi.fn(),
    };
    const onReturnRoom = runInNewContext(`(${handler})`, context);
    expect(onReturnRoom()).toBe(false);
    expect(context.requestReturnToRoom).toHaveBeenCalledOnce();
    expect(context.setGs).not.toHaveBeenCalled();
    expect(context.clearMultiplayerReplayState).not.toHaveBeenCalled();
    expect(context.isMultiplayerRef.current).toBe(true);
    expect(context.socketRef.current.emit).not.toHaveBeenCalled();
    confirm();
    expect(context.clearMultiplayerReplayState).toHaveBeenCalledOnce();
    expect(context.setGs).toHaveBeenCalledExactlyOnceWith(null);
    expect(context.isMultiplayerRef.current).toBe(false);
  });
});
