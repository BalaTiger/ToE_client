import { statEventsToAnimQueue } from './statEvents';
import {
  buildFullHandSwapStepsFromLogs,
  cardTransferStep,
  statePatchStep,
} from './animQueueHelpers';
import { buildHuntRevealStepFromVisualEvent } from './visualEvents';

// Full-hand swaps still have a dedicated presentation composer because the
// transfer contains private-card visibility rules. It consumes the resolver's
// explicit message payload; it does not compare game-state snapshots.
export function buildFullHandSwapTransferQueueFromLogs(logs, players, options = {}) {
  return buildFullHandSwapStepsFromLogs(logs, players, options);
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

export function buildAiHuntEventAnimQueue(evt, actorName, options = {}) {
  const huntMsgs = Array.isArray(evt.msgs) && evt.msgs.length ? [evt.msgs[0]] : [];
  const followupMsgs = Array.isArray(evt.msgs) ? evt.msgs.slice(evt.skipIntro ? 0 : 1) : [];
  const perHuntQueue = options.includeApophisTarget === false
    ? []
    : buildApophisTargetAnimPrefix(evt.apophisTargetEvent, evt.beforePlayers, { includeTargetSkill: false });
  perHuntQueue.push(...(evt.skipIntro
    ? []
    : [{
      type: 'SKILL_HUNT',
      msgs: huntMsgs,
      _logChunk: huntMsgs,
      targetIdx: evt.targetIdx >= 0 ? evt.targetIdx : 1,
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
  const takeFollowup = predicate => {
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
    const resultQueue = statEventsToAnimQueue(
      evt.statEvents || [],
      evt.afterDiscardPlayers || evt.beforePlayers,
      followupMsgs,
    );
    const resultWithChunks = resultQueue
      .filter(step => {
        if (evt.discardedCard && step.type === 'CARD_TRANSFER' && step.fromPid === evt.hunterIdx && step.dest === 'discard') return false;
        if (
          evt.afterPlayers[evt.targetIdx]?.isDead
          && step.type === 'CARD_TRANSFER'
          && step.fromPid === evt.targetIdx
          && step.dest === 'discard'
          && step.inferredHandLoss
        ) return false;
        return true;
      })
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
        // deferHandCommit: 战利品牌身份对旁观者不可见,无法构造转移作用域快照;
        // 手牌提交由紧随战利品弃牌之后的 STATE_PATCH(evt.afterPlayers)完成。
        perHuntQueue.push(cardTransferStep({ fromPid: evt.targetIdx, dest: 'player', toPid: evt.hunterIdx, count: cardsTaken, msgs: lootMsgs, deferHandCommit: true }));
      } else if (lootMsgs.length) {
        perHuntQueue.push({ type: 'TURN_BOUNDARY_PAUSE', _logChunk: lootMsgs });
      }
      const lootDiscardCards = (evt.lootDiscardCards || []).filter(Boolean);
      if (lootDiscardCards.length) {
        perHuntQueue.push({
          type: 'DISCARD',
          card: lootDiscardCards[0],
          cards: lootDiscardCards,
          count: lootDiscardCards.length,
          triggerName: evt.afterPlayers[evt.targetIdx]?.name || '???',
          targetPid: evt.targetIdx,
          _logChunk: discardMsgs,
        });
      }
      const defeatedGodCards = (evt.defeatedGodCards || []).filter(Boolean);
      if (defeatedGodCards.length) {
        perHuntQueue.push({
          type: 'DISCARD',
          card: defeatedGodCards[0],
          cards: defeatedGodCards,
          count: defeatedGodCards.length,
          triggerName: evt.afterPlayers[evt.targetIdx]?.name || '???',
          targetPid: evt.targetIdx,
          sourceZone: 'god',
        });
      }
      if (!cardsTaken && !lootDiscardCards.length && discardMsgs.length) {
        perHuntQueue.push({ type: 'TURN_BOUNDARY_PAUSE', _logChunk: discardMsgs });
      }
    }
    perHuntQueue.push(statePatchStep({ players: evt.afterPlayers, discard: evt.afterResultDiscard }));
  } else if (followupMsgs.length) {
    perHuntQueue.push({ type: 'TURN_BOUNDARY_PAUSE', _logChunk: [...followupMsgs] });
  }
  return perHuntQueue;
}
