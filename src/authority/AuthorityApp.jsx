import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { PreviewCard } from '../components/cards';
import { GOD_DEFS } from '../../packages/rules/src/constants/card.js';
import { loadSocketIO } from '../utils/socketIoClient';
import { getRuntimeServerUrl, getRuntimeSocketPath } from '../utils/runtime';
import { OfflineSession } from './offlineSession';
import { RemoteSession } from './remoteSession';
import { loadOfflineSave } from '../../packages/rules/src/offline.js';
import './authority.css';

const LABELS = {
  'draw.keep': '保留并结算', 'draw.discard': '弃置', 'turn.end': '结束回合', 'turn.rest': '休息',
  'skill.begin': '使用身份技能', 'skill.cancel': '取消', 'swap.takeBlind': '暗抽一张', 'swap.selectTarget': '选择掉包目标',
  'swap.takeVisible': '选择抽取的牌', 'swap.give': '选择归还的牌', 'caveDuel.commit': '锁定对决选牌',
  'caveDuel.selectTarget': '选择对决目标', 'peek.selectTarget': '选择偷看目标', 'turn.discard': '选择上限弃牌',
  'publicPick.choose': '选择收入的牌', 'tortoise.choose': '选择编号', 'grave.choose': '选择取回的邪神牌',
  'torch.discard': '选择引燃火把的弃牌', 'albino.reveal': '选择亮出的含火牌', 'bury.commit': '锁定活埋选牌',
  'god.choose': '回应邪神', 'god.useHand': '使用手中的邪神牌', 'stone.arrange': '解读石刻',
  'sameAbyss.choose': '同归深渊', 'hunt.selectTarget': '选择追捕目标', 'hunt.reveal': '选择亮出的手牌',
  'hunt.attack': '选择匹配的弃牌', 'hunt.loot': '选择战利品', 'bewitch.chooseCard': '选择赠予的牌',
  'bewitch.selectTarget': '选择蛊惑目标', 'nya.borrow': '借用已故角色的身份', 'shu.selectTarget': '选择黑暗子嗣目标',
  'zoneSwap.selectTarget': '选择整手交换目标', 'damageLink.selectTarget': '选择两人一绳目标',
  'roseThorn.selectTarget': '选择玫瑰倒刺目标', 'multiply.begin': '繁衍', 'multiply.selectTarget': '选择繁衍目标',
};
const CHOICES = { worship: '信仰／改信', upgrade: '升级神力', keepHand: '收入手牌', discard: '弃置',
  accept: '接受改信', damage: '承受伤害' };
const PHASES = { ACTION: '行动', DRAW_REVEAL: '摸牌决策', GOD_CHOICE: '邪神馈赠', CAVE_DUEL_SELECT_CARD: '洞穴对决 · 暗选',
  BURY_ALIVE_SELECT: '活埋 · 暗选', SWAP_GIVE_CARD: '掉包 · 归还', HUNT_WAIT_REVEAL: '追捕 · 等待亮牌',
  HUNT_CONFIRM: '追捕 · 匹配', DISCARD_PHASE: '手牌上限弃牌', DECIPHER_STONE_CARVING: '解读石刻' };
const BOOLS = {
  'slime.answer': ['use', '使用黏液平衡', '不使用黏液'], 'etherealize.answer': ['use', '使用虚化', '承受损失'],
  'treasureDodge.reply': ['use', '掷骰尝试规避', '不规避'], 'sphinx.dodge': ['use', '掷骰尝试规避', '不规避'],
  'sphinx.guess': ['isZone', '猜：是区域牌', '猜：不是区域牌'], 'zhu.hide': ['hide', '藏到牌堆底', '正常翻开'],
  'zhu.hideSphinx': ['hide', '藏到牌堆底', '允许翻开'],
};
function Card({ card }) {
  const display = card.isGod ? { ...GOD_DEFS[card.godKey], ...card } : card;
  return <div className="authority-card" aria-label={`${card.key || card.name} ${card.name}`}>
    <PreviewCard card={display} minWidth={110} scale={0.8} /><span>{card.name || card.key}</span>
  </div>;
}
function Action({ action, view, submit, busy }) {
  const [selected, setSelected] = useState([]), [handIndex, setHandIndex] = useState(0);
  const [positions, setPositions] = useState({}), [order, setOrder] = useState(action.cardIndices || []);
  const type = action.type, label = LABELS[type] || '选择操作', own = view.players[view.viewerSeat]?.hand || [];
  const send = payload => submit(type, payload);
  if (['skill.begin', 'skill.cancel', 'multiply.begin', 'swap.takeBlind', 'draw.keep', 'draw.discard', 'turn.end', 'turn.rest'].includes(type)) {
    return <button disabled={busy} onClick={() => send({})}>{label}</button>;
  }
  if (BOOLS[type]) {
    const [key, yes, no] = BOOLS[type], choices = action.choices || [false, true];
    return <div className="authority-action">
      {choices.includes(true) && <button disabled={busy} onClick={() => send({ [key]: true })}>{yes}</button>}
      {choices.includes(false) && <button disabled={busy} onClick={() => send({ [key]: false })}>{no}</button>}
    </div>;
  }
  if (type === 'stone.arrange') {
    const top = order.filter(index => index !== handIndex && positions[index] !== 'bottom');
    const bottom = order.filter(index => index !== handIndex && positions[index] === 'bottom');
    const move = (index, delta) => setOrder(previous => {
      const next = [...previous], position = next.indexOf(index), to = position + delta;
      if (to < 0 || to >= next.length) return previous;
      [next[position], next[to]] = [next[to], next[position]]; return next;
    });
    return <section className="authority-action"><h3>{label}</h3>
      <p>选一张收入手牌。牌堆顶一组按右侧优先摸取；牌堆底一组最左侧为最底部。</p>
      {order.map(index => <div className="authority-stone-row" key={index}>
        <Card card={view.privateReveals[index]} />
        <label><input type="radio" name="stone-hand" checked={handIndex === index} onChange={() => setHandIndex(index)} />收入手牌</label>
        {handIndex !== index && <select aria-label={`放置 ${view.privateReveals[index].name}`} value={positions[index] || 'top'}
          onChange={event => setPositions(previous => ({ ...previous, [index]: event.target.value }))}>
          <option value="top">牌堆顶</option><option value="bottom">牌堆底</option></select>}
        <button onClick={() => move(index, -1)}>向左</button><button onClick={() => move(index, 1)}>向右</button>
      </div>)}
      <button disabled={busy} onClick={() => send({ handIndex, topIndices: top, bottomIndices: bottom })}>确认排列</button>
    </section>;
  }
  const targets = action.targetSeats || action.targets;
  if (targets) return <section className="authority-action"><h3>{label}</h3>
    {targets.map(seat => <button disabled={busy} key={seat} onClick={() => send({ targetSeat: seat })}>{view.players[seat].name}</button>)}
    {action.allowSkip && <button disabled={busy} onClick={() => send({ targetSeat: null })}>跳过借用</button>}
  </section>;
  if (action.keys) return <section className="authority-action"><h3>{label}</h3>
    {action.keys.map(key => <button disabled={busy} key={key} onClick={() => send({ key })}>{key}</button>)}
  </section>;
  if (action.choices) return <section className="authority-action"><h3>{label}</h3>
    {action.choices.map(choice => <button disabled={busy} key={choice} onClick={() => send({ choice })}>{CHOICES[choice] || choice}</button>)}
  </section>;
  if (action.cardIndices) {
    const cards = ['publicPick.choose', 'grave.choose'].includes(type) ? view.publicReveals
      : type === 'swap.takeVisible' ? view.players[view.swapTargetSeat]?.hand
      : type === 'hunt.loot' ? view.players[view.hunt.targetSeat]?.hand : own;
    const multi = type === 'turn.discard' || type === 'hunt.loot';
    const toggle = index => setSelected(previous => previous.includes(index) ? previous.filter(value => value !== index)
      : previous.length < action.count ? [...previous, index] : previous);
    return <section className="authority-action"><h3>{label}{multi ? `（${selected.length}/${action.count}）` : ''}</h3>
      <div className="authority-card-row">{action.cardIndices.map(index => <button className={selected.includes(index) ? 'selected' : ''}
        disabled={busy} key={index} onClick={() => multi ? toggle(index) : send({ cardIndex: index })}>
        {cards?.[index] ? <Card card={cards[index]} /> : `第 ${index + 1} 张`}
      </button>)}</div>
      {multi && <button disabled={busy || selected.length !== action.count} onClick={() => send({ cardIndices: selected })}>确认选择</button>}
      {action.allowAbandon && <button disabled={busy} onClick={() => send({ cardIndex: null })}>放弃追捕</button>}
    </section>;
  }
  return <button disabled={busy} onClick={() => send({})}>{label}</button>;
}

function SessionBoard({ session, offline, onExit, onReturn, report }) {
  const view = useSyncExternalStore(session.subscribe, session.getSnapshot), [busy, setBusy] = useState(false);
  const [animations, setAnimations] = useState([]), seen = useRef(null);
  const animation = animations[0] || null;
  useEffect(() => {
    if (!offline) return;
    const timer = setInterval(() => { try { session.tickTime(); } catch (error) { report(error); } }, 100);
    return () => clearInterval(timer);
  }, [session, offline, report]);
  useEffect(() => {
    if (!offline || !view || view.gameOver) return;
    const timer = setTimeout(() => { try { session.stepBot(); } catch (error) { report(error); } }, 120);
    return () => clearTimeout(timer);
  }, [session, offline, view, report]);
  useEffect(() => {
    if (!view) return;
    if (!seen.current) { seen.current = new Set(view.events.map(event => event.id)); return; }
    const fresh = view.events.filter(event => !seen.current.has(event.id));
    seen.current = new Set(view.events.map(event => event.id));
    const reveals = fresh.filter(event => event.type === 'caveDuelRevealed' || event.type === 'sphinxRevealed' || event.type === 'cardRevealed');
    if (reveals.length) setAnimations(previous => [...previous, ...reveals]);
  }, [view]);
  useEffect(() => {
    if (!animation) return;
    const timer = setTimeout(() => setAnimations(previous => previous.slice(1)), 1800); return () => clearTimeout(timer);
  }, [animation]);
  const submit = async (type, payload) => {
    setBusy(true); try { await session.submit(type, payload); } catch (error) { report(error); } finally { setBusy(false); }
  };
  if (!view) return <p role="status">正在连接对局…</p>;
  const own = view.viewerSeat === null ? null : view.players[view.viewerSeat];
  return <div className="authority-battle">
    <header><div><h1>ToE</h1><p>{offline ? '单机对局' : '联机对局'} · 第 {view.turn} 回合 · {PHASES[view.phase] || '等待选择'}</p></div>
      <button onClick={onExit}>{offline ? '保存并退出' : view.viewerSeat === null ? '退出旁观' : '退出并交给 AI'}</button></header>
    <div className="authority-table">{view.players.map(player => <section className={`authority-player ${view.currentSeat === player.seat ? 'active' : ''}`} key={player.seat}>
      <h2>{player.name}{player.seat === view.viewerSeat ? ' · 你' : ''}{player.isDead ? ' · 已故' : ''}</h2>
      <p>{player.role || '身份未揭晓'}{player.godName ? ` · ${player.godName} Lv.${player.godLevel}` : ''}</p>
      <div className="authority-stat"><span>HP {player.hp}</span><i style={{ width: `${Math.max(0, player.hp) * 10}%` }} /></div>
      <div className="authority-stat san"><span>SAN {player.san}</span><i style={{ width: `${Math.max(0, player.san) * 10}%` }} /></div>
      <p>手牌 {player.handCount} 张{player.isResting ? ' · 休息中' : ''}</p>
      {player.seat !== view.viewerSeat && player.hand && <div className="authority-card-row public-hand">{player.hand.map(card => <Card key={card.id} card={card} />)}</div>}
      {player.publicTokens && <div className="authority-card-row public-hand">{player.publicTokens.map(card => <Card key={card.id} card={card} />)}</div>}
    </section>)}</div>
    <section className="authority-center"><span>牌堆 {view.deckCount}</span><span>弃牌 {view.discard.length}</span><span>检定牌堆 {view.inspectionDeckCount}</span></section>
    {view.draw && <section className="authority-reveal"><h2>{view.players[view.draw.owner].name} 摸牌</h2>
      {view.draw.hidden ? <div className="authority-hidden">暗牌 · 决定保留或弃置</div> : <Card key={view.draw.card.id} card={view.draw.card} />}</section>}
    {view.godEncounter && <section className="authority-reveal"><h2>邪神馈赠</h2><Card card={view.godEncounter.card} /></section>}
    {view.publicReveals?.length > 0 && <div className="authority-card-row">{view.publicReveals.map(card => <Card key={card.id} card={card} />)}</div>}
    {view.peeks.map((peek, index) => <section key={index}><h3>你获知的手牌 · {view.players[peek.targetSeat].name}</h3><div className="authority-card-row">{peek.cards.map(card => <Card key={card.id} card={card} />)}</div></section>)}
    {view.litDeck?.length > 0 && <section><h3>衔烛照幽 · 仅你可见</h3><div className="authority-card-row">{view.litDeck.map(item => <div key={item.card.id}><span>牌堆第 {item.deckIndex + 1} 张</span><Card card={item.card} /></div>)}</div></section>}
    {own && <section><h2>你的手牌</h2><div className="authority-card-row">{(own.hand || []).map(card => <Card key={card.id} card={card} />)}</div></section>}
    {view.status?.paused && <p role="alert">对局暂时暂停，当前进度已保留。</p>}
    {view.gameOver ? <section className="authority-result"><h2>对局结束 · {({ LOSE: '你已阵亡', LOSE_ALL: '全员失败' })[view.gameOver.winner] || view.gameOver.winner}</h2><p>{view.gameOver.reason}</p>
      <button onClick={offline || view.viewerSeat === null ? onExit : onReturn}>{offline ? '返回首页' : view.viewerSeat === null ? '退出旁观' : '回到房间'}</button></section>
      : <section className="authority-decisions"><h2>{view.decision.actions.length ? '请选择操作' : '等待其他角色…'}</h2>
        {view.duel?.lockedCardIndex !== undefined && <p role="status">已锁定选择，等待对手。对方选牌尚未揭晓。</p>}
        {view.bury && <p role="status">已锁定活埋选牌，等待其余角色。</p>}
        {view.decision.actions.map(action => <Action key={`${view.decision.id}:${action.type}`} action={action} view={view}
          submit={submit} busy={busy || !!view.status?.paused} />)}
      </section>}
    {animation && <div className="authority-animation" role="status"><h2>{animation.type === 'caveDuelRevealed' ? '洞穴对决 · 同时亮牌' : '亮牌'}</h2>
      <div className="authority-card-row">{[animation.sourceCard, animation.targetCard, animation.card].filter(Boolean).map(card => <Card key={card.id} card={card} />)}</div>
      {animation.winnerSeat !== undefined && <p>{view.players[animation.winnerSeat]?.name || '平局'}</p>}
      <button style={{ pointerEvents: 'auto' }} onClick={() => setAnimations([])}>收起演出</button></div>}
  </div>;
}

export default function AuthorityApp() {
  const [offlineReady, setOfflineReady] = useState(false);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let disposed = false;
    const request = () => navigator.serviceWorker.controller?.postMessage({ type: 'toe:offline-status' });
    const receive = event => {
      if (!disposed && event.source === navigator.serviceWorker.controller && event.data?.type === 'toe:offline-ready') setOfflineReady(event.data.ready === true);
    };
    navigator.serviceWorker.addEventListener('message', receive);
    navigator.serviceWorker.addEventListener('controllerchange', request);
    navigator.serviceWorker.ready.then(() => { if (!disposed) request(); });
    return () => { disposed = true; navigator.serviceWorker.removeEventListener('message', receive); navigator.serviceWorker.removeEventListener('controllerchange', request); };
  }, []);
  const [session, setSession] = useState(null), [offline, setOffline] = useState(false), [room, setRoom] = useState(null);
  const [name, setName] = useState(''), [code, setCode] = useState(''), [bots, setBots] = useState(0), [error, setError] = useState(null);
  const lobbyRef = useRef(null), remoteRef = useRef(null), connectPromiseRef = useRef(null), startupRef = useRef(false);
  const serverUrl = getRuntimeServerUrl(), socketPath = getRuntimeSocketPath();
  const report = useRef(value => setError(value.message || String(value))).current;
  const request = (event, payload = {}) => new Promise((resolve, reject) => {
    if (!lobbyRef.current?.connected) { reject(new Error('尚未连接房间服务')); return; }
    lobbyRef.current.timeout(5000).emit(event, payload, (failure, result) => failure ? reject(new Error('连接超时，请重试'))
      : result?.ok ? resolve(result.result) : reject(new Error(result?.error || '操作未完成')));
  });
  const clearRemote = () => { remoteRef.current?.dispose(); remoteRef.current?.socket.disconnect(); remoteRef.current = null; };
  async function establishLobby() {
    if (lobbyRef.current?.connected) return lobbyRef.current;
    const storage = window.sessionStorage, prior = storage.getItem('toe.identity.v2');
    let response = await fetch(`${serverUrl}/v2/identity`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prior ? { identityToken: prior } : {}) });
    if (prior && response.status === 401) response = await fetch(`${serverUrl}/v2/identity`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!response.ok) throw new Error('无法连接房间服务，请稍后重试');
    const identity = await response.json(); storage.setItem('toe.identity.v2', identity.identityToken);
    const io = await loadSocketIO();
    const socket = io(`${serverUrl}/lobby-v2`, { path: socketPath, auth: { identityToken: identity.identityToken }, transports: ['websocket'], autoConnect: false });
    lobbyRef.current = socket;
    socket.on('room', next => {
      setRoom(next);
      if (!next || next.returned || next.phase === 'waiting') { clearRemote(); setSession(null); return; }
      if (remoteRef.current?.matchId === next.matchId) return;
      clearRemote();
      const matchSocket = io(`${serverUrl}/authority-v2`, { path: socketPath, auth: { identityToken: identity.identityToken }, transports: ['websocket'], autoConnect: false });
      const remote = new RemoteSession(matchSocket, next.matchId, { onError: report }); remoteRef.current = remote;
      setOffline(false); setSession(remote); matchSocket.connect();
    });
    return new Promise((resolve, reject) => {
      socket.once('connect', () => resolve(socket)); socket.once('connect_error', failure => reject(new Error(failure.message))); socket.connect();
    });
  }
  async function connectLobby() {
    if (lobbyRef.current?.connected) return lobbyRef.current;
    if (connectPromiseRef.current) return connectPromiseRef.current;
    connectPromiseRef.current = establishLobby();
    try { return await connectPromiseRef.current; } finally { connectPromiseRef.current = null; }
  }
  useEffect(() => {
    if (startupRef.current) return;
    startupRef.current = true;
    if (window.sessionStorage.getItem('toe.identity.v2')) connectLobby().catch(report);
    // A session restores once on mount; later room actions use the same
    // connection promise instead of creating another socket on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const lobbyAction = async (event, payload) => { setError(null); setOffline(false); try { await connectLobby(); await request(event, payload); } catch (failure) { report(failure); } };
  const startOffline = resume => {
    setError(null); clearRemote(); lobbyRef.current?.disconnect(); lobbyRef.current = null; setRoom(null);
    try {
      const record = resume ? loadOfflineSave(window.localStorage) : null;
      if (resume && !record) throw new Error('没有新格式单机存档');
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      setOffline(true); setSession(new OfflineSession({ record, seed, id: `offline:${crypto.randomUUID()}`,
        storage: window.localStorage, onSaveError: report }));
    } catch (failure) { report(failure); }
  };
  const exit = async () => {
    try { if (!offline) await request('leaveRoom'); clearRemote(); setSession(null); setRoom(null); } catch (failure) { report(failure); }
  };
  const resetConnection = () => {
    clearRemote(); lobbyRef.current?.disconnect(); lobbyRef.current = null;
    setSession(null); setRoom(null); setError(null);
  };
  return <main className="authority-root">
    {error && <div className="authority-error" role="alert">{error}<button onClick={() => setError(null)}>关闭提示</button>
      {!offline && <button onClick={resetConnection}>返回首页重新连接</button>}
      {error.includes('uncertain') && remoteRef.current && <button onClick={() => remoteRef.current.retry().then(() => setError(null)).catch(report)}>重试同一次操作</button>}</div>}
    {session ? <SessionBoard key={offline ? 'offline' : session.matchId} session={session} offline={offline} onExit={exit}
      onReturn={() => request('returnRoom').catch(report)} report={report} />
      : room ? <section className="authority-lobby"><h1>房间 {room.code}</h1><p>{room.phase === 'waiting' ? '等待准备' : '等待其他玩家回到房间'}</p>
        {room.players.map(player => <p key={player.seat}>{player.name} · {player.isAi ? 'AI' : player.ready ? '已准备' : '未准备'}</p>)}
        {room.botCount > 0 && room.phase === 'waiting' && <p>另有 {room.botCount} 位 AI</p>}
        <button disabled={room.phase !== 'waiting' || room.viewerSeat < 0} onClick={() => lobbyAction('ready', { ready: !room.players[room.viewerSeat]?.ready })}>准备／取消准备</button>
        {room.ownerSeat === room.viewerSeat && <button disabled={room.phase !== 'waiting'} onClick={() => lobbyAction('startGame', {})}>开始对局</button>}
        <button onClick={exit}>离开房间</button>
      </section> : <section className="authority-lobby"><h1>ToE · 深渊探险</h1><p>探索、抉择，直面未知。</p>
        {offlineReady && <p role="status">离线资源已就绪</p>}
        <div><button onClick={() => startOffline(false)}>开始单机</button><button onClick={() => startOffline(true)}>继续单机</button></div>
        <label>你的名字<input value={name} onChange={event => setName(event.target.value)} maxLength={32} /></label>
        <label>AI 数量<input type="number" min="0" max="10" value={bots} onChange={event => setBots(Number(event.target.value))} /></label>
        <button onClick={() => lobbyAction('createRoom', { name, botCount: bots })}>创建房间</button>
        <label>房间码<input value={code} onChange={event => setCode(event.target.value.toUpperCase())} maxLength={6} /></label>
        <button onClick={() => lobbyAction('joinRoom', { code, name })}>加入房间</button>
        <button onClick={() => lobbyAction('spectate', { code })}>旁观</button>
        <button onClick={() => connectLobby().catch(report)}>重新连接房间</button>
      </section>}
  </main>;
}
