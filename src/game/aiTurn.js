import { copyPlayers, isZoneCard, isBlankZoneCard, cardLogText } from './coreUtils';

/**
 * 检查两张卡是否满足追捕匹配规则。
 * 非区域卡或空白区域卡默认匹配；否则字母或数字相同即匹配。
 */
export function cardsHuntMatch(a, b) {
  if (!a || !b) return false;
  if (!isZoneCard(a) || !isZoneCard(b)) return true;
  if (isBlankZoneCard(a) || isBlankZoneCard(b)) return true;
  return a.letter === b.letter || a.number === b.number;
}

/**
 * 将手牌不大于3张的玩家的空白区域牌移入手牌。
 * @returns {{players, log}|null} 如果有变化则返回新状态，否则返回 null
 */
export function moveEligibleBlankZones(players, log = []) {
  let changed = false;
  const P = copyPlayers(players);
  const L = [...log];
  P.forEach(player => {
    if (!player || player.isDead) return;
    const blankZones = (player.zoneCards || []).filter(isBlankZoneCard);
    if (!blankZones.length) return;
    if (player.hand.length <= 3) {
      blankZones.forEach(blank => {
        player.hand.push(blank);
        L.push(`${player.name} 手牌不大于3张，将空白区域牌收入手牌`);
      });
      player.zoneCards = (player.zoneCards || []).filter(c => !isBlankZoneCard(c));
      changed = true;
    }
  });
  return changed ? { players: P, log: L } : null;
}

/**
 * 清空玩家的神牌区域，并将神牌移入弃牌堆。
 */
export function clearPlayerGodZone(targetPlayer, discard) {
  if (targetPlayer?.godZone?.length) discard.push(...targetPlayer.godZone);
  if (targetPlayer) {
    targetPlayer.godZone = [];
    targetPlayer.godName = null;
    targetPlayer.godLevel = 0;
  }
}

/**
 * AI 弃牌至手牌上限。
 */
export function discardAiHandToLimit(P, ct, Disc, L) {
  const aiHandLimit = P[ct]._nyaHandLimit ?? 4;
  while (P[ct].hand.length > aiHandLimit) {
    const c = P[ct].hand.shift();
    Disc.push(c);
    L.push(`${P[ct].name} 弃 ${cardLogText(c, { alwaysShowName: true })}（上限）`);
  }
}
