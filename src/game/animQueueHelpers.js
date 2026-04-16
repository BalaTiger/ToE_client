import { isTurnStartLog } from "./animLogs";

export function resolveTurnHighlightForStep(step,nextGs,playersFallback=[]){
  if(!step||step.type!=="YOUR_TURN")return null;
  const stepName=
    step.name ||
    (Array.isArray(step.msgs)
      ? (step.msgs.find(line=>isTurnStartLog(line))||"").replace(/^鈹€鈹€ (.+) 鐨勫洖鍚堝紑濮?鈹€鈹€$/,"$1")
      : "");
  if(!stepName)return null;
  if(stepName==="浣?")return 0;
  const players=(nextGs?.players||playersFallback||[]);
  const idx=players.findIndex(p=>p?.name===stepName);
  return idx>=0?idx:null;
}

export function buildBewitchForcedCardQueue(fromPid,toPid,card,triggerName,statQueue,msgs,turnIntroName=null){
  const ordered=[{type:"SKILL_BEWITCH",msgs,targetIdx:toPid}];
  if(toPid!=null&&toPid>=0){
    ordered.push({type:"CARD_TRANSFER",fromPid,dest:"player",toPid,count:1});
  }
  if(turnIntroName){
    ordered.push({type:"YOUR_TURN",name:turnIntroName,msgs:[]});
  }
  if(card){
    ordered.push({type:"DRAW_CARD",card,triggerName,targetPid:toPid,skipTravel:true});
  }
  ordered.push(...(statQueue||[]).filter(a=>a.type!=="CARD_TRANSFER"));
  return ordered;
}

export function buildInspectionRevealQueue(events){
  return (events||[]).map(ev=>({
    type:"DRAW_CARD",
    card:ev.card,
    triggerName:"妫€瀹氱墝",
    targetPid:ev.target??0,
  }));
}

export function buildInspectionEventFlow(baseGs,events,{buildAnimQueue,copyPlayers}){
  const queue=[];
  let cursorPlayers=copyPlayers(baseGs?.players||[]);
  let cursorLog=[...(Array.isArray(baseGs?.log)?baseGs.log:[])];
  (events||[]).forEach(ev=>{
    const beforePlayers=copyPlayers(ev?.beforePlayers||cursorPlayers);
    const beforeLog=[...(Array.isArray(ev?.beforeLog)?ev.beforeLog:cursorLog)];
    const afterPlayers=copyPlayers(ev?.afterPlayers||beforePlayers);
    const afterLog=[...(Array.isArray(ev?.afterLog)?ev.afterLog:beforeLog)];
    const preQ=buildAnimQueue({players:cursorPlayers,log:cursorLog},{players:beforePlayers,log:beforeLog});
    if(preQ.length)queue.push(...preQ);
    queue.push({
      type:"DRAW_CARD",
      card:ev.card,
      triggerName:"妫€瀹氱墝",
      targetPid:ev.target??0,
    });
    const effectQ=buildAnimQueue({players:beforePlayers,log:beforeLog},{players:afterPlayers,log:afterLog});
    if(effectQ.length)queue.push(...effectQ);
    cursorPlayers=afterPlayers;
    cursorLog=afterLog;
  });
  return {queue,players:cursorPlayers,log:cursorLog};
}
