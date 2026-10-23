// This is a recipient-only display model, never a canonical game state.
const PLAYER_FIELDS = ['name', 'hp', 'san', 'isDead', 'isResting', 'roleRevealed', 'revealHand',
  'godName', 'godLevel', 'godEncounterCount', 'godEncounters', 'disableRest', 'disableSkill',
  'etherealizeStacks', 'poisonStacks', 'damageBonus', 'godPowerImmuneThisTurn'];
const CARD_FIELDS = ['id', 'name', 'desc', 'key', 'letter', 'number', 'type', 'val', 'forced',
  'isZone', 'isGod', 'godKey', 'shortKey', 'flavorText', 'isBlackGoatYoung', 'isTsathogguaSlime'];
export const UNKNOWN_ROLE_INFO = Object.freeze({ icon: '？', col: '#a9987a', name: '身份未揭晓', skill: '' });
const scalars = (source, fields) => Object.fromEntries(fields.filter(key =>
  ['string', 'number', 'boolean'].includes(typeof source?.[key])).map(key => [key, source[key]]));
const cardFace = card => scalars(card, CARD_FIELDS);
const cardFaces = cards => (Array.isArray(cards) ? cards : []).map(cardFace);
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}

export function createSeatMapping(view) {
  const seats = view.players.map((player, index) => player.seat ?? index);
  if (new Set(seats).size !== seats.length || seats.some(seat => !Number.isSafeInteger(seat) || seat < 0)) {
    throw new TypeError('Invalid authority player seats');
  }
  const ownIndex = view.viewerSeat === null ? -1 : seats.indexOf(view.viewerSeat);
  if (view.viewerSeat !== null && ownIndex < 0) throw new TypeError('Invalid authority viewer seat');
  const displayToServer = ownIndex < 0 ? seats : [...seats.slice(ownIndex), ...seats.slice(0, ownIndex)];
  const serverToDisplay = new Map(displayToServer.map((seat, index) => [seat, index]));
  return {
    displayToServer,
    toDisplaySeat: seat => seat === null || seat === undefined ? null : serverToDisplay.get(seat) ?? null,
    toServerSeat: index => Number.isSafeInteger(index) && index >= 0 ? displayToServer[index] ?? null : null,
  };
}

function displayAction(action, toDisplaySeat) {
  const next = scalars(action, ['type', 'role', 'allowSkip', 'allowAbandon', 'count', 'afterHp', 'afterSan', 'lostHp', 'lostSan']);
  for (const key of ['cardIndices', 'keys', 'choices']) if (Array.isArray(action[key])) next[key] = [...action[key]];
  for (const key of ['targetSeats', 'targets']) if (Array.isArray(action[key])) next[key] = action[key].map(toDisplaySeat).filter(seat => seat !== null);
  if (action.actorSeat !== undefined) next.actorSeat = toDisplaySeat(action.actorSeat);
  return next;
}

export function createAuthorityPresentation(view, { offline = false } = {}) {
  if (!view || view.version !== 2 || !Array.isArray(view.players) || !Array.isArray(view.decision?.actions)) {
    throw new TypeError('Missing authority recipient view');
  }
  const mapping = createSeatMapping(view), { toDisplaySeat, toServerSeat } = mapping;
  const bySeat = new Map(view.players.map((player, index) => [player.seat ?? index, player]));
  const players = mapping.displayToServer.map((seat, index) => {
    const player = bySeat.get(seat), own = seat === view.viewerSeat;
    const visible = own || player.revealHand === true;
    const roleKnown = !!(own || player.roleRevealed) && typeof player.role === 'string';
    const handCount = count(player.handCount);
    const publicTokens = cardFaces(player.publicTokens).filter(card => card.isBlackGoatYoung || card.isTsathogguaSlime).slice(0, handCount);
    const hand = visible ? cardFaces(player.hand) : [
      ...Array.from({ length: Math.max(0, handCount - publicTokens.length) }, (_, slot) => ({
        id: `authority-hidden:${view.matchId}:${seat}:${slot}`, _back: true, _authorityHidden: true,
      })), ...publicTokens,
    ];
    return {
      ...scalars(player, PLAYER_FIELDS), id: index, seat, handCount, hand, handVisible: visible,
      roleKnown, ...(!roleKnown ? { roleInfo: UNKNOWN_ROLE_INFO } : {}),
      ...(own || player.roleRevealed ? scalars(player, ['role']) : {}),
      ...(own ? scalars(player, ['_nyaBorrow', '_nyaHandLimit', 'handLimitDecrease']) : {}),
      publicTokens, godZone: cardFaces(player.godZone), zoneCards: cardFaces(player.zoneCards),
      damageLinks: (player.damageLinks || []).filter(link => typeof link?.id === 'string'
        && link.id.startsWith('public-link:') && toDisplaySeat(link.partner) !== null)
        .map(link => ({ id: link.id, partner: toDisplaySeat(link.partner), active: link.active === true })),
    };
  });
  const me = view.viewerSeat === null ? null : players[0];
  const actions = (me && !me.isDead && !view.gameOver ? view.decision.actions : []).map(action => displayAction(action, toDisplaySeat));
  const actionByType = Object.fromEntries(actions.map(action => [action.type, action]));
  const draw = view.draw ? {
    owner: toDisplaySeat(view.draw.owner), forcedKeep: !!view.draw.forcedKeep,
    ...(view.draw.hidden ? { hidden: true } : view.draw.card ? { card: cardFace(view.draw.card) } : {}),
  } : null;
  const godEncounter = view.godEncounter ? { owner: toDisplaySeat(view.godEncounter.owner),
    card: cardFace(view.godEncounter.card), forcedConvert: !!view.godEncounter.forcedConvert } : null;
  const hunt = view.hunt ? { targetSeat: toDisplaySeat(view.hunt.targetSeat),
    ...(view.hunt.revealedCard ? { revealedCard: cardFace(view.hunt.revealedCard) } : {}) } : null;
  const duel = view.duel ? { sourceSeat: toDisplaySeat(view.duel.sourceSeat), targetSeat: toDisplaySeat(view.duel.targetSeat),
    ...(me && view.duel.lockedCardIndex !== undefined ? { lockedCardIndex: view.duel.lockedCardIndex } : {}) } : null;
  const publicReveals = cardFaces(view.publicReveals);
  const privateReveals = actionByType['stone.arrange'] ? cardFaces(view.privateReveals) : [];
  const peeks = me && !me.isDead ? (view.peeks || []).map(peek => ({ targetSeat: toDisplaySeat(peek.targetSeat), cards: cardFaces(peek.cards) })) : [];
  const litDeck = me && !me.isDead ? (view.litDeck || []).map(item => ({ card: cardFace(item.card), deckIndex: item.deckIndex })) : [];
  const abilityData = {};
  if (view.swapTargetSeat !== undefined) abilityData.swapTi = toDisplaySeat(view.swapTargetSeat);
  if (view.bewitchCardIndex !== undefined) abilityData.bewitchCardIndex = view.bewitchCardIndex;
  if (hunt) Object.assign(abilityData, { huntTi: hunt.targetSeat, ...(hunt.revealedCard ? { revCard: hunt.revealedCard } : {}) });
  if (duel) Object.assign(abilityData, { caveDuelSource: duel.sourceSeat, caveDuelTarget: duel.targetSeat });
  if (publicReveals.length || privateReveals.length) abilityData.revealedCards = privateReveals.length ? privateReveals : publicReveals;
  if (actionByType['grave.choose']) abilityData.godCards = publicReveals;
  if (godEncounter) Object.assign(abilityData, { godCard: godEncounter.card, drawerIdx: godEncounter.owner, forcedConvert: godEncounter.forcedConvert });
  const slime = actionByType['slime.answer'], etherealize = actionByType['etherealize.answer'];
  if (slime) Object.assign(abilityData, { targetIdx: 0, afterHp: slime.afterHp, afterSan: slime.afterSan });
  if (etherealize) Object.assign(abilityData, { targetIdx: 0, lostHp: etherealize.lostHp, lostSan: etherealize.lostSan });
  if (actionByType['etherealize.redirect']) Object.assign(abilityData, { targetIdx: 0, adjacentTargets: actionByType['etherealize.redirect'].targets });
  if (actionByType['tortoise.choose']) abilityData.selectableKeys = actionByType['tortoise.choose'].keys;
  if (actionByType['sameAbyss.choose']) Object.assign(abilityData, { targetIdx: 0,
    actorIdx: actionByType['sameAbyss.choose'].actorSeat, forceDiscard: actionByType['sameAbyss.choose'].choices?.length === 1 });
  const events = (view.events || []).map(event => {
    const next = scalars(event, ['id', 'type', 'correct', 'reason', 'turn', 'hp', 'san', 'count', 'roll', 'purpose', 'kind', 'fromHp', 'fromSan', 'defeated']);
    for (const key of ['seat', 'sourceSeat', 'targetSeat', 'fromSeat', 'toSeat', 'winnerSeat']) if (event[key] !== undefined) next[key] = toDisplaySeat(event[key]);
    for (const key of ['card', 'sourceCard', 'targetCard']) if (event[key]) next[key] = cardFace(event[key]);
    return next;
  });
  const gameOver = view.gameOver ? { ...scalars(view.gameOver, ['winner', 'reason']),
    ...(view.gameOver.winnerIdx !== undefined ? { winnerIdx: toDisplaySeat(view.gameOver.winnerIdx) } : {}),
    ...(view.gameOver.winnerIdx2 !== undefined ? { winnerIdx2: toDisplaySeat(view.gameOver.winnerIdx2) } : {}) } : null;
  const gs = {
    players, currentTurn: toDisplaySeat(view.currentSeat), phase: view.phase, turn: view.turn,
    expansionKey: view.expansionKey, deckCount: count(view.deckCount), inspectionDeckCount: count(view.inspectionDeckCount),
    discard: cardFaces(view.discard), inspectionDiscard: cardFaces(view.inspectionDiscard),
    ...Object.fromEntries(['skillUsed', 'restUsed', 'multiplyUsed', 'godFromHandUsed'].map(key => [key, !!view.turnFlags?.[key]])),
    huntAbandoned: (view.turnFlags?.abandonedTargets || []).map(toDisplaySeat).filter(seat => seat !== null),
    drawReveal: draw ? { drawerIdx: draw.owner, forcedKeep: draw.forcedKeep,
      ...(draw.hidden ? { blindZoneIdentity: true, card: { id: 'authority-hidden-draw', _back: true, blindZoneIdentity: true } } : { card: draw.card }) } : null,
    abilityData, gameOver, _isMP: !offline,
  };
  return freeze({ ...gs, gs, me, visualMe: me, visualPlayers: players, viewerSeat: view.viewerSeat,
    isSpectating: view.viewerSeat === null, matchId: view.matchId, revision: view.revision,
    displayStats: players.map(player => ({ hp: player.hp, san: player.san })),
    toDisplaySeat, toServerSeat, actions, actionByType, hasAction: type => Object.hasOwn(actionByType, type),
    decision: { id: view.decision.id, deadline: view.decision.deadline, actions },
    draw, godEncounter, hunt, duel, ...(me && view.bury ? { bury: { lockedCardIndex: view.bury.lockedCardIndex } } : {}),
    publicReveals, privateReveals, peeks, litDeck, events,
    ...(view.hounds ? { hounds: scalars(view.hounds, ['remainingMs', 'deadline']) } : {}),
    ...(view.status?.paused ? { status: { paused: view.status.paused } } : {}),
  });
}
