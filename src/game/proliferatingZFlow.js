import {
  ZHU_REVEAL_SOURCE,
  buildZhuRevealAbilityData,
  requestZhuReveal,
} from './zhuPower';
import { compileFreshVisualEventReplay } from './visualEventTransactionCompiler';

export function buildProliferatingZDrawFlow(stateLike, deps) {
  const {
    copyPlayers,
    localDisplayName,
    isAiSeat,
    aiDrawAndApply,
    playerDrawCard,
    drawCardDecisionText,
    hasEffectDecisionState,
    deriveEffectDecisionState,
    statePatchStep,
  } = deps;

  const queue = [...(stateLike?.proliferatingZQueue || [])];
  if (!queue.length) return { handled: false };

  const entry = queue.shift();
  const drawerIdx = entry.drawerIdx;
  if (drawerIdx == null || !stateLike.players?.[drawerIdx] || stateLike.players[drawerIdx].isDead) {
    return { handled: true, action: 'setState', state: { ...stateLike, proliferatingZQueue: queue } };
  }

  let players = copyPlayers(stateLike.players);
  let deck = [...stateLike.deck];
  let discard = [...stateLike.discard];
  const log = [...stateLike.log];
  const triggerName = localDisplayName(drawerIdx, players[drawerIdx]?.name || '该角色');
  const reasonNames = (entry.gainedCardNames || []).join('、') || '邪神牌或其衍生牌';
  log.push(`【增殖的Z】因${localDisplayName(entry.gainOwnerIdx, players[entry.gainOwnerIdx]?.name || '角色')}获得${reasonNames}，${triggerName}摸1张牌`);

  const drawBase = {
    ...stateLike,
    players,
    deck,
    discard,
    log,
    proliferatingZQueue: queue,
    abilityData: { ...(stateLike.abilityData || {}), fromProliferatingZ: true },
  };
  const zhuRequest = requestZhuReveal(drawBase, {
    deck,
    drawerIdx,
    source: ZHU_REVEAL_SOURCE.PROLIFERATING_Z,
    continuation: { remainingQueueLength: queue.length },
  });
  if (zhuRequest) {
    return {
      handled: true,
      action: 'setState',
      state: {
        ...drawBase,
        zhuLight: zhuRequest.zhuLight,
        phase: 'ZHU_HIDE_AI_DRAW',
        drawReveal: null,
        selectedCard: null,
        abilityData: buildZhuRevealAbilityData(zhuRequest, { fromProliferatingZ: true }),
      },
    };
  }
  const drawResult = isAiSeat(drawBase, drawerIdx)
    ? aiDrawAndApply(drawerIdx, players, deck, discard, drawBase)
    : playerDrawCard(players, deck, discard, drawerIdx, drawBase);

  players = drawResult.P;
  deck = drawResult.D;
  discard = drawResult.Disc;
  const drawMsg = drawResult.drawnCard ? `${triggerName} 摸到 ${drawCardDecisionText(drawResult.drawnCard)}` : '';
  const drawStep = drawResult.drawnCard
    ? [{ type: 'DRAW_CARD', card: drawResult.drawnCard, triggerName, targetPid: drawerIdx, msgs: drawMsg ? [drawMsg] : [] }]
    : [];

  if (drawResult.needGodChoice) {
    return {
      handled: true,
      action: 'triggerQueue',
      queue: drawStep,
      state: {
        ...drawBase,
        players,
        deck,
        discard,
        log,
        phase: 'GOD_CHOICE',
        abilityData: {
          ...(drawBase.abilityData || {}),
          godCard: drawResult.drawnCard,
          drawerIdx,
          godEncounterCost: drawResult.godEncounterCost,
          fromProliferatingZ: true,
        },
        drawReveal: null,
        selectedCard: null,
      },
    };
  }

  if (drawResult.needsDecision) {
    return {
      handled: true,
      action: 'triggerQueue',
      queue: drawStep,
      state: {
        ...drawBase,
        players,
        deck,
        discard,
        log,
        phase: 'DRAW_REVEAL',
        drawReveal: {
          card: drawResult.drawnCard,
          msgs: drawResult.effectMsgs || [],
          needsDecision: true,
          forcedKeep: !!drawResult.forcedKeep,
          drawerIdx,
          drawerName: players[drawerIdx]?.name,
          fromProliferatingZ: true,
        },
        abilityData: { ...(drawBase.abilityData || {}), fromProliferatingZ: true },
        selectedCard: null,
      },
    };
  }

  if (drawResult.drawnCard && drawResult.effectMsgs?.length) log.push(...drawResult.effectMsgs);
  const newGs = {
    ...drawBase,
    players,
    deck,
    discard,
    log,
    phase: 'ACTION',
    drawReveal: null,
    selectedCard: null,
    abilityData: { ...(drawBase.abilityData || {}) },
    ...(drawResult.statePatch || {}),
  };

  if (hasEffectDecisionState(drawResult.statePatch)) {
    const decisionState = deriveEffectDecisionState(drawResult.statePatch, {
      baseAbilityData: { ...(drawBase.abilityData || {}), fromProliferatingZ: true },
      fallbackPhase: 'ACTION',
      extraAbilityData: { fromProliferatingZ: true },
    });
    return {
      handled: true,
      action: 'setState',
      state: { ...newGs, phase: decisionState.phase, abilityData: decisionState.abilityData },
    };
  }

  const statQueue = compileFreshVisualEventReplay(stateLike, newGs).queue;
  return {
    handled: true,
    action: 'triggerQueueAndContinue',
    queue: [...drawStep, ...statQueue, statePatchStep({ players, discard })],
    state: newGs,
  };
}
