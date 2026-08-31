import { appendPublicCardGainTriggers } from './cardGainEvents';
import {
  canRevealForHunt,
  cardLogText,
  copyPlayers,
  makeInspectionMeta,
} from './coreUtils';
import {
  applyHandDiscardSideEffectsWithAnim,
  discardCardsFromHandFromRight,
  splitKeptDestroyedDiscarded,
} from './handLimitDiscard';
import { resolveMpTimeoutToAction } from './multiplayerTimeouts';
import {
  applySanLossToPlayerWithInspection,
  checkWin,
  startNextTurn,
} from './turnEngine';
import {
  createHuntRevealEvent,
  createHandLimitDiscardEvent,
  createTimedOutDrawDiscardEvent,
} from './visualEvents';
import { getBestCaveDuelCardIndex } from './caveDuel';
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
  if (phase === 'CAVE_DUEL_SELECT_CARD') {
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
  const limit = getHandLimitForPlayer(player);
  const count = Math.max(0, (player.hand?.length || 0) - limit);
  let { players, discarded } = discardCardsFromHandFromRight(
    baseState.players,
    seatIdx,
    count
  );
  const {
    kept: keptDiscarded,
    destroyed: destroyedDiscarded,
    animationCards: discardAnimationCards,
  } = splitKeptDestroyedDiscarded(discarded);
  let deck = [...(baseState.deck || [])];
  let discard = [...(baseState.discard || [])];
  let log = [...(baseState.log || [])];
  const actorName = localDisplayName(
    seatIdx,
    players[seatIdx]?.name || '该玩家'
  );
  let balanceStatePatch = {};
  if (keptDiscarded.length) {
    discard = [...discard, ...keptDiscarded];
    log.push(
      `(AI接管) ${actorName} 弃置：${keptDiscarded
        .map(card => cardLogText(card, { alwaysShowName: true }))
        .join(' ')}`
    );
    const balance = applyHandDiscardSideEffectsWithAnim({
      baseGs: baseState,
      players,
      deck,
      discard,
      log,
      ownerIdx: seatIdx,
      cards: keptDiscarded,
      reason: '手牌上限弃牌',
    });
    players = balance.players;
    deck = balance.deck;
    discard = balance.discard;
    log = balance.log;
    balanceStatePatch = balance.statePatch || {};
  }
  if (destroyedDiscarded.length) {
    log.push(
      `(AI接管) ${actorName} 的衍生牌 ×${destroyedDiscarded.length} 被销毁`
    );
  }
  const handLimitDiscardEvent = discardAnimationCards.length
    ? createHandLimitDiscardEvent({
        playerIdx: seatIdx,
        playerName: players[seatIdx]?.name || '该玩家',
        cards: discardAnimationCards,
        msgs: log.slice(baseState.log?.length || 0),
        beforePlayers: baseState.players,
        beforeDiscard: baseState.discard,
        afterDiscard: discard,
      })
    : null;
  const carriedVisualEvents = Array.isArray(balanceStatePatch._visualEvents)
    ? balanceStatePatch._visualEvents
    : (baseState._visualEvents || []);
  const postDiscardState = {
    ...baseState,
    players,
    deck,
    discard,
    log,
    currentTurn: seatIdx,
    phase: 'ACTION',
    drawReveal: null,
    selectedCard: null,
    abilityData: {},
    ...balanceStatePatch,
    ...(handLimitDiscardEvent ? { _visualEvents: [...carriedVisualEvents, handLimitDiscardEvent] } : {}),
  };
  const win = checkWin(players, true);
  if (win) return { ...postDiscardState, gameOver: win };
  const nextTurnState = startNextTurn(postDiscardState);
  if (!handLimitDiscardEvent) return nextTurnState;
  const nextVisualEvents = Array.isArray(nextTurnState._visualEvents) ? nextTurnState._visualEvents : [];
  return {
    ...nextTurnState,
    _visualEvents: [
      handLimitDiscardEvent,
      ...nextVisualEvents.filter(event => event?.id !== handLimitDiscardEvent.id),
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
    && (actor.hand?.length || 0) > getHandLimitForPlayer(actor)
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
  const abilityData = baseState?.abilityData || {};
  const revealed = Array.isArray(abilityData.revealedCards)
    ? abilityData.revealedCards
    : [];
  if (!revealed.length) {
    return {
      ...baseState,
      phase: 'ACTION',
      abilityData: {},
      drawReveal: null,
      selectedCard: null,
    };
  }
  let players = copyPlayers(baseState.players);
  let deck = [...(baseState.deck || [])];
  let discard = [...(baseState.discard || [])];
  let log = [...(baseState.log || [])];
  const actorName = localDisplayName(
    actorIdx,
    players[actorIdx]?.name || '该玩家'
  );
  const handCard = revealed[0];
  const remaining = revealed.slice(1);
  players[actorIdx].hand.push(handCard);
  log.push(
    `(AI接管) 【解读石刻】${actorName} 选择将 ${cardLogText(
      handCard,
      { alwaysShowName: true }
    )} 收入手牌`
  );
  let inspectionMeta = makeInspectionMeta(baseState);
  if (handCard.isGod) {
    log.push(`【解读石刻】${actorName} 因选择邪神牌失去 1 SAN`);
    const processed = applySanLossToPlayerWithInspection(
      actorIdx,
      1,
      baseState.currentTurn ?? actorIdx,
      players,
      deck,
      discard,
      log,
      inspectionMeta,
      '解读石刻'
    );
    players = processed.P;
    deck = processed.D;
    discard = processed.Disc;
    log = processed.L;
    inspectionMeta = processed.inspectionMeta;
  }
  if (remaining.length) {
    deck.unshift(...remaining);
    log.push(`【解读石刻】${remaining.length} 张牌放回牌堆顶`);
  }
  const cardGainPatch = appendPublicCardGainTriggers(
    { ...baseState, ...inspectionMeta },
    players,
    actorIdx,
    handCard
  );
  const nextState = {
    ...baseState,
    players,
    deck,
    discard,
    log,
    phase: 'ACTION',
    abilityData: {},
    drawReveal: null,
    selectedCard: null,
    ...inspectionMeta,
    ...cardGainPatch,
  };
  const win = checkWin(players, true);
  return win ? { ...nextState, gameOver: win } : nextState;
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
  if (phase === 'CAVE_DUEL_SELECT_CARD') {
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
        sourcePlayer.hand
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
        targetPlayer.hand
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
    return finishMpAiTakeoverTurn(
      autoResolveDecipherStoneCarving(sourceState, takeoverIdx),
      sourceState,
      takeoverIdx,
      getHandLimitForPlayer
    );
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
