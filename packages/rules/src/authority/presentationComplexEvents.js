import { GOD_DEFS } from '../constants/card.js';
import { orderRuleResolutionEvents } from '../game/ruleResolutionTransaction.js';
import { collectFreshPresentationStats } from './presentationPublicEvents.js';

const list = value => Array.isArray(value) ? value : [];
const ids = values => [...new Set(values.filter(value => typeof value === 'string' && value))];
const CHILDREN = ['settlementEvents', 'encounterEvents', 'acceptanceEvents', 'visualEvents'];
function visualsOf(state) {
  const result = [], seen = new Set();
  const visit = values => {
    for (const event of orderRuleResolutionEvents(list(values))) {
      if (!event || seen.has(event)) continue;
      seen.add(event); result.push(event);
      CHILDREN.forEach(key => visit(event[key]));
    }
  };
  visit(state?._visualEvents);
  return result;
}
function publicFace(card) {
  if (!card || typeof card !== 'object') return null;
  const face = {};
  for (const key of ['name', 'desc', 'key', 'letter', 'type', 'godKey', 'shortKey', 'flavorText']) {
    if (typeof card[key] === 'string') face[key] = card[key];
  }
  for (const key of ['number', 'val']) if (Number.isFinite(card[key])) face[key] = card[key];
  for (const key of ['forced', 'isZone', 'isGod', 'isTsathogguaSlime', 'isBlackGoatYoung']) if (typeof card[key] === 'boolean') face[key] = card[key];
  // Host-only identity until view.face replaces it with a viewer HMAC handle.
  if (['string', 'number'].includes(typeof card.id)) face.id = card.id;
  return face;
}
const publicSlime = card => card?.isTsathogguaSlime === true ? publicFace(card) : null;

/** Explicit canonical cues only. All entry metadata is server-only. */
export function collectSafeComplexPresentationEvents(before, after) {
  const previous = new Set(visualsOf(before).map(event => event.id));
  const visuals = visualsOf(after), entries = [], emitted = new Set();
  const stats = collectFreshPresentationStats(before, after, { orderOwnedPhases: true });
  const statSet = new Set(stats.map(stat => stat.id));
  const fresh = values => ids(values).filter(id => statSet.has(id));
  const seat = value => Number.isInteger(value) && value >= 0 && value < list(after?.players).length;
  const add = (visual, event, extra = {}) => {
    if (typeof visual.id !== 'string' || !visual.id || previous.has(visual.id) || emitted.has(visual.id)) return;
    emitted.add(visual.id);
    const owned = fresh([...list(visual.statEventIds), ...list(visual.statEvents).map(stat => stat.id)]);
    const first = stats.findIndex(stat => owned.includes(stat.id));
    const watermark = visual.presentationStatBoundarySeq;
    const prior = Number.isFinite(watermark) ? stats.filter(stat => Number.isFinite(stat.seq) && stat.seq <= watermark).map(stat => stat.id) : [];
    const later = Number.isFinite(watermark) ? stats.filter(stat => Number.isFinite(stat.seq) && stat.seq > watermark).map(stat => stat.id) : [];
    const base = { event, sourceEventId: visual.id, statEventIds: owned,
      afterStatIds: Object.hasOwn(visual, 'presentationAfterStatIds')
        ? fresh(list(visual.presentationAfterStatIds)) : first < 0 ? [] : stats.slice(0, first).map(stat => stat.id),
      beforeStatIds: fresh([...owned, ...list(visual.presentationBeforeStatIds)]),
      beforeEventIds: ids(list(visual.presentationBeforeEventIds)),
      afterEventIds: ids(list(visual.presentationAfterEventIds)) };
    entries.push({ ...base, ...extra,
      afterStatIds: ids([...base.afterStatIds, ...prior, ...list(extra.afterStatIds)]),
      beforeStatIds: ids([...base.beforeStatIds, ...later, ...list(extra.beforeStatIds)]),
    });
  };
  for (const visual of visuals) {
    const owner = visual.playerIdx;
    if (visual.type === 'cardEffect' && seat(visual.actorIdx)) {
      const data = visual.payload || {};
      if (visual.effectKey === 'playerRestChanged' && typeof data.isResting === 'boolean') {
        add(visual, { type: 'playerRestChanged', seat: visual.actorIdx, isResting: data.isResting });
      }
      if (visual.effectKey === 'buriedToDeck' && data.seat === visual.actorIdx
        && data.destination === 'deckBottom' && data.count === 1 && list(data.cards).length === 1
        && Number.isInteger(data.sourceCount) && data.sourceCount >= 0 && data.sourceCount <= 1000) {
        const card = publicFace(data.cards[0]);
        if (card) add(visual, { type: 'buriedToDeck', seat: visual.actorIdx,
          count: 1, sourceCount: data.sourceCount, cards: [card], destination: 'deckBottom' });
      }
      if (visual.effectKey === 'zhuCardHidden' && data.seat === visual.actorIdx
        && ['turnDraw', 'tsgSlime', 'cthRest', 'sphinx', 'proliferatingZ'].includes(data.source)) {
        const card = publicFace(data.card);
        if (card) add(visual, { type: 'zhuCardHidden', seat: visual.actorIdx, card, source: data.source });
      }
      if (visual.effectKey === 'blackGoatPulse' && Number.isInteger(data.count) && data.count > 0 && data.count <= 100) {
        add(visual, { type: 'blackGoatPulse', seat: visual.actorIdx, count: data.count });
      }
    }
    if (visual.type === 'cardEffect' && visual.effectKey === 'etherealizeConsumed' && seat(visual.actorIdx)) {
      const data = visual.payload || {};
      if (seat(data.targetSeat) && ['lostHp', 'lostSan', 'stacksBefore', 'stacksAfter'].every(key => Number.isFinite(data[key]) && data[key] >= 0 && data[key] <= 100)
        && data.stacksBefore === data.stacksAfter + 1) {
        add(visual, { type: 'etherealizeConsumed', sourceSeat: visual.actorIdx, targetSeat: data.targetSeat,
          lostHp: data.lostHp, lostSan: data.lostSan, stacksBefore: data.stacksBefore, stacksAfter: data.stacksAfter });
      }
    }
    if (visual.type === 'cardEffect' && visual.effectKey === 'burrowingWorm' && seat(visual.actorIdx)) {
      const ownedIds = new Set(list(visual.statEvents).map(stat => stat.id));
      const scoped = visual.phaseGroupId ? stats.filter(stat => stat.phaseGroupId === visual.phaseGroupId)
        : stats.filter(stat => ownedIds.has(stat.id));
      add(visual, { type: 'burrowingWorm', seat: visual.actorIdx }, {
        statEventIds: scoped.map(stat => stat.id), beforeStatIds: scoped.map(stat => stat.id),
        beforeEventIds: visuals.filter(event => event.type === 'randomTarget' && visual.phaseGroupId
          && event.phaseGroupId === visual.phaseGroupId).map(event => event.id),
      });
    }
    if (visual.type === 'randomTarget' && seat(visual.sourceIdx) && seat(visual.targetIdx)
      && visual.phaseGroupId && visuals.some(event => event.type === 'cardEffect'
        && event.effectKey === 'burrowingWorm' && event.phaseGroupId === visual.phaseGroupId)) {
      const scoped = stats.filter(stat => stat.phaseGroupId === visual.phaseGroupId);
      add(visual, { type: 'burrowingWormTarget', sourceSeat: visual.sourceIdx, targetSeat: visual.targetIdx }, {
        statEventIds: scoped.map(stat => stat.id),
        afterStatIds: scoped.filter(stat => stat.phaseOrder < visual.phaseOrder).map(stat => stat.id),
        beforeStatIds: scoped.filter(stat => stat.phaseOrder > visual.phaseOrder).map(stat => stat.id),
      });
    }
    if (visual.type === 'throwStone' && seat(visual.sourceIdx) && seat(visual.targetIdx)
      && Number.isInteger(visual.roll) && visual.roll >= 1 && visual.roll <= 6
      && Number.isInteger(visual.distance) && visual.distance >= 0 && visual.distance < list(after.players).length
      && Number.isFinite(visual.damage) && visual.damage >= 0 && visual.damage <= 100) {
      add(visual, { type: 'throwStone', sourceSeat: visual.sourceIdx, targetSeat: visual.targetIdx,
        roll: visual.roll, distance: visual.distance, damage: visual.damage });
    }
    if (visual.type === 'apophisTarget' && seat(visual.actorIdx) && seat(visual.selectedIdx) && seat(visual.targetIdx)
      && Number.isInteger(visual.roll) && visual.roll >= 1 && visual.roll <= 6) {
      add(visual, { type: 'apophisTarget', sourceSeat: visual.actorIdx, selectedSeat: visual.selectedIdx,
        targetSeat: visual.targetIdx, roll: visual.roll, changed: visual.changed === true });
    }
    if (!seat(owner)) continue;
    if (visual.type === 'apophisEclipse' && visual.apophisNight?.active === true) {
      add(visual, { type: 'apophisEclipse', seat: owner });
    }
    if (visual.type === 'godStatusChanged' && Object.hasOwn(GOD_DEFS, visual.godKey)
      && Number.isInteger(visual.godLevel) && visual.godLevel >= 0 && visual.godLevel <= 3) {
      const prior = visual.faithSettlement?.previousFaithExit;
      const inspections = visuals.filter(event => event.type === 'inspection' && Number.isFinite(visual.presentAfterInspectionSeq)
        && Number.isFinite(event.seq) && event.seq <= visual.presentAfterInspectionSeq);
      add(visual, { type: 'godStatusChanged', seat: owner, godKey: visual.godKey, godLevel: visual.godLevel }, {
        afterStatIds: fresh([...list(prior?.statEventIds), ...inspections.flatMap(event => list(event.statEvents).map(stat => stat.id))]),
        afterEventIds: ids([...list(visual.presentationAfterEventIds), ...inspections.map(event => event.id)]),
        beforeEventIds: ids([...list(visual.presentationBeforeEventIds), ...visuals.filter(event => event.type === 'apophisEclipse'
          && event.transactionId && event.transactionId === visual.transactionId).map(event => event.id)]),
      });
    }
    if (['godPowerBlocked', 'cthulhuDream'].includes(visual.type)) {
      add(visual, { type: visual.type, seat: owner });
    }
    if (visual.type === 'endlessCorridorStarted') {
      add(visual, { type: 'endlessCorridorStarted', seat: owner,
        cards: list(visual.revealedCards).map(publicFace).filter(Boolean) });
    }
    if (visual.type === 'deckReshuffle') {
      const draw = visuals.find(event => event.id === visual.drawEventId && event.type === 'drawCard');
      add(visual, { type: 'deckReshuffled', seat: owner,
        ...(Number.isInteger(visual.count) && visual.count > 0 ? { count: visual.count } : {}) }, {
        beforeStatIds: fresh(list(draw?.statEventIds)),
        afterStatIds: fresh(list(draw?.presentationAfterStatIds)),
        beforeEventIds: ids([draw?.id]),
      });
    }
    if (['tsgSlimeGrant', 'tsgSlimePop'].includes(visual.type)) {
      const cards = list(visual.cards).map(publicSlime).filter(Boolean);
      if (!cards.length || cards.length > 100) continue;
      if (visual.type === 'tsgSlimeGrant') {
        add(visual, { type: 'publicTokensGranted', seat: owner, kind: 'tsathogguaSlime', count: cards.length, cards });
      } else {
        const event = { type: 'tsgSlimePopped', seat: owner, count: cards.length, poppedCards: cards };
        const balance = visual.statPresentation;
        if (balance && ['fromHp', 'hp', 'fromSan', 'san'].every(key => Number.isFinite(balance[key]) && balance[key] >= 0 && balance[key] <= 10)) {
          for (const key of ['fromHp', 'hp', 'fromSan', 'san']) event[key] = balance[key];
        }
        const draws = visuals.filter(draw => draw.type === 'drawCard' && draw.slimePop?.id === visual.id);
        add(visual, event, { beforeEventIds: ids([...list(visual.presentationBeforeEventIds), ...draws.map(draw => draw.id)]),
          beforeStatIds: fresh([...list(visual.presentationBeforeStatIds), ...draws.flatMap(draw => list(draw.statEventIds))]) });
      }
    }
  }
  return entries;
}
