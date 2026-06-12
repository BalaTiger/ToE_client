import { describe, expect, it } from 'vitest';
import { isWinHand } from '../coreUtils';
import { createTutorialScenario } from '../tutorialScenario';
import { cardsHuntMatch } from '../aiTurn';

describe('tutorial scenarios', () => {
  it('treasure scenario is one swap away from a complete treasure hand', () => {
    const gs = createTutorialScenario('treasure');
    const player = gs.players[0];
    const targetCard = gs.players[1].hand[0];
    const giveCard = player.hand.find(card => card.id === 'tut-treasure-give');

    expect(player.role).toBe('寻宝者');
    expect(targetCard.key).toBe('D4');
    expect(giveCard).toBeTruthy();
    expect(isWinHand([...player.hand.filter(card => card.id !== giveCard.id), targetCard])).toBe(true);
  });

  it('hunter scenario has a matching hand card and lethal target hp', () => {
    const gs = createTutorialScenario('hunter');
    const player = gs.players[0];
    const target = gs.players[1];
    const hunterCard = player.hand.find(card => card.id === 'tut-hunter-match');
    const revealCard = target.hand[0];

    expect(player.role).toBe('追猎者');
    expect(target.hp).toBe(3);
    expect(cardsHuntMatch(hunterCard, revealCard)).toBe(true);
  });

  it('cultist zone scenario can reduce the opponent san to zero with the gift card', () => {
    const gs = createTutorialScenario('cultistZone');
    const player = gs.players[0];
    const target = gs.players[1];
    const gift = player.hand.find(card => card.id === 'tut-cult-zone');

    expect(player.role).toBe('邪祀者');
    expect(gift.type).toBe('adjDamageSAN');
    expect(gift.val).toBeGreaterThanOrEqual(target.san);
  });

  it('cultist god scenario teaches skull count plus forced conversion damage', () => {
    const gs = createTutorialScenario('cultistGod');
    const target = gs.players[1];
    const gift = gs.players[0].hand.find(card => card.id === 'tut-cult-god');
    const nextEncounterCost = target.godEncounters + 1;

    expect(gift.isGod).toBe(true);
    expect(target.godName).toBe('ZHU');
    expect(gift.godKey).not.toBe(target.godName);
    expect(nextEncounterCost + 1).toBe(target.san);
  });
});
