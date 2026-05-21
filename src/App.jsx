import { GodTooltip, AreaTooltip, GodDDCard, DDCard, DDCardBack, GodCardDisplay } from './components/cards';
import { GodChoiceModal, NyaBorrowModal, DrawRevealModal, TreasureDodgeModal, PeekHandModal, TortoiseOracleModal, AboutModal, FullLogModal, RoadmapModal } from './components/modals';
import { HoundsTimerBadge, StatBar, DiscardPile, HealCrossEffect, DeckPile, InspectionPile, PileDisplay, PlayerPanel } from './components/board';
import { RoomModal, LobbyModal, PrivacyToggleModal, TutorialOverlay, ConnectionErrorModal, DebugControls } from './components/lobby';
import InGameTutorialOverlay from './components/tutorial/InGameTutorialOverlay';
import { StartScreen } from './components/start/StartScreen';
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
// socket.io-client is loaded at runtime via CDN (only outside Claude Artifacts)

import {
  FIXED_ZONE_CARD_VARIANTS_BY_KEY,
  LETTERS,
  NUMS,
  INSPECTION_DECK,
  CS,
  GOD_CS,
  GOD_DEFS,
  createBlackGoatYoungCard,
} from "./constants/card";

// 导入拆分出的游戏工具模块（通过 game/index.js 统一导出）
import {
  shuffle,
  clamp,
  copyPlayers,
  isZoneCard,
  isNegativeZoneCard,
  getZoneCardEffectScope,
  zoneCardUsesTargetInteraction,
  isWinHand,
  cardLogText,
  removeCardsFromDiscard,
  makeInspectionMeta,
  clearPendingAnimDeathFlags,
  applyHpDamageWithLink,
  applyFx,
  applyInspectionForSanLoss,
  aiChooseRevealCard,
  aiChooseHunterLootCards,
  chooseFirstComePickForAI,
  chooseAiRoseThornTarget,
  shouldHunterKeepChasing,
  initGame,
  RINFO,
  ROLE_TREASURE,
  ROLE_HUNTER,
  ROLE_CULTIST,
  buildAnimQueue,
  buildFullHandSwapTransferQueueFromLogs,
  buildAiHuntEventAnimQueue,
  EMPTY_TURN_ANIM_FIELDS,
  withClearedTurnAnimFields,
  buildLocalCthDecisionState,
  buildPlayerTurnDrawQueue,
  cardsHuntMatch,
  moveEligibleBlankZones,
  isBlackGoatYoung,
  aiStep,
  startNextTurn as _startNextTurn,
  checkWin,
  playerDrawCard,
  resolveGodEncounterForAI,
  shouldTriggerGodResurrection,
  abandonGodFollower,
  convertGodFollower,
} from "./game";
import {
  rotateGsForViewer,
  derotateGs,
  isLocalSeatIndex,
  isMultiplayerGame,
  isAiSeat,
  isLocalCurrentTurn,
  isAiCurrentTurn,
  localDisplayName,
  isLocalDrawDecisionPhase,
  isLocalGodChoicePhase,
  isLocalFirstComePicker,
  isLocalSameAbyssTargetPhase,
  isLocalSphinxGuessPhase,
  isLocalDamageLinkSourcePhase,
  canLocalActOnTargetSelectionPhase,
  isLocalSwapGivePhase,
  isLocalBewitchCardPhase,
  isLocalHuntConfirmPhase,
  isLocalPublicCardPickPhase,
  isLocalHuntTargetSeat,
  isLocalCaveDuelTargetSeat,
  isLocalNyaBorrowPhase,
  isLocalTreasureDodgePhase,
  isLocalTreasureAoEDodgePhase,
  isLocalWinnerSeat,
} from "./game/rotateState";
import {
  splitAnimBoundLogs,
  bindAnimLogChunks,
  subtractLogOccurrences,
  splitTransitionLogs,
  appendAnimLogChunkToQueueEnd,
  extractSkillLogs,
  prepareAnimQueueLogs,
} from "./game/animLogs";
import {
  resolveTurnHighlightForStep,
  buildBewitchForcedCardQueue,
  buildInspectionRevealQueue,
  buildInspectionEventFlow,
} from "./game/animQueueHelpers";
import { _getZoomCompensatedRect, getPlayerHandAnchorCenter, getPileAnchorCenter } from './utils/dom';
import { ANIM_DURATION, ANIM_SPEED_SCALE, CARD_REVEAL_DURATION, ANIM_STEP_GAP } from './components/anim/constants';
import { SMOKE_COLS, FLOWER_CONFIGS, DICE_FACES, ANIM_CFG } from './components/anim/data';
import { CardFlipAnim } from './components/anim/CardFlipAnim';
import { KnifeEffect, GuillotineAnim } from './components/anim/DamageEffects';
import { DiscardMoveOverlay, CardTransferOverlay } from './components/anim/MoveOverlays';
import { GenericAnimOverlay, DiceRollAnim, YourTurnAnim } from './components/anim/GenericAnimOverlay';
import { PaperCupSVG, SwapCupOverlay, HuntScopeOverlay, BewitchEyeOverlay, SanMistOverlay, CaveDuelAnim } from './components/anim/SkillOverlays';
import { GodResurrectionAnim, TreasureMapAnim, CthulhuResurrectionAnim, RoleRevealAnim } from './components/anim/WinAnims';
import { TitleCandleFlames } from './components/anim/TitleCandleFlames';
import { AnimOverlay } from './components/anim/AnimOverlay';
import { formatFileSize, useResourcePreload } from './hooks/useResourcePreload';
import { useMultiplayerLobby } from './hooks/useMultiplayerLobby';
import { useAnimationQueue } from './hooks/useAnimationQueue';
import { useWindowSize } from './hooks/useWindowSize';
import { useGameAudio } from './hooks/useGameAudio';
import { useAiWatchdog, BAD_PHASES } from './hooks/useAiWatchdog';
import { Ellipsis } from './components/ui/Ellipsis';
import { FlyingEmoji } from './components/ui/FlyingEmoji';
import { EMOJI_LIST } from './components/ui/emojiData';
import { GammaSlider } from './components/ui/GammaSlider';
import { TargetSelectOverlay } from './components/ui/TargetSelectOverlay';

// ══════════════════════════════════════════════════════════════
//  UTILITIES
// ══════════════════════════════════════════════════════════════
const safeLS={
  get:(k)=>{try{return localStorage.getItem(k);}catch{/* ignore */ return null;}},
  set:(k,v)=>{try{localStorage.setItem(k,v);}catch{/* ignore */}},
};
const LOCAL_DEBUG_KEY='cthulhu_local_debug_mode';
const DEBUG_FORCE_CARD_KEY='cthulhu_debug_force_card';
const DEBUG_FORCE_CARD_TARGET_KEY='cthulhu_debug_force_card_target';
const DEBUG_FORCE_CARD_KEEP_KEY='cthulhu_debug_force_card_keep';
const DEBUG_PLAYER_ROLE_KEY='cthulhu_debug_player_role';
const ZONE_CARD_KEYS = LETTERS.flatMap(L => NUMS.map(N => `${L}${N}`));
const isLocalTestHost=()=>{
  if(typeof window==='undefined')return false;
  const host=(window.location.hostname||'').toLowerCase();
  return host==='localhost'||host==='127.0.0.1'||host==='::1'||host==='[::1]'||host.includes('trae');
};
const isLocalDebugEnabled=()=>{
  if(!isLocalTestHost())return false;
  try{return window.localStorage.getItem(LOCAL_DEBUG_KEY)==='1';}
  catch{return false;}
};
// Per-card copy counts — tuned for E[HP|HP card] ≈ −2
// Cards: A1×3 A2×3 … D4×3 — 3 copies each, 48 total
// Each card has exactly 3 copies → 48 cards total.
// Letter sums: A=12 B=12 C=12 D=12 ✓  Number sums: col1=12 col2=12 col3=12 col4=12 ✓
function shouldDelayHuntLootSelection(players,targetIdx,maxToTake,isMP){
  const target=players?.[targetIdx];
  if(!target?.isDead||!target?.revealHand)return false;
  if((target.hand?.length||0)<=maxToTake)return false;
  return !checkWin(players,isMP);
}

// ══════════════════════════════════════════════════════════════
//  WIN CHECK
// ══════════════════════════════════════════════════════════════
// ── Multiplayer rotation helpers ─────────────────────────────────
// Multiplayer rotation contract:
// - Only player-seat indices rotate.
// - Card indexes / hand indexes / counts (e.g. sourceCardIndex, pickIndex) never rotate.
// - When adding a new abilityData source/target seat field, update the tables below.
// Current rotated groups:
//   top-level: currentTurn, huntAbandoned
//   gameOver: winnerIdx, winnerIdx2
//   drawReveal: drawerIdx
//   abilityData single seats: drawerIdx, swapTi, huntTi, huntingAI, peekHandSource,
//     caveDuelSource, caveDuelTarget, damageLinkSource, roseThornSource, pickSource
//   abilityData seat arrays: peekHandTargets, caveDuelTargets, damageLinkTargets,
//     roseThornTargets, pickOrder


// ══════════════════════════════════════════════════════════════
//  GOD ENCOUNTER HELPERS
// ══════════════════════════════════════════════════════════════
// Wrapper that injects debug mode flag into the pure turn engine function
function startNextTurn(gs) {
  return _startNextTurn(gs, { isDebugMode: isLocalDebugEnabled() });
}

// ══════════════════════════════════════════════════════════════
//  AI STEP
// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
//  AI STEP
// ══════════════════════════════════════════════════════════════
//  ANIMATION SYSTEM  ─ queue-based, game freezes until all done
// ══════════════════════════════════════════════════════════════

// Duration (ms) per animation type
const AI_AUTO_STEP_DELAY=900;
const AI_PICK_STEP_DELAY=1300;

// ══════════════════════════════════════════════════════════════
//  MAIN GAME
// ══════════════════════════════════════════════════════════════
export default function Game(){
  const[gs,setGs]=useState(null);
  const[visualDiscard,setVisualDiscard]=useState([]);
  const[modal,setModal]=useState(null); // 'about' | 'roadmap' | null
  const[privatePeek,setPrivatePeek]=useState(null); // {card,targetName}
  const [serverAnnouncement, setServerAnnouncement] = useState(null);
  // ── Audio / Video / Main UI Resource Preloading ──────────────
  const { isLoading, loadingProgress, loadingError, currentFile, totalSize, loadedSize } = useResourcePreload();
  
  // ── Tutorial ──────────────────────────────────────────────────
  // Detect non-production environments (Claude Artifacts iframe, local dev, etc.)
  // Use multiple signals: iframe check + origin check + localhost
  const isArtifact = (()=>{
    try{
      if(window.self!==window.top)return true;          // inside any iframe (Artifacts)
      if(window.location.origin==='null')return true;   // sandboxed origin
      if(/localhost|127\.0\.1/.test(window.location.hostname))return false; // local dev: use real localStorage
      return false;                                      // deployed website: use real localStorage
    }catch{return true;}                              // cross-origin frame access blocked → treat as Artifact
  })();
  const TUTORIAL_KEY='cthulhu_tutorial_v2_done'; // v2: bump version to reset all prior cached state
  const isLocalTestMode=isLocalTestHost();
  const readTutorialDone=()=>isArtifact?false:safeLS.get(TUTORIAL_KEY)==='1';
  const [tutorialDone,setTutorialDone]=useState(readTutorialDone);
  const [showTutorial,setShowTutorial]=useState(false);
  const [showGodResurrection,setShowGodResurrection]=useState(false);
  const [showFullLog,setShowFullLog]=useState(false);
  const [tutorialStep,setTutorialStep]=useState(1);
  const [localDebugMode,setLocalDebugMode]=useState(()=>isLocalTestMode&&safeLS.get(LOCAL_DEBUG_KEY)==='1');
  const [debugForceCard]=useState(()=>isLocalTestMode&&safeLS.get(DEBUG_FORCE_CARD_KEY)||null);
  const [debugForceCardTarget,setDebugForceCardTarget]=useState(()=>isLocalTestMode&&safeLS.get(DEBUG_FORCE_CARD_TARGET_KEY)||'player');
  const [debugForceCardKeep,setDebugForceCardKeep]=useState(()=>isLocalTestMode&&safeLS.get(DEBUG_FORCE_CARD_KEEP_KEY)||'auto');
  const [debugForceCardType,setDebugForceCardType]=useState('zone');
  const [debugForceZoneCardKey,setDebugForceZoneCardKey]=useState('A1');
  const [debugForceZoneCardName,setDebugForceZoneCardName]=useState(
    ()=>FIXED_ZONE_CARD_VARIANTS_BY_KEY.A1?.[0]?.name||''
  );
  const [debugForceGodCardKey,setDebugForceGodCardKey]=useState('CTH');
  const [debugPlayerRole,setDebugPlayerRole]=useState(()=>isLocalTestMode&&safeLS.get(DEBUG_PLAYER_ROLE_KEY)||'auto');
  const [showDebugSettings,setShowDebugSettings]=useState(false);
  const isBattleScreen=!!gs;
  const {noteUserGesture,playOpenSound,playCloseSound,playTickSound,playHpDamageSound}=useGameAudio(isBattleScreen);
  const activeDebugConfig=useMemo(()=>{
    if(!localDebugMode){
      return{
        debugForceCard:null,
        debugForceCardTarget:null,
        debugForceCardKeep:'auto',
        debugForceCardType:null,
        debugForceZoneCardKey:null,
        debugForceZoneCardName:null,
        debugForceGodCardKey:null,
        debugPlayerRole:'auto',
      };
    }
    return{
      debugForceCard,
      debugForceCardTarget,
      debugForceCardKeep,
      debugForceCardType,
      debugForceZoneCardKey,
      debugForceZoneCardName,
      debugForceGodCardKey,
      debugPlayerRole,
    };
  },[
    localDebugMode,
    debugForceCard,
    debugForceCardTarget,
    debugForceCardKeep,
    debugForceCardType,
    debugForceZoneCardKey,
    debugForceZoneCardName,
    debugForceGodCardKey,
    debugPlayerRole,
  ]);
  useEffect(()=>{
    if(!isLocalTestMode)return;
    safeLS.set(LOCAL_DEBUG_KEY,localDebugMode?'1':'0');
  },[isLocalTestMode,localDebugMode]);

  useEffect(()=>{
    if(!isLocalTestMode)return;
    safeLS.set(DEBUG_FORCE_CARD_KEY,debugForceCard||'');
    safeLS.set(DEBUG_FORCE_CARD_TARGET_KEY,debugForceCardTarget);
    safeLS.set(DEBUG_FORCE_CARD_KEEP_KEY,debugForceCardKeep);
  },[isLocalTestMode,debugForceCard,debugForceCardTarget,debugForceCardKeep]);

  useEffect(()=>{
    if(!isLocalTestMode)return;
    safeLS.set(DEBUG_PLAYER_ROLE_KEY,debugPlayerRole);
  },[isLocalTestMode,debugPlayerRole]);

  function isCloseButtonText(text){
    const normalized=(text||'').replace(/\s+/g,'');
    return normalized==='✕'||normalized.startsWith('✕')||normalized.includes('关闭')||normalized.includes('取消');
  }

  function handleUiSfxCapture(e){
    const button=e.target?.closest?.('button');
    if(!button||button.disabled)return;
    if(button.dataset?.sfx==='none')return;
    noteUserGesture();
    const text=(button.textContent||'').trim();
    if(button.dataset?.sfx==='close'||isCloseButtonText(text))playCloseSound();
    else playOpenSound();
  }

  // ── Multiplayer ───────────────────────────────────────────────
  // Prefer explicit runtime/env configuration; default to same-origin reverse proxy.
  const SERVER_URL =
    (typeof window!=='undefined'&&window.__TOE_SERVER_URL__) ||
    (typeof import.meta!=='undefined'&&import.meta.env?.VITE_SERVER_URL) ||
    (typeof window!=='undefined'?window.location.origin:'');
  const SOCKET_PATH =
    (typeof window!=='undefined'&&window.__TOE_SOCKET_PATH__) ||
    (typeof import.meta!=='undefined'&&import.meta.env?.VITE_SOCKET_PATH) ||
    '/api/socket.io';
  useEffect(()=>{
    if(typeof window==='undefined') return undefined;
    const announcementUrl = `${SERVER_URL.replace(/\/$/,'')}/api/announcement`;
    let cancelled = false;
    async function syncAnnouncement(){
      try{
        const res = await fetch(announcementUrl,{cache:'no-store'});
        if(!res.ok) return;
        const data = await res.json();
        if(!cancelled) setServerAnnouncement(data?.announcement||null);
      }catch{
        // 静默失败：轮询只做联机公告兜底，不影响单机游玩
      }
    }
    syncAnnouncement();
    const intervalId = setInterval(syncAnnouncement,15000);
    return ()=>{
      cancelled = true;
      clearInterval(intervalId);
    };
  },[SERVER_URL]);
  const socketRef=useRef(null);
  const connTimeoutRef=useRef(null);
  const {
    playerUUID, setPlayerUUID, playerUUIDRef,
    multiLoading, setMultiLoading,
    toasts, addToast,
    roomModal, setRoomModal, roomModalRef,
    connErrModal, setConnErrModal,
    onlineOptionsModal, setOnlineOptionsModal,
    playerUsername, setPlayerUsername,
    playerUsernameSpecial, setPlayerUsernameSpecial,
    renameInput, setRenameInput,
    renameCdActive,
    renameInputVisible, setRenameInputVisible,
    joinRoomInput, setJoinRoomInput,
    lobbyModal,
    lobbyRooms, setLobbyRooms,
    lobbyLoading, setLobbyLoading,
    showPrivacyToggleConfirm,
    privacyWarnDontShow, setPrivacyWarnDontShow,
    handleCreateRoom,
    handleJoinRoom,
    handleSetReady,
    closeOnlineOptions,
    handleOpenLobby,
    handleRefreshLobby,
    handleJoinLobbyRoom,
    closeLobbyModal,
    handleTogglePrivacy,
    handleConfirmPrivacyToggle,
    handleCancelPrivacyToggle,
    handleRename,
    handleRandomUsername,
    closeRoomModal,
  } = useMultiplayerLobby({ socketRef });
  // 联机多人游戏状态
  const [isMultiplayer,setIsMultiplayer]=useState(false);
  const isMultiplayerRef=useRef(false);  // 供 socket 闭包读取最新值
  const [,setMyPlayerIndex]=useState(0);
  const myPlayerIndexRef=useRef(0);  // 同步 myPlayerIndex 供 socket 闭包使用
  const receivedGsRef=useRef(false); // 收到远端 state 时置 true，阻止 sync useEffect 回发
  const mpRoleRevealedRef=useRef(false); // 每局游戏只触发一次角色揭示
  const gameEndSentRef=useRef(false);      // 防止 gameEnd 重复发送
  const [isDisconnected,setIsDisconnected]=useState(false);
  const [mpCthSec,setMpCthSec]=useState(null);
  const [mpTurnSec,setMpTurnSec]=useState(null);       // 回合倒计时剩余秒数（显示用）
  const [mpDiscardSec,setMpDiscardSec]=useState(null); // 弃牌阶段倒计时
  const [mpHuntSec,setMpHuntSec]=useState(null);       // 追捕亮牌倒计时（被追捕方显示）
  // 房间倒计时显示（前端独立计时）
  const [cdSecondsLeft,setCdSecondsLeft]=useState(null);
  const [cdType,setCdType]=useState(null);   // 'start' | 'kick'
  const cdIntervalRef=useRef(null);
  const mpTurnIntervalRef=useRef(null);
  const mpHuntIntervalRef=useRef(null);
  const mpDiscardIntervalRef=useRef(null);
  const mpCthIntervalRef=useRef(null);
  // 表情功能
  const [flyingEmojis,setFlyingEmojis]=useState([]);  // [{id,emoji,startX,startY,endX,endY,arcHeight,durationMs}]
  const [showEmojiPicker,setShowEmojiPicker]=useState(false);
  const [emojiButtonPos,setEmojiButtonPos]=useState({top:70,right:20});
  const emojiClickDebounceRef=useRef(null); // 防抖：防止短时间内重复点击
  const discardPileRef=useRef(null);        // 弃牌堆位置

  // ── Gamma / brightness ────────────────────────────────────────
  const [gamma,setGamma]=useState(()=>{
    try{const v=parseFloat(localStorage.getItem('cthulhu_gamma'));return isNaN(v)?1:Math.max(0.5,Math.min(2,v));}catch{return 1;}
  });
  function handleGamma(v){
    setGamma(v);
    try{localStorage.setItem('cthulhu_gamma',String(v));}catch{/* ignore */}
  }
  // Apply gamma filter to document.body instead of a React container div.
  // Applying CSS filter to a div creates a new containing block for position:fixed children,
  // causing overlays to be positioned relative to the div instead of the viewport.
  // Applying to document.body avoids this: body-sized containing block == viewport.
  const gammaFilter=gamma===1?undefined:`brightness(${gamma.toFixed(2)}) contrast(${(1+(gamma-1)*0.3).toFixed(2)})`;
  useEffect(()=>{
    document.body.style.filter=gammaFilter||'';
    return()=>{document.body.style.filter='';};
  },[gammaFilter]);

  // Dynamically load socket.io-client from CDN (skipped in Artifact environment)
  function loadSocketIO(){
    return new Promise((resolve,reject)=>{
      if(window.io){resolve(window.io);return;}
      const s=document.createElement('script');
      s.src='https://cdn.socket.io/4.7.5/socket.io.min.js';
      s.onload=()=>resolve(window.io);
      s.onerror=()=>reject(new Error('socket.io-client 加载失败'));
      document.head.appendChild(s);
    });
  }

  // ── 连接后端（联机选项界面专用）─────────────────────────────
  async function connectSocket(onConnected){
    if(isArtifact){
      addToast('联机功能在预览环境中不可用，请部署到服务器后使用');
      return;
    }
    if(multiLoading)return;
    setMultiLoading(true);
    if(socketRef.current){socketRef.current.disconnect();socketRef.current=null;}
    if(connTimeoutRef.current){clearTimeout(connTimeoutRef.current);connTimeoutRef.current=null;}

    connTimeoutRef.current=setTimeout(()=>{
      if(socketRef.current){socketRef.current.disconnect();socketRef.current=null;}
      setMultiLoading(false);
      setConnErrModal(true);
    },5000);

    let ioFn;
    try{ ioFn=await loadSocketIO(); }
    catch{
      clearTimeout(connTimeoutRef.current);
      setMultiLoading(false);
      addToast('网络加载失败，请检查连接后重试');
      return;
    }
    const socket=ioFn(SERVER_URL,{path:SOCKET_PATH,transports:['polling','websocket'],reconnection:false});
    socketRef.current=socket;

    function cleanup(){clearTimeout(connTimeoutRef.current);connTimeoutRef.current=null;}

    socket.on('connect_error',(err)=>{
      cleanup();
      setMultiLoading(false);
      console.error('[multiplayer connect_error]', SERVER_URL, SOCKET_PATH, err?.message||err);
      setConnErrModal(true);
      socket.disconnect();
    });
    socket.on('uuidAssigned',({uuid})=>{
      setPlayerUUID(uuid);
      playerUUIDRef.current=uuid;
      safeLS.set('cthulhu_player_uuid',uuid);
    });
    // userInfo：打开联机选项界面时后端下发，含异常断线/房间恢复标志
    socket.on('userInfo',({username,isSpecialName,wasForceReset,waitingRoomExpired})=>{
      setPlayerUsername(username);
      setPlayerUsernameSpecial(!!isSpecialName);
      setRenameInput(username);
      cleanup();
      setMultiLoading(false);
      if(waitingRoomExpired){
        setRoomModal(null);
        setOnlineOptionsModal(true);
        addToast('由于你长时间离开页面，您已离线，请重新创建房间。');
      }
      if(wasForceReset){
        addToast('您上次在游戏房间强制下线，已退出房间');
      }
    });
    socket.on('renameSuccess',({username,isSpecialName})=>{
      setPlayerUsername(username);
      setPlayerUsernameSpecial(!!isSpecialName);
      setRenameInput(username);
    });
    socket.on('randomUsernameResult',({username})=>{
      setRenameInput(username);
    });
    socket.on('renameError',({msg})=>{
      addToast(msg);
    });
    // roomCreated：创建房间成功
    socket.on('roomCreated',({roomId,owner,isPrivate,players,count,max,countdown})=>{
      setMultiLoading(false);
      setOnlineOptionsModal(false);
      addToast(`创建成功！房间号：${roomId}`);
      setRoomModal({roomId,owner,isPrivate,players,count:count||1,max:max||12,countdown:countdown||null});
    });
    // roomUpdated：加入/变动/倒计时更新
    socket.on('roomUpdated',({roomId,owner,isPrivate,players,count,max,countdown})=>{
      setMultiLoading(false);
      setOnlineOptionsModal(false);
      setRoomModal(prev=>prev
        ?{...prev,roomId,owner,isPrivate,players,count:count??prev.count,max:max??prev.max,countdown:countdown!==undefined?countdown:prev.countdown}
        :{roomId,owner,isPrivate,players,count:count||players.length,max:max||12,countdown:countdown||null});
    });
    // joinError：加入房间失败
    socket.on('joinError',({msg})=>{
      setMultiLoading(false);
      addToast(msg);
    });
    // kickedFromRoom：被踢出
    socket.on('kickedFromRoom',({reason})=>{
      setRoomModal(null);
      addToast(reason||'你已被踢出房间');
      if(socketRef.current){socketRef.current.disconnect();socketRef.current=null;}
    });
    socket.on('roomClosed',({reason})=>{
      setRoomModal(null);
      setOnlineOptionsModal(true);
      addToast(reason||'房间已失效，请重新创建房间。');
    });
    // lobbyRooms：游戏大厅房间列表
    socket.on('lobbyRooms',({rooms})=>{
      setLobbyLoading(false);
      setLobbyRooms(rooms||[]);
    });
    // gameStart：多人游戏开始，只有本地视角中的房主 seat 初始化并广播 raw gs
    socket.on('gameStart',({roomId,players})=>{
      const myIdx=players.findIndex(p=>p.uuid===playerUUIDRef.current);
      const safeIdx=myIdx<0?0:myIdx;
      myPlayerIndexRef.current=safeIdx;
      setMyPlayerIndex(safeIdx);
      const resetPlayers=players.map(p=>({...p,ready:false}));
      setRoomModal(prev=>prev?{...prev,players:resetPlayers,countdown:null}:{roomId,players:resetPlayers,count:players.length,max:12,countdown:null,owner:null,isPrivate:true});
      setIsMultiplayer(true); isMultiplayerRef.current=true;
      setIsDisconnected(false);
      addToast('多人游戏开始！');
      mpRoleRevealedRef.current=false; // 每局重置角色揭示标志
      gameEndSentRef.current=false;       // 每局重置 gameEnd 发送标志
      if(isLocalSeatIndex(safeIdx)){
        // 房主：初始化游戏并广播给所有人
        const names=players.map(p=>p.username);
        const rawGs=initGame(
          names,
          activeDebugConfig.debugForceCard,
          activeDebugConfig.debugForceCardTarget,
          activeDebugConfig.debugForceCardKeep,
          activeDebugConfig.debugForceCardType,
          activeDebugConfig.debugForceZoneCardKey,
          activeDebugConfig.debugForceZoneCardName,
          activeDebugConfig.debugForceGodCardKey,
          activeDebugConfig.debugPlayerRole,
          startNextTurn,
        );
        animQueueRef.current=[];
        pendingGsRef.current=null;
        setAnimExiting(false);
        setHitIndices([]);
        setAnim(null);
        const rotatedGs=rotateGsForViewer(rawGs,0);
        // 开局广播先于 useEffect([gs])（soket 同步发送，useEffect 在 render 后触发）
        // 必须先标记 received=true，防止 useEffect 把遮蔽态 gs 再次广播覆盖真实状态
        receivedGsRef.current=true;
        // 房主已通过 gameStart 路径触发身份揭示，标记为已揭示，
        // 防止后续收到非房主广播时重复触发 role reveal（mpRoleRevealedRef 在 gameStart 时被 reset 为 false）
        mpRoleRevealedRef.current=true;
        // 与单机一致：先用遮蔽态渲染棋盘背景，动画结束后才解锁真实 phase
        setGs({...rotatedGs,phase:'ACTION',drawReveal:null,abilityData:{}});
        setAnim(null);
        setRoleRevealAnim({role:rotatedGs.players[0].role,pendingGs:rotatedGs});
        // 广播原始 gs（未旋转）给所有人
        socket.emit('mpStateSync',{roomId,gs:rawGs});
      }
      // 非房主等待接收 mpStateSync
    });
    // mpStateSync：收到房主广播的 raw gs 后，必须先 rotate 到本地视角，
    // 后续所有“本地玩家 / 当前行动者 / 当前响应者”判断都应基于 rotated + helper。
    socket.on('mpStateSync',({gs:rawGs})=>{
      if(!rawGs)return;
      const myIdx=myPlayerIndexRef.current;
      const rotated=rotateGsForViewer(rawGs,myIdx);
      receivedGsRef.current=true;
      animQueueRef.current=[];
      pendingGsRef.current=null;
      setAnimExiting(false);
      setHitIndices([]);
      setAnim(null);
      // 仅第一次收到（游戏开局）时显示角色揭示动画
      // 条件：任何有效首帧（不限 phase，只要游戏未结束）
      if(!mpRoleRevealedRef.current&&!rotated.gameOver){
        mpRoleRevealedRef.current=true;
        // 与单机/房主一致：先用遮蔽态渲染棋盘背景，动画结束后才解锁真实 phase
        syncVisibleLog(rotated.log||[]);
        setGs({...rotated,phase:'ACTION',drawReveal:null,abilityData:{}});
        setAnim(null);
        setRoleRevealAnim({role:rotated.players[0].role,pendingGs:rotated});
      }else{
        // 检测是否应该为旁观者播放翻牌动画
        // 条件：当前轮次不是自己（currentTurn≠0），且 gs 包含刚摸的牌信息
        const nonSelfDraw=!rotated.gameOver&&!isLocalCurrentTurn(rotated)&&(
          rotated.phase==='DRAW_REVEAL'||
          rotated.phase==='DRAW_SELECT_TARGET'||
          rotated.phase==='GOD_CHOICE'||
          // Forced-card path: phase is ACTION but drawReveal.card still holds the card for animation
          (rotated.phase==='ACTION'&&rotated.drawReveal?.card!=null&&rotated.drawReveal?.needsDecision===false&&rotated.drawReveal?.drawerIdx!=null&&!isLocalSeatIndex(rotated.drawReveal?.drawerIdx))
        );
        // 检测是否有骰子动画（寻宝者掷骰子规避负面效果）
        const lastLog=rotated.log[rotated.log.length-1]||'';
        const diceMatch=lastLog.match(/(.+?) 掷出 (\d+) 点/);
        const isDiceRoll=diceMatch&&!rotated.gameOver&&rotated.phase==='ACTION';
        if(isDiceRoll){
          const rollerName=diceMatch[1];
          const d1=parseInt(diceMatch[2],10);
          const dodgeSuccess=d1>=4;
          const isSelf=rollerName==='你'||rollerName===localDisplayName(0,rotated.players[0]?.name);
          // 用遮蔽态先渲染
          setGs({...rotated,phase:'ACTION',drawReveal:null,abilityData:{}});
          receivedGsRef.current=true;
          suppressNextBroadcastRef.current=true;
          pendingGsRef.current=rotated;
          animQueueRef.current=[];
          setAnim({type:'DICE_ROLL',d1,d2:0,heal:0,rollerName:isSelf?'你':rollerName,dodgeSuccess});
        }else if(nonSelfDraw){
          const drawnCard=rotated.phase==='GOD_CHOICE'
            ?rotated.abilityData?.godCard
            :rotated.drawReveal?.card;
          if(drawnCard){
            const drawerName=rotated.players[rotated.currentTurn]?.name||'???';
            const drawerPid=rotated.currentTurn;
            // 用遮蔽态先渲染，避免 DrawRevealModal/GOD_CHOICE 弹出
            setGs({...rotated,phase:'ACTION',drawReveal:null,abilityData:{}});
            receivedGsRef.current=true; // 防止 gs sync useEffect 广播遮蔽态
            suppressNextBroadcastRef.current=true; // advanceQueue 应用 pendingGs 时也不广播（已从服务器收到，不应回传）
            // 播放飞牌+翻牌动画，pendingGs 为真实态
            pendingGsRef.current=rotated;
            animQueueRef.current=[];
            setAnim({type:'DRAW_CARD',card:drawnCard,triggerName:drawerName,targetPid:drawerPid,msgs:rotated._drawLogs});
          }else{
            setGs(rotated);
          }
        }else if(!rotated.gameOver&&isLocalCurrentTurn(rotated)&&(
          rotated.phase==='DRAW_REVEAL'||
          rotated.phase==='DRAW_SELECT_TARGET'||
          rotated.phase==='GOD_CHOICE'||
          (rotated.phase==='ACTION'&&rotated.drawReveal?.card!=null&&rotated.drawReveal?.needsDecision===false)
        )){
          // 轮到自己时，同样需要播放 YOUR_TURN + DRAW_CARD 动画再解锁真实 phase
          const ph=rotated.phase;
          const drawnCard=ph==='GOD_CHOICE'?rotated.abilityData?.godCard:rotated.drawReveal?.card;
          if(drawnCard){
            if(rotated._playersBeforeThisDraw){
              visualPlayersLockRef.current=copyPlayers(rotated._playersBeforeThisDraw);
            }
            setGs({...rotated,phase:'ACTION',drawReveal:null,abilityData:{}});
            receivedGsRef.current=true;
            suppressNextBroadcastRef.current=true;
            pendingGsRef.current=rotated;
            animQueueRef.current=[];
            setAnim({type:'YOUR_TURN',msgs:rotated._turnStartLogs});
            animQueueRef.current=[{type:'DRAW_CARD',card:drawnCard,triggerName:'你',targetPid:0,msgs:rotated._drawLogs},...bindAnimLogChunks(buildAnimQueue({...gs,players:rotated._playersBeforeThisDraw||gs.players},rotated),{statLogs:rotated._statLogs})];
          }else{
            setGs(rotated);
          }
        }else{
          // 检测是否是AI追捕玩家0
          const isHuntingPlayer0=!rotated.gameOver&&rotated.phase==='PLAYER_REVEAL_FOR_HUNT'&&rotated.abilityData?.huntingAI!=null;
          if(isHuntingPlayer0){
            setGs({...rotated,phase:'ACTION',drawReveal:null,abilityData:{}});
            receivedGsRef.current=true;
            suppressNextBroadcastRef.current=true;
            pendingGsRef.current=rotated;
            animQueueRef.current=[];
            setAnim({type:'SKILL_HUNT',msgs:rotated.log.slice(-3),targetIdx:0});
          }else if(rotated.phase==='DISCARD_PHASE'&&!isLocalCurrentTurn(rotated)){
            // 非活跃玩家不应进入 DISCARD_PHASE：把收到的 DISCARD_PHASE 替换为 ACTION
            setGs({...rotated,phase:'ACTION',abilityData:{}});
          }else{
            setGs(rotated);
          }
        }
      }
    });
    // emojiReceived：收到其他玩家发的表情
    socket.on('emojiReceived',({fromUuid,emojis})=>{
      // 错开发射时间，每条间隔 80ms
      emojis.forEach((emoji,i)=>{
        setTimeout(()=>{
          // 发射起点：自己发的从屏幕左下角玩家区域，别人发的从屏幕顶部随机位置
          const isSelf=fromUuid===playerUUIDRef.current;
          let sx,sy;
          if(isSelf){
            // 从玩家手牌区域或左下角发射
            const handRect=_getZoomCompensatedRect(document.querySelector('[data-hand-area]'));
            if(handRect){
              sx=handRect.left+handRect.width/2;
              sy=handRect.top+handRect.height*0.3;
            }else{
              // 默认从左下角
              sx=window.innerWidth*0.15;
              sy=window.innerHeight*0.85;
            }
          }else{
            sx=window.innerWidth*0.1+Math.random()*window.innerWidth*0.5;
            sy=60+Math.random()*40;
          }
          // 终点：弃牌堆中心
          const dp=_getZoomCompensatedRect(discardPileRef.current);
          const ex=dp?dp.left+dp.width/2:window.innerWidth/2;
          const ey=dp?dp.top+dp.height/2:window.innerHeight*0.45;
          // 随机化
          const rand=(v,pct)=>v*(1+(Math.random()*2-1)*pct);
          const arc=rand(window.innerHeight*0.10,0.20);
          const dur=rand(900,0.20);
          const jx=ex+rand(18,0.20);
          const jy=ey+rand(12,0.20);
          const uid=`${Date.now()}-${Math.random()}`;
          setFlyingEmojis(prev=>[...prev,{id:uid,emoji,startX:sx,startY:sy,endX:jx,endY:jy,arcHeight:arc,durationMs:dur}]);
        },i*80);
      });
    });
    // heartbeatPing：回复心跳
    socket.on('heartbeatPing',()=>{
      if(socketRef.current) socketRef.current.emit('heartbeatPong');
    });
    // 监听服务器广播信息
    socket.on('serverAnnouncement',({ announcement })=>{
      setServerAnnouncement(announcement||null);
    });
    // aiTakeover：被 AI 接管（断线超时），显示断线遮罩
    socket.on('aiTakeover',()=>{
      setIsDisconnected(true);
      setIsMultiplayer(false); isMultiplayerRef.current=false;
      setMyPlayerIndex(0); myPlayerIndexRef.current=0;
      mpRoleRevealedRef.current=false;
    });
    // 多人游戏中 socket 断线（网络中断等）
    socket.on('disconnect',()=>{
      if(isMultiplayerRef.current){ setIsDisconnected(true); }
    });
    socket.on('serverError',(msg)=>{
      cleanup();
      setMultiLoading(false);
      addToast(`错误：${msg}`);
    });
    socket.on('connect',()=>{ onConnected(socket); });
  }

  // 点击"联机对战"→ 连接后端，打开联机选项界面
  function handleMultiplayer(){
    connectSocket(socket=>{
      socket.emit('openOnlineOptions',{uuid:playerUUID});
      setOnlineOptionsModal(true);
    });
  }

  // 表情：点击 emoji → 加入批次队列 → 300ms 内 flush 打包发送
  function handleEmojiClick(emoji){
    if(emojiClickDebounceRef.current)return;
    emojiClickDebounceRef.current=Date.now();
    setShowEmojiPicker(false);
    if(!socketRef.current||!roomModalRef.current?.roomId){
      setTimeout(()=>{emojiClickDebounceRef.current=null;},300);
      return;
    }
    // 立即发送，不使用队列，避免重复
    socketRef.current.emit('emojiSend',{uuid:playerUUIDRef.current,roomId:roomModalRef.current.roomId,emojis:[emoji]});
    setTimeout(()=>{emojiClickDebounceRef.current=null;},300);
  }
  const selfPanelRef=useRef(null);
  const emojiButtonRef=useRef(null);
  const [panelRect,setPanelRect]=useState(null);
  const roleTextRef=useRef(null);
  const [roleTextRect,setRoleTextRect]=useState(null);
  const handAreaRef=useRef(null);
  const mobileGodCardRefs=useRef(new Map());
  const [handAreaRect,setHandAreaRect]=useState(null);
  const [mobileArmedGodCardIdx,setMobileArmedGodCardIdx]=useState(null);
  const aiPanelAreaRef=useRef(null);
  const [aiPanelAreaRect,setAiPanelAreaRect]=useState(null);
  const deckAreaRef=useRef(null);
  const [deckAreaRect,setDeckAreaRect]=useState(null);
  const [roleRevealAnim,setRoleRevealAnim]=useState(null); // {role,pendingGs}|null
  const[hitIndices,setHitIndices]=useState([]);    // HP damage
  
  // --- 新增：用于 UI 延迟显示的 HP/SAN 状态 ---
  const [displayStats, setDisplayStats] = useState(() => gs?.players ? gs.players.map(p => ({ hp: p.hp, san: p.san })) : []);
  const[knifeTargets,setKnifeTargets]=useState([]); // pre-measured {pi,cx,cy} for KnifeEffect
  const[sanHitIndices,setSanHitIndices]=useState([]);
  const[sanTargets,setSanTargets]=useState([]); // pre-measured {pi,cx,cy,startX,startY} // SAN damage
  const[swapAnim,setSwapAnim]=useState(false);        // cup shuffle
  const[huntAnim,setHuntAnim]=useState(null);          // scope + vignette {targetIdx}
  const[cardTransfers,setCardTransfers]=useState([]);   // hand card transfer anims
  const[guillotineTargets,setGuillotineTargets]=useState([]); // pre-measured {x,y,w,h,cx,cy}
  const[bewitchAnim,setBewitchAnim]=useState(null);   // horus eye {cx,cy}
  const[hpHealIndices,setHpHealIndices]=useState([]); // HP heal
  const[sanHealIndices,setSanHealIndices]=useState([]); // SAN heal
  const[screenShake,setScreenShake]=useState(false);
  const[deathShake,setDeathShake]=useState(false);
  const prevDamageLinksRef=useRef([]);
  const prevLogLenRef=useRef(0);
  const damageLinkGhostTimersRef=useRef(new Map());
  const [damageLinkGhosts,setDamageLinkGhosts]=useState([]);
  const timerRef=useRef(null);
  const guillotinedPids=useMemo(()=>new Set((guillotineTargets||[]).map(t=>t?.pi).filter(v=>v!=null)),[guillotineTargets]);
  const logRef=useRef(null);
  const [visibleLog,setVisibleLog]=useState(Array.isArray(gs?.log)?gs.log:[]);
  const visibleLogRef=useRef(Array.isArray(gs?.log)?gs.log:[]);
  const visibleLogCountRef=useRef(Array.isArray(gs?.log)?gs.log.length:0);
  const visibleLogAuthorityRef=useRef(Array.isArray(gs?.log)?gs.log:[]);
  const shakeTimerRef=useRef(null);

  useEffect(()=>{
    if(typeof document==='undefined')return;
    const handleVisibilityChange=()=>{
      if(document.visibilityState!=='visible')return;
      clearTimeout(shakeTimerRef.current);
      setSwapAnim(false);
      setHuntAnim(null);
      setBewitchAnim(null);
      setCardTransfers([]);
      setKnifeTargets([]);
      setHitIndices([]);
      setSanTargets([]);
      setSanHitIndices([]);
      setHpHealIndices([]);
      setSanHealIndices([]);
      setGuillotineTargets([]);
      setScreenShake(false);
      setDeathShake(false);
    };
    document.addEventListener('visibilitychange',handleVisibilityChange);
    return()=>document.removeEventListener('visibilitychange',handleVisibilityChange);
  },[]);

  useEffect(()=>{
    if(typeof document==='undefined')return;
    const handleWaitingRoomReconnect=()=>{
      if(document.visibilityState!=='visible')return;
      if(gs||isMultiplayerRef.current)return;
      if(!roomModalRef.current?.roomId)return;
      if(multiLoading)return;
      if(socketRef.current?.connected)return;
      connectSocket(socket=>{
        socket.emit('openOnlineOptions',{uuid:playerUUIDRef.current||playerUUID});
      });
    };
    document.addEventListener('visibilitychange',handleWaitingRoomReconnect);
    return()=>document.removeEventListener('visibilitychange',handleWaitingRoomReconnect);
  },[gs,multiLoading,playerUUID,roomModalRef]);
  const lastInspectionSeqRef=useRef(0);
  const [houndsSecLeft,setHoundsSecLeft]=useState(null);

  // ── Responsive layout ──────────────────────────────────────
  const {w:vw}=useWindowSize();
  const DESIGN_WIDTH=1200;
  const { isMobile, scaleRatio, baseFontSizes, fontSizes, scaledAreaSafeInsetX, globalShiftX, middleRowHeight } = useMemo(() => {
    const isMobile = vw < 580;
    const isVerySmall = vw < 480;
    const scaledAreaSafeInsetX = isMobile ? 24 : 12;
    const narrowDesktopClipFix = vw <= 1220;
    const globalShiftX = narrowDesktopClipFix ? Math.min(12, Math.round((1220 - vw) * 0.5)) : 0;
    const rawScale = vw / DESIGN_WIDTH;
    const shouldScale = vw < DESIGN_WIDTH;
    const scaleRatio = shouldScale ? Math.min(rawScale, 1) : 1;
    const rem = 16;
    const baseFontSizes = {
      title: isMobile ? 0.75 * rem : isVerySmall ? 0.75 * rem : 0.875 * rem,
      subtitle: isMobile ? 0.5 * rem : isVerySmall ? 0.5 * rem : 0.625 * rem,
      body: isMobile ? 0.625 * rem : isVerySmall ? 0.625 * rem : 0.6875 * rem,
      small: isMobile ? 0.5 * rem : isVerySmall ? 0.5 * rem : 0.5625 * rem,
      tiny: isMobile ? 0.4375 * rem : isVerySmall ? 0.4375 * rem : 0.5 * rem,
    };
    const fontZoomCompensate = scaleRatio < 1 ? 1 / scaleRatio : 1;
    const fontSizes = {
      title: baseFontSizes.title * fontZoomCompensate,
      subtitle: baseFontSizes.subtitle * fontZoomCompensate,
      body: baseFontSizes.body * fontZoomCompensate,
      small: baseFontSizes.small * fontZoomCompensate,
      tiny: baseFontSizes.tiny * fontZoomCompensate,
    };
    const middleRowHeight = isMobile ? 248 : 282;
    return { isMobile, scaleRatio, baseFontSizes, fontSizes, scaledAreaSafeInsetX, globalShiftX, middleRowHeight };
  }, [vw]);

  const applyVisibleLogPrefix=useCallback((count,authorityOverride)=>{
    const authority=Array.isArray(authorityOverride)?authorityOverride:(Array.isArray(visibleLogAuthorityRef.current)?visibleLogAuthorityRef.current:[]);
    const safeCount=Math.max(0,Math.min(count,authority.length));
    visibleLogAuthorityRef.current=authority;
    visibleLogCountRef.current=safeCount;
    const prefix=authority.slice(0,safeCount);
    visibleLogRef.current=prefix;
    setVisibleLog(prefix);
  },[]);

  const syncVisibleLog=useCallback((nextLog)=>{
    const normalized=Array.isArray(nextLog)?nextLog:[];
    applyVisibleLogPrefix(normalized.length,normalized);
  },[applyVisibleLogPrefix]);

  const appendVisibleLog=useCallback((lines)=>{
    if(!Array.isArray(lines)||!lines.length)return;
    const normalized=[...lines];
    if(!normalized.length)return;
    const authority=Array.isArray(visibleLogAuthorityRef.current)?visibleLogAuthorityRef.current:[];
    if(!authority.length){
      visibleLogRef.current=[...visibleLogRef.current,...normalized];
      visibleLogCountRef.current=visibleLogRef.current.length;
      setVisibleLog(visibleLogRef.current);
      return;
    }
    let cursor=visibleLogCountRef.current;
    normalized.forEach(line=>{
      const idx=authority.findIndex((entry,i)=>i>=cursor&&entry===line);
      if(idx>=0)cursor=idx+1;
    });
    applyVisibleLogPrefix(cursor,authority);
  },[applyVisibleLogPrefix]);


  const getVisualDiscardForState=useCallback((stateLike)=>{
    const discard=[...(stateLike?.discard||[])];
    if(stateLike?._playersBeforeThisDraw&&stateLike?._drawnCard&&stateLike?._discardedDrawnCard){
      return removeCardsFromDiscard(discard,[stateLike._drawnCard]);
    }
    return discard;
  },[]);

  const suppressNextBroadcastRef=useRef(false); // set before bystander-anim pendingGs; cleared in advanceQueue
  const turnHighlightLockRef=useRef(null);
  const visualPlayersLockRef=useRef(null);
  const {
    anim,
    setAnim,
    animExiting,
    setAnimExiting,
    animQueueRef,
    pendingGsRef,
    triggerAnimQueue,
  } = useAnimationQueue({
    gs,
    copyPlayers,
    setGs,
    setVisualDiscard,
    syncVisibleLog,
    appendVisibleLog,
    getVisualDiscardForState,
    resolveTurnHighlightForStep,
    clearPendingAnimDeathFlags,
    prepareAnimQueueLogs,
    startNextTurn,
    applyNextTurnGs,
    cthContinueRestDraws:_cthContinueRestDraws,
    visibleLogRef,
    visibleLogAuthorityRef,
    turnHighlightLockRef,
    visualPlayersLockRef,
    suppressNextBroadcastRef,
    receivedGsRef,
    ANIM_STEP_GAP,
    CARD_REVEAL_DURATION,
    ANIM_DURATION,
    ANIM_SPEED_SCALE,
  });

  const isDrawnCardActuallyDiscarded=useCallback((stateLike,drawnCard)=>{
    if(!(stateLike?._animDiscardedDrawnCard ?? stateLike?._discardedDrawnCard) || !drawnCard)return false;
    return (stateLike?.discard||[]).some(card=>{
      if(card===drawnCard)return true;
      if(card?.id!=null&&drawnCard?.id!=null)return card.id===drawnCard.id;
      return card?.key===drawnCard?.key&&card?.name===drawnCard?.name&&card?.godKey===drawnCard?.godKey;
    });
  },[]);

  useEffect(()=>{if(logRef.current)logRef.current.scrollTop=logRef.current.scrollHeight;},[visibleLog.length]);

  useEffect(()=>{
    if(anim||animQueueRef.current.length>0)return;
    if(gs?._playersBeforeThisDraw)return;
    const nextLog=Array.isArray(gs?.log)?gs.log:[];
    const curLog=visibleLogRef.current;
    const same=curLog.length===nextLog.length&&curLog.every((line,i)=>line===nextLog[i]);
    if(!same)syncVisibleLog(nextLog);
  },[gs?.log,anim,syncVisibleLog,gs?._playersBeforeThisDraw]);

  useEffect(()=>()=>{damageLinkGhostTimersRef.current.forEach(t=>clearTimeout(t));damageLinkGhostTimersRef.current.clear();},[]);

  useEffect(()=>{
    const prevTimers=damageLinkGhostTimersRef.current;
    if(!gs?.players){
      prevDamageLinksRef.current=[];
      prevLogLenRef.current=Array.isArray(gs?.log)?gs.log.length:0;
      setDamageLinkGhosts([]);
      prevTimers.forEach(t=>clearTimeout(t));
      prevTimers.clear();
      return;
    }
    const extractPairs=(players)=>players.flatMap((p,i)=>{
      if(!p?.damageLink?.active)return [];
      const j=p.damageLink.partner;
      if(j==null||j<=i||!players[j]?.damageLink?.active||players[j].damageLink.partner!==i)return [];
      return [{a:i,b:j}];
    });
    const prevPairs=prevDamageLinksRef.current;
    const currentPairs=extractPairs(gs.players);
    const currentKeys=new Set(currentPairs.map(p=>`${p.a}-${p.b}`));
    const newLogs=(Array.isArray(gs.log)?gs.log:[]).slice(prevLogLenRef.current);
    prevPairs.forEach(pair=>{
      const key=`${pair.a}-${pair.b}`;
      if(currentKeys.has(key))return;
      const aName=gs.players[pair.a]?.name;
      const bName=gs.players[pair.b]?.name;
      const breakMsg=`【两人一绳】绳索断裂！${aName} 和 ${bName}`;
      const expireMsg=`【两人一绳】绳索未断裂！${aName} 和 ${bName}`;
      const mode=newLogs.some(m=>typeof m==='string'&&m.includes(breakMsg))?'break'
        : newLogs.some(m=>typeof m==='string'&&m.includes(expireMsg))?'fade'
        : 'fade';
      const ghostId=`${key}-${Date.now()}-${mode}`;
      setDamageLinkGhosts(prev=>[...prev.filter(g=>g.key!==key),{id:ghostId,key,a:pair.a,b:pair.b,mode}]);
      if(prevTimers.has(key))clearTimeout(prevTimers.get(key));
      const timeoutMs=mode==='break'?560:720;
      const timer=setTimeout(()=>{
        setDamageLinkGhosts(prev=>prev.filter(g=>g.id!==ghostId));
        prevTimers.delete(key);
      },timeoutMs);
      prevTimers.set(key,timer);
    });
    prevDamageLinksRef.current=currentPairs;
    prevLogLenRef.current=Array.isArray(gs.log)?gs.log.length:0;
    return ()=>{
      if(!gs?.players){
        prevTimers.forEach(t=>clearTimeout(t));
        prevTimers.clear();
      }
    };
  },[gs?.players,gs?.log]);

  useEffect(()=>{
    if(!gs||anim||animQueueRef.current.length>0||gs.gameOver||gs.phase==='PLAYER_WIN_PENDING'||gs.phase==='TREASURE_WIN')return;
    const normalized=moveEligibleBlankZones(gs.players,gs.log||[]);
    if(!normalized)return;
    setGs(prev=>{
      if(!prev||prev.gameOver||prev.phase==='PLAYER_WIN_PENDING'||prev.phase==='TREASURE_WIN')return prev;
      const recheck=moveEligibleBlankZones(prev.players,prev.log||[]);
      if(!recheck)return prev;
      return {...prev,players:recheck.players,log:recheck.log};
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs?.players,gs?.log?.length,gs?.gameOver,anim]);

  useEffect(()=>{
    if(!gs?.houndsOfTindalosActive||gs?.gameOver||showTutorial){
      setHoundsSecLeft(null);
      return;
    }
    const ignoredPhases=new Set(['HUNT_WAIT_REVEAL','PLAYER_REVEAL_FOR_HUNT','CAVE_DUEL_SELECT_TARGET','CAVE_DUEL_SELECT_CARD']);
    if(ignoredPhases.has(gs.phase)){
      setHoundsSecLeft(Math.max(0,15-(gs.houndsOfTindalosElapsed||0)));
      return;
    }
    setHoundsSecLeft(Math.max(0,15-(gs.houndsOfTindalosElapsed||0)));
    const iv=setInterval(()=>{
      setGs(prev=>{
        if(!prev||!prev.houndsOfTindalosActive||prev.gameOver)return prev;
        if(ignoredPhases.has(prev.phase)||anim||animQueueRef.current.length>0)return prev;
        const nextElapsed=(prev.houndsOfTindalosElapsed||0)+1;
        if(nextElapsed<15)return {...prev,houndsOfTindalosElapsed:nextElapsed};
        const P=copyPlayers(prev.players),Disc=[...prev.discard],L=[...prev.log];
        const ti=prev.currentTurn;
        if(P[ti]&&!P[ti].isDead){
          P[ti].hp=clamp(P[ti].hp-4);
          L.push(`廷达罗斯猎犬撕咬 ${P[ti].name}，其失去 4 HP`);
          if(P[ti].hp<=0){
            P[ti]._pendingAnimDeath = true;
            P[ti].isDead=true;P[ti].roleRevealed=true;
            L.push(`☠ ${P[ti].name}（${P[ti].role}）倒下了！`);
            if(P[ti].hand.length)Disc.push(...P[ti].hand);
            P[ti].hand=[];
            if(P[ti].godZone?.length){Disc.push(...P[ti].godZone);P[ti].godZone=[];P[ti].godName=null;P[ti].godLevel=0;}
          }
        }
        const houndsCard=INSPECTION_DECK.find(c=>c.effect==='houndsOfTindalos');
        const nextGs={...prev,players:P,discard:Disc,log:L,houndsOfTindalosActive:false,houndsOfTindalosTarget:ti,houndsOfTindalosElapsed:0,inspectionDeck:houndsCard?shuffle([...(prev.inspectionDeck||[]),houndsCard]):prev.inspectionDeck};
        const win=checkWin(P,prev._isMP);
        return win?{...nextGs,gameOver:win}:nextGs;
      });
    },1000);
    return()=>clearInterval(iv);
  },[gs?.houndsOfTindalosActive,gs?.houndsOfTindalosElapsed,gs?.phase,gs?.currentTurn,gs?.gameOver,showTutorial,anim]);

  useEffect(()=>{
    if(!gs||showTutorial||anim||animQueueRef.current.length>0||gs.gameOver||gs.phase==='AI_TURN')return;
    const events=(gs._inspectionEvents||[]).filter(ev=>ev?.seq>lastInspectionSeqRef.current);
    if(!events.length)return;
    lastInspectionSeqRef.current=Math.max(...events.map(ev=>ev.seq));
    const flow=buildInspectionEventFlow(
      {players:events[0]?.beforePlayers||gs.players,log:events[0]?.beforeLog||gs.log},
      events,
      {buildAnimQueue,copyPlayers}
    );
    const queue=flow.queue;
    triggerAnimQueue(queue,gs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs?._inspectionSeq,gs?._inspectionEvents,gs?.gameOver,anim,showTutorial]);

  // Measure player self-panel rect for tutorial steps 2-4 pointer
  useEffect(()=>{
    const update=()=>{
      if(showTutorial&&tutorialStep>=2&&tutorialStep<=4&&selfPanelRef.current){
        const r=_getZoomCompensatedRect(selfPanelRef.current);
        if(r)setPanelRect({top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
      }
      if(showTutorial&&tutorialStep===5&&roleTextRef.current){
        const r=_getZoomCompensatedRect(roleTextRef.current);
        if(r)setRoleTextRect({top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
      }
      if(showTutorial&&(tutorialStep===7||tutorialStep===15)&&handAreaRef.current){
        const r=_getZoomCompensatedRect(handAreaRef.current);
        if(r)setHandAreaRect({top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
      }
      if(showTutorial&&(tutorialStep===9||tutorialStep===11)&&aiPanelAreaRef.current){
        const r=_getZoomCompensatedRect(aiPanelAreaRef.current);
        if(r)setAiPanelAreaRect({top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
      }
      if(showTutorial&&(tutorialStep===12||tutorialStep===13)&&deckAreaRef.current){
        const r=_getZoomCompensatedRect(deckAreaRef.current);
        if(r)setDeckAreaRect({top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
      }
    };
    update();
    if(showTutorial){
      window.addEventListener('scroll',update,true);
      window.addEventListener('resize',update);
      return()=>{
        window.removeEventListener('scroll',update,true);
        window.removeEventListener('resize',update);
      };
    }
  },[showTutorial,tutorialStep,gs]);

  // When HP_DAMAGE anim fires: trigger knife effects + screen shake
  useEffect(()=>{
    if(anim?.type==='HP_DAMAGE'&&anim.hitIndices?.length){
      playHpDamageSound();
      setHitIndices(anim.hitIndices);
      // 与 SKILL_HUNT / BEWITCH 相同：双 rAF 测量 DOM 位置，避免 grid layout race
      // 先测量位置，再触发 screenShake，避免震动影响测量
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        const stamp=`${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
        const pts=anim.hitIndices.map((pi,idx)=>{
          const el=document.querySelector(`[data-pid="${pi}"]`);
          if(el){
            const r=_getZoomCompensatedRect(el);
            return{pi,cx:r.left+r.width/2,cy:r.top+r.height/2,animKey:`${stamp}-${pi}-${idx}`};
          }
          return{pi,cx:window.innerWidth/2,cy:window.innerHeight*0.3,animKey:`${stamp}-${pi}-${idx}`};
        });
        setKnifeTargets(pts);
        // 测量完成后再触发震动
        setScreenShake(true);
        clearTimeout(shakeTimerRef.current);
        shakeTimerRef.current=setTimeout(()=>{setScreenShake(false);},400);
      }));
    }else if(anim?.type==='SAN_DAMAGE'&&anim.hitIndices?.length){
      // 与 SKILL_HUNT / BEWITCH 相同：双 rAF 测量 DOM 位置，避免 grid layout race
      setSanHitIndices(anim.hitIndices); // 仍然保留用于面板边框高亮
      // 先测量位置，再触发 screenShake，避免震动影响测量
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        const srcEl=document.querySelector('[data-pid="0"]');
        const srcR=srcEl?_getZoomCompensatedRect(srcEl):{left:window.innerWidth*0.5,top:window.innerHeight*0.7,width:0,height:0};
        const srcX=srcR.left+srcR.width/2, srcY=srcR.top+srcR.height/2;
        const pts=anim.hitIndices.map(pi=>{
          const el=document.querySelector(`[data-pid="${pi}"]`);
          if(el){
            const r=_getZoomCompensatedRect(el);
            const cx=r.left+r.width/2, cy=r.top+r.height/2;
            const ox=((pi*17+5)%22)-11, oy=((pi*13+7)%16)-8;
            return{pi,cx,cy,startX:srcX+ox,startY:srcY+oy};
          }
          return{pi,cx:window.innerWidth/2,cy:window.innerHeight*0.3,startX:srcX,startY:srcY};
        });
        setSanTargets(pts);
        // 测量完成后再触发震动
        setScreenShake(true);
        clearTimeout(shakeTimerRef.current);
        shakeTimerRef.current=setTimeout(()=>setScreenShake(false),280);
      }));
      // 面板边框高亮恢复（850ms），但 sanTargets 不在这里清除：
      // 由 !anim 分支统一清除，避免与紧跟的 SAN_DAMAGE 动画产生竞态导致位置跳变
      setTimeout(()=>setSanHitIndices([]),850);
    }else if(anim?.type==='HP_HEAL'&&anim.hitIndices?.length){
      setHpHealIndices(anim.hitIndices);
      setTimeout(()=>setHpHealIndices([]),1300);
    }else if(anim?.type==='SAN_HEAL'&&anim.hitIndices?.length){
      setSanHealIndices(anim.hitIndices);
      setTimeout(()=>setSanHealIndices([]),1300);
    }else if(anim?.type==='SKILL_SWAP'){
      // Extract caster and target names from msgs (e.g. "X 对 Y 掉包")
      const swapMsg=anim.msgs?.find(m=>m.includes('掉包'));
      const swapMatch=swapMsg?.match(/^(.+?)对 (.+?) 【掉包】/);
      setSwapAnim({casterName:swapMatch?.[1]||'', targetName:swapMatch?.[2]||''});
      setTimeout(()=>setSwapAnim(null),900);
    }else if(anim?.type==='SKILL_HUNT'){
      const ti=anim.targetIdx??1;
      // 双 rAF：第一帧触发 layout，第二帧读取稳定后的位置
      // 同时排除 screenShake 偏移：用容器基准消除水平位移
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        const el=document.querySelector(`[data-pid="${ti}"]`);
        if(el){
          const r=_getZoomCompensatedRect(el);
          setHuntAnim({cx:r.left+r.width/2, cy:r.top+r.height/2});
        }else{
          setHuntAnim({cx:window.innerWidth/2, cy:window.innerHeight*0.25});
        }
      }));
      setTimeout(()=>setHuntAnim(null),1300);
    }else if(anim?.type==='SKILL_BEWITCH'){
      const bti=anim.targetIdx??1;
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        const bel=document.querySelector(`[data-pid="${bti}"]`);
        if(bel){const br=_getZoomCompensatedRect(bel);setBewitchAnim({cx:br.left+br.width/2,cy:br.top+br.height/2});}
        else{setBewitchAnim({cx:window.innerWidth/2,cy:window.innerHeight*0.25});}
      }));
      setTimeout(()=>setBewitchAnim(null),1200);
    }else if(anim?.type==='CARD_TRANSFER'){
      const{fromPid,dest,toPid,count}=anim;
      // 测量源点（优先取真正的手牌展示区）
      const srcPos=getPlayerHandAnchorCenter(fromPid);
      const srcX=srcPos.x;
      const srcY=srcPos.y;
      // 测量终点
      let destX,destY;
      if(dest==='discard'){
        const discardPos=getPileAnchorCenter(
          '[data-discard-pile]',
          {x:window.innerWidth*0.45,y:window.innerHeight*0.45}
        );
        destX=discardPos.x;
        destY=discardPos.y;
      }else if(dest==='player'){
        const destPos=getPlayerHandAnchorCenter(toPid);
        destX=destPos.x;
        destY=destPos.y;
      }else{
        // godzone = 同一面板的上部（角色区域）
        const srcPanelEl=document.querySelector(`[data-pid="${fromPid}"]`);
        const srcPanelRect=_getZoomCompensatedRect(srcPanelEl);
        destX=srcX;
        destY=srcPanelRect?srcPanelRect.top+srcPanelRect.height*0.25:srcY*0.5;
      }
      const key=`${fromPid}-${dest}-${toPid??'x'}-${Date.now()}`;
      setCardTransfers(prev=>[...prev,{srcX,srcY,destX,destY,count,key}]);
      setTimeout(()=>setCardTransfers(prev=>prev.filter(t=>t.key!==key)),750);
    }else if(anim?.type==='GUILLOTINE'&&anim.hitIndices?.length){
      let cancelled=false;
      requestAnimationFrame(()=>requestAnimationFrame(async ()=>{
        const pts=await Promise.all(anim.hitIndices.map(async idx=>{
          const el=document.querySelector(`[data-death-panel="${idx}"]`);
          if(!el)return null;
          const r=_getZoomCompensatedRect(el);
          let snapshotUrl=null;
          try{
            const { default: html2canvas } = await import('html2canvas');
            const canvas=await html2canvas(el,{
              backgroundColor:null,
              useCORS:true,
              logging:false,
              scale:1,
            });
            snapshotUrl=canvas.toDataURL("image/png");
          }catch(err){
            console.warn("[death-snapshot] capture failed for pid",idx,err);
          }
          return{pi:idx,x:r.left,y:r.top,w:r.width,h:r.height,cx:r.left+r.width/2,cy:r.top+r.height/2,snapshotUrl};
        }));
        if(!cancelled){
          setGuillotineTargets(pts.filter(Boolean));
        }
      }));
      const shakeTimer=setTimeout(()=>{
        setDeathShake(true);
        clearTimeout(shakeTimerRef.current);
        shakeTimerRef.current=setTimeout(()=>setDeathShake(false),220);
      },120);
      return()=>{
        cancelled=true;
        clearTimeout(shakeTimer);
      };
    }else if(anim?.type==='DEATH'){
      setGuillotineTargets([]);
      setDeathShake(false);
    }else if(!anim){
      setHitIndices([]);
      setKnifeTargets([]);
      setSanHitIndices([]);
      setSanTargets([]);
      setCardTransfers([]);
      setGuillotineTargets([]);
      setHpHealIndices([]);
      setSanHealIndices([]);
    }
  },[anim,playHpDamageSound]);

  // ── AI watchdog: stuck recovery + hard hang guard ───────────
  const handleAiRecover=useCallback((type,detail)=>{
    setGs(p=>{
      if(!p||isMultiplayerGame(p)||p.gameOver)return p;
      if(type==='stuck'){
        if(!isAiCurrentTurn(p)||!BAD_PHASES.includes(p.phase))return p;
        const safeLog=[...p.log,`${p.players[p.currentTurn]?.name||'该AI'} 的回合状态异常，系统强制推进流程`];
        return startNextTurn({...p,log:safeLog,currentTurn:p.currentTurn,skillUsed:true,restUsed:false,huntAbandoned:[]});
      }
      if(type==='hang'){
        if(!isAiCurrentTurn(p)||p.phase!=='AI_TURN')return p;
        if((detail.turnKey!=null&&p._turnKey!==detail.turnKey)||p.currentTurn!==detail.turn)return p;
        if((p.log?.length||0)!==detail.logLen)return p;
        const safeLog=[...p.log,`${p.players[p.currentTurn]?.name||'该AI'} 的AI回合疑似卡死，系统强制推进流程`];
        return startNextTurn({...p,log:safeLog,currentTurn:p.currentTurn,skillUsed:true,restUsed:false,huntAbandoned:[]});
      }
      return p;
    });
  },[]);
  useAiWatchdog({gs,anim,showTutorial,onRecover:handleAiRecover});

  // AI turn
  useEffect(()=>{
    if(!gs||gs.phase!=='AI_TURN'||gs.gameOver||gs.phase==='PLAYER_WIN_PENDING'||anim||showTutorial||isMultiplayerGame(gs))return;
    // Safety watchdog: if AI turn hangs for any reason, force-advance after 3.5s
    // (normal AI turn takes ~700ms + anim duration; 3.5s is generous but not user-visible)
    const watchdog=setTimeout(()=>{
      console.warn('[AI watchdog] AI turn exceeded 3.5s, force-advancing');
      const safeLog=[...gs.log,`${gs.players[gs.currentTurn]?.name||'该AI'} 的回合处理超时，系统强制结束其回合`];
      const safeGs=startNextTurn({...gs,log:safeLog,currentTurn:gs.currentTurn,skillUsed:true,restUsed:false,huntAbandoned:[]});
      setGs(safeGs);
    },20000);
    timerRef.current=setTimeout(()=>{
      let rawResult,newGs;
      try{
        rawResult=aiStep(gs, { isDebugMode: isLocalDebugEnabled() });
        const{_aiDrawnCard:_a,_aiName:_n,_playersBeforeNextDraw:_pbn,_aiHuntEvents:_he,_playersBeforeSkillAction:_pbsa,_preSkillLogs:_psl,_preSkillDiscard:_psd,_animMultiplyEvent:_ame,_animSphinxReveal:_asr,...stripped}=rawResult;
        newGs=stripped;
      }catch(e){
        console.error('[aiStep error]',e);
        // Safety fallback: forcibly advance to next turn so game never freezes
        const errMsg=e?.message?`（${e.message}）`:'';
        const safeLog=[...gs.log,`${gs.players[gs.currentTurn]?.name||'该AI'} 的回合处理异常${errMsg}，系统强制结束其回合`];
        const safeGs=startNextTurn({...gs,log:safeLog,currentTurn:gs.currentTurn,skillUsed:false,restUsed:false,huntAbandoned:[]});
        setGs(safeGs);return;
      }
      // If AI is hunting player 0, pause here for player input (after draw card anim)
      if(newGs.phase==='PLAYER_REVEAL_FOR_HUNT'){
        const oldLog=Array.isArray(gs.log)?gs.log:[];
        const nextLog=Array.isArray(newGs.log)?newGs.log:oldLog;
        const {currentTurnLogs}=splitTransitionLogs(oldLog,nextLog);
        const hasTurnStartDraw=!!gs._playersBeforeThisDraw;
        const aiTurnDrawnCard=hasTurnStartDraw?(rawResult._animAiDrawnCard??rawResult._aiDrawnCard??gs._aiDrawnCard??gs._drawnCard??null):null;
        const aiTurnDiscarded=hasTurnStartDraw?isDrawnCardActuallyDiscarded(rawResult,aiTurnDrawnCard):false;
        const fakeGs = (ps,log=gs.log) => ({...gs, players: ps, log});
        const queue=[];
        if(gs._playersBeforeThisDraw) queue.push({type:'YOUR_TURN',name:gs.players[gs.currentTurn]?.name||'???',msgs:gs._turnStartLogs});
        if(aiTurnDrawnCard) queue.push({type:'DRAW_CARD',card:aiTurnDrawnCard,triggerName:gs.players[gs.currentTurn]?.name||'???',targetPid:gs.currentTurn,msgs:gs._drawLogs});
        if(gs._playersBeforeThisDraw&&aiTurnDrawnCard){
          const drawFullHandSwapQ=buildFullHandSwapTransferQueueFromLogs(
            [...(gs._drawLogs||[]),...(gs._statLogs||[])],
            gs._playersBeforeThisDraw
          );
          const drawEffectQBase=bindAnimLogChunks(buildAnimQueue(fakeGs(gs._playersBeforeThisDraw),gs),{statLogs:gs._statLogs});
          const drawEffectQ=drawFullHandSwapQ.length
            ? [...drawFullHandSwapQ,...drawEffectQBase.filter(step=>step.type!=='CARD_TRANSFER')]
            : drawEffectQBase;
          queue.push(...drawEffectQ);
          if(drawEffectQ.length){
            visualPlayersLockRef.current=copyPlayers(gs._playersBeforeThisDraw);
            queue.push({
              type:'STATE_PATCH',
              players:gs.players,
              discard:aiTurnDiscarded?removeCardsFromDiscard(gs.discard,[aiTurnDrawnCard]):gs.discard
            });
          }
        }
        // Add discard anim if AI chose to discard the drawn card
        if(aiTurnDiscarded&&aiTurnDrawnCard){
          queue.push({type:'DISCARD',card:aiTurnDrawnCard,triggerName:gs.players[gs.currentTurn]?.name||'???',targetPid:gs.currentTurn});
          queue.push({type:'STATE_PATCH',players:gs.players,discard:gs.discard});
        }
        const newMsgs=nextLog.slice(oldLog.length);
        const fullHandSwapQ=buildFullHandSwapTransferQueueFromLogs(newMsgs,gs.players);
        const actionStatQBase=buildAnimQueue(gs,fakeGs(newGs.players,nextLog));
        const actionStatQ=fullHandSwapQ.length
          ? [...fullHandSwapQ,...actionStatQBase.filter(step=>step.type!=='CARD_TRANSFER')]
          : actionStatQBase;

        if(rawResult._playersBeforeSkillAction){
          queue.push({
            type:'STATE_PATCH',
            players:rawResult._playersBeforeSkillAction,
            discard:rawResult._preSkillDiscard||newGs.discard,
            msgs:rawResult._preSkillLogs||[],
          });
          queue.push({type:'TURN_BOUNDARY_PAUSE'});
        }

        const huntEventQueue=(rawResult._aiHuntEvents||[]).flatMap(evt=>buildAiHuntEventAnimQueue(evt,gs.players[gs.currentTurn]?.name||'???'));
        const hasFullHandSwap=newMsgs.some(m=>m.includes('交换了全部手牌'));

        if(huntEventQueue.length){
          if(hasFullHandSwap){
            const huntStatHitSet=new Set(huntEventQueue.flatMap(s=>['GUILLOTINE','DEATH','HP_DAMAGE','HP_HEAL','SAN_HEAL','HP_SAN_HEAL','SAN_DAMAGE'].includes(s.type)?(s.hitIndices||[]):[]));
            const dedupedActionStatQ=actionStatQ.filter(s=>!(['GUILLOTINE','DEATH','HP_DAMAGE','HP_HEAL','SAN_HEAL','HP_SAN_HEAL','SAN_DAMAGE'].includes(s.type)&&(s.hitIndices||[]).some(i=>huntStatHitSet.has(i))));
            queue.push(...dedupedActionStatQ, ...huntEventQueue);
          } else {
            queue.push(...huntEventQueue);
          }
        } else if(actionStatQ.length){
          queue.push(...actionStatQ);
        }
        const explicitCurrentLogs=[
          ...(gs._turnStartLogs||[]),
          ...(gs._drawLogs||[]),
          ...(gs._statLogs||[]),
          ...queue.flatMap(step=>Array.isArray(step.msgs)?step.msgs:[]),
        ];
        const residualLogs=subtractLogOccurrences(currentTurnLogs,explicitCurrentLogs);
        const finalQueue=appendAnimLogChunkToQueueEnd(queue,residualLogs);
        // 更新玫瑰倒刺快照，防止 useEffect 在动画结束后对已在 aiStep 中结算的弃牌重复触发
        roseThornPrevRef.current = newGs.players.map((player, idx) => ({
          idx,
          marked: [
            ...((player?.hand||[]).filter(card=>card?.roseThornHolderId===idx).map(card=>card.id)),
            ...((player?.godZone||[]).filter(card=>card?.roseThornHolderId===idx).map(card=>card.id)),
          ].filter(id=>id!=null),
        }));
        // 确保 pendingGs 中也清除 _pendingAnimDeath，防止 STATE_PATCH 后置灰效果被覆盖
        newGs={...newGs,players:newGs.players.map(p=>p._pendingAnimDeath?{...p,_pendingAnimDeath:false}:p)};
        // Play draw and discard animations first, then show hunt animation
        triggerAnimQueue(finalQueue, newGs, () => {
          // After draw animations complete, show hunt animation
          triggerAnimQueue([{type:'SKILL_HUNT',msgs:nextLog.slice(oldLog.length),targetIdx:0}], newGs);
        });
        return;
      }
      try{
        // Strip ALL animation-only temp fields before storing as real game state
        const{_aiDrawnCard,_aiName,_playersBeforeNextDraw,_aiHuntEvents,_playersBeforeSkillAction,_preSkillLogs,_preSkillDiscard,_cthRestDraws,_cthRestDrawLogs,_playersBeforeCthDraws,_aiHandLimitDiscards,_animMultiplyEvent,_animSphinxReveal,...stripped}=rawResult;
        newGs=stripped; // reassign: stripped has _playersBeforeThisDraw from startNextTurn
        const oldLog=Array.isArray(gs.log)?gs.log:[];
        const nextLog=Array.isArray(newGs.log)?newGs.log:oldLog;
        const newMsgs=nextLog.slice(oldLog.length);
        const j=newMsgs.join(' ');
        // Helper: build a gs-like object with substituted players for buildAnimQueue
        // fakeGs: use gs.log as the baseline so buildAnimQueue correctly detects new messages
        const fakeGs = (ps,log=gs.log) => ({...gs, players: ps, log});
        const hasTurnStartDraw=!!gs._playersBeforeThisDraw;
        const aiTurnDrawnCard=hasTurnStartDraw?(rawResult._animAiDrawnCard??rawResult._aiDrawnCard??gs._aiDrawnCard??gs._drawnCard??null):null;
        const aiTurnDiscarded=hasTurnStartDraw?isDrawnCardActuallyDiscarded(rawResult,aiTurnDrawnCard):false;
        const {currentTurnLogs}=splitTransitionLogs(oldLog,nextLog);
        const queue=[];
        // Animate CTH rest-draw forced cards from turn transition
        if(rawResult._cthRestDraws?.length>0){
          const cthQueue=rawResult._cthRestDraws.map(card=>({
            type:'DRAW_CARD',card,triggerName:'你',targetPid:0,
            msgs:rawResult._cthRestDrawLogs?.filter(l=>l.includes(card.name)||l.includes(card.key))||[]
          }));
          queue.push(...cthQueue);
        }
        if(gs._playersBeforeThisDraw) queue.push({type:'YOUR_TURN',name:gs.players[gs.currentTurn]?.name||'???',msgs:gs._turnStartLogs});
        // 2. Draw card anim for THIS AI (card drawn at turn start, stored in gs._drawnCard)
        if(aiTurnDrawnCard) queue.push({type:'DRAW_CARD',card:aiTurnDrawnCard,triggerName:gs.players[gs.currentTurn]?.name||'???',targetPid:gs.currentTurn,msgs:gs._drawLogs});
        // 2b. Stat changes caused by THIS AI's drawn card (draw effects: gs._playersBeforeThisDraw → gs.players)
        if(gs._playersBeforeThisDraw&&aiTurnDrawnCard){
          const drawFullHandSwapQ=buildFullHandSwapTransferQueueFromLogs(
            [...(gs._drawLogs||[]),...(gs._statLogs||[])],
            gs._playersBeforeThisDraw
          );
          const drawEffectQBase=bindAnimLogChunks(buildAnimQueue(fakeGs(gs._playersBeforeThisDraw),gs),{statLogs:gs._statLogs});
          const drawEffectQ=drawFullHandSwapQ.length
            ? [...drawFullHandSwapQ,...drawEffectQBase.filter(step=>step.type!=='CARD_TRANSFER')]
            : drawEffectQBase;
          queue.push(...drawEffectQ);
          if(drawEffectQ.length){
            visualPlayersLockRef.current=copyPlayers(gs._playersBeforeThisDraw);
            queue.push({
              type:'STATE_PATCH',
              players:gs.players,
              discard:aiTurnDiscarded?removeCardsFromDiscard(gs.discard,[aiTurnDrawnCard]):gs.discard
            });
          }
        }
        // 2c. Discard anim if AI chose to discard the drawn card
        if(aiTurnDiscarded&&aiTurnDrawnCard){
          queue.push({type:'DISCARD',card:aiTurnDrawnCard,triggerName:gs.players[gs.currentTurn]?.name||'???',targetPid:gs.currentTurn});
          queue.push({type:'STATE_PATCH',players:gs.players,discard:gs.discard});
        }
        // Append inspection events triggered by the draw
        let afterInspectionPlayers=gs.players;
        let afterInspectionLog=gs.log;
        const drawInspectionEvents=(newGs._inspectionEvents||[]).filter(ev=>ev?.seq>lastInspectionSeqRef.current);
        if(drawInspectionEvents.length){
          lastInspectionSeqRef.current=Math.max(...drawInspectionEvents.map(ev=>ev.seq));
          const inspectionFlow=buildInspectionEventFlow(
            {players:drawInspectionEvents[0]?.beforePlayers||gs.players,log:drawInspectionEvents[0]?.beforeLog||gs.log},
            drawInspectionEvents,
            {buildAnimQueue,copyPlayers}
          );
          queue.push(...inspectionFlow.queue);
          afterInspectionPlayers=inspectionFlow.players;
          afterInspectionLog=inspectionFlow.log;
        }
        if(_playersBeforeSkillAction){
          queue.push({
            type:'STATE_PATCH',
            players:_playersBeforeSkillAction,
            discard:_preSkillDiscard||newGs.discard,
            msgs:_preSkillLogs||[],
          });
          queue.push({type:'TURN_BOUNDARY_PAUSE'});
        }
        // 3. Dice anim (if AI rested)
        const restMsg=newMsgs.find(m=>m.includes('选择【休息】')&&m.includes('掷骰'));
        if(restMsg){
          const m=restMsg.match(/掷骰 (\d+)\+(\d+)，回复 (\d+)HP/);
          if(m){const rd1=+m[1],rd2=+m[2],rh=+m[3];queue.push({type:'DICE_ROLL',d1:rd1,d2:rd2,heal:rh,rollerName:rawResult._aiName||gs.players[gs.currentTurn]?.name});}}
        // 4. Skill anim (if used)
        // 提前清除 _pendingAnimDeath：STATE_PATCH 后面板立即置灰，不再等到整个队列播完
        const P_actionEnd=(rawResult._playersBeforeNextDraw||newGs.players).map(p=>p._pendingAnimDeath?{...p,_pendingAnimDeath:false}:p);
        const fullHandSwapQ=buildFullHandSwapTransferQueueFromLogs(newMsgs,gs.players);
        const actionStatQBase=buildAnimQueue(fakeGs(afterInspectionPlayers,afterInspectionLog),fakeGs(P_actionEnd,nextLog));
        const actionStatQ=fullHandSwapQ.length
          ? [...fullHandSwapQ,...actionStatQBase.filter(step=>step.type!=='CARD_TRANSFER')]
          : actionStatQBase;
        const huntEventQueue=(rawResult._aiHuntEvents||[]).flatMap(evt=>buildAiHuntEventAnimQueue(evt,gs.players[gs.currentTurn]?.name||'???'));
        const handLimitDiscardQueue=(_aiHandLimitDiscards||[]).map((card,idx,arr)=>({
          type:'DISCARD',
          card,
          triggerName:gs.players[gs.currentTurn]?.name||'???',
          targetPid:gs.currentTurn,
          msgs:idx===arr.length-1?newMsgs.filter(m=>m.includes('（上限）')):[],
        }));
        let orderedActionQ=null;
        const hasActualSwap=newMsgs.some(m=>/^.+对 .+ 【掉包】/.test(m));
        const hasFullHandSwap=newMsgs.some(m=>m.includes('交换了全部手牌'));
        if(hasActualSwap) queue.push({type:'SKILL_SWAP',msgs:extractSkillLogs(newMsgs,'swap')});
        else if(huntEventQueue.length){
          if(hasFullHandSwap){
            const huntStatHitSet=new Set(huntEventQueue.flatMap(s=>['GUILLOTINE','DEATH','HP_DAMAGE','HP_HEAL','SAN_HEAL','HP_SAN_HEAL','SAN_DAMAGE'].includes(s.type)?(s.hitIndices||[]):[]));
            const dedupedActionStatQ=actionStatQ.filter(s=>!(['GUILLOTINE','DEATH','HP_DAMAGE','HP_HEAL','SAN_HEAL','HP_SAN_HEAL','SAN_DAMAGE'].includes(s.type)&&(s.hitIndices||[]).some(i=>huntStatHitSet.has(i))));
            orderedActionQ=[...dedupedActionStatQ,...huntEventQueue];
          } else {
            orderedActionQ=huntEventQueue;
          }
        }
        else if(j.includes('【追捕】')||(j.includes('追捕')&&!j.includes('停止了追捕')&&!j.includes('放弃追捕'))){
          const huntMsg=newMsgs.find(m=>m.includes('【追捕】')||m.includes('追捕'));
          const huntMatch=huntMsg?.match(/对 (.+?) 【追捕】|追捕 (.+)/);
          const huntName=huntMatch?.[1]||huntMatch?.[2];
          const hti=huntName?newGs.players.findIndex(p=>p.name===huntName):-1;
          queue.push({type:'SKILL_HUNT',msgs:extractSkillLogs(newMsgs,'hunt'),targetIdx:hti>=0?hti:1});
        }
        else if(j.includes('蛊惑')){
          const bwMsg=newMsgs.find(m=>m.includes('蛊惑'));
          const bwMatch=bwMsg?.match(/对 (.+?) 【蛊惑】/);
          const bwName=bwMatch?.[1];
          const bwti=bwName?newGs.players.findIndex(p=>p.name===bwName):-1;
          const giftedMatch=bwMsg?.match(/赠予 \[([^\]]+)\]/);
          const giftedLabel=giftedMatch?.[1];
          const giftedCard=(bwti>=0&&giftedLabel)
            ? (P_actionEnd[bwti]?.hand||[]).find(c=>c.key===giftedLabel||c.name===giftedLabel)
            : null;
          const inspectionEvents=(newGs._inspectionEvents||[]).filter(ev=>ev?.seq>lastInspectionSeqRef.current);
          const inspectionRevealQ=buildInspectionRevealQueue(inspectionEvents);
          if(giftedCard&&bwti>=0){
            if(inspectionEvents.length){
              lastInspectionSeqRef.current=Math.max(lastInspectionSeqRef.current,...inspectionEvents.map(ev=>ev.seq||0));
            }
            const bewitchTurnIntroName=isAiSeat(gs,bwti)&&(
              zoneCardUsesTargetInteraction(giftedCard)||
              giftedCard?.type==='selfDamageHPPeek'||
              giftedCard?.type==='firstComePick'
            )?P_actionEnd[bwti]?.name:null;
            orderedActionQ=buildBewitchForcedCardQueue(gs.currentTurn,bwti,giftedCard,P_actionEnd[bwti]?.name,[...actionStatQ,...inspectionRevealQ],extractSkillLogs(newMsgs,'bewitch'),bewitchTurnIntroName);
          }else{
            queue.push({type:'SKILL_BEWITCH',msgs:extractSkillLogs(newMsgs,'bewitch'),targetIdx:bwti>=0?bwti:1});
          }
        }
        // Inject custom animations for multiply and sphinx reveal
        const sphinxReveal=rawResult._animSphinxReveal;
        const multiplyEvent=rawResult._animMultiplyEvent;
        const animInjections=[];
        if(sphinxReveal){
          const guessMsg=newMsgs.find(m=>m.includes('猜测牌堆顶的牌'));
          const resultMsg=newMsgs.find(m=>m.includes('猜测正确')||m.includes('猜测错误'));
          animInjections.push({
            type:'DRAW_CARD',
            card:sphinxReveal.card,
            triggerName:'斯芬克斯',
            targetPid:sphinxReveal.actorIdx,
            skipTravel:true,
            msgs:guessMsg?[guessMsg]:[]
          });
          if(sphinxReveal.guessCorrect){
            animInjections.push({
              type:'CARD_TRANSFER',
              fromPid:-1,
              dest:'player',
              toPid:sphinxReveal.actorIdx,
              count:1,
              msgs:resultMsg?[resultMsg]:[]
            });
          }
        }
        if(multiplyEvent){
          const multiplyMsg=newMsgs.find(m=>m.includes('【繁衍】'));
          animInjections.push({
            type:'CARD_TRANSFER',
            fromPid:multiplyEvent.fromIdx,
            dest:'player',
            toPid:multiplyEvent.toIdx,
            count:1,
            msgs:multiplyMsg?[multiplyMsg]:[]
          });
        }
        const finalActionQ=[...animInjections,...(orderedActionQ||actionStatQ)];
        // 5. Stat changes from THIS AI's action only (not next draw — those belong to next AI's queue)
        //    Compare gs (after this AI's draw) → _playersBeforeNextDraw (after action, before next draw)
        // 6. Advance to next player's turn
        let nextTurnIntroQueue=[];
        if(isLocalCurrentTurn(newGs)){
          queue.push(...finalActionQ);
          queue.push(...handLimitDiscardQueue);
          const playerTurnStartMsgs=newGs._turnStartLogs||[];
          const playerDrawMsgs=newGs._drawLogs||[];
          const playerStatQ=(newGs._playersBeforeThisDraw&&newGs.drawReveal?.card)
            ? bindAnimLogChunks(
                buildAnimQueue({...gs,players:newGs._playersBeforeThisDraw||gs.players},newGs),
                {statLogs:newGs._statLogs}
              )
            : [];
          if(newGs.drawReveal?.card){
            nextTurnIntroQueue=[
              {type:'YOUR_TURN',msgs:playerTurnStartMsgs},
              {type:'DRAW_CARD',card:newGs.drawReveal.card,triggerName:'你',targetPid:0,msgs:playerDrawMsgs},
              ...playerStatQ
            ];
          }else{
            // God card drawn: no drawReveal, card is in abilityData.godCard
            const godCard=newGs.abilityData?.godCard;
            nextTurnIntroQueue=[{type:'YOUR_TURN',msgs:playerTurnStartMsgs}];
            if(godCard) nextTurnIntroQueue.push({type:'DRAW_CARD',card:godCard,triggerName:'你',targetPid:0,msgs:playerDrawMsgs});
          }
        }else{
          // AI next: action stat changes go before queue ends; draw effects for next AI
          // will be shown at the start of that AI's own queue (after their banner + DRAW_CARD)
          queue.push(...finalActionQ);
          queue.push(...handLimitDiscardQueue);
          // 如果下一个是AI，且它摸首牌直接死亡导致了这局游戏结束，此时不会有真正的下一个AI回合勾子运行了，必须把它的暴毙动画立刻压入队列
          if(newGs.gameOver && newGs.currentTurn !== gs.currentTurn){
            const aiNextStatQ = bindAnimLogChunks(
              buildAnimQueue(fakeGs(P_actionEnd), newGs),
              {statLogs: newGs._statLogs||[]}
            );
            nextTurnIntroQueue=[...aiNextStatQ];
          }
        }
        // Append inspection events triggered by the AI action
        const actionInspectionEvents=(newGs._inspectionEvents||[]).filter(ev=>ev?.seq>lastInspectionSeqRef.current);
        if(actionInspectionEvents.length){
          lastInspectionSeqRef.current=Math.max(lastInspectionSeqRef.current,...actionInspectionEvents.map(ev=>ev.seq));
          const inspectionFlow=buildInspectionEventFlow(
            {players:actionInspectionEvents[0]?.beforePlayers||newGs.players,log:actionInspectionEvents[0]?.beforeLog||newGs.log},
            actionInspectionEvents,
            {buildAnimQueue,copyPlayers}
          );
          queue.push(...inspectionFlow.queue);
        }
        const explicitCurrentLogs=[
          ...(gs._turnStartLogs||[]),
          ...(gs._drawLogs||[]),
          ...(gs._statLogs||[]),
          ...queue.flatMap(step=>Array.isArray(step.msgs)?step.msgs:[]),
        ];
        const residualLogs=subtractLogOccurrences(currentTurnLogs,explicitCurrentLogs);
        const currentTurnQueue=appendAnimLogChunkToQueueEnd(queue,residualLogs);
        const currentTurnStatePatch=
          rawResult._playersBeforeNextDraw
            ? [{type:'STATE_PATCH',players:P_actionEnd,discard:newGs.discard}]
            : [];
        const finalQueue=[
          ...currentTurnQueue,
          ...currentTurnStatePatch,
          ...(currentTurnQueue.length&&nextTurnIntroQueue.length?[{type:'TURN_BOUNDARY_PAUSE'}]:[]),
          ...nextTurnIntroQueue
        ];
        // 更新玫瑰倒刺快照，防止 useEffect 在动画结束后对已在 aiStep 中结算的弃牌重复触发
        roseThornPrevRef.current = newGs.players.map((player, idx) => ({
          idx,
          marked: [
            ...((player?.hand||[]).filter(card=>card?.roseThornHolderId===idx).map(card=>card.id)),
            ...((player?.godZone||[]).filter(card=>card?.roseThornHolderId===idx).map(card=>card.id)),
          ].filter(id=>id!=null),
        }));
        // 确保 pendingGs 中也清除 _pendingAnimDeath，防止 STATE_PATCH 后置灰效果被覆盖
        newGs={...newGs,players:newGs.players.map(p=>p._pendingAnimDeath?{...p,_pendingAnimDeath:false}:p)};
        triggerAnimQueue(finalQueue,newGs);
      }catch(e){
        console.error('[AI turn queue error]',e);
        const errMsg=e?.message?`（${e.message}）`:'';
        const safeLog=[...(Array.isArray(gs.log)?gs.log:[]),`${gs.players[gs.currentTurn]?.name||'该AI'} 的动画结算异常${errMsg}，系统强制结束其回合`];
        const safeGs=startNextTurn({...gs,log:safeLog,currentTurn:gs.currentTurn,skillUsed:false,restUsed:false,huntAbandoned:[]});
        setGs(safeGs);return;
      }
    },2100);
    return()=>{clearTimeout(timerRef.current);clearTimeout(watchdog);};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs?.currentTurn,gs?.phase,gs?._turnKey,anim,gs?.gameOver]);

  // 多人游戏结束时通知后端重置房间状态（用 ref 防止因 isMultiplayer 变化导致的重复发送）
  useEffect(()=>{
    if(!isMultiplayer||!gs?.gameOver)return;
    if(gameEndSentRef.current)return;
    gameEndSentRef.current=true;
    if(socketRef.current?.connected){
      // 确定获胜者身份
      let winnerRole = null;
      if (gs.gameOver.winner === ROLE_TREASURE || gs.gameOver.winner === ROLE_HUNTER || gs.gameOver.winner === ROLE_CULTIST) {
        winnerRole = gs.gameOver.winner;
      }
      socketRef.current.emit('gameEnd',{uuid:playerUUID,roomId:roomModal?.roomId,winnerRole});
      // 广播最终 gs 让其他玩家也看到结算界面
      const rawFinalGs=derotateGs(gs,myPlayerIndexRef.current);
      socketRef.current.emit('mpStateSync',{roomId:roomModal?.roomId,gs:rawFinalGs});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs?.gameOver,isMultiplayer,playerUUID,roomModal?.roomId]);

  // ── 多人游戏：本地 gs 变化后广播给房间其他人 ──────────────────
  // receivedGsRef 防止接收远端 state 后回发（避免乒乓死循环）
  // TREASURE_WIN / PLAYER_WIN_PENDING 是本地过渡态，不广播（等 revealWin→gameOver 再广播）
  useEffect(()=>{
    if(!gs||!isMultiplayer||!socketRef.current)return;
    if(gs.gameOver)return; // gameEnd event 单独处理
    if(gs.phase==='TREASURE_WIN'||gs.phase==='PLAYER_WIN_PENDING')return; // local-only phases
    if(receivedGsRef.current){receivedGsRef.current=false;return;}
    const room=roomModal;
    if(!room?.roomId)return;
    const rawGs=derotateGs(gs,myPlayerIndexRef.current);
    socketRef.current.emit('mpStateSync',{roomId:room.roomId,gs:rawGs});
  },[gs,anim,showTutorial,isMultiplayer,roomModal]);

  // Auto-freeze game the instant player 寻宝者 has a winning hand
  useEffect(()=>{
    if(!gs||gs.gameOver||gs.phase!=='ACTION'||showTutorial)return;
    const p0=gs.players[0];
    if(p0&&!p0.isDead&&p0.role===ROLE_TREASURE&&isWinHand(p0.hand)){
      setGs(g=>g?{...g,phase:'TREASURE_WIN'}:g);
    }
  },[gs,anim,showTutorial]);

  // Handle AI automatic target selection for damage link (两人一绳)
  useEffect(()=>{
    if(!gs||gs.phase!=='DAMAGE_LINK_SELECT_TARGET'||gs.gameOver||gs.phase==='PLAYER_WIN_PENDING'||anim||showTutorial||isMultiplayerGame(gs))return;
    const {damageLinkTargets,damageLinkSource}=gs.abilityData;
    if(!damageLinkTargets||damageLinkSource==null)return;
    if(!isAiSeat(gs,damageLinkSource))return;
    if(gs.abilityData?.damageLinkAutoChoosing)return;
    // AI automatically selects the first available target
    if(damageLinkTargets.length>0){
      const targetIndex=damageLinkTargets[0];
      // 添加AI选择目标的日志
      const sourcePlayer=gs.players[damageLinkSource];
      const targetPlayer=gs.players[targetIndex];
      const L=[...gs.log,`【两人一绳】${sourcePlayer.name} 选择了 ${targetPlayer.name} 作为目标`];
      setGs({...gs,log:L,abilityData:{...gs.abilityData,damageLinkAutoChoosing:true}});
      // 延迟一下再执行，让日志有时间显示
      setTimeout(()=>{
        damageLinkSelectTarget(targetIndex);
      }, AI_AUTO_STEP_DELAY);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs,anim,showTutorial]);

  // Handle AI automatic target selection for cave duel (穴居人战争)
  useEffect(()=>{
    if(!gs||gs.phase!=='CAVE_DUEL_SELECT_TARGET'||gs.gameOver||gs.phase==='PLAYER_WIN_PENDING'||anim||showTutorial||isMultiplayerGame(gs))return;
    const {caveDuelTargets,caveDuelSource}=gs.abilityData;
    if(!Array.isArray(caveDuelTargets)||caveDuelSource==null||!isAiSeat(gs,caveDuelSource))return;
    if(gs.abilityData?.caveDuelAutoChoosing)return;
    const sourcePlayer=gs.players[caveDuelSource];
    if(!sourcePlayer||sourcePlayer.isDead)return;
    const validTargets=caveDuelTargets.filter(i=>gs.players[i]&&!gs.players[i].isDead&&i!==caveDuelSource&&gs.players[i].hand.length>0);
    if(!validTargets.length)return;
    const targetIndex=[...validTargets].sort((a,b)=>(gs.players[b].hand.length-gs.players[a].hand.length)||(gs.players[a].hp-gs.players[b].hp))[0];
    setGs({...gs,abilityData:{...gs.abilityData,caveDuelAutoChoosing:true}});
    setTimeout(()=>{
      caveDuelSelectTarget(targetIndex);
    },AI_AUTO_STEP_DELAY);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs,anim,showTutorial]);

  // Handle AI automatic target selection for rose thorn (玫瑰倒刺)
  useEffect(()=>{
    if(!gs||gs.phase!=='ROSE_THORN_SELECT_TARGET'||gs.gameOver||gs.phase==='PLAYER_WIN_PENDING'||anim||showTutorial||isMultiplayerGame(gs))return;
    const {roseThornTargets,roseThornSource}=gs.abilityData;
    if(!Array.isArray(roseThornTargets)||roseThornSource==null||!isAiSeat(gs,roseThornSource))return;
    if(gs.abilityData?.roseThornAutoChoosing)return;
    const sourcePlayer=gs.players[roseThornSource];
    if(!sourcePlayer||sourcePlayer.isDead)return;
    const validTargets=roseThornTargets.filter(i=>gs.players[i]&&!gs.players[i].isDead&&i!==roseThornSource);
    if(!validTargets.length)return;
    let targetIndex=null;
    
    // 邪祀者优先选择追猎者作为目标
    if(sourcePlayer.role===ROLE_CULTIST){
      const hunterTargets=validTargets.filter(i=>gs.players[i].role===ROLE_HUNTER);
      if(hunterTargets.length>0){
        // 选择HP最低的追猎者
        targetIndex=[...hunterTargets].sort((a,b)=>(gs.players[a].hp-gs.players[b].hp))[0];
      }
    }
    
    // 如果没有找到合适的目标，使用默认逻辑
    if(targetIndex===null){
      targetIndex=[...validTargets].sort((a,b)=>(gs.players[b].hand.length-gs.players[a].hand.length)||(gs.players[a].hp-gs.players[b].hp))[0];
    }
    
    targetIndex=chooseAiRoseThornTarget(gs.players, roseThornSource, validTargets);
    setGs({...gs,abilityData:{...gs.abilityData,roseThornAutoChoosing:true}});
    setTimeout(()=>{
      roseThornSelectTarget(targetIndex);
    },AI_AUTO_STEP_DELAY);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs,anim,showTutorial]);

  // Handle AI automatic target selection for peek hand (血之窥探)
  useEffect(()=>{
    if(!gs||gs.phase!=='PEEK_HAND_SELECT_TARGET'||gs.gameOver||anim||showTutorial||isMultiplayerGame(gs))return;
    const {peekHandTargets,peekHandSource,peekHandAutoChoosing}=gs.abilityData||{};
    if(!peekHandTargets||peekHandSource==null||!isAiSeat(gs,peekHandSource)||peekHandAutoChoosing)return;
    const validTargets=peekHandTargets.filter(i=>gs.players[i]&&!gs.players[i].isDead&&(gs.players[i].hand?.length||0)>0);
    if(!validTargets.length)return;
    const targetIndex=[...validTargets].sort((a,b)=>(gs.players[b].hand.length-gs.players[a].hand.length)||(a-b))[0];
    const sourcePlayer=gs.players[peekHandSource];
    const targetPlayer=gs.players[targetIndex];
    const L=[...gs.log,`【血之窥探】${sourcePlayer.name} 选择偷看 ${targetPlayer.name} 的一张手牌`];
    setGs({...gs,log:L,abilityData:{...gs.abilityData,peekHandAutoChoosing:true}});
    setTimeout(()=>{
      peekHandSelectTarget(targetIndex);
    },AI_AUTO_STEP_DELAY);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs,anim,showTutorial]);

  useEffect(()=>{
    if(!gs||gs.phase!=='FIRST_COME_PICK_SELECT'||gs.gameOver||anim||showTutorial)return;
    const pickOrder=gs.abilityData?.pickOrder||[];
    const pickIndex=gs.abilityData?.pickIndex||0;
    const pickerIdx=pickOrder[pickIndex];
    if(pickerIdx==null||isLocalSeatIndex(pickerIdx))return;
    const t=setTimeout(()=>{
      setGs(prev=>{
        if(!prev||prev.phase!=='FIRST_COME_PICK_SELECT')return prev;
        const ad=prev.abilityData||{};
        const cards=[...(ad.revealedCards||[])];
        const currentPicker=ad.pickOrder?.[ad.pickIndex||0];
        if(currentPicker==null||isLocalSeatIndex(currentPicker)||!cards.length)return prev;
        let P=copyPlayers(prev.players),D=[...prev.deck],Disc=[...prev.discard],L=[...prev.log];
        const chosenIdx=chooseFirstComePickForAI(cards,currentPicker,P);
        const [chosenCard]=cards.splice(chosenIdx,1);
        P[currentPicker].hand.push(chosenCard);
        L.push(`【先到先得】${P[currentPicker].name} 选择了 ${cardLogText(chosenCard,{alwaysShowName:true})}`);
        const nextPickIndex=(ad.pickIndex||0)+1;
        const win=checkWin(P,prev._isMP);
        if(win)return {...prev,players:P,deck:D,discard:Disc,log:L,gameOver:win,phase:'ACTION',abilityData:{}};
        if(nextPickIndex>=(ad.pickOrder?.length||0)||cards.length===0){
          const nextTurnOwner=ad._turnOwner??prev.currentTurn;
          return {...prev,players:P,deck:D,discard:Disc,log:L,currentTurn:nextTurnOwner,phase:isAiSeat(prev,nextTurnOwner)?'AI_TURN':'ACTION',abilityData:{
            ...(ad.fromRest?{fromRest:true}:{}),
            ...(ad.cthDrawsRemaining!=null?{cthDrawsRemaining:ad.cthDrawsRemaining}:{}),
          },
            // 先到先得的起手摸牌/翻牌动画在进入共享选牌阶段前已经播过；结束后继续当前回合时不应再重播
            _aiDrawnCard:null,
            _drawnCard:null,
            _discardedDrawnCard:false,
            _playersBeforeThisDraw:null,
            _turnStartLogs:[],
            _drawLogs:[],
            _statLogs:[],
            _preTurnPlayers:null,
          };
        }
        return {...prev,players:P,deck:D,discard:Disc,log:L,phase:'FIRST_COME_PICK_SELECT',abilityData:{...ad,revealedCards:cards,pickIndex:nextPickIndex}};
      });
    },AI_PICK_STEP_DELAY);
    return()=>clearTimeout(t);
  },[gs,anim,showTutorial]);

  const getRoseThornMarkedIds=(player,idx)=>[
    ...((player?.hand||[]).filter(card=>card?.roseThornHolderId===idx).map(card=>card.id)),
    ...((player?.godZone||[]).filter(card=>card?.roseThornHolderId===idx).map(card=>card.id)),
  ].filter(id=>id!=null);
  const roseThornPrevRef = useRef(null);
  useEffect(()=>{
    if(!gs || showTutorial) return;
    const playerCount = gs.players?.length || 0;
    if(!playerCount) return;
    const snapshot = gs.players.map((player, idx) => ({
      idx,
      marked: getRoseThornMarkedIds(player, idx),
    }));
    let prev = roseThornPrevRef.current;
    if (!prev || !Array.isArray(prev) || prev.length !== playerCount) {
      roseThornPrevRef.current = snapshot;
      return;
    }
    const losses = snapshot.map(({ idx, marked }) => {
      const prevMarked = (prev.find(p => p.idx === idx)?.marked) || [];
      const lostIds = prevMarked.filter(id => !marked.includes(id));
      return { idx, lostCount: lostIds.length };
    }).filter(x => x.lostCount > 0 && gs.players[x.idx] && !gs.players[x.idx].isDead);
    if (!losses.length) {
      roseThornPrevRef.current = snapshot;
      return;
    }
    let P = copyPlayers(gs.players), D = [...gs.deck], Disc = [...gs.discard], L = [...gs.log];
    losses.forEach(({ idx, lostCount }) => {
      applyHpDamageWithLink(P, idx, 2 * lostCount, Disc, L, gs.currentTurn, D);
      L.push(`【玫瑰倒刺】${P[idx].name} 失去标记手牌，受到 ${2 * lostCount} HP 伤害`);
    });
    const win = checkWin(P, gs._isMP);
    const newGs = {
      ...gs,
      players: P,
      deck: D,
      discard: Disc,
      log: L,
      ...(win ? { gameOver: win } : {})
    };
    roseThornPrevRef.current = P.map((player, idx) => ({
      idx,
      marked: getRoseThornMarkedIds(player, idx),
    }));
    const queue = bindAnimLogChunks(buildAnimQueue(gs, newGs), splitAnimBoundLogs(L.slice(gs.log.length)));
    if (queue.length && !anim) {
      triggerAnimQueue(queue, newGs);
    } else {
      setGs(newGs);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs, showTutorial, anim]);

  // Trigger god resurrection animation for cultist victory
  useEffect(()=>{
    if(!gs||gs.gameOver||gs.phase==='GOD_RESURRECTION'||showTutorial)return;
    if(!shouldTriggerGodResurrection(gs))return;
    // Check if any player has SAN <= 0 (which would trigger cultist victory)
    for(const p of gs.players){
      if(!p.isDead&&p.san<=0){
        const hasCultists=gs.players.some(q=>q.role===ROLE_CULTIST);
        if(hasCultists){
          const hasPendingAnim=!!anim||animQueueRef.current.length>0||!!pendingGsRef.current;
          if(hasPendingAnim){
            if(!gs._pendingGodResurrection){
              setGs(g=>g?{...g,_pendingGodResurrection:true}:g);
            }
          }else{
            setGs(g=>g?{...g,phase:'GOD_RESURRECTION',_pendingGodResurrection:undefined}:g);
          }
          return;
        }
      }
    }
  },[gs,anim,showTutorial]);

  // isBlocked 提升到 useEffect 之前，避免依赖数组 TDZ 报错
  const isBlocked=!!anim||showTutorial;
  const isLocalDrawDecision=!!(gs&&isLocalDrawDecisionPhase(gs));
  const isLocalGodChoice=!!(gs&&isLocalGodChoicePhase(gs));
  const isMpCthDecisionPhase=!!(
    isMultiplayer&&gs&&(
      (isLocalDrawDecisionPhase(gs)&&gs.drawReveal?.fromRest)||
      (isLocalGodChoicePhase(gs)&&gs.abilityData?.fromRest)
    )
  );
  // refs 供计时器 useEffect 调用（避免陈旧闭包，必须在 if(!gs) return 之前）
  const endTurnRef=useRef(null);
  const autoDiscardRef=useRef(null);
  const latestGsRef=useRef(null); // always mirrors latest gs for closures reading stale state
  latestGsRef.current=gs; // 同步更新：渲染期间直接镜像，确保 confirmDiscard 等闭包读到最新值
  const mpCthDecisionTimerRef=useRef(null);

  // 1. 兜底与静默同步：当没有动画在播放时，且不处于AI回合（AI回合中draw效果已bake进gs但动画尚未开始），UI 强制对齐真实的底层数据
  useEffect(() => {
    if (gs?.players && (!anim && (!animQueueRef.current || animQueueRef.current.length === 0))) {
      if (gs.phase === 'AI_TURN') return;
      setDisplayStats(gs.players.map(p => ({ hp: p.hp, san: p.san })));
    }
  }, [gs?.players, anim, gs?.phase]);

  // 2. 动画期间的精准延迟对齐：当播放某个角色的受击/治疗动画时，延迟 350ms 更新显示数值
  useEffect(() => {
    if (anim && anim.targetStats) {
      const targets = new Set();
      if (anim.targetPid !== undefined) targets.add(anim.targetPid);
      if (anim.targetIdx !== undefined) targets.add(anim.targetIdx);
      if (Array.isArray(anim.targets)) anim.targets.forEach(t => targets.add(t));
      if (anim.triggerPid !== undefined) targets.add(anim.triggerPid);
      if (anim.hitIndices && Array.isArray(anim.hitIndices)) anim.hitIndices.forEach(hi => targets.add(hi));

      if (targets.size > 0) {
        const ts = anim.targetStats;
        const timer = setTimeout(() => {
          setDisplayStats(prev => {
            const next = [...prev];
            targets.forEach(pid => {
              if (next[pid] && ts[pid]) {
                next[pid] = { hp: ts[pid].hp, san: ts[pid].san };
              }
            });
            return next;
          });
        }, 350);
        return () => clearTimeout(timer);
      }
    }
  }, [anim]);

  // ── 房间倒计时显示（前端独立计时，服务端计时器版本号变化时重置）───
  useEffect(()=>{
    if(cdIntervalRef.current){clearInterval(cdIntervalRef.current);cdIntervalRef.current=null;}
    const cd=roomModal?.countdown;
    if(!cd){setCdSecondsLeft(null);setCdType(null);return;}
    setCdType(cd.type);
    setCdSecondsLeft(cd.seconds);
    cdIntervalRef.current=setInterval(()=>{
      setCdSecondsLeft(s=>{
        const next=s===null||s<=1?0:s-1;
        if(next===0)clearInterval(cdIntervalRef.current);
        if(next>0&&next<=10)playTickSound();
        return next;
      });
    },1000);
    return()=>{if(cdIntervalRef.current)clearInterval(cdIntervalRef.current);};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[roomModal?.countdown?.version,playTickSound]);

  // ── 多人游戏：回合计时器（45s）─────────────────────────────────
  // 只在回合切换时重置（currentTurn/_turnKey 变化），不监听 phase 避免每次 phase 变化都重置
  const mpTurnTimeoutRef=useRef(null);
  const mpTurnStartRef=useRef(null);    // Date.now() when current turn timer started
  const mpTurnPausedElapsedRef=useRef(null); // ms elapsed before HUNT_WAIT_REVEAL pause
  useEffect(()=>{
    if(!gs)return;
    if(anim||animQueueRef.current.length>0||pendingGsRef.current)return;
    setVisualDiscard(getVisualDiscardForState(gs));
  },[gs,gs?.discard,anim,getVisualDiscardForState]);
  useEffect(()=>{
    if(!isMultiplayer||!gs||gs.gameOver||!isLocalCurrentTurn(gs))return;
    mpTurnPausedElapsedRef.current=null; // 新回合清除暂停记录
    mpTurnStartRef.current=Date.now();
    setMpTurnSec(45);
    mpTurnIntervalRef.current=setInterval(()=>{
      setMpTurnSec(s=>{
        const next=(s===null||s<=1)?0:s-1;
        if(next===0)clearInterval(mpTurnIntervalRef.current);
        if(next>0&&next<=10)playTickSound();
        return next;
      });
    },1000);
    mpTurnTimeoutRef.current=setTimeout(()=>setGs(p=>p?{...p,_mpEndTurn:true}:p),45000);
    return()=>{
      clearTimeout(mpTurnTimeoutRef.current);mpTurnTimeoutRef.current=null;
      clearInterval(mpTurnIntervalRef.current);setMpTurnSec(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[isMultiplayer,gs?.currentTurn,gs?._turnKey,gs?.gameOver,playTickSound]);

  // 进入弃牌阶段：完全停止计时（下回合从头来）
  useEffect(()=>{
    if(!isMultiplayer||gs?.phase!=='DISCARD_PHASE')return;
    clearTimeout(mpTurnTimeoutRef.current);mpTurnTimeoutRef.current=null;
    clearInterval(mpTurnIntervalRef.current);
    setMpTurnSec(null);
  },[isMultiplayer,gs?.phase]);

  useEffect(()=>{
    if(!isMpCthDecisionPhase)return;
    clearTimeout(mpTurnTimeoutRef.current);mpTurnTimeoutRef.current=null;
    clearInterval(mpTurnIntervalRef.current);
    setMpTurnSec(null);
  },[isMpCthDecisionPhase]);

  // 进入 HUNT_WAIT_REVEAL：暂停计时（保存已消耗 ms，退出后续算剩余时间）
  useEffect(()=>{
    if(!isMultiplayer||gs?.phase!=='HUNT_WAIT_REVEAL')return;
    // 计算已消耗时间（ms）
    const elapsed=mpTurnStartRef.current?Date.now()-mpTurnStartRef.current:0;
    mpTurnPausedElapsedRef.current=elapsed;
    // 停止 interval 和 timeout（不清 mpTurnSec 显示——JSX 中由 phase 条件隐藏）
    clearTimeout(mpTurnTimeoutRef.current);mpTurnTimeoutRef.current=null;
    clearInterval(mpTurnIntervalRef.current);
  },[isMultiplayer,gs?.phase]);

  // 离开 HUNT_WAIT_REVEAL（进入 HUNT_CONFIRM 等）：从暂停时刻续计剩余时间
  useEffect(()=>{
    if(!isMultiplayer||!gs||gs.gameOver)return;
    if(gs.phase==='HUNT_WAIT_REVEAL')return; // 还在等待中
    if(mpTurnPausedElapsedRef.current===null)return; // 没有暂停记录
    if(!isLocalCurrentTurn(gs))return; // 不是我的回合
    const elapsedBefore=mpTurnPausedElapsedRef.current;
    mpTurnPausedElapsedRef.current=null;
    const remMs=Math.max(0,45000-elapsedBefore);
    const remSec=Math.round(remMs/1000);
    if(remSec<=0){setGs(p=>p?{...p,_mpEndTurn:true}:p);return;}
    // 重置起点为"现在−已消耗时间"，这样主 effect cleanup 能正确计算剩余
    mpTurnStartRef.current=Date.now()-elapsedBefore;
    setMpTurnSec(remSec);
    mpTurnIntervalRef.current=setInterval(()=>{
      setMpTurnSec(s=>{
        const next=(s===null||s<=1)?0:s-1;
        if(next===0)clearInterval(mpTurnIntervalRef.current);
        if(next>0&&next<=10)playTickSound();
        return next;
      });
    },1000);
    mpTurnTimeoutRef.current=setTimeout(()=>setGs(p=>p?{...p,_mpEndTurn:true}:p),remMs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[isMultiplayer,gs?.phase,gs?.currentTurn,gs?.gameOver,playTickSound]);

  // HUNT_WAIT_REVEAL 期间 45s 计时暂停 + 被追捕者 20s 超时随机亮牌
  const huntRevealTimerRef=useRef(null);
  useEffect(()=>{
    if(!isMultiplayer||!gs||gs.gameOver)return;
    // 被追捕方（!myTurn）显示倒计时并执行超时逻辑
    // 追猎者（myTurn）也进入此 phase，两边都显示倒计时
    if(gs.phase!=='HUNT_WAIT_REVEAL')return;
    setMpHuntSec(20);
    mpHuntIntervalRef.current=setInterval(()=>{
      setMpHuntSec(s=>{
        const next=s===null||s<=1?0:s-1;
        if(next===0)clearInterval(mpHuntIntervalRef.current);
        if(next>0&&next<=10)playTickSound();
        return next;
      });
    },1000);
    if(!myTurn){
      // 只有被追捕方执行超时逻辑
      const t=setTimeout(()=>{
        const hand=me.hand;
        if(!hand.length)return;
        const rc=hand[0|Math.random()*hand.length];
        const L=[...gs.log,`(超时) ${me.name} 随机亮出 ${cardLogText(rc,{alwaysShowName:true})}`];
        setGs({...gs,log:L,phase:'HUNT_CONFIRM',abilityData:{...gs.abilityData,revCard:rc}});
      },20000);
      huntRevealTimerRef.current=t;
    }
    return()=>{
      clearTimeout(huntRevealTimerRef.current);huntRevealTimerRef.current=null;
      clearInterval(mpHuntIntervalRef.current);setMpHuntSec(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs?.phase,gs?.currentTurn,isMultiplayer]);

  useEffect(()=>{
    if(!isMpCthDecisionPhase||!gs||gs.gameOver)return;
    setMpCthSec(15);
    mpCthIntervalRef.current=setInterval(()=>{
      setMpCthSec(s=>{
        const next=s===null||s<=1?0:s-1;
        if(next===0)clearInterval(mpCthIntervalRef.current);
        if(next>0&&next<=5)playTickSound();
        return next;
      });
    },1000);
    mpCthDecisionTimerRef.current=setTimeout(()=>setGs(p=>p?{...p,_mpAutoCthDecision:true}:p),15000);
    return()=>{
      clearTimeout(mpCthDecisionTimerRef.current);mpCthDecisionTimerRef.current=null;
      clearInterval(mpCthIntervalRef.current);setMpCthSec(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[isMpCthDecisionPhase,gs?.phase,gs?.drawReveal?.card?.id,gs?.abilityData?.godCard?.id,gs?.gameOver,playTickSound]);

  useEffect(()=>{
    if(!gs?._mpAutoCthDecision)return;
    if(isBlocked)return;
    const base={...gs,_mpAutoCthDecision:undefined};
    if(base.phase==='DRAW_REVEAL'&&base.drawReveal?.needsDecision&&base.drawReveal?.fromRest){
      const dr=base.drawReveal;
      const drawerIdx=dr.drawerIdx??0;
      const who=localDisplayName(drawerIdx,(dr.drawerName||base.players[drawerIdx]?.name||'该角色'));
      const newGs={...base,
        discard:[...base.discard,dr.card],
        log:[...base.log,`(超时) ${who} 弃置了 ${cardLogText(dr.card,{alwaysShowName:true})}`],
        phase:'ACTION',
        drawReveal:null,
        abilityData:base.abilityData,
      };
      _cthContinueRestDraws(newGs);
      return;
    }
    if(base.phase==='GOD_CHOICE'&&base.abilityData?.fromRest&&base.abilityData?.godCard){
      const godCard=base.abilityData.godCard;
      const newGs={...base,
        discard:[...base.discard,{...godCard}],
        log:[...base.log,'(超时) 放弃了邪神的馈赠'],
        phase:'ACTION',
        abilityData:base.abilityData,
      };
      _cthContinueRestDraws(newGs);
      return;
    }
    setGs(base);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs?._mpAutoCthDecision,isBlocked]);

  // 执行自动结束回合（等动画结束后再执行，避免 isBlocked 时丢失）
  // 兼容所有子阶段：DRAW_REVEAL / DRAW_SELECT_TARGET / GOD_CHOICE / NYA_BORROW / ACTION
  useEffect(()=>{
    if(!gs?._mpEndTurn)return;
    if(isBlocked)return;
    // HUNT_WAIT_REVEAL 期间追猎者等待对方亮牌，暂不处理超时结束回合
    if(gs.phase==='HUNT_WAIT_REVEAL')return;
    // 纯函数：将当前 gs 的任意子阶段解析到 ACTION / DISCARD_PHASE
    function resolveToAction(g){
      const phase=g.phase;
      if(phase==='ACTION'||phase==='DISCARD_PHASE')return g;
      if(phase==='DRAW_REVEAL'){
        const dr=g.drawReveal;
        if(!dr?.card)return{...g,phase:'ACTION',drawReveal:null};
        if(dr.needsDecision){
          if(dr.forcedKeep){
            let P=copyPlayers(g.players),D=[...g.deck],Disc=[...g.discard];
            const res=applyFx(dr.card,dr.drawerIdx??0,null,P,D,Disc,g);
            P=res.P;D=res.D;Disc=res.Disc;P[dr.drawerIdx??0].hand.push(dr.card);
            return{...g,players:P,deck:D,discard:Disc,log:[...g.log,`(超时) ${dr.drawerName||'该玩家'}被迫收入 ${cardLogText(dr.card,{alwaysShowName:true})}`,...res.msgs],phase:'ACTION',drawReveal:null,abilityData:{},...(res.statePatch||{})};
          }
          return{...g,discard:[...g.discard,dr.card],log:[...g.log,`(超时) ${dr.drawerName||'该玩家'}弃置了 ${cardLogText(dr.card,{alwaysShowName:true})}`],phase:'ACTION',drawReveal:null,abilityData:{}};
        }
        return{...g,phase:'ACTION',drawReveal:null};
      }
      if(phase==='GOD_CHOICE'){
        const godCard=g.abilityData?.godCard;
        if(!godCard)return{...g,phase:'ACTION',abilityData:{}};
        const Disc=[...g.discard,{...godCard}];
        return{...g,discard:Disc,log:[...g.log,'(超时) 放弃了邪神的馈赠'],phase:'ACTION',abilityData:{}};
      }
      if(phase==='NYA_BORROW'){
        // 跳过借身，直接摸牌
        let P=copyPlayers(g.players),D=[...g.deck],Disc=[...g.discard];
        const res=playerDrawCard(P,D,Disc,0,g);
        P=res.P;D=res.D;Disc=res.Disc;
        const L=[...g.log,'(超时) 跳过借身'];
        if(res.needGodChoice){
          // 连锁：摸到邪神牌 → 自动放弃
          Disc.push({...res.drawnCard});
          return{...g,players:P,deck:D,discard:Disc,log:[...L,'(超时) 放弃了邪神的馈赠'],phase:'ACTION',abilityData:{}};
        }
        if(res.needsDecision){
          return{...g,players:P,deck:D,discard:[...Disc,res.drawnCard],log:[...L,`(超时) 弃置了 ${cardLogText(res.drawnCard,{alwaysShowName:true})}`],phase:'ACTION',drawReveal:null,abilityData:{}};
        }
        // 普通牌
        return{...g,players:P,deck:D,discard:Disc,
          log:[...L,...res.effectMsgs],
          phase:'ACTION',
          drawReveal:res.drawnCard?{card:res.drawnCard,msgs:res.effectMsgs,needsDecision:false}:null,
          abilityData:{}};
      }
      return g;
    }

    // 直接从 gs 读取，避免 functional update（functional update 内无法调用 setAnim）
    const base=resolveToAction({...gs,_mpEndTurn:undefined});
    const win=checkWin(base.players,true);
    if(win){setGs({...base,gameOver:win});return;}
    if(base.players[0].hand.length>4){
      setGs({...base,phase:'DISCARD_PHASE',abilityData:{discardSelected:[]}});
      return;
    }
    const nextGs=startNextTurn({...base,currentTurn:0});
    applyNextTurnGs(nextGs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs?._mpEndTurn,isBlocked]);

  // ── 多人游戏：弃牌计时器（15s）─────────────────────────────────
  useEffect(()=>{
    if(!isMultiplayer||!gs||gs.gameOver||gs.phase!=='DISCARD_PHASE'||!isLocalCurrentTurn(gs))return;
    setMpDiscardSec(15);
    mpDiscardIntervalRef.current=setInterval(()=>{
      setMpDiscardSec(s=>{
        const next=s===null||s<=1?0:s-1;
        if(next===0)clearInterval(mpDiscardIntervalRef.current);
        if(next>0&&next<=10)playTickSound();
        return next;
      });
    },1000);
    const t=setTimeout(()=>setGs(p=>p?{...p,_mpAutoDiscard:true}:p),15000);
    return()=>{clearTimeout(t);clearInterval(mpDiscardIntervalRef.current);setMpDiscardSec(null);};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[isMultiplayer,gs?.phase,gs?.currentTurn,gs?._turnKey,gs?.gameOver,playTickSound]);

  // 执行自动从右侧弃牌
  useEffect(()=>{
    if(!gs?._mpAutoDiscard)return;
    setGs(p=>p?{...p,_mpAutoDiscard:undefined}:p);
    autoDiscardRef.current?.();
  },[gs?._mpAutoDiscard]);

  useEffect(()=>{
    if(!gs||!isMobile){
      setMobileArmedGodCardIdx(null);
      return;
    }
    if(mobileArmedGodCardIdx==null)return;
    const mobileMe=gs.players?.[0];
    const armedCard=mobileMe?.hand?.[mobileArmedGodCardIdx];
    const isActionPhase=gs.phase==='ACTION'&&isLocalCurrentTurn(gs);
    const isUpgrade=mobileMe?.godName===armedCard?.godKey&&((mobileMe?.godLevel||0)<3);
    const canWorshipFromHand=!!armedCard?.isGod&&!isUpgrade&&!gs.godTriggeredThisTurn&&!gs.godFromHandUsed;
    if(!isActionPhase||!canWorshipFromHand){
      setMobileArmedGodCardIdx(null);
    }
  },[gs,isMobile,mobileArmedGodCardIdx]);

  useEffect(()=>{
    if(!isMobile||mobileArmedGodCardIdx==null)return;
    const handlePointerDown=(event)=>{
      const armedCardEl=mobileGodCardRefs.current.get(mobileArmedGodCardIdx);
      if(armedCardEl&&armedCardEl.contains(event.target))return;
      setMobileArmedGodCardIdx(null);
    };
    document.addEventListener('pointerdown',handlePointerDown,true);
    return ()=>document.removeEventListener('pointerdown',handlePointerDown,true);
  },[isMobile,mobileArmedGodCardIdx]);

  // ── Loading Screen ───────────────────────────────────────────
  if(isLoading){
    return(
      <div style={{minHeight:'100vh',background:'#0a0705',color:'#c8a96e',fontFamily:"'IM Fell English','Georgia',serif",display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',textAlign:'center',padding:24,position:'relative',overflow:'hidden'}}>
        <style>{'@keyframes spinLoader { to { transform: rotate(360deg); } }'}</style>
        {/* Vignette */}
        <div style={{position:'fixed',inset:0,background:'radial-gradient(ellipse at center,transparent 30%,#000000bb 100%)',pointerEvents:'none'}}/>
        
        <div style={{position:'relative',zIndex:1,maxWidth:400,width:'100%'}}>
          <div style={{fontFamily:"'Cinzel Decorative','Cinzel',serif",fontSize:34,fontWeight:700,letterSpacing:3,marginBottom:24,color:'#e8c87a',textShadow:'0 0 40px #c8a96e44,0 2px 0 #0a0705'}}>邪神的宝藏</div>
          
          <div style={{marginBottom:32}}>
            <div style={{display:'flex',alignItems:'center',marginBottom:20}}>
              <img 
                src="/img/loading.png" 
                style={{
                  height: '16px', 
                  marginRight: '10px',
                  animation: 'spinLoader 1s linear infinite',
                  filter: 'invert(60%) sepia(30%) saturate(300%) hue-rotate(30deg)',
                  transformOrigin: 'center'
                }} 
                alt="Loading"
              />
              <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontSize:12,fontStyle:'italic',color:'#a07838',lineHeight:1.5}}>
                第一次前往遗迹的路会很长，请稍等<Ellipsis/>
              </div>
            </div>
            
            {currentFile && (
              <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontSize:11,marginBottom:12,color:'#8a6a38'}}>当前文件: {currentFile}</div>
            )}
            
            <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontSize:11,marginBottom:16,color:'#8a6a38'}}>
              下载进度: {formatFileSize(loadedSize)} / {formatFileSize(totalSize)}
            </div>
            
            <div style={{width:'100%',height:8,background:'#140f08',border:'1px solid #3a2510',borderRadius:4,overflow:'hidden'}}>
              <div style={{
                width:`${loadingProgress}%`,
                height:'100%',
                background:'linear-gradient(90deg,#7a5020,#c8a96e,#7a5020)',
                transition:'width 0.3s ease',
                boxShadow:'0 0 10px #c8a96e44'
              }}/>
            </div>
            
            <div style={{fontFamily:"'Cinzel',serif",fontSize:12,letterSpacing:1,marginTop:8,color:'#a07838'}}>{Math.round(loadingProgress)}%</div>
          </div>
          
          {loadingError&&(
            <div style={{background:'#1a0a0a',border:'1px solid #7a2020',borderRadius:4,padding:'12px 16px',color:'#e07070',fontFamily:"'Cinzel',serif",fontSize:12,letterSpacing:0.5}}>
              {loadingError}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Start Screen ───────────────────────────────────────────
  if(!gs){
    return(<>
      <StartScreen
        vw={vw}
        handleUiSfxCapture={handleUiSfxCapture}
        anim={anim}
        animExiting={animExiting}
        startNewGame={startNewGame}
        handleMultiplayer={handleMultiplayer}
        multiLoading={multiLoading}
        onOpenAbout={()=>setModal('about')}
        onOpenRoadmap={()=>setModal('roadmap')}
        isDisconnected={isDisconnected}
        onDisconnectedReset={()=>{
          setIsDisconnected(false);
          setIsMultiplayer(false);
          isMultiplayerRef.current=false;
          setMyPlayerIndex(0);
          myPlayerIndexRef.current=0;
          mpRoleRevealedRef.current=false;
          setGs(null);
        }}
        toasts={toasts}
        onlineOptionsModal={onlineOptionsModal}
        closeOnlineOptions={closeOnlineOptions}
        handleCreateRoom={handleCreateRoom}
        handleOpenLobby={handleOpenLobby}
        joinRoomInput={joinRoomInput}
        setJoinRoomInput={setJoinRoomInput}
        handleJoinRoom={handleJoinRoom}
        renameInputVisible={renameInputVisible}
        renameInput={renameInput}
        setRenameInput={setRenameInput}
        handleRename={handleRename}
        handleRandomUsername={handleRandomUsername}
        setRenameInputVisible={setRenameInputVisible}
        renameCdActive={renameCdActive}
        playerUsername={playerUsername}
        playerUsernameSpecial={playerUsernameSpecial}
      />
      {modal==='about'&&<AboutModal onClose={()=>setModal(null)}/>}
      {modal==='roadmap'&&<RoadmapModal onClose={()=>setModal(null)}/>}
      {/* -- Room Modal -- */}
        <RoomModal
          roomModal={roomModal}
          playerUUID={playerUUID}
          cdType={cdType}
          cdSecondsLeft={cdSecondsLeft}
          onClose={closeRoomModal}
          onTogglePrivacy={handleTogglePrivacy}
          onSetReady={handleSetReady}
          onCopyRoomId={()=>{try{navigator.clipboard.writeText(roomModal.roomId).then(()=>addToast('✓ 房间号已复制')).catch(()=>addToast('复制失败，请手动复制'));}catch{addToast('复制失败，请手动复制');}}}
        />
        {/* -- Game Lobby Modal -- */}
        <LobbyModal
          lobbyModal={lobbyModal}
          lobbyLoading={lobbyLoading}
          lobbyRooms={lobbyRooms}
          onClose={closeLobbyModal}
          onRefresh={handleRefreshLobby}
          onJoinRoom={handleJoinLobbyRoom}
        />
        {/* -- Privacy Toggle Confirm Modal -- */}
        <PrivacyToggleModal
          show={showPrivacyToggleConfirm}
          dontShowAgain={privacyWarnDontShow}
          onChangeDontShow={setPrivacyWarnDontShow}
          onConfirm={handleConfirmPrivacyToggle}
          onCancel={handleCancelPrivacyToggle}
        />
        {/* -- Tutorial overlay -- */}
        <TutorialOverlay
          show={showTutorial}
          step={tutorialStep}
          onComplete={completeTutorial}
          onStart={()=>{_startForTutorial();setTutorialStep(2);}}
        />
        {roleRevealAnim&&<RoleRevealAnim role={roleRevealAnim.role} onDone={()=>_onRoleRevealDone(roleRevealAnim.pendingGs)}/>}
        {/* -- Connection error modal -- */}
        <ConnectionErrorModal
          show={connErrModal}
          onClose={()=>setConnErrModal(false)}
        />
        <style>{GLOBAL_STYLES}</style>
      {/* GammaSlider outside filtered lobby container */}
      <GammaSlider gamma={gamma} onChange={handleGamma}/>
      <DebugControls
        isLocalTestMode={isLocalTestMode}
        localDebugMode={localDebugMode}
        onToggleDebugMode={()=>setLocalDebugMode(v=>!v)}
        showSettings={showDebugSettings}
        onToggleShowSettings={()=>setShowDebugSettings(v=>!v)}
        debugForceCardTarget={debugForceCardTarget} setDebugForceCardTarget={setDebugForceCardTarget}
        debugForceCardKeep={debugForceCardKeep} setDebugForceCardKeep={setDebugForceCardKeep}
        debugForceCardType={debugForceCardType} setDebugForceCardType={setDebugForceCardType}
        debugForceZoneCardKey={debugForceZoneCardKey} setDebugForceZoneCardKey={setDebugForceZoneCardKey}
        debugForceZoneCardName={debugForceZoneCardName} setDebugForceZoneCardName={setDebugForceZoneCardName}
        debugForceGodCardKey={debugForceGodCardKey} setDebugForceGodCardKey={setDebugForceGodCardKey}
        debugPlayerRole={debugPlayerRole} setDebugPlayerRole={setDebugPlayerRole}
      />
    </>);
  }

  // ── Game Over ──────────────────────────────────────────────
  if(gs.gameOver){
    const{winner,reason,winnerIdx}=gs.gameOver;
    const myRole=gs.players[0].role;
    const iWon=winner==='LOSE'||winner==='LOSE_ALL'?false
      :winner===ROLE_TREASURE?isLocalWinnerSeat(gs.gameOver)
      :(winner===myRole);
    const isLose=winner==='LOSE'||winner==='LOSE_ALL';

    // 邪祀者获胜：先全屏播放邪神复活特效，onConfirm 后再显示结算
    if(winner===ROLE_CULTIST&&!showGodResurrection){
      return <GodResurrectionAnim onDone={()=>setShowGodResurrection(true)}/>;
    }
    return(
      <div onClickCapture={handleUiSfxCapture} style={{minHeight:'100vh',background:'#0a0705',color:'#c8a96e',fontFamily:"'IM Fell English','Georgia',serif",display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',textAlign:'center',padding:24,position:'relative'}}>
        <div style={{position:'fixed',inset:0,background:'radial-gradient(ellipse at center,transparent 20%,#000000cc 100%)',pointerEvents:'none'}}/>
        <div style={{position:'relative',zIndex:1}}>
          <div style={{fontSize:72,marginBottom:14,filter:`drop-shadow(0 0 30px ${iWon?'#c8a96e':isLose?'#882020':'#9060cc'})`,animation:'animPop 0.4s ease-out'}}>{isLose?'☠':iWon?'✦':'⚔'}</div>
          <h2 style={{fontFamily:"'Cinzel Decorative','Cinzel',serif",fontSize:26,fontWeight:700,marginBottom:10,color:iWon?'#e8c87a':isLose?'#882020':'#a07090',textShadow:`0 0 30px ${iWon?'#c8a96e44':'#88202044'}`}}>
{isLose?(winner==='LOSE_ALL'?'——  全员覆灭  ——':'英魂殒落'):iWon?'胜利归你':winner===ROLE_TREASURE?`——  ${gs.players[winnerIdx]?.name??''}获胜  ——`:'——  '+winner+'获胜  ——'}
          </h2>
          <div style={{width:180,height:1,background:'linear-gradient(90deg,transparent,#5a4020,transparent)',margin:'0 auto 12px'}}/>
          <p style={{color:'#b89858',marginBottom:28,fontSize:13,fontStyle:'italic',maxWidth:340}}>{reason}</p>
          {/* Player results */}
          <div style={{display:'flex',gap:10,marginBottom:36,flexWrap:'wrap',justifyContent:'center'}}>
            {gs.players.map((p,pIdx)=>{
              const r=RINFO[p.role];
              const isWinner=!isLose&&winner!=='LOSE_ALL'&&(winner==='寻宝者'?(pIdx===winnerIdx||pIdx===(gs.gameOver.winnerIdx2??-1)):p.role===winner);
              return(
                <div key={p.id} style={{background:isWinner?'#1a1208':'#140f08',border:`1.5px solid ${isWinner?r.col:r.dim}`,borderRadius:3,padding:'10px 14px',textAlign:'center',minWidth:76,boxShadow:isWinner?`0 0 14px ${r.col}55`:'none'}}>
                  <div style={{fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:11,color:isWinner?r.col:'#c8a96e',letterSpacing:1}}>{p.name}</div>
                  <div style={{fontSize:11,color:r.col,margin:'4px 0',fontFamily:"'Cinzel',serif",letterSpacing:1}}>{r.icon} {p.role}</div>
                  <div style={{fontSize:10,color:'#a07838'}}>HP:{p.hp} SAN:{p.san}</div>
                  {p.isDead&&<div style={{fontSize:12,color:'#882020',marginTop:3}}>☠</div>}
                  {isWinner&&!p.isDead&&<div style={{fontSize:10,color:r.col,marginTop:3,letterSpacing:1}}>✦ 胜者</div>}
                </div>
              );
            })}
          </div>
          {isMultiplayer?(
            <button onClick={()=>{
              // 先直接发送 gameEnd（在 state 重置前），避免 useEffect 因 isMultiplayer=false 跳过发送
              if(!gameEndSentRef.current&&socketRef.current?.connected){
                gameEndSentRef.current=true;
                // 确定获胜者身份
                let winnerRole = null;
                if (gs?.gameOver?.winner === '寻宝者' || gs?.gameOver?.winner === '追猎者' || gs?.gameOver?.winner === '邪祀者') {
                  winnerRole = gs.gameOver.winner;
                }
                socketRef.current.emit('gameEnd',{uuid:playerUUID,roomId:roomModal?.roomId,winnerRole});
              }
              setIsMultiplayer(false);isMultiplayerRef.current=false;
              setMyPlayerIndex(0);myPlayerIndexRef.current=0;
              mpRoleRevealedRef.current=false;gameEndSentRef.current=false;
              setShowGodResurrection(false);
              setShowFullLog(false);
              setGs(null);
            }} style={{
              padding:'11px 40px',background:'#1c1208',border:'2px solid #3a6a3a',
              color:'#80e080',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:13,
              borderRadius:2,cursor:'pointer',letterSpacing:2,textTransform:'uppercase',
            }}>返回房间</button>
          ):(
            <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
              <button onClick={startNewGame} style={{
                padding:'11px 40px',background:'#1c1008',border:'2px solid #5a3010',
                color:'#c8a96e',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:13,
                borderRadius:2,cursor:'pointer',letterSpacing:2,textTransform:'uppercase',
              }}>再次降临</button>
              <button onClick={()=>{
                setModal(null);
                setShowGodResurrection(false);
                setShowFullLog(false);
                setGs(null);
              }} style={{
                padding:'11px 32px',background:'transparent',border:'2px solid #3a2510',
                color:'#a07838',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:13,
                borderRadius:2,cursor:'pointer',letterSpacing:2,textTransform:'uppercase',
              }}>返回主页</button>
            </div>
          )}
          <div style={{marginTop:18}}>
            <button
              onClick={()=>setShowFullLog(true)}
              style={{
                background:'none',border:'none',padding:0,cursor:'pointer',
                color:'#9fb8d8',fontSize:12,textDecoration:'underline',
                fontFamily:"'IM Fell English','Georgia',serif",
              }}
            >显示游戏日志</button>
          </div>
        </div>
        {showFullLog&&<FullLogModal log={gs.log||[]} onClose={()=>setShowFullLog(false)}/>}
        {/* AnimOverlay must render on game-over screen too so startNewGame card flip works */}
        <AnimOverlay anim={anim} exiting={animExiting}/>
        {roleRevealAnim&&<RoleRevealAnim role={roleRevealAnim.role} onDone={()=>_onRoleRevealDone(roleRevealAnim.pendingGs)}/>}
        <style>{GLOBAL_STYLES}</style>
      </div>
    );
  }

  // ── Main Game ──────────────────────────────────────────────
  const me=gs.players[0];
  const mobileArmedGodCard=isMobile&&mobileArmedGodCardIdx!=null?visualMe.hand[mobileArmedGodCardIdx]:null;
  const mobileArmedGodTooltipRect=mobileArmedGodCardIdx!=null?(()=>{
    const wrapEl=mobileGodCardRefs.current.get(mobileArmedGodCardIdx);
    const cardEl=wrapEl?.firstElementChild||wrapEl;
    return _getZoomCompensatedRect(cardEl);
  })():null;
  const effectiveRole=me._nyaBorrow||me.role;
  const effectiveHandLimit=Math.max(0,(me._nyaHandLimit??4)-(me.handLimitDecrease||0));
  const myTurn=isLocalCurrentTurn(gs);
  // 只有当底层是玩家回合，且没有正在播放的动画，且动画队列为空时，才算真正轮到玩家
  const isVisualPlayerTurn = myTurn && !anim && (animQueueRef.current.length === 0);
  const visualCurrentTurn=((anim||animExiting||animQueueRef.current.length>0)&&turnHighlightLockRef.current!=null)
    ?turnHighlightLockRef.current
    :gs.currentTurn;
  const visualPlayers=((anim||animExiting||animQueueRef.current.length>0)&&visualPlayersLockRef.current)
    ?visualPlayersLockRef.current
    :gs.players;
  const visualMe=visualPlayers[0];
  const canWin=effectiveRole==='寻宝者'&&isWinHand(me.hand);
  const phase=gs.phase;
  const ri=RINFO[me.role];
  const skillRi=gs.globalOnlySwapOwner!=null?RINFO['寻宝者']:(RINFO[effectiveRole]||ri);
  const effectiveSkillName=skillRi.skillName||ri.skillName;
  const suppressAnim=showTutorial&&tutorialStep>=2; // hide all anims during tutorial steps 2+
  const huntAbandoned=gs.huntAbandoned||[];

  // ── Action handlers ────────────────────────────────────────
  // CTH 「梦访拉莱耶」: after a draw decision (keep/discard/god) triggered while resting,
  // process any remaining draws (cthDrawsRemaining) then advance the turn.
  function _cthContinueRestDraws(baseGsAfterDecision){
    let P=copyPlayers(baseGsAfterDecision.players),D=[...baseGsAfterDecision.deck],Disc=[...baseGsAfterDecision.discard],L=[...baseGsAfterDecision.log];
    const remaining=baseGsAfterDecision.abilityData?.cthDrawsRemaining||0;
    const fromRest=baseGsAfterDecision.abilityData?.fromRest;
    // Animate any prior rest-draws (forced cards from startNextTurn) first
    if(baseGsAfterDecision._cthRestDraws?.length>0){
      const cthQueue=baseGsAfterDecision._cthRestDraws.map(card=>({
        type:'DRAW_CARD',card,triggerName:'你',targetPid:0,
        msgs:baseGsAfterDecision._cthRestDrawLogs?.filter(l=>l.includes(card.name)||l.includes(card.key))||[]
      }));
      const statQ=bindAnimLogChunks(
        buildAnimQueue({...baseGsAfterDecision,players:baseGsAfterDecision._playersBeforeCthDraws||baseGsAfterDecision.players},baseGsAfterDecision),
        {statLogs:baseGsAfterDecision._cthRestDrawLogs||[]}
      );
      const cleanedGs={...baseGsAfterDecision,_cthRestDraws:null,_cthRestDrawLogs:null,_playersBeforeCthDraws:null};
      triggerAnimQueue(
        [...cthQueue,...statQ,{type:'STATE_PATCH',players:cleanedGs.players,discard:cleanedGs.discard}],
        null,
        ()=>{_cthContinueRestDraws(cleanedGs);}
      );
      return;
    }
    if(remaining<=0){
      const nextGs=startNextTurn({...baseGsAfterDecision,players:P,deck:D,discard:Disc,log:L,abilityData:{}});
      applyNextTurnGs(nextGs);
      return;
    }
    for(let _d=0;_d<remaining;_d++){
      const r2=playerDrawCard(P,D,Disc,0,baseGsAfterDecision);P=r2.P;D=r2.D;Disc=r2.Disc;
      const drawMsg=r2.drawnCard?`你 摸到 ${cardLogText(r2.drawnCard,{alwaysShowName:true})}`:'';
      if(r2.drawnCard)L.push(`  摸到 ${cardLogText(r2.drawnCard,{alwaysShowName:true})}`);
      if(r2.needGodChoice){
        const newGs={...baseGsAfterDecision,players:P,deck:D,discard:Disc,log:L,phase:'GOD_CHOICE',
          abilityData:{godCard:r2.drawnCard,fromRest:true,cthDrawsRemaining:remaining-_d-1,drawerIdx:0},drawReveal:null,selectedCard:null};
        triggerAnimQueue([{type:'DRAW_CARD',card:r2.drawnCard,triggerName:'你',targetPid:0,msgs:drawMsg?[drawMsg]:[]}],newGs);
        return;
      }
      if(r2.needsDecision){
        const newGs={...baseGsAfterDecision,players:P,deck:D,discard:Disc,log:L,phase:'DRAW_REVEAL',
          drawReveal:{card:r2.drawnCard,msgs:[],needsDecision:true,forcedKeep:false,drawerIdx:0,drawerName:P[0].name,fromRest:true},
          selectedCard:null,abilityData:{fromRest:true,cthDrawsRemaining:remaining-_d-1}};
        triggerAnimQueue([{type:'DRAW_CARD',card:r2.drawnCard,triggerName:'你',targetPid:0,msgs:drawMsg?[drawMsg]:[]}],newGs);
        return;
      }
      // forced card: already applied, continue
      if(r2.kept){
        if(r2.effectMsgs.length)L.push(...r2.effectMsgs);
        const split=splitAnimBoundLogs(r2.effectMsgs||[]);
        const forcedGs={...baseGsAfterDecision,players:P,deck:D,discard:Disc,log:L,phase:'ACTION',drawReveal:null,selectedCard:null,
          abilityData:{...(fromRest?{fromRest:true}:{}),cthDrawsRemaining:remaining-_d-1}};
        const statQ=bindAnimLogChunks(buildAnimQueue(baseGsAfterDecision,forcedGs),{statLogs:split.stat});
        triggerAnimQueue(
          [{type:'DRAW_CARD',card:r2.drawnCard,triggerName:'你',targetPid:0,msgs:split.preStat.length?split.preStat:(drawMsg?[`${drawMsg}（强制触发）`]:[])},...statQ,{type:'STATE_PATCH',players:P,discard:Disc}],
          null,
          ()=>{
            setGs(forcedGs);
            _cthContinueRestDraws(forcedGs);
          }
        );
        return;
      }
    }
    const nextGs=startNextTurn({...baseGsAfterDecision,players:P,deck:D,discard:Disc,log:L,abilityData:{}});
    applyNextTurnGs(nextGs);
  }

  function handleDrawKeep(){
    const dr=gs.drawReveal;if(!dr?.card)return;
    // swapAllHands needs target selection before applying
    if(dr.card.type==='swapAllHands'){
      setGs({...gs,phase:'ZONE_SWAP_SELECT_TARGET',drawReveal:null,abilityData:{zoneSwapCard:dr.card,fromRest:dr.fromRest,cthDrawsRemaining:gs.abilityData?.cthDrawsRemaining},log:[...gs.log,`你摸到 ${cardLogText(dr.card,{alwaysShowName:true})}，请选择交换手牌的目标`]});
      return;
    }
    // 检查是否为AOE负面效果，且当前玩家是寻宝者
    const effectiveRole=me._nyaBorrow||me.role;
    const isTreasureHunter=effectiveRole==='寻宝者';
    const isNegativeEffect=isNegativeZoneCard(dr.card);
    const effectScope=getZoneCardEffectScope(dr.card);
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard];
    const drawerIdx=dr.drawerIdx??0;
    const isAOENegativeEffect=isNegativeEffect&&(effectScope==='all'||effectScope==='adjacent');
    
    // 首先检查是否是其他角色触发的AOE负面效果
    if(isAOENegativeEffect&&isTreasureHunter&&drawerIdx!==0){
      // 触发AOE负面效果时，寻宝者可以选择掷骰子规避
      setGs({...gs,phase:'TREASURE_AOE_DODGE_DECISION',drawReveal:dr,abilityData:{fromRest:gs.abilityData?.fromRest,cthDrawsRemaining:gs.abilityData?.cthDrawsRemaining,drawerIdx:drawerIdx},
        log:[...gs.log,`${localDisplayName(drawerIdx,P[drawerIdx].name)} 触发了 ${cardLogText(dr.card,{alwaysShowName:true})} 的负面效果！作为寻宝者，你可以选择掷骰子尝试规避。`]});
      return;
    }
    
    // 然后检查是否是寻宝者自己触发的负面区域牌
    if(isTreasureHunter&&isLocalSeatIndex(drawerIdx)&&isNegativeEffect){
      // Preserve cthDrawsRemaining so CTH rest-draws aren't lost after dodge decision
      setGs({...gs,phase:'TREASURE_DODGE_DECISION',drawReveal:dr,abilityData:{fromRest:gs.abilityData?.fromRest,cthDrawsRemaining:gs.abilityData?.cthDrawsRemaining},
        log:[...gs.log,`你摸到 ${cardLogText(dr.card,{alwaysShowName:true})}，这是带有负面效果的区域牌！是否掷骰子尝试规避？`]});
      return;
    }
    const res=applyFx(dr.card,drawerIdx,null,P,D,Disc,gs,false,[],false);
    P=res.P;D=res.D;Disc=res.Disc;P[drawerIdx].hand.push(dr.card);
    const who=localDisplayName(drawerIdx,P[drawerIdx].name);
    const L=[...gs.log,`${who} 收入了 ${cardLogText(dr.card,{alwaysShowName:true})}`,...res.msgs];
    // 1. 检查卡牌效果是否让任何人HP归零或SAN归零（通过checkWin）
    const win=checkWin(P,gs._isMP);if(win){syncVisibleLog(L);setGs({...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win,drawReveal:null,...(res.statePatch||{})});return;}
    // 2. 最后，如果游戏仍未结束，且该寻宝者仍然存活，检查该寻宝者是否达成胜利条件
    if(isLocalSeatIndex(drawerIdx)&&!P[0].isDead&&(P[0]._nyaBorrow||P[0].role)==='寻宝者'&&isWinHand(P[0].hand)){
      P[0].roleRevealed=true;
      syncVisibleLog([...L,'你集齐了全部编号！']);
      setGs({...gs,players:P,deck:D,discard:Disc,log:[...L,'你集齐了全部编号！'],phase:'PLAYER_WIN_PENDING',drawReveal:null,abilityData:{winReason:'你集齐了全部编号并获胜！'},...(res.statePatch||{})});
      return;
    }
    // 保留abilityData中的fromRest和cthDrawsRemaining信息
    const newGs={...gs,players:P,deck:D,discard:Disc,log:L,phase:'ACTION',drawReveal:null,abilityData:gs.abilityData,...(res.statePatch||{})};
    // 检查是否需要偷看手牌
    if(res.statePatch?.peekHandTargets){
      syncVisibleLog(L);
      setGs({...newGs,phase:'PEEK_HAND_SELECT_TARGET',abilityData:{
        ...gs.abilityData,
        peekHandTargets:res.statePatch.peekHandTargets,
        peekHandSource:res.statePatch.peekHandSource,
      }});
      return;
    }
    // 检查是否需要进行穴居人战争
    if(res.statePatch?.caveDuelTargets){
      syncVisibleLog(L);
      setGs({...newGs,phase:'CAVE_DUEL_SELECT_TARGET',abilityData:{
        ...gs.abilityData,
        caveDuelTargets:res.statePatch.caveDuelTargets,
        caveDuelSource:res.statePatch.caveDuelSource,
      }});
      return;
    }
    // 检查是否需要进行两人一绳
    if(res.statePatch?.damageLinkTargets){
      syncVisibleLog(L);
      setGs({...newGs,phase:'DAMAGE_LINK_SELECT_TARGET',abilityData:{
        ...gs.abilityData,
        damageLinkTargets:res.statePatch.damageLinkTargets,
        damageLinkSource:res.statePatch.damageLinkSource,
      }});
      return;
    }
    if(res.statePatch?.roseThornTargets){
      syncVisibleLog(L);
      setGs({...newGs,phase:'ROSE_THORN_SELECT_TARGET',abilityData:{
        ...gs.abilityData,
        roseThornTargets:res.statePatch.roseThornTargets,
        roseThornSource:res.statePatch.roseThornSource,
      }});
      return;
    }
    // 检查是否需要灵龟卜祝选择
    if(res.statePatch?.abilityData?.type === 'tortoiseOracleSelect'){
      syncVisibleLog(L);
      setGs({...newGs,phase:'TORTOISE_ORACLE_SELECT',abilityData:{
        ...gs.abilityData,
        ...res.statePatch.abilityData
      }});
      return;
    }
    if(res.statePatch?.abilityData?.type === 'firstComePick'){
      const phaseData={...gs.abilityData,...res.statePatch.abilityData,...(dr.fromRest?{fromRest:true}:{}),...(gs.abilityData?.cthDrawsRemaining!=null?{cthDrawsRemaining:gs.abilityData.cthDrawsRemaining}: {})};
      syncVisibleLog(L);
      setGs({...newGs,phase:'FIRST_COME_PICK_SELECT',abilityData:phaseData});
      return;
    }
    if(res.statePatch?.abilityData?.type === 'sameAbyssChoice'){
      syncVisibleLog(L);
      setGs({...newGs,phase:'SAME_ABYSS_SELECT',abilityData:{...gs.abilityData,...res.statePatch.abilityData}});
      return;
    }
    if(res.statePatch?.abilityData?.type === 'sphinxGuess'){
      syncVisibleLog(L);
      setGs({...newGs,phase:'SPHINX_GUESS',abilityData:{...gs.abilityData,...res.statePatch.abilityData}});
      return;
    }
    // CTH fromRest: 先播放当前这张牌的结算动画，再继续剩余摸牌/进入下一回合
    if(dr.fromRest&&!win){
      const split=splitAnimBoundLogs(L.slice(gs.log.length));
      const queue=bindAnimLogChunks(buildAnimQueue(gs,newGs),{preStatLogs:split.preStat,statLogs:split.stat});
      if(queue.length){
        triggerAnimQueue([...queue,{type:'STATE_PATCH',players:P,discard:Disc}],null,()=>_cthContinueRestDraws(newGs));
      }else{
        syncVisibleLog(L);
        _cthContinueRestDraws(newGs);
      }
      return;
    }
    const queue=bindAnimLogChunks(buildAnimQueue(gs,newGs),splitAnimBoundLogs(L.slice(gs.log.length)));
    if(queue.length){
      pendingGsRef.current=newGs;
      animQueueRef.current=[...queue.slice(1)];
      setGs(p=>p?{...p,phase:'ACTION',drawReveal:null}:p);
      setAnim(queue[0]);
    }else{
      syncVisibleLog(L);
      setGs(newGs);
    }
  }

  // Generic Treasure Hunter dodge handler
  function handleTreasureDodge(gs, dr, isAOE = false) {
    const d1 = 1 + (Math.random() * 6 | 0);
    const dodgeSuccess = d1 >= 4;
    let P = copyPlayers(gs.players), D = [...gs.deck], Disc = [...gs.discard];
    const drawerIdx = isAOE ? (gs.abilityData?.drawerIdx ?? 0) : (dr.drawerIdx ?? 0);
    const who = drawerIdx === 0 ? '你' : P[drawerIdx].name;
    
    // Reveal role when Treasure Hunter rolls dice
    if (drawerIdx === 0 && P[0].role === '寻宝者') {
      P[0].roleRevealed = true;
    }
    
    let L = [...gs.log, `${who} 掷出 ${d1} 点，${dodgeSuccess ? '成功规避负面效果！' : '未能规避，触发负面效果！'}`];
    let res;
    
    if (isAOE) {
      // AOE dodge: only avoid for current player
      const avoidNegativeFor = dodgeSuccess ? [0] : [];
      res = applyFx(dr.card, drawerIdx, null, P, D, Disc, gs, false, avoidNegativeFor, false);
    } else {
      // Regular dodge: avoid all negative effects for the drawer
      res = applyFx(dr.card, drawerIdx, null, P, D, Disc, gs, dodgeSuccess, [], false);
    }
    
    P = res.P; D = res.D; Disc = res.Disc; P[drawerIdx].hand.push(dr.card);
    
    if (dodgeSuccess && !isAOE) {
      L.push(`${who} 收入了 ${cardLogText(dr.card,{alwaysShowName:true})}（负面效果已规避）`, ...res.msgs);
    } else {
      L.push(`${who} 收入了 ${cardLogText(dr.card,{alwaysShowName:true})}`, ...res.msgs);
    }
    
    // 1. 检查卡牌效果是否让任何人HP归零或SAN归零（通过checkWin）
    const win = checkWin(P, gs._isMP);
    if (win) {
      return { P, D, Disc, L, win };
    }
    
    // 2. 最后，如果游戏仍未结束，且该寻宝者仍然存活，检查该寻宝者是否达成胜利条件
    if (drawerIdx === 0 && !P[0].isDead && P[0].role === '寻宝者' && isWinHand(P[0].hand)) {
      P[0].roleRevealed = true;
      const pendingWinGs = {
        ...gs,
        players: P,
        deck: D,
        discard: Disc,
        log: [...L, '你集齐了全部编号！'],
        phase: 'PLAYER_WIN_PENDING',
        drawReveal: null,
        abilityData: { winReason: '你集齐了全部编号并获胜！' }
      };
      return { P, D, Disc, L: pendingWinGs.log, pendingWinGs, d1, dodgeSuccess, who };
    }
    
    const newGs = { ...gs, players: P, deck: D, discard: Disc, log: L, phase: 'ACTION', drawReveal: null, abilityData: { fromRest: gs.abilityData?.fromRest, cthDrawsRemaining: gs.abilityData?.cthDrawsRemaining } };
    return { P, D, Disc, L, newGs, d1, dodgeSuccess, who };
  }

  function handleTreasureDodgeRoll(){
    const dr=gs.drawReveal;if(!dr?.card)return;
    const result=handleTreasureDodge(gs,dr,false);
    if(result.win){
      setGs({...gs,players:result.P,deck:result.D,discard:result.Disc,log:result.L,gameOver:result.win,drawReveal:null});
      return;
    }
    if(result.pendingWinGs){
      pendingGsRef.current=result.pendingWinGs;
      animQueueRef.current=[];
      setGs(p=>p?{...p,phase:'ACTION',drawReveal:null}:p);
      setAnim({type:'DICE_ROLL',d1:result.d1,d2:0,heal:0,rollerName:result.who,dodgeSuccess:result.dodgeSuccess});
      return;
    }
    if(dr.fromRest&&!result.win){
      // 播放骰子动画后再处理剩余摸牌
      pendingGsRef.current=result.newGs;
      animQueueRef.current=[{type:'CTH_CONTINUE',data:{cthDrawsRemaining:gs.abilityData?.cthDrawsRemaining}}];
      setGs(p=>p?{...p,phase:'ACTION',drawReveal:null}:p);
      setAnim({type:'DICE_ROLL',d1:result.d1,d2:0,heal:0,rollerName:result.who,dodgeSuccess:result.dodgeSuccess});
      return;
    }
    const queue=bindAnimLogChunks(buildAnimQueue(gs,result.newGs),splitAnimBoundLogs(result.L.slice(gs.log.length)));
    // 无论是否有其他动画，都播放骰子动画
    pendingGsRef.current=result.newGs;
    animQueueRef.current=queue;
    setGs(p=>p?{...p,phase:'ACTION',drawReveal:null}:p);
    setAnim({type:'DICE_ROLL',d1:result.d1,d2:0,heal:0,rollerName:result.who,dodgeSuccess:result.dodgeSuccess});
  }

  function handleTreasureDodgeSkip(){
    const dr=gs.drawReveal;if(!dr?.card)return;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard];
    const drawerIdx=dr.drawerIdx??0;
    const res=applyFx(dr.card,drawerIdx,null,P,D,Disc,gs,false,[],false);
    P=res.P;D=res.D;Disc=res.Disc;P[drawerIdx].hand.push(dr.card);
    const who=localDisplayName(drawerIdx,P[drawerIdx].name);
    const L=[...gs.log,`${who} 收入了 ${cardLogText(dr.card,{alwaysShowName:true})}`,...res.msgs];
    // 1. 检查卡牌效果是否让任何人HP归零或SAN归零（通过checkWin）
    const win=checkWin(P,gs._isMP);if(win){setGs({...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win,drawReveal:null});return;}
    // 2. 最后，如果游戏仍未结束，且该寻宝者仍然存活，检查该寻宝者是否达成胜利条件
    if(isLocalSeatIndex(drawerIdx)&&!P[0].isDead&&P[0].role==='寻宝者'&&isWinHand(P[0].hand)){
      P[0].roleRevealed=true;
      setGs({...gs,players:P,deck:D,discard:Disc,log:[...L,'你集齐了全部编号！'],phase:'PLAYER_WIN_PENDING',drawReveal:null,abilityData:{winReason:'你集齐了全部编号并获胜！'}});
      return;
    }
    const newGs={...gs,players:P,deck:D,discard:Disc,log:L,phase:'ACTION',drawReveal:null,abilityData:{fromRest:gs.abilityData?.fromRest,cthDrawsRemaining:gs.abilityData?.cthDrawsRemaining}};
    if(dr.fromRest&&!win){_cthContinueRestDraws(newGs);return;}
    const queue=bindAnimLogChunks(buildAnimQueue(gs,newGs),splitAnimBoundLogs(L.slice(gs.log.length)));
    if(queue.length){
      pendingGsRef.current=newGs;
      animQueueRef.current=[...queue.slice(1)];
      setGs(p=>p?{...p,phase:'ACTION',drawReveal:null}:p);
      setAnim(queue[0]);
    }else setGs(newGs);
  }

  function handleTreasureAOEDodgeRoll(){
    const dr=gs.drawReveal;if(!dr?.card)return;
    const result=handleTreasureDodge(gs,dr,true);
    if(result.win){
      setGs({...gs,players:result.P,deck:result.D,discard:result.Disc,log:result.L,gameOver:result.win,drawReveal:null});
      return;
    }
    if(result.pendingWinGs){
      pendingGsRef.current=result.pendingWinGs;
      animQueueRef.current=[];
      setGs(p=>p?{...p,phase:'ACTION',drawReveal:null}:p);
      setAnim({type:'DICE_ROLL',d1:result.d1,d2:0,heal:0,rollerName:'你',dodgeSuccess:result.dodgeSuccess});
      return;
    }
    if(dr.fromRest&&!result.win){
      pendingGsRef.current=result.newGs;
      animQueueRef.current=[{type:'CTH_CONTINUE',data:{cthDrawsRemaining:gs.abilityData?.cthDrawsRemaining}}];
      setGs(p=>p?{...p,phase:'ACTION',drawReveal:null}:p);
      setAnim({type:'DICE_ROLL',d1:result.d1,d2:0,heal:0,rollerName:'你',dodgeSuccess:result.dodgeSuccess});
      return;
    }
    const queue=bindAnimLogChunks(buildAnimQueue(gs,result.newGs),splitAnimBoundLogs(result.L.slice(gs.log.length)));
    // 无论是否有其他动画，都播放骰子动画
    pendingGsRef.current=result.newGs;
    animQueueRef.current=queue;
    setGs(p=>p?{...p,phase:'ACTION',drawReveal:null}:p);
    setAnim({type:'DICE_ROLL',d1:result.d1,d2:0,heal:0,rollerName:'你',dodgeSuccess:result.dodgeSuccess});
  }

  function handleTreasureAOEDodgeSkip(){
    const dr=gs.drawReveal;if(!dr?.card)return;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard];
    const drawerIdx=gs.abilityData?.drawerIdx??0;
    const res=applyFx(dr.card,drawerIdx,null,P,D,Disc,gs);
    P=res.P;D=res.D;Disc=res.Disc;P[drawerIdx].hand.push(dr.card);
    const L=[...gs.log,`你选择不规避负面效果`,...res.msgs];
    // 1. 检查卡牌效果是否让任何人HP归零或SAN归零（通过checkWin）
    const win=checkWin(P,gs._isMP);if(win){setGs({...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win,drawReveal:null});return;}
    // 2. 最后，如果游戏仍未结束，且该寻宝者仍然存活，检查该寻宝者是否达成胜利条件
    if(isLocalSeatIndex(drawerIdx)&&!P[0].isDead&&P[0].role==='寻宝者'&&isWinHand(P[0].hand)){
      P[0].roleRevealed=true;
      setGs({...gs,players:P,deck:D,discard:Disc,log:[...L,'你集齐了全部编号！'],phase:'PLAYER_WIN_PENDING',drawReveal:null,abilityData:{winReason:'你集齐了全部编号并获胜！'}});
      return;
    }
    const newGs={...gs,players:P,deck:D,discard:Disc,log:L,phase:'ACTION',drawReveal:null,abilityData:{fromRest:gs.abilityData?.fromRest,cthDrawsRemaining:gs.abilityData?.cthDrawsRemaining}};
    if(dr.fromRest&&!win){_cthContinueRestDraws(newGs);return;}
    const queue=bindAnimLogChunks(buildAnimQueue(gs,newGs),splitAnimBoundLogs(L.slice(gs.log.length)));
    if(queue.length){
      pendingGsRef.current=newGs;
      animQueueRef.current=[...queue.slice(1)];
      setGs(p=>p?{...p,phase:'ACTION',drawReveal:null}:p);
      setAnim(queue[0]);
    }else setGs(newGs);
  }

  function handleDrawDiscard(){
    const dr=gs.drawReveal;if(!dr?.card)return;
    const drawerIdx=dr.drawerIdx??0;
    const who=localDisplayName(drawerIdx,(dr.drawerName||gs.players[drawerIdx]?.name||'该角色'));
    // 先播放弃牌动画，再更新游戏状态
    const discardCard=dr.card;
    const discardLog=`${who} 弃置了 ${cardLogText(dr.card,{alwaysShowName:true})}`;
    const queue=[{type:'DISCARD',card:discardCard,triggerName:who,msgs:[discardLog]}];
    const newGs={...gs,discard:[...gs.discard,dr.card],log:[...gs.log,discardLog],phase:'ACTION',drawReveal:null,abilityData:gs.abilityData};
    // CTH fromRest: after discarding, process remaining draws then advance turn
    if(dr.fromRest){
      // 播放动画后继续处理剩余抽牌
      triggerAnimQueue(queue,newGs,()=>{
        _cthContinueRestDraws(newGs);
      });
    }else{
      // 播放动画后更新游戏状态
      triggerAnimQueue(queue,newGs);
    }
  }

  function useAbility(){
    const P = gs.players;
    const skillRole=gs.globalOnlySwapOwner!=null?'寻宝者':me.role;
    if((phase!=='ACTION'&&phase!=='HUNT_SELECT_TARGET')||isBlocked||gs.restUsed||P[0].disableSkill)return;
    if(skillRole!=='追猎者'&&gs.skillUsed)return;
    // 追猎者可以在同一回合内多次使用追捕技能，即使skillUsed为true
    // Snapshot roleRevealed so cancel can restore it if skill is aborted
    const preSkillRevealed=me.roleRevealed;
    if(skillRole==='寻宝者')setGs({...gs,phase:'SWAP_SELECT_TARGET',abilityData:{preSkillRevealed}});
    else if(skillRole==='追猎者')setGs({...gs,phase:'HUNT_SELECT_TARGET',abilityData:{preSkillRevealed}});
    else setGs({...gs,phase:'BEWITCH_SELECT_CARD',abilityData:{preSkillRevealed}});
  }

  function swapSelectTarget(ti){
    if(!gs.players[ti].hand.length)return;
    let P=copyPlayers(gs.players);
    // 只有使用自己的掉包技能时才公开身份，通过“绮丽诗篇”获得的掉包技能不公开身份
    if(gs.globalOnlySwapOwner===null){
      P[0].roleRevealed=true;
    }
    const targetPlayer=P[ti];
    // 如果目标玩家手牌公开，让玩家选择一张牌
    if(targetPlayer.revealHand){
      setGs({...gs,players:P,phase:'SWAP_SELECT_TARGET_CARD',
        abilityData:{swapTi:ti,preSkillRevealed:gs.abilityData?.preSkillRevealed},
        log:[...gs.log,`你${gs.globalOnlySwapOwner!==null?'':'（寻宝者）'}对 ${gs.players[ti].name} 【掉包】，请选择要抽取的牌`]});
    }else{
      // 否则随机抽取
      const ri2=0|Math.random()*P[ti].hand.length;
      const taken=P[ti].hand.splice(ri2,1)[0];
      setGs({...gs,players:P,phase:'SWAP_GIVE_CARD',
        abilityData:{swapTi:ti,takenCard:taken,preSkillRevealed:gs.abilityData?.preSkillRevealed},
        log:[...gs.log,`你${gs.globalOnlySwapOwner!==null?'':'（寻宝者）'}对 ${gs.players[ti].name} 【掉包】，暗抽了1张牌`]});
    }
  }
  function zoneSwapSelectTarget(ti){
    // 强征献礼：与目标交换全部手牌
    const card=gs.abilityData?.zoneSwapCard;
    if(!card)return;
    const fromRest=gs.abilityData?.fromRest;
    const myHandCountBefore=gs.players?.[0]?.hand?.length||0;
    const targetHandCountBefore=gs.players?.[ti]?.hand?.length||0;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard];
    const res=applyFx(card,0,ti,P,D,Disc,gs);
    P=res.P;D=res.D;Disc=res.Disc;
    P[0].hand.push(card); // 区域牌留在手中（效果已执行）
    const L=[...gs.log,...res.msgs];
    const win=checkWin(P,gs._isMP);
    if(win){setGs({...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win,phase:'ACTION',abilityData:{}});return;}
    if(P[0].role==='寻宝者'&&isWinHand(P[0].hand)){
      P[0].roleRevealed=true;
      setGs({...gs,players:P,deck:D,discard:Disc,log:[...L,'你集齐了全部编号！'],phase:'PLAYER_WIN_PENDING',abilityData:{winReason:'你集齐了全部编号并获胜！'}});
      return;
    }
    const newGs={...gs,players:P,deck:D,discard:Disc,log:L,phase:'ACTION',abilityData:{
      ...(fromRest?{fromRest:true}:{}),
      ...(gs.abilityData?.cthDrawsRemaining!=null?{cthDrawsRemaining:gs.abilityData.cthDrawsRemaining}:{}),
    }};
    const swapMsgs=extractSkillLogs(L.slice(gs.log.length),'swap');
    const swapTransfer1={type:'CARD_TRANSFER',fromPid:0,dest:'player',toPid:ti,count:myHandCountBefore};
    const swapTransfer2={type:'CARD_TRANSFER',fromPid:ti,dest:'player',toPid:0,count:targetHandCountBefore,msgs:[L[L.length-1]]};
    const statQ=buildAnimQueue(gs,newGs).filter(a=>a.type!=='CARD_TRANSFER');
    const queue=[{type:'SKILL_SWAP',msgs:swapMsgs},swapTransfer1,swapTransfer2,...statQ];
    if(fromRest){triggerAnimQueue(queue,null,()=>_cthContinueRestDraws(newGs));return;}
    triggerAnimQueue(queue,newGs);
  }
  function peekHandSelectTarget(ti){
    // 偷看手牌：选择目标角色后，偷看其一张手牌
    const {peekHandTargets,peekHandSource}=gs.abilityData;
    if(!peekHandTargets||!peekHandTargets.includes(ti))return;
    let P=copyPlayers(gs.players);
    const targetPlayer=P[ti];
    if(!targetPlayer?.hand?.length)return;
    // 随机选择一张手牌偷看
    const randomIndex=Math.floor(Math.random()*targetPlayer.hand.length);
    const peekedCard=targetPlayer.hand[randomIndex];
    const peekMemory={
      key:peekedCard?.key,
      letter:peekedCard?.letter??null,
      number:peekedCard?.number??null,
      isGod:!!peekedCard?.isGod,
      name:peekedCard?.name||'',
    };
    if(peekHandSource!=null&&P[peekHandSource]){
      const memories={...(P[peekHandSource].peekMemories||{})};
      const existing=[...(memories[ti]||[])].filter(card=>card?.key!==peekMemory.key);
      memories[ti]=[peekMemory,...existing].slice(0,4);
      P[peekHandSource].peekMemories=memories;
    }
    // 记录偷看的信息到日志
    let L;
    if(gs._isMP){
      // 联机对战：显示通用日志，不包含具体卡牌信息
      const sourceName=isLocalSeatIndex(peekHandSource)?gs.players[0].name:(gs.players[peekHandSource]?.name||'某人');
      L=[...gs.log,`${sourceName} 偷看了 ${targetPlayer.name} 的一张手牌`];
    }else{
      // 单机游戏：显示具体卡牌信息
      L=[...gs.log,`你偷看了 ${targetPlayer.name} 的一张手牌：${cardLogText(peekedCard,{alwaysShowName:true})}`];
    }
    const resumesAiTurn = isAiSeat(gs, gs.currentTurn) && !P[gs.currentTurn]?.isDead;
    const nextPhase = resumesAiTurn ? 'AI_TURN' : 'ACTION';
    const nextGs = {...gs, players: P, log: L, phase: nextPhase, currentTurn: gs.currentTurn, skillUsed: gs.skillUsed, abilityData: {
      ...(gs.abilityData?.fromRest?{fromRest:true}:{}),
      ...(gs.abilityData?.cthDrawsRemaining!=null?{cthDrawsRemaining:gs.abilityData.cthDrawsRemaining}:{}),
    }};
    if(isLocalSeatIndex(peekHandSource)){
      setPrivatePeek({card:peekedCard,targetName:targetPlayer.name});
    }
    if(gs.abilityData?.fromRest){_cthContinueRestDraws(nextGs);return;}
    setGs(nextGs);
  }
  function caveDuelSelectTarget(ti){
    // 穴居人战争：选择目标角色后，双方各亮一张手牌，数字编号更大的一方收下这两张牌
    const {caveDuelTargets,caveDuelSource}=gs.abilityData;
    if(!caveDuelTargets||!caveDuelTargets.includes(ti))return;
    let P=copyPlayers(gs.players);
    const sourcePlayer=P[caveDuelSource];
    const targetPlayer=P[ti];
    // 检查目标角色是否有手牌
    if(targetPlayer.hand.length===0){
      return;
    }
    
    // 源角色选择牌（AI选择数字编号最大的牌）
    let sourceCardIndex, sourceCard;
    if(isLocalSeatIndex(caveDuelSource)){
      // 玩家作为源角色，需要选择牌
      setGs({...gs,phase:'CAVE_DUEL_SELECT_CARD',abilityData:{...gs.abilityData,caveDuelTarget:ti}});
      return;
    }else{
      // AI作为源角色，选择数字编号最大的牌
      let maxNumber=-1;
      sourceCardIndex=0;
      for(let i=0;i<sourcePlayer.hand.length;i++){
        const card=sourcePlayer.hand[i];
        const number=card.isGod?0:(card.number||0);
        if(number>maxNumber){
          maxNumber=number;
          sourceCardIndex=i;
        }
      }
      sourceCard=sourcePlayer.hand[sourceCardIndex];
    }
    
    // 目标角色选择牌
    let targetCardIndex, targetCard;
    if(ti===0){
      // 玩家作为目标角色，需要选择牌
      setGs({...gs,phase:'CAVE_DUEL_SELECT_CARD',abilityData:{...gs.abilityData,caveDuelSource:caveDuelSource,caveDuelTarget:ti,sourceCardIndex:sourceCardIndex,sourceCard:sourceCard}});
      return;
    }else{
      // AI作为目标角色，选择数字编号最大的牌
      let maxNumber=-1;
      targetCardIndex=0;
      for(let i=0;i<targetPlayer.hand.length;i++){
        const card=targetPlayer.hand[i];
        const number=card.isGod?0:(card.number||0);
        if(number>maxNumber){
          maxNumber=number;
          targetCardIndex=i;
        }
      }
      targetCard=targetPlayer.hand[targetCardIndex];
      // 执行穴居人战争效果
      executeCaveDuel(P, caveDuelSource, ti, sourceCardIndex, targetCardIndex, sourceCard, targetCard, gs);
    }
  }
  
  function executeCaveDuel(P, caveDuelSource, ti, sourceCardIndex, targetCardIndex, sourceCard, targetCard, gs){
    // 计算数字编号（邪神牌视为0）
    const sourceNumber=sourceCard.isGod?0:(sourceCard.number||0);
    const targetNumber=targetCard.isGod?0:(targetCard.number||0);
    // 比较数字编号
    let L;
    if(sourceNumber>targetNumber){
      // 源角色获胜，收下两张牌
      P[caveDuelSource].hand.splice(sourceCardIndex,1);
      P[ti].hand.splice(targetCardIndex,1);
      P[caveDuelSource].hand.push(sourceCard,targetCard);
      L=[...gs.log,`【穴居人战争】${P[caveDuelSource].name} 亮出 ${cardLogText(sourceCard,{alwaysShowName:true})}，${P[ti].name} 亮出 ${cardLogText(targetCard,{alwaysShowName:true})}，${P[caveDuelSource].name} 胜出，收下两张牌`];
    }else if(targetNumber>sourceNumber){
      // 目标角色获胜，收下两张牌
      P[caveDuelSource].hand.splice(sourceCardIndex,1);
      P[ti].hand.splice(targetCardIndex,1);
      P[ti].hand.push(sourceCard,targetCard);
      L=[...gs.log,`【穴居人战争】${P[caveDuelSource].name} 亮出 ${cardLogText(sourceCard,{alwaysShowName:true})}，${P[ti].name} 亮出 ${cardLogText(targetCard,{alwaysShowName:true})}，${P[ti].name} 胜出，收下两张牌`];
    }else{
      // 平局，各自收回自己的牌
      L=[...gs.log,`【穴居人战争】${P[caveDuelSource].name} 亮出 ${cardLogText(sourceCard,{alwaysShowName:true})}，${P[ti].name} 亮出 ${cardLogText(targetCard,{alwaysShowName:true})}，平局，各自收回自己的牌`];
    }
    const winnerIdx=sourceNumber>targetNumber?caveDuelSource:targetNumber>sourceNumber?ti:null;
    const resumesAiTurn = isAiSeat(gs, gs.currentTurn) && !gs.abilityData?.fromRest;
    const nextGs={...gs,players:P,log:L,phase:resumesAiTurn?'AI_TURN':'ACTION',currentTurn:gs.currentTurn,abilityData:{
      ...(gs.abilityData?.fromRest?{fromRest:true}:{}),
      ...(gs.abilityData?.cthDrawsRemaining!=null?{cthDrawsRemaining:gs.abilityData.cthDrawsRemaining}:{}),
    },
      // 对决开始前那次 AI 起手横幅/翻牌已经播过；结算后继续当前回合时不应再重播
      _aiDrawnCard:null,
      _drawnCard:null,
      _discardedDrawnCard:false,
      _playersBeforeThisDraw:null,
      _turnStartLogs:[],
      _drawLogs:[],
      _statLogs:[],
      _preTurnPlayers:null,
    };
    const duelAnim={type:'CAVE_DUEL',sourceIdx:caveDuelSource,targetIdx:ti,sourceCard,targetCard,winnerIdx,msgs:L.slice(-1)};
    if(gs.abilityData?.fromRest){
      syncVisibleLog(L);
      triggerAnimQueue([duelAnim],nextGs,()=>_cthContinueRestDraws(nextGs));
      return;
    }
    syncVisibleLog(L);
    triggerAnimQueue([duelAnim],nextGs);
  }
  
  function caveDuelSelectCard(cardIndex){
    // 穴居人战争：玩家选择要亮的牌
    const {caveDuelSource,caveDuelTarget,sourceCardIndex,sourceCard}=gs.abilityData;
    let P=copyPlayers(gs.players);
    const sourcePlayer=P[caveDuelSource];
    const targetPlayer=P[caveDuelTarget];
    
    if(isLocalSeatIndex(caveDuelSource)){
      // 玩家作为源角色
      const playerCard=sourcePlayer.hand[cardIndex];
      // 目标角色选择牌
      let targetCardIndex, targetCard;
      if(isLocalSeatIndex(caveDuelTarget)){
        // 双方都是玩家，不可能的情况
        return;
      }else{
        // AI作为目标角色，选择数字编号最大的牌
        let maxNumber=-1;
        targetCardIndex=0;
        for(let i=0;i<targetPlayer.hand.length;i++){
          const card=targetPlayer.hand[i];
          const number=card.isGod?0:(card.number||0);
          if(number>maxNumber){
            maxNumber=number;
            targetCardIndex=i;
          }
        }
        targetCard=targetPlayer.hand[targetCardIndex];
        // 执行穴居人战争效果
        executeCaveDuel(P, caveDuelSource, caveDuelTarget, cardIndex, targetCardIndex, playerCard, targetCard, gs);
      }
    }else{
      // 玩家作为目标角色
      const playerCard=targetPlayer.hand[cardIndex];
      // 执行穴居人战争效果
      executeCaveDuel(P, caveDuelSource, caveDuelTarget, sourceCardIndex, cardIndex, sourceCard, playerCard, gs);
    }
  }
  function damageLinkSelectTarget(ti){
    // 两人一绳：选择目标角色后，建立伤害传导链条
    const {damageLinkTargets,damageLinkSource}=gs.abilityData;
    if(!damageLinkTargets||!damageLinkTargets.includes(ti))return;
    let P=copyPlayers(gs.players);
    const sourcePlayer=P[damageLinkSource];
    const targetPlayer=P[ti];
    // 建立链条：在两名玩家之间建立伤害传导关系
    // 使用damageLink字段存储链条信息：{partner: 对方索引, active: 是否激活, expiryOwner: 发起者的下回合开始时过期}
    sourcePlayer.damageLink={partner:ti,active:true,expiryOwner:damageLinkSource};
    targetPlayer.damageLink={partner:damageLinkSource,active:true,expiryOwner:damageLinkSource};
const L=[...gs.log,`【两人一绳】${sourcePlayer.name} 与 ${targetPlayer.name} 间架起链条，一方受到HP伤害时另一方受等量伤害`];
    const resumesAiTurn = isAiSeat(gs, gs.currentTurn) && !P[gs.currentTurn]?.isDead;
    const nextPhase = resumesAiTurn ? 'AI_TURN' : 'ACTION';
    const nextGs = {
      ...gs,
      players: P,
      log: L,
      phase: nextPhase,
      currentTurn: gs.currentTurn,
      abilityData: {
        ...(gs.abilityData?.fromRest ? { fromRest: true } : {}),
        ...(gs.abilityData?.cthDrawsRemaining != null ? { cthDrawsRemaining: gs.abilityData.cthDrawsRemaining } : {}),
      },
    };
    if (gs.abilityData?.fromRest) { _cthContinueRestDraws(nextGs); return; }
    syncVisibleLog(L);
    triggerAnimQueue([{type:'CARD_TRANSFER'}], nextGs);
  }

  function roseThornSelectTarget(ti){
    const {roseThornTargets,roseThornSource}=gs.abilityData;
    if(!roseThornTargets||!roseThornTargets.includes(ti)||roseThornSource==null)return;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard];
    const sourcePlayer=P[roseThornSource];
    const targetPlayer=P[ti];
    const gifted=sourcePlayer.hand.splice(0).map(card=>({
      ...card,
      roseThornHolderId:ti,
      roseThornSourceId:roseThornSource,
      roseThornSourceName:sourcePlayer.name,
    }));
    const giftedCount=gifted.length;
    targetPlayer.hand.push(...gifted);
    const L=[...gs.log,`【玫瑰倒刺】${sourcePlayer.name} 将全部手牌交给了 ${targetPlayer.name}`];
    const nextAbilityData={
      ...(gs.abilityData?.fromRest?{fromRest:true}:{}),
      ...(gs.abilityData?.cthDrawsRemaining!=null?{cthDrawsRemaining:gs.abilityData.cthDrawsRemaining}:{}),
    };
    const win=checkWin(P,gs._isMP);
    if(win){
      setGs({...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win,phase:'ACTION',abilityData:{}});
      return;
    }
    if(ti===0&&!P[0].isDead&&(P[0]._nyaBorrow||P[0].role)===ROLE_TREASURE&&isWinHand(P[0].hand)){
      P[0].roleRevealed=true;
      setGs({...gs,players:P,deck:D,discard:Disc,log:[...L,'你集齐了全部编号！'],phase:'PLAYER_WIN_PENDING',abilityData:{winReason:'你集齐了全部编号并获胜！'}});
      return;
    }
    if(ti!==0&&!P[ti].isDead&&P[ti].role===ROLE_TREASURE&&isWinHand(P[ti].hand)){
      P[ti].roleRevealed=true;
      setGs({
        ...gs,
        players:P,
        deck:D,
        discard:Disc,
        log:[...L,`${P[ti].name} 集齐全部编号并获胜！`],
        gameOver:{winner:ROLE_TREASURE,reason:`${P[ti].name} 集齐了全部编号并获胜！`,winnerIdx:ti},
        phase:'ACTION',
        abilityData:{},
      });
      return;
    }
    const resumesAiTurn = isAiSeat(gs, gs.currentTurn) && !P[gs.currentTurn]?.isDead;
    const nextPhase = resumesAiTurn ? 'AI_TURN' : 'ACTION';
    const nextGs = {
      ...gs,
      players: P,
      deck: D,
      discard: Disc,
      log: L,
      phase: nextPhase,
      currentTurn: gs.currentTurn,
      abilityData: nextAbilityData,
    };
    const statQ=buildAnimQueue(gs,nextGs).filter(a=>a.type!=='CARD_TRANSFER');
    const queue=[
      {type:'CARD_TRANSFER',fromPid:roseThornSource,dest:'player',toPid:ti,count:giftedCount,msgs:[L[L.length-1]]},
      ...statQ
    ];
    if (gs.abilityData?.fromRest) { triggerAnimQueue(queue,null,()=>_cthContinueRestDraws(nextGs)); return; }
    triggerAnimQueue(queue,nextGs);
  }

  function firstComePickSelectCard(cardIndex){
    const abilityData=gs.abilityData||{};
    const revealedCards=[...(abilityData.revealedCards||[])];
    const pickOrder=abilityData.pickOrder||[];
    const pickIndex=abilityData.pickIndex||0;
    const pickerIdx=pickOrder[pickIndex];
    if(pickerIdx!==0||cardIndex<0||cardIndex>=revealedCards.length)return;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard];
    const [chosenCard]=revealedCards.splice(cardIndex,1);
    P[0].hand.push(chosenCard);
    const L=[...gs.log,`【先到先得】你选择了 ${cardLogText(chosenCard,{alwaysShowName:true})}`];
    const nextPickIndex=pickIndex+1;
    const win=checkWin(P,gs._isMP);
    if(win){
      setGs({...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win,phase:'ACTION',abilityData:{}});
      return;
    }
    if(!P[0].isDead&&(P[0]._nyaBorrow||P[0].role)===ROLE_TREASURE&&isWinHand(P[0].hand)){
      P[0].roleRevealed=true;
      setGs({...gs,players:P,deck:D,discard:Disc,log:[...L,'你集齐了全部编号！'],phase:'PLAYER_WIN_PENDING',abilityData:{winReason:'你集齐了全部编号并获胜！'}});
      return;
    }
    if(nextPickIndex>=pickOrder.length||revealedCards.length===0){
      const resumesAiTurn = isAiSeat(gs, gs.currentTurn);
      const newGs = {...gs, players: P, deck: D, discard: Disc, log: L, phase: resumesAiTurn ? 'AI_TURN' : 'ACTION', currentTurn: gs.currentTurn, abilityData: {
        ...(abilityData.fromRest?{fromRest:true}:{}),
        ...(abilityData.cthDrawsRemaining!=null?{cthDrawsRemaining:abilityData.cthDrawsRemaining}:{}),
      },
        // 先到先得的起手摸牌/翻牌动画在进入共享选牌阶段前已经播过；结束后继续当前回合时不应再重播
        _aiDrawnCard:null,
        _drawnCard:null,
        _discardedDrawnCard:false,
        _playersBeforeThisDraw:null,
        _turnStartLogs:[],
        _drawLogs:[],
        _statLogs:[],
        _preTurnPlayers:null,
      };
      if(abilityData.fromRest&&isLocalSeatIndex(abilityData.pickSource)){_cthContinueRestDraws(newGs);return;}
      setGs(newGs);
      return;
    }
    const nextGs={...gs,players:P,deck:D,discard:Disc,log:L,phase:'FIRST_COME_PICK_SELECT',abilityData:{...abilityData,revealedCards,pickIndex:nextPickIndex}};
    setGs(nextGs);
  }
  function swapSelectTargetCard(cardIdx){
    const{swapTi}=gs.abilityData;
    let P=copyPlayers(gs.players);
    const taken=P[swapTi].hand.splice(cardIdx,1)[0];
    setGs({...gs,players:P,phase:'SWAP_GIVE_CARD',
      abilityData:{...gs.abilityData,takenCard:taken},
      log:[...gs.log,`你选择抽取了 ${cardLogText(taken,{alwaysShowName:true})}`]}
    );
  }
  function swapGiveCard(idx){
    const{swapTi,takenCard}=gs.abilityData;
    let P=copyPlayers(gs.players);
    const given=P[0].hand.splice(idx,1)[0];
    P[0].hand.push(takenCard);P[swapTi].hand.push(given);
    const L=[...gs.log,`拿走 ${cardLogText(takenCard,{alwaysShowName:true})}，还给 ${P[swapTi].name} ${cardLogText(given,{alwaysShowName:true})}`];
    // 只有真正的寻宝者才能通过集齐全部编号获胜
    if(P[0].role==='寻宝者'&&isWinHand(P[0].hand)){
      const _wname=gs._isMP?gs.players[0].name:'你';
      // 同时检查对方（目标）是否也是寻宝者且满足胜利条件（双寻宝者掉包规则）
      const targetAlsoWins=P[swapTi].role==='寻宝者'&&isWinHand(P[swapTi].hand);
      if(targetAlsoWins){
        // 双方均获胜：直接进入 gameOver，双寻宝者共赢
        const tname=P[swapTi].name;
        if(gs.globalOnlySwapOwner===null)P[0].roleRevealed=true;
        P[swapTi].roleRevealed=true;
        const reason=gs._isMP
          ?`${_wname} 与 ${tname} 互换后双方均集齐编号，两位寻宝者共同获胜！`
          :`你与 ${tname} 互换后双方均集齐编号，两位寻宝者共同获胜！`;
        const newGs={...gs,players:P,log:[...L,reason],abilityData:{},
          gameOver:{winner:'寻宝者',reason,winnerIdx:0,winnerIdx2:swapTi}};
        triggerAnimQueue([{type:'SKILL_SWAP',msgs:[reason]}],newGs);
        return;
      }
      setGs({...gs,players:P,log:[...L,`${_wname}集齐了全部编号！`],abilityData:{winReason:`${_wname}通过掉包集齐了全部编号！`},
        phase:'PLAYER_WIN_PENDING'});
      return;
    }
    // 检查目标（非自身）是否为寻宝者且掉包后获胜
    if(P[swapTi].role==='寻宝者'&&isWinHand(P[swapTi].hand)){
      P[swapTi].roleRevealed=true;
      const tname=P[swapTi].name;
      const reason=`${tname} 获得了最后一张编号，寻宝者获胜！`;
      L.push(reason);
      const newGs={...gs,players:P,log:L,abilityData:{},
        gameOver:{winner:'寻宝者',reason,winnerIdx:swapTi},phase:'ACTION',skillUsed:true};
      const statQ2=buildAnimQueue(gs,newGs).filter(a=>a.type!=='CARD_TRANSFER');
      triggerAnimQueue([{type:'SKILL_SWAP',msgs:[reason]},
        {type:'CARD_TRANSFER',fromPid:0,dest:'player',toPid:swapTi,count:1},
        {type:'CARD_TRANSFER',fromPid:swapTi,dest:'player',toPid:0,count:1},
        ...statQ2],newGs);
      return;
    }
    const win=checkWin(P,gs._isMP);
    const newGs={...gs,players:P,log:L,abilityData:{},phase:'ACTION',skillUsed:true,...(win?{gameOver:win}:{})};
    // 手动注入飞牌动画：掉包是两步操作，buildAnimQueue 无法从单步 diff 检测到双向交换
    // event1：player 0 把 given 牌给 swapTi
    // event2：swapTi 的 takenCard 飞向 player 0（已在 swapSelectTarget 里取出）
    const swapTransfer1={type:'CARD_TRANSFER',fromPid:0,dest:'player',toPid:swapTi,count:1};
    const swapTransfer2={type:'CARD_TRANSFER',fromPid:swapTi,dest:'player',toPid:0,count:1,msgs:[L[L.length-1]]};
    const statQ=buildAnimQueue(gs,newGs).filter(a=>a.type!=='CARD_TRANSFER');
    const swapMsgs=extractSkillLogs(L.slice(gs.log.length),'swap');
    triggerAnimQueue([{type:'SKILL_SWAP',msgs:swapMsgs},swapTransfer1,swapTransfer2,...statQ],newGs);
  }

  function huntSelectTarget(ti){
    let P=copyPlayers(gs.players);P[0].roleRevealed=true;
    if(!P[ti].hand.length){
      setGs({...gs,players:P,phase:'ACTION',abilityData:{},log:[...gs.log,`${P[ti].name} 手中无牌，追捕失败`]});
      return;
    }
    if(gs._isMP){
      // 多人游戏：目标是真人玩家，让目标自己选择亮出哪张牌（20秒超时随机）
      // 暂停房主回合计时器：进入 HUNT_WAIT_REVEAL 子阶段，目标玩家选完后恢复
      const huntWaitGs={...gs,players:P,phase:'HUNT_WAIT_REVEAL',
        abilityData:{...(gs.abilityData||{}),huntTi:ti},
        log:[...gs.log,`你（追猎者）追捕 ${P[ti].name}，等待对方亮出一张手牌…`]};
      const huntMsgs=extractSkillLogs(huntWaitGs.log.slice(gs.log.length),'hunt');
      triggerAnimQueue([{type:'SKILL_HUNT',targetIdx:ti,msgs:huntMsgs}],huntWaitGs);
      return;
    }
    // 单机/AI目标：由AI策略选择最优亮牌
    const knownHunterCards=P[ti]?.peekMemories?.[0]||[];
    const rc=aiChooseRevealCard(P[ti].hand,'你',gs.log,knownHunterCards);
    const huntConfirmGs={...gs,players:P,phase:'HUNT_CONFIRM',
      abilityData:{...(gs.abilityData||{}),huntTi:ti,revCard:rc},
      log:[...gs.log,`你（追猎者）追捕 ${P[ti].name}，${P[ti].name} 亮出 ${cardLogText(rc,{alwaysShowName:true})}`]};
    // 动画位置测量交给 useEffect([anim]) 中的 SKILL_HUNT 分支（使用 data-pid，正确）
    const huntMsgs=extractSkillLogs(huntConfirmGs.log.slice(gs.log.length),'hunt');
    triggerAnimQueue([{type:'SKILL_HUNT',targetIdx:ti,msgs:huntMsgs}],huntConfirmGs);
  }
  function huntConfirm(myCardIdx){
    const{huntTi}=gs.abilityData;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard],L=[...gs.log];
    if(myCardIdx>=0){
      const targetHandBefore=[...(P[huntTi]?.hand||[])];
      const targetRevealBefore=!!P[huntTi]?.revealHand;
      const dc=P[0].hand.splice(myCardIdx,1)[0];Disc.push(dc);
      const huntDamage=3+(P[0].damageBonus||0);
      applyHpDamageWithLink(P,huntTi,huntDamage,Disc,L,gs.currentTurn,D);
      L.push(`弃 ${cardLogText(dc,{alwaysShowName:true})} → ${P[huntTi].name} 受 ${huntDamage}HP 伤害`);
      // 追捕成功时揭晓追猎者身份
      if(!P[0].roleRevealed){
        P[0].roleRevealed=true;
        L.push(`${P[0].name} 的身份揭晓：追猎者`);
      }
      if(P[huntTi].hp<=0){
        const lootableHand=targetHandBefore;
        if(lootableHand.length){
          const maxToTake=3;
          const handCount=lootableHand.length;
          const playersForLootCheck=copyPlayers(P);
          playersForLootCheck[huntTi].hand=[...lootableHand];
          const shouldOpenLootSelection=shouldDelayHuntLootSelection(playersForLootCheck,huntTi,maxToTake,gs._isMP);
          if(shouldOpenLootSelection){
            Disc=removeCardsFromDiscard(Disc,lootableHand);
            P[huntTi].hand=[...lootableHand];
            // 先播放死亡特效，然后再进入选择手牌的阶段
            const deathGs={...gs,players:P,deck:D,log:L};
            const queue=buildAnimQueue(gs,deathGs);
            if(queue.length){
              // 动画播放完成后进入选择手牌的阶段
              triggerAnimQueue(queue,{...deathGs,phase:'HUNT_SELECT_CARD_FROM_PUBLIC',abilityData:{huntTi:huntTi,preSkillRevealed:gs.abilityData?.preSkillRevealed,maxToTake:Math.min(maxToTake,handCount)},
                log:[...L,`你（追猎者）从 ${P[huntTi].name} 的公开手牌中任选 ${Math.min(maxToTake,handCount)} 张！`]});
            }else{
              // 没有动画时直接进入选择手牌的阶段
              setGs({...gs,players:P,deck:D,phase:'HUNT_SELECT_CARD_FROM_PUBLIC',abilityData:{huntTi:huntTi,preSkillRevealed:gs.abilityData?.preSkillRevealed,maxToTake:Math.min(maxToTake,handCount)},
                log:[...L,`你（追猎者）从 ${P[huntTi].name} 的公开手牌中任选 ${Math.min(maxToTake,handCount)} 张！`]});
            }
            return;
          }else if(targetRevealBefore){
            Disc=removeCardsFromDiscard(Disc,lootableHand);
            P[0].hand.push(...lootableHand);
            P[huntTi].hand=[];
            L.push(`你夺取了 ${P[huntTi].name} 的全部公开手牌（${lootableHand.length} 张）！`);
          }else{
            Disc=removeCardsFromDiscard(Disc,lootableHand);
            P[huntTi].hand=[...lootableHand];
            const cardsToTake=Math.min(maxToTake,handCount);
            for(let i=0;i<cardsToTake;i++){
              const randomIndex=Math.floor(Math.random()*P[huntTi].hand.length);
              const stolenCard=P[huntTi].hand.splice(randomIndex,1)[0];
              P[0].hand.push(stolenCard);
              L.push(`你从 ${P[huntTi].name} 的手牌中暗抽了一张 ${cardLogText(stolenCard)}！`);
            }
            Disc.push(...P[huntTi].hand);
            P[huntTi].hand=[];
          }
        }
        if(P[huntTi].godZone?.length){Disc.push(...P[huntTi].godZone);P[huntTi].godZone=[];P[huntTi].godName=null;P[huntTi].godLevel=0;}
      }
      const win=checkWin(P,gs._isMP);
      // 追猎者在追捕后设置skillUsed为true，这样就不能再休息了
      // 但追猎者仍然可以在同一回合内多次使用追捕技能
      const newGs={...gs,players:P,deck:D,discard:Disc,log:L,abilityData:{},phase:'ACTION',skillUsed:true,...(win?{gameOver:win}:{})};
      const queue=buildAnimQueue(gs,newGs);
      if(queue.length) triggerAnimQueue(queue,newGs); else setGs(newGs);
    }else{
      const newAbandoned=[...(gs.huntAbandoned||[]),huntTi];
      L.push(`放弃追捕 ${P[huntTi].name}`);
      // 放弃追捕时揭晓追猎者身份
      if(!P[0].roleRevealed){
        P[0].roleRevealed=true;
        L.push(`${P[0].name} 的身份揭晓：追猎者`);
      }
      // 追猎者在放弃追捕后设置skillUsed为true，这样就不能再休息了
      // 但追猎者仍然可以在同一回合内多次使用追捕技能
      setGs({...gs,players:P,log:L,phase:'ACTION',huntAbandoned:newAbandoned,skillUsed:true,
        abilityData:{...gs.abilityData,huntTi:undefined,revCard:undefined}});
    }
  }

  function huntSelectCardFromPublic(cardIdx){
    const{huntTi,maxToTake}=gs.abilityData;
    let P=copyPlayers(gs.players),Disc=[...gs.discard],L=[...gs.log];
    if(huntTi==null||!P[huntTi]||cardIdx<0||cardIdx>=P[huntTi].hand.length)return;
    const stolenCard=P[huntTi].hand.splice(cardIdx,1)[0];
    P[0].hand.push(stolenCard);
    L.push(`你从 ${P[huntTi].name} 的公开手牌中选择了 ${cardLogText(stolenCard)}！`);
    // 检查是否已经选择了足够的手牌
    const selectedCount=P[0].hand.length-gs.players[0].hand.length;
    if(selectedCount<maxToTake && P[huntTi].hand.length>0){
      // 继续选择手牌
      setGs({...gs,players:P,phase:'HUNT_SELECT_CARD_FROM_PUBLIC',abilityData:{huntTi:huntTi,preSkillRevealed:gs.abilityData?.preSkillRevealed,maxToTake:maxToTake},
        log:L});
      return;
    }else{
      // 已经选择了足够的手牌，处理剩余的手牌
      Disc.push(...P[huntTi].hand);
      P[huntTi].hand=[];
      if(P[huntTi].godZone?.length){Disc.push(...P[huntTi].godZone);P[huntTi].godZone=[];P[huntTi].godName=null;P[huntTi].godLevel=0;}
      const win=checkWin(P,gs._isMP);
      const newGs={...gs,players:P,discard:Disc,log:L,abilityData:{},phase:'ACTION',...(win?{gameOver:win}:{})};
      const queue=buildAnimQueue(gs,newGs);
      if(queue.length) triggerAnimQueue(queue,newGs); else setGs(newGs);
    }
  }

  // 多人游戏：被追捕的真人玩家选择亮出一张手牌
  function humanRevealForMPHunt(cardIdx){
    const card=me.hand[cardIdx];
    if(!card)return;
    // huntTi = 被追捕者在当前视角下的 index（非0）
    // 被追捕者将选择结果推送回规范 gs 并广播：
    // 设置 revCard，切换到 HUNT_CONFIRM 让追猎者（currentTurn=0 视角）完成后续
    const P=copyPlayers(gs.players);
    const L=[...gs.log,`${me.name} 亮出 ${cardLogText(card,{alwaysShowName:true})}`];
    const newGs={...gs,players:P,log:L,phase:'HUNT_CONFIRM',
      abilityData:{...gs.abilityData,revCard:card}};
    setGs(newGs);
    // gs sync useEffect 将广播给追猎者
  }

  // Called when player picks their card to reveal during an AI hunt
  function playerRevealForHunt(cardIdx){
    const card=me.hand[cardIdx];
    if(!card)return;
    const{huntingAI,aiHunterName}=gs.abilityData;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard],L=[...gs.log];
    let discardedCard=null;
    const myHandBefore=[...(P[0]?.hand||[])];
    const myRevealBefore=!!P[0]?.revealHand;
    L.push(`你亮出 ${cardLogText(card,{alwaysShowName:true})}`);
    const aiHand=P[huntingAI].hand;
    const mi=aiHand.findIndex(c=>cardsHuntMatch(c,card));
    if(mi>=0){
      discardedCard=aiHand.splice(mi,1)[0];Disc.push(discardedCard);
      const huntDamage=3+(P[huntingAI].damageBonus||0);
      applyHpDamageWithLink(P,0,huntDamage,Disc,L,gs.currentTurn,D);
      L.push(`${aiHunterName} 弃 ${cardLogText(discardedCard,{alwaysShowName:true})}，你受 ${huntDamage}HP 伤害！`);
      if(P[0].hp<=0){
        if(myHandBefore.length){
          Disc=removeCardsFromDiscard(Disc,myHandBefore);
          P[0].hand=[...myHandBefore];
          const maxToTake=3;
          if(myRevealBefore){
            const chosenCards=aiChooseHunterLootCards(P[0].hand,P[huntingAI].hand,maxToTake);
            chosenCards.forEach(stolenCard=>{
              const idx=P[0].hand.findIndex(c=>c.id===stolenCard.id);
              if(idx>=0){
                P[0].hand.splice(idx,1);
                P[huntingAI].hand.push(stolenCard);
                L.push(`${aiHunterName} 从你的公开手牌中选择了 ${cardLogText(stolenCard)}！`);
              }
            });
            Disc.push(...P[0].hand);
            P[0].hand=[];
          }else{
            const cardsToTake=Math.min(maxToTake,P[0].hand.length);
            for(let i=0;i<cardsToTake;i++){
              const randomIndex=Math.floor(Math.random()*P[0].hand.length);
              const stolenCard=P[0].hand.splice(randomIndex,1)[0];
              P[huntingAI].hand.push(stolenCard);
              L.push(`${aiHunterName} 从你的手牌中暗抽了一张！`);
            }
            Disc.push(...P[0].hand);
            P[0].hand=[];
          }
        }
        if(P[0].godZone?.length){Disc.push(...P[0].godZone);P[0].godZone=[];P[0].godName=null;P[0].godLevel=0;}
      }
    }else{
      L.push(`${aiHunterName} 无匹配手牌，追捕失败`);
    }
    const win=checkWin(P,gs._isMP);
    const newAbandoned = gs.huntAbandoned || []; // AI 在发起追捕时已经把你标记过Abandoned了
    const wantsToHuntAgain = shouldHunterKeepChasing(P,huntingAI,newAbandoned);

    const baseGs={...gs,players:P,deck:D,discard:Disc,log:L,abilityData:{},phase:'ACTION', huntAbandoned: newAbandoned};

    let newGs;
    if (win) newGs = {...baseGs, gameOver:win};
    // 决定是让 AI 重新进入 AI_TURN 继续追杀，还是结束该回合
      else if (wantsToHuntAgain) newGs = withClearedTurnAnimFields({...baseGs, phase: 'AI_TURN', currentTurn: huntingAI, skillUsed: false, restUsed: false, _drawnCard: null, _aiDrawnCard: null, _discardedDrawnCard:false, _aiName: aiHunterName});
    else{
      const aiHandLimit=P[huntingAI]._nyaHandLimit??4;
      while(P[huntingAI].hand.length>aiHandLimit){
        const c=P[huntingAI].hand.shift();
        Disc.push(c);
        L.push(`${aiHunterName} 弃 ${cardLogText(c,{alwaysShowName:true})}（上限）`);
      }
      newGs = startNextTurn({...baseGs, players:P, discard:Disc, log:L, currentTurn: huntingAI, skillUsed: true});
    }

    const queue=[];
    if(discardedCard){
      queue.push({type:'DISCARD',card:discardedCard,triggerName:aiHunterName||'???',targetPid:huntingAI});
    }
    const animQueue=buildAnimQueue(gs,newGs).filter(step=>!(discardedCard&&step.type==='CARD_TRANSFER'&&step.fromPid===huntingAI&&step.dest==='discard'));
    queue.push(...animQueue);
    const playerNeedsQueuedTurnIntro=
      !win &&
      !wantsToHuntAgain &&
      newGs.currentTurn===0 &&
      (
        !!newGs.drawReveal?.card ||
        (newGs.phase==='GOD_CHOICE'&&!!newGs.abilityData?.godCard) ||
        false
      );
    if(playerNeedsQueuedTurnIntro){
      triggerAnimQueue(queue,null,()=>applyNextTurnGs(newGs));
    }else{
      triggerAnimQueue(queue,newGs);
    }
  }

  function bewitchSelectCard(idx){
    const card=me.hand[idx];
    setGs({...gs,phase:'BEWITCH_SELECT_TARGET',abilityData:{bewitchCard:card,bewitchIdx:idx}});
  }
  function tortoiseOracleSelect(key){    
    const {type, playerIndex, revealedCards, selectableKeys}=gs.abilityData;
    if(type!=='tortoiseOracleSelect'||!selectableKeys.includes(key))return;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard];
    const isZoneMatchKey=(card,keyToMatch)=>{
      if(!isZoneCard(card))return false;
      return /^[A-Z]$/.test(keyToMatch)?card.letter===keyToMatch:/^\d$/.test(keyToMatch)?String(card.number)===String(keyToMatch):false;
    };
    // 将4张牌中该编号的牌收入手牌
    const matchedCards=revealedCards.filter(c=>isZoneMatchKey(c,key));
    const L=[...gs.log,`你选择了编号 ${key}`];
    if(matchedCards.length>0){
      P[playerIndex].hand.push(...matchedCards);
      L.push(`你收入了 ${matchedCards.length} 张编号为 ${key} 的牌`);
      // 剩余的牌放入弃牌堆
      const remainingCards=revealedCards.filter(c=>!isZoneMatchKey(c,key));
      if(remainingCards.length>0){
        Disc.push(...remainingCards);
      }
    }else{
      L.push(`展示的牌中没有编号为 ${key} 的牌`);
      Disc.push(...revealedCards);
    }
    const win=checkWin(P,gs._isMP);
    if(win){setGs({...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win,phase:'ACTION',abilityData:{}});return;}
    const newGs={...gs,players:P,deck:D,discard:Disc,log:L,phase:'ACTION',abilityData:{}};
    const queue=bindAnimLogChunks(buildAnimQueue(gs,newGs),splitAnimBoundLogs(L.slice(gs.log.length)));
    if(queue.length){
      pendingGsRef.current=newGs;
      animQueueRef.current=[...queue.slice(1)];
      setGs(p=>p?{...p,phase:'ACTION',abilityData:{}}:p);
      setAnim(queue[0]);
    }else setGs(newGs);
  }

  function sameAbyssSelect(choice){
    const{targetIdx,actorHandCount,discardCount}=gs.abilityData||{};
    if(gs.phase!=='SAME_ABYSS_SELECT'||!isLocalSameAbyssTargetPhase(gs))return;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard];
    const L=[...gs.log];
    const target=P[targetIdx];
    if(!target)return;
    if(choice==='discard'&&discardCount>0){
      for(let d=0;d<discardCount;d++){
        if(target.hand.length>actorHandCount){
          const c=target.hand.shift();
          if(isBlackGoatYoung(c)){
            L.push(`${target.name} 的黑山羊幼仔被销毁`);
          }else if(c.type!=='blankZone'){
            Disc.push(c);
          }
        }
      }
      L.push(`【同归深渊】${target.name} 选择弃置手牌至 ${actorHandCount} 张`);
    }else{
      L.push(`【同归深渊】${target.name} 选择承受伤害，失去 4 HP`);
      const localMsgs=[];
      applyHpDamageWithLink(P,targetIdx,4,Disc,localMsgs,gs.currentTurn,D);
      if(localMsgs.length)L.push(...localMsgs);
    }
    const win=checkWin(P,gs._isMP);
    if(win){setGs({...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win,phase:'ACTION',abilityData:{}});return;}
    const nextTurn=gs.abilityData?._turnOwner??gs.currentTurn;
    const resumesAiTurn=isAiSeat(gs,nextTurn)&&!P[nextTurn]?.isDead;
    const nextPhase=resumesAiTurn?'AI_TURN':'ACTION';
    const newGs={...gs,players:P,deck:D,discard:Disc,log:L,phase:nextPhase,currentTurn:nextTurn,abilityData:{}};
    const queue=bindAnimLogChunks(buildAnimQueue(gs,newGs),splitAnimBoundLogs(L.slice(gs.log.length)));
    if(queue.length){
      pendingGsRef.current=newGs;
      animQueueRef.current=[...queue.slice(1)];
      setGs(p=>p?{...p,phase:nextPhase,abilityData:{}}:p);
      setAnim(queue[0]);
    }else setGs(newGs);
  }

  function sphinxGuess(guessYes){
    if(gs.phase!=='SPHINX_GUESS'||!isLocalSphinxGuessPhase(gs))return;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard];
    const L=[...gs.log];
    const topCard=D[0];
    const isZone=isZoneCard(topCard);
    const actualCard=D.shift();
    L.push(`你猜测牌堆顶的牌${guessYes?'是':'不是'}区域牌`);
    const guessCorrect=(guessYes&&isZone)||(!guessYes&&!isZone);
    if(guessCorrect){
      L.push(`猜测正确！你收入了 ${cardLogText(actualCard)}`);
      P[gs.currentTurn].hand.push(actualCard);
    }else{
      L.push(`猜测错误！你失去 3 HP`);
      const localMsgs=[];
      applyHpDamageWithLink(P,gs.currentTurn,3,Disc,localMsgs,gs.currentTurn,D);
      if(localMsgs.length)L.push(...localMsgs);
      Disc.push(actualCard);
    }
    const win=checkWin(P,gs._isMP);
    if(win){setGs({...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win,phase:'ACTION',abilityData:{}});return;}
    const nextTurn=gs.abilityData?._turnOwner??gs.currentTurn;
    const resumesAiTurn=isAiSeat(gs,nextTurn)&&!P[nextTurn]?.isDead;
    const nextPhase=resumesAiTurn?'AI_TURN':'ACTION';
    const newGs={...gs,players:P,deck:D,discard:Disc,log:L,phase:nextPhase,currentTurn:nextTurn,abilityData:{}};
    const logDelta=L.slice(gs.log.length);
    const revealStep={type:'DRAW_CARD',card:actualCard,triggerName:'斯芬克斯',targetPid:gs.currentTurn,skipTravel:true,msgs:[logDelta[0]]};
    let queue=[revealStep];
    if(guessCorrect){
      const gainMsg=logDelta.find(m=>m.includes('猜测正确'));
      queue.push({type:'CARD_TRANSFER',fromPid:-1,dest:'player',toPid:gs.currentTurn,count:1,msgs:gainMsg?[gainMsg]:[]});
    }else{
      const resultQueue=bindAnimLogChunks(buildAnimQueue(gs,newGs),splitAnimBoundLogs(logDelta));
      queue.push(...resultQueue);
    }
    if(queue.length){
      pendingGsRef.current=newGs;
      animQueueRef.current=[...queue.slice(1)];
      setGs(p=>p?{...p,phase:nextPhase,abilityData:{}}:p);
      setAnim(queue[0]);
    }else setGs(newGs);
  }

  function bewitchSelectTarget(ti){
    const{bewitchCard,bewitchIdx}=gs.abilityData;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard];
    let inspectionMeta=makeInspectionMeta(gs);
    P[0].roleRevealed=true;P[0].hand.splice(bewitchIdx,1);
    const L=[...gs.log,`你对 ${P[ti].name} 【蛊惑】，赠予 ${cardLogText(bewitchCard,{alwaysShowName:true})}`];
    // God card gifted via bewitch: forced convert if different god, then AI resolves for target
    if(bewitchCard.isGod){
      P[ti].godEncounters=(P[ti].godEncounters||0)+1;
      const cost=P[ti].godEncounters;
      // 邪祀者遭遇邪神时不扣减SAN且强制亮明身份
      let effectMsg = '';
      if (P[ti].role === '邪祀者') {
        P[ti].roleRevealed = true;
        effectMsg = `${P[ti].name}（邪祀者）遭遇邪神 ${bewitchCard.name}（第${P[ti].godEncounters}次），免疫SAN损耗`;
        if (!P[ti].roleRevealed) {
          effectMsg += '，身份揭晓：邪祀者';
        }
      } else {
        P[ti].san=clamp(P[ti].san-cost);const newSan=P[ti].san;{const processed=applyInspectionForSanLoss(ti,newSan,gs.currentTurn,P,D,Disc,L,inspectionMeta);P=processed.P;D=processed.D;Disc=processed.Disc;inspectionMeta=processed.inspectionMeta;L.splice(0,L.length,...processed.log);}
        effectMsg = `${P[ti].name} 遭遇邪神 ${bewitchCard.name}（第${P[ti].godEncounters}次），失去${cost}SAN`;
      }
      L.push(effectMsg);
      const forcedConvert=!!(P[ti].godName&&P[ti].godName!==bewitchCard.godKey);
      const godResolveGs={...gs,players:P,deck:D,discard:Disc,log:L,...inspectionMeta};
      const gres=resolveGodEncounterForAI(ti,bewitchCard,P,D,Disc,godResolveGs,forcedConvert);
      P=gres.P;D=gres.D;Disc=gres.Disc;L.push(...gres.msgs);
      const win=checkWin(P,gs._isMP);
      const newGs={...gs,players:P,deck:D,discard:Disc,log:L,abilityData:{},phase:'ACTION',skillUsed:true,...inspectionMeta,...(gres.inspectionMeta||{}),...(win?{gameOver:win}:{})};
      const statQueue=buildAnimQueue(gs,newGs);
      const bewitchMsgs=extractSkillLogs(L.slice(gs.log.length),'bewitch');
      triggerAnimQueue(buildBewitchForcedCardQueue(0,ti,bewitchCard,P[ti]?.name,statQueue,bewitchMsgs),newGs);
      return;
    }
    const res=applyFx(bewitchCard,ti,bewitchCard.type==='swapAllHands'?null:ti,P,D,Disc,gs);L.push(...res.msgs);
    res.P[ti].hand.push(bewitchCard);
    const win=checkWin(res.P,gs._isMP);
    const phaseAbilityData={
      ...(bewitchCard.type==='swapAllHands'?{
        zoneSwapCard:bewitchCard,
        zoneSwapSource:ti,
      }:{}),
      ...(res.statePatch?.peekHandTargets?{
        peekHandTargets:res.statePatch.peekHandTargets,
        peekHandSource:res.statePatch.peekHandSource,
      }:{}),
      ...(res.statePatch?.caveDuelTargets?{
        caveDuelTargets:res.statePatch.caveDuelTargets,
        caveDuelSource:res.statePatch.caveDuelSource,
      }:{}),
      ...(res.statePatch?.damageLinkTargets?{
        damageLinkTargets:res.statePatch.damageLinkTargets,
        damageLinkSource:res.statePatch.damageLinkSource,
      }:{}),
      ...(res.statePatch?.roseThornTargets?{
        roseThornTargets:res.statePatch.roseThornTargets,
        roseThornSource:res.statePatch.roseThornSource,
      }:{}),
      ...(res.statePatch?.abilityData?.type==='firstComePick'?{
        ...res.statePatch.abilityData,
        _turnOwner:gs.currentTurn,
      }:{}),
    };
    const nextPhase=
      bewitchCard.type==='swapAllHands'?'ZONE_SWAP_SELECT_TARGET':
      res.statePatch?.peekHandTargets?'PEEK_HAND_SELECT_TARGET':
      res.statePatch?.caveDuelTargets?'CAVE_DUEL_SELECT_TARGET':
      res.statePatch?.damageLinkTargets?'DAMAGE_LINK_SELECT_TARGET':
      res.statePatch?.roseThornTargets?'ROSE_THORN_SELECT_TARGET':
      res.statePatch?.abilityData?.type==='firstComePick'?'FIRST_COME_PICK_SELECT':
      'ACTION';
    const newGs={...gs,players:res.P,deck:res.D,discard:res.Disc,log:L,
      abilityData:phaseAbilityData,
      phase:nextPhase,
      skillUsed:true,...(res.statePatch||{}),...(win?{gameOver:win}:{})};
      const statQueue=buildAnimQueue(gs,newGs);
      const bewitchTurnIntroName=isAiSeat(gs,ti)&&(
        zoneCardUsesTargetInteraction(bewitchCard)||
        bewitchCard?.type==='selfDamageHPPeek'||
        bewitchCard?.type==='firstComePick'
      )?res.P[ti]?.name:null;
      triggerAnimQueue(
      buildBewitchForcedCardQueue(0,ti,bewitchCard,res.P[ti]?.name,statQueue,extractSkillLogs(L.slice(gs.log.length),'bewitch'),bewitchTurnIntroName),
      newGs
    );
  }

  // ── God choice handlers ────────────────────────────────────
  function godResolvePlayer(action){
    // action: 'worship'|'upgrade'|'keepHand'|'discard'|'forcedConvert'
    const godCard=gs.abilityData?.godCard;if(!godCard)return;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard],L=[...gs.log];
    let inspectionMeta=makeInspectionMeta(gs);
    const isDiscardAction=action!=='keepHand'&&action!=='worship'&&action!=='upgrade'&&action!=='forcedConvert';
    const gk=godCard.godKey;
    const alreadyWorship=P[0].godName===gk;
    // SAN deduction and inspections are now handled upfront in handleCardDraw
    
    if(action==='keepHand'){
      P[0].hand.push({...godCard});
      L.push('你（邪祀者）将邪神牌秘密收入手牌');
    } else if(action==='worship'||action==='upgrade'||action==='forcedConvert'){
      if(action==='forcedConvert'||(P[0].godName&&P[0].godName!==gk)){
        const converted=convertGodFollower(0,gs.currentTurn,P,D,Disc,L,inspectionMeta,'改信新神，失去1SAN，旧神牌入弃牌堆');
        P=converted.P;D=converted.D;Disc=converted.Disc;L=converted.L;inspectionMeta=converted.inspectionMeta;
      }
      if(alreadyWorship&&action==='upgrade'){
        P[0].godLevel=Math.min(3,(P[0].godLevel||0)+1);
        P[0].godZone.push({...godCard});
        L.push(`邪神之力升至Lv.${P[0].godLevel}`);
      } else {
        P[0].godName=gk;P[0].godLevel=1;P[0].godZone=[{...godCard}];
        L.push(`你信仰了 ${godCard.name}，获得${godCard.power}(Lv.1)`);
      }
      // Kick out anyone else worshipping same god
      P.forEach((p,i)=>{if(i>0&&p.godName===gk){const abandoned=abandonGodFollower(i,gs.currentTurn,P,D,Disc,L,inspectionMeta);P=abandoned.P;D=abandoned.D;Disc=abandoned.Disc;L=abandoned.L;inspectionMeta=abandoned.inspectionMeta;}});
    } else {
      Disc.push({...godCard});L.push('你放弃了邪神的馈赠');
    }
    // Only worship/forcedConvert consume the worship-this-turn slot.
    // Upgrade, discard, and keepHand do not.
    const consumesSlot=action==='worship'||action==='forcedConvert';
    // SHU: 进入目标选择阶段而非直接给牌
    const isShuBlessing=(action==='worship'||action==='upgrade'||action==='forcedConvert')&&gk==='SHU';
    const shuOffspringCount=isShuBlessing?(GOD_DEFS.SHU.levels[P[0].godLevel-1]?.offspringCount||0):0;
    // 保留abilityData中的cthDrawsRemaining信息
    const newGs={...gs,players:P,discard:Disc,log:L,phase:isShuBlessing?'SHU_SELECT_TARGET':'ACTION',abilityData:isShuBlessing?{...gs.abilityData,shuOffspringCount}:gs.abilityData,
      godTriggeredThisTurn:consumesSlot,...inspectionMeta};
    if(isDiscardAction){
      const discardLog=L[L.length-1];
      const queue=[{type:'DISCARD',card:godCard,triggerName:'你',targetPid:0,msgs:[discardLog]}];
      triggerAnimQueue(queue,newGs,()=>{
        const win=checkWin(newGs.players,newGs._isMP);
        if(win){
          setGs({...newGs,gameOver:win});
        }else if(gs.abilityData?.fromRest){
          _cthContinueRestDraws(newGs);
        }else{
          setGs(newGs);
        }
      });
      return;
    }
    const inspectionEvents=(newGs._inspectionEvents||[]).filter(ev=>ev?.seq>(gs._inspectionSeq||0));
    // 构建动画队列并执行，在动画完成后检查游戏是否结束
    let queue;
    if(inspectionEvents.length){
      lastInspectionSeqRef.current=Math.max(lastInspectionSeqRef.current,...inspectionEvents.map(ev=>ev.seq||0));
      const inspectionFlow=buildInspectionEventFlow(gs,inspectionEvents,{buildAnimQueue,copyPlayers});
      const tailQueue=buildAnimQueue(
        {players:inspectionFlow.players,log:inspectionFlow.log},
        {players:newGs.players,log:newGs.log}
      );
      queue=[...inspectionFlow.queue,...tailQueue];
    }else{
      queue=bindAnimLogChunks(buildAnimQueue(gs,newGs),splitAnimBoundLogs(L.slice(gs.log.length)));
    }
    if(queue.length){
      triggerAnimQueue(queue,newGs,()=>{
        const win=checkWin(newGs.players,newGs._isMP);
        if(win){
          setGs({...newGs,gameOver:win});
        }else if(gs.abilityData?.fromRest){
          _cthContinueRestDraws(newGs);
        }else{
          setGs(newGs);
        }
      });
    }else{
      const win=checkWin(P,gs._isMP);
      const finalGs={...newGs,...(win?{gameOver:win}:{})};
      if(!win&&gs.abilityData?.fromRest){_cthContinueRestDraws(finalGs);return;}
      setGs(finalGs);
    }
  }

  // NYA borrow handlers
  function nyaBorrow(deadPlayer){
    const P=copyPlayers(gs.players);
    const lv=P[0].godLevel||1;
    const penalty=GOD_DEFS.NYA.levels[Math.max(0,lv-1)].handPenalty;
    P[0]={...P[0],_nyaBorrow:deadPlayer.role,_nyaHandLimit:4-penalty};
    const borrowerName=gs._isMP?P[0].name:'你';
    const L=[...gs.log,`${borrowerName} 借用 ${deadPlayer.name} 的身份「${deadPlayer.role}」（本回合）`];
    // Now do the draw
    let D=[...gs.deck],Disc=[...gs.discard];
    const res=playerDrawCard(P,D,Disc,0,gs);
    if(res.needGodChoice){
      setGs({...gs,players:res.P,deck:res.D,discard:res.Disc,log:[...L,...res.effectMsgs],phase:'GOD_CHOICE',abilityData:{godCard:res.drawnCard,drawerIdx:0,godEncounterCost:res.godEncounterCost},drawReveal:null,selectedCard:null,currentTurn:0,skillUsed:false,restUsed:false});
      return;
    }
    const win=checkWin(res.P,gs._isMP);if(win){setGs({...gs,players:res.P,deck:res.D,discard:res.Disc,log:L,gameOver:win});return;}
    // 强制触发牌已经直接处理，不需要进入DRAW_REVEAL阶段
    if(res.needsDecision){
      setGs({...gs,players:res.P,deck:res.D,discard:res.Disc,log:[...L,...res.effectMsgs],phase:'DRAW_REVEAL',drawReveal:{card:res.drawnCard,msgs:res.effectMsgs,needsDecision:!!res.needsDecision,forcedKeep:!!res.forcedKeep,drawerIdx:0,drawerName:res.P[0].name},selectedCard:null,abilityData:{},currentTurn:0,skillUsed:false,restUsed:false});
    }else{
      // 强制触发牌已经直接处理，直接进入ACTION阶段
      setGs({...gs,players:res.P,deck:res.D,discard:res.Disc,log:[...L,...res.effectMsgs],phase:'ACTION',drawReveal:null,selectedCard:null,abilityData:{},currentTurn:0,skillUsed:false,restUsed:false});
    }
  }

  function nyaSkip(){
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard];
    const res=playerDrawCard(P,D,Disc,0,gs);
    if(res.needGodChoice){setGs({...gs,players:res.P,deck:res.D,discard:res.Disc,log:[...gs.log,...res.effectMsgs],phase:'GOD_CHOICE',abilityData:{godCard:res.drawnCard,drawerIdx:0,godEncounterCost:res.godEncounterCost},drawReveal:null,selectedCard:null,currentTurn:0,skillUsed:false,restUsed:false});return;}
    const win=checkWin(res.P,gs._isMP);if(win){setGs({...gs,players:res.P,deck:res.D,discard:res.Disc,log:gs.log,gameOver:win});return;}
    // 强制触发牌已经直接处理，不需要进入DRAW_REVEAL阶段
    if(res.needsDecision){
      setGs({...gs,players:res.P,deck:res.D,discard:res.Disc,log:[...gs.log,...res.effectMsgs],phase:'DRAW_REVEAL',drawReveal:{card:res.drawnCard,msgs:res.effectMsgs,needsDecision:!!res.needsDecision,forcedKeep:!!res.forcedKeep,drawerIdx:0,drawerName:res.P[0].name},selectedCard:null,abilityData:{},currentTurn:0,skillUsed:false,restUsed:false});
    }else{
      // 强制触发牌已经直接处理，直接进入ACTION阶段
      setGs({...gs,players:res.P,deck:res.D,discard:res.Disc,log:[...gs.log,...res.effectMsgs],phase:'ACTION',drawReveal:null,selectedCard:null,abilityData:{},currentTurn:0,skillUsed:false,restUsed:false});
    }
  }

  // Multi-select discard
  function toggleDiscardSelect(idx){
    const prev=gs.abilityData.discardSelected||[];
    const maxSelect=me.hand.length-effectiveHandLimit;
    if(prev.includes(idx))setGs({...gs,abilityData:{...gs.abilityData,discardSelected:prev.filter(i=>i!==idx)}});
    else if(prev.length<maxSelect)setGs({...gs,abilityData:{...gs.abilityData,discardSelected:[...prev,idx]}});
  }
  function confirmDiscard(){
    // 使用最新的 gs 快照（避免 React 批量更新导致闭包读到旧的 discardSelected）
    const latestGs=latestGsRef.current;
    const selected=(latestGs||gs).abilityData?.discardSelected||[];
    if(!selected.length)return;
    const baseGs=latestGs||gs;
    let P=copyPlayers(baseGs.players);
    const sorted=[...selected].sort((a,b)=>b-a);const discarded=[];
    sorted.forEach(i=>{const c=P[0].hand.splice(i,1)[0];discarded.push(c);});
    // 黑山羊幼仔弃置时销毁
    const { kept: keptDisc, destroyed: destroyedDisc } = (()=>{
      const k=[],d=[];
      for(const c of discarded) if(isBlackGoatYoung(c)) d.push(c); else k.push(c);
      return { kept:k, destroyed:d };
    })();
    let D=[...baseGs.deck],Disc=[...baseGs.discard,...keptDisc];
    let L=[...baseGs.log];
    if(keptDisc.length) L.push(`弃置：${keptDisc.map(c=>cardLogText(c,{alwaysShowName:true})).join(' ')}`);
    if(destroyedDisc.length) L.push(`黑山羊幼仔 ×${destroyedDisc.length} 被销毁`);
    // CTH power: draw when ending turn while face-down
    if(P[0].isResting&&P[0].godName==='CTH'&&P[0].godLevel>=1){
      const extraDraws=P[0].godLevel;
      L.push(`你（克苏鲁信徒Lv.${P[0].godLevel}）梦访拉莱耶，翻面结束回合时额外摸${extraDraws}张牌`);
        for(let _d=0;_d<extraDraws;_d++){
          const r2=playerDrawCard(P,D,Disc,0,baseGs);P=r2.P;D=r2.D;Disc=r2.Disc;
          if(r2.drawnCard)L.push(`  摸到 ${cardLogText(r2.drawnCard,{alwaysShowName:true})}`);
          if(r2.needGodChoice){
          setGs(buildLocalCthDecisionState(baseGs,{
            players:P,deck:D,discard:Disc,log:L,drawnCard:r2.drawnCard,remainingDraws:extraDraws-_d-1,needGodChoice:true,
            extraState:{skillUsed:false,restUsed:false,huntAbandoned:[],godFromHandUsed:false,godTriggeredThisTurn:true},
          }));
          return;
        }
        if(r2.needsDecision){
          const split=splitAnimBoundLogs(r2.effectMsgs||[]);
          setGs(buildLocalCthDecisionState(baseGs,{
            players:P,deck:D,discard:Disc,log:L,drawnCard:r2.drawnCard,remainingDraws:extraDraws-_d-1,
            preStatLogs:split.preStat,statLogs:split.stat,
            extraState:{skillUsed:false,restUsed:false,huntAbandoned:[],godFromHandUsed:false,godTriggeredThisTurn:false},
          }));
          return;
        }
      }
    }
    const newGs=startNextTurn({...baseGs,players:P,deck:D,discard:Disc,log:L,currentTurn:0,abilityData:{}});
    const queue=buildPlayerTurnDrawQueue(gs,newGs,[{type:'DISCARD',msgs:L.slice(-discarded.length-1)}]);
    triggerAnimQueue(queue,newGs);
  }

  function doRest(){
    if(phase!=='ACTION'||isBlocked||gs.restUsed||gs.skillUsed||gs.players?.[0]?.disableRest)return;
    const d1=1+(Math.random()*6|0), d2=1+(Math.random()*6|0);
    const heal=Math.max(d1,d2);
    let P=copyPlayers(gs.players);
    P[0].hp=clamp(P[0].hp+heal);
    // Toggle resting state: if already resting, wake up; otherwise, go to rest
    const wasResting=P[0].isResting;
    P[0].isResting=!P[0].isResting;
    let L=[...gs.log,`你选择【休息】，掷骰 ${d1}+${d2}，回复 ${heal}HP，${wasResting?'翻回正常状态':'翻面休息中'}`];
    const win=checkWin(P,gs._isMP);
    if(win){setGs({...gs,players:P,log:L,gameOver:win});return;}
    
    const oldGs={...gs,players:copyPlayers(gs.players)};
    const newGs={...gs,players:P,log:L,restUsed:true,skillUsed:true};
    
    // 如果手牌超限，先进入弃牌阶段，弃牌后再触发拉莱耶之主摸牌
    if(P[0].hand.length>effectiveHandLimit){
      const pendingGs={...newGs,phase:'DISCARD_PHASE',abilityData:{discardSelected:[]}};
      const statQueue=buildAnimQueue(oldGs,{...newGs,players:P});
      const queue=[{type:'DICE_ROLL',d1,d2,heal,rollerName:'你'},...statQueue];
      triggerAnimQueue(queue,pendingGs);
      return;
    }
    
    let D=[...gs.deck],Disc=[...gs.discard];
    const finalGs={...gs,players:P,deck:D,discard:Disc,log:L,restUsed:true,skillUsed:true};
    // 处理拉莱耶之主的摸牌效果：在点击休息的当回合，回合结束阶段也要摸牌
    if(P[0].isResting&&P[0].godName==='CTH'&&P[0].godLevel>=1){
      const extraDraws=P[0].godLevel;
      L.push(`你（克苏鲁信徒Lv.${P[0].godLevel}）梦访拉莱耶，翻面结束回合时额外摸${extraDraws}张牌`);
      
      // 先播放骰子动画，然后处理摸牌
      const statQueue=buildAnimQueue(oldGs,{...finalGs,players:P});
      const queue=[{type:'DICE_ROLL',d1,d2,heal,rollerName:'你'},...statQueue];
      
      // 动画完成后处理摸牌
      const handleDraws=()=>{
        let D=[...gs.deck],Disc=[...gs.discard],P=copyPlayers(gs.players);
        P[0].hp=clamp(P[0].hp+heal);
        P[0].isResting=!oldGs.players[0].isResting;
        let L=[...oldGs.log,`你选择【休息】，掷骰 ${d1}+${d2}，回复 ${heal}HP，${oldGs.players[0].isResting?'翻回正常状态':'翻面休息中'}`];
        L.push(`你（克苏鲁信徒Lv.${P[0].godLevel}）梦访拉莱耶，翻面结束回合时额外摸${extraDraws}张牌`);
        const cthDraws=[];

        for(let _d=0;_d<extraDraws;_d++){
          const r2=playerDrawCard(P,D,Disc,0,oldGs);P=r2.P;D=r2.D;Disc=r2.Disc;
          if(r2.drawnCard){
            L.push(`  摸到 ${cardLogText(r2.drawnCard,{alwaysShowName:true})}`);
            cthDraws.push(r2.drawnCard);
          }
          if(r2.needGodChoice){
            setGs(buildLocalCthDecisionState(oldGs,{
              players:P,deck:D,discard:Disc,log:L,drawnCard:r2.drawnCard,remainingDraws:extraDraws-_d-1,needGodChoice:true,
              extraState:{skillUsed:true,restUsed:true,huntAbandoned:[],godFromHandUsed:false,godTriggeredThisTurn:true},
            }));
            return;
          }
          if(r2.needsDecision){
            const split=splitAnimBoundLogs(r2.effectMsgs||[]);
            setGs(buildLocalCthDecisionState(oldGs,{
              players:P,deck:D,discard:Disc,log:L,drawnCard:r2.drawnCard,remainingDraws:extraDraws-_d-1,
              preStatLogs:split.preStat,statLogs:split.stat,
              extraState:{skillUsed:true,restUsed:true,huntAbandoned:[],godFromHandUsed:false,godTriggeredThisTurn:false},
            }));
            return;
          }
          // forced card: already applied, continue
          if(r2.kept){
            if(r2.effectMsgs.length)L.push(...r2.effectMsgs);
            continue;
          }
        }

        const afterRest={...oldGs,players:P,deck:D,discard:Disc,log:L,restUsed:true,skillUsed:true,currentTurn:0};
        // 翻面状态下主动结束回合：需要弃牌
        const nextGs=P[0].hand.length>effectiveHandLimit
          ?{...afterRest,phase:'DISCARD_PHASE',abilityData:{discardSelected:[]}}
          :startNextTurn(afterRest);

        if(cthDraws.length>0){
          const queue=[];
          cthDraws.forEach(card=>{queue.push({type:'DRAW_CARD',card:card,triggerName:'你',targetPid:0});});
          const statQ=buildAnimQueue(gs,nextGs).filter(a=>a.type!=='CARD_TRANSFER');
          queue.push(...statQ);
          if(nextGs.currentTurn===0&&nextGs.drawReveal?.card){
            queue.push({type:'YOUR_TURN',msgs:nextGs._turnStartLogs},{type:'DRAW_CARD',card:nextGs.drawReveal.card,triggerName:'你',targetPid:0,msgs:nextGs._drawLogs});
          }
          triggerAnimQueue(queue,nextGs);
        }else{
          setGs(nextGs);
        }
      };
      
      triggerAnimQueue(queue,{...finalGs,currentTurn:0},handleDraws);
      return;
    }
    
    // 普通休息（非拉莱耶之主）
    // Dice roll anim first, then HP heal, then check hand limit before advancing
    const statQueue=buildAnimQueue(oldGs,{...finalGs,players:P});
    const queue=[{type:'DICE_ROLL',d1,d2,heal,rollerName:'你'},...statQueue];
    const afterRest={...finalGs,currentTurn:0};
    const pendingGs=startNextTurn(afterRest);
    triggerAnimQueue(queue,pendingGs);
  }

  // 多人游戏：当下一回合是他人时，为当前玩家播放翻牌动画（否则他们的本地 gs 更新无动画）
  function applyNextTurnGs(newGs){
    // Guard: never overwrite win/pending-win state
    if(newGs&&(newGs.phase==='PLAYER_WIN_PENDING'||newGs.phase==='TREASURE_WIN'))return setGs(p=>p?.gameOver||p?.phase==='PLAYER_WIN_PENDING'||p?.phase==='TREASURE_WIN'?p:newGs);
    // Animate CTH rest-draw forced cards that accumulated during startNextTurn
    if(newGs?._cthRestDraws?.length>0){
      const cthQueue=newGs._cthRestDraws.map(card=>({
        type:'DRAW_CARD',card,triggerName:'你',targetPid:0,
        msgs:newGs._cthRestDrawLogs?.filter(l=>l.includes(card.name)||l.includes(card.key))||[]
      }));
      const statQ=bindAnimLogChunks(
        buildAnimQueue({...gs,players:newGs._playersBeforeCthDraws||gs.players},newGs),
        {statLogs:newGs._cthRestDrawLogs||[]}
      );
      const cleanedGs={...newGs,_cthRestDraws:null,_cthRestDrawLogs:null,_playersBeforeCthDraws:null};
      triggerAnimQueue([...cthQueue,...statQ],cleanedGs);
      return;
    }
    const drawStatQ=newGs?bindAnimLogChunks(
      buildAnimQueue({...gs,players:newGs._playersBeforeThisDraw||gs.players},newGs),
      {statLogs:newGs._statLogs}
    ):[];
    if(
      newGs?.gameOver &&
      !newGs?._isMP &&
      newGs.currentTurn!==0 &&
      (
        (Array.isArray(newGs._turnStartLogs)&&newGs._turnStartLogs.length>0) ||
        !!newGs._drawnCard ||
        drawStatQ.length>0
      )
    ){
      const aiName=newGs.players[newGs.currentTurn]?.name||'???';
      const queue=[];
      if(newGs._playersBeforeThisDraw) queue.push({type:'YOUR_TURN',name:aiName,msgs:newGs._turnStartLogs});
      if(newGs._drawnCard) queue.push({type:'DRAW_CARD',card:newGs._drawnCard,triggerName:aiName,targetPid:newGs.currentTurn,msgs:newGs._drawLogs});
      if(drawStatQ.length) queue.push(...drawStatQ);
      if(queue.length){
        if(newGs._playersBeforeThisDraw&&newGs._drawnCard){
          visualPlayersLockRef.current=copyPlayers(newGs._playersBeforeThisDraw);
        }
        triggerAnimQueue(queue,newGs);
        return;
      }
    }
    if(newGs.currentTurn===0){
      const playerTurnStartMsgs=newGs._turnStartLogs||[];
      const playerDrawMsgs=newGs._drawLogs||[];
      if(newGs.drawReveal?.card){
        pendingGsRef.current=newGs;
        animQueueRef.current=[
          {type:'DRAW_CARD',card:newGs.drawReveal.card,triggerName:'你',targetPid:0,msgs:playerDrawMsgs},
                    ...drawStatQ
        ];
        setGs(prev=>prev?{...prev,phase:'ACTION',drawReveal:null,abilityData:{}}:prev);
        setAnim({type:'YOUR_TURN',msgs:playerTurnStartMsgs});
        return;
      }
        if(newGs.phase==='GOD_CHOICE'&&newGs.abilityData?.godCard){
          pendingGsRef.current=newGs;
          const inspectionEvents = (newGs._inspectionEvents||[]).filter(ev=>ev?.seq>lastInspectionSeqRef.current);
          let inspectionAndTailQueue = [];
          if(inspectionEvents.length) {
            lastInspectionSeqRef.current=Math.max(lastInspectionSeqRef.current,...inspectionEvents.map(ev=>ev.seq||0));
            const inspectionFlow = buildInspectionEventFlow({...gs, players: newGs._playersBeforeThisDraw||gs.players}, inspectionEvents, {buildAnimQueue, copyPlayers});
            const tailQueue = buildAnimQueue({players: inspectionFlow.players, log: inspectionFlow.log}, newGs);
            inspectionAndTailQueue = [...drawStatQ, ...inspectionFlow.queue, ...tailQueue];
          } else {
            inspectionAndTailQueue = drawStatQ;
          }
        animQueueRef.current=[
          {type:'DRAW_CARD',card:newGs.abilityData.godCard,triggerName:'你',targetPid:0,msgs:playerDrawMsgs},
                    ...inspectionAndTailQueue,
        ];
        setGs(prev=>prev?{...prev,phase:'ACTION',drawReveal:null,abilityData:{}}:prev);
        setAnim({type:'YOUR_TURN',msgs:playerTurnStartMsgs});
        return;
      }
      if(playerTurnStartMsgs.length&&newGs.phase==='ACTION'&&drawStatQ.length){
        pendingGsRef.current=newGs;
        animQueueRef.current=[...drawStatQ];
        setGs(prev=>prev?{...prev,phase:'ACTION',drawReveal:null,abilityData:{}}:prev);
        setAnim({type:'YOUR_TURN',msgs:playerTurnStartMsgs});
        return;
      }
    }
    if(['FIRST_COME_PICK_SELECT','DAMAGE_LINK_SELECT_TARGET','CAVE_DUEL_SELECT_TARGET','PEEK_HAND_SELECT_TARGET','ROSE_THORN_SELECT_TARGET','SAME_ABYSS_SELECT','SPHINX_GUESS'].includes(newGs.phase)&&newGs._drawnCard){
      const drawerName=newGs.players[newGs.currentTurn]?.name||'???';
      const drawerPid=newGs.currentTurn;
      pendingGsRef.current=newGs;
      animQueueRef.current=[...drawStatQ];
      if(newGs._playersBeforeThisDraw){
        visualPlayersLockRef.current=copyPlayers(newGs._playersBeforeThisDraw);
      }
      setGs(prev=>prev?{...prev,phase:'ACTION',drawReveal:null,abilityData:{}}:prev);
      setAnim({type:'DRAW_CARD',card:newGs._drawnCard,triggerName:drawerName,targetPid:drawerPid,msgs:newGs._drawLogs});
      return;
    }
    if(newGs._isMP&&newGs.currentTurn!==0){
      const ph=newGs.phase;
      const drawnCard=ph==='GOD_CHOICE'?newGs.abilityData?.godCard:newGs.drawReveal?.card;
      // Also handle forced-card path (phase:'ACTION' but drawReveal.card set for animation)
      if(drawnCard&&(ph==='DRAW_REVEAL'||ph==='GOD_CHOICE'||ph==='DRAW_SELECT_TARGET'||ph==='ACTION')){
        const drawerName=newGs.players[newGs.currentTurn]?.name||'???';
        const drawerPid=newGs.currentTurn;
        receivedGsRef.current=true;
        pendingGsRef.current=newGs;
        let inspectionAndTailQueue = [];
        if(ph==='GOD_CHOICE'){
          const inspectionEvents = (newGs._inspectionEvents||[]).filter(ev=>ev?.seq>(gs._inspectionSeq||0));
          if(inspectionEvents.length) {
            lastInspectionSeqRef.current=Math.max(lastInspectionSeqRef.current,...inspectionEvents.map(ev=>ev.seq||0));
            const inspectionFlow = buildInspectionEventFlow({...gs, players: newGs._playersBeforeThisDraw||gs.players}, inspectionEvents, {buildAnimQueue, copyPlayers});
            const tailQueue = buildAnimQueue({players: inspectionFlow.players, log: inspectionFlow.log}, newGs);
            inspectionAndTailQueue = [...drawStatQ, ...inspectionFlow.queue, ...tailQueue];
          } else {
            inspectionAndTailQueue = drawStatQ;
          }
        } else {
          inspectionAndTailQueue = drawStatQ;
        }
        animQueueRef.current=[...inspectionAndTailQueue];
        if(newGs._playersBeforeThisDraw){
          visualPlayersLockRef.current=copyPlayers(newGs._playersBeforeThisDraw);
        }
        setAnim({type:'DRAW_CARD',card:drawnCard,triggerName:drawerName,targetPid:drawerPid,msgs:newGs._drawLogs});
        return;
      }
    }
    // 处理强制触发牌的动画
    if(newGs.drawReveal?.card&&newGs.phase==='ACTION'){
      const drawerName=newGs.players[newGs.currentTurn]?.name||'???';
      const drawerPid=newGs.currentTurn;
      pendingGsRef.current=newGs;
      animQueueRef.current=[...drawStatQ];
      if(newGs._playersBeforeThisDraw){
        visualPlayersLockRef.current=copyPlayers(newGs._playersBeforeThisDraw);
      }
      setAnim({type:'DRAW_CARD',card:newGs.drawReveal.card,triggerName:drawerName,targetPid:drawerPid,msgs:newGs._drawLogs});
      return;
    }
    setGs(newGs);
  }

  function endTurn(){
    if(isBlocked)return;
    if(me.hand.length>effectiveHandLimit){
      // 需要弃牌时，不立即触发CTH效果，等待弃牌后再触发
      setGs({...gs,phase:'DISCARD_PHASE',abilityData:{discardSelected:[]}});
      return;
    }
    // 不需要弃牌时，直接触发CTH效果
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard],L=[...gs.log];
    const cthDraws=[];
    if(P[0].isResting&&P[0].godName==='CTH'&&P[0].godLevel>=1){
      const extraDraws=P[0].godLevel;
      L.push(`你（克苏鲁信徒Lv.${P[0].godLevel}）梦访拉莱耶，翻面结束回合时额外摸${extraDraws}张牌`);
      for(let _d=0;_d<extraDraws;_d++){
        const r2=playerDrawCard(P,D,Disc,0,gs);P=r2.P;D=r2.D;Disc=r2.Disc;
        if(r2.drawnCard){
          L.push(`  摸到 ${cardLogText(r2.drawnCard,{alwaysShowName:true})}`);
          cthDraws.push(r2.drawnCard);
        }
        if(r2.needGodChoice){
          const decisionState=buildLocalCthDecisionState(gs,{
            players:P,deck:D,discard:Disc,log:L,drawnCard:r2.drawnCard,remainingDraws:extraDraws-_d-1,needGodChoice:true,
            extraState:{skillUsed:false,restUsed:false,huntAbandoned:[],godFromHandUsed:false,godTriggeredThisTurn:true},
          });
          if(cthDraws.length>0){
            const queue=[];
            cthDraws.forEach(card=>{queue.push({type:'DRAW_CARD',card:card,triggerName:'你',targetPid:0});});
            const statQ=buildAnimQueue(gs,{...gs,players:P,deck:D,discard:Disc,log:L}).filter(a=>a.type!=='CARD_TRANSFER');
            queue.push(...statQ);
            triggerAnimQueue(queue,decisionState);
            return;
          }
          setGs(decisionState);
          return;
        }
        if(r2.needsDecision){
          const split=splitAnimBoundLogs(r2.effectMsgs||[]);
          const decisionState=buildLocalCthDecisionState(gs,{
            players:P,deck:D,discard:Disc,log:L,drawnCard:r2.drawnCard,remainingDraws:extraDraws-_d-1,
            preStatLogs:split.preStat,statLogs:split.stat,
            extraState:{skillUsed:false,restUsed:false,huntAbandoned:[],godFromHandUsed:false,godTriggeredThisTurn:false},
          });
          if(cthDraws.length>0){
            const queue=[];
            cthDraws.forEach(card=>{queue.push({type:'DRAW_CARD',card:card,triggerName:'你',targetPid:0});});
            const statQ=buildAnimQueue(gs,{...gs,players:P,deck:D,discard:Disc,log:L}).filter(a=>a.type!=='CARD_TRANSFER');
            queue.push(...statQ);
            triggerAnimQueue(queue,decisionState);
            return;
          }
          setGs(decisionState);
          return;
        }
        // forced card: already applied, continue
        if(r2.kept){
          if(r2.effectMsgs.length)L.push(...r2.effectMsgs);
          // 继续下一张牌
          continue;
        }
      }
    }
    const newGs=startNextTurn({...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:0});
    if(cthDraws.length>0){
      // 构建CTH摸牌动画队列
      const queue=[];
      cthDraws.forEach(card=>{
        queue.push({type:'DRAW_CARD',card:card,triggerName:'你',targetPid:0});
      });
      // 添加状态变化动画
    const statQ=buildAnimQueue(gs,newGs).filter(a=>a.type!=='CARD_TRANSFER');
      queue.push(...statQ);
      // 如果下一回合是玩家回合，添加 YOUR_TURN 动画
      if(newGs.currentTurn===0&&newGs.drawReveal?.card){
        queue.push({type:'YOUR_TURN',msgs:newGs._turnStartLogs},{type:'DRAW_CARD',card:newGs.drawReveal.card,triggerName:'你',targetPid:0,msgs:newGs._drawLogs});
      }
      triggerAnimQueue(queue,newGs);
    }else if(newGs.currentTurn===0&&newGs.drawReveal?.card){
      const statQ=bindAnimLogChunks(buildAnimQueue(gs,newGs),{statLogs:newGs._statLogs});
      triggerAnimQueue([{type:'YOUR_TURN',msgs:newGs._turnStartLogs},{type:'DRAW_CARD',card:newGs.drawReveal.card,triggerName:'你',targetPid:0,msgs:newGs._drawLogs},...statQ],newGs);
    }else applyNextTurnGs(newGs);
  }
  endTurnRef.current=endTurn;

  function autoDiscardFromRight(){
    // 多人弃牌超时：从右侧弃牌直到不超限，然后进入下一回合
    const limit=effectiveHandLimit;
    let P=copyPlayers(gs.players);
    const discarded=[];
    while(P[0].hand.length>limit){const c_=P[0].hand.pop();discarded.push(c_);}
    // 黑山羊幼仔弃置时销毁
    const keptDisc=[];const destroyedDisc=[];
    for(const c of discarded) if(isBlackGoatYoung(c)) destroyedDisc.push(c); else keptDisc.push(c);
    let D=[...gs.deck],Disc=[...gs.discard,...keptDisc],L=[...gs.log];
    const cthDraws=[];
    if(keptDisc.length) L.push(`(超时) 弃置：${keptDisc.map(c_=>cardLogText(c_,{alwaysShowName:true})).join(' ')}`);
    if(destroyedDisc.length) L.push(`黑山羊幼仔 ×${destroyedDisc.length} 被销毁`);
    // CTH power: draw when ending turn while face-down
    if(P[0].isResting&&P[0].godName==='CTH'&&P[0].godLevel>=1){
      const extraDraws=P[0].godLevel;
      L.push(`你（克苏鲁信徒Lv.${P[0].godLevel}）梦访拉莱耶，翻面结束回合时额外摸${extraDraws}张牌`);
      for(let _d=0;_d<extraDraws;_d++){
        const r2=playerDrawCard(P,D,Disc,0,gs);P=r2.P;D=r2.D;Disc=r2.Disc;
        if(r2.drawnCard){
          L.push(`  摸到 ${cardLogText(r2.drawnCard,{alwaysShowName:true})}`);
          cthDraws.push(r2.drawnCard);
        }
        if(r2.needGodChoice){
          setGs(buildLocalCthDecisionState(gs,{
            players:P,deck:D,discard:Disc,log:L,drawnCard:r2.drawnCard,remainingDraws:extraDraws-_d-1,needGodChoice:true,
            extraState:{skillUsed:false,restUsed:false,huntAbandoned:[],godFromHandUsed:false,godTriggeredThisTurn:true},
          }));
          return;
        }
        if(r2.needsDecision){
          const split=splitAnimBoundLogs(r2.effectMsgs||[]);
          setGs(buildLocalCthDecisionState(gs,{
            players:P,deck:D,discard:Disc,log:L,drawnCard:r2.drawnCard,remainingDraws:extraDraws-_d-1,
            preStatLogs:split.preStat,statLogs:split.stat,
            extraState:{skillUsed:false,restUsed:false,huntAbandoned:[],godFromHandUsed:false,godTriggeredThisTurn:false},
          }));
          return;
        }
      }
    }
    const newGs=startNextTurn({...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:0,abilityData:{}});
    if(discarded.length||cthDraws.length>0){
      const queue=[];
      if(discarded.length){
        queue.push({type:'DISCARD',msgs:L.slice(-discarded.length-1)});
      }
      if(cthDraws.length>0){
        cthDraws.forEach(card=>{
          queue.push({type:'DRAW_CARD',card:card,triggerName:'你',targetPid:0});
        });
      }
      // 添加状态变化动画
      const statQ=buildAnimQueue(gs,newGs);
      queue.push(...statQ);
      triggerAnimQueue(buildPlayerTurnDrawQueue(gs,newGs,queue),newGs);
    }else if(newGs.currentTurn===0&&newGs.drawReveal?.card){
      triggerAnimQueue(buildPlayerTurnDrawQueue(gs,newGs),newGs);
    }else{
      applyNextTurnGs(newGs);
    }
  }
  autoDiscardRef.current=autoDiscardFromRight;

  function startNewGame(){
    setShowFullLog(false);
    // First-time player: show tutorial before starting
    if(!tutorialDone){setTutorialStep(1);setShowTutorial(true);return;}
    _doStartNewGame();
  }
  function _doStartNewGame(silent=false){
    const newGs=initGame(
      null,
      activeDebugConfig.debugForceCard,
      activeDebugConfig.debugForceCardTarget,
      activeDebugConfig.debugForceCardKeep,
      activeDebugConfig.debugForceCardType,
      activeDebugConfig.debugForceZoneCardKey,
      activeDebugConfig.debugForceZoneCardName,
      activeDebugConfig.debugForceGodCardKey,
      activeDebugConfig.debugPlayerRole,
      startNextTurn,
    );
    roseThornPrevRef.current=null;
    animQueueRef.current=[];
    pendingGsRef.current=null;
    setAnimExiting(false);
    setHitIndices([]);
    setShowGodResurrection(false); // reset for next game
    if(silent){
      // Tutorial preview: set game state immediately, no animation, no pending draw
      setAnim(null);
      syncVisibleLog(newGs.log||[]);
      setGs({...newGs,phase:'ACTION',drawReveal:null});
      return;
    }
    // Normal start: show game board immediately as background, then play animations on top
    syncVisibleLog(newGs.log||[]);
    setGs({...newGs,phase:'ACTION',drawReveal:null});
    setAnim(null);
    setRoleRevealAnim({role:newGs.players[0].role,pendingGs:newGs});
  }
  function returnToMainMenu(){
    if(isMultiplayer)return;
    roseThornPrevRef.current=null;
    animQueueRef.current=[];
    pendingGsRef.current=null;
    setAnim(null);
    setAnimExiting(false);
    setCardTransfers([]);
    setGs(null);
  }
  function _onRoleRevealDone(pendingGs){
    setRoleRevealAnim(null);
    if(!pendingGs)return; // tutorial path: game already set
    // 开局时所有玩家的 pendingGs 已随 gameStart 广播过，
    // advanceQueue→setGs 不应再触发 useEffect 广播（否则非房主播完动画后会打断房主动画）
    receivedGsRef.current=true;
    // 多人游戏中非当前操作玩家：播「XX的回合」+ 翻牌动画（与当前玩家体验一致）
    if(pendingGs._isMP&&pendingGs.currentTurn!==0){
      const activeName=pendingGs.players[pendingGs.currentTurn]?.name||'???';
      const drawerPid=pendingGs.currentTurn;
      const ph=pendingGs.phase;
      const drawnCard=ph==='GOD_CHOICE'
        ?pendingGs.abilityData?.godCard
        :pendingGs.drawReveal?.card;
      if(drawnCard){
        if(pendingGs._playersBeforeThisDraw){
          visualPlayersLockRef.current=copyPlayers(pendingGs._playersBeforeThisDraw);
        }
        // 遮蔽真实 phase，动画结束后 advanceQueue 再还原（与 applyNextTurnGs 同样模式）
        suppressNextBroadcastRef.current=true; // pendingGs 已广播过，advanceQueue 不再回传
        pendingGsRef.current=pendingGs;
        
        let inspectionAndTailQueue = [];
        const drawStatQ=bindAnimLogChunks(
          buildAnimQueue({...gs,players:pendingGs._playersBeforeThisDraw||gs.players},pendingGs),
          {statLogs:pendingGs._statLogs}
        );
        
        if(ph==='GOD_CHOICE'){
          const inspectionEvents = (pendingGs._inspectionEvents||[]).filter(ev=>ev?.seq>(gs._inspectionSeq||0));
          if(inspectionEvents.length) {
            lastInspectionSeqRef.current=Math.max(lastInspectionSeqRef.current,...inspectionEvents.map(ev=>ev.seq||0));
            const inspectionFlow = buildInspectionEventFlow({...gs, players: pendingGs._playersBeforeThisDraw||gs.players}, inspectionEvents, {buildAnimQueue, copyPlayers});
            const tailQueue = buildAnimQueue({players: inspectionFlow.players, log: inspectionFlow.log}, pendingGs);
            inspectionAndTailQueue = [...drawStatQ, ...inspectionFlow.queue, ...tailQueue];
          } else {
            inspectionAndTailQueue = drawStatQ;
          }
        } else {
          inspectionAndTailQueue = drawStatQ;
        }
        
        animQueueRef.current=[...inspectionAndTailQueue];
        setGs({...pendingGs,phase:'ACTION',drawReveal:null,abilityData:{}});
        triggerAnimQueue([
          {type:'YOUR_TURN',name:activeName,msgs:pendingGs._turnStartLogs},
          {type:'DRAW_CARD',card:drawnCard,triggerName:activeName,targetPid:drawerPid,msgs:pendingGs._drawLogs},
          ...inspectionAndTailQueue,
        ],pendingGs);
      }else{
        triggerAnimQueue([{type:'YOUR_TURN',name:activeName,msgs:pendingGs._turnStartLogs}],pendingGs);
      }
      return;
    }
    const localDrawnCard=pendingGs.phase==='GOD_CHOICE'
      ?pendingGs.abilityData?.godCard
      :(pendingGs.drawReveal?.card||pendingGs._drawnCard||null);
    if(localDrawnCard){
      if(pendingGs._playersBeforeThisDraw){
        visualPlayersLockRef.current=copyPlayers(pendingGs._playersBeforeThisDraw);
      }
      // Normal draw: YOUR_TURN → card flip → apply state
      const drawStatQ=bindAnimLogChunks(
        buildAnimQueue({...gs,players:pendingGs._playersBeforeThisDraw||gs.players},pendingGs),
        {statLogs:pendingGs._statLogs}
      );
      triggerAnimQueue([
        {type:'YOUR_TURN',msgs:pendingGs._turnStartLogs},
        {type:'DRAW_CARD',card:localDrawnCard,triggerName:'你',targetPid:0,msgs:pendingGs._drawLogs},
        ...drawStatQ
      ],pendingGs);
    }else{
      const queue=[{type:'YOUR_TURN',msgs:pendingGs._turnStartLogs}];
      queue.push(...bindAnimLogChunks(
        buildAnimQueue({...gs,players:pendingGs._playersBeforeThisDraw||gs.players},pendingGs),
        {statLogs:pendingGs._statLogs}
      ));
      triggerAnimQueue(queue,pendingGs);
    }
  }

  function completeTutorial(){
    setShowTutorial(false);
    setTutorialDone(true);
    if(!isArtifact)safeLS.set(TUTORIAL_KEY,'1');
    // Always start a fresh game — the silent tutorial-preview gs was display-only.
    // _doStartNewGame() will trigger roleReveal → YOUR_TURN → DRAW_CARD in sequence.
    _doStartNewGame();
  }
  function _startForTutorial(){
    // Silent game init for tutorial preview (steps 2+)
    _doStartNewGame(true);
  }

  function cancelAction(){
    // Restore roleRevealed to what it was before skill was triggered,
    // so aborting mid-skill does not permanently reveal the player's role.
    const prev=gs.abilityData?.preSkillRevealed??gs.players[0].roleRevealed;
    let P=copyPlayers(gs.players);
    P[0]={...P[0],roleRevealed:prev};
    if(gs.phase==='SWAP_GIVE_CARD'&&gs.abilityData.takenCard){
      // Return the card secretly taken from the target
      P[gs.abilityData.swapTi].hand.push(gs.abilityData.takenCard);
    }
    setGs({...gs,players:P,phase:'ACTION',abilityData:{}});
  }

  function revealWin(){
    // Kill any running animation so we can't be overwritten by a stale pendingGs
    animQueueRef.current=[];
    pendingGsRef.current=null;
    setAnim(null);
    setGs(prev=>{
      if(!prev)return prev;
      // Determine winner based on current phase
      if(prev.phase==='GOD_RESURRECTION'){
        // Cultist victory
        const cultists=prev.players.filter(p=>p.role==='邪祀者');
        const winnerNames=cultists.map(p=>p.name).join('、');
        const reason=`邪神苏醒！邪祀者（${winnerNames}）获胜！`;
        return{...prev,
          players:prev.players.map(p=>({...p,roleRevealed:true,revealHand:true})),
          drawReveal:null,
          _pendingGodResurrection:undefined,
          _pendingPlayerWin:undefined,
          gameOver:{winner:'邪祀者',reason,winnerIdx:cultists[0]?.id}};
      }else{
        // Treasure hunter victory
        const winnerName=prev.players[0].name;
        const defaultReason=prev._isMP?`${winnerName}集齐了全部编号并获胜！`:'你集齐了全部编号并获胜！';
        const rawReason=prev.abilityData?.winReason||defaultReason;
        // MP 下把「你」替换为实际玩家名，避免对其他观看者显示「你」
        const reason=prev._isMP?rawReason.replace(/^你/,winnerName):rawReason;
        return{...prev,
          players:prev.players.map((p,i)=>i===0?{...p,roleRevealed:true,revealHand:true}:p),
          drawReveal:null,
          _pendingPlayerWin:undefined,
          gameOver:{winner:'寻宝者',reason,winnerIdx:0}};
      }
    });
  }

  // Phase labels
  const cardHintText='鼠标悬停查看卡牌详情（移动端请点击卡牌）';
  const canShowTurnDecisionModal=!anim&&!animExiting&&animQueueRef.current.length===0;
  const phaseLabel={
    ACTION:               isLocalCurrentTurn(gs)?'你的回合 — 可发动技能、休息，或结束回合':'等候其他旅者…',
    SWAP_SELECT_TARGET:   '【掉包】选择目标角色',
    SWAP_SELECT_TARGET_CARD: `【掉包】${gs.players[gs.abilityData?.swapTi]?.name}的手牌已公开，请选择要抽取的牌`,
    SWAP_GIVE_CARD:       `${gs.players[gs.abilityData?.swapTi]?.revealHand ? '抽到' : '暗抽到'} ${cardLogText(gs.abilityData?.takenCard)}，选一张手牌还给对方`,
    HUNT_SELECT_TARGET:   '【追捕】选择猎物',
    HUNT_CONFIRM:         isLocalHuntConfirmPhase(gs)?`${cardLogText(gs.abilityData?.revCard,{alwaysShowName:true})} 已亮出！${gs.abilityData?.revCard&&!isZoneCard(gs.abilityData.revCard)?'弃出任意手牌':'弃出匹配手牌'}造成3HP，或放弃`:(gs._isMP?'请等待追猎者做出选择…':`${cardLogText(gs.abilityData?.revCard,{alwaysShowName:true})} 已亮出`),
    HUNT_SELECT_CARD_FROM_PUBLIC: `【追捕】从 ${gs.players[gs.abilityData?.huntTi]?.name} 的公开手牌中选择一张`,
    PLAYER_REVEAL_FOR_HUNT:`⚠ ${gs.abilityData?.aiHunterName||'追猎者'} 正在追捕你！请选择一张手牌亮出`,
    HUNT_WAIT_REVEAL:isLocalCurrentTurn(gs)
      ?`等待 ${gs.players[gs.abilityData?.huntTi??1]?.name||'对方'} 亮出手牌…`
      :isLocalHuntTargetSeat(gs)
        ?`⚠ 追猎者正在追捕你！请选择一张手牌亮出（20秒）`
        :`等待 ${gs.players[gs.abilityData?.huntTi??1]?.name||'对方'} 亮出手牌…`,
    TREASURE_DODGE_DECISION: isLocalTreasureDodgePhase(gs)?(canShowTurnDecisionModal?'【寻宝者】触发负面区域牌！是否掷骰子规避？':'规避判定中…'):(gs._isMP?`等候 ${gs.players[gs.currentTurn]?.name} 做出选择…`:`${gs.players[gs.currentTurn]?.name} 正在思考…`),
    BEWITCH_SELECT_CARD:  '【蛊惑】选择要赠送的手牌',
    MULTIPLY_SELECT_TARGET: '【繁衍】选择另一名角色传播黑山羊幼仔',
    SHU_SELECT_TARGET: '【黑暗子嗣】选择一名角色获得黑山羊幼仔',
    GOD_CHOICE:          isLocalGodChoice?(canShowTurnDecisionModal?'邪神降临！选择如何回应':'面临抉择中…'):(gs._isMP?`等候 ${gs.players[gs.currentTurn]?.name} 回应邪神…`:'邪神降临！选择如何回应'),
    NYA_BORROW:          isLocalNyaBorrowPhase(gs)?(canShowTurnDecisionModal?'「千人千貌」——借用已死角色的身份？':'身份借用中…'):(gs._isMP?`等候 ${gs.players[gs.currentTurn]?.name} 借用身份…`:'「千人千貌」——借用已死角色的身份？'),
    DISCARD_PHASE:(()=>{const sel=gs.abilityData.discardSelected||[];const need=me.hand.length-effectiveHandLimit;return`手牌超限 (${me.hand.length}/${effectiveHandLimit}) — 需弃 ${need} 张，已选 ${sel.length}/${need}`;})(),
    AI_TURN:gs._isMP?`等候 ${gs.players[gs.currentTurn]?.name} 行动…`:`${gs.players[gs.currentTurn]?.name} 正在行动…`,
    PLAYER_WIN_PENDING:'✦ 你已集齐全部编号！',
    DRAW_REVEAL:         isLocalDrawDecision?(canShowTurnDecisionModal?'摸牌 — 请确认':'摸牌中…'):(gs._isMP?`等候 ${gs.players[gs.currentTurn]?.name} 摸牌…`:''),
    TREASURE_WIN:         '✦ 你已集齐全部编号！',
    ZONE_SWAP_SELECT_TARGET: `【触底反弹】选择要交换全部手牌的目标`,
    DAMAGE_LINK_SELECT_TARGET:'请选择绳索连接目标',
    CAVE_DUEL_SELECT_TARGET:'请选择“穴居人战争”的目标',
    CAVE_DUEL_SELECT_CARD: `⚠ 和${gs.players[gs.abilityData?.caveDuelSource]?.name||'对手'}来一场穴居人式的对决！尽可能亮出数字编号大的牌取胜，如果落败将失去这张牌`,
    ROSE_THORN_SELECT_TARGET:'【玫瑰倒刺】选择承受倒刺的目标',
    FIRST_COME_PICK_SELECT:`【先到先得】${gs.players[gs.abilityData?.pickOrder?.[gs.abilityData?.pickIndex||0]]?.name||'当前角色'} 请选择一张牌`,
    SAME_ABYSS_SELECT: isLocalSameAbyssTargetPhase(gs)?'【同归深渊】你手牌最多，须做出选择':'等待同归深渊目标做出选择…',
    SPHINX_GUESS: isLocalSphinxGuessPhase(gs)?'【斯芬克斯】猜测牌堆顶的牌是否是区域牌':'等待斯芬克斯猜测…',
  }[phase]||'';

  const isLocalDamageLinkSelect=!!gs&&isLocalDamageLinkSourcePhase(gs);
  const canLocalTargetSelect=!!gs&&canLocalActOnTargetSelectionPhase(gs);
  const canLocalSwapGive=!!gs&&isLocalSwapGivePhase(gs);
  const canLocalBewitchCard=!!gs&&isLocalBewitchCardPhase(gs);
  const selectingOther=canLocalTargetSelect;
  // 多人游戏中 HUNT_CONFIRM 非追猎者不显示操作按钮区域
  const cancelable=['SWAP_SELECT_TARGET','SWAP_SELECT_TARGET_CARD','SWAP_GIVE_CARD','HUNT_SELECT_TARGET','ZONE_SWAP_SELECT_TARGET','PEEK_HAND_SELECT_TARGET','CAVE_DUEL_SELECT_TARGET','DAMAGE_LINK_SELECT_TARGET','TORTOISE_ORACLE_SELECT','ROSE_THORN_SELECT_TARGET','MULTIPLY_SELECT_TARGET','SHU_SELECT_TARGET','SAME_ABYSS_SELECT','SPHINX_GUESS',...(phase==='HUNT_CONFIRM'&&gs._isMP&&!isLocalCurrentTurn(gs)?[]:['HUNT_CONFIRM']),'BEWITCH_SELECT_CARD','BEWITCH_SELECT_TARGET'].includes(phase);
  // In HUNT_CONFIRM, 放弃追捕 replaces ✕取消 — never show both
  const showCancelBtn=cancelable&&phase!=='HUNT_CONFIRM'&&isLocalCurrentTurn(gs)&&(!phase.includes('DAMAGE_LINK')||isLocalDamageLinkSelect)&&!anim;


  function handleAIClick(pi){
    if(gs.players[pi].isDead||isBlocked)return;
    if(!canLocalTargetSelect)return;
    if(phase==='SWAP_SELECT_TARGET')swapSelectTarget(pi);
    else if(phase==='ZONE_SWAP_SELECT_TARGET')zoneSwapSelectTarget(pi);
    else if(phase==='SWAP_SELECT_TARGET_CARD'){
      // 在手牌公开状态下选择目标牌
      if(pi===gs.abilityData?.swapTi){
        // 点击的是目标玩家，显示其手牌供选择
        return;
      }
    }
    else if(phase==='HUNT_SELECT_TARGET'){if(!huntAbandoned.includes(pi))huntSelectTarget(pi);}
    else if(phase==='HUNT_SELECT_CARD_FROM_PUBLIC'){
      // 点击的是死者玩家，显示其手牌供选择
      if(pi===gs.abilityData?.huntTi){
        return;
      }
    }
    else if(phase==='BEWITCH_SELECT_TARGET')bewitchSelectTarget(pi);
    else if(phase==='PEEK_HAND_SELECT_TARGET')peekHandSelectTarget(pi);
    else if(phase==='CAVE_DUEL_SELECT_TARGET')caveDuelSelectTarget(pi);
    else if(phase==='DAMAGE_LINK_SELECT_TARGET')damageLinkSelectTarget(pi);
    else if(phase==='ROSE_THORN_SELECT_TARGET')roseThornSelectTarget(pi);
    else if(phase==='MULTIPLY_SELECT_TARGET'){
      if(pi===0) return;
      let P=copyPlayers(gs.players);
      if(!P[0].hand.some(isBlackGoatYoung)) return;
      P[pi].hand.push(createBlackGoatYoungCard());
      const logMsg=`【繁衍】你将黑山羊幼仔传播给了 ${P[pi].name}`;
      const L=[...gs.log,logMsg];
      const newGs={...gs,players:P,log:L,phase:'ACTION',abilityData:{},multiplyUsed:true};
      const queue=[{type:'CARD_TRANSFER',fromPid:0,dest:'player',toPid:pi,count:1,msgs:[logMsg]}];
      if(queue.length){
        pendingGsRef.current=newGs;
        animQueueRef.current=[...queue.slice(1)];
        setGs(p=>p?{...p,phase:'ACTION',abilityData:{},multiplyUsed:true}:p);
        setAnim(queue[0]);
      }else setGs(newGs);
    }
    else if(phase==='SHU_SELECT_TARGET'){
      const count=gs.abilityData?.shuOffspringCount||0;
      if(!count) { setGs({...gs,phase:'ACTION',abilityData:{}}); return; }
      let P=copyPlayers(gs.players);
      for(let i=0;i<count;i++) P[pi].hand.push(createBlackGoatYoungCard());
      const targetName=P[pi].name;
      const L=[...gs.log,`【黑暗子嗣】${targetName==='你'?'你':targetName} 获得${count}张黑山羊幼仔`];
      setGs({...gs,players:P,log:L,phase:'ACTION',abilityData:{}});
    }
  }
  // Use a god card from hand: upgrade (same god, unlimited) or worship (different/new, once per turn)
  function worshipFromHand(idx){
    const godCard=me.hand[idx];if(!godCard||!godCard.isGod)return;
    setMobileArmedGodCardIdx(null);
    const godKey=godCard.godKey;
    const isUpgrade=me.godName===godKey&&(me.godLevel||0)<3;
    // Upgrade: no per-turn limit, not blocked by godTriggeredThisTurn or godFromHandUsed
    // Worship/convert: blocked if worship slot already used this turn
    if(!isUpgrade&&(gs.godTriggeredThisTurn||gs.godFromHandUsed))return;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard];
    P[0].hand.splice(idx,1);
    let L=[...gs.log];
    let inspectionMeta=makeInspectionMeta(gs);
    if(isUpgrade){
      L.push(`你从手牌升级邪神之力至Lv.${P[0].godLevel+1}（骷髅头不计）`);
    } else if(P[0].godName&&P[0].godName!==godKey){
      L.push(`你信仰了 ${godCard.name}，获得${godCard.power}(Lv.1)`);
    } else {
      L.push(`你从手牌直接信仰 ${godCard.name}，获得${godCard.power}(Lv.1)（骷髅头不计）`);
    }
    if(isUpgrade){
      P[0].godLevel++;P[0].godZone.push({...godCard});
    } else if(P[0].godName&&P[0].godName!==godKey){
      const converted=convertGodFollower(0,gs.currentTurn,P,D,Disc,L,inspectionMeta,'改信新神，SAN-1，旧神牌入弃牌堆');
      P=converted.P;D=converted.D;Disc=converted.Disc;L=converted.L;inspectionMeta=converted.inspectionMeta;
      P[0].godName=godKey;P[0].godLevel=1;P[0].godZone=[{...godCard}];
    } else {
      P[0].godName=godKey;P[0].godLevel=1;P[0].godZone=[{...godCard}];
    }
    // SHU: 进入目标选择阶段而非直接给牌
    const isShuBlessingHand=godKey==='SHU';
    const shuOffspringCountHand=isShuBlessingHand?(GOD_DEFS.SHU.levels[P[0].godLevel-1]?.offspringCount||0):0;
    P.forEach((p,i)=>{if(i>0&&p.godName===godKey){const abandoned=abandonGodFollower(i,gs.currentTurn,P,D,Disc,L,inspectionMeta);P=abandoned.P;D=abandoned.D;Disc=abandoned.Disc;L=abandoned.L;inspectionMeta=abandoned.inspectionMeta;}});
    const win=checkWin(P,gs._isMP);
    // Upgrade does not consume the worship slot; worship/convert does
    syncVisibleLog(L);
    setGs({...gs,players:P,deck:D,discard:Disc,log:L,phase:isShuBlessingHand?'SHU_SELECT_TARGET':'ACTION',abilityData:isShuBlessingHand?{shuOffspringCount:shuOffspringCountHand}:gs.abilityData,...inspectionMeta,...(!isUpgrade?{godFromHandUsed:true}:{}),...(win?{gameOver:win}:{})});
  }

  function canPlayerRespondWithZoneCard(card){
    if(phase==='PLAYER_REVEAL_FOR_HUNT')return !!card;
    if(phase==='HUNT_WAIT_REVEAL'&&!myTurn&&isLocalHuntTargetSeat(gs))return !!card;
    return false;
  }

  function canPlayerRespondWithAnyHandCard(){
    return phase==='CAVE_DUEL_SELECT_CARD'&&isLocalCaveDuelTargetSeat(gs);
  }

  function handleMyCardClick(idx){
    if(isBlocked)return;
    if(canLocalSwapGive)swapGiveCard(idx);
    else if(canLocalBewitchCard)bewitchSelectCard(idx);
    else if(phase==='DISCARD_PHASE')toggleDiscardSelect(idx);
    else if(isLocalHuntConfirmPhase(gs)){const c=me.hand[idx],rc=gs.abilityData?.revCard;if(rc&&cardsHuntMatch(c,rc))huntConfirm(idx);}
    else if(canPlayerRespondWithZoneCard(me.hand[idx])){
      if(phase==='PLAYER_REVEAL_FOR_HUNT')playerRevealForHunt(idx);
      else humanRevealForMPHunt(idx);
    }
    else if(isLocalPublicCardPickPhase(gs)){
      const huntTi=gs.abilityData?.huntTi;
      const targetPlayer=gs.players[huntTi];
      if(targetPlayer&&idx<targetPlayer.hand.length){
        huntSelectCardFromPublic(idx);
      }
    }
    else if((phase==='CAVE_DUEL_SELECT_CARD'&&isLocalCurrentTurn(gs))||canPlayerRespondWithAnyHandCard()){
      caveDuelSelectCard(idx);
    }
    else if(phase==='ACTION'&&isLocalCurrentTurn(gs)&&!isBlocked){
      const c=me.hand[idx];
      if(c&&c.isGod){
        const isUpgrade=me.godName===c.godKey&&(me.godLevel||0)<3;
        const canWorshipFromHand=!isUpgrade&&!gs.godTriggeredThisTurn&&!gs.godFromHandUsed;
        if(isMobile&&canWorshipFromHand){
          if(mobileArmedGodCardIdx===idx)worshipFromHand(idx);
          else setMobileArmedGodCardIdx(idx);
        }else if(isUpgrade||canWorshipFromHand){
          worshipFromHand(idx);
        }
      }
    }
  }
  function isMyCardClickable(c,idx){
    if(isBlocked)return false;
    if(canLocalSwapGive)return true;
    if(canLocalBewitchCard)return true;
    if(phase==='DISCARD_PHASE'){const sel=gs.abilityData.discardSelected||[];const max=me.hand.length-4;return sel.includes(idx)||sel.length<max;}
    if(isLocalHuntConfirmPhase(gs)){const rc=gs.abilityData?.revCard;return!!(rc&&cardsHuntMatch(c,rc));}
    if(canPlayerRespondWithZoneCard(c))return true;
    if(isLocalPublicCardPickPhase(gs)){
      const huntTi=gs.abilityData?.huntTi;
      const targetPlayer=gs.players[huntTi];
      return targetPlayer&&idx<targetPlayer.hand.length;
    }
    if((phase==='CAVE_DUEL_SELECT_CARD'&&isLocalCurrentTurn(gs))||canPlayerRespondWithAnyHandCard())return true;
    // God card in ACTION phase: upgrade (same god) is always allowed; worship/convert requires slot
    if(phase==='ACTION'&&isVisualPlayerTurn&&c.isGod){
      const isUpgrade=me.godName===c.godKey&&(me.godLevel||0)<3;
      if(isUpgrade||(!gs.godTriggeredThisTurn&&!gs.godFromHandUsed))return true;
    }
    return false;
  }

  const skillLimited=gs.skillUsed&&skillRi.skillLimited;

  return(<>
    <div onClickCapture={handleUiSfxCapture} style={{minHeight:'100vh',width:globalShiftX?`calc(100% - ${globalShiftX}px)`:'100%',boxSizing:'border-box',background:'#0a0705',color:'#c8a96e',fontFamily:"'IM Fell English','Georgia',serif",display:'flex',flexDirection:'column',gap:isMobile?5:7,padding:isMobile?'6px 8px':'8px 10px',position:'relative',left:globalShiftX||undefined,overflowX:'hidden',overflowY:'scroll',scrollbarGutter:'stable',
    animation:deathShake?'deathShakeAnim 2.0s ease-in-out':screenShake?'screenShakeAnim 0.38s ease-in-out':undefined,
    }}>
      {/* Global vignette */}
      <div style={{position:'fixed',inset:0,background:'radial-gradient(ellipse at 50% 50%,transparent 40%,#00000099 100%)',pointerEvents:'none',zIndex:1}}/>
      {/* ── 断线遮罩（游戏内）── */}
      {isDisconnected&&(
        <div onClick={()=>{setIsDisconnected(false);setIsMultiplayer(false);isMultiplayerRef.current=false;setMyPlayerIndex(0);myPlayerIndexRef.current=0;mpRoleRevealedRef.current=false;setGs(null);}}
          style={{position:'fixed',inset:0,background:'#000000dd',zIndex:9999,
            display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
          <div style={{textAlign:'center',color:'#c8a0e8',fontFamily:"'Cinzel Decorative','Cinzel',serif",
            padding:'36px 48px',background:'#0e0a14',border:'2px solid #7a50b0',borderRadius:6,
            boxShadow:'0 0 60px #5a3a8066',animation:'animPop 0.25s ease-out',pointerEvents:'none'}}>
            <div style={{fontSize:48,marginBottom:16,filter:'drop-shadow(0 0 20px #a080d0)'}}>📡</div>
            <div style={{fontSize:16,letterSpacing:2,marginBottom:8}}>连接已断开</div>
            <div style={{fontSize:12,color:'#8060a0',letterSpacing:1,fontFamily:"'Cinzel',serif",fontStyle:'italic'}}>
              您已断线，点击任意位置返回主界面
            </div>
          </div>
        </div>
      )}

      {/* Animations rendered outside the zoom container, see Fragment below */}
      {/* Target selection mask + floating prompt */}
      <TargetSelectOverlay drawReveal={gs.drawReveal} phase={isVisualPlayerTurn?phase:null} bewitchCard={gs.abilityData?.bewitchCard}/>

      {/* God choice modal */}
      {canShowTurnDecisionModal&&phase==='GOD_CHOICE'&&gs.abilityData?.godCard&&isLocalGodChoice&&gs.currentTurn===0&&(()=>{
        const godCard=gs.abilityData.godCard;
        const gk=godCard.godKey;
        const alreadyWorship=me.godName===gk;
        const isConvert=!!(me.godName&&me.godName!==gk);
        const forcedConvert=gs.abilityData?.forcedConvert||false;
        const canUpgrade=alreadyWorship&&(me.godLevel||0)<3;
        return(
          <GodChoiceModal
            godCard={godCard} player={me}
            isConvert={isConvert} forcedConvert={forcedConvert}
            onWorship={()=>godResolvePlayer(alreadyWorship&&canUpgrade?'upgrade':isConvert?'worship':'worship')}
            onKeepHand={()=>godResolvePlayer('keepHand')}
            onDiscard={()=>godResolvePlayer('discard')}
          />
        );
      })()}
      {/* NYA borrow modal */}
      {phase==='NYA_BORROW'&&isLocalNyaBorrowPhase(gs)&&(()=>{
        const deadOthers=gs.players.filter((p,i)=>i>0&&p.isDead);
        return(<NyaBorrowModal deadPlayers={deadOthers} godLevel={me.godLevel} onBorrow={nyaBorrow} onSkip={nyaSkip}/>);
      })()}
      {/* Draw reveal modal */}
      {!suppressAnim&&canShowTurnDecisionModal&&phase==='DRAW_REVEAL'&&gs.drawReveal&&gs.drawReveal.needsDecision&&(
        <DrawRevealModal
          drawReveal={gs.drawReveal}
          onKeep={handleDrawKeep}
          onDiscard={handleDrawDiscard}
          canChoose={isLocalDrawDecision}
          thinkingText={gs._isMP&&!isLocalDrawDecision?`${gs.drawReveal.drawerName||gs.players[gs.currentTurn]?.name||'对方'}正在思考…`:''}
        />
      )}
      {/* Treasure hunter dodge modal */}
      {!suppressAnim&&phase==='TREASURE_DODGE_DECISION'&&gs.drawReveal&&isLocalTreasureDodgePhase(gs)&&(
        <TreasureDodgeModal
          drawReveal={gs.drawReveal}
          onRoll={handleTreasureDodgeRoll}
          onSkip={handleTreasureDodgeSkip}
        />
      )}
      {/* Treasure hunter AOE dodge modal */}
      {!suppressAnim&&phase==='TREASURE_AOE_DODGE_DECISION'&&gs.drawReveal&&isLocalTreasureAoEDodgePhase(gs)&&(
        <TreasureDodgeModal
          drawReveal={gs.drawReveal}
          onRoll={handleTreasureAOEDodgeRoll}
          onSkip={handleTreasureAOEDodgeSkip}
          thinkingText={gs._isMP&&!isLocalTreasureAoEDodgePhase(gs)?`其他玩家思考中…`:''}
        />
      )}
      {/* Other players see thinking text during AOE dodge */}
      {!suppressAnim&&phase==='TREASURE_AOE_DODGE_DECISION'&&gs.drawReveal&&!isLocalTreasureAoEDodgePhase(gs)&&gs._isMP&&(
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(0, 0, 0, 0.8)',
          padding: '20px',
          borderRadius: '5px',
          color: '#c8a96e',
          fontFamily: "'Cinzel', serif",
          fontSize: '16px',
          zIndex: 1000
        }}>
          其他玩家思考中…
        </div>
      )}

      {!suppressAnim&&phase==='TORTOISE_ORACLE_SELECT'&&gs.abilityData&&(
        <TortoiseOracleModal abilityData={gs.abilityData} onSelect={tortoiseOracleSelect} myTurn={myTurn}/>
      )}
      {privatePeek&&(
        <PeekHandModal
          card={privatePeek.card}
          targetName={privatePeek.targetName}
          onClose={()=>setPrivatePeek(null)}
        />
      )}

      {!suppressAnim&&canShowTurnDecisionModal&&phase==='FIRST_COME_PICK_SELECT'&&gs.abilityData&&(
        <div style={{position:'fixed',inset:0,display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:isMobile?'7vh':'5vh',zIndex:400,pointerEvents:'none'}}>
          <div style={{background:'#150e07ee',border:'2px solid #d7b46a',boxShadow:'0 0 60px #d7b46a33, 0 0 120px #000a',borderRadius:4,padding:'20px 24px',maxWidth:720,width:'92%',textAlign:'center',pointerEvents:'auto'}}>
            <div style={{fontFamily:"'Cinzel',serif",color:'#e6c577',fontSize:16,letterSpacing:2,marginBottom:10}}>── 先到先得 ──</div>
            <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#b09090',fontSize:14,marginBottom:18,lineHeight:1.5}}>
              {gs.players[gs.abilityData?.pickOrder?.[gs.abilityData?.pickIndex||0]]?.name||'当前角色'} 选择一张翻开的牌收入手牌
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap',marginBottom:16}}>
              {(gs.abilityData?.revealedCards||[]).map((card,index)=>{
                const pickerIdx=gs.abilityData?.pickOrder?.[gs.abilityData?.pickIndex||0];
                const canPick=isLocalFirstComePicker(gs);
                return (
                  <DDCard
                    key={card.id??`${card.key}-${index}`}
                    card={card}
                    compact={isMobile}
                    onClick={canPick?()=>firstComePickSelectCard(index):undefined}
                    disabled={!canPick}
                    highlight={canPick}
                    holderId={pickerIdx}
                  />
                );
              })}
            </div>
            {!isLocalFirstComePicker(gs)&&(
              <div style={{fontFamily:"'Cinzel',serif",fontSize:12,color:'#a07838',letterSpacing:1}}>
                其他角色选择中…
              </div>
            )}
          </div>
        </div>
      )}

      {/* 同归深渊选择 modal */}
      {!suppressAnim&&phase==='SAME_ABYSS_SELECT'&&gs.abilityData&&(
        <div style={{position:'fixed',inset:0,display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:isMobile?'7vh':'5vh',zIndex:400,pointerEvents:'none'}}>
          <div style={{background:'#150e07ee',border:'2px solid #d7b46a',boxShadow:'0 0 60px #d7b46a33, 0 0 120px #000a',borderRadius:4,padding:'20px 24px',maxWidth:560,width:'92%',textAlign:'center',pointerEvents:'auto'}}>
            <div style={{fontFamily:"'Cinzel',serif",color:'#e6c577',fontSize:16,letterSpacing:2,marginBottom:10}}>── 同归深渊 ──</div>
            <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#b09090',fontSize:14,marginBottom:18,lineHeight:1.5}}>
              你手牌最多（{gs.players[gs.abilityData?.targetIdx]?.hand?.length||0} 张）。将手牌弃至与 {gs.players[gs.currentTurn]?.name||'对方'} 数量相等（{gs.abilityData?.actorHandCount||0} 张），或者失去 4 HP。
            </div>
            <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
              {isLocalSameAbyssTargetPhase(gs)?(
                <>
                  <button onClick={()=>sameAbyssSelect('discard')} style={{padding:'8px 16px',background:'#1a1008',border:'1.5px solid #8a6a3a',color:'#c8a96e',fontFamily:"'Cinzel',serif",fontSize:13,cursor:'pointer',borderRadius:3}}>
                    弃置手牌至 {gs.abilityData?.actorHandCount||0} 张
                  </button>
                  <button onClick={()=>sameAbyssSelect('hp')} style={{padding:'8px 16px',background:'#1a1008',border:'1.5px solid #8a3a3a',color:'#c87878',fontFamily:"'Cinzel',serif",fontSize:13,cursor:'pointer',borderRadius:3}}>
                    失去 4 HP
                  </button>
                </>
              ):(
                <div style={{fontFamily:"'Cinzel',serif",fontSize:12,color:'#a07838',letterSpacing:1}}>
                  等待 {gs.players[gs.abilityData?.targetIdx]?.name||'目标'} 做出选择…
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 斯芬克斯猜测 modal */}
      {!suppressAnim&&phase==='SPHINX_GUESS'&&gs.abilityData&&(
        <div style={{position:'fixed',inset:0,display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:isMobile?'7vh':'5vh',zIndex:400,pointerEvents:'none'}}>
          <div style={{background:'#150e07ee',border:'2px solid #d7b46a',boxShadow:'0 0 60px #d7b46a33, 0 0 120px #000a',borderRadius:4,padding:'20px 24px',maxWidth:560,width:'92%',textAlign:'center',pointerEvents:'auto'}}>
            <div style={{fontFamily:"'Cinzel',serif",color:'#e6c577',fontSize:16,letterSpacing:2,marginBottom:10}}>── 斯芬克斯 ──</div>
            <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#b09090',fontSize:14,marginBottom:18,lineHeight:1.5}}>
              猜测牌堆顶的牌是否是区域牌。若猜对，收入这张牌；若猜错，失去 3 HP。
            </div>
            <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
              {isLocalSphinxGuessPhase(gs)?(
                <>
                  <button onClick={()=>sphinxGuess(true)} style={{padding:'8px 16px',background:'#1a1008',border:'1.5px solid #8a6a3a',color:'#c8a96e',fontFamily:"'Cinzel',serif",fontSize:13,cursor:'pointer',borderRadius:3}}>
                    是区域牌
                  </button>
                  <button onClick={()=>sphinxGuess(false)} style={{padding:'8px 16px',background:'#1a1008',border:'1.5px solid #8a6a3a',color:'#c8a96e',fontFamily:"'Cinzel',serif",fontSize:13,cursor:'pointer',borderRadius:3}}>
                    不是区域牌
                  </button>
                </>
              ):(
                <div style={{fontFamily:"'Cinzel',serif",fontSize:12,color:'#a07838',letterSpacing:1}}>
                  等待 {gs.players[gs.currentTurn]?.name||'对方'} 做出猜测…
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{position:'relative',zIndex:2,display:'flex',flexDirection:'column',gap:7}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',gap:10,borderBottom:'1px solid #2a1a08',paddingBottom:6}}>
          <div style={{fontFamily:"'Cinzel Decorative','Cinzel',serif",fontSize:baseFontSizes.title,fontWeight:700,color:'#c8a96e',letterSpacing:isMobile?1:2}}>邪神的宝藏</div>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:baseFontSizes.subtitle,color:'#b89858',letterSpacing:isMobile?1:2,marginTop:1}}>Treasures of Evils</div>
          {!isMultiplayer&&(
            <button
              onClick={returnToMainMenu}
              style={{
                marginLeft:'auto',
                padding:isMobile?'4px 10px':'5px 12px',
                background:'#140c06',
                border:'1.5px solid #5a3a18',
                color:'#c8a96e',
                fontFamily:"'Cinzel',serif",
                fontWeight:700,
                fontSize:baseFontSizes.small,
                borderRadius:3,
                cursor:'pointer',
                letterSpacing:isMobile?0.5:1,
                textTransform:'uppercase',
              }}
            >
              返回主界面
            </button>
          )}
        </div>

        {/* Scaled player areas wrapper */}
        <div style={{overflow:'hidden',width:'100%',display:'flex',justifyContent:'center'}}>
          <div data-zoom-container style={{
            zoom:scaleRatio<1?scaleRatio:'normal',
            width:DESIGN_WIDTH,
            flexShrink:0
          }}>
            <div style={{width:'100%',boxSizing:'border-box',padding:`0 ${scaledAreaSafeInsetX}px`}}>

        {/* AI panels */}
        <div ref={aiPanelAreaRef} style={{
          display:'grid',
          gridTemplateColumns:'repeat(4,1fr)',
          gap:isMobile?6:8,
          justifyContent:'center',
          width:'100%'
        }}>
          {visualPlayers.slice(1).map((p,i)=>{
            const pi=i+1;
            const isSel=selectingOther&&!p.isDead&&!isBlocked&&!(phase==='HUNT_SELECT_TARGET'&&huntAbandoned.includes(pi));
            // 在SWAP_SELECT_TARGET_CARD阶段，如果这是目标玩家，显示其手牌并允许选择
            const isSwapTargetCardPhase=phase==='SWAP_SELECT_TARGET_CARD'&&myTurn&&gs.abilityData?.swapTi===pi;
            // 在HUNT_SELECT_CARD_FROM_PUBLIC阶段，如果这是死者玩家，显示其手牌并允许选择
            const isHuntCardFromPublicPhase=phase==='HUNT_SELECT_CARD_FROM_PUBLIC'&&myTurn&&gs.abilityData?.huntTi===pi;
            const showFaceUpForSwap=isSwapTargetCardPhase||isHuntCardFromPublicPhase||p.revealHand;
              const onCardSelectForSwap=isSwapTargetCardPhase?((cardIdx)=>swapSelectTargetCard(cardIdx)):isHuntCardFromPublicPhase?((cardIdx)=>huntSelectCardFromPublic(cardIdx)):null;
              return(
                <div key={p.id} data-pid={pi} style={{position:'relative',zIndex:isSel?101:undefined,alignSelf:'start'}}>
                <PlayerPanel player={p} playerIndex={pi} isCurrentTurn={visualCurrentTurn===pi} isSelectable={isSel} showFaceUp={showFaceUpForSwap} onSelect={()=>handleAIClick(pi)} onCardSelect={onCardSelectForSwap} isBeingHit={hitIndices.includes(pi)} isSanHit={sanHitIndices.includes(pi)} isHpHeal={hpHealIndices.includes(pi)} isSanHeal={sanHealIndices.includes(pi)} isBeingGuillotined={guillotinedPids.has(pi)} displayStats={displayStats} scaleRatio={scaleRatio} viewportWidth={vw}/>
                </div>
              );
            })}
        </div>

        {/* Middle: self info + deck/discard piles + log */}
        <div style={{display:'flex',gap:isMobile?5:10,flexWrap:'wrap',alignItems:'stretch',width:'100%',justifyContent:'flex-start'}}>
          {/* Self panel - Fixed width, no grow */}
          <div ref={selfPanelRef} data-pid={0} data-death-panel={0} onClick={phase==='SHU_SELECT_TARGET'&&!isBlocked?()=>handleAIClick(0):undefined} style={{
            background:'#180f07',
            border:`1.5px solid ${hitIndices.includes(0)?'#cc2222':sanHitIndices.includes(0)?'#8840cc':phase==='SHU_SELECT_TARGET'?'#4ade80':suppressAnim&&tutorialStep>=2&&tutorialStep<=4?'#c8a96e':'#3a2510'}`,
            borderRadius:3,
            padding:isMobile?'8px 9px':'12px 13px',
            width:isMobile?258:214,
            minWidth:isMobile?258:214,
            flexBasis:isMobile?258:214,
            flexGrow:0,
            flexShrink:0,
            display:'flex',
            flexDirection:'column',
            gap:9,
            minHeight:middleRowHeight,
            position:'relative',
            overflow:'visible',
            boxShadow:phase==='SHU_SELECT_TARGET'?'0 0 14px #4ade8088,inset 0 0 12px #4ade8022':suppressAnim&&tutorialStep>=2&&tutorialStep<=4?'0 0 0 2px #c8a96e66,0 0 20px #c8a96e44':undefined,
            opacity:guillotinedPids.has(0)?0:1,
            cursor:phase==='SHU_SELECT_TARGET'&&!isBlocked?'pointer':'default',
          }}>

            {/* SAN mist: rendered by full-screen SanMistOverlay */}
            {(hpHealIndices.includes(0)||sanHealIndices.includes(0))&&<HealCrossEffect color={sanHealIndices.includes(0)?'#a78bfa':'#4ade80'}/>}
            <div>
              <div ref={roleTextRef} style={{fontFamily:"'Cinzel',serif",color:'#7a5a2a',fontSize:fontSizes.small,letterSpacing:2,marginBottom:3,textTransform:'uppercase'}}>你的身份</div>
              <div style={{fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:fontSizes.body,color:ri.col,textShadow:`0 0 12px ${ri.col}66`,letterSpacing:1}}>{ri.icon} {me.role}</div>
              <div style={{fontFamily:"'Microsoft YaHei','SimHei',sans-serif",fontStyle:'italic',color:'#a07838',fontSize:fontSizes.small,marginTop:4,lineHeight:1.6,whiteSpace:'nowrap'}}>{ri.goal}</div>
              {me.isResting&&<div style={{marginTop:4,fontSize:fontSizes.small,color:'#4ade80',fontFamily:"'Cinzel',serif",letterSpacing:1,filter:'drop-shadow(0 0 4px #4ade80)'}}>♥ 翻面中 — 下回合跳过</div>}
            {/* God zone display */}
            {(me.godEncounters||0)>0&&<div style={{marginTop:4,fontSize:fontSizes.small,color:'#8b6060',letterSpacing:1}}>{'💀'.repeat(Math.min(me.godEncounters,5))}{me.godEncounters>5?`×${me.godEncounters}`:''} 邪神遭遇</div>}
            {me.godName&&(me.godZone||[]).length>0&&(
              <div style={{marginTop:4,padding:'3px 6px',background:GOD_DEFS[me.godName]?.bgCol||'#100808',border:`1px solid ${GOD_DEFS[me.godName]?.col||'#c06020'}88`,borderRadius:3}}>
                <div style={{fontSize:fontSizes.small,color:GOD_DEFS[me.godName]?.col,fontFamily:"'Cinzel',serif",letterSpacing:0.5,fontWeight:700,textShadow:`0 0 6px ${GOD_DEFS[me.godName]?.col}66`}}>{GOD_DEFS[me.godName]?.name}</div>
                <div style={{fontSize:fontSizes.small,color:'#d4b0b0',fontFamily:"'IM Fell English',serif",fontStyle:'italic'}}>{GOD_DEFS[me.godName]?.power} Lv.{me.godLevel}</div>
                <div style={{fontSize:fontSizes.tiny,color:'#a07878',fontStyle:'italic',marginTop:1,lineHeight:1.4}}>{GOD_DEFS[me.godName]?.levels[(me.godLevel||1)-1]?.desc}</div>
              </div>
            )}
            {!!me.zoneCards?.length&&(
              <div style={{marginTop:6,display:'flex',flexWrap:'wrap',gap:4}}>
                {me.zoneCards.map((c,ci)=><DDCard key={c.id||`self-zone-${ci}`} card={c} small holderId={0}/>)}
              </div>
            )}
            </div>
            <div style={{borderTop:'1px solid #2a1a08',paddingTop:8}}>
              <StatBar label="HP"  val={displayStats[0]?.hp ?? me.hp}  color="#7a1515" trackColor="#1a0808" scaleRatio={scaleRatio} viewportWidth={vw}/>
              <StatBar label="SAN" val={displayStats[0]?.san ?? me.san} color="#3a1078" trackColor="#120820" scaleRatio={scaleRatio} viewportWidth={vw}/>
            </div>
            {canWin&&phase!=='PLAYER_WIN_PENDING'&&(
              <button onClick={revealWin} style={{
                padding:'7px 4px',background:'#1c1208',border:'1.5px solid #c8a96e',
                color:'#e8c87a',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:11,
                borderRadius:2,cursor:'pointer',letterSpacing:1,
                boxShadow:'0 0 16px #c8a96e44',animation:'animGlow 1.5s ease-in-out infinite',
                textTransform:'uppercase',
              }}>✦ 亮牌获胜</button>
            )}
            {/* 表情按钮（多人游戏时显示） */}
            {isMultiplayer&&(
              <div style={{position:'absolute',top:6,right:6,zIndex:50}}>
                <button ref={emojiButtonRef} onClick={()=>{
                  const rect=_getZoomCompensatedRect(emojiButtonRef.current);
                  if(rect){
                    setEmojiButtonPos({
                      top:rect.bottom+8,
                      right:window.innerWidth-rect.right
                    });
                  }
                  setShowEmojiPicker(v=>!v);
                }} style={{
                  background:'#1a1008',border:'1px solid #4a3010',borderRadius:3,
                  fontSize:14,cursor:'pointer',padding:'2px 5px',lineHeight:1.2,
                  color:'#c8a96e',opacity:showEmojiPicker?1:0.7,
                }}>😊</button>
              </div>
            )}
          </div>
          {/* Center: deck/discard piles */}
          <PileDisplay deckCount={gs.deck.length} discardCount={visualDiscard.length} discardTop={visualDiscard[visualDiscard.length-1]||null} discardCards={visualDiscard} inspectionCount={gs.inspectionDeck.length+(gs.houndsOfTindalosActive?0:0)} compact={vw<430} baseHeight={middleRowHeight} deckRef={deckAreaRef} discardRef={discardPileRef} scaleRatio={scaleRatio}/>
          {/* Log — narrow, right-aligned */}
          <div ref={logRef} style={{width:isMobile?'100%':218,flexBasis:isMobile?'100%':undefined,flexShrink:0,background:'#0e0904',border:'1.5px solid #2a1a08',borderRadius:3,padding:'8px 10px',overflowY:'auto',minHeight:isMobile?100:middleRowHeight,maxHeight:isMobile?100:middleRowHeight}}>
            <div style={{fontFamily:"'Cinzel',serif",color:'#7a5a2a',fontSize:fontSizes.small,letterSpacing:2,marginBottom:5,textTransform:'uppercase'}}>— 冒险日志 —</div>
            {(()=>{
              // 多人游戏：用玩家真实名字替换其他人回合里的"你"
              let logOwner=null; // 当前段落属于哪位玩家（名字）
              const myName=gs.players[0]?.name;
              return visibleLog.slice(-50).map((line,i)=>{
                const turnMatch=line.match(/^── (.+?) 的回合开始 ──$/);
                if(turnMatch) logOwner=turnMatch[1];
                let display=line;
                if(gs._isMP&&logOwner&&logOwner!==myName){
                  const owner=gs.players.find(p=>p.name===logOwner);
                  const roleTag=owner?`${owner.name}（身份：${owner.role}）`:logOwner;
                  // 替换各种"你"开头的句式
                  display=display
                    .replace(/^你（([^）]+)）/,(_,role)=>`${logOwner}（${role}）`)
                    .replace(/^你的邪神之力/,`${logOwner}的邪神之力`)
                    .replace(/^你遭遇/,`${logOwner}遭遇`)
                    .replace(/^你信仰/,`${logOwner}信仰`)
                    .replace(/^你放弃/,`${logOwner}放弃`)
                    .replace(/^你摸到/,`${logOwner}摸到`)
                    .replace(/^你选择/,`${logOwner}选择`)
                    .replace(/^你借用/,`${logOwner}借用`)
                    .replace(/^你（克苏鲁/,`${logOwner}（克苏鲁`)
                    .replace(/^你$/,roleTag)
                    .replace(/^你/,logOwner);
                }
                return(
                  <div key={i} style={{
                    fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',
                    fontSize:fontSizes.body,lineHeight:1.7,
                    color:line.includes('──')?'#7a5020':
                          line.includes('☠')||line.includes('死亡')||line.includes('倒下')?'#882020':
                          line.includes('获胜')||line.includes('集齐')?'#c8a96e':
                          '#5a4020',
                    fontWeight:line.includes('──')?700:400,
                  }}>{display}</div>
                );
              });
            })()}
          </div>
        </div>
            </div>
          </div>
        </div>

        {/* Phase bar */}
        <div style={{
          background:'#120900',
          border:`1px solid ${myTurn&&!['AI_TURN'].includes(phase)?'#5a3010':'#2a1a08'}`,
          borderRadius:3,padding:isMobile?'5px 10px':'7px 14px',minHeight:isMobile?32:38,
          display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',
        }}>
          <div style={{flex:1,fontFamily:"'Cinzel',serif",color:(phase==='PLAYER_REVEAL_FOR_HUNT'||phase==='CAVE_DUEL_SELECT_CARD')?'#cc3030':myTurn&&phase!=='AI_TURN'?'#a08040':'#3a2510',fontSize:baseFontSizes.body,letterSpacing:isMobile?0.5:1}}>
            <div>{phaseLabel}</div>
            {phase==='ACTION'&&<div style={{fontSize:baseFontSizes.small,color:'#5a4a3a',marginTop:2}}>{cardHintText}</div>}
          </div>
          {isMultiplayer&&mpCthSec!==null&&isMpCthDecisionPhase&&(
            <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:mpCthSec<=5?'#e05030':mpCthSec<=10?'#e09030':'#cc8030',letterSpacing:1,flexShrink:0}}>
              ⏱ 抉择 {mpCthSec}s
            </div>
          )}
          {/* 多人回合计时器 */}
          {isMultiplayer&&mpTurnSec!==null&&myTurn&&phase!=='AI_TURN'&&phase!=='HUNT_WAIT_REVEAL'&&!isMpCthDecisionPhase&&(
            <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:mpTurnSec<=10?'#e05030':mpTurnSec<=20?'#e09030':'#608060',letterSpacing:1,flexShrink:0}}>
              ⏱ {mpTurnSec}s
            </div>
          )}
          {isMultiplayer&&mpDiscardSec!==null&&phase==='DISCARD_PHASE'&&(
            <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:mpDiscardSec<=5?'#e05030':'#e09030',letterSpacing:1,flexShrink:0}}>
              ⏱ 弃牌 {mpDiscardSec}s
            </div>
          )}
          {isMultiplayer&&mpHuntSec!==null&&phase==='HUNT_WAIT_REVEAL'&&(
            <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:mpHuntSec<=5?'#e05030':mpHuntSec<=10?'#e09030':'#cc8030',letterSpacing:1,flexShrink:0}}>
              ⏱ 亮牌 {mpHuntSec}s
            </div>
          )}
        </div>

        {/* 两人一绳锁链图像 */}
        {[
          ...gs.players.flatMap((player,playerIndex)=>{
            if(!player.damageLink||!player.damageLink.active)return [];
            const partnerIndex=player.damageLink.partner;
            if(partnerIndex==null||partnerIndex<=playerIndex)return [];
            const partner=gs.players[partnerIndex];
            if(!partner?.damageLink?.active||partner.damageLink.partner!==playerIndex)return [];
            return [{id:`active-${playerIndex}-${partnerIndex}`,a:playerIndex,b:partnerIndex,mode:'active'}];
          }),
          ...damageLinkGhosts
        ].map((link) => {
          const playerIndex=link.a;
          const partnerIndex=link.b;
          const ghostMode=link.mode==='active'?null:link.mode;
          const sourceEl = document.querySelector(`[data-pid="${playerIndex}"]`);
          const partnerEl = document.querySelector(`[data-pid="${partnerIndex}"]`);
          const sourceRect = _getZoomCompensatedRect(sourceEl);
          const partnerRect = _getZoomCompensatedRect(partnerEl);
          if (!sourceRect || !partnerRect) return null;
          const x1 = sourceRect.left + sourceRect.width / 2;
          const y1 = sourceRect.top + sourceRect.height * 0.68;
          const x2 = partnerRect.left + partnerRect.width / 2;
          const y2 = partnerRect.top + partnerRect.height * 0.68;
          const makeBindStrands=(rect,anchorX,anchorY,keyPrefix)=>{
            const bindSpacing=9.5;
            const ringRx=9;
            const ringRy=4.4;
            const strandGap=ringRy*2.6;
            const strandOffsets=[-strandGap,0,strandGap];
            const strandTilts=[11,2,-9];
            const strandAnchorShifts=[-18,4,20];
            const strandHalf=Math.max(26,rect.width*0.52);
            const minY=rect.top+rect.height*0.56;
            const maxY=rect.bottom-ringRy-8;
            return strandOffsets.flatMap((offset,rowIdx)=>{
              const strandY=Math.max(minY,Math.min(maxY,anchorY+offset));
              const startX=anchorX-strandHalf;
              const endX=anchorX+strandHalf;
              const span=Math.max(1,endX-startX);
              const count=Math.max(2,Math.floor(span/bindSpacing)+1);
              const tilt=strandTilts[rowIdx] ?? 0;
              const localAnchorX=anchorX+(strandAnchorShifts[rowIdx] ?? 0);
              const slope=Math.tan(tilt*Math.PI/180);
              return [...Array(count)].map((_,i)=>{
                const t=count===1?0.5:i/(count-1);
                const cx=startX+span*t;
                const cy=Math.max(minY,Math.min(maxY,strandY+(cx-localAnchorX)*slope));
                return{
                  cx,
                  cy,
                  rx:ringRx,
                  ry:ringRy,
                  rot:tilt,
                  key:`${keyPrefix}-${rowIdx}-${i}`,
                };
              });
            });
          };
          const bindRings=[
            ...makeBindStrands(sourceRect,x1,y1,`bind-${playerIndex}`),
            ...makeBindStrands(partnerRect,x2,y2,`bind-${partnerIndex}`),
          ];
          const dx = x2 - x1;
          const dy = y2 - y1;
          const length = Math.hypot(dx, dy);
          if (length < 8) return null;
          const angle = Math.atan2(dy, dx) * 180 / Math.PI;
          const ux = dx / length;
          const uy = dy / length;
          const perpX = -uy;
          const perpY = ux;
          const ringSpacing = 9.5;
          const ringCount = Math.max(2, Math.floor(length / ringSpacing));
          const wrapStyle=ghostMode==='break'?{animation:'chainBreakFade 560ms ease-out forwards'}:
            ghostMode==='fade'?{animation:'chainExpireFade 720ms ease-out forwards'}:null;
          const bindAnimStyle=ghostMode==='break'?{animation:'chainBindSnap 560ms ease-out forwards'}:
            ghostMode==='fade'?{animation:'chainExpireFade 720ms ease-out forwards'}:null;
          return createPortal(
            <div
              key={`link-${link.id}`}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 50,
                pointerEvents: 'none',
                ...(wrapStyle||{})
              }}
            >
              <svg
                width="100%"
                height="100%"
                style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
              >
                {bindRings.map(ring=>(
                  <g
                    key={ring.key}
                    transform={`translate(${ring.cx} ${ring.cy}) rotate(${ring.rot})`}
                  >
                    <g style={bindAnimStyle||undefined}>
                      <ellipse
                        cx="0"
                        cy="0"
                        rx={ring.rx}
                        ry={ring.ry}
                        fill="rgba(42,26,8,0.02)"
                        stroke="rgba(200,169,110,0.18)"
                        strokeWidth="1.5"
                      />
                      <ellipse
                        cx="0"
                        cy="0"
                        rx={Math.max(6,ring.rx-2.4)}
                        ry={Math.max(3,ring.ry-1.5)}
                        fill="none"
                        stroke="rgba(255,233,186,0.08)"
                        strokeWidth="0.55"
                      />
                    </g>
                  </g>
                ))}
                {[...Array(ringCount)].map((_, ringIdx) => {
                  const t = ringCount === 1 ? 0.5 : ringIdx / (ringCount - 1);
                  const offset = ringIdx % 2 === 0 ? -0.9 : 0.9;
                  const cx = x1 + dx * t + perpX * offset;
                  const cy = y1 + dy * t + perpY * offset;
                  const shouldDrift = ringIdx > 0 && ringIdx < ringCount - 1;
                  return (
                    <g
                      key={`ring-${playerIndex}-${partnerIndex}-${ringIdx}`}
                      transform={`translate(${cx} ${cy}) rotate(${angle})`}
                    >
                      <g
                        style={{
                          animation: ghostMode==='break'
                            ? `chainMainSnap 560ms ease-out forwards`
                            : ghostMode==='fade'
                              ? `chainExpireFade 720ms ease-out forwards`
                              : shouldDrift
                                ? `chainLinkDrift 1.6s ease-in-out ${ringIdx * 0.05}s infinite alternate`
                                : 'none',
                          transformOrigin: '0px 0px',
                          transformBox: 'fill-box',
                        }}
                      >
                        <ellipse
                          cx="0"
                          cy="0"
                          rx="9"
                          ry="4.4"
                          fill="rgba(42,26,8,0.02)"
                          stroke="rgba(200,169,110,0.22)"
                          strokeWidth="1.45"
                        />
                        <ellipse
                          cx="0"
                          cy="0"
                          rx="6.6"
                          ry="2.9"
                          fill="none"
                          stroke="rgba(255,233,186,0.10)"
                          strokeWidth="0.55"
                        />
                      </g>
                    </g>
                  );
                })}
              </svg>
            </div>
          ,document.body);
        })}

        {/* Hand area */}
        <div ref={handAreaRef} data-hand-area style={{background:'#120900',border:`1.5px solid ${myTurn?'#3a2010':'#2a1a08'}`,borderRadius:3,padding:isMobile?'8px 9px':'11px 13px'}}>
          <div style={{display:'flex',alignItems:'center',marginBottom:9,gap:8}}>
            <span style={{fontFamily:"'Cinzel',serif",color:phase==='DISCARD_PHASE'||phase==='PLAYER_REVEAL_FOR_HUNT'?'#882020':'#3a2510',fontSize:10,letterSpacing:1}}>
              {phase==='DISCARD_PHASE'?`⚠ 手牌超限 (${visualMe.hand.length}/${effectiveHandLimit})`:phase==='PLAYER_REVEAL_FOR_HUNT'?'⚠ 选择亮出一张手牌':phase==='HUNT_WAIT_REVEAL'&&!myTurn&&isLocalHuntTargetSeat(gs)?'⚠ 选择亮出一张手牌':`手牌 (${visualMe.hand.length}/${effectiveHandLimit})`}
            </span>
            {(phase==='ACTION'&&isVisualPlayerTurn&&!isBlocked||cancelable)&&(
              <div style={{display:'flex',gap:8,marginLeft:'auto',flexWrap:'wrap',position:'relative',zIndex:200}}>
                {phase==='ACTION'&&isVisualPlayerTurn&&!isBlocked&&(()=>{
                  // 对于其他职业，只要技能或休息中的任意一个被使用，那么两者都不能再使用
                  // 对于追猎者，只要休息被使用，就不能再使用技能；只要技能被使用，就不能再休息，但技能可以多次使用
                  const skillRole=gs.globalOnlySwapOwner!=null?'寻宝者':me.role;
                  const isHunter = skillRole === '追猎者';
                  const restLimited = gs.restUsed || gs.multiplyUsed || (isHunter ? gs.skillUsed : gs.skillUsed);
                  const skillRestLimited = isHunter ? (gs.restUsed || gs.multiplyUsed) : (skillLimited || gs.restUsed || gs.skillUsed || gs.multiplyUsed);
                  const hasBgy = me.hand.some(isBlackGoatYoung);
                  const multiplyLimited = gs.skillUsed || gs.restUsed || gs.multiplyUsed;
                  return(<>
                    {hasBgy&&(
                      <button onClick={()=>setGs({...gs,phase:'MULTIPLY_SELECT_TARGET',abilityData:{...gs.abilityData}})} disabled={multiplyLimited}
                        style={{
                          padding:isMobile?'5px 10px':'6px 14px',background:multiplyLimited?'#130a04':'#0e1a0e',
                          border:`1.5px solid ${multiplyLimited?'#2a1a08':'#2a5a2a'}`,
                          color:multiplyLimited?'#3a2510':'#4ade80',
                          fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:baseFontSizes.body,
                          borderRadius:2,cursor:multiplyLimited?'not-allowed':'pointer',letterSpacing:isMobile?0.5:1,
                          boxShadow:multiplyLimited?'none':'0 0 10px #4ade8044',
                          textTransform:'uppercase',opacity:multiplyLimited?0.4:1,
                        }}>
                        ☣ 繁衍
                        {multiplyLimited&&<span style={{fontSize:9,marginLeft:4,color:'#7a5a2a'}}>(已用)</span>}
                      </button>
                    )}
                    <button onClick={useAbility} disabled={skillRestLimited}
                      style={{
                        padding:isMobile?'5px 10px':'6px 16px',background:'#1c1208',
                        border:`1.5px solid ${skillRestLimited?'#3a2510':skillRi.col}`,
                        color:skillRestLimited?'#3a2510':skillRi.col,
                        fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:baseFontSizes.body,
                        borderRadius:2,cursor:skillRestLimited?'not-allowed':'pointer',letterSpacing:isMobile?0.5:1,
                        boxShadow:skillRestLimited?'none':`0 0 10px ${skillRi.col}44`,
                        textTransform:'uppercase',opacity:skillRestLimited?0.4:1,
                        position:'relative',
                      }}>
                      {skillRi.icon||ri.icon} {effectiveSkillName}
                      {skillRestLimited&&<span style={{fontSize:9,marginLeft:4,color:'#5a3020'}}>{gs.restUsed?'(已休息)':'(已用)'}</span>}
                    </button>
                    <button onClick={doRest} disabled={restLimited}
                      style={{
                        padding:isMobile?'5px 10px':'6px 14px',background:restLimited?'#130a04':'#0e1a0e',
                        border:`1.5px solid ${restLimited?'#2a1a08':'#2a5a2a'}`,
                        color:restLimited?'#3a2510':'#4ade80',
                        fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:baseFontSizes.body,
                        borderRadius:2,cursor:restLimited?'not-allowed':'pointer',letterSpacing:isMobile?0.5:1,
                        boxShadow:restLimited?'none':'0 0 10px #4ade8044',
                        textTransform:'uppercase',opacity:restLimited?0.4:1,
                      }}>
                      ♥ 休息
                      {restLimited&&<span style={{fontSize:9,marginLeft:4,color:'#7a5a2a'}}>(已用)</span>}
                    </button>
                    <button onClick={endTurn} style={{
                      padding:isMobile?'5px 10px':'6px 16px',background:'#180e08',
                      border:'1.5px solid #3a2510',color:'#a07838',
                      fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:baseFontSizes.body,
                      borderRadius:2,cursor:'pointer',letterSpacing:isMobile?0.5:1,textTransform:'uppercase',
                    }}>结束回合</button>
                  </>);
                })()}
                {showCancelBtn&&(
                  <button onClick={cancelAction} style={{
                    padding:'6px 18px',background:'#1a0c04',
                    border:'2px solid #d4832a',color:'#f0a855',
                    fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:11,
                    borderRadius:2,cursor:'pointer',letterSpacing:2,textTransform:'uppercase',
                    boxShadow:'0 0 14px #d4832a66,inset 0 0 6px #d4832a22',
                    position:'relative',zIndex:200,
                  }}>✕ 取消</button>
                )}
                {phase==='HUNT_CONFIRM'&&(!gs._isMP||isVisualPlayerTurn)&&!anim&&(
                  <button onClick={()=>huntConfirm(-1)} style={{
                    padding:'6px 18px',background:'#1a0c04',
                    border:'2px solid #d4832a',color:'#f0a855',
                    fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:11,
                    borderRadius:2,cursor:'pointer',letterSpacing:2,textTransform:'uppercase',
                    boxShadow:'0 0 14px #d4832a66,inset 0 0 6px #d4832a22',
                    position:'relative',zIndex:200,
                  }}>✕ 放弃追捕</button>
                )}
              </div>
            )}
            {phase==='DISCARD_PHASE'&&(
              <button onClick={confirmDiscard}
                disabled={!(gs.abilityData.discardSelected||[]).length}
                style={{
                  marginLeft:'auto',padding:'6px 18px',
                  background:(gs.abilityData.discardSelected||[]).length?'#3a1008':'#180e08',
                  border:`1.5px solid ${(gs.abilityData.discardSelected||[]).length?'#882020':'#3a2510'}`,
                  color:(gs.abilityData.discardSelected||[]).length?'#dd6060':'#3a2510',
                  fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:11,
                  borderRadius:2,cursor:'pointer',letterSpacing:1,textTransform:'uppercase',
                  opacity:(gs.abilityData.discardSelected||[]).length?1:0.4,
                }}>
                确认弃牌{(gs.abilityData.discardSelected||[]).length>0?` (${(gs.abilityData.discardSelected||[]).length})`:''}</button>
            )}
          </div>
          <div data-self-hand-strip style={{display:'flex',gap:7,flexWrap:'wrap'}}>
            {visualMe.hand.map((c,i)=>{
              const clickable=isMyCardClickable(c,i);
              const isMobileArmedGod=isMobile&&mobileArmedGodCardIdx===i;
              const isSel=(phase==='DISCARD_PHASE'&&(gs.abilityData.discardSelected||[]).includes(i))||isMobileArmedGod;
              const isMatch=phase==='HUNT_CONFIRM'&&gs.abilityData?.revCard&&cardsHuntMatch(c,gs.abilityData.revCard);
              const isGodUpgrade=c.isGod&&visualMe.godName===c.godKey&&(visualMe.godLevel||0)<3;
              const canUpgradeNow=isGodUpgrade&&phase==='ACTION'&&isVisualPlayerTurn;
              const canWorshipNow=c.isGod&&!isGodUpgrade&&phase==='ACTION'&&isVisualPlayerTurn&&!gs.godTriggeredThisTurn&&!gs.godFromHandUsed;
              const showWorshipHint=canWorshipNow&&(!isMobile||isMobileArmedGod);
              return(<div key={c.id} ref={el=>{if(el)mobileGodCardRefs.current.set(i,el);else mobileGodCardRefs.current.delete(i);}} style={{position:'relative',display:'inline-block'}}>
                <DDCard card={c} onClick={clickable?()=>handleMyCardClick(i):undefined} disabled={!clickable} selected={isSel} highlight={isMatch||canWorshipNow||canUpgradeNow} godLevel={visualMe.godName===c.godKey?visualMe.godLevel:0} compact={isMobile} holderId={0}/>
                {canUpgradeNow&&<div style={{position:'absolute',top:-7,left:'50%',transform:'translateX(-50%)',fontFamily:"'Cinzel',serif",fontSize:8,color:'#c8a96e',background:'#0a0705',border:'1px solid #8a6020',borderRadius:2,padding:'1px 4px',pointerEvents:'none',whiteSpace:'nowrap',zIndex:10}}>⬆ 升级邪神之力</div>}
                {showWorshipHint&&<div style={{position:'absolute',top:-7,left:'50%',transform:'translateX(-50%)',fontFamily:"'Cinzel',serif",fontSize:8,color:'#b080e0',background:'#0a0412',border:'1px solid #7040aa',borderRadius:2,padding:'1px 4px',pointerEvents:'none',whiteSpace:'nowrap',zIndex:10}}>⛧ 点击信仰</div>}
              </div>);
            })}
            {visualMe.hand.length===0&&<div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#7a5a2a',fontSize:13,padding:'22px 10px'}}>手中空空如也</div>}
          </div>
          {isMobile&&mobileArmedGodCard?.isGod&&mobileArmedGodTooltipRect&&<GodTooltip def={GOD_DEFS[mobileArmedGodCard.godKey]} godLevel={visualMe.godName===mobileArmedGodCard.godKey?visualMe.godLevel:1} position={mobileArmedGodTooltipRect}/>}
        </div>
      </div>
      {/* ── Overlays ── */}
      {createPortal(
        <>
          {!showTutorial&&<HoundsTimerBadge active={!!gs?.houndsOfTindalosActive} secondsLeft={houndsSecLeft}/>}
          <InGameTutorialOverlay
            showTutorial={showTutorial}
            tutorialStep={tutorialStep}
            vw={vw}
            panelRect={panelRect}
            roleTextRect={roleTextRect}
            handAreaRect={handAreaRect}
            aiPanelAreaRect={aiPanelAreaRect}
            deckAreaRect={deckAreaRect}
            isArtifact={isArtifact}
            setTutorialStep={setTutorialStep}
            completeTutorial={completeTutorial}
          />
        </>,document.body)}
      {roleRevealAnim&&<RoleRevealAnim role={roleRevealAnim.role} onDone={()=>_onRoleRevealDone(roleRevealAnim.pendingGs)}/>}
      {phase==='PLAYER_WIN_PENDING'&&!showTutorial&&(
        <TreasureMapAnim hand={me.hand} onConfirm={()=>{
          animQueueRef.current=[];
          pendingGsRef.current=null;
          setAnim(null);
          setGs({...gs,
            players:gs.players.map((p,i)=>i===0?{...p,roleRevealed:true,revealHand:true}:p),
            gameOver:{winner:'寻宝者',reason:gs.abilityData?.winReason||'你集齐了全部编号并获胜！',winnerIdx:0}});
        }}/>
      )}
      <style>{GLOBAL_STYLES}</style>
    </div>
    {/* GammaSlider, emoji picker, and combat overlays all outside the filtered container
         so that position:fixed uses the true viewport (filter on ancestor breaks fixed positioning) */}
    <GammaSlider gamma={gamma} onChange={handleGamma}/>
    {isLocalTestMode&&(
      <button
        type="button"
        onClick={()=>setLocalDebugMode(v=>!v)}
        style={{
          ...smallBtnStyle,
          position:'fixed',
          top:14,
          left:14,
          zIndex:120,
          fontSize:11,
          padding:'6px 10px',
          background:localDebugMode?'#2a1608':'#140e08',
          color:localDebugMode?'#f0cb7a':'#9b7641',
          borderColor:localDebugMode?'#7a5324':'#3a2510',
          boxShadow:localDebugMode?'0 0 14px #7a532455':'none',
        }}
      >
        {localDebugMode?'Debug: 开':'Debug: 关'}
      </button>
    )}
    {isMultiplayer&&showEmojiPicker&&createPortal(
      <>
        <div onClick={()=>setShowEmojiPicker(false)} style={{position:'fixed',inset:0,zIndex:49}}/>
        <div style={{
          position:'fixed',
          top:emojiButtonPos.top,
          right:emojiButtonPos.right,
          background:'#140e04',border:'1.5px solid #4a3010',borderRadius:4,
          padding:6,display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:3,
          boxShadow:'0 4px 20px #00000088',zIndex:50,
        }}>
          {EMOJI_LIST.map(e=>(
            <button key={e} onClick={ev=>{ev.stopPropagation();handleEmojiClick(e);}} style={{
              background:'none',border:'none',fontSize:20,cursor:'pointer',
              padding:'3px 2px',borderRadius:3,lineHeight:1,
              transition:'background 0.1s',
            }}
            onMouseEnter={ev=>ev.currentTarget.style.background='#3a2010'}
            onMouseLeave={ev=>ev.currentTarget.style.background='none'}
            >{e}</button>
          ))}
        </div>
      </>,
      document.body
    )}
    {/* 停服更新公告 */}
    {serverAnnouncement&&(
      <div style={{
        position: 'fixed',
        top: '10%',
        left: 0,
        right: 0,
        zIndex: 2000,
        textAlign: 'center',
        pointerEvents: 'none'
      }}>
        <div style={{
          display: 'inline-block',
          background: 'rgba(0, 0, 0, 0.8)',
          color: '#ff8000',
          padding: '8px 20px',
          borderRadius: '4px',
          fontFamily: "'Cinzel', serif",
          fontSize: '14px',
          whiteSpace: 'nowrap',
          animation: 'scrollLeft 30s linear infinite'
        }}>
          {serverAnnouncement}
        </div>
      </div>
    )}

    {/* All overlays with position:fixed + getBoundingClientRect() coordinates must render OUTSIDE the zoom container so viewport coords match */}
    {!suppressAnim&&<AnimOverlay anim={anim} exiting={animExiting}/>}
    {!suppressAnim&&<SwapCupOverlay active={!!swapAnim} casterName={swapAnim?.casterName||''} targetName={swapAnim?.targetName||''}/>}
    {flyingEmojis.map(fe=>(
      <FlyingEmoji key={fe.id} {...fe} onDone={id=>setFlyingEmojis(prev=>prev.filter(x=>x.id!==id))}/>
    ))}
    {!suppressAnim&&<HuntScopeOverlay active={!!huntAnim} cx={huntAnim?.cx??0} cy={huntAnim?.cy??0}/>}
    {!suppressAnim&&<BewitchEyeOverlay active={!!bewitchAnim} cx={bewitchAnim?.cx??0} cy={bewitchAnim?.cy??0}/>}
    {!suppressAnim&&guillotineTargets.length>0&&<GuillotineAnim targets={guillotineTargets}/>}
    {!suppressAnim&&<KnifeEffect targets={knifeTargets}/>}
    {!suppressAnim&&<SanMistOverlay targets={sanTargets}/>}
    {!suppressAnim&&<CardTransferOverlay transfers={cardTransfers}/>}
    {phase==='TREASURE_WIN'&&!showTutorial&&<TreasureMapAnim hand={me.hand} onConfirm={revealWin}/>}
    {phase==='GOD_RESURRECTION'&&!showTutorial&&<CthulhuResurrectionAnim onConfirm={revealWin}/>}
  </>);
}
// ══════════════════════════════════════════════════════════════
const smallBtnStyle={
  padding:'4px 12px',background:'#180e08',
  border:'1px solid #3a2510',color:'#a07838',
  fontFamily:"'Cinzel',serif",fontSize:10,borderRadius:2,cursor:'pointer',letterSpacing:1,
};

const GLOBAL_STYLES=`
  @import url('https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700&family=Cinzel:wght@400;600;700&family=IM+Fell+English:ital@0;1&display=swap');
  * { box-sizing:border-box; scrollbar-width:thin; scrollbar-color:#3a2510 #0a0705; }
  ::-webkit-scrollbar{width:5px;height:5px;}
  ::-webkit-scrollbar-track{background:#0a0705;}
  ::-webkit-scrollbar-thumb{background:#3a2510;border-radius:2px;}
  html,body{ overflow-x:hidden; }
  @keyframes scrollLeft {
    0% { transform: translateX(100%); }
    100% { transform: translateX(-100%); }
  }

  /* ── Mobile / small-screen overrides ── */
  @media (max-width:580px){
    /* Tighten global padding */
    body { font-size:13px; }
    /* Modals stay within viewport */
    [data-modal]{max-width:calc(100vw - 24px)!important;padding:20px 16px!important;}
    /* Phase bar text wrap */
    [data-phasebar]{font-size:10px!important;}
    /* Hand area tighter padding */
    [data-handarea]{padding:8px 9px!important;}
    /* Phase/status tooltip fit */
    [data-tooltip]{max-width:calc(100vw - 32px)!important;}
  }

  /* ── Prevent fixed overlays from cutting off on very small screens ── */
  @media (max-width:400px){
    body{font-size:12px;}
  }

  /* Generic overlay */
  @keyframes cardTravelToDeck {
    0%   {top:8%;right:6%;transform:scale(0.85);opacity:0.9}
    30%  {opacity:1}
    100% {top:50%;right:50%;transform:translate(50%,-50%) scale(1.1);opacity:1}
  }
  /* Card flies from deck (top-right) to a specific player panel */
  @keyframes cardTravelToPlayer {
    0%   {left:var(--src-x);top:var(--src-y);transform:translate(0,0) scale(0.85);opacity:0.9}
    30%  {opacity:1}
    100% {left:var(--dest-x);top:var(--dest-y);transform:translate(0,0) scale(1.0);opacity:1}
  }
  @keyframes animFadeIn  { from{opacity:0} to{opacity:1} }
  @keyframes animFadeOut { from{opacity:1} to{opacity:0} }
  @keyframes animPop     { 0%{transform:scale(0.5);opacity:0} 60%{transform:scale(1.1)} 100%{transform:scale(1);opacity:1} }
  @keyframes spinLoader  { to{transform:rotate(360deg)} }
  @keyframes toastIn     { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes animShake   { 0%,100%{transform:translateX(0)} 15%{transform:translateX(-12px)} 35%{transform:translateX(14px)} 55%{transform:translateX(-9px)} 75%{transform:translateX(9px)} }
  @keyframes animVig     { 0%,100%{opacity:0} 50%{opacity:1} }
  @keyframes animGlow    { 0%,100%{box-shadow:0 0 8px #c8a96e33} 50%{box-shadow:0 0 22px #c8a96e88} }
  @keyframes chainMove    { 0%{stroke-dashoffset: 20} 100%{stroke-dashoffset: 0} }
  @keyframes chainLinkDrift { 0%{transform:rotate(-3deg)} 100%{transform:rotate(3deg)} }
  @keyframes chainBreakFade { 0%{opacity:1} 35%{opacity:1} 100%{opacity:0} }
  @keyframes chainExpireFade { 0%{opacity:1} 100%{opacity:0} }
  @keyframes chainMainSnap { 0%{transform:scaleX(1)} 35%{transform:scaleX(0.88)} 100%{transform:scaleX(0.18);opacity:0} }
  @keyframes chainBindSnap { 0%{transform:translateX(0)} 20%{transform:translateX(-2px)} 40%{transform:translateX(2px)} 70%{transform:translateX(-1px)} 100%{transform:translateX(0);opacity:0} }
  @keyframes earthquakeShake { 0%,100%{transform:translateX(0)} 10%{transform:translateX(-8px)} 20%{transform:translateX(8px)} 30%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 50%{transform:translateX(-4px)} 60%{transform:translateX(4px)} 70%{transform:translateX(-2px)} 80%{transform:translateX(2px)} }
  @keyframes earthquakeFlash { 0%,100%{filter:grayscale(0%)} 50%{filter:grayscale(100%)} }
  @keyframes rockFall { 0%{top:-30px;opacity:1} 100%{top:100vh;opacity:0} }

  /* Card flip animation */
  @keyframes cardRise {
    0%   { transform:translateY(90px); opacity:0; }
    15%  { opacity:1; }
    75%  { transform:translateY(-4px); }
    100% { transform:translateY(0); opacity:1; }
  }
  @keyframes cardFlip {
    0%   { transform:rotateY(0deg); }
    25%  { transform:rotateY(480deg); }
    55%  { transform:rotateY(840deg); }
    80%  { transform:rotateY(1020deg); }
    100% { transform:rotateY(1080deg); }
  }
  @keyframes burstPulse {
    0%   { transform:scale(0.2); opacity:0; }
    30%  { opacity:1; }
    70%  { transform:scale(1.6); opacity:0.8; }
    100% { transform:scale(2.2); opacity:0; }
  }

  /* animPopInner — scale only (no translate), safe for flex-centered children */
  @keyframes animPopInner { 0%{transform:scale(0.5);opacity:0} 60%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }

  /* Benign sparkle particles */
  @keyframes particleRise { 0%{opacity:0;transform:translateY(0) scale(0.4)} 30%{opacity:0.9;} 100%{opacity:0;transform:translateY(-140px) scale(1.4)} }

  /* ── SMOKE SOULS: S-curve sway + widen as they rise ──
     translateX oscillates: 0→+12→-14→+8→0  (S-shape)
     scaleX grows (smoke disperses), translateY climbs, opacity fades */
  @keyframes smokeRise0 {
    0%  {opacity:0; transform:translateY(0)    translateX(0px)  scaleX(0.20) scaleY(0.3)}
    8%  {opacity:0.88;}
    22% {          transform:translateY(-190px) translateX(12px) scaleX(0.45) scaleY(0.72)}
    45% {          transform:translateY(-390px) translateX(-14px)scaleX(0.78) scaleY(0.90)}
    68% {opacity:0.55; transform:translateY(-570px) translateX(9px) scaleX(1.05) scaleY(1.0)}
    100%{opacity:0; transform:translateY(-800px) translateX(0px)  scaleX(1.60) scaleY(1.0)}
  }
  @keyframes smokeRise1 {
    0%  {opacity:0; transform:translateY(0)    translateX(0px)  scaleX(0.22) scaleY(0.28)}
    9%  {opacity:0.85;}
    24% {          transform:translateY(-210px) translateX(-13px)scaleX(0.50) scaleY(0.75)}
    48% {          transform:translateY(-420px) translateX(15px) scaleX(0.82) scaleY(0.92)}
    70% {opacity:0.52; transform:translateY(-605px) translateX(-8px)scaleX(1.10) scaleY(1.0)}
    100%{opacity:0; transform:translateY(-840px) translateX(0px)  scaleX(1.65) scaleY(1.0)}
  }
  @keyframes smokeRise2 {
    0%  {opacity:0; transform:translateY(0)    translateX(0px)  scaleX(0.18) scaleY(0.32)}
    7%  {opacity:0.90;}
    20% {          transform:translateY(-175px) translateX(14px) scaleX(0.42) scaleY(0.68)}
    44% {          transform:translateY(-370px) translateX(-12px)scaleX(0.74) scaleY(0.88)}
    66% {opacity:0.58; transform:translateY(-545px) translateX(7px) scaleX(0.98) scaleY(1.0)}
    100%{opacity:0; transform:translateY(-770px) translateX(0px)  scaleX(1.52) scaleY(1.0)}
  }
  @keyframes smokeRise3 {
    0%  {opacity:0; transform:translateY(0)    translateX(0px)  scaleX(0.25) scaleY(0.30)}
    10% {opacity:0.86;}
    26% {          transform:translateY(-215px) translateX(-15px)scaleX(0.54) scaleY(0.78)}
    50% {          transform:translateY(-445px) translateX(13px) scaleX(0.88) scaleY(0.93)}
    72% {opacity:0.50; transform:translateY(-635px) translateX(-9px)scaleX(1.12) scaleY(1.0)}
    100%{opacity:0; transform:translateY(-875px) translateX(0px)  scaleX(1.68) scaleY(1.0)}
  }
  @keyframes smokeRise4 {
    0%  {opacity:0; transform:translateY(0)    translateX(0px)  scaleX(0.21) scaleY(0.29)}
    8%  {opacity:0.87;}
    23% {          transform:translateY(-198px) translateX(11px) scaleX(0.48) scaleY(0.74)}
    46% {          transform:translateY(-400px) translateX(-13px)scaleX(0.80) scaleY(0.91)}
    69% {opacity:0.54; transform:translateY(-585px) translateX(8px) scaleX(1.06) scaleY(1.0)}
    100%{opacity:0; transform:translateY(-825px) translateX(0px)  scaleX(1.58) scaleY(1.0)}
  }

  /* Ghost faces: ride up with the smoke, appear at mid-point, vanish near top */
  /* Each tracks the same translateX S-wave as its smoke column */
  @keyframes ghostFace0 {
    0%  {opacity:0; transform:translateY(0)    translateX(0px)}
    10% {opacity:0;}
    32% {opacity:0; transform:translateY(-350px) translateX(-14px)}
    50% {opacity:0.70; transform:translateY(-540px) translateX(9px)}
    72% {opacity:0.55; transform:translateY(-680px) translateX(-5px)}
    100%{opacity:0; transform:translateY(-800px) translateX(0px)}
  }
  @keyframes ghostFace1 {
    0%  {opacity:0; transform:translateY(0)    translateX(0px)}
    12% {opacity:0;}
    35% {opacity:0; transform:translateY(-375px) translateX(15px)}
    52% {opacity:0.68; transform:translateY(-560px) translateX(-8px)}
    74% {opacity:0.52; transform:translateY(-700px) translateX(5px)}
    100%{opacity:0; transform:translateY(-840px) translateX(0px)}
  }
  @keyframes ghostFace2 {
    0%  {opacity:0; transform:translateY(0)    translateX(0px)}
    9%  {opacity:0;}
    30% {opacity:0; transform:translateY(-320px) translateX(-12px)}
    48% {opacity:0.72; transform:translateY(-510px) translateX(7px)}
    70% {opacity:0.56; transform:translateY(-660px) translateX(-4px)}
    100%{opacity:0; transform:translateY(-770px) translateX(0px)}
  }
  @keyframes ghostFace3 {
    0%  {opacity:0; transform:translateY(0)    translateX(0px)}
    13% {opacity:0;}
    36% {opacity:0; transform:translateY(-390px) translateX(13px)}
    54% {opacity:0.66; transform:translateY(-575px) translateX(-9px)}
    76% {opacity:0.50; transform:translateY(-725px) translateX(6px)}
    100%{opacity:0; transform:translateY(-875px) translateX(0px)}
  }
  @keyframes ghostFace4 {
    0%  {opacity:0; transform:translateY(0)    translateX(0px)}
    11% {opacity:0;}
    33% {opacity:0; transform:translateY(-355px) translateX(-11px)}
    51% {opacity:0.69; transform:translateY(-550px) translateX(8px)}
    73% {opacity:0.53; transform:translateY(-690px) translateX(-5px)}
    100%{opacity:0; transform:translateY(-825px) translateX(0px)}
  }

  /* ── FLOWER BLOOM — staggered scale+opacity per flower ── */
  @keyframes flowerBloom {
    0%   {opacity:0;   transform:scale(0) rotate(0deg)}
    40%  {opacity:1;   transform:scale(1.12) rotate(6deg)}
    65%  {opacity:0.98;transform:scale(0.96) rotate(-2deg)}
    80%  {opacity:0.97;transform:scale(1.04) rotate(1deg)}
    100% {opacity:0.90;transform:scale(1.0)  rotate(0deg)}
  }
  @keyframes flowerFade {
    0%  {opacity:0.90}
    60% {opacity:0.85}
    100%{opacity:0}
  }

  /* Swap cup shuffle */
  @keyframes swapBgFade {
    0%  {opacity:0} 15% {opacity:1} 75% {opacity:1} 100% {opacity:0}
  }
  @keyframes swapCupL {
    0%   {transform:translateX(0)} 
    20%  {transform:translateX(60px)} 
    45%  {transform:translateX(60px) translateY(-30px)} 
    70%  {transform:translateX(-60px) translateY(-30px)} 
    85%  {transform:translateX(-60px)}
    100% {transform:translateX(0)}
  }
  @keyframes swapCupR {
    0%   {transform:translateX(0)} 
    20%  {transform:translateX(-60px)} 
    45%  {transform:translateX(-60px) translateY(30px)} 
    70%  {transform:translateX(60px) translateY(30px)} 
    85%  {transform:translateX(60px)}
    100% {transform:translateX(0)}
  }
  @keyframes swapLabelPop {
    0% {opacity:0;transform:scale(0.5)} 40% {opacity:1;transform:scale(1.2)} 100% {opacity:1;transform:scale(1)}
  }

  /* Hunt scope */
  @keyframes huntVigFade {
    0% {opacity:0} 18% {opacity:1} 80% {opacity:1} 100% {opacity:0}
  }
  @keyframes huntScopeMove {
    0%   {transform:translate(calc(var(--wobX,18px)),calc(var(--wobY,-22px)))}
    15%  {transform:translate(-16px, 20px)}
    30%  {transform:translate(12px, -14px)}
    50%  {transform:translate(-8px, 10px)}
    70%  {transform:translate(4px, -5px)}
    85%  {transform:translate(0px, 0px)}
    100% {transform:translate(0px, 0px)}
  }
  @keyframes huntDotPulse {
    0%  {transform:scale(1);opacity:1}
    50% {transform:scale(2.2);opacity:0.8}
    100%{transform:scale(1);opacity:1}
  }

  /* Bewitch eye */
  @keyframes bewitchEyePulse {
    0%  {transform:scale(1);opacity:1}
    50% {transform:scale(1.45);opacity:0.9;filter:drop-shadow(0 0 22px rgba(220,110,255,1)) drop-shadow(0 0 40px rgba(180,60,255,0.8))}
    100%{transform:scale(1);opacity:1}
  }
  @keyframes bewitchEyeGhost {
    0%  {transform:scale(1);   opacity:0}
    8%  {transform:scale(1.05);opacity:0.80}
    30% {transform:scale(1.8); opacity:0.55}
    100%{transform:scale(4.5); opacity:0}
  }

  /* SAN Damage — full-screen blob from near-center to target panel */
  @keyframes sanMistMorph {
    0%   {border-radius:58% 42% 65% 35% / 48% 55% 45% 52%}
    18%  {border-radius:42% 58% 38% 62% / 62% 40% 60% 38%}
    35%  {border-radius:70% 30% 52% 48% / 38% 64% 36% 62%}
    52%  {border-radius:36% 64% 70% 30% / 55% 45% 58% 42%}
    68%  {border-radius:55% 45% 40% 60% / 42% 60% 40% 58%}
    85%  {border-radius:48% 52% 58% 42% / 65% 35% 62% 38%}
    100% {border-radius:52% 48% 45% 55% / 50% 55% 45% 50%}
  }
  @keyframes sanMistBolt {
    0%   {transform:translate(0,0) scaleX(1.0);                opacity:1}
    78%  {transform:translate(var(--tx),var(--ty)) scaleX(2.2);opacity:1}
    100% {transform:translate(var(--tx),var(--ty)) scaleX(0.3);opacity:0}
  }
  @keyframes sanMistImpact {
    0%   {opacity:0;   transform:scale(0.06)}
    32%  {opacity:1;   transform:scale(1.28)}
    65%  {opacity:0.85;transform:scale(1.00)}
    100% {opacity:0;   transform:scale(1.65)}
  }
  @keyframes sanMistShockwave {
    0%   {opacity:0.95; transform:scale(1)}
    55%  {opacity:0.60; transform:scale(6)}
    100% {opacity:0;    transform:scale(12)}
  }

  /* HP/SAN Heal — rising cross particles */
  @keyframes healCross {
    0%   {opacity:0;   transform:translateY(0)   scale(0.4)}
    20%  {opacity:1;   transform:translateY(-4px) scale(1.1)}
    70%  {opacity:0.8; transform:translateY(-10px) scale(1.0)}
    100% {opacity:0;   transform:translateY(-18px) scale(0.7)}
  }

  /* HP Damage — knife + blood */
  @keyframes knifeStrike {
    0%   {transform:translate(0,0) rotate(-45deg); opacity:1;}
    70%  {transform:translate(-60px,60px) rotate(-45deg) scale(1.15); opacity:1;}
    80%  {transform:translate(-64px,64px) rotate(-45deg) scale(1.1); opacity:1;}
    100% {transform:translate(-64px,64px) rotate(-45deg) scale(0.9); opacity:0;}
  }
  @keyframes knifeStrikeGlobal {
    0%   {transform:translate(0,0) rotate(calc(var(--angle) + 45deg)); opacity:1;}
    70%  {transform:translate(var(--tx),var(--ty)) rotate(calc(var(--angle) + 45deg)) scale(1.15); opacity:1;}
    80%  {transform:translate(var(--tx),var(--ty)) rotate(calc(var(--angle) + 45deg)) scale(1.1); opacity:1;}
    100% {transform:translate(var(--tx),var(--ty)) rotate(calc(var(--angle) + 45deg)) scale(0.9); opacity:0;}
  }
  @keyframes hitFlash { 0%{opacity:0} 20%{opacity:1} 100%{opacity:0} }
  @keyframes hitFlashGlobal { 0%{opacity:0} 20%{opacity:1} 100%{opacity:0} }
  @keyframes bloodDrop {
    0%   {opacity:0; transform:translateY(-12px) scale(0);}
    25%  {opacity:1; transform:translateY(0) scale(1);}
    70%  {opacity:0.8;}
    100% {opacity:0; transform:translateY(16px) scale(0.6);}
  }

  /* Screen shake on HP hit */
  @keyframes screenShakeAnim {
    0%,100%{transform:translateX(0)}
    15%{transform:translateX(-6px)}
    30%{transform:translateX(8px)}
    50%{transform:translateX(-5px)}
    70%{transform:translateX(6px)}
    85%{transform:translateX(-3px)}
  }
  @keyframes deathShakeAnim {
    0%,100%{transform:translate(0,0)}
    4%  {transform:translate(-14px,-10px)}
    8%  {transform:translate(18px,12px)}
    13% {transform:translate(-12px,-16px)}
    18% {transform:translate(20px,8px)}
    24% {transform:translate(-16px,-10px)}
    30% {transform:translate(14px,14px)}
    38% {transform:translate(-10px,-8px)}
    46% {transform:translate(12px,6px)}
    55% {transform:translate(-8px,-4px)}
    65% {transform:translate(6px,8px)}
    75% {transform:translate(-5px,-3px)}
    85% {transform:translate(4px,4px)}
    93% {transform:translate(-2px,-2px)}
  }
  @keyframes guillotineFall {
    0%   {transform:translateY(0)}
    100% {transform:translateY(var(--blade-dy))}
  }
  @keyframes guillotineFlash {
    0%   {opacity:1;transform:scale(1.08)}
    100% {opacity:0;transform:scale(0.96)}
  }
  @keyframes guillotineBloodFlash {
    0%   {opacity:1}
    60%  {opacity:0.6}
    100% {opacity:0}
  }
  @keyframes deathScreenShake {
    0%   {transform:translate(0,0) rotate(0deg)}
    8%   {transform:translate(-6px,-4px) rotate(-0.4deg)}
    16%  {transform:translate(7px,5px) rotate(0.5deg)}
    24%  {transform:translate(-8px,3px) rotate(-0.6deg)}
    32%  {transform:translate(6px,-6px) rotate(0.4deg)}
    40%  {transform:translate(-5px,4px) rotate(-0.3deg)}
    50%  {transform:translate(4px,-3px) rotate(0.25deg)}
    60%  {transform:translate(-3px,2px) rotate(-0.15deg)}
    75%  {transform:translate(2px,-1px) rotate(0.1deg)}
    100% {transform:translate(0,0) rotate(0deg)}
  }
  @keyframes deathFragmentFly {
    0%   {transform:translate(0,0) rotate(0deg) scale(1);opacity:1}
    18%  {opacity:1}
    100% {transform:translate(var(--stx),var(--sty)) rotate(var(--srot)) scale(0.22);opacity:0}
  }
  @keyframes deathSparkFly {
    0%   {transform:translate(0,0) scale(0.7);opacity:0}
    15%  {transform:translate(calc(var(--stx) * 0.18),calc(var(--sty) * 0.18)) scale(1);opacity:1}
    100% {transform:translate(var(--stx),var(--sty)) scale(0.2);opacity:0}
  }
  @keyframes deathShockRing {
    0%   {transform:scale(0.16);opacity:0.95}
    55%  {opacity:0.64}
    100% {transform:scale(7.4);opacity:0}
  }
  @keyframes deathDustBloom {
    0%   {transform:scale(0.72);opacity:0.9}
    60%  {opacity:0.42}
    100% {transform:scale(1.34);opacity:0}
  }
  @keyframes panelRupture {
    0%   {opacity:1;transform:scale(1)}
    18%  {opacity:1;transform:scale(1.04) rotate(-0.6deg)}
    45%  {opacity:0.88;transform:scale(0.98) rotate(0.9deg)}
    100% {opacity:0;transform:scale(0.86) rotate(-1.4deg)}
  }
  @keyframes guillotineVig {
    0%   {background:rgba(0,0,0,0)}
    20%  {background:rgba(0,0,0,0.45)}
    50%  {background:rgba(10,0,0,0.55)}
    100% {background:rgba(0,0,0,0)}
  }
  @keyframes sliceEffect {
    0%{transform:rotate(calc(var(--slice-angle,30deg) + var(--cut-tilt,0deg) * 0.35)) translateX(-100%)}
    50%{transform:rotate(calc(var(--slice-angle,30deg) + var(--cut-tilt,0deg) * 0.35)) translateX(0%)}
    100%{transform:rotate(calc(var(--slice-angle,30deg) + var(--cut-tilt,0deg) * 0.35)) translateX(100%)}
  }
  @keyframes sliceFlash {
    0%{opacity:0}
    50%{opacity:1}
    100%{opacity:0}
  }
  @keyframes bloodSpread {
    0%{opacity:0; transform:scale(0.8)}
    50%{opacity:1; transform:scale(1.2)}
    100%{opacity:0; transform:scale(1.5)}
  }
  @keyframes slideUp {
    0%{transform:rotate(0deg) translateY(0);opacity:1;filter:brightness(1)}
    28%{transform:rotate(calc(var(--pivot-rot) * 0.4)) translateY(-10px);opacity:0.96;filter:brightness(1.12)}
    100%{transform:rotate(var(--pivot-rot)) translateY(-30px);opacity:0;filter:brightness(0.55)}
  }
  @keyframes slideDown {
    0%{transform:rotate(0deg) translateY(0);opacity:1;filter:brightness(1)}
    24%{transform:rotate(calc(var(--pivot-rot) * 0.4)) translateY(10px);opacity:0.97;filter:brightness(1.14)}
    100%{transform:rotate(var(--pivot-rot)) translateY(30px);opacity:0;filter:brightness(0.55)}
  }
  @keyframes titleFlameSway {
    0%   {transform:translate(-50%,-50%) scale(var(--flame-scale,1)) rotate(-4deg)}
    25%  {transform:translate(calc(-50% + var(--flame-drift) * 0.3),calc(-50% - 2px)) scale(calc(var(--flame-scale,1) * 1.02)) rotate(3deg)}
    55%  {transform:translate(calc(-50% + var(--flame-drift)),calc(-50% - 4px)) scale(calc(var(--flame-scale,1) * 0.97)) rotate(-2deg)}
    80%  {transform:translate(calc(-50% + var(--flame-drift) * 0.15),calc(-50% - 1px)) scale(calc(var(--flame-scale,1) * 1.03)) rotate(4deg)}
    100% {transform:translate(-50%,-50%) scale(var(--flame-scale,1)) rotate(-4deg)}
  }
  @keyframes titleFlameFlicker {
    0%,100% {opacity:0.1; filter:brightness(0.2) saturate(0.4)}
    18%     {opacity:1;    filter:brightness(2.8) saturate(2.2)}
    39%     {opacity:0.05; filter:brightness(0.1) saturate(0.3)}
    61%     {opacity:1;    filter:brightness(2.5) saturate(2.0)}
    82%     {opacity:0.1;  filter:brightness(0.2) saturate(0.4)}
  }
  @keyframes titleFlameGlow {
    0%,100% {opacity:0.1; transform:translate(-50%,-58%) scale(0.6)}
    45%     {opacity:1;   transform:translate(-50%,-62%) scale(1.8)}
    70%     {opacity:0.2; transform:translate(-50%,-56%) scale(0.7)}
  }
  @keyframes titleFlameCore {
    0%,100% {opacity:0.2; transform:translate(-50%,-50%) scale(0.5)}
    35%     {opacity:1;   transform:translate(-50%,-54%) scale(1.8)}
    72%     {opacity:0.2; transform:translate(-50%,-48%) scale(0.6)}
  }
  @keyframes flameSpriteSheet {
    0% {backgroundPosition:0 0;}
    100% {backgroundPosition:-192px -336px;}
  }
  @keyframes tentacleEmerge {
    0%   {transform:translate(-50%, 0) scaleY(0); opacity:0}
    100% {transform:translate(-50%, 0) scaleY(1); opacity:1}
  }
  @keyframes pulse {
    0%,100% {opacity:0.6; transform:scale(1)}
    50%     {opacity:1;   transform:scale(1.1)}
  }

  /* Discard card fly — hand (bottom-centre) → discard pile (centre-left area) */
  @keyframes cardTransferFly {
    0%   { transform: translate(0,0) scale(1)   rotate(0deg);   opacity:1 }
    45%  { transform: translate(calc(var(--tx)*0.55), calc(var(--ty)*0.55)) scale(1.12) rotate(-12deg); opacity:1 }
    100% { transform: translate(var(--tx), var(--ty)) scale(0.72) rotate(-22deg); opacity:0 }
  }

  @keyframes discardCardFly {
    0%   {bottom:14%;left:50%;transform:translateX(-50%) scale(1);opacity:1}
    40%  {bottom:36%;left:38%;transform:translateX(-50%) scale(1.08) rotate(-8deg);opacity:1}
    100% {bottom:44%;left:28%;transform:translateX(-50%) scale(0.85) rotate(-18deg);opacity:0.7}
  }
  @keyframes discardCardFlyFromAI {
    0%   {transform:translate(-50%, -50%) scale(1);opacity:1}
    40%  {transform:translate(calc(-50% - 12vw), calc(-50% - 22vh)) scale(1.08) rotate(-8deg);opacity:1}
    100% {transform:translate(calc(-50% - 22vw), calc(-50% - 30vh)) scale(0.85) rotate(-18deg);opacity:0.7}
  }
  @keyframes discardCardFlyCustom {
    0%   {transform:translate(-50%, -50%) scale(1) rotate(0deg);opacity:1}
    40%  {transform:translate(calc(-50% + var(--tx) * 0.4), calc(-50% + var(--ty) * 0.4)) scale(1.08) rotate(-8deg);opacity:1}
    100% {transform:translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(0.85) rotate(-18deg);opacity:0.7}
  }
  @keyframes discardBgFade {
    0%   {opacity:0}
    20%  {opacity:1}
    80%  {opacity:0.8}
    100% {opacity:0}
  }

  /* Turn indicator */
  @keyframes turnIndicatorFade {
    from{opacity:0;transform:translateX(-50%) translateY(-8px)}
    to  {opacity:1;transform:translateX(-50%) translateY(0)}
  }
  @keyframes yourTurnFade {
    0%  {opacity:0; transform:scale(0.88)}
    18% {opacity:1; transform:scale(1.04)}
    38% {opacity:1; transform:scale(1.0)}
    75% {opacity:1; transform:scale(1.0)}
    100%{opacity:0; transform:scale(1.05)}
  }
  @keyframes caveDuelCardPath {
    0% { transform: translate(var(--fromX), var(--fromY)) rotate(-9deg) scale(0.92); opacity: 0; }
    12% { opacity: 1; }
    38% { transform: translate(var(--midX), var(--midY)) rotate(0deg) scale(1.04); opacity: 1; }
    68% { transform: translate(var(--midX), var(--midY)) rotate(0deg) scale(1.04); opacity: 1; }
    100% { transform: translate(var(--toX), var(--toY)) rotate(6deg) scale(0.95); opacity: 1; }
  }
  @keyframes caveDuelScorePop {
    0% { opacity: 0; transform: translateY(10px) scale(0.7); }
    35% { opacity: 1; transform: translateY(0) scale(1.08); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes caveDuelVsPop {
    0% { opacity: 0; transform: translateX(-50%) scale(0.4); }
    40% { opacity: 1; transform: translateX(-50%) scale(1.12); }
    100% { opacity: 0.92; transform: translateX(-50%) scale(1); }
  }
  @keyframes caveDuelDancePop {
    0% { opacity: 0; transform: translateY(10px) rotate(-8deg) scale(0.6); }
    30% { opacity: 1; transform: translateY(0) rotate(8deg) scale(1.12); }
    55% { opacity: 1; transform: translateY(-2px) rotate(-7deg) scale(1); }
    80% { opacity: 1; transform: translateY(0) rotate(7deg) scale(1.04); }
    100% { opacity: 0.96; transform: translateY(0) rotate(-4deg) scale(1); }
  }
  @keyframes treasureAssemble {
    0%   {opacity:0; transform:translate(var(--ox),var(--oy)) scale(0.55) rotate(-8deg)}
    60%  {opacity:1; transform:translate(0,0) scale(1.06) rotate(1deg)}
    100% {opacity:1; transform:translate(0,0) scale(1) rotate(0deg)}
  }
  @keyframes treasureScatter {
    0%,100% {opacity:0; transform:translate(var(--ox),var(--oy)) scale(0.5)}
  }
  @keyframes turnIndicatorPulse {
    0%,100%{opacity:0.55;filter:brightness(0.85)}
    50%    {opacity:1;   filter:brightness(1.35)}
  }

  /* God Resurrection — blood drip text effect */
  .blood-drip-text {
    position: relative;
  }
  .blood-drop {
    position: absolute;
    bottom: -8px;
    width: 6px;
    height: 12px;
    background: linear-gradient(180deg, #8a1a1a 0%, #c01030 50%, #600000 100%);
    border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
    opacity: 0;
    animation: bloodDripFall 2s ease-in infinite;
    box-shadow: 0 0 8px #c0103088;
  }
  @keyframes bloodDripFall {
    0%   { opacity: 0; transform: translateY(0) scale(0.5); }
    10%  { opacity: 1; transform: translateY(5px) scale(1); }
    60%  { opacity: 0.8; transform: translateY(35px) scale(0.9); }
    90%  { opacity: 0.3; transform: translateY(55px) scale(0.6); }
    100% { opacity: 0; transform: translateY(70px) scale(0.3); }
  }
`;
