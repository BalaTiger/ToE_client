import { describe, expect, it } from 'vitest';
import { buildApophisTargetQueueForState, normalizeApophisQueueForPlayback } from '../apophisAnimQueue';
import { applyStatAnimationImpact } from '../statEvents';
import { createApophisTargetVisualEvent } from '../visualEvents';

function repeatedHunts({ canonical = true } = {}) {
  const hp = (from, to) => ({
    type: 'HP_DAMAGE', hitIndices: [2],
    ...(canonical ? { visualEventId: `hunt-${from}` } : {}),
    statEvents: [{ type: 'HP_LOSS', target: 2, seq: 1, from: { hp: from }, to: { hp: to } }],
  });
  const nightLoss = {
    type: 'SAN_LOSS', target: 1, seq: 1, reason: '黑夜',
    from: { hp: 9, san: 6 }, to: { hp: 9, san: 5 },
  };
  const targetEvent = {
    seq: 3, statSeq: 1, actorIdx: 1, targetIdx: 0, roll: 1, changed: true,
  };
  const visualEvent = createApophisTargetVisualEvent(targetEvent, { statEvents: [nightLoss] });
  const dice = (seq, roll) => ({ type: 'DICE_ROLL', diceMode: 'apophisNight', d1: roll, _apophisTargetSeq: seq });
  const queue = [
    dice(1, 6),
    { type: 'SKILL_HUNT', targetIdx: 2, players: [{}, {}, { hp: 6 }] },
    hp(6, 3),
    dice(2, 6),
    { type: 'SKILL_HUNT', targetIdx: 2, players: [{}, {}, { hp: 3 }] },
    hp(3, 0),
    { type: 'GUILLOTINE', hitIndices: [2] },
    { ...dice(3, 1), ...(canonical ? { visualEventId: visualEvent.id } : {}) },
    { type: 'SAN_DAMAGE', statEvents: visualEvent.statEvents, ...(canonical ? { visualEventId: visualEvent.id } : {}) },
    { type: 'SKILL_HUNT', targetIdx: 0 },
  ];
  return {
    queue,
    oldState: { _apophisTargetSeq: 0, _visualEvents: [] },
    nextState: {
      _apophisTargetSeq: 3, _apophisTargetEvent: targetEvent,
      ...(canonical ? { _visualEvents: [visualEvent] } : {}),
    },
    buildQueue: () => queue,
  };
}

describe('black-night ownership at the final playback boundary', () => {
  it.each([true, false])('keeps consecutive HP impacts and death in their hunt with colliding statSeq (canonical=%s)', canonical => {
    const { queue, oldState, nextState, buildQueue } = repeatedHunts({ canonical });
    const normalized = normalizeApophisQueueForPlayback(queue, oldState, nextState, { buildQueue });
    expect(normalized).toEqual(queue);
    expect(normalizeApophisQueueForPlayback(normalized, oldState, nextState, { buildQueue })).toEqual(normalized);

    let displayStats = [{ hp: 9, san: 6 }, { hp: 9, san: 6 }, { hp: 6, san: 6 }];
    const hpAtHunt = [];
    const hpAtDeath = [];
    for (const step of normalized) {
      if (step.type === 'SKILL_HUNT' && step.targetIdx === 2) {
        hpAtHunt.push(displayStats[2].hp);
        expect(displayStats[2].hp).toBe(step.players[2].hp);
      }
      if (step.type === 'GUILLOTINE') hpAtDeath.push(displayStats[2].hp);
      displayStats = applyStatAnimationImpact(displayStats, step);
    }
    expect(hpAtHunt).toEqual([6, 3]);
    expect(hpAtDeath).toEqual([0]);
    expect(displayStats[1].san).toBe(5);
  });

  it('does not extract an earlier HP or foreign SAN event sharing the night statSeq', () => {
    const { queue, oldState, nextState } = repeatedHunts();
    const foreignSan = {
      type: 'SAN_DAMAGE', visualEventId: 'rest-san',
      statEvents: [{ type: 'SAN_LOSS', target: 1, seq: 1, from: { san: 7 }, to: { san: 6 } }],
    };
    const built = buildApophisTargetQueueForState(oldState, nextState, () => [...queue, foreignSan]);
    expect(built).toEqual(queue.slice(7, 9));
  });

  it('matches untagged serialized stats by their stable stat id', () => {
    const { queue, oldState, nextState } = repeatedHunts();
    const untagged = JSON.parse(JSON.stringify(queue));
    untagged.forEach(step => { delete step.visualEventId; });
    const foreignSan = {
      type: 'SAN_DAMAGE',
      statEvents: [{ type: 'SAN_LOSS', target: 1, seq: 1, from: { san: 7 }, to: { san: 6 } }],
    };
    expect(buildApophisTargetQueueForState(oldState, nextState, () => [...untagged, foreignSan]))
      .toEqual(untagged.slice(7, 9));
  });

  it('respects a different explicit owner even when its stat payload matches', () => {
    const { queue, oldState, nextState } = repeatedHunts();
    const foreign = { ...queue[8], visualEventId: 'another-settlement' };
    expect(buildApophisTargetQueueForState(oldState, nextState, () => [queue[7], foreign]))
      .toEqual([queue[7]]);
  });

  it('does not claim a whole untagged mixed batch because one stat matches', () => {
    const { queue, oldState, nextState } = repeatedHunts();
    const mixed = { type: 'SAN_DAMAGE', statEvents: [...queue[8].statEvents, ...queue[2].statEvents] };
    expect(buildApophisTargetQueueForState(oldState, nextState, () => [queue[7], mixed]))
      .toEqual([queue[7]]);
  });

  it('rejects an old bare statSeq matching two SAN losses from the same actor', () => {
    const { queue, oldState, nextState } = repeatedHunts({ canonical: false });
    const secondNightLoss = {
      type: 'SAN_DAMAGE',
      statEvents: [{ type: 'SAN_LOSS', target: 1, seq: 1, reason: '黑夜',
        from: { hp: 9, san: 5 }, to: { hp: 9, san: 4 } }],
    };
    expect(() => buildApophisTargetQueueForState(oldState, nextState, () => [
      queue[7], queue[8], secondNightLoss,
    ])).toThrow(/AMBIGUOUS_LEGACY_APOPHIS_STATS/);
    expect(() => normalizeApophisQueueForPlayback([...queue, secondNightLoss], oldState, nextState, {
      buildQueue: () => [queue[7], queue[8]],
    })).toThrow(/AMBIGUOUS_LEGACY_APOPHIS_STATS/);
  });

  it('does not fall back to a legacy statSeq when a modern target explicitly owns no stats', () => {
    const { queue, oldState, nextState } = repeatedHunts({ canonical: false });
    nextState._apophisTargetEvent = { ...nextState._apophisTargetEvent, statEvents: [] };
    expect(buildApophisTargetQueueForState(oldState, nextState, () => queue)).toEqual([queue[7]]);
  });

  it('repairs a late legacy night prelude without moving unrelated same-seq damage', () => {
    const { queue, oldState, nextState } = repeatedHunts({ canonical: false });
    const [dice, san, skill] = queue.slice(7);
    const damage = queue[2];
    const legacyQueue = [skill, damage, dice, san];
    const buildQueue = () => [dice, san, damage];
    const normalized = normalizeApophisQueueForPlayback(legacyQueue, oldState, nextState, { buildQueue });
    expect(normalized).toEqual([dice, san, skill, damage]);
    expect(normalizeApophisQueueForPlayback(normalized, oldState, nextState, { buildQueue })).toEqual(normalized);
  });

  it('preserves owned settlement phases around non-stat reveal and death steps', () => {
    const { queue, oldState, nextState } = repeatedHunts();
    const owner = nextState._visualEvents[0].id;
    const owned = step => ({ ...step, visualEventId: owner });
    const settlement = [
      queue[7],
      queue[8],
      owned({ type: 'HP_DAMAGE', statEvents: [{ type: 'HP_LOSS', target: 1, seq: 1, from: { hp: 3 }, to: { hp: 0 } }] }),
      owned({ type: 'VRI_IMMORTAL_REVEAL', playerIdx: 1 }),
      owned({ type: 'HP_HEAL', statEvents: [{ type: 'HP_GAIN', target: 1, seq: 1, from: { hp: 0 }, to: { hp: 1 } }] }),
      owned({ type: 'GUILLOTINE', hitIndices: [2] }),
      owned({ type: 'DEATH', deadIndices: [2] }),
    ];
    const buildQueue = () => settlement;
    const normalized = normalizeApophisQueueForPlayback(settlement, oldState, nextState, { buildQueue });
    expect(normalized).toEqual(settlement);
    expect(normalizeApophisQueueForPlayback(normalized, oldState, nextState, { buildQueue })).toEqual(settlement);
  });

  it('keeps earlier explicitly owned dice even when their log equals the latest roll', () => {
    const log = '【黑夜】卡洛斯 选择【追捕】目标掷出 6，目标未偏移';
    const dice = seq => ({
      type: 'DICE_ROLL', diceMode: 'apophisNight', d1: 6, _apophisTargetSeq: seq, msgs: [log],
    });
    const earlierDice = dice(1);
    const latestDice = dice(2);
    const hunt = { type: 'SKILL_HUNT', targetIdx: 2 };
    const nextState = { _apophisTargetEvent: { seq: 2, log } };
    const queue = [earlierDice, hunt, { ...hunt }];
    const buildQueue = () => [latestDice];
    const normalized = normalizeApophisQueueForPlayback(queue, { _apophisTargetSeq: 0 }, nextState, { buildQueue });
    expect(normalized.filter(step => step.type === 'DICE_ROLL')).toContainEqual(earlierDice);
    expect(normalized.filter(step => step.type === 'DICE_ROLL')).toHaveLength(2);
  });
});
