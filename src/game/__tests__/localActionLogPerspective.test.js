import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import * as game from '../index';
import * as animQueueHelpers from '../animQueueHelpers';
import * as animLogs from '../animLogs';
import * as godEncounterProgress from '../balancePatches';
import { buildBewitchGiftVisualTransaction } from '../identitySkillVisualTransaction';
import { derotateGs, localDisplayName, rotateGsForViewer } from '../rotateState';
import { consumeVisualLogEntries } from '../visualEventLogs';
import { normalizeLogForViewer } from '../logPerspective';
import { buildMpRemoteReplayAction } from '../multiplayerRemoteReplay';
import { makeGodCard, makeGs, makeStandardPlayers, makeZoneCard } from './factory';

const appSource = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
function handlerSource(name) {
  const start = appSource.indexOf(`  function ${name}(`);
  const closing = /\n {2}}\r?\n/.exec(appSource.slice(start));
  return appSource.slice(start, start + closing.index + closing[0].length);
}

function resolveAction(kind) {
  const card = kind === 'discard' ? makeZoneCard('C2') : makeGodCard('TSG');
  const players = makeStandardPlayers(3, [
    { name: '诺亚', role: '邪祀者', hand: [card] },
    { name: '奥托', role: '寻宝者' },
    { name: '索菲', role: '追猎者', godName: 'SHU', godLevel: 1, godZone: [makeGodCard('SHU')] },
  ]);
  const gs = makeGs({
    players, _isMP: true, _visualEvents: [],
    phase: kind === 'discard' ? 'DRAW_REVEAL' : 'BEWITCH_SELECT_TARGET',
    drawReveal: kind === 'discard' ? { card, drawerIdx: 0, drawerName: '诺亚', needsDecision: true } : null,
    abilityData: kind === 'discard' ? {} : { bewitchCard: card, bewitchIdx: 0 },
  });
  const packets = [];
  const context = {
    ...game, ...animQueueHelpers, ...animLogs, ...godEncounterProgress,
    derotateGs, localDisplayName, buildBewitchGiftVisualTransaction,
    gs, isMultiplayer: true,
    consumedVisualEventIdsRef: { current: new Set() },
    myPlayerIndexRef: { current: 1 },
    suppressNextBroadcastRef: { current: false },
    lastInspectionSeqRef: { current: 0 },
    roomModal: { roomId: 'local-log-regression' },
    isTutorialActionAllowed: () => true,
    getNextTutorialStepForAction: () => null,
    socketRef: { current: { emit: (_name, payload) => packets.push(JSON.parse(JSON.stringify(payload.gs))) } },
    triggerAnimQueue: (queue, state) => { context.queue = queue; context.nextGs = state; },
    finishTutorialActionWithState: (state, _step, queue) => context.triggerAnimQueue(queue, state),
  };
  const name = kind === 'discard' ? 'handleDrawDiscardResolved' : 'bewitchSelectTarget';
  runInNewContext([
    appSource.match(/ {2}const clearTurnDrawReplayHints=[\s\S]*?\}\):state;/)[0],
    ...[name, 'broadcastAnimTransaction', 'broadcastMpStateBeforeLocalReplay'].map(handlerSource),
    `${name}(${kind === 'discard' ? '' : '2'});`,
  ].join('\n'), context);
  expect(packets).toHaveLength(1);
  return { ...context, card, packet: packets[0] };
}

function visibleLogs(queue, state) {
  const consumed = new Set();
  const logs = animLogs.prepareAnimQueueLogs(queue, state)
    .flatMap(step => consumeVisualLogEntries(step.logEntries, consumed));
  return normalizeLogForViewer(logs, { isMultiplayer: true, myName: state.players[0].name });
}

describe('real local actions retain canonical log actors in multiplayer', () => {
  it.each(['discard', 'bewitch'])('keeps the %s actor and all rule messages across three viewers', kind => {
    const result = resolveAction(kind);
    const expectedCanonical = result.nextGs.log;
    expect(expectedCanonical[0]).toMatch(/^诺亚/);
    if (kind === 'bewitch') {
      expect(expectedCanonical).toHaveLength(4);
      expect(expectedCanonical[1]).toContain('索菲 遭遇邪神 蟾蜍之神');
      expect(expectedCanonical[2]).toContain('索菲 被迫改信新神');
      expect(expectedCanonical[3]).toContain('索菲 信仰了 蟾蜍之神');
      expect(result.nextGs.players[2].san).toBe(8);
    }
    expect(visibleLogs(result.queue, result.nextGs)).toEqual(expectedCanonical.map(line => line.replaceAll('诺亚', '你')));
    for (let viewer = 0; viewer < 3; viewer++) {
      const rotated = rotateGsForViewer(result.packet, viewer);
      const action = buildMpRemoteReplayAction({
        rotated,
        previousGs: rotateGsForViewer(derotateGs(result.gs, 1), viewer),
        roleRevealed: true,
      });
      const ownName = rotated.players[0].name;
      expect(visibleLogs(action.queue, rotated)).toEqual(expectedCanonical.map(line => line.replaceAll(ownName, '你')));
      if (kind === 'bewitch') {
        const faith = action.queue.find(step => step.type === 'GOD_HIGHLIGHT');
        expect(faith.msgs).toEqual([expectedCanonical[3]]);
      }
    }
  });
});
