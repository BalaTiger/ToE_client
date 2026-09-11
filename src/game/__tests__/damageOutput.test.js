import { describe, expect, it } from 'vitest';
import { submitLossEvents } from '../effectEngine';
import { addDamageLink } from '../damageLinks';
import { buildStatChangeStatePatch } from '../statChangeEngine';
import { compileFreshVisualEventQueue } from '../visualEventTransactionCompiler';
import { prepareAnimQueueLogs } from '../animLogs';
import { consumeVisualLogEntries } from '../visualEventLogs';
import { applyStatAnimationImpact } from '../statEvents';
import { startNextTurn } from '../turnEngine';
import { aiStep, discardAiHandToLimit } from '../aiTurn';
import { buildScopedAiActionReplayState } from '../aiTurnPresentation';
import { buildTurnStartDrawReplayQueue } from '../turnAnimState';
import { createBlackGoatYoungCard, createTsathogguaSlimeCard } from '../../constants/card';
import { makeGs, makePlayer, makeBlankZoneCard, makeZoneCard } from './factory';

function playback(queue, state) {
  const seen = new Set();
  const steps = prepareAnimQueueLogs(queue, state);
  const batches = steps.map(step => consumeVisualLogEntries(step.logEntries, seen));
  expect(steps.flatMap(step => consumeVisualLogEntries(step.logEntries, seen))).toEqual([]);
  return { batches, logs: batches.flat() };
}

describe('complete damage rule output', () => {
  it('AI balance discard retains its death transaction separately from the discard notice', () => {
    const players = [makePlayer({ name: '你' }), makePlayer({ name: '贝拉', hp: 4,
      hand: [{ id: 'balance', type: 'lifeBalance', name: '生命天平' }, ...Array.from({ length: 4 }, () => makeBlankZoneCard())] })];
    addDamageLink(players, 0, 1, { expiryOwner: 0 });
    const previous = makeGs({ players: structuredClone(players), currentTurn: 1 });
    const result = discardAiHandToLimit(players, 1, [], [], [], [], 0);
    const next = { ...previous, players, _statEvents: result.statEvents, _statEventSeq: result.statEventSeq, _visualEvents: result.visualEvents };
    const queue = compileFreshVisualEventQueue(previous, next);
    const { logs, batches } = playback(queue, next);
    expect(logs.filter(line => line.includes('绳索断裂'))).toHaveLength(1);
    expect(batches[queue.findIndex(step => step.type === 'GUILLOTINE')]).toEqual(['☠ 贝拉（寻宝者）倒下了！']);
    expect(queue.flatMap(step => step.type === 'HP_DAMAGE' ? step.statEvents : [])
      .filter(event => event.target === 1).map(event => [event.from.hp, event.to.hp])).toEqual([[4, 1], [1, 0]]);
  });

  it.each([false, true])('owns lethal reactions with independent message input (rope=%s)', rope => {
    const players = [makePlayer({ name: '你', hp: rope ? 2 : 1, hand: [createBlackGoatYoungCard()] }), makePlayer({ name: '贝拉' })];
    if (rope) addDamageLink(players, 0, 1, { expiryOwner: 1 });
    const previous = makeGs({ players: structuredClone(players) });
    const authored = ['你 失去 1 HP'];
    const settlement = ['旧回合消息', ...authored];
    const damage = submitLossEvents({ players, log: settlement, statEventLogs: authored,
      currentTurn: 0, statEventSeq: 1, events: [{ targetIdx: 0, lostHp: 1, source: '测试伤害' }] });
    expect(authored).toEqual(['你 失去 1 HP']);
    expect(damage.logs).toEqual(settlement.slice(1));
    expect(damage.statEvents.find(event => event.type === 'PLAYER_DEFEATED').logHint).toBe('☠ 你（寻宝者）倒下了！');
    const next = { ...previous, players, ...buildStatChangeStatePatch(previous, damage), log: ['替换后的结算日志'] };
    const queue = compileFreshVisualEventQueue(previous, next);
    const { batches, logs } = playback(queue, next);
    expect(logs).toEqual(damage.logs);
    expect(batches[queue.findIndex(step => step.type === 'GUILLOTINE')]).toEqual(['☠ 你（寻宝者）倒下了！']);
    expect(batches[queue.findIndex(step => step.deathSettlementStep)]).toEqual(['你 的 1 张衍生牌被销毁']);
    settlement.push('后续动作');
    expect(damage.logs).not.toContain('后续动作');
    const stats = previous.players.map(({ hp, san }) => ({ hp, san }));
    expect(queue.reduce(applyStatAnimationImpact, stats)).toEqual(players.map(({ hp, san }) => ({ hp, san })));
  });

  it('returns the same transaction shape for deferred and empty damage', () => {
    const players = [makePlayer({ etherealizeStacks: 1 }), makePlayer()];
    const deferred = submitLossEvents({ players, currentTurn: 1,
      events: [{ targetIdx: 0, lostHp: 2 }], continuation: { fromRest: true } });
    expect(deferred).toMatchObject({ phase: 'ETHEREALIZE_DECISION', statEvents: [], logs: [], statEventSeq: null });
    expect(deferred.abilityData.fromRest).toBe(true);
    expect(players[0].hp).toBe(10);
    const empty = submitLossEvents({ players, events: [] });
    expect(Object.keys(empty).sort()).toEqual(Object.keys(deferred).sort());
  });

  it('retains the applied damage before a rope reaction opens another redirect decision', () => {
    const players = [makePlayer({ name: '你' }), makePlayer({ name: '贝拉', etherealizeStacks: 1 })];
    addDamageLink(players, 0, 1, { expiryOwner: 1 });
    const before = makeGs({ players: structuredClone(players) });
    const damage = submitLossEvents({ players, currentTurn: 0, log: [], statEventSeq: 1,
      statEventLogs: ['你 失去 1 HP'], events: [{ targetIdx: 0, lostHp: 1 }], continuation: { fromRest: true } });
    expect(damage.phase).toBe('ETHEREALIZE_DECISION');
    expect(damage.abilityData).toMatchObject({ fromRest: true, targetIdx: 1 });
    expect(players.map(player => player.hp)).toEqual([9, 10]);
    expect(damage.statEvents).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'HP_LOSS', target: 0 })]));
    const next = { ...before, players, ...buildStatChangeStatePatch(before, damage) };
    expect(playback(compileFreshVisualEventQueue(before, next), next).logs).toEqual(damage.logs);
  });

  it('a slime pause keeps the same damage output contract', () => {
    const players = [makePlayer(), makePlayer({ hp: 8, san: 8, hand: [createTsathogguaSlimeCard()] })];
    const damage = submitLossEvents({ players, currentTurn: 0, statEventSeq: 2,
      events: [{ targetIdx: 1, lostHp: 2, lostSan: 1, logHint: '组合伤害' }] });
    expect(damage).toMatchObject({ phase: 'TSG_SLIME_BALANCE', logs: ['组合伤害'], statEventSeq: 2 });
    expect(damage.statEvents.map(event => event.type)).toEqual(['HP_LOSS', 'SAN_LOSS']);
  });

  it('AI hand-limit rose thorns preserve the original rope timeline', () => {
    const players = [makePlayer({ name: '你', hp: 3, hand: [createBlackGoatYoungCard()] }),
      makePlayer({ name: '艾伦', role: '邪祀者', hand: Array.from({ length: 5 }, (_, i) => makeZoneCard('A1', 0, i ? {} : { roseThornHolderId: 0 })) }),
      makePlayer({ name: '贝拉', role: '追猎者' }), makePlayer({ name: '卡洛斯' })];
    addDamageLink(players, 0, 2, { expiryOwner: 2 });
    const previous = makeGs({ players, currentTurn: 1, phase: 'AI_TURN', skillUsed: true, restUsed: true,
      godFromHandUsed: true, _aiTurnIntroShown: true, deck: [makeBlankZoneCard()] });
    const next = aiStep(previous);
    const scoped = buildScopedAiActionReplayState({ state: next });
    const queue = compileFreshVisualEventQueue(previous, scoped);
    const { logs } = playback(queue, scoped);
    expect(logs.filter(line => line.includes('绳索断裂'))).toHaveLength(1);
    expect(logs.filter(line => line.includes('倒下了'))).toHaveLength(1);
    expect(queue.flatMap(step => step.type === 'HP_DAMAGE' ? step.statEvents : [])
      .filter(event => event.target === 0).map(event => [event.from.hp, event.to.hp])).toEqual([[3, 1], [1, 0]]);
  });

  it.each([0, 1])('poison keeps lethal rope events for player/AI seat %s', actor => {
    const players = Array.from({ length: 4 }, (_, idx) => makePlayer({ name: `角色${idx}` }));
    players[actor] = makePlayer({ name: `角色${actor}`, hp: 2, poisonStacks: 1, hand: [] });
    addDamageLink(players, actor, 2, { expiryOwner: 2 });
    const previous = makeGs({ players, currentTurn: (actor + 3) % 4, deck: [makeBlankZoneCard()] });
    const next = startNextTurn(previous);
    const queue = buildTurnStartDrawReplayQueue({ oldGs: previous, newGs: next }).queue;
    const { logs } = playback(queue, next);
    expect(logs).toEqual(next.log);
    expect(queue.some(step => step.type === 'DRAW_CARD')).toBe(false);
    expect(next.players[actor]).toMatchObject({ isDead: true, hp: 0 });
    expect(logs.filter(line => line.includes('绳索断裂'))).toHaveLength(1);
    expect(logs.filter(line => line.includes('倒下了'))).toHaveLength(1);
    expect(logs.some(line => line.startsWith('【中毒】'))).toBe(true);
    const stats = previous.players.map(({ hp, san }) => ({ hp, san }));
    expect(queue.reduce(applyStatAnimationImpact, stats)).toEqual(next.players.map(({ hp, san }) => ({ hp, san })));
  });
});
