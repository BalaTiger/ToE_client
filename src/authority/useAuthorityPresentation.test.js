import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthorityPresentation } from './useAuthorityPresentation';

const harness = vi.hoisted(() => ({ slots: [], cursor: 0, pending: [], dirty: false }));
vi.mock('react', () => {
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const effect = (fn, deps) => {
    const i = harness.cursor++;
    if (!same(harness.slots[i]?.deps, deps)) {
      const old = harness.slots[i];
      harness.slots[i] = { deps, cleanup: old?.cleanup };
      harness.pending.push(() => {
        harness.slots[i].cleanup?.();
        harness.slots[i].cleanup = fn();
      });
    }
  };
  const memo = (fn, deps) => {
    const i = harness.cursor++;
    if (!same(harness.slots[i]?.deps, deps)) harness.slots[i] = { deps, value: fn() };
    return harness.slots[i].value;
  };
  return {
    useState(initial) {
      const i = harness.cursor++;
      if (!harness.slots[i]) harness.slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      const slot = harness.slots[i];
      slot.set ||= next => {
        const value = typeof next === 'function' ? next(slot.value) : next;
        if (!Object.is(value, slot.value)) { slot.value = value; harness.dirty = true; }
      };
      return [slot.value, slot.set];
    },
    useRef(initial) { return harness.slots[harness.cursor++] ||= { current: initial }; },
    useEffect: effect, useLayoutEffect: effect, useMemo: memo,
    useCallback: (fn, deps) => memo(() => fn, deps),
  };
});
vi.mock('../hooks/useDamageAnimationEffects', () => ({ useDamageAnimationEffects: () => ({ clearDamageAnimations() {} }) }));
vi.mock('../hooks/useSkillAnimationEffects', () => ({ useSkillAnimationEffects: () => ({ clearSkillAnimations() {} }) }));
vi.mock('../hooks/useCardTransferAnimationEffects', () => ({ useCardTransferAnimationEffects: () => ({ clearCardTransferAnimations() {} }) }));
vi.mock('../hooks/useAnimationAudioEffects', () => ({ useAnimationAudioEffects() {} }));
vi.mock('../hooks/useGlobalShakeEffects', () => ({ useGlobalShakeEffects: () => ({ sceneShake: null }) }));

function input(revision, events = []) {
  const players = [{ id: 0, seat: 0, name: '本人', hp: 10, san: 10, hand: [], damageLinks: [] },
    { id: 1, seat: 1, name: '对方', hp: 10, san: 10, hand: [], damageLinks: [] }];
  return { view: { matchId: 'm', revision, viewerSeat: 0, players, events, decision: { actions: [], deadline: 20000 } },
    model: { gs: { players, discard: [], currentTurn: 1, phase: 'ACTION' }, me: players[0], toDisplaySeat: seat => seat }, paused: false };
}
function mount(initial) {
  let props = initial, result;
  function flush(next = props) {
    props = next;
    let passes = 0;
    do {
      harness.cursor = 0; harness.dirty = false;
      // eslint-disable-next-line react-hooks/rules-of-hooks -- deterministic hook harness models each render, including queue effect rerenders
      result = useAuthorityPresentation(props);
      const effects = harness.pending.splice(0);
      effects.forEach(run => run());
      if (++passes > 30) throw Error('Hook did not settle');
    } while (harness.dirty);
    return result;
  }
  flush();
  return { flush, get current() { return result; }, nextTimer() { vi.advanceTimersToNextTimer(); return flush(); } };
}
beforeEach(() => {
  harness.slots = []; harness.pending = []; harness.cursor = 0; harness.dirty = false;
  vi.useFakeTimers(); vi.setSystemTime(0);
});
afterEach(() => { harness.slots.forEach(slot => slot?.cleanup?.()); vi.useRealTimers(); });

describe('authority original queue drain', () => {
  it.each(['peeks', 'privateReveals', 'litDeck'])('plays new damage before ACK when the next revision expires %s', grant => {
    const session = { presentationReady: vi.fn().mockResolvedValue({ ok: true }) };
    const initial = { ...input(0), session };
    initial.view[grant] = [{ id: 'expired-grant', name: 'EXPIRED-PRIVATE-FACE' }];
    const hook = mount(initial);
    const next = { ...input(1, [{ id: 'grant-expiry-loss', type: 'statChanged', seat: 0,
      kind: 'HP_LOSS', fromHp: 10, hp: 7, fromSan: 10, san: 10 }]), session };
    next.view[grant] = [];
    next.model.gs.players[0].hp = 7;
    next.view.phase = 'ACTION'; next.view.decision.id = 'after-grant'; next.view.serverNow = 0;
    next.view.presentation = { batchId: 'grant-expiry-batch', revision: 1, decisionId: 'after-grant',
      phase: 'ACTION', requiredSeats: [0], canAck: true, notBefore: 1000 };

    hook.flush(next);
    expect(hook.current.error).toBeNull();
    expect(hook.current.busy).toBe(true);
    expect(hook.current.anim.type).toBe('HP_DAMAGE');
    expect(hook.current.displayStats[0].hp).toBe(10);
    expect(hook.current.gs._authorityRevision).toBe(0);
    expect(session.presentationReady).not.toHaveBeenCalled();
    expect(JSON.stringify(hook.current.anim)).not.toContain('EXPIRED-PRIVATE-FACE');

    for (let i = 0; hook.current.busy && i < 20; i++) {
      expect(session.presentationReady).not.toHaveBeenCalled();
      hook.nextTimer();
    }
    expect(hook.current.busy).toBe(false);
    expect(hook.current.displayStats[0].hp).toBe(7);
    expect(hook.current.gs._authorityRevision).toBe(1);
    expect(hook.current.visibleLog).toHaveLength(1);
    expect(session.presentationReady).toHaveBeenCalledExactlyOnceWith(next.view);
    expect(JSON.stringify(hook.current)).not.toContain('EXPIRED-PRIVATE-FACE');
    hook.flush(next);
    expect(hook.current.anim).toBeNull();
    expect(session.presentationReady).toHaveBeenCalledTimes(1);
  });

  it('exposes the original god panel burst and expiry fade while their explicit cues play', () => {
    const playGodHighlightSound = vi.fn();
    const hook = mount({ ...input(0), audio: { playGodHighlightSound } });
    hook.flush({ ...input(1, [{ id: 'faith', type: 'godStatusChanged', seat: 0, godKey: 'CTH', godLevel: 1 }]),
      audio: { playGodHighlightSound } });
    expect(hook.current.godHighlightPanelBursts[0]).toMatchObject({ godKey: 'CTH' });
    expect(playGodHighlightSound).toHaveBeenCalledTimes(1);
    for (let i = 0; hook.current.busy && i < 10; i++) hook.nextTimer();
    expect(hook.current.godHighlightPanelBursts).toEqual({});
    hook.flush(input(2, [{ id: 'expiry', type: 'damageLinkExpired', pair: [0, 1] }]));
    expect(hook.current.damageLinkGhosts[0]).toMatchObject({ mode: 'fade', a: 0, b: 1 });
    expect(hook.current.anim.durationMs).toBe(720);
  });

  it('holds a fresh opening until the original role reveal finishes, then plays its explicit events once', () => {
    const first = input(0, [{ id: 'opening-turn', type: 'turnStarted', seat: 0 },
      { id: 'opening-draw', type: 'cardRevealed', seat: 0, reason: 'draw', sourcePile: 'deck',
        card: { id: 'opening-card', name: '公开首抽' } }]);
    first.freshStart = true; first.openingBlocked = true;
    const hook = mount(first);
    expect(hook.current.busy).toBe(true);
    expect(hook.current.anim).toBeNull();
    expect(hook.current.gs.drawReveal).toBeNull();
    vi.advanceTimersByTime(2500);
    hook.flush({ ...first, openingBlocked: false });
    expect(hook.current.anim.type).toBe('YOUR_TURN');
    const types = new Set();
    for (let i = 0; hook.current.busy && i < 20; i++) {
      types.add(hook.current.anim?.type); hook.nextTimer();
    }
    expect(types.has('DRAW_CARD')).toBe(true);
    expect(hook.current.gs._authorityRevision).toBe(0);
    expect(hook.current.visibleLog).toHaveLength(2);
    hook.flush({ ...first, openingBlocked: false });
    expect(hook.current.anim).toBeNull();
    expect(hook.current.visibleLog).toHaveLength(2);
  });

  it('does not replay opening history on a resumed or reconnected baseline', () => {
    const first = input(0, [{ id: 'opening-turn', type: 'turnStarted', seat: 0 }]);
    const hook = mount(first);
    expect(hook.current.busy).toBe(false);
    expect(hook.current.anim).toBeNull();
    expect(hook.current.visibleLog).toHaveLength(0);
  });

  it('releases only after the matching visual revision commits and catches up within its fixed cap', async () => {
    const session = { presentationReady: vi.fn().mockResolvedValue({ ok: true }) };
    const hook = mount({ ...input(0), session });
    const next = { ...input(1, [
      { id: 'loss', type: 'statChanged', seat: 0, kind: 'HP_LOSS', fromHp: 10, hp: 7, fromSan: 10, san: 10 },
      { id: 'heal', type: 'statChanged', seat: 0, kind: 'HP_GAIN', fromHp: 7, hp: 8, fromSan: 10, san: 10 },
    ]), session };
    next.model.gs.players[0].hp = 8;
    next.view.phase = 'ACTION'; next.view.decision.id = 'd'; next.view.serverNow = 0;
    next.view.presentation = { batchId: 'b', revision: 1, decisionId: 'd', phase: 'ACTION',
      requiredSeats: [0], canAck: true, notBefore: 100 };
    hook.flush(next);
    expect(hook.current.displayStats[0].hp).toBe(10);
    expect(session.presentationReady).not.toHaveBeenCalled();
    const observed = [];
    for (let i = 0; hook.current.busy && i < 20; i++) {
      hook.nextTimer(); observed.push(hook.current.displayStats[0].hp);
    }
    expect(observed).toContain(7);
    expect(hook.current.displayStats[0].hp).toBe(8);
    expect(hook.current.gs._authorityRevision).toBe(1);
    expect(session.presentationReady).toHaveBeenCalledTimes(1);
    expect(session.presentationReady).toHaveBeenCalledWith(next.view);
    expect(Date.now()).toBeLessThanOrEqual(105);
    expect(hook.current.visibleLog).toHaveLength(2);
  });

  it('fast-forwards buffered older revisions in order after the server cap', () => {
    const hook = mount(input(0));
    const events = [];
    for (let revision = 1; revision <= 8; revision++) {
      events.push({ id: `cap-turn-${revision}`, type: 'turnStarted', seat: revision % 2 });
      const next = input(revision, [...events]);
      next.view.serverNow = 100;
      next.view.presentation = { notBefore: 100 };
      hook.flush(next);
    }
    for (let i = 0; hook.current.busy && i < 40; i++) hook.nextTimer();
    expect(hook.current.busy).toBe(false);
    expect(hook.current.gs._authorityRevision).toBe(8);
    expect(hook.current.visibleLog).toHaveLength(8);
    expect(Date.now()).toBeLessThan(100);
  });

  it('does not wait past the cap for a missing cosmetic death snapshot', () => {
    const hook = mount(input(0));
    const next = input(1, [{ id: 'death', type: 'statChanged', seat: 1, kind: 'PLAYER_DEFEATED',
      fromHp: 0, hp: 0, fromSan: 10, san: 10 }]);
    next.model.gs.players[1].isDead = true;
    next.model.gs.players[1].hp = 0;
    next.view.serverNow = 0; next.view.presentation = { notBefore: 100 };
    hook.flush(next);
    expect(hook.current.anim.type).toBe('GUILLOTINE');
    for (let i = 0; hook.current.busy && i < 10; i++) hook.nextTimer();
    expect(hook.current.busy).toBe(false);
    expect(hook.current.gs.players[1].isDead).toBe(true);
    expect(Date.now()).toBe(100);
  });

  it('commits a long expired transaction without one throttled timer per step', () => {
    const hook = mount(input(0));
    const next = input(1, Array.from({ length: 256 }, (_, index) => ({
      id: `long-${index}`, type: 'turnStarted', seat: index % 2,
    })));
    next.view.serverNow = 100; next.view.presentation = { notBefore: 100 };
    hook.flush(next);
    expect(hook.current.busy).toBe(false);
    expect(hook.current.gs._authorityRevision).toBe(1);
    expect(hook.current.visibleLog).toHaveLength(256);
    expect(Date.now()).toBe(0);
  });

  it('buffers a later revision, commits the active queue first, then drains exactly once', () => {
    const hook = mount(input(0));
    const first = { id: 'first', type: 'restRolled', seat: 1, d1: 2, d2: 5 };
    const second = { id: 'second', type: 'turnStarted', seat: 0 };
    hook.flush(input(1, [first]));
    expect(hook.current.anim.type).toBe('DICE_ROLL');
    expect(hook.current.gs._authorityRevision).toBe(0);
    vi.advanceTimersByTime(25);
    hook.flush(input(2, [first, second]));
    expect(hook.current.anim.type).toBe('DICE_ROLL');
    expect(hook.current.gs._authorityRevision).toBe(0);
    for (let steps = 0; hook.current.anim?.type !== 'YOUR_TURN' && steps < 10; steps++) hook.nextTimer();
    expect(hook.current.gs._authorityRevision).toBe(1);
    expect(hook.current.anim.type).toBe('YOUR_TURN');
    expect(hook.current.busy).toBe(true);
    for (let steps = 0; hook.current.busy && steps < 10; steps++) hook.nextTimer();
    expect(hook.current.gs._authorityRevision).toBe(2);
    expect(hook.current.busy).toBe(false);
    expect(hook.current.visibleLog).toHaveLength(2);
    hook.flush(input(2, [first, second]));
    expect(hook.current.anim).toBeNull();
    expect(hook.current.visibleLog).toHaveLength(2);
  });

  it('preserves original playback speed for sessions without a server presentation allowance', () => {
    const hook = mount(input(0));
    const events = [];
    for (let revision = 1; revision <= 8; revision++) {
      events.push({ id: `turn-${revision}`, type: 'turnStarted', seat: revision % 2 });
      vi.advanceTimersByTime(25);
      hook.flush(input(revision, [...events]));
    }
    const decisionAt = Date.now();
    const human = input(9, [...events]);
    human.view.decision = { actions: [{ type: 'draw.keep' }], deadline: decisionAt + 20000 };
    hook.flush(human);
    let iterations = 0;
    while (hook.current.busy && iterations++ < 50) hook.nextTimer();
    expect(hook.current.busy).toBe(false);
    expect(Date.now()).toBeGreaterThan(human.view.decision.deadline);
    expect(hook.current.gs._authorityRevision).toBe(9);
    expect(hook.current.visibleLog).toHaveLength(8);
  });
});
