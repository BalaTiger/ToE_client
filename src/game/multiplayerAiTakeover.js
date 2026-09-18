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
import { getDecisionOwnerSeats } from './decisionContext';
import { applyFx } from './effectEngine';
import { deriveEffectDecisionState } from './effectStatePatch';
import { buildTargetContinuationAbilityData, buildTargetContinuationState } from './targetContinuation';
import { settlePendingZoneIncome } from './zoneCardIncome';
import { createCardMoveVisualEvent } from './visualEvents';
import { resolveSameAbyssState, resumeSameAbyssContinuation } from './sameAbyssResolution';
import { aiStep } from './aiTurn';
import { resolveHeadlessEtherealize, resolveHeadlessSlimeBalance } from './headlessSimulator';
import { chooseAiEtherealizeRedirectTarget } from './etherealize';
import { resolveApophisTarget } from './apophisNight';

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
  if (state.abilityData?.pendingZoneIncome || ['BURY_ALIVE_SELECT', 'IGNITE_TORCH_DISCARD'].includes(phase)) {
    return getDecisionOwnerSeats(state).includes(takeoverIdx)
      || (['ACTION', 'AI_TURN'].includes(phase) && state.currentTurn === takeoverIdx);
  }
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
  // A timeout can itself enter a mandatory effect decision. Taking over the
  // turn never skips that decision or loses the card waiting outside the hand.
  if (!baseState.gameOver && !['ACTION', 'AI_TURN', 'DISCARD_PHASE'].includes(baseState.phase)) return baseState;
  baseState = settleCompletedIncome(baseState);
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

function settleCompletedIncome(state) {
  const pending = state?.abilityData?.pendingZoneIncome;
  if (!pending || (!state.gameOver && (!['ACTION', 'AI_TURN'].includes(state.phase)
    || state._decisionContinuations?.length || state._sameAbyssContinuation
    || state.abilityData?.pendingSanInspection))) return state;
  const playersBefore = copyPlayers(state.players);
  const discardBefore = [...state.discard];
  const players = copyPlayers(state.players);
  const discard = [...state.discard];
  const income = settlePendingZoneIncome(players, discard, pending);
  const { pendingZoneIncome: _settled, ...abilityData } = state.abilityData;
  const event = income && createCardMoveVisualEvent({
    from: { zone: 'drawReveal' },
    to: { zone: income.dest === 'player' ? 'hand' : 'discard', playerIdx: income.drawerIdx },
    cards: [income.card], effect: 'zoneIncome', playersBefore, playersAfter: copyPlayers(players),
    discardBefore, discardAfter: [...discard],
  });
  return { ...state, players, discard, abilityData,
    _visualEvents: [...(state._visualEvents || []), ...(event ? [event] : [])],
    gameOver: state.gameOver || checkWin(players, state._isMP),
  };
}

function finishTakeoverDecision(state) {
  if (!state) return state;
  state = resumeSameAbyssContinuation(state);
  if (state.gameOver || ['ACTION', 'AI_TURN'].includes(state.phase)) {
    state = buildTargetContinuationState({ baseState: state });
  }
  return settleCompletedIncome(state);
}

function resolveTakeoverTarget(state, takeoverIdx) {
  const ad = state.abilityData;
  const players = copyPlayers(state.players);
  const targets = (state.phase === 'ZONE_SWAP_SELECT_TARGET'
    ? players.map((player, index) => index).filter(index => index !== takeoverIdx && !players[index].isDead)
    : ad.peekHandTargets || ad.caveDuelTargets || [])
    .filter(index => players[index] && !players[index].isDead);
  if (!targets.length) return finishTakeoverDecision(buildTargetContinuationState({ baseState: state }));
  const chosen = state.phase === 'ZONE_SWAP_SELECT_TARGET'
    ? targets.reduce((best, index) => players[index].hand.length > players[best].hand.length ? index : best)
    : targets[0];
  const night = resolveApophisTarget({ gs: state, players, deck: [...state.deck], discard: [...state.discard],
    log: [...state.log], actorIdx: takeoverIdx, selectedIdx: chosen, legalTargets: targets,
    label: state.phase === 'PEEK_HAND_SELECT_TARGET' ? '选择偷看目标' : '选择区域牌目标' });
  let next = { ...state, ...night.statePatch, players: night.players, deck: night.deck, discard: night.discard, log: night.log };
  const targetIdx = night.targetIdx;
  if (state.phase === 'CAVE_DUEL_SELECT_TARGET') {
    const hand = next.players[takeoverIdx].hand;
    const cardIndex = getBestCaveDuelCardIndex(hand, { state: next, actorIdx: takeoverIdx, opponentIdx: targetIdx });
    if (cardIndex < 0) return finishTakeoverDecision(buildTargetContinuationState({ baseState: next }));
    return { ...next, phase: 'CAVE_DUEL_SELECT_CARD', abilityData: { ...ad,
      caveDuelTarget: targetIdx, sourceCardIndex: cardIndex, sourceCard: hand[cardIndex] } };
  }
  if (state.phase === 'PEEK_HAND_SELECT_TARGET') {
    const hand = next.players[targetIdx].hand;
    const card = hand[Math.floor(Math.random() * hand.length)];
    if (card) {
      const actor = next.players[takeoverIdx];
      const memory = { key: card.key, letter: card.letter ?? null, number: card.number ?? null,
        isGod: !!card.isGod, name: card.name || '' };
      actor.peekMemories = { ...actor.peekMemories,
        [targetIdx]: [memory, ...(actor.peekMemories?.[targetIdx] || []).filter(held => held.key !== memory.key)].slice(0, 4) };
      next.log.push(`${actor.name} 偷看了 ${next.players[targetIdx].name} 的一张手牌`);
    }
  } else {
    const card = ad.zoneSwapCard || ad.pendingZoneIncome?.card;
    const result = applyFx(card, takeoverIdx, targetIdx, next.players, next.deck, next.discard, next);
    next = { ...next, ...result.statePatch, players: result.P, deck: result.D, discard: result.Disc,
      log: [...next.log, ...result.msgs] };
  }
  return settleCompletedIncome(buildTargetContinuationState({ baseState: next, abilityData: ad }));
}

function resolveTakeoverBury(state, takeoverIdx) {
  const next = { ...state, players: copyPlayers(state.players), deck: [...state.deck],
    discard: [...state.discard], log: [...state.log], abilityData: { ...state.abilityData } };
  const ad = next.abilityData;
  const targets = ad.targets || [];
  const simultaneous = Array.isArray(ad.buryAliveChoices);
  if (simultaneous) {
    ad.buryAliveChoices = [...ad.buryAliveChoices];
    const card = next.players[takeoverIdx]?.hand?.[0];
    ad.buryAliveChoices[takeoverIdx] = { cardId: card?.id, cardIndex: 0 };
    if (targets.some(index => !ad.buryAliveChoices[index] && next.players[index]?.hand?.length)) return next;
  }
  const resolving = simultaneous ? targets : [targets[ad.targetIndex || 0]];
  for (const targetIdx of resolving) {
    const hand = next.players[targetIdx]?.hand || [];
    const choice = ad.buryAliveChoices?.[targetIdx];
    const matchedIndex = hand.findIndex(card => choice?.cardId != null && card.id === choice.cardId);
    const cardIndex = matchedIndex >= 0 ? matchedIndex : 0;
    if (!hand[cardIndex]) continue;
    const playersBefore = copyPlayers(next.players);
    const [card] = hand.splice(cardIndex, 1);
    next.deck.push(card);
    const message = `【活埋】${next.players[targetIdx].name} 将 ${cardLogText(card, { alwaysShowName: true })} 放到了牌堆底`;
    next.log.push(message);
    const event = createCardMoveVisualEvent({ from: { zone: 'hand', playerIdx: targetIdx },
      to: { zone: 'deckBottom' }, cards: [card], effect: 'buryAlive',
      playersBefore, playersAfter: copyPlayers(next.players), msgs: [message] });
    next._visualEvents = [...(next._visualEvents || []), event];
  }
  if (!simultaneous && (ad.targetIndex || 0) + 1 < targets.length) {
    ad.targetIndex = (ad.targetIndex || 0) + 1;
    return next;
  }
  return settleCompletedIncome(buildTargetContinuationState({ baseState: next, abilityData: ad }));
}

function autoResolveDecipherStoneCarving(baseState, actorIdx) {
  return resolveAiPublicChoiceState({
    ...baseState,
    abilityData: { ...baseState.abilityData, playerIndex: actorIdx },
  });
}

export function resolveMpAiTakeoverState(sourceState, takeoverIdx, dependencies) {
  const next = resolveMpAiTakeoverDecision(sourceState, takeoverIdx, dependencies);
  const turnOwner = sourceState?.abilityData?._turnOwner ?? sourceState?.currentTurn;
  if (sourceState?.abilityData?.pendingZoneIncome && next
    && takeoverIdx === turnOwner && next.currentTurn === turnOwner
    && ['ACTION', 'AI_TURN'].includes(next.phase) && !next.abilityData?.pendingZoneIncome) {
    return finishMpAiTakeoverTurn(next, sourceState, takeoverIdx, dependencies.getHandLimitForPlayer);
  }
  return next;
}

function resolveMpAiTakeoverDecision(
  sourceState,
  takeoverIdx,
  {
    getHandLimitForPlayer,
    resolveCaveDuelState,
  }
) {
  if (!isMpAiTakeoverRelevant(sourceState, takeoverIdx)) return null;
  if (sourceState.phase === 'BURY_ALIVE_SELECT') {
    return resolveTakeoverBury(sourceState, takeoverIdx);
  }
  if (sourceState.players?.[takeoverIdx]?.isDead
    && (!sourceState.abilityData?.pendingZoneIncome || ['ACTION', 'AI_TURN'].includes(sourceState.phase))) {
    if (sourceState.abilityData?.pendingZoneIncome) {
      if (!['ACTION', 'AI_TURN'].includes(sourceState.phase)) return sourceState;
      sourceState = settleCompletedIncome(sourceState);
    }
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
  if (['ETHEREALIZE_DECISION', 'ETHEREALIZE_SELECT_TARGET', 'TSG_SLIME_BALANCE'].includes(phase)) {
    const resolved = phase === 'TSG_SLIME_BALANCE'
      ? resolveHeadlessSlimeBalance(sourceState, false)
      : resolveHeadlessEtherealize({ ...sourceState, phase: 'ETHEREALIZE_DECISION' },
        phase === 'ETHEREALIZE_SELECT_TARGET' ? {
          useEtherealize: true,
          redirectTargetIdx: chooseAiEtherealizeRedirectTarget(sourceState.players, sourceState.abilityData.adjacentTargets || []),
        } : null);
    return finishTakeoverDecision(resolved);
  }
  if (['DAMAGE_LINK_SELECT_TARGET', 'ROSE_THORN_SELECT_TARGET'].includes(phase)) {
    const resolved = aiStep({ ...sourceState, currentTurn: takeoverIdx }, { allAi: true });
    return finishTakeoverDecision({ ...resolved, currentTurn: sourceState.abilityData._turnOwner ?? sourceState.currentTurn });
  }
  if (['ZONE_SWAP_SELECT_TARGET', 'PEEK_HAND_SELECT_TARGET', 'CAVE_DUEL_SELECT_TARGET'].includes(phase)) {
    return resolveTakeoverTarget(sourceState, takeoverIdx);
  }
  if (['IGNITE_TORCH_DISCARD', 'GRAVE_DIG_SELECT', 'SPHINX_GUESS', 'ALBINO_CREATURE_SELECT_CARD'].includes(phase)) {
    // These handlers suspend before their only mutation, so their existing AI
    // branch safely performs exactly the pending choice and its reactions.
    const ad = sourceState.abilityData;
    const actorIdx = ad.playerIndex ?? takeoverIdx;
    const fallbackCards = {
      IGNITE_TORCH_DISCARD: { name: '引燃火把', type: 'igniteTorch' },
      GRAVE_DIG_SELECT: { name: '掘墓', type: 'graveDigGod' },
      SPHINX_GUESS: { name: '斯芬克斯', type: 'sphinxGuess' },
      ALBINO_CREATURE_SELECT_CARD: { name: '白化生物', type: 'albinoCreature' },
    };
    const card = ad.pendingZoneIncome?.card || fallbackCards[phase];
    const res = applyFx(card, actorIdx, null, copyPlayers(sourceState.players),
      [...sourceState.deck], [...sourceState.discard], sourceState, false, [], true);
    const decision = deriveEffectDecisionState(res.statePatch, {
      baseAbilityData: buildTargetContinuationAbilityData(ad), turnOwner: ad._turnOwner ?? sourceState.currentTurn,
    });
    const next = { ...sourceState, ...res.statePatch, players: res.P, deck: res.D, discard: res.Disc,
      log: [...sourceState.log, ...res.msgs], phase: decision.phase, abilityData: decision.abilityData };
    return settleCompletedIncome(decision.hasDecision ? next : buildTargetContinuationState({ baseState: next, abilityData: ad }));
  }
  if (phase === 'SAME_ABYSS_SELECT') return settleCompletedIncome(resolveSameAbyssState(sourceState));
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
    return settleCompletedIncome(nextGs);
  }
  if (phase === 'DECIPHER_STONE_CARVING') {
    const resolved = settleCompletedIncome(autoResolveDecipherStoneCarving(sourceState, takeoverIdx));
    if (takeoverIdx !== sourceState.currentTurn || resolved.gameOver || !['ACTION', 'AI_TURN'].includes(resolved.phase)) return resolved;
    return finishMpAiTakeoverTurn(
      resolved,
      sourceState,
      takeoverIdx,
      getHandLimitForPlayer
    );
  }
  if (phase === 'FIRST_COME_PICK_SELECT' || phase === 'TORTOISE_ORACLE_SELECT') {
    return settleCompletedIncome(resolveAiPublicChoiceState(sourceState));
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
  // Unknown future effect decisions must retain their card and continuation.
  if (sourceState.abilityData?.pendingZoneIncome) return sourceState;
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
