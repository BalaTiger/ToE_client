import { INSPECTION_DECK } from '../constants/card';
import { isBlackGoatYoung, isTsathogguaSlime, isVanishingDerivedCard, ROLE_TREASURE, ROLE_HUNTER, ROLE_CULTIST } from './coreUtils';
import { checkWin, getTreasureDeclarationWin } from './victory';
import { runAiPreview } from './aiPreviewRuntime';

const PUBLIC_STATE_KEYS = ['currentTurn', 'turn', 'turnDirection', 'phase', 'skillUsed', 'restUsed',
  'multiplyUsed', 'globalOnlySwapOwner', 'apophisNight', 'geomagneticReversalActive', 'petrifyingFormula',
  'sealLooseningCount', 'houndsOfTindalosActive', 'houndsOfTindalosTarget', 'houndsOfTindalosElapsed',
  '_turnKey', '_turnFlowStage', 'balancePatches', 'proliferatingZ', 'proliferatingZQueue'];
const PUBLIC_PLAYER_KEYS = ['id', 'name', 'hp', 'san', 'isDead', 'roleRevealed', 'revealHand',
  'pickInsteadOfRandom', 'godName', 'godLevel', 'godZone', 'zoneCards', 'godEncounters', 'godEncounterCount',
  'hasBelievedGod', 'isResting', 'damageLink', 'damageLinks', 'damageBonus', 'damageBonusTurnOwner',
  'damageBonusExpiresAt', 'etherealizeStacks', 'disableRest', 'disableSkill', 'handLimitDecrease',
  'disableRestNextTurn', 'disableSkillNextTurn', 'handLimitDecreaseNextTurn', 'skipNextDraw',
  'skipNextDrawReason', 'poisonTurns', 'poisoned', 'poisonStacks', 'pendingTurnDirectionReversals', '_nyaBorrow',
  '_nyaHandLimit', '_pendingDamageLinkBreak', 'godPowerImmunity', 'godPowerImmuneUntilTurn',
  'godPowerImmuneThisTurn', 'godPowerImmuneTurnOwner'];

function pick(source, keys) {
  return Object.fromEntries(keys.filter(key => source?.[key] !== undefined).map(key => [key, structuredClone(source[key])]));
}

// Build an observation, not a clone of the omniscient game/animation graph.
// Card identity matching only invalidates stale knowledge; hidden card contents
// and sealed simultaneous choices are never copied into the observation.
export function createAiObservationState(state, actorIdx) {
  if (state?._aiObservation && state._aiObserverIdx === actorIdx) return structuredClone(state);
  const observer = state?.players?.[actorIdx];
  const players = (state?.players || []).map((player, idx) => {
    const own = idx === actorIdx;
    const memories = observer?.peekMemories?.[idx] || [];
    const hand = (player.hand || []).map((card, cardIdx) => {
      const remembered = memories.find(known => known?.id != null && known.id === card?.id);
      if (own || player.revealHand || isBlackGoatYoung(card) || isTsathogguaSlime(card)) return structuredClone(card);
      if (remembered) return structuredClone(remembered);
      return { id: `unknown-${idx}-${cardIdx}`, _aiUnknown: true };
    });
    return { ...pick(player, PUBLIC_PLAYER_KEYS), role: own || player.roleRevealed || player.isDead ? player.role : null,
      hand, godZone: structuredClone(player.godZone || []), zoneCards: structuredClone(player.zoneCards || []),
      peekMemories: own ? structuredClone(player.peekMemories || {}) : {} };
  });
  const inspectionDiscard = structuredClone(state?.inspectionDiscard || []);
  const remainingInspection = structuredClone(INSPECTION_DECK);
  for (const discarded of inspectionDiscard) {
    const index = remainingInspection.findIndex(card => card.effect === discarded.effect && card.name === discarded.name);
    if (index >= 0) remainingInspection.splice(index, 1);
  }
  return { ...pick(state, PUBLIC_STATE_KEYS), players, deck: [], deckCount: state?.deckCount ?? state?.deck?.length ?? 0,
    discard: structuredClone(state?.discard || []), inspectionDeck: remainingInspection,
    inspectionDiscard, abilityData: {}, log: [], gameOver: structuredClone(state?.gameOver || null),
    _isMP: true, _aiObservation: true, _aiObserverIdx: actorIdx };
}

function belongsToActor(win, state, actorIdx) {
  const role = state.players[actorIdx]?.role;
  if (win.winner === ROLE_TREASURE) {
    if (win.winnerIdx != null) return win.winnerIdx === actorIdx || win.winnerIdx2 === actorIdx;
    const alive = state.players.map((p, idx) => ({ p, idx })).filter(({ p }) => !p.isDead);
    return alive.length === 1 && alive[0].idx === actorIdx && role === ROLE_TREASURE;
  }
  return win.winner === role && (role === ROLE_HUNTER || role === ROLE_CULTIST);
}

export function evaluateAiState(state, actorIdx, { allowTreasureDeclaration = false } = {}) {
  const self = state?.players?.[actorIdx];
  if (!self) return [-1, 0, -Infinity];
  const incomplete = !!(state._aiPreviewIncomplete || state._aiPendingResolution);
  const win = state.gameOver || (!incomplete && (checkWin(state.players, true)
    || (allowTreasureDeclaration && !state.proliferatingZQueue?.length
      && getTreasureDeclarationWin(state.players, actorIdx))));
  const terminal = win ? (belongsToActor(win, state, actorIdx) ? 1 : -1) : 0;
  const survival = self.isDead && !incomplete ? 0 : 1;
  const hand = (self.hand || []).filter(card => !card._aiUnknown);
  const zones = hand.filter(card => !card.isGod && !isVanishingDerivedCard(card));
  const axes = new Set(zones.map(card => card.letter).filter(Boolean)).size
    + new Set(zones.map(card => card.number).filter(number => number != null)).size;
  const role = self._nyaBorrow || self.role;
  let value = (self.hp || 0) * 2 + (self.san || 0) * 1.5;
  value -= Math.max(0, 4 - (self.hp || 0)) ** 2 * 2;
  if (role !== ROLE_CULTIST) value -= Math.max(0, 4 - (self.san || 0)) ** 2 * 2;
  value -= hand.filter(isBlackGoatYoung).length * 5;
  if (role === ROLE_TREASURE) value += axes * 6 + zones.length * 0.4;
  else if (role === ROLE_HUNTER) {
    value += axes * 0.7 + zones.length * 1.2 + hand.filter(card => card.isGod).length * 0.5;
    value -= state.players.filter((p, idx) => idx !== actorIdx && !p.isDead && p.role !== ROLE_HUNTER)
      .reduce((sum, p) => sum + (p.role ? 12 : 5) + (p.hp || 0) * (p.role ? 1.5 : 1.2), 0);
  } else if (role === ROLE_CULTIST) {
    value -= hand.filter(card => !isVanishingDerivedCard(card)).length;
    value += (10 - Math.min(...state.players.filter(p => !p.isDead).map(p => p.san ?? 10), 10)) * 3;
  }
  value -= Number(state._aiUnresolvedRisk || 0) * 4;
  return [terminal, survival, value];
}

export function compareAiScores(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

export function rankAiActions({ state, actorIdx, actions = [], simulate, evaluate, allowTreasureDeclaration = false, seed = 1 }) {
  if (!state?.players?.[actorIdx] || typeof simulate !== 'function') return [];
  return actions.map((action, index) => {
    const outcome = runAiPreview(() => {
      const snapshot = structuredClone(state);
      // This order is drawn from the public inspection composition, never the
      // actual hidden order. Every candidate receives the same random sample.
      for (let i = (snapshot.inspectionDeck?.length || 0) - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [snapshot.inspectionDeck[i], snapshot.inspectionDeck[j]] = [snapshot.inspectionDeck[j], snapshot.inspectionDeck[i]];
      }
      return simulate(snapshot, structuredClone(action));
    }, { seed });
    if (!outcome) return null;
    const base = evaluateAiState(outcome, actorIdx, { allowTreasureDeclaration });
    const secondary = evaluate ? evaluate(outcome, action, state) : base.slice(2);
    const score = [...base.slice(0, 2), ...(Array.isArray(secondary) ? secondary : [secondary ?? 0])];
    return { action, outcome, score, terminal: score[0], index };
  }).filter(Boolean).sort((left, right) => compareAiScores(right.score, left.score) || left.index - right.index);
}

export function chooseAiAction(options) {
  return rankAiActions(options)[0]?.action ?? null;
}
