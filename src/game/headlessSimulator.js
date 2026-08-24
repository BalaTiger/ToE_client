import { aiStep } from './aiTurn';
import { resolveAiGodChoiceState } from './aiDecisionState';
import {
  appendConfirmedChainLoss,
  buildEtherealizeRedirectChainLoss,
  chooseAiEtherealizeRedirectTarget,
  collectEtherealizeChainSettleLosses,
  getNextEtherealizeChainDecision,
  shouldAiUseEtherealize,
} from './etherealize';
import {
  buildTsathogguaSlimeBalanceDecision,
  copyPlayers,
  splitHandDiscardCards,
  isTsathogguaSlime,
  killPlayerState,
  tryVritraImmortal,
  makeInspectionMeta,
} from './coreUtils';
import { createCardEffectEvent, VISUAL_EVENT } from './visualEvents';
import { applyHpDamageWithLink, applyInspectionForSanLoss, resolvePendingDamageLinkBreak, submitLossEvents } from './effectEngine';
import { deriveEffectDecisionState } from './effectStatePatch';
import { initGame } from './setup';
import {
  aiDrawAndApply,
  applySanLossToPlayerWithInspection,
  checkWin,
  startNextTurn,
} from './turnEngine';
import {
  ZHU_REVEAL_SOURCE,
  buildZhuRevealAbilityData,
  getZhuRevealDecision,
  getZhuTopGuard,
  removeZhuLightCard,
  requestZhuReveal,
} from './zhuPower';
import { buildTargetContinuationAbilityData } from './targetContinuation';
import { hasGodPowerImmunity } from './godPowerImmunity';
import { buildTurnStartDrawReplayQueue } from './turnAnimState';
import {
  buildScopedAiActionReplayState,
  getAiActionSphinxResultEvent,
  scopeAiActionReplayMetadata,
} from './aiTurnPresentation';

export const HEADLESS_TURN_OPTIONS = Object.freeze({ allAi: true });

export function createSeededRandom(seed = 1) {
  let value = Number(seed) >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function withRandomSource(random, callback) {
  const previousRandom = Math.random;
  Math.random = random;
  try {
    return callback();
  } finally {
    Math.random = previousRandom;
  }
}

export function createHeadlessGame({
  roleCounts = null,
  expansionKey = '地神的潜影',
} = {}) {
  const state = initGame(
    null,
    null,
    null,
    'auto',
    null,
    null,
    null,
    null,
    startNextTurn,
    expansionKey,
    {
      roleCounts,
      turnOptions: HEADLESS_TURN_OPTIONS,
    },
  );
  // All five seats are AI-controlled peers. Multiplayer-style win evaluation
  // avoids treating seat 0's death as the single-player-only "LOSE" result.
  return { ...state, _isMP: true, _headless: true };
}

export function resolveHeadlessSlimeBalance(gs, useSlime = false) {
  const abilityData = gs?.abilityData || {};
  const targetIdx = abilityData.targetIdx;
  if (!gs || gs.phase !== 'TSG_SLIME_BALANCE' || targetIdx == null || !gs.players?.[targetIdx]) return null;
  let P = copyPlayers(gs.players);
  let D = [...(gs.deck || [])];
  let Disc = [...(gs.discard || [])];
  let L = [...(gs.log || [])];
  const target = P[targetIdx];

  if (useSlime) {
    const slimeIdx = (target.hand || []).findIndex(card => card?.isTsathogguaSlime);
    if (slimeIdx >= 0) {
      target.hand.splice(slimeIdx, 1);
      const total = Math.max(0, Math.min(20, (abilityData.afterHp ?? target.hp) + (abilityData.afterSan ?? target.san)));
      target.hp = Math.max(0, Math.min(10, Math.ceil(total / 2)));
      target.san = Math.max(0, Math.min(10, Math.floor(total / 2)));
      L.push(`【撒托古亚的赐福黏液】${target.name} 牺牲黏液，将HP/SAN平分为 ${target.hp}/${target.san}`);
    }
  } else {
    L.push(`【撒托古亚的赐福黏液】${target.name} 没有牺牲黏液`);
  }

  const linkReaction = resolvePendingDamageLinkBreak(
    P, targetIdx, Disc, L, abilityData._turnOwner ?? gs.currentTurn, D,
    buildTargetContinuationAbilityData(abilityData),
  );
  if (linkReaction.etherealizeDecision) {
    return {
      ...gs,
      players: P,
      deck: D,
      discard: Disc,
      log: L,
      phase: 'ETHEREALIZE_DECISION',
      abilityData: linkReaction.etherealizeDecision,
    };
  }
  if (linkReaction.applied) {
    const chainedSlimeDecision = buildTsathogguaSlimeBalanceDecision(linkReaction.beforePlayers, P, {
      ...buildTargetContinuationAbilityData(abilityData),
      _turnOwner: abilityData._turnOwner ?? gs.currentTurn,
      pendingSanInspection: abilityData.pendingSanInspection,
    });
    if (chainedSlimeDecision) {
      return {
        ...gs,
        players: P,
        deck: D,
        discard: Disc,
        log: L,
        phase: 'TSG_SLIME_BALANCE',
        abilityData: chainedSlimeDecision,
      };
    }
  }
  const queuedSlimeDecisions = abilityData.pendingSlimeBalanceDecisions || [];
  if (queuedSlimeDecisions.length) {
    const [nextSlimeDecision, ...remainingSlimeDecisions] = queuedSlimeDecisions;
    const queuedContinuation = buildTargetContinuationAbilityData(abilityData);
    delete queuedContinuation.pendingSlimeBalanceDecisions;
    return {
      ...gs,
      players: P,
      deck: D,
      discard: Disc,
      log: L,
      phase: 'TSG_SLIME_BALANCE',
      abilityData: {
        ...queuedContinuation,
        ...nextSlimeDecision,
        ...(remainingSlimeDecisions.length ? { pendingSlimeBalanceDecisions: remainingSlimeDecisions } : {}),
      },
    };
  }

  let inspectionPatch = {};
  let win = checkWin(P, gs._isMP);
  const pendingSanInspection = abilityData.pendingSanInspection;
  if (!win && pendingSanInspection && P[targetIdx] && !P[targetIdx].isDead) {
    const inspectionMeta = makeInspectionMeta({ ...gs, players: P, deck: D, discard: Disc, log: L });
    const processed = applyInspectionForSanLoss(
      pendingSanInspection.targetIndex ?? targetIdx,
      P[pendingSanInspection.targetIndex ?? targetIdx]?.san,
      pendingSanInspection.startIndex ?? (abilityData._turnOwner ?? gs.currentTurn),
      P,
      D,
      Disc,
      L,
      inspectionMeta,
    );
    P = processed.P;
    D = processed.D;
    Disc = processed.Disc;
    L = processed.log;
    inspectionPatch = processed.inspectionMeta || {};
    win = checkWin(P, gs._isMP);
  }
  if (!win) P.forEach((player, idx) => {
    if (player && !player.isDead && player.hp <= 0) {
      if (!tryVritraImmortal(P, idx, abilityData._turnOwner ?? gs.currentTurn, D, Disc, L)) killPlayerState(P, idx, Disc, L);
    }
  });
  win ||= checkWin(P, gs._isMP);

  const turnOwner = abilityData._turnOwner ?? gs.currentTurn;
  return {
    ...gs,
    ...inspectionPatch,
    players: P,
    deck: D,
    discard: Disc,
    log: L,
    currentTurn: turnOwner,
    phase: 'AI_TURN',
    abilityData: buildTargetContinuationAbilityData({ ...abilityData, pendingSanInspection: null }),
    ...(win ? { gameOver: win } : {}),
  };
}

export function continueHeadlessTurnStartDraw(gs) {
  if (!gs?.abilityData?.continueTurnStartDraw) return null;
  let P = copyPlayers(gs.players);
  let D = [...gs.deck];
  let Disc = [...gs.discard];
  let L = [...gs.log];
  const abilityData = gs.abilityData || {};
  const drawerIdx = Number.isInteger(abilityData._turnOwner) ? abilityData._turnOwner : gs.currentTurn;
  const extraDrawReady = !!abilityData._tsgExtraDrawReady;
  if (!extraDrawReady) {
    const drawer = P[drawerIdx];
    const slimeIdx = drawer
      && !drawer.isDead
      && drawer.godName === 'TSG'
      && (drawer.godLevel || 0) > 0
      && !hasGodPowerImmunity(drawer)
      ? (drawer.hand || []).findIndex(isTsathogguaSlime)
      : -1;
    if (slimeIdx >= 0) {
      drawer.hand.splice(slimeIdx, 1);
      return {
        ...gs,
        players: P,
        log: L,
        phase: 'AI_TURN',
        abilityData: {
          ...abilityData,
          _turnOwner: drawerIdx,
          fromTsathogguaSlime: true,
          continueTurnStartDraw: true,
          _tsgExtraDrawReady: true,
          pendingTsathogguaSlime: undefined,
          pendingTsathogguaSlimes: undefined,
        },
      };
    }
  }

  const continuingSlime = extraDrawReady;
  const zhuRequest = requestZhuReveal({ ...gs, players: P, deck: D, currentTurn: drawerIdx }, {
    deck: D,
    drawerIdx,
    source: continuingSlime ? ZHU_REVEAL_SOURCE.TSG_SLIME : ZHU_REVEAL_SOURCE.TURN_DRAW,
    continuation: continuingSlime
      ? { continueTurnStartDraw: true, extraDrawReady: true, turnOwner: drawerIdx }
      : null,
  });
  if (zhuRequest) {
    return {
      ...gs,
      players: P,
      deck: D,
      discard: Disc,
      log: L,
      currentTurn: drawerIdx,
      zhuLight: zhuRequest.zhuLight,
      phase: 'ZHU_HIDE_AI_DRAW',
      abilityData: buildZhuRevealAbilityData(zhuRequest, continuingSlime ? {
        fromTsathogguaSlime: true,
        continueTurnStartDraw: true,
        _tsgExtraDrawReady: true,
        _turnOwner: drawerIdx,
      } : {}),
    };
  }
  const res = aiDrawAndApply(drawerIdx, P, D, Disc, {
    ...gs,
    currentTurn: drawerIdx,
    deferAiGodChoice: true,
  });
  P = res.P;
  D = res.D;
  Disc = res.Disc;
  if (res.effectMsgs?.length) L.push(...res.effectMsgs);
  const continuationAbility = continuingSlime ? {
    fromTsathogguaSlime: true,
    continueTurnStartDraw: true,
    _turnOwner: drawerIdx,
  } : {};
  const base = {
    ...gs,
    ...(res.statePatch || {}),
    players: P,
    deck: D,
    discard: Disc,
    log: L,
    currentTurn: drawerIdx,
    _aiDrawnCard: res.drawnCard ?? null,
    _drawnCard: res.drawnCard ?? null,
    _discardedDrawnCard: !!res.discardedDrawnCard,
  };
  const pendingAiGodChoice = res.pendingAiGodChoice || res.statePatch?._pendingAiGodChoice || null;
  if (pendingAiGodChoice) {
    return {
      ...base,
      phase: 'AI_GOD_CHOICE',
      abilityData: { ...pendingAiGodChoice, ...continuationAbility },
    };
  }
  const win = checkWin(P, gs._isMP);
  if (win) return { ...base, phase: 'AI_TURN', abilityData: {}, gameOver: win };
  const decisionState = deriveEffectDecisionState(res.statePatch, { fallbackPhase: 'AI_TURN' });
  return {
    ...base,
    phase: decisionState.phase,
    abilityData: { ...decisionState.abilityData, ...continuationAbility },
  };
}

export function resolveHeadlessZhuDraw(gs) {
  if (!gs || gs.phase !== 'ZHU_HIDE_AI_DRAW') return null;
  const guard = gs.abilityData?.zhuGuard || getZhuTopGuard(gs, gs.deck);
  const card = guard?.card || gs.deck?.[0];
  if (!card) return null;
  const zhuDecision = getZhuRevealDecision(gs);
  const drawerIdx = zhuDecision?.drawerIdx ?? gs.abilityData?.drawerIdx ?? gs.currentTurn ?? 0;
  const nextZhuLight = removeZhuLightCard(gs.zhuLight, card);
  let P = copyPlayers(gs.players);
  let D = [...gs.deck];
  let Disc = [...gs.discard];
  const res = aiDrawAndApply(drawerIdx, P, D, Disc, {
    ...gs,
    zhuLight: nextZhuLight,
    _zhuBypassTopGuard: true,
    deferAiGodChoice: true,
  });
  P = res.P;
  D = res.D;
  Disc = res.Disc;
  const L = [...gs.log, ...(res.effectMsgs || [])];
  const pendingAiGodChoice = res.pendingAiGodChoice || res.statePatch?._pendingAiGodChoice || null;
  const decisionState = deriveEffectDecisionState(res.statePatch, { fallbackPhase: 'AI_TURN' });
  const continuation = zhuDecision?.continuation || {};
  const continuationAbility = zhuDecision?.source === ZHU_REVEAL_SOURCE.TSG_SLIME
    ? {
      fromTsathogguaSlime: true,
      continueTurnStartDraw: continuation.continueTurnStartDraw !== false,
      _turnOwner: continuation.turnOwner ?? drawerIdx,
    }
    : (zhuDecision?.source === ZHU_REVEAL_SOURCE.CTH_REST
      ? { fromRest: true, cthDrawsRemaining: Math.max(0, (continuation.remaining || 0) - 1) }
      : (zhuDecision?.source === ZHU_REVEAL_SOURCE.PROLIFERATING_Z
        ? { fromProliferatingZ: true }
        : {}));
  const win = checkWin(P, gs._isMP);
  return {
    ...gs,
    ...(res.statePatch || {}),
    players: P,
    deck: D,
    discard: Disc,
    log: L,
    zhuLight: nextZhuLight,
    phase: pendingAiGodChoice ? 'AI_GOD_CHOICE' : decisionState.phase,
    abilityData: { ...(pendingAiGodChoice || decisionState.abilityData), ...continuationAbility },
    drawReveal: null,
    selectedCard: null,
    _aiDrawnCard: res.drawnCard ?? null,
    _drawnCard: res.drawnCard ?? null,
    _discardedDrawnCard: !!res.discardedDrawnCard,
    ...(win ? { gameOver: win } : {}),
  };
}

function applyHeadlessLoss(gs, loss, state) {
  let { P, D, Disc, L, inspectionMeta } = state;
  const turnOwner = gs.abilityData?._turnOwner ?? gs.currentTurn;
  if ((loss.lostHp || 0) > 0) {
    applyHpDamageWithLink(P, loss.targetIdx, loss.lostHp, Disc, L, turnOwner, D);
  }
  if ((loss.lostSan || 0) > 0 && P[loss.targetIdx] && !P[loss.targetIdx].isDead) {
    const processed = applySanLossToPlayerWithInspection(
      loss.targetIdx,
      loss.lostSan,
      turnOwner,
      P,
      D,
      Disc,
      L,
      inspectionMeta,
      loss.source || '伤害结算',
      { skipEtherealize: true },
    );
    P = processed.P;
    D = processed.D;
    Disc = processed.Disc;
    L = processed.L;
    inspectionMeta = processed.inspectionMeta;
  }
  return { P, D, Disc, L, inspectionMeta };
}

export function resolveHeadlessEtherealize(gs) {
  if (!gs || gs.phase !== 'ETHEREALIZE_DECISION') return null;
  let P = copyPlayers(gs.players);
  let abilityData = { ...(gs.abilityData || {}) };
  const sourceIdx = abilityData.targetIdx;
  const source = P[sourceIdx];
  const useEtherealize = shouldAiUseEtherealize({
    player: source,
    lostHp: abilityData.lostHp || 0,
    lostSan: abilityData.lostSan || 0,
  });
  let finalTargetIdx = sourceIdx;
  let recursionLoss = null;
  if (useEtherealize) {
    const redirectTargetIdx = chooseAiEtherealizeRedirectTarget(P, abilityData.adjacentTargets || []);
    if (redirectTargetIdx != null) {
      source.etherealizeStacks = Math.max(0, (source.etherealizeStacks || 0) - 1);
      finalTargetIdx = redirectTargetIdx;
      recursionLoss = buildEtherealizeRedirectChainLoss({
        players: P,
        sourceIdx,
        redirectTargetIdx,
        lostHp: abilityData.lostHp || 0,
        lostSan: abilityData.lostSan || 0,
        currentTurn: gs.currentTurn,
        order: abilityData.order,
      });
    }
  }
  abilityData = recursionLoss
    ? {
      ...abilityData,
      pendingLosses: [...(abilityData.pendingLosses || []), recursionLoss],
    }
    : appendConfirmedChainLoss(abilityData, {
      targetIdx: finalTargetIdx,
      lostHp: abilityData.lostHp || 0,
      lostSan: abilityData.lostSan || 0,
      source: useEtherealize ? '半物质化' : (abilityData.source || '伤害'),
      order: abilityData.order,
    });

  const nextDecision = getNextEtherealizeChainDecision(
    abilityData,
    P,
    abilityData.pendingIndex ?? 0,
  );
  if (nextDecision) {
    return { ...gs, players: P, phase: 'ETHEREALIZE_DECISION', abilityData: nextDecision };
  }

  const beforeSettlePlayers = copyPlayers(P);
  let state = {
    P,
    D: [...gs.deck],
    Disc: [...gs.discard],
    L: [...gs.log],
    inspectionMeta: makeInspectionMeta(gs),
  };
  collectEtherealizeChainSettleLosses(abilityData)
    .forEach(loss => { state = applyHeadlessLoss(gs, loss, state); });
  const turnOwner = abilityData._turnOwner ?? gs.currentTurn;
  const pendingLinkTarget = state.P.findIndex(player => (
    player?._pendingDamageLinkBreak && !(player.hand || []).some(isTsathogguaSlime)
  ));
  if (pendingLinkTarget >= 0) {
    const linkReaction = resolvePendingDamageLinkBreak(
      state.P,
      pendingLinkTarget,
      state.Disc,
      state.L,
      turnOwner,
      state.D,
      buildTargetContinuationAbilityData(abilityData),
    );
    if (linkReaction.etherealizeDecision) {
      return {
        ...gs,
        players: state.P,
        deck: state.D,
        discard: state.Disc,
        log: state.L,
        phase: 'ETHEREALIZE_DECISION',
        abilityData: linkReaction.etherealizeDecision,
      };
    }
  }
  const slimeDecision = buildTsathogguaSlimeBalanceDecision(beforeSettlePlayers, state.P, {
    ...buildTargetContinuationAbilityData(abilityData),
    _turnOwner: turnOwner,
  });
  const win = slimeDecision ? null : checkWin(state.P, gs._isMP);
  return {
    ...gs,
    ...(state.inspectionMeta || {}),
    players: state.P,
    deck: state.D,
    discard: state.Disc,
    log: state.L,
    currentTurn: turnOwner,
    phase: slimeDecision ? 'TSG_SLIME_BALANCE' : 'AI_TURN',
    abilityData: slimeDecision
      ? { ...buildTargetContinuationAbilityData(abilityData), ...slimeDecision }
      : buildTargetContinuationAbilityData(abilityData),
    ...(win ? { gameOver: win } : {}),
  };
}

export function resolveHeadlessSameAbyss(gs) {
  if (!gs || gs.phase !== 'SAME_ABYSS_SELECT') return null;
  const { targetIdx, actorHandCount = 0, discardCount = 0 } = gs.abilityData || {};
  let P = copyPlayers(gs.players);
  const D = [...gs.deck];
  const Disc = [...gs.discard];
  const L = [...gs.log];
  const target = P[targetIdx];
  if (!target) return null;
  const beforeLossPlayers = copyPlayers(P);
  const beforeLossDiscard = [...Disc];
  const discardEvents = [];

  const canDiscard = discardCount > 0 && target.hand.length > actorHandCount;
  if (canDiscard) {
    for (let count = 0; count < discardCount && target.hand.length > actorHandCount; count++) {
      const card = target.hand.shift();
      const { kept, destroyed } = splitHandDiscardCards([card]);
      if (card?.type !== 'blankZone') {
        Disc.push(...kept);
        if (destroyed.length) L.push(`${target.name} 的衍生牌被销毁`);
        discardEvents.push({
          playerIndex: targetIdx,
          card,
          afterPlayers: copyPlayers(P),
          afterDiscard: [...Disc],
        });
      }
    }
    L.push(`【同归深渊】${target.name} 选择弃置手牌至 ${actorHandCount} 张`);
  } else {
    L.push(`【同归深渊】${target.name} 选择承受伤害，失去 4 HP`);
    const damage = submitLossEvents({
      players: P, deck: D, discard: Disc, log: L, currentTurn: gs.currentTurn,
      events: [{ targetIdx, lostHp: 4, source: '同归深渊' }],
      continuation: { _turnOwner: gs.abilityData?._turnOwner ?? gs.currentTurn },
    });
    if (damage.phase) {
      return {
        ...gs,
        players: P,
        deck: D,
        discard: Disc,
        log: L,
        phase: damage.phase,
        abilityData: damage.abilityData,
      };
    }
  }

  const win = checkWin(P, gs._isMP);
  const turnOwner = gs.abilityData?._turnOwner ?? gs.currentTurn;
  const slimeDecision = win
    ? null
    : buildTsathogguaSlimeBalanceDecision(beforeLossPlayers, P, { _turnOwner: turnOwner });
  const discardEvent = discardEvents.length ? createCardEffectEvent({
    effectKey: 'forcedRandomDiscard',
    card: { name: '同归深渊', type: 'sameAbyssChoice' },
    actorIdx: gs.abilityData?.actorIdx ?? gs.currentTurn,
    beforePlayers: beforeLossPlayers,
    beforeDiscard: beforeLossDiscard,
    afterPlayers: copyPlayers(P),
    afterDiscard: [...Disc],
    discardEvents,
    msgs: L.slice(gs.log.length),
  }) : null;
  return {
    ...gs,
    players: P,
    deck: D,
    discard: Disc,
    log: L,
    currentTurn: turnOwner,
    phase: slimeDecision ? 'TSG_SLIME_BALANCE' : 'AI_TURN',
    abilityData: slimeDecision || {},
    ...(discardEvent ? { _visualEvents: [...(gs._visualEvents || []), discardEvent] } : {}),
    ...(win ? { gameOver: win } : {}),
  };
}

export function advanceHeadlessGame(gs) {
  if (!gs || gs.gameOver) return { state: gs, status: 'terminal' };
  if (gs.abilityData?.continueTurnStartDraw && gs.phase === 'AI_TURN') {
    return { state: continueHeadlessTurnStartDraw(gs), status: 'advanced' };
  }
  if (gs.phase === 'AI_TURN') {
    return { state: aiStep(gs, HEADLESS_TURN_OPTIONS), status: 'advanced' };
  }
  if (gs.phase === 'AI_GOD_CHOICE') {
    const state = resolveAiGodChoiceState(gs);
    return state
      ? { state, status: 'advanced' }
      : { state: gs, status: 'unresolved', phase: gs.phase };
  }
  if (['DAMAGE_LINK_SELECT_TARGET', 'CAVE_DUEL_SELECT_TARGET', 'PEEK_HAND_SELECT_TARGET', 'ROSE_THORN_SELECT_TARGET'].includes(gs.phase)) {
    return { state: aiStep(gs, HEADLESS_TURN_OPTIONS), status: 'advanced' };
  }
  if (gs.phase === 'TSG_SLIME_BALANCE') {
    return { state: resolveHeadlessSlimeBalance(gs, false), status: 'advanced' };
  }
  if (gs.phase === 'ZHU_HIDE_AI_DRAW') {
    return { state: resolveHeadlessZhuDraw(gs), status: 'advanced' };
  }
  if (gs.phase === 'ETHEREALIZE_DECISION') {
    return { state: resolveHeadlessEtherealize(gs), status: 'advanced' };
  }
  if (gs.phase === 'SAME_ABYSS_SELECT') {
    return { state: resolveHeadlessSameAbyss(gs), status: 'advanced' };
  }
  if (gs.phase === 'ZONE_SWAP_SELECT_TARGET') {
    return {
      state: {
        ...gs,
        currentTurn: gs.abilityData?._turnOwner ?? gs.currentTurn,
        phase: 'AI_TURN',
        abilityData: buildTargetContinuationAbilityData(gs.abilityData),
      },
      status: 'advanced',
    };
  }
  return { state: gs, status: 'unresolved', phase: gs.phase };
}

function getHeadlessProgressKey(state) {
  return JSON.stringify({
    turn: state?.turn,
    currentTurn: state?.currentTurn,
    phase: state?.phase,
    abilityData: state?.abilityData,
    skillUsed: state?.skillUsed,
    restUsed: state?.restUsed,
    multiplyUsed: state?.multiplyUsed,
    huntAbandoned: state?.huntAbandoned,
    deck: state?.deck?.length,
    discard: state?.discard?.length,
    log: state?.log?.length,
    players: state?.players?.map(player => ({
      hp: player.hp,
      san: player.san,
      dead: player.isDead,
      resting: player.isResting,
      hand: player.hand?.map(card => card?.id),
      god: player.godName,
      godLevel: player.godLevel,
      etherealizeStacks: player.etherealizeStacks,
    })),
  });
}

function describeHeadlessTransition(before, after) {
  const ignored = new Set([
    'players', 'deck', 'discard', 'log', '_visualEvents', '_statEvents',
    '_playersBeforeNextDraw', '_playersBeforeSkillAction', '_playersBeforeEndTurnReplay',
    '_playersBeforeThisDraw', '_preTurnPlayers',
  ]);
  const topLevelChanges = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])]
    .filter(key => !ignored.has(key) && JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]));
  const playerChanges = (after?.players || []).map((player, index) => {
    const previous = before?.players?.[index] || {};
    const keys = [...new Set([...Object.keys(previous), ...Object.keys(player || {})])]
      .filter(key => JSON.stringify(previous[key]) !== JSON.stringify(player?.[key]));
    return keys.length ? { index, keys } : null;
  }).filter(Boolean);
  return { topLevelChanges, playerChanges };
}

export function validateHeadlessPresentationTransition(before, after) {
  const beforeVisualEventIds = new Set(
    (Array.isArray(before?._visualEvents) ? before._visualEvents : [])
      .map(event => event?.id)
      .filter(Boolean),
  );
  const stagedEvents = (Array.isArray(after?._visualEvents) ? after._visualEvents : [])
    // A staged transaction remains on state while that AI performs its action.
    // Validate ownership only at the transition that introduced it; requiring
    // it to compile again on every later state would itself demand a replay.
    .filter(event => !!event?.turnStartStage && (!event?.id || !beforeVisualEventIds.has(event.id)));
  if (!stagedEvents.length) return [];
  const stagedStatSeqs = new Set(stagedEvents
    .flatMap(event => Array.isArray(event?.statEvents) ? event.statEvents : [])
    .map(event => event?.seq)
    .filter(seq => seq != null));
  const actionMetadata = scopeAiActionReplayMetadata(after);
  const nextTurnLine = after?._turnStartLogs?.[0];
  const nextTurnLogIndex = nextTurnLine && Array.isArray(after?.log)
    ? after.log.lastIndexOf(nextTurnLine)
    : -1;
  const actionLog = nextTurnLogIndex >= 0 ? after.log.slice(0, nextTurnLogIndex) : after?.log;
  const actionInspectionEvents = (Array.isArray(after?._visualEvents) ? after._visualEvents : [])
    .filter(event => event?.type === VISUAL_EVENT.INSPECTION)
    .filter(event => !((event?.beforeLog || []).some(line => line === nextTurnLine)));
  const scopedActionState = buildScopedAiActionReplayState({
    state: after,
    players: after?._playersBeforeNextDraw || after?.players,
    discard: after?._discardBeforeNextDraw || after?.discard,
    log: actionLog,
    inspectionEvents: actionInspectionEvents,
    metadata: actionMetadata,
  });
  const crossTurnActionIssues = (scopedActionState._statEvents || [])
    .filter(event => event?.seq != null && stagedStatSeqs.has(event.seq))
    .map(event => ({
      code: 'ACTION_REPLAY_OWNS_NEXT_TURN_STAT',
      statEvent: { seq: event.seq, type: event.type, target: event.target, logHint: event.logHint },
    }));
  const replay = buildTurnStartDrawReplayQueue({ oldGs: before, newGs: after });
  const visualEvents = Array.isArray(after?._visualEvents) ? after._visualEvents : [];
  const eventsById = new Map(visualEvents
    .filter(event => event?.id)
    .map(event => [event.id, event]));
  const segmentIssues = [];
  const validateSegment = (queue, expectedTurnStart, segment) => {
    (queue || []).forEach((step, stepIndex) => {
      const owner = step?.visualEventId ? eventsById.get(step.visualEventId) : null;
      if (!owner || !!owner.turnStartStage === expectedTurnStart) return;
      segmentIssues.push({
        code: 'VISUAL_EVENT_CROSSES_REPLAY_SEGMENT',
        segment,
        stepIndex,
        stepType: step?.type || 'UNKNOWN',
        visualEventId: step.visualEventId,
        ownerStage: owner.turnStartStage || 'action',
      });
    });
  };
  validateSegment(replay.queue, true, 'turnStart');
  const stagedSphinxEvents = stagedEvents.filter(event => event?.type === 'sphinxResult');
  const actionSphinxEvent = getAiActionSphinxResultEvent(after);
  stagedSphinxEvents.forEach(event => {
    const compiledCount = replay.queue.filter(step => step?.visualEventId === event.id).length;
    if (!compiledCount) {
      segmentIssues.push({
        code: 'TURN_START_SPHINX_NOT_COMPILED',
        visualEventId: event.id || null,
      });
    }
    if (actionSphinxEvent?.id === event.id) {
      segmentIssues.push({
        code: 'ACTION_REPLAY_OWNS_NEXT_TURN_SPHINX',
        visualEventId: event.id || null,
      });
    }
  });
  const statIdentity = event => event?.id || [event?.seq ?? '', event?.type ?? '', event?.target ?? ''].join(':');
  const ownedStatIds = expectedTurnStart => new Set(visualEvents
    .filter(event => !!event?.turnStartStage === expectedTurnStart)
    .flatMap(event => Array.isArray(event?.statEvents) ? event.statEvents : [])
    .map(statIdentity));
  const actionStatIds = ownedStatIds(false);
  const turnStartStatIds = ownedStatIds(true);
  for (const statEventId of actionStatIds) {
    if (!turnStartStatIds.has(statEventId)) continue;
    segmentIssues.push({ code: 'STAT_EVENT_HAS_MULTIPLE_REPLAY_OWNERS', statEventId });
  }
  const statEventKey = event => [
    event?.seq ?? '',
    event?.type ?? '',
    event?.target ?? '',
    event?.logHint ?? '',
  ].join(':');
  const stagedStatEventKeys = new Set(stagedEvents
    .flatMap(event => Array.isArray(event?.statEvents) ? event.statEvents : [])
    .map(statEventKey));
  const log = Array.isArray(after?.log) ? after.log : [];
  const turnStartLine = after?._turnStartLogs?.[0];
  const turnStartIndex = turnStartLine ? log.lastIndexOf(turnStartLine) : -1;
  const currentTurnLogSet = new Set(turnStartIndex >= 0 ? log.slice(turnStartIndex) : []);
  return [
    ...crossTurnActionIssues,
    ...segmentIssues,
    ...replay.queue.flatMap((step, stepIndex) => (
      Array.isArray(step?.statEvents) ? step.statEvents : []
    )
      .filter(event => (
        !stagedStatEventKeys.has(statEventKey(event))
        && (!event?.logHint || !currentTurnLogSet.has(event.logHint))
      ))
      .map(event => ({
        stepIndex,
        stepType: step?.type || 'UNKNOWN',
        visualEventId: step?.visualEventId || null,
        statEvent: {
          seq: event?.seq,
          type: event?.type,
          target: event?.target,
          logHint: event?.logHint,
        },
        queueTypes: replay.queue.map(queueStep => queueStep?.type || 'UNKNOWN'),
      }))),
  ];
}

export function runHeadlessGame({
  seed = 1,
  roleCounts = null,
  expansionKey = '地神的潜影',
  maxSteps = 10000,
} = {}) {
  return withRandomSource(createSeededRandom(seed), () => {
    let state = createHeadlessGame({ roleCounts, expansionKey });
    const phaseCounts = {};
    let sameTurnSteps = 0;
    const recentTransitions = [];
    for (let step = 0; step < maxSteps; step++) {
      phaseCounts[state.phase] = (phaseCounts[state.phase] || 0) + 1;
      if (state.gameOver) {
        return {
          status: 'complete',
          winner: state.gameOver.winner,
          steps: step,
          turns: state.turn || 0,
          state,
          phaseCounts,
        };
      }
      const result = advanceHeadlessGame(state);
      if (result.status === 'unresolved') {
        return {
          status: 'unresolved',
          unresolvedPhase: result.phase,
          steps: step,
          turns: state.turn || 0,
          state,
          phaseCounts,
        };
      }
      const presentationIssues = validateHeadlessPresentationTransition(state, result.state);
      if (presentationIssues.length) {
        return {
          status: 'presentation-invalid',
          presentationIssues,
          steps: step,
          turns: result.state?.turn || state.turn || 0,
          state: result.state,
          phaseCounts,
        };
      }
      if (getHeadlessProgressKey(result.state) === getHeadlessProgressKey(state)) {
        return {
          status: 'stalled',
          stalledPhase: state.phase,
          steps: step,
          turns: state.turn || 0,
          state,
          phaseCounts,
        };
      }
      recentTransitions.push(describeHeadlessTransition(state, result.state));
      if (recentTransitions.length > 10) recentTransitions.shift();
      sameTurnSteps = result.state?.turn === state?.turn ? sameTurnSteps + 1 : 0;
      if (sameTurnSteps > 200) {
        return {
          status: 'runaway',
          stalledPhase: result.state?.phase,
          steps: step,
          turns: result.state?.turn || 0,
          state: result.state,
          phaseCounts,
          recentTransitions,
        };
      }
      state = result.state;
    }
    return {
      status: 'timeout',
      steps: maxSteps,
      turns: state.turn || 0,
      state,
      phaseCounts,
    };
  });
}

export function simulateHeadlessGames({
  games = 100,
  seed = 1,
  roleCounts = null,
  expansionKey = '地神的潜影',
  maxSteps = 10000,
} = {}) {
  const results = [];
  const winners = {};
  const statuses = {};
  const unresolvedPhases = {};
  for (let gameIndex = 0; gameIndex < games; gameIndex++) {
    const result = runHeadlessGame({
      seed: seed + gameIndex,
      roleCounts,
      expansionKey,
      maxSteps,
    });
    results.push(result);
    statuses[result.status] = (statuses[result.status] || 0) + 1;
    if (result.winner) winners[result.winner] = (winners[result.winner] || 0) + 1;
    if (result.unresolvedPhase) {
      unresolvedPhases[result.unresolvedPhase] = (unresolvedPhases[result.unresolvedPhase] || 0) + 1;
    }
    if (result.stalledPhase) {
      unresolvedPhases[`STALLED:${result.stalledPhase}`] = (unresolvedPhases[`STALLED:${result.stalledPhase}`] || 0) + 1;
    }
  }
  return { games, seed, roleCounts, expansionKey, winners, statuses, unresolvedPhases, results };
}
