import { describe, expect, it } from 'vitest';
import { startNextTurn } from '../turnEngine';
import { buildTurnStartDrawReplayQueue } from '../turnAnimState';
import { makeGodCard, makeGs, makePlayer, makeZoneCard } from './factory';
import { createTsathogguaSlimeCard } from '../../constants/card';
import { VISUAL_EVENT } from '../visualEvents';

function stepTypes(queue) {
  return queue.map(step => step.type);
}

describe('AI 黏液额外摸到邪神牌（同步结算）动画队列', () => {
  it('翻牌后依次播放 SAN 扣减、检定翻牌、翻面、弃牌，再翻开固定摸牌', () => {
    const slime = createTsathogguaSlimeCard();
    const god = makeGodCard('NYA', { name: '伏行之混沌' });
    const decipher = makeZoneCard('A1', 1, { name: '解读石刻' }); // decipherStoneCarving
    const sleep = { id: 'sleep-check', name: '昏睡', effect: 'flip', value: 1, type: 'neutral' };
    const revealed = [makeZoneCard('C2', 0), makeZoneCard('D3', 0), makeZoneCard('B2', 0)];

    const players = [
      makePlayer({ name: '你', san: 10 }),
      makePlayer({
        name: '卡洛斯',
        role: 'treasureHunter',
        san: 6,
        godEncounters: 1,
        godName: 'TSG',
        godLevel: 1,
        godZone: [makeGodCard('TSG')],
        hand: [slime],
      }),
    ];
    const gs = makeGs({
      players,
      deck: [god, decipher, ...revealed],
      currentTurn: 0,
      phase: 'ACTION',
      log: ['旧日志'],
      inspectionDeck: [sleep],
      inspectionDiscard: [],
      _inspectionSeq: 0,
      _statEventSeq: 0,
    });

    const result = startNextTurn(gs);

    // 规则层元数据没有被覆盖丢失
    expect(result._statEvents.map(event => event.type)).toContain('SAN_LOSS');
    // 检定视觉事件只出现一次
    const inspectionVisualEvents = (result._visualEvents || []).filter(event => event?.type === 'inspection');
    expect(inspectionVisualEvents).toHaveLength(1);
    expect(inspectionVisualEvents.map(event => event.card?.name)).toEqual(['昏睡']);
    // 遭遇归属由规则层结构化记录：序号 + 弃牌结果 + 视觉事件 id
    const godDrawEvent = result._visualEvents.find(event => event.type === VISUAL_EVENT.DRAW_CARD && event.card === god);
    expect(godDrawEvent?.godEncounter?.discardedGod).toBeTruthy();
    expect(godDrawEvent?.godEncounter?.statSeqs.length).toBeGreaterThan(0);
    expect(godDrawEvent?.godEncounter?.inspectionSeqs).toEqual([
      inspectionVisualEvents[0]?.legacySeq,
    ]);
    const ownedIds = godDrawEvent?.godEncounter?.visualEventIds || [];
    expect(ownedIds.length).toBeGreaterThanOrEqual(3); // SAN 扣减 + 检定 + 弃牌
    // 弃牌由 canonical 视觉事件承载，不再由呈现层补造步骤
    const discardVisualEvents = (result._visualEvents || []).filter(event => event?.type === 'godGiftDiscard');
    expect(discardVisualEvents).toHaveLength(1);
    expect(ownedIds).toContain(discardVisualEvents[0]?.id);
    // 遭遇的 SAN 扣减被拆成独立事件，不与其它摸牌阶段属性事件混包
    const ownedStatEvent = (result._visualEvents || []).find(event => ownedIds.includes(event?.id)
      && event?.type === 'statEvents');
    expect(ownedStatEvent?.statEvents?.map(event => event.type)).toEqual(['SAN_LOSS']);

    const replay = buildTurnStartDrawReplayQueue({
      oldGs: gs,
      newGs: result,
      effectOldGs: { ...gs, players: result._playersBeforeThisDraw || gs.players },
    });
    const types = stepTypes(replay.queue);
    const godDrawIdx = replay.queue.findIndex(step => step.type === 'DRAW_CARD' && step.card === god);
    const decipherDrawIdx = replay.queue.findIndex(step => step.type === 'DRAW_CARD' && step.card === decipher);
    const sanIdx = types.indexOf('SAN_DAMAGE');
    const checkFlipIdx = replay.queue.findIndex(step => step.type === 'DRAW_CARD' && step.triggerName === '检定牌');
    const discardIdx = replay.queue.findIndex(step => step.type === 'DISCARD' && step.card === god);

    expect(godDrawIdx).toBeGreaterThan(-1);
    expect(decipherDrawIdx).toBeGreaterThan(godDrawIdx);
    // SAN 扣减、检定翻牌、弃牌都发生在邪神翻牌之后、固定摸牌之前
    expect(sanIdx).toBeGreaterThan(godDrawIdx);
    expect(sanIdx).toBeLessThan(decipherDrawIdx);
    expect(checkFlipIdx).toBeGreaterThan(sanIdx);
    expect(checkFlipIdx).toBeLessThan(decipherDrawIdx);
    expect(discardIdx).toBeGreaterThan(checkFlipIdx);
    expect(discardIdx).toBeLessThan(decipherDrawIdx);
    // 检定翻牌只出现一次
    expect(replay.queue.filter(step => step.type === 'DRAW_CARD' && step.triggerName === '检定牌')).toHaveLength(1);
    // SAN 扣减只出现一次，弃牌步骤携带来源视觉事件 id（可被消费去重）
    expect(types.filter(type => type === 'SAN_DAMAGE')).toHaveLength(1);
    expect(replay.queue.filter(step => step.type === 'DISCARD' && step.card === god)).toHaveLength(1);
    expect(replay.queue[discardIdx].visualEventId).toBe(discardVisualEvents[0]?.id);
  });

  it('SAN 充足无检定时，SAN 扣减与弃牌仍紧随邪神翻牌', () => {
    const slime = createTsathogguaSlimeCard();
    const god = makeGodCard('NYA', { name: '伏行之混沌' });
    const decipher = makeZoneCard('A1', 1, { name: '解读石刻' });

    const players = [
      makePlayer({ name: '你', san: 10 }),
      makePlayer({
        name: '卡洛斯',
        role: 'treasureHunter',
        san: 10,
        godName: 'TSG',
        godLevel: 1,
        godZone: [makeGodCard('TSG')],
        hand: [slime],
      }),
    ];
    const gs = makeGs({
      players,
      deck: [god, decipher],
      currentTurn: 0,
      phase: 'ACTION',
      log: ['旧日志'],
      _inspectionSeq: 0,
      _statEventSeq: 0,
    });

    const result = startNextTurn(gs);

    // 无 SAN 检定：归属只含 SAN 扣减与弃牌
    expect(result._inspectionEvents || []).toHaveLength(0);
    const godDrawEvent = result._visualEvents.find(event => event.type === VISUAL_EVENT.DRAW_CARD && event.card === god);
    expect(godDrawEvent?.godEncounter?.inspectionSeqs).toEqual([]);
    expect(godDrawEvent?.godEncounter?.discardedGod).toBeTruthy();
    const ownedIds = godDrawEvent?.godEncounter?.visualEventIds || [];
    expect(ownedIds).toHaveLength(2);

    const replay = buildTurnStartDrawReplayQueue({
      oldGs: gs,
      newGs: result,
      effectOldGs: { ...gs, players: result._playersBeforeThisDraw || gs.players },
    });
    const godDrawIdx = replay.queue.findIndex(step => step.type === 'DRAW_CARD' && step.card === god);
    const decipherDrawIdx = replay.queue.findIndex(step => step.type === 'DRAW_CARD' && step.card === decipher);
    const sanIdx = replay.queue.findIndex(step => step.type === 'SAN_DAMAGE');
    const discardIdx = replay.queue.findIndex(step => step.type === 'DISCARD' && step.card === god);

    expect(godDrawIdx).toBeGreaterThan(-1);
    expect(sanIdx).toBeGreaterThan(godDrawIdx);
    expect(sanIdx).toBeLessThan(decipherDrawIdx);
    expect(discardIdx).toBeGreaterThan(sanIdx);
    expect(discardIdx).toBeLessThan(decipherDrawIdx);
    expect(replay.queue.filter(step => step.type === 'DRAW_CARD' && step.triggerName === '检定牌')).toHaveLength(0);
  });

  it('固定摸牌延迟 AI 邪神决策时，遭遇日志仍归属邪神翻牌而非 SAN 属性队列', () => {
    const slime = createTsathogguaSlimeCard();
    const dragonHeart = makeZoneCard('C3', 0, { name: '龙之心' });
    const god = makeGodCard('VRI', { name: '弗栗多' });
    const players = [
      makePlayer({ name: '你', san: 10 }),
      makePlayer({
        name: '卡洛斯',
        role: 'treasureHunter',
        san: 7,
        godEncounters: 2,
        godName: 'TSG',
        godLevel: 1,
        godZone: [makeGodCard('TSG')],
        hand: [slime],
      }),
    ];
    const encounterLog = '卡洛斯 遭遇邪神 弗栗多！（第3次）失去 3 SAN';
    const gs = makeGs({
      players,
      deck: [dragonHeart, god],
      currentTurn: 0,
      phase: 'ACTION',
      log: ['旧日志'],
      inspectionDeck: [{ id: 'sleep-check', name: '昏睡', effect: 'flip', value: 1, type: 'neutral' }],
      inspectionDiscard: [],
      _inspectionSeq: 0,
      _statEventSeq: 0,
    });

    const result = startNextTurn(gs);
    expect(result.phase).toBe('AI_GOD_CHOICE');
    expect(result._drawLogs).toContain(encounterLog);
    expect(result._statLogs).not.toContain(encounterLog);

    const replay = buildTurnStartDrawReplayQueue({
      oldGs: gs,
      newGs: result,
      effectOldGs: { ...gs, players: result._playersBeforeThisDraw || gs.players },
    });
    const godDraw = replay.queue.find(step => step.type === 'DRAW_CARD' && step.card === god);
    expect(godDraw?.msgs).toContain(encounterLog);
  });
});
