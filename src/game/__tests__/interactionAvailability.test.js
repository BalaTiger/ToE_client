import { describe, expect, it } from 'vitest';
import {
  canClickDiscardCard,
  canClickHandCard,
  canRespondWithAnyHandCard,
  canRespondWithFireHandCard,
  canRespondWithZoneCard,
  canShowTargetSelectionUi,
  canUseTutorialHandCard,
  getRestActionBlockReason,
} from '../interactionAvailability';

describe('interactionAvailability', () => {
  it('确认目标并启动动画事务后立即隐藏目标选择界面', () => {
    expect(canShowTargetSelectionUi({ ownsLocalTargetSelection: true })).toBe(true);
    expect(canShowTargetSelectionUi({
      ownsLocalTargetSelection: true,
      anim: { type: 'SKILL_BEWITCH' },
      animQueueLength: 2,
      hasPendingGs: true,
    })).toBe(false);
    expect(canShowTargetSelectionUi({
      ownsLocalTargetSelection: true,
      animExiting: true,
    })).toBe(false);
    expect(canShowTargetSelectionUi({
      ownsLocalTargetSelection: true,
      hasPendingGs: true,
    })).toBe(false);
  });

  it('失眠时休息按钮与执行入口使用相同的禁用原因', () => {
    expect(getRestActionBlockReason({
      phase: 'ACTION',
      isBlocked: false,
      gs: { restUsed: false, skillUsed: false, multiplyUsed: false },
      player: { disableRest: true },
    })).toBe('disableRest');
  });

  it('邪神升级后未使用技能且未失眠时仍可休息', () => {
    expect(getRestActionBlockReason({
      phase: 'ACTION',
      isBlocked: false,
      gs: { restUsed: false, skillUsed: false, multiplyUsed: false, godFromHandUsed: true },
      player: { disableRest: false, godName: 'APO', godLevel: 2 },
    })).toBeNull();
  });

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
