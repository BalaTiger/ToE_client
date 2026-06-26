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

// 返回该决策阶段的"决策者座位"（无论 AI 还是本地玩家）；非决策阶段返回 null。
export function getSinglePlayerDecisionSeat(gs) {
  if (!gs || isMultiplayerGame(gs) || gs.gameOver) return null;
  const ad = gs.abilityData || {};
  switch (gs.phase) {
    case 'TSG_SLIME_BALANCE':
    case 'ETHEREALIZE_DECISION':
    case 'ETHEREALIZE_SELECT_TARGET':
      return ad.targetIdx ?? null;
    case 'BURY_ALIVE_SELECT':
      return ad.targets?.[ad.targetIndex || 0] ?? null;
    case 'IGNITE_TORCH_DISCARD':
    case 'ALBINO_CREATURE_SELECT_CARD':
    case 'DECIPHER_STONE_CARVING':
    case 'GRAVE_DIG_SELECT':
      return ad.playerIndex ?? null;
    case 'FIRST_COME_PICK_SELECT':
      return ad.pickOrder?.[ad.pickIndex || 0] ?? null;
    case 'SAME_ABYSS_SELECT':
      return ad.targetIdx ?? null;
    // CAVE_DUEL_SELECT_CARD is only ever entered when a human must pick a card
    // (all-AI duels resolve inline), so it is intentionally absent here.
    case 'SHU_SELECT_TARGET':
      return ad.shuChooserIdx ?? gs.currentTurn ?? null;
    case 'SPHINX_GUESS':
    case 'NYA_BORROW':
    case 'TORTOISE_ORACLE_SELECT':
    case 'MULTIPLY_SELECT_TARGET':
      return gs.currentTurn ?? null;
    case 'ZHU_HIDE_AI_DRAW':
      // 决策者是烛九阴(ZHU)的信徒——决定是否把对方将摸的牌藏到牌堆底，
      // 不是正在摸牌的那名 AI。错判会让看门狗替本地玩家自动跳过藏牌弹窗。
      return ad.zhuGuard?.ownerIdx ?? gs.zhuLight?.ownerIdx ?? gs.currentTurn ?? null;
    default:
      return null;
  }
}

// 仅当该阶段的决策者是 AI 时返回其座位；本地玩家的决策返回 null（看门狗不得代为推进）。
export function getSinglePlayerAiDecisionSeat(gs) {
  const seat = getSinglePlayerDecisionSeat(gs);
  return seat != null && isAiSeat(gs, seat) ? seat : null;
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
    const decisionSeat = getSinglePlayerDecisionSeat(gs);
    // 决策阶段属于本地玩家时，必须让玩家自己决定，看门狗绝不能强制推进——
    // 否则会在 AI 回合触发玩家决策（如黏液平分）时吞掉弹窗并误报"状态异常"。
    if (decisionSeat != null && !isAiSeat(gs, decisionSeat)) return;
    const aiDecisionSeat = decisionSeat;
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
