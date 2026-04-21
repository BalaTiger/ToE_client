import { GodTooltip, AreaTooltip, useCardHoverTooltip, GodDDCard, DDCard, DDCardBack, GodCardDisplay, OctopusSVG } from './components/cards';
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import ReactDOM, { createPortal } from "react-dom";
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
  getZoneCardPolarity,
  getZoneCardEffectScope,
  zoneCardHasGuaranteedHpLoss,
  zoneCardHasGuaranteedSanLoss,
  zoneCardIsSacrificeStyle,
  zoneCardAppliesWidePressure,
  zoneCardProvidesGuaranteedCardGain,
  zoneCardUsesTargetInteraction,
  isWinHand,
  getLivingPlayerOrder,
  estimateZoneCardKeepScore,
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
  canTreasureHunterWinBySwap,
  shouldTreasureHunterSwapToAvoidRegression,
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
  isLocalActorSeat,
  isLocalDrawDecisionPhase,
  isLocalGodChoicePhase,
  isLocalFirstComePicker,
  isLocalDamageLinkSourcePhase,
  canLocalActOnTargetSelectionPhase,
  isLocalSwapGivePhase,
  isLocalBewitchCardPhase,
  isLocalTortoiseSelectPhase,
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
  isTurnStartLog,
  isStatLog,
  isSkillHuntLog,
  isSkillSwapLog,
  isSkillBewitchLog,
  isDiscardOnlyLog,
  isTransferLog,
  isDrawLikeLog,
  splitAnimBoundLogs,
  bindAnimLogChunks,
  subtractLogOccurrences,
  splitTransitionLogs,
  appendAnimLogChunkToQueueEnd,
  hasExplicitAnimMsgs,
  hasExplicitTurnFlowLogs,
  extractSkillLogs,
  prepareAnimQueueLogs,
} from "./game/animLogs";
import {
  resolveTurnHighlightForStep,
  buildBewitchForcedCardQueue,
  buildInspectionRevealQueue,
  buildInspectionEventFlow,
} from "./game/animQueueHelpers";

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

// ══════════════════════════════════════════════════════════════、
//  UTILITIES
// ══════════════════════════════════════════════════════════════
const cardsHuntMatch=(a,b)=>{
  if(!a||!b)return false;
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
  const mergeInspectionResult=(inspectionResult, baseLog)=>{
    P=inspectionResult.players;
    D=inspectionResult.deck;
    Disc=inspectionResult.discard;
    inspectionMeta=mergeInspectionMeta(inspectionMeta,inspectionResult);
    statePatch={...statePatch,...inspectionMeta};
    const fullLog=Array.isArray(inspectionResult.log)?inspectionResult.log:baseLog;
    const extraMsgs=fullLog.slice(baseLog.length);
    if(extraMsgs.length)msgs.push(...extraMsgs);
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
      const inspectionBaseLog=[...(Array.isArray(gs?.log)?gs.log:[]),...msgs];
      const processed=applySanLossToPlayerWithInspection(i,1,gs?.currentTurn??ci,P,D,Disc,inspectionBaseLog,inspectionMeta);
      P=processed.P;D=processed.D;Disc=processed.Disc;inspectionMeta=processed.inspectionMeta;
      const extraMsgs=(processed.L||[]).slice(inspectionBaseLog.length);if(extraMsgs.length)msgs.push(...extraMsgs);
      clearPlayerGodZone(P[i],Disc);
      msgs.push(`${P[i].name} 被邪神抛弃，SAN-1`);
    }});
  } else if(action==='worship'){
    P[ci].godName=godKey;P[ci].godLevel=1;P[ci].godZone=[{...godCard}];
    msgs.push(`${P[ci].name} 信仰了 ${godCard.name}，获得${godCard.power}(Lv.1)`);
    P.forEach((p,i)=>{if(i!==ci&&p.godName===godKey){
      const inspectionBaseLog=[...(Array.isArray(gs?.log)?gs.log:[]),...msgs];
      const processed=applySanLossToPlayerWithInspection(i,1,gs?.currentTurn??ci,P,D,Disc,inspectionBaseLog,inspectionMeta);
      P=processed.P;D=processed.D;Disc=processed.Disc;inspectionMeta=processed.inspectionMeta;
      const extraMsgs=(processed.L||[]).slice(inspectionBaseLog.length);if(extraMsgs.length)msgs.push(...extraMsgs);
      clearPlayerGodZone(P[i],Disc);
      msgs.push(`${P[i].name} 被邪神抛弃，SAN-1`);
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
      for(let _d=0;_d<extraDraws;_d++){
        const r2=playerDrawCard(P,D,Disc,next,gs);P=r2.P;D=r2.D;Disc=r2.Disc;
        if(r2.drawnCard)L.push(`  摸到 ${cardLogText(r2.drawnCard,{alwaysShowName:true})}`);
        if(r2.needGodChoice){
          // AI角色不会触发神牌选择UI，直接处理
          if(next===0){
            const drawLogs=[`${whoName} 摸到 ${cardLogText(r2.drawnCard,{alwaysShowName:true})}`];
            return{...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:next,skillUsed:false,restUsed:false,huntAbandoned:[],godFromHandUsed:false,godTriggeredThisTurn:true,phase:'GOD_CHOICE',abilityData:{godCard:r2.drawnCard,fromRest:true,cthDrawsRemaining:extraDraws-_d-1,drawerIdx:0},drawReveal:null,selectedCard:null,globalOnlySwapOwner,_turnStartLogs:turnStartLogs,_drawLogs:drawLogs,_statLogs:[]};
          }
        }
        if(r2.needsDecision){
          // AI角色自动处理决策
          if(next===0){
            const split=splitAnimBoundLogs(r2.effectMsgs||[]);
            const drawLogs=[`${whoName} 摸到 ${cardLogText(r2.drawnCard,{alwaysShowName:true})}`,...split.preStat];
            return{...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:next,skillUsed:false,restUsed:false,huntAbandoned:[],godFromHandUsed:false,godTriggeredThisTurn:false,phase:'DRAW_REVEAL',drawReveal:{card:r2.drawnCard,msgs:[],needsDecision:true,forcedKeep:false,drawerIdx:0,drawerName:P[0].name,fromRest:true},selectedCard:null,abilityData:{fromRest:true,cthDrawsRemaining:extraDraws-_d-1},globalOnlySwapOwner,_turnStartLogs:turnStartLogs,_drawLogs:drawLogs,_statLogs:split.stat};
          }else{
            // AI角色自动选择收入手牌
            const aiRes=applyFx(r2.drawnCard,next,null,P,D,Disc,gs);
            P=aiRes.P;D=aiRes.D;Disc=aiRes.Disc;P[next].hand.push(r2.drawnCard);
            if(aiRes.msgs.length)L.push(...aiRes.msgs);
          }
        }
        // forced card: already applied, continue
        if(r2.kept){
          if(r2.effectMsgs.length)L.push(...r2.effectMsgs);
          continue;
        }
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
    _aiDrawnCard: gs._aiDrawnCard ?? gs._drawnCard ?? null,
    _discardedDrawnCard: gs._discardedDrawnCard ?? false,
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
          P[ti].hand.push(sc);
          if(sc.type==='swapAllHands'||res.statePatch?.peekHandTargets||res.statePatch?.caveDuelTargets||res.statePatch?.damageLinkTargets||res.statePatch?.roseThornTargets){
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
            };
            const nextPhase=
              sc.type==='swapAllHands'?'ZONE_SWAP_SELECT_TARGET':
              res.statePatch?.peekHandTargets?'PEEK_HAND_SELECT_TARGET':
              res.statePatch?.caveDuelTargets?'CAVE_DUEL_SELECT_TARGET':
              res.statePatch?.damageLinkTargets?'DAMAGE_LINK_SELECT_TARGET':
              res.statePatch?.roseThornTargets?'ROSE_THORN_SELECT_TARGET':
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
        }else if(myProgress>=7){
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
  }else if(!P[ct].isDead){
    if(aiEffRole===ROLE_CULTIST&&isCultistEndingTurnUnreasonable(P,ct)){
      cultistBewitchPlan=chooseAiCultistBewitchPlan(P,ct);
      if(cultistBewitchPlan){
        const plan=cultistBewitchPlan;
        const tgt=P[plan.targetIdx];
        const ti=plan.targetIdx;
        const sc=plan.card;
        let inspectionMeta=makeInspectionMeta(gs);
        P[ct].hand=P[ct].hand.filter(c=>c.id!==sc.id);
        L.push(`${ai.name}（邪祀者）对 ${tgt.name} 【蛊惑】，赠予 ${cardLogText(sc,{alwaysShowName:true})}`);
        P[ti].hand.push(sc);
        const res=applyFx(sc,ti,sc.type==='swapAllHands'?null:ti,P,D,Disc,gs);P=res.P;D=res.D;Disc=res.Disc;L.push(...res.msgs);
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
    return{...nextGs,_aiDrawnCard:gs._aiDrawnCard??gs._drawnCard??null,_discardedDrawnCard:gs._discardedDrawnCard??false,_aiName:ai.name,_playersBeforeNextDraw:_P_afterAction,_playersBeforeSkillAction:playersBeforeSkillAction,_preSkillLogs:preSkillLogs,_preSkillDiscard:preSkillDiscard,_aiHuntEvents:aiHuntEvents};
  }
  const win=checkWin(P,gs._isMP);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win};
  const aiHandLimit=P[ct]._nyaHandLimit??4;
  while(P[ct].hand.length>aiHandLimit){const c=P[ct].hand.shift();Disc.push(c);L.push(`${ai.name} 弃 ${cardLogText(c,{alwaysShowName:true})}（上限）`);}
  
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

  return{...nextGs,_aiDrawnCard:(nextGs.currentTurn===ct&&nextGs.phase==='AI_TURN')?null:(gs._aiDrawnCard??gs._drawnCard??null),_discardedDrawnCard:(nextGs.currentTurn===ct&&nextGs.phase==='AI_TURN')?false:(gs._discardedDrawnCard??false),_aiName:ai.name,_playersBeforeNextDraw:_P_afterAction,_playersBeforeSkillAction:playersBeforeSkillAction,_preSkillLogs:preSkillLogs,_preSkillDiscard:preSkillDiscard,_aiHuntEvents:aiHuntEvents};
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
      const player = P[playerIndex];
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

function getInspectionCardDesc(card){
  switch(card?.effect){
    case 'adjacentDamageHP': return '相邻角色失去 1 HP';
    case 'selfDamageHP': return '失去 1 HP';
    case 'disableRest': return '下一回合禁用“休息”';
    case 'nothing': return '什么也不做';
    case 'flip': return '翻面';
    case 'discardRandom': return '随机弃一张牌';
    case 'disableSkill': return '下一回合禁用技能';
    case 'handLimitDecrease': return '下一回合手牌上限 -1';
    case 'healSAN': return '恢复 1 SAN';
    case 'drawCard': return '从牌堆摸一张牌';
    case 'sealLoosening': return '连续翻出两次时邪神复活';
    case 'houndsOfTindalos': return '首个超时超过 15 秒的回合失去 4 HP';
    default: return '';
  }
}

// Duration (ms) per animation type
const ANIM_DURATION={DRAW_CARD:1850, HP_HEAL:1200, SAN_HEAL:1200, HP_SAN_HEAL:1200, SAN_DAMAGE:800, SKILL_SWAP:800, SKILL_HUNT:1200, SKILL_BEWITCH:1200, DICE_ROLL:2200, DISCARD:1000, YOUR_TURN:2000, GUILLOTINE:2500, CARD_TRANSFER:700, EARTHQUAKE:1200, CAVE_DUEL:2600, TURN_BOUNDARY_PAUSE:260, default:600};
const ANIM_SPEED_SCALE=1.35;
const CARD_REVEAL_DURATION=Math.round(2600*ANIM_SPEED_SCALE);
const ANIM_STEP_GAP=420;
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
  const newMsgs=newGs.log.slice(oldGs.log.length);
  // 当回合交接时因首牌强制触发效果（如扭伤）直接导致游戏结束，必须补全飞牌和回合展示动画
  if(newGs.gameOver && newGs.currentTurn !== oldGs.currentTurn){
    const dCard = newGs._aiDrawnCard || newGs._drawnCard || newGs.drawReveal?.card;
    if(dCard){
      q.push({type:'YOUR_TURN', name:newGs.players[newGs.currentTurn]?.name||'???', msgs: newGs._turnStartLogs||[]});
      q.push({type:'DRAW_CARD', card: dCard, triggerName: newGs.players[newGs.currentTurn]?.name||'???', targetPid: newGs.currentTurn, msgs: newGs._drawLogs||[]});
    }
  }
  const deathIdx=newGs.players.reduce((acc,p,i)=>{if(oldGs.players[i]&&!oldGs.players[i].isDead&&p.isDead)acc.push(i);return acc;},[]);
  const _ts=newGs.players.map(p=>({hp:p.hp,san:p.san,isDead:p.isDead}));
  const hpHealIdx=newGs.players.reduce((acc,p,i)=>{if(oldGs.players[i]&&p.hp>oldGs.players[i].hp)acc.push(i);return acc;},[]);
  const sanHealIdx=newGs.players.reduce((acc,p,i)=>{if(oldGs.players[i]&&p.san>oldGs.players[i].san)acc.push(i);return acc;},[]);
  const sameHealTargets=hpHealIdx.length&&sanHealIdx.length&&hpHealIdx.length===sanHealIdx.length&&hpHealIdx.every((v,i)=>v===sanHealIdx[i]);
  const hpHitIdx=newGs.players.reduce((acc,p,i)=>{if(oldGs.players[i]&&p.hp<oldGs.players[i].hp)acc.push(i);return acc;},[]);
  if(hpHitIdx.length) q.push({type:'HP_DAMAGE',msgs:newMsgs,hitIndices:hpHitIdx,targetStats:_ts});
  if(sameHealTargets){
    q.push({type:'HP_SAN_HEAL',msgs:newMsgs,hitIndices:hpHealIdx,targetStats:_ts});
  }else{
    if(hpHealIdx.length) q.push({type:'HP_HEAL',msgs:newMsgs,hitIndices:hpHealIdx,targetStats:_ts});
    if(sanHealIdx.length) q.push({type:'SAN_HEAL',msgs:newMsgs,hitIndices:sanHealIdx,targetStats:_ts});
  }
  const sanHitIdx=newGs.players.reduce((acc,p,i)=>{if(oldGs.players[i]&&p.san<oldGs.players[i].san)acc.push(i);return acc;},[]);
  if(sanHitIdx.length) q.push({type:'SAN_DAMAGE',msgs:newMsgs,hitIndices:sanHitIdx,targetStats:_ts});
  if(deathIdx.length){
    q.push({type:'GUILLOTINE',msgs:newMsgs,hitIndices:deathIdx,targetStats:_ts});
    q.push({type:'DEATH',msgs:newMsgs,hitIndices:deathIdx,targetStats:_ts});
  }
  // 仅在地动山摇效果实际结算时播放，不因追捕亮牌等日志文本误触发
  if((newGs._earthquakeSeq||0)!==(oldGs._earthquakeSeq||0)){
    q.push({type:'EARTHQUAKE',msgs:newMsgs});
  }
  // Detect hand card losses → CARD_TRANSFER
  const losers=newGs.players.filter((p,i)=>oldGs.players[i]&&p.hand.length<oldGs.players[i].hand.length);
  if(losers.length===1){
    // 普通单向手牌减少（追捕没收、蛊惑、弃牌等）
    const li=newGs.players.indexOf(losers[0]);
    const count=(oldGs.players[li].hand.length-newGs.players[li].hand.length);
    let dest='discard',toPid=null;
    for(let j=0;j<newGs.players.length;j++){
      if(j===li||!oldGs.players[j])continue;
      if(newGs.players[j].hand.length>oldGs.players[j].hand.length){dest='player';toPid=j;break;}
    }
    if(dest==='discard'){
      const oldGZ=oldGs.players[li].godZone?.length||0;
      const newGZ=newGs.players[li].godZone?.length||0;
      if(newGZ>oldGZ)dest='godzone';
    }
    // 死亡角色的手牌放入弃牌堆时不生成飞牌动画（追捕击杀的飞牌动画在 buildAiHuntEventAnimQueue 中单独处理）
    if (!newGs.players[li]?.isDead) {
      q.push({type:'CARD_TRANSFER',fromPid:li,dest,toPid,count});
    }
  }else if(losers.length===2){
    // 双向交换（掉包）：为双方各生成一条飞牌动画
    // A→B（发动者把牌给目标），B→A（目标的牌到发动者）
    losers.forEach(loser=>{
      const li=newGs.players.indexOf(loser);
      const toPid=newGs.players.findIndex((p,j)=>j!==li&&oldGs.players[j]&&p.hand.length>oldGs.players[j].hand.length);
      if(toPid<0)return;
      const count=oldGs.players[li].hand.length-newGs.players[li].hand.length;
      q.push({type:'CARD_TRANSFER',fromPid:li,dest:'player',toPid,count});
    });
  }
  return q;
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
    const resultWithChunks=resultQueue.map(step=>({...step}));
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

// ── Card Flip Animation ────────────────────────────────────────
// Smoke column positions — each column renders 2 wisps
const SMOKE_COLS=[
  {x:'12%', d1:0,    d2:0.22},
  {x:'26%', d1:0.10, d2:0.30},
  {x:'41%', d1:0.05, d2:0.26},
  {x:'57%', d1:0.18, d2:0.38},
  {x:'72%', d1:0.08, d2:0.28},
];
// Feather path helper — BLADE shape.
// Leading edge (px+) runs nearly straight to the tip.
// Trailing edge (px-) tapers inward from the 50% midpoint so the second half
// narrows like a blade.  Tip: small rounded cap (radius = w*0.22) so no sharp point.
//
//   root  ──────────────────── mid ──── shoulder ──(arc)── tip
//   left edge stays wide              stays near shaft
//   right edge stays wide   right edge curves toward shaft → blade taper
//
// w is the root half-width on each side (will be multiplied internally).
function fp(x0,y0,x1,y1,w){
  w=w*2.8;                                      // base width scale
  const dx=x1-x0,dy=y1-y0,len=Math.sqrt(dx*dx+dy*dy);
  const px=-dy/len,py=dx/len;                   // perpendicular (leading-edge direction)

  // ── Root edge points ────────────────────────────────────────
  const rlx=x0+px*w*0.5,  rly=y0+py*w*0.5;     // leading-edge root
  const rrx=x0-px*w*0.5,  rry=y0-py*w*0.5;     // trailing-edge root

  // ── Leading edge: gentle outward bulge at 35%, stays near ±w/2 all the way ─
  const lbx=x0+dx*0.35+px*w*0.56, lby=y0+dy*0.35+py*w*0.56;  // leading belly

  // ── Trailing edge: full width to 50%, then curves inward toward shaft ────────
  const rbx=x0+dx*0.35-px*w*0.56, rby=y0+dy*0.35-py*w*0.56;  // trailing belly (mirror)
  // Midpoint trailing — starts tapering here
  const rmx=x0+dx*0.50-px*w*0.50, rmy=y0+dy*0.50-py*w*0.50;
  // Shoulder: trailing edge has come close to shaft (w*0.08 offset = almost on axis)
  const rsx=x0+dx*0.82-px*w*0.08, rsy=y0+dy*0.82-py*w*0.08;

  // ── Leading edge pre-tip: still reasonably wide at shoulder ─────────────────
  const lsx=x0+dx*0.82+px*w*0.40, lsy=y0+dy*0.82+py*w*0.40;

  // ── Rounded tip cap ──────────────────────────────────────────────────────────
  // Cap radius: half of the remaining width at the shoulder (leading offset w*0.40)
  const cr=w*0.22;
  // Tip anchor: slightly beyond actual tip along shaft direction
  const tipx=x1+dx*0.04, tipy=y1+dy*0.04;
  // Left/right of cap
  const clx=tipx+px*cr, cly=tipy+py*cr;
  const crx=tipx-px*cr, cry=tipy-py*cr;

  return[
    // Start at leading-edge root
    `M${rlx.toFixed(1)},${rly.toFixed(1)}`,
    // Leading edge belly → shoulder (stays wide)
    `Q${lbx.toFixed(1)},${lby.toFixed(1)} ${lsx.toFixed(1)},${lsy.toFixed(1)}`,
    // Leading edge → left cap point
    `Q${(x1+px*w*0.32).toFixed(1)},${(y1+py*w*0.32).toFixed(1)} ${clx.toFixed(1)},${cly.toFixed(1)}`,
    // Rounded cap arc over tip
    `Q${(tipx+dx*0.08).toFixed(1)},${(tipy+dy*0.08).toFixed(1)} ${crx.toFixed(1)},${cry.toFixed(1)}`,
    // Trailing edge: cap → shoulder (already tapered in)
    `Q${(x1-px*w*0.06).toFixed(1)},${(y1-py*w*0.06).toFixed(1)} ${rsx.toFixed(1)},${rsy.toFixed(1)}`,
    // Trailing taper: shoulder → midpoint → belly → root
    `Q${rmx.toFixed(1)},${rmy.toFixed(1)} ${rbx.toFixed(1)},${rby.toFixed(1)}`,
    `Q${(x0+dx*0.12-px*w*0.50).toFixed(1)},${(y0+dy*0.12-py*w*0.50).toFixed(1)} ${rrx.toFixed(1)},${rry.toFixed(1)} Z`
  ].join(' ');
}

// ── Flower Bloom Component ─────────────────────────────────────────────────
// Each flower is a pure SVG with randomised petal count, size, hue, and position.
// They appear in staggered pairs spreading outward from the card.
// Seeded deterministically per render via a stable config array.
const FLOWER_CONFIGS=[
  // [side(-1=left,1=right), xOff, yOff, scale, hue, petals, delay, variant]
  // ── LEFT side ──
  [-1,  52,  15, 1.00, 340,  6, 1.22, 0],  // rose-pink, 6p
  [-1,  95, -28, 0.82, 310,  5, 1.38, 1],  // lavender,  5p
  [-1,  70,  52, 0.92, 355,  7, 1.50, 2],  // warm white,7p
  [-1, 130,  18, 0.75, 290,  5, 1.62, 1],  // lilac,     5p
  [-1,  48, -55, 0.88, 0,    6, 1.72, 0],  // blush,     6p
  [-1, 115, -52, 0.70, 320,  8, 1.85, 2],  // mauve,     8p
  // ── RIGHT side ──
  [ 1,  52,  15, 1.00, 340,  6, 1.28, 0],
  [ 1,  95, -28, 0.85, 30,   5, 1.42, 1],  // peach
  [ 1,  72,  52, 0.90, 355,  7, 1.55, 2],
  [ 1, 132,  18, 0.78, 290,  5, 1.66, 1],
  [ 1,  50, -55, 0.86, 8,    6, 1.78, 0],
  [ 1, 117, -52, 0.72, 320,  8, 1.90, 2],
];

// Three petal shape variants
function petalPath(n,r,variant){
  const paths=[];
  for(let i=0;i<n;i++){
    const a=(i/n)*Math.PI*2;
    const tip_r=r;
    const ctrl_r=r*0.62;
    const hw=variant===2?0.38:variant===1?0.44:0.50; // half-width angle
    const left_a=a-hw;const right_a=a+hw;
    const tx=Math.cos(a)*tip_r, ty=Math.sin(a)*tip_r;
    const c1x=Math.cos(left_a)*ctrl_r, c1y=Math.sin(left_a)*ctrl_r;
    const c2x=Math.cos(right_a)*ctrl_r, c2y=Math.sin(right_a)*ctrl_r;
    // Round petal: two cubics from origin → tip (via control points)
    paths.push(`M0,0 Q${c1x.toFixed(2)},${c1y.toFixed(2)} ${tx.toFixed(2)},${ty.toFixed(2)} Q${c2x.toFixed(2)},${c2y.toFixed(2)} 0,0`);
  }
  return paths;
}

function FlowerSVG({petals,hue,variant,size}){
  const r=size*0.44;
  const shapes=petalPath(petals,r,variant);
  // Petal colours: soft pastel derived from hue
  const petalFill=`hsla(${hue},70%,88%,0.92)`;
  const petalStroke=`hsla(${hue},55%,72%,0.60)`;
  const centerFill=`hsla(${hue+20},80%,96%,1)`;
  const glowFill=`hsla(${hue},60%,95%,0.50)`;
  return(
    <svg viewBox={`${-size/2} ${-size/2} ${size} ${size}`}
      width={size} height={size} style={{overflow:'visible'}}>
      {/* Soft glow halo */}
      <circle cx="0" cy="0" r={r*1.35}
        fill={glowFill} style={{filter:'blur(8px)'}}/>
      {/* Petals */}
      {shapes.map((d,i)=>(
        <path key={i} d={d}
          fill={petalFill} stroke={petalStroke} strokeWidth="0.8"
          style={{filter:'blur(0.4px)'}}/>
      ))}
      {/* Stamen ring */}
      <circle cx="0" cy="0" r={r*0.22}
        fill={centerFill}
        stroke={`hsla(${hue+10},60%,78%,0.70)`} strokeWidth="0.8"/>
      <circle cx="0" cy="0" r={r*0.10} fill={`hsla(${hue+30},90%,98%,1)`}/>
    </svg>
  );
}

function FlowerBloom(){
  // Card is roughly 120×160px at center; half = 60×80.
  // Flowers are offset outward from ±60px center edge.
  // Each flower: bloom in, hold, then fade out
  return(
    <>
      {FLOWER_CONFIGS.map(([side,xOff,yOff,scale,hue,petals,delay,variant],i)=>{
        const size=Math.round(72*scale); // base size 72px (~half card width)
        const left=side===-1
          ?`calc(50% - 60px - ${xOff}px)` // left side: move left of card
          :`calc(50% + 60px + ${xOff - size}px)`; // right side
        const top=`calc(50% + ${yOff - size/2}px)`;
        const bloomDur=0.55;
        const holdDur=0.70;
        const fadeDur=0.40;
        const totalDur=bloomDur+holdDur+fadeDur;
        return(
          <div key={i} style={{
            position:'absolute',
            left, top,
            width:size, height:size,
            opacity:0,
            transformOrigin:'center center',
            animation:`flowerBloom ${bloomDur}s cubic-bezier(0.34,1.56,0.64,1) ${delay}s both,
                       flowerFade  ${fadeDur}s ease-in ${delay+bloomDur+holdDur}s both`,
            pointerEvents:'none',
          }}>
            <FlowerSVG petals={petals} hue={hue} variant={variant} size={size}/>
          </div>
        );
      })}
    </>
  );
}

function CardFlipAnim({card,triggerName,targetPid,exiting,skipTravel=false}){
  if(!card) return null;
  const isInspection=!!card.effect;
  const inspectionTone=isInspection?(card.type||'neutral'):null;
  const s=isInspection
    ?({
      bg:inspectionTone==='positive'?'linear-gradient(135deg,#11331d,#08160d)':inspectionTone==='neutral'?'linear-gradient(135deg,#1a1d24,#0b0e13)':'linear-gradient(135deg,#241126,#0f0713)',
      borderBright:inspectionTone==='positive'?'#56d184':inspectionTone==='neutral'?'#7b889b':'#d16acb',
      border:inspectionTone==='positive'?'#3da865':inspectionTone==='neutral'?'#5d6978':'#9e4a92',
      text:inspectionTone==='positive'?'#b8ffd1':inspectionTone==='neutral'?'#d7e0ef':'#ffd0ff',
      glow:inspectionTone==='positive'?'#49d17d':inspectionTone==='neutral'?'#91a1c2':'#b24ad1',
    })
    :(CS[card.letter]||GOD_CS);
  const cardPolarity=isInspection?inspectionTone:(card.isGod?'negative':getZoneCardPolarity(card));
  const isEvil=cardPolarity==='negative';
  const isNeutralCard=!isInspection&&cardPolarity==='neutral';
  const isNeutralInspection=isInspection&&inspectionTone==='neutral';
  const isPositiveInspection=isInspection&&inspectionTone==='positive';

  // Phase 1: card travels from deck (top-right) toward destination panel ~650ms
  // Phase 2: full flip animation
  const [traveled,setTraveled]=React.useState(skipTravel);
  React.useEffect(()=>{
    if(skipTravel){setTraveled(true);return undefined;}
    const t=setTimeout(()=>setTraveled(true),650);
    return()=>clearTimeout(t);
  },[skipTravel]);

  const getDeckCenter=()=>{
    const deckEl=document.querySelector(isInspection?'[data-inspection-pile]':'[data-deck-pile]');
    if(deckEl){
      const r=deckEl.getBoundingClientRect();
      return {x:r.left+r.width/2,y:r.top+r.height/2};
    }
    return isInspection
      ?{x:window.innerWidth*0.10,y:window.innerHeight*0.14}
      :{x:window.innerWidth*0.94-35,y:window.innerHeight*0.08};
  };
  const getHandCenter=pid=>{
    if(pid===0){
      const handEl=document.querySelector('[data-hand-area]');
      if(handEl){
        const r=handEl.getBoundingClientRect();
        return {x:r.left+r.width/2,y:r.top+r.height/2};
      }
      return {x:window.innerWidth*0.5,y:window.innerHeight*0.8};
    }
    const el=document.querySelector(`[data-pid="${pid}"]`);
    if(el){
      const r=el.getBoundingClientRect();
      return {x:r.left+r.width/2,y:r.top+r.height*0.74};
    }
    return {x:window.innerWidth*0.5,y:window.innerHeight*0.25};
  };

  // Compute destination: target player's hand area
  const destStyle=React.useMemo(()=>{
    const src=getDeckCenter();
    const dest=getHandCenter(targetPid??0);
    return{'--dest-x':`${dest.x-35}px`,'--dest-y':`${dest.y-47}px`,'--src-x':`${src.x-35}px`,'--src-y':`${src.y-47}px`};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]); // measure once on mount

  // Travel phase — card back slides from deck position to destination panel
  if(!traveled) return(
    <div style={{position:'fixed',inset:0,zIndex:999,background:'rgba(4,4,2,0)',pointerEvents:'none'}}>
      <div style={{
        position:'absolute',
        width:70,height:94,borderRadius:4,
        background:'linear-gradient(135deg,#1e1208,#0e0804)',
        border:'1.5px solid #4a3010',
        boxShadow:'0 4px 18px rgba(0,0,0,0.7)',
        ...destStyle,
        animation:'cardTravelToPlayer 0.65s cubic-bezier(0.3,0,0.2,1) forwards',
      }}>
        <div style={{position:'absolute',inset:0,borderRadius:4,
          background:'repeating-linear-gradient(45deg,#2a1a0820 0px,#2a1a0820 1px,transparent 1px,transparent 4px)'}}/>
        <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',
          fontFamily:"'Cinzel',serif",fontSize:14,color:'#a07838',opacity:0.6}}>✦</div>
      </div>
    </div>
  );

  // Ghost-smoke columns: each column = core wisp + halo + ghost face at top
  const spirits=isNeutralInspection
    ?[]
    :isEvil
    ?SMOKE_COLS.flatMap((col,i)=>[
      // Core smoke wisp — S-curve via keyframes, narrow bottom → wide top
      <div key={`${i}a`} style={{
        position:'absolute',left:col.x,bottom:'4%',
        width:18,height:140,
        borderRadius:'44% 56% 40% 60% / 8% 14% 86% 92%',
        background:'linear-gradient(180deg,rgba(200,100,255,0) 0%,rgba(170,45,240,0.68) 18%,rgba(125,18,195,0.90) 45%,rgba(85,5,145,0.80) 70%,rgba(48,1,88,0.58) 88%,rgba(20,0,45,0) 100%)',
        filter:'blur(8px)',opacity:0,
        animation:`smokeRise${i} 1.4s cubic-bezier(0.15,0,0.45,1) ${1.2+col.d1}s both`,
        transformOrigin:'50% 100%',
      }}/>,
      // Diffuse halo
      <div key={`${i}b`} style={{
        position:'absolute',left:`calc(${col.x} - 18px)`,bottom:'2%',
        width:54,height:170,
        borderRadius:'50%/8% 8% 92% 92%',
        background:'linear-gradient(180deg,rgba(165,65,255,0) 0%,rgba(130,22,215,0.28) 28%,rgba(92,7,168,0.40) 52%,rgba(58,2,115,0.30) 76%,rgba(22,0,52,0) 100%)',
        filter:'blur(20px)',opacity:0,
        animation:`smokeRise${i} 1.4s cubic-bezier(0.15,0,0.45,1) ${1.2+col.d2}s both`,
        transformOrigin:'50% 100%',
      }}/>,
      // Ghost face — appears near apex, fades with smoke
      <div key={`${i}c`} style={{
        position:'absolute',left:col.x,bottom:'4%',
        width:36,height:36,marginLeft:-9,
        opacity:0,
        animation:`ghostFace${i} 1.4s ease-out ${1.2+col.d1}s both`,
        pointerEvents:'none',
      }}>
        <svg viewBox="0 0 36 36" width="36" height="36" style={{overflow:'visible'}}>
          {/* Ghost head — wispy oval */}
          <ellipse cx="18" cy="14" rx="11" ry="13"
            fill="rgba(210,140,255,0.72)"
            style={{filter:'blur(1px)'}}/>
          {/* Hollow eyes */}
          <ellipse cx="13" cy="11" rx="3.5" ry="4.5"
            fill="rgba(15,2,30,0.90)"/>
          <ellipse cx="23" cy="11" rx="3.5" ry="4.5"
            fill="rgba(15,2,30,0.90)"/>
          {/* Eye glow */}
          <ellipse cx="13" cy="11" rx="1.5" ry="2"
            fill="rgba(180,80,255,0.85)"/>
          <ellipse cx="23" cy="11" rx="1.5" ry="2"
            fill="rgba(180,80,255,0.85)"/>
          {/* Anguished open mouth */}
          <ellipse cx="18" cy="20" rx="4" ry="3"
            fill="rgba(10,1,20,0.92)"/>
          {/* Wispy tail */}
          <path d="M 7,24 Q 10,30 14,27 Q 18,32 22,27 Q 26,30 29,24"
            fill="rgba(185,110,255,0.55)" style={{filter:'blur(1.5px)'}}/>
          {/* Outer glow */}
          <ellipse cx="18" cy="15" rx="14" ry="16"
            fill="none" stroke="rgba(200,120,255,0.35)" strokeWidth="3"
            style={{filter:'blur(2px)'}}/>
        </svg>
      </div>
    ])
    // Benign sparkle particles
    :[...'✦✦✦✦'].map((_,i)=>(
      <div key={i} style={{
        position:'absolute',fontSize:18,color:'#fffbe8',
        left:`${20+i*17}%`,bottom:'10%',
        animation:`particleRise 1.0s ease-out ${1.2+i*0.09}s both`,
        opacity:0,
        filter:'drop-shadow(0 0 10px #fffbe8) drop-shadow(0 0 4px #c8a96e)',
      }}>✦</div>
    ));

  return(
    <div style={{
      position:'fixed',inset:0,zIndex:999,
      background:isEvil?'rgba(8,2,14,0.93)':'rgba(4,4,2,0.91)',
      display:'flex',alignItems:'center',justifyContent:'center',
      animation:exiting?'animFadeOut 0.18s ease-in forwards':'animFadeIn 0.12s ease-out forwards',
      overflow:'hidden',
    }}>
      {/* Ambient light burst — fires at 1.2s when flip completes */}
      <div style={{
        position:'absolute',width:320,height:320,borderRadius:'50%',
        background:(isNeutralInspection||isNeutralCard)
          ?'radial-gradient(circle,rgba(140,155,180,0.12) 0%,rgba(70,80,98,0.08) 40%,transparent 70%)'
          :isEvil
          ?'radial-gradient(circle,#7010aa44 0%,#3a0060 40%,transparent 70%)'
          :'radial-gradient(circle,#e8c87a33 0%,#c8a96e22 40%,transparent 70%)',
        animation:'burstPulse 1.0s ease-out 1.15s both',
        pointerEvents:'none',
      }}/>

      {/* ═══ FLOWER BLOOM — pure SVG flowers bloom on both sides for benign cards ═══ */}
      {(isPositiveInspection||(!isInspection&&cardPolarity==='positive'))&&<FlowerBloom/>}

      {/* Rising spirits */}
      <div style={{position:'absolute',inset:0,pointerEvents:'none'}}>{spirits}</div>

      {/* Trigger label — appears after flip */}
      {triggerName&&(
        <div style={{
          position:'absolute',bottom:'12%',left:'50%',transform:'translateX(-50%)',
          fontFamily:"'Cinzel',serif",fontWeight:700,letterSpacing:3,fontSize:13,
          color:isInspection?(inspectionTone==='positive'?'#7ef2aa':inspectionTone==='neutral'?'#c7d3e8':'#e28cff'):(cardPolarity==='negative'?'#c060dd':cardPolarity==='neutral'?'#c7d3e8':'#c8a96e'),
          textShadow:isInspection?(inspectionTone==='positive'?'0 0 16px #2dbf6688':inspectionTone==='neutral'?'0 0 16px #8fa0bf66':'0 0 16px #9020cc88'):(cardPolarity==='negative'?'0 0 16px #9020cc88':cardPolarity==='neutral'?'0 0 16px #8fa0bf66':'0 0 16px #c8a96e88'),
          textTransform:'uppercase',whiteSpace:'nowrap',
          animation:'animFadeIn 0.4s ease-out 1.2s both',
        }}>{triggerName} 翻开卡牌</div>
      )}

      {/* Card wrapper: rises + flips */}
      <div style={{animation:'cardRise 1.2s cubic-bezier(0.15,0,0.35,1) forwards',perspective:700}}>
        <div style={{
          width:130,height:175,position:'relative',
          transformStyle:'preserve-3d',
          animation:'cardFlip 1.2s cubic-bezier(0.2,0,0.3,1) forwards',
        }}>
          {/* BACK face */}
          <div style={{
            position:'absolute',inset:0,backfaceVisibility:'hidden',transform:'rotateY(180deg)',
            background:'#0e0a06',border:'2px solid #6a4a20',borderRadius:5,
            display:'flex',alignItems:'center',justifyContent:'center',
            boxShadow:'0 0 20px #0a0600',
          }}>
            <div style={{position:'absolute',inset:6,border:'1px solid #3a2810',borderRadius:3}}/>
            <div style={{position:'absolute',inset:12,border:'1px solid #2a1a08',borderRadius:2}}/>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:36,color:'#5a3810',lineHeight:1,filter:'drop-shadow(0 0 6px #3a2010)'}}>✦</div>
              <div style={{fontSize:11,color:'#a07838',fontFamily:"'Cinzel',serif",letterSpacing:2,marginTop:4}}>ARCANA</div>
            </div>
            <div style={{position:'absolute',top:6,left:8,fontSize:8,color:'#a07838'}}>✦</div>
            <div style={{position:'absolute',top:6,right:8,fontSize:8,color:'#a07838'}}>✦</div>
            <div style={{position:'absolute',bottom:6,left:8,fontSize:8,color:'#a07838'}}>✦</div>
            <div style={{position:'absolute',bottom:6,right:8,fontSize:8,color:'#a07838'}}>✦</div>
          </div>
          {/* FRONT face */}
          <div style={{
            position:'absolute',inset:0,backfaceVisibility:'hidden',
            background:s.bg,border:`2px solid ${s.borderBright}`,borderRadius:5,
            padding:'12px 10px',
            boxShadow:(isNeutralInspection||isNeutralCard)?'0 0 18px rgba(120,136,155,0.22)':`0 0 30px ${s.glow}88, 0 0 60px ${isEvil?'#6010aa':'#c8a96e'}44`,
          }}>
            <div style={{position:'absolute',top:4,right:6,fontSize:8,color:s.border,opacity:0.7}}>✦</div>
            <div style={{fontFamily:"'Cinzel',serif",fontWeight:700,color:s.text,fontSize:isInspection?18:28,lineHeight:1,letterSpacing:isInspection?2:0}}>{isInspection?'检定':card.key}</div>
            <div style={{fontFamily:"'Cinzel',serif",color:isInspection?s.text:'#c8a96e',fontSize:isInspection?16:11.5,fontWeight:600,marginTop:6,lineHeight:1.3}}>{card.name}</div>
            <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:isInspection?(inspectionTone==='positive'?'#aeeac0':inspectionTone==='neutral'?'#b8c4d8':'#e2a8e8'):'#b89858',fontSize:9.5,marginTop:8,lineHeight:1.4}}>{isInspection?getInspectionCardDesc(card):card.desc}</div>
            {isInspection&&(
              <div style={{position:'absolute',left:10,bottom:10,fontSize:9,color:s.border,letterSpacing:2,fontFamily:"'Cinzel',serif"}}>
                {inspectionTone==='positive'?'正面检定':inspectionTone==='neutral'?'中性检定':'负面检定'}
              </div>
            )}
            <div style={{position:'absolute',bottom:4,left:'50%',transform:'translateX(-50%)',color:s.border,fontSize:7,opacity:0.5}}>— ✦ —</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Knife Effect (per-character HP damage) ────────────────────
function KnifeEffect({targets}){
  if(!targets||!targets.length)return null;
  return(
    <div style={{position:'fixed',inset:0,zIndex:485,pointerEvents:'none',overflow:'hidden'}}>
      {targets.map(({pi,cx,cy,animKey},idx)=>{
        const delay=(idx*0.08).toFixed(2)+'s';
        const hitDelay=(idx*0.08+0.28).toFixed(2)+'s';
        const startX=window.innerWidth/2;
        const startY=window.innerHeight/2;
        const txPx=cx-startX;
        const tyPx=cy-startY;
        const angle=Math.atan2(tyPx,txPx)*180/Math.PI;
        return(
          <React.Fragment key={animKey||`${pi}-${idx}`}>
            <div style={{
              position:'absolute',left:startX,top:startY,
              width:32,height:32,marginLeft:-16,marginTop:-16,
              fontSize:32,lineHeight:1,textAlign:'center',
              filter:'drop-shadow(0 0 4px rgba(200,50,50,0.7))',
              '--tx':`${txPx}px`,'--ty':`${tyPx}px`,'--angle':`${angle}deg`,
              animation:`knifeStrikeGlobal 0.28s cubic-bezier(0.2,0,0.8,1) ${delay} both`,
              transformOrigin:'center center',
            }}>🗡️</div>
            <div style={{
              position:'absolute',left:cx,top:cy,
              width:80,height:80,marginLeft:-40,marginTop:-40,
              background:'radial-gradient(circle,rgba(200,30,30,0.45) 0%,transparent 70%)',
              borderRadius:'inherit',
              animation:'hitFlashGlobal 0.3s ease-out '+hitDelay+' both',
              opacity:0,
            }}/>
            {[{x:30,y:40,s:1.1},{x:55,y:25,s:0.8},{x:70,y:55,s:1.3},{x:20,y:60,s:0.7},{x:45,y:70,s:1.0},{x:65,y:35,s:0.9}].map((d,i)=>(
              <div key={i} style={{
                position:'absolute',
                left:cx-40+d.x*0.8,top:cy-40+d.y*0.8,
                width:Math.round(5*d.s),height:Math.round(8*d.s),
                borderRadius:'50% 50% 55% 55%',
                background:'radial-gradient(ellipse,#cc1010 0%,#880808 70%)',
                animation:`bloodDrop 0.55s ease-out ${(idx*0.08+0.26+i*0.028).toFixed(2)}s both`,
                opacity:0,
                transform:'translateY(-12px)',
              }}/>
            ))}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Discard Move Overlay ──────────────────────────────────────
// Shows a card-back flying from the actor's hand area to the discard pile
function DiscardMoveOverlay({anim,exiting}){
  if(!anim)return null;
  const card=anim.card||null;
  const s=card&&CS[card.letter]?CS[card.letter]:null;
  const targetPid=anim.targetPid||0;

  // Compute start and end positions using actual DOM elements
  const [cardStyle, setCardStyle] = React.useState({});
  
  React.useEffect(() => {
    // Find actual discard pile position via DOM query
    const discardEl = document.querySelector('[data-discard-pile]');
    let discardX, discardY;
    if(discardEl){
      const dr = discardEl.getBoundingClientRect();
      discardX = dr.left + dr.width/2;
      discardY = dr.top + dr.height/2;
    } else {
      discardX = window.innerWidth * 0.35;
      discardY = window.innerHeight * 0.50;
    }
    
    let startX, startY;
    if(targetPid===0){
      const handEl = document.querySelector('[data-hand-area]');
      if(handEl){
        const hr = handEl.getBoundingClientRect();
        startX = hr.left + hr.width/2;
        startY = hr.top + hr.height/2;
      } else {
        startX = window.innerWidth * 0.5;
        startY = window.innerHeight * 0.8;
      }
    } else {
      const el=document.querySelector(`[data-pid="${targetPid}"]`);
      if(el){
        const r=el.getBoundingClientRect();
        startX=r.left+r.width/2;
        startY=r.top+r.height*0.74;
      }else{
        startX = window.innerWidth * 0.5;
        startY = window.innerHeight * 0.25;
      }
    }
    
    if (startX && startY) {
      const tx = discardX - startX;
      const ty = discardY - startY;
      
      setCardStyle({
        position: 'absolute',
        left: startX,
        top: startY,
        transform: 'translate(-50%, -50%) scale(1)',
        width: 62,
        height: 84,
        borderRadius: 4,
        background: s?s.bg:'linear-gradient(135deg,#1e1208,#0e0804)',
        border: s?`1.5px solid ${s.borderBright}`:'1.5px solid #4a3010',
        boxShadow: '0 6px 24px rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: `discardCardFlyCustom 1.0s cubic-bezier(0.4,0,0.3,1) forwards`,
        '--tx': `${tx}px`,
        '--ty': `${ty}px`
      });
    }
  }, [anim, targetPid, s]);

  return(
    <div style={{position:'fixed',inset:0,zIndex:990,pointerEvents:'none',
      animation:exiting?'animFadeOut 0.18s ease-in forwards':'none',
    }}>
      {/* Subtle bg dim */}
      <div style={{position:'absolute',inset:0,background:'rgba(4,2,0,0.35)',animation:'discardBgFade 1.0s ease both'}}/>
      {/* Flying card */}
      {Object.keys(cardStyle).length > 0 && (
        <div style={cardStyle}>
          {card&&s&&<div style={{fontFamily:"'Cinzel',serif",fontWeight:700,color:s.text,fontSize:18}}>{card.key}</div>}
          {(!card||!s)&&<div style={{position:'absolute',inset:0,borderRadius:4,
            background:'repeating-linear-gradient(45deg,#2a1a0820 0px,#2a1a0820 1px,transparent 1px,transparent 4px)'}}/>}
        </div>
      )}
    </div>
  );
}

// ── Card Transfer Overlay (hand cards flying to dest) ───────────
// Receives pre-measured positions from parent useEffect([anim])
function CardTransferOverlay({transfers}){
  if(!transfers||!transfers.length)return null;
  return(
    <div style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:480,overflow:'hidden'}}>
      {transfers.flatMap(({srcX,srcY,destX,destY,count,key})=>
        Array.from({length:count}).map((_,idx)=>{
          const ox=(idx-(count-1)/2)*14;
          const oy=idx*(-4);
          const txPx=destX-srcX+ox;
          const tyPx=destY-srcY+oy;
          return(
            <div key={`${key}-${idx}`} style={{
              position:'absolute',
              left:srcX,top:srcY,
              width:28,height:40,marginLeft:-14,marginTop:-20,
              background:'linear-gradient(135deg,#2e1c0a,#1a0e06)',
              border:'1.5px solid #6a4020',
              borderRadius:3,
              boxShadow:'0 2px 8px rgba(0,0,0,0.6)',
              '--tx':`${txPx}px`,'--ty':`${tyPx}px`,
              animation:`cardTransferFly 0.62s cubic-bezier(0.25,0,0.35,1) ${idx*0.07}s both`,
              zIndex:481+idx,
            }}>
              <div style={{
                position:'absolute',inset:0,borderRadius:3,
                background:'repeating-linear-gradient(45deg,#3a2010 0px,#3a2010 1px,transparent 1px,transparent 5px)',
                opacity:0.4,
              }}/>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Generic Overlay Anim ──────────────────────────────────────
const ANIM_CFG={
  // HP_DAMAGE handled via per-character KnifeEffect, no fullscreen overlay needed
  // SAN_DAMAGE: per-panel only, no fullscreen cfg
  HP_HEAL:      {overlay:'rgba(3,12,3,0.90)', accent:'#4ade80', icon:'✚',  title:'创伤愈合',  shake:false},
  SAN_HEAL:     {overlay:'rgba(8,3,18,0.90)', accent:'#a78bfa', icon:'☯',  title:'心神平复',  shake:false},
  // SKILL_SWAP/HUNT/BEWITCH use dedicated overlay components, not GenericAnimOverlay
  // DISCARD uses DiscardMoveOverlay, not GenericAnimOverlay
  DEATH:        {overlay:'rgba(12,2,2,0.96)', accent:'#ff2020', icon:'☠',  title:'死亡降临',  shake:false},
  EARTHQUAKE:   {overlay:'rgba(10,8,5,0.92)', accent:'#d4b468', icon:'⚡',  title:'地动山摇',  shake:true},
};
function GenericAnimOverlay({anim,exiting}){
  if(!anim)return null;
  if(['HP_DAMAGE','HP_HEAL','SAN_HEAL','SAN_DAMAGE'].includes(anim.type))return null;
  const cfg=ANIM_CFG[anim.type];
  if(!cfg)return null;
  const msgs=(anim.msgs||[]).slice(-4);
  
  // 地动山摇专属效果
  const isEarthquake=anim.type==='EARTHQUAKE';
  
  return(
    <div style={{
      position:'fixed',inset:0,zIndex:999,
      background:cfg.overlay,
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      animation:exiting?'animFadeOut 0.18s ease-in forwards':'animFadeIn 0.12s ease-out forwards',
      ...(isEarthquake&&{
        animation:'earthquakeShake 1.2s ease-in-out, earthquakeFlash 0.15s ease-in-out 3',
        filter:isEarthquake?'grayscale(0%)':'none',
      }),
    }}>
      {cfg.vig&&<div style={{position:'absolute',inset:0,boxShadow:`inset 0 0 120px ${cfg.accent}55`,animation:'animVig 0.6s ease-in-out',pointerEvents:'none'}}/>}
      
      {/* 地动山摇石块效果 */}
      {isEarthquake&&Array.from({length:8}).map((_,i)=>(
        <div key={i} style={{
          position:'absolute',
          width:10+Math.random()*20,
          height:10+Math.random()*20,
          background:'#8a6a40',
          borderRadius:Math.random()*5,
          left:Math.random()*100+'%',
          top:-30,
          animation:`rockFall ${0.8+Math.random()*0.4}s ease-in forwards`,
          animationDelay:Math.random()*0.5+'s',
          zIndex:1000,
        }}/>
      ))}
      
      <div style={{
        fontSize:80,lineHeight:1,marginBottom:12,
        textShadow:`0 0 40px ${cfg.accent}, 0 0 80px ${cfg.accent}66`,
        animation:cfg.shake?'animShake 0.45s ease-in-out':'animPop 0.4s ease-out',
        filter:`drop-shadow(0 0 20px ${cfg.accent})`,
      }}>{cfg.icon}</div>
      <div style={{
        fontFamily:"'Cinzel',serif",fontWeight:700,letterSpacing:5,fontSize:20,
        color:cfg.accent,textShadow:`0 0 24px ${cfg.accent}`,
        marginBottom:18,textTransform:'uppercase',
      }}>{cfg.title}</div>
      {msgs.length>0&&(
        <div style={{
          background:'rgba(0,0,0,0.6)',border:`1px solid ${cfg.accent}44`,borderRadius:4,
          padding:'10px 24px',maxWidth:380,textAlign:'center',
        }}>
          {msgs.map((m,i)=>(
            <div key={i} style={{
              fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',
              color:'#c8a96e',fontSize:12.5,lineHeight:1.8,opacity:0.9,
            }}>{m}</div>
          ))}
        </div>
      )}
    </div>
  );
}


// ── Dice Roll Animation ───────────────────────────────────────
const DICE_FACES=['⚀','⚁','⚂','⚃','⚄','⚅'];
function DiceRollAnim({anim,exiting}){
  const{d1,d2,heal,rollerName,dodgeSuccess}=anim;
  const [frame,setFrame]=React.useState(0);
  const [settled,setSettled]=React.useState(false);
  React.useEffect(()=>{
    const FRAMES=12; let i=0;
    const iv=setInterval(()=>{
      i++;
      setFrame(f=>f+1);
      if(i>=FRAMES){clearInterval(iv);setSettled(true);}
    },100);
    return()=>clearInterval(iv);
  },[]);
  const face1=settled?DICE_FACES[d1-1]:DICE_FACES[Math.floor(Math.random()*6)];
  const face2=settled?DICE_FACES[d2-1]:DICE_FACES[Math.floor(Math.random()*6)];
  const winner=Math.max(d1,d2);
  const isDodgeRoll=d2===0;
  return(
    <div style={{
      position:'fixed',inset:0,zIndex:999,background:'rgba(4,2,0,0.94)',
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      animation:exiting?'animFadeOut 0.18s ease-in forwards':'animFadeIn 0.12s ease-out forwards',
    }}>
      <div style={{position:'absolute',inset:0,boxShadow:'inset 0 0 120px #c8a96e22',pointerEvents:'none'}}/>
      <div style={{fontFamily:"'Cinzel',serif",color:'#b89858',fontSize:11,letterSpacing:4,marginBottom:18,textTransform:'uppercase'}}>
        {rollerName||'？'} {isDodgeRoll?'掷骰子':'选择休息'}
      </div>
      <div style={{display:'flex',gap:36,marginBottom:20}}>
        {[{face:face1,val:d1},...(!isDodgeRoll?[{face:face2,val:d2}]:[])].map(({face,val},i)=>(
          <div key={i} style={{
            fontSize:88,lineHeight:1,
            color:'#c8a96e',
            textShadow:settled?`0 0 30px #c8a96e88, 0 0 60px #8a6030`:'0 0 10px #c8a96e44',
            filter:settled?'drop-shadow(0 0 12px #c8a96e88)':'none',
            animation:settled?'animPop 0.3s ease-out':'',
            transition:'text-shadow 0.3s, filter 0.3s',
          }}>{face}</div>
        ))}
      </div>
      {settled&&(
        <div style={{animation:'animFadeIn 0.3s ease-out'}}>
          {isDodgeRoll ? (
            <>
              <div style={{
                fontFamily:"'Cinzel',serif",fontSize:13,color:dodgeSuccess?'#4ade80':'#e08888',letterSpacing:3,
                textAlign:'center',marginBottom:6,
              }}>
                {dodgeSuccess?'成功规避负面效果！':'未能规避，触发负面效果！'}
              </div>
              <div style={{fontFamily:"'IM Fell English',serif",fontStyle:'italic',color:'#6a9a6a',fontSize:12,textAlign:'center',letterSpacing:1}}>
                掷出 {d1} 点，{d1>=4?'规避成功':'规避失败'}
              </div>
            </>
          ) : (
            <>
              <div style={{
                fontFamily:"'Cinzel',serif",fontSize:13,color:'#c8a96e',letterSpacing:3,
                textAlign:'center',marginBottom:6,
              }}>
                取最大值 <span style={{color:'#4ade80',fontSize:18,fontWeight:700}}>{winner}</span>
              </div>
              <div style={{fontFamily:"'IM Fell English',serif",fontStyle:'italic',color:'#6a9a6a',fontSize:12,textAlign:'center',letterSpacing:1}}>
                回复 {winner} HP，翻面休息中…
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
function YourTurnAnim({name}){
  const text=name?`${name}的回合`:'你的回合';
  const col=name?'#c8a0e8':'#e8c87a';
  const glow=name?'#a080d099':'#c8a96e99';
  const glow2=name?'#a080d044':'#c8a96e44';
  return(
    <div style={{position:'fixed',inset:0,zIndex:2500,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
      <div style={{
        fontFamily:"'Cinzel Decorative','Cinzel',serif",
        fontSize:32,fontWeight:700,letterSpacing:8,
        color:col,
        textShadow:`0 0 40px ${glow}, 0 0 80px ${glow2}`,
        animation:'yourTurnFade 2.0s ease-in-out forwards',
        whiteSpace:'nowrap',
      }}>{text}</div>
    </div>
  );
}

// 确保将此组件定义在所有其他组件的【外部】，防止重新渲染时被销毁重置
function TitleCandleFlames() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    let animationFrameId;
    let lastTime = performance.now();
    const fps = 12; // 火焰动画帧率，可以根据需要调整 (10-15比较自然)
    const interval = 1000 / fps;

    const animate = (time) => {
      if (time - lastTime >= interval) {
        // 【修复1：必须使用函数式更新 prev => prev + 1，破解闭包陷阱】
        setFrame(prev => (prev + 1) % 16); 
        lastTime = time;
      }
      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    // 组件卸载时清理动画帧
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  // 4x4 序列帧，计算当前所在的列和行
  const col = frame % 4;
  const row = Math.floor(frame / 4);

  // 生成随机烛火位置
  const candlePositions = React.useMemo(() => {
    const positions = [];
    // 左侧烛火
    for (let i = 0; i < 7; i++) {
      const distance = Math.random(); // 0-1，0表示最近，1表示最远
      positions.push({
        side: 'left',
        x: -120 - Math.random() * 120,
        y: 60 - distance * 120, // 近处的烛火更低（位置偏下）
        scale: 0.5 + (1 - distance) * 0.6, // 近处的烛火更大
        distance: distance,
        delay: Math.random() * 2 // 随机初始延迟，错开动画
      });
    }
    // 右侧烛火
    for (let i = 0; i < 7; i++) {
      const distance = Math.random(); // 0-1，0表示最近，1表示最远
      positions.push({
        side: 'right',
        x: 120 + Math.random() * 120,
        y: 60 - distance * 120, // 近处的烛火更低（位置偏下）
        scale: 0.5 + (1 - distance) * 0.6, // 近处的烛火更大
        distance: distance,
        delay: Math.random() * 2 // 随机初始延迟，错开动画
      });
    }
    // 按距离排序，近处的烛火排在后面，显示层级更高
    return positions.sort((a, b) => a.distance - b.distance);
  }, []);

  // 为每个烛火生成随机的初始帧偏移
  const getFrameOffset = (delay) => {
    return Math.floor((delay / 2) * 16) % 16; // 2秒周期，16帧
  };

  const flameStyle = {
    position: 'absolute',
    width: '48px',  // 火焰的实际显示宽度
    height: '48px', // 火焰的实际显示高度（128*128每帧，缩小到48*48）
    backgroundImage: `url('/img/title_candle.png')`,
    
    // 4x4的图，背景尺寸必须是容器的 400%
    backgroundSize: '400% 400%', 
    
    pointerEvents: 'none',
    maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0) 75%)',
    WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0) 75%)',
  };

  const glowStyle = {
    position: 'absolute',
    width: '32px', // 缩小到70%
    height: '32px', // 缩小到70%
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(255,190,90,0.03) 0%, rgba(255,145,40,0.01) 40%, rgba(0,0,0,0) 76%)', // 透明度减半
    filter: 'blur(4px)', // 模糊效果也相应缩小
    pointerEvents: 'none',
  };

  return (
    <>
      {/* 主烛火和光晕 */}
      {/* 左侧主烛火 */}
      <div style={{ 
        ...glowStyle, 
        top: '50%', 
        left: 'calc(50% - 120px)', 
        transform: 'translate(-50%, -40%)', // 光晕中心点在烛火中心点略偏下
        zIndex: 0
      }} />
      <div style={{ 
        ...flameStyle, 
        top: '50%', 
        left: 'calc(50% - 120px)', 
        transform: 'translate(-50%, -50%)',
        backgroundPosition: `${(col / 3) * 100}% ${(row / 3) * 100}%`,
        zIndex: 1,
        opacity: 0.85
      }} />
      {/* 右侧主烛火 */}
      <div style={{ 
        ...glowStyle, 
        top: '50%', 
        right: 'calc(50% - 120px)', 
        transform: 'translate(50%, -40%)', // 光晕中心点在烛火中心点略偏下
        zIndex: 0
      }} />
      <div style={{ 
        ...flameStyle, 
        top: '50%', 
        right: 'calc(50% - 120px)', 
        transform: 'translate(50%, -50%)',
        backgroundPosition: `${(col / 3) * 100}% ${(row / 3) * 100}%`,
        zIndex: 1,
        opacity: 0.85
      }} />
      
      {/* 随机散布的烛火 */}
      {candlePositions.map((pos, index) => {
        // 为每个烛火计算独立的帧位置
        const frameOffset = getFrameOffset(pos.delay);
        const offsetCol = (frame + frameOffset) % 4;
        const offsetRow = Math.floor((frame + frameOffset) / 4);
        
        return (
          <React.Fragment key={index}>
            <div style={{ 
              ...glowStyle, 
              top: `calc(50% + ${pos.y}px)`, 
              left: pos.side === 'left' ? `calc(50% + ${pos.x}px)` : `calc(50% + ${pos.x}px)`, 
              transform: `translate(-50%, -40%) scale(${pos.scale})`, // 光晕中心点在烛火中心点略偏下
              opacity: 0.3 + (1 - pos.distance) * 0.5, // 近处的光晕更亮
              zIndex: Math.floor((1 - pos.distance) * 5), // 近处的光晕层级更高
              animation: `titleFlameGlow 3.5s ease-in-out ${pos.delay}s infinite` // 错开呼吸动画
            }} />
            <div style={{ 
              ...flameStyle, 
              top: `calc(50% + ${pos.y}px)`, 
              left: pos.side === 'left' ? `calc(50% + ${pos.x}px)` : `calc(50% + ${pos.x}px)`, 
              transform: `translate(-50%, -50%) scale(${pos.scale})`,
              backgroundPosition: `${(offsetCol / 3) * 100}% ${(offsetRow / 3) * 100}%`, // 错开序列帧
              opacity: 0.5 + (1 - pos.distance) * 0.4, // 近处的烛火更亮
              zIndex: Math.floor((1 - pos.distance) * 5) + 1, // 近处的烛火层级更高
              animation: `titleFlameFlicker 3.5s linear ${pos.delay}s infinite` // 错开呼吸动画
            }} />
          </React.Fragment>
        );
      })}
    </>
  );
}

// ── Slice Death Animation ────────────────────────────────
// SliceAnim now receives pre-measured targets from parent useEffect (same as HuntScope)
function GuillotineAnim({targets}){
  const[phase,setPhase]=React.useState('slice'); // slice, slide

  React.useEffect(()=>{
    const t1=setTimeout(()=>setPhase('slide'),180);
    return()=>{clearTimeout(t1);};
  },[]);

  if(!targets||!targets.length)return null;

  return(
    <div style={{position:'fixed',inset:0,zIndex:1400,pointerEvents:'none',overflow:'hidden'}}>
      <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0)',animation:'guillotineVig 1.1s ease-in-out forwards'}}/>
      {targets.map((t,ti)=>{
        const hasSnapshot=!!t.snapshotUrl;
        return(
          <React.Fragment key={ti}>
            {phase==='slice'&&(
              <div style={{
                position:'absolute',
                left:t.x,top:t.y,width:t.w,height:t.h,
                overflow:'hidden',
                borderRadius:3,
              }}>
                {hasSnapshot&&(
                  <div style={{
                    position:'absolute',
                    inset:0,
                    backgroundImage:`url(${t.snapshotUrl})`,
                    backgroundSize:'100% 100%',
                    backgroundPosition:'center',
                    filter:'brightness(0.92) saturate(0.95)',
                    opacity:0.96,
                  }}/>
                )}
                <div style={{
                  position:'absolute',
                  left:-t.w,top:-t.h,width:t.w*3,height:t.h*3,
                  transform:`rotate(30deg)`,
                  background:'linear-gradient(90deg, transparent 0%, rgba(255,0,0,0.8) 50%, transparent 100%)',
                  animation:'sliceEffect 0.5s ease-out forwards',
                }}/>
                <div style={{
                  position:'absolute',
                  left:t.x-10,top:t.y-10,width:t.w+20,height:t.h+20,
                  background:'radial-gradient(ellipse at center, rgba(255,255,255,0.8) 0%, rgba(255,100,100,0.6) 50%, transparent 100%)',
                  animation:'sliceFlash 0.3s ease-out forwards',
                }}/>
                <div style={{
                  position:'absolute',
                  left:t.x-20,top:t.y-20,width:t.w+40,height:t.h+40,
                  background:'radial-gradient(ellipse at center, rgba(180,10,10,0.4) 0%, rgba(80,0,0,0.1) 60%, transparent 100%)',
                  animation:'bloodSpread 1s ease-out forwards',
                }}/>
              </div>
            )}
            {phase==='slide'&&(
              <>
                <div style={{
                  position:'absolute',
                  left:t.x,top:t.y,width:t.w,height:t.h/2,
                  overflow:'hidden',
                  borderTopLeftRadius:3,
                  borderTopRightRadius:3,
                  animation:'slideUp 0.82s cubic-bezier(0.08,0.82,0.22,1) forwards',
                  boxShadow:hasSnapshot?'0 6px 18px rgba(0,0,0,0.28)':'none',
                }}>
                  {hasSnapshot?(
                    <div style={{
                      position:'absolute',
                      inset:0,
                      backgroundImage:`url(${t.snapshotUrl})`,
                      backgroundSize:`${t.w}px ${t.h}px`,
                      backgroundPosition:'center top',
                      backgroundRepeat:'no-repeat',
                    }}/>
                  ):(
                    <div style={{
                      position:'absolute',
                      inset:0,
                      background:'linear-gradient(135deg, rgba(255,100,100,0.3) 0%, rgba(255,0,0,0.2) 100%)',
                    }}/>
                  )}
                </div>
                <div style={{
                  position:'absolute',
                  left:t.x,top:t.y+t.h/2,width:t.w,height:t.h/2,
                  overflow:'hidden',
                  borderBottomLeftRadius:3,
                  borderBottomRightRadius:3,
                  animation:'slideDown 0.86s cubic-bezier(0.08,0.82,0.24,1) forwards',
                  boxShadow:hasSnapshot?'0 6px 18px rgba(0,0,0,0.28)':'none',
                }}>
                  {hasSnapshot?(
                    <div style={{
                      position:'absolute',
                      left:0,
                      top:-t.h/2,
                      width:t.w,
                      height:t.h,
                      backgroundImage:`url(${t.snapshotUrl})`,
                      backgroundSize:`${t.w}px ${t.h}px`,
                      backgroundPosition:'center top',
                      backgroundRepeat:'no-repeat',
                    }}/>
                  ):(
                    <div style={{
                      position:'absolute',
                      inset:0,
                      background:'linear-gradient(135deg, rgba(255,100,100,0.3) 0%, rgba(255,0,0,0.2) 100%)',
                    }}/>
                  )}
                </div>
                {hasSnapshot&&(
                  <>
                    <div style={{
                      position:'absolute',
                      left:t.x,
                      top:t.y+(t.h/2)-1,
                      width:t.w,
                      height:2,
                      background:'linear-gradient(90deg, transparent 0%, rgba(255,230,230,0.95) 50%, transparent 100%)',
                      boxShadow:'0 0 12px rgba(255,80,80,0.8)',
                    }}/>
                    <div style={{
                      position:'absolute',
                      left:t.x-10,
                      top:t.y-10,
                      width:t.w+20,
                      height:t.h+20,
                      background:'radial-gradient(ellipse at center, rgba(180,10,10,0.22) 0%, rgba(80,0,0,0.08) 58%, transparent 100%)',
                      animation:'bloodSpread 1s ease-out forwards',
                    }}/>
                  </>
                )}
              </>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
// ── God Resurrection Animation (邪祀者 win) ────────────────────
function GodResurrectionAnim({onDone}){
  const [textPhase, setTextPhase] = useState(0); // 0: black, 1: transitioning, 2: red with blood
  
  useEffect(()=>{
    // 文字动画时序：0.5秒后开始从黑变红，2秒后显示滴血效果
    const textTimer1 = setTimeout(() => setTextPhase(1), 500);
    const textTimer2 = setTimeout(() => setTextPhase(2), 2000);
    
    // 视频播放完成后自动调用onDone
    const videoElement=document.getElementById('god-resurrection-video');
    if(videoElement){
      videoElement.onended=()=>{
        onDone&&onDone();
      };
      
      // 8秒后如果视频还没结束，强制调用onDone（给视频足够播放时间）
      const timeoutId=setTimeout(()=>{
        onDone&&onDone();
      },8000);
      
      return()=>{
        clearTimeout(timeoutId);
        clearTimeout(textTimer1);
        clearTimeout(textTimer2);
      };
    }
  },[onDone]);
  
  // 文字颜色根据阶段变化
  const getTitleColor = () => {
    if (textPhase === 0) return '#1a0a0a';
    if (textPhase === 1) return '#5a1a1a';
    return '#c01030';
  };
  
  const getSubtitleColor = () => {
    if (textPhase === 0) return '#0a0505';
    if (textPhase === 1) return '#3a1010';
    return '#e03050';
  };
  
  return(
    <div style={{position:'fixed',inset:0,zIndex:4000,display:'flex',flexDirection:'column',
      alignItems:'center',justifyContent:'center',
      background:'rgba(0,0,0,0.95)',
      backdropFilter:'blur(2px)',
      animation:'animFadeIn 0.35s ease-out'}}>
      {/* 视频背景 */}
      <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
        <video 
          id="god-resurrection-video"
          src="/videos/ancient_god_tentacles.mp4" 
          autoPlay 
          muted
          playsInline
          style={{
            width:'100vw',
            height:'100vh',
            objectFit:'cover',
            filter:'brightness(0.7) contrast(1.2)'
          }}
        />
      </div>
      
      {/* 文字叠加 */}
      <div style={{position:'relative',zIndex:1,textAlign:'center',animation:'animFadeIn 0.5s 0.1s both'}}>
        <div 
          className={textPhase === 2 ? 'blood-drip-text' : ''}
          style={{
            fontFamily:"'Cinzel Decorative','Cinzel',serif",
            fontSize:48,
            fontWeight:700,
            letterSpacing:4,
            color:getTitleColor(),
            textShadow:textPhase === 2 ? '0 0 40px #b0306088, 0 4px 8px rgba(0,0,0,0.8)' : '0 0 40px #b0306088',
            marginBottom:16,
            animation:'animPop 0.8s ease-out',
            transition:'color 1.5s ease-in-out, text-shadow 0.5s ease',
            position:'relative'
          }}
        >
          ✦ 邪神复活 ✦
          {textPhase === 2 && (
            <>
              <span className="blood-drop" style={{left:'20%'}} />
              <span className="blood-drop" style={{left:'50%', animationDelay:'0.3s'}} />
              <span className="blood-drop" style={{left:'80%', animationDelay:'0.6s'}} />
            </>
          )}
        </div>
        <div style={{
          fontFamily:"'IM Fell English','Georgia',serif",
          fontStyle:'italic',
          color:getSubtitleColor(),
          fontSize:20,
          letterSpacing:1,
          textShadow:'0 0 20px #d0609066',
          animation:'animFadeIn 1s 0.5s both',
          transition:'color 1.5s ease-in-out'
        }}>
          邪祀者的献祭唤醒了古神！
        </div>
      </div>
    </div>
  );
}

// ── Treasure Map Win Animation (寻宝者 win, single unified impl) ─────────────
function TreasureMapAnim({hand,onConfirm}){
  // Compute the minimal ordered set of cards that covers all 4 letters AND 4 numbers
  const LETTERS_ALL=['A','B','C','D'],NUMS_ALL=[1,2,3,4];
  function pickWinCards(h){
    const nonGod=h.filter(c=>!c.isGod);
    const chosen=[];
    const ls=new Set(),ns=new Set();
    // Greedy: repeatedly pick card with most new coverage
    const rem=[...nonGod];
    while((ls.size<4||ns.size<4)&&rem.length){
      let bestIdx=0,bestScore=-1;
      rem.forEach((c,i)=>{
        const gain=(!ls.has(c.letter)?1:0)+(!ns.has(c.number)?1:0);
        if(gain>bestScore){bestScore=gain;bestIdx=i;}
      });
      const pick=rem.splice(bestIdx,1)[0];
      chosen.push(pick);
      ls.add(pick.letter);ns.add(pick.number);
    }
    return chosen;
  }
  const winCards=pickWinCards(hand);
  const N=winCards.length; // 4 to 8
  // Phase: 0=init, 1..N = card N flies in, N+1=all in (glow builds), N+2=flash, N+3=map revealed, N+4=button shown
  const [phase,setPhase]=useState(0);
  const [fired,setFired]=useState(false);
  useEffect(()=>{
    if(fired)return;setFired(true);
    const ts=[];
    let t=300;
    for(let i=1;i<=N;i++){const _i=i;ts.push(setTimeout(()=>setPhase(_i),t));t+=350;}
    ts.push(setTimeout(()=>setPhase(N+1),t));t+=800; // all assembled, glow
    ts.push(setTimeout(()=>setPhase(N+2),t));t+=500; // flash
    ts.push(setTimeout(()=>setPhase(N+3),t));t+=600; // map
    ts.push(setTimeout(()=>setPhase(N+4),t));        // button
    return()=>ts.forEach(clearTimeout);
  },[]);
  // Layout: cards in a grid, max 4 per row
  const COLS=Math.min(N,4),ROWS=Math.ceil(N/COLS);
  const CW=72,CH=96,GAP=8;
  const gridW=COLS*(CW+GAP)-GAP, gridH=ROWS*(CH+GAP)-GAP;
  // Scatter origins (8 corners/edges)
  const origins=[
    {x:-220,y:-170},{x:220,y:-170},{x:-220,y:170},{x:220,y:170},
    {x:0,y:-190},{x:0,y:190},{x:-200,y:0},{x:200,y:0},
  ];
  const allIn=phase>N;
  const glowing=phase===N+1;
  const flashing=phase===N+2;
  const mapRevealed=phase>=N+3;
  const btnVisible=phase>=N+4;
  return(
    <div style={{position:'fixed',inset:0,zIndex:4000,display:'flex',flexDirection:'column',
      alignItems:'center',justifyContent:'center',
      background:flashing?'rgba(255,240,200,0.92)':'rgba(4,3,1,0.92)',
      backdropFilter:'blur(2px)',transition:'background 0.35s ease',
      animation:'animFadeIn 0.35s ease-out'}}>
      <div style={{textAlign:'center',marginBottom:22,animation:'animFadeIn 0.5s 0.1s both'}}>
        <div style={{fontFamily:"'Cinzel Decorative','Cinzel',serif",fontSize:22,fontWeight:700,
          letterSpacing:4,color:'#c8a96e',textShadow:'0 0 40px #c8a96e88',marginBottom:6}}>
          ✦ 藏宝图已完整 ✦
        </div>
        <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',
          color:'#b89858',fontSize:13,letterSpacing:1}}>
          遗迹的秘密，尽在掌中
        </div>
      </div>
      {/* Card grid / Map area */}
      <div style={{position:'relative',width:gridW,height:gridH,marginBottom:32}}>
        {/* Glow overlay on grid */}
        {(glowing||flashing)&&(
          <div style={{position:'absolute',inset:-12,borderRadius:8,pointerEvents:'none',
            background:flashing?'rgba(255,240,180,0.85)':'rgba(200,169,110,0.10)',
            boxShadow:glowing?'0 0 60px #c8a96ecc, 0 0 120px #c8a96e66':
              flashing?'0 0 120px #fff8e0ff, 0 0 200px #ffffffcc':'none',
            transition:'all 0.5s ease',animation:glowing?'animPop 0.4s ease-out':undefined,
            zIndex:10}}/>
        )}
        {/* Cards */}
        {!mapRevealed&&winCards.map((card,i)=>{
          const col=i%COLS,row=Math.floor(i/COLS);
          const tx=col*(CW+GAP),ty=row*(CH+GAP);
          const arrived=phase>i;
          const orig=origins[i%origins.length];
          const s=CS[card.letter]||GOD_CS;
          return(
            <div key={card.id} style={{
              position:'absolute',left:tx,top:ty,width:CW,height:CH,
              transform:arrived?'translate(0,0)':`translate(${orig.x}px,${orig.y}px)`,
              opacity:arrived?1:0,
              transition:'transform 0.55s cubic-bezier(0.22,1.1,0.36,1), opacity 0.4s ease',
              borderRadius:5,background:s.bg,
              border:`1.5px solid ${allIn?'#c8a96e':s.borderBright}`,
              boxShadow:allIn?`0 0 14px #c8a96e99, 0 0 4px ${s.glow}`:`0 0 4px ${s.glow}`,
              display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
              transition2:'border-color 0.4s, box-shadow 0.4s',
            }}>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:20,fontWeight:700,
                color:s.text,textShadow:`0 0 10px ${s.glow}`}}>{card.letter}{card.number}</div>
              <div style={{fontSize:8,color:s.text,opacity:0.88,fontFamily:"'IM Fell English',serif",
                fontStyle:'italic',textAlign:'center',padding:'0 5px',marginTop:3,lineHeight:1.4}}>
                {card.name}
              </div>
            </div>
          );
        })}
        {/* Treasure map revealed */}
        {mapRevealed&&(
          <div style={{
            position:'absolute',inset:0,borderRadius:8,
            background:'linear-gradient(135deg,#3a2508 0%,#6b4010 35%,#8b5a18 55%,#5a3808 80%,#2a1804 100%)',
            border:'2px solid #c8a96e',
            boxShadow:'0 0 40px #c8a96e88, inset 0 0 30px rgba(0,0,0,0.6)',
            display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
            animation:'animPop 0.5s ease-out',
            overflow:'hidden',
          }}>
            {/* Map decorations */}
            <div style={{position:'absolute',inset:0,opacity:0.15,
              backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 18px,#c8a96e22 18px,#c8a96e22 19px),repeating-linear-gradient(90deg,transparent,transparent 18px,#c8a96e22 18px,#c8a96e22 19px)'}}/>
            <div style={{position:'absolute',top:8,left:12,right:12,bottom:8,
              border:'1px solid #c8a96e44',borderRadius:4,pointerEvents:'none'}}/>
            <div style={{fontSize:48,opacity:0.6,color:'#c8a96e',
              filter:'drop-shadow(0 0 10px #c8a96eaa)',marginBottom:6}}>✦</div>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:'#c8a96e',
              letterSpacing:3,opacity:0.8}}>TREASURE MAP</div>
            <div style={{marginTop:10,display:'flex',gap:5,flexWrap:'wrap',justifyContent:'center'}}>
              {['A1','B2','C3','D4'].map(k=>(
                <div key={k} style={{fontFamily:"'Cinzel',serif",fontSize:9,color:'#8a6020',
                  border:'1px solid #6a4010',borderRadius:2,padding:'1px 5px',background:'#1a0e04'}}>
                  {k}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {btnVisible&&(
        <button onClick={onConfirm}
          style={{padding:'12px 44px',background:'#1c1008',border:'2px solid #c8a96e',
            color:'#e8c87a',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:14,
            borderRadius:2,cursor:'pointer',letterSpacing:3,textTransform:'uppercase',
            boxShadow:'0 0 30px #c8a96e55',animation:'animPop 0.35s ease-out',
            transition:'all .2s'}}
          onMouseEnter={e=>{e.currentTarget.style.background='#2a1a08';e.currentTarget.style.boxShadow='0 0 50px #c8a96e88';}}
          onMouseLeave={e=>{e.currentTarget.style.background='#1c1008';e.currentTarget.style.boxShadow='0 0 30px #c8a96e55';}}
        >✦ 宣布胜利</button>
      )}
    </div>
  );
}

// ── Cthulhu Resurrection Animation (邪祀者 win) ─────────────
function CthulhuResurrectionAnim({onConfirm}){
  // Phase: 0=init, 1=darkness, 2=tentacles emerge, 3=cthulhu appears, 4=glow, 5=button shown
  const [phase,setPhase]=useState(0);
  const [fired,setFired]=useState(false);
  useEffect(()=>{
    if(fired)return;setFired(true);
    const ts=[];
    let t=300;
    ts.push(setTimeout(()=>setPhase(1),t));t+=1000; // darkness
    ts.push(setTimeout(()=>setPhase(2),t));t+=1200; // tentacles emerge
    ts.push(setTimeout(()=>setPhase(3),t));t+=1000; // cthulhu appears
    ts.push(setTimeout(()=>setPhase(4),t));t+=800;  // glow
    ts.push(setTimeout(()=>setPhase(5),t));        // button
    return()=>ts.forEach(clearTimeout);
  },[]);
  const darkness=phase>=1;
  const tentacles=phase>=2;
  const cthulhu=phase>=3;
  const glowing=phase>=4;
  const btnVisible=phase>=5;
  return(
    <div style={{position:'fixed',inset:0,zIndex:4000,display:'flex',flexDirection:'column',
      alignItems:'center',justifyContent:'center',
      background:darkness?'rgba(0,0,0,0.95)':'rgba(4,3,1,0.92)',
      backdropFilter:'blur(3px)',transition:'background 0.5s ease',
      animation:'animFadeIn 0.35s ease-out'}}>
      <div style={{textAlign:'center',marginBottom:32,animation:'animFadeIn 0.5s 0.1s both'}}>
        <div style={{fontFamily:"'Cinzel Decorative','Cinzel',serif",fontSize:22,fontWeight:700,
          letterSpacing:4,color:'#9060cc',textShadow:'0 0 40px #9060cc88',marginBottom:6}}>
          {phase===1?'✦ 黑暗降临 ✦':phase>=2?'✦ 邪神苏醒 ✦':'✦ 邪祀者获胜 ✦'}
        </div>
        <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',
          color:'#7040aa',fontSize:13,letterSpacing:1}}>
          {phase===1?'世界陷入黑暗...':phase>=2?'古老的存在正在苏醒...':'邪祀者的召唤成功了！'}
        </div>
      </div>
      
      {/* Cthulhu resurrection effect */}
      <div style={{position:'relative',width:300,height:300,marginBottom:32}}>
        {/* Tentacles */}
        {tentacles&&(
          <div style={{position:'absolute',inset:0}}>
            {[...Array(8)].map((_,i)=>{
              const angle=(i/8)*Math.PI*2;
              const x=Math.cos(angle)*120+150;
              const y=Math.sin(angle)*120+150;
              return(
                <div key={i} style={{
                  position:'absolute',left:x,top:y,width:40,height:120,
                  background:'linear-gradient(to top, #3a1a5a, #5a2a8a, #7a3aab)',
                  borderRadius:'50% 50% 20% 20%',
                  transformOrigin:'50% 100%',
                  transform:`translate(-50%, 0) rotate(${angle}rad) scaleY(0)`,
                  animation:`tentacleEmerge 1s ease-out ${i*0.1}s forwards`,
                  boxShadow:'0 0 20px #9060cc88',
                }}/>
              );
            })}
          </div>
        )}
        
        {/* Cthulhu head */}
        {cthulhu&&(
          <div style={{
            position:'absolute',left:'50%',top:'50%',
            transform:'translate(-50%, -50%) scale(0)',
            animation:'animPop 0.8s ease-out forwards',
            textAlign:'center',
          }}>
            <div style={{fontSize:120,filter:'drop-shadow(0 0 30px #9060ccaa)'}}>👁️</div>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:18,color:'#9060cc',
              textShadow:'0 0 20px #9060cc88',marginTop:10}}>克苏鲁</div>
          </div>
        )}
        
        {/* Glow */}
        {glowing&&(
          <div style={{position:'absolute',inset:-50,borderRadius:'50%',pointerEvents:'none',
            background:'radial-gradient(circle, rgba(144,96,204,0.2) 0%, rgba(58,26,90,0.1) 40%, rgba(0,0,0,0) 76%)',
            boxShadow:'0 0 80px #9060cc88, 0 0 160px #9060cc44',
            animation:'pulse 2s ease-in-out infinite',
          }}/>
        )}
      </div>
      
      {btnVisible&&(
        <button onClick={onConfirm}
          style={{padding:'12px 44px',background:'#1a0d2e',border:'2px solid #9060cc',
            color:'#c8a0e8',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:14,
            borderRadius:2,cursor:'pointer',letterSpacing:3,textTransform:'uppercase',
            boxShadow:'0 0 30px #9060cc55',animation:'animPop 0.35s ease-out',
            transition:'all .2s'}}
          onMouseEnter={e=>{e.currentTarget.style.background='#2a1a3e';e.currentTarget.style.boxShadow='0 0 50px #9060cc88';}}
          onMouseLeave={e=>{e.currentTarget.style.background='#1a0d2e';e.currentTarget.style.boxShadow='0 0 30px #9060cc55';}}
        >✦ 见证胜利</button>
      )}
    </div>
  );
}

// ── Master Anim Dispatcher ────────────────────────────────────
function AnimOverlay({anim,exiting}){
  if(!anim) return null;
  if(anim.type==='YOUR_TURN') return <YourTurnAnim name={anim.name}/>;
  if(anim.type==='DRAW_CARD') return <CardFlipAnim card={anim.card} triggerName={anim.triggerName} targetPid={anim.targetPid??0} exiting={exiting} skipTravel={!!anim.skipTravel}/>;
  if(anim.type==='DICE_ROLL') return <DiceRollAnim anim={anim} exiting={exiting}/>;
  if(anim.type==='DISCARD') return <DiscardMoveOverlay anim={anim} exiting={exiting}/>
  if(anim.type==='CARD_TRANSFER') return null; // rendered via cardTransfers state
  if(anim.type==='CAVE_DUEL') return <CaveDuelAnim anim={anim} exiting={exiting}/>;
  if(anim.type==='TURN_BOUNDARY_PAUSE') return null;
  if(['HP_DAMAGE','HP_HEAL','SAN_HEAL','SAN_DAMAGE'].includes(anim.type)) return null;
  return <GenericAnimOverlay anim={anim} exiting={exiting}/>;
}

// ── Role Reveal Animation (slot-machine, shown at every game start) ──────────
function RoleRevealAnim({role,onDone}){
  const [offset,setOffset]=useState(0);
  const ITEM_H=46, BEFORE=9;
  const ROLES_CYCLE=['寻宝者','追猎者','邪祀者','邪祀者','寻宝者','追猎者','寻宝者','邪祀者','追猎者'];
  const items=[...ROLES_CYCLE.slice(0,BEFORE),role];
  const ri=RINFO[role];
  useEffect(()=>{
    const t1=setTimeout(()=>setOffset(-(BEFORE*ITEM_H)),120);
    const t2=setTimeout(onDone,2500);
    return()=>{clearTimeout(t1);clearTimeout(t2);};
  },[]);
  return(
    <div style={{position:'fixed',inset:0,zIndex:3000,background:'linear-gradient(160deg,#060402 0%,#0e0804 100%)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',animation:'animFadeIn 0.3s ease-out'}}>
      <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at center,transparent 35%,#000000bb 100%)',pointerEvents:'none'}}/>
      <div style={{position:'relative',zIndex:1,textAlign:'center'}}>
        {/* Line 1 */}
        <div style={{fontFamily:"'Cinzel Decorative','Cinzel',serif",fontSize:26,fontWeight:700,letterSpacing:6,color:'#c8a96e',marginBottom:22,textShadow:'0 0 40px #c8a96e55',animation:'animFadeIn 0.5s 0.15s both'}}>
          探索开始
        </div>
        <div style={{width:180,height:1,background:'linear-gradient(90deg,transparent,#5a4020,transparent)',margin:'0 auto 26px',animation:'animFadeIn 0.5s 0.3s both'}}/>
        {/* Line 2: label + slot */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,animation:'animFadeIn 0.5s 0.4s both'}}>
          <span style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#b89858',fontSize:14,whiteSpace:'nowrap'}}>
            你本局的身份：
          </span>
          {/* Slot window */}
          <div style={{overflow:'hidden',height:ITEM_H,minWidth:108,background:'#080502',padding:'0 10px',display:'flex',alignItems:'flex-start'}}>
            <div style={{
              transform:`translateY(${offset}px)`,
              transition:offset===0?'none':`transform 2.0s cubic-bezier(0.04,0.0,0.1,1.0)`,
              willChange:'transform',
            }}>
              {items.map((r,i)=>{
                const rr=RINFO[r];
                const isTarget=i===BEFORE;
                return(
                  <div key={i} style={{height:ITEM_H,display:'flex',alignItems:'center',justifyContent:'center',gap:5,fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:15,letterSpacing:1,color:isTarget?ri.col:'#3a2810',textShadow:isTarget?`0 0 18px ${ri.col}99`:'none'}}>
                    <span>{rr.icon}</span><span>{r}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────
// ── Octopus line-art (SVG, no fill) ─────────────────────────
// ── God card tooltip ──────────────────────────────────────────

// ── Area card tooltip ──────────────────────────────────────────




// ── Stat Bar ─────────────────────────────────────────────────
function StatBar({label,val,color,trackColor,scaleRatio,viewportWidth}){
  const fontZoom = scaleRatio && scaleRatio < 1 ? 1 / scaleRatio : 1;
  const isMobileNarrow=!!viewportWidth&&viewportWidth<580;
  const isNarrowViewport=!!viewportWidth&&viewportWidth<900;
  const rowWidth=isMobileNarrow?'calc(100% - 34px)':isNarrowViewport?'calc(100% - 22px)':'100%';
  const labelCol=isNarrowViewport
    ? `${Math.ceil(20*fontZoom)}px`
    : 'clamp(18px, 2.5vw, 30px)';
  const valueCol=isMobileNarrow
    ? 'clamp(18px, 4vw, 24px)'
    : isNarrowViewport
      ? 'clamp(16px, 3vw, 22px)'
      : 'clamp(14px, 2.8vw, 20px)';
  const statFont=`clamp(${8*fontZoom}px, 1.7vw, ${10*fontZoom}px)`;
  const barHeight=`clamp(${8*fontZoom}px, 1.6vw, ${10*fontZoom}px)`;
  const columnGap=isNarrowViewport?'clamp(5px, 1.2vw, 7px)':'clamp(4px, 1vw, 6px)';
  const labelPaddingRight=isNarrowViewport?Math.ceil(2*fontZoom):0;
  return(
    <div style={{display:'grid',gridTemplateColumns:`${labelCol} minmax(0,1fr) ${valueCol}`,alignItems:'center',columnGap:columnGap,marginBottom:4,width:rowWidth,marginLeft:'auto',marginRight:'auto',boxSizing:'border-box',overflow:'visible'}}>
      <span style={{fontFamily:"'Cinzel',serif",color:'#a07838',fontSize:statFont,fontWeight:700,letterSpacing:0.3,textAlign:'left',whiteSpace:'nowrap',minWidth:0,paddingRight:labelPaddingRight}}>{label}</span>
      <div style={{height:barHeight,background:trackColor||'#110804',border:'1.2px solid #2a1a08',borderRadius:2,overflow:'visible',position:'relative',minWidth:0,width:'100%'}}>
        <div style={{height:'100%',width:`${Math.min(10,val)*10}%`,background:color,transition:'width .35s',borderRadius:1}}/>
        {/* 6点SAN阈值线 */}
        {label === 'SAN' && (
          <div style={{
            position: 'absolute',
            left: '60%',
            top: '-3px',
            bottom: '-3px',
            width: '1px',
            zIndex: 2,
            transform: 'translateX(-50%)'
          }}>
            {/* 上部三角形 */}
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: '50%',
              width: 0,
              height: 0,
              borderLeft: '1px solid transparent',
              borderRight: '1px solid transparent',
              borderBottom: '12px solid #a78bfa',
              transform: 'translateX(-50%)'
            }}/>
            {/* 下部三角形 */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: '50%',
              width: 0,
              height: 0,
              borderLeft: '1px solid transparent',
              borderRight: '1px solid transparent',
              borderTop: '12px solid #a78bfa',
              transform: 'translateX(-50%)'
            }}/>
          </div>
        )}
      </div>
      <span style={{fontFamily:"'Cinzel',serif",color:val<=3?'#cc3333':'#c8a96e',fontSize:statFont,textAlign:'right',fontWeight:700,whiteSpace:'nowrap',minWidth:0,justifySelf:'end'}}>{val}</span>
    </div>
  );
}

// ── Player Panel ─────────────────────────────────────────────
// ── Purple Mist projectile for SAN damage ──────────────────────

// ── Swap Cup Shuffle Overlay ─────────────────────────────────
// SVG disposable paper cup, inverted (open end down, flat base up)
function PaperCupSVG({glow}){
  return(
    <svg width="52" height="58" viewBox="0 0 52 58" style={{filter:`drop-shadow(0 0 10px ${glow||'#40c8f8'})`}}>
      {/* Cup body — trapezoid: narrow at top (base), wide at bottom (open mouth) */}
      <polygon points="14,4 38,4 46,54 6,54"
        fill="none" stroke="#a8d8f0" strokeWidth="2.2" strokeLinejoin="round"/>
      {/* Rim at bottom (open end) */}
      <ellipse cx="26" cy="54" rx="20" ry="4"
        fill="none" stroke="#a8d8f0" strokeWidth="2" />
      {/* Flat base at top */}
      <ellipse cx="26" cy="4" rx="12" ry="2.5"
        fill="#c8eaf8" stroke="#a8d8f0" strokeWidth="1.5" opacity="0.7"/>
      {/* Horizontal band lines on body */}
      <line x1="10" y1="22" x2="42" y2="22" stroke="#6ab8d8" strokeWidth="1" opacity="0.55"/>
      <line x1="8"  y1="38" x2="44" y2="38" stroke="#6ab8d8" strokeWidth="1" opacity="0.55"/>
    </svg>
  );
}
function SwapCupOverlay({active,casterName,targetName}){
  if(!active)return null;
  return(
    <div style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:600,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{position:'absolute',inset:0,background:'rgba(2,8,14,0.72)',animation:'swapBgFade 0.8s ease both'}}/>
      {/* Left cup */}
      <div style={{position:'relative',zIndex:1,animation:'swapCupL 0.8s cubic-bezier(0.4,0,0.2,1) both'}}>
        <PaperCupSVG glow="#40c8f8"/>
      </div>
      {/* Centre label */}
      <div style={{
        position:'relative',zIndex:1,
        fontFamily:"'Cinzel',serif",fontSize:14,letterSpacing:3,
        color:'#40c8f8',textShadow:'0 0 12px #40c8f8',
        margin:'0 22px',
        animation:'swapLabelPop 0.3s ease-out 0.35s both',
      }}>⇌</div>
      {/* Right cup */}
      <div style={{position:'relative',zIndex:1,animation:'swapCupR 0.8s cubic-bezier(0.4,0,0.2,1) both'}}>
        <PaperCupSVG glow="#40c8f8"/>
      </div>
      {/* Action text */}
      {casterName&&targetName&&(
        <div style={{
          position:'absolute',bottom:'38%',left:0,right:0,
          textAlign:'center',zIndex:2,
          fontFamily:"'Noto Serif SC','Cinzel',serif",
          fontSize:22,fontWeight:700,letterSpacing:4,
          color:'#40c8f8',
          textShadow:'0 0 18px #40c8f8, 0 2px 8px rgba(0,0,0,0.9)',
          animation:'swapLabelPop 0.35s ease-out 0.15s both',
        }}>{(casterName||'').replace(/（.*?）/g,'')}（寻宝者）对 {targetName} 掉包中…</div>
      )}
    </div>
  );
}

// ── Hunt Scope Overlay ────────────────────────────────────────
// Receives exact pixel coords measured from actual DOM panel position.
function HuntScopeOverlay({active,cx,cy}){
  if(!active)return null;
  // cx, cy are the exact viewport pixel centre of the target panel
  // Vignette centre tracks the target so the darkening focus matches the reticle
  const vx=cx!=null?(cx/window.innerWidth*100).toFixed(1)+'%':'50%';
  const vy=cy!=null?(cy/window.innerHeight*100).toFixed(1)+'%':'50%';
  return(
    <div style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:600}}>
      {/* Crimson vignette — centred on target, not screen centre */}
      <div style={{
        position:'absolute',inset:0,
        background:`radial-gradient(ellipse at ${vx} ${vy}, transparent 28%, rgba(60,0,0,0.55) 62%, rgba(15,0,0,0.88) 100%)`,
        animation:'huntVigFade 1.2s ease both',
      }}/>
      {/* Scope frame — starts offset from centre, wobbles, then locks dead-centre */}
      <div style={{
        position:'absolute',
        left:cx,top:cy,
        width:110,height:110,
        marginLeft:-55,marginTop:-55,
        animation:'huntScopeMove 1.2s ease-out both',
      }}>
        {[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx,sy],ci)=>(
          <div key={ci} style={{
            position:'absolute',
            left:sx===-1?0:'auto',right:sx===1?0:'auto',
            top:sy===-1?0:'auto',bottom:sy===1?0:'auto',
            width:22,height:22,
            borderTop:sy===-1?'2.5px solid rgba(220,40,40,0.92)':'none',
            borderLeft:sx===-1?'2.5px solid rgba(220,40,40,0.92)':'none',
            borderBottom:sy===1?'2.5px solid rgba(220,40,40,0.92)':'none',
            borderRight:sx===1?'2.5px solid rgba(220,40,40,0.92)':'none',
            boxShadow:'0 0 8px rgba(220,40,40,0.70)',
          }}/>
        ))}
        <div style={{
          position:'absolute',top:'50%',left:'50%',
          width:8,height:8,marginLeft:-4,marginTop:-4,
          borderRadius:'50%',
          background:'rgba(255,50,50,0.95)',
          boxShadow:'0 0 10px rgba(255,50,50,0.90)',
          animation:'huntDotPulse 0.25s ease-in-out 0.9s both',
        }}/>
        <div style={{position:'absolute',top:'50%',left:0,right:0,height:1,marginTop:-0.5,background:'rgba(220,40,40,0.50)'}}/>
        <div style={{position:'absolute',left:'50%',top:0,bottom:0,width:1,marginLeft:-0.5,background:'rgba(220,40,40,0.50)'}}/>
      </div>
    </div>
  );
}

// ── Bewitch Eye Overlay — Hunt-style scope with Horus eye ────────
function BewitchEyeOverlay({active,cx,cy}){
  if(!active)return null;
  const vx=cx!=null?(cx/window.innerWidth*100).toFixed(1)+'%':'50%';
  const vy=cy!=null?(cy/window.innerHeight*100).toFixed(1)+'%':'50%';
  return(
    <div style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:600}}>
      {/* Vignette centred on target */}
      <div style={{
        position:'absolute',inset:0,
        background:`radial-gradient(ellipse at ${vx} ${vy}, transparent 28%, rgba(40,0,60,0.55) 62%, rgba(8,0,18,0.88) 100%)`,
        animation:'huntVigFade 1.2s ease both',
      }}/>
      {/* Horus eye — tracks to target centre, same motion as hunt scope */}
      <div style={{
        position:'absolute',
        left:cx,top:cy,
        width:110,height:110,
        marginLeft:-55,marginTop:-55,
        display:'flex',alignItems:'center',justifyContent:'center',
        animation:'huntScopeMove 1.2s ease-out both',
      }}>
        <div style={{
          fontSize:64,lineHeight:1,
          color:'rgba(200,100,255,0.97)',
          textShadow:'0 0 20px rgba(180,60,255,1), 0 0 40px rgba(140,30,255,0.70)',
          filter:'drop-shadow(0 0 12px rgba(200,80,255,0.90))',
          animation:'bewitchEyePulse 0.28s ease-in-out 0.88s both',
          display:'inline-block',
          transformOrigin:'50% 50%',
        }}>𓂀</div>
      </div>
      {/* Ghost echo — stationary at target centre, spawns when eye locks, expands and fades */}
      <div style={{
        position:'absolute',
        left:cx,top:cy,
        width:110,height:110,
        marginLeft:-55,marginTop:-55,
        display:'flex',alignItems:'center',justifyContent:'center',
        pointerEvents:'none',
      }}>
        <div style={{
          fontSize:64,lineHeight:1,
          color:'rgba(220,120,255,0.85)',
          filter:'drop-shadow(0 0 28px rgba(180,60,255,0.80))',
          animation:'bewitchEyeGhost 0.65s ease-out 0.90s both',
          display:'inline-block',
          transformOrigin:'50% 50%',
          opacity:0,
        }}>𓂀</div>
      </div>
    </div>
  );
}

// ── SanMistOverlay: DOM-measured targeting ──────────────────────
// SanMistOverlay accepts pre-measured positions from parent useEffect
// (same timing pattern as SKILL_HUNT / SKILL_BEWITCH — avoids grid-layout race)
function SanMistOverlay({targets}){
  if(!targets||!targets.length)return null;
  return(
    <div style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:490,overflow:'hidden'}}>
      {targets.map(({pi,cx,cy,startX,startY},boltIdx)=>{
        const txPx=cx-startX;
        const tyPx=cy-startY;
        const delay=(boltIdx*0.07).toFixed(2)+'s';
        const hitDelay=(boltIdx*0.07+0.46).toFixed(2)+'s';
        return(
          <React.Fragment key={pi}>
            <div style={{
              position:'absolute',left:startX,top:startY,
              width:100,height:90,marginLeft:-50,marginTop:-45,
              background:'radial-gradient(ellipse at 50% 50%,rgba(240,120,255,1) 0%,rgba(170,40,250,0.92) 36%,rgba(120,10,210,0.60) 65%,transparent 100%)',
              filter:'blur(6px)',
              '--tx':`${txPx}px`,'--ty':`${tyPx}px`,
              animation:`sanMistBolt 0.52s cubic-bezier(0.10,0,0.35,1) ${delay} both, sanMistMorph 0.45s ease-in-out ${delay} both`,
              zIndex:492,
            }}/>
            <div style={{
              position:'absolute',left:startX,top:startY,
              width:90,height:80,marginLeft:-45,marginTop:-40,
              background:'radial-gradient(ellipse at 50% 50%,rgba(210,80,255,0.55) 0%,rgba(140,20,230,0.30) 50%,transparent 80%)',
              filter:'blur(10px)',
              '--tx':`${txPx}px`,'--ty':`${tyPx}px`,
              animation:`sanMistBolt 0.52s cubic-bezier(0.10,0,0.35,1) calc(${delay} + 0.06s) both`,
              zIndex:491,
            }}/>
            <div style={{
              position:'absolute',left:startX,top:startY,
              width:80,height:70,marginLeft:-40,marginTop:-35,
              background:'radial-gradient(ellipse at 50% 50%,rgba(185,60,255,0.30) 0%,rgba(120,0,210,0.15) 50%,transparent 80%)',
              filter:'blur(14px)',
              '--tx':`${txPx}px`,'--ty':`${tyPx}px`,
              animation:`sanMistBolt 0.52s cubic-bezier(0.10,0,0.35,1) calc(${delay} + 0.12s) both`,
              zIndex:490,
            }}/>
            <div style={{
              position:'absolute',left:startX,top:startY,
              width:150,height:130,marginLeft:-75,marginTop:-65,
              background:'radial-gradient(circle,rgba(180,50,255,0.18) 0%,transparent 70%)',
              filter:'blur(18px)',
              '--tx':`${txPx}px`,'--ty':`${tyPx}px`,
              animation:`sanMistBolt 0.56s cubic-bezier(0.12,0,0.38,1) calc(${delay} + 0.08s) both`,
              zIndex:489,
            }}/>
            <div style={{
              position:'absolute',left:cx,top:cy,
              width:180,height:180,marginLeft:-90,marginTop:-90,
              borderRadius:'50%',
              background:'radial-gradient(circle,rgba(240,100,255,0.88) 0%,rgba(155,30,235,0.60) 32%,transparent 68%)',
              filter:'blur(12px)',
              animation:`sanMistImpact 0.30s ease-out ${hitDelay} both`,
              zIndex:493,
            }}/>
            <div style={{
              position:'absolute',left:cx,top:cy,
              width:20,height:20,marginLeft:-10,marginTop:-10,
              borderRadius:'50%',
              border:'3px solid rgba(220,90,255,0.90)',
              boxShadow:'0 0 12px rgba(200,60,255,0.70), inset 0 0 8px rgba(200,60,255,0.50)',
              animation:`sanMistShockwave 0.38s ease-out ${hitDelay} both`,
              zIndex:494,
            }}/>
            <div style={{
              position:'absolute',left:cx,top:cy,
              width:20,height:20,marginLeft:-10,marginTop:-10,
              borderRadius:'50%',
              border:'2px solid rgba(200,70,255,0.55)',
              animation:`sanMistShockwave 0.42s ease-out calc(${hitDelay} + 0.06s) both`,
              zIndex:493,
            }}/>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Green cross heal particles ──────────────────────────────────
const CROSS_POSITIONS=[
  [18,65],[32,50],[50,72],[65,42],[80,60],[22,38],[70,28],[45,82],[55,18],[35,78],
  [75,52],[12,55],[88,35],[42,25],[60,68],
];
function HealCrossEffect({color='#4ade80'}){
  return(
    <div style={{position:'absolute',inset:0,overflow:'hidden',pointerEvents:'none',zIndex:50}}>
      {CROSS_POSITIONS.map(([lp,tp],i)=>{
        const sz=6+Math.random()*5|0;
        const delay=(0.05*i).toFixed(2);
        return(
          <div key={i} style={{
            position:'absolute',
            left:`${lp}%`,top:`${tp}%`,
            width:sz,height:sz,
            opacity:0,
            animation:`healCross 1.2s ease-out ${delay}s both`,
          }}>
            {/* Horizontal bar */}
            <div style={{position:'absolute',top:'33%',left:0,right:0,height:'34%',background:color,borderRadius:1,boxShadow:`0 0 4px ${color}`}}/>
            {/* Vertical bar */}
            <div style={{position:'absolute',left:'33%',top:0,bottom:0,width:'34%',background:color,borderRadius:1,boxShadow:`0 0 4px ${color}`}}/>
          </div>
        );
      })}
    </div>
  );
}

function PlayerPanel({player,playerIndex,isCurrentTurn,isSelectable,onSelect,showFaceUp,onCardSelect,isBeingHit,isSanHit,isHpHeal,isSanHeal,isBeingGuillotined,displayStats,scaleRatio,viewportWidth}){
  const ri=RINFO[player.role];
  // 缩放时反向补偿字体：确保缩放后字体不失真
  const fontZoom = scaleRatio && scaleRatio < 1 ? 1 / scaleRatio : 1;
  const _ = (px) => px * fontZoom; // 补偿函数
  const borderColor=isBeingHit?'#cc2222':isSanHit?'#8840cc':isCurrentTurn?'#c8a96e':isSelectable?ri.col:'#3a2510';
  const handCards=showFaceUp?player.hand:player.hand.map((_,ci)=>({id:`back-${playerIndex}-${ci}`,_back:true}));
  const HAND_CARD_WIDTH=showFaceUp?44:36;
  const HAND_CARD_HEIGHT=showFaceUp?58:50;
  const HAND_CARD_GAP=3;
  const HAND_AREA_WIDTH=(HAND_CARD_WIDTH*4)+(HAND_CARD_GAP*3);
  const shouldFillFlatHand=handCards.length===4;
  const stretchedHandSlotWidth=`calc((100% - ${HAND_CARD_GAP*3}px) / 4)`;
  const handOverlap=handCards.length>4
    ? Math.max(0, Math.ceil(((handCards.length*HAND_CARD_WIDTH)-HAND_AREA_WIDTH)/(handCards.length-1)))
    : 0;
  return(
    <div onClick={isSelectable?onSelect:undefined} style={{
      width:'100%',
      background:isCurrentTurn?'#1c1408':'#140f08',
      border:`1.5px solid ${borderColor}`,
      boxShadow:isCurrentTurn?`0 0 20px #c8a96e22,inset 0 0 16px #c8a96e08`:isSelectable?`0 0 14px ${ri.col}44`:'none',
      borderRadius:3,padding:'8px 9px',
      cursor:isSelectable?'pointer':'default',
      // 只有在死亡特效播放完成后才置灰（_pendingAnimDeath为false或不存在的isDead角色）
      opacity: isBeingGuillotined ? 0 : (player.isDead && !player._pendingAnimDeath ? 0.32 : 1),
      transition:'all .2s',
      position:'relative',
      overflow:'hidden',
    }}>
      {/* SAN mist: rendered by full-screen SanMistOverlay */}
      {(isHpHeal||isSanHeal)&&<HealCrossEffect color={isSanHeal?'#a78bfa':'#4ade80'}/>}
      {/* Name plate */}
      <div style={{
        display:'flex',alignItems:'center',gap:6,marginBottom:6,
        borderBottom:'1px solid #2a1a08',paddingBottom:5,
      }}>
        <span style={{fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:_(11),color:isCurrentTurn?'#e8c87a':'#c8a96e',letterSpacing:1}}>{player.name}</span>
        {(player.roleRevealed||player.isDead)&&<span style={{fontSize:_(10),color:ri.col,fontFamily:"'Cinzel',serif",letterSpacing:1,marginLeft:2}}>{ri.icon} {player.role}</span>}
        {player.isDead&&<span style={{fontSize:_(11),color:'#882020',marginLeft:'auto'}}>☠</span>}
        {player.isResting&&!player.isDead&&<span style={{fontSize:_(9),color:'#4ade80',marginLeft:'auto',letterSpacing:1,filter:'drop-shadow(0 0 4px #4ade80)'}}>♥ 翻面中</span>}
        {isCurrentTurn&&!player.isDead&&!player.isResting&&<span style={{fontSize:_(9),color:'#c8a96e',marginLeft:'auto',letterSpacing:1}}>▸ 行动</span>}
      </div>
      <StatBar label="HP"  val={displayStats?.[playerIndex]?.hp ?? player.hp}  color="#8b1515" trackColor="#1a0808" scaleRatio={scaleRatio} viewportWidth={viewportWidth}/>
      <StatBar label="SAN" val={displayStats?.[playerIndex]?.san ?? player.san} color="#4a1080" trackColor="#120820" scaleRatio={scaleRatio} viewportWidth={viewportWidth}/>
      {/* Skull counter + god zone */}
      {((player.godEncounters||0)>0||(player.godZone||[]).length>0)&&(
        <div style={{display:'flex',alignItems:'center',gap:4,marginTop:4,flexWrap:'wrap'}}>
          {(player.godEncounters||0)>0&&(
            <span style={{fontSize:9,color:'#8b6060',letterSpacing:1,fontFamily:"'Cinzel',serif"}}>
              {'💀'.repeat(Math.min(player.godEncounters,6))}{player.godEncounters>6?`×${player.godEncounters}`:''}
            </span>
          )}
          {(player.godZone||[]).length>0&&player.godName&&(
            <span style={{
              fontSize:8,color:GOD_DEFS[player.godName]?.col||'#c06020',
              background:'#100808',border:`1px solid ${GOD_DEFS[player.godName]?.col||'#c06020'}44`,
              borderRadius:2,padding:'1px 4px',fontFamily:"'Cinzel',serif",letterSpacing:0.5,
            }}>
              {GOD_DEFS[player.godName]?.power} Lv.{player.godLevel}
            </span>
          )}
        </div>
      )}
      <div style={{display:'flex',flexWrap:'wrap',gap:3,marginTop:5,minWidth:0}}>
        {(player.zoneCards||[]).map((c,ci)=><DDCard key={c.id||`zone-${playerIndex}-${ci}`} card={c} small holderId={playerIndex}/>)}
      </div>
      <div style={{
        display:shouldFillFlatHand?'grid':'flex',
        gridTemplateColumns:shouldFillFlatHand?'repeat(4, minmax(0, 1fr))':undefined,
        gap:shouldFillFlatHand?HAND_CARD_GAP:undefined,
        alignItems:'flex-start',
        marginTop:5,
        minWidth:0,
        width:shouldFillFlatHand?'100%':HAND_AREA_WIDTH,
        maxWidth:'100%',
        overflow:'hidden',
      }}>
        {handCards.map((card,ci)=>(
          <div key={card.id||`hand-${playerIndex}-${ci}`} style={{
            marginLeft:shouldFillFlatHand?0:(ci===0?0:(handOverlap>0?-handOverlap:HAND_CARD_GAP)),
            flex:'0 0 auto',
            position:'relative',
            zIndex:ci+1
          }}>
            {card._back
              ?<DDCardBack small frameStyle={shouldFillFlatHand?{width:'100%',minWidth:'100%',height:'auto',aspectRatio:`${HAND_CARD_WIDTH}/${HAND_CARD_HEIGHT}`}:{}}/>
              :<DDCard card={card} small onClick={onCardSelect?()=>onCardSelect(ci):undefined} highlight={!!onCardSelect} holderId={playerIndex} frameStyle={shouldFillFlatHand?{width:'100%',minWidth:'100%',height:'auto',aspectRatio:`${HAND_CARD_WIDTH}/${HAND_CARD_HEIGHT}`}:{}}/>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── God Card Display ──────────────────────────────────────────

// ── God Choice Modal (player encounters a god card) ────────────
function GodChoiceModal({godCard,player,onWorship,onKeepHand,onDiscard,isConvert,forcedConvert}){
  if(!godCard)return null;
  const def=GOD_DEFS[godCard.godKey];
  const isCultist=player.role===ROLE_CULTIST;
  const alreadyWorship=player.godName===godCard.godKey;
  const canUpgrade=alreadyWorship&&(player.godLevel||0)<3;
  return(
    // 修改了这里的 background 和 backdropFilter
    <div style={{position:'fixed',inset:0,display:'flex',alignItems:'flex-start',justifyContent:'center',zIndex:400,paddingTop:'10vh'}}>
      <div style={{
        background:'#150e07dd',
        border:`2px solid ${def.col}`,
        boxShadow:`0 0 60px ${def.col}44, 0 0 120px #000a`,
        borderRadius:4,padding:'20px 28px',maxWidth:320,width:'90%',textAlign:'center',
        animation:'animPop 0.22s ease-out',
        display:'flex',
        flexDirection:'column',
        gap:12
      }}>
        <div style={{fontFamily:"'Cinzel',serif",color:'#e8cc88',fontSize:19.5,letterSpacing:2,marginBottom:4}}>
          {forcedConvert?'邪祀者强制改信——':'邪神降临——'}
          <span style={{color:def.col,filter:`drop-shadow(0 0 6px ${def.col}88)`}}>{godCard.name}</span>
        </div>
        <div style={{fontSize:16.5,color:'#c89058',fontStyle:'italic',fontFamily:"'IM Fell English',serif",marginBottom:4}}>
          {'💀'.repeat(player.godEncounters)} 第{player.godEncounters}次遭遇，失去{player.godEncounters}SAN
          {isConvert&&!forcedConvert&&<span style={{color:'#e08888',marginLeft:8}}>（改信将失去1SAN）</span>}
        </div>
        {/* Power gain preview */}
        {!forcedConvert&&(
          <div style={{
            fontSize:11,color:def.col,fontFamily:"'Cinzel',serif",letterSpacing:1,
            marginBottom:8,opacity:0.9,
            background:def.bgCol,border:`1px solid ${def.col}55`,
            borderRadius:3,padding:'4px 12px',display:'inline-block',
            alignSelf:'center'
          }}>
            {canUpgrade
              ? `⬆ 升级后你将获得：${def.power} Lv.${(player.godLevel||0)+1}`
              : `⛧ 信仰后你将获得邪神之力：${def.power} Lv.1`}
          </div>
        )}
        <GodCardDisplay card={godCard} level={alreadyWorship?(player.godLevel+1):1}/>
        <div style={{display:'flex',gap:12,flexWrap:'wrap',justifyContent:'center',marginTop:8}}>
          {!forcedConvert&&(
            <button onClick={onWorship} style={{padding:'9px 22px',background:def.bgCol,border:`1.5px solid ${def.col}`,color:def.col,fontFamily:"'Cinzel',serif",fontSize:16.5,borderRadius:3,cursor:'pointer',letterSpacing:1,filter:`drop-shadow(0 0 4px ${def.col}66)`}}>
              {canUpgrade?'⬆ 升级邪神之力':isConvert?'⛧ 改信新神':'⛧ 信仰邪神'}
            </button>
          )}
          {!alreadyWorship&&!forcedConvert&&isCultist&&(
            <button onClick={onKeepHand} style={{padding:'9px 22px',background:'#180830',border:`1.5px solid #b080ee`,color:'#b080ee',fontFamily:"'Cinzel',serif",fontSize:16.5,borderRadius:3,cursor:'pointer',letterSpacing:1,filter:'drop-shadow(0 0 4px #9060cc66)'}}>
              ☽ 秘密收入手牌
            </button>
          )}
          {!forcedConvert&&(
            <button onClick={onDiscard} style={{padding:'9px 22px',background:'#120a08',border:'1.5px solid #6a4828',color:'#d4a858',fontFamily:"'Cinzel',serif",fontSize:16.5,borderRadius:3,cursor:'pointer',letterSpacing:1}}>
              放弃
            </button>
          )}
          {forcedConvert&&(
            <button onClick={onWorship} style={{padding:'9px 22px',background:def.bgCol,border:`1.5px solid ${def.col}`,color:def.col,fontFamily:"'Cinzel',serif",fontSize:16.5,borderRadius:3,cursor:'pointer',letterSpacing:1,filter:`drop-shadow(0 0 4px ${def.col}66)`}}>
              ⛧ 接受改信
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── NYA Borrow Modal ──────────────────────────────────────────
function NyaBorrowModal({deadPlayers,godLevel,onBorrow,onSkip}){
  const penalty=GOD_DEFS.NYA.levels[Math.max(0,(godLevel||1)-1)].handPenalty;
  const s=GOD_DEFS.NYA;
  return(
    <div style={{position:'fixed',inset:0,display:'flex',alignItems:'flex-start',justifyContent:'center',zIndex:400,paddingTop:'10vh'}}>
      <div style={{
        background:'#150e07dd',
        border:`2px solid ${s.col}`,
        boxShadow:`0 0 60px ${s.col}44, 0 0 120px #000a`,
        borderRadius:4,padding:'20px 28px',maxWidth:320,width:'90%',textAlign:'center',
        animation:'animPop 0.22s ease-out',
      }}>
        <div style={{fontFamily:"'Cinzel',serif",color:'#b03030',fontSize:15,letterSpacing:3,marginBottom:16,textTransform:'uppercase'}}>── 千人千貌 Lv.{godLevel} ──</div>
        
        <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#8a5050',fontSize:14,marginBottom:20,lineHeight:1.4}}>
          借用已死角色的身份直至回合结束{penalty>0?`（手牌上限-${penalty}）`:''}
        </div>
        
        <div style={{display:'flex',gap:10,flexWrap:'wrap',justifyContent:'center',marginBottom:20}}>
          {deadPlayers.map((p,i)=>(
            <button key={i} onClick={()=>onBorrow(p)} style={{
              padding:'10px 18px',background:'#1a0808',border:'1.5px solid #882020',
              color:'#cc6060',fontFamily:"'Cinzel',serif",fontSize:12,borderRadius:3,cursor:'pointer',
              opacity:0.85,transition:'all .15s',
              boxShadow:'0 0 16px #88202044',
              ':hover':{
                opacity:1,
                boxShadow:'0 0 20px #88202066',
              }
            }}>
              ☠ {p.role}（{p.name}）
            </button>
          ))}
        </div>
        
        <div style={{display:'flex',justifyContent:'center'}}>
          <button onClick={onSkip} style={{
            padding:'10px 22px',background:'#120a08',border:'1.5px solid #883030',
            color:'#e08888',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:14,
            borderRadius:2,cursor:'pointer',letterSpacing:1,transition:'all .15s',
          }}>
            不借用，直接摸牌
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Draw Reveal Modal ─────────────────────────────────────────
function DrawRevealModal({drawReveal,onKeep,onDiscard,canChoose,thinkingText}){
  if(!drawReveal?.card)return null;
  const{card,msgs}=drawReveal;
  const s=CS[card.letter]||GOD_CS;
  const isBystander=!canChoose&&thinkingText;
  return(
    <div style={{position:'fixed',inset:0,display:'flex',alignItems:'flex-start',justifyContent:'center',zIndex:300,paddingTop:'10vh'}}>
      <div style={{
        background:'#150e07dd',
        border:`2px solid ${s.border}`,
        boxShadow:`0 0 60px ${s.glow}44, 0 0 120px #000a`,
        borderRadius:4,padding:'20px 28px',maxWidth:280,width:'90%',textAlign:'center',
        animation:'animPop 0.22s ease-out',
      }}>
        <div style={{fontFamily:"'Cinzel',serif",color:'#a07838',fontSize:15,letterSpacing:3,marginBottom:16,textTransform:'uppercase'}}>── 区域探寻 ──</div>
        {/* Big card */}
        <div style={{
          background:s.bg,border:`2px solid ${s.borderBright}`,
          borderRadius:4,padding:'18px 22px',display:'inline-flex',flexDirection:'column',alignItems:'center',
          minWidth:120,marginBottom:16,boxShadow:`0 0 30px ${s.glow}55`,
        }}>
          <div style={{fontFamily:"'Cinzel',serif",fontWeight:700,color:s.text,fontSize:51,lineHeight:1}}>{card.key}</div>
          <div style={{fontFamily:"'Cinzel',serif",color:'#e8cc88',fontSize:19.5,fontWeight:600,marginTop:6}}>{card.name}</div>
          <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#d4b468',fontSize:16.5,marginTop:8,lineHeight:1.4,maxWidth:200}}>{card.desc}</div>
        </div>
        
        {isBystander ? (
          <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#c8a96e',fontSize:15,marginTop:16}}>
            {thinkingText}
          </div>
        ) : (
          <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap',marginTop:16}}>
            <button onClick={onKeep} style={{
              padding:'10px 22px',background:'#1c1008',border:'1.5px solid #c8a96e',
              color:'#e8c87a',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:14,
              borderRadius:2,cursor:'pointer',letterSpacing:1,
              boxShadow:'0 0 16px #c8a96e44',transition:'all .15s',
            }}>
              收入手牌
              <div style={{fontSize:10,opacity:0.7,marginTop:4,fontWeight:400,fontFamily:"'IM Fell English',serif"}}>
                (触发效果)
              </div>
            </button>
            <button onClick={onDiscard} style={{
              padding:'10px 22px',background:'#120a08',border:'1.5px solid #883030',
              color:'#e08888',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:14,
              borderRadius:2,cursor:'pointer',letterSpacing:1,transition:'all .15s',
            }}>
              弃置此牌
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Treasure Hunter Dodge Modal ─────────────────────────────
function TreasureDodgeModal({drawReveal,onRoll,onSkip,thinkingText}){
  if(!drawReveal?.card)return null;
  const{card}=drawReveal;
  const s=CS[card.letter]||GOD_CS;
  return(
    <div style={{position:'fixed',inset:0,display:'flex',alignItems:'flex-start',justifyContent:'center',zIndex:300,paddingTop:'10vh'}}>
      <div style={{
        background:'#150e07dd',
        border:`2px solid ${s.border}`,
        boxShadow:`0 0 60px ${s.glow}44, 0 0 120px #000a`,
        borderRadius:4,padding:'20px 28px',maxWidth:280,width:'90%',textAlign:'center',
        animation:'animPop 0.22s ease-out',
      }}>
        <div style={{fontFamily:"'Cinzel',serif",color:'#a07838',fontSize:15,letterSpacing:3,marginBottom:16,textTransform:'uppercase'}}>── 寻宝者能力 ──</div>
        {/* Big card */}
        <div style={{
          background:s.bg,border:`2px solid ${s.borderBright}`,
          borderRadius:4,padding:'18px 22px',display:'inline-flex',flexDirection:'column',alignItems:'center',
          minWidth:120,marginBottom:16,boxShadow:`0 0 30px ${s.glow}55`,
        }}>
          <div style={{fontFamily:"'Cinzel',serif",fontWeight:700,color:s.text,fontSize:51,lineHeight:1}}>{card.key}</div>
          <div style={{fontFamily:"'Cinzel',serif",color:'#e8cc88',fontSize:19.5,fontWeight:600,marginTop:6}}>{card.name}</div>
          <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#d4b468',fontSize:16.5,marginTop:8,lineHeight:1.4,maxWidth:200}}>{card.desc}</div>
        </div>
        
        <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#c8a96e',fontSize:14,marginTop:12,lineHeight:1.6}}>
          这张牌带有负面效果！作为寻宝者，你可以掷骰子尝试规避。
        </div>
        <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#a08060',fontSize:13,marginTop:8}}>
          掷出 4、5、6 点可成功规避负面效果。
        </div>
        
        {thinkingText&&(
          <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#e8c87a',fontSize:14,marginTop:12,lineHeight:1.6}}>
            {thinkingText}
          </div>
        )}
        
        {!thinkingText&&(
          <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap',marginTop:20}}>
            <button onClick={onRoll} style={{
              padding:'10px 22px',background:'#1c1008',border:'1.5px solid #c8a96e',
              color:'#e8c87a',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:14,
              borderRadius:2,cursor:'pointer',letterSpacing:1,
              boxShadow:'0 0 16px #c8a96e44',transition:'all .15s',
            }}>
              掷骰子
              <div style={{fontSize:10,opacity:0.7,marginTop:4,fontWeight:400,fontFamily:"'IM Fell English',serif"}}>
                (尝试规避)
              </div>
            </button>
            <button onClick={onSkip} style={{
              padding:'10px 22px',background:'#120a08',border:'1.5px solid #883030',
              color:'#e08888',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:14,
              borderRadius:2,cursor:'pointer',letterSpacing:1,transition:'all .15s',
            }}>
              直接触发
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PeekHandModal({card,targetName,onClose}){
  if(!card)return null;
  const col=card.isGod?GOD_CS:(CS[card.letter]||'#c8a96e');
  return(
    <div style={{
      position:'fixed',inset:0,zIndex:1200,
      background:'rgba(3,2,6,0.72)',
      display:'flex',alignItems:'center',justifyContent:'center',
      padding:20
    }} onClick={onClose}>
      <div data-modal style={{
        width:360,maxWidth:'calc(100vw - 24px)',
        background:'linear-gradient(180deg,#1a120d 0%,#0f0a07 100%)',
        border:'1.5px solid #b48a52',
        boxShadow:'0 18px 60px rgba(0,0,0,0.6)',
        borderRadius:10,padding:'18px 18px 16px',
        color:'#e8d8b8'
      }} onClick={e=>e.stopPropagation()}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:22,letterSpacing:2,textAlign:'center',color:'#d9b172',marginBottom:8}}>血之窥探</div>
        <div style={{textAlign:'center',fontSize:13,color:'#c8a96e',marginBottom:16}}>
          你偷看了 {targetName} 的一张手牌
        </div>
        <div style={{display:'flex',justifyContent:'center',marginBottom:16}}>
          <div style={{
            width:120,minHeight:164,borderRadius:8,padding:'10px 10px 12px',
            background:'linear-gradient(180deg,#1b120b,#0d0906)',
            border:`1.5px solid ${col}`,
            boxShadow:`0 0 18px ${col}33, inset 0 0 18px #00000044`
          }}>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:24,lineHeight:1,color:col,marginBottom:6}}>{card.key}</div>
            <div style={{fontFamily:"'Noto Serif SC','Songti SC',serif",fontWeight:700,fontSize:16,color:'#f1dfbf',marginBottom:8}}>{card.name}</div>
            <div style={{fontSize:11,lineHeight:1.6,color:'#cfbd99',whiteSpace:'pre-wrap'}}>
              {card.desc||''}
            </div>
          </div>
        </div>
        <div style={{display:'flex',justifyContent:'center'}}>
          <button onClick={onClose} style={{
            padding:'8px 20px',
            background:'#2a1a08',
            border:'1.5px solid #8a6030',
            color:'#d8b078',
            borderRadius:6,
            cursor:'pointer',
            fontFamily:"'Cinzel',serif"
          }}>确认</button>
        </div>
      </div>
    </div>
  );
}

function TortoiseOracleModal({abilityData,onSelect,myTurn}){
  const revealedCards=abilityData?.revealedCards||[];
  const selectableKeys=abilityData?.selectableKeys||[];
  const [revealedCount,setRevealedCount]=React.useState(0);
  const canPick=!!myTurn;

  useEffect(()=>{
    setRevealedCount(0);
  },[revealedCards.map(c=>c.id??c.key).join('|')]);

  useEffect(()=>{
    if(!revealedCards.length)return;
    if(revealedCount>=revealedCards.length)return;
    const t=setTimeout(()=>setRevealedCount(v=>Math.min(v+1,revealedCards.length)),220);
    return()=>clearTimeout(t);
  },[revealedCount,revealedCards]);

  if(!abilityData)return null;
  return(
    <div style={{position:'fixed',inset:0,display:'flex',alignItems:'center',justifyContent:'center',zIndex:400}}>
      <div style={{background:'#150e07dd',border:'2px solid #a78bfa',boxShadow:'0 0 60px #a78bfa44, 0 0 120px #000a',borderRadius:4,padding:'20px 28px',maxWidth:520,width:'92%',textAlign:'center'}}>
        <div style={{fontFamily:"'Cinzel',serif",color:'#a78bfa',fontSize:16,letterSpacing:2,marginBottom:16}}>── 灵龟卜祝 ──</div>
        <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#b09090',fontSize:14,marginBottom:16,lineHeight:1.4}}>
          {canPick?'展示牌堆顶的牌，再选择你手中最多的一个字母或数字编号':'灵龟卜祝翻开了牌堆顶的牌'}
        </div>
        <div style={{display:'flex',gap:10,flexWrap:'wrap',justifyContent:'center',marginBottom:18,minHeight:120}}>
          {revealedCards.map((card,index)=>(
            <div key={card.id??`${card.key}-${index}`} style={{opacity:index<revealedCount?1:0.28,transform:index<revealedCount?'scale(1)':'scale(0.95)',transition:'all .18s'}}>
              {index<revealedCount?<DDCard card={card} compact/>:<DDCardBack/>}
            </div>
          ))}
        </div>
        {canPick&&(
          <div style={{display:'flex',gap:10,flexWrap:'wrap',justifyContent:'center',marginBottom:8}}>
            {selectableKeys.map((key,i)=>(
              <button key={i} onClick={()=>onSelect(key)} style={{
                padding:'10px 18px',background:'#1a0808',border:'1.5px solid #a78bfa',
                color:'#a78bfa',fontFamily:"'Cinzel',serif",fontSize:12,borderRadius:3,cursor:'pointer',
                opacity:0.9,transition:'all .15s',
              }}>{key}</button>
            ))}
          </div>
        )}
        {!canPick&&(
          <div style={{fontFamily:"'Cinzel',serif",fontSize:12,color:'#a07838',letterSpacing:1}}>
            触发者选择中…
          </div>
        )}
      </div>
    </div>
  );
}

function CaveDuelAnim({anim,exiting}){
  const {sourceIdx,targetIdx,sourceCard,targetCard,winnerIdx}=anim||{};
  const [pts,setPts]=React.useState(null);
  useEffect(()=>{
    const measure=()=>{
      const srcEl=document.querySelector(`[data-pid="${sourceIdx}"]`);
      const tgtEl=document.querySelector(`[data-pid="${targetIdx}"]`);
      const srcR=srcEl?.getBoundingClientRect();
      const tgtR=tgtEl?.getBoundingClientRect();
      const centerX=window.innerWidth/2;
      const centerY=window.innerHeight*0.44;
      const srcX=srcR?srcR.left+srcR.width/2:centerX-180;
      const srcY=srcR?srcR.top+srcR.height*0.7:centerY+80;
      const tgtX=tgtR?tgtR.left+tgtR.width/2:centerX+180;
      const tgtY=tgtR?tgtR.top+tgtR.height*0.7:centerY+80;
      const winnerEl=winnerIdx!=null?document.querySelector(`[data-pid="${winnerIdx}"]`):null;
      const winnerR=winnerEl?.getBoundingClientRect();
      const winX=winnerR?winnerR.left+winnerR.width/2:(winnerIdx===sourceIdx?srcX:(winnerIdx===targetIdx?tgtX:centerX));
      const winY=winnerR?winnerR.top+winnerR.height*0.72:(winnerIdx===sourceIdx?srcY:(winnerIdx===targetIdx?tgtY:centerY+120));
      setPts({centerX,centerY,srcX,srcY,tgtX,tgtY,winX,winY});
    };
    requestAnimationFrame(()=>requestAnimationFrame(measure));
  },[sourceIdx,targetIdx,winnerIdx]);
  if(!anim||!pts)return null;
  const makeStyle=(fromX,fromY,midX,midY,toX,toY,delay=0)=>({
    position:'absolute',
    left:pts.centerX-36,
    top:pts.centerY-52,
    width:72,
    height:104,
    '--fromX':`${fromX}px`,
    '--fromY':`${fromY}px`,
    '--midX':`${midX}px`,
    '--midY':`${midY}px`,
    '--toX':`${toX}px`,
    '--toY':`${toY}px`,
    animation:`caveDuelCardPath 2.35s cubic-bezier(.2,.7,.2,1) ${delay}s both`,
  });
  const srcFromX=pts.srcX-pts.centerX;
  const srcFromY=pts.srcY-pts.centerY;
  const tgtFromX=pts.tgtX-pts.centerX;
  const tgtFromY=pts.tgtY-pts.centerY;
  const srcToX=(winnerIdx==null?pts.srcX:pts.winX)-pts.centerX-24;
  const srcToY=(winnerIdx==null?pts.srcY:pts.winY)-pts.centerY;
  const tgtToX=(winnerIdx==null?pts.tgtX:pts.winX)-pts.centerX+24;
  const tgtToY=(winnerIdx==null?pts.tgtY:pts.winY)-pts.centerY;
  const srcNum=sourceCard?.isGod?0:(sourceCard?.number||0);
  const tgtNum=targetCard?.isGod?0:(targetCard?.number||0);
  const winnerLabel=winnerIdx==null?'平局':winnerIdx===sourceIdx?'左侧胜出':'右侧胜出';
  return(
    <div style={{
      position:'fixed',inset:0,zIndex:1200,pointerEvents:'none',
      background:'radial-gradient(circle at 50% 45%, rgba(40,24,8,0.25), rgba(0,0,0,0.78))',
      animation:exiting?'animFadeOut 0.18s ease-in forwards':'animFadeIn 0.12s ease-out forwards',
    }}>
      <div style={{position:'absolute',left:'50%',top:'14%',transform:'translateX(-50%)',textAlign:'center'}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:16,letterSpacing:3,color:'#d8b66a',textShadow:'0 0 12px #d8b66a88'}}>── 穴居人战争 ──</div>
        <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',fontSize:13,color:'#c8a96e',marginTop:8,opacity:.92}}>{winnerLabel}</div>
      </div>
      <div style={{position:'absolute',left:pts.centerX-70,top:pts.centerY-10,width:140,height:56,borderRadius:'50%',background:'radial-gradient(circle, #2c1a0acc 0%, #12090400 72%)',filter:'blur(4px)',opacity:.85}}/>
      <div style={makeStyle(srcFromX,srcFromY,-56,-10,srcToX,srcToY,0)}>
        <DDCard card={sourceCard} compact/>
      </div>
      <div style={makeStyle(tgtFromX,tgtFromY,56,-10,tgtToX,tgtToY,0.04)}>
        <DDCard card={targetCard} compact/>
      </div>
      <div style={{position:'absolute',left:pts.centerX-118,top:pts.centerY+56,width:92,textAlign:'center',fontFamily:"'Cinzel',serif",fontSize:26,color:'#e8c87a',opacity:0,animation:'caveDuelScorePop 1.1s ease-out .9s forwards'}}>{srcNum}</div>
      <div style={{position:'absolute',left:pts.centerX+26,top:pts.centerY+56,width:92,textAlign:'center',fontFamily:"'Cinzel',serif",fontSize:26,color:'#e8c87a',opacity:0,animation:'caveDuelScorePop 1.1s ease-out .95s forwards'}}>{tgtNum}</div>
      <div style={{position:'absolute',left:'50%',top:`${pts.centerY+48}px`,transform:'translateX(-50%)',fontSize:34,opacity:0,animation:'caveDuelVsPop 1s ease-out .82s forwards'}}>⚔</div>
      {winnerIdx!=null&&(
        <div style={{
          position:'absolute',
          left:winnerIdx===sourceIdx?pts.centerX-92:pts.centerX+52,
          top:pts.centerY-70,
          fontSize:28,
          opacity:0,
          animation:'caveDuelDancePop 1.1s ease-out 1.38s forwards',
          filter:'drop-shadow(0 0 10px #f0d080aa)',
        }}>🕺</div>
      )}
    </div>
  );
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
    ROSE_THORN_SELECT_TARGET:'请选择承受【玫瑰倒刺】的目标',
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
// ── Pile Display: deck + discard in center ────────────────────
const CARD_W=36,CARD_H=50;
const CARD_BACK_STYLE={
  width:CARD_W,height:CARD_H,borderRadius:3,
  background:'#1a1008',border:'1.5px solid #5a3a10',
  boxShadow:'0 1px 4px #0008',
  position:'absolute',
};
const DISCARD_ROTATIONS=[-14,-6,10,3,-18,7,-3,12,-9,5,-15,8];
const DISCARD_OFFSETS=[
  {x:0,y:0},{x:4,y:-3},{x:-3,y:2},{x:6,y:1},{x:-5,y:-4},{x:2,y:5},
  {x:-4,y:3},{x:5,y:-2},{x:-2,y:4},{x:3,y:-5},{x:-6,y:1},{x:1,y:3},
];
function DiscardPile({count,topCard,scale=1}){
  const vis=Math.min(count,7);
  const cardW=Math.round(CARD_W*scale);
  const cardH=Math.round(CARD_H*scale);
  const outerW=Math.round((CARD_W+30)*scale);
  const outerH=Math.round((CARD_H+20)*scale);
  if(vis===0) return(
    <div style={{width:outerW,height:outerH,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{width:cardW,height:cardH,borderRadius:3,border:'1px dashed #2a1a08',background:'transparent'}}/>
    </div>
  );
  const s=topCard&&CS[topCard.letter]?CS[topCard.letter]:GOD_CS;
  return(
    <div style={{width:outerW,height:outerH,position:'relative',flexShrink:0}}>
      {Array(vis).fill(0).map((_,i)=>{
        const rot=DISCARD_ROTATIONS[i%DISCARD_ROTATIONS.length];
        const off=DISCARD_OFFSETS[i%DISCARD_OFFSETS.length];
        const isTop=i===vis-1;
        return(
          <div key={i} style={{
            ...CARD_BACK_STYLE,
            width:cardW,height:cardH,
            left:Math.round((15+off.x)*scale),top:Math.round((10+off.y)*scale),
            transform:`rotate(${rot}deg)`,
            ...(isTop&&topCard?{
              background:s.bg,
              border:`1.5px solid ${s.borderBright}`,
              boxShadow:`0 0 6px ${s.glow}66`,
            }:{}),
            zIndex:i,
          }}>
            {isTop&&topCard&&<div style={{
              position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',
              fontFamily:"'Cinzel',serif",fontWeight:700,color:s.text,fontSize:Math.round(11*scale),
            }}>{topCard.isGod?'⛧':topCard.key}</div>}
          </div>
        );
      })}
    </div>
  );
}
function DeckPile({count,scale=1}){
  const vis=Math.min(count,7);
  const cardW=Math.round(CARD_W*scale);
  const cardH=Math.round(CARD_H*scale);
  const outerW=Math.round((CARD_W+12)*scale);
  const outerH=Math.round((CARD_H+12)*scale);
  if(vis===0) return(
    <div style={{width:outerW,height:outerH,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{width:cardW,height:cardH,borderRadius:3,border:'1px dashed #2a1a08',background:'transparent'}}/>
    </div>
  );
  return(
    <div style={{width:outerW,height:outerH,position:'relative',flexShrink:0}}>
      {Array(vis).fill(0).map((_,i)=>(
        <div key={i} style={{
          ...CARD_BACK_STYLE,
          width:cardW,height:cardH,
          left:Math.round(i*1.4*scale),top:Math.round((vis-1-i)*1.4*scale),
          zIndex:i,
          background:'linear-gradient(135deg,#1e1208,#0e0804)',
          border:'1.5px solid #4a3010',
        }}>
          {i===vis-1&&<div style={{
            position:'absolute',inset:0,borderRadius:3,
            background:'repeating-linear-gradient(45deg,#2a1a0820 0px,#2a1a0820 1px,transparent 1px,transparent 4px)',
          }}/>}
        </div>
      ))}
    </div>
  );
}
function InspectionPile({count,scale=1}){
  const vis=Math.min(Math.max(count,0),5);
  const cardW=Math.round(CARD_W*scale);
  const cardH=Math.round(CARD_H*scale);
  const outerW=Math.round((CARD_W+10)*scale);
  const outerH=Math.round((CARD_H+10)*scale);
  return(
    <div style={{width:outerW,height:outerH,position:'relative',flexShrink:0}}>
      {Array(Math.max(vis,1)).fill(0).map((_,i)=>(
        <div key={i} style={{
          ...CARD_BACK_STYLE,
          width:cardW,height:cardH,
          left:Math.round(i*1.2*scale),top:Math.round((Math.max(vis,1)-1-i)*1.2*scale),
          zIndex:i,
          background:'linear-gradient(135deg,#151c28,#090d15)',
          border:'1.5px solid #6a7fa8',
          boxShadow:'0 0 16px #6a7fa833,inset 0 0 8px #00000088',
        }}>
          <div style={{position:'absolute',inset:0,borderRadius:3,
            background:'repeating-linear-gradient(45deg,#8ca4d220 0px,#8ca4d220 1px,transparent 1px,transparent 4px)'}}/>
          {i===Math.max(vis,1)-1&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,color:'#d7e6ff',textShadow:'0 0 10px #9dc1ff'}}>◈</div>}
        </div>
      ))}
    </div>
  );
}
function PileDisplay({deckCount,discardCount,discardTop,inspectionCount,compact,baseHeight,deckRef,discardRef,scaleRatio}){
  const fontZoom = scaleRatio && scaleRatio < 1 ? 1 / scaleRatio : 1;
  const _ = (px) => px * fontZoom;
  const pileWrapRef=React.useRef(null);
  const [pileWrapWidth,setPileWrapWidth]=React.useState(0);
  React.useLayoutEffect(()=>{
    const el=pileWrapRef.current;
    if(!el)return;
    const update=()=>setPileWrapWidth(el.clientWidth||0);
    update();
    if(typeof ResizeObserver==='undefined')return;
    const ro=new ResizeObserver(update);
    ro.observe(el);
    return()=>ro.disconnect();
  },[]);
  const effectiveCompact=compact&&pileWrapWidth<320;
  const widthBonus=Math.max(0,pileWrapWidth-(effectiveCompact?240:320));
  // Dial back scale slightly for better balance
  const pileScale=(effectiveCompact?1.5:2.0)+Math.min(effectiveCompact?0.3:0.6,widthBonus/(effectiveCompact?320:480));
  const pileLabelFont=effectiveCompact?_(13):_(15);
  const pileMinHeight=effectiveCompact ? 140 : 220;
  return(
    <div ref={pileWrapRef} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',position:'relative',minWidth:0,minHeight:pileMinHeight}}>
      {/* Inspection deck — top-left corner */}
      <div data-inspection-pile style={{position:'absolute',top:4,left:8,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
        <InspectionPile count={inspectionCount} scale={pileScale}/>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:_(11),color:'#90a8d8',fontWeight:700,letterSpacing:1,textAlign:'center',textShadow:'0 0 8px #000000'}}>检定:{inspectionCount}</div>
      </div>
      {/* Deck — top-right corner */}
      <div ref={deckRef} data-deck-pile style={{position:'absolute',top:4,right:8,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
        <DeckPile count={deckCount} scale={pileScale}/>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:_(11),color:'#c8a96e',fontWeight:700,letterSpacing:1,textAlign:'center',textShadow:'0 0 8px #000000'}}>牌堆:{deckCount}</div>
      </div>
      {/* Discard — center */}
      <div ref={discardRef} data-discard-pile style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
        <DiscardPile count={discardCount} topCard={discardTop} scale={pileScale}/>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:_(12),color:'#c8a96e',fontWeight:700,letterSpacing:1,textAlign:'center',textShadow:'0 0 10px #000000'}}>弃牌堆:{discardCount}</div>
      </div>
    </div>
  );
}

function HoundsTimerBadge({secondsLeft,active}){
  if(!active||secondsLeft==null)return null;
  return(
    <div style={{
      position:'fixed',top:14,left:'50%',transform:'translateX(-50%)',
      width:88,height:88,borderRadius:'50%',
      background:'radial-gradient(circle at 35% 30%,#3a0a0a 0%,#170406 58%,#090102 100%)',
      border:'2px solid #b44a3a',boxShadow:'0 0 26px #b44a3a55, inset 0 0 22px #000000bb',
      zIndex:720,pointerEvents:'none',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      color:'#f0d0c8'
    }}>
      <div style={{fontSize:22,lineHeight:1,filter:'drop-shadow(0 0 8px #ff8a6a)'}}>🐺</div>
      <div style={{fontFamily:"'Cinzel',serif",fontSize:10,letterSpacing:1,color:'#f2a28e'}}>猎犬</div>
      <div style={{fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:20,color:secondsLeft<=5?'#ff7056':'#ffd7b0',textShadow:'0 0 12px currentColor'}}>{secondsLeft}</div>
    </div>
  );
}


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
  },[]);
  return(
    <div ref={ref} style={{
      position:'fixed',left:startX,top:startY,fontSize:26,
      pointerEvents:'none',zIndex:5000,
      transform:'translate(-50%,-50%)',userSelect:'none',
      willChange:'left,top,opacity,transform',
    }}>{emoji}</div>
  );
}

// ── About Modal ──────────────────────────────────────────────
const QR_IMG = "data:image/jpeg;base64,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6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2wBDAAICAgICAgMCAgMFAwMDBQYFBQUFBggGBgYGBggKCAgICAgICgoKCgoKCgoMDAwMDAwODg4ODg8PDw8PDw8PDw//2wBDAQICAgQEBAcEBAcQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/3QAEADv/2gAMAwEAAhEDEQA/APxjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/0PxjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/0fxjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/0vxjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/0/xjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/1PxjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/1fxjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/1vxjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/1/xjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/0PxjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAPcv2f/AIB+Mf2hvHUXg7wsBbW8Kia/vpFJhs7fOC7AY3Ox4RAQWPcKGYf0CfBz9kH4G/BiwgXRtAh1fWEUeZqepItzcu/cpvBSIe0arx1JPJ85/wCCe/w20/wN+zppGvJCF1Txe8mo3UmPmZN7R26Z67ViUMB2Z29a+5KtIhsrw2lrbKEt4UiUdAihR+lWKKKYgooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACq81pa3KlLiFJVPZ1DD9asUUAeOeOv2e/gp8SLGWx8YeDNMvDKCPPS3SC5TPdLiIJKp+jfWvw3/a+/Yz1f9nm5Txb4Wnl1jwRfS+Ws0gBuLGVvuxXBUBSrfwSAAE/KwB27v6K64/4geCNE+JHgnWvAniOITadrdrJbSggErvHyuuejI2HU9mAPak0NM/kborR1fTLrRNWvdGvhtubCeS3lA7PExRv1FZ1QWFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB//R/GOiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/qm/Zptktf2ePhpEgwG8OaVJ+MlrG5/U17dXjn7O3/Jv3wy/wCxY0X/ANIoq9jrQhhRRRQIKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP5QvjzbJZ/HL4iWkYwsHiPV4wPQLeSgV5RXsX7RH/JwHxN/7GfWv/S2WvHahmgUUUUgCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD//0vxjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP6sv2dv+Tfvhl/2LGi/wDpFFXsVeO/s7f8m/fDL/sWNF/9Ioq9irQhhRRRQIKKKQnHbNAC0UmecAj86MgHB4pXGkLRSZPsR7HNGQaqwWFopNw//VRnHUGk9BPQWikye4A+p5/KjPftQtQuLRSAjPOVHqeKM8ZptAhaKTPGe1L7dfpSAKKTPGaAc0AxaKKKACiiigD+U79on/k4H4m/9jPrX/pbLXjlex/tE/8AJwPxN/7GfWv/AEtlrxyoZoFFFFIAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//T/GOiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/qy/Z2/5N++GX/YsaL/AOkUVexV47+zt/yb98Mv+xY0X/0iir2KtCGFFFFAgpD2+tLTW6UmBy3jDxZbeD9EfWruJ7hFZU2oQD831rzWx+N+n3Ue46TPCPd0NdN8WbVLvwg0LkbfPhbn618rajeWumJFaKmZZjwGO1QM8fNkfzrepVhGGu56OX4F1ZWR9JD4x6Zu2Np8oc9AXWpT8X9LVgJrJ0P++tfM0d0l2GHnBblRhVHT8Gxz+dWpHsLKyU6pAsl4f4/OOf8AvneB09q+feeUqbfOz7KnwVVrJckT6MuvjDpEERmFjLJjnAdan8P/ABYtfE1nNNpOmSzSQt80QkTd0r5UuvEOhmNbSKMxTycZLEj/ANCNZHhfxTJ8N/FMl5aS/aYp0Viqncm4Fsgg4rkfFlDmdjupeG+IW8T6yb41aXatJDeaZNbTRn/VswJ/Os25+P3h1ATDYSzSjqm9Rj+X86+MfGXxNvfE/ie4vV8u3jjCjYsYU9PYGuabUTKjyRZZ5/4gSp/mK8nGcXRXwn2OTeEUa6/eOx93Wf7QWjXttPcR6TP/AKPwwLAjrjqK2rD40aXqUyw2ljK7MAfvLxnt+FfJXw412zsoLvw3qKqTdR7g5XeQwO773PrTvCHiOz0ywu7ySRmlSV1RguTlSa3ynPnWerPJ4i4Bo4PTlb87s+ybv4p6dYrvubKUDr99eldH4O8X2fjXT59SsojEtvMYSGIPIVWPT2avjIXmqazhbrOw9O1fTPwU04aZ4bvYgcmS8Zv/ACGg/pX2aldXR+dZnlVGlS0ep7HSijGKBzzTPlo32FooooKCiiigD+U79on/AJOB+Jv/AGM+tf8ApbLXjlex/tE/8nA/E3/sZ9a/9LZa8cqGaBRRRSAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP//U/GOiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/qy/Z2/5N++GX/YsaL/AOkUVexV47+zt/yb98Mv+xY0X/0iir2KtCGFFFFAgprHAzTqQ5xxQFr6I82+KrKvhKQkZHmxAY7cmvhHx9fQ6lZyQSSAGBSAFPzg9c444/GvvH4o6Zq+seFHsdDjJnmli5GTgA9eO3NfKmt/s0Xyac+urqDSaiFLMrZMbY7Y6kV5GbJqHMmfoPBapzkozXU8J8M+I5JLVI7OUsbfIw+AT796jv7uTWNVeR95ljIDfiK841ma/wDBGuyQ30XkMDgwkFS4P8SjuK9M8J6dqHiZhqenqywXCh94ztTbwQxHTvX5LmNOriJuK0P63ylYTC0lKVtEWEtY2nIcB3BwOeBXX+G/hlqXiS8S3LvbxgiQk53Mp7AA9OPWu98A+A7PW76Xy5RL5DZkmAzGvPf0r678M+FLLwxbSoizXLSEN5jnJX2Q44HtX0GVcPU+Vc+5+ecT+IbhVdOjHT+vI+D/ABX8MJvB2tRX0dsLyOXGQ4wMDrnr2rGv7HwZMV5lsb2QYETKPLDE4yGDZx/wH8K/RvW9C03XLCXT75RskH+swPMz25OelfOHi/4QXM0c1jEqXdrL91im6dV9FavXxPDuH5eh4WUca1aktZW+Z8pPomp6FcAxXsFy3zHEDMzDP1Ucc03wRpurancNbRl5IIJGklQDJAc8ZH4GtvUPhi/hq7ZtKuXW6hJRIWP73afUDBr62+Enwx1LwpoDa8WD6hfrukjdSBt6jI685rz8uyx0pXR6PEvE8ZUfZw1OF8OQpq11/ZtkFaVjjn+HI4r6W8D+Hr7w7ps9pqG0M8xcYJPBVR3HqK8R8XaHb3F8uoeGz/ZepopxHF+7ViO+FwTXpPwcn8SzaHejxM0pvFu2VfMLZMfloQRu5xnNffYXELZn4DnmB5aUqqfY9aoBzQc5wTmgV2rqfLSab0HUUUUiQooooA/lO/aJ/wCTgfib/wBjPrX/AKWy145Xsf7RP/JwPxN/7GfWv/S2WvHKhmgUUUUgCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD//1fxjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP6sv2dv+Tfvhl/2LGi/wDpFFXsVeO/s7f8m/fDL/sWNF/9Ioq9irQhhRRRQIKQnHzc8elLR7U0Cb6HD+PvFumeCPDkmuapII7dXSIkqTgvwF4714RcfGbQtQ08XGlXkbwjOV549u1dX+01Abj4SX8aHypPNhcHryM15V8IfgX4cu/BtjqmqxtLcXQaVmMjKB8xXoCOy15OZQk15H6BwfWpQg+fe7OV13QIfjNOukrYGaNfmaZflAx3GRzjNc1Z/Bm6+HGqrDPfte2MWVAXCeWXGQGGTnGcdq958QeLdK8ANHpWhj7PGpCwyRDzCzn7wO7d7mvFdZ8Yz6j4hd7lpLt5eZAyhU6DBBAXp9a+Lr14Upao/YaOGxuJ0pRbj0PrH4bR6Bo2nfZLa4WS5fas7erD29M5r1KORkmWJ/mUHccnsf8A9VfG/gnxFbw6nBYwAsHUOx5OACMD9a+lY9cjt9QtbSZwDcKox7g//Xr1KGJhOKaR8fnOR1FVcKmh6HE0RDdFwDz1rL1GeC3WF0I3BgGJPYmpVbzpEG3YuDn8MmuM8Z3UkGlP9kw0iHOOvOc/yr0qtFOF0fNYPLeWo1c6q40/TZ5gptklkc7lcDGBWrHiOQwIcuwAyBgACvOfBHiT+17VLa8YRTxpnngkjjpXem42hoXXYqA/Oe+aWDkm7M0xFGopctzzrx3q6eH5A9zppvLdsbpFkC7ecdcGj4TeJ9J8UaLqNxpELRQ214Ym3PvJcRoxwQF4wwqTxVDp3ivwbqEMN1kQxszFeo2jd/So/g74Z0vwx4QSHSsvHeyvO7Ek5bhcj2+UCvRoJe00PMz6klhmrnquOnGMUopP60CvTPgm9dB1FFFABRRRQB/Kd+0T/wAnA/E3/sZ9a/8AS2WvHK9j/aJ/5OB+Jv8A2M+tf+lsteOVDNAooopAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH//1vxjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP6sv2dv+Tfvhl/2LGi/wDpFFXsVeO/s7f8m/fDL/sWNF/9Ioq9irQhhRRRQIKQ0tI2ApJoYeh4J+0g2z4aXJ65uYB+GTXSeARDa+A9JgnkEcbwOxb+6CzDtn0rB/aJDN8OJFHzb7u3A+u48Ve8L6dc3fw+tdJ+VGkgaNCQMjcTj9TXBjqy5eVn2PDmHXJzS7v9D5t8dxWmpXctrDeRwyWchkgyHwzHIOSFP8LGvFbiXW4bia3NpJcEAfvIyuMf7O4g4+or6I1nUbDwrqq6Zq2lw6qrZAYIu5SASeSM9Aa5rRtY8M+IdZmU289rDDkRW6SMmc8EYUgda+LxmV+1Z/QOTZ5Ww9H93tYo/DDT9ViEmoz+XvKrKxJOFhHJUcZ3HIwOnvXuF3eDTZtF17VsxwvOdh5J8sbCCR681n+FtH0/UZrltZT+zNO0uYfuQ2yQ7Ccb2UgsAByCTmvoWTTvCHjOzhhljjuraJB5eMBVB+n0rfDZf7NJXPhc6zqpVqSqS3M+z8UWM2kNqjsc4YKoHU9vzr5g8Y/FW28PXVymstJvnuVljhQbj5QAGOeOcHvX1vpvgXQrBg0MPyghgsjF1+XkYDEgcivkv9oHwQNR8XfbbO1QpLZ7QQgz5nKgr9OlXmWPlSppJHhZXPnqttmJc/HnwVJqdlqelLNpuH8uRJE4bKn+4WHUV9ez63a3Ph4aoj/uJIt4JHUlc4+lfC2i/C7SdP8AhbqMHii2jubnyY3WVlzJG/mKSQx56HHWvVPAuu6n4m8MaX4fdZI4IlEeXbcXVQFHJ56UsDXk1c9fE4C8rpnI6Z4h8UeH21W/kmVtFeKVJ0ZvmUOjKMLj3r6p+EWpW+p+CLSe0ffEu5U9huJIPvkk18ofGv4XeJ9c8Vadpnhe4NraauC92ASE3IRgED1FfUvwe8Dy/D/wq+jTMWeSczHP+0qrxknjivqsFHW58VxNTap2PVvShaXjpSLXorqfBtafP9B1FFFIQUUUUAfynftE/wDJwPxN/wCxn1r/ANLZa8cr2P8AaJ/5OB+Jv/Yz61/6Wy145UM0CiiikAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/9f8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD+rL9nb/k374Zf9ixov8A6RRV7FXjv7O3/Jv3wy/7FjRf/SKKvYq0IYUUUUCCkPOBS01vuntSlsB5T8ZNJGr+EI4WJCxXkEr/AO7G2TU9gsWpaNAlncqI448rgdwTxwfarvxPuLiLwrJDbx+Y1zNHAfYSnaT+FeYaZ4K13T9OitrG62mE7uSOc8+teNmX8ZH6lwhg6bwjlJ68z/Q4LXNJtdP8eaXZuTL5ju0hI4GY3NfQ+k6HpUMHm21silgW3bR1Br5u17wL45stSuteuZxKmF2DIJU5AyMN3rs/DHj+TRbCWw10FbiLYUVs5fgk4/OuCLPuMVUvDkgzmvih8OrDUtRt/F2qTLOFkzNblhGTnk4JDZ6egr3P4d+GPA8sEeu+H4ZYo1IVt6qCCADjA+vrXhvxP8SeEvHGjRXOn6lb22qWLC4aEyLuIUHKEEg8nFc34D/ai1Kxnt9C1LSYEhBAJgDlkHA3Ngtjp39Kyckndny2MwsnHl6n3Vc6pbW0sdvOzBpOBheAOx61lajodnqs329srNGmyNymRj8/c14t4k+L3h5LaTUrNvtZiXeVjO4jHPYE15e37R3irWLYxeENHiPlZWQTLJkAHknle1cldqZwRyypTjdHffFOztdLsNO0suJLrVLkRf3QyhGc5HJ/hFQa/pdlpltpcemyos1kPnSNgAMBcZI+npXj1/b30Ot6J4w8QajJeSXUxkS0DK8EbyRsdo25ICgkcmvXRpejXCyaz4jmTTZL1sFCQqgLnGN3rmtcLT5T6DDKUI++zzb4l+KtVv8Awp5QLDW7a4gSDZljsaRdxz16Z7V9VfDaS/bwrbf2mzGfuWzn9a8A8etb+GNPtfHfhezh1kWGVcnMgO4gbm2EdM5r274TeNNU8c+GTquqWKWDxytGiRqwVlVQ275ie5I/CvpMHUu7HyPFcoul7p6bznNKtIeeaVa9BH530+f6DqKKKACiiigD+U79on/k4H4m/wDYz61/6Wy145Xsf7RP/JwPxN/7GfWv/S2WvHKhmgUUUUgCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD//Q/GOiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/qy/Z2/5N++GX/YsaL/AOkUVexV47+zt/yb98Mv+xY0X/0iir2KtCGFFFFAgozjr070UU0r6CaMfWIIbi0VLlNyhlYj3WsfzBJG5iTGCAOK6uSJJ12y9KqiwtQoULx1OCa83F4Sc53TPp8qzeGHp+zle17/ANanknjTU1gNvp0wAjmIMj9kCAvk4PTj0rz3XNR+Hfi63jisp/t97ENiG13Kcp8rZyBnBGK+gdS8GeHtXcyXtuZS6lf9bIvGMEYDVznhr4Q/D/whff2h4f00QTncx3TSyjLncxxIzAcntXP/AGbNdT36fF9COqUvw/zPnX4Y/Dqzi8Van/wkenGMShzD5mCWG72J9qs+L/Cfg4XiamrRWjxlomEQxuCHI3AA+pr61/sHShqP9rCEm6Kld25sYPP3M7e3pXKXHwt8EXYn82xaQXJJbdNL1PXHzfL+Fc9fKKsl7rRH+t2HlPmlGX3L/M+Co11O5lkS1MSxPnLKCBheea9s+EP9g2zXial5W6UlHbB5yBXv9p8H/AFjEYbTTiqNnOZpWznryWJqe1+FHgWyV/sunshc5Y+dL1/76rChkVdPVr73/kepiOMsFKCjGMvuX+Z4Dc6tF4cg1JnsF1KytrlzG4UERoXYADJU55A/OvV/APhSx8R6a+t63Gbi4usFIpSQip/CQOOoPrXbL8PPCX2WSxFkWgkOXQyO2TnPdvWuthsra3ihhtoxGluAqBflwB2OOvTvXYsukjw63FdHaN/w/wAzxXRdJsYtb1/w1HFvs1dEEecptYHd+legeCvDtj4asbqysC5gacyIHbO3KKMDGOMite28NaRaXl3f20RE962ZWLsTkDjAJwOvatiKCOGMLGuE6/jXVhsPOEjyMwzmnXpciTJCc+1KtJinCvTaPnIvSzFooopAFFFFAH8p37RP/JwPxN/7GfWv/S2WvHK9j/aJ/wCTgfib/wBjPrX/AKWy145UM0CiiikAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/R/GOiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/qy/Z2/5N++GX/YsaL/AOkUVexV47+zt/yb98Mv+xY0X/0iir2KtCGFFFFAgpD0paOtADQcUnHenYowKS0DT+mIDS5owKXAqrsfMJmm0/ApMUnruFxMCil2ijFLlitkC02Ak9BQc4oxS0xp+Yg6c0nApcUYFNMnz6iAUtG0UoGKB8ze4UUUUhBRRRQB/Kd+0T/ycD8Tf+xn1r/0tlrxyvY/2if+Tgfib/2M+tf+lsteOVDNAooopAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH/9L8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD+rH9nb/k374Zf9ixov8A6RRV7HXiP7NNyl1+zx8NJUOQvhzSo/xjtY0P6ivbq0IYUUUUCCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD+U39oj/k4D4m/9jPrX/pbLXjter/Hm5S8+OXxEu4zlZ/EeryA+oa8lIryioZoFFFFIAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//9P8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD+jD/AIJ7/ErTvHP7Ouk6Ak6tqng95NOu4s/MqF2kt3x12tEwUHuyN6V9yV/K38Afj34y/Z68dReMvChFxBKohvrGViIby3zko2Pusp5RwCVPYqWU/v78JP2yfgJ8XNMgnsvEltoOqOAJdO1WVLS4R+6oXISUehjZuOoByBaZDR9T0Vn2eraVqCCXT72G5RujRSK4P4qTWhTEFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUVXmu7W2UvcTJEo7uwUfrQBYrj/iB430T4b+Cda8d+I5RDp2iWslzKSQC2wfKi56s7YRR3Ygd64zx1+0J8FPhvYy33jDxnplmYgT5CXCT3L47JbxF5WP0X61+G/7X37Zmr/tDXKeEvC0Euj+CLGXzFhkIFxfSr92W4CkqFX+CMEgH5mJO3amxpHxPq+p3Wt6te6zfHdc388lxKR3eVi7fqazqKKgsKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD/9T8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD/9X8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD/9b8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD/9f8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiut8A6PoniHx14c0DxLef2dpGpalZ217deYkXkW00ypLLvkBRdiEtuYFRjJ4r9ZvDX7Bn7KXjO4mtPB/xIvtdnt1DyR2GqabdOiE4DMsUDEDPGTQB+NlFfstpH7Bv7J2ta7N4Y0r4j3+o6vbmRZbG21XTZLqNojiQNEtuzjYeGBXg9a/OD4v+BPCHwf8Aj5qngZlutW8N6Df2yypLIq3M9sUjklXzI1RQxDMAQoxxQB4RRX6R/tt/AP4f+FPBfgj4t/BrTo7LwxqFvFaSrBuZXEyG4tbhmcs7NIhZWZjnhBnNdd8Ofgx8KPDH7Der/FH4peHLfUdUv0u7+yml3RXMbykWtlGssZVwjyKsm3JBDkkGgD8rqK6Dwnpun6z4q0bR9Xn+y2N9e28FxMGVDHFLIqu+5sqNqknJGB3r9hpv+CeP7NtvoQ8UXHjnVotGKq4vmvrBbUq7BVPnG32YZiADnkkCgD8WaK/aWy/4J5/s16lo83iL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Wrz4ZyfCC/8AEU934WfyAtrNtcxpbkNHEkhHmCMELhN20bRgCrXw/wD2gvin8MPBniDwH4N1drHTPEQHm4z5kD9He3fP7p5E+R2HOMEYYAjxWigBSSTk8k165D8d/itb/C1/gtDrm3wbJkNYfZrY53T/AGk/vjF53+t+b7/t04ryKigD2/4RftFfFr4Hpd23w91n7JZ37iSe1mijngeQDAcLIDtbAAJUgkAA5wMXvi1+038ZfjXp8Oi+PNbE+lwSLMlnBBFbw+aoIDt5ahnIBONzEDsBXgVFABX0l8Uv2qfih8W/BejeBPEYsrXTtDkikgayjlhlZoYmhXzGMrAjax7Dmvm2igD2f4YftB/F34OHUj8PdfbT/wC1/J+0+ZDDdb/I3+Xj7RHJtx5jfdxnPOcCvHZppLiaS4mO6SVizHpkscnpUVFAH058Jf2rfiF8HPhxrPwx8Nadpd1peuTXM80t3FO9wrXUCW7hGjmjUALGCMqec5yOK+Y6KKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/9f8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD/9D8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD/9H8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD/9L8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD/9P8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/TH9kD/AIJx+LP2h9Bg+I3jvU5fCXg64kH2XZEHvdQiU4keEOQsUfG1ZGDZPIQqMn9Dv+HP37NP/Qy+Lv8AwNsP/kCv098M+HNH8H+HNL8J+HrcWml6NbQ2drECSEhgQIi5PJwoHJ5PU81uUAflN/w5+/Zp/wChl8Xf+Bth/wDIFH/Dn79mn/oZfF3/AIG2H/yBX6s0UAflN/w5+/Zp/wChl8Xf+Bth/wDIFH/Dn79mn/oZfF3/AIG2H/yBX6s0UAflN/w5+/Zp/wChl8Xf+Bth/wDIFH/Dn79mn/oZfF3/AIG2H/yBX6s0UAflN/w5+/Zp/wChl8Xf+Bth/wDIFH/Dn79mn/oZfF3/AIG2H/yBX6s0UAfjr45/4I7fCm50N1+GvjXWtO1hTlW1f7Ne2zjB+UrbwWzpk4+bc2B/Ce34a/FX4V+Nvgv461P4d/EHT20/WNLfDrndHLG3KSxP0eNxyrD6HBBA/tUr8Cf+CymhaVbeNfhp4jggCahqFhqNtPKOrxWssLRAjp8pmfnrzjsKAPxdooooAKKKKAO2+HXw68Z/FjxlpvgHwBpkmra5qrlIIIyFztBZmZmIVERQWZmIAAyTX13qX/BNT9sTS9OutSl8GRTJaxPKyQajZzSsEBYhI0lLOxxwqgkngDNTf8EztR0/Tf2wvCD6hcxWqzwajBGZXCB5ZbSRURSxGWZiAoHJPA5r+pi8vLTTrSfUNQnS2tbZGllllYJHHGg3M7s2AqqBkk8AUAfyDfBf9kT4/wDx/wBK1DXPhj4ZN9p+lz/ZZp57iG0j8/G5o1M7pvZQQWC525GcZFO+NP7IP7QH7P8Aolj4k+J3hk2Gl6hP9mjuILiG7jWbG5UcwO+wsAdu7G7Bx0r9xP8AglPqumXvwI8V2VpeQz3EPizUJnjSRWdI5obfy3ZQchX2ttJ4ODjoaf8A8FXtT020/Zv0qwurqKG5uvEdg8MTuqySLEkxkKqTlggI3EdMjPUUAfkbpH/BNj9sHWtKtNXt/BccEV7EkyR3GoWcEyq4DASRSSh0YA8qwBB4IBrxjTv2VPj1qnxju/gLZ+FZj4zsUaWe1Z41jjgUBvPM5byvKYMu1921iygHJAr+wXTdQsNW0611TS7mO8s7yJJoZ4XEkcsbgMro65DKwIIIOCK/MLwT4j8Pv/wVX8c26anbNJN4OjskUTIS11G1nI8AGeZFRGZk+8ApJHBoA/I3xb/wTs/a28F+GtS8V6x4NWSx0qFricWt9a3MwiTlmWKKRnfaMkhQTgHiuM+D37Fn7Rnx28J/8Jx8OPC4vNEaZ4I7me6t7RZXiOH8sTuhdVb5SygjcCucggf1X/FjU9N0b4X+LdT1e6isbO30q9aSad1jjQeSwyzMQBycV8e/8Ew9R0+8/Y78J2lpcxzz2F1qkVxGjhmhka+mlVJAOVYo6sAeSrA9CKAP59Pi/wDsn/Hv4GX2h6f8Q/C0ttJ4kl+z6ebaSO8Se4JCiBWt2ceaSRtQ4Zs8A849ug/4Jl/tj3EEc48HQR+Yoba+qWKsuRnDDzuCO4r9Xv8Ago/4h0HSdc+AUOp6lb2clv43sL2RZZUQpawuoknYMRiNMjc54GeTX6fRyJKiyxMHRwCrA5BB6EEdqAP48PA37Knx7+IvxH1z4UeGfCk7+JfDW7+0oJ3jt0tdpwPMllZY/nP+rwx3jlcrk13/AMSP2Cv2o/hT4O1Dx74w8IiPRtKUSXUtteW108MWcGRo4ZGfYvVmAwo5OACa/Y/9lzxL4ev/ANvT9pKCx1S1uJL3+zPIWOZGMv2RPLn2AH5vKchXxnaeDg19Wftlalp+l/ssfFGbUrqK0SbQL6BGlcIHlmiZI41LEZZ2IVQOSSAKAP5vvhj+wh+0/wDF3wbY+PvBfhIS6JqW4201zeW1o0yKceYsc0iuUJ+62MN1GRzXDfEX9lX48/Czx1oHw38X+FZotf8AFJVdLht5I7lLtmcIVjkiZkLKSN4LAqCC2AQa/pm/Ye1PTtU/ZP8AhnJpt1Fdrb6RDBIYnVwk0WVkjbaThkIwynkHrXy7+2b4i0Cw/bJ/ZfhvtTtrd7HUb6S4WSZEMKXD2yQtICRtWRkZUJwGKkDoaAPywk/4JkftjxxtJ/wh9u20E4XVLEk47Aed1rw34Tfso/Hr42a3r/h7wB4WluLzwvIYdSFzJHZrbThynku07IPNyrZT7wwSRX9hzMqqWY4A5JPQCvy4/wCCe3iHQdW+LP7Sy6XqVtdm88ZXF5AIpUcy2r3FyFmTaTujORhxkcjnmgD8Xvi5+xL+0j8D/CEnjz4heFha6HBLHFNcW91b3YhMp2o0ggd2RS2F3EY3EDOSM9P4L/4J6ftYePvCml+M9A8HqNM1iBbm2NzfWttK0L8o5ilkV1DDDLuAypB6Gv3Z/wCCkupadY/sceO7e9uoreW/OnQ26SOqtNKL+CQpGCcs2xGbAydqk9Aa+jP2f9R0/VfgX8Pr7S7mK8t30DTFEsLiRCyWyIwDKSMqwKkdiCDyKAP5F/i/8FviV8B/Fp8E/FHR30fVTClxGpdJY5YZMgPHLGWR1yCpIPDAg8g15ZX6w/8ABX7UbC7/AGhPDNpaXMU09j4chjuI0cM8LtdXDqsgBypKMrAHkgg9CK/J6gD6Q+CX7JXx5/aF0rUNd+Fnhs6lpumzC3luZriG1iMxXcY0ad0DsqkFgudoZc4yM2fjT+yB+0D+z/odl4m+J3hr7BpV9P8AZkuYLiC7jWYjcqSGB32FgDt3Yzg45FftR/wSF1LTpv2cNf0mG6ie9tfEl1LLArqZY45rW2EbsmdwVyjBSRglWx0Nb/8AwVg1LTrX9miwsLm6iiubvxBYtDE7qskgiSUuUUnLBQQWI6ZGetAH5F6N/wAE2f2wdb0mz1i28FpBDexJMiXGoWkEyrINwEkUkodGweVYAg8EA18nfEr4aeN/hD4z1DwB8Q9Lk0jXNMYCWFyrAq43I6OhKujKQVZSQa/tN0nULDV9LtNU0q5jvLO8iSWGeFxJFLG6hldHUkMrA5BBwRX8wH/BUDUdP1D9rvxB9guYrn7NY6fBL5Th/LlSAbkbBOGXPIPI70AfntRRRQAUUUUAew/Bj4CfFX9oHxFc+GPhTojaxeWUJuLhjJHBDDHnAMksrKiljwozlucDg49m+I37A/7Unwr8G6l498XeElj0bSE826ktr22uniizhpDHDIz7F6swGFGScAEj7R/4I36np1v8QfiLpc91FHeXmm2TwwM6iSVYZZPMZFJywTcu4jpkZ61+tv7Yuo6fpn7LXxTm1G5jtY5fD2oQI0rhA0s8LRxoCxGWd2CqOpJAHNAH8fVFFFABXvHwQ/Zo+M/7RNzqcHwn0A6qmjojXU0k0VtBGZDhE8yZkUu2CQoJOATjFeD1+8//AARq1HTx4c+Jmkm5iF813p04g3jzTEI5VLhM7toYgE4xkgUAfmR8W/2I/wBpL4IeD5fHvxB8LC10O3ljimuLe6t7sQmU7UaRYHdkQthdxG3cQM5Iz0vgn/gnt+1f8QPCml+NPD3g9RpmsQrc2xub61tpXhflHMUsiuocfMuQMqQehFfu/wD8FINS06w/Y48e299dRW8t8NPgt1kdUaaX7dBJsjBOWbYjNgZO1SegNfQf7PWo6fqvwG+Hd7plzFeW7eH9LUSQuJELR20aONykjKspUjsQQeRQB/Khr37KXx78N/F3TfgZqnhSZfGGsIktnaxvHJHPCwJMqzqxi8tArb33YTa27GDXtWof8E0v2xNOsLnUJPBkUy2sbylIdRs5ZWCAsVRFlLMxxgKBkngc1+sXxX8Q6BB/wVE+EEE+pW0clv4avLaVWmQFJ7iO+8mJgTw8m9dinltwwDkV+nl3d2thazX19MlvbW6NJLLIwRI0QZZmY4AUAZJPAFAH8gXwX/ZH+Pvx/sNT1X4ZeGWvrLSJxa3E9xPDZxi4xuMStOybnUYLquSuRnGRmb40/sf/ALQH7P2gWnin4n+Gv7P0m8n+zLcwXMF3GkxG5VkMDvsLAHbuwDggc1+4P/BKzWNJvvg345sbK9hnuY/GOo3DRJIrOsM8FuIpCoOQkhRtrdG2nHQ1J/wVl1HT7b9l2HT7i5iiurzXLIwRM4EkojWUvsUnLbQQWx0zzQB/NDXpPwn+EXxC+N/jGDwF8M9JfWNZnjeby1ZY0jii+/JJJIVREGQMsQMkAckA+bV+n3/BJTUdPsf2o72C9uY7eS+8OX0FusjhTNL9otZNiAn5m2IzYHOFJ6A0AeQeKv8AgnT+1x4P8Oaj4p1XwasllpcL3E4tb60uZvLjGWKRRSs7kDJwoJwOAa4X4OfsY/tFfHjws3jX4b+F/tuiiZoEuZ7q3tElePh/K890LhTwWUEBsjOQQP6uvidqenaN8OPFGqatdRWVnbaZePLNM6xxoohblmYgAfU18W/8EvdS0+8/ZB8N2VpdRT3Fhe6nHcRo4Z4Xe7kkVZFBypKMrAHqCD0NAH8+nxv/AGXPjf8As7R6Zc/Ffw8dLtdXLpbXEU8N1C0ictGZIGdVfHIVsEjJGcHHz7X9CH/BYzUtOX4T+BNHa6iF/Lrbzrblx5rQpbSK0gTO4qrMoLYwCQO9fz30AFFFFABW14b8Oa74v1/T/C3hixl1LVtVnS2tbaFd0kssh2qqj3P4DqeKxa+kv2PNR0/Sf2ovhjqGqXMVnaw65aF5ZnEcagtgbmYgDkgcmgD2p/8AgmR+2OiM/wDwh9sdoJwNVsSTj0/fV8K6xo+q+HtWvdB1y0lsNR06aS3ubeZSksM0TFXR1PIZWBBB71/cKSFBJOAO9fxsftM6jYav+0X8TtV0q5jvbK78S6tLDPC4kilje7kKujqSGUg5BBwRQB4ta2tze3MVlZRPcXFw6xxxxqXd3c4VVUckknAA5Jr9s/gF/wAEjE13w3aeI/2gPEV7o93fweYNI0nyUuLVmIKie5mSZCwX7yLHwTjfwc/AP7BWhaV4i/a8+Gum6zALm2W/luQh6ebaW01xCT67ZI1OOhxg8V/W5QB+U3/Dn79mn/oZfF3/AIG2H/yBR/w5+/Zp/wChl8Xf+Bth/wDIFfqzRQB+U3/Dn79mn/oZfF3/AIG2H/yBR/w5+/Zp/wChl8Xf+Bth/wDIFfqzRQB+U3/Dn79mn/oZfF3/AIG2H/yBR/w5+/Zp/wChl8Xf+Bth/wDIFfqzRQB+U3/Dn79mn/oZfF3/AIG2H/yBR/w5+/Zp/wChl8Xf+Bth/wDIFfqzRQB+U3/Dn79mn/oZfF3/AIG2H/yBXz18ff8AgkYuheG7vxH+z/4ivdYu7CDzDpGrCF7i5ZSSwguYUhQMV+6jR8kY38jH7vUUAfw3XNtc2VzLZ3kTwXEDtHJHIpV0dThlZTgggjBB5BqCvsr/AIKC+HNH8K/tifEjStCtxa2r3NneFASR519Y291Owz03Syu2OgzgcYr41oAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//9T8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/uYr4D/AOClPxO8a/C39mS81PwHqUmj6hq+pWmmyXcDNHcRQTLJJJ5MikFGbywpYchS2MHBH35X5if8Faf+TWbX/sYrD/0TcUAfzgf8JT4n/wCgxef+BEn/AMVR/wAJT4n/AOgxef8AgRJ/8VWDX1P+z9+xv8cv2ldOv9c+HGm266Pp0hgkvr64FvA1wArGFOGdnCuGOF2gdSCQCAfO3/CU+J/+gxef+BEn/wAVR/wlPif/AKDF5/4ESf8AxVfop/w6d/ar9dB/8GD/APxmj/h07+1X66D/AODB/wD4zQB+df8AwlPif/oMXn/gRJ/8VR/wlPif/oMXn/gRJ/8AFV+in/Dp39qv10H/AMGD/wDxmq15/wAEpP2r7W0nuYYdEu3iRnWGLUcSSFRkIm+NE3N0G5gM9SBzQB+en/CU+J/+gxef+BEn/wAVX2B+wr8Y/iT4Q/ab8DabpOvXR0/xJqdtpuo2k00klvcW9w3l/PGWwWj3Fo26q3qCQfjjxBoOs+Fdd1Dwz4itHsNU0m4ltbq3lGHhnhYpIjD1VgQa95/Y9/5Om+FX/Yxad/6OWgD+wivwg/4LN/8AIZ+FH/XvrP8A6HaV+79fhB/wWb/5DPwo/wCvfWf/AEO0oA/EaiinpG8h2xqWPoBmgBlf0FfCT/glH8BPEnwx8LeJPF2v6/c6vrGnW17cPaT21vAGuoxKFSN7eVgEDBclznGeM4H8/LxSxjMiMufUEV/RH8IP+Co37Peh/C3wpoPifTtcstV0nTbWyuIoLRLiIPaxiEskokXcrbdw+UEZwRkUAflf+3N+zX4d/ZW+MWn+E/BGrXd9pep6bDqlsbsr9ptyZZISjSRhFc74i4YIuAQMZGT8hTeI/ENxE8Fxql1LFICrK08jKwPUEFsEGvsb9vj9pHwh+018YrDxZ4Gsbu00nRtKh02N7xVjmnZZZZ2cxqW2AGXaAWJO3dxnA+H6AL1lqmp6YXOnXc1qZMbvKkZN2OmdpGcUt9qmp6ns/tK8mu/Lzt82RpNueuNxOM4FU0ikkz5aFsegzQ8UkePMQrnpkYoA1oPEfiG2iS3t9UuoooxhUSd1VQOwAOAK+uP2Gf2fNI/ac+OM3hPxXrV7pdlp2nXGrXE1kwW7mKSxQhElcMEJaYMWKtwCMZOR8XV9qfsHftFeE/2aPjZP418bWV1eaRqmlXGmStZhXmhMssMyyCNiN4zCFI3AgNu5xggH6ufFD/glv8H7f4d+IrzQPGfimPUbSymuIDfXsN3a74F8wCWFYIyynbjhwR17Yr59/Yh/4J//AA4+M/wH074qeM/FGv2d3r1zd+XbaRcx2cUUdrM9vh98UpkdjGW3fKACBjgk/RHxK/4Kofs8Xvw/8Q2HhvTddv8AVLyxnt7eGa0S2jaSZDGN8pkfYo3ZJ2k4HAJr5+/Yk/4KDfBj4JfALSfhX8QbDVotR0O4vCstlbrdRTxXU73Ab76FGUyFCpB6Bs84ABwf7Z/7BPgz4T658M/+EI8VatcxeNtbt/D8w1h0vZIHuHG2eN0WH5VBOYyOTyGHNfdVn/wSt+BltZwW8vjHxk7xRqrFNTgjQlRglU+zHaPQZOOma+Hv2y/2+vhh8XdY+GD/AA70fUrmHwTr1vr9098i2hlNs4228agyHLgHLnheMBucfb8H/BWX9liSCOSaLX4ZGUFkNhGxUkcjImwcdMigD8Ef2gfhs3wD+Oniz4a6Lq014nh678qG8/1MzxyxrKu7afvBXCsRwSCcAHFeQXmt61qEX2e/1C4uYsg7JZXdcjocMSM167+0n8VNN+Nvxz8YfFLRrOXT7DX7wSwQzMGlWKONIkL7eAzBAxAJCk4ycZPh1AGnZ63rOnRGDT7+4tYydxWKV0XJ74UgZ4r0/wCCvgSb43/Gfwl8OdY1Wa2XxJfw2cl2czyxxscsVDHk4Bxk4zXkKQzSDdGjMPUAmvW/gN8RbT4O/Gjwf8StWspb218OajDdzW8ZCSvGpwwQtxuwSQDgE8ZHWgD+gif/AIJX/AqWGSNPGPjMM6kAtqkDAEjuPsoyPbvX87fxB8OX/wAKPib4r8DafqcksnhvU77SzdRboGmW0naLdtViVDbA23JxX9EL/wDBWT9lZUZkTX3YAkKNPQZPpzNX87XxQ8XL8Sfid4t8fWlm9oniXVr7U1ty3mNCt3O8wQsANxXdgnAzQByV7rGr6kixajfT3SIchZZWcA+oDE81Ja6/rtjAttZajc28KZ2pHM6KMnJwAQOTWa8MsYzIjKD6gilWCd13JGzA9wCRQA65ubm8na5u5Xnmf7zyMWY445JyTxUFOZWQlXBUjseKbQBestT1LTS7addzWpkwGMUjJux0ztIzS32q6nqez+0rya78vO3zZGk25643E4zgZqmkckmRGpbHoM0rxSx48xCuemRigDVg8R+ILaFLe21S6iijGFRJ3VVA7AA4FfV/7Ef7O2g/tTfG2fwT401W7sdMs9OudVuntSv2mfy5YogiySBwhLTBixVuARjJyPjevtD9hD9ojwp+zT8bpfG/jayurzSNS0u40yVrMK80JlkimWQRsRvG6EKRuBw2ecYIB+pfxE/4JLfAHTPAmv6n4U8Q+ILTV7KynuLaS7ntriASQoXAkiS3iZlOMHDqRnPbFfzyV/Rz8Rv+CqX7O934C8QWXhzTddvtTu7GeC3hmtEto3kmQxrvlMjbFG7JO0nA4BPFfzjUAdV4F8Mt418beHvBq3AtDr2o2lgJiu8RG6mWLftyN23dnGRn1r+h22/4JD/s0x20SXeueJ5p1RRI63lois4HLBfsjbQTzjJx6mv55fAPiZfBXjrw54ye3N2ug6lZ35hDbDKLWZZdgbB27tuM4OPQ1/R1bf8ABV39mCa3imltfEMTuisyf2cjbSRkjImwceo4oA+B/gR+wD4P8U/tU/E/4Sa94r1OPRPhysBimsNlte3Ivk3xBpWEip5anD4Q7z02jivor9pT/gmv8KvBXwN8Y+OPC3i7xLJqXhrT59Tjj1O8iu7aUWiGRo2jWGIguoIVg3ykg4I4rwD4If8ABQH4Y+Df2qviv8XvFWjajbeHPiEtutsYQk1zb/YVCRmWLKg+aoydrHYcD5h8w+gf2jf+Cm37P3j74HeNPAfgqz1i81jxJplxpsK3FslvCn2pDE0jv5jnCKxbaFyxAGRnIAOW/Zh/4Ji/BX4o/A3wr8SPHuva3JqviW2F8UsJoLaCGOQ/JGFkgmZioHLbhknhRXiP7R//AAT68BfDT4+/CP4Z+CfEeoJo3xMuZbSVr1Y7i4tGtni8x0eNYlcOso2qVG0qSSQcD6D/AGXP+ClvwF+GvwI8JfDvx5Y6vZ6v4btRYyfZrdLmGVYj8sqvvQjcDypXKnIyRgnw/wDaU/b8+GHxF/aB+DnxI8E6PqN3ovw1upru6NwEt5rk3Txb0ijy4HlrDkFm+Ytj5QNxAPtST/gkR+zI0bLFrXidHIO0m9tCAexx9jGa/n6+Ivhq++E3xQ8WeBNO1SSWTw3qd7pZu4t0DTraTtFv2qxKhtgbbk4r+iST/gq3+y8iM4t/ELFQTj+zVGcduZsV/Op8V/GkPxH+KHi74hW9q1jF4m1a+1JLdmDtEt3O8wQsAASobBOBmgDkr3WdX1KNYtRvp7pFO4LLKzgHpkBiea/oI+Cf/BMX4R658JPCXiDxH4x8Uf2jrOm21/MNPvYrS1RryMT7I4mhlIChwpJc7iC3GcD+eWv6HPg3/wAFSf2dfDfwo8I+GfFllrVjq+i6XaWFxFDapcRb7SJYdySeYmQ4QMMqCM4PSgD8x/28/wBnHQ/2YvjFp2g+Edbv9VsdZ06LUoXv3V7uBxI8JVpkCB/mi3KwVSAQvOMn41m8SeIriJ4J9UupI5AVZWnkKsp4IILYINfZn7fP7Svgz9p74t6X4n8AWd3b6To2lx6ekl4qpLO/myTM3lqW2AGTaMsScZ4zivh829woLNEwA6kqaALFlqepaaXbTrua1MmAxikZN2OmdpGaW+1XU9T2f2leTXfl52+bI0m3OM43E4zgZqhRQAVNb3FxazJcWsjQyxnKujFWU+oI5FC287gMsbEHuFNR7HLbAp3ZxjHOfpQBq3PiDXr2Bra81K5nhfG5JJnZTg5GQSQea/ZD9hz9gH4dfGn4G2nxU8aeKNesrnW7q5SK20i5js44o7SV4P3heKUyMzKWz8oAIGDyT+LrQTopZ42UDuQQK/an9h//AIKCfBr4IfAjT/hX8Q9P1aLUNFurp0msrdbqKeK6mecN99CjKXKlSDnAIPJAAPJP+Chf7F3gr9nHwz4X8ceCvEWr6pDql4+nT2+rzJdSK3ltMskcqJFtXCkFCp5III5FflZX6s/8FDP21fhh+0n4S8L+CvhvYaiq6XfPqFxc38S24B8poUjSMM5bO4sWJAGAADk4/KagD73/AGBf2T/B/wC1R448Rad461W80/SPDlnFO0VhsSeeS4dkTEsiyKiptJPyEtwMjmvvD9ob/glz8Dvh78FPGPj/AMEa9rsWr+GdNuNSjF9Nb3EEi2iGV42SOCFgXVSoYN8pIJBHB+HP+CfX7VPgT9l/xx4lvfiHZXk+l+I7KKET2SrLJBLbuzqDExXcr7iMhsqQOCCSPvr9on/gpx+z748+CHjXwJ4Ls9YvNY8S6Xc6bAtxbJbxJ9rjMTSO/mOcIrFsBSWIxxnIAOQ/Zf8A+CY3wW+KfwN8LfEnx9r2tyar4lt/tpTT5YLaCGOQ4SMLJBMzMoHLbhknhRivFf2k/wDgn14C+GXx2+EXw38EeI9QTR/ibdy2UrXyx3FxaPbPCJJFeNYVcOsw2qVG0qSSQcD6E/ZX/wCCkvwM+G/wH8KfDzxzp2s2ureGrb7C5tLZbqGVYzlZVfehG4HlSMg55IwT4h+03+318M/iH8fPg58QvBei6lc6P8NLya+uvtSpbT3Junh3RxR5cDYsOQzN8xbGABkgH3dL/wAEsPgVJE6L4w8ZgsCATqkDDkdx9l5+lfzrfFbwQPhn8TvFnw6F3/aA8Mare6b9o2eX532SZot+zLbd23OMnHrX9Fj/APBVr9l5UZhb+IWIBOP7NUZ/Oav51/i343h+JfxT8X/ES2tGsYvE2rXupJbuwdolu5nlCFgACVDYJwM0AfSH/BO//k8r4bf9fF9/6b7mv6xa/k6/4J3/APJ5Xw2/6+L7/wBN9zX9YtAH4R/8FePix4/0bxf4P+F+i6xPpvh650xtSuYLaR4jc3DXDxr5xVhvWMRAopGAxJOTtx+MP/CU+J/+gxef+BEn/wAVX6sf8Fif+S4eC/8AsXR/6WT1+RNAG9/wlPif/oMXn/gRJ/8AFUf8JT4n/wCgxef+BEn/AMVX2t8Mv+Cb37TvxT8F6d470nTdP0zTdXjS4tF1G8EM01vIoeOYIiyFUcHK7sMRzjBBPff8Onf2q/XQf/Bg/wD8ZoA/Ov8A4SnxP/0GLz/wIk/+Ko/4SnxP/wBBi8/8CJP/AIqv0U/4dO/tV+ug/wDgwf8A+M0f8Onf2q/XQf8AwYP/APGaAPzr/wCEp8T/APQYvP8AwIk/+Ko/4SnxP/0GLz/wIk/+Kr7V+J3/AATf/ad+FngvUfHmr6bp+p6bpEbz3a6deCaaG3jUvJMY3SMsiAZbblgOcYBI+DKAP29/4JD/ABZ8f6z4t8YfC/W9Yn1Lw/a6aupW0FzI8ptpxcJG3klmOxZBKS6gYLAEYO7d+7dfzvf8Edv+S3+Nf+xdP/pXBX9ENAH8pv8AwUn/AOT1PiL/ANwj/wBNNnXwzX3N/wAFJ/8Ak9T4i/8AcI/9NNnXwzQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB/9X8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/uYr8xP+CtP/JrNr/2MVh/6JuK/TuvzE/4K0/8AJrNr/wBjFYf+ibigD+aKv6i/+CXX/JoHh7/sIan/AOlLV/LpX9Rf/BLr/k0Dw9/2ENT/APSl6AP0NooooAKKKKAP5Jv2+f8Ak7/4mf8AX/F/6TQ1yH7Hv/J03wq/7GLTv/Ry12H7fP8Ayd/8TP8Ar/i/9Joa4/8AY9/5Om+FX/Yxad/6OWgD+wivwg/4LN/8hn4Uf9e+s/8AodpX7v1+EH/BZv8A5DPwo/699Z/9DtKAPxGr96P+CN2i6RJ4X+JGuvZQtqS3llbC5KKZhAY3cxhzyELAMQDgkAnoK/Bevoj4DftTfGb9m6TVf+FW6vHZ2+shPtNvcQJcQs8X3JAjj5XAJGR1Bwc8YAP6Gf8AgpZoWi6h+x540v76wguLnS5NOntJXjVngle+giZ42PKsY3ZCR1ViO9fS3wB0LRdE+B3gHTtGsYLG1TQ9OcRQxqiBpbdJHbAAGWdizHqSSTya/mI+Mn7dP7Rnx18FTfD7x5rkB0O6ljluILS0jtvP8lt6LIyDLIHAbb03AHsK/U/4HeFP+Cn7fCHwk/h/xX4Ws9JbT4WsYdYUy36WhGYBM8dtIpPl7dvzkhcBvmBFAHyL/wAFdtE0fSv2i9AvNMsobSfVPDtvcXbxIqNPMt1cxCSQgfMwjRVyecKB0Ar8qq+y/wBufTP2jNL+Nfl/tLX9tqWvyafA1lNYsPsLWOWCi3UKhRRKJNwZFJfceQQT8aUAf0f/APBIrRNGi/Zz1zXI7GFdRu/EV1DNciNfOkiht7cxoz4yVQu5UE4BY46mr/8AwVr0TR5/2adP1qaxhfULHXbSO3uDGpliSaOXzFR+oD7V3AHBwM9BX4qfAr9sb48fs6aFf+GPhnrMUGk6hOLp7a6to7mNJ9oRnj3jKl1ChsHB2j0qT45/tl/Hv9onw/Z+FPiTrUM2kWU/2kW1rbR2ySTAbVeTYMtsBO0E4GTxnGAD5Yr9Qv8Agknouj6t+03qdxqllDdy6Z4cvLm1aVA5gn+02sXmR5+6+yR1yOcMR3r8va9W+DXxq+IvwD8aR+PfhlqX9m6qsMls5ZFlimglwWjljcFWXKqwB6MoI5AoA/r5+LugaHr/AMLPF2ka5YQX9jcaVeCSCeNZI22xMwypyOGAIPYgEcivj7/gmFoejWX7IHhfUrOxhgu9UutTlu5UjUSTyR3s0SNI3VisaKgz0AAr8ZfFv/BSf9q/xj4Z1LwrqHiK1tbXVYHt5pLSxignEcgw4SRRlCRkZHIB4IPNfVf7Dfh3/goDe/A+3u/gj4h0HSvBEl5cmwi14GRywcrO1uEgmKxecGyGI+fcQOSSAew/8FjND0YfDnwF4gFjCNTXVprUXQjUTeQ0DOYt/XZuAbb0zz61/P8A1+n3/BQrQv2zNMsPCdz+0prOl6voTSzJYnRDstEu9uWEqGKFzKY/usVK7chSDuB/MGgAooooA/rk/Yb0LRNI/ZQ+Gw0qwgtBeaVDdT+VGq+bPNlpJXx952PVjz+VfmL/AMFlNF0ez8T/AAw1q0soYdQv7XVYri4RAss0du9sYldhywQyPtz03H1r4p+Fv/BQH9pr4QeCdP8Ah94T163k0bSgUtUvLOK5khiJyI1kYbtinO0HOBwOAAPIfjt+0h8Wv2j9Z07W/ipqq38mkQtBaQwxJBBCshDSFY0AG5yF3MckhVHQAUAeE1+8n/BG3RdIk8OfEnXZLKFtSS7sbZbkxqZlgaORzGHIyELAEgHBIBPQV+DdfQ/wG/al+Mv7N0uqt8LNXjs4NZVBdW9xAlxC7xH5JAjjhwCRkYyDg54wAf0P/wDBSfQtF1H9jzxvfX9hBcXOltp89pI8as8ErX0EReNjyrGN3QkfwsR0NfRn7PehaLonwJ+H2n6NYQWVqug6dIIoY1RN8tukkjYAAy7sWY9SSSeTX8x/xj/br/aN+Ongqf4e+OtcgOh3csctxBaWsdsZ/KbeiSMgyyBwG25xuUE9BXVeCP8Ago9+1V4B8JaV4M0fxBa3Fho0C21u13YwzzCGPhEaQjLbFwoJ5wBkmgD27/grxoukaX+0L4dvdNsobW41Pw9DNdSRIqNPKt1cRB5CB8zBEVcnnAA6AV+Uteu/Gr45/Er9oHxgPG/xP1MajqUcCWsQSNYYYYI8kJHGgAUFmZj3LEk15FQB/Rz/AMEhtC0WP9njxBr8djCupXfiK5t5rkRr50kMFtbNFGz4yVQyOVGcAscdTWz/AMFaNE0e4/Zms9ZnsYXv7DXLRLe4MamWJZklEio+MgPtXcAcHAz0Ffib8Cf2w/jv+znouoeG/hlrMVvpWpTi5ktrq3juY0n27DJGHHyMyhQ2Ou1c9BVj45/tmfHz9ojw7Z+E/iTrUM2kWc/2kW1rbR2ySTAbVaTYMtsBO0E4GScZxgA+V6/T3/gkvoukav8AtP38+qWUN3Jpvh29ubVpUDmCf7RbReZHn7r7JHXI5wxHevzCr69/Yh039oPU/jnbw/s23tvp3iZLG4e5nvSBZLYZQSfaVKuWjMhjACox37CAMZAB/Ut8WNB0TX/hh4r0jXLCC/sbnS7sSQTxrJG4ETMMqeOCAQexAI5FfxWV/RB8W/CX/BUo/DLxN/aHizwrd2f2GY3EWjq0OoPAF/ei3eS2jVXKZ/jU4ztO7FfmF8Av+Cfnx4/aJ8BR/EjwfLpGmaLcTywW76ncyxPceSxSR0WGGb5VcFMttJIOBjmgD5l+DWnWGsfF/wADaTqtul3ZXuu6ZBPDKoaOWKW6jV0ZTwVZSQR3Ff2i29jZWkEdra28cMMKhERECqiqMBVA4AA4AFfyhfGX9i39oT9mTXvB17qbWd5ea/qMNtpN3o107lNSDgwxZlSF0kLYZGxt4+9kGv2IsPCX/BVr7Bbed4z8ELJ5abhNExlDbRkOY7MoW9dpxnpxQB+Ln7dui6R4f/a2+JGl6FZQ6fZpfRSLDAgjjVpraKSQhVwBudmY47kmvkmvYv2gbP4pWHxn8W2nxqma48bJet/aUhZXDyFQUZCmF8sxlfLCgAJtAAxgeO0AFfSX7H2kaVr37T/w00jW7OK/sbjWrYSwToJIpADkBkYEEZAOCMV7h8Hv+CbH7Q/xn+H2l/EnQp9F0rS9aQy2iajdzJPJDnCy7YYJgFfnblg2OSACM+X/ABl/Z/8Ajn+xH4+8Lazrt5bWmqSsb/SdT0uYzRedaMu9R5scbboyyblZNpDD7wJAAP633tbaVGjliR0cEMpUEEHqCK/jU/aM0rTNC/aB+JWiaLaxWOn2HiTVoLe3hUJFDFFdyKiIo4VVUAADoK+rn/4KlftdsjKNb01SQRkaZBke4yCK8k+BP7Lnxx/bK17xR4l8M3lpJPbTfadT1LV7h41lu7x2cjMccsjSOdzk7NvByQSAQD5Gor7u+On/AATv+PvwB+H138TPFM2j6po2nSRJdnTbqWSWBZmEayOs0MOU3sq/KWILDjGSPhGgD7o/4Ju6NpOuftheCbTWbOG+giXULhI50WRVmgs5pIpAGBG5HUMp6ggEciv6oNQ0nS9WsLnS9Us4buzvI3hmhljV45Y5AVdHVgQysCQQRgiv4svhp8SvGXwi8baX8Q/AGoNpmuaRIXgmChxhlKOjqwIZHUlWUjkE19n6j/wVA/a71CwubD/hILG2+0xvH5sGnQJLHvBG5GwcMM5BxwaAPhLxRBDa+JdWtrZBHFDdzoiKMBVWRgAB6AVjRAGVAeQSP50s881zPJc3DmWWVi7uxyzMxyST3JNMXduG3rnj60Af29eH9C0XQNC0/RNDsILDT7GCOG3t4I1jiijRQFRFGAABwAK/MLwv4O8Jj/gq14pkGjWgaHwgupRkQp8t9I1tG9yBjAlZHYF+p3Hnk0ngvwj/AMFWV8I6Msvi7wjbsLSEeXqatLfIAgwty8dq6tKB98h2ycnJPNfld8W/it+1h+zn+1frfjbxvrsUfxGjhWGa4gCTWNxYTIvlxxxFVUwFVUqrKrBlBIDjNAH9NXxT0HRNf+GvinR9csIL+xudMu1lgnjWSNwImIypyOCAR6EZHNfFv/BLzQtFsv2RvD+qWdhBDeape6lJdzJGokneK7kiRpG6sVRVUZ6AYFfjh4q/4KVftY+LfDmpeGL7xFaWltqkD28slpYwwTrHIMNskAyhIyNw5GeCDzXAfBX9t/8AaH+AXhD/AIQT4fa5AmiLM88Vvd2sdyIXlOXERcZVWb5iucbiSACTkA/VH/gsVoejD4XeBfEAsYRqkesvardCNRMIHt5HaLf12FlVsdMjNfz719I/Hn9rH42/tIW+l2HxR1iO6sdHd5be2toEtoRK42mRlQfM+35QTnAJxjJz83UAFFFFAH9bv7Ceg6JpH7J3w4/suwgtPtumpdTmKNVMtxKSXlcj7ztgZY88AdAK+ZP22fBvhLU/2tv2YpdS0a0um1fVby3vTJCjfaYbeS1aKOXIO9EZ3Khsgbj614d+yR4X/wCCj0/wH8O3Hwz8S+HdN8JSq76VDroMt0LUn5Spjt5sRE52KzbgOwXbXy1+29qP7Z/w1+KHgPxh8c/ENnJqmmpJceHr3RCFs4ZYZEafZG0cZ80ExeYXQhl2DJAwAD+mV7a2kRo5IkZWBBBUEEHqCK/ja/aT0nS9B/aF+JeiaJaRWGn2HiTVYLe3hUJFDFHdSKiIo4VVAAAHAFfVDf8ABUv9rtlKjW9NUkdRpkGR78g18A69ruseKNbv/EniG7kv9U1WeW6uriU7pJp5mLyOx7lmJJoA+vf+Cd//ACeV8Nv+vi+/9N9zX9Ytfydf8E7/APk8r4bf9fF9/wCm+5r+sWgD+d3/AILE/wDJcPBf/Yuj/wBLJ6/Imv12/wCCxP8AyXDwX/2Lo/8ASyevyJoA/tx8E/8AImaD/wBeFr/6KWunrmfBX/Im6D/14Wv/AKKWumoAKKKKAOY8b8+DNfB/6B91/wCimr+I6v7cfG3/ACJmv/8AYPuv/RTV/EdQB+u//BHb/kt/jX/sXT/6VwV/RDX873/BHb/kt/jX/sXT/wClcFf0Q0Afym/8FJ/+T1PiL/3CP/TTZ18M19zf8FJ/+T1PiL/3CP8A002dfDNABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH//W/GOiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP7mK/MT/grT/yaza/9jFYf+ibiv07r8xP+CtP/ACaza/8AYxWH/om4oA/mir+ov/gl1/yaB4e/7CGp/wDpS9fy6V/UX/wS6/5NA8Pf9hDU/wD0pegD9DaKKKACiiigD+Sf9vn/AJO/+Jn/AF/xf+k0Ncf+x7/ydN8Kv+xi07/0ctdh+3z/AMnf/Ez/AK/4v/SaGuP/AGPf+TpvhV/2MWnf+jloA/sIr8IP+Czf/IZ+FH/XvrP/AKHaV+79fhB/wWb/AOQz8KP+vfWf/Q7SgD8RqKK/WD/gm1+yR8HP2idI8aeJPixZXOqjRZ7a0traO5ktol85WkaRmhZHZvlCgbtoBOQTggA/J+v7DvgH8VPhpq/wR8CXmn+KdNliGiWERJuolKyQQLFIjKzBgyOrKQQCCDX5sftv/sEfs6fCb9nPxF8TfhtpN1omteHpLORD9tnuY50uLmO2aORbh5ABiXcCuDlQM4JFe3fB3/gmt+ynqvwp8I6z4m0C81jVdT0u0vLm6k1G6haSW5iWZsRwSJGqru2qAvQDJJySAfnZ/wAFY/GfhTxf+0NokXhbVrfVTo/h+3tbs20glWGdrm4mEZZcru8uRGIBOM881+Xtfen/AAUN/Z5+H37OXxp03w18NI57bR9Z0iHURbTytP8AZ5DNNAypI+XKnyg3zsSCxGcYA+C6ACiv2f8A+Cdn7FXwJ+PPwf1f4i/FXTrrWb4avLp8MS3c1rDDHbwxSbl8hkZmcy/NuJACjAHObf8AwUM/Yl+A3wL+C9h8RvhXpt1o2oRarDZSxtdzXUU8VyjtlhOzlWQx/KVI6nIPGAD8VaKK+5/+CfP7P/gH9ov453XhH4kpPcaNpej3OptbwStD9okjmhgVHkQh1UecW+QgkqBnBNAHwxX9N3/BM/4j+AIv2SvDWgXHiKwt9S0e61KK7t5rhIpYXlvJZ0DK5Bw0cisCMg5xnIIFf4l/8EzP2ToPh94ju/D+gXmj6la2FxPb3cWo3UzRSQoZFPlzyPGwJXBDLyCcEHBH8zNAH7y/8FevH/gjW/AHgTwvouu2eoasupzXjW9tMszrbiBo/MbYSFBcgDJGTnGcHH4NUUUAFFfpJ/wTf/Zj+F37SHjPxcnxUguL+w8OWds8NpDO9uksl07rukeIrJ8gTgKwyTzkDB/QL9pz/gnX+zD4N+Anjfxr4I0S70TWvDumXGo206X9zcAtaoZPLeOeR0KPjacAMOoPqAfzs0V/Qx+yp/wTx/Zl8d/s/wDgzx1470W71vW/EVil/cTNfXFuqGbkRpHbyIoVBwCQWPJJ6AfDX/BSb9l34Vfs3+IvBE/wptrjTrPxNb3wuLSad7lEksmhw6PKWky4mwwLEDaMYyaAPzMooooAKKKKACivqj9i74O+FPjx+0V4Y+G/jcz/ANi3gup7hLd/LeVbSB5xHvHKq5QKxXDYJ2kHBH70al/wS/8A2P73Trqzs/DF5YTzxOkdxFqd48kLsCBIqyyuhZTyAyspI5BHFAH8t9FftZ+wF+w98CPjT8OfE/jT4pWN1rl1Z69c6RbxC6ltY4orOOJ94+zsjM8hl+bcSAFGAOczf8FBP2IfgJ8Efg1YfEL4W6bdaLqEWrW9lKhu5rqKeK6V/vC4ZyrIUypUjqdwPGAD8Ta/S3/glT4w8LeEP2mLxvFOq2+kpqvh+8s7V7mQRJLcGe2mEYZsKGKRORkjOMDkgH9XdE/4Jffsh2Oj2VnqPhy81S6hhRJbuXUruOSdwo3SMkUqRqWPOFUAdhXwj4c/YY+CN9+354i+B93HfSeCtJ0Ea7FZfaGDl5TAgt2nGJfKQzFgd287QCx5JAP2N+LHxX+GOhfDHxVquq+KtMgtYNMu9zfaomOXiZVAVWLMzMQAoBJJAAzXyB/wTM+I/gCH9k3w9oFz4isLfUtIvNRju7ea4SKWFpbuSZNyuQcNG6sCMg5xnIICfEf/AIJl/smw+AfENzoHh+80fUrewuJre7i1G6maGWJC6ny5pHjYZGCGXkE4wcEfNn7CX7CP7PHxh/Z50n4m/EzSrrW9Y1u6vc/6ZPbRwR20726oi27pnPl7iWycnAwAKAPV/wDgo38VvhtDqnwQtf8AhJbGabTPGFlq10kMwnaGxt2AkncRbtqgnjPLYO0HBx+m9v8AEn4d3dvFd2vijS5YZlV0db2AqysMggh+QRyDX4g/tufsMfAz4W6h8K2+GlveaDH4v8R22g30X2mS6Xyrph++Q3DOyyIMgDO08cAjn7yt/wDgmJ+xzDBHDJ4Sup3RQpkfVb0M5AwWbZMq5PU4AHoAOKAPwS/bf8T+HvGX7VfxE8ReFdQh1TS7m+jSK5gbfFIYbeKJ9jdGAdGG4cHGQSMGvlSvoD9qf4X+H/gv+0D40+GXhWWaXSNEu0S2NwwaURzQxzBGYAbtm/aDjJAyea+f6AP6vP2H/if8Obv9lf4eWkPibThcaZpsdndRSXMcckNxCSHjdHKsCMg9MEEEZBBr83f+CwXjfwf4m8Q/DTRPDus2mqX2l2+qTXUVtKsxhS6a2EJcplQX8p8DOcDJABGfe/2UP+CeX7M3jz9n7wb478eaNd63rfiKyW+nma+uLdUMp4iSO3kRQqAcEgsTkk9APBv2n/2GPgj4H/aN+CXgLwTHfaPoPxGvLiz1C3W4acxi0eEl4ZJ97hpFmKncSBgEDqKAPxjr9x/+CP8A488F6Bo/xG8Oa7rdpp2p3U9jdxQXMywtJBGkkbuu8gMFZlBwcjIz1Ffakn/BMb9jd0ZF8H3KFgQGGq32RnuMzEZHuDXwJ+x1+wx8D/iN8SvjRoHxEhvdesPh9rsuiafE1y9ruRJpl8+VrcoxkKxAYBCcn5ScYAPur/gov8S/h6P2RvGmiJ4jsJtQ1o2NtZwRXEcsk0q3kMzKqoSeI43Yk8ADr0r+XWv3u/bY/YE/Zy+Ff7OfiX4l/DjSLrRNa8OtaTIwvZ7mOZJrmO3aORLh5ABiXcCuGyo5xkH2D4Kf8E2f2Vda+EXg7XvFOg3ms6tq2lWd9c3UmoXUJeW7iWZgI4JEjVV37VAXOAMknJIB/NjRX33/AMFEf2dvh1+zl8YdJ8PfDKK4tNI1vSY78208zTiCTzpIWEcj5cq3lhvmZiCTg4wB8CUAFSRELKjHoCDX7J/8E6P2LfgZ8fPhNrnxE+K2n3OsXkesSabBAl1Nawwx28EMpceQyMzOZsHcSAFGAMnO1/wUI/Yi+AnwO+CVr8R/hZpl1oupW2pwWkqNdzXUU8VyrfeFw7lShTKlCOpBB4wAftB4e+K/wx1/QdO1vR/Fml3NjfW8c0Mq3cQDxuoKnDMCOOoIBHQgGv5pv+Clfivw14v/AGr9fvvC2pQarbWlnY2ksts4kjWeGLEibx8pKHg4JwcjqCK+B6+3/wDgn98A/Af7RPx5k8G/EhJ59F07SbrUnt4JTCbh4pIYVjeRMOqfvtx2kElQM4JoA+IKK/ps+If/AATK/ZMj8CeIJ9C8P3mj6jBY3EtvdxajdTPDJEhdW8uaR42GRghl5GcYOCPmb9g/9hH9nr4xfs+aZ8Tfibpd1rer61dXgx9sntoreO2neBURbd0zu2bmLZOTgYA5APwsor9eP+CkP7HnwV/Z68FeFPGnwnsbnSJdR1B9PubaS5luoZFMLyrIDOzurqU24DbSD0BGT+Q9ABRRRQB/Vx+w38T/AIc3f7K3w9s4vE2nC40vT1s7qKS5jjkhuISd8bo5VgRkHpgggjIINfnN/wAFgvHHg7xLrXwy0Pw7rVpqd9pcOqzXUVtKsxhjumthCXKEgbzE+BnPy5IwRn8YKKACiiigD7T/AOCd/wDyeV8Nv+vi+/8ATfc1/WLX8nX/AATv/wCTyvht/wBfF9/6b7mv6xaAP53f+CxP/JcPBf8A2Lo/9LJ6/Imv12/4LE/8lw8F/wDYuj/0snr8iaAP7cvBX/Im6D/14Wv/AKKWumrmfBX/ACJug/8AXha/+ilrpqACiiigDmPG3/Ima/8A9g+6/wDRTV/EdX9uPjb/AJEzX/8AsH3X/opq/iOoA/Xf/gjt/wAlv8a/9i6f/SuCv6Ia/ne/4I7f8lv8a/8AYun/ANK4K/ohoA/lN/4KT/8AJ6nxF/7hH/pps6+Ga+5v+Ck//J6nxF/7hH/pps6+GaACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/9f8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/uYr8xP+CtP/JrNr/2MVh/6JuK/TuvzM/4Kx2l1c/sqLNbwvLHa6/p8kzIpYRoUmjDOR91d7quTxlgOpFAH8zVfqV+xZ/wUTs/2bfh9P8LfHPhq41zR4bia7sLixkjSeEzlS8LpIFVkLbnD79wJ24Ixt/LWigD+hn/h8X8G/wDoRtf/AO+7X/47R/w+L+Df/Qja/wD992v/AMdr+eaigD+hn/h8X8G/+hG1/wD77tf/AI7Va8/4LG/CdLSd9P8AAWty3SoxiSWa2jjaTHyhnV3KqT1IViBzg9K/nvooA9H+L3xM1r4x/E3xH8T/ABDGkN94ivJLp4o/uRKfljiU4GRGgVATycZPJNek/se/8nTfCr/sYtO/9HLXzfX0x+xpaXd7+1V8LIbOF55F1+ykKxqXIjikEkjEDPyoilmPQAEngUAf2AV+EH/BZv8A5DPwo/699Z/9DtK/d+vwg/4LN/8AIZ+FH/XvrP8A6HaUAfiNX6cf8E8P2rL34Br4u8Jx+AtX8bQaz5F7/wASOJri6geDMf7yPBHlMH+9kENgc7uPzHr99v8AgjXbwDwR8Sbryl846jYIZNo3FRDIQu7rgE5xQB59+23+3NqHxJ+A+p/DRPhT4j8Jx+Jbi1ikvtetmtYVS3lW62w8YeVmiAwTgLuPXFdL8Kv+Ctnw88J/Dbwz4V8U+B9VfVNF0+3sZnspYGt3+zIIldDI6uNyqCQRwSRkgZP2v/wUltoJ/wBjPx9JNEsjQHTHjLKGKN/aNsu5SfunDEZHOCR0Jr+U6gD6+/bU/acsv2qfiva+ONI0aTRNM0rTotNtY53DzyIkkkzPLtyoJeVgApPygc5Jr5BoooA/XL/gn5+2RffBX4ca78Nl+G2u+NIU1E6klxoMDXLxG6jWNknTGFH7kFDnn5hjjJtft/ftmX/xl+F+kfDY/DTXvBkN1qC3z3OvQNbNIbRCqpbrjD/63Lkn5fl4O7I+0f8AgkXbwJ+zJq9wkarLL4lvQ7hQGYLbWu0E9TjJx6Zra/4KtW1vN+zTp00sSPJF4k04KzKCVDJMGwT0z0PrQB/PBp3wb+L2sWFvquk+BtdvbK7RZYZ4NMupYpY2GVZHWMqykcgg4NfRn7FXxq1z9mP4/wAupXng7UPEF3fWV1o11pVtE66lGWdJj5cJGTIjwAMjAfLu6ECv6vbWCC1torW2jWGGFFRERQqoqjAVVHAAHAA6V+ZfgvT7If8ABVXx5MLWLengiGYN5a5EjPZIXBxkMVJUt1wcdKAOM+LX/BRvU4vhp4kW1+CPi/TJriylt1utWsmt7GEzjyt80gBIUbuAMbjhcjOR/OrX9sHxNtre8+G/iq1uoknhl0q+Vo3UOrAwPwVOQQfQ1/E/QAUUUUAfcv7DX7XOlfsn+LvEWpeIdBm1zSvElrDDL9ldUuIZLZmaNlDkIytvYMCQehB4IP2f+0F/wVS8B/E/4N+K/hx4Q8F6lb6h4msZdP8APv5YVhhiuFKSPiJmZmCk7RwM4JOBg/iXRQB+8X7KH7feo+E/gR4Y8FTfCDxR4kPhqH+zlv8AQ7Vrq0mSH7pLEfLIARvXJGeRgHA+K/8AgoX+01eftC+MPCthP4K1PwVD4XtLgpDrEZhvZmvmjLOYyAFjAhUIRkk7snoB+8/7E9tBa/sofC5LeJYVbRLdyEUKCz5ZmIGOWJJJ6knJr8wv+CzdvAutfCi7WJRNJb6yjSBQHZUe0KqW6kKWYgdsnHU0AfiPRRRQAV6Dovwm+KniTTIda8O+DNa1TT7nd5Vza6dczwybSVO2SOMqcMCDg8EEV59X9oXwIt4LX4I/D6C2iWGNfD+l4RFCqM2sZOAOOtAH8rv7NPxF8S/sy/tG+HfFer+FL2+1PTZXtZtIeKSC+db+Iw4jiZd3m7ZA0alfmOBwDmv218Q/8FJtQ0nQNS1SH4EeN4JLO2lmWS9sWgtUKIWDTygHZGMZdsHC5OKufE+wsX/4KjfCOR7aNnfwlfSMxRSS6LfhWJx95cDB6jtX6aSxRzRvDMgkjkBVlYZDA8EEHqDQB/PJ+wX+2nqXwl8G+KfA7/DXW/GUVzqz6wJtAga5eF71FR450wQq/uQYznJ+YHpmrP7fP7aGofF/4YaR8Oh8M9e8GxXOopfPc6/A1sZPsakKluuMPzJlyT8oxwd2R9w/8ErrO0t/gZ4xmhgSKR/GOpozKoUlI4bbYpIHRcnA7ZOKZ/wVlt4JP2WIp5IleSHXrDYxUFk3JMDtPUZHBxQB5Hon/BYv4Z/2PZf8JB4D1ePUxCn2lbWW3e3E20b/ACmkdXKZzt3DOOtfHmhf8FC9M0z9szWv2k7jwnK+g6xpR0Q2KzL9rS1TymSbccRmUvCpZfuhSQCSAx/L2igD96vH/wDwV5+HWteCNd0bwt4G1X+1dQs5ra3N7LAturzKU3SGN2fCgk4UZOMZGcjwr9j7/gpF4O/Z7+C1h8J/GXhK/wBSk0i5upLe5sJIsSRXUrTkSLKy4dXdgNuQVx0Oc/kVRQB+pf7Wv/BQ7Rvjvf8Aw+k8D+FJ9Ot/BGsw66zalIpee4t2HlxBYWIEZGdzZ3EkYxjJ/RfT/wDgo/d3thbXn/ChfHjefGkmYdPMsR3KDlHwNy+jYGRzgV/Pd8D7eG7+NXgC1uYlnhm8QaUjxuodXVruMFWU8EEcEHrX9o9AH8Z37Q/xRuvjT8a/FvxOvNLOiya5eb/sTMWeBYUWFUckAlwqDfwPmzgAcV4xX2J+3/bw237YXxLjt4lhU30DlUUKC0lpC7Ngd2Ylie5JJ5NfHdAH7Tfs3f8ABUjwP8JPgv4Z+GfjHwbqN3feG7cWaT2EkJimhjP7tyJWVlfBww5GRkHnA8d/aB/4KEaf8WPjr8Kvib4P8IzQWPw1uZLmO2vJR9ovZbl4/NT91uVAFiUIRuO4kkEYFfl3X09+xdbwXX7VnwvhuIlmjOt2xKuoYZUkg4PoRkeh5oA/cuf/AIKNXcMMkv8AwoTx+NilsvppVeBnlsHA9Tjivzb/AGXP+ChmlfBfx58UPFPjbwnNe2vxH1STWSmnSr5lrcvLI5iAmKho8Sn5shgVHBzx/SnX8bH7TdtBZ/tHfFK0tolghh8UayiRooREVbyUBVUYAAHQCgD9Fv2sf+CmHgz47fBHWvhN4M8IX9hP4ge3S4udQkiCRQQTJcZjWJmLOXjVecAAk9cCvTfhH/wVo+Hvg74Y+F/CHivwRqkmqaFp9vYSvZSwNbyC1QRI6+Y6sNyKCQRwSQCQMn8K6KAPsX9tf9qGw/aq+KNj4y0bRZdE0zSNOj0+2juHV55AJHmd5NmVU75CAFJ4AJOTgfHVFFAH6hfsPft++Gf2Xfh7rPw68YeGLzV7W81JtStriwkjEgeaKOKRJFlZRgCJSpU55YEdK1P21f8AgoX4U/aW+Flp8MvB3ha90pGv4r26ub+SPIFurCNIliZs7i53FiMADAOcj8qakh5mQf7Q/nQB6Jpvwc+Lus2Fvquj+B9dvrK7QSQzwaZdSxSo3IZHWMqykdCDivob9jD4y65+zJ+0H/a194P1DXry6s7rR7rSbeJ11JDIySny4SMmRHhGUYfd3dDgj+r7T7eG0sLa1tolghhiREjRQioqqAFVRgAAcADpX5meGLCy/wCHrfi2b7NHvXwPHMG2LkSF7SMyA4zuKkru67TjpQBy3xT/AOCjupW/w58RG1+CHjDTZpbKaFLnVrJrexhaZfLDzyAEhRuzgYycDIzkfOH7C/7b1/8ACz4JQ/DFvhZ4h8Xx6Dd3BjvdBt2uk23cjTlJxjCOrMcYPK44BBJ/cf4h20F54A8S2tzEs8U2mXiPG6h1dTCwIKnIIPcGviz/AIJhW8EP7HXhWSKJY2nu9UeRlUAuwvZU3MR947VC5PYAdAKAPy3/AOChv7XF98d9C8LeBH+Hus+CYNPuZNSZ9dha3uJ32NCoijwB5YDMWbJJOAMYOfyyr+hj/gsZbwN8HPAt20SmaPXnRZCo3qr2spZQ3UBioJGcHAz0Ffzz0AbOg+HPEPirUk0fwxpd1rF/IGZbezge4mZVGWISMMxAHJ44ro9e+FnxP8K6a+s+J/CGsaRYRlVa4vNPuLeFWc4UF5EVQSeBzzX6wf8ABGy3gfx98SLpolaaLTLFFkKgsqvNIWUN1AbaMgdcDPQV+uv7W9vBc/svfFaO4iWZR4Z1VwrqGAaO2d1bB7qwDA9iARyKAP47qKKKACiiigD7T/4J3/8AJ5Xw2/6+L7/033Nf1i1/J1/wTv8A+Tyvht/18X3/AKb7mv6xaAP53f8AgsT/AMlw8F/9i6P/AEsnr8ia/X7/AILF2l2nxm8DXzwuttNoDRpKVIjaSO7lLqrdCyh1LAcgMM9RX5A0Afuj8JP+Cu3hrQPh9o3h/wCJfgzULzXdKt4rWW60+WAw3QhRUExSQx+W74JZACoPIODtHpH/AA+L+Df/AEI2v/8Afdr/APHa/nmooA/oZ/4fF/Bv/oRtf/77tf8A47R/w+L+Df8A0I2v/wDfdr/8dr+eaigD90Pi5/wV28Na/wDD7WfD/wANPBmoWmu6rby2kV1qMsAhtRNGyGYJGZPMdMgqhAUnknA2n8L6KKAP13/4I7f8lv8AGv8A2Lp/9K4K/ohr+eb/AII6Wl0/xl8c36Qu1tDoCxvKFJjV5LqIorN0DMEYqDyQpx0Nf0M0Afym/wDBSf8A5PU+Iv8A3CP/AE02dfDNfc3/AAUn/wCT1PiL/wBwj/002dfDNABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH/0PxjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD+5ZHSRFkjYMrAEEHIIPQg1k+IPD2g+LNFvPDnifTrfVtK1CMxXFrdRrNDKh6q6OCCPqK/Hv9iD/go38OY/h/pHwo+PGor4d1bQIobGx1OVXa0u7WMbIhM6hvJkjUBWZsIQA24cgfot/w1t+y9/0Vbwz/AODW2/8AjlAHnn/Dvr9jr/omtn/4FXn/AMfo/wCHfX7HX/RNbP8A8Crz/wCP16H/AMNbfsvf9FW8M/8Ag1tv/jlH/DW37L3/AEVbwz/4Nbb/AOOUAeef8O+v2Ov+ia2f/gVef/H6P+HfX7HX/RNbP/wKvP8A4/Xof/DW37L3/RVvDP8A4Nbb/wCOUf8ADW37L3/RVvDP/g1tv/jlAHnn/Dvr9jr/AKJrZ/8AgVef/H6P+HfX7HX/AETWz/8AAq8/+P16H/w1t+y9/wBFW8M/+DW2/wDjlH/DW37L3/RVvDP/AINbb/45QB55/wAO+v2Ov+ia2f8A4FXn/wAfr0z4X/st/s/fBjWpfEnw08E2Wi6rNH5Rul8yeZUOcrG87yGMNn5thG7jOcCq3/DW37L3/RVvDP8A4Nbb/wCOUf8ADW37L3/RVvDP/g1tv/jlAH0NX4Pf8Fm2U638KFBG4W+sEjPOC9pjj8K/THxh+3J+yl4L0aTWr34kaTqSpwsGmTrf3DtgkAR2+8jOOrbVz1Ir+bT9rX9pPV/2ofi1c+Pruz/szS7SFbHS7MtueG0jZmUyMODI7MWfHAJ2jIGSAfMVfpn/AME7/hD+0b8QJvF+ufBH4ij4eafZLb217K0QuxdTOS8a/Z2BT5FDHzDgjO0ZDNj8zK/aD/glP8d/hD8LtB8e+G/iP4qsfDN5qFzaXdudRmW2ilijRo32yyEIWBYfLndg5AIBwAX/ANuD4Bftf+HfgTe+KviX8Y18d+F9IuraW909bVNPwJZBDFL+7AE22SRRsbpncPu1+KFf0ff8FBP2nfgB4r/ZZ8VeCvCPjvSvEGt69JYQ2trptzHdyEw3kNw7OIi2xBHE3zNgZwvUiv5waAPZPgF8FfEX7QfxU0X4VeGLmCyvNWaRmuLgny4YYEMkrkDliqKSFH3jgZHUfplqn/BHD4h22m3dxpPxE029vYonaCB7KWFZZApKoZPMbYGPG7acdcGvjX9gP4j+DPhX+1H4V8W+PtTj0fRlS8tpLqXPlRPdW7xRmRh91N7AFj8qjliACa/o41P9sb9lnStOutTn+KXh6aO0ieVkt9QhnmYICxEcUbM7sccKoJJ4AzQB/Lj8Mv2iPjt8Ao9U0H4ZeLbrw/BdzZureIRTQtNFlN4SZHVWxwWUAsAM5wMHxR/aS+O/x0s9P0P4n+L7vXrOymMtvBIIoYllcBd5WFEVmA4BYEqCcYyc+N6xcxXmr315ASYp55ZFJGDtZiRx9DVW0kWK6hlf7qOrH6A5oA/pB8G/swft+aZ4S0bTpv2ik0x7a0hjNodOjvTb7UA8o3Eg3S7Pu7z97Ga/IL47X/7RP7Mn7Umu6prPjie78e25Ex1u3fJure6jBTdG4KqpjIHklSiYAUYVTX9Gejftkfss6zpNnq0HxR0C3jvIUlWO5v4bedA4B2yRSMro46FWAIPBr+dn/goP8SfBPxU/af8AEHij4f6pHrOkJb2dot3BkwySW8QSQxt0dA3AcfK3UEjBoA5DxT+27+1V408O6h4U8R/ES+udL1SJoLmJI7eAyRN95C8MSOAw4YBhkZB4JFe8/szf8E3fHH7RvwutfirH4ssfDunajPPFaRSQPcyyJbSGJ5G2OgT94rKAckgZ4BGfzcr+i/8A4J2/tM/APwf+y74f8E+MvHOleHtb0S51BLm21K5jtH/f3ctxG0fmld6FJF+ZcgHIPIoA/LD9rf8AYd8Zfsn6boWvarr9p4i0rXJXthNBG1vJFcIpfY0bs2VZASGB6gggcZ+H6/bT/gqp8ffg58TvA3grwl8OfFlh4m1G11GW+nGnTLcxRQ+S0Q3yxkoGLNwud2ASQBjP4l0AfWH7Jv7Jniz9rDxRrGheH9XtdCs9BtkuLu7uVaUgzMViRIlILFirZOQFA5OSAfqL41f8Er/iB8I/hh4g+Jdp410/Xo/Dls97cWotpLV2t4hulZHZ3Usq5YKcbsEA5wDY/wCCVfxo+F3wl8c+OLP4l+IrXw2NdsbQWk984ht3a2kkaRGmbCK2HBUMRu5xzwf0u/a0/av/AGcNQ/Zv+IWh6L8Q9G1jU9Z0e7sLS00+7ju55Z7qMxxgRxMxC5OWY4CjknsQD8Cvh7+1/wDtKfCrwvbeC/AXju90vRLNnaC12QTpFvO5ghmjdlXOTtB2gkkDJNVZvE3xt/bD+LXhfwx4v8SPr3iHVpYtMspb5liggWRiT8sShVUcsxVdzY7nAr52r339lnxn4c+Hn7RHgDxr4uuvsOjaTqsE11PtZxFHyC5VQSQM5OATigD9JZP+CNXjcRsYviZpzOAdobT5lBPYEiU4Hvg/SvyB8Y+FdW8C+Ltb8E6+qLqegXtxp90I2DoJ7WRopArDhhuU4PcV/XXJ+11+y7FG0rfFbw0QgJO3VLdjgegDkk+wGa/lB+OHifR/Gvxo8e+MfDsrT6VruvanfWkjIUZ4Lm6kkjYq3KkqwODyKAPLq/oS+Av7Nn7c/wDwpzwjNo/x8Tw1p1zp8M9pppsY782ttOPMhj8+QbmwjL8vRPuL8qiv57a/q7+BX7XP7M5+DHgeC9+JOh6bdWmjWNrPbXt7Fa3EU1tCsUivFKyuMMpwcYIwQSCDQB+HX7Xuj/tIfs7/ALR+m+JvHXxAm1/xeLS3v9M1y2YwuLdS0QQQ42xAOjq0YBRwSTnewrhNT/b0/a71fTrrSr74lX5t7yJ4ZBHDbQvskUq22SOJXQ4PDKwI6gg17X/wVA+Lnw5+Lnx00S9+G2uW/iGy0bQ4bK4ubRvMt/PM8021JR8r4SRclSQDlc5BA/NmgD9af+CfPwU/al8c+BvEni74PfFIfD7QJdQW1kR4FvvtV3DGHkfyZAVj2pIgLjl84PCitH/goB8D/wBqrwb8MtG8VfF74rr8QvDltqAgNstutj9nuJ0PlSGJAFlyFYZPKdhhmx7X/wAEu/2ifgl8O/gfrvgf4geMdO8NavFrk98I9SnS1WSC4t4I0aN5CquQ0LBgCSvGRgjOt/wU2/aN+B3j79n+z8E+A/Gmm+JNYvNYtrlYdNuEu9kVskm9pGiLKgy6hdxBbnAODgA/ASvoj9mL9nPxN+1B8TR8OPDOoW+lGGzmv7q7uQWWG3hZEJVFwXYvIihQR1yTgGvnev0N/wCCZnxW+H3wk/aJutY+I+tQaBp2q6Hd6fDdXJ2W63Dz28yiSQ/LGCsTYZiBnAzyKAPb/G//AASH+IvhfwhrHiTSPHmnavd6Xay3KWhtJLbzhEu9kErSMFJUHGRjOASByPyDr+tf4n/tg/swWXw58TTp8TNCvpP7OuUSCyvYrq4leSNkVI4omZ2YsQOBx1JABI/kooA3/Cmj6x4i8U6N4f8ADrbdV1O9t7W0O/ysXE0ipEd/G35yPm7da/pE0/8AZp/b8gsLaGb9pWNJI4kVl/smKfBCgEea6h3/AN5hlup5Nfzs/CvXtN8K/E/wf4n1l2j0/R9Y0+8uWVS7LDb3CSSEKOSQqnAHWv6z7f8Aa9/ZbuYI7mP4q+GwkqhwH1KCNgGGRuR3DKfUEAjoRmgD+VX9oHwh488B/Gjxd4U+J2pf2z4nsb5/t195pm+1SSgSrNvbDfOjq2CARnBAIxXjtfTP7ZHjzwt8TP2mvHvjfwTejUdE1K9j+zXIUqsqwwRwsyhsHaWQ7TjkYPevmagD9R/gT/wS58f/ABo+FuifE+58ZWHh+HxBF9otrVrZ7p/s5OEd3V0UM2CdozgYyc5A8G/af/ZY+IP7FfjDwret4liv21QSXem6jYb7aaG4snTeNhYsjIXjZWDYOeOQa/af9jX9qr9nTSf2aPAfh3xB8QdH0TVdE09LK7tNRu47SeOaEkN8krKWU5BVlypHfIIH58/8FWvjb8Kvizr/AMPNL+GniS08SvoVvqUl5LYyCe3j+2NbiJfOQlGc+S5ZQSVGM9RQB8rv/wAFAv2w5EaNviXegMCDi2s1PPoRBkfUVqfsp/sb+Ov2w7zxPrdt4kg0e20d4zdXl4r3U9xdXRZwNoYMchWZnZuuBg5JHxJX7M/8Epvjt8IvhbpXj/w58SPFNj4Zu9Tnsrq2bUJVtoZY4VkRwsrkJvBdfkzuI5AIBwAeK/tHf8E0fHf7Pvwr1H4rf8JdY+IrHR5IReQJbvayJDPIIVkQs7h8SOgK8HBz2xX5oV/SP+33+1B+z94n/Za8XeDPCfjzSdf1rXzZW9ra6bdR3chaO7iuHZxEW2IEib5mwM4HUgV/NxQB7B8Bvgz4i/aA+Kuh/CnwvcwWd7rLyZnuCfLhhgjaWVyByxWNGIUfeOBkZyP041L/AII3/EG3066n0v4i6beXkcTtDC9lLCssgUlUMnmNsDHALbTjrg18V/sFfEXwb8LP2pfCHjDx7qSaRosIvbeW6lB8qJ7q1lgjMhAO1N7gMx4UckgAmv6QdR/bE/Za0zT7nUZvin4eljtY3lZINQhmlYICxCRxszuxxwqgkngDNAH8gl9Zz6de3Gn3QCzWsjxOAcgMhKnkdeRVdQWYKvUnitbxDeQajr+p6hakmG6uppUJGCVdywyO3BrKjYLIjHoCDQB/SF4H/Zf/AG+tM8HaJp8n7RCaU1vZwJ9jOnR3xt9qACI3Mg3S7Pu7z1x1PWvyK+Pt5+0T+zN+1LrGr6545nvfHtuEnGuW783Ntcx4TMTgqq7PlMJUouMKCApr+irQP2yP2WtY0Ow1WH4oaBbJdwRyCK6v4badAyg7ZIpGV0cdCrAEGv55P+ChvxK8EfFX9p3XPE3w+1WLWtJitLO0F3BzDJLbx7ZPLfo6g8Bh8p6gkYJAOM8T/twftWeMfD9/4W8Q/EW+uNM1SJoLmJIreAyRPwyb4okcBhwcMMjIPBIr7w/YS+A37XPij4K/8JZ8Lfi+vgHwvql7ObWxa2W/8x4WMUs22QEQ5dSuFOW27iOhP4x1/RN/wTo/aY+Ang79mPRvBHjPxxpfh3W9Fu78XFtqVyloxFxcyTxtGZSokUo4yVJwcg47gHxB/wAFDvg1+0v4C0rwn4l+NfxKX4iaPNPNaWpWIWf2S5ZfMI+zqArb0U/vBk/LtOBtz+XFft5/wVS+P/wa+Jvw88G+EPh14tsPE2pW+qPfTDTpluYooFgeLLyxkorFnGFznAJwBjP4h0Afef7AHwt+O3xI+JusT/A7xqPAdxpFhm/1Ar5waKdtscX2c5WXcy5+YYTbuzu2g/f37UH7Of7bNn8CPF+qeK/joni3QtMs3vNQ0xbJNPNxaW37yUebGATtVS3lk4fG3rgH5g/4JXfGf4YfCX4heNLf4leIbXw2mu6fbLaT3riG3d7eR2dGmbCI2GBUMRu5A5wD+n/7Vf7WH7N99+zl8RdF0b4iaNq+paxol9p9pa2F5Fdzy3F3C0MYEcTM23cw3MRhRkk0Afy3V23w28A658UvHug/Drw0Yl1TxDeRWdu07bIleU43O2CQo6nAJ9ATxXE17t+zD4y8PfD39oPwB418W3P2LRtH1e2nup9rP5USt8zlVBYgZycAnHagD9LX/wCCNXjYIxj+Jmns2DgHTpgCe2T5px+VfkJ428Iax8P/ABjrngXxCqLqnh69uLC6ET74xPbSGN9rD7y7lOD3Ff1zv+1z+y7GjO3xW8NEKCTjVLYnj0Ack/hX8pXx78VaJ46+N/j/AMaeG5muNJ13XtSvrSRkMbPBcXLyRsVbBUlWBweR3oA93/4J4sq/tk/DYsQB9ovRyccmwuAPzr+sev4jvBXi/W/AHi/RvHHhuUQaroN3De2zsMqJYHDruHGRkYIzyK/pz+Bf/BRr9nb4q+GLO48XeIrTwN4kWEG9sNTk8iFZF4Yw3LgRSITyo3B8dV4NAH1n8UPg58MPjRokXh34peHLTxFYwSCWJbhSHifj5opUKyRk4w21huHByOK8B/4d9fsdf9E1s/8AwKvP/j9eh/8ADW37L3/RVvDP/g1tv/jlH/DW37L3/RVvDP8A4Nbb/wCOUAeef8O+v2Ov+ia2f/gVef8Ax+j/AId9fsdf9E1s/wDwKvP/AI/Xof8Aw1t+y9/0Vbwz/wCDW2/+OUf8Nbfsvf8ARVvDP/g1tv8A45QB55/w76/Y6/6JrZ/+BV5/8fo/4d9fsdf9E1s//Aq8/wDj9eh/8Nbfsvf9FW8M/wDg1tv/AI5R/wANbfsvf9FW8M/+DW2/+OUAeef8O+v2Ov8Aomtn/wCBV5/8fo/4d9fsdf8ARNbP/wACrz/4/Xof/DW37L3/AEVbwz/4Nbb/AOOUf8Nbfsvf9FW8M/8Ag1tv/jlAHd/C/wCDvww+C+iSeHfhd4ctPDtjPIZZVt1JeVz/ABSyuWkkIzhdzHaOBgcV6XXzz/w1t+y9/wBFW8M/+DW2/wDjleDfHX/go1+zt8KvDF5ceEPEVp458SNCTZWOmSefC0jcKZrlMxRoDywDF8dF5FAH4lf8FJHR/wBtP4isjBgDpIyDnkaVaAj8DxXw3XT+NfF+t+P/ABfrPjjxLKJ9V167mvblwMKZZ3Ltgc4GTgDPArmKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/R/GOiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiijrwKACivpLSv2Pf2odb0y01nS/hnrc9lfRJPBILUgPHIoZGAbBwQQRkV4X4n8L+I/BWv3vhbxbps+kavpshiuLW5jMcsTjsytz05B6Ecjg0AYNFFFABRT4opJpEhhQySSEKqqMlieAAB1Jr6ci/Yt/atmiSZPhdrm1wGGbYg4PPIJBH0NAHzBRWhqulanoWp3Wi61aS2N/YyvDcW86GOWKWM7WR0YAqykYII4rPoAKK918EfsyftA/Ejw9D4s8C+AdW1nR7lnWK7gt2MUhQ7W2McbgDwSOMgjqDXD/EL4XfET4T6xFoHxJ8PXnhzUJ4hPHDeRGJniJKh1zwwyCMg9RigDgqKK9I+HPwf+KHxdvLyx+GXhi+8STafGslwLOEyCJWOFLt0G49ATk4OOhoA83or2n4gfs6fHT4V6IniT4ieCNU0DS3lWAXNzAVi8xwSqlhkAnBxnGa2vC/7KP7SHjXQLLxT4W+HWsajpOop5ttcx2zbJY8kBlzglTjg9CORxQB8+UV13jfwF40+GviGfwn4+0W60HWLdUd7W7jMUgWRQytg9QQcgjiuRoAKntY1muYYX+67qpx6E4r1H4cfAr4w/F62vLz4Z+ENR8R2+nsqXEtnAXjjdwSqluBuIGcZzj8Km+IPwM+M3wchsNV+JPg/UfDlveSlLea8gKRvJHhiobkZxzgnJGcdDQB/UJov7C37J2j6RZaUvw20u8FpDHF591GZp5digb5ZCcs7dWPc1/PZ+358LPBPwf/AGmfEHhD4fWH9l6M0FpeJaqxaOF7mIO6x55VNxJVcnb0HGAPuLR/+Cy3iC20mzt9c+F1ve6hFEi3E8OrNbxSygYZ0iNrIUDHkLvbHTJr87vi348+JP7anx8vvFHh3wtJPrmtIkdrpWnK9y8dtaR4UFsAsVRcu5CgnsowKAPl+ivobxL+yb+0p4P0G98T+JfhzrNhpWmxma5uHtmKRRr1dtuSFHUnoByeBXzzQB3vwr8Oad4w+J/hDwlrG/7BresafY3Hlttfybm4SJ9rYOG2scHBwa/qzt/2If2TbaCO3T4X6MyxKEBeEuxCjGWZmJY+pJye9fyXeFPEmo+DfFOj+L9ICG+0O8t763Eq7ozNbSLKm5cjK7lGRkZFfs/b/wDBZzU1gjW6+E8MkwUB2TWmRWbHJVTZsQCegLHHqetAG3+zl+yN8BNU/bJ+OHgvXPDa6r4f8FfY/wCy7C7kaW3h/tBfMfcvBfZ92PcTtXrubDD6W/aw/Y0/Zo0j9nTx/wCIvDvgOw0TVtD0m61C0u7FTDMk9rGZEBIJDIxGGUjBBPQ4I/NX9mb9r/46Xf7Snj/4leCPhuPHWo+Polmv9I08yRNbxWmFgdJgsu1UBCsXU7yexIr6f/ak/a6/ak1b4FeK9A8Q/s/X3gnSNZtTYXurXdzJeRW9vc/u3+RbeIKzA7VdmwpI4JxQB+DdFFXNO07UNXv7bStKtpLy9vJEhgghQySSyOdqoirkszE4AAyTQBTor6gf9iz9q6NGkb4W65hQScWxJwPYHJr5kngmtppLa5jaKaJijo4KsrKcEEHkEHgg0ARV/VB8C/2J/wBl1/g14Ju9U+H2nate3uj2V3cXV6hmnlmuoVmkZnJH8TnAAAAwAMCv5X6/Yr4Zf8Fc/EHgX4feHvBesfDa31e50KyhsftcWptaLMluojjbyTbTbW2Ku75yCckYBwADw/8A4KafBb4b/Bb45aPpvwy0hND0/W9FhvprWEnyFnE80BManOwMsSkgHG7J7mvzlr69/aO+PHjr9tz4y6Rqmk+FDa35todK0zSrEveTsod5DufahkYvIxyEUKuAehY8vqP7HP7Umk6fc6rqHwx1uK1s4nmlf7KW2xxgsxwuScAZ4GaAP09/4Jjfsw/A34pfBXXfHvxI8K23iTVpNbmsEN6DJHDBbQQyKI0yApZpm3HknCjtWr/wUs/Zc+BHw0+A1l48+HfhK18N6vZ6vb2vmWIMSyw3KPvWVMkNgoCp6rzg4JB+ff8Agn5+0f8AH74ZeA/EXgj4afCG6+JejR6gL15bSV7V7S5uI1jdJJPKmVwyxKVXClcEkkEY0v2+/wBpX9oH4i/DHR/BHxH+Dl18NdEu9QFwbq8me6NxNbofLjjfyYUjwHYkHcW4xgK2QD8iKK+kdI/Y+/af17SrTW9J+GetXFjfxJPBKLUgSRSAMjANg4III46V5xafBz4qX3xBk+FFp4V1GXxhC7o+li3f7UpjXexKYyFC/Nu6Y5zg0Aea0V9D+JP2TP2lPCGhXvibxJ8ONZsNL02MzXNw9sxSKJfvO23JCjqTjAHJ4rnfh7+zx8cPivo8viD4ceCdT8QaZBKYHubWAvEJVAJQNwCQCMgdMjNAHJ/DDw9p/i74l+EvCmr7/sOtavYWVx5bbX8q5uEjfaxBw21jg4ODX9W9v+xD+ybbW8Vsnwv0ZliVUBeEu5CjGWZmJY+pJye9fy9638OPjR+zv4w8M+IPGfhO98PanBdw32mrf27COeW0lVwBjh8MF3KDnBHTIr97rD9sz9r+ewtp5f2VtWkeSNGZ11B4gxKgkhHtCyg/3SSR0JzQB+G/7X3w88LfCn9pPx34B8FW7WeiaXep9lgZzJ5STQRzFAzclVZyFzkhQASTyfm2vYf2gPHni74m/Gfxb448eaUND17Ur1vtdhseM2rwqIRCVk+bcioFYnBJBOBnFePUAf0ufsdfsc/s2a9+zb4G8UeKPA1jr2r69YrfXd1fqZpWlmOSqnICooACqBwOTkkk/O/7Wn7JXwG0L9p74B+FvDXhtNF0bx1e3Npq1nZO0MM0do8DKVAyUZhKyuVIyAMYIzXhnwD/AOCp3iD4MfCjQPhfqnw/t/EA8Ow/Zbe7j1BrItbqf3YePyJgXXOCwYA8fKDknyj44f8ABQjxl8XvjB8O/itp/haz0MfDeZ7mxsnne786aZ0aYzShYSVZY1VQqgryckngA/el/wBiX9k6RGjb4XaKAwIOICp59CGyPqK/OX9iH9kv4D+Jfip8d9M8XeG4/ENn4K8RTaLpcOoMZo4bVJ5wGK/KGlxEo3nnGcYyc40n/BZy/KMIvhNEr4O0nW2IB7ZAsxkfiK+Tf2c/+ChXi/4FeM/iF4s1TwraeJF+ImoPqt3DHO1iYb15HkJifZP+7xIw2Fc9Du4IIB+kf7en7I37O/g79mDxX468F+C7Lw9rfh5rO4trixUwsTLdRW7pIMkOhSUnB/iAOeK9r+A37FH7L0nwW8D3uq/D/TtWvr/R7G8uLq9QzTyzXUKzSMzkjjc5CgDAXAHAr8qv2l/+Cm3iD9oL4Sap8JrHwJb+G7bW3g+13L37XrmGCVZgka+RCEYyIhLEtwCMZOR9hfAb9sT9q6H4OeEbPTP2c9Q8VWNjp8Nrbapa3UlpDdwWw8mKRYnt5SMogBIchjllwCAAD4T/AOCmvwV+G/wW+N2i2Hwy0hNDsNb0aK9ntYSfIWdZpYCY0OdgZY1JAOC2T1Jr84q+7v2yfHnxw/aQ/aC0zR/Ffw5u/C3iWGzt9O07QUSSe7eORmmDFyieaXd2IZUVQvB5Uk+T6j+xx+1LpVhc6pf/AAx1uK2s4nmlf7KW2xxgsxwuScAdAM0AfNNPjUPIqnoSBTSCDg8EUqsVYMOoOaAP63PD/wCwv+ydpOhafpg+G+mXv2WCOMz3UZmuJSqgF5ZCfmdupOBz0AHFfz7f8FAfhX4H+D37S+ueEvh7p40rRpLa0vFtVYtHDJcR7nWMHlUzyFyQM4GBgD9afBX7av7X+p+EdG1GX9mTUtXa5tIZPttveSWsNzuQESxwvbOyK/3gpZsA9TX4t/tffE3x78WPj14h8U/Enw03g/Wo/JtG0pw/mWsUCBY1dnCl2K/MX2gNnKgDFAHzLRRXsfw8/Z7+N3xY0mbXfhx4K1PxBp1vKYHuLWBniEoAJTfwCwBBIHTIz1FAHjlFem/Ef4MfFb4Qy2UPxN8K3/httRV2tjeQmNZRGQG2N0JXIyM5GRnqK8yoA/UT/gl38Cfhb8afiF4wm+J+iR+IIPD+n272ttcEm38y5kZGd0GN5CrhcnAyTgnBH6aftTfsafszaV+zv8QvEHh/wFp+i6romjXuo2l3YoYZo57OJpk+YE5UlcOpHKkjg4I/Hj9gP42fFn4P/ErWYfhT4Cl+Is2uWIW7063LxzLHbtuSZZlSQRhWbDbkIbIHBxX33+05+11+1NqvwK8X6Fr/AOz3f+DNJ1iyewvNWu7l7uK2trv9zITGtvFhmVtquWwpIOD0oA/BOvcP2avA/h/4lfHzwH4D8VxPPo+t6tbW11HG5jZ4mb5lDDkZAwSOcdCDzXh9d78LviDq/wAKPiJ4e+JOgwxXF/4cvYr2GKcExO0RztcKQcEccEGgD+rZ/wBiX9k50ZD8LtFwwI4gIPPoQ2R9a/lh+OnhHR/AHxp8d+BvDquul+H9c1GwtRK2+QQW1w8cYZuNx2qMnvX62P8A8FnL8owj+EsQfBwTrZIB7ZH2MZ/OvywtvCnxj/ah+I3irxX4P8L3PiDWtVu7jVtQj0yBmiga7mLt1J2qXYhQWyQO+DQB4bRXtnj79m/47/C3Qv8AhJ/iF4G1TQtJ81YTdXNuyxLI+dqswyFzjjOMnjrXidABRWz4d8O694t1yx8M+GLCbVNV1KVYLa1t0MkssjnAVVXJJr37UP2N/wBqXS7C51O++GOtx21pG80rfZS21IwWY4XJOAOgGaAPmiivVfhz8Dvi/wDF2O+l+GfhHUfEcemsi3L2kDOkTSZ2qzcAE4PGc1P8RvgJ8ZvhHY2mqfEvwdqXh2zvpGihmu4CkbyKNxQNyA2OQCckA46HAB5HRRXU+DfBPi74h+IrXwl4G0i51zWLzd5NraRmWVwilmIUdlAJJPAFAHLUV9E+Iv2Sf2lvCeh3viTxF8N9ZstM02Jprmd7ZikUScs7bckKo5J6AcngV87UAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB/9L8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKvaWQNStCeB50f/AKEK/SX9jL/gnxa/tRfDrUviPrnjB/D9pb6g+n28Ftai4kZoY0kkeQu6BR+8UKBnoc44qz+2H/wTvt/2Z/h/pfxB8P8AjF9ft7rUYtOngurUW7q9wrNE8ZR3BA2MGBx1BGeaAP6WkdJEWSNgysAQQcgg9CDX8un/AAVEZW/a/wDEW0g7bDTAcHOD9mTg1+n/AIV/4J8fGTRPDOlaQ37S3i3TmsrWGI2thPcLZwFEAMcANypES9E+VeAOB0r8SP2t/hH4g+Cfx68SeB/E3iKTxZeh47w6nOXNxcrdoJVacuWPm4OHO5gTyDQB82UUV+r/AOyf/wAE1LD9ob4N6d8WvEHjeXQ11me5W2tbW0WcrFbTNAWkZ3TDM6MQFBG3BzkkAA/P39n50j+PPw2kkYIq+JdHJYnAAF7FkknpX9ndfy5/tsfsMJ+ydpHhzxNpHipvEWm65PJaOs9v9nninRfMBUKzqyFQc8ggjoQePmWH9p39pC3hS3g+KfiiOKJQqKus3gCqowAB5vQCgD0z9vd0k/a++JjIwYDUIxkHPItogR9QeDXyDX29+xp+ybdfth+M/E0Os+KH0W10SGO6u7nyjdXVxPdu4TAdlByUZndmznGAckj60+Pn/BKrTfhR8IfE3xK8N+P5tTufDVpJfvbXdksMcsMA3SKHjkch9uSuVIJ4OAcgA/Wr9i90k/ZT+FjIwYDQbQZBzyFwR9QeDX5df8Fm3Q658KYwwLLbawSueQC9pg498H8q/Jrwn8cPjP4D0hfD/gjx3rugaWjtItrYalc20Ad+WYRxyKoLHqcc1y3i7xx4z+IGqjXfHWvX3iLUhGsQudQuZLqYRpkqgeVmbaCTgZxyaAOWr9+f+CNbL/wgnxJTcNw1KwJGecGGTnFfgNX6Z/8ABPL9mXxz8bG8XeK/CnxM1P4cQaSILKSTR3lS6uXmzIFcpJEPKUJnBJJbHAxyAfsD/wAFInRP2MviCGYKXGmAAnGT/aVscD14Ga+lvgk6P8GfATowZToGl4IOQf8ARY6/GT9tv9jL4m+AvgTqHxE1342694+sPDlzbTTadrcszxYuJVthJDumlXzVaUdQPlLc54PsvwO/YL+Lz/CLwldwftEeKPDcV9p8N4mnaTNcJZWqXQ85Y4h9oToH+Y7RlskCgD5R/wCCwjo37QnhRVYEp4YgDAHkH7bdnn8K/Jmvs/8Abr+BXin4D/GpdH8V+Mbnx1ca7p8Gox6nfNI168ZZ7fZOZGcllaEhcORs29DkD4woA/pR/wCCRrqf2YNVQMCy+Jr7IzyM21pir/8AwVndB+yxApYAt4gsMAnk4in6V/O34L+KfxM+G4ul+HvizVfDIvthuBpt7NaCbZnbv8l13bcnGemTU/i/4o/FD4nGxs/iB4u1bxKto5+zLqd9PdrC0uAxQSu23OBnHXFAHnlfqp/wSEdF/aW19WYKX8LXgAJxk/bLM4HrwM19G6R/wRr0J9Ks3134l3Kai0SG5W209GgWYqN4jZ5VYoDkAkAkckDpX5efH34W+K/2P/j7qHg3wx4puP7Q0ZYrix1WxeSyuRDdR7lyUbcj7WKttYg+uDigD+sb4kukfw78UySMEVdKviSTgACB+STX8Tdev6/+0F8d/Fej3Xh7xP8AEXxDq2l3y7Li1u9VupoJUyDteN5CrDIBwRXkFABRRRQB+1H/AARodB4w+J0ZYBmsNNIXPJAlmyQPQZGfrX6x/tfukf7LfxVZ2Cg+HNSGSccmBgB9SeBX893/AAT+/Z48YfHf4h67deE/Ht78PT4bskaa+0xpFvZPtbMixIY3jwh2EvluwAU5yPu79qT9hr4raJ8CvFfijUfj54j8Y2nh61bU5tL1mWd7S4jtB5jDBnkHmAAlMoRuABxncAD8F6+pP2JmVP2sPhcXYKP7agGSccnIH5mvlupre4uLS4jurWRoZ4WV45EYq6OpyGUjkEHkEdKAP7kq/jV/aYdJP2jfilJGwdW8U60QwOQQb2XkEdall/ae/aRmjeGX4p+KHSQFWU6zeEEHgg/va8NZixLMck8knvQAlFFftr8Lf+CR2keM/hx4b8YeIviJPZX+u2FvfPBa2KSQxC5QSoiu8isxCMAxKjnOOKAPkf8A4Jjuqftj+ENzBc22qAZOMk2M3Ff1NEhQWY4A5JNfyW/tY/s7av8Asa/GHSdC8O+KZb95rODV9O1CFWs7uBhI8fOxjtdZIiVZG6YPByK8k1H9pL9obV9PudK1X4m+JbyyvI3hngm1e7eOWOQbWR1aUhlYEggjBFAH7/f8EsZYn+BPi9UcMR4z1QkA5OGgtcH8ccU//gq06L+y9bqzAFvEOnYBPXCzdK/P3/gn3+yb8Qfi78P/ABB8RfDHxa1f4cWT6gNN8nRJJUluZLaNZWecpLEu1RMoj+8cls44zo/t+fskfEX4VfDDSPiJ4k+L+tfEWxs9QFmbXW5JpGge6QlZIN8sqjPlkOOMjGDxigD+hi3dZLeORGDqyqQQcggjqD3r8zvCU0X/AA9W8ap5i7j4FhXGRkt5lk2MeuOcenNfgJpP7Rn7QOg6Za6LofxK8Safp9jGsNvbwatdxxRRoMKiIsgVVA4AAwBXEW/xA8d2vi9viDa+ItRh8UPK851VLuVb4yyAhnNwG8zcwJBO7JBxQB/Zx8RHSP4f+JpJGCKul3pLE4AAgfJJPQV8af8ABMd0b9jfwcqsGKXOqggHOD9vnOD6cEH8a/nC179oP48eKtHuvD3ib4i+ItW0u+Ty7i1utVupoJUyDteN5CrDI6EV+oP7DP7HPxK+IvwQh+IugfGnXfh/Ya9eXJi0/RJJkRvszm3aWfbNEvmM0ZAwD8oX5snAAPsr/goxNFFefAPzZFTHj/TW+ZgPlUjJ57DPJ7V+l1fzm/tufsb/ABI8E6x8OrjWfirqPxBPivVI9At5NekmaWzuLlwUKlpJv3J5L4wQQOGzx976d+wH8YrPT7az/wCGn/GsXkRJHshnuFjXaoGEH2vhR2HpQB+NP/BQJ0k/bD+JbIwYC9thkHPIs4AR9QeDXxxXsf7QXw01j4PfGfxb8ONf1X+3L/R7wiS/+bdc+cqzLK+8lt7K4L5J+bPzN1PjlABRRXo/wh+HN98Xfid4Z+GWnXcdhceJL6KzW4lBZIvMPLlV5OBkgcZPGR1oA84or98H/wCCNPhDY3l/E6/DYOM6bFjPbP76vjz9mf8A4J5XPxu8cfErwp4n8Xpo0Hw41N9Hlls7c3DXN2ksiF0EhjCxYiY8/MSRwOaAPzSr+0H4DOknwO+HbowZT4d0nkHI/wCPSKvwq/al/wCCZNh8A/gzrHxa8O+OZda/sF7drm1urNYN8M8ywZjeN3+cPIpwwAK7ucgA/nd4c+Pvxz8H6NbeHPCfxC8QaNpVmCILSz1S6ggiDMWISOOQKuSSTgdTQB/Qb8UpYh/wVB+Dal1BHhTURjIzkpf4H49q/S8kKCScAd6/kO/Z78JfET9qD9pPw5oV941vrPxHqUrXD67cTzXF9ClhC02+OQv5hkVI8R/OADjkCv2r8Q/8E/PjJqug6lpa/tNeML03dtNCILye4a2lLoV2TKLokxtnDjB4J4NAH85/i5g3ivWmU5Bvbkgjv+8asKH/AFyf7w/nX6afsgf8E8E/aT8JeIfGHiLxgdAttH1aXSIorW2Fy8k1siPM7F2jCpiRAmMk/NnGBmX9sf8A4J4Wn7MfwztPiZoPjJ9ftvt0dlc29zai3ceerGN42R3BwVIYNjqCDxggH9KVm6SWcEkbB1aNSGByCCOCCOtfzD/8FTWVv2utYCsCV0vTQcHofJzg18naR+0Z+0BoGl2uiaH8SvEmn6fYxrDb29vq13FDFGgwqIiyBVUDgADAr1D9l/4F6/8AtlfHK68L+JPFM1rcS2lxq2pandb7y7lWJ44zje2XkZ5UyXYALk5JABAPkmv6mP8AgmI6N+xz4SVWDFLrVQwBzg/bpjg+hwQfxr4v8c/8EftI0LwbrWt+HPiPPc6lp9pNcQRXdgkcEjRKX2u8crMoYAjIU464PSuS/YW/Y4+JXxG+CqfEfw/8aNc+H1hr15P5dhockyK/2VzA0s+2aJS5ZCBgHCgZbnAAPoD/AILFug+DPgeMsAza+xC55IFpLkgegyM/Wv55K/Uf/goX+y149+DGj+FfHPir4o6p8SLW9nk05P7ZeV7m1kKmYeUXklHlsFO7lSGA4Ofl/LigD9n/APgjW6Dx38SoywDNptgQueSBNJkgegyM/Wv11/a0dI/2X/iuzsFB8MasMk45NrIAPqTwK/nf/YB/Z78YfHf4k6zN4S8d3vw+PhuxEk1/pjSLfOLpjGsUZjePCnaS5L9AAAc5H35+03+wz8V9G+Bfi/xLqHx+8S+L7XQLKTU5tL1iad7S5jsh5zggzyDeFUmPKkbgM4+8AD8D6K/YX9nX/glpp/xi+D3h34n+JfHsukz+I4ftcVraWazJFAxxGHeSRCXOMthcDOATjJ+YP22v2N1/ZJ1fwvHYeJD4i03xRDdGNpYPs88UtmY/MDKrOpUiVCpDZzuBAwCQD4Zr97f+CNDp/wAIp8UE3Dd9t0w4zzjy5+cV+CVfpV/wTy/Zo8cfG+98XeJvCnxK1L4cQ6JHb2ks2jvKl3ctckyBGKSRDylEZJySS2OOM0Afs1/wURdV/Y2+I+5gN0FiBk9T9vt+K/k7r9uv20f2Lvid4I+A2r/EDW/jh4g8eWPhua2uZdN1uSaSFllkFuHi3TSgSq0oxlfu7uQetb4T/wDBJLSPHPw08M+NfEXxEnsr7xBp9vqDQWtissUS3SCWNA8kisxCMoY7R82ccYoA+Qv+CZ8iR/tl+CDIwUGLVQMnHJ0+4AH41/VGSAMngCv5MP2tv2b9V/Y3+Lej6L4f8US6j9ptIdV0+/iVrS7gdJGTnYx2uskZKsjdMdDXkV/+0p+0PqtjcaXqfxO8TXdndxvDNDLq928ckcg2sjqZSCrAkEHgigD9+/8AgltLG/wd8fqjqx/4TjVWwCDw0Frg/Q44Pepv+CrzKv7KMiswBbXNOABPXiU8V/Ob4L+KHxJ+G7XT/D3xVqnhk3wQXB029mtPOCZ27/JZd23JxnOMmpvGnxZ+KPxIgtbb4heL9X8TQ2LM8CalfT3axM4AYoJXYKSAASKAPP6/UT/gke6L+1DqSswUv4ZvgoJxk/abU4HqcAn8K/Lutrw94j8Q+EdZtvEXhXU7nR9VsmLQXdnM8E8TEFSUkjKspIJBwehxQB/ar45dI/BPiCSRgirp92SxOAAIWyST0FfxIV7Brv7Qnx68UaRdeH/EnxG8Rarpl8nl3FrdardTQTIeSrxvIVYexGK+9P2SP+Cbln+0b8Irf4reIPGsmhRajc3ENrbWtoLhhHbOYmaVndAGLqcKoI24JOTgAH5V0V+iv7a/7CEP7KPhvw/4v0fxW3iLTtYu2sZI57YW80U3ltKjLsZ1ZCqMDkgg4xkE4/OqgAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//9P8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/bn/gnB+2H8Avgt8F9W+HnxU8QN4d1JNYmv4nltZ54p4rmKJAEa3SUhkMR3BgvUYJ5xd/4KIftl/s//ABe+D+jeBPhd4gfxHqJ1q21CUw2s8EUENqkgO9rhIiWcyDaFDdDkjjP4c0UAf1YaP/wUj/Y71PSrPUbrx1/Zk1zEkj2txYXpmgZhkxyGKB03KeDtdlz0JHNfgX+3P8YPBfxx/aP8Q+PPh/PLdaHJFa2sFxLGYvP+yxLG0iI3zBGIJXcA2OoHSvkOv0p/4JZfDzwR8Q/2itTtvHWiWuu2+k6BdXttBeRiaFbgXFvCHMbZRyElcAMCATkDIBAB+a1fvv8AsF/tufs4/C79m/Qvht8SfEzeHdb0Ge+V0mtLmZJkubmS5SSJreOUbcSbSG2ncDxjBP358a/2e/gVf/CDxpBL8P8AQotuj30qyQadb28qSRQtIjpLEiurKyggqwPFfyGUAfsD/wAFMv2r/gn8d/Cvg/wf8JtZfxBNpt7Lf3NwlvNBBGpjMSx/v0jcuSc8KVA6nJxX4/V6R8G9C0rxR8XvA/hrXYPtWm6trumWl1ESV8yCe6jjkTKkEblYjIII7Gv69ovgH8C4Ikgi+HXh1UjUKo/sm0OABgdYqAP59/8Agmf+0j8KP2ffGfjKL4r6lJo1n4js7Vbe8EEk8KSWjyMUkEKvIC4k+UhCODkjiv0J/ap/b5/Zc8Vfs+eOPB/gvxa3iDWvEOmz6dbWtvZXUbeZcoUDs9xFEgRM5b5s46Anivxb/bL8H+GvAX7T3xC8J+D7CPS9HsdQH2e1iyI4hLDHKyoCTtXc5wo4UcAAACvmSgAor+qP9jH4C/BR/wBmH4e6nd+BtGvr3VtLhvbq4u7GG6mmuJxud2kmV269BnCjAAAGK+bP2rvgD8GB+2H+zzo9v4P06z07xRPfxana2sItre7Sx8qSESRRbUOC7buMuvytlQBQB/PfX65/8Eyv2p/gt8BdH8beGfi1rL6A+rz2t5a3DW808EgiVo3j/cJI6v8AMCMrtIzzkYP7mSfAT4GTRtFJ8O/DpRwVI/sm05B4P/LKv5EvjjoGkeFPjT4+8L+H7cWml6Pr+qWdrCCzCKC3upI40BYljtVQMkk+poA/a/8Abs/bg/Zu+Jn7NniP4cfDjxO3iLW/EMllFFHBaXMKwrb3UVy8kr3EcQ27YioC7m3EcYyR7n8F/wDgob+yZY/CTwdpniLxmdF1PT9Ks7S5s7mxvHkiltolhYFoIZIyCVypVjlSM4OQP5i6/rr+BP7PnwLsvgt4GjTwBoczSaLYTSSXGn29xNJLPAssjvLKjOzM7Ekknr6YFAH4K/8ABRv4+fDj9oH43aZr/wAL7yTU9I0XRodOa7eJ4UnlE007GJZAsm1RKFJZVO4HAIwT+f1fpp/wVT+HXgb4eftAaLH4F0S10GHWNAgvLqGzjEMLzi4uId4iXCISkaA7QASMnkkn8y6ACp7aUQ3MUzDIjdWIHsc1/QH/AMEqvg78KvFPwB1vxb4p8JaZrer3OvXFq1xf2sd2wgt7eBo0QTKwQBpHJ2gZzznAxq/8FQfgv8JfD/wD0nxR4c8IaXo2q2uvWlslxYWsdo/k3KSeajeSEDhtin5gcEZGOcgH0fov/BSL9jvU9IstQu/HP9mT3MKSPa3FhemaBmGTHIYoHjLKeDtZlz0JFfgj+3V8YfBXxy/aP1/x38Pp5bvQ2htbSG4kjMXnm1iEbSIjYYIxB27grEckDpX9OGjfs6fAPRNJs9H0/wCHegC2soUhj8zTbaZ9iKFG6SRGd2wOWYkk8kk1/Nr/AMFGPA3hH4fftU+I9E8E6VBounTW1ldm2tl8uFZriENIyIPlQM3O1QBnoKAPhmiiv6Uv+CbvwS+EGs/speHPFOu+DdJ1bV9ZutRkurq+s4ruVzDdywRgNMrlVWONQFXAzk4ySSAfzW0V/Qp/wUK+A/wcs9d+CM+leENO0p9b8XWej3v2CBbMXFjcOpkicQbAfZvvLk4Iya/SmD4A/Aq1gjtoPh14dWOJQij+ybQ4VRgDJjz0oA/n0/4JoftIfCn9n3xv4wT4r6jJo1l4jsrZILwQSTwpJavIxSQQq8gLh/lIQjIOSOK/RH9qX9vv9lvxR+z9458I+DPFra/rXiHS7nTrW1t7K6jbzLpDGHZ7iKJAiZy3zZx0BPFfi3+2h4P8M+Af2ofiF4T8H6fHpej2V+hgtYciOITQRysqA52rvckKOFHAAAAr5goAKK/qf/Yt+AvwUk/Zg+H2qXngbRr++1bTYr26uLyxhupprifl2aSZXb2AzhQAAAK+Z/2v/gL8G4f2t/2ddKs/CGnWVh4qvbu31S2tYFtre7itHt2iWSKLahwZGBOMsDtYkAAAH8/FFf2fyfAT4GSxtFJ8O/DpVwQR/ZNpyD1/5ZV/Iv8AHjw9o/hL43/EHwr4etxZ6Xo/iDVLO0hBZhFBb3UkcaAsSx2qoGSSfWgDyiv6cfgl/wAFC/2TdP8AhB4N0rxH4zOiappuk2dnc2lzY3jyRS2sSwtloIZYyGKblIY5UjODkD+Y6v65/gJ+z78DLP4JeA1XwBoc7TaJYTySXGnwXE0ktxAksjvLKjOxZ2JySeuBxgUAfg7/AMFHvj78Nv2gfjVpOu/C69k1TSdF0eKwa7aF4Y5pfOlnYxLIFk2qJQpLKvzA4BGCfz6r+g/4mfAX4NL/AMFKvhl4bi8H6dFo2reHp9Tu7COBY7Oa7tFuxFI0C4j48mPK7drbcsDk5/SfUf2ePgLqun3Ol3vw68PNb3cTwyBdLto2KSAq2HSMMpweCpBHUEGgD8ev+Cbf7YPwF+Cfwe1v4efFbXn8O6h/bMuowySW088M8VxBDHhDbpKQyGE7gyqMMuCecaf/AAUY/bI/Z/8AjJ8D7L4efCzxC3iLVLnVYLtzFa3EEUEVsjgmRriOIksXAUKG6HOOM/ijr1rBZa7qNnbLshguZo0XJOFRyAMnnoKzoFV540YZDMAfoTQBFRX9l2h/s6fAPRNGsdH0/wCHegC2soY4Y/M022mfaigDdJIjO7erMxYnkkmv5u/+Cjfgbwh8Pv2qPEGi+CdJg0XT57Wyu2trVPLhE08QaRkjHyoGPJCgDOcCgD4Vr97/ANgX9tn9nP4V/s5aR8N/iX4lbw7rWiXV7vSa0uZkmS5uHuEkja3jlGAJNpDbTuB4xgn8EK/pO/4JtfBP4Q61+yroHinXvBuk6tq+sXeoSXV1fWcV3K5hupIIwGmV9qqiKAq4GcnGSSQD5s/bo/bV+AvxF1P4Tx/DfVp/EsfhPxJa69fy29tLCiQWrDMS/aViLSvyQANoA5YZr9ALb/go3+xrcW0Vw/xDjgaVFYxyafqG9CwztbbbkZHQ4JGe9fLH/BQ74EfB2y1P4K3Gk+ENO0qTWfF1no96bCBbMT2NywMkTiDYDnHDfeXJ2kZNfpRb/AD4E2tvHawfDrw6scKqij+ybQ4VRgDJjz0oA/lJ/av+Jnhv4xftD+NviR4Q806NrN4jWrTp5cjxwwxw7yuSVDlCwB5wRkA5FfPNfUf7avg7wz4B/aj+IPhPwdp8elaPZXsbQWsIIii863imcIDnau92IUcKOAAABXy5QAV7X+zj8QND+Ffx18D/ABE8TLK2k6DqkFzdeQoeURKcMVUkZIBzjPNeKUUAf1fyf8FF/wBjSONnHxFicqCdq6fqGTjsM2wGTX57fsX/ALavwG8C/E743a18QNUuPDdh491+XW9NmuLaSZTC80zeVILYSssu2VTjBXg/NkAH8SaKAP6Cf25P25P2bPiP+zZ4n+HXw68Tt4i1zxE1pBFFBaXMKxCG5iuGkke4jiAXbEV+Us24jjGSP59qKKAPq39ib4teEPgh+0n4U+IfjyWWDQ7P7XBcTRRmUwi7tpIFkZB8xRGcFtoLbc4BPB/oI1L/AIKP/scWGn3V9B4+F9JbxPItvBp995szIpIjTzIETc2MDcyjPUgc1/KVRQB+4X/BPb9s74BfCb4d+LfCHxQ1yTw3eXviG61e3ea2mnimgvI4kCqbZJSHQxHcGAGGG0nnE3/BRb9sn9n74x/Ay1+Hnwt8RN4i1W71S3unMVrcQRQRWyvkyNcRxcsXAUKG6HOOM/hvT4gGkRT0JAoAZX3V/wAE8fjl8PvgD8f5PFnxMu5NP0XUtIutNN0kTTLBLLLDMryJGGfYfJK/KrEEjjGSP6QPD/7OnwD0TQtP0ew+HegC2s4I4o/N023mk2ooA3SSIzu3qzMSTySTX5ueGvgL8G3/AOCnniXww/hDTm0S08LDWYtPaBTZJfyNbxtKLc/uuVkc7du0MdwAYA0AfQvxI/4KMfsip4A8RDRvGh1m/lsLiKCztrG8WaeSVCiqrTQxxjk8lnAAya+Xv2Av22f2dPhX+ztpfw2+JfiRvDus6JdXhZZrS4mjnjuZ3nV4mt45RgB9rBtpyOhGDX6O/FD9nb4Dav8ADnxNp938PdCSOTTro7oNOt7eVWWNmVkliRXRlIBDKwIPev496AP2L/4KYftZ/BD47eCPCXgr4Ta0/iC4sNRfULmdLaaCCJBC8QjJuEjYuxfPyqQAOTnAr8dK734VaNpviP4oeD/D2sw/aNP1TWNPtbiPcV3wz3CJIu5SCMqSMggjtX9f9t8APgTaW8Vrb/Drw6sUKqiD+ybQ4VRgDJjyePWgD+e//gml+0d8K/2ffH/iw/FbUZNHsPEVjBFBeCGSeGOS2dnKyLCryDeG+UhCMjBxxX6P/tO/t+/sseJfgB488J+DvF517WvEGkXem2trb2V3GxlvImhDs88MSBE3bm+bOAcAnAr8W/22fB3hjwB+1N8QfCng7T49K0ezvIWgtYQRFF59tFM4QfwrvdiFHCg4AAAA+WKAP6Lv2Q/28/2YfBv7O/gzwT458Vt4e1vw9ZixuLa4s7qUs0ROJEe3ilQowPGSG6ggd/hz/gpt+0z8Iv2gta8Caf8ACbVH1u38Nw6g91d+RLBCWvTAEjQTKkhZRCSx2BfmGCTnH5aUUAFfrT/wTJ/ak+DPwDtPHPh74taw+g/23JZ3VrctbyzwN9nEiPGfIWRw/wC8BGU2kA/MDgH8lq/a/wD4JIfCr4beN9N+IviHxp4Z0/Xr+wmsLW3e/t0uliilWV3CJKGQFmRcsBu4xnHFAHr37b/7cv7NXxG/Zs8U/Dz4eeKG8Q654h+ywQwwWdzEIxFcxztJI9xFEoQLGR8pLbiOMZI9d+BP/BQn9k/S/gz4J0XxL4yOiarpOkWVjdWlzY3byRy2kKwt80EMsZVim5SGPykZAOQLH/BQT4HfBzTf2T/GviLSPBWj6ZqmjCyuLS6srKG1mika7hhYh4VQkFJGBU5U5zjIBHtv7PP7P3wNtvgT8Pz/AMIDodxJc6Fp1zLLcafBcTSTXNuk0rvLKjOxZ3Y8njoMAAUAfhZ/wUh/aA+Gn7QHxj0XWPhbfSarpWh6Qlk920LwRzStNJMfKWULJtUSBSWVfmBxkYJ/POv6Dviv8A/gyf8AgpH8KPDcfg/TodH1rQ7rUb2xihEVpPdWUd2YXeBMRnBhj3Lt2vt+YNk5/Sm//Z6+A2p2Nzpt58OvDzW93G8UgXS7VGKOCrAMkYZTg8FSCOoINAH8ZFFf0L/8Eyvgj8I9b+GnjvXvEHhHTdZ1CLxXe6bHNqFsl4yWlpDA0UaCcOFAMrkkAFsjcTgYt/8ABUT4M/Cbw5+zjB4s8NeENL0bV7DWLSKG5sLSK0cR3AcSI3kqm9W2jhs4IBGDQB/O7RRRQAV+8/7AH7a/7Ovwp/Z4074bfEzxI3hzWdGu7xis1pcTRzx3MzzK8TW8cowA21g205HAIwa/Biv6Rf8Agmp8EvhDrf7Lej+LNf8ABulavrGsXt+1zdX1nFdyv5Fw8MYBmV9qqigBVwM5OMkkgHyR/wAFL/2tPgf8dfAnhPwR8JtbfxBc2OpNqNzOltNBBEiwyQhCbhI2LsXyNqkAA5OcCvxxr92/+Cs3wh+F/g74Z+C/FnhDwtp2haq+rtYvNYW0dr5lu9vJKUdYgqvh0BBYEjnBAJz+ElABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB//U/GOiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAPpH4K/sk/H39oLRr7xD8LPDJ1PTNPmFvJcy3EFrEZtu4ojTugdlBBYLnbkZxkU/wCM/wCyJ+0B8ANHsfEHxQ8Ltp2m6jP9miuIbiC7jE2Nyo5t3k2MwB27sbsHGcGv24/4JGahYzfs0atp0NzHJd2viK7eWFXBkjWW3t9jOoOVDbW2kjnBx0NaX/BV3UtOtP2ddEsrq6ihubjxLYPFE7qrukUcxkZVJyQm4biOmRnrQB+RWk/8E2/2xNZ0u01a28ELDFeRJMiXGoWUEyq43ASRSTK6Ng8qwBB4IBrU/Zh8PftZfs+ftRXvgr4beD1u/HtrZT22oaXfbDavYvslMkk4kRFiLLEySrKAzbVBO7af6kbC/sdUsrfU9MuI7uzu41lhmhcSRyxuNyujrkMrAggg4Ir8wvAfiHQX/wCCqnxBgTUrZpJvB8NmiiZCz3MTWTvCozzIiozMg+YBSSODQBxPxr+Kf/BS4fCXxYNZ+FWgaTpr6dOl3d6dcpeXcFs67Znih+2S7iIy38DYGWxxX88lf2k/GzULDSvg544v9TuY7S2i0TUd8sziNFzbuBlmIAySAPev4tqAOk8G33iPS/F+h6n4OV31+0v7WbT1ij82Q3kcqtAEjIO9jIFwuDk8YNf0gWnxU/4KhPawvJ8G/CpZkUktqMaMSRzlft/B9R2r+fD4E31lpnxv+HupajcR2lpaeItJmmmlYJHFHHdxMzuzYCqoBJJ4A5r+0FWV1DoQysMgjkEGgD+SbUvg7+1B+1D+0D43s5/C8l148huJLjWoG8qygs2BEaIXlZY1XACxfOS6jcC3LU/4kfsHftR/Cjwdf+PfGXg/ydF0tQ91Nb3lrdtDGTgyNHBK77F/ibbhRycDJr9lf2VvEegX/wC3X+0rDZanbXEl4+mGBY5kcyi1Ro59gBO7ynIV8fdJwcGvqf8AbP1Gw0z9lb4oy6jcxWqTaDewI0rhA0s0ZSONSxGWdiFUDkk4HNAH4SfBn/gpz8b/AINfDfRvhpZaJout2OgxfZ7We8inWdbcH5I28mWNW2DgHbkjGSTzXJeL/wBsn9or9ov49fDvxj4d0uzj8U+GLgRaDpunWzSRPcXDDzd4mZ2bzQoV8uFVRkbTlq+C6+qv2INS0/SP2sPhnf6rdRWdsmqKrSzOsaAyRuigsxABZmCj1JAoA/bu5+Kf/BUJbeVk+DfhUMEYgrqMbEHHZf7Q5Pt3r+cTx1qHijVvG/iDVfG6PH4ivNQu5tSWWMQyLeySs04aMABGEhbK4GDxiv7bWZVUsxwBySegFfxkftCX9lqnx8+JOp6bcR3dpd+JdYmhmicSRyxyXkrK6MpIZWBBBBwRzQB4/X9CvwM+Kf8AwUq/4VB4RTQfhXoOr6VHp0Edld6jcpZ3c9qi7YHkh+1xbSYwuD5a7hhsc5r+eqv7QPgNqFhqnwR8A32mXMd3byaDpoWSFxIhKWyKwDKSMhgQfQgigD+cH9qfQ/2tfj/+07pvgn4meDksvHN3ZQW2maXYBPsq2Q3y+ZHcGR1eMOZWkkaUhTuUlQuBk6l/wTY/bG0vTrnUpvBCTR2sTyskGo2U0rBAWISNJizsccKoJJ4AzX60fEvxDoMX/BUz4W28mpWyS2/hS5tJFMyBkuZxfNFCwzxI6upVTywZSByM/p5d3dpp9pNf38yW1tbI0sssrBI440G5mZmwFVQMkngCgD+d/wD4J/eOf21/Dnw+8Q6H8BPAuneKfDEWpGSR9WdbRYL5o1WVIpGntzISix71+bZ8v3d3Nv8Ab7+IH7butfDfQtK+OvgXTPCfhd9SWUTaTIl2JbyND5KTSCe4MeAXKD5d5z124H3F/wAEqNU028+BHiuztLuKa4h8WahK8aSKzrHNDb+W7KDkK+1tpPBwcdDT/wDgq9qWnWv7N+lWNzdRRXNz4jsGiid1V5FiSYuVUnJCgjcR0yM9aAMjwh8Wf+Col14V0i5m+Efh28eW1hYz3t3Ha3UuUHzzQfbY/LkbqybF2nI2joPxM/a68QfGXxL8fPEmpfHnSk0TxcGiils4VCwQwIgECwsrOJI9mCsm9t2c5r+vbTr+x1XT7bU9MuI7y0u4klhmhcSRyxuAyujrkMrAggg4Ir+Xn/gp7qFhqH7XniM2FzHc/ZrLToZfLcPslS3XcjYJwy9weR3oA/Pmv2j/AGGPiJ+3fpPwOg0f4L/D7SfFPgy0vLkWN1qsyWjqzuXnSIm5gMsYlZju2thiy7vl2r+Llf1L/wDBMTULC8/Y68JWtpcxzzWN1qkVwiOGaGRr6aQJIAcqxR1YA4O1gehFAH5lftvfEb9uC/1/4cD4u+DbTwq1hqSXmhJoypfR3Gqxuvl7nEtzmVeAkRIDAk7W7ff9h8VP+CocljbvL8HPCzO0aFi+oRxuSQMlk+3/ACn1HbpVb/go9r+h6VrfwCi1PUbe0eDxxYXsiyypGUtoXUSTMGIxGmRuc8DPJr9PkdJUWSNg6OAQQcgg9CDQB/GP8fda+JXiH4y+LdY+MFmdP8Y3F8/9o2xjEQhlUBVjVRkbFQKEOW3LhtzZ3HyGvrj9vDUdP1X9rn4lXumXUV5bnUI4xJC4kTfFbxRuu5SRlXUqw7EEHkV8j0Afu1+yV8TP+Ch1r8BvDVh8O/hroviLwraRvDpd7qs6WVxJao2EAQ3UBaNTkJIU+YDq3U/PX7UPxG/bfu/2jfhZf+PvB1roXi/SJBJ4XsNNRLu1uZ5ZUEv7zzZhIzFUWRTINi4OF3bj+zH7D+pafqf7J/wyk066iulg0eGCQxOrhJYsq8bbScMpGGU8g9a+Xv2zPEGhWH7ZP7L0N7qVtbvZajfSTrJMiGFLh7ZImcE/KJGRlQnAYggZwaANq4+Kf/BUFYJGT4N+FAwUkFdRjY5x2H9ocn2r8PfCH7PP7SX7T/xB8a3+geG5dS8Q2d/cXGuvcNDYJDfXEzmWN/OaJFkMm8+WvIAPAAr+vMkKCzHAHJJr8uf+Ce+v6FqvxZ/aWXTNRt7s3njK4vIBFKknm2z3FztmTaTujORhxwcjmgD8Wfi3+xR+0l8EPCMnjv4ieE/sehwSpFNcwXVtdiFpTtQyCCR2RS2F3MAu4gZyQD9K/Dz/AIKtfHfwD4H0PwSfD+haumhWkVnHdXMVwk0kUC7I94hmRMqgC5CjOMnkmv1w/wCCkmo2Fj+xv48t7y5it5b7+zobdJHVWmlF/bybIwSCzbEZsDJ2qT0Br+U+gD7X8S/t4/GfxL+0PoX7R0sOnWuteHLYWVpZRwMbMWjBxLCwZjI3m+a5Lb9wLfKRgV9H6j/wWA+P93p9za2Xhfw7Y3E0TpHcJFdO0LsCFkVXnKkqeQGBBxyCOK/JmigD6U+D37K37QP7SNpqvij4aeHG1eztLjy7m7lngtImuJBvZEad41dgCCwTO0MucZFSfGX9kT9oP9n3RbHxR8TvDB03TL24+zx3MNxBdxrNjcqOYHk2FgDt3Y3YOOlftV/wSG1HT5v2b9e0uK5ie9tfEl1LLArgyxxzWtqI2ZM5CuUYKSMHacdDW/8A8FX9R0+2/ZnsbG5uoorm68QWDQxO6q8giSUuUUnLBQQWx0yM0AYvg34s/wDBUO68J6Pcy/CPw7etLaQsZ727jtbqXKD55oPtsflyN1ZNi4ORtHQfkz8ZvAX7VP7Sf7Vmu+FfFvhLZ8RpUUyadb+XDa2tlbxqI2WZnMfk7SuJWkO5mA3EkCv6qNK1Cx1bTLTVNMuY7yzu4klhmhcSRyxuoZXR1JDKwOQQcEV+YnhDxBoLf8FWfGUC6lbGSXwYlkiiZNzXUbWkjQAZ5kVFZin3gASRgGgD8ivFf/BO79rjwb4b1HxVrHgoPYaVC9xP9mvrO5mEUYyxWKKZpH2jJIVScDpXR/s7f8FEvjD+zn8Oofhj4f0jSNb0i0nmmtTfxzCWATsZJEDQyx7lLlmG4EgsRnGAP6YPilqWn6P8NfFWp6tdRWVpb6XeNJNM6xxovktyzMQAPqa/ijoA+5Pjr+3L8cf2l9a8GW82n2OlXHhrUYr3TLXSrd5Hl1IOBDIRM0rOwOFRB8pycgkjH6+af8VP+CoclhbPL8HPCzu0SFjJqEcbklRksn2/5T6jseK/nr+Ct7Z6Z8Y/AepajOlra2mvaXLNNKwSOOOO6jZndjgKqgEkngCv7SY5ElRZYmDo4BVgcgg9CD6UAfxmftA618S/EXxn8Xax8YrM6d4yuL5/7RtvLEQhkQBFjRQSNioFCNlty4bc2dx8dr69/b11Gw1X9rz4lXmmXMV3B9uhj8yFxIm+K1hjddykjKOpVh2IIPIr5CoA+uvhj+wr+0/8XvB1l4+8EeEPP0TUdxtpri8tbQzIpxvRJ5UcoTna2MNjIyOa4j4jfssfHn4V+N9B+HXjHwpPBr3igqulwwPHdLduzhNkckLOhZWI3LuyoILYBBr+mb9hvUtP1P8AZN+Gb6ddRXS2+kxQSGJ1cJLESrxttJwynhlPIPWvmT9tHxBoOn/tgfsuxX2pW1u9lql9LOskyIYY53tUieQEjasjIyqTwxUgdDQB+VD/APBMz9sqNGf/AIQuBtoJwNV08k49B59fDGraTqeg6reaHrVrJY6hp80lvcW8ylJYpomKujqeQysCCD0Nf3DkhQSTgDvX8af7Sd/Y6r+0P8TtT0y5jvLO78TavLDNC4kjlje8lZXR1JDKwOQQcEUAeKV9o+Cv+CfP7WPxA8KaZ408O+DAdL1iFbi2a5vrS1keF+UcxTSq6hh8y5UZUgjgivi6v7N/2etQsNU+A3w7vdNuY7u3bw9paiSJxIhaO1jRxuUkZVgVI7EEHkUAfym69+yr8e/Dfxb034G6r4TnTxjrCpJZ2iPHIk8TAkypOjGIxoFbe+/CbW3EYNe06h/wTW/bG02wudQl8EJKlrG8rJDqNjLKwQFiEjSYs7HHCqCSeAM1+s/xW1/QoP8AgqL8IIJtRto5IPDN7bSK0yApPcR33lRMCeHk3rsU8tuGAciv08urq1sbWa9vZkt7e3RpJJJGCIiIMszMcAAAZJPAFAH8f3wZ/ZK+P3x+sdT1T4YeF31Cy0icW1xPPPDZxrPjJiVrh4wzqMFlXJXI3YyM2PjN+yH+0H+z9odn4p+J/hg6bpd5P9nS5hube7jWbG5VkMEkmwsAdu7AOCB0r9w/+CVmr6VffBrxzZWd7DPcR+MdRuGiSRWdYZ4LcRSFQchJNjbW6NtOOhqf/grBqOn237MVtYXFzFFc3evWBhiZwryCNZS5RScttBBbHTvQBg+Cviz/AMFQrrwho1w/wk8O3xktIW8++u47S6lygw80H22Py5G6smxcHjaOg/Mnxx+1D+078D/2wdd+LHxA0Wy0vxwLb+zrvSpYd1idPdUMUcbRuWZPkR1lWUkkcsRla/p40bULHVtIstU0u5jvLO7hjlhmhcSRyxuoZXR1JDKwOQQcEV/MN/wVE1Cwv/2uddFjcx3H2bT9Ohl8tw/lyrDlkbBOGGRkHkZoA9A8Y/8ABWj4++K/Cuq+Gbbw9oOkPqlvJbfa7eK4eaFZRtZkWWZ03YJxuUgHnBr5U+D37Gn7Rfx38Lv40+GvhU3+iiZoFuZ7q3tElkT7/l/aJELhTwWUEA5GcggfLtf1Hf8ABL3UbC8/ZA8NWdpcxTT2N5qcdxGjhnhd7uSRVkUHKkoysAcZBB6GgD8Bfij+zx+0D+yrq/h3xT4/0JtBme5S4068jlt7yEXNqwkUFomkQOpAYI/3gCQCAcfbFt/wWE+PcVvFFP4R8OTyoqhpDHdqXYDlsC4wMnnA4r6k/wCCxmo6evwm8C6S1zEL6XW3nWAuPNaJLaRWkCZyVVmUE4wCQO9fz30AfT2neE/j3+3B8ZPEfiPw3o413xNqhN/fGExWlrbxKFjjUvKyogCqqIGYs2P4juNdN8RP2Cf2pvhb4O1Lx54v8HiLRtIj826lt721uniiB+aQxwyu+xerMFwoyTgAmvtH/gjhqWn2/wARfiHpk91FHd3emWbwws4EkqxTP5hRScsE3LuIHGRnrX66/tfahYab+y58VJ9RuY7WOTw5qUKtK4QNLNbvHGgLEZZ3YKo6kkAcmgD+PWiiigAr9Kv+CeHjT9rHw1f+L7H9nDwlY+LLC5jt5NSj1JlgtoZkLCFlnaaD94VLjy95yuTt4zX5q1+8f/BGnULAaD8TtKNzGL1rnTZhBvHmmJUmUuEznaGIBOMZIHegDl/20/iP+35qXwF1fSvi18OtH8M+Drye2TUrzSpkvJQglDxrJi5nMcbSqmX2jnau4bsH1H4A/FL/AIKTL8GfB8Xhr4W6DrOiw6dBFYXmpXKWd1NZxrtt2eH7XDj92F2ny13Lhuc5P1d/wUZ1Cxsv2OfiBFeXMcD3iWMMCyOFMsv26B9iAn5m2qzYHOAT0Br3n9nTULDU/gD8OLzTbmO7gPh3SkEkTh03R2saOu5SRlWUqw7EEHkUAfz6/tGftC/tZ/DP9q7w78VvivoFj4Z8XeGrKNNOsIo1m0+SwmEiyqsiySGVZTJKrsJdyMSFKlRjvr//AILA/H66sbi2s/Cvh2znljdI50iunaJ2BCuFecqSp5AYEHuCKk/4LBahYXXx58KWdtcxzXFl4eRZ40cM8TPdTOodQcqSpDAHGQQelfkpQB+tf7AfxH/bXsPCniy3+BHgzTvGPh+51M3d1Lqrpaxx6jMi+b5MvnW+9mRYy6AsEG04Xd82r+354/8A23tb+FWl6R8d/Aml+FPCU2oq7z6VKl2JblEPkpM4uJzEOWK/d3EYycYr63/4JAajYS/s8+JtKjuYnvbfxLcTSQBwZUjltLVY3ZM5CuUcKSMEqwHQ11f/AAVi1Cwtv2WksLi5jiubzW7HyYmcB5fLEjPsUnLbRycdB1oA/mdr0b4VfCX4gfGvxjb+A/hppD6zrVyjyiJWSNUijGXkkkkKoiDIG5mAyQOpAPnNfp3/AMEl9QsLH9qW6gvLmO3kvfDt9BAsjhTNL59tJsQE/M2xGbA5wpPQGgDyDxR/wTs/a68I+HdR8T6t4JD2WlwvcTi2v7O5m8uMZYpFFMzuQOcKpPoK2/2dP+Chvxh/Zw+Hy/DTw9pWk63o9vPLPbfb45RJB57F5EVoZI9ylyW+YEgk84wB/Td8R9S0/SPh/wCJdT1W5isrO2027eWaZxHHGoibLMzEAD3Jr+JqgD7R/aU/bQ+L37XVt4f8I+ItKsbG00+6823stKhlZ7i8lHlISZHldmAYqqrgEscgnGOitv8Agmh+2RdW0VyvgmKMTIrhZNTsEddwzhlM+QR3B6GvlD4Q3tppvxZ8FajqE6Wtra63pssssrBI440uY2Z2Y4AVQCSTwBX9qMUsc8aTQuJI5AGVlOQwPIII6g0AfxJ+NvBPir4c+K9T8D+NtNl0jXNHlMN1azDDo2AwPGQyspDKwJVlIZSQQa5avtj/AIKLanpur/tl/Ea80m7ivbcSabCZIXWRBLBptrFKm5SRujkRkYdVZSDggiviegAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD/1fxjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD9ev2Af2G/BHx/wDhdq/xK8Y+KNb0pjqb6dDbaNPHaYFtGkjPK7xy793mgKAF24PJ3cW/28/2E/A/wL+Gei/ELwb4q1vUnOqxabNb6zPHdgi7VmV4nSOLZtMfzAht2RyNvLf2Af26vhD+zz8JdU+G/wASbPUo7g6rLqEFxZQLcpKlxFGjKy7lKMhi9wQ3bBq5+3j+3n8IPj38LNI+H3w2stTmuU1eDUZ572FbaONLVHUIBucuzmT2Cgc5yBQB9i6B/wAEqvhDp+iWFjqnjvxfLeQQxpM9rfw21u0iqAxihNvIY0J+6pdsDjJ618M+E/2CPCupftzeJfgRc+LdUTQNB0v+3hdxFE1KSOcwqsJnwUEitcAtL5fzBT8iluPvDSf+CsX7Mt5pdpdapa67Y3k0SNNbrZLMsUhUF0EgkAcKcgNgZ64HSvh7wn+338L9L/bn8UfHy/0jUU8Ja9ow0ONlVGu0EPkMlw0OQMO0GNm/Khs5JBWgD6p+Lv8AwTB+FGnfDDxRquheN/FZ1DTtPuLyEahew3dqz2yGYLLCsERYNsxw4IJ3c4wfnb9jP/gnH8Jfjx8CdJ+LHxC17WEvdcnuxDb6bJBbxwRWs72+GMsMxdmaMtkbQAQMZBJ+kvit/wAFSv2c9X+GnijRvDVnrd9qmpadc2ltDLZrbxtJcRmIF5S7bVXduJwTgcAmvCv2Jv8AgoT8Evgp8ANG+FfxDtNVt9T0Ge82y2lutzFPFdXElyr53IUIMhQqQfu5zzgAHl/7Xv8AwT28A/BfXfhlafDnxHqH2Xx3rlvoM66mIrl4Jbl1C3CNCkAKqDyhXJxw3OK++rb/AIJY/BWC2ihfxx41LRoqkpqkCKSBjhfspwPQZOK+H/2yP2+/hZ8W9f8AhbcfDrStRvLfwPr9vr9094i2hl+zOpFvGuZDlgCS54Xjhucfc0P/AAVc/ZZkiSR01+NmUEqdOUlSR0yJcHHtQB8B/s//ALAnhbxd+0/8U/hb4g8XanDpPw4MKxXGnbLW9uvtwLRbpGEipsUEPhTvPTaOK+gv2nf+Cbfwz8EfAzxb478L+M/Es+oeGbKXUkh1W7ivLWVbZS7xlEhiIZlyFcN8p6givDPgL+3/APC3wT+0/wDFv4r+LdI1G08PfERrdrVoQk89v9hBSPzY8qP3qnJ2sdh+X5h8w97/AGlf+CmP7P3xB+BnjLwD4HtdXvtY8SafNp0K3FsttFH9pUo0ruXY4QEnaFJY4HGcgA5n9mj/AIJgfBj4n/BDwp8RvHfiHXH1XxLaJfsmny29vBDHNykYWSCZmKj7zbhk9ABXxn+37+yN4N/ZT8S+E4/AWr32oaZ4nt7p/K1AxvPBLZtGGPmxJGrK4lXA2AqVPJyMfdf7MX/BS34A/Dr4E+EPh946tdXsdY8N2SWEot7ZbmKQQcLKjh0OHHJUrlTkcjBPxL/wUO/aw+Hn7UHiTwefhva3qaf4YtrtZLi9RYWllvGiJVYwWICCIfMTyWxgYyQD4Jbxb4rdSj61esrDBBuZCCD2PzVz1SGKUclD+VR0AFf0P/Br/gmJ8KtW+FPhTWtf8b+KhqGq6db30y6few2lqrXaCbbHE0EpUKHwSXO4gtxnA/ngr+ib4Rf8FSv2cdB+F3hTw/4qttZsNW0nTbWyuYYrRbiMSWsYiLJIJF3K23cOAQDgjIoA+SPG/wCwN4V0r9uDwj8C7Pxdqj6D4m0062bucpJqUMdsJt8ImAVC7G3OyTYNgYfK235vujWv+CVfwev9HvbHT/HfjCK5nhkSJ7nUIbiBXZSFMkQt0MiA/eXeuRxkda+JfG37fvwt1n9uHwb8e9M0nUZPCPhnSH0aVmVEupFuBOXnWHJAEZuMbC+WCk5GQK+4NS/4KzfsvW2nXVxp0GuXt3FE7QwGyWISyAEqhcykLuOBuIOOuDQB8S/sIfsJeCfjj8P/ABF478ZeKtb01rXWJtJhg0aeOzz9kRHaSV3jl37vNAVQF24PJzxJ+3n+wn4G+Bfwv0n4i+DfFWualIuqRafNb6zPHdgrdqxV4nSOLyypj+YENuyOmOZv2Ef29PhD8B/hx4g8DfEmx1KCe81q41W3msoVukdLuONGjYbkKshi68hg3bFP/by/bz+D/wAfPhRpnw8+G9lqc1z/AGrBqE897AttHElqrgKBucuzmT2AA56gUAfYXh7/AIJVfCHT9CsLHVPHfi+W8ggjSZ7S/htrdpAo3GKE28hjQn7ql2IHGTXwnoX/AAT/APBeu/tw+JP2fdT8UajJ4a0nSjrxuAI/7QmimMIWBpWVk3h5wWl8s7gp+QFuPvPR/wDgrN+zDdaVZ3GrW+uWF7JCjT24s1mEUpUb0EgkAcKcgNgZHOB0r4i8Mft9fC7Tv26fEfx+vNI1FfCOt6KNCjZVRrtBEYHW4MOcEO0GNm/IDbskgrQB9MfEb/gkr8BtK8B+INW8KeJPEFrq9hZT3NtJdzW1xbh4UMmJI0t4mZWC44cEZzzjB/n/ALDW9a0pGj0u/uLNHOWEMrxgn1IUjNf0SfEn/gqj+zle+APEOn+G7LW9Q1S8sZ7e2gltFt43kmQxjfKXbYo3ZJ2k4HAJ4r+clUdvuqT9BQBcv9T1LVJVn1O7lu5FG0NNI0jBeuAWJOMmtKPxZ4phjWKLWb1EQBVVbiQAAcAABuAKwWVlOGBB96cIpSMhCQfagBhJYlmOSeSTSUoBY4UZPtTmR1GWUge4oA/eP9lj/gnB8NfHvwJ8K+P/ABV4y8SW+oeJrYag0OlXcVnbRJN9xAjwylmAHzPuGT0AAr4s/wCChf7Kfhr9mXxR4SuPCev6lrVl4otrrK6rIs9zDJYtEGPnIsYZHEwwuwFSp5ORj7d/Zd/4KUfAX4dfAjwj8PvHNnq9nq/huzWwl+zWy3MMoh4WVXDqRuByVIypyMkYJ+Kv+CiH7WHw9/af8ReDU+HNpex2Hhe3vBLcXsawtLLetEdqxAsQEEI+Yn5i2MDGSAfAreLvFbqUfWr1lYYINzIQQf8AgVfoz/wTx/Y+8JftJQeL/E3jDxFq2jW+gtb2kUWkSpbTSPcAyFnmdJPkATGwJyTndxg/mLX6hf8ABO79sb4Z/szWHjHw98SrO/MGvSW11b3NjEtxh4FZGjeMspGQ+4MCRwQQOMgHvf7aP/BPf4e/CT4B618UvCPi7xDfXfhuW1le21e6jvIZo7idLYhAkURjcGUNuywwCuOcj0X4Q/8ABKL4FeKPhd4V8UeLvEWvz6vrWm219cNZzW1vbhrqMShEje3lYBAwXJc5IzxnA4T9s3/goh8EPjH+z94g+Fvw+s9VudU8RPaR+Zd2620UEcFxHcs5O5y5PlBAoA+9nPGD6/8AB3/gqL+ztoHwq8JeHvFNnrVjqukaZa2NxFFaLcRh7WMQ7kkDruVtu4cAjOCMigD498b/APBPfwLoX7aPg39nvSvEuoDwv4p0x9XeWZYnvYYrYT+bCJFVY2ZzAdr+WAu7lW2/N9ran/wSC/Z2m066i0jxH4ltr54nEEs1xaTRxykHYzxraxl1BwSodSRxuHWvkTx3+338LdZ/bf8ABHx40rSNSk8J+F9KfR5mdUS6kF0s++dIckYjNx9wtltp5GQK+4tS/wCCsP7MVrp11c2Ftr15dRRO8UJsViEsiqSqFzIQu48biOOtAHw/+wj+wj4L+OHgbxN448Z+K9a077FrM2jwwaNMlnn7GiO8sruku/d5oCqAu3B5OeJ/29P2E/AvwK+FWmfEjwd4q1zU5ItSisJrfWZ47sFbtSQ8TJHEYypj+YENuBHTHLv2FP29/hD8Bfh94l8E/Euy1G2lv9cuNXtprOJbpHW7jjRo2G5CpjMQOeQ27tjmX9vH9vb4OfH/AOEdh8OfhpaalPdNqkF9PPeQrbRxR2ysAoG5y7OX9gACSegoA+wfDf8AwSr+EVhoGn2Wq+O/F0t7DBGsz2l/DbW7SBfmMUJt5DGmfuqXYgdzX4s/tffBi1/Zu/aC1nwH4a1q71G2t1gvba6uG23ardp5m2SRMBnXJBcBd3XA6V+12i/8FZf2YrnSLKfV7bW7C+khQz262azLFKVG9BIJAHCnIDYGRzgdK/FH9s344+HP2iPj7rPxH8IWdxa6RNDbWlsLkATSrbRhPMZFyE3nkLkkDGeeAAfN914l8R39u9pfard3EEmN0ck8jo2DkZUkg8jNfr7+xd/wTn+E3x8+BunfFf4h67rEd5rNzdJDb6bJBbxwxWszQYcywzF2ZkLZG0AEDGQSfxrMcijLKQPcV+2P7EP/AAUF+CnwQ+AemfCz4iWmqwalotzeMktnbrcxTxXU73AbO5ChUuVKkHoCDzgAHhn7fn7D3w+/Zd8NeGPGHw71rUby11i7ewuLbUmimcSCNpVkjkijiAGFKlSp5wQeor83Y/FnimGNYYdZvURAFVVuJAABwAAG4Ar9Of8Agob+2n8Lv2lPCvhXwb8NbPUCmlXsl/c3N9EtuATG0SxJGGYtncWLEgDAAzk4/KsRSkZCEg+1AH3r+wR+yd4T/as8a+JbLx3q97p+leHbSKd47AotxPLcuyp+9lWRVVdpLfIS2QMjmvuf9oj/AIJcfBP4dfBTxh8QfBHiHXY9W8M6dPqUa381vcW8q2qGR42SO3hYF1BCsG+U4JBHFfFH/BPf9qrwF+zB418UXfxFtLyXTPElnBEtxZIsrwy2zs6hoiV3K4cjIbKkDggkj72/aN/4Kafs9+Pfgd408CeCrbV73WPEmmXGmwLParbxJ9rQxNI7l24RWLYCksQBxnIAPwWsdf13S4Tb6bqNzaRFixSGZ41LHgnCkDPA5r0v4NeB7r44/GXwl8O9Y1aa3PiS/gspLx8zyRRseSoY8kDOATjNeQqjsMqpI9hXrXwG+Itn8IPjN4P+JWq2cl9aeHNRgu5oIiFkeND8wQtxuwcgHAJ4yOtAH9BM3/BLP4KSQvGvjjxqCykAtqkDDJHcfZRke2a/nU+KHgv/AIVv8SvFfw9N39v/AOEZ1W9037Rs8vzvskzw+Zsydu7bnGTj1r+jF/8Agq3+ywqMwXX2IBOBpwGfbmXFfzqfFbxlF8Svij4v+INpaPZxeJdWvtSS3ZhI0S3c7yhCwABKhsE4GaAPPq/oZ+CX/BMf4V638JPCXiDxB428UrqGs6bbX8y6dexWlqhvEE4SOJoJSAocKSXO4gtgZwP56GR15ZSPqK/oh+DP/BUP9nbw98J/CPhvxTZ61Y6to2l2lhcRQ2i3Ee+0iWHckgddyuE3DgEZweRQB8mfEH9gfwpo/wC234K+Bun+LtUfQ/Fmntq7XdwUl1GFLNZi8QmAVWZ/s/ySbBs3DKtt5+6dY/4JWfBy+0m9srLx14xjuJ4ZI42uNRgnhV2UhTJELdN6A/eXcu4cZHWviXx/+358Lda/bd8C/HfStI1KTwn4T0uXSZmdUjupRdpOHmSHJAERuPulsttPIyK+39R/4Ky/su21hc3Gnw65eXUUTtFB9hWPzZACVTeZSF3HjJ6daAPiH9hL9hHwZ8b/AAX4p8aeM/Fetad/Z2tT6NDDo0yWZY2aRu8sruku4N5oCqANuCSTni1+3p+wn4E+BXwm0/4leDvFOuanLb6jFZTW+s3Ed2rJdA4aJkjiMZUp8wIbcCOmOV/YU/b1+EnwJ8CeKfBvxJsNSt5dS1241m3msolukZbuONGiYZQqYzEDu5Dbu2OZ/wBvP9vT4PfH34P2fw3+G9nqc13LqcF7PPeQLbRxR2ytgAbnLs5ftgAAknoCAfXnhj/glX8IrHw7ptpq3jvxdLexQRiZ7O/htrdpNvzGKE28hRM9FLsQO5r4V0v9gHwXrH7cmufs96h4o1GXwzp+knX2uSI/7RlikMSiBpSpj3h5gTL5fzAH5ATkfeOhf8FZP2Y59FsZtYttb0+/eCMz262azLFLtG9BIJFDgHgNgZHOB0r4j0L9vn4XWX7dutftA3Gk6iPCGqaJ/YKMqobtQnkutwYc4wzQ7dm/IVt2cjbQB9QfED/gkl8BdO8Ea7qXhbxJ4htdWs7Oae2ku57a4txJEhcCSNLeJmU4wcOpGc+1eGfsOfsBeAPjR8DrT4qeMPFuv6fca5dXKRW2j3MdnHFHaSvB+8LxSmRmZS2RtABAwTk19MfEL/gqn+zhdeBdes/DtnreoandWU8NvBJZrbo8sqFFDSl2CKCck7ScdATxXzf+xD/wUH+CfwN+A+nfCz4j2mqW2o6NdXbxzWkC3MU8V1M04b76FGUuVKkHoCDyQADyL/goX+xf4P8A2cvDXhfxz4O8S6vq8OqXb6dNBrEyXUit5bTK8cqJFhcKQUKnkgg9RX5XV+rP/BQv9tf4V/tLeEPC/gv4ZWmoMul3z6hc3V7EtuAfKaJYkQM5YneWLEgDAAzk7fymoAs2d7eafcLd2E8ltOmdskTFHGRg4ZcHkVfvfEOv6lAbXUdTurqEkEpLM7rkdDhiRWQAWOFGT7U5o3UZZSB7igBlep/BH4cx/F34ueEvhlPenTYvEmowWb3Kp5jRJI3zMFJAJA6ZPWvLK9Z+BHxFsvhJ8Y/B/wAS9StJL+08OalBeTQRMFkkjjb5ghbjdjpngnjI60AfvY//AASF/ZpKMI9e8UK5BwTeWZAPY4+xjP518Wfsi/sFeFPiR8Tvi34c8X+LdVtrb4caq+hxyaQyWc104mlXznd1m2piH/VhTyQd3y8/e7f8FYP2U1UsDrrEDoNPXJ9uZa+Fv2Sv2+vhd8MPib8YfE/j/SdRsrH4jay+t2ptFW7eAtNM3kSLlMnbNneOPlIwMigD0X9sr/gnp8OvhR8Ate+J/hLxf4ivbzw21tO1vq91FeQTRzTJblVCRRFHBlDBstwCuOcj8U7TxH4h0+3W0sNUuraBM7Y4p3RBk5OFUgcnmv21/bG/4KKfA34v/s/eI/hf4AtNWudV8RG2hD3VsttDDHDOlw0hbexY/uwoUD+LORivw0EcjDKqSPYUAS3V3d39w93fTPcTyY3SSMXdsDAyxyTwMVXpSCpwRg0lAH62f8E+v2I/Bf7Q3w61/wCI3jHxPrWkrBqbaXBbaPOlq2YIYpnklkeOXeG84BVCrt2k5OeN79vX9hPwJ8CPhDZ/E3wd4p13U5bTUIrOa21m4ju1ZLoHDRMkcRjKlOchgwPbHOT/AME+/wBuX4R/s4fDHXfh38TLXUY5bnVn1O3ubKFbhJFmgihaNlLIUKGEEHkNu7Y53f28/wBvb4N/tA/Bq3+Gfw1tdSnu7jUYLuee8gW2jhjtg2ABucuzlsADAABJPQEA/G6pra5uLOdLm0leCaM5V0Yqyn1BHIpgjkYZVSR9Kbg52456YoA2rrxL4jvrd7W91W7uIJPvRyTyOjYOeQSQea/XX9ir/gnV8Kfj/wDBKz+K3xE17V47nVrq5jgt9Nkgt0hitZWhO8ywzF2ZlLZG0AYGCcmvxyMcijLKQPcV+1H7D3/BQX4KfAv4E2Pws+JFpqdtqGkXd08c1pAtzFPFdStMG++hRlLFSpBzgEHkgAHn/wC2T/wT4+H/AMDn+Htx8N/EOotD4w1y30GePVPKuGikuslJ0aFIflUAhkIJPBDDmvvSw/4JXfBe0sba1m8c+M3khjRGMWpQRRkqoBKp9mbavouTgcZNfEn7af7ffwo+Mx+HNt8NdN1C8Twj4gt9eupLxFtA/wBlyFgQAyEl8klzgLgcNk4+4Lb/AIKx/sry20UtwuuwSuis8ZsFYoxGSuRLg4PGRxQB+DP7Ufwet/gH8evFvwns9Sk1e20SaBobqZQsrxXltFdoJACQXVZgrMMBiCwAzgeA19DftXfGHSPj5+0D4v8AixoFlNp+m63LbLbxTkGXyrO1itVd9vAMgi3lRnbu25bGT880AFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/W/GOiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP6Qf8AgkdoOiR/s46xrqWEA1G98QXUM9z5a+bJHBBAYkZ8ZKoXYqM4BY46mtL/AIKueHtBuf2fdC1i4063kvrTxHZQwzmNfNjiuI5fNRXxkK+xdwBwdoz0Ffiz8A/2zvjr+zfoN/4X+HGpW39k6hOLpra9txcRxzbdrPHypUuAobkg7Rx6z/HT9tD4+ftIaNpnhTx9qVuNNsbkXMdtYW4tlluMbY3k5YsUBOzkAbj3xgA/rM0nw/oWg6XaaJoun29jp9hEkFvBDGqRRRRgKiIoAAVQMACvzA8BeCfByf8ABVHx86aJZqbXwnHqUOIEAjvZ2s0kuFGMCV1kcM45O5s9TV3wjoP/AAVXj8K6Qlzr3gtJVtIQy6mJnvgQg4uWihZGl/vlWILZOT1r8oPiZ8ZP2rv2cP2svEXjjxpq0MfxE2eRdsirPp9zYzIpijSPCg2+1UaNSFZSqlsODQB/Sd8cvD+ha38GfHGm6xp9ve2kui35aKaNXQlIHdDgjqrAMD1BAI5FfKf/AATI0DQrL9j/AMJ6laafBDd6pcanNdzLGoknkjvpoVaRsZYrGioM9AoFfjZ42/4KXftTeOvCeq+DtR1TT7K01i3e2nls7IQ3Aik4cJJubbuXKkgZwTgg4I4j4I/t2/tC/AHwUnw98C6laSaHBNJNBDfWouDAZjudYm3KVRnJcryNxJHU0AfsJ/wUc8HeE9X8UfAG41TR7S6lvvGljptw8kSlpbKaRDJbucZaJj1U8dfU1+oUWn2FvEkEFtFHHGoVVVAFVQMAAAYAA6Cv5LPib+1b+0d+094u8G2Gsakr6rpV/B/YtrpsS2ijUpZVWGUfNzNv2qrM2F7YySf2utND/wCCqn2SHzfEHgHfsXd5iT+ZnHO7Zb7d3rt4z04oA/EP9uHRNH8PftX/ABI0nQbKHTrGLUVZIIEEcSmWCORyqrgDc7Fjjua+U69c+PVr8TrP4x+Lbb4zSNL40S+k/tN2ZXDTEAgoU+Xyym3ywuAEwAAOK8joAK+o/wBinRNH8RftU/DbR9esodRsZ9UUyQXCCSJ/Ljd13I3Bwyg4PHFeu/CP/gmx+0X8Y/h/pXxI0KTRdL0vW4/OtE1G7ljnkgJ+WXZDBKAr9VywbHJABGcHXP2Uv2nf2a/jz8P/AA1o5th4y164E2gXum3IeB54WAkUtMkZHlhgZQ6bSjfxAkUAf1Vy2FjNG8M1vHJHICrKyAhgeCCCOQa/jN+P2l6bofx2+I2i6Nax2Wn6f4j1e3t7eFQkcMMV5KiRoo4CqoAA7AV/Qfc6H/wVT+zS+X4g8Ab9jY8tLjfnHG3fb7c+mePXiv5v/HcPiu38b+ILfx4ZT4mi1C7XVDOweU3wlYXG9gSC3mbskEgmgDlaKK/R3wJ/wS4/aX8e+DtH8aWk+haXba3bR3cNve3ky3CxSjdGXWK3lQFlIYAOSAQDg5AAPzior274+/s+/ET9m7xyPAPxIht1vZbaO7t5rSXzre4gkJUPGxVGwHVkIZVOVPGME+I0Af0ef8Ei9B0RP2dNc11LCAaleeIbmCa58tfOkigt7cxoz4yVQu5UZwCxx1NaH/BWrQdEm/Zq0/W5bCBtQsddtI7e4Ma+bEk8cvmKj4yFfau4A4O0Z6CviL/gnzpX7cN18PfEFx+zzqWh2PhE6gFddfLNE18sa+abdYo5HU7DH5hbCn5cZIbFr/goFpP7c1t8NNFuf2gdT0K+8ILqG0r4fLIgvGQ+SblZY43b5Q/l7cqDu3YJWgD8hq/UH/gkroejax+03qVxq1jDeSaZ4dvLm1aZA5gn+02sXmR5+6+yR1yOcMR3r8vq9b+Cvxu+If7P/jeL4gfDS/Wx1RYZLaQSIJYZ4JcFo5Yzwy7lVh6MoI5FAH9ePxd8OaBr/wALPFuka5ptvf2VxpV55kM0SvG22JmXII6hgCD1BAI5FfH/APwTD0DQ7P8AZB8L6naafBDd6pdanLdzLGoknkjvZoUaRsZYrGioM9AAK/HXxj/wUy/ap8aeF9T8J3mq6fYW+rQNbyzWVkIbhY5OHEcm5tpZcrkDIB4IOCOD+CH7dn7QfwA8FL8PvAmpWkmhwzSTwQ31qLjyGmO6RYm3KVRmyxXkbiSOSaAP2E/4KQeDvCera98BrnU9Htbqa88aWOnTu8SlpbKd1Mlu5xlo2PJU8fmc/qDBpunWsEdtbWsUMMKhEREVVVVGAqgDAAHAAr+Rn41/tkfHn49ah4e1DxtrSW7eFpxd6fHp8QtUiu1YMtxhSSZVwArE/KOgGTn3y3/4KqftaQW8cL32kTNGqqZH05d7kDG5trgZPU4AHoBQB+kn7LXgfwZpv7eP7Rb6fodnbnSv7O+x7IEX7N9tj8y48oAYTzW5fbjP0r6v/bO8O6BrH7LPxOj1XTre7W00K9uoRLGreXcW8TPFKmR8rowBUjkGv5q/h/8AtifHv4b/ABR8RfF/QteFx4g8WZ/tQ3cSzQXXOU3RcAeV0j242D5R8pIPo3xR/wCCiX7THxb8Dap8PfEeqWNppOsx+Td/YbRYJZYT96IybmIRxwwGMjIJwSCAfv5+w54e0HSf2UfhsNL063tftulQ3U/lxqpluJstJK5A+Z2PUnnt0Ar8xf8Agsnoei2Pif4Ya3ZWMMGoX9rqsVxcIgWSaO3e2MSuw5YIZH256bj61237JWif8FHm+A3hqX4c6x4ZtfCckbPpUev+ZJeC0J+TaYYpMRZz5YdtwHYLtFfK37aPw6/bN8dfGbwB4H+Nr6drOs+IY3tPDyaQ4j04u0ii4A8xY2SQExmVnH3dmCQMAA/Mqv3i/wCCN2h6NN4d+JOvTWMMmpJdWNsty0amVYGjkdow5GQpYBiBwSAT0GPmST/gkb+1AkbOuqeGJCoJCrfXOWI7DNoBk+5AqT9hLwX+2v4e8U/ELw58C5tL0Q6JOtjrsOvNvtEv4JGRURYlkYzLtkG5Rs25ySdlAH6s/wDBSbw9oWofse+Nr+90+Ce50ptPuLSV41LwStfQRF42xlWMbuhI6qxHevov9nvw9oOifAn4f6fo+nW9lbDQtOkEcMaou+W3SSRsAfed2LMepJJPJr8hf23dH/4KDw/AjUJ/jFq3h288ExXNsdTTw/vSXaZAITP50cZaHzinCknfsJGBkfIfgT/gpT+1H8PvB+k+CdL1TT72x0WBba3kvbJZp/Jj4jVnDLu2LhQSM4AySeaAP1L+Kfgnwfcf8FRfhW0+iWchvfDVzfz7oEIlu7Vb0QzuMfNJGI02MeRtXB4FfqBqWh6LrGn3Ok6rYQXllexvDPBNGrxyxSDa6OrAhlYEgg8EV/LL4C+Nn7Vn7Sf7VvhXxn4Q1aGT4hoBb6eSqQWNtZwo7To6HI8goZGlHzM25tuWIFfrX4m0H/gqvJ4c1RLbX/BDTNazBBYCVLwsUOBA00CxiX+4XIUNjJAoA/nD8RQw23iDU7e3QRxRXUyIo4CqrkAD2ArGq3frdrfXC6hu+1CRxLvOW8zJ3ZPrnOaqUAFfp5/wSY0PRtZ/aevp9WsYbyTTPDt5dWrTIHME/wBotovMTP3X2SOuRzhj61+YdfYH7D1l+0HffHW2T9m65trTxKljcNcyXxAsRYZQSfaRhi0ZkMeAqlt+wgcZAB/Uh8WPDuga/wDDHxXpGuabb39jc6XdiSGaJXjcCJmGQR2IBB6ggEcivjb/AIJgaBodn+yH4b1O00+CK81S81KW7mWNRJPJHeSxI0jYyxWNFUZ6AAV5F8XtB/4KjyfDDxOt9rnhGa0+wTfaE0bzY9RaAL+9Fu00KIHKZ/iBxnad2K+eP2FdI/b9n+CEVx8EtV8PWXgmS9uTYp4g3u5YORObcRRyFYvNDZDEfPuIHJJAPqf/AIKS+D/Cmran8C7rU9Htbma78aWOnTO8SlpLKdgZLdzjJjcjJU8fma/UG303TrSCO1tbWKGGFQiIiKqoqjAVQBgADgAV/O1+3Fo37d0esfDpvjFqOm3ol1NItB/4RtzHCmrs48rcJFicTnjy2PygZwQd2fv7T9D/AOCqosLYT+IPAQkESbvPSYy7tozvMdvs3Z+9t+XPTigD8UP269E0fw7+1r8SNJ0Gyh06yjvopFgt0EcatNbRSyEKuANzszHHcmvkqvuiD9lr9qH9pL9ozx74S8QfZn8b6PMbjXb2/uBHaxtJgQ7WhVyVkTHkqiEBAOFA46D4qf8ABND9o74S+ANZ+I2sy6Jqmm6DA11dxafdyvcLbpzJIFmgiUrGuWbDZwDgGgD91v2GPD2g6T+yf8N/7L063tftulx3U5jjVTLcTEmSVyBlnY9Seeg6AV8v/tp+CvB+pftf/sySahotncNrGpXkF6ZIUb7TDbPbPDHMCMOsbOxUNkDcfWvHP2R9E/4KOt8BfDcvw31jwza+E5Ud9Kj1/wAyS8FoT8m0wxSYhznyw53Adgu2vlP9t/W/2zfhx8WPAfjT44a1Ypq2lxvceHrrQz/oUUsMiNPsR0VvNyY/M3rhlKDkDAAP6X5LGylRopbeN0cEMpQEEHqCPSvy0/4J8+DPCWj/ABj/AGk30vRrS0bS/Fs+nWhjhVTb2a3FyRbxnHyx5RflHHyj0FfnA/8AwVX/AGs3RlW70ZCQQGGnLke4y5H5ivnz4Ofti/Hj4HeI/EvijwfraXN54vlNzqg1CIXMdxdM5kNwwJBEuWb5gRkMcg8YAP6CP+CkPh7QtQ/Y98cX19p8E9zpX2C4tJHjUvBMb2CIvGxGVYxyOpI7MR0NfQX7Onh7QdE+Anw8sNH063srb+wNNl8uGJUXzJrdJJGwB953ZmY9SSSeTX80Xxp/b1/aJ+O/gef4d+NdTs4dEu5Y5LmKxtRbtOIjuRJG3MSgcBtvHzKCelfqH8AtD/4KcD4NeED4c1vwlBozafC1gmt+ZJfrZsM24laGF0/1W3Z8xYJtDfNkUAfJf/BXjQ9G0r9oDw3faZYw2lxqfh+Ka6kijVGnkS5niV5CANzBFVQTztAHQCvyir7W/bwsf2jrH40RD9pW6tLzW5NPgawk00j7B9iBYAW67VZR5ofeHUMXyeVKmvimgD+jL/gkL4f0Nf2fPEfiAafB/ad34juLeW58tfOeGC1tmjjZ8ZKo0jlR0BYnvXRf8FZNB0Sf9mS21mawge/sNbs1t7gxr5sSzLIJAj4yA4UbgODgZ6CvhL/gntpf7bt14F8SXH7O2paLY+Ezfqso18s0DX6xqZPs6xpI4fyzH5hICkbMZIONn9v7R/26oPhfpE/x91PQr7wguoqrp4fLIou2U+QblZY43YY3+XtyoOd2DtoA/H+v02/4JOaJo2s/tRXU2rWMN4+m+Hr26tTMgcwzie2iEqZ+64SR1yOcMaNE/wCCTn7UmsaRZarPc+H9Mku4Ula1ur2cTwlxnZIIraRA69CFdhnvXM/Aj4H/ALW/wS/a4l+GPwvax0/x5pdjLLczTSiTS5NLlCEySnbueF2Me0bN4fb8oI4AP6RPin4d0DX/AIa+KdH1zTbe/sbnTLtZYJoleNwImIypHYgEHsQCORX8Vdf0WfFrQf8AgqRJ8M/Ey3mueEJrU2M3npo3mx6i0O396LdpoUQOUzj5gf7p3Yr+dOgAorR0fSNR1/V7HQtHga6v9SnitreFcbpJpmCIgzgZZiAM1+mVv/wSP/aint4ppdR8NW7yKrNG99cF0JGSrFLVlyOh2sR6EjmgD0n/AII7aFouofErx9rF/YQXN9p2mWi2s8kavJAJ5XEnlsfu7woDEdQMdM1+uX7Yfh/QdY/Zc+KMWq6db3aW3h7UbqISxq3lz28DyRSrkcOjqGUjkEV/NV4Q+Ivx8/YY+L/iPQ9Gni0nxFY5sNStJVW6tJ0wJI2Izhhhg8bAggN6FgfQfib/AMFF/wBpr4reBtW+HviHU7C10rW4jb3ZsrMQTSQN9+LzNzEK4+VwOqkjoTQB8K0V9+fB7/gm7+0T8aPh/pnxJ8PyaNpelaypktE1G7ljnlhBwJdkMEoCsc7dzBuM4wQT4r+0d+yr8Vf2XdX0jS/iUlnLHrsUktndWEzTW8hgKiVMukbh03oSCgGGGCecAHzbX7s/8EbdC0WfSPiXr09jBJqUM+nWyXLRqZUgkSV3jVyMhWZVJA4JAJ6Cvwmr6L/Z/wD2p/jD+zRdarP8MNRhhg1pEW6trqEXEDtEcpIFJBDqCwBB6MQQeMAH9Ef/AAUc8P6FqH7H3ju8vtPgnn0xbG4tZHjVngmN5DGXjYjKtsdlyOzEdCa94/Zu8PaDon7P/wAObHR9Ot7K3Ph/TJjHDEqKZJ7ZJJHIA5Z3ZmY9SSSeTX81Pxn/AG+P2ivjr4Gufh1401Ozh0S9kje5jsbVbdpxE29UkbcxKBwGwMZKjPTFdP4A/wCCkv7UPw68G6T4H0jVNPvLDRIFtbZ72yWacQx8Rozhl3BFwq5GdoGSetAHtf8AwV60PRtL+Pfhm/02xhtbnU9AjlupIo1Rp5EuJo1eQgfMwRVUE84AHQCvydr6q1jxP8ev28fjjo+l6jPDqvijVEWzs4gFtbO1toFaWQgDO1FAeVz8zHnAJwtfSmof8ElP2o7KwubyG98OXskEbyLBDfXHmylQSETzLZE3N0G5lXJ5IHNAH5g05eWAPrX2H+z9+wz8cv2j9K1nXPBUenadp+h3jafNNqdw8KvdooaSKMRRzMTGGUsSAPmGCecWv2hP2Efjl+zX4RtfHPjltLv9HuLlbR5tMuZJjBK4Jj8xZYoTh8EAqGGRzjIyAf1TeGfDugaB4d0zRND063sNPsbaKGC3gjVIoo0UBVVQMAAV+aOj+CPBqf8ABVTWJV0SzDJ4MGqLiBOL95YomuQMY80ozKX6kE9zmm+BdB/4KqJ4M0RJdd8GxMtnCNuqiWS/UBBgXLRQsjSgffIY5OeSc1+Wfxg+Ln7Wv7Ov7WeqePfH2rQR/EKO3ETSQhZtOuNOmX93HFHhQbf5QVUhWDruOHBNAH9L/wATfDmga/8ADrxNo2uabb39jdaddLLBNErxuPKY4KkY4IBHoeRzX8U9foN4r/4Kb/tV+LvDWpeGLnVdOsINUge3kns7IQ3CJIMN5cm5tjEZG4DIzkEHBH580AFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB//X/GOiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACrenyJFf20sh2okqMT6AMCa/ZP/gnh+xN8C/jz8HtV+I3xUsbrWL06tLYQQpdS2sUEdvFG5YeQyMzOZedxIAUYA5zd/wCCgP7D3wJ+CPwm0fx98LbG60W9OsW+nTxtdS3UU0V0jncfPZyrIY/l2kA5OQeCAD9sdH+KXw11/SrPXNH8U6ZdWN/Ck8Eq3cWHjkUMrAFgRkHoRkd6/mR/4KR+KfDni79rPxPqPhfUoNUtbe3sbV5rdxJGJ7eBUlTcOCUYFTgnBBHUGv2a0f8A4Jdfsi2GlWdjqXh+91O7ghRJrqTUrqN55FUBpGSKRUUsecKoA6AV+FH7bHwX8JfAP9ofxB8O/AzTDRIY7a6t4538x4VuolkMQc8sqEkKWy2MZJPJAPk6iiigD0z4K6xpnh74yeA/EGt3C2enaZr2l3VzO+dsUMN1G8jtgE4VQScCv7HYviD4CniSeDxLpkkcihlZbyEqykZBBD8giv4zPhp4WtvHPxH8KeCb2d7W38QatY6fJLGAXjS7nSFnUHglQ2QDxmv6X4f+CYX7HUcSRv4VvJWVQC7apehmIHU7ZQMnqcAD0FAH4HftreJfD/jD9qf4i+IfC9/FqmmXWogRXMDb4pPKhjjco3RgHUgEcHGQSMGvluveP2nfhjonwa+PfjT4Z+GpprjStCvfLtmnIMoikjSVVYjAYqH27sDOM4GcV4PQB/WP+xP8S/h5e/ss/Dm3t/EmnmbTtKgs7mNrmNJIbiAbZI3RyGVlPqORgjIINfMn7W/xa+GVl+2b+zjdXHiewEHh+fUJdRlWdXjtEvRFHA0zrlUDsjdTwBubC4Nfzp17j+zX8NNG+MXx28F/DTxDPNbaZr1+sNy8GBL5Sq0jBCcgFgu3ODjOcHGKAP6+ZPiB4DhjaaXxJpqIgLMzXkIAA5JJL8AV/HX8d9a0rxJ8b/iF4i0G6S903VPEOq3VrPHnZLBPdyPG65wcMpBGR3r+kCX/AIJhfsdSRui+FLuNmBAZdUvcqT3GZSMj3BHtXwH+xj+wx8FPiX46+MWkfEhLzXrPwFr02hWMfnvahkhmlXz5DAVYyERgbQdoyeCcYAPxlr+xL4B/E/4c6v8ABHwHe6d4n06aEaJYRE/ao1IkhgSKRGVmBDI6srAjIIIr8z/23/2Bv2d/hL+zr4h+J3w20y70XWfD0tnIpN5Pcxzx3FzHbNG6zu+ABLvDLg5UDoTX4O0AfqJ/wVk8Y+FfFv7Q+iQ+GNVt9VbR/D9va3ZtpBKsM7XNxMI2Zcjd5ciNgE4BGea/Luvqn9i74NeFfj1+0T4a+HHjZphot2tzcXKQN5byraQvN5W/qquV2sV+bBOCDgj94dU/4Jd/sh3um3VnY+Hb3TrmeJ0iuY9Su3eF2UhZFWSRkYqeQGUg45BFAHjP/BJnx/4H0/8AZ81zwxqOvWVpq1pr9xcy2086RSrDcW8CxSbXIyrGNwCM8qavf8FXfiB4Hvf2ctO8NWOvWV1qt/rlrNBbQzpLK8dvHL5rhUJwqb1yTxlgOpr52/YB/Yd+BXxr+GfiLxv8UrO71q7ttcudKt41upbWKKK0jjbePIZWZpDLzuJACjAHJLP+ChX7EfwJ+BXwZsPiP8K7C60e/i1SGymie6luop47lHbLeezlWQx/KVIBycg8YAPxZoor7k/4J+fs/eA/2jPjnc+EfiOJ5tF0rSLnU3t4JDCbh45YYFjeRSHVR5287SCSoGcE0AfDdFf0w/Ez/gmT+ylB8PfEd34d0S90bU7WwuJ7a7j1C5naKWFDIp8uaRkYErggjkE4IOCP5nqACiu0+HHhi28bfEPwv4MvJ3toNf1Wy0+SWMAvGl1OkTOoPBKhsgHjNf0wQf8ABMH9juGCOKTwteTsihTI+qXgZyBgs22VVyepwAPQAUAfy10V73+1D8MNC+DHx98afDLwzNNPpWh3gS2a4IMoiliSZVZhgMU37d2BnGcDNeCUAf1h/sR/Ev4eXn7LHw6toPEmn+dpumRWdzG9zHHJDcQcSRujkMGB9RyCCMggn5e/bJ+K3w0tv2wP2bbiXxNYeT4evry41GRZ1eO0iu3t0heZ1yqBzG3U8AbjhcGv53a9m/Z3+HekfFr44eCvhvr80tvpviDUoba5eAgSiJjlghIIBIGAcHGc4PSgD+wSTx/4DijaWXxJpqIgLMzXkIAA5JJL9BX5ff8ABP34qfDe6+K/7RXleJLFRrniu41Ww8yZYvtNi9xcbZ4/M27k+denI3DIGRXtsn/BML9jp42RfCl3GWBAZdVvcqT3GZSMj3BFfAn7G37C/wAFPiR8QvjLofxHW816x8Aa7LodhH572u9YppV8+QwFWMhWIDaCFGTwTjAB92/8FHPiN4BH7IvjLRU8RWEuoay1hb2cEdwkks8qXsMzKqoSeI43YnoAOvSv5d6/eb9tv9gP9nf4Ufs6+Ivib8NtMu9F1nw69pKpN5PcxzpPcx2zRus7uAMS7wVwcqB0Jr2b4L/8E1P2V9Y+Evg/W/FOiXusatqulWl7c3T6hcwF5LqJZiBHDIiKq79qgDOAMknJIB+Sf/BOnxT4c8H/ALW/g3VvFOowaVZSJfWwnuHEcfnXNrJFEhY8Au7BRkjkgV/T/qfxO+HGjabdavqnijTLazsonnmle8hCpHGpZmPzdABmvw68ffsJ/BXSf27vAvwT0n7da+DfE+kSaxcWfns7q1qtxugSd8yCOU24LEksNzbWHy4+8dT/AOCXf7IV7p11Z2Xh290+4nidI7mPU7t3hdlIWRVkkZCVPIDKVOOQRQB/MX4guIbvXtSu7Z98M1zM6MO6s5IPPqKyK/af9gL9hz4GfGr4deJ/GvxStLrW7mz1250i2iW5ltY4o7OONzJ+4ZWZpDLzuJACjA5OX/8ABQj9iH4EfAv4LWXxH+Fmn3Wj6hBqkFnNG93NdRTxXKOfmE7OVZCnylSM5IIPBAB+Ktfpd/wSn8W+GPCf7TN6fE+qW+lLqnh+8s7VrmQRJLcGe2mEYZsKGKRORkjOMDnAP5o0UAf2WfFj4pfDXQvhj4q1XVvFGm29rBpl3uc3UbcvEyqAqsWYsxAAAJJIABNfIH/BMv4h+BI/2S/D2gz+ILGDUdIvNRiu7eW4SKWF5buSZAyuQcNG6sCMg5xnIIH8yVFAH9GH/BRv4pfDiDVPghanxJYyTab4xstVukimEzQ2NuwEk7iPdtQE9+TztBwcfpvb/EPwBd28V1a+JtMmhmVXR0vIWVlYZDAh8EEcg1/GT8O/DVv40+IHhnwddzNbQa7qdlYSSoAzxpdTpEzKDwSobIBr+mK3/wCCYH7HcMEcMnha8ndFCmR9UvAzkDBZgkirk9TgAegAoA8X/Zl+LXwxuv28P2gbqHxRp5t9eTTxp8xnVYrs2MYjuPJkbCP5beh5ALLlQTX1h+2F8Svh5Y/swfExLnxLp4e+0K+s4EW5jd5bi5iaKKNFUlmZ3YAYHHU4AJH5gfAf9hH4KeKP2t/i/wDC3xWb7VPDHgFbZrG2M7QvJ9vUSL500RVz5IJUbSu44Ld1P0T+0x/wTn/Zj8G/AXxx408EaPeaLrfh3S7nUracX1xcAtaIZfLeOd3UrIF2k4yM5B4oA+mv2HviX8PLz9lb4eWsHiTT/P0zTY7O6je5jjkhuISQ8bo5DBhkHkcggjIINfm5/wAFg/GvhHxH4h+GeieH9ZtdSvtMt9UmuoraVZTCly1sIS5QkDeYnwM5+XOMEZ91/ZQ/4J3/ALNXj39n/wAHePPH2k3mt634js1vp5je3FsqeaTtiSOB0XagGMnLE5JOMAfEP/BST9ln4V/s2694IuvhVBcWFl4mgvlntJp3uESSyaHEiPKWf5xNhlJIG0EdTQB+ZlFFfqv/AME2/wBkn4Q/tGWXjXxD8V7W51OPQpLW1trWK4ktow1wHdpWaFlcsAm0DO3BJIJxgA/Kiv7Cf2d/if8ADnVvgP8AD660/wAT6dLHHoWnQN/pUalZbe3SKVGVmBDI6srAjIIr84P22P2Af2dvhV+zr4k+Jnw30y70XWfDjWkyk3k9zHOk1xHbtE6zu4A/e7gy4OVA6EivX/gn/wAE1v2WNa+EPg7XvFWi3usavq+lWd9c3T6hcwF5LuJZiBHDIiKq79qgDOAMknJIB8B/8FaPGPhXxX8ffD1v4Z1a21R9I0GK3u/s0iyiGZ7iaZUZlyNxjdWxnoRmvyyr74/4KHfs6fD39nD4w6V4e+GiXFtpGt6THf8A2aeVp/Ik82SBlSRyXKt5e75iSCTg4wB8D0Af0Nf8Ek/H/gjTfgJ4j8LalrtlZ6va+IZ7uS2nnSKQQXFtbpHJhyMqzROMjPK844z0n/BVL4g+Brr9nGy8O2ev2Vzqd/rdnLBbQzpLK8durmVgqEnam5ck8cgdSK/nBooA/tV8PfFL4a6/oOn63o3inTLqxvreOaGVbuIB43UFTgsCOOxAI6EA1+Znhj4r/DT/AIemeJ9Q/wCEmsBaXPhQaRFcGdfIe/ia2ke3Ev3N4WN8jPVSud3Ffzu0UAf2YfFP4pfDXQvht4o1XVvFOm29pBpt0Xc3UbY3RMqgKrFmJYgAAEkkAAk1/GfRRQB6D8JdV07Qfip4M1zWJ1tbDTta065uJmyVjhhuY3dzgE4VQScDNf2TW3xE+H95bRXlp4m0yaCdFkjdLyEqyMMqwIfBBHINfxjfD/w5B4x8eeG/CN1M1tDrmpWdi8qAM0a3MyRFlB4JAbIBr+mW3/4JgfseQW8UMvhe8uHjVVaR9UvA7kDBZgkirk9TtUD0AHFAH4O/tzeJvD/jD9q/4ieIPC2oQ6rpk97CkdzbtvikaC1hhk2MOGAdGXIyDjIJGDXydX7OfAz9hH4K+Jv2vfi78KvFJvtT8L+Ao7WSxtTO0Lyfb0WRRLNEVciEMVG0jccFu4P0b+0p/wAE5f2YvB/wH8c+M/BOj3mi614d0q61K2uFvri4BezjM3ltHO7qVkC7ScZGcg5FAH0l+w38S/h5efsq/D20g8Saf5+mactndRPcxxyQ3EJO+N0chgRkHpyCCMgg1+cv/BYTxt4Q8R618MtD8P6za6lf6ZDqs11FbSrKYY7lrYQlyhIG8xPgZz8ucYIz7b+yb/wTw/Zr8ffs/eD/AB74+0q81vW/EdoL6aU3s9ssfmk7YkjgdF2oB1OWJyScYA+KP+Ckv7K/wq/Zt1nwPe/CqC4sLPxNDfJPaTTvcIklk0OJEeUs+XE+GUkgbQR1NAH5kUUV+qf/AATb/ZK+EX7Rtt421/4r21zqUWgvaW1taxXEltHuuA7tKzRFXLAR7QN23BJIJxgA/Kyiv3u/bU/YA/Zz+Fn7Ovib4lfDnS7vRda8Om1nRvts9zHMktxHbtG6Tu4AxLuBXBBUc4yD+CNAH2v/AME8fFXhzwb+1z4H1nxVqMOl2DG+tvPuGCRia6s5oYVLHgb5HVQTgZPJr+orUfiZ8OtJ0+51XUvFGmW9pZxPNNK95CFSONSzMfm6AAk1/E9RQB/Rn/wS6+JHgCP4YePtEuPENlb3/wDwlt9qAgmmWGQ2l1DAsMoEhXKuY3HHQjnHGbv/AAVT+IHga6/Zst/Dtnr9lc6nqGtWclvbQzpLLIluHMrBUJO1AwyTgcgdSK+Tv+CdH7FvwQ+P/wAK9f8AiH8VrK61e6h1d9Mt7eO5ltYoUgghmL5hZGZnM2DuOAFGBkmuh/4KC/sP/Ab4HfBK3+JHwt0+60bUbXU4LWWN7ua6iniuQ33hOzlShXKlSOpBB4IAP2h8M/FL4a694d0zWtH8U6ZdWN9bRTQyrdxAOjqCDgsCPcEAjoQDX823/BTjxb4Y8YftU6ldeFtTg1WCw02ys55LZxJGlxEHMke8fKWXcN2CcHg8ggfnvRQAUUV+5f7B37CH7P3xl/Z/0/4nfE7TrvWtW1m7u1CrdzWsVvFbTNCqIsDJuLbSzMxPXAAA5APw0or9d/8Ago9+xx8F/wBnrwP4V8bfCi0utKk1DUW065tpbmS6ikVoXmWQNMzOrLs24B2kHoCOfyIoAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/0PxjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD9df+Cfv7Zk/wU+Gut/DWT4ca74xii1E6ilxoMBunjN1GsbJOnAQfuQUIPzfMMDbk2/29/wBtS5+MHw60L4fQ/DfXfB8b6mmpNca/AbUyGzUqqQIPv/63LnI2/Lwd2R9o/wDBI+3gj/Zi1O5SJVlm8R3odwoDMFt7baCepxk4z0rU/wCCrNrbTfs4aPNLCkkkfifTgrMoJUPHOGAJ6Z7+tAGV4X/4KWz6x4c0zVbr4H+Nbia7topXk0+wM9m7OoJaCU4Lxk8oxHIxX4sftS/E3X/2mP2jNc8UaR4VvtNv7xo7G30kxPLfgWUfl4liVdwlwhZ0A+Xkc4yf66be3gtII7W1jWGGFQiIgCqiqMBVA4AA4AHSvzL8B6bYD/gql8RJltIg6eCreZW8tcrKzWKNIDjIYqSpbqQSM4NAH87+r/Cn4peH9Om1jX/B2s6bYWwBluLnT7iGGMEhQWd4woySAMnqcVQ8OfD7x74wtpbzwl4a1PW7eB/LkksbOa5RHxnazRIwBwc4POK/sg+MlvBd/CLxvbXMSzxSaJqQZHUMrD7NJwQeDXyn/wAEzbaCD9jTwTLDEsbXE2qySMqhTIw1C4TcxH3jtULk84AHQCgD+afSI/GfwW+IHhnxV4j8PXenX+i31pqsFrqNvLa+eLSdZAMOqtsZk2kj371+50X/AAWL+DRiQz+BtfSQqNyq1qyhscgMZVJGehwM+gqj/wAFj7a3b4W+ALwwoZ01meMSbRvCNbklQ3UAlQSM4JA9BX8+lAHu3xe8ZeI/2lvjj4o8feG/Dly974kuWuY9Oso5LyaOGNFRchFLMQiguwUDOcADArgNe+GfxI8K6edW8T+FNW0exDKhnvLGe3iDN0XfIirk9hnmv1y/4I0W0D+LvifdtErTRWOmIshUF1V5ZyyhuoDFQSBwcDPQV+rX7Y9tBdfsr/FSO4iWZV8P3zhXUMA0cRdWwe6sAwPUEAjkUAfyZaB8NPiP4rsP7V8L+FdW1iy3lPPs7Ge4i3r1XfGjLkZ5Ga7z4VeLPE/7Nfxs8LePfEfhy5ivvDl1HeNp99HJZyywsGQ43qGXKk7W2kZHQjIr+of9iy2t7X9lL4XR28KQq2h2shCKFBeRdzMQMcsSST1JOTya/Ln/AILNW0C+IPhVdrEomktdXRpAoDsqPalVLdSFLMQOg3HHU0Aezyf8Fi/gyI3MPgbX2kAO0M1qoJ7AkSnA98H6V8m/sY/tu3/gLx38UtRvPh3qvij/AIT7U5dfeDQI2up7OWWZyyMh6w/vcByQQQAQd3H5L1++3/BGu3gHgn4k3flL5x1GwQybRvKiGQhd3XAJzigDz79tr9um4+JfwH1P4ZwfCzxJ4VXxLcWsUl9r1sbWFEt5VutsOM75GaIDBIAXceoFfkPo3wq+KHiLTYdZ8P8Ag/WdT0+4yYri10+4mhk2kqdrpGVOGBBweoIr+nP/AIKS21vcfsZ+PpJoUla3OmSRllDGN/7Rtl3KT907WIyOcEjoTX0t8DraC0+C3gK3tYlhiTQdMwiKFUZtYycAYA5oA/lb/Zj+JXiD9mf9ozw/4s1fwte3+oadI9pPpJjeG+Zb6IxYjiZd3m7ZAyKR8xwOM5r9svEf/BSyTSNA1LVYPgd42gktLaWVZL6wMFqjIhIaeUbikYIy7YOBk4q38SdN09v+CpXwrla1iLyeELuZmKLlpE+3qrk45ZQAAeoAAFfprNDFcRPBOiyRSKVZWAKspGCCDwQR1FAH89H7BX7at18IvA3iXwJP8N9c8XpLqsmrLPoEBumia8RUaOdD90fuQUbPzfMCOMk/b+/bPn+M/wAL9J+Gsfw317wdFc6gt89zr0BtS/2RCoS3XkP/AK3Lkn5fl4O7I+5/+CVdpawfAPxTLDCkbv4u1JGZVCkqkNttBIHIXJwO2eKd/wAFW7W2m/Zp06aWFJJIvEmnBGZQWUMkwbBPTI4PrQB/O7p/wg+LOr2Nvqmk+CdbvbO6RZIZ4NNuZIpEYZVkdYyrKRyCDg179+x/+0If2RPjbeeLPFnh65voZbG50i/sx+4vLffJHISqSbRvWSFVZXxwW6HFf1n2tvBaWsNpaxLBDCiokaKFRFUYCqo4AA4AHSv5ev8AgqJbwW/7XviAwRLF5thprvtULuY265Y46k46mgD7g+IX/BXf4a634G17RPCvgfVv7W1Gzmtrc3rwJbK8ylN0hjkZ8KCThRk4xkZyPwToooA6jwR4ouPBHjTQPGlrAl1PoGoWuoRxSEhJHtZVlCMRyAxXBxziv3wg/wCCxnwcaCNrrwLr0cxUF1R7V1VschWMikgHoSoz6DpX889FAHsPx/8Ais3xw+Mfir4rHTxpS+IbrzktQ/mGKNEWKMM3G5tqAsQAM5wAMCvHqKKAO20D4a/EbxXYf2r4W8K6rrFlvMfn2djPcRb1xld8aMuRkZGc12/ww8Q+Kv2efjV4T8a6/wCG7qPUfD17Bff2bexS2k08eSMAOoYbhkK20jPY9K/qH/Ymtre1/ZP+F8dvCkKvotvIQihQXkyzMQMZLEkk9STk18x/tj6dY3H7ZH7LEs9rFI8upairs0asWWJ7V0BJHIRmLKD90kkYJoA0Lj/gpAILeSb/AIUV4+HlqzZfTdicDPzNzgepwcV+b/7LH/BQvRfgt43+KHiXxx4UuLy1+I2rSa1t02VS9rcySyOYsTFQ0eJThs7gVHBzx/ShX8aX7SltBZ/tE/FC0tYUt4YPE+sokcahERVvZQFVRgAAcADpQB+jv7Wv/BS7wR8ePgjrPwm8F+EtRsJ9fktluLnUHhCRQ28yXGY1idyzs8arzgBST1wK+kPgb/wUVntPhD4S0u6+DXi7VpdM0+CxN3pFmbmxn+xr5AeKQ4JyE+YfwtlcnGT/ADz1/aD8CLe3tPgh8PoLWJYY18P6XhEUKozaxk4AwOTzQB+EPxA/bmv9Q/bg8IfGJPh5qVmnheyXRF0W6DR6rPHerLvbytvyzE3J8qPkMAuSN3H3n4h/4KVyaToOo6pB8DfG8Mlpbyyq97YeRaoyIWDTyjcUjBGXbBwMnFWvifp1g/8AwVG+Ecr20TO/hO9lZiikmSNb8I5OPvKAMHqMcV+mksUU8TwToJI5AVZWGVZTwQQeCCKAP55f2C/21rv4R+DfFPge4+HGt+L47nVpNYWbQIDdPC96io8cyH7q/uQY2zk/MCOM1N+37+2hP8ZfhZpfw1j+G2v+D4rvUFvXudetzal/sikBLdeQ5zJlyT8oxwd2R9x/8ErrK0t/gb4xnggjikfxjqcbMqBWKRw22xSQOi7jgdBk461J/wAFXLa3m/ZitZ5YUeSHxDp+xmUFl3LMGwTyMjg460Afzuad8Ifizq9jBqmk+CtbvbK6QSQzwabcyRSIwyGR1jKspHQg4NcxD4X8TXGvnwpBpF5JrYkaE2C28jXQlTO5PJC79y4ORjIwa/tys7eCzs4LS2iWCGCNUSNFCIiqMBVUYAAHAA4FfmV4R06xH/BVjxpMLWLengiKcN5a5ErPZxmQHGQxUlS3XBIzigD+eTVvhP8AFPQNOn1jXfBus6bYWwDS3Fzp1zDDGCQAWd4wqjJA5PWuAr+2P4k2tve/DvxRaXcKXEM2l3qvHIodHUwPkMpyCD6Gv4nKAOl8F+JbjwX4x0Lxjawpcz6Ff2t/HFISEke1lWUKxHIDFcHHNf0e2H/BSQXthbXn/CivHjefGkmYdO82I7lByj/LuX0bAyOcCv57vgfbwXnxp8AWlzEs8M/iDSkeN1Do6tdxgqynIII4IPBr+0egD+cz4Cft0X+g/tWfEv4lz/DvUdYj+IQRW0vSw1xqNp/Z42RfIQA/yA+dwuDyMAbT9H/tOf8ABQSfxJ8CvF/hG2+EHivQX8R2MumG+1qzNrZwJeDynYuM5faTsXgFsZOOD7f+zTpthB+31+0rNDaRRvGmkbWWNVK+fEskmCBkeYw3P/eIycmvqn9r22guv2W/irFcRLMi+G9ScK6hgGjgZ1bB7qwDA9QQCORQB+Tv7Nv/AAVH8BfCX4LeGfhn4z8HaldX/hu3Fms+nvC0M0MZ/duRK6Mr4OGHIyMg84HyZ+3Z+2Hof7WWueFH8MaBcaJpfheC6CteOjXE0140ZkysZZFRRCu3kkktnsK+CKKACv0T/YS/bY8Pfsow+KtH8W+HrrWdO8RNbzpLYugnimtwy7WWUqpRlcnIbIIAwQcj87KKAP2L/ay/4KYeCPjr8ENa+E3gvwjqNjP4ge3Se51B4QkUMEyXGY1idyzl41XBwACT1wK9N+Ef/BWj4b+D/hh4X8IeK/BOrPqmhadb2Er2TwPbuLVBEjoZXRxuVQxBHBJAJAyfwnooA+0P2zf2lIf2u/i7pXiLwn4eudOtbGxh0qxtpCJru4ZpXkyUj3Dc0kpVVUtkAHOTgfO178Hfi5ptnPqOo+B9ctbS1RpZppdNukjjjQZZ3ZowFVQMkk4Ar6t/4Jn29vc/tkeCluIllCQ6m6h1DYdLCcqwz0IPIPav6oZYo5o3hmQSRyAqysMhgeCCD1BoA/hqoroPFkaReKdZiiUIiXtwqqowABIwAAHQCsOHmZB/tD+dAHoGnfCL4saxYQappHgrW76yukEkM8Gm3MsUiNyGR1jKsD2IOK5iLwv4mn18+FIdIvJNbEjQmwW3kN15qZ3J5IXfuGDkbcjFf236dbQWen21paxLBDBEiJGihERVUAKqjAAA4AHAr8y/C+nWI/4Kt+LJhaxb18DxzhvLXcJS9pGZAcZ3FSV3ddpIzjigD+efVvhP8U9B06fV9d8G6zp1hbDdLcXOnXMMMYJxlneMKoyQOTWZ4c8A+O/GMM1z4R8OalrkNuwSV7GzmuVjYjIDGJGAJHODX9nXxEtre98AeJbS6hS4hm0y8R45FDo6mFgVZTkEHuDXxb/wTCtoIP2OvCssMSxvcXmqPIyqFMjC9lQMxH3jtULk84AHQCgD+bCxs/Gnwe8beHvEniPw9d6Ze6XeW2o29vqNvNa+f9lmWQDDqrFSy4JH86/oc07/AIKSfbdPtrw/Avx43nxJJmDT/NiO9QcxyfLvXn5WwMjnApf+CkWnWN8fgUbu0iuN3jzToD5kavmKX78ZyD8r7RuXo2BkHAr9NQMcCgD+bT4Tf8FCLD4eftQ/Ez4y+K/B1x/Znj0RQyWVvKPtlkbECOEHzdquxVcSg7cMcrgDafcfj5/wVU+HnxK+Dni34d+EPBmqQaj4m0+fTRNfvAsEUd0hikkPlO7FlRiVGAC2MnHB+Cf+CgdtBa/tifEqK3iWFGvLZyqKFBaSzgdmwMcsxLE9SSSeTXxvQB+7v7Jf7flx4P8AgP4b8DXXwl8T+I28MxnT1vtCtTdWsqRfMpZjjbIA3zrkjoQecD43/wCChn7UFx+0P4n8J6U3grU/BkHhe2uZFi1mMwXsz37R7mMXRYwIFCEEkktnoK/df9h61t7T9kz4YpbQpCH0iKRgihQzuzMzEDGSxOSepPJr81v+CzltAt58JrxYUE0ketRtIFAdlQ2ZVS3UhSzEDoMnHU0Afh5X6X/8E8P2q5/2f7nxd4Y/4QbVvGkGvLb3eNEiNxdwPakx5aLp5REvLZGGwMHdx+aFfvT/AMEaLe3/AOEZ+J935S+f9s0xPM2jfs8uc7d3XGecUAct+2j+3dP8RPgLrPw3g+FXiXwuPE0tvbvfa7bG1gRIpVucRkZ3ysYgApI+Xce2D+Pei/Cz4neJNNi1nw74Q1jVdPn3eXcWun3E8L7SVba8aMpwwIODwRiv6hP+CitvBP8Asb/ERp4lkMMNi6FlB2N9vtxuXPQ4JGR2Ne8fs929va/AX4cQWsSwxjw5pJCooVQWtIyTgYHJJJ96AP4477wx4l0zXR4X1LSbu01kvHELGWCSO6MkuDGvksofc+4bRjJyMda6u9+Dnxd06zn1DUfA+u2trao0ss0umXSRxxoNzO7NGAqqBkknAFf0MfFrTdPl/wCCn3wXkltYnZ/DWoysWjUkyRRXxjYkjlkIG09RgYr9NpI45o2ilUOjgqysMgg8EEHqDQB/Oj/wT3/bGuPgd4C8RfDh/h3rfjKB9R/tRJ9BgNzLE1xEkLJOnRVxApRgeTuBHArf/b6/bSn+Mfwn0/4axfDXX/B8d9qCXcl1r1ubXeLRThIFGQ5JfLkn5Rjg7sj7b/4JZ2NpbfB/4gSwW8cLt421OIsiBSUjgttiZA+6u47R0GTjqan/AOCsFvBL+yo08kSvJDrmnlGKgshYSglSeRkcHHbigD+ZeiiigAr9n/2Fv24J/hT8FI/hjN8MPEPi1NDvLh473Qbc3Sbbt2mKTg42OGY4wcMuOAQSfxgr+pD/AIJfW0EH7HvhmWGJY3uL3VHkZVCmRhdyIGYj7x2qFyewA6AUAfmB/wAFDP2vJ/jx4d8L+Al+H+s+DILC6fU2k12E29xM4RoVWKPoYwHYsxJJOAAMHP58W3wY+MN5bxXdp4F16eCdVeORNMumR0YZVlYRkEEcgjrX9DX/AAUn06xvrX4H/a7WK43ePdNgPmRq+YpQ2+M5B+V9o3L0bAyDgV+mYAAwOAKAP4brm2uLO4ltLuJoJ4GZJI3Uq6Opwysp5BB4IPSoa+3v+Cjtpa2X7aHxGhs4UgjZ9MkKxqFBeXTLSSRiB/E7sWY9SSSeTXxDQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB//0fxjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD9b/+CfXwW/as8ZfDzX/FPwa+KSfD7w5NqAtjBJAt99ouoYw0jiGRWWLaroNw5foeEFWv2/Pgj+1l4U+H3h7xJ8XfimnxA8Px6kLZYI4FsPs93Oh8pzFGqrLkI43E5TtwzV7x/wAEv/2h/gl8P/gPq3gnx74z0zw1rEGt3F55OpXKWgeC4hhVGjeUqr8xMGCkleMgZGb/APwUv/aN+B3jf4I6J4Q8D+NNM8SarLr1peeTplyl55cFqkgkeRoiypzIoUMQW5wDg4APS/B/7M//AAUE03wpo+nzftDw6a9taQRm1bTYr1oCqAeWbiRN0pT7u85LYzmvx/8Ajhq37Rn7Mn7Umv6rrPjea58f25Eja1buG+1W11GCm6J1KBDGQPJZSqEAKMKpr+jrSP2xP2W9Z0u01a3+KXh6CO8iSZY7nUYLedA4yFkilZXRxnBVgCDwRX86H/BQb4j+Cvil+1D4k8UeANUi1rSFgs7VbuD5oZJLaFY5DG/R0DAgOuVbqpIwSAct4s/bg/ar8b+G9Q8JeJfiHeXOlarE0FzEkNtAZIm+8heGFHAYcMAwyCQcgkVy/wALv2rf2hfgv4efwn8M/Gl3oujvM0/2URwTxrI4G4oJ45Nm7GSFwCeSM8189UUAe/8AjL4vfHf9qTxZ4Z8MePfE0/iTUZ7qLT9MiuDFbwJNeyrGPliWOMFmKhnIzgDJwBX6PRf8Ea/HzRI0/wASdMSQqNyrYzMobHIBMgyM98DPoK/Kb4Q+IdK8I/FnwV4r12RodN0XW9Nvbp1UuywW1zHJIwUcsQqkgDk1/WdD+1t+y/NEkyfFfwyFkUMA2q2yNgjPKs4IPqCMjvQB/L7NrPxu/Yw+MviXwv4V8RvoXiTR3fT7uexZZYLiI7ZFJSVWRlYFXUOm5T2DA1a+IH7ZH7TXxR8LXfgnx148vNS0S/2/aLYRW8CyhDuCu0EUbMuQCVJwcDINQftgeOfC/wASf2lvH3jbwXejUdF1K/BtrkKVWVYokiLqGAO0sh2kjkYPevmygD6Y+Hv7Yv7S/wAK/C1r4J8B+O7zTNEsSxgtjFbzrEHO5lQzxSMq5JO0HaCTgcmqzeIfjj+2Z8XvDPhbxX4jfX/EequmnWUt6yQwQRkl2O2JVRVAyzbU3NjucCvnCvov9knxv4Z+G/7SHgHxt4yu/sGi6XqKvdXBVnESOjx72CgnaCwJwDgZNAH6Jyf8Ea/HojYxfEnTGcA7Q1jMoJ7AkSHA98H6V5r+w7+z7+1PP4x+JGj/AAr+IUXw7fwrdnSNXfYt9HcXsErrsWFgyEJsciXggHC5DNj9v5f2tf2X4o3lb4r+GCqAsdurWrHA54Ackn2Aya/Nv9g/9pn4F6F8RPjxd+JvGFj4fg8V+J7jWdMl1OQWUdxZyzzFWV5tqh8OpMZIbBzjAOADz/8Abg+A/wC2L4f+BN94o+J3xhj8deFtIuraW90+O1TTyBJIIYpT5ar5wWV1GxjxncB8vHs3wJ/Zy/bwHwe8IyaP8eovDmnT6fDNaac9hFfta20w8yGM3EiFmwjLxkhPuKdqiut/4KC/tNfAHxT+yx4r8GeEvHmkeINb12SwhtbXTbuO8kLQ3kNw7OIWbYgjib5mwM4XqRX0D8D/ANrb9mh/g54Jju/iXoOnXNto9jbzW17fw2txFLbwrFIjxSsrqQynGRgjBGQQSAfhf+1vpv7Sf7O37Slj4n8dePpdb8ZC0t9Q03XLYiIm3G6EKIMBIlDo6NFt2OMkghzXF6p+3x+17rGm3Wk33xJvTbXsTwy+XBaQvskUq22SOFXQ4PDKwI6gg17J/wAFQPi18O/i38etHvvhvrlv4gstG0OCxuLq0bzbcz/aJ5yscq/LIAkq5KkgHIzkED83KAP1u/4J9/Bn9qzxt4A8Q+LPg38U08AeHptRFs8UkC332m7hjVpHEMissWFkQFxy/Q8KKs/8FAfgt+1f4O+GuieKvjD8VE+IHhy21DyPIjt1sPs9zMhMUhijVVlyEcBjynbhmr3b/gl5+0N8Evh98CtZ8E+PvGemeGtYh1ye98rUrlLQSQXEECI0bylVf5omDBSSvGQARm7/AMFO/wBon4IePfgDYeCvAnjTTPEusXes21ysOmXKXmyG3jkDtI0RZY+XUKGILc4BwcAH5gaN+3n+1zoGk2eh6Z8SL1bOwhSCESQWsziOMBVDSSws7EAdWYk9zXzf438c+LfiR4ov/GvjrVJtZ1vU38y4upyC7nGAAAAqqoACqoCqAAABxXKUUAFfpB+zR/wTe8eftG/C+1+KsHiuw8O6dqM88VpFLC9zLKlu5ieRtjKEHmKygHJOM8AjP5v1/Rl/wTs/aV+AnhH9lzw/4K8Y+OtJ8Pa3olzqCXNtqV3HZv8Av7uW4jaPzivmIUkX5lyAcg8igD8xv2j/APgn78SP2fdT8G2S63Y+JYvG2oR6TayRA2pjvpWAjjkWQn5GBzvBwMEMBxn6it/+CNnxAaCNrn4kaZHMVBdUsZnVWxyAxdSQD0OBn0Feuft+ftNfAnxBrfwXTwt4wsfEP/CO+K7PWtQbS5VvUt7K2dd7M8JZd/XbGDuIGcYxn9GoP2uP2XrmCO4j+K3hkLKoYB9VtkYBhkblZwyn1BAI6EZoA/k0+Lnwy8QfBr4k6/8ADDxS8Mmp+Hrk28rwNvikBUOjoTg4ZGVsEAjOCAQRXnNfS37Ynjrwv8Sv2mPH3jbwVejUdF1K+X7NcqpVZVhhjiZ1DYO0sh2nuMHvXzTQB9L/AA8/bE/aW+FPha28E+AvHd5pmiWRcwWxit51i3ncwQzxSMq5ydoO0EkgcmuM8d/tB/Gn4meMdK+IHjbxde6j4g0LZ9guwywNamN/MUwrCqKjbuSVUEnGScCvG6KAPsuT/goP+2NLG0bfEq7AcEHba2SnB9CLcEH3HNX/ANlX9jbx7+2FdeJtdtPEdvpFtpEifary9D3M1xd3JL42hgxyAzM7N1wOckj4lr9n/wDglL8dPhF8MNF8feHPiP4qsPDN5qNxZ3dsdRmW1hljiR432yyEIWBYfJncRyAQDgA8J/aP/wCCanj/APZ7+FmofFZ/Flh4h0/SJIBeQxQvbSxxTyLCsi72YPiR0BXg4Oexr5/8H/tuftUeAvDOn+D/AAr8Qby00jSoxDbQvDbTmKIHIQPNE7lVzhQWIUYAwABX7O/8FAf2m/gB4n/ZZ8W+DfCfjzSPEGta81jBa2um3cd5IWiu4bh2cQltiBIm+ZsDOB1IFfzc0Aey6x+0L8atf+Jtn8ZNW8X30/jLTzH9n1HcqPCsQwqIiARrHgncgXa2W3A7mz63qf7fP7X2r6ddaVe/Em9+z3kTwyeXBaQvskUq22SOFXQ4PDKwYdQQa+P6KAP1p/4J8/Bn9qvxv4G8SeLfg38UV+H+gS6gtrIksC332q7hjDyOIZAyxlUkQFxgvnByFFan7fvwS/ay8J/DXRPE3xe+KqfEDw7BqIg+zx26WH2e5nQ+VIY41VZchWGTynbhmx7X/wAEuf2hvgn8Pfgdrvgfx/4y03w1q8Wuz3wi1K4S0WSC4t4I0aN5SquQ0LBgpJXjIwRnb/4KY/tGfA7xx8BNP8G+BvGumeJNXutatbkQ6ZcpebIbZX8x5GiLKg+dQu4gsc7c4OAD0TwX+zN/wUD0zwho2nyftDQ6W1taQRm0bTor1rfagHlG5kQtKU+7vJOcZya/If48al+0Z+zN+1Lresa544mu/H8G2b+27dgftNtdRjZmJ1KKhTC+SVKJgBRgKa/oz0P9sP8AZb1jRrLVbf4o+HreO7hSVY7rUYLadA6g7ZIZWV0cdCrAEHiv52v+ChnxI8E/FP8Aaf17xN8P9Vi1rSY7aztBd253QyS28QWTy36OobgOuVPUEjkgHI+KP25P2rvGfh7UPCviL4iXtxpmqRNBcxJDbQGSJ+GTzIYUcBhwcMMjIPBIr5QoooAlt7ie0njurWRoZoWDo6EqyspyGUjkEHkEV9h2/wDwUD/bEtoI7aP4lXhSJQgL21nIxCjA3O8BZj6kkk9Sc18b0UAfoh+xB4S/aX+OXxn8U+L/AIY/EOTwvrq2zXGs6xdH7U9x9qc7UeBwwlLupI3DCbcgg7Qft79qP9nr9t+z+A/i7VPF/wAcIvFug6baNeahpiWUentcWtufMl/exqC21RuMZID4xycA/NP/AASr+Mvww+E/j3xtafErxFaeG11ywtRaT30ggt3a2kdnRpnwiNhwVDEbuQOeD+nP7WH7Vf7OV9+zh8RNF0b4i6JrGpaxot5YWlpp97DeXEtxdRNFGBHCzNt3MCzEYUZJNAH5Y/Ar/gl38Q/jR8LtE+J8/jDT9Ag8QRm4tbV4JLmT7OThHdkZVUtgnaM4GMnOQPLfjX+wF8S/hB8WfAXwqi1mw1yb4iytb6bdput41midFmWZG3MoQSI24Z3A4AyCK/Yj9jT9qb9nbSv2Z/AXh7X/AIhaNomq6Lp6WV3aajeRWc8c0JIb5JmUspyCrrlSO+QQPnL9rn9pz4E6r+1N+z54g0LxfZ6xpXgu/urrVrywf7XbW0V29usZMkW5WI8pi6rkqMEjkUAeYv8A8Ea/HgRjH8SdNZwDgGwmAJ7ZPmHH5GvyG8Z+E9Y8B+L9b8EeIFRNU8P3txp90I3DoJ7WRopArDhhuU4PcV/XdJ+1p+y/GjSN8V/DBCgk41a1Y8egD5J9hX8oXx28UaL42+Nnj7xl4cmNxpWu69qd9aSMhQvBc3MkkbFWwVJVgcHkd6APKaKKKAPoT9lfwX8S/H/x58KeG/hFrX/COeKJJ3mt9RLlBapBG0s0hAB3gRq37vBD/dPBNfuh4k/Zq/4KC33h7U7OD9ouG8kntZo1gXTIrQylkICC4jTfEW6eYvK9RyK/HD9gj4ieDvhb+1N4P8X+PdSj0jRohe28t1NnyonurWWGMyMPupvcBmPCjliACa/pF1H9r/8AZc0ywudRn+KnhyWO1jeVkg1K3nlYICxCRRszuxxwqgkngAmgD+fb9l//AIJ/fEH9pvQNe8WReIrPw7Y6PqL6YWnRrmSa7iVXmG1GXaqB0+Yk7ieOhqb9qX/gnv46/Zi8C2XxCvPE1l4j0ya8SynEMT20sMkoJiYK7NvVtrA4IK8cEEkfev8AwTY/aR+Bvg34Y+M/DHjbxlp3hvUZvE95qcSanOlmJbW7ihWNo3lKqxzE25QSV4yORVn/AIKY/tGfA3xz8ALPwZ4G8a6X4k1i81i1uFg0y5jvCkVsrmR5GiLLGPmAG4gsemcHAB6B4H/Zm/4KBaZ4O0TT3/aFh0o29nAn2RtOivmt9qACI3MiFpSn3d5JzjqetfkX8e9Q/aM/Zn/am1nWte8cTXnj+ALMNbt2B+021zHhMxOpRU2fKYSpRcAAYCmv6LvD/wC2H+y3rGh2GqwfFHw/bR3cEcixXWowW06BlB2yQysro46FWAINfzwf8FD/AIkeCfin+09rniX4f6rFrekxWlnaC7tzugklgj2yeW/R1B4DL8p7EjkgHH+J/wBuX9q/xj4f1Dwt4h+Il7PpmqQtBcxxw2sDSRPwyeZDCjgMODhhkZB4JFch8LP2qP2gvgroMvhf4Y+NLvRNJmmM5tlSGeISsAGZFnjk2bsDO3Gepya+fqKAPavin+0X8bfjXcaXdfE/xbd62+ilnsg3lwJA7EEuiQLGofgfPjdwBnAr123/AOCgf7YlrbxW0XxKvCkKqil7azkchRgbneAsx9SxJPUnNfHFFAG14j8R694v16/8UeKL+bVNW1SZ57m5ncvLLK5yzMx/yOg4rFoooA+lfh1+2D+0p8J/C1v4K8AeOrvS9EtGdobYx286xbzlghnikZVJ52ghQSSBkmvPfit8bPip8cNYtde+KviO48Q3tlD5EDTBESKPO4hI4lRFyeWIXJ4yTgV5ZRQAV658Jvjx8XfgZfX2o/CjxNc+HpdTjWK5EQjkjlVDld0cyuhZT0bbuAJAOCc+R0UAfRnxM/a2/aM+MXhpvB3xH8b3er6K8qTPa+XBBHI8f3d/kRxlwDyFYkZAOMgEfsB+z7+zn+3Y3wX8IXGhfHiLw1pd3p8NzZaa9jHqDW1rOPMhQzyoWP7tlO3JCfcHCiv586/q3/Z//az/AGah8D/AdrffEnQtNu7HRLC0uLa+vobS4intYEhkV4pmVxh0ODjDDDAkEGgD8Qv2w9G/aT/Z+/aK0nxR8QPiBL4g8WLaW99pWt2x8llhjLR7BAAEiCurhowCjgktnewrh9R/b7/a/wBUsLnTLv4k3vkXcTwyeXb2kT7JFKttkjgV0ODwysGHUEGvbv8AgqN8W/hx8WfjZoFx8N9etvEVro2ipaXFzZuJbcTPPLNtSVco+EdclSQD8p5BA/M+gD9Y/wDgnx8G/wBqjx14N8T+Lvgz8UF8AaE+oLazLLCt99qvIo1kdvJkDLGVSVMvwXzjnbxu/t+/BT9rLwj8LNK8UfF/4rR/EDw1a6isT2sdslh5FxMhEUpjjVVm6MuTymeBhmI9f/4JaftB/BX4dfBbxH4J+IHjHTfDOrrrst+sepXCWiSW89tbxI0ckpVXIaFwyg5XgkYIrpv+Cmf7RXwO8dfs8weC/A3jbS/Ems32rWs6QaZdR3hWK3DmR5DEWEY+YAbiCx6ZwcAH8/VfQX7M/wCzx4n/AGnPidF8NfDF9b6W62s19c3dzlkht4Sqlgi/M7F3RQo9ckgAmvn2v0G/4Jo/FLwD8J/2j5NZ+I2swaDpupaLeWEV3dN5dutw8sEqiSQ/LGpWJgGYgZwM8igD3bxl/wAEhPiV4b8Kat4g0nx1purXem20lwlobaW38/yl3FBKzsqkgHBIxnGSByPgP4WftT/tA/BTQpvDHww8Z3eiaTPMbhrZUhniErABmRZ45NhbA3bcZxk5Nf0x/Eb9r79mHT/APiK6HxO0C9ZbC5CwWeoQ3VxKzRlVSOGJmd2JIAAHucDJr+RygD2v4qftGfG342TaZP8AE/xdd622isz2YYRwJA7EEuqQJGu/gfPjdgAZxXrlt/wUC/bDtLaK1i+JV4UhRUUvbWcjkKMDc7wFmPqWJJ6kk18cUUAbvifxP4h8aeINQ8V+K9Qm1XV9Umae6up2LySyP1LE/kAOAMAAAAVhUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf//S/GOiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAoorqvBfgbxh8RvENv4U8CaPda7rF0HaO1tI2llZUUsx2r2UAkk8CgDlaK+gfE37Kf7SHg3Qb3xR4n+HOtadpWmxmW5uZbVvLijBwXYjOFGeT0A5PFfP1AHf/AAn8N6b4y+Kfg3wfrO/+z9c1nTrC48ptsnk3VykUm1iDhtrHBwcGv6oov2EP2RYo0iX4ZaYQgABYzMTj1JkyT7mv5P8Awj4m1HwV4s0XxlpAja/0G9tr+3Eq7ozNayrKgdQQSu5RkZGRX7SQ/wDBZy5EKC4+EqPKFG8rrZVS2OSAbMkDPQZP1oA/MP8Aaz+Hvhj4U/tGeOvh/wCDIXttF0i+C2sUjmQxxyRJLsDHkqpchc5OAMknk/O1fQniab4r/tefGrxL4w8L+F5tW8Qa9K99NY6XC8qwQoFjX1IVVCqWYjc3ucVneNP2Zf2gPh14fn8V+OPAOr6No9qVWa7uLZlijLnau9hkKCSBk8ZIHUigD95P2R/2Kv2ZfEf7OfgTxV4q8EWuuaxrunRX93dXjyPI0s43EDayqqL0VQOAOcnJPz3+05+x98AtD/at+BHgvw54e/sbQfHM17DqtlaTOkUy2PlyIV3FmQvvKyFSMqBja2WPi3wF/wCCqWtfB34T+H/hjq/w9h18+HLcWkF3FqJst9vH/qw8Zt5vnUcFgwB64Bznyb4z/wDBQ3xh8U/jb8PfjDpfhWz0Vfhy8klnYyztd+e9yV+0ebMEh4ZUVVCoNvJySeAD90ZP2Ef2RZEaM/DLTAGBGQZgefQiTIPvX8svxj8L6X4H+LnjfwXoe8aboGualp9t5rb5PItbmSKPc2BltqjJwMmv1+l/4LO3BicQfCVVkIO0trZZQ3YkCyBIz2yPrX5S6f4N+MP7S/j3xR4o8GeFrvxDq+pXdxquoR6Zbu8UL3szSN67VLsQoLZwO+DQB4nRXs3j/wDZ3+OPws0VPEfxE8EapoGlySrALm6t2SLzWBKqW6AkA4z1xXjNAH2B+wl8LPBfxj/aZ8L+CPiBZHUdElS7uZbbeUWZrW3eZEcrglCyjcARkcdK/oX1L9gf9kXUtOutPPw4sLb7TE8XmwNNHNHvBG6NvMO1lzkHsa/my/ZR+JXjf4T/AB58L+MPh54ePivW0le2i0tFcvdpdI0UkaFASrlGO19rBTyQQCK/cLxN+2x+1tpvhzVNQg/Zd1fT5LW2mlW5nvJLiKAohPmPElojOqYyVDKSBjI60AeI/wDBOb9k34B/Ev4TeJfF/wARfC0XiPUo/EN3psTXjuVit7SOJkCKjKAzGVix5JwOgFP/AOCjv7J3wC+GHwT0rxx8OfCsPhzVYtatbJntHdVlgukk3rIrswJBQFTwRz2JFeI/sEftO/H3wB4I8TeFPAHweu/iXpT6o2oST2MklqbW5ukCyI7+TMjhhGpVQFK85JBGJf2+f2nPj58QvhzoXg34gfBy8+GmkTakt2Lm+lkujcz2yHy4438mFEwHYsDuLcYwAcgH6uaR+wL+yNpelWem/wDCurG8NrCkRnuXlknlKKBvkbeMu3ViABnoAOK/Pnwl+yD8A7r/AIKK+LPhbdeHvO8IaV4dXXINLaZzbrdTG2Qqed5iXzmZU3cHHO0ba938Ifttftbar4V0jU5v2YdW1V7q1hlN5bXkltDcb0B82OJ7WRkR87lUu2Aep618H+F/2qv2gIP27Nd+I1r8K5rzxZqdnJotx4UQTLdR2UKxuo83YSJF8lHaUx7GGcKAwIAP1U+KH7B/7KEvw48TfYPAFnpd1Hp1zLDdWjyxzwyRRl0dGLsMhlHBBBHBBBxX8q1f0QfGD9tP9qu2+F/id7j9m3U/DcL2E0cupXd1JdQWkcq7HleJbWIsFVifvgDq3AIr8Qvh/wDs9/G74q6RL4g+HPgnVPEGmwymBrm0t2eISqASm7oSARkDpkZoA5j4WeHNO8YfE7wh4R1jf9g1vWNPsbjym2yeTc3CRPtYg4baxwcHB7V/VJB+wf8AsiQQxwL8MtNYRqFBczMxwMZLGTJPqTya/mK1b4ffGX9nbxr4Y8QeMfCd74f1W2u4NQ01NQtnWOeWzlV1AHG8BwoZQc4I6ZFfvlYftoftaT2NtPL+yrrUjyRozMt/JGrEgEkI1mWUHsCSR0JoA/C79rf4eeGPhR+0d46+H/guB7XRNJvVFrC7mQxJLDHNsDHkqpchc5OAMknJPznXr3x88e+K/if8ZPFvjnxxpY0TXdTvnN1YBHjNq8QEQhKyfNuRUCtuwSQTgdK8hoAK91/Zk8C+Hvib+0B4D8BeLInn0fWtUgguo43MbSREksm4cgNjBIwcdCDzXhVem/Bjxr4k+HPxX8KeN/B+njVta0fUIJrSzKPJ9pl3YEW1PnJfO0becnjmgD+pV/2Ef2RZEZD8MdMAYEcGYHn0IkyK/O39iP8AZD+Ani74lfHPTPGnh0eIbTwV4jm0TTIr2V3SK1jmmAZghTdIRGoLHtnAGTn6SuP2zv2s0gkdP2U9bVlUkE6g7AEDqVFkCfoOTX5Z/s6/8FBPGHwA8afEXxBr/hC38QN4/wBSk1S9t1nfT3tr9pXd9jFJv3f7xhsZcg4+bgggH6Gft4/sd/s5eBP2YvFXj3wL4Nt/D+uaA9lNb3Fm8ilvOuord0kDMwZCkpOMAhgCDwQf53a/Un9pv/gpprX7Qnwj1P4Taf4Eh8N22tSQfa7mS/N65ht5VnCRqIIAjGREyxLfKCMc5H5bUAfXn7Cvwt8GfGP9pvwr4G8f2Z1HRJ1vLia2DmNZja20kyI5XBKFkG4AjI4zX9Dmo/sD/si6jp9zp5+G9hbfaYnj82Bpo5Y94I3Iwk+VhnIPY1/Mn+zv8bdX/Z4+Lmh/FjRdPh1WbSDKr2s7FFmhuI2ilUOuSjFGO1sEA4JVhwf1Q1L/AILM6pLp11FpHwqitr54nEEs2sNNFHKQdjPGtpGXUHBKh1JHG4daAOg/4J0fsl/AT4lfC7xX4u+IvheLxJqEHiO70uE3juyRW1nFEybFQoAzGU7yc5wMYxS/8FJf2UfgJ8LPgPZ+Pfhv4Ug8Oava6tb2u+0eQJLDco+9ZEdmDYKAqeCOexIr4+/ZO/4KHa/+zN4V1zwfe+D4PFFjq+pSarGy3bWMsNxOqpMCfKnDoRGm0YUqQeTniT9rj/godrH7UXw8s/hxb+C4fC+nx3qXtxI16b2WV4VKxKh8mEIBuYtkMTxjGDkA/N+vv7/gm78Gfh38bv2grrw98TNMGs6Vpei3Wopau7JFJOk0EK+btILKBMxxkfMBnIBB+Aa+lf2U/wBpHWP2Wvin/wALH0rR4ddiuLKbT7q0lkMJkgmZJP3coV9jh4kOSjDGRjnIAP6F/iZ+wd+yhN8PPEgsfh/Z6Zcpp9zJFdWjyxzwyRxl0dGLsAQQOoIPQgg4r5e/4J9fsifs8fEX9mjRPH/j/wAH2/iHXNaur8zT3byNsW3uZIESNVZQqhYwT1JYkk4wB4n45/4LB614l8Haz4e0H4ZQaXf6nay20V1Pqpuo4TMpQuYRbRF8AnA3gZxnI4Pjf7LP/BSjWf2cPhRa/Ci98DQ+JrPTbi4ltLhL82Uix3MjTOkg8iYORIzEMNvBAwcZoA9j/wCCoH7MvwT+Dfgbwd4w+F/huLw5e3uoyWFwls7+TNEYWlBZHLfOrLwwI4JBzxj8Ya++P2xv269Z/ay0bQPDX/CKQ+F9L0S4e7K/ajezTXDIYwfM8uEKioT8u0kk5zwBXwPQB+oX/BMD4BfCr44eO/GUvxS0Vdeg8P2Ns1rbTOyweZcyOrO6oVLMoTC5OBknBOCP0m/al/Ym/Zh0H9nj4geJfDXgW00XVtD0e71C0u7R5UljmtIzKn3mYFWK7WUjlScYOCPxW/Y+/a41n9kvxZrWu2Xh+HxJYa/apb3Vq85tZA0LFonjmCSBcFjuBQ7gexGa+tfjd/wVb1n4sfCrxJ8NdI+HcOhP4ls5LCW8l1I3gjt5xsl2xC3h+coSFJbCk5wcYoA+3P2QP2K/2Z/Ev7OHgfxZ4s8E22u6zr1gl9dXV48jyNJMSSq7WVVRQAFUDp1ySSfgn/gqP+z58JPghrvgDUPhXoSeH18QQail3bwO5gY2bQeW6q5YqxEzBiDggLwCCTc+AP8AwVP1r4M/CbQPhfq3w+h8Qf8ACOw/ZYLuLUTZF7dTmMPGbebLrnBYMAePlBzn5n/bH/bF1j9rjW/Dt5deHIfDOneGYbhLe3S4N3K8l0UMrvKUiBGIkCqEGME5OeAD4xr9gf8Agl1+zf8ABv406Z478R/FLw9H4in0iaztbWK4d/JjSZXkdgiFcuSgGSTgZA6mvx+r9K/+Cefx/wDjJ8JLzxd4d+GHwxufiZa6olvdXUFm7wTWskJKI5mEcq7GDsNhXJPIOAQQD77/AG7f2Ov2cvA37Mfizx54G8G2/h/XPD5s57e4s3kUnzbqK3dJAzMGQpKTjGdwBB459p+Bf7DP7K918GfBGo6x4CtNW1DUdHsby5urt5ZJpZrqFZpCxDqMbnIUAAAYA6V8Rftr/tW/tG+MPgRqXgrxl8C774eaFrtxbQXep308l0mI5BOkSYghVHZ4l+ZiRgEAZII9Z+Av7ZP7UsXwc8I2Wnfs5an4qsrHT4bS31SzupLWC7gth5McixNbSkZVACQ5DHLDAIAAPg3/AIKYfBD4a/A/41aJpfww0kaJp+taNFezWsbs0KzCeWEmMOSVDLGpIzjOT3r85q+7v2y/H/xr/aQ/aC0zSPFHw5u/CviSCzt9N07QQks946SM0ysWKJ5pd5GIKoqheOqknyPUf2PP2otKsLnVNQ+GOuxWtnE80r/ZHO2OMFmbAyTgDPAoA/TT/gmX+yz8Cfi58GNe8efEzwvD4j1U63Lp8ZuncxwwW9vBIPLRGUBmaZtxOcgKBjBzvf8ABR/9k/4BfC/4EWfjv4c+FIPDmr2ur21r5lo8gWWG5V96yI7MGwUBU8EHPOCQfn7/AIJ9ftJfHb4YeBvEfgf4cfCK7+JmjrqAvnlspXtntLi4jWNlkk8qZWDrCpVcKVwxyQRjZ/b5/ab+PnxD+GGkeCviD8Grz4a6Nd6itybu+mkujcTWykxxRv5MKR43MzA7iw6YAOQD9U9B/YG/ZH0zRLDT2+HVletbwRxme5eWSeUqoBeRt4BZjySABnoAOK/AL9v34T+B/gz+0prfg/4d2H9l6K9rZ3iWodnSF7iPc6x7ssEzyFJOM4HGAPuLQv8AgsrrNnotjaa78Lob7UYYUS4ng1Y28UsijDOkRtZCgY8hd7Y6ZNfnb8ZPiH8Q/wBtT4+Xfijw74Vkk1rWUSCz0nTg91Ilvax8AtgF2Cgs77VHsBxQB8u0V9CeI/2T/wBpPwlod74l8R/DjWrDS9NjM1zcSWr7Iol+87YzhR1J6Acniub+H37P3xs+K+lT658OPBWqeIdOtpfIkuLS3Z4hKAGKb+hYAgkDpkZ6igDx+ivTfiH8Gfit8JrixtfiT4U1Dw5JqYY2ovIGjE2wgMEJ4YgkZA5GR6ivS7f9jX9qi7t4rqD4Xa6Y5lV1JtHUlWGRwcEcdiM0AfM9FejeGvhB8UfGPjG7+H3hfwrqOpeJNP8AN+06fFbubiDyDtk81MZTa3B3Y5IHUiux8Y/sw/tCfD7w9c+LPGnw/wBY0jR7Lb591PbMsUQdgql2GdoLEDJ4yaAPCK9v/Zr8DeH/AIl/HvwJ4C8VRvNo+uatbW10kbmNniZvmUMORkDBI5x0IPNHgb9mz49/EvQI/FXgPwHq2t6RK7xx3VtbM0TtGcMFbgNg8EjjOR1BrW0DQfjP+zH8Z/CGua34PvNP8Uafd29/p+n39tIDeESbVVVXDOHYFfkOc+9AH9LzfsJfsispU/DHS8EY484H8xJmv5cPjn4Q0f4f/Gnx34F8PCRdL8P65qNhaiVt8ggtrh44wzYG47VGTjmv6D5v2zf2s1hdk/ZS1sMFJBOouwBx6CyyfoK/BI+EPjP+0r8TfF3iLwz4SvNa8Qahe3Wqanb6fbOVtpLqYs4KnJQb2IVWOeO+DQB4TRXtPj39nP46/C/Qx4m+IPgbVdB0nzVhN1dWzJEJHztUtyATg4z16V4tQB9afsOfC/wd8Yv2nPB/gPx7aNf6HdG7nntw5QTfZLWW4RHK87GeMBgCCVyMiv6Jb/8AYJ/ZFv7G4sT8NtPtxcRvH5kLTJKm8EbkYSfKwzkHsa/ml/Zc+I/jX4UfHfwn41+HuhHxNrtvcNBBpiq7PdrdxtBJEmwFldkdtrYIU4JBAIP7o+IP21/2tdP0HUr+L9lvWLJ7a2mkWea9knjiKISHeJLRGdVxkqrKSBgEHmgDwn/gnZ+yX8BPiR8PfGvif4ieGI/El9Y+JbvSLc3juUitrOKF02qhQb2Mp3sc5wuMYObf/BR/9k/4BfC/4CW/jz4c+E4PDmsWerW1v5lo8gWWK5DB1kV2YNjaCp4IPfBIPg37Bf7T/wAffAfhrxf4c8A/CK6+JmnXeqNqs8lhI9q1pd3aBHV38qZWV1iUquAVwTkg8aX7fP7Tfx8+Inws0vwR8QfgzefDXRrzUVna7vpnujcS26kxxRt5MKRn5ixB3FgOMANkA/U7w7+wP+yRpugadYP8O7K+aC3iRp7l5ZJ5SFGXkbeAWY8nAAz0AHFfA2lfsffAJ/8Agorqnwvl8PeZ4Qt/DH9vJpTTObYXbyRw7eu/yhvLhN3DY52jbXPeH/8AgsnrNjodhZa98Lob/UYIUS4uINWNvFLIoAZ0iNrIUDHnbvbHTJrwXwD+2x8XfG/7Zx+N3gr4fJr+q6xpz6NH4es3keVtPQCXCzhCfNVow7SGPbgEbQOgB+vfxD/YM/ZOufAniCK0+H1nptwLC4aK5tHljnhkSMsrxsXYAggHkEHoQRkV/KZX9FHxV/bV/aus/hv4knk/Zq1Tw9GLGdX1G7upLqC0RlKtNJElrGWVFJJ+dQOpOAa/Df4e/s//ABr+K+lz638N/BeqeIdPtpfIkuLS3Z4llwGKb+hYAgkA8ZGeooA8for034h/Bj4r/CWext/iV4U1Dw4+phja/bIGjE2wgMEJ4YjIyAcjI9RXpVt+xr+1ReW0V3b/AAu11op0V0JtHUlWGQcHBHHYjNAHzRRWnrWi6v4c1e80DX7OXTtS0+V4Li2nQxyxSxnDI6tggg8EGsygAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD//T/GOiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiv0x/Y0/4J7wftR/DvUviPrXjFvD1nb6g+n28Fvai5kd4Y0kkeQu8YUfvFCgZJ5zjjNj9sL/gnfH+zN4A0v4gaD4ybxBbXWoxadPDc2otnR7hWaJ0KPIGHyMGBxjjGeaAPzGr9Wv+CQLqv7SHiNWYAt4WugAT1P22zOB68V9CaT/wRp0dtLtG1z4mzx6iYkNytvpyPCsxA3iNnmVmQNkAlQSOSB0r8vvjv8MvF/7Hvx+1Hwd4Y8UzjUtEEc9lqtg8lnciG7i3Lko25H2MVcKxB55waAP6tvjAyp8JfGzOQqjRNSJJ4AH2aSv4rK9j8Q/tD/Hvxbot14c8U/EXxDq+lXyhLi0utUuZoJVBB2vG8hVhkA4Ir75/ZR/4JqWv7Q/wc074ta944fQk1ie5S1tbazFwRFbStAzSs8keGMiNgKCNuDnJIAB+UdFfoT+2t+wuP2TtI8OeJdL8Vf8ACR6Zrk8lo6zW32aeKdF8wEBWdWQqDk5BBHQg8fntQB+1n/BGdlHin4ooWG42WlkDPJAkuMnHtkV+rX7YjKn7LHxULsFH/CO6gMk45MJAH4ngV/Pt/wAE/f2evGvx0+IGv3ng7x/e/Ds+G7JDPfaY0i3sn2xmVIk8t4vkPlkuS/ZQFOcj7o/ao/Yg+L+ifAnxT4o1T4++IfGdn4etjqU2l6xJO1rPHa/O3/LxKPMUZKZQjcACRncAD8GqK/Yj9n3/AIJXWXxd+EHhv4m+I/H8mk3HiS2W9jtbWxWdIoJOYw0jyIS5HLYXAJwCcZPyl+2t+x8f2SfEPhuxtPEf/CR6b4mt7iSGR4Ps88ctqyCVXQM6lSJEKsGyfmBAwCQD4kr9+v8AgjWy/wDCCfElMjcNSsCRnnBhkr8Ba/TP/gnj+zR4/wDjU/i7xX4P+JupfDaDSRBZSyaQ0q3V082ZAr7JYh5ahc8kktjgY5AP2B/4KROq/sZfEEMwBYaYBk9T/aVscCv5S6/a/wDbc/Y3+KngT4E6h8Q/EHxu134gad4cubaabTtaeZo8XEq2yyQ7p5V8xWlXqo+Ut82eD+KFAH6Bf8Ew2Vf2xfCm4gZtNUAz3P2KWv6lSQoLMcAdTX8en7J/wn8Q/Gn49eF/AvhfxA/hW/llkul1OEuJ7VbONp2eHYVPm4T5PmUZxkgV+4niX9gD43ax4e1PSR+034tvzeW00It72S4NrMXQr5cwF0x8ts4fCngng9KANn/glc6N8APE4VgSPGGqHg9jDbYp3/BVh0X9mWwDMAT4l03GT1wk9fzu+FfiZ8U/hLd6lp/gDxbqnhpp5Nl1/Zl7NarM0JKqW8pl3YycZHGaZ4x+KvxT+KRsbP4heLtV8TLaO32ZdTvZrtYWlwGKCVm25wMkdcUAf2nxMrxo6EMrAEEHIIPcGvzO8GSx/wDD1Px6u9cnwLAuMjOfMsTj645+lYnhL/gn98b9E8L6TpDftMeK9MNnawxG1sJLgWkBRADHBm6Q+WnRPlXgDgdK/Gn9pXwZ8R/2Yv2lNa06Pxxfan4ktHS+i1+KeaC/lW8j3B5JN5cSlWKvhyD64OKAP6sfiQyp8O/FLuQqrpV8SScAAQPyTXx5/wAEy2Vv2NPBQVgSs+qggHof7QuDg+nBzX84XiH9oj49+LNGuvDnij4jeIdW0q+XZcWt1qlzNBMmQdrxvIVYZA4Ir9P/ANhr9jz4pfEH4HW/xF8OfGvXPh7p2v3ly0Wn6K8yo32aQ2zSzbZ4l8xmjIGAflC5bJwAD7H/AOCicsUesfs++Y6pjx/prckD5VZcnnsM8ntX6XV/OX+23+x18T/BviD4cS658Vb/AOIZ8WanHoFrLrrzGWyuLlxsKkyT/uTnL4wwI6Nnj770/wDYJ+NtnYW1p/w1H4zi8iJE2RSTiNdqgYQG84UdvagD8Yv2/WV/2wfiWUYMPt0AyDnkWsII/A8Gvj2vX/j78Nta+EPxk8WfDnxDqg1vUNGvWWW+G4m5MqiZZW35beyuC4JOGz8zdT5BQAV9SfsTMq/tY/C4sQB/bUA545IIFfcX7Pf/AASws/i/8IPDnxO8R+PpNJn8SW4vIrW1shOkUEn+rDSPIhLkcthcAnAJxk/Lv7Z37Ilz+x74n8K/2R4obXLTxBFPPbXHlG1uYJ7J49+QrMMfvEKMrZznIGASAf1aV/Gt+0y6yftG/FJ0YMreKdaIIOQQb2XkGrUv7U37S00bwy/FTxQ6SAqynWLsgg8EH95Xg7MzsXcksxySeSSaAEooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACv3x/wCCNLL/AMId8TUyN32/TTjvjypq/A6uz8FfEbx/8Nr+fVPh74k1Hw1eXUfkyzaddS2skkeQ2xmiZSVyAcHvQB/UZ/wUXdF/Y0+IwZgC0WngZOMn+0bY4FfQXwGZX+B3w8ZCGB8O6TyOR/x6RV/IZ4z+NXxg+I2mR6L4/wDG2teI9PhlEyW+oahPdRLKAVDhJXZQwBIBxnBNaXhv9oP47+DdFtvDfhL4h+ING0myBWC0tNTuYIIgzFiEjRwqgkk8DqaAP6CPilJGP+CoPwbBYAjwnqQxnuUv8fnX6XkgDJ4Ar+Q/9n3wt8SP2oP2lPDmi3vja+s/EupSm4bXrmea4vYEsIWm3xyF95kVI8R/OADjkCv2r8Q/sBfG7VtA1LSx+054uvTeW00IgvJLg20vmIV2TAXbExtnD4B4J4PSgDW/4JaSRv8ABLxsqOGI8a6qcA54MFrg/Q9qX/grAyj9lMgkAtrun4Hr8svSvgj9gr9kT4m/Ejwp4s8Y+G/i5qvw4trXVW0d4tDeYSXU1miu7zbZYRsUTKI/vHls7eM2/wBvz9kv4mfC74W6V8Q/FHxh1n4jWFjqC2ptNaeZjA90p2yQbpplyfLw+dpxjB4xQB+QVfqR/wAEi2Vf2n9WDMAW8MXwAJ6n7VaHA9eBmvy3r68/Yi+Cvin45/HW18N+EfFtx4IvNKsrjU31SzLi7hiiKQkQeWyHezTKDl1G3ceeFIB/Vf4/ZU8CeI3dgqrpt4SScAAQtyTXxZ/wTEdG/Y58JBWBK3WqggHOD9umOD6cHNeH/Fj9gf413vw18SQv+0f4n19VsZpDp+qSXBsroRL5himxcyfK23GdjY64PSvnL9hX9j34o/EP4Kr8RvDnxp1v4eafr15P5VhorzKr/ZXMDSz7ZoV3lkIGAflAy3OAAfZ//BR2WKM/AnzHVMeP9MbkgfKucnnsM8ntX6XV/Nd/wUM/Zd+Ifwa0jwr458XfFLU/iTa3k8mnIdYaVri1kKmYeVvllXy3CndypBA4Ofl+LbX9qD9pGytobK0+KXieGC3RY40XV7sKqIMKoHmcAAYFAH76/s5SxN/wUA/aUVXViYNFwAQT8sCBvyPB9DX1V+1oyp+zB8Vy7BR/wjGrDJOOTayAD8TwK/kb8P8AxC8e+E/EsvjPwx4j1HSdfnMpk1C1upYbpzMcybpkYO288tk8nk11Xir49/HDx1os3hvxp4/17XdJuCrSWl7qVzcQOUO5S0cjlTggEZHB5oA/qX/YiZX/AGTfheUYMP7GhHBzyGYEfgetfOX7Zksa/tZ/spKzqCNb1EkEjIy1kB+Z4Ffz3+EPjn8aPh/o48P+BfHeueH9LEjSi1sNRuLaASPjcwjjdVycDJxzXQ+D/wDhZv7Svxn8J+GPEPi69v8AxBrd5bafb6nqdzNdSWyl8qQ7Mz4QksFUjn0zmgD+yOvzO/YPlik+Nn7UvlurZ8aysMEHIM95z9KSb9g742ywvEf2pfGrb1Iw0s5ByO/+mdK/ADU9S+KH7OXxQ8WeFfCviy90bW9FvbvSLy80m7ntftH2Wco/zIUdkZ03AN7cZoA/pd/4KIsq/sa/EfcQMwWIGe5/tC2r+TuvT/GXxs+MXxF0tNE8feN9a8R6fHIJlt9Q1C4uoRKoIDhJXZdwBIBxnk1+r3wn/wCCSOm+Ofhp4Z8beIfiLNYX3iDT7fUGt7WwWWKJLpBLGgd5UZiEZdx2j5s44waAPkb/AIJnOiftl+CC7Bcw6qBk45On3GBX9UhIAya/ku/ay/Zx1j9jX4uaNougeKJNRNxaQ6tp2oQq1ndwOkjJzsZtrrJGSrI3TB4NeU6h+03+0Zq1hc6XqfxP8S3VneRvDNDLq128ckcgKujKZMFWBIIPUUAfvr/wS2kjf4O+PwjBj/wnGqnAOeDBa4P0OOKm/wCCrrKP2UZASAW1zTgM9ziXpX56/wDBPf8AZU+I/wAXvA/iT4heE/izq3w3shqA00xaM8qy3MtvEkzNPslhXaomUJyxyW6cZ3/2+f2Sfib8MPhZpfxB8T/GLWfiNYWGoLataa08zGB7pSFkg3TTLn5MPkA4xg8YIB+P1fqJ/wAEjmVf2odSDMAW8M3wAJ6n7TanA9eBmvpPQP8AgjdpNzodhc6/8S54dSlgje4S205XgSVlBZY3eZWZQeASoJHOB0r5t8GfsKeM/DP7ar/Azwz8QpNDl0bTG16HX7FZIb1LNsRBURHXbMWk2sBJt2ZbP8FAH9FXjl0j8FeIHkYKq6fdkknAAELZJNfEn/BMBkb9jvwsFYEreaoCAeh+2SnB9OCDXi3xU/YG+Nd/8OPEdu/7SHifXl+xTObDU5Lg2V0I13+VPi5f5G24J2Njrg9K+bP2FP2Pvij8Rfgx/wALG8N/GjW/h5p+uXs4jsNFeZVk+ysYGln2zQrvLKQMA/KBlucAA+0v+CkUsUdp8DvMdUx4/wBLb5iB8qhsnnsM8ntX6XV/Nj/wUM/Zc+Ifwb0Twr468XfFPVPiTaXdxJpqf2w0rXFrIyGYeVvlmXy3CHdypBA4bPy/FVp+1B+0jY2sNlZ/FLxPDb26LHHGmr3YVEQYVQBJwABgUAe3f8FJJEk/bT+IrRsGAOkjIOeV0q0BH1BGDXw5VzUNQv8AVr+41TVLiS8vLyR5pppnMkkskh3M7u2SzMSSSTkmqdABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH/9T8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/b3/gm9+1/8Avgx8FdV+H3xT8RHw7qaaxNfRmW2nminhuIokGxoEkO5TEdwYL1GM84u/wDBRL9sf9n/AOLnwd0bwN8MPETeI9SOt21/L5NtPDHDDapIG3tcJF8zGQBQoboc44z6D/wSv+DHwm8Vfs/6v4u8V+EdL1zV7rXbi1e41C0iu2ENvDC0aIJlcIAZGJ2gZzznAxL/AMFTfgv8JfC37PmmeLvCvhDS9D1e01y2t0uNPtIrRjDcRSmRH8lUDgmNSNwOCOMZOQD6m0n/AIKOfsealpdpqFx48XTpbmJJHtrixvfOhZhkxyeXA6blPB2swz0JHNfgR+3T8XvBXxv/AGkfEPjv4fXEl5obxWlrDcSRtF55toVjaREbDBCwO3cASOSBXyBRQAV+/f7BX7a/7OPww/Zs0H4cfEfxR/wjut6DcXyyRz2txKsqXF1JcpJG0EcgK7ZApDYIYHjGCfwEr+lP/gnH8Dfg5rX7KXhnxXr/AIK0jV9X1q41GW6ur+yhu5XaG8mgQBplcqqxxqAq4GcnGSSQD4x/4KaftWfBL46+E/B3g/4T623iCfTr2a/uZ47eaGCJDEYlQmdI2LsTn5VIAHJyQK/Hqv6Ef+CgnwC+DNl4m+B0uk+D9O0k694us9Gvhp8C2S3FjcSIXidbfYCeuGxuXJwRmv0pi/Z9+AsESQRfDfw2EjUKo/sizOABgcmLNAH8/wB/wTM/aO+E/wAAPGXjOL4r6o+i2niOztFt7swyTQrJaPIzI4hV3BYSfKdpHBBI4z+hf7VP7en7Lnin9nvx14R8G+L/AO3ta8QaZPp9ra21ndIxkuVKB2aeKNFRM7mO7OBwCcCuG/Zg/Z9+Cr/tqfH/AES68HadeaZ4WaxGmWd1CtxbWgv1aSfy4ZdyDJGF4+RflXAOK+nv2wv2f/gen7M3xF1Kz8B6JYXulaPdX1rcWdhBazw3FsheN1khRHGCORnDDIIIJFAHiX7Jv7eP7L3hP9njwR4O8a+Lv7A1vw/p8dhdWtxaXTtvg+XerQRSIUccqd2exAPFfAv/AAU3/aR+Evx/8UeBrb4T6q2uW3hy1vjc3YhkhhL3jw7Y0Eyo5ZRCSx24+YYJOcfl7X0j+yB4P8NePv2l/h74R8YWKano+oakq3FtJny5VRHkCuARlSyjI6EcHgmgD5ur9dv+CZH7UnwW+A+jeN/DXxZ1tvD8mr3Frd2s72800MgiRo3jzAkjBxuBGVAIzzkYr9xJP2fvgNNG0Unw38NlXBUj+yLMcHg9Iq/kW+OHh/SPCfxp8feFvD9uLTS9H1/VLO0hDMwjgt7qSONNzEsdqqBkkn1oA/bT9uz9tv8AZu+JX7NXiX4c/DrxT/wkOueIJLKKKKC1uYliWC6iuXkkaeONQu2IqNpLFiOMZI/n6or+uf4Ffs7/AAHs/gv4GQfD7QbhpdFsJ5JbnTre5mklngSWR3lmR3Ys7E5LH0HGBQB/Of8AsO/Fvwb8Ev2k/DHj7x/PJaaHbpd2088cZl8n7VA8KyMi5YorMC20E4yQD0r+gLUv+CjX7HWn6ddX0Pj9L6S3ieRbeCxvfNlKgkIm+BF3N0G5gM9SBzX48/8ABVH4ceBPhz8f9Fi8CaHa6DBrGgQXlzDZRiGB5xcXEO9YkwiEpGgO0AEjJ5JJ/MygC/qt2l/ql5fRAqlxNJIoPUB2JGcd+ar20ohuYpmGRG6scexzUFWLSNZbuGJxlXdQR7E0Af1WaN/wUc/Y81LSbPULnx4umy3MKSPbXFje+dAzAExyeXA6blPB2swz0JHNfgb+3Z8X/BPxw/aQ1/x18PbmS90NoLS0huJI2iE5togjSIr4YIWzt3AEjkgV/TTo37N37P2iaTZ6PYfDjw99msoUhj83TLaaTYigDfJJGzu2ByzMWJ5JJr+bn/gov4E8IfD39qnxFofgjSoNF02a2srs21svlwrNcQhpCiD5UDNztUBQegoA+Gq/ff8AYG/bV/Zy+F37N2ifDj4keKP+Ed1vQ7m+Ekc9rcSrKlzcyXCSRtBHINuJNpDYIYHjGCfwIooA/cD9uX9tL4CfEHWvhH/wrrWJvEsfhLxLa69qEltbSxIlvbOuYl+0LEWlcZKgDbxywyK/QG3/AOCin7G08Ec5+IsMRkUNsexvwy5GcMBbkZHfmv5gvhDoel+J/iz4K8Na3D9p07Vtb020uYtxXzIJ7mOORdykEZViMggjtX9elv8As9/AS1gjtofhv4bWOJQig6RaHCqMDkxZPHrQB/KZ+1b8SvDfxf8A2h/G/wARvB5lfRtZvVa1eZPLd44okhDlOqhym4A4OCMgHIHz1X9Bf7M/7PvwVf8Abc+PmiXXg7TrzTPC/wBh/syzuYVuLW1+3p5k/lwy7kGT93j5B8qYHFfUX7X37P3wOX9mf4jajaeAtEsb3StGu761uLOwgtZ4bi2jMkbrJCiOMMORnDDIIIJFAHhf7JP7eH7L/hH9nfwT4N8beLv+Ef1vw/YpYXNrc2l07b4ON6NBFIhRxyp3Z7EAivgz/gpx+0l8JPj/AOI/Atp8J9WbXLfw5bX5uroQywwl71oNkaCZUcsohJY7cfMMEnOP1W/Yu+AHwQl/Zg+H2rX3gTRdQv8AV9Njvbu5vbCC7nlnn5dmkmR2x2C5woAAAFfM/wC198Afgzb/ALWv7OukWPg/TrDT/Fd7d2+qWtpAttb3cVo9u0SyRQ7EODIwYgZYHaxIAAAP5+6K/s7k/Z++A0sbRP8ADfw2VcEEf2RZjg/9sq/ka+O/h3R/CPxu+IHhTw9bi00rRvEGqWdpCGZhFBb3UkcaAsSx2qoGSSfWgDymiiigAooooAKK94+EH7Mvxx+OsyD4a+FLvUbMyCNr518myjJODunkwnHcKSR6V+gngr/gj58X9UNpP468X6ToMMqbpo7ZZb24ibsuMRRt7kSYoA/IOiv3S/4cyQf9FXb/AMEw/wDkuvE/G3/BIb466KtzceC/EWj+I4kdRDE7SWdw6HqxDq0akenmH2oA/JmivU/id8Efix8GdQTTfib4XvdAkl/1bzxnyZcf885VzG3uA2R3FeWUAFFFFABRRRQAUUUUAFFFftj/AMEkvhN8M/HOkfEPxF428Maf4gv7GextYH1C3S6WKGVZHcJHKGQFmVcsF3cYzjIoA/E6iv6af+ChHwI+DGl/sn+MvE2i+CdH0nVtENjcWl1Y2UNpNHI95DA3zQKhZTHIwKtleQcZAI/mWoA+sP2I/ix4P+Cf7SvhT4g+PZ5LXQ7T7XBcTxxmUwi7tpIFkZF+YorOC20E4zgE8V/QVqH/AAUZ/Y5sbC5vYviBHePbxvIsENjfebKVBIRN8CruboNzAZ6kDmvwV/4J9+CPCfxC/av8G+G/G2lw6zpTC+uGtbhd8LyW1pLNFvTo4V1B2tlTjBBHFf0xah+zn8ANUsLnTLz4b+HTBdxvFIE0q1jbY4KttdI1ZTg8MpBHUEGgD8k/+Cen7ZXwB+FHw58XeEfidrz+G7298RXWr27T2000c0F5FEgVTbpKQ6GI7wwA5G0nnE3/AAUX/bF/Z++MPwKtfh78L/Eh8Ratdarb3TCG2nijgitlfcZGnjj5YuAoUMeucAV6V/wTJ+B3wg174V+NfEXiPwhpmtainim905JtQto7wpa2kUDRRoJw4XBlckqAWyNxOBib/gqL8FvhJ4Z/Z0tfFvhfwfpWiavYazawxXOn2kVo/l3CyCRG8lUDqdq8MDgjIxQB/PHX3b/wTu+OHw9+An7QEnir4mXr6bo2paPdab9qWJ5kglllhmRpFjDPsPklcqrEEjIxkj4Sr9GP+CX3w98E/EX9pS4sPHei22u2mmaFeX0FveRiaAXCzW8Su0TZR8JK+AwIBIOMgEAH68/Ef/gol+yMngDxENJ8bjWL6SwuI4LO2srwTTySRlFRTLDHGCSerMAByTXy7+wD+2p+zp8Lf2c9K+HHxK8THw7rWi3d7vSe1uJUmS5nedHieCOQYAfaQ2CCDxjBP6KfE/8AZw+AOrfDnxNYXPw70GNJNOujvt9Nt7eZGWNmVkliRXRlIBDKwINfIX/BNj4HfB3XP2WdE8W+IfBek6xrGs3l+11dX9nDdyv5FzJDGAZlfYqogG1cDOTjJJoA+R/+CmX7V/wP+Ofgbwj4L+E+uN4hubHUX1C5mjt5oYYYxC8SoTOkbF2L5AVSAAckEgH8ca/oR/4KI/AX4N6fc/Bq60bwhp2kS6x4ustHvDp0C2Qnsbk5kjcW4QHkcN95edpGTX6TW37PXwEtLeK1g+G/htYoUVFB0i0YhVGByYiTx3PNAH8ZFFf0F/s5/s+fBVv26/jvoVz4O0670rwxFYPptlcwie1tWv4lknMcEm6MZYnb8vyA7UwOK+q/2s/2fvgcP2aviTf2vgLRLG80zQr++tri00+C1nhuLWFpYnWWFEcYdRkZwwyCCCQQD+Umvaf2c/HuhfC746+BviF4mEv9k6DqtvdXRhXfIIkb5iq5GSAc4zk9ua/os/Ym+APwRm/Ze8Aavf8AgXRdR1DWLBb27ub2xhu55Z5idzGSdXbHAAUHaAMACvz0/wCCt/wr+HHw/wBZ+G2s+BfDlj4fudYh1SG7+wQJbRzLaNbGItFGFTcvnP8AMF3EEAkgDAB+nT/8FEf2NkRn/wCFjwNtBOBY3+TjsP8ARq/mK+NvjLSviJ8Y/HHj7Q0lj07xHrWoahbLMAsohurh5UDgEgNtYZAJ5rzCv2t/4JJfCf4aeOtN+IniHxt4Y0/xBfWE1ha27ahbpdLFFKsruEjlDICzIuW27uMZxkUAfilX9N/wK/4KB/sn6Z8GfBGjeI/Gg0XVNK0exsbq0ubO7aSOa0hWF/mhhkQglNykMcqRnByAn/BQP4E/BjS/2UPGniTRvBGj6VquiiyuLS6sbGG0mika7hhb54VQkFJGBVsqc5xkAj239nr9nn4EW/wJ+H7N8P8AQrmW60LTrmaa5063uZpZrm3SaV3lmR3Ys7k8tx0GAAKAPwz/AOCknx9+Gfx++Meiav8AC3UH1fS9E0iOykuzC8McszTSTHy1lCuQocAllHzZxkcn88K/oL+K/wCz/wDBf/h5D8KfDMXg/ToNF1vRLrUb2whhEVnPdWUd2YXaBMR8GFNy7dr7fmByc/pRf/s6fAHU7G4027+G/h0wXUbxSBNKtY2KOCrYdI1ZTg8FSCOoINAH48f8E1f2uvgP8EvhH4g8AfFXxAfDuoSa1JqULy2080M0M9vBFhGgSQhkaE7gwAwy4J5x0n/BRT9sb9n34vfAq2+H3wv8SHxFq13qttcsIbaeKOCK2DFmkaeOP7xYBQu4nnOAK9E/4Jl/A74Qa78NPHev+IvCGma1qEPiq902OXULaO8MdpaQwNFGgnDhcGViSAC2RuJwMW/+CofwV+Efhr9nKDxb4Y8H6Vomr2GsWkUVzp9pFaP5dwriRG8lUDq20cNnBGRg0AfRvhz/AIKNfsfX+gade3njtdMnmt42ktbiyvPOgcqN0bmOF0LKeCVZh6Eivg/S/wBtf4CR/wDBQrU/i9NqtxH4LufDf/CPpqhtpPLM6PHN53lAGbySUKA7N2SCVC81+IdFAH9SvxD/AOCif7IsXgTxAdK8bjV717G4SC0trK8E08joVVEMsMaAknqzADqTXyt/wT//AG0/2dfhX+ztpvw4+JXiY+Hda0a8vCyT2txKk0dzM0yPG8EcgwA20hsEEHjGCfwTooA/ZL/gpj+1h8Dvjl4C8JeCvhPrreIbqy1NtQuJo7eaGGGNYXhCEzpGxdi+QFUgAHJHAP420UUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH//1fxjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD7j/Zk/b1+Kv7L3hDUPAvhfStM1rSL27N6kd+kgeCZ0VJCrwuhIcImQ2cEcYycu/aa/b3+K37T/g6x8CeJ9K0vRdItLsXsiWCSl55kUpHueZ3ICBm4XGSec4FfDVFABRRRQAV+0v7DXxK/bu0n4HW2ifBr4c6X4r8G2N5crY3eqTJZMDJIZJo4i1xB5qCVnO7a2GLLu+Xav4tV/U7/wAEyb+xu/2OPB1ta3Mc0tlPqkU6I4ZoZGv55AjgHKsUdWAODtYHoRQB+YX7bfxM/bdv/E/w3Hxa8FWvhKXTdRS90GPSVS/judVjkXy8yLLcBpVIULDkZBztbPH6B2fxa/4KfSWkEj/BTwyzMikl9SiRiSO6m/8AlPqO3Sq3/BRjXtE0vxN+z5FqWo29o8HjmwvJBLKkZS2hkTzJmDEYjTI3OflHc1+nqsrqHQgqwyCOQQaAP5vf2dPih+2/D+1J8StU8GeC4Nc8baySfEmmX8S2lpbGBsQZlMkQi2D5Yv3h8xST8/3h9H/tV/FT/gofP8CPFNj4++F+j+HfDF7b/Z9TvtMuI764itJOJf3a3U5VGHDybDsUk5X7w9z/AGVvEGhX37df7S0NlqVtcSXb6YYVjmRzILVGjm2AE7vKchXx90nBwa+pv2ztQsdO/ZW+KMuoXMdqkug3sKNK4QNLNGUjQFiMs7EKo6kkAc0AfzdfDP8AYX/ah+Lng+z8eeCPBrXGiajuNtPcXlrZmZFON6R3EqOUJ+62MN1BIptt8Hf2nf2W/jv4JiHhaaz8cy3MdzosCiK+ivH3bGRWhZ434O2QBgyK2SVyGr+jz9iXULDUv2UfhjJp9zHdLDotvA5icOEliGx0YqThkYEMDyDwa+Zv2uPEGhaf+2v+zFFf6lbWz2lzqjTLJMiGJbkQxwlwSNoldSqE/eIIGSKALl18Wf8Agp9HbSunwU8MBlRiCupxO2QOyi/5Pt3r8OfB37Pv7R/7T3j3xlqHhvwzNqmv2t9cXOuPOYbBIb24mZpY389okWUybv3Q5AB4AFf18EhQWY4A5JNflz/wTx13RdT+Jv7Sa6dqFvdm68aXV3CIpUfzLaSe52zJtJ3RtnhxwfWgD8U/i3+xd+0j8DvCjeOPiP4Raw0SOVIZLmG6trxYmkOEMgt5JCis2FDMAu4hc5IFfUPw+/4Ku/HPwJ4I0TwW/hzQ9XXQ7SKzjuriO4SWSKBdke8RSqm4IApIUZxnqTX6y/8ABSrULGz/AGNvHNvd3McEt62mQwI7hWmkGoW8hRATlmCIzYGTtUnoDX8qlAH1n8UPib8av28PjdpTx6LFeeIryCPTtO03Tk2RQwRFpGy8jEhQzPI8kj4UE8hQAO01T/gm7+2NpOm3WqXHgQSxWcTzOkGo2M8rKgLEJFHOzuxA4VQWJ4AJrR/4Jm39jp/7YXhB7+4jtlmg1GFDI4QPLJaSqiLkjLMeFA5J4Ff1MXd3a2FrNfX0yW9tbo0kssjBEjRBlmZjgBQBkk8AUAfx+/Br9kv4/wDx907UNY+F/hWTUrDS5hbTzzTwWcQnxkxq1y8Yd1GCwXJXIzjIzL8Y/wBk39oL9nrSbDxN8UPC7aVp15P5MV1FcW93EsyjcEka3kkCFhkqHxuwcZwa/cv/AIJUanp158B/Fdpa3UU08Pi3UZXjR1Z1jmht/LdlByFfa20ng4OOhqD/AIK139jB+zDZWE9xHHdXWv2RhiZwJJBHFMXKKTlguRnHTIzQB8G6R/wV++Pen6VZ2OoeF9A1K5t4kjkupI7mN53UAGRljmVAzHkhQFz0AHFfH+v33xx/bt+PV9q2j6KmreKtZjDi0swsFta2lqgRd0krBURBgb5HyzEDOSBXy1X6l/8ABIu/sbP9prV7e7uY4Jb3w1eQwI7hWlkF1ayFEBOWbYjNgZO1SegNAHg/i3/gnr+1x4K8Naj4s1vwMTp+lQtPcfZr6zupREn3mWGGZ5H2jkhVJABPaviyv7WfitqOn6R8MfFupapcxWdpBpV60k0zrHGg8lhlmYgDn1NfxTUAdF4Qv/EOleLNF1Twkrvrlne201gIo/OkN3HKrQhY8NvbzAuFwcnjBr+j7T/i1/wU/msLaWT4K+GWd4kYmTUYonJKgkshv8qfVe3Sv58Pgfe2em/GrwBqOoTpa2tr4g0qWWaVgkccaXcbM7s2AqqASSeAOa/tFR0kRZI2DKwBBByCD0INAH8337PXxQ/bfh/aq+JOq+DvBcGt+ONYz/wkml38S2lpbeQcQZlMkQj2D5Yv3p8xTn5/vD6S/ao+Kn/BRGb4E+KrHx58LtH8O+Gb22Nvql9plxHfXEVnL8sv7tbqYqjLw8mw7FJOV+8PcP2XfEGhXv7ef7ScFnqVtcSXX9meSscyMZPsqeXPsAPzeU5Cvj7rcHBr6r/bI1Cx039lj4pTahcx2qS+H7+FGlcIGlmiZI0BYjLOxCqOpJAHJoA/CD4Lf8FOfjV8GPhto/wzs9D0bXLHQY/ItZ7uOZJltwcpG3kyIrbOgbbkjGSTyeM8d/tmftA/tGfHL4deMNE0mzi8S+FLpU0HTdOt2lR7qeRS+4Ss7uZdiqwLAKoyNpy1fB9fTf7GV/Y6Z+1R8Mb3UbiO1t01q3DSSuEQbsqMsxAGSQB7mgD9yrn4s/8ABT1LeV1+CnhgFVYjbqcTnIHZft/J9u9fzj+PdT8U61458Q6x45jeLxHfajdz6kksXkOt7JKzThosDYRIWBXAweMV/bUSFBJOAO9fxnftG31lqn7QfxM1LTbiO7tLvxNrEsM0TiSOSN7yVldHUkMrA5BBwRQB4zRRRQBYtLS6v7qGxsYXuLm4dY4oo1Lu7ucKqqOSSTgAcmv3s/Y7/wCCYWjaLaaf8Sf2jrcajqcyJPbeHm/1FqT8ym8IP7yTHWL7i8htx4Hmf/BKP9mLTvEN/d/tGeMbXz4tHuGtNDifBT7Sq/vrkqRyYwwWM54bccZAI/fCgClp2nafpFjBpek2sVlZ2qLHDBCixxRoowqoigBQBwABgVdr4x/bA/bM8JfsnaPpIvNMfxB4i11mNpp8cogAgiIEk0shV9qgnCgKSzZ6AE1ufsk/tZ+Ev2rfBt7rmj2TaLrOjyrDqGnSSrK0XmAmORHAUvG4BAJUYIIxxkgH1lRRXwz+2J+2/wCGv2Tn0XR5dBm8Sa9rkb3EVusot4Y7eNwheSUq/JOQqhT05wMZAPsbxR4T8M+NtDufDXi/S7bWdKvF2zW11EssTj3VgRkdQeoPI5r8EP22f+CbE3w7sNS+LXwEjmvvD0G6e+0X5pZ7KMDLy27ctJCvVlPzIOQWUHb+uv7K37TvhX9qb4ey+NPD9lLpN5p8/wBkv7GZhI0E2wONsgADowOVOAfUA19MMqupRwGVhgg8gg0Afw00V+iv/BR39mGx+Afxai8TeELU2/hLxp5tzbRgjZbXanNxAowMJ8wdB2DY7V+dVABRRRQAUUUUAFfpZ/wTx8c/tYeGLzxfp37OXg6y8X6fcx28uox6iy29vDMhKwstw0sH7wqWHl7zkZbb8ua/NOv3o/4I1X9iPDXxM0s3Ef2w3enTCDePNMQjlUvsznbuIGcYzxQBxn7bPxN/b21L4Ealo3xc+G+leFvB1/cW0eo3mlzx3sm1ZBJEkm24nMUbSqnz7V+YKu75sH8Sq/q2/wCCj2oWFl+xv4/hvLmOCS9XT4YFkdVMsv2+B9iAkbm2IzYGThSegNfyk0Aeq/BT4weK/gN8TNG+KXgsQvqmjO5WO5TzIZY5kaKWNwCDh0ZlypDDOQQa/RbUP+CwXx5urC5trLwp4esriaN0jnVLp2idgQrhXmKsVPIDAg45GK/JSigD7k/Zs/b5+Ln7NOg614Z8P6dpuu6drV82pMl/G4aK6lUJK6NA8ZxIETKtkDb8uMnM37S/7fvxY/ac8FWngDxLpOl6JpEF0t5KtgkpeeSNSIwzTO5VV3McLjJPJ4xXwrRQAV7r+zt+0F41/Zp+I0fxI8DRW11dm2lsp7e7QvDPbzFWZG2lXXDojAqwOVxyCQfCqKAP1S8Y/wDBWr48eKvCuq+GrTw5oWkSapbSW32uCO4klhWUbWZFllZC2CcblIB5weleU/s5/wDBRH4vfs4/DyP4ZaDo+k63o9rPLPa/bo5RLB57F5EDQyJuUuSw3AkEkZxgD4DooA+3v2hv29fjD+0NceFZdWtNO8PxeEL5NTs47CJmzfRn93M5naQnYOAvCnJ3A8Y+krb/AILDfHWK3iiuPB/h2aVFUPJtu13sBy2BPgZPOBX5H0UAfpl+yt8ff2u/G/7SHjT4kfCLw5ZeLvEXi2DzdZtJ0W3sI4YcLbnzjJF5XlgBI8yZfndvbkfXv7T/AMVP+Cic3wJ8XWfjn4W6N4f8N3lm9vqd9ptzHfXENlL8kxEa3UxClCQ77DsUlsrjcPJf+CN+o2EHxF+Iemz3MUd3d6ZZvDCzqJJFimfeUUnLBNy7iBxkZ61+u37Xt/Y6d+y58VJr+4jtY5PDepwq0rhA0s1u8caAsRlndgqjqSQByaAPzI/ZE+KP/BQi1+A3h7Tvhx8MtI8S+FbIPBpl9qk8djPJbKflCo1zAXjUkhZNnzDu2M18o/t06r+158VviX4H8HfGzwNFompyxSQ6Dp2kgXMV1LdSIsxSZJJvMkJWMMm/5AFO0bsn9wP2GNR0/Uv2TPho2n3MV0LfSo4JDE6vsljZg8bbScMp4Knkd6+av21te0Ow/a1/ZbivtRt7d7LV76adZJkQxRzSWiRu4JG1XZGVScAlSByDQB+UEn/BND9suNGkPgeIhQTgarpxJx6AXHJr0f8AYH8R/thfDrxJ468J/AzwJb+IWiMSa1Z6uBaR2d3bu0aAzSSwFZhl1MRYkgE7flzX9L5OOTX5efsCa/oeqfG79p0abqNvdm88Xy3cHlTJJ5tubi6AmTaTujJI+cccjnmgD5k/bU+Jv7fGpfAbVtH+LXw10nwv4Pv57aPUb3S50vZAiyB40k23M/lRtKqZfaOcLuG7B9R+AHxY/wCCkP8AwpjwfF4Z+E+ia1o0GnQw2F7qN1HY3U9nENkDvC13CQPLC7W8td64bnOT9Yf8FGb+ysv2OPiDHeXEcD3cdjDCJHCmWT7dA+xAT8zbVY4HOAT0Br3j9nW/sdS+AXw4u9OuI7qA+HdKQSROHQtHaxo43KSMqwKkdiCDyKAPwj+JvxP/AG3X/bc8Ga7rngq30/4k6fbx22j6PbRLNYzWMyyCbEwkcPG4eXzZfN/dfN8ybOPv3xB8Xf8AgqBbaDqVzD8GfDsEkVtMyyW99FczIVQkNHCL5jI46qm07jgYOcU74ua/oVt/wVA+DUNxqNtE8Hhy+t5FaZFKT3MV6IY2BPDyFl2KeW3DAORX6eXNzb2dvLeXkqQQQI0kkkjBURFGWZmPAAHJJ6UAfzt/sE/Ej9tjR/Dfi/TPgh4FsfF+iy6obq9fVWSySDUpUAmEcjTW+92VU3x/Nswpwu7nR/b8+In7bWufCzStF+O3gDTfCPhOfUFd59LlS8EtzGp8lJpFnn8ocsV+7vI6nGK+2/8Aglfq2l3vwk+INpZ3kM86eM9RuGjjkVnEM8FuIpCoOdj7G2t0bacdDVn/AIKxX9jb/stLYz3EcVxd63Y+TEzgPL5YkZtik5baOTjoOtAH8zlFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAH/9b8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/Wb9hP9gP4a/tLfC3U/iT8Q9d1W08vU5NPtrbTGhh2CCON3eR5opt+7zQAAF27TktniT9ur9gD4afs1/CvTviV8PNe1W6J1KKwubbU2hm3i4R3R43hih2FDGQQQ27cORjna/YB/br+Dv7O/wk1T4b/Ey31GC5Oqy6hb3FpALiOVLiKNGUjcpRkMXuCG9jUn7ff7d3wc/aF+EOnfDb4Z2+oz3J1SK/nnu4BbxxJbxuoUDcxdnMnbAAU56igD8d6+x/2Hv2avD/7UfxiuPAvivVbnStJ0zTJ9TuDZhPtEwjlihWNHkDqh3TBixRuFIxk5HxxX21+wT+0Z4N/Zn+NN34y8eWt1caPquk3GmSSWiiSWBpJYZ1k8skbxmHaQCCN2ecYIB+lnxR/4JNfAvw98OfEviHwp4m8QQ6tpWn3N5bteTWs9uXt4zLtkjjt4mIYKV4cEZzzjB8o/Yk/YA8DfGL4D6Z8U/FfjLxDplx4guLox2ujXMdnFFHazvbfvN8UpkdmjLbhtABAxwSfoL4q/8FSf2b9Y+GnijRfDNvrN/qupadc2ltDJaCBGkuIzEC0jOQqru3E4JwOATgV4V+xN/wAFCfgf8FP2f9G+FfxEt9UttU0Ge8xJa24uYp4rm4kuVcEMpQgyFCpB+7kHnAAPOf2zP2CvDHws8RfDGPwh4w1a/i8ca1b+HpTrTpeS273Eg2zI8axZRQxzGRnPIbk4+7Lb/glp8H4LaKF/iB43LRoqkpqcCLkDHyr9mO0egycetfEn7ZH7fXwo+LevfCy4+HOmajfW/gfX7fX7t7tFtPM+zOpFvGuXOWAJLnheOG5x9yxf8FXP2VJIkd212NmAJU6cCVJHTIkI49qAPwF+PPw8ufgD8cvFnw50XWZ7o+HbswxXq5gmeORFkXdsPDbXAbBwSCehxXk9/wCJPEWqwfZdU1S6vIchtk08ki5HQ4YkZr1b9pL4paZ8avjn4w+KOi2ctjp+v3nm28M5BlWJEWJS+3gMwTcQCcZxk4yfD6ANmw8R+IdKgNrpeqXVnCWLbIZ3jXcepwpAzx1qne6lqOp3P2zUrqW7nwB5krtI+B0G5iTxVMKx6DNBBHB4oA6R/GfjCRGjk12/ZWBBBupSCD1BG6v0X/4J5fse+Fv2kbXxd4o8V+JtX0ODQnt7OKLRpUtppHnBkLSTOkg2AJjYF5POeMH8w6/Uf/gnd+2R8L/2Z9M8YeHPiZbX4h12a2u7e5sohcANCrRtG6ZUjIbcGBI4IOOMgHuP7an/AAT78CfCL4Cax8UvCvjPxFqVz4cmtZHtdZuY7yGWO5nS2ITZFEY3BlDbjuBAK45yPxHr9xf20f8Agod8DPjN+z7r/wALPh5bapdar4hktE33VuLaKCO3uI7lnJLMWJ8oIFAH3s54wfw6oA+lf2RfgrZftAfHzw38NNT1WfRrO7M9zNc2oH2gJaRNOViJ4R22YVyDtJztOMH9wNb/AOCVvwo1DR76xsPiF4yS5uIZI4mutQguIA7KQpliFuhkTP3lDrkcZHWvxI/Y7+Nfh79n39oDw78TfFdrPd6TZC5t7kW2DKiXULQmRVbAbZu3FcgkDg5r9w9S/wCCsf7Llrp11c6dHrd7dRRO0MH2ER+bIASqb2kwu44G49OtAH83gv8AWfC+oXtlpWoz2jRyNE7W8jxb/LYgE7SPfGelQ3Wra1r89vDq2oT3hVtqGeV5dm8gHG4nGcDOPSqmpXY1DUbq/C7BcyvLtznG9i2M98ZqC3l8i4jmxny2VseuDmgD+inRv+CP/wAAItJs49e8UeI7rUliQXMttPaQQvLgb2jje2kZFJ6KXYgdSetfG3hL9gLwpN+3Drv7P6+LNStvDvh/Sf7dju4PLj1FoZPJRIBLtMaurTjdII8MqnCKW4++dH/4Kxfsw3elWdzqkGt2F5LCjTW4shMIpCo3oJFcBwpyAwAz1wOlfD3hn9vr4Vab+3V4k+P19peop4Q1rRP7CjdVRrpBEYGW4aHP3XaDGzdkBgx5BWgD6v8Aij/wS8+GUPw78RXeieP/ABYb+0spriEajew3doXgXzQJYVgiLKduOHBB55xg/NH7GX/BOP4U/Hz4GaZ8WPiD4g1iG71q4u1ht9NeCCOGK1ne3w5mhmLszRlsjaACBjIJP1H8R/8Agql+zXf+AfEOn+GrfWdR1S8sbi3trd7RbdHkmQxjdKzsFUbsk4JwOATxXz7+xJ/wUI+B3wR+AOkfCv4jW+p2up6HcXhWS1txcxTxXU73AYEMpQqZChUg9Mg84AB5d+19/wAE9vAnwT1b4bQfDrxJqD23jjXINBmXVBFcPBLcsAs6NCkIKqCcoVyeMN2r76sv+CWXwgtrOC2k+IHjYvFGqEx6nBGhKjB2p9mO0egycDjJr4l/bK/b7+E/xf1f4XyfDjTdQvoPBOv2+v3b3aLaeZ9mYYt4xlzlwCS5wF44bJx9xwf8FX/2U5IY5JW1yF3UFkOnglSRyCRKQcdODigD4C+An7AvhvxX+1J8UfhVrvjHU7fSvhz5Pl3OnbLa+uvt67ot0rCRU2LkSYU7z02ivoX9pr/gm38O/BfwN8XeOfDXjnxPc3/hmxm1NYdWu4ry1lW1Uu0ZRIYmDMoIVw3ynqCK8P8AgT+378K/Bv7U/wAWviz4q0nUbXw78Q/s32RoVSeeD7CNkfmxAr/rV+Y7WOw4X5h8w9+/aT/4KX/s+ePfgZ4z8B+CrbV77WPEunT6dCs9qLaJPtSGNpHcu3CAlsAEscDjOQAcX+zP/wAEv/g58Uvgh4V+JHjvxJrh1TxLarfGPT5Le3ghjl+5GFlgmZmUfebcAT0UV8dft9/sh+D/ANlHxF4SXwJrF9qWmeKLe7bytQMbzwy2TRBj5kSRqyuJlwNgKlTknIx91/svf8FKf2f/AIc/Ajwh8PvHVvq1jrHhuzWwlEFstzFIIeFlRw68OOSpGVORyME/FX/BRH9rH4dftQeIPBi/Da2vVsPDFveCW4vIxC0st60R2LGCxAQQj5ieS2MDGSAfBDeNPGLqUfXb9lYYIN1KQQex+auap21vQ02gApVUswUdScUlPiYJIjHoCDQB/ZV+zj4Cg+GPwJ8C+B4YUgfTNJthOsZLKbiVBJOwJ5O6VmP4+le11xvw61nTvEXw/wDDWvaRMJ7HUNNtJ4JACN0ckKspweeQa7KgD4Z/bO/Yp0T9rGy0TUINZ/4R3xFoCyxw3Rh8+OaCXDeVIoZSAHGVYHjLZByMdD+x5+yF4d/ZP8Kapp1tqZ17XddlSS9vzCIQUiBEcMa5YhEyx5YklieOg+xaKACvgv8AbP8A2HtJ/awfRNdtfED+HfEGhRPbxyvEZ7ea3cl9jIGUqwfkOD0JBB4x96V8lftMftX+G/gIlj4R0Wwl8V/EXxGPL0bQbQb5ZZH+WOSfHKRbv+BNg46EgAi/Zf8A2cvBX7G3wt1DRrnxAt015cNfanqd4y2sBZV2LtVmKxoiDHLEk5JPQDA8Zf8ABQv9lXwbqT6Q3it9cuYmkSQaTazXqI8Z2lTIi7OT0IYg+uK8f8Nfsb/E/wCPl3B49/bX8V3Gosz+db+EdLmNvpdmBkKsrRn942Dzt5GSC7ZIH3r4G+Enww+Gelro3gHwvp2h2qqqkW1uiM4TO3zJMb3IycF2JoA/G/8AbP8A2hIf2pfg4/gvwx8HvG8Wo2t7BfaZqE+lstthCVdjsLuVeFmwMdcE9K/Em+0vUtMleDUrSa0kjYoyyxsjK46qQwBBHpX9xQAAwK5XxN4F8FeNNOk0nxdoNjrVnKdzRXltHOm7BG7DqcNgnBHI7GgD+JGiv6LP2h/+CU3ww8Y2N3rvwMmPhDXVUulhI7S6dOyrwnzFpISxA+YFlHOV5yPwO+JHw08b/CPxfe+BfiFpUuj6zYEb4ZRwyNysiMPldGHKspIP1zQBwlFFFABV7T9U1PSZjc6VdzWUzKULwyNGxUkEglSDjIHHtVGlAJ6DNAGtqPiDXtXiWDVtSub2NDuVZ5nkUNjGQGJAOK/eP4P/APBKH4H+LPhZ4U8V+L/E2vy6vrmm2t/ObKW1t7dTdxiYIiSW8zAIrBSS53EE4GcD8BiCOoxX9EnwZ/4Kh/s5eHfhP4R8N+KrfWbDVtG0u0sLiKK0FxGHtIlh3JIrruVwm4cAjODyKAPjvx3/AME9fBPh/wDbN8Ffs96R4mv/APhGfFmmyaq00yRPewxWyzmWEOqpGzSGA7X8sBdwyrbfm+1dR/4I/wD7PUun3Mek+J/EtvevE4glmntJoklIOxnjW1QuoOCVDqSONw618leP/wBvv4Va3+274E+O+k6XqMvhPwppcukzu6IlzKLtbgPMkJJ4iNx90tltpxjIr7j1H/grB+y7bafc3NjHrl5cxRO0UP2ER+a6glU3tJhdx4yeB1oA+B/2JP8Agnz8Ov2hvBfibxl8RfEGpwLpOtT6NbwaWYYDutUjeSWR5o5twfzVCqAu3ack5GLP7cX/AAT5+GX7OXwns/iV8O9e1a5kXUYbK5t9TeCdZFuVba0bQxQ7ChQ5BDbge2Odj9hP9vT4QfAnwH4p8G/Euy1G1l1PXbjWbaaziF0jJdxxo0TDKFWjMQOeQ27tjmf9vP8Abz+Dfx9+D1n8N/hrbalcXcupwXs013ALaOGO2DYAG5i7OX4xgAAknoCAfTGg/wDBIH4BLoliPEPijxHdan5KfaZbaa0ggeXaN5jje2kZFJ6AuxA6k18X6L/wT58E6h+25rH7ONx4mvx4V0vR/wC3ROqxC/eB/KVbfeVMYcPKCZPLwVU/ICePv3Qv+CsX7MFxotjNq8OtaffPBGZ7cWYmEUu0b0EiyAOAcgNgZHOB0r4i0L9vj4V2X7d2t/tAXOl6ivg/VNE/sFHCobpQnkutwYc42s0O3ZvyA27ORtoA+mPH/wDwSP8AgTpvgjXdT8LeKPENtq1lZzT2z3k1rcW4kiQuBJHHbxMynGDhwRnPbFfz11/SB8Qf+Cqf7Nd14G16z8O2+tajqd1ZTw21u9oLdJJZUKKGlZ2CLk5JwSB0BOBX84ABPQZoASilII6jFJQBbsr++025W8064ktZ0ztkico4yMHDKQeRxWhfeJfEeqW5tNT1W7u4CQTHNPJImR0O1iRxWKATwOaCrDqMUAbGn+IvEGkwG20rVLqzhZixSGZ41LHAJwpAzgDmvRvhB4Lvfjj8Y/CXw91nWJoW8SX8Fi95Jm4kijduSA7DJAzgZxmvIK9a+A/xFsfhJ8ZPB3xL1O0kvrPw5qUF5NBCQsjxxt8wQtxux0zgE8ZHWgD+guX/AIJbfB6SJ41+IHjjLKQN2qQMOR3H2UZHtX883xE8Oap8Hfin4s8CaZq8rzeGtTvdKN3AWt2nW1maPdhWyAxQHbk496/oib/gq3+ymqlg+uMQM4Gncn85MV/Or8XfG9v8S/ir4w+IlpatYweJtXvtSjt3YO8S3c7yhGYAAlQ2CQKAOS1HxBr+rxLBq2pXN7GjblWeZ5FDYxkBiRnB61NZeKPEum2y2enatd2tumdscU8iIMnJwqsAMnmsKlCseQCaALk+pajc339p3N1LLeblbzndml3Ljad5OcjAwc8YrVn8X+LLqGS2udbvpYZVKOj3MrKysMEEFsEEdQa50gjg0UAfrX/wT7/Yk8I/tCfDvX/iP4s8V63oywam2lw22izpasTBDFM0ksjxy7wfOAVQo24JJOcDe/b1/YV8FfAn4RWfxN8J+Lte1eS01CKzlttauI7tWS6Bw0TJHEYypT5shtwI6Y5zf+CfP7cfwi/Zy+GGu/Dv4mW2oxTXOrPqdvcWcIuEkWeCKFo2XcpQoYQc8ht3bHO7+3r+3n8Gvj/8Gbf4afDW21Ke8uNSgu5pruAW0cMdsGwANzF2ctgAYAAJJ6AgH4119d/sT/s56F+078ah8PvFGqXGlaTaadcalctaBftEqQvHGI42cMqEtKCWKtwCMZII+RK+zP2E/wBoTwj+zZ8cv+E68c2tzcaPfaZc6bK1ooeWEzPFKsgjJG8bogpAIOGyM4wQD9SvHf8AwSO+BOn+C9b1Dwt4o8Q22rWlnNNbSXc1rcW4kiQuPMjS2iZlOMHDqec+1fOv7Fn/AATo+Fv7QHwTtPit8Q/EGrw3OrXVzHb22mPBAkMVrK0J3tNDMXZmUtkbQBgYJya+t/Hv/BVX9mq48Fa7a+H7fWtQ1O4s54re3ezECSSyIUUNKzkIuTknBwOgJ4PzT+w7/wAFA/gl8DfgRY/C34kW+p2uo6Rd3bxy2sC3MU8V1K0wb7ylGUsVKkHoCDyQADxX9vn9hn4f/su+E/DXjX4e65qV9batfNp9xbamYpXEhieVJI5IY4gBhCpUqeSCD1Ffl5X6v/8ABQz9tf4UftKeC/DHgn4ZW2oSDTNQbULm5vIlt1XETwrEibmLE7yxbgDAHOTj8oKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD//1/xjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAor7C/Z4/Ye+N/wC0x4av/GHgFdOs9Hsbn7J9o1K5aETTqod0jWKOVjsDLuLBR8wwTzh37Q37Dfxw/Zo8MWPjLx6NNvdHvbn7IZ9NuXmEMzKWRZFljiYbwrbSoYfKckcZAPjuv1F/4JJ6DomtftK6tcaxYQXsml+Hbu5tGmQOYJ/tNtF5kefut5cjrkc4YjvX5dV9jfsM2n7Q938cYl/ZrntrbxElhcNdvfkCxFhlA/2kYZmTzDHtCgtv2kdCQAf06fHHw14e1v4M+ONN1jTLa9tZNFv2aKWJXQmOB3Q4I6qyhlPUEAjkV8p/8EyfDnh+0/ZA8Kana6bbxXmq3GpzXcyxr5k8kd9NCjSNjLFY0VBnoABXh/xs0j/gp+3wl8WDWdV8Iy6b/Z85vF0bzE1BrULmcQNNGqBvL3Z5Dbc7fm214V+w1pv/AAUBl+BlrN8FdQ8PWvgh7y5OnL4g3tJkSETm38pHIi84PkNj59xA5yQD6f8A+Cjfgrwhqvij4BXGpaLaXMt/40sdNuHeFd01lNIhkt3PVo2PVTxycdTn9QYdK0u3iSCCzhjijUKqrGoVVAwAABgADoK/na/bc0v9vBPE3w2PxdvdOupZNSjj8PHw2+yBdYMi+VuEixuLjO3YzfKB90g76/QO00r/AIKqfZYfN1nwDv2Lu8xZ9+cc7tkOzd67eM9OKAPxD/bg0PRvDn7V/wASNI0Cyh06xh1FWSC3QRxIZYY5H2qvA3OxYgcZNfKleu/Hq3+J9r8Y/FsHxndpPGq30n9pszKwaYgEFCny+Xs2+WF4CYAAHFeRUAf1x/sReGvDuk/sp/DX+zNMtrX7bpEF1OY4lUy3Ew3SSucZZ2PUnnt0Ar8vv+CyGgaHp/i34Z61YWEFvf6haanFczxxhZJkt3tzErsPvBPMfbnpuNfIPwo/4KH/ALSnwe8C6b8O/DOo2F3pGkKY7T7daCeWKHOREHDKSi/wg5IHAOAAPGPj9+0t8Vv2ldd07XfihfRXDaRA0FpBbRCC3hWQhpGVAT8zkDcxJJCqOgAoA8Cr95P+COOgaHceGPiPr0+nwSakl5ZWy3LRq0qwNG7mMMRkKWAYgcEgE9Bj8G6/TT/gnfYftg3Mni+X9mq80q00lRbrqX9uEmza45MXlqivJ52zdyAF2/eOdtAH6z/8FK/Dfh69/Y+8Z6ld6bbzXelSadPaStEpeCV76CFnjbGVJjkdCR1DEV/LJX7Y/tv6b/wUGi+BN/N8ZNQ8O3XghLq2OpJ4f3pLjzAITceaiEw+cU4Qk79hIwMj8TqACivSvhF8JvGfxv8AiBpXw08A28dzrOrMwj82QRRRpGpeSSRznCIgLHAJwMKCcA/dup/8Emf2ptP066v4Ljw/fyW8TyLb299N50xQEhI/Mt0Tc3QbmUZ6kDmgD8yKs2Sq95AjjKtIoIPcE19e/s/fsM/HP9pDQdU8TeB49OsNM0q7Ni82pXLQiS5RQ0kcaxRysTGGXcWCj5hgnnDv2g/2HPjn+zN4YsfG/jr+zbvSbq5Fr9o025ebyJyC0YkWSOJhvAbaVDD5TnHGQD+rLRvDPhzQNIs9E0TTLax0+whSC3t4YlSOKKNdqoigYAAGAK/mC/4KaaJo+hftc+JIdFsobGO6tbC5lWBBGrzzQBpJCFAG5zyx6k8nmtvRv+Cpf7WOkaTZ6U2o6XfmzhSH7RdWIknl2KF3yuHUM5xljgZPNfFvxX+K3jb41eO9S+I3xBvft2s6my72VQkcaINqRxoOFRFACjr3JJySAec0UUUAFFaeiaNqfiPWbDw9olu13qOqXEVrbQrjdLNO4SNBkgZZiAMmv0tg/wCCSX7Uk0Ecsl94bgZ1DGN7+cshIyVbbbMuR0OCR6EigD1P/gjr4f0PUvH/AMQ9Z1HT4Lm+03T7FLaeWNXkgWeSUSiMn7u8IobHUDHSv1e/bN8M+HNX/Za+Jqappltdi00O9u4fMiVvKuLeJnilTj5XRgCpHIr+bjwR8T/j5+wz8WfEug6JLFpPiC1zp+p2c6rdWswX542IBw2AweN1IOG9CQfQPij/AMFFf2l/i34G1T4eeItSsLPSdaj8m7+w2ggmlgP34i5ZiEccMBgkZGcEggHwrX0n+x5o2k+IP2oPhpo+u2cWoWFzrNuJYJ0EkUgXLAMjZDDIBweK9o+EX/BN39oz4yeANL+JGgHR9M0rWkMtomoXckc8kOcLLsihlAV/4ckMRzgAjPPeI/2VP2mP2aPjl8P/AA/p62w8X69dJL4fvNOuBJBJcwuoZd0yx4Me5TIHTbtbuCaAP6sJNL02aNopbSF0cFWVo1IIPBBBHINfxq/tC6TpmgfHv4kaHolrHY6dp/iPVre2t4VCRwwxXcqpGijgKqgADsBX9BNxpX/BVPyJPL1nwBv2nGxZ92ccbd8O3Ppnj14r+cTx/F4ug8deIofiAZT4oj1G7XVTOwaU3wlYXG9lJBbzN2SDgnpQByNFFFAH9Pn/AATK+Otv8Vf2frTwXqN15niDwERp8yM2ZHszk2sn0C5i9tnvX6OV/G1+zt8fPGH7OHxNsPiR4Q2ztCDBd2khIiu7WTHmRPjp0BVv4WAPOMH+rv4D/Hv4e/tEeA7Xx38P70SxSAJdWkhAubK4wC0MyA8EdiPlYYKkigD2qiiigDzH4zfFLQfgt8MPEPxN8RsPsmhWrzCMsFM033YoVJ/ikkKqPrXxh+w18HNf1mK8/a3+NZGqfEL4hD7RZNMnOm6W4xDHCOieZHgjaBiPavds8l/wVC1z7b4X+F/wlmaaKz8beJ7aO7aJ9ga3gZFKEfxZaZWXPAKg1+n2n2NtpdhbaZZII7e0iSGNRwAkahVHHsKAINa1ew8P6Nf69qknlWWmwS3M74ztihUu5wOThQeK+Bvgd/wUj+Cnxz+KFv8AC3SdO1LRrzUjIthc3ywrDcyIMiP5JGZHcAlQRzjHUgV9769oth4k0PUfD2qqXstUt5bWdVO0mKdCjgHscE81+bn7P3/BMr4e/A74vj4pXPiK58Rx6TIZdGs5oVi+zSHIEk0ik+a6AjYVVBnkg8AAH6cV8R/tPft3fCr9l3xJpng/xLYX2uazfwfant7ARf6PAWKo0jSOoy5DbVGTxk4BFfblfn3+13+wH4S/al8S6Z43h16Xwxr9nElpcTJALmK5tkLMoZCyESIWIVg2MHBB4IAPsT4WfErwx8Yfh9onxK8GyPLpGuwedAZV2SLhijo69mR1ZT1GRwSOa+Y/25/2WNK/aS+FF3JpdrGvjbw7FJc6RchMySbRue0YjBKTYwoOQr4Yd8/SHwd+Fnh74J/DPQfhd4Vkmm0zQIDDHJcMGlkZ3aSR3IAGWdmOAABnA4FemUAfw2TQy280lvOhjkiYqyngqynBB9wair6l/bY8J6X4K/ao+I2g6MCtoNTa5VSAApu0W4ZQFAAUNIQOOmK+WqACv3c/4I36BodzofxJ1+40+CXUormwtkuXjVpVgdJHaNWIyFZlUkDgkAnoK/COv0u/4J32H7X11eeLpf2abzSrTTFSBdTOuEmyackmHYqK8nnbd/IG3bncc7aAP14/4KQeGvD1/wDsfeONQvdNt5rnSvsFxaStEpeCZr2CIvG2MqxjkdSR2Yjoa+gf2dfDPh3RfgL8PLHSNMtrO3/sHTZfLiiVFMk1ukkjkAcs7szMepJJPJr8j/22tM/4KEx/AfUpvjBqPh258FR3NsdTTw/vSbZ5gERn85ELQ+cUyEJO/aSMAketfALSf+CnI+DXhD/hHdV8JxaMdPhNgmteY9+tkRm3EphjZP8AVbdnJYJtDfNmgDsPix4F8F3P/BUD4S+fodlIL/w7d31wGgQia6tUvPImcYw0kflpsY8jauOgx+oGo+H9C1ewudK1TTre7s7yN4Z4ZYleOWOQFXR1IIKsCQQeCK/mS/ag+IX7YPwT/ah0X4i/FjVrSHxrpVnDLpU+nBX01rBt8bxxRsA3luxlWVXAYksRxtNWdS/4KoftZajp11p6X+k2bXMTxCeCwCzRF1I3xlnYBlzlSQQD2NAH6X/8ErvCnhm0+EXjnV7bS7aO+l8XX9m04iXzDbW0NuYYi3XYhkcqOgLH1qb/AIKx+HtBl/Zlttak063bUNP1uzS3uPLXzYlnWQSKj4yA4Vdwzg4Gegr4Y/4J+237cmpeDPFGofs/6jo0PhibUs3DeISzxPqJjUzNAI1dw+wx+aThSNmMkHGp+39p37dUHwu0mf4/X+hXXg9dQAdfD5ZVF2UPkm5EqI5GN+zblQc7udtAH5AV+mv/AASd0LRdb/aiupdYsYb19N8PXt1amZA/k3AntohKmejhJHUHrhjX5lV9efsQ2v7QN18d7NP2b57a38TJZXLXD3xAshYfKJftIwxaPeY8BQW37COmQAf1KfFPwx4b1/4a+KdI1vS7a/sbnTLsSQzRK6OBExGQR2IBB6ggEc18X/8ABL7w34etP2SNA1a2023jvtVvdRku5xEvmTvFdSRIZGxltqKFGegHFeV/FrR/+CpL/DPxMt5q3hGS1NjN566N5qai0O396Ldpo1QPszj5gf7p3Yr5x/YT039vyX4Kib4I6h4ftfBD3s/2FfEG5m3hiJzbCJHZY/NzuD4G/cVHLEgHs3/BYfw7oMXwv8C+IotOt01RNZe1F0saib7O9vI7RbxyULKGx0yMjvX8/dfqT/wUO0/9s620jwnN+0je6Rd+HjPKtl/YRItFvdpJ85XVJDKY87CQVC7tpBLZ/LagD9iv+CPGgaHqXxJ8favqOnwXV9pum2i2s0sau8AnlcSeWSPl3hQCRyRx0zX64/theGvD2r/su/FCLVNMtrtbbw/qN1EJIlby7i3geWGVeOHR1DKRyCK/n5/4J/2X7UN38S9Zb9mW5sbW5jsR/ajaqf8AiXGEsfKEqgM5ffny9i5HOSF3Z+/v2n9L/wCClK/Ajxe/jnU/C0/hlbJ21ZNC8xL02A5uMGaNB5ezPmgHcU3AZ5FAH4GV9Gfsi6NpHiH9pv4a6Lr1nFqFhda3arNbzoJIpF3Z2ujZDDI6Hg17Z8H/APgnB+0V8aPAGmfEjw8dI0zStYUyWi6jdyRzSwg4EoSKGUBGOdu4hjjOMEE8/wCLP2UP2l/2Z/jR8P8ARLNbf/hLNfu0k8PXmm3Akhe7hkUFN0yx7TGXQuHULtYckZoA/qzfTNOkRo5LWJkYEEGNSCD1BGK/je/aS0fSvD37QnxK0LQrSKw07T/Eeq29tbwqEihhiupFREUcBVAAAHQV/QDNpX/BVPyX2az4A3bTjalxuzjtuhxn0zx61/OP8RYvGcHj/wASQfEYyt4qj1G6XVTOyvKb4St9o3suVLeZuyQcZ6UAcZX9kf7N/hnw7ovwA+HVlpGmW1nbt4f0yYpFEqKZZ7ZJZXIA5Z3ZmY9SSSeTX8blffXgD/gpR+1B8OvBukeBtJ1HTr2w0SBbW2kvbITTiCPiNGcMu4IuFXIztAySeaAPZv8AgrzoOiaR8e/DN9pdhBaXGqaBHLdSRRqjTyJcTRq8hH3mCKqgnnAA6AV+T9ezfHL4+fEn9onxkvjf4m3yXd9DAlrBHDGIYIIUydkaDOAWLMSSSWJ5xgDxmgD+ir/gkH4d0A/ALxP4hOnW51S58Rz20t0Y1MzwQWls8cZcjO1GkcgdAWJ711n/AAVg8PaDL+zFDrMmn27X+n61Zrb3Hlr5sSzBxIEfGQHAG4dDgZ6Cvgz/AIJ66f8AtuXHgjxLN+zre6LaeEzfqsw18s0DX4iXzPs6xo7h/LMfmEgKRs6kcb/7funft1wfCvS5/j7f6DdeDl1BRIvh/coF0VPkG5EqI5X7+zblQc7udlAH4+1+mP8AwSh0LRdb/akmk1ixhvW03QL26tTMgfybgTW8YlTPRwkjqD1AY1+Z1fXP7Edr8f7r472Kfs4T29v4nWzuWne9IFkLH5RL9pGCWj3mPAUFt+0jkZAB/U38TfDHhvX/AIdeJtH1zS7a/sbrTrpZYZoleNx5TEZBHYgEHqCARzX8Vdf0X/FbR/8AgqW/w28SLc6t4QktzYz+cuj+amoNDtPmC3aaJUEmzOPmB/undivyo+An7Avx6/aJ8Dj4h+Cxpdhoks8kEEupXTwtcNEdsjRrFFKdqsCpLbckHGcGgD4nor6/+O/7D/x2/Z8l8Op4utbLU4/FN2un2UumXBmRr1/uQMJUiZXccr8u04POQRXv9t/wST/akntop5b3w5bvIis0Ul/OXjJGSrFLZlyOh2sRnoSOaAPzBorvPif8NfF3wf8AHusfDbx3aCy1zQ5RFcRq4kQh0WSN0ZeCkkbK6nrtYZAPFcHQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB//Q/GOiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP6K/8Agk1488FWX7PGs+Gb7XLK11Wy165uJraadI5UhuIIBE+1yPlcxuARxlSO1Tf8FYfHngq8/Z00vw1Za5ZXOq32u208NtDOkkrxW8UwlcKhPyoZEBJ4ywHev5zqKACv06/4JP8Ai3wx4U/aS1RfE2qW+l/2t4eurS0NzII1muPtNtN5as2Bu8uN2AJ52nHPFfmLX3P/AME+/wBnvwH+0f8AG+78JfEf7RJo2k6Rcam1vbyGE3DpLDAqNIuHVR52/wCUgkqBnBNAH9HHxw+JXw90f4N+N7/U/EunQQLo18m43MZy8sLRooAYkszsFUAEkkAc18s/8E0fiB4GH7I3hbQ31+xi1HSLjUoby3kuEjlgklvZp0DK5B+aORWBHBB65BxzHxa/4Jm/srab8MPFWq+GtHvtI1XT9Nurq2ulv7iYxy28bSrmOZ2RgSu1gR0JwQcEeB/sM/sEfs+fGD9njRPif8S7C81jV9euL04W7mto7eO2uJLZY0WFl3Z8veWbJy2BgCgD13/gon8UPh1a+KPgNby+I7FpdL8Y2Oq3axzCUwWEEiCSeQR7tqA568nBwDg4/TqLx34HniSeDxFp0kcihlZbuEqykZBBDYII6Gvww/bU/YT+Cnwv1/4TwfDUXuh2/jXxDbaBexNO92Aly6gTxmZmYOoJG3O08cAg5+84v+CX37HscSRv4ZvZWVQC7apd7mIHU7ZAMnvgAegoA/BL9tfxJoHi79qj4i+IPDF/DqmmXOohYrmBt8UnlQxxuUYcMA6kZGQcZBIwa+W6/Zn9n39hD4LeLf2qvjF8MfFz3+qeG/h81stjb+cYHl+3Aupmli2sfJUbRt27j8xxjafoL9p//gnP+zP4J+AnjXxv4G0y90bW/DmnTajbzC9nuFY2ylzG8czspVwCCRgjgg8YIB/PJRX9Cf7LH/BOr9mrx18AfBnjrx3pl7rOt+I7GO/nm+2z2yIZ/mESRwuqhUGBk5YnJJ5AHg37Rv7CHwX8H/tOfBj4b+DHvtJ8PfESW6hv4POM7x/Ydjs0MsxZgZVfad2QpG4A5xQB+Mtfup/wR98beENG8OfETw5rGs2ljqc13ZXcdvPMsTvAsbxtIocjcFYgHHQkZxkZ+vZP+CX/AOx48bovhi9jZgQGXVLvKk9xmQjI9wR7V8C/sZfsLfBb4meOvjFpHxIF7rln4B16bQrGMTta71hmlXz5DAVYuRGBtB2jJ4JxgA+7v+CkfxB8Cj9kTxhoo8QWL6hrEmnQWcEdwkks8sd7BOyoqkn5Y43YnoAOvSv5eq/d/wDbe/YD/Z5+En7O3iD4n/DawvNG1jw9LZyDddzXMdxHcXMds0brMzbQPN3hlwcqB0Jr2z4Of8E0P2WdW+FPhHWvFGkX2r6tqel2l5c3TX9xBvkuolmIEcLqiqu7aoAzgDJJySAfkz/wTj8UeHfCX7W/hDU/E+owaXZzR31qs1w4jjM1xbSRxIWPALuwUZPJIFf0+6p8Sfh5omm3esat4m021srGJ555Xu4gsccalmYnd0AGa/DPxz+wj8GNK/bw8FfBHTHvrfwb4k0d9antPOLSIbYXAaBJ2zJskNuCxJLjcQpHBH3hqn/BLj9kW9026s7DQb/T7meJ0iuY9SuXeF2UhZFWR2Rip5AZSD3GKAPNP+CWfxC8CxfBXxZoU+vWUGow+KL68e3lnSKQW91FCIZNrkHa5jcA+qkVD/wVe8eeCrv9nHTvDdnrtlc6pf65azQW0M6SSvHbxy+a4VCTtTeuSeMsB1NfzsanaLYald2KsXFtNJGGPBIRiM/pVe3iE9xFCTgSMq59MnFAENFf1A6L/wAEtv2SLDSLKy1PRL/VLuCFEmupNRuYnnkVQGkKRSKiljzhQAOgr4T8L/sJ/BjUP2+PE3wNvXvpPBejaGNeis/OIkYzGBBbNOMSeWjTlgwO8hQCTySAfjVRX9LvxL/4JjfsqW/w98R3fhzSL7R9TtbC4ntrtL+4nMUsKGRT5czsjAlcEEcgnBBwR86fsLfsFfs+/GL9nnR/if8AEuwvNY1fXbm94W7mto7eO2uHt1RFhZd2fL3lmyctgYA5APx2+DWr6boHxf8AA2va1cLaafpuu6Zc3Mz52xQw3UbyO2MnCqCTgV/ZHB498C3UEd1beI9NlhmUOjpdwsrKwyCCGwQRyDX4Y/tr/sJ/BT4W6x8Kk+GgvdDh8Z+IbbQL2Jp3u1CXLjE6GZmYOgJG3O1uOAQc/eMH/BL39j2GCOKTw1fTsihTI+qXYZyBgs22RVyepwAPQAUAfgz+274k0Dxd+1X8Rdf8L38OqabcX6LFc27b4pDDBFE+xhwwDqwyMg4yCRg18rV+zPwD/YQ+C3iv9rD4wfC/xY9/qfhn4f8A2b7DbecYXl+3rvXzpYtrnyV+Ubdu4/McfdP0L+03/wAE5f2Z/BfwF8beNvA+mXuja14c0241G3mF7PcKzWqGQxvHM7KVcDaSMEZyDxggH1R+xF8RvAF7+yv8Ore28RWDTadpcVncxtcRo8NxDxJG6sQysp9RyCCMgg18vftlfFP4b2v7YH7Nk83iWwEXh++vLjUZFnVo7SK7e3SF5nUlUDmNup4AycDBrK/ZU/4J1/s1+PPgB4N8d+PNNvda1vxHZJfzy/bZ7ZE87kRJHC6rtQcZOWJySegHw5/wUh/ZZ+F37NniPwVP8LIrmysfE1te+faTzPcLHJZNDh0kkJf5xNgqSQNuR1IoA/pBk8deCIo2ll8Q6ciICzM13CAAOSSS3AFfx2/H/W9J8S/HX4i+I9AukvtM1TxFqt1a3EeSk0E13I8ci5wcMpBHtXkdFABRRRQAV+uv/BH3w7rN78afF3ia3naPS9L0UQXEayYEk13Ohh3J/EAIpDnscetfkVX0p8Gv2rvi78A/BXiPwX8MLu30oeJpoppr4QK97F5aMmIpGztBBB5B2kZXBJoA/p9+Nn7VPwM/Z9jiX4leJYrW+nI2WNuDc3hU4+Ywx5ZV5+82Ae2aoeB/2xP2ZfiFb+d4d+Imkq6xRzPFeTiykjEg4DLceX8w6EDODX8h+r6zq/iDUrjWddvZtRv7tzJNcXEjSyyO3JZnYkkn3NZtAH9CH/BSLxz8Ltd0/wCE3j/QfF+m6x/wifieCS4tdPu4LqY28pWR5Asbk4TyAOmCWHNfr/ZXcF/ZwX1q26G5jWRD6q4yD+Rr+HCv6Sf+CaX7WOifEz4caf8ABLxbqCQ+MvCsHk2iSna19p8X+raMnhnhX5GUc7QGwfmNAH6n0UUUAFFFFABRRXxd+25+1Pof7NfwqvXsryJvG2uwvBo1nuPmhn+RrogA4SEHcCcBmAUHrgA/nk/bg8Tab4t/at+JGsaSWNuupta5bHL2kaW7kYJ4LxnHqK+U6muLia6nkurhzJLMxd2PVmY5JP1NQ0AFfuX/AMEfPG3hDRdG+I/h3WdZtLDU7m4sbqKC4mWJ5II0kR3XeRuCsyg46EjPUV+GlFAH9R//AAUZ+IfgSP8AZF8a6P8A8JBYvfaybG2s4EuEkknmW8hmZUVSScRxux7ACvff2d/iV8PdX+A/w+u9O8SafNEmhadAxFzGCstvbpFKjBmBDI6srAjIINfx50UAfqf/AMFavF3hfxR8ffD1t4b1W21OTSNBit7sW0iyiGZ7iaVUcqSAxjdWxnOCPWvywoooA/od/wCCSPjzwVYfAPxH4W1DXLO01a18Qz3cltNMkUqwXFtbpHJhyMqzROAR3U57V0P/AAVZ8eeCrn9mu18O2mu2Vxqmoa1aSW9tFOkksiW6yGVgqEnam5ck8DIHUivlH/gnZ+xR8Efj/wDCjXfiL8VbS71W6j1eTTbe3juZLaKFLeCKUvmFlZmczYO44AUYHJrc/wCCgP7DnwI+B3wYs/iL8LrK70jUINUt7OaN7qW6iniuVb7wmZirIUypUjOSCDwQAfinX6Vf8EqfFfhrwr+07ct4l1O30tdU0C9s7ZrmQRrLcGe3lEYZsDcUjcgEjOMDnAP6p6B/wS4/ZKstDsLTVdFv9VvIoI1mu5NQuYnnkCjdIUikVF3HnaowOlfCug/sK/Bi8/b81z4F3TXz+CtM0L+3o7PzyJS0nkoLYzj955atMWDZ3kKFJPLEA/aH4p/E34daF8NvFGrav4m062tLfTbovI11GcbomUABWJJJIAABJJAAJNfG3/BMf4geBl/ZO0LQJdfsYtS0i81GO7tpJ0jlhaa6kmj3K5BwyOGBHB6ZyCBW+In/AATE/ZSi8B+ILjw/o99pGpQWNxNb3aX9xMYZYkLq3lzOyOMjBBHIzgg4I+aP2Ev2DP2f/jL+z9pvxP8AibY3msatrV1eKFW7ltoreK1meBURYWUsW2bmZieuAAByAdR/wV78c+DdV+GfgfwxpWt2d7qp1d7z7NBMssgt0t5IzIwQnau9gozjJzjODj8DK/Z/9t79hT4J/Cm5+GE3wyW80NPFviK20G8jed7tNl0cidDMxYOmCNudrZHQjn7vtv8Agl5+x9BbxQy+G764eNVVpH1S7DOQMFmCSKuT1OFA9ABxQB+dv/BIXxl4U8N/Enx3pPiHV7bTbvVtNtTaR3Mqxef9nldpQhbAJUMCRnOMkDAOP1m/a++I3gCw/Zh+Jy3fiPT0a90DULOBRcxs0txdQNFDGiqSSzuwAAHucAEj+Z39qf4WaD8FP2gfGfww8MTzXGk6JdIts1wQZRFPDHOEZhgMU8zbuwM4yRk18/0Af1f/ALDXxH8AXv7Kvw8tbfxFYGfTNOSzuo2uER4biEnfG6sQQwyDyOQQRkEGvmn9tT4qfDa0/au/Zqmn8S2Aj8Pand3Wous6ulpBcyWqxSTMuVRWMb9TwFJOBzX861ewfs//AA90v4sfGvwX8N9buJbXT/EOp29pcSQY81Ynb5thYEBiOASDjrg9KAP7D38c+CY0aSTxBp6qoJJN3CAAOpJ3V/Ht+0Xr2j+Kfj98R/Evh67S/wBL1TxFql1a3ERzHNBNdSOjqe6spBHtX9Fj/wDBL/8AY8ZGVfC96hIIDDVLzI9xmUj8xXwL+x/+wn8F/iL8UPjP4b+Ihvdc0/4d62+iWMYna18xVmmXz5WgKsX2wgbQQvzE4PGAD8Z6K/ev9tL/AIJ/fs7fCv8AZ28TfEv4c6deaNrPh02s6Mbya5jmSW4jt2jdJ2cAYl3ArggqOcZB9W+B/wDwTU/Zc134P+DfEPizSb7WNX1nSbO/ublr+4g3SXkSzFRHC6Iqpv2rgZwASSckgH831Ffsv8SP2EPgxo/7c3w9+CmiPfWfg/xZpkuq3Nr5xkkQ2SXDNDHM+XCTeQNxJLLubaRxj7y1H/glz+yHd2Fza2fh+/sZ5onSO4j1K6d4XZSFkVZHZCVPIDKQccgigDw3/gkf478F6d8CPE/hfUdcs7TVrfxDNdyWs0yRSi3ntbZI5MORlWaJxkZ5XntXVf8ABVbx54Kuf2aYPDtrrtlcanqOs2j29tFOkksiQBzKwVCTtQMMk8DIHUivmD9gf9hr4H/GnwR4w8W/FGC71mfS/EFzo1tElxJaxxx2ccTmX9yyszyGXBBOAFGOpq5/wUB/Yc+BHwN+Clt8R/hdZXekajbanb2ksb3Ut1FPFchvvCZmKshXKlSM5IIPBAB+KNfpN/wSs8V+GvCv7T8reJdTt9LTU9BvbO2a5kEaS3DTW8ojDNgbikbkAkZxgckA/qr4c/4Jc/sl2mgadbatot/qt7Hbxie7k1C5iaeTaN0hjikVF3HnaowOlfiN+3P8DPB37Pf7QGoeAvAbz/2JLZ219BFcP5jwfaA2YhIfmdVK/KW+bBwSSMkA/p3+JvxN+HWg/DvxLq+r+JtOtbS2066MkjXUZxmNgAAGJJJIAABJJAAJIr4t/wCCYnxA8DJ+yjougS6/Yw6lpN9qCXdtJOkcsJmuXlj3K5BwyMCCODyM5BA/mYr9yP2EP2DvgB8ZvgBp/wATvibY3msarrF3dqqpdy2sVvFbTNCqIIWUsW2lmZieuABjkA9t/wCCkvxN+HtuPgxZt4isnuLHxlY6pcRxTLM8VjbZEs7iPcQilgOeTztBwcfpra/EDwJe20V5Z+I9NmgnRZI5Eu4WV0YZVlIbBBByDX4Ff8FHP2Nvgz+zx4I8K+N/hTbXWmSajqLadc20txJcxSBoXmWQNKWdWXYVIBwQegI5/IqgD7H/AOCgHirw540/a9+IXiDwpqMOq6bJNYQJcW7b4nktNPtreYKw4YLLG65HBxkEjBr44oooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//R/GOiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiir2mKG1K0VhuBljBB5B+YUAdnYfCX4q6rZQanpfgzWryzukWSGaHTrmSORGGVZHWMhlI5BBwa+hf2Of2iU/ZF+NV94r8W+H7m/t7iwudIv7Vf3N5b7pY5cqkm0b1khVWVyOC3cCv6zLe3t7O3itLSJYIIFVI40UKiIowqqo4AA4AHSv5dP8Agp/bW9t+1/4k+zxJF5tlpsj7FC7na2TLHHUnuTzQB9w/E7/grf8AC/xL8O/Enhvwt4K1j+1dXsLizgN61vHbq1whjLSGOR3woYtgDkgDIzkeMfsf/wDBSXwL+z/8EdM+EvjbwpqN/Nok90be505oWWWG6me4PmLM6FXV5GX5cgqAeDmvx+ooA/VD9rL/AIKHaB8cNb+HF74E8K3NlbeA9Zg11jqciB7i4t3UpCFhZwsZC/M27cSeAMZP2dF/wWK+CpiQz+CPEKSFRuVTaMobHIDGZSRnocDPoK/nhooA/Uv4I/8ABQ/Rfh7+0b8TvjH4o8JTzaR8RzC32ezmVrm0NnlYOZCiSbkJ8zlfm5Xj5T7d+0P/AMFTvh18UPgz4r+HHg3wdqsGo+JrKTT/ADtQaBIIYpxtkk/dSOzMFJ2rgDPJOBg/iNRQB+2f7OX/AAVK+Hfwq+C/hb4a+M/B+qXGoeGrVbETae0DwzRRcRviWRGVyv3hyMjIODgeN/HT/goZpHxM/aF+FfxX8HeEbhNN+HEs0i215Kq3N494VWZR5RdUARAIz8x3ElhjAr8sK+sP2GLW2vf2tvhlBdwpcR/2oG2SKHXckUjKcHIyrAEHsQCORQB+3Fz/AMFJLOC3ln/4Uf4+HlozZk0wInAz8zbjgepwcV8AfsZftwXPgDx38UtR1D4e6r4l/wCE+1OXX2h0CM3U9nLLM5ZGRsZhHm4D5BBABB3cf0X1+YH/AAT203T7L4mftLfZLSK38nxvdQJ5capsiSe52xrgDCL2UcDsKAPlz9tr9uz/AIWZ8BtU+GVp8L/EnhgeJLi1ikvdetfskKJbzLdYiwW3yM0QGDgBdx6gV1nwq/4K1/DDwp8NfDPhbxX4L1g6roun29jM1k1vJbubZBEroZZEf5lUMQV4JIyQMn7O/wCCk1rb3H7Gnj2SeFJWtjpkkbMoYxv/AGjbpuUn7p2sVyOcEjoTX8p9AH6peI/+CgFl4v8A20/B3x88P+DLufStCsRocGnbw2oXMV15okdVTcnnb7hhHGCQ21QSCxx+gfiL/gpfDpOgalqlv8E/G8Mtpbyyo99YC3tVZFJBnlBYpGCPnbacDJxX5T/8EyLa3uf2xPCQuYklEdtqci71DbXWzlKsM9CD0PUV/UvNDDcQvb3CLLFKpV0YBlZWGCCDwQR1FAH8TemeF/Gfj/UNQvPC2gX2sOshlnWwtpbnyvOZiu7y1baDg4z1wai1zwf4z8EzWk/ivQL/AEUzsWhF9ay23m+WQW2eYq7sZGcdMj1r+jj/AIJV2dpb/APxTNBAkUj+LtSRmVQpKxw2+1SQOQuTgdsnFV/+CtNtby/suWtzJEjyw+ILHY5UFk3RThtp6jPfHWgDzPRf+CxXwnbSLI+IPA2txan5KfaUtWtpIBNtG8RM8qMUznaWUHHUV8keCf29Yrj9t7WPj1pvge+1PTfEmlnQo9LtD52pfZ4hE6Soi/K0paAFkB2hSwDEgE/lPX6of8Eh7W3n/aY1uWaFJHtvDF48bMoYxsbu0QspP3SVYrkc4JHQmgD7c+LP/BSNY/hr4kSy+DXjDT57iylt0uNWsvs1jE1wPKDzSqWIUbugHzHC5Gcj5R/Y9/4KR+Bf2ffgnp3wm8beFNRv5dGuLp7e505oWWWK6ma4PmLM6FXV3YfLkFQOhzn94fifaW198NvFdneQpcQTaVfK8cih0cGB+CpyCPY1/FBQB+qH7Wv/AAUN8P8Axz1X4dXHgTwrc2Vv4G1mHXXOpyIHuLi3YFIQsDMBGQDubduJPAGMn9FLH/gpPZ3ljb3f/CkPHrefGj5h00SxHcAfkfcu5fRsDI5wK/nw+BNtBefG/wCHtndQpcQz+ItJjeORQ6OrXcQKspyCCOCCMGv7Q6AP5tvg3/wUJ0r4cftL/FD4weLfB9y2mfEExK9payqbuyay+SEHzdiOSuRLkrhuV4G0+2/tCf8ABVD4c/E74NeK/hz4N8HarDqPiaxl0/zr9oEghiuFKSSfupHZmVSdq4Azgk4GD8A/t8WtvaftffEyG2hSBDfxPtRQg3SW0Ls2B3ZiWJ7kknk18g0AfvH+yj/wUBHhH4EeGPBF78J/FGvyeGoP7OF7odp9rtJkh+6SzFSsm0jevIzyDg4Hxb/wUI/abm/aN8ZeE9Ng8Gap4Ri8M21xsh1eIw308l+0e4mIZAQCFQhBJYlvYV+8X7E1rb2n7J/wvjtoUgV9Ft5GCKEBeTLMxAxksSST1JOTzXzH+2PpthcftkfssS3FpFK82pairs0asXWF7V0DEjkIzFlB+6SSME0Afz5SfBn4wRRtLL4F11EQFmZtMugABySSY+AK81r+5iv40v2k7W3sv2iPifZ2kKW8EHifWUjjjUIiKt5KAqqMAADgAcCgDxSiiigAooooAKKKKACtjw94h1zwnrdj4l8NX02marpsqz21zbuY5YpEOVZWHINY9FAH9Af7M3/BVrwnr9na+Ff2i4f7D1ZNsa6zaxlrKcfKu6eNcvC+clioKey9K/WTwd8QvAvxC0qPW/A2v2OvWMm3EtncJMoLKGCttJKtgg7TgjuK/iYrT0nW9Z0G9i1HQ7+fTruBg8c1vK0UiMO6shBB9xQB/cLWJr3ibw54WsJNV8Tara6TZQ7Q893OkES7jhcvIQBk8Dnk1/HB/wANA/Hf/ooviL/wa3f/AMcrgfEHivxR4svX1LxTrF5rF3IAGmvLiS4kIXoC0jMeO1AH9pnjXXL/AETwNrviTQIkvbyw065u7WMklJZIomeMfLkkMQOnXtX8avxS+KHjn4xeN9R8ffETUZNS1nUXJdm4SJB92KJOiRoOFUcD65NfSf7N/wC3d8bf2dWt9Gsb3/hI/CcbfPpGoMzRohzuFvL9+E854yueqnnPx7rV/FqusX2pwQC1ju55ZlhDFhGJGLBQx5OM4yeTQBmUUUUAFbvh/wALeJvFl2+n+FdIvNZuokMrxWVvJcSLGCAWKxqxC5IGcYyRWFX72/8ABGm2t/8AhFPibeeUnn/bdOj8zaN+zy5jt3dcZ5x0zQB+IHiD4f8Ajzwlax33irw3qWi20z+Wkt7ZzW6M+CdoaRFBbAJwOcA1yNf1df8ABRu1trn9jb4hSXEKStbpp8kRdQxR/t9uu5c9DtYjI5wSO9fyi0AWLSzu9Qu4bCwge5ubl1jiiiUvJJI5wqqq5JYk4AHJNd3e/CL4sabZz6hqPgrW7W1tkaWWaXTblI440GWZ2aMBVAGSScAV9Y/8Ez7a3uf2yPBS3MSShItTkUOoYB0sZyrDPQg8g9jX9UEsUU8TwToJI5AVZWGVZTwQQeCCKAP51v8Agnz+2U3wO+H3iD4bXHw91zxhCdR/tNJ9Bg+1SRNcxJCyTocBV/cKUYHklgRwK2/2+P21T8Y/hXpfw3tfhxr/AISS71FL2S51+3+y7xaKcJAoJ3kmT5ySNoxwd2R9uf8ABLCxs7b4LeOJ7e3jikfxnqcTMiBWKRQW2xCQM7V3HaOgycdTTv8AgrFbW8v7K63EkSPLBrtgY3Kgsm5ZQdpPIyODjrQB5NoP/BYn4UDRLAeIvA2tRaoIIxcraNbSW4mCjf5TSSo5TP3dyg4618leEv29ILz9uHUPj7pfgi+1LTNd0s6FHpdqfO1I26CN1lRF+VpS0ILIDtCkgMSNx/Kmv1E/4JHW1vP+1DqUs0KSPb+Gb6SNmUMY3NzaoWUn7p2sVyOcEjoTQB92/FL/AIKSrB8OvEX2L4M+MbGeWymhjn1Wx+zWMTTL5YeeVSxVQWzgDJOBkZyPnH9hj9uT/hVPwRg+F938M/EXioaDd3DR3mg232tCl3I0+2cErsdWZgMEgrjgEHP7h/EW1t774f8Aiazu4UuIJtMvEeORQ6OphYFWU5BB9DXxb/wTBtbeD9jvwtLDCkb3N5qkkjKoUyMLyVAzEfeIVQuTzgAdAKAPzd/bb/bguPiVqHw6s9O+Hmr+F/8AhEtXh8QAeIIjay3Uts2I40jUn90edz5znAAGCT9U23/BYv4LtbxNd+B/EEc5VTIqG0dFfHzBWMqlgD0JUZ9B0qP/AILGWtu3wd8C3rQoZ49eeNZSoLqj2shZQ3UBiqkjoSBnoK/nooA9n/aG+LX/AAvX40eKviwun/2VH4guVkjtd/mGKKKJIYwzcZYogLYGNxOOMV4xRRQAV6b8GPiJN8Jfiv4U+JVvYjU38OahBefZSxTzhG3KBgDgkdDg4PY9K8yr6Y/Y0tre8/ao+F9vdRJPE2u2hKOoZThsjIORwRmgD90pv+CkVnFC8v8Awo/x+Nik/NpYVeB3O44HqcV+cH7Lv/BQzQ/g38Q/in4u8c+FLi6tPiTqj6zs02RGktbhpZX8rExQNHtlPzZDAqODn5f6Ta/jc/ahtbax/aS+KVnZwpbwQeJ9XRI41CIirdyAKqjAAA6AUAfo7+1h/wAFMfAPxy+B+u/CfwV4S1OzuvELW8c1xqDQrHDDDMk5KCF5Czlo1UA4GCTnIAP0B8Bv+Ciy6f8ABzwjot58H/F2rS6Pp0GnG70ey+1WUwslFuHjkJUkkINwx8rZXJxk/wA9tf2cfs9W1vafAX4cQWsSQRjw5pJCIoVQWtI2JwMDkkk+9AH4V/Er9ui61L9trwV8YYPh/qVjF4RtBpA0e9UxapcJfJIsjeUAQsuLk+SmSGwuSN3H3rrv/BS230vRNQ1KH4JeOIpLS3llV7zTxBbKUQsDNKC2yMY+dtp2jJwal+LWl6bN/wAFPvgvJNaQu0nhrUZWLRqS0kMV8Y3JI5ZCBtPUYGK/TeWKOaN4ZkEkcgKsrDIYHggg9QaAP5v/ANjD/goX4W/Z08KeKPCXjnwveajDrWszazBNprxllkukRJYnSZ0G1fKUoQSTkgjpVv8AbW/4KG+C/wBpP4VWvwz8E+F9Q00PqEN7c3OotENq24bYkSQu+SxY7ixGAOAc5H5h+MYo4PF+uQxII0jvrlVVRgKBKwAAHQD0rm6AP6CfD3/BYf4UpoOnx+IvA+tRaokEa3K2jW0luJgoD+U0kqOUz03KDjrX5RftUfGy6/az+PNz428J+Hrm2W7ggsLCxQG4u5Y7cMQzrGGzI2SSqZAHGTgk/KdfqB/wSRtref8Aajv5ZoUke28N38kbMoYxubi1QspP3TtZlyOcEjoTQB+fmq/Cv4n6Fp82ra34P1jT7G2G6We40+4iijBOMs7oFAyccmv04/Y3/wCCjvgj9nn4M2vwo8beFdR1B9LurmW2utOeFhJFcyGYiVZnTayuxAKkgrjgEHP77ePrW3vvAviKzu4UuIJ9Ou0eORQ6OrQsCrKcgg9CD1r+JSgD9Mf26/26/C37VHhXw54M8GeG7zSLLSL1tQnuNQePzXl8tokjRImdQu12LMTknAAGCT+Z1FFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB//0vxjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD76/ZU/YB8d/tSeDNR8e6b4isfDuk2d4bGIzxvPJPNGivL8iFdiqHTBJ+Yk8DGTY/aj/4J9/ED9mLwhpfjq78R2PiLTb2+SwkNvG9vLBPKpaH5XJ3K21skEbSBwc5H3l/wS8/aD+CngL4Dav4K8d+M9L8N6xb63cXhh1O5jsw8FxDCqNG0xVX5iYMFJK8ZAyM6H/BTH9on4IeNPghonhHwT410vxHqs2vWl55OmXMd5sgtUkEjyNCWVOZFChiC3O0HBwAek+Ef2b/APgoZp/hXSLG4/aFt9Okt7SFGtpNNhvXgKoB5bXMkZaYp0LkktjOT1r8zda/Y9+P3xm/bE8T/B7x34sttS8T29sdWv8AXLhi8b2JEYhkSFcEE+bGghUAR5wPlXNfvhpH7Xv7L+taXaavbfFLw7BFeRJMsdzqVvbzoHAIWSKV1dHGcMrAEHgivzm8FftNfAmD/gpN418c3PjCyh8Nar4bTRrbVJH2WL3kBtXdftDYQJiFwshOxiAFJ3DIB88/EH/gkl8S/BfgjXPF+neN9M1ibRbSW8+yfZ5bczJAu91WRmZVbYCRkYJwCRnI/JOv60PjN+1j+zVB8JPGXkfEvQL+abSb2GK3stQguriWWaFo0SOGF2diWYDgcDk4AJH8l9AG54Y8O6p4v8S6T4S0RFk1HW7uCxtldgitPcyLFGCx4ALMMk8Cv19i/wCCNvxCaJGn+I+lpIVG5Vsp2AbHIBLjIB74H0r8qvhB4g0rwl8WfBPirXZDDpuja3pt7dOql2SC3uY5JGCryxCqTgcmv604f2r/ANmOeJJ0+K3hgLIoYbtXtVbBGeVaQEH2IyO9AH8lfxY+GniD4O/EbX/hl4qaJ9U8P3Jt5ngbfE/AZHQ8HDIwYAgEZwQDkV55X0n+2D448L/Ej9pfx/418GXo1HRdSvwba5VSqyrFEkRdQwB2lkO045GD3r5soA/UT4H/APBLj4j/ABk+GGh/E2bxfp2gQeIYftVtavDJcyC3f/Vu7IyqC452jOBjJzkDwb9pP9mX4lfsSeOvCt8PEkV1cagr3umanpxe3lintHUSDaTuRkLoQckMG9iB+3P7Hf7UX7PGnfs0eANC1v4h6Lo2p6NpkNjd2mo30NnPFPANrDy5mVip6qwypHQ9QPzm/wCCrvxl+F3xU8VfD7Tfhv4ks/EraFa6g95LYSrcW8f2t4PKXzoyUZv3TFlBJUYz1FAHzHL/AMFC/wBsiWN4m+JNyFcFTts7FTg8cEW4IPuDkV7d/wAE/Phv+1H8TdR8beKfg38Sv+EJgDRLqd1dIL9r27mYyKWhlVwXA3MZj83OATubH5hV+03/AASj+OPwj+GmgePvDfxE8V6f4Zvb+5tLu3/tKdLWKWKNGjfZLKVQsGYfJndg5AIBwAWv23/gb+2Z4f8AgTfeJvif8YIvHPhXSrq2kvrCG1j08gSSCKKQ+UiecFldBsYnBIcD5cjzf4cf8ElviX468B6F4z1DxtpujS65aRXotDby3BijnXfGGkVlUsUKk4GASRk4yft3/goP+0r8BPE37K/ivwb4U8eaRr+ta7JYQ2trpt5FeyFobyG4dnELNsQRxN8zYGcL1IFfQfwO/av/AGa5fg34JS5+JWg6fcW2j2NvNb3uoQWlxFLbwrFIkkMzK6kMpxkYIwRkEGgD8ULD9jn4+fBf9r/wl8IPAviq2sPE99Cuq6brlu7RxpZoJPPkeI5Y7fKkQwtkSAYPytx+nPif9nD/AIKG33hvVbO3/aItr2We1mRYE0yGzaVmQgItxHEHhLdBIvK5yOleQfEP9pz4E3H/AAUf+Hvji18YWVx4b0Tw/NpF3qkT+ZYx3d0Lpox565QoPPQNIDsQk7iNrY/RvU/2uv2X9J0661S4+KfhyWK0ieVkg1O3nmZUBYiOKJ2d2OOFVSxPABNAH40fsC/Bf9rjxT4J8T698IvijH4A0JdUa0lhmhTUBcX0CAzOIpFdYyFdAXGDJwDkKKX/AIKBfBv9rXwh8NNF8S/GT4px+P8AwzBqHkG3it0sBBczITFI0UaIs2QrgMclOwwzGvor/gml+0X8D/Bvwg8UeFfGnjTTPDmpnxHeagkWp3KWXmW11FCsbxtMVV+Y2DBSSvGQMjMf/BT39oT4JeOvgBp/grwN400vxJrF3rNtcrBpl1HebIbeOQO8jQlljGXULuILc7QcHAB+ANd58N/id4++EPimDxr8Ntan0HWrdHjW4g2nMcgwyOjhkdT/AHWUjIBxkAjg6KAPrTxR+3T+1j4y8PX/AIV8Q/ES8n0zVImguI4oLW3Z4m+8vmQQpIAw4O1hkZB4JFfJdFFAHReENJ1zX/FuiaF4Xcx6zqN9bW1kyyeSVuZpVSEiTI2EOR82RjrX9IVh+zt/wULhsbaGX9o+1R0jRWU6PBNggAEeY8W58f3m5PU81/O58Jdf0vwp8VfBninW5DDp2j61p15cuql2WC3uY5JGCjliFUnA5Nf1q2/7WP7MVzBHcx/FbwwElUOA+rWqNhhkZVpAyn1BAI6EUAfykfH7wt4/8FfGXxd4Y+KWo/2v4qsr5xf3vmmb7TJIBIsoc8kOjKwBAKg7SBjA8gr6X/bF8c+F/iT+0z4+8a+C70alouo3y/ZrlVKrKsMMcTMu7BKlkO09xg96+aKAPpv4eftlftNfCrwra+CfAfjy703RLEsYLZoba5WIOclUa4ikZVzyFB2gk4HJqbT/AIlftF/tQfHDwVDf+MLm+8aNdwWmj3ksi2iWTl94kQQKix4I3MyrubA6kAV8vV7/APsr+MfDnw+/aK+H/jPxddiw0bStWglurgqzCKPJUuQoJwM5OAeKAP3quP2eP+ChMkEiJ+0jaFmUgD+xbdMkj+8sWV+o5HUV/OH4+0TxJ4a8c+IvDvjKUz6/peo3drqEjS+eXu4ZWSZjKSd5LgndnnrX9dcn7V37McUbSv8AFbwxtQFjjV7Rjgc8ASEk+w5r+Tn44+JtH8afGnx74w8OzG40rXNe1O+tJGUoXgubqSSNirYK5VgcHkd6APLaKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAr9Lv8Agnf8K/2lfHl54u1f4FfEFPh/YWUdvBfzSxLdpcTSEtEgtnVkyqqx8wgFc7RwzV+aNfs9/wAEovjh8JfhlpPxA8OfEXxVYeGbzUp7K6tjqM6WsUscKyI+2WUqhYF1+TO4jkAgHABs/ttfAz9s/QfgPqXiT4l/GGLxx4V0q5tpb/T4bSPTjseQRRyN5SL5wWV0/dscZIfGV4/Eiv6T/wBv79pj4BeI/wBljxf4P8LePdH1/WdeNlb2lrpt5FeSs0d3FOxZYWbYgSJss2BnAzkgH+bCgD6F/ZW8H/E7x38evCnhz4Pa1/wjnimWd5bfUS5QWyQRtJM5AB3gRK2YyCH+4Rgmv3R8R/s5f8FDLzw9qdpb/tE215LNbTIkKaXDaNKzIQEFxHFviLdBIvK9RyK/G/8AYH+IXg74X/tT+D/F3jzUo9H0aIXtvJdTZEUT3VrLDGZGGdq73ALH5VHLEAE1/STqP7XH7MGmafc6lcfFPw3JFaxvKyw6pbTysqAsQkUbs7sccKoLE8AE0Afy3/DX9o34+/s/Saxofw38XXWgreXBN5Aqw3MTTxEoXCzpIoc9CygFgBkkAYb8V/2n/j58dNKs/D/xS8YXOu6dZzGaK2aOG3i80jaHZYI4w5A4Uvnbk4xk58a8Q3kGo6/qeoWpLQ3N1NKhIwSruWHHbg1lRsFkVj0BBoA/YXQv+CO/xP1DRrG+1jx5pem31xDHJNai2lnEEjKC0fmKwD7TwSBg9uOa8e+Ev7KH7RPw2/bJn+DXw48YW/h3xPodjJqDa3Cd0B0yRUG4wMD5m9pEUwsCA3PRQ1fu74f/AGvf2X9Z0PT9Vt/ij4et47uCORY7rUre2nQMoO2SGV1eNx0KsAQa/Onw5+0x8C4f+Cl3iPx3N4wso/DN94ZGiQ6qzhbBr2NreRl+0HCBMRMBJnYWAAJyCQDvfi3+zp/wUBuPhn4miufj5BrsH2CZpbCOwh097qJV3SRLcxxq0ZZQR1AP3SQCTXzj+wn8Ef2xfEvwVHif4U/FyLwJ4V1K9nNpZTWyahveFjHNKqSI4hBkUjaCCxBYjoT+o/xM/a3/AGZdP+HniW6/4WboF6y6fcqsFnqEF1cSu8ZVUjhhdndiSAAB7nAya+SP+Ccn7SHwI8Jfsw6N4K8YeOdJ8Pa3ot3frcW2p3cVk+Li5knjaPzmUSKUccrnByDzQB8Zft3fAf8Aay0+58AxfFn4iRfEW013UBpWmqiJYR2+oXJARWgVUQ+YP+WvJABDEDGe2tv+CN3xFe2ie7+IulxTsimRFs53VXI+YBty7gDwDgZ9BXsv/BQb9pX4GeILn4P2vhbxjYeIX0LxZZ61fHS5lvUgsrY4dneEsofn5UzuOCcYr9Grb9rH9mK6t4rqL4q+GQkyq6h9WtY3AYZG5HcMp9QwBHQjNAH8mfxf+F3iH4LfEvX/AIXeKnhl1Pw/ceTLJbtvikDIskboTg4dGVsEAjOCAQRXm1fT/wC2d478K/Ev9p7x9418E3y6nomoXkQt7lAVSUQW8ULMm7BKl0bae4wRwa+YKACvSPg/4c8aeLvil4W8NfDq8On+JtR1C3i0+5ExgMFwXGyTzF5XYecjJ44BPFeb17x+y/4w8PfD/wDaF+H/AI08WXX2HR9I1e2nupyrOIolbDOQoJIGcnAJxQB++c37PH/BQh4XRf2kbQllIA/sW3Xkj+8Isj6jkV+SPwP/AGEvi5+0V8Q/iHoes+ILXSb/AME6hLZ6ve3bveyTak0rq4Uqdz7ijs0hbnjqScf0OP8AtW/syRo0jfFbwvhQScavaE8egEmT+Ffm3+w7+0x8C9J+MH7QOo+IfGFjoVp4w8Ryavpc2pyCyiubQz3BDB5tqh8SofLJDYOccHAB8bftE/8ABNH4hfAD4Wal8VX8V6f4gsNGeH7ZBFDJbypDNIIhIhcsHxI6grwcEntivn/wb+2/+1T4A8M6f4O8K/EG7tdI0qMQ20MkFrcmKIH5UEk8Mj7V6KCxCjCjAAFftR+3z+0v8AfEX7LHjHwj4X8faPr2s66LO3tLXTbyK8lZ0uopmLLCz7FCRsSzYXOBnJAP81dAH2H8KfFH7SX7UP7T3hS807xtcD4gTyAWurTusS2cFpG0shWONQgRY1ctEqYkJIYEuc/sp4h/Zy/4KGXegala2/7RVtdyzW0yJCulw2jSMyEBBPHFviLHgSLyv3hyK/Gr9gv4h+D/AIXftT+DfGHjzUo9I0aE3tvLdS58qJru0lgjMjD7qb3Xcx4UckgAmv6TtQ/a3/Zg02wudRn+KnhuSO1jeVlh1S2mlZUBYhI43Z3Y44VQWJ4AJoA/nu/Zj/YB+I37TmjeIfFUXiGy8PWei6jJpjvcq9zLPeRKrzDbGwwEDp8xPzFuOhqb9qX/AIJ7+PP2YvAVr8Rb/wASWPiLS5LtLO4EET28sLygmJgrlt6sVIOCCOOCCSPvj/gmx+0b8D/CHw58c+G/GfjPTfDmoXPii81SFNUuEshLaXcUKRvG0xVWOYm3KCSvGRyKuf8ABTb9ob4IeN/2eIPBngjxtpXiPWL7V7WZINMuo7wrFbhzI8hhLCMfMANxG4njODgA/n2r65/Yk8B/GP4g/Hix0v4IeJh4P16zs7m7l1NjuSG0TakgaIgiYMzovlkEEkMcBcj5Gr9CP+CZ/wAUPAPwp/aQk1j4i61BoGnanot5YRXV0wjt1uHlglUSSH5YwVibDMQM4GckUAfpP8Vv2c/+CgVz8NvEsM/x9t9chNjOZbGPT4dPe6iVSXiW5jjVoy6gjOQD0JAJNfzoV/XP8R/2uP2ZNO8AeIrz/hZvh+8KWFyFhs9RguriRmjKqkcMTs7sSQAAPc4GTX8jFAGtoGiaj4m13TvDmkIJb7VbmG0t0ZggaadxGgLNgAFmHJ4FfsBa/wDBG74jSW0Ml58RNKhnZFMiLZzuqOR8yhty7gDwDgZ64FflB8M9b07w18SPCniPV3MdhpWrWN3cMql2WGCdJHIUckhVPA61/W9bftZfsw3dtFdRfFXwyEmRXUPqttG4DDI3I7hlPqGAI6EA0Afyd/Gr4S+JPgX8UNf+FPi54ZdU0CZEeSBt0Usc0STwyKeoDxSI2DyucEAg15dX1j+3L8QvCPxU/ap8eeOPAl+uqaHey2UMF0gISU2djb2sjJkDKeZE21ujDDDgivk6gAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD//0/xjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKK+itK/ZG/ab1zTLTWdJ+Geu3NlfRJPBKtm+2SKRQyMMjowII9q8R8SeGvEHg7Xb3wx4r06fSdW06QxXNrcxtFNE46hlbBHqPUcjigDDr+hD9gH9j79nb4h/sy+HviB4+8HweIdc124v3nnu5JDsW3upbdEjVGUKoWME9SWJOcYA/nvr9RP2W/+Clmqfs6fCSx+E2o+BYvEtrpM1w9pcx35snWO5ladkkUwThyJHYhgV+UgY4yQD6Q/bp/Y/wDgH4L8RfBseBvD3/COR+LPFFpoWox2UrqktrcyLuYCQvtlXJCsOx5BwMfoVF+wb+yHFEkQ+GWmsEAXLNOzHHHJMuSfevw5/aa/4KHeJvj9rHgTUdG8JW3hmHwJqkWswRy3LXzT3sDho97COACIBcFAuTknd0A+sof+CzjCFBcfCUNKFG8rre1S2OSAbIkDPQZP1oAk/Zx/Y7+AWt/te/HDwP4h8Ptq3h7wO1mul2NzO7RRC/UyPu2lWfy8bY9zHA+9ubDD6O/au/Yk/Zi8P/s7ePfFHhfwRbaHrGhaXcahaXVnJKkiTWyF1B3OysjYwykcg8YOCPzr/Zj/AGxPjXL+0l8QfiR4O+Gp8dX/AMQI1uL7SNNMscltHafLA6TBJcKgba5dPnJGNpwK+m/2qf2wv2k9Z+BPinw7r37Pup+CNK1u3Nhd6tfzyXUNvBc/u3+UW0IVmB2qzPgEjgnAoA/ByivbvBX7Nnx8+I+gReKvAvgLV9b0e4Z0ju7a1d4ZGjO1trYw2DwSOMgjqDXK+LvhH8T/AAF4msvBnjLwtqOka7qQjNrZXFu6zziVtieUmMvuYbRtzzx1oA87or6Xk/Y2/apijaV/hZr4VAScWTngewGa+bJYpYJXhmQxyRkqysMMrDggg9CKAI6/qT+Cv7Cn7Ks/wh8GXur+ArTVr690myuri6u5JXmlmuYVldmIdR95jgAAAYA6V/LZX9CXwM/bR/aeX4QeErax/Zv1bxRaWmnw20GqWVzJbW93Dbjyo5Eja1lIyqjJDkMckYBAAB534/8A2PPgHZf8FC/AXwvsPD5tvCOv6DJrN1pkcziBri1FyFVckuIn8hC67uSWwQDiv0G1L9gP9kTUtOutO/4VzY2v2mJ4vOgkmSaPeCN8beYcMucg4OD2r8Z/i7+2l8XPDf7ZOifGvxr8Ox4Y1PwjYLpyeH755FmNjcJI0m+comZH892SQR7V+UFWwc/Qmp/8Fmb6XTbqLR/hVHbX7xOIJZ9YM0UcpB2M8a2kZdQcEqHUkcbh1oA/E/VrWOx1W9soSTHbzSRrnk4RiBn34rPr1vwP8GvjF8aJNT1f4deENR8SJbTZupLG2eSOKSbLBSw4BOCQM5xUPxD+B3xg+E1rZ3vxK8H6n4bttQdo7eW9t3iSR0ALKGIxuwc4znH0NAHlVfoD/wAE3Pgt8Ovjh8frzw/8TdM/tjStJ0S61FLRnZIpJ0mggXzdpDMoEzMACPmAzkAg+EaT+yP+03rul2mtaR8M9dubG/iSeCVbN9skUgDI4yOjAgj2r1P9kPxx8Zf2aP2j5rLQPh7eeJPFElrc6VfeH3jlhvTESk7bCEcxspiRtxRlKZ9QQAfuT8UP2C/2UJfhx4m/s/wDa6VdRadcyw3VpJLHPDJFGXR0ZnYZBUcEEEcEEV8y/wDBP79kD9nf4i/sz6D8QPH/AIQg8Q65rlzftNPdySHYtvdSW6JGqMoVQsYJ6ksSc4wBqfGD9tj9qO2+F/id7j9mzVvDcL2M0cmpXtzLc29pHKNjyyRLaxFgqsT99QOp4BFeAfsNftVftAeBfgfB4F8FfA/UPiNoeiXlylvqOnzSWyobhzcSQyHyJld1eQnKlcKQCOMkArf8FP8A9mP4KfBnwX4N8X/C7w7H4cvL7UJbC4jtpHMMsXlNKrMjlvnUrgMCOCQQeMfjPX6g/wDBQn9oj40/F208JeDfiL8Krv4aWVtLLe20d68lxPeTkeUSkhihXaitgoFJyQScYFfKcH7HH7U9zBHcQ/C3XzHKodSbKQEhhkcEZH40AfNVFeieF/hJ8T/Gviy78B+FPC2o6p4i0/zftNhBbO1xB5LbZPNTGU2t8p3Y5wOtdb4z/Zp+P/w88Pz+KvG/gDWNG0e1Kia7uLR1hj3nau9sYUEkDJ4yQO9AH7v/ALIn7FH7MviX9nLwN4s8WeCbfXdZ17T4766urySVpGln5KrtZVVFHCqB06kkkn4D/wCCon7Pfwl+B3iPwDe/CvQ18Px+IbbUFu7eF3aBms2g8t1VyxViJmDYOCAvAOSdj4Bf8FUdV+Dfwm8P/DDWfh7Fr7eHIBaQXcOomy326f6sPGbeb5wOCwYA9do5r5r/AGuv2tPEf7ZnizwrHaeFBokWipLbWNjBM19cz3F88e/LiOPcWMaKiLHkHPJzwAfE9FfS8n7Gv7VMaNI/ws1/aoJOLJzwPYCvL/AXwg+KPxR1K+0f4d+FtR8QXumrvuorS3eRoBu2/vMD5SW4APJwfQ0AecUV7H49/Z6+OHwu0ZPEXxD8D6r4f0t5VgFzd2zxxeawJVSxGASAcZ64rxygAorZ8O+Hde8W65ZeGvC+nz6rquoyrDbWttG0s0sjdFVVBJNe6aj+yF+0/pGn3Oq6j8MdehtLOJ5ppDZSEJHGCzMcAnAAJoA+cqK9R+HnwS+LnxajvZvhp4R1LxJFpxRbl7K3aVYmkyVVmAwCcHA61J8Q/gb8YfhNa2d/8SvB+p+G7a/do4Jb23eKOR0AJUMRjdg5x1xnHQ0AeVUUV0/g7wX4t+IPiC28KeB9Iudc1i83eVa2kTSyuEUsxCqCcAAknoBQBzFFe/8AiP8AZV/aP8IaFe+JvEvw41vTtK06MzXNxLZuI4o16u5A4UdSegHJ4rn/AAB8APjX8VNJm134c+CtU8Q6dBKYHuLO2eSISgBim4DG4AgkDpkUAeQUV6P8RPhB8UfhLcWdt8TPC2oeGpNQVntxfQNCJlQ4bYSMHbkZA5GRnqK84oAKK7TwJ8OfHnxP1v8A4Rv4eaDeeItUEbTG3soWmdYkxudgo4UEgZPGSB1IrvvGP7M37QPw+8P3Pivxr8P9Y0bR7Pb513cWrrDFvYKpdsYUFiBk8ZIFAHhtFe2eCP2b/j18SdAj8U+A/Aer65pEzvHHd21q7wu0ZwwVsYbB4JHGcjqDXG+P/hj8QvhXq0WhfEfw9e+HNQniE8cN7C0LPESVDruHIyCMjuKAOFoor0L4e/Cf4l/Fm+utN+Gvhm/8SXNjGJZ0sYGm8pCdoLkDAyeBnrzjoaAPPaK9k8e/s8/HH4XaKviP4h+B9V0DS3lWAXN3bPHF5rglVLYwCQDjPXFeN0AfXH7DPwu8G/GP9pvwl4E8f2jahodz9suJ7cOYxMbS2knRHK4Owsg3AEZGRmv6HdR/YE/ZE1GwubD/AIVxY232mN4/NgedJY94I3I3mHawzkHsa/mv/ZW+JPjP4TfHnwp408AaAfFOtwTvbw6Wiu0l2t1G0EkcflgsHKOdrYIU4JBAIr9y/EX7bn7VmnaBqWoRfst61YvbW00q3E95LNFCUQsJJI0s0Z1XGWUMpIGAR1oA8I/4J1/skfAP4lfDXxf4r+IvhlPEl/a+JLvSYDeSOUitrOKF02LGUG9jKd7HOcLjGDmX/gpF+yd8AvhZ8BbXx98N/CsPhzV7PVre232kkgSWK5V96yI7MGwUBUjBBz2JFeIfsFftR/HfwD4V8WeF/Anwhu/iZptxqjapNJpzyWzWl1doFdXcRTqyuIlKLhSuGJJB4uft+ftPfHX4j/C7SfA3j/4NX3w00e81Bbhru/lkuTcS2yHZFE3kwohG8swO4sMYxg5APyEr74/4JxfBn4e/G/8AaEm8N/EzTf7X0nTNGu9RW0Z2SKWeOWCFBLtIZlAmZsAj5gM5GQfgevpT9lP9o/Vf2XPiqvxJ03R4tdimsptPurSWQwGSCZkkPlyhX2OHjQ5KMMZGOcgA/oY+JH7BX7J0/wAP/EaWPgC00y5WwuXiurSSaOeGSOMuroxdhkEDqpB6EEZFfyp1+03jf/gsJqniLwhrGgaB8MYtN1DUrWW2iubjVTdRQmVShdoVtoi+ATgb15xnjivxZoA7X4beH7DxZ8RfCvhXVC62Ws6rY2U5jIVxFcTpG+0kEBtrHBIPPav6p7f9gr9kO2t4rdfhppziJVQM7zs52jGWYy5JPcnrX8oPhbXtR8K+J9I8UaQqPf6PeW95brIpdDNbyLIgZQQSCyjIBGRX9H2m/tr/ALVdzp1rcS/sq67M8sSOzpeyRoxZQSyo1kWUHqASSOhNAHzl8Av2O/gFq/7aPxp8A674fbVPDfgqOzfTNPuJ3aGM6hGsj7iCruI8lY9zHA+9uYBq+mf2of2Iv2X9D/Z6+IHiTw14GttF1bQ9GvNRtLu0klSWOe0iaZB8zspViu1gRypOMHBH52/Ab9rL4+ab+1p8RvGulfCubxR4h8YqU1Tw9aCaC5shp+I48OY5ChiACyF4/mJ/hJAr6Y/ad/bE/aV1X4FeLtB1v9nrVPBemazZPp93q19cSXMFtb3f7mQlBbQ4ZlbarF8KxBIPSgD8EaK9r8D/ALOHx5+JWgp4p8B+A9X1zSJXeNLq1tXeF3jOGCtjDYPBxxnI6g1zHjP4R/E/4eeIbLwn438Lajo2s6kqNa2lxbOk04kYovlLjL5YbQFzzx1oA87r9e/+CXf7N3wb+Nlj488Q/FPw+niKXR5LK1tYbh3EEa3CyO77EK5fMYAJJwMgDk18ON+xp+1Uil2+Fmv4UZP+hOentXqn7Hf7aWtfsfzeKNJn8Jp4isteaFpoHuGsbiC5tdyg7zHKNu1mDIUznB3DBBAP08/bo/Y2/Zw8DfsyeLfHfgfwbb6Brnh/7JcW1xaSSqSZLmKBkcMzKyFZDxjOQCDxX869fqn+0v8A8FOdU+P/AMIdX+E2meAovDkOutAt1dS6gb1vJhlWbbGgggCsXRfmJYbcjbkgj8rKACiiigApVGWAPc16d8O/gr8Wvi0l7J8M/CWo+JY9OKC5eyt2lWIyZ2hmAwCcHA68VZ+IXwM+Mfwls7PUviT4O1Pw5a30jRQTXtu8UckijcUDEY3Y5xnJGcdDQB/Th4c/YD/ZH03QNOsJPh5Z37wW8SNcXMk0k8zBRl5GDgFmPJwAM9ABxX4J/wDBQX4QeBPgn+0dqHhL4c2J0zRrmxtL5bXeXSGScNvWMtlgmVyFJOMkA4wB+sXgb9t/9qvU/BuiajJ+zHrGstcWcL/bbW6kt7e5DICJoomtJCiOPmUF24PU1+RH7SviT4zftQ/tMajHfeArvSfFzrHYw+H4IpZbuCG1QuBJuVWdtpLs+1VIOQAuKAPjiv6AP+Ce37IX7PPxH/Zv0v4g/EHwjD4i1vWby9Es13JIRGltO8KJEqMoVcLk9SWJycYA/IDxD+yn+0j4T0S98SeI/hvrdhpenRtNc3Elm4jiiX7zuQOFA5J6Acnivrj9lT/gpJq37Nvwrh+FWoeB4vE1nYXE81pcR3xsZES4cyukgMM4c72JVhtwDgg4zQB9Oft8fshfAPwL/wAKqu/APh0eGn8R+KLTQ75bKVwktrdZLNtkMgEi7flYep3BuMfoNbfsFfsh21tFbL8NNPkESKgaR53dtoxlmMmST3J61+H37UX/AAUO8SftDyeDE0jwjb+GLfwdqkWsxrLctfvNewf6rcwjgCxgE5XBLE/eGMV9W2v/AAWcmW2hW9+EyyXARRI0etFEZ8fMVU2bFQT0BYkDuetAH5uftqfDDwl8G/2nfHHw78CwPa6FpstnLbQyOZDELyygumjDHkorysqZyQoAJJyT8t1698efjDrPx8+LfiL4t6/Zw6fea/LE32eAkxxRW8KW8Kbm5YiKNQzcbmycDOB5DQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB//9T8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKvaXj+0rTP/AD2j/wDQhVGpYIWuJ47dMBpWCjPTLHFAH9ySsrqGUggjII6EV/Lp/wAFRCp/bA8RYIOLDTAfr9mSv0/8J/sCfHnRPDGk6O37TfinTDZWsMJtbFrj7JAUQDy4M3SHy06JlV4A4HSvzuh/YO8XfED9s/xV8CfFXj030tjZNr15rs8ck93c283lbC0bvzOXmQPmTaAGIY8KQD8xaK/bT4kf8Eh7Lwn4B8QeKfD/AMSJL3UNHsZ7yKC605YYZfs6GRkaRJnZdyqQCFODjIxX4l0AFFdL4M8L3vjfxhoXgvTJI4bzX7+10+F5SRGsl1KsSM5UE7QWBOATjtX7gxf8EZ/DvlJ5/wAUrrzNo3bdKTbuxzjNxnGelAHC/wDBGdlHin4ooSNxstLIGecCS4z/ADFfq1+2Gyr+yx8VC5AH/CO6gOTjkwsB+Zr8Sf2av2KviVN+0v8AET4ceHfiZceC7n4cosNxq+kecl1cpe8wqiq8W1WVcyBnO0gAbvvD6W/ap/Yl+M+i/AnxT4n1f4/+IPGtj4ftzqU+lau0/wBlnjtfnb/l4lHmKBuTKEFgBkdQAfot+xeyN+yn8LChBH9g2g455C4P6183/tXSRr+2r+y0GZQRd6zwSP4kgA/M8D1Nfz2+D/j18bvh9oq+HPAvj3XNA0qN3kW0sdRuLeBXc5ZhHG4UFjycDk1zPin4j/EHxx4gg8WeMvEmo63rVqI1hvby6lnuYxE25AkrsWXaxyuCMHkc0Af2yV/Gh+0iyv8AtD/FBkIZT4o1ogg5BH22XpWrL+1Z+01PE8E3xV8TvHIpVlOr3ZBBGCD+8rwJmZ2LuSWY5JPJJNACV/aV8EyrfBnwEyEEHQNLwR0/49Y6/i1r+hb4G/sLfHA/CHwlc2n7RniTwzBe6fDdx6bpbT/Y7VLoecscX+kx9A43fIo3ZwMUAfKH/BYRlP7QfhNQQSvhiAEen+m3fWvyYr7O/bq+B3jH4GfGsaT408ZXHjy613T4NRi1S9MhvJItz2+yfzGk+ZGhIXDsNm3ocgfGNAH9KP8AwSNKn9mDVFBGR4mvsj/t2tK2v+CrDKP2ZbAMQM+JdNxn/cnr+dbwL8W/ij8MVu0+HPi3VfDC35Q3A028mtRMY87S4iZd23Jxnpmn+Ovi98VPidFaQfEbxfq3iaOwZ2t11K9muliaQAMUErMFJAGSPSgD+1CJlaNGUgqQCCOQRX5neDHjH/BVPx6u4ZPgWAYyM58yxOPrjn6V+BmkftNftFaBpdpomifE3xHYafYxLDb28Oq3UcUUSDCoih8KqgYAHAFcFa/Ej4g2XjN/iNZ+JNRg8VSSvO2qpdSrfNLICHczhvMJYEgnPI4oA/sw+JDKvw78Us5AUaVfEk8ADyH618ef8Ey2U/saeCgpBKz6qDg9D/aFwefwr+cbxF+0d8f/ABdot34b8U/EfxDq2lX6eXcWt1qdzLDMmQdrozlWGQOCMVi+CPjX8YPhpp8+k/DzxrrHhqxuZPOlg06+ntYnlwF3skbAFsADOM4AoA/od/4KJyRJrH7PvmMq/wDFf6aeSB8oZcnnsO5r9La/ig8cfE74jfEy8tdQ+InifUvE1zZIY4JNRu5bpokY7iqGVm2gnk4616HbftU/tL2dvFaWvxU8TxQwIqIi6vdAKqjAAHmdAKAP3u/Zlkjb9vD9ppVZST/Y3AIz8sWD+R4Poa+of2vmVf2W/iqXIA/4RvUhyccmBgPzNfyT+G/iN4/8HeJZvGXhTxJqOj69ceb5t/aXUsN1J5xzJvlRg7bzy2Scnk811Pi74+/HDx9osnhvxv4+13XtJmZXe0vtRuLiB2Q5UtG7lSQeRkcHmgDyOvqT9iYqv7WPwuLEAf21AOfUg4r5br034MeAdY+KXxX8KfD7QNQXSdR13UILeG8YsPs7Fs+aNnzZTGRgg5A5HUAH9pdfmZ+wHJG/xX/aeMbBs+ObojBzwZ7rB+lFz+wn8d57eWE/tUeMm8xWXDNOVORjB/0zp61/P9ca78U/2dPiT4r8MeEvFl9oes6Te3ek313pN3NbC4NpOyN8yFGZC6bhuH4ZoA/pW/4KOMq/sZfEQMQNyaaBnuf7Rtulfyi16j41+N3xj+JOmRaL8QfG+s+JNPhlEyW+oX89zEsoBUOEkYgMASAcZ5NeXUAffv8AwTGKj9sfwhuIGbbVQM+v2Gav6myQBk8AV/Hh+yl8KfEXxn+PXhbwJ4V8QP4W1GeZ7pNTiLia1WzjadpIdhU+aFQ7PmUbsZIFfuT4j/YH+PGr+HtT0oftP+K783ltNCLe8a4+zTb0K+XNi7Y+W2cPhTwTwelAGv8A8EsXRvgR4vCsCR4z1U4B7GC1xUf/AAVjKj9lVASATr+n49/km6V8HfsEfskfFP4j+D/FXjPwt8XdU+G9pDqjaS8WitNvuprNFd3m2ywrtUTAR/eJy2dvGbP7fX7JvxT+Gfwz0bx94r+MWr/EiwtdRWz+y600263e7U7ZIN00y8+WQ+dpxjBPIoA/IKv1P/4JDso/aa1sMQC3he9Ayep+12Z4/CvojRf+CNenS6RZS698TpYdReFGuUttNWSFJSoLrG7zqzKDwCVUkckDpXzT8Pv2HPHHh/8AbVvvgX4V+IcmgXHhvTm1qPX7FJIbxbORY0VY40ddsxMyq48zbt3HJ4UgH9E3xDZV8AeJmchVGmXpJPAA8h+tfGv/AATIZT+xt4OCkErc6qDg9D9vnPP4V4R8Xf2Dfjpe/DHxNFL+0h4l8QoljNK2nao0/wBiuhCPMMU2LmTCsFxnY3OMgivwm8EfGr4v/DTT59K+HnjXWPDVlcyedLBp19PaxPJgLvZI2ALYAGcZwBQB+5P/AAWMZR8HvAiEjcdecgZ5wLWTP8xX89Ndz45+J3xG+Jt1a33xF8T6l4muLJGjgfUruW6aJGOWVDKzbQTycda4agD9pP8AgjSyjxr8TEJG46fpxAzzgSy5/mK/Wz9rllX9l34rFiAP+Ea1QcnHJtnA/M1/PL/wT/8A2fvHPxy+I+t3Pgnx7efDtvDlirz6hpxkF64umKLFH5bxfIdhLkv2GAc5H3x+1D+xL8aNH+BPi3xJqv7QPiHxlZaDZvqU+lau0/2W4is/3rg/6RKN6qpZMoRuABI6gA/Qb9iZlb9k/wCFxQgj+xbccc8jIP61+Zn/AAWdZft3wlQEbhHrZIzzgtZ4rX/ZJ/Yq+MviD4D+HPFujfHvXvA9h4hRtQg0rR2n+zQxzH5S2LiIeYwGXwmAeMnqfnj9q39jL4maZ8ffhl4H8RfE658c3PxIdtPtdU1nzmuLT7NInmK6tJLmNRMGQK4ydwIX7xAPyur98v8AgjSV/wCEO+Jq5G77fppx3x5U1VH/AOCM/hvY3l/FK734OM6VHjPbP+kV+Plzq/xQ/Zv+JXirwp4Q8V3uhaxot5daPeXWkXU1qJ/sk5RhuQozIXTcAw/CgD+lv/gosyr+xn8RgxA3RaeBnuf7Rtq/lAr1Hxr8b/jH8SdLj0T4g+N9Z8R6fDKJkt9Qv57mJZVBUOEkYjcASAcZ5NeXUAffP/BMplX9snwZuIGYNVAz6/YJ6/qfJxya/h50fWNW8Paraa5oN7Np2o2EqzW9zbyNFNDKhyro6kMrA8gg17JqP7UH7SGr6fc6VqnxP8S3dlexPDPDLqt08ckUgKujKXwVYEgg9RQB++f/AAS0dG+CXjYIwJ/4TbVTwexgtcH8aP8AgrAVH7KZBIBOu6fj3+WWv51/AvxY+J/wwN2fhz4s1Twx9v2faP7NvJrXzvLzs3+Uy7tuTjPTJqfxv8Xviv8AFGKzs/iL4w1bxNFZOzW6alezXSRPIAGZBKzBSQACRQB5vRX7q6H/AMEbNPn0axn174myw6lJDG1xHbaaskKSlQWWN3nVmUHgMVUkc4HSvkzSP+Cemp6j+15qn7Msni6KOx0vTTrLaoLZjK1k3lhFEG4Dzt8qqR5m3ALAnhaAPzdor9v/ABz/AMEfLPQfB2ta54c+JMl3qWnWk1xBDdacsMMjRKX2PIkzsoYAjcFbB5wa/ECgD0/4IsqfGjwC7kKq+INKJJOAALuPrX9pNfwz173a/tUftLWVtDZWnxT8TQwW6LHGi6vdBVRBhVA8zoAMCgD98P2cpIm/4KAftKBWUkwaLgAjPywID+R4Poa+qf2s2Vf2YPiuXIA/4RjVhyccm1kA/M1/I94e+I3j/wAJeJ5fGvhfxJqOk+IJzKZNQtbqWG6kM5zJvmVg7bzy2Scnk11fiz9oH45+PNEm8NeNfiBruu6TcFWltL3UbieByh3KWjdypwQCMjg80Af1J/sRMrfsm/C8oQR/Y0I49QWB/WvnL9sx4x+1p+ykpYAjW9RyM88tZAfmelfz5+Dvjx8bPh5ow8O+BPHmueH9LEjSi1sNQuLeASPjcwjjcKCccnHNc34t+JHxB8e65B4n8beJNR13V7VUSG7vbqW4njWNiyBJHYsoViSMHg80Af2yV/HF+1Qyt+0x8VmQhlPijWMEHIP+mSVJJ+1d+03KjRSfFbxOyOCCDq93gg9R/rK95/Yr/Ypk/a5PinVdS8VHw7p/h4wRsyW/2q4muLncw4Z0UIFRsncSSRx1NAHwPRX60ftP/wDBMa3+Anwa1r4s6D47fXP7AaB7i1ubEW2+GaVYMxuksnzh5FOCACM85wD6D8KP+CSNl46+Gvhnxt4g+I0mn3viDT7fUGt7XTxNFEl0gljQSPMjMQjLuO0fNnGRgkA/Faiv0m8b/wDBPDVPC/7VnhD9nHT/ABfDdWfi+zbUYtSlt2jlhtrdZWuA0AZgZB5L+WA+1sruK84+uL//AII0aOLG5Ol/FCd70Rv5Am0tViMuDsDlZywXOMkAnHQGgD2P/gkEyn9mzxCoI3DxTdkjvg2dniut/wCCrZUfspuCQCdd07Hv/rK+Af2C/wBkj4p/EXw14v8AFnhf4uan8N7ay1VtGlj0Rpt91PZoru8u2WAbFEqiP7xOWyF76H7ff7J3xT+GPwr0v4g+LPjJrHxI0+w1BbZrTWWmzA90pCywbpplz8mHztOMYPUUAf0Gacyvp9qyEMpiQgjkEbR0r839Jki/4epa0u5d3/Cv0GMjO77RAcfXHP0r8AtG/aY/aI8O6TaaFoPxL8R6fp1hGsNvbwapcxxRRIMKiIr4VQOABwK9h/ZD+HHxJ/ab/aPAtPHt/wCHvEUdvc6vd6+JppdRAj2RMY3Dq7SOZVU7nUbN3JwFIB/U/wCOWRPBXiB5CFVdPuySeAAIWzmv4kK/os+K37Bfx11D4b+JLaT9pLxLr6/YZnOn6m1x9iuhGu8xTYupPkbGCdjfQ9K/nToAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD/1fxjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAqzZzLbXkFw4JWKRWIHXCnNfv/wD8EsPgr8I/FvwA1fxf4u8H6Vr2r3Ou3Fq1xqNpFeMIbeGFo0QTK4QAyMTtAznnOBiX/gqX8FPhF4U/Z90zxf4S8H6VoOr2mt21slxp1pFZsYbiKUyI4hVA4JjUjcDjHGMnIB9W6T/wUY/Y91PS7TUZ/H0enyXMSSNbXFneCaFmAJjk2Qum5TwdrMMjgkc18AeD/wBtH4C2P/BQnxh8Xb3V54PBmtaAuh2+ptbSeWZ4DbP5rRgGUROYGVTs3ZKkqASR+IlfpN/wS2+HHgX4k/tE6naePdEtdftdJ0C6vre3vIxNALgXFvCHaJ8o+ElcAMCATnGQCAD9X/i//wAFBf2TLj4V+LbLRPG6axqF5pd3bW9pbWl0JZpZ4miRVMsSIOWBJZgAMmv5eq/rr+NX7OHwBvfhD40hPw60C3ZNHvpUlttNtraaOSGFpEdJYUR0ZWUEFWHT0r+RSgDvPhZ4nsPBPxO8IeM9VSSSy0HWNPv51iAMjRWtwkrhASAWKqcAkDPev6i4v+Ch37HEsSS/8LHt03qDtazvgwyOhH2fqO9fy/8Awc0HSvFPxd8D+GNdh+06bq+uaZZ3UW4r5kFxdRxyLuUgjKsRkEEdq/ruh/Z2+AEESQRfDTw0EjUKoOj2Z4AwOTFk/jQB+Q/7On7anwE8Pftb/Gv4geKNWn0fw548a0bTL6e2kZG+wAxnzEiDyJ5oO6PK9BhtrYFfRf7VX7eH7Lvif9nrx14S8H+MBr2teINMuNPtbW2tblWMlypQOzTRRoqJncxLZwOATgHz/wDZh/Z5+Ccn7afx+0O88HadfaX4WaxGmWd3Ctza2ov1aSby4ZdyckYXIOxflXANfTv7YP7PXwKj/Zn+Imp2PgHQ9OvtJ0i6vrW5stPgtJ4bi2QvGyywoj8EcjOGGQQQaAP5WqK/qc/Yz/Z7+Bk37Mfw91XUPAWialf6tpcN7dXN9YQXc8s843OzSTo7YzwFzhRgAAV+bn/BWr4V/Dj4eeK/h5qngPw5Y+HptatNRS7XT4EtopRavB5RMUQVAw81gWC5IwCTgYAPyGooooAK/p++C/8AwUD/AGTrP4R+DtO17xuuj6lYaTZ2lzaXNpdGWKa2iWJwTFFIhBKkqVY5BB9q/mBr+uP4Ffs5fAK0+C/gZT8O9AuXl0WwnklutNt7meSWeBZZHeWZHdizsTksfQcACgD8If8AgpB8ePhv8fPjfpeu/C+/fVdJ0XRYNPe7MTxRzTCeadjEJArlVEoUllX5gcAjBP59V+mP/BU/4a+A/hv8f9Fh8BaHa6Bb6xoMF5cwWUYggacXE8O9YkwiZSNQQoAJGSMkk/mdQAUV/QJ/wSu+Cvwk8XfAPWvF/i7wfpevavca9cWjXGo2kV4ywW8EDRogmVwgDSuTtAJzznAxq/8ABT34H/B/w18BNJ8U+F/B2laFqttr1pbLcadaRWbmG5STzEfyFQODsUjcDgjjGTkA/nmor+yfRv2aP2edE0mz0ex+Gvh029lCkMZm0u1nkKooALyyRs7t6szFieSSa/Nzwd+z78FpP+CmnjHwrL4O06TQtP8ADC6zBprwq1jHfTNaxvILc5iwRK5CbdgJyACBgA/n7or+vj4sfs1/s/ap8MfFVlN8OdAgDaZdsJLbTbe2mR44mdGjlhRJEZWAIKsDXyl/wTg+BPwZ179lTw74s8ReCdI1rWNautRkurrULKG8lcw3csEYVp1fYqxxqNq4GcnGSSQD+bSiv3K/4Ky/Bz4V+B/AngfxX4K8K6d4e1ObUprKWTTraO0WWAwtJtdIQqMQyghiCRyAcE1+GtABRRRQAV7f+zX4/wBA+Fnx68DfELxSZRpGhapBcXTQp5kixA4ZguRu2g5IHJA4yeK8QooA/rIk/wCChv7HEcbP/wALItm2gnC2d8Scdh/o/Wv5f/jH4t0zx98XPG3jrRUkj0/xFreo6jbrMAsghurh5UDgEgNtYZAJ5715vRQAUUV/W/8AAX9nL4B23wT8CBvh5oN1JPolhcSzXWm29zPJLcQJLI7yzI7sWdieWOOgwABQB/Op+w98WfBvwU/aV8LeP/H1xJaaHbC7t5544zL5P2u3khWRlX5iis4LbQSBkgHpX9BWo/8ABRX9juw0+5voviBFePbxPIsEFneGWUoCQiBoVXc3QZYDPUgc18lfEv8AZ9+Cqf8ABSf4Z+FofB2nQ6HrHh+fU7vTooFjspru0W7ETtbriPA8lNy7drY+YHJz+kmo/s2fs96rp9zpl58NPDnkXcbxSeXpVrE+1wVO1441dTg8MpBB5BBoA/Jz/gnj+2P8AfhT8MvFPg74m+IG8N31z4hutVgNxbzSxzQXkcSKFaBJMOhiO8MAORgnnE3/AAUV/bD/AGfvi58EdP8AAXwx8Sf8JHqs+sW144gt5444YbVX3GRp0j5YuAoXdnnOAOfRP+CZPwL+DviH4SeL/Enibwdpmual/wAJPe6es2o2sd6UtbSKFoo0E4cJgysSVALZG4nAwv8AwVG+CXwh8Lfs72Xi7wp4O0rQtXstZtYI7jTrOKzcxXCSeYj+QqBwdikBgcEZGOaAPqLRP+Ci/wCx9qWj2WoXPj2PTpbiGOR7a4s7vzoWZQTHJ5cLpuU8HazDPQkc18A+Gf20PgLaf8FDvEvxfutXmi8F6p4fGhQ6mbaTy/PiNvJ5pjAMohYwsqnZuyQSoUkj8RqKAP6k/iZ/wUN/ZIT4eeJF0nxuusXsun3MUFna2d1508ksZRUQyxRoMkjJZgAOSa/lsor+kf8A4Ju/Ar4Na9+yvoHizxH4J0jWtY1m71B7m61CyhvJWMN1JBGFadX2KqIo2rgZycZJJAP5uKK/c7/grJ8HPhX4I+H/AIJ8WeCvCmm+HtTl1SSykk062jtFkgaB5dsiQhUYhlBDEEjkA4Jr8MaAP00/4JmftFfCr4BeO/F6/FbVG0Wz8Q2NulvdmGSaFZLV3YpJ5Su4LB/lO0jggkcZ/Rz9qH9vL9lvxL+z7498K+EfGS67rOvaTdada2tta3Ku0t3GYlYtNFGgRN25iWzgHAJwD8Lf8EnPhZ8OviL8QPHOoePfD1l4hfRdPtfsiX8K3MMRuZJFkbypA0ZYhAAxUkDOMZNfqP8Atb/s9fApP2afiPqNl4A0PT73S9Evb61uLLT7e0niuLWJpYnWWFEcYZRkZwwyCCCRQB4V+yL+3Z+zD4R/Z18E+DfGvi4eH9b8P2S2NzbXNrcu2+Ekb0aGORGRwQVO7PYgHivn/wDaq/bP+Aviv9pb4FeNPB+rza5oXw/vbi71S7t7aRUVLt4AFjWYRu7IIizgLjBAUk5A+2/2K/2e/gbP+zB4A1jUfAWianqGr6cl7d3N9YQXc8s8xJdjJOjtjoAoO1QMACvm79sH9n34LW37Vv7Ouk6f4P07T9P8WahdWuq2tnCtrb3cNo9u0SyRQ7E/5auGIALA4YkAYAPsV/8AgoZ+xwiM/wDwsi2baCcCzviTjsP9Hr+YP40eL9L+IPxg8b+O9EWRNO8Ra3qOoWyzKFlEN1cPKgcAkBtrDIBPPev663/Z4+AMiNG/w08MlWBB/wCJPZDg/SKvzQ/YQ/Z/+C938Wv2hLXVfB+natB4X8TzaRpkeoQLepa2ST3GI0W43rn92oLkbsDGcZoA/n3or+mb/goP8BPgrpP7KPjLxRofgfR9I1bQzY3FpdWFjDZzRyPeQwNloFQspjkYFWyvIOMgEfzM0AFFFFABT42CSK56KQfyplPiAaRFPQkCgD+rHQP+Ci/7H+o6HYX9148TTZp4I3e1ubO786BioJjk8uF03KeDtZh6EjmvgLw/+2f8Brb/AIKIa/8AGC51eaLwXqPh7+wotTNtJ5fnxmCTzTGAZRCxiZAdm7JBKheR+tXh/wDZo/Z50TQtP0iy+G3h5rezgjiQzaXbTylUUAF5ZY2d2PdmYknknNfm/wCGv2fvgs//AAU58S+FJPB+nPoNn4XGsxaa0CtYpfSG3jaQWxzFjEjkJt2BjuCggGgD6V+JH/BQ79kePwB4i/srxwur3slhcRwWlrZ3fnTySRlFRDLEiAknqzAAck1/LTX9f/xP/Zr/AGfdV+HPiawuPhz4fhSTTro+ZbabbW0yMsbMrRywxrIjKQCGVgRX8gFABRRRQAUV+sf/AASd+Fnw7+IvxF8bX/j3w9ZeIX0XTrY2kd/CtzDE1xI6yN5UgaMsQoAYqSvOMZNfqf8AtZ/s8/Apf2a/iRqFn4A0PT7zS9Cvr61uLPT7e1nhuLSFpYnWWFEcYdRkZwwyCCCRQB/KbRRRQAV+t/8AwTF/ae+DPwIs/Hfh/wCLGtnQG1qSyurW4kgllgcW4kR4yYVdg/zgjK4IB5yMV+SFFAH9C37cP7bn7NfxC/Zp8V/D/wCH/iweINc8QfZIIILe1uE2eXcxTtJI00cahAsZHBJyQMYyR678Cf2//wBlHTfgx4I0fxF41XRtU0vR7GxurS5tLoyxTWkKwvkxRSIQSmVIY5UjODkD+YyigD9vviZ+2l8BNR/b6+G3xY0nV577wh4X0mfS73UY7aQRiW9juVDojhZWjiM6+YdmeG2hsDP6BX//AAUU/Y6sbG4vU+IUV21vG8ghhs70yyFQSEQNAq7mxgZIGepHWvwJ/YB8C+EviL+1d4L8MeN9Mi1jSX+23D2s43QySWtpNPFvXo6iRFJVsq2MMCCRX9Ml/wDs3fs96nY3GnXfw08NmC6jeKTZpNpG+1wVO10jVlODwykEdQQaAPyY/wCCen7Y/wAAvhX4B8Z+FviZr7eG7zUPEd1rFsbi3lljlt7yKJFVWgWXDoYjvDADkYJ5xa/4KL/th/s/fF34EW/w9+GHiX/hItWvNUtrlhBbzxxwxWwcs0jTpH94sAoXcTznAGa/ErxPZW2m+JdW06zXZBa3c8Ua5JwiSMqjJ5OAO9YdABX3Z/wTv+Nvw++A/wC0E3ir4mXr6bo2o6Rd6d9qWJpUhllkhlRpFQM+w+UVyqsQSMjGSPhOigD+pn4h/wDBQ/8AZGh8CeIG0vxwmr3jWNwkNpbWd3508joVVE82JEBJPVmAHUmv5ZqKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//W/GOiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP1v/4J+fEf9s/w98Ote0L4CfD+w8Y+Fo9Q85ptSlSzSG8kjUSpFK88HmkqqFl+bZweN3M37f8A8Rf20/Efw40LQPjt8PbDwf4Xm1ESrLpkqXqz3kaERJLKk8/lYVnKL8u/nrt4+2P+CRt9ZTfsz6rYRXEb3Nt4jvGliVwZI1kt7fYWUHIDbW2k9cHHQ1p/8FXNQsLb9nTRbO5uYori48Tae8cbuqu6xRzFyqk5IXI3EdMjPWgD8ftH/wCCcv7Yut6VZ6xZ+AWjgvYkmjW41Cxt5grjcA8Us6yI2DyrqGB4IBrkfhj8RvjT+wd8ctRnuNEisvEdlbyadqGnaim+Ka3mKSDDxtypZEkSSN8MAOSpIP8AW9Z3lnqNnBqGnzx3VrdRrLFNEweOSNxuV0ZchlYEEEHBHSv5c/8Agp3fWV9+194mNlcR3Ags9Ohk8tw+yRLZAyNgnDKeoPIoA9L8e/8ABWP44eNvBeteD4fDWh6QdatZbRrqFZ5JYo5l2OUWWRk3FSQCwIGc44r5P+Ef7G37R3xy8LHxr8NfCL6johmeBLmW6trRJXj4fy/tMsZcKflLKCAwK5yCB8w1/U9/wTKvrK7/AGN/Btva3Ec0tlPqkU6I4ZopGv55AjgHKsUdWAODtYHoRQB/Ph8RfgR+0D+yh4k8NeKPHvh9/D16lzHe6ZdCS3vIDc2cgkUb4Wlj3qyhtjHJHOCK+6Iv+CxHxuSJFl8F+HpHCgM3+ljcccnHncZ9K+j/APgsfqFivw0+H+lG5jF4+rzzLBvHmmJbcqXCZ3bQzAE4wCQO9fz80Afpv+yZ8ff2uvF37QXjr4g/CHwxZ+Mte8XxC41q1nRLaxiSI4tyJmkiERjGUjBkJcZyGYbh9W/tV/Fn/goXP8CPFNh49+FWk+G/DN9b/Z9Tv9OuYr+eK0l+WT92t1MVRh8rybDsBJyvDDz/AP4I1X9lD4z+JmnS3EaXVzY6dJFCzgSSJFLMHZVzlgm9dxA43DPUV+rX7Zt/Zaf+yt8UZb+4jtkl0G9hRpXCBpJYykaAsRlnYhVHUkgDmgD8Kvgv/wAFPPjP8G/htovwzttA0fW7LQIvs9rcXSTJMLdfuRt5MiK2wcBsZIxnJyT4t8fv2jfi/wDtvePfC2m3mhwfb7QNY6VpelROxea6ZTI2XZnZn2JnLbVC5wPmJ+P6+q/2HtQsdL/ay+Gd7qVzHaW66oFMkriNA0kTooLMQMsxCgdyQOtAHoMv/BNX9syGJ5W8BqwRSxC6ppzMcDPAFxkn0Ar4f1HTr/R9QutJ1W2ks72yleCeCZSkkUsbFXR1bBVlYEEHkGv7iyQASTgCv4yf2hr2z1L4+/ErUdPuI7q1uvEusSxTROHjkje8lZXRlJDKwOQQcEc0AePV/Qp8C/i//wAFIm+D/hFdB+EOja1pUWnwxWd7f3cVjcz2sY2Qu8DXcRXMYXB2LuGGxzmv566/tB+BF9Zal8EvAN5p1xHdW76DpoWSJw6ErbRq2GUkHBBB9CMUAfzFft0+MPj94w+Nn2j9ofw9F4X1yy0+C3tLG2CtbJZ5Z1aKZXkEwaRpCX3thspxt2j4zr9Xv+Cv1/Y3f7RPhu1tbiOaay8NW8c6I4Zona7uZArgHKkoysAcHaQehFflDQB+tn/BPv4j/tm+Hfh7r+hfAP4f2HjLwumoee8uoypZpDeSRqsqxTPPB5pKLGWXLbODxu5u/t+fEv8AbV1v4b6Ho/x0+H+n+DfC76iJhPpssd6st3Eh8lJZUnn8rAZyoO3fz12kD7Q/4JFX1lL+zTrNhFcRvdW/iS7eWIODIiyW1tsZl6gNtbaT1wcdDV7/AIK131lB+zBZ2M1xHHc3Wv2RiiZwHkEcUxcopOW25GcdMjNAHwlpH/BX/wCO1hpVnY6j4V0HUbq3iSOW5dbiN53UAGRkjlCKWPJCgAHoAOK+b9G/by+MWj/tIap+0qltp02savaHTp7BoWFmbHCbIBhvMGwxo2/fuJHJ2kiviWigD9U/G3/BWj45+LvCOr+F7Tw1oejyatbSW32uFJ5JYVlG1mRZZGQttJA3KQDzg15j+zr/AMFFvi3+zp8N7f4X6Jomla5pNjPNNaterKssK3DmSSPdC6BlMjMwLAkbiM4AA/PqigD7S/aX/bL+LH7Xw8O+Fdc0eysLbTrgta2OmRSPJcXk/wC7UkyM7s2DtVFwCScgnGNi2/4Jsftl3VvFcp4CCLKquFfU9ORwGGcMrXAKn1B5Hevmf4HXlpp3xq+H+oX86Wtra+IdKllllYJHHGl3GzOzNgKqgZJJwBzX9oisrqHQhlYZBHIINAH8cfgf9mH47/EX4h6x8K/CvhC6n8TeH9/9o2sxjthabDj97LMyRruP3Pm+fquRzXffEb9hb9qT4U+EL7x3418FPbaLpgD3M0F5aXZhQnBdo7eaRwi/xNtwo5JA5r9of2Xte0S9/bz/AGlILTUbeeS5/svylSZGMn2WPy5toB+bynIV8fdY4ODX1T+2Rf2WnfssfFKW/uI7ZJPD9/CrSuEDSTRMkaAsRlnYhVHUkgDmgD+bD4afsOftQfF3whZ+PPA3gt7rRNQLfZp57u0tDMqnG9EuJY3KE9GC7TjgmuH+IX7MPx2+F3jjRPhx4z8JXNt4g8SFRptvC0d0LtmYJtikgZ42YMRuXdlcgsACDX9On7EN/Y6h+yf8MZLC5juVh0eCFzE4cJLFlXRipOGUjDA8g8Gvl/8AbL1zRrL9sj9lyK81C3ge01G/kmWSVFMSTvbJEzgn5RIysqk8MQQMkGgD8nZf+Cav7ZkUbyt4DRggJIXVNOYnHoBcZJ9hXw/qem6ho2o3Wj6vbSWV9YyvBPBMpSWKWNiro6tgqysCCCMg1/cUSAMngCv4z/2jr6z1P9oP4m6jp1xHd2t14m1iWKaJxJHJG95KyujKSGVgcgg4IoA8Yr+hH4D/ABf/AOCkB+DvhFPD3wi0bW9Jh0+GKyvb+7isbme1iGyB3ga6iK5jC4Oxd4w3fJ/nur+z34BX1lqXwN+H15p9xHdQPoGmASROHQlLaNWAZSRkMCD6EEUAfz1/H79pL9qv4Z/ta6H8Wfir4asvDXi3w1YxwWWmiMTWMmnTCQSKsqyP5qymSUGRZCVbKgqVwPRtR/4LB/HS60+5tbHwloFlczROkU6rcyGJ2UhXCvKVYqeQGBB7jFU/+CwF9ZXP7Qfhe1triOWa08NwpMiOGaJmu7lwrgHKkqwYA9QQehr8nKAP1u/YD+KH7aWk+DPFGm/AvwHY+NfD0upm7nm1GSOyjhv5kAlEUzTQCQsioXQFtmFOF3c2/wBv/wCJH7amv/DHR9D+O3w+0/wd4Um1ASGfTZUvFmuo0PlJLKk8/lYDOVB27znk7SK+yv8AgkNf2Mv7NuvabFcRvd23iW6klhDgyRpLa2ojZlzkByjBSRg7Tjoa2f8AgrPfWUH7L1vYzXEcdzda9ZGKJnAeQRpMX2KTltoIJx070AfzR16L8LfhP8QfjT4ug8C/DPRpdb1q4R5RDGyIqRRj5pJJJCqRoMgbnYDJA6kA+dV+o3/BI6+srP8Aae1SC6uI4JLzw1exQK7hWlkFzayFEBOWbYjNgc4UnoDQB4T4r/4J8ftc+DPDmo+K9c8CP/Z+lQtcXBt76yupViTlmWGCZ5H2jkhVJwCe1fZ/7C3xO/bm0f4Ix6F8GPhvpvi7wfY3twLO71KeOyZWkYyTRxM9xB5yCRmJbDYYld3G1f2/+KGoWOlfDbxVqOp3Mdna2+l3rSTTOI40UQtyzMQAPcmvjX/gmFfWV1+x54Vtra4jmls7vVI50RwzRO17LIFcA5VijqwBwdrA9CKAPy2/4KAeNf2xfHEfgzwt8d/ANt4W06W5d9Ng0orepeXz/uwpmjlnPmhWwkQKkhicNxjx22/4Jsftl3VtFdJ4CCLMiuFk1PT0cBhnDK1wCpHcEZB4Nfrl/wAFItb0fTL/AOA0eo38Fo8Xjmwu3EsqRlbeFh5kxDEYjTI3OeFyMnmv07R0kRZI2DKwBBByCD0IoA/kk+Bfx++MX7DvxL8SWVvokCanIn9n6rpWqRMMPCxaNt0bK4KkkqVYqytnkFSPd/i9/wAFRvjR8Wvhvr3w2n8PaNotr4itns7m4tlmeYW8o2yoglkZBvXKk7SQCSMHBHhf7fF/Zal+178SrrT7iO6h+3Qx74nDrvitYY3XKkjKupVh2IIPIr5BoA/df9kf4r/8FBbT4DeHNO+Hfwt0rxP4WsUeDTL/AFK4isJpLZG+UBGuYC6Kcqsmz5gOrEEn59/am+Kf7bF3+0N8LdQ8feCIPDvizQ5RL4Y0/T41vbe6uJpUEuJFkmErMVjV03jYuDhd24/st+w7qFjqP7JvwyewuY7lYNIihkMThwksRKujbScMp4YHkHg18y/tn65otj+1/wDstxXuoW9u9pql/JMskqIYkne1SNnBI2q7KyqTwxBA5BoA1Z/i/wD8FOEgkdfgd4cBVSRjVYWPA7KL7n6d6/PT9jL4o/tsWXxI+KNx8L/A9v4s1TWb173xHb6oqafHbakZnyd7SW4jlLNIDDnoCdo2k1/R6Tjk1+Xn/BP7XNF1L4x/tNjT9Qt7s3fjKe6h8qVJPNt2uLoCZNpO6M5GGHByOaAPl79tj4pft5an8CNS0T4t/DPTPCng/ULi2j1C902eO+fakgkjSTZcT+TG0qp+82j5gqbvmwfhLwV+wF+1j8QfCum+NPDPgdpNK1eIT2r3F7Z2skkTfdfyp5kkCsOVJUblIYZBBr97/wDgo9f2Nl+xv4/hvLiOCS8XT4YFkcKZZft9u+xAT8zbEZsDnCk9Aa+g/wBny+stS+BHw7u9PuI7qBvD2lqJInDoWS1jVhuUkZVgQfQgg80AfyKfFn4N/En4HeK28FfFHRJdD1YRJOsbskiSRSdHjliZ45FyCCVY4YFTggivMa/Wj/gsDfWVz8fvCtpb3Ecs1p4diWaNHDNEzXVw6hwDlSVIYA9QQelfkvQB9C/Bj9lb48ftA6fqGrfCjwvJrFhpkiwz3DzwWsIlYbvLV7iSNXYDBZVJKggnGRm38Y/2S/2gvgBo1l4m+KXhV9J0y8m8iO5juLe7iWYDcFka3kkCFhnbvxuwcZwa/a//AIJB39jL+zj4h02O4je7t/E1zLJCHBkRJbS1CMyZyFcowUkYO046Guh/4KyX1lB+y3FZT3Ecdxda5Y+TEzgPJ5ayltik5baOTjp3oA+BtE/4K+/HbTNHstO1HwtoOp3NrCkcl1ItxG87IoBkZI5Qis3UhQBnoAOK+cdN/bw+MOm/tJ337S6W2nSazqNodOlsGhYWZsMJtgGG8wbWjR9+/cWHJ2krXxNRQB+q3jL/AIK2fHTxT4V1bw1Z+GdD0iXVLaS2F3Ck8kkIlG1mRZZGQtgnG5SAeSD0r8qaKKACiiigD7y/YB8a/tJeEfibrEX7OfheDxbdX9hjUrO82xWqwxtmKR7hpIhEwYkKN435I2k4I+/f2n/i1/wUPm+BPi6y8cfCjSPDvhu9s3t9Tv8AT7qK+uIbKb5JiIlupiFKEq77DsUlsrjcPJv+CN+oWMHxE+ImnTXMcd1daZZvFCzgSSLFM+8opOWC7huIHGRnrX67fte31lp/7LnxVmvriO2jfw3qcKtI4QGSa3eONAWIyzuwVR1JIA5NAH8edFFFABXt/wAF/wBnL4y/tB3mo2Xwl8OSa2dJRZLqQyw20MW84RTLO8ab25IQNuIBOMAmvEK/eT/gjTfWQ8P/ABO003EYu2utNmEO8eYYwkyl9mc7QSBnGMnFAH5g/Fb9iz9pX4KeEpfHPxE8HPYaHbyJFNcw3VrdrCZDtUyC3lkZFLYXcwC7iBnJAPyzX9Xn/BRi+srP9jj4gx3dxHA91HYxQh3CmST7dA2xAfvNtVjgc4BPQGv5Q6APU/gr8XvFXwI+Jmi/FPwZ5LaposjlY7hPMiljlRopY3HBw8bMuVIYZyCCAa/R3UP+CwnxzubC5trLwjoFncSxukc4W5cxOwIVwrSlWKnnB4PfivyPooA+jfhL+zJ+0B+0museJfhp4ak1yC1uCLu6ea3tITcS/OyK87xIz4O5lTO0EZABFP8AjJ+yR+0F8AtDtPE3xT8KPpWlXs32dLmO4t7uJZcbgsjW0knllhnbvxuwcZwa/an/AIJAX1lJ+zt4m02O4ja7g8TXEskIcGRI5bO1COyZyFYowUkYJU46Gur/AOCsV9ZW/wCyytlPcRx3F3rdj5MbOA8mwSM2xTy20cnHQdaAP5m69C+F/wAKvH/xm8X23gT4aaPLretXSvIsMZVFWOMZZ5JJCqRoOAWdgMkDOSAfPa/Tz/gkrfWVn+1LeQ3VxHBJeeHb+GFXcKZZBPbSbEBPzNsRmwOcKT0BoA8V8Uf8E9f2u/B/h3UPFOs+A3NhpcLXE/2e+srqURpyxWGGd5HwOSFUnAPFcN8IP2Pf2ivjv4bl8X/DLwi+p6NHM0Aupbm2tI5JF+8IzcyR+YF6MVyAeCc5Ff1m/ES/sdL8AeJNR1K5jtLW3027eSaZxHGiiJsszMQAB6k18Sf8Eu7+yuv2QfDtrbXEc01lfanHOiOGaJ2upJArgHKkoysAcZBB6EUAfz3fGj9mP44fs+Jp03xZ8MyaNb6sWW2nWaG6gd05KGS3eRFfHIViCRyAQDjwWv6F/wDgsXf2SfB3wPpjXEYvJdeaZIC48xo47WVWcJnJVS6gnGAWAPUV/PRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/1/xjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD9d/2Av2HvCnx9+F+r/ErxR4w13Q86k+nQ22iTx2hxbRpIzzO8cu/PmgKAF24PJ3cW/28v2FfCnwO+Gui/EPwt4x13WWOqRabLb63PHd4F2rMrwvGkWzaYvmBDbsjkbeZP2AP26vg3+zz8I9U+G/xNh1G3uTqsuoQT2kAuY5UuIo0KkBlKMhi75BDDHQ1c/by/bz+DXx7+FekfD/4Z2+o3V0mrwajPNdQC2jijtUdQoBZizOZOMDAAOeoFAH194f/AOCV3w107Q7Cw1L4keMmu7eCNJjZ38NtbGRVAbyoTA5jTP3VLsQOMnrXwh4f/wCCfvhTxD+254o/Z91bxZqEvh7RtLOvNdhY/wC0Z4pzCFhaRlaPzA84Ly+WQwU/Ipbj9AdK/wCCsP7Ll3plpdaoutWF5LEjTW/2IS+TIQCyCRXAcKcjcAM9cDpXw94T/b5+FGl/t0+Kfj5f6ZqKeENe0UaHFIqI1ygh8hluGhz912gxsDbgGBPIK0AfQHxQ/wCCTHwQ8O/DnxL4i8K+KfEEWraVp9zeW5vJbWe3L28Zl2yRx28TkMFK5DgjOecYPln7En7APg34w/AjTfin4n8beItJn8QXF0Y7XRbmO0iijtZ3tv3m+KUyOzRltw2gAgYyCT9C/FX/AIKk/s1ax8NfFGi+GU1jUNV1LTbq0toHsxAjSXEZiBaRnIVV3bicE4HAJwK8K/Ym/wCChHwL+Cn7P2i/Cz4ixanaapoU95iS2txcxTxXNxJcq4IZSpHmFCpH8OQecAA81/bM/YL8PfC3xF8Mo/CnjPVtSj8ca1b+HpDrbreS20lxINkyPGsWUXccxkZzyG5IH2JD/wAEfv2dVhRbjxP4oklCgOy3NkoZsckKbQ4BPbJx618oftkft9fCX4t698K7j4c6fqGoW/gfxBb6/dvcotp5gtnUi3jBLncwBJc4C8cNk4+5Yv8Agq5+yg8aO82txswBKnTslSexxIRx7GgD8Avjp8PLv9nz44+KvhvoWsz3B8OXZghvY828rxSIsi7th4ba4DYOCQccV5XqPijxLq9v9k1bVru9gyG8ueeSRNw6HazEZFeqftKfFHSvjT8dPGPxQ0O0lsdP1+8823inIMoiSNYlL7eAzBNxAJxnGTjJ8OoA/cr9mz/gl38IPij8EvCnxH8c+JtbGqeJbRL4x6c9tBBDHNykYEsEzMyj7zbgCeigV4r8e/8Agnp4O+HP7RPwn+FHg3xTfDR/iRJPE8t8kc11aNZbGlZWiWJHDq42AqNrA5JB4+l/2Yf+ClP7Pnw7+BHg/wCH/jmLVbDWPDdjHYTLDai5ikEHCyo6svDjB2kAqcjkYJ8N/aG/b8+E/jj9pP4O/E/wbpmo32g/DmW6mvGlRbeaf7bsR1hjJbmJU3ZZhvJ2/KBuIB9u3H/BLf4VTW8kS/EfxyC6so36pA65Ixyv2YZHqMjNfn3+yZ/wT48EfGfxn8U9B+IXiW/S0+Hmsy6HF/ZixQSXM0UsiGdmmSYKhEfCBc5P3uMH9EZP+Crf7J6IzLPrbkAkKNO5J9BmQDn3r4S/Y+/b2+E3wo8b/F3WviJp+oafZ/EDXZtds2tkW6MXnSysYJACh3ASDDjg4PA4yAbf7YP/AATa+FfwK+BWtfFnwB4j1ia80CS1aa31J7eeOeK5nS32oYYYSjq0gbJLAgEYyQR798Gf+CZHw81T4U+FNZ1r4heLIb7VdOt76WPTb2G0tEa7QTbYomhkIC78EljuOW4zgeV/to/8FDfgT8Zv2fNf+Fnw7i1O81XxBJZpvubYW0UEdvcx3LOSWYsT5QQKB/FnPGD7N8Iv+Cov7NmhfC7wpoHiiPV9P1bSdMtbK5hSzE6LJaxrESsiuAytt3DgHBwQDmgD448ffsBeG7T9tnwt8BB4v1K60HxXpjazJeXQSbUY4bcTCSEy4CM7G3OyQphQwyjbfm+yNU/4I+fAKXTbqPRvFfiS3v2icW8s81nNEkpHyM8a2sbOoOCVDqSOAw618qeNv2+/hRrH7cfgz486bpmoy+EfDWkPo0sjIqXMguRcF51hJ+7GbjG0tlgpIxkCvuHUv+CsH7LNrp11c6f/AG1e3UUTtFB9hEfmyAEqm9pMLuPGTwOtAH83aajrnhXUL2y0jUrizZJGika3leHzPLYgE7SM98Z6ZqG81jXPEU9vDrOpXF8VbbGbiV5dm8gHG4nGcDOOuKpaldjUNRur8LsFzK8m3Ocb2LYz7ZqC3l8i4imIz5bK2PXBzQB/RJo3/BHz4DR6TZx694s8R3OpLEguZbaW0hgeXA3tHG9tIyKTnALsQOpNfGHh3/gnt4N1X9tfxB+zld+J74eF9E0j+3BcIkYv5IJDCqW+8qYg6tON0nl4YKcIpPH6DaR/wVh/ZcutKs7nVF1rT7yWJGmt/sQl8mQqNyCRXAcKcgMAM9cDpXw/4Z/b5+FGnft1+JPj7e6bqKeD9a0QaFHIqK1ynlGB1uGhz912gxs3bgGDHkFaAPon4if8EkPgho/gTX9Y8K+K/EEGrafZT3Ns15Jaz2++FC+JI47eJyrAY4cEZzzjB/n1r+j34j/8FUP2ab7wD4h0/wANx6xqWqXljcW9tbvZiBXkmQxjdKzkKo3ZJwTgcAniv5wqACuoi8b+NIY0hh1/UI44wFVVupQFA4AADcAVy9FAH6Cf8E/f2XNH/aa8d+JD4k8SaloNn4atIpmbS3WK8mku2dFxM6uEUBGLfKS2QOOTX3Z+01/wTd8CeDPgb4u8ceHfH3ie8vvDNjLqawavdxXlrMtqpd0KJDEwZlBCvu+U9QRXw/8A8E8v2qfh7+zF4x8Vz/Ei2vG03xJZ28aXFmgmaGW1d2AaMlSVcOfmB4IHBByPvH9pL/gpd+zx49+BnjPwH4Ji1a/1jxJps+nQJNai3iQ3SGMyO7O3CAlsAEscDjOQAYP7LH/BOTwL48+BPhbx94j8eeJrG98TWw1A2+j3cVnaxLN9xNjxSlnCgbnyMnoABz4H+0v+wZoHgf8AaI+E3w60Lxlql9p3xLnktHudUKXV5aG0ePzGWRBGrqyyjYpUbSDkkHj6N/Ze/wCCk/7Pvw5+A/hD4feOotVsNY8N2a2Eqw2ouYpBDwsqOrLw452kAqcjkYJ8K/aT/b3+E/xB/aJ+DXxJ8GabqN7ofw2uZ7q8eZFgmn+1vFuSGMk8xrFnLMAxbHygbiAfcc//AAS3+FMsEkS/Efxzl1IG7VIGXkd1+zDI9RkZr+dT4l+DW+HXxG8U/D97oXzeGtUvdNNwE2CY2czw+YFJO3dtzjJxnrX9HD/8FW/2T1RmWfWnIBIUadyfYZkAr+c74reMbf4ifE/xd4/tbZrKDxLq9/qSQOwd4lu53mCMwABKhsEgc0AcDX9DHwV/4Jk/D3VvhN4T1zW/iF4sgvtW063v5Y9MvYbS0jN2gn2RxNDKQFD4JLHcQWwM4H889f0U/B7/AIKifs26B8KvCXh7xTHq+n6tpGmWljcwpaCdBJaxLCWWRXAZW27hwCAcEZoA+PfiH+wF4asv21vCPwFj8YaldaF4u01tXkvLsJNqMcVsswkh83Co7v8AZyEcoAoYZVtvzfZGpf8ABHz4Ay6ddR6R4r8S2980TiCSeazmiSUg7GeNbWNnUHBKh1JHAYda+VPHf7fXwn1n9uDwP8eNK03UZfCXhfSZNInkZES5k+1C43zpCSfljNx90tltpxjIr7h1H/grB+yza6fc3Nh/bV7dRRO0UAsRH5siglU3tJhdx4yeB1oA/m8+3654S1O/sNI1O4tHileGR7eV4fM8pioJ2ke+M9M1S1PXdc1vy/7Z1G5v/Jzs+0TPLs3Yzt3k4zgZx6VFqt6NS1S81EJ5YuppJduc7d7FsZ74zWfQAV9j/sM/s96b+0j8bv8AhDNY1y80Cx0vTrjVJp9PIS7cRPFCI4pGDLGS0wJYq3ygjGSCPjivtT9g39ofwb+zV8b5vG/jy2uZ9H1HSrnTJJLRRJJA0skMyyeWSN4zDtIBBG7POMEA/Vr4nf8ABLz4dR/D3xDc6N8RfFr31rZTXEK6jew3dozwL5gEsKwxsynbjhwQeecYP89OmeIvEGixvFo+p3Vgkh3MsEzxBiOMkKRk1/RP8RP+CqP7NF54E8QWPhyPWNS1O7sZ4La3azECySTIUUNKzkIozknBOBwCeK/nAoA0dS1jV9ZlWfWL6e+lRdqvPK0rBc5wCxJAz2rWi8beM4Ikgg1/UI44wFVVupQqqOAAA2AAK5iigBzMzsXclmY5JPJJPc02iigDc07xN4k0e3NrpGrXdjAWLGOCeSJCx4JwrAZ4HNejfB/wXqHx1+MvhL4e61rM8MniS/gsnvZS1xJFGx5IDtyQM7RnGa8dr174BfEbT/hH8aPB3xL1a1kvbLw7qUN3PDCQJHjQ/ME3cbsHIBwCeMjrQB/QLN/wS4+FMkMka/EfxzllIG7VIGXkdx9mGR6jNfzy+PdB1f4PfE/xX4H0rV5jceG9SvdKa7ty9u062k7RFsK2QHKBtuTj8K/onf8A4Kt/snqpYXGtMQCcDTuT7DMmK/nQ+LPjS3+I/wAUvF/xBtLZrKDxLq99qUcDsHeJLud5gjMMAlQ2CRQBzGpeJPEWsxLb6xql1fRI25UnneVQ2MZAYkA4PWv37+CP/BMv4e6z8JPCWv658QvFkF9rGm2+oSx6ZeQ2lpGbxBOEjiaGUjaHwSWO4gtgZwP56q/om+DX/BUL9m7w78J/CPhvxVHq+n6to2l2lhcwx2gnQPaRLDuWRXAZX2bhwCAcEZFAHyB8R/2AvDVj+2p4O+A8XjDUrrQvGOnPqsl5eBJtRiitUm8yHzcKjs/2chHKAIGGVbb832TqP/BHz9n+TT7mPSfFfiW3vWjcQSTTWcsSSkHYzxraxl1BwSodSRwGHWvlPx9+318J9b/be8CfHbSdN1Gbwl4U0uXSZ5GREuZPta3AeZIST8sRn+6WBbacYyK+4tQ/4KwfssW1hc3FidavLmKN2igFj5fmuoJVN7SYXceMngdaAP5vXvdc8IatqGnaRqc9o8EzwSPbyvD5nlMVBO0jjuAelU9R1zXNeeFNZ1G5v/KJEf2iZ5dm/Gdu8nGcDOOuKh1m/Gq6vfaoqeWLyeWYJnO3zGLYzxnGaz0bY6v12kH8qAP6JNB/4I/fAgaJYjxD4s8RXOp+TH9pltZbSCB5do3mON7aRlUnoGdiB1Jr8d/2v/gNpP7N/wAc9X+GOgalNqumQQ291bS3KqJ1iuU3hJCgCsy8jcFUHrtHSv2/0P8A4Kv/ALL1xo1jPqya1p968MZnt/sQmEMm0bkEiuA4B4DADI5wOlfih+2n8cvDH7Q3x91j4jeDba4ttHkgtrS3N0Assq2ybDIUBOwMc4XJOMZwTgAHyjX7F/sYf8E5fhh+0B8ErH4r/EHxHq9vcavc3MdvbaY0EKQxWsrQHzGmhmLszIWyNoAwME5NfjpX7Z/sP/8ABQP4H/A/4C6b8LfiPDqdpqWjXV2yS21uLmKeK6macMCGUoVLlSpB6Ag84AB5h+2F/wAE9fA/wNufh43w68S6hLB4z1yDQZk1QRTtDLcn5J0aBIQVUA7kK5PBDdq+0rb/AII/fs8JbRJd+KPE8s6ookdLiyRWcD5iqm0YqCeg3HHTJ618pftpft8fCP4xXHw0i+G1hqF/H4P8QW+vXcl1GLQOLU/LAgJclnySWIwvHDZOPuO3/wCCrv7KUtvHLNLrcEjqrNG2n5KEjJUlZCCR0yDigD8/PgX+wH4e8RftWfEv4Rar4y1K00n4dJC8d1puy2vrkX6B4gZGDomxGxJhTvPQKDx9HftJf8E2/AXg/wCB3jHxr4e8f+Kbu+8NadPqiQateRXdpMtmhlaNo0hiYMyqQrbvlOCQRxXhnwT/AG/PhR4R/ay+K/xe8T6XqNp4a+ICW0dq8aJNcQfYEWNDLECP9cFz8rHYcL8wyw+hf2i/+CmP7O3jn4HeNvA3gyPVr/WPEmlXWm26S2gt41N3GYjI8jM3CBi2ACWxjjOQAfz7V6j8Evhynxd+LfhP4ZSXx01PEmoQWTXITzDEsjYZguRkgdBkc15dXrfwG+Ilh8JPjL4O+JWqWkl9Z+HNSgvJoYSBI8cbfMELcbsdAcAnjI60Afu+/wDwR/8A2cyjCPxN4pVyDgm5siAexI+xjP51+CPxB8Pav8G/il4s8CaXrExuPDWpXulNeW5a3adbWZoy2FbIDFA23Jx74r+iRv8Agq1+ycqlhca0xAzgadyfbmTFfzqfF7xtbfEr4q+MPiHZ2r2Nv4m1e+1KOCRg7xJdztKEZhgEqGwSKAOU1LxJ4i1mFbfWNUur6JG3Kk87yqGxjIDMQDg9axaKKACiiigD9af+Cff7Evhf9oP4ea/8R/FHi7W9CSDUm0uG30WZLVyYIY5mkmkdJd4PnAKoUbcEknIA3/29f2FvCPwK+EVl8TfC/jHXtaktNQis5bbW7iO7UrdA4aFkji8sqU+YENuGOmOc/wD4J8ftxfB/9nL4X678PPidBqEE1zqz6nb3FpCLhJFngihaNl3KUZDCDnkMG7Y53v29f28vgt8f/gxb/DT4aQ6jc3txqUF3NNdQC2ihjtg3HLMXZy2AAAAAST0BAPxpqxaXd3YXMd5YzPbzxHKSRsUdT6hhgj8Kr0UAdFeeLvFmo2z2Woa1e3VvKMPHLcyujAHPKsxB5r9fv2G/2B/B/wAZ/gjb/FPxR418QaRNrV3cJFa6LcR2kccdpI0OZTJHKZHZlJBG0AEDk5Nfi/X7YfsOf8FAvgh8DvgNYfC34kQ6naalpF3dukttbi5iniupWmDDDKUKlipUg9AQeSAAeQ/8FCf2MPDX7Ovhjwx478L+LNY16HUrxtNmg1qZLmVGMbzK8UqJGAuEIZCp5IIPUV+VtfrD/wAFDf21vhN+0n4K8L+CfhjBfy/2ZqDahc3N5CLdFxE8Kxqm5mYneWJ4AwBzk4/J6gAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/9D8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/o8/wCCSPhrw7/wznrGvnTLY6leeILmGa5MSmaSKCCAxIzkZKoXcqOgLH1NaX/BVnwt4bl/Z/0LWpNLtjf2niOyghuPKUSxxXEcvmorAZCvsXcM4O0egr4h/wCCfVp+3HN8PNfk/Z7utEt/CP8AaABGv5MRvRGPN+zCNWcHZ5fmbsL93bzuqb/goBb/ALdFr8O9BuPj/eaJN4TTUcj/AIR/cI1vdhMJuRIquTtEnl7cqDu3c7aAP6AtI8KeGNB0u00TRdJtbHT7CJILeCGFEjiijG1UVQMAADAFfmH4D8BeCE/4KnePgug2QFp4Uj1OECBNsd9O1mktwq4wJXWRwzYydzHqTX5v6P8A8FT/ANrDSdKs9Le+0m/NpCkX2i5sd88uxQu+RlkUM7YyxwMnms79nL4n/tefHH9q29+Ivws1G1uPHep2U7X8l4oj02PTU2J5UqAEiFG8pUCgtv2HJOTQB/RX8cfCvhnWvg14403V9Ktby1k0W/ZopYUZS0cDuhwR1VlDKeoIBHIr+Mmv6Hfjbp//AAVA/wCFSeLDrN/4Sk00afObxdG8xdQNqF/fiAzRhN3l7s8htudnzYr+eKgAooooA/ZX/gjr4d0DVPHXxF1nUtOt7u/02xsEtZ5Y1eSBbiSbzRGWB279ihsckDHSv1U/bR8K+GdW/ZY+Jg1PSrW5+x6Jd3cG+FSYriCMvFKhxlXRhkEc/hmvwT/4J92/7U0/xD1//hmSexglWxT+1m1b/kHeUWPkCQAM5k3bvL2DP3s/Lur7q/arsf8AgpKvwH8VP4/vvDE3hVbfOrLoG9b02Wf3v+uRf3WP9aFO7Zn+HdQB+DFfUP7FehaL4l/ao+G+i+IbGHUtPuNUUyW9wgkify43ddyNkMAyg4PHHNer/CT/AIJv/tG/GPwBpfxH8PrpOm6VrSGW0XULuSKeSHOFl2RxSAK/VckEjnGCM4es/st/tPfsz/HnwD4e0iKFfGet3Cz6Bd6dOJYJJom2yKWlVMeWCPNDrt2NzlSaAP6qpdG0eaN4ZrGCSOQFWVokIYHgggjkGvy1/wCCd/gfwbpfxO/aLfTtEs7dtL8XXOm2hWFc29lHPPtt4yR8sY2r8o44GegrrLmw/wCCqn2eXytS8A79jbdiz7844274tufTdx68V+en7FNn+3ZJ47+J/wDwqa50+DUEvnXxMfEh3QHVvOff/q1ZzcbvM3Fflxncc7KAP07/AOClXhfw3d/sf+M9TutLtpLvSZNOntJjEvmW8r30ELPG2MqTHI6HHUMRX8s9fth+3BZ/8FBovgTfP8Zbzw9P4IF1bf2kvh/eJceYBCbjzUUmHztnC/x7MjFfMfgP/gl/+014+8HaP41sv7F0211q3S6hgvryRLhYZRujLrHDIqllIYDcSARnByAAfnXRXtXx5+AXxF/Zy8cf8ID8SbeGK+e3ju4JraTzbe4gkyBJGxCtgMrIdyghlPGME+K0Af0b/wDBI7w14eP7O2ueIDplsdTvPENzBNcmJTNJFBb27RozkZKoZHKjoCxPc1f/AOCs/hrw837Nen66dNt/7RsddtI4LgRKJYknjl81VcDIV9i7h0O0Z6Cvxp+AH7aPxz/Zs0DUPC3w6vrR9I1G4F01tfW4uEjn2hGePDKVLqFDckHaOBzmf49ftqfHj9pTw9YeDviBe2i6TaXH2kW1hbC3WafG1GkJZi2wFtoBA+YkgnGAD5Ior9L9G/4JQ/tUavpNnqkzaFpr3cKSm2ur2VZ4S4zslCQOodc4YBiAe9fDvxg+EXjX4GfEDU/hr8QLZLbV9MKljE/mQyxyKGjljfAyjqQRkAjoQCCKAPMq/qG/4Ji+GPDlt+yH4Y1WDS7ZL3VbrU5buYRL5k8kd7NCjSNjLFY0VRnoABX8vNftJ+wvZ/t/y/A6B/gnd+H4PBBvbn7AviDeX3bz55t/KRmEXnbs7sfPvwOtAH1D/wAFHvA/g3U9e+A9zqGiWc8t94zsdNuHaFd0tlO6mS3cgAtGx5Knjrjqc/p/Boei2sEdra6fbwwwqEREiRVVVGAqgDAAHAAr+cz9vi7/AG3fDdx4G1/49ajpsdhp901xpE/h4lbaHUYSHDyb1WQTqoBQkbQoO3nfXLW//BVv9rCGCOF7jRZ2RQpkfTvmcgY3NtkVcnqcAD0AoA8G/bk0LRfDf7WHxH0fw9Yw6bYRagjpBboI4kaW3ikcqq8Dc7MxA4ya+UK63x5458UfEvxhq3jzxpetqOt63O1xdTsAu5zwAFUAKqgBVUAAKABwK5KgD+tv9h7wr4Z0v9lL4btp2lWtsb7Sobq4KQqDLcTcySucZZ2PUn2HQAV8t/tm+A/BV/8Atjfszm90Kyn/ALav72C+DwIRdRWr27wpMMYdY2diobPUjpxX5XfCb/goh+0l8HPAmnfDrwzf6feaRpCmO0+32nnyxRE5EQcOpKLztByQOM4AA8++KH7ZHx5+LPxE8MfE/wAR61Ha614NYPpIsoVhgtpN4d3EZ3BmkKqH3Z3ABTwMUAf1wyaNpE0bRS2MDo4KsrRKQQeCCCOQa/jZ/aE0jS9A+PXxH0LQ7WOx07TvEerW9tbwrsjhhiu5ESNFHRVUAAdgK+y5P+Crv7V7xsiy6IhYEBl07kZ7jMhGR7givzp13XNX8T63qHiTX7p77U9VuJbq6uJDl5p53LyOx9WYkn3oAyqKKKACivRvhN8KvGXxr8f6T8NfANqt1rOruyxiRxHGiIpeSSRz0REBZsAnA4BOAfu3U/8Agk7+1Rp+nXV/DJoF9JbRPItvb30vnTFFJCR+ZAibmxhdzKM9SBzQB+ZlTW6hriJWGQWUEfjX1z+z/wDsP/HP9pDR9W8QeBrexsdN0e6NlJPqVw0CvcqA0kUYjjkYmMFS2QANwwTzif8AaA/Yb+Ov7Nfhqx8Z+OY9PvNJu7kWvn6bctN5MzDdGJBJHEw34O0qCMgg4yMgH9V2h+E/C+gaNY6Jomk2tjp9jDHDbwQwokcUSKAqKoHAA4FfzF/8FNdC0XQf2t/EMOiWMNhHd2dhcyrAgjV55oQZJCFwNznlj1J5PNfqR4L0/wD4KrjwjowuNQ8GpILSHI1USm/HyDi5MUZQzf3ypPzZr8sfiT8BP2rv2gf2uNe+HHjqK1u/iC0X2u5m80R6bBp8SKIpY2VSVgwyKg2F9zAMN26gD4Fr+oL/AIJheGPDlt+yL4c1WDTLZL3VbzUpbucRL5k7x3csSNIxGSVjRVHoBX5NeMP+CWv7UHg/wtqniqX+xdUi0m3e5ktrK8le5kSMbn8tZII1ZgoJxuBOMDJwD9CfsK2f7fsvwQjk+CN34fg8Em9ufsK+IN5ffu/fm28pGYRebuzuwN+7HegD13/gsP4b8PQfDXwJ4ig023i1RdXltRdJEqzfZ2t3cxFwMlNyhsHgHkdTn8Aa/VX9vfw/+29rEngbRfj0dL1PT9SvDa6TD4fz9mfUpsIqSB1VzMynCZ+XbnbzurFt/wDgkr+1NNBHNJdeHYHdQxje/mLISMlWKW7LkdDgkehIoA9S/wCCPHh3QdV+InxA1jU9Ogu77TdOs1tZpY1d4BPLIJfLLA7d4UAkckDHTNfrN+2P4W8Nar+y58T01PSrW5FroN/dQ74lPl3FvC0kUqnHDo6hlI6EV/Nt4G+KHx7/AGGfi14k0PRXi0nxBaZ0/U7K5Rbm1mC/PGxAIDABg8bqQcN6MQfRvif/AMFG/wBpf4seBdW+HniC+06z0rXIjb3ZsbPyZpIG+/FvLthXHytgZKkjOCaAP3n/AGGvCvhnS/2Ufhw2naVa2zX+mR3dwUiUGa4mJLyucZZ27k9gB0AFfMP7aXgPwTqH7Xv7MxvtCsp/7a1K8t77fAhF1DbPbPDHMMYdULuVDZHzHscV+Vfwl/4KH/tJfBrwJp3w68M39heaRpIZLT7faefLDETkRBw6EopztByQDjOAAPP/AIpftkfHn4ufEHwx8TPEmtR2useDWEmkiyhWGG1kLh3kEZ3BmcqofcSGChSMDFAH9cMmj6RKjRS2MDo4IZTEpBB6gjHSv43f2itI0rw/8f8A4k6FodpHYadp3iPVre2t4VCRQwxXcipGijgKqgADsK+x3/4Ku/tXujKsuhoSCAw045HuMykce4rwb4JfszfHX9snxF4o8S+F5ba5uoJjd6pqWqTmFJbu8dnIyiOzSOdznC7QAckZAIB8m1/ZH+zr4U8M6L8Bfh7Y6RpVrZ250HTZSkUKKpknt0lkcgDlndmZj1JJJ5NfzffHD/gnx+0F8A/ANz8SfFyaXqGi2MkUd02nXTzSW6zNsSR1kii+QuVTKkkFhxjJG74B/wCClv7UHw88G6R4I0u/02+stFt0tbeW9svNn8mPiNGdXTdsXCg4zgDJJ5oA9b/4K6+H9C0X9oDw5e6Rp8FlPqnh+Ka7eGNYzPKlzPErybQNzBEVcnnAA6AV+UtfVeueKfj1+3l8ctH06/kh1XxRqca2dnCgW1tLW2gVpZCBztjUb5XPzMSTjPC19E6l/wAEnP2p7DT7q+hl0C+kt4nkW3gvpfNmKKSEj3wIm5sYG5lGepA5oA++f+CRHhnw637P3iPxE+mW7apdeIri2lumiUzPBBa2zxxlyM7UaRyB0BY+tdF/wVi8NeHn/ZmttbbTbf8AtDT9bs0t7gRKJYlnWQSKjgZAcKu4dDgZ6Cvxj+A/7Yvx4/Zf0zV/CHgG7tk0+9uvOms7+389IrpB5bugDKVZgqq/JB2rxxUvx8/bb+O/7R3hmz8HfEK+s49HtLj7Ubextvs6zSqMI0pLMW2AnaAQMkkgnGAD5Hoor2H4G/Az4gftD+PYfh18OLeKbUpIJbmSS4k8qCC3iwGllcBiF3MqjCklmAxQB49RX6P+Lv8Agln+1D4R8Man4ok/sTVI9Kt3uXtrK9le5kSMbmEayQRqzBQTjcCcYGTgHzX4C/sD/Hz9ojwQPiH4Kj02x0SWeSCCXUrl4WuDEdsjRrHHKSqsCpLY+YEDODQB8VUV9VftF/scfGX9mCz0jVPiNDZT6drUjww3WnztPEs6Dd5Um9I2ViuWX5cEA4OQQPlWgAooooAK+i/2RtF0jxF+018NdE1+yi1HT7vW7VJredBJFIu7O10bIYZHIPB7186V6P8ACCP4gy/FHwtH8KGkXxg2oW40oxlQwu948s5f5MZ+9u+XGc8ZoA/tAfR9JkRo5LKBkYEEGJSCD1BGK/ji/aR0bSvD37QfxK0HQrSKw03TvEeq29tbwqEihhiupFREUcBVUAADoK/oAmsP+Cqfkvs1LwBu2nG1bjdnHbdFjPpnj1r8YPhv+yR+0f8AtO/Ebx3DHFDH4g0G/m/t+71e48oDUpZn8yNjEshaVnDsdq7eDyMqCAfGlf2P/s3+FPDOi/AD4dWWk6Va2kDaBpsxSKFFBlntkllc4HLO7MzHqSSTzX84vxu/4J6/tB/AXwBd/Erxaul3+i6fJEl02nXTyyQLKwRZHWSKL5N5VSVJILDjGSP0n/Z9sP8Agpufgv4QPhq/8KR6IdPhOnLrfmNfiyI/0fzTCjLjytuznds27vmzQB8o/wDBXfw/oWjfHvwzfaTp8FlcapoMct08Mao08iXE0SvJtA3MEVVBPOAB0Ar8oa/Rn9p34Uftg/F/9qTQvhr8WorLUvGet2cSaV9gcJpi2CB3kkjJAZY42WV5S678hsAjaDuaj/wSb/ansbC5vYpvD969vE8iwQX0vmylFJCJvt0Xc2MDcyjPUgc0AfeX/BIXw14df4B+J/ET6Zbtqlz4intpbpolMzwQWts8cZcjO1GkcgdMsTXWf8FX/DXh5/2Y4dabTbf+0NP1qzW3uPKUSxLMHEgRwMgOFG4dDgZ6Cvxe+BH7YXx4/Zd0/WPB/gK7to7C9ujNPZ39v56RXSDy3dBuUqzBVV+cHavHFWPj3+258eP2jfC9p4M+IN9Zx6Pa3Aujb2Ft9nE0qjCGUlmLBMnaAQMnJBIGAD5Fr9L/APglFoGh67+1HM+tWEF+2m6Be3Vr56CTybgTW8YlQHOHCSOoPYMa/NCvWfgr8bPiB8APHUHxD+G16lnqsMUlu4lQSwzQS43xSocblJCt1BDKCDkCgD+vj4m+E/C+v/DvxNo+t6Ra31jc6ddLLDNCjo4ETEZBHYgEHqCARzXxP/wS88L+G7f9kvRNYg0u2S+1W+1F7ucRL5s7RXMkSGRiMnaihV9AOO9fkn4r/wCCn37VPizw3qXhme/0zT4tUge3kns7LyrhEkG1vLdnbaxGRuxkZyMHBHnHwL/br/aA/Z78GnwD4Ev7KbRFne4hgv7b7R5DSnMgiYMpCs3zFTkbskYJOQD9gP8AgpX4J8H6ivwVvL7RbSa4uvGlhp0shiUPJZXG4ywMwAJjcqCVPGenev09ttB0OztorOz062gggRY4444UVERRhVVQMAADAA6V/JT8cf20Pjz+0BLoD+NtWhtY/DNyL2xj06H7KiXan5bg8sxkTopJwvOAMnPvNr/wVZ/awt7aG3kudFuGiRVMkmnfO5UYLNtkVcnqcADPQCgDyb/goR4e0Lwt+2F8RNH8N2EOmWKy6fOILdBHGJbrTraeZgq4ALyyM5x3JNfGVdt8RviH4t+K/jfV/iH46vm1HXNbm865mICglVCIqqOFREVURRwqqAOlcTQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB/9H8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/ou/wCCTHjjwba/s8az4au9bs7fVbLX7m4mtpZkjlSG4ggETlWIO1zG4BHGVI7VN/wVj8ceDbn9nPS/DdrrdnPql9rttPBbRTJJK8VvFMJXCqSdqF1BJ4ywHev5y6sWkIubqG3J2iV1TPpuOKAK9fp5/wAEnfFfhnwv+0lqieJNUt9MOreHrq0tDcSCMTXH2m2m8tWbA3eXG7AE8hTjniv1D0f/AIJZ/sl2GlWdlqej6hqd3BCiTXT6jcRtPIqgNIUjZUUsecKAB0Ffhd+2r8FvCnwB/aF1/wCHXgmSdtFgjtrq3S4be8K3UQlMW/qyoThSfmxjJJySAf06/HH4ieAtG+DfjfUNU8RWFvbpo18hdrmM/NLAyIoAJJZnYKoAJJIAGTX8blFFABRRRQB+xf8AwR+8X+FfD/jr4h6PrurW2nXuqWNg9pFcSrEZxbyTebsLEAlA6kjOcHOMAkfqb+2d8QfAmn/sufEqO88QWEb3+i3dnbp9ojZ5ri4QpFEiqSWZmPAA9ScAEj8R/wDgnJ+y78M/2lPGHi4fFFbm60/w1aWzxWlvK0Allu3kXc8iYfCCPhVIyTknAwfvf9p7/gnJ+zV4I+AvjXxx4H0++0fWvDmnTajbzfbZrhGNspcxvHMzKVcAgkYI4IPGCAfW/wCxN8QfAt/+yx8OIbTxBYvJp+kwWdyhuEV4biAbZI3ViCrKexHIwRkEE/Mf7XHxS+HFh+2f+zhPd+JbBItCuNQl1CTz1ZLRL0RRwNM65VA7IwGSMAZOF5r+c2vb/wBm34Z6R8Y/jp4M+GWv3Etppuv3yw3EkGPNESq0jBC2QCwXaCQcZzg4wQD+wOTxp4OhjeabXbBI0BZma6iAAHJJJbgCvy6/4J5/Ev4fXvxN/aIW38Q2ROs+LLnVLLfMsf2ixknn2zx78bkO5eR03DOMjPsEn/BLv9j+SN0Xw7fxlgQGXVLrKk9xlyMj3BFfA37Gn7CnwY+J3jr4w6R8R2vdas/AOvTaFYxrM1rvWKaVfPkMJDFyIwNoO0ZPB4wAfev/AAUk8e+CI/2Q/GOjHXrJr/WJNOgs4EnR5J5UvYJ2VFUknbHG7HsAPpX0j8AviJ4C1j4IeA77TPENhcQf2Jp8W4XMYxJDAkcikEghkdWVgRkEEGvzB/bc/YB/Z8+Ef7O/iD4n/DeyvdI1jw9LZyDfdy3MdxHcXMds0brMzbcebvDLg5XHQmvwjoA/Uf8A4K0eLfDHij9ojQ4PDmqW+pvpHh+3tbv7PIJBDO1zcTCNiuRu8uRGxnowr8uKKKACrNm6x3cEjnCq6kn0ANVqKAP7YtE+I/w/8QaPZa5oviTT7ywv4Y54Jkuo9skcihlYZbPIPfmv5kv+ClXibw94q/a08SXvhvUYNTt7W1sbWSS3cSIs8EIWWPcOCyNw2DwcjqDXwVRQAV/Tv/wTL8d+Cv8Ahkfw1oja7ZJqGkXWpRXdu86JLA8t5LMgdWIPzRyKwPQg9cg4/mIr9z/2GP2CP2f/AIyfs9aP8UPiXZXuravrtze8Jdy20VvHbXD26oiwsu7Pl7yzc5bAwByAb3/BX/xr4Q1P4e+A/DOmazaXmqjVJrw20MyyyLbrA0ZkYKTtXeQozjJzjODj8Eq/Zv8AbV/YS+C3wr1j4VJ8NDe6JD4z8Q22gXsbzNdqEuXGJ0MxLB0BI252tx0IOfvCD/glz+yBDBHFJ4e1CdkUKZH1O5DOQMFm2sq5PU4AHoBQB/LpRXvP7T3wv0T4L/Hzxn8MfDc81zpehXgjtnuMGXypYkmVXIwGKB9u7AzjOBnFeDUAFFFey/s8/DrSvi38bvBfw2124ltdO8QalDa3EkGPNETHLbC2QGIGASDjOcHpQB41RX9Rsn/BLv8AY/eNkXw5fxlgQGXVLrKk9xlyMj3BFfzZ/FnwdafDz4peMPANhcPd23hvWL/TYppQFkkS0uHhV2C8BmC5IHGaAPPqKK/pE+DH/BM79l3WfhN4Q13xVpl/q+ratpdpe3Ny1/PBvkuolmIEcTKiqu/aoAzgDJJySAfk7/wTm8TeHvCf7XPg3U/E2owaXZypfWyzXDiOPzrm1liiTceAXdgq56kgV/UNqfxC8B6Np11q+q+ItPtbKyieeeWS6iCRxxqWZmO7oACTX4V+Pv2D/g1pP7dfgb4IaTLf23g7xPpEmsXFr52+VDarcboEmbLhJTbgknLLubaRxj7u1P8A4Ja/sj3mnXVpY6LqFhczxOkVzHqVw7wuykLIqyMyMVPIDAg45BFAHnP/AASz+IPgcfB7xnoMmu2cWoxeKr69aCSZY5BbXUUCwy7XIO1zG4B9VOam/wCCqvjrwZL+zrpvh+DW7ObUr7XbOWC3jmSSWSO3WQyuFUk7U3rk9BkDqRXy9+wN+wx8Efjb8O/E/jX4ow3mr3FlrtxpFtDHcPaxxR2ccbmT90QzNIZeQTgBRjqTT/8AgoL+w78DPgR8GLL4kfC21vNKv4NThs5opLqS6injuUc5PmlirIU4KnByQQeCAD9vNC+I/wAP/EGi2OuaL4k0+8sL+COeCZLmPbJHIoZWGTnkHvz61+ZPhH4ofDo/8FTfF13/AMJJYfZ7rwoukxTeevlPfwtayPbrJ9wyKsb5GeqlfvcV/OrX27+wF+z94G/aO+Ok3g34iG4bRdM0m51N4LdzE1w8UsMKxtIPmVczbiV5O0DgEmgD+lj4sfEf4f6D8MfFerax4j0+1tINMu98jXMZA3RMqgAEklmIAABJJAAJNfHv/BMjx34L/wCGSvDuiPrllHqGk3mpRXdu86JLC8t3LMgZWIPzRurA9CD1yCBj/Ej/AIJhfsrQeAPEN14d0vUNI1O2sbia2u1v55zFLEhdSY5WZHBK4II5BOCDgj+aSgD+jb/go98Svh/aap8D7WbxDZGbTvGNjqlyiTLK0NjbsBJO4TcVRScZPXnGcHH6dW/jjwXdwR3Vrr+nzQzKHR0uomV1YZDKQ2CCOQRX8R9FAH1d+3H4j0HxZ+1d8Rde8MX8OqabPfRJHc27B4nMNvFE+1hwwDowyMg4yCRg18o0UUAFFf0E/spf8E6v2b/H/wAAPB/j3x7YX2s614js1vppReTWyR+afliSOFlG1AOpyScnIGAPiX/gpB+yt8Lv2ate8E3PwsS5tLLxPBfCe0uJmuFjksmhxIkjkv8AOJsFScDaCOpFAH5oV+53/BHrxl4T0jRviP4d1bV7Wy1O4uLC6it55Vjd4I0kR5FDEZVWZQcdCRnqK/DGv1S/4Jv/ALIvwk/aPsvGniH4qw3V/FoUlra21rBO9sm64Du0rPGQ5YBNoGQuCSQTjAB+oP8AwUa8f+CIf2RPGukPr1kb7WDY21nAs6PJPMt5DMyIqkkkRxux7AA1/LZX7x/tq/8ABPz9nr4Ufs7+I/id8OLK90fWPDjWsw3XctzHPHNcR27RuszNgfvdwZcHKgdCa/BygD7e/wCCdPibw/4T/a68Far4m1CDS7Nxf2wmuHEcfnXNnLFEhY4ALyMqjPUkCv6i9S+IPgTR9PutW1TxFp9rZ2UTzTSyXUQSOONSzMx3cAAEmv5Nv2N/g54Z+PX7RHhb4Z+MZZ49Gvzcz3It22SSJaW8lx5Yb+EOU2kjkAnGDgj949S/4Ja/sj3mnXVpZaJqFhcTROkdxHqVw7wuykLIqyMyMVPIDAg45BFAH8y/ia5gvfEeq3lq4khnu55EYdGVpCQefUViV+0H7A/7C/wR+NngHxX4x+KMV5q8+n69c6PbQx3D2sccdnHG5k/dEMzSGXBBOAFGOpqf/goH+w58C/gT8FrX4kfC60vNKv7fU4LSaKS6kuop47lW6+aWKshTIKkZyQQeCAD8WK/Sz/glP4p8N+F/2nrk+I9Tt9MGqaBe2ds1xII1luDPbSiNWbA3FI3IBPOMDnAP5p19s/sCfADwP+0Z8d38F/EM3DaLp2lXWpyQW7mJrhopIYVjaQfMq5m3EryduOMk0Af0wfFP4j/D/Qfhr4o1bWPEen2tpb6bdF5GuY8DdEygAAkkkkAAAkkgAEmvjT/gmL488Ff8Mm6DoT67ZR6jpF7qMd3bvOiSwtNdSTR7lYg4ZGDA9D65BAz/AIif8Ewf2VYvAniC48P6XqGkalb2NxNb3aX885iliQurGOVmRxkYII5GcEHBHzT+wn+wV8AfjN+z/pvxP+Jlpe6vqutXV4oVLuS1it4rWZ4FRBCVLFthYsx74AGMkA67/gr7418Ial8MvA/hnTdZtLvVTrD3n2aGZZZBbpbyRmRgpO1d7BQTjJzjODj8Ca/W/wD4KN/sbfBv9nbwZ4U8afCqC705tS1B9PubWa4e5icGJpVlDSkurLsKkAkEEcAjn8kKACiv0W/4Jz/sw/Db9pTx34ot/ieLm503w5YwzR2lvK0AmluXZAzyJhwECkgKRkkZOBg/oX+0l/wTg/Zn8G/Ajxx408FadfaRrXhzSrrUraf7bNcKWs4zN5bxysylZAu0nqM5HTBAP53q+h/2TPEGieFf2lfhv4h8SXsWm6ZY61ayT3M7bIok3Y3Ox4VRnkngdTxX6/8A7KH/AATr/Zw+IHwA8IePvH1hfazrXiO0F9NILyW2SMSk7YkSFlG1AOpyxJJyBgDwv9qL9hH4NeA/2g/gr4D8Dy32k6H8SL2exvoTMbh4RavDmSGSXcwaRZsENkKVBA5IoA/eF/Gfg+NGkk12wVVBJJuogAB1JO6vy8/YF+J/w71D41/tINa+I7FhrviiXU7AtMqfarI3FyPPi343J+8TkdNwz1FevP8A8EvP2PmRlXw5fISCAw1S6yPcZcj8xXwN+yB+wj8GfiN8UPjP4b+Ikl9rWn/DvWn0SxjWY2vmhZpl8+VocMX2wgbQQvzE4PGAD9A/+Civj7wRD+yL430p9esjeauLK2tIVuEaSeYXkMpRFUkkiONmPoATXun7OHxE8Bav8Avh3dab4hsJ4o9B023ci5jBWW3t0ilRgTkMkisrA8ggivza/bR/4J9/s8fCn9nfxL8TPh1Y3ukaz4dNrOha8luY5kluI7do3WYtgYl3ArggqOxIPq3wQ/4Jo/sv698H/BviLxZpl/q+r6zpVnf3Nyb6aDdJeRLOVWOJlRVTftXjOACSTk0AUPi78U/hxbf8FNPhHeTeJLBbfS9CutPupfPUxwXd7Hdi3hkcHaryebHgE/xLnrX6d6j8QPAmk6fc6rqfiLT7azs4nmmle6iCRxxqWZmO7gAAk1/Md/wUM/Zx+H/7N3xd0jQPht9oh0jXNKjv/s1xIZvIkEskLKkjfOVby93zEkEkA4wB8D0Ab/iu6t77xRrF7aOJYLi8uJI3HRkeRipGfUGsCv2K/wCCdf7FPwU/aC+Fmv8AxD+Klvd6ncwau+mW9vFcvbRQpBBDMZMxEMzOZsEE4AUY5Jrf/wCCgP7DfwK+BfwTt/iT8LrS80rULXUoLSWOS6kuop4rkN1EpYqyFcqVIzkgg8EAH4rUUUUAFFFfuL+wj+wZ8AvjP8AbD4n/ABNtL3VtV1i7u0VEu5LWK3itZmhVVEJUsW2lmZj3AAGMkA/Dqiv1y/4KNfsa/Br9nbwR4W8b/CqC7059R1FtOubaa4e5ikDQvMsoaUl1ZdhUgEgg9ARz+RtABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB//0vxjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAqa2mNtcRXCjcYnVwD32nNQ1d0xVfUbVGG4NKgIPIILCgD+kXwz/wU1sNX8O6Zql58GfGs1xd28Ukj2GnrcWjOygsYJS6l4yfusQCRjivxG/a9+NDfHv49+IviF/Yk/h5JDFZpZXXFzGlmghHnr/DIduWQcKflycZP9fFtbW1lbRWdnEkFvAixxxxqFREUYVVUYAAAwAOAK/l0/4Kf2tta/tf+JPs0KQ+dZabI+xQu52tkyxx1J7k80AfnzRRRQAUUUUAfoJ/wT5/acX9nPx14jhuPCOpeLrfxRZxI0OkJ517E9mzurLEcB0Idg/II4IPUH7q/aj/AOChVr4q+BXizwXp/wAKfFWiTeJbR9M+2a3aC0s4VuQVdt6sxZwudi8AnknAwfOf+CNNrbP4v+J168KNPDY6YiSlQXRZJZyyq3UBiqkgcHaM9BX6tftk2ttefsrfFOK6hSdE8P30gV1DgPHGXRgDnlWAZT1BAI5FAH8luh/Dzx/4msv7T8N+GdT1az3FPOtLKaePevVd8aMMjIyM16D8JPGHiH9nD42eFvH/AIi8PXC3fhy6ju30+8SS0llhYMjY3qCpKk7WwRkcgjIr+ob9iq0trP8AZR+F0drCkCvodrIwRQgLyDc7EDGWZiST1JJJ5r8uv+CzVrbp4h+Fd6sKLPLa6vG8oUB2SN7UqpbqQpdiAeAWOOpoA9xl/wCCxPwOEbmHwX4jaQA7Qws1BPYEic4Hvg/Svkb9jL9uJvh947+Kepap4A1bxGPH+qS6+YdAjN3PaSyzOWjZGK5iHm4D5BBABB3cfkrX76f8Ea7W2Hgr4k3vkp9oOoWEfmbRvKCKQ7d3XGTnHTNAHA/ttft32/xP+A2qfDGw+GfiTw0fEk9rFJe69ai0hRLaZLrEW1m3yM0QG04AUseoFfkBpPwz+I+v6fFq2heFNW1Gxnz5dxbWM80T7SVO10QqcEEHB6jFf08f8FJrW2uf2NPHss8KSvbHTJImZQxjf+0LdNyk/dO1mXI5wSOhNfS3wMtbay+CvgG2s4Ut4k0HTMJGoRRm1jJwBgDJOaAP407nw54hstbHhq80u6g1cyJELKSB1ufMkxsTyiA+5tw2jGTkY610t98KfijplnPqOpeDtZtLS2RpJZpdPuI440QZZnZkAVQOSScAV/Q/8StK0x/+CpfwrmazhaSXwjdzuxjUlpY/t6pITjllCgK3UAADpX6bTwQ3MMltcxrLDKpR0cBlZWGCCDwQRwQaAP4bKK1/ECJHr2pRxqEVLmYAAYAAc4AFZFABV/S9K1TXL+HStFs5tQvbglYoLeNpZXIGSFRAWJwCeBVCv1P/AOCRFrbXH7TOtzTwpK9t4YvJImZQxjc3dohZSfukqzLkc4JHQmgD86NV+GXxJ0LT5tW1vwnq2n2NuAZJ7iwuIokBIUFndAoySByetfrn+w5+3Rb/AAp+BVl8ML/4a+I/E3/CP3V0I7zQbUXcTJdStc7ZtzLskVpGAAyCuDwc1+2fxQtLW/8Ahr4rsr2BLmCbSr5XjkUOjgwPwytkEexr49/4Jj2tvb/sbeDpYIUie5udVklZVCmRxfzoGYj7xCqq5POAB0AoA/NT9tX9uR/iPr3w1TSvh/q3hseDNXh8Q7PEERtZrqW3cbI0jQt+6O07nznPAAxz952P/BSzSLyyt7s/BXx63nxo+YdNWWM7gD8j713L6NgZHOBTP+CjOladf6z+z+17Zw3Jk8eafbsZIlfdDK674juByj4G5ejYGRxX6bgY4FAH8cXxs8aeIP2jfjx4r8d6F4cuo73xDdtNHptvHJc3EUcCLEAwRdxYIgLkAAHPQV5rrfw7+IHhqxOp+I/DOqaVZhghnu7KeCLc3Qb5EUZPYZr+i/8AZh0rTbb9vP8AaXmt7KGF4v7J2MkSqV+0R+ZLggZHmMAz4+8Rk5PNfU37YdrbXn7LPxUiuoUnRfDuoSBXUOA8cLOjAHPKsAynqCARyKAP5KdD+Hvj7xPZHUvDXhrU9WtA5j860s5p4964JXfGjDIyMjNd38LPE3iP9nz41eE/HGv+Hrlb3w7fQXx0+7jktZZowcYAddw3DO07SM9j0r+oj9iW0trP9k/4Xx2sCQLJotvIwRQgZ5MszEADLMSST1JOTzXzF+2RpmnXP7ZH7LMtxZwyvPqWoI7PGrF1he1eMMSOQjMWUH7pJIwSaANK4/4KUaRDBJN/wpXx8PLUtl9LRF4GfmbzDgepwcV/OV8R/GU/xF+IXib4gXNstlN4l1O81J4EYusTXkzTFFY8kKWwCetf2y1/Gj+0la21j+0P8T7KzhS2gt/E+sxxxRqEREW8lAVVGAABwABgUAeK1+8fwl/4K0fCzwl8MvC/hPxZ4M1k6romn21jM1ibaS3f7KgiV0aWWN/mVQxBXgkjJAyfwcooA/VXxV/wUC0vxf8AtoeCvj34d8G3k2keHrH+xYtPLqdQuo7vzlkdVj3J5oa4IjjDENtALAtx+gXiD/gpnpulaFqOp2/wY8bxS2lvLKj3unrb2qsilgZpQ7FIwR87bTgZODX5Qf8ABMy1trr9sXwct1Ckwjg1ORQ6htrpZTFWGehB5B6iv6nJoYbmGS3uI1lilUq6MAysrDBBB4II6igD+cX9iz/goV4Q/Zy8E+IvBXjvwxfajFqerzavbz6a0TMHukRJY5EmeMAL5SlSCScnIGAS/wDbc/4KEeCf2lvhZZfDPwP4Z1HTVOoRX11c6iYVKi3VgiRJC8m4sXO4sRgAYBzx+XviaNIvEeqxRKERLudVUDAAEhAAA6AVl2wBuYgRkF1/nQB21h8K/ifqtlBqWl+ENYvLS5QSRTQ6fcSRyI3IZXVCGB7EHFfSf7FHxvv/ANmP4/PreqeFL/XZb2yutHutNtY2Goxl3jlJjhYDdIjwgMjY+Ut0IFf1fWNrb2Vlb2VpClvBbxpHHFGoRERAAqqowAABgAcAV+ZPhDS9OH/BVjxpOtnCJE8ER3Afy13CZns42kBxkOUJUt1KkjODigDlvip/wUos4/hx4jSw+D3jCxuZ7KaCOfVbEWtjE06+UGmlV2KqN2cAZJwuRnI/nQr+2L4l2lrf/DrxTZXsCXME2l3qvFIodHUwvkMrAgg+hFfxO0AFehwfCL4r3UEd1a+C9bmhmUOjpp1yysrDIZSI8EEcgirvwQtre9+NHgGzu4UuIJ/EGlRyRSKHR0a7jDKynIYEHBB4Ir+0cAAYHAFAH8QOl+HfEGuap/YmiaZdahqPzf6NbwvLP8n3v3aAt8uOeOO9bOtfDn4heG7BtU8ReGNU0uyQhWnurKeCIMxwAXdAuSenNf0X/s0aVptv+33+0pPBZQxSRJpOxliVWX7REskuCBkeYw3Pj7x5OTzX1V+19a295+y38VYrqFJ0Xw3qUgV1DgPHAzowBzyrAMp6ggEcigD81f2T/wDgoJbeDfgR4Z8Dah8LPFGvS+GYTp4vdDtBd2kqRcqSzMpWTaw3ryB1BwcD4x/4KGftQr+0X4q8J6fb+D9T8IW/he2uWWPWI/IvZnvmj3ExAkLGohXYckkls9BX7ufsQ2lrZ/snfDBLWBIFk0eGVgihAzyEszkADLMTknqTya/Mz/gs3a26ap8KL1YUWeWHWY2lCgOyRtaFVLdSFLsQDwCxx1NAH4h1+mn/AATw/axj/Z8k8XeF7rwVq/i+DXRb3g/sSL7RdQvbZj+eIkDyyJPv7shsDB3cfmXX72f8EabW2/4RX4m3vkp9o+26dH5u0b9nlzHbu64zzjOM0Ach+2p+3lB8SvgLq/w00/4ZeJfDZ8TTW0El7rtqLSBEglW5xEVZt8hMQG04G3ce2K/HjSPhr8RvEGnxatoPhXVdSsZ93l3FtYzzRPtJVtrohU4IIODwRiv6g/8Ago5aWt1+xt8QZLmFJXtk0+SIuoYxv9vt13KT0baxGRzgkdzX0H8ALW2svgV8O7ezhSCJfD2lEJGoVQWtY2JwMDkkk+9AH8q/7OHxVv8A9ln9oHQviD4p8P3Mr6E00V5p8qtbXKw3kDRMVWQDDhJN6BsBuASAc1+wupf8Fivg0mn3T6R4J1+W+WJzbpP9ljiaXadgkdZnZVLYyQrEDkA9K+Uf+CwdrbQ/HvwlcQwoktx4cjMjqoDOVu7hQWI5JAAAz24r8lKAP1Z/Yt/4KFeEf2dPB3iXwb478MX2oRavrE2sW8+mtEzLJdIiSxSJM8YCr5SlSCSckEcA1N+23/wUK8EftK/Cq0+GXgfwzqOmh9Qivbq51EwrtFurBEiWF5NxYudxYjAHAOfl/KCpIRmVAf7w/nQB3Gn/AAr+J+rWUGpaV4Q1i8s7lQ8U0On3EkciN0ZXVCGB7EGvpH9iv42X/wCzJ+0Add1Xwpf65Ld2d1o91ptrGw1GMyPHKTFCwBMivCAUbHyluhAr+r7TbW3stOtbK0hS3gt4kjjijUIiIigKqqMBQAMADgCvzK8L6Xpw/wCCrfiycWcIkTwQlwH8tdwmZ7SMyA4yHKEoW67SVzg4oA5v4o/8FKrKH4d+IhY/B7xjZXE1lNDHPqtiLaxjeZfLDTyq7FVBbPAyTgZGcj5w/YY/bnt/hP8ABGD4X3/w28ReJ/7Bu7ho7zQbYXaFLuRp9swYrsdWZgMEgrjoQc/uH8RrS2v/AIfeJrK9gS5gn0y8R4pFDo6mFgVZWBBB9CK+Lf8AgmDa21v+x34WmghSJ7m81SSVlUKZHF5KgZiPvEKqrk84AHQCgD8uv+Chv7X8Xx90Dwt4Es/Aus+EYdOun1J5Ndh+zXErbGhVYogWBQBmLMTknAAGDn8sK/oW/wCCxlpbN8H/AALfNChuI9eeNZSo3qj2shZQ3UBiqkjOCQM9BX89NAH3N+wt+1pof7KPjXxBq3ijQ7jWdJ8RWcdvL9jZBcwyQOXjZVkZUZW3EMCwI4IPBB+4Pj9/wVT+GXxJ+DXi74eeDvB+rxan4m06fTVlvzbxwRR3SGKSQ+VLIxZUYlRjBbGTjNfhzRQB+737Jn/BQO28GfAfw14E1D4WeKNel8MxHTxe6HaC7tZUi+ZSWZlKyYYbk5HQg84Hgn7U37dJ8W/Hz4UeObPwDqWhW/wznfUBZ60v2S8vGunj8wbBuCIFgARucsWyMACv2I/YctLWz/ZM+GKWkCQCTSIpWCKEDPIzMznGMsxOSepPJr81v+CzlrbJe/Ca9WFFuJY9ajaUKA7JGbMqpbqQpdiAeAWOOpoA9if/AILEfAwIxj8F+I2bBwCtmAT2yftBx+Rr5E/Y+/bmfwL8T/itr2p+ANU8Qr8RdRfXWt9BQ3dxZyGaRihRtu6L9/jfkEEAYO7j8lq/ej/gjRa23/CN/E+98lPtAu9Mj83aN+zy5zt3dcZ5x0zQBzH7aH7elt8SPgJrPw2sPhj4m8ON4mlt7d73XbUWkEaQyrckRlWbfITEAFOBt3NnjB3fg9/wVk+F3g34W+FfB3i3wbrJ1XQdOttPlaxNvJbyC0jEKOhlljf51UMQV4JIBIGT9w/8FFrW2uf2N/iG9xCkrQRWMkZZQxR/t1uu5c9DgkZHOCa/lAoA+1P21P2mLH9rf4taT4h8IaBdadZafYxaZZwTYku7h2laQkpEWUMXkKqqliQAc5OB813nwn+Ken2k1/f+DdZtrW2RpJZZdOuUjjRBlmZmjAVQBkk8AV9Xf8E1bS1vP2yfA0d5Ck6xpqcqiRQwV47CdkYA9GVgCD1BGRX9U0sUU8TwToJI5AVZWAKspGCCDwQRQB/Nl+wv+3z4O/Ze+H2t/Dzxv4av9Ut73Um1O2udOaIyb5YY4ZI5EmeMAAQqVKkk5II4Fbf7bP8AwUL8D/tJ/Ce2+GPgfwxqOneZfxXlzc6i0K7Vtw2xYkheTcWLHcWIwBwDn5fzA8YxRweLtchhQRxx31yqqowFAlYAADgAelc5QAVe0zS9T1q/h0vRrSa/vbg7YoLeNpZZGxnCogLE49BVGv1A/wCCSVrbXH7Ul9LPCkr23hu/kiZlDGNzPbIWUn7p2sy5HOCR0JoA/PjVPhh8StEsJtV1rwlq9hZW43Sz3FhcRRICcZZ3QKBk45NfqB+xr/wUc8Cfs8/Bi1+FHjjwtqV/Jpd1cy21zprQsJIrmQzESrNJHtZXYgbSQVx0IOf3x8f2ltf+BPEdleQpcwT6ddo8Uih0dWhYFWVsgg9wRX8StAH6Z/t2/t1+Ev2qPCvhzwZ4K8OXuk2ekXrahPcag0YleXy2iSONIXddu12LMWyTgADBJ/MyiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//T/GOiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACpYI5ZZ44of9Y7ALzj5ieOaiq1YypBfW88hwkciMfoCCaAP6RPCP7Ov/BROw8K6RZT/tB2mnSQWkKNbS6ZBeyQFUA8trmSEtMydC5JLEZyetfmXrn7IH7QPxo/bE8T/B/x54qttS8U29u2q3+uXDFonsSIxDIkSgEZ8yNFhUAR5wPlXNfvvpH7W37MetaVaava/FHw5DDexJMiXGp21vMquAQJIpXV42GeVZQQeCM1+cfgn9pb4Fwf8FKPG3ja48YWMPhvVfDaaNbapJIEsZL2A2ruv2hsRhMQuFkJ2MQApORkA+c/iD/wST+J/grwRrni/T/GmmaxNotpLefZBBLA0yQLvdVkclQ2wEjPBOASM5HmX7Nn/BN/4h/tF/DC1+Klt4n0/wAPabqU88VnHNHJPLKlvIYnkYRkBB5isoB5O3PQjP7dfGf9qr9m23+EfjIw/Evw/fTS6RewxQWeo291cSyzQtGiRwwu7sSzAcDjqcAEj5n/AOCdf7RvwJ8Mfss+G/Bnizx3o/h/WtDuNQjurXUryKykBnu5biNkE7JvQxyL8y5AOVPINAH5MftZfsReOv2ULLQta1zWrPX9J1ySS3Se2VomiuIxv2NG5JIKchgSOCDjjPxRX7df8FW/jn8IfiN4K8EeE/h94t07xNqNrqE17MNNuEu44oPJMQLyxFkVix4XO7HOMYz+ItAHqXwo+NfxT+B2uz+JPhT4in8P391CYJmiCSJLGTnbJFKrxtg8qWUlTyMV6h8Qf20/2n/il4UvPBHjnx5dX+iagFFxbpBa2wmVTnY7W8MblCeqltp7g18u0UAfUHw8/bQ/ad+FXhS08EeBPHl1p+iWG77PbPBa3IhDHJVGuIZHVM8hQdo5wBmqNz4p+O37Z/xb8MeFvFniJvEHiPU5F06xe7MdvbwIxLudkKJGgABZyqbmwB8xwK+ba+jP2R/G3hn4c/tJeAPGnjK8GnaLpmoq9zcMrMsSOjx72CgnaCwyQOBk0AfoVL/wRu+Iwjcw/EXSncA7QbOdQT2BO44Hvg/Svzu8HfF349fso+MfFHhbwJ4kl8N6pbXUunapFCIbqB57KVo2+WZJIyVZWCuBnBIBwTn+pmX9qf8AZohieZ/ir4X2oCx26xaMcDngCUkn2AzX8l/xs8R6R4x+Mnjzxb4fmNxpet69qd9aSFSheC5upJI2KtgrlWBweR3oA9B+KP7XX7Rvxo8Nf8Id8SvG1zq+itKkz2oht7aOR4/u+Z9nijLhTyFYkAgHGQCP2J+BX7P/AO38fg94Rl0j47W3h3Tp9PhmtNPm0+DUJLa2lG+GM3EkTM2I2XjcQg+QHCiv556/rN+Bv7VP7N83wa8ELcfErQLCe30ext5re91G3tLiKW3hWKRJIZnR1IdT1GCMEZBBIB+RXjz4I/thQft0eF/CmpfERb/4g6lax3+neIlcQxRafCsglItlUKip5cqtAE2yHOQQ5Nfffij9nf8A4KKXvhvVbO3/AGhbS9lmtZkWCPS4LN5WZCAi3EcIeEt0EikFeoPFeR/EP9pj4Fz/APBSH4eeNbbxhY3HhzRfD02kXeqRSeZYx3d0Lto1+0LmMp+/QNICUQk7mG1sfo5qf7Wf7Mek6bdapc/FLw3JFaRPK6wapbTysqDcQkUUjO7HHCqpYngAmgD+er9mD/gn98Rf2nfDOs+NLXxDY+HrDTdQfTg1yr3Es9zEoeb5YyNqqHT5ifmJOOmaX9qP/gn18Qf2ZPBuneO7/wAQ2PiLS7y9Wxl+zo8EkM0qlovlkJ3q21gSD8pA4wcj9B/+CaH7Q/wR8IfB/wAUeFvGXjTS/Dmp/wDCSXmoLFqdzHZeZbXUUKxvG0xRX5jYMFJK8bgMjL/+Cmn7QnwS8ZfAnSfCHgvxrpXiPVrjXLS7EGmXUd6Ugtkk8x5GhZ1QfOoG4gtztzg4APn3Rv8Agjt8U73SLO81fx1pWnX08KPPbC3mm8iRlBaPzFYK+08bgMHtxXkPwb/ZV/aQ+HH7Yt98Hfhr4vt/Dfijw/YS30mtRHfbtpkoQKzQOG8zzGkjBhdTtb5uihq/ebRf2tv2Y9a0iz1e1+KPhyGG8hSVEudTtredQ4BAkhlkV42HQqwBB4Ir85PCH7SvwMg/4KV+L/G8/jCxi8N6l4aXRbfVHkC2D3sLWzsv2g4jCYhcLITsYgBWORkA7L4xfs9/8FBpvhb4oS8+PFtr1qLCZ57CHT4NPkuYUG6SNbmOJWQsgI+8A33SQCa/GT4V/ta/tE/BTw43hH4ZeNLnR9GaZpxamG3uY0kf7xQXEUmwMeSFwCeSMkmv6WPir+1h+zVYfDTxTcj4meH71v7NukSCz1G3u7iV5I2REjhhdndizAYA46nABI/kcoA9x+Kf7Snxz+NV5pN/8S/F93q82hMZLHAjtlt5CQ3mIlskSiTIHz43DAGcCvYIP+Ch37ZNtBHbx/Em4KxKEBeysHYhRgbma2LMfUkknqTmvi6igD9Fv2IPDn7UXxv+Mvizxf8ACz4hv4Z1z7N9o1vV7wi6Nx9pc+Wj27q6ylmUlSVxGF4IO0H7V/ao+A37dln8B/FeqeMfjXb+LfD+nWxutR02Cyh0557SH55f3sUaFgoG4xlgHAxycA/On/BKX4w/DL4W+O/HNj8RvEdn4bOuWNp9kmv5Vt7eRraSRpFMzkIrYcFQxG7nHIxX6a/tcftQfs8XX7NvxD0bSfiJoer6jrGj3dhaWun38F5cS3F1GY4wI4HdguT8zEbVHJNAH4E/Dv8AbP8A2nPhT4UtfBHgPx3dadoliW+z2zwWtyIg5yVRriGRlXPIUHaMnAGTXGePP2jvjh8TPGej/ELxr4wvb/xB4f2f2ddKUtzaFG3hoUgWNEYtglguWwMk4FeJ0UAfakn/AAUR/bKljaJviROA4IO2w09Tg+hFsCD7jmpP2W/2O/iJ+2Ne+J9ftPEVvpcGlSI13fX/AJlzNcXd0S+NqncxIDMzseuOpJx8T1+0v/BJ/wCNvwm+G2i+P/DfxD8V6f4ZvdQuLO7t/wC0rhLSKWKJHjfZLKVQsGYfJu3YOQCAcAHz9+0b/wAE1/iL+z58Lr/4qzeKNP8AEOnaTJCt5DDFJbyxxTyCFZF8wkPiR0UqOcNnoDX5t1/Sf/wUF/aR+A3iL9lbxb4P8L+PNH17WddaxgtLXTb2G9lZoruGdy4gZ9iCONjubAzgZyQK/mwoA6rwV438WfDnxRp/jTwNqk2ja3pcnm291A2HRuhBByGVgSGVgVYEhgQSK+n9S/4KC/th6tp91pd58SLoQXkTwyeVaWUMmxwVOySK3V0bB4ZWDA8gg18bUUAfev7K37BXxA/ar8Kat4907xDZaBpVlemySS6R55bi4VFkl+VCCoVXT5mPzFuOhq1+1L/wT98f/sveCLH4hah4isfEOlTXa2c5t0eCWCSRS0R2uTvVtrAkHKkDgg5H3h/wS0+P3wY8B/A3XfBPjvxlpnhvWIddnvvK1O6jsxJb3FvBGjRvMyq/zROGCkleMgAjOt/wU8/aB+Cnjb9nyz8GeCfGuleI9YvdYtrhINMu4r0rFbpJ5jyNCzrGPnUDcQWP3c4OAD8vtG/b+/a/0HSbPRNN+I90LWwiSCLzrWyuJAkY2rulmgeRzgfeZiT3NdX+y3J+01+0d+1BL4m8E+PJNK8cy2lxe32t3RVglmmyJkMG0xyIWeNFhCbF4IAC5HwhX6J/8Exvih4A+FX7Rl3qnxE1u30Cw1XQ7uwhurtxFbi4ee3mVZJWwsYKxNhmIGcDOSKAP0W+L/7PX/BQef4X+J0u/jzba9bCwmaawh0+DT5LqFV3SRLcxxK0ZZAR94A/dJAJNfnd+zT/AME4/iF+0d8MoPila+J9P8PaZfXE8NpHPHJPLKtu5jeQiMgIPMVlAPJxnABBP7nfFH9rD9mnT/hv4nuv+Fm+H7xhp10iwWeo293cSPJGyKkcMLs7sWIGAPc4GSPk/wD4Jy/tF/Arwt+y7oXgzxb460jw/rWi3d+lza6neRWUg8+6knjZBMyb1KOPmXIByDyKAPzE/aF/YK+Kv7NuseCpLTXbTXW8V6lFp1hcWjNaSQ6k7DyVPmHK56rIGwpBzjgn9adP/Z8/4KJQ2FtDN+0ZZRyJEisp0e3mKkKAQZXg3Pj+83LdTya8Z/4KCftJfA3XNT+DUHhnxjp/iBtA8WWetXx0uZb5LeytmAdneAuu/wDupnccE4xX6O2/7VX7M11bxXUXxV8MBJlV1D6vaI2GGRlWkDKfUEAjoRmgD+ZbxX8QP2kv2W/2hvGh/wCEyuLbx5HcSQapqEUiXSXwlCyq7rMrI6srKyBkynAAUjApePv21v2ovif4UvvBHjbx7dX+iakoS5t0t7W281Ac7Ge3hjcqcfMu7DDggiq37Zfjnwt8Sf2nPH3jTwVfLqei6hexi3uUBCSiGCOFmTIBKlkO09xgjg18x0AfT3w6/bN/ab+E/hW18EeAvHd1p2iWRYwWzwWtysQc5Ko1xDIyrnkKDtBJwOTWdqXjT46/tj/FTwv4Y8YeIn8Q+INSmj03T2uzHb28AmbJOyFEjQd3ZU3NgdSAK+cq98/Za8YeHfAH7RPw+8ZeLbsWGj6Tq9vNdXBVmEUQOC5CgnAzk4B4oA/Rt/8Agjb8RQjGP4jaUz4OAbOcAntk7jj8jX53+E/it8e/2TPHHinwr4H8SS+G9XtLqbTNUig8m6t5JrOVo2+WZJI2KspCuFzgkA4JB/qYk/am/ZoijaRvir4XwgJONYs2OB6AS5P0Ffyb/HfxPo3jX42+P/GPhyc3Ola5r+p3tpKVKGSC4uZJI2KsARlWBwRkd6AO7+J/7Xv7R/xm8MN4M+JHje51bRXlSZ7UQ21skjx8r5n2eKMuoPIViVyAcZAI/X/4BfAD9vtvgz4Qn0T46W3hzS7nT4Z7PTprCHUZLa1mHmQIbiWJmb92y4XcQg+QcKK/nur+sX4BftUfs4SfBHwJDdfEnQNPubTRbC1nt73UYLS4imtoEhkR4ZnR1w6HBIwRggkEEgH42fHv9lz9pfx/+114f+EPxN8ZW/ivxJ4pskuLPV5SIbePT4FkMpFuiqIvK8qQ+Wije3zdXJr1rU/+COfxPttOurjTPH2lXl5FE7QwNbTRCWRVJVDISQu44G7Bx1xXtfxP/aX+Bc3/AAUa+GXjW18Y2Nz4d0HQ7jTL3U4ZPNsobq8S68pTOmYyv75N7glEydxG1sfo9qP7WP7Mml6fc6lcfFPw08VpE8rrDqttNKVQFiEjjkZ3YgcKqlieACaAP55P2X/+CfvxE/aX8P674os9esfDmnaLqD6ZuuFa4ea6hVXmULGRtVA6fMT8xbjoasftR/8ABPn4gfsxeB7L4g3/AIisfEOlzXiWU/2dHgkgklBMR2yE71bawODlTjgg5H6A/wDBNT9on4I+Evhh4z8M+MfGem+HNRl8T3upxx6pcx2QltbuKFY3jaYqrnMTBlUkrxkDIqz/AMFNv2g/gl4z/Z+s/B3gvxrpXiPV7zWbW4SDTLuK9KxWyuZHkMLOIwNwA3Ebj93ODgA7vwR+zr/wUSsPB2i2Uv7QNrpjQ2cKG0l02C+kt8IP3TXMkTNKydC5JyRnJ61+R3x41z9pX9mj9qfWdd8Q+OJrv4gQKsn9tW7Ky3NrcxjYDCymNY9mB5LJsUqMDAU1/Rp4f/a2/Zj1rQtP1a2+KHh2CK7gjlWO61O2tp0DKDtkhldXjcdCrAEHg1/Oz/wUT+Ivgr4nftQ654i8A6tDrelQ2llafa7Zt8EksEe2Ty3HDqDxuXKnsSOaAOV8Tft4/ta+MPD9/wCF9e+Il1Lp2qQtBcJFbWds7xPwyiWCBJFDDg7WGRkdCa+4/wBhL4LftleI/gqPE3wm+LUHgTwpqN7ObSynto9QMjxMY5pVWWNxADIpG0EbiCxHQn8Yq/ox/wCCcX7RnwK8K/swaL4L8XeOdI8P61ot3frcW2p3kVk+Li5kmjaPz2QSKUcfMuQDkHBFAHwv/wAFD/hR+1L4K0nwnr/x0+I0XxA0SaeW2tTBClklrdFS5DW0aIrF0U4kwSMFTgYz+W1fuJ/wVZ+Ovwf+Inw88GeEPh/4u07xNqcGqvfSrptwl3HFAsDxZkkiLIrFnGFJ3EZOMCvw7oAKKKKAPp34c/tmftNfCbwrbeCPAPju603RLNmMFs8FtcrFvOSqNcQyMq55CghQSSByaztV8b/Hb9sX4o+F/DHjHxE/iHxBqM0emaebox29vB5z8nZCiRoCeXYJuYAZzgCvnOvef2XvGHh7wB+0N8PvGfiy7Fjo+kavbT3U5VmEUQbBchQTgZycA8UAfo8//BG34iBGMfxG0otg4Bs5wCe2TuOPyr88PC3xS+Pf7JPjvxV4V8EeI5fDesWdzNpmqRweTdW8k1nKUPyTJJGxVgQrhd2CQDgkH+pd/wBqb9miNGkb4q+FsKCTjWbMnj0Alyfwr+Tz4++KdE8b/HL4geMvDU5utJ1zXtSvbSUqyGSC4uXkjbawDDKkHBAI70Adx8Tv2wP2kfjH4XfwX8RvG9zquiSyJLJarDbWyStGcr5n2eKMuoPIViVyAcZAI+yvhh/wSd+J3xC+H2geOr3xnpmitr9nFfR2jQy3DRw3C74t0iEKWaMqxA6E4ycV+UNf1g/s+/tT/s4t8DfAVvd/EnQNOurLRNPtJ7a+1CC0uIp7WBIZUeKZ0cYdDgkYYYIJBBoA/n4+OHwY+K/7C/xm0eGz8RIurxQR6npeq6cxjJQlo23RvkjDq6MjbldeuQxFaOof8FB/2xdTsLnTbr4kXQhuo3icxWdjDJtcFTtkjt1dGweGVgwPIINe0/8ABUr4r/Dr4qfG7w/N8OtetfEVto2ipa3NxZSCa3EzzyzBEmXKPhHXJQkA8E5BA/MugB8kkksjSysXdyWZmOSSeSST1JpoGTgd6SlU4YE9jQB+wOgf8Eevinqeh2Go6v450rTL26gjlmtRbyz+Q7qCY/MVgrlc4JHBPTI5ryb4V/snftHfC/8AbHPwe+HPi628PeKNJsJNSGtwtugOmSAJvaBwxfezKhhdThvm+6oev3d8Nfta/syaz4e03Vbf4oeHYI7q3ikWO61O2tp0DKDtkhldXjcdCrAEGvzz0n9pn4FD/gpXqvjVvGNinhufwr/Yaaq0gWwa+SSOYr9oP7vZtRgJM7C3AY5BoA7X4r/s8/8ABQm4+GviWKf492utwGwnMtjDp8GnyXMSqTJEtzHErRllBGdwB6EgEmvzj/Zm/wCCc/xD/aR+G6fE+08S2Hh7S7u4lgtEnjeeWYQMUkciMgIA4KgE5OCcAYJ/dr4kftY/s0ab8P8AxHet8TfD93ssLkLDZ6lb3VxIzRlVWOGF2d2JIACj68ZNfH//AATf/aL+BfhT9mLSfBfi/wAc6T4e1rRr2+FxbandxWT4uLh5o2j89kEilGHK5AOQcGgD8sf2sf2GvHX7KWj6J4k1vXLLxBpOtTtaCa2V4XhuFUyBGjkJJDIrEMCcEEHHGfiCv3I/4KsfHb4PfET4b+DfB/w/8Xad4l1SHVmv5U0y4S7jigSCSLMkkRZFYs4wpO4jJxgV+G9ABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB//1PxjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD9zP+Cav7KHwG+LfwR1bx98TPC8fiPVpdZnskNzJII4YbaGJ1EaRsoBYytuJyTgdMVe/4KNfsk/AL4XfBnRvG/wAN/C8fhzVE1y1sHa1lk2SwXSSFhIsjOCVMYKkYI56g18ifsff8FCL/APZZ8A6l8O7zwZH4n0+6vmv4JEvTZTRSSoiSq5MUyupEalcBSOck5GLH7XH/AAUR1L9pzwLpfgHTvBkfhiys9Qj1GeSS9N7LLJArLEqYihCKN7FshieMFcHIB+0+lf8ABP39kPS9MtNNb4d2l6bWJIjPcyzvNKUUAvIwkALtjLEADJ4AHFfn14N/Y7+Ad3/wUQ8Y/Cu80Fp/B+jeH11u30t538gXM5tkKEghzEvnsypu4IXkqNpi0f8A4LMXUOlWkOu/CxbvUUiRbia31fyIZJQPnZI2tZCik8hS7EdNx618oeHv+ChfifRP2r9c/aYl8J2s8Ou2H9ky6SLhkZLFPKMQW5Kt+9DQoWcx7W+YBFyMAH7BfGD9g39lGP4VeLrnSvAVtpV7a6VeXEF1ayzJNDLBE0qMpZ2X7yjIKkEZBGDX8tFftD8Rv+CvV34w8B6/4T0L4Zppl7rNlNZpdXGqG5jhFwpjdzEttEXIUnA3jnBORwfxeoAKKKKACiiigD+lD9kj9iP9mPxJ+zp4F8V+LPBUGu6zr2nRX91dXcszSNLONxVQjoqovRQB0HJJyT8+ftN/scfAPQv2rPgV4J8M6C+i6D46mvIdVs7Wd1jkWx8t1KFyzIXDlZCrcqBt2tlj5L8Av+Cqd/8AB34S+Hvhjrnw8TXn8OW4s4LuDUTZh7eP/Vh42t5vnA4Zg2D1wK8k+NP/AAUO8UfFL43/AA7+MOj+E7XRo/hw8slpYzXDXRne5KifzZlSLhlRVQKgKnJy2cAA/cOT9gn9kGSNoz8M9PAYEZWS4BGfQiXg1/LV8YfC2l+Bvi3428FaIZDp2ga3qOn23mtvk8m1uZIo97ADLbVGTgZNfsXL/wAFnIDE4g+EzLJg7S2tgqGxxkCzBIz7ivyWtPCfxc/aT8f+KfFHg3wrd+INX1O7uNWv4tLtpJY4GvZmkbgbtql2IUE5wO+DQB4vRXr/AI8/Z/8Ajb8L9Hj8QfEPwRq3h7TJZRAtzeWskURlYEqm8jAJAOB3xXkFAH17+wr8KvBfxm/aY8L+BviBaNf6JMl3czWwcxiY2tu8yI5XDbCyjcAQSOM1/QnqX/BP/wDZD1LTrrTx8OrO0NzE8fnQS3CTR7wRvjbzDhl6g4PPY1/ND+zj8cNU/Z2+L+ifFfStOi1Z9KMqS2szGMSwXEbRSqrrnY+xjtbDAHBKkcV+quqf8FmZpdNuo9G+FYtr94nFvLPq/nRJKR8jPGtrGzqDglQ6kjjI60AfiRq1rHY6reWUJJjt5pI1LdcIxAz78Vn16x4J+D3xg+M0up6t8O/CGpeJFt5c3T2Fs80cUkxLBSVBAJwSBnOKh+IPwR+L3wntrO9+JXg/U/DdvqDtHbyX1s8KSOgBZVZhjIBzjOcUAeW19/8A/BN74KfDr45fH688PfE3Tf7X0nSdEutRS0LskUs6TQQL5uwhmUCZmwCPmAzkAg/AFfYP7D3xh+IHwY+OUGt/DnwfL471HVrG40+XSbfeLia3YpOzROivsZGhVixRhtBBAzkAH7w/FD9gf9k6X4ceJjp3gK20q7i065lhu7SWZJ4ZIoy6OhZ2XIKjgqQRwQQa+Zv+Cf8A+x7+zt8Rv2aNC+IPxB8Iw+Idc1y5v2mmupZcItvcyW6JGsbIFXbGCc5JYk5xgDZ+MP7bv7TNr8LvE8k37Nms+G4nsZo5NSvp5bi2tI5RseWSNbWIsFVifvqAeScAiviL9lb/AIKVX/7OXwks/hNqfgVPElrpc9xJaXMV+bJxHcytM6SKYJg5EjthgV+UgY4yQD1H/gp7+zD8FPgv4M8G+MPhb4eTw7d32oS2FxHbyO0EsflNKrMkhbDqVwCCOCQQeMfjTX37+2T+3Pqn7W2l+HfDFt4Sj8M6Zotw91t+1G9uJ7l1MYw4jhCoFJ+XaSSc57V4lB+x7+1JcwR3MPwt8QNHKodT9glGVYZHBGaAPm+ivQfDHwo+JnjTxXdeBfCnhfUdV8Q2Hm/aLCC2ke5g8ltsnmRgZTa3yndjB4611njL9m34+fD3QJ/FPjfwBrOi6RbFVlu7mzkSGMudq73IwuSQAT3IHegD94P2RP2JP2ZPE37Ofgfxb4u8Fwa9rOv2Ed/dXV5LKzmSfkqoR0VUUYCgDp1JJJPzv+1V+x78BfDX7UPwH8HeFtBbRdD8e3dza6rZ2s7iORLN4SpQuWZGcSlXKtyAMbWyTq/sl/tiftD6F8B/DfhjQPgBqvjrStCjaxtNW06aW3gmhgOFBU20wZ05VmVsEjoCDXzf+1f+1/8AGW5/aA+Gvjzxh8MpPAV58PC1/p+l6oZZJLr7Q6+a7y7IcxsIgq7F+UhiSTwAD9kX/YJ/ZBkRoz8M9PAYEZElwCM+hEvFfnf+xJ+x98BfGHxJ+OWmeN9APiK08E+IptE0yK9mcpHbRzTAOwjKbpSI1BY8YzgDJqeX/gs5AY3EPwlZZMHaW1sEA9sgWYyPxr5F/Zr/AOChfiL4E+MPiH4n1zwlb+I4/iJqL6vcwwXLWLQXskju3luyTgxYkYbSueh3dQQD9BP27/2Nf2cfAP7Mninx/wCA/B8Ph/XPD72U1vPaSyjd511FbukiyM4ZCspOMAhgDnqD7h8EP2Ef2VLn4PeC9Q1nwHbavqF/pFld3F1dyzPNLNdQrM5Yq6rjc5AAAAAAr8xP2n/+Cmt/+0H8IdU+Euk+A08OQa3JB9rupr83reTbyrOFjUQQhWMiJliWG3I25OR9gfAj9tT9pSP4O+EbSy/Zw1jxTa2Wnw2sGqWM8tvbXcNsPJjkSNrWUjKoMkOQTkjAIAAPOviJ+x18A7H/AIKD/Dz4XadoDWnhHxDok2r3mmRzyCBp7RbnaoJJdY38hC6hufmwRmv0F1H/AIJ//sh6jp9zp4+HNna/aYnj86CW4SWPeCN8beYcMucg4PPavyI+IP7WXx1u/wBuLwl8Rbv4Uz6V4m0G1j0mz8LTCZ724trtZN48zy1Jkk89zG6xbVG3Kths/e3iT9uL9qLTfD2p6jD+y5r1g9rbTSrcXFzLNDCUQt5kkaWaM6LjLKGUkAgEdaAPBv8AgnV+yN8A/ib8L/FXi/4j+Gk8SahB4iu9LhN3LJsht7OKJ12LGU+ZjKd5Oc4XGMHM3/BRz9kn4A/C34H6f47+G/haPw5q1vrFtaM1rLJslhulfesiyM4OCgKkYI57EivFP2CP2pvjh8PvCHirwn4I+EF78TNNl1Q6nJLpjyQNaXN4gV0kYQzqysIlKLhSMNksCMWv2+/2o/jf8Rvhpovgjxz8G7/4aaTc6it0brUpJJzcTWqHZHE3kwKmN5LA7iwxjGDkA/U7RP8Agn7+yJpej2WnP8PLS+a2hjjNxcyzvPMVUAvIwkUFm6nAAz0AHFfn34Y/Y8+Alz/wUV8TfCm60FpfB+meHRrsOltO/kC5lNvGUJz5hiXzmZU3cHHJUbai0T/gstd22j2Vvr3wtW81KKFFuJrfVvIhklAwzpE1rIUUnkKXbHTJ618paN/wUK8TaV+1lq37Tb+E7WWDV9POkSaSLhlZbFfLKBbnYf3waJCz+VtPICDIIAP2R+Jv7A37J03w88SDT/AVtpV1Hp9zJDdWksyTwyRRl0dCzsuQQOCpBHBBBr5f/wCCfn7H37O/xH/Zq0X4g/EHwjD4h1zW7q+Ms11LLiNbe4e3RI1jZAq7YwTnJLEnOMAeR+O/+Cwd74k8G614e8PfDJNN1DU7WW2iubjVTcxQmZShdoVtoi+ATgb15xnjg+M/sq/8FKL/APZw+E1p8KNT8Cp4ktdMuLiW0uYr82TrHcyNM6SKYZg5EjMQwK8EDHGSAfR37eH7H3wD8D6j8I5PAXh8+Gx4o8T2uhX6WUz7JbW6YbmAlMmJV52sOOfmDcY/Qe3/AGBv2QbeCO3Hw0sHEShdzyXDMdoxliZcknue9fiL+0//AMFDPEf7Quo+BpNB8IQeG4fBWqRazCk1y1/JPfQsPKDFY4AIwOCgBLE/eHSv1A079tv9qG40+1uJf2VPEMryxIzOl3KiMWUElVayLKD2BJI6E0AfNn7Pv7HHwD1n9sr41+Atf0F9V8N+CVs20ywuJ3MUZ1BBI28qVd/L5WPcxwPvbmw1fS37Un7D/wCy/oH7PPj/AMTeF/BFvomr6Fo93qFpd2ksyyJNaRmVQd7spViu1gRypOMHBH5hfDn9vnx38Hv2lPiP8WfFvgmG4ufGcgt9T0cyyWU1nJZfu4UWR0kIaMDbIHj+Y5PynivWvjj/AMFXL34r/CjxL8NdE+HSaJL4ls5bCW7n1L7WscFwpSXbEtvDlyhIUl8KeSDjFAH5A17h+zV4E8P/ABO+PfgTwB4qSSXR9c1WC3ukicxu8THLKGHI3YwSOcdCDzXh9eg/Cj4iap8JPiR4c+Jei28V3e+HL2K8ihnz5UhjOSjbSCARkZB460Af1NP+wT+yC6Mh+GenAMCMiS4B59CJeK/O/wDYp/Y9+Ani/wCKPx00nxtoB8RWXgfxDLoulw3kzlI7ZJ5wHbyym6UiJRuPbOAMmp5P+CzluY2EXwlYPg7S2tggHtkCyHH414L+xd+1t8bNC+IfxO1rwl8LZ/iPN44vG1zUbXSjLA1ncyTO24P5c4ER81lCMN2QCG4IIB9kft1/safs4eA/2ZPFfj7wJ4Ph8P654fNnPb3FpLKC3m3UVu6SLIzhkKyk4wDuAOeCD7R8C/2Ev2Vbv4NeCdS1rwJbavqOo6PZXlzdXcszTSzXUKzOWKuq4DOQoAAAAFfFn7bH7Wvx+8Y/AjUvA/iz4F6n8PNF1+4tre61PUpZLhMRSC4SKP8A0eBUdniX5mJG0MAuSCMH4Wf8FcrzwJ8OfDngnXfhqmrXegWMFgbq31Q2scqWyCONvKa2mKtsVd3zkFskYBwADtfiR+x18A7D/goJ8OPhdp2gNaeEvEmjT6reaZHPIIGns0uSqqSS6xuYELqG5+bBGa/QXUf2AP2QtQsLmw/4VzZW32mJ4/NgluElj3gjejeYcMucg44Nfi7qX7dnxD+KX7YPgn43eD/AaXF/osH9kafoMMklzPdQ3IlWZfORFJlbzn2MIsJ8uVbBz+kfiL9uH9qHTvD+pahD+y3r1i9rbTSrcXFzLLDCUQt5kkaWaMyLjLKGUkDAI60AeB/8E7P2RvgH8TPht4v8WfEbw0viS/tPEl3pMH2uWTZFbWcUTrsWMoN7GU72Oc4XAGDmX/gpB+yX8AvhV8BrXx/8NvC0XhzV7PVbe2L2skmyWK5V9yyJIzg4KAqRgjnnBIr5H/ZL/wCCh+r/ALM/hjxB4R1TwdF4nstZ1OXVkaK7NjLDcXCIkwJMUwdCI02jClTnJbIxN+13/wAFEb79qD4c2nw1sPBUfhixW9jvbmaS9N7LI0KkRrHiGEIMsxYkMTxjHOQD81q+9v8AgnJ8GPh78cf2hJfDXxM046vpGmaNd6itoXZI5Zo5YIUEuwhioExbAI+YDORkH4Jr6W/ZR/aP1P8AZb+Ky/EnT9Hi16Geym0+6tJJTAzwTMkhMcoV9jh40OSjDGRjnIAP6EviR+wN+ybP8P8AxEth4BttLuksLmSK6tJZknhkjjLq6FnZcggcFSD0IIr5Y/4J8/sffs8fEj9m7SPiF8QvCUXiLW9au73zZbuWXEaW1w8CJEsbIFXamTnJLE84wB5T44/4LCXviLwfrOgeHvhkmm6hqVrLbQ3NxqpuYoTKpQu0K20RfAJwN684yccVnfsKftW/HjwF8Fh4C8GfBLUfiPomi3k4g1DTZJLcRtcMZ5IZT5E6u4ZyQVK4UgEdCQB//BTz9l/4JfBjwH4Q8ZfC3w6nhy9vNSewuEt5JDDNE0LyhmSRm+dWTAKkcEgg8Y/GKv1H/wCChf7R3xj+Lml+E/BnxC+FN78M9Ptp5b6BdQaSae8nCmL93IYoVCIr8qFY5IJIGAfke2/Y/wD2o7u3iurf4W+IGimVXQ/YJRlWGQcEZ6UAfVf/AATF/Z/+Ffx08f8Ai9vinpH9u2vh+wgktrWSR0gMlzIyM7hCrMVC/L82BkkgnBH6V/tQfsPfsvaF+z38QPEvhjwPb6Jq+haNeajaXdpLMsiTWcTTIDvdlKsV2sCOVJxg4I/Jv9hb4v8Axf8A2e/i94i0Dwh8N7zxvqeo2rW2paNEssF9A1m5O/cI5PL8t2KuHjOcgZBxn7u/ae/bI/aM1b4FeLtA1n9nrVvBem61ZPp93q2oTSXFvbQXY8mQlBbQgMwbajFwAxBIPQgH4IV7b+zd4F0D4m/HnwJ4A8VJJJpGu6rb210kT+W7RM3zKGHIyBjI5x0IPNReCP2dPjt8SdCTxR4D8B6xrukSO8aXVraSSQu8ZwwVwMHB4OO/HUGtjw7pPxh/Zk+M/hHXtc8H3mn+JtMu7e/sdO1C2lRrvEm1VVBhmDsCo2c59+KAP6XG/YK/ZCdSp+GWnAEY4kuAfzEtfnf+xd+x58BPFvxZ+O2i+NNAbxDYeBfEEmjaXDezOUjt1mnG9/L2b5cRKNx4xnA5r6am/bW/afSF2T9lLxGGCkgm8kIBx3Assn6V+W37O/8AwUG8U/Ab4gfEnxV4k8Hwa6fiFqL6ne20U72D218ZZHIRmSb92PMcFGXdkD5uCCAfoR+3P+xn+zf4E/Zl8W+PPA3g6Dw/rnh/7JcW9xaSygkyXMUDJIruyshWQnGM5AIPFewfAf8AYT/ZWvfgt4H1TXPAltq+o6no1je3N3dyzNNLNdwrM5JV1UAM5CgAAKAK/NH9pn/gp1ffH74Qav8ACbSfAKeHYtdaBbq6m1A3jCGGVZtsaLBCFYui/MSw25G3JBHffCn/AIK4XngH4b+G/A+u/DZNWu/D9jBYfarfVDapLHbIIo28praYq2xV3fOQWyQADgAHbfE39jn4B2P/AAUA+Gnwv0zQWsvCXibSLjVL3TYp3ELzWUdyyqpJLrHIYE8xQ3OWwVzX6D6h+wD+yFqFhc2P/CuLK2+0xvH5sMtwkse8EbkbzDhhnIPY1+Ifjb/goZ4n8VftSeE/2j7Lwna2UXhG0bT7fS3uHlaW1nWVbgPcBU/eN5z7GEYCfLlWwd31nqH/AAWaeSwuU0r4UiC9aNxBJNrHmxJKQdjOi2iFlBwSoZSRwCOtAFz/AIJ3fsjfAP4l/D7xr4o+I3hpfEl9Y+JbvSLf7XLJsitrOKJ1KrGUG9jKd7HOcLgDnNv/AIKOfslfAD4WfAa38ffDfwrF4c1ez1W2tt9rLJsliuQwdZFkZwcbQVIwQc84JFeG/sE/tT/G/wAA+GvF/hrwR8Irz4mafeao2rTSaY8kDWl1eIEdZHEU6lXESlFwpGG5YHjS/b6/aj+N/wAR/hZpXgXxz8GdQ+GukXuorcNd6lJJObiW2UlIom8iBEPzFmzuLAcYwaAP1E8Of8E//wBkbTtA06wl+HtrfyQW8SNcXMs7zzMFGXkYSKCzHk4AGegA4r8Ff+Cgfwe8CfBL9o7UfCPw5sm03RrmxtL5bUuZEhknDb1jLZYJlcgEnGSAcYA/WbwN+3J+1Dqng3RNRk/Zj1vWWubOF/ttncSwW1zuQESxRtaSFUf7ygu3B6nrX4w/ti/Fnxx8ZPjxrfij4g+GH8G6rapFY/2TKH861igGUWVnClnIbcWCqCCMDGKAPl2v39/4J7/sf/s8/En9nDTPiF8Q/CcXiLW9ZvL0SS3csu2NLadoUSJY2QKuFyc5JYnnGAPwCr9Pv2Uf+Ckmofs2/CqH4Van4Hj8S2dhcTzWlxFfGykVLhzK6SAwzByHYlWG3g4IOM0Aexf8FO/2Xvgj8Gfh94R8afC3w4nhy+u9UbT7hLeSQwzRNBJKCySM3zqyYBUjgkEHjH4v1+gX7ZX7eGpftY6BoPhODwlH4X0rRrlr1912byea4KNGuH8qFURUZsjaSSc5GMV+ftABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB//V/GOiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiv38/Yg/4JyfDmT4f6R8V/jxpy+ItW1+KG+sdMlZ1tLS1kG+IzIpXzpJFIZlbKAELtPJP6Lf8Mk/svf8ARKfDP/gqtv8A43QB/HbRX9iX/DJP7L3/AESnwz/4Krb/AON0f8Mk/svf9Ep8M/8Agqtv/jdAH8dtFf2Jf8Mk/svf9Ep8M/8Agqtv/jdH/DJP7L3/AESnwz/4Krb/AON0Afx20V/Yl/wyT+y9/wBEp8M/+Cq2/wDjdH/DJP7L3/RKfDP/AIKrb/43QB/HbRX9iX/DJP7L3/RKfDP/AIKrb/43R/wyT+y9/wBEp8M/+Cq2/wDjdAH8dtFf10eMP2G/2UvGmjSaLe/DfSdNV+Vn0yBbC4RsEAiS32E4z0bcueoNfzafta/s2av+y98WrnwDd3n9p6XdwrfaXeFdrzWkjMqiRRwJEZSr44JG4YBwAD5ir9+v+CNZX/hA/iSOM/2lYZ9ceTJX4C13XgX4n/Eb4YXlzqPw58Taj4Zub2MRTyaddSWzSxg7grmNl3AHkZ6UAf09f8FIio/Yx+IW4gZGmYz6/wBpW3Sv5S69U8b/ABz+MvxK0uPQ/iD431nxHp0MomS3v76a4iWVQQHCSMRuAJAOO5r9V/hl/wAEirfxn8PPDvi/X/iS+n32uWMF89vbaaJ4ohcoJEQSPPGzEKw3HaOc445oA/FSiv0j8V/8E8dY8P8A7WXhr9mu28Xw3Fn4msDqsWqPbMkkdpEJfODW4YgygwOEAk2kFSWXkD611L/gjPp66ddNpHxRlkvhE5gSfSlSJpcHYHZbhmVScZIUkDkA9KAPev8AgkaR/wAMv6oAeR4mvs/+A1pV7/grOVH7K8IJ5PiCwx/36nr+e7wh8Vfiz8ILjUtM+H3i/VPDXny7bpdNvJrZJnhJUFhGy7sZOCRnFQ+O/jH8WPihBaWvxH8Yar4mhsGZ7dNRvJblImcAMyLIzAEgAEigDzav1U/4JCFR+0tr4YgE+FrzGfX7ZZ9K/Kuuh8LeLfFHgfXLfxN4N1a60PV7Td5N3ZTPBPHvUq210IYZBIPPINAH9ofxIKr8O/FJcgKNKvsk9MeQ/Wv4m69t8RftKftB+LdEvPDfif4j+INU0rUE8u4tbjUriSGaMnJV0ZyGU45BGDXiVAHrPwEKr8dPh0zkBR4j0jJPTH2yLrX9n9fxFeDvDd/4y8XaH4Q0qRIb3XL62sYHlJWNJbmVYkZioJChmBJAJx2r+j6w/YU/aCtrG3tm/ao8WxmKNEKxifYu0AYXN7nA7Z7UAWv2ZWjP7eH7TQUqT/xJuhHaHB/I9fevqD9r4qP2W/iqWIA/4RvUuvqYGxX8wHxLtvir+zB8fvFvh/SfGd7F4o0i6lgn1iwuZoJ7tLkLMXd9wcmQMrOrFvn7tgNXKeLv2g/jp4+0OXwz428f65rukzsrSWl5qE80DlDuUtG7lTg8jI4PNAH9S/7FZU/so/C0qQR/Ydt09QDn9a/MP/gs4V/tX4TKCNwg1rI743WeK6D9kz9i343a/wDAbw14q0b4/a74H0/X42v7fStJ85raCKc5Uk/aIR5j/ecKmAT1PJPzn+1Z+xt8UtP/AGgvhl4D8TfE648c3PxGLWNpqmsecZ7T7NInmq6GSXMaiYMgVxuYsCF+8QD8r6K/eKT/AIIy6F5beV8VLnfg7d2kJjPbOLrpXyD+zP8A8E8tU+OfjH4j+GPEXi6LQYvh1qT6PPLa2xu2uLuOSRGZFdoQIsRkgk7jkfKOaAPzbr+0b4GlT8FPh+VOR/wj2lYx/wBekdfgx+1H/wAEyh+z/wDBzVvi1ofjs68mhyW5urW4sRakw3EqwBo3SWXLh5F+UgDbk5yAD8FeGv2kP2gPB2h2nhnwp8Rdf0nSbBSlva2uo3EUMSkltqIrgKMknAFAH9AHxNZP+HonwhBIz/wiGofy1Cv0u6cmv4odR+J/xG1jxnF8RtV8T6ld+Kbd45I9UlupWvUeEARlZi28FQMDB4r0DUf2pv2k9WsLnStT+KHiO5s7yN4ZopNUuWSSOQFWVgX5BBII9KAP3v8A+CWLIfgR4vCkE/8ACZ6qePQwWuKj/wCCsZUfsqqD1Ov6fj/viavgP/gnz+yz8Vfiv4A8Q/EDwZ8XtU+GmnPqA08w6R5pkupbaJZGeYLNCoCiZQnLE5bOOM6f7f37KnxZ+GHwv0jx/wCMPjJq3xJ02z1EWptNX80G3kuUO2SANNMpJ8sh87TjGCeRQB+QdFFfT/7I/wCzZd/tTfFc/DmHWk0C2tbCfUbq6MRncQwvHHtjjyoZy8qdWUBcnJIAIB8wUV+3Pjz/AII+w+HvBmt6/wCHfiW17qWm2k1zDBdaaIIZWhUuUeRJ5GTIBAIRsHtX4jUAeqfAoqvxu+HrOQFHiLSck9Mfa4utf2iV/ER4R8O33jDxXovhLS5EivNbvbaxgeUlY1luZFiQsQCQoZgSQCcdq/o/0/8AYU/aCtbC2tm/ao8WxmGJEKxifYpVQMLm9zgds84oA/Gb/goEVP7YnxLKkEfbLbp6izgz+tfHFex/tBfDnxB8JfjR4u+H3inVv7e1TSb1hPf5ctdGdVmWVzIS291cFwScNkbm6nxygAor9fP2ev8Aglivxj+EPh74n+IfiAdFl8Rwfa4bS2sBcrHA5/d75Hmiy5AywC4GcAnrXy/+2n+xzP8Aska34ZtofEi+JNN8Tw3Lwytb/Zpo5bRoxKrxh5F2kSoVYNk/MCBgEgHxHX75f8EaSv8Awh3xOHf7fpv1x5U1fgbXc+Bfib8RPhhfXOpfDrxLqPhm6vIxDNLp11JbNLGDuCuY2XcARkA0Af1D/wDBRYqP2M/iPuIGYtPxn1/tG2r+T+vVvG3x0+M/xJ0lNC+IHjjWfEWmxyiZba/vpriESqCA+yRiNwBIBx3r9UfhX/wSOg8cfDjw3401/wCJD6de69YW9+1tbacJ4olukEsaCR54yxCMu47B82cZGDQB8o/8EyiB+2T4Mycf6Pqv/pBPX9T9fyWftUfs8+Iv2LfjDo+j+H/Fcl/NLaQ6tpupWytZXUJEjxnIV22OskbbSrnK4PByK811D9qf9pTVbC50vUvih4kubS8jeGaJ9UuSkkcgKsrDfyCCQRQB5L4uIPivWivT7bc4x/10aueopyqXYKOpOKAG0V+6Gh/8Ea7W40axuNe+J8lvqUsKNcR22mCWFJSoLLG73CMyg8BiqkjnA6V8naT/AME9dX1H9rrVP2ZJPF0MdnpemnWW1UWzGRrJvLCAW+4Dzt8qqR5m0DLBjwpAPzgr+pn/AIJiFT+xx4SCkEi61XOOx+3Tdfwr4h8c/wDBHyDQPB2ta74d+Jb3upadaS3MMF1pohhlaJS+x5EnkZAwBG4I2D2NYH7Cv7I3xh+IPwVX4heFvjZrHw60rXLyfydP0jzmVzbOYHlmAnhUOWQgAA/KAS3YAH2f/wAFHWjU/AneVH/Ff6YeSOgzk89vWv0tr+c39uL9kT4ueDNR+Hl14k+LF98Rx4l1NNCtH1pplksrm6YFCuZJx5TYy5GGBA4bt986b+wn+0Faafa2rftT+LYjDEiFIhOY12qBhc3udo7Z5xQBc/ZyaM/8FAP2lArKT5Gi9CM8QID+R619U/tZlR+zB8VyxAH/AAjGrdfU2smK/l8+Kdl8Vf2X/wBoTxZoGmeNL1PFOkXMkU2tWNzNBcXSXaLPvd92/MiupkUs3z55bAJ5HxZ+0N8d/Hmhz+GfGnxA13W9IuipltLzUJ5oJChDLuR3KnDAEZHUZoA/qO/YiKn9k34XFSCP7Gh6eoLZ/WvnP9sxkH7Wf7KQJGf7b1H68tZY/XpX8+3g34+/G/4d6KvhvwJ481vQNKR3lW0sr+eCBXk5ZgiOFBY8nA5PNb/hS5+K37S/xo8I+HPEHjC9v/EWr3ltYWmp6ldTXD2oMm5WVyWcBCSwCkc+nWgD+x2v44v2qCrftMfFYqQQfFGsYI6f8fktfvZN+wz+0BJE8Y/aq8XncpGCs2OR3/02v5zPiP4P1T4e/EHxL4E1y4S71Hw9qV3p9xNEWZJZraVo3dSwDEMVJGRn1oA4uiiv2k+FH/BJCDx38NfDXjfX/iO+nXviCwt9Qa2ttOE8USXSCWNBI88ZYhGXd8oG7IGRgkA/FuivrT9sT9lu5/ZR+JFj4LOvL4hstVsEv7a58k28oUu0TpJHucAh0OCrEFcHg5FfJdAH9IP/AASCK/8ADNniEAjI8U3eR3/487Out/4KtlR+ym+SOdd07H/kWvz0/wCCe/7LnxU+LXgfxJ4+8F/FzVPhpp39oDTmi0jzTLdTW8Sys0wWaFQqrMoQ5YklumBnf/b6/ZR+LXwz+Fel+PvF3xl1b4kabY6ils1nrHmr5El0pCSwhp5lJ+Qq2QpweCeRQB/QVpxVtPtWUggxJgjpjaK/mb/4KtFT+1jcBSCRounZx6/vOv4V+jXgf9gv9oLSfB2i6a37TXiXSDbWkKfY7Dz2tLbCD91CWu0JjT7qnYvA+6Olfn1qX7CXjjxx+2nrHwL8XfEA6pcSaedfufEFykk93PaHZGu+J35n3sqkGXaFG4NwFoA/MKiv298bf8EeoND8I6xrXh34lvealp9rLcQQXWmiGGVolL7HkSd2QMBjcEbHXBrwz9kz/gm3/wANH/CaD4ra143/AOEet9QuZ4bS2t7L7U5S2cxO8rNLEFJdThQDwAScnAAPy1or9Df20f2D5f2T/Dvh/wAXaf4tHiXTdZumsZFltfsk0U4jaVCoWSVWQqrZOQQQOCDx+eVABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB//1vxjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD+5ZESNFjjUKqgAADAAHQAVk+IPEOg+E9FvPEfifUbfSdK0+My3F1dSLDDEg6s7uQAPqa2K/Mz/grHd3Vt+yosNvM8Ud1r+nxzKjFRIgSaQK4H3l3orYPGVB6gUAe1f8ADwX9jr/opVn/AOAt5/8AGKP+Hgv7HX/RSrP/AMBbz/4xX8mFFAH9Z/8Aw8F/Y6/6KVZ/+At5/wDGKP8Ah4L+x1/0Uqz/APAW8/8AjFfyYUUAf1n/APDwX9jr/opVn/4C3n/xij/h4L+x1/0Uqz/8Bbz/AOMV/JhRQB/Wf/w8F/Y6/wCilWf/AIC3n/xivTPhf+1J+z98Z9al8N/DTxtZa1qsMfmm1XzIJmQZy0aTpGZAuPm2A7eM4yK/jkr6Y/Y0u7uy/aq+Fk1nM8Eja/ZRlo2KExyyCORSRj5XRirDoQSDwaAP7AK/B7/gs2qjW/hQwA3G31gE45wHtMc/jX7w1+EH/BZv/kM/Cj/r31n/ANDtKAPxGooooAK/qC+C37f37J9p8I/Bun6544j0fUbDSbO0ubS6tbnzYpraJYnDGOJ0IypIIYggg+1fy+0UAfuD49/bP+Amof8ABQXwH8WNP1ma58HeH9Dk0a61NLeTyhPdC5IkVGAlMSGdQ52ZyGwrAAn9AdS/4KIfse6fp11fx/EGG8a2ieQQQWl2ZZSgJCRhoVUs3QZYDPUgc1+CP/BPjwF4P+JH7VXhPw3450uHWdKEd7dNa3A3QvLbWzyxeYnR1DqCVbKtjDAjiv6UtU/Zk/Z11jTbrSbz4ZeGxBeRPDIYtKtYZArgqdkkUaujYPDKwYHkEGgD+OjVbqO/1S8vogVS4mkkUN1AdiRn35qhWlrNvFZ6xfWluNsUE8qIM5wqsQBk+1VbSNZbqGJxlXdQfoTQBXor+yHRP2Yf2c9D0ey0ax+Gfh17eyhSGMz6Xa3EpVAAC8ssbSOx7szFieSc1/OB/wAFE/AHg74cftTeItA8C6VBoumTW9ld/ZbZdkCTXEIeQxoPlRS3O1QFHYAcUAfDtFFf0j/8E4fgJ8Fdf/ZX8PeL/EngjR9b1nW7rUJLq61GyhvZGMF3LBGFM6vsVY41G1cDOSRkk0Afz4/DDxLYeDPiX4S8YaqkklloWr2F/OsQDSNFa3CSuEBIBYqpwCQM9xX9SMH/AAUK/Y7ngjn/AOFj20fmKG2vaXgZcjOGHkcEd6/Pz/grH8GPhR4F8DeCPFvgfwpp3h3U59SlsZX022js0lgMLShXjhCoxDDIYruHIzjivw4oA+h/2sPiR4a+Lv7RPjj4i+Dnlk0XWL1WtXmTy3kjiiSHfsPIDFCyg4OCMgHIHzxX60f8EnfhR8N/iR498c6j4/8ADtl4ifQ7G0+xx38K3MEZuXkWRvJkDRsxCAAspK84xk1+nn7Xv7OfwFT9mn4iapY/D/Q9NvtI0e7v7S5sdPgs54ri2jaSNllgRGwCOVJ2sOCCKAPG/wBkf9un9mHwp+zr4I8H+MvGC6BrXh+wSwurW6trgtvg43q0MciMjDBU7s9iAQRXz1+1P+2Z8BfFP7T3wK8a+EtZl1vQfAF3cXWqXlvbyBFS8eEARrKEd2jERZwF6EBSxyB9sfsX/s6/Aif9mLwBrGpeAdE1TUNY06O+u7q/sILyeWefl2Mk6OwHYKCFUcACvzm/4K0/Cb4a/DnxP8O9W8AeG7Hw7NrdtqUd4mnwJbQyi0a38omGMLGGHmuCwUFhgEnAwAfqlJ/wUH/Y6jjaT/hZNq20E4W1vSTjsB5HWvzz/Yo/bL+Avgn4kfG/VfHmtSeHLPxz4hm1vTJbq3kZXt5JpiI38gSlZQJFJB464Y4r8P6KAP6Ef26/21v2bviJ+zR4o+Hnw+8Vr4h1zxA9lDDDbW86CMQ3UVw8kjTJGAgWIjgkliOMZI/nuor+tr4Cfs2fs/WvwT8C7vh1oF5LcaLYXEs13ptvdTyzXECyyO806PIxZ3J5bgcDAAFAH8ktFf0B/Ev9nb4JJ/wUk+GvhODwdp8Gha1oE+q3mnRRCOymu7RbvynNumI8fuY9yBQj4+ZTls/pJqf7Mv7Our6ddaVefDLw2ILyJ4ZDFpVrDJtkBU7JI41dGweGVgwPIINAH5J/8E1v2t/gN8Gvgzrfw/8Ail4jHh3UxrU2oRNPBNJFPDcQQxjY0KyHcjQncGC8FcZ5xp/8FHf2vfgB8XfgXZfD74Y+JR4i1a61a3u2EEE0ccMNsj7jI0yR8sXAULknnOAK9C/4JlfAb4NeI/hN4v8AE/inwdpmvakPE17pyy6lax3vl2tpFC0SIs4dUwZWJKgFuNxOBhf+ConwN+D3hT9nqy8Y+EvBulaBrFjrNtBHcabaRWTGK5STzEcQKgcHYpG8HaRxjJyAfz3V96/8E6Pjf8PPgP8AH648TfE2/bS9H1TRrrTRdiNpY4ZpJoJlMgQFwhEJXKq3zEZGMkfBVFAH9S/xM/4KEfslJ8PPEg0rxzHq97Lp9zFBaWtrc+dNJLGUVE8yNEBJI5ZgAOSa/looooA7b4aeI7Hwd8R/Cvi7U0kks9E1axvp1iAMjRW06SuEBIBYhTgEgZ71/Unb/wDBQr9ju4t4p/8AhY9tF5iq2x7S8DrkZww8jgjvX8uvwn0PTPE/xS8HeGtaiM+n6trOnWlzGGKF4Z7lI5F3KQRlWIyCCO1f13237Nv7PNpbRWkHwx8MiOFFRd2j2bnaowMs0RJOO5JJ70Afyt/tafEnwz8Xv2i/HHxF8GvJLousXiG1klTy3kjhhjh37DyA5QsoODgjIByB861/QH+zb+zl8EJP24Pjv4fvPB1hfaT4UWxbTLG7iFzaWxv4xJNthl3IeeEyDsHC4FfU/wC1v+zp8Bo/2aviNqVj8P8AQ9NvtK0W9v7W5sdPt7OeK4tYmliZZYER8BlGVzhhkEEGgDxL9kT9uj9mLwn+zp4J8HeNPF66BrXh+yWwubW6trhm3wkjejQxyKyMCCpznsQCCK+Ef+Cnn7R/wj+PeveArH4Uawddh8OQag91dJDJFBuvWg2Rp5oRyyiElvlwNy4JOQPywr3/APZW8I+HfHn7Rfw98IeLbNdR0fVNXt4rq3csFljzkoxUg4OORnkcUAeAUV/ZlJ+zl+z3LG0T/DHwxtcEHGjWQOD7iLIr+Sb49eGtF8G/HD4geEfDlv8AZNK0XX9TsrSHcz+XBb3UkcabmJY7VUDJJJ70AeTV/T38Df2/P2UbD4N+CtK1/wAbx6NqWm6PZWVzaXVrc+bFNawrC4JjjdCCUJUhjlSDweK/mEr+tb9n/wDZs/Z/tvgf4DZ/h1oF5Nc6JYXM095p1vdzyzXMCTSu8s6O7FncnlsAcDAAAAPw5/4KTfHj4afHn40aNq/wu1JtY0zRdGisZLvyniikmM0sx8sSBXIUSAElR8wIGRzX531/QH8Uf2dvgkn/AAUh+GHhSDwdp9voWuaFcane6dDEIrKa6s0u/Kc26YjwPJj3IFCPj5gctn9JdS/Zm/Z11XT7rS7v4ZeGxBdxPDJ5Wk2sMm2RSp2yRxq6Ng8MrBgeQQaAP416fGwSRXPRSD+Vf0Gf8EzfgL8GvEXwu8aeJfFHg7TNe1FPFF7pqS6lbR3vl2lpFA0SIs4dUwZWLMoBbI3E4GJv+CoXwN+DvhX9ne18YeEvBmlaBrFhrFrDHcabZxWTGK4VxIjiBUDg7FI3g4I4xk5APqPQP+CiX7IGpaHYX9x4+i06W4gjd7a5tLoTQsVBMcgSJ13KeDtZhnoSOa+AfD/7ZnwFtv8Agojr/wAXrjWZY/Bmo+Hv7Ci1Q28nlfaIzBJ5pQAyiFjEyBtmckEqF5H4i1+in/BML4ceBviX+0nPp3j7RbbXrLS9DvL+C2vEEsH2hJreJWeJspIAsrYVwRkg4yAQAfsN8SP+ChP7JMXgDxF/ZfjmPVrx7C4jhtLW1uTNNJJGUVE8yJEBJI5ZgAOSa+W/+Cf37Zv7Ovwx/Zx0r4dfEfxSPDut6Ld3u+O4t53WVLmd50eJ4UkBXD7SDghgeMYJ/QT4ofsyfs8at8OfE1hP8N/D9ur6dckSWum21rOjJGWVo5oUSRGDAEFWB/Cv5BaAP3H/AG7/ANsv4B/EC5+FNv8ADzXJPEv/AAi/ia112+e1t5ESO3tTgxgziLdK+cqBxx8zDjP6BW3/AAUL/Y7uLeK4PxGtovNRW2PaXgddwzhh5HBHQ1/Ll8LNE03xL8TvCHhzWYjPp+q6xp9pcRhiheGe4SORdykEZUkZByO1f15Wv7Nv7PNnbQ2cHwx8M+VAixru0ezdtqjAyzRFicdyST3NAH8r/wC1x8S/DHxg/aN8cfEXwZJJLomr3cf2WSVPLaRIII4N+w8gOYyyg4O0jIByB841/QH+zn+zl8EH/bo+Onh278HWF7pHhWKxfTLG6iFzaWzahEsk5WCXdGeSdmQdgOFwK+q/2s/2c/gKv7NnxH1Gy+H2hade6Vod9f2tzY6fb2c8VxaQtLEyywIj4DKMrnDDIYEHFAH8qNe1fs4+PNC+F/x28DfEHxOZRpOg6rb3V0YU8yRYkb5mVcjdgHOBye3PFf0R/sUfs7fAm5/Zg8Ba1qfgHRNV1HWbBb27ur+wgvZ5Z5idxMk6OwHAAUEKB0HWvnH9sb9nf4J2v7Uf7O2k6b4P0/TNP8YaldWerWtjELS3uobV7Zo1eKDYoP71wzKAzAgEkAYAPs5/+Cg/7HSIX/4WTaHAJwLW9JP0/cV/MH8b/GOk/EP4yeOfHugrImm+Itb1DULYTKFlEN1cPKm9QSA21hkZPNf1wyfs5fs+SI0b/DHwxtYEHGjWQOD7iLIr+Sv9oDwzongr46fELwh4at/smk6Jr+p2dpDuZ/LgguXSNNzEsdqgDJJPrQB5DX9O/wACf2+v2UtO+C/gjSPEHjePRtT0vRrGxurS6tbnzYprSFYXBMcboQShKkMcqQeDkD+YiigD9E/+ClHx5+Gfx6+Mmiar8LdSbWNM0TR47KW7ETxRSTNNJMRGJArkKHAJKj5sgZAzX52UUUAftl/wTS/a0+BHwX+EPiHwD8U/EX/CO6i+tSajC00EskM0M9vBEAjQq53I0J3BgOCuCecdJ/wUX/bA/Z++LXwJtvh/8MvEw8R6tearbXJW3t5kjhitgxZpGmSP7xYBQuSTnoBmtv8A4JT/AAS+EXjT4JeJPGfjPwhpniHWJNemsfO1K1jvNlvBbW8iJGkyuqfNK5JUAtkZJAGOo/4KgfA34O+Ff2dIPF/hPwZpOg6xp+r2sMVxptnFZMY7gOJEcQKgcHaMBwcEZGOcgH054c/4KI/sg6hoGnXtz49i02ae3iZ7a5tLoTQsVGY5NkTruU8HaxHoSOa+DNK/bR+Acf8AwUN1P4tTaxNH4MufDf8Awj6ao1vJ5RuEeObzdgBl8k7CgbZndg7dvzV+Htfoh/wTF+HHgb4l/tKSab4+0W216x0zRLy/htrtBLB9oSWCJWeJspIAsrYVwRnBxkCgD9jfiH/wUK/ZIh8CeIG03x1Hq121jcJDaWtrdGaeR0KqieZEiZJI5ZgB1JAr5U/4J9/tmfs7/C/9nTTfh18R/FA8O61o15eF47i3ndJY7mZpkeJ4UkBGG2kHBBB4xgn9DPiX+zJ+zvq/w98R6fcfDfw/Akun3J8y10y2tZ0ZYyytHNCiSIwIBBVga/kBoA/Zf/gpr+1X8D/jd4B8JeCvhVr/APwkN5Z6m2oXEsMEscMMSwyRBWaZUJdi+QFBGAckcZ/GiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//1/xjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD+5ivzE/4K0/8ms2v/YxWH/om4r9O6/MT/grT/wAms2v/AGMVh/6JuKAP5oq/Ur9iz/gnZZ/tJfD6f4peOfEtxoejzXE1pYW9jHG88xgKh5neQsqoG3IE2biRuyBjd+Wtf1F/8Euv+TQPD3/YQ1P/ANKXoA8N/wCHOnwb/wCh51//AL4tf/jVH/DnT4N/9Dzr/wD3xa//ABqv1/ooA/ID/hzp8G/+h51//vi1/wDjVVrz/gjl8J3tJ00/x7rcV0yMInlhtpI1kx8pZFRCyg9QGUkcZHWv2IooA/iu+L3wz1r4OfE3xH8MPEMiTX3h28ktXlj+5Ko+aOVRk4EiFXAPIzg8g16T+x7/AMnTfCr/ALGLTv8A0ctdh+3z/wAnf/Ez/r/i/wDSaGuP/Y9/5Om+FX/Yxad/6OWgD+wivwg/4LN/8hn4Uf8AXvrP/odpX7v1+EH/AAWb/wCQz8KP+vfWf/Q7SgD8Rq9v+DP7OHxo/aBuNRg+EnhqXXBpKo11J5sNtDF5hwqmW4eNC7YJCAlsAnGATXiFfvl/wRrvbP8A4Q74k6d58f2oX9jL5O4eZ5flSLv25ztzxnGM8UAflV8V/wBjb9pH4I+Fj41+JPg6XTdESVIZLqO5trtInk4TzBbSyFFY/KGYBdxC5yQD8xV/VZ/wUovrO0/Y18dw3VxHDJdtpkUKu4VpZBqFu5RAT8zbEZsDJwpPQGv5U6APor9lDxP8WvCPx68L6z8ENIXXvFoleK3sXQPHcRyxskySEldieWW3Sbl2D5iwAr9xPE3xt/4KbWfh3VLuL4HaLaPDazOs1vfw3c0ZVCQ8cC3jmV16qgVix4wc4r8q/wDgmXe2dj+2H4Ra9uI7dZrfUokMjhA0klpKEQZIyzHgAck9K/qXubm2sraW8vJUgt4EaSSSRgqIijLMzHAAAGSTwBQB/DveS3E93PPeZ8+R2aTI2neTlsjtz2qKJpElR4vvqwK4GeQeK0tfkSXXdSliYOj3MxVgcggucEEdQap2LBb23ZjgCRCSe3IoA/o88IfG/wD4Ka3/AIV0i9k+COjXzT2kLm4ur6GznmygPmS27XkZidurIUXaTjaOlfib+1x4o+MHi749+JNW+Oejr4f8Vq0cMthGgWKCGJAsKxsGYSJswRIGYPnIOMV/X1Y3lpqNlb6hYTpdW1zGksUsTB45I3AZXVlJDKwOQQcEc1/Lz/wVAvbO9/a98RfY545/IsdOik8tg2yRbddyNgnDDuDyKAPz3r9CP2c/+CjHxX/Z0+G1v8LtH0LStc0mwnmltGvFlSWFbhzLJHuidQy+YzMCwJG4jOAAPz3ooA+y/wBqb9tn4k/tWWGiaL4r0zT9F0vQ5HuI7exVz5lw67PMd5WZvlTICjA5JOTjHxpRRQB9P/svftWePf2VfE2q6/4Ls7PU4Nbt0t7u0vVYo/lMWidXjKurIWbocEE5B4I+lPjF/wAFRPjJ8Xfhvrnw2l8OaPolr4ht2tLq4t1mkm+zyDEqIJXZQXX5S2CQCcYOCPzMooA/Sv4Kf8FPPjF8Gfhro3wyt/D2ka5Z6DH9ntbi5WaOYW4OUjbynVW2dA2MkYzk5J+fP2pf2tfH37V2uaJqvjKwstKtvD0EsVpa2StsVrhlaaRnkZnZn2IMZwAvAyST8r0UAFFFFABX9B/wI+M3/BRw/B3wjH4f+Dmk67pMOnwxWV9e3cNhcXFrENkDvA91EVzGFwdi7xhhw2a/nwr+z74B3tnqHwO+H13YTx3MDaBpgEkTh0JW1jVgGXI4IIPoRigD8GviD8Wv21pP24vCXiLWPAcFj8SNPtY7PS9DhjWa0m0+ZZPN/fiRleN98pebzcRnPzLsIH3t4k+Nn/BTa08PandQ/A7RLV4baZ1mt7+G7mjKoSHjgW8YyuvVUCsWPGDnFWvihrWjxf8ABUf4Swy38CSReFby3dTKoKzTLfGOMjPDuGUqp5ORgHIr9Obm5t7O3lu7uVYIIFZ5JHYKiIoyzMx4AA5JPSgD+d39gj4pftpaF4P8VaP8Efh9Z+NdBbVDdXMmovHYrBqEyATLHK80AkZlRC6Ddswpwu7mz+378TP20vEfwy0bQPjn8ObHwZ4Wn1ESGbT5o70TXUaHykkkjnn8rAZyoO3ec4J2kV9zf8Eq9S067+B/jK0tbqKaeLxhqMrxo6s6xzQ2/luQDkK+1tp6HBx0NSf8FXr6yt/2ZbK0nuI4p7jxBYGKNnCvII0lLlVJydoIJx070Afjlov/AATt/bD1/SLPW7D4fSJbX0STRie+sbeXY4yu+KWdJEbB5V1DDuAa8gsv2ZPjrqHxcuPgXaeEbp/G1oGaWwJjUJEqhvOaYsIREQRtk37GyACSRn+xXTry01HT7bULCeO6tbmJJYpomDxyRuoZXVlJDKwOQQcEV+Y3hDWtHb/gqz4zgW/gMknguO1VBKm5rhGtJGhAzkyKisxTqFBOMA0Afjt4q/4J+/tc+DPDmoeKtd8AyjTtKha4uGt72yupFiTlmEUE7yNtHJ2qSACegrjfhJ+x7+0Z8c/DL+Mfhl4Pk1TRVmaAXUlzbWiSSJ94R/aZYy4U8FlBAORnIIr+sf4nX9lpfw38VahqNxHaW0Gl3rSSyuI40UQtyzMQAPcmvjX/AIJhXtndfsd+FLe2uI5pbO71SOZEcM0TteyyBXAOVJRlYA4OGB6EUAfz/eOv2ev2i/2ZvFPhXWPGPha40bVLi8hm0iWNoL9Jby3kVo41Nu0yGTeFIjblh/CRX7k6d8aP+Cms2n200vwJ0F3eJGZn1OCFiSoJLRtfZQ+qnkdKT/gpDrWkabf/AAGTUL+C1aLx1p904llWMrbwsPMlO4jEabhufouRk81+nSsrqHQhlYZBHIINAH833wA+Lf7bEP7V/wAR9Z8I+BYdc8ca2CPEWkXcS2ltbC3IWDMrSRiLyxhYyZD5qnPzkhh9LftQ/GH/AIKE3HwJ8W2Hjn4R6X4a8N31o1tqd/Y3UV/PDZzfJNiJLmYhWUlWk2HYpLZXG4e4fsza5o13+33+0lBa6hbzSXCaUIlSVGaT7NEsc20A5PlOdr4+6eDg19W/tg3tnYfstfFSa9uI7ZH8O6jErSOEBklgaONASRlnZgqjqSQByaAP4969K+DmueO/DfxU8K678MbVr7xXZahBJptusXnma53AJH5f8QboenB6jqPNa+mf2M72z079qj4YXl/PHbQJrdsGklYIg3EqMsxAGSQB70AfuXP8Zv8AgpmkEjr8B9ABVSRjVYGPA7KL7J+g61+G/hv4FftIftP/ABG8Z6j4e8LXGreJIb64u9c3+TYJBeXEzGRH89oo0kMm7EQO4AHjANf1+V+Xv/BP/WtH1L4xftNiwv4Lo3XjKe6i8qVJPMga4ugJU2k7kORhhwc9aAPxI+K37Gf7SfwU8Kv43+I/g2XTtEilSKS5iubW7WJpOFMgtpZCik/KGYBdxAzkgH9bfgJ8Zv8Ago1/wpvwhF4c+Duk67pEGnww2N9e3cVhcXFpENkDvA91ERmMLhti7xhxkNk/Vf8AwUdvrKz/AGN/iBFd3EcD3a6fDCruFMsn2+3fYgJ+Ztqs2BzgE9Aa+gv2fb2z1D4EfDu6sJ47mFvD2lqJInDqSlrGrDcuRkMCD6EEUAfg/wDEb4tftrSftweD/EOs+BILD4j6bapaaTocMazWk1hMknnfvxIyvG4eUyTCXEXPK7Dj738RfGv/AIKbWugaldQ/A7RLWSG2mdZYNQhupYyqEh44FvGMrL1VApLHjBzirPxV1rR4f+Conwfhlv4Ekh8MX0Dq0qgrNMl95UbAnh33LtU8tkYByK/Tm4uLe0t5bu7lWGCFWeSR2CoiKMlmJ4AA5JPSgD+Vv9m79vf4tfsx6JrvhLStI0/W7LVtQfUZIr9JI5IbyRQkzAwsh+cIgKtkKV+XGTl37Tf7f/xR/ac8EWnw/wDEGjaZoekQ3a3ky2SyNJPJGCIwWlZtqruY4XGSRk4GD8XeKpYp/FGsTwuJI5Ly4ZWU5VlMjEEEcEH1rAoAK+uv2JPF/wAcvBnx1s779n/w/H4o8R3dlcW01hOAIJbNtryGWVmjEKq6IwcuvzALk7tp+Ra/UH/gkje2dp+1FqEN1cRwyXfhu+ihV3CmWQXFrJsQE/M2xGbAycKT0BoA+5fi18av+ClFv8M/E0t98GNI0e1+wTCe8s7yG/uLeFlxJJHbrdymRlQk42NjqQQK/G74R/sgftFfHTw5J4v+GPg+XVNGjmaAXUlxbWkckifeEZuZYvMCnhiuQDwTnIr+s74k31lpnw88T6hqNxHaW1vpl48ksriONFELZLMxAAHqTXxb/wAEv76zuv2PvDFtbXEc0tneapHMiOGaJ2vJZArgHKkoysAcHBB6EUAfz8/Ej4B/tAfss634d8T/ABB8OS+Hbk3KXWnXXmW95Abi1cSKC8Lyx71IDbHOSOcEZr7utv8AgsR8ao7eKO48FaBNKqqHfN0u5gOW2iXjJ5x2r6a/4LGX1mvwi8C6a1xGLuTXHmWEuPMaNLWRWcJnJVSygnGASAeor+eygD7e+G/7evxi+Hfxv8X/AByjtdO1PUfHAVdSs5oSlsViAEAjMbCRPJUBR8x3DO/c3zV618Xf+CpPxk+LHw31/wCG8nhvR9FtvEVrJZXNzbiaSYW8w2yogldlBdCV3YJAJIwcEfmPRQB+k/wQ/wCCnHxh+Cvw00j4ZW3h/SNdstCQw2k90s0cy2+cpG3kuqtsyQGxkjGcnk8Z8R/21fjz+0X8aPhz4s0TR7S38QeELtf7C07T7d5xJeXEiFtwkLPIZdiKVyAAOMEk18F19K/scXtnp37UvwwvNQnjtbePXLTdJKwRFy2BlmIAyTigD90JvjN/wUzSJ3HwH0DKqTxq0DHgegvsn6V+HHh74GftI/tQ/ErxpqGg+FrjVvE0V9cXeubxDYJb3lxMxkR/PaKNJDJuxEDuwDgYU1/X1X5f/sDa3o+pfG79p8aff290brxhLcw+VKknmwG4uwJU2k7kJI+YccjmgD8Sfip+xh+0r8FvCcvjj4i+DJdO0OCRIpbmK6tbtYjIcKZBbSyMilsLuYBdxAzkgHe8E/sE/tYfELwrpvjTwv4Ekm0nV4hPayT3lnavJE33X8q4mjkCsOVJUblIYZBBr9/P+CjF7Z2n7HHxCjup44WuY7GKIOwUySG+gbYgP3m2qTgc4BPavef2d72z1D4B/Di6sJ47mE+HdKUPEwdSyWsasMqSMqwIPoQQeaAP5QvEH7Mnx28L/FTT/grrPhC7i8Y6sI2tLJDHKJ0kBPmJNGzRGNcNvfftTa24jacezah/wTk/bI0ywudSuPh87xWsbyusOoWE0hVAWISOO4Z3bA4VQWJ4AJr9e/i3rejQf8FQPgzDPf28bw+HL+B1aVAUmuIr4RRsCeHkLLsU8tkYzkV+nU88FrBJdXUiwwwqXd3IVVVRksxPAAHJJoA/nP8A+CfnxG/bJ8JeDvE/hr4D/Dy08Y+H49QE9wdRkSyW2vnjVJFSaSaDexRE3x5YphThd3zbf7ffxN/bU8Q/CzStC+OXw4sfBnhS41FZHuNPmjvRNcxqfKjlkSefyhyxUHbvI4J2kV9vf8EsNT068+EfxAtrS7inlTxpqM5RJFZhFNBbeXIQCTtfY21ujbTg8GrX/BV+9s7f9lpbSe4jjnudcsPKjZwHk2CRm2qeW2jk46CgD8bdC/4J4ftg+ItGste074fyLa6hCk8QnvrG3l2SDK74pp0kQ4/hdQR3Fbf7Nmi/tUfs5ftSDwn4E8Ete+P4bWe2utIvAnkS2UgWRnacOsaxZVGWZZQpIC7juKn+pXRL201LRrDUNPnjurW5gilimicPHIjqCrKykhlIOQQcEV+bGj65oz/8FVtatl1C3Mp8Ci0CCVN32hZoZTDjOfMEYLlPvbRuxjmgDi/it8a/+ClNt8NvEs158GNI0i2FjOJryzvIb64t4mUiSSO3W7lMjKpJA2NjqVIGK/nWr+2f4h31lpngHxJqGo3Edpa2+m3byTSuI40UQtlmZiAAPUmv4mKAJ7W1ub65hsrKF7i4uHWOOONS7u7nCqqjJJJOAByTX23a/wDBN/8AbLu7WG7j+HzIkyK4WTUtPjcBhkBka5DKfUEAg8EZr5j+D13a2Hxb8EX17Mltb22uabJLLIwRI0S5jLMzHAUADJJ4Ar+1BHSRFkjYMjAEEHIIPQg0AfxG+MPB/ifwB4n1Hwb4z02bSNa0mUw3VrOu2SNxz9CCCGVgSGUhlJBBPN19t/8ABRnULDU/2zfiNc6bcxXcKyabEXidZFEkGmWsUqZUkbkkVkYdVYEHkEV8SUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAf/9D8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/uYr8xP+CtP/JrNr/2MVh/6JuK/TuvzE/4K0/8AJrNr/wBjFYf+ibigD+aKv6i/+CXX/JoHh7/sIan/AOlL1/LpX9Rf/BLr/k0Dw9/2ENT/APSl6AP0NooooAKKKKAP5J/2+f8Ak7/4mf8AX/F/6TQ1x/7Hv/J03wq/7GLTv/Ry12H7fP8Ayd/8TP8Ar/i/9Joa4/8AY9/5Om+FX/Yxad/6OWgD+wivwg/4LN/8hn4Uf9e+s/8AodpX7v1+EH/BZv8A5DPwo/699Z/9DtKAPxGrS0vWdX0SdrrRb6ewmddjPbytExUkHaShBIyAce1ZtFAG3qnibxJrkSQa1qt3qEUbblS4nklVWxjIDkgHHesSiigCWCee1njurWRoZoWDo6EqyspyGUjkEHkEV0dz438aXlvJaXmv6hPBMpR45LqVkdWGCGUtggjqDXL0UAFFFFAHT2vjbxnY28dnZa/qFvBCoVI47qVERR0CqGAAHoK564ubi8uJLu7laeeZi8kjsWd2Y5LMx5JJ5JNQ0UAFfsb+xt/wTg+GXx++B2mfFnx74l1e2utauLtYLbTWghjhitZnt8OZoZi7s0ZbI2gAgYJBNfjlX7i/sOft/fAb4L/s+6R8LfiTJf6bquh3N5h4bVrmK4iurh7hXUx8qV8woVPpkHnAAPm/9vX9hzwR+yx4d8MeLfAev6hqVprN1JYz2+peU8iyLGZVkSSGOIbcAgqVznBB7D8yq/WD/got+2X8JP2j/C/hPwd8LReXa6VeSX9zdXMJtkUmMxLEqP8AMxOSxbgAYAyScfk/QAUUUUAfuF+zX/wS7+EvxV+CXhX4k+OPFOtLqfiW1W+MWnNbQwQxy/cjxNDMzMB95twBPRRjJ8T/AGhv+Ce/hH4Y/H74TfC3wf4pvX0f4mXEts8t9HHNc2jWrx+a4MSxI4dZRsG0YIOSQRj6q/ZY/wCCj37O3w++Ang/wD49m1HStZ8N2a2EqR2j3Mcgh4WVHj4w4OdpAIORyME+C/tMft4/CLx5+0b8GfiN4JtL/UtB+G9zPdXsrxi3kn+1vFuSGN+cxrFnLEBi2OMbiAfVsn/BHz9noxsIvFfihXIO0meyYA9iR9kGR7ZFfgF8SvBr/Dr4i+KPh/JdC+fw1ql7ppuFXYJjZzPD5gUk7d23OMnGetf0lSf8FTv2RkjZ11fVHKgkKNMmySOwzgZPua/m++K3jG3+InxQ8X+P7O2ezg8S6vf6lHBIwZ4ku53mVGYYBKhsEigDgK/oV+Cv/BMvwNq3wm8J63rPxH8WW17q2nW9/JFpl5FaWcZu0E+yOJoZCNofBJY7jlsDOB/PVX9G/wAGf+CnX7MuifCfwjoPiu41PStX0nS7WxubcWT3CrJaxrCWWSP5WV9m4dDg4IByKAPyn/bq/Z4tP2YvjRp+ieHvEeoa5Bq+nwapBc37hr6FhI8O15kChyGh3KwVcAgYyMn5IufHHjW8t5LS78QahPBMpR43upWR1YYKspbBBHUGvsT/AIKB/tH+Bf2lfjFpvif4dx3P9j6LpMWnLPcp5TXDiWWdnWM/Mqgy7fm5JUnGMV8J0Afrd/wT/wD2IvDvx/8AhtrnxJ8R+Mtc0BF1JtMhttEmS1Ym3ijlZ5pHSTeD5wCqFG3BJJzxq/t5fsL+Gfgb8LNM+JHhvxrr2utDqUdhLb63PHdjbdqSHhdEj8sqY/mBDbgR028y/wDBPX9uD4M/s9/CjWvhx8UTe2Nw+rSalb3FvbtcxzJcQxRMhVPmRkMIOTwQ3HQ1rft9/t1/BL47/CDT/h18MGvtRvJNUgvp5p7drWOCO1VgB8/Ls5fjAwMEk9AQD6r8Nf8ABLHwBp3h/TrHUvid4xN3BBGs32G+htrXzAo3eTC0DlEz91SzEDqTXw54e/YM0a+/bo1z4EyeNdUj0jSNLPiD+0Yyq6pJHKYlEXnYKCUPOC0uzDAH5QW4/QjQ/wDgqr+ypeaNY3WrXeqaZeywxtPatYSTGCQqN0fmJ8r7TxuHB64HSvhnw5+3n8IrD9vPxB8ebyzv08G6von9gx3AjBnXyjC63JgHzbHaHbszuAYMeQVoA+o/id/wS+8CJ8PfENxpHxK8XS3ttZTXEKalexXVmzwL5gWaJYY2ZTtxwwIPPOMH+e7S/EviPQ43h0XVbvT45TudbeeSIMRxkhCMmv6NPiR/wVG/ZfufAPiG08N3Gp6tql1YzwW1r9iktxLLMhRQZZPlRRuySc8A4BOAf5saANPVNa1nXJkuNav7jUJY12q9xK8rKuc4BckgZ7VsReO/HEESQQeItRjjjUKqrdzBVUDAAAbAAHSuUooA/QD9gD9l/TP2mvH3iP8A4SDxNqPh+18N2kc7PpbrFeTSXTMigTOHCKNpLfKS2QOOTX3l+0r/AME3vBfg74HeMPG2g/EPxTfXnhuwm1NbfV7uK7tJltFMro0aRRsGZQQrbvlOCQRXxB/wTt/aj+HX7M/jfxTP8S47qPTPEllBEl1ax+cYZbZ2cB4h8xDhyNy9CBkYJI+//wBpP/gpN+zf43+BPjbwP4Jn1HVNa8R6ZcabbxPZvbIpu0MRkeSTgLGGLYAJbGBjOQAfz216p8EPhwvxe+LvhP4ZPfHTE8R6hDZtchPMMSufmYLkZIAOBkc15XXr/wAAfiLp3wj+NPg34lavay3lj4d1KC7nhhIErRofm2buNwByASAemR1oA/oBm/4JdfDSSF41+J3jrLqQN2pwMvI7j7MMj1Ga+C/2Qv2DtF+JHxG+LGg+JfGuq6ZD8OtVk0JZdEZbOe7kSaRTKzyCXbGRDny9pOSDu+XB/RR/+Cp37IyIzLq+qOQCQo0ybJ9hnA59zXwV+yB+3l8Ifhl8SPjH4g+ItrfaTYfEPW5dcs3ij+1GLfNK32eRY8HdtlBDAbTtPTjIB2H7Zv8AwT68J/Cn4C618UPDnjzxHq8/hqS2me01q5ju4JY55ktiECRxFJAZQwY7hgFcc5H4zWHjDxbpVqlhpet31nbR52xQ3MsaLuOThVYAZJJPvX7b/to/8FCvgD8W/wBnrxF8MPhzJqGp6v4ja1hzLatbRQRwXEdw0jNJ97/VBAo5y2egr8JqANCfVtVutR/te5vJpr/cr/aHkZptyY2tvJ3ZGBg54xWxceOPGt5byWl34g1CeCZSkkb3UrI6sMFWUtggjgg1y9FAH6q/sJ/sDeAP2nfhvrPxG8feIdTsIrXU3022ttMMMbAwxRyySSPNHKGDecoVVVcbSSTkAa37cH/BPj4c/s2/Ca1+JvgDxFqt6yahFZXNtqZglDrcKxRo3hih2lShyGDbgeMY52v+Cef7b3wZ/Z6+FeufDn4om9sZ5dWk1K3ubeBrmOVLiGKJoyqfMjIYQcnhg3HQ1sft/ft1fBL49fBm0+Gvwwe+1C9uNShvJpp7draOCO2VsD5+XZy/AHAwST0BAPxiqzZ3t5p1zHe6fPJbXERykkTFHU+oZcEfhVaigDpL3xl4v1O1ksdR1y+uraUAPFLcyujAHIyrMQeRmqul+I/EOhpJHomqXWnpKQXFvO8QYjoSEIzisWigDT1TW9Z1yVJ9av7jUJY12q1xK8rKuc4BckgZ7VmUUUAfd37B/wCyZ4Z/as8a+ItL8Y61d6TpXh2zindbARi4mkuHZEAklV0RV2ktlGJ4Ax1H3N+0D/wSw+EPw4+DHjD4heC/FWuHVfDOnXGpImoPbTW8qWiGV4ysUETguqkKwbAOCQRxXx1/wTu/ai+Hn7M/jvxPc/EqO6TS/EdlDCt1ax+cYJbZ2cB4h8xVwxGV6EDIwSR+g37SH/BSf9m7xr8CvG/gnwTPqWqaz4j0u60y3ieze3RWvIzEZHkk4Cxhi2BktjAxnIAP56qOnIoooA61vH3jt1KP4j1JlYYIN5MQQf8AgVYemaxq2iXDXejXs9hOylDJbyNE5UkEqWQg4yAce1Z1FAG5qnifxLrcK22tatd38KNvVLieSVQ2CMgOxAOCRmv3z+B3/BM7wPrfwh8I+Ida+I3iy1vda0221CSHS7yK0s4jeIJwkcTxSEbQ4DEt8zAtgZwP58K/ox+CP/BTb9mfw/8ACHwd4b8W3GpaVq+i6VaafcwCye4UPZxLBuWSP5Sr7Nw7gHBGQaAPyy/bu/Z0s/2YvjFpuk+HvEmoa5BrOnxalDcag4a+hdJGhKvMgUOQ0W5WCqQCF5xk/Ilx448a3dvJa3fiDUJoJlKPG93KyOrDBVgWwQRwQa+yf+Cg37SXgP8AaV+LmleIfh1HcnSND0uOwFxcp5TXDmV5mZYz8yqvmbfm5JBOMYz8G0AfrP8A8E/P2JvDv7QXw81/4j+I/GWt+H0g1I6XFb6JMlq7GCGOZpJpHSQOD5wCqANuCSTkAb/7eX7C3hj4G/CSx+Jfhvxrr2uva6hFZy22tzx3Y23QOGhZI4/LIKfMCG3DHTHMX/BPH9tz4Nfs8fC/Xvh38UTe2M9xqz6nb3NvA1zHKs8EULRlU+ZGQwg5OQwbtjnoP2+/27Pgh8d/gxbfDb4YPfajfXOpQXc0s9s1tFBHbBuu/l2ctgADAwST0BAPqPwn/wAEs/ANj4Z0u11P4m+MftcdvGJvsN9DbWvmbRu8mFoZCiZ+6pYkDqa+JtN/YH0aX9ue++BT+NtTXR7TSG8R/wBooVXVWjdljEPnYKebvkyZdmCoPygnj7+8Of8ABVP9la50DTp9Yu9U0y+e3jM9qbGSbyZdo3J5ifK4U8Bh1HOB0r4j0z9vf4RQ/t5ah8d7iyv08GXegnw+tx5YM42skouTAPm2MybdmdwBDHnKUAfUfxG/4JeeAz4D16TSfiX4ukvYbOaaFdRvYrqzZ4lLqJoVhjZlJXswI684wflP9jD/AIJy/DX9oP4KWnxW8feJdWtZ9VurmK3ttMMEKRRW0jQnzGmimLszKSMbQBgcnmvtDx//AMFSf2XZfBGvQeHrnU9V1OeynitrX7DJAJZZEKKDLJ8qDJySc4GcAnAPzN+wt+318Cfgn8BbH4XfEt7/AE3U9Hu7t0khtmuoriK6laYMDHyhUsVKsOwIJyQADyX9sL/gnp4K+BT/AA/n+Hvia/uIPGOuQaDMmqCKZoZbnlJ0aBIQUUAhkK5PBDdRX3zYf8EtfhtaWNtayfE7xvvhjRD5OowRRZUAHZH9nbYvou44HGT1r44/bb/by+Dvxeb4bWvwygvtWTwl4htteu5Z4jaKVtchYEDgsWfJJbGFwPvEnH3Ra/8ABVH9kqe1hnn1PVbaSRFZom02VmjYjJUlSVJB4JBI9DQB/P8A/tQfB9fgJ8ePFvwoj1R9ai0WaFo7uVdsskd5bxXaeYMkF1WYK5HDMCQADgeCV9F/tZ/F/RPjz+0L4w+Kvhq1ms9K1ma2S2SfHmmKztYbRXYDhTIId+3nbu25OMn50oAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//9H8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/uYr8xP+CtP/JrNr/2MVh/6JuK/TuvzE/4K0/8AJrNr/wBjFYf+ibigD+aKv6i/+CXX/JoHh7/sIan/AOlLV/LpX1P+z9+2R8cv2atOv9D+HGpW7aPqMhnksb63FxAtwQqmZOVdXKoFOG2kdQSAQAf140V/Mz/w9i/ar9NB/wDBe/8A8eo/4exftV+mg/8Agvf/AOPUAf0zUV/Mz/w9i/ar9NB/8F7/APx6q15/wVb/AGr7q0ntoZtEtHlRkWaLTsyRlhgOm+R03L1G5SM9QRxQB4r+3z/yd/8AEz/r/i/9Joa5D9j3/k6b4Vf9jFp3/o5a8G8Qa9rPirXdQ8TeIrt7/VNWuJbq6uJTl5p5mLyOx9WYkmvef2Pf+TpvhV/2MWnf+jloA/sIr8IP+Czf/IZ+FH/XvrP/AKHaV+79fhB/wWb/AOQz8KP+vfWf/Q7SgD8RqKK+nf2df2R/jB+0+2sP8NoLOO00MRi5ur+cwQiSXOyJSqOzOQC33cADkgkAgHzFRX258cf+Cf8A+0F8APAc/wASPGMOm32iWcsUVzJp100z24mYIkkivHH8hcqmRn5mHGDmviOgAor0b4TfCrxn8a/H2lfDbwDard6zqzssYkcRxoiKXkkkc9ERAWYgE4HAJwD90ap/wSh/aq03TbrUIv7Cv3tonlW3t76QzTFFJ2Rh4EXe2MLuYDPUigD80aKkmhlt5nt51KSRMVZT1DKcEH6GmojSOqIMsxAA9SaAG1+nv/BJrw7oOv8A7TOpS65p8GoNpfh27urUzxiTyLj7TbReam7OH2SOufRjWZo3/BKX9qrV9Js9UlXRNOe7hSU211fSLPCXAOyUJA6h1zhgGIB714Bp2r/Hn9gn48X9vatDpfirS4Wtp0IFzZ3lnchXX+7vifCOv3WDKM4YEUAf1LfFzwb4S174W+LdJ1rRrO9s59Lu98UsCMjbImZTjHVWAII5BAI5FfIP/BMfwp4Yg/ZE8MavFpNqt9qt1qUt3P5SmSeSO9mhRpGIySsaKo9ABX5E+Mf+Cnn7UvjPwtqnhS5vNL06DVoHtpZ7KyMVwkcgw/lu0jhSy5XOMgHIwcEcD8Df29P2gf2ffA6fDvwReWFxocE0s9vFf2vnm3Mx3SLGyuhCM5LlTn5iSOpoA/XT/go74E8Fajr3wIub7Q7OaW/8Z2Om3DmFQ01lO6mS3cgAtGx5Kn3xjJz+nsHh3w/awR2trplrDDCoRESFFVVUYCqAMAAcACv5P/it+11+0X+054m8H2GsXsY1HR7+GTR7XSoPs4/tKSRVhlALMWl3bVQlsDsBkk/tJYW//BVb7Db/AGi68Beb5ab/ADhN5u7Azv8AKXZuz12fLnpxQBzH7Lfw98CWH7d37RIsvD9jCuj/ANnfYlWBAtr9tj8y48lcYTzW5baB6cDIr6t/bM8IeFNV/Zb+Jg1LR7S5+xaHe3cBeFCYri3iZ4pUOMq6MAQR/LNfjd+z1B+3qf2q/iWvg2WzXx4uf+EpbVyp00/N/o+fLB7f8e/lD7mf4N1fSP7VEH/BScfAjxWfHs/hh/Cwtj/aw0HeL37D/wAtv9co/dbf9btO7Zn+HdQB+CtFFdP4K8G+IviF4s0nwP4StDfazrdxHa2sIIXfLIcAFmIAA6kk4A5NAHMUV+nUn/BJf9qdI2dbjw9IVBIVb+XLEdhm3AyfcgV+bmv6DrHhbXdR8M+ILV7HVNJuJbS6t5Mb4Z4HMciNjIyrAg4NAGRRRX6HeAv+CYv7TfxB8G6R42sE0fTbTW7dLqCG9vHjuBDKN0bOscMirvXDAbs4IyAcgAH540V9X+Iv2Lfjz4a+Omkfs93ml283ifXYlubOSG4DWctqQxefzSFIji2PvyoYbThT8ufoDU/+CUP7VWnaddX8J0K+e2ieRbe3v5DNMUUkJGHgRdzYwu5gM9SKAP0A/wCCRnhXwzJ+z34g8RyaXbPql34huLaa6aJWmeGC2tmijLkZ2o0jkDoCx9a3/wDgq34U8Mt+zjp2tnSrYahY69ZxwXAiUSxxzrIJVVwMhX2ruHQ4Gegr8Z/gL+2V8d/2YNJ1Xwf4CurX+zr258+Wz1C389IblR5bvHhkKswVQ/JB2jjipvj3+238eP2kPDtj4O8e3lnDpNnci6Fvp9t5AmnUbY2kJZydmTtAIGWJIJxgA/q00Lwd4S0DRrHRNE0azsdPsIY4beCGBFjijRQFVQBwABX5i+Efh/4GH/BVLxeg0Cx2W3hJdUiXyE2pfytaxvcquMCVlkcFsZO4nqc1peC7b/gqv/wiOjfabnwaJPskO4ar5pvx8g/4+TEpTzv7+0/ezX5WfE743ftX/s8fta698QPHF9b2/wAQ1i+zXIRFl0640+VFMUcaDGbfaqMnIcMoLfODQB/Sh8WPBvhLXvhj4r0nWtGs72yuNMuxJFLAjI22JmU4x1DAEEcggEcivjn/AIJieFPDEH7I3hzV4tJtVvtVvNSlu5/KUyTvHdywozsRk7Y0VR6AV+R/i/8A4KfftTeMfC+p+Fbi80rTodVge2knsrIx3CRyDD+W7SOFJXI3YyM5GDgjz34Gft5ftAfs+eCF+Hnge8sLjRIZ5J4Ir+188wGY7pFjZXQhGbLFTn5iSMZNAH6Xf8FhfDHhu1+GvgTxFa6XbQ6oNXktftSRKs32drd5DEWABKb1DYPQ8jGTn8BK+n/2hf2vfjP+01b6TYfEq9tRYaMzywWtjB9nhMzjaZXBZmZwvyjJwBnAGTn5goA/Yv8A4I9eG/D2r/EP4gavqum295e6Zp1mtrNNGsjwCeSQS+WWB2lwoBI5wMdCa/WX9sbwj4V1T9lz4nLqOkWlwLTQb+6h3woTHcW8LSRSocZDI6hlI7ivwG/4J/R/tRyfEnW/+GZZLGO4FgP7VOq/8g7ydx8nzQAW8zfny9g3fez8u6vvj9qOD/gpOvwH8XHx3P4XfwuLRv7WGheYL37D/wAt8eaoHl7M+btO7Zu7ZoA+5f2GvCPhXTP2UvhzJp+j2kD3+mR3dwywpumuJiS8rnGWZuMk9gB0AFfmn/wWO8NeHtL8QfDHW9M023tNQ1C31WG5nijVJJo7drUxK5XG4IZH256bjXx/8JP+CiX7SHwa8B6d8OvDV5p17pGkBktPt9oZ5YoiciIOrplFOdoIJAOM4AA4H4ofG348/ttfETwtoPiIw6nrBYafpNhZxrbW6yXLjewDMcM5Vd7s2MKOgFAHyrX7r/8ABHPwz4dvtD+JPiC90y3uNShubC2juZIleVIHSR2jViCQrMqkgdSBnoK+YpP+CS/7U6Izrc+HXKgkKL+XJx2GbcDJ9zXzh8G/2kPjz+xz4m8UeGvCjQ2F5JO1nqmnahAJ447uzcoThWUiSM7kyGwQTkHggA/fX/go94R8LXn7IHjfUrnSbWS70n7BcWkphTfBM17BCXjbGVJjkdSR1DEV/K/X2v8AGz9v39ob48+Bbj4c+MrywtdEvZY5LmPT7XyHuBE29I5GZ3JQOFfAxkqOccV2vgD/AIJj/tN/EPwZo/jjT49H02z1u3S6t4b68eO4EMo3Rs6xwyKu9cMBuzgjIByAAfnnRX1f4k/Yt+PPhj45aP8As+Xul28/ifX4luLKSG4DWctthmkn81gpCRbH35UMNpwpyufoHUv+CUH7VOn6fdX0R0K+e3ieRbeC/kMspRSQke+BF3NjC7mAz1IHNAH31/wSK8K+GpP2f/EfiOXS7aTVbrxFcW0t00StM8EFrbPHGWIztRpHIHTLGui/4KweFvDR/Znttd/su2Go2Gt2iW9wIlEsSTrIJFVwMgPtXcOhwM9BXw9/wT+sf25Lfwf4ptv2f20e28Mw6j5dwniDd5I1FYwJhbiMFw4Ty/Nz8uNmOc1qft/Qft1j4YaOfj7LoUvg86iA48P7gv2sofI+0+aA+Mb/AC9vy5zu52UAfkBRX6UaH/wSn/ap1rRrLV5E0TTWvYUmNtd3si3EO8Z2SqkLqHGcMAxweM18TfGL4QeN/gX4/wBR+G3xBtUttX07YzGJ/MhljkXdHLE/GUYHIyAR0IBBFAHmFFFFAHonwh03T9Z+LHgrR9Wt0u7G+1vTYJ4ZBlJYpbmNXRh3DKSD7V/Z3b+HPD1nbxWlppdrBBAqpHGkKKiIowqqoGAAOAB0r+I7S9T1DRNTtNZ0m4e0vrCaO4gmjOHjliYOjqexVgCD61+j1t/wVd/augt4oJJNDuGjRVMkmnne5AwWbbKq5PU4AHoBQB+iP7NPw88B2H7f37Qa2fh6xhXR4tOayVYEC2zXsSPcGFcYQysSW2gdSOhIr63/AGwfCPhXVf2XvigmpaPaXItPD+oXcO+FCY7i2geWGVTjIdHUMpHQiv5tPAf7Zvx7+Hnxa8RfGjSNajuvEPiwEamLuFZLa5Ax5YMSlQoiAAj2kbQNv3SQfTPif/wUg/aW+K3gTV/h5r13pllpeuwm2u2sbMwzPA/EkW9pHwsg+VsDJUkZwTQB8FUV94fCD/gnP+0Z8aPAOnfEfw5FpenaTq4Z7QahdvDNLEDgShI4pMIxztyQTjOMEE+M/tEfsufFf9mLWNK0n4m29ts1uGSWzurKYz28vkkCVAzKjB49ylgVHDKQTmgD51r90/8Agjl4Z8O3+k/ErxBfaZb3GpW8+n20dzJErypBIsrvGrEEhWZFJA6kDPQV+FlfSX7PX7Vvxf8A2ZLnVpfhleWwt9bWMXVrewefAzxH5JAAVYOoLAENghjkHjAB/Qn/AMFGPCfhe8/ZB8c6hc6TayXWlLZXFpKYU3wTG8hiLxtjKsUdlJHZiOhr+Vqvtn41f8FAP2h/jv4Euvhx4wvNPtdEv5I3uksLXyHnWJt6xuzO52bwrYGCSo5xkH4moA+3v+CdHh7Q/E37X3gbTfENhDqVon2+4EVwgkTzraymlhfa3GUkVWU9iAa/qc1Dwr4Y1WwudL1PSbS6s7yN4ZoZYEeOSOQFWRlIwVYEgg9RX8gf7LqfGF/jv4SX4DMF8a/aW+xl9vkhNjef5+7jyfJ3+b32Zxziv3Y8RW3/AAVYOgamLa58EGb7NNs+xeaLrdsOPI85fL83P3N/y7sZ4oA/nJ8WW1vZ+KtZs7WMRQQXtxHGi9FRZGAA9gK5+rupi/Go3Q1Xf9t81/P8z7/m7jv3e+7OfeqVABRRXr3wP+B/j/8AaE8ewfDr4cWsVxqcsMlzI88nlQQQRY3SyvgkKCyrwCSzAAc0AeQ0V+jniv8A4Ja/tR+FPDWp+JpI9G1OPS4HuHtrO9d7mRIxuYRq8KKzAAkDcCcYGTgHzT4DfsF/Hz9ojwUfiD4Ih06z0R55LeCbUbloDcNEdsjRKkchKq3yknA3AgZwcAHxdRX1T+0T+xz8Z/2YrHSdW+I9vZTabrMjwQ3WnzmeJZ0G7ypNyRsrFQWX5cEA4OQQPlagAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//0vxjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD+5ivgP8A4KU/DHxr8Uv2ZLzTPAemyaxqGkalaalJaQK0lxLBCskcnkxqCXZfMDFRyVDYycA/cHhnxHo/jDw5pfizw9cC70vWbaG8tZQCA8M6B0bB5GVI4PI6HmtygD+IX/hFvE//AEB7z/wHk/8AiaP+EW8T/wDQHvP/AAHk/wDia/t6ooA/iF/4RbxP/wBAe8/8B5P/AImj/hFvE/8A0B7z/wAB5P8A4mv7eqKAP4hf+EW8T/8AQHvP/AeT/wCJo/4RbxP/ANAe8/8AAeT/AOJr+3qigD+IX/hFvE//AEB7z/wHk/8Aia+wP2Ffg58SfF/7TfgbUtJ0G6Gn+G9TttS1G7mhkjt7e3t28z55CuA0m0rGvVm9ACR/V1RQAV+EH/BZv/kM/Cj/AK99Z/8AQ7Sv3fr8Cf8AgsprulXPjX4aeHIJw+oafYajczxDqkV1LCsRJ6fMYX468Z7igD8Xa/dn/gjz4v8AC2meG/iL4d1LVrW01OW7srpLeaVY5HgWN0aRQxGVDEAkdCRnqM/hNRQB/UZ/wUm8c+DIf2QvGOjvrln9u1iTToLOBZ0aSeVL2CZlRVJJKxxux7AA1/LnRX9Ifwd/4Jlfsvav8KvCWt+KdP1DVtW1TTLW9ubk300G+S6jWYgRxMEVV3bVAGcAZJOSQD8pP+CcHiTQPC37XPhDUPEmoQaZazR31qktw4jjM9xbSRxJuPALuQq56kgdTX9QeqePfBGiabdazq+v2FpY2MTzzzSXMapHFGpZmY7uAACTX4SeOP2Dfg7pP7dvgv4HaZcX8Hg7xLo761NbebvlT7MLgNbpO2X2Sm3yWPzKGIB4BH3bqn/BLH9kq9027s9P0nUtPup4nSK5TUZ5GhdlIWQJIzIxU84YEHoaAP5ltcniuda1C5gYPFLcSurDoVZyQfxFVLN1jvIJHOFWRST6AGpdTtBYald2CtvFtLJGGIxnYxGce+Ko0Af2zaJ8QfAviDR7LXNF8QWF5YX8Mc8E0dzGUkikUMrD5uhBr+ZD/gpZ4k0DxP8Ata+JLvw7qEGpQWtrY2sslu4kRZ4IQske5eNyNwwB4OQeQRXwRX3B+wD+z34H/aQ+ONx4P+IbXB0bS9JudTeC2fymuHjlhgWNpB8yrmbcSvJ2gcAk0AfD9Ff0qfEv/gmB+y1bfD3xHeeG9P1HSNUtLC4ntrpb6afypYUMikxysUcHbhgexOCDgj53/YZ/YG+AHxl/Z70f4ofEq1vtV1bXbm9wsd1JbRW8VrcPbqirERuz5Zcs3OWwAAOQD8ffgzq2m6D8YPAuu6zcLaafp2u6Zc3Ez52RQw3UbyO2MnCqCTX9lcHjHwjdQR3VrrljNDModHS5iZWVhkMpDYII5BFfz4f8FGv2N/hB+zn4V8J+MfhXHd2H9q3sthc2s87XMb4jMqyq8hLqwwVIyQQQeCDn8maAP6NP2Xfid8O739uz9oeW18SWEket/wBn/YH89Ql19hTy7jyXJCv5bddpORyMqCa+rP2yvHngnTf2XPiWt9r1jE19ol5Z26m4QtLcXETRxRIoJLM7EAAD3PAJH4df8E5/2Xfhr+0r408WR/E/7Vcad4bs7eSO1tpTAJpbp3UM8i/OAgQ4VcZJ5OBg/ff7TX/BOD9mvwT8B/GvjjwPZahpGteHNNuNSt5Tey3CObVDIYnjlJBVwCpIwRwQeMEA/npr6P8A2Qtf0Xwv+038N9e8RXsWm6baazbtNcTsEiiUkqGdjwoyRkngdSQK/Xr9lb/gnP8As4ePvgF4O8e+PLO/1jWvEdkl/NKLyW2SPzuViSOJgNqDjJyScngYA8D/AGmf2Efg54F/aQ+C/wAO/BM1/peg/Ee5ntb6Ey/aJIfsjxbnhklywMiy4w2QpXIznFAH71SeLfCkUbSy61ZIiAszNcxAADkkktwBX8cv7QGtaT4k+O/xF8Q6DdJfaZqfiLVrq1uIjmOaCa7keORT3VlII9jX9Fkn/BLj9kF42RdA1CMsCAy6nc5UnuMsRke4Ir4I/Y6/YR+DfxM+IPxj0P4jSX2s2Pw+12XQ7KNJja+YIppV+0SGIhi5WIDaDtGT14wAfjbX9jP7Pnj7wPrPwL8AXul6/Y3EA0PT4iy3EfEkECRSIQSCGR1ZWB5BBBr8wv21/wDgn5+z78JP2ePEPxP+G9rfaTrHh17SUb7uS5jnjnuI7Zo3WUnbjzd4ZecrjoTXsnwZ/wCCZn7L+tfCbwhrvirT9Q1bVtW0u0vrm5N9NAHkuolmIEcTBVVd+1cc4AySckgFH4o/E74eQ/8ABT34XXMniOxWDTvDlxp1zJ56eXDeXa3hggd87VeTzY9oJ/iX1Ffp1qfjzwTo2nXWr6rr9ha2VlE8880lzGqRxRqWdmO7gAAk1/MH/wAFB/2c/AX7Nvxj0zw18OGuU0fWtJi1EW9zIZjbyGWWBlWRvmZT5W75iSCxGcYr4PoA2PENxDd6/qd1buJIprmZ0YdGVnJB/EVm27BJ42Y4AYEn8ahqSJPMlSMnG5gPzNAH9sGhfEHwJ4g0Ww1zRPENheaffwRzwTR3MZSSORQysOQeQe/PrX8yv/BS/wASaB4n/a08RXXh3UINSgtLSxtZZLdxIizwwgSR7lyNyHhgDwcg8giv1+0P/glj+ydZaNY2mqaZqOqXkMMazXT6hPE08gUbpDHGwRdx52qMDpXwr4c/YQ+Dl9+3t4h+BN5PfyeDNJ0P+3o7XzcTMZTCgtmnHz+WjTbg33yFCk8lqAPxxor+lf4kf8Ev/wBlmDwB4huvDun6jpGp21jcT210t9NP5UsSF1JjlYo4JXBB6gnBBwR/NRQAUV2Hw98Mw+NPH3hrwdcztaw67qdnYPMihmjW6mSIuAcAlQ2QD1r+la3/AOCW37IUNvHDLoWozuiqrSPqdwGcgYLEKyrk9TgAegAoA/P7/gj/AOLPDGg/ETx9o+t6rbafe6pp1m1pFPIsZnFvJIZdm7AJQMCRnOOcYBI/WD9sXx34K039l74m/btdsojeaDfWkAM6Fpbi5iaKKNFBJLO7AAAe54BI/K34E/sGfBvxV+1p8XPhV4quL/UfDPw/W2aygEvkyzfb1EiCaWPDHyQdo27d5wxwMqfoj9pX/gm/+zT4K+BHjfxt4Jsb/Sda8OaXc6lbzG9luEZrRDKY3jlYqVkClSRgjOR0wQD+eSvov9kbX9F8L/tM/DfX/Ed7Fpum2es2zz3E7BIolJxudjwq5IyTwOp4r50r2H9n74d6Z8WvjX4M+G2tXEtpp/iHUoLS4lgx5qxOfm2bsgMQMAkHHXB6UAf2Lv4t8KxI0sus2SIgJZjcxgADqSd1fx0ftDa3pHiX49/EfxFoF3Hf6ZqfiLVbm1uIjmOaCa7keORD3VlIIPpX9FL/APBLn9kB0ZF8P6ghYEBhqdzkZ7jLEce4NfA/7Hv7CHwb+JXxJ+Mnh/4iy32s2Hw81yXQ7GNJja+aEmmX7RK0RDFysQG0EKNx4PGAD8ba/sV/Z28feB9Z+A3w+vNL1+xuIV0LToWZbiPiWC3SKVCCQQyOrKwPIIIr8yv21P8Agn3+z58J/wBnjxH8Tvhxa32k6x4ca1mG+7kuY545riO3aN1lJ2j97uDLg5XHQmvXfgp/wTN/Zg1z4R+D/EHivT9Q1bV9Y0q0v7m5N9NAGku4lmKrHEyqqpv2rxnABJJyaAKnxX+J3w8g/wCCnXwouZfEdisGm+H7rT7qTz08uG7vEvPIhd87VeTzY9oJ/iX1Ffp3qXjvwTo+n3Wrapr9ha2dlE8000lzEqRxxqWZmO7gAAk1+EfxC/YN+Dmj/tz+Avgho89/beD/ABVpUurXFt52+WM2iXBaFJmy+yU24yTll3NtPTH3dqX/AASy/ZJvNOurSx0jUbC4midI7hNRndoXZSFkVZGZGKnkBgQccjFAHn3/AAS08e+Cm+EvjnRDrlomoJ4svr4wPKscn2W6hgWGXaxB2uY3APqpzVr/AIKr+NfCD/s3WWgR6zaSalf65ZyW9ukyPLIlurmVlVSTtQMu49BkDqRXyr+wT+wt8E/jb4C8V+Mvigl7q0+na9c6PbQxXD2sccdnHG5kJiIZmkMuCCcKFGOpqb/goD+w18DfgR8F7X4k/C63vNLv7fU4LOaKW5e5injuVbr5pJVkKZBU4OSCDwQAft74d+IPgTxBoOna5oniGwvLC/t45oJo7iMpJG6gqwy2eR68+tfzOf8ABTLxJoHib9rLX7nw7qEGpQ2llY2sslu4kRJ4YsSRllyNyE4YA8Hg8givgGvtj9gb9n/wT+0d8dn8FfEJ7g6Lp2lXOpyQ2z+U1w0UkMKxmQfMq5m3EryduOM5AB8T0V/S18RP+CX37LEPgTxBc+HtO1HSdTt7Gea2ulvpp/KliQupMcrFHGRgg9QTgg4I+av2Ff2CPgH8Z/gBpvxQ+JltfarqutXV2qpHdSW0VvFazPAqqIiCxbYWLMe+ABjJAPw6or9bP+CjP7Gnwd/Z18G+FfGvwrju9POpX76fc2s87XMbgxNKsqtIS6sNhUjJBBHQjn8k6ACiv0U/4J0/swfDj9pXx34ot/id9pn0zw5YwzJa28pg86W5dkBeRfnAQKSAuMkjJwMH9Cv2kf8Agm7+zT4M+BPjjxr4KsL/AEnWvDmlXWp28xvZbhS1nGZjG8crFSsgUqSMEZyOmCAfVH7DHjzwTqH7Kfw7gs9dspJdN05LO5Tz0V4biEnfG6sQVYZBwRyCCMgg1+cH/BYrxd4X1vW/hjoWjarbX2oabDqs9zBBKsjwx3LWohZ9uQN5ifHOflPtXrn7KH/BOn9nL4g/AHwh4/8AH1nf6xrXiO1F9LIt5LbJGJSdsSJEQNqgdTkkkngYA8L/AGof2D/g54C/aC+CvgLwNPf6VofxJvZ7G+hMv2h4fsrw7pIZJckNIs2MNkKVBGckUAfjhRX9RT/8Euf2QGRlXw/qCEggMNTucj3GWI/MV8Efsg/sH/Bv4j/FD4zeG/iJNfazp/w71p9Eso0lNqZQs0y+fK0RDb9sIG0EL8xODxgA/Gyiv3k/bQ/4J8/s9fCj9njxL8TPh1aX2k6x4cNrOpe7kuY50luI7do3WUtgYl3BlwQVHYkV6r8EP+CZ/wCzDr3wg8G+IvFmn6hq+r6zpVnqFzcG+mgDSXkSzlVjiKqqpv2r3IGSScmgD8oP+Cdvibw/4T/a88D6t4m1CHTLJ/t1sJrhwkfnXVnNDChY8AvI6qM9yK/qU1Hx14K0mwudV1PXrC2s7OJ5ppZLmJUjjjUs7MS3AABJNfhF8R/2Dfg7o37cnw++COiXF/aeEPFumS6rc2xl8yWP7Ek7PDHM2X2zfZxknLLuO09Mfd+o/wDBLP8AZIu9PubWy0fUbG4midI7hNRndoXZSFkVXZkJU8gMCDjkEUAfzPeK7q3vvFGsXto4lguLy4kjcdGR5GKkZ9QawK1dd05dH1vUNJRzKtlcSwByMFhG5XOO2cVlUAFfpT/wSp8T+HfDP7UMv/CQ6lBpo1PQb20tjcOI1luDNbyiNWbA3FI3IBPOMDnAP5rV9q/sEfAHwT+0b8d/+EJ+IL3B0Ww0u61KWG3fynuGheKJYzIPmRcy7iV5O3HGcgA/ps+JvxB8C6B8OvE2saz4gsLSyttOumkle4jwoMbAdCSSSQAACSSAASQK+K/+CYHjfwc37J+i6Gdbs11HSb7UEu7d50SWFprl5Y96sQQGRgynofXIIGf4/wD+CXn7K8fgfXpvD+najpOpQ2U8tvdLfzTmKWNC6sY5WKOMjBU9RnBBwR8yfsJfsFfAT40/AKw+J/xMtr3VdU1i7u0VI7qS2it4rWVoQqiIgsWKlizHuAAMZIB3f/BX7xl4Tv8A4WeCPDNhrFrdas2steC1imWSUW8dtLG0pVScLvdVBOMk8ZwcfgFX7NftvfsI/Bf4SH4aXXwya90ZfFniK20G8jlma7TZdZInQyncHTBG3O1sjoRz912v/BLb9kSC2hgm0PUbmSNFVpX1O4DSEDBZgjKoJ6nAA9ABQB/L1RX0b+1v8IdB+A/7RHjH4V+F7ia60nRprZ7ZrjBlWK8tYbtY2I+95fm7N3G7bkgE4r5yoAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//0/xjooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD9Mf2QP8Ago54s/Z40GD4c+O9Ml8W+DreQfZdkoS90+JjmRIS4Kyx87ljYrg8BwpwP0O/4fA/s0/9C14u/wDAKw/+T6/nAooA/o//AOHwP7NP/QteLv8AwCsP/k+j/h8D+zT/ANC14u/8ArD/AOT6/nAooA/o/wD+HwP7NP8A0LXi7/wCsP8A5Po/4fA/s0/9C14u/wDAKw/+T6/nAooA/o//AOHwP7NP/QteLv8AwCsP/k+j/h8D+zT/ANC14u/8ArD/AOT6/nAooA/o/wD+HwP7NP8A0LXi7/wCsP8A5Po/4fA/s0/9C14u/wDAKw/+T6/nAooA/oO8c/8ABYn4U22hu3w18Fa1qOsMcKur/ZrK2QYPzFree5d8HHy7VyP4h3/DX4q/FTxt8aPHWp/ET4g6g2oaxqj5dsbY4o14SKJOiRoOFUfU5JJPndFABRRRQAV+/fwj/wCCsvwQ8L/DHwv4Y8Z+FvEUes6Np9vY3A0+G0uLVjbIIleOSW6hch1UMQUG0krlgNx/ASigD9WPGf8AwUL8J67+2j4U/aJ0vwve/wDCL+GNNOj/AGeZokv5racTedPsV2iWRDO2yPzCrBRl13Hb9rav/wAFhP2f4tKvJNB8KeJ7nUlhc20Vzb2UMDzBTsWSRLyVkQtgMyoxA5CnpX86NFAFvULtr+/ub5lCG5keQqOgLsTj9aqUUUAFfYH7Ef7Seh/sufGWTx74n0q41bSNR02fTLpbMp9piSWSKYSRJIyI7B4VUqzqNrE5yAD8f0UAf0FfEj/grh8DtY8A6/o/g7wp4in1nULKa2tlv4bS3td8ylN0skV3M4ChicKhJIxxncPBv2Mv+Cj3ws+APwO074TfETw5rNxc6LcXTW9xpUdvOk0N1M9wTIJ7iAo6vIy4XcCoByDkV+N1FAH6b/t8/tx+Bf2ptA8MeEvh7oWpafYaNcyX09xqiwxTNMyGJY444JZl2BSSWL5J4CgDJ/MiiigD71/YK/a28LfspeMvEl/420a81XR/ElpDC76f5bXUElszNGVjleJHVt5DZdSOCM8g/bv7Rn/BUv4OfEr4K+LPh34C8Ma9/a3iaxm04SanFa29vDFcqUkkLQ3M7syqcqu0AnqwHX8LaKAP3H/Zm/4Kh/B/4V/BHwv8NvH/AIZ106p4atlsfN0uK1uLeaGL/VyZnuYHVyPvLtIBGQ3OB4b+0V/wUH8IfE74/wDwo+KXgjwxfLo3wznluTFqLRQXV29y8fmoFheZEVViGxt7EknIAAz+VVFAH9Hcv/BYL9m4ROYPDHix5ADtVrSwVS2OASL4kDPfBx6Gvh/9k3/goR4M+DXjv4qeJPiP4Zv3sviNq0utoNJMVxLbXEksjmArcSQK0e2U4fduyoG07sr+UlFAH7P/ALYP/BSn4U/HP4F618J/h34b1qG88QSWyT3Gqx21vFBBbzJcbk8i4nLuWjVdpCgAk5yAD6z8H/8AgrH8EfCvwu8LeFfGnhbxDHrOiadb2M/9nw2lxat9lQRK8ckt1C53qoYgoNpJXLAbj+A9FAH2f+3J+074f/am+LVl4y8KaTdaTo+kabFp1sL0oLmYLJJM8kiRs6J88pUKHbgAkgnA+MKKKACnxv5ciSAZ2kH8qZRQB/RRoH/BYP4CPolg3iXwn4lttWMMf2qKzgsp7ZJto3iKSS8id0B+6WRSR1Ar4t0D/goR4R0z9trW/wBo668MXx8K6xpR0P7OjRnUEtU8po7jYXERlZoV3R+ZtAY4ckAn8qaKAP6DPiL/AMFcfgbq3gTXtJ8H+FPEc+s39nNb2y38Nnb2u+ZSmZZIruZwqgk/KhJxjjOR/PnRRQB0/gjxNL4K8Z6B4yggW6k0HULW/WFmKrI1rKsoQsOQGK4JHSv6EbX/AILB/s5PbQve+FvFcVwyKZEjtbCRFcj5grm9QsAeASqkjnA6V/OPRQB+rXwT/wCChvhLwL+0/wDE34z+LvC17/YHxEEKiGxeOa8tBZLsgO2V4o33qP3nzrtJyuQMH3z9oj/gqZ8GviR8FfF3w88CeGNf/tfxNp82nI+pQ2tvbRR3SmOSQtDdTuWVSSq7ME4yQK/CmigAr1L4JfEj/hUHxa8KfE42P9pL4bv4bxrbf5ZlWM/MobBwSCcHB5ry2igD+jyX/gsF+zaI3MPhjxa0gB2hrSwUE9gSL44Hvg/Svh79lD/goT4N+DvxB+Kvij4jeGb97H4j6rJrSDSTFcS2tw8sj+QVnkgVo9sp+fcGyo+U7sr+UlFAH7Rftff8FK/hT8cfgVrfwn+HfhvWob3xC9tHPPqsdtbxQQQTJcFk8i4nZ3LRqu0hRgk5yAD6n8HP+CsPwS8JfCvwr4T8a+FvEMes6Hp1tYT/ANnw2lxat9kQQo6PNdQv86qGIKDaSVBYDcfwKooA/Vnx5/wUL8I+IP2zPBn7Q2jeF77/AIRjwlp76V9nuHiS/nguVmE82xGeJXQztsTzCG2jc67jt+19V/4LCfs+R6ZdyaJ4U8UXGorE5to7i3soYXmCnYskiXkjIhbAZgjEDkKelfzn0UAfrP8AsSf8FCPh9+zv4O8T+DfiR4d1O6i1bWJtYtp9JWGdg90iJLFIlxNAFCeUpVlZickEDAJn/bl/4KDfDX9pH4T2fwy+HPh/V7QvqEV7dXOqpbwbFt1IjWJIJ595cudxYrtAGA2fl/JGigAr66/Yo/aO0T9l/wCNI+IPiXSrjVtIvdOuNNuktCn2mOOZ45RJEsjIjsHiUFWdRtJOcgV8i0UAf0HfEH/grn8DNU8D67pfhDwp4jn1m9s5oLVL+Gzt7XzJVKZlkiu5nCqCT8qEnGOM5Hz5+xd/wUb+F/7P3wTs/hR8RfDmsXE+kXNzJbXOlJbzpNFdStMfNWeeAoys5UbdwIweDnP46UUAfp7+3x+3N4D/AGpfDPhnwb8PNB1LT7LSLx7+4udUWGKVpfLaJY444JZl27WLFi4OcALjJP5hUUUAfd/7Bv7Wfhf9lPxx4g1Txpo15qujeI7OOCR9P8trqCS3ZnjKxyvGjqxYhsupHBGcYP3V+0L/AMFTvgz8Rvgt4v8Ah74E8Ma+dX8TadPpqPqUNrb20Ud2hikkLQ3U7lkRiVXZgtgEgV+E1FAH7hfsw/8ABUD4Q/Cf4IeGfhp8QPDOutqnhuD7GsulxWtxbzQocpITPcwMrnJDLtIGMhucDxT9pL/goT4R+KXx0+E/xK8C+GL5dI+GV1LemPUmjt7m7kuXiMse2F50RVWFdjbiSWOVAAz+VFFAH9Hkn/BYL9m0RsYvDHi1nAO0NaWCgnsCRfHA98H6V8Pfsp/8FCvB3wf+I/xW8W/EXwzfvYfEnVH1lV0oxXE1rcNLI/klZ5IFaPbKfn3AgqPlIbK/lJRQB+037Xf/AAUt+E/xv+BWu/Cn4eeG9bivvELW8c0+qR21vFBDDMk5ZPIuJ2dy0aqFIUYJO7IAPpnwY/4Kv/BPwf8ACjwp4Q8a+FvEMesaDpttp839nw2lxbP9kjEKOjzXUL/OihiCg2klQWA3H8DaKAP1Y+IP/BQvwn4i/bJ8E/tCaF4Xvf8AhGfCFi+mG3uWijvp4LpJlnl2I7xK6ee3lp5hDbRuZdx2/bOp/wDBYT9nuPTbuTRvCnii41BYnNvHcW9jDC8wU7FkkS8kZELYDMEYgchSeK/nOooA0dY1F9Y1e+1aRBG17PLOUByFMjFiAT6ZrOoooAK+t/2Kv2jNF/Zg+NSfEPxLpdxq2kXen3Gm3SWhT7THHM0cgkiWRkR2DRKNrOoIJ5yBXyRRQB/Qj4+/4K6/AvUfBWuab4R8KeI7jWby0mgtUvoLO3tfMlUoDLJFdyuFGc/KhJxjjOR87fsWf8FGfhf+z78FbX4U/EXw5rFzNpV1cy21zpSW86zRXUjTN5qzzwFGVmIG3cCMHg9fx3ooA/WL9sf/AIKFeB/jrJ8P4Pht4b1GC38Ha3Br00mriKB5ZrbIjgRLeWcbGBJZywOcAL3P2rZ/8Fg/2dHtIHv/AAt4rhumRTKkVtYyRpIR8yq7XqFlByAxVSRztHSv5yKKAPd/2mvjJD+0B8dPFfxcttObSrfXZoPJtncO6Q2tvFaxFyON7JEGYDIDEgEgA14RRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQB/9T8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD/9X8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD/9b8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD/9f8Y6KKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD/9D8Y6KKKACiiigAooooAKtWMEN1e29tcXCWkU0iI80gYpGrHBdggZiFHJwCfQE1Vru/Anw08b/Ey8urDwRpv9pT2cYllXzoodqMdoOZXQHn0zQB1/xZ+Cet/DEWmsW93HrvhnVAGs9Uth+5k3DIVwCwRscjkhhyDkEDltJ+E/xN17ToNX0XwtqV9ZXI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R3xm8HpHBp3iSe5towAIbwLdJtHQAyhnUD/ZYV6F/wANZ6zqHPijwR4b1l+7yWRDt9SzOP0r5NooA7jQviJ4q8L3GuT+G7oaaviGGW3u0hjQIYZs5VBj5MZ+UrgjtXotz8dpE+FUvww0Dw1YaOt/FbxX99ACJ7v7Pt+ZgAo3Nt+Ykt1bHJzXgVFAHb+HPiH4p8KeHfEHhfRLoQWHiWJIbxdo3FYzkbW6jKlkPYqxGM4Il+GXjmf4a+OdL8bW1ot9JphlIhdyiv5kTxcsASMb89O1cHRQBseIdXfxBr+p69JGIW1K6muSgOQhmcuVB74zjNY9FFABRRRQAUUUUAFFFFABRRRQB//T/GOiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//U/GOiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//V/GOiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//W/GOiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//X/GOiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//Q/GOiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//R/GOiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//S/GOiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//T/GOiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//Z";
function AboutModal({onClose}){
  return(
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.72)',zIndex:800,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:'#12090a',border:'1.5px solid #5a3a10',borderRadius:6,
        width:340,maxWidth:'92vw',boxShadow:'0 0 40px #00000099',
        fontFamily:"'IM Fell English','Georgia',serif",position:'relative',overflow:'hidden',
      }}>
        {/* Close */}
        <button onClick={onClose} style={{position:'absolute',top:8,right:10,background:'none',border:'none',color:'#b07828',fontSize:16,cursor:'pointer',lineHeight:1}}>✕</button>
        {/* Top half */}
        <div style={{display:'flex',gap:16,alignItems:'flex-start',padding:'22px 20px 16px'}}>
          {/* Avatar */}
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6,flexShrink:0}}>
            <div style={{
              width:56,height:56,borderRadius:'50%',
              background:'linear-gradient(135deg,#2a1a08,#1a0f04)',
              border:'2px solid #5a3a10',
              display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:26,color:'#b07828',
            }}>🧙</div>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:'#c8a96e',letterSpacing:1}}>Sam</div>
          </div>
          {/* Bio */}
          <div style={{flex:1,paddingTop:4}}>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:10,color:'#b07828',letterSpacing:2,marginBottom:8,textTransform:'uppercase'}}>— 关于作者 —</div>
            <div style={{color:'#c8a96e',fontSize:12,lineHeight:1.8,fontStyle:'italic'}}>
              猫奴，上班党，不回就是在上班，会尽量努力更新。
            </div>
            <div style={{color:'#9a7a42',fontSize:11,lineHeight:1.8,marginTop:8,fontStyle:'italic'}}>
              如果你遇到与游戏规则有关的bug，记得在游戏结束后点击“显示游戏日志”并复制内容。
            </div>
          </div>
        </div>
        {/* Divider */}
        <div style={{width:'80%',height:1,background:'linear-gradient(90deg,transparent,#5a3a10,transparent)',margin:'0 auto'}}/>
        {/* Bottom half */}
        <div style={{padding:'16px 20px 22px',display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:10,color:'#b07828',letterSpacing:2,textTransform:'uppercase'}}>— 意见与反馈 —</div>
          <div style={{color:'#c8a96e',fontSize:12,letterSpacing:1,fontStyle:'italic'}}>QQ催更群：787317460</div>
          <div style={{color:'#c8a96e',fontSize:12,letterSpacing:1,fontStyle:'italic'}}>微信催更群二维码</div>
          <img
            src={buildPublicUrl('img/QRCode.jpg')}
            alt="微信催更群二维码"
            style={{
              display:'block',
              width:'min(76vw,240px)',
              maxWidth:'100%',
              height:'auto',
              borderRadius:6,
              border:'1px solid #5a3a10',
              boxShadow:'0 0 18px #00000066',
              imageRendering:'auto',
              background:'#1a1208',
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Roadmap Modal ─────────────────────────────────────────────
function FullLogModal({log,onClose}){
  return(
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.82)',zIndex:1800,display:'flex',alignItems:'stretch',justifyContent:'center',padding:'20px 12px'}}>
      <div onClick={e=>e.stopPropagation()} style={{
        width:'min(980px,100%)',height:'100%',
        background:'#0d0806',border:'1.5px solid #5a3a10',borderRadius:6,
        boxShadow:'0 0 50px #000000aa',display:'flex',flexDirection:'column',
        overflow:'hidden',fontFamily:"'IM Fell English','Georgia',serif",
      }}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 18px 12px',borderBottom:'1px solid #3a2410'}}>
          <div>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:'#b07828',letterSpacing:2,textTransform:'uppercase'}}>完整游戏日志</div>
            <div style={{fontSize:11,color:'#8f6d3c',marginTop:4}}>可滚动查看并直接复制全部内容</div>
          </div>
          <button onClick={onClose} style={{
            background:'transparent',border:'1px solid #5a3a10',color:'#c8a96e',
            borderRadius:3,padding:'6px 12px',cursor:'pointer',
            fontFamily:"'Cinzel',serif",fontSize:12,letterSpacing:1,
          }}>关闭</button>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'16px 18px 20px'}}>
          <pre style={{
            margin:0,whiteSpace:'pre-wrap',wordBreak:'break-word',
            color:'#d8c39a',fontSize:13,lineHeight:1.75,
            fontFamily:"'Consolas','Courier New',monospace",
          }}>{(log&&log.length?log:['当前没有可显示的日志。']).join('\n')}</pre>
        </div>
      </div>
    </div>
  );
}

function RoadmapModal({onClose}){
  return(
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.72)',zIndex:800,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:'#12090a',border:'1.5px solid #5a3a10',borderRadius:6,
        width:320,maxWidth:'92vw',padding:'22px 22px 24px',
        boxShadow:'0 0 40px #00000099',
        fontFamily:"'IM Fell English','Georgia',serif",position:'relative',
      }}>
        <button onClick={onClose} style={{position:'absolute',top:8,right:10,background:'none',border:'none',color:'#b07828',fontSize:16,cursor:'pointer',lineHeight:1}}>✕</button>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:'#b07828',letterSpacing:2,textTransform:'uppercase',marginBottom:16,textAlign:'center'}}>— 版本更新计划 —</div>
        {/* Current version */}
        <div style={{marginBottom:12}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:'#c8a96e',letterSpacing:1,marginBottom:4}}>当前版本：0.1.2</div>
          {[
            '联机对战已开放！欢迎测试',
            '根据实战表现，不甘落后的追猎者决定擦亮自己的武器',
            '添加检定牌机制！具体规则请在遗迹内自行探索',
            '停服更新规范化，未来闪断更新/停服更新时会在游戏内广播',
          ].map((t,i)=>(
            <div key={i} style={{display:'flex',gap:8,alignItems:'flex-start',marginBottom:7}}>
              <span style={{color:'#b07828',flexShrink:0}}>·</span>
              <span style={{color:'#a08060',fontSize:12,lineHeight:1.7,fontStyle:'italic'}}>{t}</span>
            </div>
          ))}
        </div>
        <div style={{width:'100%',height:1,background:'linear-gradient(90deg,transparent,#5a3a1066,transparent)',margin:'0 0 12px'}}/>
        {/* Next version block */}
        <div>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:'#c8a96e',letterSpacing:1,marginBottom:10}}>下一个版本：0.2.1</div>
          {[
            '新扩展包《析骨为柴》锐意制作中！',
          ].map((t,i)=>(
            <div key={i} style={{display:'flex',gap:8,alignItems:'flex-start',marginBottom:7}}>
              <span style={{color:'#b07828',flexShrink:0}}>·</span>
              <span style={{color:'#a08060',fontSize:12,lineHeight:1.7,fontStyle:'italic'}}>{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Responsive window-size hook ───────────────────────────────
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
  const [open,setOpen]=useState(false);
  // Rendered via Portal directly onto document.body so that any CSS filter on ancestor
  // elements does not affect position:fixed coordinates (filter creates a new containing block).
  return ReactDOM.createPortal(
    <div style={{position:'fixed',top:10,right:12,zIndex:1800,display:'flex',alignItems:'center',gap:6}}>
      {open&&(
        <div style={{display:'flex',alignItems:'center',gap:8,background:'#120d06cc',border:'1px solid #3a2510',borderRadius:3,padding:'4px 10px',backdropFilter:'blur(4px)'}}>
          <span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:'#b07828',letterSpacing:1,whiteSpace:'nowrap'}}>亮度</span>
          <input
            type="range" min={0.5} max={2} step={0.05}
            value={gamma}
            onChange={e=>onChange(parseFloat(e.target.value))}
            style={{width:90,accentColor:'#b07828',cursor:'pointer'}}
          />
          <span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:'#b07828',width:28,textAlign:'right'}}>{(()=>{const v=Math.round((gamma-1)*100);return v>0?'+'+v:v;})()}%</span>
          <button onClick={()=>onChange(1)} style={{background:'none',border:'none',color:'#7a5020',fontSize:9,cursor:'pointer',padding:'0 2px',fontFamily:"'Cinzel',serif"}}>重置</button>
        </div>
      )}
      <button
        onClick={()=>setOpen(o=>!o)}
        title="亮度调节"
        style={{width:26,height:26,borderRadius:'50%',background:'#120d06cc',border:'1px solid #3a2510',color:'#b07828',fontSize:13,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(4px)',boxShadow:'0 2px 8px #00000066',transition:'border-color .2s'}}
        onMouseEnter={e=>e.currentTarget.style.borderColor='#7a5020'}
        onMouseLeave={e=>e.currentTarget.style.borderColor='#3a2510'}
      >☀</button>
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
        }catch{}
      });
    };
  },[]);

  const syncTrack=(instant=false)=>{
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
    }catch{}
    if(!prevAudio||duration===0){
      if(prevAudio&&prevAudio!==nextAudio){
        try{
          prevAudio.pause();
          prevAudio.currentTime=0;
          prevAudio.volume=0;
        }catch{}
      }
      nextAudio.volume=nextTarget;
      return;
    }
    const start=performance.now();
    const step=now=>{
      if(fadeTokenRef.current!==token)return;
      const progress=Math.min((now-start)/duration,1);
      try{prevAudio.volume=prevStart*(1-progress);}catch{}
      try{nextAudio.volume=nextTarget*progress;}catch{}
      if(progress<1){
        requestAnimationFrame(step);
        return;
      }
      try{
        prevAudio.pause();
        prevAudio.currentTime=0;
        prevAudio.volume=0;
      }catch{}
      try{nextAudio.volume=nextTarget;}catch{}
    };
    requestAnimationFrame(step);
  };

  useEffect(()=>{
    syncTrack(false);
  },[audioReady,isBattleScreen]);

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
    }catch{}
  },[audioReady,isBattleScreen]);

  const noteUserGesture=()=>{
    if(!readyRef.current){
      readyRef.current=true;
      setAudioReady(true);
      queueMicrotask(()=>syncTrack(true));
    }
  };

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
  },[audioReady]);

  const playSfx=kind=>{
    noteUserGesture();
    const audio=sfxRefs.current[kind];
    if(!audio)return;
    try{
      audio.pause();
      audio.currentTime=0;
      audio.play().catch(()=>{});
    }catch{}
  };

    const playTickSound=()=>{
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
      }catch{}
    };

    const playHpDamageSound=()=>{
      noteUserGesture();
      const variants=sfxRefs.current.hpDamage||[];
      if(!variants.length)return;
      const audio=variants[Math.floor(Math.random()*variants.length)];
      if(!audio)return;
      try{
        audio.pause();
        audio.currentTime=0;
        audio.play().catch(()=>{});
      }catch{}
    };
  
    return{
      noteUserGesture,
      playOpenSound:()=>playSfx('open'),
      playCloseSound:()=>playSfx('close'),
      playTickSound,
      playHpDamageSound,
    };
  }

export default function Game(){
  const[gs,setGs]=useState(null);
  const[modal,setModal]=useState(null); // 'about' | 'roadmap' | null
  const[privatePeek,setPrivatePeek]=useState(null); // {card,targetName}
  const [serverAnnouncement, setServerAnnouncement] = useState(null);
  // ── Audio Preloading ──────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingError, setLoadingError] = useState(null);
  const [currentFile, setCurrentFile] = useState('');
  const [totalSize, setTotalSize] = useState(0);
  const [loadedSize, setLoadedSize] = useState(0);
  
  // Helper function to format file size
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };
  
  // Preload audio and video files
  useEffect(() => {
    const preloadResources = async () => {
        const audioFiles = [
          '/sounds/BGM/mainTheme.mp3',
          '/sounds/BGM/battle.mp3',
          '/sounds/SE/hpDamageVariants/hpDamage1.mp3',
          '/sounds/SE/hpDamageVariants/hpDamage2.mp3',
          '/sounds/SE/hpDamageVariants/hpDamage3.mp3',
          '/sounds/SE/hpDamageVariants/hpDamage4.mp3',
          '/sounds/SE/hpDamageVariants/hpDamage5.mp3',
          '/sounds/SE/hpDamageVariants/hpDamage6.mp3'
        ];
      const videoFiles = [
        '/videos/ancient_god_tentacles.mp4'
      ];
      
      // Check if resources are already cached
      const CACHE_KEY = 'toe_resources_cached';
      try {
        const isCached = localStorage.getItem(CACHE_KEY) === '1';
        if (isCached) {
          // Skip preloading if resources are already cached
          setIsLoading(false);
          return;
        }
      } catch (e) {
        // localStorage error, proceed with preloading
      }
      
      let loadedCount = 0;
      const totalFiles = audioFiles.length + videoFiles.length;
      let totalBytes = 0;
      let loadedBytes = 0;
      
      // Calculate total size of all files
      const calculateTotalSize = async () => {
        let total = 0;
        for (const file of [...audioFiles, ...videoFiles]) {
          try {
            const response = await fetch(file, { method: 'HEAD' });
            const size = parseInt(response.headers.get('content-length') || '0');
            total += size;
          } catch (error) {
            console.error(`Failed to get size for ${file}`, error);
          }
        }
        return total;
      };
      
      totalBytes = await calculateTotalSize();
      setTotalSize(totalBytes);
      
      // Preload audio files
      for (const file of audioFiles) {
        try {
          setCurrentFile(file.split('/').pop());
          const audio = new Audio(file);
          // Set cache control headers
          audio.crossOrigin = 'anonymous';
          
          // Get file size
          let fileSize = 0;
          try {
            const response = await fetch(file, { method: 'HEAD' });
            fileSize = parseInt(response.headers.get('content-length') || '0');
          } catch (error) {
            console.error(`Failed to get size for ${file}`, error);
          }
          
          await new Promise((resolve, reject) => {
            audio.addEventListener('canplaythrough', () => {
              loadedBytes += fileSize;
              setLoadedSize(loadedBytes);
              resolve();
            });
            audio.addEventListener('error', reject);
            audio.load();
          });
          loadedCount++;
          setLoadingProgress((loadedCount / totalFiles) * 100);
        } catch (error) {
          console.error(`Failed to load audio: ${file}`, error);
          // Continue loading other files even if one fails
          loadedCount++;
          setLoadingProgress((loadedCount / totalFiles) * 100);
        }
      }
      
      // Preload video files
      for (const file of videoFiles) {
        try {
          setCurrentFile(file.split('/').pop());
          const video = document.createElement('video');
          video.src = file;
          video.preload = 'metadata'; // 只加载元数据，更快
          video.crossOrigin = 'anonymous';
          
          // Get file size
          let fileSize = 0;
          try {
            const response = await fetch(file, { method: 'HEAD' });
            fileSize = parseInt(response.headers.get('content-length') || '0');
          } catch (error) {
            console.error(`Failed to get size for ${file}`, error);
          }
          
          await new Promise((resolve, reject) => {
            video.addEventListener('loadeddata', () => { // 只需要加载第一帧
              loadedBytes += fileSize;
              setLoadedSize(loadedBytes);
              resolve();
            });
            video.addEventListener('error', reject);
            video.load();
          });
          loadedCount++;
          setLoadingProgress((loadedCount / totalFiles) * 100);
        } catch (error) {
          console.error(`Failed to load video: ${file}`, error);
          // Continue loading other files even if one fails
          loadedCount++;
          setLoadingProgress((loadedCount / totalFiles) * 100);
        }
      }
      
      // Mark resources as cached
      try {
        localStorage.setItem(CACHE_KEY, '1');
      } catch (e) {
        // localStorage error, ignore
      }
      
      // Finish loading after all files are processed
      setIsLoading(false);
    };
    
    preloadResources();
  }, []);
  
  // ── Tutorial ──────────────────────────────────────────────────
  // Detect non-production environments (Claude Artifacts iframe, local dev, etc.)
  // Use multiple signals: iframe check + origin check + localhost
  const isArtifact = (()=>{
    try{
      if(window.self!==window.top)return true;          // inside any iframe (Artifacts)
      if(window.location.origin==='null')return true;   // sandboxed origin
      if(/localhost|127\.0\.1/.test(window.location.hostname))return false; // local dev: use real localStorage
      return false;                                      // deployed website: use real localStorage
    }catch(e){return true;}                              // cross-origin frame access blocked → treat as Artifact
  })();
  const TUTORIAL_KEY='cthulhu_tutorial_v2_done'; // v2: bump version to reset all prior cached state
  const safeLS={
    get:(k)=>{try{return localStorage.getItem(k);}catch(e){return null;}},
    set:(k,v)=>{try{localStorage.setItem(k,v);}catch(e){}},
  };
  const isLocalTestMode=isLocalTestHost();
  const readTutorialDone=()=>isArtifact?false:safeLS.get(TUTORIAL_KEY)==='1';
  const [tutorialDone,setTutorialDone]=useState(readTutorialDone);
  const [showTutorial,setShowTutorial]=useState(false);
  const [showGodResurrection,setShowGodResurrection]=useState(false);
  const [showFullLog,setShowFullLog]=useState(false);
  const [tutorialStep,setTutorialStep]=useState(1);
  const [localDebugMode,setLocalDebugMode]=useState(()=>isLocalTestMode&&safeLS.get(LOCAL_DEBUG_KEY)==='1');
  const [debugForceCard,setDebugForceCard]=useState(()=>isLocalTestMode&&safeLS.get(DEBUG_FORCE_CARD_KEY)||null);
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
      }catch(_err){
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
  const [playerUUID,setPlayerUUID]=useState(()=>safeLS.get('cthulhu_player_uuid')||null);
  const playerUUIDRef=useRef(safeLS.get('cthulhu_player_uuid')||null);
  const [multiLoading,setMultiLoading]=useState(false);
  const [toasts,setToasts]=useState([]);
  const [roomModal,setRoomModal]=useState(null);
  const roomModalRef=useRef(null);
  useEffect(()=>{roomModalRef.current=roomModal;},[roomModal]);
  const [connErrModal,setConnErrModal]=useState(false);
  const socketRef=useRef(null);
  const connTimeoutRef=useRef(null);
  // 联机选项界面状态
  const [onlineOptionsModal,setOnlineOptionsModal]=useState(false);
  const [playerUsername,setPlayerUsername]=useState('');
  const [playerUsernameSpecial,setPlayerUsernameSpecial]=useState(false);
  const [renameInput,setRenameInput]=useState('');
  const [renameCdActive,setRenameCdActive]=useState(false);
  const [renameInputVisible,setRenameInputVisible]=useState(false);
  const renameCdTimerRef=useRef(null);
  const [joinRoomInput,setJoinRoomInput]=useState('');
  // 游戏大厅状态
  const [lobbyModal,setLobbyModal]=useState(false);
  const [lobbyRooms,setLobbyRooms]=useState([]);
  const [lobbyLoading,setLobbyLoading]=useState(false);
  // 房间隐私状态
  const [showPrivacyToggleConfirm,setShowPrivacyToggleConfirm]=useState(false);
  const [privacyWarnDontShow,setPrivacyWarnDontShow]=useState(false); // checkbox state for modal
  const [skipPrivacyWarning,setSkipPrivacyWarning]=useState(()=>safeLS.get('cthulhu_skip_privacy_warning')||false);
  // 联机多人游戏状态
  const [isMultiplayer,setIsMultiplayer]=useState(false);
  const isMultiplayerRef=useRef(false);  // 供 socket 闭包读取最新值
  const [myPlayerIndex,setMyPlayerIndex]=useState(0);
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
  const emojiQueueRef=useRef([]);           // 待发送 emoji 批次
  const emojiFlushTimerRef=useRef(null);    // 批量 flush 定时器
  const emojiClickDebounceRef=useRef(null); // 防抖：防止短时间内重复点击
  const discardPileRef=useRef(null);        // 弃牌堆位置

  // ── Gamma / brightness ────────────────────────────────────────
  const [gamma,setGamma]=useState(()=>{
    try{const v=parseFloat(localStorage.getItem('cthulhu_gamma'));return isNaN(v)?1:Math.max(0.5,Math.min(2,v));}catch{return 1;}
  });
  function handleGamma(v){
    setGamma(v);
    try{localStorage.setItem('cthulhu_gamma',String(v));}catch{}
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

  function addToast(text){
    const id=Date.now()+Math.random();
    setToasts(prev=>[...prev,{id,text}]);
    setTimeout(()=>setToasts(prev=>prev.filter(t=>t.id!==id)),4500);
  }

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
    catch(e){
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
    socket.on('userInfo',({uuid,username,isSpecialName,wasForceReset})=>{
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
            const hunterName=rotated.abilityData?.aiHunterName||rotated.players[rotated.abilityData.huntingAI]?.name||'追猎者';
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
            const handRect=document.querySelector('[data-hand-area]')?.getBoundingClientRect();
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
          const dp=discardPileRef.current?.getBoundingClientRect();
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
    socket.on('aiTakeover',({reason})=>{
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

  // 联机选项界面 → 创建房间
  function handleCreateRoom(){
    if(!socketRef.current)return;
    socketRef.current.emit('createRoom',{uuid:playerUUID});
    setMultiLoading(true);
  }

  // 联机选项界面 → 加入房间
  function handleJoinRoom(){
    if(!socketRef.current)return;
    const rid=joinRoomInput.trim();
    if(!rid){addToast('请输入房间号');return;}
    socketRef.current.emit('joinRoom',{uuid:playerUUID,roomId:rid});
    setMultiLoading(true);
  }

  // 准备 / 取消准备
  function handleSetReady(ready){
    if(!socketRef.current||!playerUUID)return;
    socketRef.current.emit('setReady',{uuid:playerUUID,ready});
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

  // 关闭联机选项界面
  function closeOnlineOptions(){
    setOnlineOptionsModal(false);
    if(renameCdTimerRef.current){clearTimeout(renameCdTimerRef.current);renameCdTimerRef.current=null;}
    setRenameCdActive(false);
    if(socketRef.current){socketRef.current.disconnect();socketRef.current=null;}
  }

  // 打开游戏大厅
  function handleOpenLobby(){
    if(!socketRef.current)return;
    setLobbyLoading(true);
    socketRef.current.emit('getLobbyRooms');
    setLobbyModal(true);
  }

  // 刷新游戏大厅房间列表
  function handleRefreshLobby(){
    if(!socketRef.current)return;
    setLobbyLoading(true);
    socketRef.current.emit('getLobbyRooms');
  }

  // 从游戏大厅加入房间
  function handleJoinLobbyRoom(roomId){
    if(!socketRef.current)return;
    socketRef.current.emit('joinRoom',{uuid:playerUUID,roomId:roomId});
    setMultiLoading(true);
    setLobbyModal(false);
  }

  // 关闭游戏大厅
  function closeLobbyModal(){
    setLobbyModal(false);
  }

  // 切换房间隐私状态
  function handleTogglePrivacy(isPrivate){
    if(!socketRef.current||!roomModal)return;
    
    // 从私密切换为公开，且用户未勾选过"下次不再提示"，则弹出确认框
    if(!isPrivate && !skipPrivacyWarning){
      setPrivacyWarnDontShow(false); // 每次弹出时重置勾选状态
      setShowPrivacyToggleConfirm(true);
    }else{
      // 直接切换（公开→私密，或已选择不再提示）
      socketRef.current.emit('toggleRoomPrivacy',{uuid:playerUUID,roomId:roomModal.roomId,isPrivate});
    }
  }

  // 确认切换隐私状态
  function handleConfirmPrivacyToggle(){
    if(!socketRef.current||!roomModal)return;
    
    // 只有勾选了"下次不再提示"时才记录
    if(privacyWarnDontShow){
      setSkipPrivacyWarning(true);
      safeLS.set('cthulhu_skip_privacy_warning',true);
    }
    
    // 执行切换
    socketRef.current.emit('toggleRoomPrivacy',{uuid:playerUUID,roomId:roomModal.roomId,isPrivate:false});
    setShowPrivacyToggleConfirm(false);
  }

  // 取消切换隐私状态
  function handleCancelPrivacyToggle(){
    setShowPrivacyToggleConfirm(false);
  }

  function startRenameCooldown(){
    setRenameCdActive(true);
    renameCdTimerRef.current=setTimeout(()=>{
      setRenameCdActive(false);
      renameCdTimerRef.current=null;
    },5000);
  }

  // 点击"修改"用户名
  function handleRename(){
    if(renameCdActive||!socketRef.current)return;
    socketRef.current.emit('renameUser',{uuid:playerUUID,newName:renameInput});
    startRenameCooldown();
  }

  function handleRandomUsername(){
    if(!socketRef.current)return;
    socketRef.current.emit('randomUsername',{uuid:playerUUID});
  }

  function closeRoomModal(){
    setRoomModal(null);
    if(socketRef.current){socketRef.current.disconnect();socketRef.current=null;}
  }
  const selfPanelRef=useRef(null);
  const emojiButtonRef=useRef(null);
  const [panelRect,setPanelRect]=useState(null);
  const roleTextRef=useRef(null);
  const [roleTextRect,setRoleTextRect]=useState(null);
  const handAreaRef=useRef(null);
  const [handAreaRect,setHandAreaRect]=useState(null);
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
  const lastInspectionSeqRef=useRef(0);
  const [houndsSecLeft,setHoundsSecLeft]=useState(null);

  // ── Responsive layout ──────────────────────────────────────
  const {w:vw}=useWindowSize();
  const isMobile=vw<580;
  const isSmall=vw<860;
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

  const shouldDeferLogSync=useCallback((stateLike)=>{
    return !!stateLike?._playersBeforeThisDraw;
  },[]);

  useEffect(()=>{if(logRef.current)logRef.current.scrollTop=logRef.current.scrollHeight;},[visibleLog.length]);

  useEffect(()=>{
    if(anim||animQueueRef.current.length>0)return;
    if(gs?._playersBeforeThisDraw)return;
    const nextLog=Array.isArray(gs?.log)?gs.log:[];
    const curLog=visibleLogRef.current;
    const same=curLog.length===nextLog.length&&curLog.every((line,i)=>line===nextLog[i]);
    if(!same)syncVisibleLog(nextLog);
  },[gs?.log,anim,syncVisibleLog]);

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
    if(!gs||showTutorial||anim||animQueueRef.current.length>0||gs.gameOver)return;
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
  },[gs?._inspectionSeq,gs?._inspectionEvents,gs?.gameOver,anim,showTutorial]);

  // Measure player self-panel rect for tutorial steps 2-4 pointer
  useEffect(()=>{
    const update=()=>{
      if(showTutorial&&tutorialStep>=2&&tutorialStep<=4&&selfPanelRef.current){
        const r=selfPanelRef.current.getBoundingClientRect();
        setPanelRect({top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
      }
      if(showTutorial&&tutorialStep===5&&roleTextRef.current){
        const r=roleTextRef.current.getBoundingClientRect();
        setRoleTextRect({top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
      }
      if(showTutorial&&(tutorialStep===7||tutorialStep===15)&&handAreaRef.current){
        const r=handAreaRef.current.getBoundingClientRect();
        setHandAreaRect({top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
      }
      if(showTutorial&&(tutorialStep===9||tutorialStep===11)&&aiPanelAreaRef.current){
        const r=aiPanelAreaRef.current.getBoundingClientRect();
        setAiPanelAreaRect({top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
      }
      if(showTutorial&&(tutorialStep===12||tutorialStep===13)&&deckAreaRef.current){
        const r=deckAreaRef.current.getBoundingClientRect();
        setDeckAreaRect({top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
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
            const r=el.getBoundingClientRect();
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
        const srcR=srcEl?srcEl.getBoundingClientRect():{left:window.innerWidth*0.5,top:window.innerHeight*0.7,width:0,height:0};
        const srcX=srcR.left+srcR.width/2, srcY=srcR.top+srcR.height/2;
        const pts=anim.hitIndices.map(pi=>{
          const el=document.querySelector(`[data-pid="${pi}"]`);
          if(el){
            const r=el.getBoundingClientRect();
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
          const r=el.getBoundingClientRect();
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
        if(bel){const br=bel.getBoundingClientRect();setBewitchAnim({cx:br.left+br.width/2,cy:br.top+br.height/2});}
        else{setBewitchAnim({cx:window.innerWidth/2,cy:window.innerHeight*0.25});}
      }));
      setTimeout(()=>setBewitchAnim(null),1200);
    }else if(anim?.type==='CARD_TRANSFER'){
      const{fromPid,dest,toPid,count}=anim;
      // 测量源点（失去手牌的玩家面板中心）
      const srcEl=document.querySelector(`[data-pid="${fromPid}"]`);
      const srcR=srcEl?.getBoundingClientRect();
      const srcX=srcR?srcR.left+srcR.width/2:window.innerWidth/2;
      const srcY=srcR?srcR.top+srcR.height/2:window.innerHeight*0.5;
      // 测量终点
      let destX,destY;
      if(dest==='discard'){
        const dr=discardPileRef.current?.getBoundingClientRect();
        destX=dr?dr.left+dr.width/2:window.innerWidth*0.45;
        destY=dr?dr.top+dr.height/2:window.innerHeight*0.45;
      }else if(dest==='player'){
        const destEl=document.querySelector(`[data-pid="${toPid}"]`);
        const pr=destEl?.getBoundingClientRect();
        destX=pr?pr.left+pr.width/2:window.innerWidth*0.5;
        destY=pr?pr.top+pr.height/2:window.innerHeight*0.25;
      }else{
        // godzone = 同一面板的上部（角色区域）
        destX=srcX;
        destY=srcR?srcR.top+srcR.height*0.25:srcY*0.5;
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
          const r=el.getBoundingClientRect();
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
  },[anim]);

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
        if(suppressNextBroadcastRef.current){
          // This pendingGs came from a received state; don't echo it back to server
          suppressNextBroadcastRef.current=false;
          receivedGsRef.current=true;
        }
        setGs(prev=>{
          // Never overwrite a win/pending-win state with stale queued state
          if(prev?.gameOver||prev?.phase==='PLAYER_WIN_PENDING'||prev?.phase==='TREASURE_WIN')return prev;
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
      // 清除所有角色的_pendingAnimDeath标记，使面板置灰
      const cleanedPlayers = nextGs.players.map(p => ({...p, _pendingAnimDeath: false}));
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
        const aiTurnDrawnCard=hasTurnStartDraw?(rawResult._aiDrawnCard??gs._aiDrawnCard??gs._drawnCard??null):null;
        const aiTurnDiscarded=hasTurnStartDraw?!!rawResult._discardedDrawnCard:false;
        const fakeGs = ps => ({...gs, players: ps});
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
          const drawEffectQ=bindAnimLogChunks(buildAnimQueue(fakeGs(gs._playersBeforeThisDraw),gs),{statLogs:gs._statLogs});
          queue.push(...drawEffectQ);
          if(drawEffectQ.length){
            visualPlayersLockRef.current=copyPlayers(gs._playersBeforeThisDraw);
            queue.push({type:'STATE_PATCH',players:gs.players,discard:gs.discard});
          }
        }
        // Add discard anim if AI chose to discard the drawn card
        if(aiTurnDiscarded&&aiTurnDrawnCard){
          queue.push({type:'DISCARD',card:aiTurnDrawnCard,triggerName:gs.players[gs.currentTurn]?.name||'???',targetPid:gs.currentTurn});
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
        // Play draw and discard animations first, then show hunt animation
        triggerAnimQueue(finalQueue, newGs, () => {
          // After draw animations complete, show hunt animation
          triggerAnimQueue([{type:'SKILL_HUNT',msgs:nextLog.slice(oldLog.length),targetIdx:0}], newGs);
        });
        return;
      }
      try{
        // Strip ALL animation-only temp fields before storing as real game state
        const{_aiDrawnCard,_aiName,_playersBeforeNextDraw,_aiHuntEvents,_playersBeforeSkillAction,_preSkillLogs,_preSkillDiscard,...stripped}=rawResult;
        newGs=stripped; // reassign: stripped has _playersBeforeThisDraw from startNextTurn
        const oldLog=Array.isArray(gs.log)?gs.log:[];
        const nextLog=Array.isArray(newGs.log)?newGs.log:oldLog;
        const newMsgs=nextLog.slice(oldLog.length);
        const j=newMsgs.join(' ');
        // Helper: build a gs-like object with substituted players for buildAnimQueue
        // fakeGs: use gs.log as the baseline so buildAnimQueue correctly detects new messages
        const fakeGs = ps => ({...gs, players: ps});
        const hasTurnStartDraw=!!gs._playersBeforeThisDraw;
        const aiTurnDrawnCard=hasTurnStartDraw?(rawResult._aiDrawnCard??gs._aiDrawnCard??gs._drawnCard??null):null;
        const aiTurnDiscarded=hasTurnStartDraw?!!rawResult._discardedDrawnCard:false;
        const {currentTurnLogs}=splitTransitionLogs(oldLog,nextLog);
        const queue=[];
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
          const drawEffectQ=bindAnimLogChunks(buildAnimQueue(fakeGs(gs._playersBeforeThisDraw),gs),{statLogs:gs._statLogs});
          queue.push(...drawEffectQ);
          if(drawEffectQ.length){
            visualPlayersLockRef.current=copyPlayers(gs._playersBeforeThisDraw);
            queue.push({type:'STATE_PATCH',players:gs.players,discard:gs.discard});
          }
        }
        // 2c. Discard anim if AI chose to discard the drawn card
        if(aiTurnDiscarded&&aiTurnDrawnCard){
          queue.push({type:'DISCARD',card:aiTurnDrawnCard,triggerName:gs.players[gs.currentTurn]?.name||'???',targetPid:gs.currentTurn});
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
        const P_actionEnd=rawResult._playersBeforeNextDraw||newGs.players;
        const actionStatQ=buildAnimQueue(gs,fakeGs(P_actionEnd));
        const huntEventQueue=(rawResult._aiHuntEvents||[]).flatMap(evt=>buildAiHuntEventAnimQueue(evt,gs.players[gs.currentTurn]?.name||'???'));
        let orderedActionQ=null;
        const hasActualSwap=newMsgs.some(m=>/^.+对 .+ 【掉包】/.test(m));
        if(hasActualSwap) queue.push({type:'SKILL_SWAP',msgs:extractSkillLogs(newMsgs,'swap')});
        else if(huntEventQueue.length){
          orderedActionQ=huntEventQueue;
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
            orderedActionQ=buildBewitchForcedCardQueue(gs.currentTurn,bwti,giftedCard,P_actionEnd[bwti]?.name,[...inspectionRevealQ,...actionStatQ],extractSkillLogs(newMsgs,'bewitch'),bewitchTurnIntroName);
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
          // 如果下一个是AI，且它摸首牌直接死亡导致了这局游戏结束，此时不会有真正的下一个AI回合勾子运行了，必须把它的暴毙动画立刻压入队列
          if(newGs.gameOver && newGs.currentTurn !== gs.currentTurn){
            const aiNextStatQ = bindAnimLogChunks(
              buildAnimQueue(fakeGs(P_actionEnd), newGs),
              {statLogs: newGs._statLogs||[]}
            );
            nextTurnIntroQueue=[...aiNextStatQ];
          }
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
  },[gs?.gameOver,isMultiplayer]);

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
  },[gs,anim,showTutorial]);

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
        const nextPicker=ad.pickOrder?.[nextPickIndex];
        const win=checkWin(P,prev._isMP);
        if(win)return {...prev,players:P,deck:D,discard:Disc,log:L,gameOver:win,phase:'ACTION',abilityData:{}};
        if(nextPickIndex>=(ad.pickOrder?.length||0)||cards.length===0){
          return {...prev,players:P,deck:D,discard:Disc,log:L,phase:isAiSeat(prev,ad.pickSource)?'AI_TURN':'ACTION',abilityData:{
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
      const sourceName = prev.find(p => p.idx === idx)?.sourceName || gs.players[idx].name;
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
  },[roomModal?.countdown?.version]);

  // ── 多人游戏：回合计时器（45s）─────────────────────────────────
  // 只在回合切换时重置（currentTurn/_turnKey 变化），不监听 phase 避免每次 phase 变化都重置
  const mpTurnTimeoutRef=useRef(null);
  const mpTurnStartRef=useRef(null);    // Date.now() when current turn timer started
  const mpTurnPausedElapsedRef=useRef(null); // ms elapsed before HUNT_WAIT_REVEAL pause
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
  },[isMultiplayer,gs?.currentTurn,gs?._turnKey,gs?.gameOver]);

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
  },[isMultiplayer,gs?.phase,gs?.currentTurn,gs?.gameOver]);

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
  },[isMpCthDecisionPhase,gs?.phase,gs?.drawReveal?.card?.id,gs?.abilityData?.godCard?.id,gs?.gameOver]);

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
  },[isMultiplayer,gs?.phase,gs?.currentTurn,gs?._turnKey,gs?.gameOver]);

  // 执行自动从右侧弃牌
  useEffect(()=>{
    if(!gs?._mpAutoDiscard)return;
    setGs(p=>p?{...p,_mpAutoDiscard:undefined}:p);
    autoDiscardRef.current?.();
  },[gs?._mpAutoDiscard]);

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
      <div onClickCapture={handleUiSfxCapture} style={{minHeight:'100vh',background:'#0a0705',color:'#c8a96e',fontFamily:"'IM Fell English','Georgia',serif",display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',textAlign:'center',padding:24,position:'relative',overflow:'hidden'}}>
        {/* Vignette */}
        <div style={{position:'fixed',inset:0,background:'radial-gradient(ellipse at center,transparent 30%,#000000bb 100%)',pointerEvents:'none'}}/>
        {/* Animation overlay — visible even before game starts (first-turn card flip) */}
        <AnimOverlay anim={anim} exiting={animExiting}/>
        <div style={{position:'relative',zIndex:1}}>
          <div style={{position:'relative',width:'min(520px,92vw)',margin:'0 auto 22px',padding:'26px 0 18px'}}>
            <TitleCandleFlames/>
          <h1 style={{fontFamily:"'Cinzel Decorative','Cinzel',serif",fontSize:34,fontWeight:700,letterSpacing:3,marginBottom:4,color:'#e8c87a',textShadow:'0 0 40px #c8a96e44,0 2px 0 #0a0705'}}>邪神的宝藏</h1>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:13,letterSpacing:3,color:'#c8a96e',marginBottom:4,opacity:0.85}}>克苏鲁卡牌对战</div>
          <div style={{fontSize:10,letterSpacing:5,color:'#a07838',fontFamily:"'Cinzel',serif",marginBottom:10,textTransform:'uppercase',opacity:0.7}}>Treasures of Evils</div>
          <div style={{width:200,height:1,background:'linear-gradient(90deg,transparent,#5a4020,transparent)',margin:'0 auto 20px'}}/>
          <p style={{color:'#b89858',maxWidth:380,margin:'0 auto 8px',lineHeight:1.9,fontSize:14,fontStyle:'italic'}}>
            "古神沉眠之时，旅者聚于此地。寻宝者寻觅遗物，追猎者猎杀异类，邪祀者企图唤醒邪神。各怀秘密，命运共织。"
          </p>
          </div>
          {/* Role cards */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,maxWidth:500,width:'100%',margin:'0 auto 8px',transform:'translateY(-22px)'}}>
            {Object.entries(RINFO).map(([role,r])=>(
              <div key={role} style={{background:'#140f08',border:`1.5px solid ${r.dim}`,borderRadius:3,padding:'16px 12px',textAlign:'center',boxShadow:`0 0 20px ${r.dim}33`}}>
                <div style={{fontSize:22,marginBottom:6,color:r.col,textShadow:`0 0 12px ${r.col}`}}>{r.icon}</div>
                <div style={{fontFamily:"'Cinzel',serif",fontWeight:700,color:r.col,fontSize:12,letterSpacing:2,marginBottom:8}}>{role}</div>
                <div style={{fontFamily:"'Microsoft YaHei','SimHei',sans-serif",color:'#a07838',fontSize:11,lineHeight:1.6,fontStyle:'italic'}}>{r.goal}</div>
              </div>
            ))}
          </div>
          {/* Rules */}
          <div style={{background:'#140f08',border:'1.5px solid #2a1a08',borderRadius:3,padding:'16px 22px',maxWidth:420,width:'100%',margin:'0 auto 32px',textAlign:'left'}}>
            <div style={{fontFamily:"'Cinzel',serif",color:'#b07828',fontSize:10,letterSpacing:3,marginBottom:10,textTransform:'uppercase'}}>— 规则要点 —</div>
            {[
              '游戏身份随机分配',
              '每人初始 HP / SAN 各 10，上限 10',
              '每回合开始摸 1 张牌；摸到区域牌时可选择收入手牌并触发效果，或直接弃置',
              '被【蛊惑】获得的牌必须收入手牌并触发效果，不能选择弃置',
              '可发动身份技能、休息或直接结束回合',
              '【掉包】与【蛊惑】每回合限用一次；【追捕】同回合可连续发动',
              '可发动【休息】：翻面自己的角色卡，掷2枚6面骰取最高值回复HP；翻面状态下下回合自动翻回并跳过（不摸牌不弃牌）',
              '每回合只能使用技能或休息其中之一，二者互斥',
              '手牌上限 4 张，超出须在回合结束前弃牌',
            ].map((t,i)=>(
              <div key={i} style={{display:'flex',gap:8,marginBottom:6,alignItems:'flex-start'}}>
                <span style={{color:'#a07838',fontSize:9,marginTop:2}}>✦</span>
                <span style={{color:'#c8a96e',fontSize:12,lineHeight:1.7,fontStyle:'italic'}}>{t}</span>
              </div>
            ))}
          </div>
          {/* ── Main action buttons ── */}
          <div style={{display:'flex',gap:12,justifyContent:'center',alignItems:'center',flexWrap:'wrap'}}>
            <button onClick={startNewGame} style={{
              padding:'13px 52px',
              background:'#1c1008',
              border:'2px solid #7a5020',
              color:'#c8a96e',
              fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:15,
              borderRadius:2,cursor:'pointer',letterSpacing:3,
              boxShadow:'0 0 30px #7a502044',
              textTransform:'uppercase',
              transition:'all .2s',
            }}>踏入黑暗</button>
            <button
              onClick={handleMultiplayer}
              disabled={multiLoading}
              style={{
                padding:'13px 36px',
                background: multiLoading?'#180e08':'#0e0a14',
                border:'2px solid #5a3a80',
                color: multiLoading?'#5a4070':'#a080d0',
                fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:15,
                borderRadius:2,cursor:multiLoading?'not-allowed':'pointer',letterSpacing:3,
                boxShadow:'0 0 30px #5a3a8033',
                textTransform:'uppercase',
                transition:'all .2s',
                display:'flex',alignItems:'center',gap:8,
              }}
            >
              {multiLoading&&(
                <span style={{
                  display:'inline-block',width:14,height:14,
                  border:'2px solid #5a3a80',borderTopColor:'#a080d0',
                  borderRadius:'50%',
                  animation:'spinLoader 0.7s linear infinite',
                  flexShrink:0,
                }}/>
              )}
              联机对战
            </button>
          </div>
          {/* Bottom row: about + roadmap */}
          <div style={{display:'flex',justifyContent:'space-between',width:'100%',maxWidth:420,margin:'28px auto 0',gap:12}}>
            <button onClick={()=>setModal('about')} style={{
              flex:1,padding:'8px 10px',background:'transparent',
              border:'1px solid #3a2510',color:'#a07838',
              fontFamily:"'Cinzel',serif",fontSize:10,borderRadius:2,
              cursor:'pointer',letterSpacing:0.5,transition:'all .15s',
            }}>关于作者 & 意见与反馈</button>
            <button onClick={()=>setModal('roadmap')} style={{
              flex:1,padding:'8px 10px',background:'transparent',
              border:'1px solid #3a2510',color:'#a07838',
              fontFamily:"'Cinzel',serif",fontSize:10,borderRadius:2,
              cursor:'pointer',letterSpacing:0.5,transition:'all .15s',
            }}>版本更新计划</button>
          </div>
        </div>
        {modal==='about'&&<AboutModal onClose={()=>setModal(null)}/>}
        {modal==='roadmap'&&<RoadmapModal onClose={()=>setModal(null)}/>}
        {/* ── 断线遮罩（多人游戏断线后禁止操作）── */}
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
        {/* ── Toast notifications ── */}
        <div style={{position:'fixed',top:20,left:'50%',transform:'translateX(-50%)',zIndex:2000,display:'flex',flexDirection:'column',gap:8,alignItems:'center',pointerEvents:'none'}}>
          {toasts.map(t=>(
            <div key={t.id} style={{
              background:'#1a1028',border:'1.5px solid #7a50b0',borderRadius:4,
              color:'#c8a0e8',fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:0.5,
              padding:'10px 20px',boxShadow:'0 4px 24px #00000088',
              animation:'toastIn 0.3s ease-out',
              maxWidth:'calc(100vw - 32px)',textAlign:'center',
            }}>{t.text}</div>
          ))}
        </div>
        {/* ── Online Options Modal ── */}
        {onlineOptionsModal&&(
          <div style={{position:'fixed',inset:0,background:'#000000cc',zIndex:1500,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={closeOnlineOptions}>
            <div onClick={e=>e.stopPropagation()} style={{
              background:'#0e0a14',border:'2px solid #7a50b0',borderRadius:6,
              padding:'28px 32px',maxWidth:400,width:'90%',
              boxShadow:'0 0 60px #5a3a8066',animation:'animPop 0.25s ease-out',
              position:'relative',display:'flex',flexDirection:'column',gap:16,
            }}>
              <button onClick={closeOnlineOptions} style={{position:'absolute',top:12,right:14,background:'none',border:'none',color:'#5a4070',fontSize:18,cursor:'pointer',lineHeight:1,padding:'2px 6px'}}>✕</button>

              {/* ── 标题 ── */}
              <div style={{textAlign:'center',marginBottom:4}}>
                <div style={{fontSize:26,marginBottom:8,filter:'drop-shadow(0 0 12px #a080d088)'}}>🌐</div>
                <div style={{fontFamily:"'Cinzel Decorative','Cinzel',serif",fontSize:15,color:'#c8a0e8',letterSpacing:2,marginBottom:6}}>联机对战</div>
                <div style={{width:100,height:1,background:'linear-gradient(90deg,transparent,#7a50b0,transparent)',margin:'0 auto'}}/>
              </div>

              {/* ── 功能区 A：创建房间 ── */}
              <div style={{background:'#120920',border:'1px solid #4a3070',borderRadius:4,padding:'16px 18px'}}>
                <button onClick={handleCreateRoom} disabled={multiLoading} style={{
                  width:'100%',padding:'12px',background:'#1e0d36',
                  border:'1.5px solid #7a50b0',borderRadius:4,
                  color:'#c8a0e8',fontFamily:"'Cinzel Decorative','Cinzel',serif",
                  fontSize:13,letterSpacing:2,cursor:multiLoading?'not-allowed':'pointer',
                  display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                  transition:'all .2s',
                }}>
                  {multiLoading&&<span style={{display:'inline-block',width:12,height:12,border:'2px solid #5a3a80',borderTopColor:'#a080d0',borderRadius:'50%',animation:'spinLoader 0.7s linear infinite'}}/>}
                  创建房间
                </button>
              </div>

              {/* ── 功能区 B：游戏大厅 ── */}
              <div style={{background:'#120920',border:'1px solid #4a3070',borderRadius:4,padding:'16px 18px'}}>
                <button onClick={handleOpenLobby} disabled={multiLoading} style={{
                  width:'100%',padding:'12px',background:'#1e0d36',
                  border:'1.5px solid #7a50b0',borderRadius:4,
                  color:'#c8a0e8',fontFamily:"'Cinzel Decorative','Cinzel',serif",
                  fontSize:13,letterSpacing:2,cursor:multiLoading?'not-allowed':'pointer',
                  display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                  transition:'all .2s',
                }}>
                  {multiLoading&&<span style={{display:'inline-block',width:12,height:12,border:'2px solid #5a3a80',borderTopColor:'#a080d0',borderRadius:'50%',animation:'spinLoader 0.7s linear infinite'}}/>}
                  游戏大厅
                </button>
              </div>

              {/* ── 功能区 C：加入房间 ── */}
              <div style={{background:'#120920',border:'1px solid #4a3070',borderRadius:4,padding:'16px 18px',display:'flex',flexDirection:'column',gap:10}}>
                <div style={{fontFamily:"'Cinzel',serif",color:'#6a5080',fontSize:9,letterSpacing:2,textTransform:'uppercase'}}>— 或者输入房间号加入房间 —</div>
                <input
                  value={joinRoomInput}
                  onChange={e=>setJoinRoomInput(e.target.value.toUpperCase())}
                  onKeyDown={e=>e.key==='Enter'&&handleJoinRoom()}
                  placeholder="房间号"
                  maxLength={6}
                  style={{
                    background:'#160d22',border:'1px solid #5a3a80',borderRadius:3,
                    color:'#e0c0f8',fontFamily:"'Cinzel',serif",fontSize:14,
                    padding:'8px 12px',outline:'none',letterSpacing:3,
                    textTransform:'uppercase',width:'100%',boxSizing:'border-box',
                  }}
                />
                <button onClick={handleJoinRoom} disabled={multiLoading} style={{
                  width:'100%',padding:'12px',background:'#1a1030',
                  border:'1.5px solid #5a3a80',borderRadius:4,
                  color:'#b090d8',fontFamily:"'Cinzel Decorative','Cinzel',serif",
                  fontSize:13,letterSpacing:2,cursor:multiLoading?'not-allowed':'pointer',
                  display:'flex',alignItems:'center',justifyContent:'center',gap:8,
                  transition:'all .2s',
                }}>
                  {multiLoading&&<span style={{display:'inline-block',width:12,height:12,border:'2px solid #5a3a80',borderTopColor:'#a080d0',borderRadius:'50%',animation:'spinLoader 0.7s linear infinite'}}/>}
                  加入房间
                </button>
              </div>

              {/* ── 功能区 C：用户名 ── */}
              <div style={{background:'#120920',border:'1px solid #4a3070',borderRadius:4,padding:'16px 18px',display:'flex',flexDirection:'column',gap:8}}>
                <div style={{fontFamily:"'Cinzel',serif",color:'#6a5080',fontSize:9,letterSpacing:2,textTransform:'uppercase'}}>— 你的联机用户名 —</div>
                {renameInputVisible?(
                  <div style={{display:'flex',gap:6,alignItems:'center'}}>
                    <div style={{position:'relative',flex:1,display:'flex',alignItems:'center'}}>
                      <input
                        autoFocus
                        value={renameInput}
                        onChange={e=>setRenameInput(e.target.value)}
                        onKeyDown={e=>{if(e.key==='Enter'){handleRename();setRenameInputVisible(false);}else if(e.key==='Escape')setRenameInputVisible(false);}}
                        maxLength={10}
                        style={{
                          flex:1,background:'#160d22',border:'1px solid #5a3a80',borderRadius:3,
                          color:'#e0c0f8',fontFamily:"'Cinzel',serif",fontSize:13,
                          padding:'6px 34px 6px 10px',outline:'none',letterSpacing:1,
                        }}
                      />
                      <button
                        onClick={handleRandomUsername}
                        title='随机用户名'
                        style={{
                          position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',
                          width:22,height:22,display:'flex',alignItems:'center',justifyContent:'center',
                          background:'none',border:'none',padding:0,
                          color:'#cda85a',fontSize:14,
                          cursor:'pointer',lineHeight:1,
                        }}
                      >
                        🎲
                      </button>
                    </div>
                    <button onClick={()=>{handleRename();setRenameInputVisible(false);}} disabled={renameCdActive} style={{
                      padding:'6px 12px',background:renameCdActive?'#1e1430':'#2e1450',
                      border:'1px solid '+(renameCdActive?'#3a2560':'#7a50b0'),
                      borderRadius:3,color:renameCdActive?'#5a4070':'#c8a0e8',
                      fontFamily:"'Cinzel',serif",fontSize:11,
                      cursor:renameCdActive?'not-allowed':'pointer',whiteSpace:'nowrap',
                    }}>{renameCdActive?'冷却中…':'确认'}</button>
                  </div>
                ):(
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontFamily:"'Cinzel',serif",fontSize:14,color:playerUsernameSpecial?'#d8b35c':'#e0c0f8',letterSpacing:1,flex:1,textShadow:playerUsernameSpecial?'0 0 10px rgba(216,179,92,.22)':'none'}}>{playerUsername||'—'}</span>
                    <button onClick={()=>{setRenameInput(playerUsername);setRenameInputVisible(true);}} style={{
                      padding:'4px 10px',background:'none',
                      border:'1px solid #5a3a80',borderRadius:3,
                      color:'#a080c8',fontFamily:"'Cinzel',serif",fontSize:10,
                      cursor:'pointer',whiteSpace:'nowrap',
                    }}>修改</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
                {/* ── Room Modal ── */}
        {roomModal&&(
          <div style={{position:'fixed',inset:0,background:'#000000cc',zIndex:1500,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={closeRoomModal}>
            <div onClick={e=>e.stopPropagation()} style={{
              background:'#0e0a14',border:'2px solid #7a50b0',borderRadius:6,
              padding:'32px 36px',maxWidth:420,width:'90%',
              boxShadow:'0 0 60px #5a3a8066',animation:'animPop 0.25s ease-out',
              position:'relative',
            }}>
              <button onClick={closeRoomModal} style={{position:'absolute',top:12,right:14,background:'none',border:'none',color:'#5a4070',fontSize:18,cursor:'pointer',lineHeight:1,padding:'2px 6px'}}>✕</button>
              <div style={{textAlign:'center',marginBottom:24}}>
                <div style={{fontSize:28,marginBottom:10,filter:'drop-shadow(0 0 12px #a080d088)'}}>🔮</div>
                <div style={{fontFamily:"'Cinzel Decorative','Cinzel',serif",fontSize:16,color:'#c8a0e8',letterSpacing:2,marginBottom:6}}>联机房间</div>
                <div style={{width:120,height:1,background:'linear-gradient(90deg,transparent,#7a50b0,transparent)',margin:'0 auto'}}/>
              </div>
              <div style={{background:'#160d22',border:'1px solid #5a3a80',borderRadius:4,padding:'16px',textAlign:'center',marginBottom:20}}>
                <div style={{fontFamily:"'Cinzel',serif",color:'#8060a0',fontSize:10,letterSpacing:3,marginBottom:8,textTransform:'uppercase'}}>— 房间号 —</div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10}}>
                  <div style={{fontFamily:"'Cinzel Decorative','Cinzel',serif",fontSize:28,color:'#e0c0f8',letterSpacing:6,textShadow:'0 0 20px #a080d066'}}>{roomModal.roomId}</div>
                  <button onClick={()=>{try{navigator.clipboard.writeText(roomModal.roomId).then(()=>addToast('✓ 房间号已复制')).catch(()=>addToast('复制失败，请手动复制'));}catch{addToast('复制失败，请手动复制');}}} title="复制房间号" style={{
                    background:'#1a0d2e',border:'1px solid #7a50b0',borderRadius:4,
                    padding:'5px 10px',cursor:'pointer',color:'#c8a0e8',
                    fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1,
                    display:'inline-flex',alignItems:'center',gap:5,flexShrink:0,
                    boxShadow:'0 0 8px #5a3a8044',
                  }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c8a0e8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                    复制
                  </button>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8}}>
                  <div style={{color:'#6a5080',fontSize:10,fontStyle:'italic'}}>将此房间号分享给其他玩家</div>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:10,color:'#8060a0',letterSpacing:1}}>房间人数：<span style={{color:'#c8a0e8'}}>{roomModal.count||roomModal.players.length}</span>/{roomModal.max||12}</div>
                </div>
                {/* 房间隐私状态 */}
                <div style={{display:'flex',justifyContent:'center',alignItems:'center',gap:8,marginTop:12}}>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:10,color:'#8060a0',letterSpacing:1}}>房间状态：</div>
                  <div style={{display:'flex',alignItems:'center',gap:4}}>
                    {/* 只有房主可以切换隐私状态 */}
                    {roomModal.owner === (playerUUIDRef.current||playerUUID) ? (
                      <button 
                        onClick={() => handleTogglePrivacy(!roomModal.isPrivate)}
                        title={roomModal.isPrivate ? '切换为公开' : '切换为私密'}
                        style={{
                          display:'flex',
                          alignItems:'center',
                          gap:4,
                          background:'none',
                          border:'none',
                          cursor:'pointer',
                          padding:'4px 8px',
                          borderRadius:4,
                          transition:'background-color 0.2s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(122, 80, 176, 0.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'none'}
                      >
                        <span style={{fontSize:12}}>{roomModal.isPrivate ? '🔒' : '🔓'}</span>
                        <span style={{fontFamily:"'Cinzel',serif",fontSize:10,color:roomModal.isPrivate ? '#e0c0f8' : '#90d090',letterSpacing:1}}>{roomModal.isPrivate ? '私密' : '公开'}</span>
                      </button>
                    ) : (
                      <div style={{display:'flex',alignItems:'center',gap:4}}>
                        <span style={{fontSize:12}}>{roomModal.isPrivate ? '🔒' : '🔓'}</span>
                        <span style={{fontFamily:"'Cinzel',serif",fontSize:10,color:roomModal.isPrivate ? '#e0c0f8' : '#90d090',letterSpacing:1}}>{roomModal.isPrivate ? '私密' : '公开'}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {/* 玩家列表 + 准备状态 */}
              <div style={{marginBottom:16}}>
                <div style={{fontFamily:"'Cinzel',serif",color:'#6a5080',fontSize:9,letterSpacing:3,marginBottom:10,textTransform:'uppercase'}}>— 当前玩家 —</div>
                {roomModal.players.map((p)=>(
                  <div key={p.uuid} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',marginBottom:6,background:'#1a1028',border:`1px solid ${p.ready?'#3a6a3a':'#3a2560'}`,borderRadius:3,transition:'border-color .3s'}}>
                    <span style={{fontSize:12}}>{p.ready?'✅':'⬜'}</span>
                    <span style={{fontFamily:"'Cinzel',serif",fontSize:13,color:p.isSpecialName?'#d8b35c':(p.ready?'#90d090':'#c8a0e8'),letterSpacing:0.5,textShadow:p.isSpecialName?'0 0 10px rgba(216,179,92,.22)':'none'}}>{p.username}</span>
                    {p.uuid===playerUUID&&<span style={{marginLeft:'auto',color:'#7060a0',fontSize:9,fontStyle:'italic'}}>（你）</span>}
                    {p.isAI&&<span style={{marginLeft:'auto',color:'#a060a0',fontSize:9,fontStyle:'italic'}}>[AI]</span>}
                  </div>
                ))}
              </div>
              {/* 准备按钮 */}
              {(()=>{const myPlayerRec=roomModal.players.find(p=>p.uuid===playerUUID);const myReady=myPlayerRec?.ready||false;return(
                <button onClick={()=>handleSetReady(!myReady)} style={{
                  width:'100%',padding:'11px',marginBottom:14,
                  background:myReady?'#0a2a0a':'#1a0a2e',
                  border:`1.5px solid ${myReady?'#3a8a3a':'#7a50b0'}`,
                  borderRadius:4,color:myReady?'#80e080':'#c8a0e8',
                  fontFamily:"'Cinzel Decorative','Cinzel',serif",fontSize:12,letterSpacing:2,cursor:'pointer',
                  transition:'all .25s',
                }}>{myReady?'✅ 已准备（点击取消）':'⬜ 点击准备'}</button>
              );})()}
              {/* 倒计时显示 */}
              {cdType&&cdSecondsLeft!==null&&cdSecondsLeft>0&&(
                <div style={{
                  textAlign:'center',padding:'8px 12px',marginBottom:10,borderRadius:4,
                  background:cdType==='start'?'#0a1a0a':'#1a0a08',
                  border:`1px solid ${cdType==='start'?'#2a6a2a':'#7a3010'}`,
                  color:cdType==='start'?'#80e080':'#e08060',
                  fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1,
                }}>
                  {cdType==='start'
                    ?`🎮 全员准备！${cdSecondsLeft}s 后开始游戏…`
                    :`⏳ ${cdSecondsLeft}s 后将踢出未准备的玩家`}
                </div>
              )}
              {(()=>{const myPlayerRec=roomModal.players.find(p=>p.uuid===playerUUID);const myReady=myPlayerRec?.ready||false;return(
                myReady&&!roomModal.players.every(p=>p.ready)&&(
                  <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,color:'#6a5080',fontSize:11,fontStyle:'italic',fontFamily:"'IM Fell English','Georgia',serif"}}>
                    <span style={{display:'inline-block',width:10,height:10,border:'1.5px solid #5a3a80',borderTopColor:'#a080d0',borderRadius:'50%',animation:'spinLoader 0.9s linear infinite'}}/>
                    等待其他玩家就绪…
                  </div>
                )
              );})()}
            </div>
          </div>
        )}
        {/* ── Game Lobby Modal ── */}
        {lobbyModal&&(
          <div style={{position:'fixed',inset:0,background:'#000000cc',zIndex:1500,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={closeLobbyModal}>
            <div onClick={e=>e.stopPropagation()} style={{
              background:'#0e0a14',border:'2px solid #7a50b0',borderRadius:6,
              padding:'32px 36px',maxWidth:500,width:'90%',
              boxShadow:'0 0 60px #5a3a8066',animation:'animPop 0.25s ease-out',
              position:'relative',
            }}>
              <button onClick={closeLobbyModal} style={{position:'absolute',top:12,right:14,background:'none',border:'none',color:'#5a4070',fontSize:18,cursor:'pointer',lineHeight:1,padding:'2px 6px'}}>✕</button>
              <div style={{textAlign:'center',marginBottom:24}}>
                <div style={{fontSize:28,marginBottom:10,filter:'drop-shadow(0 0 12px #a080d088)'}}>🏛️</div>
                <div style={{fontFamily:"'Cinzel Decorative','Cinzel',serif",fontSize:16,color:'#c8a0e8',letterSpacing:2,marginBottom:6}}>游戏大厅</div>
                <div style={{width:120,height:1,background:'linear-gradient(90deg,transparent,#7a50b0,transparent)',margin:'0 auto'}}/>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                <div style={{fontFamily:"'Cinzel',serif",color:'#8060a0',fontSize:10,letterSpacing:3,textTransform:'uppercase'}}>— 公开房间 —</div>
                <button onClick={handleRefreshLobby} style={{
                  background:'#1a0d2e',border:'1px solid #7a50b0',borderRadius:4,
                  padding:'4px 8px',cursor:'pointer',color:'#c8a0e8',
                  fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:1,
                  display:'inline-flex',alignItems:'center',gap:4,
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#c8a0e8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.5 2v6h-6M2.5 22v-6h6"/>
                    <path d="M2 12A10 10 0 0 1 22 12"/>
                  </svg>
                  刷新
                </button>
              </div>
              <div style={{maxHeight:300,overflowY:'auto',marginBottom:20}}>
                {lobbyLoading ? (
                  <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:40}}>
                    <span style={{display:'inline-block',width:16,height:16,border:'2px solid #5a3a80',borderTopColor:'#a080d0',borderRadius:'50%',animation:'spinLoader 0.7s linear infinite'}}/>
                  </div>
                ) : lobbyRooms.length === 0 ? (
                  <div style={{textAlign:'center',padding:40,color:'#6a5080',fontFamily:"'IM Fell English','Georgia',serif",fontSize:12,fontStyle:'italic'}}>
                    暂无公开房间
                  </div>
                ) : (
                  lobbyRooms.map((room)=>(
                    <div key={room.roomId} style={{
                      display:'flex',alignItems:'center',justifyContent:'space-between',
                      padding:'12px 16px',marginBottom:8,
                      background:'#1a1028',border:'1px solid #4a3070',borderRadius:4,
                      transition:'all .2s',
                    }}>
                      <div>
                        <div style={{fontFamily:"'Cinzel Decorative','Cinzel',serif",fontSize:14,color:'#e0c0f8',letterSpacing:2}}>{room.roomId}</div>
                        <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:'#8060a0',letterSpacing:1,marginTop:2}}>
                          人数：{room.count}/{room.max}
                        </div>
                      </div>
                      <button onClick={()=>handleJoinLobbyRoom(room.roomId)} style={{
                        background:'#1e0d36',border:'1px solid #7a50b0',borderRadius:3,
                        padding:'6px 12px',cursor:'pointer',color:'#c8a0e8',
                        fontFamily:"'Cinzel',serif",fontSize:10,letterSpacing:1,
                        transition:'all .2s',
                      }}>
                        加入
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
        {/* ── Privacy Toggle Confirm Modal ── */}
        {showPrivacyToggleConfirm&&(
          <div style={{position:'fixed',inset:0,background:'#000000cc',zIndex:1600,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={handleCancelPrivacyToggle}>
            <div onClick={e=>e.stopPropagation()} style={{
              background:'#0e0a14',border:'2px solid #7a50b0',borderRadius:6,
              padding:'28px 32px',maxWidth:400,width:'90%',
              boxShadow:'0 0 60px #5a3a8066',animation:'animPop 0.25s ease-out',
              position:'relative',
            }}>
              <div style={{textAlign:'center',marginBottom:20}}>
                <div style={{fontSize:24,marginBottom:12,filter:'drop-shadow(0 0 12px #a080d088)'}}>🔓</div>
                <div style={{fontFamily:"'Cinzel Decorative','Cinzel',serif",fontSize:14,color:'#c8a0e8',letterSpacing:2,marginBottom:10}}>确认公开房间</div>
                <div style={{width:100,height:1,background:'linear-gradient(90deg,transparent,#7a50b0,transparent)',margin:'0 auto',marginBottom:16}}/>
                <div style={{color:'#e0c0f8',fontSize:12,lineHeight:1.6,fontFamily:"'IM Fell English','Georgia',serif",textAlign:'center'}}>
                  该房间将在游戏大厅对所有用户公开，是否继续？
                </div>
              </div>
              <div style={{display:'flex',gap:12,marginBottom:16}}>
                <div style={{flex:1,display:'flex',alignItems:'center',gap:6}}>
                  <input 
                    type="checkbox" 
                    id="dontShowAgain"
                    checked={privacyWarnDontShow}
                    onChange={e=>setPrivacyWarnDontShow(e.target.checked)}
                    style={{
                      accentColor:'#7a50b0',
                      transform:'scale(1.2)',
                    }}
                  />
                  <label htmlFor="dontShowAgain" style={{
                    color:'#8060a0',fontSize:11,fontFamily:"'Cinzel',serif",letterSpacing:1,
                    cursor:'pointer',
                  }}>
                    下次不再提示
                  </label>
                </div>
              </div>
              <div style={{display:'flex',gap:12}}>
                <button onClick={()=>handleConfirmPrivacyToggle()} style={{
                  flex:1,padding:'10px',background:'#1e0d36',
                  border:'1.5px solid #7a50b0',borderRadius:4,
                  color:'#c8a0e8',fontFamily:"'Cinzel Decorative','Cinzel',serif",
                  fontSize:12,letterSpacing:2,cursor:'pointer',
                  transition:'all .2s',
                }}>
                  公开
                </button>
                <button onClick={handleCancelPrivacyToggle} style={{
                  flex:1,padding:'10px',background:'#1a1030',
                  border:'1.5px solid #5a3a80',borderRadius:4,
                  color:'#b090d8',fontFamily:"'Cinzel Decorative','Cinzel',serif",
                  fontSize:12,letterSpacing:2,cursor:'pointer',
                  transition:'all .2s',
                }}>
                  不公开
                </button>
              </div>
            </div>
          </div>
        )}
                {/* ── Tutorial overlay ── */}
        {showTutorial&&(
          <div style={{position:'fixed',inset:0,background:'#000000cc',zIndex:999,display:'flex',alignItems:'center',justifyContent:'center'}}>
            {/* ── Step 1: Greeting ── */}
            {tutorialStep===1&&(
              <div style={{background:'#120d06',border:'2px solid #7a5020',borderRadius:4,padding:'36px 40px',maxWidth:380,width:'90%',textAlign:'center',boxShadow:'0 0 60px #7a502066',position:'relative',animation:'animPop 0.25s ease-out'}}>
                <div style={{fontSize:30,marginBottom:16,filter:'drop-shadow(0 0 14px #c8a96e66)'}}>👁</div>
                <p style={{color:'#e8c87a',fontSize:15,lineHeight:2,fontStyle:'italic',marginBottom:10,fontFamily:"'IM Fell English','Georgia',serif"}}>
                  哈，又是一个不怕死的人！
                </p>
                <p style={{color:'#c8a96e',fontSize:14,lineHeight:2,fontStyle:'italic',marginBottom:32,opacity:0.75,fontFamily:"'IM Fell English','Georgia',serif"}}>
                  等等——我们是不是见过…
                </p>
                <div style={{display:'flex',flexDirection:'column',gap:10}}>
                  <button
                    onClick={completeTutorial}
                    style={{padding:'9px 24px',background:'transparent',border:'1.5px solid #3a2510',color:'#b89858',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:11,borderRadius:2,cursor:'pointer',letterSpacing:1.5,textTransform:'uppercase',transition:'all .2s'}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor='#7a5020';e.currentTarget.style.color='#c8a96e';}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor='#3a2510';e.currentTarget.style.color='#7a6040';}}
                  >
                    我是老手（跳过引导）
                  </button>
                  <button
                    onClick={()=>{_startForTutorial();setTutorialStep(2);}}
                    style={{padding:'10px 24px',background:'#1c1008',border:'2px solid #c8a96e',color:'#e8c87a',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:11,borderRadius:2,cursor:'pointer',letterSpacing:1.5,textTransform:'uppercase',boxShadow:'0 0 18px #c8a96e33',transition:'all .2s'}}
                    onMouseEnter={e=>{e.currentTarget.style.background='#2a1a08';e.currentTarget.style.boxShadow='0 0 30px #c8a96e66';}}
                    onMouseLeave={e=>{e.currentTarget.style.background='#1c1008';e.currentTarget.style.boxShadow='0 0 18px #c8a96e33';}}
                  >
                    ✦ 告诉我如何探索
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {roleRevealAnim&&<RoleRevealAnim role={roleRevealAnim.role} onDone={()=>_onRoleRevealDone(roleRevealAnim.pendingGs)}/>}
        {/* ── Connection error modal ── */}
        {connErrModal&&(
          <div onClick={()=>setConnErrModal(false)} style={{position:'fixed',inset:0,background:'#000000bb',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
            <div onClick={e=>e.stopPropagation()} style={{background:'#0e0a14',border:'2px solid #5a3a80',borderRadius:6,padding:'32px 36px',maxWidth:360,width:'90%',textAlign:'center',boxShadow:'0 0 60px #5a3a8066',animation:'animPop 0.25s ease-out',cursor:'default'}}>
              <div style={{fontSize:28,marginBottom:12}}>🔌</div>
              <p style={{color:'#c8a0e8',fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',fontSize:14,lineHeight:1.9,marginBottom:24}}>
                无法连接服务器，<br/>先试试单人玩法吧
              </p>
              <div style={{color:'#5a4070',fontSize:10,fontFamily:"'Cinzel',serif",letterSpacing:1}}>点击任意位置关闭</div>
            </div>
          </div>
        )}
        <style>{GLOBAL_STYLES}</style>
      </div>
      {/* GammaSlider outside filtered lobby container */}
      <GammaSlider gamma={gamma} onChange={handleGamma}/>
      {isLocalTestMode&&(
        <>
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
          <button
            type="button"
            onClick={(e)=>{e.stopPropagation(); setShowDebugSettings(v=>!v);}}
            style={{
              ...smallBtnStyle,
              position:'fixed',
              top:14,
              left:100,
              zIndex:120,
              fontSize:11,
              padding:'6px 10px',
              background:showDebugSettings?'#2a1608':'#140e08',
              color:showDebugSettings?'#f0cb7a':'#9b7641',
              borderColor:showDebugSettings?'#7a5324':'#3a2510',
              boxShadow:showDebugSettings?'0 0 14px #7a532455':'none',
            }}
          >
            Debug设置
          </button>
          {showDebugSettings&&(
            <div style={{
              position:'fixed',
              top:50,
              left:14,
              zIndex:120,
              background:'#1a120a',
              border:'1px solid #3a2510',
              borderRadius:4,
              padding:16,
              boxShadow:'0 0 20px rgba(0,0,0,0.8)',
              color:'#c8a96e',
              minWidth:300,
            }}>
              <h3 style={{marginTop:0,marginBottom:16,color:'#f0cb7a'}}>Debug设置</h3>
              <div style={{marginBottom:12}}>
                <label style={{display:'block',marginBottom:4,fontSize:12}}>强制摸牌目标</label>
                <select
                  value={debugForceCardTarget}
                  onChange={(e)=>setDebugForceCardTarget(e.target.value)}
                  style={{
                    width:'100%',
                    padding:6,
                    background:'#2a1608',
                    color:'#c8a96e',
                    border:'1px solid #3a2510',
                    borderRadius:4,
                  }}
                >
                  <option value="player">玩家</option>
                  <option value="ai1">1号位角色</option>
                </select>
              </div>
              <div style={{marginBottom:12}}>
                <label style={{display:'block',marginBottom:4,fontSize:12}}>1号位角色是否收入这张牌</label>
                <select
                  value={debugForceCardKeep}
                  onChange={(e)=>setDebugForceCardKeep(e.target.value)}
                  style={{
                    width:'100%',
                    padding:6,
                    background:'#2a1608',
                    color:'#c8a96e',
                    border:'1px solid #3a2510',
                    borderRadius:4,
                  }}
                >
                  <option value="auto">自动判断</option>
                  <option value="keep">强制收入</option>
                  <option value="discard">强制弃置</option>
                </select>
              </div>
              <div style={{marginBottom:12}}>
                <label style={{display:'block',marginBottom:4,fontSize:12}}>牌类型</label>
                <select
                  value={debugForceCardType}
                  onChange={(e)=>setDebugForceCardType(e.target.value)}
                  style={{
                    width:'100%',
                    padding:6,
                    background:'#2a1608',
                    color:'#c8a96e',
                    border:'1px solid #3a2510',
                    borderRadius:4,
                  }}
                >
                  <option value="zone">区域牌</option>
                  <option value="god">神牌</option>
                </select>
              </div>
              {debugForceCardType === 'zone' && (
                <>
                  <div style={{marginBottom:12}}>
                    <label style={{display:'block',marginBottom:4,fontSize:12}}>区域牌编号</label>
                    <select
                      value={debugForceZoneCardKey}
                      onChange={(e)=>{
                        const newKey = e.target.value;
                        setDebugForceZoneCardKey(newKey);
                        // 自动选择第一个可用牌面
                        const cards = FIXED_ZONE_CARD_VARIANTS_BY_KEY[newKey]||[];
                        if(cards.length){
                          setDebugForceZoneCardName(cards[0].name);
                        }
                      }}
                      style={{
                        width:'100%',
                        padding:6,
                        background:'#2a1608',
                        color:'#c8a96e',
                        border:'1px solid #3a2510',
                        borderRadius:4,
                      }}
                    >
                      {ZONE_CARD_KEYS.map(key => (
                        <option key={key} value={key}>{key}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{marginBottom:12}}>
                    <label style={{display:'block',marginBottom:4,fontSize:12}}>区域牌</label>
                    <select
                      value={debugForceZoneCardName}
                      onChange={(e)=>setDebugForceZoneCardName(e.target.value)}
                      style={{
                        width:'100%',
                        padding:6,
                        background:'#2a1608',
                        color:'#c8a96e',
                        border:'1px solid #3a2510',
                        borderRadius:4,
                      }}
                    >
                      {FIXED_ZONE_CARD_VARIANTS_BY_KEY[debugForceZoneCardKey] && FIXED_ZONE_CARD_VARIANTS_BY_KEY[debugForceZoneCardKey].map((card) => (
                        <option key={card.name} value={card.name}>{card.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              {debugForceCardType === 'god' && (
                <div style={{marginBottom:12}}>
                  <label style={{display:'block',marginBottom:4,fontSize:12}}>神牌类型</label>
                  <select
                    value={debugForceGodCardKey}
                    onChange={(e)=>setDebugForceGodCardKey(e.target.value)}
                    style={{
                      width:'100%',
                      padding:6,
                      background:'#2a1608',
                      color:'#c8a96e',
                      border:'1px solid #3a2510',
                      borderRadius:4,
                    }}
                  >
                    <option value="CTH">克苏鲁</option>
                    <option value="NYA">Nyarlathotep</option>
                  </select>
                </div>
              )}
              <div style={{marginBottom:12}}>
                <label style={{display:'block',marginBottom:4,fontSize:12}}>当前设置</label>
                <div style={{fontSize:11,color:'#f0cb7a',padding:6,background:'#2a1608',border:'1px solid #3a2510',borderRadius:4}}>
                  {debugForceCardType === 'zone' 
                    ? `区域牌: ${debugForceZoneCardKey} - ${debugForceZoneCardName || ''}` 
                    : `神牌: ${debugForceGodCardKey === 'CTH' ? '克苏鲁' : 'Nyarlathotep'}`
                  }
                </div>
              </div>
              <div style={{marginBottom:12}}>
                <label style={{display:'block',marginBottom:4,fontSize:12}}>玩家身份（下局生效）</label>
                <select
                  value={debugPlayerRole}
                  onChange={(e)=>setDebugPlayerRole(e.target.value)}
                  style={{
                    width:'100%',
                    padding:6,
                    background:'#2a1608',
                    color:'#c8a96e',
                    border:'1px solid #3a2510',
                    borderRadius:4,
                  }}
                >
                  <option value="auto">自动</option>
                  <option value={ROLE_TREASURE}>{ROLE_TREASURE}</option>
                  <option value={ROLE_HUNTER}>{ROLE_HUNTER}</option>
                  <option value={ROLE_CULTIST}>{ROLE_CULTIST}</option>
                </select>
              </div>
              <button
                type="button"
                onClick={()=>setShowDebugSettings(false)}
                style={{
                  ...smallBtnStyle,
                  width:'100%',
                  background:'#2a1608',
                  color:'#c8a96e',
                  borderColor:'#3a2510',
                }}
              >
                关闭
              </button>
            </div>
          )}
        </>
      )}
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

  function handleDrawConfirm(){
    setGs(p=>p?{...p,phase:'ACTION',drawReveal:null}:p);
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
    const who=localDisplayName(drawerIdx,P[drawerIdx].name);
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
    if(fromRest){_cthContinueRestDraws(newGs);return;}
    setGs(newGs);
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
    if (gs.abilityData?.fromRest) { _cthContinueRestDraws(nextGs); return; }
    setGs(nextGs);
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
    const nextPicker=pickOrder[nextPickIndex];
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
    const rc=aiChooseRevealCard(P[ti].hand,'你',gs.log,knownHunterCards);
    const huntConfirmGs={...gs,players:P,phase:'HUNT_CONFIRM',
      abilityData:{...(gs.abilityData||{}),huntTi:ti,revCard:rc},
      log:[...gs.log,`你（追猎者）追捕 ${P[ti].name}，${P[ti].name} 亮出 ${cardLogText(rc,{alwaysShowName:true})}`]};
    // 动画位置测量交给 useEffect([anim]) 中的 SKILL_HUNT 分支（使用 data-pid，正确）
    const huntMsgs=extractSkillLogs(huntConfirmGs.log.slice(gs.log.length),'hunt');
    triggerAnimQueue([{type:'SKILL_HUNT',targetIdx:ti,msgs:huntMsgs}],huntConfirmGs);
  }
  function huntConfirm(myCardIdx){
    const{huntTi,revCard}=gs.abilityData;
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
          Disc=removeCardsFromDiscard(Disc,lootableHand);
          P[huntTi].hand=[...lootableHand];
          const handCount=P[huntTi].hand.length;
          const maxToTake=3;
          if(targetRevealBefore){
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
          }else{
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
    const stolenCard=P[huntTi].hand.splice(cardIdx,1)[0];
    P[0].hand.push(stolenCard);
    L.push(`你从 ${P[huntTi].name} 的公开手牌中选择了 ${cardLogText(stolenCard)}！`);
    // 检查是否已经选择了足够的手牌
    if(P[0].hand.length-gs.players[0].hand.length<maxToTake-1 && P[huntTi].hand.length>0){
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
    const{huntTi}=gs.abilityData; // huntTi = 被追捕者在当前视角下的 index（非0）
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
    const myHandBefore=[...(P[0]?.hand||[])];
    const myRevealBefore=!!P[0]?.revealHand;
    L.push(`你亮出 ${cardLogText(card,{alwaysShowName:true})}`);
    const aiHand=P[huntingAI].hand;
    const mi=aiHand.findIndex(c=>cardsHuntMatch(c,card));
    if(mi>=0){
      const dc=aiHand.splice(mi,1)[0];Disc.push(dc);
      const huntDamage=3+(P[huntingAI].damageBonus||0);
      applyHpDamageWithLink(P,0,huntDamage,Disc,L);
      L.push(`${aiHunterName} 弃 ${cardLogText(dc,{alwaysShowName:true})}，你受 ${huntDamage}HP 伤害！`);
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

    const huntMsgs=extractSkillLogs(L.slice(gs.log.length),'hunt');
    const queue=[{type:'SKILL_HUNT',msgs:huntMsgs,targetIdx:0},...buildAnimQueue(gs,newGs)];
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
    };
    const nextPhase=
      bewitchCard.type==='swapAllHands'?'ZONE_SWAP_SELECT_TARGET':
      res.statePatch?.peekHandTargets?'PEEK_HAND_SELECT_TARGET':
      res.statePatch?.caveDuelTargets?'CAVE_DUEL_SELECT_TARGET':
      res.statePatch?.damageLinkTargets?'DAMAGE_LINK_SELECT_TARGET':
      res.statePatch?.roseThornTargets?'ROSE_THORN_SELECT_TARGET':
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
        
        for(let _d=0;_d<extraDraws;_d++){
          const r2=playerDrawCard(P,D,Disc,0,oldGs);P=r2.P;D=r2.D;Disc=r2.Disc;
          if(r2.drawnCard)L.push(`  摸到 ${cardLogText(r2.drawnCard,{alwaysShowName:true})}`);
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
            // 继续下一张牌
            continue;
          }
        }
        
        const afterRest={...oldGs,players:P,deck:D,discard:Disc,log:L,restUsed:true,skillUsed:true,currentTurn:0};
        // 翻面状态下主动结束回合：需要弃牌
        const nextGs=P[0].hand.length>effectiveHandLimit
          ?{...afterRest,phase:'DISCARD_PHASE',abilityData:{discardSelected:[]}}
          :startNextTurn(afterRest);
        setGs(nextGs);
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
        const inspectionEvents = (newGs._inspectionEvents||[]).filter(ev=>ev?.seq>(gs._inspectionSeq||0));
        let inspectionAndTailQueue = [];
        if(inspectionEvents.length) {
          lastInspectionSeqRef.current=Math.max(lastInspectionSeqRef.current,...inspectionEvents.map(ev=>ev.seq||0));
          const inspectionFlow = buildInspectionEventFlow({...gs, players: newGs._playersBeforeThisDraw||gs.players}, inspectionEvents, {buildAnimQueue, copyPlayers});
          const tailQueue = buildAnimQueue({players: inspectionFlow.players, log: inspectionFlow.log}, newGs);
          inspectionAndTailQueue = [...inspectionFlow.queue, ...bindAnimLogChunks(tailQueue, {statLogs:newGs._statLogs})];
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
            inspectionAndTailQueue = [...inspectionFlow.queue, ...bindAnimLogChunks(tailQueue, {statLogs:newGs._statLogs})];
          } else {
            inspectionAndTailQueue = drawStatQ;
          }
        } else {
          inspectionAndTailQueue = drawStatQ;
        }
        animQueueRef.current=[...preTurnStatQ,...inspectionAndTailQueue];
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
      const statQ=buildAnimQueue(gs,newGs);
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
            inspectionAndTailQueue = [...inspectionFlow.queue, ...bindAnimLogChunks(tailQueue, {statLogs:pendingGs._statLogs})];
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
    ZONE_SWAP_SELECT_TARGET: `【强征献礼】选择要交换全部手牌的目标`,
    DAMAGE_LINK_SELECT_TARGET:'请选择绳索连接目标',
    CAVE_DUEL_SELECT_TARGET:'请选择“穴居人战争”的目标',
    CAVE_DUEL_SELECT_CARD: `⚠ 和${gs.players[gs.abilityData?.caveDuelSource]?.name||'对手'}来一场穴居人式的对决！尽可能亮出数字编号大的牌取胜，如果落败将失去这张牌`,
    ROSE_THORN_SELECT_TARGET:'【玫瑰倒刺】选择承受倒刺的目标',
    FIRST_COME_PICK_SELECT:`【先到先得】${gs.players[gs.abilityData?.pickOrder?.[gs.abilityData?.pickIndex||0]]?.name||'当前角色'} 请选择一张牌`,
  }[phase]||'';

  const currentPickerIdx=gs.abilityData?.pickOrder?.[gs.abilityData?.pickIndex||0];
  const isLocalDamageLinkSelect=!!gs&&isLocalDamageLinkSourcePhase(gs);
  const canLocalTargetSelect=!!gs&&canLocalActOnTargetSelectionPhase(gs);
  const canLocalSwapGive=!!gs&&isLocalSwapGivePhase(gs);
  const canLocalBewitchCard=!!gs&&isLocalBewitchCardPhase(gs);
  const canLocalFirstComePick=!!gs&&isLocalFirstComePicker(gs);
  const canLocalTortoiseSelect=!!gs&&isLocalTortoiseSelectPhase(gs);
  const selectingOther=canLocalTargetSelect;
  const selectingCardFromPublic=phase==='HUNT_SELECT_CARD_FROM_PUBLIC';
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
        if(isUpgrade||(!(gs.godTriggeredThisTurn||gs.godFromHandUsed)))worshipFromHand(idx);
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
      {/* ── 飞行表情覆盖层 ── */}
      {flyingEmojis.map(fe=>(
        <FlyingEmoji key={fe.id} {...fe} onDone={id=>setFlyingEmojis(prev=>prev.filter(x=>x.id!==id))}/>
      ))}
      {/* emoji picker moved outside filtered container — see Fragment below */}
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

      {/* Animation overlay */}
      {!suppressAnim&&<AnimOverlay anim={anim} exiting={animExiting}/>}
      {/* Guillotine death animation — rendered outside filtered container, see below */}
      {/* Skill overlays */}
      {!suppressAnim&&<SwapCupOverlay active={!!swapAnim} casterName={swapAnim?.casterName||''} targetName={swapAnim?.targetName||''}/>}

      {/* Target selection mask + floating prompt */}
      <TargetSelectOverlay drawReveal={gs.drawReveal} phase={isVisualPlayerTurn?phase:null} bewitchCard={gs.abilityData?.bewitchCard}/>

      {/* God choice modal */}
      {canShowTurnDecisionModal&&phase==='GOD_CHOICE'&&gs.abilityData?.godCard&&isLocalGodChoice&&(()=>{
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
          
        </div>

        {/* Scaled player areas wrapper */}
        <div style={{overflow:'hidden',width:'100%',display:'flex',justifyContent:'center'}}>
          <div style={{
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
                  const rect=emojiButtonRef.current?.getBoundingClientRect();
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
          <PileDisplay deckCount={gs.deck.length} discardCount={gs.discard.length} discardTop={gs.discard[gs.discard.length-1]||null} inspectionCount={gs.inspectionDeck.length+(gs.houndsOfTindalosActive?0:0)} compact={vw<430} baseHeight={middleRowHeight} deckRef={deckAreaRef} discardRef={discardPileRef} scaleRatio={scaleRatio}/>
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
          const sourceRect = sourceEl?.getBoundingClientRect();
          const partnerRect = partnerEl?.getBoundingClientRect();
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
          return (
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
          );
        })}

        {/* Hand area */}
        <div ref={handAreaRef} data-hand-area style={{background:'#120900',border:`1.5px solid ${myTurn?'#3a2010':'#2a1a08'}`,borderRadius:3,padding:isMobile?'8px 9px':'11px 13px'}}>
          <div style={{display:'flex',alignItems:'center',marginBottom:9,gap:8}}>
            <span style={{fontFamily:"'Cinzel',serif",color:phase==='DISCARD_PHASE'||phase==='PLAYER_REVEAL_FOR_HUNT'?'#882020':'#3a2510',fontSize:10,letterSpacing:1}}>
              {phase==='DISCARD_PHASE'?`⚠ 手牌超限 (${me.hand.length}/${effectiveHandLimit})`:phase==='PLAYER_REVEAL_FOR_HUNT'?'⚠ 选择亮出一张区域牌':phase==='HUNT_WAIT_REVEAL'&&!myTurn&&isLocalHuntTargetSeat(gs)?'⚠ 选择亮出一张区域牌':`手牌 (${me.hand.length}/${effectiveHandLimit})`}
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
          <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
            {me.hand.map((c,i)=>{
              const clickable=isMyCardClickable(c,i);
              const isSel=phase==='DISCARD_PHASE'&&(gs.abilityData.discardSelected||[]).includes(i);
              const isMatch=phase==='HUNT_CONFIRM'&&gs.abilityData?.revCard&&(c.letter===gs.abilityData.revCard.letter||c.number===gs.abilityData.revCard.number);
              const isGodUpgrade=c.isGod&&me.godName===c.godKey&&(me.godLevel||0)<3;
              const canUpgradeNow=isGodUpgrade&&phase==='ACTION'&&isVisualPlayerTurn;
              const canWorshipNow=c.isGod&&!isGodUpgrade&&phase==='ACTION'&&isVisualPlayerTurn&&!gs.godTriggeredThisTurn&&!gs.godFromHandUsed;
              return(<div key={c.id} style={{position:'relative',display:'inline-block'}}>
                <DDCard card={c} onClick={clickable?()=>handleMyCardClick(i):undefined} disabled={!clickable} selected={isSel} highlight={isMatch||canWorshipNow||canUpgradeNow} godLevel={me.godName===c.godKey?me.godLevel:0} compact={isMobile} holderId={0}/>
                {canUpgradeNow&&<div style={{position:'absolute',top:-7,left:'50%',transform:'translateX(-50%)',fontFamily:"'Cinzel',serif",fontSize:8,color:'#c8a96e',background:'#0a0705',border:'1px solid #8a6020',borderRadius:2,padding:'1px 4px',pointerEvents:'none',whiteSpace:'nowrap',zIndex:10}}>⬆ 升级邪神之力</div>}
                {canWorshipNow&&<div style={{position:'absolute',top:-7,left:'50%',transform:'translateX(-50%)',fontFamily:"'Cinzel',serif",fontSize:8,color:'#b080e0',background:'#0a0412',border:'1px solid #7040aa',borderRadius:2,padding:'1px 4px',pointerEvents:'none',whiteSpace:'nowrap',zIndex:10}}>⛧ 点击信仰</div>}
              </div>);
            })}
            {me.hand.length===0&&<div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#7a5a2a',fontSize:13,padding:'22px 10px'}}>手中空空如也</div>}
          </div>
        </div>
      </div>
      {/* ── Tutorial steps 2 & 3 (shown over game interface) ── */}
      {/* ── Win Animations ── */}
      {phase==='TREASURE_WIN'&&!showTutorial&&<TreasureMapAnim hand={me.hand} onConfirm={revealWin}/>}
      {phase==='GOD_RESURRECTION'&&!showTutorial&&<CthulhuResurrectionAnim onConfirm={revealWin}/>}
      {!showTutorial&&<HoundsTimerBadge active={!!gs?.houndsOfTindalosActive} secondsLeft={houndsSecLeft}/>}
      {showTutorial&&tutorialStep===2&&(()=>{
        const TW=Math.min(260,vw-20);
        const px=Math.max(8,Math.min(panelRect?panelRect.right+14:175,vw-TW-8));
        const py=panelRect?panelRect.top+(panelRect.height/2):260;
        const arrowTop=panelRect?Math.max(16,Math.min(panelRect.height/2,60)):40;
        return(
          <div style={{position:'fixed',inset:0,zIndex:900,pointerEvents:'none'}}>
            {/* Semi-dark backdrop */}
            <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.58)',pointerEvents:'none'}}/>
            {/* Spotlight cutout glow — handled via panel border above */}
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
        return(
          <div style={{position:'fixed',inset:0,zIndex:900,pointerEvents:'none'}}>
            <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.58)',pointerEvents:'none'}}/>
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
        return(
          <div style={{position:'fixed',inset:0,zIndex:900,pointerEvents:'none'}}>
            <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.58)',pointerEvents:'none'}}/>
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
            <div style={{position:'absolute',left:0,top:0,right:0,height:hty+46,background:BG,pointerEvents:'none'}}/>
            <div style={{position:'absolute',left:0,top:hty+46,bottom:0,width:hleft,background:BG,pointerEvents:'none'}}/>
            <div style={{position:'absolute',right:0,top:hty+46,bottom:0,left:hright,background:BG,pointerEvents:'none'}}/>
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
            <div style={{position:'absolute',left:0,top:0,right:0,height:hty+46,background:BG,pointerEvents:'none'}}/>
            <div style={{position:'absolute',left:0,top:hty+46,bottom:0,width:hleft,background:BG,pointerEvents:'none'}}/>
            <div style={{position:'absolute',right:0,top:hty+46,bottom:0,left:hright,background:BG,pointerEvents:'none'}}/>
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
      )}
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

    {/* Hunt/Bewitch/Guillotine/Knife/SanMist/CardTransfer overlays rendered OUTSIDE the filtered container */}
    {!suppressAnim&&<HuntScopeOverlay active={!!huntAnim} cx={huntAnim?.cx??0} cy={huntAnim?.cy??0}/>}
    {!suppressAnim&&<BewitchEyeOverlay active={!!bewitchAnim} cx={bewitchAnim?.cx??0} cy={bewitchAnim?.cy??0}/>}
    {!suppressAnim&&guillotineTargets.length>0&&<GuillotineAnim targets={guillotineTargets}/>}
    {!suppressAnim&&<KnifeEffect targets={knifeTargets}/>}
    {!suppressAnim&&<SanMistOverlay targets={sanTargets}/>}
    {!suppressAnim&&<CardTransferOverlay transfers={cardTransfers}/>}
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
    0%{transform:rotate(30deg) translateX(-100%)}
    50%{transform:rotate(30deg) translateX(0%)}
    100%{transform:rotate(30deg) translateX(100%)}
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
    0%{transform:translate(0,0) rotate(0deg);opacity:1;filter:brightness(1)}
    22%{transform:translate(-38px,-28px) rotate(-6deg);opacity:0.98;filter:brightness(1.14)}
    58%{transform:translate(-82px,-62px) rotate(-11deg);opacity:0.78;filter:brightness(1.02)}
    100%{transform:translate(-108px,-84px) rotate(-14deg);opacity:0;filter:brightness(0.62)}
  }
  @keyframes slideDown {
    0%{transform:translate(0,0) rotate(0deg);opacity:1;filter:brightness(1)}
    18%{transform:translate(42px,34px) rotate(6deg);opacity:0.99;filter:brightness(1.16)}
    56%{transform:translate(88px,86px) rotate(11deg);opacity:0.8;filter:brightness(1.02)}
    100%{transform:translate(118px,126px) rotate(15deg);opacity:0;filter:brightness(0.6)}
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

