import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import * as game from '../index';
import * as helpers from '../animQueueHelpers';
import * as rotateState from '../rotateState';
import { createTsathogguaSlimeCard } from '../../constants/card';
import { makeBlankZoneCard, makeGodCard, makeGs, makePlayer, makeZoneCard } from './factory';

const source = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
const handlers = ['buildTargetContinuationGs', 'finishTargetContinuation', 'resolveTsathogguaSlimeBalance',
  'applyLossDirectly', 'finishEtherealizeDecision', 'continueOrSettleEtherealizeChain',
  'settleEtherealizeChain', 'resolveEtherealizeRedirect', 'etherealizeSelectTarget'].map(name => {
  const start = source.indexOf(`  function ${name}(`);
  const closing = /\n {2}}\r?\n/.exec(source.slice(start));
  if (start < 0 || !closing) throw new Error(`Missing App handler: ${name}`);
  return source.slice(start, start + closing.index + closing[0].length);
}).join('\n');
const clearHints = source.match(/ {2}const clearTurnDrawReplayHints=[\s\S]*?\}\):state;/)?.[0];

function realSlimeEncounter(count) {
  const god = makeGodCard('NYA', { id: 'chain-unowned-nya' });
  const players = Array.from({ length: count }, (_, i) => makePlayer({ name: `chain-${i}` }));
  players[0] = makePlayer({ name: 'chain-drawer', hp: 2, san: 8, godEncounters: 1,
    hand: [createTsathogguaSlimeCard()] });
  const initial = game.startNextTurn(makeGs({ _isMP: true, players, currentTurn: count - 1,
    deck: [god, makeZoneCard('B1', 0, { id: 'next-safe' })], _visualEvents: [],
    inspectionDeck: [{ name: '自残', effect: 'selfDamageHP', value: 2, type: 'negative' }],
    inspectionDiscard: [],
  }));
  expect(initial.phase).toBe('TSG_SLIME_BALANCE');
  expect(initial.players[0]).toMatchObject({ hp: 2, san: 6, isDead: false });
  expect(initial.abilityData.pendingSanInspection).toBeTruthy();
  return { initial, god };
}

function bind(initial) {
  const submissions = [];
  const consumed = new Set(game.getVisualEvents(initial).map(event => event.id));
  const context = { ...game, ...helpers, ...rotateState, gs: initial,
    consumedVisualEventIdsRef: { current: consumed }, lastInspectionSeqRef: { current: 0 },
    markInspectionEventsSeen: vi.fn(), broadcastAnimTransaction: vi.fn(() => false),
    broadcastEndTurnDecisionAnimTransaction: vi.fn(() => false), broadcastMpStateBeforeLocalReplay: vi.fn(),
    setGs: state => { context.gs = typeof state === 'function' ? state(context.gs) : state; },
    applyNextTurnGs: vi.fn(state => context.setGs(state)),
    triggerAnimQueue: (queue, nextState, callback, transactionMeta) => {
      submissions.push({ ...game.prepareAnimationTransaction({ queue, nextState, callback,
        transactionMeta, consumedEventIds: consumed }), nextState });
    },
  };
  runInNewContext(`${handlers}\n${clearHints}`, context);
  return { context, submissions, complete() {
    const transaction = submissions.at(-1);
    transaction.eventIds.forEach(id => consumed.add(id));
    if (transaction.nextState) context.setGs(transaction.nextState);
    transaction.callback?.();
  } };
}

describe('TOE027 real SAN/slime chain completion', () => {
  it.each([2, 3])('declining slime completes fatal inspection with %i players', count => {
    const { initial, god } = realSlimeEncounter(count);
    const { context, submissions, complete } = bind(initial);
    context.resolveTsathogguaSlimeBalance(false);
    expect(submissions).toHaveLength(1);
    const queue = submissions[0].queue;
    expect(queue.some(step => step.type === 'DRAW_CARD' && step.card?.name === '自残')).toBe(true);
    expect(queue.some(step => step.type === 'DEATH'), JSON.stringify(queue.map(step => ({ type: step.type, terminalBoundary: step.terminalBoundary })))).toBe(true);
    expect(queue.filter(step => step.type === 'DISCARD' && step.card?.id === god.id)).toHaveLength(1);
    complete();
    expect(context.gs.players[0]).toMatchObject({ hp: 0, san: 6, isDead: true });
    expect(context.gs.discard.filter(card => card.id === god.id)).toHaveLength(1);
    expect(context.gs.abilityData.godCard).toBeUndefined();
    expect(context.gs.abilityData.pendingGodChoice).toBeUndefined();
    expect(context.gs._decisionContinuations).toEqual([]);
    if (count === 2) expect(context.gs.gameOver).toMatchObject({ winner: '寻宝者', winnerIdx: 1 });
    else {
      expect(context.applyNextTurnGs).toHaveBeenCalledOnce();
      expect(context.gs.players[context.gs.currentTurn].isDead).toBe(false);
      expect(context.gs.currentTurn).toBe(1);
    }
  });

  it('using slime survives and restores the real unresolved god response', () => {
    const { initial, god } = realSlimeEncounter(3);
    const { context, complete } = bind(initial);
    context.resolveTsathogguaSlimeBalance(true);
    complete();
    expect(context.gs.players[0]).toMatchObject({ hp: 2, san: 4, isDead: false });
    expect(context.gs.phase).toBe('GOD_CHOICE');
    expect(context.gs.abilityData).toMatchObject({ godCard: god, drawerIdx: 0 });
    expect(context.gs.discard.some(card => card.id === god.id)).toBe(false);
    expect(context.applyNextTurnGs).not.toHaveBeenCalled();
  });

  it.each([2, 3])('declining etherealize for a lethal inspection cancels the god with %i players', count => {
    const god = makeGodCard('NYA', { id: 'eth-unowned-nya' });
    const players = Array.from({ length: count }, (_, i) => makePlayer({ name: `eth-${i}` }));
    players[0] = makePlayer({ name: 'eth-drawer', hp: 2, san: 8, godEncounters: 1, etherealizeStacks: 1 });
    const before = makeGs({ _isMP: true, players, currentTurn: 1,
      deck: [god, makeZoneCard('B1')], _visualEvents: [],
      inspectionDeck: [{ name: '自残', effect: 'selfDamageHP', value: 2, type: 'negative' }], inspectionDiscard: [],
    });
    const draw = game.playerDrawCard(players, before.deck, [], 0, before);
    const decision = game.deriveEffectDecisionState(draw.statePatch, { turnOwner: 1 });
    const initial = { ...before, players: draw.P, deck: draw.D, discard: draw.Disc,
      log: draw.effectMsgs, ...draw.statePatch, phase: decision.phase, abilityData: decision.abilityData };
    expect(initial.phase).toBe('ETHEREALIZE_DECISION');
    const { context, submissions, complete } = bind(initial);
    context.resolveEtherealizeRedirect(false);
    complete();
    // The SAN inspection may pause again for its own HP loss; answer through
    // the same real App handler until that bounded reaction chain completes.
    if (context.gs.phase === 'ETHEREALIZE_DECISION') {
      context.resolveEtherealizeRedirect(false);
      complete();
    }
    expect(context.gs.players[0]).toMatchObject({ hp: 0, san: 6, isDead: true });
    expect(context.gs.discard.filter(card => card.id === god.id)).toHaveLength(1);
    expect(context.gs.abilityData.pendingGodChoice).toBeUndefined();
    expect(context.gs._decisionContinuations).toEqual([]);
    expect(submissions.flatMap(transaction=>transaction.queue)
      .filter(step=>step.type==='DISCARD'&&step.card?.id===god.id)).toHaveLength(1);
    if (count === 2) expect(context.gs.gameOver).toMatchObject({ winner: '寻宝者', winnerIdx: 1 });
    else expect(context.gs.currentTurn).toBe(1);
  });

  it('redirecting the inspection HP loss leaves the living drawer god response actionable', () => {
    const god = makeGodCard('NYA', { id: 'redirect-unowned-nya' });
    const players = [makePlayer({ hp: 2, san: 8, godEncounters: 1, etherealizeStacks: 1 }),
      makePlayer(), makePlayer()];
    const before = makeGs({ _isMP: true, players, currentTurn: 1, deck: [god], _visualEvents: [],
      inspectionDeck: [{ name: '自残', effect: 'selfDamageHP', value: 2, type: 'negative' }], inspectionDiscard: [] });
    const draw = game.playerDrawCard(players, before.deck, [], 0, before);
    const decision = game.deriveEffectDecisionState(draw.statePatch, { turnOwner: 1 });
    const initial = { ...before, players: draw.P, deck: draw.D, discard: draw.Disc,
      log: draw.effectMsgs, ...draw.statePatch, phase: decision.phase, abilityData: decision.abilityData };
    const { context, complete } = bind(initial);
    context.resolveEtherealizeRedirect(false);
    complete();
    expect(context.gs.phase).toBe('ETHEREALIZE_DECISION');
    expect(context.gs.abilityData).toMatchObject({ lostHp: 2, targetIdx: 0 });
    context.resolveEtherealizeRedirect(true);
    expect(context.gs.phase).toBe('ETHEREALIZE_SELECT_TARGET');
    context.etherealizeSelectTarget(2);
    complete();
    expect(context.gs.players[0]).toMatchObject({ hp: 2, san: 6, isDead: false, etherealizeStacks: 0 });
    expect(context.gs.players[2].hp).toBe(8);
    expect(context.gs.phase).toBe('GOD_CHOICE');
    expect(context.gs.abilityData).toMatchObject({ godCard: god, drawerIdx: 0 });
    expect(context.gs.discard.some(card=>card.id===god.id)).toBe(false);
  });

  it.each([false, true])('settles a living partner rope reaction after the AI god drawer dies (redirect=%s)', redirect => {
    const god = makeGodCard('VRI', { id: 'ai-rope-unowned-vri' });
    const priorFaith = makeGodCard('CTH', { id: 'partner-existing-cth' });
    const players = [
      makePlayer({ name: 'living-partner', hp: 2, etherealizeStacks: 1,
        godName: 'CTH', godLevel: 1, godZone: [priorFaith], hasBelievedGod: true }),
      makePlayer({ name: 'fatal-ai', role: '追猎者', hp: 2, san: 8, godEncounters: 1 }),
      makePlayer({ name: 'next-survivor', role: '寻宝者' }),
    ];
    game.addDamageLink(players, 1, 0, { expiryOwner: 2 });
    const initial = game.startNextTurn(makeGs({ players, currentTurn: 0, turn: 12,
      deck: [god, makeBlankZoneCard({ id: 'safe-next-card' })], _visualEvents: [],
      inspectionDeck: [{ name: '自残', effect: 'selfDamageHP', value: 2, type: 'negative' }],
      inspectionDiscard: [],
    }));
    expect(initial.phase).toBe('AI_GOD_CHOICE');
    const transition = game.resolveAiGodChoiceTransition(initial);
    const reaction = transition.state;
    expect(reaction.players[1]).toMatchObject({ hp: 0, san: 6, isDead: true, godZone: [] });
    expect(reaction.phase).toBe('ETHEREALIZE_DECISION');
    expect(reaction.abilityData).toMatchObject({ type: 'etherealizeRedirect', targetIdx: 0,
      lostHp: 3, source: '两人一绳', _turnOwner: 1 });
    expect(reaction.players[0]).toMatchObject({ hp: 2, etherealizeStacks: 1, isDead: false });
    expect(reaction.gameOver).toBeNull();
    expect(reaction.abilityData.godCard).toBeUndefined();
    expect(reaction.discard.filter(card => card.id === god.id)).toHaveLength(1);
    expect(reaction.log.some(line => line.includes('放弃了邪神的馈赠'))).toBe(false);
    const fatalReplay = game.compileFreshVisualEventReplay(initial, reaction);
    const consumed = new Set(game.getVisualEvents(initial).map(event => event.id));
    const fatalTransaction = game.prepareAnimationTransaction({ queue: fatalReplay.queue,
      previousState: initial, nextState: reaction, consumedEventIds: consumed,
      transactionMeta: game.strictActionQueueMeta(reaction, fatalReplay.queue, consumed, 'AI god choice') });
    expect(fatalTransaction.queue.filter(step => step.type === 'DEATH')).toHaveLength(1);
    const { context, submissions, complete } = bind(reaction);
    context.resolveEtherealizeRedirect(redirect);
    if (redirect) {
      expect(context.gs.phase).toBe('ETHEREALIZE_SELECT_TARGET');
      context.etherealizeSelectTarget(2);
    }
    complete();
    expect(context.gs.players[1]).toMatchObject({ hp: 0, isDead: true, godName: null, godZone: [] });
    expect(context.gs.discard.filter(card => card.id === god.id)).toHaveLength(1);
    expect(context.gs.abilityData.pendingGodChoice).toBeUndefined();
    const allSteps = [...fatalTransaction.queue, ...submissions.flatMap(transaction => transaction.queue)];
    expect(allSteps.filter(step => step.type === 'DISCARD' && step.card?.id === god.id)).toHaveLength(1);
    if (redirect) {
      expect(context.gs.players[0]).toMatchObject({ hp: 2, isDead: false, etherealizeStacks: 0,
        godName: 'CTH', godZone: [priorFaith], hasBelievedGod: true });
      expect(context.gs.players[2].hp).toBe(7);
      expect(context.gs.currentTurn).toBe(2);
      expect(context.gs.gameOver).toBeNull();
    } else {
      expect(context.gs.players[0]).toMatchObject({ hp: 0, isDead: true, etherealizeStacks: 1 });
      expect(context.gs.gameOver).toMatchObject({ winner: '寻宝者', winnerIdx: 2 });
      expect(context.applyNextTurnGs).not.toHaveBeenCalled();
    }
  });
});
