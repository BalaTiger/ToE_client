import { describe, expect, it } from 'vitest';
import { applyZoneCardIncome, settlePendingZoneIncome } from '../zoneCardIncome';
import { rotateGsForViewer, derotateGs } from '../rotateState';
import { applyBalanceDiscardSideEffects } from '../balanceCards';
import { submitLossEvents } from '../effectEngine';
import { buildTargetContinuationAbilityData, buildTargetContinuationState } from '../targetContinuation';
import { createTsathogguaSlimeCard } from '../../constants/card';
import { makeGs, makePlayer } from './factory';

describe('effect-before-income zone cards', () => {
  it('keeps income outside the hand across decisions and rotated seats', () => {
    const players = [makePlayer({ id: 0 }), makePlayer({ id: 1, hand: [{ id: 'old' }] })];
    const card = { id: 'bury', type: 'buryAlive' };
    const patch = applyZoneCardIncome({
      players, discard: [], card, drawerIdx: 1,
      statePatch: { abilityData: { type: 'buryAliveSelect', targets: [1], fromRest: true } },
    });
    expect(players[1].hand).toEqual([{ id: 'old' }]);
    expect(patch.abilityData).toMatchObject({ fromRest: true, pendingZoneIncome: { card, ownerId: 1 } });

    const state = makeGs({ players, currentTurn: 1, abilityData: patch.abilityData, _isMP: true });
    const rotated = rotateGsForViewer(state, 1);
    expect(rotated.abilityData.pendingZoneIncome.ownerId).toBe(1);
    expect(settlePendingZoneIncome(rotated.players, rotated.discard, rotated.abilityData.pendingZoneIncome))
      .toEqual({ card, drawerIdx: 0, dest: 'player' });
    expect(rotated.players[0].hand).toEqual([{ id: 'old' }, card]);
    expect(rotated.players[1].hand).toEqual([]);
    expect(derotateGs(rotated, 1).players[1].hand).toEqual([{ id: 'old' }, card]);
  });

  it('puts the pending card in discard if its owner dies during a reaction', () => {
    const players = [makePlayer({ id: 0 })];
    const discard = [];
    const card = { id: 'torch', type: 'igniteTorch' };
    const patch = applyZoneCardIncome({
      players, discard, card, drawerIdx: 0,
      statePatch: { abilityData: { type: 'etherealizeRedirect' } },
    });
    players[0].isDead = true;
    expect(settlePendingZoneIncome(players, discard, patch.abilityData.pendingZoneIncome))
      .toEqual({ card, drawerIdx: 0, dest: 'discard' });
    expect(players[0].hand).toEqual([]);
    expect(discard).toEqual([card]);
  });

  it('does not duplicate an existing card replayed by endless corridor', () => {
    const card = { id: 'bury', type: 'buryAlive' };
    const players = [makePlayer({ hand: [card] })];
    const patch = { abilityData: { type: 'buryAliveSelect' } };
    expect(applyZoneCardIncome({
      players, discard: [], card, drawerIdx: 0, statePatch: patch, fromEndTurnReplay: true,
    })).toBe(patch);
    expect(players[0].hand).toEqual([card]);
    expect(patch.abilityData.pendingZoneIncome).toBeUndefined();
  });

  it.each([
    ['sphinxGuess', { abilityData: { type: 'sphinxGuess' } }],
    ['roseThornGiftAllHand', { roseThornTargets: [1], roseThornSource: 0 }],
    ['selfDamageHP', { abilityData: { type: 'etherealizeRedirect' } }],
    ['adjDamageSAN', { abilityData: { type: 'tsgSlimeBalance' } }],
  ])('defers %s until its choice or reaction is complete', (type, statePatch) => {
    const card = { id: 'incoming', type };
    const players = [makePlayer()];
    const patch = applyZoneCardIncome({ players, discard: [], card, drawerIdx: 0, statePatch });
    expect(players[0].hand).toEqual([]);
    expect(patch.abilityData.pendingZoneIncome).toEqual({ card, ownerId: players[0].id });
  });

  it('discards a synchronously resolved card when its own effect kills its owner', () => {
    const card = { id: 'fatal', type: 'selfDamageHP' };
    const players = [makePlayer({ isDead: true, hp: 0 })];
    const discard = [];
    applyZoneCardIncome({ players, discard, card, drawerIdx: 0 });
    expect(players[0].hand).toEqual([]);
    expect(discard).toEqual([card]);
  });

  it.each(['etherealize', 'slime'])('carries pending torch income through a %s discard reaction', reaction => {
    const card = { id: 'torch', type: 'igniteTorch' };
    const players = [
      makePlayer({
        etherealizeStacks: reaction === 'etherealize' ? 1 : 0,
        hand: reaction === 'slime' ? [createTsathogguaSlimeCard()] : [],
      }),
      makePlayer(),
      makePlayer(),
    ];
    const discard = [];
    const incomePatch = applyZoneCardIncome({
      players, discard, card, drawerIdx: 0,
      statePatch: { abilityData: { type: 'igniteTorchDiscard', fromRest: true, cthDrawsRemaining: 1 } },
    });
    const reactionResult = applyBalanceDiscardSideEffects({
      players, deck: [], discard, log: [], ownerIdx: 0,
      cards: [{ type: 'lifeBalance', name: '生命天平' }],
      currentTurn: 1, submitDamage: submitLossEvents,
      continuation: buildTargetContinuationAbilityData(incomePatch.abilityData),
    });
    expect(reactionResult.damageDecision.phase).toBe(reaction === 'etherealize' ? 'ETHEREALIZE_DECISION' : 'TSG_SLIME_BALANCE');
    expect(reactionResult.damageDecision.abilityData).toMatchObject({
      pendingZoneIncome: incomePatch.abilityData.pendingZoneIncome,
      fromRest: true, cthDrawsRemaining: 1, _turnOwner: 1,
    });
    expect(players[0].hand).not.toContainEqual(card);

    const finished = buildTargetContinuationState({
      baseState: makeGs({ players, discard, currentTurn: 1 }),
      abilityData: reactionResult.damageDecision.abilityData,
    });
    expect(finished.abilityData.pendingZoneIncome).toEqual(incomePatch.abilityData.pendingZoneIncome);
    expect(finished.abilityData.cthDrawsRemaining).toBe(1);
    expect(settlePendingZoneIncome(finished.players, finished.discard, finished.abilityData.pendingZoneIncome))
      .toMatchObject({ card, drawerIdx: 0, dest: 'player' });
    expect(finished.players[0].hand.filter(item => item.id === card.id)).toHaveLength(1);
  });
});
