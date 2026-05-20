import {
  copyPlayers,
  clamp,
  isZoneCard,
  isBlankZoneCard,
  isBlackGoatYoung,
  separateBlackGoatYoung,
  isWinHand,
  cardLogText,
  removeCardsFromDiscard,
  makeInspectionMeta,
} from './coreUtils';
import {
  aiChooseRevealCard,
  aiChooseHunterLootCards,
  chooseAiRoseThornTarget,
  chooseAiCultistBewitchPlan,
  decideAiSkillUsage,
  getHunterChaseTargets,
  canCultistWinByBewitch,
  canCultistEmptyHandByBewitch,
  aiShouldNotRest,
  isCultistEndingTurnUnreasonable,
} from './ai';
import { applyFx, applyInspectionForSanLoss, applyHpDamageWithLink } from './effectEngine';
import {
  checkWin,
  aiHandleGodCard,
  abandonGodFollower,
  convertGodFollower,
  startNextTurn,
} from './turnEngine';
import { withClearedTurnAnimFields } from './turnAnimState';
import { ROLE_TREASURE, ROLE_HUNTER, ROLE_CULTIST } from './coreUtils';
import { createBlackGoatYoungCard } from '../constants/card';

/**
 * 检查两张卡是否满足追捕匹配规则。
 * - 被捕者展示非区域牌：追捕者弃任意牌都成功
 * - 追捕者弃非区域牌去匹配区域牌：失败
 * - 空白区域牌默认匹配
 * - 否则字母或数字相同即匹配
 */
export function cardsHuntMatch(a, b) {
  if (!a || !b) return false;
  if (isBlackGoatYoung(a) || isBlackGoatYoung(b)) return false; // BGY 不可被任何卡牌匹配
  if (!isZoneCard(b)) return true;      // 被捕者展示非区域牌 → 追捕者弃任意牌成功
  if (!isZoneCard(a)) return false;     // 追捕者弃非区域牌去匹配区域牌 → 失败
  if (isBlankZoneCard(a) || isBlankZoneCard(b)) return true;
  return a.letter === b.letter || a.number === b.number;
}

/**
 * 将手牌不大于3张的玩家的空白区域牌移入手牌。
 * @returns {{players, log}|null} 如果有变化则返回新状态，否则返回 null
 */
export function moveEligibleBlankZones(players, log = []) {
  let changed = false;
  const P = copyPlayers(players);
  const L = [...log];
  P.forEach(player => {
    if (!player || player.isDead) return;
    const blankZones = (player.zoneCards || []).filter(isBlankZoneCard);
    if (!blankZones.length) return;
    if (player.hand.length <= 3) {
      blankZones.forEach(blank => {
        player.hand.push(blank);
        L.push(`${player.name} 手牌不大于3张，将空白区域牌收入手牌`);
      });
      player.zoneCards = (player.zoneCards || []).filter(c => !isBlankZoneCard(c));
      changed = true;
    }
  });
  return changed ? { players: P, log: L } : null;
}

/**
 * 清空玩家的神牌区域，并将神牌移入弃牌堆。
 */
export function clearPlayerGodZone(targetPlayer, discard) {
  if (targetPlayer?.godZone?.length) discard.push(...targetPlayer.godZone);
  if (targetPlayer) {
    targetPlayer.godZone = [];
    targetPlayer.godName = null;
    targetPlayer.godLevel = 0;
  }
}

/**
 * AI 弃牌至手牌上限。
 */
export function discardAiHandToLimit(P, ct, Disc, L) {
  const aiHandLimit = P[ct]._nyaHandLimit ?? 4;
  while (P[ct].hand.length > aiHandLimit) {
    const c = P[ct].hand.shift();
    if (isBlackGoatYoung(c)) {
      L.push(`${P[ct].name} 的黑山羊幼仔被销毁`);
    } else {
      Disc.push(c);
      L.push(`${P[ct].name} 弃 ${cardLogText(c, { alwaysShowName: true })}（上限）`);
    }
  }
}

export function aiStep(gs, opts = {}) {
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

  // 提取蛊惑赠予的核心逻辑（主行动路径与强制路径共用）
  const applyBewitchGift = (_gs, _P, _D, _Disc, _L, _ct, _ti, _sc) => {
    let inspectionMeta = makeInspectionMeta(_gs);
    _P[_ct].hand = _P[_ct].hand.filter(c => c.id !== _sc.id);
    _L.push(`${_P[_ct].name}（邪祀者）对 ${_P[_ti].name} 【蛊惑】，赠予 ${cardLogText(_sc, { alwaysShowName: true })}`);
    let fxResult = null;
    if (_sc.isGod) {
      _P[_ti].godEncounters = (_P[_ti].godEncounters || 0) + 1;
      if (_P[_ti].role === ROLE_CULTIST) {
        _P[_ti].roleRevealed = true;
      } else {
        const godCost = _P[_ti].godEncounters;
        _P[_ti].san = clamp(_P[_ti].san - godCost);
        const newSan = _P[_ti].san;
        const processed = applyInspectionForSanLoss(_ti, newSan, _gs.currentTurn, _P, _D, _Disc, _L, inspectionMeta);
        _P = processed.P; _D = processed.D; _Disc = processed.Disc;
        inspectionMeta = processed.inspectionMeta;
        _L.splice(0, _L.length, ...processed.log);
      }
      const gr = aiHandleGodCard(_ti, _sc, _P, _D, _Disc, _L, _gs);
      _P = gr.P; _D = gr.D; _Disc = gr.Disc;
      _gs = { ..._gs, ...inspectionMeta, ...(gr.inspectionMeta || {}) };
    } else {
      _P[_ti].hand.push(_sc);
      fxResult = applyFx(_sc, _ti, _sc.type === 'swapAllHands' ? null : _ti, _P, _D, _Disc, _gs);
      _P = fxResult.P; _D = fxResult.D; _Disc = fxResult.Disc;
      _L.push(...fxResult.msgs);
      _gs = { ..._gs, ...fxResult.statePatch };
    }
    return { gs: _gs, P: _P, D: _D, Disc: _Disc, L: _L, fxResult };
  };

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
    const nextGs=startNextTurn({...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:ct,huntAbandoned:gs.huntAbandoned||[],skillUsed:gs.skillUsed}, opts);
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
  // ── AI 黑山羊幼仔繁衍 ─────────────────────────────────────────
  let didMultiply = false;
  if (!gs.multiplyUsed && !gs.skillUsed && !gs.restUsed) {
    const bgyInHand = ai.hand.filter(isBlackGoatYoung);
    if (bgyInHand.length > 0) {
      const targetCandidates = P.map((p, i) => ({ p, i }))
        .filter(({ p, i }) => !p.isDead && i !== ct)
        .sort((a, b) => {
          const aBgy = a.p.hand.filter(isBlackGoatYoung).length;
          const bBgy = b.p.hand.filter(isBlackGoatYoung).length;
          if (aBgy !== bBgy) return aBgy - bBgy;
          return a.p.hp - b.p.hp;
        });
      if (targetCandidates.length > 0) {
        const ti = targetCandidates[0].i;
        if (ai.hand.some(isBlackGoatYoung)) {
          P[ti].hand.push(createBlackGoatYoungCard());
          L.push(`【繁衍】${ai.name} 将黑山羊幼仔传播给了 ${P[ti].name}`);
          didMultiply = true;
        }
      }
    }
  }
  if (didMultiply) {
    gs = { ...gs, multiplyUsed: true };
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
    if(gs.restUsed||gs.skillUsed||gs.multiplyUsed)return false;
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
    const nextGs=startNextTurn({...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:ct,restUsed:true,skillUsed:false}, opts);
    return buildReturnPack(nextGs, _P_afterRest);
  }
// 追猎者/邪祀者积极发动技能(65%); 寻宝者随进度提升(35%→55%)
  let huntContinue = true;
  let newAbandoned = gs.huntAbandoned || [];
  const getHunterTargets = () => getHunterChaseTargets(P,ct,newAbandoned);
  const aiSkillDecision=decideAiSkillUsage(gs,P,ct,aiEffRole,getHunterTargets());
  let useSkill=aiSkillDecision.useSkill;
  if(gs.multiplyUsed) useSkill=false;
  let cultistBewitchPlan = null;
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
    const nextGs=startNextTurn({...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:ct,huntAbandoned:newAbandoned,skillUsed:gs.skillUsed}, opts);
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
      if(P[ct].hand.length === 0) huntContinue = false;
      while (huntContinue && P[ct].hand.length > 0) {
        const validTargets = getHunterTargets();
        if (validTargets.length > 0) {
          const sortedTargets = [...validTargets].sort((a, b) => {
            if (!!a.player.roleRevealed !== !!b.player.roleRevealed) return a.player.roleRevealed ? -1 : 1;
            return a.player.hp - b.player.hp;
          });

          // 遍历所有目标，直到找到可以追捕的目标或用完所有目标
          let foundTarget = false;
          for (const { player: tgt, idx: ti } of sortedTargets) {
            const targetHand = P[ti].hand;
            if (ti === 0) {
              L.push(`${ai.name}（追猎者）向你发动【追捕】！请选择亮出一张手牌`);
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
              const rc = aiChooseRevealCard(targetHand, ai.name, L, knownHunterCards);
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
                      const { kept: kept1, destroyed: destroyed1 } = separateBlackGoatYoung(P[ti].hand);
                      if (kept1.length) Disc.push(...kept1);
                      if (destroyed1.length) L.push(`${P[ti].name} 的 ${destroyed1.length} 张黑山羊幼仔被销毁`);
                      P[ti].hand = [];
                    } else {
                      const cardsToTake=Math.min(maxToTake,P[ti].hand.length);
                      for(let i=0;i<cardsToTake;i++){
                        const randomIndex = Math.floor(Math.random() * P[ti].hand.length);
                        const stolenCard = P[ti].hand.splice(randomIndex, 1)[0];
                        P[ct].hand.push(stolenCard);
                        L.push(`${ai.name} 从 ${tgt.name} 的手牌中暗抽了一张！`);
                      }
                      const { kept: kept2, destroyed: destroyed2 } = separateBlackGoatYoung(P[ti].hand);
                      if (kept2.length) Disc.push(...kept2);
                      if (destroyed2.length) L.push(`${P[ti].name} 的 ${destroyed2.length} 张黑山羊幼仔被销毁`);
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
        const bwRes=applyBewitchGift(gs,P,D,Disc,L,ct,ti,sc);
        gs=bwRes.gs;P=bwRes.P;D=bwRes.D;Disc=bwRes.Disc;L=bwRes.L;
        if(!sc.isGod&&bwRes.fxResult){
          const res=bwRes.fxResult;
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
          // 只有使用自己的掉包技能时才显示"（寻宝者）"，通过"绮丽诗篇"获得的掉包技能不显示
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
        const ti=plan.targetIdx;
        const sc=plan.card;
        const bwRes=applyBewitchGift(gs,P,D,Disc,L,ct,ti,sc);
        gs=bwRes.gs;P=bwRes.P;D=bwRes.D;Disc=bwRes.Disc;L=bwRes.L;
        if(!sc.isGod&&bwRes.fxResult){
          const res=bwRes.fxResult;
          if(res.statePatch?.abilityData?.type==='firstComePick'){
            const win=checkWin(P,gs._isMP);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win};
            return {...gs,players:P,deck:D,discard:Disc,log:L,phase:'FIRST_COME_PICK_SELECT',abilityData:{...res.statePatch.abilityData,_turnOwner:gs.currentTurn},skillUsed:true};
          }
        }
        const win=checkWin(P,gs._isMP);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win};
        const _P_afterAction=copyPlayers(P);
        const nextGs=startNextTurn({...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:ct,huntAbandoned:newAbandoned,skillUsed:true}, opts);
        return buildReturnPack(nextGs,_P_afterAction);
      }
    }
    L.push(`${ai.name} 未使用技能，结束回合`);
  }
  if(P[ct].isDead){
    const win=checkWin(P,gs._isMP);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win};
    const _P_afterAction=copyPlayers(P);
    const nextGs=startNextTurn({...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:ct,huntAbandoned:newAbandoned,skillUsed:gs.skillUsed}, opts);
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
        nextGs = startNextTurn({...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:ct, huntAbandoned: newAbandoned, skillUsed: (useSkill || gs.skillUsed)}, opts);
    }
  }catch(e){
    throw new Error(`${ai.name} 回合收尾失败: ${e?.message||'未知错误'}`);
  }

  return{...nextGs,_animAiDrawnCard:(nextGs.currentTurn===ct&&nextGs.phase==='AI_TURN')?null:(gs._aiDrawnCard??gs._drawnCard??null),_animDiscardedDrawnCard:(nextGs.currentTurn===ct&&nextGs.phase==='AI_TURN')?false:(gs._discardedDrawnCard??false),_aiName:ai.name,_playersBeforeNextDraw:_P_afterAction,_playersBeforeSkillAction:playersBeforeSkillAction,_preSkillLogs:preSkillLogs,_preSkillDiscard:preSkillDiscard,_aiHuntEvents:aiHuntEvents,_aiHandLimitDiscards:discardedCards};
}
