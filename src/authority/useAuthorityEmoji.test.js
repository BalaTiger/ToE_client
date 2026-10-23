import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthorityEmoji } from './useAuthorityEmoji';
import { getPlayerAreaAnchorCenter } from '../utils/dom';

const hooks = vi.hoisted(() => ({ state: vi.fn(), ref: vi.fn(), effect: vi.fn() }));
vi.mock('react', async original => ({ ...await original(), useState: (...args) => hooks.state(...args),
  useRef: (...args) => hooks.ref(...args), useEffect: (...args) => hooks.effect(...args), useCallback: callback => callback }));
vi.mock('../utils/dom', () => ({ getPlayerAreaAnchorCenter: vi.fn(() => ({ x: 300, y: 200 })) }));

function mountHook(props) {
  const states = [], refs = [], effects = [];
  let stateIndex, refIndex, effectIndex;
  hooks.state.mockImplementation(initial => {
    const index = stateIndex++;
    if (!(index in states)) states[index] = initial;
    return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
  });
  hooks.ref.mockImplementation(initial => refs[refIndex++] ||= { current: initial });
  hooks.effect.mockImplementation((setup, deps) => {
    const index = effectIndex++, previous = effects[index];
    if (previous && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return;
    previous?.cleanup?.(); effects[index] = { setup, deps };
  });
  function EmojiHarness() { return useAuthorityEmoji(props); }
  return {
    render(update = {}) {
      props = { ...props, ...update }; stateIndex = refIndex = effectIndex = 0;
      const value = EmojiHarness();
      for (const effect of effects) if (effect.setup) { effect.cleanup = effect.setup(); effect.setup = null; }
      return value;
    },
    unmount() { effects.forEach(effect => effect.cleanup?.()); },
  };
}
let hook, socket, listener, sent, report;
beforeEach(() => {
  vi.clearAllMocks(); listener = null; sent = []; report = vi.fn();
  vi.stubGlobal('window', { innerWidth: 1000, innerHeight: 700 });
  socket = { connected: true,
    on: vi.fn((_event, receive) => { listener = receive; }),
    off: vi.fn((_event, receive) => { if (listener === receive) listener = null; }),
    timeout() { return this; }, emit: vi.fn((...args) => sent.push(args)) };
  hook = mountHook({ session: { socket }, offline: false, report,
    view: { viewerSeat: 2, players: [{ seat: 0 }, { seat: 1 }, { seat: 2 }] }, toDisplaySeat: seat => (seat + 1) % 3 });
});
afterEach(() => { hook.unmount(); vi.unstubAllGlobals(); });

describe('authority emoji presentation', () => {
  it('sends only the chosen whitelist emoji and animates only after the server echo', () => {
    const emoji = hook.render(); emoji.handleEmojiClick('👍');
    expect(sent[0].slice(0, 2)).toEqual(['emojiSend', { emoji: '👍' }]);
    expect(hook.render().flyingEmojis).toEqual([]);
    listener({ fromSeat: 1, emoji: '👍' });
    expect(getPlayerAreaAnchorCenter).toHaveBeenCalledWith(2);
    expect(hook.render().flyingEmojis).toEqual([expect.objectContaining({ emoji: '👍', startX: 300, startY: 200,
      endX: 500, endY: 315, durationMs: 900 })]);
    sent[0][2](null, { ok: true }); expect(report).not.toHaveBeenCalled();
  });
  it('rejects invalid seats, extra wire fields and arbitrary text, and never transmits them', () => {
    const emoji = hook.render();
    for (const value of ['', 'arbitrary text', '<script>', ['👍']]) emoji.handleEmojiClick(value);
    for (const message of [{ fromSeat: 99, emoji: '👍' }, { fromSeat: 0, emoji: 'unknown' },
      { fromSeat: 0, emoji: '👍', uuid: 'secret' }, { fromSeat: '0', emoji: '👍' }, null]) listener(message);
    expect(sent).toEqual([]); expect(hook.render().flyingEmojis).toEqual([]);
  });
  it('lets observers receive but not send and hides all emoji controls offline', () => {
    let emoji = hook.render({ view: { viewerSeat: null, players: [{ seat: 0 }] } });
    expect(emoji.enabled).toBe(false); emoji.handleEmojiClick('👍'); expect(sent).toEqual([]);
    listener({ fromSeat: 0, emoji: '👍' }); expect(hook.render().flyingEmojis).toHaveLength(1);
    emoji = hook.render({ offline: true });
    expect(emoji.enabled).toBe(false); expect(emoji.flyingEmojis).toEqual([]); expect(listener).toBeNull();
  });
  it('caps live flights, removes finished ones and cleans up the socket listener', () => {
    hook.render(); for (let index = 0; index < 80; index++) listener({ fromSeat: 0, emoji: '🎉' });
    const emoji = hook.render(); expect(emoji.flyingEmojis).toHaveLength(64);
    emoji.onFlyingEmojiDone(emoji.flyingEmojis[0].id); expect(hook.render().flyingEmojis).toHaveLength(63);
    hook.unmount(); expect(listener).toBeNull();
  });
  it('shows real transport and rate failures without fabricating an optimistic emoji', () => {
    const emoji = hook.render(); socket.connected = false; emoji.handleEmojiClick('👍');
    expect(sent).toEqual([]); expect(report.mock.calls[0][0].message).toContain('重新连接');
    socket.connected = true; emoji.handleEmojiClick('👍');
    sent[0][2](null, { ok: false, error: 'rate_limited' }); expect(report.mock.calls[1][0].message).toContain('过于频繁');
    emoji.handleEmojiClick('👍'); sent[1][2](new Error('timeout')); expect(report.mock.calls[2][0].message).toContain('超时');
    expect(hook.render().flyingEmojis).toEqual([]);
    hook.unmount(); sent[1][2](new Error('late')); expect(report).toHaveBeenCalledTimes(3);
  });
});
