import { ROLE_TREASURE, ROLE_HUNTER, ROLE_CULTIST, isWinHand } from './coreUtils';

// Immediate rule victories. Treasure declarations remain a separate action
// boundary: a transient winning hand during an unfinished effect is not a win.
export function checkWin(players, isMP) {
  const hasHunters = players.some(p => p.role === ROLE_HUNTER);
  const hasCultists = players.some(p => p.role === ROLE_CULTIST);
  for (const p of players) if (!p.isDead && p.san <= 0) {
    if (hasCultists) {
      const ws = players.filter(q => q.role === ROLE_CULTIST).map(q => q.name).join('、');
      return { winner: ROLE_CULTIST, reason: `${p.name} 的理智归零，邪神苏醒！邪祀者（${ws}）获胜！` };
    }
    return { winner: 'LOSE_ALL', reason: `${p.name} 的理智归零，邪神复活，无人幸存！全员失败！` };
  }
  const nonHunters = players.filter(p => p.role !== ROLE_HUNTER);
  if (nonHunters.length && nonHunters.every(p => p.isDead)) {
    if (hasHunters) {
      const ws = players.filter(q => q.role === ROLE_HUNTER).map(q => q.name).join('、');
      return { winner: ROLE_HUNTER, reason: `所有非追猎者已覆灭！追猎者（${ws}）获胜！` };
    }
    return { winner: 'LOSE_ALL', reason: '所有探险者均已覆灭，无人幸存！全员失败！' };
  }
  const alivePlayers = players.filter(p => !p.isDead);
  if (alivePlayers.length === 1) {
    const survivor = alivePlayers[0];
    if (survivor.role === ROLE_TREASURE) {
      return { winner: ROLE_TREASURE, reason: `${survivor.name} 是唯一的幸存者，成功逃离！` };
    }
    if (survivor.role === ROLE_CULTIST) {
      return { winner: ROLE_CULTIST, reason: `${survivor.name} 是唯一的幸存者，邪祀者阵营获胜！` };
    }
  }
  if (!isMP && players[0]?.isDead) return { winner: 'LOSE', reason: '你已沉入永恒的黑暗…' };
  return null;
}

export function getTreasureDeclarationWin(players, actorIdx) {
  const actor = players[actorIdx];
  if (!actor || actor.isDead || (actor._nyaBorrow || actor.role) !== ROLE_TREASURE || !isWinHand(actor.hand)) return null;
  return { winner: ROLE_TREASURE, winnerIdx: actorIdx, reason: `${actor.name} 集齐了全部编号并获胜！` };
}
