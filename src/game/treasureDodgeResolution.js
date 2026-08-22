import { revealBlindDrawCard, clearBlindZoneDecisionFlag } from './blindZoneDecision';
import {
  cardLogText,
  copyPlayers,
  isWinHand,
  localTreasureWinLog,
  localTreasureWinReason,
} from './coreUtils';
import { applyFx } from './effectEngine';
import { deriveEffectDecisionState } from './effectStatePatch';
import { advanceEndTurnReplayPatch } from './endTurnReplayFlow';
import { buildTargetContinuationAbilityData } from './targetContinuation';
import { checkWin } from './turnEngine';

function createTreasureDodgeTransaction({
  gs,
  drawReveal,
  afterState,
  outcome,
  isAOE,
  drawerIdx,
  resolutionCard,
  d1,
  dodgeSuccess,
  actorLabel,
}) {
  return {
    type: 'treasureDodge',
    beforeState: gs,
    afterState,
    outcome,
    isAOE,
    drawReveal,
    drawerIdx,
    resolutionCard,
    roll: { d1, d2: 0, heal: 0, dodgeSuccess, rollerName: actorLabel },
    logDelta: (afterState?.log || []).slice((gs?.log || []).length),
  };
}

/**
 * Resolve a treasure-hunter dodge as a rule transaction.
 *
 * This function owns random-result application, card effects and continuation
 * state. It deliberately emits no animation steps; the presentation layer
 * consumes `transaction` and decides how the result is shown.
 */
export function resolveTreasureDodge(gs, drawReveal, {
  isAOE = false,
  roll,
  actorLabel,
} = {}) {
  if (!gs || !drawReveal?.card) throw new TypeError('resolveTreasureDodge requires a revealed card');
  if (!Number.isInteger(roll) || roll < 1 || roll > 6) {
    throw new TypeError('resolveTreasureDodge requires a roll from 1 to 6');
  }

  const d1 = roll;
  const dodgeSuccess = d1 >= 4;
  let P = copyPlayers(gs.players);
  let D = [...gs.deck];
  let Disc = [...gs.discard];
  const drawerIdx = isAOE ? (gs.abilityData?.drawerIdx ?? 0) : (drawReveal.drawerIdx ?? 0);
  const who = actorLabel || (drawerIdx === 0 ? '你' : P[drawerIdx]?.name || '该玩家');
  const resolutionCard = revealBlindDrawCard(drawReveal.card);
  clearBlindZoneDecisionFlag(P, drawerIdx, drawReveal);

  if (drawerIdx === 0 && P[0]?.role === '寻宝者') P[0].roleRevealed = true;

  const dodgeLog = `${who} 掷出 ${d1} 点，${dodgeSuccess ? '成功规避负面效果！' : '未能规避，触发负面效果！'}`;
  const res = isAOE
    ? applyFx(resolutionCard, drawerIdx, null, P, D, Disc, gs, false, dodgeSuccess ? [0] : [], false)
    : applyFx(resolutionCard, drawerIdx, null, P, D, Disc, gs, dodgeSuccess, [], false);

  P = res.P;
  D = res.D;
  Disc = res.Disc;
  if (!drawReveal.fromEndTurnReplay) P[drawerIdx].hand.push(resolutionCard);

  const effectPrecedesDodge = resolutionCard.type === 'albinoCreature';
  const L = [...gs.log];
  if (effectPrecedesDodge) L.push(...res.msgs, dodgeLog);
  else L.push(dodgeLog);
  if (dodgeSuccess && !isAOE) {
    L.push(`${who} 收入了 ${cardLogText(resolutionCard, { alwaysShowName: true })}（负面效果已规避）`, ...(effectPrecedesDodge ? [] : res.msgs));
  } else {
    L.push(`${who} 收入了 ${cardLogText(resolutionCard, { alwaysShowName: true })}`, ...(effectPrecedesDodge ? [] : res.msgs));
  }

  const baseResult = { P, D, Disc, L, d1, dodgeSuccess, who, resolutionCard };
  const win = checkWin(P, gs._isMP);
  if (win) {
    const winGs = { ...gs, players: P, deck: D, discard: Disc, log: L, gameOver: win, drawReveal: null, ...(res.statePatch || {}) };
    return {
      ...baseResult,
      win,
      winGs,
      transaction: createTreasureDodgeTransaction({
        gs, drawReveal, afterState: winGs, outcome: 'win', isAOE, drawerIdx,
        resolutionCard, d1, dodgeSuccess, actorLabel: who,
      }),
    };
  }

  if (drawerIdx === 0 && !P[0].isDead && P[0].role === '寻宝者' && isWinHand(P[0].hand)) {
    P[0].roleRevealed = true;
    const pendingWinGs = {
      ...gs,
      players: P,
      deck: D,
      discard: Disc,
      log: [...L, localTreasureWinLog(gs)],
      phase: 'PLAYER_WIN_PENDING',
      drawReveal: null,
      abilityData: { winReason: localTreasureWinReason(gs) },
      ...(res.statePatch || {}),
    };
    return {
      ...baseResult,
      L: pendingWinGs.log,
      pendingWinGs,
      transaction: createTreasureDodgeTransaction({
        gs, drawReveal, afterState: pendingWinGs, outcome: 'pendingWin', isAOE, drawerIdx,
        resolutionCard, d1, dodgeSuccess, actorLabel: who,
      }),
    };
  }

  const replayPatch = drawReveal.fromEndTurnReplay ? advanceEndTurnReplayPatch(gs) : {};
  const decisionState = deriveEffectDecisionState(res.statePatch, {
    baseAbilityData: gs.abilityData,
    fallbackPhase: 'ACTION',
    extraAbilityData: {
      ...(drawReveal.fromRest ? { fromRest: true } : {}),
      ...(drawReveal.fromEndTurnReplay ? { fromEndTurnReplay: true } : {}),
      ...(drawReveal.fromTsathogguaSlime ? {
        fromTsathogguaSlime: true,
        continueTurnStartDraw: true,
        _turnOwner: gs.abilityData?._turnOwner ?? drawerIdx,
      } : {}),
      ...(gs.abilityData?.cthDrawsRemaining != null ? { cthDrawsRemaining: gs.abilityData.cthDrawsRemaining } : {}),
    },
  });
  const fallbackAbilityData = {
    ...buildTargetContinuationAbilityData(gs.abilityData),
    ...(drawReveal.fromEndTurnReplay ? { fromEndTurnReplay: true } : {}),
  };
  const newGs = {
    ...gs,
    players: P,
    deck: D,
    discard: Disc,
    log: L,
    phase: decisionState.hasDecision ? decisionState.phase : 'ACTION',
    drawReveal: null,
    abilityData: decisionState.hasDecision ? decisionState.abilityData : fallbackAbilityData,
    ...(res.statePatch || {}),
    ...replayPatch,
  };
  if (decisionState.hasDecision) {
    newGs.phase = decisionState.phase;
    newGs.abilityData = decisionState.abilityData;
  }

  return {
    ...baseResult,
    newGs,
    hasDecision: decisionState.hasDecision,
    transaction: createTreasureDodgeTransaction({
      gs, drawReveal, afterState: newGs, outcome: 'resolved', isAOE, drawerIdx,
      resolutionCard, d1, dodgeSuccess, actorLabel: who,
    }),
  };
}
