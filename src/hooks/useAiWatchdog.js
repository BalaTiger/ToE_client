import { useEffect, useRef } from 'react';
import { isMultiplayerGame, isAiCurrentTurn } from '../game/rotateState';

export const BAD_PHASES = [
  'ACTION', 'DRAW_REVEAL', 'DRAW_SELECT_TARGET', 'GOD_CHOICE', 'NYA_BORROW',
  'SWAP_SELECT_TARGET', 'SWAP_GIVE_CARD', 'BEWITCH_SELECT_CARD', 'BEWITCH_SELECT_TARGET',
  'HUNT_SELECT_TARGET', 'HUNT_CONFIRM', 'DISCARD_PHASE',
  'DAMAGE_LINK_SELECT_TARGET', 'PEEK_HAND_SELECT_TARGET', 'CAVE_DUEL_SELECT_TARGET', 'ROSE_THORN_SELECT_TARGET',
];

/**
 * AI 回合看门狗：检测 AI 卡死状态并触发恢复回调。
 *
 * @param {Object} params
 * @param {Object|null} params.gs        当前游戏状态
 * @param {boolean}     params.anim      是否有动画正在进行
 * @param {boolean}     params.showTutorial 是否正在显示教程
 * @param {function}    params.onRecover 恢复回调，接收 (type, detail)
 *                                        type: 'stuck' | 'hang'
 */
export function useAiWatchdog({ gs, anim, showTutorial, onRecover }) {
  const recoverRef = useRef(onRecover);
  useEffect(() => { recoverRef.current = onRecover; }, [onRecover]);

  // ── Stuck recovery: AI 处于需要玩家交互的 phase ──────────────
  useEffect(() => {
    if (!gs || isMultiplayerGame(gs) || gs.gameOver || anim || showTutorial) return;
    if (!isAiCurrentTurn(gs)) return;
    const aiPhase = gs.phase;
    if (!BAD_PHASES.includes(aiPhase)) return;
    console.warn('[stuck-recovery] AI in bad phase', aiPhase, 'at turn', gs.currentTurn);
    const t = setTimeout(() => recoverRef.current?.('stuck', aiPhase), 500);
    return () => clearTimeout(t);
  }, [gs, anim, showTutorial]);

  // ── Hard watchdog: AI_TURN 长时间无进展 ──────────────────────
  useEffect(() => {
    if (!gs || isMultiplayerGame(gs) || gs.gameOver || showTutorial) return;
    if (!isAiCurrentTurn(gs) || gs.phase !== 'AI_TURN') return;
    const guard = { turnKey: gs._turnKey, turn: gs.currentTurn, logLen: gs.log?.length || 0 };
    const t = setTimeout(() => recoverRef.current?.('hang', guard), 20000);
    return () => clearTimeout(t);
  }, [gs, showTutorial]);
}
