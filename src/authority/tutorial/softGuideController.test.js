import { describe, expect, it, vi } from 'vitest';
import { createSoftGuideController } from './softGuideController';
import { createTutorialRecord } from './fixtures';
import { dispatchOffline } from '../../../packages/rules/src/offline';
import { projectMatch } from '../../../packages/rules/src/authority/view';
import { migratedActions } from '../../../packages/rules/src/authority/coverage';
function view(props = {}) { return { viewerSeat: 0, players: [{ seat: 0, hp: 7 }], decision: { actions: [{ type: 'turn.rest' }] }, ...props }; }
describe('authority soft-guide pause ownership', () => {
  it('uses the real ordinary rest action and public flipped state for both lessons', () => {
    let record = createTutorialRecord('hunter', { now: 0 }); record.state.players[0].hp = 7;
    const snapshot = () => projectMatch(record, { permission: 'player', seat: 0 }, { actions: migratedActions,
      handleForCard: (seat, id) => `local:${seat}:${id}` });
    const session = { setPaused: vi.fn() }, guide = createSoftGuideController(session);
    expect(guide.update(snapshot(), { offline: true, busy: false })).toBe('rest'); guide.close();
    record = dispatchOffline(record, 0, { type: 'turn.rest', payload: {} }, { now: 0 });
    expect(snapshot().players[0].isResting).toBe(true);
    expect(guide.update(snapshot(), { offline: true, busy: true })).toBeNull();
    expect(guide.update(snapshot(), { offline: true, busy: false })).toBe('flip');
  });
  it('waits for presentation, pauses once, remains actionable and resumes on close', () => {
    const session = { setPaused: vi.fn() }, guide = createSoftGuideController(session);
    expect(guide.update(view(), { offline: true, busy: true })).toBeNull();
    expect(session.setPaused).not.toHaveBeenCalled();
    expect(guide.update(view(), { offline: true, busy: false })).toBe('rest');
    expect(guide.update(view({ status: { paused: true } }), { offline: true, busy: false })).toBe('rest');
    expect(session.setPaused.mock.calls).toEqual([[true]]);
    guide.close(); expect(session.setPaused.mock.calls).toEqual([[true], [false]]);
    expect(guide.update(view(), { offline: true, busy: false })).toBeNull();
  });
  it.each([{ offline: false }, { tutorial: {} }, { gameOver: {} }, { status: { paused: true } }])('never steals another pause or online/tutorial state: %j', options => {
    const session = { setPaused: vi.fn() }, guide = createSoftGuideController(session);
    expect(guide.update(view(options), { offline: options.offline !== false, busy: false })).toBeNull();
    guide.dispose(); expect(session.setPaused).not.toHaveBeenCalled();
  });
  it('queues a public flip during animation and releases only its own pause on unmount', () => {
    const session = { setPaused: vi.fn() }, guide = createSoftGuideController(session);
    guide.update(view({ players: [{ seat: 0, hp: 10 }] }), { offline: true, busy: false });
    const flipped = view({ players: [{ seat: 0, hp: 10, isResting: true }], decision: { actions: [] } });
    expect(guide.update(flipped, { offline: true, busy: true })).toBeNull();
    expect(guide.update(flipped, { offline: true, busy: false })).toBe('flip');
    guide.dispose(); guide.dispose(); expect(session.setPaused.mock.calls).toEqual([[true], [false]]);
  });
});
