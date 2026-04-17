export function isTurnStartLog(line){
  return new RegExp("^── .+ 的回合开始 ──$").test(line||"");
}

export function isStatLog(line){
  return new RegExp("造成 \\d+HP 伤害|失去 \\d+ HP|失去 \\d+ SAN|失去 \\d+ HP 和 \\d+ SAN|恢复 \\d+ HP|恢复 \\d+ SAN|各种理智和各种回复额外失去|被玫瑰倒刺刺伤|恢复 1SAN").test(line||"");
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
  return new RegExp("摸到 \\[|收入了 \\[|偶遇灵魂|将神牌收入手牌|展示了一张牌顶|这是带有负面效果的区域牌|抽出 \\d+ 点准备看|准备使用两人一绳进行随机居战?").test(line||"");
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

function takeMatchingLogs(remaining,predicate,limit=1){
  if(!remaining.length)return [];
  const taken=[];
  let consumed=0;
  while(remaining.length&&consumed<limit&&predicate(remaining[0],consumed)){
    taken.push(remaining.shift());
    consumed++;
  }
  return taken;
}

export function prepareAnimQueueLogs(queue,nextGs,baseLog=[]){
  if(!Array.isArray(queue)||!queue.length)return queue||[];
  const nextLog=Array.isArray(nextGs?.log)?nextGs.log:[];
  const normalizedBaseLog=Array.isArray(baseLog)?baseLog:[];
  const explicitTurnFlow=hasExplicitTurnFlowLogs(nextGs);
  let prefix=0;
  while(prefix<normalizedBaseLog.length&&prefix<nextLog.length&&normalizedBaseLog[prefix]===nextLog[prefix])prefix++;
  let remaining=nextLog.slice(prefix);
  const queueStartsNewTurn=queue[0]?.type==="YOUR_TURN";
  if(nextGs?._playersBeforeThisDraw&&!queueStartsNewTurn){
    const turnStartIdx=remaining.findIndex(line=>isTurnStartLog(line));
    if(turnStartIdx>=0){
      remaining=remaining.slice(0,turnStartIdx);
    }
  }
  const consumeExplicit=(msgs=[])=>{
    const normalized=(Array.isArray(msgs)?msgs:[]).filter(m=>typeof m==="string"&&m.length);
    if(!normalized.length)return [];
    const taken=[];
    normalized.forEach(msg=>{
      const idx=remaining.findIndex(line=>line===msg);
      if(idx>=0){
        taken.push(remaining[idx]);
        remaining.splice(idx,1);
      }
    });
    return taken;
  };
  return queue.map(item=>{
    const step={...item};
    if(Array.isArray(step._logChunk))return step;
    let chunk=consumeExplicit(step.msgs);
    if(hasExplicitAnimMsgs(step)){
      step._logChunk=chunk;
      return step;
    }
    if(explicitTurnFlow&&["YOUR_TURN","DRAW_CARD","HP_DAMAGE","SAN_DAMAGE","HP_HEAL","SAN_HEAL","HP_SAN_HEAL","GUILLOTINE","DEATH"].includes(step.type)){
      step._logChunk=chunk;
      return step;
    }
    if(!chunk.length){
      switch(step.type){
        case "YOUR_TURN":
          chunk=takeMatchingLogs(remaining,isTurnStartLog,1);
          break;
        case "DRAW_CARD":
          chunk=takeMatchingLogs(remaining,isDrawLikeLog,8);
          if(!chunk.length)chunk=takeMatchingLogs(remaining,line=>!isTurnStartLog(line)&&!isSkillHuntLog(line)&&!isSkillSwapLog(line)&&!isSkillBewitchLog(line)&&!isStatLog(line),4);
          break;
        case "SKILL_HUNT":
          chunk=takeMatchingLogs(remaining,isSkillHuntLog,1);
          break;
        case "SKILL_SWAP":
          chunk=takeMatchingLogs(remaining,isSkillSwapLog,1);
          break;
        case "SKILL_BEWITCH":
          chunk=takeMatchingLogs(remaining,isSkillBewitchLog,1);
          break;
        case "DISCARD":
          chunk=takeMatchingLogs(remaining,isDiscardOnlyLog,1);
          break;
        case "CARD_TRANSFER":
          chunk=takeMatchingLogs(remaining,isTransferLog,1);
          break;
        case "HP_DAMAGE":
        case "SAN_DAMAGE":
        case "HP_HEAL":
        case "SAN_HEAL":
        case "GUILLOTINE":
          chunk=takeMatchingLogs(remaining,isStatLog,12);
          break;
        default:
          break;
      }
    }
    step._logChunk=chunk;
    return step;
  });
}
