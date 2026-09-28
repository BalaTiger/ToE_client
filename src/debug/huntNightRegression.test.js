import { describe, expect, it } from 'vitest';
import { createHuntNightRegressionState, resolveHuntNightRegression, createAiSwapNightRegressionState, resolveAiSwapNightRegression } from './huntNightRegression';
import { strictActionQueueMeta } from '../game/animationQueuePolicy';
import { prepareAnimationTransaction } from '../game/animationTransaction';

describe('browser hunt regression input', () => {
  it('runs real AI rules to the expected impacts and restores the browser RNG', () => {
    const previousState = createHuntNightRegressionState();
    const random = Math.random;
    const presentation = resolveHuntNightRegression(previousState);
    expect(Math.random).toBe(random);
    expect(previousState.players[2].hp).toBe(6);
    expect(presentation.nextState.phase).toBe('PLAYER_REVEAL_FOR_HUNT');
    expect(presentation.queue.filter(step => step.type === 'SKILL_HUNT').slice(0, 2)
      .map(step => [step.targetIdx, step.visualSetupPatch.players[2].hp]))
      .toEqual([[2, 6], [2, 3]]);
    expect(presentation.queue.filter(step => step.type === 'HP_DAMAGE')
      .flatMap(step => step.statEvents).map(event => event.to.hp)).toEqual([3, 0]);
    expect(presentation.queue.filter(step => step.type === 'GUILLOTINE')).toHaveLength(1);
  });

  it('plays both hidden AI swap transfers through strict preparation and stops at a local action', () => {
    const previousState = createAiSwapNightRegressionState();
    const random = Math.random;
    const presentation = resolveAiSwapNightRegression(previousState);
    expect(Math.random).toBe(random);
    const transactionMeta = strictActionQueueMeta(presentation.nextState, presentation.queue);
    const transaction = prepareAnimationTransaction({
      queue: presentation.queue, previousState, nextState: presentation.nextState, transactionMeta,
    });
    const transfers = transaction.queue.filter(step => step.type === 'CARD_TRANSFER');
    expect(transfers).toHaveLength(2);
    expect(transfers.every(step => !step.cards?.length)).toBe(true);
    expect(transfers.map(step => [step.fromPid, step.toPid])).toEqual([[2, 1], [1, 2]]);
    expect(transaction.queue.filter(step => step.type === 'SKILL_SWAP')).toHaveLength(1);
    expect(transaction.nextState).toMatchObject({ currentTurn: 0, phase: 'ACTION' });
    expect(transaction.nextState.players.map(player => player.hand.length)).toEqual([2, 2, 2]);
  });
});
