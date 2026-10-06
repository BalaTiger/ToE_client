import { describe, expect, it } from 'vitest';
import { startNextTurn } from '../turnEngine';
import {
  buildSkippedTurnReplayQueue,
  buildTurnStartDrawReplayQueue,
  TURN_START_ANIMATION_STAGE as STAGE,
} from '../turnAnimState';
import { normalizeVisibleTurnStartQueue } from '../turnStartPresentation';
import { makeGs, makePlayer, makeZoneCard } from './factory';

const messages = queue => queue.flatMap(step => step.msgs || []);
const banner = name => `── ${name} 的回合开始 ──`;
const wake = name => `${name} 从休息中醒来，跳过本回合`;

function realRestReplay(restingIndices, currentTurn) {
  const oldGs = makeGs({
    players: ['你', '艾伦', '贝拉'].map((name, index) => makePlayer({
      name, isResting: restingIndices.includes(index),
    })),
    currentTurn,
    deck: [makeZoneCard('D3')],
    log: [],
  });
  const newGs = startNextTurn(oldGs);
  const skipped = buildSkippedTurnReplayQueue(newGs);
  const following = buildTurnStartDrawReplayQueue({ oldGs, newGs });
  return { oldGs, newGs, queue: [...skipped, ...following.queue] };
}

describe('TOE007 turn transcript ordering', () => {
  it.each([
    { resting: [0], currentTurn: 2, skippedNames: ['你'], followingName: '艾伦' },
    { resting: [1], currentTurn: 0, skippedNames: ['艾伦'], followingName: '贝拉' },
    { resting: [0, 1], currentTurn: 2, skippedNames: ['你', '艾伦'], followingName: '贝拉' },
  ])('keeps each actual skipped turn before the next actor: $skippedNames', ({
    resting, currentTurn, skippedNames, followingName,
  }) => {
    const { newGs, queue } = realRestReplay(resting, currentTurn);
    expect(newGs._skippedTurnReplays).toHaveLength(resting.length);
    const sourceSnapshot = structuredClone(queue);
    const normalized = normalizeVisibleTurnStartQueue(queue);
    const shown = messages(normalized);
    let previousWakeIndex = -1;
    for (const name of skippedNames) {
      const bannerIndex = shown.indexOf(banner(name));
      const wakeIndex = shown.indexOf(wake(name));
      expect(shown.filter(line => line === banner(name))).toHaveLength(1);
      expect(shown.filter(line => line === wake(name))).toHaveLength(1);
      expect(bannerIndex).toBeGreaterThan(previousWakeIndex);
      expect(wakeIndex).toBeGreaterThan(bannerIndex);
      previousWakeIndex = wakeIndex;
    }
    expect(shown.indexOf(banner(followingName))).toBeGreaterThan(previousWakeIndex);
    expect(normalized).toEqual(queue);
    expect(queue).toEqual(sourceSnapshot);
  });

  it('preserves actual active-turn damage after a skipped actor wakes', () => {
    const goat = id => ({ id, name: '黑山羊幼仔', type: 'blackGoatYoung', isBlackGoatYoung: true });
    const oldGs = makeGs({
      players: [
        makePlayer({ name: '你' }),
        makePlayer({ name: '艾伦', isResting: true, hp: 8, san: 8, hand: [goat('a1'), goat('a2')] }),
        makePlayer({ name: '贝拉', hp: 8, san: 8, hand: [goat('b1'), goat('b2')] }),
      ],
      currentTurn: 0,
      deck: [makeZoneCard('D3')],
      inspectionDeck: [{ id: 'seal', name: '封印松动', effect: 'sealLoose', value: 0, type: 'negative' }],
      inspectionDiscard: [],
      log: [], _statEventSeq: 0, _statEvents: [], _inspectionSeq: 0,
    });
    const newGs = startNextTurn(oldGs);
    const canonical = [
      ...buildSkippedTurnReplayQueue(newGs),
      ...buildTurnStartDrawReplayQueue({ oldGs, newGs }).queue,
    ];
    const normalized = normalizeVisibleTurnStartQueue(canonical);
    const wakeIndex = normalized.findIndex(step => step.msgs?.includes(wake('艾伦')));
    const nextBannerIndex = normalized.findIndex(step => step.type === 'YOUR_TURN' && step.name === '贝拉');
    const damageIndex = normalized.findIndex(step => step.type === 'HP_DAMAGE');
    const drawIndex = normalized.findIndex(step => step.type === 'DRAW_CARD');
    expect(wakeIndex).toBeGreaterThanOrEqual(0);
    expect(nextBannerIndex).toBeGreaterThan(wakeIndex);
    expect(damageIndex).toBeGreaterThan(nextBannerIndex);
    expect(drawIndex).toBeGreaterThan(damageIndex);
    expect(normalized).toEqual(canonical);
  });

  it('keeps the existing boundary/banner/start/draw normalization for a single turn', () => {
    const beforeDraw = { type: 'HP_DAMAGE', turnStartStage: STAGE.TURN_START };
    const draw = { type: 'DRAW_CARD', turnStartStage: STAGE.DRAW };
    const turn = { type: 'YOUR_TURN', name: '艾伦', turnStartStage: STAGE.TURN_BANNER };
    const boundary = { type: 'STATE_PATCH', turnStartStage: STAGE.TURN_BOUNDARY };
    expect(normalizeVisibleTurnStartQueue([beforeDraw, draw, turn, boundary]))
      .toEqual([boundary, turn, beforeDraw, draw]);
  });

  it('retains leading visual locks when the single legacy banner has no stage', () => {
    const lock = { type: 'VISUAL_LOCK', players: [] };
    const damage = { type: 'HP_DAMAGE' };
    const turn = { type: 'YOUR_TURN', name: '你' };
    const after = { type: 'STATE_PATCH' };
    const draw = { type: 'DRAW_CARD', turnStartStage: STAGE.DRAW };
    expect(normalizeVisibleTurnStartQueue([lock, damage, turn, after, draw]))
      .toEqual([lock, turn, damage, after, draw]);
  });
});
