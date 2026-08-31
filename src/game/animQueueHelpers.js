import { isTurnStartLog } from "./animLogs";
import { getVisualEvents, VISUAL_EVENT } from "./visualEvents";
import { statEventsToAnimQueue } from "./statEvents";

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

// 手牌快照在飞牌飞行中段提交的默认时点,与掘墓/CARD_MOVE 既有节奏一致。
export const HAND_TRANSFER_AFTER_AT_MS=360;

function clonePlayersForHandDiscard(players = []) {
  return Array.isArray(players)
    ? players.map(player => (player ? { ...player, hand: [...(player.hand || [])] } : player))
    : null;
}

// Build the visual after-snapshot for a discard without importing any later
// HP/SAN/death settlement from the authoritative final state.  A discard from
// the god zone (or a synthetic card that was never in hand) must not remove a
// different card merely because the target hand is non-empty.
export function deriveHandDiscardSnapshot(players = [], { targetPid = null, cards = [], sourceZone = null } = {}) {
  const next = clonePlayersForHandDiscard(players);
  if (!next || targetPid == null || sourceZone === 'god' || !next[targetPid]) return next;
  const hand = next[targetPid].hand;
  (Array.isArray(cards) ? cards : []).filter(Boolean).forEach(card => {
    const index = hand.findIndex(candidate => (
      (card?.id != null && candidate?.id === card.id) || candidate === card
    ));
    if (index >= 0) hand.splice(index, 1);
  });
  return next;
}

// Discard overlays share the hand-transfer presentation boundary.  Keep the
// helper output identical to a legacy raw DISCARD when no snapshots are
// supplied, while allowing every real discard to commit its hand-only after
// state during the flight.
export function discardStep(options = {}) {
  const {
    playersBefore = null,
    playersAfter = null,
    discardBefore = null,
    discardAfter = null,
    afterAtMs = null,
    ...rest
  } = options || {};
  const step = { type: 'DISCARD' };
  Object.entries(rest).forEach(([key, value]) => {
    if (value !== undefined) step[key] = value;
  });
  const beforePatch = {
    ...(Array.isArray(playersBefore) ? { players: playersBefore } : {}),
    ...(Array.isArray(discardBefore) ? { discard: discardBefore } : {}),
  };
  if (Object.keys(beforePatch).length) {
    if (step.visualSetupTiming === undefined) step.visualSetupTiming = 'stepStart';
    // Event-level before snapshots are the authoritative presentation
    // boundary.  Do not let a pre-existing setup patch (often copied from a
    // later settlement step) overwrite them and leak the terminal state.
    step.visualSetupPatch = { ...(step.visualSetupPatch || {}), ...beforePatch };
  }
  // When a before snapshot is available, always derive the after hand from it
  // instead of trusting an event-level playersAfter that may already contain
  // later HP/SAN/death settlement.
  const resolvedPlayersAfter = Array.isArray(playersBefore)
    ? deriveHandDiscardSnapshot(playersBefore, {
        targetPid: step.targetPid,
        cards: Array.isArray(step.cards) && step.cards.length ? step.cards : (step.card ? [step.card] : []),
        sourceZone: step.sourceZone,
      })
    : (Array.isArray(playersAfter) ? playersAfter : null);
  const afterPatch = {
    ...(Array.isArray(resolvedPlayersAfter) ? { players: resolvedPlayersAfter } : {}),
    ...(Array.isArray(discardAfter) ? { discard: discardAfter } : {}),
  };
  if (Object.keys(afterPatch).length) {
    step.visualTimeline = [
      ...(Array.isArray(step.visualTimeline) ? step.visualTimeline : []),
      { atMs: Number.isFinite(afterAtMs) ? afterAtMs : HAND_TRANSFER_AFTER_AT_MS, patch: afterPatch },
    ];
  }
  return step;
}

// 转移作用域快照:在 before 快照上只应用这一次换牌,不带入事件的后续结算
// (SAN 结算、死亡标记等仍由各自的动画步骤呈现)。god 牌被蛊惑后直接遭遇,
// 不进入目标手牌。
export function deriveHandTransferSnapshot(players=[],{fromPid=null,toPid=null,card=null,toHand=true}={}){
  if(!Array.isArray(players))return null;
  const next=players.map(player=>(player?{...player,hand:[...(player.hand||[])]}:player));
  let moved=null;
  if(fromPid!=null&&next[fromPid]){
    const hand=next[fromPid].hand;
    const idx=card?hand.findIndex(c=>(card.id!=null&&c?.id===card.id)||c===card):-1;
    moved=idx>=0?hand.splice(idx,1)[0]:(hand.length?hand.splice(hand.length-1,1)[0]:null);
  }
  if(toHand&&toPid!=null&&next[toPid]&&moved)next[toPid].hand.push(moved);
  return next;
}

export function cardTransferStep(options={}){
  const{
    playersBefore=null,playersAfter=null,
    discardBefore=null,discardAfter=null,
    afterAtMs=null,
    ...rest
  }=options||{};
  const step={type:"CARD_TRANSFER"};
  Object.entries(rest).forEach(([key,value])=>{
    if(value!==undefined)step[key]=value;
  });
  // The discard pile is public information. Any transfer headed there must
  // render face-up when its card identity is available.
  if(step.dest==="discard"&&step.faceUp===undefined)step.faceUp=true;
  const beforePatch={
    ...(Array.isArray(playersBefore)?{players:playersBefore}:{}),
    ...(Array.isArray(discardBefore)?{discard:discardBefore}:{}),
  };
  if(Object.keys(beforePatch).length){
    if(step.visualSetupTiming===undefined)step.visualSetupTiming="stepStart";
    step.visualSetupPatch={...beforePatch,...(step.visualSetupPatch||{})};
  }
  const afterPatch={
    ...(Array.isArray(playersAfter)?{players:playersAfter}:{}),
    ...(Array.isArray(discardAfter)?{discard:discardAfter}:{}),
  };
  if(Object.keys(afterPatch).length){
    step.visualTimeline=[
      ...(Array.isArray(step.visualTimeline)?step.visualTimeline:[]),
      {atMs:Number.isFinite(afterAtMs)?afterAtMs:HAND_TRANSFER_AFTER_AT_MS,patch:afterPatch},
    ];
  }
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
      ...getVisualEvents(state)
        .filter(event=>event?.type===VISUAL_EVENT.RANDOM_TARGET||event?.type===VISUAL_EVENT.THROW_STONE)
        .map(event=>event?.legacySeq??event?.seq??0),
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

export function fullHandSwapTransferSteps({fromPid,toPid,fromCount=0,toCount=0,msgs=[],playersAfter=null,discardAfter=null}={}){
  if(fromPid==null||fromPid<0||toPid==null||toPid<0)return [];
  return [
    cardTransferStep({fromPid,dest:"player",toPid,count:fromCount}),
    cardTransferStep({fromPid:toPid,dest:"player",toPid:fromPid,count:toCount,msgs,playersAfter,discardAfter}),
  ];
}

export function fullHandSwapSteps({fromPid,toPid,fromCount=0,toCount=0,msgs=[],playersBefore=null,playersAfter=null,discardAfter=null,zhuLight=null}={}){
  const transfers=fullHandSwapTransferSteps({fromPid,toPid,fromCount,toCount,msgs,playersAfter,discardAfter});
  if(!transfers.length)return [];
  return [
    ...(playersBefore?[{type:"VISUAL_LOCK",players:playersBefore,zhuLight:zhuLight||null}]:[]),
    ...transfers,
  ];
}

export function swapCardsTransferSteps({sourceIdx,targetIdx,sourceCount=1,targetCount=1,msgs=[],takenCard=null,givenCard=null,playersAfter=null,discardAfter=null}={}){
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
      playersAfter,
      discardAfter,
    }),
  ];
}

export function swapCardsSteps({sourceIdx,targetIdx,sourceCount=1,targetCount=1,msgs=[],playersBefore=null,playersAfter=null,discardAfter=null,zhuLight=null,takenCard=null,givenCard=null}={}){
  const transfers=swapCardsTransferSteps({sourceIdx,targetIdx,sourceCount,targetCount,msgs,takenCard,givenCard,playersAfter,discardAfter});
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
    acquisitionQueue.push(cardTransferStep({fromPid,dest:"player",toPid,count:1,...(options.transferSnapshots||{})}));
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

export function getFreshInspectionReplayEvents(state,{afterSeq=0,predicate=null}={}){
  const matches=event=>{
    const seq=event?.legacySeq??event?.seq??0;
    return seq>afterSeq&&(!predicate||predicate(event));
  };
  return getVisualEvents(state)
    .filter(event=>event?.type===VISUAL_EVENT.INSPECTION&&matches(event))
    .sort((left,right)=>(
      (left?.legacySeq??left?.seq??0)-(right?.legacySeq??right?.seq??0)
    ));
}

export function buildInspectionEventFlow(baseGs,events,{copyPlayers}){
  const queue=[];
  const boundarySteps=new Map();
  let cursorPlayers=copyPlayers(baseGs?.players||[]);
  let cursorLog=[...(Array.isArray(baseGs?.log)?baseGs.log:[])];
  let cursorDiscard=[...(Array.isArray(baseGs?.discard)?baseGs.discard:[])];
  let cursorStatEventSeq=baseGs?._statEventSeq||0;
  (events||[]).forEach(ev=>{
    const beforePlayers=copyPlayers(ev?.beforePlayers||cursorPlayers);
    const beforeLog=[...(Array.isArray(ev?.beforeLog)?ev.beforeLog:cursorLog)];
    const beforeDiscard=[...(Array.isArray(ev?.beforeDiscard)?ev.beforeDiscard:cursorDiscard)];
    const afterPlayers=copyPlayers(ev?.afterPlayers||beforePlayers);
    const afterLog=[...(Array.isArray(ev?.afterLog)?ev.afterLog:beforeLog)];
    const afterDiscard=[...(Array.isArray(ev?.afterDiscard)?ev.afterDiscard:beforeDiscard)];
    const beforeStatEventSeq=Math.max(cursorStatEventSeq,ev?.beforeStatEventSeq||0);
    queue.push({type:"VISUAL_LOCK",players:beforePlayers});
    const revealMsgs=Array.isArray(ev?.revealMsgs)?ev.revealMsgs.filter(Boolean):[];
    const effectMsgs=Array.isArray(ev?.effectMsgs)?ev.effectMsgs.filter(Boolean):[];
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
      _logChunk:revealMsgs,
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
      const step=discardStep({
        card:discardEvent.card,
        cards:[discardEvent.card],
        count:1,
        triggerName:beforePlayers[targetPid]?.name||"角色",
        targetPid,
        msgs:index===0?effectMsgs:[],
        visualSetupTiming:"stepStart",
        visualSetupPatch:{players:discardCursorPlayers,discard:discardCursor},
        playersBefore:discardCursorPlayers,
        discardBefore:discardCursor,
        playersAfter:nextPlayers,
        discardAfter:nextDiscard,
      });
      discardCursorPlayers=nextPlayers;
      discardCursor=nextDiscard;
      return step;
    });
    const effectQ=statEventsToAnimQueue(
      Array.isArray(ev?.statEvents)?ev.statEvents:[],
      explicitDiscardQ.length?discardCursorPlayers:beforePlayers,
      explicitDiscardQ.length?[]:effectMsgs,
    );
    if(explicitDiscardQ.length)queue.push(...explicitDiscardQ.map(step=>ev?.id?{...step,visualEventId:ev.id}:step));
    if(effectQ.length)queue.push(...effectQ.map(step=>ev?.id?{...step,visualEventId:ev.id}:step));
    const effectHasVisibleStep=explicitDiscardQ.length>0||effectQ.some(step=>step?.type!=="STATE_PATCH");
    const boundaryStep={
      ...statePatchStep({players:afterPlayers,log:afterLog,discard:afterDiscard}),
      ...(ev?.id?{visualEventId:ev.id}:{}),
      // Non-stat inspection effects (for example 昏睡) may have no animation
      // step, but their log still belongs after this reveal, never to an
      // earlier inspection card.
      ...(!effectHasVisibleStep&&effectMsgs.length?{_logChunk:effectMsgs}:{}),
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
