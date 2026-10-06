import { describe, expect, it } from 'vitest';
import { cardTransferStep } from '../animQueueHelpers';
import { prepareAnimationQueueSteps } from '../animationStepSchema';
import { buildMpRemoteReplayAction, MP_REMOTE_REPLAY } from '../multiplayerRemoteReplay';
import { rotateGsForViewer } from '../rotateState';
import { statEventsToAnimQueue } from '../statEvents';
import {
  compileFreshVisualEventQueue,
  compileRuleVisualEventsToAnimTransaction,
} from '../visualEventTransactionCompiler';
import {
  createAnimTransactionEvent,
  createGodPowerBlockedEvent,
  createHuntResultEvent,
  createStatEventsEvent,
} from '../visualEvents';

const card = { id: 'toe014-zone-card', key: 'A4', name: '活埋', type: 'zone' };
const beforePlayers = ['QA-A', 'QA-B', 'QA-C'].map(name => ({
  name, hp: 10, san: 10, hand: [], godZone: [], isDead: false,
}));
const loss = (type = 'HP_LOSS') => ({
  id: `stat:toe014:${type}`, seq: 1, type, target: 1,
  from: { hp: 10, san: 10, isDead: false },
  to: { hp: type === 'SAN_LOSS' ? 10 : 6, san: type === 'HP_LOSS' ? 10 : 8, isDead: false },
});
const state = players => ({
  _isMP: true, players, currentTurn: 1, phase: 'ACTION', log: [],
  abilityData: {}, drawReveal: null, discard: [],
});
const afterPlayers = stat => beforePlayers.map((player, index) => (
  index === stat.target ? { ...player, ...stat.to } : player
));

function replay(queue, events, { players = beforePlayers, viewer = 0 } = {}) {
  const transaction = createAnimTransactionEvent({
    context: 'toe014-regression', queue, coveredEventIds: [], beforePlayers,
  });
  const previousGs = rotateGsForViewer(state(beforePlayers), viewer);
  const rotated = rotateGsForViewer({ ...state(players), _visualEvents: [transaction, ...events] }, viewer);
  const action = buildMpRemoteReplayAction({
    rotated, previousGs, roleRevealed: true, compileFreshVisualEventQueue,
    buildFullHandSwapTransferQueueFromLogs: () => [],
  });
  expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
  expect(action.queueAuthority).toBe('queue');
  return action;
}

function projectionSteps(action, id, type) {
  return action.queue.filter(step => step.type === type
    && step.statEvents?.some(stat => stat.id === id));
}

function expectValidQueue(action) {
  expect(prepareAnimationQueueSteps(action.queue).issues).toEqual([]);
}

describe('TOE014 exact multiplayer replay coverage', () => {
  it.each([0, 1, 2])('does not compile an already presented stat wrapper twice for viewer %s', viewer => {
    const stat = loss();
    const wrapper = createStatEventsEvent({ statEvents: [stat] });
    const queue = statEventsToAnimQueue([stat], beforePlayers);
    expect(queue.every(step => !step.visualEventId)).toBe(true);

    const action = replay(queue, [wrapper], { players: afterPlayers(stat), viewer });

    expect(projectionSteps(action, stat.id, 'HP_DAMAGE')).toHaveLength(1);
    expect(projectionSteps(action, stat.id, 'HP_DAMAGE')[0].hitIndices).toEqual([(1 - viewer + 3) % 3]);
    expect(action.consumedVisualEventIds).toContain(wrapper.id);
    expectValidQueue(action);
  });

  it('recognizes both split projections of one HP_SAN event as complete coverage', () => {
    const stat = loss('HP_SAN_LOSS');
    const wrapper = createStatEventsEvent({ statEvents: [stat] });
    const action = replay(statEventsToAnimQueue([stat], beforePlayers), [wrapper], { players: afterPlayers(stat) });

    expect(projectionSteps(action, stat.id, 'HP_DAMAGE')).toHaveLength(1);
    expect(projectionSteps(action, stat.id, 'SAN_DAMAGE')).toHaveLength(1);
    expect(action.consumedVisualEventIds).toContain(wrapper.id);
    expectValidQueue(action);
  });

  it.each([false, true])('retains the missing SAN projection without replaying HP (owner tag %s)', tagged => {
    const stat = loss('HP_SAN_LOSS');
    const wrapper = createStatEventsEvent({ statEvents: [stat] });
    const hpOnly = statEventsToAnimQueue([stat], beforePlayers).filter(step => step.type === 'HP_DAMAGE');
    const queue = tagged ? hpOnly.map(step => ({ ...step, visualEventId: wrapper.id })) : hpOnly;
    const action = replay(queue, [wrapper], { players: afterPlayers(stat) });

    expect(projectionSteps(action, stat.id, 'HP_DAMAGE')).toHaveLength(1);
    expect(projectionSteps(action, stat.id, 'SAN_DAMAGE')).toHaveLength(1);
    expect(action.consumedVisualEventIds).toContain(wrapper.id);
    expectValidQueue(action);
  });

  it.each([
    ['HP_LOSS', 'HP_DAMAGE'],
    ['SAN_LOSS', 'SAN_DAMAGE'],
  ])('retains only the missing member of a partial %s batch', (statType, stepType) => {
    const statA = { ...loss(statType), id: `stat:toe014:${statType}:A` };
    const statB = {
      ...loss(statType), id: `stat:toe014:${statType}:B`, target: 2,
      to: { hp: statType === 'HP_LOSS' ? 7 : 10, san: statType === 'SAN_LOSS' ? 9 : 10, isDead: false },
    };
    const wrapper = createStatEventsEvent({ statEvents: [statA, statB] });
    const players = beforePlayers.map((player, index) => ({
      ...player, ...(index === 1 ? statA.to : index === 2 ? statB.to : {}),
    }));
    const action = replay(statEventsToAnimQueue([statA], beforePlayers), [wrapper], { players });

    const projectionA = projectionSteps(action, statA.id, stepType);
    const projectionB = projectionSteps(action, statB.id, stepType);
    expect(projectionA).toHaveLength(1);
    expect(projectionB).toHaveLength(1);
    expect(projectionA[0].hitIndices).toEqual([1]);
    expect(projectionB[0].hitIndices).toEqual([2]);
    expect(projectionB[0].statEvents).toEqual([statB]);
    expect(action.consumedVisualEventIds).toContain(wrapper.id);
    expectValidQueue(action);
  });

  it('keeps a legal trailing hand transfer adjacent to its final commit', () => {
    const stat = loss('HP_SAN_LOSS');
    const wrapper = createStatEventsEvent({ statEvents: [stat] });
    const players = afterPlayers(stat).map((player, index) => (
      index === 1 ? { ...player, hand: [card] } : player
    ));
    const queue = [
      ...statEventsToAnimQueue([stat], beforePlayers),
      cardTransferStep({
        fromPid: 1, dest: 'player', toPid: 1, count: 1,
        sourceAnchor: 'playerArea', effect: 'draw', cards: [card],
      }),
    ];
    expect(prepareAnimationQueueSteps(queue).issues).toEqual([]);

    const action = replay(queue, [wrapper], { players });
    const transferIndex = action.queue.findIndex(step => step.type === 'CARD_TRANSFER');

    expect(projectionSteps(action, stat.id, 'HP_DAMAGE')).toHaveLength(1);
    expect(projectionSteps(action, stat.id, 'SAN_DAMAGE')).toHaveLength(1);
    expect(action.queue[transferIndex + 1]).toMatchObject({ type: 'STATE_PATCH', players });
    expectValidQueue(action);
  });

  it('batch compiles genuinely uncovered events with shared stat ownership and keeps an unrelated event', () => {
    const stat = loss();
    const players = afterPlayers(stat);
    const hunt = createHuntResultEvent({
      hunterIdx: 0, targetIdx: 1, statEvents: [stat], beforePlayers, afterPlayers: players,
    });
    const wrapper = createStatEventsEvent({ statEvents: [stat] });
    const blocked = createGodPowerBlockedEvent({
      playerIdx: 1, playerName: 'QA-B', msgs: ['QA-B 本回合不受邪神之力影响'],
    });
    const expectedTail = compileRuleVisualEventsToAnimTransaction({
      ...state(players), _visualEvents: [hunt, wrapper, blocked],
    }, state(beforePlayers)).queue;

    const action = replay([{ type: 'YOUR_TURN', name: 'QA-B' }], [hunt, wrapper, blocked], { players });

    expect(action.queue.slice(1, -1).map(step => step.type)).toEqual(expectedTail.map(step => step.type));
    expect(projectionSteps(action, stat.id, 'HP_DAMAGE')).toHaveLength(1);
    expect(action.queue.filter(step => step.type === 'GOD_POWER_BLOCKED')).toHaveLength(1);
    expect(action.consumedVisualEventIds).toEqual(expect.arrayContaining([hunt.id, wrapper.id, blocked.id]));
    expectValidQueue(action);
  });

  it.each([
    { id: 'toe014-unknown', type: 'futureVisualEvent' },
    { id: 'toe014-incomplete-throw', type: 'throwStone', sourceIdx: 1, damage: 4 },
  ])('strictly rejects uncovered events that cannot compile ($id)', event => {
    expect(() => replay([{ type: 'YOUR_TURN', name: 'QA-B' }], [event]))
      .toThrow('EMPTY_VISUAL_EVENT_QUEUE');
  });
});
