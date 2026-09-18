import { describe, expect, it } from 'vitest';
import { resolveSameAbyssState, resumeSameAbyssContinuation } from './sameAbyssResolution';
import { advanceHeadlessGame, resolveHeadlessEtherealize } from './headlessSimulator';
import { rotateGsForViewer, derotateGs } from './rotateState';
import { addDamageLink } from './damageLinks';
import { applyFx } from './effectEngine';
import { makeGs, makePlayer, makeZoneCard } from './__tests__/factory';

function stateWithBalances(count = 3) {
  return makeGs({ _isMP: true, _headless: true, currentTurn: 0, phase: 'SAME_ABYSS_SELECT',
    players: [
      makePlayer({ role: '追猎者', roleRevealed: true, hand: [makeZoneCard('A1')] }),
      makePlayer({ role: '寻宝者', roleRevealed: true,
        hand: Array.from({ length: count }, (_, i) => makeZoneCard(`B${i + 1}`, 0, { type: 'lifeBalance', name: '生命天平' })) }),
      makePlayer({ role: '邪祀者', roleRevealed: true }),
    ], abilityData: { type: 'sameAbyssChoice', actorIdx: 0, targetIdx: 1, actorHandCount: 1 },
  });
}

describe('same abyss committed discard settlement', () => {
  it('settles the source initial damage reaction before choosing the maximum hand', () => {
    const state = stateWithBalances();
    state.currentTurn = 2;
    state.players[0].etherealizeStacks = 1;
    const card = makeZoneCard('D4', 0, { type: 'sameAbyssChoice', name: '同归深渊', hpVal: 2 });
    const fx = applyFx(card, 0, null, state.players, [], [], state, false, [], true);
    expect(fx.statePatch.abilityData.type).toBe('etherealizeRedirect');
    expect(fx.P[1].hand).toHaveLength(3);
    const paused = { ...state, ...fx.statePatch, players: fx.P, deck: fx.D, discard: fx.Disc,
      log: fx.msgs, phase: 'ETHEREALIZE_DECISION' };
    const reacted = resolveHeadlessEtherealize(paused, { useEtherealize: false });
    const resumed = resumeSameAbyssContinuation(reacted);
    expect(resumed.players[0].hp).toBe(8);
    expect(resumed.abilityData).toMatchObject({ actorIdx: 0, targetIdx: 1, actorHandCount: 1, forceDiscard: false });
  });
  it('recomputes the obligation after rope damage kills and empties the source', () => {
    const state = stateWithBalances(2);
    state.players[0].hp = 2;
    addDamageLink(state.players, 0, 1);
    const result = resolveSameAbyssState(state, { choice: 'discard' });
    expect(result.players[0].isDead).toBe(true);
    expect(result.players[0].hand).toHaveLength(0);
    expect(result.players[1].hand).toHaveLength(0);
    expect(result.players[1].hp).toBe(1);
    expect(state.players[1].hand).toHaveLength(2);
  });

  it('pauses after one card and resumes the committed discard after a reaction', () => {
    const state = stateWithBalances();
    state.players[1].etherealizeStacks = 1;
    const paused = resolveSameAbyssState(state, { choice: 'discard' });
    expect(paused.phase).toBe('ETHEREALIZE_DECISION');
    expect(paused.players[1].hand).toHaveLength(2);
    expect(paused.players[1].hp).toBe(10);
    const reacted = resolveHeadlessEtherealize(paused, { useEtherealize: false });
    expect(reacted.players[1].hp).toBe(7);
    const secondPause = advanceHeadlessGame(reacted).state;
    expect(secondPause.phase).toBe('ETHEREALIZE_DECISION');
    expect(secondPause.players[1].hand).toHaveLength(1);
    const finished = advanceHeadlessGame(resolveHeadlessEtherealize(secondPause, { useEtherealize: false })).state;
    expect(finished.players[1].hand).toHaveLength(1);
    expect(finished.players[1].hp).toBe(4);
    expect(finished._sameAbyssContinuation).toBeNull();
    expect(finished.log.some(line => line.includes('选择承受伤害'))).toBe(false);
    expect(finished._visualEvents.filter(event => event.effectKey === 'forcedRandomDiscard')
      .flatMap(event => event.discardEvents)).toHaveLength(2);
  });

  it('uses the source hand after the reaction instead of the old cached count', () => {
    const state = stateWithBalances();
    state.players[1].etherealizeStacks = 1;
    const paused = resolveSameAbyssState(state, { choice: 'discard' });
    const reacted = resolveHeadlessEtherealize(paused, { useEtherealize: false });
    reacted.players[0].hand.push(makeZoneCard('C3'));
    const resumed = resumeSameAbyssContinuation(reacted);
    expect(resumed.abilityData.forceDiscard).toBe(true);
    const finished = resolveSameAbyssState(resumed, { choice: 'hp' });
    expect(finished.players[1].hand).toHaveLength(2);
    expect(finished.players[1].hp).toBe(7);
  });

  it('ignores legacy incoming counts while the triggering card is outside the hand', () => {
    const state = stateWithBalances();
    state.players[0].hand = [];
    state.players[1].hand = [makeZoneCard('A1'), makeZoneCard('B2')];
    state.abilityData.sameAbyssIncomingCount = 1;
    state.abilityData.sameAbyssIncomingCardId = 'pending-card';
    const finished = resolveSameAbyssState(state, { choice: 'discard' });
    expect(finished.players[1].hand).toHaveLength(0);
  });

  it('rotates the paused source, target, turn owner and resumed ability indices', () => {
    const state = stateWithBalances();
    state._sameAbyssContinuation = { actorIdx: 0, targetIdx: 1, _turnOwner: 0,
      sameAbyssIncomingCount: 1, sameAbyssIncomingCardId: 'stable-card-id' };
    const rotated = rotateGsForViewer(state, 1);
    expect(rotated._sameAbyssContinuation).toMatchObject({ actorIdx: 2, targetIdx: 0, _turnOwner: 2,
      sameAbyssIncomingCardId: 'stable-card-id' });
    expect(rotated.abilityData).toMatchObject({ actorIdx: 2, targetIdx: 0 });
    expect(derotateGs(rotated, 1)._sameAbyssContinuation).toEqual(state._sameAbyssContinuation);
  });
});
