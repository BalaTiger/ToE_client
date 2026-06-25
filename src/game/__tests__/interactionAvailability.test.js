import { describe, expect, it } from 'vitest';
import {
  canClickDiscardCard,
  canClickHandCard,
  canRespondWithAnyHandCard,
  canRespondWithFireHandCard,
  canRespondWithZoneCard,
  canUseTutorialHandCard,
} from '../interactionAvailability';

describe('interactionAvailability', () => {
  it('追捕响应只允许可亮出的手牌', () => {
    expect(canRespondWithZoneCard({
      phase: 'PLAYER_REVEAL_FOR_HUNT',
      card: { isZone: true, key: 'A1' },
    })).toBe(true);
    expect(canRespondWithZoneCard({
      phase: 'PLAYER_REVEAL_FOR_HUNT',
      card: { isBlackGoatYoung: true },
    })).toBe(false);
  });

  it('弃牌阶段最多选择超限数量，也可取消已选牌', () => {
    expect(canClickDiscardCard({
      selectedDiscardIndices: [],
      handSize: 5,
      effectiveHandLimit: 4,
      cardIndex: 2,
    })).toBe(true);
    expect(canClickDiscardCard({
      selectedDiscardIndices: [1],
      handSize: 5,
      effectiveHandLimit: 4,
      cardIndex: 2,
    })).toBe(false);
    expect(canClickDiscardCard({
      selectedDiscardIndices: [1],
      handSize: 5,
      effectiveHandLimit: 4,
      cardIndex: 1,
    })).toBe(true);
  });

  it('活埋和引燃火把只允许当前本地响应者点任意手牌', () => {
    expect(canRespondWithAnyHandCard({ phase: 'BURY_ALIVE_SELECT', isBuryAliveTarget: true })).toBe(true);
    expect(canRespondWithAnyHandCard({ phase: 'BURY_ALIVE_SELECT', isBuryAliveTarget: false })).toBe(false);
    expect(canRespondWithAnyHandCard({ phase: 'IGNITE_TORCH_DISCARD', isIgniteTorchPlayer: true })).toBe(true);
  });

  it('白化生物只允许本地响应者点火牌', () => {
    expect(canRespondWithFireHandCard({ phase: 'ALBINO_CREATURE_SELECT_CARD', isAlbinoCreaturePlayer: true })).toBe(true);
    expect(canClickHandCard({
      phase: 'ALBINO_CREATURE_SELECT_CARD',
      card: { id: 'fire-card' },
      canRespondFireHandCard: true,
      fireCardIds: ['fire-card'],
    })).toBe(true);
    expect(canClickHandCard({
      phase: 'ALBINO_CREATURE_SELECT_CARD',
      card: { id: 'water-card' },
      canRespondFireHandCard: true,
      fireCardIds: ['fire-card'],
    })).toBe(false);
  });

  it('行动阶段邪神牌可点击，普通牌不可点击', () => {
    expect(canClickHandCard({
      phase: 'ACTION',
      card: { isGod: true },
      isVisualPlayerTurn: true,
    })).toBe(true);
    expect(canClickHandCard({
      phase: 'ACTION',
      card: { isZone: true },
      isVisualPlayerTurn: true,
    })).toBe(false);
  });

  it('教学模式只允许脚本授权的手牌动作', () => {
    expect(canUseTutorialHandCard({
      canLocalSwapGive: true,
      card: { id: 'allowed' },
      isTutorialActionAllowed: ({ cardId }) => cardId === 'allowed',
    })).toBe(true);
    expect(canClickHandCard({
      phase: 'SWAP_GIVE_CARD',
      showTutorial: true,
      tutorialStepActive: true,
      tutorialHandCardAllowed: false,
      canLocalSwapGive: true,
    })).toBe(false);
  });
});
