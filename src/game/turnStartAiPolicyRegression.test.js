import { describe, expect, it } from 'vitest';
import { buildTurnStartDrawReplayQueue } from './turnAnimState';
import { createStatEventsEvent, createTurnDrawVisualEvents } from './visualEvents';
import { makeGs, makePlayer, makeZoneCard } from './__tests__/factory';

describe('AI turn-start replay after a settled action', () => {
  it('keeps the previous rest heal out of a new draw when an AOE log repeats', () => {
    const mouse = makeZoneCard('D3', 0, { name: '鼠群', type: 'allDamageSAN', val: 1 });
    const repeatedAoeLog = '全体存活角色失去 1 SAN';
    const encounterLog = '你 遭遇邪神 伏行之混沌！（第3次）失去 3 SAN';
    const oldPlayers = [makePlayer({ name: '你', hp: 8, san: 5 }), makePlayer({ name: '黛安娜', hp: 6, san: 8 })];
    const beforeDraw = structuredClone(oldPlayers);
    beforeDraw[1].hp = 8;
    const afterDraw = structuredClone(beforeDraw);
    afterDraw[0].san = 2;
    afterDraw[0].hand.push(mouse);
    const historicalAoe = { id: 'aoe:earlier', seq: 26, type: 'SAN_LOSS', target: 0,
      from: { hp: 8, san: 6 }, to: { hp: 8, san: 5 }, logHint: repeatedAoeLog };
    const rest = { id: 'rest:prior-actor', seq: 28, type: 'HP_GAIN', target: 1,
      from: { hp: 6, san: 8 }, to: { hp: 8, san: 8 }, reason: '休息' };
    const encounter = { id: 'encounter:this-draw', seq: 29, type: 'SAN_LOSS', target: 0,
      from: { hp: 8, san: 5 }, to: { hp: 8, san: 2 }, logHint: encounterLog };
    const oldGs = makeGs({ players: oldPlayers, currentTurn: 1, _statEvents: [historicalAoe], _statEventSeq: 27 });
    const newGs = makeGs({
      players: afterDraw, currentTurn: 0, phase: 'ETHEREALIZE_DECISION',
      abilityData: { type: 'etherealizeRedirect', targetIdx: 1 },
      _drawnCard: mouse, _aiDrawnCard: mouse, _playersBeforeThisDraw: beforeDraw,
      _turnStartLogs: ['── 你 的回合开始 ──'], _drawLogs: ['你 摸到 [D3] 鼠群'],
      _statLogs: [encounterLog, repeatedAoeLog],
      _statEvents: [historicalAoe, rest, encounter], _statEventSeq: 29,
      log: ['黛安娜 休息回复2HP', '── 你 的回合开始 ──', encounterLog, '你 摸到 [D3] 鼠群', repeatedAoeLog],
      _visualEvents: [
        { id: 'banner:new', type: 'turnStart', turnStartStage: 'turnBanner', playerIdx: 0, msgs: ['── 你 的回合开始 ──'] },
        ...createTurnDrawVisualEvents({ playerIdx: 0, card: mouse, msgs: ['你 摸到 [D3] 鼠群'] }),
        createStatEventsEvent({ statEvents: [encounter], msgs: [encounterLog], turnStartStage: 'draw' }),
        createStatEventsEvent({ statEvents: [rest], msgs: ['黛安娜 休息回复2HP'] }),
      ],
    });
    const replay = buildTurnStartDrawReplayQueue({ oldGs, newGs });
    expect(replay.queue.some(step => step.type === 'HP_HEAL')).toBe(false);
    expect(replay.queue.flatMap(step => step.statEvents || []).map(event => event.id)).toContain(encounter.id);
    expect(replay.queue.flatMap(step => step.statEvents || []).map(event => event.id)).not.toContain(rest.id);
  });
});
