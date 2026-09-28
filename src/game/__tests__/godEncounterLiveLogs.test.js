import { describe, expect, it } from 'vitest';
import { startNextTurn } from '../turnEngine';
import { buildTurnStartDrawReplayQueue } from '../turnAnimState';
import { prepareAnimQueueLogs } from '../animLogs';
import { consumeVisualLogEntries } from '../visualEventLogs';
import { createTsathogguaSlimeCard } from '../../constants/card';
import { makeGodCard, makeGs, makeStandardPlayers, makeZoneCard } from './factory';

describe('god encounter live log ownership', () => {
  it.each(['ai', 'player', 'aiSlime'])('plays each %s encounter once while retaining SAN damage', mode => {
    const actorIdx = mode === 'player' ? 0 : 1;
    const god = makeGodCard(mode === 'aiSlime' ? 'NYA' : 'TSG');
    const players = makeStandardPlayers(3, [{ name: '你' }, { name: '艾伦' }]);
    if (mode === 'aiSlime') Object.assign(players[actorIdx], {
      godName: 'TSG', godLevel: 1, godZone: [makeGodCard('TSG')], hand: [createTsathogguaSlimeCard()],
    });
    const oldGs = makeGs({
      players,
      currentTurn: mode === 'player' ? 2 : 0,
      deck: [god, makeZoneCard('A1', 1)],
      log: ['旧日志'],
    });
    const newGs = startNextTurn(oldGs);
    const replay = buildTurnStartDrawReplayQueue({
      oldGs, newGs, effectOldGs: { ...oldGs, players: newGs._playersBeforeThisDraw || oldGs.players },
    });
    const encounterMsgs = newGs.log.filter(line => line.includes('遭遇邪神'));
    const consumed = new Set();
    const liveLogs = prepareAnimQueueLogs(replay.queue)
      .flatMap(step => consumeVisualLogEntries(step.logEntries, consumed));
    expect(encounterMsgs).toHaveLength(1);
    expect(liveLogs.filter(line => line.includes('遭遇邪神'))).toEqual(encounterMsgs);
    expect(newGs._visualEvents.flatMap(event => event.msgs || [])
      .filter(line => line.includes('遭遇邪神'))).toEqual(encounterMsgs);
    const drawIdx = replay.queue.findIndex(step => step.type === 'DRAW_CARD' && step.card === god);
    const lossIdx = replay.queue.findIndex(step => step.type === 'SAN_DAMAGE');
    expect(drawIdx).toBeGreaterThanOrEqual(0);
    expect(lossIdx).toBeGreaterThan(drawIdx);
    expect(newGs.players[actorIdx].san).toBe(9);
  });
});
