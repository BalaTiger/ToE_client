import { ruleRandom } from '../runtime.js';
import { copyPlayers, getAdjacentTargets, getZoneCardEffectScope, shouldTriggerTreasureDodge, cardLogText } from '../game/coreUtils.js';
import { revealBlindDrawCard, clearBlindZoneDecisionFlag } from '../game/blindZoneDecision.js';
import { applyFx, applyHpDamageWithLink, submitLossEvents } from '../game/effectEngine.js';
import { applyZoneCardIncome } from '../game/zoneCardIncome.js';
import { deriveEffectDecisionState } from '../game/effectStatePatch.js';
import { advanceEndTurnReplayPatch, resolveEndTurnReplayDiscard } from '../game/endTurnReplayFlow.js';
import { buildTargetContinuationAbilityData } from '../game/targetContinuation.js';
import { applyBalanceDiscardSideEffects } from '../game/balanceCards.js';
import { buildStatChangeStatePatch } from '../game/statChangeEngine.js';
import { checkWin, getTreasureDeclarationWin } from '../game/victory.js';
import { cardIncomeCommittedEvent, committedPublicEvent, appendCommittedPublicEvent } from './incomeEvents.js';

const drawer = state => state.drawReveal?.drawerIdx ?? state.currentTurn;
const drawOwned = (state, seat) => !!state.drawReveal?.card && drawer(state) === seat
  && (state.drawReveal.needsDecision !== false || state.drawReveal.fromEndTurnReplay);
const pendingDodge = (state, seat) => !!state._treasureDodge?.targets.includes(seat)
  && !Object.hasOwn(state._treasureDodge.answers, seat);
const continuation = (state, dr) => ({
  ...buildTargetContinuationAbilityData(state.abilityData),
  ...(dr.fromRest ? { fromRest: true } : {}),
  ...(dr.fromEndTurnReplay ? { fromEndTurnReplay: true } : {}),
  ...(dr.fromTsathogguaSlime ? { fromTsathogguaSlime: true, continueTurnStartDraw: true,
    _turnOwner: state.abilityData?._turnOwner ?? drawer(state) } : {}),
  ...(dr.fromProliferatingZ ? { fromProliferatingZ: true } : {}),
  ...(state.abilityData?.cthDrawsRemaining != null ? { cthDrawsRemaining: state.abilityData.cthDrawsRemaining } : {}),
});

// The driver consumes this semantic continuation independently of animation.
// It stays private and survives any intervening card decision.
function withContinuation(state, dr) {
  return { ...state, ...(dr.fromRest || dr.fromTsathogguaSlime || dr.fromProliferatingZ || dr.fromEndTurnReplay
    ? { _ruleContinuation: { ...state._ruleContinuation,
      kind: dr.fromRest ? 'restDraw' : dr.fromTsathogguaSlime ? 'turnStartDraw' : dr.fromProliferatingZ ? 'proliferatingDraw' : 'endTurnReplay',
      owner: dr.drawerIdx ?? state.currentTurn } } : {}) };
}

export function settleKeptDraw(state, avoided = []) {
  const dr = state.drawReveal, seat = drawer(state), card = revealBlindDrawCard(dr.card);
  const players = copyPlayers(state.players);
  clearBlindZoneDecisionFlag(players, seat, dr);
  const result = applyFx(card, seat, null, players, [...state.deck], [...state.discard], state,
    avoided.includes(seat), avoided.filter(index => index !== seat), false);
  let income = null;
  const patch = applyZoneCardIncome({ players: result.P, discard: result.Disc, card, drawerIdx: seat,
    statePatch: result.statePatch, fromEndTurnReplay: dr.fromEndTurnReplay,
    presentationSource: 'reveal', onIncomeCommitted: committed => { income = committed; } });
  const pendingIncome = !!patch?.abilityData?.pendingZoneIncome;
  const decision = deriveEffectDecisionState(patch, { baseAbilityData: state.abilityData,
    fallbackPhase: 'ACTION', extraAbilityData: continuation(state, dr) });
  const kept = committedPublicEvent({ ...state, ...patch }, { type: 'cardRevealed', seat, card, reason: 'keep' });
  const pendingEvents = [...(state._pendingPublicEvents || []), kept];
  let next = withContinuation({ ...state, ...patch,
    players: result.P, deck: result.D, discard: result.Disc, drawReveal: null,
    phase: decision.phase, abilityData: decision.abilityData,
    log: [...(state.log || []), ...(dr.reshuffleLog ? [dr.reshuffleLog] : []), ...result.msgs,
      `${players[seat].name} 保留 ${cardLogText(card, { alwaysShowName: true })}`],
    ...(dr.fromEndTurnReplay ? advanceEndTurnReplayPatch(state) : {}),
    _pendingPublicEvents: [...pendingEvents,
      ...(!pendingIncome && !decision.hasDecision && income
        ? [cardIncomeCommittedEvent(income, { ...state, ...patch, _pendingPublicEvents: pendingEvents })] : [])],
  }, dr);
  delete next._pendingMoldyFoodRoll; delete next._treasureDodge;
  // An unfinished effect must never win from a transient hand.
  const win = pendingIncome || decision.hasDecision ? null
    : checkWin(next.players, state._isMP) || getTreasureDeclarationWin(next.players, seat);
  if (win) {
    next = { ...next, gameOver: win };
    if (win.winnerIdx != null) next.players[win.winnerIdx].roleRevealed = true;
  }
  return next;
}

export function keepDraw(state) {
  const dr = state.drawReveal, seat = drawer(state), card = revealBlindDrawCard(dr.card);
  if (card.type === 'swapAllHands') {
    const players = copyPlayers(state.players); clearBlindZoneDecisionFlag(players, seat, dr);
    return withContinuation({ ...state, players, phase: 'ZONE_SWAP_SELECT_TARGET', drawReveal: null,
      abilityData: { ...continuation(state, dr), zoneSwapCard: card, zoneSwapSource: seat,
        ...(!dr.fromEndTurnReplay ? { pendingZoneIncome: { card, ownerId: players[seat].id, presentationSource: 'reveal' } } : {}) },
      ...(dr.fromEndTurnReplay ? advanceEndTurnReplayPatch(state) : {}),
    }, dr);
  }
  // Roll conditional food once, before any prompt. Retrying or waiting cannot
  // redraw this result; the transactional command owns the random cursor.
  const moldyFoodRoll = card.type === 'moldyFood' ? 1 + Math.floor(ruleRandom() * 6) : null;
  const prepared = moldyFoodRoll === null ? state : { ...state, _pendingMoldyFoodRoll: moldyFoodRoll };
  const scope = getZoneCardEffectScope(card);
  const affected = scope === 'all' ? state.players.map((_player, index) => index)
    : scope === 'adjacent' ? getAdjacentTargets(state.players, seat) : [seat];
  const targets = affected.filter(index => !state.players[index].isDead
    && (state.players[index]._nyaBorrow || state.players[index].role) === '寻宝者'
    && shouldTriggerTreasureDodge(card, state.players[index], { moldyFoodRoll }));
  if (!targets.length) return settleKeptDraw(prepared);
  return { ...prepared, phase: scope === 'self' ? 'TREASURE_DODGE_DECISION' : 'TREASURE_AOE_DODGE_DECISION',
    _treasureDodge: { cardId: card.id, targets, answers: {} } };
}

export function discardDraw(state) {
  const dr = state.drawReveal, seat = drawer(state), card = revealBlindDrawCard(dr.card);
  let players = copyPlayers(state.players), deck = [...state.deck], discard, destroyed = false;
  clearBlindZoneDecisionFlag(players, seat, dr);
  if (dr.fromEndTurnReplay) {
    const result = resolveEndTurnReplayDiscard({ players, discard: state.discard, actorIndex: seat, card });
    players = result.players; discard = result.discard; destroyed = result.destroyed;
  } else discard = [...state.discard, card];
  let log = [...(state.log || []), ...(dr.reshuffleLog ? [dr.reshuffleLog] : []),
    destroyed ? `${players[seat].name} 的衍生牌被销毁` : `${players[seat].name} 弃置 ${cardLogText(card, { alwaysShowName: true })}`];
  let damage = null;
  if (dr.fromEndTurnReplay && !destroyed && card.type !== 'blankZone') {
    const balance = applyBalanceDiscardSideEffects({ players, deck, discard, log, ownerIdx: seat, cards: [card],
      reason: '摸牌后弃置', applyHpDamage: applyHpDamageWithLink, submitDamage: submitLossEvents,
      currentTurn: state.currentTurn, statEventSeq: (state._statEventSeq || 0) + 1, statEventReason: '摸牌后弃置',
      continuation: { ...state.abilityData, _turnOwner: state.abilityData?._turnOwner ?? state.currentTurn } });
    ({ players, deck, discard, log } = balance); damage = balance.damageDecision || null;
  }
  return withContinuation({ ...state, players, deck, discard, log, drawReveal: null,
    _pendingPublicEvents: [...(state._pendingPublicEvents || []), { type: 'cardRevealed', seat, card,
      reason: destroyed ? 'destroyed' : 'discard', presentationOrder: 'beforeStats' }],
    phase: damage?.phase || 'ACTION', abilityData: damage?.abilityData || continuation(state, dr),
    ...(dr.fromEndTurnReplay ? advanceEndTurnReplayPatch(state) : {}),
    ...buildStatChangeStatePatch(state, damage),
  }, dr);
}

export const drawActions = {
  'draw.keep': { phases: ['DRAW_REVEAL'], payloadKeys: [], authorize: drawOwned, available: drawOwned,
    apply: state => keepDraw(state) },
  'draw.discard': { phases: ['DRAW_REVEAL'], payloadKeys: [],
    authorize: drawOwned, available: (state, seat) => drawOwned(state, seat) && !state.drawReveal.forcedKeep,
    validate: state => !state.drawReveal.forcedKeep, apply: state => discardDraw(state) },
  'treasureDodge.reply': { phases: ['TREASURE_DODGE_DECISION', 'TREASURE_AOE_DODGE_DECISION'], payloadKeys: ['use'],
    concurrent: true, windowKey: state => state._treasureDodge?.cardId,
    authorize: pendingDodge, available: pendingDodge,
    validate: (_state, _seat, payload) => typeof payload.use === 'boolean',
    apply: (state, seat, payload) => {
      const roll = payload.use ? 1 + Math.floor(ruleRandom() * 6) : null;
      const answers = { ...state._treasureDodge.answers, [seat]: { use: payload.use, roll, avoided: roll !== null && roll >= 4 } };
      // A declared dodge reveals the responding role, independent of seat 0.
      if (payload.use) state.players[seat].roleRevealed = true;
      const next = { ...state, _treasureDodge: { ...state._treasureDodge, answers } };
      if (next._treasureDodge.targets.some(index => !Object.hasOwn(answers, index))) return next;
      let revealed = next;
      for (const index of next._treasureDodge.targets.filter(index => answers[index].roll !== null)) {
        revealed = appendCommittedPublicEvent(revealed,
          { type: 'diceRolled', seat: index, roll: answers[index].roll, purpose: 'treasureDodge' });
      }
      return settleKeptDraw(revealed, next._treasureDodge.targets.filter(index => answers[index].avoided));
    } },
};

export function drawTimeoutIntent(state) {
  if (state.phase === 'DRAW_REVEAL' && state.drawReveal?.card) return { seat: drawer(state),
    type: state.drawReveal.forcedKeep ? 'draw.keep' : 'draw.discard', payload: {} };
  const seat = state._treasureDodge?.targets.find(index => pendingDodge(state, index));
  return seat === undefined ? null : { seat, type: 'treasureDodge.reply', payload: { use: false } };
}
