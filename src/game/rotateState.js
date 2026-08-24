import { rotatePlayersArray, rotateStatEvents } from './rotateEvents';
import { getDecisionOwnerSeats, isTargetSelectionDecisionPhase } from './decisionContext';

const ROTATE_GS_TOP_LEVEL_INDEX_FIELDS = ['currentTurn'];
const ROTATE_GS_TOP_LEVEL_INDEX_ARRAY_FIELDS = ['huntAbandoned'];
const ROTATE_GAME_OVER_INDEX_FIELDS = ['winnerIdx', 'winnerIdx2'];
const ROTATE_DRAW_REVEAL_INDEX_FIELDS = ['drawerIdx'];
const ROTATE_GS_PLAYER_SNAPSHOT_FIELDS = [
  '_playersBeforeThisDraw',
  '_preTurnPlayers',
  '_earthquakeBeforePlayers',
  '_playersBeforeNextDraw',
  '_playersBeforeSkillAction',
  '_playersBeforeCthDraws',
  '_aiHandLimitBeforePlayers',
  '_inspectionBeforePlayers',
];
const ROTATE_ABILITYDATA_INDEX_FIELDS = [
  'drawerIdx',
  'swapTi',
  'huntTi',
  'huntingAI',
  'zoneSwapSource',
  'peekHandSource',
  'caveDuelSource',
  'caveDuelTarget',
  'damageLinkSource',
  'roseThornSource',
  'pickSource',
  'shuChooserIdx',
  'targetIdx',
  'redirectTargetIdx',
  'playerIndex',
  'source',
  '_turnOwner',
  'winnerIdx',
];
const ROTATE_ABILITYDATA_INDEX_ARRAY_FIELDS = [
  'peekHandTargets',
  'caveDuelTargets',
  'damageLinkTargets',
  'roseThornTargets',
  'pickOrder',
  'targets',
  'legalTargets',
  'adjacentTargets',
];

function rotateIndexedFields(obj, fields, rotateIndex) {
  if (!obj) return obj;
  let changed = false;
  const next = { ...obj };
  fields.forEach(field => {
    if (next[field] != null) {
      next[field] = rotateIndex(next[field]);
      changed = true;
    }
  });
  return changed ? next : obj;
}

function rotateIndexedArrayFields(obj, fields, rotateIndex) {
  if (!obj) return obj;
  let changed = false;
  const next = { ...obj };
  fields.forEach(field => {
    if (Array.isArray(next[field])) {
      next[field] = next[field].map(rotateIndex);
      changed = true;
    }
  });
  return changed ? next : obj;
}

function rotatePlayerSnapshotFields(obj, fields, myIndex) {
  if (!obj) return obj;
  let changed = false;
  const next = { ...obj };
  fields.forEach(field => {
    if (Array.isArray(next[field])) {
      next[field] = rotatePlayersArray(next[field], myIndex);
      changed = true;
    }
  });
  return changed ? next : obj;
}

function rotateAbilityDataForViewer(abilityData, rotateIndex, myIndex) {
  if (!abilityData) return abilityData;
  const rotatedIndices = rotateIndexedFields(abilityData, ROTATE_ABILITYDATA_INDEX_FIELDS, rotateIndex);
  const rotatedArrays = rotateIndexedArrayFields(rotatedIndices, ROTATE_ABILITYDATA_INDEX_ARRAY_FIELDS, rotateIndex);
  const rotatedChoices = Array.isArray(rotatedArrays.buryAliveChoices)
    ? { ...rotatedArrays, buryAliveChoices: rotatePlayersArray(rotatedArrays.buryAliveChoices, myIndex) }
    : rotatedArrays;
  return rotatedChoices.pendingGodChoice
    ? {
        ...rotatedChoices,
        pendingGodChoice: rotateAbilityDataForViewer(rotatedChoices.pendingGodChoice, rotateIndex, myIndex),
      }
    : rotatedChoices;
}

function rotateDecisionContinuationsForViewer(frames, rotateIndex, myIndex) {
  if (!Array.isArray(frames)) return frames;
  return frames.map(frame => ({
    ...frame,
    abilityData: rotateAbilityDataForViewer(frame?.abilityData || {}, rotateIndex, myIndex),
  }));
}

function rotateTopLevelGsFieldsForViewer(gs, rotateIndex) {
  if (!gs) return gs;
  const rotatedIndices = rotateIndexedFields(gs, ROTATE_GS_TOP_LEVEL_INDEX_FIELDS, rotateIndex);
  return rotateIndexedArrayFields(rotatedIndices, ROTATE_GS_TOP_LEVEL_INDEX_ARRAY_FIELDS, rotateIndex);
}

function rotateGameOverForViewer(gameOver, rotateIndex) {
  return rotateIndexedFields(gameOver, ROTATE_GAME_OVER_INDEX_FIELDS, rotateIndex);
}

function rotateDrawRevealForViewer(drawReveal, rotateIndex) {
  return rotateIndexedFields(drawReveal, ROTATE_DRAW_REVEAL_INDEX_FIELDS, rotateIndex);
}

function rotateZhuLightForViewer(zhuLight, rotateIndex) {
  return rotateIndexedFields(zhuLight, ['ownerIdx'], rotateIndex);
}

function rotateEarthquakeDiscardEvents(events, rotateIndex, myIndex) {
  if (!Array.isArray(events)) return events;
  return events.map(event => ({
    ...event,
    playerIndex: event.playerIndex != null ? rotateIndex(event.playerIndex) : event.playerIndex,
    afterPlayers: rotatePlayersArray(event.afterPlayers, myIndex),
  }));
}

function rotateAiHuntEvents(events, rotateIndex, myIndex) {
  if (!Array.isArray(events)) return events;
  return events.map(event => {
    const normalizedEvent = { ...event };
    delete normalizedEvent.apophisTargetEvent;
    return {
      ...normalizedEvent,
      targetIdx: event.targetIdx != null ? rotateIndex(event.targetIdx) : event.targetIdx,
      sourceIdx: event.sourceIdx != null ? rotateIndex(event.sourceIdx) : event.sourceIdx,
      hunterIdx: event.hunterIdx != null ? rotateIndex(event.hunterIdx) : event.hunterIdx,
      beforePlayers: rotatePlayersArray(event.beforePlayers, myIndex),
      afterDiscardPlayers: rotatePlayersArray(event.afterDiscardPlayers, myIndex),
      afterDamagePlayers: rotatePlayersArray(event.afterDamagePlayers, myIndex),
      afterPlayers: rotatePlayersArray(event.afterPlayers, myIndex),
      statEvents: rotateStatEvents(event.statEvents, rotateIndex, myIndex),
    };
  });
}

function rotateAnimMultiplyEvent(event, rotateIndex) {
  if (!event) return event;
  return {
    ...event,
    fromIdx: event.fromIdx != null ? rotateIndex(event.fromIdx) : event.fromIdx,
    toIdx: event.toIdx != null ? rotateIndex(event.toIdx) : event.toIdx,
  };
}

function rotateAnimSphinxReveal(event, rotateIndex, myIndex) {
  if (!event) return event;
  return {
    ...event,
    actorIdx: event.actorIdx != null ? rotateIndex(event.actorIdx) : event.actorIdx,
    playersBefore: rotatePlayersArray(event.playersBefore, myIndex),
    playersAfter: rotatePlayersArray(event.playersAfter, myIndex),
    statEvents: rotateStatEvents(event.statEvents, rotateIndex, myIndex),
  };
}

function rotateApophisTargetEvent(event, rotateIndex) {
  if (!event) return event;
  return {
    ...event,
    actorIdx: event.actorIdx != null ? rotateIndex(event.actorIdx) : event.actorIdx,
    selectedIdx: event.selectedIdx != null ? rotateIndex(event.selectedIdx) : event.selectedIdx,
    targetIdx: event.targetIdx != null ? rotateIndex(event.targetIdx) : event.targetIdx,
  };
}

function rotateTimedOutDrawDiscardEvent(event, rotateIndex) {
  if (!event) return event;
  return {
    ...event,
    drawerIdx: event.drawerIdx != null ? rotateIndex(event.drawerIdx) : event.drawerIdx,
  };
}

function rotateTsathogguaSlimePop(slimePop, rotateIndex, myIndex) {
  if (!slimePop) return slimePop;
  return {
    ...slimePop,
    playerIdx: slimePop.playerIdx != null ? rotateIndex(slimePop.playerIdx) : slimePop.playerIdx,
    targetPid: slimePop.targetPid != null ? rotateIndex(slimePop.targetPid) : slimePop.targetPid,
    playersBefore: rotatePlayersArray(slimePop.playersBefore, myIndex),
    playersAfter: rotatePlayersArray(slimePop.playersAfter, myIndex),
  };
}

function rotateGodGiftKeepEvent(event, rotateIndex, myIndex) {
  if (!event) return event;
  return {
    ...event,
    drawerIdx: event.drawerIdx != null ? rotateIndex(event.drawerIdx) : event.drawerIdx,
    playersBefore: rotatePlayersArray(event.playersBefore, myIndex),
    playersAfter: rotatePlayersArray(event.playersAfter, myIndex),
  };
}

function rotateCardEffectPayload(payload, rotateIndex, myIndex) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const rotatedIndices = rotateIndexedFields(payload, ['actorIdx', 'sourceIdx', 'targetIdx', 'playerIdx', 'drawerIdx'], rotateIndex);
  const rotatedIndexArrays = rotateIndexedArrayFields(rotatedIndices, ['targetIndices', 'hitIndices', 'targets'], rotateIndex);
  return {
    ...rotatedIndexArrays,
    players: rotatePlayersArray(rotatedIndexArrays.players, myIndex),
    beforePlayers: rotatePlayersArray(rotatedIndexArrays.beforePlayers, myIndex),
    afterPlayers: rotatePlayersArray(rotatedIndexArrays.afterPlayers, myIndex),
    discardEvents: Array.isArray(rotatedIndexArrays.discardEvents)
      ? rotateEarthquakeDiscardEvents(rotatedIndexArrays.discardEvents, rotateIndex, myIndex)
      : rotatedIndexArrays.discardEvents,
    statEvents: Array.isArray(rotatedIndexArrays.statEvents)
      ? rotateStatEvents(rotatedIndexArrays.statEvents, rotateIndex, myIndex)
      : rotatedIndexArrays.statEvents,
  };
}

function rotateCardEffectVisualEvent(event, rotateIndex, myIndex) {
  if (!event) return event;
  return {
    ...event,
    actorIdx: event.actorIdx != null ? rotateIndex(event.actorIdx) : event.actorIdx,
    beforePlayers: rotatePlayersArray(event.beforePlayers, myIndex),
    afterPlayers: rotatePlayersArray(event.afterPlayers, myIndex),
    discardEvents: Array.isArray(event.discardEvents)
      ? rotateEarthquakeDiscardEvents(event.discardEvents, rotateIndex, myIndex)
      : event.discardEvents,
    statEvents: Array.isArray(event.statEvents)
      ? rotateStatEvents(event.statEvents, rotateIndex, myIndex)
      : event.statEvents,
    payload: rotateCardEffectPayload(event.payload, rotateIndex, myIndex),
  };
}

function rotateAnimQueueStep(step, rotateIndex, myIndex) {
  if (!step) return step;
  return {
    ...step,
    targetPid: step.targetPid != null ? rotateIndex(step.targetPid) : step.targetPid,
    targetIdx: step.targetIdx != null ? rotateIndex(step.targetIdx) : step.targetIdx,
    sourceIdx: step.sourceIdx != null ? rotateIndex(step.sourceIdx) : step.sourceIdx,
    fromPid: step.fromPid != null && step.fromPid >= 0 ? rotateIndex(step.fromPid) : step.fromPid,
    toPid: step.toPid != null && step.toPid >= 0 ? rotateIndex(step.toPid) : step.toPid,
    hitIndices: Array.isArray(step.hitIndices) ? step.hitIndices.map(rotateIndex) : step.hitIndices,
    players: rotatePlayersArray(step.players, myIndex),
    beforePlayers: rotatePlayersArray(step.beforePlayers, myIndex),
    targetStats: rotatePlayersArray(step.targetStats, myIndex),
    statEvents: rotateStatEvents(step.statEvents, rotateIndex, myIndex),
    statPresentation: step.statPresentation
      ? {
        ...step.statPresentation,
        target: step.statPresentation.target != null ? rotateIndex(step.statPresentation.target) : step.statPresentation.target,
      }
      : step.statPresentation,
    beforeDiscard: Array.isArray(step.beforeDiscard) ? step.beforeDiscard : step.beforeDiscard,
    discardEvents: Array.isArray(step.discardEvents)
      ? rotateEarthquakeDiscardEvents(step.discardEvents, rotateIndex, myIndex)
      : step.discardEvents,
    visualSetupPatch: step.visualSetupPatch
      ? {
        ...step.visualSetupPatch,
        players: rotatePlayersArray(step.visualSetupPatch.players, myIndex),
      }
      : step.visualSetupPatch,
    visualTimeline: Array.isArray(step.visualTimeline)
      ? step.visualTimeline.map(item => ({
        ...item,
        patch: item?.patch
          ? { ...item.patch, players: rotatePlayersArray(item.patch.players, myIndex) }
          : item?.patch,
      }))
      : step.visualTimeline,
  };
}

function rotateEndlessCorridorReplayVisualEvent(event, rotateIndex, myIndex) {
  if (!event) return event;
  return {
    ...event,
    actorIdx: event.actorIdx != null ? rotateIndex(event.actorIdx) : event.actorIdx,
    beforePlayers: rotatePlayersArray(event.beforePlayers, myIndex),
    beforeDiscard: Array.isArray(event.beforeDiscard) ? event.beforeDiscard : event.beforeDiscard,
    zhuLight: rotateZhuLightForViewer(event.zhuLight, rotateIndex),
    queue: Array.isArray(event.queue)
      ? event.queue.map(step => rotateAnimQueueStep(step, rotateIndex, myIndex))
      : event.queue,
  };
}

function rotateBewitchEncounterState(state, rotateIndex, myIndex) {
  if (!state) return state;
  return {
    ...state,
    currentTurn: state.currentTurn != null ? rotateIndex(state.currentTurn) : state.currentTurn,
    players: rotatePlayersArray(state.players, myIndex),
    _statEvents: rotateStatEvents(state._statEvents, rotateIndex, myIndex),
  };
}

function rotateFaithExitTransition(transition, rotateIndex, myIndex) {
  if (!transition) return transition;
  return {
    ...transition,
    playerIdx: transition.playerIdx != null ? rotateIndex(transition.playerIdx) : transition.playerIdx,
    playersBefore: rotatePlayersArray(transition.playersBefore, myIndex),
    playersAfter: rotatePlayersArray(transition.playersAfter, myIndex),
    playersAfterResolution: rotatePlayersArray(transition.playersAfterResolution, myIndex),
  };
}

function rotateFaithSettlement(settlement, rotateIndex, myIndex) {
  if (!settlement) return settlement;
  return {
    ...settlement,
    previousFaithExit: rotateFaithExitTransition(settlement.previousFaithExit, rotateIndex, myIndex),
    abandonedFollowers: Array.isArray(settlement.abandonedFollowers)
      ? settlement.abandonedFollowers.map(transition => rotateFaithExitTransition(transition, rotateIndex, myIndex))
      : settlement.abandonedFollowers,
  };
}

function rotateVisualEvents(events, rotateIndex, myIndex) {
  if (!Array.isArray(events)) return events;
  return events.map(event => {
    if (event?.type === 'timedOutDrawDiscard') return rotateTimedOutDrawDiscardEvent(event, rotateIndex);
    if (event?.type === 'godGiftDiscard') return rotateTimedOutDrawDiscardEvent(event, rotateIndex);
    if (event?.type === 'godGiftKeep') return rotateGodGiftKeepEvent(event, rotateIndex, myIndex);
    if (event?.type === 'tsgSlimeGrant') {
      return {
        ...event,
        playerIdx: event.playerIdx != null ? rotateIndex(event.playerIdx) : event.playerIdx,
        ownerIdx: event.ownerIdx != null ? rotateIndex(event.ownerIdx) : event.ownerIdx,
        playersBefore: rotatePlayersArray(event.playersBefore, myIndex),
        playersAfter: rotatePlayersArray(event.playersAfter, myIndex),
      };
    }
    if (event?.type === 'earthquake' || event?.type === 'cardEffect') return rotateCardEffectVisualEvent(event, rotateIndex, myIndex);
    if (event?.type === 'endlessCorridorReplay' || event?.type === 'animTransaction') return rotateEndlessCorridorReplayVisualEvent(event, rotateIndex, myIndex);
    if (event?.type === 'turnStart' || event?.type === 'drawCard' || event?.type === 'handLimitDiscard' || event?.type === 'tsgSlimePop' || event?.type === 'godStatusChanged' || event?.type === 'graveDig') {
      return {
        ...event,
        playerIdx: event.playerIdx != null ? rotateIndex(event.playerIdx) : event.playerIdx,
        ...(event?.type === 'drawCard' && event.slimePop
          ? { slimePop: rotateTsathogguaSlimePop(event.slimePop, rotateIndex, myIndex) }
          : {}),
        ...(event?.type === 'drawCard' ? {
          playersBefore: rotatePlayersArray(event.playersBefore, myIndex),
          playersAfterKeep: rotatePlayersArray(event.playersAfterKeep, myIndex),
          playersAfterDiscard: rotatePlayersArray(event.playersAfterDiscard, myIndex),
          playersAfterResolution: rotatePlayersArray(event.playersAfterResolution, myIndex),
        } : {}),
        ...(event?.type === 'godStatusChanged' && Array.isArray(event.playersBefore)
          ? { playersBefore: rotatePlayersArray(event.playersBefore, myIndex) }
          : {}),
        ...(event?.type === 'godStatusChanged' && Array.isArray(event.playersAfter)
          ? { playersAfter: rotatePlayersArray(event.playersAfter, myIndex) }
          : {}),
        ...(event?.type === 'godStatusChanged' && event.faithSettlement
          ? { faithSettlement: rotateFaithSettlement(event.faithSettlement, rotateIndex, myIndex) }
          : {}),
        ...(event?.type === 'graveDig' && Array.isArray(event.beforePlayers)
          ? { beforePlayers: rotatePlayersArray(event.beforePlayers, myIndex) }
          : {}),
        ...(event?.type === 'graveDig' && Array.isArray(event.afterPlayers)
          ? { afterPlayers: rotatePlayersArray(event.afterPlayers, myIndex) }
          : {}),
      };
    }
    if (event?.type === 'huntResult') {
      return rotateAiHuntEvents([event], rotateIndex, myIndex)[0];
    }
    if (event?.type === 'sphinxResult') {
      return rotateAnimSphinxReveal(event, rotateIndex, myIndex);
    }
    if (event?.type === 'bewitchGift' || event?.type === 'swapCards' || event?.type === 'huntTarget' || event?.type === 'huntReveal') {
      return {
        ...event,
        sourceIdx: event.sourceIdx != null ? rotateIndex(event.sourceIdx) : event.sourceIdx,
        targetIdx: event.targetIdx != null ? rotateIndex(event.targetIdx) : event.targetIdx,
        ...(event?.type === 'bewitchGift' && event.encounterState
          ? { encounterState: rotateBewitchEncounterState(event.encounterState, rotateIndex, myIndex) }
          : {}),
        ...(event?.type === 'swapCards' && Array.isArray(event.beforePlayers)
          ? { beforePlayers: rotatePlayersArray(event.beforePlayers, myIndex) }
          : {}),
        ...(event?.type === 'swapCards' && Array.isArray(event.afterPlayers)
          ? { afterPlayers: rotatePlayersArray(event.afterPlayers, myIndex) }
          : {}),
      };
    }
    if (event?.type === 'statEvents') {
      return {
        ...event,
        statEvents: rotateStatEvents(event.statEvents, rotateIndex, myIndex),
      };
    }
    if (event?.type === 'throwStone') {
      return {
        ...event,
        sourceIdx: event.sourceIdx != null ? rotateIndex(event.sourceIdx) : event.sourceIdx,
        targetIdx: event.targetIdx != null ? rotateIndex(event.targetIdx) : event.targetIdx,
        playersBefore: rotatePlayersArray(event.playersBefore, myIndex),
        playersAfter: rotatePlayersArray(event.playersAfter, myIndex),
        statEvents: rotateStatEvents(event.statEvents, rotateIndex, myIndex),
      };
    }
    if (event?.type === 'apophisTarget') {
      return {
        ...event,
        actorIdx: event.actorIdx != null ? rotateIndex(event.actorIdx) : event.actorIdx,
        selectedIdx: event.selectedIdx != null ? rotateIndex(event.selectedIdx) : event.selectedIdx,
        targetIdx: event.targetIdx != null ? rotateIndex(event.targetIdx) : event.targetIdx,
        playersBefore: rotatePlayersArray(event.playersBefore, myIndex),
        playersAfter: rotatePlayersArray(event.playersAfter, myIndex),
        statEvents: rotateStatEvents(event.statEvents, rotateIndex, myIndex),
      };
    }
    if (event?.type === 'inspection') {
      return {
        ...event,
        target: event.target != null ? rotateIndex(event.target) : event.target,
        beforePlayers: rotatePlayersArray(event.beforePlayers, myIndex),
        afterPlayers: rotatePlayersArray(event.afterPlayers, myIndex),
        statEvents: rotateStatEvents(event.statEvents, rotateIndex, myIndex),
      };
    }
    return event;
  });
}

export function rotateGsForViewer(gs, myIndex) {
  if (!gs || myIndex === 0) return gs;
  const N = gs.players.length;
  const rotateIndex = i => (i < 0 ? i : (i - myIndex + N) % N);
  const players = rotatePlayersArray(gs.players, myIndex);
  const rotatedTopLevel = rotateTopLevelGsFieldsForViewer(gs, rotateIndex);
  const gameOver = rotateGameOverForViewer(gs.gameOver, rotateIndex);
  const drawReveal = rotateDrawRevealForViewer(gs.drawReveal, rotateIndex);
  const zhuLight = rotateZhuLightForViewer(gs.zhuLight, rotateIndex);
  const abilityData = rotateAbilityDataForViewer(gs.abilityData || {}, rotateIndex, myIndex);
  const rotatedSnapshots = rotatePlayerSnapshotFields(rotatedTopLevel, ROTATE_GS_PLAYER_SNAPSHOT_FIELDS, myIndex);
  const canonicalSnapshots = { ...rotatedSnapshots };
  delete canonicalSnapshots._inspectionEvents;
  delete canonicalSnapshots._randomTargetEvents;
  delete canonicalSnapshots._turnDrawEvents;
  delete canonicalSnapshots._tsgSlimeGrantEvents;
  return {
    ...canonicalSnapshots,
    players,
    gameOver,
    abilityData,
    ...(gs._decisionContinuations ? {
      _decisionContinuations: rotateDecisionContinuationsForViewer(gs._decisionContinuations, rotateIndex, myIndex),
    } : {}),
    drawReveal,
    zhuLight,
    ...(gs._earthquakeDiscardEvents ? { _earthquakeDiscardEvents: rotateEarthquakeDiscardEvents(gs._earthquakeDiscardEvents, rotateIndex, myIndex) } : {}),
    ...(gs._aiHuntEvents ? { _aiHuntEvents: rotateAiHuntEvents(gs._aiHuntEvents, rotateIndex, myIndex) } : {}),
    ...(gs._statEvents ? { _statEvents: rotateStatEvents(gs._statEvents, rotateIndex, myIndex) } : {}),
    ...(gs._inspectionTarget != null ? { _inspectionTarget: rotateIndex(gs._inspectionTarget) } : {}),
    ...(gs._animMultiplyEvent ? { _animMultiplyEvent: rotateAnimMultiplyEvent(gs._animMultiplyEvent, rotateIndex) } : {}),
    ...(gs._animSphinxReveal ? { _animSphinxReveal: rotateAnimSphinxReveal(gs._animSphinxReveal, rotateIndex) } : {}),
    ...(gs._apophisTargetEvent ? { _apophisTargetEvent: rotateApophisTargetEvent(gs._apophisTargetEvent, rotateIndex) } : {}),
    ...(gs._mpTimedOutDrawDiscard ? { _mpTimedOutDrawDiscard: rotateTimedOutDrawDiscardEvent(gs._mpTimedOutDrawDiscard, rotateIndex) } : {}),
    ...(gs._visualEvents ? { _visualEvents: rotateVisualEvents(gs._visualEvents, rotateIndex, myIndex) } : {}),
  };
}

export function derotateGs(gs, myIndex) {
  if (!gs || myIndex === 0) return gs;
  const N = gs.players.length;
  return rotateGsForViewer(gs, (N - myIndex) % N);
}

export function isLocalSeatIndex(idx) {
  return idx === 0;
}

export function isMultiplayerGame(gs) {
  return !!gs?._isMP;
}

export function isAiSeat(gs, idx) {
  return !isMultiplayerGame(gs) && idx != null && !isLocalSeatIndex(idx);
}

export function isLocalCurrentTurn(gs) {
  return isLocalSeatIndex(gs?.currentTurn);
}

export function isAiCurrentTurn(gs) {
  return isAiSeat(gs, gs?.currentTurn);
}

export function localDisplayName(idx, fallbackName = '该角色') {
  return isLocalSeatIndex(idx) ? '你' : fallbackName;
}

export function isLocalActorSeat(gs, idx, fallbackIdx = gs?.currentTurn) {
  return isLocalSeatIndex(idx ?? fallbackIdx);
}

export function isLocalDrawDecisionPhase(gs) {
  return gs?.phase === 'DRAW_REVEAL' && gs.drawReveal?.needsDecision && isLocalActorSeat(gs, gs.drawReveal?.drawerIdx, -1);
}

export function isLocalGodChoicePhase(gs) {
  return gs?.phase === 'GOD_CHOICE' && gs.abilityData?.godCard && isLocalActorSeat(gs, gs.abilityData?.drawerIdx);
}

export function isLocalFirstComePicker(gs) {
  const currentPickerIdx = gs?.abilityData?.pickOrder?.[gs?.abilityData?.pickIndex || 0];
  return gs?.phase === 'FIRST_COME_PICK_SELECT' && isLocalSeatIndex(currentPickerIdx);
}

export function isLocalSameAbyssTargetPhase(gs) {
  return gs?.phase === 'SAME_ABYSS_SELECT' && isLocalSeatIndex(gs?.abilityData?.targetIdx);
}

export function isLocalSphinxGuessPhase(gs) {
  return gs?.phase === 'SPHINX_GUESS' && getDecisionOwnerSeats(gs).includes(0);
}

export function isLocalDamageLinkSourcePhase(gs) {
  return gs?.phase === 'DAMAGE_LINK_SELECT_TARGET' && getDecisionOwnerSeats(gs).includes(0);
}

export function isLocalEtherealizeTargetPhase(gs) {
  return gs?.phase === 'ETHEREALIZE_SELECT_TARGET' && getDecisionOwnerSeats(gs).includes(0);
}

export function isLocalShuTargetPhase(gs) {
  return gs?.phase === 'SHU_SELECT_TARGET' && getDecisionOwnerSeats(gs).includes(0);
}

export function canLocalActOnTargetSelectionPhase(gs) {
  return isTargetSelectionDecisionPhase(gs?.phase) && getDecisionOwnerSeats(gs).includes(0);
}

export function isLocalSwapGivePhase(gs) {
  return gs?.phase === 'SWAP_GIVE_CARD' && isLocalCurrentTurn(gs);
}

export function isLocalBewitchCardPhase(gs) {
  return gs?.phase === 'BEWITCH_SELECT_CARD' && isLocalCurrentTurn(gs);
}

export function isLocalTortoiseSelectPhase(gs) {
  return gs?.phase === 'TORTOISE_ORACLE_SELECT' && getDecisionOwnerSeats(gs).includes(0);
}

export function isLocalHuntConfirmPhase(gs) {
  return gs?.phase === 'HUNT_CONFIRM' && isLocalCurrentTurn(gs);
}

export function isLocalPublicCardPickPhase(gs) {
  return gs?.phase === 'HUNT_SELECT_CARD_FROM_PUBLIC' && isLocalCurrentTurn(gs);
}

export function isLocalHuntTargetSeat(gs) {
  return isLocalSeatIndex(gs?.abilityData?.huntTi);
}

export function isLocalCaveDuelTargetSeat(gs) {
  return isLocalSeatIndex(gs?.abilityData?.caveDuelTarget);
}

export function isLocalNyaBorrowPhase(gs) {
  return gs?.phase === 'NYA_BORROW' && isLocalCurrentTurn(gs);
}

export function isLocalTreasureDodgePhase(gs) {
  return gs?.phase === 'TREASURE_DODGE_DECISION' && getDecisionOwnerSeats(gs).includes(0);
}

export function isLocalTreasureAoEDodgePhase(gs) {
  return gs?.phase === 'TREASURE_AOE_DODGE_DECISION' && getDecisionOwnerSeats(gs).includes(0);
}

export function isLocalWinnerSeat(gameOver) {
  return isLocalSeatIndex(gameOver?.winnerIdx) || isLocalSeatIndex(gameOver?.winnerIdx2);
}
