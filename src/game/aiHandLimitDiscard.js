import { cardLogText, copyPlayers } from './coreUtils';
import { chooseAiHandLimitDiscardIndex, getAiHandLimit } from './aiDiscardChoices';
import { applyHandDiscardSideEffectsWithAnim, splitKeptDestroyedDiscarded } from './handLimitDiscard';
import { submitLossEvents } from './effectEngine';
import { buildStatChangeStatePatch } from './statChangeEngine';
import { createHandLimitDiscardEvent, createStatEventsEvent } from './visualEvents';
import { checkWin } from './victory';
import { TURN_FLOW_STAGE } from './turnFlowStages';

/** Settle actual AI discards in order. A reaction suspends the discard stage. */
export function resolveAiHandLimitDiscards(baseGs, actorIdx, { handLimit } = {}) {
  let state = {
    ...baseGs,
    players: copyPlayers(baseGs.players || []),
    deck: [...(baseGs.deck || [])],
    discard: [...(baseGs.discard || [])],
    log: [...(baseGs.log || [])],
    currentTurn: actorIdx,
    _turnFlowStage: TURN_FLOW_STAGE.DISCARD,
    _aiFinishingTurn: true,
    skillUsed: true,
  };
  const discardedCards = [], visualEvents = [], discardMsgs = [];
  let damageDecision = null;
  const settleThorn = card => {
    const holderIdx = card?.roseThornHolderId;
    if (holderIdx == null || !state.players[holderIdx] || state.players[holderIdx].isDead) return;
    const thornMsg = `【玫瑰倒刺】${state.players[holderIdx].name} 失去标记手牌，受到 2 HP 伤害`;
    state.log.push(thornMsg);
    const thorn = submitLossEvents({
      players: state.players, deck: state.deck, discard: state.discard, log: state.log,
      currentTurn: actorIdx, events: [{ targetIdx: holderIdx, lostHp: 2, source: '玫瑰倒刺' }],
      continuation: { _turnOwner: actorIdx },
      statEventSeq: (state._statEventSeq || 0) + 1, statEventLogs: [thornMsg],
    });
    state = { ...state, ...buildStatChangeStatePatch(state, thorn) };
    if (thorn.statEvents?.length) visualEvents.push(createStatEventsEvent({ statEvents: thorn.statEvents, msgs: thorn.logs }));
    if (thorn.phase) {
      damageDecision = thorn;
      state = { ...state, phase: thorn.phase, abilityData: thorn.abilityData };
    }
  };
  const pendingThorns = [...(baseGs._aiPendingHandLimitThorns || [])];
  state._aiPendingHandLimitThorns = [];
  while (pendingThorns.length && !damageDecision) settleThorn(pendingThorns.shift());
  state._aiPendingHandLimitThorns = pendingThorns;
  const limit = handLimit ?? getAiHandLimit(state.players[actorIdx]);
  while (!damageDecision && state.players[actorIdx] && !state.players[actorIdx].isDead && state.players[actorIdx].hand.length > limit) {
    const beforePlayers = copyPlayers(state.players);
    const beforeDiscard = [...state.discard];
    // Supply the authoritative limit to the chooser without altering the real
    // player's configured limit (multiplayer can compute an adjusted limit).
    const choicePlayers = copyPlayers(state.players);
    choicePlayers[actorIdx]._nyaHandLimit = limit;
    choicePlayers[actorIdx].handLimitDecrease = 0;
    const index = chooseAiHandLimitDiscardIndex({ ...state, players: choicePlayers }, actorIdx);
    if (index < 0) break;
    const [card] = state.players[actorIdx].hand.splice(index, 1);
    const { kept, destroyed } = splitKeptDestroyedDiscarded([card]);
    state.discard.push(...kept);
    discardedCards.push(card);
    const name = state.players[actorIdx].name || '该AI';
    const msg = destroyed.length
      ? `${name} 的衍生牌被销毁`
      : `${name} 弃 ${cardLogText(card, { alwaysShowName: true })}（上限）`;
    state.log.push(msg);
    discardMsgs.push(msg);
    visualEvents.push(createHandLimitDiscardEvent({
      playerIdx: actorIdx, playerName: name, cards: [card], msgs: [msg],
      beforePlayers, beforeDiscard, afterDiscard: [...state.discard],
    }));

    const beforeStatCount = state._statEvents?.length || 0;
    const sideLogStart = state.log.length;
    const balance = applyHandDiscardSideEffectsWithAnim({
      baseGs: state, players: state.players, deck: state.deck, discard: state.discard,
      log: state.log, ownerIdx: actorIdx, cards: kept, reason: '手牌上限弃牌',
    });
    state = {
      ...state, players: balance.players, deck: balance.deck, discard: balance.discard,
      log: balance.log, ...balance.statePatch,
    };
    const balanceStats = (state._statEvents || []).slice(beforeStatCount);
    if (balanceStats.length) visualEvents.push(createStatEventsEvent({
      statEvents: balanceStats, msgs: state.log.slice(sideLogStart),
    }));
    damageDecision = balance.damageDecision?.phase ? balance.damageDecision : null;
    if (damageDecision) {
      if (card.roseThornHolderId != null) state._aiPendingHandLimitThorns.push(card);
      break;
    }
    settleThorn(card);
  }
  if (damageDecision) {
    state.phase = damageDecision.phase;
    state.abilityData = { ...(damageDecision.abilityData || {}), _turnOwner: actorIdx };
  } else {
    state.gameOver = checkWin(state.players, state._isMP) || state.gameOver;
    state._aiFinishingTurn = false;
  }
  return { state, discardedCards, discardMsgs, visualEvents: visualEvents.filter(Boolean), damageDecision };
}
