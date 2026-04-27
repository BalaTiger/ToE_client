import { GodTooltip, AreaTooltip, GodDDCard, DDCard, DDCardBack, GodCardDisplay, OctopusSVG } from './components/cards';
import { GodChoiceModal, NyaBorrowModal, DrawRevealModal, TreasureDodgeModal, PeekHandModal, TortoiseOracleModal, AboutModal, FullLogModal, RoadmapModal } from './components/modals';
import { HoundsTimerBadge, StatBar, DiscardPile, HealCrossEffect, DeckPile, InspectionPile, PileDisplay, PlayerPanel } from './components/board';
import { RoomModal, LobbyModal, PrivacyToggleModal, TutorialOverlay, ConnectionErrorModal, DebugControls } from './components/lobby';
import { StartScreen } from './components/start/StartScreen';
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import ReactDOM from "react-dom";
import html2canvas from "html2canvas";
// socket.io-client is loaded at runtime via CDN (only outside Claude Artifacts)

import {
  FIXED_ZONE_CARD_VARIANTS_BY_KEY,
  LETTERS,
  NUMS,
  AI_NAMES,
  RINFO,
  ROLE_TREASURE, // 直接写名字，不要带方括号
  ROLE_HUNTER,   // 直接写名字
  ROLE_CULTIST,  // 直接写名字
  CS,
  GOD_CS,
  GOD_DEFS
} from "./constants/card";

// 导入拆分出的游戏工具模块（通过 game/index.js 统一导出）
import {
  shuffle,
  clamp,
  copyPlayers,
  isZoneCard,
  isBlankZoneCard,
  isNegativeZoneCard,
  getZoneCardEffectScope,
  zoneCardUsesTargetInteraction,
  isWinHand,
  getLivingPlayerOrder,
  cardLogText,
  removeCardsFromDiscard,
  getPrevLivingIndex,
  getNextLivingIndex,
  aiChooseRevealCard,
  aiChooseHunterLootCards,
  chooseFirstComePickForAI,
  chooseAiRoseThornTarget,
  chooseAiCultistBewitchPlan,
  aiShouldKeepZoneCard,
  decideAiSkillUsage,
  canCultistWinByBewitch,
  canCultistEmptyHandByBewitch,
  aiShouldNotRest,
  isCultistEndingTurnUnreasonable,
  mkDeck,
  mkRoles,
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

// Ellipsis component for loading animation
function Ellipsis() {
  const [dots, setDots] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev + 1) % 4);
    }, 500);
    
    return () => clearInterval(interval);
  }, []);
  
  return <span>{'.'.repeat(dots)}</span>;
}

// ══════════════════════════════════════════════════════════════
//  UTILITIES
// ══════════════════════════════════════════════════════════════
const safeLS={
  get:(k)=>{try{return localStorage.getItem(k);}catch{/* ignore */ return null;}},
  set:(k,v)=>{try{localStorage.setItem(k,v);}catch{/* ignore */}},
};
const cardsHuntMatch=(a,b)=>{
  if(!a||!b)return false;
  if(!isZoneCard(a)||!isZoneCard(b))return false;
  if(isBlankZoneCard(a)||isBlankZoneCard(b))return true;
  return a.letter===b.letter||a.number===b.number;
};
const buildPublicUrl=path=>{
  // Use window.__PUBLIC_BASE__ if set by the host page (Vite injects BASE_URL there),
  // otherwise fall back to '/' which works for the default deployment config.
  const base=((window.__PUBLIC_BASE__)||'/').replace(/\/?$/,'/');
  return `${base}${String(path).replace(/^\/+/,'')}`;
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
function moveEligibleBlankZones(players,log=[]){
  let changed=false;
  const P=copyPlayers(players);
  const L=[...log];
  P.forEach(player=>{
    if(!player||player.isDead)return;
    const blankZones=(player.zoneCards||[]).filter(isBlankZoneCard);
    if(!blankZones.length)return;
    if(player.hand.length<=3){
      blankZones.forEach(blank=>{
        player.hand.push(blank);
        L.push(`${player.name} 手牌不大于3张，将空白区域牌收入手牌`);
      });
      player.zoneCards=(player.zoneCards||[]).filter(c=>!isBlankZoneCard(c));
      changed=true;
    }
  });
  return changed?{players:P,log:L}:null;
}

function killPlayerState(P,i,Disc,L){
  if(i==null||!P[i]||P[i].isDead)return;
  // 标记待播放死亡特效的角色（用于面板延迟置灰）
  // 死亡特效播放完成后在 triggerAnimQueue 中清除此标记
  P[i]._pendingAnimDeath = true;
  P[i].isDead=true;
  P[i].roleRevealed=true;
  L.push(`☠ ${P[i].name}（${P[i].role}）倒下了！`);
  Disc.push(...P[i].hand);
  P[i].hand=[];
  if(P[i].godZone?.length){
    Disc.push(...P[i].godZone);
    P[i].godZone=[];
    P[i].godName=null;
    P[i].godLevel=0;
  }
}

function clearPendingAnimDeathFlags(players,preservePid=null){
  return (players||[]).map((p,idx)=>{
    if(!p)return p;
    if(p._pendingAnimDeath&&idx!==preservePid)return {...p,_pendingAnimDeath:false};
    return {...p};
  });
}

function shouldDelayHuntLootSelection(players,targetIdx,maxToTake,isMP){
  const target=players?.[targetIdx];
  if(!target?.isDead||!target?.revealHand)return false;
  if((target.hand?.length||0)<=maxToTake)return false;
  return !checkWin(players,isMP);
}

function applyHpDamageWithLink(P,i,amount,Disc,L){
  if(i==null||!P[i]||P[i].isDead||!(amount>0))return;
  P[i].hp=clamp(P[i].hp-amount);
  if(P[i].damageLink?.active){
    const partnerIdx=P[i].damageLink.partner;
    if(partnerIdx!=null&&P[partnerIdx]&&!P[partnerIdx].isDead){
      P[i].damageLink.active=false;
      if(P[partnerIdx].damageLink)P[partnerIdx].damageLink.active=false;
      const linkDamage=3;
      P[i].hp=clamp(P[i].hp-linkDamage);
      P[partnerIdx].hp=clamp(P[partnerIdx].hp-linkDamage);
      L.push(`【两人一绳】绳索断裂！${P[i].name} 和 ${P[partnerIdx].name} 各失去 ${linkDamage} HP`);
      if(P[i].hp<=0)killPlayerState(P,i,Disc,L);
      if(P[partnerIdx].hp<=0)killPlayerState(P,partnerIdx,Disc,L);
    }
  }
  if(P[i].hp<=0)killPlayerState(P,i,Disc,L);
}



// ══════════════════════════════════════════════════════════════
//  EFFECT ENGINE
// ══════════════════════════════════════════════════════════════
function getAdjacentTargets(players,ci){
  const prev=getPrevLivingIndex(players,ci);
  const next=getNextLivingIndex(players,ci);
  return [ci,...[prev,next].filter((idx,pos,arr)=>idx!=null&&arr.indexOf(idx)===pos)];
}
function getLivingAdjacentTargets(players,ci){
  return getAdjacentTargets(players,ci).filter((idx,pos,arr)=>idx!==ci&&idx!=null&&players[idx]&&!players[idx].isDead&&arr.indexOf(idx)===pos);
}

function applyFx(card,ci,ti,ps,deck,disc,gs,avoidNegative=false,avoidNegativeFor=[],isAI=false){
  let P=copyPlayers(ps),D=[...deck],Disc=[...disc],msgs=[];
  let statePatch={};
  let inspectionMeta=makeInspectionMeta(gs);
  const pendingInspectionTargets=[];
  const dmgBonus=P[ci]?.damageBonus||0;
  const healHP=(i,v)=>{if(i==null||!P[i]||P[i].isDead)return;P[i].hp=clamp(P[i].hp+v);};
  const healSAN=(i,v)=>{if(i==null||!P[i]||P[i].isDead)return;P[i].san=clamp(P[i].san+v);};
  const hurtHP=(i,v)=>{
    if(i==null||!P[i]||P[i].isDead||(avoidNegative&&i===ci)||avoidNegativeFor.includes(i))return;
    applyHpDamageWithLink(P,i,v,Disc,msgs);
  };
  const hurtSAN=(i,v)=>{
    if(i==null||!P[i]||P[i].isDead||(avoidNegative&&i===ci)||avoidNegativeFor.includes(i))return;
    P[i].san=clamp(P[i].san-v);
    const newSan=P[i].san;
    if(newSan<=6){
      pendingInspectionTargets.push(i);
    }
  };
  const dealHP=(i,v)=>hurtHP(i,v+dmgBonus);
  const dealSAN=(i,v)=>hurtSAN(i,v+dmgBonus);
  const randDiscard = (i, count = 1) => {
    if (i == null || !P[i] || (avoidNegative && i === ci) || avoidNegativeFor.includes(i)) return;
    for (let n = 0; n < count; n++) {
      if (P[i].hand.length) {
        const x = 0 | Math.random() * P[i].hand.length;
        const c = P[i].hand.splice(x, 1)[0];
        // 空白区域牌被弃置时消失，不进入弃牌堆
        if (c.type !== 'blankZone') {
          Disc.push(c);
          msgs.push(`${P[i].name} 失去了 ${cardLogText(c,{alwaysShowName:true})}`);
        } else {
          msgs.push(`${P[i].name} 的空白区域牌消失了`);
        }
      }
    }
  }; 
  const toggleRest=i=>{if(i==null||!P[i]||P[i].isDead||(avoidNegative&&i===ci)||avoidNegativeFor.includes(i))return;P[i].isResting=!P[i].isResting;msgs.push(`${P[i].name}${P[i].isResting?'进入':'离开'}休息状态`);};
  const adjacent=getAdjacentTargets(P,ci);
  const others=P.map((_,i)=>i).filter(i=>i!==ci&&!P[i].isDead);
  const allLiving=P.map((_,i)=>i).filter(i=>!P[i].isDead);
  const actor=P[ci];
  
  // 辅助函数：检查条件
  const checkCondition=(condType,condVal,actor)=>{
    switch(condType){
      case 'handHigh': return actor.hand.length>=condVal;
      case 'handLow': return actor.hand.length<=condVal;
      case 'hpLow': return actor.hp<=condVal;
      case 'sanHigh': return actor.san>=condVal;
      default: return false;
    }
  };
  
  // 辅助函数：应用条件伤害
  const applyConditionalDamage=(type,card)=>{
    if(!avoidNegative&&!avoidNegativeFor.includes(ci)){
      let totalDamage=card.val||0;
      let bonusDamage=0;
      const conditionMet=checkCondition(card.condType,card.condVal,actor);
      if(conditionMet){
        bonusDamage=card.bonus||0;
        totalDamage+=bonusDamage;
      }
      if(type==='hp'){
        hurtHP(ci,totalDamage);
      }else if(type==='san'){
        hurtSAN(ci,totalDamage);
      }
      const bonusText=bonusDamage>0?`（其中${card.val}点基础伤害+${bonusDamage}点额外伤害）`:'';
      msgs.push(`${actor.name} 失去 ${totalDamage} ${type=== 'hp' ? 'HP' : 'SAN'}${bonusText}`);
    }
  };
  
  // 辅助函数：应用AOE伤害
  const applyAOEDamage=(targets,damageType,value,hpVal,sanVal)=>{
    let affected=false;
    targets.forEach(i=>{
      if(!avoidNegativeFor.includes(i)){
        if(damageType==='both'||damageType.includes('hp'))dealHP(i,hpVal||value);
        if(damageType==='both'||damageType.includes('san'))dealSAN(i,sanVal||value);
        if(i!==ci||!avoidNegative)affected=true;
      }
    });
    if(affected){
      if(hpVal&&sanVal){
        msgs.push(`${actor.name} 与相邻角色各失去 ${hpVal+dmgBonus} HP 和 ${sanVal} SAN`);
      }else{
        const damageDesc=damageType==='hp'?'HP':(damageType==='san'?'SAN':'HP 和 SAN');
        msgs.push(`${actor.name} 与相邻角色各失去 ${value+dmgBonus} ${damageDesc}`);
      }
    }
  };
  
  // 辅助函数：应用全局AOE伤害
  const applyGlobalAOEDamage=(damageType,value)=>{
    let affected=false;
    allLiving.forEach(i=>{
      if(!avoidNegativeFor.includes(i)){
        if(damageType==='both'||damageType.includes('hp'))dealHP(i,value);
        if(damageType==='both'||damageType.includes('san'))dealSAN(i,value);
        if(i!==ci||!avoidNegative)affected=true;
      }
    });
    if(affected){
      const damageDesc=damageType==='hp'?'HP':(damageType==='san'?'SAN':'HP 和 SAN');
      msgs.push(`全体存活角色失去 ${value+dmgBonus} ${damageDesc}`);
    }
  };

  // 辅助函数：自身先受伤，再对相邻角色造成伤害
  const applySelfAndAdjacentDamage=({selfHp=0,selfSan=0,adjHp=0,adjSan=0})=>{
    const avoidSelf=avoidNegative||avoidNegativeFor.includes(ci);
    const adjacentTargets=getLivingAdjacentTargets(P,ci);
    if(!avoidSelf&&selfHp)hurtHP(ci,selfHp);
    if(!avoidSelf&&selfSan)hurtSAN(ci,selfSan);
    if(!avoidSelf&&selfHp&&selfSan){
      msgs.push(`${actor.name} 失去 ${selfHp} HP 和 ${selfSan} SAN`);
    }else if(!avoidSelf&&selfHp){
      msgs.push(`${actor.name} 失去 ${selfHp} HP`);
    }else if(!avoidSelf&&selfSan){
      msgs.push(`${actor.name} 失去 ${selfSan} SAN`);
    }
    let adjacentAffected=false;
    adjacentTargets.forEach(i=>{
      if(!avoidNegativeFor.includes(i)){
        adjacentAffected=true;
        if(adjHp)dealHP(i,adjHp);
        if(adjSan)dealSAN(i,adjSan);
      }
    });
    if(adjacentAffected&&adjHp&&adjSan){
      msgs.push(`${actor.name} 周围的角色各失去 ${adjHp+dmgBonus} HP 和 ${adjSan+dmgBonus} SAN`);
    }else if(adjacentAffected&&adjHp){
      msgs.push(`${actor.name} 周围的角色各失去 ${adjHp+dmgBonus} HP`);
    }else if(adjacentAffected&&adjSan){
      msgs.push(`${actor.name} 周围的角色各失去 ${adjSan+dmgBonus} SAN`);
    }
    return !avoidSelf||adjacentAffected;
  };
  switch(card.type){
    case 'selfHealHP': healHP(ci,card.val);msgs.push(`${actor.name} 回复了 ${card.val} HP`);break;
    case 'selfHealSAN': healSAN(ci,card.val);msgs.push(`${actor.name} 回复了 ${card.val} SAN`);break;
    case 'selfHealBoth': healHP(ci,1);healSAN(ci,1);msgs.push(`${actor.name} 回复了 1 HP 和 1 SAN`);break;
    case 'selfHealBoth21': healHP(ci,2);healSAN(ci,1);msgs.push(`${actor.name} 回复了 2 HP 和 1 SAN`);break;
    case 'selfHealAdjDamageHP': {
      healHP(ci,card.val);
      const adjacentTargets=getLivingAdjacentTargets(P,ci);
      adjacentTargets.forEach(i=>dealHP(i,card.val));
      msgs.push(`${actor.name} 回复了 ${card.val} HP，相邻角色各失去 ${card.val+dmgBonus} HP`);
      break;
    }
    case 'selfHealAdjHealHP': healHP(ci,card.val);adjacent.filter(i=>i!==ci).forEach(i=>healHP(i,card.adjVal||1));msgs.push(`${actor.name} 回复了 ${card.val} HP，相邻角色各回复 ${card.adjVal||1} HP`);break;
    case 'adjHealHP': adjacent.forEach(i=>healHP(i,card.val));msgs.push(`${actor.name} 与相邻角色各回复 ${card.val} HP`);break;
    case 'selfRevealHandHP': actor.hp=10;actor.revealHand=true;actor.pickInsteadOfRandom=true;msgs.push(`${actor.name} HP 回满，手牌公开且盲抽改为挑选`);break;
    case 'selfRevealHandSAN': actor.san=Math.min(10,actor.san+card.val);actor.revealHand=true;actor.pickInsteadOfRandom=true;msgs.push(`${actor.name} 回复 ${card.val} SAN，手牌公开且盲抽改为挑选`);break;
    case 'globalOnlySwap': statePatch={globalOnlySwapOwner:ci};msgs.push(`直到 ${actor.name} 的下回合开始前，所有角色技能都视为“掉包”`);break;
    case 'selfDamageHP': hurtHP(ci,card.val);if(!avoidNegative&&!avoidNegativeFor.includes(ci))msgs.push(`${actor.name} 失去 ${card.val} HP`);break;
    case 'selfDamageSAN': hurtSAN(ci,card.val);if(!avoidNegative&&!avoidNegativeFor.includes(ci))msgs.push(`${actor.name} 失去 ${card.val} SAN`);break;
    case 'selfDamageHPCond': applyConditionalDamage('hp',card);break;
    case 'selfDamageSANCond': applyConditionalDamage('san',card);break;
    case 'selfDamageHPSAN': 
      // 复合效果：负面效果（失去HP和SAN）
      // 规避时所有负面效果都不触发
      const hv=card.hpVal||0,sv=card.sanVal||0;
      if(!avoidNegative&&!avoidNegativeFor.includes(ci)){
        hurtHP(ci,hv);
        hurtSAN(ci,sv);
        msgs.push(`${actor.name} 失去 ${hv} HP 和 ${sv} SAN`);
      }
      break;
    case 'selfDamageDiscardHP': 
      // 复合效果：负面效果（失去HP）+ 随机弃1张牌
      if(!avoidNegative&&!avoidNegativeFor.includes(ci)){
        hurtHP(ci,card.val);
        msgs.push(`${actor.name} 失去 ${card.val} HP`);
        randDiscard(ci,1);
      }
      break;
    case 'selfDamageDiscardSAN': 
      // 复合效果：负面效果（失去SAN）+ 随机弃1张牌
      if(!avoidNegative&&!avoidNegativeFor.includes(ci)){
        hurtSAN(ci,card.val);
        msgs.push(`${actor.name} 失去 ${card.val} SAN`);
        randDiscard(ci,1);
      }
      break;
    case 'selfDamageRestHP': 
      // 复合效果：负面效果（失去HP）+ 翻面（切换休息状态）
      if(!avoidNegative&&!avoidNegativeFor.includes(ci)){
        hurtHP(ci,card.val);
        msgs.push(`${actor.name} 失去 ${card.val} HP`);
        toggleRest(ci);
      }
      break;
    case 'selfDamageRestSAN': 
      // 复合效果：负面效果（失去SAN）+ 翻面（切换休息状态）
      if(!avoidNegative&&!avoidNegativeFor.includes(ci)){
        hurtSAN(ci,card.val);
        msgs.push(`${actor.name} 失去 ${card.val} SAN`);
        toggleRest(ci);
      }
      break;
    case 'adjDamageHP': applyAOEDamage(adjacent,'hp',card.val);break;
    case 'adjDamageSAN': applyAOEDamage(adjacent,'san',card.val);break;
    case 'adjDamageBoth': applyAOEDamage(adjacent,'both',card.val,card.hpVal,card.sanVal);break;
    case 'allDamageHP': applyGlobalAOEDamage('hp',card.val);break;
    case 'allDamageSAN': applyGlobalAOEDamage('san',card.val);break;
    case 'allDamageBoth': applyGlobalAOEDamage('both',card.val);break;
    case 'adjRest': 
      // AOE负面效果：相邻角色翻面（切换休息状态）
      // 支持规避：被规避的角色不会翻面
      adjacent.forEach(i=>{
        if(!avoidNegativeFor.includes(i)){
          toggleRest(i);
        }
      });
      break;
    case 'selfHealHPSelfDamageSAN':      // 魅魔梦境：回复2HP，失去1SAN
      healHP(ci,card.hpVal);
      if(!avoidNegative&&!avoidNegativeFor.includes(ci)){
        hurtSAN(ci,card.sanVal);
        msgs.push(`${actor.name} 回复 ${card.hpVal} HP，失去 ${card.sanVal} SAN`);
      }else{
        msgs.push(`${actor.name} 回复 ${card.hpVal} HP`);
      }
      break;
    case 'allDiscard': 
      // AOE负面效果：全体存活角色各随机弃1张牌
      // 支持规避：被规避的角色不会弃牌
      allLiving.forEach(i=>{
        if(!avoidNegativeFor.includes(i)){
          randDiscard(i,1);
        }
      });
      statePatch={...statePatch,_earthquakeSeq:(gs?._earthquakeSeq||0)+1};
      break;
    case 'selfRenounceGod':
      if(actor.godName){
        if(actor.godZone?.length)Disc.push(...actor.godZone);
        actor.godZone=[];actor.godName=null;actor.godLevel=0;
        msgs.push(`${actor.name} 放弃信仰`);
      }
      break;
    case 'sacHealHP': 
      // 复合效果：负面效果（失去1 SAN）+ 正面效果（全体回复1 HP）
      // 规避只针对负面效果，正面效果一定会触发
      if(!avoidNegative&&!avoidNegativeFor.includes(ci)){
        hurtSAN(ci,1);
        msgs.push(`${actor.name} 失去 1 SAN`);
      }
      allLiving.forEach(i=>healHP(i,card.val));
      msgs.push(`随后全体回复 ${card.val} HP`);
      break;
    case 'sacHealSelfSAN': 
      // 复合效果：负面效果（失去3 HP）+ 正面效果（回复1 SAN）
      // 规避只针对负面效果，正面效果一定会触发
      if(!avoidNegative&&!avoidNegativeFor.includes(ci)){
        hurtHP(ci,3);
        msgs.push(`${actor.name} 失去 3 HP`);
      }
      healSAN(ci,card.val);
      msgs.push(`${actor.name} 回复 ${card.val} SAN`);
      break;
    case 'sacHealSelfSANCultist': 
      // 复合效果：负面效果（失去3 HP）+ 正面效果（回复2 SAN）
      // 若本局未信仰过邪神，只执行后半句效果
      // 规避只针对负面效果，正面效果一定会触发
      if(!avoidNegative&&!avoidNegativeFor.includes(ci)&&actor.hasBelievedGod){
        hurtHP(ci,3);
        msgs.push(`${actor.name} 失去 3 HP`);
      }
      healSAN(ci,card.val);
      msgs.push(`${actor.name} 回复 ${card.val} SAN`);
      break;
    case 'selfDamageHPPeek': 
      // 复合效果：负面效果（失去HP）+ 偷看一名角色的手牌
      // 规避时只跳过对自己不利的失去HP，偷看效果仍然触发
      if(!avoidNegative&&!avoidNegativeFor.includes(ci)){
        hurtHP(ci,card.val);
        msgs.push(`${actor.name} 失去 ${card.val} HP`);
      }
      // 检查是否有除自己以外手牌未公开的角色
      {
        const validTargets=others.filter(i=>!P[i].revealHand);
        if(validTargets.length>0){
          // 设置状态补丁，用于触发偷看手牌的目标选择
          statePatch={peekHandTargets:validTargets,peekHandSource:ci};
          msgs.push(`${actor.name} 准备偷看一名角色的手牌`);
        }else{
          msgs.push(`所有其他角色的手牌都已公开，无法偷看`);
        }
      }
      break;
    case 'swapAllHands':{
      // Swap entire hand with the target (ti); if no ti provided, pick the living player with most cards
      const swapTarget=ti!=null?ti:others.reduce((best,i)=>P[i].hand.length>P[best].hand.length?i:best,others[0]??ci);
      if(swapTarget!=null&&swapTarget!==ci&&P[swapTarget]&&!P[swapTarget].isDead){
        const myHand=[...P[ci].hand];
        P[ci].hand=[...P[swapTarget].hand];
        P[swapTarget].hand=myHand;
        msgs.push(`${actor.name} 与 ${P[swapTarget].name} 交换了全部手牌（${P[ci].hand.length} 张 ↔ ${P[swapTarget].hand.length} 张）`);
      }else{
        msgs.push(`${actor.name} 无法找到交换目标`);
      }
      break;
    }
    case 'selfBerserk': 
      // 复合效果：负面效果（失去1 SAN）+ 正面效果（伤害+1）
      // 规避只针对负面效果，正面效果一定会触发
      if(!avoidNegative&&!avoidNegativeFor.includes(ci)){
        hurtSAN(ci,1);
        msgs.push(`${actor.name} 失去 1 SAN`);
      }
      P[ci].damageBonus=(P[ci].damageBonus||0)+1;
      msgs.push(`${actor.name} 本回合造成的伤害+1`);
      break;
    case 'selfDamageSkipDraw': 
      // 复合效果：负面效果（失去HP）+ 下回合开始时不能摸牌
      // 规避时所有效果都不触发
      if(!avoidNegative&&!avoidNegativeFor.includes(ci)){
        hurtHP(ci,card.val);
        if(P[ci]&&!P[ci].isDead){
          msgs.push(`${actor.name} 失去 ${card.val} HP`);
          // 设置跳过下回合摸牌的标记
          P[ci].skipNextDraw=true;
          msgs.push(`${actor.name} 下回合开始时不能摸牌`);
        }
      }
      break;
    case 'selfDamageAdjDamageBoth': 
      // 复合效果：负面效果（失去HP和SAN）+ 相邻角色失去HP和SAN
      // 规避时只跳过对自己不利的部分，相邻角色受伤仍然触发
      applySelfAndAdjacentDamage({
        selfHp:card.hpVal||0,
        selfSan:card.sanVal||0,
        adjHp:card.adjHpVal||0,
        adjSan:card.adjSanVal||0,
      });
      break;
    case 'selfDamageAdjDamageHP':
      // 复合效果：负面效果（自身失去HP）+ 相邻角色各失去HP
      // 规避时只跳过对自己不利的部分，相邻角色受伤仍然触发
      applySelfAndAdjacentDamage({
        selfHp:card.val||0,
        adjHp:card.adjVal||1,
      });
      break;
    case 'allDamageHPRandomExtra':
      // 钻地魔虫：全体存活角色失去1HP，然后随机选择一名角色失去1HP
      {
        const avoidSelf=avoidNegative||avoidNegativeFor.includes(ci);
        const deferredGlobalLogs=[];
        const affectedTargets=P.map((p,i)=>i).filter(i=>!P[i].isDead&&!avoidNegativeFor.includes(i)&&!(avoidSelf&&i===ci));
        // 全体存活角色失去1HP
        affectedTargets.forEach(i=>{
          const localMsgs=[];
          applyHpDamageWithLink(P,i,(card.val||0)+dmgBonus,Disc,localMsgs);
          deferredGlobalLogs.push(...localMsgs);
        });
        if(affectedTargets.length){
          if(avoidSelf&&affectedTargets.length===allLiving.length-1){
            msgs.push(`除${actor.name}外，全体存活角色失去 ${card.val} HP`);
          }else{
            msgs.push(`全体存活角色失去 ${card.val} HP`);
          }
        }
        if(deferredGlobalLogs.length)msgs.push(...deferredGlobalLogs);
        // 随机选择一名存活角色失去1HP
        const alivePlayers=P.map((p,i)=>i).filter(i=>!P[i].isDead&&!avoidNegativeFor.includes(i)&&!(avoidSelf&&i===ci));
        if(alivePlayers.length>0){
          const randomTarget=alivePlayers[Math.floor(Math.random()*alivePlayers.length)];
          const localMsgs=[];
          applyHpDamageWithLink(P,randomTarget,(card.val||0)+dmgBonus,Disc,localMsgs);
          msgs.push(`${P[randomTarget].name} 额外失去 ${card.val} HP`);
          if(localMsgs.length)msgs.push(...localMsgs);
        }
      }
      break;
    case 'damageLink':
      // 两人一绳：你和另一名角色间架起链条，传导一次HP伤害后消失。你的下一回合开始时链条也会消失
      if(!avoidNegative&&!avoidNegativeFor.includes(ci)){
        // 检查是否有其他存活角色
        const validTargets=others.filter(i=>!P[i].isDead);
        if(validTargets.length===0){
          msgs.push(`没有其他存活角色，无法架起链条`);
        }else{
          // 设置状态补丁，用于触发两人一绳的目标选择
          statePatch={damageLinkTargets:validTargets,damageLinkSource:ci};
          msgs.push(`${actor.name} 准备使用两人一绳`);
        }
      }
      break;
    case 'caveDuel':
      // 穴居人战争：你与另一名角色各亮一张手牌，数字编号更大的一方收下这两张牌
      // 隐藏规则：
      // 1. 如果摸到"穴居人战争"之前没有牌，强制展示"穴居人战争"
      // 2. 在选择另一名角色时，必须选有手牌的
      // 3. 亮出的邪神牌视为数字编号为0
      if(!avoidNegative&&!avoidNegativeFor.includes(ci)){
        // 检查是否有其他有手牌的角色
        const validTargets=others.filter(i=>P[i].hand.length>0);
        if(validTargets.length===0){
          msgs.push(`没有其他角色有手牌，无法进行穴居人战争`);
        }else{
          // 设置状态补丁，用于触发穴居人战争的目标选择
          statePatch={caveDuelTargets:validTargets,caveDuelSource:ci};
          msgs.push(`${actor.name} 准备进行穴居人战争`);
        }
      }
      break;
    case 'placeBlankZone':
      // 关键拼图：你的角色上放一张空白区域牌（可代表任意字母和数字组合），手牌不大于3张时你将它收入手牌
      if(!avoidNegative&&!avoidNegativeFor.includes(ci)){
        // 创建空白区域牌
        const blankZone={
          id:`blank-${ci}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
          name:'空白区域牌',
          key:'BLANK',
          isZone:true,
          type:'blankZone',
          desc:'可代表任意字母和数字组合'
        };
        // 将空白区域牌放在角色上
        if(!P[ci].zoneCards)P[ci].zoneCards=[];
        P[ci].zoneCards.push(blankZone);
        msgs.push(`${actor.name} 放置了一张空白区域牌`);
        // 检查手牌是否不大于3张，如果是则收入手牌
        if(P[ci].hand.length<=3){
          P[ci].hand.push(blankZone);
          P[ci].zoneCards.pop();
          msgs.push(`${actor.name} 手牌不大于3张，将空白区域牌收入手牌`);
        }
      }
      break;
    case 'revealTopCards':
      // 灵龟卜祝：展示牌堆顶的4张牌，然后选择你手中最多的一个字母或数字编号，将这4张牌中该编号的牌收入手牌（不触发效果）
      if(!avoidNegative&&!avoidNegativeFor.includes(ci)){
        // 展示牌堆顶的4张牌
        const revealedCards=[];
        const isZoneMatchKey=(card,key)=>{
          if(!isZoneCard(card))return false;
          return /^[A-Z]$/.test(key)?card.letter===key:/^\d$/.test(key)?String(card.number)===String(key):false;
        };
        for(let i=0;i<card.val&&D.length>0;i++){
          revealedCards.push(D.shift());
        }
        if(revealedCards.length>0){
          msgs.push(`${actor.name} 展示了牌堆顶的 ${revealedCards.length} 张牌：${revealedCards.map(c=>cardLogText(c)).join(' ')}`);
          // 分别统计字母和数字的出现次数
          const letterCountMap={};
          const numberCountMap={};
          P[ci].hand.forEach(card=>{
            if(isZoneCard(card)&&card.key){  
              // 提取字母和数字
              const letter=card.key.match(/[A-Z]/);
              const number=card.key.match(/\d/);
              if(letter){
                const l=letter[0];
                letterCountMap[l]=(letterCountMap[l]||0)+1;
              }
              if(number){
                const n=number[0];
                numberCountMap[n]=(numberCountMap[n]||0)+1;
              }
            }
          });
          // 找到字母中出现次数最多的编号
          let maxLetterCount=0;
          const maxLetters=[];
          Object.entries(letterCountMap).forEach(([key,count])=>{
            if(count>maxLetterCount){
              maxLetterCount=count;
              maxLetters.length=0;
              maxLetters.push(key);
            }else if(count===maxLetterCount){
              maxLetters.push(key);
            }
          });
          // 找到数字中出现次数最多的编号
          let maxNumberCount=0;
          const maxNumbers=[];
          Object.entries(numberCountMap).forEach(([key,count])=>{
            if(count>maxNumberCount){
              maxNumberCount=count;
              maxNumbers.length=0;
              maxNumbers.push(key);
            }else if(count===maxNumberCount){
              maxNumbers.push(key);
            }
          });
          // 收集所有可选择的编号
          const selectableKeys=[];
          if(maxLetters.length>0) selectableKeys.push(...maxLetters);
          if(maxNumbers.length>0) selectableKeys.push(...maxNumbers);
          if(selectableKeys.length>0){
            // 对于AI，随机选择一个编号
            if(isAI){
              const selectedKey=selectableKeys[Math.floor(Math.random()*selectableKeys.length)];
              msgs.push(`${actor.name} 选择了编号 ${selectedKey}`);
              // 将4张牌中该编号的牌收入手牌
              const matchedCards=revealedCards.filter(c=>isZoneMatchKey(c,selectedKey));
              if(matchedCards.length>0){
                P[ci].hand.push(...matchedCards);
                msgs.push(`${actor.name} 收入了 ${matchedCards.length} 张编号为 ${selectedKey} 的牌`);
                // 剩余的牌放入弃牌堆
                const remainingCards=revealedCards.filter(c=>!isZoneMatchKey(c,selectedKey));
                if(remainingCards.length>0){
                  Disc.push(...remainingCards);
                }
              }else{
                msgs.push(`展示的牌中没有编号为 ${selectedKey} 的牌`);
                Disc.push(...revealedCards);
              }
            }else{
              // 对于玩家，需要显示选择界面
              return {
                P,
                D,
                Disc,
                msgs,
                statePatch: {
                  abilityData: {
                    type: 'tortoiseOracleSelect',
                    playerIndex: ci,
                    revealedCards,
                    selectableKeys
                  }
                }
              };
            }
          }else{
            msgs.push(`${actor.name} 手中没有牌，无法选择编号`);
            Disc.push(...revealedCards);
          }
        }else{
          msgs.push(`牌堆已空，无法展示牌`);
        }
      }
      break;
    case 'firstComePick':
      if(!avoidNegative&&!avoidNegativeFor.includes(ci)){
        const revealCount=P.filter(p=>!p.isDead).length;
        const revealedCards=[];
        while(revealedCards.length<revealCount){
          if(!D.length&&Disc.length){
            D=shuffle(Disc);
            Disc=[];
          }
          if(!D.length)break;
          revealedCards.push(D.shift());
        }
        if(revealedCards.length){
          const pickOrder=getLivingPlayerOrder(P,ci);
          msgs.push(`${actor.name} 翻开了 ${revealedCards.length} 张牌：[${revealedCards.map(c=>c.key||c.name).join('] [')}]`);
          msgs.push(`【先到先得】从 ${actor.name} 开始，每名存活角色依次挑选一张收入手牌`);
          statePatch={
            ...statePatch,
            abilityData:{
              type:'firstComePick',
              revealedCards,
              pickOrder,
              pickIndex:0,
              pickSource:ci,
            }
          };
        }
      }
      break;
    case 'roseThornGiftAllHand':
      if(!avoidNegative&&!avoidNegativeFor.includes(ci)){
        const validTargets=others.filter(i=>!P[i].isDead);
        if(validTargets.length===0){
          msgs.push(`没有其他存活角色，无法施加玫瑰倒刺`);
        }else{
          statePatch={...statePatch,roseThornTargets:validTargets,roseThornSource:ci};
          msgs.push(`${actor.name} 准备使用玫瑰倒刺`);
        }
      }
      break;
  }
  if(pendingInspectionTargets.length){
    const inspectionBaseLog=[...(Array.isArray(gs?.log)?gs.log:[]),...msgs];
    const processed=processInspectionTargets(pendingInspectionTargets,gs?.currentTurn??ci,P,D,Disc,inspectionBaseLog,inspectionMeta);
    P=processed.P;D=processed.D;Disc=processed.Disc;inspectionMeta=processed.inspectionMeta;
    msgs=[...msgs,...processed.log.slice(inspectionBaseLog.length)];
    statePatch={...statePatch,...inspectionMeta};
  }
  return{P,D,Disc,msgs,statePatch};
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


function checkWin(players,isMP){
  const hasHunters=players.some(p=>p.role===ROLE_HUNTER);
  const hasCultists=players.some(p=>p.role===ROLE_CULTIST);
  // 1. SAN归零且HP>0：有邪祀者则邪祀者获胜；无邪祀者则全员失败（邪神复活但无人受益）
  for(const p of players)if(!p.isDead&&p.san<=0&&p.hp>0){
    if(hasCultists){
      const ws=players.filter(q=>q.role===ROLE_CULTIST).map(q=>q.name).join('、');
      return{winner:ROLE_CULTIST,reason:`${p.name} 的理智归零，邪神苏醒！邪祀者（${ws}）获胜！`};
    }else{
      return{winner:'LOSE_ALL',reason:`${p.name} 的理智归零，邪神复活，无人幸存！全员失败！`};
    }
  }
  // 2. 非追猎者全灭：有追猎者则追猎者获胜；无追猎者则全员失败
  const nonHunters=players.filter(p=>p.role!==ROLE_HUNTER);
  if(nonHunters.length&&nonHunters.every(p=>p.isDead)){
    if(hasHunters){
      const ws=players.filter(q=>q.role===ROLE_HUNTER).map(q=>q.name).join('、');
      return{winner:ROLE_HUNTER,reason:`所有非追猎者已覆灭！追猎者（${ws}）获胜！`};
    }else{
      return{winner:'LOSE_ALL',reason:'所有探险者均已覆灭，无人幸存！全员失败！'};
    }
  }
  // 3. 场上只有一人存活：寻宝者获胜或邪祀者阵营获胜
  const alivePlayers=players.filter(p=>!p.isDead);
  if(alivePlayers.length===1){
    const survivor=alivePlayers[0];
    if(survivor.role===ROLE_TREASURE){
      return{winner:ROLE_TREASURE,reason:`${survivor.name} 是唯一的幸存者，成功逃离！`};
    }else if(survivor.role===ROLE_CULTIST){
      return{winner:ROLE_CULTIST,reason:`${survivor.name} 是唯一的幸存者，邪祀者阵营获胜！`};
    }
    // 追猎者单独存活的情况已被条件2覆盖
  }
  // 4. Player death — single-player only (MP games continue when a player dies)
  if(!isMP&&players[0].isDead)return{winner:'LOSE',reason:'你已沉入永恒的黑暗…'};
  return null;
}

// ══════════════════════════════════════════════════════════════
//  GOD ENCOUNTER HELPERS
// ══════════════════════════════════════════════════════════════
// Resolve god encounter for an AI player (auto-decide worship/upgrade/discard/hand).
// Note: SAN cost from encounter counter is applied BEFORE calling this.
// forcedConvert=true means target already worships a different god (no choice, must switch).
function shouldTriggerGodResurrection(gs){
  if(!gs?.players?.length)return false;
  const hasCultists=gs.players.some(p=>p.role===ROLE_CULTIST);
  if(!hasCultists)return false;
  return gs.players.some(p=>!p.isDead&&p.san<=0&&p.hp>0);
}

function resolveGodEncounterForAI(ci,godCard,P,D,Disc,gs,forcedConvert){
  const msgs=[];const godKey=godCard.godKey;
  let inspectionMeta=makeInspectionMeta(gs);
  P=P.map(p=>({...p,godZone:[...(p.godZone||[])]})); // shallow copy godZone arrays
  if(forcedConvert&&P[ci].godName&&P[ci].godName!==godKey){
    msgs.push(`${P[ci].name} 被迫改信新神，SAN-1`);
    const inspectionBaseLog=[...(Array.isArray(gs?.log)?gs.log:[]),...msgs];
    const processed=applySanLossToPlayerWithInspection(ci,1,gs?.currentTurn??ci,P,D,Disc,inspectionBaseLog,inspectionMeta);
    P=processed.P;D=processed.D;Disc=processed.Disc;inspectionMeta=processed.inspectionMeta;
    const extraMsgs=(processed.L||[]).slice(inspectionBaseLog.length);if(extraMsgs.length)msgs.push(...extraMsgs);
    clearPlayerGodZone(P[ci],Disc);
  }
  let action;
  if(P[ci].godName===godKey&&P[ci].godLevel<3){action='upgrade';}
  else if(P[ci].godName===godKey&&P[ci].godLevel>=3){action='discard';}
  else if(!P[ci].godName){
    // If forcedConvert just cleared old god, always worship new god (rule: cannot refuse)
    if(forcedConvert){action='worship';}
    else if((P[ci]._nyaBorrow||P[ci].role)===ROLE_CULTIST&&Math.random()<0.6){action='hand';}
    else if(P[ci].san>4){action='worship';}
    else{action='discard';}
  } else {action='discard';}
  if(action==='upgrade'){
    P[ci].godLevel++;P[ci].godZone.push({...godCard});
    msgs.push(`${P[ci].name} 邪神之力升至Lv.${P[ci].godLevel}（${godCard.power}）`);
    P.forEach((p,i)=>{if(i!==ci&&p.godName===godKey){
      const abandonBaseLog=[...(Array.isArray(gs?.log)?gs.log:[]),...msgs];
      const abandoned=abandonGodFollower(i,gs?.currentTurn??ci,P,D,Disc,abandonBaseLog,inspectionMeta);
      P=abandoned.P;D=abandoned.D;Disc=abandoned.Disc;inspectionMeta=abandoned.inspectionMeta;
      const extraMsgs=(abandoned.L||[]).slice(abandonBaseLog.length);if(extraMsgs.length)msgs.push(...extraMsgs);
    }});
  } else if(action==='worship'){
    P[ci].godName=godKey;P[ci].godLevel=1;P[ci].godZone=[{...godCard}];
    msgs.push(`${P[ci].name} 信仰了 ${godCard.name}，获得${godCard.power}(Lv.1)`);
    P.forEach((p,i)=>{if(i!==ci&&p.godName===godKey){
      const abandonBaseLog=[...(Array.isArray(gs?.log)?gs.log:[]),...msgs];
      const abandoned=abandonGodFollower(i,gs?.currentTurn??ci,P,D,Disc,abandonBaseLog,inspectionMeta);
      P=abandoned.P;D=abandoned.D;Disc=abandoned.Disc;inspectionMeta=abandoned.inspectionMeta;
      const extraMsgs=(abandoned.L||[]).slice(abandonBaseLog.length);if(extraMsgs.length)msgs.push(...extraMsgs);
    }});
  } else if(action==='hand'){
    P[ci].hand.push({...godCard});msgs.push(`${P[ci].name}（邪祀者）将邪神牌收入手牌`);
  } else {
    Disc.push({...godCard});msgs.push(`${P[ci].name} 放弃了邪神的馈赠`);
  }
  return{P,D,Disc,msgs,inspectionMeta};
}

// Apply god encounter SAN cost and resolve for AI
function aiHandleGodCard(ci,godCard,P,D,Disc,L,gs,skipEffectMsg=false){
  const sanCost=P[ci].godEncounters||0;
  // 邪祀者遭遇邪神时不扣减SAN且强制亮明身份
  if(!skipEffectMsg){
    let effectMsg = '';
    if (P[ci].role === ROLE_CULTIST) {
      P[ci].roleRevealed = true;
      effectMsg = `${P[ci].name}（邪祀者）遭遇邪神 ${godCard.name}！（第${P[ci].godEncounters}次）免疫SAN损耗`;
    } else {
      effectMsg = `${P[ci].name} 遭遇邪神 ${godCard.name}！（第${P[ci].godEncounters}次）失去${sanCost}SAN`;
    }
    L.push(effectMsg);
  }
  const forcedConvert=!!(P[ci].godName&&P[ci].godName!==godCard.godKey);
  const gres=resolveGodEncounterForAI(ci,godCard,P,D,Disc,gs,forcedConvert);
  P=gres.P;D=gres.D;Disc=gres.Disc;
  L.push(...gres.msgs);
  return{P,D,Disc,L,inspectionMeta:gres.inspectionMeta};
}

function getHunterChaseTargets(players,hunterIdx,huntAbandoned=[]){
  return players
    .map((player,idx)=>({player,idx}))
    .filter(({player,idx})=>!player.isDead && idx!==hunterIdx && player.role!==ROLE_HUNTER && !huntAbandoned.includes(idx))
    .filter(({player})=>(player.hand||[]).some(isZoneCard));
}

function shouldHunterKeepChasing(players,hunterIdx,huntAbandoned=[]){
  const hunter=players[hunterIdx];
  if(!hunter||hunter.isDead)return false;
  const hunterZoneCards=(hunter.hand||[]).filter(isZoneCard);
  const hunterHandLimit=hunter._nyaHandLimit??4;
  const hunterOverLimit=hunterZoneCards.length>hunterHandLimit;
  const someoneWounded=players.some((p,i)=>i!==hunterIdx&&!p.isDead&&p.hp<10);
  return hunterZoneCards.length>0 && getHunterChaseTargets(players,hunterIdx,huntAbandoned).length>0 && (hunterOverLimit||someoneWounded);
}

// ══════════════════════════════════════════════════════════════
//  GENERIC CARD HANDLING
// ══════════════════════════════════════════════════════════════
function handleCardDraw(ci, ps, deck, disc, isAI = false, gs = {}) {
  let P = copyPlayers(ps), D = [...deck], Disc = [...disc];
  if (!D.length && Disc.length) { D = shuffle(Disc); Disc = []; }
  if (!D.length) return { P, D, Disc, drawnCard: null, effectMsgs: [], needsDecision: false };
  
  const drawnCard = D.shift();
  const whoName = ci === 0 ? '你' : P[ci].name;
  
  // God card handling
  if (drawnCard.isGod) {
    P[ci].godEncounters = (P[ci].godEncounters || 0) + 1;
    const cost = P[ci].godEncounters;
    // 邪祀者遭遇邪神时不扣减SAN且强制亮明身份
    if (P[ci].role === ROLE_CULTIST) {
      P[ci].roleRevealed = true;
    }
    
    if (isAI) {
      let L2 = [];
      let inspectionMeta=makeInspectionMeta(gs);
      let effectMsg = P[ci].role === ROLE_CULTIST 
        ? `${whoName}（邪祀者）遭遇邪神 ${drawnCard.name}！（第${P[ci].godEncounters}次）免疫SAN损耗`
        : `${whoName} 遭遇邪神 ${drawnCard.name}！（第${P[ci].godEncounters}次）失去${cost}SAN`;
      L2.push(effectMsg);
      // AI处理邪神牌时，仍然立即扣减SAN值
      if (P[ci].role !== ROLE_CULTIST) {
        P[ci].san = clamp(P[ci].san - cost);const newSan=P[ci].san;{const baseLog=gs?.log||[];const processed=applyInspectionForSanLoss(ci,newSan,gs?.currentTurn??ci,P,D,Disc,baseLog,inspectionMeta);P=processed.P;D=processed.D;Disc=processed.Disc;inspectionMeta=processed.inspectionMeta;L2.push(...processed.log.slice(baseLog.length));}
      }
      const gr = aiHandleGodCard(ci, drawnCard, P, D, Disc, L2, gs, true);
      P = gr.P; D = gr.D; Disc = gr.Disc;
      return { P, D, Disc, drawnCard, effectMsgs: L2, kept: true, statePatch:{...inspectionMeta,...(gr.inspectionMeta||{})} };
    } else {
      let effectMsg = P[ci].role === ROLE_CULTIST 
        ? `${whoName}（邪祀者）遭遇邪神 ${drawnCard.name}！（第${P[ci].godEncounters}次）免疫SAN损耗`
        : `${whoName} 遭遇邪神 ${drawnCard.name}！（第${P[ci].godEncounters}次）失去${cost}SAN`;
      
      let inspectionMeta = makeInspectionMeta(gs);
      let effectMsgs = [effectMsg];
      
      if (P[ci].role !== ROLE_CULTIST && cost > 0) {
        P[ci].san = clamp(P[ci].san - cost);
        const newSan = P[ci].san;
        const baseLog=gs?.log?[...gs.log, effectMsg]:[effectMsg];
        const processed = applyInspectionForSanLoss(ci, newSan, gs?.currentTurn ?? ci, P, D, Disc, baseLog, inspectionMeta);
        P = processed.P; D = processed.D; Disc = processed.Disc; 
        inspectionMeta = processed.inspectionMeta;
        effectMsgs.push(...processed.log.slice(baseLog.length));
      }

      return { P, D, Disc, drawnCard,
        effectMsgs,
        needGodChoice: true, needsDecision: false,
        godEncounterCost: 0,
        statePatch: inspectionMeta };
    }
  }
  
  // Forced trigger cards
  if (drawnCard.forced) {
    const res = applyFx(drawnCard, ci, null, P, D, Disc, gs, false, [], isAI);
    P = res.P; D = res.D; Disc = res.Disc; P[ci].hand.push(drawnCard);
    return { P, D, Disc, drawnCard, effectMsgs: [`${whoName} 摸到 ${cardLogText(drawnCard,{alwaysShowName:true})}（强制触发）`, ...res.msgs], statePatch: res.statePatch, kept: true, needsDecision: false };
  }
  
  // 穴居人战争隐藏规则1：如果摸到"穴居人战争"之前没有牌，强制展示"穴居人战争"
  if (drawnCard.type === 'caveDuel' && P[ci].hand.length === 0) {
    // 强制展示穴居人战争
    P[ci].hand.push(drawnCard);
    const logMsg = `${whoName} 摸到 ${cardLogText(drawnCard,{alwaysShowName:true})}，之前没有牌，强制展示！`;
    return { P, D, Disc, drawnCard, effectMsgs: [logMsg], kept: true, needsDecision: false };
  }
  
  // AI auto-decision
  if (isAI) {
    const keepOverride = ci===1&&gs?.debugForceCardKeepPending
      ? gs.debugForceCardKeepPending
      : 'auto';
    const keep = keepOverride==='keep' ? true : keepOverride==='discard' ? false : aiShouldKeepZoneCard(drawnCard, ci, P, false);
    if (!keep) {
      Disc.push(drawnCard);
      return { P, D, Disc, drawnCard, effectMsgs: [`${P[ci].name} 摸到 ${cardLogText(drawnCard,{alwaysShowName:true})}，评估后选择弃置`], needsDecision: false, _aiDrawnCard: drawnCard, discardedDrawnCard: true };
    }
    
    // AI Treasure Hunter dodge logic
    const effectiveRole = P[ci]._nyaBorrow || P[ci].role;
    const isTreasureHunter = effectiveRole === ROLE_TREASURE;
    const isNegativeEffect = isNegativeZoneCard(drawnCard);
    
    if (isTreasureHunter && isNegativeEffect) {
      P[ci].roleRevealed = true;
      const d1 = 1 + (Math.random() * 6 | 0);
      const dodgeSuccess = d1 >= 4;
      if (dodgeSuccess) {
        const res = applyFx(drawnCard, ci, null, P, D, Disc, gs, true, [], isAI);
        P = res.P; D = res.D; Disc = res.Disc; P[ci].hand.push(drawnCard);
        return { P, D, Disc, drawnCard, effectMsgs: [`${P[ci].name}（寻宝者）摸到 ${cardLogText(drawnCard,{alwaysShowName:true})}，掷出 ${d1} 点，成功规避负面效果！`, ...res.msgs], statePatch: res.statePatch, kept: true, needsDecision: false, _aiDrawnCard: drawnCard };
      }
    }
    
    // Apply effect for AI
    const res = applyFx(drawnCard, ci, null, P, D, Disc, gs, false, [], isAI);
    P = res.P; D = res.D; Disc = res.Disc; P[ci].hand.push(drawnCard);
    return { P, D, Disc, drawnCard, effectMsgs: [`${P[ci].name} 摸到 ${cardLogText(drawnCard,{alwaysShowName:true})}，选择收入手牌并触发效果`, ...res.msgs], statePatch: res.statePatch, kept: true, needsDecision: false, _aiDrawnCard: drawnCard };
  }
  
  // Player needs decision
  return { P, D, Disc, drawnCard, effectMsgs: [], needTarget: false, needsDecision: true, forcedKeep: false };
}

// ══════════════════════════════════════════════════════════════
//  AI DRAW
// ══════════════════════════════════════════════════════════════
function aiDrawAndApply(ci, ps, deck, disc, gs = {}) {
  return handleCardDraw(ci, ps, deck, disc, true, gs);
}

// ══════════════════════════════════════════════════════════════
//  PLAYER DRAW
// ══════════════════════════════════════════════════════════════
function playerDrawCard(ps, deck, disc, ci = 0, gs = {}) {
  return handleCardDraw(ci, ps, deck, disc, false, gs);
}

// ══════════════════════════════════════════════════════════════
//  TURN ADVANCE  (adds skillUsed:false reset for player turn)
// ══════════════════════════════════════════════════════════════
function startNextTurn(gs){
  const N=gs.players.length;
  let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard],L=[...gs.log];
  const _P_beforeTurn=copyPlayers(P);
  let next=gs.currentTurn;
  let turnStartLogs=[];
  let drawLogs=[];
  let statLogs=[];
  let preTurnStatLogs=[];
  for(let i=1;i<=N;i++){next=(gs.currentTurn+i)%N;if(!P[next].isDead)break;}
  // 增加回合数
  const newTurn=(gs.turn||0)+1;
  // Clear any NYA temp borrow for the player whose turn just ended
  if(P[gs.currentTurn]&&P[gs.currentTurn]._nyaBorrow)delete P[gs.currentTurn]._nyaBorrow;
  if(P[gs.currentTurn]&&P[gs.currentTurn]._nyaHandLimit)delete P[gs.currentTurn]._nyaHandLimit;
  if(P[gs.currentTurn]&&P[gs.currentTurn].damageBonus)delete P[gs.currentTurn].damageBonus;
  // 清理过期的两人一绳链条
  P.forEach((p,i)=>{
    const shouldExpire = p.damageLink && (
      p.damageLink.expiryOwner===next ||
      (p.damageLink.expiryOwner!=null && (!P[p.damageLink.expiryOwner] || P[p.damageLink.expiryOwner].isDead)) ||
      (p.damageLink.expiryOwner==null && p.damageLink.expiryTurn<=newTurn)
    );
    if(shouldExpire){
      // 如果链条仍然激活，双方各回复4HP
      if(p.damageLink.active){
        const partnerIdx=p.damageLink.partner;
        if(P[partnerIdx]&&!P[partnerIdx].isDead){
          const healAmount=4;
          P[i].hp=clamp(P[i].hp+healAmount);
          P[partnerIdx].hp=clamp(P[partnerIdx].hp+healAmount);
          const linkMsg=`【两人一绳】绳索未断裂！${P[i].name} 和 ${P[partnerIdx].name} 各回复 ${healAmount} HP`;
          L.push(linkMsg);
          preTurnStatLogs.push(linkMsg);
        }
      }
      if(p.damageLink?.partner!=null&&P[p.damageLink.partner]?.damageLink?.partner===i){
        delete P[p.damageLink.partner].damageLink;
      }
      delete p.damageLink;
    }
    // 重置当前回合生效的检定牌相关状态
    p.disableRest = false;
    p.disableSkill = false;
    p.handLimitDecrease = 0;
  });
  // 结转“下一回合生效”的检定牌负面状态
  if(P[next]){
    P[next].disableRest = !!P[next].disableRestNextTurn;
    P[next].disableSkill = !!P[next].disableSkillNextTurn;
    P[next].handLimitDecrease = P[next].handLimitDecreaseNextTurn || 0;
    P[next].disableRestNextTurn = false;
    P[next].disableSkillNextTurn = false;
    P[next].handLimitDecreaseNextTurn = 0;
  }
  let globalOnlySwapOwner=gs.globalOnlySwapOwner;
  if(globalOnlySwapOwner===next){
    globalOnlySwapOwner=null;
    L.push('“全员技能变为掉包”的效果结束了');
  }
  // If this player was resting: wake up (flip card face-up), skip their turn entirely
  if(P[next].isResting){
    P[next].isResting=false;
    turnStartLogs=[`── ${P[next].name} 的回合开始 ──`];
    L.push(...turnStartLogs);
    L.push(`${P[next].name} 从休息中醒来，跳过本回合`);
    // CTH power: draw when ending/skipping turn while face-down
    if(P[next].godName==='CTH'&&P[next].godLevel>=1){
      const extraDraws=P[next].godLevel; // lv1→1, lv2→2, lv3→3
      const whoName=localDisplayName(next,P[next].name);
      L.push(`${whoName}（克苏鲁信徒Lv.${P[next].godLevel}）梦访拉莱耶，翻面跳过回合时额外摸${extraDraws}张牌`);
      let cthRestDraws=[];
      let cthRestDrawLogs=[];
      const _P_beforeCthDraws=copyPlayers(P);
      for(let _d=0;_d<extraDraws;_d++){
        const r2=playerDrawCard(P,D,Disc,next,gs);P=r2.P;D=r2.D;Disc=r2.Disc;
        if(r2.drawnCard){
          L.push(`  摸到 ${cardLogText(r2.drawnCard,{alwaysShowName:true})}`);
          if(next===0)cthRestDraws.push(r2.drawnCard);
        }
        if(r2.needGodChoice){
          // AI角色不会触发神牌选择UI，直接处理
          if(next===0){
            const drawLogs=[`${whoName} 摸到 ${cardLogText(r2.drawnCard,{alwaysShowName:true})}`];
            return{...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:next,skillUsed:false,restUsed:false,huntAbandoned:[],godFromHandUsed:false,godTriggeredThisTurn:true,phase:'GOD_CHOICE',abilityData:{godCard:r2.drawnCard,fromRest:true,cthDrawsRemaining:extraDraws-_d-1,drawerIdx:0},drawReveal:null,selectedCard:null,globalOnlySwapOwner,_turnStartLogs:turnStartLogs,_drawLogs:drawLogs,_statLogs:[],_cthRestDraws:cthRestDraws,_cthRestDrawLogs:cthRestDrawLogs,_playersBeforeCthDraws:_P_beforeCthDraws};
          }
        }
        if(r2.needsDecision){
          // AI角色自动处理决策
          if(next===0){
            const split=splitAnimBoundLogs(r2.effectMsgs||[]);
            const drawLogs=[`${whoName} 摸到 ${cardLogText(r2.drawnCard,{alwaysShowName:true})}`,...split.preStat];
            return{...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:next,skillUsed:false,restUsed:false,huntAbandoned:[],godFromHandUsed:false,godTriggeredThisTurn:false,phase:'DRAW_REVEAL',drawReveal:{card:r2.drawnCard,msgs:[],needsDecision:true,forcedKeep:false,drawerIdx:0,drawerName:P[0].name,fromRest:true},selectedCard:null,abilityData:{fromRest:true,cthDrawsRemaining:extraDraws-_d-1},globalOnlySwapOwner,_turnStartLogs:turnStartLogs,_drawLogs:drawLogs,_statLogs:split.stat,_cthRestDraws:cthRestDraws,_cthRestDrawLogs:cthRestDrawLogs,_playersBeforeCthDraws:_P_beforeCthDraws};
          }else{
            // AI角色自动选择收入手牌
            const aiRes=applyFx(r2.drawnCard,next,null,P,D,Disc,gs);
            P=aiRes.P;D=aiRes.D;Disc=aiRes.Disc;P[next].hand.push(r2.drawnCard);
            if(aiRes.msgs.length)L.push(...aiRes.msgs);
          }
        }
        // forced card: already applied, continue
        if(r2.kept){
          if(r2.effectMsgs.length){
            L.push(...r2.effectMsgs);
            if(next===0)cthRestDrawLogs.push(...r2.effectMsgs);
          }
          continue;
        }
      }
      if(next===0&&cthRestDraws.length>0){
        const nextGs=startNextTurn({...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:next,skillUsed:false,restUsed:false,godFromHandUsed:false,godTriggeredThisTurn:false,globalOnlySwapOwner});
        return{...nextGs,_cthRestDraws:cthRestDraws,_cthRestDrawLogs:cthRestDrawLogs,_playersBeforeCthDraws:_P_beforeCthDraws};
      }
    }
    // Skip the turn: advance past player to the next living player
    // Hand limit is NOT enforced here — excess cards are kept until the next normal turn ends
    return startNextTurn({...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:next,skillUsed:false,restUsed:false,godFromHandUsed:false,godTriggeredThisTurn:false,globalOnlySwapOwner});
  }
  turnStartLogs=[`── ${P[next].name} 的回合开始 ──`];
  L.push(...turnStartLogs);
  if(next===0){
    // Debug: 强制摸牌 - 玩家
    if(gs.debugForceCard && gs.debugForceCardTarget === 'player'){
      // 将指定的牌放在牌堆顶部
      D.unshift(gs.debugForceCard);
      gs.debugForceCardKeepPending = gs.debugForceCardKeep || 'auto';
      // 清除debug设置，避免后续回合再次触发
      gs.debugForceCard = null;
      gs.debugForceCardTarget = null;
    }
    // NYA power: borrow dead role before drawing
    if(P[0].godName==='NYA'&&P[0].godLevel>=1){
      const deadOthers=P.filter((p,i)=>i>0&&p.isDead);
      if(deadOthers.length>0){
        return{...gs,players:P,deck:D,discard:Disc,log:[...L,'你的邪神之力「千人千貌」：可借用已死角色的身份'],currentTurn:0,skillUsed:false,restUsed:false,huntAbandoned:[],godFromHandUsed:false,godTriggeredThisTurn:false,phase:'NYA_BORROW',abilityData:{},drawReveal:null,selectedCard:null,globalOnlySwapOwner,debugForceCard:null,debugForceCardTarget:null};
      }
    }
    // 检查是否需要跳过摸牌
    if(P[0].skipNextDraw){
      delete P[0].skipNextDraw;
      L.push('你因扭伤而无法摸牌');
      const win=checkWin(P,gs._isMP);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win,turn:newTurn,debugForceCard:null,debugForceCardTarget:null};
      return{...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:0,skillUsed:false,restUsed:false,huntAbandoned:[],godFromHandUsed:false,godTriggeredThisTurn:false,phase:'ACTION',drawReveal:null,selectedCard:null,abilityData:{},globalOnlySwapOwner,turn:newTurn,debugForceCard:null,debugForceCardTarget:null};
    }
    const _P_beforeDraw=copyPlayers(P);
    const res=playerDrawCard(P,D,Disc,0,gs);
    P=res.P;D=res.D;Disc=res.Disc;
    // 多人游戏中记录玩家0摸牌信息到日志，让其他玩家可见（单机不需要，DRAW_REVEAL 时可见）
    if(res.drawnCard&&!res.kept){
      drawLogs.push(`${gs._isMP?P[0].name:'你'} 摸到 ${cardLogText(res.drawnCard,{alwaysShowName:true})}`);
    }
    if(res.effectMsgs?.length){
      const split=splitAnimBoundLogs(res.effectMsgs);
      drawLogs.push(...split.preStat);
      statLogs.push(...split.stat);
    }
    if(drawLogs.length)L.push(...drawLogs);
    if(statLogs.length)L.push(...statLogs);
    if(!res.drawnCard){L.push('牌堆耗尽！');return{...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:0,phase:'ACTION',drawReveal:null,abilityData:{},skillUsed:false,restUsed:false,huntAbandoned:[],godFromHandUsed:false,godTriggeredThisTurn:false,globalOnlySwapOwner,turn:newTurn,_turnStartLogs:turnStartLogs,_drawLogs:drawLogs,_statLogs:statLogs,_preTurnPlayers:_P_beforeTurn,_preTurnStatLogs:preTurnStatLogs};}
    if(res.needGodChoice){return{...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:0,skillUsed:false,restUsed:false,huntAbandoned:[],godFromHandUsed:false,godTriggeredThisTurn:true,phase:'GOD_CHOICE',abilityData:{godCard:res.drawnCard,drawerIdx:0,godEncounterCost:res.godEncounterCost},drawReveal:null,selectedCard:null,globalOnlySwapOwner,_playersBeforeThisDraw:_P_beforeDraw,turn:newTurn,_turnStartLogs:turnStartLogs,_drawLogs:drawLogs,_statLogs:statLogs,_preTurnPlayers:_P_beforeTurn,_preTurnStatLogs:preTurnStatLogs};}
    const playerTurnAnimMeta={
      currentTurn:0,
      turn:newTurn,
      skillUsed:false,
      restUsed:false,
      huntAbandoned:[],
      godFromHandUsed:false,
      godTriggeredThisTurn:false,
      phase:res.kept?'ACTION':'DRAW_REVEAL',
      drawReveal:res.drawnCard?{
        card:res.drawnCard,
        msgs:res.effectMsgs,
        needsDecision:!!res.needsDecision,
        forcedKeep:!!res.forcedKeep,
        drawerIdx:0,
        drawerName:P[0].name,
      }:null,
      selectedCard:null,
      abilityData:{},
      globalOnlySwapOwner,
      _playersBeforeThisDraw:_P_beforeDraw,
      _turnStartLogs:turnStartLogs,
      _drawLogs:drawLogs,
      _statLogs:statLogs,
      _preTurnPlayers:_P_beforeTurn,
      _preTurnStatLogs:preTurnStatLogs,
      ...(res.statePatch||{}),
    };
    const win=checkWin(P,gs._isMP);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win,...playerTurnAnimMeta};
    // 强制触发牌：效果已执行，直接进入 ACTION；drawReveal 保留卡牌供翻牌动画使用，但不广播 DRAW_REVEAL
    if(res.kept){
      return{...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:0,skillUsed:false,restUsed:false,huntAbandoned:[],godFromHandUsed:false,godTriggeredThisTurn:false,
        phase:'ACTION',
        drawReveal:{card:res.drawnCard,msgs:res.effectMsgs,needsDecision:false,forcedKeep:false,drawerIdx:0,drawerName:P[0].name},
        selectedCard:null,abilityData:{},globalOnlySwapOwner,_playersBeforeThisDraw:_P_beforeDraw,turn:newTurn,_turnStartLogs:turnStartLogs,_drawLogs:drawLogs,_statLogs:statLogs,_preTurnPlayers:_P_beforeTurn,_preTurnStatLogs:preTurnStatLogs,...(res.statePatch||{})};
    }
    return{...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:0,skillUsed:false,restUsed:false,huntAbandoned:[],godFromHandUsed:false,godTriggeredThisTurn:false,
      phase:'DRAW_REVEAL',
      drawReveal:{card:res.drawnCard,msgs:res.effectMsgs,needsDecision:!!res.needsDecision,forcedKeep:!!res.forcedKeep,drawerIdx:0,drawerName:P[0].name},
      selectedCard:null,abilityData:{},globalOnlySwapOwner,_playersBeforeThisDraw:_P_beforeDraw,turn:newTurn,_turnStartLogs:turnStartLogs,_drawLogs:drawLogs,_statLogs:statLogs,_preTurnPlayers:_P_beforeTurn,_preTurnStatLogs:preTurnStatLogs};
  }else if(gs._isMP){
    // Multiplayer: next player is human — draw their card and enter DRAW_REVEAL
    // 检查是否需要跳过摸牌
    if(P[next].skipNextDraw){
      delete P[next].skipNextDraw;
      L.push(`${P[next].name} 因扭伤而无法摸牌`);
      const win=checkWin(P,true);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win};
      return{...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:next,skillUsed:false,restUsed:false,huntAbandoned:[],godFromHandUsed:false,godTriggeredThisTurn:false,phase:'ACTION',drawReveal:null,selectedCard:null,abilityData:{},_isMP:gs._isMP,globalOnlySwapOwner};
    }
    const res=playerDrawCard(P,D,Disc,next,gs);
    P=res.P;D=res.D;Disc=res.Disc;
    // 记录摸牌信息到日志（与单机AI摸牌保持一致：[key] 名称）
    if(res.drawnCard&&!res.kept)drawLogs.push(`${P[next].name} 摸到 ${cardLogText(res.drawnCard,{alwaysShowName:true})}`);
    if(res.effectMsgs?.length){
      const split=splitAnimBoundLogs(res.effectMsgs);
      drawLogs.push(...split.preStat);
      statLogs.push(...split.stat);
    }
    if(drawLogs.length)L.push(...drawLogs);
    if(statLogs.length)L.push(...statLogs);
    if(!res.drawnCard){L.push('牌堆耗尽！');return{...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:next,phase:'ACTION',drawReveal:null,abilityData:{},skillUsed:false,restUsed:false,huntAbandoned:[],godFromHandUsed:false,godTriggeredThisTurn:false,globalOnlySwapOwner,_turnStartLogs:turnStartLogs,_drawLogs:drawLogs,_statLogs:statLogs,_preTurnPlayers:_P_beforeTurn,_preTurnStatLogs:preTurnStatLogs};}
    if(res.needGodChoice){return{...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:next,skillUsed:false,restUsed:false,huntAbandoned:[],godFromHandUsed:false,godTriggeredThisTurn:true,phase:'GOD_CHOICE',abilityData:{godCard:res.drawnCard,godEncounterCost:res.godEncounterCost},drawReveal:null,selectedCard:null,_isMP:gs._isMP,globalOnlySwapOwner,_turnStartLogs:turnStartLogs,_drawLogs:drawLogs,_statLogs:statLogs,_preTurnPlayers:_P_beforeTurn,_preTurnStatLogs:preTurnStatLogs};}
    const win=checkWin(P,true);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win};
    // 强制触发牌：效果已执行，直接进入 ACTION；不向其他玩家广播 DRAW_REVEAL 界面
    if(res.kept){
      return{...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:next,skillUsed:false,restUsed:false,huntAbandoned:[],godFromHandUsed:false,godTriggeredThisTurn:false,
        phase:'ACTION',
        drawReveal:{card:res.drawnCard,msgs:res.effectMsgs,needsDecision:false,forcedKeep:false,drawerIdx:next,drawerName:P[next].name},
        selectedCard:null,abilityData:{},_isMP:gs._isMP,globalOnlySwapOwner,_turnStartLogs:turnStartLogs,_drawLogs:drawLogs,_statLogs:statLogs,_preTurnPlayers:_P_beforeTurn,_preTurnStatLogs:preTurnStatLogs,...(res.statePatch||{})};
    }
    return{...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:next,skillUsed:false,restUsed:false,huntAbandoned:[],godFromHandUsed:false,godTriggeredThisTurn:false,
      phase:'DRAW_REVEAL',
      drawReveal:{card:res.drawnCard,msgs:res.effectMsgs,needsDecision:!!res.needsDecision,forcedKeep:!!res.forcedKeep,drawerIdx:next,drawerName:P[next].name},
      selectedCard:null,abilityData:{},_isMP:gs._isMP,globalOnlySwapOwner,_turnStartLogs:turnStartLogs,_drawLogs:drawLogs,_statLogs:statLogs,_preTurnPlayers:_P_beforeTurn,_preTurnStatLogs:preTurnStatLogs};
  }else{
    // NYA power: AI borrows a dead role before drawing
    if(P[next].godName==='NYA'&&P[next].godLevel>=1){
      const deadPlayers=P.filter((p,i)=>i>0&&p.isDead&&i!==next);
      if(deadPlayers.length){
        // Prefer borrowing 追猎者 if hunter, else pick best available
        const aiRole=P[next].role;
        let borrow=deadPlayers[0];
        if(aiRole===ROLE_CULTIST)borrow=deadPlayers.find(p=>p.role===ROLE_HUNTER)||deadPlayers[0];
        const handLimit=4-(GOD_DEFS.NYA.levels[P[next].godLevel-1].handPenalty);
        P[next]={...P[next],_nyaBorrow:borrow.role,_nyaHandLimit:handLimit};
        L.push(`${P[next].name}（NYA Lv.${P[next].godLevel}）千人千貌：本回合借用 [${borrow.role}]`);
      }
    }
    // 检查是否需要跳过摸牌
    if(P[next].skipNextDraw){
      delete P[next].skipNextDraw;
      L.push(`${P[next].name} 因扭伤而无法摸牌`);
      const win=checkWin(P,gs._isMP);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win,debugForceCard:null,debugForceCardTarget:null};
      return startNextTurn({...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:next,skillUsed:false,restUsed:false,godFromHandUsed:false,godTriggeredThisTurn:false,globalOnlySwapOwner,debugForceCard:null,debugForceCardTarget:null});
    }
    // Debug: 强制摸牌 - AI1
    if(gs.debugForceCard && gs.debugForceCardTarget === 'ai1' && next === 1){ // 假设第一名AI的索引是1
      // 将指定的牌放在牌堆顶部
      D.unshift(gs.debugForceCard);
      // 清除debug设置，避免后续回合再次触发
      gs.debugForceCard = null;
      gs.debugForceCardTarget = null;
    }
    const _P_beforeDraw=copyPlayers(P);
    const res=aiDrawAndApply(next,P,D,Disc,gs);
    gs.debugForceCardKeepPending = null;
    P=res.P;D=res.D;Disc=res.Disc;
    if(res.drawnCard&&isLocalDebugEnabled()){
      const debugDrawLog=`[调试] ${P[next].name}（${P[next]._nyaBorrow||P[next].role}）起手摸到 ${cardLogText(res.drawnCard,{alwaysShowName:true})}`;
      turnStartLogs.push(debugDrawLog);
      L.push(debugDrawLog);
    }
    if(res.effectMsgs?.length){
      const split=splitAnimBoundLogs(res.effectMsgs);
      drawLogs.push(...split.preStat);
      statLogs.push(...split.stat);
      if(drawLogs.length)L.push(...drawLogs);
      if(statLogs.length)L.push(...statLogs);
    }
    let nextPhase='AI_TURN';
    if(res.statePatch?.abilityData?.type==='firstComePick')nextPhase='FIRST_COME_PICK_SELECT';
    else if(res.statePatch?.peekHandTargets)nextPhase='PEEK_HAND_SELECT_TARGET';
    else if(res.statePatch?.damageLinkTargets)nextPhase='DAMAGE_LINK_SELECT_TARGET';
    const nextAbilityData={
      ...gs.abilityData,
      ...(res.statePatch?.abilityData||{}),
      ...(res.statePatch?.peekHandTargets?{
        peekHandTargets:res.statePatch.peekHandTargets,
        peekHandSource:res.statePatch.peekHandSource,
      }:{}),
      ...(res.statePatch?.damageLinkTargets?{
        damageLinkTargets:res.statePatch.damageLinkTargets,
        damageLinkSource:res.statePatch.damageLinkSource,
      }:{}),
      ...(res.statePatch?.caveDuelTargets?{
        caveDuelTargets:res.statePatch.caveDuelTargets,
        caveDuelSource:res.statePatch.caveDuelSource,
      }:{}),
      ...(res.statePatch?.roseThornTargets?{
        roseThornTargets:res.statePatch.roseThornTargets,
        roseThornSource:res.statePatch.roseThornSource,
      }:{}),
    };
    const aiTurnAnimMeta={
      currentTurn:next,
      phase:nextPhase,
      drawReveal:null,
      selectedCard:null,
      abilityData:nextAbilityData,
      huntAbandoned:[],
      _aiDrawnCard:res.drawnCard??null,
      _drawnCard:res.drawnCard??null,
      _discardedDrawnCard:!!res.discardedDrawnCard,
      _playersBeforeThisDraw:_P_beforeDraw,
      _turnKey:(gs._turnKey||0)+1,
      _turnStartLogs:turnStartLogs,
      _drawLogs:drawLogs,
      _statLogs:statLogs,
      _preTurnPlayers:_P_beforeTurn,
      _preTurnStatLogs:preTurnStatLogs,
    };
    const win=checkWin(res.P,gs._isMP);if(win)return{...gs,players:res.P,deck:D,discard:Disc,log:L,gameOver:win,...aiTurnAnimMeta,...(res.statePatch||{}),globalOnlySwapOwner:(res.statePatch?.globalOnlySwapOwner??globalOnlySwapOwner)};
    if(!res.P[next].isDead&&res.P[next].role===ROLE_TREASURE&&isWinHand(res.P[next].hand)){
      res.P[next].roleRevealed=true;
      return{
        ...gs,
        players:res.P,
        deck:D,
        discard:Disc,
        log:[...L,`${res.P[next].name} 集齐全部编号并获胜！`],
        gameOver:{winner:ROLE_TREASURE,reason:`${res.P[next].name} 集齐了全部编号并获胜！`,winnerIdx:next},
        ...aiTurnAnimMeta,
        ...(res.statePatch||{}),
        globalOnlySwapOwner:(res.statePatch?.globalOnlySwapOwner??globalOnlySwapOwner)
      };
    }
    return{...gs,players:res.P,deck:D,discard:Disc,log:L,currentTurn:next,phase:nextPhase,drawReveal:null,selectedCard:null,abilityData:nextAbilityData,huntAbandoned:[],
      _drawnCard:res.drawnCard??null,_discardedDrawnCard:!!res.discardedDrawnCard,_playersBeforeThisDraw:_P_beforeDraw,_turnKey:(gs._turnKey||0)+1,_turnStartLogs:turnStartLogs,_drawLogs:drawLogs,_statLogs:statLogs,_preTurnPlayers:_P_beforeTurn,_preTurnStatLogs:preTurnStatLogs,...(res.statePatch||{}),globalOnlySwapOwner:(res.statePatch?.globalOnlySwapOwner??globalOnlySwapOwner)};
  }
}

// ══════════════════════════════════════════════════════════════
//  AI STEP
// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
//  AI STEP
// ══════════════════════════════════════════════════════════════
function discardAiHandToLimit(P, ct, Disc, L) {
  const aiHandLimit = P[ct]._nyaHandLimit ?? 4;
  while(P[ct].hand.length > aiHandLimit) {
    const c = P[ct].hand.shift();
    Disc.push(c);
    L.push(`${P[ct].name} 弃 ${cardLogText(c, {alwaysShowName:true})}（上限）`);
  }
}

function aiStep(gs){
  const{players:ps,currentTurn:ct,abilityData}=gs;
  let P=copyPlayers(ps),D=[...gs.deck],Disc=[...gs.discard],L=[...gs.log];
  const ai=P[ct];let alive=P.filter((p,i)=>!p.isDead&&i!==ct);
  const aiHuntEvents=[];
  let playersBeforeSkillAction=null;
  let preSkillLogs=[];
  let preSkillDiscard=null;

  const buildReturnPack = (nextGs, P_afterAction) => ({
    ...nextGs,
    _animAiDrawnCard: gs._aiDrawnCard ?? gs._drawnCard ?? null,
    _animDiscardedDrawnCard: gs._discardedDrawnCard ?? false,
    _aiName: ai.name,
    _playersBeforeNextDraw: P_afterAction,
    _playersBeforeSkillAction: playersBeforeSkillAction,
    _preSkillLogs: preSkillLogs,
    _preSkillDiscard: preSkillDiscard,
    ...(aiHuntEvents.length ? { _aiHuntEvents: aiHuntEvents } : {})
  });

  if(abilityData?.type==='firstComePick'&&Array.isArray(abilityData.revealedCards)){
    const pickOrder=abilityData.pickOrder||[];
    const pickIndex=abilityData.pickIndex||0;
    const pickerIdx=pickOrder[pickIndex];
    if(pickerIdx==null)return {...gs,players:P,deck:D,discard:Disc,log:L,abilityData:{},phase:'AI_TURN'};
    return {...gs,players:P,deck:D,discard:Disc,log:L,phase:'FIRST_COME_PICK_SELECT',abilityData};
  }

  if(Array.isArray(abilityData?.peekHandTargets)&&abilityData.peekHandSource===ct){
    return {...gs,players:P,deck:D,discard:Disc,log:L,phase:'PEEK_HAND_SELECT_TARGET',abilityData};
  }

  if(Array.isArray(abilityData?.damageLinkTargets)&&abilityData.damageLinkSource===ct){
    const validTargets=abilityData.damageLinkTargets.filter(i=>P[i]&&!P[i].isDead&&i!==ct);
    if(validTargets.length>0){
      const targetIdx=validTargets[0];
      P[ct].damageLink={partner:targetIdx,active:true,expiryOwner:ct};
      P[targetIdx].damageLink={partner:ct,active:true,expiryOwner:ct};
      L.push(`【两人一绳】${P[ct].name} 与 ${P[targetIdx].name} 间架起链条，一方受到HP伤害时另一方受等量伤害`);
      const win=checkWin(P,gs._isMP);
      if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win,abilityData:{},phase:'AI_TURN'};
      return{...gs,players:P,deck:D,discard:Disc,log:L,abilityData:{},phase:'AI_TURN'};
    }
    return {...gs,players:P,deck:D,discard:Disc,log:L,abilityData:{},phase:'AI_TURN'};
  }

  if(abilityData.roseThornTargets&&abilityData.roseThornSource===ct){
    const validTargets=abilityData.roseThornTargets.filter(i=>P[i]&&!P[i].isDead&&i!==ct);
    if(validTargets.length){
      const targetIdx=chooseAiRoseThornTarget(P, ct, validTargets);
      const gifted=P[ct].hand.splice(0).map(card=>({...card,roseThornHolderId:targetIdx,roseThornSourceId:ct,roseThornSourceName:P[ct].name}));
      P[targetIdx].hand.push(...gifted);
      L.push(`【玫瑰倒刺】${P[ct].name} 将全部手牌交给了 ${P[targetIdx].name}`);
      if(!P[targetIdx].isDead&&P[targetIdx].role===ROLE_TREASURE&&isWinHand(P[targetIdx].hand)){
        P[targetIdx].roleRevealed=true;
        return{
          ...gs,
          players:P,
          deck:D,
          discard:Disc,
          log:[...L,`${P[targetIdx].name} 集齐全部编号并获胜！`],
          gameOver:{winner:ROLE_TREASURE,reason:`${P[targetIdx].name} 集齐了全部编号并获胜！`,winnerIdx:targetIdx},
          abilityData:{},
          phase:'AI_TURN',
          _aiDrawnCard:null,
          _drawnCard:null,
          _discardedDrawnCard:false,
          _playersBeforeThisDraw:null,
          _turnStartLogs:[],
          _drawLogs:[],
          _statLogs:[],
          _preTurnPlayers:null,
          _preTurnStatLogs:[],
        };
      }
    }
    return{
      ...gs,
      players:P,
      deck:D,
      discard:Disc,
      log:L,
      abilityData:{},
      phase:'AI_TURN',
      // 玫瑰倒刺的起手摸牌/翻牌动画在进入本分支前已经播过；继续当前 AI 回合时不应再重播
      _aiDrawnCard:null,
      _drawnCard:null,
      _discardedDrawnCard:false,
      _playersBeforeThisDraw:null,
      _turnStartLogs:[],
      _drawLogs:[],
      _statLogs:[],
      _preTurnPlayers:null,
      _preTurnStatLogs:[],
    };
  }
  if(P[ct].isDead){
    const win=checkWin(P,gs._isMP);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win};
    const _P_afterAction=copyPlayers(P);
    const nextGs=startNextTurn({...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:ct,huntAbandoned:gs.huntAbandoned||[],skillUsed:gs.skillUsed});
    return buildReturnPack(nextGs, _P_afterAction);
  }
  
  // 处理AI触发的需要目标选择的效果
  if(abilityData.caveDuelTargets&&abilityData.caveDuelSource===ct){
    // 穴居人战争目标选择
    const validTargets=abilityData.caveDuelTargets;
    if(validTargets.length>0){
      // AI随机选择一个目标
      const targetIdx=validTargets[Math.floor(Math.random()*validTargets.length)];
      // 执行穴居人战争效果
      const sourcePlayer=P[ct];
      const targetPlayer=P[targetIdx];
      
      // 源角色（AI）选择数字编号最大的牌
      let sourceCardIndex=0, sourceCard;
      let maxSourceNumber=-1;
      for(let i=0;i<sourcePlayer.hand.length;i++){
        const card=sourcePlayer.hand[i];
        const number=card.isGod?0:(card.number||0);
        if(number>maxSourceNumber){
          maxSourceNumber=number;
          sourceCardIndex=i;
        }
      }
      sourceCard=sourcePlayer.hand[sourceCardIndex];
      
      // 目标角色选择牌
      let targetCardIndex, targetCard;
      if(targetIdx===0){
        // 玩家作为目标角色，需要选择牌
        return{
          ...gs,
          players:P,
          deck:D,
          discard:Disc,
          log:L,
          abilityData:{...abilityData,caveDuelTarget:targetIdx,sourceCardIndex:sourceCardIndex,sourceCard:sourceCard},
          currentTurn:ct,
          phase:'CAVE_DUEL_SELECT_CARD',
          // 起手翻牌动画在进入该响应阶段前已经播过；这里清掉临时字段，避免后续重复播放
          _aiDrawnCard:null,
          _drawnCard:null,
          _discardedDrawnCard:false,
          _playersBeforeThisDraw:null,
          _turnStartLogs:[],
          _drawLogs:[],
          _statLogs:[],
          _preTurnPlayers:null,
          _preTurnStatLogs:[],
        };
      }else{
        // AI作为目标角色，选择数字编号最大的牌
        let maxTargetNumber=-1;
        targetCardIndex=0;
        for(let i=0;i<targetPlayer.hand.length;i++){
          const card=targetPlayer.hand[i];
          const number=card.isGod?0:(card.number||0);
          if(number>maxTargetNumber){
            maxTargetNumber=number;
            targetCardIndex=i;
          }
        }
        targetCard=targetPlayer.hand[targetCardIndex];
        
        // 计算数字编号（邪神牌视为0）
        const sourceNumber=sourceCard.isGod?0:(sourceCard.number||0);
        const targetNumber=targetCard.isGod?0:(targetCard.number||0);
        // 比较数字编号
        if(sourceNumber>targetNumber){
          // 源角色获胜，收下两张牌
          sourcePlayer.hand.splice(sourceCardIndex,1);
          targetPlayer.hand.splice(targetCardIndex,1);
          sourcePlayer.hand.push(sourceCard,targetCard);
          L.push(`【穴居人战争】${sourcePlayer.name} 亮出 ${cardLogText(sourceCard,{alwaysShowName:true})}，${targetPlayer.name} 亮出 ${cardLogText(targetCard,{alwaysShowName:true})}，${sourcePlayer.name} 胜出，收下两张牌`);
        }else if(targetNumber>sourceNumber){
          // 目标角色获胜，收下两张牌
          sourcePlayer.hand.splice(sourceCardIndex,1);
          targetPlayer.hand.splice(targetCardIndex,1);
          targetPlayer.hand.push(sourceCard,targetCard);
          L.push(`【穴居人战争】${sourcePlayer.name} 亮出 ${cardLogText(sourceCard,{alwaysShowName:true})}，${targetPlayer.name} 亮出 ${cardLogText(targetCard,{alwaysShowName:true})}，${targetPlayer.name} 胜出，收下两张牌`);
        }else{
          // 平局，各自收回自己的牌
          L.push(`【穴居人战争】${sourcePlayer.name} 亮出 ${cardLogText(sourceCard,{alwaysShowName:true})}，${targetPlayer.name} 亮出 ${cardLogText(targetCard,{alwaysShowName:true})}，平局，各自收回自己的牌`);
        }
      }
    }
    // 清除能力数据
    return{
      ...gs,
      players:P,
      deck:D,
      discard:Disc,
      log:L,
      abilityData:{},
      currentTurn:ct,
      phase:'AI_TURN',
      // 穴居人战争的起手摸牌/翻牌动画在进入该分支前已经播过；继续当前 AI 回合时不应再重播
      _aiDrawnCard:null,
      _drawnCard:null,
      _discardedDrawnCard:false,
      _playersBeforeThisDraw:null,
      _turnStartLogs:[],
      _drawLogs:[],
      _statLogs:[],
      _preTurnPlayers:null,
      _preTurnStatLogs:[],
    };
  }
  if((ai._nyaBorrow||ai.role)===ROLE_TREASURE&&isWinHand(ai.hand)){P[ct].roleRevealed=true;return{...gs,players:P,log:[...L,`${ai.name} 宣告获胜！`],gameOver:{winner:ROLE_TREASURE,reason:`${ai.name} 集齐了全部编号并获胜！`,winnerIdx:ct}};}
  // AI worship-from-hand: face-down god cards in hand can be worshipped (no skull counter, once per turn)
  if(!gs.skillUsed&&!gs.restUsed){
    const handGodIdx=P[ct].hand.findIndex(c=>c.isGod);
    if(handGodIdx>=0){
      const hgc=P[ct].hand[handGodIdx];
      let inspectionMeta=makeInspectionMeta(gs);
      const alreadyHasGod=P[ct].godName&&P[ct].godName!==hgc.godKey;
      const willWorship=P[ct].role===ROLE_CULTIST?Math.random()<0.65:Math.random()<0.45;
      if(willWorship){
        const worshipLogStart=L.length;
        P[ct].hand.splice(handGodIdx,1);
        if(P[ct].godName===hgc.godKey&&P[ct].godLevel<3){
          L.push(`${P[ct].name} 从手牌升级邪神之力至Lv.${P[ct].godLevel+1}（骷髅头不计）`);
        } else if(!P[ct].godName||alreadyHasGod){
          L.push(`${P[ct].name} 从手牌信仰 ${hgc.name}，获得${hgc.power}(Lv.1)（骷髅头不计）`);
        }
        // Forced convert if worshipping different god
        if(alreadyHasGod){const converted=convertGodFollower(ct,gs.currentTurn,P,D,Disc,L,inspectionMeta,`${P[ct].name} 改信新神，SAN-1`);P=converted.P;D=converted.D;Disc=converted.Disc;L=converted.L;inspectionMeta=converted.inspectionMeta;}
        if(P[ct].godName===hgc.godKey&&P[ct].godLevel<3){
          P[ct].godLevel++;P[ct].godZone.push({...hgc});
        } else if(!P[ct].godName||alreadyHasGod){
          P[ct].godName=hgc.godKey;P[ct].godLevel=1;P[ct].godZone=[{...hgc}];
        }

        P.forEach((p,i)=>{if(i!==ct&&p.godName===hgc.godKey){const abandoned=abandonGodFollower(i,gs.currentTurn,P,D,Disc,L,inspectionMeta);P=abandoned.P;D=abandoned.D;Disc=abandoned.Disc;L=abandoned.L;inspectionMeta=abandoned.inspectionMeta;}});
        playersBeforeSkillAction=copyPlayers(P);
        preSkillLogs=L.slice(worshipLogStart);
        preSkillDiscard=[...Disc];
        gs={...gs,...inspectionMeta};
        const ww=checkWin(P,gs._isMP);if(ww)return{...gs,players:P,deck:D,discard:Disc,log:L,...inspectionMeta,gameOver:ww};
      }
    }
  }
  // ── AI Rest (新版策略) ───────────────────────────────────────
  // HP≤4时积极休息（已进入斩杀线）
  // 寻宝者HP≤4：除非掉包可获胜或避免进度倒退，否则休息
  // 邪祀者HP≤4：除非蛊惑可获胜或清空手牌，否则休息
  // 邪祀者HP≤2：除非蛊惑可获胜，否则必须休息（已进入AOE斩杀线）
  // 追猎者HP≤5：积极休息
  const aiEffRole=gs.globalOnlySwapOwner!=null?ROLE_TREASURE:(ai._nyaBorrow||ai.role);
  const noRestReason=aiShouldNotRest(gs,ai,aiEffRole,P,ct);
  const shouldRest=(()=>{
    if(gs.restUsed||gs.skillUsed)return false;
    if(ai.hp>=9)return false;
    if(noRestReason?.shouldNotRest)return false;
    if(aiEffRole===ROLE_TREASURE)return ai.hp<=7&&Math.random()<0.70;
    if(aiEffRole===ROLE_HUNTER){
      if(ai.hp<=5)return Math.random()<0.75;
      return false;
    }
    return ai.hp<=4&&Math.random()<0.65;
  })();
  let swapTargetOverride=null;
  if(noRestReason?.shouldNotRest){
    if(noRestReason.reason==='swapWin'){
      swapTargetOverride={targetIdx:noRestReason.targetIdx,reason:'win'};
    }else if(noRestReason.reason==='swapAvoidRegression'){
      swapTargetOverride={targetIdx:noRestReason.targetIdx,reason:'avoidRegression'};
    }
  }
  if(shouldRest){
    const d1=(1+Math.random()*6|0),d2=(1+Math.random()*6|0),heal=Math.max(d1,d2);
    P[ct].hp=clamp(P[ct].hp+heal);P[ct].isResting=true;
    L.push(`${ai.name} 选择【休息】，掷骰 ${d1}+${d2}，回复 ${heal}HP，翻面休息中`);
    const win=checkWin(P,gs._isMP);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win};
    discardAiHandToLimit(P, ct, Disc, L);
    const _P_afterRest=copyPlayers(P);
    const nextGs=startNextTurn({...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:ct,restUsed:true,skillUsed:false});
    return buildReturnPack(nextGs, _P_afterRest);
  }
// 追猎者/邪祀者积极发动技能(65%); 寻宝者随进度提升(35%→55%)
  let huntContinue = true;
  let newAbandoned = gs.huntAbandoned || [];
  const getHunterTargets = () => getHunterChaseTargets(P,ct,newAbandoned);
  const aiSkillDecision=decideAiSkillUsage(gs,P,ct,aiEffRole,getHunterTargets());
  let useSkill=aiSkillDecision.useSkill;
  let cultistBewitchPlan = null;
  const hunterZoneCards = P[ct].hand.filter(isZoneCard);
  if (aiEffRole === ROLE_CULTIST && useSkill) {
    cultistBewitchPlan = chooseAiCultistBewitchPlan(P, ct);
    if (!cultistBewitchPlan && !P[ct].roleRevealed) {
      useSkill = false;
    }
  }
  if (aiEffRole === ROLE_CULTIST && !useSkill) {
    const canWin = canCultistWinByBewitch(P, ct);
    const canEmpty = canCultistEmptyHandByBewitch(P, ct);
    if ((ai.hp <= 4 && (canWin || canEmpty)) || (ai.hp <= 2 && canWin)) {
      cultistBewitchPlan = chooseAiCultistBewitchPlan(P, ct);
      if (cultistBewitchPlan) {
        useSkill = true;
      }
    }
  }

  if(aiEffRole!==ROLE_HUNTER && alive.length===0){
    const win=checkWin(P,gs._isMP);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win};
    discardAiHandToLimit(P, ct, Disc, L);
    L.push(`${ai.name} 未使用技能，结束回合`);
    const _P_afterAction=copyPlayers(P);
    const nextGs=startNextTurn({...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:ct,huntAbandoned:newAbandoned,skillUsed:gs.skillUsed});
    return buildReturnPack(nextGs, _P_afterAction);
  }

  // 如果无法使用技能，重置huntContinue为false，防止无限循环
  if(!useSkill){
    huntContinue = false;
  }

  if(useSkill){
    if(aiEffRole!==ROLE_CULTIST || cultistBewitchPlan){
      P[ct].roleRevealed=true;
    }
    // ── v2 MCTS 目标选择 ────────────────────────────────────
    let tgt;
    if(aiEffRole===ROLE_HUNTER){
      if(hunterZoneCards.length === 0) huntContinue = false;
      while (huntContinue && P[ct].hand.some(isZoneCard)) {
        const validTargets = getHunterTargets();
        if (validTargets.length > 0) {
          const sortedTargets = [...validTargets].sort((a, b) => {
            if (!!a.player.roleRevealed !== !!b.player.roleRevealed) return a.player.roleRevealed ? -1 : 1;
            return a.player.hp - b.player.hp;
          });

          // 遍历所有目标，直到找到可以追捕的目标或用完所有目标
          let foundTarget = false;
          for (const { player: tgt, idx: ti } of sortedTargets) {
            const zoneH = P[ti].hand.filter(isZoneCard);
            if (ti === 0) {
              L.push(`${ai.name}（追猎者）向你发动【追捕】！请选择亮出一张区域牌`);
              const updatedAbandoned = [...newAbandoned, ti];
              return {...gs, players:P, deck:D, discard:Disc, log:L,
                phase:'PLAYER_REVEAL_FOR_HUNT',
                abilityData:{huntingAI:ct, aiHunterName:ai.name},
                skillUsed:true, huntAbandoned: updatedAbandoned, _aiName:ai.name, _drawnCard:gs._drawnCard, _aiDrawnCard:gs._aiDrawnCard??gs._drawnCard??null, _discardedDrawnCard:gs._discardedDrawnCard??false, _playersBeforeSkillAction:playersBeforeSkillAction, _preSkillLogs:preSkillLogs, _preSkillDiscard:preSkillDiscard, _aiHuntEvents:aiHuntEvents};
            } else {
              const beforeHuntPlayers=copyPlayers(P);
              const huntLogStart=L.length;
              const targetHandBefore=[...(P[ti]?.hand||[])];
              const targetRevealBefore=!!P[ti]?.revealHand;
              const knownHunterCards=P[ti]?.peekMemories?.[ct]||[];
              const rc = aiChooseRevealCard(zoneH, ai.name, L, knownHunterCards);
              L.push(`${ai.name}（追猎者）对 ${tgt.name} 【追捕】，亮出 ${cardLogText(rc)}`);
              const mi = P[ct].hand.findIndex(c => cardsHuntMatch(c,rc));
              if (mi >= 0) {
                const dc = P[ct].hand.splice(mi, 1)[0]; Disc.push(dc);
                const blankZoneUpdate=moveEligibleBlankZones(P,L);
                if(blankZoneUpdate){
                  P=blankZoneUpdate.players;
                  L=blankZoneUpdate.log;
                }
                const afterDiscardPlayers=copyPlayers(P);
                const afterDiscardDiscard=[...Disc];
                const huntDamage=3+(P[ct].damageBonus||0);
                L.push(`弃 ${cardLogText(dc,{alwaysShowName:true})} → ${tgt.name} 受 ${huntDamage}HP 伤害！`);
                applyHpDamageWithLink(P,ti,huntDamage,Disc,L);
                if (P[ti].hp <= 0) {
                  if (targetHandBefore.length) {
                    Disc=removeCardsFromDiscard(Disc,targetHandBefore);
                    P[ti].hand=[...targetHandBefore];
                    const maxToTake=3;
                    if (targetRevealBefore) {
                      const chosenCards=aiChooseHunterLootCards(P[ti].hand,P[ct].hand,maxToTake);
                      chosenCards.forEach(stolenCard=>{
                        const idx=P[ti].hand.findIndex(c=>c.id===stolenCard.id);
                        if(idx>=0){
                          P[ti].hand.splice(idx,1);
                          P[ct].hand.push(stolenCard);
                          L.push(`${ai.name} 从 ${tgt.name} 的公开手牌中选择了 ${cardLogText(stolenCard)}！`);
                        }
                      });
                      Disc.push(...P[ti].hand);
                      P[ti].hand = [];
                    } else {
                      const cardsToTake=Math.min(maxToTake,P[ti].hand.length);
                      for(let i=0;i<cardsToTake;i++){
                        const randomIndex = Math.floor(Math.random() * P[ti].hand.length);
                        const stolenCard = P[ti].hand.splice(randomIndex, 1)[0];
                        P[ct].hand.push(stolenCard);
                        L.push(`${ai.name} 从 ${tgt.name} 的手牌中暗抽了一张！`);
                      }
                      Disc.push(...P[ti].hand);
                      P[ti].hand = [];
                    }
                  }
                  if (P[ti].godZone?.length) { Disc.push(...P[ti].godZone); P[ti].godZone = []; P[ti].godName = null; P[ti].godLevel = 0; }
                  aiHuntEvents.push({
                    targetIdx:ti,
                    hunterIdx:ct,
                    discardedCard:dc,
                    afterDiscardPlayers,
                    afterDiscardDiscard,
                    beforePlayers:beforeHuntPlayers,
                    afterPlayers:copyPlayers(P),
                    afterResultDiscard:[...Disc],
                    beforeLog:L.slice(0,huntLogStart),
                    afterLog:[...L],
                    msgs:L.slice(huntLogStart),
                  });
                  alive = P.filter((p, i) => !p.isDead && i !== ct);
                  newAbandoned = [];
                  foundTarget = true;
                  break;
                } else {
                  aiHuntEvents.push({
                    targetIdx:ti,
                    hunterIdx:ct,
                    discardedCard:dc,
                    afterDiscardPlayers,
                    afterDiscardDiscard,
                    beforePlayers:beforeHuntPlayers,
                    afterPlayers:copyPlayers(P),
                    afterResultDiscard:[...Disc],
                    beforeLog:L.slice(0,huntLogStart),
                    afterLog:[...L],
                    msgs:L.slice(huntLogStart),
                  });
                  foundTarget = true;
                  newAbandoned = newAbandoned.filter(i => i !== ti);
                  break;
                }
              } else {
                L.push(`无匹配手牌，放弃追捕 ${tgt.name}`);
                aiHuntEvents.push({
                  targetIdx:ti,
                  hunterIdx:ct,
                  beforePlayers:beforeHuntPlayers,
                  afterPlayers:copyPlayers(P),
                  afterResultDiscard:[...Disc],
                  beforeLog:L.slice(0,huntLogStart),
                  afterLog:[...L],
                  msgs:L.slice(huntLogStart),
                });
                // 将目标添加到已放弃列表，避免同一回合再次选择
                newAbandoned = [...newAbandoned, ti];
              }
              continue;
            }
          }
          
          if (!foundTarget) {
            // 所有目标都尝试过了，仍无法追捕
            L.push(`${ai.name} 尝试了所有目标，仍无法追捕`);
            huntContinue = false;
          }
        } else {
          L.push(`${ai.name} 环顾四周，没有合适的猎物了`);
          huntContinue = false;
        }
        
        // 检查胜利条件
        const win=checkWin(P,gs._isMP);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win};
      }
    } else if(aiEffRole===ROLE_CULTIST){
      if(!alive.length){
        huntContinue=false;
      }else{
      const plan = cultistBewitchPlan || chooseAiCultistBewitchPlan(P, ct);
      if(!plan){
        huntContinue = false;
      }else if(P[ct].hand.length){
        tgt=P[plan.targetIdx];
        const ti=plan.targetIdx;
        const sc=plan.card;
        let inspectionMeta=makeInspectionMeta(gs);
        P[ct].hand=P[ct].hand.filter(c=>c.id!==sc.id);
        L.push(`${ai.name}（邪祀者）对 ${tgt.name} 【蛊惑】，赠予 ${cardLogText(sc,{alwaysShowName:true})}`);
        if(sc.isGod){
          P[ti].godEncounters=(P[ti].godEncounters||0)+1;
          if(P[ti].role===ROLE_CULTIST){
            P[ti].roleRevealed=true;
          }else{
            const godCost=P[ti].godEncounters;
            P[ti].san=clamp(P[ti].san-godCost);const newSan=P[ti].san;{const processed=applyInspectionForSanLoss(ti,newSan,gs.currentTurn,P,D,Disc,L,inspectionMeta);P=processed.P;D=processed.D;Disc=processed.Disc;inspectionMeta=processed.inspectionMeta;L.splice(0,L.length,...processed.log);}
          }
          const gr=aiHandleGodCard(ti,sc,P,D,Disc,L,gs);
          P=gr.P;D=gr.D;Disc=gr.Disc;
          gs={...gs,...inspectionMeta,...(gr.inspectionMeta||{})};
        }else{
          const res=applyFx(sc,ti,sc.type==='swapAllHands'?null:ti,P,D,Disc,gs);P=res.P;D=res.D;Disc=res.Disc;L.push(...res.msgs);
          gs={...gs,...res.statePatch};
          P[ti].hand.push(sc);
          if(sc.type==='swapAllHands'||res.statePatch?.peekHandTargets||res.statePatch?.caveDuelTargets||res.statePatch?.damageLinkTargets||res.statePatch?.roseThornTargets||res.statePatch?.abilityData?.type==='firstComePick'){
            const phaseAbilityData={
              ...(sc.type==='swapAllHands'?{
                zoneSwapCard:sc,
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
              sc.type==='swapAllHands'?'ZONE_SWAP_SELECT_TARGET':
              res.statePatch?.peekHandTargets?'PEEK_HAND_SELECT_TARGET':
              res.statePatch?.caveDuelTargets?'CAVE_DUEL_SELECT_TARGET':
              res.statePatch?.damageLinkTargets?'DAMAGE_LINK_SELECT_TARGET':
              res.statePatch?.roseThornTargets?'ROSE_THORN_SELECT_TARGET':
              res.statePatch?.abilityData?.type==='firstComePick'?'FIRST_COME_PICK_SELECT':
              'ACTION';
            const needsPlayerDecision = sc.type==='swapAllHands' || !!res.statePatch?.peekHandTargets || !!res.statePatch?.caveDuelTargets || !!res.statePatch?.damageLinkTargets || !!res.statePatch?.roseThornTargets;
            return {
              ...gs,
              players:P,
              deck:D,
              discard:Disc,
              log:L,
              phase:nextPhase,
              currentTurn: needsPlayerDecision ? ti : gs.currentTurn,
              abilityData:phaseAbilityData,
              huntAbandoned:newAbandoned,
              skillUsed:true,
              _aiDrawnCard:(gs._aiDrawnCard??gs._drawnCard??null),
              _discardedDrawnCard:(gs._discardedDrawnCard??false),
              _aiName:ai.name,
              _playersBeforeNextDraw:copyPlayers(P),
              _playersBeforeSkillAction:playersBeforeSkillAction,
              _preSkillLogs:preSkillLogs,
              _preSkillDiscard:preSkillDiscard,
              _aiHuntEvents:aiHuntEvents,
            };
          }
        }
      }
      }
    } else {
      const withH=alive.filter(p=>p.hand.length>0);
      const pool=withH.length?withH:alive;
      if(pool.length){
        if(swapTargetOverride!=null){
          tgt=P[swapTargetOverride.targetIdx];
        }else{
          const myNonGod=P[ct].hand.filter(c=>!c.isGod);
          if(myNonGod.length>=7){
            tgt=pool[0|Math.random()*pool.length];
          }else{
          const myL=new Set(myNonGod.map(c=>c.letter));
          const myN=new Set(myNonGod.map(c=>c.number));
          const scoreH=h=>h.filter(c=>!c.isGod&&(!myL.has(c.letter)||!myN.has(c.number))).length;
          tgt=pool.reduce((b,p)=>scoreH(p.hand)>scoreH(b.hand)?p:b,pool[0]);
        }
        const ti=P.indexOf(tgt);
        if(P[ti]?.hand.length&&P[ct].hand.length){
          const ri=0|Math.random()*P[ti].hand.length;const taken=P[ti].hand.splice(ri,1)[0];
          const gi=0|Math.random()*P[ct].hand.length;const given=P[ct].hand.splice(gi,1)[0];
          P[ct].hand.push(taken);P[ti].hand.push(given);
          // 只有使用自己的掉包技能时才显示"（寻宝者）"，通过“绮丽诗篇”获得的掉包技能不显示
          L.push(`${ai.name}${gs.globalOnlySwapOwner===null?'（寻宝者）':''}对 ${tgt.name} 【掉包】`);
          // 只有真正的寻宝者才能通过集齐全部编号获胜
          if((ai._nyaBorrow||ai.role)===ROLE_TREASURE&&isWinHand(P[ct].hand)){
            if(gs.globalOnlySwapOwner===null)P[ct].roleRevealed=true;
            if(P[ti].role===ROLE_TREASURE&&isWinHand(P[ti].hand)){
              P[ti].roleRevealed=true;
              const reason2=`${ai.name} 与 ${P[ti].name} 互换后双方均集齐编号，两位寻宝者共同获胜！`;
              return{...gs,players:P,deck:D,discard:Disc,log:[...L,reason2],gameOver:{winner:ROLE_TREASURE,reason:reason2,winnerIdx:ct,winnerIdx2:ti}};
            }
            return{...gs,players:P,deck:D,discard:Disc,log:[...L,`${ai.name} 掉包后获胜！`],gameOver:{winner:ROLE_TREASURE,reason:`${ai.name} 通过掉包集齐全部编号并获胜！`,winnerIdx:ct}};
          }
          if(P[ti].role===ROLE_TREASURE&&isWinHand(P[ti].hand)){
            P[ti].roleRevealed=true;
            const reason3=`${P[ti].name} 因掉包获得最后一张编号，寻宝者获胜！`;
            return{...gs,players:P,deck:D,discard:Disc,log:[...L,reason3],gameOver:{winner:ROLE_TREASURE,reason:reason3,winnerIdx:ti}};
          }
        }
        }
      }
    }
  }else if(!P[ct].isDead){
    if(aiEffRole===ROLE_CULTIST&&isCultistEndingTurnUnreasonable(P,ct)){
      cultistBewitchPlan=chooseAiCultistBewitchPlan(P,ct);
      if(cultistBewitchPlan){
        const plan=cultistBewitchPlan;
        const tgt=P[plan.targetIdx];
        const ti=plan.targetIdx;
        const sc=plan.card;
        P[ct].hand=P[ct].hand.filter(c=>c.id!==sc.id);
        L.push(`${ai.name}（邪祀者）对 ${tgt.name} 【蛊惑】，赠予 ${cardLogText(sc,{alwaysShowName:true})}`);
        P[ti].hand.push(sc);
        const res=applyFx(sc,ti,sc.type==='swapAllHands'?null:ti,P,D,Disc,gs);P=res.P;D=res.D;Disc=res.Disc;L.push(...res.msgs);
        gs={...gs,...res.statePatch};
        if(res.statePatch?.abilityData?.type==='firstComePick'){
          const win=checkWin(P,gs._isMP);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win};
          return {...gs,players:P,deck:D,discard:Disc,log:L,phase:'FIRST_COME_PICK_SELECT',abilityData:{...res.statePatch.abilityData,_turnOwner:gs.currentTurn},skillUsed:true};
        }
        const win=checkWin(P,gs._isMP);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win};
        const _P_afterAction=copyPlayers(P);
        const nextGs=startNextTurn({...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:ct,huntAbandoned:newAbandoned,skillUsed:true});
        return buildReturnPack(nextGs,_P_afterAction);
      }
    }
    L.push(`${ai.name} 未使用技能，结束回合`);
  }
  if(P[ct].isDead){
    const win=checkWin(P,gs._isMP);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win};
    const _P_afterAction=copyPlayers(P);
    const nextGs=startNextTurn({...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:ct,huntAbandoned:newAbandoned,skillUsed:gs.skillUsed});
    return{...nextGs,_animAiDrawnCard:gs._aiDrawnCard??gs._drawnCard??null,_animDiscardedDrawnCard:gs._discardedDrawnCard??false,_aiName:ai.name,_playersBeforeNextDraw:_P_afterAction,_playersBeforeSkillAction:playersBeforeSkillAction,_preSkillLogs:preSkillLogs,_preSkillDiscard:preSkillDiscard,_aiHuntEvents:aiHuntEvents};
  }
  const win=checkWin(P,gs._isMP);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win};
  const aiHandLimit=P[ct]._nyaHandLimit??4;
  const discardedCards=[];
  while(P[ct].hand.length>aiHandLimit){const c=P[ct].hand.shift();Disc.push(c);discardedCards.push(c);L.push(`${ai.name} 弃 ${cardLogText(c,{alwaysShowName:true})}（上限）`);}
  // 结算玫瑰倒刺：弃掉的标记牌立即造成伤害，日志紧跟在弃牌日志之后
  if(discardedCards.length){
    const thornLosses={};
    discardedCards.forEach(c=>{
      if(c.roseThornHolderId!=null && P[c.roseThornHolderId] && !P[c.roseThornHolderId].isDead){
        thornLosses[c.roseThornHolderId]=(thornLosses[c.roseThornHolderId]||0)+1;
      }
    });
    Object.entries(thornLosses).forEach(([holderIdxStr,count])=>{
      const holderIdx=+holderIdxStr;
      applyHpDamageWithLink(P,holderIdx,2*count,Disc,L);
      L.push(`【玫瑰倒刺】${P[holderIdx].name} 失去标记手牌，受到 ${2*count} HP 伤害`);
    });
  }
  const winAfterDiscard=checkWin(P,gs._isMP);
  if(winAfterDiscard){
    return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:winAfterDiscard,currentTurn:ct,huntAbandoned:newAbandoned,skillUsed:(useSkill||gs.skillUsed),_animAiDrawnCard:gs._aiDrawnCard??gs._drawnCard??null,_animDiscardedDrawnCard:gs._discardedDrawnCard??false,_aiName:ai.name,_playersBeforeNextDraw:copyPlayers(P),_playersBeforeSkillAction:playersBeforeSkillAction,_preSkillLogs:preSkillLogs,_preSkillDiscard:preSkillDiscard,_aiHuntEvents:aiHuntEvents};
  }
  const _P_afterAction=copyPlayers(P);
  let nextGs;

  // AI状态机扭转关键：只有追猎者才能在同一回合内连续追捕并留在 AI_TURN
  const hasValidTargets = getHunterTargets().length > 0;
  const hasZoneCards = P[ct].hand.filter(isZoneCard).length > 0;
  try{
    if (aiEffRole === ROLE_HUNTER && huntContinue && hasZoneCards && hasValidTargets) {
        nextGs = withClearedTurnAnimFields({...gs, players:P, deck:D, discard:Disc, log:L, phase: 'AI_TURN', currentTurn: ct, huntAbandoned: newAbandoned, skillUsed: false, _drawnCard: null, _discardedDrawnCard:false});
    } else {
        nextGs = startNextTurn({...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:ct, huntAbandoned: newAbandoned, skillUsed: (useSkill || gs.skillUsed)});
    }
  }catch(e){
    throw new Error(`${ai.name} 回合收尾失败: ${e?.message||'未知错误'}`);
  }

  return{...nextGs,_animAiDrawnCard:(nextGs.currentTurn===ct&&nextGs.phase==='AI_TURN')?null:(gs._aiDrawnCard??gs._drawnCard??null),_animDiscardedDrawnCard:(nextGs.currentTurn===ct&&nextGs.phase==='AI_TURN')?false:(gs._discardedDrawnCard??false),_aiName:ai.name,_playersBeforeNextDraw:_P_afterAction,_playersBeforeSkillAction:playersBeforeSkillAction,_preSkillLogs:preSkillLogs,_preSkillDiscard:preSkillDiscard,_aiHuntEvents:aiHuntEvents,_aiHandLimitDiscards:discardedCards};
}

// 检定牌堆
const INSPECTION_DECK = [
  ...Array(4).fill({name: '乱抓', effect: 'adjacentDamageHP', value: 1, type: 'negative'}),
  ...Array(4).fill({name: '自残', effect: 'selfDamageHP', value: 1, type: 'negative'}),
  ...Array(4).fill({name: '失眠', effect: 'disableRest', value: 1, type: 'negative'}),
  ...Array(2).fill({name: '暂时的平静', effect: 'nothing', value: 0, type: 'neutral'}),
  ...Array(2).fill({name: '昏睡', effect: 'flip', value: 1, type: 'negative'}),
  ...Array(2).fill({name: '迫害妄想', effect: 'discardRandom', value: 1, type: 'negative'}),
  ...Array(2).fill({name: '失忆', effect: 'disableSkill', value: 1, type: 'negative'}),
  ...Array(2).fill({name: '乏力', effect: 'handLimitDecrease', value: 1, type: 'negative'}),
  {name: '超人意志', effect: 'healSAN', value: 1, type: 'positive'},
  {name: '揭开真相', effect: 'drawCard', value: 1, type: 'positive'},
  {name: '封印松动', effect: 'sealLoosening', value: 1, type: 'negative'},
  {name: '廷达罗斯猎犬', effect: 'houndsOfTindalos', value: 1, type: 'negative'}
];

// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════
function initGame(playerNames, debugForceCard, debugForceCardTarget, debugForceCardKeep, debugForceCardType, debugForceZoneCardKey, debugForceZoneCardName, debugForceGodCardKey, debugPlayerRole){
  const names=playerNames||['你',...AI_NAMES];
  const N=names.length;
  const isSinglePlayer = !playerNames;
  let deck=mkDeck();
  
  // Debug: 强制摸牌
  let targetCard = null;
  if((debugForceCard || (debugForceCardType && (debugForceZoneCardKey || debugForceGodCardKey))) && (debugForceCardTarget === 'player' || debugForceCardTarget === 'ai1')){
    
    if(debugForceCardType === 'zone' && debugForceZoneCardKey && debugForceZoneCardName){
      // 查找指定编号和牌面的区域牌
      targetCard = deck.find(card => card.key === debugForceZoneCardKey && card.name === debugForceZoneCardName);
    } else if(debugForceCardType === 'god' && debugForceGodCardKey){
      // 查找指定类型的神牌
      targetCard = deck.find(card => card.isGod && card.godKey === debugForceGodCardKey);
    } else if(debugForceCard){
      // 兼容旧的设置方式
      targetCard = deck.find(card => card.key === debugForceCard);
    }
    
    if(targetCard){
      // 从牌堆中移除目标牌，暂时保留
      deck = deck.filter(card => card.id !== targetCard.id);
    }
  }
  
  const roles=mkRoles(N, isSinglePlayer);
  if (
    isSinglePlayer &&
    [ROLE_TREASURE, ROLE_HUNTER, ROLE_CULTIST].includes(debugPlayerRole)
  ) {
    roles[0] = debugPlayerRole;
  }
  const players=names.map((name,i)=>({
    id:i,
    name,
    role:roles[i],
    roleRevealed:false,
    hp:10,
    san:10,
    hand:[],
    zoneCards:[],
    isDead:false,
    isResting:false,
    godEncounters:0,
    godZone:[],
    godName:null,
    godLevel:0,
    peekMemories:{},
    disableRest:false,
    disableSkill:false,
    handLimitDecrease:0,
    disableRestNextTurn:false,
    disableSkillNextTurn:false,
    handLimitDecreaseNextTurn:0
  }));
  
  // 发初始手牌
  for(let r=0;r<4;r++)players.forEach(p=>p.hand.push(deck.shift()));
  
  const inspectionDeck=shuffle([...INSPECTION_DECK]);
  const base={players,deck,discard:[],inspectionDeck,inspectionDiscard:[],currentTurn:-1,phase:'DRAW_REVEAL',drawReveal:null,selectedCard:null,abilityData:{},log:['游戏开始。每人获得四张初始手牌。'],gameOver:null,skillUsed:false,restUsed:false,huntAbandoned:[],godFromHandUsed:false,godTriggeredThisTurn:false,globalOnlySwapOwner:null,_turnKey:0,_isMP:!!playerNames,turn:0,sealLooseningCount:0,houndsOfTindalosActive:false,houndsOfTindalosTarget:null,houndsOfTindalosElapsed:0,debugForceCard:targetCard,debugForceCardTarget};
  base.debugForceCardKeep=playerNames?'auto':debugForceCardKeep;
  return startNextTurn(base);
}

// 处理检定牌翻开和结算
function handleInspection(playerIndex, gs) {
  let newGs = {...gs};
  const beforePlayers = copyPlayers(gs.players||[]);
  const beforeLog = [...(Array.isArray(gs.log)?gs.log:[])];
  const beforeLogLen = Array.isArray(gs.log)?gs.log.length:0;
  // 检查检定牌堆是否为空，如果为空则洗牌
  if (newGs.inspectionDeck.length === 0) {
    newGs.inspectionDeck = shuffle([...newGs.inspectionDiscard]);
    newGs.inspectionDiscard = [];
  }
  // 翻开检定牌
  const drawnCard = newGs.inspectionDeck.shift();
  // 结算检定牌效果
  const L = [...(Array.isArray(newGs.log)?newGs.log:[])];
  const P = [...newGs.players];
  L.push(`${P[playerIndex].name} 的SAN检定结果为"${drawnCard.name}"`);
  const killPlayer = i => {
    if(i==null || !P[i] || P[i].isDead) return;
    // 标记待播放死亡特效的角色（用于面板延迟置灰）
    P[i]._pendingAnimDeath = true;
    P[i].isDead = true;
    P[i].roleRevealed = true;
    L.push(`☠ ${P[i].name}（${P[i].role}）倒下了！`);
    if(P[i].hand?.length){
      newGs.discard.push(...P[i].hand);
      P[i].hand = [];
    }
    if(P[i].godZone?.length){
      newGs.discard.push(...P[i].godZone);
      P[i].godZone = [];
      P[i].godName = null;
      P[i].godLevel = 0;
    }
  };
  switch (drawnCard.effect) {
    case 'adjacentDamageHP': {
      // 相邻角色失去1HP
      const N = P.length;
      for (let i = 1; i <= N; i++) {
        const leftIdx = (playerIndex - i + N) % N;
        if (!P[leftIdx].isDead) {
          P[leftIdx].hp = Math.max(0, P[leftIdx].hp - drawnCard.value);
          L.push(`${P[leftIdx].name} 被乱抓，失去 ${drawnCard.value} HP`);
          if(P[leftIdx].hp<=0) killPlayer(leftIdx);
          break;
        }
      }
      for (let i = 1; i <= N; i++) {
        const rightIdx = (playerIndex + i) % N;
        if (!P[rightIdx].isDead) {
          P[rightIdx].hp = Math.max(0, P[rightIdx].hp - drawnCard.value);
          L.push(`${P[rightIdx].name} 被乱抓，失去 ${drawnCard.value} HP`);
          if(P[rightIdx].hp<=0) killPlayer(rightIdx);
          break;
        }
      }
      break;
    }
    case 'selfDamageHP': {
      // 失去1HP
      P[playerIndex].hp = Math.max(0, P[playerIndex].hp - drawnCard.value);
      L.push(`${P[playerIndex].name} 自残，失去 ${drawnCard.value} HP`);
      if(P[playerIndex].hp<=0) killPlayer(playerIndex);
      break;
    }
    case 'disableRest': {
      // 下一回合禁用"休息"
      P[playerIndex].disableRestNextTurn = true;
      L.push(`${P[playerIndex].name} 失眠，下一回合禁用休息`);
      break;
    }
    case 'nothing': {
      // 什么也不做
      break;
    }
    case 'flip': {
      // 翻面
      P[playerIndex].isResting = !P[playerIndex].isResting;
      L.push(`${P[playerIndex].name} 昏睡，${P[playerIndex].isResting ? '翻面' : '醒来'}`);
      break;
    }
    case 'discardRandom': {
      // 随机弃一张牌
      if (P[playerIndex].hand.length > 0) {
        const randomIndex = Math.floor(Math.random() * P[playerIndex].hand.length);
        const discardedCard = P[playerIndex].hand.splice(randomIndex, 1)[0];
        newGs.discard.push(discardedCard);
        L.push(`${P[playerIndex].name} 迫害妄想，弃置了一张牌`);
      }
      break;
    }
    case 'disableSkill': {
      // 下一回合禁用技能
      P[playerIndex].disableSkillNextTurn = true;
      L.push(`${P[playerIndex].name} 失忆，下一回合禁用技能`);
      break;
    }
    case 'handLimitDecrease': {
      // 下一回合手牌上限-1
      P[playerIndex].handLimitDecreaseNextTurn = 1;
      L.push(`${P[playerIndex].name} 乏力，下一回合手牌上限-1`);
      break;
    }
    case 'healSAN': {
      // 恢复1SAN
      P[playerIndex].san = Math.min(10, P[playerIndex].san + drawnCard.value);
      L.push(`${P[playerIndex].name} 超人意志，恢复 ${drawnCard.value} SAN`);
      break;
    }
    case 'drawCard': {
      // 从牌堆摸一张牌
      if (newGs.deck.length === 0) {
        newGs.deck = shuffle([...newGs.discard]);
        newGs.discard = [];
      }
      if (newGs.deck.length > 0) {
        const newCard = newGs.deck.shift();
        P[playerIndex].hand.push(newCard);
        L.push(`${P[playerIndex].name} 揭开真相，摸到一张牌`);
      }
      break;
    }
    case 'sealLoosening': {
      // 连续翻出两次时邪神复活（无视SAN值条件）
      newGs.sealLooseningCount++;
      L.push(`${P[playerIndex].name} 感到封印松动`);
      if (newGs.sealLooseningCount >= 2) {
        // 邪神复活逻辑
        L.push('封印完全松动，邪神复活了！');
        // 这里可以添加邪神复活的具体逻辑
        newGs.sealLooseningCount = 0;
      }
      break;
    }
    case 'houndsOfTindalos': {
      // 廷达罗斯猎犬离开检定牌堆并沿场地奔跑，对第一个回合用时超过15秒的玩家造成4点HP伤害，之后返回检定牌堆
      newGs.houndsOfTindalosActive = true;
      newGs.houndsOfTindalosTarget = null;
      newGs.houndsOfTindalosElapsed = 0;
      L.push('廷达罗斯猎犬出现了！');
      break;
    }
  }
  const finalLog=drawnCard.effect==='nothing'
    ?L.filter(line=>line!==`${P[playerIndex].name} 获得暂时的平静`)
    :L;
  if (drawnCard.effect === 'houndsOfTindalos') {
    newGs.inspectionDiscard = [];
  } else {
    newGs.inspectionDeck = shuffle([...(newGs.inspectionDeck||[]), drawnCard]);
    newGs.inspectionDiscard = [];
  }
  newGs._inspectionSeq = (gs?._inspectionSeq || 0) + 1;
  newGs._inspectionCard = drawnCard;
  newGs._inspectionTarget = playerIndex;
  newGs._inspectionPrevLogLen = beforeLogLen;
  newGs._inspectionBeforePlayers = beforePlayers;
  newGs._inspectionEvents = [
    ...((gs?._inspectionEvents)||[]),
    {
      seq:newGs._inspectionSeq,
      card:drawnCard,
      target:playerIndex,
      prevLogLen:beforeLogLen,
      beforePlayers,
      beforeLog,
      afterPlayers:copyPlayers(P),
      afterLog:[...finalLog],
    }
  ];
  // 更新游戏状态
  newGs.players = P;
  newGs.log = finalLog;
  return newGs;
}

function mergeInspectionMeta(target, inspectionResult){
  return {
    ...target,
    inspectionDeck: inspectionResult.inspectionDeck,
    inspectionDiscard: inspectionResult.inspectionDiscard,
    sealLooseningCount: inspectionResult.sealLooseningCount,
    houndsOfTindalosActive: inspectionResult.houndsOfTindalosActive,
    houndsOfTindalosTarget: inspectionResult.houndsOfTindalosTarget,
    houndsOfTindalosElapsed: inspectionResult.houndsOfTindalosElapsed,
    _inspectionSeq: inspectionResult._inspectionSeq,
    _inspectionCard: inspectionResult._inspectionCard,
    _inspectionTarget: inspectionResult._inspectionTarget,
    _inspectionPrevLogLen: inspectionResult._inspectionPrevLogLen,
    _inspectionBeforePlayers: inspectionResult._inspectionBeforePlayers,
    _inspectionEvents: inspectionResult._inspectionEvents,
  };
}

function makeInspectionMeta(gs){
  return {
    inspectionDeck: gs?.inspectionDeck??[],
    inspectionDiscard: gs?.inspectionDiscard??[],
    sealLooseningCount: gs?.sealLooseningCount??0,
    houndsOfTindalosActive: gs?.houndsOfTindalosActive??false,
    houndsOfTindalosTarget: gs?.houndsOfTindalosTarget??null,
    houndsOfTindalosElapsed: gs?.houndsOfTindalosElapsed??0,
    _inspectionSeq: gs?._inspectionSeq||0,
    _inspectionCard: gs?._inspectionCard||null,
    _inspectionTarget: gs?._inspectionTarget??null,
    _inspectionPrevLogLen: gs?._inspectionPrevLogLen??null,
    _inspectionBeforePlayers: gs?._inspectionBeforePlayers??null,
    _inspectionEvents: gs?._inspectionEvents??[],
  };
}

function sortInspectionTargets(targets,startIndex,totalPlayers){
  const uniq=[...new Set((targets||[]).filter(i=>i!=null))];
  return uniq.sort((a,b)=>(((a-startIndex)+totalPlayers)%totalPlayers)-(((b-startIndex)+totalPlayers)%totalPlayers));
}

function processInspectionTargets(targets,startIndex,P,D,Disc,baseLog,inspectionMeta){
  let nextP=P,nextD=D,nextDisc=Disc,nextLog=[...baseLog],nextMeta={...inspectionMeta};
  const ordered=sortInspectionTargets(targets,startIndex,nextP.length||1);
  for(const idx of ordered){
    const inspectionResult=handleInspection(idx,{
      players:nextP,
      deck:nextD,
      discard:nextDisc,
      log:nextLog,
      inspectionDeck:nextMeta.inspectionDeck,
      inspectionDiscard:nextMeta.inspectionDiscard,
      sealLooseningCount:nextMeta.sealLooseningCount,
      houndsOfTindalosActive:nextMeta.houndsOfTindalosActive,
      houndsOfTindalosTarget:nextMeta.houndsOfTindalosTarget,
      houndsOfTindalosElapsed:nextMeta.houndsOfTindalosElapsed,
      _inspectionSeq:nextMeta._inspectionSeq,
    });
    nextP=inspectionResult.players;
    nextD=inspectionResult.deck;
    nextDisc=inspectionResult.discard;
    nextLog=inspectionResult.log||nextLog;
    nextMeta=mergeInspectionMeta(nextMeta,inspectionResult);
  }
  return {P:nextP,D:nextD,Disc:nextDisc,log:nextLog,inspectionMeta:nextMeta};
}

function applyInspectionForSanLoss(targetIndex,newSan,startIndex,P,D,Disc,baseLog,inspectionMeta){
  if(newSan>6)return {P,D,Disc,log:baseLog,inspectionMeta};
  return processInspectionTargets([targetIndex],startIndex,P,D,Disc,baseLog,inspectionMeta);
}

function clearPlayerGodZone(targetPlayer,discard){
  if(targetPlayer?.godZone?.length)discard.push(...targetPlayer.godZone);
  if(targetPlayer){
    targetPlayer.godZone=[];
    targetPlayer.godName=null;
    targetPlayer.godLevel=0;
  }
}

function applySanLossToPlayerWithInspection(targetIndex,amount,startIndex,P,D,Disc,L,inspectionMeta){
  P[targetIndex].san=clamp(P[targetIndex].san-amount);
  const processed=applyInspectionForSanLoss(targetIndex,P[targetIndex].san,startIndex,P,D,Disc,L,inspectionMeta);
  return {
    P:processed.P,
    D:processed.D,
    Disc:processed.Disc,
    L:processed.log,
    inspectionMeta:processed.inspectionMeta,
  };
}

function abandonGodFollower(targetIndex,startIndex,P,D,Disc,L,inspectionMeta,logMsg=`被邪神抛弃，SAN-1`){
  L=[...L,`${P[targetIndex].name} ${logMsg}`];
  const processed=applySanLossToPlayerWithInspection(targetIndex,1,startIndex,P,D,Disc,L,inspectionMeta);
  P=processed.P;D=processed.D;Disc=processed.Disc;L=processed.L;inspectionMeta=processed.inspectionMeta;
  clearPlayerGodZone(P[targetIndex],Disc);
  return {P,D,Disc,L,inspectionMeta};
}

function convertGodFollower(targetIndex,startIndex,P,D,Disc,L,inspectionMeta,logMsg){
  const convertLog=logMsg||`${P[targetIndex].name} 改信新神，SAN-1`;
  L=[...L,convertLog];
  const processed=applySanLossToPlayerWithInspection(targetIndex,1,startIndex,P,D,Disc,L,inspectionMeta);
  P=processed.P;D=processed.D;Disc=processed.Disc;L=processed.L;inspectionMeta=processed.inspectionMeta;
  clearPlayerGodZone(P[targetIndex],Disc);
  return {P,D,Disc,L,inspectionMeta};
}


// ══════════════════════════════════════════════════════════════
//  ANIMATION SYSTEM  ─ queue-based, game freezes until all done
// ══════════════════════════════════════════════════════════════

// Evil card types: cause HP or SAN damage to others
const EVIL_TYPES=new Set([
  'selfDamageHP','selfDamageSAN','selfDamageHPSAN',
  'selfDamageDiscardHP','selfDamageDiscardSAN',
  'selfDamageRestHP','selfDamageRestSAN','adjDamageHP','adjDamageSAN','adjDamageBoth',
  'allDamageHP','allDamageSAN','allDamageBoth','allDiscard','selfRenounceGod',
]);


// Duration (ms) per animation type
const AI_AUTO_STEP_DELAY=900;
const AI_PICK_STEP_DELAY=1300;

const EMPTY_TURN_ANIM_FIELDS=Object.freeze({
  _playersBeforeThisDraw:null,
  _turnStartLogs:[],
  _drawLogs:[],
  _statLogs:[],
  _preTurnPlayers:null,
  _preTurnStatLogs:[],
});
function withClearedTurnAnimFields(state,extra={}){
  return {...state,...EMPTY_TURN_ANIM_FIELDS,...extra};
}
function buildLocalCthDecisionState(baseState,{
  players,
  deck,
  discard,
  log,
  drawnCard,
  remainingDraws,
  needGodChoice=false,
  preStatLogs=[],
  statLogs=[],
  extraState={},
}){
  const drawLogs=[`你 摸到 ${cardLogText(drawnCard,{alwaysShowName:true})}`,...(needGodChoice?[]:preStatLogs)];
  if(needGodChoice){
    return {
      ...baseState,
      players,
      deck,
      discard,
      log,
      currentTurn:0,
      phase:'GOD_CHOICE',
      abilityData:{godCard:drawnCard,fromRest:true,cthDrawsRemaining:remainingDraws,drawerIdx:0},
      drawReveal:null,
      selectedCard:null,
      _turnStartLogs:[],
      _drawLogs:drawLogs,
      _statLogs:[],
      ...extraState,
    };
  }
  return {
    ...baseState,
    players,
    deck,
    discard,
    log,
    currentTurn:0,
    phase:'DRAW_REVEAL',
    drawReveal:{card:drawnCard,msgs:[],needsDecision:true,forcedKeep:false,drawerIdx:0,drawerName:players[0].name,fromRest:true},
    selectedCard:null,
    abilityData:{fromRest:true,cthDrawsRemaining:remainingDraws},
    _turnStartLogs:[],
    _drawLogs:drawLogs,
    _statLogs:statLogs,
    ...extraState,
  };
}
function buildPlayerTurnDrawQueue(oldGs,newGs,seedQueue=[]){
  const queue=[...(Array.isArray(seedQueue)?seedQueue:[])];
  if(isLocalCurrentTurn(newGs)&&newGs.drawReveal?.card){
    queue.push(
      {type:'YOUR_TURN',msgs:newGs._turnStartLogs},
      {type:'DRAW_CARD',card:newGs.drawReveal.card,triggerName:'你',targetPid:0,msgs:newGs._drawLogs}
    );
    const statQ=bindAnimLogChunks(buildAnimQueue(oldGs,newGs),{statLogs:newGs._statLogs});
    queue.push(...statQ);
  }
  return queue;
}

function buildAnimQueue(oldGs,newGs){
  const q=[];
  const newInspectionEvents=(newGs?._inspectionEvents||[]).filter(ev=>ev?.seq>(oldGs?._inspectionSeq||0));
  const effectivePlayers=newInspectionEvents[0]?.beforePlayers||newGs.players;
  const effectiveLog=newInspectionEvents[0]?.beforeLog||newGs.log;
  const newMsgs=effectiveLog.slice(oldGs.log.length);
  // 当回合交接时因首牌强制触发效果（如扭伤）直接导致游戏结束，必须补全飞牌和回合展示动画
  if(newGs.gameOver && newGs.currentTurn !== oldGs.currentTurn){
    const dCard = newGs._aiDrawnCard || newGs._drawnCard || newGs.drawReveal?.card;
    if(dCard){
      q.push({type:'YOUR_TURN', name:newGs.players[newGs.currentTurn]?.name||'???', msgs: newGs._turnStartLogs||[]});
      q.push({type:'DRAW_CARD', card: dCard, triggerName: newGs.players[newGs.currentTurn]?.name||'???', targetPid: newGs.currentTurn, msgs: newGs._drawLogs||[]});
    }
  }
  const deathIdx=effectivePlayers.reduce((acc,p,i)=>{if(oldGs.players[i]&&!oldGs.players[i].isDead&&p.isDead)acc.push(i);return acc;},[]);
  const _ts=effectivePlayers.map(p=>({hp:p.hp,san:p.san,isDead:p.isDead}));
  const hpHealIdx=effectivePlayers.reduce((acc,p,i)=>{if(oldGs.players[i]&&p.hp>oldGs.players[i].hp)acc.push(i);return acc;},[]);
  const sanHealIdx=effectivePlayers.reduce((acc,p,i)=>{if(oldGs.players[i]&&p.san>oldGs.players[i].san)acc.push(i);return acc;},[]);
  const sameHealTargets=hpHealIdx.length&&sanHealIdx.length&&hpHealIdx.length===sanHealIdx.length&&hpHealIdx.every((v,i)=>v===sanHealIdx[i]);
  const hpHitIdx=effectivePlayers.reduce((acc,p,i)=>{if(oldGs.players[i]&&p.hp<oldGs.players[i].hp)acc.push(i);return acc;},[]);
  if(hpHitIdx.length) q.push({type:'HP_DAMAGE',msgs:newMsgs,hitIndices:hpHitIdx,targetStats:_ts});
  if(sameHealTargets){
    q.push({type:'HP_SAN_HEAL',msgs:newMsgs,hitIndices:hpHealIdx,targetStats:_ts});
  }else{
    if(hpHealIdx.length) q.push({type:'HP_HEAL',msgs:newMsgs,hitIndices:hpHealIdx,targetStats:_ts});
    if(sanHealIdx.length) q.push({type:'SAN_HEAL',msgs:newMsgs,hitIndices:sanHealIdx,targetStats:_ts});
  }
  const sanHitIdx=effectivePlayers.reduce((acc,p,i)=>{if(oldGs.players[i]&&p.san<oldGs.players[i].san)acc.push(i);return acc;},[]);
  if(sanHitIdx.length) q.push({type:'SAN_DAMAGE',msgs:newMsgs,hitIndices:sanHitIdx,targetStats:_ts});
  if(deathIdx.length){
    q.push({type:'GUILLOTINE',msgs:newMsgs,hitIndices:deathIdx,targetStats:_ts});
    q.push({type:'DEATH',msgs:newMsgs,hitIndices:deathIdx,targetStats:_ts});
  }
  // 仅在地动山摇效果实际结算时播放，不因追捕亮牌等日志文本误触发
  if((newGs._earthquakeSeq||0)!==(oldGs._earthquakeSeq||0)){
    q.push({type:'EARTHQUAKE',msgs:newMsgs});
  }
  const fullHandSwapMsg=newMsgs.find(m=>m.includes('交换了全部手牌'));
  if(fullHandSwapMsg){
    const swapMatch=fullHandSwapMsg.match(/^(.+?) 与 (.+?) 交换了全部手牌/);
    const fromName=swapMatch?.[1];
    const toName=swapMatch?.[2];
    const resolveSwapPid=(name)=>{
      if(!name)return-1;
      if(name==='你')return 0;
      return effectivePlayers.findIndex(p=>p?.name===name);
    };
    const fromPid=resolveSwapPid(fromName);
    const toPid=resolveSwapPid(toName);
    if(fromPid>=0&&toPid>=0&&oldGs.players[fromPid]&&oldGs.players[toPid]){
      q.push({type:'CARD_TRANSFER',fromPid,dest:'player',toPid,count:oldGs.players[fromPid].hand.length});
      q.push({type:'CARD_TRANSFER',fromPid:toPid,dest:'player',toPid:fromPid,count:oldGs.players[toPid].hand.length});
      return q;
    }
  }
  // Detect hand card losses → CARD_TRANSFER
  const losers=effectivePlayers.filter((p,i)=>oldGs.players[i]&&p.hand.length<oldGs.players[i].hand.length);
  if(losers.length===1){
    // 普通单向手牌减少（追捕没收、蛊惑、弃牌等）
    const li=effectivePlayers.indexOf(losers[0]);
    const count=(oldGs.players[li].hand.length-effectivePlayers[li].hand.length);
    let dest='discard',toPid=null;
    for(let j=0;j<effectivePlayers.length;j++){
      if(j===li||!oldGs.players[j])continue;
      if(effectivePlayers[j].hand.length>oldGs.players[j].hand.length){dest='player';toPid=j;break;}
    }
    if(dest==='discard'){
      const oldGZ=oldGs.players[li].godZone?.length||0;
      const newGZ=effectivePlayers[li].godZone?.length||0;
      if(newGZ>oldGZ)dest='godzone';
    }
    // 死亡角色的手牌放入弃牌堆时不生成飞牌动画（追捕击杀的飞牌动画在 buildAiHuntEventAnimQueue 中单独处理）
    if (!effectivePlayers[li]?.isDead) {
      q.push({type:'CARD_TRANSFER',fromPid:li,dest,toPid,count});
    }
  }else if(losers.length===2){
    // 双向交换（掉包）：为双方各生成一条飞牌动画
    // A→B（发动者把牌给目标），B→A（目标的牌到发动者）
    losers.forEach(loser=>{
      const li=effectivePlayers.indexOf(loser);
      const toPid=effectivePlayers.findIndex((p,j)=>j!==li&&oldGs.players[j]&&p.hand.length>oldGs.players[j].hand.length);
      if(toPid<0)return;
      const count=oldGs.players[li].hand.length-effectivePlayers[li].hand.length;
      q.push({type:'CARD_TRANSFER',fromPid:li,dest:'player',toPid,count});
    });
  }
  return q;
}

function buildFullHandSwapTransferQueueFromLogs(logs, players){
  const fullHandSwapMsg=(Array.isArray(logs)?logs:[]).find(
    line=>typeof line==='string'&&line.includes('交换了全部手牌')
  );
  if(!fullHandSwapMsg||!Array.isArray(players))return [];
  const swapMatch=fullHandSwapMsg.match(/^(.+?) 与 (.+?) 交换了全部手牌/);
  const fromName=swapMatch?.[1];
  const toName=swapMatch?.[2];
  const resolveSwapPid=(name)=>{
    if(!name)return-1;
    if(name==='你')return 0;
    return players.findIndex(p=>p?.name===name);
  };
  const fromPid=resolveSwapPid(fromName);
  const toPid=resolveSwapPid(toName);
  if(fromPid<0||toPid<0||!players[fromPid]||!players[toPid])return [];
  return [
    {type:'CARD_TRANSFER',fromPid,dest:'player',toPid,count:players[fromPid].hand.length},
    {type:'CARD_TRANSFER',fromPid:toPid,dest:'player',toPid:fromPid,count:players[toPid].hand.length,msgs:[fullHandSwapMsg]},
  ];
}

function buildAiHuntEventAnimQueue(evt, actorName){
  const huntMsgs=Array.isArray(evt.msgs)&&evt.msgs.length?[evt.msgs[0]]:[];
  const followupMsgs=Array.isArray(evt.msgs)?evt.msgs.slice(1):[];
  const perHuntQueue=[{type:'SKILL_HUNT',msgs:huntMsgs,_logChunk:huntMsgs,targetIdx:evt.targetIdx>=0?evt.targetIdx:1}];
  const takeFollowup=(predicate)=>{
    const idx=followupMsgs.findIndex(predicate);
    if(idx<0)return [];
    return followupMsgs.splice(idx,1);
  };
  if(evt.discardedCard){
    const discardChunk=takeFollowup(line=>/^弃 \[/.test(line||''));
    perHuntQueue.push({type:'DISCARD',card:evt.discardedCard,triggerName:actorName||'???',targetPid:evt.hunterIdx,_logChunk:discardChunk});
    if(evt.afterDiscardPlayers){
      perHuntQueue.push({type:'STATE_PATCH',players:evt.afterDiscardPlayers,discard:evt.afterDiscardDiscard});
    }
  }
  if(evt.beforePlayers&&evt.afterPlayers){
    if(evt.afterPlayers[evt.targetIdx]?.isDead && evt.hunterIdx!=null){
      const hunterBefore=evt.beforePlayers[evt.hunterIdx]?.hand?.length||0;
      const hunterAfter=evt.afterPlayers[evt.hunterIdx]?.hand?.length||0;
      const cardsTaken=Math.max(0,hunterAfter-hunterBefore+(evt.discardedCard?1:0));
      if(cardsTaken>0){
        perHuntQueue.push({type:'CARD_TRANSFER',fromPid:evt.targetIdx,dest:'player',toPid:evt.hunterIdx,count:cardsTaken});
      }
    }
    const beforeLog=Array.isArray(evt.beforeLog)?evt.beforeLog:[];
    const afterLog=Array.isArray(evt.afterLog)?evt.afterLog:[...beforeLog,...(evt.msgs||[])];
    const resultQueue=buildAnimQueue(
      {players:evt.beforePlayers,log:beforeLog},
      {players:evt.afterPlayers,log:afterLog}
    );
    const resultWithChunks=resultQueue
      .filter(step=>!(evt.discardedCard&&step.type==='CARD_TRANSFER'&&step.fromPid===evt.hunterIdx&&step.dest==='discard'))
      .map(step=>({...step}));
    if(followupMsgs.length){
      const firstVisibleIdx=resultWithChunks.findIndex(step=>step.type!=='STATE_PATCH');
      if(firstVisibleIdx>=0){
        resultWithChunks[firstVisibleIdx]._logChunk=[
          ...(Array.isArray(resultWithChunks[firstVisibleIdx]._logChunk)?resultWithChunks[firstVisibleIdx]._logChunk:[]),
          ...followupMsgs,
        ];
      }
    }
    perHuntQueue.push(...resultWithChunks);
    perHuntQueue.push({type:'STATE_PATCH',players:evt.afterPlayers,discard:evt.afterResultDiscard});
  }else if(followupMsgs.length){
    perHuntQueue.push({type:'TURN_BOUNDARY_PAUSE',_logChunk:[...followupMsgs]});
  }
  return perHuntQueue;
}

// ── Bewitch effect description helper ─────────────────────────
function getBewitchEffectDesc(card){
  if(!card) return '';
  if(card.isGod){
    return `你将把「${card.name}」送给目标角色，使该角色遭遇邪神并失去SAN值（第N次遭遇失去N点），该角色可能被迫信仰${card.name}`;
  }
  return `你将把【${card.key} ${card.name}】送给目标角色，并强制其收入手牌后立刻结算：“你”与相邻角色都以该目标为基准计算`;
}

// ── Target Select Overlay ─────────────────────────────────────
function TargetSelectOverlay({drawReveal,phase,bewitchCard}){
  const isActive=['DRAW_SELECT_TARGET','SWAP_SELECT_TARGET','HUNT_SELECT_TARGET','BEWITCH_SELECT_TARGET','ROSE_THORN_SELECT_TARGET'].includes(phase);
  if(!isActive) return null;
  const isBewitch=phase==='BEWITCH_SELECT_TARGET';
  // HUNT_SELECT_TARGET阶段不显示卡牌
  const showCard=phase!=='HUNT_SELECT_TARGET';
  const card=showCard?(isBewitch?bewitchCard:(drawReveal?.card)):null;
  const s=card?(card.isGod?GOD_CS:(CS[card.letter]||GOD_CS)):null;
  const bewitchDesc=isBewitch?getBewitchEffectDesc(card):null;
  const phaseHint={
    DRAW_SELECT_TARGET:'请点击目标角色以施加牌效',
    SWAP_SELECT_TARGET:'请点击目标角色以发动【掉包】',
    PEEK_HAND_SELECT_TARGET:'请点击目标角色以偷看其一张手牌',
    HUNT_SELECT_TARGET:'请点击目标角色以发动【追捕】',
    BEWITCH_SELECT_TARGET:'请选择蛊惑目标',
    CAVE_DUEL_SELECT_TARGET:'请选择一名有手牌的角色进行【穴居人战争】',
    DAMAGE_LINK_SELECT_TARGET:'请选择一名角色建立【两人一绳】链条',
    ROSE_THORN_SELECT_TARGET:'请选择承受【玫瑰倒刺】的目标',
    FIRST_COME_PICK_SELECT:'请从翻开的牌中选择一张收入手牌',
  }[phase]||'请选择目标';
  // 掉包选择目标牌阶段不显示此遮罩
  if(phase==='SWAP_SELECT_TARGET_CARD') return null;
  return(
    <>
      {/* Dark mask */}
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.38)',zIndex:100,pointerEvents:'none'}}/>
      {/* Centering flex container — position:fixed, flex centers child, NO transform on child */}
      <div style={{
        position:'fixed',inset:0,
        display:'flex',alignItems:'center',justifyContent:'center',
        zIndex:102,pointerEvents:'none',
      }}>
        {/* Prompt box — no CSS animation to avoid first-frame position flash */}
        <div style={{
          background:'rgba(10,6,2,0.93)',
          border:`1.5px solid ${s?s.borderBright:'#5a3010'}`,
          borderRadius:4,padding:'18px 28px',
          boxShadow:`0 0 40px ${s?s.glow+'66':'#3a201044'}, 0 0 80px #000a`,
          textAlign:'center',minWidth:260,maxWidth:340,
        }}>
          {card&&(
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10,justifyContent:'center'}}>
              <div style={{
                background:s.bg,border:`1.5px solid ${s.borderBright}`,borderRadius:3,
                padding:'5px 9px',minWidth:48,textAlign:'center',
              }}>
                {card.isGod
                  ?<div style={{fontFamily:"'Cinzel',serif",fontWeight:700,color:s.text,fontSize:20,lineHeight:1.2}}>⛧</div>
                  :<div style={{fontFamily:"'Cinzel',serif",fontWeight:700,color:s.text,fontSize:27,lineHeight:1}}>{card.key}</div>
                }
                <div style={{fontFamily:"'Cinzel',serif",color:'#e8cc88',fontSize:card.isGod?10:14.25,marginTop:2}}>{card.name}</div>
              </div>
              <div style={{textAlign:'left'}}>
                <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#d4b468',fontSize:15,maxWidth:180,lineHeight:1.4}}>{card.isGod?card.subtitle:card.desc}</div>
              </div>
            </div>
          )}
          {/* Bewitch effect preview */}
          {isBewitch&&bewitchDesc&&(
            <div style={{
              background:'rgba(80,20,100,0.22)',
              border:'1px solid #7040aa55',
              borderRadius:3,padding:'7px 10px',
              marginBottom:10,textAlign:'left',
            }}>
              <div style={{fontFamily:"'Cinzel',serif",color:'#9060cc',fontSize:9,letterSpacing:2,marginBottom:4,textTransform:'uppercase'}}>☽ 蛊惑效果预览</div>
              <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#d4b0e8',fontSize:13,lineHeight:1.6}}>
                {bewitchDesc}
              </div>
            </div>
          )}
          <div style={{
            fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:18,
            color:'#e8cc88',letterSpacing:2,textTransform:'uppercase',
          }}>{phaseHint}</div>
          <div style={{fontFamily:"'Cinzel',serif",color:'#c8a055',fontSize:13.5,letterSpacing:1,marginTop:6}}>↑ 点击上方高亮角色</div>
        </div>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════
//  MAIN GAME
// ══════════════════════════════════════════════════════════════
// ── Flying Emoji ─────────────────────────────────────────────

// ── Flying Emoji ─────────────────────────────────────────────
const EMOJI_LIST=[
  '😂','🎉','👍','🔥',
  '😡','😢','😱','💀',
  '🤔','😏','👀','😴',
];
function FlyingEmoji({id,emoji,startX,startY,endX,endY,arcHeight,durationMs,onDone}){
  const ref=useRef(null);
  useEffect(()=>{
    const t0=performance.now();
    let raf;
    function frame(now){
      const t=Math.min((now-t0)/durationMs,1);
      const x=startX+(endX-startX)*t;
      const y=startY+(endY-startY)*t - arcHeight*4*t*(1-t);
      const opacity=t<0.65?1:Math.max(0,1-(t-0.65)/0.35);
      const scale=0.7+0.6*Math.sin(Math.PI*t);
      if(ref.current){
        ref.current.style.left=x+'px';
        ref.current.style.top=y+'px';
        ref.current.style.opacity=opacity;
        ref.current.style.transform=`translate(-50%,-50%) scale(${scale})`;
      }
      if(t<1){raf=requestAnimationFrame(frame);}
      else{onDone(id);}
    }
    raf=requestAnimationFrame(frame);
    return()=>cancelAnimationFrame(raf);
  },[arcHeight,durationMs,endX,endY,id,onDone,startX,startY]);
  return(
    <div ref={ref} style={{
      position:'fixed',left:startX,top:startY,fontSize:26,
      pointerEvents:'none',zIndex:5000,
      transform:'translate(-50%,-50%)',userSelect:'none',
      willChange:'left,top,opacity,transform',
    }}>{emoji}</div>
  );
}

function useWindowSize(){
  const[sz,setSz]=useState({w:typeof window!=='undefined'?window.innerWidth:1200,h:typeof window!=='undefined'?window.innerHeight:800});
  useEffect(()=>{
    const h=()=>setSz({w:window.innerWidth,h:window.innerHeight});
    window.addEventListener('resize',h);
    return()=>window.removeEventListener('resize',h);
  },[]);
  return sz;
}

const NARRATOR_AVATAR="data:image/png;base64,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";

// Small narrator portrait used in tutorial popups
function NarratorAvatar({tooltipW}){
  const sz=Math.max(36,Math.floor((tooltipW||260)/4));
  return(
    <img src={NARRATOR_AVATAR} alt="narrator"
      style={{width:sz,height:sz,borderRadius:3,objectFit:'cover',objectPosition:'top',
        border:'1.5px solid #5a3a10',flexShrink:0,
        boxShadow:'0 0 8px #7a502055',imageRendering:'auto'}}
    />
  );
}

// Persistent gamma / brightness slider — top-right corner
function GammaSlider({gamma,onChange}){
  const [hover,setHover]=useState(false);
  // Rendered via Portal directly onto document.body so that any CSS filter on ancestor
  // elements does not affect position:fixed coordinates (filter creates a new containing block).
  return ReactDOM.createPortal(
    <div
      style={{position:'fixed',top:0,left:'50%',transform:'translateX(-50%)',zIndex:1800}}
      onMouseEnter={()=>setHover(true)}
      onMouseLeave={()=>setHover(false)}
    >
      <div
        title="亮度调节"
        style={{
          width:hover?178:32,
          height:hover?40:18,
          borderRadius:'0 0 16px 16px',
          background:'#120d06cc',
          border:'1.5px solid #5a3a18',
          borderTop:'none',
          color:'#b07828',
          fontSize:13,
          cursor:'pointer',
          display:'flex',
          alignItems:'center',
          justifyContent:'center',
          backdropFilter:'blur(4px)',
          transition:'all 0.2s ease',
          padding:0,
          overflow:'hidden',
          whiteSpace:'nowrap',
        }}
      >
        {hover?(
          <div style={{display:'flex',alignItems:'center',gap:6,padding:'0 10px'}} onClick={e=>e.stopPropagation()}>
            <span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:'#b07828',letterSpacing:1,whiteSpace:'nowrap'}}>亮度</span>
            <input
              type="range" min={0.5} max={2} step={0.05}
              value={gamma}
              onChange={e=>onChange(parseFloat(e.target.value))}
              style={{width:70,accentColor:'#b07828',cursor:'pointer'}}
            />
            <span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:'#b07828',width:28,textAlign:'right'}}>{(()=>{const v=Math.round((gamma-1)*100);return v>0?'+'+v:v;})()}%</span>
            <button onClick={()=>onChange(1)} style={{background:'none',border:'none',color:'#7a5020',fontSize:9,cursor:'pointer',padding:'0 2px',fontFamily:"'Cinzel',serif"}}>重置</button>
          </div>
        ):'☀'}
      </div>
    </div>,
    document.body
  );
}

function useGameAudio(isBattleScreen){
  const [audioReady,setAudioReady]=useState(false);
  const readyRef=useRef(false);
  const bgmRefs=useRef({main:null,battle:null});
  const sfxRefs=useRef({open:null,close:null,hpDamage:[]});
  const currentTrackRef=useRef(null);
  const fadeTokenRef=useRef(0);
  const targetVolumesRef=useRef({main:0.32,battle:0.24});

  useEffect(()=>{
    const main=new Audio(buildPublicUrl('sounds/BGM/mainTheme.mp3'));
    const battle=new Audio(buildPublicUrl('sounds/BGM/battle.mp3'));
    const open=new Audio(buildPublicUrl('sounds/SE/open.mp3'));
    const close=new Audio(buildPublicUrl('sounds/SE/close.mp3'));
    const hpDamageVariants=Array.from({length:6},(_,i)=>new Audio(buildPublicUrl(`sounds/SE/hpDamageVariants/hpDamage${i+1}.mp3`)));
    [main,battle].forEach(audio=>{
      audio.loop=true;
      audio.preload='auto';
      audio.volume=0;
    });
    [open,close].forEach(audio=>{
      audio.preload='auto';
      audio.volume=0.6;
    });
    hpDamageVariants.forEach(audio=>{
      audio.preload='auto';
      audio.volume=0.7;
    });
    bgmRefs.current={main,battle};
    sfxRefs.current={open,close,hpDamage:hpDamageVariants};
    return()=>{
      [main,battle,open,close,...hpDamageVariants].forEach(audio=>{
        try{
          audio.pause();
          audio.currentTime=0;
        }catch{/* ignore */}
      });
    };
  },[]);

  const syncTrack=useCallback((instant=false)=>{
    if(!audioReady)return;
    const nextKey=isBattleScreen?'battle':'main';
    const prevKey=currentTrackRef.current;
    if(prevKey===nextKey)return;
    const nextAudio=bgmRefs.current[nextKey];
    const prevAudio=prevKey?bgmRefs.current[prevKey]:null;
    if(!nextAudio)return;
    currentTrackRef.current=nextKey;
    const token=++fadeTokenRef.current;
    const nextTarget=targetVolumesRef.current[nextKey];
    const prevStart=prevAudio?.volume??0;
    const duration=instant?0:420;
    try{
      nextAudio.loop=true;
      nextAudio.volume=instant?nextTarget:0;
      nextAudio.play().catch(()=>{});
    }catch{/* ignore */}
    if(!prevAudio||duration===0){
      if(prevAudio&&prevAudio!==nextAudio){
        try{
          prevAudio.pause();
          prevAudio.currentTime=0;
          prevAudio.volume=0;
        }catch{/* ignore */}
      }
      nextAudio.volume=nextTarget;
      return;
    }
    const start=performance.now();
    const step=now=>{
      if(fadeTokenRef.current!==token)return;
      const progress=Math.min((now-start)/duration,1);
      try{prevAudio.volume=prevStart*(1-progress);}catch{/* ignore */}
      try{nextAudio.volume=nextTarget*progress;}catch{/* ignore */}
      if(progress<1){
        requestAnimationFrame(step);
        return;
      }
      try{
        prevAudio.pause();
        prevAudio.currentTime=0;
        prevAudio.volume=0;
      }catch{/* ignore */}
      try{nextAudio.volume=nextTarget;}catch{/* ignore */}
    };
    requestAnimationFrame(step);
  },[audioReady,isBattleScreen]);

  useEffect(()=>{
    syncTrack(false);
  },[audioReady,isBattleScreen,syncTrack]);

  useEffect(()=>{
    if(audioReady)return;
    const preview=isBattleScreen?bgmRefs.current.battle:bgmRefs.current.main;
    if(!preview)return;
    try{
      preview.loop=true;
      preview.volume=targetVolumesRef.current[isBattleScreen?'battle':'main'];
      preview.play().then(()=>{
        if(!readyRef.current){
          readyRef.current=true;
          setAudioReady(true);
          currentTrackRef.current=isBattleScreen?'battle':'main';
        }
      }).catch(()=>{});
    }catch{/* ignore */}
  },[audioReady,isBattleScreen]);

  const noteUserGesture=useCallback(()=>{
    if(!readyRef.current){
      readyRef.current=true;
      setAudioReady(true);
      queueMicrotask(()=>syncTrack(true));
    }
  },[syncTrack]);

  useEffect(()=>{
    if(audioReady)return;
    const unlock=()=>noteUserGesture();
    const opts={capture:true,once:true};
    window.addEventListener('pointerdown',unlock,opts);
    window.addEventListener('keydown',unlock,opts);
    window.addEventListener('touchstart',unlock,opts);
    return()=>{
      window.removeEventListener('pointerdown',unlock,opts);
      window.removeEventListener('keydown',unlock,opts);
      window.removeEventListener('touchstart',unlock,opts);
    };
  },[audioReady,noteUserGesture]);

  const playSfx=useCallback(kind=>{
    noteUserGesture();
    const audio=sfxRefs.current[kind];
    if(!audio)return;
    try{
      audio.pause();
      audio.currentTime=0;
      audio.play().catch(()=>{});
    }catch{/* ignore */}
  },[noteUserGesture]);

  const playTickSound=useCallback(()=>{
    noteUserGesture();
    try{
      const ctx=new (window.AudioContext||window.webkitAudioContext)();
      const osc=ctx.createOscillator();
      const gain=ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value=800;
      osc.type='sine';
      gain.gain.setValueAtTime(0.15,ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.05);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime+0.05);
    }catch{/* ignore */}
  },[noteUserGesture]);

  const playHpDamageSound=useCallback(()=>{
    noteUserGesture();
    const variants=sfxRefs.current.hpDamage||[];
    if(!variants.length)return;
    const audio=variants[Math.floor(Math.random()*variants.length)];
    if(!audio)return;
    try{
      audio.pause();
      audio.currentTime=0;
      audio.play().catch(()=>{});
    }catch{/* ignore */}
  },[noteUserGesture]);
  
    const playOpenSound=useCallback(()=>playSfx('open'),[playSfx]);
    const playCloseSound=useCallback(()=>playSfx('close'),[playSfx]);
    return{
      noteUserGesture,
      playOpenSound,
      playCloseSound,
      playTickSound,
      playHpDamageSound,
    };
  }

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
    lobbyModal, setLobbyModal,
    lobbyRooms, setLobbyRooms,
    lobbyLoading, setLobbyLoading,
    showPrivacyToggleConfirm, setShowPrivacyToggleConfirm,
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
    // userInfo：打开联机选项界面时后端下发，含异常断线标志
    socket.on('userInfo',({username,isSpecialName,wasForceReset})=>{
      setPlayerUsername(username);
      setPlayerUsernameSpecial(!!isSpecialName);
      setRenameInput(username);
      cleanup();
      setMultiLoading(false);
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
  const[anim,setAnim]=useState(null);
  const[animExiting,setAnimExiting]=useState(false);
  const[hitIndices,setHitIndices]=useState([]);    // HP damage
  
  // --- 新增：用于 UI 延迟显示的 HP/SAN 状态 ---
  const [displayStats, setDisplayStats] = useState(() => gs?.players ? gs.players.map(p => ({ hp: p.hp, san: p.san })) : []);
  
  // 1. 兜底与静默同步：当没有动画在播放时，且不处于AI回合（AI回合中draw效果已bake进gs但动画尚未开始），UI 强制对齐真实的底层数据
  useEffect(() => {
    if (gs?.players && (!anim && (!animQueueRef.current || animQueueRef.current.length === 0))) {
      // AI_TURN 阶段：draw效果已经应用到gs.players，但2100ms后才开始播放动画
      // 此时不应更新displayStats，否则HP条会先于动画跳变
      if (gs.phase === 'AI_TURN') return;
      setDisplayStats(gs.players.map(p => ({ hp: p.hp, san: p.san })));
    }
  }, [gs?.players, anim, gs?.phase]);
  
  // 2. 动画期间的精准延迟对齐：当播放某个角色的受击/治疗动画时，延迟 350ms 更新显示数值
  //    每个动画项携带 targetStats（来自 buildAnimQueue），表示该动画完成时各角色的目标 HP/SAN
  useEffect(() => {
    if (anim && anim.targetStats) {
      // 收集当前动画可能影响到的所有目标
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
  const animQueueRef=useRef([]);
  const pendingGsRef=useRef(null);
  const prevDamageLinksRef=useRef([]);
  const prevLogLenRef=useRef(0);
  const damageLinkGhostTimersRef=useRef(new Map());
  const [damageLinkGhosts,setDamageLinkGhosts]=useState([]);
  const animCallbackRef=useRef(null); // callback to execute after animation queue
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
  const lastInspectionSeqRef=useRef(0);
  const [houndsSecLeft,setHoundsSecLeft]=useState(null);

  // ── Responsive layout ──────────────────────────────────────
  const {w:vw}=useWindowSize();
  const isMobile=vw<580;
const MIN_FONT_VW=480; // 最小字号阈值视口宽度
  const isVerySmall=vw<MIN_FONT_VW;
  // Scale ratio for responsive player areas (based on 1200px design width)
  const DESIGN_WIDTH=1200;
  const scaledAreaSafeInsetX=isMobile?24:12;
  const narrowDesktopClipFix=vw<=1220;
  const globalShiftX=narrowDesktopClipFix?Math.min(12,Math.round((1220-vw)*0.5)):0;
  const rawScale=vw/DESIGN_WIDTH;
  const shouldScale=vw<DESIGN_WIDTH;
  const scaleRatio=shouldScale?Math.min(rawScale,1):1;
  // 基于rem的最小字号（浏览器默认16px）
  const rem=16;
  // 基础字号（UI chrome元素，不补偿）
  const baseFontSizes={
    title: isMobile?0.75*rem:isVerySmall?0.75*rem:0.875*rem,    // 标题
    subtitle: isMobile?0.5*rem:isVerySmall?0.5*rem:0.625*rem,   // 副标题
    body: isMobile?0.625*rem:isVerySmall?0.625*rem:0.6875*rem, // 正文
    small: isMobile?0.5*rem:isVerySmall?0.5*rem:0.5625*rem,    // 小字
    tiny: isMobile?0.4375*rem:isVerySmall?0.4375*rem:0.5*rem,  // 极小
  };
  // 内容字号（需要补偿缩放）
  const fontZoomCompensate = scaleRatio < 1 ? 1 / scaleRatio : 1;
  const fontSizes={
    title: baseFontSizes.title * fontZoomCompensate,
    subtitle: baseFontSizes.subtitle * fontZoomCompensate,
    body: baseFontSizes.body * fontZoomCompensate,
    small: baseFontSizes.small * fontZoomCompensate,
    tiny: baseFontSizes.tiny * fontZoomCompensate,
  };
  const middleRowHeight=isMobile?248:282;

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
    if(!gs||anim||animQueueRef.current.length>0||gs.gameOver)return;
    const normalized=moveEligibleBlankZones(gs.players,gs.log||[]);
    if(!normalized)return;
    setGs(prev=>{
      if(!prev||prev.gameOver)return prev;
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
          const el=document.querySelector(`[data-pid="${idx}"]`);
          if(!el)return null;
          const r=_getZoomCompensatedRect(el);
          let snapshotUrl=null;
          try{
            const canvas=await html2canvas(el,{
              backgroundColor:null,
              useCORS:true,
              logging:false,
              scale:Math.min(window.devicePixelRatio||1,2),
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

  // Advance to next animation in queue, or apply final game state
  function revealAnimLogs(animStep){
    if(!animStep)return;
    if(Array.isArray(animStep._logChunk)&&animStep._logChunk.length){
      appendVisibleLog(animStep._logChunk);
    }
  }

  function advanceQueue(){
    setAnimExiting(false);
    if(animQueueRef.current.length>0){
      const next=animQueueRef.current.shift();
      if(next.type==='STATE_PATCH'){
        revealAnimLogs(next);
        visualPlayersLockRef.current=null;
        setVisualDiscard([...(next.discard||[])]);
        setGs(prev=>prev?{...prev,players:copyPlayers(next.players||prev.players),discard:[...(next.discard||prev.discard)]}:prev);
        advanceQueue();
      }else if(next.type==='CTH_CONTINUE'){
        // 处理拉莱耶之主的剩余摸牌
        setAnim(null);
        const currentGs=pendingGsRef.current||gs;
        pendingGsRef.current=null;
        const cthDrawsRemaining=next.data?.cthDrawsRemaining||0;
        if(cthDrawsRemaining>0){
          _cthContinueRestDraws(currentGs);
        }else{
          const nextGs=startNextTurn({...currentGs,currentTurn:0,abilityData:{}});
          applyNextTurnGs(nextGs);
        }
      }else{
        const nextTurnHighlight=resolveTurnHighlightForStep(next,pendingGsRef.current||gs,gs?.players||[]);
        if(nextTurnHighlight!=null)turnHighlightLockRef.current=nextTurnHighlight;
        setAnim(next);
        revealAnimLogs(next);
      }
    }else{
      const next=pendingGsRef.current;
      const callback=animCallbackRef.current;
      pendingGsRef.current=null;
      animCallbackRef.current=null;
      turnHighlightLockRef.current=null;
      visualPlayersLockRef.current=null;
      setAnim(null);
      if(next?.log)syncVisibleLog(next.log);
      if(callback){
        callback();
      }else if(next){
        setVisualDiscard(getVisualDiscardForState(next));
        if(suppressNextBroadcastRef.current){
          // This pendingGs came from a received state; don't echo it back to server
          suppressNextBroadcastRef.current=false;
          receivedGsRef.current=true;
        }
        setGs(prev=>{
          // Never overwrite a win/pending-win state with stale queued state
          if(prev?.gameOver||prev?.phase==='PLAYER_WIN_PENDING'||prev?.phase==='TREASURE_WIN')return prev;
          const preservePendingDeathPid=next?.phase==='HUNT_SELECT_CARD_FROM_PUBLIC'
            ? (next?.abilityData?.huntTi??null)
            : null;
          // 清除 _pendingAnimDeath，确保死亡角色面板在动画队列结束后立即置灰
          // 例外：追捕致死后进入公开挑牌阶段时，先保留死者未置灰状态，直到挑牌完成
          if(next?.players){
            return {...next, players: clearPendingAnimDeathFlags(next.players,preservePendingDeathPid)};
          }
          return next;
        });
      }
    }
  }

  // Animation lifecycle — duration depends on type
  useEffect(()=>{
    if(!anim) return;
    const isCard=anim.type==='DRAW_CARD';
    const dur=isCard?CARD_REVEAL_DURATION:Math.round((ANIM_DURATION[anim.type]||ANIM_DURATION.default)*ANIM_SPEED_SCALE);
    let gapTimer=null;
    const t1=setTimeout(()=>{
      if(isCard){
        gapTimer=setTimeout(advanceQueue,ANIM_STEP_GAP);
      }else{
        setAnimExiting(true);
        gapTimer=setTimeout(advanceQueue,ANIM_STEP_GAP);
      }
    },dur);
    return()=>{
      clearTimeout(t1);
      if(gapTimer)clearTimeout(gapTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[anim]);

  // Trigger a sequential queue of animations, then apply nextGs or callback
  function triggerAnimQueue(queue,nextGs,callback){
    // 检查是否有死亡动画需要等待
    const hasDeathAnim = queue.some(a => a.type === 'DEATH' || a.type === 'GUILLOTINE');
    // 检查是否有待播放死亡特效的角色
    const pendingDeathPlayers = nextGs?.players?.filter(p => p._pendingAnimDeath)?.map((_, i) => i) || [];
    
    if(!queue.length){
      if(callback){
        if(nextGs?.log)syncVisibleLog(nextGs.log);
        callback();
      }else{
        if(nextGs?.log)syncVisibleLog(nextGs.log);
        // 动画队列为空但有死亡时，仍需等待死亡特效播放完成
        if(hasDeathAnim && pendingDeathPlayers.length) {
          setGs({...nextGs});
        } else {
          setGs(nextGs);
        }
      }
      return;
    }
    // 创建带延迟清理的callback
    const wrappedCallback = hasDeathAnim && pendingDeathPlayers.length ? () => {
      const preservePendingDeathPid=nextGs?.phase==='HUNT_SELECT_CARD_FROM_PUBLIC'
        ? (nextGs?.abilityData?.huntTi??null)
        : null;
      // 清除所有角色的_pendingAnimDeath标记，使面板置灰
      // 例外：追捕致死后进入公开挑牌阶段时，先保留死者未置灰状态
      const cleanedPlayers = clearPendingAnimDeathFlags(nextGs.players,preservePendingDeathPid);
      const finalGs = {...nextGs, players: cleanedPlayers};
      if(callback){
        callback();
      } else {
        if(finalGs.log)syncVisibleLog(finalGs.log);
        setGs(finalGs);
      }
    } : callback;
    
    visibleLogAuthorityRef.current=Array.isArray(nextGs?.log)?nextGs.log:(Array.isArray(visibleLogAuthorityRef.current)?visibleLogAuthorityRef.current:[]);
    const preparedQueue=prepareAnimQueueLogs(queue,nextGs,visibleLogRef.current);
    turnHighlightLockRef.current=gs?.currentTurn??null;
    const firstTurnHighlight=resolveTurnHighlightForStep(preparedQueue[0],nextGs,gs?.players||[]);
    if(firstTurnHighlight!=null)turnHighlightLockRef.current=firstTurnHighlight;
    pendingGsRef.current=nextGs;
    animQueueRef.current=[...preparedQueue.slice(1)];
    animCallbackRef.current=wrappedCallback;
    setAnim(preparedQueue[0]);
    revealAnimLogs(preparedQueue[0]);
  }

  // Detect stuck state: AI's turn but phase is not AI_TURN (e.g. got stuck in DRAW_REVEAL)
  // This can happen in rare edge cases; recover by forcing the turn to advance
  useEffect(()=>{
    if(!gs||isMultiplayerGame(gs)||gs.gameOver||anim||showTutorial)return;
    if(!isAiCurrentTurn(gs))return; // player's turn, normal
    const aiPhase=gs.phase;
    // AI is in a phase that requires player interaction — this is a stuck state
    const badPhases=['ACTION','DRAW_REVEAL','DRAW_SELECT_TARGET','GOD_CHOICE','NYA_BORROW',
                     'SWAP_SELECT_TARGET','SWAP_GIVE_CARD','BEWITCH_SELECT_CARD','BEWITCH_SELECT_TARGET',
                     'HUNT_SELECT_TARGET','HUNT_CONFIRM','DISCARD_PHASE',
                     'DAMAGE_LINK_SELECT_TARGET','PEEK_HAND_SELECT_TARGET','CAVE_DUEL_SELECT_TARGET','ROSE_THORN_SELECT_TARGET'];
    if(!badPhases.includes(aiPhase))return;
    console.warn('[stuck-recovery] AI in bad phase',aiPhase,'at turn',gs.currentTurn);
    const t=setTimeout(()=>{
      setGs(p=>{
        if(!p||isMultiplayerGame(p)||!isAiCurrentTurn(p))return p;
        if(!badPhases.includes(p.phase))return p;
        const safeLog=[...p.log,`${p.players[p.currentTurn]?.name||'该AI'} 的回合状态异常，系统强制推进流程`];
        return startNextTurn({...p,log:safeLog,currentTurn:p.currentTurn,skillUsed:true,restUsed:false,huntAbandoned:[]});
      });
    },500);
    return()=>clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs?.currentTurn,gs?.phase,gs?._isMP,anim,gs?.gameOver,showTutorial]);

  // Hard watchdog: if an AI turn stays in AI_TURN without any progress, recover even when the normal
  // AI-turn effect failed to arm (for example because some stale animation flag never cleared).
  useEffect(()=>{
    if(!gs||isMultiplayerGame(gs)||gs.gameOver||showTutorial)return;
    if(!isAiCurrentTurn(gs)||gs.phase!=='AI_TURN')return;
    const guardTurnKey=gs._turnKey;
    const guardTurn=gs.currentTurn;
    const guardLogLen=gs.log?.length||0;
    const watchdog=setTimeout(()=>{
      setGs(p=>{
        if(!p||isMultiplayerGame(p)||p.gameOver||!isAiCurrentTurn(p)||p.phase!=='AI_TURN')return p;
        if((guardTurnKey!=null&&p._turnKey!==guardTurnKey)||p.currentTurn!==guardTurn)return p;
        if((p.log?.length||0)!==guardLogLen)return p;
        const safeLog=[...p.log,`${p.players[p.currentTurn]?.name||'该AI'} 的AI回合疑似卡死，系统强制推进流程`];
        return startNextTurn({...p,log:safeLog,currentTurn:p.currentTurn,skillUsed:true,restUsed:false,huntAbandoned:[]});
      });
    },20000);
    return()=>clearTimeout(watchdog);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[gs?.currentTurn,gs?.phase,gs?._turnKey,gs?.log?.length,gs?._isMP,gs?.gameOver,showTutorial]);

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
        rawResult=aiStep(gs);
        const{_aiDrawnCard:_a,_aiName:_n,_playersBeforeNextDraw:_pbn,_aiHuntEvents:_he,_playersBeforeSkillAction:_pbsa,_preSkillLogs:_psl,_preSkillDiscard:_psd,...stripped}=rawResult;
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
        if(gs._preTurnPlayers&&Array.isArray(gs._preTurnStatLogs)&&gs._preTurnStatLogs.length){
          const preTurnQ=bindAnimLogChunks(
            buildAnimQueue({...gs,players:gs._preTurnPlayers,log:[]},{...gs,players:gs._playersBeforeThisDraw||gs.players,log:gs._preTurnStatLogs}),
            {statLogs:gs._preTurnStatLogs}
          );
          queue.push(...preTurnQ);
        }
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
        const fullHandSwapQ=buildFullHandSwapTransferQueueFromLogs(nextLog.slice(oldLog.length),gs.players);
        const actionStatQBase=buildAnimQueue(gs,fakeGs(newGs.players,nextLog));
        const actionStatQ=fullHandSwapQ.length
          ? [...fullHandSwapQ,...actionStatQBase.filter(step=>step.type!=='CARD_TRANSFER')]
          : actionStatQBase;
        if(actionStatQ.length){
          queue.push(...actionStatQ);
        }
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
        queue.push(...huntEventQueue);
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
        const{_aiDrawnCard,_aiName,_playersBeforeNextDraw,_aiHuntEvents,_playersBeforeSkillAction,_preSkillLogs,_preSkillDiscard,_cthRestDraws,_cthRestDrawLogs,_playersBeforeCthDraws,_aiHandLimitDiscards,...stripped}=rawResult;
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
        if(gs._preTurnPlayers&&Array.isArray(gs._preTurnStatLogs)&&gs._preTurnStatLogs.length){
          const preTurnQ=bindAnimLogChunks(
            buildAnimQueue({...gs,players:gs._preTurnPlayers,log:[]},{...gs,players:gs._playersBeforeThisDraw||gs.players,log:gs._preTurnStatLogs}),
            {statLogs:gs._preTurnStatLogs}
          );
          queue.push(...preTurnQ);
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
        const drawInspectionEvents=(gs._inspectionEvents||[]).filter(ev=>ev?.seq>lastInspectionSeqRef.current);
        if(drawInspectionEvents.length){
          lastInspectionSeqRef.current=Math.max(...drawInspectionEvents.map(ev=>ev.seq));
          const inspectionFlow=buildInspectionEventFlow(
            {players:drawInspectionEvents[0]?.beforePlayers||gs.players,log:drawInspectionEvents[0]?.beforeLog||gs.log},
            drawInspectionEvents,
            {buildAnimQueue,copyPlayers}
          );
          queue.push(...inspectionFlow.queue);
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
        const actionStatQBase=buildAnimQueue(gs,fakeGs(P_actionEnd,nextLog));
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
          orderedActionQ=hasFullHandSwap?[...actionStatQ,...huntEventQueue]:huntEventQueue;
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
          const inspectionEvents=(newGs._inspectionEvents||[]).filter(ev=>ev?.seq>(gs._inspectionSeq||0));
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
        // 5. Stat changes from THIS AI's action only (not next draw — those belong to next AI's queue)
        //    Compare gs (after this AI's draw) → _playersBeforeNextDraw (after action, before next draw)
        // 6. Advance to next player's turn
        let nextTurnIntroQueue=[];
        if(isLocalCurrentTurn(newGs)){
          queue.push(...(orderedActionQ||actionStatQ));
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
          queue.push(...(orderedActionQ||actionStatQ));
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
            _preTurnStatLogs:[],
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
    let P = copyPlayers(gs.players), Disc = [...gs.discard], L = [...gs.log];
    losses.forEach(({ idx, lostCount }) => {
      applyHpDamageWithLink(P, idx, 2 * lostCount, Disc, L);
      L.push(`【玫瑰倒刺】${P[idx].name} 失去标记手牌，受到 ${2 * lostCount} HP 伤害`);
    });
    const win = checkWin(P, gs._isMP);
    const newGs = {
      ...gs,
      players: P,
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
  const suppressNextBroadcastRef=useRef(false); // set before bystander-anim pendingGs; cleared in advanceQueue
  const mpCthDecisionTimerRef=useRef(null);
  const turnHighlightLockRef=useRef(null);
  const visualPlayersLockRef=useRef(null);

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
        const zoneCards=me.hand.filter(isZoneCard);
        if(!zoneCards.length)return;
        const rc=zoneCards[0|Math.random()*zoneCards.length];
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
          playerUUIDRef={playerUUIDRef}
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
      _preTurnStatLogs:[],
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
        _preTurnStatLogs:[],
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
    const tHand=P[ti].hand.filter(isZoneCard);
    if(!tHand.length){
      setGs({...gs,players:P,phase:'ACTION',abilityData:{},log:[...gs.log,`${P[ti].name} 手中无区域牌，追捕失败`]});
      return;
    }
    if(gs._isMP){
      // 多人游戏：目标是真人玩家，让目标自己选择亮出哪张牌（20秒超时随机）
      // 暂停房主回合计时器：进入 HUNT_WAIT_REVEAL 子阶段，目标玩家选完后恢复
      const huntWaitGs={...gs,players:P,phase:'HUNT_WAIT_REVEAL',
        abilityData:{...(gs.abilityData||{}),huntTi:ti},
        log:[...gs.log,`你（追猎者）追捕 ${P[ti].name}，等待对方亮出一张区域牌…`]};
      const huntMsgs=extractSkillLogs(huntWaitGs.log.slice(gs.log.length),'hunt');
      triggerAnimQueue([{type:'SKILL_HUNT',targetIdx:ti,msgs:huntMsgs}],huntWaitGs);
      return;
    }
    // 单机/AI目标：由AI策略选择最优亮牌
    const knownHunterCards=P[ti]?.peekMemories?.[0]||[];
    const rc=aiChooseRevealCard(tHand,'你',gs.log,knownHunterCards);
    const huntConfirmGs={...gs,players:P,phase:'HUNT_CONFIRM',
      abilityData:{...(gs.abilityData||{}),huntTi:ti,revCard:rc},
      log:[...gs.log,`你（追猎者）追捕 ${P[ti].name}，${P[ti].name} 亮出 ${cardLogText(rc,{alwaysShowName:true})}`]};
    // 动画位置测量交给 useEffect([anim]) 中的 SKILL_HUNT 分支（使用 data-pid，正确）
    const huntMsgs=extractSkillLogs(huntConfirmGs.log.slice(gs.log.length),'hunt');
    triggerAnimQueue([{type:'SKILL_HUNT',targetIdx:ti,msgs:huntMsgs}],huntConfirmGs);
  }
  function huntConfirm(myCardIdx){
    const{huntTi}=gs.abilityData;
    let P=copyPlayers(gs.players),Disc=[...gs.discard],L=[...gs.log];
    if(myCardIdx>=0){
      const targetHandBefore=[...(P[huntTi]?.hand||[])];
      const targetRevealBefore=!!P[huntTi]?.revealHand;
      const dc=P[0].hand.splice(myCardIdx,1)[0];Disc.push(dc);
      const huntDamage=3+(P[0].damageBonus||0);
      applyHpDamageWithLink(P,huntTi,huntDamage,Disc,L);
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
            const deathGs={...gs,players:P,log:L};
            const queue=buildAnimQueue(gs,deathGs);
            if(queue.length){
              // 动画播放完成后进入选择手牌的阶段
              triggerAnimQueue(queue,{...deathGs,phase:'HUNT_SELECT_CARD_FROM_PUBLIC',abilityData:{huntTi:huntTi,preSkillRevealed:gs.abilityData?.preSkillRevealed,maxToTake:Math.min(maxToTake,handCount)},
                log:[...L,`你（追猎者）从 ${P[huntTi].name} 的公开手牌中任选 ${Math.min(maxToTake,handCount)} 张！`]});
            }else{
              // 没有动画时直接进入选择手牌的阶段
              setGs({...gs,players:P,phase:'HUNT_SELECT_CARD_FROM_PUBLIC',abilityData:{huntTi:huntTi,preSkillRevealed:gs.abilityData?.preSkillRevealed,maxToTake:Math.min(maxToTake,handCount)},
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
      const newGs={...gs,players:P,discard:Disc,log:L,abilityData:{},phase:'ACTION',skillUsed:true,...(win?{gameOver:win}:{})};
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

  // 多人游戏：被追捕的真人玩家选择亮出一张区域牌
  function humanRevealForMPHunt(cardIdx){
    const card=me.hand[cardIdx];
    if(!isZoneCard(card))return;
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

  // Called when player picks their zone card to reveal during an AI hunt
  function playerRevealForHunt(cardIdx){
    const card=me.hand[cardIdx];
    if(!isZoneCard(card))return;
    const{huntingAI,aiHunterName}=gs.abilityData;
    let P=copyPlayers(gs.players),Disc=[...gs.discard],L=[...gs.log];
    let discardedCard=null;
    const myHandBefore=[...(P[0]?.hand||[])];
    const myRevealBefore=!!P[0]?.revealHand;
    L.push(`你亮出 ${cardLogText(card,{alwaysShowName:true})}`);
    const aiHand=P[huntingAI].hand;
    const mi=aiHand.findIndex(c=>cardsHuntMatch(c,card));
    if(mi>=0){
      discardedCard=aiHand.splice(mi,1)[0];Disc.push(discardedCard);
      const huntDamage=3+(P[huntingAI].damageBonus||0);
      applyHpDamageWithLink(P,0,huntDamage,Disc,L);
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

    const baseGs={...gs,players:P,discard:Disc,log:L,abilityData:{},phase:'ACTION', huntAbandoned: newAbandoned};

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
        ((newGs._turnStartLogs?.length||0)>0&&(Array.isArray(newGs._preTurnStatLogs)&&newGs._preTurnStatLogs.length>0))
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
    // 保留abilityData中的cthDrawsRemaining信息
    const newGs={...gs,players:P,discard:Disc,log:L,phase:'ACTION',abilityData:gs.abilityData,
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
    const L=[...gs.log,`你借用 ${deadPlayer.name} 的身份「${deadPlayer.role}」（本回合）`];
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
    let D=[...baseGs.deck],Disc=[...baseGs.discard,...discarded];
    let L=[...baseGs.log,`弃置：${discarded.map(c=>cardLogText(c,{alwaysShowName:true})).join(' ')}`];
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
    const preTurnStatQ=(newGs&&newGs._preTurnPlayers&&Array.isArray(newGs._preTurnStatLogs)&&newGs._preTurnStatLogs.length)
      ? bindAnimLogChunks(
          buildAnimQueue({...gs,players:newGs._preTurnPlayers,log:[]},{...gs,players:newGs._playersBeforeThisDraw||newGs.players,log:newGs._preTurnStatLogs}),
          {statLogs:newGs._preTurnStatLogs}
      )
      : [];
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
        preTurnStatQ.length>0 ||
        drawStatQ.length>0
      )
    ){
      const aiName=newGs.players[newGs.currentTurn]?.name||'???';
      const queue=[];
      if(preTurnStatQ.length) queue.push(...preTurnStatQ);
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
          ...preTurnStatQ,
          ...drawStatQ
        ];
        setGs(prev=>prev?{...prev,phase:'ACTION',drawReveal:null,abilityData:{}}:prev);
        setAnim({type:'YOUR_TURN',msgs:playerTurnStartMsgs});
        revealAnimLogs({type:'YOUR_TURN',msgs:playerTurnStartMsgs});
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
          ...preTurnStatQ,
          ...inspectionAndTailQueue,
        ];
        setGs(prev=>prev?{...prev,phase:'ACTION',drawReveal:null,abilityData:{}}:prev);
        setAnim({type:'YOUR_TURN',msgs:playerTurnStartMsgs});
        revealAnimLogs({type:'YOUR_TURN',msgs:playerTurnStartMsgs});
        return;
      }
      if(playerTurnStartMsgs.length&&newGs.phase==='ACTION'&&(preTurnStatQ.length||drawStatQ.length)){
        pendingGsRef.current=newGs;
        animQueueRef.current=[...preTurnStatQ,...drawStatQ];
        setGs(prev=>prev?{...prev,phase:'ACTION',drawReveal:null,abilityData:{}}:prev);
        setAnim({type:'YOUR_TURN',msgs:playerTurnStartMsgs});
        revealAnimLogs({type:'YOUR_TURN',msgs:playerTurnStartMsgs});
        return;
      }
    }
    if(['FIRST_COME_PICK_SELECT','DAMAGE_LINK_SELECT_TARGET','CAVE_DUEL_SELECT_TARGET','PEEK_HAND_SELECT_TARGET','ROSE_THORN_SELECT_TARGET'].includes(newGs.phase)&&newGs._drawnCard){
      const drawerName=newGs.players[newGs.currentTurn]?.name||'???';
      const drawerPid=newGs.currentTurn;
      pendingGsRef.current=newGs;
      animQueueRef.current=[...preTurnStatQ,...drawStatQ];
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
        animQueueRef.current=[...preTurnStatQ,...inspectionAndTailQueue];
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
      animQueueRef.current=[...preTurnStatQ,...drawStatQ];
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
    let D=[...gs.deck],Disc=[...gs.discard],L=[...gs.log];
    const cthDraws=[];
    if(discarded.length){
      Disc=[...Disc,...discarded];
      L.push(`(超时) 弃置：${discarded.map(c_=>cardLogText(c_,{alwaysShowName:true})).join(' ')}`);
    }
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
    if(pendingGs.drawReveal?.card){
      // Normal draw: YOUR_TURN → card flip → apply state
      const drawStatQ=bindAnimLogChunks(
        buildAnimQueue({...gs,players:pendingGs._playersBeforeThisDraw||gs.players},pendingGs),
        {statLogs:pendingGs._statLogs}
      );
      triggerAnimQueue([
        {type:'YOUR_TURN',msgs:pendingGs._turnStartLogs},
        {type:'DRAW_CARD',card:pendingGs.drawReveal.card,triggerName:'你',msgs:pendingGs._drawLogs},
        ...drawStatQ
      ],pendingGs);
    }else{
      // God card drawn: drawReveal is null, card is in abilityData.godCard
      const godCard=pendingGs.abilityData?.godCard;
      const queue=[{type:'YOUR_TURN',msgs:pendingGs._turnStartLogs}];
      if(godCard) queue.push({type:'DRAW_CARD',card:godCard,triggerName:'你',msgs:pendingGs._drawLogs});
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
  const phaseLabel={
    ACTION:               isLocalCurrentTurn(gs)?'你的回合 — 可发动技能、休息，或结束回合':'等候其他旅者…',
    SWAP_SELECT_TARGET:   '【掉包】选择目标角色',
    SWAP_SELECT_TARGET_CARD: `【掉包】${gs.players[gs.abilityData?.swapTi]?.name}的手牌已公开，请选择要抽取的牌`,
    SWAP_GIVE_CARD:       `${gs.players[gs.abilityData?.swapTi]?.revealHand ? '抽到' : '暗抽到'} ${cardLogText(gs.abilityData?.takenCard)}，选一张手牌还给对方`,
    HUNT_SELECT_TARGET:   '【追捕】选择猎物',
    HUNT_CONFIRM:         isLocalHuntConfirmPhase(gs)?`${cardLogText(gs.abilityData?.revCard,{alwaysShowName:true})} 已亮出！弃出匹配手牌造成3HP，或放弃`:(gs._isMP?'请等待追猎者做出选择…':`${cardLogText(gs.abilityData?.revCard,{alwaysShowName:true})} 已亮出`),
    HUNT_SELECT_CARD_FROM_PUBLIC: `【追捕】从 ${gs.players[gs.abilityData?.huntTi]?.name} 的公开手牌中选择一张`,
    PLAYER_REVEAL_FOR_HUNT:`⚠ ${gs.abilityData?.aiHunterName||'追猎者'} 正在追捕你！请选择一张区域牌亮出`,
    HUNT_WAIT_REVEAL:isLocalCurrentTurn(gs)
      ?`等待 ${gs.players[gs.abilityData?.huntTi??1]?.name||'对方'} 亮出区域牌…`
      :isLocalHuntTargetSeat(gs)
        ?`⚠ 追猎者正在追捕你！请选择一张区域牌亮出（20秒）`
        :`等待 ${gs.players[gs.abilityData?.huntTi??1]?.name||'对方'} 亮出区域牌…`,
    TREASURE_DODGE_DECISION: isLocalTreasureDodgePhase(gs)?'【寻宝者】触发负面区域牌！是否掷骰子规避？':(gs._isMP?`等候 ${gs.players[gs.currentTurn]?.name} 做出选择…`:`${gs.players[gs.currentTurn]?.name} 正在思考…`),
    BEWITCH_SELECT_CARD:  '【蛊惑】选择要赠送的手牌',
    GOD_CHOICE:          isLocalGodChoice?'邪神降临！选择如何回应':(gs._isMP?`等候 ${gs.players[gs.currentTurn]?.name} 回应邪神…`:'邪神降临！选择如何回应'),
    NYA_BORROW:          isLocalNyaBorrowPhase(gs)?'「千人千貌」——借用已死角色的身份？':(gs._isMP?`等候 ${gs.players[gs.currentTurn]?.name} 借用身份…`:'「千人千貌」——借用已死角色的身份？'),
    DISCARD_PHASE:(()=>{const sel=gs.abilityData.discardSelected||[];const need=me.hand.length-effectiveHandLimit;return`手牌超限 (${me.hand.length}/${effectiveHandLimit}) — 需弃 ${need} 张，已选 ${sel.length}/${need}`;})(),
    AI_TURN:gs._isMP?`等候 ${gs.players[gs.currentTurn]?.name} 行动…`:`${gs.players[gs.currentTurn]?.name} 正在行动…`,
    PLAYER_WIN_PENDING:'✦ 你已集齐全部编号！',
    DRAW_REVEAL:         isLocalDrawDecision?'摸牌 — 请确认':(gs._isMP?`等候 ${gs.players[gs.currentTurn]?.name} 摸牌…`:''),
    TREASURE_WIN:         '✦ 你已集齐全部编号！',
    ZONE_SWAP_SELECT_TARGET: `【触底反弹】选择要交换全部手牌的目标`,
    DAMAGE_LINK_SELECT_TARGET:'请选择绳索连接目标',
    CAVE_DUEL_SELECT_TARGET:'请选择“穴居人战争”的目标',
    CAVE_DUEL_SELECT_CARD: `⚠ 和${gs.players[gs.abilityData?.caveDuelSource]?.name||'对手'}来一场穴居人式的对决！尽可能亮出数字编号大的牌取胜，如果落败将失去这张牌`,
    ROSE_THORN_SELECT_TARGET:'【玫瑰倒刺】选择承受倒刺的目标',
    FIRST_COME_PICK_SELECT:`【先到先得】${gs.players[gs.abilityData?.pickOrder?.[gs.abilityData?.pickIndex||0]]?.name||'当前角色'} 请选择一张牌`,
  }[phase]||'';

  const isLocalDamageLinkSelect=!!gs&&isLocalDamageLinkSourcePhase(gs);
  const canLocalTargetSelect=!!gs&&canLocalActOnTargetSelectionPhase(gs);
  const canLocalSwapGive=!!gs&&isLocalSwapGivePhase(gs);
  const canLocalBewitchCard=!!gs&&isLocalBewitchCardPhase(gs);
  const selectingOther=canLocalTargetSelect;
  // 多人游戏中 HUNT_CONFIRM 非追猎者不显示操作按钮区域
  const cancelable=['SWAP_SELECT_TARGET','SWAP_SELECT_TARGET_CARD','SWAP_GIVE_CARD','HUNT_SELECT_TARGET','ZONE_SWAP_SELECT_TARGET','PEEK_HAND_SELECT_TARGET','CAVE_DUEL_SELECT_TARGET','DAMAGE_LINK_SELECT_TARGET','TORTOISE_ORACLE_SELECT','ROSE_THORN_SELECT_TARGET',...(phase==='HUNT_CONFIRM'&&gs._isMP&&!isLocalCurrentTurn(gs)?[]:['HUNT_CONFIRM']),'BEWITCH_SELECT_CARD','BEWITCH_SELECT_TARGET'].includes(phase);
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
    P.forEach((p,i)=>{if(i>0&&p.godName===godKey){const abandoned=abandonGodFollower(i,gs.currentTurn,P,D,Disc,L,inspectionMeta);P=abandoned.P;D=abandoned.D;Disc=abandoned.Disc;L=abandoned.L;inspectionMeta=abandoned.inspectionMeta;}});
    const win=checkWin(P,gs._isMP);
    // Upgrade does not consume the worship slot; worship/convert does
    syncVisibleLog(L);
    setGs({...gs,players:P,deck:D,discard:Disc,log:L,...inspectionMeta,...(!isUpgrade?{godFromHandUsed:true}:{}),...(win?{gameOver:win}:{})});
  }

  function canPlayerRespondWithZoneCard(card){
    if(phase==='PLAYER_REVEAL_FOR_HUNT')return isZoneCard(card);
    if(phase==='HUNT_WAIT_REVEAL'&&!myTurn&&isLocalHuntTargetSeat(gs))return isZoneCard(card);
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
  const canShowTurnDecisionModal=!anim&&!animExiting&&animQueueRef.current.length===0;

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
          <div ref={selfPanelRef} data-pid={0} style={{
            background:'#180f07',
            border:`1.5px solid ${hitIndices.includes(0)?'#cc2222':sanHitIndices.includes(0)?'#8840cc':suppressAnim&&tutorialStep>=2&&tutorialStep<=4?'#c8a96e':'#3a2510'}`,
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
            boxShadow:suppressAnim&&tutorialStep>=2&&tutorialStep<=4?'0 0 0 2px #c8a96e66,0 0 20px #c8a96e44':undefined,
            opacity:guillotinedPids.has(0)?0:1
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
          <PileDisplay deckCount={gs.deck.length} discardCount={visualDiscard.length} discardTop={visualDiscard[visualDiscard.length-1]||null} inspectionCount={gs.inspectionDeck.length+(gs.houndsOfTindalosActive?0:0)} compact={vw<430} baseHeight={middleRowHeight} deckRef={deckAreaRef} discardRef={discardPileRef} scaleRatio={scaleRatio}/>
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
          return ReactDOM.createPortal(
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
              {phase==='DISCARD_PHASE'?`⚠ 手牌超限 (${visualMe.hand.length}/${effectiveHandLimit})`:phase==='PLAYER_REVEAL_FOR_HUNT'?'⚠ 选择亮出一张区域牌':phase==='HUNT_WAIT_REVEAL'&&!myTurn&&isLocalHuntTargetSeat(gs)?'⚠ 选择亮出一张区域牌':`手牌 (${visualMe.hand.length}/${effectiveHandLimit})`}
            </span>
            {(phase==='ACTION'&&isVisualPlayerTurn&&!isBlocked||cancelable)&&(
              <div style={{display:'flex',gap:8,marginLeft:'auto',flexWrap:'wrap',position:'relative',zIndex:200}}>
                {phase==='ACTION'&&isVisualPlayerTurn&&!isBlocked&&(()=>{
                  // 对于其他职业，只要技能或休息中的任意一个被使用，那么两者都不能再使用
                  // 对于追猎者，只要休息被使用，就不能再使用技能；只要技能被使用，就不能再休息，但技能可以多次使用
                  const skillRole=gs.globalOnlySwapOwner!=null?'寻宝者':me.role;
                  const isHunter = skillRole === '追猎者';
                  const restLimited = gs.restUsed || (isHunter ? gs.skillUsed : gs.skillUsed);
                  const skillRestLimited = isHunter ? gs.restUsed : (skillLimited || gs.restUsed || gs.skillUsed);
                  return(<>
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
              const isMatch=phase==='HUNT_CONFIRM'&&gs.abilityData?.revCard&&(c.letter===gs.abilityData.revCard.letter||c.number===gs.abilityData.revCard.number);
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
      {/* ── Tutorial steps 2 & 3 (shown over game interface) ── */}
      {/* ── Win Animations ── */}
      {ReactDOM.createPortal(
        <>
          {!showTutorial&&<HoundsTimerBadge active={!!gs?.houndsOfTindalosActive} secondsLeft={houndsSecLeft}/>}
          {showTutorial&&tutorialStep===2&&(()=>{
        const TW=Math.min(260,vw-20);
        const px=Math.max(8,Math.min(panelRect?panelRect.right+14:175,vw-TW-8));
        const py=panelRect?panelRect.top+(panelRect.height/2):260;
        const arrowTop=panelRect?Math.max(16,Math.min(panelRect.height/2,60)):40;
        const ptop=panelRect?panelRect.top:0;
        const pbottom=panelRect?panelRect.bottom:0;
        const pleft=panelRect?panelRect.left:0;
        const pright=panelRect?panelRect.right:vw;
        const BG='rgba(0,0,0,0.58)';
        const W=vw;
        return(
          <div style={{position:'fixed',inset:0,zIndex:900,pointerEvents:'none'}}>
            {/* Four-strip backdrop — leaves self panel undarken */}
            <div style={{position:'absolute',left:0,top:0,right:0,height:ptop,background:BG,pointerEvents:'none'}}/>
            <div style={{position:'absolute',left:0,top:ptop,bottom:0,width:pleft,background:BG,pointerEvents:'none'}}/>
            <div style={{position:'absolute',right:0,top:ptop,bottom:0,left:pright,background:BG,pointerEvents:'none'}}/>
            <div style={{position:'absolute',left:pleft,right:W-pright,top:pbottom,bottom:0,background:BG,pointerEvents:'none'}}/>
            {/* Tooltip popup */}
            <div style={{
              position:'absolute',
              left:px,
              top:Math.max(8,py-90),
              width:TW,pointerEvents:'auto',
              background:'#120d06',border:'1.5px solid #7a5020',borderRadius:4,
              padding:'18px 20px',
              boxShadow:'0 0 40px #7a502066',
              animation:'animPop 0.25s ease-out',
              zIndex:901,
            }}>
              {/* Arrow pointing left */}
              <div style={{position:'absolute',left:-9,top:arrowTop,width:0,height:0,borderTop:'8px solid transparent',borderBottom:'8px solid transparent',borderRight:'9px solid #7a5020'}}/>
              <div style={{position:'absolute',left:-7,top:arrowTop+1,width:0,height:0,borderTop:'7px solid transparent',borderBottom:'7px solid transparent',borderRight:'8px solid #120d06'}}/>
              <div style={{display:'flex',gap:10,alignItems:'flex-start'}}><NarratorAvatar tooltipW={Math.min(280,vw-20)}/><div style={{flex:1,minWidth:0}}><p style={{color:'#c8a96e',fontSize:12,lineHeight:1.85,fontStyle:'italic',marginBottom:10,fontFamily:"'IM Fell English','Georgia',serif",opacity:0.9}}>
                这么说吧，你此行的目标是一个危险的遗迹，遗迹里有着…很可怕的东西。
              </p>
              <p style={{color:'#c8a96e',fontSize:12,lineHeight:1.85,fontStyle:'italic',marginBottom:18,fontFamily:"'IM Fell English','Georgia',serif",opacity:0.9}}>
                这里会显示你的当前状态，当<span style={{color:'#e05050',fontStyle:'normal',fontWeight:700,textShadow:'0 0 8px #cc222288'}}>HP</span>归零，你就会倒下。
              </p>
              <button
                onClick={()=>setTutorialStep(3)}
                style={{width:'100%',padding:'8px',background:'#1c1008',border:'1.5px solid #c8a96e',color:'#e8c87a',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:11,borderRadius:2,cursor:'pointer',letterSpacing:1.5,textTransform:'uppercase',boxShadow:'0 0 12px #c8a96e33',transition:'all .2s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='#2a1a08';}}
                onMouseLeave={e=>{e.currentTarget.style.background='#1c1008';}}
              >
                下一步 →
              </button>
            </div></div>
            </div>
          </div>
        );
      })()}
      {showTutorial&&tutorialStep===3&&(()=>{
        const TW=Math.min(260,vw-20);
        const px=Math.max(8,Math.min(panelRect?panelRect.right+14:175,vw-TW-8));
        const py=panelRect?panelRect.top+(panelRect.height/2):260;
        const arrowTop=panelRect?Math.max(16,Math.min(panelRect.height/2,60)):40;
        const ptop=panelRect?panelRect.top:0;
        const pbottom=panelRect?panelRect.bottom:0;
        const pleft=panelRect?panelRect.left:0;
        const pright=panelRect?panelRect.right:vw;
        const BG='rgba(0,0,0,0.58)';
        const W=vw;
        return(
          <div style={{position:'fixed',inset:0,zIndex:900,pointerEvents:'none'}}>
            {/* Four-strip backdrop — leaves self panel undarken */}
            <div style={{position:'absolute',left:0,top:0,right:0,height:ptop,background:BG,pointerEvents:'none'}}/>
            <div style={{position:'absolute',left:0,top:ptop,bottom:0,width:pleft,background:BG,pointerEvents:'none'}}/>
            <div style={{position:'absolute',right:0,top:ptop,bottom:0,left:pright,background:BG,pointerEvents:'none'}}/>
            <div style={{position:'absolute',left:pleft,right:W-pright,top:pbottom,bottom:0,background:BG,pointerEvents:'none'}}/>
            <div style={{
              position:'absolute',
              left:px,
              top:Math.max(8,py-90),
              width:TW,pointerEvents:'auto',
              background:'#120d06',border:'1.5px solid #7a5020',borderRadius:4,
              padding:'18px 20px',
              boxShadow:'0 0 40px #7a502066',
              animation:'animPop 0.25s ease-out',
              zIndex:901,
            }}>
              <div style={{position:'absolute',left:-9,top:arrowTop,width:0,height:0,borderTop:'8px solid transparent',borderBottom:'8px solid transparent',borderRight:'9px solid #7a5020'}}/>
              <div style={{position:'absolute',left:-7,top:arrowTop+1,width:0,height:0,borderTop:'7px solid transparent',borderBottom:'7px solid transparent',borderRight:'8px solid #120d06'}}/>
              <div style={{display:'flex',gap:10,alignItems:'flex-start'}}><NarratorAvatar tooltipW={Math.min(280,vw-20)}/><div style={{flex:1,minWidth:0}}><p style={{color:'#c8a96e',fontSize:12,lineHeight:1.85,fontStyle:'italic',marginBottom:18,fontFamily:"'IM Fell English','Georgia',serif",opacity:0.9}}>
                <span style={{color:'#e05050',fontStyle:'normal',fontWeight:700,textShadow:'0 0 8px #cc222288'}}>HP</span>下方是你的<span style={{color:'#a78bfa',fontStyle:'normal',fontWeight:700,textShadow:'0 0 8px #8844cc88'}}>SAN</span>值，象征心智。
              </p>
              <button
                onClick={()=>setTutorialStep(4)}
                style={{width:'100%',padding:'8px',background:'#1c1008',border:'1.5px solid #c8a96e',color:'#e8c87a',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:11,borderRadius:2,cursor:'pointer',letterSpacing:1.5,textTransform:'uppercase',boxShadow:'0 0 12px #c8a96e33',transition:'all .2s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='#2a1a08';}}
                onMouseLeave={e=>{e.currentTarget.style.background='#1c1008';}}
              >
                下一步 →
              </button>
            </div></div>
            </div>
          </div>
        );
      })()}
      {showTutorial&&tutorialStep===4&&(()=>{
        const TW=Math.min(260,vw-20);
        const px=Math.max(8,Math.min(panelRect?panelRect.right+14:175,vw-TW-8));
        const py=panelRect?panelRect.top+(panelRect.height/2):260;
        const arrowTop=panelRect?Math.max(16,Math.min(panelRect.height/2,60)):40;
        const ptop=panelRect?panelRect.top:0;
        const pbottom=panelRect?panelRect.bottom:0;
        const pleft=panelRect?panelRect.left:0;
        const pright=panelRect?panelRect.right:vw;
        const BG='rgba(0,0,0,0.58)';
        const W=vw;
        return(
          <div style={{position:'fixed',inset:0,zIndex:900,pointerEvents:'none'}}>
            {/* Four-strip backdrop — leaves self panel undarken */}
            <div style={{position:'absolute',left:0,top:0,right:0,height:ptop,background:BG,pointerEvents:'none'}}/>
            <div style={{position:'absolute',left:0,top:ptop,bottom:0,width:pleft,background:BG,pointerEvents:'none'}}/>
            <div style={{position:'absolute',right:0,top:ptop,bottom:0,left:pright,background:BG,pointerEvents:'none'}}/>
            <div style={{position:'absolute',left:pleft,right:W-pright,top:pbottom,bottom:0,background:BG,pointerEvents:'none'}}/>
            <div style={{
              position:'absolute',
              left:px,
              top:Math.max(8,py-90),
              width:TW,pointerEvents:'auto',
              background:'#120d06',border:'1.5px solid #7a5020',borderRadius:4,
              padding:'18px 20px',
              boxShadow:'0 0 40px #7a502066',
              animation:'animPop 0.25s ease-out',
              zIndex:901,
            }}>
              <div style={{position:'absolute',left:-9,top:arrowTop,width:0,height:0,borderTop:'8px solid transparent',borderBottom:'8px solid transparent',borderRight:'9px solid #7a5020'}}/>
              <div style={{position:'absolute',left:-7,top:arrowTop+1,width:0,height:0,borderTop:'7px solid transparent',borderBottom:'7px solid transparent',borderRight:'8px solid #120d06'}}/>
              <div style={{display:'flex',gap:10,alignItems:'flex-start'}}><NarratorAvatar tooltipW={Math.min(280,vw-20)}/><div style={{flex:1,minWidth:0}}><p style={{color:'#c8a96e',fontSize:12,lineHeight:1.85,fontStyle:'italic',marginBottom:10,fontFamily:"'IM Fell English','Georgia',serif",opacity:0.9}}>
                当一个人完全丧失心智，被遗迹里那些邪祟占据身体，所有人都会大祸临头！
              </p>
              <p style={{color:'#c8a96e',fontSize:12,lineHeight:1.85,fontStyle:'italic',marginBottom:18,fontFamily:"'IM Fell English','Georgia',serif",opacity:0.9}}>
                哦，不过<span style={{color:'#9060cc',fontStyle:'normal',fontWeight:700,textShadow:'0 0 8px #7040aa88'}}>邪祀者</span>可能会挺高兴…
              </p>
              <button
                onClick={()=>setTutorialStep(5)}
                style={{width:'100%',padding:'8px',background:'#1c1008',border:'1.5px solid #c8a96e',color:'#e8c87a',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:11,borderRadius:2,cursor:'pointer',letterSpacing:1.5,textTransform:'uppercase',boxShadow:'0 0 12px #c8a96e33',transition:'all .2s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='#2a1a08';}}
                onMouseLeave={e=>{e.currentTarget.style.background='#1c1008';}}
              >
                下一步 →
              </button>
            </div></div>
            </div>
          </div>
        );
      })()}
      {showTutorial&&tutorialStep===5&&(()=>{
        const TW=Math.min(260,vw-20);
        const rx=Math.max(8,Math.min(roleTextRect?roleTextRect.right+14:175,vw-TW-8));
        const ry=roleTextRect?roleTextRect.top+(roleTextRect.height/2):120;
        const arrowTop=12;
        return(
          <div style={{position:'fixed',inset:0,zIndex:900,pointerEvents:'none'}}>
            <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.58)',pointerEvents:'none'}}/>
            <div style={{
              position:'absolute',
              left:rx,
              top:Math.max(8,ry-20),
              width:TW,pointerEvents:'auto',
              background:'#120d06',border:'1.5px solid #7a5020',borderRadius:4,
              padding:'18px 20px',
              boxShadow:'0 0 40px #7a502066',
              animation:'animPop 0.25s ease-out',
              zIndex:901,
            }}>
              <div style={{position:'absolute',left:-9,top:arrowTop,width:0,height:0,borderTop:'8px solid transparent',borderBottom:'8px solid transparent',borderRight:'9px solid #7a5020'}}/>
              <div style={{position:'absolute',left:-7,top:arrowTop+1,width:0,height:0,borderTop:'7px solid transparent',borderBottom:'7px solid transparent',borderRight:'8px solid #120d06'}}/>
              <div style={{display:'flex',gap:10,alignItems:'flex-start'}}><NarratorAvatar tooltipW={Math.min(280,vw-20)}/><div style={{flex:1,minWidth:0}}><p style={{color:'#c8a96e',fontSize:12,lineHeight:1.85,fontStyle:'italic',marginBottom:10,fontFamily:"'IM Fell English','Georgia',serif",opacity:0.9}}>
                说到<span style={{color:'#9060cc',fontStyle:'normal',fontWeight:700,textShadow:'0 0 8px #7040aa88'}}>邪祀者</span>，你知道你这次的<span style={{color:'#e8c87a',fontStyle:'normal',fontWeight:700}}>身份</span>吗？
              </p>
              <p style={{color:'#c8a96e',fontSize:12,lineHeight:1.85,fontStyle:'italic',marginBottom:18,fontFamily:"'IM Fell English','Georgia',serif",opacity:0.9}}>
                每次探索中你的<span style={{color:'#e8c87a',fontStyle:'normal',fontWeight:700}}>身份</span>都有可能不一样。不知道的话，你可要记好了：
              </p>
              <button
                onClick={()=>setTutorialStep(6)}
                style={{width:'100%',padding:'8px',background:'#1c1008',border:'1.5px solid #c8a96e',color:'#e8c87a',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:11,borderRadius:2,cursor:'pointer',letterSpacing:1.5,textTransform:'uppercase',boxShadow:'0 0 12px #c8a96e33',transition:'all .2s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='#2a1a08';}}
                onMouseLeave={e=>{e.currentTarget.style.background='#1c1008';}}
              >
                下一步 →
              </button>
            </div></div>
            </div>
          </div>
        );
      })()}
      {showTutorial&&tutorialStep===6&&(()=>{
        return(
          <div style={{position:'fixed',inset:0,zIndex:900,pointerEvents:'none',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.58)',pointerEvents:'none'}}/>
            <div style={{
              position:'relative',zIndex:901,
              width:Math.min(280,vw-20),pointerEvents:'auto',
              background:'#120d06',border:'1.5px solid #7a5020',borderRadius:4,
              padding:'18px 20px',
              boxShadow:'0 0 40px #7a502066',
              animation:'animPop 0.25s ease-out',
            }}>
              <div style={{display:'flex',gap:10,alignItems:'flex-start'}}><NarratorAvatar tooltipW={Math.min(280,vw-20)}/><div style={{flex:1,minWidth:0}}><p style={{color:'#c8a96e',fontSize:12,lineHeight:1.85,fontStyle:'italic',marginBottom:10,fontFamily:"'IM Fell English','Georgia',serif",opacity:0.9}}>
                首先是<span style={{color:'#c8a96e',fontStyle:'normal',fontWeight:700,textShadow:'0 0 8px #c8a96e88'}}>寻宝者</span>。他们贪婪、无惧危险，进入遗迹只为独占<span style={{color:'#e8c87a',fontStyle:'normal',fontWeight:700}}>宝藏</span>。他们不会跟任何人合作，包括其他<span style={{color:'#c8a96e',fontStyle:'normal',fontWeight:700,textShadow:'0 0 8px #c8a96e88'}}>寻宝者</span>。
              </p>
              <p style={{color:'#c8a96e',fontSize:12,lineHeight:1.85,fontStyle:'italic',marginBottom:18,fontFamily:"'IM Fell English','Georgia',serif",opacity:0.9}}>
                至于他们大闹一通后，邪恶的古神会不会第二天就复活？他们才不管。
              </p>
              <button
                onClick={()=>setTutorialStep(7)}
                style={{width:'100%',padding:'8px',background:'#1c1008',border:'1.5px solid #c8a96e',color:'#e8c87a',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:11,borderRadius:2,cursor:'pointer',letterSpacing:1.5,textTransform:'uppercase',boxShadow:'0 0 12px #c8a96e33',transition:'all .2s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='#2a1a08';}}
                onMouseLeave={e=>{e.currentTarget.style.background='#1c1008';}}
              >
                下一步 →
              </button>
            </div></div>
            </div>
          </div>
        );
      })()}
      {showTutorial&&tutorialStep===7&&(()=>{
        // Position tooltip above hand area, centered horizontally over it, arrow pointing down
        const TOOLTIP_W=Math.min(265,vw-20);
        const hcx=handAreaRect?handAreaRect.left+(handAreaRect.width/2):200;
        const hty=handAreaRect?handAreaRect.top:400;
        const hbottom=handAreaRect?handAreaRect.bottom:500;
        const hleft=handAreaRect?handAreaRect.left:0;
        const hright=handAreaRect?handAreaRect.right:window.innerWidth;
        const tooltipLeft=Math.max(8,Math.min(hcx-TOOLTIP_W/2, window.innerWidth-TOOLTIP_W-8));
        const tooltipBottom=window.innerHeight-hty+14;
        const arrowLeft=Math.max(16,Math.min(hcx-tooltipLeft-8, TOOLTIP_W-24));
        const BG='rgba(0,0,0,0.58)';
        const W=window.innerWidth, H=window.innerHeight;
        return(
          <div style={{position:'fixed',inset:0,zIndex:900,pointerEvents:'none'}}>
            {/* Four-strip backdrop — leaves hand cards area undarken, covers button row */}
            <div style={{position:'absolute',left:0,top:0,right:0,height:hty,background:BG,pointerEvents:'none'}}/>
            <div style={{position:'absolute',left:0,top:hty,bottom:0,width:hleft,background:BG,pointerEvents:'none'}}/>
            <div style={{position:'absolute',right:0,top:hty,bottom:0,left:hright,background:BG,pointerEvents:'none'}}/>
            <div style={{position:'absolute',left:hleft,right:W-hright,top:hbottom,bottom:0,background:BG,pointerEvents:'none'}}/>
            <div style={{
              position:'fixed',
              left:tooltipLeft,
              bottom:tooltipBottom,
              width:TOOLTIP_W,pointerEvents:'auto',
              background:'#120d06',border:'1.5px solid #7a5020',borderRadius:4,
              padding:'18px 20px',
              boxShadow:'0 0 40px #7a502066',
              animation:'animPop 0.25s ease-out',
              zIndex:901,
            }}>
              {/* Arrow pointing down */}
              <div style={{position:'absolute',bottom:-9,left:arrowLeft,width:0,height:0,borderLeft:'8px solid transparent',borderRight:'8px solid transparent',borderTop:'9px solid #7a5020'}}/>
              <div style={{position:'absolute',bottom:-7,left:arrowLeft+1,width:0,height:0,borderLeft:'7px solid transparent',borderRight:'7px solid transparent',borderTop:'8px solid #120d06'}}/>
              <div style={{display:'flex',gap:10,alignItems:'flex-start'}}><NarratorAvatar tooltipW={Math.min(280,vw-20)}/><div style={{flex:1,minWidth:0}}><p style={{color:'#c8a96e',fontSize:12,lineHeight:1.85,fontStyle:'italic',marginBottom:10,fontFamily:"'IM Fell English','Georgia',serif",opacity:0.9}}>
                你问我如何寻得<span style={{color:'#e8c87a',fontStyle:'normal',fontWeight:700}}>宝藏</span>？翻遍所有地方，就这么简单。
              </p>
              <p style={{color:'#c8a96e',fontSize:12,lineHeight:1.85,fontStyle:'italic',marginBottom:18,fontFamily:"'IM Fell English','Georgia',serif",opacity:0.9}}>
                先驱在遗迹地图上标记了ABCD四列、1234四行。如果你是<span style={{color:'#c8a96e',fontStyle:'normal',fontWeight:700,textShadow:'0 0 8px #c8a96e88'}}>寻宝者</span>，手牌中有<span style={{color:'#e8c87a',fontStyle:'normal',fontWeight:700}}>所有列和所有行</span>的编号，你就赢了。
              </p>
              <button
                onClick={()=>setTutorialStep(8)}
                style={{width:'100%',padding:'8px',background:'#1c1008',border:'1.5px solid #c8a96e',color:'#e8c87a',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:11,borderRadius:2,cursor:'pointer',letterSpacing:1.5,textTransform:'uppercase',boxShadow:'0 0 12px #c8a96e33',transition:'all .2s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='#2a1a08';}}
                onMouseLeave={e=>{e.currentTarget.style.background='#1c1008';}}
              >
                下一步 →
              </button>
            </div></div>
            </div>
          </div>
        );
      })()}
      {/* ── Step 8: 追猎者 description (centered modal, no arrow) ── */}
      {showTutorial&&tutorialStep===8&&(()=>{
        return(
          <div style={{position:'fixed',inset:0,zIndex:900,pointerEvents:'none',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.58)',pointerEvents:'none'}}/>
            <div style={{
              position:'relative',zIndex:901,
              width:Math.min(280,vw-20),pointerEvents:'auto',
              background:'#120d06',border:'1.5px solid #7a5020',borderRadius:4,
              padding:'18px 20px',
              boxShadow:'0 0 40px #7a502066',
              animation:'animPop 0.25s ease-out',
            }}>
              <div style={{display:'flex',gap:10,alignItems:'flex-start'}}><NarratorAvatar tooltipW={Math.min(280,vw-20)}/><div style={{flex:1,minWidth:0}}><p style={{color:'#c8a96e',fontSize:12,lineHeight:1.85,fontStyle:'italic',marginBottom:10,fontFamily:"'IM Fell English','Georgia',serif",opacity:0.9}}>
                接着是<span style={{color:'#dd6a30',fontStyle:'normal',fontWeight:700,textShadow:'0 0 8px #cc440088'}}>追猎者</span>，他们<span style={{color:'#e8c87a',fontStyle:'normal',fontWeight:700}}>团结一心</span>，是遗迹的卫士。
              </p>
              <p style={{color:'#c8a96e',fontSize:12,lineHeight:1.85,fontStyle:'italic',marginBottom:18,fontFamily:"'IM Fell English','Georgia',serif",opacity:0.9}}>
                所有闯入者，都是他们的敌人，是可能复活邪神的潜在威胁。
              </p>
              <button
                onClick={()=>setTutorialStep(9)}
                style={{width:'100%',padding:'8px',background:'#1c1008',border:'1.5px solid #c8a96e',color:'#e8c87a',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:11,borderRadius:2,cursor:'pointer',letterSpacing:1.5,textTransform:'uppercase',boxShadow:'0 0 12px #c8a96e33',transition:'all .2s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='#2a1a08';}}
                onMouseLeave={e=>{e.currentTarget.style.background='#1c1008';}}
              >
                下一步 →
              </button>
            </div></div>
            </div>
          </div>
        );
      })()}
      {/* ── Step 9: 追猎者 win condition, tooltip pointing UP at AI panels area ── */}
      {showTutorial&&tutorialStep===9&&(()=>{
        const TOOLTIP_W=Math.min(265,vw-20);
        const aty =aiPanelAreaRect?aiPanelAreaRect.top:0;
        const abottom=aiPanelAreaRect?aiPanelAreaRect.bottom:120;
        const aleft =aiPanelAreaRect?aiPanelAreaRect.left:0;
        const aright=aiPanelAreaRect?aiPanelAreaRect.right:vw;
        const acx   =aleft+(aright-aleft)/2;
        const tooltipLeft=Math.max(8,Math.min(acx-TOOLTIP_W/2,vw-TOOLTIP_W-8));
        const tooltipTop =abottom+14;
        const arrowLeft  =Math.max(16,Math.min(acx-tooltipLeft-8,TOOLTIP_W-24));
        const BG='rgba(0,0,0,0.58)';
        const W=vw;
        return(
          <div style={{position:'fixed',inset:0,zIndex:900,pointerEvents:'none'}}>
            {/* Four-strip backdrop — leaves AI panels area undarken */}
            {aty>0&&<div style={{position:'absolute',left:0,top:0,right:0,height:aty,background:BG}}/>}
            <div style={{position:'absolute',left:0,top:aty,bottom:0,width:aleft,background:BG}}/>
            <div style={{position:'absolute',left:aright,top:aty,right:0,bottom:0,background:BG}}/>
            <div style={{position:'absolute',left:aleft,right:W-aright,top:abottom,bottom:0,background:BG}}/>
            <div style={{
              position:'fixed',
              left:tooltipLeft,
              top:tooltipTop,
              width:TOOLTIP_W,pointerEvents:'auto',
              background:'#120d06',border:'1.5px solid #7a5020',borderRadius:4,
              padding:'18px 20px',
              boxShadow:'0 0 40px #7a502066',
              animation:'animPop 0.25s ease-out',
              zIndex:901,
            }}>
              {/* Arrow pointing UP */}
              <div style={{position:'absolute',top:-9,left:arrowLeft,width:0,height:0,borderLeft:'8px solid transparent',borderRight:'8px solid transparent',borderBottom:'9px solid #7a5020'}}/>
              <div style={{position:'absolute',top:-7,left:arrowLeft+1,width:0,height:0,borderLeft:'7px solid transparent',borderRight:'7px solid transparent',borderBottom:'8px solid #120d06'}}/>
              <div style={{display:'flex',gap:10,alignItems:'flex-start'}}><NarratorAvatar tooltipW={Math.min(280,vw-20)}/><div style={{flex:1,minWidth:0}}><p style={{color:'#c8a96e',fontSize:12,lineHeight:1.85,fontStyle:'italic',marginBottom:18,fontFamily:"'IM Fell English','Georgia',serif",opacity:0.9}}>
                如果你是<span style={{color:'#dd6a30',fontStyle:'normal',fontWeight:700,textShadow:'0 0 8px #cc440088'}}>追猎者</span>，你要肃清所有非<span style={{color:'#dd6a30',fontStyle:'normal',fontWeight:700,textShadow:'0 0 8px #cc440088'}}>追猎者</span>角色，将他们的<span style={{color:'#e05050',fontStyle:'normal',fontWeight:700,textShadow:'0 0 8px #cc222288'}}>HP</span>全部清零，就能获胜。
              </p>
              <button
                onClick={()=>setTutorialStep(10)}
                style={{width:'100%',padding:'8px',background:'#1c1008',border:'1.5px solid #c8a96e',color:'#e8c87a',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:11,borderRadius:2,cursor:'pointer',letterSpacing:1.5,textTransform:'uppercase',boxShadow:'0 0 12px #c8a96e33',transition:'all .2s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='#2a1a08';}}
                onMouseLeave={e=>{e.currentTarget.style.background='#1c1008';}}
              >
                下一步 →
              </button>
            </div></div>
            </div>
          </div>
        );
      })()}
      {/* ── Step 10: 邪祀者 description (centered modal, no arrow) ── */}
      {showTutorial&&tutorialStep===10&&(()=>{
        return(
          <div style={{position:'fixed',inset:0,zIndex:900,pointerEvents:'none',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.58)',pointerEvents:'none'}}/>
            <div style={{
              position:'relative',zIndex:901,
              width:Math.min(280,vw-20),pointerEvents:'auto',
              background:'#120d06',border:'1.5px solid #7a5020',borderRadius:4,
              padding:'18px 20px',
              boxShadow:'0 0 40px #7a502066',
              animation:'animPop 0.25s ease-out',
            }}>
              <div style={{display:'flex',gap:10,alignItems:'flex-start'}}><NarratorAvatar tooltipW={Math.min(280,vw-20)}/><div style={{flex:1,minWidth:0}}><p style={{color:'#c8a96e',fontSize:12,lineHeight:1.85,fontStyle:'italic',marginBottom:18,fontFamily:"'IM Fell English','Georgia',serif",opacity:0.9}}>
                最后是<span style={{color:'#9060cc',fontStyle:'normal',fontWeight:700,textShadow:'0 0 8px #7040aa88'}}>邪祀者</span>，他们一心复活邪神，基于利害关系相互合作，精于算计他人。
              </p>
              <button
                onClick={()=>setTutorialStep(11)}
                style={{width:'100%',padding:'8px',background:'#1c1008',border:'1.5px solid #c8a96e',color:'#e8c87a',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:11,borderRadius:2,cursor:'pointer',letterSpacing:1.5,textTransform:'uppercase',boxShadow:'0 0 12px #c8a96e33',transition:'all .2s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='#2a1a08';}}
                onMouseLeave={e=>{e.currentTarget.style.background='#1c1008';}}
              >
                下一步 →
              </button>
            </div></div>
            </div>
          </div>
        );
      })()}
      {/* ── Step 11: 邪祀者 win condition, four-strip spotlight on AI panels ── */}
      {showTutorial&&tutorialStep===11&&(()=>{
        const TOOLTIP_W=Math.min(265,vw-20);
        const aty    =aiPanelAreaRect?aiPanelAreaRect.top:0;
        const abottom=aiPanelAreaRect?aiPanelAreaRect.bottom:120;
        const aleft  =aiPanelAreaRect?aiPanelAreaRect.left:0;
        const aright =aiPanelAreaRect?aiPanelAreaRect.right:vw;
        const acx    =aleft+(aright-aleft)/2;
        const tooltipLeft=Math.max(8,Math.min(acx-TOOLTIP_W/2,vw-TOOLTIP_W-8));
        const tooltipTop =abottom+14;
        const arrowLeft  =Math.max(16,Math.min(acx-tooltipLeft-8,TOOLTIP_W-24));
        const BG='rgba(0,0,0,0.58)';
        const W=vw;
        return(
          <div style={{position:'fixed',inset:0,zIndex:900,pointerEvents:'none'}}>
            {/* Four-strip backdrop — leaves AI panels area undarken */}
            {aty>0&&<div style={{position:'absolute',left:0,top:0,right:0,height:aty,background:BG}}/>}
            <div style={{position:'absolute',left:0,top:aty,bottom:0,width:aleft,background:BG}}/>
            <div style={{position:'absolute',left:aright,top:aty,right:0,bottom:0,background:BG}}/>
            <div style={{position:'absolute',left:aleft,right:W-aright,top:abottom,bottom:0,background:BG}}/>
            <div style={{
              position:'fixed',
              left:tooltipLeft,
              top:tooltipTop,
              width:TOOLTIP_W,pointerEvents:'auto',
              background:'#120d06',border:'1.5px solid #7a5020',borderRadius:4,
              padding:'18px 20px',
              boxShadow:'0 0 40px #7a502066',
              animation:'animPop 0.25s ease-out',
              zIndex:901,
            }}>
              {/* Arrow pointing UP */}
              <div style={{position:'absolute',top:-9,left:arrowLeft,width:0,height:0,borderLeft:'8px solid transparent',borderRight:'8px solid transparent',borderBottom:'9px solid #7a5020'}}/>
              <div style={{position:'absolute',top:-7,left:arrowLeft+1,width:0,height:0,borderLeft:'7px solid transparent',borderRight:'7px solid transparent',borderBottom:'8px solid #120d06'}}/>
              <div style={{display:'flex',gap:10,alignItems:'flex-start'}}><NarratorAvatar tooltipW={Math.min(280,vw-20)}/><div style={{flex:1,minWidth:0}}><p style={{color:'#c8a96e',fontSize:12,lineHeight:1.85,fontStyle:'italic',marginBottom:10,fontFamily:"'IM Fell English','Georgia',serif",opacity:0.9}}>
                如果你是<span style={{color:'#9060cc',fontStyle:'normal',fontWeight:700,textShadow:'0 0 8px #7040aa88'}}>邪祀者</span>，你要专注于腐化一名角色的心智。当他<span style={{color:'#a78bfa',fontStyle:'normal',fontWeight:700,textShadow:'0 0 8px #8844cc88'}}>SAN</span>值清零，被邪神占据身体，你就赢了。
              </p>
              <p style={{color:'#c8a96e',fontSize:12,lineHeight:1.85,fontStyle:'italic',marginBottom:18,fontFamily:"'IM Fell English','Georgia',serif",opacity:0.9}}>
                当然，如果你准备自己丧失心智，成为邪神的宿主…那也未尝不可。
              </p>
              <button
                onClick={()=>setTutorialStep(12)}
                style={{width:'100%',padding:'8px',background:'#1c1008',border:'1.5px solid #c8a96e',color:'#e8c87a',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:11,borderRadius:2,cursor:'pointer',letterSpacing:1.5,textTransform:'uppercase',boxShadow:'0 0 12px #c8a96e33',transition:'all .2s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='#2a1a08';}}
                onMouseLeave={e=>{e.currentTarget.style.background='#1c1008';}}
              >
                下一步 →
              </button>
            </div></div>
            </div>
          </div>
        );
      })()}
      {showTutorial&&tutorialStep===12&&(()=>{
        const TOOLTIP_W=Math.min(265,vw-20);
        const pty    =deckAreaRect?deckAreaRect.top:0;
        const pbottom=deckAreaRect?deckAreaRect.bottom:200;
        const pleft  =deckAreaRect?deckAreaRect.left:0;
        const pright =deckAreaRect?deckAreaRect.right:vw;
        const pcx    =pleft+(pright-pleft)/2;
        const tooltipLeft=Math.max(8,Math.min(pcx-TOOLTIP_W/2,vw-TOOLTIP_W-8));
        const tooltipTop =pbottom+14;
        const arrowLeft  =Math.max(16,Math.min(pcx-tooltipLeft-8,TOOLTIP_W-24));
        const BG='rgba(0,0,0,0.58)';
        const W=vw;
        return(
          <div style={{position:'fixed',inset:0,zIndex:900,pointerEvents:'none'}}>
            {pty>0&&<div style={{position:'absolute',left:0,top:0,right:0,height:pty,background:BG}}/>}
            <div style={{position:'absolute',left:0,top:pty,bottom:0,width:pleft,background:BG}}/>
            <div style={{position:'absolute',left:pright,top:pty,right:0,bottom:0,background:BG}}/>
            <div style={{position:'absolute',left:pleft,right:W-pright,top:pbottom,bottom:0,background:BG}}/>
            <div style={{
              position:'fixed',left:tooltipLeft,top:tooltipTop,
              width:TOOLTIP_W,pointerEvents:'auto',
              background:'#120d06',border:'1.5px solid #7a5020',borderRadius:4,
              padding:'18px 20px',boxShadow:'0 0 40px #7a502066',
              animation:'animPop 0.25s ease-out',zIndex:901,
            }}>
              <div style={{position:'absolute',top:-9,left:arrowLeft,width:0,height:0,borderLeft:'8px solid transparent',borderRight:'8px solid transparent',borderBottom:'9px solid #7a5020'}}/>
              <div style={{position:'absolute',top:-7,left:arrowLeft+1,width:0,height:0,borderLeft:'7px solid transparent',borderRight:'7px solid transparent',borderBottom:'8px solid #120d06'}}/>
              <div style={{display:'flex',gap:10,alignItems:'flex-start'}}><NarratorAvatar tooltipW={Math.min(280,vw-20)}/><div style={{flex:1,minWidth:0}}><p style={{color:'#c8a96e',fontSize:12,lineHeight:1.85,fontStyle:'italic',marginBottom:18,fontFamily:"'IM Fell English','Georgia',serif",opacity:0.9}}>
                每回合你将从<span style={{color:'#e8c87a',fontStyle:'normal',fontWeight:700}}>牌堆</span>摸一张牌，探索一个新区域，同时也会发生<span style={{color:'#e8c87a',fontStyle:'normal',fontWeight:700}}>随机事件</span>。
              </p>
              <button
                onClick={()=>setTutorialStep(13)}
                style={{width:'100%',padding:'8px',background:'#1c1008',border:'1.5px solid #c8a96e',color:'#e8c87a',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:11,borderRadius:2,cursor:'pointer',letterSpacing:1.5,textTransform:'uppercase',boxShadow:'0 0 12px #c8a96e33',transition:'all .2s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='#2a1a08';}}
                onMouseLeave={e=>{e.currentTarget.style.background='#1c1008';}}
              >下一步 →</button>
            </div></div>
            </div>
          </div>
        );
      })()}
      {showTutorial&&tutorialStep===13&&(()=>{
        const TOOLTIP_W=Math.min(265,vw-20);
        const pty    =deckAreaRect?deckAreaRect.top:0;
        const pbottom=deckAreaRect?deckAreaRect.bottom:200;
        const pleft  =deckAreaRect?deckAreaRect.left:0;
        const pright =deckAreaRect?deckAreaRect.right:vw;
        const pcx    =pleft+(pright-pleft)/2;
        const tooltipLeft=Math.max(8,Math.min(pcx-TOOLTIP_W/2,vw-TOOLTIP_W-8));
        const tooltipTop =pbottom+14;
        const arrowLeft  =Math.max(16,Math.min(pcx-tooltipLeft-8,TOOLTIP_W-24));
        const BG='rgba(0,0,0,0.58)';
        const W=vw;
        return(
          <div style={{position:'fixed',inset:0,zIndex:900,pointerEvents:'none'}}>
            {pty>0&&<div style={{position:'absolute',left:0,top:0,right:0,height:pty,background:BG}}/>}
            <div style={{position:'absolute',left:0,top:pty,bottom:0,width:pleft,background:BG}}/>
            <div style={{position:'absolute',left:pright,top:pty,right:0,bottom:0,background:BG}}/>
            <div style={{position:'absolute',left:pleft,right:W-pright,top:pbottom,bottom:0,background:BG}}/>
            <div style={{
              position:'fixed',left:tooltipLeft,top:tooltipTop,
              width:TOOLTIP_W,pointerEvents:'auto',
              background:'#120d06',border:'1.5px solid #7a5020',borderRadius:4,
              padding:'18px 20px',boxShadow:'0 0 40px #7a502066',
              animation:'animPop 0.25s ease-out',zIndex:901,
            }}>
              <div style={{position:'absolute',top:-9,left:arrowLeft,width:0,height:0,borderLeft:'8px solid transparent',borderRight:'8px solid transparent',borderBottom:'9px solid #7a5020'}}/>
              <div style={{position:'absolute',top:-7,left:arrowLeft+1,width:0,height:0,borderLeft:'7px solid transparent',borderRight:'7px solid transparent',borderBottom:'8px solid #120d06'}}/>
              <div style={{display:'flex',gap:10,alignItems:'flex-start'}}><NarratorAvatar tooltipW={Math.min(280,vw-20)}/><div style={{flex:1,minWidth:0}}><p style={{color:'#c8a96e',fontSize:12,lineHeight:1.85,fontStyle:'italic',marginBottom:10,fontFamily:"'IM Fell English','Georgia',serif",opacity:0.9}}>
                也有可能，你遇到的不是新区域，而是<span style={{color:'#c060e0',fontStyle:'normal',fontWeight:700,textShadow:'0 0 8px #9030cc88'}}>邪神的化身</span>。
              </p>
              <p style={{color:'#c8a96e',fontSize:12,lineHeight:1.85,fontStyle:'italic',marginBottom:18,fontFamily:"'IM Fell English','Georgia',serif",opacity:0.9}}>
                是否<span style={{color:'#c060e0',fontStyle:'normal',fontWeight:700,textShadow:'0 0 8px #9030cc88'}}>信仰</span>祂，分享祂的权能，取决于你。小心越陷越深。
              </p>
              <button
                onClick={()=>setTutorialStep(14)}
                style={{width:'100%',padding:'8px',background:'#1c1008',border:'1.5px solid #c8a96e',color:'#e8c87a',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:11,borderRadius:2,cursor:'pointer',letterSpacing:1.5,textTransform:'uppercase',boxShadow:'0 0 12px #c8a96e33',transition:'all .2s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='#2a1a08';}}
                onMouseLeave={e=>{e.currentTarget.style.background='#1c1008';}}
              >下一步 →</button>
            </div></div>
            </div>
          </div>
        );
      })()}
      {showTutorial&&tutorialStep===14&&(()=>{
        return(
          <div style={{position:'fixed',inset:0,zIndex:900,pointerEvents:'none',display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.58)',pointerEvents:'none'}}/>
            <div style={{
              position:'relative',zIndex:901,
              width:Math.min(280,vw-20),pointerEvents:'auto',
              background:'#120d06',border:'1.5px solid #7a5020',borderRadius:4,
              padding:'18px 20px',boxShadow:'0 0 40px #7a502066',
              animation:'animPop 0.25s ease-out',
            }}>
              <div style={{display:'flex',gap:10,alignItems:'flex-start'}}><NarratorAvatar tooltipW={Math.min(280,vw-20)}/><div style={{flex:1,minWidth:0}}><p style={{color:'#c8a96e',fontSize:12,lineHeight:1.85,fontStyle:'italic',marginBottom:10,fontFamily:"'IM Fell English','Georgia',serif",opacity:0.9}}>
                你问我还能遇到什么？天知道。
              </p>
              <p style={{color:'#c8a96e',fontSize:12,lineHeight:1.85,fontStyle:'italic',marginBottom:18,fontFamily:"'IM Fell English','Georgia',serif",opacity:0.9}}>
                我已经老了，或许你<span style={{color:'#e8c87a',fontStyle:'normal',fontWeight:700}}>以后</span>能遇到更多事。
              </p>
              <button
                onClick={()=>setTutorialStep(15)}
                style={{width:'100%',padding:'8px',background:'#1c1008',border:'1.5px solid #c8a96e',color:'#e8c87a',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:11,borderRadius:2,cursor:'pointer',letterSpacing:1.5,textTransform:'uppercase',boxShadow:'0 0 12px #c8a96e33',transition:'all .2s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='#2a1a08';}}
                onMouseLeave={e=>{e.currentTarget.style.background='#1c1008';}}
              >下一步 →</button>
            </div></div>
            </div>
          </div>
        );
      })()}
      {/* ── Step 15: hand area spotlight (same layout as step 7) ── */}
      {showTutorial&&tutorialStep===15&&(()=>{
        const TOOLTIP_W=Math.min(265,vw-20);
        const hcx=handAreaRect?handAreaRect.left+(handAreaRect.width/2):200;
        const hty=handAreaRect?handAreaRect.top:400;
        const hbottom=handAreaRect?handAreaRect.bottom:500;
        const hleft=handAreaRect?handAreaRect.left:0;
        const hright=handAreaRect?handAreaRect.right:window.innerWidth;
        const tooltipLeft=Math.max(8,Math.min(hcx-TOOLTIP_W/2,window.innerWidth-TOOLTIP_W-8));
        const tooltipBottom=window.innerHeight-hty+14;
        const arrowLeft=Math.max(16,Math.min(hcx-tooltipLeft-8,TOOLTIP_W-24));
        const BG='rgba(0,0,0,0.58)';
        const W=window.innerWidth;
        return(
          <div style={{position:'fixed',inset:0,zIndex:900,pointerEvents:'none'}}>
            <div style={{position:'absolute',left:0,top:0,right:0,height:hty,background:BG,pointerEvents:'none'}}/>
            <div style={{position:'absolute',left:0,top:hty,bottom:0,width:hleft,background:BG,pointerEvents:'none'}}/>
            <div style={{position:'absolute',right:0,top:hty,bottom:0,left:hright,background:BG,pointerEvents:'none'}}/>
            <div style={{position:'absolute',left:hleft,right:W-hright,top:hbottom,bottom:0,background:BG,pointerEvents:'none'}}/>
            <div style={{
              position:'fixed',left:tooltipLeft,bottom:tooltipBottom,
              width:TOOLTIP_W,pointerEvents:'auto',
              background:'#120d06',border:'1.5px solid #7a5020',borderRadius:4,
              padding:'18px 20px',boxShadow:'0 0 40px #7a502066',
              animation:'animPop 0.25s ease-out',zIndex:901,
            }}>
              <div style={{position:'absolute',bottom:-9,left:arrowLeft,width:0,height:0,borderLeft:'8px solid transparent',borderRight:'8px solid transparent',borderTop:'9px solid #7a5020'}}/>
              <div style={{position:'absolute',bottom:-7,left:arrowLeft+1,width:0,height:0,borderLeft:'7px solid transparent',borderRight:'7px solid transparent',borderTop:'8px solid #120d06'}}/>
              <div style={{display:'flex',gap:10,alignItems:'flex-start'}}><NarratorAvatar tooltipW={Math.min(280,vw-20)}/><div style={{flex:1,minWidth:0}}><p style={{color:'#c8a96e',fontSize:12,lineHeight:1.85,fontStyle:'italic',marginBottom:10,fontFamily:"'IM Fell English','Georgia',serif",opacity:0.9}}>
                务必注意，你的行囊有限。回合结束时，如果你的<span style={{color:'#e8c87a',fontStyle:'normal',fontWeight:700}}>手牌多于4张</span>，那就丢掉多余的东西，轻装上路。
              </p>
              <p style={{color:'#c8a96e',fontSize:12,lineHeight:1.85,fontStyle:'italic',marginBottom:18,fontFamily:"'IM Fell English','Georgia',serif",opacity:0.9}}>
                我还有很多没教你，比如各身份都有自己的<span style={{color:'#e8c87a',fontStyle:'normal',fontWeight:700}}>技能</span>。不过想要生存并获胜，你得自己学了。
              </p>
              <button
                onClick={()=>setTutorialStep(16)}
                style={{width:'100%',padding:'8px',background:'#1c1008',border:'1.5px solid #c8a96e',color:'#e8c87a',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:11,borderRadius:2,cursor:'pointer',letterSpacing:1.5,textTransform:'uppercase',boxShadow:'0 0 12px #c8a96e33',transition:'all .2s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='#2a1a08';}}
                onMouseLeave={e=>{e.currentTarget.style.background='#1c1008';}}
              >下一步 →</button>
            </div></div>
            </div>
          </div>
        );
      })()}
      {/* ── Step 16: closing modal, "完成引导" ── */}
      {showTutorial&&tutorialStep===16&&(
        <div style={{position:'fixed',inset:0,background:'#000000cc',zIndex:999,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'#120d06',border:'2px solid #7a5020',borderRadius:4,padding:'36px 40px',maxWidth:380,width:'90%',textAlign:'center',boxShadow:'0 0 60px #7a502066',animation:'animPop 0.25s ease-out'}}>
            <img src={NARRATOR_AVATAR} alt="narrator" style={{width:Math.min(80,Math.floor((vw-20)/4)),height:Math.min(80,Math.floor((vw-20)/4)),borderRadius:4,objectFit:'cover',objectPosition:'top',border:'2px solid #5a3a10',boxShadow:'0 0 16px #7a502066',margin:'0 auto 14px',display:'block'}} />
            <div style={{width:160,height:1,background:'linear-gradient(90deg,transparent,#5a4020,transparent)',margin:'0 auto 20px'}}/>
            <p style={{color:'#c8a96e',fontSize:13,lineHeight:1.9,fontStyle:'italic',marginBottom:14,opacity:0.85}}>
              如果你开始害怕这座遗迹，像我一样逃离还来得及。如果你依然无所畏惧…
            </p>
            <p style={{color:'#e8c87a',fontSize:17,lineHeight:1.9,fontWeight:700,fontStyle:'italic',marginBottom:28,fontFamily:"'IM Fell English','Georgia',serif",textShadow:'0 0 16px #c8a96e66'}}>
              那就<span style={{color:'#f0d890',textShadow:'0 0 20px #e8c87a99',fontWeight:700}}>开始探索</span>吧！
            </p>
            <button
              onClick={completeTutorial}
              style={{padding:'10px 36px',background:'#1c1008',border:'2px solid #c8a96e',color:'#e8c87a',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:13,borderRadius:2,cursor:'pointer',letterSpacing:2,textTransform:'uppercase',boxShadow:'0 0 20px #c8a96e44',transition:'all .2s'}}
              onMouseEnter={e=>{e.currentTarget.style.background='#2a1a08';e.currentTarget.style.boxShadow='0 0 30px #c8a96e88';}}
              onMouseLeave={e=>{e.currentTarget.style.background='#1c1008';e.currentTarget.style.boxShadow='0 0 20px #c8a96e44';}}
            >
              ✦ 完成引导
            </button>
            {isArtifact&&(
              <div style={{marginTop:14,fontSize:10,color:'#7a5a2a',fontFamily:"'Cinzel',serif",letterSpacing:0.5}}>
                （当前为预览环境，引导完成状态不会被保存）
              </div>
            )}
          </div>
        </div>
      )}</>,document.body)}
      {roleRevealAnim&&<RoleRevealAnim role={roleRevealAnim.role} onDone={()=>_onRoleRevealDone(roleRevealAnim.pendingGs)}/>}
      {phase==='PLAYER_WIN_PENDING'&&!showTutorial&&(
        <TreasureMapAnim hand={me.hand} onConfirm={()=>{
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
    {isMultiplayer&&showEmojiPicker&&ReactDOM.createPortal(
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
