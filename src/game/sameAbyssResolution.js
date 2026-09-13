import { chooseAiSameAbyssAction, getSameAbyssDiscardCount } from './aiDiscardChoices';
import { copyPlayers, isVanishingDerivedCard, makeInspectionMeta } from './coreUtils';
import { applyBalanceDiscardSideEffects } from './balanceCards';
import { applyHpDamageWithLink, applyInspectionForSanLoss, submitLossEvents } from './effectEngine';
import { buildStatChangeStatePatch } from './statChangeEngine';
import { createCardEffectEvent } from './visualEvents';
import { buildTargetContinuationAbilityData } from './targetContinuation';
import { checkWin } from './victory';
import { isAiSeat } from './rotateState';

export function resumeSameAbyssContinuation(state) {
  if (!state?._sameAbyssContinuation || state.gameOver || !['ACTION', 'AI_TURN'].includes(state.phase)) return state;
  if (state._sameAbyssContinuation.awaitingSourceDamage) {
    const pending = state._sameAbyssContinuation;
    const source = state.players[pending.actorIdx];
    const incoming = source?.isDead || source?.hand?.some(card => card.id === pending.sameAbyssIncomingCardId)
      ? 0 : pending.sameAbyssIncomingCount || 0;
    const living = state.players.map((player, index) => ({ player, index,
      count: player.hand.length + (index === pending.actorIdx ? incoming : 0) })).filter(({ player }) => !player.isDead);
    const maximum = Math.max(...living.map(({ count }) => count));
    const tied = living.filter(({ count }) => count === maximum);
    const targetIdx = tied.find(({ index }) => index !== pending.actorIdx)?.index ?? tied[0]?.index;
    return { ...state, _sameAbyssContinuation: null, phase: 'SAME_ABYSS_SELECT', abilityData: {
      ...buildTargetContinuationAbilityData(state.abilityData), ...pending,
      awaitingSourceDamage: false, type: 'sameAbyssChoice', targetIdx, forceDiscard: false,
      actorHandCount: (source?.hand?.length || 0) + incoming,
      discardCount: Math.max(0, (state.players[targetIdx]?.hand?.length || 0) - ((source?.hand?.length || 0) + incoming)),
    } };
  }
  return { ...state, phase: 'SAME_ABYSS_SELECT', abilityData: {
    ...buildTargetContinuationAbilityData(state.abilityData),
    ...state._sameAbyssContinuation, type: 'sameAbyssChoice', forceDiscard: true,
  } };
}

export function resolveSameAbyssState(gs, { choice = null, card = null } = {}) {
  let state = { ...gs, players: copyPlayers(gs.players), deck: [...(gs.deck || [])],
    discard: [...(gs.discard || [])], log: [...(gs.log || [])] };
  const ad = { ...(gs.abilityData || {}), ...(gs._sameAbyssContinuation || {}) };
  const targetIdx = ad.targetIdx;
  const actorIdx = ad.actorIdx ?? gs.currentTurn;
  if (!state.players[targetIdx]) return null;
  const turnOwner = ad._turnOwner ?? gs.currentTurn;
  const incomingCount = () => ad.sameAbyssIncomingCardId != null
    && state.players[actorIdx]?.hand?.some(held => held.id === ad.sameAbyssIncomingCardId)
    ? 0 : (ad.sameAbyssIncomingCount || 0);
  const obligation = () => getSameAbyssDiscardCount(state, targetIdx, actorIdx, { incomingCardCount: incomingCount() });
  const continuation = { ...buildTargetContinuationAbilityData(ad), actorIdx, targetIdx,
    sameAbyssIncomingCount: ad.sameAbyssIncomingCount || 0,
    sameAbyssIncomingCardId: ad.sameAbyssIncomingCardId, _turnOwner: turnOwner };
  const forced = !!(gs._sameAbyssContinuation || ad.forceDiscard);
  const selected = forced ? 'discard' : choice || chooseAiSameAbyssAction(state, targetIdx, actorIdx,
    { incomingCardCount: incomingCount() })?.type;
  const pause = damage => {
    state.phase = damage.phase;
    state.abilityData = damage.abilityData;
    if (selected === 'discard') state._sameAbyssContinuation = continuation;
    return state;
  };
  if (selected === 'discard') {
    if (!forced) state.log.push(`【同归深渊】${state.players[targetIdx].name} 选择弃置手牌`);
    while (!state.players[targetIdx].isDead && obligation() > 0) {
      const plan = chooseAiSameAbyssAction(state, targetIdx, actorIdx,
        { forceDiscard: true, incomingCardCount: incomingCount() });
      const index = plan?.cardIndices?.[0];
      if (index == null || index < 0) break;
      const beforePlayers = copyPlayers(state.players);
      const beforeDiscard = [...state.discard];
      const beforeLog = state.log.length;
      const [discarded] = state.players[targetIdx].hand.splice(index, 1);
      const vanishes = isVanishingDerivedCard(discarded);
      if (vanishes) state.log.push(`${state.players[targetIdx].name} 的衍生牌被销毁`);
      else if (discarded.type !== 'blankZone') state.discard.push(discarded);
      const afterDiscardPlayers = copyPlayers(state.players);
      const afterDiscard = [...state.discard];
      const beforeSan = state.players[targetIdx].san;
      const balance = applyBalanceDiscardSideEffects({
        players: state.players, deck: state.deck, discard: state.discard, log: state.log,
        ownerIdx: targetIdx, cards: vanishes || discarded.type === 'blankZone' ? [] : [discarded],
        reason: '同归深渊弃牌', applyHpDamage: applyHpDamageWithLink, submitDamage: submitLossEvents,
        currentTurn: state.currentTurn, statEventSeq: (state._statEventSeq || 0) + 1,
        continuation: { ...buildTargetContinuationAbilityData(ad), _turnOwner: turnOwner },
      });
      state.players = balance.players; state.deck = balance.deck; state.discard = balance.discard; state.log = balance.log;
      const damage = balance.damageDecision;
      const statEvents = damage?.statEvents || [];
      if (statEvents.length) {
        state._statEvents = [...(state._statEvents || []), ...statEvents];
        state._statEventSeq = damage.statEventSeq;
      }
      if (discarded.type !== 'blankZone') {
        const event = createCardEffectEvent({ effectKey: 'forcedRandomDiscard',
          card: card || { name: '同归深渊', type: 'sameAbyssChoice' }, actorIdx,
          beforePlayers, beforeDiscard, afterPlayers: copyPlayers(state.players), afterDiscard: [...state.discard],
          discardEvents: [{ playerIndex: targetIdx, card: discarded, afterPlayers: afterDiscardPlayers, afterDiscard }],
          statEvents, msgs: state.log.slice(beforeLog), payload: { sequentialDiscard: true },
        });
        if (event) state._visualEvents = [...(state._visualEvents || []), event];
      }
      if (damage?.phase) {
        if (beforeSan > state.players[targetIdx].san && state.players[targetIdx].san > 0 && state.players[targetIdx].san <= 6) {
          damage.abilityData.pendingSanInspection = { targetIndex: targetIdx, startIndex: state.currentTurn, reason: '同归深渊弃牌' };
        }
        return pause(damage);
      }
      if (beforeSan > state.players[targetIdx].san && !state.players[targetIdx].isDead) {
        const inspected = applyInspectionForSanLoss(targetIdx, state.players[targetIdx].san, state.currentTurn,
          state.players, state.deck, state.discard, state.log, makeInspectionMeta(state));
        state = { ...state, ...inspected.inspectionMeta, players: inspected.P, deck: inspected.D, discard: inspected.Disc, log: inspected.log };
        const pending = inspected.inspectionMeta?.abilityData;
        if (pending?.type === 'etherealizeRedirect' || pending?.type === 'tsgSlimeBalance') {
          return pause({ phase: pending.type === 'etherealizeRedirect' ? 'ETHEREALIZE_DECISION' : 'TSG_SLIME_BALANCE', abilityData: pending });
        }
      }
    }
    state.log.push(`【同归深渊】${state.players[targetIdx].name} 已完成弃牌，手牌 ${state.players[targetIdx].hand.length} 张`);
  } else {
    state.log.push(`【同归深渊】${state.players[targetIdx].name} 选择承受伤害，失去 4 HP`);
    const damage = submitLossEvents({ players: state.players, deck: state.deck, discard: state.discard, log: state.log,
      currentTurn: state.currentTurn, events: [{ targetIdx, lostHp: 4, source: '同归深渊' }],
      continuation: { ...buildTargetContinuationAbilityData(ad), _turnOwner: turnOwner },
      statEventSeq: (state._statEventSeq || 0) + 1, statEventReason: '同归深渊', statEventLogs: [state.log.at(-1)],
    });
    Object.assign(state, buildStatChangeStatePatch(state, damage));
    if (damage.phase) return pause(damage);
  }
  const win = checkWin(state.players, state._isMP);
  return { ...state, _sameAbyssContinuation: null, currentTurn: turnOwner,
    phase: state._headless || isAiSeat(state, turnOwner) ? 'AI_TURN' : 'ACTION',
    abilityData: buildTargetContinuationAbilityData(ad), ...(win ? { gameOver: win } : {}) };
}
