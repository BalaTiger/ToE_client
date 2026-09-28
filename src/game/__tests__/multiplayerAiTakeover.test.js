import { describe, expect, it, vi } from 'vitest';
import {
  isMpAiTakeoverRelevant,
  resolveMpAiTakeoverState,
  withTimeoutDrawDiscardVisual,
} from '../multiplayerAiTakeover';
import { makeBlankZoneCard, makeGodCard, makeGs, makePlayer, makeZoneCard } from './factory';
import { ROLE_CULTIST, ROLE_HUNTER, ROLE_TREASURE } from '../coreUtils';
import { addDamageLink } from '../damageLinks';
import { resolveHeadlessEtherealize } from '../headlessSimulator';
import { applyFx } from '../effectEngine';
import { applyZoneCardIncome } from '../zoneCardIncome';
import { deriveEffectDecisionState } from '../effectStatePatch';

const dependencies = {
  getHandLimitForPlayer: () => 4,
  resolveCaveDuelState: vi.fn(),
};

describe('multiplayer AI takeover decisions', () => {
  it('finishes the last bury choice before receiving the pending card', () => {
    const card = makeZoneCard('A4', 0, { type: 'buryAlive', id: 'pending-bury' });
    const buried = makeZoneCard('B1', 0);
    const player = makePlayer({ hand: [buried] });
    const state = makeGs({ _isMP: true, currentTurn: 1, phase: 'BURY_ALIVE_SELECT', players: [player, makePlayer()],
      abilityData: { type: 'buryAliveSelect', source: 0, targets: [0], targetIndex: 0, _turnOwner: 1,
        pendingZoneIncome: { card, ownerId: player.id } } });
    const next = resolveMpAiTakeoverState(state, 0, dependencies);
    expect(next.phase).toBe('ACTION');
    expect(next.players[0].hand).toEqual([card]);
    expect(next.deck).toEqual([buried]);
    expect(next.abilityData.pendingZoneIncome).toBeUndefined();
    expect(next._visualEvents.map(event => event.effect)).toEqual(['buryAlive', 'zoneIncome']);
    expect(state.players[0].hand).toEqual([buried]);
  });

  it('fills only the disconnected bury choice and retains income while another player is choosing', () => {
    const card = makeZoneCard('A4', 0, { type: 'buryAlive' });
    const players = [makePlayer({ hand: [makeZoneCard('B1')] }), makePlayer({ hand: [makeZoneCard('C1')] })];
    const state = makeGs({ _isMP: true, currentTurn: 1, phase: 'BURY_ALIVE_SELECT', players,
      abilityData: { type: 'buryAliveSelect', source: 0, targets: [0, 1], targetIndex: 0, _turnOwner: 1,
        buryAliveChoices: [null, null], pendingZoneIncome: { card, ownerId: players[0].id } } });
    expect(isMpAiTakeoverRelevant(state, 1)).toBe(true);
    const waiting = resolveMpAiTakeoverState(state, 1, dependencies);
    expect(waiting.phase).toBe('BURY_ALIVE_SELECT');
    expect(waiting.players.map(player => player.hand)).toEqual(players.map(player => player.hand));
    expect(waiting.abilityData.buryAliveChoices).toEqual([null, { cardId: players[1].hand[0].id, cardIndex: 0 }]);
    expect(waiting.abilityData.pendingZoneIncome.card).toEqual(card);
    const next = resolveMpAiTakeoverState(waiting, 0, dependencies);
    expect(next.players[0].hand).toEqual([card]);
    expect(next.players[1].hand).toEqual([]);
    expect(next.deck).toEqual([players[0].hand[0], players[1].hand[0]]);
  });

  it('resolves a torch cost before income and retains unknown future decisions', () => {
    const card = makeZoneCard('C3', 0, { type: 'igniteTorch', id: 'pending-torch' });
    const discarded = makeZoneCard('A2', 0);
    const player = makePlayer({ hand: [discarded] });
    const state = makeGs({ _isMP: true, currentTurn: 1, phase: 'IGNITE_TORCH_DISCARD', players: [player, makePlayer()],
      abilityData: { type: 'igniteTorchDiscard', playerIndex: 0, _turnOwner: 1,
        pendingZoneIncome: { card, ownerId: player.id } } });
    const next = resolveMpAiTakeoverState(state, 0, dependencies);
    expect(next.players[0].hand).toEqual([card]);
    expect(next.players[0].godPowerImmuneThisTurn).toBe(true);
    expect(next.discard).toEqual([discarded]);
    expect(next.abilityData.pendingZoneIncome).toBeUndefined();
    const unsupported = { ...state, phase: 'DRAW_SELECT_TARGET',
      abilityData: { ...state.abilityData, type: 'futureEffectChoice', drawerIdx: 0 } };
    expect(resolveMpAiTakeoverState(unsupported, 0, dependencies)).toBe(unsupported);
  });

  it('advances a disconnected turn only after the source income completes', () => {
    const card = makeZoneCard('A4', 0, { type: 'buryAlive', id: 'takeover-income' });
    const buried = makeZoneCard('B1');
    const player = makePlayer({ hand: [buried] });
    const next = resolveMpAiTakeoverState(makeGs({ _isMP: true, phase: 'BURY_ALIVE_SELECT',
      players: [player, makePlayer()], abilityData: { type: 'buryAliveSelect', source: 0,
        targets: [0], targetIndex: 0, pendingZoneIncome: { card, ownerId: player.id } } }), 0, dependencies);
    expect(next.currentTurn).toBe(1);
    expect(next.players[0].hand).toEqual([card]);
    expect(next.abilityData.pendingZoneIncome).toBeUndefined();
  });

  it.each([
    ['SPHINX_GUESS', 'sphinxGuess', { deck: [makeBlankZoneCard()] }],
    ['GRAVE_DIG_SELECT', 'graveDigGod', { discard: [makeGodCard('NYA')] }],
    ['ALBINO_CREATURE_SELECT_CARD', 'albinoCreature', {}],
  ])('completes %s without dropping its pending source card', (phase, type, piles) => {
    const card = makeZoneCard('D4', 0, { type, id: `takeover-${type}` });
    const fireCard = makeZoneCard('C3', 0, { name: '引燃火把' });
    const player = makePlayer({ role: ROLE_HUNTER, hand: [fireCard] });
    const state = makeGs({ _isMP: true, currentTurn: 1, phase, players: [player, makePlayer()], ...piles,
      abilityData: { type, playerIndex: 0, _turnOwner: 1, fireCardIds: [fireCard.id],
        pendingZoneIncome: { card, ownerId: player.id } } });
    const next = resolveMpAiTakeoverState(state, 0, dependencies);
    expect(next.phase).toBe('ACTION');
    expect(next.players[0].hand).toContainEqual(card);
    expect(next.abilityData.pendingZoneIncome).toBeUndefined();
  });

  it('finishes damage redirection before income and preserves the original human turn', () => {
    const card = makeZoneCard('A1', 0, { type: 'selfDamageHP', val: 2, id: 'reaction-income' });
    const player = makePlayer({ role: ROLE_HUNTER, etherealizeStacks: 1 });
    const state = makeGs({ _isMP: true, currentTurn: 1, players: [player, makePlayer()] });
    const result = applyFx(card, 0, null, state.players, [], [], state);
    const patch = applyZoneCardIncome({ players: result.P, discard: result.Disc, card,
      drawerIdx: 0, statePatch: result.statePatch });
    const decision = deriveEffectDecisionState(patch, { turnOwner: 1 });
    const paused = { ...state, ...patch, ...decision, players: result.P, deck: result.D, discard: result.Disc };
    expect(paused.phase).toBe('ETHEREALIZE_DECISION');
    expect(paused.players[0].hand).toEqual([]);
    const next = resolveMpAiTakeoverState(paused, 0, dependencies);
    expect(next.currentTurn).toBe(1);
    expect(next.phase).toBe('ACTION');
    expect(next.players[0].hand).toEqual([card]);
    expect(next.players.reduce((total, actor) => total + actor.hp, 0)).toBe(18);
    expect(next._visualEvents.flatMap(event => event.statEvents || []).some(event => event.type === 'HP_LOSS')).toBe(true);
    expect(next.abilityData.pendingZoneIncome).toBeUndefined();
  });

  it('keeps the source outside a full-hand swap and receives it only after the swap', () => {
    const card = makeZoneCard('D1', 0, { type: 'swapAllHands' });
    const first = makeZoneCard('A1');
    const second = makeZoneCard('B2');
    const player = makePlayer({ hand: [first] });
    const state = makeGs({ _isMP: true, currentTurn: 1, phase: 'ZONE_SWAP_SELECT_TARGET',
      players: [player, makePlayer({ hand: [second] })],
      abilityData: { zoneSwapSource: 0, zoneSwapCard: card, _turnOwner: 1,
        pendingZoneIncome: { card, ownerId: player.id } } });
    const next = resolveMpAiTakeoverState(state, 0, dependencies);
    expect(next.players[0].hand).toEqual([second, card]);
    expect(next.players[1].hand).toEqual([first]);
    expect(next.currentTurn).toBe(1);
    expect(next.abilityData.pendingZoneIncome).toBeUndefined();
  });

  it('takes over only the disconnected cave-duel side and preserves the opposing decision', () => {
    const card = makeZoneCard('D3', 0, { type: 'caveDuel' });
    const held = makeZoneCard('A1');
    const player = makePlayer({ hand: [held] });
    const state = makeGs({ _isMP: true, currentTurn: 1, phase: 'CAVE_DUEL_SELECT_TARGET',
      players: [player, makePlayer({ hand: [makeZoneCard('B2')] })],
      abilityData: { caveDuelSource: 0, caveDuelTargets: [1], _turnOwner: 1,
        pendingZoneIncome: { card, ownerId: player.id } } });
    const next = resolveMpAiTakeoverState(state, 0, dependencies);
    expect(next.phase).toBe('CAVE_DUEL_SELECT_CARD');
    expect(next.players[0].hand).toEqual([held]);
    expect(next.abilityData.sourceCard).toEqual(held);
    expect(next.abilityData.targetCard).toBeUndefined();
    expect(next.abilityData.pendingZoneIncome.card).toEqual(card);
  });

  it('keeps a life balance at 3 HP when a safe hand-limit discard is available', () => {
    const balance = makeZoneCard('B1', 2);
    const state = makeGs({
      _isMP: true, phase: 'DISCARD_PHASE', currentTurn: 0,
      players: [
        makePlayer({ role: ROLE_TREASURE, roleRevealed: true, hp: 3,
          hand: [balance, makeZoneCard('A1'), makeZoneCard('B2'), makeZoneCard('B2'), makeZoneCard('C3')] }),
        makePlayer({ role: ROLE_HUNTER, roleRevealed: true }),
      ],
      deck: [makeBlankZoneCard()],
    });
    const result = resolveMpAiTakeoverState(state, 0, dependencies);
    expect(result.players[0].hand).toContainEqual(balance);
    expect(result.players[0].hand).toHaveLength(4);
    expect(result.players[0]).toMatchObject({ hp: 3, isDead: false });
    expect(result.currentTurn).toBe(1);
    expect(result._aiFinishingTurn).toBeUndefined();
    expect(result._aiPendingHandLimitThorns).toBeUndefined();
  });

  it('waits for a forced discard reaction and settles deferred thorns before the next turn', () => {
    const state = makeGs({
      _isMP: true, phase: 'DISCARD_PHASE', currentTurn: 0,
      players: [
        makePlayer({ role: ROLE_HUNTER, roleRevealed: true,
          hand: Array.from({ length: 5 }, () => makeZoneCard('B1', 2, { roseThornHolderId: 2, roseThornSourceId: 0 })) }),
        makePlayer({ role: ROLE_TREASURE, roleRevealed: true, etherealizeStacks: 1, hand: [makeZoneCard('D1')] }),
        makePlayer({ role: ROLE_CULTIST, roleRevealed: true }),
      ],
      deck: [makeBlankZoneCard()],
    });
    addDamageLink(state.players, 0, 1);
    const paused = resolveMpAiTakeoverState(state, 0, dependencies);
    expect(paused.phase).toBe('ETHEREALIZE_DECISION');
    expect(paused.currentTurn).toBe(0);
    expect(paused.players[0].hand).toHaveLength(4);
    expect(paused.deck).toEqual(state.deck);
    expect(paused._aiFinishingTurn).toBe(true);
    expect(paused._aiPendingHandLimitThorns).toHaveLength(1);
    expect(paused.players[2].hp).toBe(10);

    const reaction = resolveHeadlessEtherealize(paused, { useEtherealize: false });
    const resumed = resolveMpAiTakeoverState({ ...reaction, phase: 'ACTION' }, 0, dependencies);
    expect(resumed.currentTurn).toBe(1);
    expect(resumed.players[2].hp).toBe(8);
    expect(resumed.players[0].hand).toHaveLength(4);
    expect(resumed.log.filter(line => line.includes('【玫瑰倒刺】'))).toHaveLength(1);
    expect(resumed._aiFinishingTurn).toBeUndefined();
    expect(resumed._aiPendingHandLimitThorns).toBeUndefined();
  });

  it('settles deferred thorns after the discarding player dies before advancing', () => {
    const state = makeGs({
      _isMP: true, phase: 'ACTION', currentTurn: 0,
      _aiFinishingTurn: true,
      _aiPendingHandLimitThorns: [{ id: 'deferred-after-death', roseThornHolderId: 2, roseThornSourceId: 0 }],
      players: [
        makePlayer({ role: ROLE_TREASURE, roleRevealed: true, hp: 0, isDead: true }),
        makePlayer({ role: ROLE_HUNTER, roleRevealed: true }),
        makePlayer({ role: ROLE_CULTIST, roleRevealed: true }),
        makePlayer({ role: ROLE_TREASURE, roleRevealed: true }),
      ],
      deck: [makeBlankZoneCard()],
    });
    const result = resolveMpAiTakeoverState(state, 0, dependencies);
    expect(result.players[2].hp).toBe(8);
    expect(result.currentTurn).toBe(1);
    expect(result._aiFinishingTurn).toBeUndefined();
    expect(result._aiPendingHandLimitThorns).toBeUndefined();
  });

  it('accepts only the seat responsible for the current decision', () => {
    const drawState = makeGs({
      currentTurn: 0,
      phase: 'DRAW_REVEAL',
      drawReveal: {
        card: makeZoneCard('A1', 0),
        needsDecision: true,
        drawerIdx: 1,
      },
    });
    expect(isMpAiTakeoverRelevant(drawState, 1)).toBe(true);
    expect(isMpAiTakeoverRelevant(drawState, 0)).toBe(false);
    expect(isMpAiTakeoverRelevant(
      { ...drawState, gameOver: { winner: '寻宝者' } },
      1
    )).toBe(false);
  });

  it('attaches the timed-out discard visual to the resolved state', () => {
    const card = makeZoneCard('A1', 0);
    const timeoutSource = makeGs({
      players: [makePlayer({ name: '掉线玩家' })],
      currentTurn: 0,
      phase: 'DRAW_REVEAL',
      drawReveal: {
        card,
        needsDecision: true,
        drawerIdx: 0,
      },
    });
    const result = withTimeoutDrawDiscardVisual(
      { ...timeoutSource, phase: 'ACTION' },
      timeoutSource
    );

    expect(result._mpTimedOutDrawDiscard).toMatchObject({
      type: 'timedOutDrawDiscard',
      card,
      drawerIdx: 0,
    });
    expect(result._visualEvents).toEqual([
      result._mpTimedOutDrawDiscard,
    ]);
  });

  it('reveals the first legal hunt card for the disconnected target', () => {
    const revealCard = makeZoneCard('B2', 0);
    const state = makeGs({
      players: [
        makePlayer({ name: '追捕者' }),
        makePlayer({ name: '目标', hand: [revealCard] }),
      ],
      currentTurn: 0,
      phase: 'HUNT_WAIT_REVEAL',
      abilityData: { huntTi: 1 },
      log: [],
    });

    const result = resolveMpAiTakeoverState(
      state,
      1,
      dependencies
    );

    expect(result.phase).toBe('HUNT_CONFIRM');
    expect(result.abilityData.revCard).toBe(revealCard);
    expect(result._visualEvents[0]).toMatchObject({
      type: 'huntReveal',
      sourceIdx: 0,
      targetIdx: 1,
      card: revealCard,
    });
  });

  it('auto hand-limit discard destroys derived cards but publishes all discarded cards for animation', () => {
    const normal = makeZoneCard('C3', 0, { id: 'takeover-normal' });
    const derived = { id: 'takeover-derived', name: '赐福黏液', type: 'tsathogguaSlime', isTsathogguaSlime: true };
    const state = makeGs({
      players: [
        makePlayer({ name: '掉线玩家', hand: [normal, derived] }),
        makePlayer({ name: '下一位' }),
      ],
      currentTurn: 0,
      phase: 'DISCARD_PHASE',
      deck: [makeZoneCard('D4', 0, { id: 'next-draw' })],
      discard: [],
      log: [],
    });

    const result = resolveMpAiTakeoverState(state, 0, { ...dependencies, getHandLimitForPlayer: () => 0 });

    expect(result.discard).toContain(normal);
    expect(result.discard).not.toContain(derived);
    const animatedCards = result._visualEvents
      .filter(event => event.type === 'handLimitDiscard').flatMap(event => event.cards);
    expect(animatedCards).toHaveLength(2);
    expect(animatedCards).toEqual(expect.arrayContaining([derived, normal]));
  });

  it('records one cave-duel choice while the other player is pending', () => {
    const sourceHand = [
      makeZoneCard('A1', 0),
      makeZoneCard('D4', 0),
    ];
    const state = makeGs({
      players: [
        makePlayer({ name: '来源', hand: sourceHand }),
        makePlayer({ name: '目标', hand: [makeZoneCard('B2', 0)] }),
      ],
      currentTurn: 0,
      phase: 'CAVE_DUEL_SELECT_CARD',
      abilityData: {
        caveDuelSource: 0,
        caveDuelTarget: 1,
      },
      log: [],
    });

    const result = resolveMpAiTakeoverState(
      state,
      0,
      dependencies
    );

    expect(result.phase).toBe('CAVE_DUEL_SELECT_CARD');
    expect(result.abilityData.sourceCard.id).toBe(sourceHand[1].id);
    expect(result.abilityData.targetCard).toBeUndefined();
    expect(result.log.at(-1)).toContain('已选好穴居人战争出牌');
  });

  it('delegates cave-duel continuation after both choices exist', () => {
    const sourceCard = makeZoneCard('A1', 0);
    const targetCard = makeZoneCard('B2', 0);
    const expected = { phase: 'ACTION', delegated: true };
    const resolveCaveDuelState = vi.fn(() => ({ nextGs: expected }));
    const state = makeGs({
      players: [
        makePlayer({ hand: [sourceCard] }),
        makePlayer({ hand: [targetCard] }),
      ],
      currentTurn: 0,
      phase: 'CAVE_DUEL_SELECT_CARD',
      abilityData: {
        caveDuelSource: 0,
        caveDuelTarget: 1,
        sourceCardIndex: 0,
        sourceCard,
      },
    });

    const result = resolveMpAiTakeoverState(state, 1, {
      getHandLimitForPlayer: () => 4,
      resolveCaveDuelState,
    });

    expect(result).toBe(expected);
    expect(resolveCaveDuelState).toHaveBeenCalledOnce();
  });
});
