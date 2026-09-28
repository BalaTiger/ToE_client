import { describe, expect, it } from 'vitest';
import {
  getDecisionContext,
  getDecisionOwnerSeats,
} from '../decisionContext';
import { buildPhaseUiState } from '../phaseUi';
import { applyFx } from '../effectEngine';
import {
  canLocalActOnTargetSelectionPhase,
  isLocalSphinxGuessPhase,
  isLocalTortoiseSelectPhase,
  rotateGsForViewer,
} from '../rotateState';

const players = [{ name: '玩家' }, { name: 'AI' }, { name: '旁观者' }];

function state(phase, abilityData = {}, extra = {}) {
  return { phase, currentTurn: 0, abilityData, players, ...extra };
}

describe('decisionContext', () => {
  it.each([
    ['ZONE_SWAP_SELECT_TARGET', { zoneSwapSource: 1 }],
    ['PEEK_HAND_SELECT_TARGET', { peekHandSource: 1 }],
    ['CAVE_DUEL_SELECT_TARGET', { caveDuelSource: 1 }],
    ['ROSE_THORN_SELECT_TARGET', { roseThornSource: 1 }],
    ['DAMAGE_LINK_SELECT_TARGET', { damageLinkSource: 1 }],
    ['SHU_SELECT_TARGET', { shuChooserIdx: 1 }],
    ['ETHEREALIZE_SELECT_TARGET', { targetIdx: 1 }],
  ])('%s 使用效果执行者而不是 currentTurn 决定操作权', (phase, abilityData) => {
    const gs = state(phase, abilityData);
    expect(getDecisionOwnerSeats(gs)).toEqual([1]);
    expect(canLocalActOnTargetSelectionPhase(gs)).toBe(false);
    expect(getDecisionContext(gs).presentation).toBe('hidden');
  });

  it('本地效果执行者仍可选择目标', () => {
    const gs = state('ROSE_THORN_SELECT_TARGET', { roseThornSource: 0 });
    expect(canLocalActOnTargetSelectionPhase(gs)).toBe(true);
    expect(getDecisionContext(gs).presentation).toBe('interactive');
  });

  it('灵龟和斯芬克斯跟随 playerIndex', () => {
    const tortoise = state('TORTOISE_ORACLE_SELECT', { playerIndex: 1 });
    const sphinx = state('SPHINX_GUESS', { playerIndex: 1 });
    expect(isLocalTortoiseSelectPhase(tortoise)).toBe(false);
    expect(isLocalSphinxGuessPhase(sphinx)).toBe(false);
    expect(getDecisionContext(tortoise).presentation).toBe('readOnly');
    expect(getDecisionContext(sphinx).presentation).toBe('readOnly');
  });

  it('斯芬克斯效果把实际承受者写入决策状态', () => {
    const result = applyFx(
      { id: 'sphinx', name: '斯芬克斯', type: 'sphinxGuess' },
      1,
      null,
      [
        { name: '玩家', hp: 10, san: 10, hand: [] },
        { name: 'AI', hp: 10, san: 10, hand: [] },
      ],
      [{ id: 'top', name: '牌堆顶', isZone: true, letter: 'A', number: 1 }],
      [],
      { currentTurn: 0 },
      false,
      [],
      false,
    );
    expect(result.statePatch.abilityData).toMatchObject({ type: 'sphinxGuess', playerIndex: 1 });
  });

  it('多人非本地私有决策显示等待态', () => {
    const gs = state('ETHEREALIZE_DECISION', { targetIdx: 1 }, { _isMP: true });
    expect(getDecisionContext(gs).presentation).toBe('waiting');
  });

  it('取消按钮服从决策归属，而非仍为本地的 currentTurn', () => {
    const gs = state('SHU_SELECT_TARGET', { shuChooserIdx: 1 });
    const ui = buildPhaseUiState({
      gs,
      phase: gs.phase,
      localCurrentTurn: true,
      decisionContext: getDecisionContext(gs),
    });
    expect(ui.showCancelBtn).toBe(false);
    expect(ui.phaseLabel).toBe('AI 正在思考…');
  });

  it('旋转视角时同步旋转新增的决策归属字段', () => {
    const gs = state('ZONE_SWAP_SELECT_TARGET', { zoneSwapSource: 1, playerIndex: 1 });
    const rotated = rotateGsForViewer(gs, 1);
    expect(rotated.abilityData.zoneSwapSource).toBe(0);
    expect(rotated.abilityData.playerIndex).toBe(0);
    expect(canLocalActOnTargetSelectionPhase(rotated)).toBe(true);
  });
});
