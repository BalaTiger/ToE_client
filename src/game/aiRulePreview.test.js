import { describe, expect, it } from 'vitest';
import { aiShouldKeepZoneCard, canCultistWinByBewitch, chooseAiCultistBewitchPlan } from './ai';
import { createAiObservationState, evaluateAiState } from './aiPolicy';
import { previewAiZoneAcquisition } from './aiRulePreview';
import { ROLE_CULTIST, ROLE_HUNTER, ROLE_TREASURE } from './coreUtils';
import { makeGs, makeGodCard, makePlayer, makeZoneCard } from './__tests__/factory';

const echo = () => makeZoneCard('A4', 0, {
  name: '空谷传音', type: 'allDamageSAN', val: 1, polarity: 'negative',
});
const coffin = () => makeZoneCard('B3', 1);
const cultistTable = (hand) => [
  makePlayer({ role: ROLE_CULTIST, roleRevealed: true, hand }),
  makePlayer({ role: ROLE_HUNTER, roleRevealed: true, hp: 1, san: 1 }),
  makePlayer({ role: ROLE_TREASURE, roleRevealed: true, hp: 10, san: 10 }),
];

describe('AI acquisition rule previews', () => {
  it('rejects a SAN area effect that would immediately award the opposing cultist victory', () => {
    const players = [
      makePlayer({ role: ROLE_HUNTER, san: 1 }),
      makePlayer({ role: ROLE_CULTIST, roleRevealed: true, san: 1 }),
      makePlayer({ role: ROLE_TREASURE, roleRevealed: true, san: 1 }),
    ];
    expect(aiShouldKeepZoneCard(echo(), 0, players)).toBe(false);
  });

  it('uses HP-before-SAN death settlement when comparing bewitch gifts', () => {
    const stone = coffin();
    const sanCard = echo();
    const players = cultistTable([stone, sanCard]);
    const state = createAiObservationState(makeGs({ players }), 0);
    const result = previewAiZoneAcquisition(state, { card: stone, receiverIdx: 1, giverIdx: 0 });

    expect(result.players[1]).toMatchObject({ hp: 0, san: 1, isDead: true });
    expect(evaluateAiState(result, 0)[0]).toBe(0);
    expect(chooseAiCultistBewitchPlan(players, 0)?.card.id).toBe(sanCard.id);
    expect(canCultistWinByBewitch(players, 0)).toBe(true);
    expect(canCultistWinByBewitch(cultistTable([stone]), 0)).toBe(false);
  });

  it('keeps a sacrifice that really wins for the hunter faction', () => {
    const volcano = makeZoneCard('C1', 0, { type: 'allDamageHP', val: 4, polarity: 'negative' });
    const players = [
      makePlayer({ role: ROLE_HUNTER, roleRevealed: true, hp: 3 }),
      makePlayer({ role: ROLE_CULTIST, roleRevealed: true, hp: 4 }),
      makePlayer({ role: ROLE_HUNTER, roleRevealed: true, hp: 8 }),
    ];
    expect(aiShouldKeepZoneCard(volcano, 0, players)).toBe(true);
  });

  it('does not assume an unknown survivor is an ally to justify certain self-death', () => {
    const volcano = makeZoneCard('C1', 0, { type: 'allDamageHP', val: 4, polarity: 'negative' });
    const players = [
      makePlayer({ role: ROLE_HUNTER, hp: 3 }),
      makePlayer({ role: ROLE_CULTIST, hp: 4 }),
      makePlayer({ role: ROLE_HUNTER, hp: 8 }),
    ];
    expect(aiShouldKeepZoneCard(volcano, 0, players)).toBe(false);
  });

  it('does not declare a win while the defender can still redirect SAN loss', () => {
    const card = echo();
    const players = cultistTable([card]);
    players[1].etherealizeStacks = 1;
    const state = createAiObservationState(makeGs({ players }), 0);
    const result = previewAiZoneAcquisition(state, { card, receiverIdx: 1, giverIdx: 0 });

    expect(result._aiPreviewIncomplete).toBe(true);
    expect(result.abilityData.type).toBe('etherealizeRedirect');
    expect(evaluateAiState(result, 0)[0]).toBe(0);
    expect(canCultistWinByBewitch(players, 0)).toBe(false);
  });

  it('does not claim a targeted gift win while black night can replace its recipient', () => {
    const card = makeZoneCard('A2', 0, { type: 'selfDamageSAN', val: 1, polarity: 'negative' });
    const players = cultistTable([card]);
    const state = makeGs({ players, apophisNight: { active: true, threshold: 2, count: 11, limit: 12 } });
    const result = previewAiZoneAcquisition(createAiObservationState(state, 0), {
      card, receiverIdx: 1, giverIdx: 0,
    });
    expect(result._aiPendingResolution).toBe('apophisGiftTarget');
    expect(result.players[0].hand).toContainEqual(card);
    expect(result.players[1].san).toBe(1);
    expect(canCultistWinByBewitch(players, 0, { state })).toBe(false);

    players[0].godPowerImmuneThisTurn = true;
    expect(canCultistWinByBewitch(players, 0, { state })).toBe(true);
    players[0].godPowerImmuneThisTurn = false;
    players[2].isDead = true;
    expect(canCultistWinByBewitch(players, 0, { state })).toBe(true);
  });

  it('marks effects with an unmigrated follow-up decision as incomplete', () => {
    const card = makeZoneCard('A1', 0, { type: 'decipherStoneCarving' });
    const state = createAiObservationState(makeGs({ players: [makePlayer()] }), 0);
    const result = previewAiZoneAcquisition(state, { card, receiverIdx: 0 });

    expect(result._aiPreviewIncomplete).toBe(true);
    expect(result._aiPendingResolution).toBe('zoneEffect:decipherStoneCarving');
    expect(result.players[0].hand).not.toContainEqual(card);
    expect(result.abilityData.pendingZoneIncome).toEqual({ card, ownerId: state.players[0].id });
  });

  it('does not treat a hidden immortality reveal as an empty-deck guaranteed revival', () => {
    const card = coffin();
    const players = cultistTable([card]);
    players[1].godName = 'VRI';
    players[1].godLevel = 1;
    const gs = makeGs({ players, currentTurn: 0, deck: [makeGodCard('NYA')] });
    const result = previewAiZoneAcquisition(createAiObservationState(gs, 0), {
      card, receiverIdx: 1, giverIdx: 0,
    });
    expect(result._aiPreviewIncomplete).toBe(true);
    expect(result._aiPendingResolution).toBe('unknownImmortalReveal');
    expect(evaluateAiState(result, 0)[0]).toBe(0);
    expect(canCultistWinByBewitch(players, 0, { state: gs })).toBe(false);
    expect(canCultistWinByBewitch(players, 0)).toBe(false);
  });

  it('rejecting a newly drawn balance card does not trigger a hand-discard penalty', () => {
    const card = makeZoneCard('A1', 0, { type: 'lifeBalance', val: 3 });
    const state = createAiObservationState(makeGs({ players: [makePlayer({ hp: 3 })] }), 0);
    const result = previewAiZoneAcquisition(state, { card, receiverIdx: 0, keep: false });
    expect(result.players[0]).toMatchObject({ hp: 3, isDead: false, hand: [] });
    expect(result.discard).toContainEqual(card);
  });

  it('finishes a self-targeted same-abyss zero-discard decision and keeps the winning fourth axis', () => {
    const card = makeZoneCard('D4', 0, { id: 0, name: '同归深渊', type: 'sameAbyssChoice', hpVal: 2, polarity: 'negative' });
    const players = [
      makePlayer({ role: ROLE_TREASURE, hp: 3, hand: [makeZoneCard('A1'), makeZoneCard('B2'), makeZoneCard('C3')] }),
      makePlayer({ role: ROLE_HUNTER, roleRevealed: true, hand: [makeZoneCard('A2')] }),
    ];
    const state = createAiObservationState(makeGs({ players }), 0);
    const result = previewAiZoneAcquisition(state, { card, receiverIdx: 0 });
    expect(result.players[0].hp).toBe(1);
    expect(result.players[0].hand).toHaveLength(4);
    expect(result.abilityData?.type).toBeUndefined();
    expect(result._aiPreviewIncomplete).not.toBe(true);
    expect(evaluateAiState(result, 0, { allowTreasureDeclaration: true })[0]).toBe(1);
    expect(aiShouldKeepZoneCard(card, 0, players)).toBe(true);
    expect(aiShouldKeepZoneCard(card, 0, players, false, {
      state: makeGs({ players, abilityData: { continueTurnStartDraw: true } }),
    })).toBe(false);
  });

  it('does not treat completing the numbered hand before lethal card damage as a treasure win', () => {
    const card = makeZoneCard('D4', 0, { type: 'selfDamageHP', val: 3, polarity: 'negative' });
    const players = [
      makePlayer({ role: ROLE_TREASURE, hp: 3, hand: [makeZoneCard('A1'), makeZoneCard('B2'), makeZoneCard('C3')] }),
      makePlayer({ role: ROLE_HUNTER, roleRevealed: true }),
    ];
    expect(aiShouldKeepZoneCard(card, 0, players)).toBe(false);
  });

  it('does not turn every positive resource change into a keep decision', () => {
    const exposedHeal = makeZoneCard('A3', 0);
    const players = [makePlayer({ role: ROLE_HUNTER, hand: [makeZoneCard('B2'), makeZoneCard('C3')] }), makePlayer()];
    expect(aiShouldKeepZoneCard(exposedHeal, 0, players)).toBe(false);
    players[0].hp = 3;
    expect(aiShouldKeepZoneCard(exposedHeal, 0, players)).toBe(true);
  });

  it('keeps hidden roles, hidden cards and actual deck order out of gift selection', () => {
    const god = makeGodCard('ZHU');
    const players = [
      makePlayer({ role: ROLE_CULTIST, roleRevealed: true, hand: [god] }),
      makePlayer({ role: ROLE_CULTIST, san: 3, hand: [makeZoneCard('A1')] }),
      makePlayer({ role: ROLE_HUNTER, san: 8, hand: [makeZoneCard('B2')] }),
    ];
    const gs = makeGs({ players, deck: [makeZoneCard('C3'), makeZoneCard('D4')] });
    const before = structuredClone(gs);
    const first = chooseAiCultistBewitchPlan(players, 0, { state: gs });
    expect(gs).toEqual(before);
    const alternative = structuredClone(gs);
    alternative.players[1].role = ROLE_HUNTER;
    alternative.players[2].role = ROLE_CULTIST;
    alternative.players[1].hand = [makeZoneCard('D4')];
    alternative.players[2].hand = [makeGodCard('NYA')];
    alternative.deck.reverse();
    const second = chooseAiCultistBewitchPlan(alternative.players, 0, { state: alternative });
    expect(second).toEqual(first);
  });
});
