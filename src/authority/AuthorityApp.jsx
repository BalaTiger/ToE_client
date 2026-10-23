import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { GLOBAL_STYLES } from '../components/GlobalStyles';
import { RoleSelectionDialog } from '../components/battle/RoleSelectionDialog';
import { useGamePreferences } from '../hooks/useGamePreferences';
import { useGameAudio } from '../hooks/useGameAudio';
import { loadSocketIO } from '../utils/socketIoClient';
import { FIRST_BATTLE_DONE_KEY, getRuntimeServerUrl, getRuntimeSocketPath } from '../utils/runtime';
import { OfflineSession } from './offlineSession';
import { RemoteSession } from './remoteSession';
import { loadOfflineSave } from '../../packages/rules/src/offline.js';
import { AuthorityLobbyPresentation } from './presentation/AuthorityLobbyPresentation';
import AuthorityBattlePresentation from './presentation/AuthorityBattlePresentation';
import { TutorialOverlay } from '../components/lobby';
import { TutorialSession, loadTutorialSave, TUTORIAL_DONE_KEY, TUTORIAL_SAVE_KEY } from './tutorial/TutorialSession';

const emptySubscribe = () => () => {};
const emptySnapshot = () => null;
const NAME_KEY = 'toe.playerName.v2';

export default function AuthorityApp() {
  const [session, setSession] = useState(null), [offline, setOffline] = useState(false), [room, setRoom] = useState(null);
  const [name, setName] = useState(() => {
    try { return window.sessionStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
  });
  const [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const [roleSelection, setRoleSelection] = useState(null), [presentationBusy, setPresentationBusy] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [tutorialPrompt, setTutorialPrompt] = useState(false);
  const lobbyRef = useRef(null), remoteRef = useRef(null), connectPromiseRef = useRef(null), connectionVersion = useRef(0);
  const serverUrl = getRuntimeServerUrl(), socketPath = getRuntimeSocketPath();
  const report = useCallback(value => { if (value?.code !== 'connection_cancelled') setError(value?.message || String(value)); }, []);
  const view = useSyncExternalStore(session?.subscribe || emptySubscribe, session?.getSnapshot || emptySnapshot,
    session?.getSnapshot || emptySnapshot);
  const preferences = useGamePreferences();
  const audio = useGameAudio(!!session, view?.expansionKey || '地神的潜影', preferences);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let disposed = false;
    const request = () => navigator.serviceWorker.controller?.postMessage({ type: 'toe:offline-status' });
    const receive = event => {
      if (!disposed && event.source === navigator.serviceWorker.controller && event.data?.type === 'toe:offline-ready') setOfflineReady(event.data.ready === true);
    };
    navigator.serviceWorker.addEventListener('message', receive);
    navigator.serviceWorker.addEventListener('controllerchange', request);
    navigator.serviceWorker.ready.then(() => { if (!disposed) request(); }).catch(() => {});
    return () => { disposed = true; navigator.serviceWorker.removeEventListener('message', receive); navigator.serviceWorker.removeEventListener('controllerchange', request); };
  }, []);
  useEffect(() => {
    if (!offline || !session) return;
    const timer = setInterval(() => { try { session.tickTime(); } catch (failure) { report(failure); } }, 100);
    return () => clearInterval(timer);
  }, [session, offline, report]);
  useEffect(() => {
    if (!offline || !session || !view || view.gameOver && !session.isTutorial || view.status?.paused || presentationBusy || roleSelection) return;
    const timer = setTimeout(() => { try { session.stepBot(); } catch (failure) { report(failure); } }, 120);
    return () => clearTimeout(timer);
  }, [session, offline, view, presentationBusy, roleSelection, report]);
  const presentationChanged = useCallback((playing, metadata) => {
    setPresentationBusy(playing); session?.presentationStatus?.(playing, metadata);
    if (offline) session?.setPresentationBusy?.(playing);
  }, [session, offline]);

  const request = useCallback((event, payload = {}) => new Promise((resolve, reject) => {
    if (!lobbyRef.current?.connected) { reject(new Error('尚未连接房间服务')); return; }
    lobbyRef.current.timeout(5000).emit(event, payload, (failure, result) => failure ? reject(new Error('连接超时，请重试'))
      : result?.ok ? resolve(result.result) : reject(new Error(result?.error || '操作未完成')));
  }), []);
  const clearRemote = useCallback(() => {
    remoteRef.current?.dispose(); remoteRef.current?.socket.disconnect(); remoteRef.current = null;
  }, []);
  const disconnectLobby = useCallback(() => {
    connectionVersion.current += 1; connectPromiseRef.current = null;
    const socket = lobbyRef.current; lobbyRef.current = null; socket?.disconnect(); clearRemote();
  }, [clearRemote]);
  const establishLobby = useCallback(async () => {
    if (lobbyRef.current?.connected) return lobbyRef.current;
    const version = connectionVersion.current, storage = window.sessionStorage, prior = storage.getItem('toe.identity.v2');
    let response = await fetch(`${serverUrl}/v2/identity`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prior ? { identityToken: prior } : {}) });
    if (prior && response.status === 401) response = await fetch(`${serverUrl}/v2/identity`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!response.ok) throw new Error('无法连接房间服务，请稍后重试');
    const identity = await response.json();
    const io = await loadSocketIO();
    if (version !== connectionVersion.current) {
      const cancelled = new Error('房间连接已取消'); cancelled.code = 'connection_cancelled'; throw cancelled;
    }
    storage.setItem('toe.identity.v2', identity.identityToken);
    lobbyRef.current?.disconnect();
    const socket = io(`${serverUrl}/lobby-v2`, { path: socketPath, auth: { identityToken: identity.identityToken }, transports: ['websocket'], autoConnect: false });
    let latestRoom = null;
    lobbyRef.current = socket;
    socket.on('roomNotice', notice => {
      const messages = { not_ready_timeout: '未准备超时，已被移出房间', auto_start_failed: '自动开局未完成，请房主重试' };
      if (lobbyRef.current === socket) report(new Error(messages[notice?.reason] || '房间状态已更新'));
    });
    socket.on('room', next => {
      if (lobbyRef.current !== socket) return;
      const freshStart = latestRoom?.phase === 'waiting' && next?.phase === 'playing' && latestRoom.code === next.code && Number.isInteger(next.viewerSeat);
      latestRoom = next;
      setRoom(next); setOffline(false); setRoleSelection(null);
      if (!next || next.returned || next.phase === 'waiting') {
        clearRemote(); setSession(null); setPresentationBusy(false); return;
      }
      if (remoteRef.current?.matchId === next.matchId) return;
      clearRemote(); setPresentationBusy(false);
      const matchSocket = io(`${serverUrl}/authority-v2`, { path: socketPath, auth: { identityToken: identity.identityToken }, transports: ['websocket'], autoConnect: false });
      matchSocket.on('connect_error', report);
      const remote = new RemoteSession(matchSocket, next.matchId, { onError: report, freshStart }); remoteRef.current = remote;
      setSession(remote); matchSocket.connect();
    });
    try {
      return await new Promise((resolve, reject) => {
        const connected = () => { socket.off('connect_error', failed); resolve(socket); };
        const failed = failure => { socket.off('connect', connected); reject(new Error(failure.message)); };
        socket.once('connect', connected); socket.once('connect_error', failed); socket.connect();
      });
    } catch (failure) {
      if (lobbyRef.current === socket) lobbyRef.current = null;
      socket.disconnect(); throw failure;
    }
  }, [serverUrl, socketPath, clearRemote, report]);
  const connectLobby = useCallback(async () => {
    if (lobbyRef.current?.connected) return lobbyRef.current;
    if (connectPromiseRef.current) return connectPromiseRef.current;
    const connecting = establishLobby(); connectPromiseRef.current = connecting;
    try { return await connecting; }
    finally { if (connectPromiseRef.current === connecting) connectPromiseRef.current = null; }
  }, [establishLobby]);
  useEffect(() => {
    let active = true;
    try {
      if (window.sessionStorage.getItem('toe.identity.v2')) connectLobby().catch(failure => { if (active) report(failure); });
    } catch (failure) { report(failure); }
    return () => { active = false; disconnectLobby(); };
  }, [connectLobby, disconnectLobby, report]);

  async function lobbyAction(event, payload) {
    setError(null); setBusy(true);
    try { await connectLobby(); return await request(event, payload); }
    catch (failure) { report(failure); throw failure; }
    finally { setBusy(false); }
  }
  function changeName(value) {
    setName(value);
    try { window.sessionStorage.setItem(NAME_KEY, value); } catch { /* Optional display preference. */ }
  }
  function enterOffline({ resume = false, selectedRole, expansionKey, roleCounts } = {}) {
    setError(null);
    try {
      const record = resume ? loadOfflineSave(window.localStorage) : null;
      if (resume && !record) throw new Error('没有新格式单机存档');
      const firstBattle = window.localStorage.getItem(FIRST_BATTLE_DONE_KEY) !== '1';
      const next = new OfflineSession({ record, freshStart: !resume, seed: crypto.getRandomValues(new Uint32Array(1))[0],
        id: `offline:${crypto.randomUUID()}`, storage: window.localStorage, onSaveError: report,
        selectedRole, roleCounts, expansionKey: firstBattle ? '地神的潜影' : expansionKey });
      disconnectLobby(); setRoom(null); setOffline(true); setSession(next); setPresentationBusy(false); setRoleSelection(null);
      if (!resume) {
        try { window.localStorage.setItem(FIRST_BATTLE_DONE_KEY, '1'); } catch { /* Optional first-battle preference. */ }
      }
    } catch (failure) { report(failure); throw failure; }
  }
  function startOffline(options = {}) {
    if (options.resume) return enterOffline(options);
    if (!offline) { disconnectLobby(); setRoom(null); }
    setError(null);
    let done = false; try { done = window.localStorage.getItem(TUTORIAL_DONE_KEY) === '1'; } catch { /* Offer the lesson if preferences are unavailable. */ }
    if (!done) setTutorialPrompt(true); else setRoleSelection(options);
  }
  function enterTutorial(resume = false) {
    try {
      const saved = resume ? loadTutorialSave(window.localStorage) : null;
      if (resume && !saved) throw new Error('没有可继续的教学进度');
      const next = new TutorialSession({ saved, storage: window.localStorage, onSaveError: report });
      disconnectLobby(); setRoom(null); setOffline(true); setSession(next); setPresentationBusy(false);
      setRoleSelection(null); setTutorialPrompt(false); setError(null);
    } catch (failure) { report(failure); }
  }
  function completeTutorial() {
    session.complete(); setSession(null); setPresentationBusy(false); setRoleSelection({});
  }
  function skipTutorial() {
    try { window.localStorage.setItem(TUTORIAL_DONE_KEY, '1'); } catch { /* Current start still proceeds. */ }
    setTutorialPrompt(false); setRoleSelection({});
  }
  async function exit() {
    if (!offline) await lobbyAction('leaveRoom', {});
    clearRemote(); setSession(null); setRoom(null); setPresentationBusy(false); setRoleSelection(null);
  }
  function resetConnection() {
    disconnectLobby(); setSession(null); setRoom(null); setError(null); setPresentationBusy(false);
  }
  function handleUiSfxCapture(event) {
    const button = event.target?.closest?.('button');
    if (!button || button.disabled || button.dataset?.sfx === 'none') return;
    audio.noteUserGesture();
    if (button.dataset?.sfx === 'close' || /关闭|取消|返回|离开|[×✕]/.test(button.textContent || '')) audio.playCloseSound();
    else audio.playOpenSound();
  }
  const uncertain = error?.includes('uncertain');
  return <main>
    <style>{GLOBAL_STYLES}</style>
    {session ? view ? <AuthorityBattlePresentation key={view.matchId} view={view} session={session} offline={offline}
      onExit={() => exit().catch(report)} onReturn={() => lobbyAction('returnRoom', {}).catch(() => {})}
      onRestart={() => offline ? startOffline({}) : lobbyAction('returnRoom', {}).catch(() => {})}
      report={report} preferences={preferences} audio={audio} onUiSfxCapture={handleUiSfxCapture}
      onPresentationBusyChange={presentationChanged} onCompleteTutorial={completeTutorial} />
      : <div className="toe-dialog" role="status">正在连接对局…</div>
      : <AuthorityLobbyPresentation room={room} playerName={name} onNameChange={changeName}
        onCreateRoom={payload => { changeName(payload.name); return lobbyAction('createRoom', payload); }}
        onJoinRoom={payload => { changeName(payload.name); return lobbyAction('joinRoom', payload); }}
        onReady={ready => lobbyAction('ready', { ready })} onStart={() => lobbyAction('startGame', {})} onLeave={exit}
        onOffline={startOffline} onListRooms={async () => (await lobbyAction('listRooms', {})).rooms}
        onSetPrivacy={isPrivate => lobbyAction('setPrivacy', { isPrivate })} onSpectate={code => lobbyAction('spectate', { code })}
        error={error} busy={busy} onDismissError={() => setError(null)} preferences={preferences} audio={audio} onUiSfxCapture={handleUiSfxCapture} />}
    {roleSelection && <div onClickCapture={handleUiSfxCapture}><RoleSelectionDialog
      onSelect={selectedRole => { try { enterOffline({ ...roleSelection, selectedRole }); } catch { /* Reported above. */ } }}
      onCancel={() => setRoleSelection(null)} /></div>}
    {tutorialPrompt && <div onClickCapture={handleUiSfxCapture}><TutorialOverlay show step={1}
      onComplete={skipTutorial} onStart={() => enterTutorial(false)}
      onResume={(() => { try { return window.localStorage.getItem(TUTORIAL_SAVE_KEY) ? () => enterTutorial(true) : undefined; } catch { return undefined; } })()} /></div>}
    {!session && !room && !roleSelection && !tutorialPrompt && <button className="toe-button" style={{ position: 'fixed', right: 16, bottom: 12, zIndex: 30 }}
      onClick={() => setTutorialPrompt(true)}>新手教学</button>}
    {session && error && <div className="toe-dialog" role="alert" style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
      zIndex: 10000, maxWidth: 'calc(100vw - 32px)', padding: 16 }}>
      <span>{error}</span><button className="toe-button" onClick={() => setError(null)}>关闭提示</button>
      {!offline && !uncertain && <button className="toe-button" onClick={resetConnection}>返回首页重新连接</button>}
      {!offline && uncertain && <button className="toe-button" onClick={() => session.retry().then(() => setError(null)).catch(report)}>重试同一次操作</button>}
    </div>}
    {!session && offlineReady && <div className="toe-subtitle" role="status" style={{ position: 'fixed', bottom: 8, left: 12, pointerEvents: 'none' }}>离线资源已就绪</div>}
  </main>;
}
