import { createVisualLogEntries } from './visualEventLogs';
import { normalizeLogLineForViewer } from './logPerspective';

export function isTurnStartLog(line){
  return new RegExp("^── .+ 的回合开始 ──$").test(line||"");
}

export function isStatLog(line){
  return new RegExp("造成 \\d+HP 伤害|失去 ?\\d+ ?HP|失去 ?\\d+ ?SAN|失去 ?\\d+ ?HP 和 ?\\d+ ?SAN|(?:HP|SAN)-\\d+|恢复 \\d+ HP|恢复 \\d+ SAN|各种理智和各种回复额外失去|被玫瑰倒刺刺伤|恢复 1SAN").test(line||"");
}

export function isSkillHuntLog(line){
  return new RegExp("【掉包】发动|【掉包】（放弃）追单|向你发动|放弃追单|停止了追捕尝试了所有目标，仍无法追捕?").test(line||"");
}

export function isSkillSwapLog(line){
  return new RegExp("【掉包】").test(line||"");
}

export function isSkillBewitchLog(line){
  return new RegExp("【蛊惑】").test(line||"");
}

export function isDiscardOnlyLog(line){
  return new RegExp("评估后选择弃置|（上限）|随机放弃抽了 \\d+ 张牌").test(line||"") && !new RegExp("造成 \\d+HP 伤害|失去 \\d+ HP|失去 \\d+ SAN|失去 \\d+ HP 和 \\d+ SAN").test(line||"");
}

export function isTransferLog(line){
  return new RegExp("交换了全部手牌为祭品献祭了|祭献了一张手牌溜走|选择|收入了 \\d+ 张牌编号为|收入了手牌|收入了").test(line||"");
}

export function isDrawLikeLog(line){
  return new RegExp("摸到 \\[|收入了 \\[|偶遇灵魂|将神牌收入手牌|展示了一张牌顶|即将承受.*负面效果|抽出 \\d+ 点准备看|准备使用两人一绳进行随机居战?").test(line||"");
}

export function splitAnimBoundLogs(lines){
  const normalized=(Array.isArray(lines)?lines:[]).filter(line=>typeof line==="string"&&line.length);
  const preStat=[];
  const stat=[];
  normalized.forEach(line=>{
    if(isStatLog(line)) stat.push(line);
    else preStat.push(line);
  });
  return {preStat,stat};
}

export function bindAnimLogChunks(queue,{turnStartLogs=[],drawLogs=[],preStatLogs=[],statLogs=[]}={}){
  if(!Array.isArray(queue)||!queue.length)return queue||[];
  // Canonical events already own their messages. Legacy bucket attachment
  // must never add a second copy or move a later event's log to the first step.
  if(queue.some(step=>step?.visualEventId))return queue;
  const bound=queue.map(step=>({...step}));
  const mergeMsgs=(step,lines)=>{
    const normalized=(Array.isArray(lines)?lines:[]).filter(line=>typeof line==="string"&&line.length);
    if(!normalized.length)return;
    step.msgs=[...(Array.isArray(step.msgs)?step.msgs:[]),...normalized];
  };
  const turnIdx=bound.findIndex(step=>step.type==="YOUR_TURN");
  if(turnIdx>=0)mergeMsgs(bound[turnIdx],turnStartLogs);
  const drawIdx=bound.findIndex(step=>step.type==="DRAW_CARD");
  if(drawIdx>=0)mergeMsgs(bound[drawIdx],drawLogs);
  const firstStatIdx=bound.findIndex(step=>["HP_DAMAGE","SAN_DAMAGE","HP_HEAL","SAN_HEAL","HP_SAN_HEAL","GUILLOTINE","DEATH"].includes(step.type));
  if(firstStatIdx>=0){
    mergeMsgs(bound[firstStatIdx],preStatLogs);
    mergeMsgs(bound[firstStatIdx],statLogs);
  }else if(drawIdx>=0){
    mergeMsgs(bound[drawIdx],preStatLogs);
    mergeMsgs(bound[drawIdx],statLogs);
  }else if(turnIdx>=0){
    mergeMsgs(bound[turnIdx],preStatLogs);
    mergeMsgs(bound[turnIdx],statLogs);
  }else if(bound.length){
    mergeMsgs(bound[0],preStatLogs);
    mergeMsgs(bound[0],statLogs);
  }
  return bound;
}

export function subtractLogOccurrences(sourceLines, removeLines){
  const source=[...(Array.isArray(sourceLines)?sourceLines:[])];
  (Array.isArray(removeLines)?removeLines:[]).forEach(line=>{
    const idx=source.findIndex(item=>item===line);
    if(idx>=0)source.splice(idx,1);
  });
  return source;
}

export function splitTransitionLogs(oldLog,nextLog){
  const oldArr=Array.isArray(oldLog)?oldLog:[];
  const nextArr=Array.isArray(nextLog)?nextLog:[];
  const delta=nextArr.slice(oldArr.length);
  const nextTurnIdx=delta.findIndex(line=>isTurnStartLog(line));
  return {
    currentTurnLogs: nextTurnIdx>=0 ? delta.slice(0,nextTurnIdx) : delta,
    nextTurnLogs: nextTurnIdx>=0 ? delta.slice(nextTurnIdx) : [],
  };
}

export function appendAnimLogChunkToQueueEnd(queue,lines){
  const normalized=(Array.isArray(lines)?lines:[]).filter(line=>typeof line==="string"&&line.length);
  if(!Array.isArray(queue)||!queue.length||!normalized.length)return queue||[];
  const bound=queue.map(step=>({...step}));
  const lastIdx=bound.length-1;
  bound[lastIdx].msgs=[...(Array.isArray(bound[lastIdx].msgs)?bound[lastIdx].msgs:[]),...normalized];
  return bound;
}

export function hasExplicitAnimMsgs(step){
  return Array.isArray(step?.msgs)&&step.msgs.some(line=>typeof line==="string"&&line.length);
}

export function hasExplicitTurnFlowLogs(nextGs){
  return !!(
    (Array.isArray(nextGs?._turnStartLogs)&&nextGs._turnStartLogs.length) ||
    (Array.isArray(nextGs?._drawLogs)&&nextGs._drawLogs.length) ||
    (Array.isArray(nextGs?._statLogs)&&nextGs._statLogs.length)
  );
}

export function extractSkillLogs(lines,kind){
  const normalized=(Array.isArray(lines)?lines:[]).filter(line=>typeof line==="string"&&line.length);
  switch(kind){
    case "swap":
      return normalized.filter(isSkillSwapLog);
    case "bewitch":
      return normalized.filter(isSkillBewitchLog);
    case "hunt":
      return normalized.filter(isSkillHuntLog);
    default:
      return [];
  }
}

let unownedLogSequence = 0;

// State supplies event ownership and viewer names, never live message text.
// Every step must carry its own explicit message payload.
export function prepareAnimQueueLogs(queue,state=null){
  if(!Array.isArray(queue)||!queue.length)return queue||[];
  const eventsById=new Map((state?._visualEvents||[]).map(event=>[event.id,event]));
  return queue.map(item=>{
    const ownerId=item.visualEventId||item._logOwnerId||('unowned-log:'+ ++unownedLogSequence);
    const rawEntries=Array.isArray(item.logEntries)
      ?item.logEntries
      :createVisualLogEntries(ownerId,Array.isArray(item._logChunk)?item._logChunk:item.msgs);
    const turnOwner=item.turnOwner??eventsById.get(item.visualEventId)?.turnOwner;
    const ownerName=state?.players?.[turnOwner]?.name;
    // Resolve actor-relative wording from immutable event ownership. The panel
    // may still render the local name as “你”, but no later banner owns this line.
    const entries=rawEntries.map(entry=>({...entry,text:normalizeLogLineForViewer(entry.text,{
      isMultiplayer:!!state?._isMP,turnOwner:ownerName,
    })}));
    return {...item,_logOwnerId:ownerId,_logSource:'visualEvent',logEntries:entries,_logChunk:entries.map(entry=>entry.text)};
  });
}
