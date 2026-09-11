import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import * as game from '../index';
import * as animQueueHelpers from '../animQueueHelpers';
import * as animLogs from '../animLogs';
import { consumeVisualLogEntries } from '../visualEventLogs';
import { GOD_DEFS } from '../../constants/card';
import { makeGodCard, makeGs, makeStandardPlayers } from './factory';

const appSource = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');

// Execute the actual App handler with its rule/compiler dependencies, replacing
// only React/UI callbacks. This catches state spread overwrites before replay.
function resolveLocalGodChoice({ fromHand = false, action = 'worship' } = {}) {
  const godCard = makeGodCard('APO');
  const players = makeStandardPlayers(3, [{ name: '你' }]);
  if (fromHand) players[0].hand = [godCard];
  if (action === 'upgrade') {
    players[0].godName = 'APO';
    players[0].godLevel = 1;
    players[0].godZone = [makeGodCard('APO')];
  }
  const previousEvent = game.createLogOnlyVisualEvent({ msgs: ['已播放的遭遇日志'] });
  const gs = makeGs({
    players,
    phase: fromHand ? 'ACTION' : 'GOD_CHOICE',
    abilityData: fromHand ? {} : { godCard, drawerIdx: 0 },
    _visualEvents: [previousEvent],
    log: ['已播放的遭遇日志'],
  });
  const play = vi.fn();
  const functionName = fromHand ? 'worshipFromHand' : 'godResolvePlayer';
  const start = appSource.indexOf(`  function ${functionName}(`);
  const end = appSource.indexOf('\n  }', start) + '\n  }'.length;
  const context = {
    ...game,
    ...animQueueHelpers,
    ...animLogs,
    GOD_DEFS,
    gs,
    me: players[0],
    showTutorial: false,
    lastInspectionSeqRef: { current: 0 },
    setMobileArmedGodCardIdx: vi.fn(),
    setGs: vi.fn(),
    broadcastAnimTransaction: vi.fn(),
    triggerAnimQueue: play,
    triggerSyncedAnimTransaction: play,
  };
  runInNewContext(`${appSource.slice(start, end)}\n${functionName}(${JSON.stringify(fromHand ? 0 : action)});`, context);
  expect(play).toHaveBeenCalledOnce();
  return { queue: play.mock.calls[0][0], nextGs: play.mock.calls[0][1], previousEvent, gs };
}

describe('local god choice live replay', () => {
  it.each([
    { fromHand: false, action: 'worship' },
    { fromHand: false, action: 'upgrade' },
    { fromHand: true, action: 'worship' },
    { fromHand: true, action: 'upgrade' },
  ])('preserves faith and eclipse events for $action (fromHand=$fromHand)', options => {
    const { queue, nextGs, previousEvent, gs } = resolveLocalGodChoice(options);
    expect(nextGs._visualEvents).toContain(previousEvent);
    const relevant = queue.filter(step => ['GOD_HIGHLIGHT', 'APOPHIS_ECLIPSE'].includes(step.type));
    expect(relevant.map(step => step.type)).toEqual(['GOD_HIGHLIGHT', 'APOPHIS_ECLIPSE']);
    expect(relevant.every(step => step.visualEventId)).toBe(true);
    const consumed = new Set();
    const liveLogs = animLogs.prepareAnimQueueLogs(queue)
      .flatMap(step => consumeVisualLogEntries(step.logEntries, consumed));
    expect(liveLogs).toEqual(nextGs.log.slice(gs.log.length));
    expect(liveLogs).not.toContain('已播放的遭遇日志');
  });

  it('lets keeping a god card carry its log on the card transfer event', () => {
    const { queue, nextGs, gs } = resolveLocalGodChoice({ action: 'keepHand' });
    const transfer = queue.find(step => step.type === 'CARD_TRANSFER');
    expect(transfer?.visualEventId).toBeTruthy();
    expect(queue.flatMap(step => step.msgs || [])).toEqual(nextGs.log.slice(gs.log.length));
  });
});
