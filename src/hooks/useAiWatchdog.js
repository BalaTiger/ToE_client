import { useEffect, useRef } from 'react';
import { isMultiplayerGame, isAiCurrentTurn, isAiSeat } from '../game/rotateState';

export const BAD_PHASES = [
  'ACTION', 'DRAW_REVEAL', 'DRAW_SELECT_TARGET', 'GOD_CHOICE', 'NYA_BORROW',
  'SWAP_SELECT_TARGET', 'SWAP_STEAL_CARD', 'SWAP_GIVE_CARD', 'BEWITCH_SELECT_CARD', 'BEWITCH_SELECT_TARGET',
  'HUNT_SELECT_TARGET', 'HUNT_CONFIRM', 'DISCARD_PHASE',
  'DAMAGE_LINK_SELECT_TARGET', 'PEEK_HAND_SELECT_TARGET', 'CAVE_DUEL_SELECT_TARGET', 'ROSE_THORN_SELECT_TARGET',
  'FIRST_COME_PICK_SELECT', 'SAME_ABYSS_SELECT', 'SPHINX_GUESS', 'GRAVE_DIG_SELECT',
  'BURY_ALIVE_SELECT', 'IGNITE_TORCH_DISCARD', 'ALBINO_CREATURE_SELECT_CARD',
  'DECIPHER_STONE_CARVING', 'CAVE_DUEL_SELECT_CARD', 'TSG_SLIME_BALANCE',
  'ETHEREALIZE_DECISION', 'ETHEREALIZE_SELECT_TARGET', 'TORTOISE_ORACLE_SELECT',
  'SHU_SELECT_TARGET', 'MULTIPLY_SELECT_TARGET', 'ZHU_HIDE_AI_DRAW',
];

const AI_AUTO_DECISION_SOURCES = {
  DAMAGE_LINK_SELECT_TARGET: 'damageLinkSource',
  PEEK_HAND_SELECT_TARGET: 'peekHandSource',
  CAVE_DUEL_SELECT_TARGET: 'caveDuelSource',
  ROSE_THORN_SELECT_TARGET: 'roseThornSource',
};

export function isAiAutoDecisionPhase(gs) {
  const sourceKey = AI_AUTO_DECISION_SOURCES[gs?.phase];
  if (!sourceKey) return false;
  return gs?.abilityData?.[sourceKey] === gs?.currentTurn;
}

export function getSinglePlayerAiDecisionSeat(gs) {
  if (!gs || isMultiplayerGame(gs) || gs.gameOver) return null;
  const ad = gs.abilityData || {};
  switch (gs.phase) {
    case 'TSG_SLIME_BALANCE':
    case 'ETHEREALIZE_DECISION':
    case 'ETHEREALIZE_SELECT_TARGET':
      return isAiSeat(gs, ad.targetIdx) ? ad.targetIdx : null;
    case 'BURY_ALIVE_SELECT': {
      const idx = ad.targets?.[ad.targetIndex || 0];
      return isAiSeat(gs, idx) ? idx : null;
    }
    case 'IGNITE_TORCH_DISCARD':
    case 'ALBINO_CREATURE_SELECT_CARD':
    case 'DECIPHER_STONE_CARVING':
    case 'GRAVE_DIG_SELECT':
      return isAiSeat(gs, ad.playerIndex) ? ad.playerIndex : null;
    case 'FIRST_COME_PICK_SELECT': {
      const idx = ad.pickOrder?.[ad.pickIndex || 0];
      return isAiSeat(gs, idx) ? idx : null;
    }
    case 'SAME_ABYSS_SELECT':
      return isAiSeat(gs, ad.targetIdx) ? ad.targetIdx : null;
    case 'SPHINX_GUESS':
    case 'NYA_BORROW':
    case 'TORTOISE_ORACLE_SELECT':
      return isAiCurrentTurn(gs) ? gs.currentTurn : null;
    // CAVE_DUEL_SELECT_CARD is only ever entered when a human must pick a card
    // (all-AI duels resolve inline). The AI's card is chosen inside
    // caveDuelSelectCard, so this phase must never auto-resolve for the player.
    case 'SHU_SELECT_TARGET': {
      const idx = ad.shuChooserIdx ?? gs.currentTurn;
      return isAiSeat(gs, idx) ? idx : null;
    }
    case 'MULTIPLY_SELECT_TARGET':
      return isAiCurrentTurn(gs) ? gs.currentTurn : null;
    case 'ZHU_HIDE_AI_DRAW':
      return isAiCurrentTurn(gs) ? gs.currentTurn : null;
    default:
      return null;
  }
}

/**
 * AI 回合看门狗：检测 AI 卡死状态并触发恢复回调。
 *
 * @param {Object} params
 * @param {Object|null} params.gs        当前游戏状态
 * @param {boolean}     params.anim      是否有动画正在进行
 * @param {boolean}     params.showTutorial 是否正在显示教程
 * @param {boolean}     params.softGuidePauseActive 是否正在显示/准备软引导
 * @param {function}    params.onRecover 恢复回调，接收 (type, detail)
 *                                        type: 'stuck' | 'hang'
 */
export function useAiWatchdog({ gs, anim, showTutorial, softGuidePauseActive = false, onRecover }) {
  const recoverRef = useRef(onRecover);
  useEffect(() => { recoverRef.current = onRecover; }, [onRecover]);

  // ── Stuck recovery: AI 处于需要玩家交互的 phase ──────────────
  useEffect(() => {
    if (!gs || isMultiplayerGame(gs) || gs.gameOver || anim || showTutorial || softGuidePauseActive) return;
    const aiDecisionSeat = getSinglePlayerAiDecisionSeat(gs);
    if (aiDecisionSeat != null) {
      const t = setTimeout(() => recoverRef.current?.('decision', { phase: gs.phase, seat: aiDecisionSeat }), 700);
      return () => clearTimeout(t);
    }
    if (!isAiCurrentTurn(gs)) return;
    const aiPhase = gs.phase;
    if (!BAD_PHASES.includes(aiPhase)) return;
    if (isAiAutoDecisionPhase(gs)) return;
    console.warn('[stuck-recovery] AI in bad phase', aiPhase, 'at turn', gs.currentTurn);
    const t = setTimeout(() => recoverRef.current?.('stuck', aiPhase), 500);
    return () => clearTimeout(t);
  }, [gs, anim, showTutorial, softGuidePauseActive]);

  // ── Hard watchdog: AI_TURN 长时间无进展 ──────────────────────
  useEffect(() => {
    if (!gs || isMultiplayerGame(gs) || gs.gameOver || showTutorial || softGuidePauseActive) return;
    if (!isAiCurrentTurn(gs) || gs.phase !== 'AI_TURN') return;
    const guard = { turnKey: gs._turnKey, turn: gs.currentTurn, logLen: gs.log?.length || 0 };
    const t = setTimeout(() => recoverRef.current?.('hang', guard), 20000);
    return () => clearTimeout(t);
  }, [gs, showTutorial, softGuidePauseActive]);
}
