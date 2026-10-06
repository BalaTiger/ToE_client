import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import * as game from '../index';
import * as helpers from '../animQueueHelpers';
import * as rotateState from '../rotateState';
import * as zoneCardIncome from '../zoneCardIncome';
import { getRevealDecision } from '../../components/anim/revealDecision';
import { createTsathogguaSlimeCard, GOD_DEFS } from '../../constants/card';
import { makeGodCard, makeGs, makeStandardPlayers } from './factory';

const source = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
const handlers = ['buildTargetContinuationGs', 'finishTargetContinuation',
  'resolveTsathogguaSlimeBalance', 'godResolvePlayer'].map(name => {
  const start = source.indexOf(`  function ${name}(`);
  const closing = /\n {2}}\r?\n/.exec(source.slice(start));
  if (start < 0 || !closing) throw new Error(`Missing App handler: ${name}`);
  return source.slice(start, start + closing.index + closing[0].length);
}).join('\n');
const clearDrawHints = source.match(/ {2}const clearTurnDrawReplayHints=[\s\S]*?\}\):state;/)?.[0];
if (!clearDrawHints) throw new Error('Missing App clearTurnDrawReplayHints');

function makeGodEncounter() {
  const godCard = makeGodCard('NYA', { id: 'pending-nya' });
  const players = makeStandardPlayers(3, [
    { name: '你', role: '寻宝者', hp: 8, san: 6, godEncounters: 1,
      hand: [createTsathogguaSlimeCard()] },
    { role: '追猎者' },
    { role: '邪祀者' },
  ]);
  const before = makeGs({ players, currentTurn: 0, deck: [godCard],
    inspectionDeck: [{ name: '封印松动', effect: 'sealLoosening', value: 1, type: 'negative' }],
    inspectionDiscard: [], _visualEvents: [], _isMP: false,
    log: ['你 的回合开始'],
  });
  // Use the real draw/encounter producer: it emits both the slime decision and
  // the pending root GOD_CHOICE frame, rather than manufacturing a god payload.
  const draw = game.playerDrawCard(players, before.deck, [], 0, before);
  const decision = game.deriveEffectDecisionState(draw.statePatch, {
    fallbackPhase: 'GOD_CHOICE', turnOwner: 0,
  });
  const initial = { ...before, players: draw.P, deck: draw.D, discard: draw.Disc,
    log: [...before.log, ...draw.effectMsgs], ...draw.statePatch,
    phase: decision.phase, abilityData: decision.abilityData,
  };
  return { initial, godCard };
}

function bindHandlers(initial) {
  const submissions = [];
  const consumed = new Set(game.getVisualEvents(initial).map(event => event.id));
  const context = {
    ...game, ...helpers, ...rotateState, ...zoneCardIncome, GOD_DEFS,
    gs: initial, me: initial.players[0], showTutorial: false, tutorialStepDef: null,
    consumedVisualEventIdsRef: { current: consumed }, lastInspectionSeqRef: { current: 0 },
    markInspectionEventsSeen: vi.fn(),
    broadcastAnimTransaction: vi.fn(() => false),
    broadcastEndTurnDecisionAnimTransaction: vi.fn(() => false),
    broadcastMpStateBeforeLocalReplay: vi.fn(),
    setGs: state => {
      context.gs = typeof state === 'function' ? state(context.gs) : state;
      context.me = context.gs.players[0];
    },
    triggerAnimQueue: (queue, nextState, callback, transactionMeta) => {
      const transaction = game.prepareAnimationTransaction({ queue, nextState,
        callback, transactionMeta, consumedEventIds: consumed });
      submissions.push({ ...transaction, nextState });
    },
  };
  context.resumeEndTurnSeqOrSetGs = state => context.setGs(state);
  runInNewContext(`${handlers}\n${clearDrawHints}`, context);
  const complete = () => {
    const submission = submissions.at(-1);
    submission.eventIds.forEach(id => consumed.add(id));
    if (submission.nextState) context.setGs(submission.nextState);
    submission.callback?.();
  };
  return { context, submissions, complete };
}

describe('TOE020 local god choice survives a slime/SAN continuation', () => {
  it.each([
    { useSlime: true, action: 'discard' },
    { useSlime: true, action: 'worship' },
    { useSlime: false, action: 'discard' },
    { useSlime: false, action: 'worship' },
  ])('keeps the NYA decision actionable for $action (useSlime=$useSlime)', ({ useSlime, action }) => {
    const { initial, godCard } = makeGodEncounter();
    expect(initial.phase).toBe('TSG_SLIME_BALANCE');
    expect(initial.players[0]).toMatchObject({ hp: 8, san: 4 });
    expect(initial._decisionContinuations).toEqual([
      expect.objectContaining({ phase: 'GOD_CHOICE',
        abilityData: expect.objectContaining({ godCard, drawerIdx: 0, godEncounterCost: 0 }) }),
    ]);
    // The pure continuation already restores the complete root decision.
    // Its payload must survive the enclosing App resolver's final state spread.
    const pureContinuation = game.buildTargetContinuationState({ baseState: initial });
    expect(getRevealDecision(pureContinuation)).toMatchObject({
      kind: 'god-choice', card: godCard, actorIdx: 0,
    });
    const { context, submissions, complete } = bindHandlers(initial);
    expect(() => context.resolveTsathogguaSlimeBalance(useSlime)).not.toThrow();
    expect(submissions).toHaveLength(1);
    complete();
    expect(context.gs.phase).toBe('GOD_CHOICE');
    expect(context.gs._decisionContinuations).toEqual([]);
    // Before the fix the phase is GOD_CHOICE but this is null: App replaced
    // the restored godCard/drawerIdx with the continuation-only whitelist.
    expect(getRevealDecision(context.gs)).toMatchObject({
      kind: 'god-choice', card: godCard, actorIdx: 0,
    });
    expect(context.gs.abilityData).toMatchObject({ godCard, drawerIdx: 0, godEncounterCost: 0 });
    expect(context.gs.players[0]).toMatchObject(useSlime ? { hp: 6, san: 6 } : { hp: 8, san: 4 });
    expect(context.gs.sealLooseningCount).toBe(1);
    expect(context.gs.players[0].hand.some(game.isTsathogguaSlime)).toBe(!useSlime);
    const sanAfterEncounter = context.gs.players[0].san;
    context.godResolvePlayer(action);
    expect(submissions).toHaveLength(2);
    complete();
    expect(context.gs.phase).toBe('ACTION');
    expect(getRevealDecision(context.gs)).toBeNull();
    expect(context.gs.abilityData.godCard).toBeUndefined();
    expect(context.gs.players[0].san).toBe(sanAfterEncounter);
    if (action === 'discard') {
      expect(context.gs.discard.filter(card => card.id === godCard.id)).toHaveLength(1);
      expect(context.gs.players[0].godName).toBeNull();
    } else {
      expect(context.gs.players[0]).toMatchObject({ godName: 'NYA', godLevel: 1 });
      expect(context.gs.players[0].godZone.filter(card => card.id === godCard.id)).toHaveLength(1);
      expect(context.gs.discard.some(card => card.id === godCard.id)).toBe(false);
    }
  });
});
