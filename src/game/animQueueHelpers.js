import { isTurnStartLog } from "./animLogs";

export function statePatchStep(patch={}){
  const step={type:"STATE_PATCH"};
  Object.entries(patch).forEach(([key,value])=>{
    if(value!==undefined)step[key]=value;
  });
  return step;
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
  (Array.isArray(queue)?queue:[]).forEach(step=>{
    if(step?.type!=="GOD_HIGHLIGHT"||step.targetPid!==targetPid){
      prepared.push(step);
      return;
    }
    if(keptHighlight)return;
    keptHighlight=true;
    highlightIdx=prepared.length;
    prepared.push({
      ...step,
      godKey:step.godKey||godKey,
      ...(Array.isArray(players)
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
    const visualSetupPatch=step.visualSetupPatch?.players
      ?{...step.visualSetupPatch,players:mergeBadgeIntoPlayers(step.visualSetupPatch.players)}
      :step.visualSetupPatch;
    const visualTimeline=Array.isArray(step.visualTimeline)
      ?step.visualTimeline.map(point=>point?.patch?.players?{
        ...point,
        patch:{...point.patch,players:mergeBadgeIntoPlayers(point.patch.players)},
      }:point)
      :step.visualTimeline;
    if(visualSetupPatch===step.visualSetupPatch&&visualTimeline===step.visualTimeline)return step;
    return {...step,visualSetupPatch,visualTimeline};
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
      _pendingAnimDeath:!!stats._pendingAnimDeath,
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
  const ordered=[{
    type:"SKILL_BEWITCH",
    msgs,
    targetIdx:toPid,
    ...(options.skillVisualSetupPatch?{visualSetupPatch:options.skillVisualSetupPatch}:{}),
  }];
  if(toPid!=null&&toPid>=0){
    ordered.push(cardTransferStep({fromPid,dest:"player",toPid,count:1}));
    if(options.afterGiftPatch)ordered.push(statePatchStep(options.afterGiftPatch));
  }
  // 注意：被蛊惑者的操作是在当前回合内完成的，不应视为"回合开始"
  // 因此不再添加 YOUR_TURN 动画步骤
  if(card){
    ordered.push({type:"DRAW_CARD",card,triggerName,targetPid:toPid,skipTravel:true,disableDrawBackgroundCamera:true});
  }
  ordered.push(...(statQueue||[]).filter(a=>
    !isPlainInferredTransfer(a) &&
    !isStaleTurnDrawStep(a) &&
    dedupeStatStep(a)
  ));
  return ordered;
}

export function buildInspectionRevealQueue(events){
  return (events||[]).map(ev=>({
    type:"DRAW_CARD",
    card:ev.card,
    triggerName:"检定牌",
    targetPid:ev.target??0,
  }));
}

export function buildInspectionEventFlow(baseGs,events,{buildAnimQueue,copyPlayers}){
  const queue=[];
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
    const preQ=buildAnimQueue(
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
    const effectQ=buildAnimQueue(
      {players:beforePlayers,log:beforeLog,discard:beforeDiscard,_statEventSeq:beforeStatEventSeq},
      {
        players:afterPlayers,
        log:afterLog,
        discard:afterDiscard,
        ...(Array.isArray(ev?.statEvents)&&ev.statEvents.length?{_statEvents:ev.statEvents,_statEventSeq:ev.statEventSeq}:{}),
      }
    );
    if(effectQ.length)queue.push(...effectQ);
    const effectHasVisibleStep=effectQ.some(step=>step?.type!=="STATE_PATCH");
    queue.push({
      ...statePatchStep({players:afterPlayers,log:afterLog,discard:afterDiscard}),
      // Non-stat inspection effects (for example 昏睡) may have no animation
      // step, but their log still belongs after this reveal, never to an
      // earlier inspection card.
      ...(!effectHasVisibleStep&&effectLogs.length?{_logChunk:effectLogs}:{}),
    });
    cursorPlayers=afterPlayers;
    cursorLog=afterLog;
    cursorDiscard=afterDiscard;
    cursorStatEventSeq=Math.max(cursorStatEventSeq,beforeStatEventSeq);
    if(ev?.statEventSeq!=null)cursorStatEventSeq=Math.max(cursorStatEventSeq,ev.statEventSeq);
  });
  return {queue,players:cursorPlayers,log:cursorLog,statEventSeq:cursorStatEventSeq};
}

export function buildInspectionAwareAnimQueue(oldGs,newGs,{buildAnimQueue,copyPlayers}){
  const baseOldGs=oldGs||{};
  // 旧状态已经携带的检定事件一定已经进入过上一段动画。部分分阶段结算
  // （例如 AI 邪神选择）可能让标量水位稍晚同步，不能因此重播旧检定牌。
  const baseInspectionSeq=Math.max(
    baseOldGs._inspectionSeq||0,
    ...(baseOldGs._inspectionEvents||[]).map(ev=>ev?.seq||0),
  );
  const inspectionEvents=(newGs?._inspectionEvents||[]).filter(ev=>ev?.seq>baseInspectionSeq);
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
    _inspectionEvents:baseOldGs._inspectionEvents||[],
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
      _visualEvents:Array.isArray(newGs?._visualEvents)
        ?newGs._visualEvents
        :(Array.isArray(baseOldGs?._visualEvents)?baseOldGs._visualEvents:[]),
    },
    newGs
  );
  return {
    queue:[...preQueue,...inspectionFlow.queue,...tailQueue],
    inspectionEvents,
    inspectionSeq:maxInspectionSeq,
  };
}
