import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import * as game from '../index';
import * as animQueueHelpers from '../animQueueHelpers';
import { isMultiplayerGame } from '../rotateState';
import { makeGs, makeStandardPlayers, makeZoneCard } from './factory';

const source = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const handlers = ['buryAliveSelectCard', 'confirmBuryAliveSelection'].map(name => {
  const start = source.indexOf(`  function ${name}(`);
  const closing = /\n {2}}\r?\n/.exec(source.slice(start));
  if (start < 0 || !closing) throw new Error(`Missing App handler boundary: ${name}`);
  return source.slice(start, start + closing.index + closing[0].length);
}).join('\n');
const aiEffectStart = source.lastIndexOf('  useEffect(()=>{',
  source.indexOf("if(!gs||gs.phase!=='BURY_ALIVE_SELECT'||gs.gameOver"));
const aiEffectEnd = source.indexOf('\n\n  useEffect', aiEffectStart);
if (aiEffectStart < 0 || aiEffectEnd < 0) throw new Error('Missing solo bury-alive effect boundary');
const aiEffect = source.slice(aiEffectStart, aiEffectEnd);

describe('sequential bury-alive replay', () => {
  it.each([
    { actorIdx: 0, mode: 'confirm', cardIndex: 1 },
    { actorIdx: 1, mode: 'allowAi', cardIndex: 1 },
    { actorIdx: 1, mode: 'effect', cardIndex: 0 },
  ])('advances player $actorIdx through $mode with a retained old log event', ({ actorIdx, mode, cardIndex }) => {
    const players = makeStandardPlayers(3);
    players.forEach(player => { player.hand = [makeZoneCard('A1'), makeZoneCard('B1')]; });
    const previousEvent = game.createLogOnlyVisualEvent({ msgs: ['开始活埋选择'] });
    const gs = makeGs({ players, phase: 'BURY_ALIVE_SELECT',
      abilityData: { targets: [actorIdx, 2], targetIndex: 0, buryAliveSelectedIndex: 1 },
      log: previousEvent.msgs, _visualEvents: [previousEvent] });
    const context = {
      ...game, ...animQueueHelpers, isMultiplayerGame, gs,
      consumedVisualEventIdsRef: { current: new Set([previousEvent.id]) },
      isLocalSeatIndex: idx => idx === 0,
      localDisplayName: (_idx, name) => name,
      triggerAnimQueue: (queue, nextGs, _callback, meta) => { context.result = { queue, nextGs, meta }; },
      anim: null, animExiting: false, showTutorial: false, softGuidePauseActive: false,
      animQueueRef: { current: [] }, pendingGsRef: { current: null }, AI_PICK_STEP_DELAY: 0,
      useEffect: callback => callback(), setTimeout: callback => callback(), clearTimeout: () => {},
    };
    runInNewContext(handlers, context);

    if (mode === 'confirm') context.confirmBuryAliveSelection();
    else if (mode === 'effect') runInNewContext(aiEffect, context);
    else context.buryAliveSelectCard(cardIndex, true);

    const { queue, nextGs, meta } = context.result;
    expect(queue.map(step => step.type)).toEqual(['BURY_TO_DECK', 'STATE_PATCH']);
    expect(queue[0].fromPid).toBe(actorIdx);
    expect(nextGs.phase).toBe('BURY_ALIVE_SELECT');
    expect(nextGs.abilityData).toMatchObject({ targetIndex: 1, buryAliveSelectedIndex: null });
    expect(nextGs.players[actorIdx].hand).toEqual([players[actorIdx].hand[1 - cardIndex]]);
    expect(nextGs.deck.at(-1)).toEqual(players[actorIdx].hand[cardIndex]);
    expect(meta.eventIds || []).not.toContain(previousEvent.id);
    expect(gs.players[actorIdx].hand).toHaveLength(2);
  });

  it('excludes prior log-only events while rejecting newly omitted log-only events', () => {
    const previousEvent = game.createLogOnlyVisualEvent({ msgs: ['开始活埋选择'] });
    const nextEvent = game.createLogOnlyVisualEvent({ msgs: ['新的结算效果'] });
    const previous = makeGs({ _visualEvents: [previousEvent] });
    const queue = [animQueueHelpers.buryToDeckStep(), animQueueHelpers.statePatchStep({})];

    expect(game.authoritativeResolvedTransitionQueueMeta(previous, previous, queue, new Set()))
      .toEqual(game.AUTHORITATIVE_QUEUE_META);
    expect(() => game.authoritativeResolvedTransitionQueueMeta(previous,
      { ...previous, _visualEvents: [previousEvent, nextEvent] }, queue, new Set()))
      .toThrow(/resolved action queue.*missing visual events.*logOnly/);
  });
});
