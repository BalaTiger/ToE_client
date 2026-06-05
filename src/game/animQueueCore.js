import { makeTargetStats, statEventsToAnimQueue } from './statEvents';
import { buildFullHandSwapStepsFromLogs, buryToDeckStep, cardTransferStep, statePatchStep } from './animQueueHelpers';
import { buildEarthquakeStepFromVisualEvents, buildHuntRevealStepFromVisualEvent, getEarthquakeVisualEvent } from './visualEvents';

export function buildAnimQueue(oldGs, newGs) {
  const q = [];
  const newApophisTargetEvent = newGs?._apophisTargetEvent;
  if (newApophisTargetEvent?.seq && newApophisTargetEvent.seq > (oldGs?._apophisTargetSeq || 0)) {
    const apophisNightForAnim = newGs?.apophisNight || null;
    q.push({
      type: 'DICE_ROLL',
      _apophisTargetSeq: newApophisTargetEvent.seq,
      _apophisNight: apophisNightForAnim,
      diceMode: 'apophisNight',
      apophisChanged: !!newApophisTargetEvent.changed,
      d1: newApophisTargetEvent.roll,
      d2: 0,
      heal: 0,
      rollerName: newApophisTargetEvent.actorName || newGs.players?.[newApophisTargetEvent.actorIdx]?.name || '???',
      msgs: newApophisTargetEvent.log ? [newApophisTargetEvent.log] : [],
      _logChunk: newApophisTargetEvent.log ? [newApophisTargetEvent.log] : [],
    });
    if (newApophisTargetEvent.changed && /追捕/.test(newApophisTargetEvent.label || '')) {
      q.push({ type: 'SKILL_HUNT', _apophisTargetSeq: newApophisTargetEvent.seq, _apophisNight: apophisNightForAnim, targetIdx: newApophisTargetEvent.targetIdx, msgs: [] });
    } else if (newApophisTargetEvent.changed && /蛊惑/.test(newApophisTargetEvent.label || '')) {
      q.push({ type: 'SKILL_BEWITCH', _apophisTargetSeq: newApophisTargetEvent.seq, _apophisNight: apophisNightForAnim, targetIdx: newApophisTargetEvent.targetIdx, msgs: [] });
    }
  }
  const newInspectionEvents = (newGs?._inspectionEvents || []).filter(ev => ev?.seq > (oldGs?._inspectionSeq || 0));
  const effectivePlayers = newInspectionEvents[0]?.beforePlayers || newGs.players;
  const effectiveLog = newInspectionEvents[0]?.beforeLog || newGs.log;
  const oldLog = Array.isArray(oldGs?.log) ? oldGs.log : [];
  const newMsgs = (Array.isArray(effectiveLog) ? effectiveLog : []).slice(oldLog.length);
  if (newGs?.apophisNight?.active) {
    const nightMsg = newMsgs.find(line => typeof line === 'string' && line.includes('【噬日灭世】黑夜降临'));
    if (nightMsg) q.push({ type: 'APOPHIS_ECLIPSE', msgs: [nightMsg] });
  }
  const randomTargetEvents = (newGs?._randomTargetEvents || []).filter(ev => ev?.seq > (oldGs?._randomTargetSeq || 0));
  const buildRandomTargetQueue = event => {
    const queue = [];
    if (event.diceBefore && event.roll != null) {
      queue.push({
        type: 'DICE_ROLL',
        diceMode: 'throwStone',
        d1: event.roll,
        d2: 0,
        rollerName: newGs.players?.[event.sourceIdx]?.name || '角色',
        msgs: [],
      });
    }
    queue.push({
      type: 'RANDOM_TARGET',
      ...event,
      players: newGs.players,
      msgs: event.resultText ? [event.resultText] : [],
    });
    return queue;
  };
  if (newGs.gameOver && newGs.currentTurn !== oldGs.currentTurn) {
    const dCard = newGs._aiDrawnCard || newGs._drawnCard || newGs.drawReveal?.card;
    if (dCard) {
      q.push({ type: 'YOUR_TURN', name: newGs.players[newGs.currentTurn]?.name || '???', msgs: newGs._turnStartLogs || [] });
      q.push({ type: 'DRAW_CARD', card: dCard, triggerName: newGs.players[newGs.currentTurn]?.name || '???', targetPid: newGs.currentTurn, msgs: newGs._drawLogs || [] });
    }
  }
  const oldStatSeq = oldGs?._statEventSeq || 0;
  const newStatSeq = newGs?._statEventSeq || 0;
  const inspectionStatSeqs = new Set(newInspectionEvents.map(ev => ev?.statEventSeq).filter(seq => seq != null));
  const explicitStatEvents = Array.isArray(newGs?._statEvents)
    ? newGs._statEvents.filter(ev => (
      (newGs?._statEventSeq == null || ev?.seq == null || ev.seq > oldStatSeq) &&
      !inspectionStatSeqs.has(ev?.seq)
    ))
    : [];
  const petrifyDeathTargets = new Set(explicitStatEvents
    .filter(event => event?.type === 'PETRIFY_DEATH' && event?.target != null)
    .map(event => Number(event.target)));
  const deathIdx = effectivePlayers.reduce((acc, p, i) => {
    if (oldGs.players[i] && !oldGs.players[i].isDead && p.isDead && !petrifyDeathTargets.has(i)) acc.push(i);
    return acc;
  }, []);
  const hasFreshExplicitStatEvents = explicitStatEvents.length > 0 && (newGs?._statEventSeq == null || newStatSeq > oldStatSeq);
  const targetStats = hasFreshExplicitStatEvents
    ? makeTargetStats(effectivePlayers, explicitStatEvents)
    : effectivePlayers.map(p => ({ hp: p.hp, san: p.san, isDead: p.isDead }));
  if (hasFreshExplicitStatEvents) {
    const hasOrderedRandomTarget = randomTargetEvents.some(event => event?.phaseOrder != null);
    const hasOrderedStat = explicitStatEvents.some(event => event?.phaseOrder != null);
    if (hasOrderedRandomTarget || hasOrderedStat) {
      const orders = [
        ...new Set([
          ...explicitStatEvents.map(event => event?.phaseOrder ?? 0),
          ...randomTargetEvents.map(event => event?.phaseOrder ?? 0),
        ]),
      ].sort((a, b) => a - b);
      orders.forEach(order => {
        const statSlice = explicitStatEvents.filter(event => (event?.phaseOrder ?? 0) === order);
        if (statSlice.length) q.push(...statEventsToAnimQueue(statSlice, effectivePlayers, order === 0 ? newMsgs : []));
        randomTargetEvents
          .filter(event => (event?.phaseOrder ?? 0) === order)
          .forEach(event => q.push(...buildRandomTargetQueue(event)));
      });
    } else {
      randomTargetEvents.forEach(event => q.push(...buildRandomTargetQueue(event)));
      q.push(...statEventsToAnimQueue(explicitStatEvents, effectivePlayers, newMsgs));
    }
  } else {
    randomTargetEvents.forEach(event => q.push(...buildRandomTargetQueue(event)));
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
  // 地动山摇：仅当事件是「本次转移新出现」（不在 oldGs._visualEvents 中）时才播放动画。
  // 事件 id 在创建时固定并随状态保留，后续行动携带同一事件时会命中 oldGs → 跳过，避免重复播放。
  const earthquakeEventForAnim = getEarthquakeVisualEvent(newGs);
  const earthquakeAlreadyInOld = !!earthquakeEventForAnim
    && (oldGs?._visualEvents || []).some(e => e?.id != null && e.id === earthquakeEventForAnim.id);
  const earthquakeVisualStep = (earthquakeEventForAnim && !earthquakeAlreadyInOld)
    ? buildEarthquakeStepFromVisualEvents(newGs)
    : null;
  if (earthquakeVisualStep) {
    q.push(earthquakeVisualStep);
  }
  // [EQ-DEBUG] 地动山摇动画排查：事件是否存在、是否被判定为旧事件、步骤是否产出
  if (earthquakeEventForAnim) {
    try { console.log('[EQ-DEBUG] buildAnimQueue: earthquake event present, alreadyInOld =', earthquakeAlreadyInOld, ', stepBuilt =', !!earthquakeVisualStep, '| queueSoFar =', q.map(s => s.type)); } catch { /* noop */ }
  }
  const fullHandSwapMsg = newMsgs.find(m => m.includes('交换了全部手牌'));
  if (fullHandSwapMsg) {
    const fullHandSwapQ = buildFullHandSwapStepsFromLogs([fullHandSwapMsg], oldGs.players);
    if (fullHandSwapQ.length) {
      q.push(...fullHandSwapQ);
      return q;
    }
  }
  const buryMsgs = newMsgs.filter(m => typeof m === 'string' && m.includes('【活埋】') && m.includes('放到了牌堆底'));
  if (buryMsgs.length) {
    buryMsgs.forEach(msg => {
      const match = msg.match(/^【活埋】(.+?) 将 /);
      const name = match?.[1];
      const fromPid = name === '你' ? 0 : effectivePlayers.findIndex(p => p?.name === name);
      q.push(buryToDeckStep({ fromPid: fromPid >= 0 ? fromPid : 0, msgs: [msg], players: oldGs.players }));
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
    if (!effectivePlayers[li]?.isDead && dest !== 'godzone') {
      q.push(cardTransferStep({ fromPid: li, dest, toPid, count }));
    }
  } else if (losers.length === 2) {
    losers.forEach(loser => {
      const li = effectivePlayers.indexOf(loser);
      const toPid = effectivePlayers.findIndex((p, j) => j !== li && oldGs.players[j] && p.hand.length > oldGs.players[j].hand.length);
      if (toPid < 0) return;
      const count = oldGs.players[li].hand.length - effectivePlayers[li].hand.length;
      q.push(cardTransferStep({ fromPid: li, dest: 'player', toPid, count }));
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
        q.push(cardTransferStep({ fromPid: oldGs.currentTurn, dest: 'player', toPid, count, sourceAnchor: 'playerArea', effect: 'blackGoat', durationMs: 1500, msgs: [shuMsg] }));
      }
    }
  }
  return q;
}

export function buildFullHandSwapTransferQueueFromLogs(logs, players, options = {}) {
  return buildFullHandSwapStepsFromLogs(logs, players, options);
}

export function buildAiHuntEventAnimQueue(evt, actorName) {
  const huntMsgs = Array.isArray(evt.msgs) && evt.msgs.length ? [evt.msgs[0]] : [];
  const followupMsgs = Array.isArray(evt.msgs) ? evt.msgs.slice(evt.skipIntro ? 0 : 1) : [];
  const perHuntQueue = evt.skipIntro
    ? []
    : [{ type: 'SKILL_HUNT', msgs: huntMsgs, _logChunk: huntMsgs, targetIdx: evt.targetIdx >= 0 ? evt.targetIdx : 1 }];
  const revealStep = buildHuntRevealStepFromVisualEvent({
    targetIdx: evt.targetIdx,
    card: evt.revealedCard,
    msgs: [],
  }, { players: evt.beforePlayers });
  if (revealStep && !evt.skipReveal) perHuntQueue.push(revealStep);
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
    const beforeLog = Array.isArray(evt.beforeLog) ? evt.beforeLog : [];
    const afterLog = Array.isArray(evt.afterLog) ? evt.afterLog : [...beforeLog, ...(evt.msgs || [])];
    const damagePlayers = evt.afterDamagePlayers || evt.afterPlayers;
    const damageLog = evt.afterDamageLog || afterLog;
    const resultQueue = buildAnimQueue(
      { players: evt.afterDiscardPlayers || evt.beforePlayers, log: beforeLog },
      { players: damagePlayers, discard: evt.afterDamageDiscard || evt.afterResultDiscard, log: damageLog }
    );
    const resultWithChunks = resultQueue
      .filter(step => !(evt.discardedCard && step.type === 'CARD_TRANSFER' && step.fromPid === evt.hunterIdx && step.dest === 'discard'))
      .map(step => ({ ...step }));
    if (followupMsgs.length && !evt.afterPlayers[evt.targetIdx]?.isDead) {
      const firstVisibleIdx = resultWithChunks.findIndex(step => step.type !== 'STATE_PATCH');
      if (firstVisibleIdx >= 0) {
        resultWithChunks[firstVisibleIdx]._logChunk = [
          ...(Array.isArray(resultWithChunks[firstVisibleIdx]._logChunk) ? resultWithChunks[firstVisibleIdx]._logChunk : []),
          ...followupMsgs,
        ];
      }
    }
    perHuntQueue.push(...resultWithChunks);
    if (evt.afterPlayers[evt.targetIdx]?.isDead && evt.hunterIdx != null) {
      const lootMsgs = followupMsgs.filter(line => /从 .+ 的(?:公开)?手牌中/.test(line || ''));
      const discardMsgs = followupMsgs.filter(line => /衍生牌|黑山羊幼仔/.test(line || ''));
      const cardsTaken = Number.isFinite(evt.lootTransferCount) ? evt.lootTransferCount : 0;
      if (cardsTaken > 0) {
        perHuntQueue.push(cardTransferStep({ fromPid: evt.targetIdx, dest: 'player', toPid: evt.hunterIdx, count: cardsTaken, msgs: lootMsgs }));
      } else if (lootMsgs.length) {
        perHuntQueue.push({ type: 'TURN_BOUNDARY_PAUSE', _logChunk: lootMsgs });
      }
      (evt.lootDiscardCards || []).forEach((card, idx, arr) => {
        perHuntQueue.push({
          type: 'DISCARD',
          card,
          triggerName: evt.afterPlayers[evt.targetIdx]?.name || '???',
          targetPid: evt.targetIdx,
          _logChunk: idx === arr.length - 1 ? discardMsgs : [],
        });
      });
      if (!cardsTaken && !(evt.lootDiscardCards || []).length && discardMsgs.length) {
        perHuntQueue.push({ type: 'TURN_BOUNDARY_PAUSE', _logChunk: discardMsgs });
      }
    }
    perHuntQueue.push(statePatchStep({ players: evt.afterPlayers, discard: evt.afterResultDiscard }));
  } else if (followupMsgs.length) {
    perHuntQueue.push({ type: 'TURN_BOUNDARY_PAUSE', _logChunk: [...followupMsgs] });
  }
  return perHuntQueue;
}
