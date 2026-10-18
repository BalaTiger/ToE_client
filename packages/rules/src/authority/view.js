import { PROTOCOL_VERSION } from './command.js';
import { getZhuLitDeckCards, findZhuOwner } from '../game/zhuPower.js';
import { remainingHounds, houndsRunning } from './clocks.js';
import { isBlackGoatYoung, isTsathogguaSlime } from '../game/coreUtils.js';

const FACE_KEYS = ['name', 'desc', 'key', 'letter', 'number', 'type', 'val', 'forced', 'isZone', 'isGod', 'godKey', 'shortKey', 'flavorText', 'isBlackGoatYoung', 'isTsathogguaSlime'];
function scalarFields(source, keys) {
  return Object.fromEntries(keys.filter(key => source?.[key] !== undefined
    && ['string', 'number', 'boolean'].includes(typeof source[key])).map(key => [key, source[key]]));
}
function face(card, handleForCard, viewerSeat) {
  return { ...scalarFields(card, FACE_KEYS), id: handleForCard(viewerSeat, card.id) };
}
function publicEvent(event, handleForCard, seat) {
  if (event.excludeSeat !== undefined && event.excludeSeat === seat) return null;
  if (event?.visibility === 'public' && event.type === 'sphinxRevealed') return {
    ...scalarFields(event, ['id', 'type', 'seat', 'correct']), card: face(event.card, handleForCard, seat),
  };
  if (event?.visibility === 'public' && event.type === 'cardRevealed') return {
    ...scalarFields(event, ['id', 'type', 'seat', 'reason']), card: face(event.card, handleForCard, seat),
  };
  if (event?.visibility === 'public' && event.type === 'caveDuelRevealed') return {
    ...scalarFields(event, ['id', 'type', 'sourceSeat', 'targetSeat', 'winnerSeat']),
    sourceCard: face(event.sourceCard, handleForCard, seat), targetCard: face(event.targetCard, handleForCard, seat),
  };
  const keys = {
    turnStarted: ['id', 'type', 'seat', 'turn'],
    playerStatsChanged: ['id', 'type', 'seat', 'hp', 'san'],
    cardCountChanged: ['id', 'type', 'seat', 'count'],
    diceRolled: ['id', 'type', 'seat', 'roll', 'purpose'],
    targetSelected: ['id', 'type', 'seat', 'targetSeat', 'reason'],
    statChanged: ['id', 'type', 'seat', 'kind', 'fromHp', 'hp', 'fromSan', 'san', 'defeated'],
    cardsMoved: ['id', 'type', 'fromSeat', 'toSeat', 'count'],
  }[event?.type];
  return event?.visibility === 'public' && keys ? scalarFields(event, keys) : null;
}
export function projectMatch(match, viewer, { handleForCard, actions = {}, now = match.turnClock?.lastAt ?? 0 }) {
  if (typeof handleForCard !== 'function') throw new TypeError('Missing host card handle encoder');
  const seat = viewer?.permission === 'player' && Number.isInteger(viewer.seat)
    && match.state.players?.[viewer.seat] ? viewer.seat : null;
  const gs = match.state;
  const players = gs.players.map((player, index) => {
    // A private take is one unfinished exchange. Nonactors retain their prior
    // hand view until the give/cancel commits, including on reconnect.
    if (gs._privateSwap && seat !== gs._privateSwap.source) player = { ...player,
      hand: gs._privateSwap.baselineHands[index] };
    const visibleHand = seat === index || player.revealHand === true;
    return { seat: index, ...scalarFields(player, ['name', 'hp', 'san', 'isDead', 'isResting', 'roleRevealed', 'revealHand',
      'godName', 'godLevel', 'godEncounterCount', 'godEncounters', 'disableRest', 'disableSkill', 'etherealizeStacks', 'damageBonus', 'godPowerImmuneThisTurn']),
      ...(seat === index || player.roleRevealed ? { role: player.role } : {}),
      ...(seat === index ? scalarFields(player, ['_nyaBorrow', '_nyaHandLimit', 'handLimitDecrease']) : {}),
      handCount: player.hand?.length || 0,
      ...(visibleHand ? { hand: (player.hand || []).map(card => face(card, handleForCard, seat)) } : {}),
      ...(!visibleHand && player.hand?.some(card => isBlackGoatYoung(card) || isTsathogguaSlime(card)) ? {
        publicTokens: player.hand.filter(card => isBlackGoatYoung(card) || isTsathogguaSlime(card)).map(card => face(card, handleForCard, seat)),
      } : {}),
      godZone: (player.godZone || []).map(card => face(card, handleForCard, seat)),
      zoneCards: (player.zoneCards || []).map(card => face(card, handleForCard, seat)) };
  });
  const legalActions = seat === null || gs.players[seat].isDead || gs.gameOver ? [] : Object.entries(actions)
    .filter(([, action]) => action.phases.includes(gs.phase) && action.available?.(gs, seat))
    .map(([type, action]) => ({ type, ...(action.describe?.(gs, seat, id => handleForCard(seat, id)) || {}) }));
  return { version: PROTOCOL_VERSION, matchId: match.id, revision: match.revision, viewerSeat: seat,
    phase: gs.phase, currentSeat: gs.currentTurn, turn: gs.turn,
    turnFlags: { skillUsed: !!gs.skillUsed, restUsed: !!gs.restUsed, multiplyUsed: !!gs.multiplyUsed,
      godFromHandUsed: !!gs.godFromHandUsed, abandonedTargets: [...(gs.huntAbandoned || [])] },
    ...(match.houndsClock ? { hounds: { remainingMs: remainingHounds(match, now),
      deadline: houndsRunning(gs) ? now + remainingHounds(match, now) : null } } : {}),
    players, deckCount: gs.deck?.length || 0, inspectionDeckCount: gs.inspectionDeck?.length || 0,
    ...(gs.abilityData?.swapTi !== undefined ? { swapTargetSeat: gs.abilityData.swapTi } : {}),
    ...(gs.phase === 'BEWITCH_SELECT_TARGET' && seat === gs.currentTurn ? {
      bewitchCardIndex: gs.players[seat].hand.findIndex(card => card.id === gs.abilityData.bewitchCardId),
    } : {}),
    ...(gs.abilityData?.huntTi !== undefined ? { hunt: { targetSeat: gs.abilityData.huntTi,
      ...(gs.abilityData.revCard ? { revealedCard: face(gs.abilityData.revCard, handleForCard, seat) } : {}) } } : {}),
    discard: (gs.discard || []).map(card => face(card, handleForCard, seat)),
    inspectionDiscard: (gs.inspectionDiscard || []).map(card => face(card, handleForCard, seat)),
    ...(gs.drawReveal?.card ? { draw: {
      owner: gs.drawReveal.drawerIdx ?? gs.currentTurn,
      forcedKeep: !!gs.drawReveal.forcedKeep,
      ...(seat === (gs.drawReveal.drawerIdx ?? gs.currentTurn)
        && (gs.drawReveal.blindZoneIdentity || gs.drawReveal.card.blindZoneIdentity)
        ? { hidden: true } : { card: face(gs.drawReveal.card, handleForCard, seat) }),
    } } : {}),
    ...(gs.phase === 'GOD_CHOICE' && gs.abilityData.godCard ? {
      godEncounter: { owner: gs.abilityData.drawerIdx ?? gs.currentTurn,
        card: face(gs.abilityData.godCard, handleForCard, seat), forcedConvert: !!gs.abilityData.forcedConvert },
    } : {}),
    ...(seat !== null && seat === findZhuOwner(gs.players) && gs.zhuLight?.ownerIdx === seat ? {
      litDeck: getZhuLitDeckCards(gs.zhuLight, gs.deck).map(({ card, deckIndex }) => ({
        card: face(card, handleForCard, seat), deckIndex,
      })),
    } : {}),
    ...(['FIRST_COME_PICK_SELECT', 'TORTOISE_ORACLE_SELECT'].includes(gs.phase) ? {
      publicReveals: (gs.abilityData?.revealedCards || []).map(card => face(card, handleForCard, seat)),
    } : {}),
    ...(gs.phase === 'GRAVE_DIG_SELECT' ? {
      publicReveals: (gs.abilityData.godCards || []).map(card => face(card, handleForCard, seat)),
    } : {}),
    ...(gs.phase === 'DECIPHER_STONE_CARVING' && seat !== null
      && (gs.abilityData.playerIndex ?? gs.currentTurn) === seat ? {
        privateReveals: (gs.abilityData.revealedCards || []).map(card => face(card, handleForCard, seat)),
      } : {}),
    decision: { id: match.decision.id, deadline: match.decision.deadline, actions: legalActions },
    // Raw gs.log, abilityData and visual graphs are deliberately not wire data.
    ...(gs._sealedDuel ? { duel: { sourceSeat: gs._sealedDuel.source, targetSeat: gs._sealedDuel.target,
      ...(seat !== null && gs._sealedDuel.choices[seat] ? { lockedCardIndex: gs._sealedDuel.choices[seat].index } : {}) } } : {}),
    ...(gs.phase === 'BURY_ALIVE_SELECT' && seat !== null && gs.abilityData.buryAliveChoices?.[seat] ? {
      bury: { lockedCardIndex: gs.abilityData.buryAliveChoices[seat].index },
    } : {}),
    events: match.publicEvents.map(event => publicEvent(event, handleForCard, seat)).filter(Boolean),
    peeks: match.grants.filter(grant => seat !== null && !gs.players[seat].isDead && grant.viewerSeat === seat
      && grant.decisionId === match.decision.id).map(grant => ({ targetSeat: grant.targetSeat,
        cards: grant.cards.map(card => face(card, handleForCard, seat)) })),
    ...(gs.gameOver ? { gameOver: scalarFields(gs.gameOver, ['winner', 'reason', 'winnerIdx', 'winnerIdx2']) } : {}) };
}
