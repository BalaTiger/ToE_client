import { PROTOCOL_VERSION } from './command.js';
import { getZhuLitDeckCards, findZhuOwner } from '../game/zhuPower.js';
import { remainingHounds, houndsRunning } from './clocks.js';
import { isBlackGoatYoung, isTsathogguaSlime } from '../game/coreUtils.js';
import { getAllDamageLinks } from '../game/damageLinks.js';

const FACE_KEYS = ['name', 'desc', 'key', 'letter', 'number', 'type', 'val', 'forced', 'isZone', 'isGod', 'godKey', 'shortKey', 'flavorText', 'isBlackGoatYoung', 'isTsathogguaSlime'];
function scalarFields(source, keys) {
  return Object.fromEntries(keys.filter(key => source?.[key] !== undefined
    && ['string', 'number', 'boolean'].includes(typeof source[key])).map(key => [key, source[key]]));
}
function face(card, handleForCard, viewerSeat) {
  return { ...scalarFields(card, FACE_KEYS), id: handleForCard(viewerSeat, card.id) };
}
const list = value => Array.isArray(value) ? value : [];
const linkHandle = (sourceLinkId, handleForCard, seat) => `public-link:${handleForCard(seat, `link:${sourceLinkId}`)}`;
const eventFaces = (cards, event, handleForCard, seat) => list(cards).filter(card => card && typeof card === 'object')
  .map((card, index) => card.id === undefined ? { ...scalarFields(card, FACE_KEYS), id: `${event.id}:card:${index}` }
    : face(card, handleForCard, seat));
// Match the original map renderer's presentation selection, after authority
// has already declared the winner. This never decides who won or exposes
// unrelated cards in the winner's hand.
function treasureMapCards(hand) {
  const remaining = list(hand).filter(card => !card.isGod), chosen = [], letters = new Set(), numbers = new Set();
  while ((letters.size < 4 || numbers.size < 4) && remaining.length) {
    let bestIndex = 0, bestScore = -1;
    remaining.forEach((card, index) => {
      const score = Number(!letters.has(card.letter)) + Number(!numbers.has(card.number));
      if (score > bestScore) { bestIndex = index; bestScore = score; }
    });
    const [card] = remaining.splice(bestIndex, 1); chosen.push(card); letters.add(card.letter); numbers.add(card.number);
  }
  return chosen;
}
function publicEvent(event, handleForCard, seat) {
  if (event.excludeSeat !== undefined && event.excludeSeat === seat) return null;
  if (event?.visibility === 'public' && event.type === 'sphinxRevealed') return {
    ...scalarFields(event, ['id', 'type', 'seat', 'correct']), card: face(event.card, handleForCard, seat),
  };
  if (event?.visibility === 'public' && event.type === 'cardRevealed') return {
    ...scalarFields(event, ['id', 'type', 'seat', 'reason', 'sourcePile']), card: event.card?.id === undefined
      ? { ...scalarFields(event.card, FACE_KEYS), id: `${event.id}:card` } : face(event.card, handleForCard, seat),
  };
  if (event?.visibility === 'public' && ['huntAttack', 'bewitchGiven'].includes(event.type)) return {
    ...scalarFields(event, ['id', 'type', 'sourceSeat', 'targetSeat']), card: face(event.card, handleForCard, seat),
  };
  if (event?.visibility === 'public' && event.type === 'swapTakeCommitted') {
    if (seat === null || seat !== event.sourceSeat || !event.card) return null;
    return { ...scalarFields(event, ['id', 'type', 'sourceSeat', 'targetSeat', 'sourceCount', 'targetCount', 'blind']),
      card: eventFaces([event.card], event, handleForCard, seat)[0] };
  }
  if (event?.visibility === 'public' && event.type === 'swapCommitted') {
    const participant = seat === event.sourceSeat || seat === event.targetSeat;
    return { ...scalarFields(event, ['id', 'type', 'sourceSeat', 'targetSeat', 'count', 'sourceCount', 'targetCount']),
      takeAlreadyPresented: seat === event.sourceSeat,
      ...(event.takenCard && (participant || event.takenPublic === true) ? { takenCard: face(event.takenCard, handleForCard, seat) } : {}),
      ...(event.givenCard && (participant || event.givenPublic === true) ? { givenCard: face(event.givenCard, handleForCard, seat) } : {}),
    };
  }
  if (event?.visibility === 'public' && event.type === 'caveDuelRevealed') return {
    ...scalarFields(event, ['id', 'type', 'sourceSeat', 'targetSeat', 'winnerSeat', 'sourceCount', 'targetCount']),
    sourceCard: face(event.sourceCard, handleForCard, seat), targetCard: face(event.targetCard, handleForCard, seat),
  };
  if (event?.visibility === 'public' && event.type === 'inspectionRevealed') return {
    ...scalarFields(event, ['id', 'type', 'seat', 'hiddenDrawCount', 'discardCount']),
    inspectionCard: { ...scalarFields(event.inspectionCard,
      ['name', 'effect', 'type', 'value', 'triggerCount', 'durationTurns', 'timeoutSeconds', 'damage']), id: `${event.id}:inspection` },
    ...(Array.isArray(event.discards) ? { discards: event.discards.filter(item => Number.isInteger(item.seat) && item.seat >= 0
      && item.card && ['discard', 'destroyed'].includes(item.destination)).map((item, index) => ({
      seat: item.seat, destination: item.destination,
      card: eventFaces([item.card], { id: `${event.id}:${index}` }, handleForCard, seat)[0],
    })) } : {}),
  };
  if (event?.visibility === 'public' && event.type === 'huntLootTransferred') {
    const receipts = list(event.lootCards).filter(item => item?.card);
    return { ...scalarFields(event, ['id', 'type', 'sourceSeat', 'targetSeat', 'count', 'sourceCount', 'targetCount']),
      ...(receipts.length ? { cards: receipts.map((item, index) => item.public === true
        ? eventFaces([item.card], { id: `${event.id}:${index}` }, handleForCard, seat)[0] : { _back: true }),
      ...(seat === event.targetSeat ? { receivedCards: eventFaces(receipts.map(item => item.card), event, handleForCard, seat) } : {}),
      ...(seat === event.sourceSeat ? { sentCards: eventFaces(receipts.map(item => item.card), event, handleForCard, seat) } : {}) } : {}) };
  }
  if (event?.visibility === 'public' && event.type === 'areaEffectStarted'
    && ['undergroundSpring', 'startledBats', 'nightWind', 'volcano', 'geomagneticReversal', 'etherealizeGain', 'snakeTrap'].includes(event.kind)) return {
    ...scalarFields(event, ['id', 'type', 'kind', 'seat', 'stackCount', 'rayCount']),
    ...(event.kind === 'geomagneticReversal' && event.restoreCard ? { restoreCard: {
      ...scalarFields(event.restoreCard, FACE_KEYS), id: `${event.id}:restore`,
    } } : {}),
    ...(event.kind === 'snakeTrap' ? {
      assignments: (Array.isArray(event.assignments) ? event.assignments : [])
        .filter(item => Number.isInteger(item.seat) && item.seat >= 0 && Number.isInteger(item.count) && item.count > 0)
        .map(item => ({ seat: item.seat, count: item.count })),
      hits: (Array.isArray(event.hits) ? event.hits : []).filter(index => Number.isInteger(index) && index >= 0),
    } : {}),
  };
  if (event?.visibility === 'public' && event.type === 'cardIncomeCommitted'
    && ['hand', 'discard', 'zone', 'godZone'].includes(event.destination)
    && ['reveal', 'generated', 'hand'].includes(event.source) && event.card) return {
    ...scalarFields(event, ['id', 'type', 'seat', 'destination', 'source']), card: face(event.card, handleForCard, seat),
  };
  if (event?.visibility === 'public' && event.type === 'cardsDiscarded'
    && ['earthquake', 'forcedRandomDiscard', 'handLimit', 'torch'].includes(event.kind)) return {
    ...scalarFields(event, ['id', 'type', 'kind']),
    discards: list(event.discards).filter(item => Number.isInteger(item.seat) && item.seat >= 0 && item.card
      && ['discard', 'destroyed'].includes(item.destination)).map((item, index) => ({
      seat: item.seat, destination: item.destination,
      card: item.destination === 'destroyed' && item.card.type === 'blankZone'
        ? { _back: true, id: handleForCard(seat, item.card.id) }
        : eventFaces([item.card], { id: `${event.id}:${index}` }, handleForCard, seat)[0],
    })),
  };
  if (event?.visibility === 'public' && event.type === 'deathCardsRemoved') return {
    ...scalarFields(event, ['id', 'type', 'seat']),
    discardedCards: eventFaces(event.discardedCards, event, handleForCard, seat),
    destroyedCount: Number.isInteger(event.destroyedCount) && event.destroyedCount >= 0 ? event.destroyedCount : 0,
  };
  if (event?.visibility === 'public' && event.type === 'publicTokensGranted'
    && ['blackGoat', 'tsathogguaSlime'].includes(event.kind)) return {
    ...scalarFields(event, ['id', 'type', 'kind', 'seat', 'sourceSeat', 'targetSeat', 'count']),
    cards: eventFaces(list(event.cards).filter(card => event.kind === 'blackGoat' ? isBlackGoatYoung(card) : isTsathogguaSlime(card)),
      event, handleForCard, seat),
  };
  if (event?.visibility === 'public' && ['handsSwapped', 'hiddenHandTransferred'].includes(event.type)) {
    const received = seat === event.targetSeat ? event.targetReceivedCards
      : event.type === 'handsSwapped' && seat === event.sourceSeat ? event.sourceReceivedCards : null;
    return { ...scalarFields(event, ['id', 'type', 'sourceSeat', 'targetSeat', 'count', 'sourceCount', 'targetCount']),
      ...(Array.isArray(received) ? { receivedSeat: seat, receivedCards: eventFaces(received, event, handleForCard, seat) } : {}) };
  }
  if (event?.visibility === 'public' && event.type === 'publicCardRetrieved' && event.source === 'discard') return {
    ...scalarFields(event, ['id', 'type', 'seat', 'source']), card: eventFaces([event.card], event, handleForCard, seat)[0],
  };
  if (event?.visibility === 'public' && event.type === 'publicCardsDiscarded' && event.source === 'godZone') return {
    ...scalarFields(event, ['id', 'type', 'seat', 'source']), cards: eventFaces(event.cards, event, handleForCard, seat),
  };
  if (event?.visibility === 'public' && event.type === 'tsgSlimePopped') return {
    ...scalarFields(event, ['id', 'type', 'seat', 'count', 'fromHp', 'hp', 'fromSan', 'san']),
    poppedCards: eventFaces(list(event.poppedCards).filter(isTsathogguaSlime), event, handleForCard, seat),
  };
  if (event?.visibility === 'public' && event.type === 'endlessCorridorStarted') return {
    ...scalarFields(event, ['id', 'type', 'seat']), cards: eventFaces(event.cards, event, handleForCard, seat),
  };
  if (event?.visibility === 'public' && event.type === 'buriedToDeck' && event.destination === 'deckBottom') return {
    ...scalarFields(event, ['id', 'type', 'seat', 'count', 'sourceCount', 'destination']),
    cards: seat === event.seat ? eventFaces(event.cards, event, handleForCard, seat) : list(event.cards).map(() => ({ _back: true })),
  };
  if (event?.visibility === 'public' && event.type === 'zhuCardHidden'
    && ['turnDraw', 'tsgSlime', 'cthRest', 'sphinx', 'proliferatingZ'].includes(event.source)) return {
    ...scalarFields(event, ['id', 'type', 'seat', 'source']),
    card: seat === event.seat ? eventFaces([event.card], event, handleForCard, seat)[0] : { _back: true },
  };
  if (event?.visibility === 'public' && event.type === 'stoneCardsArranged'
    && Number.isInteger(event.seat) && event.seat >= 0 && event.keptCard) return {
    ...scalarFields(event, ['id', 'type', 'seat', 'handCount', 'returnedCount']),
    keptCard: seat === event.seat ? eventFaces([event.keptCard], event, handleForCard, seat)[0] : { _back: true },
    ...(seat === event.seat ? {
      topCards: eventFaces(event.topCards, event, handleForCard, seat),
      bottomCards: eventFaces(event.bottomCards, event, handleForCard, seat),
    } : {}),
  };
  if (event?.visibility === 'public' && event.type === 'immortalRevealed') return {
    ...scalarFields(event, ['id', 'type', 'seat', 'succeeded']),
    cards: (event.cards || []).map((card, index) => ({ ...scalarFields(card, FACE_KEYS), id: `${event.id}:reveal:${index}` })),
  };
  if (event?.visibility === 'public' && ['damageLinkBroken', 'damageLinkExpired'].includes(event.type)
    && Array.isArray(event.pair) && event.pair.length === 2 && event.pair.every(index => Number.isInteger(index) && index >= 0)) return {
    ...scalarFields(event, ['id', 'type']), pair: [...event.pair],
    ...(typeof event.sourceLinkId === 'string' ? { linkId: linkHandle(event.sourceLinkId, handleForCard, seat) } : {}),
  };
  if (event?.visibility === 'public' && event.type === 'damageLinkEstablished') return {
    ...scalarFields(event, ['id', 'type', 'sourceSeat', 'targetSeat']),
    ...(typeof event.sourceLinkId === 'string' ? { linkId: linkHandle(event.sourceLinkId, handleForCard, seat) } : {}),
  };
  const keys = {
    turnStarted: ['id', 'type', 'seat', 'turn'],
    playerStatsChanged: ['id', 'type', 'seat', 'hp', 'san'],
    cardCountChanged: ['id', 'type', 'seat', 'count'],
    diceRolled: ['id', 'type', 'seat', 'roll', 'purpose'],
    restRolled: ['id', 'type', 'seat', 'd1', 'd2'],
    skillStarted: ['id', 'type', 'kind', 'sourceSeat', 'targetSeat'],
    swapCommitted: ['id', 'type', 'sourceSeat', 'targetSeat', 'count'],
    huntResolved: ['id', 'type', 'sourceSeat', 'targetSeat', 'outcome'],
    huntLootTransferred: ['id', 'type', 'sourceSeat', 'targetSeat', 'count'],
    damageLinkEstablished: ['id', 'type', 'sourceSeat', 'targetSeat'],
    targetSelected: ['id', 'type', 'seat', 'targetSeat', 'reason'],
    statChanged: ['id', 'type', 'seat', 'kind', 'fromHp', 'hp', 'fromSan', 'san', 'defeated', 'cause', 'cardSettlementPending', 'revealedRole'],
    burrowingWorm: ['id', 'type', 'seat'],
    burrowingWormTarget: ['id', 'type', 'sourceSeat', 'targetSeat'],
    throwStone: ['id', 'type', 'sourceSeat', 'targetSeat', 'roll', 'distance', 'damage'],
    apophisEclipse: ['id', 'type', 'seat'],
    apophisTarget: ['id', 'type', 'sourceSeat', 'selectedSeat', 'targetSeat', 'roll', 'changed'],
    godPowerBlocked: ['id', 'type', 'seat'],
    godStatusChanged: ['id', 'type', 'seat', 'godKey', 'godLevel'],
    cthulhuDream: ['id', 'type', 'seat'],
    etherealizeConsumed: ['id', 'type', 'sourceSeat', 'targetSeat', 'lostHp', 'lostSan', 'stacksBefore', 'stacksAfter'],
    blackGoatPulse: ['id', 'type', 'seat', 'count'],
    playerRestChanged: ['id', 'type', 'seat', 'isResting'],
    deckReshuffled: ['id', 'type', 'count'],
    endlessCorridorStarted: ['id', 'type', 'seat'],
    cardsMoved: ['id', 'type', 'fromSeat', 'toSeat', 'count'],
  }[event?.type];
  return event?.visibility === 'public' && keys ? scalarFields(event, keys) : null;
}
export function projectMatch(match, viewer, { handleForCard, actions = {}, now = match.turnClock?.lastAt ?? 0 }) {
  if (typeof handleForCard !== 'function') throw new TypeError('Missing host card handle encoder');
  const seat = viewer?.permission === 'player' && Number.isInteger(viewer.seat)
    && match.state.players?.[viewer.seat] ? viewer.seat : null;
  const gs = match.state;
  const projectPlayers = (sourcePlayers, applyPrivateSwap = false) => {
  const publicLinks = getAllDamageLinks(sourcePlayers, { activeOnly: true }).map(link => ({
    id: linkHandle(link.id, handleForCard, seat), a: link.a, b: link.b,
  }));
  return sourcePlayers.map((player, index) => {
    // A private take is one unfinished exchange. Nonactors retain their prior
    // hand view until the give/cancel commits, including on reconnect.
    if (applyPrivateSwap && gs._privateSwap && seat !== gs._privateSwap.source) player = { ...player,
      hand: gs._privateSwap.baselineHands[index] };
    const visibleHand = seat === index || player.revealHand === true;
    return { seat: index, ...scalarFields(player, ['name', 'hp', 'san', 'isDead', 'isResting', 'roleRevealed', 'revealHand',
      'godName', 'godLevel', 'godEncounterCount', 'godEncounters', 'disableRest', 'disableSkill', 'etherealizeStacks', 'poisonStacks', 'damageBonus', 'godPowerImmuneThisTurn']),
      ...(seat === index || player.roleRevealed ? { role: player.role } : {}),
      ...(seat === index ? scalarFields(player, ['_nyaBorrow', '_nyaHandLimit', 'handLimitDecrease']) : {}),
      handCount: player.hand?.length || 0,
      damageLinks: publicLinks.filter(link => link.a === index || link.b === index)
        .map(link => ({ id: link.id, partner: link.a === index ? link.b : link.a, active: true })),
      ...(visibleHand ? { hand: (player.hand || []).map(card => face(card, handleForCard, seat)) } : {}),
      ...(!visibleHand && player.hand?.some(card => isBlackGoatYoung(card) || isTsathogguaSlime(card)) ? {
        publicTokens: player.hand.filter(card => isBlackGoatYoung(card) || isTsathogguaSlime(card)).map(card => face(card, handleForCard, seat)),
      } : {}),
      godZone: (player.godZone || []).map(card => face(card, handleForCard, seat)),
      zoneCards: (player.zoneCards || []).map(card => face(card, handleForCard, seat)) };
  });
  };
  const players = projectPlayers(gs.players, true);
  const treasureWinners = gs.gameOver?.winner === '寻宝者'
    ? [...new Set([gs.gameOver.winnerIdx, gs.gameOver.winnerIdx2])]
      .filter(index => Number.isInteger(index) && index >= 0 && gs.players[index])
      .map(index => ({ seat: index, cards: treasureMapCards(gs.players[index].hand).map(card => face(card, handleForCard, seat)) })) : [];
  const legalActions = seat === null || gs.players[seat].isDead || gs.gameOver ? [] : Object.entries(actions)
    .filter(([, action]) => action.phases.includes(gs.phase) && action.available?.(gs, seat))
    .map(([type, action]) => ({ type, ...(action.describe?.(gs, seat, id => handleForCard(seat, id)) || {}) }));
  return { version: PROTOCOL_VERSION, matchId: match.id, revision: match.revision, viewerSeat: seat,
    phase: gs.phase, currentSeat: gs.currentTurn, turn: gs.turn, ...scalarFields(gs, ['expansionKey']),
    turnFlags: { skillUsed: !!gs.skillUsed, restUsed: !!gs.restUsed, multiplyUsed: !!gs.multiplyUsed,
      godFromHandUsed: !!gs.godFromHandUsed, abandonedTargets: [...(gs.huntAbandoned || [])] },
    ...(match.houndsClock ? { hounds: { remainingMs: remainingHounds(match, now),
      deadline: houndsRunning(gs) ? now + remainingHounds(match, now) : null } } : {}),
    players, ...(match.revision === 0 && Array.isArray(match.openingPlayers)
      ? { openingPlayers: projectPlayers(match.openingPlayers) } : {}),
    deckCount: gs.deck?.length || 0, inspectionDeckCount: gs.inspectionDeck?.length || 0,
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
    ...(gs.gameOver ? { gameOver: scalarFields(gs.gameOver, ['winner', 'reason', 'winnerIdx', 'winnerIdx2']),
      ...(treasureWinners.length ? { treasureWinners } : {}) } : {}) };
}
