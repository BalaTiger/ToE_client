import { isTurnStartLog } from "./animLogs";
import { getVisualEvents, VISUAL_EVENT } from "./visualEvents";

export function statePatchStep(patch={}){
  const step={type:"STATE_PATCH"};
  Object.entries(patch).forEach(([key,value])=>{
    if(value!==undefined)step[key]=value;
  });
  return step;
}

// Once a hunt response has been committed, the old decision phase must stop
// owning the prompt and hand UI. Keep that transition inside the animation
// transaction so local playback and multiplayer replay cross the same boundary
// after the response card/discard has visibly left its source.
export function insertHuntResolutionStatePatch(queue=[],patch={}){
  const steps=Array.isArray(queue)?[...queue]:[];
  if(!steps.length)return steps;
  const responseStepIndex=steps.findIndex(step=>step?.type==='DISCARD'||step?.type==='CARD_TRANSFER');
  const firstVisualStepIndex=steps.findIndex(step=>step?.type!=='VISUAL_LOCK'&&step?.type!=='STATE_PATCH');
  const anchorIndex=responseStepIndex>=0?responseStepIndex:firstVisualStepIndex;
  const insertAt=anchorIndex>=0?anchorIndex+1:0;
  steps.splice(insertAt,0,statePatchStep(patch));
  return steps;
}

export function buildWorshipReplayBaselinePlayers(playersBefore=[],playersAfter=[],targetPid=0){
  const afterPlayer=playersAfter?.[targetPid];
  if(!Array.isArray(playersBefore)||!afterPlayer)return playersBefore;
  return playersBefore.map((player,idx)=>idx===targetPid?{
    ...player,
    hand:[...(afterPlayer.hand||[])],
    godEncounters:afterPlayer.godEncounters,
    godEncounterCount:afterPlayer.godEncounterCount,
    lastGodEncounterSanLoss:afterPlayer.lastGodEncounterSanLoss,
    lastGodEncounterCreatedSkull:afterPlayer.lastGodEncounterCreatedSkull,
    lastGodEncounterPatchEnabled:afterPlayer.lastGodEncounterPatchEnabled,
  }:player);
}

export function prepareWorshipHighlight(queue=[],options={}){
  const {
    targetPid=0,
    godKey=null,
    players=null,
    msgs=[],
  }=options;
  const prepared=[];
  let keptHighlight=false;
  let highlightIdx=-1;
  const keptVisualEventIds=new Set();
  (Array.isArray(queue)?queue:[]).forEach(step=>{
    if(step?.type!=="GOD_HIGHLIGHT"||step.targetPid!==targetPid){
      prepared.push(step);
      return;
    }
    const visualEventId=step.visualEventId||null;
    if(visualEventId&&keptVisualEventIds.has(visualEventId))return;
    if(!visualEventId&&keptHighlight)return;
    if(visualEventId)keptVisualEventIds.add(visualEventId);
    keptHighlight=true;
    if(highlightIdx<0)highlightIdx=prepared.length;
    prepared.push({
      ...step,
      godKey:step.godKey||godKey,
      ...(Array.isArray(players)&&(!visualEventId||!step.visualSetupPatch?.players)
        ?{visualSetupPatch:{...(step.visualSetupPatch||{}),players}}
        :{}),
    });
  });
  if(!keptHighlight){
    const highlightStep={
      type:"GOD_HIGHLIGHT",
      targetPid,
      godKey,
      msgs,
      ...(Array.isArray(players)?{visualSetupPatch:{players}}:{}),
    };
    const eclipseIdx=prepared.findIndex(step=>step?.type==="APOPHIS_ECLIPSE");
    highlightIdx=eclipseIdx>=0?eclipseIdx:prepared.length;
    prepared.splice(highlightIdx,0,highlightStep);
  }
  if(!Array.isArray(players)||!players[targetPid])return prepared;
  const badgePlayer=players[targetPid];
  const mergeBadgeIntoPlayers=patchPlayers=>{
    if(!Array.isArray(patchPlayers)||!patchPlayers[targetPid])return patchPlayers;
    return patchPlayers.map((player,idx)=>idx===targetPid?{
      ...player,
      godName:badgePlayer.godName,
      godLevel:badgePlayer.godLevel,
      godEncounters:badgePlayer.godEncounters,
      godEncounterCount:badgePlayer.godEncounterCount,
      lastGodEncounterSanLoss:badgePlayer.lastGodEncounterSanLoss,
      lastGodEncounterCreatedSkull:badgePlayer.lastGodEncounterCreatedSkull,
      lastGodEncounterPatchEnabled:badgePlayer.lastGodEncounterPatchEnabled,
      godZone:[...(badgePlayer.godZone||[])],
      hasBelievedGod:badgePlayer.hasBelievedGod,
    }:player);
  };
  // Stat/card steps following the highlight may still carry visual snapshots
  // built from the pre-worship baseline. Keep their own HP/SAN/hand timeline,
  // but do not let those snapshots hide the badge that just appeared.
  return prepared.map((step,idx)=>{
    if(idx<=highlightIdx||!step)return step;
    if(step.type==="GOD_HIGHLIGHT")return step;
    const directPlayers=Array.isArray(step.players)
      ?mergeBadgeIntoPlayers(step.players)
      :step.players;
    const visualSetupPatch=step.visualSetupPatch?.players
      ?{...step.visualSetupPatch,players:mergeBadgeIntoPlayers(step.visualSetupPatch.players)}
      :step.visualSetupPatch;
    const visualTimeline=Array.isArray(step.visualTimeline)
      ?step.visualTimeline.map(point=>point?.patch?.players?{
        ...point,
        patch:{...point.patch,players:mergeBadgeIntoPlayers(point.patch.players)},
      }:point)
      :step.visualTimeline;
    if(directPlayers===step.players&&visualSetupPatch===step.visualSetupPatch&&visualTimeline===step.visualTimeline)return step;
    return {...step,players:directPlayers,visualSetupPatch,visualTimeline};
  });
}

export const CARD_ACQUISITION_STAGE=Object.freeze({
  ACQUISITION:"acquisition",
  GOD_ENCOUNTER:"godEncounter",
  ACCEPTANCE:"acceptance",
  ON_WORSHIP_POWER:"onWorshipPower",
});

function tagCardAcquisitionStage(queue=[],stage){
  return (Array.isArray(queue)?queue:[]).filter(Boolean).map(step=>(
    step?.cardAcquisitionStage?step:{...step,cardAcquisitionStage:stage}
  ));
}

export function composeCardAcquisitionQueue({
  acquisitionQueue=[],
  encounterQueue=[],
  acceptanceQueue=[],
  onWorshipPowerQueue=[],
}={}){
  return [
    ...tagCardAcquisitionStage(acquisitionQueue,CARD_ACQUISITION_STAGE.ACQUISITION),
    ...tagCardAcquisitionStage(encounterQueue,CARD_ACQUISITION_STAGE.GOD_ENCOUNTER),
    ...tagCardAcquisitionStage(acceptanceQueue,CARD_ACQUISITION_STAGE.ACCEPTANCE),
    ...tagCardAcquisitionStage(onWorshipPowerQueue,CARD_ACQUISITION_STAGE.ON_WORSHIP_POWER),
  ];
}

function isImmediateWorshipPowerStep(step){
  return step?.cardAcquisitionStage===CARD_ACQUISITION_STAGE.ON_WORSHIP_POWER||
    step?.type==="GOD_POWER_BLOCKED"||
    step?.type==="APOPHIS_ECLIPSE"||(
      step?.type==="CARD_TRANSFER"&&step.sourceAnchor==="godPower"&&step.effect==="blackGoat"
    );
}

export function composeBewitchGodAcquisitionQueue({
  acquisitionQueue=[],
  settlementQueue=[],
  encounterQueue=null,
  acceptanceQueue=null,
  targetPid=null,
  godKey=null,
  playersAfter=null,
  zhuLightBefore=null,
  zhuLightAfter=null,
}={}){
  if(targetPid==null)return [...acquisitionQueue,...settlementQueue];
  const targetPlayer=playersAfter?.[targetPid];
  const highlights=[];
  const powers=[];
  const settlementWithoutPowers=[];
  (Array.isArray(settlementQueue)?settlementQueue:[]).forEach(step=>{
    if(step?.type==="GOD_HIGHLIGHT"&&step.targetPid===targetPid)highlights.push(step);
    if(isImmediateWorshipPowerStep(step)){powers.push(step);return;}
    settlementWithoutPowers.push(step);
  });
  const zhuLightChanged=godKey==="ZHU"&&zhuLightAfter&&JSON.stringify(zhuLightAfter)!==JSON.stringify(zhuLightBefore);
  if(zhuLightChanged&&!powers.some(step=>Object.prototype.hasOwnProperty.call(step||{},"zhuLight"))){
    powers.push(statePatchStep({players:playersAfter,zhuLight:zhuLightAfter}));
  }
  if(!highlights.length&&!targetPlayer?.godName){
    return composeCardAcquisitionQueue({
      acquisitionQueue,
      acceptanceQueue:settlementQueue,
    });
  }
  const highlightStep=highlights[0]||{
    type:"GOD_HIGHLIGHT",
    targetPid,
    godKey:godKey||targetPlayer.godName,
    msgs:[],
    visualSetupPatch:{players:playersAfter},
    visualTimeline:[{atMs:0,patch:{players:playersAfter}}],
  };
  const hasExplicitStageQueues=Array.isArray(encounterQueue)||Array.isArray(acceptanceQueue);
  const assignedStageSteps=new Set([
    ...(Array.isArray(encounterQueue)?encounterQueue:[]),
    ...(Array.isArray(acceptanceQueue)?acceptanceQueue:[]),
  ]);
  // composeFaithSettlementAnimQueue has already established the semantic
  // order inside acceptance (old-faith exit -> new highlight -> abandoned
  // followers). Preserve that order here; only immediate worship powers move
  // into the final onWorshipPower stage.
  const stripImmediatePowers=steps=>(Array.isArray(steps)?steps:[])
    .filter(step=>!isImmediateWorshipPowerStep(step));
  const stagedEncounter=stripImmediatePowers(encounterQueue);
  const stagedAcceptance=Array.isArray(acceptanceQueue)
    ?stripImmediatePowers(acceptanceQueue)
    :settlementWithoutPowers.filter(step=>!(step?.type==="GOD_HIGHLIGHT"&&step.targetPid===targetPid));
  const unassignedSettlement=hasExplicitStageQueues
    ?settlementWithoutPowers.filter(step=>!assignedStageSteps.has(step))
    :[];
  const acceptanceSteps=[...stagedAcceptance,...unassignedSettlement];
  if(!acceptanceSteps.some(step=>step?.type==="GOD_HIGHLIGHT"&&step.targetPid===targetPid)){
    acceptanceSteps.push(highlightStep);
  }
  const composed=composeCardAcquisitionQueue({
    acquisitionQueue,
    encounterQueue:stagedEncounter,
    acceptanceQueue:acceptanceSteps,
    onWorshipPowerQueue:powers,
  });
  return prepareWorshipHighlight(composed,{
    targetPid,
    godKey:godKey||targetPlayer?.godName,
    players:playersAfter,
    msgs:[],
  });
}

export function mergePlayerStatsIntoSnapshot(snapshotPlayers=[],statPlayers=[]){
  return (snapshotPlayers||[]).map((player,idx)=>{
    const stats=statPlayers?.[idx];
    if(!player||!stats)return player;
    return {
      ...player,
      hp:stats.hp,
      san:stats.san,
      isDead:!!stats.isDead,
    };
  });
}

export function zhuHideCardStep(card){
  return {
    type:"ZHU_HIDE_CARD",
    card,
    ...(card?.id!=null?{visualSetupPatch:{hiddenZhuCardId:card.id}}:{}),
  };
}

export function buryToDeckStep({fromPid=0,msgs=[],players=null}={}){
  return {
    type:"BURY_TO_DECK",
    fromPid,
    msgs,
    ...(players?{visualSetupPatch:{players}}:{}),
  };
}

export function cardTransferStep(options={}){
  const step={type:"CARD_TRANSFER"};
  Object.entries(options).forEach(([key,value])=>{
    if(value!==undefined)step[key]=value;
  });
  // The discard pile is public information. Any transfer headed there must
  // render face-up when its card identity is available.
  if(step.dest==="discard"&&step.faceUp===undefined)step.faceUp=true;
  return step;
}

// 掘墓：弃牌堆 → 角色手牌区的飞牌步骤。牌面公开（弃牌堆是公开信息），
// 起飞约 400ms 后弃牌堆与手牌快照切换，与飞行中段对齐。
export function buildGraveDigTransferStep(event){
  const card=event?.card;
  if(!card||event?.playerIdx==null)return null;
  const beforePlayers=Array.isArray(event.beforePlayers)?event.beforePlayers:null;
  const afterPlayers=Array.isArray(event.afterPlayers)?event.afterPlayers:beforePlayers;
  const beforeDiscard=Array.isArray(event.beforeDiscard)?event.beforeDiscard:null;
  const afterDiscard=Array.isArray(event.afterDiscard)?event.afterDiscard:beforeDiscard;
  const makePatch=(players,discard)=>({
    ...(players?{players}:{}),
    ...(discard?{discard}:{}),
  });
  const setupPatch=(beforePlayers||beforeDiscard)?makePatch(beforePlayers,beforeDiscard):null;
  return cardTransferStep({
    toPid:event.playerIdx,
    dest:"player",
    count:1,
    cards:[card],
    sourceAnchor:"discard",
    effect:"graveDig",
    faceUp:true,
    durationMs:1200,
    msgs:Array.isArray(event.msgs)?event.msgs:[],
    ...(event.id?{visualEventId:event.id}:{}),
    ...(setupPatch?{visualSetupPatch:setupPatch}:{}),
    ...(setupPatch?{visualTimeline:[
      {atMs:0,patch:setupPatch},
      {atMs:400,patch:makePatch(afterPlayers,afterDiscard)},
    ]}:{}),
  });
}

export function consumeRetainedRandomTargetEvents(state={}){
  return {
    ...state,
    _randomTargetSeq:Math.max(
      state?._randomTargetSeq||0,
      ...(Array.isArray(state?._randomTargetEvents)?state._randomTargetEvents:[])
        .map(event=>event?.seq||0),
    ),
  };
}

export function filterSphinxResultQueue(queue=[]){
  if(!Array.isArray(queue))return [];
  return queue.filter(step=>step?.type!=="DRAW_CARD"&&step?.type!=="CARD_TRANSFER");
}

export function buildSphinxResultQueue({
  card,
  actorIdx,
  guessCorrect,
  msgs = [],
  resultQueue = [],
  playersAfterResult = null,
} = {}) {
  if (!card) return filterSphinxResultQueue(resultQueue);
  const safeMsgs = Array.isArray(msgs) ? msgs : [];
  const guessMsg = safeMsgs.find(msg => typeof msg === 'string' && msg.includes('猜测牌堆顶的牌'));
  const resultMsg = safeMsgs.find(msg => typeof msg === 'string' && (msg.includes('猜测正确') || msg.includes('猜测错误')));
  return [
    {
      type: 'DRAW_CARD',
      card,
      triggerName: '斯芬克斯',
      targetPid: actorIdx,
      skipTravel: true,
      guessCorrect: !!guessCorrect,
      msgs: guessMsg ? [guessMsg] : safeMsgs.slice(0, 1),
    },
    cardTransferStep({
      fromPid: -1,
      dest: guessCorrect ? 'player' : 'discard',
      ...(guessCorrect ? { toPid: actorIdx } : {}),
      count: 1,
      sourceAnchor: 'reveal',
      effect: 'sphinxResult',
      cards: [card],
      msgs: resultMsg ? [resultMsg] : [],
    }),
    ...(guessCorrect && Array.isArray(playersAfterResult)
      ? [statePatchStep({ players: playersAfterResult })]
      : []),
    ...filterSphinxResultQueue(resultQueue),
  ];
}

function isInferredDiscardTransfer(step){
  return step?.type==="CARD_TRANSFER"&&step.dest==="discard"&&!!step.inferredHandLoss;
}

export function dedupeInferredDiscardTransfers(queue=[]){
  if(!Array.isArray(queue)||!queue.some(isInferredDiscardTransfer))return Array.isArray(queue)?queue:[];
  const explicitDiscardPids=new Set();
  const explicitPopPids=new Set();
  let hasUnscopedExplicitDiscard=false;
  const inferredCount=queue.filter(isInferredDiscardTransfer).length;
  queue.forEach(step=>{
    if(step?.type==="DISCARD"){
      if(Number.isInteger(step.targetPid))explicitDiscardPids.add(step.targetPid);
      else hasUnscopedExplicitDiscard=true;
    }
    if(step?.type==="TSG_SLIME_POP"&&Number.isInteger(step.targetPid)){
      explicitPopPids.add(step.targetPid);
    }
  });
  return queue.filter(step=>{
    if(!isInferredDiscardTransfer(step))return true;
    const fromPid=step.fromPid;
    if(Number.isInteger(fromPid)&&(explicitDiscardPids.has(fromPid)||explicitPopPids.has(fromPid)))return false;
    if(hasUnscopedExplicitDiscard&&inferredCount===1)return false;
    return true;
  });
}

export function dedupeFaithSettlementTransfers(queue=[]){
  if(!Array.isArray(queue))return [];
  const keyFor=step=>{
    if(step?.type!=="CARD_TRANSFER"||!["godConvertDiscard","godAbandon"].includes(step?.effect))return null;
    const cardKeys=(step.cards||[]).map(card=>card?.id??card?.key??card?.godKey??card?.name).join("|");
    return `${step.effect}:${step.fromPid}:${cardKeys}`;
  };
  const lastIndexByKey=new Map();
  queue.forEach((step,index)=>{
    const key=keyFor(step);
    if(key)lastIndexByKey.set(key,index);
  });
  return queue.filter((step,index)=>{
    const key=keyFor(step);
    return !key||lastIndexByKey.get(key)===index;
  });
}

function resolvePlayerPidByLogName(name,players=[]){
  if(!name)return -1;
  if(name==="你")return 0;
  return players.findIndex(p=>p?.name===name);
}

export function fullHandSwapTransferSteps({fromPid,toPid,fromCount=0,toCount=0,msgs=[]}={}){
  if(fromPid==null||fromPid<0||toPid==null||toPid<0)return [];
  return [
    cardTransferStep({fromPid,dest:"player",toPid,count:fromCount}),
    cardTransferStep({fromPid:toPid,dest:"player",toPid:fromPid,count:toCount,msgs}),
  ];
}

export function fullHandSwapSteps({fromPid,toPid,fromCount=0,toCount=0,msgs=[],playersBefore=null,zhuLight=null}={}){
  const transfers=fullHandSwapTransferSteps({fromPid,toPid,fromCount,toCount,msgs});
  if(!transfers.length)return [];
  return [
    ...(playersBefore?[{type:"VISUAL_LOCK",players:playersBefore,zhuLight:zhuLight||null}]:[]),
    ...transfers,
  ];
}

export function swapCardsTransferSteps({sourceIdx,targetIdx,sourceCount=1,targetCount=1,msgs=[],takenCard=null,givenCard=null}={}){
  if(sourceIdx==null||sourceIdx<0||targetIdx==null||targetIdx<0)return [];
  return [
    cardTransferStep({
      fromPid:targetIdx,
      dest:"player",
      toPid:sourceIdx,
      count:targetCount,
      ...(takenCard?{cards:[takenCard]}:{}),
    }),
    cardTransferStep({
      fromPid:sourceIdx,
      dest:"player",
      toPid:targetIdx,
      count:sourceCount,
      ...(givenCard?{cards:[givenCard]}:{}),
      msgs,
    }),
  ];
}

export function swapCardsSteps({sourceIdx,targetIdx,sourceCount=1,targetCount=1,msgs=[],playersBefore=null,zhuLight=null,takenCard=null,givenCard=null}={}){
  const transfers=swapCardsTransferSteps({sourceIdx,targetIdx,sourceCount,targetCount,msgs,takenCard,givenCard});
  if(!transfers.length)return [];
  return [
    ...(playersBefore?[{type:"VISUAL_LOCK",players:playersBefore,zhuLight:zhuLight||null}]:[]),
    ...transfers,
  ];
}

export function buildFullHandSwapStepsFromLogs(logs,players,options={}){
  const fullHandSwapMsg=(Array.isArray(logs)?logs:[]).find(
    line=>typeof line==="string"&&line.includes("交换了全部手牌")
  );
  if(!fullHandSwapMsg||!Array.isArray(players))return [];
  const swapMatch=fullHandSwapMsg.match(/^(.+?) 与 (.+?) 交换了全部手牌/);
  const fromPid=resolvePlayerPidByLogName(swapMatch?.[1],players);
  const toPid=resolvePlayerPidByLogName(swapMatch?.[2],players);
  if(fromPid<0||toPid<0||!players[fromPid]||!players[toPid])return [];
  return fullHandSwapSteps({
    fromPid,
    toPid,
    fromCount:players[fromPid].hand?.length||0,
    toCount:players[toPid].hand?.length||0,
    msgs:[fullHandSwapMsg],
    playersBefore:options.playersBefore||null,
    zhuLight:options.zhuLight||null,
  });
}

export function resolveTurnHighlightForStep(step,nextGs,playersFallback=[]){
  if(!step||step.type!=="YOUR_TURN")return null;
  const stepName=
    step.name ||
    (Array.isArray(step.msgs)
      ? (step.msgs.find(line=>isTurnStartLog(line))||"").replace(/^── (.+) 的回合开始 ──$/,"$1")
      : "");
  if(!stepName)return null;
  if(stepName==="你")return 0;
  const players=(nextGs?.players||playersFallback||[]);
  const idx=players.findIndex(p=>p?.name===stepName);
  return idx>=0?idx:null;
}

export function buildBewitchForcedCardQueue(fromPid,toPid,card,triggerName,statQueue,msgs,options={}){
  const isStaleTurnDrawStep = step => (
    step?.type === "YOUR_TURN" ||
    (step?.type === "DRAW_CARD" && step.inspectionSeq == null && step.triggerName !== "检定牌")
  );
  const isPlainInferredTransfer = step => (
    step?.type === "CARD_TRANSFER" &&
    !step.effect &&
    !step.sourceAnchor &&
    !step.inferredHandLoss &&
    !step.durationMs &&
    !step.visualSetupPatch &&
    !(Array.isArray(step.msgs) && step.msgs.length) &&
    !(Array.isArray(step.cards) && step.cards.length)
  );
  const seenStatEvents=new Set();
  const dedupeStatStep=step=>{
    if(!Array.isArray(step?.statEvents)||!step.statEvents.length)return true;
    const eventKeys=step.statEvents.map(event=>JSON.stringify([
      step.type,
      event?.seq,
      event?.phaseOrder,
      event?.type,
      event?.target,
      event?.from?.hp,
      event?.from?.san,
      event?.to?.hp,
      event?.to?.san,
      event?.logHint,
    ]));
    if(eventKeys.every(key=>seenStatEvents.has(key)))return false;
    eventKeys.forEach(key=>seenStatEvents.add(key));
    return true;
  };
  const acquisitionQueue=[{
    type:"SKILL_BEWITCH",
    msgs,
    targetIdx:toPid,
    ...(options.skillVisualSetupPatch?{visualSetupPatch:options.skillVisualSetupPatch}:{}),
  }];
  if(toPid!=null&&toPid>=0){
    acquisitionQueue.push(cardTransferStep({fromPid,dest:"player",toPid,count:1}));
    if(options.afterGiftPatch)acquisitionQueue.push(statePatchStep(options.afterGiftPatch));
  }
  // 注意：被蛊惑者的操作是在当前回合内完成的，不应视为"回合开始"
  // 因此不再添加 YOUR_TURN 动画步骤
  if(card){
    acquisitionQueue.push({type:"DRAW_CARD",card,triggerName,targetPid:toPid,skipTravel:true,disableDrawBackgroundCamera:true});
  }
  const settlementQueue=(statQueue||[]).filter(a=>
    !isPlainInferredTransfer(a) &&
    !isStaleTurnDrawStep(a) &&
    dedupeStatStep(a)
  );
  if(card?.isGod&&toPid!=null&&toPid>=0){
    return composeBewitchGodAcquisitionQueue({
      acquisitionQueue,
      settlementQueue,
      encounterQueue:options.encounterQueue,
      acceptanceQueue:options.acceptanceQueue,
      targetPid:toPid,
      godKey:card.godKey,
      playersAfter:options.playersAfter,
      zhuLightBefore:options.zhuLightBefore,
      zhuLightAfter:options.zhuLightAfter,
    });
  }
  return composeCardAcquisitionQueue({acquisitionQueue,acceptanceQueue:settlementQueue});
}

export function buildInspectionRevealQueue(events){
  return (events||[]).map(ev=>({
    type:"DRAW_CARD",
    card:ev.card,
    triggerName:"检定牌",
    targetPid:ev.target??0,
  }));
}

// Prefer canonical inspection visual events for every sequence they cover and
// retain legacy snapshots only for old saves/peers that did not emit one. This
// keeps specialized orchestrators from rebuilding the same inspection through
// `_inspectionEvents` while still supporting mixed migration-era states.
export function getFreshInspectionReplayEvents(state,{afterSeq=0,predicate=null}={}){
  const matches=event=>{
    const seq=event?.legacySeq??event?.seq??0;
    return seq>afterSeq&&(!predicate||predicate(event));
  };
  const explicit=getVisualEvents(state)
    .filter(event=>event?.type===VISUAL_EVENT.INSPECTION&&matches(event));
  const explicitSeqs=new Set(explicit.map(event=>event?.legacySeq??event?.seq).filter(seq=>seq!=null));
  const legacy=(state?._inspectionEvents||[])
    .filter(matches)
    .filter(event=>!explicitSeqs.has(event?.seq));
  return [...explicit,...legacy].sort((left,right)=>(
    (left?.legacySeq??left?.seq??0)-(right?.legacySeq??right?.seq??0)
  ));
}

export function buildInspectionEventFlow(baseGs,events,{buildAnimQueue,copyPlayers,eventOwnedOnly=false}){
  const queue=[];
  const boundarySteps=new Map();
  let cursorPlayers=copyPlayers(baseGs?.players||[]);
  let cursorLog=[...(Array.isArray(baseGs?.log)?baseGs.log:[])];
  let cursorDiscard=[...(Array.isArray(baseGs?.discard)?baseGs.discard:[])];
  let cursorStatEventSeq=baseGs?._statEventSeq||0;
  const availableStatEvents=Array.isArray(baseGs?._statEvents)?baseGs._statEvents:[];
  (events||[]).forEach(ev=>{
    const beforePlayers=copyPlayers(ev?.beforePlayers||cursorPlayers);
    const beforeLog=[...(Array.isArray(ev?.beforeLog)?ev.beforeLog:cursorLog)];
    const beforeDiscard=[...(Array.isArray(ev?.beforeDiscard)?ev.beforeDiscard:cursorDiscard)];
    const afterPlayers=copyPlayers(ev?.afterPlayers||beforePlayers);
    const afterLog=[...(Array.isArray(ev?.afterLog)?ev.afterLog:beforeLog)];
    const afterDiscard=[...(Array.isArray(ev?.afterDiscard)?ev.afterDiscard:beforeDiscard)];
    const beforeStatEventSeq=Math.max(cursorStatEventSeq,ev?.beforeStatEventSeq||0);
    const preQ=eventOwnedOnly?[]:buildAnimQueue(
      {players:cursorPlayers,log:cursorLog,discard:cursorDiscard,_statEvents:availableStatEvents,_statEventSeq:cursorStatEventSeq},
      {players:beforePlayers,log:beforeLog,discard:beforeDiscard,_statEvents:availableStatEvents,_statEventSeq:beforeStatEventSeq}
    );
    // Lock the state visible at the start of the inspection segment before any
    // preceding stat animations run. The committed game state may already be
    // the post-inspection snapshot (for example after 迫害妄想 discarded a
    // card), so waiting until the reveal boundary would expose that hand early.
    if(preQ.length)queue.push({type:"VISUAL_LOCK",players:cursorPlayers});
    if(preQ.length)queue.push(...preQ);
    queue.push({type:"VISUAL_LOCK",players:beforePlayers});
    const inspectionLogDelta=afterLog.slice(beforeLog.length);
    const revealLog=inspectionLogDelta.find(line=>typeof line==="string"&&line.includes("的SAN检定结果为"));
    const effectLogs=revealLog
      ?inspectionLogDelta.filter((line,index)=>line!==revealLog||index!==inspectionLogDelta.indexOf(revealLog))
      :inspectionLogDelta;
    queue.push({
      type:"DRAW_CARD",
      ...(ev?.id?{visualEventId:ev.id}:{}),
      card:ev.card,
      triggerName:"检定牌",
      targetPid:ev.target??0,
      inspectionSeq:ev.seq,
      // A reveal step must own exactly its result line. Otherwise the generic
      // draw-log fallback can consume later inspections before their cards are
      // actually revealed.
      _logChunk:revealLog?[revealLog]:[],
    });
    if(ev?.gainedCard){
      queue.push({
        type:"DRAW_CARD",
        card:ev.gainedCard,
        triggerName:beforePlayers[ev.target??0]?.name||"揭开真相",
        targetPid:ev.target??0,
        inspectionGainSeq:ev.seq,
        // 暗抽收入手牌：保留飞牌落入手牌，但去掉背景运镜与中央翻牌。
        travelOnly:true,
        disableDrawBackgroundCamera:true,
        durationMs:700,
        msgs:ev.gainedCardLog?[ev.gainedCardLog]:[],
      });
    }
    const explicitDiscardEvents=Array.isArray(ev?.discardEvents)?ev.discardEvents.filter(event=>event?.card):[];
    let discardCursorPlayers=beforePlayers;
    let discardCursor=beforeDiscard;
    const explicitDiscardQ=explicitDiscardEvents.map((discardEvent,index)=>{
      const targetPid=discardEvent.playerIndex??ev.target??0;
      const nextPlayers=copyPlayers(discardEvent.afterPlayers||afterPlayers);
      const nextDiscard=[...(Array.isArray(discardEvent.afterDiscard)?discardEvent.afterDiscard:afterDiscard)];
      const step={
        type:"DISCARD",
        card:discardEvent.card,
        cards:[discardEvent.card],
        count:1,
        triggerName:beforePlayers[targetPid]?.name||"角色",
        targetPid,
        msgs:index===0?effectLogs:[],
        visualSetupTiming:"stepStart",
        visualSetupPatch:{players:discardCursorPlayers,discard:discardCursor},
        visualTimeline:[
          {atMs:0,patch:{players:discardCursorPlayers,discard:discardCursor}},
          {atMs:900,patch:{players:nextPlayers,discard:nextDiscard}},
        ],
      };
      discardCursorPlayers=nextPlayers;
      discardCursor=nextDiscard;
      return step;
    });
    const explicitDiscardTargets=new Set(explicitDiscardEvents.map(event=>event.playerIndex??ev.target??0));
    const effectQ=buildAnimQueue(
      {players:beforePlayers,log:beforeLog,discard:beforeDiscard,_statEventSeq:beforeStatEventSeq},
      {
        players:afterPlayers,
        log:afterLog,
        discard:afterDiscard,
        ...(Array.isArray(ev?.statEvents)&&ev.statEvents.length?{_statEvents:ev.statEvents,_statEventSeq:ev.statEventSeq}:{}),
      }
    ).filter(step=>!(
      explicitDiscardTargets.has(step?.fromPid)
      && step?.type==="CARD_TRANSFER"
      && step?.dest==="discard"
      && step?.inferredHandLoss
    )&&!(
      explicitDiscardTargets.has(step?.targetPid)
      && step?.type==="TSG_SLIME_POP"
    ));
    if(explicitDiscardQ.length)queue.push(...explicitDiscardQ.map(step=>ev?.id?{...step,visualEventId:ev.id}:step));
    if(effectQ.length)queue.push(...effectQ.map(step=>ev?.id?{...step,visualEventId:ev.id}:step));
    const effectHasVisibleStep=explicitDiscardQ.length>0||effectQ.some(step=>step?.type!=="STATE_PATCH");
    const boundaryStep={
      ...statePatchStep({players:afterPlayers,log:afterLog,discard:afterDiscard}),
      ...(ev?.id?{visualEventId:ev.id}:{}),
      // Non-stat inspection effects (for example 昏睡) may have no animation
      // step, but their log still belongs after this reveal, never to an
      // earlier inspection card.
      ...(!effectHasVisibleStep&&effectLogs.length?{_logChunk:effectLogs}:{}),
    };
    queue.push(boundaryStep);
    if(ev?.seq!=null)boundarySteps.set(ev.seq,boundaryStep);
    cursorPlayers=afterPlayers;
    cursorLog=afterLog;
    cursorDiscard=afterDiscard;
    cursorStatEventSeq=Math.max(cursorStatEventSeq,beforeStatEventSeq);
    if(ev?.statEventSeq!=null)cursorStatEventSeq=Math.max(cursorStatEventSeq,ev.statEventSeq);
  });
  return {queue,players:cursorPlayers,log:cursorLog,statEventSeq:cursorStatEventSeq,boundarySteps};
}

export function buildInspectionAwareAnimQueue(oldGs,newGs,{buildAnimQueue,copyPlayers}){
  const baseOldGs=oldGs||{};
  // 旧状态已经携带的检定事件一定已经进入过上一段动画。部分分阶段结算
  // （例如 AI 邪神选择）可能让标量水位稍晚同步，不能因此重播旧检定牌。
  const baseInspectionSeq=Math.max(
    baseOldGs._inspectionSeq||0,
    ...(baseOldGs._inspectionEvents||[]).map(ev=>ev?.seq||0),
  );
  const oldVisualEventIds=new Set(getVisualEvents(baseOldGs).map(event=>event.id));
  const visualInspectionEvents=getVisualEvents(newGs)
    .filter(event=>event?.type===VISUAL_EVENT.INSPECTION&&event?.id&&!oldVisualEventIds.has(event.id));
  const inspectionEvents=visualInspectionEvents.length
    ?visualInspectionEvents
    :(newGs?._inspectionEvents||[]).filter(ev=>ev?.seq>baseInspectionSeq);
  if(!inspectionEvents.length){
    return {
      queue:buildAnimQueue(baseOldGs,newGs),
      inspectionEvents:[],
      inspectionSeq:baseInspectionSeq,
    };
  }
  const firstEvent=inspectionEvents[0];
  const preInspectionGs={
    ...newGs,
    players:firstEvent?.beforePlayers||newGs.players,
    log:firstEvent?.beforeLog||newGs.log,
    _inspectionEvents:baseOldGs._inspectionEvents||[], // legacy-visual-allow: compatibility presentation baseline
    _inspectionSeq:baseInspectionSeq,
    _statEvents:baseOldGs._statEvents||[],
    _statEventSeq:baseOldGs._statEventSeq||0,
  };
  const preQueue=buildAnimQueue(baseOldGs,preInspectionGs);
  const inspectionFlow=buildInspectionEventFlow(
    {players:preInspectionGs.players,log:preInspectionGs.log},
    inspectionEvents,
    {buildAnimQueue,copyPlayers}
  );
  const maxInspectionSeq=Math.max(baseInspectionSeq,...inspectionEvents.map(ev=>ev?.seq||0));
  const tailStatEventSeq=Math.max(inspectionFlow.statEventSeq,newGs?._statEventSeq||0);
  const tailBaselineVisualEvents=Array.isArray(newGs?._visualEvents)
    ?newGs._visualEvents.filter(event=>(
      event?.type!==VISUAL_EVENT.GOD_STATUS_CHANGED ||
      event?.presentAfterInspectionSeq==null ||
      event.presentAfterInspectionSeq>maxInspectionSeq
    ))
    :(Array.isArray(baseOldGs?._visualEvents)?baseOldGs._visualEvents:[]);
  const tailQueue=buildAnimQueue(
    {
      players:inspectionFlow.players,
      log:inspectionFlow.log,
      _statEventSeq:tailStatEventSeq,
      _inspectionSeq:maxInspectionSeq,
      // The tail starts after every inspection in this batch. Visual events
      // already present on the resolved state (for example 夜风呼啸 before a
      // slime-balance pause) belong to the pre-inspection segment and must be
      // part of this baseline, otherwise buildAnimQueue treats them as fresh
      // and replays the card effect between two inspection reveals.
      _visualEvents:tailBaselineVisualEvents,
    },
    newGs
  );
  let queue=dedupeFaithSettlementTransfers([...preQueue,...inspectionFlow.queue,...tailQueue]);
  getVisualEvents(newGs)
    .filter(event=>event?.type===VISUAL_EVENT.GOD_STATUS_CHANGED&&event?.presentAfterInspectionSeq!=null)
    .forEach(event=>{
      const highlightIndex=queue.findIndex(step=>step?.type==='GOD_HIGHLIGHT'&&step?.visualEventId===event.id);
      const boundaryStep=inspectionFlow.boundarySteps.get(event.presentAfterInspectionSeq);
      const boundaryIndex=queue.indexOf(boundaryStep);
      if(highlightIndex<0||boundaryIndex<0||highlightIndex===boundaryIndex+1)return;
      const [highlight]=queue.splice(highlightIndex,1);
      const adjustedBoundaryIndex=highlightIndex<boundaryIndex?boundaryIndex-1:boundaryIndex;
      queue.splice(adjustedBoundaryIndex+1,0,highlight);
    });
  return {
    queue,
    inspectionEvents,
    inspectionSeq:maxInspectionSeq,
  };
}
