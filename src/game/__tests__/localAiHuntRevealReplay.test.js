import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import * as game from '../index';
import * as animQueueHelpers from '../animQueueHelpers';
import * as animLogs from '../animLogs';
import * as huntTransactions from '../identitySkillVisualTransaction';
import { getHuntRevealPromptId } from '../phaseUi';
import { consumeVisualLogEntries } from '../visualEventLogs';
import { makeGs, makeStandardPlayers, makeZoneCard } from './factory';

const appSource = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');

describe('player reveal during AI hunt live replay', () => {
  it('shows the AI abandonment after revealing an unmatched card before the next turn', () => {
    const revealedCard = makeZoneCard('B4', 0, { name: '落井下石' });
    const players = makeStandardPlayers(3, [
      { name: '你', hand: [revealedCard] },
      { name: '艾伦', hand: [makeZoneCard('A1', 0)], godName: 'TSG', godLevel: 1, roleRevealed: true },
      { name: '贝拉', hand: [makeZoneCard('D2', 0)] },
    ]);
    const gs = makeGs({
      players, currentTurn: 1, phase: 'PLAYER_REVEAL_FOR_HUNT',
      abilityData: { huntingAI: 1, aiHunterName: '艾伦', huntPromptId: 'hunt-player-reveal' },
      deck: [makeZoneCard('C3', 0)],
      log: ['艾伦（追猎者）向你发动【追捕】！请选择亮出一张手牌'],
    });
    const play = vi.fn();
    const start = appSource.indexOf('  function playerRevealForHunt(');
    const end = appSource.indexOf('\n  }', start) + '\n  }'.length;
    runInNewContext(`${appSource.slice(start, end)}\nplayerRevealForHunt(0);`, {
      ...game, ...animQueueHelpers, ...animLogs, ...huntTransactions, getHuntRevealPromptId,
      gs, me: players[0],
      consumedVisualEventIdsRef: { current: new Set() },
      setDismissedHuntRevealPromptId: vi.fn(),
      // The next turn is a separate presentation; capture this handler's
      // actual rule/compiler settlement before its UI continuation runs.
      buildQueuedNextAiTurnStartReplay: () => [],
      triggerAnimQueue: play,
    });
    expect(play).toHaveBeenCalledOnce();
    const [queue, nextState] = play.mock.calls[0];
    const consumedIds = new Set();
    const liveLogs = animLogs.prepareAnimQueueLogs(queue, nextState)
      .flatMap(step => consumeVisualLogEntries(step.logEntries, consumedIds));
    const resultEvent = nextState._visualEvents.find(event => event.type === 'huntResult');
    const revealMsg = '你亮出 [B4] 落井下石';
    const abandonMsg = '艾伦（追猎者）放弃追捕 你';

    expect(nextState.log.slice(gs.log.length, gs.log.length + 2)).toEqual([revealMsg, abandonMsg]);
    expect(resultEvent.msgs).toEqual([abandonMsg]);
    expect(liveLogs).toEqual([revealMsg, abandonMsg]);
    expect(nextState.players[0].hp).toBe(10);
    expect(queue.filter(step => step.type === 'HP_DAMAGE')).toEqual([]);
    expect(queue.find(step => step.type === 'ANIM_LOG')).toMatchObject({ visualEventId: resultEvent.id });
  });
});
