import { makeTargetStats, statEventsToAnimQueue } from './statEvents';
import { buildFullHandSwapStepsFromLogs, buryToDeckStep, cardTransferStep, statePatchStep } from './animQueueHelpers';

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
  const effectLogCandidates = [
    ...newMsgs,
    ...(Array.isArray(newGs?._drawLogs) ? newGs._drawLogs : []),
    ...(Array.isArray(newGs?._statLogs) ? newGs._statLogs : []),
    ...(Array.isArray(newGs?.drawReveal?.msgs) ? newGs.drawReveal.msgs : []),
  ];
  const hasEarthquakeTriggerLog = effectLogCandidates.some(line =>
    typeof line === 'string' &&
    line.includes('地动山摇') &&
    (line.includes('强制触发') || line.includes('全体角色'))
  );
  if ((newGs._earthquakeSeq || 0) !== (oldGs._earthquakeSeq || 0) || hasEarthquakeTriggerLog) {
    const beforeEarthquakePlayers = newGs?._earthquakeBeforePlayers || oldGs.players;
    const beforeEarthquakeDiscard = Array.isArray(newGs?._earthquakeBeforeDiscard)
      ? newGs._earthquakeBeforeDiscard
      : (Array.isArray(oldGs?.discard) ? oldGs.discard : []);
    let stagedPlayers = beforeEarthquakePlayers.map(p => ({ ...p, hand: [...(p?.hand || [])] }));
    const discardEvents = Array.isArray(newGs?._earthquakeDiscardEvents)
      ? newGs._earthquakeDiscardEvents.map((event, index, events) => {
        const playerIndex = event?.playerIndex;
        if (playerIndex != null && newGs.players?.[playerIndex]) {
          stagedPlayers = stagedPlayers.map((player, i) => (
            i === playerIndex
              ? { ...newGs.players[playerIndex], hand: [...(newGs.players[playerIndex].hand || [])] }
              : player
          ));
        }
        return {
          ...event,
          afterPlayers: stagedPlayers.map(p => ({ ...p, hand: [...(p?.hand || [])] })),
          delayMs: 420 + (events.length > 1 ? Math.round((1600 / (events.length - 1)) * index) : 0),
          durationMs: 620,
        };
      })
      : [];
    q.push({
      type: 'EARTHQUAKE',
      msgs: effectLogCandidates,
      beforePlayers: beforeEarthquakePlayers,
      beforeDiscard: beforeEarthquakeDiscard,
      discardEvents,
      visualSetupTiming: 'queueStart',
      visualSetupPatch: { discard: beforeEarthquakeDiscard },
      visualTimeline: [
        { atMs: 0, patch: { players: beforeEarthquakePlayers, discard: beforeEarthquakeDiscard } },
        ...discardEvents.map(event => ({
          atMs: (event.delayMs || 0) + (event.durationMs || 0),
          patch: {
            players: event.afterPlayers,
            ...(Array.isArray(event.afterDiscard) ? { discard: event.afterDiscard } : {}),
          },
        })),
      ],
    });
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
    if (!effectivePlayers[li]?.isDead) {
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
