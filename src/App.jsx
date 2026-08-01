import React, { lazy, Suspense, useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import { GodChoiceModal, NyaBorrowModal, DrawRevealModal, TreasureDodgeModal, PeekHandModal, TortoiseOracleModal, FullLogModal } from './components/modals';
import { DecipherStoneCarvingOverlay } from './components/modals/DecipherStoneCarvingOverlay';
import { HoundsTimerBadge, StatBar, DiscardPile, HealCrossEffect, DeckPile, InspectionPile, PileDisplay, PlayerPanel } from './components/board';
import { RoomModal, LobbyModal, PrivacyToggleModal, TutorialOverlay, ConnectionErrorModal, DebugControls } from './components/lobby';
import { BattleLogPanel } from './components/log/BattleLogPanel';
import { LoadingPentagramSpinner } from './components/LoadingPentagramSpinner';
import { BattlePhaseBar } from './components/phase/BattlePhaseBar';
import InGameTutorialOverlay from './components/tutorial/InGameTutorialOverlay';
import SoftGuideOverlay from './components/tutorial/SoftGuideOverlay';
import { BattleScreen } from './components/battle';
import { StartScreen } from './components/start/StartScreen';
import { ThemeCornerOrnament, ThemeEdgeRelief } from './components/theme/ThemeOrnaments';
import { buildPublicUrl } from './utils/url';
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
  createTsathogguaSlimeCard,
} from "./constants/card";
import { getBattleBackgroundImage, getBattlePredecodeImages, getBattleTheme } from './constants/theme';
import { buildPhaseUiState } from './game/phaseUi';
import {
  canClickHandCard as canClickHandCardByAvailability,
  canRespondWithAnyHandCard as canRespondWithAnyHandCardByAvailability,
  canRespondWithFireHandCard as canRespondWithFireHandCardByAvailability,
  canRespondWithZoneCard as canRespondWithZoneCardByAvailability,
  canUseTutorialHandCard,
  getRestActionBlockReason,
} from './game/interactionAvailability';

// 导入拆分出的游戏工具模块（通过 game/index.js 统一导出）
import {
  shuffle,
  clamp,
  copyPlayers,
  isZoneCard,
  isDodgeableZoneCard,
  getZoneCardEffectScope,
  isWinHand,
  localTreasureWinLog,
  localTreasureWinReason,
  cardLogText,
  removeCardsFromDiscard,
  makeInspectionMeta,
  clearPendingAnimDeathFlags,
  killPlayerState,
  tryVritraImmortal,
  applyHpDamageWithLink,
  submitDamageEvents,
  resolvePendingDamageLinkBreak,
  applyFx,
  applySanLossToPlayerWithInspection,
  applyInspectionForSanLoss,
  processInspectionTargets,
  aiChooseRevealCard,
  aiChooseHunterLootCards,
  chooseFirstComePickForAI,
  chooseAiRoseThornTarget,
  shouldHunterKeepChasing,
  initGame,
  applySelectedLocalRole,
  EXPANSION_RANDOM_KEY,
  RINFO,
  ROLE_TREASURE,
  ROLE_HUNTER,
  ROLE_CULTIST,
  buildAnimQueue,
  buildFullHandSwapTransferQueueFromLogs,
  buildAiHuntEventAnimQueue,
  getAiPreHuntActionSteps,
  withClearedTurnAnimFields,
  withClearedReplayAnimFields,
  buildTurnStartDrawReplayQueue,
  buildTurnStartPreDrawEffectQueue,
  buildSkippedTurnReplayQueue,
  buildTsathogguaSlimeGrantQueue,
  cardsHuntMatch,
  moveEligibleBlankZones,
  isBlackGoatYoung,
  isTsathogguaSlime,
  isRevealedCultist,
  canRevealForHunt,
  hasHuntRevealableCard,
  buildTsathogguaSlimeBalanceDecision,
  aiStep,
  TUTORIAL_FLOW,
  getTutorialStep,
  createTutorialScenario,
  shouldAllowTutorialAction,
  nextTutorialStepAfterAction,
  applyTutorialStepState,
  clearTutorialWinState,
  startNextTurn as _startNextTurn,
  continueTurnStartAfterDamageReaction,
  grantTsathogguaSlimeAtEndTurn,
  checkWin,
  playerDrawCard,
  aiDrawAndApply,
  resolveGodEncounterForAI,
  resolveAiGodChoiceTransition,
  shouldTriggerGodResurrection,
  abandonGodFollower,
  convertGodFollower,
  buildZhuLight,
  getZhuDrawHiddenCardId,
  getZhuLitDeckCards,
  getZhuTopGuard,
  removeZhuLightCard,
  moveTopDeckCardToBottom,
  resolveMpTimeoutToAction,
  resolveMpAiTakeoverState,
  applyStatEventsToDisplayStats,
  buildStatEvents,
  getEndTurnEvents,
  END_TURN_EVENT,
  resolveEndTurn,
  END_TURN_DECISION,
  resolvePostDiscardEndTurn,
  discardCardsFromHand,
  discardCardsFromHandFromRight,
  resolveRestTurnEnd,
  hasEndTurnReplayHandEvent,
  buildEndTurnReplayStartState,
  buildEndTurnReplayGodEncounter,
  buildEndTurnReplayZoneDraw,
  buildEndTurnReplayFinishedState,
  endlessCorridorTunnelStep,
  getCurrentEndTurnReplayCard,
  advanceEndTurnReplayPatch,
  deriveEffectDecisionState,
  hasEffectDecisionState,
  getApophisNightForLevel,
  buildApophisNightLog,
  resolveApophisTarget as resolveApophisTargetRule,
  buildApophisTargetQueueForState,
  mergeApophisTargetQueue,
  applyBalanceDiscardSideEffects,
  canGodPowerAffect,
  hasGodPowerImmunity,
  buildGodPowerBlockedLog,
  appendPublicCardGainTriggers,
  getBestCaveDuelCardIndex,
  resolveCaveDuelOutcome,
  resolveHandCardSelection,
  buildWorshipFromHandLog,
  buildProliferatingZDrawFlow,
  clearBlindZoneDecisionFlag,
  drawCardDecisionText,
  revealBlindDrawCard,
  getCthRestDrawRemaining,
  buildCthRestDrawFinishedState,
  getTurnStartDrawnCard,
  getTurnStartDrawerIdx,
  shouldReplaySinglePlayerAiTurnStart,
  buildSinglePlayerAiTurnStartReplayContext,
  createTimedOutDrawDiscardEvent,
  createGodPowerBlockedEvent,
  createCardEffectEvent,
  buildTurnStartDrawVisualEvents,
  buildFreshStatVisualEvents,
  getCurrentExecutionTurnOwner,
  grantTurnScopedGodPowerImmunity,
  createEndlessCorridorReplayEvent,
  createBewitchGiftEvent,
  createSwapCardsEvent,
  createHuntTargetEvent,
  createHuntRevealEvent,
  createHuntResultEvent,
  createSphinxResultEvent,
  buildHuntRevealStepFromVisualEvents,
  buildHuntRevealStepFromVisualEvent,
  markConsumedVisualEvents,
  pruneConsumedVisualEvents,
  chooseAiEtherealizeRedirectTarget,
  shouldAiUseEtherealize,
  appendConfirmedChainLoss,
  buildEtherealizeRedirectChainLoss,
  collectEtherealizeChainSettleLosses,
  getNextEtherealizeChainDecision,
  buildTargetContinuationAbilityData,
  buildTargetContinuationState,
  getTargetContinuationRoute,
  TARGET_CONTINUATION_ROUTE,
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
  isLocalEtherealizeTargetPhase,
  canLocalActOnTargetSelectionPhase,
  isLocalSwapGivePhase,
  isLocalBewitchCardPhase,
  isLocalTortoiseSelectPhase,
  isLocalHuntConfirmPhase,
  isLocalPublicCardPickPhase,
  isLocalHuntTargetSeat,
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
  isStatLog,
  isTurnStartLog,
  prepareAnimQueueLogs,
} from "./game/animLogs";
import {
  buildAiHuntWaitPresentation,
  buildAiTurnRecoveryState,
  buildRoseThornSnapshot,
  clearPendingAnimDeathPlayers,
  collectExplicitAiTurnLogs,
  finalizeAiPresentationState,
  stripAiPresentationFields,
} from './game/aiTurnPresentation';
import {
  resolveTurnHighlightForStep,
  buildBewitchForcedCardQueue,
  buildInspectionEventFlow,
  buildInspectionAwareAnimQueue,
  statePatchStep,
  prepareWorshipHighlight,
  mergePlayerStatsIntoSnapshot,
  zhuHideCardStep,
  buryToDeckStep,
  cardTransferStep,
  buildSphinxResultQueue,
  fullHandSwapSteps,
  swapCardsSteps,
} from "./game/animQueueHelpers";
import { _getZoomCompensatedRect, getPlayerHandAnchorCenter } from './utils/dom';
import {
  FIRST_BATTLE_DONE_KEY,
  getRuntimeServerUrl,
  getRuntimeSocketPath,
  isH5PackagedRuntime,
  isLocalDebugEnabled,
  isLocalTestHost,
  safeLS,
} from './utils/runtime';
import { ANIM_DURATION, ANIM_SPEED_SCALE, CARD_REVEAL_DURATION, ANIM_STEP_GAP } from './components/anim/constants';
import { SMOKE_COLS, FLOWER_CONFIGS, DICE_FACES, ANIM_CFG } from './components/anim/data';
import { CardFlipAnim } from './components/anim/CardFlipAnim';
import { GodHighlightBurst } from './components/anim/GodHighlightBurst';
import { KnifeEffect, GuillotineAnim, PetrifyAnim } from './components/anim/DamageEffects';
import { CardTransferOverlay, DiscardMoveOverlay, HuntRevealedCardBadge } from './components/anim/MoveOverlays';
import { GenericAnimOverlay, DiceRollAnim, YourTurnAnim } from './components/anim/GenericAnimOverlay';
import { PaperCupSVG, SwapCupOverlay, HuntScopeOverlay, BewitchEyeOverlay, SanMistOverlay } from './components/anim/SkillOverlays';
import { CaveDuelAnim } from './components/anim/AreaCardOverlays';
import { DamageLinkOverlay } from './components/anim/DamageLinkOverlay';
import { GLOBAL_STYLES } from './components/GlobalStyles';
import { GodResurrectionAnim, TreasureMapAnim, RoleRevealAnim } from './components/anim/WinAnims';
import { GlobalAnimLayer } from './components/anim/GlobalAnimLayer';
import { loadEffectImage } from './components/anim/effectNoise';
import { ApophisNightBadge } from './components/anim/ApophisOverlays';
import { formatFileSize, useResourcePreload } from './hooks/useResourcePreload';
import { useMultiplayerLobby } from './hooks/useMultiplayerLobby';
import { useAnimationQueue } from './hooks/useAnimationQueue';
import { useGlobalShakeEffects } from './hooks/useGlobalShakeEffects';
import { useCardTransferAnimationEffects } from './hooks/useCardTransferAnimationEffects';
import { useDamageAnimationEffects } from './hooks/useDamageAnimationEffects';
import { useAnimationAudioEffects } from './hooks/useAnimationAudioEffects';
import { useSkillAnimationEffects } from './hooks/useSkillAnimationEffects';
import { useDamageLinkGhosts } from './hooks/useDamageLinkGhosts';
import { useBattleResponsiveLayout } from './hooks/useBattleResponsiveLayout';
import { useDebugSettings } from './hooks/useDebugSettings';
import { useGamePreferences } from './hooks/useGamePreferences';
import { getDebugRoleComposition } from './components/lobby/debugSettingsModel';
import { useServerAnnouncement } from './hooks/useServerAnnouncement';
import { DESIGN_WIDTH } from './utils/scale';
import { useGameAudio } from './hooks/useGameAudio';
import { useAiWatchdog, BAD_PHASES } from './hooks/useAiWatchdog';
import { executeAiTurnStep, useAiTurnController } from './hooks/useAiTurnController';
import { useRoomCountdown } from './hooks/useRoomCountdown';
import { useMpCthDecisionTimer, useMpDecisionTimer, useMpDiscardTimer, useMpHuntRevealTimer, useMpTurnTimer } from './hooks/useMultiplayerTimers';
import { useVisualDiscardSync } from './hooks/useVisualDiscardSync';
import { advanceGodEncounter, formatGodEncounterProgress } from './game/balancePatches';
import { useMultiplayerConnection } from './multiplayer/useMultiplayerConnection';
import { buildPlayerWinWaitState, useMultiplayerStateBroadcast } from './multiplayer/useMultiplayerStateBroadcast';
import { useMultiplayerEmojiSender, useWaitingRoomReconnect } from './multiplayer/useMultiplayerUiSession';
import {
  getPendingZhuHideCardForState,
  isLocalZhuHideDecisionPhase,
  isMultiplayerReplayBusy,
  processIncomingMultiplayerStateSync,
} from './multiplayer/multiplayerRemoteReplayExecutor';
import { Ellipsis } from './components/ui/Ellipsis';
import { FlyingEmoji } from './components/ui/FlyingEmoji';
import { EMOJI_LIST } from './components/ui/emojiData';
import { GammaSlider } from './components/ui/GammaSlider';
import { TargetSelectOverlay } from './components/ui/TargetSelectOverlay';
import {
  SOFT_GUIDE_DEFS,
  SOFT_GUIDE_IDS,
  SOFT_GUIDE_STORAGE_KEY,
  canPresentSoftGuide,
  getFirstRestingPlayerIndex,
  getQueuedSoftGuideId,
  hasPendingTurnStartPresentation,
  markAllSoftGuidesDone,
  markSoftGuideDone,
  parseSoftGuideDone,
  serializeSoftGuideDone,
  shouldTriggerRestSoftGuide,
} from './game/softGuides';

const AboutModal = lazy(() => import('./components/modals').then(m => ({ default: m.AboutModal })));
const RoadmapModal = lazy(() => import('./components/modals').then(m => ({ default: m.RoadmapModal })));

// ══════════════════════════════════════════════════════════════
//  UTILITIES
// ══════════════════════════════════════════════════════════════
const ZONE_CARD_KEYS = LETTERS.flatMap(L => NUMS.map(N => `${L}${N}`));
function getBattleBackgroundStyle(expansionKey,isMobile){
  const url=buildPublicUrl(getBattleBackgroundImage(expansionKey));
  const theme=getBattleTheme(expansionKey);
  const isStarsCall=expansionKey==='群星呼唤';
  return {
    '--toe-bg':theme.bg,
    '--toe-text':theme.text,
    '--toe-strong':theme.strong,
    '--toe-muted':theme.muted,
    '--toe-panel':theme.panel,
    '--toe-panel-active':theme.panelActive,
    '--toe-line':theme.line,
    '--toe-line-dim':theme.lineDim,
    '--toe-glow':theme.glow,
    '--toe-accent':theme.accent,
    '--toe-battle-bg-image':`linear-gradient(180deg,${theme.tintTop},${theme.tintBottom}), url('${url}')`,
    '--toe-battle-bg-size':isStarsCall?'cover, auto 100%':'cover, cover',
    '--toe-battle-bg-position':'center center, center center',
    '--toe-battle-bg-repeat':isStarsCall?'no-repeat, repeat-x':'no-repeat, no-repeat',
    '--toe-battle-bg-attachment':isMobile?'scroll, scroll':'fixed, fixed',
    backgroundColor:theme.bg,
  };
}

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
  const cleanInputGs = Array.isArray(gs?._visualEvents) && gs._visualEvents.length
    ? { ...gs, _visualEvents: [] }
    : gs;
  const nextGs = _startNextTurn(cleanInputGs, { isDebugMode: isLocalDebugEnabled() });
  // 输入的 _visualEvents 已在 cleanInputGs 清空，故 nextGs._visualEvents 只含本回合引擎新产生的
  // 效果型视觉事件（如强制摸到「地动山摇」的 earthquake），必须保留，再叠加回合开始/摸牌/属性事件。
  const engineVisualEvents = Array.isArray(nextGs._visualEvents) ? nextGs._visualEvents : [];
  const visualEvents = [
    ...buildTurnStartDrawVisualEvents(nextGs),
    ...buildFreshStatVisualEvents(nextGs, maxKnownStatEventSeq(gs)),
    ...engineVisualEvents,
  ];
  return visualEvents.length
    ? { ...nextGs, _visualEvents: visualEvents }
    : nextGs;
}

function maxStatEventSeqFromSteps(steps=[]){
  return (Array.isArray(steps)?steps:[]).reduce((max,step)=>{
    const localMax=(Array.isArray(step?.statEvents)?step.statEvents:[]).reduce(
      (m,event)=>Number.isFinite(event?.seq)?Math.max(m,event.seq):m,
      0
    );
    return Math.max(max,localMax);
  },0);
}

function maxKnownStatEventSeq(state){
  const explicit=Number.isFinite(state?._statEventSeq)?state._statEventSeq:0;
  const fromEvents=(Array.isArray(state?._statEvents)?state._statEvents:[]).reduce(
    (max,event)=>Number.isFinite(event?.seq)?Math.max(max,event.seq):max,
    0
  );
  const fromVisual=(Array.isArray(state?._visualEvents)?state._visualEvents:[]).reduce(
    (max,event)=>{
      const local=(Array.isArray(event?.statEvents)?event.statEvents:[]).reduce(
        (m,statEvent)=>Number.isFinite(statEvent?.seq)?Math.max(m,statEvent.seq):m,
        0
      );
      return Math.max(max,local);
    },
    0
  );
  return Math.max(explicit,fromEvents,fromVisual);
}

function maxStatEventSeqForLogs(state, logs=[]){
  const logSet=new Set((Array.isArray(logs)?logs:[]).filter(Boolean));
  if(!logSet.size)return 0;
  return (Array.isArray(state?._statEvents)?state._statEvents:[]).reduce(
    (max,event)=>event?.logHint&&logSet.has(event.logHint)&&Number.isFinite(event?.seq)
      ?Math.max(max,event.seq)
      :max,
    0
  );
}

function statEventSeqBeforeTurnStartStats(state, fallbackSeq=0){
  const statLogs=new Set(getTurnStartStatLogs(state));
  if(!statLogs.size)return fallbackSeq;
  const seqs=(Array.isArray(state?._statEvents)?state._statEvents:[])
    .filter(event=>event?.logHint&&statLogs.has(event.logHint)&&Number.isFinite(event.seq))
    .map(event=>event.seq);
  if(!seqs.length)return fallbackSeq;
  return Math.min(fallbackSeq, Math.max(0, Math.min(...seqs)-1));
}

function parseBewitchGiftLabel(logLine=''){
  const bracketLabel=logLine.match(/赠予 \[([^\]]+)\]/)?.[1];
  if(bracketLabel)return bracketLabel.trim();
  const plainLabel=logLine.match(/赠予 ([^，。！!]+)/)?.[1];
  return plainLabel?.trim()||'';
}

function findCardInPlayerZonesByLabel(players=[],label=''){
  if(!label)return null;
  for(const player of players||[]){
    const zones=[player?.hand,player?.godZone,player?.zoneCards].filter(Array.isArray);
    for(const zone of zones){
      const found=zone.find(card=>card?.key===label||card?.name===label||card?.godKey===label);
      if(found)return found;
    }
  }
  return null;
}

function getTurnStartDrawBaselineLog(state){
  const log=Array.isArray(state?.log)?state.log:[];
  const animatedLogCount=[
    ...(state?._turnStartLogs||[]),
    ...(state?._drawLogs||[]),
    ...(state?._statLogs||[]),
  ].length;
  return animatedLogCount>0?log.slice(0,Math.max(0,log.length-animatedLogCount)):log;
}

function appendLogTailWithOverlap(base=[],tail=[]){
  const left=Array.isArray(base)?base.filter(line=>line!=null):[];
  const right=Array.isArray(tail)?tail.filter(line=>line!=null):[];
  if(!right.length)return left;
  const max=Math.min(left.length,right.length);
  let overlap=0;
  for(let n=max;n>0;n--){
    let same=true;
    for(let i=0;i<n;i++){
      if(left[left.length-n+i]!==right[i]){same=false;break;}
    }
    if(same){overlap=n;break;}
  }
  return [...left,...right.slice(overlap)];
}

function buildCompleteGameOverLog(state,visibleLog=[]){
  if(!state?.gameOver)return Array.isArray(state?.log)?state.log:[];
  let log=Array.isArray(state.log)?[...state.log]:[];
  const visible=Array.isArray(visibleLog)?visibleLog:[];
  if(visible.length>log.length)log=appendLogTailWithOverlap(log,visible);
  log=appendLogTailWithOverlap(log,[
    ...(state._turnStartLogs||[]),
    ...(state._drawLogs||[]),
    ...(state._statLogs||[]),
  ]);
  const reason=state.gameOver?.reason;
  if(reason&&!log.includes(reason))log=[...log,reason];
  return log;
}

function buildVisibleLogForLocalViewer(log,state){
  const base=Array.isArray(log)?log:[];
  const swapEvents=(Array.isArray(state?._visualEvents)?state._visualEvents:[])
    .filter(event=>event?.type==='swapCards'&&event.targetIdx===0&&event.takenCard&&event.givenCard);
  if(!swapEvents.length)return base;
  let result=[...base];
  swapEvents.forEach(event=>{
    const sourceName=event.sourceName||state?.players?.[event.sourceIdx]?.name||'对方';
    const sourceLabel=event.sourceLabel||`${sourceName}（寻宝者）`;
    const takenText=cardLogText(event.takenCard,{alwaysShowName:true});
    const givenText=cardLogText(event.givenCard,{alwaysShowName:true});
    const privateLines=[
      `你的手牌${takenText}被暗抽`,
      `${sourceLabel}给你一张${givenText}`,
    ];
    if(privateLines.every(line=>result.includes(line)))return;
    const localName=state?.players?.[0]?.name;
    const startIdx=result.findIndex(line=>
      typeof line==='string' &&
      line.includes('【掉包】') &&
      (line.includes('对 你') || (localName && line.includes(`对 ${localName}`)))
    );
    if(startIdx>=0){
      result=[
        ...result.slice(0,startIdx+1),
        ...privateLines,
        ...result.slice(startIdx+1),
      ];
    }
  });
  return result;
}

function getTurnStartStatLogs(state){
  const log=Array.isArray(state?.log)?state.log:[];
  const turnStartLogs=Array.isArray(state?._turnStartLogs)?state._turnStartLogs:[];
  if(!turnStartLogs.length)return [];
  const turnStartIdx=log.lastIndexOf(turnStartLogs[0]);
  if(turnStartIdx<0)return [];
  const delta=log.slice(turnStartIdx);
  const drawLogs=Array.isArray(state?._drawLogs)?state._drawLogs:[];
  const firstDrawIdx=drawLogs.length?delta.findIndex(line=>line===drawLogs[0]):-1;
  const beforeDrawLogs=firstDrawIdx>=0?delta.slice(0,firstDrawIdx):delta;
  return subtractLogOccurrences(beforeDrawLogs,turnStartLogs);
}

function buildTurnStartStatQueue(state){
  if(!state?._preTurnPlayers||!state?._playersBeforeThisDraw)return [];
  const statLogs=getTurnStartStatLogs(state);
  const statEvents=buildStatEvents(
    state._preTurnPlayers,
    state._playersBeforeThisDraw,
    statLogs,
    {reason:'回合开始',seq:1}
  );
  if(!statEvents.length)return [];
  const oldGs={
    ...state,
    players:state._preTurnPlayers,
    log:[],
    _statEventSeq:0,
    _statEvents:[],
    _inspectionEvents:[],
  };
  const newGs={
    ...state,
    players:state._playersBeforeThisDraw,
    log:statLogs,
    _statEventSeq:1,
    _statEvents:statEvents,
    _inspectionEvents:[],
  };
  const queue=bindAnimLogChunks(buildAnimQueue(oldGs,newGs),{statLogs});
  if(statLogs.some(line=>typeof line==='string'&&line.includes('黑山羊幼仔'))){
    queue.unshift({type:'BLACK_GOAT_PULSE',targetPid:state.currentTurn,msgs:[]});
  }
  return queue;
}

function buildTurnStartIntroQueue(state,name){
  if(!state?._playersBeforeThisDraw)return [];
  const preDrawQueue=buildTurnStartPreDrawEffectQueue({
    oldGs:{...state,players:state._preTurnPlayers||state.players,_statEventSeq:0},
    newGs:state,
  });
  const turnStartStatQ=preDrawQueue.length?preDrawQueue:buildTurnStartStatQueue(state);
  const queue=[];
  if(turnStartStatQ.length){
    queue.push({type:'VISUAL_LOCK',players:state._preTurnPlayers||state._playersBeforeThisDraw,zhuLight:state.zhuLight||null});
  }
  queue.push({type:'YOUR_TURN',name:name||state.players?.[state.currentTurn]?.name||'???',msgs:state._turnStartLogs});
  queue.push(...turnStartStatQ);
  if(turnStartStatQ.length){
    queue.push(statePatchStep({players:state._playersBeforeThisDraw}));
  }
  return queue;
}

function logAiTurnStartDebug(stage,payload={}){
  try{
    console.log(`[AI-TURN-DEBUG] ${stage}`,payload);
  }catch{
    // noop
  }
}

function getHandLimitForPlayer(player){
  return Math.max(0,(player?._nyaHandLimit??4)-(player?.handLimitDecrease||0));
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
  const [firstBattleStarted,setFirstBattleStarted]=useState(()=>safeLS.get(FIRST_BATTLE_DONE_KEY)==='1');
  const [onlineResourcesUnlocked,setOnlineResourcesUnlocked]=useState(false);
  // ── Audio / Video / Main UI Resource Preloading ──────────────
  const { isLoading, loadingProgress, loadingError, currentFile, totalSize, loadedSize } = useResourcePreload({
    loadAllThemes: firstBattleStarted || onlineResourcesUnlocked,
    activeExpansionKey: gs?.expansionKey || '地神的潜影',
  });
  
  // ── Tutorial ──────────────────────────────────────────────────
  const isH5Package=isH5PackagedRuntime();
  // Detect non-production environments (Claude Artifacts iframe, local dev, etc.)
  // Use multiple signals: iframe check + origin check + localhost
  const isArtifact = (()=>{
    try{
      if(window.self!==window.top)return true;          // inside any iframe (Artifacts)
      if(isH5Package)return false;                      // packaged H5 / file runtime: allow persistence and multiplayer
      if(window.location.origin==='null')return true;   // sandboxed origin
      if(/localhost|127\.0\.1/.test(window.location.hostname))return false; // local dev: use real localStorage
      return false;                                      // deployed website: use real localStorage
    }catch{return true;}                              // cross-origin frame access blocked → treat as Artifact
  })();
  const TUTORIAL_KEY='cthulhu_tutorial_v2_done'; // v2: bump version to reset all prior cached state
  const isLocalTestMode=isLocalTestHost();
  const canPersistTutorial=!isArtifact||isH5Package;
  const readTutorialDone=()=>canPersistTutorial?safeLS.get(TUTORIAL_KEY)==='1':false;
  const [tutorialDone,setTutorialDone]=useState(readTutorialDone);
  const [showTutorial,setShowTutorial]=useState(false);
  const readSoftGuideDone=()=>canPersistTutorial?parseSoftGuideDone(safeLS.get(SOFT_GUIDE_STORAGE_KEY)):{};
  const [softGuideDone,setSoftGuideDone]=useState(readSoftGuideDone);
  const [pendingSoftGuideId,setPendingSoftGuideId]=useState(null);
  const [preparingSoftGuideId,setPreparingSoftGuideId]=useState(null);
  const [isSoloPaused,setIsSoloPaused]=useState(false);
  const softGuidePauseActive=!!(pendingSoftGuideId||preparingSoftGuideId||isSoloPaused);
  useEffect(()=>{
    if(!isSoloPaused)return undefined;
    const resumeOnEscape=e=>{
      if(e.key==='Escape')setIsSoloPaused(false);
    };
    window.addEventListener('keydown',resumeOnEscape);
    return()=>window.removeEventListener('keydown',resumeOnEscape);
  },[isSoloPaused]);
  const [showGodResurrection,setShowGodResurrection]=useState(false);
  const [showFullLog,setShowFullLog]=useState(false);
  const [tutorialStep,setTutorialStep]=useState(1);
  const [tutorialOverlayHidden,setTutorialOverlayHidden]=useState(false);
  const [tutorialDiceResultPending,setTutorialDiceResultPending]=useState(false);
  const [tutorialDiceResultResuming,setTutorialDiceResultResuming]=useState(false);
  const [tutorialInspectionPending,setTutorialInspectionPending]=useState(false);
  const [tutorialInspectionResuming,setTutorialInspectionResuming]=useState(false);
  const tutorialGodConvertContinuationRef=useRef(null);
  const [tutorialGodPlayerDrawArmed,setTutorialGodPlayerDrawArmed]=useState(false);
  const tutorialStepDef=showTutorial&&typeof tutorialStep==='string'?getTutorialStep(tutorialStep):null;
  const isScriptedTutorial=!!tutorialStepDef;
  const isTutorialActionStep=!!tutorialStepDef?.allowedAction;
  const isTutorialDrawKeepStep=showTutorial&&tutorialStep===TUTORIAL_FLOW.TREASURE_DRAW_REVEAL;
  const isTutorialDrawKeepHighlightStep=isTutorialDrawKeepStep&&tutorialStepDef?.highlight==='drawRevealKeepButton';
  const clearTurnDrawReplayHints=(state)=>state?({
    ...state,
    _playersBeforeThisDraw:null,
    _preTurnPlayers:null,
    _turnStartLogs:null,
    _drawLogs:[],
    _statLogs:[],
    _drawnCard:null,
    _aiDrawnCard:null,
    _discardedDrawnCard:false,
    _drawSourcePile:null,
  }):state;
  const {
    activeDebugConfig,
    localDebugMode,
    setLocalDebugMode,
    debugForceCard,
    setDebugForceCard,
    debugForceCardTarget,
    setDebugForceCardTarget,
    debugForceCardKeep,
    setDebugForceCardKeep,
    debugForceCardType,
    setDebugForceCardType,
    debugForceZoneCardKey,
    setDebugForceZoneCardKey,
    debugForceZoneCardName,
    setDebugForceZoneCardName,
    debugForceGodCardKey,
    setDebugForceGodCardKey,
    debugTutorialPromptMode,
    setDebugTutorialPromptMode,
    debugExpansionKey,
    setDebugExpansionKey,
    debugRoleCompositionKey,
    setDebugRoleCompositionKey,
  } = useDebugSettings({
    isLocalTestMode,
    expansionRandomKey: EXPANSION_RANDOM_KEY,
    defaultZoneCardName: FIXED_ZONE_CARD_VARIANTS_BY_KEY.A1?.find(card=>card.expansion==='地神的潜影')?.name||'',
  });
  const [showDebugSettings,setShowDebugSettings]=useState(false);
  const [pendingRoleSelection,setPendingRoleSelection]=useState(null);
  const softGuidePrevPlayersRef=useRef(null);
  const queuedSoftGuideIdRef=useRef(null);
  // Swap blind-draw overlay state: null | { phase:'shuffling'|'selecting'|'flying', targetPi, handSnapshot[], selectedIdx?, flyFromRect?, flyToRect? }
  const [swapBlindDraw,setSwapBlindDraw]=useState(null);
  const swapBlindDrawRef=useRef(null);
  useEffect(()=>{swapBlindDrawRef.current=swapBlindDraw;},[swapBlindDraw]);
  const isBattleScreen=!!gs;
  useEffect(()=>{
    if(!isBattleScreen)return undefined;
    const images=getBattlePredecodeImages(gs?.expansionKey);
    if(!images.length)return undefined;
    let cancelled=false;
    const run=()=>{
      images.forEach(path=>{
        loadEffectImage(path).catch(error=>{
          if(!cancelled)console.warn(`Battle predecode failed: ${path}`,error);
        });
      });
    };
    if(typeof window!=='undefined'&&typeof window.requestIdleCallback==='function'){
      const idleId=window.requestIdleCallback(run,{timeout:1200});
      return ()=>{
        cancelled=true;
        window.cancelIdleCallback?.(idleId);
      };
    }
    const timer=setTimeout(run,0);
    return ()=>{
      cancelled=true;
      clearTimeout(timer);
    };
  },[isBattleScreen,gs?.expansionKey]);
  const {
    gamma,
    musicVolume,
    sfxVolume,
    handleGamma,
    handleMusicVolume,
    handleSfxVolume,
  }=useGamePreferences();
  const {noteUserGesture,playOpenSound,playCloseSound,playTickSound,playHpDamageSound,playSanDamageSound,playHpRecoverSound,playSanRecoverSound,playApophisEclipseSound,playThrowStoneThrowSound,playThrowStoneRollingSound,playEndlessCorridorTunnelSound,playEarthquakeSound,playGeomagneticReversalSound,playStartledBatsSound,playNightWindSound,playIgniteTorchFireSound,playRopeSound,playUndergroundSpringDropletSound,playVolcanoSound,playSemiMaterialSound,playBurrowingWormSound,playSnakeTrapSound,playCthRlyehDreamSound,playGodPowerBlockedSound,playTsgSlimePopSound,playTsgSlimeCreateSound,playOneCardShiftSound,playMultiCardShiftSound,playDiceRollSound,playTurnStartSound,playSkillHuntSound,playSkillSwapSound,playSkillBewitchSound,playGodHighlightSound,playVritraImmortalRevealSound,playPositiveCardFlipSound,playNeutralCardFlipSound,playCaveDuelSound,playWheelSpinSound,playBlackGoatRunSound,playBlackGoatPulseSound,playGuillotineDeathSound,playPetrifyDeathSound,playNegativeCardFlipSound}=useGameAudio(isBattleScreen,gs?.expansionKey||'地神的潜影',{musicVolume,sfxVolume});
  const persistSoftGuideDone=useCallback((nextDone)=>{
    setSoftGuideDone(nextDone);
    if(canPersistTutorial)safeLS.set(SOFT_GUIDE_STORAGE_KEY,serializeSoftGuideDone(nextDone));
  },[canPersistTutorial]);

  const markSoftGuideSeen=useCallback((id)=>{
    persistSoftGuideDone(markSoftGuideDone(softGuideDone,id));
  },[persistSoftGuideDone,softGuideDone]);

  const resetSoftGuidesForNextSolo=useCallback((mode)=>{
    if(mode==='show'){
      persistSoftGuideDone({});
      return;
    }
    if(mode==='hide'){
      persistSoftGuideDone(markAllSoftGuidesDone());
    }
  },[persistSoftGuideDone]);

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
  const SERVER_URL = getRuntimeServerUrl();
  const SOCKET_PATH = getRuntimeSocketPath();
  const [serverAnnouncement,setServerAnnouncement]=useServerAnnouncement(SERVER_URL);
  const socketRef=useRef(null);
  const mpAiTakeoverSeqRef=useRef(0);
  const pendingMpAiTakeoverRef=useRef(null);
  const {
    playerUUID, setPlayerUUID, playerUUIDRef,
    identityToken, setIdentityToken, identityTokenRef,
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
  const mpOpeningRoleRevealPendingRef=useRef(false); // 开局角色揭示期间忽略重复首帧同步，避免抢跑首回合动画
  const pendingMpRawQueueRef=useRef([]); // 动画播放中收到的公共动画同步包，按顺序落地
  const pendingMpLatestStateRawRef=useRef(null); // 动画播放中收到的普通状态同步包，只保留最新
  const mpTurnExpiredRef=useRef(false); // 回合倒计时归零后保持到自动结束真正执行，避免动作动画期间丢失
  const consumedVisualEventIdsRef=useRef(new Set()); // 联机视觉事件去重，避免重复同步包重播旧动画
  const endTurnReplaySyncQueueRef=useRef(null); // 记录本地无尽通道完整动画队列，供联机远端同步
  const endTurnSeqRef=useRef(null); // Phase C：当前回合结束事件序列 {events,cursor}。回合结束严格串行，故全局唯一；存于 ref 而非 state，跨决策重建不丢、不入联机广播。
  const gameEndSentRef=useRef(false);      // 防止 gameEnd 重复发送
  const gameOverPresentationFrozenRef=useRef(false); // 终局展示完成后拒绝旧对局同步包回灌
  const latestGsRef=useRef(null); // always mirrors latest gs for closures reading stale state
  latestGsRef.current=gs; // 同步更新：渲染期间直接镜像，确保 confirmDiscard 等闭包读到最新值
  const [isDisconnected,setIsDisconnected]=useState(false);
  const [exitMatchConfirm,setExitMatchConfirm]=useState(null);
  function resetDisconnectedToStart(){
    setIsDisconnected(false);
    closeRoomModal();
    setOnlineOptionsModal(false);
    closeLobbyModal();
    setIsMultiplayer(false);
    isMultiplayerRef.current=false;
    setMyPlayerIndex(0);
    myPlayerIndexRef.current=0;
    mpRoleRevealedRef.current=false;
    consumedVisualEventIdsRef.current=new Set();
    pendingMpRawQueueRef.current=[];
    pendingMpLatestStateRawRef.current=null;
    setGs(null);
  }
  function leaveMultiplayerMatchToStart(){
    setExitMatchConfirm(null);
    setShowEmojiPicker(false);
    setShowFullLog(false);
    setShowGodResurrection(false);
    setIsMultiplayer(false);
    isMultiplayerRef.current=false;
    setMyPlayerIndex(0);
    myPlayerIndexRef.current=0;
    mpRoleRevealedRef.current=false;
    consumedVisualEventIdsRef.current=new Set();
    pendingMpRawQueueRef.current=[];
    pendingMpLatestStateRawRef.current=null;
    gameEndSentRef.current=false;
    closeRoomModal();
    setGs(null);
  }
  // 表情功能
  const [flyingEmojis,setFlyingEmojis]=useState([]);  // [{id,emoji,startX,startY,endX,endY,arcHeight,durationMs}]
  const [showEmojiPicker,setShowEmojiPicker]=useState(false);
  const [emojiButtonPos,setEmojiButtonPos]=useState({top:70,right:20});
  const discardPileRef=useRef(null);        // 弃牌堆位置

  function copyRoomIdToClipboard(roomId,{created=false}={}){
    const successMsg=created
      ?`创建成功！房间号已复制：${roomId}`
      :'✓ 房间号已复制';
    const failMsg=created
      ?`创建成功！房间号：${roomId}（复制失败，请手动复制）`
      :'复制失败，请手动复制';
    try{
      const writer=navigator?.clipboard?.writeText;
      if(!writer)throw new Error('clipboard unavailable');
      writer.call(navigator.clipboard,String(roomId))
        .then(()=>addToast(successMsg))
        .catch(()=>addToast(failMsg));
    }catch{
      addToast(failMsg);
    }
  }

  function isMpReplayBusy(){
    return isMultiplayerReplayBusy({
      roleRevealAnim,
      anim,
      animExiting,
      animQueueRef,
      pendingGsRef,
    });
  }

  function processIncomingMpStateSync(rawGs,{allowBuffer=true}={}){
    if(gameOverPresentationFrozenRef.current||!isMultiplayerRef.current)return 'ignored';
    return processIncomingMultiplayerStateSync({
      rawState:rawGs,
      allowBuffer,
      currentState:gs,
      roleRevealAnim,
      anim,
      animExiting,
      context:{
        myPlayerIndexRef,
        latestGsRef,
        mpOpeningRoleRevealPendingRef,
        mpRoleRevealedRef,
        consumedVisualEventIdsRef,
        pendingMpRawQueueRef,
        pendingMpLatestStateRawRef,
        receivedGsRef,
        animQueueRef,
        pendingGsRef,
        suppressNextBroadcastRef,
        syncVisibleLog,
        setGs,
        setAnim,
        setRoleRevealAnim,
        setAnimExiting,
        clearDamageAnimations,
        markInspectionEventsSeen,
        visualStateLocks,
        triggerAnimQueue,
      },
    });
  }

  function rotateRawSeatIndex(rawSeatIndex,stateLike){
    const N=stateLike?.players?.length||roomModalRef.current?.players?.length||0;
    if(rawSeatIndex==null||rawSeatIndex<0||!N)return -1;
    const myIdx=myPlayerIndexRef.current||0;
    return (rawSeatIndex-myIdx+N)%N;
  }

  function handleMpAiTakeover(payload){
    if(!payload||payload.authorityUuid!==playerUUIDRef.current)return;
    if(!isMultiplayerRef.current)return;
    const latest=latestGsRef.current;
    if(latest?.gameOver||latest?.phase==='GOD_RESURRECTION')return;
    if(isMpReplayBusy()){
      pendingMpAiTakeoverRef.current=payload;
      return;
    }
    const sourceGs=payload.gs?rotateGsForViewer(payload.gs,myPlayerIndexRef.current):latestGsRef.current;
    const takeoverIdx=rotateRawSeatIndex(payload.playerIndex,sourceGs);
    const nextGs=resolveMpAiTakeoverState(sourceGs,takeoverIdx,{
      getHandLimitForPlayer,
      resolveCaveDuelState,
    });
    if(!nextGs)return;
    const roomId=payload.roomId||roomModalRef.current?.roomId;
    const rawNextGs=derotateGs(nextGs,myPlayerIndexRef.current);
    if(socketRef.current?.connected&&roomId){
      socketRef.current.emit('mpStateSync',{roomId,gs:rawNextGs});
    }
    processIncomingMpStateSync(rawNextGs,{allowBuffer:false});
  }

  // 表情：点击 emoji → 加入批次队列 → 300ms 内 flush 打包发送
  const handleEmojiClick=useMultiplayerEmojiSender({ socketRef, roomModalRef, playerUUIDRef });
  const handleFlyingEmojiDone=useCallback(id=>{
    setFlyingEmojis(prev=>prev.filter(x=>x.id!==id));
  },[]);
  const selfPanelRef=useRef(null);
  const emojiButtonRef=useRef(null);
  const [panelRect,setPanelRect]=useState(null);
  const roleTextRef=useRef(null);
  const [roleTextRect,setRoleTextRect]=useState(null);
  const handAreaRef=useRef(null);
  const mobileGodCardRefs=useRef(new Map());
  const igniteTorchFlamingCardIdsRef=useRef(new Set());
  const debugInspectionFlipHandlerRef=useRef(null);
  const debugGodPowerBlockedHandlerRef=useRef(null);
  const debugTsgSlimePopHandlerRef=useRef(null);
  const debugVritraImmortalRevealHandlerRef=useRef(null);
  const debugGuillotineHandlerRef=useRef(null);
  const debugPetrifyDeathHandlerRef=useRef(null);
  const [handAreaRect,setHandAreaRect]=useState(null);
  const [tutorialHandCardRect,setTutorialHandCardRect]=useState(null);
  const [handCardsRect,setHandCardsRect]=useState(null);
  const [mobileArmedGodCardIdx,setMobileArmedGodCardIdx]=useState(null);
  const aiPanelAreaRef=useRef(null);
  const [aiPanelAreaRect,setAiPanelAreaRect]=useState(null);
  const [opponentSanBarRect,setOpponentSanBarRect]=useState(null);
  const [opponentHpBarRect,setOpponentHpBarRect]=useState(null);
  const [singleOpponentRect,setSingleOpponentRect]=useState(null);
  const [opponentGodStatusRect,setOpponentGodStatusRect]=useState(null);
  const drawRevealKeepButtonRef=useRef(null);
  const [drawRevealKeepButtonRect,setDrawRevealKeepButtonRect]=useState(null);
  const godKeepHandButtonRef=useRef(null);
  const [godKeepHandButtonRect,setGodKeepHandButtonRect]=useState(null);
  const deckAreaRef=useRef(null);
  const [deckAreaRect,setDeckAreaRect]=useState(null);
  const dodgeRollButtonRef=useRef(null);
  const [dodgeRollButtonRect,setDodgeRollButtonRect]=useState(null);
  const skillButtonRef=useRef(null);
  const [skillButtonRect,setSkillButtonRect]=useState(null);
  const restButtonRef=useRef(null);
  const [softGuideSpotlights,setSoftGuideSpotlights]=useState([]);
  const swapBlindHandRef=useRef(null);
  const [swapBlindHandRect,setSwapBlindHandRect]=useState(null);
  const [roleRevealAnim,setRoleRevealAnim]=useState(null); // {role,pendingGs}|null
  
  // --- 新增：用于 UI 延迟显示的 HP/SAN 状态 ---
  const [displayStats, setDisplayStats] = useState(() => gs?.players ? gs.players.map(p => ({ hp: p.hp, san: p.san })) : []);
  const [godHighlightPanelBursts,setGodHighlightPanelBursts]=useState({});
  const previousGodStatusRef=useRef(null);
  const pendingGodHighlightStatusRef=useRef(new Set());
  const triggerGodHighlightPanelBurst=useCallback((playerIndex,godKey)=>{
    if(playerIndex==null||!godKey)return;
    playGodHighlightSound?.();
    const key=`${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setGodHighlightPanelBursts(prev=>({...prev,[playerIndex]:{key,godKey}}));
    setTimeout(()=>{
      setGodHighlightPanelBursts(prev=>{
        if(prev[playerIndex]?.key!==key)return prev;
        const next={...prev};
        delete next[playerIndex];
        return next;
      });
    },1250);
  },[playGodHighlightSound]);
  const[earthquakeVisualPlayers,setEarthquakeVisualPlayers]=useState(null);

  React.useLayoutEffect(()=>{
    if(isTutorialDrawKeepHighlightStep)setDrawRevealKeepButtonRect(null);
  },[isTutorialDrawKeepHighlightStep,gs?.phase,gs?.drawReveal?.card?.id]);
  const logRef=useRef(null);
  const [visibleLog,setVisibleLog]=useState(Array.isArray(gs?.log)?gs.log:[]);
  const visibleLogRef=useRef(Array.isArray(gs?.log)?gs.log:[]);
  const visibleLogCountRef=useRef(Array.isArray(gs?.log)?gs.log.length:0);
  const visibleLogAuthorityRef=useRef(Array.isArray(gs?.log)?gs.log:[]);

  const lastInspectionSeqRef=useRef(0);
  function markInspectionEventsSeen(events=[]){
    const seqs=(Array.isArray(events)?events:[]).map(ev=>ev?.seq||0).filter(Boolean);
    if(seqs.length)lastInspectionSeqRef.current=Math.max(lastInspectionSeqRef.current,...seqs);
  }
  const [houndsSecLeft,setHoundsSecLeft]=useState(null);
  const [houndsRevealedSeq,setHoundsRevealedSeq]=useState(0);
  const houndsWasActiveRef=useRef(false);
  // 结算前依次播放所有寻宝者胜者的藏宝图；本地/远端等待阶段已经播过的胜者不重复播放。
  const [treasureMapAckCount,setTreasureMapAckCount]=useState(0);
  const localTreasureMapShownRef=useRef(false);
  const mpTreasureWaitShownRef=useRef(false);
  useEffect(()=>{
    if(!gs?.gameOver)setTreasureMapAckCount(0);
  },[gs?.gameOver]);
  useEffect(()=>{
    if(!gs){
      localTreasureMapShownRef.current=false;
      mpTreasureWaitShownRef.current=false;
      return;
    }
    if(gs.phase==='MP_PLAYER_WIN_WAIT')mpTreasureWaitShownRef.current=true;
  },[gs,gs?.phase]);

  // ── Responsive layout ──────────────────────────────────────
  const {
    vw,
    vh,
    isMobile,
    isMobileLandscape,
    scaleRatio,
    layoutScaleRatio,
    mobileZoomCompensate,
    baseFontSizes,
    fontSizes,
    interactionFontSizes,
    scaledAreaSafeInsetX,
    globalShiftX,
    middleRowHeight,
    boardScaleRatio,
    compactBoardScaleRatio,
    mobileCssPx,
    boardCssPx,
    mobileHandUsesCompact,
    selfHandCardScale,
  } = useBattleResponsiveLayout();
  const swapBlindCardLayout = useMemo(()=>{
    const largeBoost=clamp(((vw||0)-1280)/960,0,1);
    const portraitMobile=isMobile&&!isMobileLandscape;
    const landscapeMobile=isMobileLandscape;
    const width=portraitMobile
      ? clamp((vw||390)*0.145,52,60)
      : landscapeMobile
        ? clamp((vh||390)*0.16,56,66)
        : Math.round(76+largeBoost*42);
    const height=Math.round(width*(108/82));
    const scale=width/82;
    const gap=Math.round(portraitMobile?8:landscapeMobile?9:12+largeBoost*4);
    const spacing=Math.round(width*(portraitMobile?0.92:0.86));
    const titleScale=portraitMobile?1:clamp(width/76,1,1.35);
    return {
      width,
      height,
      scale,
      gap,
      spacing,
      titleFontSize:Math.round((portraitMobile?15:18)*titleScale),
      hintFontSize:Math.round((portraitMobile?12:13)*titleScale),
      nameFontSize:Math.max(10,Math.round(width*0.16)),
      maxWidth:portraitMobile?'94vw':'92vw',
    };
  },[vw,vh,isMobile,isMobileLandscape]);

  const applyVisibleLogPrefix=useCallback((count,authorityOverride)=>{
    const authority=Array.isArray(authorityOverride)?authorityOverride:(Array.isArray(visibleLogAuthorityRef.current)?visibleLogAuthorityRef.current:[]);
    const safeCount=Math.max(0,Math.min(count,authority.length));
    visibleLogAuthorityRef.current=authority;
    visibleLogCountRef.current=safeCount;
    const prefix=authority.slice(0,safeCount);
    visibleLogRef.current=prefix;
    setVisibleLog(prefix);
  },[]);

  const syncVisibleLog=useCallback((nextLog,stateForLocalView=null)=>{
    const normalized=buildVisibleLogForLocalViewer(
      Array.isArray(nextLog)?nextLog:[],
      stateForLocalView
    );
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
    const turnDrawnCard=stateLike?._drawnCard||stateLike?._aiDrawnCard;
    if(stateLike?._playersBeforeThisDraw&&turnDrawnCard&&stateLike?._discardedDrawnCard){
      return removeCardsFromDiscard(discard,[turnDrawnCard]);
    }
    return discard;
  },[]);

  const maskDiscardedTurnDrawUntilDiscardAnim=useCallback((stateLike)=>{
    if(!stateLike?._playersBeforeThisDraw||!(stateLike?._drawnCard||stateLike?._aiDrawnCard)||!stateLike?._discardedDrawnCard)return;
    setVisualDiscard(getVisualDiscardForState(stateLike));
  },[getVisualDiscardForState]);

  const suppressNextBroadcastRef=useRef(false); // set before bystander-anim pendingGs; cleared in advanceQueue
  const committedTargetActionRef=useRef(false); // blocks cancel during the frame after a target action is confirmed
  const turnHighlightLockRef=useRef(null);
  const visualPlayersLockRef=useRef(null);
  const visualZhuLightLockRef=useRef(null);
  const zhuHiddenCardIdLockRef=useRef(null);
  const visualStateLocks=useMemo(()=>({
    turnHighlightRef:turnHighlightLockRef,
    playersRef:visualPlayersLockRef,
    zhuLightRef:visualZhuLightLockRef,
    hiddenZhuCardIdRef:zhuHiddenCardIdLockRef,
    lock({players,zhuLight,hiddenZhuCardId,turnHighlight}={}){
      if(players!==undefined)visualPlayersLockRef.current=players?copyPlayers(players):null;
      if(zhuLight!==undefined)visualZhuLightLockRef.current=zhuLight||null;
      if(hiddenZhuCardId!==undefined)zhuHiddenCardIdLockRef.current=hiddenZhuCardId||null;
      if(turnHighlight!==undefined)turnHighlightLockRef.current=turnHighlight;
    },
    clear({players=false,zhuLight=false,hiddenZhuCardId=false,turnHighlight=false}={}){
      if(players)visualPlayersLockRef.current=null;
      if(zhuLight)visualZhuLightLockRef.current=null;
      if(hiddenZhuCardId)zhuHiddenCardIdLockRef.current=null;
      if(turnHighlight)turnHighlightLockRef.current=null;
    },
  }),[]);
  const normalizeLocalPendingGs=useCallback(state=>{
    const stateWithCompleteTerminalLog=state?.gameOver
      ?{...state,log:buildCompleteGameOverLog(state,visibleLogRef.current)}
      :state;
    return withClearedReplayAnimFields(stateWithCompleteTerminalLog,{_statEvents:[]});
  },[]);
  const {
    anim,
    setAnim,
    animExiting,
    setAnimExiting,
    animQueueRef,
    pendingGsRef,
    animCallbackRef,
    triggerAnimQueue,
  } = useAnimationQueue({
    gs,
    copyPlayers,
    setGs,
    setDisplayStats,
    setVisualPlayersOverride:setEarthquakeVisualPlayers,
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
    visualStateLocks,
    suppressNextBroadcastRef,
    receivedGsRef,
    consumedVisualEventIdsRef,
    normalizePendingGs:normalizeLocalPendingGs,
    ANIM_STEP_GAP,
    CARD_REVEAL_DURATION,
    ANIM_DURATION,
    ANIM_SPEED_SCALE,
    paused:isSoloPaused,
  });

  useEffect(()=>{
    if(anim?.type!=='GOD_HIGHLIGHT')return;
    triggerGodHighlightPanelBurst(anim.targetPid,anim.godKey);
    // The visible player state may be committed by a following STATE_PATCH.
    // Record the status represented by this explicit timeline step now, so
    // the fallback status watcher does not replay the same panel highlight
    // after the step has already left the queue.
    const targetPid=anim.targetPid;
    const committedPlayer=pendingGsRef.current?.players?.[targetPid];
    const highlightedGodName=committedPlayer?.godName||anim.godKey||null;
    const highlightedGodLevel=committedPlayer?.godLevel??0;
    if(targetPid!=null&&highlightedGodName){
      pendingGodHighlightStatusRef.current.add(`${targetPid}:${highlightedGodName}:${highlightedGodLevel}`);
    }
    // Do not advance previousGodStatusRef optimistically here. Interactive
    // phases (for example, waiting for a hunted player to reveal a card) can
    // render another snapshot before the queued state patch is committed.
    // The status watcher below must compare that real commit with the last
    // rendered snapshot so it can consume this marker without replaying it.
  },[anim,pendingGsRef,triggerGodHighlightPanelBurst]);

  useEffect(()=>{
    const statuses=(gs?.players||[]).map(p=>({godName:p?.godName||null,godLevel:p?.godLevel||0}));
    if(!statuses.length){previousGodStatusRef.current=null;return;}
    if(!previousGodStatusRef.current){previousGodStatusRef.current=statuses;return;}
    const prevStatuses=previousGodStatusRef.current;
    statuses.forEach((status,idx)=>{
      const prev=prevStatuses[idx]||{};
      if(status.godName&&(status.godName!==prev.godName||(status.godLevel||0)>(prev.godLevel||0))){
        const statusKey=`${idx}:${status.godName}:${status.godLevel||0}`;
        const explicitHighlightPending=pendingGodHighlightStatusRef.current.delete(statusKey);
        const hasQueuedHighlight=(anim?.type==='GOD_HIGHLIGHT'&&anim.targetPid===idx)
          ||animQueueRef.current.some(step=>step?.type==='GOD_HIGHLIGHT'&&step.targetPid===idx);
        if(!explicitHighlightPending&&!hasQueuedHighlight)triggerGodHighlightPanelBurst(idx,status.godName);
      }
    });
    previousGodStatusRef.current=statuses;
  },[gs?.players,anim,animQueueRef,triggerGodHighlightPanelBurst]);

  useEffect(()=>{
    if(anim||animExiting||animQueueRef.current.length||pendingGsRef.current)return;
    pendingGodHighlightStatusRef.current.clear();
  },[anim,animExiting,gs?.players,animQueueRef,pendingGsRef]);

  useEffect(()=>{
    if(!import.meta.env.DEV||typeof window==='undefined')return undefined;
    const playInspectionFlip=(options={})=>{
      const handler=debugInspectionFlipHandlerRef.current;
      if(!handler){
        console.warn('[toeDebug] playInspectionFlip: debug handler unavailable');
        return Promise.resolve({ok:false,reason:'unavailable'});
      }
      return handler(options);
    };
    const playGodPowerBlocked=(options={})=>{
      const handler=debugGodPowerBlockedHandlerRef.current;
      if(!handler){
        console.warn('[toeDebug] playGodPowerBlocked: debug handler unavailable');
        return Promise.resolve({ok:false,reason:'unavailable'});
      }
      return handler(options);
    };
    const playTsgSlimePop=(options={})=>{
      const handler=debugTsgSlimePopHandlerRef.current;
      if(!handler){
        console.warn('[toeDebug] playTsgSlimePop: debug handler unavailable');
        return Promise.resolve({ok:false,reason:'unavailable'});
      }
      return handler(options);
    };
    const playVritraImmortalReveal=(options={})=>{
      const handler=debugVritraImmortalRevealHandlerRef.current;
      if(!handler){
        console.warn('[toeDebug] playVritraImmortalReveal: debug handler unavailable');
        return Promise.resolve({ok:false,reason:'unavailable'});
      }
      return handler(options);
    };
    const playGuillotine=(options={})=>{
      const handler=debugGuillotineHandlerRef.current;
      if(!handler){
        console.warn('[toeDebug] playGuillotine: debug handler unavailable');
        return Promise.resolve({ok:false,reason:'unavailable'});
      }
      return handler(options);
    };
    const playPetrifyDeath=(options={})=>{
      const handler=debugPetrifyDeathHandlerRef.current;
      if(!handler){
        console.warn('[toeDebug] playPetrifyDeath: debug handler unavailable');
        return Promise.resolve({ok:false,reason:'unavailable'});
      }
      return handler(options);
    };
    const debugRoot={...(window.__toeDebug||{})};
    delete debugRoot.playIgniteTorchDiscard;
    debugRoot.playInspectionFlip=playInspectionFlip;
    debugRoot.playGodPowerBlocked=playGodPowerBlocked;
    debugRoot.playTsgSlimePop=playTsgSlimePop;
    debugRoot.playVritraImmortalReveal=playVritraImmortalReveal;
    debugRoot.playGuillotine=playGuillotine;
    debugRoot.playPetrifyDeath=playPetrifyDeath;
    window.__toeDebug=debugRoot;
    return ()=>{
      if(window.__toeDebug?.playInspectionFlip===playInspectionFlip){
        delete window.__toeDebug.playInspectionFlip;
      }
      if(window.__toeDebug?.playGodPowerBlocked===playGodPowerBlocked){
        delete window.__toeDebug.playGodPowerBlocked;
      }
      if(window.__toeDebug?.playTsgSlimePop===playTsgSlimePop){
        delete window.__toeDebug.playTsgSlimePop;
      }
      if(window.__toeDebug?.playVritraImmortalReveal===playVritraImmortalReveal){
        delete window.__toeDebug.playVritraImmortalReveal;
      }
      if(window.__toeDebug?.playGuillotine===playGuillotine){
        delete window.__toeDebug.playGuillotine;
      }
      if(window.__toeDebug?.playPetrifyDeath===playPetrifyDeath){
        delete window.__toeDebug.playPetrifyDeath;
      }
    };
  },[]);

  useEffect(()=>{
    if(!mpOpeningRoleRevealPendingRef.current)return;
    if(roleRevealAnim||anim||animQueueRef.current.length>0||pendingGsRef.current)return;
    mpOpeningRoleRevealPendingRef.current=false;
  },[roleRevealAnim,anim,animQueueRef,pendingGsRef]);

  useEffect(()=>{
    if(gameOverPresentationFrozenRef.current||!isMultiplayerRef.current){
      pendingMpRawQueueRef.current=[];
      pendingMpLatestStateRawRef.current=null;
      return;
    }
    if(roleRevealAnim||anim||animExiting||animQueueRef.current.length>0||pendingGsRef.current)return;
    const pendingRaw=pendingMpRawQueueRef.current.shift()||pendingMpLatestStateRawRef.current;
    if(!pendingRaw)return;
    if(pendingRaw===pendingMpLatestStateRawRef.current)pendingMpLatestStateRawRef.current=null;
    processIncomingMpStateSync(pendingRaw,{allowBuffer:false});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[roleRevealAnim,anim,animExiting,gs?.phase,gs?._turnKey,gs?.log?.length]);

  useEffect(()=>{
    if(roleRevealAnim||anim||animExiting||animQueueRef.current.length>0||pendingGsRef.current)return;
    const pendingTakeover=pendingMpAiTakeoverRef.current;
    if(!pendingTakeover)return;
    pendingMpAiTakeoverRef.current=null;
    handleMpAiTakeover(pendingTakeover);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[roleRevealAnim,anim,animExiting,gs?.phase,gs?._turnKey,gs?.log?.length]);

  const latestHoundsInspectionSeq=useMemo(()=>{
    const events=Array.isArray(gs?._inspectionEvents)?gs._inspectionEvents:[];
    return events
      .filter(ev=>ev?.card?.effect==='houndsOfTindalos')
      .reduce((max,ev)=>Math.max(max,ev?.seq||0),0);
  },[gs?._inspectionEvents]);
  const houndsTimerVisible=!!gs?.houndsOfTindalosActive&&(!latestHoundsInspectionSeq||houndsRevealedSeq>=latestHoundsInspectionSeq);

  useAnimationAudioEffects({ anim, playApophisEclipseSound, playThrowStoneThrowSound, playThrowStoneRollingSound, playEarthquakeSound, playGeomagneticReversalSound, playStartledBatsSound, playNightWindSound, playRopeSound, playUndergroundSpringDropletSound, playVolcanoSound, playSemiMaterialSound, playBurrowingWormSound, playSnakeTrapSound, playCthRlyehDreamSound, playGodPowerBlockedSound, playTsgSlimePopSound, playTsgSlimeCreateSound, playOneCardShiftSound, playMultiCardShiftSound, playDiceRollSound, playTurnStartSound, playSkillHuntSound, playSkillSwapSound, playSkillBewitchSound, playGodHighlightSound, playVritraImmortalRevealSound, playPositiveCardFlipSound, playNeutralCardFlipSound, playCaveDuelSound, playWheelSpinSound, playBlackGoatRunSound, playBlackGoatPulseSound, playNegativeCardFlipSound });

  useEffect(()=>{
    const active=!!gs?.houndsOfTindalosActive;
    // 只在「激活→失效」跳变时清零（猎犬咬人后返回检定牌堆）。
    // 不能在未激活期间无脑清零：蛊惑赠神等内联队列里，猎犬揭示动画播放时
    // 携带 houndsOfTindalosActive 的新状态尚未落入 gs，清零会把刚记录的揭示抹掉，
    // 导致图标永不显示、超时撕咬永不触发。
    if(!active&&houndsWasActiveRef.current&&houndsRevealedSeq!==0)setHoundsRevealedSeq(0);
    houndsWasActiveRef.current=active;
    if(anim?.type==='DRAW_CARD'&&anim.card?.effect==='houndsOfTindalos'){
      // 动画步骤自带 inspectionSeq（buildInspectionEventFlow），不依赖尚未应用的新状态。
      const seq=anim.inspectionSeq||latestHoundsInspectionSeq;
      if(seq)setHoundsRevealedSeq(prev=>Math.max(prev,seq));
    }
  },[gs?.houndsOfTindalosActive,anim?.type,anim?.card,anim?.inspectionSeq,latestHoundsInspectionSeq,houndsRevealedSeq]);
  const {earthquakeShake,screenShake,deathShake}=useGlobalShakeEffects({
    anim,
    localDebugMode,
    visibleLogRef,
    visibleLogCountRef,
    setVisibleLog,
  });
  const {
    cardTransfers,
    damageLinkEstablishAnims,
    clearCardTransferAnimations,
  } = useCardTransferAnimationEffects({ anim });
  const {
    swapAnim,
    huntAnim,
    bewitchAnim,
    clearSkillAnimations,
  } = useSkillAnimationEffects({ anim });
  const damageLinkGhosts = useDamageLinkGhosts({ players: gs?.players, log: gs?.log });
  const {
    hitIndices,
    knifeTargets,
    sanHitIndices,
    sanTargets,
    guillotineTargets,
    petrifyTargets,
    hpHealIndices,
    sanHealIndices,
    clearDamageAnimations,
  } = useDamageAnimationEffects({ anim, playHpDamageSound, playSanDamageSound, playHpRecoverSound, playSanRecoverSound, playGuillotineDeathSound, playPetrifyDeathSound });
  const guillotinedPids=useMemo(()=>new Set((guillotineTargets||[]).map(t=>t?.pi).filter(v=>v!=null)),[guillotineTargets]);
  const { connectSocket } = useMultiplayerConnection({
    isArtifact,
    multiLoading,
    socketRef,
    serverUrl: SERVER_URL,
    socketPath: SOCKET_PATH,
    setMultiLoading,
    setConnErrModal,
    addToast,
    handlerDeps: {
      playerUUIDRef,
      setPlayerUUID,
      identityTokenRef,
      setIdentityToken,
      setPlayerUsername,
      setPlayerUsernameSpecial,
      setRenameInput,
      setOnlineOptionsModal,
      setRoomModal,
      setLobbyLoading,
      setLobbyRooms,
      copyRoomIdToClipboard,
      setFirstBattleStarted,
      setOnlineResourcesUnlocked,
      setMyPlayerIndex,
      myPlayerIndexRef,
      setIsMultiplayer,
      isMultiplayerRef,
      setIsDisconnected,
      mpRoleRevealedRef,
      mpOpeningRoleRevealPendingRef,
      consumedVisualEventIdsRef,
      mpAiTakeoverSeqRef,
      pendingMpAiTakeoverRef,
      gameEndSentRef,
      gameOverPresentationFrozenRef,
      animQueueRef,
      pendingGsRef,
      setAnimExiting,
      clearDamageAnimations,
      setAnim,
      setGs,
      receivedGsRef,
      setRoleRevealAnim,
      startNextTurn,
      processIncomingMpStateSync,
      handleMpAiTakeover,
      setFlyingEmojis,
      discardPileRef,
      setServerAnnouncement,
    },
  });

  // 点击"联机对战"→ 连接后端，打开联机选项界面
  function handleMultiplayer(){
    setOnlineResourcesUnlocked(true);
    connectSocket(socket=>{
      socket.emit('openOnlineOptions',{uuid:playerUUID,identityToken});
      setOnlineOptionsModal(true);
    });
  }

  useWaitingRoomReconnect({
    gs,
    isMultiplayerRef,
    roomModalRef,
    multiLoading,
    socketRef,
    setOnlineResourcesUnlocked,
    connectSocket,
    playerUUIDRef,
    playerUUID,
    identityTokenRef,
    identityToken,
  });

  const clearBattleAnimationState=useCallback(()=>{
    animQueueRef.current=[];
    pendingGsRef.current=null;
    animCallbackRef.current=null;
    setAnimExiting(false);
    setAnim(null);
    clearSkillAnimations();
    clearCardTransferAnimations();
    clearDamageAnimations();
    setEarthquakeVisualPlayers(null);
    visualStateLocks.clear({turnHighlight:true,players:true,zhuLight:true,hiddenZhuCardId:true});
  },[animQueueRef,pendingGsRef,animCallbackRef,setAnim,setAnimExiting,clearSkillAnimations,clearCardTransferAnimations,clearDamageAnimations,visualStateLocks]);

  const clearMultiplayerReplayState=useCallback(()=>{
    clearBattleAnimationState();
    pendingMpRawQueueRef.current=[];
    pendingMpLatestStateRawRef.current=null;
    pendingMpAiTakeoverRef.current=null;
    mpOpeningRoleRevealPendingRef.current=false;
    setRoleRevealAnim(null);
  },[clearBattleAnimationState]);

  const applyTutorialStateSnapshot=useCallback((nextGs)=>{
    if(!nextGs)return;
    syncVisibleLog(nextGs.log||[],nextGs);
    setVisualDiscard(getVisualDiscardForState(nextGs));
    setDisplayStats((nextGs.players||[]).map(p=>({hp:p.hp,san:p.san})));
    setGs(nextGs);
  },[getVisualDiscardForState,syncVisibleLog]);

  const playPendingAiGodEncounterInspection=useCallback(()=>{
    const pending=gs?.abilityData;
    const actorIdx=pending?.playerIndex;
    if(!gs||gs.phase!=='AI_GOD_CHOICE'||actorIdx==null||!pending?.pendingEncounterInspection)return false;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard],L=[...gs.log];
    let inspectionMeta=makeInspectionMeta(gs);
    const processed=applyInspectionForSanLoss(actorIdx,P[actorIdx]?.san,gs.currentTurn??actorIdx,P,D,Disc,L,inspectionMeta);
    P=processed.P;D=processed.D;Disc=processed.Disc;L=processed.log;inspectionMeta=processed.inspectionMeta;
    const nextAbilityData={...(gs.abilityData||{}),pendingEncounterInspection:false};
    const newGs={
      ...gs,
      players:P,
      deck:D,
      discard:Disc,
      log:L,
      ...inspectionMeta,
      abilityData:nextAbilityData,
      _pendingAiGodChoice:{...(gs._pendingAiGodChoice||{}),pendingEncounterInspection:false},
    };
    const replay=buildInspectionAwareAnimQueue(gs,newGs,{buildAnimQueue,copyPlayers});
    let marked=false;
    const queue=(replay.queue||[]).map(step=>{
      if(!marked&&step?.type==='DRAW_CARD'&&step?.inspectionSeq!=null){
        marked=true;
        return {
          ...step,
          durationMs:2147483647,
          onSettled:()=>{
            setTutorialStep(TUTORIAL_FLOW.CULTIST_GOD_CHECK_INTRO);
            setTutorialInspectionPending(false);
          },
        };
      }
      return step;
    });
    setTutorialInspectionPending(true);
    triggerAnimQueue(queue,newGs,()=>{
      applyTutorialStateSnapshot(newGs);
      setTutorialInspectionResuming(false);
      setTutorialStep(TUTORIAL_FLOW.CULTIST_GOD_CONVERT_RESOLVE);
    });
    return true;
  },[applyTutorialStateSnapshot,gs,triggerAnimQueue]);

  const advanceTutorialStep=useCallback((nextStep)=>{
    if(!nextStep)return;
    if(
      tutorialStep===TUTORIAL_FLOW.CULTIST_GOD_OPPONENT_DRAW
      &&nextStep===TUTORIAL_FLOW.CULTIST_GOD_CHECK_INTRO
      &&playPendingAiGodEncounterInspection()
    ){
      return;
    }
    // 如果还有未应用的动画终态，先应用再切换教学步骤，避免丢失状态
    const pendingBase=pendingGsRef.current;
    if(pendingBase)pendingGsRef.current=null;
    clearBattleAnimationState();
    setSwapBlindDraw(null);
    setMobileArmedGodCardIdx(null);
    const armGodPlayerDraw=tutorialStep===TUTORIAL_FLOW.CULTIST_GOD_PLAYER_DRAW&&nextStep===TUTORIAL_FLOW.CULTIST_GOD_KEEP_HAND;
    if(armGodPlayerDraw)setTutorialGodPlayerDrawArmed(true);
    else setTutorialGodPlayerDrawArmed(false);
    setTutorialStep(nextStep);
    setGs(prev=>{
      if(!prev)return prev;
      const base=pendingBase?{...pendingBase,players:clearPendingAnimDeathFlags(pendingBase.players)}:prev;
      const nextGs=applyTutorialStepState(clearTutorialWinState(base,nextStep),nextStep);
      syncVisibleLog(nextGs?.log||[],nextGs);
      setVisualDiscard(getVisualDiscardForState(nextGs));
      setDisplayStats((nextGs?.players||[]).map(p=>({hp:p.hp,san:p.san})));
      return nextGs;
    });
  },[clearBattleAnimationState,getVisualDiscardForState,playPendingAiGodEncounterInspection,syncVisibleLog,pendingGsRef,tutorialStep]);

  const handleTutorialResultNext=useCallback(()=>{
    if(tutorialStep===TUTORIAL_FLOW.CULTIST_GOD_CHECK_INTRO){
      setTutorialInspectionResuming(true);
      setAnim(prev=>prev?{...prev,durationMs:0,onSettled:undefined}:prev);
      return;
    }
    setTutorialDiceResultResuming(true);
    // 结束骰子定格，让它正常淡出，随后播放队列中的收入牌飞入手牌动画
    setAnim(prev=>prev?{...prev,durationMs:0,onSettled:undefined}:prev);
  },[setAnim,tutorialStep]);

  const isTutorialActionAllowed=useCallback((action)=>{
    if(!showTutorial||!tutorialStepDef)return true;
    return shouldAllowTutorialAction(tutorialStep,action);
  },[showTutorial,tutorialStep,tutorialStepDef]);

  const getNextTutorialStepForAction=useCallback((action)=>{
    if(!showTutorial||!tutorialStepDef)return null;
    return nextTutorialStepAfterAction(tutorialStep,action);
  },[showTutorial,tutorialStep,tutorialStepDef]);

  const finishTutorialActionWithState=useCallback((nextGs,nextStep,queue=[])=>{
    if(!nextStep){
      if(queue?.length)triggerAnimQueue(queue,nextGs);
      else setGs(nextGs);
      return;
    }
    const playTutorialGodResurrection=showTutorial
      &&(
        (tutorialStep===TUTORIAL_FLOW.CULTIST_ZONE_SELECT_TARGET&&nextStep===TUTORIAL_FLOW.CULTIST_ZONE_RESULT)||
        (tutorialStep===TUTORIAL_FLOW.CULTIST_GOD_SELECT_TARGET&&nextStep===TUTORIAL_FLOW.CULTIST_GOD_RESULT)
      )
      &&shouldTriggerGodResurrection(nextGs);
    const tutorialGs=clearTutorialWinState(nextGs,nextStep);
    const finalTutorialGs=playTutorialGodResurrection
      ? {...tutorialGs,phase:'GOD_RESURRECTION',gameOver:null,abilityData:{},drawReveal:null,_pendingGodResurrection:undefined}
      : tutorialGs;
    const completeStep=()=>{
      applyTutorialStateSnapshot(finalTutorialGs);
      setTutorialStep(nextStep);
      if(playTutorialGodResurrection)return;
      setTutorialOverlayHidden(false);
    };
    if(queue?.length){
      const hideOverlay=playTutorialGodResurrection||tutorialStep===TUTORIAL_FLOW.HUNTER_CONFIRM_CARD||tutorialStep===TUTORIAL_FLOW.HUNTER_CONFIRM_CARD_2;
      if(hideOverlay)setTutorialOverlayHidden(true);
      triggerAnimQueue(queue,finalTutorialGs,completeStep);
    }else{
      if(playTutorialGodResurrection)setTutorialOverlayHidden(true);
      completeStep();
    }
  },[applyTutorialStateSnapshot,showTutorial,triggerAnimQueue,tutorialStep]);

  const completeTutorialGodResurrection=useCallback(()=>{
    clearBattleAnimationState();
    setGs(prev=>prev?{...prev,phase:'ACTION',gameOver:null,abilityData:{},drawReveal:null,_pendingGodResurrection:undefined}:prev);
    setTutorialOverlayHidden(false);
  },[clearBattleAnimationState]);

  useEffect(()=>{
    if(!gs?.gameOver&&gs?.phase!=='GOD_RESURRECTION')return;
    if(anim||animExiting||animQueueRef.current.length>0||pendingGsRef.current)return;
    if(gs?.gameOver&&isMultiplayerRef.current){
      gameOverPresentationFrozenRef.current=true;
      clearMultiplayerReplayState();
      return;
    }
    clearBattleAnimationState();
  },[gs?.gameOver,gs?.phase,anim,animExiting,animQueueRef,pendingGsRef,clearBattleAnimationState,clearMultiplayerReplayState]);

  useEffect(()=>{
    if(typeof document==='undefined')return;
    const handleVisibilityChange=()=>{
      if(document.visibilityState!=='visible')return;
      clearSkillAnimations();
      clearCardTransferAnimations();
      clearDamageAnimations();
      setEarthquakeVisualPlayers(null);
    };
    document.addEventListener('visibilitychange',handleVisibilityChange);
    return()=>document.removeEventListener('visibilitychange',handleVisibilityChange);
  },[clearSkillAnimations,clearCardTransferAnimations,clearDamageAnimations]);

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
    if(!same)syncVisibleLog(nextLog,gs);
  },[gs,anim,animQueueRef,syncVisibleLog]);

  useEffect(()=>{
    if(!gs||anim||animQueueRef.current.length>0||gs.gameOver||gs.phase==='PLAYER_WIN_PENDING'||gs.phase==='TREASURE_WIN'||gs.phase==='MP_PLAYER_WIN_WAIT')return;
    const normalized=moveEligibleBlankZones(gs.players,gs.log||[]);
    if(!normalized)return;
    setGs(prev=>{
      if(!prev||prev.gameOver||prev.phase==='PLAYER_WIN_PENDING'||prev.phase==='TREASURE_WIN'||prev.phase==='MP_PLAYER_WIN_WAIT')return prev;
      const recheck=moveEligibleBlankZones(prev.players,prev.log||[]);
      if(!recheck)return prev;
      return {...prev,players:recheck.players,log:recheck.log};
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs?.players,gs?.log?.length,gs?.gameOver,anim]);

  useEffect(()=>{
    if(!gs?.houndsOfTindalosActive||!houndsTimerVisible||gs?.gameOver||showTutorial){
      setHoundsSecLeft(null);
      return;
    }
    const ignoredPhases=new Set(['HUNT_WAIT_REVEAL','PLAYER_REVEAL_FOR_HUNT','CAVE_DUEL_SELECT_TARGET','CAVE_DUEL_SELECT_CARD','CAVE_DUEL_WAIT_REVEAL']);
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
        const beforePlayers=copyPlayers(P);
        const ti=prev.currentTurn;
        let damageDecision=null;
        if(P[ti]&&!P[ti].isDead){
          damageDecision=submitDamageEvents({
            players:P,deck:[...(prev.deck||[])],discard:Disc,log:L,currentTurn:prev.currentTurn,
            events:[{targetIdx:ti,lostHp:4,source:'廷达罗斯猎犬'}],
          });
          L.push(`廷达罗斯猎犬撕咬 ${P[ti].name}，其失去 4 HP`);
          if(P[ti].hp<=0&&!damageDecision.abilityData&&!P[ti]._pendingDamageLinkBreak){
            P[ti]._pendingAnimDeath = true;
            P[ti].isDead=true;P[ti].roleRevealed=true;
            L.push(`☠ ${P[ti].name}（${P[ti].role}）倒下了！`);
            if(P[ti].hand.length)Disc.push(...P[ti].hand);
            P[ti].hand=[];
            if(P[ti].godZone?.length){Disc.push(...P[ti].godZone);P[ti].godZone=[];P[ti].godName=null;P[ti].godLevel=0;}
          }
        }
        const statEventSeq=(prev._statEventSeq||0)+1;
        const statEvents=buildStatEvents(beforePlayers,P,L.slice(-2),{reason:'廷达罗斯猎犬',seq:statEventSeq});
        const houndsCard=INSPECTION_DECK.find(c=>c.effect==='houndsOfTindalos');
        let nextGs={
          ...prev,
          players:P,
          discard:Disc,
          log:L,
          houndsOfTindalosActive:false,
          houndsOfTindalosTarget:ti,
          houndsOfTindalosElapsed:0,
          inspectionDeck:houndsCard?shuffle([...(prev.inspectionDeck||[]),houndsCard]):prev.inspectionDeck,
          ...(statEvents.length?{_statEvents:[...(prev._statEvents||[]),...statEvents],_statEventSeq:statEventSeq}:{}),
        };
        if(damageDecision?.phase)nextGs={...nextGs,phase:damageDecision.phase,abilityData:damageDecision.abilityData};
        const hasDamageDecision=nextGs.phase==='TSG_SLIME_BALANCE'||nextGs.phase==='ETHEREALIZE_DECISION';
        const win=hasDamageDecision?null:checkWin(P,prev._isMP);
        return win?{...nextGs,gameOver:win}:nextGs;
      });
    },1000);
    return()=>clearInterval(iv);
  },[gs?.houndsOfTindalosActive,houndsTimerVisible,gs?.houndsOfTindalosElapsed,gs?.phase,gs?.currentTurn,gs?.gameOver,showTutorial,anim,animQueueRef]);

  useEffect(()=>{
    if(!gs||showTutorial||softGuidePauseActive||anim||animQueueRef.current.length>0||gs.gameOver||gs.phase==='AI_TURN')return;
    const events=(gs._inspectionEvents||[]).filter(ev=>ev?.seq>lastInspectionSeqRef.current);
    if(!events.length)return;
    markInspectionEventsSeen(events);
    const flow=buildInspectionEventFlow(
      {players:events[0]?.beforePlayers||gs.players,log:events[0]?.beforeLog||gs.log},
      events,
      {buildAnimQueue,copyPlayers}
    );
    const queue=flow.queue;
    triggerAnimQueue(queue,gs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs?._inspectionSeq,gs?._inspectionEvents,gs?.gameOver,anim,showTutorial,softGuidePauseActive]);

  useEffect(()=>{
    if(!gs||showTutorial||softGuidePauseActive||anim||animQueueRef.current.length>0||pendingGsRef.current||gs.gameOver)return;
    if(gs.phase!=='ACTION'&&gs.phase!=='AI_TURN')return;
    if(!(gs.proliferatingZQueue||[]).length)return;
    continueProliferatingZDraws(gs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs?.proliferatingZQueue?.length,gs?.phase,gs?.gameOver,anim,showTutorial,softGuidePauseActive]);

  // Measure player self-panel rect for tutorial steps 2-4 pointer
  useEffect(()=>{
    const rafIds=[];
    const update=()=>{
      const scriptHighlight=typeof tutorialStep==='string'?tutorialStepDef?.highlight:null;
      if(showTutorial&&((tutorialStep>=2&&tutorialStep<=4)||scriptHighlight==='selfPanel')&&selfPanelRef.current){
        const r=_getZoomCompensatedRect(selfPanelRef.current);
        if(r)setPanelRect({top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
      }
      if(showTutorial&&(tutorialStep===5||scriptHighlight==='roleText')&&roleTextRef.current){
        const r=_getZoomCompensatedRect(roleTextRef.current);
        if(r)setRoleTextRect({top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
      }
      if(showTutorial&&(tutorialStep===7||tutorialStep===15||scriptHighlight==='handArea'||scriptHighlight==='handCard'||scriptHighlight==='skillButton')&&handAreaRef.current){
        const r=_getZoomCompensatedRect(handAreaRef.current);
        if(r)setHandAreaRect({top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
      }
      if(showTutorial&&scriptHighlight==='handCards'&&handAreaRef.current){
        const cardEls=handAreaRef.current.querySelectorAll('[data-self-hand-card]');
        if(cardEls.length){
          let top=Infinity,left=Infinity,right=-Infinity,bottom=-Infinity;
          cardEls.forEach(el=>{
            const r=_getZoomCompensatedRect(el);
            if(r){
              top=Math.min(top,r.top);
              left=Math.min(left,r.left);
              right=Math.max(right,r.right);
              bottom=Math.max(bottom,r.bottom);
            }
          });
          if(top!==Infinity){
            setHandCardsRect({top,left,right,bottom,width:right-left,height:bottom-top});
          }
        }
      }
      if(showTutorial&&scriptHighlight==='handCard'&&handAreaRef.current){
        const targetCardId=tutorialStepDef?.allowedAction?.cardId;
        const cardEls=handAreaRef.current.querySelectorAll('[data-self-hand-card-id]');
        const targetEl=[...cardEls].find(el=>el.dataset.selfHandCardId===targetCardId);
        const r=targetEl?_getZoomCompensatedRect(targetEl):null;
        setTutorialHandCardRect(r?{top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height}:null);
      }
      if(showTutorial&&(tutorialStep===9||tutorialStep===11||scriptHighlight==='opponentPanel'||scriptHighlight==='swapBlind')&&aiPanelAreaRef.current){
        const r=_getZoomCompensatedRect(aiPanelAreaRef.current);
        if(r)setAiPanelAreaRect({top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
      }
      if(showTutorial&&(scriptHighlight==='opponentSanBar'||scriptHighlight==='opponentSanAndGodStatus')&&aiPanelAreaRef.current){
        const sanBarEl=aiPanelAreaRef.current.querySelector('[data-stat-label="SAN"]');
        if(sanBarEl){
          const r=_getZoomCompensatedRect(sanBarEl);
          if(r)setOpponentSanBarRect({top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
        }
      }
      if(showTutorial&&scriptHighlight==='opponentHpBar'&&aiPanelAreaRef.current){
        const hpBarEl=aiPanelAreaRef.current.querySelector('[data-stat-label="HP"]');
        if(hpBarEl){
          const r=_getZoomCompensatedRect(hpBarEl);
          if(r)setOpponentHpBarRect({top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
        }
      }
      if(showTutorial&&scriptHighlight==='singleOpponent'&&aiPanelAreaRef.current){
        const opponentEl=aiPanelAreaRef.current.querySelector('[data-pid="1"]');
        if(opponentEl){
          const r=_getZoomCompensatedRect(opponentEl);
          if(r)setSingleOpponentRect({top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
        }
      }
      if(showTutorial&&(scriptHighlight==='opponentGodStatus'||scriptHighlight==='opponentSanAndGodStatus')&&aiPanelAreaRef.current){
        const statusEl=aiPanelAreaRef.current.querySelector('[data-player-god-status="1"]');
        if(statusEl){
          const r=_getZoomCompensatedRect(statusEl);
          if(r)setOpponentGodStatusRect({top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
        }
      }
      if(showTutorial&&scriptHighlight==='drawRevealKeepButton'&&drawRevealKeepButtonRef.current){
        const r=_getZoomCompensatedRect(drawRevealKeepButtonRef.current);
        if(r)setDrawRevealKeepButtonRect({top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
      }
      if(showTutorial&&scriptHighlight==='godKeepHandButton'&&godKeepHandButtonRef.current){
        const r=_getZoomCompensatedRect(godKeepHandButtonRef.current);
        if(r)setGodKeepHandButtonRect({top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
      }
      if(showTutorial&&scriptHighlight==='dodgeRollButton'&&dodgeRollButtonRef.current){
        const r=_getZoomCompensatedRect(dodgeRollButtonRef.current);
        if(r)setDodgeRollButtonRect({top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
      }
      if(showTutorial&&scriptHighlight==='skillButton'&&skillButtonRef.current){
        const r=_getZoomCompensatedRect(skillButtonRef.current);
        if(r)setSkillButtonRect({top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
      }
      if(showTutorial&&scriptHighlight==='swapBlindHand'&&swapBlindHandRef.current){
        const r=_getZoomCompensatedRect(swapBlindHandRef.current);
        if(r)setSwapBlindHandRect({top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
      }
      if(showTutorial&&(tutorialStep===12||tutorialStep===13||scriptHighlight==='deckArea')&&deckAreaRef.current){
        const r=_getZoomCompensatedRect(deckAreaRef.current);
        if(r)setDeckAreaRect({top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
      }
    };
    update();
    const timeoutIds=[];
    if(showTutorial&&typeof tutorialStep==='string'&&(tutorialStepDef?.highlight==='drawRevealKeepButton'||tutorialStepDef?.highlight==='godKeepHandButton'||tutorialStepDef?.highlight==='dodgeRollButton')){
      // 两个模态弹窗都有 0.22s 缩放动画，等动画结束后再测量按钮真实位置
      timeoutIds.push(setTimeout(update,220));
      timeoutIds.push(setTimeout(update,320));
    }
    if(showTutorial&&typeof tutorialStep==='string'&&tutorialStepDef?.highlight==='skillButton'){
      timeoutIds.push(setTimeout(update,50));
    }
    if(showTutorial&&typeof tutorialStep==='string'&&tutorialStepDef?.highlight==='swapBlindHand'&&swapBlindHandRef.current){
      timeoutIds.push(setTimeout(update,1200));
    }
    if(showTutorial){
      window.addEventListener('scroll',update,true);
      window.addEventListener('resize',update);
      return()=>{
        rafIds.forEach(id=>cancelAnimationFrame(id));
        timeoutIds.forEach(id=>clearTimeout(id));
        window.removeEventListener('scroll',update,true);
        window.removeEventListener('resize',update);
      };
    }
  },[showTutorial,tutorialStep,tutorialStepDef,gs]);

  // ── Tutorial: 寻宝者教学关自动摸牌 ───────────
  useEffect(()=>{
    if(!showTutorial||!gs||!isScriptedTutorial)return;

    // 进入自动摸牌步骤：复用真实回合开始摸牌回放，动画结束后停在收入弹窗
    if(tutorialStep===TUTORIAL_FLOW.TREASURE_DRAW_CARD&&gs.phase==='ACTION'&&!anim&&!animExiting&&animQueueRef.current.length===0&&!pendingGsRef.current){
      const turnStartSourceGs={
        ...gs,
        currentTurn:Math.max(0,(gs.players?.length||1)-1),
        phase:'ACTION',
        drawReveal:null,
        selectedCard:null,
        abilityData:{},
      };
      const nextGs=startNextTurn(turnStartSourceGs);
      const replay=buildAppTurnStartDrawReplay(nextGs,{
        oldGs:turnStartSourceGs,
        effectOldGs:{...turnStartSourceGs,players:nextGs._playersBeforeThisDraw||turnStartSourceGs.players},
      });
      const queue=replay?.queue?.length
        ? replay.queue
        : bindAnimLogChunks(buildAnimQueue(turnStartSourceGs,nextGs),{statLogs:[]});
      if(queue.length){
        if(replay?.visualLock)visualStateLocks.lock(replay.visualLock);
        setGs(prev=>prev?{...prev,phase:'ACTION',drawReveal:null,abilityData:{}}:prev);
        triggerAnimQueue(queue,nextGs,()=>{
          applyTutorialStateSnapshot(nextGs);
          setDrawRevealKeepButtonRect(null);
          setTutorialStep(TUTORIAL_FLOW.TREASURE_DRAW_REVEAL);
        });
      }else{
        applyTutorialStateSnapshot(nextGs);
        setDrawRevealKeepButtonRect(null);
        setTutorialStep(TUTORIAL_FLOW.TREASURE_DRAW_REVEAL);
      }
      return;
    }

    if(tutorialStep===TUTORIAL_FLOW.CULTIST_GOD_OPPONENT_DRAW_START&&gs.phase==='ACTION'&&gs.currentTurn===0&&!anim&&!animExiting&&animQueueRef.current.length===0&&!pendingGsRef.current){
      const nextGs=startNextTurn({...gs,phase:'ACTION',drawReveal:null,selectedCard:null,abilityData:{}});
      const replay=buildAppTurnStartDrawReplay(nextGs,{
        oldGs:gs,
        effectOldGs:{...gs,players:nextGs._playersBeforeThisDraw||gs.players},
      });
      const queue=replay?.queue?.length
        ? replay.queue
        : bindAnimLogChunks(buildAnimQueue(gs,nextGs),{statLogs:nextGs._statLogs||[]});
      if(queue.length){
        if(replay?.visualLock)visualStateLocks.lock(replay.visualLock);
        setGs(prev=>prev?{...prev,phase:'ACTION',drawReveal:null,abilityData:{}}:prev);
        triggerAnimQueue(queue,nextGs,()=>{
          applyTutorialStateSnapshot(nextGs);
          setTutorialStep(TUTORIAL_FLOW.CULTIST_GOD_OPPONENT_DRAW);
        });
      }else{
        applyTutorialStateSnapshot(nextGs);
        setTutorialStep(TUTORIAL_FLOW.CULTIST_GOD_OPPONENT_DRAW);
      }
      return;
    }

    if(tutorialGodPlayerDrawArmed&&tutorialStep===TUTORIAL_FLOW.CULTIST_GOD_KEEP_HAND&&gs.currentTurn===1&&!anim&&!animExiting&&animQueueRef.current.length===0&&!pendingGsRef.current){
      setTutorialGodPlayerDrawArmed(false);
      const nextGs=startNextTurn({...gs,phase:'ACTION',drawReveal:null,selectedCard:null,abilityData:{}});
      const replay=buildAppTurnStartDrawReplay(nextGs,{
        oldGs:gs,
        effectOldGs:{...gs,players:nextGs._playersBeforeThisDraw||gs.players},
      });
      const queue=replay?.queue?.length
        ? replay.queue
        : bindAnimLogChunks(buildAnimQueue(gs,nextGs),{statLogs:nextGs._statLogs||[]});
      if(queue.length){
        if(replay?.visualLock)visualStateLocks.lock(replay.visualLock);
        setGs(prev=>prev?{...prev,phase:'ACTION',drawReveal:null,abilityData:{}}:prev);
        triggerAnimQueue(queue,nextGs,()=>{
          applyTutorialStateSnapshot(nextGs);
          setTutorialStep(TUTORIAL_FLOW.CULTIST_GOD_KEEP_HAND);
        });
      }else{
        applyTutorialStateSnapshot(nextGs);
        setTutorialStep(TUTORIAL_FLOW.CULTIST_GOD_KEEP_HAND);
      }
      return;
    }

    // 收入弹窗由真实对局逻辑处理；选择收入后再进入寻宝者规避教学
    if(tutorialStep===TUTORIAL_FLOW.TREASURE_DRAW_REVEAL){
      if(gs.phase==='TREASURE_DODGE_DECISION'){
        setTutorialStep(TUTORIAL_FLOW.TREASURE_DODGE_PROMPT);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[showTutorial,tutorialStep,tutorialGodPlayerDrawArmed,gs?.phase,gs?._turnKey,anim,animExiting]);

  const resolvePendingAiGodChoice=useCallback((nextTutorialStep=null)=>{
    const transition=resolveAiGodChoiceTransition(gs);
    if(!transition)return;
    const {actorIdx,godCard,abandonedGodGift,resultMsgs,state:newGs}=transition;
    const P=newGs.players;
    // AI 放弃邪神馈赠时，diff 队列无法感知邪神牌从“待决策”进入弃牌堆（旧状态里它不在任何区域），
    // 需要像玩家 GOD_CHOICE 放弃分支一样显式补一个弃牌动画，否则卡牌只会随状态快照消失。
    const abandonGiftDiscardStep=abandonedGodGift
      ?{
        type:'DISCARD',
        card:godCard,
        triggerName:P[actorIdx]?.name||'???',
        targetPid:actorIdx,
        msgs:resultMsgs.filter(msg=>typeof msg==='string'&&msg.includes('放弃了邪神的馈赠')),
      }
      :null;
    const replay=buildInspectionAwareAnimQueue(gs,newGs,{buildAnimQueue,copyPlayers});
    if(replay.inspectionEvents.length){
      lastInspectionSeqRef.current=Math.max(lastInspectionSeqRef.current,...replay.inspectionEvents.map(ev=>ev.seq||0));
    }
    const splitBeforeInspection=showTutorial&&nextTutorialStep===TUTORIAL_FLOW.CULTIST_GOD_CONVERT_CHECK&&replay.inspectionEvents.length;
    const finish=()=>{
      if(nextTutorialStep){
        applyTutorialStateSnapshot(newGs);
        setTutorialStep(nextTutorialStep);
      }
    };
    if(splitBeforeInspection){
      const firstInspectionEvent=replay.inspectionEvents[0];
      if(firstInspectionEvent){
        const mergePostConvertIdentity=(players=[])=>copyPlayers(players).map((player,idx)=>{
          const finalPlayer=newGs.players?.[idx];
          if(!finalPlayer)return player;
          return {
            ...player,
            godName:finalPlayer.godName,
            godLevel:finalPlayer.godLevel,
            godZone:[...(finalPlayer.godZone||[])],
            godEncounters:finalPlayer.godEncounters,
            godEncounterCount:finalPlayer.godEncounterCount,
            lastGodEncounterSanLoss:finalPlayer.lastGodEncounterSanLoss,
            lastGodEncounterCreatedSkull:finalPlayer.lastGodEncounterCreatedSkull,
            lastGodEncounterPatchEnabled:finalPlayer.lastGodEncounterPatchEnabled,
          };
        });
        const pausePlayers=mergePostConvertIdentity(firstInspectionEvent.beforePlayers||newGs.players);
        const beforeInspectionLog=[...(Array.isArray(replay.inspectionEvents[0]?.beforeLog)?replay.inspectionEvents[0].beforeLog:newGs.log||[])];
        const firstInspectionStatSeq=firstInspectionEvent.statEventSeq;
        const pauseStatEvents=(newGs._statEvents||[]).filter(ev=>(
          firstInspectionStatSeq==null ? true : (ev?.seq!=null&&ev.seq<firstInspectionStatSeq)
        ));
        const pauseStatSeq=pauseStatEvents.reduce((max,ev)=>Math.max(max,ev?.seq||0),gs._statEventSeq||0);
        const pauseGs={
          ...newGs,
          players:pausePlayers,
          log:beforeInspectionLog,
          _inspectionEvents:gs._inspectionEvents||[],
          _inspectionSeq:gs._inspectionSeq||0,
          _statEvents:pauseStatEvents,
          _statEventSeq:pauseStatSeq,
          _playersBeforeThisDraw:null,
          _preTurnPlayers:null,
        };
        const preInspectionQueue=buildAnimQueue(gs,pauseGs);
        const adjustedInspectionEvents=replay.inspectionEvents.map(ev=>({
          ...ev,
          beforePlayers:mergePostConvertIdentity(ev.beforePlayers||pausePlayers),
          afterPlayers:mergePostConvertIdentity(ev.afterPlayers||ev.beforePlayers||pausePlayers),
        }));
        const inspectionFlow=buildInspectionEventFlow(
          {players:pausePlayers,log:beforeInspectionLog,_statEventSeq:pauseStatSeq},
          adjustedInspectionEvents,
          {buildAnimQueue,copyPlayers}
        );
        const maxInspectionSeq=Math.max(gs._inspectionSeq||0,...adjustedInspectionEvents.map(ev=>ev?.seq||0));
        const tailStatEventSeq=Math.max(inspectionFlow.statEventSeq,newGs._statEventSeq||0);
        const tailQueue=buildAnimQueue(
          {
            players:inspectionFlow.players,
            log:inspectionFlow.log,
            _statEventSeq:tailStatEventSeq,
            _inspectionSeq:maxInspectionSeq,
          },
          newGs
        );
        tutorialGodConvertContinuationRef.current={queue:[...inspectionFlow.queue,...tailQueue],finalGs:{...newGs,_playersBeforeThisDraw:null,_preTurnPlayers:null}};
        const showConvertCheck=()=>{
          applyTutorialStateSnapshot(pauseGs);
          setTutorialStep(TUTORIAL_FLOW.CULTIST_GOD_CONVERT_CHECK);
        };
        if(preInspectionQueue.length){
          triggerAnimQueue(preInspectionQueue,pauseGs,showConvertCheck);
        }else{
          setGs(pauseGs);
          showConvertCheck();
        }
        return;
      }
    }
    if(replay.queue.length||abandonGiftDiscardStep){
      // 弃牌动画放在 diff/检定队列之后：放弃馈赠是结算的最后一步。
      const queue=[...replay.queue,...(abandonGiftDiscardStep?[abandonGiftDiscardStep]:[])];
      triggerAnimQueue(queue,newGs,nextTutorialStep?finish:undefined);
    }else{
      setGs(newGs);
      finish();
    }
  },[applyTutorialStateSnapshot,gs,showTutorial,triggerAnimQueue]);

  useEffect(()=>{
    if(showTutorial&&tutorialStep===TUTORIAL_FLOW.CULTIST_GOD_CONVERT_RESOLVE){
      if(anim||animExiting||animQueueRef.current.length>0||pendingGsRef.current)return;
      const continuation=tutorialGodConvertContinuationRef.current;
      if(continuation){
        tutorialGodConvertContinuationRef.current=null;
        const finish=()=>{
          applyTutorialStateSnapshot(continuation.finalGs);
          setTutorialStep(TUTORIAL_FLOW.CULTIST_GOD_PLAYER_DRAW);
        };
        if(continuation.queue?.length){
          triggerAnimQueue(continuation.queue,continuation.finalGs,finish);
        }else{
          finish();
        }
        return;
      }
    }
    if(!gs||gs.gameOver||gs.phase!=='AI_GOD_CHOICE')return;
    if(anim||animExiting||animQueueRef.current.length>0||pendingGsRef.current)return;
    if(showTutorial){
      if(tutorialStep!==TUTORIAL_FLOW.CULTIST_GOD_CONVERT_RESOLVE)return;
      resolvePendingAiGodChoice(TUTORIAL_FLOW.CULTIST_GOD_CONVERT_CHECK);
      return;
    }
    resolvePendingAiGodChoice();
  },[showTutorial,tutorialStep,gs,anim,animExiting,animQueueRef,pendingGsRef,applyTutorialStateSnapshot,triggerAnimQueue,resolvePendingAiGodChoice]);

  // 骰子动画结束后再显示“求生成功”教学弹窗，动画期间隐藏教学遮罩
  useEffect(()=>{
    if(!showTutorial||!tutorialDiceResultPending)return;
    if(anim||animExiting||animQueueRef.current.length>0||pendingGsRef.current)return;
    setTutorialStep(TUTORIAL_FLOW.TREASURE_DODGE_RESULT);
    setTutorialDiceResultPending(false);
  },[showTutorial,tutorialDiceResultPending,anim,animExiting,animQueueRef,pendingGsRef]);

  // 玩家点“下一步”恢复骰子动画后，等收入牌飞入动画也播完再进入掉包教学
  useEffect(()=>{
    if(!showTutorial||!tutorialDiceResultResuming)return;
    if(anim||animExiting||animQueueRef.current.length>0||pendingGsRef.current)return;
    setTutorialStep(TUTORIAL_FLOW.TREASURE_USE_SKILL);
    setTutorialDiceResultResuming(false);
  },[showTutorial,tutorialDiceResultResuming,anim,animExiting,animQueueRef,pendingGsRef]);

  useEffect(()=>{
    if(!anim)setEarthquakeVisualPlayers(null);
  },[anim]);

  // ── AI watchdog: stuck recovery + hard hang guard ───────────
  function performSinglePlayerAiDecisionRecovery(detail){
    const state=latestGsRef.current||gs;
    if(!state||isMultiplayerGame(state)||state.gameOver||state.phase!==detail?.phase)return false;
    const withCurrentState=fn=>{
      if(state!==gs){
        setGs(state);
        setTimeout(fn,0);
      }else{
        fn();
      }
      return true;
    };
    switch(state.phase){
      case 'DRAW_REVEAL':
        if(getPendingZhuHideCardForState(state))return withCurrentState(()=>handleZhuHideDrawnCard(false));
        return false;
      case 'GOD_CHOICE':
        if(getPendingZhuHideCardForState(state))return withCurrentState(()=>handleZhuHideGodCard(false));
        return false;
      case 'TSG_SLIME_BALANCE':
        return withCurrentState(()=>resolveTsathogguaSlimeBalance(false));
      case 'ETHEREALIZE_DECISION': {
        const targetIdx=state.abilityData?.targetIdx;
        return withCurrentState(()=>resolveEtherealizeRedirect(shouldAiUseEtherealize({
          player:state.players?.[targetIdx],
          lostHp:state.abilityData?.lostHp||0,
          lostSan:state.abilityData?.lostSan||0,
        })));
      }
      case 'ETHEREALIZE_SELECT_TARGET': {
        const validTargets=(state.abilityData?.adjacentTargets||[]).filter(i=>state.players?.[i]&&!state.players[i].isDead);
        const targetIdx=chooseAiEtherealizeRedirectTarget(state.players,validTargets);
        if(targetIdx==null)return false;
        return withCurrentState(()=>etherealizeSelectTarget(targetIdx));
      }
      case 'BURY_ALIVE_SELECT': {
        const actorIdx=state.abilityData?.targets?.[state.abilityData?.targetIndex||0];
        if(!state.players?.[actorIdx]?.hand?.length)return false;
        return withCurrentState(()=>buryAliveSelectCard(0,true));
      }
      case 'IGNITE_TORCH_DISCARD': {
        const actorIdx=state.abilityData?.playerIndex;
        if(!state.players?.[actorIdx]?.hand?.length)return false;
        return withCurrentState(()=>igniteTorchDiscardCard(0,true));
      }
      case 'ALBINO_CREATURE_SELECT_CARD': {
        const actorIdx=state.abilityData?.playerIndex;
        const fireCardIds=state.abilityData?.fireCardIds||[];
        const cardIdx=(state.players?.[actorIdx]?.hand||[]).findIndex(card=>fireCardIds.includes(card?.id));
        if(cardIdx<0)return false;
        return withCurrentState(()=>albinoCreatureSelectCard(cardIdx,true));
      }
      case 'DECIPHER_STONE_CARVING': {
        const revealed=state.abilityData?.revealedCards||[];
        if(!revealed.length)return false;
        return withCurrentState(()=>decipherStoneCarvingConfirm({
          handCard:revealed[0],
          deckTopCards:revealed.slice(1).reverse(),
          deckBottomCards:[],
          allowAi:true,
        }));
      }
      case 'GRAVE_DIG_SELECT': {
        const godCards=state.abilityData?.godCards||[];
        if(!godCards.length)return false;
        return withCurrentState(()=>graveDigSelectGod(0,true));
      }
      case 'SAME_ABYSS_SELECT': {
        const targetIdx=state.abilityData?.targetIdx;
        const target=state.players?.[targetIdx];
        const actorHandCount=state.abilityData?.actorHandCount??0;
        const discardCount=state.abilityData?.discardCount??0;
        const canDiscard=discardCount>0&&(target?.hand?.length||0)>actorHandCount;
        return withCurrentState(()=>sameAbyssSelect(canDiscard?'discard':'hp',true));
      }
      case 'SPHINX_GUESS':
        if(getPendingZhuHideCardForState(state))return withCurrentState(()=>handleZhuHideTopCardDuringSphinx(false));
        return withCurrentState(()=>sphinxGuess(false,true));
      case 'ZHU_HIDE_AI_DRAW':
        return withCurrentState(()=>handleZhuHideAiDrawCard(false));
      default:
        return false;
    }
  }

  const handleAiRecover=(type,detail)=>{
    if(type==='decision'&&performSinglePlayerAiDecisionRecovery(detail))return;
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
      if(type==='decision'){
        const seat=detail?.seat??p.currentTurn;
        const actorName=p.players?.[seat]?.name||p.players?.[p.currentTurn]?.name||'该AI';
        const safeLog=[...p.log,`${actorName} 的决策状态异常，系统强制推进流程`];
        const turnOwner=p.abilityData?._turnOwner??p.currentTurn;
        return startNextTurn({...p,log:safeLog,currentTurn:turnOwner,phase:'ACTION',abilityData:{},skillUsed:true,restUsed:false,huntAbandoned:[]});
      }
      return p;
    });
  };
  useAiWatchdog({gs,anim:!!anim||!!animExiting||animQueueRef.current.length>0||!!pendingGsRef.current,showTutorial,softGuidePauseActive,onRecover:handleAiRecover});

  useEffect(()=>{
    if(!gs||gs.phase!=='ZHU_HIDE_AI_DRAW'||gs.gameOver||anim||animExiting||showTutorial||softGuidePauseActive)return;
    if(gs.abilityData?.zhuIntroShown)return;
    if(!(gs._turnStartLogs||[]).length)return;
    setGs(prev=>{
      if(!prev||prev.phase!=='ZHU_HIDE_AI_DRAW')return prev;
      return {...prev,abilityData:{...prev.abilityData,zhuIntroShown:true}};
    });
    setAnim({type:'YOUR_TURN',name:gs.players[gs.currentTurn]?.name||'???',msgs:gs._turnStartLogs});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs?.phase,gs?.abilityData?.zhuIntroShown,gs?._turnKey,anim,animExiting,showTutorial,softGuidePauseActive]);

  useEffect(()=>{
    if(!gs||gs.phase!=='TSG_SLIME_BALANCE'||gs.gameOver||anim||animExiting||showTutorial||softGuidePauseActive)return;
    if(animQueueRef.current.length>0||pendingGsRef.current)return;
    if(isMultiplayerGame(gs))return;
    const targetIdx=gs.abilityData?.targetIdx;
    if(!isAiSeat(gs,targetIdx))return;
    const t=setTimeout(()=>resolveTsathogguaSlimeBalance(false),120);
    return()=>clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs?.phase,gs?.abilityData?.targetIdx,gs?.abilityData?._turnOwner,anim,animExiting,showTutorial,softGuidePauseActive]);

  function executeAiTurn(gs){
      let rawResult,newGs;
      const stepResult=executeAiTurnStep({
        snapshot:gs,
        runAiStep:aiStep,
        isDebugMode:isLocalDebugEnabled(),
        startNextTurn,
      });
      if(!stepResult.ok){
        console.error('[aiStep error]',stepResult.error);
        setGs(stepResult.recoveryGs);
        return;
      }
      ({rawResult,newGs}=stepResult);
      // If AI is hunting player 0, pause here for player input (after draw card anim)
      if(newGs.phase==='PLAYER_REVEAL_FOR_HUNT'){
        const presentation=buildAiHuntWaitPresentation({
          previousState:gs,
          rawResult,
          nextState:newGs,
          isDrawnCardActuallyDiscarded,
          buildActorTurnStartReplay,
          buildTurnStartIntroQueue,
        });
        presentation.externalVisualLocks.forEach(lock=>visualStateLocks.lock(lock));
        if(presentation.shouldMaskDiscardedTurnDraw){
          maskDiscardedTurnDrawUntilDiscardAnim(gs);
        }
        // 更新玫瑰倒刺快照，防止 useEffect 在动画结束后对已在 aiStep 中结算的弃牌重复触发
        roseThornPrevRef.current=presentation.roseThornSnapshot;
        triggerAnimQueue(presentation.queue,presentation.nextState);
        return;
      }
      try{
        // Strip ALL animation-only temp fields before storing as real game state.
        const {
          _playersBeforeNextDraw,
          _playersBeforeEndTurnReplay,
          _discardBeforeEndTurnReplay,
          _playersBeforeSkillAction,
          _preSkillLogs,
          _preSkillDiscard,
          _aiHandLimitDiscards,
          _aiHandLimitBeforePlayers,
          _aiHandLimitBeforeDiscard,
          _aiHandLimitBeforeLog,
        }=rawResult;
        newGs=stripAiPresentationFields(rawResult);
        const oldLog=Array.isArray(gs.log)?gs.log:[];
        const nextLog=Array.isArray(newGs.log)?newGs.log:oldLog;
        // Helper: build a gs-like object with substituted players for buildAnimQueue
        // fakeGs: use gs.log as the baseline so buildAnimQueue correctly detects new messages
        const fakeGs = (ps,log=gs.log) => ({...gs, players: ps, log, _statEvents: gs._statEvents || [], _statEventSeq: gs._statEventSeq || 0});
        const hasTurnStartDraw=!!gs._playersBeforeThisDraw;
        const shouldReplayTurnStart=hasTurnStartDraw&&!gs._aiTurnIntroShown;
        const aiTurnDrawnCard=hasTurnStartDraw?(rawResult._animAiDrawnCard??rawResult._aiDrawnCard??gs._aiDrawnCard??gs._drawnCard??null):null;
        const aiTurnDiscarded=hasTurnStartDraw?isDrawnCardActuallyDiscarded(rawResult,aiTurnDrawnCard):false;
        const {currentTurnLogs}=splitTransitionLogs(oldLog,nextLog);
        const actionMsgs=currentTurnLogs;
        const actionJ=actionMsgs.join(' ');
        const actionLog=[...oldLog,...actionMsgs];
        const isCurrentTurnInspectionEvent=event=>{
          const beforeLog=Array.isArray(event?.beforeLog)?event.beforeLog:[];
          const beforeDelta=beforeLog.slice(oldLog.length);
          return !beforeDelta.some(isTurnStartLog);
        };
        const queue=[];
        const aiTurnStartReplay=shouldReplayTurnStart
          ? buildActorTurnStartReplay(gs,{
              oldGs:{...gs,players:gs._playersBeforeThisDraw,log:getTurnStartDrawBaselineLog(gs)},
              effectOldGs:{...gs,players:gs._playersBeforeThisDraw,log:getTurnStartDrawBaselineLog(gs)},
              actorName:gs.players[gs.currentTurn]?.name||'???',
              forceActorName:true,
            })
          : null;
        const usedAiTurnStartReplay=!!(aiTurnStartReplay?.queue?.length);
        // Animate CTH rest-draw forced cards from turn transition
        if(rawResult._cthRestDraws?.length>0){
          const cthQueue=[
            makeCthRlyehDreamStep(gs.currentTurn,rawResult._cthRestDrawLogs||[]),
            ...rawResult._cthRestDraws.map(card=>({
              type:'DRAW_CARD',card,triggerName:'你',targetPid:0,
              msgs:rawResult._cthRestDrawLogs?.filter(l=>l.includes(card.name)||l.includes(card.key))||[]
            }))
          ];
          queue.push(...cthQueue);
        }
        if(usedAiTurnStartReplay){
          if(aiTurnStartReplay.visualLock)visualStateLocks.lock(aiTurnStartReplay.visualLock);
          maskDiscardedTurnDrawUntilDiscardAnim(gs);
          queue.push(...aiTurnStartReplay.queue);
        }else if(!gs._aiTurnIntroShown){
          queue.push(...buildTurnStartIntroQueue(gs,gs.players[gs.currentTurn]?.name||'???'));
        }
        // 2. Draw card anim for THIS AI (card drawn at turn start, stored in gs._drawnCard)
        if(!usedAiTurnStartReplay&&!gs._aiTurnIntroShown&&aiTurnDrawnCard) queue.push({type:'DRAW_CARD',card:aiTurnDrawnCard,triggerName:gs.players[gs.currentTurn]?.name||'???',targetPid:gs.currentTurn,msgs:gs._drawLogs});
        // 2b. Stat changes caused by THIS AI's drawn card (draw effects: gs._playersBeforeThisDraw → gs.players)
        if(!usedAiTurnStartReplay&&!gs._aiTurnIntroShown&&gs._playersBeforeThisDraw&&aiTurnDrawnCard){
          const drawBaselineLog=getTurnStartDrawBaselineLog(gs);
          const drawFullHandSwapQ=buildFullHandSwapTransferQueueFromLogs(
            [...(gs._drawLogs||[]),...(gs._statLogs||[])],
            gs._playersBeforeThisDraw
          );
          const drawEffectQBase=bindAnimLogChunks(buildAnimQueue(fakeGs(gs._playersBeforeThisDraw,drawBaselineLog),gs),{statLogs:gs._statLogs});
          const drawEffectQ=drawFullHandSwapQ.length
            ? [...drawFullHandSwapQ,...drawEffectQBase.filter(step=>step.type!=='CARD_TRANSFER')]
            : drawEffectQBase;
          queue.push(...drawEffectQ);
          if(drawEffectQ.length){
            visualStateLocks.lock({players:gs._playersBeforeThisDraw,zhuLight:gs.zhuLight||null});
            queue.push(statePatchStep({
              players:gs.players,
              discard:aiTurnDiscarded?removeCardsFromDiscard(gs.discard,[aiTurnDrawnCard]):gs.discard
            }));
          }
        }
        // 2c. Discard anim if AI chose to discard the drawn card
        if(!usedAiTurnStartReplay&&!gs._aiTurnDiscardShown&&aiTurnDiscarded&&aiTurnDrawnCard){
          queue.push({type:'DISCARD',card:aiTurnDrawnCard,triggerName:gs.players[gs.currentTurn]?.name||'???',targetPid:gs.currentTurn});
          queue.push(statePatchStep({players:gs.players,discard:gs.discard}));
        }
        // Append inspection events triggered by the draw
        let afterInspectionPlayers=gs.players;
        let afterInspectionLog=gs.log;
        const drawInspectionEvents=(gs._inspectionEvents||[]).filter(ev=>ev?.seq>lastInspectionSeqRef.current);
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
          queue.push(statePatchStep({
            players:_playersBeforeSkillAction,
            discard:_preSkillDiscard||newGs.discard,
            msgs:_preSkillLogs||[],
          }));
          queue.push({type:'VISUAL_LOCK',players:_playersBeforeSkillAction,zhuLight:gs.zhuLight||null});
          queue.push({type:'TURN_BOUNDARY_PAUSE'});
        }
        // 3. Dice anim (if AI rested)
        const restMsg=actionMsgs.find(m=>m.includes('选择【休息】')&&m.includes('掷骰'));
        if(restMsg){
          const m=restMsg.match(/掷骰 (\d+)[+、](\d+)，(?:取高值)?回复 (\d+)HP/);
          if(m){const rd1=+m[1],rd2=+m[2],rh=+m[3];queue.push({type:'DICE_ROLL',d1:rd1,d2:rd2,heal:rh,rollerName:rawResult._aiName||gs.players[gs.currentTurn]?.name});}}
        // 4. Skill anim (if used)
        // 提前清除 _pendingAnimDeath：STATE_PATCH 后面板立即置灰，不再等到整个队列播完
        const pendingActionInspectionEvents=(newGs._inspectionEvents||[]).filter(ev=>ev?.seq>lastInspectionSeqRef.current&&isCurrentTurnInspectionEvent(ev));
        const firstActionInspection=pendingActionInspectionEvents[0]||null;
        const P_actionEnd=clearPendingAnimDeathPlayers(rawResult._playersBeforeNextDraw||newGs.players);
        const P_actionPreInspection=clearPendingAnimDeathPlayers(firstActionInspection?.beforePlayers||P_actionEnd);
        const P_actionBeforeHandLimit=clearPendingAnimDeathPlayers(firstActionInspection
          ? P_actionPreInspection
          : (_aiHandLimitBeforePlayers||_playersBeforeEndTurnReplay||P_actionPreInspection)
        );
        const actionLogPreInspection=firstActionInspection?.beforeLog||actionLog;
        const huntEventQueue=(rawResult._aiHuntEvents||[]).flatMap(evt=>buildAiHuntEventAnimQueue(evt,gs.players[gs.currentTurn]?.name||'???'));
        const consumedApophisTargetSeq=Math.max(0,...(rawResult._aiHuntEvents||[])
          .map(evt=>evt?.apophisTargetEvent?.seq||0)
          .filter(Boolean));
        const actionOldGsForApophis=consumedApophisTargetSeq
          ? {...fakeGs(afterInspectionPlayers,afterInspectionLog),_apophisTargetSeq:Math.max(fakeGs(afterInspectionPlayers,afterInspectionLog)._apophisTargetSeq||0,consumedApophisTargetSeq)}
          : fakeGs(afterInspectionPlayers,afterInspectionLog);
        const actionVisualPatch={
          ...(Object.prototype.hasOwnProperty.call(newGs,'apophisNight')?{apophisNight:newGs.apophisNight}:{}),
          ...(newGs._apophisTargetEvent?{_apophisTargetEvent:newGs._apophisTargetEvent}:{}),
          ...(newGs._apophisTargetSeq!=null?{_apophisTargetSeq:newGs._apophisTargetSeq}:{}),
        };
        const fullHandSwapQ=buildFullHandSwapTransferQueueFromLogs(actionMsgs,afterInspectionPlayers,{
          playersBefore:afterInspectionPlayers,
          zhuLight:gs.zhuLight||null,
        });
        const actionStatQBase=buildAnimQueue(
          actionOldGsForApophis,
          {...fakeGs(P_actionBeforeHandLimit,actionLogPreInspection),...actionVisualPatch}
        );
        const hasRoseThornGiftAllHand=actionMsgs.some(m=>typeof m==='string'&&m.includes('【玫瑰倒刺】')&&m.includes('将全部手牌交给了'));
        const actionStatQ=fullHandSwapQ.length
          ? [...fullHandSwapQ,...actionStatQBase.filter(step=>step.type!=='CARD_TRANSFER')]
          : hasRoseThornGiftAllHand
            ? actionStatQBase.filter(step=>step.type!=='CARD_TRANSFER')
          : actionStatQBase;
        const handLimitDiscardCards=_aiHandLimitDiscards||[];
        const handLimitDiscardQueue=handLimitDiscardCards.length?[{
          type:'DISCARD',
          card:handLimitDiscardCards[0],
          cards:handLimitDiscardCards,
          count:handLimitDiscardCards.length,
          triggerName:gs.players[gs.currentTurn]?.name||'???',
          targetPid:gs.currentTurn,
          msgs:actionMsgs.filter(m=>m.includes('（上限）')),
        }]:[];
        const handLimitDiscardCommitQueue=handLimitDiscardCards.length&&_playersBeforeEndTurnReplay
          ?[statePatchStep({
              players:_playersBeforeEndTurnReplay,
              discard:_discardBeforeEndTurnReplay||newGs.discard,
            })]
          :[];
        const handLimitStatQueue=_aiHandLimitBeforePlayers
          ? buildAnimQueue(
              {players:_aiHandLimitBeforePlayers,discard:_aiHandLimitBeforeDiscard||gs.discard,log:_aiHandLimitBeforeLog||gs.log,_statEventSeq:gs._statEventSeq||0},
              {players:P_actionEnd,discard:newGs.discard,log:actionLog}
            ).filter(step=>step.type!=='CARD_TRANSFER')
          : [];
        const aiEndTurnReplayQueue=Array.isArray(newGs._aiEndTurnReplayQueue)
          ? newGs._aiEndTurnReplayQueue
          : [];
        let orderedActionQ=null;
        const statAnimTypes=new Set(['HP_DAMAGE','SAN_DAMAGE','HP_HEAL','SAN_HEAL','HP_SAN_HEAL','GUILLOTINE','DEATH','PETRIFY_DEATH']);
        const sanitizeActionStep=step=>{
          if(!step||!statAnimTypes.has(step.type))return step;
          const statMsgs=(Array.isArray(step.msgs)?step.msgs:[]).filter(isStatLog);
          const statLogChunk=(Array.isArray(step._logChunk)?step._logChunk:[]).filter(isStatLog);
          const fallback=statMsgs.length||statLogChunk.length?{}:{msgs:actionMsgs.filter(isStatLog)};
          return {...step,msgs:statMsgs,_logChunk:statLogChunk,...fallback};
        };
        const firstStepLogIndex=step=>{
          const explicitLines=[
            ...(Array.isArray(step?._logChunk)?step._logChunk:[]),
            ...(Array.isArray(step?.msgs)?step.msgs:[]),
          ].filter(line=>typeof line==='string'&&line.length);
          const explicitIdx=explicitLines
            .map(line=>actionMsgs.findIndex(msg=>msg===line))
            .filter(idx=>idx>=0)
            .sort((a,b)=>a-b)[0];
          if(explicitIdx!=null)return explicitIdx;
          if(statAnimTypes.has(step?.type)){
            const statIdx=actionMsgs.findIndex(isStatLog);
            if(statIdx>=0)return statIdx;
          }
          if(step?.type==='SKILL_SWAP'){
            const idx=actionMsgs.findIndex(line=>/^.+对 .+ 【掉包】/.test(line||''));
            if(idx>=0)return idx;
          }
          if(step?.type==='SKILL_HUNT'){
            const idx=actionMsgs.findIndex(line=>line?.includes('【追捕】')||line?.includes('追捕'));
            if(idx>=0)return idx;
          }
          if(step?.type==='SKILL_BEWITCH'){
            const idx=actionMsgs.findIndex(line=>line?.includes('【蛊惑】'));
            if(idx>=0)return idx;
          }
          return Number.MAX_SAFE_INTEGER;
        };
        const mergeActionQueueByLogOrder=(...groups)=>groups
          .flat()
          .filter(Boolean)
          .map((step,idx)=>({step:sanitizeActionStep(step),idx}))
          .sort((a,b)=>{
            const ai=firstStepLogIndex(a.step);
            const bi=firstStepLogIndex(b.step);
            return ai===bi?a.idx-b.idx:ai-bi;
          })
          .map(item=>item.step);
        const hasActualSwap=actionMsgs.some(m=>/^.+对 .+ 【掉包】/.test(m));
        const hasFullHandSwap=actionMsgs.some(m=>m.includes('交换了全部手牌'));
        if(hasActualSwap){
          const swapEvent=(Array.isArray(newGs._visualEvents)?newGs._visualEvents:[])
            .find(event=>event?.type==='swapCards'&&event.sourceIdx!=null&&event.targetIdx!=null);
          const swapMsgs=extractSkillLogs(actionMsgs,'swap');
          const swapIntroStep={type:'SKILL_SWAP',msgs:swapMsgs};
          const swapPlayersBefore=swapEvent?.beforePlayers||_playersBeforeSkillAction||afterInspectionPlayers;
          // 本地玩家未参与的掉包（AI↔AI 或其他两名角色互换）不向本地观众暴露牌面，
          // 飞行动画一律以背面展示
          const hideSwapCards=swapEvent&&swapEvent.sourceIdx!==0&&swapEvent.targetIdx!==0;
          const swapTransferSteps=swapEvent
            ? swapCardsSteps({
              sourceIdx:swapEvent.sourceIdx,
              targetIdx:swapEvent.targetIdx,
              sourceCount:swapEvent.sourceCount||1,
              targetCount:swapEvent.targetCount||1,
              takenCard:hideSwapCards?null:(swapEvent.takenCard||null),
              givenCard:hideSwapCards?null:(swapEvent.givenCard||null),
              msgs:swapEvent.msgs||swapMsgs,
              playersBefore:swapPlayersBefore,
              zhuLight:gs.zhuLight||null,
            })
            : [];
          if(swapTransferSteps.length){
            const swapLandingPlayers=swapEvent?.afterPlayers||P_actionBeforeHandLimit;
            const swapLandingDiscard=swapEvent?.afterDiscard||_aiHandLimitBeforeDiscard||_discardBeforeEndTurnReplay||newGs.discard;
            const swapCommitStep=statePatchStep({
              players:swapLandingPlayers,
              discard:swapLandingDiscard,
            });
            const swapLogIdx=actionMsgs.findIndex(line=>/^.+对 .+ 【掉包】/.test(line||''));
            const preSwapQ=actionStatQ.filter(step=>firstStepLogIndex(step)<swapLogIdx);
            const postSwapQ=actionStatQ.filter(step=>firstStepLogIndex(step)>=swapLogIdx);
            orderedActionQ=[...preSwapQ,swapIntroStep,...swapTransferSteps,swapCommitStep,...postSwapQ.filter(step=>step?.type!=='CARD_TRANSFER')];
          }else{
            orderedActionQ=mergeActionQueueByLogOrder(actionStatQ,swapIntroStep);
          }
        }
        else if(huntEventQueue.length){
          if(hasFullHandSwap){
            const huntStatHitSet=new Set(huntEventQueue.flatMap(s=>['GUILLOTINE','DEATH','HP_DAMAGE','HP_HEAL','SAN_HEAL','HP_SAN_HEAL','SAN_DAMAGE'].includes(s.type)?(s.hitIndices||[]):[]));
            const dedupedActionStatQ=actionStatQ.filter(s=>!(['GUILLOTINE','DEATH','HP_DAMAGE','HP_HEAL','SAN_HEAL','HP_SAN_HEAL','SAN_DAMAGE'].includes(s.type)&&(s.hitIndices||[]).some(i=>huntStatHitSet.has(i))));
            orderedActionQ=mergeActionQueueByLogOrder(dedupedActionStatQ,huntEventQueue);
          } else {
            orderedActionQ=[
              ...getAiPreHuntActionSteps(actionStatQ,actionMsgs,huntEventQueue),
              ...huntEventQueue,
            ];
          }
        }
        else if(actionJ.includes('【追捕】')||(actionJ.includes('追捕')&&!actionJ.includes('停止了追捕')&&!actionJ.includes('放弃追捕'))){
          const huntMsg=actionMsgs.find(m=>m.includes('【追捕】')||m.includes('追捕'));
          const huntMatch=huntMsg?.match(/对 (.+?) 【追捕】|追捕 (.+)/);
          const huntName=huntMatch?.[1]||huntMatch?.[2];
          const hti=huntName?newGs.players.findIndex(p=>p.name===huntName):-1;
          orderedActionQ=mergeActionQueueByLogOrder(actionStatQ,{type:'SKILL_HUNT',msgs:extractSkillLogs(actionMsgs,'hunt'),targetIdx:hti>=0?hti:1});
        }
        else if(actionJ.includes('蛊惑')){
          const bwMsg=actionMsgs.find(m=>m.includes('蛊惑'));
          const bwMatch=bwMsg?.match(/对 (.+?) 【蛊惑】/);
          const bwName=bwMatch?.[1];
          const bewitchEvent=(newGs._visualEvents||[]).find(event=>
            event?.type==='bewitchGift'
            && event.sourceIdx===gs.currentTurn
            && (event.msgs||[]).some(msg=>actionMsgs.includes(msg))
          );
          const bwti=bewitchEvent?.targetIdx??(bwName?newGs.players.findIndex(p=>p.name===bwName):-1);
          const giftedLabel=parseBewitchGiftLabel(bwMsg);
          const giftedCard=bewitchEvent?.card||((bwti>=0&&giftedLabel)
            ? (
              findCardInPlayerZonesByLabel([P_actionPreInspection[bwti],P_actionEnd[bwti],gs.players?.[gs.currentTurn]],giftedLabel)
              || findCardInPlayerZonesByLabel(newGs.players,giftedLabel)
            )
            : null);
          const bewitchMsgs=bewitchEvent?.msgs?.length
            ?bewitchEvent.msgs
            :extractSkillLogs(actionMsgs,'bewitch');
          const inspectionEvents=pendingActionInspectionEvents;
          const inspectionFlow=inspectionEvents.length
            ?buildInspectionEventFlow(
              {players:P_actionPreInspection,log:actionLogPreInspection},
              inspectionEvents,
              {buildAnimQueue,copyPlayers}
            )
            :{queue:[],players:P_actionPreInspection,log:actionLogPreInspection};
          // 摸牌阶段的视觉效果事件（如半物质化 etherealizeGain）已在回合开始重放中播过；
          // fakeGs 继承 gs._visualEvents 而 oldGs 没有，会被当作新事件在检定后重播，故此处清空。
          const postInspectionQ=inspectionEvents.length
            ?buildAnimQueue(
                {players:inspectionFlow.players,log:inspectionFlow.log,_statEventSeq:inspectionFlow.statEventSeq},
                {
                  ...fakeGs(P_actionEnd,actionLog),
                  // 改信等结算可能发生在检定之后；这些 stat events 只存在于
                  // aiStep 的最终状态，不能继续沿用本回合开始前的旧水位。
                  _statEvents:newGs._statEvents||[],
                  _statEventSeq:newGs._statEventSeq||0,
                  _visualEvents:[],
                }
              )
            :[];
          if(giftedCard&&bwti>=0){
            if(inspectionEvents.length){
              lastInspectionSeqRef.current=Math.max(lastInspectionSeqRef.current,...inspectionEvents.map(ev=>ev.seq||0));
            }
            // 飞牌落地只保留技能前的牌区外观；HP/SAN 必须取本次结算后的
            // 时间线基准，否则整组旧快照会把目标的 SAN 临时写回技能前数值。
            const bewitchSourcePatchPlayers=mergePlayerStatsIntoSnapshot(
              copyPlayers(afterInspectionPlayers),
              P_actionPreInspection,
            );
            if(bewitchSourcePatchPlayers[gs.currentTurn]&&P_actionBeforeHandLimit?.[gs.currentTurn]){
              bewitchSourcePatchPlayers[gs.currentTurn]={
                ...bewitchSourcePatchPlayers[gs.currentTurn],
                hand:[...(P_actionBeforeHandLimit[gs.currentTurn].hand||[])],
              };
            }
            orderedActionQ=buildBewitchForcedCardQueue(
              gs.currentTurn,
              bwti,
              giftedCard,
              bewitchEvent?.targetName||P_actionEnd[bwti]?.name,
              [...actionStatQ,...inspectionFlow.queue,...postInspectionQ],
              bewitchMsgs,
              {afterGiftPatch:{players:bewitchSourcePatchPlayers}}
            );
          }else{
            const bewitchStep={type:'SKILL_BEWITCH',msgs:bewitchMsgs,targetIdx:bwti>=0?bwti:1};
            if(inspectionEvents.length){
              lastInspectionSeqRef.current=Math.max(lastInspectionSeqRef.current,...inspectionEvents.map(ev=>ev.seq||0));
              orderedActionQ=mergeActionQueueByLogOrder(actionStatQ,bewitchStep,inspectionFlow.queue,postInspectionQ);
            }else{
              orderedActionQ=mergeActionQueueByLogOrder(actionStatQ,bewitchStep);
            }
          }
        }
        // Inject custom animations for multiply and sphinx reveal
        const sphinxReveal=isTurnStartSphinxRevealState(gs,rawResult._animSphinxReveal)?null:rawResult._animSphinxReveal;
        const multiplyEvent=rawResult._animMultiplyEvent;
        const damageLinkEstablishedMsg=actionMsgs.find(m=>m.includes('【两人一绳】')&&m.includes('间架起链条'));
        const animInjections=[];
        const postActionInjections=[];
        if(sphinxReveal){
          animInjections.push(...buildSphinxRevealAnimSteps(sphinxReveal,actionMsgs));
        }
        if(multiplyEvent){
          const multiplyMsg=actionMsgs.find(m=>m.includes('【繁衍】'));
          postActionInjections.push(cardTransferStep({
            fromPid:multiplyEvent.fromIdx,
            dest:'player',
            toPid:multiplyEvent.toIdx,
            count:1,
            effect:'blackGoat',
            durationMs:1500,
            msgs:multiplyMsg?[multiplyMsg]:[]
          }));
          postActionInjections.push(statePatchStep({players:P_actionEnd,discard:newGs.discard}));
        }
        if(damageLinkEstablishedMsg){
          const damageLinkPair=P_actionEnd.flatMap((player,idx)=>{
            const partnerIdx=player?.damageLink?.partner;
            if(!player?.damageLink?.active||partnerIdx==null||partnerIdx<=idx)return [];
            const partner=P_actionEnd[partnerIdx];
            if(!partner?.damageLink?.active||partner.damageLink.partner!==idx)return [];
            return [{fromPid:idx,toPid:partnerIdx}];
          })[0]||{};
          postActionInjections.push(cardTransferStep({
            ...damageLinkPair,
            effect:'damageLink',
            durationMs:1900,
            msgs:[damageLinkEstablishedMsg],
          }));
        }
        const actionQForMultiply=multiplyEvent
          ? (orderedActionQ||actionStatQ).filter(step=>step.type!=='CARD_TRANSFER')
          : (orderedActionQ||actionStatQ);
        const finalActionQ=[...animInjections,...actionQForMultiply,...postActionInjections].flatMap(step=>{
          if(step?.type==='APOPHIS_ECLIPSE'&&Object.prototype.hasOwnProperty.call(newGs,'apophisNight')){
            return [step,statePatchStep({apophisNight:newGs.apophisNight})];
          }
          return [step];
        });
        // 5. Stat changes from THIS AI's action only (not next draw — those belong to next AI's queue)
        //    Compare gs (after this AI's draw) → _playersBeforeNextDraw (after action, before next draw)
        // 6. Advance to next player's turn
        let nextTurnIntroQueue=[];
        const consumedActionStatSeq=Math.max(
          gs._statEventSeq||0,
          maxStatEventSeqFromSteps(finalActionQ),
          maxStatEventSeqFromSteps(handLimitDiscardQueue),
          maxStatEventSeqFromSteps(handLimitStatQueue),
          maxStatEventSeqFromSteps(aiEndTurnReplayQueue),
          maxStatEventSeqForLogs(newGs,currentTurnLogs)
        );
        if(isLocalCurrentTurn(newGs)){
          queue.push(...finalActionQ);
          queue.push(...handLimitDiscardQueue);
          queue.push(...handLimitDiscardCommitQueue);
          queue.push(...handLimitStatQueue);
          queue.push(...aiEndTurnReplayQueue);
          const nextTurnReplayOldGs={
            ...gs,
            players:rawResult._playersBeforeNextDraw||P_actionEnd,
            log:actionLog,
            _statEventSeq:consumedActionStatSeq,
            _inspectionSeq:lastInspectionSeqRef.current,
          };
          const nextTurnReplay=buildActorTurnStartReplay(newGs,{
            oldGs:nextTurnReplayOldGs,
            effectOldGs:{
              ...newGs,
              players:newGs._playersBeforeThisDraw||rawResult._playersBeforeNextDraw||P_actionEnd,
              log:getTurnStartDrawBaselineLog(newGs),
              _statEventSeq:consumedActionStatSeq,
              _inspectionSeq:lastInspectionSeqRef.current,
            },
            actorName:'你',
            forceActorName:true,
          });
          nextTurnIntroQueue=nextTurnReplay?.queue||[];
          if(nextTurnReplay?.visualLock)visualStateLocks.lock(nextTurnReplay.visualLock);
        }else{
          // AI next: action stat changes go before queue ends; draw effects for next AI
          // are appended here before replay hints are normalized away.
          queue.push(...finalActionQ);
          queue.push(...handLimitDiscardQueue);
          queue.push(...handLimitDiscardCommitQueue);
          queue.push(...handLimitStatQueue);
          queue.push(...aiEndTurnReplayQueue);
          nextTurnIntroQueue=[
            ...nextTurnIntroQueue,
            ...buildQueuedNextAiTurnStartReplay(newGs,{
              fromTurn:gs.currentTurn,
              playersBeforeDraw:rawResult._playersBeforeNextDraw||P_actionEnd,
              statEventSeq:consumedActionStatSeq,
            }),
          ];
          // 如果下一个是AI，且它摸首牌直接死亡导致了这局游戏结束，此时不会有真正的下一个AI回合勾子运行了，必须把它的暴毙动画立刻压入队列
          if(newGs.gameOver && newGs.currentTurn !== gs.currentTurn && !nextTurnIntroQueue.length){
            const aiNextStatQ = bindAnimLogChunks(
              buildAnimQueue(fakeGs(P_actionEnd), newGs),
              {statLogs: newGs._statLogs||[]}
            );
            nextTurnIntroQueue=[...nextTurnIntroQueue,...aiNextStatQ];
          }
        }
        // Append inspection events triggered by the AI action
        const actionInspectionEvents=(newGs._inspectionEvents||[]).filter(ev=>ev?.seq>lastInspectionSeqRef.current&&isCurrentTurnInspectionEvent(ev));
        if(actionInspectionEvents.length){
          lastInspectionSeqRef.current=Math.max(lastInspectionSeqRef.current,...actionInspectionEvents.map(ev=>ev.seq));
          const inspectionFlow=buildInspectionEventFlow(
            {players:actionInspectionEvents[0]?.beforePlayers||newGs.players,log:actionInspectionEvents[0]?.beforeLog||newGs.log},
            actionInspectionEvents,
            {buildAnimQueue,copyPlayers}
          );
          queue.push(...inspectionFlow.queue);
        }
        const explicitCurrentLogs=collectExplicitAiTurnLogs(gs,queue);
        const residualLogs=subtractLogOccurrences(currentTurnLogs,explicitCurrentLogs);
        const currentTurnQueue=appendAnimLogChunkToQueueEnd(queue,residualLogs);
        const currentTurnStatePatch=
          rawResult._playersBeforeNextDraw&&!multiplyEvent
            ? [statePatchStep({players:P_actionEnd,discard:newGs.discard})]
            : [];
        const currentQueueWithPatch=[
          ...currentTurnQueue,
          ...currentTurnStatePatch,
        ];
        // 更新玫瑰倒刺快照，防止 useEffect 在动画结束后对已在 aiStep 中结算的弃牌重复触发
        roseThornPrevRef.current=buildRoseThornSnapshot(newGs.players);
        // 确保 pendingGs 中也清除 _pendingAnimDeath，防止 STATE_PATCH 后置灰效果被覆盖
        newGs=finalizeAiPresentationState(newGs);
        if(damageLinkEstablishedMsg){
          visualStateLocks.lock({players:P_actionPreInspection,zhuLight:gs.zhuLight||null});
        }
        if(nextTurnIntroQueue.length){
          const nextTurnIntroGs=markQueuedAiTurnStartReplayShown(newGs,nextTurnIntroQueue);
          if(currentQueueWithPatch.length){
            triggerAnimQueue(currentQueueWithPatch,nextTurnIntroGs,()=>triggerAnimQueue(nextTurnIntroQueue,nextTurnIntroGs));
          }else{
            triggerAnimQueue(nextTurnIntroQueue,nextTurnIntroGs);
          }
        }else{
          triggerAnimQueue(currentQueueWithPatch,newGs);
        }
      }catch(e){
        console.error('[AI turn queue error]',e);
        const safeGs=buildAiTurnRecoveryState({
          snapshot:gs,
          error:e,
          stage:'presentation',
          startNextTurn,
        });
        setGs(safeGs);return;
      }
  }

  function handleAiTurnTimeout(snapshot){
    console.warn('[AI watchdog] AI turn exceeded 20s, force-advancing');
    const safeLog=[...snapshot.log,`${snapshot.players[snapshot.currentTurn]?.name||'该AI'} 的回合处理超时，系统强制结束其回合`];
    const safeGs=startNextTurn({...snapshot,log:safeLog,currentTurn:snapshot.currentTurn,skillUsed:true,restUsed:false,huntAbandoned:[]});
    setGs(safeGs);
  }

  useAiTurnController({
    gs,
    hasActiveAnimation:!!anim,
    showTutorial,
    softGuidePauseActive,
    isMultiplayer:isMultiplayerGame(gs),
    onExecute:executeAiTurn,
    onTimeout:handleAiTurnTimeout,
  });

  useMultiplayerStateBroadcast({
    gs,
    setGs,
    isMultiplayer,
    playerUUID,
    roomModal,
    socketRef,
    myPlayerIndexRef,
    gameEndSentRef,
    receivedGsRef,
    latestGsRef,
    consumedVisualEventIdsRef,
    anim,
    animExiting,
    showTutorial,
    animQueueRef,
    pendingGsRef,
  });

  // Auto-freeze game the instant player 寻宝者 has a winning hand
  useEffect(()=>{
    if(!gs||gs.gameOver||showTutorial)return;
    if(anim||animExiting||animQueueRef.current.length>0||pendingGsRef.current)return;
    if(gs.phase==='TREASURE_WIN'||gs.phase==='PLAYER_WIN_PENDING'||gs.phase==='MP_PLAYER_WIN_WAIT')return;
    if(gs.phase==='SWAP_STEAL_CARD'||gs.phase==='SWAP_GIVE_CARD')return;
    const p0=gs.players[0];
    if(p0&&!p0.isDead&&(p0._nyaBorrow||p0.role)===ROLE_TREASURE&&isWinHand(p0.hand)){
      setGs(g=>g?{...g,phase:'TREASURE_WIN'}:g);
    }
  },[gs,anim,animExiting,showTutorial]);

  // Handle AI automatic target selection for damage link (两人一绳)
  useEffect(()=>{
    if(!gs||gs.phase!=='DAMAGE_LINK_SELECT_TARGET'||gs.gameOver||gs.phase==='PLAYER_WIN_PENDING'||anim||animExiting||animQueueRef.current.length>0||pendingGsRef.current||showTutorial||softGuidePauseActive||isMultiplayerGame(gs))return;
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
  },[gs,anim,showTutorial,softGuidePauseActive]);

  // Handle AI automatic target selection for cave duel (穴居人战争)
  useEffect(()=>{
    if(!gs||gs.phase!=='CAVE_DUEL_SELECT_TARGET'||gs.gameOver||gs.phase==='PLAYER_WIN_PENDING'||anim||showTutorial||softGuidePauseActive||isMultiplayerGame(gs))return;
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
  },[gs,anim,showTutorial,softGuidePauseActive]);

  // Handle AI automatic target selection for rose thorn (玫瑰倒刺)
  useEffect(()=>{
    if(!gs||gs.phase!=='ROSE_THORN_SELECT_TARGET'||gs.gameOver||gs.phase==='PLAYER_WIN_PENDING'||anim||animQueueRef.current.length>0||showTutorial||softGuidePauseActive||isMultiplayerGame(gs))return;
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
    const choiceKey=`${gs._turnKey||0}:${gs.log?.length||0}:${roseThornSource}->${targetIndex}`;
    if(roseThornAutoChoiceRef.current===choiceKey)return;
    roseThornAutoChoiceRef.current=choiceKey;
    const t=setTimeout(()=>{
      const latest=latestGsRef.current;
      if(
        !latest||
        latest.phase!=='ROSE_THORN_SELECT_TARGET'||
        latest.abilityData?.roseThornSource!==roseThornSource||
        !Array.isArray(latest.abilityData?.roseThornTargets)||
        !latest.abilityData.roseThornTargets.includes(targetIndex)
      )return;
      roseThornSelectTarget(targetIndex);
    },AI_AUTO_STEP_DELAY);
    return()=>clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs,anim,showTutorial,softGuidePauseActive]);

  // Handle AI automatic target selection for peek hand (血之窥探)
  useEffect(()=>{
    if(!gs||gs.phase!=='PEEK_HAND_SELECT_TARGET'||gs.gameOver||anim||showTutorial||softGuidePauseActive||isMultiplayerGame(gs))return;
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
  },[gs,anim,showTutorial,softGuidePauseActive]);

  useEffect(()=>{
    if(!gs||gs.phase!=='FIRST_COME_PICK_SELECT'||gs.gameOver||anim||showTutorial||softGuidePauseActive)return;
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
        const proliferatingZPatch=appendPublicCardGainTriggers(prev,P,currentPicker,chosenCard);
        const nextPickIndex=(ad.pickIndex||0)+1;
        const win=checkWin(P,prev._isMP);
        if(win)return {...prev,players:P,deck:D,discard:Disc,log:L,gameOver:win,phase:'ACTION',abilityData:{},...proliferatingZPatch};
        if(nextPickIndex>=(ad.pickOrder?.length||0)||cards.length===0){
          const nextTurnOwner=ad._turnOwner??prev.currentTurn;
          return withClearedTurnAnimFields({...prev,players:P,deck:D,discard:Disc,log:L,currentTurn:nextTurnOwner,phase:isAiSeat(prev,nextTurnOwner)?'AI_TURN':'ACTION',...proliferatingZPatch,abilityData:{
            ...(ad.fromRest?{fromRest:true}:{}),
            ...(ad.cthDrawsRemaining!=null?{cthDrawsRemaining:ad.cthDrawsRemaining}:{}),
          }});
        }
        return {...prev,players:P,deck:D,discard:Disc,log:L,phase:'FIRST_COME_PICK_SELECT',...proliferatingZPatch,abilityData:{...ad,revealedCards:cards,pickIndex:nextPickIndex}};
      });
    },AI_PICK_STEP_DELAY);
    return()=>clearTimeout(t);
  },[gs,anim,showTutorial,softGuidePauseActive]);

  useEffect(()=>{
    if(!gs||gs.phase!=='ETHEREALIZE_DECISION'||gs.gameOver||anim||animExiting||showTutorial||softGuidePauseActive)return;
    if(animQueueRef.current.length>0||pendingGsRef.current)return;
    const targetIdx=gs.abilityData?.targetIdx;
    if(targetIdx==null||isLocalSeatIndex(targetIdx))return;
    if(!isAiSeat(gs,targetIdx)&&isMultiplayerGame(gs))return;
    const t=setTimeout(()=>resolveEtherealizeRedirect(shouldAiUseEtherealize({
      player:gs.players?.[targetIdx],
      lostHp:gs.abilityData?.lostHp||0,
      lostSan:gs.abilityData?.lostSan||0,
    })),AI_AUTO_STEP_DELAY);
    return()=>clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs,anim,showTutorial,softGuidePauseActive]);

  useEffect(()=>{
    if(!gs||gs.phase!=='ETHEREALIZE_SELECT_TARGET'||gs.gameOver||anim||animExiting||showTutorial||softGuidePauseActive)return;
    if(animQueueRef.current.length>0||pendingGsRef.current)return;
    const sourceIdx=gs.abilityData?.targetIdx;
    if(sourceIdx==null||isLocalSeatIndex(sourceIdx))return;
    if(!isAiSeat(gs,sourceIdx)&&isMultiplayerGame(gs))return;
    const validTargets=(gs.abilityData?.adjacentTargets||[]).filter(i=>gs.players?.[i]&&!gs.players[i].isDead);
    if(!validTargets.length)return;
    const targetIdx=chooseAiEtherealizeRedirectTarget(gs.players,validTargets);
    if(targetIdx==null)return;
    const t=setTimeout(()=>etherealizeSelectTarget(targetIdx),AI_AUTO_STEP_DELAY);
    return()=>clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs,anim,showTutorial,softGuidePauseActive]);

  useEffect(()=>{
    if(!gs||gs.phase!=='BURY_ALIVE_SELECT'||gs.gameOver||anim||showTutorial||softGuidePauseActive)return;
    if(isMultiplayerGame(gs))return;
    const ad=gs.abilityData||{};
    const targets=ad.targets||[];
    const targetIdx=targets[ad.targetIndex||0];
    if(targetIdx==null||isLocalSeatIndex(targetIdx))return;
    const t=setTimeout(()=>{
      if(!gs||gs.phase!=='BURY_ALIVE_SELECT')return;
      const currentAd=gs.abilityData||{};
      const currentTargets=currentAd.targets||[];
      const currentTarget=currentTargets[currentAd.targetIndex||0];
      if(currentTarget==null||isLocalSeatIndex(currentTarget))return;
      let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard],L=[...gs.log];
      if(!P[currentTarget]?.hand?.length)return;
      const [buriedCard]=P[currentTarget].hand.splice(0,1);
      D.push(buriedCard);
      L.push(`【活埋】${P[currentTarget].name} 将 ${cardLogText(buriedCard,{alwaysShowName:true})} 放到了牌堆底`);
      const nextTargetIndex=(currentAd.targetIndex||0)+1;
      const nextGs=nextTargetIndex>=currentTargets.length
        ? (()=>{const turnOwner=currentAd._turnOwner??gs.currentTurn;return {...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:turnOwner,phase:isAiSeat(gs,turnOwner)?'AI_TURN':'ACTION',abilityData:{
          ...(currentAd.fromRest?{fromRest:true}:{}),
          ...(currentAd.cthDrawsRemaining!=null?{cthDrawsRemaining:currentAd.cthDrawsRemaining}:{}),
        }};})()
        : {...gs,players:P,deck:D,discard:Disc,log:L,abilityData:{...currentAd,targetIndex:nextTargetIndex,buryAliveSelectedIndex:null}};
      triggerAnimQueue([
        buryToDeckStep({fromPid:currentTarget,msgs:L.slice(-1),players:gs.players}),
        statePatchStep({players:P,deck:D,log:L}),
      ],nextGs);
    },AI_PICK_STEP_DELAY);
    return()=>clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs,anim,showTutorial,softGuidePauseActive]);

  useEffect(()=>{
    if(!gs||gs.phase!=='BURY_ALIVE_SELECT'||!isMultiplayerGame(gs)||gs.gameOver||anim||animExiting||showTutorial||softGuidePauseActive)return;
    const ad=gs.abilityData||{};
    if(!Array.isArray(ad.buryAliveChoices)||!isLocalSeatIndex(ad.source))return;
    const choices=[...ad.buryAliveChoices];
    let changed=false;
    (ad.targets||[]).forEach(targetIdx=>{
      if(choices[targetIdx]||!isAiSeat(gs,targetIdx)||!gs.players?.[targetIdx]?.hand?.length)return;
      choices[targetIdx]={cardId:gs.players[targetIdx].hand[0]?.id,cardIndex:0};
      changed=true;
    });
    if(changed){
      const nextGs={...gs,abilityData:{...ad,buryAliveChoices:choices}};
      broadcastMpStateBeforeLocalReplay(nextGs);
      setGs(nextGs);
      return;
    }
    resolveSharedBuryAlive(gs,false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs,anim,animExiting,showTutorial,softGuidePauseActive]);

  const getRoseThornMarkedIds=(player,idx)=>[
    ...((player?.hand||[]).filter(card=>card?.roseThornHolderId===idx).map(card=>card.id)),
    ...((player?.godZone||[]).filter(card=>card?.roseThornHolderId===idx).map(card=>card.id)),
  ].filter(id=>id!=null);
  const roseThornPrevRef = useRef(null);
  const roseThornAutoChoiceRef = useRef(null);
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
    const damageEvents=losses.map(({ idx, lostCount }, hitOrder) => {
      L.push(`【玫瑰倒刺】${P[idx].name} 失去标记手牌，受到 ${2 * lostCount} HP 伤害`);
      return {targetIdx:idx,lostHp:2*lostCount,source:'玫瑰倒刺',order:hitOrder};
    });
    const damage=submitDamageEvents({players:P,deck:D,discard:Disc,log:L,currentTurn:gs.currentTurn,events:damageEvents});
    const win = damage.abilityData ? null : checkWin(P, gs._isMP);
    const newGs = {
      ...gs,
      players: P,
      deck: D,
      discard: Disc,
      log: L,
      ...(damage.phase?{phase:damage.phase,abilityData:damage.abilityData}:{}),
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
    clearBattleAnimationState();
    setGs(g=>g?{...g,phase:'GOD_RESURRECTION',_pendingGodResurrection:undefined}:g);
  },[gs,showTutorial,clearBattleAnimationState]);

  const isSpectating=!!(gs?._isMP&&gs?.players?.[0]?.isDead&&!gs?.gameOver);
  // isBlocked 提升到 useEffect 之前，避免依赖数组 TDZ 报错
  const isActionControlsHidden=!!anim||isSpectating||(showTutorial&&!isTutorialActionStep);
  const isBlocked=isActionControlsHidden||softGuidePauseActive;
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

  // localhost 调试钩子：一键把当前单机对局盖成"回合结束事件竞争"场景，便于复现验证 Phase C 调度器。
  // 控制台用法：
  //   __toeForceEndTurn('CTH')                 CTH Lv2 翻面 + 手牌含无尽通道 → 点【结束回合】走 CTH摸牌→通道重播
  //   __toeForceEndTurn('TSG')                 TSG Lv2 + 无尽通道 → 黄液→通道
  //   __toeForceEndTurn('CTH',{godDraw:true})  牌堆顶塞神牌，让 CTH 摸牌进 GOD_CHOICE 暂停，验决策后续跑
  //   __toeForceEndTurn('CTH',{corridor:false})仅单事件（无通道）
  // 联机验证：同一 host 开两个标签页连 localhost:3002 进同房，在行动方标签页调用后结束回合即可对比两端同步。
  useEffect(()=>{
    if(!isLocalTestMode)return;
    let nid=900000;
    const mkZone=(key)=>{const def=(FIXED_ZONE_CARD_VARIANTS_BY_KEY[key]||[])[0]||{};return {...def,id:nid++,key,letter:key[0],number:+key.slice(1),isZone:true};};
    window.__toeForceEndTurn=(god='CTH',{level=2,corridor=true,godDraw=false}={})=>{
      const base=latestGsRef.current;
      if(!base||base.gameOver){console.warn('[forceEndTurn] 需在进行中的单机对局里调用');return;}
      const P=copyPlayers(base.players),me=P[0];
      me.godName=god;me.godLevel=level;me.hasBelievedGod=true;if(god==='CTH')me.isResting=true; // CTH 需翻面休息才在回合结束摸牌
      const corridorDef=(FIXED_ZONE_CARD_VARIANTS_BY_KEY.A3||[]).find(c=>c.type==='endTurnReplayHand');
      const hand=[mkZone('A1')]; // 无尽通道左侧需有牌才会重播
      if(corridor&&corridorDef)hand.push({...corridorDef,id:nid++,key:'A3',letter:'A',number:3,isZone:true});
      me.hand=hand; // 替换手牌，保证不超限、可直接走 endTurn 而非弃牌阶段
      let deck=[...base.deck];
      if(godDraw){const gdef=GOD_DEFS.NYA;if(gdef)deck=[{id:nid++,isGod:true,godKey:'NYA',key:'NYA',type:'god',needsTarget:false,...gdef},...deck];} // 摸牌从 deck[0]，故塞队首
      setGs({...base,players:P,deck,phase:'ACTION',currentTurn:0,drawReveal:null,selectedCard:null,abilityData:{},skillUsed:false,restUsed:false});
      console.log(`[forceEndTurn] ${god} Lv${level}${god==='CTH'?'(翻面)':''}${corridor?' +无尽通道':''}${godDraw?' +牌堆顶神牌':''} 已就绪，点【结束回合】。`);
    };
    return ()=>{try{delete window.__toeForceEndTurn;}catch{/*noop*/}};
  },[isLocalTestMode]);

  useLayoutEffect(()=>{
    const prevPlayers=softGuidePrevPlayersRef.current;
    const nextPlayers=gs?.players||null;
    const queuedGuideId=getQueuedSoftGuideId({
      prevPlayers,
      nextPlayers,
      isMultiplayer:!!gs?._isMP,
      doneMap:softGuideDone,
    });
    if(queuedGuideId){
      queuedSoftGuideIdRef.current=queuedGuideId;
      setPreparingSoftGuideId(queuedGuideId);
    }
    softGuidePrevPlayersRef.current=nextPlayers?copyPlayers(nextPlayers):null;
  },[gs?.players,gs?._isMP,softGuideDone]);

  useEffect(()=>{
    if(!canPresentSoftGuide({
      gs,
      showTutorial,
      pendingSoftGuideId,
      roleSelectionPending: !!pendingRoleSelection,
      roleRevealAnim,
      anim,
      animExiting,
      animQueueLength:animQueueRef.current.length,
      hasPendingGs:!!pendingGsRef.current,
      turnStartPresentationPending:hasPendingTurnStartPresentation(gs),
    }))return;
    const toRect=r=>({top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
    const measureSoftGuideSpotlights=guideId=>{
      if(guideId===SOFT_GUIDE_IDS.REST){
        const hpBarEl=selfPanelRef.current?.querySelector?.('[data-stat-label="HP"]');
        const restButtonEl=restButtonRef.current;
        const hpRect=hpBarEl?_getZoomCompensatedRect(hpBarEl):null;
        const restRect=restButtonEl?_getZoomCompensatedRect(restButtonEl):null;
        const restReady=!!restButtonEl&&!restButtonEl.disabled;
        if(!restReady)return null;
        if(hpRect?.width&&hpRect?.height&&restRect?.width&&restRect?.height){
          return [
            { id:'self-hp', label:'HP', rect:toRect(hpRect), padding:6 },
            { id:'rest-button', label:'休息', rect:toRect(restRect), padding:7 },
          ];
        }
        return null;
      }
      if(guideId===SOFT_GUIDE_IDS.FLIP){
        const restingIdx=getFirstRestingPlayerIndex(gs.players||[]);
        const markerEl=restingIdx>=0?document.querySelector(`[data-resting-marker="${restingIdx}"]`):null;
        const markerRect=markerEl?_getZoomCompensatedRect(markerEl):null;
        if(markerRect?.width&&markerRect?.height){
          return [{ id:`resting-marker-${restingIdx}`, label:'翻面', rect:toRect(markerRect), padding:7 }];
        }
        return null;
      }
      return [];
    };
    const showSoftGuideWhenReady=guideId=>{
      let rafId=null;
      let cancelled=false;
      const needsSpotlight=guideId===SOFT_GUIDE_IDS.REST||guideId===SOFT_GUIDE_IDS.FLIP;
      setPreparingSoftGuideId(guideId);
      const tryShowGuide=()=>{
        if(cancelled)return;
        if(
          latestGsRef.current!==gs||
          pendingSoftGuideId||
          softGuideDone[guideId]||
          roleRevealAnim||
          anim||
          animExiting||
          animQueueRef.current.length>0||
          pendingGsRef.current||
          hasPendingTurnStartPresentation(latestGsRef.current)
        ){
          setPreparingSoftGuideId(prev=>prev===guideId?null:prev);
          return;
        }
        const spotlights=measureSoftGuideSpotlights(guideId);
        if(spotlights){
          setSoftGuideSpotlights(spotlights);
          setPreparingSoftGuideId(prev=>prev===guideId?null:prev);
          setPendingSoftGuideId(guideId);
          markSoftGuideSeen(guideId);
          return;
        }
        if(needsSpotlight){
          rafId=requestAnimationFrame(tryShowGuide);
        }else{
          setSoftGuideSpotlights([]);
          setPreparingSoftGuideId(prev=>prev===guideId?null:prev);
          setPendingSoftGuideId(guideId);
          markSoftGuideSeen(guideId);
        }
      };
      rafId=requestAnimationFrame(tryShowGuide);
      return()=>{
        cancelled=true;
        if(rafId)cancelAnimationFrame(rafId);
        setPreparingSoftGuideId(prev=>prev===guideId?null:prev);
      };
    };
    const queuedGuideId=queuedSoftGuideIdRef.current;
    if(queuedGuideId&&SOFT_GUIDE_DEFS[queuedGuideId]&&!softGuideDone[queuedGuideId]){
      queuedSoftGuideIdRef.current=null;
      return showSoftGuideWhenReady(queuedGuideId);
    }
    if(shouldTriggerRestSoftGuide(gs,softGuideDone))return showSoftGuideWhenReady(SOFT_GUIDE_IDS.REST);
  },[
    gs,
    showTutorial,
    pendingSoftGuideId,
    pendingRoleSelection,
    roleRevealAnim,
    anim,
    animExiting,
    softGuideDone,
    markSoftGuideSeen,
    animQueueRef,
    pendingGsRef,
  ]);

  useEffect(()=>{
    if(!gs?._endTurnReplay||showTutorial||softGuidePauseActive||anim||animQueueRef.current.length>0||pendingGsRef.current)return;
    if(gs.phase==='ACTION'&&!gs.drawReveal&&!gs.gameOver){
      continueEndTurnReplay(gs);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs?._endTurnReplay,gs?.phase,gs?.drawReveal,gs?.gameOver,anim,showTutorial,softGuidePauseActive]);

  useEffect(()=>{
    if(!['MULTIPLY_SELECT_TARGET','SHU_SELECT_TARGET'].includes(gs?.phase)){
      committedTargetActionRef.current=false;
    }
  },[gs?.phase]);

  // 1. 兜底与静默同步：当没有动画在播放时，且不处于AI回合（AI回合中draw效果已bake进gs但动画尚未开始），UI 强制对齐真实的底层数据
  useEffect(() => {
    if (gs?.players && (!anim && (!animQueueRef.current || animQueueRef.current.length === 0))) {
      if (gs.phase === 'AI_TURN') return;
      setDisplayStats(gs.players.map(p => ({ hp: p.hp, san: p.san })));
    }
  }, [gs?.players, anim, gs?.phase, animQueueRef]);

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
            if (Array.isArray(anim.statEvents) && anim.statEvents.length) {
              return applyStatEventsToDisplayStats(prev, anim.statEvents, anim.type);
            }
            const next = [...prev];
            targets.forEach(pid => {
              if (next[pid] && ts[pid]) {
                if(anim.type==='HP_DAMAGE'||anim.type==='HP_HEAL'){
                  next[pid] = {...next[pid],hp:ts[pid].hp};
                }else if(anim.type==='SAN_DAMAGE'||anim.type==='SAN_HEAL'){
                  next[pid] = {...next[pid],san:ts[pid].san};
                }else{
                  next[pid] = { hp: ts[pid].hp, san: ts[pid].san };
                }
              }
            });
            return next;
          });
        }, 350);
        return () => clearTimeout(timer);
      }
    }
  }, [anim]);

  function getMpDecisionKey(state=gs){
    const ad=state?.abilityData||{};
    return [
      state?.phase||'',
      state?.currentTurn??'',
      state?._turnKey??'',
      state?.drawReveal?.card?.id||'',
      ad.pickIndex??'',
      ad.swapTi??'',
      ad.targetIdx??'',
      ad.caveDuelSource??'',
      ad.caveDuelTarget??'',
      ad.huntTi??'',
      ad.roseThornSource??'',
      ad.peekHandSource??'',
      ad.damageLinkSource??'',
      ad.targetIndex??'',
      ad.playerIndex??'',
      ad.source??'',
      ad.zhuResolved?'zhuGodDone':'',
      state?.drawReveal?.zhuResolved?'zhuDrawDone':'',
      getPendingZhuHideCardForState(state)?.id||'',
      state?.log?.length??0,
    ].join(':');
  }

  function isLocalMpDrawChoicePhase(state=gs){
    if(!isLocalDrawDecisionPhase(state))return false;
    const dr=state?.drawReveal;
    if(!dr?.needsDecision||dr.forcedKeep||dr.fromRest)return false;
    return !getPendingZhuHideCardForState(state);
  }

  function isLocalMpGodChoicePhase(state=gs){
    if(!isLocalGodChoicePhase(state))return false;
    if(state?.abilityData?.fromRest)return false;
    return !getPendingZhuHideCardForState(state);
  }

  function getDefaultTargetForMpDecision(state=gs){
    if(!state)return null;
    const ad=state.abilityData||{};
    const P=state.players||[];
    const firstValid=list=>(Array.isArray(list)?list:[]).find(i=>P[i]&&!P[i].isDead)??null;
    if(state.phase==='SWAP_SELECT_TARGET')return firstValid(P.map((_,i)=>i).filter(i=>i!==0&&P[i]?.hand?.length));
    if(state.phase==='HUNT_SELECT_TARGET')return firstValid(P.map((_,i)=>i).filter(i=>i!==0&&hasHuntRevealableCard(P[i])&&!(state.huntAbandoned||[]).includes(i)));
    if(state.phase==='BEWITCH_SELECT_TARGET')return firstValid(P.map((_,i)=>i).filter(i=>i!==0));
    if(state.phase==='ZONE_SWAP_SELECT_TARGET')return firstValid(P.map((_,i)=>i).filter(i=>i!==0));
    if(state.phase==='PEEK_HAND_SELECT_TARGET')return firstValid(ad.peekHandTargets);
    if(state.phase==='CAVE_DUEL_SELECT_TARGET')return firstValid(ad.caveDuelTargets);
    if(state.phase==='DAMAGE_LINK_SELECT_TARGET')return firstValid(ad.damageLinkTargets);
    if(state.phase==='ROSE_THORN_SELECT_TARGET')return firstValid(ad.roseThornTargets);
    if(state.phase==='MULTIPLY_SELECT_TARGET')return firstValid(P.map((_,i)=>i).filter(i=>i!==0));
    if(state.phase==='SHU_SELECT_TARGET')return firstValid(P.map((_,i)=>i).filter(i=>canGodPowerAffect(P[i])));
    if(state.phase==='ETHEREALIZE_SELECT_TARGET')return firstValid(ad.adjacentTargets);
    if(state.phase==='IGNITE_TORCH_DISCARD')return firstValid([ad.playerIndex]);
    if(state.phase==='ALBINO_CREATURE_SELECT_CARD')return firstValid([ad.playerIndex]);
    return null;
  }

  function getDefaultHandCardIndexForMpDecision(state=gs){
    const hand=state?.players?.[0]?.hand||[];
    if(!hand.length)return -1;
    if(state?.phase==='ALBINO_CREATURE_SELECT_CARD'){
      const fireCardIds=state?.abilityData?.fireCardIds||[];
      return hand.findIndex(c=>fireCardIds.includes(c?.id));
    }
    if(state?.phase!=='CAVE_DUEL_SELECT_CARD'&&state?.phase!=='CAVE_DUEL_WAIT_REVEAL')return 0;
    return getBestCaveDuelCardIndex(hand);
  }

  function getBuryAliveLocalPendingTarget(state=gs){
    const ad=state?.abilityData||{};
    const choices=ad.buryAliveChoices;
    return Array.isArray(choices)
      ?(ad.targets||[]).find(idx=>isLocalSeatIndex(idx)&&!choices[idx])
      :(ad.targets||[])[ad.targetIndex||0];
  }

  function getRandomHandCardIndex(hand=[]){
    if(!hand.length)return -1;
    return Math.floor(Math.random()*hand.length);
  }

  function isLocalCaveDuelCardDecisionPhase(state=gs){
    if(!state||!['CAVE_DUEL_SELECT_CARD','CAVE_DUEL_WAIT_REVEAL'].includes(state.phase))return false;
    const ad=state.abilityData||{};
    if(isLocalSeatIndex(ad.caveDuelSource))return !ad.sourceCard;
    if(isLocalSeatIndex(ad.caveDuelTarget))return !ad.targetCard;
    return false;
  }

  function isMpBlockingDecisionPhase(state=gs){
    if(!isMultiplayerGame(state))return false;
    if(state?.phase==='BURY_ALIVE_SELECT'&&Array.isArray(state.abilityData?.buryAliveChoices)){
      return (state.abilityData.targets||[]).some(idx=>!state.abilityData.buryAliveChoices[idx]);
    }
    if(['CAVE_DUEL_SELECT_CARD','CAVE_DUEL_WAIT_REVEAL'].includes(state?.phase)){
      const ad=state.abilityData||{};
      return !ad.sourceCard||!ad.targetCard;
    }
    return isLocalMpDecisionPhase(state);
  }

  function isLocalMpDecisionPhase(state=gs){
    if(!state||state.gameOver)return false;
    if(isLocalZhuHideDecisionPhase(state))return true;
    if(isLocalMpDrawChoicePhase(state))return true;
    if(isLocalMpGodChoicePhase(state))return true;
    if(isLocalTreasureDodgePhase(state))return true;
    if(isLocalTreasureAoEDodgePhase(state))return true;
    if(isLocalNyaBorrowPhase(state))return true;
    if(isLocalTortoiseSelectPhase(state))return !!state.abilityData?.selectableKeys?.length;
    if(isLocalFirstComePicker(state))return true;
    if(state.phase==='SWAP_STEAL_CARD'&&isLocalCurrentTurn(state))return !!state.players?.[state.abilityData?.swapTi]?.hand?.length;
    if(isLocalPublicCardPickPhase(state))return true;
    if(state.phase==='GRAVE_DIG_SELECT'&&isLocalSeatIndex(state.abilityData?.playerIndex))return !!state.abilityData?.godCards?.length;
    if(isLocalSameAbyssTargetPhase(state))return true;
    if(isLocalSphinxGuessPhase(state))return true;
    if(state.phase==='TSG_SLIME_BALANCE')return isLocalSeatIndex(state.abilityData?.targetIdx);
    if(state.phase==='ETHEREALIZE_DECISION')return isLocalSeatIndex(state.abilityData?.targetIdx);
    if(canLocalActOnTargetSelectionPhase(state))return getDefaultTargetForMpDecision(state)!=null;
    if(state.phase==='BURY_ALIVE_SELECT'){
      const target=getBuryAliveLocalPendingTarget(state);
      return isLocalSeatIndex(target)&&getDefaultHandCardIndexForMpDecision(state)>=0;
    }
    if(state.phase==='IGNITE_TORCH_DISCARD'&&isLocalSeatIndex(state.abilityData?.playerIndex)){
      return getDefaultHandCardIndexForMpDecision(state)>=0;
    }
    if(state.phase==='ALBINO_CREATURE_SELECT_CARD'&&isLocalSeatIndex(state.abilityData?.playerIndex)){
      return getDefaultHandCardIndexForMpDecision(state)>=0;
    }
    if(state.phase==='DECIPHER_STONE_CARVING'&&isLocalSeatIndex(state.abilityData?.playerIndex)){
      return true;
    }
    if((state.phase==='CAVE_DUEL_SELECT_CARD'||state.phase==='CAVE_DUEL_WAIT_REVEAL')&&isLocalCaveDuelCardDecisionPhase(state)){
      return getDefaultHandCardIndexForMpDecision(state)>=0;
    }
    return false;
  }

  function performMpDecisionTimeout(){
    if(!gs||isBlocked)return;
    if(gs.phase==='BURY_ALIVE_SELECT'&&Array.isArray(gs.abilityData?.buryAliveChoices)){
      if(isLocalSeatIndex(gs.abilityData?.source))resolveSharedBuryAlive(gs,true);
      return;
    }
    if(!isLocalMpDecisionPhase(gs))return;
    if(isLocalZhuHideDecisionPhase(gs)){
      if(gs.phase==='DRAW_REVEAL'){handleZhuHideDrawnCard(false);return;}
      if(gs.phase==='GOD_CHOICE'){handleZhuHideGodCard(false);return;}
      if(gs.phase==='SPHINX_GUESS'){handleZhuHideTopCardDuringSphinx(false);return;}
      if(gs.phase==='ZHU_HIDE_AI_DRAW'){handleZhuHideAiDrawCard(false);return;}
    }
    if(isLocalMpDrawChoicePhase(gs)){handleDrawDiscard();return;}
    if(isLocalMpGodChoicePhase(gs)){godResolvePlayer('discard');return;}
    if(gs.phase==='TREASURE_DODGE_DECISION'){handleTreasureDodgeSkip();return;}
    if(gs.phase==='TREASURE_AOE_DODGE_DECISION'){handleTreasureAOEDodgeSkip();return;}
    if(gs.phase==='NYA_BORROW'){nyaSkip();return;}
    if(gs.phase==='TORTOISE_ORACLE_SELECT'){
      const key=gs.abilityData?.selectableKeys?.[0];
      if(key!=null)tortoiseOracleSelect(key);
      return;
    }
    if(gs.phase==='FIRST_COME_PICK_SELECT'){firstComePickSelectCard(0);return;}
    if(gs.phase==='SWAP_STEAL_CARD'){swapSelectTargetCard(0);return;}
    if(gs.phase==='HUNT_SELECT_CARD_FROM_PUBLIC'){huntSelectCardFromPublic(0);return;}
    if(gs.phase==='GRAVE_DIG_SELECT'){graveDigSelectGod(0);return;}
    if(gs.phase==='SAME_ABYSS_SELECT'){sameAbyssSelect('hp');return;}
    if(gs.phase==='SPHINX_GUESS'){sphinxGuess(false);return;}
    if(gs.phase==='TSG_SLIME_BALANCE'){resolveTsathogguaSlimeBalance(false);return;}
    if(gs.phase==='ETHEREALIZE_DECISION'){resolveEtherealizeRedirect(false);return;}
    if(gs.phase==='BURY_ALIVE_SELECT'){
      const cardIdx=getDefaultHandCardIndexForMpDecision(gs);
      if(cardIdx>=0)buryAliveSelectCard(cardIdx);
      return;
    }
    if(gs.phase==='IGNITE_TORCH_DISCARD'){
      const cardIdx=getDefaultHandCardIndexForMpDecision(gs);
      if(cardIdx>=0)igniteTorchDiscardCard(cardIdx);
      return;
    }
    if(gs.phase==='ALBINO_CREATURE_SELECT_CARD'){
      const cardIdx=getDefaultHandCardIndexForMpDecision(gs);
      if(cardIdx>=0)albinoCreatureSelectCard(cardIdx);
      return;
    }
    if(gs.phase==='DECIPHER_STONE_CARVING'){
      const ad=gs.abilityData||{};
      const revealed=ad.revealedCards||[];
      if(revealed.length){
        const handCard=revealed[0];
        const remaining=revealed.filter(c=>c.id!==handCard.id);
        decipherStoneCarvingConfirm({
          handCard,
          deckTopCards:[...remaining].reverse(),
          deckBottomCards:[],
        });
      }
      return;
    }
    if(gs.phase==='CAVE_DUEL_SELECT_CARD'||gs.phase==='CAVE_DUEL_WAIT_REVEAL'){
      const cardIdx=getRandomHandCardIndex(me.hand);
      if(cardIdx>=0)caveDuelSelectCard(cardIdx,me.hand[cardIdx]);
      return;
    }
    const targetIdx=getDefaultTargetForMpDecision(gs);
    if(targetIdx!=null)handleAIClick(targetIdx);
  }

  const { cdSecondsLeft, cdType } = useRoomCountdown(roomModal, playTickSound);
  const mpCthSec = useMpCthDecisionTimer({ isMpCthDecisionPhase, gs, playTickSound, setGs });
  const mpDiscardSec = useMpDiscardTimer({ isMultiplayer, gs, isLocalCurrentTurn, playTickSound, setGs });
  const timerMe = gs?.players?.[0] || null;
  const timerIsHuntTarget = !!gs && isLocalHuntTargetSeat(gs);
  const isLocalMpDecisionActive=!!gs
    &&!showTutorial
    &&!anim
    &&!animExiting
    &&animQueueRef.current.length===0
    &&!pendingGsRef.current
    &&isLocalMpDecisionPhase(gs);
  const isSharedBuryAliveDecisionActive=!!gs
    &&gs.phase==='BURY_ALIVE_SELECT'
    &&Array.isArray(gs.abilityData?.buryAliveChoices)
    &&!gs.gameOver
    &&!showTutorial
    &&!anim
    &&!animExiting
    &&animQueueRef.current.length===0
    &&!pendingGsRef.current
    &&(isLocalSeatIndex(gs.abilityData.source)||(gs.abilityData.targets||[]).some(isLocalSeatIndex));
  const isMpDecisionTimerActive=isLocalMpDecisionActive||isSharedBuryAliveDecisionActive;
  const pendingGsForTurnTimer=pendingGsRef.current;
  const isMpTurnTimerSuspended=!!(roleRevealAnim||anim||animExiting||animQueueRef.current.length>0||pendingGsForTurnTimer);
  const isMpTurnTransitionPending=!!(
    gs
    &&pendingGsForTurnTimer
    &&(
      pendingGsForTurnTimer.currentTurn!==gs.currentTurn
      ||pendingGsForTurnTimer._turnKey!==gs._turnKey
    )
  );
  const mpTurnSec = useMpTurnTimer({
    isMultiplayer,
    gs,
    isLocalCurrentTurn,
    isMpCthDecisionPhase,
    isMpDecisionPhase: isMpBlockingDecisionPhase(gs),
    isTurnTimerSuspended: isMpTurnTimerSuspended,
    playTickSound,
    setGs,
  });
  const mpHuntSec = useMpHuntRevealTimer({ isMultiplayer, gs, isLocalHuntTarget: timerIsHuntTarget, me: timerMe, playTickSound, setGs });
  const mpDecisionSec=useMpDecisionTimer({
    isMultiplayer,
    gs,
    isLocalDecisionActive:isMpDecisionTimerActive,
    decisionKey:getMpDecisionKey(gs),
    playTickSound,
    onTimeout:performMpDecisionTimeout,
  });

  useEffect(()=>{
    if(!isMultiplayer||!gs||gs.gameOver)return;
    if(isMpTurnTransitionPending){
      mpTurnExpiredRef.current=false;
      return;
    }
    if(!isLocalCurrentTurn(gs)||gs.phase!=='ACTION'){
      mpTurnExpiredRef.current=false;
      return;
    }
    if(mpTurnSec===0)mpTurnExpiredRef.current=true;
    if(!mpTurnExpiredRef.current||gs._mpEndTurn)return;
    if(isBlocked||animExiting||animQueueRef.current.length>0||pendingGsRef.current)return;
    setGs(p=>p?{...p,_mpEndTurn:true}:p);
  },[isMultiplayer,gs,mpTurnSec,isBlocked,animExiting,isMpTurnTransitionPending,animQueueRef,pendingGsRef]);

  useVisualDiscardSync({ gs, anim, animQueueRef, pendingGsRef, getVisualDiscardForState, setVisualDiscard });

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
    // 直接从 gs 读取，避免 functional update（functional update 内无法调用 setAnim）
    mpTurnExpiredRef.current=false;
    const timeoutSource=gs;
    const base=resolveMpTimeoutToAction({...gs,_mpEndTurn:undefined});
    const finishTimeoutTurn=(resolvedBase)=>{
      const win=checkWin(resolvedBase.players,true);
      if(win){setGs({...resolvedBase,gameOver:win});return;}
      const baseHandLimit=getHandLimitForPlayer(resolvedBase.players?.[0]);
      if(resolvedBase.players[0].hand.length>baseHandLimit){
        setGs({...resolvedBase,phase:'DISCARD_PHASE',abilityData:{discardSelected:[],fromEndTurn:true}});
        return;
      }
      const nextGs=startNextTurn({...resolvedBase,currentTurn:0});
      applyNextTurnGs(nextGs);
    };
    const dr=timeoutSource.drawReveal;
    const shouldAnimateDrawDiscard=timeoutSource.phase==='DRAW_REVEAL'&&dr?.card&&dr.needsDecision&&!dr.forcedKeep;
    if(shouldAnimateDrawDiscard){
      const drawerIdx=dr.drawerIdx??0;
      const who=localDisplayName(drawerIdx,(dr.drawerName||timeoutSource.players?.[drawerIdx]?.name||'该玩家'));
      const discardMsg=`(超时) ${who} 弃置了 ${cardLogText(dr.card,{alwaysShowName:true})}`;
      const win=checkWin(base.players,true);
      if(win){
        triggerAnimQueue([{type:'DISCARD',card:dr.card,triggerName:who,targetPid:drawerIdx,msgs:[discardMsg]}],{...base,gameOver:win});
        return;
      }
      const baseHandLimit=getHandLimitForPlayer(base.players?.[0]);
      if(base.players[0].hand.length>baseHandLimit){
        triggerAnimQueue([{type:'DISCARD',card:dr.card,triggerName:who,targetPid:drawerIdx,msgs:[discardMsg]}],{...base,phase:'DISCARD_PHASE',abilityData:{discardSelected:[],fromEndTurn:true}});
        return;
      }
      const timeoutDiscardEvent=createTimedOutDrawDiscardEvent({
        card:dr.card,
        drawerIdx,
        drawerName:timeoutSource.players?.[drawerIdx]?.name||dr.drawerName||'该玩家',
      });
      const nextGs={
        ...startNextTurn({...base,currentTurn:0}),
        _mpTimedOutDrawDiscard:timeoutDiscardEvent,
        _visualEvents:timeoutDiscardEvent?[timeoutDiscardEvent]:[],
      };
      if(isMultiplayer&&socketRef.current&&roomModal?.roomId){
        suppressNextBroadcastRef.current=true;
        receivedGsRef.current=true;
        if(nextGs._visualEvents?.length){
          markConsumedVisualEvents(consumedVisualEventIdsRef.current,nextGs._visualEvents);
        }
        socketRef.current.emit('mpStateSync',{roomId:roomModal.roomId,gs:derotateGs(nextGs,myPlayerIndexRef.current)});
      }
      const drawStatQ=bindAnimLogChunks(
        buildAnimQueue({...gs,players:nextGs._playersBeforeThisDraw||gs.players},nextGs),
        {statLogs:nextGs._statLogs}
      );
      const preTurnQ=buildTsathogguaSlimeGrantQueue(nextGs);
      const ph=nextGs.phase;
      const drawnCard=ph==='GOD_CHOICE'?nextGs.abilityData?.godCard:nextGs.drawReveal?.card;
      const nextActorName=nextGs.players?.[nextGs.currentTurn]?.name||'???';
      const nextActorPid=nextGs.currentTurn;
      const queue=[{type:'DISCARD',card:dr.card,triggerName:who,targetPid:drawerIdx,msgs:[discardMsg]},...preTurnQ];
      if(drawnCard&&(ph==='DRAW_REVEAL'||ph==='GOD_CHOICE'||ph==='DRAW_SELECT_TARGET'||ph==='ACTION')){
        queue.push({type:'YOUR_TURN',name:nextActorName,msgs:nextGs._turnStartLogs});
        queue.push({type:'DRAW_CARD',card:drawnCard,triggerName:nextActorPid===0?'你':nextActorName,targetPid:nextActorPid,msgs:nextGs._drawLogs});
        queue.push(...drawStatQ);
      }else if(nextGs._turnStartLogs?.length){
        queue.push({type:'YOUR_TURN',name:nextActorPid===0?undefined:nextActorName,msgs:nextGs._turnStartLogs});
        queue.push(...drawStatQ);
      }else{
        queue.push(...drawStatQ);
      }
      if(nextGs._playersBeforeThisDraw){
        visualStateLocks.lock({players:nextGs._playersBeforeThisDraw,zhuLight:gs.zhuLight||nextGs.zhuLight||null});
      }
      triggerAnimQueue(queue,{...nextGs,_mpTimedOutDrawDiscard:null,_visualEvents:[]});
      return;
    }
    finishTimeoutTurn(base);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs?._mpEndTurn,isBlocked]);

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
    const canWorshipFromHand=!!armedCard?.isGod&&!isUpgrade;
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

  // ── Swap blind-draw overlay trigger (must be before any early return) ──
  useEffect(()=>{
    if(!gs||gs.phase!=='SWAP_STEAL_CARD'||!isLocalCurrentTurn(gs)||gs.abilityData?.swapTi==null)return;
    const targetPi=gs.abilityData.swapTi;
    const targetPlayer=gs.players[targetPi];
    if(!targetPlayer||!targetPlayer.hand?.length)return;
    const handSnapshot=targetPlayer.hand.map((card,idx)=>({
      idx,
      card,
      isFaceUp:!!targetPlayer.revealHand||isBlackGoatYoung(card)||isTsathogguaSlime(card),
    }));
    setSwapBlindDraw({phase:'shuffling',targetPi,handSnapshot});
    const timer=setTimeout(()=>{
      setSwapBlindDraw(prev=>prev&&prev.targetPi===targetPi?{...prev,phase:'selecting'}:prev);
    },1200);
    return()=>clearTimeout(timer);
  // The hand snapshot is intentionally captured only when entering/changing this decision.
  // Re-running for unrelated gs updates would restart the 1.2s shuffle indefinitely.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs?.phase,gs?.abilityData?.swapTi]);
  // Clean up overlay when leaving SWAP_STEAL_CARD
  useEffect(()=>{
    if(gs?.phase!=='SWAP_STEAL_CARD'&&swapBlindDrawRef.current){
      setSwapBlindDraw(null);
    }
  },[gs?.phase]);

  // ── Tutorial: show steal-card hint after blind-draw shuffle ends ──
  useEffect(()=>{
    if(!showTutorial)return;
    if(swapBlindDraw?.phase!=='selecting')return;
    if(tutorialStep!==TUTORIAL_FLOW.TREASURE_SELECT_TARGET)return;
    setTutorialStep(TUTORIAL_FLOW.TREASURE_STEAL_CARD);
  },[showTutorial,swapBlindDraw?.phase,tutorialStep,setTutorialStep]);

  // ── Loading Screen ───────────────────────────────────────────
  const handleGodResurrectionDone=useCallback(()=>setShowGodResurrection(true),[]);

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
              <LoadingPentagramSpinner style={{marginRight:10}} />
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
        startNewGame={startNewGame}
        handleMultiplayer={handleMultiplayer}
        multiLoading={multiLoading}
        onOpenAbout={()=>setModal('about')}
        onOpenRoadmap={()=>setModal('roadmap')}
        isDisconnected={isDisconnected}
        onDisconnectedReset={resetDisconnectedToStart}
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
      <GlobalAnimLayer
        anim={anim}
        animExiting={animExiting}
        playEndlessCorridorTunnelSound={playEndlessCorridorTunnelSound}
      />
      {modal==='about'&&<Suspense fallback={null}><AboutModal onClose={()=>setModal(null)}/></Suspense>}
      {modal==='roadmap'&&<Suspense fallback={null}><RoadmapModal onClose={()=>setModal(null)}/></Suspense>}
      {/* -- Room Modal -- */}
        <RoomModal
          roomModal={roomModal}
          playerUUID={playerUUID}
          cdType={cdType}
          cdSecondsLeft={cdSecondsLeft}
          onClose={closeRoomModal}
          onTogglePrivacy={handleTogglePrivacy}
          onSetReady={handleSetReady}
          onCopyRoomId={()=>copyRoomIdToClipboard(roomModal.roomId)}
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
          show={showTutorial&&tutorialStep===1}
          step={tutorialStep}
          onComplete={completeTutorial}
          onStart={_startForTutorial}
        />
        {roleRevealAnim&&<RoleRevealAnim role={roleRevealAnim.role} onDone={()=>_onRoleRevealDone(roleRevealAnim.pendingGs)}/>}
        {/* -- Connection error modal -- */}
        <ConnectionErrorModal
          show={connErrModal}
          onClose={()=>setConnErrModal(false)}
        />
        <style>{GLOBAL_STYLES}</style>
      {/* GammaSlider outside filtered lobby container */}
      <GammaSlider gamma={gamma} onChange={handleGamma} musicVolume={musicVolume} onMusicVolumeChange={handleMusicVolume} sfxVolume={sfxVolume} onSfxVolumeChange={handleSfxVolume}/>
      <DebugControls
        isLocalTestMode={isLocalTestMode}
        localDebugMode={localDebugMode}
        onToggleDebugMode={()=>setLocalDebugMode(v=>!v)}
        showSettings={showDebugSettings}
        onToggleShowSettings={()=>setShowDebugSettings(v=>!v)}
        debugForceCard={debugForceCard} setDebugForceCard={setDebugForceCard}
        debugForceCardTarget={debugForceCardTarget} setDebugForceCardTarget={setDebugForceCardTarget}
        debugForceCardKeep={debugForceCardKeep} setDebugForceCardKeep={setDebugForceCardKeep}
        debugForceCardType={debugForceCardType} setDebugForceCardType={setDebugForceCardType}
        debugForceZoneCardKey={debugForceZoneCardKey} setDebugForceZoneCardKey={setDebugForceZoneCardKey}
        debugForceZoneCardName={debugForceZoneCardName} setDebugForceZoneCardName={setDebugForceZoneCardName}
        debugForceGodCardKey={debugForceGodCardKey} setDebugForceGodCardKey={setDebugForceGodCardKey}
        debugTutorialPromptMode={debugTutorialPromptMode} setDebugTutorialPromptMode={setDebugTutorialPromptMode}
        debugExpansionKey={debugExpansionKey} setDebugExpansionKey={setDebugExpansionKey}
        debugRoleCompositionKey={debugRoleCompositionKey} setDebugRoleCompositionKey={setDebugRoleCompositionKey}
      />
    </>);
  }

  // ── Game Over ──────────────────────────────────────────────
  if(gs.gameOver){
    const{winner,reason,winnerIdx}=gs.gameOver;
    const gameOverFullLog=buildCompleteGameOverLog(gs,visibleLogRef.current);
    const myRole=gs.players[0].role;
    const iWon=winner==='LOSE'||winner==='LOSE_ALL'?false
      :winner===ROLE_TREASURE?isLocalWinnerSeat(gs.gameOver)
      :(winner===myRole);
    const isLose=winner==='LOSE'||winner==='LOSE_ALL';

    // 邪祀者获胜：先全屏播放邪神复活特效，onConfirm 后再显示结算
    if(winner===ROLE_CULTIST&&!showGodResurrection){
      return <GodResurrectionAnim onDone={handleGodResurrectionDone}/>;
    }
    // 每个视角都按房间座位次序播放所有寻宝者胜者的藏宝图；
    // PLAYER_WIN_PENDING / MP_PLAYER_WIN_WAIT 已展示过的那一位从序列中剔除。
    const treasureWinnerIndices=winner===ROLE_TREASURE
      ?[winnerIdx,gs.gameOver.winnerIdx2].filter((idx,pos,all)=>Number.isInteger(idx)&&all.indexOf(idx)===pos)
      :[];
    const unseenTreasureWinners=treasureWinnerIndices.filter(idx=>{
      if(idx===0&&localTreasureMapShownRef.current)return false;
      if(idx===winnerIdx&&gs._isMP&&mpTreasureWaitShownRef.current)return false;
      return true;
    });
    const treasureMapWinnerIdx=unseenTreasureWinners[treasureMapAckCount];
    if(winner===ROLE_TREASURE&&Number.isInteger(treasureMapWinnerIdx)){
      const winnerPlayer=gs.players?.[treasureMapWinnerIdx];
      return (
        <TreasureMapAnim
          hand={winnerPlayer?.hand||[]}
          subtitle={`${winnerPlayer?.name||''} 集齐了全部编号！`}
          autoConfirmMs={3000}
          onConfirm={()=>setTreasureMapAckCount(count=>count+1)}
        />
      );
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
              gameOverPresentationFrozenRef.current=true;
              clearMultiplayerReplayState();
              setIsMultiplayer(false);isMultiplayerRef.current=false;
              setMyPlayerIndex(0);myPlayerIndexRef.current=0;
              mpRoleRevealedRef.current=false;gameEndSentRef.current=false;
              consumedVisualEventIdsRef.current=new Set();
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
              <button onClick={()=>startNewGame({skipTutorialPrompt:true})} style={{
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
        <button
          type="button"
          className="surveyMascot"
          onClick={()=>window.open('https://v.wjx.cn/vm/mGJYO4f.aspx','_blank','noopener,noreferrer')}
          aria-label="点我填写问卷"
        >
          <span className="surveyMascotBubble">喜欢这个游戏吗？点我填写问卷吧</span>
          <span className="surveyMascotBody" aria-hidden="true">
            <span className="surveyMascotFace">
              <span className="surveyMascotEye surveyMascotEyeLeft"/>
              <span className="surveyMascotEye surveyMascotEyeRight"/>
              <span className="surveyMascotSmile"/>
            </span>
            <span className="surveyMascotBook"/>
          </span>
        </button>
        {showFullLog&&<FullLogModal log={gameOverFullLog} onClose={()=>setShowFullLog(false)}/>}
        <GammaSlider gamma={gamma} onChange={handleGamma} musicVolume={musicVolume} onMusicVolumeChange={handleMusicVolume} sfxVolume={sfxVolume} onSfxVolumeChange={handleSfxVolume}/>
        {roleRevealAnim&&<RoleRevealAnim role={roleRevealAnim.role} onDone={()=>_onRoleRevealDone(roleRevealAnim.pendingGs)}/>}
        <style>{GLOBAL_STYLES}</style>
      </div>
    );
  }

  // ── Main Game ──────────────────────────────────────────────
  const me=gs.players[0];
  const effectiveRole=me._nyaBorrow||me.role;
  const effectiveHandLimit=getHandLimitForPlayer(me);
  const currentTurnPlayer=gs?.players?.[gs?.currentTurn];
  const myTurn=isLocalCurrentTurn(gs);
  // 只有当底层是玩家回合，且没有正在播放的动画，且动画队列为空时，才算真正轮到玩家
  const isVisualPlayerTurn = myTurn && !isSpectating && !anim && (animQueueRef.current.length === 0);
  const visualCurrentTurn=((anim||animExiting||animQueueRef.current.length>0)&&turnHighlightLockRef.current!=null)
    ?turnHighlightLockRef.current
    :gs.currentTurn;
  const isAwaitingAiTurnDrawQueue=gs.phase==='AI_TURN'
    &&gs._playersBeforeThisDraw
    &&!anim
    &&!animExiting
    &&animQueueRef.current.length===0
    &&!pendingGsRef.current;
  const awaitingAiTurnPlayers=isAwaitingAiTurnDrawQueue
    ?(gs._preTurnPlayers||gs._playersBeforeThisDraw)
    :null;
  const visualPlayers=earthquakeVisualPlayers
    ?earthquakeVisualPlayers
    :((anim||animExiting||animQueueRef.current.length>0)&&visualPlayersLockRef.current)
    ?visualPlayersLockRef.current
    :awaitingAiTurnPlayers
    ?awaitingAiTurnPlayers
    :gs.players;
  const visualMe=visualPlayers[0];
  const mobileArmedGodCard=isMobile&&mobileArmedGodCardIdx!=null?visualMe.hand[mobileArmedGodCardIdx]:null;
  const mobileArmedGodTooltipRect=mobileArmedGodCardIdx!=null?(()=>{
    const wrapEl=mobileGodCardRefs.current.get(mobileArmedGodCardIdx);
    const cardEl=wrapEl?.firstElementChild||wrapEl;
    return _getZoomCompensatedRect(cardEl);
  })():null;
  const phase=gs.phase;
  const isTutorialGodResurrection=showTutorial&&(
    tutorialStep===TUTORIAL_FLOW.CULTIST_ZONE_RESULT||
    tutorialStep===TUTORIAL_FLOW.CULTIST_GOD_RESULT
  )&&tutorialOverlayHidden&&phase==='GOD_RESURRECTION';
  const zhuLightForView=((anim||animExiting||animQueueRef.current.length>0)&&visualZhuLightLockRef.current)
    ?visualZhuLightLockRef.current
    :gs.zhuLight;
  const zhuDrawHiddenCardId=getZhuDrawHiddenCardId(anim,zhuLightForView);
  const zhuHiddenCardId=anim?.type==='ZHU_HIDE_CARD'
    ?anim.card?.id
    :zhuDrawHiddenCardId
      ?zhuDrawHiddenCardId
    :((anim||animExiting||animQueueRef.current.length>0)&&zhuHiddenCardIdLockRef.current)
      ?zhuHiddenCardIdLockRef.current
      :null;
  const zhuLitCardsForView=visualMe?.godName==='ZHU'
    ?getZhuLitDeckCards(zhuLightForView,gs.deck)
    :[];
  const pendingZhuDrawAnyCard=phase==='DRAW_REVEAL'&&gs.drawReveal?.card&&!gs.drawReveal?.zhuResolved&&zhuLightForView?.cardIds?.includes(gs.drawReveal.card.id)
    ?gs.drawReveal.card
    :null;
  const pendingZhuGodAnyCard=phase==='GOD_CHOICE'&&gs.abilityData?.godCard&&!gs.abilityData?.zhuResolved&&zhuLightForView?.cardIds?.includes(gs.abilityData.godCard.id)
    ?gs.abilityData.godCard
    :null;
  const pendingZhuSphinxAnyCard=phase==='SPHINX_GUESS'&&gs.deck?.[0]?.id&&zhuLightForView?.cardIds?.includes(gs.deck[0].id)
    ?gs.deck[0]
    :null;
  const pendingZhuAiDrawAnyCard=phase==='ZHU_HIDE_AI_DRAW'&&(gs.abilityData?.zhuIntroShown||!(gs._turnStartLogs||[]).length)
    ?(gs.abilityData?.zhuGuard?.card||getZhuTopGuard(gs,gs.deck)?.card||null)
    :null;
  const pendingZhuAnyCard=pendingZhuDrawAnyCard||pendingZhuGodAnyCard||pendingZhuSphinxAnyCard||pendingZhuAiDrawAnyCard;
  const pendingZhuDrawCard=visualMe?.godName==='ZHU'&&pendingZhuDrawAnyCard
    ?gs.drawReveal.card
    :null;
  const pendingZhuGodCard=visualMe?.godName==='ZHU'&&pendingZhuGodAnyCard
    ?gs.abilityData.godCard
    :null;
  const pendingZhuSphinxCard=visualMe?.godName==='ZHU'&&pendingZhuSphinxAnyCard
    ?gs.deck[0]
    :null;
  const pendingZhuAiDrawCard=visualMe?.godName==='ZHU'&&pendingZhuAiDrawAnyCard
    ?pendingZhuAiDrawAnyCard
    :null;
  const ri=RINFO[me.role];
  const skillRi=gs.globalOnlySwapOwner!=null?RINFO['寻宝者']:(RINFO[effectiveRole]||ri);
  const effectiveSkillName=skillRi.skillName||ri.skillName;
  const suppressAnim=showTutorial&&typeof tutorialStep==='number'&&tutorialStep>=2; // hide all anims during legacy tutorial steps 2+
  const huntAbandoned=gs.huntAbandoned||[];
  const isResolvingHuntReveal=gs.phase==='HUNT_CONFIRM'
    &&pendingGsRef.current
    &&pendingGsRef.current.phase!=='HUNT_CONFIRM';
  const huntRevealStateForView=isResolvingHuntReveal
    ?pendingGsRef.current
    :(animExiting&&pendingGsRef.current?.phase==='HUNT_CONFIRM')
    ?pendingGsRef.current
    :gs;
  const huntRevealTargetPid=huntRevealStateForView?.abilityData?.huntTi;
  const huntRevealCard=huntRevealStateForView?.abilityData?.revCard;
  const sameHuntRevealCard=(stepCard,revealedCard)=>{
    if(!stepCard||!revealedCard)return false;
    const stepStableId=stepCard.id??stepCard.uid;
    const revealedStableId=revealedCard.id??revealedCard.uid;
    if(stepStableId!=null||revealedStableId!=null)return stepStableId===revealedStableId;
    return (stepCard.key??stepCard.name??stepCard.letter)===(revealedCard.key??revealedCard.name??revealedCard.letter);
  };
  const isSameHuntRevealStep=step=>(
    step?.type==='HUNT_REVEAL_CARD'
    &&step?.targetPid===huntRevealTargetPid
    &&sameHuntRevealCard(step.card,huntRevealCard)
  );
  const huntRevealCardAnimating=(isSameHuntRevealStep(anim)&&!animExiting)
    ||animQueueRef.current.some(isSameHuntRevealStep);
  const huntRevealBadgeShadowSuppressed=isSameHuntRevealStep(anim);
  const huntRevealBadge=(
    huntRevealStateForView?.phase==='HUNT_CONFIRM'
    &&huntRevealCard
    &&!isLocalSeatIndex(huntRevealTargetPid)
    &&!huntRevealCardAnimating
  )?{card:huntRevealCard,targetPid:huntRevealTargetPid}:null;

  // ── Action handlers ────────────────────────────────────────
  // CTH 「梦访拉莱耶」: after a draw decision (keep/discard/god) triggered while resting,
  // process any remaining draws (cthDrawsRemaining) then advance the turn.
  function makeCthRlyehDreamStep(targetPid=0,msgs=[]){
    return {type:'CTH_RLYEH_DREAM',targetPid,msgs:Array.isArray(msgs)?msgs.filter(Boolean):[]};
  }

  function continueProliferatingZDraws(stateLike){
    const flow=buildProliferatingZDrawFlow(stateLike,{
      copyPlayers,
      localDisplayName,
      isAiSeat,
      aiDrawAndApply,
      playerDrawCard,
      drawCardDecisionText,
      hasEffectDecisionState,
      deriveEffectDecisionState,
      splitAnimBoundLogs,
      bindAnimLogChunks,
      buildAnimQueue,
      statePatchStep,
    });
    if(!flow.handled)return false;
    if(flow.action==='setState'){
      setGs(flow.state);
      return true;
    }
    if(flow.action==='triggerQueueAndContinue'){
      triggerAnimQueue(flow.queue,null,()=>{if(!continueProliferatingZDraws(flow.state))setGs(flow.state);});
      return true;
    }
    if(flow.action==='triggerQueue'){
      triggerAnimQueue(flow.queue,flow.state);
      return true;
    }
    return false;
  }

  function finishCthRestDraws(baseGsAfterDecision,P,D,Disc,L){
    const finishedGs=buildCthRestDrawFinishedState({stateLike:baseGsAfterDecision,players:P,deck:D,discard:Disc,log:L});
    // Phase C：CTH 是回合结束事件序列中的一环，结算完毕后交回调度器推进到下一事件（黄液/无尽通道）。
    if(inEndTurnSeq())return advanceEndTurnSeq(finishedGs);
    if(hasPendingEndTurnReplay(P)&&beginEndTurnReplay(finishedGs,P,D,Disc,L))return;
    const nextGs=startNextTurn(finishedGs);
    applyNextTurnGs(nextGs);
  }

  function _tsgContinueTurnStartDraw(baseGsAfterDecision){
    let P=copyPlayers(baseGsAfterDecision.players),D=[...baseGsAfterDecision.deck],Disc=[...baseGsAfterDecision.discard],L=[...baseGsAfterDecision.log];
    const abilityData=baseGsAfterDecision.abilityData||{};
    const turnOwner=Number.isInteger(abilityData._turnOwner)
      ?abilityData._turnOwner
      :Number.isInteger(baseGsAfterDecision.drawReveal?.drawerIdx)
        ?baseGsAfterDecision.drawReveal.drawerIdx
        :Number.isInteger(baseGsAfterDecision.currentTurn)
          ?baseGsAfterDecision.currentTurn
          :0;
    const drawerIdx=P[turnOwner]?turnOwner:0;
    const drawerName=localDisplayName(drawerIdx,P[drawerIdx]?.name||'该角色');
    const isAiDrawer=isAiSeat(baseGsAfterDecision,drawerIdx)&&!baseGsAfterDecision._isMP;
    const pendingSlime=baseGsAfterDecision.abilityData?.pendingTsathogguaSlime;
    if(pendingSlime){
      let holderIdx=drawerIdx;
      let slimeIdx=(P[holderIdx]?.hand||[]).findIndex(c=>c&&(pendingSlime.id!=null?c.id===pendingSlime.id:c===pendingSlime||isTsathogguaSlime(c)));
      if(slimeIdx<0){
        holderIdx=P.findIndex(player=>(player?.hand||[]).some(c=>c&&(pendingSlime.id!=null?c.id===pendingSlime.id:c===pendingSlime||isTsathogguaSlime(c))));
        slimeIdx=holderIdx>=0?(P[holderIdx].hand||[]).findIndex(c=>c&&(pendingSlime.id!=null?c.id===pendingSlime.id:c===pendingSlime||isTsathogguaSlime(c))):-1;
      }
      if(holderIdx>=0&&slimeIdx>=0){
        const playersBeforeSlimePop=copyPlayers(P);
        const [removed]=P[holderIdx].hand.splice(slimeIdx,1);
        const msg=`【无定形体】${P[holderIdx].name} 的1张撒托古亚的赐福黏液消失`;
        L.push(msg);
        const nextAbilityData={
          ...(baseGsAfterDecision.abilityData||{}),
          pendingTsathogguaSlime:undefined,
        };
        const cleanedAbilityData=Object.fromEntries(Object.entries(nextAbilityData).filter(([,v])=>v!==undefined));
        const poppedGs={...baseGsAfterDecision,players:P,log:L,abilityData:cleanedAbilityData};
        triggerAnimQueue([
          {type:'TSG_SLIME_POP',targetPid:holderIdx,count:1,cards:[removed||pendingSlime].filter(Boolean),msgs:[msg],visualSetupPatch:{players:playersBeforeSlimePop}},
          statePatchStep({players:P,log:L,abilityData:cleanedAbilityData}),
          {type:'TURN_BOUNDARY_PAUSE',durationMs:160},
        ],null,()=>_tsgContinueTurnStartDraw(poppedGs));
        return;
      }
    }
    const pendingSlimes=Array.isArray(baseGsAfterDecision.abilityData?.pendingTsathogguaSlimes)
      ?baseGsAfterDecision.abilityData.pendingTsathogguaSlimes.filter(Boolean)
      :[];
    const continuingSlime=pendingSlimes[0]||null;
    const remainingSlimes=pendingSlimes.slice(1);
    const _P_beforeDraw=copyPlayers(P);
    const res=isAiDrawer
      ?aiDrawAndApply(drawerIdx,P,D,Disc,{...baseGsAfterDecision,currentTurn:drawerIdx,deferAiGodChoice:true})
      :playerDrawCard(P,D,Disc,drawerIdx,{...baseGsAfterDecision,currentTurn:drawerIdx});
    P=res.P;D=res.D;Disc=res.Disc;
    const drawLogs=[];
    const statLogs=[];
    if(res.reshuffleLog)drawLogs.push(res.reshuffleLog);
    if(res.drawnCard&&!res.kept)drawLogs.push(continuingSlime?`【无定形体】${drawerName}${drawerName==='你'?'':' '}额外摸到 ${drawCardDecisionText(res.drawnCard)}`:`${drawerName} 摸到 ${drawCardDecisionText(res.drawnCard)}`);
    if(res.effectMsgs?.length){
      if(res.needGodChoice||res.pendingAiGodChoice||res.statePatch?._pendingAiGodChoice){
        const split=splitGodEncounterReplayLogs(res.effectMsgs);
        drawLogs.push(...split.encounterLogs);
        statLogs.push(...split.inspectionLogs);
      }else{
        const split=splitAnimBoundLogs(res.effectMsgs);
        drawLogs.push(...split.preStat);
        statLogs.push(...split.stat);
      }
    }
    if(drawLogs.length)L.push(...drawLogs);
    if(statLogs.length)L.push(...statLogs);
    const baseMeta={
      ...baseGsAfterDecision,
      players:P,
      deck:D,
      discard:Disc,
      log:L,
      currentTurn:drawerIdx,
      skillUsed:false,
      restUsed:false,
      huntAbandoned:[],
      godFromHandUsed:false,
      godTriggeredThisTurn:false,
      globalOnlySwapOwner:baseGsAfterDecision.globalOnlySwapOwner,
      _playersBeforeThisDraw:_P_beforeDraw,
      _turnStartLogs:[],
      _drawLogs:drawLogs,
      _turnDrawEvents:res.drawnCard?[{card:res.drawnCard,drawerIdx,drawerName:P[drawerIdx]?.name,sourcePile:res.sourcePile,msgs:drawLogs.slice(0,1),fromTsathogguaSlime:!!continuingSlime}]:[],
      _statLogs:statLogs,
      _preTurnPlayers:baseGsAfterDecision._preTurnPlayers,
      _drawSourcePile:res.sourcePile,
      ...(isAiDrawer?{_aiDrawnCard:res.drawnCard??null,_drawnCard:res.drawnCard??null,_discardedDrawnCard:!!res.discardedDrawnCard}:{}),
    };
    if(!res.drawnCard){
      setGs({...baseMeta,phase:isAiDrawer?'AI_TURN':'ACTION',drawReveal:null,selectedCard:null,abilityData:{}});
      return;
    }
    const shouldContinueAfterResolvedSlimeDraw=(phase)=>!!continuingSlime&&(phase==='AI_TURN'||phase==='ACTION');
    const buildResolvedDrawQueue=(newGs,{discarded=false}={})=>{
      const inferred=bindAnimLogChunks(
        buildAnimQueue({...baseGsAfterDecision,players:_P_beforeDraw,log:baseGsAfterDecision.log},newGs),
        {statLogs}
      );
      const hasDraw=inferred.some(step=>step?.type==='DRAW_CARD'&&step.card===res.drawnCard);
      const hasDiscard=inferred.some(step=>step?.type==='DISCARD'&&step.card===res.drawnCard);
      const hasKeepTransfer=inferred.some(step=>step?.type==='CARD_TRANSFER'&&step.effect==='draw'&&step.cards?.some(card=>card===res.drawnCard||card?.id===res.drawnCard?.id));
      const queue=[
        ...(hasDraw?[]:[{type:'DRAW_CARD',card:res.drawnCard,triggerName:drawerName,targetPid:drawerIdx,msgs:drawLogs}]),
        ...inferred,
      ];
      if(discarded&&!hasDiscard){
        queue.push({type:'DISCARD',card:res.drawnCard,triggerName:drawerName,targetPid:drawerIdx});
      }else if(!discarded&&!hasKeepTransfer){
        queue.push(cardTransferStep({
          fromPid:drawerIdx,
          dest:'player',
          toPid:drawerIdx,
          count:1,
          sourceAnchor:'playerArea',
          effect:'draw',
          cards:[res.drawnCard],
        }));
      }
      queue.push(statePatchStep({players:P,deck:D,discard:Disc,log:L,phase:newGs.phase,drawReveal:newGs.drawReveal,abilityData:newGs.abilityData}));
      return queue;
    };
    if(res.needGodChoice||res.pendingAiGodChoice||res.statePatch?._pendingAiGodChoice){
      const pendingAiGodChoice=res.pendingAiGodChoice||res.statePatch?._pendingAiGodChoice||null;
      const phase=pendingAiGodChoice?'AI_GOD_CHOICE':'GOD_CHOICE';
      const godAbilityData=pendingAiGodChoice
        ?{...pendingAiGodChoice}
        :{godCard:res.drawnCard,drawerIdx,godEncounterCost:res.godEncounterCost};
      const newGs={...baseMeta,...(res.statePatch||{}),phase,abilityData:{...godAbilityData,...(continuingSlime?{fromTsathogguaSlime:true,continueTurnStartDraw:true,pendingTsathogguaSlime:continuingSlime,pendingTsathogguaSlimes:remainingSlimes}: {})},drawReveal:null,selectedCard:null,_drawnCard:res.drawnCard};
      const drawStep={type:'DRAW_CARD',card:res.drawnCard,triggerName:drawerName,targetPid:drawerIdx,msgs:drawLogs};
      const queue=buildGodChoiceDrawInspectionQueue({
        oldGs:{...baseGsAfterDecision,players:_P_beforeDraw,log:baseGsAfterDecision.log,_statEventSeq:baseGsAfterDecision._statEventSeq||0,_inspectionSeq:baseGsAfterDecision._inspectionSeq||0},
        newGs,
        drawStep,
      });
      triggerAnimQueue(queue,newGs);
      return;
    }
    const win=checkWin(P,baseGsAfterDecision._isMP);
    if(win){
      setGs({...baseMeta,gameOver:win,phase:'ACTION',drawReveal:null,selectedCard:null,abilityData:{},...(res.statePatch||{})});
      return;
    }
    if(res.discardedDrawnCard){
      const finalPhase=isAiDrawer?'AI_TURN':'ACTION';
      const continuationAbility=continuingSlime?{fromTsathogguaSlime:true,continueTurnStartDraw:true,pendingTsathogguaSlime:continuingSlime,pendingTsathogguaSlimes:remainingSlimes}:{};
      const newGs={...baseMeta,...(res.statePatch||{}),phase:finalPhase,drawReveal:null,selectedCard:null,abilityData:continuationAbility};
      const queue=buildResolvedDrawQueue(newGs,{discarded:true});
      triggerAnimQueue(queue,newGs,shouldContinueAfterResolvedSlimeDraw(finalPhase)?()=>_tsgContinueTurnStartDraw(newGs):undefined);
      return;
    }
    if(res.kept){
      const fallbackPhase=isAiDrawer?'AI_TURN':'ACTION';
      const decisionState=deriveEffectDecisionState(res.statePatch,{baseAbilityData:{},fallbackPhase});
      const continuationAbility=continuingSlime?{fromTsathogguaSlime:true,continueTurnStartDraw:true,pendingTsathogguaSlime:continuingSlime,pendingTsathogguaSlimes:remainingSlimes}:{};
      const pendingAiGodChoice=res.pendingAiGodChoice||res.statePatch?._pendingAiGodChoice||null;
      const finalPhase=pendingAiGodChoice?'AI_GOD_CHOICE':(decisionState.phase==='ACTION'?fallbackPhase:decisionState.phase);
      const finalAbilityData=pendingAiGodChoice?{...pendingAiGodChoice}:decisionState.abilityData;
      const newGs={...baseMeta,...(res.statePatch||{}),phase:finalPhase,drawReveal:null,selectedCard:null,abilityData:{...finalAbilityData,...continuationAbility}};
      const queue=buildResolvedDrawQueue(newGs,{discarded:false});
      triggerAnimQueue(queue,newGs,shouldContinueAfterResolvedSlimeDraw(finalPhase)?()=>_tsgContinueTurnStartDraw(newGs):undefined);
      return;
    }
    const newGs={...baseMeta,phase:'DRAW_REVEAL',drawReveal:{card:res.drawnCard,msgs:res.effectMsgs,needsDecision:!!res.needsDecision,forcedKeep:!!res.forcedKeep,drawerIdx,drawerName:P[drawerIdx].name,sourcePile:res.sourcePile,fromTsathogguaSlime:!!continuingSlime},selectedCard:null,abilityData:continuingSlime?{fromTsathogguaSlime:true,continueTurnStartDraw:true,pendingTsathogguaSlime:continuingSlime,pendingTsathogguaSlimes:remainingSlimes}:{}};
    triggerAnimQueue([{type:'DRAW_CARD',card:res.drawnCard,triggerName:drawerName,targetPid:drawerIdx,msgs:drawLogs}],newGs);
  }

  function _cthContinueRestDraws(baseGsAfterDecision){
    let P=copyPlayers(baseGsAfterDecision.players),D=[...baseGsAfterDecision.deck],Disc=[...baseGsAfterDecision.discard],L=[...baseGsAfterDecision.log];
    const remaining=getCthRestDrawRemaining(baseGsAfterDecision);
    const fromRest=baseGsAfterDecision.abilityData?.fromRest;
    if(baseGsAfterDecision._cthFresh){
      // Phase C：调度器首次进入 CTH 事件，补回原入口点内联循环的"梦访拉莱耶"引导日志。
      L.push(`你（克苏鲁信徒Lv.${baseGsAfterDecision.players?.[0]?.godLevel||0}）梦访拉莱耶，翻面结束回合时额外摸${remaining}张牌`);
      baseGsAfterDecision={...baseGsAfterDecision,_cthFresh:undefined};
    }
    // Animate any prior rest-draws (forced cards from startNextTurn) first
    if(baseGsAfterDecision._cthRestDraws?.length>0){
      const dreamStep=makeCthRlyehDreamStep(0,baseGsAfterDecision._cthRestDrawLogs||[]);
      const cthQueue=baseGsAfterDecision._cthRestDraws.map(card=>({
        type:'DRAW_CARD',card,triggerName:'你',targetPid:0,
        msgs:baseGsAfterDecision._cthRestDrawLogs?.filter(l=>l.includes(card.name)||l.includes(card.key))||[]
      }));
      const statQ=bindAnimLogChunks(
        buildAnimQueue({...baseGsAfterDecision,players:baseGsAfterDecision._playersBeforeCthDraws||baseGsAfterDecision.players},baseGsAfterDecision),
        {statLogs:baseGsAfterDecision._cthRestDrawLogs||[]}
      );
      const cleanedGs={...baseGsAfterDecision,_cthRestDraws:null,_cthRestDrawLogs:null,_playersBeforeCthDraws:null};
      if(baseGsAfterDecision._isMP){
        // 决策后剩余的强制 CTH 摸牌：同样用 endlessCorridorReplay 事件广播，远端按 actor 座位旋转后播放。
        const cthEvent=buildCthRestDrawReplayEvent({
          beforePlayers:baseGsAfterDecision._playersBeforeCthDraws||baseGsAfterDecision.players,
          beforeDiscard:baseGsAfterDecision.discard,
          zhuLight:baseGsAfterDecision.zhuLight||null,
          actorName:baseGsAfterDecision._playersBeforeCthDraws?.[0]?.name||baseGsAfterDecision.players?.[0]?.name||'你',
          cthDraws:baseGsAfterDecision._cthRestDraws,
          cthDrawLogs:baseGsAfterDecision._cthRestDrawLogs,
          statSteps:statQ,
        });
        if(!cthEvent||!broadcastCthRestDrawReplay(baseGsAfterDecision,cthEvent))broadcastMpStateBeforeLocalReplay(baseGsAfterDecision);
      }
      triggerAnimQueue(
        [dreamStep,...cthQueue,...statQ,statePatchStep({players:cleanedGs.players,discard:cleanedGs.discard})],
        null,
        ()=>{_cthContinueRestDraws(cleanedGs);}
      );
      return;
    }
    if(remaining<=0){
      finishCthRestDraws(baseGsAfterDecision,P,D,Disc,L);
      return;
    }
    for(let _d=0;_d<remaining;_d++){
      const cthBeforeDrawPlayers=copyPlayers(P);
      const cthBeforeDrawDiscard=[...Disc];
      if(!baseGsAfterDecision.geomagneticReversalActive){
        const zhuGuard=getZhuTopGuard({...baseGsAfterDecision,players:P,deck:D,currentTurn:0},D);
        if(zhuGuard){
          const pendingZhuGs={
            ...baseGsAfterDecision,
            players:P,deck:D,discard:Disc,log:L,zhuLight:zhuGuard.zhuLight,
            phase:'ZHU_HIDE_AI_DRAW',drawReveal:null,selectedCard:null,
            abilityData:{zhuGuard,drawerIdx:0,fromRest:true,cthDrawsRemaining:remaining-_d},
          };
          if(pendingZhuGs._isMP)broadcastMpStateBeforeLocalReplay(pendingZhuGs);
          setGs(pendingZhuGs);
          return;
        }
      }
      const r2=playerDrawCard(P,D,Disc,0,baseGsAfterDecision);P=r2.P;D=r2.D;Disc=r2.Disc;
      const drawMsg=r2.drawnCard?`你 摸到 ${drawCardDecisionText(r2.drawnCard)}`:'';
      if(r2.reshuffleLog)L.push(r2.reshuffleLog);
      if(r2.drawnCard)L.push(`  摸到 ${drawCardDecisionText(r2.drawnCard)}`);
      // Phase C：CTH 暂停时用 buildCthRestDrawReplayEvent 广播（rich replay），远端按 actor 旋转后回放该次摸牌，
      // 而非仅同步状态（修复原 endTurn 内联循环暂停时不回放、远端快照突变的问题）。
      const broadcastCthPause=(pauseState)=>{
        if(!pauseState._isMP)return;
        const cthEvent=buildCthRestDrawReplayEvent({
          beforePlayers:cthBeforeDrawPlayers,beforeDiscard:cthBeforeDrawDiscard,
          zhuLight:pauseState.zhuLight||null,actorName:cthBeforeDrawPlayers?.[0]?.name||'你',
          cthDraws:r2.drawnCard?[r2.drawnCard]:[],cthDrawLogs:drawMsg?[drawMsg]:[],
        });
        if(!cthEvent||!broadcastCthRestDrawReplay(pauseState,cthEvent))broadcastMpStateBeforeLocalReplay(pauseState);
      };
      if(r2.needGodChoice){
        const split=splitGodEncounterReplayLogs(r2.effectMsgs||[]);
        const encounterLogs=split.encounterLogs;
        const inspectionLogs=split.inspectionLogs;
        if(encounterLogs.length)L.push(...encounterLogs);
        if(inspectionLogs.length)L.push(...inspectionLogs);
        const newGs={...baseGsAfterDecision,...(r2.statePatch||{}),players:P,deck:D,discard:Disc,log:L,phase:'GOD_CHOICE',
          abilityData:{godCard:r2.drawnCard,fromRest:true,cthDrawsRemaining:remaining-_d-1,drawerIdx:0},drawReveal:null,selectedCard:null,
          _drawLogs:[...(drawMsg?[drawMsg]:[]),...encounterLogs],_statLogs:inspectionLogs,_drawnCard:r2.drawnCard};
        if(newGs._isMP)broadcastCthPause(newGs);
        const drawStep={type:'DRAW_CARD',card:r2.drawnCard,triggerName:'你',targetPid:0,msgs:newGs._drawLogs};
        const queue=buildGodChoiceDrawInspectionQueue({
          oldGs:{...baseGsAfterDecision,players:cthBeforeDrawPlayers,log:baseGsAfterDecision.log,_statEventSeq:baseGsAfterDecision._statEventSeq||0,_inspectionSeq:baseGsAfterDecision._inspectionSeq||0},
          newGs,
          drawStep,
        });
        triggerAnimQueue([makeCthRlyehDreamStep(0,newGs._drawLogs),...queue],newGs);
        return;
      }
      if(r2.needsDecision){
        const newGs={...baseGsAfterDecision,players:P,deck:D,discard:Disc,log:L,phase:'DRAW_REVEAL',
          drawReveal:{card:r2.drawnCard,msgs:[],needsDecision:true,forcedKeep:false,drawerIdx:0,drawerName:P[0].name,fromRest:true},
          selectedCard:null,abilityData:{fromRest:true,cthDrawsRemaining:remaining-_d-1}};
        if(newGs._isMP)broadcastCthPause(newGs);
        triggerAnimQueue([makeCthRlyehDreamStep(0,drawMsg?[drawMsg]:[]),{type:'DRAW_CARD',card:r2.drawnCard,triggerName:'你',targetPid:0,msgs:drawMsg?[drawMsg]:[]}],newGs);
        return;
      }
      // forced card: already applied, continue
      if(r2.kept){
        if(r2.effectMsgs.length)L.push(...r2.effectMsgs);
        const split=splitAnimBoundLogs(r2.effectMsgs||[]);
        const forcedGs={...baseGsAfterDecision,...(r2.statePatch||{}),players:P,deck:D,discard:Disc,log:L,phase:'ACTION',drawReveal:null,selectedCard:null,
          abilityData:{...(fromRest?{fromRest:true}:{}),cthDrawsRemaining:remaining-_d-1}};
        const statQ=bindAnimLogChunks(buildAnimQueue(baseGsAfterDecision,forcedGs),{statLogs:split.stat});
        if(forcedGs._isMP)broadcastMpStateBeforeLocalReplay(forcedGs);
        triggerAnimQueue(
          [
            makeCthRlyehDreamStep(0,drawMsg?[drawMsg]:[]),
            {type:'DRAW_CARD',card:r2.drawnCard,triggerName:'你',targetPid:0,msgs:split.preStat.length?split.preStat:(drawMsg?[`${drawMsg}（强制触发）`]:[])},
            ...statQ,
            statePatchStep({players:P,discard:Disc})
          ],
          null,
          ()=>{
            setGs(forcedGs);
            _cthContinueRestDraws(forcedGs);
          }
        );
        return;
      }
    }
    finishCthRestDraws(baseGsAfterDecision,P,D,Disc,L);
  }

  function hasPendingEndTurnReplay(P){
    return hasEndTurnReplayHandEvent(P,0);
  }

  function startEndTurnReplaySyncQueue(actorIndex=0,actorName='你',stateLike=null){
    endTurnReplaySyncQueueRef.current={
      actorIndex,
      actorName,
      queue:[],
      msgs:[],
      broadcastedCount:0,
      broadcastedMsgCount:0,
      beforePlayers:copyPlayers(stateLike?.players||[]),
      beforeDiscard:[...(stateLike?.discard||[])],
      zhuLight:stateLike?.zhuLight||null,
    };
  }

  function appendEndTurnReplaySyncQueue(steps=[],msgs=[]){
    const sync=endTurnReplaySyncQueueRef.current;
    if(!sync)return;
    const queue=Array.isArray(steps)?steps.filter(Boolean):[];
    if(queue.length)sync.queue.push(...queue);
    const lines=Array.isArray(msgs)?msgs.filter(Boolean):[];
    if(lines.length)sync.msgs.push(...lines);
  }

  function broadcastEndTurnReplaySyncDelta(state){
    const sync=endTurnReplaySyncQueueRef.current;
    if(!state?._isMP||!sync)return state;
    const queue=sync.queue.slice(sync.broadcastedCount||0);
    const msgs=sync.msgs.slice(sync.broadcastedMsgCount||0);
    if(!queue.length)return state;
    const isFirstDelta=(sync.broadcastedCount||0)===0;
    const event=createEndlessCorridorReplayEvent({
      actorIdx:sync.actorIndex,
      actorName:sync.actorName,
      queue,
      msgs,
      beforePlayers:isFirstDelta?sync.beforePlayers:null,
      beforeDiscard:isFirstDelta?sync.beforeDiscard:null,
      zhuLight:sync.zhuLight,
    });
    sync.broadcastedCount=sync.queue.length;
    sync.broadcastedMsgCount=sync.msgs.length;
    const stateWithEvent=event?{...state,_visualEvents:[event,...(state?._visualEvents||[])]}:state;
    broadcastMpStateBeforeLocalReplay(stateWithEvent);
    return stateWithEvent;
  }

  function withEndTurnReplaySyncEvent(state){
    const sync=endTurnReplaySyncQueueRef.current;
    endTurnReplaySyncQueueRef.current=null;
    if(!sync?.queue?.length)return state;
    const queue=sync.queue.slice(sync.broadcastedCount||0);
    const msgs=sync.msgs.slice(sync.broadcastedMsgCount||0);
    if(!queue.length)return state;
    const event=createEndlessCorridorReplayEvent({
      actorIdx:sync.actorIndex,
      actorName:sync.actorName,
      queue,
      msgs,
      beforePlayers:(sync.broadcastedCount||0)===0?sync.beforePlayers:null,
      beforeDiscard:(sync.broadcastedCount||0)===0?sync.beforeDiscard:null,
      zhuLight:sync.zhuLight,
    });
    return event?{...state,_visualEvents:[event,...(state?._visualEvents||[])]}:state;
  }

  function beginEndTurnReplay(baseGs,P,D,Disc,L,preQueue=[]){
    // 回合结束事件排序：黄液(蟾蜍之神)属神牌事件，应先于"无尽通道"(其他卡牌)结算。
    // 故在无尽通道重播前先发放黄液并把其动画排到队首；并打标记让 startNextTurn 不再重复发放。
    let slimePreQueue=[];
    const slimeLog=[];
    const playersBeforeSlime=copyPlayers(P);
    // Phase C：若黄液已由调度器的 TSG_SLIME_GRANT 事件先行发放并打了标记，则此处不再重复发放。
    const tsgSlimeGrant=baseGs._tsgSlimeGrantedAtTurnEnd?null:grantTsathogguaSlimeAtEndTurn(P,0,slimeLog,[]);
    if(tsgSlimeGrant){
      L.push(...slimeLog);
      const zPatch=appendPublicCardGainTriggers(baseGs,P,tsgSlimeGrant.ownerIdx,tsgSlimeGrant.cards);
      slimePreQueue=buildTsathogguaSlimeGrantQueue({_tsgSlimeGrantEvents:[tsgSlimeGrant],zhuLight:baseGs.zhuLight||null,players:P});
      baseGs={...baseGs,_tsgSlimeGrantedAtTurnEnd:true,...(zPatch.proliferatingZQueue?{proliferatingZQueue:zPatch.proliferatingZQueue}:{})};
    }
    const nextState=buildEndTurnReplayStartState({baseGs,players:P,deck:D,discard:Disc,log:L,actorIndex:0,actorLabel:'你'});
    if(!nextState)return false;
    // 同步基线取发放黄液前的玩家快照，黄液动画自带 VISUAL_LOCK 从该基线把黏液"长出"，远端重播才一致。
    startEndTurnReplaySyncQueue(0,P?.[0]?.name||'你',{...baseGs,players:tsgSlimeGrant?playersBeforeSlime:P,discard:Disc});
    const queue=[...slimePreQueue,...preQueue,endlessCorridorTunnelStep()];
    appendEndTurnReplaySyncQueue(queue,nextState.log?.slice((baseGs.log||[]).length)||[]);
    // 提前广播初始无尽通道动画，让远端同步开始播放
    if(nextState._isMP)broadcastEndTurnReplaySyncDelta(nextState);
    triggerAnimQueue(queue,nextState,()=>continueEndTurnReplay(nextState));
    return true;
  }

  function continueEndTurnReplay(stateLike){
    if(!stateLike?._endTurnReplay)return false;
    const replay=stateLike._endTurnReplay;
    let P=copyPlayers(stateLike.players||[]);
    const broadcastEndTurnReplayDecisionState=decisionState=>broadcastEndTurnReplaySyncDelta(decisionState);
    const currentReplay=getCurrentEndTurnReplayCard({...stateLike,players:P});
    if(currentReplay){
      const {actorIndex,index,card}=currentReplay;
      if(card.isGod){
        const encounter=buildEndTurnReplayGodEncounter({stateLike,players:P,replay,actorIndex,index,card,isCultist:(P[actorIndex]._nyaBorrow||P[actorIndex].role)===ROLE_CULTIST,actorLabel:'你'});
        P=encounter.players;
        let D=[...(stateLike.deck||[])],Disc=[...(stateLike.discard||[])];
        let L=[...(stateLike.log||[]),encounter.effectMsg];
        let inspectionMeta=makeInspectionMeta(stateLike);
        if(encounter.abilityData.godEncounterCost>0){
          const processed=applySanLossToPlayerWithInspection(actorIndex,encounter.cost,stateLike.currentTurn??0,P,D,Disc,L,inspectionMeta,'邪神遭遇');
          P=processed.P;D=processed.D;Disc=processed.Disc;L=processed.L;inspectionMeta=processed.inspectionMeta;
        }
        const secondaryDecisionType=inspectionMeta?.abilityData?.type;
        const secondaryDecision=(secondaryDecisionType==='tsgSlimeBalance'||secondaryDecisionType==='etherealizeRedirect')?inspectionMeta.abilityData:null;
        const godChoiceAbilityData=encounter.abilityData;
        const nextPhase=secondaryDecision?(secondaryDecisionType==='tsgSlimeBalance'?'TSG_SLIME_BALANCE':'ETHEREALIZE_DECISION'):'GOD_CHOICE';
        const nextAbilityData=secondaryDecision
          ?{...secondaryDecision,pendingGodChoice:godChoiceAbilityData,_turnOwner:stateLike.currentTurn??0}
          :godChoiceAbilityData;
        const {abilityData:_,...inspectionMetaWithoutAbilityData}=inspectionMeta||{};
        const newGs={...stateLike,players:P,deck:D,discard:Disc,log:L,
          ...inspectionMetaWithoutAbilityData,
          phase:nextPhase,
          abilityData:nextAbilityData,
          drawReveal:null,selectedCard:null,
          ...encounter.replayPatch};
        const split=splitAnimBoundLogs(L.slice((stateLike.log||[]).length));
        const statQ=bindAnimLogChunks(buildAnimQueue(stateLike,newGs),{statLogs:split.stat});
        const queue=[{type:'DRAW_CARD',card,triggerName:'无尽通道',targetPid:actorIndex,skipTravel:true,msgs:split.preStat.length?split.preStat:[encounter.effectMsg]},...statQ];
        appendEndTurnReplaySyncQueue(queue,L.slice((stateLike.log||[]).length));
        const pendingGs=broadcastEndTurnReplayDecisionState(newGs,queue,L.slice((stateLike.log||[]).length));
        triggerAnimQueue(queue,pendingGs);
        return true;
      }
      const zoneDraw=buildEndTurnReplayZoneDraw({stateLike,players:P,replay,actorIndex,index,card,actorName:P[actorIndex]?.name||'你'});
      if(card.forced){
        let D=[...(stateLike.deck||[])],Disc=[...(stateLike.discard||[])];
        const resolutionCard=revealBlindDrawCard(card);
        clearBlindZoneDecisionFlag(P,actorIndex,zoneDraw.state.drawReveal);
        const res=applyFx(resolutionCard,actorIndex,null,P,D,Disc,zoneDraw.state,false,[],false);
        P=res.P;D=res.D;Disc=res.Disc;
        const who=localDisplayName(actorIndex,P[actorIndex]?.name||'你');
        const L=[...(stateLike.log||[]),`${who} 收入了 ${cardLogText(resolutionCard,{alwaysShowName:true})}`,...(res.msgs||[])];
        const replayPatch=advanceEndTurnReplayPatch(zoneDraw.state);
        const decisionState=deriveEffectDecisionState(res.statePatch,{
          baseAbilityData:zoneDraw.state.abilityData,
          fallbackPhase:'ACTION',
          extraAbilityData:{fromEndTurnReplay:true},
        });
        const nextAbilityData=decisionState.hasDecision?decisionState.abilityData:zoneDraw.state.abilityData;
        const newGs={...zoneDraw.state,players:P,deck:D,discard:Disc,log:L,phase:decisionState.hasDecision?decisionState.phase:'ACTION',
          drawReveal:null,abilityData:nextAbilityData,selectedCard:null,...(res.statePatch||{}),...replayPatch};
        if(decisionState.hasDecision){
          newGs.phase=decisionState.phase;
          newGs.abilityData=decisionState.abilityData;
        }
        const win=checkWin(P,stateLike._isMP);
        if(win){
          const winGs={...newGs,gameOver:win,phase:'ACTION',drawReveal:null};
          appendEndTurnReplaySyncQueue([zoneDraw.drawStep,statePatchStep({players:P,deck:D,discard:Disc,log:L,phase:winGs.phase,drawReveal:null,abilityData:winGs.abilityData})],L.slice((stateLike.log||[]).length));
          triggerAnimQueue([zoneDraw.drawStep,statePatchStep({players:P,deck:D,discard:Disc,log:L,phase:winGs.phase,drawReveal:null,abilityData:winGs.abilityData})],winGs);
          return true;
        }
        const effectQueue=bindAnimLogChunks(buildAnimQueue(zoneDraw.state,newGs),splitAnimBoundLogs(L.slice((stateLike.log||[]).length)));
        const queue=[zoneDraw.drawStep,...effectQueue,statePatchStep({players:P,deck:D,discard:Disc,log:L,phase:newGs.phase,drawReveal:newGs.drawReveal,abilityData:newGs.abilityData})];
        appendEndTurnReplaySyncQueue(queue,L.slice((stateLike.log||[]).length));
        const pendingGs=broadcastEndTurnReplayDecisionState(newGs,queue,L.slice((stateLike.log||[]).length));
        triggerAnimQueue(queue,pendingGs,()=>{if(pendingGs.phase==='ACTION'&&!pendingGs.gameOver)continueEndTurnReplay(pendingGs);});
        return true;
      }
      appendEndTurnReplaySyncQueue([zoneDraw.drawStep],zoneDraw.drawStep.msgs);
      const pendingGs=broadcastEndTurnReplayDecisionState(zoneDraw.state,[zoneDraw.drawStep],zoneDraw.drawStep.msgs);
      triggerAnimQueue([zoneDraw.drawStep],pendingGs);
      return true;
    }
    const cleaned=buildEndTurnReplayFinishedState({stateLike,players:P});
    // Phase C：无尽通道是回合结束事件序列的最后一环；交回调度器，由 finishEndTurnSeq 衔接下家回合
    //（finishEndTurnSeq 内部同样会套用 withEndTurnReplaySyncEvent，保证联机同步事件不丢）。
    if(inEndTurnSeq())return advanceEndTurnSeq(cleaned);
    const nextGs=withEndTurnReplaySyncEvent(startNextTurn(cleaned));
    applyNextTurnGs(nextGs);
    return true;
  }

  // ── Phase C：回合结束事件统一调度器 ──────────────────────────────────────────
  // getEndTurnEvents（registry，Phase A）决定顺序，endTurnSeqRef={events,cursor} 记录游标。
  // 处理器完成时调用 advanceEndTurnSeq 推进到下一事件；进入玩家决策（GOD_CHOICE/DRAW_REVEAL）时
  // 不推进——既有的 _cthContinueRestDraws/continueEndTurnReplay 结算后其尾部检测 inEndTurnSeq() 即续跑。
  // ponytail: 游标存 ref 而非 state——React 下处理器尾部深埋在 triggerAnimQueue 回调里，且决策结算会
  //   重建 state（易丢字段）；回合结束严格串行，ref 跨任何重建都不丢，也不会泄漏进联机广播。
  //   getEndTurnEvents 才是收口关键（顺序唯一来源）；runEndTurnEvents 作为纯参考实现保留并已单测。
  function inEndTurnSeq(){return !!endTurnSeqRef.current;}
  function stepEndTurnSeq(state){
    const seq=endTurnSeqRef.current;
    if(!seq)return false;
    if(seq.cursor>=seq.events.length)return finishEndTurnSeq(state);
    // 推进下一事件前清掉上一步可能遗留的"回合开始摸牌"展示字段，避免本事件的广播/远端重播误合成开场动画。
    return dispatchEndTurnEvent(seq.events[seq.cursor],withClearedTurnAnimFields(state));
  }
  function advanceEndTurnSeq(state){
    const seq=endTurnSeqRef.current;
    if(!seq){applyNextTurnGs(startNextTurn(state));return false;} // 非调度路径兜底
    endTurnSeqRef.current={...seq,cursor:seq.cursor+1};
    return stepEndTurnSeq(state);
  }
  // 软锁定兜底：决策(GOD_CHOICE/DRAW_REVEAL)结算时，若仍处于回合结束事件序列、但 fromRest/fromEndTurnReplay
  // 路由标记意外缺失（偶发竞态），不要落进 setGs(ACTION) 卡死行动方自己回合——用可靠的 ref 游标强制推进序列
  // （继续往下一个事件，最终 finishEndTurnSeq 衔接下家回合）。正常路由命中时不会走到这里；仅兜底，并打 localhost 日志留证。
  function resumeEndTurnSeqOrSetGs(state){
    if(inEndTurnSeq()){
      if(isLocalTestMode)console.warn('[endTurnSeq] 续跑兜底触发：路由标记缺失，强制推进序列',{cursor:endTurnSeqRef.current?.cursor,phase:state?.phase,abilityData:state?.abilityData});
      advanceEndTurnSeq(state);
      return;
    }
    setGs(state);
  }
  function dispatchEndTurnEvent(event,state){
    switch(event?.id){
      case END_TURN_EVENT.CTH_REST_DRAW:{
        // 首次进入：按事件登记张数播种 cthDrawsRemaining + 打 _cthFresh（让处理器补"梦访拉莱耶"引导日志）。
        // 续跑（决策返回）：abilityData.cthDrawsRemaining 已存在并递减，直接沿用。
        const seeded=state.abilityData?.cthDrawsRemaining!=null
          ?state
          :{...state,_cthFresh:true,abilityData:{...(state.abilityData||{}),fromRest:true,cthDrawsRemaining:event.drawCount}};
        _cthContinueRestDraws(seeded);
        return true;
      }
      case END_TURN_EVENT.TSG_SLIME_GRANT:
        runTsgSlimeGrantEvent(state);return true;
      case END_TURN_EVENT.END_TURN_REPLAY_HAND:
        runEndTurnReplayEvent(state);return true;
      default:
        return advanceEndTurnSeq(state);
    }
  }
  function finishEndTurnSeq(state){
    endTurnSeqRef.current=null;
    // withEndTurnReplaySyncEvent：无尽通道结算时补挂联机同步事件；无同步队列时为恒等返回。
    const nextGs=withEndTurnReplaySyncEvent(startNextTurn(state));
    applyNextTurnGs(nextGs);
    return true;
  }
  // 各入口点计算 getEndTurnEvents 并启动序列。seedQueue=本回合先于事件序列的动画（弃牌/骰子/平衡等）；
  // preStatePatch=入口点专属状态位（skillUsed/restUsed 等），随事件决策态展开继承。
  function kickoffEndTurnSeq(baseGs,{seedQueue=[],preStatePatch={}}={}){
    endTurnSeqRef.current={events:getEndTurnEvents(baseGs.players,baseGs.currentTurn||0),cursor:0};
    // 序列起始态清掉行动方"回合开始摸牌"展示残留，避免远端在首段事件(CTH/黄液)广播时误合成开场动画。
    const seqState=withClearedTurnAnimFields({...baseGs,...preStatePatch});
    if(seedQueue.length){
      // 先同步 seed 段（弃牌/骰子等，含其 visualEvents），远端按序回放，再衔接各事件的增量广播。
      if(seqState._isMP)broadcastMpStateBeforeLocalReplay(seqState);
      triggerAnimQueue(seedQueue,seqState,()=>stepEndTurnSeq(seqState));
    }else{
      stepEndTurnSeq(seqState);
    }
  }
  // 黄液(蟾蜍之神)发放事件：PASSIVE_GOD，排在 CTH 之后、无尽通道之前。
  // ponytail: 发放逻辑暂与 beginEndTurnReplay 的内联版并存；Stage 6 收口后删除内联版。
  function runTsgSlimeGrantEvent(state){
    const P=copyPlayers(state.players);
    const L=[...state.log];
    const slimeLog=[];
    const playersBeforeSlime=copyPlayers(P);
    const grant=grantTsathogguaSlimeAtEndTurn(P,0,slimeLog,[]);
    if(!grant)return advanceEndTurnSeq(state); // 免疫/非 TSG：无发放，直接推进
    L.push(...slimeLog);
    const zPatch=appendPublicCardGainTriggers(state,P,grant.ownerIdx,grant.cards);
    const queue=buildTsathogguaSlimeGrantQueue({_tsgSlimeGrantEvents:[grant],zhuLight:state.zhuLight||null,players:P});
    const nextState={...state,players:P,log:L,_tsgSlimeGrantedAtTurnEnd:true,
      ...(zPatch.proliferatingZQueue?{proliferatingZQueue:zPatch.proliferatingZQueue}:{})};
    if(nextState._isMP){
      // 复用无尽通道事件通道广播；黄液动画自带 VISUAL_LOCK，从发放前快照"长出"，远端按 actor 旋转后同步。
      const event=createEndlessCorridorReplayEvent({
        actorIdx:0,actorName:P?.[0]?.name||'你',
        queue:[...queue],msgs:[...slimeLog],
        beforePlayers:playersBeforeSlime,beforeDiscard:state.discard,zhuLight:state.zhuLight||null,
      });
      if(event)broadcastMpStateBeforeLocalReplay({...nextState,_visualEvents:[event,...(nextState._visualEvents||[])]});
      else broadcastMpStateBeforeLocalReplay(nextState);
    }
    triggerAnimQueue(queue,nextState,()=>advanceEndTurnSeq(nextState));
  }
  // 无尽通道事件：PASSIVE_OTHER，序列末环。复用 beginEndTurnReplay（黄液由前序事件发放并打标记，故跳过）。
  function runEndTurnReplayEvent(state){
    const P=copyPlayers(state.players),D=[...state.deck],Disc=[...state.discard],L=[...state.log];
    if(beginEndTurnReplay(state,P,D,Disc,L,[]))return; // 展开 + 续跑由 continueEndTurnReplay 接管，尾部 advanceEndTurnSeq
    advanceEndTurnSeq(state); // 理论不可达（仅在存在通道牌时登记此事件）
  }

  function handleDrawKeep(){
    const dr=gs.drawReveal;if(!dr?.card)return;
    const resolutionCard=revealBlindDrawCard(dr.card);
    // swapAllHands needs target selection before applying
    if(resolutionCard.type==='swapAllHands'){
      const replayPatch=dr.fromEndTurnReplay?advanceEndTurnReplayPatch(gs):{};
      const drawerIdx=dr.drawerIdx??0;
      const P=copyPlayers(gs.players);
      clearBlindZoneDecisionFlag(P,drawerIdx,dr);
      setGs({...gs,players:P,phase:'ZONE_SWAP_SELECT_TARGET',drawReveal:null,abilityData:{zoneSwapCard:resolutionCard,fromRest:dr.fromRest,fromEndTurnReplay:dr.fromEndTurnReplay,fromTsathogguaSlime:dr.fromTsathogguaSlime,continueTurnStartDraw:gs.abilityData?.continueTurnStartDraw,cthDrawsRemaining:gs.abilityData?.cthDrawsRemaining},log:[...gs.log,...(dr.reshuffleLog?[dr.reshuffleLog]:[]),`你摸到 ${cardLogText(resolutionCard,{alwaysShowName:true})}，请选择交换手牌的目标`],...replayPatch});
      return;
    }
    // 检查是否为AOE负面效果，且当前玩家是寻宝者
    const effectiveRole=me._nyaBorrow||me.role;
    const isTreasureHunter=effectiveRole==='寻宝者';
    const isDodgeableEffect=isDodgeableZoneCard(resolutionCard);
    const effectScope=getZoneCardEffectScope(resolutionCard);
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard];
    const drawerIdx=dr.drawerIdx??0;
    clearBlindZoneDecisionFlag(P,drawerIdx,dr);
    const isAOENegativeEffect=isDodgeableEffect&&(effectScope==='all'||effectScope==='adjacent');
    
    // 首先检查是否是其他角色触发的AOE负面效果
    if(isAOENegativeEffect&&isTreasureHunter&&drawerIdx!==0){
      // 触发AOE负面效果时，寻宝者可以选择掷骰子规避
      setGs({...gs,phase:'TREASURE_AOE_DODGE_DECISION',drawReveal:dr,abilityData:{fromRest:gs.abilityData?.fromRest,fromTsathogguaSlime:gs.abilityData?.fromTsathogguaSlime,continueTurnStartDraw:gs.abilityData?.continueTurnStartDraw,cthDrawsRemaining:gs.abilityData?.cthDrawsRemaining,drawerIdx:drawerIdx},
        log:[...gs.log,...(dr.reshuffleLog?[dr.reshuffleLog]:[]),`${localDisplayName(drawerIdx,P[drawerIdx].name)} 触发了 ${cardLogText(resolutionCard,{alwaysShowName:true})} 的负面效果！作为寻宝者，你可以选择掷骰子尝试规避。`]});
      return;
    }
    
    // 然后检查是否是寻宝者自己触发的负面区域牌
    if(isTreasureHunter&&isLocalSeatIndex(drawerIdx)&&isDodgeableEffect){
      // Preserve cthDrawsRemaining so CTH rest-draws aren't lost after dodge decision
      setGs({...gs,phase:'TREASURE_DODGE_DECISION',drawReveal:dr,abilityData:{fromRest:gs.abilityData?.fromRest,fromTsathogguaSlime:gs.abilityData?.fromTsathogguaSlime,continueTurnStartDraw:gs.abilityData?.continueTurnStartDraw,cthDrawsRemaining:gs.abilityData?.cthDrawsRemaining},
        log:[...gs.log,...(dr.reshuffleLog?[dr.reshuffleLog]:[]),`你摸到 ${cardLogText(resolutionCard,{alwaysShowName:true})}，这是带有负面效果的区域牌！是否掷骰子尝试规避？`]});
      return;
    }
    const res=applyFx(resolutionCard,drawerIdx,null,P,D,Disc,gs,false,[],false);
    P=res.P;D=res.D;Disc=res.Disc;
    if(!dr.fromEndTurnReplay)P[drawerIdx].hand.push(resolutionCard);
    const who=localDisplayName(drawerIdx,P[drawerIdx].name);
    const L=[...gs.log,...(dr.reshuffleLog?[dr.reshuffleLog]:[]),`${who} 收入了 ${cardLogText(resolutionCard,{alwaysShowName:true})}`,...res.msgs];
    // 1. 检查卡牌效果是否让任何人HP归零或SAN归零（通过checkWin）
    const win=checkWin(P,gs._isMP);if(win){syncVisibleLog(L);setGs({...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win,drawReveal:null,...(res.statePatch||{})});return;}
    // 2. 最后，如果游戏仍未结束，且该寻宝者仍然存活，检查该寻宝者是否达成胜利条件
    if(isLocalSeatIndex(drawerIdx)&&!P[0].isDead&&(P[0]._nyaBorrow||P[0].role)==='寻宝者'&&isWinHand(P[0].hand)){
      P[0].roleRevealed=true;
      const pendingWinGs={...gs,players:P,deck:D,discard:Disc,log:[...L,localTreasureWinLog(gs)],phase:'PLAYER_WIN_PENDING',drawReveal:null,abilityData:{winReason:localTreasureWinReason(gs)},...(res.statePatch||{})};
      const inspectionResult=buildInspectionAwareAnimQueue(gs,pendingWinGs,{buildAnimQueue,copyPlayers});
      const effectQueue=inspectionResult.inspectionEvents.length
        ?inspectionResult.queue
        :bindAnimLogChunks(inspectionResult.queue,splitAnimBoundLogs(L.slice(gs.log.length)));
      const transfer=!dr.fromEndTurnReplay?cardTransferStep({
        fromPid:drawerIdx,dest:'player',toPid:drawerIdx,count:1,
        sourceAnchor:'playerArea',effect:'draw',cards:[resolutionCard],
      }):null;
      if(pendingWinGs._isMP&&!dr.fromEndTurnReplay)broadcastMpStateBeforeLocalReplay(pendingWinGs);
      triggerAnimQueue([transfer,...effectQueue].filter(Boolean),pendingWinGs);
      return;
    }
    // 保留abilityData中的fromRest和cthDrawsRemaining信息
    const replayPatch=dr.fromEndTurnReplay?advanceEndTurnReplayPatch(gs):{};
    const newGs={...gs,players:P,deck:D,discard:Disc,log:L,phase:'ACTION',drawReveal:null,abilityData:gs.abilityData,...(res.statePatch||{}),...replayPatch};
    if(hasEffectDecisionState(res.statePatch)){
      const {phase,abilityData}=deriveEffectDecisionState(res.statePatch,{
        baseAbilityData:gs.abilityData,
        fallbackPhase:'ACTION',
        extraAbilityData:{
          ...(dr.fromRest?{fromRest:true}:{}),
          ...(dr.fromTsathogguaSlime?{fromTsathogguaSlime:true,continueTurnStartDraw:true,pendingTsathogguaSlime:gs.abilityData?.pendingTsathogguaSlime,pendingTsathogguaSlimes:gs.abilityData?.pendingTsathogguaSlimes}:{}),
          ...(gs.abilityData?.cthDrawsRemaining!=null?{cthDrawsRemaining:gs.abilityData.cthDrawsRemaining}:{}),
        },
      });
      // 决策弹窗出现前，先播放卡牌效果动画（如"空谷传音"全体SAN扣减+检定），
      // 否则直接 setGs 会让 SAN 扣减瞬间生效、跳过特效，看起来直接进入了检定/决策。
      const inspectionResult=buildInspectionAwareAnimQueue(gs,newGs,{buildAnimQueue,copyPlayers});
      if(inspectionResult.inspectionEvents.length){
        lastInspectionSeqRef.current=Math.max(lastInspectionSeqRef.current,...inspectionResult.inspectionEvents.map(ev=>ev.seq||0));
      }
      const effectQueue=inspectionResult.inspectionEvents.length
        ?inspectionResult.queue
        :bindAnimLogChunks(inspectionResult.queue,splitAnimBoundLogs(L.slice(gs.log.length)));
      // 已在队列里播放的检定标记为已消费，避免检定 useEffect 再次重放
      const decisionGs={...newGs,phase,abilityData,_inspectionSeq:Math.max(newGs._inspectionSeq||0,inspectionResult.inspectionSeq||0)};
      if(effectQueue.length){
        if(decisionGs._isMP&&!dr.fromEndTurnReplay)broadcastMpStateBeforeLocalReplay(decisionGs);
        triggerAnimQueue([...effectQueue,statePatchStep({players:P,discard:Disc})],decisionGs);
      }else{
        syncVisibleLog(L);
        setGs(decisionGs);
      }
      return;
    }
    const buildDrawKeepEffectQueue=(oldGs,nextGs,logDelta)=>{
      const result=buildInspectionAwareAnimQueue(oldGs,nextGs,{buildAnimQueue,copyPlayers});
      if(result.inspectionEvents.length){
        lastInspectionSeqRef.current=Math.max(lastInspectionSeqRef.current,...result.inspectionEvents.map(ev=>ev.seq||0));
        return result.queue;
      }
      return bindAnimLogChunks(result.queue,splitAnimBoundLogs(logDelta));
    };
    // 收入手牌飞牌动画：只有真正从抽牌区加入手牌时才播放（无尽通道重播时牌已在手中，不播）
    const drawKeepTransfer=!dr.fromEndTurnReplay?cardTransferStep({
      fromPid:drawerIdx,
      dest:'player',
      toPid:drawerIdx,
      count:1,
      sourceAnchor:'playerArea',
      effect:'draw',
      cards:[resolutionCard],
    }):null;
    const effectQueue=buildDrawKeepEffectQueue(gs,newGs,L.slice(gs.log.length));
    const incomeQueue=drawKeepTransfer?[drawKeepTransfer,...effectQueue]:effectQueue;
    const incomeStatePatch=statePatchStep({
      players:P,deck:D,discard:Disc,log:L,phase:newGs.phase,
      drawReveal:newGs.drawReveal,abilityData:newGs.abilityData,
      ...(res.statePatch||{}),
    });
    if(newGs._isMP&&!dr.fromEndTurnReplay)broadcastMpStateBeforeLocalReplay(newGs);
    // CTH fromRest: 先播放当前这张牌的结算动画，再继续剩余摸牌/进入下一回合
    if(dr.fromRest&&!win){
      // TURN_BOUNDARY_PAUSE 给手牌布局/CSS 过渡留出时间，避免被后续无尽通道队列截断
      const boundaryPause={type:'TURN_BOUNDARY_PAUSE',durationMs:300};
      if(incomeQueue.length){
        triggerAnimQueue([...incomeQueue,incomeStatePatch,boundaryPause],newGs,()=>_cthContinueRestDraws(newGs));
      }else{
        syncVisibleLog(L);
        triggerAnimQueue([incomeStatePatch,boundaryPause],newGs,()=>_cthContinueRestDraws(newGs));
      }
      return;
    }
    if(dr.fromTsathogguaSlime&&!win){
      const boundaryPause={type:'TURN_BOUNDARY_PAUSE',durationMs:300};
      if(incomeQueue.length){
        triggerAnimQueue([...incomeQueue,incomeStatePatch,boundaryPause],newGs,()=>_tsgContinueTurnStartDraw(newGs));
      }else{
        syncVisibleLog(L);
        triggerAnimQueue([incomeStatePatch,boundaryPause],newGs,()=>_tsgContinueTurnStartDraw(newGs));
      }
      return;
    }
    if(dr.fromProliferatingZ&&!win&&newGs.phase==='ACTION'){
      if(incomeQueue.length){
        triggerAnimQueue([...incomeQueue,incomeStatePatch],null,()=>{if(!continueProliferatingZDraws(newGs))setGs(newGs);});
      }else{
        syncVisibleLog(L);
        if(!continueProliferatingZDraws(newGs))setGs(newGs);
      }
      return;
    }
    if(incomeQueue.length){
      if(dr.fromEndTurnReplay)appendEndTurnReplaySyncQueue([...incomeQueue,incomeStatePatch],L.slice(gs.log.length));
      setGs(p=>p?{...p,phase:'ACTION',drawReveal:null}:p);
      triggerAnimQueue([...incomeQueue,incomeStatePatch],newGs);
    }else{
      syncVisibleLog(L);
      setGs(newGs);
    }
  }

  function handleDrawKeepFromModal(){
    if(showTutorial&&tutorialStepDef&&!isTutorialActionAllowed({type:'drawKeep'}))return;
    handleDrawKeep();
  }

  function handleZhuHideDrawnCard(hide){
    const dr=gs.drawReveal;
    if(!dr?.card)return;
    const nextZhuLight=removeZhuLightCard(gs.zhuLight,dr.card);
    const drawerIdx=dr.drawerIdx??gs.currentTurn??0;
    if(!hide){
      const newGs={...gs,zhuLight:nextZhuLight,drawReveal:{...dr,zhuResolved:true},_turnStartLogs:[]};
      triggerAnimQueue([{type:'DRAW_CARD',card:dr.card,triggerName:localDisplayName(drawerIdx,gs.players?.[drawerIdx]?.name),targetPid:drawerIdx,msgs:gs._drawLogs||[]}],newGs);
      return;
    }
    let P=copyPlayers(gs.players);
    let D=[...gs.deck,dr.card];
    let Disc=[...gs.discard];
    const res=playerDrawCard(P,D,Disc,drawerIdx,{...gs,zhuLight:nextZhuLight,_zhuBypassTopGuard:true});
    P=res.P;D=res.D;Disc=res.Disc;
    const L=[...gs.log,`【衔烛照幽】你将 ${cardLogText(dr.card,{alwaysShowName:true})} 藏到了牌堆底`];
    if(!res.drawnCard){
      triggerAnimQueue([zhuHideCardStep(dr.card)],{...gs,players:P,deck:D,discard:Disc,log:L,phase:'ACTION',drawReveal:null,zhuLight:nextZhuLight,_turnStartLogs:[]});
      return;
    }
    if(res.needGodChoice){
      const newGs={...gs,players:P,deck:D,discard:Disc,log:L,phase:'GOD_CHOICE',
        abilityData:{...gs.abilityData,godCard:res.drawnCard,drawerIdx,godEncounterCost:res.godEncounterCost},
        drawReveal:null,zhuLight:nextZhuLight,_turnStartLogs:[]};
      triggerAnimQueue([zhuHideCardStep(dr.card),{type:'DRAW_CARD',card:res.drawnCard,triggerName:localDisplayName(drawerIdx,P[drawerIdx]?.name),targetPid:drawerIdx,msgs:res.effectMsgs||[]}],newGs);
      return;
    }
    if(res.kept){
      const newGs={...gs,players:P,deck:D,discard:Disc,log:[...L,...(res.effectMsgs||[])],phase:'ACTION',
        drawReveal:{card:res.drawnCard,msgs:res.effectMsgs,needsDecision:false,forcedKeep:false,drawerIdx,drawerName:P[drawerIdx]?.name},
        zhuLight:nextZhuLight,_turnStartLogs:[],...(res.statePatch||{})};
      triggerAnimQueue([zhuHideCardStep(dr.card),{type:'DRAW_CARD',card:res.drawnCard,triggerName:localDisplayName(drawerIdx,P[drawerIdx]?.name),targetPid:drawerIdx,msgs:res.effectMsgs||[]}],newGs);
      return;
    }
    const newGs={...gs,players:P,deck:D,discard:Disc,log:L,phase:'DRAW_REVEAL',
      drawReveal:{card:res.drawnCard,msgs:res.effectMsgs,needsDecision:!!res.needsDecision,forcedKeep:!!res.forcedKeep,drawerIdx,drawerName:P[drawerIdx]?.name},
      zhuLight:nextZhuLight,_turnStartLogs:[]};
    triggerAnimQueue([zhuHideCardStep(dr.card),{type:'DRAW_CARD',card:res.drawnCard,triggerName:localDisplayName(drawerIdx,P[drawerIdx]?.name),targetPid:drawerIdx,msgs:res.effectMsgs||[]}],newGs);
  }

  function handleZhuHideGodCard(hide){
    const godCard=gs.abilityData?.godCard;
    if(!godCard)return;
    const nextZhuLight=removeZhuLightCard(gs.zhuLight,godCard);
    const drawerIdx=gs.abilityData?.drawerIdx??gs.currentTurn??0;
    if(!hide){
      const newGs={...gs,zhuLight:nextZhuLight,abilityData:{...gs.abilityData,zhuResolved:true},_turnStartLogs:[]};
      triggerAnimQueue([{type:'DRAW_CARD',card:godCard,triggerName:localDisplayName(drawerIdx,gs.players?.[drawerIdx]?.name),targetPid:drawerIdx,msgs:gs._drawLogs||[]}],newGs);
      return;
    }
    let P=copyPlayers(gs.players);
    let D=[...gs.deck,godCard];
    let Disc=[...gs.discard];
    const res=playerDrawCard(P,D,Disc,drawerIdx,{...gs,zhuLight:nextZhuLight,_zhuBypassTopGuard:true});
    P=res.P;D=res.D;Disc=res.Disc;
    const L=[...gs.log,`【衔烛照幽】你将 ${cardLogText(godCard,{alwaysShowName:true})} 藏到了牌堆底`];
    if(!res.drawnCard){
      triggerAnimQueue([zhuHideCardStep(godCard)],{...gs,players:P,deck:D,discard:Disc,log:L,phase:'ACTION',drawReveal:null,abilityData:{},zhuLight:nextZhuLight,_turnStartLogs:[]});
      return;
    }
    if(res.needGodChoice){
      const newGs={...gs,players:P,deck:D,discard:Disc,log:L,phase:'GOD_CHOICE',
        abilityData:{...gs.abilityData,godCard:res.drawnCard,drawerIdx,godEncounterCost:res.godEncounterCost},
        drawReveal:null,zhuLight:nextZhuLight,_turnStartLogs:[]};
      triggerAnimQueue([zhuHideCardStep(godCard),{type:'DRAW_CARD',card:res.drawnCard,triggerName:localDisplayName(drawerIdx,P[drawerIdx]?.name),targetPid:drawerIdx,msgs:res.effectMsgs||[]}],newGs);
      return;
    }
    if(res.kept){
      const newGs={...gs,players:P,deck:D,discard:Disc,log:[...L,...(res.effectMsgs||[])],phase:'ACTION',
        drawReveal:{card:res.drawnCard,msgs:res.effectMsgs,needsDecision:false,forcedKeep:false,drawerIdx,drawerName:P[drawerIdx]?.name},
        abilityData:{},zhuLight:nextZhuLight,_turnStartLogs:[],...(res.statePatch||{})};
      triggerAnimQueue([zhuHideCardStep(godCard),{type:'DRAW_CARD',card:res.drawnCard,triggerName:localDisplayName(drawerIdx,P[drawerIdx]?.name),targetPid:drawerIdx,msgs:res.effectMsgs||[]}],newGs);
      return;
    }
    const newGs={...gs,players:P,deck:D,discard:Disc,log:L,phase:'DRAW_REVEAL',
      drawReveal:{card:res.drawnCard,msgs:res.effectMsgs,needsDecision:!!res.needsDecision,forcedKeep:!!res.forcedKeep,drawerIdx,drawerName:P[drawerIdx]?.name},
      abilityData:{},zhuLight:nextZhuLight,_turnStartLogs:[]};
    triggerAnimQueue([zhuHideCardStep(godCard),{type:'DRAW_CARD',card:res.drawnCard,triggerName:localDisplayName(drawerIdx,P[drawerIdx]?.name),targetPid:drawerIdx,msgs:res.effectMsgs||[]}],newGs);
  }

  function handleZhuHideTopCardDuringSphinx(hide){
    const card=gs.deck?.[0];
    if(!card)return;
    const nextZhuLight=removeZhuLightCard(gs.zhuLight,card);
    if(!hide){
      setGs({...gs,zhuLight:nextZhuLight});
      return;
    }
    const D=moveTopDeckCardToBottom(gs.deck);
    const L=[...gs.log,`【衔烛照幽】你将 ${cardLogText(card,{alwaysShowName:true})} 藏到了牌堆底`];
    triggerAnimQueue([zhuHideCardStep(card)],{...gs,deck:D,log:L,zhuLight:nextZhuLight});
  }

  function handleZhuHideAiDrawCard(hide){
    const guard=gs.abilityData?.zhuGuard||getZhuTopGuard(gs,gs.deck);
    const card=guard?.card||gs.deck?.[0];
    if(!card)return;
    const drawerIdx=gs.abilityData?.drawerIdx??gs.currentTurn??0;
    const nextZhuLight=removeZhuLightCard(gs.zhuLight,card);
    let P=copyPlayers(gs.players);
    let D=hide?moveTopDeckCardToBottom(gs.deck):[...gs.deck];
    let Disc=[...gs.discard];
    const beforeDrawPlayers=copyPlayers(P);
    const isAiDrawer=isAiSeat(gs,drawerIdx)&&!gs._isMP;
    const res=isAiDrawer
      ?aiDrawAndApply(drawerIdx,P,D,Disc,{...gs,zhuLight:nextZhuLight,_zhuBypassTopGuard:true})
      :playerDrawCard(P,D,Disc,drawerIdx,{...gs,zhuLight:nextZhuLight,_zhuBypassTopGuard:true});
    P=res.P;D=res.D;Disc=res.Disc;
    const win=checkWin(P,gs._isMP);
    const split=splitAnimBoundLogs(res.effectMsgs||[]);
    const L=[
      ...gs.log,
      ...(hide?[`【衔烛照幽】你将 ${cardLogText(card,{alwaysShowName:true})} 藏到了牌堆底`]:[]),
      ...(split.preStat||[]),
      ...(split.stat||[]),
    ];
    const fallbackAfterZhuDraw=isAiDrawer?'AI_TURN':'ACTION';
    const {phase:derivedPhase,abilityData:nextAbilityData}=deriveEffectDecisionState(res.statePatch,{fallbackPhase:fallbackAfterZhuDraw});
    const nextPhase=res.needGodChoice?'GOD_CHOICE':(res.needsDecision?'DRAW_REVEAL':derivedPhase);
    const zhuContinuation={
      ...(gs.abilityData?.fromTsathogguaSlime?{
        fromTsathogguaSlime:true,
        continueTurnStartDraw:true,
        pendingTsathogguaSlime:gs.abilityData?.pendingTsathogguaSlime,
        pendingTsathogguaSlimes:gs.abilityData?.pendingTsathogguaSlimes||[],
      }:{}),
      ...(gs.abilityData?.fromRest?{
        fromRest:true,
        cthDrawsRemaining:gs.abilityData?.cthDrawsRemaining||0,
      }:{}),
    };
    const newGs={
      ...gs,
      ...(res.statePatch||{}),
      players:P,
      deck:D,
      discard:Disc,
      log:L,
      zhuLight:nextZhuLight,
      phase:nextPhase,
      abilityData:{
        ...nextAbilityData,
        ...(res.needGodChoice?{godCard:res.drawnCard,drawerIdx,godEncounterCost:res.godEncounterCost}:{}),
        ...zhuContinuation,
      },
      drawReveal:res.needsDecision?{
        card:res.drawnCard,msgs:res.effectMsgs||[],needsDecision:true,forcedKeep:!!res.forcedKeep,
        drawerIdx,drawerName:P[drawerIdx]?.name,sourcePile:res.sourcePile,
        ...(gs.abilityData?.fromRest?{fromRest:true}:{}),
      }:null,
      selectedCard:null,
      _aiDrawnCard:null,
      _drawnCard:null,
      _discardedDrawnCard:false,
      _playersBeforeThisDraw:null,
      _drawLogs:[],
      _statLogs:[],
      ...(win?{gameOver:win}:{}),
    };
    const drawQueue=[];
    if(gs._playersBeforeThisDraw&&!gs.abilityData?.zhuIntroShown)drawQueue.push({type:'YOUR_TURN',name:gs.players[gs.currentTurn]?.name||'???',msgs:gs._turnStartLogs});
    if(hide)drawQueue.push(zhuHideCardStep(card));
    if(res.drawnCard)drawQueue.push({type:'DRAW_CARD',card:res.drawnCard,triggerName:localDisplayName(drawerIdx,P[drawerIdx]?.name),targetPid:drawerIdx,msgs:split.preStat});
    const statQ=bindAnimLogChunks(
      buildAnimQueue({...gs,players:beforeDrawPlayers,log:gs.log},{...newGs,players:P,log:L}),
      {statLogs:split.stat}
    ).filter(step=>step.type!=='DRAW_CARD');
    if(statQ.length){
      visualStateLocks.lock({players:beforeDrawPlayers,zhuLight:gs.zhuLight||null});
    }
    const continueAfterZhuDraw=!win&&(nextPhase==='AI_TURN'||nextPhase==='ACTION')&&gs.abilityData?.continueTurnStartDraw
      ?()=>_tsgContinueTurnStartDraw(newGs)
      :(!win&&(nextPhase==='AI_TURN'||nextPhase==='ACTION')&&gs.abilityData?.fromRest
        ?()=>_cthContinueRestDraws(newGs)
        :undefined);
    triggerAnimQueue([...drawQueue,...statQ,statePatchStep({players:P,discard:Disc})],newGs,continueAfterZhuDraw);
  }

  // Generic Treasure Hunter dodge handler
  function handleTreasureDodge(gs, dr, isAOE = false) {
    const isTutorialDodge = showTutorial && (tutorialStep === TUTORIAL_FLOW.TREASURE_DODGE_PROMPT || tutorialStep === TUTORIAL_FLOW.TREASURE_DODGE_ROLL);
    const d1 = isTutorialDodge ? 6 : (1 + (Math.random() * 6 | 0));
    const dodgeSuccess = isTutorialDodge ? true : d1 >= 4;
    let P = copyPlayers(gs.players), D = [...gs.deck], Disc = [...gs.discard];
    const drawerIdx = isAOE ? (gs.abilityData?.drawerIdx ?? 0) : (dr.drawerIdx ?? 0);
    const who = drawerIdx === 0 ? '你' : P[drawerIdx].name;
    const resolutionCard = revealBlindDrawCard(dr.card);
    clearBlindZoneDecisionFlag(P, drawerIdx, dr);
    
    // Reveal role when Treasure Hunter rolls dice
    if (drawerIdx === 0 && P[0].role === '寻宝者') {
      P[0].roleRevealed = true;
    }
    
    let L = [...gs.log, `${who} 掷出 ${d1} 点，${dodgeSuccess ? '成功规避负面效果！' : '未能规避，触发负面效果！'}`];
    let res;
    
    if (isAOE) {
      // AOE dodge: only avoid for current player
      const avoidNegativeFor = dodgeSuccess ? [0] : [];
      res = applyFx(resolutionCard, drawerIdx, null, P, D, Disc, gs, false, avoidNegativeFor, false);
    } else {
      // Regular dodge: avoid all negative effects for the drawer
      res = applyFx(resolutionCard, drawerIdx, null, P, D, Disc, gs, dodgeSuccess, [], false);
    }
    
    P = res.P; D = res.D; Disc = res.Disc;
    if(!dr.fromEndTurnReplay)P[drawerIdx].hand.push(resolutionCard);
    
    if (dodgeSuccess && !isAOE) {
      L.push(`${who} 收入了 ${cardLogText(resolutionCard,{alwaysShowName:true})}（负面效果已规避）`, ...res.msgs);
    } else {
      L.push(`${who} 收入了 ${cardLogText(resolutionCard,{alwaysShowName:true})}`, ...res.msgs);
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
        log: [...L, localTreasureWinLog(gs)],
        phase: 'PLAYER_WIN_PENDING',
        drawReveal: null,
        abilityData: { winReason: localTreasureWinReason(gs) }
      };
      return { P, D, Disc, L: pendingWinGs.log, pendingWinGs, d1, dodgeSuccess, who };
    }
    
    const replayPatch=dr.fromEndTurnReplay?advanceEndTurnReplayPatch(gs):{};
    const decisionState=deriveEffectDecisionState(res.statePatch,{
      baseAbilityData:gs.abilityData,
      fallbackPhase:'ACTION',
      extraAbilityData:{
        ...(dr.fromRest?{fromRest:true}:{}),
        ...(dr.fromTsathogguaSlime?{fromTsathogguaSlime:true,continueTurnStartDraw:true,pendingTsathogguaSlime:gs.abilityData?.pendingTsathogguaSlime,pendingTsathogguaSlimes:gs.abilityData?.pendingTsathogguaSlimes}:{}),
        ...(gs.abilityData?.cthDrawsRemaining!=null?{cthDrawsRemaining:gs.abilityData.cthDrawsRemaining}:{}),
      },
    });
    const fallbackAbilityData={fromRest:gs.abilityData?.fromRest,fromTsathogguaSlime:gs.abilityData?.fromTsathogguaSlime,continueTurnStartDraw:gs.abilityData?.continueTurnStartDraw,cthDrawsRemaining:gs.abilityData?.cthDrawsRemaining,pendingTsathogguaSlime:gs.abilityData?.pendingTsathogguaSlime,pendingTsathogguaSlimes:gs.abilityData?.pendingTsathogguaSlimes};
    const newGs = {
      ...gs,
      players: P,
      deck: D,
      discard: Disc,
      log: L,
      phase: decisionState.hasDecision?decisionState.phase:'ACTION',
      drawReveal: null,
      abilityData: decisionState.hasDecision?decisionState.abilityData:fallbackAbilityData,
      ...(res.statePatch||{}),
      ...replayPatch
    };
    if(decisionState.hasDecision){
      newGs.phase=decisionState.phase;
      newGs.abilityData=decisionState.abilityData;
    }
    return { P, D, Disc, L, newGs, d1, dodgeSuccess, who, hasDecision:decisionState.hasDecision, resolutionCard };
  }

  function handleTreasureDodgeRoll(){
    const dr=gs.drawReveal;if(!dr?.card)return;
    const result=handleTreasureDodge(gs,dr,false);
    const isTutorialDodgeStep=showTutorial&&(tutorialStep===TUTORIAL_FLOW.TREASURE_DODGE_PROMPT||tutorialStep===TUTORIAL_FLOW.TREASURE_DODGE_ROLL);
    const diceAnim={type:'DICE_ROLL',d1:result.d1,d2:0,heal:0,rollerName:result.who,dodgeSuccess:result.dodgeSuccess,...(isTutorialDodgeStep?{durationMs:2147483647,onSettled:()=>{setTutorialStep(TUTORIAL_FLOW.TREASURE_DODGE_RESULT);setTutorialDiceResultPending(false);}}:{})};
    if(result.win){
      setGs({...gs,players:result.P,deck:result.D,discard:result.Disc,log:result.L,gameOver:result.win,drawReveal:null});
      return;
    }
    if(result.pendingWinGs){
      pendingGsRef.current=result.pendingWinGs;
      animQueueRef.current=[];
      setGs(p=>p?{...p,phase:'ACTION',drawReveal:null}:p);
      setAnim(diceAnim);
      return;
    }
    if(dr.fromRest&&!result.win&&!result.hasDecision){
      // 播放骰子动画后再处理剩余摸牌
      const queue=bindAnimLogChunks(buildAnimQueue(gs,result.newGs),splitAnimBoundLogs(result.L.slice(gs.log.length)));
      pendingGsRef.current=result.newGs;
      animQueueRef.current=[
        ...queue,
        ...(queue.length?[statePatchStep({players:result.P,discard:result.Disc})]:[]),
        {type:'CTH_CONTINUE',data:{cthDrawsRemaining:gs.abilityData?.cthDrawsRemaining}},
      ];
      setGs(p=>p?{...p,phase:'ACTION',drawReveal:null}:p);
      setAnim(diceAnim);
      return;
    }
    if(dr.fromTsathogguaSlime&&!result.win&&!result.hasDecision){
      const queue=bindAnimLogChunks(buildAnimQueue(gs,result.newGs),splitAnimBoundLogs(result.L.slice(gs.log.length)));
      const drawerIdx=dr.drawerIdx??0;
      queue.push(cardTransferStep({fromPid:drawerIdx,dest:'player',toPid:drawerIdx,count:1,sourceAnchor:'playerArea',effect:'draw',cards:[result.resolutionCard]}));
      queue.push(statePatchStep({players:result.P,deck:result.D,discard:result.Disc,log:result.L,phase:result.newGs.phase,drawReveal:result.newGs.drawReveal,abilityData:result.newGs.abilityData}));
      queue.push({type:'TURN_BOUNDARY_PAUSE',durationMs:300});
      setGs(p=>p?{...p,phase:'ACTION',drawReveal:null}:p);
      setAnim({...diceAnim,onSettled:()=>triggerAnimQueue(queue,result.newGs,()=>_tsgContinueTurnStartDraw(result.newGs))});
      return;
    }
    const queue=bindAnimLogChunks(buildAnimQueue(gs,result.newGs),splitAnimBoundLogs(result.L.slice(gs.log.length)));
    const drawerIdx=dr.drawerIdx??0;
    queue.push(cardTransferStep({fromPid:drawerIdx,dest:'player',toPid:drawerIdx,count:1,sourceAnchor:'playerArea',effect:'draw',cards:[result.resolutionCard]}));
    // 无论是否有其他动画，都播放骰子动画
    broadcastVisualReplayIfNeeded(result.newGs);
    if(dr.fromEndTurnReplay){
      appendEndTurnReplaySyncQueue(
        [{type:'DICE_ROLL',d1:result.d1,d2:0,heal:0,rollerName:result.who,dodgeSuccess:result.dodgeSuccess},...queue,statePatchStep({players:result.P,discard:result.Disc})],
        result.L.slice(gs.log.length)
      );
      broadcastEndTurnReplaySyncDelta(result.newGs);
    }
    pendingGsRef.current=result.newGs;
    animQueueRef.current=queue;
    setGs(p=>p?{...p,phase:'ACTION',drawReveal:null}:p);
    setAnim(diceAnim);
    if(isTutorialDodgeStep){
      setTutorialDiceResultPending(true);
    }
  }

  function handleTreasureDodgeSkip(){
    if(showTutorial&&tutorialStepDef&&!isTutorialActionAllowed({type:'dodgeRoll'}))return;
    const dr=gs.drawReveal;if(!dr?.card)return;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard];
    const drawerIdx=dr.drawerIdx??0;
    const resolutionCard=revealBlindDrawCard(dr.card);
    clearBlindZoneDecisionFlag(P,drawerIdx,dr);
    const res=applyFx(resolutionCard,drawerIdx,null,P,D,Disc,gs,false,[],false);
    P=res.P;D=res.D;Disc=res.Disc;
    if(!dr.fromEndTurnReplay)P[drawerIdx].hand.push(resolutionCard);
    const who=localDisplayName(drawerIdx,P[drawerIdx].name);
    const L=[...gs.log,...(dr.reshuffleLog?[dr.reshuffleLog]:[]),`${who} 收入了 ${cardLogText(resolutionCard,{alwaysShowName:true})}`,...res.msgs];
    // 1. 检查卡牌效果是否让任何人HP归零或SAN归零（通过checkWin）
    const win=checkWin(P,gs._isMP);if(win){setGs({...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win,drawReveal:null});return;}
    // 2. 最后，如果游戏仍未结束，且该寻宝者仍然存活，检查该寻宝者是否达成胜利条件
    if(isLocalSeatIndex(drawerIdx)&&!P[0].isDead&&P[0].role==='寻宝者'&&isWinHand(P[0].hand)){
      P[0].roleRevealed=true;
      const pendingWinGs={...gs,players:P,deck:D,discard:Disc,log:[...L,localTreasureWinLog(gs)],phase:'PLAYER_WIN_PENDING',drawReveal:null,abilityData:{winReason:localTreasureWinReason(gs)},...(res.statePatch||{})};
      const effectQueue=bindAnimLogChunks(buildAnimQueue(gs,pendingWinGs),splitAnimBoundLogs(L.slice(gs.log.length)));
      const transfer=!dr.fromEndTurnReplay?cardTransferStep({
        fromPid:drawerIdx,dest:'player',toPid:drawerIdx,count:1,
        sourceAnchor:'playerArea',effect:'draw',cards:[resolutionCard],
      }):null;
      triggerAnimQueue([transfer,...effectQueue].filter(Boolean),pendingWinGs);
      return;
    }
    const replayPatch=dr.fromEndTurnReplay?advanceEndTurnReplayPatch(gs):{};
    const decisionState=deriveEffectDecisionState(res.statePatch,{
      baseAbilityData:gs.abilityData,
      fallbackPhase:'ACTION',
      extraAbilityData:{
        ...(dr.fromRest?{fromRest:true}:{}),
        ...(dr.fromTsathogguaSlime?{fromTsathogguaSlime:true,continueTurnStartDraw:true,pendingTsathogguaSlime:gs.abilityData?.pendingTsathogguaSlime,pendingTsathogguaSlimes:gs.abilityData?.pendingTsathogguaSlimes}:{}),
        ...(gs.abilityData?.cthDrawsRemaining!=null?{cthDrawsRemaining:gs.abilityData.cthDrawsRemaining}:{}),
      },
    });
    const newGs={...gs,players:P,deck:D,discard:Disc,log:L,phase:decisionState.hasDecision?decisionState.phase:'ACTION',drawReveal:null,abilityData:decisionState.hasDecision?decisionState.abilityData:{fromRest:gs.abilityData?.fromRest,fromTsathogguaSlime:gs.abilityData?.fromTsathogguaSlime,continueTurnStartDraw:gs.abilityData?.continueTurnStartDraw,cthDrawsRemaining:gs.abilityData?.cthDrawsRemaining},...(res.statePatch||{}),...replayPatch};
    if(decisionState.hasDecision){
      newGs.phase=decisionState.phase;
      newGs.abilityData=decisionState.abilityData;
    }
    if(dr.fromRest&&!win&&!decisionState.hasDecision){_cthContinueRestDraws(newGs);return;}
    const queue=bindAnimLogChunks(buildAnimQueue(gs,newGs),splitAnimBoundLogs(L.slice(gs.log.length)));
    if(dr.fromTsathogguaSlime&&!win&&!decisionState.hasDecision){
      queue.push(cardTransferStep({fromPid:drawerIdx,dest:'player',toPid:drawerIdx,count:1,sourceAnchor:'playerArea',effect:'draw',cards:[resolutionCard]}));
      queue.push(statePatchStep({players:P,deck:D,discard:Disc,log:L,phase:newGs.phase,drawReveal:newGs.drawReveal,abilityData:newGs.abilityData}));
      queue.push({type:'TURN_BOUNDARY_PAUSE',durationMs:300});
      setGs(p=>p?{...p,phase:'ACTION',drawReveal:null}:p);
      triggerAnimQueue(queue,newGs,()=>_tsgContinueTurnStartDraw(newGs));
      return;
    }
    if(queue.length){
      broadcastVisualReplayIfNeeded(newGs);
      if(dr.fromEndTurnReplay){
        appendEndTurnReplaySyncQueue([...queue,statePatchStep({players:P,discard:Disc})],L.slice(gs.log.length));
        broadcastEndTurnReplaySyncDelta(newGs);
      }
      setGs(p=>p?{...p,phase:'ACTION',drawReveal:null}:p);
      triggerAnimQueue(queue,newGs);
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
      const queue=bindAnimLogChunks(buildAnimQueue(gs,result.newGs),splitAnimBoundLogs(result.L.slice(gs.log.length)));
      pendingGsRef.current=result.newGs;
      animQueueRef.current=[
        ...queue,
        ...(queue.length?[statePatchStep({players:result.P,discard:result.Disc})]:[]),
        {type:'CTH_CONTINUE',data:{cthDrawsRemaining:gs.abilityData?.cthDrawsRemaining}},
      ];
      setGs(p=>p?{...p,phase:'ACTION',drawReveal:null}:p);
      setAnim({type:'DICE_ROLL',d1:result.d1,d2:0,heal:0,rollerName:'你',dodgeSuccess:result.dodgeSuccess});
      return;
    }
    if(dr.fromTsathogguaSlime&&!result.win&&!result.hasDecision){
      const queue=bindAnimLogChunks(buildAnimQueue(gs,result.newGs),splitAnimBoundLogs(result.L.slice(gs.log.length)));
      const drawerIdx=gs.abilityData?.drawerIdx??dr.drawerIdx??0;
      queue.push(cardTransferStep({fromPid:drawerIdx,dest:'player',toPid:drawerIdx,count:1,sourceAnchor:'playerArea',effect:'draw',cards:[result.resolutionCard]}));
      queue.push(statePatchStep({players:result.P,deck:result.D,discard:result.Disc,log:result.L,phase:result.newGs.phase,drawReveal:result.newGs.drawReveal,abilityData:result.newGs.abilityData}));
      queue.push({type:'TURN_BOUNDARY_PAUSE',durationMs:300});
      setGs(p=>p?{...p,phase:'ACTION',drawReveal:null}:p);
      setAnim({type:'DICE_ROLL',d1:result.d1,d2:0,heal:0,rollerName:'你',dodgeSuccess:result.dodgeSuccess,onSettled:()=>triggerAnimQueue(queue,result.newGs,()=>_tsgContinueTurnStartDraw(result.newGs))});
      return;
    }
    const queue=bindAnimLogChunks(buildAnimQueue(gs,result.newGs),splitAnimBoundLogs(result.L.slice(gs.log.length)));
    // 无论是否有其他动画，都播放骰子动画
    broadcastVisualReplayIfNeeded(result.newGs);
    if(dr.fromEndTurnReplay){
      appendEndTurnReplaySyncQueue(
        [{type:'DICE_ROLL',d1:result.d1,d2:0,heal:0,rollerName:'你',dodgeSuccess:result.dodgeSuccess},...queue,statePatchStep({players:result.P,discard:result.Disc})],
        result.L.slice(gs.log.length)
      );
    }
    pendingGsRef.current=result.newGs;
    animQueueRef.current=queue;
    setGs(p=>p?{...p,phase:'ACTION',drawReveal:null}:p);
    setAnim({type:'DICE_ROLL',d1:result.d1,d2:0,heal:0,rollerName:'你',dodgeSuccess:result.dodgeSuccess});
  }

  function handleTreasureAOEDodgeSkip(){
    const dr=gs.drawReveal;if(!dr?.card)return;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard];
    const drawerIdx=gs.abilityData?.drawerIdx??0;
    const resolutionCard=revealBlindDrawCard(dr.card);
    clearBlindZoneDecisionFlag(P,drawerIdx,dr);
    const res=applyFx(resolutionCard,drawerIdx,null,P,D,Disc,gs);
    P=res.P;D=res.D;Disc=res.Disc;
    if(!dr.fromEndTurnReplay)P[drawerIdx].hand.push(resolutionCard);
    const L=[...gs.log,...(dr.reshuffleLog?[dr.reshuffleLog]:[]),`你选择不规避负面效果`,...res.msgs];
    // 1. 检查卡牌效果是否让任何人HP归零或SAN归零（通过checkWin）
    const win=checkWin(P,gs._isMP);if(win){setGs({...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win,drawReveal:null});return;}
    // 2. 最后，如果游戏仍未结束，且该寻宝者仍然存活，检查该寻宝者是否达成胜利条件
    if(isLocalSeatIndex(drawerIdx)&&!P[0].isDead&&P[0].role==='寻宝者'&&isWinHand(P[0].hand)){
      P[0].roleRevealed=true;
      const pendingWinGs={...gs,players:P,deck:D,discard:Disc,log:[...L,localTreasureWinLog(gs)],phase:'PLAYER_WIN_PENDING',drawReveal:null,abilityData:{winReason:localTreasureWinReason(gs)},...(res.statePatch||{})};
      const effectQueue=bindAnimLogChunks(buildAnimQueue(gs,pendingWinGs),splitAnimBoundLogs(L.slice(gs.log.length)));
      const transfer=!dr.fromEndTurnReplay?cardTransferStep({
        fromPid:drawerIdx,dest:'player',toPid:drawerIdx,count:1,
        sourceAnchor:'playerArea',effect:'draw',cards:[resolutionCard],
      }):null;
      triggerAnimQueue([transfer,...effectQueue].filter(Boolean),pendingWinGs);
      return;
    }
    const replayPatch=dr.fromEndTurnReplay?advanceEndTurnReplayPatch(gs):{};
    const newGs={...gs,players:P,deck:D,discard:Disc,log:L,phase:'ACTION',drawReveal:null,abilityData:{fromRest:gs.abilityData?.fromRest,fromTsathogguaSlime:gs.abilityData?.fromTsathogguaSlime,continueTurnStartDraw:gs.abilityData?.continueTurnStartDraw,cthDrawsRemaining:gs.abilityData?.cthDrawsRemaining},...replayPatch};
    if(dr.fromRest&&!win){_cthContinueRestDraws(newGs);return;}
    const queue=bindAnimLogChunks(buildAnimQueue(gs,newGs),splitAnimBoundLogs(L.slice(gs.log.length)));
    if(dr.fromTsathogguaSlime&&!win){
      queue.push(cardTransferStep({fromPid:drawerIdx,dest:'player',toPid:drawerIdx,count:1,sourceAnchor:'playerArea',effect:'draw',cards:[resolutionCard]}));
      queue.push(statePatchStep({players:P,deck:D,discard:Disc,log:L,phase:newGs.phase,drawReveal:newGs.drawReveal,abilityData:newGs.abilityData}));
      queue.push({type:'TURN_BOUNDARY_PAUSE',durationMs:300});
      setGs(p=>p?{...p,phase:'ACTION',drawReveal:null}:p);
      triggerAnimQueue(queue,newGs,()=>_tsgContinueTurnStartDraw(newGs));
      return;
    }
    if(queue.length){
      broadcastVisualReplayIfNeeded(newGs);
      if(dr.fromEndTurnReplay)appendEndTurnReplaySyncQueue([...queue,statePatchStep({players:P,discard:Disc})],L.slice(gs.log.length));
      setGs(p=>p?{...p,phase:'ACTION',drawReveal:null}:p);
      triggerAnimQueue(queue,newGs);
    }else setGs(newGs);
  }

  function handleDrawDiscard(){
    const dr=gs.drawReveal;if(!dr?.card)return;
    const drawerIdx=dr.drawerIdx??0;
    const who=localDisplayName(drawerIdx,(dr.drawerName||gs.players[drawerIdx]?.name||'该角色'));
    const discardCard=revealBlindDrawCard(dr.card);
    // 先播放弃牌动画，再更新游戏状态
    const discardLog=`${who} 弃置了 ${cardLogText(discardCard,{alwaysShowName:true})}`;
    const queue=[{type:'DISCARD',card:discardCard,triggerName:who,msgs:[discardLog]}];
    const P=copyPlayers(gs.players);
    clearBlindZoneDecisionFlag(P,drawerIdx,dr);
    const nextDiscard=[...gs.discard,discardCard];
    if(dr.fromEndTurnReplay){
      const idx=(P[drawerIdx]?.hand||[]).findIndex(card=>card?.id===dr.card?.id);
      if(idx>=0)P[drawerIdx].hand.splice(idx,1);
    }
    const replayPatch=dr.fromEndTurnReplay?advanceEndTurnReplayPatch(gs):{};
    const newGs={...gs,players:P,discard:nextDiscard,log:[...gs.log,...(dr.reshuffleLog?[dr.reshuffleLog]:[]),discardLog],phase:'ACTION',drawReveal:null,abilityData:gs.abilityData,...replayPatch};
    if(dr.fromEndTurnReplay)appendEndTurnReplaySyncQueue([...queue,statePatchStep({players:P,discard:nextDiscard})],[discardLog]);
    else if(newGs._isMP)broadcastMpStateBeforeLocalReplay(newGs);
    // CTH fromRest: after discarding, process remaining draws then advance turn
    if(dr.fromRest){
      // 播放动画后继续处理剩余抽牌
      triggerAnimQueue(queue,newGs,()=>{
        _cthContinueRestDraws(newGs);
      });
    }else if(dr.fromTsathogguaSlime){
      triggerAnimQueue(queue,newGs,()=>{
        _tsgContinueTurnStartDraw(newGs);
      });
    }else if(dr.fromProliferatingZ){
      triggerAnimQueue(queue,newGs,()=>{
        // 增殖的Z队列为空时 continueProliferatingZDraws 返回 false 且不提交状态，
        // 必须在此落定弃牌后的 newGs，否则会卡在 DRAW_REVEAL 决策弹窗里死循环。
        if(!continueProliferatingZDraws(newGs))setGs(newGs);
      });
    }else{
      // 播放动画后更新游戏状态
      triggerAnimQueue(queue,newGs);
    }
  }

  function handleDrawDiscardFromModal(){
    if(showTutorial&&tutorialStepDef)return;
    handleDrawDiscard();
  }

  function useAbility(){
    const P = gs.players;
    const skillRole=gs.globalOnlySwapOwner!=null?'寻宝者':me.role;
    if((phase!=='ACTION'&&phase!=='HUNT_SELECT_TARGET')||isBlocked||gs.restUsed||P[0].disableSkill)return;
    const tutorialAction={type:'useSkill'};
    if(!isTutorialActionAllowed(tutorialAction))return;
    const tutorialNext=getNextTutorialStepForAction(tutorialAction);
    if(skillRole!=='追猎者'&&gs.skillUsed)return;
    // 追猎者可以在同一回合内多次使用追捕技能，即使skillUsed为true
    // 但如果本回合已经放弃追捕，则disableSkill会被置为true，禁用追捕
    // Snapshot roleRevealed so cancel can restore it if skill is aborted
    const preSkillRevealed=me.roleRevealed;
    if(skillRole==='寻宝者')setGs({...gs,phase:'SWAP_SELECT_TARGET',drawReveal:null,abilityData:{preSkillRevealed}});
    else if(skillRole==='追猎者')setGs({...gs,phase:'HUNT_SELECT_TARGET',abilityData:{preSkillRevealed}});
    else setGs({...gs,phase:'BEWITCH_SELECT_CARD',abilityData:{preSkillRevealed}});
    if(tutorialNext&&tutorialNext!==tutorialStep)setTutorialStep(tutorialNext);
  }

  function swapSelectTarget(ti){
    const tutorialAction={type:'selectTarget',pid:ti};
    if(!isTutorialActionAllowed(tutorialAction))return;
    const tutorialNext=getNextTutorialStepForAction(tutorialAction);
    if(!gs.players[ti].hand.length)return;
    let P=copyPlayers(gs.players);
    let D=[...gs.deck],Disc=[...gs.discard],L=[...gs.log];
    const night=resolveApophisTarget({
      players:P,deck:D,discard:Disc,log:L,actorIdx:0,selectedIdx:ti,
      legalTargets:P.map((p,i)=>i).filter(i=>i!==0&&!P[i].isDead&&P[i].hand.length),
      label:'选择【掉包】目标'
    });
    P=night.players;D=night.deck;Disc=night.discard;L=night.log;ti=night.targetIdx;
    // 只有使用自己的掉包技能时才公开身份，通过“绮丽诗篇”获得的掉包技能不公开身份
    if(gs.globalOnlySwapOwner===null){
      P[0].roleRevealed=true;
    }
    const targetPlayer=P[ti];
    // 如果目标玩家手牌公开，让玩家选择一张牌
    setGsWithApophisTargetAnim({...gs,players:P,phase:targetPlayer.revealHand?'SWAP_SELECT_TARGET_CARD':'SWAP_STEAL_CARD',
      drawReveal:null,
      abilityData:{swapTi:ti,preSkillRevealed:gs.abilityData?.preSkillRevealed},
      log:[...L,`你${gs.globalOnlySwapOwner!==null?'':'（寻宝者）'}对 ${gs.players[ti].name} 【掉包】，请选择要抽取的牌`],
      ...apophisNightPatch(night)});
    // 教学提示等暗抽洗牌动画结束后再出现，与骰子动画定格类似
    if(tutorialNext&&tutorialNext!==TUTORIAL_FLOW.TREASURE_STEAL_CARD)setTutorialStep(tutorialNext);
  }
  function zoneSwapSelectTarget(ti){
    // 强征献礼：与目标交换全部手牌
    const card=gs.abilityData?.zoneSwapCard;
    if(!card)return;
    const fromRest=gs.abilityData?.fromRest;
    const fromEndTurnReplay=gs.abilityData?.fromEndTurnReplay;
    const continueTurnStartDraw=!!gs.abilityData?.continueTurnStartDraw;
    const myHandCountBefore=gs.players?.[0]?.hand?.length||0;
    const targetHandCountBefore=gs.players?.[ti]?.hand?.length||0;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard],baseLog=[...gs.log];
    const night=resolveApophisTarget({
      players:P,deck:D,discard:Disc,log:baseLog,actorIdx:0,selectedIdx:ti,
      legalTargets:P.map((p,i)=>i).filter(i=>i!==0&&!P[i].isDead),
      label:`选择【${card.name||'触底反弹'}】目标`
    });
    P=night.players;D=night.deck;Disc=night.discard;baseLog=night.log;ti=night.targetIdx;
    const res=applyFx(card,0,ti,P,D,Disc,gs);
    P=res.P;D=res.D;Disc=res.Disc;
    if(!fromEndTurnReplay)P[0].hand.push(card); // 区域牌留在手中（效果已执行）
    const L=[...baseLog,...res.msgs];
    const win=checkWin(P,gs._isMP);
    if(win){setGs({...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win,phase:'ACTION',abilityData:{}});return;}
    if(P[0].role==='寻宝者'&&isWinHand(P[0].hand)){
      P[0].roleRevealed=true;
      const pendingWinGs={...gs,players:P,deck:D,discard:Disc,log:[...L,localTreasureWinLog(gs)],phase:'PLAYER_WIN_PENDING',abilityData:{winReason:localTreasureWinReason(gs)},...apophisNightPatch(night)};
      const swapMsgs=extractSkillLogs(L.slice(gs.log.length),'swap');
      const queue=[
        {type:'SKILL_SWAP',msgs:swapMsgs},
        ...fullHandSwapSteps({
          fromPid:0,toPid:ti,fromCount:myHandCountBefore,toCount:targetHandCountBefore,
          msgs:[L[L.length-1]],playersBefore:gs.players,zhuLight:gs.zhuLight||null,
        }),
        ...buildAnimQueue(gs,pendingWinGs).filter(a=>a.type!=='CARD_TRANSFER'&&a.type!=='SKILL_SWAP'),
      ];
      triggerAnimQueue(queue,pendingWinGs);
      return;
    }
    const newGs={...gs,players:P,deck:D,discard:Disc,log:L,phase:'ACTION',abilityData:{
      ...(fromRest?{fromRest:true}:{}),
      ...(gs.abilityData?.fromTsathogguaSlime?{fromTsathogguaSlime:true}:{}),
      ...(continueTurnStartDraw?{continueTurnStartDraw:true}:{}),
      ...(gs.abilityData?.cthDrawsRemaining!=null?{cthDrawsRemaining:gs.abilityData.cthDrawsRemaining}:{}),
    },...apophisNightPatch(night)};
    const swapMsgs=extractSkillLogs(L.slice(gs.log.length),'swap');
    const swapSteps=fullHandSwapSteps({
      fromPid:0,
      toPid:ti,
      fromCount:myHandCountBefore,
      toCount:targetHandCountBefore,
      msgs:[L[L.length-1]],
      playersBefore:gs.players,
      zhuLight:gs.zhuLight||null,
    });
    const statQ=buildAnimQueue(gs,newGs).filter(a=>a.type!=='CARD_TRANSFER');
    const queue=[{type:'SKILL_SWAP',msgs:swapMsgs},...swapSteps,...statQ];
    if(fromRest){triggerAnimQueue(queue,null,()=>_cthContinueRestDraws(newGs));return;}
    if(continueTurnStartDraw){triggerAnimQueue(queue,null,()=>_tsgContinueTurnStartDraw(newGs));return;}
    triggerAnimQueue(queue,newGs);
  }

  function buildTargetContinuationGs(options){
    return buildTargetContinuationState({baseState:gs,...options});
  }

  function broadcastVisualReplayIfNeeded(state){
    if(!state?._isMP||state._endTurnReplay)return;
    broadcastMpStateBeforeLocalReplay(state);
  }

  function applyLossDirectly({players,deck,discard,log,targetIdx,lostHp=0,lostSan=0,source='虚化',currentTurn=gs.currentTurn,baseInspectionMeta=null}){
    let P=players,D=deck,Disc=discard,L=log;
    let inspectionMeta=baseInspectionMeta||makeInspectionMeta({...gs,players:P,deck:D,discard:Disc,log:L});
    if(lostHp>0){
      applyHpDamageWithLink(P,targetIdx,lostHp,Disc,L,currentTurn,D);
      L.push(`${localDisplayName(targetIdx,P[targetIdx]?.name)} 失去 ${lostHp} HP`);
    }
    if(lostSan>0&&P[targetIdx]&&!P[targetIdx].isDead){
      L.push(`${localDisplayName(targetIdx,P[targetIdx]?.name)} 失去 ${lostSan} SAN`);
      const processed=applySanLossToPlayerWithInspection(targetIdx,lostSan,currentTurn,P,D,Disc,L,inspectionMeta,source,{skipEtherealize:true});
      P=processed.P;D=processed.D;Disc=processed.Disc;L=processed.L;inspectionMeta=processed.inspectionMeta;
    }
    return {P,D,Disc,L,inspectionMeta};
  }

  function finishEtherealizeDecision({players,deck,discard,log,abilityData,queue=[],beforeDamagePlayers=null}){
    const turnOwner=abilityData._turnOwner??gs.currentTurn;
    const extraPatch={
      ...(abilityData._statEvents?{_statEvents:abilityData._statEvents}:{}),
      ...(abilityData._statEventSeq!=null?{_statEventSeq:abilityData._statEventSeq}:{}),
      ...(abilityData.inspectionDeck?{inspectionDeck:abilityData.inspectionDeck}:{}),
      ...(abilityData.inspectionDiscard?{inspectionDiscard:abilityData.inspectionDiscard}:{}),
      ...(abilityData.sealLooseningCount!=null?{sealLooseningCount:abilityData.sealLooseningCount}:{}),
      ...(abilityData.houndsOfTindalosActive!=null?{houndsOfTindalosActive:abilityData.houndsOfTindalosActive}:{}),
      ...(abilityData.houndsOfTindalosTarget!=null?{houndsOfTindalosTarget:abilityData.houndsOfTindalosTarget}:{}),
      ...(abilityData.houndsOfTindalosElapsed!=null?{houndsOfTindalosElapsed:abilityData.houndsOfTindalosElapsed}:{}),
      ...(abilityData._inspectionSeq!=null?{_inspectionSeq:abilityData._inspectionSeq}:{}),
      ...(abilityData._inspectionEvents?{_inspectionEvents:abilityData._inspectionEvents}:{}),
      _visualEvents:[],
    };
    let nextGs=buildTargetContinuationGs({
      players,
      deck,
      discard,
      log,
      turnOwner,
      abilityData,
      canResumeAi:true,
      extraPatch,
    });
    const slimeDecision=beforeDamagePlayers
      ?buildTsathogguaSlimeBalanceDecision(beforeDamagePlayers,players,{
        ...buildTargetContinuationAbilityData(abilityData),
        _turnOwner:turnOwner,
      })
      :null;
    if(slimeDecision)nextGs={...nextGs,phase:'TSG_SLIME_BALANCE',abilityData:slimeDecision};
    const win=slimeDecision?null:checkWin(players,gs._isMP);
    if(win)nextGs={...nextGs,phase:'ACTION',abilityData:{},gameOver:win};
    const queueWithStats=queue.length?queue:buildAnimQueue(gs,{...gs,players,deck,discard,log,...extraPatch});
    const queueWithPatch=queueWithStats.length
      ?[...queueWithStats,statePatchStep({players,deck,discard,log,...extraPatch})]
      :queueWithStats;
    finishTargetContinuation({
      queue:queueWithPatch,
      nextGs,
      continueRest:!win&&!!abilityData.fromRest,
    });
  }

  // 决策链推进：还有未决定的虚化候选则进入下一轮决策；否则归并结算全部损失
  function continueOrSettleEtherealizeChain({players,deck,discard,log,abilityData,consumedIndex,preQueue=[]}){
    const turnOwner=abilityData._turnOwner??gs.currentTurn;
    const nextDecision=getNextEtherealizeChainDecision(abilityData,players,consumedIndex);
    if(nextDecision){
      const nextGs=buildTargetContinuationGs({
        players,
        deck,
        discard,
        log,
        turnOwner,
        abilityData:nextDecision,
        phase:'ETHEREALIZE_DECISION',
        canResumeAi:false,
        extraPatch:{_visualEvents:[]},
      });
      // buildTargetContinuationGs 会把 abilityData 裁剪为续播字段，这里恢复完整的决策数据
      const fullNextGs={...nextGs,phase:'ETHEREALIZE_DECISION',abilityData:nextDecision};
      const queue=preQueue.length
        ?[...preQueue,statePatchStep({players,deck,discard,log})]
        :[];
      if(queue.length)triggerAnimQueue(queue,fullNextGs);
      else setGs(fullNextGs);
      return;
    }
    settleEtherealizeChain({players,deck,discard,log,abilityData,preQueue});
  }

  // 链结束：将已确认的损失与效果期间延迟的直接伤害按原始顺序一次性归并结算，
  // 伤害扣减特效在此时统一播放
  function settleEtherealizeChain({players,deck,discard,log,abilityData,preQueue=[]}){
    const turnOwner=abilityData._turnOwner??gs.currentTurn;
    let P=players,D=deck,Disc=discard,L=log;
    const beforeSettlePlayers=copyPlayers(P);
    const beforeSettleLogLen=L.length;
    let inspectionMeta=makeInspectionMeta({...gs,players:P,deck:D,discard:Disc,log:L});
    const losses=collectEtherealizeChainSettleLosses(abilityData);
    losses.forEach(loss=>{
      const result=applyLossDirectly({
        players:P,
        deck:D,
        discard:Disc,
        log:L,
        targetIdx:loss.targetIdx,
        lostHp:loss.lostHp||0,
        lostSan:loss.lostSan||0,
        source:loss.source||'伤害结算',
        currentTurn:turnOwner,
        baseInspectionMeta:inspectionMeta,
      });
      P=result.P;D=result.D;Disc=result.Disc;L=result.L;inspectionMeta=result.inspectionMeta;
    });
    const pendingLinkTarget=P.findIndex(player=>player?._pendingDamageLinkBreak&&!(player.hand||[]).some(isTsathogguaSlime));
    if(pendingLinkTarget>=0){
      const linkReaction=resolvePendingDamageLinkBreak(
        P,pendingLinkTarget,Disc,L,turnOwner,D,buildTargetContinuationAbilityData(abilityData)
      );
      if(linkReaction.etherealizeDecision){
        const nextGs=buildTargetContinuationGs({
          players:P,deck:D,discard:Disc,log:L,turnOwner,
          abilityData:linkReaction.etherealizeDecision,
          phase:'ETHEREALIZE_DECISION',canResumeAi:false,
          extraPatch:{_visualEvents:[]},
        });
        const fullNextGs={...nextGs,phase:'ETHEREALIZE_DECISION',abilityData:linkReaction.etherealizeDecision};
        const settleQueue=buildAnimQueue(gs,{...gs,players:P,deck:D,discard:Disc,log:L});
        finishTargetContinuation({queue:[...preQueue,...settleQueue],nextGs:fullNextGs});
        return;
      }
    }
    const statEventSeq=(gs._statEventSeq||0)+1;
    const statEvents=buildStatEvents(beforeSettlePlayers,P,L.slice(beforeSettleLogLen),{reason:'伤害结算',seq:statEventSeq});
    const statPatch=statEvents.length?{_statEvents:[...(gs._statEvents||[]),...statEvents],_statEventSeq:statEventSeq}:{};
    const {_statEvents:_dropMetaStatEvents,_statEventSeq:_dropMetaStatSeq,abilityData:_dropMetaAbilityData,...inspectionMetaFields}=inspectionMeta||{};
    const finalAbilityData={...abilityData,...inspectionMetaFields,...statPatch};
    const settleQueue=losses.length
      ?buildAnimQueue(gs,{...gs,players:P,deck:D,discard:Disc,log:L,...statPatch})
      :[];
    finishEtherealizeDecision({
      players:P,
      deck:D,
      discard:Disc,
      log:L,
      abilityData:finalAbilityData,
      queue:[...preQueue,...settleQueue],
      beforeDamagePlayers:beforeSettlePlayers,
    });
  }

  function resolveEtherealizeRedirect(useEtherealize){
    const abilityData=gs.abilityData||{};
    const targetIdx=abilityData.targetIdx;
    if(targetIdx==null||!gs.players?.[targetIdx])return;
    if(useEtherealize){
      setGs({...gs,phase:'ETHEREALIZE_SELECT_TARGET',abilityData:{...abilityData,type:'etherealizeSelectTarget'}});
      return;
    }
    // 不消耗虚化：确认由原目标承受，但不立即结算——待整条伤害前置事件链结束后归并结算
    const confirmed={
      targetIdx,
      lostHp:abilityData.lostHp||0,
      lostSan:abilityData.lostSan||0,
      source:abilityData.source||'伤害',
      order:abilityData.order,
    };
    const nextAbilityData=appendConfirmedChainLoss(abilityData,confirmed);
    continueOrSettleEtherealizeChain({
      players:copyPlayers(gs.players),
      deck:[...gs.deck],
      discard:[...gs.discard],
      log:[...gs.log],
      abilityData:nextAbilityData,
      consumedIndex:abilityData.pendingIndex??0,
    });
  }

  function etherealizeSelectTarget(redirectTargetIdx){
    const abilityData=gs.abilityData||{};
    const sourceIdx=abilityData.targetIdx;
    const validTargets=abilityData.adjacentTargets||[];
    if(sourceIdx==null||!validTargets.includes(redirectTargetIdx))return;
    const P=copyPlayers(gs.players);
    const source=P[sourceIdx];
    if(!source||source.isDead)return;
    source.etherealizeStacks=Math.max(0,(source.etherealizeStacks||0)-1);
    const L=[...gs.log,`${localDisplayName(sourceIdx,source.name)} 消耗1层虚化，将即将失去的${abilityData.lostHp?`${abilityData.lostHp}HP`:''}${abilityData.lostHp&&abilityData.lostSan?'和':''}${abilityData.lostSan?`${abilityData.lostSan}SAN`:''}转移给 ${localDisplayName(redirectTargetIdx,P[redirectTargetIdx]?.name)}`];
    // 消耗虚化的前置事件动画（标签 -1）立即播放，伤害结算等链结束后再统一播放
    const consumeStep={type:'ETHEREALIZE_CONSUME',targetIdx:sourceIdx,msgs:L.slice(-1)};
    // 递归检查：被转移目标自身也有虚化时，由其继续决策是否再次转移
    const recursionLoss=buildEtherealizeRedirectChainLoss({
      players:P,
      sourceIdx,
      redirectTargetIdx,
      lostHp:abilityData.lostHp||0,
      lostSan:abilityData.lostSan||0,
      currentTurn:gs.currentTurn,
      order:abilityData.order,
    });
    const nextAbilityData=recursionLoss
      ?{...abilityData,pendingLosses:[...(abilityData.pendingLosses||[]),recursionLoss]}
      :appendConfirmedChainLoss(abilityData,{
        targetIdx:redirectTargetIdx,
        lostHp:abilityData.lostHp||0,
        lostSan:abilityData.lostSan||0,
        source:'半物质化',
        order:abilityData.order,
      });
    continueOrSettleEtherealizeChain({
      players:P,
      deck:[...gs.deck],
      discard:[...gs.discard],
      log:L,
      abilityData:nextAbilityData,
      consumedIndex:abilityData.pendingIndex??0,
      preQueue:[consumeStep],
    });
  }

  function resolveApophisTarget({players,deck,discard,log,actorIdx,selectedIdx,legalTargets,label='选中目标'}){
    const result=resolveApophisTargetRule({gs,players,deck,discard,log,actorIdx,selectedIdx,legalTargets,label});
    if(result.statePatch?._statEvents){
      result.apophisNight={...(result.apophisNight||{}),_statEvents:result.statePatch._statEvents,_statEventSeq:result.statePatch._statEventSeq};
    }
    return result;
  }

  function apophisNightPatch(nightResult){
    if(!nightResult)return {};
    return nightResult.statePatch||{apophisNight:nightResult.apophisNight??null};
  }

  function setGsWithApophisTargetAnim(nextState){
    const queue=buildApophisTargetQueueForState(gs,nextState);
    if(queue.length)triggerAnimQueue(queue,nextState);
    else setGs(nextState);
  }


  function finishTargetContinuation({queue=[],nextGs,continueRest=false,continueTurnStartDraw=false,syncLog=false}){
    queue=mergeApophisTargetQueue(queue,gs,nextGs);
    if((nextGs?.phase==='ACTION'||nextGs?.phase==='AI_TURN')&&nextGs?.abilityData?.pendingInspectionContinuation?.targets?.length){
      const pendingContinuation=nextGs.abilityData.pendingInspectionContinuation;
      const beforeContinuationPlayers=copyPlayers(nextGs.players||[]);
      const beforeContinuationLog=[...(Array.isArray(nextGs.log)?nextGs.log:[])];
      const oldInspectionSeq=nextGs._inspectionSeq??gs._inspectionSeq??0;
      const continuationMeta=makeInspectionMeta(nextGs);
      const processed=processInspectionTargets(
        pendingContinuation.targets,
        pendingContinuation.startIndex??nextGs.currentTurn,
        copyPlayers(nextGs.players||[]),
        [...(nextGs.deck||[])],
        [...(nextGs.discard||[])],
        beforeContinuationLog,
        continuationMeta
      );
      const freshInspectionEvents=(processed.inspectionMeta._inspectionEvents||[])
        .filter(ev=>ev?.seq>oldInspectionSeq);
      // 续播的检定已在 continuationQueue 中播放，标记为已见，避免自动检定 useEffect 再重播一次
      if(freshInspectionEvents.length)markInspectionEventsSeen(freshInspectionEvents);
      const continuationQueue=freshInspectionEvents.length
        ? buildInspectionEventFlow(
          {players:beforeContinuationPlayers,log:beforeContinuationLog},
          freshInspectionEvents,
          {buildAnimQueue,copyPlayers}
        ).queue
        : [];
      const {pendingInspectionContinuation: _pendingInspectionContinuation, ...restAbilityData}=nextGs.abilityData||{};
      const nextAbilityData=processed.inspectionMeta.abilityData?.type
        ? processed.inspectionMeta.abilityData
        : restAbilityData;
      const nextPhase=processed.inspectionMeta.abilityData?.type==='etherealizeRedirect'
        ? 'ETHEREALIZE_DECISION'
        : processed.inspectionMeta.abilityData?.type==='tsgSlimeBalance'
          ? 'TSG_SLIME_BALANCE'
          : nextGs.phase;
      nextGs={
        ...nextGs,
        players:processed.P,
        deck:processed.D,
        discard:processed.Disc,
        log:processed.log,
        ...processed.inspectionMeta,
        phase:nextPhase,
        abilityData:nextAbilityData,
      };
      queue=[
        ...queue,
        ...continuationQueue,
        ...(continuationQueue.length?[statePatchStep({
          players:processed.P,
          deck:processed.D,
          discard:processed.Disc,
          log:processed.log,
          ...processed.inspectionMeta,
          phase:nextPhase,
          abilityData:nextAbilityData,
        })]:[]),
      ];
    }
    if(syncLog&&nextGs?.log)syncVisibleLog(nextGs.log,nextGs);
    const continuationRoute=getTargetContinuationRoute(nextGs,{continueRest,continueTurnStartDraw});
    if(continuationRoute===TARGET_CONTINUATION_ROUTE.REST_DRAW){
      if(queue.length)triggerAnimQueue(queue,null,()=>_cthContinueRestDraws(nextGs));
      else _cthContinueRestDraws(nextGs);
      return;
    }
    if(continuationRoute===TARGET_CONTINUATION_ROUTE.TURN_START_DRAW){
      if(queue.length)triggerAnimQueue(queue,null,()=>_tsgContinueTurnStartDraw(nextGs));
      else _tsgContinueTurnStartDraw(nextGs);
      return;
    }
    if(continuationRoute===TARGET_CONTINUATION_ROUTE.END_TURN_REPLAY){
      if(queue.length)triggerAnimQueue(queue,null,()=>continueEndTurnReplay(nextGs));
      else continueEndTurnReplay(nextGs);
      return;
    }
    if(continuationRoute===TARGET_CONTINUATION_ROUTE.PROLIFERATING_Z){
      if(queue.length)triggerAnimQueue(queue,null,()=>continueProliferatingZDraws(nextGs));
      else continueProliferatingZDraws(nextGs);
      return;
    }
    if(queue.length)triggerAnimQueue(queue,nextGs);
    else setGs(nextGs);
  }

  function resolveTsathogguaSlimeBalance(useSlime){
    const abilityData=gs.abilityData||{};
    const targetIdx=abilityData.targetIdx;
    if(targetIdx==null||!gs.players?.[targetIdx])return;
    let P=copyPlayers(gs.players);
    let D=[...(gs.deck||[])];
    let Disc=[...(gs.discard||[])];
    const target=P[targetIdx];
    let L=[...gs.log];
    let consumedSlimeCard=null;
    let playersBeforeSlimePop=null;
    if(useSlime){
      const slimeIdx=(target.hand||[]).findIndex(isTsathogguaSlime);
      if(slimeIdx>=0){
        playersBeforeSlimePop=copyPlayers(P);
        consumedSlimeCard=target.hand.splice(slimeIdx,1)[0]||null;
        const total=clamp((abilityData.afterHp??target.hp)+(abilityData.afterSan??target.san),0,20);
        target.hp=clamp(Math.ceil(total/2));
        target.san=clamp(Math.floor(total/2));
        // ponytail: 黏液平分直接刷新 displayStats，否则进入 AI 回合后兜底 effect 会跳过 AI_TURN 导致血条延迟到下次受击才更新
        setDisplayStats(P.map(p=>({hp:p.hp,san:p.san})));
        L.push(`【撒托古亚的赐福黏液】${localDisplayName(targetIdx,target.name)} 牺牲黏液，将HP/SAN平分为 ${target.hp}/${target.san}`);
      }else{
        L.push(`【撒托古亚的赐福黏液】${localDisplayName(targetIdx,target.name)} 已没有可牺牲的黏液`);
      }
    }else{
      L.push(`【撒托古亚的赐福黏液】${localDisplayName(targetIdx,target.name)} 没有牺牲黏液`);
    }
    const linkReaction=resolvePendingDamageLinkBreak(
      P,targetIdx,Disc,L,abilityData._turnOwner??gs.currentTurn,D,
      buildTargetContinuationAbilityData(abilityData)
    );
    if(linkReaction.etherealizeDecision){
      const redirectedGs={
        ...gs,players:P,deck:D,discard:Disc,log:L,
        phase:'ETHEREALIZE_DECISION',
        abilityData:linkReaction.etherealizeDecision,
      };
      const redirectQueue=[
        ...(useSlime&&consumedSlimeCard?[{
          type:'TSG_SLIME_POP',targetPid:targetIdx,count:1,cards:[consumedSlimeCard],msgs:L.slice(-2,-1),
          ...(playersBeforeSlimePop?{visualSetupPatch:{players:playersBeforeSlimePop}}:{}),
        }]:[]),
        statePatchStep({players:P,deck:D,discard:Disc,log:L}),
      ];
      if(redirectedGs._isMP)broadcastMpStateBeforeLocalReplay(redirectedGs);
      triggerAnimQueue(redirectQueue,redirectedGs);
      return;
    }
    if(linkReaction.applied){
      const chainedSlimeDecision=buildTsathogguaSlimeBalanceDecision(linkReaction.beforePlayers,P,{
        ...buildTargetContinuationAbilityData(abilityData),
        _turnOwner:abilityData._turnOwner??gs.currentTurn,
        pendingSanInspection:abilityData.pendingSanInspection,
      });
      if(chainedSlimeDecision){
        const chainedGs={
          ...gs,
          players:P,deck:D,discard:Disc,log:L,
          phase:'TSG_SLIME_BALANCE',
          abilityData:chainedSlimeDecision,
        };
        const chainedQueue=[
          ...(useSlime&&consumedSlimeCard?[{
            type:'TSG_SLIME_POP',targetPid:targetIdx,count:1,cards:[consumedSlimeCard],msgs:L.slice(-2,-1),
            ...(playersBeforeSlimePop?{visualSetupPatch:{players:playersBeforeSlimePop}}:{}),
          }]:[]),
          ...buildAnimQueue(gs,chainedGs),
          statePatchStep({players:P,deck:D,discard:Disc,log:L}),
        ];
        if(chainedGs._isMP)broadcastMpStateBeforeLocalReplay(chainedGs);
        triggerAnimQueue(chainedQueue,chainedGs);
        return;
      }
    }
    const queuedSlimeDecisions=abilityData.pendingSlimeBalanceDecisions||[];
    if(queuedSlimeDecisions.length){
      const [nextSlimeDecision,...remainingSlimeDecisions]=queuedSlimeDecisions;
      const queuedContinuation=buildTargetContinuationAbilityData(abilityData);
      delete queuedContinuation.pendingSlimeBalanceDecisions;
      const queuedGs={
        ...gs,
        players:P,deck:D,discard:Disc,log:L,
        phase:'TSG_SLIME_BALANCE',
        abilityData:{
          ...queuedContinuation,
          ...nextSlimeDecision,
          ...(remainingSlimeDecisions.length?{pendingSlimeBalanceDecisions:remainingSlimeDecisions}:{}),
        },
      };
      const queuedAnim=[
        ...(useSlime&&consumedSlimeCard?[{
          type:'TSG_SLIME_POP',targetPid:targetIdx,count:1,cards:[consumedSlimeCard],msgs:L.slice(-1),
          ...(playersBeforeSlimePop?{visualSetupPatch:{players:playersBeforeSlimePop}}:{}),
        }]:[]),
        statePatchStep({players:P,deck:D,discard:Disc,log:L}),
      ];
      if(queuedGs._isMP)broadcastMpStateBeforeLocalReplay(queuedGs);
      triggerAnimQueue(queuedAnim,queuedGs);
      return;
    }
    const preInspectionGs={...gs,players:copyPlayers(P),deck:D,discard:Disc,log:[...L]};
    let extraPatch={};
    const pendingSanInspection=abilityData.pendingSanInspection;
    let inspected=false;
    let sanWin=checkWin(P,gs._isMP);
    if(!sanWin&&pendingSanInspection&&P[targetIdx]&&!P[targetIdx].isDead){
      const inspectionMeta=makeInspectionMeta(preInspectionGs);
      const processed=applyInspectionForSanLoss(
        pendingSanInspection.targetIndex??targetIdx,
        P[pendingSanInspection.targetIndex??targetIdx]?.san,
        pendingSanInspection.startIndex??(abilityData._turnOwner??gs.currentTurn),
        P,
        D,
        Disc,
        L,
        inspectionMeta,
      );
      P=processed.P;D=processed.D;Disc=processed.Disc;L=processed.log;
      extraPatch={
        inspectionDeck:processed.inspectionMeta.inspectionDeck,
        inspectionDiscard:processed.inspectionMeta.inspectionDiscard,
        sealLooseningCount:processed.inspectionMeta.sealLooseningCount,
        houndsOfTindalosActive:processed.inspectionMeta.houndsOfTindalosActive,
        houndsOfTindalosTarget:processed.inspectionMeta.houndsOfTindalosTarget,
        houndsOfTindalosElapsed:processed.inspectionMeta.houndsOfTindalosElapsed,
        _inspectionSeq:processed.inspectionMeta._inspectionSeq,
        _inspectionCard:processed.inspectionMeta._inspectionCard,
        _inspectionTarget:processed.inspectionMeta._inspectionTarget,
        _inspectionPrevLogLen:processed.inspectionMeta._inspectionPrevLogLen,
        _inspectionBeforePlayers:processed.inspectionMeta._inspectionBeforePlayers,
        _inspectionEvents:processed.inspectionMeta._inspectionEvents,
        _statEvents:processed.inspectionMeta._statEvents,
        _statEventSeq:processed.inspectionMeta._statEventSeq,
      };
      inspected=(processed.inspectionMeta._inspectionSeq||0)>(gs._inspectionSeq||0);
      sanWin=checkWin(P,gs._isMP);
    }
    if(!sanWin)P.forEach((player,idx)=>{
      if(player&&!player.isDead&&player.hp<=0){
        if(!tryVritraImmortal(P,idx,abilityData._turnOwner??gs.currentTurn,D,Disc,L))killPlayerState(P,idx,Disc,L);
      }
    });
    const win=sanWin||checkWin(P,gs._isMP);
    let nextGs=buildTargetContinuationGs({
      players:P,
      deck:D,
      discard:Disc,
      log:L,
      abilityData:{...abilityData,pendingSanInspection:null},
      turnOwner:abilityData._turnOwner??gs.currentTurn,
      extraPatch,
    });
    const slimeQueue=useSlime?[
      ...(consumedSlimeCard?[{
        type:'TSG_SLIME_POP',
        targetPid:targetIdx,
        count:1,
        cards:[consumedSlimeCard],
        msgs:L.slice(-1),
        ...(playersBeforeSlimePop?{visualSetupPatch:{players:playersBeforeSlimePop}}:{}),
      }]:[]),
      statePatchStep({players:preInspectionGs.players})
    ]:[];
    let finalNextGs={...nextGs,abilityData:buildTargetContinuationAbilityData({...abilityData,pendingSanInspection:null}),...(win?{gameOver:win}:{})};
    if(!win&&(abilityData._pendingTurnStartPoison||abilityData._pendingTurnStartLinkHeals)){
      finalNextGs=continueTurnStartAfterDamageReaction(finalNextGs);
      if(finalNextGs.phase==='TSG_SLIME_BALANCE'){
        const reactionQueue=[
          ...(useSlime&&consumedSlimeCard?[{
            type:'TSG_SLIME_POP',targetPid:targetIdx,count:1,cards:[consumedSlimeCard],msgs:L.slice(-1),
            ...(playersBeforeSlimePop?{visualSetupPatch:{players:playersBeforeSlimePop}}:{}),
          }]:[]),
          ...buildAnimQueue(gs,finalNextGs),
          statePatchStep({players:finalNextGs.players,deck:finalNextGs.deck,discard:finalNextGs.discard,log:finalNextGs.log}),
        ];
        if(finalNextGs._isMP)broadcastMpStateBeforeLocalReplay(finalNextGs);
        triggerAnimQueue(reactionQueue,finalNextGs);
        return;
      }
    }
    const inspectionReplay=inspected
      ?buildInspectionAwareAnimQueue(preInspectionGs,finalNextGs,{buildAnimQueue,copyPlayers})
      :{queue:[],inspectionEvents:[]};
    if(inspectionReplay.inspectionEvents.length)markInspectionEventsSeen(inspectionReplay.inspectionEvents);
    const queue=[...slimeQueue,...inspectionReplay.queue];
    if(finalNextGs._isMP)broadcastMpStateBeforeLocalReplay(finalNextGs);
    finishTargetContinuation({
      queue,
      nextGs:finalNextGs,
      continueRest:!win&&!!abilityData.fromRest,
      continueTurnStartDraw:!win&&!!abilityData.continueTurnStartDraw,
    });
  }

  function buildPendingTurnStartDrawQueue(state){
    const drawnCard=state?._aiDrawnCard||state?._drawnCard||state?.drawReveal?.card||null;
    if(!state?._playersBeforeThisDraw||!drawnCard)return [];
    const replay=buildActorTurnStartReplay(state,{
      oldGs:{
        ...state,
        players:state._playersBeforeThisDraw,
        log:getTurnStartDrawBaselineLog(state),
        _inspectionSeq:lastInspectionSeqRef.current,
        _visualEvents:[],
      },
      effectOldGs:{
        ...state,
        players:state._playersBeforeThisDraw,
        log:getTurnStartDrawBaselineLog(state),
        _inspectionSeq:lastInspectionSeqRef.current,
        _visualEvents:[],
      },
      actorName:state.players?.[state.currentTurn]?.name||'???',
      forceActorName:true,
    });
    if(replay?.queue?.length)return replay.queue;
    const introQ=buildTurnStartIntroQueue(state,state.players?.[state.currentTurn]?.name||'???');
    const drawBaselineLog=getTurnStartDrawBaselineLog(state);
    const drawStatQ=bindAnimLogChunks(
      buildAnimQueue(
        {
          ...state,
          players:state._playersBeforeThisDraw,
          log:drawBaselineLog,
          _statEventSeq:state._statEventSeq||0,
          _statEvents:[],
          _inspectionEvents:[],
        },
        {
          ...state,
          _statEvents:[],
          _inspectionEvents:[],
        }
      ),
      {statLogs:state._statLogs}
    ).filter(step=>step.type!=='CARD_TRANSFER');
    return [
      ...introQ,
      {type:'DRAW_CARD',card:drawnCard,triggerName:state.players?.[state.currentTurn]?.name||'???',targetPid:state.currentTurn,msgs:state._drawLogs||[]},
      ...drawStatQ,
      statePatchStep({players:state.players,discard:state.discard}),
    ];
  }

  function peekHandSelectTarget(ti){
    // 偷看手牌：选择目标角色后，偷看其一张手牌
    const {peekHandTargets,peekHandSource}=gs.abilityData;
    if(!peekHandTargets||!peekHandTargets.includes(ti))return;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard],baseLog=[...gs.log];
    const night=resolveApophisTarget({
      players:P,deck:D,discard:Disc,log:baseLog,actorIdx:peekHandSource,selectedIdx:ti,
      legalTargets:peekHandTargets.filter(i=>P[i]&&!P[i].isDead&&P[i].hand.length),
      label:'选择偷看目标'
    });
    P=night.players;D=night.deck;Disc=night.discard;baseLog=night.log;ti=night.targetIdx;
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
      L=[...baseLog,`${sourceName} 偷看了 ${targetPlayer.name} 的一张手牌`];
    }else{
      // 单机游戏：显示具体卡牌信息
      L=[...baseLog,`你偷看了 ${targetPlayer.name} 的一张手牌：${cardLogText(peekedCard,{alwaysShowName:true})}`];
    }
    const nextGs={...buildTargetContinuationGs({players:P,deck:D,discard:Disc,log:L}),...apophisNightPatch(night)};
    if(isLocalSeatIndex(peekHandSource)){
      setPrivatePeek({card:peekedCard,targetName:targetPlayer.name});
    }
    finishTargetContinuation({nextGs,continueRest:!!gs.abilityData?.fromRest});
  }
  function caveDuelSelectTarget(ti){
    // 穴居人战争：选择目标角色后，双方各亮一张手牌，按循环克制规则决出胜者并收牌
    const {caveDuelTargets,caveDuelSource}=gs.abilityData;
    if(!caveDuelTargets||!caveDuelTargets.includes(ti))return;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard],baseLog=[...gs.log];
    const night=resolveApophisTarget({
      players:P,deck:D,discard:Disc,log:baseLog,actorIdx:caveDuelSource,selectedIdx:ti,
      legalTargets:caveDuelTargets.filter(i=>P[i]&&!P[i].isDead&&P[i].hand.length),
      label:'选择“穴居人战争”目标'
    });
    P=night.players;D=night.deck;Disc=night.discard;baseLog=night.log;ti=night.targetIdx;
    const sourcePlayer=P[caveDuelSource];
    const targetPlayer=P[ti];
    // 检查目标角色是否有手牌
    if(targetPlayer.hand.length===0){
      return;
    }
    
    // 源角色选择牌（AI按穴居人战争规则选择）
    let sourceCardIndex, sourceCard;
    if(isLocalSeatIndex(caveDuelSource)){
      // 玩家作为源角色，需要选择牌
      setGsWithApophisTargetAnim({...gs,players:P,deck:D,discard:Disc,log:baseLog,phase:'CAVE_DUEL_SELECT_CARD',abilityData:{...gs.abilityData,caveDuelTarget:ti},...apophisNightPatch(night)});
      return;
    }else{
      // AI作为源角色，按启发式选择
      sourceCardIndex=getBestCaveDuelCardIndex(sourcePlayer.hand);
      sourceCard=sourcePlayer.hand[sourceCardIndex];
    }
    
    // 目标角色选择牌
    let targetCardIndex, targetCard;
    if(ti===0){
      // 玩家作为目标角色，需要选择牌
      setGsWithApophisTargetAnim({...gs,players:P,deck:D,discard:Disc,log:baseLog,phase:'CAVE_DUEL_SELECT_CARD',abilityData:{...gs.abilityData,caveDuelSource:caveDuelSource,caveDuelTarget:ti,sourceCardIndex:sourceCardIndex,sourceCard:sourceCard},...apophisNightPatch(night)});
      return;
    }else{
      // AI作为目标角色，按盲选启发式选择，不查看源角色亮牌
      targetCardIndex=getBestCaveDuelCardIndex(targetPlayer.hand);
      targetCard=targetPlayer.hand[targetCardIndex];
      // 执行穴居人战争效果
      executeCaveDuel(P, caveDuelSource, ti, sourceCardIndex, targetCardIndex, sourceCard, targetCard, {...gs,deck:D,discard:Disc,log:baseLog,...apophisNightPatch(night)});
    }
  }
  
  function escapeDomSelectorValue(value){
    const raw=String(value ?? '');
    if(typeof CSS!=='undefined'&&CSS.escape)return CSS.escape(raw);
    return raw.replace(/["\\]/g,'\\$&');
  }

  function playIgniteTorchCardFlameEffect(card){
    if(!card?.id||typeof document==='undefined')return Promise.resolve(false);
    const selector=`[data-self-hand-card-id="${escapeDomSelectorValue(card.id)}"]`;
    const el=document.querySelector(selector);
    if(!el)return Promise.resolve(false);
    const durationMs=760;
    const wrapperRect=el.getBoundingClientRect();
    el.querySelectorAll('.ignite-torch-flame-layer,.ignite-torch-ember-layer').forEach(node=>node.remove());
    const visualCardEl=Array.from(el.children).find(node=>
      node instanceof HTMLElement &&
      !node.classList.contains('ignite-torch-flame-layer') &&
      !node.classList.contains('ignite-torch-ember-layer')
    )||el;
    const rect=visualCardEl.getBoundingClientRect();
    const flameLayer=document.createElement('div');
    flameLayer.className='ignite-torch-flame-layer';
    flameLayer.setAttribute('aria-hidden','true');
    const cardHeight=Math.max(1,rect.height);
    const cardWidth=Math.max(1,rect.width);
    const flameHeight=Math.round(cardWidth*0.6);
    const emberRise=Math.max(1,Math.round(cardHeight*0.86));
    const flameLeft=rect.left-wrapperRect.left;
    const flameTop=rect.bottom-wrapperRect.top-flameHeight;
    const emberPad=34;
    const emberHeight=cardHeight+82;
    flameLayer.style.setProperty('--ignite-card-h',`${cardHeight}px`);
    flameLayer.style.setProperty('--ignite-flame-h',`${flameHeight}px`);
    flameLayer.style.setProperty('--ignite-flame-left',`${flameLeft}px`);
    flameLayer.style.setProperty('--ignite-flame-top',`${flameTop}px`);
    flameLayer.style.setProperty('--ignite-flame-w',`${cardWidth}px`);
    flameLayer.style.setProperty('--ignite-card-rise',`${cardHeight*-1}px`);
    const emberLayer=document.createElement('div');
    emberLayer.className='ignite-torch-ember-layer';
    emberLayer.setAttribute('aria-hidden','true');
    emberLayer.style.setProperty('--ignite-card-h',`${cardHeight}px`);
    emberLayer.style.setProperty('--ignite-ember-left',`${flameLeft-emberPad}px`);
    emberLayer.style.setProperty('--ignite-ember-top',`${rect.bottom-wrapperRect.top-emberHeight}px`);
    emberLayer.style.setProperty('--ignite-ember-w',`${Math.max(1,cardWidth+emberPad*2)}px`);
    emberLayer.style.setProperty('--ignite-ember-h',`${emberHeight}px`);
    emberLayer.style.setProperty('--ignite-ember-mid-rise',`${Math.round(emberRise*-0.42)}px`);
    emberLayer.style.setProperty('--ignite-ember-rise',`${emberRise*-1}px`);
    el.appendChild(flameLayer);
    el.appendChild(emberLayer);
    el.setAttribute('data-ignite-torch-flame','true');
    const stopFireSound=playIgniteTorchFireSound?.({durationMs});
    return new Promise(resolve=>{
      const cleanup=()=>{
        stopFireSound?.();
        flameLayer.remove();
        emberLayer.remove();
        el.removeAttribute('data-ignite-torch-flame');
        resolve(true);
      };
      window.setTimeout(cleanup,durationMs);
    });
  }

  function resolveCaveDuelState(P, caveDuelSource, ti, sourceCardIndex, targetCardIndex, sourceCard, targetCard, gs){
    const outcome=resolveCaveDuelOutcome({
      players:P,
      sourceIdx:caveDuelSource,
      targetIdx:ti,
      sourceCardIndex,
      targetCardIndex,
      sourceCard,
      targetCard,
    });
    P=outcome.players;
    const duelCompare=outcome.duelCompare;
    const L=[...gs.log,outcome.logLine];
    let proliferatingZPatch={};
    if(duelCompare>0){
      proliferatingZPatch=appendPublicCardGainTriggers(gs,P,caveDuelSource,outcome.gainedCard);
    }else if(duelCompare<0){
      proliferatingZPatch=appendPublicCardGainTriggers(gs,P,ti,outcome.gainedCard);
    }
    const nextGs={
      ...buildTargetContinuationGs({players:P,deck:gs.deck,discard:gs.discard,log:L,abilityData:gs.abilityData,extraPatch:proliferatingZPatch}),
      ...(Object.prototype.hasOwnProperty.call(gs,'apophisNight')?{apophisNight:gs.apophisNight}:{}),
      ...(gs._statEvents?{_statEvents:gs._statEvents,_statEventSeq:gs._statEventSeq}:{}),
    };
    return {nextGs,duelCompare,L};
  }
  function executeCaveDuel(P, caveDuelSource, ti, sourceCardIndex, targetCardIndex, sourceCard, targetCard, gs){
    const {nextGs,duelCompare,L}=resolveCaveDuelState(P,caveDuelSource,ti,sourceCardIndex,targetCardIndex,sourceCard,targetCard,gs);
    const winnerIdx=duelCompare>0?caveDuelSource:duelCompare<0?ti:null;
    const duelAnim={type:'CAVE_DUEL',sourceIdx:caveDuelSource,targetIdx:ti,sourceCard,targetCard,winnerIdx,msgs:L.slice(-1)};
    finishTargetContinuation({
      queue:[duelAnim],
      nextGs,
      continueRest:!!gs.abilityData?.fromRest,
      syncLog:true,
    });
  }
  
  function caveDuelSelectCard(cardIndex, selectedCard = null){
    // 穴居人战争：任一真人玩家先登记暗选；双方都登记后才同时亮牌结算。
    const {caveDuelSource,caveDuelTarget}=gs.abilityData;
    let P=copyPlayers(gs.players);
    const sourcePlayer=P[caveDuelSource];
    const targetPlayer=P[caveDuelTarget];

    const localIsSource=isLocalSeatIndex(caveDuelSource);
    const localIsTarget=isLocalSeatIndex(caveDuelTarget);
    if(!localIsSource&&!localIsTarget)return;

    const selectingSource=localIsSource;
    const selectingPlayer=selectingSource?sourcePlayer:targetPlayer;
    const { index: resolvedCardIndex, card: playerCard } = resolveHandCardSelection(selectingPlayer, cardIndex, selectedCard);
    if(!playerCard)return;

    const ad={
      ...gs.abilityData,
      ...(selectingSource
        ? {sourceCardIndex:resolvedCardIndex,sourceCard:playerCard}
        : {targetCardIndex:resolvedCardIndex,targetCard:playerCard}),
    };

    if(ad.sourceCard&&ad.targetCard){
      executeCaveDuel(
        P,
        caveDuelSource,
        caveDuelTarget,
        ad.sourceCardIndex,
        ad.targetCardIndex,
        ad.sourceCard,
        ad.targetCard,
        {...gs,abilityData:ad}
      );
      return;
    }

    if(!ad.sourceCard&&!isAiSeat(gs,caveDuelSource)){
      const waitGs={
        ...gs,
        players:P,
        phase:gs.phase,
        abilityData:ad,
      };
      if(waitGs._isMP)broadcastMpStateBeforeLocalReplay(waitGs);
      setGs(waitGs);
      return;
    }

    if(!ad.targetCard&&!isAiSeat(gs,caveDuelTarget)){
      const waitGs={
        ...gs,
        players:P,
        phase:gs.phase,
        abilityData:ad,
      };
      if(waitGs._isMP)broadcastMpStateBeforeLocalReplay(waitGs);
      setGs(waitGs);
      return;
    }

    if(!ad.sourceCard&&isAiSeat(gs,caveDuelSource)){
      const sourceCardIndex=getBestCaveDuelCardIndex(sourcePlayer.hand);
      ad.sourceCardIndex=sourceCardIndex;
      ad.sourceCard=sourcePlayer.hand[sourceCardIndex];
    }
    if(!ad.targetCard&&isAiSeat(gs,caveDuelTarget)){
      const targetCardIndex=getBestCaveDuelCardIndex(targetPlayer.hand);
      ad.targetCardIndex=targetCardIndex;
      ad.targetCard=targetPlayer.hand[targetCardIndex];
    }
    if(ad.sourceCard&&ad.targetCard){
      executeCaveDuel(P, caveDuelSource, caveDuelTarget, ad.sourceCardIndex, ad.targetCardIndex, ad.sourceCard, ad.targetCard, {...gs,abilityData:ad});
    }
  }
  function damageLinkSelectTarget(ti){
    // 两人一绳：选择目标角色后，建立伤害传导链条
    const {damageLinkTargets,damageLinkSource}=gs.abilityData;
    if(!damageLinkTargets||!damageLinkTargets.includes(ti))return;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard],baseLog=[...gs.log];
    const night=resolveApophisTarget({
      players:P,deck:D,discard:Disc,log:baseLog,actorIdx:damageLinkSource,selectedIdx:ti,
      legalTargets:damageLinkTargets.filter(i=>i!==damageLinkSource&&P[i]&&!P[i].isDead),
      label:'选择“两人一绳”目标'
    });
    P=night.players;D=night.deck;Disc=night.discard;baseLog=night.log;ti=night.targetIdx;
    const sourcePlayer=P[damageLinkSource];
    const targetPlayer=P[ti];
    // 建立链条：在两名玩家之间建立伤害传导关系
    // 使用damageLink字段存储链条信息：{partner: 对方索引, active: 是否激活, expiryOwner: 发起者的下回合开始时过期}
    sourcePlayer.damageLink={partner:ti,active:true,expiryOwner:damageLinkSource};
    targetPlayer.damageLink={partner:damageLinkSource,active:true,expiryOwner:damageLinkSource};
const L=[...baseLog,`【两人一绳】${sourcePlayer.name} 与 ${targetPlayer.name} 间架起链条，一方受到HP伤害时另一方受等量伤害`];
    const nextGs={...buildTargetContinuationGs({players:P,deck:D,discard:Disc,log:L}),...apophisNightPatch(night)};
    if(!gs.abilityData?.fromRest)visualStateLocks.lock({players:gs.players,zhuLight:gs.zhuLight||null});
    finishTargetContinuation({
      queue:gs.abilityData?.fromRest?[]:[cardTransferStep({fromPid:damageLinkSource,toPid:ti,effect:'damageLink',durationMs:1900,msgs:L.slice(-1)})],
      nextGs,
      continueRest:!!gs.abilityData?.fromRest,
      syncLog:!gs.abilityData?.fromRest,
    });
  }

  function roseThornSelectTarget(ti){
    const {roseThornTargets,roseThornSource}=gs.abilityData;
    if(!roseThornTargets||!roseThornTargets.includes(ti)||roseThornSource==null)return;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard],baseLog=[...gs.log];
    const night=resolveApophisTarget({
      players:P,deck:D,discard:Disc,log:baseLog,actorIdx:roseThornSource,selectedIdx:ti,
      legalTargets:roseThornTargets.filter(i=>i!==roseThornSource&&P[i]&&!P[i].isDead),
      label:'选择“玫瑰倒刺”目标'
    });
    P=night.players;D=night.deck;Disc=night.discard;baseLog=night.log;ti=night.targetIdx;
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
    const L=[...baseLog,`【玫瑰倒刺】${sourcePlayer.name} 将全部手牌交给了 ${targetPlayer.name}`];
    const win=checkWin(P,gs._isMP);
    if(win){
      setGs({...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win,phase:'ACTION',abilityData:{}});
      return;
    }
    if(ti===0&&!P[0].isDead&&(P[0]._nyaBorrow||P[0].role)===ROLE_TREASURE&&isWinHand(P[0].hand)){
      P[0].roleRevealed=true;
      const pendingWinGs={...gs,players:P,deck:D,discard:Disc,log:[...L,localTreasureWinLog(gs)],phase:'PLAYER_WIN_PENDING',abilityData:{winReason:localTreasureWinReason(gs)}};
      const winStatQ=buildAnimQueue(gs,pendingWinGs).filter(a=>a.type!=='CARD_TRANSFER');
      triggerAnimQueue([
        ...buildPendingTurnStartDrawQueue(gs),
        cardTransferStep({fromPid:roseThornSource,dest:'player',toPid:ti,count:giftedCount,msgs:[L[L.length-1]]}),
        ...winStatQ,
      ],pendingWinGs);
      return;
    }
    if(ti!==0&&!P[ti].isDead&&P[ti].role===ROLE_TREASURE&&isWinHand(P[ti].hand)){
      P[ti].roleRevealed=true;
      const reason=`${P[ti].name} 集齐了全部编号并获胜！`;
      const winGs={...gs,players:P,deck:D,discard:Disc,log:[...L,reason],
        gameOver:{winner:ROLE_TREASURE,reason,winnerIdx:ti},
        phase:'ACTION',abilityData:{}};
      // 与非本地寻宝者获胜的同步队列模式一致：本地同样播放转牌动画队列再进结算，
      // 避免本地直接跳到 gameOver 而远端重播转牌动画导致两端动画队列不同步。
      const winStatQ=buildAnimQueue(gs,winGs).filter(a=>a.type!=='CARD_TRANSFER');
      broadcastMpStateBeforeLocalReplay(winGs);
      triggerAnimQueue([
        ...buildPendingTurnStartDrawQueue(gs),
        cardTransferStep({fromPid:roseThornSource,dest:'player',toPid:ti,count:giftedCount,msgs:[L[L.length-1]]}),
        ...winStatQ
      ],winGs);
      return;
    }
    const nextGs={...buildTargetContinuationGs({players:P,deck:D,discard:Disc,log:L}),...apophisNightPatch(night)};
    const turnStartDrawQueue=buildPendingTurnStartDrawQueue(gs);
    const statQ=buildAnimQueue(gs,nextGs).filter(a=>a.type!=='CARD_TRANSFER');
    const queue=[
      ...turnStartDrawQueue,
      cardTransferStep({fromPid:roseThornSource,dest:'player',toPid:ti,count:giftedCount,msgs:[L[L.length-1]]}),
      ...statQ
    ];
    finishTargetContinuation({queue,nextGs,continueRest:!!gs.abilityData?.fromRest});
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
    const proliferatingZPatch=appendPublicCardGainTriggers(gs,P,0,chosenCard);
    const nextPickIndex=pickIndex+1;
    const win=checkWin(P,gs._isMP);
    if(win){
      setGs({...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win,phase:'ACTION',abilityData:{},...proliferatingZPatch});
      return;
    }
    if(!P[0].isDead&&(P[0]._nyaBorrow||P[0].role)===ROLE_TREASURE&&isWinHand(P[0].hand)){
      P[0].roleRevealed=true;
      const pendingWinGs={...gs,players:P,deck:D,discard:Disc,log:[...L,localTreasureWinLog(gs)],phase:'PLAYER_WIN_PENDING',abilityData:{winReason:localTreasureWinReason(gs)},...proliferatingZPatch};
      const queue=[
        cardTransferStep({fromPid:0,dest:'player',toPid:0,count:1,sourceAnchor:'reveal',effect:'draw',cards:[chosenCard],msgs:[L[L.length-1]]}),
        ...buildAnimQueue(gs,pendingWinGs).filter(a=>a.type!=='CARD_TRANSFER'),
      ];
      triggerAnimQueue(queue,pendingWinGs);
      return;
    }
    if(nextPickIndex>=pickOrder.length||revealedCards.length===0){
      const newGs=buildTargetContinuationGs({players:P,deck:D,discard:Disc,log:L,abilityData,extraPatch:proliferatingZPatch});
      finishTargetContinuation({
        nextGs:newGs,
        continueRest:!!(abilityData.fromRest&&isLocalSeatIndex(abilityData.pickSource)),
      });
      return;
    }
    const nextGs={...gs,players:P,deck:D,discard:Disc,log:L,phase:'FIRST_COME_PICK_SELECT',...proliferatingZPatch,abilityData:{...abilityData,revealedCards,pickIndex:nextPickIndex}};
    setGs(nextGs);
  }

  function graveDigSelectGod(cardIndex, allowAi=false){
    const abilityData=gs.abilityData||{};
    const actorIdx=abilityData.playerIndex;
    const godCards=abilityData.godCards||[];
    if((!isLocalSeatIndex(actorIdx)&&!allowAi)||cardIndex<0||cardIndex>=godCards.length)return;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard];
    const selected=godCards[cardIndex];
    const discardIdx=Disc.findIndex(card=>card?.id===selected?.id);
    if(discardIdx<0)return;
    const [godCard]=Disc.splice(discardIdx,1);
    P[actorIdx].hand.push(godCard);
    const actorName=localDisplayName(actorIdx,P[actorIdx]?.name);
    const L=[...gs.log,`【掘墓】${actorName} 从弃牌堆中取回 ${cardLogText(godCard,{alwaysShowName:true})}`];
    const proliferatingZPatch=appendPublicCardGainTriggers(gs,P,actorIdx,godCard);
    let nextGs=buildTargetContinuationGs({
      players:P,
      deck:D,
      discard:Disc,
      log:L,
      abilityData,
      canResumeAi:false,
      extraPatch:proliferatingZPatch,
    });
    finishTargetContinuation({
      nextGs,
      continueRest:!!(abilityData.fromRest&&isLocalSeatIndex(actorIdx)),
    });
  }

  async function igniteTorchDiscardCard(cardIndex, allowAi=false, baseState=null){
    const activeGs=baseState||gs;
    const abilityData=activeGs.abilityData||{};
    const actorIdx=abilityData.playerIndex;
    if((!isLocalSeatIndex(actorIdx)&&!allowAi)||cardIndex<0)return;
    let P=copyPlayers(activeGs.players),D=[...activeGs.deck],Disc=[...activeGs.discard];
    if(!P[actorIdx]?.hand?.[cardIndex])return;
    const beforeDiscardPlayers=copyPlayers(P);
    const beforeDiscardPile=[...Disc];
    const cardToDiscard=P[actorIdx].hand[cardIndex];
    if(cardToDiscard?.id&&igniteTorchFlamingCardIdsRef.current.has(cardToDiscard.id))return;
    if(cardToDiscard?.id)igniteTorchFlamingCardIdsRef.current.add(cardToDiscard.id);
    try{
      if(isLocalSeatIndex(actorIdx))await playIgniteTorchCardFlameEffect(cardToDiscard);
    }finally{
      if(cardToDiscard?.id)igniteTorchFlamingCardIdsRef.current.delete(cardToDiscard.id);
    }
    const [discardedCard]=P[actorIdx].hand.splice(cardIndex,1);
    let L=[...gs.log];
    let damageDecision=null;
    if(isBlackGoatYoung(discardedCard)||isTsathogguaSlime(discardedCard)){
      L.push(`${P[actorIdx].name} 的衍生牌被销毁`);
    }else if(discardedCard.type==='blankZone'){
      L.push(`${P[actorIdx].name} 的空白区域牌消失了`);
    }else{
      Disc.push(discardedCard);
      L.push(`${P[actorIdx].name} 弃置 ${cardLogText(discardedCard,{alwaysShowName:true})}`);
      const balance=applyBalanceDiscardSideEffects({players:P,deck:D,discard:Disc,log:L,ownerIdx:actorIdx,cards:[discardedCard],reason:'引燃火把弃牌',applyHpDamage:applyHpDamageWithLink,submitDamage:submitDamageEvents,currentTurn:gs.currentTurn});
      P=balance.players;D=balance.deck;Disc=balance.discard;L=balance.log;
      damageDecision=balance.damageDecision||null;
    }
    grantTurnScopedGodPowerImmunity(P[actorIdx], getCurrentExecutionTurnOwner(activeGs, actorIdx));
    L.push(`【引燃火把】${localDisplayName(actorIdx,P[actorIdx]?.name)} 本回合不受邪神之力影响`);
    const discardEvent=(
      !isBlackGoatYoung(discardedCard)&&
      !isTsathogguaSlime(discardedCard)&&
      discardedCard.type!=='blankZone'
    )?createCardEffectEvent({
      effectKey:'forcedRandomDiscard',
      card:{name:'引燃火把',type:'igniteTorch'},
      actorIdx,
      beforePlayers:beforeDiscardPlayers,
      beforeDiscard:beforeDiscardPile,
      afterPlayers:copyPlayers(P),
      afterDiscard:[...Disc],
      discardEvents:[{
        playerIndex:actorIdx,
        card:discardedCard,
        afterPlayers:copyPlayers(P),
        afterDiscard:[...Disc],
      }],
      msgs:L.slice(-2),
    }):null;
    let nextGs=buildTargetContinuationGs({
      baseState:activeGs,
      players:P,
      deck:D,
      discard:Disc,
      log:L,
      abilityData,
      canResumeAi:false,
      extraPatch:discardEvent&&activeGs._isMP?{
        _visualEvents:[discardEvent,...(activeGs._visualEvents||[])],
      }:{},
    });
    if(damageDecision?.phase)nextGs={...nextGs,phase:damageDecision.phase,abilityData:damageDecision.abilityData};
    broadcastVisualReplayIfNeeded(nextGs);
    finishTargetContinuation({
      queue:[{type:'DISCARD',card:discardedCard,targetPid:actorIdx,msgs:L.slice(-2)},statePatchStep({players:P,discard:Disc,log:L})],
      nextGs,
      continueRest:!!(abilityData.fromRest&&isLocalSeatIndex(actorIdx)),
    });
  }

  function toggleIgniteTorchSelect(idx){
    const abilityData=gs.abilityData||{};
    const actorIdx=abilityData.playerIndex;
    if(!isLocalSeatIndex(actorIdx)||idx<0)return;
    const nextIdx=abilityData.igniteTorchSelectedIndex===idx?null:idx;
    setGs({...gs,abilityData:{...abilityData,igniteTorchSelectedIndex:nextIdx}});
  }

  function confirmIgniteTorchDiscard(){
    const latestGs=latestGsRef.current||gs;
    const idx=latestGs.abilityData?.igniteTorchSelectedIndex;
    if(idx==null||idx<0)return;
    if(latestGs!==gs){
      setGs(latestGs);
      setTimeout(()=>igniteTorchDiscardCard(idx),0);
      return;
    }
    igniteTorchDiscardCard(idx);
  }

  debugInspectionFlipHandlerRef.current=import.meta.env.DEV
    ?async(options={})=>{
      const base=latestGsRef.current;
      if(!base?.players?.length){
        console.warn('[toeDebug] playInspectionFlip: no active game state');
        return {ok:false,reason:'no-game'};
      }
      if(anim||animExiting||animQueueRef.current.length>0||pendingGsRef.current){
        console.warn('[toeDebug] playInspectionFlip: animation queue is busy');
        return {ok:false,reason:'busy'};
      }
      const targetPid=Number.isInteger(options.targetPid)?options.targetPid:0;
      if(!base.players[targetPid]){
        console.warn('[toeDebug] playInspectionFlip: player not found',targetPid);
        return {ok:false,reason:'missing-player'};
      }
      const requestedCard=options.card&&typeof options.card==='object'?options.card:null;
      const requestedIndex=Number.isInteger(options.cardIndex)?options.cardIndex:0;
      const deckCard=requestedCard||INSPECTION_DECK[requestedIndex]||INSPECTION_DECK[0];
      if(!deckCard){
        return {ok:false,reason:'missing-card'};
      }
      const card={
        ...deckCard,
        id:deckCard.id||`debug-inspection-${Date.now()}`,
      };
      const targetName=localDisplayName(targetPid,base.players[targetPid].name);
      console.info('[toeDebug] playInspectionFlip',{
        cardName:card.name,
        effect:card.effect,
        targetPid,
        targetName,
      });
      triggerAnimQueue([{
        type:'DRAW_CARD',
        card,
        triggerName:'检定牌',
        targetPid,
        sourcePile:'inspection',
        skipTravel:!!options.skipTravel,
      }],base,()=>{});
      return {ok:true,cardName:card.name,effect:card.effect,targetPid,targetName};
    }
    :null;

  debugGodPowerBlockedHandlerRef.current=import.meta.env.DEV
    ?async(options={})=>{
      const base=latestGsRef.current;
      if(!base?.players?.length){
        console.warn('[toeDebug] playGodPowerBlocked: no active game state');
        return {ok:false,reason:'no-game'};
      }
      if(anim||animExiting||animQueueRef.current.length>0||pendingGsRef.current){
        console.warn('[toeDebug] playGodPowerBlocked: animation queue is busy');
        return {ok:false,reason:'busy'};
      }
      const playerIndex=Number.isInteger(options.playerIndex)?options.playerIndex:0;
      const player=base.players?.[playerIndex];
      if(!player){
        console.warn('[toeDebug] playGodPowerBlocked: player not found',playerIndex);
        return {ok:false,reason:'missing-player'};
      }
      const msg=buildGodPowerBlockedLog(player);
      const queue=[{
        type:'GOD_POWER_BLOCKED',
        targetPid:playerIndex,
        name:localDisplayName(playerIndex,player.name),
        msgs:options.showLog===true?[msg]:[],
      }];
      console.info('[toeDebug] playGodPowerBlocked', {
        playerIndex,
        playerName:player.name,
        showLog:options.showLog===true,
      });
      triggerAnimQueue(queue,base,()=>{});
      return {ok:true,playerIndex,playerName:player.name};
    }
    :null;

  debugTsgSlimePopHandlerRef.current=import.meta.env.DEV
    ?async(options={})=>{
      const base=latestGsRef.current;
      if(!base?.players?.length){
        console.warn('[toeDebug] playTsgSlimePop: no active game state');
        return {ok:false,reason:'no-game'};
      }
      if(anim||animExiting||animQueueRef.current.length>0||pendingGsRef.current){
        console.warn('[toeDebug] playTsgSlimePop: animation queue is busy');
        return {ok:false,reason:'busy'};
      }
      const playerIndex=Number.isInteger(options.playerIndex)?options.playerIndex:0;
      const player=base.players?.[playerIndex];
      if(!player){
        console.warn('[toeDebug] playTsgSlimePop: player not found',playerIndex);
        return {ok:false,reason:'missing-player'};
      }
      const count=Math.max(1,Math.min(5,Number.isInteger(options.count)?options.count:1));
      const handSlimes=(player.hand||[]).filter(isTsathogguaSlime).slice(0,count);
      const tempCount=Math.max(0,count-handSlimes.length);
      const stamp=Date.now();
      const tempSlimes=Array.from({length:tempCount},(_,idx)=>({
          ...createTsathogguaSlimeCard(),
          id:`debug-tsg-slime-pop-${stamp}-${idx}`,
        }));
      const cards=[...handSlimes,...tempSlimes];
      const lockedPlayers=tempSlimes.length
        ?copyPlayers(base.players).map((p,idx)=>idx===playerIndex
          ?{...p,hand:[...(p.hand||[]),...tempSlimes]}
          :p)
        :null;
      const msg=`【无定形体】${localDisplayName(playerIndex,player.name)} 的${count}张撒托古亚的赐福黏液消失`;
      const popStep={
        type:'TSG_SLIME_POP',
        targetPid:playerIndex,
        count,
        cards,
        msgs:options.showLog===true?[msg]:[],
        ...(lockedPlayers?{visualSetupPatch:{players:lockedPlayers}}:{}),
      };
      const queue=[
        ...(lockedPlayers?[
          {type:'VISUAL_LOCK',players:lockedPlayers,zhuLight:base.zhuLight||null},
          {type:'TURN_BOUNDARY_PAUSE',durationMs:60},
        ]:[]),
        popStep,
      ];
      console.info('[toeDebug] playTsgSlimePop', {
        playerIndex,
        playerName:player.name,
        count,
        anchored:true,
        temporaryCards:tempSlimes.length,
        showLog:options.showLog===true,
      });
      triggerAnimQueue(queue,base,()=>{});
      return {ok:true,playerIndex,playerName:player.name,count,anchored:true,temporaryCards:tempSlimes.length};
    }
    :null;

  debugVritraImmortalRevealHandlerRef.current=import.meta.env.DEV
    ?async(options={})=>{
      const base=latestGsRef.current;
      if(!base?.players?.length){
        console.warn('[toeDebug] playVritraImmortalReveal: no active game state');
        return {ok:false,reason:'no-game'};
      }
      if(anim||animExiting||animQueueRef.current.length>0||pendingGsRef.current){
        console.warn('[toeDebug] playVritraImmortalReveal: animation queue is busy');
        return {ok:false,reason:'busy'};
      }
      const playerIndex=Number.isInteger(options.playerIndex)?options.playerIndex:0;
      const player=base.players?.[playerIndex];
      if(!player){
        console.warn('[toeDebug] playVritraImmortalReveal: player not found',playerIndex);
        return {ok:false,reason:'missing-player'};
      }
      const count=Math.max(1,Math.min(6,Number.isInteger(options.count)?options.count:4));
      const cards=(Array.isArray(options.cards)?options.cards:base.deck||[])
        .filter(Boolean)
        .slice(0,count);
      const success=options.success!==false;
      const playerName=localDisplayName(playerIndex,player.name);
      const msg=`【不灭之躯】${playerName} 翻开 ${cards.length} 张牌；${success?'未见邪神牌，HP恢复至1！':'出现邪神牌，力量消散…'}`;
      const queue=[{
        type:'VRI_IMMORTAL_REVEAL',
        targetPid:playerIndex,
        playerName,
        cards,
        success,
        msgs:options.showLog===true?[msg]:[],
      }];
      console.info('[toeDebug] playVritraImmortalReveal',{
        playerIndex,
        playerName,
        count:cards.length,
        success,
        showLog:options.showLog===true,
      });
      triggerAnimQueue(queue,base,()=>{});
      return {ok:true,playerIndex,playerName,count:cards.length,success};
    }
    :null;

  debugGuillotineHandlerRef.current=import.meta.env.DEV
    ?async(options={})=>{
      const base=latestGsRef.current;
      if(!base?.players?.length){
        console.warn('[toeDebug] playGuillotine: no active game state');
        return {ok:false,reason:'no-game'};
      }
      if(anim||animExiting||animQueueRef.current.length>0||pendingGsRef.current){
        console.warn('[toeDebug] playGuillotine: animation queue is busy');
        return {ok:false,reason:'busy'};
      }
      const playerIndex=Number.isInteger(options.playerIndex)?options.playerIndex:0;
      const player=base.players?.[playerIndex];
      if(!player){
        console.warn('[toeDebug] playGuillotine: player not found',playerIndex);
        return {ok:false,reason:'missing-player'};
      }
      const msg=`☠ ${localDisplayName(playerIndex,player.name)} 倒下了！`;
      const queue=[
        {
          type:'GUILLOTINE',
          targetPid:playerIndex,
          hitIndices:[playerIndex],
          msgs:options.showLog===true?[msg]:[],
        },
        {
          type:'DEATH',
          targetPid:playerIndex,
          hitIndices:[playerIndex],
          msgs:[],
        },
      ];
      console.info('[toeDebug] playGuillotine', {
        playerIndex,
        playerName:player.name,
        showLog:options.showLog===true,
      });
      triggerAnimQueue(queue,base,()=>{});
      return {ok:true,playerIndex,playerName:player.name};
    }
    :null;

  debugPetrifyDeathHandlerRef.current=import.meta.env.DEV
    ?async(options={})=>{
      const base=latestGsRef.current;
      if(!base?.players?.length){
        console.warn('[toeDebug] playPetrifyDeath: no active game state');
        return {ok:false,reason:'no-game'};
      }
      if(anim||animExiting||animQueueRef.current.length>0||pendingGsRef.current){
        console.warn('[toeDebug] playPetrifyDeath: animation queue is busy');
        return {ok:false,reason:'busy'};
      }
      const playerIndex=Number.isInteger(options.playerIndex)?options.playerIndex:0;
      const player=base.players?.[playerIndex];
      if(!player){
        console.warn('[toeDebug] playPetrifyDeath: player not found',playerIndex);
        return {ok:false,reason:'missing-player'};
      }
      const msg=`${localDisplayName(playerIndex,player.name)} 被石化`;
      const queue=[
        {
          type:'PETRIFY_DEATH',
          targetPid:playerIndex,
          hitIndices:[playerIndex],
          msgs:[],
        },
        {
          type:'DEATH',
          targetPid:playerIndex,
          hitIndices:[playerIndex],
          msgs:options.showLog===true?[msg]:[],
        },
      ];
      console.info('[toeDebug] playPetrifyDeath', {
        playerIndex,
        playerName:player.name,
        showLog:options.showLog===true,
      });
      triggerAnimQueue(queue,base,()=>{});
      return {ok:true,playerIndex,playerName:player.name};
    }
    :null;

  function buryAliveSelectCard(cardIndex, allowAi=false){
    const abilityData=gs.abilityData||{};
    const targets=abilityData.targets||[];
    const choices=Array.isArray(abilityData.buryAliveChoices)?abilityData.buryAliveChoices:null;
    const actorIdx=choices
      ?targets.find(idx=>isLocalSeatIndex(idx)&&!choices[idx])
      :targets[abilityData.targetIndex||0];
    if((!isLocalSeatIndex(actorIdx)&&!allowAi)||cardIndex<0)return;
    if(choices){
      const buriedCard=gs.players?.[actorIdx]?.hand?.[cardIndex];
      if(!buriedCard)return;
      const nextChoices=[...choices];
      nextChoices[actorIdx]={cardId:buriedCard.id,cardIndex};
      const nextGs={...gs,abilityData:{...abilityData,buryAliveChoices:nextChoices,buryAliveSelectedIndex:null}};
      broadcastMpStateBeforeLocalReplay(nextGs);
      setGs(nextGs);
      return;
    }
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard];
    if(!P[actorIdx]?.hand?.[cardIndex])return;
    const [buriedCard]=P[actorIdx].hand.splice(cardIndex,1);
    D.push(buriedCard);
    const actorName=localDisplayName(actorIdx,P[actorIdx]?.name);
    const L=[...gs.log,`【活埋】${actorName} 将 ${cardLogText(buriedCard,{alwaysShowName:true})} 放到了牌堆底`];
    const nextTargetIndex=(abilityData.targetIndex||0)+1;
    if(nextTargetIndex>=targets.length){
      const turnOwner=abilityData._turnOwner??gs.currentTurn;
      const nextGs=buildTargetContinuationGs({players:P,deck:D,discard:Disc,log:L,turnOwner,abilityData});
      finishTargetContinuation({
        queue:[buryToDeckStep({fromPid:actorIdx,msgs:L.slice(-1),players:gs.players}),statePatchStep({players:P,deck:D,log:L})],
        nextGs,
        continueRest:!!(abilityData.fromRest&&isLocalSeatIndex(abilityData.source)),
      });
      return;
    }
    const nextGs={...gs,players:P,deck:D,discard:Disc,log:L,phase:'BURY_ALIVE_SELECT',abilityData:{...abilityData,targetIndex:nextTargetIndex,buryAliveSelectedIndex:null}};
    triggerAnimQueue([buryToDeckStep({fromPid:actorIdx,msgs:L.slice(-1),players:gs.players}),statePatchStep({players:P,deck:D,log:L})],nextGs);
  }

  function toggleBuryAliveSelect(idx){
    const abilityData=gs.abilityData||{};
    const targets=abilityData.targets||[];
    const choices=Array.isArray(abilityData.buryAliveChoices)?abilityData.buryAliveChoices:null;
    const actorIdx=choices
      ?targets.find(targetIdx=>isLocalSeatIndex(targetIdx)&&!choices[targetIdx])
      :targets[abilityData.targetIndex||0];
    if(!isLocalSeatIndex(actorIdx)||idx<0)return;
    const nextIdx=abilityData.buryAliveSelectedIndex===idx?null:idx;
    setGs({...gs,abilityData:{...abilityData,buryAliveSelectedIndex:nextIdx}});
  }

  function confirmBuryAliveSelection(){
    const idx=gs.abilityData?.buryAliveSelectedIndex;
    if(idx==null||idx<0)return;
    buryAliveSelectCard(idx);
  }

  function resolveSharedBuryAlive(state,autoFill=false){
    const abilityData=state?.abilityData||{};
    const targets=abilityData.targets||[];
    if(state?.phase!=='BURY_ALIVE_SELECT'||!Array.isArray(abilityData.buryAliveChoices)||!isLocalSeatIndex(abilityData.source))return false;
    const choices=[...abilityData.buryAliveChoices];
    if(autoFill){
      targets.forEach(targetIdx=>{
        if(choices[targetIdx]||!state.players?.[targetIdx]?.hand?.length)return;
        const cardIndex=Math.floor(Math.random()*state.players[targetIdx].hand.length);
        choices[targetIdx]={cardId:state.players[targetIdx].hand[cardIndex]?.id,cardIndex};
      });
    }
    if(targets.some(targetIdx=>!choices[targetIdx]))return false;
    let P=copyPlayers(state.players),D=[...state.deck],Disc=[...state.discard],L=[...state.log];
    const queue=[];
    targets.forEach(targetIdx=>{
      const choice=choices[targetIdx];
      const hand=P[targetIdx]?.hand||[];
      let cardIndex=hand.findIndex(card=>card?.id!=null&&card.id===choice?.cardId);
      if(cardIndex<0)cardIndex=Math.min(Math.max(0,choice?.cardIndex||0),Math.max(0,hand.length-1));
      if(!hand[cardIndex])return;
      const playersBefore=copyPlayers(P);
      const [buriedCard]=P[targetIdx].hand.splice(cardIndex,1);
      D.push(buriedCard);
      const msg=`【活埋】${localDisplayName(targetIdx,P[targetIdx]?.name)} 将 ${cardLogText(buriedCard,{alwaysShowName:true})} 放到了牌堆底`;
      L.push(msg);
      queue.push(
        buryToDeckStep({fromPid:targetIdx,msgs:[msg],players:playersBefore}),
        statePatchStep({players:copyPlayers(P),deck:[...D],log:[...L]}),
      );
    });
    const turnOwner=abilityData._turnOwner??state.currentTurn;
    const nextGs=buildTargetContinuationGs({players:P,deck:D,discard:Disc,log:L,turnOwner,abilityData});
    broadcastMpStateBeforeLocalReplay(nextGs);
    finishTargetContinuation({
      queue,
      nextGs,
      continueRest:!!(abilityData.fromRest&&isLocalSeatIndex(abilityData.source)),
    });
    return true;
  }

  function albinoCreatureSelectCard(cardIndex, allowAi=false){
    const abilityData=gs.abilityData||{};
    const actorIdx=abilityData.playerIndex;
    if((!isLocalSeatIndex(actorIdx)&&!allowAi)||cardIndex<0)return;
    const chosenCard=gs.players?.[actorIdx]?.hand?.[cardIndex];
    if(!chosenCard)return;
    const fireCardIds=abilityData.fireCardIds||[];
    if(!fireCardIds.includes(chosenCard.id))return;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard];
    const actorName=localDisplayName(actorIdx,P[actorIdx]?.name);
    const L=[...gs.log,`【白化生物】${actorName} 亮出了 ${cardLogText(chosenCard,{alwaysShowName:true})}`];
    const candidates=P.map((p,i)=>i).filter(i=>!P[i].isDead);
    let randomTarget=-1;
    let statEvents=[];
    let damageDecision=null;
    if(candidates.length>0){
      randomTarget=candidates[Math.floor(Math.random()*candidates.length)];
      const beforeTarget={...P[randomTarget]};
      damageDecision=submitDamageEvents({
        players:P,deck:D,discard:Disc,log:L,currentTurn:gs.currentTurn,
        events:[{targetIdx:randomTarget,lostHp:2,lostSan:2,source:'白化生物'}],
        continuation:buildTargetContinuationAbilityData(abilityData),
      });
      if(damageDecision.phase==='ETHEREALIZE_DECISION'){
        L.push(`【白化生物】${P[randomTarget].name} 即将失去 2 HP 和 2 SAN`);
        const revealEvent=createHuntRevealEvent({sourceIdx:actorIdx,targetIdx:actorIdx,card:chosenCard,msgs:[L[gs.log.length]]});
        const revealStep=buildHuntRevealStepFromVisualEvent({...revealEvent,targetIdx:actorIdx,targetName:P[actorIdx]?.name},{players:P},{allowTargetZero:true});
        const nextGs={
          ...gs,players:P,deck:D,discard:Disc,log:L,
          phase:damageDecision.phase,abilityData:damageDecision.abilityData,
          drawReveal:null,selectedCard:null,
          _visualEvents:[revealEvent].filter(Boolean),
        };
        broadcastVisualReplayIfNeeded(nextGs);
        triggerAnimQueue([revealStep,statePatchStep({players:P,deck:D,discard:Disc,log:L})].filter(Boolean),nextGs);
        return;
      }
      L.push(`${P[randomTarget].name} 失去 2 HP 和 2 SAN`);
      const statEventSeq=(gs?._statEventSeq||0)+1;
      statEvents=[{
        type:'HP_LOSS',
        target:randomTarget,
        from:{hp:beforeTarget.hp,san:beforeTarget.san,isDead:beforeTarget.isDead},
        to:{hp:P[randomTarget].hp,san:P[randomTarget].san,isDead:P[randomTarget].isDead},
        reason:'白化生物',
        seq:statEventSeq,
        phaseOrder:0,
      }];
      if(P[randomTarget].hp<=0&&!damageDecision.abilityData){
        killPlayerState(P,randomTarget,Disc,L);
      }
    }
    const revealEvent=createHuntRevealEvent({sourceIdx:actorIdx,targetIdx:actorIdx,card:chosenCard,msgs:[L[L.length-2]]});
    const revealStep=buildHuntRevealStepFromVisualEvent({...revealEvent,targetIdx:actorIdx,targetName:P[actorIdx]?.name},{players:P},{allowTargetZero:true});
    const queue=[];
    if(revealStep)queue.push(revealStep);
    queue.push(...buildAnimQueue(gs,{...gs,players:P,deck:D,discard:Disc,log:L}));
    const win=damageDecision?.abilityData?null:checkWin(P,gs._isMP);
    const nextGs={...gs,players:P,deck:D,discard:Disc,log:L,phase:damageDecision?.phase||'ACTION',abilityData:damageDecision?.abilityData||{},drawReveal:null,selectedCard:null,
      _visualEvents:[revealEvent].filter(Boolean),
      ...(win?{gameOver:win}:{}),
      ...(statEvents.length?{_statEvents:statEvents,_statEventSeq:statEvents[0].seq}:{}),
    };
    triggerAnimQueue(queue,nextGs);
  }

  function decipherStoneCarvingConfirm({ handCard, deckTopCards, deckBottomCards, allowAi = false }) {
    const abilityData = gs.abilityData || {};
    const actorIdx = abilityData.playerIndex;
    if ((!isLocalSeatIndex(actorIdx) && !allowAi) || !handCard) return;
    const measureRevealedCardCenter = card => {
      const el = [...document.querySelectorAll('[data-card-id]')]
        .find(node => node?.dataset?.cardId === String(card?.id));
      const rect = _getZoomCompensatedRect(el);
      return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
    };
    let P = copyPlayers(gs.players), D = [...gs.deck], Disc = [...gs.discard];
    const revealedCards = Array.isArray(abilityData.revealedCards) ? abilityData.revealedCards : [];
    const revealedById = new Map(revealedCards.map(card => [card.id, card]));
    const selectedHandCard = revealedById.get(handCard.id);
    if (!selectedHandCard) return;
    const normalizeZoneCards = cards => (Array.isArray(cards) ? cards : [])
      .map(card => revealedById.get(card.id))
      .filter(Boolean);
    const normalizedTop = normalizeZoneCards(deckTopCards);
    const normalizedBottom = normalizeZoneCards(deckBottomCards);
    const consumedIds = new Set([selectedHandCard.id, ...normalizedTop.map(card => card.id), ...normalizedBottom.map(card => card.id)]);
    if (consumedIds.size !== revealedCards.length) return;
    const sourcePointsById = new Map(revealedCards.map(card => [card.id, measureRevealedCardCenter(card)]));
    const actorName = localDisplayName(actorIdx, P[actorIdx]?.name);
    let L = [...gs.log, `【解读石刻】${actorName} 选择将 ${cardLogText(selectedHandCard, { alwaysShowName: true })} 收入手牌`];
    P[actorIdx].hand.push(selectedHandCard);
    const proliferatingZPatch = appendPublicCardGainTriggers(gs, P, actorIdx, selectedHandCard);
    let inspectionMeta = makeInspectionMeta(gs);
    if (selectedHandCard.isGod) {
      L.push(`【解读石刻】${actorName} 因选择邪神牌失去 1 SAN`);
      const processed = applySanLossToPlayerWithInspection(actorIdx, 1, gs.currentTurn ?? actorIdx, P, D, Disc, L, inspectionMeta, '解读石刻');
      P = processed.P;
      D = processed.D;
      Disc = processed.Disc;
      L = processed.L;
      inspectionMeta = processed.inspectionMeta;
    }
    // deckTopCards: 越靠右越顶部，所以 reverse 后 unshift
    if (normalizedTop.length) {
      D.unshift(...[...normalizedTop].reverse());
      L.push(`【解读石刻】${normalizedTop.length} 张牌放回牌堆顶`);
    }
    // deckBottomCards: 越靠左越底部，所以反向 push，让最左侧成为牌堆最底部
    if (normalizedBottom.length) {
      D.push(...[...normalizedBottom].reverse());
      L.push(`【解读石刻】${normalizedBottom.length} 张牌放到牌堆底`);
    }
    const win = checkWin(P, gs._isMP);
    const nextGs = {
      ...gs, players: P, deck: D, discard: Disc, log: L,
      phase: 'ACTION', abilityData: {}, drawReveal: null, selectedCard: null,
      ...inspectionMeta,
      ...proliferatingZPatch,
      ...(win ? { gameOver: win } : {}),
    };
    const decipherTransfers = [
      {
        sourcePoint: sourcePointsById.get(selectedHandCard.id),
        dest: 'player',
        toPid: actorIdx,
        count: 1,
        cards: [selectedHandCard],
        effect: 'decipherStone',
      },
      ...normalizedTop.map(card => ({
        sourcePoint: sourcePointsById.get(card.id),
        dest: 'deckTop',
        count: 1,
        cards: [card],
        effect: 'decipherStone',
      })),
      ...normalizedBottom.map(card => ({
        sourcePoint: sourcePointsById.get(card.id),
        dest: 'deckBottom',
        count: 1,
        cards: [card],
        effect: 'decipherStone',
      })),
    ].filter(transfer => transfer.sourcePoint);
    const decipherTransferStep = decipherTransfers.length
      ? cardTransferStep({
        transfers: decipherTransfers,
        durationMs: 780,
        msgs: L.slice(gs.log.length),
      })
      : null;
    const queue = [
      ...(decipherTransferStep ? [decipherTransferStep] : []),
      ...buildAnimQueue(gs, nextGs).filter(step => step?.type !== 'CARD_TRANSFER'),
    ];
    setGs(prev => prev ? { ...prev, phase: 'ACTION', abilityData: {}, drawReveal: null, selectedCard: null } : prev);
    triggerAnimQueue(queue, nextGs);
  }

  function handleSwapBlindDrawSelect(cardIdx){
    if(!swapBlindDrawRef.current)return;
    const tutorialAction={type:'swapSteal',cardIndex:cardIdx};
    if(!isTutorialActionAllowed(tutorialAction))return;
    const toPos=getPlayerHandAnchorCenter(0);
    // 遮罩中的牌排成一排，估算每张牌的屏幕位置作为飞行动画起点
    const handCount=swapBlindDrawRef.current.handSnapshot.length;
    const cardSpacing=52;
    const totalWidth=(handCount-1)*cardSpacing;
    const fromPos={
      x:window.innerWidth/2+(cardIdx*cardSpacing-totalWidth/2),
      y:window.innerHeight/2,
    };
    setSwapBlindDraw(prev=>prev?{...prev,phase:'flying',selectedIdx:cardIdx,flyFrom:fromPos,flyTo:toPos}:null);
    setTimeout(()=>{
      setSwapBlindDraw(null);
      swapSelectTargetCard(cardIdx);
    },700);
  }
  function swapSelectTargetCard(cardIdx){
    const tutorialAction={type:'swapSteal',cardIndex:cardIdx};
    if(!isTutorialActionAllowed(tutorialAction))return;
    const tutorialNext=getNextTutorialStepForAction(tutorialAction);
    const{swapTi}=gs.abilityData;
    let P=copyPlayers(gs.players);
    const targetWasRevealed=!!P[swapTi]?.revealHand;
    const taken=P[swapTi].hand.splice(cardIdx,1)[0];
    if(!taken)return;
    P[0].hand.push(taken);
    setGs({...gs,players:P,phase:'SWAP_GIVE_CARD',drawReveal:null,
      abilityData:{...gs.abilityData,takenCard:taken},
      log:[...gs.log,targetWasRevealed
        ?`你选择抽取了 ${cardLogText(taken,{alwaysShowName:true})}`
        :'你暗抽了1张牌'
      ]}
    );
    if(tutorialNext)setTutorialStep(tutorialNext);
  }
  function swapGiveCard(idx){
    const card=gs.players?.[0]?.hand?.[idx];
    const tutorialAction={type:'handCard',cardId:card?.id};
    if(!isTutorialActionAllowed(tutorialAction))return;
    const tutorialNext=getNextTutorialStepForAction(tutorialAction);
    const{swapTi,takenCard}=gs.abilityData;
    let P=copyPlayers(gs.players);
    const targetWasRevealed=!!gs.players?.[swapTi]?.revealHand;
    const given=P[0].hand.splice(idx,1)[0];
    if(!given)return;
    P[swapTi].hand.push(given);
    const takenText=targetWasRevealed?cardLogText(takenCard,{alwaysShowName:true}):'暗抽牌';
    const L=[...gs.log,`拿走 ${takenText}，还给 ${P[swapTi].name} ${cardLogText(given,{alwaysShowName:true})}`];
    const swapVisualEvent=createSwapCardsEvent({
      sourceIdx:0,
      targetIdx:swapTi,
      sourceCount:1,
      targetCount:1,
      takenCard,
      givenCard: given,
      sourceName:P[0].name,
      sourceLabel:`${P[0].name}${gs.globalOnlySwapOwner===null?'（寻宝者）':''}`,
      afterPlayers:copyPlayers(P),
      afterDiscard:[...(gs.discard||[])],
      msgs:L.slice(gs.log.length),
    });
    const resolvedSwapMsgs=swapVisualEvent?.msgs||L.slice(gs.log.length);
    const buildResolvedLocalSwapQueue=nextGs=>[
      {type:'SKILL_SWAP',msgs:resolvedSwapMsgs},
      ...swapCardsSteps({
        sourceIdx:0,targetIdx:swapTi,sourceCount:1,targetCount:1,
        takenCard,givenCard:given,msgs:resolvedSwapMsgs,
        playersBefore:gs.players,zhuLight:gs.zhuLight||null,
      }),
      ...buildAnimQueue(gs,nextGs).filter(step=>step?.type!=='CARD_TRANSFER'&&step?.type!=='SKILL_SWAP'),
    ];
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
        // winnerIdx / winnerIdx2 的字段顺序就是藏宝图播放顺序。联机状态在旋转座位索引时
        // 保留字段顺序，因此先按房间原始座位号排序，所有客户端都会得到同一展示次序。
        const originalSeatOf=localIdx=>gs._isMP
          ?(localIdx+(myPlayerIndexRef.current||0))%P.length
          :localIdx;
        const orderedLocalWinnerSeats=[0,swapTi].sort((a,b)=>originalSeatOf(a)-originalSeatOf(b));
        const newGs={...gs,players:P,drawReveal:null,log:[...L,reason],abilityData:{},_visualEvents:swapVisualEvent?[swapVisualEvent]:[],
          gameOver:{winner:'寻宝者',reason,winnerIdx:orderedLocalWinnerSeats[0],winnerIdx2:orderedLocalWinnerSeats[1]}};
        broadcastMpStateBeforeLocalReplay(newGs);
        triggerAnimQueue(buildResolvedLocalSwapQueue(newGs),newGs);
        return;
      }
      const pendingWinGs={...gs,players:P,drawReveal:null,log:[...L,`${_wname}集齐了全部编号！`],abilityData:{winReason:`${_wname}通过掉包集齐了全部编号！`},_visualEvents:swapVisualEvent?[swapVisualEvent]:[],
        phase:'PLAYER_WIN_PENDING'};
      broadcastMpStateBeforeLocalReplay(pendingWinGs);
      finishTutorialActionWithState(pendingWinGs,showTutorial?TUTORIAL_FLOW.TREASURE_MAP_ANIM:tutorialNext,buildResolvedLocalSwapQueue(pendingWinGs));
      return;
    }
    // 检查目标（非自身）是否为寻宝者且掉包后获胜
    if(P[swapTi].role==='寻宝者'&&isWinHand(P[swapTi].hand)){
      P[swapTi].roleRevealed=true;
      const tname=P[swapTi].name;
      const reason=`${tname} 获得了最后一张编号，寻宝者获胜！`;
      L.push(reason);
      const newGs={...gs,players:P,drawReveal:null,log:L,abilityData:{},_visualEvents:swapVisualEvent?[swapVisualEvent]:[],
        gameOver:{winner:'寻宝者',reason,winnerIdx:swapTi},phase:'ACTION',skillUsed:true};
      broadcastMpStateBeforeLocalReplay(newGs);
      triggerAnimQueue(buildResolvedLocalSwapQueue(newGs),newGs);
      return;
    }
    const win=checkWin(P,gs._isMP);
    const newGs={...gs,players:P,drawReveal:null,log:L,abilityData:{},phase:'ACTION',skillUsed:true,_visualEvents:swapVisualEvent?[swapVisualEvent]:[],...(win?{gameOver:win}:{})};
    const swapSteps=[
      {type:'VISUAL_LOCK',players:gs.players,zhuLight:gs.zhuLight||null},
      cardTransferStep({fromPid:0,dest:'player',toPid:swapTi,count:1,msgs:[L[L.length-1]]}),
    ];
    const statQ=buildAnimQueue(gs,newGs).filter(a=>a.type!=='CARD_TRANSFER');
    const swapMsgs=extractSkillLogs(L.slice(gs.log.length),'swap');
    broadcastMpStateBeforeLocalReplay(newGs);
    finishTutorialActionWithState(newGs,tutorialNext,[{type:'SKILL_SWAP',msgs:swapMsgs},...swapSteps,...statQ]);
  }

  function huntSelectTarget(ti){
    const tutorialAction={type:'selectTarget',pid:ti};
    if(!isTutorialActionAllowed(tutorialAction))return;
    const tutorialNext=getNextTutorialStepForAction(tutorialAction);
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard],baseLog=[...gs.log];
    const legal=P.map((p,i)=>i).filter(i=>i!==0&&!P[i].isDead&&hasHuntRevealableCard(P[i])&&!(gs.huntAbandoned||[]).includes(i));
    const night=resolveApophisTarget({players:P,deck:D,discard:Disc,log:baseLog,actorIdx:0,selectedIdx:ti,legalTargets:legal,label:'选择【追捕】目标'});
    P=night.players;D=night.deck;Disc=night.discard;baseLog=night.log;ti=night.targetIdx;
    P[0].roleRevealed=true;
    if(!hasHuntRevealableCard(P[ti])){
      setGsWithApophisTargetAnim({...gs,players:P,deck:D,discard:Disc,phase:'ACTION',abilityData:{},log:[...baseLog,`${P[ti].name} 手中没有可亮出的暗牌，追捕失败`],...apophisNightPatch(night)});
      return;
    }
    if(gs._isMP){
      // 多人游戏：目标是真人玩家，让目标自己选择亮出哪张牌（20秒超时随机）
      // 暂停房主回合计时器：进入 HUNT_WAIT_REVEAL 子阶段，目标玩家选完后恢复
      const huntWaitGs={...gs,players:P,deck:D,discard:Disc,phase:'HUNT_WAIT_REVEAL',
        abilityData:{...(gs.abilityData||{}),huntTi:ti},
        log:[...baseLog,`你（追猎者）追捕 ${P[ti].name}，等待对方亮出一张手牌…`],...apophisNightPatch(night)};
      const huntMsgs=extractSkillLogs(huntWaitGs.log.slice(gs.log.length),'hunt');
      const huntEvent=createHuntTargetEvent({sourceIdx:0,targetIdx:ti,msgs:huntMsgs});
      const huntWaitGsWithEvent={...huntWaitGs,_visualEvents:huntEvent?[huntEvent]:[]};
      broadcastMpStateBeforeLocalReplay(huntWaitGsWithEvent);
      triggerAnimQueue(mergeApophisTargetQueue([{type:'SKILL_HUNT',targetIdx:ti,msgs:huntMsgs}],gs,huntWaitGsWithEvent),huntWaitGsWithEvent);
      return;
    }
    // 单机/AI目标：由AI策略选择最优亮牌
    const knownHunterCards=P[ti]?.peekMemories?.[0]||[];
    const rc=aiChooseRevealCard(P[ti].hand,'你',gs.log,knownHunterCards);
    if(!rc){
      setGsWithApophisTargetAnim({...gs,players:P,deck:D,discard:Disc,phase:'ACTION',abilityData:{},log:[...baseLog,`${P[ti].name} 手中没有可亮出的暗牌，追捕失败`],...apophisNightPatch(night)});
      return;
    }
    const huntConfirmGs={...gs,players:P,deck:D,discard:Disc,phase:'HUNT_CONFIRM',
      abilityData:{...(gs.abilityData||{}),huntTi:ti,revCard:rc},
      log:[...baseLog,`你（追猎者）追捕 ${P[ti].name}，${P[ti].name} 亮出 ${cardLogText(rc,{alwaysShowName:true})}`],...apophisNightPatch(night)};
    // 动画位置测量交给 useEffect([anim]) 中的 SKILL_HUNT 分支（使用 data-pid，正确）
    const huntMsgs=extractSkillLogs(huntConfirmGs.log.slice(gs.log.length),'hunt');
    const huntEvent=createHuntTargetEvent({sourceIdx:0,targetIdx:ti,msgs:huntMsgs});
    const revealEvent=createHuntRevealEvent({sourceIdx:0,targetIdx:ti,card:rc,msgs:[huntConfirmGs.log[huntConfirmGs.log.length-1]]});
    const revealStep=buildHuntRevealStepFromVisualEvents({...huntConfirmGs,_visualEvents:[revealEvent].filter(Boolean)});
    const queue=mergeApophisTargetQueue([{type:'SKILL_HUNT',targetIdx:ti,msgs:huntMsgs},...(revealStep?[revealStep]:[])],gs,{...huntConfirmGs,_visualEvents:huntEvent?[huntEvent]:[]});
    finishTutorialActionWithState(huntConfirmGs,tutorialNext,queue);
  }
  function huntConfirm(myCardIdx){
    if(myCardIdx<0&&showTutorial&&tutorialStepDef)return;
    const chosenCard=myCardIdx>=0?gs.players?.[0]?.hand?.[myCardIdx]:null;
    const tutorialAction={type:'handCard',cardId:chosenCard?.id};
    if(myCardIdx>=0&&!isTutorialActionAllowed(tutorialAction))return;
    const tutorialNext=myCardIdx>=0?getNextTutorialStepForAction(tutorialAction):null;
    const{huntTi}=gs.abilityData;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard],L=[...gs.log];
    if(myCardIdx>=0){
      const huntLogStart=L.length;
      const targetHandBefore=[...(P[huntTi]?.hand||[])];
      const targetRevealBefore=!!P[huntTi]?.revealHand;
      const beforeHuntPlayers=copyPlayers(P);
      const dc=P[0].hand.splice(myCardIdx,1)[0];Disc.push(dc);
      const afterDiscardPlayers=copyPlayers(P);
      const afterDiscardDiscard=[...Disc];
      const huntDamage=3+(P[0].damageBonus||0);
      L.push(`弃 ${cardLogText(dc,{alwaysShowName:true})} → ${P[huntTi].name} 受 ${huntDamage}HP 伤害`);
      const huntDamageResult=submitDamageEvents({
        players:P,deck:D,discard:Disc,log:L,currentTurn:gs.currentTurn,
        events:[{targetIdx:huntTi,lostHp:huntDamage,source:'追捕'}],
      });
      if(huntDamageResult.phase==='ETHEREALIZE_DECISION'){
        P[0].roleRevealed=true;
        const newGs={
          ...gs,
          players:P,
          deck:D,
          discard:Disc,
          log:L,
          abilityData:huntDamageResult.abilityData,
          phase:huntDamageResult.phase,
          skillUsed:true,
        };
        const queue=buildAnimQueue(gs,newGs);
        if(queue.length)triggerAnimQueue(queue,newGs);else setGs(newGs);
        return;
      }
      // 追捕成功时揭晓追猎者身份
      if(!P[0].roleRevealed){
        P[0].roleRevealed=true;
        L.push(`${P[0].name} 的身份揭晓：追猎者`);
      }
      let afterDamagePlayers=null;
      let afterDamageDiscard=null;
      let afterDamageLog=null;
      let lootTransferCount=0;
      let lootDiscardCards=[];
      if(P[huntTi].hp<=0&&!(P[huntTi].hand||[]).some(isTsathogguaSlime)){
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
            afterDamagePlayers=copyPlayers(P);
            afterDamageDiscard=[...Disc];
            afterDamageLog=[...L];
            const huntResultEvent=createHuntResultEvent({
              hunterIdx:0,
              targetIdx:huntTi,
              revealedCard:gs.abilityData?.revCard,
              discardedCard:dc,
              beforePlayers:beforeHuntPlayers,
              afterDiscardPlayers,
              afterDiscardDiscard,
              afterDamagePlayers,
              afterDamageDiscard,
              afterDamageLog,
              afterPlayers:copyPlayers(P),
              afterResultDiscard:[...Disc],
              beforeLog:L.slice(0,huntLogStart),
              afterLog:[...L],
              msgs:L.slice(huntLogStart),
            });
            const lootSelectGs={...gs,players:P,deck:D,discard:Disc,log:[...L,`你（追猎者）从 ${P[huntTi].name} 的公开手牌中任选 ${Math.min(maxToTake,handCount)} 张！`],
              phase:'HUNT_SELECT_CARD_FROM_PUBLIC',
              abilityData:{huntTi:huntTi,preSkillRevealed:gs.abilityData?.preSkillRevealed,maxToTake:Math.min(maxToTake,handCount)},
              _visualEvents:huntResultEvent?[huntResultEvent]:[]};
            const queue=huntResultEvent
              ? buildAiHuntEventAnimQueue(huntResultEvent,P[0]?.name||'???')
              : buildAnimQueue(gs,lootSelectGs);
            broadcastMpStateBeforeLocalReplay(lootSelectGs);
            if(queue.length) triggerAnimQueue(queue,lootSelectGs); else setGs(lootSelectGs);
            return;
          }else if(targetRevealBefore){
            Disc=removeCardsFromDiscard(Disc,lootableHand);
            P[huntTi].hand=[...lootableHand];
            afterDamagePlayers=copyPlayers(P);
            afterDamageDiscard=[...Disc];
            afterDamageLog=[...L];
            P[0].hand.push(...lootableHand);
            lootTransferCount=lootableHand.length;
            P[huntTi].hand=[];
            L.push(`你夺取了 ${P[huntTi].name} 的全部公开手牌（${lootableHand.length} 张）！`);
          }else{
            Disc=removeCardsFromDiscard(Disc,lootableHand);
            P[huntTi].hand=[...lootableHand];
            afterDamagePlayers=copyPlayers(P);
            afterDamageDiscard=[...Disc];
            afterDamageLog=[...L];
            const cardsToTake=Math.min(maxToTake,handCount);
            for(let i=0;i<cardsToTake;i++){
              const randomIndex=Math.floor(Math.random()*P[huntTi].hand.length);
              const stolenCard=P[huntTi].hand.splice(randomIndex,1)[0];
              P[0].hand.push(stolenCard);
              lootTransferCount++;
              L.push(`你从 ${P[huntTi].name} 的手牌中暗抽了一张 ${cardLogText(stolenCard)}！`);
            }
            lootDiscardCards=[...P[huntTi].hand];
            Disc.push(...lootDiscardCards);
            P[huntTi].hand=[];
          }
        }else{
          afterDamagePlayers=copyPlayers(P);
          afterDamageDiscard=[...Disc];
          afterDamageLog=[...L];
        }
        if(P[huntTi].godZone?.length){Disc.push(...P[huntTi].godZone);P[huntTi].godZone=[];P[huntTi].godName=null;P[huntTi].godLevel=0;}
      }
      const win=huntDamageResult.abilityData?null:checkWin(P,gs._isMP);
      // 追猎者在追捕后设置skillUsed为true，这样就不能再休息了
      // 但追猎者仍然可以在同一回合内多次使用追捕技能
      const newGs={
        ...gs,players:P,deck:D,discard:Disc,log:L,
        abilityData:huntDamageResult.abilityData||{},phase:huntDamageResult.phase||'ACTION',
        skillUsed:true,...(win?{gameOver:win}:{}),
      };
      const huntResultEvent=createHuntResultEvent({
        hunterIdx:0,
        targetIdx:huntTi,
        revealedCard:gs.abilityData?.revCard,
        discardedCard:dc,
        beforePlayers:beforeHuntPlayers,
        afterDiscardPlayers,
        afterDiscardDiscard,
        afterDamagePlayers,
        afterDamageDiscard,
        afterDamageLog,
        lootTransferCount,
        lootDiscardCards,
        afterPlayers:copyPlayers(newGs.players),
        afterResultDiscard:[...(newGs.discard||[])],
        beforeLog:L.slice(0,huntLogStart),
        afterLog:[...L],
        msgs:L.slice(huntLogStart),
      });
      const newGsWithEvent=huntResultEvent?{...newGs,_visualEvents:[huntResultEvent]}:newGs;
      const queue=huntResultEvent
        ? buildAiHuntEventAnimQueue(huntResultEvent,P[0]?.name||'???')
        : buildAnimQueue(gs,newGsWithEvent);
      broadcastMpStateBeforeLocalReplay(newGsWithEvent);
      if(queue.length||tutorialNext) finishTutorialActionWithState(newGsWithEvent,tutorialNext,queue); else setGs(newGsWithEvent);
    }else{
      const newAbandoned=[...(gs.huntAbandoned||[]),huntTi];
      L.push(`放弃追捕 ${P[huntTi].name}`);
      // 放弃追捕时揭晓追猎者身份
      if(!P[0].roleRevealed){
        P[0].roleRevealed=true;
        L.push(`${P[0].name} 的身份揭晓：追猎者`);
      }
      // 追猎者放弃追捕后本回合禁用追捕技能
      P[0].disableSkill=true;
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
    if(!canRevealForHunt(card))return;
    // huntTi = 被追捕者在当前视角下的 index（非0）
    // 被追捕者将选择结果推送回规范 gs 并广播：
    // 设置 revCard，切换到 HUNT_CONFIRM 让追猎者（currentTurn=0 视角）完成后续
    const P=copyPlayers(gs.players);
    const L=[...gs.log,`${me.name} 亮出 ${cardLogText(card,{alwaysShowName:true})}`];
    const huntTi=gs.abilityData?.huntTi ?? 0;
    const huntRevealEvent=createHuntRevealEvent({
      sourceIdx:gs.currentTurn??0,
      targetIdx:huntTi,
      card,
      msgs:L.slice(gs.log.length),
    });
    const newGs={...gs,players:P,log:L,phase:'HUNT_CONFIRM',
      abilityData:{...gs.abilityData,revCard:card},
      ...(huntRevealEvent?{_visualEvents:[huntRevealEvent]}:{_visualEvents:[]})};
    setGs(newGs);
    // gs sync useEffect 将广播给追猎者
  }

  // Called when player picks their card to reveal during an AI hunt
  function playerRevealForHunt(cardIdx){
    const card=me.hand[cardIdx];
    if(!card||isBlackGoatYoung(card)||isTsathogguaSlime(card))return;
    const{huntingAI,aiHunterName}=gs.abilityData;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard],L=[...gs.log];
    let discardedCard=null;
    const myHandBefore=[...(P[0]?.hand||[])];
    const myRevealBefore=!!P[0]?.revealHand;
    let damage=null;
    L.push(`你亮出 ${cardLogText(card,{alwaysShowName:true})}`);
    const aiHand=P[huntingAI].hand;
    const mi=aiHand.findIndex(c=>cardsHuntMatch(c,card));
    const hadHuntDamage=mi>=0;
    if(mi>=0){
      discardedCard=aiHand.splice(mi,1)[0];Disc.push(discardedCard);
      const huntDamage=3+(P[huntingAI].damageBonus||0);
      L.push(`${aiHunterName} 弃 ${cardLogText(discardedCard,{alwaysShowName:true})}，你受 ${huntDamage}HP 伤害！`);
      damage=submitDamageEvents({
        players:P,deck:D,discard:Disc,log:L,currentTurn:gs.currentTurn,
        events:[{targetIdx:0,lostHp:huntDamage,source:'追捕'}],
      });
      if(damage.phase==='ETHEREALIZE_DECISION'){
        const newGs={
          ...gs,
          players:P,
          deck:D,
          discard:Disc,
          log:L,
          phase:damage.phase,
          abilityData:damage.abilityData,
          huntAbandoned:gs.huntAbandoned||[],
          skillUsed:true,
        };
        syncVisibleLog(L,newGs);
        const queue=buildAnimQueue(gs,newGs);
        if(queue.length)triggerAnimQueue(queue,newGs);else setGs(newGs);
        return;
      }
      if(P[0].hp<=0&&!(P[0].hand||[]).some(isTsathogguaSlime)){
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
    const win=damage?.abilityData?null:checkWin(P,gs._isMP);
    const newAbandoned = hadHuntDamage
      ? (gs.huntAbandoned || []).filter(i => i !== 0)
      : [...new Set([...(gs.huntAbandoned || []), 0])];
    // AI 追捕失败（放弃）后本回合不再追捕
    const wantsToHuntAgain = hadHuntDamage && shouldHunterKeepChasing(P,huntingAI,newAbandoned);
    if(!hadHuntDamage) P[huntingAI].disableSkill=true;

    const baseGs={...gs,players:P,deck:D,discard:Disc,log:L,abilityData:{},phase:'ACTION', huntAbandoned: newAbandoned};

    let newGs;
    let beforeNextTurnGs=null;
    if (win) newGs = {...baseGs, gameOver:win};
    // 决定是让 AI 重新进入 AI_TURN 继续追杀，还是结束该回合
      else if (wantsToHuntAgain) newGs = withClearedTurnAnimFields({...baseGs, phase: 'AI_TURN', currentTurn: huntingAI, skillUsed: false, restUsed: false, _aiName: aiHunterName});
    else{
      const aiHandLimit=P[huntingAI]._nyaHandLimit??4;
      while(P[huntingAI].hand.length>aiHandLimit){
        const c=P[huntingAI].hand.shift();
        Disc.push(c);
        L.push(`${aiHunterName} 弃 ${cardLogText(c,{alwaysShowName:true})}（上限）`);
      }
      beforeNextTurnGs={...baseGs, players:P, discard:Disc, log:L, currentTurn: huntingAI, skillUsed: true};
      newGs = startNextTurn(beforeNextTurnGs);
    }
    if(damage?.phase)newGs={...newGs,phase:damage.phase,abilityData:damage.abilityData};

    syncVisibleLog(L,newGs);
    const queue=[];
    if(discardedCard){
      queue.push({type:'DISCARD',card:discardedCard,triggerName:aiHunterName||'???',targetPid:huntingAI});
    }
    const animEndGs=beforeNextTurnGs||newGs;
    const animQueue=buildAnimQueue(gs,animEndGs).filter(step=>!(discardedCard&&step.type==='CARD_TRANSFER'&&step.fromPid===huntingAI&&step.dest==='discard'));
    queue.push(...animQueue);
    const nextAiTurnIntroQueue=beforeNextTurnGs
      ?buildQueuedNextAiTurnStartReplay(newGs,{
        fromTurn:huntingAI,
        playersBeforeDraw:beforeNextTurnGs.players,
        statEventSeq:Math.max(maxKnownStatEventSeq(animEndGs),maxKnownStatEventSeq(gs)),
      })
      :[];
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
    }else if(nextAiTurnIntroQueue.length){
      const nextAiTurnIntroGs=markQueuedAiTurnStartReplayShown(newGs,nextAiTurnIntroQueue);
      if(queue.length){
        triggerAnimQueue(queue,nextAiTurnIntroGs,()=>triggerAnimQueue(nextAiTurnIntroQueue,nextAiTurnIntroGs));
      }else{
        triggerAnimQueue(nextAiTurnIntroQueue,nextAiTurnIntroGs);
      }
    }else{
      triggerAnimQueue(queue,newGs);
    }
  }

  function bewitchSelectCard(idx){
    const card=me.hand[idx];
    const tutorialAction={type:'handCard',cardId:card?.id};
    if(!isTutorialActionAllowed(tutorialAction))return;
    const tutorialNext=getNextTutorialStepForAction(tutorialAction);
    setGs({...gs,phase:'BEWITCH_SELECT_TARGET',abilityData:{bewitchCard:card,bewitchIdx:idx}});
    if(tutorialNext)setTutorialStep(tutorialNext);
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
      setGs(p=>p?{...p,phase:'ACTION',abilityData:{}}:p);
      triggerAnimQueue(queue,newGs);
    }else setGs(newGs);
  }

  function sameAbyssSelect(choice, allowAi=false){
    const{targetIdx,actorHandCount,discardCount}=gs.abilityData||{};
    if(gs.phase!=='SAME_ABYSS_SELECT'||(!isLocalSameAbyssTargetPhase(gs)&&!allowAi))return;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard];
    const L=[...gs.log];
    const target=P[targetIdx];
    if(!target)return;
    let damage=null;
    if(choice==='discard'){
      if(discardCount>0){
        for(let d=0;d<discardCount;d++){
          if(target.hand.length>actorHandCount){
            const c=target.hand.shift();
            if(isBlackGoatYoung(c)||isTsathogguaSlime(c)){
              L.push(`${target.name} 的衍生牌被销毁`);
            }else if(c.type!=='blankZone'){
              Disc.push(c);
            }
          }
        }
      }
      L.push(`【同归深渊】${target.name} 选择弃置手牌至 ${actorHandCount} 张`);
    }else{
      L.push(`【同归深渊】${target.name} 选择承受伤害，失去 4 HP`);
      damage=submitDamageEvents({
        players:P,deck:D,discard:Disc,log:L,currentTurn:gs.currentTurn,
        events:[{targetIdx,lostHp:4,source:'同归深渊'}],
        continuation:{_turnOwner:gs.abilityData?._turnOwner??gs.currentTurn},
      });
      if(damage.phase==='ETHEREALIZE_DECISION'){
        const newGs={
          ...gs,
          players:P,deck:D,discard:Disc,log:L,
          phase:damage.phase,
          abilityData:damage.abilityData,
        };
        const queue=bindAnimLogChunks(buildAnimQueue(gs,newGs),splitAnimBoundLogs(L.slice(gs.log.length)));
        if(queue.length)triggerAnimQueue(queue,newGs);else setGs(newGs);
        return;
      }
    }
    const win=damage?.abilityData?null:checkWin(P,gs._isMP);
    if(win){setGs({...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win,phase:'ACTION',abilityData:{}});return;}
    const nextTurn=gs.abilityData?._turnOwner??gs.currentTurn;
    const resumesAiTurn=isAiSeat(gs,nextTurn)&&!P[nextTurn]?.isDead;
    const nextPhase=resumesAiTurn?'AI_TURN':'ACTION';
    const newGs={
      ...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:nextTurn,
      phase:damage?.phase||nextPhase,abilityData:damage?.abilityData||{},
    };
    const queue=bindAnimLogChunks(buildAnimQueue(gs,newGs),splitAnimBoundLogs(L.slice(gs.log.length)));
    if(queue.length){
      setGs(p=>p?{...p,phase:nextPhase,abilityData:{}}:p);
      triggerAnimQueue(queue,newGs);
    }else setGs(newGs);
  }

  function sphinxGuess(guessYes, allowAi=false){
    if(gs.phase!=='SPHINX_GUESS'||(!isLocalSphinxGuessPhase(gs)&&!allowAi))return;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard];
    const L=[...gs.log];
    const topCard=D[0];
    const isZone=isZoneCard(topCard);
    const actualCard=D.shift();
    L.push(`你猜测牌堆顶的牌${guessYes?'是':'不是'}区域牌`);
    const guessCorrect=(guessYes&&isZone)||(!guessYes&&!isZone);
    let proliferatingZPatch={};
    let damageDecision=null;
    if(guessCorrect){
      L.push(`猜测正确！你收入了 ${cardLogText(actualCard)}`);
      P[gs.currentTurn].hand.push(actualCard);
      proliferatingZPatch=appendPublicCardGainTriggers(gs,P,gs.currentTurn,actualCard);
    }else{
      const sphinxAvoidNegative=!!gs.abilityData?.sphinxAvoidNegative;
      L.push(sphinxAvoidNegative?'猜测错误！负面效果已规避':'猜测错误！你失去 3 HP');
      const localMsgs=[];
      Disc.push(actualCard);
      if(!sphinxAvoidNegative){
        damageDecision=submitDamageEvents({
          players:P,deck:D,discard:Disc,log:localMsgs,currentTurn:gs.currentTurn,
          events:[{targetIdx:gs.currentTurn,lostHp:3,source:'斯芬克斯'}],
          continuation:{_turnOwner:gs.abilityData?._turnOwner??gs.currentTurn},
        });
        if(localMsgs.length)L.push(...localMsgs);
      }
    }
    const logDelta=L.slice(gs.log.length);
    const sphinxEvent=createSphinxResultEvent({
      actorIdx:gs.currentTurn,
      card:actualCard,
      guessCorrect,
      msgs:logDelta,
    });
    const buildSphinxQueue=state=>{
      const resultQueue=guessCorrect
        ?[]
        :bindAnimLogChunks(buildAnimQueue(gs,state),splitAnimBoundLogs(logDelta));
      return buildSphinxResultQueue({
        card:actualCard,
        actorIdx:gs.currentTurn,
        guessCorrect,
        msgs:logDelta,
        resultQueue,
      });
    };
    const win=checkWin(P,gs._isMP);
    if(win){
      const winGs={
        ...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win,phase:'ACTION',abilityData:{},...proliferatingZPatch,
        ...(sphinxEvent?{_visualEvents:[sphinxEvent]}:{}),
      };
      const queue=buildSphinxQueue(winGs);
      broadcastMpStateBeforeLocalReplay(winGs);
      triggerAnimQueue(queue,winGs);
      return;
    }
    const nextTurn=gs.abilityData?._turnOwner??gs.currentTurn;
    const resumesAiTurn=isAiSeat(gs,nextTurn)&&!P[nextTurn]?.isDead;
    const nextPhase=resumesAiTurn?'AI_TURN':'ACTION';
    const newGs={
      ...gs,players:P,deck:D,discard:Disc,log:L,
      phase:damageDecision?.phase||nextPhase,currentTurn:nextTurn,
      abilityData:damageDecision?.abilityData||{},...proliferatingZPatch,
    };
    const newGsWithEvent=sphinxEvent?{...newGs,_visualEvents:[sphinxEvent]}:newGs;
    const queue=buildSphinxQueue(newGsWithEvent);
    if(queue.length){
      setGs(p=>p?{...p,phase:nextPhase,abilityData:{}}:p);
      broadcastMpStateBeforeLocalReplay(newGsWithEvent);
      triggerAnimQueue(queue,newGsWithEvent);
    }else setGs(newGsWithEvent);
  }

  function buildPostBewitchStatQueue(oldGs,newGs){
    const apophisSeq=newGs?._apophisTargetEvent?.seq;
    const cleanOldGs=clearTurnDrawReplayHints(oldGs);
    const queueOldGs=apophisSeq&&apophisSeq>(cleanOldGs?._apophisTargetSeq||0)
      ?{...cleanOldGs,_apophisTargetSeq:apophisSeq}
      :cleanOldGs;
    const result=buildInspectionAwareAnimQueue(queueOldGs,clearTurnDrawReplayHints(newGs),{buildAnimQueue,copyPlayers});
    if(result.inspectionEvents.length){
      lastInspectionSeqRef.current=Math.max(lastInspectionSeqRef.current,...result.inspectionEvents.map(ev=>ev.seq||0));
    }
    return result.queue;
  }

  function bewitchSelectTarget(ti){
    const tutorialAction={type:'selectTarget',pid:ti};
    if(!isTutorialActionAllowed(tutorialAction))return;
    const tutorialNext=getNextTutorialStepForAction(tutorialAction);
    const{bewitchCard,bewitchIdx}=gs.abilityData;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard],baseLog=[...gs.log];
    const night=resolveApophisTarget({
      players:P,deck:D,discard:Disc,log:baseLog,actorIdx:0,selectedIdx:ti,
      legalTargets:P.map((p,i)=>i).filter(i=>i!==0&&!P[i].isDead),
      label:'选择【蛊惑】目标'
    });
    P=night.players;D=night.deck;Disc=night.discard;baseLog=night.log;ti=night.targetIdx;
    let inspectionMeta=makeInspectionMeta(gs);
    P[0].roleRevealed=true;P[0].hand.splice(bewitchIdx,1);
    const L=[...baseLog,`你对 ${P[ti].name} 【蛊惑】，赠予 ${cardLogText(bewitchCard,{alwaysShowName:true})}`];
    // God card gifted via bewitch: forced convert if different god, then AI resolves for target
    if(bewitchCard.isGod){
      const encounterProgress=advanceGodEncounter(P[ti],gs);
      const cost=encounterProgress.sanLoss;
      // 仅已揭晓的邪祀者免疫遭遇邪神的SAN损耗
      let effectMsg = '';
      if (isRevealedCultist(P[ti])) {
        effectMsg = `${P[ti].name}（邪祀者）遭遇邪神 ${bewitchCard.name}（${formatGodEncounterProgress(encounterProgress)}），免疫SAN损耗`;
      } else {
        effectMsg = `${P[ti].name} 遭遇邪神 ${bewitchCard.name}（${formatGodEncounterProgress(encounterProgress)}），失去${cost}SAN`;
        L.push(effectMsg);
        if(cost>0){
          const processed=applySanLossToPlayerWithInspection(ti,cost,gs.currentTurn,P,D,Disc,L,inspectionMeta,'邪神遭遇');
          P=processed.P;D=processed.D;Disc=processed.Disc;inspectionMeta=processed.inspectionMeta;L.splice(0,L.length,...processed.L);
        }
      }
      if(isRevealedCultist(P[ti]))L.push(effectMsg);
      const forcedConvert=true;
      const shouldDeferShuTarget=!!(gs._isMP&&ti!==0&&bewitchCard.godKey==='SHU');
      const godResolveGs={...gs,players:P,deck:D,discard:Disc,log:L,...inspectionMeta};
      const gres=resolveGodEncounterForAI(ti,bewitchCard,P,D,Disc,godResolveGs,forcedConvert,{deferShuTarget:shouldDeferShuTarget});
      P=gres.P;D=gres.D;Disc=gres.Disc;L.push(...gres.msgs);
      const win=checkWin(P,gs._isMP);
      const nightPatch=apophisNightPatch(night);
      const nextApophisNight=gres.statePatch?.apophisNight??nightPatch.apophisNight??gs.apophisNight;
      const mergedInspectionMeta={
        ...inspectionMeta,
        ...(gres.inspectionMeta||{}),
        ...((gres.inspectionMeta?.abilityData||inspectionMeta?.abilityData)?{abilityData:gres.inspectionMeta?.abilityData||inspectionMeta.abilityData}:{}),
      };
      const hasSlimeDecision=mergedInspectionMeta?.abilityData?.type==='tsgSlimeBalance';
      const deferredShu=gres.statePatch?._deferredShuTarget;
      const nextPhase=hasSlimeDecision?'TSG_SLIME_BALANCE':deferredShu?'SHU_SELECT_TARGET':'ACTION';
      const nextAbilityData=hasSlimeDecision
        ?{...mergedInspectionMeta.abilityData,_turnOwner:gs.currentTurn}
        :deferredShu
          ?{...(gres.statePatch?.abilityData||{}),_turnOwner:gs.currentTurn}
          :{};
      const bewitchMsgs=extractSkillLogs(L.slice(gs.log.length),'bewitch');
      const bewitchEvent=createBewitchGiftEvent({sourceIdx:0,targetIdx:ti,targetName:P[ti]?.name,card:bewitchCard,msgs:bewitchMsgs});
      const newGs=clearTurnDrawReplayHints({...gs,players:P,deck:D,discard:Disc,log:L,drawReveal:null,skillUsed:true,...mergedInspectionMeta,...nightPatch,...(gres.statePatch||{}),phase:nextPhase,abilityData:nextAbilityData,apophisNight:nextApophisNight,_visualEvents:[...(gres.statePatch?._visualEvents||[]),...(bewitchEvent?[bewitchEvent]:[])],...(win?{gameOver:win}:{})});
      const statQueue=buildPostBewitchStatQueue(gs,newGs);
      broadcastMpStateBeforeLocalReplay(newGs);
      finishTutorialActionWithState(
        newGs,
        tutorialNext,
        mergeApophisTargetQueue(buildBewitchForcedCardQueue(0,ti,bewitchCard,P[ti]?.name,statQueue,bewitchMsgs),gs,newGs)
      );
      return;
    }
    const res=applyFx(bewitchCard,ti,bewitchCard.type==='swapAllHands'?null:ti,P,D,Disc,gs);L.push(...res.msgs);
    res.P[ti].hand.push(bewitchCard);
    const win=checkWin(res.P,gs._isMP);
    const {phase:nextPhase,abilityData:phaseAbilityData}=deriveEffectDecisionState(res.statePatch,{
      fallbackPhase:'ACTION',
      leadingPhase:bewitchCard.type==='swapAllHands'?'ZONE_SWAP_SELECT_TARGET':null,
      leadingAbilityData:bewitchCard.type==='swapAllHands'?{
        zoneSwapCard:bewitchCard,
        zoneSwapSource:ti,
      }:{},
      turnOwner:gs.currentTurn,
    });
    const bewitchMsgs=extractSkillLogs(L.slice(gs.log.length),'bewitch');
    const bewitchEvent=createBewitchGiftEvent({sourceIdx:0,targetIdx:ti,targetName:res.P[ti]?.name,card:bewitchCard,msgs:bewitchMsgs});
    const newGs=clearTurnDrawReplayHints({...gs,players:res.P,deck:res.D,discard:res.Disc,log:L,drawReveal:null,
      abilityData:phaseAbilityData,
      phase:nextPhase,
      skillUsed:true,...(res.statePatch||{}),...apophisNightPatch(night),_visualEvents:[...(res.statePatch?._visualEvents||[]),...(bewitchEvent?[bewitchEvent]:[])],...(win?{gameOver:win}:{})});
      const statQueue=buildPostBewitchStatQueue(gs,newGs);
      broadcastMpStateBeforeLocalReplay(newGs);
      finishTutorialActionWithState(
        newGs,
        tutorialNext,
        mergeApophisTargetQueue(buildBewitchForcedCardQueue(0,ti,bewitchCard,res.P[ti]?.name,statQueue,bewitchMsgs),gs,newGs)
      );
  }

  // ── God choice handlers ────────────────────────────────────
  function godResolvePlayer(action){
    // action: 'worship'|'upgrade'|'keepHand'|'discard'|'forcedConvert'
    const godCard=gs.abilityData?.godCard;if(!godCard)return;
    const tutorialAction=action==='keepHand'?{type:'godKeepHand'}:{type:'godChoice',action};
    if(showTutorial&&tutorialStepDef&&!isTutorialActionAllowed(tutorialAction))return;
    const tutorialNext=showTutorial&&tutorialStepDef?getNextTutorialStepForAction(tutorialAction):null;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard],L=[...gs.log];
    let inspectionMeta=makeInspectionMeta(gs);
    const fromEndTurnReplay=!!gs.abilityData?.fromEndTurnReplay;
    if(fromEndTurnReplay&&action!=='keepHand'){
      const handIdx=(P[0]?.hand||[]).findIndex(card=>card?.id===godCard.id);
      if(handIdx>=0)P[0].hand.splice(handIdx,1);
    }
    const isDiscardAction=action!=='keepHand'&&action!=='worship'&&action!=='upgrade'&&action!=='forcedConvert';
    const gk=godCard.godKey;
    const alreadyWorship=P[0].godName===gk;
    // SAN deduction and inspections are now handled upfront in handleCardDraw
    
    if(action==='keepHand'){
      P[0].roleRevealed=true;
      if(!fromEndTurnReplay)P[0].hand.push({...godCard});
      L.push('你（邪祀者）将邪神牌收入手牌');
    } else if(action==='worship'||action==='upgrade'||action==='forcedConvert'){
      if(action==='forcedConvert'||(P[0].godName&&P[0].godName!==gk)){
        const converted=convertGodFollower(0,gs.currentTurn,P,D,Disc,L,inspectionMeta,'改信新神，失去1SAN，旧神牌入弃牌堆',godCard);
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
      P[0].hasBelievedGod=true;
      if(['APO','ZHU','SHU'].includes(gk)&&hasGodPowerImmunity(P[0])){
        L.push(buildGodPowerBlockedLog(P[0]));
      }
      // Kick out anyone else worshipping same god
      P.forEach((p,i)=>{if(i>0&&p.godName===gk){const abandoned=abandonGodFollower(i,gs.currentTurn,P,D,Disc,L,inspectionMeta);P=abandoned.P;D=abandoned.D;Disc=abandoned.Disc;L=abandoned.L;inspectionMeta=abandoned.inspectionMeta;}});
    } else {
      Disc.push({...godCard});L.push('你放弃了邪神的馈赠');
    }
    const gainedGodByOwnershipChange=!fromEndTurnReplay&&(action==='keepHand'||action==='worship'||action==='upgrade'||action==='forcedConvert');
    const proliferatingZPatch=gainedGodByOwnershipChange
      ?appendPublicCardGainTriggers(gs,P,0,godCard)
      :{};
    const godPowerImmediate=(action==='worship'||action==='upgrade'||action==='forcedConvert')&&canGodPowerAffect(P[0]);
    const nextZhuLight=godPowerImmediate
      ?buildZhuLight(P,D,0,gs.zhuLight)
      :gs.zhuLight;
    const nextApophisNight=godPowerImmediate&&gk==='APO'
      ?getApophisNightForLevel(P[0].godLevel)
      :gs.apophisNight;
    if(godPowerImmediate&&gk==='APO'){
      L.push(buildApophisNightLog());
    }
    const blockedGodPowerEvent=(!godPowerImmediate&&(action==='worship'||action==='upgrade'||action==='forcedConvert')&&['APO','ZHU','SHU'].includes(gk)&&hasGodPowerImmunity(P[0]))
      ?createGodPowerBlockedEvent({playerIdx:0,playerName:P[0].name,msgs:[buildGodPowerBlockedLog(P[0])]})
      :null;
    // Only worship/forcedConvert consume the worship-this-turn slot.
    // Upgrade, discard, and keepHand do not.
    const consumesSlot=action==='worship'||action==='forcedConvert';
    // SHU: 进入目标选择阶段而非直接给牌
    const isShuBlessing=godPowerImmediate&&gk==='SHU';
    const shuOffspringCount=isShuBlessing?(GOD_DEFS.SHU.levels[P[0].godLevel-1]?.offspringCount||0):0;
    const replayPatch=fromEndTurnReplay?advanceEndTurnReplayPatch(gs):{};
    const secondaryDecisionType=inspectionMeta?.abilityData?.type;
    const secondaryDecision=(secondaryDecisionType==='tsgSlimeBalance'||secondaryDecisionType==='etherealizeRedirect')?inspectionMeta.abilityData:null;
    const basePhase=isShuBlessing?'SHU_SELECT_TARGET':'ACTION';
    const nextPhase=secondaryDecision?(secondaryDecisionType==='tsgSlimeBalance'?'TSG_SLIME_BALANCE':'ETHEREALIZE_DECISION'):basePhase;
    // The pending god card belongs only to GOD_CHOICE. Keep continuation
    // metadata (e.g. Cthulhu/Slime/end-turn flows), but do not leak the
    // resolved card into ACTION and let remote clients mistake it for a draw.
    const resolvedGodChoiceContext={...(gs.abilityData||{})};
    delete resolvedGodChoiceContext.godCard;
    delete resolvedGodChoiceContext.drawerIdx;
    delete resolvedGodChoiceContext.godEncounterCost;
    const baseAbilityData=isShuBlessing?{...resolvedGodChoiceContext,shuOffspringCount,shuChooserIdx:0}:resolvedGodChoiceContext;
    const nextAbilityData=secondaryDecision
      ?{...secondaryDecision,...(fromEndTurnReplay?{fromEndTurnReplay:true}:{}),_turnOwner:gs.currentTurn??0}
      :baseAbilityData;
    const {abilityData:_,...inspectionMetaWithoutAbilityData}=inspectionMeta||{};
    // 保留abilityData中的cthDrawsRemaining信息
    const newGs={...gs,players:P,deck:D,discard:Disc,log:L,zhuLight:nextZhuLight,apophisNight:nextApophisNight,phase:nextPhase,abilityData:nextAbilityData,
      _visualEvents:blockedGodPowerEvent?[blockedGodPowerEvent]:[],
      godTriggeredThisTurn:consumesSlot,...inspectionMetaWithoutAbilityData,...replayPatch,...proliferatingZPatch};
    const finishGodChoice=(state)=>{
      const win=checkWin(state.players,state._isMP);
      if(win){
        setGs({...state,gameOver:win});
      }else if(tutorialNext){
        setGs(state);
        setTutorialStep(tutorialNext);
      }else{
        const continuationRoute=getTargetContinuationRoute(state,{
          continueRest:!!gs.abilityData?.fromRest,
          continueTurnStartDraw:!!gs.abilityData?.continueTurnStartDraw,
        });
        if(continuationRoute===TARGET_CONTINUATION_ROUTE.REST_DRAW)_cthContinueRestDraws(state);
        else if(continuationRoute===TARGET_CONTINUATION_ROUTE.TURN_START_DRAW)_tsgContinueTurnStartDraw(state);
        else if(continuationRoute===TARGET_CONTINUATION_ROUTE.END_TURN_REPLAY)continueEndTurnReplay(state);
        else if(continuationRoute===TARGET_CONTINUATION_ROUTE.PROLIFERATING_Z)continueProliferatingZDraws(state);
        else if(continuationRoute===TARGET_CONTINUATION_ROUTE.DECISION)setGs(state);
        else resumeEndTurnSeqOrSetGs(state);
      }
    };
    if(isDiscardAction){
      const discardLog=L[L.length-1];
      const drawerIdx=gs.abilityData?.drawerIdx??gs.currentTurn??0;
      const discardGs={...newGs,_discardedDrawnCard:true};
      const queue=[
        // The god draw and reveal have already completed before GOD_CHOICE opens.
        // Replaying DRAW_CARD here also replays its background camera prelude.
        {type:'DISCARD',card:godCard,triggerName:'你',targetPid:drawerIdx,msgs:[discardLog]},
        statePatchStep({players:P,discard:Disc}),
      ];
      if(fromEndTurnReplay){
        appendEndTurnReplaySyncQueue([...queue],L.slice(gs.log.length));
      }else{
        // 先广播再播本地弃牌动画：远端收到时仍停留在 GOD_CHOICE，
        // 走 buildResolvedGodChoiceDiscardStep 与本地同步播放弃牌动画；
        // 否则自动广播会等本地动画结束后才发出，远端被动滞后整个动画时长
        broadcastMpStateBeforeLocalReplay(clearTurnDrawReplayHints(discardGs));
      }
      triggerAnimQueue(queue,discardGs,()=>finishGodChoice(clearTurnDrawReplayHints(discardGs)));
      return;
    }
    const inspectionEvents=(newGs._inspectionEvents||[]).filter(ev=>ev?.seq>(gs._inspectionSeq||0));
    // 构建动画队列并执行，在动画完成后检查游戏是否结束
    let queue;
    if(inspectionEvents.length){
      lastInspectionSeqRef.current=Math.max(lastInspectionSeqRef.current,...inspectionEvents.map(ev=>ev.seq||0));
      const inspectionFlow=buildInspectionEventFlow(gs,inspectionEvents,{buildAnimQueue,copyPlayers});
      const tailQueue=buildAnimQueue(
        {players:inspectionFlow.players,log:inspectionFlow.log,_statEventSeq:inspectionFlow.statEventSeq},
        {players:newGs.players,log:newGs.log}
      );
      queue=[...inspectionFlow.queue,...tailQueue];
    }else{
      queue=bindAnimLogChunks(buildAnimQueue(gs,newGs),splitAnimBoundLogs(L.slice(gs.log.length)));
    }
    if(queue.length){
      if(fromEndTurnReplay){
        appendEndTurnReplaySyncQueue([...queue,statePatchStep({players:P,discard:Disc})],L.slice(gs.log.length));
      }else{
        // 信仰/升级/收手同样先广播：远端按 resolvedGodChoice 决策分支与本地同步播放效果动画
        broadcastMpStateBeforeLocalReplay(newGs);
      }
      triggerAnimQueue(queue,newGs,()=>finishGodChoice(newGs));
    }else{
      const win=checkWin(P,gs._isMP);
      const finalGs={...newGs,...(win?{gameOver:win}:{})};
      finishGodChoice(finalGs);
    }
  }

  // NYA borrow handlers
  function finishNyaBorrowDraw(res, baseLog, preDrawPlayers, preDrawDeck, preDrawDiscard){
    const finalLog=[...baseLog,...(res.effectMsgs||[])];
    let nextGs;
    if(res.needGodChoice){
      nextGs={...gs,players:res.P,deck:res.D,discard:res.Disc,log:finalLog,phase:'GOD_CHOICE',
        abilityData:{godCard:res.drawnCard,drawerIdx:0,godEncounterCost:res.godEncounterCost},
        drawReveal:null,selectedCard:null,currentTurn:0,skillUsed:false,restUsed:false};
    }else{
      const win=checkWin(res.P,gs._isMP);
      if(win){
        nextGs={...gs,players:res.P,deck:res.D,discard:res.Disc,log:finalLog,gameOver:win,phase:'ACTION',drawReveal:null,selectedCard:null,abilityData:{},currentTurn:0,skillUsed:false,restUsed:false};
      }else if(res.needsDecision){
        nextGs={...gs,players:res.P,deck:res.D,discard:res.Disc,log:finalLog,phase:'DRAW_REVEAL',
          drawReveal:{card:res.drawnCard,msgs:res.effectMsgs,needsDecision:!!res.needsDecision,forcedKeep:!!res.forcedKeep,drawerIdx:0,drawerName:res.P[0].name},
          selectedCard:null,abilityData:{},currentTurn:0,skillUsed:false,restUsed:false};
      }else{
        nextGs={...gs,players:res.P,deck:res.D,discard:res.Disc,log:finalLog,phase:'ACTION',drawReveal:null,selectedCard:null,abilityData:{},currentTurn:0,skillUsed:false,restUsed:false};
      }
    }
    const tempGs={...gs,players:preDrawPlayers,deck:preDrawDeck,discard:preDrawDiscard,log:baseLog,phase:'ACTION',drawReveal:null,selectedCard:null,abilityData:{},currentTurn:0,skillUsed:false,restUsed:false};
    const split=splitAnimBoundLogs(res.effectMsgs||[]);
    const drawStep=res.drawnCard
      ? [{type:'DRAW_CARD',card:res.drawnCard,triggerName:'你',targetPid:0,msgs:split.preStat}]
      : [];
    const statQ=res.drawnCard
      ? bindAnimLogChunks(buildAnimQueue(tempGs,nextGs),{statLogs:split.stat}).filter(step=>step.type!=='DRAW_CARD')
      : [];
    setGs(tempGs);
    visualStateLocks.lock({players:preDrawPlayers,zhuLight:gs.zhuLight||null});
    triggerAnimQueue([...drawStep,...statQ],nextGs);
  }

  function nyaBorrow(deadPlayer){
    const P=copyPlayers(gs.players);
    const lv=P[0].godLevel||1;
    const penalty=GOD_DEFS.NYA.levels[Math.max(0,lv-1)].handPenalty;
    P[0]={...P[0],_nyaBorrow:deadPlayer.role,_nyaHandLimit:4-penalty};
    const borrowerName=gs._isMP?P[0].name:'你';
    const L=[...gs.log,`${borrowerName} 借用 ${deadPlayer.name} 的身份「${deadPlayer.role}」（本回合）`];
    // Now do the draw
    let D=[...gs.deck],Disc=[...gs.discard];
    const preDrawPlayers=copyPlayers(P);
    const preDrawDeck=[...D],preDrawDiscard=[...Disc];
    const res=playerDrawCard(P,D,Disc,0,gs);
    finishNyaBorrowDraw(res,L,preDrawPlayers,preDrawDeck,preDrawDiscard);
  }

  function nyaSkip(){
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard];
    const preDrawPlayers=copyPlayers(P);
    const preDrawDeck=[...D],preDrawDiscard=[...Disc];
    const res=playerDrawCard(P,D,Disc,0,gs);
    finishNyaBorrowDraw(res,gs.log,preDrawPlayers,preDrawDeck,preDrawDiscard);
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
    const {players:P,discarded}=discardCardsFromHand(baseGs.players,0,selected);

    const result=resolvePostDiscardEndTurn(baseGs,{
      playersAfterDiscard:P,
      discarded,
      logPrefix:'弃置',
      advanceTurn:startNextTurn,
    });

    // 停止多人弃牌倒计时
    const shouldStopEndTurnDiscardTimer=!!(baseGs._isMP&&baseGs.abilityData?.fromEndTurn);
    const handLimitAfterDiscard=getHandLimitForPlayer(result.postDiscardGs.players[0]);
    const endTurnDiscardResolved=shouldStopEndTurnDiscardTimer&&result.postDiscardGs.players[0].hand.length<=handLimitAfterDiscard;
    if(endTurnDiscardResolved){
      setGs(prev=>prev?{...prev,_mpEndTurnDiscardResolved:true}:prev);
    }

    if(result.decision==='SCHEDULE_EVENTS'){
      kickoffEndTurnSeq(result.kickoffGs,{seedQueue:result.seedQueue});
      return;
    }
    if(result.newGs._isMP&&result.newGs.currentTurn!==0)broadcastMpStateBeforeLocalReplay(result.newGs);
    triggerAnimQueue(result.queue,result.newGs);
  }

  function doRest(){
    if(getRestActionBlockReason({phase,isBlocked,gs,player:gs.players?.[0]}))return;
    const d1=1+(Math.random()*6|0), d2=1+(Math.random()*6|0);
    const heal=Math.max(d1,d2);

    const result=resolveRestTurnEnd(gs,{
      d1,d2,heal,effectiveHandLimit,actorIndex:0,advanceTurn:startNextTurn,
    });

    switch(result.decision){
      case 'WIN':
        setGs(result.gs);
        return;
      case 'DISCARD_PHASE':
        triggerAnimQueue(result.queue,result.pendingGs);
        return;
      case 'SCHEDULE_EVENTS':
        kickoffEndTurnSeq(result.afterRest,{seedQueue:result.seedQueue});
        return;
      case 'APPLY_NEXT_TURN':
        triggerAnimQueue(result.queue,null,()=>applyNextTurnGs(result.nextGs));
        return;
      default:
        return;
    }
  }

  function markTurnDrawInspectionEventsSeen(events=[]){
    const seqs=(Array.isArray(events)?events:[]).map(ev=>ev?.seq||0).filter(Boolean);
    if(seqs.length)lastInspectionSeqRef.current=Math.max(lastInspectionSeqRef.current,...seqs);
  }

  function splitGodEncounterReplayLogs(effectMsgs=[]){
    const logs=(Array.isArray(effectMsgs)?effectMsgs:[]).filter(line=>typeof line==='string'&&line.length);
    const inspectionStart=logs.findIndex(line=>line.includes('的SAN检定结果为'));
    if(inspectionStart<0)return{encounterLogs:logs,inspectionLogs:[]};
    return{encounterLogs:logs.slice(0,inspectionStart),inspectionLogs:logs.slice(inspectionStart)};
  }

  function buildGodChoiceDrawInspectionQueue({oldGs,newGs,drawStep}){
    const inspectionResult=buildInspectionAwareAnimQueue(oldGs,newGs,{buildAnimQueue,copyPlayers});
    if(inspectionResult.inspectionEvents.length){
      lastInspectionSeqRef.current=Math.max(lastInspectionSeqRef.current,...inspectionResult.inspectionEvents.map(ev=>ev.seq||0));
    }
    const tail=(inspectionResult.queue||[]).filter(step=>
      !(step?.type==='DRAW_CARD'&&step.triggerName!=='检定牌')
    );
    return[drawStep,...tail];
  }

  function buildAppTurnStartDrawReplay(newGs,{oldGs=gs,effectOldGs=null,timedOutDrawDiscardStep=null}={}){
    const replayOldGs=oldGs&&lastInspectionSeqRef.current>(oldGs._inspectionSeq||0)
      ?{...oldGs,_inspectionSeq:lastInspectionSeqRef.current}
      :oldGs;
    const replay=buildTurnStartDrawReplayQueue({
      oldGs:replayOldGs,
      newGs,
      effectOldGs,
      timedOutDrawDiscardStep,
      buildQueue:buildAnimQueue,
      buildFullHandSwapTransferQueue:buildFullHandSwapTransferQueueFromLogs,
    });
    const replayWithSphinx=injectTurnStartSphinxReveal(replay,newGs);
    markTurnDrawInspectionEventsSeen(replayWithSphinx.inspectionEvents);
    return replayWithSphinx;
  }

  function isTurnStartSphinxRevealState(state,sphinxReveal){
    if(!state||!sphinxReveal)return false;
    const drawnCard=getTurnStartDrawnCard(state);
    return !!drawnCard&&(drawnCard.type==='sphinxGuess'||drawnCard.name==='斯芬克斯');
  }

  function buildSphinxRevealAnimSteps(sphinxReveal,logs=[]){
    return buildSphinxResultQueue({
      card:sphinxReveal?.card,
      actorIdx:sphinxReveal?.actorIdx,
      guessCorrect:!!sphinxReveal?.guessCorrect,
      msgs:logs,
    });
  }

  function injectTurnStartStepsAfterDrawCard(queue=[],steps=[]){
    if(!steps.length)return queue;
    const drawIdx=queue.findIndex(step=>step?.type==='DRAW_CARD'&&step.triggerName!=='斯芬克斯');
    if(drawIdx<0)return [...queue,...steps];
    const idx=queue.findIndex((step,stepIdx)=>stepIdx>drawIdx&&step?.type==='CARD_TRANSFER'&&step.effect==='draw');
    if(idx<0)return [...queue.slice(0,drawIdx+1),...steps,...queue.slice(drawIdx+1)];
    return [...queue.slice(0,idx),...steps,...queue.slice(idx)];
  }

  function injectTurnStartSphinxReveal(replay,state){
    const sphinxReveal=state?._animSphinxReveal;
    if(!replay||!isTurnStartSphinxRevealState(state,sphinxReveal))return replay;
    const steps=buildSphinxRevealAnimSteps(sphinxReveal,state?.log||[]);
    if(!steps.length)return replay;
    return{
      ...replay,
      drawEffectQ:[...(replay.drawEffectQ||[]),...steps],
      queue:injectTurnStartStepsAfterDrawCard(replay.queue||[],steps),
      startQueue:injectTurnStartStepsAfterDrawCard(replay.startQueue||[],steps),
    };
  }

  function hideTurnStartDecisionForReplay(prev,replay,newGs){
    if(!prev)return prev;
    const replayPlayers=replay?.visualLock?.players||replay?.beforeDrawPlayers||newGs?._playersBeforeThisDraw;
    return{
      ...prev,
      ...(replayPlayers?{players:copyPlayers(replayPlayers)}:{}),
      ...(newGs?{discard:getVisualDiscardForState(newGs)}:{}),
      ...(replay?.visualLock?.zhuLight!==undefined?{zhuLight:replay.visualLock.zhuLight}:{}),
      phase:'ACTION',
      drawReveal:null,
      abilityData:{},
    };
  }

  function withTurnStartActorLabel(replay,state,{actorName=null,forceActorName=false}={}){
    if(!replay)return replay;
    const drawerPid=replay.drawerPid??getTurnStartDrawerIdx(state);
    const displayName=actorName||state?.players?.[drawerPid]?.name||replay.drawerName||'???';
    if(!forceActorName)return replay;
    const labelTurnStartStep=step=>step?.type==='YOUR_TURN'
      ?{...step,name:displayName}
      :step;
    const labelDrawCardStep=step=>step?.type==='DRAW_CARD'&&step===replay.drawCardStep
      ?{...step,triggerName:displayName,targetPid:drawerPid}
      :step;
    const labelStep=step=>labelDrawCardStep(labelTurnStartStep(step));
    const queue=(replay.queue||[]).map(labelStep);
    const startQueue=(replay.startQueue||[]).map(labelStep);
    return{
      ...replay,
      drawerName:displayName,
      turnStartStep:replay.turnStartStep?labelStep(replay.turnStartStep):replay.turnStartStep,
      drawCardStep:replay.drawCardStep?labelStep(replay.drawCardStep):replay.drawCardStep,
      queue,
      startAnim:replay.startAnim?labelStep(replay.startAnim):replay.startAnim,
      startQueue,
    };
  }

  function buildActorTurnStartReplay(state,{oldGs=gs,effectOldGs=null,actorName=null,forceActorName=false,timedOutDrawDiscardStep=null}={}){
    const skippedTurnQueue=buildSkippedTurnReplayQueue(state,{buildQueue:buildAnimQueue});
    const replayOldGs=oldGs
      ?{...oldGs,_statEventSeq:statEventSeqBeforeTurnStartStats(state,oldGs._statEventSeq||0)}
      :oldGs;
    const replayEffectOldGs=effectOldGs
      ?{...effectOldGs,_statEventSeq:statEventSeqBeforeTurnStartStats(state,effectOldGs._statEventSeq||0)}
      :effectOldGs;
    const replay=withTurnStartActorLabel(
      buildAppTurnStartDrawReplay(state,{oldGs:replayOldGs,effectOldGs:replayEffectOldGs,timedOutDrawDiscardStep}),
      state,
      {actorName,forceActorName}
    );
    if(replay?.queue?.length)return skippedTurnQueue.length
      ?{...replay,queue:[...skippedTurnQueue,...replay.queue],startAnim:skippedTurnQueue[0],startQueue:[...skippedTurnQueue.slice(1),...replay.queue]}
      :replay;
    const fallbackName=actorName||state?.players?.[state?.currentTurn]?.name||'???';
    const introQueue=buildTurnStartIntroQueue(state,fallbackName);
    const queueBase=introQueue.length||!(state?._turnStartLogs||[]).length
      ?introQueue
      :[{type:'YOUR_TURN',name:fallbackName,msgs:state._turnStartLogs}];
    const queue=[...skippedTurnQueue,...queueBase];
    return{
      ...(replay||{}),
      drawnCard:getTurnStartDrawnCard(state)||null,
      drawerPid:getTurnStartDrawerIdx(state),
      drawerName:fallbackName,
      queue,
      startAnim:queue[0]||null,
      startQueue:queue.slice(1),
      visualLock:queue.some(step=>step?.type==='VISUAL_LOCK')
        ?{players:state?._preTurnPlayers||state?._playersBeforeThisDraw,zhuLight:oldGs?.zhuLight||state?.zhuLight||null}
        :replay?.visualLock||null,
      inspectionEvents:replay?.inspectionEvents||[],
    };
  }

  function buildQueuedNextAiTurnStartReplay(nextGs,{fromTurn=null,playersBeforeDraw=null,statEventSeq=null}={}){
    if(!nextGs||nextGs.gameOver)return [];
    if(!isAiSeat(nextGs,nextGs.currentTurn))return [];
    if(fromTurn!=null&&nextGs.currentTurn===fromTurn)return [];
    if(!(nextGs._turnStartLogs||[]).length&&!getTurnStartDrawnCard(nextGs))return [];
    const nextAiName=nextGs.players?.[nextGs.currentTurn]?.name||'???';
    const replayOldGs={
      ...nextGs,
      players:playersBeforeDraw||nextGs._playersBeforeThisDraw||nextGs.players,
      log:getTurnStartDrawBaselineLog(nextGs),
      _statEventSeq:statEventSeq??maxKnownStatEventSeq(nextGs),
      _inspectionSeq:lastInspectionSeqRef.current,
      _visualEvents:[],
    };
    const replay=buildActorTurnStartReplay(nextGs,{
      oldGs:replayOldGs,
      effectOldGs:replayOldGs,
      actorName:nextAiName,
      forceActorName:true,
    });
    logAiTurnStartDebug('buildQueuedNextAiTurnStartReplay',{
      fromTurn,
      toTurn:nextGs.currentTurn,
      name:nextAiName,
      phase:nextGs.phase,
      turnStartLogs:nextGs._turnStartLogs,
      drawLogs:nextGs._drawLogs,
      drawnCard:getTurnStartDrawnCard(nextGs)?.name||null,
      replayQueue:replay?.queue?.map(step=>step?.type)||[],
    });
    if(!replay?.queue?.length)return [];
    maskDiscardedTurnDrawUntilDiscardAnim(nextGs);
    const preTurnQ=buildTsathogguaSlimeGrantQueue(nextGs);
    const replayQueue=normalizeVisibleTurnStartQueue(replay.queue);
    return[
      ...preTurnQ,
      ...(replay.visualLock?[{type:'VISUAL_LOCK',...replay.visualLock}]:[]),
      ...replayQueue,
    ];
  }

  function normalizeVisibleTurnStartQueue(queue=[]){
    if(!Array.isArray(queue)||!queue.length)return [];
    const turnIdx=queue.findIndex(step=>step?.type==='YOUR_TURN');
    if(turnIdx<=0)return queue;
    const leadingLocks=queue.slice(0,turnIdx).filter(step=>step?.type==='VISUAL_LOCK');
    const visibleBeforeTurn=queue.slice(0,turnIdx).filter(step=>step?.type!=='VISUAL_LOCK');
    return [
      ...leadingLocks,
      queue[turnIdx],
      ...visibleBeforeTurn,
      ...queue.slice(turnIdx+1),
    ];
  }

  function markQueuedAiTurnStartReplayShown(nextGs,queue=[]){
    if(!Array.isArray(queue)||!shouldReplaySinglePlayerAiTurnStart(nextGs))return nextGs;
    const introShown=queue.some(step=>step?.type==='YOUR_TURN'||step?.type==='DRAW_CARD');
    if(!introShown)return nextGs;
    return{
      ...nextGs,
      _aiTurnIntroShown:true,
      ...(queue.some(step=>step?.type==='DISCARD')?{_aiTurnDiscardShown:true}:{}),
    };
  }

  function buildSinglePlayerAiTurnStartReplay(nextGs){
    const replayContext=buildSinglePlayerAiTurnStartReplayContext(gs,nextGs);
    if(!replayContext)return null;
    const replay=buildActorTurnStartReplay(nextGs,{
      oldGs:replayContext.oldGs,
      effectOldGs:replayContext.effectOldGs,
      actorName:replayContext.actorName,
      forceActorName:true,
    });
    logAiTurnStartDebug('applyNextTurnGs:ai-branch',{
      fromTurn:gs?.currentTurn,
      toTurn:nextGs.currentTurn,
      name:replayContext.actorName,
      phase:nextGs.phase,
      turnStartLogs:nextGs._turnStartLogs,
      hasPlayersBeforeThisDraw:!!nextGs._playersBeforeThisDraw,
      drawnCard:nextGs._drawnCard?.name||nextGs.drawReveal?.card?.name||nextGs.abilityData?.godCard?.name||null,
      drawLogs:nextGs._drawLogs,
      replayDrawnCard:replay.drawnCard?.name||null,
      replayQueue:replay.queue.map(step=>step?.type),
    });
    return replay?.queue?.length
      ? {...replay,queue:normalizeVisibleTurnStartQueue(replay.queue),startQueue:normalizeVisibleTurnStartQueue(replay.startQueue)}
      : null;
  }

  // 拉莱耶之主(CTH) 在翻面结束/跳过回合时的强制摸牌：参考"无尽通道"的同步方式，
  // 构建一个 endlessCorridorReplay 视觉事件，让联机远端能与本地同步播放整批摸牌动画。
  // 远端 buildMpRemoteReplayAction 会按 actorIdx/targetPid 旋转到正确座位，再衔接下家回合开始动画。
  function buildCthRestDrawReplayEvent({beforePlayers,beforeDiscard,zhuLight,actorName,cthDraws,cthDrawLogs,preSteps=[],statSteps=[]}){
    const draws=(Array.isArray(cthDraws)?cthDraws:[]).filter(Boolean);
    if(!draws.length)return null;
    const logs=Array.isArray(cthDrawLogs)?cthDrawLogs.filter(Boolean):[];
    // 远端按事件队列原样播放（不再经 localDisplayName 推导），故 triggerName 用 actor 真实昵称而非"你"。
    const triggerLabel=actorName||'你';
    const drawSteps=draws.map(card=>({
      type:'DRAW_CARD',card,triggerName:triggerLabel,targetPid:0,
      msgs:logs.filter(l=>l.includes(card.name)||(card.key&&l.includes(card.key))),
    }));
    return createEndlessCorridorReplayEvent({
      actorIdx:0,
      actorName:actorName||'你',
      queue:[
        ...(Array.isArray(preSteps)?preSteps:[]),
        makeCthRlyehDreamStep(0,logs),
        ...drawSteps,
        ...(Array.isArray(statSteps)?statSteps:[])
      ],
      msgs:logs,
      beforePlayers:copyPlayers(beforePlayers||[]),
      beforeDiscard:[...(beforeDiscard||[])],
      zhuLight:zhuLight||null,
    });
  }

  // 把 CTH 摸牌事件附加到 nextGs 上并提前广播给远端（本地仍按既有队列播放）。
  // 广播副本里清掉 _cthRestDraws 等字段，避免远端走旧的、写死 targetPid:0 的分支。
  function broadcastCthRestDrawReplay(nextGs,event){
    if(!nextGs?._isMP||!event)return false;
    return broadcastMpStateBeforeLocalReplay({
      ...nextGs,
      _cthRestDraws:null,_cthRestDrawLogs:null,_playersBeforeCthDraws:null,
      _visualEvents:[event,...(Array.isArray(nextGs._visualEvents)?nextGs._visualEvents:[])],
    });
  }

  // 多人游戏：当下一回合是他人时，为当前玩家播放翻牌动画（否则他们的本地 gs 更新无动画）
  function broadcastMpStateBeforeLocalReplay(nextGs){
    if(!nextGs?._isMP||!isMultiplayer||!socketRef.current||!roomModal?.roomId)return false;
    // PLAYER_WIN_PENDING is local-winner UI. Remote viewers must receive the
    // same replay events on MP_PLAYER_WIN_WAIT, otherwise they render their own
    // confirmable treasure map instead of waiting for the actual winner.
    const replayState=nextGs.phase==='PLAYER_WIN_PENDING'?buildPlayerWinWaitState(nextGs):nextGs;
    const hasVisualEvents=Array.isArray(replayState._visualEvents)&&replayState._visualEvents.length>0;
    if((replayState.gameOver&&!hasVisualEvents)||replayState.phase==='TREASURE_WIN')return false;
    const broadcastGs=hasVisualEvents?pruneConsumedVisualEvents(replayState,consumedVisualEventIdsRef.current):replayState;
    const freshVisualEvents=Array.isArray(broadcastGs._visualEvents)?broadcastGs._visualEvents:[];
    if(freshVisualEvents.length){
      markConsumedVisualEvents(consumedVisualEventIdsRef.current,freshVisualEvents);
    }
    socketRef.current.emit('mpStateSync',{roomId:roomModal.roomId,gs:derotateGs(broadcastGs,myPlayerIndexRef.current)});
    suppressNextBroadcastRef.current=true;
    return true;
  }

  function applyNextTurnGs(newGs){
    // Phase C：进入下家回合即结束本回合的事件序列。清空游标，确保任何中途中止（如摸牌触发胜负）
    // 都不会遗留过期 ref，下个回合的合法 finishCthRestDraws/continueEndTurnReplay 不会被误判为续跑。
    endTurnSeqRef.current=null;
    // [EQ-DEBUG]
    try{ if((newGs?._visualEvents||[]).some(e=>e?.type==='earthquake')||newGs?.drawReveal?.card?.type==='allDiscard') console.log('[EQ-DEBUG] applyNextTurnGs: currentTurn=',newGs.currentTurn,'phase=',newGs.phase,'drawCard=',newGs?.drawReveal?.card?.name,'visualEvents=',(newGs._visualEvents||[]).map(e=>e?.type)); }catch{ /* noop */ }
    // Guard: never overwrite win/pending-win state
    if(newGs&&(newGs.phase==='PLAYER_WIN_PENDING'||newGs.phase==='TREASURE_WIN'))return setGs(p=>p?.gameOver||p?.phase==='PLAYER_WIN_PENDING'||p?.phase==='TREASURE_WIN'?p:newGs);
    // Animate CTH rest-draw forced cards that accumulated during startNextTurn
    if(newGs?._cthRestDraws?.length>0){
      const preTurnQ=buildTsathogguaSlimeGrantQueue(newGs);
      const dreamStep=makeCthRlyehDreamStep(0,newGs._cthRestDrawLogs||[]);
      const cthQueue=newGs._cthRestDraws.map(card=>({
        type:'DRAW_CARD',card,triggerName:'你',targetPid:0,
        msgs:newGs._cthRestDrawLogs?.filter(l=>l.includes(card.name)||l.includes(card.key))||[]
      }));
      const statQ=bindAnimLogChunks(
        buildAnimQueue({...gs,players:newGs._playersBeforeCthDraws||gs.players},newGs),
        {statLogs:newGs._cthRestDrawLogs||[]}
      );
      const cleanedGs={...newGs,_cthRestDraws:null,_cthRestDrawLogs:null,_playersBeforeCthDraws:null};
      if(newGs._isMP){
        // 翻面跳过回合触发的 CTH 摸牌：用 endlessCorridorReplay 事件广播，远端按 actor 座位旋转后播放，
        // 再衔接下家回合开始动画（替代远端写死 targetPid:0 的 _cthRestDraws 分支）。
        const cthEvent=buildCthRestDrawReplayEvent({
          beforePlayers:newGs._playersBeforeCthDraws||gs.players,
          beforeDiscard:gs.discard,
          zhuLight:gs.zhuLight||newGs.zhuLight||null,
          actorName:newGs._playersBeforeCthDraws?.[0]?.name||gs.players?.[0]?.name||'你',
          cthDraws:newGs._cthRestDraws,
          cthDrawLogs:newGs._cthRestDrawLogs,
          preSteps:preTurnQ,
        });
        if(!cthEvent||!broadcastCthRestDrawReplay(newGs,cthEvent))broadcastMpStateBeforeLocalReplay(newGs);
      }
      triggerAnimQueue([...preTurnQ,dreamStep,...cthQueue,...statQ],cleanedGs);
      return;
    }
    const drawStatQ=newGs?bindAnimLogChunks(
      buildAnimQueue({...gs,players:newGs._playersBeforeThisDraw||gs.players},newGs),
      {statLogs:newGs._statLogs}
    ):[];
    const preTurnQ=buildTsathogguaSlimeGrantQueue(newGs);
    const aiTurnStartReplay=buildSinglePlayerAiTurnStartReplay(newGs);
    if(aiTurnStartReplay){
      if(aiTurnStartReplay.visualLock)visualStateLocks.lock(aiTurnStartReplay.visualLock);
      maskDiscardedTurnDrawUntilDiscardAnim(newGs);
      const introShownGs={
        ...newGs,
        _aiTurnIntroShown:true,
        ...(aiTurnStartReplay.queue.some(step=>step?.type==='DISCARD')?{_aiTurnDiscardShown:true}:{}),
      };
      setGs(prev=>prev?{...prev,phase:'ACTION',drawReveal:null,abilityData:{}}:prev);
      triggerAnimQueue([...preTurnQ,...aiTurnStartReplay.queue],introShownGs);
      return;
    }
    if(newGs?.phase==='NYA_BORROW'&&Array.isArray(newGs._turnStartLogs)&&newGs._turnStartLogs.length){
      const introQ=buildTurnStartIntroQueue(newGs,newGs.players?.[newGs.currentTurn]?.name||'???');
      if(introQ.length){
        pendingGsRef.current=newGs;
        setGs(prev=>prev?{...prev,phase:'ACTION',drawReveal:null,abilityData:{}}:prev);
        triggerAnimQueue([...preTurnQ,...introQ],newGs);
        return;
      }
    }
    const pendingZhuHideCard=getPendingZhuHideCardForState(newGs);
    if(pendingZhuHideCard&&newGs.phase!=='ZHU_HIDE_AI_DRAW'){
      const drawerPid=getTurnStartDrawerIdx(newGs);
      const drawerName=newGs.players?.[drawerPid]?.name||'???';
      const queue=[...preTurnQ,...buildTurnStartIntroQueue(newGs,drawerName)];
      if(newGs._isMP)broadcastMpStateBeforeLocalReplay(newGs);
      if(queue.length){
        pendingGsRef.current=newGs;
        if(newGs._playersBeforeThisDraw){
          visualStateLocks.lock({players:newGs._playersBeforeThisDraw,zhuLight:gs.zhuLight||newGs.zhuLight||null});
        }
        setGs(prev=>prev?{...prev,phase:'ACTION',drawReveal:null,abilityData:{}}:prev);
        triggerAnimQueue(queue,newGs);
        return;
      }
      setGs(newGs);
      return;
    }
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
      const replay=buildActorTurnStartReplay(newGs,{
        oldGs:gs,
        effectOldGs:{...gs,players:newGs._playersBeforeThisDraw||gs.players},
        actorName:aiName,
        forceActorName:true,
      });
      const usedReplay=!!(replay?.queue?.length);
      const queue=usedReplay
        ? replay.queue
        : [
          ...buildTurnStartIntroQueue(newGs,aiName),
          ...(newGs._drawnCard?[{type:'DRAW_CARD',card:newGs._drawnCard,triggerName:aiName,targetPid:newGs.currentTurn,msgs:newGs._drawLogs}]:[]),
          ...drawStatQ,
        ];
      if(queue.length){
        if(replay?.visualLock)visualStateLocks.lock(replay.visualLock);
        else if(newGs._playersBeforeThisDraw&&newGs._drawnCard)visualStateLocks.lock({players:newGs._playersBeforeThisDraw,zhuLight:gs.zhuLight||newGs.zhuLight||null});
        if(usedReplay)maskDiscardedTurnDrawUntilDiscardAnim(newGs);
        triggerAnimQueue([...preTurnQ,...queue],newGs);
        return;
      }
    }
    if(newGs.currentTurn===0){
      const playerTurnStartMsgs=newGs._turnStartLogs||[];
      const localTurnDrawReplay=(
        newGs.drawReveal?.card||
        (newGs.phase==='GOD_CHOICE'&&newGs.abilityData?.godCard)
      )
        ?buildAppTurnStartDrawReplay(newGs,{oldGs:gs,effectOldGs:{...gs,players:newGs._playersBeforeThisDraw||gs.players}})
        :null;
      if(localTurnDrawReplay?.drawnCard){
        pendingGsRef.current=newGs;
        if(localTurnDrawReplay.visualLock)visualStateLocks.lock(localTurnDrawReplay.visualLock);
        maskDiscardedTurnDrawUntilDiscardAnim(newGs);
        setGs(prev=>hideTurnStartDecisionForReplay(prev,localTurnDrawReplay,newGs));
        triggerAnimQueue([...preTurnQ,...localTurnDrawReplay.queue],newGs);
        return;
      }
      if(playerTurnStartMsgs.length&&newGs.phase==='ACTION'&&drawStatQ.length){
        pendingGsRef.current=newGs;
        animQueueRef.current=[...drawStatQ];
        setGs(prev=>prev?{...prev,phase:'ACTION',drawReveal:null,abilityData:{}}:prev);
        triggerAnimQueue([...preTurnQ,{type:'YOUR_TURN',msgs:playerTurnStartMsgs},...drawStatQ],newGs);
        return;
      }
    }
    if(['FIRST_COME_PICK_SELECT','DAMAGE_LINK_SELECT_TARGET','CAVE_DUEL_SELECT_TARGET','PEEK_HAND_SELECT_TARGET','ROSE_THORN_SELECT_TARGET','SAME_ABYSS_SELECT','SPHINX_GUESS','GRAVE_DIG_SELECT','BURY_ALIVE_SELECT','TSG_SLIME_BALANCE'].includes(newGs.phase)&&newGs._drawnCard){
      const drawerName=newGs.players[newGs.currentTurn]?.name||'???';
      const drawerPid=newGs.currentTurn;
      const replay=buildActorTurnStartReplay(newGs,{
        oldGs:gs,
        effectOldGs:{...gs,players:newGs._playersBeforeThisDraw||gs.players},
        actorName:drawerName,
        forceActorName:drawerPid!==0,
      });
      pendingGsRef.current=newGs;
      animQueueRef.current=replay?.queue?.length?[...replay.queue]:[...drawStatQ];
      if(replay?.visualLock)visualStateLocks.lock(replay.visualLock);
      else if(newGs._playersBeforeThisDraw)visualStateLocks.lock({players:newGs._playersBeforeThisDraw,zhuLight:gs.zhuLight||newGs.zhuLight||null});
      if(replay?.queue?.length)maskDiscardedTurnDrawUntilDiscardAnim(newGs);
      setGs(prev=>prev?{...prev,phase:'ACTION',drawReveal:null,abilityData:{}}:prev);
      if(newGs._isMP&&newGs.currentTurn!==0)broadcastMpStateBeforeLocalReplay(newGs);
      triggerAnimQueue(
        replay?.queue?.length
          ?[...preTurnQ,...replay.queue]
          :[...preTurnQ,{type:'DRAW_CARD',card:newGs._drawnCard,triggerName:drawerName,targetPid:drawerPid,msgs:newGs._drawLogs},...drawStatQ],
        newGs
      );
      return;
    }
    if(newGs._isMP&&newGs.currentTurn!==0){
      const ph=newGs.phase;
      const drawnCard=ph==='GOD_CHOICE'?newGs.abilityData?.godCard:newGs.drawReveal?.card;
      // Also handle forced-card path (phase:'ACTION' but drawReveal.card set for animation)
      if(drawnCard&&(ph==='DRAW_REVEAL'||ph==='GOD_CHOICE'||ph==='DRAW_SELECT_TARGET'||ph==='ACTION')){
        const replay=buildAppTurnStartDrawReplay(newGs,{oldGs:gs,effectOldGs:{...gs,players:newGs._playersBeforeThisDraw||gs.players}});
        pendingGsRef.current=newGs;
        if(replay.visualLock)visualStateLocks.lock(replay.visualLock);
        maskDiscardedTurnDrawUntilDiscardAnim(newGs);
        broadcastMpStateBeforeLocalReplay(newGs);
        triggerAnimQueue([...preTurnQ,...replay.queue],newGs);
        return;
      }
    }
    // 处理强制触发牌的动画
    if(newGs.drawReveal?.card&&newGs.phase==='ACTION'){
      const drawerName=newGs.players[newGs.currentTurn]?.name||'???';
      const drawerPid=newGs.currentTurn;
      const replay=buildActorTurnStartReplay(newGs,{
        oldGs:gs,
        effectOldGs:{...gs,players:newGs._playersBeforeThisDraw||gs.players},
        actorName:drawerName,
        forceActorName:drawerPid!==0,
      });
      pendingGsRef.current=newGs;
      animQueueRef.current=replay?.queue?.length?[...replay.queue]:[...drawStatQ];
      if(replay?.visualLock)visualStateLocks.lock(replay.visualLock);
      else if(newGs._playersBeforeThisDraw)visualStateLocks.lock({players:newGs._playersBeforeThisDraw,zhuLight:gs.zhuLight||newGs.zhuLight||null});
      if(replay?.queue?.length)maskDiscardedTurnDrawUntilDiscardAnim(newGs);
      triggerAnimQueue(
        replay?.queue?.length
          ?[...preTurnQ,...replay.queue]
          :[...preTurnQ,{type:'DRAW_CARD',card:newGs.drawReveal.card,triggerName:drawerName,targetPid:drawerPid,msgs:newGs._drawLogs},...drawStatQ],
        newGs
      );
      return;
    }
    if(preTurnQ.length){
      triggerAnimQueue(preTurnQ,newGs);
      return;
    }
    setGs(newGs);
  }

  function endTurn(){
    if(isBlocked)return;
    const result=resolveEndTurn(gs,{
      effectiveHandLimit,
      actorIndex:0,
      advanceTurn:startNextTurn,
    });
    switch(result.decision){
      case END_TURN_DECISION.DISCARD:
        setGs(result.gs);
        return;
      case END_TURN_DECISION.SCHEDULE_EVENTS:
        kickoffEndTurnSeq(result.baseGs);
        return;
      case END_TURN_DECISION.APPLY_NEXT_TURN:
        applyNextTurnGs(result.newGs);
        return;
      default:
        return;
    }
  }
  endTurnRef.current=endTurn;

  function autoDiscardFromRight(){
    // 多人弃牌超时：从右侧弃牌直到不超限，然后进入下一回合
    const limit=effectiveHandLimit;
    const count=Math.max(0,(gs.players?.[0]?.hand?.length||0)-limit);
    const {players:P,discarded}=discardCardsFromHandFromRight(gs.players,0,count);

    const result=resolvePostDiscardEndTurn(gs,{
      playersAfterDiscard:P,
      discarded,
      logPrefix:'(超时) 弃置',
      advanceTurn:startNextTurn,
      mpEndTurnDiscardResolved:true,
    });

    if(result.decision==='SCHEDULE_EVENTS'){
      kickoffEndTurnSeq(result.kickoffGs,{seedQueue:result.seedQueue});
      return;
    }
    if(result.newGs._isMP&&result.newGs.currentTurn!==0)broadcastMpStateBeforeLocalReplay(result.newGs);
    triggerAnimQueue(result.queue,result.newGs);
  }
  autoDiscardRef.current=autoDiscardFromRight;

  function startNewGame({skipTutorialPrompt=false}={}){
    setShowFullLog(false);
    const debugTutorialPromptModeForNext=activeDebugConfig.debugTutorialPromptMode;
    if(!skipTutorialPrompt)resetSoftGuidesForNextSolo(debugTutorialPromptModeForNext);
    const shouldShowTutorialPrompt=!skipTutorialPrompt&&(
      debugTutorialPromptModeForNext==='show'
        ? true
        : debugTutorialPromptModeForNext==='hide'
          ? false
          : !tutorialDone
    );
    if(!skipTutorialPrompt&&debugTutorialPromptModeForNext!=='default'){
      setDebugTutorialPromptMode('default');
    }
    if(shouldShowTutorialPrompt){setTutorialStep(1);setShowTutorial(true);return;}
    _doStartNewGame();
  }
  function _doStartNewGame(silent=false){
    setPendingSoftGuideId(null);
    softGuidePrevPlayersRef.current=null;
    queuedSoftGuideIdRef.current=null;
    const shouldForceFirstExpansion=!silent&&!firstBattleStarted;
    if(shouldForceFirstExpansion){
      setFirstBattleStarted(true);
      safeLS.set(FIRST_BATTLE_DONE_KEY,'1');
    }
    const resolvedExpansionKey=shouldForceFirstExpansion?'地神的潜影':activeDebugConfig.debugExpansionKey;
    const newGs=initGame(
      null,
      activeDebugConfig.debugForceCard,
      activeDebugConfig.debugForceCardTarget,
      activeDebugConfig.debugForceCardKeep,
      activeDebugConfig.debugForceCardType,
      activeDebugConfig.debugForceZoneCardKey,
      activeDebugConfig.debugForceZoneCardName,
      activeDebugConfig.debugForceGodCardKey,
      startNextTurn,
      resolvedExpansionKey,
      { roleCounts: getDebugRoleComposition(activeDebugConfig.debugRoleCompositionKey).counts },
    );
    roseThornPrevRef.current=null;
    consumedVisualEventIdsRef.current=new Set();
    animQueueRef.current=[];
    pendingGsRef.current=null;
    setAnimExiting(false);
    clearDamageAnimations();
    setShowGodResurrection(false); // reset for next game
    if(silent){
      // Tutorial preview: set game state immediately, no animation, no pending draw
      setAnim(null);
      syncVisibleLog(newGs.log||[]);
      setGs({...newGs,phase:'ACTION',drawReveal:null});
      return;
    }
    // Normal start: show game board immediately as background, then ask for role before reveal
    syncVisibleLog(newGs.log||[]);
    setGs(maskOpeningTurnStartDrawForDisplay(newGs));
    setAnim(null);
    setPendingRoleSelection(newGs);
  }
  function maskOpeningTurnStartDrawForDisplay(state){
    if(!state)return state;
    const replayPlayers=state._playersBeforeThisDraw||state._preTurnPlayers||state.players;
    return{
      ...state,
      players:copyPlayers(replayPlayers||[]),
      phase:'ACTION',
      drawReveal:null,
      abilityData:{},
    };
  }
  function confirmRoleSelection(selectedRole){
    if(!pendingRoleSelection)return;
    const finalGs=applySelectedLocalRole(pendingRoleSelection,selectedRole);
    setPendingRoleSelection(null);
    setGs(prev=>prev?{...prev,...maskOpeningTurnStartDrawForDisplay(finalGs)}:prev);
    setRoleRevealAnim({role:finalGs.players[0].role,pendingGs:finalGs});
  }
  function returnToMainMenu(){
    if(isMultiplayer)return;
    setIsSoloPaused(false);
    roseThornPrevRef.current=null;
    consumedVisualEventIdsRef.current=new Set();
    animQueueRef.current=[];
    pendingGsRef.current=null;
    setAnim(null);
    setAnimExiting(false);
    clearCardTransferAnimations();
    setPendingRoleSelection(null);
    setGs(null);
  }
  function _onRoleRevealDone(pendingGs){
    setRoleRevealAnim(null);
    if(!pendingGs){
      mpOpeningRoleRevealPendingRef.current=false;
      return;
    } // tutorial path: game already set
    // [EQ-DEBUG] 地动山摇排查：开局/回合首抽进入 role-reveal 回放编排
    try{ if((pendingGs._visualEvents||[]).some(e=>e?.type==='earthquake')||pendingGs?.drawReveal?.card?.type==='allDiscard') console.log('[EQ-DEBUG] _onRoleRevealDone entry: isMP=',pendingGs._isMP,'currentTurn=',pendingGs.currentTurn,'phase=',pendingGs.phase,'drawCard=',pendingGs?.drawReveal?.card?.name,'visualEvents=',(pendingGs._visualEvents||[]).map(e=>e?.type)); }catch{ /* noop */ }
    // 开局时所有玩家的 pendingGs 已随 gameStart 广播过，
    // advanceQueue→setGs 不应再触发 useEffect 广播（否则非房主播完动画后会打断房主动画）
    receivedGsRef.current=true;
    if(pendingGs._isMP)suppressNextBroadcastRef.current=true;
    if(pendingGs._isMP&&getPendingZhuHideCardForState(pendingGs)&&pendingGs.phase!=='ZHU_HIDE_AI_DRAW'){
      const drawerPid=getTurnStartDrawerIdx(pendingGs);
      const drawerName=pendingGs.players?.[drawerPid]?.name||'???';
      if((pendingGs._turnStartLogs||[]).length){
        if(pendingGs._playersBeforeThisDraw){
          visualStateLocks.lock({players:pendingGs._playersBeforeThisDraw,zhuLight:gs.zhuLight||pendingGs.zhuLight||null});
        }
        triggerAnimQueue(buildTurnStartIntroQueue(pendingGs,drawerName),pendingGs);
      }else{
        setGs(pendingGs);
      }
      return;
    }
    // 多人游戏中非当前操作玩家：播「XX的回合」+ 翻牌动画（与当前玩家体验一致）
    if(pendingGs._isMP&&pendingGs.currentTurn!==0){
      const ph=pendingGs.phase;
      const drawnCard=ph==='GOD_CHOICE'
        ?pendingGs.abilityData?.godCard
        :pendingGs.drawReveal?.card;
      const drawerPid=getTurnStartDrawerIdx(pendingGs);
      const activeName=pendingGs.players[drawerPid]?.name||'???';
      if(drawnCard){
        const replay=buildAppTurnStartDrawReplay(pendingGs,{oldGs:gs,effectOldGs:{...gs,players:pendingGs._playersBeforeThisDraw||gs.players}});
        if(replay.visualLock)visualStateLocks.lock(replay.visualLock);
        maskDiscardedTurnDrawUntilDiscardAnim(pendingGs);
        // 遮蔽真实 phase，动画结束后 advanceQueue 再还原（与 applyNextTurnGs 同样模式）
        suppressNextBroadcastRef.current=true; // pendingGs 已广播过，advanceQueue 不再回传
        pendingGsRef.current=pendingGs;
        setGs({...pendingGs,phase:'ACTION',drawReveal:null,abilityData:{}});
        triggerAnimQueue(replay.queue,pendingGs);
      }else{
        triggerAnimQueue([{type:'YOUR_TURN',name:activeName,msgs:pendingGs._turnStartLogs}],pendingGs);
      }
      return;
    }
    const localDrawnCard=pendingGs.phase==='GOD_CHOICE'
      ?pendingGs.abilityData?.godCard
      :(pendingGs.drawReveal?.card||pendingGs._drawnCard||null);
    if(localDrawnCard){
      const replay=buildAppTurnStartDrawReplay(pendingGs,{oldGs:gs,effectOldGs:{...gs,players:pendingGs._playersBeforeThisDraw||gs.players}});
      // [EQ-DEBUG]
      try{ if((replay.queue||[]).some(s=>s.type==='EARTHQUAKE')||localDrawnCard?.type==='allDiscard') console.log('[EQ-DEBUG] _onRoleRevealDone localDraw: replay.drawnCard=',!!replay.drawnCard,'queue=',(replay.queue||[]).map(s=>s.type)); }catch{ /* noop */ }
      if(replay.drawnCard){
        if(replay.visualLock)visualStateLocks.lock(replay.visualLock);
        maskDiscardedTurnDrawUntilDiscardAnim(pendingGs);
        triggerAnimQueue(replay.queue,pendingGs);
      }else{
        const drawStatQ=bindAnimLogChunks(
          buildAnimQueue({...gs,players:pendingGs._playersBeforeThisDraw||gs.players},pendingGs),
          {statLogs:pendingGs._statLogs}
        );
        triggerAnimQueue([
          {type:'YOUR_TURN',msgs:pendingGs._turnStartLogs},
          {type:'DRAW_CARD',card:localDrawnCard,triggerName:'你',targetPid:0,msgs:pendingGs._drawLogs},
          ...drawStatQ
        ],pendingGs);
      }
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
    if(canPersistTutorial)safeLS.set(TUTORIAL_KEY,'1');
    setTutorialStep(1);
    _doStartNewGame();
  }
  function _startForTutorial(){
    const tutorialGs=createTutorialScenario('treasure');
    setPendingSoftGuideId(null);
    softGuidePrevPlayersRef.current=null;
    queuedSoftGuideIdRef.current=null;
    roseThornPrevRef.current=null;
    consumedVisualEventIdsRef.current=new Set();
    clearBattleAnimationState();
    setRoleRevealAnim(null);
    setShowGodResurrection(false);
    setShowFullLog(false);
    setSwapBlindDraw(null);
    setMobileArmedGodCardIdx(null);
    setTutorialStep(TUTORIAL_FLOW.INTRO);
    setShowTutorial(true);
    syncVisibleLog(tutorialGs.log||[]);
    setVisualDiscard(getVisualDiscardForState(tutorialGs));
    setDisplayStats((tutorialGs.players||[]).map(p=>({hp:p.hp,san:p.san})));
    setGs(tutorialGs);
  }

  function cancelAction(){
    if(committedTargetActionRef.current||gs.abilityData?.committedAction)return;
    // Restore roleRevealed to what it was before skill was triggered,
    // so aborting mid-skill does not permanently reveal the player's role.
    const prev=gs.abilityData?.preSkillRevealed??gs.players[0].roleRevealed;
    let P=copyPlayers(gs.players);
    P[0]={...P[0],roleRevealed:prev};
    if(gs.phase==='SWAP_GIVE_CARD'&&gs.abilityData.takenCard){
      // Return the card secretly taken from the target
      const takenIdx=P[0].hand.findIndex(card=>card?.id===gs.abilityData.takenCard?.id);
      if(takenIdx>=0)P[0].hand.splice(takenIdx,1);
      P[gs.abilityData.swapTi].hand.push(gs.abilityData.takenCard);
    }
    setGs({...gs,players:P,phase:'ACTION',abilityData:{}});
  }

  function revealWin(){
    if(gs?.phase==='TREASURE_WIN')localTreasureMapShownRef.current=true;
    clearBattleAnimationState();
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

  function handleTutorialTreasureMapConfirm(){
    clearBattleAnimationState();
    // 先停留在“宝藏完成”教学，身份切换放到 HUNTER_INTRO（带 setup: 'hunter'）时再执行
    setGs(prev=>{
      if(!prev)return prev;
      return {...prev,phase:'ACTION',abilityData:{},drawReveal:null};
    });
    setTutorialStep(TUTORIAL_FLOW.TREASURE_RESULT);
  }

  // Phase labels
  const isLocalDamageLinkSelect=!!gs&&isLocalDamageLinkSourcePhase(gs);
  const isLocalHuntRevealPrompt=phase==='HUNT_WAIT_REVEAL'&&!myTurn&&isLocalHuntTargetSeat(gs);
  const isDiscardPhaseResolving=phase==='DISCARD_PHASE'&&(!!anim||!!animExiting||!!pendingGsRef.current);
  const isDiscardPhasePromptActive=phase==='DISCARD_PHASE'&&!anim&&!animExiting&&!pendingGsRef.current;
  const pendingAfterDiscardGs=isDiscardPhaseResolving?pendingGsRef.current:null;
  const buryAliveTarget=getBuryAliveLocalPendingTarget(gs);
  const phaseUi=buildPhaseUiState({
    gs,
    phase,
    me,
    visualMe,
    currentTurnPlayer,
    effectiveHandLimit,
    isSpectating,
    softGuidePauseActive,
    anim,
    animExiting,
    animQueueLength:animQueueRef.current.length,
    hasPendingGs:!!pendingGsRef.current,
    pendingAfterDiscardGs,
    isDiscardPhaseResolving,
    isLocalHuntRevealPrompt,
    isScriptedTutorial,
    isBlocked,
    isVisualPlayerTurn,
    localCurrentTurn:myTurn,
    committedTargetAction:committedTargetActionRef.current,
    committedAction:!!gs.abilityData?.committedAction,
    local:{
      albinoCreature:isLocalSeatIndex(gs.abilityData?.playerIndex),
      buryAlive:isLocalSeatIndex(buryAliveTarget),
      caveDuel:isLocalCaveDuelCardDecisionPhase(gs),
      damageLinkSelect:isLocalDamageLinkSelect,
      decipherStone:isLocalSeatIndex(gs.abilityData?.playerIndex),
      drawDecision:isLocalDrawDecision,
      etherealizeDecision:isLocalSeatIndex(gs.abilityData?.targetIdx),
      etherealizeTarget:isLocalEtherealizeTargetPhase(gs),
      godChoice:isLocalGodChoice,
      graveDig:isLocalSeatIndex(gs.abilityData?.playerIndex),
      huntConfirm:isLocalHuntConfirmPhase(gs),
      huntTarget:isLocalHuntTargetSeat(gs),
      igniteTorch:isLocalSeatIndex(gs.abilityData?.playerIndex),
      nyaBorrow:isLocalNyaBorrowPhase(gs),
      sameAbyss:isLocalSameAbyssTargetPhase(gs),
      slimeBalance:isLocalSeatIndex(gs.abilityData?.targetIdx),
      sphinxGuess:isLocalSphinxGuessPhase(gs),
      swapGive:isLocalSwapGivePhase(gs),
      treasureDodge:isLocalTreasureDodgePhase(gs),
    },
  });
  const {
    cardHintText,
    canShowTurnDecisionModal,
    cancelable,
    canShowEndTurnButton,
    displayPhaseLabel,
    isPhaseWarningText,
    promptColors,
    showCancelBtn,
  }=phaseUi;
  const promptWarningTextColor=promptColors.warning;
  const promptActiveTextColor=promptColors.active;
  const promptCautionTextColor=promptColors.caution;
  const promptSafeTextColor=promptColors.safe;
  const promptMutedTextColor=promptColors.muted;
  const isSelfDeadPanelDimmed=!!(me?.isDead&&!me?._pendingAnimDeath);

  const canLocalTargetSelect=!!gs&&!isSpectating&&canLocalActOnTargetSelectionPhase(gs);
  const canLocalSwapGive=!!gs&&!isSpectating&&isLocalSwapGivePhase(gs);
  const canLocalBewitchCard=!!gs&&!isSpectating&&isLocalBewitchCardPhase(gs);
  const selectingOther=canLocalTargetSelect;


  function handleAIClick(pi){
    if(gs.players[pi].isDead||isBlocked)return;
    if(!canLocalTargetSelect)return;
    if(phase==='SWAP_SELECT_TARGET')swapSelectTarget(pi);
    else if(phase==='ZONE_SWAP_SELECT_TARGET')zoneSwapSelectTarget(pi);
    else if(phase==='SWAP_SELECT_TARGET_CARD'||phase==='SWAP_STEAL_CARD'){
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
    else if(phase==='ETHEREALIZE_SELECT_TARGET')etherealizeSelectTarget(pi);
    else if(phase==='MULTIPLY_SELECT_TARGET'){
      if(pi===0) return;
      committedTargetActionRef.current=true;
      setGs(p=>p&&p.phase==='MULTIPLY_SELECT_TARGET'?{...p,abilityData:{...(p.abilityData||{}),committedAction:'multiply'}}:p);
      let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard],baseLog=[...gs.log];
      const night=resolveApophisTarget({
        players:P,deck:D,discard:Disc,log:baseLog,actorIdx:0,selectedIdx:pi,
        legalTargets:P.map((p,i)=>i).filter(i=>i!==0&&!P[i].isDead),
        label:'选择【繁衍】目标'
      });
      P=night.players;D=night.deck;Disc=night.discard;baseLog=night.log;pi=night.targetIdx;
      if(!P[0].hand.some(isBlackGoatYoung)){
        committedTargetActionRef.current=false;
        setGs({...gs,phase:'ACTION',abilityData:{}});
        return;
      }
      const goatCard=createBlackGoatYoungCard();
      P[pi].hand.push(goatCard);
      const logMsg=`【繁衍】你将黑山羊幼仔传播给了 ${P[pi].name}`;
      const L=[...baseLog,logMsg];
      const proliferatingZPatch=appendPublicCardGainTriggers(gs,P,pi,goatCard);
      const newGs={...gs,players:P,deck:D,discard:Disc,log:L,phase:'ACTION',abilityData:{},multiplyUsed:true,...apophisNightPatch(night),...proliferatingZPatch};
      const queue=[
        cardTransferStep({fromPid:0,dest:'player',toPid:pi,count:1,effect:'blackGoat',durationMs:1500,msgs:[logMsg]}),
        statePatchStep({players:P}),
      ];
      if(newGs._isMP)broadcastMpStateBeforeLocalReplay(newGs);
      setGs(p=>p?{...p,phase:'ACTION',abilityData:{},multiplyUsed:true}:p);
      triggerAnimQueue(queue,newGs,()=>continueProliferatingZDraws(newGs));
    }
    else if(phase==='SHU_SELECT_TARGET'){
      const count=gs.abilityData?.shuOffspringCount||0;
      if(!count) { setGs({...gs,phase:'ACTION',abilityData:{}}); return; }
      const turnOwner=gs.abilityData?._turnOwner??gs.currentTurn;
      const resumeAiTurn=!gs._isMP&&isAiSeat(gs,turnOwner);
      const nextPhase=resumeAiTurn?'AI_TURN':'ACTION';
      committedTargetActionRef.current=true;
      setGs(p=>p&&p.phase==='SHU_SELECT_TARGET'?{...p,abilityData:{...(p.abilityData||{}),committedAction:'shuOffspring'}}:p);
      let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard],baseLog=[...gs.log];
      const night=resolveApophisTarget({
        players:P,deck:D,discard:Disc,log:baseLog,actorIdx:gs.abilityData?.shuChooserIdx??0,selectedIdx:pi,
        legalTargets:P.map((p,i)=>i).filter(i=>!P[i].isDead&&canGodPowerAffect(P[i])),
        label:'选择【黑暗子嗣】目标'
      });
      P=night.players;D=night.deck;Disc=night.discard;baseLog=night.log;pi=night.targetIdx;
      const goatCards=Array.from({length:count},()=>createBlackGoatYoungCard());
      P[pi].hand.push(...goatCards);
      const targetName=P[pi].name;
      const logMsg=`【黑暗子嗣】${targetName==='你'?'你':targetName} 获得${count}张黑山羊幼仔`;
      const L=[...baseLog,logMsg];
      const proliferatingZPatch=appendPublicCardGainTriggers(gs,P,pi,goatCards);
      const newGs={...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:turnOwner,phase:nextPhase,abilityData:{},...apophisNightPatch(night),...proliferatingZPatch};
      const baseQueue=buildAnimQueue(gs,newGs);
      const queue=baseQueue.length?[...baseQueue,statePatchStep({players:P})]:[];
      if(queue.length){
        if(newGs._isMP)broadcastMpStateBeforeLocalReplay(newGs);
        setGs(p=>p?{...p,currentTurn:turnOwner,phase:nextPhase,abilityData:{}}:p);
        triggerAnimQueue(queue,newGs);
      }else if((newGs.proliferatingZQueue||[]).length)continueProliferatingZDraws(newGs);
      else setGs(newGs);
    }
  }
  // Use a god card from hand: upgrade, worship, and convert are all allowed in ACTION.
  function worshipFromHand(idx){
    const godCard=me.hand[idx];if(!godCard||!godCard.isGod)return;
    setMobileArmedGodCardIdx(null);
    const godKey=godCard.godKey;
    const isUpgrade=me.godName===godKey&&(me.godLevel||0)<3;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard];
    P[0].hand.splice(idx,1);
    let L=[...gs.log];
    let inspectionMeta=makeInspectionMeta(gs);
    if(isUpgrade){
      L.push(buildWorshipFromHandLog('你',godCard,{upgrade:true,level:P[0].godLevel+1}));
    } else {
      L.push(buildWorshipFromHandLog('你',godCard));
    }
    if(isUpgrade){
      P[0].godLevel++;P[0].godZone.push({...godCard});
    } else if(P[0].godName&&P[0].godName!==godKey){
      const converted=convertGodFollower(0,gs.currentTurn,P,D,Disc,L,inspectionMeta,'改信新神，SAN-1，旧神牌入弃牌堆',godCard);
      P=converted.P;D=converted.D;Disc=converted.Disc;L=converted.L;inspectionMeta=converted.inspectionMeta;
      P[0].godName=godKey;P[0].godLevel=1;P[0].godZone=[{...godCard}];
    } else {
      P[0].godName=godKey;P[0].godLevel=1;P[0].godZone=[{...godCard}];
    }
    P[0].hasBelievedGod=true;
    if(['APO','ZHU','SHU'].includes(godKey)&&hasGodPowerImmunity(P[0])){
      L.push(buildGodPowerBlockedLog(P[0]));
    }
    // SHU: 进入目标选择阶段而非直接给牌
    const godPowerImmediateHand=canGodPowerAffect(P[0]);
    const isShuBlessingHand=godPowerImmediateHand&&godKey==='SHU';
    const shuOffspringCountHand=isShuBlessingHand?(GOD_DEFS.SHU.levels[P[0].godLevel-1]?.offspringCount||0):0;
    P.forEach((p,i)=>{if(i>0&&p.godName===godKey){const abandoned=abandonGodFollower(i,gs.currentTurn,P,D,Disc,L,inspectionMeta);P=abandoned.P;D=abandoned.D;Disc=abandoned.Disc;L=abandoned.L;inspectionMeta=abandoned.inspectionMeta;}});
    const win=checkWin(P,gs._isMP);
    const nextZhuLight=godPowerImmediateHand?buildZhuLight(P,D,0,gs.zhuLight):gs.zhuLight;
    const nextApophisNight=godPowerImmediateHand&&godKey==='APO'?getApophisNightForLevel(P[0].godLevel):gs.apophisNight;
    if(godPowerImmediateHand&&godKey==='APO')L.push(buildApophisNightLog());
    const blockedGodPowerEvent=(!godPowerImmediateHand&&['APO','ZHU','SHU'].includes(godKey)&&hasGodPowerImmunity(P[0]))
      ?createGodPowerBlockedEvent({playerIdx:0,playerName:P[0].name,msgs:[buildGodPowerBlockedLog(P[0])]})
      :null;
    const newGs={...gs,players:P,deck:D,discard:Disc,log:L,zhuLight:nextZhuLight,apophisNight:nextApophisNight,phase:isShuBlessingHand?'SHU_SELECT_TARGET':'ACTION',abilityData:isShuBlessingHand?{shuOffspringCount:shuOffspringCountHand,shuChooserIdx:0}:gs.abilityData,_visualEvents:blockedGodPowerEvent?[blockedGodPowerEvent]:[],...inspectionMeta,...(win?{gameOver:win}:{})};
    // 让"邪神之力"标签与"从手牌信仰"日志同时出现：把信仰后的神之力字段（及已离手的神牌）并入动画基线，
    // 使首个动画步骤的视觉快照就带上新神之力，而不是等到整段动画结束才刷新角色面板。
    const godBadgeBaseline=gs.players.map((p,i)=>i===0?{...p,hand:[...P[0].hand],godName:P[0].godName,godLevel:P[0].godLevel,godEncounters:P[0].godEncounters,godEncounterCount:P[0].godEncounterCount,godZone:P[0].godZone.map(c=>({...c}))}:p);
    previousGodStatusRef.current=godBadgeBaseline.map(p=>({godName:p?.godName||null,godLevel:p?.godLevel||0}));
    const oldGsForReplay={...gs,players:godBadgeBaseline};
    const replay=buildInspectionAwareAnimQueue(oldGsForReplay,newGs,{buildAnimQueue,copyPlayers});
    if(replay.inspectionEvents.length){
      lastInspectionSeqRef.current=Math.max(lastInspectionSeqRef.current,...replay.inspectionEvents.map(ev=>ev.seq||0));
    }
    const worshipMsg=L.slice(gs.log.length).find(line=>typeof line==='string'&&(line.includes('从手牌信仰')||line.includes('从手牌直接信仰')||line.includes('改信')));
    const queue=prepareWorshipHighlight(
      bindAnimLogChunks(replay.queue,splitAnimBoundLogs(L.slice(gs.log.length))),
      {targetPid:0,godKey,players:godBadgeBaseline,msgs:worshipMsg?[worshipMsg]:[]},
    );
    if(queue.length){
      // 先广播再播本地动画：远端凭 buildAnimQueue 自行重建日食(APOPHIS_ECLIPSE)等步骤，
      // 否则自动广播会等本地动画播完才发出，远端日食进度滞后整个动画时长
      broadcastMpStateBeforeLocalReplay(newGs);
      triggerAnimQueue(queue,newGs);
    }
    else setGs(newGs);
  }

  function canPlayerRespondWithZoneCard(card){
    return canRespondWithZoneCardByAvailability({
      phase,
      card,
      isLocalHuntWaitRevealTarget:!myTurn&&isLocalHuntTargetSeat(gs),
    });
  }

  function canPlayerRespondWithAnyHandCard(){
    const target=getBuryAliveLocalPendingTarget(gs);
    return canRespondWithAnyHandCardByAvailability({
      phase,
      isLocalCaveDuelTarget:isLocalCaveDuelCardDecisionPhase(gs),
      isBuryAliveTarget:isLocalSeatIndex(target),
      isIgniteTorchPlayer:isLocalSeatIndex(gs.abilityData?.playerIndex),
    });
  }
  function canPlayerRespondWithFireHandCard(){
    return canRespondWithFireHandCardByAvailability({
      phase,
      isAlbinoCreaturePlayer:isLocalSeatIndex(gs.abilityData?.playerIndex),
    });
  }

  function handleMyCardClick(idx){
    if(isBlocked)return;
    const clickedCard=me.hand[idx];
    if(showTutorial&&tutorialStepDef){
      if(!canUseTutorialHandCard({
        canLocalSwapGive,
        canLocalBewitchCard,
        isLocalHuntConfirm:isLocalHuntConfirmPhase(gs),
        isTutorialActionAllowed,
        card:clickedCard,
      }))return;
    }
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
    else if(phase==='BURY_ALIVE_SELECT'&&canPlayerRespondWithAnyHandCard()){
      toggleBuryAliveSelect(idx);
    }
    else if(phase==='IGNITE_TORCH_DISCARD'&&canPlayerRespondWithAnyHandCard()){
      toggleIgniteTorchSelect(idx);
    }
    else if(phase==='ALBINO_CREATURE_SELECT_CARD'&&canPlayerRespondWithFireHandCard()){
      albinoCreatureSelectCard(idx);
    }
    else if(isLocalCaveDuelCardDecisionPhase(gs)){
      caveDuelSelectCard(idx, clickedCard);
    }
    else if(canPlayerRespondWithAnyHandCard()){
      caveDuelSelectCard(idx, clickedCard);
    }
    else if(phase==='ACTION'&&isLocalCurrentTurn(gs)&&!isBlocked){
      const c=me.hand[idx];
      if(c&&c.isGod){
        const isUpgrade=me.godName===c.godKey&&(me.godLevel||0)<3;
        const canWorshipFromHand=!isUpgrade;
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
    const huntTi=gs.abilityData?.huntTi;
    const targetPlayer=gs.players[huntTi];
    return canClickHandCardByAvailability({
      phase,
      card:c,
      cardIndex:idx,
      isBlocked,
      showTutorial,
      tutorialStepActive:!!tutorialStepDef,
      tutorialHandCardAllowed:canUseTutorialHandCard({
        canLocalSwapGive,
        canLocalBewitchCard,
        isLocalHuntConfirm:isLocalHuntConfirmPhase(gs),
        isTutorialActionAllowed,
        card:c,
      }),
      canLocalSwapGive,
      canLocalBewitchCard,
      localCurrentTurn:isLocalCurrentTurn(gs),
      selectedDiscardIndices:gs.abilityData.discardSelected||[],
      handSize:me.hand.length,
      effectiveHandLimit,
      isLocalHuntConfirm:isLocalHuntConfirmPhase(gs),
      revealedHuntCard:gs.abilityData?.revCard,
      canRespondZoneCard:canPlayerRespondWithZoneCard(c),
      isLocalPublicCardPick:isLocalPublicCardPickPhase(gs),
      publicHandSize:targetPlayer?.hand?.length||0,
      caveDuelSourceTurn:isLocalCaveDuelCardDecisionPhase(gs),
      canRespondAnyHandCard:canPlayerRespondWithAnyHandCard(),
      canRespondFireHandCard:canPlayerRespondWithFireHandCard(),
      fireCardIds:gs.abilityData?.fireCardIds||[],
      isVisualPlayerTurn,
    });
  }

  const skillLimited=gs.skillUsed&&skillRi.skillLimited;
  const battleBackgroundStyle=getBattleBackgroundStyle(gs.expansionKey,isMobile);
  const drawBackgroundCameraActive=anim?.type==='DRAW_BACKGROUND_CAMERA_PRE'||(anim?.type==='DRAW_CARD'&&!anim?.card?.effect&&!anim?.disableDrawBackgroundCamera);
  const blackGoatPulsePid=anim?.type==='BLACK_GOAT_PULSE'?(anim.targetPid??anim.targetIdx??0):null;

  const battleScreenProps={
    // layout / responsive
    vw,vh,isMobile,isMobileLandscape,scaleRatio,layoutScaleRatio,boardScaleRatio,
    compactBoardScaleRatio,mobileZoomCompensate,baseFontSizes,fontSizes,interactionFontSizes,
    scaledAreaSafeInsetX,globalShiftX,middleRowHeight,mobileHandUsesCompact,selfHandCardScale,
    mobileCssPx,boardCssPx,
    // game state
    gs,me,visualMe,visualPlayers,visualDiscard,visualCurrentTurn,currentTurnPlayer,displayStats,visibleLog,ri,
    // phase / turn
    phase,myTurn,isVisualPlayerTurn,isActionControlsHidden,cancelable,showCancelBtn,
    canShowEndTurnButton,isDiscardPhaseResolving,isDiscardPhasePromptActive,isBlocked,isSpectating,isMultiplayer,
    displayPhaseLabel,cardHintText,isPhaseWarningText,isLocalHuntRevealPrompt,
    promptWarningTextColor,promptActiveTextColor,promptCautionTextColor,promptSafeTextColor,promptMutedTextColor,
    // timers
    mpCthSec,mpTurnSec,mpDiscardSec,mpHuntSec,mpDecisionSec,isMpCthDecisionPhase,isLocalMpDecisionActive:isMpDecisionTimerActive,
    houndsTimerVisible,houndsSecLeft,
    // animation highlights
    anim,suppressAnim,hitIndices,sanHitIndices,hpHealIndices,sanHealIndices,
    guillotinedPids,blackGoatPulsePid,godHighlightPanelBursts,damageLinkGhosts,damageLinkEstablishAnims,
    deathShake,earthquakeShake,screenShake,
    // interaction helpers
    selectingOther,canLocalTargetSelect,effectiveHandLimit,mobileArmedGodCardIdx,
    mobileArmedGodCard,mobileArmedGodTooltipRect,mobileGodCardRefs,
    isLocalSeatIndex,isLocalNyaBorrowPhase,hasHuntRevealableCard,isLocalCurrentTurn,
    // decisions / modals
    pendingZhuDrawCard,pendingZhuGodCard,pendingZhuSphinxCard,pendingZhuAiDrawCard,pendingZhuAnyCard,
    canShowTurnDecisionModal,pendingZhuDrawAnyCard,pendingZhuGodAnyCard,pendingZhuSphinxAnyCard,
    isLocalGodChoice,isLocalDrawDecision,isLocalTreasureDodgePhase,isLocalTreasureAoEDodgePhase,
    isLocalFirstComePicker,isLocalSameAbyssTargetPhase,isLocalSphinxGuessPhase,
    // tutorial / soft guide
    showTutorial,tutorialStep,isTutorialActionAllowed,isTutorialDrawKeepStep,isScriptedTutorial,
    pendingSoftGuideId,softGuideSpotlights,
    tutorialOverlayHidden,tutorialDiceResultPending,tutorialDiceResultResuming,
    tutorialInspectionPending,tutorialInspectionResuming,
    // theme
    battleBackgroundStyle,drawBackgroundCameraActive,globalStyles:GLOBAL_STYLES,
    // refs
    selfPanelRef,roleTextRef,handAreaRef,emojiButtonRef,aiPanelAreaRef,deckAreaRef,
    discardPileRef,logRef,skillButtonRef,restButtonRef,drawRevealKeepButtonRef,
    godKeepHandButtonRef,dodgeRollButtonRef,swapBlindHandRef,animQueueRef,pendingGsRef,
    // ui shell state
    pendingRoleSelection,isDisconnected,exitMatchConfirm,privatePeek,showEmojiPicker,zhuHiddenCardId,
    isSoloPaused,setIsSoloPaused,
    panelRect,roleTextRect,handAreaRect,tutorialHandCardRect,handCardsRect,aiPanelAreaRect,
    opponentSanBarRect,opponentHpBarRect,singleOpponentRect,opponentGodStatusRect,
    drawRevealKeepButtonRect,godKeepHandButtonRect,deckAreaRect,dodgeRollButtonRect,
    skillButtonRect,swapBlindHandRect,isArtifact,isH5Package,smallBtnStyle,
    // callbacks
    handleUiSfxCapture,returnToMainMenu,setExitMatchConfirm,leaveMultiplayerMatchToStart,
    handleAIClick,handleMyCardClick,useAbility,doRest,endTurn,cancelAction,huntConfirm,
    confirmDiscard,confirmBuryAliveSelection,confirmIgniteTorchDiscard,handleZhuHideDrawnCard,handleZhuHideGodCard,
    handleZhuHideTopCardDuringSphinx,handleZhuHideAiDrawCard,handleDrawKeepFromModal,
    handleDrawDiscardFromModal,handleTreasureDodgeRoll,handleTreasureDodgeSkip,
    handleTreasureAOEDodgeRoll,handleTreasureAOEDodgeSkip,resolveTsathogguaSlimeBalance,
    resolveEtherealizeRedirect,firstComePickSelectCard,graveDigSelectGod,sameAbyssSelect,
    sphinxGuess,tortoiseOracleSelect,decipherStoneCarvingConfirm,swapSelectTargetCard,
    huntSelectCardFromPublic,handleSwapBlindDrawSelect,confirmRoleSelection,
    resetDisconnectedToStart,setPrivatePeek,setEmojiButtonPos,setShowEmojiPicker,handleEmojiClick,
    godResolvePlayer,nyaBorrow,nyaSkip,
    setGs,setAnim,setPreparingSoftGuideId,setPendingSoftGuideId,setSoftGuideSpotlights,
    setTutorialStep,advanceTutorialStep,handleTutorialResultNext,completeTutorial,_onRoleRevealDone,
    handleGamma,handleMusicVolume,handleSfxVolume,handleTutorialTreasureMapConfirm,
    markLocalTreasureMapShown:()=>{localTreasureMapShownRef.current=true;},
    // misc derived flags / data used in the moved JSX
    roleRevealAnim,swapBlindDraw,swapBlindCardLayout,
    zhuLitCardsForView,canPlayerRespondWithAnyHandCard,canPlayerRespondWithFireHandCard,
    cardsHuntMatch,isMyCardClickable,
    skillLimited,skillRi,effectiveSkillName,isSelfDeadPanelDimmed,huntAbandoned,
    gamma,musicVolume,sfxVolume,isLocalTestMode,localDebugMode,setLocalDebugMode,serverAnnouncement,emojiButtonPos,
  };

  return(<>
    <BattleScreen {...battleScreenProps} />
    {/* All overlays with position:fixed + getBoundingClientRect() coordinates must render OUTSIDE the zoom container so viewport coords match */}
    <GlobalAnimLayer
      anim={anim}
      animExiting={animExiting}
      expansionKey={gs.expansionKey}
      disabled={suppressAnim}
      playEndlessCorridorTunnelSound={playEndlessCorridorTunnelSound}
    />
    {!suppressAnim&&huntRevealBadge&&<HuntRevealedCardBadge card={huntRevealBadge.card} targetPid={huntRevealBadge.targetPid} suppressShadow={huntRevealBadgeShadowSuppressed}/>}
    {!suppressAnim&&<SwapCupOverlay active={!!swapAnim} casterName={swapAnim?.casterName||''} targetName={swapAnim?.targetName||''}/>}
    {flyingEmojis.map(fe=>(
      <FlyingEmoji key={fe.id} {...fe} onDone={handleFlyingEmojiDone}/>
    ))}
    {!suppressAnim&&<HuntScopeOverlay active={!!huntAnim} cx={huntAnim?.cx??0} cy={huntAnim?.cy??0}/>}
    {!suppressAnim&&<BewitchEyeOverlay active={!!bewitchAnim} cx={bewitchAnim?.cx??0} cy={bewitchAnim?.cy??0}/>}
    {!suppressAnim&&petrifyTargets.length>0&&<PetrifyAnim targets={petrifyTargets}/>}
    {!suppressAnim&&guillotineTargets.length>0&&<GuillotineAnim targets={guillotineTargets}/>}
    {!suppressAnim&&<KnifeEffect targets={knifeTargets}/>}
    {!suppressAnim&&<SanMistOverlay targets={sanTargets}/>}
    {!suppressAnim&&<CardTransferOverlay transfers={cardTransfers} expansionKey={gs.expansionKey}/>}
    {phase==='TREASURE_WIN'&&!showTutorial&&<TreasureMapAnim hand={me.hand} confirmCountdownSec={gs._isMP?3:null} onConfirm={revealWin}/>}
    {phase==='GOD_RESURRECTION'&&(!showTutorial||isTutorialGodResurrection)&&(
      <GodResurrectionAnim onDone={isTutorialGodResurrection
        ?completeTutorialGodResurrection
        :()=>{setShowGodResurrection(true);revealWin();}}
      />
    )}
  </>);
}
// ══════════════════════════════════════════════════════════════
const smallBtnStyle={
  padding:'4px 12px',background:'#180e08',
  border:'1px solid #3a2510',color:'#a07838',
  fontFamily:"'Cinzel',serif",fontSize:10,borderRadius:2,cursor:'pointer',letterSpacing:1,
};

