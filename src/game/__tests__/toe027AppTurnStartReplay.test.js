import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import * as game from '../index';
import * as helpers from '../animQueueHelpers';
import * as rotateState from '../rotateState';
import * as animLogs from '../animLogs';
import { getPendingZhuHideCardForState } from '../../multiplayer/multiplayerRemoteReplayExecutor';
import { makeBlankZoneCard, makeGodCard, makeGs, makePlayer } from './factory';

const source = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
const handlers = ['buildAppTurnStartDrawReplay', 'buildActorTurnStartReplay',
  'buildSinglePlayerAiTurnStartReplay', 'applyNextTurnGs'].map(name => {
  const start = source.indexOf(`  function ${name}(`);
  const closing = /\n {2}}\r?\n/.exec(source.slice(start));
  if (start < 0 || !closing) throw new Error(`Missing App handler: ${name}`);
  return source.slice(start, start + closing.index + closing[0].length);
}).join('\n');
const submitTurnStart = source.match(/ {2}const submitTurnStartPresentation=useCallback\([\s\S]*?\},\[submitPresentation\]\);/)?.[0];

describe('TOE027 App author produces the complete fatal turn transaction', () => {
  it.each([2, 3])('preserves the fatal drawer presentation before final state with %i players', count => {
    const god = makeGodCard('VRI', { id: 'app-fatal-vri' });
    const players = Array.from({ length: count }, (_, i) => makePlayer({ name: `app-seat-${i}` }));
    players[1].hp = 2;
    players[1].san = 8;
    players[1].godEncounters = 1;
    const initial = makeGs({ _isMP: true, players, currentTurn: 0, _turnKey: 12, turn: 12,
      deck: [god, makeBlankZoneCard({ id: 'app-living-draw' })], _visualEvents: [],
      inspectionDeck: [{ name: '自残', effect: 'selfDamageHP', value: 2, type: 'negative' }], inspectionDiscard: [] });
    const next = game.startNextTurn(initial);
    const submissions = [];
    const context = { ...game, ...helpers, ...rotateState, ...animLogs, gs: initial,
      getPendingZhuHideCardForState,
      useCallback: callback => callback,
      endTurnSeqRef: { current: {} }, lastInspectionSeqRef: { current: 0 },
      consumedVisualEventIdsRef: { current: new Set() },
      markTurnDrawInspectionEventsSeen: vi.fn(), visualStateLocks: { lock: vi.fn() },
      setGs: vi.fn(), broadcastAnimTransaction: vi.fn(() => true),
      submitPresentation: params => submissions.push(game.prepareAnimationTransaction({
        queue: params.queue, previousState: initial, nextState: params.nextState,
        callback: params.callback, transactionMeta: params,
      })),
    };
    runInNewContext(`${handlers}\n${submitTurnStart}`, context);
    context.applyNextTurnGs(next);
    expect(submissions).toHaveLength(1);
    const queue = submissions[0].queue;
    const godDraw = queue.findIndex(step=>step.type==='DRAW_CARD'&&step.card?.id===god.id);
    const death = queue.findIndex(step=>step.type==='DEATH');
    const discard = queue.findIndex(step=>step.type==='DISCARD'&&step.card?.id===god.id);
    expect(godDraw).toBeGreaterThanOrEqual(0);
    expect(death).toBeGreaterThan(godDraw);
    expect(discard).toBeGreaterThan(death);
    expect(context.broadcastAnimTransaction).toHaveBeenCalledOnce();
    expect(context.endTurnSeqRef.current).toBeNull();
    if (count === 3) {
      const banners = queue.filter(step=>step.type==='YOUR_TURN');
      expect(banners.map(step=>step.name)).toEqual(['app-seat-1', 'app-seat-2']);
      expect(queue.indexOf(banners[1])).toBeGreaterThan(discard);
      expect(queue.findIndex(step=>step.type==='DRAW_CARD'&&step.card?.id==='app-living-draw')).toBeGreaterThan(discard);
    }
  });
});
