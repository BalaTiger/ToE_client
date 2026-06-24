import { makeTargetStats, statEventsToAnimQueue } from './statEvents';
import { buildFullHandSwapStepsFromLogs, buryToDeckStep, cardTransferStep, statePatchStep } from './animQueueHelpers';
import { buildCardEffectStepsFromVisualEvents, buildGodPowerBlockedStepsFromVisualEvents, buildHuntRevealStepFromVisualEvent } from './visualEvents';

function clonePlayersForTimeline(players = []) {
  return players.map(player => ({
    ...player,
    hand: [...(player?.hand || [])],
    godZone: [...(player?.godZone || [])],
    zoneCards: [...(player?.zoneCards || [])],
  }));
}

function playersAfterStatEvents(basePlayers = [], statEvents = []) {
  const next = clonePlayersForTimeline(basePlayers);
  statEvents.forEach(event => {
    if (event?.target == null || !next[event.target]) return;
    const target = next[event.target];
    const to = event.to || {};
    if (Object.prototype.hasOwnProperty.call(to, 'hp')) target.hp = to.hp;
    if (Object.prototype.hasOwnProperty.call(to, 'san')) target.san = to.san;
    if (Object.prototype.hasOwnProperty.call(to, 'isDead')) target.isDead = to.isDead;
  });
  return next;
}

function mergeStatValuesIntoPlayers(basePlayers = [], statPlayers = []) {
  const base = clonePlayersForTimeline(basePlayers);
  statPlayers.forEach((statPlayer, idx) => {
    if (!base[idx] || !statPlayer) return;
    base[idx] = {
      ...base[idx],
      hp: statPlayer.hp,
      san: statPlayer.san,
      isDead: statPlayer.isDead,
    };
  });
  return base;
}

function attachVisualTimelineToSteps(steps = [], beforePlayers = [], beforeDiscard = [], afterPlayers = [], afterDiscard = []) {
  let cursorPlayers = clonePlayersForTimeline(beforePlayers);
  let cursorDiscard = Array.isArray(beforeDiscard) ? [...beforeDiscard] : [];
  return steps.map(step => {
    if (!step || step.type === 'STATE_PATCH') return step;
    const hasStatEvents = Array.isArray(step.statEvents) && step.statEvents.length;
    const statNextPlayers = hasStatEvents
      ? playersAfterStatEvents(cursorPlayers, step.statEvents)
      : cursorPlayers;
    const nextPlayers = hasStatEvents
      ? mergeStatValuesIntoPlayers(afterPlayers, statNextPlayers)
      : cursorPlayers;
    const nextDiscard = step.type === 'DISCARD' && step.card
      ? [...cursorDiscard, step.card]
      : cursorDiscard;
    const timedStep = {
      ...step,
      visualSetupTiming: step.visualSetupTiming || 'queueStart',
      visualSetupPatch: {
        ...(step.visualSetupPatch || {}),
        players: cursorPlayers,
        discard: cursorDiscard,
      },
      visualTimeline: Array.isArray(step.visualTimeline) ? step.visualTimeline : [
        { atMs: 0, patch: { players: cursorPlayers, discard: cursorDiscard } },
        { atMs: 360, patch: { players: nextPlayers, discard: nextDiscard } },
      ],
    };
    cursorPlayers = nextPlayers;
    cursorDiscard = nextDiscard;
    return timedStep;
  }).map((step, index, arr) => {
    if (index !== arr.length - 1 || step?.type === 'STATE_PATCH') return step;
    return {
      ...step,
      visualTimeline: [
        ...(Array.isArray(step.visualTimeline) ? step.visualTimeline : []),
        { atMs: 520, patch: { players: afterPlayers, discard: afterDiscard } },
      ],
    };
  });
}

function collectStepStatEvents(steps = []) {
  return steps.flatMap(step => {
    if (!step) return [];
    return [
      ...(Array.isArray(step.statEvents) ? step.statEvents : []),
      ...(Array.isArray(step.steps) ? collectStepStatEvents(step.steps) : []),
    ];
  });
}

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
  const cardEffectSteps = buildCardEffectStepsFromVisualEvents(newGs, oldGs);
  const godPowerBlockedSteps = buildGodPowerBlockedStepsFromVisualEvents(newGs, oldGs);
  const handledCardEffectStatEvents = collectStepStatEvents(cardEffectSteps);
  const handledCardEffectStatSeqs = new Set(
    handledCardEffectStatEvents
      .map(event => event?.seq)
      .filter(seq => seq != null)
  );
  const statEventsForQueue = handledCardEffectStatSeqs.size
    ? explicitStatEvents.filter(event => !handledCardEffectStatSeqs.has(event?.seq))
    : explicitStatEvents;
  const petrifyDeathTargets = new Set(explicitStatEvents
    .filter(event => event?.type === 'PETRIFY_DEATH' && event?.target != null)
    .map(event => Number(event.target)));
  const deathIdx = effectivePlayers.reduce((acc, p, i) => {
    if (oldGs.players[i] && !oldGs.players[i].isDead && p.isDead && !petrifyDeathTargets.has(i)) acc.push(i);
    return acc;
  }, []);
  const hasFreshExplicitStatEvents = statEventsForQueue.length > 0 && (newGs?._statEventSeq == null || newStatSeq > oldStatSeq);
  const targetStats = hasFreshExplicitStatEvents
    ? makeTargetStats(effectivePlayers, statEventsForQueue)
    : effectivePlayers.map(p => ({ hp: p.hp, san: p.san, isDead: p.isDead }));
  if (hasFreshExplicitStatEvents) {
    const hasOrderedRandomTarget = randomTargetEvents.some(event => event?.phaseOrder != null);
    const hasOrderedStat = statEventsForQueue.some(event => event?.phaseOrder != null);
    if (hasOrderedRandomTarget || hasOrderedStat) {
      const orders = [
        ...new Set([
          ...statEventsForQueue.map(event => event?.phaseOrder ?? 0),
          ...randomTargetEvents.map(event => event?.phaseOrder ?? 0),
        ]),
      ].sort((a, b) => a - b);
      const orderedSteps = [];
      let orderedCursorPlayers = clonePlayersForTimeline(oldGs?.players || effectivePlayers);
      orders.forEach(order => {
        const statSlice = statEventsForQueue.filter(event => (event?.phaseOrder ?? 0) === order);
        if (statSlice.length) {
          orderedSteps.push(...statEventsToAnimQueue(statSlice, orderedCursorPlayers, order === 0 ? newMsgs : []));
          orderedCursorPlayers = playersAfterStatEvents(orderedCursorPlayers, statSlice);
        }
        randomTargetEvents
          .filter(event => (event?.phaseOrder ?? 0) === order)
          .forEach(event => orderedSteps.push(...buildRandomTargetQueue(event)));
      });
      q.push(...attachVisualTimelineToSteps(
        orderedSteps,
        oldGs?.players || effectivePlayers,
        oldGs?.discard || [],
        newGs.players || effectivePlayers,
        newGs.discard || oldGs?.discard || [],
      ));
    } else {
      randomTargetEvents.forEach(event => q.push(...buildRandomTargetQueue(event)));
      q.push(...attachVisualTimelineToSteps(
        statEventsToAnimQueue(statEventsForQueue, effectivePlayers, newMsgs),
        oldGs?.players || effectivePlayers,
        oldGs?.discard || [],
        newGs.players || effectivePlayers,
        newGs.discard || oldGs?.discard || [],
      ));
    }
  } else {
    randomTargetEvents.forEach(event => q.push(...buildRandomTargetQueue(event)));
    if (!handledCardEffectStatEvents.length) {
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
  }
  q.push(...godPowerBlockedSteps);
  q.push(...cardEffectSteps);
  if (deathIdx.length) {
    q.push({ type: 'GUILLOTINE', msgs: newMsgs, hitIndices: deathIdx, targetStats });
    q.push({ type: 'DEATH', msgs: newMsgs, hitIndices: deathIdx, targetStats });
  }
  const moldyRoll = newGs?._moldyFoodDiceRoll;
  const moldySeq = moldyRoll?.seq ?? newGs?._moldyFoodDiceSeq;
  const oldMoldySeq = oldGs?._moldyFoodDiceSeq || oldGs?._moldyFoodDiceRoll?.seq || 0;
  if (moldyRoll && moldyRoll.d1 != null && (moldySeq == null || moldySeq > oldMoldySeq)) {
    q.unshift({
      type: 'DICE_ROLL',
      diceMode: 'moldyFood',
      d1: moldyRoll.d1,
      d2: 0,
      negativeAvoided: !!moldyRoll.negativeAvoided,
      rollerName: newGs.players?.[moldyRoll.actorIdx]?.name || '角色',
      msgs: [],
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
      const oldHandCount = oldGs.players?.[toPid]?.hand?.length ?? 0;
      const newHandCount = effectivePlayers?.[toPid]?.hand?.length ?? 0;
      if (toPid >= 0 && count > 0 && newHandCount >= oldHandCount + count) {
        q.push(cardTransferStep({ fromPid: oldGs.currentTurn, dest: 'player', toPid, count, sourceAnchor: 'godPower', effect: 'blackGoat', durationMs: 1500, msgs: [shuMsg] }));
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
