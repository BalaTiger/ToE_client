import { isTurnStartLog } from "./animLogs";

export function statePatchStep(patch={}){
  const step={type:"STATE_PATCH"};
  Object.entries(patch).forEach(([key,value])=>{
    if(value!==undefined)step[key]=value;
  });
  return step;
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
  return step;
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

export function buildBewitchForcedCardQueue(fromPid,toPid,card,triggerName,statQueue,msgs){
  const isStaleTurnDrawStep = step => (
    step?.type === "YOUR_TURN" ||
    (step?.type === "DRAW_CARD" && step.inspectionSeq == null && step.triggerName !== "检定牌")
  );
  const ordered=[{type:"SKILL_BEWITCH",msgs,targetIdx:toPid}];
  if(toPid!=null&&toPid>=0){
    ordered.push(cardTransferStep({fromPid,dest:"player",toPid,count:1}));
  }
  // 注意：被蛊惑者的操作是在当前回合内完成的，不应视为"回合开始"
  // 因此不再添加 YOUR_TURN 动画步骤
  if(card){
    ordered.push({type:"DRAW_CARD",card,triggerName,targetPid:toPid,skipTravel:true});
  }
  ordered.push(...(statQueue||[]).filter(a=>a.type!=="CARD_TRANSFER"&&!isStaleTurnDrawStep(a)));
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
  let cursorStatEventSeq=baseGs?._statEventSeq||0;
  (events||[]).forEach(ev=>{
    const beforePlayers=copyPlayers(ev?.beforePlayers||cursorPlayers);
    const beforeLog=[...(Array.isArray(ev?.beforeLog)?ev.beforeLog:cursorLog)];
    const afterPlayers=copyPlayers(ev?.afterPlayers||beforePlayers);
    const afterLog=[...(Array.isArray(ev?.afterLog)?ev.afterLog:beforeLog)];
    const preQ=buildAnimQueue({players:cursorPlayers,log:cursorLog},{players:beforePlayers,log:beforeLog});
    if(preQ.length)queue.push(...preQ);
    queue.push({type:"VISUAL_LOCK",players:beforePlayers});
    queue.push({
      type:"DRAW_CARD",
      card:ev.card,
      triggerName:"检定牌",
      targetPid:ev.target??0,
      inspectionSeq:ev.seq,
    });
    const effectQ=buildAnimQueue(
      {players:beforePlayers,log:beforeLog,_statEventSeq:(ev?.statEventSeq||0)-1},
      {
        players:afterPlayers,
        log:afterLog,
        ...(Array.isArray(ev?.statEvents)&&ev.statEvents.length?{_statEvents:ev.statEvents,_statEventSeq:ev.statEventSeq}:{}),
      }
    );
    if(effectQ.length)queue.push(...effectQ);
    queue.push(statePatchStep({players:afterPlayers,log:afterLog}));
    cursorPlayers=afterPlayers;
    cursorLog=afterLog;
    if(ev?.statEventSeq!=null)cursorStatEventSeq=Math.max(cursorStatEventSeq,ev.statEventSeq);
  });
  return {queue,players:cursorPlayers,log:cursorLog,statEventSeq:cursorStatEventSeq};
}

export function buildInspectionAwareAnimQueue(oldGs,newGs,{buildAnimQueue,copyPlayers}){
  const baseOldGs=oldGs||{};
  const inspectionEvents=(newGs?._inspectionEvents||[]).filter(ev=>ev?.seq>(baseOldGs._inspectionSeq||0));
  if(!inspectionEvents.length){
    return {
      queue:buildAnimQueue(baseOldGs,newGs),
      inspectionEvents:[],
      inspectionSeq:baseOldGs._inspectionSeq||0,
    };
  }
  const firstEvent=inspectionEvents[0];
  const preInspectionGs={
    ...newGs,
    players:firstEvent?.beforePlayers||newGs.players,
    log:firstEvent?.beforeLog||newGs.log,
    _inspectionEvents:baseOldGs._inspectionEvents||[],
    _inspectionSeq:baseOldGs._inspectionSeq||0,
    _statEvents:baseOldGs._statEvents||[],
    _statEventSeq:baseOldGs._statEventSeq||0,
  };
  const preQueue=buildAnimQueue(baseOldGs,preInspectionGs);
  const inspectionFlow=buildInspectionEventFlow(
    {players:preInspectionGs.players,log:preInspectionGs.log},
    inspectionEvents,
    {buildAnimQueue,copyPlayers}
  );
  const maxInspectionSeq=Math.max(baseOldGs._inspectionSeq||0,...inspectionEvents.map(ev=>ev?.seq||0));
  const tailStatEventSeq=Math.max(inspectionFlow.statEventSeq,newGs?._statEventSeq||0);
  const tailQueue=buildAnimQueue(
    {
      players:inspectionFlow.players,
      log:inspectionFlow.log,
      _statEventSeq:tailStatEventSeq,
      _inspectionSeq:maxInspectionSeq,
    },
    newGs
  );
  return {
    queue:[...preQueue,...inspectionFlow.queue,...tailQueue],
    inspectionEvents,
    inspectionSeq:maxInspectionSeq,
  };
}
