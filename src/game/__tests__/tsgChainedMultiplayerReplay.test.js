import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import * as game from '../index';
import * as animationHelpers from '../animQueueHelpers';
import * as rotation from '../rotateState';
import * as animationLogs from '../animLogs';
import { buildMpRemoteReplayAction } from '../multiplayerRemoteReplay';
import { makeGs, makeStandardPlayers, makeZoneCard } from './factory';
import { createTsathogguaSlimeCard } from '../../constants/card';

const source = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
const start = source.indexOf('  function _tsgContinueTurnStartDraw(');
const end = source.indexOf('  function _cthContinueRestDraws(', start);
const handler = source.slice(start, end);

function continueDraw({ slime = false } = {}) {
  const card = makeZoneCard('B2', 0);
  const players = makeStandardPlayers(3, [
    { name: 'Drawer', role: '追猎者', godName: 'TSG', godLevel: 1,
      hand: slime ? [createTsathogguaSlimeCard()] : [] },
    { name: 'Target', role: '寻宝者', hand: [] },
    { name: 'Observer', role: '邪祀者', hand: [] },
  ]);
  const gs = makeGs({ players, deck: [card], currentTurn: 0, _isMP: true,
    phase: 'ACTION', abilityData: { fromTsathogguaSlime: true, continueTurnStartDraw: true, _turnOwner: 0 },
    _visualEvents: [], log: [] });
  const actions = [];
  const context = { ...game, ...animationHelpers, ...rotation, ...animationLogs, gs,
    consumedVisualEventIdsRef: { current: new Set() }, isAiSeat: () => false,
    broadcastAnimTransaction: (state, queue) => {
      const event = game.createAnimTransactionEvent({ actorIdx: 0, actorName: 'Drawer', queue,
        coveredEventIds: game.getVisualEventIdsCoveredByAnimationQueue(state, queue) });
      actions.push({ type: 'publish', state: { ...state, _visualEvents: [event, ...(state._visualEvents || [])] }, queue });
      return true;
    },
    triggerAnimQueue: (queue, state, callback, meta) => actions.push({ type: 'play', queue, state, callback, meta }),
    setGs: state => actions.push({ type: 'state', state }),
  };
  runInNewContext(`${handler}\n_tsgContinueTurnStartDraw(input);`, { ...context, input: gs });
  return { actions, card };
}

describe('multiplayer chained slime draw publication', () => {
  it('publishes the fixed draw transaction before local playback or the next decision', () => {
    const { actions, card } = continueDraw();
    expect(actions.map(action => action.type)).toEqual(['publish', 'play']);
    const published = actions[0];
    expect(published.state.phase).toBe('DRAW_REVEAL');
    expect(published.state.drawReveal.card.id).toBe(card.id);
    for (const viewer of [0, 1, 2]) {
      const rotated = rotation.rotateGsForViewer(published.state, viewer);
      const { queue } = buildMpRemoteReplayAction({ rotated,
        previousGs: { ...rotated, _visualEvents: [] }, roleRevealed: true });
      expect(queue.filter(step => step.type === 'DRAW_CARD' && step.card.id === card.id)).toHaveLength(1);
      expect(queue.flatMap(step => step.msgs || []).join('\n')).toContain('Drawer 摸到');
    }
  });

  it('publishes an additional slime pop before its deferred next draw and keeps its local callback', () => {
    const { actions } = continueDraw({ slime: true });
    expect(actions.map(action => action.type)).toEqual(['publish', 'play']);
    expect(actions[0].queue[0].type).toBe('TSG_SLIME_POP');
    expect(actions[1].state).toBeNull();
    expect(typeof actions[1].callback).toBe('function');
  });
});
