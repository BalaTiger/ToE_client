import { buildEtherealizeLoss } from './coreUtils';

export function shouldAiUseEtherealize({ player, lostHp = 0, lostSan = 0 } = {}) {
  if (!player || player.isDead || !((player.etherealizeStacks || 0) > 0)) return false;
  if (!(lostHp > 0) && !(lostSan > 0)) return false;
  const hpAfter = (player.hp ?? 0) - (lostHp || 0);
  const sanAfter = (player.san ?? 0) - (lostSan || 0);
  if (hpAfter <= 0 || sanAfter <= 0) return true;
  if ((lostHp || 0) + (lostSan || 0) >= 2) return true;
  if ((player.hp ?? 0) <= 4 || (player.san ?? 0) <= 4) return true;
  return true;
}

export function chooseAiEtherealizeRedirectTarget(players = [], candidateIndices = []) {
  const candidates = candidateIndices
    .filter(i => players?.[i] && !players[i].isDead)
    .map(i => ({ idx: i, player: players[i] }));
  if (!candidates.length) return null;
  candidates.sort((a, b) => (
    ((b.player.hp || 0) + (b.player.san || 0)) -
    ((a.player.hp || 0) + (a.player.san || 0))
  ) || ((b.player.hp || 0) - (a.player.hp || 0)) || (a.idx - b.idx));
  return candidates[0].idx;
}

// ══════════════════════════════════════════════════════════════
//  伤害前置事件（虚化）决策链
//  伤害结算前先逐个询问虚化候选是否转移；转移目标若也有虚化则递归询问；
//  链走完后，已确认的损失与效果期间延迟的直接损失一次性归并结算。
// ══════════════════════════════════════════════════════════════

// 归并决策链中待结算的全部损失（已确认归属的 + 延迟的直接伤害），按效果发生时的原始顺序排序
export function collectEtherealizeChainSettleLosses(abilityData) {
  const confirmed = (Array.isArray(abilityData?.confirmedLosses) ? abilityData.confirmedLosses : []).filter(Boolean);
  const deferred = (Array.isArray(abilityData?.deferredDirectLosses) ? abilityData.deferredDirectLosses : []).filter(Boolean);
  return [...confirmed, ...deferred]
    .filter(loss => loss && loss.targetIdx != null && ((loss.lostHp || 0) > 0 || (loss.lostSan || 0) > 0))
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
}

// 将一笔已确认最终承受者的损失记入决策链
export function appendConfirmedChainLoss(abilityData, loss) {
  if (!loss || loss.targetIdx == null) return abilityData;
  return {
    ...abilityData,
    confirmedLosses: [
      ...(Array.isArray(abilityData?.confirmedLosses) ? abilityData.confirmedLosses : []),
      loss,
    ],
  };
}

// 在决策链中寻找下一个仍需决定的虚化候选（跳过已死亡或已没有虚化层数的目标）
export function getNextEtherealizeChainDecision(abilityData, players, consumedIndex = null) {
  const losses = (Array.isArray(abilityData?.pendingLosses) ? abilityData.pendingLosses : []).filter(Boolean);
  const start = consumedIndex == null ? (abilityData?.pendingIndex ?? 0) : consumedIndex + 1;
  for (let i = start; i < losses.length; i++) {
    const loss = losses[i];
    const target = players?.[loss.targetIdx];
    if (target && !target.isDead && (target.etherealizeStacks || 0) > 0) {
      return { ...abilityData, ...loss, type: 'etherealizeRedirect', pendingIndex: i, pendingLosses: losses };
    }
  }
  return null;
}

// 递归检查：虚化转移的目标自身也有虚化时，生成由其继续决策的新损失（注明伤害来源）
export function buildEtherealizeRedirectChainLoss({ players, sourceIdx, redirectTargetIdx, lostHp = 0, lostSan = 0, currentTurn, order } = {}) {
  const loss = buildEtherealizeLoss({
    players,
    targetIdx: redirectTargetIdx,
    currentTurn,
    lostHp,
    lostSan,
    source: '半物质化',
  });
  if (!loss) return null;
  return { ...loss, viaEtherealizeFrom: sourceIdx, ...(order != null ? { order } : {}) };
}
