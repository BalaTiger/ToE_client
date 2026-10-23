import { Children } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuthorityApp from './AuthorityApp';
import { AuthorityLobbyPresentation } from './presentation/AuthorityLobbyPresentation';
import AuthorityBattlePresentation from './presentation/AuthorityBattlePresentation';
import { RoleSelectionDialog } from '../components/battle/RoleSelectionDialog';
import { loadOfflineSave } from '../../packages/rules/src/offline';
import { loadSocketIO } from '../utils/socketIoClient';
import { TutorialOverlay } from '../components/lobby';
import { TUTORIAL_DONE_KEY, TUTORIAL_SAVE_KEY } from './tutorial/TutorialSession';

const mocks = vi.hoisted(() => ({
  state: vi.fn(), ref: vi.fn(), effect: vi.fn(), callback: vi.fn(), external: vi.fn(),
  offline: [], remote: [], tutorials: [], preferences: { gamma: 1, musicVolume: 0.5, sfxVolume: 0.7 },
  audio: { noteUserGesture: vi.fn(), playOpenSound: vi.fn(), playCloseSound: vi.fn() },
}));
vi.mock('react', async original => ({ ...await original(), useState: (...args) => mocks.state(...args),
  useRef: (...args) => mocks.ref(...args), useEffect: (...args) => mocks.effect(...args),
  useCallback: (...args) => mocks.callback(...args), useSyncExternalStore: (...args) => mocks.external(...args) }));
vi.mock('../components/GlobalStyles', () => ({ GLOBAL_STYLES: '' }));
vi.mock('../components/battle/RoleSelectionDialog', () => ({ RoleSelectionDialog: () => null }));
vi.mock('../components/lobby', () => ({ TutorialOverlay: () => null }));
vi.mock('./tutorial/TutorialSession', () => ({ TUTORIAL_DONE_KEY: 'cthulhu_tutorial_v2_done', TUTORIAL_SAVE_KEY: 'toe.tutorial.v2',
  loadTutorialSave: storage => JSON.parse(storage.getItem('toe.tutorial.v2')), TutorialSession: class {
    constructor(options) {
      this.options = options; this.isTutorial = true; this.snapshot = { matchId: 'offline:tutorial:treasure', revision: 0, tutorial: {}, status: {} };
      this.subscribe = () => () => {}; this.getSnapshot = () => this.snapshot;
      this.tickTime = vi.fn(); this.stepBot = vi.fn(); this.presentationStatus = vi.fn(); this.complete = vi.fn(); mocks.tutorials.push(this);
    }
  } }));
vi.mock('./presentation/AuthorityLobbyPresentation', () => ({ AuthorityLobbyPresentation: () => null }));
vi.mock('./presentation/AuthorityBattlePresentation', () => ({ default: () => null }));
vi.mock('../hooks/useGamePreferences', () => ({ useGamePreferences: () => mocks.preferences }));
vi.mock('../hooks/useGameAudio', () => ({ useGameAudio: () => mocks.audio }));
vi.mock('../utils/runtime', () => ({ FIRST_BATTLE_DONE_KEY: 'first-battle',
  getRuntimeServerUrl: () => 'http://127.0.0.1:3002', getRuntimeSocketPath: () => '/socket.io' }));
vi.mock('../utils/socketIoClient', () => ({ loadSocketIO: vi.fn() }));
vi.mock('../../packages/rules/src/offline.js', () => ({ loadOfflineSave: vi.fn() }));
vi.mock('./offlineSession', () => ({ OfflineSession: class {
  constructor(options) {
    this.freshStart = options.freshStart;
    this.options = options; this.snapshot = { matchId: options.record?.id || options.id, expansionKey: options.expansionKey, status: { paused: false } };
    this.subscribe = vi.fn(() => () => {}); this.getSnapshot = () => this.snapshot;
    this.tickTime = vi.fn(); this.stepBot = vi.fn(); this.setPresentationBusy = vi.fn(); mocks.offline.push(this);
  }
} }));
vi.mock('./remoteSession', () => ({ RemoteSession: class {
  constructor(socket, matchId, options) {
    this.socket = socket; this.matchId = matchId; this.options = options; this.snapshot = null;
    this.subscribe = vi.fn(() => () => {}); this.getSnapshot = () => this.snapshot;
    this.retry = vi.fn(async () => ({ ok: true })); this.dispose = vi.fn(); mocks.remote.push(this);
  }
} }));

function storage() {
  const entries = new Map();
  return { getItem: vi.fn(key => entries.get(key) ?? null), setItem: vi.fn((key, value) => entries.set(key, String(value))), removeItem: vi.fn(key => entries.delete(key)) };
}
function collect(node, result = []) {
  if (!node?.props) return result;
  result.push(node); Children.toArray(node.props.children).forEach(child => collect(child, result)); return result;
}
function find(tree, type) { return collect(tree).find(node => node.type === type); }
function mount() {
  const slots = [], pending = new Set();
  let cursor;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  mocks.state.mockImplementation(initial => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
    slots[index].set ||= value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; };
    return [slots[index].value, slots[index].set];
  });
  mocks.ref.mockImplementation(initial => slots[cursor++] ||= { current: initial });
  mocks.callback.mockImplementation((callback, deps) => {
    const index = cursor++;
    if (!same(slots[index]?.deps, deps)) slots[index] = { deps, callback };
    return slots[index].callback;
  });
  mocks.effect.mockImplementation((setup, deps) => {
    const index = cursor++;
    if (same(slots[index]?.deps, deps)) return;
    slots[index]?.cleanup?.(); slots[index] = { deps, setup }; pending.add(index);
  });
  mocks.external.mockImplementation((_subscribe, getSnapshot) => getSnapshot());
  return {
    render() {
      cursor = 0; const tree = AuthorityApp();
      for (const index of pending) slots[index].cleanup = slots[index].setup();
      pending.clear(); return tree;
    },
    unmount() { slots.forEach(slot => slot.cleanup?.()); },
  };
}
function socketFixture() {
  const sockets = [], requests = [], responses = new Map();
  const io = vi.fn((url, options) => {
    const listeners = new Map();
    const socket = { url, options, connected: false,
      on(event, handler) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(handler); return this; },
      once(event, handler) { const wrapped = (...args) => { this.off(event, wrapped); handler(...args); }; return this.on(event, wrapped); },
      off(event, handler) { listeners.get(event)?.delete(handler); return this; },
      notify(event, payload) { [...(listeners.get(event) || [])].forEach(handler => handler(payload)); },
      connect() { this.connected = true; this.notify('connect'); },
      disconnect: vi.fn(function () { this.connected = false; }),
      timeout() { return this; },
      emit(event, payload, ack) { requests.push({ event, payload }); ack(null, responses.get(event) || { ok: true, result: {} }); },
    };
    sockets.push(socket); return socket;
  });
  loadSocketIO.mockResolvedValue(io);
  return { sockets, requests, responses, io };
}
let app, transport;
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); mocks.offline.length = 0; mocks.remote.length = 0; mocks.tutorials.length = 0;
  vi.stubGlobal('window', { localStorage: storage(), sessionStorage: storage() });
  window.localStorage.setItem(TUTORIAL_DONE_KEY, '1');
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ identityToken: 'signed-token' }) })));
  loadOfflineSave.mockReturnValue(null); transport = socketFixture(); app = mount();
});
afterEach(() => { app.unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function lobby() { return find(app.render(), AuthorityLobbyPresentation).props; }
function battle() { return find(app.render(), AuthorityBattlePresentation).props; }
async function onlineMatch() {
  await lobby().onCreateRoom({ name: '旅者', botCount: 0 });
  transport.sockets[0].notify('room', { code: 'ABC123', phase: 'playing', matchId: 'match-1' });
  const remote = mocks.remote[0]; remote.snapshot = { matchId: 'match-1', revision: 1, status: { paused: false } };
  return remote;
}

describe('authority root controller', () => {
  it('offers the original tutorial on first entry, permits skipping, and preserves the first-battle preference', () => {
    window.localStorage.removeItem(TUTORIAL_DONE_KEY);
    lobby().onOffline({});
    expect(find(app.render(), RoleSelectionDialog)).toBeUndefined();
    find(app.render(), TutorialOverlay).props.onComplete();
    expect(window.localStorage.getItem(TUTORIAL_DONE_KEY)).toBe('1');
    expect(window.localStorage.getItem('first-battle')).toBeNull();
    expect(find(app.render(), RoleSelectionDialog)).toBeDefined();
  });
  it('starts and resumes a separate lesson, forwards presentation settlement, then opens a formal role choice', () => {
    window.localStorage.removeItem(TUTORIAL_DONE_KEY);
    window.localStorage.setItem(TUTORIAL_SAVE_KEY, JSON.stringify({ chapter: 'hunter' }));
    lobby().onOffline({}); find(app.render(), TutorialOverlay).props.onResume();
    const tutorial = mocks.tutorials[0]; expect(tutorial.options.saved).toEqual({ chapter: 'hunter' });
    expect(mocks.offline).toHaveLength(0); expect(transport.sockets).toHaveLength(0);
    const meta = { matchId: tutorial.snapshot.matchId, revision: 0 };
    battle().onPresentationBusyChange(false, meta); expect(tutorial.presentationStatus).toHaveBeenCalledWith(false, meta);
    tutorial.snapshot = { ...tutorial.snapshot, gameOver: { winner: '寻宝者' } };
    app.render(); vi.advanceTimersByTime(121); expect(tutorial.stepBot).toHaveBeenCalled();
    battle().onCompleteTutorial(); expect(tutorial.complete).toHaveBeenCalled();
    expect(find(app.render(), RoleSelectionDialog)).toBeDefined();
  });
  it('mounts the original presentation and chooses a role before constructing a fresh offline session', () => {
    const home = lobby();
    expect(home.preferences).toBe(mocks.preferences); expect(home.audio).toBe(mocks.audio);
    home.onOffline({ resume: false, expansionKey: '群星的呼唤' });
    expect(mocks.offline).toHaveLength(0);
    find(app.render(), RoleSelectionDialog).props.onSelect('追猎者');
    expect(mocks.offline[0].options).toMatchObject({ selectedRole: '追猎者', expansionKey: '地神的潜影', storage: window.localStorage });
    expect(mocks.offline[0].freshStart).toBe(true);
    expect(window.localStorage.getItem('first-battle')).toBe('1');
    expect(battle().session).toBe(mocks.offline[0]); expect(battle().offline).toBe(true);
    expect(mocks.external).toHaveBeenLastCalledWith(mocks.offline[0].subscribe, mocks.offline[0].getSnapshot, mocks.offline[0].getSnapshot);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('restores only the v2 save without a new role selection', () => {
    const record = { id: 'offline:saved' }; loadOfflineSave.mockReturnValue(record);
    lobby().onOffline({ resume: true });
    expect(loadOfflineSave).toHaveBeenCalledWith(window.localStorage);
    expect(mocks.offline[0].options.record).toBe(record);
    expect(mocks.offline[0].freshStart).toBe(false);
    expect(find(app.render(), RoleSelectionDialog)).toBeUndefined();
    expect(battle().view.matchId).toBe('offline:saved');
  });
  it('keeps a missing-save failure visible and allows cancelling role selection', () => {
    expect(() => lobby().onOffline({ resume: true })).toThrow('没有新格式单机存档');
    expect(lobby().error).toBe('没有新格式单机存档');
    lobby().onOffline({ resume: false });
    find(app.render(), RoleSelectionDialog).props.onCancel();
    expect(find(app.render(), RoleSelectionDialog)).toBeUndefined(); expect(mocks.offline).toHaveLength(0);
  });
  it('ticks offline clocks but holds AI decisions during presentation and pause, then resumes', () => {
    lobby().onOffline({ resume: false }); find(app.render(), RoleSelectionDialog).props.onSelect('random');
    const session = mocks.offline[0];
    battle().onPresentationBusyChange(true); app.render(); vi.advanceTimersByTime(240);
    expect(session.setPresentationBusy).toHaveBeenCalledWith(true);
    expect(session.tickTime).toHaveBeenCalledTimes(2); expect(session.stepBot).not.toHaveBeenCalled();
    battle().onPresentationBusyChange(false); session.snapshot = { ...session.snapshot, status: { paused: true } };
    expect(session.setPresentationBusy).toHaveBeenCalledWith(false);
    app.render(); vi.advanceTimersByTime(240); expect(session.stepBot).not.toHaveBeenCalled();
    session.snapshot = { ...session.snapshot, status: { paused: false } };
    app.render(); vi.advanceTimersByTime(120); expect(session.stepBot).toHaveBeenCalledTimes(1);
    battle().onExit(); app.render(); const ticks = session.tickTime.mock.calls.length;
    vi.advanceTimersByTime(1000); expect(session.tickTime).toHaveBeenCalledTimes(ticks);
  });
  it('uses signed v2 lobby APIs for names, public rooms, privacy, ready and start', async () => {
    const rooms = [{ code: 'ABC123', count: 2, max: 12 }]; transport.responses.set('listRooms', { ok: true, result: { rooms } });
    expect(await lobby().onListRooms()).toEqual(rooms);
    await lobby().onCreateRoom({ name: '同伴', botCount: 2 });
    await lobby().onJoinRoom({ code: 'ABC123', name: '同伴' });
    await lobby().onSetPrivacy(false); await lobby().onReady(true); await lobby().onStart();
    expect(transport.requests).toEqual([
      { event: 'listRooms', payload: {} }, { event: 'createRoom', payload: { name: '同伴', botCount: 2 } },
      { event: 'joinRoom', payload: { code: 'ABC123', name: '同伴' } }, { event: 'setPrivacy', payload: { isPrivate: false } },
      { event: 'ready', payload: { ready: true } }, { event: 'startGame', payload: {} },
    ]);
    expect(transport.io).toHaveBeenCalledTimes(1);
    expect(transport.sockets[0].options.auth).toEqual({ identityToken: 'signed-token' });
    expect(window.sessionStorage.getItem('toe.playerName.v2')).toBe('同伴');
  });
  it('rejects lobby failures to the presentation and shows server errors verbatim', async () => {
    transport.responses.set('joinRoom', { ok: false, error: 'room_unavailable' });
    await expect(lobby().onJoinRoom({ code: 'ABC123', name: '旅者' })).rejects.toThrow('room_unavailable');
    expect(lobby().error).toBe('room_unavailable'); expect(lobby().busy).toBe(false);
    transport.sockets[0].notify('roomNotice', { reason: 'not_ready_timeout' });
    expect(lobby().error).toBe('未准备超时，已被移出房间');
  });
  it('retains a remote session across same-match room updates and catches return failures without running local timers', async () => {
    const remote = await onlineMatch();
    expect(remote.options.freshStart).toBe(false);
    expect(battle().session).toBe(remote); expect(battle().offline).toBe(false);
    transport.sockets[0].notify('room', { code: 'ABC123', phase: 'playing', matchId: 'match-1' });
    expect(mocks.remote).toHaveLength(1); expect(remote.dispose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000); expect(mocks.offline).toHaveLength(0);
    transport.responses.set('returnRoom', { ok: false, error: 'match_not_finished' });
    await battle().onReturn(); expect(battle().session).toBe(remote);
    transport.sockets[0].notify('room', { code: 'ABC123', phase: 'waiting' });
    expect(lobby().room.phase).toBe('waiting'); expect(remote.dispose).toHaveBeenCalledTimes(1);
  });
  it('marks only an observed waiting-to-playing player transition as a fresh room start', async () => {
    await lobby().onCreateRoom({ name: '旅者', botCount: 0 });
    transport.sockets[0].notify('room', { code: 'ABC123', phase: 'waiting', viewerSeat: 0 });
    transport.sockets[0].notify('room', { code: 'ABC123', phase: 'playing', viewerSeat: 0, matchId: 'fresh' });
    expect(mocks.remote[0].options.freshStart).toBe(true);
  });
  it('keeps uncertain commands on the same remote session and retries the pending command', async () => {
    const remote = await onlineMatch(); battle().report(new Error('ack_uncertain'));
    const tree = app.render(), buttons = collect(tree).filter(node => node.type === 'button');
    expect(buttons.some(node => node.props.children === '返回首页重新连接')).toBe(false);
    await buttons.find(node => node.props.children === '重试同一次操作').props.onClick();
    expect(remote.retry).toHaveBeenCalledTimes(1); expect(remote.dispose).not.toHaveBeenCalled();
    expect(collect(app.render()).some(node => node.props.role === 'alert')).toBe(false);
  });
  it('leaves an observer membership and disposes its remote session after confirmation', async () => {
    await lobby().onSpectate('ABC123');
    transport.sockets[0].notify('room', { code: 'ABC123', phase: 'playing', matchId: 'watch-1', viewerSeat: null });
    const remote = mocks.remote[0];
    remote.snapshot = { matchId: 'watch-1', revision: 1, viewerSeat: null, status: { paused: false } };
    expect(battle().view.viewerSeat).toBeNull();
    await battle().onExit();
    expect(transport.requests.at(-1)).toEqual({ event: 'leaveRoom', payload: {} });
    expect(remote.dispose).toHaveBeenCalledTimes(1);
    expect(remote.socket.disconnect).toHaveBeenCalledTimes(1);
    expect(lobby().room).toBeNull();
    expect(find(app.render(), AuthorityBattlePresentation)).toBeUndefined();
  });
  it('cancels an in-flight automatic lobby restore when the user starts offline', async () => {
    let finish; fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    window.sessionStorage.setItem('toe.identity.v2', 'prior-token'); app.render();
    lobby().onOffline({ resume: false }); find(app.render(), RoleSelectionDialog).props.onSelect('寻宝者');
    finish({ ok: true, json: async () => ({ identityToken: 'restored-token' }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(transport.io).not.toHaveBeenCalled(); expect(battle().offline).toBe(true);
    expect(collect(app.render()).some(node => node.props.role === 'alert')).toBe(false);
  });
});
