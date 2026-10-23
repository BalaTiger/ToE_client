import { describe, expect, it, vi } from 'vitest';
import { RemoteSession } from './remoteSession';

function fixture() {
  const socket = { connected: true, on: vi.fn(), off: vi.fn(), timeout: vi.fn() };
  socket.timeout.mockReturnValue(socket);
  socket.emit = vi.fn((event, payload, callback) => callback(null, { ok: true, released: true }));
  const session = new RemoteSession(socket, 'm', { sessionId: 's' });
  const view = { version: 2, matchId: 'm', revision: 1, viewerSeat: 0, players: [], phase: 'ACTION',
    decision: { id: 'd', actions: [] }, serverNow: 100,
    presentation: { batchId: 'b', revision: 1, decisionId: 'd', phase: 'ACTION',
      canAck: true, requiredSeats: [0], notBefore: 1000, capAt: 1000 } };
  session.accept(view);
  return { socket, session, view: session.getSnapshot() };
}

describe('remote presentation completion receipt', () => {
  it('sends only batch identity, without a client duration or deadline', async () => {
    const { socket, session, view } = fixture();
    await session.presentationReady(view);
    expect(socket.emit.mock.calls[0].slice(0, 2)).toEqual(['presentationReady', {
      version: 2, matchId: 'm', revision: 1, decisionId: 'd', phase: 'ACTION', batchId: 'b',
    }]);
    await session.presentationReady(view);
    expect(socket.emit).toHaveBeenCalledTimes(1);
  });
  it.each(['observer', 'wrongSeat', 'oldRevision', 'oldDecision', 'oldPhase', 'released'])('does not ACK a %s view', async kind => {
    const { socket, session, view } = fixture();
    const next = structuredClone(view);
    if (kind === 'observer') next.viewerSeat = null;
    if (kind === 'wrongSeat') next.viewerSeat = 1;
    if (kind === 'oldRevision') next.presentation.revision = 0;
    if (kind === 'oldDecision') next.presentation.decisionId = 'other';
    if (kind === 'oldPhase') next.presentation.phase = 'DRAW_REVEAL';
    if (kind === 'released') next.presentation.canAck = false;
    session.accept(next);
    await session.presentationReady();
    expect(socket.emit).not.toHaveBeenCalled();
  });
  it('retries an uncertain receipt with the same batch and ignores stale snapshots', async () => {
    const { socket, session, view } = fixture();
    socket.emit.mockImplementationOnce((event, payload, callback) => callback(new Error('timeout')));
    await expect(session.presentationReady()).rejects.toMatchObject({ uncertain: true });
    await session.presentationReady();
    expect(socket.emit.mock.calls[0][1]).toEqual(socket.emit.mock.calls[1][1]);
    session.accept({ ...view, revision: 2 });
    await session.presentationReady(view);
    expect(socket.emit).toHaveBeenCalledTimes(2);
  });
});
