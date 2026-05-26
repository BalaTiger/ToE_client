import { makeTargetStats, statEventsToAnimQueue } from './statEvents';
import { statePatchStep } from './animQueueHelpers';

export function buildAnimQueue(oldGs, newGs) {
  const q = [];
  const newInspectionEvents = (newGs?._inspectionEvents || []).filter(ev => ev?.seq > (oldGs?._inspectionSeq || 0));
  const effectivePlayers = newInspectionEvents[0]?.beforePlayers || newGs.players;
  const effectiveLog = newInspectionEvents[0]?.beforeLog || newGs.log;
  const oldLog = Array.isArray(oldGs?.log) ? oldGs.log : [];
  const newMsgs = (Array.isArray(effectiveLog) ? effectiveLog : []).slice(oldLog.length);
  if (newGs.gameOver && newGs.currentTurn !== oldGs.currentTurn) {
    const dCard = newGs._aiDrawnCard || newGs._drawnCard || newGs.drawReveal?.card;
    if (dCard) {
      q.push({ type: 'YOUR_TURN', name: newGs.players[newGs.currentTurn]?.name || '???', msgs: newGs._turnStartLogs || [] });
      q.push({ type: 'DRAW_CARD', card: dCard, triggerName: newGs.players[newGs.currentTurn]?.name || '???', targetPid: newGs.currentTurn, msgs: newGs._drawLogs || [] });
    }
  }
  const deathIdx = effectivePlayers.reduce((acc, p, i) => { if (oldGs.players[i] && !oldGs.players[i].isDead && p.isDead) acc.push(i); return acc; }, []);
  const oldStatSeq = oldGs?._statEventSeq || 0;
  const newStatSeq = newGs?._statEventSeq || 0;
  const inspectionStatSeqs = new Set(newInspectionEvents.map(ev => ev?.statEventSeq).filter(seq => seq != null));
  const explicitStatEvents = Array.isArray(newGs?._statEvents)
    ? newGs._statEvents.filter(ev => (
      (newGs?._statEventSeq == null || ev?.seq == null || ev.seq > oldStatSeq) &&
      !inspectionStatSeqs.has(ev?.seq)
    ))
    : [];
  const hasFreshExplicitStatEvents = explicitStatEvents.length > 0 && (newGs?._statEventSeq == null || newStatSeq > oldStatSeq);
  const targetStats = hasFreshExplicitStatEvents
    ? makeTargetStats(effectivePlayers, explicitStatEvents)
    : effectivePlayers.map(p => ({ hp: p.hp, san: p.san, isDead: p.isDead }));
  if (hasFreshExplicitStatEvents) {
    q.push(...statEventsToAnimQueue(explicitStatEvents, effectivePlayers, newMsgs));
  } else {
    const hasHpHealLog = newMsgs.some(line => /(?:回复|恢复|回满).*HP|HP\s*回满/.test(line || ''));
    const hasSanHealLog = newMsgs.some(line => /(?:回复|恢复).*SAN/.test(line || ''));
    const hpHealIdx = hasHpHealLog
      ? effectivePlayers.reduce((acc, p, i) => { if (oldGs.players[i] && p.hp > oldGs.players[i].hp) acc.push(i); return acc; }, [])
      : [];
    const sanHealIdx = hasSanHealLog
      ? effectivePlayers.reduce((acc, p, i) => { if (oldGs.players[i] && p.san > oldGs.players[i].san) acc.push(i); return acc; }, [])
      : [];
    const sameHealTargets = hpHealIdx.length && sanHealIdx.length && hpHealIdx.length === sanHealIdx.length && hpHealIdx.every((v, i) => v === sanHealIdx[i]);
    const hpHitIdx = effectivePlayers.reduce((acc, p, i) => { if (oldGs.players[i] && p.hp < oldGs.players[i].hp) acc.push(i); return acc; }, []);
    if (hpHitIdx.length) q.push({ type: 'HP_DAMAGE', msgs: newMsgs, hitIndices: hpHitIdx, targetStats });
    if (sameHealTargets) {
      q.push({ type: 'HP_SAN_HEAL', msgs: newMsgs, hitIndices: hpHealIdx, targetStats });
    } else {
      if (hpHealIdx.length) q.push({ type: 'HP_HEAL', msgs: newMsgs, hitIndices: hpHealIdx, targetStats });
      if (sanHealIdx.length) q.push({ type: 'SAN_HEAL', msgs: newMsgs, hitIndices: sanHealIdx, targetStats });
    }
    const sanHitIdx = effectivePlayers.reduce((acc, p, i) => { if (oldGs.players[i] && p.san < oldGs.players[i].san) acc.push(i); return acc; }, []);
    if (sanHitIdx.length) q.push({ type: 'SAN_DAMAGE', msgs: newMsgs, hitIndices: sanHitIdx, targetStats });
  }
  if (deathIdx.length) {
    q.push({ type: 'GUILLOTINE', msgs: newMsgs, hitIndices: deathIdx, targetStats });
    q.push({ type: 'DEATH', msgs: newMsgs, hitIndices: deathIdx, targetStats });
  }
  if ((newGs._earthquakeSeq || 0) !== (oldGs._earthquakeSeq || 0)) {
    q.push({ type: 'EARTHQUAKE', msgs: newMsgs });
  }
  const fullHandSwapMsg = newMsgs.find(m => m.includes('交换了全部手牌'));
  if (fullHandSwapMsg) {
    const swapMatch = fullHandSwapMsg.match(/^(.+?) 与 (.+?) 交换了全部手牌/);
    const fromName = swapMatch?.[1];
    const toName = swapMatch?.[2];
    const resolveSwapPid = (name) => {
      if (!name) return -1;
      if (name === '你') return 0;
      return effectivePlayers.findIndex(p => p?.name === name);
    };
    const fromPid = resolveSwapPid(fromName);
    const toPid = resolveSwapPid(toName);
    if (fromPid >= 0 && toPid >= 0 && oldGs.players[fromPid] && oldGs.players[toPid]) {
      q.push({ type: 'CARD_TRANSFER', fromPid, dest: 'player', toPid, count: oldGs.players[fromPid].hand.length });
      q.push({ type: 'CARD_TRANSFER', fromPid: toPid, dest: 'player', toPid: fromPid, count: oldGs.players[toPid].hand.length });
      return q;
    }
  }
  const buryMsgs = newMsgs.filter(m => typeof m === 'string' && m.includes('【活埋】') && m.includes('放到了牌堆底'));
  if (buryMsgs.length) {
    buryMsgs.forEach(msg => {
      const match = msg.match(/^【活埋】(.+?) 将 /);
      const name = match?.[1];
      const fromPid = name === '你' ? 0 : effectivePlayers.findIndex(p => p?.name === name);
      q.push({ type: 'BURY_TO_DECK', fromPid: fromPid >= 0 ? fromPid : 0, msgs: [msg] });
    });
    return q;
  }
  const losers = effectivePlayers.filter((p, i) => oldGs.players[i] && p.hand.length < oldGs.players[i].hand.length);
  if (losers.length === 1) {
    const li = effectivePlayers.indexOf(losers[0]);
    const count = oldGs.players[li].hand.length - effectivePlayers[li].hand.length;
    let dest = 'discard';
    let toPid = null;
    for (let j = 0; j < effectivePlayers.length; j++) {
      if (j === li || !oldGs.players[j]) continue;
      if (effectivePlayers[j].hand.length > oldGs.players[j].hand.length) {
        dest = 'player';
        toPid = j;
        break;
      }
    }
    if (dest === 'discard') {
      const oldGZ = oldGs.players[li].godZone?.length || 0;
      const newGZ = effectivePlayers[li].godZone?.length || 0;
      if (newGZ > oldGZ) dest = 'godzone';
    }
    if (!effectivePlayers[li]?.isDead) {
      q.push({ type: 'CARD_TRANSFER', fromPid: li, dest, toPid, count });
    }
  } else if (losers.length === 2) {
    losers.forEach(loser => {
      const li = effectivePlayers.indexOf(loser);
      const toPid = effectivePlayers.findIndex((p, j) => j !== li && oldGs.players[j] && p.hand.length > oldGs.players[j].hand.length);
      if (toPid < 0) return;
      const count = oldGs.players[li].hand.length - effectivePlayers[li].hand.length;
      q.push({ type: 'CARD_TRANSFER', fromPid: li, dest: 'player', toPid, count });
    });
  }
  const shuMsg = newMsgs.find(m => m && m.includes('【黑暗子嗣】'));
  if (shuMsg) {
    const shuMatch = shuMsg.match(/【黑暗子嗣】(.+?) 获得(\d+)张黑山羊幼仔/);
    if (shuMatch) {
      const targetName = shuMatch[1];
      const count = parseInt(shuMatch[2], 10);
      const toPid = targetName === '你' ? 0 : effectivePlayers.findIndex(p => p?.name === targetName);
      if (toPid >= 0 && count > 0) {
        q.push({ type: 'CARD_TRANSFER', fromPid: oldGs.currentTurn, dest: 'player', toPid, count, sourceAnchor: 'playerArea', effect: 'blackGoat', durationMs: 1500, msgs: [shuMsg] });
      }
    }
  }
  return q;
}

export function buildFullHandSwapTransferQueueFromLogs(logs, players) {
  const fullHandSwapMsg = (Array.isArray(logs) ? logs : []).find(
    line => typeof line === 'string' && line.includes('交换了全部手牌')
  );
  if (!fullHandSwapMsg || !Array.isArray(players)) return [];
  const swapMatch = fullHandSwapMsg.match(/^(.+?) 与 (.+?) 交换了全部手牌/);
  const fromName = swapMatch?.[1];
  const toName = swapMatch?.[2];
  const resolveSwapPid = (name) => {
    if (!name) return -1;
    if (name === '你') return 0;
    return players.findIndex(p => p?.name === name);
  };
  const fromPid = resolveSwapPid(fromName);
  const toPid = resolveSwapPid(toName);
  if (fromPid < 0 || toPid < 0 || !players[fromPid] || !players[toPid]) return [];
  return [
    { type: 'CARD_TRANSFER', fromPid, dest: 'player', toPid, count: players[fromPid].hand.length },
    { type: 'CARD_TRANSFER', fromPid: toPid, dest: 'player', toPid: fromPid, count: players[toPid].hand.length, msgs: [fullHandSwapMsg] },
  ];
}

export function buildAiHuntEventAnimQueue(evt, actorName) {
  const huntMsgs = Array.isArray(evt.msgs) && evt.msgs.length ? [evt.msgs[0]] : [];
  const followupMsgs = Array.isArray(evt.msgs) ? evt.msgs.slice(1) : [];
  const perHuntQueue = [{ type: 'SKILL_HUNT', msgs: huntMsgs, _logChunk: huntMsgs, targetIdx: evt.targetIdx >= 0 ? evt.targetIdx : 1 }];
  const takeFollowup = (predicate) => {
    const idx = followupMsgs.findIndex(predicate);
    if (idx < 0) return [];
    return followupMsgs.splice(idx, 1);
  };
  if (evt.discardedCard) {
    const discardChunk = takeFollowup(line => /^弃 \[/.test(line || ''));
    perHuntQueue.push({ type: 'DISCARD', card: evt.discardedCard, triggerName: actorName || '???', targetPid: evt.hunterIdx, _logChunk: discardChunk });
    if (evt.afterDiscardPlayers) {
      perHuntQueue.push(statePatchStep({ players: evt.afterDiscardPlayers, discard: evt.afterDiscardDiscard }));
    }
  }
  if (evt.beforePlayers && evt.afterPlayers) {
    if (evt.afterPlayers[evt.targetIdx]?.isDead && evt.hunterIdx != null) {
      const hunterBefore = evt.beforePlayers[evt.hunterIdx]?.hand?.length || 0;
      const hunterAfter = evt.afterPlayers[evt.hunterIdx]?.hand?.length || 0;
      const cardsTaken = Math.max(0, hunterAfter - hunterBefore + (evt.discardedCard ? 1 : 0));
      if (cardsTaken > 0) {
        perHuntQueue.push({ type: 'CARD_TRANSFER', fromPid: evt.targetIdx, dest: 'player', toPid: evt.hunterIdx, count: cardsTaken });
      }
    }
    const beforeLog = Array.isArray(evt.beforeLog) ? evt.beforeLog : [];
    const afterLog = Array.isArray(evt.afterLog) ? evt.afterLog : [...beforeLog, ...(evt.msgs || [])];
    const resultQueue = buildAnimQueue(
      { players: evt.beforePlayers, log: beforeLog },
      { players: evt.afterPlayers, log: afterLog }
    );
    const resultWithChunks = resultQueue
      .filter(step => !(evt.discardedCard && step.type === 'CARD_TRANSFER' && step.fromPid === evt.hunterIdx && step.dest === 'discard'))
      .map(step => ({ ...step }));
    if (followupMsgs.length) {
      const firstVisibleIdx = resultWithChunks.findIndex(step => step.type !== 'STATE_PATCH');
      if (firstVisibleIdx >= 0) {
        resultWithChunks[firstVisibleIdx]._logChunk = [
          ...(Array.isArray(resultWithChunks[firstVisibleIdx]._logChunk) ? resultWithChunks[firstVisibleIdx]._logChunk : []),
          ...followupMsgs,
        ];
      }
    }
    perHuntQueue.push(...resultWithChunks);
    perHuntQueue.push(statePatchStep({ players: evt.afterPlayers, discard: evt.afterResultDiscard }));
  } else if (followupMsgs.length) {
    perHuntQueue.push({ type: 'TURN_BOUNDARY_PAUSE', _logChunk: [...followupMsgs] });
  }
  return perHuntQueue;
}
