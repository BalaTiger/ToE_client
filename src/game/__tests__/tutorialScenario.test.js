import { describe, expect, it } from 'vitest';
import { isWinHand } from '../coreUtils';
import { applyTutorialStepState, createTutorialScenario, getTutorialStep, nextTutorialStepAfterAction, shouldAllowTutorialAction, TUTORIAL_FLOW } from '../tutorialScenario';
import { cardsHuntMatch } from '../aiTurn';

describe('tutorial scenarios', () => {
  it('treasure scenario is one swap away from a complete treasure hand', () => {
    const gs = createTutorialScenario('treasure');
    const player = gs.players[0];
    const targetCard = gs.players[1].hand[0];
    const forcedDraw = gs.deck[0];

    expect(player.role).toBe('寻宝者');
    expect(targetCard.key).toBe('D4');
    expect(forcedDraw.key).toBe('B3');
    expect(forcedDraw.name).toBe('封入石棺');
    expect(isWinHand([...player.hand.filter(card => card.id !== forcedDraw.id), targetCard])).toBe(true);
  });

  it('shows the bag limit step before the treasure skill scenario', () => {
    expect(getTutorialStep(TUTORIAL_FLOW.DRAW_GOD_CARD).next).toBe(TUTORIAL_FLOW.BAG_LIMIT);
    expect(getTutorialStep(TUTORIAL_FLOW.BAG_LIMIT)).toMatchObject({
      title: '行囊有限',
      highlight: 'handArea',
      lock: true,
      next: TUTORIAL_FLOW.TREASURE_INTRO,
    });
  });

  it('uses the old closing narration as the final tutorial step', () => {
    const advice = getTutorialStep(TUTORIAL_FLOW.FINAL_ADVICE);
    const complete = getTutorialStep(TUTORIAL_FLOW.COMPLETE);

    expect(getTutorialStep(TUTORIAL_FLOW.CULTIST_GOD_RESULT).next).toBe(TUTORIAL_FLOW.FINAL_ADVICE);
    expect(advice.next).toBe(TUTORIAL_FLOW.COMPLETE);
    expect(advice.body).toHaveLength(2);
    expect(advice.body[0]).toContain('探索遗迹必备的知识');
    expect(advice.body[1]).toContain('我已经老了');
    expect(complete.complete).toBe(true);
    expect(complete.title).not.toBe('开始正式对局');
    expect(complete.body).toHaveLength(2);
    expect(complete.body[0]).toContain('现在退出还来得及');
    expect(complete.body[1]).toContain('开始探索');
    expect(complete.emphasisLineIndex).toBe(1);
  });

  it('hunter scenario has two matching hand cards and requires two hunts to kill', () => {
    const gs = createTutorialScenario('hunter');
    const player = gs.players[0];
    const target = gs.players[1];
    const revealCard = target.hand[0];
    const matching = player.hand.filter(card => cardsHuntMatch(card, revealCard));

    expect(player.role).toBe('追猎者');
    expect(target.hp).toBe(6);
    expect(target.hand.length).toBe(3);
    expect([...player.hand, ...target.hand].every(card => card.name && card.desc)).toBe(true);
    expect(target.hand.every(card => card.number === revealCard.number)).toBe(true);
    expect(player.hand.length).toBe(4);
    expect(matching.length).toBe(2);
    expect(matching.every(card => card.letter === revealCard.letter || card.number === revealCard.number)).toBe(true);
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

  it('entering cultist zone intro resets role, opponent, and hand after hunter scenario', () => {
    const hunterGs = createTutorialScenario('hunter');
    hunterGs.players[1].isDead = true;
    hunterGs.players[1].hp = 0;

    const next = applyTutorialStepState(hunterGs, TUTORIAL_FLOW.CULTIST_ZONE_INTRO);

    expect(next.players[0].role).toBe('邪祀者');
    expect(next.players[0].hand.map(card => card.id)).toContain('tut-cult-zone');
    expect(next.players[1].isDead).toBe(false);
    expect(next.players[1].san).toBe(2);
  });

  it('cultist zone tutorial splits bewitch button and card selection', () => {
    expect(shouldAllowTutorialAction(TUTORIAL_FLOW.CULTIST_ZONE_USE_SKILL, { type: 'useSkill' })).toBe(true);
    expect(shouldAllowTutorialAction(TUTORIAL_FLOW.CULTIST_ZONE_USE_SKILL, { type: 'handCard', cardId: 'tut-cult-zone' })).toBe(false);
    expect(nextTutorialStepAfterAction(TUTORIAL_FLOW.CULTIST_ZONE_USE_SKILL, { type: 'useSkill' })).toBe(TUTORIAL_FLOW.CULTIST_ZONE_SELECT_CARD);
    expect(getTutorialStep(TUTORIAL_FLOW.CULTIST_ZONE_SELECT_CARD).highlight).toBe('handCard');
    expect(getTutorialStep(TUTORIAL_FLOW.CULTIST_ZONE_SELECT_CARD).allowedAction.cardId).toBe('tut-cult-zone');
    expect(shouldAllowTutorialAction(TUTORIAL_FLOW.CULTIST_ZONE_SELECT_CARD, { type: 'handCard', cardId: 'tut-cult-zone' })).toBe(true);
    expect(nextTutorialStepAfterAction(TUTORIAL_FLOW.CULTIST_ZONE_SELECT_CARD, { type: 'handCard', cardId: 'tut-cult-zone' })).toBe(TUTORIAL_FLOW.CULTIST_ZONE_SELECT_TARGET);
    expect(getTutorialStep(TUTORIAL_FLOW.CULTIST_ZONE_SELECT_TARGET).highlight).toBe('singleOpponent');
  });

  it('cultist god scenario teaches skull count plus forced conversion damage', () => {
    const gs = createTutorialScenario('cultistGod');
    const player = gs.players[0];
    const target = gs.players[1];
    const opponentDraw = gs.deck[0];
    const playerDraw = gs.deck[1];
    const nextEncounterCost = target.godEncounters + 1;
    const forbiddenInspectionNames = new Set(['超人意志', '揭开真相', '封印松动', '廷达罗斯猎犬']);

    expect(player.role).toBe('邪祀者');
    expect(player.hand.some(card => card.id === 'tut-cult-god')).toBe(false);
    expect(opponentDraw.isGod).toBe(true);
    expect(playerDraw).toMatchObject({ id: 'tut-cult-god', isGod: true });
    expect(target.san).toBe(7);
    expect(target.godEncounters).toBe(1);
    expect(target.godName).toBe('NYA');
    expect(opponentDraw.godKey).not.toBe(target.godName);
    expect(nextEncounterCost).toBe(2);
    expect(gs.inspectionDeck.every(card => !forbiddenInspectionNames.has(card.name))).toBe(true);
    expect(getTutorialStep(TUTORIAL_FLOW.CULTIST_GOD_INTRO).highlight).toBe('singleOpponent');
    expect(getTutorialStep(TUTORIAL_FLOW.CULTIST_GOD_INTRO).next).toBe(TUTORIAL_FLOW.CULTIST_GOD_STATUS_MARKERS);
    expect(getTutorialStep(TUTORIAL_FLOW.CULTIST_GOD_STATUS_MARKERS).highlight).toBe('opponentGodStatus');
    expect(getTutorialStep(TUTORIAL_FLOW.CULTIST_GOD_STATUS_MARKERS).next).toBe(TUTORIAL_FLOW.CULTIST_GOD_OPPONENT_DRAW_START);
    expect(getTutorialStep(TUTORIAL_FLOW.CULTIST_GOD_OPPONENT_DRAW_START).auto).toBe(true);
    expect(getTutorialStep(TUTORIAL_FLOW.CULTIST_GOD_OPPONENT_DRAW).auto).toBeUndefined();
    expect(getTutorialStep(TUTORIAL_FLOW.CULTIST_GOD_CONVERT_CHECK).highlight).toBe('opponentSanAndGodStatus');
    expect(getTutorialStep(TUTORIAL_FLOW.CULTIST_GOD_CONVERT_CHECK).next).toBe(TUTORIAL_FLOW.CULTIST_GOD_CONVERT_RESOLVE);
    expect(getTutorialStep(TUTORIAL_FLOW.CULTIST_GOD_CONVERT_RESOLVE).auto).toBe(true);
    expect(nextTutorialStepAfterAction(TUTORIAL_FLOW.CULTIST_GOD_KEEP_HAND, { type: 'godKeepHand' })).toBe(TUTORIAL_FLOW.CULTIST_GOD_SELECT_CARD);
    expect(shouldAllowTutorialAction(TUTORIAL_FLOW.CULTIST_GOD_KEEP_HAND, { type: 'godKeepHand' })).toBe(true);
    expect(shouldAllowTutorialAction(TUTORIAL_FLOW.CULTIST_GOD_KEEP_HAND, { type: 'godChoice', action: 'worship' })).toBe(false);
    expect(getTutorialStep(TUTORIAL_FLOW.CULTIST_GOD_SELECT_CARD).highlight).toBe('skillButton');
    expect(shouldAllowTutorialAction(TUTORIAL_FLOW.CULTIST_GOD_SELECT_CARD, { type: 'useSkill' })).toBe(true);
    expect(shouldAllowTutorialAction(TUTORIAL_FLOW.CULTIST_GOD_SELECT_CARD, { type: 'handCard', cardId: 'tut-cult-god' })).toBe(false);
    expect(nextTutorialStepAfterAction(TUTORIAL_FLOW.CULTIST_GOD_SELECT_CARD, { type: 'useSkill' })).toBe(TUTORIAL_FLOW.CULTIST_GOD_CHOOSE_CARD);
    expect(getTutorialStep(TUTORIAL_FLOW.CULTIST_GOD_CHOOSE_CARD)).toMatchObject({
      highlight: 'handCard',
      allowedAction: { type: 'handCard', cardId: 'tut-cult-god' },
    });
    expect(shouldAllowTutorialAction(TUTORIAL_FLOW.CULTIST_GOD_CHOOSE_CARD, { type: 'handCard', cardId: 'tut-cult-god' })).toBe(true);
    expect(nextTutorialStepAfterAction(TUTORIAL_FLOW.CULTIST_GOD_CHOOSE_CARD, { type: 'handCard', cardId: 'tut-cult-god' })).toBe(TUTORIAL_FLOW.CULTIST_GOD_SELECT_TARGET);
    expect(getTutorialStep(TUTORIAL_FLOW.CULTIST_GOD_SELECT_TARGET).highlight).toBe('singleOpponent');
  });
});
