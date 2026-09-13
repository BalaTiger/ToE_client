import {
  canRevealForHunt,
  cardLogText,
  copyPlayers,
} from './coreUtils';
import { resolveAiHandLimitDiscards } from './aiHandLimitDiscard';
import { resolveMpTimeoutToAction } from './multiplayerTimeouts';
import {
  checkWin,
  startNextTurn,
} from './turnEngine';
import {
  createHuntRevealEvent,
  createTimedOutDrawDiscardEvent,
} from './visualEvents';
import { getBestCaveDuelCardIndex } from './caveDuel';
import { resolveAiPublicChoiceState } from './publicChoiceResolution';
import { localDisplayName } from './rotateState';

const CURRENT_TURN_PHASES = new Set([
  'DRAW_SELECT_TARGET',
  'SWAP_SELECT_TARGET',
  'SWAP_STEAL_CARD',
  'SWAP_GIVE_CARD',
  'HUNT_SELECT_TARGET',
  'HUNT_CONFIRM',
  'BEWITCH_SELECT_TARGET',
  'BEWITCH_SELECT_CARD',
  'ZONE_SWAP_SELECT_TARGET',
  'PEEK_HAND_SELECT_TARGET',
  'CAVE_DUEL_SELECT_TARGET',
  'CAVE_DUEL_SELECT_CARD',
  'ROSE_THORN_SELECT_TARGET',
  'MULTIPLY_SELECT_TARGET',
  'SHU_SELECT_TARGET',
  'FIRST_COME_PICK_SELECT',
  'SAME_ABYSS_SELECT',
  'SPHINX_GUESS',
  'GRAVE_DIG_SELECT',
  'BURY_ALIVE_SELECT',
  'TORTOISE_ORACLE_SELECT',
  'NYA_BORROW',
  'DECIPHER_STONE_CARVING',
]);

export function isMpAiTakeoverRelevant(state, takeoverIdx) {
  if (!state || takeoverIdx < 0 || state.gameOver) return false;
  const phase = state.phase;
  if (phase === 'FIRST_COME_PICK_SELECT') {
    return state.abilityData?.pickOrder?.[state.abilityData?.pickIndex || 0] === takeoverIdx;
  }
  if (phase === 'TORTOISE_ORACLE_SELECT' || phase === 'DECIPHER_STONE_CARVING') {
    return (state.abilityData?.playerIndex ?? state.currentTurn) === takeoverIdx;
  }
  if (phase === 'DRAW_REVEAL') {
    return !!state.drawReveal?.needsDecision
      && (state.drawReveal.drawerIdx ?? state.currentTurn) === takeoverIdx;
  }
  if (phase === 'GOD_CHOICE') {
    return !!state.abilityData?.godCard
      && (state.abilityData.drawerIdx ?? state.currentTurn) === takeoverIdx;
  }
  if (phase === 'HUNT_WAIT_REVEAL') {
    return state.currentTurn === takeoverIdx
      || state.abilityData?.huntTi === takeoverIdx;
  }
  if (
    phase === 'ETHEREALIZE_DECISION'
    || phase === 'ETHEREALIZE_SELECT_TARGET'
  ) {
    return state.abilityData?.targetIdx === takeoverIdx;
  }
  if (phase === 'DISCARD_PHASE' || phase === 'ACTION') {
    return state.currentTurn === takeoverIdx;
  }
  if (phase === 'CAVE_DUEL_SELECT_CARD' || phase === 'CAVE_DUEL_WAIT_REVEAL') {
    const abilityData = state.abilityData || {};
    return abilityData.caveDuelSource === takeoverIdx
      || abilityData.caveDuelTarget === takeoverIdx;
  }
  return CURRENT_TURN_PHASES.has(phase)
    && state.currentTurn === takeoverIdx;
}

export function withTimeoutDrawDiscardVisual(state, timeoutSource) {
  const drawReveal = timeoutSource?.drawReveal;
  if (
    timeoutSource?.phase !== 'DRAW_REVEAL'
    || !drawReveal?.card
    || !drawReveal.needsDecision
    || drawReveal.forcedKeep
  ) {
    return state;
  }
  const drawerIdx = drawReveal.drawerIdx ?? timeoutSource.currentTurn ?? 0;
  const event = createTimedOutDrawDiscardEvent({
    card: drawReveal.card,
    drawerIdx,
    drawerName: timeoutSource.players?.[drawerIdx]?.name
      || drawReveal.drawerName
      || '该玩家',
    beforePlayers: timeoutSource.players,
    beforeDiscard: timeoutSource.discard,
    afterDiscard: state?.discard,
  });
  if (!event) return state;
  return {
    ...state,
    _mpTimedOutDrawDiscard: event,
    _visualEvents: [event],
  };
}

function autoDiscardSeatAndAdvance(
  baseState,
  seatIdx,
  getHandLimitForPlayer
) {
  const player = baseState?.players?.[seatIdx];
  if (!player) return baseState;
  const result = resolveAiHandLimitDiscards(baseState, seatIdx, {
    handLimit: getHandLimitForPlayer(player),
  });
  const postDiscardState = {
    ...result.state,
    currentTurn: seatIdx,
    drawReveal: null,
    selectedCard: null,
    _visualEvents: [...(baseState._visualEvents || []), ...result.visualEvents],
  };
  if (result.damageDecision || postDiscardState.gameOver) return postDiscardState;
  const nextTurnState = startNextTurn({ ...postDiscardState, phase: 'ACTION', abilityData: {} });
  if (!result.visualEvents.length) return nextTurnState;
  const discardEventIds = new Set(result.visualEvents.map(event => event.id));
  return {
    ...nextTurnState,
    _visualEvents: [
      ...result.visualEvents,
      ...(nextTurnState._visualEvents || []).filter(event => !discardEventIds.has(event?.id)),
    ],
  };
}

function finishMpAiTakeoverTurn(
  baseState,
  timeoutSource,
  takeoverIdx,
  getHandLimitForPlayer
) {
  if (!baseState) return null;
  const actorIdx = baseState.currentTurn ?? takeoverIdx;
  if (!baseState.gameOver && baseState._aiPendingHandLimitThorns?.length) {
    return withTimeoutDrawDiscardVisual(
      autoDiscardSeatAndAdvance(baseState, actorIdx, getHandLimitForPlayer),
      timeoutSource
    );
  }
  const win = checkWin(baseState.players, true);
  if (win) {
    return withTimeoutDrawDiscardVisual(
      { ...baseState, gameOver: win },
      timeoutSource
    );
  }
  const actor = baseState.players?.[actorIdx];
  if (
    actor
    && ((actor.hand?.length || 0) > getHandLimitForPlayer(actor)
      || baseState._aiFinishingTurn
      || baseState._aiPendingHandLimitThorns?.length)
  ) {
    return withTimeoutDrawDiscardVisual(
      autoDiscardSeatAndAdvance(
        baseState,
        actorIdx,
        getHandLimitForPlayer
      ),
      timeoutSource
    );
  }
  return withTimeoutDrawDiscardVisual(
    startNextTurn({
      ...baseState,
      currentTurn: actorIdx,
      phase: 'ACTION',
      drawReveal: null,
      selectedCard: null,
    }),
    timeoutSource
  );
}

function autoResolveDecipherStoneCarving(baseState, actorIdx) {
  return resolveAiPublicChoiceState({
    ...baseState,
    abilityData: { ...baseState.abilityData, playerIndex: actorIdx },
  });
}

export function resolveMpAiTakeoverState(
  sourceState,
  takeoverIdx,
  {
    getHandLimitForPlayer,
    resolveCaveDuelState,
  }
) {
  if (!isMpAiTakeoverRelevant(sourceState, takeoverIdx)) return null;
  if (sourceState.players?.[takeoverIdx]?.isDead) {
    if (sourceState.currentTurn !== takeoverIdx) return null;
    if (sourceState._aiPendingHandLimitThorns?.length) {
      return autoDiscardSeatAndAdvance(sourceState, takeoverIdx, getHandLimitForPlayer);
    }
    return startNextTurn({
      ...sourceState,
      currentTurn: takeoverIdx,
      phase: 'ACTION',
      drawReveal: null,
      selectedCard: null,
      abilityData: {},
    });
  }
  const phase = sourceState.phase;
  if (phase === 'HUNT_WAIT_REVEAL') {
    if (sourceState.abilityData?.huntTi === takeoverIdx) {
      const hand = sourceState.players?.[takeoverIdx]?.hand || [];
      const actorName = localDisplayName(
        takeoverIdx,
        sourceState.players?.[takeoverIdx]?.name || '该玩家'
      );
      const revealedCard = hand.find(canRevealForHunt);
      if (!revealedCard) {
        const hunterIdx = sourceState.currentTurn ?? 0;
        const skipped = {
          ...sourceState,
          log: [
            ...(sourceState.log || []),
            `(AI接管) ${actorName} 没有可亮出的暗牌，追捕失败`,
          ],
          phase: 'ACTION',
          abilityData: {},
          currentTurn: hunterIdx,
        };
        return finishMpAiTakeoverTurn(
          skipped,
          sourceState,
          hunterIdx,
          getHandLimitForPlayer
        );
      }
      const message = `(AI接管) ${actorName} 亮出 ${cardLogText(
        revealedCard,
        { alwaysShowName: true }
      )}`;
      const event = createHuntRevealEvent({
        sourceIdx: sourceState.currentTurn ?? 0,
        targetIdx: takeoverIdx,
        card: revealedCard,
        msgs: [message],
      });
      return {
        ...sourceState,
        log: [...(sourceState.log || []), message],
        phase: 'HUNT_CONFIRM',
        abilityData: {
          ...sourceState.abilityData,
          revCard: revealedCard,
        },
        ...(event ? { _visualEvents: [event] } : { _visualEvents: [] }),
      };
    }
    const actorName = localDisplayName(
      takeoverIdx,
      sourceState.players?.[takeoverIdx]?.name || '该玩家'
    );
    const skipped = {
      ...sourceState,
      log: [
        ...(sourceState.log || []),
        `(AI接管) ${actorName} 放弃追捕`,
      ],
      phase: 'ACTION',
      abilityData: {},
    };
    return finishMpAiTakeoverTurn(
      skipped,
      sourceState,
      takeoverIdx,
      getHandLimitForPlayer
    );
  }
  if (phase === 'DISCARD_PHASE') {
    return autoDiscardSeatAndAdvance(
      sourceState,
      takeoverIdx,
      getHandLimitForPlayer
    );
  }
  if (phase === 'CAVE_DUEL_SELECT_CARD' || phase === 'CAVE_DUEL_WAIT_REVEAL') {
    const abilityData = { ...sourceState.abilityData };
    const players = copyPlayers(sourceState.players);
    const sourcePlayer = players[abilityData.caveDuelSource];
    const targetPlayer = players[abilityData.caveDuelTarget];
    const actorName = localDisplayName(
      takeoverIdx,
      sourceState.players?.[takeoverIdx]?.name || '该玩家'
    );
    if (
      takeoverIdx === abilityData.caveDuelSource
      && !abilityData.sourceCard
    ) {
      abilityData.sourceCardIndex = getBestCaveDuelCardIndex(
        sourcePlayer.hand,
        { state: sourceState, actorIdx: abilityData.caveDuelSource, opponentIdx: abilityData.caveDuelTarget }
      );
      abilityData.sourceCard = sourcePlayer.hand[
        abilityData.sourceCardIndex
      ];
    }
    if (
      takeoverIdx === abilityData.caveDuelTarget
      && !abilityData.targetCard
    ) {
      abilityData.targetCardIndex = getBestCaveDuelCardIndex(
        targetPlayer.hand,
        { state: sourceState, actorIdx: abilityData.caveDuelTarget, opponentIdx: abilityData.caveDuelSource }
      );
      abilityData.targetCard = targetPlayer.hand[
        abilityData.targetCardIndex
      ];
    }
    if (!abilityData.sourceCard || !abilityData.targetCard) {
      return {
        ...sourceState,
        players,
        abilityData,
        log: [
          ...(sourceState.log || []),
          `(AI接管) ${actorName} 已选好穴居人战争出牌`,
        ],
      };
    }
    const { nextGs } = resolveCaveDuelState(
      players,
      abilityData.caveDuelSource,
      abilityData.caveDuelTarget,
      abilityData.sourceCardIndex,
      abilityData.targetCardIndex,
      abilityData.sourceCard,
      abilityData.targetCard,
      { ...sourceState, abilityData }
    );
    return nextGs;
  }
  if (phase === 'DECIPHER_STONE_CARVING') {
    const resolved = autoResolveDecipherStoneCarving(sourceState, takeoverIdx);
    if (takeoverIdx !== sourceState.currentTurn || resolved.gameOver || !['ACTION', 'AI_TURN'].includes(resolved.phase)) return resolved;
    return finishMpAiTakeoverTurn(
      resolved,
      sourceState,
      takeoverIdx,
      getHandLimitForPlayer
    );
  }
  if (phase === 'FIRST_COME_PICK_SELECT' || phase === 'TORTOISE_ORACLE_SELECT') {
    return resolveAiPublicChoiceState(sourceState);
  }
  if (
    phase === 'DRAW_REVEAL'
    || phase === 'GOD_CHOICE'
    || phase === 'NYA_BORROW'
  ) {
    const baseState = resolveMpTimeoutToAction({
      ...sourceState,
      _mpEndTurn: undefined,
      _mpAutoDiscard: undefined,
      _mpAutoCthDecision: undefined,
    });
    return finishMpAiTakeoverTurn(
      baseState,
      sourceState,
      takeoverIdx,
      getHandLimitForPlayer
    );
  }
  if (phase === 'ACTION') {
    return finishMpAiTakeoverTurn(
      sourceState,
      sourceState,
      takeoverIdx,
      getHandLimitForPlayer
    );
  }
  const actorName = localDisplayName(
    takeoverIdx,
    sourceState.players?.[takeoverIdx]?.name || '该玩家'
  );
  const skipped = {
    ...sourceState,
    log: [
      ...(sourceState.log || []),
      `(AI接管) ${actorName} 跳过当前操作`,
    ],
    phase: 'ACTION',
    abilityData: {},
  };
  return finishMpAiTakeoverTurn(
    skipped,
    sourceState,
    takeoverIdx,
    getHandLimitForPlayer
  );
}
