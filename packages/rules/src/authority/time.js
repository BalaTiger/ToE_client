import { executeRuleResolution } from '../execution.js';
import { copyPlayers, shuffle } from '../game/coreUtils.js';
import { INSPECTION_DECK } from '../constants/card.js';
import { submitLossEvents } from '../game/effectEngine.js';
import { buildStatChangeStatePatch } from '../game/statChangeEngine.js';
import { checkWin } from '../game/victory.js';
import { advanceAutomaticRules } from './automatic.js';
import { collectPublicRuleEvents, compactAuthorityState } from './events.js';
import { updateTurnClock, updateHoundsClock, remainingHounds, decisionDuration, houndsRunning } from './clocks.js';
import { appendCommittedPublicEvent } from './incomeEvents.js';

export function advanceRuleTime(record, now, { random } = {}) {
  if (!Number.isFinite(now)) throw new TypeError('Invalid rule time');
  if (!record.houndsClock || record.state.gameOver || !houndsRunning(record.state)) return record;
  const remaining = remainingHounds(record, now);
  if (remaining > 0) return { ...record, houndsClock: { ...record.houndsClock, remainingMs: remaining, lastAt: now } };
  const draft = structuredClone(record), revision = record.revision + 1;
  const state = executeRuleResolution({ cursor: draft.random, random, now, namespace: `${record.id}:clock:${revision}` }, () => {
    const old = draft.state, players = copyPlayers(old.players), deck = [...old.deck], discard = [...old.discard], log = [...old.log];
    const target = old.currentTurn;
    const damage = submitLossEvents({ players, deck, discard, log, currentTurn: target,
      events: [{ targetIdx: target, lostHp: 4, source: '廷达罗斯猎犬' }],
      statEventSeq: (old._statEventSeq || 0) + 1, continuation: { _turnOwner: target } });
    const hounds = INSPECTION_DECK.find(card => card.effect === 'houndsOfTindalos');
    const inspectionDiscard = (old.inspectionDiscard || []).filter(card => card.effect !== 'houndsOfTindalos');
    const inspectionDeck = hounds && !(old.inspectionDeck || []).some(card => card.effect === 'houndsOfTindalos')
      ? shuffle([...(old.inspectionDeck || []), structuredClone(hounds)]) : old.inspectionDeck;
    const interrupted = damage.phase && old.phase !== 'ACTION'
      ? { phase: old.phase, abilityData: old.abilityData, drawReveal: old.drawReveal } : null;
    const pendingCard = old.drawReveal?.card || old.abilityData?.godCard;
    let discardedPendingCard = null;
    if (players[target].isDead && pendingCard && !discard.some(card => card.id === pendingCard.id)
      && !players.some(player => player.hand.some(card => card.id === pendingCard.id))) {
      discard.push(pendingCard);
      discardedPendingCard = pendingCard;
    }
    const next = { ...old, players, deck, discard, log, inspectionDeck, inspectionDiscard,
      houndsOfTindalosActive: false, houndsOfTindalosTarget: target, houndsOfTindalosElapsed: 0,
      ...buildStatChangeStatePatch(old, damage), ...(interrupted ? { _clockContinuation: interrupted } : {}),
      gameOver: checkWin(players, old._isMP),
      ...(damage.phase ? { phase: damage.phase, abilityData: damage.abilityData } : {}) };
    const committed = discardedPendingCard ? appendCommittedPublicEvent(next, {
      type: 'cardIncomeCommitted', seat: old.drawReveal?.drawerIdx ?? old.abilityData?.drawerIdx ?? target,
      card: discardedPendingCard, destination: 'discard', source: 'reveal',
    }) : next;
    return advanceAutomaticRules(committed, record.state);
  });
  const publicEvents = collectPublicRuleEvents(record.state, state);
  delete state._pendingPublicEvents;
  draft.state = compactAuthorityState(state); draft.revision = revision;
  delete draft.openingPlayers;
  draft.turnClock = updateTurnClock(record, state, now); draft.houndsClock = updateHoundsClock(record, state, now, revision);
  draft.decision = { id: `${record.id}:decision:${revision}`, deadline: now + decisionDuration(state, draft) };
  draft.grants = [];
  draft.publicEvents = [...record.publicEvents, ...publicEvents.map((event, index) => ({
    ...event, visibility: 'public', id: `${record.id}:clock-event:${revision}:${index}`,
  }))].slice(-256);
  return draft;
}
