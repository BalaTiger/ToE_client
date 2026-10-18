import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as game from '../index';
import * as helpers from '../animQueueHelpers';
import * as rotateState from '../rotateState';
import * as zoneCardIncome from '../zoneCardIncome';
import { createTsathogguaSlimeCard } from '../../constants/card';
import { makeGs, makeStandardPlayers, makeZoneCard } from './factory';

const source = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
const handlers = ['buildTargetContinuationGs', 'finishTargetContinuation',
  'resolveTsathogguaSlimeBalance'].map(name => {
  const start = source.indexOf(`  function ${name}(`);
  const closing = /\n {2}}\r?\n/.exec(source.slice(start));
  if (start < 0 || !closing) throw new Error(`Missing App handler: ${name}`);
  return source.slice(start, start + closing.index + closing[0].length);
}).join('\n');

const inspections = [
  { name: '乏力', effect: 'handLimitDecrease', value: 1, type: 'negative' },
  { name: '乱抓', effect: 'adjacentDamageHP', value: 2, type: 'negative' },
  { name: '揭开真相', effect: 'drawCard', value: 1, type: 'positive' },
];

afterEach(() => vi.restoreAllMocks());

function makeDeferredSanChain(inspection) {
  // The browser case: the acting hunter's inspection finishes first, while
  // another seat's slime response suspends that seat's remaining inspection.
  const players = makeStandardPlayers(5, [
    { name: '你', role: '寻宝者', hp: 5, san: 8 },
    { name: '艾伦', role: '寻宝者', hp: 8, san: 7, hand: [createTsathogguaSlimeCard()] },
    { name: '贝拉', role: '追猎者', hp: 8, san: 6 },
    { name: '卡洛斯', role: '追猎者', hp: 6, san: 9 },
    { name: '黛安娜', role: '邪祀者', hp: 8, san: 9 },
  ]);
  const mouse = makeZoneCard('D3', 0, {
    id: 'pending-mouse', name: '鼠群', type: 'allDamageSAN', val: 1,
  });
  const gainedCard = makeZoneCard('B2', 0, { id: 'inspection-income' });
  const before = makeGs({ players, currentTurn: 2, phase: 'AI_TURN',
    deck: [gainedCard], _isMP: false, _visualEvents: [], _inspectionSeq: 0,
    inspectionDeck: [inspections[0], inspection], inspectionDiscard: [],
    log: ['贝拉 摸到 [D3] 鼠群，选择保留，先结算效果'],
  });
  // Keep the second inspection next after the first card is returned/shuffled.
  vi.spyOn(Math, 'random').mockReturnValue(0.999);
  const effect = game.applyFx(mouse, 2, null, players, before.deck, [], before);
  const statePatch = zoneCardIncome.applyZoneCardIncome({
    players: effect.P, discard: effect.Disc, card: mouse, drawerIdx: 2,
    statePatch: effect.statePatch,
  });
  const decision = game.deriveEffectDecisionState(statePatch, {
    fallbackPhase: 'AI_TURN', turnOwner: 2,
  });
  const initial = { ...before, players: effect.P, deck: effect.D,
    discard: effect.Disc, log: [...before.log, ...effect.msgs],
    ...statePatch, phase: decision.phase, abilityData: decision.abilityData,
  };
  return { initial, mouse, gainedCard };
}

function bindHandlers(initial) {
  const submissions = [];
  // Events leading into the decision have already completed their playback.
  const consumed = new Set(game.getVisualEvents(initial).map(event => event.id));
  const context = {
    ...game, ...helpers, ...rotateState, ...zoneCardIncome,
    gs: initial, consumedVisualEventIdsRef: { current: consumed },
    lastInspectionSeqRef: { current: initial._inspectionSeq },
    markInspectionEventsSeen: vi.fn(),
    broadcastAnimTransaction: vi.fn(() => false),
    broadcastEndTurnDecisionAnimTransaction: vi.fn(() => false),
    broadcastMpStateBeforeLocalReplay: vi.fn(),
    setGs: state => { context.gs = typeof state === 'function' ? state(context.gs) : state; },
    triggerAnimQueue: (queue, nextState, callback, transactionMeta) => {
      const transaction = game.prepareAnimationTransaction({ queue, nextState,
        callback, transactionMeta, consumedEventIds: consumed });
      submissions.push({ ...transaction, nextState });
    },
  };
  runInNewContext(handlers, context);
  const complete = () => {
    const submission = submissions.at(-1);
    submission.eventIds.forEach(id => consumed.add(id));
    if (submission.nextState) context.gs = submission.nextState;
    submission.callback?.();
  };
  return { context, submissions, consumed, complete };
}

describe('TOE017 deferred SAN inspection after an AI slime response', () => {
  it.each(inspections)('finishes $name before one pending card income and AI continuation', inspection => {
    const { initial, mouse, gainedCard } = makeDeferredSanChain(inspection);
    expect(initial.phase).toBe('TSG_SLIME_BALANCE');
    expect(initial.players.map(player => player.san)).toEqual([7, 6, 5, 8, 8]);
    expect(initial.abilityData).toMatchObject({
      type: 'tsgSlimeBalance', targetIdx: 1, _turnOwner: 2,
      pendingInspectionContinuation: { targets: [1], startIndex: 2 },
      pendingZoneIncome: { card: mouse, ownerId: initial.players[2].id },
    });
    const { context, submissions, consumed, complete } = bindHandlers(initial);
    // Before the fix this throws the observed target-continuation error:
    // the raw inspection flow has an unowned VISUAL_LOCK (and truth draw).
    expect(() => context.resolveTsathogguaSlimeBalance(false)).not.toThrow();
    expect(submissions).toHaveLength(1);
    const submission = submissions[0];
    const event = game.getVisualEvents(submission.nextState)
      .find(candidate => candidate.type === 'inspection' && candidate.target === 1);
    expect(event.card.name).toBe(inspection.name);
    expect(submission.eventIds).toContain(event.id);
    expect(consumed.has(event.id)).toBe(false);
    expect(context.gs).toBe(initial);
    const revealIndex = submission.queue.findIndex(step => step.visualEventId === event.id && step.type === 'DRAW_CARD');
    const incomeIndex = submission.queue.findIndex(step => step.type === 'CARD_TRANSFER' && step.cards?.some(card => card.id === mouse.id));
    expect(revealIndex).toBeGreaterThanOrEqual(0);
    expect(incomeIndex).toBeGreaterThan(revealIndex);
    expect(submission.queue.filter(step => step.type === 'CARD_TRANSFER' && step.cards?.some(card => card.id === mouse.id))).toHaveLength(1);
    complete();
    expect(consumed.has(event.id)).toBe(true);
    expect(context.gs.phase).toBe('AI_TURN');
    expect(context.gs.currentTurn).toBe(2);
    expect(context.gs.abilityData.pendingInspectionContinuation).toBeUndefined();
    expect(context.gs.abilityData.pendingZoneIncome).toBeUndefined();
    expect(context.gs.players[2].hand.filter(card => card.id === mouse.id)).toHaveLength(1);
    expect(context.gs.players[1].hand.some(game.isTsathogguaSlime)).toBe(true);
    if (inspection.effect === 'adjacentDamageHP') {
      expect(context.gs.players.map(player => player.hp)).toEqual([3, 8, 6, 6, 8]);
    } else if (inspection.effect === 'handLimitDecrease') {
      expect(context.gs.players[1].handLimitDecreaseNextTurn).toBe(1);
    } else {
      expect(context.gs.players[1].hand.filter(card => card.id === gainedCard.id)).toHaveLength(1);
    }
  });

  it.each(inspections)('accepts canonical $name coverage, but still rejects a missing inspection lock', inspection => {
    const players = makeStandardPlayers(3, [{ hp: 8 }, { san: 6 }, { hp: 8 }]);
    const before = makeGs({ players, deck: [makeZoneCard('B2')],
      inspectionDeck: [inspection], inspectionDiscard: [], _visualEvents: [] });
    const result = game.processInspectionTargets([1], 1, game.copyPlayers(players),
      [...before.deck], [], [], game.makeInspectionMeta(before));
    const after = { ...before, ...result.inspectionMeta, players: result.P,
      deck: result.D, discard: result.Disc, log: result.log };
    const queue = game.compileFreshVisualEventQueue(before, after);
    const event = game.getVisualEvents(after).find(candidate => candidate.type === 'inspection');
    expect(game.strictActionQueueMeta(after, queue, new Set(), 'inspection control',
      { previousState: before }).eventIds).toContain(event.id);
    const incomplete = queue.filter(step => !(step.type === 'VISUAL_LOCK' && step.visualEventId === event.id));
    expect(() => game.strictActionQueueMeta(after, incomplete, new Set(), 'inspection control',
      { previousState: before })).toThrow(/missing visual events.*inspection/);
  });
});

describe('multiplayer deferred bewitch income identity',()=>{
  it('names the off-turn recipient in state and transfer logs after slime response',()=>{
    const players=makeStandardPlayers(3,[{name:'recipient',role:'追猎者',hp:10,san:9,hand:[createTsathogguaSlimeCard()]},{name:'caster',role:'邪祀者'},{name:'observer',role:'寻宝者'}]);
    const card=makeZoneCard('A4',0,{id:'deferred-a4',name:'空谷传音'});
    const initial=makeGs({players,currentTurn:1,phase:'TSG_SLIME_BALANCE',_isMP:true,_visualEvents:[],
      abilityData:{type:'tsgSlimeBalance',targetIdx:0,_turnOwner:1,pendingZoneIncome:{card,ownerId:players[0].id}}});
    const {context,submissions}=bindHandlers(initial);
    context.resolveTsathogguaSlimeBalance(true);
    const result=submissions.at(-1);
    expect(result.nextState.players[0].hand.some(c=>c.id===card.id)).toBe(true);
    expect(result.nextState.players[1].hand.some(c=>c.id===card.id)).toBe(false);
    expect(result.nextState.log.some(line=>line.startsWith('recipient 收入了'))).toBe(true);
    expect(result.nextState.log.some(line=>line.startsWith('你 收入了')||line.startsWith('caster 收入了'))).toBe(false);
    expect(result.queue.flatMap(step=>step.msgs||[]).some(line=>line.startsWith('recipient 收入了'))).toBe(true);
  });
});
describe('death inside a deferred skill/slime continuation',()=>{
 it('discards a dead drawer income and cancels remaining extra draws before advancing',()=>{
  const players=makeStandardPlayers(3,[{role:'寻宝者',isDead:true,hp:0,hand:[]},{role:'追猎者',hand:[createTsathogguaSlimeCard()]},{role:'邪祀者'}]);
  const card=makeZoneCard('A4',0,{id:'dead-drawer-income',name:'空谷传音'});
  const initial=makeGs({players,currentTurn:0,_isMP:true,phase:'TSG_SLIME_BALANCE',_visualEvents:[],deck:[makeZoneCard('C2')],
   abilityData:{type:'tsgSlimeBalance',targetIdx:1,_turnOwner:0,continueTurnStartDraw:true,fromTsathogguaSlime:true,pendingZoneIncome:{card,ownerId:players[0].id}}});
  const {context,submissions,complete}=bindHandlers(initial);
  context._tsgContinueTurnStartDraw=vi.fn();context.applyNextTurnGs=vi.fn(state=>{context.gs=state;});
  context.resolveTsathogguaSlimeBalance(false);
  const packet=context.broadcastAnimTransaction.mock.calls.at(-1)[0];
  expect(packet.players.every(p=>!p.hand.some(c=>c.id===card.id))).toBe(true);
  expect(packet.discard.filter(c=>c.id===card.id)).toHaveLength(1);
  expect(submissions.at(-1).queue.some(step=>step.type==='CARD_TRANSFER'&&step.dest==='discard')).toBe(true);
  complete();expect(context._tsgContinueTurnStartDraw).not.toHaveBeenCalled();
  expect(context.applyNextTurnGs).toHaveBeenCalledOnce();expect(context.gs.currentTurn).toBe(1);
 });
 it('a dead response target cannot consume another seat slime or redirect its income',()=>{
  const players=makeStandardPlayers(3,[{role:'寻宝者',hand:[]},{role:'追猎者',isDead:true,hp:0,hand:[]},{role:'邪祀者',hand:[createTsathogguaSlimeCard()]}]);
  const card=makeZoneCard('A4',0,{id:'live-income',name:'空谷传音'});
  const initial=makeGs({players,currentTurn:0,_isMP:true,phase:'TSG_SLIME_BALANCE',_visualEvents:[],abilityData:{type:'tsgSlimeBalance',targetIdx:1,_turnOwner:0,pendingZoneIncome:{card,ownerId:players[0].id}}});
  const {context,submissions}=bindHandlers(initial);context.resolveTsathogguaSlimeBalance(true);
  const final=submissions.at(-1).nextState;expect(final.players[0].hand.filter(c=>c.id===card.id)).toHaveLength(1);
  expect(final.players[2].hand.some(game.isTsathogguaSlime)).toBe(true);expect(final.players[1].hand).toHaveLength(0);
 });
});