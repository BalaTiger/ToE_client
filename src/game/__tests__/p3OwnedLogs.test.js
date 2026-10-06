import { afterEach, describe, expect, it, vi } from 'vitest';
import { FIXED_ZONE_CARD_VARIANTS_BY_KEY } from '../../constants/card';
import { aiStep } from '../aiTurn';
import { applyFx } from '../effectEngine';
import { playerDrawCard } from '../turnEngine';
import { ROLE_CULTIST, ROLE_HUNTER, ROLE_TREASURE } from '../coreUtils';
import { prepareAnimQueueLogs } from '../animLogs';
import { buildMpRemoteReplayAction } from '../multiplayerRemoteReplay';
import { rotateGsForViewer } from '../rotateState';
import { buildStatEvents } from '../statEvents';
import { consumeVisualLogEntries } from '../visualEventLogs';
import { compileRuleVisualEventsToAnimTransaction } from '../visualEventTransactionCompiler';
import { VISUAL_EVENT, createAnimTransactionEvent, createDiceResultVisualEvent, createLogOnlyVisualEvent, createStatEventsEvent } from '../visualEvents';
import { makeGodCard, makeGs, makePlayer, makeZoneCard } from './factory';

afterEach(() => vi.restoreAllMocks());

function visibleBatches(queue, state, consumed = new Set()) {
  return prepareAnimQueueLogs(queue, state).map(step => ({
    type: step.type,
    eventId: step.visualEventId,
    msgs: consumeVisualLogEntries(step.logEntries, consumed),
  }));
}

function restSiblings({ transactionId = 'rest-action', statTransactionId = transactionId, reason = '休息', extraMsgs = [] } = {}) {
  const msg = '贝拉 选择【休息】，掷骰 3、3，取高值回复 3HP，翻面休息中';
  const players = [makePlayer({ name: '你' }), makePlayer({ name: '贝拉', hp: 2 })];
  const after = players.map((player, index) => ({ ...player, hp: index === 1 ? 5 : player.hp }));
  const dice = { ...createDiceResultVisualEvent({ mode: 'rest', actorIdx: 1, actorName: '贝拉',
    d1: 3, d2: 3, heal: 3, msgs: [msg], playersBefore: players }), transactionId, order: 0 };
  const stats = createStatEventsEvent({
    statEvents: buildStatEvents(players, after, [], { reason, seq: 1 }),
    msgs: [msg, ...extraMsgs], transactionId: statTransactionId, order: 1,
  });
  return { msg, state: makeGs({ players: after, _visualEvents: [dice, stats] }) };
}

describe('P3 explicit visual message ownership', () => {
  it('AI rest announces the real dice action once while retaining its single recovery', () => {
    const state = makeGs({
      players: [
        makePlayer({ name: '你', role: ROLE_HUNTER }),
        makePlayer({ name: '贝拉', role: ROLE_CULTIST, hp: 2, hand: [makeZoneCard('B1')] }),
        makePlayer({ name: '卡洛斯', role: ROLE_TREASURE }),
      ],
      currentTurn: 1,
      phase: 'AI_TURN',
      deck: [makeZoneCard('B1'), makeZoneCard('B1')],
      _visualEvents: [],
      _statEvents: [],
      _statEventSeq: 0,
      _turnKey: 8,
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const next = aiStep(state);
    const restMsg = '贝拉 选择【休息】，掷骰 3、3，取高值回复 3HP，翻面休息中';
    expect(next.log.filter(msg => msg === restMsg)).toEqual([restMsg]);
    expect(next.players[1].hp).toBe(5);
    expect(next.players[1].isResting).toBe(true);
    const transaction = compileRuleVisualEventsToAnimTransaction(next, state);
    const batches = visibleBatches(transaction.queue, { ...next, log: [] });
    expect(batches.filter(batch => batch.msgs.includes(restMsg))).toEqual([
      expect.objectContaining({ type: 'DICE_ROLL', msgs: [restMsg] }),
    ]);
    expect(transaction.queue.filter(step => step.type === 'HP_HEAL')).toHaveLength(1);
  });

  it('preserves equal text from distinct explicit events and duplicate occurrences within one event', () => {
    const first = createLogOnlyVisualEvent({ msgs: ['合法重复', '合法重复'] });
    const second = createLogOnlyVisualEvent({ msgs: ['合法重复'] });
    const state = makeGs({ _visualEvents: [first, second], log: ['不可从完整记录恢复'] });
    const transaction = compileRuleVisualEventsToAnimTransaction(state);
    const consumed = new Set();
    expect(visibleBatches(transaction.queue, state, consumed).flatMap(batch => batch.msgs))
      .toEqual(['合法重复', '合法重复', '合法重复']);
    expect(visibleBatches(transaction.queue, state, consumed).flatMap(batch => batch.msgs)).toEqual([]);
    expect(state._visualEvents.map(event => event.type)).toEqual([VISUAL_EVENT.LOG_ONLY, VISUAL_EVENT.LOG_ONLY]);
  });

  it.each([[0, false], [1, false], [0, true], [1, true]])('night wind from the real card producer plays once for viewer %i (exact packet %s)', (viewer, exactPacket) => {
    const card = makeZoneCard('C4', FIXED_ZONE_CARD_VARIANTS_BY_KEY.C4.findIndex(variant => variant.name === '夜风呼啸'));
    expect(card.name).toBe('夜风呼啸');
    const previous = makeGs({
      players: [makePlayer({ name: 'END-A' }), makePlayer({ name: 'END-B', role: ROLE_CULTIST })],
      _visualEvents: [], _statEvents: [], _statEventSeq: 0, _isMP: true,
    });
    const effect = applyFx(card, 0, null, previous.players, previous.deck, previous.discard, previous);
    const next = { ...previous, ...effect.statePatch, players: effect.P, deck: effect.D,
      discard: effect.Disc, log: effect.msgs };
    const announcement = '全体存活角色失去 1 HP 和 SAN';
    expect(effect.msgs.filter(msg => msg === announcement)).toEqual([announcement]);
    expect(next.players.map(({ hp, san }) => [hp, san])).toEqual([[9, 9], [9, 9]]);
    const localTransaction = compileRuleVisualEventsToAnimTransaction(next, previous);
    expect(visibleBatches(localTransaction.queue, { ...next, log: [] }).flatMap(batch => batch.msgs)
      .filter(msg => msg === announcement)).toEqual([announcement]);
    const packet = exactPacket ? { ...next, _visualEvents: [...next._visualEvents, createAnimTransactionEvent({
      queue: localTransaction.queue, coveredEventIds: localTransaction.eventIds, beforePlayers: previous.players,
      beforeDiscard: previous.discard, context: 'night-wind',
    })] } : next;
    const rotated = rotateGsForViewer(JSON.parse(JSON.stringify(packet)), viewer);
    const previousGs = rotateGsForViewer(previous, viewer);
    const action = buildMpRemoteReplayAction({ rotated, previousGs, roleRevealed: true });
    const queue = [action.anim, ...(action.queue || [])].filter(Boolean);
    expect(queue.filter(step => step.type === 'NIGHT_WIND')).toHaveLength(1);
    expect(queue.filter(step => step.type === 'HP_DAMAGE')).toHaveLength(1);
    expect(queue.filter(step => step.type === 'SAN_DAMAGE')).toHaveLength(1);
    const consumed = new Set();
    expect(visibleBatches(queue, { ...rotated, log: [] }, consumed).flatMap(batch => batch.msgs)
      .filter(msg => msg === announcement)).toEqual([announcement]);
    expect(visibleBatches(queue, rotated, consumed).flatMap(batch => batch.msgs)).toEqual([]);
  });

  it('rest sharing preserves additional reactions and equal-text occurrences of its stat event', () => {
    const fixture = restSiblings({ extraMsgs: ['保留恢复反应'] });
    const event = fixture.state._visualEvents[1];
    event.msgs.push(fixture.msg);
    const before = structuredClone(fixture.state);
    const transaction = compileRuleVisualEventsToAnimTransaction(fixture.state);
    const batches = visibleBatches(transaction.queue, fixture.state);
    expect(batches.flatMap(batch => batch.msgs)).toEqual([fixture.msg, '保留恢复反应', fixture.msg]);
    expect(fixture.state).toEqual(before);
  });

  it.each([
    { statTransactionId: 'another-action' },
    { reason: '另一种恢复' },
  ])('does not share a different recovery event merely because its text matches ($reason/$statTransactionId)', options => {
    const { state, msg } = restSiblings(options);
    const transaction = compileRuleVisualEventsToAnimTransaction(state);
    expect(visibleBatches(transaction.queue, state).flatMap(batch => batch.msgs)).toEqual([msg, msg]);
  });

  it('new night-wind occurrences retain their own IDs even when the announcement text matches a previous turn', () => {
    const card = makeZoneCard('C4', FIXED_ZONE_CARD_VARIANTS_BY_KEY.C4.findIndex(variant => variant.name === '夜风呼啸'));
    let previous = makeGs({ players: [makePlayer({ name: 'END-A' }), makePlayer({ name: 'END-B' })],
      _visualEvents: [], _statEvents: [], _statEventSeq: 0 });
    const consumed = new Set();
    const shown = [];
    for (let turn = 1; turn <= 2; turn++) {
      const effect = applyFx(card, 0, null, previous.players, previous.deck, previous.discard, previous);
      const next = { ...previous, ...effect.statePatch, players: effect.P, deck: effect.D, discard: effect.Disc,
        log: effect.msgs, turn };
      const transaction = compileRuleVisualEventsToAnimTransaction(next, previous);
      shown.push(...visibleBatches(transaction.queue, next, consumed).flatMap(batch => batch.msgs));
      previous = next;
    }
    expect(shown).toEqual(['全体存活角色失去 1 HP 和 SAN', '全体存活角色失去 1 HP 和 SAN']);
    expect(previous.players.map(({ hp, san }) => [hp, san])).toEqual([[8, 8], [8, 8]]);
  });

  it('seal loosening from a real god draw is announced by the inspection once', () => {
    const god = makeGodCard('NYA');
    const previous = makeGs({
      players: [makePlayer({ name: '你', hp: 8, san: 6 }), makePlayer({ name: '贝拉', role: ROLE_HUNTER })],
      deck: [god], inspectionDeck: [{ id: 'seal', name: '封印松动', effect: 'sealLoosening', value: 1, type: 'negative' }],
      inspectionDiscard: [], sealLooseningCount: 0,
      _visualEvents: [], _statEvents: [], _statEventSeq: 0,
    });
    const draw = playerDrawCard(previous.players, previous.deck, previous.discard, 0, previous);
    const next = { ...previous, ...draw.statePatch, players: draw.P, deck: draw.D, discard: draw.Disc,
      log: draw.effectMsgs };
    const announcement = '你 感到封印松动';
    expect(draw.effectMsgs.filter(msg => msg === announcement)).toEqual([announcement]);
    const transaction = compileRuleVisualEventsToAnimTransaction(next, previous);
    const batches = visibleBatches(transaction.queue, { ...next, log: [] });
    expect(batches.filter(batch => batch.msgs.includes(announcement))).toHaveLength(1);
    expect(next.players[0].san).toBe(5);
    expect(next.sealLooseningCount).toBe(1);
  });
});
