import { makeTargetStats, statEventsToAnimQueue } from './statEvents';
import { buildFullHandSwapStepsFromLogs, buryToDeckStep, cardTransferStep, statePatchStep } from './animQueueHelpers';
import { buildCardEffectStepsFromVisualEvents, buildGodPowerBlockedStepsFromVisualEvents, buildHuntRevealStepFromVisualEvent } from './visualEvents';
import { isTsathogguaSlime } from './coreUtils';
import { cardIdentity } from './cardIdentity';

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

function getDeathAnimMsgs(newMsgs = [], players = [], deathIndices = []) {
  const deathLines = (Array.isArray(newMsgs) ? newMsgs : []).filter(line => typeof line === 'string' && line.includes('倒下了'));
  if (!deathLines.length) return [];
  const names = new Set((deathIndices || []).map(idx => players?.[idx]?.name).filter(Boolean));
  if (!names.size) return deathLines;
  const matched = deathLines.filter(line => [...names].some(name => line.includes(name)));
  return matched.length ? matched : deathLines;
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

// 中途结算（HP/SAN/神域）会用最终玩家快照，但其中的"最终手牌"不能提前出现：
// 手牌图像只应在收/送动画真正落地（队列结束）时变化。这里用 handSource 的手牌覆盖 snapshot，
// 让中途的视觉补丁保留出手/收牌前的手牌，其余字段仍取 snapshot。
function snapshotWithHands(snapshot = [], handSource = []) {
  return snapshot.map((player, idx) =>
    player ? { ...player, hand: [...(handSource[idx]?.hand ?? player.hand ?? [])] } : player
  );
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
      ? snapshotWithHands(mergeStatValuesIntoPlayers(afterPlayers, statNextPlayers), cursorPlayers)
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
        { atMs: 520, patch: { players: snapshotWithHands(afterPlayers, cursorPlayers), discard: afterDiscard } },
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

function buildVritraImmortalRevealSteps(oldGs, newGs, newMsgs = []) {
  const lines = (Array.isArray(newMsgs) ? newMsgs : [])
    .filter(line => typeof line === 'string' && line.includes('【不灭之躯】') && line.includes('翻开'));
  if (!lines.length) return [];
  const oldDiscardLen = Array.isArray(oldGs?.discard) ? oldGs.discard.length : 0;
  const appendedDiscard = Array.isArray(newGs?.discard) ? newGs.discard.slice(oldDiscardLen) : [];
  let discardCursor = 0;
  return lines.map(line => {
    const countMatch = line.match(/翻开\s*(\d+)\s*张/);
    const count = Math.max(0, Number(countMatch?.[1] || 0));
    const cards = count > 0 ? appendedDiscard.slice(discardCursor, discardCursor + count) : [];
    discardCursor += count;
    const nameMatch = line.match(/^【不灭之躯】(.+?)\s/);
    const playerName = nameMatch?.[1] || '目标';
    const targetPid = playerName === '你'
      ? 0
      : (newGs?.players || []).findIndex(player => player?.name === playerName);
    return {
      type: 'VRI_IMMORTAL_REVEAL',
      targetPid: targetPid >= 0 ? targetPid : null,
      playerName,
      cards,
      success: line.includes('未见邪神牌') || line.includes('HP恢复至1'),
      msgs: [line],
    };
  });
}

function getRemovedHandCards(oldHand = [], newHand = []) {
  const remaining = new Map();
  (newHand || []).forEach(card => {
    const id = cardIdentity(card);
    if (!id) return;
    remaining.set(id, (remaining.get(id) || 0) + 1);
  });
  return (oldHand || []).filter(card => {
    const id = cardIdentity(card);
    if (!id) return false;
    const count = remaining.get(id) || 0;
    if (count > 0) {
      remaining.set(id, count - 1);
      return false;
    }
    return true;
  });
}

export function buildHandDeltaInferenceQueue({ oldGs, effectivePlayers, newMsgs }) {
  const q = [];
  if (!oldGs || !Array.isArray(oldGs.players) || !Array.isArray(effectivePlayers)) return q;
  const msgs = Array.isArray(newMsgs) ? newMsgs : [];
  const multiplyMsg = msgs.find(m => typeof m === 'string' && m.includes('【繁衍】') && m.includes('黑山羊幼仔'));
  const multiplyMatch = multiplyMsg?.match(/^【繁衍】(.+?) 将黑山羊幼仔传播给了 (.+)$/);
  if (multiplyMatch) {
    const fromName = multiplyMatch[1];
    const targetName = multiplyMatch[2];
    const fromPid = fromName === '你' ? 0 : effectivePlayers.findIndex(p => p?.name === fromName);
    const toPid = targetName === '你' ? 0 : effectivePlayers.findIndex(p => p?.name === targetName);
    const oldHandCount = oldGs.players?.[toPid]?.hand?.length ?? 0;
    const newHandCount = effectivePlayers?.[toPid]?.hand?.length ?? 0;
    if (fromPid >= 0 && toPid >= 0 && newHandCount > oldHandCount) {
      q.push(cardTransferStep({
        fromPid,
        dest: 'player',
        toPid,
        count: newHandCount - oldHandCount,
        effect: 'blackGoat',
        durationMs: 1500,
        msgs: [multiplyMsg],
      }));
    }
  }
  const hasBewitchGiftLog = msgs.some(m => typeof m === 'string' && m.includes('【蛊惑】') && m.includes('赠予'));
  const hasExplicitGainAnimationLog = hasBewitchGiftLog || msgs.some(m => typeof m === 'string' && (
    m.includes('【黑暗子嗣】') && m.includes('黑山羊幼仔')
  ));

  const losers = effectivePlayers.filter((p, i) => oldGs.players[i] && p.hand.length < oldGs.players[i].hand.length);
  if (!hasExplicitGainAnimationLog && losers.length === 1) {
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
      if (dest === 'discard') {
        const removedCards = getRemovedHandCards(oldGs.players[li].hand, effectivePlayers[li].hand);
        const removedSlimes = removedCards.filter(isTsathogguaSlime);
        const otherRemovedCount = Math.max(0, count - removedSlimes.length);
        if (removedSlimes.length) {
          q.push({
            type: 'TSG_SLIME_POP',
            targetPid: li,
            count: removedSlimes.length,
            cards: removedSlimes,
            msgs: (newMsgs || []).filter(m => typeof m === 'string' && (m.includes('撒托古亚的赐福黏液') || m.includes('黏液'))),
          });
        }
        const otherRemovedCards = removedCards.filter(card => !isTsathogguaSlime(card));
        if (otherRemovedCount > 0) q.push(cardTransferStep({
          fromPid: li,
          dest,
          toPid,
          count: otherRemovedCount,
          cards: otherRemovedCards.slice(0, otherRemovedCount),
          inferredHandLoss: true,
        }));
      } else {
        q.push(cardTransferStep({ fromPid: li, dest, toPid, count, ...(dest === 'discard' ? { inferredHandLoss: true } : {}) }));
      }
    }
  } else if (!hasExplicitGainAnimationLog && losers.length === 2) {
    losers.forEach(loser => {
      const li = effectivePlayers.indexOf(loser);
      const toPid = effectivePlayers.findIndex((p, j) => j !== li && oldGs.players[j] && p.hand.length > oldGs.players[j].hand.length);
      if (toPid < 0) return;
      const count = oldGs.players[li].hand.length - effectivePlayers[li].hand.length;
      q.push(cardTransferStep({ fromPid: li, dest: 'player', toPid, count }));
    });
  }

  const shuMsg = msgs.find(m => m && m.includes('【黑暗子嗣】'));
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
  // 改信直接用新神区替换旧神区，先明确展示旧神牌进入公开弃牌堆。
  (oldGs?.players || []).forEach((oldPlayer, targetPid) => {
    const nextPlayer = newGs?.players?.[targetPid];
    const oldGodCards = Array.isArray(oldPlayer?.godZone) ? oldPlayer.godZone : [];
    if (!oldPlayer?.godName || !nextPlayer?.godName || oldPlayer.godName === nextPlayer.godName || !oldGodCards.length) return;
    const finalMsgs = (Array.isArray(newGs?.log) ? newGs.log : []).slice(oldLog.length);
    const convertMsgs = finalMsgs.filter(line => typeof line === 'string' && (
      line.includes('改信新神') || line.includes('旧神牌入弃牌堆')
    ) && (!oldPlayer.name || line.includes(oldPlayer.name) || targetPid === 0));
    q.push(cardTransferStep({
      fromPid: targetPid,
      dest: 'discard',
      count: oldGodCards.length,
      cards: oldGodCards,
      sourceAnchor: 'godPower',
      effect: 'godConvertDiscard',
      durationMs: 1500,
      msgs: convertMsgs,
    }));
  });
  // Make faith/upgrade highlights explicit timeline steps. Derive them from
  // worship logs rather than player-state diffs: by the time this queue is
  // built the skill-action baseline may already reflect the new god, so a
  // state-only check would silently drop the highlight before a hunt.
  (effectivePlayers || []).forEach((player, targetPid) => {
    if (!player?.godName) return;
    const playerName = player.name || '';
    const worshipMsg = newMsgs.find(line => typeof line === 'string' && (
      (playerName && line.includes(playerName) && (line.includes('信仰') || line.includes('改信'))) ||
      (targetPid === 0 && (line.includes('你 从手牌信仰') || line.includes('你从手牌直接信仰')))
    ));
    if (worshipMsg) q.push({ type: 'GOD_HIGHLIGHT', targetPid, godKey: player.godName, msgs: [worshipMsg] });
  });
  // 同一邪神只能有一名信徒。新信徒的高亮之后，显式播放旧信徒的
  // godZone 整体进入弃牌堆，确保本地和远端都能观察到信仰被抢夺。
  (oldGs?.players || []).forEach((oldPlayer, targetPid) => {
    // Faith loss is a final settlement result. Inspection playback may use a
    // pre-inspection player snapshot as effectivePlayers, which used to hide
    // this transition on some paths. Always compare against the final state.
    const nextPlayer = newGs?.players?.[targetPid];
    const oldGodCards = Array.isArray(oldPlayer?.godZone) ? oldPlayer.godZone : [];
    const nextGodCards = Array.isArray(nextPlayer?.godZone) ? nextPlayer.godZone : [];
    if (!oldPlayer?.godName || nextPlayer?.godName || !oldGodCards.length || nextGodCards.length) return;
    const finalMsgs = (Array.isArray(newGs?.log) ? newGs.log : []).slice(oldLog.length);
    const abandonMsgs = finalMsgs.filter(line => (
      typeof line === 'string'
      && oldPlayer.name
      && line.includes(oldPlayer.name)
      && (line.includes('被邪神抛弃') || line.includes('失去信仰'))
    ));
    q.push(cardTransferStep({
      fromPid: targetPid,
      dest: 'discard',
      count: oldGodCards.length,
      cards: oldGodCards,
      sourceAnchor: 'godPower',
      effect: 'godAbandon',
      durationMs: 1500,
      msgs: abandonMsgs,
    }));
  });
  if (newGs?.apophisNight?.active) {
    const nightMsg = newMsgs.find(line => typeof line === 'string' && line.includes('【噬日灭世】黑夜降临'));
    if (nightMsg) q.push({ type: 'APOPHIS_ECLIPSE', msgs: [nightMsg] });
  }
  const randomTargetEvents = (newGs?._randomTargetEvents || []).filter(ev => ev?.seq > (oldGs?._randomTargetSeq || 0));
  const buildRandomTargetQueue = event => {
    const queue = [];
    const isThrowStone = event?.label === '投掷石块';
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
    if (isThrowStone) {
      queue.push({
        type: 'THROW_STONE',
        sourceIdx: event.sourceIdx,
        targetIdx: event.targetIdx,
        damage: event.damage || 0,
        players: newGs.players,
        msgs: [],
      });
    }
    return queue;
  };
  if (newGs.gameOver && newGs.currentTurn !== oldGs.currentTurn) {
    const dCard = newGs._aiDrawnCard || newGs._drawnCard || newGs.drawReveal?.card;
    if (dCard) {
      q.push({ type: 'YOUR_TURN', name: newGs.players[newGs.currentTurn]?.name || '???', msgs: newGs._turnStartLogs || [] });
      q.push({ type: 'DRAW_CARD', card: dCard, triggerName: newGs.players[newGs.currentTurn]?.name || '???', targetPid: newGs.currentTurn, msgs: newGs._drawLogs || [] });
    }
  }
  // 分阶段/跨回合状态偶尔会先带上已处理事件，再稍后同步标量水位。
  // 旧状态中已经存在的事件不得再次进入动画队列，否则会重播此前角色的伤害或回复。
  const oldStatSeq = Math.max(
    oldGs?._statEventSeq || 0,
    ...(oldGs?._statEvents || []).map(event => event?.seq || 0),
  );
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
  const vritraRevealSteps = buildVritraImmortalRevealSteps(oldGs, newGs, newMsgs);
  const handledCardEffectStatEvents = collectStepStatEvents(cardEffectSteps);
  const handledCardEffectStatSeqs = new Set(
    handledCardEffectStatEvents
      .map(event => event?.seq)
      .filter(seq => seq != null)
  );
  const statEventsForQueue = handledCardEffectStatSeqs.size
    ? explicitStatEvents.filter(event => !handledCardEffectStatSeqs.has(event?.seq))
    : explicitStatEvents;
  q.push(...cardEffectSteps);
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
      const hpHitIdx = effectivePlayers.reduce((acc, p, i) => { if (oldGs.players[i] && p.hp < oldGs.players[i].hp) acc.push(i); return acc; }, []);
      if (hpHitIdx.length) q.push({ type: 'HP_DAMAGE', msgs: newMsgs, hitIndices: hpHitIdx, targetStats });
      if (hpHealIdx.length) q.push({ type: 'HP_HEAL', msgs: newMsgs, hitIndices: hpHealIdx, targetStats });
      if (sanHealIdx.length) q.push({ type: 'SAN_HEAL', msgs: newMsgs, hitIndices: sanHealIdx, targetStats });
      const sanHitIdx = effectivePlayers.reduce((acc, p, i) => { if (oldGs.players[i] && p.san < oldGs.players[i].san) acc.push(i); return acc; }, []);
      if (sanHitIdx.length) q.push({ type: 'SAN_DAMAGE', msgs: newMsgs, hitIndices: sanHitIdx, targetStats });
    }
  }
  q.push(...godPowerBlockedSteps);
  q.push(...vritraRevealSteps);
  if (deathIdx.length) {
    const deathMsgs = getDeathAnimMsgs(newMsgs, effectivePlayers, deathIdx);
    q.push({ type: 'GUILLOTINE', msgs: deathMsgs, hitIndices: deathIdx, targetStats });
    q.push({ type: 'DEATH', msgs: deathMsgs, hitIndices: deathIdx, targetStats });
  }
  const moldyRoll = newGs?._moldyFoodDiceRoll;
  const moldySeq = moldyRoll?.seq ?? newGs?._moldyFoodDiceSeq;
  const oldMoldySeq = oldGs?._moldyFoodDiceSeq || oldGs?._moldyFoodDiceRoll?.seq || 0;
  const hasFreshMoldyFoodLog = newMsgs.some(line => (
    typeof line === 'string' && line.startsWith('【霉变食物】') && line.includes('掷出')
  ));
  if (
    moldyRoll &&
    moldyRoll.d1 != null &&
    hasFreshMoldyFoodLog &&
    (moldySeq == null || moldySeq > oldMoldySeq)
  ) {
    q.unshift({
      type: 'DICE_ROLL',
      diceMode: 'moldyFood',
      d1: moldyRoll.d1,
      d2: 0,
      moldySeq,
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
  q.push(...buildHandDeltaInferenceQueue({ oldGs, effectivePlayers, newMsgs }));
  return q;
}

export function buildFullHandSwapTransferQueueFromLogs(logs, players, options = {}) {
  return buildFullHandSwapStepsFromLogs(logs, players, options);
}

export function getAiPreHuntActionSteps(actionSteps = [], actionMsgs = [], huntSteps = []) {
  const messages = Array.isArray(actionMsgs) ? actionMsgs : [];
  const firstHuntLogIdx = messages.findIndex(line => (
    typeof line === 'string' && (line.includes('【追捕】') || line.includes('追捕'))
  ));
  if (firstHuntLogIdx < 0) return [];

  // buildAnimQueue compares the pre-action snapshot with the final snapshot, so
  // its inferred stat steps can cover the whole action and carry every new log.
  // Their first log may be a pre-hunt worship line even when the stat change was
  // actually produced by the hunt.  Do not replay a result already owned by the
  // explicit hunt timeline, otherwise damage jumps ahead of reticle/reveal.
  const huntStatHits = new Map();
  (Array.isArray(huntSteps) ? huntSteps : []).forEach(step => {
    if (!step?.type || !Array.isArray(step.hitIndices)) return;
    if (!huntStatHits.has(step.type)) huntStatHits.set(step.type, new Set());
    step.hitIndices.forEach(idx => huntStatHits.get(step.type).add(idx));
  });

  return (Array.isArray(actionSteps) ? actionSteps : []).filter(step => {
    const duplicateHits = huntStatHits.get(step?.type);
    if (
      duplicateHits?.size &&
      Array.isArray(step?.hitIndices) &&
      step.hitIndices.some(idx => duplicateHits.has(idx))
    ) {
      return false;
    }
    const stepLines = [
      ...(Array.isArray(step?._logChunk) ? step._logChunk : []),
      ...(Array.isArray(step?.msgs) ? step.msgs : []),
    ].filter(line => typeof line === 'string' && line.length);
    if (!stepLines.length) return false;
    const stepLogIdx = stepLines
      .map(line => messages.findIndex(message => message === line))
      .filter(idx => idx >= 0)
      .sort((a, b) => a - b)[0];
    return stepLogIdx != null && stepLogIdx < firstHuntLogIdx;
  });
}

function buildApophisTargetAnimPrefix(event, players = [], options = {}) {
  if (!event?.seq) return [];
  const includeTargetSkill = options.includeTargetSkill !== false;
  const apophisNightForAnim = event.apophisNight || null;
  const queue = [{
    type: 'DICE_ROLL',
    _apophisTargetSeq: event.seq,
    _apophisNight: apophisNightForAnim,
    diceMode: 'apophisNight',
    apophisChanged: !!event.changed,
    d1: event.roll,
    d2: 0,
    heal: 0,
    rollerName: event.actorName || players?.[event.actorIdx]?.name || '???',
    msgs: event.log ? [event.log] : [],
    _logChunk: event.log ? [event.log] : [],
  }];
  if (includeTargetSkill && event.changed && /追捕/.test(event.label || '')) {
    queue.push({ type: 'SKILL_HUNT', _apophisTargetSeq: event.seq, _apophisNight: apophisNightForAnim, targetIdx: event.targetIdx, msgs: [] });
  } else if (event.changed && /蛊惑/.test(event.label || '')) {
    queue.push({ type: 'SKILL_BEWITCH', _apophisTargetSeq: event.seq, _apophisNight: apophisNightForAnim, targetIdx: event.targetIdx, msgs: [] });
  }
  return queue;
}

export function buildAiHuntEventAnimQueue(evt, actorName) {
  const huntMsgs = Array.isArray(evt.msgs) && evt.msgs.length ? [evt.msgs[0]] : [];
  const followupMsgs = Array.isArray(evt.msgs) ? evt.msgs.slice(evt.skipIntro ? 0 : 1) : [];
  const perHuntQueue = buildApophisTargetAnimPrefix(evt.apophisTargetEvent, evt.beforePlayers, { includeTargetSkill: false });
  perHuntQueue.push(...(evt.skipIntro
    ? []
    : [{
      type: 'SKILL_HUNT',
      msgs: huntMsgs,
      _logChunk: huntMsgs,
      targetIdx: evt.targetIdx >= 0 ? evt.targetIdx : 1,
      // A turn-start draw (especially Tsathoggua slime replacement draws)
      // can leave an older hand snapshot locked while the combined AI queue
      // advances. Re-anchor every reticle to this hunt attempt's real state.
      ...(Array.isArray(evt.beforePlayers)
        ? { visualSetupPatch: { players: evt.beforePlayers } }
        : {}),
    }]));
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
