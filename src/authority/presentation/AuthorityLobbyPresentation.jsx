import { useEffect, useRef, useState } from 'react';
import { StartScreen } from '../../components/start/StartScreen';
import { getStartScreenControlScale } from '../../components/start/startScreenGeometry';
import { RoomModal, LobbyModal, PrivacyToggleModal } from '../../components/lobby';
import { AboutModal, RoadmapModal } from '../../components/modals';
import { GammaSlider } from '../../components/ui/GammaSlider';
import { GLOBAL_STYLES } from '../../components/GlobalStyles';
import { useGamePreferences } from '../../hooks/useGamePreferences';
import { useGameAudio } from '../../hooks/useGameAudio';
import { useWindowSize } from '../../hooks/useWindowSize';

const NAME_KEY = 'toe.playerName.v2';
const PRIVACY_PROMPT_KEY = 'toe.roomPrivacyPrompt.v2';
const visitorName = () => `旅者${Math.floor(1000 + Math.random() * 9000)}`;
function storedFlag(key) {
  try { return !!window.localStorage.getItem(key); } catch { return false; }
}
function storedName() {
  try { return window.localStorage.getItem(NAME_KEY)?.trim().slice(0, 32) || visitorName(); }
  catch { return visitorName(); }
}

// The host may share these hooks with its battle screen. Standalone mounting
// still provides working preferences/audio, without mounting a second engine.
export function AuthorityLobbyPresentation(props) {
  return props.preferences ? <WithAudio {...props} /> : <WithPreferences {...props} />;
}
function WithPreferences(props) {
  const preferences = useGamePreferences();
  return <WithAudio {...props} preferences={preferences} />;
}
function WithAudio(props) {
  return props.audio ? <LobbyContent {...props} /> : <WithLocalAudio {...props} />;
}
function WithLocalAudio(props) {
  const audio = useGameAudio(false, '地神的潜影', props.preferences);
  return <LobbyContent {...props} audio={audio} />;
}

function LobbyContent({ room, playerName, onNameChange, onCreateRoom, onJoinRoom, onReady, onStart, onLeave,
  onOffline, onListRooms, onSetPrivacy, onSpectate, error, busy = false, onDismissError, preferences, audio, onUiSfxCapture }) {
  const { w, h } = useWindowSize();
  const [name, setName] = useState(() => playerName?.trim() || storedName());
  const [renameInput, setRenameInput] = useState('');
  const [renameVisible, setRenameVisible] = useState(false);
  const [onlineOpen, setOnlineOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [roomCode, setRoomCode] = useState('');
  const [botCount, setBotCount] = useState(0);
  const [publicRooms, setPublicRooms] = useState([]);
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [privacyRequest, setPrivacyRequest] = useState(null);
  const [skipPrivacyPrompt, setSkipPrivacyPrompt] = useState(() => storedFlag(PRIVACY_PROMPT_KEY));
  const pendingRef = useRef(false);
  const activeRef = useRef(true);
  const currentName = (onNameChange && playerName?.trim()) || name;
  const blocked = busy || pending;
  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; };
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem(NAME_KEY, currentName); } catch { /* Optional local preference. */ }
  }, [currentName]);

  async function run(action) {
    if (busy || pendingRef.current) return;
    pendingRef.current = true; setPending(true); setLocalError(null); setNotice(null);
    try { return await action(); }
    catch (failure) { if (activeRef.current) setLocalError(failure?.message || '操作未完成，请重试'); }
    finally { pendingRef.current = false; if (activeRef.current) setPending(false); }
  }
  function handleUiSfxCapture(event) {
    const button = event.target?.closest?.('button');
    if (!button || button.disabled || button.dataset?.sfx === 'none') return;
    audio.noteUserGesture();
    if (/关闭|取消|返回|离开|[×✕]/.test(button.textContent || '')) audio.playCloseSound();
    else audio.playOpenSound();
  }
  function rename() {
    const next = renameInput.trim();
    if (!next) { setLocalError('请输入联机用户名'); return false; }
    setName(next); onNameChange?.(next); return true;
  }
  function join(code = roomCode, spectate = false) {
    return run(async () => {
      const normalized = code.trim().toUpperCase();
      if (!/^[A-F0-9]{6}$/.test(normalized)) throw new Error('请输入 6 位房间号');
      if (spectate) await onSpectate(normalized);
      else await onJoinRoom({ code: normalized, name: currentName });
      if (activeRef.current) { setOnlineOpen(false); setModal(null); }
    });
  }
  function refreshRooms() {
    return run(async () => {
      const result = await onListRooms();
      const rooms = Array.isArray(result) ? result : result?.rooms;
      if (!Array.isArray(rooms)) throw new Error('无法读取公开房间，请重试');
      if (activeRef.current) setPublicRooms(rooms.map(item => ({ roomId: item.code, count: item.count, max: item.max })));
    });
  }
  const roomModel = room && {
    roomId: room.code, owner: String(room.ownerSeat), isPrivate: room.isPrivate,
    countdown: room.countdown,
    count: room.players.length + (room.phase === 'waiting' ? room.botCount : 0), max: 12,
    botCount: room.phase === 'waiting' ? room.botCount : 0,
    players: room.players.map(player => ({ uuid: String(player.seat), username: player.name, ready: player.ready, isAI: player.isAi })),
  };
  const canStart = room?.phase === 'waiting' && room.players.every(player => player.ready)
    && room.players.length + room.botCount >= 2;
  const message = localError || (typeof error === 'string' ? error : error?.message);

  return <div onClickCapture={onUiSfxCapture || handleUiSfxCapture}>
    <style>{GLOBAL_STYLES}</style>
    <StartScreen vw={w} vh={h} toasts={notice ? [{ id: 'lobby-notice', text: notice }] : []}
      startNewGame={() => run(() => onOffline({ resume: false }))}
      onResumeGame={storedFlag('toe.offline.v2') ? () => run(() => onOffline({ resume: true })) : undefined}
      handleMultiplayer={() => setOnlineOpen(true)} multiLoading={blocked}
      onOpenAbout={() => setModal('about')} onOpenRoadmap={() => setModal('roadmap')}
      onlineOptionsModal={onlineOpen && !room} closeOnlineOptions={() => setOnlineOpen(false)}
      handleCreateRoom={() => run(async () => {
        await onCreateRoom({ name: currentName, botCount });
        if (activeRef.current) setOnlineOpen(false);
      })}
      handleOpenLobby={onListRooms ? () => { setOnlineOpen(false); setModal('lobby'); refreshRooms(); } : undefined}
      joinRoomInput={roomCode} setJoinRoomInput={setRoomCode} handleJoinRoom={() => join()}
      onSpectateRoom={onSpectate ? () => join(roomCode, true) : undefined}
      renameInputVisible={renameVisible} renameInput={renameInput} setRenameInput={setRenameInput}
      handleRename={rename} handleRandomUsername={() => setRenameInput(visitorName())}
      setRenameInputVisible={setRenameVisible} renameCdActive={blocked} playerUsername={currentName}
      onlineOptionsExtra={<label className="toe-panel toe-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        AI 同伴<select className="toe-field" aria-label="AI 同伴数量" value={botCount} disabled={blocked}
          onChange={event => setBotCount(Number(event.target.value))}>
          {Array.from({ length: 11 }, (_, value) => <option key={value} value={value}>{value} 位</option>)}
        </select></label>} />
    {modal === 'about' && <AboutModal onClose={() => setModal(null)} />}
    {modal === 'roadmap' && <RoadmapModal onClose={() => setModal(null)} />}
    {modal === 'lobby' && !room && <LobbyModal lobbyModal lobbyLoading={blocked} lobbyRooms={publicRooms}
      onClose={() => setModal(null)} onRefresh={refreshRooms} onJoinRoom={code => join(code)} />}
    {room && <RoomModal roomModal={roomModel} playerUUID={String(room.viewerSeat)} busy={blocked}
      waiting={room.phase === 'waiting'} onClose={() => run(onLeave)} onSetReady={ready => run(() => onReady(ready))}
      onTogglePrivacy={onSetPrivacy ? isPrivate => isPrivate || skipPrivacyPrompt ? run(() => onSetPrivacy(isPrivate)) : setPrivacyRequest(false) : undefined}
      onStart={onStart ? () => run(onStart) : undefined} canStart={canStart}
      onCopyRoomId={() => run(async () => {
        if (!navigator.clipboard?.writeText) throw new Error('当前环境无法复制，请手动复制上方房间号');
        await navigator.clipboard.writeText(room.code);
        if (activeRef.current) setNotice('房间号已复制');
      })} />}
    <PrivacyToggleModal show={privacyRequest === false} onCancel={() => setPrivacyRequest(null)}
      dontShowAgain={skipPrivacyPrompt} onChangeDontShow={value => {
        setSkipPrivacyPrompt(value);
        try { if (value) window.localStorage.setItem(PRIVACY_PROMPT_KEY, '1'); else window.localStorage.removeItem(PRIVACY_PROMPT_KEY); }
        catch { /* The current session still remembers the choice. */ }
      }}
      onConfirm={() => { setPrivacyRequest(null); run(() => onSetPrivacy(false)); }} />
    <GammaSlider startControlScale={getStartScreenControlScale(w, h)} gamma={preferences.gamma}
      onChange={preferences.handleGamma} musicVolume={preferences.musicVolume} onMusicVolumeChange={preferences.handleMusicVolume}
      sfxVolume={preferences.sfxVolume} onSfxVolumeChange={preferences.handleSfxVolume} />
    {message && <div className="toe-dialog" role="alert" style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
      zIndex: 2000, maxWidth: 'calc(100vw - 32px)', padding: '14px 20px', display: 'flex', gap: 16, alignItems: 'center' }}>
      <span>{message}</span><button className="toe-button" onClick={() => { setLocalError(null); onDismissError?.(); }}>关闭提示</button>
    </div>}
  </div>;
}
