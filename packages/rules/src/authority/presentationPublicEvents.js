import { orderRuleResolutionEvents } from '../game/ruleResolutionTransaction.js';
import { isVanishingDerivedCard } from '../game/coreUtils.js';

const STAT_TYPES = new Set(['HP_LOSS', 'HP_GAIN', 'SAN_LOSS', 'SAN_GAIN',
  'HP_SAN_LOSS', 'HP_SAN_GAIN', 'PLAYER_DEFEATED', 'DAMAGE_LINK_BREAK']);
const CHILD_EVENTS = ['settlementEvents', 'encounterEvents', 'acceptanceEvents', 'visualEvents'];
const INSPECTION_STRINGS = ['name', 'effect', 'type'];
const INSPECTION_NUMBERS = ['value', 'triggerCount', 'durationTurns', 'timeoutSeconds', 'damage'];
const CARD_STRINGS = ['name', 'desc', 'key', 'letter', 'type', 'godKey', 'shortKey', 'flavorText'];
const CARD_NUMBERS = ['number', 'val'];
const CARD_FLAGS = ['forced', 'isZone', 'isGod', 'isBlackGoatYoung', 'isTsathogguaSlime'];
const AREA_EFFECTS = new Set(['undergroundSpring', 'startledBats', 'nightWind', 'volcano',
  'geomagneticReversal', 'etherealizeGain', 'snakeTrap']);
const list = value => Array.isArray(value) ? value : [];
const eventId = event => typeof event?.id === 'string' && event.id ? event.id : null;
const isSeat = value => Number.isInteger(value) && value >= 0;
const unique = values => [...new Set(values.filter(Boolean))];

function publicScalars(source, strings, numbers, flags = []) {
  return Object.fromEntries([
    ...strings.filter(key => typeof source?.[key] === 'string'),
    ...numbers.filter(key => Number.isFinite(source?.[key])),
    ...flags.filter(key => typeof source?.[key] === 'boolean'),
  ].map(key => [key, source[key]]));
}

function revealedFace(card) {
  // These are explicitly revealed cards, not a hand/deck projection. Card IDs
  // are unnecessary for this overlay and may encode private host identities.
  return publicScalars(card, CARD_STRINGS, CARD_NUMBERS, CARD_FLAGS);
}

function graphOf(state) {
  const visuals = [], stats = new Map(), scopes = new Map(), visited = new Set();
  const addStat = stat => {
    const id = eventId(stat);
    if (id && STAT_TYPES.has(stat.type) && !stats.has(id)) stats.set(id, stat);
  };
  list(state?._statEvents).forEach(addStat);
  const visit = events => {
    for (const event of orderRuleResolutionEvents(list(events))) {
      if (!event || visited.has(event)) continue;
      visited.add(event);
      visuals.push(event);
      const owned = list(event.statEvents).filter(stat => eventId(stat) && STAT_TYPES.has(stat.type));
      owned.forEach(stat => {
        addStat(stat);
        // The smallest explicit owner supplies local phase order. Numeric seq
        // alone must never group unrelated resolutions or identify a stat.
        const prior = scopes.get(stat.id);
        if (!prior || (prior.owner.type === 'statEvents' && event.type !== 'statEvents')
          || (prior.owner.type === event.type && owned.length < prior.stats.length)
          || event.type === 'inspection') scopes.set(stat.id, { owner: event, stats: owned });
      });
      CHILD_EVENTS.forEach(key => visit(event[key]));
    }
  };
  visit(state?._visualEvents);
  return { visuals, stats, scopes };
}

function orderedScope(scope) {
  // Only an explicitly owned batch is sorted. A global journal can contain
  // several independent settlements whose phase orders start at zero.
  return scope.map((stat, index) => ({ stat, index }))
    .sort((a, b) => (a.stat.phaseOrder ?? 0) - (b.stat.phaseOrder ?? 0) || a.index - b.index)
    .map(item => item.stat);
}

/**
 * SERVER ONLY: raw canonical stat records, including nested explicit owners.
 * Preserve journal order and insert missing records at their owner's explicit
 * neighbours. Never sort the complete journal by phaseOrder: that value is
 * local to a settlement. Conflicts are reported without rewriting history.
 * The caller must project individual allowed scalars, never serialize this.
 */
export function collectFreshPresentationStats(before, after, { onOrderConflict = () => {}, orderOwnedPhases = false } = {}) {
  const previous = graphOf(before), current = graphOf(after);
  const ordered = unique(list(after?._statEvents).map(eventId)).filter(id => current.stats.has(id));
  const report = (code, owner, ids) => onOrderConflict({ code, ownerEventId: eventId(owner),
    statEventIds: ids, ownerStatEventIds: unique(list(owner.statEvents).map(eventId)) });
  for (const owner of current.visuals) {
    const ids = unique(list(owner.statEvents).map(eventId)).filter(id => current.stats.has(id));
    for (let index = 0; index < ids.length; index++) {
      const id = ids[index];
      if (ordered.includes(id)) continue;
      const preceding = ids.slice(0, index).findLast(candidate => ordered.includes(candidate));
      const following = ids.slice(index + 1).find(candidate => ordered.includes(candidate));
      const left = preceding ? ordered.indexOf(preceding) : -1;
      const right = following ? ordered.indexOf(following) : ordered.length;
      if (left >= right) report('CONFLICTING_STAT_OWNER_ORDER', owner, [preceding, id, following]);
      const insertAt = left >= right ? left + 1 : following ? right : preceding ? left + 1 : ordered.length;
      ordered.splice(insertAt, 0, id);
    }
    const inJournalOrder = [...ids].sort((a, b) => ordered.indexOf(a) - ordered.indexOf(b));
    if (inJournalOrder.some((id, index) => id !== ids[index])) report('CONFLICTING_STAT_OWNER_ORDER', owner, ids);
    // An explicit owner is the scope for this warning. Only report; owners
    // may span separate phases, so this is not authority to reorder by number.
    for (let index = 1; index < inJournalOrder.length; index++) {
      const prior = current.stats.get(inJournalOrder[index - 1]);
      const next = current.stats.get(inJournalOrder[index]);
      if (Number.isFinite(prior.phaseOrder) && Number.isFinite(next.phaseOrder) && prior.phaseOrder > next.phaseOrder) {
        report('STAT_JOURNAL_PHASE_ORDER_CONFLICT', owner, [prior.id, next.id]);
      }
    }
  }
  if (orderOwnedPhases) {
    // The original stat compiler orders linked-damage phases within their
    // explicit settlement. Do the same before flattening that owner to wire
    // facts; never sort independent batches by a resetting phase number.
    for (const owner of current.visuals) {
      const owned = list(owner.statEvents).filter(stat => current.scopes.get(stat.id)?.owner === owner);
      if (!owned.some(stat => stat.type === 'DAMAGE_LINK_BREAK')) continue;
      const ids = new Set(owned.map(eventId));
      const slots = ordered.flatMap((id, index) => ids.has(id) ? [index] : []);
      const sorted = orderedScope(owned).map(eventId).filter(id => ordered.includes(id));
      if (slots.length !== sorted.length) continue;
      slots.forEach((slot, index) => { ordered[slot] = sorted[index]; });
    }
  }
  return ordered.filter(id => !previous.stats.has(id)).map(id => current.stats.get(id));
}

/**
 * Extract public presentation facts without comparing player snapshots.
 *
 * Return entries in canonical traversal order. `entry.event` is the ONLY wire
 * candidate. Every other property is SERVER-ONLY identity/order metadata:
 *   sourceEventId: dedupe key; statEventIds: stats owned/referenced by this cue;
 *   afterStatIds / beforeStatIds: insertion constraints around statChanged.
 *
 * The caller emits each ordinary statChanged once by its original stat ID,
 * inserts these cues at the constraints, then assigns fresh wire event IDs.
 * It must not spread an entry or replay statEventIds as new stat changes.
 * DAMAGE_LINK_BREAK is represented only by damageLinkBroken, not statChanged.
 * Empty anchors retain this array's order; they do not authorize state-diff
 * inference. No event/ownership IDs, card IDs, logs or snapshots are wire data.
 */
export function collectSafePresentationEvents(before, after) {
  const previous = graphOf(before), current = graphOf(after);
  const previousVisualIds = new Set(previous.visuals.map(eventId).filter(Boolean));
  const previousRevealIds = new Set([...previous.stats.values()]
    .map(stat => eventId(stat.vritraImmortalReveal)).filter(Boolean));
  const freshStats = new Map([...current.stats].filter(([id]) => !previous.stats.has(id)));
  const freshIds = stats => unique(list(stats).map(eventId).filter(id => freshStats.has(id)));
  const entries = [], emitted = new Set();
  const add = (source, event, { statEventIds = [], afterStatIds = [], beforeStatIds = [],
    sourceLinkId, sourceDefeatStatId, beforeEventIds = [], afterEventIds = [] } = {}) => {
    const id = eventId(source);
    if (!id || emitted.has(id) || previousVisualIds.has(id) || previousRevealIds.has(id)) return;
    emitted.add(id);
    entries.push({ event, sourceEventId: id, statEventIds: unique(statEventIds),
      afterStatIds: unique(afterStatIds), beforeStatIds: unique(beforeStatIds),
      beforeEventIds: unique(beforeEventIds), afterEventIds: unique(afterEventIds),
      ...(sourceLinkId !== undefined ? { sourceLinkId } : {}),
      ...(sourceDefeatStatId ? { sourceDefeatStatId } : {}) });
  };
  const journal = [...current.stats.values()];
  const huntSources = new Set([before?._huntPending?.source, after?._huntPending?.source, after?._huntLoot?.source,
    ...list(after?._pendingPublicEvents).filter(event => event.type === 'huntResolved').map(event => event.sourceSeat)].filter(isSeat));
  const huntTargets = new Set([before?._huntPending?.target, after?._huntPending?.target, after?._huntLoot?.target,
    ...list(after?._pendingPublicEvents).filter(event => event.type === 'huntResolved').map(event => event.targetSeat)].filter(isSeat));
  const boundary = stat => {
    const explicit = current.scopes.get(stat.id);
    const scope = explicit ? orderedScope(explicit.stats) : journal;
    const index = scope.findIndex(item => item.id === stat.id);
    return { afterStatIds: freshIds(scope.slice(0, index)), beforeStatIds: freshIds(scope.slice(index + 1)) };
  };
  const reveal = (source, anchors = {}) => {
    if (!isSeat(source?.targetIdx) || !list(source.cards).length) return;
    const cards = source.cards.map(revealedFace).filter(card => Object.keys(card).length);
    if (!cards.length) return;
    add(source, { type: 'immortalRevealed', seat: source.targetIdx, cards, succeeded: source.succeeded === true }, anchors);
  };
  const emitStatCues = (stats, owner = null) => {
    for (const reference of stats) {
      const stat = freshStats.get(eventId(reference));
      if (!stat || (owner && current.scopes.get(stat.id)?.owner !== owner)) continue;
      const anchors = boundary(stat);
      if (stat.type === 'DAMAGE_LINK_BREAK' && list(stat.pair).length === 2
        && stat.pair.every(isSeat) && stat.pair[0] !== stat.pair[1]) {
        add(stat, { type: 'damageLinkBroken', pair: [...stat.pair],
          // Extraction-local only; the final wire event ID gives global scope.
          linkId: `damage-link:${entries.length}`, order: Number.isFinite(stat.phaseOrder) ? stat.phaseOrder : 0 },
        { ...anchors, statEventIds: [stat.id],
          ...(typeof stat.linkId === 'string' ? { sourceLinkId: stat.linkId } : {}) });
      }
      if (stat.type === 'PLAYER_DEFEATED' && isSeat(stat.target) && (!stat.settlementOwner
        || stat.settlementOwner === 'huntResult' && huntSources.has(stat.target) && !huntTargets.has(stat.target))) {
        // The explicit defeat record establishes the operation. Only its cards
        // confirmed in the canonical public discard receipt may reveal faces.
        // Hunt-owned loot is deliberately excluded; no raw dead hand is sent.
        const discarded = new Map(list(stat.deathSettlement?.discardedCards || stat.discardAfter).filter(card => card?.id !== undefined)
          .map(card => [card.id, card]));
        const discardedCards = list(stat.deathCards).filter(card => card?.id !== undefined && discarded.has(card.id))
          .map(card => ({ ...revealedFace(discarded.get(card.id)), id: card.id }));
        const destroyedCount = Number.isInteger(stat.deathSettlement?.destroyedCount)
          ? stat.deathSettlement.destroyedCount : 0;
        if (discardedCards.length || destroyedCount) add({ id: `death-cards:${stat.id}` },
          { type: 'deathCardsRemoved', seat: stat.target, discardedCards, destroyedCount },
          { ...anchors, afterStatIds: [...anchors.afterStatIds, stat.id],
            statEventIds: [stat.id], sourceDefeatStatId: stat.id,
            beforeEventIds: current.visuals.filter(event => list(event.presentationAfterStatIds).includes(stat.id)).map(eventId) });
      }
      if (['HP_LOSS', 'HP_SAN_LOSS'].includes(stat.type) && stat.vritraImmortalReveal) {
        reveal(stat.vritraImmortalReveal, { ...anchors, afterStatIds: [...anchors.afterStatIds, stat.id], statEventIds: [stat.id] });
      }
    }
  };

  // Attached immortality records have stronger order evidence than duplicate
  // top-level reveal records; defer the latter until explicit owners are read.
  const attachedRevealIds = new Set([...freshStats.values()].map(stat => eventId(stat.vritraImmortalReveal)).filter(Boolean));
  for (let index = 0; index < current.visuals.length; index++) {
    const visual = current.visuals[index];
    const owned = list(visual.statEvents);
    if (visual.type === 'cardEffect' && ['earthquake', 'forcedRandomDiscard'].includes(visual.effectKey)) {
      const discards = list(visual.discardEvents).filter(item => isSeat(item.playerIndex) && item.card && item.card.type !== 'blankZone')
        .map(item => ({ seat: item.playerIndex, card: { ...revealedFace(item.card),
          ...(['string', 'number'].includes(typeof item.card.id) ? { id: item.card.id } : {}) },
        destination: isVanishingDerivedCard(item.card) ? 'destroyed' : 'discard' }));
      if (discards.length) add(visual, { type: 'cardsDiscarded', kind: visual.effectKey, discards },
        { statEventIds: freshIds(owned), beforeStatIds: freshIds(owned) });
    }
    if (visual.type === 'cardEffect' && visual.effectKey === 'damageLinkExpired') {
      const pair = visual.payload?.pair;
      if (list(pair).length === 2 && pair.every(isSeat) && pair[0] !== pair[1]) {
        add(visual, { type: 'damageLinkExpired', pair: [...pair] },
          { statEventIds: freshIds(owned), afterStatIds: freshIds(owned),
            sourceLinkId: visual.payload.sourceLinkId });
      }
    }
    if (visual.type === 'cardEffect' && AREA_EFFECTS.has(visual.effectKey)) {
      const payload = visual.payload || {};
      const event = { type: 'areaEffectStarted', kind: visual.effectKey,
        ...(isSeat(visual.actorIdx) ? { seat: visual.actorIdx } : {}) };
      if (visual.effectKey === 'geomagneticReversal' && payload.restoreCard) event.restoreCard = revealedFace(payload.restoreCard);
      if (visual.effectKey === 'etherealizeGain' && Number.isInteger(payload.stackCount) && payload.stackCount > 0) event.stackCount = payload.stackCount;
      if (visual.effectKey === 'snakeTrap') {
        event.rayCount = list(visual.beforePlayers).filter(player => player && !player.isDead).length;
        event.assignments = list(payload.assignmentList).filter(item => isSeat(item.idx) && Number.isInteger(item.count) && item.count > 0)
          .map(item => ({ seat: item.idx, count: item.count }));
        event.hits = list(payload.assignmentHits).filter(item => isSeat(item.idx)).map(item => item.idx);
      }
      add(visual, event, { statEventIds: freshIds(owned), beforeStatIds: freshIds(owned) });
    }
    if (visual.type === 'inspection' && isSeat(visual.target) && visual.card) {
      const inspectionCard = publicScalars(visual.card, INSPECTION_STRINGS, INSPECTION_NUMBERS);
      if (typeof inspectionCard.effect === 'string') {
        // The producer records the exact prior stat watermark. It is ordering
        // evidence, not an identity key and not a comparison of snapshots.
        const watermark = visual.beforeStatEventSeq;
        const preceding = Number.isFinite(watermark) ? journal.filter(stat => Number.isFinite(stat.seq) && stat.seq <= watermark) : [];
        const following = Number.isFinite(watermark) ? journal.filter(stat => Number.isFinite(stat.seq) && stat.seq > watermark) : [];
        add(visual, { type: 'inspectionRevealed', seat: visual.target, inspectionCard,
          ...(visual.card.effect === 'drawCard' && visual.gainedCard ? { hiddenDrawCount: 1 } : {}),
          ...(list(visual.discardEvents).length ? { discardCount: visual.discardEvents.length,
            discards: list(visual.discardEvents).filter(item => isSeat(item.playerIndex) && item.card)
              .map(item => ({ seat: item.playerIndex, card: { ...revealedFace(item.card), id: item.card.id },
                destination: isVanishingDerivedCard(item.card) ? 'destroyed' : 'discard' })) } : {}) }, {
          statEventIds: freshIds(owned), afterStatIds: freshIds(preceding).filter(id => !freshIds(owned).includes(id)),
          beforeStatIds: freshIds(owned.length ? owned : following),
        });
      }
    }
    emitStatCues(orderedScope(owned), visual);
    if (visual.type === 'vritraImmortalReveal' && !attachedRevealIds.has(eventId(visual))) {
      reveal(visual);
    }
  }
  emitStatCues(journal);
  return entries;
}
