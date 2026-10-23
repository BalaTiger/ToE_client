import { Children } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorityLobbyPresentation } from './AuthorityLobbyPresentation';
import { StartScreen } from '../../components/start/StartScreen';
import { OnlineOptionsDialog } from '../../components/start/OnlineOptionsDialog';
import { RoomModal, LobbyModal } from '../../components/lobby';
import { GammaSlider } from '../../components/ui/GammaSlider';

vi.mock('react', async original => ({
  ...await original(),
  useState: initial => [typeof initial === 'function' ? initial() : initial, vi.fn()],
  useRef: value => ({ current: value }),
  useEffect: vi.fn(),
}));
vi.mock('../../hooks/useWindowSize', () => ({ useWindowSize: () => ({ w: 1280, h: 800 }) }));
vi.mock('../../utils/url', () => ({ buildPublicUrl: path => path }));

const preferences = { gamma: 1.2, musicVolume: 0.4, sfxVolume: 0.6,
  handleGamma: vi.fn(), handleMusicVolume: vi.fn(), handleSfxVolume: vi.fn() };
const audio = { noteUserGesture: vi.fn(), playOpenSound: vi.fn(), playCloseSound: vi.fn() };
function collect(node, nodes = []) {
  if (!node?.props) return nodes;
  nodes.push(node);
  Children.toArray(node.props.children).forEach(child => collect(child, nodes));
  return nodes;
}
function render(overrides = {}) {
  let node = AuthorityLobbyPresentation({ preferences, audio, playerName: '测试旅者', ...overrides });
  while (typeof node.type === 'function') node = node.type(node.props);
  return collect(node);
}
const find = (nodes, type) => nodes.find(node => node.type === type);
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('window', { localStorage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() } });
});
afterEach(() => vi.unstubAllGlobals());

describe('authority lobby presentation', () => {
  it('uses the original art shell and forwards new-room names without legacy socket state', async () => {
    const onCreateRoom = vi.fn();
    const start = find(render({ onCreateRoom }), StartScreen);
    await start.props.handleCreateRoom();
    expect(onCreateRoom).toHaveBeenCalledExactlyOnceWith({ name: '测试旅者', botCount: 0 });
    expect(start.props.playerUsernameSpecial).toBeUndefined();
    expect(start.props.handleOpenLobby).toBeUndefined();
    expect(start.props.onSpectateRoom).toBeUndefined();
  });
  it('only offers resume when a v2 save exists and forwards the offline request', async () => {
    const onOffline = vi.fn();
    expect(find(render({ onOffline }), StartScreen).props.onResumeGame).toBeUndefined();
    window.localStorage.getItem.mockImplementation(key => key === 'toe.offline.v2' ? '{}' : null);
    const start = find(render({ onOffline }), StartScreen);
    await start.props.onResumeGame();
    expect(onOffline).toHaveBeenCalledWith({ resume: true });
    await start.props.startNewGame();
    expect(onOffline).toHaveBeenCalledWith({ resume: false });
  });
  it('maps v2 seats for display and keeps room actions on v2 callbacks', async () => {
    const onReady = vi.fn(), onStart = vi.fn(), onLeave = vi.fn();
    const nodes = render({ onReady, onStart, onLeave, room: { code: 'A1B2C3', ownerSeat: 1, viewerSeat: 1,
      phase: 'waiting', botCount: 1, isPrivate: true, players: [{ seat: 1, name: '房主', ready: true }] } });
    const room = find(nodes, RoomModal);
    expect(room.props.roomModal).toMatchObject({ roomId: 'A1B2C3', owner: '1', count: 2, isPrivate: true });
    expect(room.props.playerUUID).toBe('1');
    expect(room.props.canStart).toBe(true);
    expect(room.props.cdType).toBeUndefined();
    await room.props.onSetReady(false);
    await room.props.onStart();
    await room.props.onClose();
    expect(onReady).toHaveBeenCalledExactlyOnceWith(false);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
  it('prevents duplicate operations while an acknowledgement is outstanding', async () => {
    let release;
    const onCreateRoom = vi.fn(() => new Promise(resolve => { release = resolve; }));
    const start = find(render({ onCreateRoom }), StartScreen);
    const pending = start.props.handleCreateRoom();
    await start.props.handleCreateRoom();
    expect(onCreateRoom).toHaveBeenCalledTimes(1);
    release(); await pending;
  });
  it('shares real host preference handlers', () => {
    const settings = find(render(), GammaSlider);
    expect(settings.props.gamma).toBe(1.2);
    expect(settings.props.onChange).toBe(preferences.handleGamma);
    expect(settings.props.onMusicVolumeChange).toBe(preferences.handleMusicVolume);
    expect(settings.props.onSfxVolumeChange).toBe(preferences.handleSfxVolume);
  });
  it('does not advertise a public lobby without a list callback', () => {
    const html = renderToStaticMarkup(<OnlineOptionsDialog open playerUsername="旅者" joinRoomInput="" />);
    expect(html).not.toContain('游戏大厅');
    expect(html).not.toContain('旁观此房间');
    expect(find(render(), LobbyModal)).toBeUndefined();
  });
  it('shows manual start only for the host and disables it until ready', () => {
    const roomModal = { roomId: 'ABC123', owner: '0', isPrivate: true, players: [{ uuid: '0', username: '房主', ready: false }] };
    const owner = renderToStaticMarkup(<RoomModal roomModal={roomModal} playerUUID="0" onStart={() => {}} canStart={false} />);
    expect(owner).toMatch(/disabled=""[^>]*>开始对局/);
    expect(owner).not.toContain('切换为公开');
    expect(owner).not.toContain('后开始游戏');
    const guest = renderToStaticMarkup(<RoomModal roomModal={roomModal} playerUUID="1" onStart={() => {}} canStart />);
    expect(guest).not.toContain('开始对局');
  });
  it('renders the server countdown without relying on the browser wall clock', () => {
    const countdown = { type: 'kick', deadline: 61000, serverNow: 1000, version: 2, targetSeat: 0 };
    const room = { code: 'A1B2C3', ownerSeat: 0, viewerSeat: 0, phase: 'waiting', botCount: 0, countdown,
      players: [{ seat: 0, name: '房主', ready: false }, { seat: 1, name: '客人', ready: true }] };
    const node = find(render({ room }), RoomModal);
    expect(node.props.roomModal.countdown).toBe(countdown);
    const html = renderToStaticMarkup(node);
    expect(html).toContain('你尚未准备，60s 后将被移出房间');
    expect(html).not.toContain('后开始游戏');
  });
  it('waits for a server update at countdown zero without firing any game operation', () => {
    const onStart = vi.fn(), onLeave = vi.fn();
    const room = { code: 'A1B2C3', ownerSeat: 0, viewerSeat: 0, phase: 'waiting', botCount: 1,
      countdown: { type: 'start', deadline: 1000, serverNow: 1100, version: 2 },
      players: [{ seat: 0, name: '房主', ready: true }] };
    const html = renderToStaticMarkup(find(render({ room, onStart, onLeave }), RoomModal));
    expect(html).toContain('正在等待服务器开始对局…');
    expect(onStart).not.toHaveBeenCalled(); expect(onLeave).not.toHaveBeenCalled();
  });
});
