import { copyPlayers, makeInspectionMeta } from './coreUtils';
import { applyInspectionForSanLoss } from './effectEngine';
import { deriveEffectDecisionState } from './effectStatePatch';
import { checkWin, resolveGodEncounterForAI } from './turnEngine';
import { cardIdentity } from './cardIdentity';
import { VISUAL_EVENT } from './visualEvents';

function getPendingGodDrawEventId(gs, actorIdx, godCard) {
  const targetCardId = cardIdentity(godCard);
  if (!targetCardId) return null;
  return [...(gs?._visualEvents || [])].reverse().find(event => (
    event?.type === VISUAL_EVENT.DRAW_CARD
    && event?.playerIdx === actorIdx
    && cardIdentity(event.card) === targetCardId
  ))?.id || null;
}

/**
 * Resolve the delayed AI god-card decision without any React/UI dependencies.
 * The UI consumes the metadata to build animations; the headless runner consumes
 * the exact same next state directly.
 */
export function resolveAiGodChoiceTransition(gs) {
  const pending = gs?.abilityData || {};
  const actorIdx = pending.playerIndex;
  const godCard = pending.godCard;
  if (!gs || gs.gameOver || gs.phase !== 'AI_GOD_CHOICE' || actorIdx == null || !godCard) return null;

  let players = copyPlayers(gs.players);
  let deck = [...gs.deck];
  let discard = [...gs.discard];
  let log = [...gs.log];
  let resolveBaseGs = gs;
  if (pending.pendingEncounterInspection) {
    let inspectionMeta = makeInspectionMeta(gs);
    const inspected = applyInspectionForSanLoss(
      actorIdx,
      players[actorIdx]?.san,
      gs.currentTurn ?? actorIdx,
      players,
      deck,
      discard,
      log,
      inspectionMeta,
    );
    players = inspected.P;
    deck = inspected.D;
    discard = inspected.Disc;
    log = inspected.log;
    inspectionMeta = inspected.inspectionMeta;
    resolveBaseGs = {
      ...gs,
      players,
      deck,
      discard,
      log,
      ...inspectionMeta,
      abilityData: { ...(gs.abilityData || {}), pendingEncounterInspection: false },
      _pendingAiGodChoice: {
        ...(gs._pendingAiGodChoice || {}),
        pendingEncounterInspection: false,
      },
    };
  }

  const result = resolveGodEncounterForAI(
    actorIdx,
    godCard,
    players,
    deck,
    discard,
    resolveBaseGs,
    false,
    { drawEventId: pending.drawEventId || getPendingGodDrawEventId(gs, actorIdx, godCard) },
  );
  players = result.P;
  deck = result.D;
  discard = result.Disc;
  log.push(...(result.msgs || []));
  const decisionState = deriveEffectDecisionState({
    ...(result.inspectionMeta || {}),
    ...(result.statePatch || {}),
  }, {
    fallbackPhase: 'AI_TURN',
    turnOwner: actorIdx,
  });
  const abandonedGodGift = (result.msgs || [])
    .some(message => typeof message === 'string' && message.includes('放弃了邪神的馈赠'));
  const win = checkWin(players, gs._isMP);

  return {
    actorIdx,
    godCard,
    abandonedGodGift,
    resultMsgs: result.msgs || [],
    state: {
      ...gs,
      players,
      deck,
      discard,
      log,
      drawReveal: null,
      selectedCard: null,
      ...(result.inspectionMeta || {}),
      ...(result.statePatch || {}),
      phase: decisionState.phase,
      abilityData: decisionState.abilityData,
      _pendingAiGodChoice: undefined,
      ...(abandonedGodGift ? { _discardedDrawnCard: true } : {}),
      ...(win ? { gameOver: win } : {}),
    },
  };
}

export function resolveAiGodChoiceState(gs) {
  return resolveAiGodChoiceTransition(gs)?.state || null;
}
