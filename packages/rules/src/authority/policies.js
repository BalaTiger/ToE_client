import { ruleRandom } from '../runtime.js';
import { chooseAiReactionIntent, reactionTimeoutIntent } from './reactions.js';
import { drawTimeoutIntent } from './draw.js';
import { turnTimeoutIntent } from './turn.js';
import { chooseAiGodEncounterAction } from '../game/turnEngine.js';
import { aiShouldKeepZoneCard, aiChooseRevealCard, decideAiSkillUsage, chooseAiCultistBewitchPlan } from '../game/ai.js';
import { chooseAiPublicCardIndex, chooseAiTortoiseKey } from '../game/aiPublicChoices.js';
import { chooseAiStoneCardIndex } from '../game/aiStoneChoice.js';
import { chooseAiHandLimitDiscardIndex, chooseAiSameAbyssAction, chooseAiHuntDiscardIndex } from '../game/aiDiscardChoices.js';
import { getBestCaveDuelCardIndex } from '../game/caveDuel.js';
import { getZhuTopGuard } from '../game/zhuPower.js';
import { canRevealForHunt } from '../game/coreUtils.js';
import { legalGodChoices } from './gods.js';

// Reconstruct only an information set from the wire view. Unknown deck/hand
// slots contain no face, canonical id or order information. Policy helpers
// cannot reach the match record through this object.
export function observationFromView(view) {
  const unknowns = count => Array.from({ length: count }, (_item, index) => ({ id: `unknown:${index}`, _aiUnknown: true }));
  return { _intentEngine: true, _informationSetModel: true, _isMP: true, currentTurn: view.currentSeat, phase: view.phase, turn: view.turn,
    skillUsed: view.turnFlags?.skillUsed, restUsed: view.turnFlags?.restUsed, multiplyUsed: view.turnFlags?.multiplyUsed,
    huntAbandoned: view.turnFlags?.abandonedTargets || [],
    players: view.players.map(player => ({ ...player, id: player.seat,
      hand: player.hand ? structuredClone(player.hand) : [...structuredClone(player.publicTokens || []),
        ...unknowns(Math.max(0, player.handCount - (player.publicTokens?.length || 0)))], peekMemories: {} })),
    deck: unknowns(view.deckCount), inspectionDeck: unknowns(view.inspectionDeckCount),
    discard: structuredClone(view.discard), inspectionDiscard: structuredClone(view.inspectionDiscard), log: [], abilityData: {} };
}
export function chooseAiIntent(view) {
  const reaction = chooseAiReactionIntent(view); if (reaction) return reaction;
  const actions = view.decision.actions, seat = view.viewerSeat;
  if (seat === null || !actions.length) return null;
  const state = observationFromView(view), has = type => actions.find(action => action.type === type);
  const intent = (type, payload = {}) => ({ type, payload });
  if (has('zhu.hide')) return intent('zhu.hide', { hide: false });
  if (has('nya.borrow')) return intent('nya.borrow', { targetSeat: has('nya.borrow').targetSeats[0] ?? null });
  if (has('zhu.hideSphinx')) return intent('zhu.hideSphinx', { hide: false });
  if (has('sphinx.guess')) return intent('sphinx.guess', { isZone: ruleRandom() < 0.5 });
  if (has('sphinx.dodge')) return intent('sphinx.dodge', { use: true });
  for (const type of ['grave.choose', 'torch.discard', 'albino.reveal']) {
    if (has(type)?.cardIndices.length) return intent(type, { cardIndex: has(type).cardIndices[0] });
  }
  if (has('bury.commit')) return intent('bury.commit', { cardIndex: has('bury.commit').cardIndices[0] });
  for (const type of ['swap.selectTarget', 'hunt.selectTarget']) {
    const action = has(type);
    if (action) return action.targetSeats.length ? intent(type, { targetSeat: action.targetSeats[0] }) : intent('skill.cancel');
  }
  if (has('swap.takeBlind')) return intent('swap.takeBlind');
  if (has('swap.takeVisible')) return intent('swap.takeVisible', { cardIndex: has('swap.takeVisible').cardIndices[0] });
  if (has('swap.give')) return intent('swap.give', { cardIndex: has('swap.give').cardIndices[0] });
  if (has('hunt.reveal')) {
    const card = aiChooseRevealCard(state.players[seat].hand, state.players[view.currentSeat].name, [], []);
    return intent('hunt.reveal', { cardIndex: state.players[seat].hand.findIndex(held => held.id === card?.id) });
  }
  if (has('hunt.attack')) {
    const index = chooseAiHuntDiscardIndex(state, seat, view.hunt.revealedCard, view.hunt.targetSeat);
    return intent('hunt.attack', { cardIndex: index < 0 ? null : index });
  }
  if (has('hunt.loot')) return intent('hunt.loot', { cardIndices: has('hunt.loot').cardIndices.slice(0, has('hunt.loot').count) });
  if (has('bewitch.chooseCard')) {
    const plan = chooseAiCultistBewitchPlan(state.players, seat, { gs: state, deck: state.deck, discard: state.discard });
    return plan ? intent('bewitch.chooseCard', { cardIndex: state.players[seat].hand.findIndex(card => card.id === plan.card.id) }) : intent('skill.cancel');
  }
  if (has('bewitch.selectTarget')) {
    state.players[seat].hand = [state.players[seat].hand[view.bewitchCardIndex]];
    const plan = chooseAiCultistBewitchPlan(state.players, seat, { gs: state, deck: state.deck, discard: state.discard });
    return intent('bewitch.selectTarget', { targetSeat: plan?.targetIdx ?? has('bewitch.selectTarget').targetSeats[0] });
  }
  if (has('draw.keep')) {
    const keep = view.draw?.hidden ? ruleRandom() < 0.5 : aiShouldKeepZoneCard(view.draw.card, seat, state.players,
      !!view.draw.forcedKeep, { gs: state, deck: state.deck, discard: state.discard });
    return intent(keep || !has('draw.discard') ? 'draw.keep' : 'draw.discard');
  }
  if (has('treasureDodge.reply')) return intent('treasureDodge.reply', { use: true });
  if (has('caveDuel.commit')) {
    const opponent = view.duel.sourceSeat === seat ? view.duel.targetSeat : view.duel.sourceSeat;
    return intent('caveDuel.commit', { cardIndex: getBestCaveDuelCardIndex(state.players[seat].hand,
      { state, actorIdx: seat, opponentIdx: opponent }) });
  }
  for (const type of ['caveDuel.selectTarget', 'peek.selectTarget', 'shu.selectTarget', 'zoneSwap.selectTarget', 'damageLink.selectTarget', 'roseThorn.selectTarget', 'multiply.selectTarget']) {
    const action = has(type); if (action?.targetSeats.length) {
      const targetSeat = [...action.targetSeats].sort((a, b) => type === 'shu.selectTarget'
        ? state.players[a].hp - state.players[b].hp : state.players[b].hand.length - state.players[a].hand.length)[0];
      return intent(type, { targetSeat });
    }
  }
  if (has('publicPick.choose')) return intent('publicPick.choose', { cardIndex: chooseAiPublicCardIndex({ state,
    actorIdx: seat, cards: view.publicReveals }) });
  if (has('tortoise.choose')) return intent('tortoise.choose', { key: chooseAiTortoiseKey({ state,
    actorIdx: seat, revealedCards: view.publicReveals, selectableKeys: has('tortoise.choose').keys }) });
  if (has('stone.arrange')) {
    const cards = view.privateReveals, handIndex = chooseAiStoneCardIndex({ state, actorIdx: seat, cards });
    return intent('stone.arrange', { handIndex, topIndices: cards.flatMap((_card, index) => index === handIndex ? [] : [index]).reverse(), bottomIndices: [] });
  }
  if (has('sameAbyss.choose')) {
    const action = has('sameAbyss.choose');
    const choice = action.choices.length === 1 ? action.choices[0]
      : chooseAiSameAbyssAction(state, seat, action.actorSeat)?.type === 'discard' ? 'discard' : 'damage';
    return intent('sameAbyss.choose', { choice });
  }
  if (has('god.choose')) {
    const choices = has('god.choose').choices;
    const selected = chooseAiGodEncounterAction(seat, view.godEncounter.card, state.players, view.godEncounter.forcedConvert);
    const choice = ({ hand: 'keepHand', convert: 'worship' })[selected] || selected;
    return intent('god.choose', { choice: choices.includes(choice) ? choice : choices.includes('accept') ? 'accept' : 'discard' });
  }
  if (has('turn.discard')) {
    const action = has('turn.discard'), original = [...state.players[seat].hand], indices = [];
    state.players[seat]._nyaHandLimit = original.length - action.count;
    state.players[seat].handLimitDecrease = 0;
    for (let count = 0; count < action.count; count++) {
      const index = chooseAiHandLimitDiscardIndex(state, seat);
      if (index < 0) break;
      const [selected] = state.players[seat].hand.splice(index, 1);
      indices.push(original.findIndex(card => card.id === selected.id));
    }
    return intent('turn.discard', { cardIndices: indices });
  }
  if (has('god.useHand')) {
    for (const cardIndex of has('god.useHand').cardIndices) {
      const selected = chooseAiGodEncounterAction(seat, state.players[seat].hand[cardIndex], state.players);
      if (['worship', 'upgrade', 'convert'].includes(selected)) return intent('god.useHand', { cardIndex });
    }
  }
  if (has('turn.rest') && state.players[seat].hp < 8) return intent('turn.rest');
  if (has('skill.begin')?.targetSeats.length) {
    const action = has('skill.begin');
    const useful = action.role !== '邪祀者' || chooseAiCultistBewitchPlan(state.players, seat, { gs: state, deck: state.deck, discard: state.discard });
    if (useful && decideAiSkillUsage(state, state.players, seat, action.role, action.targetSeats).useSkill) return intent('skill.begin');
  }
  if (has('multiply.begin')) return intent('multiply.begin');
  return has('turn.end') ? intent('turn.end') : null;
}

export function chooseTimeoutIntent(state) {
  if (state.phase === 'TREASURE_DODGE_DECISION' && state._sphinxPending) return {
    seat: state._sphinxPending.seat, type: 'sphinx.dodge', payload: { use: false } };
  if (state.phase === 'SPHINX_GUESS') {
    const guard = getZhuTopGuard(state);
    return guard ? { seat: guard.ownerIdx, type: 'zhu.hideSphinx', payload: { hide: false } }
      : { seat: state.abilityData.playerIndex ?? state.currentTurn, type: 'sphinx.guess', payload: { isZone: true } };
  }
  const simple = reactionTimeoutIntent(state) || drawTimeoutIntent(state) || turnTimeoutIntent(state);
  if (simple) return simple;
  const ad = state.abilityData;
  if (['SWAP_SELECT_TARGET', 'SWAP_STEAL_CARD', 'SWAP_SELECT_TARGET_CARD', 'SWAP_GIVE_CARD',
    'HUNT_SELECT_TARGET', 'BEWITCH_SELECT_CARD', 'BEWITCH_SELECT_TARGET', 'MULTIPLY_SELECT_TARGET'].includes(state.phase)) {
    return { seat: state.currentTurn, type: 'skill.cancel', payload: {} };
  }
  if (state.phase === 'HUNT_WAIT_REVEAL') {
    const indices = state.players[ad.huntTi].hand.flatMap((card, index) => canRevealForHunt(card) ? [index] : []);
    return { seat: ad.huntTi, type: 'hunt.reveal', payload: { cardIndex: indices[Math.floor(ruleRandom() * indices.length)] } };
  }
  if (state.phase === 'HUNT_CONFIRM') return { seat: state.currentTurn, type: 'hunt.attack', payload: { cardIndex: null } };
  if (state.phase === 'HUNT_SELECT_CARD_FROM_PUBLIC') return { seat: state.currentTurn, type: 'hunt.loot',
    payload: { cardIndices: Array.from({ length: state._huntLoot.count }, (_value, index) => index) } };
  if (state.phase === 'GRAVE_DIG_SELECT') return { seat: ad.playerIndex ?? state.currentTurn, type: 'grave.choose', payload: { cardIndex: 0 } };
  if (state.phase === 'IGNITE_TORCH_DISCARD') return { seat: ad.playerIndex ?? state.currentTurn, type: 'torch.discard', payload: { cardIndex: 0 } };
  if (state.phase === 'ALBINO_CREATURE_SELECT_CARD') return { seat: ad.playerIndex ?? state.currentTurn, type: 'albino.reveal',
    payload: { cardIndex: state.players[ad.playerIndex ?? state.currentTurn].hand.findIndex(card => ad.fireCardIds.includes(card.id)) } };
  if (state.phase === 'NYA_BORROW') return { seat: state.currentTurn, type: 'nya.borrow', payload: { targetSeat: null } };
  if (state.phase === 'BURY_ALIVE_SELECT') {
    const seat = ad.targets.find(target => !ad.buryAliveChoices?.[target]);
    return seat === undefined ? null : { seat, type: 'bury.commit',
      payload: { cardIndex: Math.floor(ruleRandom() * state.players[seat].hand.length) } };
  }
  if (state.phase === 'ZHU_HIDE_AI_DRAW') return { seat: ad.zhuDecision?.ownerIdx ?? ad.zhuGuard?.ownerIdx,
    type: 'zhu.hide', payload: { hide: false } };
  if (state.phase === 'CAVE_DUEL_SELECT_CARD') {
    const duel = state._sealedDuel, seat = [duel.source, duel.target].find(index => !Object.hasOwn(duel.choices, index));
    return seat === undefined ? null : { seat, type: 'caveDuel.commit', payload: { cardIndex: 0 } };
  }
  if (state.phase === 'GOD_CHOICE') return { seat: ad.drawerIdx ?? state.currentTurn, type: 'god.choose',
    payload: { choice: ad.forcedConvert && legalGodChoices(state, ad.drawerIdx ?? state.currentTurn).includes('accept') ? 'accept' : 'discard' } };
  if (state.phase === 'FIRST_COME_PICK_SELECT') return { seat: ad.pickOrder[ad.pickIndex || 0], type: 'publicPick.choose', payload: { cardIndex: 0 } };
  if (state.phase === 'TORTOISE_ORACLE_SELECT') return { seat: ad.playerIndex ?? state.currentTurn, type: 'tortoise.choose', payload: { key: ad.selectableKeys[0] } };
  if (state.phase === 'DECIPHER_STONE_CARVING') return { seat: ad.playerIndex ?? state.currentTurn, type: 'stone.arrange',
    payload: { handIndex: 0, topIndices: ad.revealedCards.slice(1).map((_card, index) => index + 1).reverse(), bottomIndices: [] } };
  if (state.phase === 'SAME_ABYSS_SELECT') return { seat: ad.targetIdx, type: 'sameAbyss.choose', payload: { choice: 'discard' } };
  for (const [phase, kind, type] of [['CAVE_DUEL_SELECT_TARGET', 'caveDuel', 'caveDuel.selectTarget'], ['PEEK_HAND_SELECT_TARGET', 'peekHand', 'peek.selectTarget']]) {
    if (state.phase === phase) return { seat: ad[`${kind}Source`] ?? state.currentTurn, type,
      payload: { targetSeat: ad[`${kind}Targets`].find(index => !state.players[index].isDead && state.players[index].hand.length) } };
  }
  if (state.phase === 'SHU_SELECT_TARGET') return { seat: ad.shuChooserIdx ?? state.currentTurn, type: 'shu.selectTarget',
    payload: { targetSeat: state.players.findIndex(player => !player.isDead && !player.godPowerImmuneThisTurn) } };
  for (const [phase, kind, type] of [['ZONE_SWAP_SELECT_TARGET', 'zoneSwap', 'zoneSwap.selectTarget'],
    ['DAMAGE_LINK_SELECT_TARGET', 'damageLink', 'damageLink.selectTarget'], ['ROSE_THORN_SELECT_TARGET', 'roseThorn', 'roseThorn.selectTarget']]) {
    if (state.phase === phase) {
      const seat = ad[`${kind}Source`] ?? state.currentTurn;
      const targetSeat = (ad[`${kind}Targets`] || state.players.map((_player, index) => index))
        .find(index => index !== seat && !state.players[index].isDead);
      return { seat, type, payload: { targetSeat } };
    }
  }
  return null;
}
