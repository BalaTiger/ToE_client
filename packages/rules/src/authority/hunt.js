import { ruleRandom } from '../runtime.js';
import { copyPlayers, canRevealForHunt, hasHuntRevealableCard, removeCardsFromDiscard, splitHandDiscardCards, isBlackGoatYoung, isTsathogguaSlime } from '../game/coreUtils.js';
import { cardsHuntMatch } from '../game/aiTurn.js';
import { resolveApophisTarget } from '../game/apophisNight.js';
import { deriveEffectDecisionState } from '../game/effectStatePatch.js';
import { submitLossEvents } from '../game/effectEngine.js';
import { buildStatChangeStatePatch } from '../game/statChangeEngine.js';
import { buildBalanceDiscardLossEvents } from '../game/balanceCards.js';
import { checkWin, getTreasureDeclarationWin } from '../game/victory.js';
import { queueSanInspections } from './loss.js';
import { buildTargetContinuationAbilityData } from '../game/targetContinuation.js';
import { appendCommittedPublicEvent } from './incomeEvents.js';
const own = (state, seat) => state.currentTurn === seat;
const targets = state => state.players.flatMap((player, seat) => seat !== state.currentTurn && !player.isDead
  && hasHuntRevealableCard(player) && !(state.huntAbandoned || []).includes(seat) ? [seat] : []);
export function finishAuthorityHuntTarget(state) {
  const pending = state._authorityHuntTarget;
  if (!pending) return state;
  const players = copyPlayers(state.players); players[pending.source].roleRevealed = true;
  if (players[pending.source].isDead || players[pending.target].isDead || !hasHuntRevealableCard(players[pending.target])) {
    return { ...state, players, _authorityHuntTarget: null, phase: 'ACTION', abilityData: {} };
  }
  return { ...state, players, _authorityHuntTarget: null, phase: 'HUNT_WAIT_REVEAL',
    _pendingPublicEvents: [...(state._pendingPublicEvents || []),
      { type: 'skillStarted', kind: 'hunt', sourceSeat: pending.source, targetSeat: pending.target }],
    abilityData: { ...state.abilityData, huntTi: pending.target } };
}
function finishLoot(state, players, discard, hunter, target, movedCards = [], publicHand = false, revealedCardId = null) {
  const sourceCount = players[target].hand.length, targetCount = players[hunter].hand.length;
  const remaining = splitHandDiscardCards(players[target].hand);
  const discardedCards = [...remaining.kept, ...(players[target].godZone || [])];
  discard.push(...discardedCards);
  players[target].hand = []; players[target].godZone = []; players[target].godName = null; players[target].godLevel = 0;
  const win = state._pendingHuntWin || state.gameOver || checkWin(players, state._isMP) || getTreasureDeclarationWin(players, hunter);
  let next = { ...state, players, discard, _huntPending: null, _huntLoot: null, _pendingHuntWin: null, phase: 'ACTION',
    abilityData: buildTargetContinuationAbilityData(state.abilityData), skillUsed: true,
    ...(win ? { gameOver: win } : {}) };
  if (movedCards.length) next = appendCommittedPublicEvent(next, { type: 'huntLootTransferred', sourceSeat: target,
    targetSeat: hunter, count: movedCards.length, sourceCount, targetCount,
    lootCards: movedCards.map(card => ({ card, public: publicHand || card.id === revealedCardId
      || isBlackGoatYoung(card) || isTsathogguaSlime(card) })) });
  return appendCommittedPublicEvent(next, { type: 'deathCardsRemoved', seat: target,
    discardedCards, destroyedCount: remaining.destroyed.length });
}
export function finishAuthorityHunt(state) {
  const pending = state._huntPending;
  if (!pending) return state;
  const { source, target } = pending;
  if (!state.players[target].isDead && state.players[target].hp > 0) return { ...state, _huntPending: null,
    _pendingPublicEvents: [...(state._pendingPublicEvents || []),
      { type: 'huntResolved', sourceSeat: source, targetSeat: target, outcome: 'survived' }] };
  if (!state.players[target].isDead) return state;
  state = appendCommittedPublicEvent(state,
    { type: 'huntResolved', sourceSeat: source, targetSeat: target, outcome: 'defeated' });
  const players = copyPlayers(state.players);
  const death = (state._statEvents || []).filter(event => event.type === 'PLAYER_DEFEATED' && event.target === target
    && (event.seq || 0) > pending.statSeqBefore).at(-1);
  const beforeDeath = death?.playersBefore?.[target] || pending.beforeTarget;
  const hand = [...(beforeDeath.hand || [])], gods = [...(beforeDeath.godZone || [])];
  let discard = removeCardsFromDiscard([...state.discard], [...hand, ...gods]);
  players[target].hand = hand; players[target].godZone = gods;
  if (players[source].isDead) return finishLoot(state, players, discard, source, target);
  const max = Math.min(3, hand.length);
  if (pending.publicHand && hand.length > 3) {
    return { ...state, players, discard, _huntPending: null, phase: 'HUNT_SELECT_CARD_FROM_PUBLIC',
      gameOver: null, _pendingHuntWin: state.gameOver || checkWin(players, state._isMP),
      abilityData: { huntTi: target, maxToTake: max }, _huntLoot: { source, target, count: max,
        publicHand: true, revealedCardId: pending.revealedCardId } };
  }
  const count = max;
  const movedCards = [];
  for (let index = 0; index < count; index++) {
    const position = pending.publicHand ? 0 : Math.floor(ruleRandom() * players[target].hand.length);
    const [card] = players[target].hand.splice(position, 1);
    players[source].hand.push(card); movedCards.push(card);
  }
  return finishLoot(state, players, discard, source, target, movedCards, pending.publicHand, pending.revealedCardId);
}
export const huntActions = {
  'hunt.selectTarget': { phases: ['HUNT_SELECT_TARGET'], payloadKeys: ['targetSeat'], authorize: own, available: own,
    describe: state => ({ targetSeats: targets(state) }),
    validate: (state, _seat, payload) => Number.isInteger(payload.targetSeat) && targets(state).includes(payload.targetSeat),
    apply: (state, seat, payload) => {
      const result = resolveApophisTarget({ gs: state, players: copyPlayers(state.players), deck: [...state.deck],
        discard: [...state.discard], log: [...state.log], actorIdx: seat, selectedIdx: payload.targetSeat,
        legalTargets: targets(state), label: '选择【追捕】目标' });
      const next = { ...state, ...result.statePatch, players: result.players, deck: result.deck, discard: result.discard,
        log: result.log, _authorityHuntTarget: { source: seat, target: result.targetIdx } };
      const decision = deriveEffectDecisionState(result.statePatch, { baseAbilityData: state.abilityData });
      return decision.hasDecision ? { ...next, phase: decision.phase, abilityData: decision.abilityData } : finishAuthorityHuntTarget(next);
    } },
  'hunt.reveal': { phases: ['HUNT_WAIT_REVEAL'], payloadKeys: ['cardIndex'],
    authorize: (state, seat) => state.abilityData.huntTi === seat,
    available: (state, seat) => state.abilityData.huntTi === seat,
    describe: (state, seat) => ({ cardIndices: state.players[seat].hand.flatMap((card, index) => canRevealForHunt(card) ? [index] : []) }),
    validate: (state, seat, payload) => Number.isInteger(payload.cardIndex) && payload.cardIndex >= 0
      && canRevealForHunt(state.players[seat].hand[payload.cardIndex]),
    apply: (state, seat, payload) => ({ ...state, phase: 'HUNT_CONFIRM',
      abilityData: { ...state.abilityData, revCard: structuredClone(state.players[seat].hand[payload.cardIndex]) },
      _pendingPublicEvents: [...(state._pendingPublicEvents || []), { type: 'cardRevealed', seat,
        card: state.players[seat].hand[payload.cardIndex], reason: 'hunt' }] }) },
  'hunt.attack': { phases: ['HUNT_CONFIRM'], payloadKeys: ['cardIndex'], authorize: own, available: own,
    describe: (state, seat) => ({ allowAbandon: true, cardIndices: state.players[seat].hand.flatMap((card, index) =>
      cardsHuntMatch(card, state.abilityData.revCard) ? [index] : []) }),
    validate: (state, seat, payload) => payload.cardIndex === null || Number.isInteger(payload.cardIndex) && payload.cardIndex >= 0
      && cardsHuntMatch(state.players[seat].hand[payload.cardIndex], state.abilityData.revCard),
    apply: (state, seat, payload) => {
      const players = copyPlayers(state.players), target = state.abilityData.huntTi;
      players[seat].roleRevealed = true;
      if (payload.cardIndex === null) {
        players[seat].disableSkill = true;
        return { ...state, players, phase: 'ACTION', skillUsed: true, abilityData: {},
          _pendingPublicEvents: [...(state._pendingPublicEvents || []),
            { type: 'huntResolved', sourceSeat: seat, targetSeat: target, outcome: 'abandoned' }],
          huntAbandoned: [...(state.huntAbandoned || []), target] };
      }
      const beforeTarget = structuredClone(players[target]), [card] = players[seat].hand.splice(payload.cardIndex, 1);
      const deck = [...state.deck], discard = [...state.discard, card], log = [...state.log];
      const balance = buildBalanceDiscardLossEvents([card], seat, { reason: '追捕弃牌' });
      const damage = submitLossEvents({ players, deck, discard, log, currentTurn: state.currentTurn,
        events: [...balance, { targetIdx: target, lostHp: 3 + (players[seat].damageBonus || 0), source: '追捕', order: balance.length }],
        statEventSeq: (state._statEventSeq || 0) + 1, defeatSettlementOwner: 'huntResult' });
      return queueSanInspections(state, { ...state, players, deck, discard, log, skillUsed: true,
        _pendingPublicEvents: [...(state._pendingPublicEvents || []),
          { type: 'huntAttack', sourceSeat: seat, targetSeat: target, card, presentationOrder: 'beforeStats' }],
        ...buildStatChangeStatePatch(state, damage), phase: damage.phase || 'ACTION', abilityData: damage.abilityData || {},
        _huntPending: { source: seat, target, beforeTarget, publicHand: !!state.players[target].revealHand,
          revealedCardId: state.abilityData.revCard?.id,
          statSeqBefore: state._statEventSeq || 0 } });
    } },
  'hunt.loot': { phases: ['HUNT_SELECT_CARD_FROM_PUBLIC'], payloadKeys: ['cardIndices'], authorize: own, available: own,
    describe: state => ({ count: state._huntLoot.count, cardIndices: state.players[state._huntLoot.target].hand.map((_card, index) => index) }),
    validate: (state, _seat, payload) => Array.isArray(payload.cardIndices) && payload.cardIndices.length === state._huntLoot.count
      && new Set(payload.cardIndices).size === payload.cardIndices.length && payload.cardIndices.every(index =>
        Number.isInteger(index) && index >= 0 && index < state.players[state._huntLoot.target].hand.length),
    apply: (state, seat, payload) => {
      const players = copyPlayers(state.players), target = state._huntLoot.target;
      const movedCards = [];
      for (const index of [...payload.cardIndices].sort((a, b) => b - a)) {
        const [card] = players[target].hand.splice(index, 1); players[seat].hand.push(card); movedCards.push(card);
      }
      return finishLoot(state, players, [...state.discard], seat, target, movedCards,
        state._huntLoot.publicHand, state._huntLoot.revealedCardId);
    } },
};
