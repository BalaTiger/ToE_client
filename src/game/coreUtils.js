import {
  LETTERS,
  NUMS,
  GOD_DEFS,
} from '../constants/card';

export const ROLE_TREASURE = '寻宝者';
export const ROLE_HUNTER = '追猎者';
export const ROLE_CULTIST = '邪祀者';

export const shuffle = (arr) => {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

export const clamp = (value, lo = 0, hi = 10) => Math.max(lo, Math.min(hi, value));

export const formatStatLoss = (amount, stat) => `失去 ${amount} ${stat}`;

export const formatSanLoss = (amount) => formatStatLoss(amount, 'SAN');

export const formatHpLoss = (amount) => formatStatLoss(amount, 'HP');

export const copyPlayers = (ps) => ps.map(p => ({
  ...p,
  hand: [...p.hand],
  godZone: [...(p.godZone || [])],
  zoneCards: [...(p.zoneCards || [])],
  peekMemories: Object.fromEntries(Object.entries(p.peekMemories || {}).map(([k, v]) => [k, [...(v || [])]])),
  huntQualityMemory: p.huntQualityMemory ? {
    ...p.huntQualityMemory,
    handIds: [...(p.huntQualityMemory.handIds || [])],
  } : null,
  damageLink: p.damageLink ? { ...p.damageLink } : p.damageLink,
  damageLinks: Array.isArray(p.damageLinks) ? p.damageLinks.map(link => ({ ...link })) : p.damageLinks,
  disableRestNextTurn: !!p.disableRestNextTurn,
  disableSkillNextTurn: !!p.disableSkillNextTurn,
  handLimitDecreaseNextTurn: p.handLimitDecreaseNextTurn || 0
}));

export const isZoneCard = (card) => !!card?.isZone;

export const isBlankZoneCard = (card) => card?.type === 'blankZone';

export const isBlackGoatYoung = (card) => !!card?.isBlackGoatYoung;
export const isTsathogguaSlime = (card) => !!card?.isTsathogguaSlime;
export const isGeomagneticRestore = (card) => !!card?.isGeomagneticRestore;
export const isVanishingDerivedCard = (card) => isBlackGoatYoung(card) || isTsathogguaSlime(card) || isGeomagneticRestore(card);
export const canRevealForHunt = (card) => !!card && !isBlackGoatYoung(card) && !isTsathogguaSlime(card);
export const isRevealedCultist = (player) => ((player?._nyaBorrow || player?.role) === ROLE_CULTIST) && !!player?.roleRevealed;
export const hasHuntRevealableCard = (playerOrHand) => {
  const hand = Array.isArray(playerOrHand) ? playerOrHand : (playerOrHand?.hand || []);
  return hand.some(canRevealForHunt);
};

export function buildTsathogguaSlimeBalanceDecision(playersBefore, playersAfter, extra = {}) {
  if (!Array.isArray(playersBefore) || !Array.isArray(playersAfter)) return null;
  const { pendingSlimeBalanceDecisions: carriedDecisions = [], ...decisionExtra } = extra;
  const decisions = [];
  for (let i = 0; i < playersAfter.length; i++) {
    const before = playersBefore[i];
    const after = playersAfter[i];
    if (!before || !after || after.isDead || after.hp <= 0) continue;
    const lostHp = Math.max(0, (before.hp || 0) - (after.hp || 0));
    const lostSan = Math.max(0, (before.san || 0) - (after.san || 0));
    if (!(lostHp || lostSan)) continue;
    if ((after.hand || []).some(isTsathogguaSlime)) {
      decisions.push({
        type: 'tsgSlimeBalance',
        targetIdx: i,
        beforeHp: before.hp,
        beforeSan: before.san,
        afterHp: after.hp,
        afterSan: after.san,
        lostHp,
        lostSan,
        ...(after._pendingDamageLinkBreak ? { pendingDamageLinkBreak: { ...after._pendingDamageLinkBreak } } : {}),
        ...decisionExtra,
      });
    }
  }
  if (!decisions.length) return null;
  const [first, ...rest] = decisions;
  const queued = [...rest, ...carriedDecisions];
  return queued.length ? { ...first, pendingSlimeBalanceDecisions: queued } : first;
}

export function getLivingAdjacentIndices(players, ci) {
  if (!Array.isArray(players) || ci == null || !players[ci]) return [];
  const prev = getPrevLivingIndex(players, ci);
  const next = getNextLivingIndex(players, ci);
  return [prev, next].filter((idx, pos, arr) => (
    idx != null &&
    idx !== ci &&
    players[idx] &&
    !players[idx].isDead &&
    arr.indexOf(idx) === pos
  ));
}

export function getAdjacentTargets(players, ci) {
  if (!Array.isArray(players) || ci == null || !players[ci]) return [];
  return [ci, ...getLivingAdjacentIndices(players, ci)];
}

export function buildEtherealizeLoss({ players, targetIdx, currentTurn, lostHp = 0, lostSan = 0, source = 'damage' } = {}) {
  if (!Array.isArray(players) || targetIdx == null || !players[targetIdx] || players[targetIdx].isDead) return null;
  if (!(lostHp > 0) && !(lostSan > 0)) return null;
  if (currentTurn == null || currentTurn === targetIdx) return null;
  const target = players[targetIdx];
  if (!((target.etherealizeStacks || 0) > 0)) return null;
  const adjacentTargets = getLivingAdjacentIndices(players, targetIdx);
  if (!adjacentTargets.length) return null;
  return {
    targetIdx,
    lostHp: Math.max(0, lostHp || 0),
    lostSan: Math.max(0, lostSan || 0),
    beforeHp: target.hp,
    beforeSan: target.san,
    adjacentTargets,
    source,
  };
}

export function appendEtherealizeLoss(pendingLosses, loss) {
  if (!loss) return Array.isArray(pendingLosses) ? pendingLosses : [];
  const next = Array.isArray(pendingLosses) ? [...pendingLosses] : [];
  const last = next[next.length - 1];
  if (last && last.targetIdx === loss.targetIdx && last.source === loss.source) {
    next[next.length - 1] = {
      ...last,
      lostHp: (last.lostHp || 0) + (loss.lostHp || 0),
      lostSan: (last.lostSan || 0) + (loss.lostSan || 0),
      adjacentTargets: loss.adjacentTargets || last.adjacentTargets,
    };
    return next;
  }
  next.push(loss);
  return next;
}

export function buildEtherealizeRedirectDecision(pendingLosses, extra = {}) {
  const losses = (Array.isArray(pendingLosses) ? pendingLosses : []).filter(loss => (
    loss &&
    loss.targetIdx != null &&
    ((loss.lostHp || 0) > 0 || (loss.lostSan || 0) > 0)
  ));
  if (!losses.length) return null;
  const first = losses[0];
  return {
    type: 'etherealizeRedirect',
    ...first,
    pendingLosses: losses,
    pendingIndex: 0,
    ...extra,
  };
}

export const separateBlackGoatYoung = (cards) => {
  if (!cards) return { kept: [], destroyed: [] };
  const kept = [];
  const destroyed = [];
  for (const c of cards) {
    if (isVanishingDerivedCard(c)) destroyed.push(c);
    else kept.push(c);
  }
  return { kept, destroyed };
};

export function tryVritraImmortal(P, i, currentTurn, D, Disc, L) {
  if (currentTurn == null || D == null || currentTurn === i) return false;
  if (!P[i] || P[i].isDead || P[i].hp > 0) return false;
  if (P[i].godName !== 'VRI') return false;
  const count = GOD_DEFS.VRI.levels[(P[i].godLevel || 1) - 1]?.immortalCount || 0;
  if (!count) return false;
  const revealed = [];
  const deckCopy = [...D];
  for (let k = 0; k < count && deckCopy.length > 0; k++) {
    revealed.push(deckCopy.shift());
  }
  const revealText = revealed.map(card => cardLogText(card, { alwaysShowName: true })).join('、') || '无牌';
  const hasGod = revealed.some(c => c && c.isGod);
  if (hasGod) {
    Disc.push(...revealed);
    L.push(`【不灭之躯】${P[i].name} 濒死之际激发龙血之力，翻开 ${revealed.length} 张：${revealText}；出现邪神牌，力量消散…`);
    D.length = 0;
    D.push(...deckCopy);
    return false;
  }
  P[i].hp = 1;
  Disc.push(...revealed);
  L.push(`【不灭之躯】${P[i].name} 在濒死之际激发龙血之力，翻开 ${revealed.length} 张：${revealText}；未见邪神牌，HP恢复至1！`);
  D.length = 0;
  D.push(...deckCopy);
  return true;
}

export const getZoneCardPolarity = (card) => {
  if (!card) return null;
  if (card.polarity) return card.polarity;
  return 'neutral';
};

export const getZoneCardEffectScope = (card) => {
  if (!card) return null;
  if (card.effectScope) return card.effectScope;
  return 'self';
};

export const isNegativeZoneCard = (card) => {
  return getZoneCardPolarity(card) === 'negative';
};

export const isPositiveZoneCard = (card) => {
  return getZoneCardPolarity(card) === 'positive';
};

export const isNeutralZoneCard = (card) => !isPositiveZoneCard(card) && !isNegativeZoneCard(card);

export const isDodgeableZoneCard = (card) => {
  if (!card) return false;
  if (card.dodgeable != null) return !!card.dodgeable;
  return isNegativeZoneCard(card);
};

export const cardContainsFireText = (card) => {
  if (!card) return false;
  return [card.name || '', card.subtitle || '', card.desc || ''].join('').toLowerCase().includes('火');
};

export const shouldTriggerTreasureDodge = (card, player, { moldyFoodRoll = null } = {}) => {
  if (!isDodgeableZoneCard(card)) return false;
  if (card.type === 'moldyFood') return moldyFoodRoll != null && moldyFoodRoll % 2 === 1;
  if (card.type === 'albinoCreature') return !(player?.hand || []).some(cardContainsFireText);
  if (card.type === 'sphinxGuess') return false;
  if (card.type === 'sacHealSelfSANCultist') return !!player?.hasBelievedGod;
  return true;
};

export const zoneCardHasGuaranteedHpLoss = (card) => {
  if (!card?.type) return false;
  return [
    'selfDamageHP', 'selfDamageDiscardHP', 'selfDamageHPSAN', 'selfDamageRestHP', 'selfDamageHPPeek',
    'allDamageHP', 'allDamageBoth', 'adjDamageHP', 'adjDamageBoth',
    'selfDamageAdjDamageHP', 'selfDamageAdjDamageBoth', 'allDamageHPRandomExtra', 'sameAbyssChoice'
  ].includes(card.type);
};

export const zoneCardHasGuaranteedSanLoss = (card) => {
  if (!card?.type) return false;
  return [
    'selfDamageSAN', 'selfDamageDiscardSAN', 'selfDamageHPSAN', 'selfDamageRestSAN',
    'allDamageSAN', 'allDamageBoth', 'adjDamageSAN', 'adjDamageBoth', 'selfDamageAdjDamageBoth',
    'allHealHPDamageSAN'
  ].includes(card.type);
};

export const zoneCardIsSacrificeStyle = (card) => {
  return !!card?.type && (card.type.startsWith('sac') || card.type === 'selfBerserk');
};

export const zoneCardAppliesWidePressure = (card) => {
  const scope = getZoneCardEffectScope(card);
  return scope === 'all' || scope === 'adjacent';
};

export const zoneCardProvidesGuaranteedCardGain = (card) => {
  return !!card?.type && ['placeBlankZone', 'revealTopCards', 'firstComePick', 'drawCard'].includes(card.type);
};

export const zoneCardUsesTargetInteraction = (card) => {
  return !!card?.type && ['swapAllHands', 'caveDuel', 'damageLink', 'roseThornGiftAllHand', 'globalOnlySwap'].includes(card.type);
};

export const isWinHand = (hand) => {
  if (!hand?.length) return false;
  const letters = new Set();
  const numbers = new Set();
  let blankCount = 0;
  for (const c of hand) {
    if (c.isGod) continue;
    if (isVanishingDerivedCard(c)) continue;
    if (isBlankZoneCard(c)) {
      blankCount += 1;
      continue;
    }
    if (c.letter) letters.add(c.letter);
    if (c.number) numbers.add(c.number);
  }
  const missingLetters = Math.max(0, LETTERS.length - letters.size);
  const missingNumbers = Math.max(0, NUMS.length - numbers.size);
  return Math.max(missingLetters, missingNumbers) <= blankCount;
};

// 本地玩家（seat 0）集齐宝藏时的日志/胜利文案。联机下日志会广播给其他客户端，
// 必须用真实昵称而非「你」，避免远端玩家误解获胜者。
export const localTreasureWinLog = (gs) => (
  gs?._isMP ? `${gs?.players?.[0]?.name || '你'} 集齐了全部编号！` : '你集齐了全部编号！'
);

export const localTreasureWinReason = (gs) => (
  gs?._isMP ? `${gs?.players?.[0]?.name || '你'} 集齐了全部编号并获胜！` : '你集齐了全部编号并获胜！'
);

export const getLivingPlayerOrder = (players, startIdx) => {
  const aliveOrder = [];
  for (let step = 0; step < players.length; step++) {
    const idx = (startIdx + step) % players.length;
    if (players[idx] && !players[idx].isDead) aliveOrder.push(idx);
  }
  return aliveOrder;
};

export const cardLogText = (card, opts = {}) => {
  if (!card) return '???';
  const { alwaysShowName = false } = opts;
  if (!card.isZone) return card.name || '???';
  const codePart = (card.letter || card.number != null) ? `[${card.letter || ''}${card.number || ''}]` : '';
  const namePart = card.name || '';
  if (alwaysShowName) return `${codePart} ${namePart}`.trim() || namePart || '???';
  return codePart || namePart || '???';
};

export const getCaveDuelDisplayNumber = card => (
  Number.isFinite(card?.number) ? card.number : 0
);

// 统一“从手牌信仰邪神”的日志格式（玩家自身、AI、远端玩家一致）。
// who: 主语（本地玩家为“你”，其他角色为其名字）。
export const buildWorshipFromHandLog = (who, godCard, { upgrade = false, level = 1 } = {}) => (
  upgrade
    ? `${who} 从手牌升级邪神之力至 Lv.${level}（骷髅头不计）`
    : `${who} 从手牌信仰 ${godCard?.name}，获得${godCard?.power}(Lv.1)（骷髅头不计）`
);

export const compareCaveDuelCards = (a, b) => {
  const aHasNumber = Number.isFinite(a?.number);
  const bHasNumber = Number.isFinite(b?.number);
  if (aHasNumber && bHasNumber) return Math.sign(a.number - b.number);
  if (!aHasNumber && !bHasNumber) return 0;
  const numbered = aHasNumber ? a.number : b.number;
  if (numbered === 4) return aHasNumber ? -1 : 1;
  return aHasNumber ? 1 : -1;
};

export const estimateZoneCardKeepScore = (card, ci, players) => {
  let score = 0;
  if (!card) return score;
  const letter = card.letter;
  const number = card.number;
  const letterCount = players.filter(p => p.hand.some(c => c.letter === letter)).length;
  const numberCount = players.filter(p => p.hand.some(c => c.number === number)).length;
  if (card.isGod) score = 10;
  else if (isPositiveZoneCard(card)) score = 8 - letterCount * 2 - numberCount * 2;
  else if (isNegativeZoneCard(card)) score = 3 + letterCount * 3 + numberCount * 3;
  else score = 5;
  if (card.type === 'swapAllHands') score += 3;
  if (card.type === 'caveDuel') score += 2;
  return score;
};

export const removeCardsFromDiscard = (discard, cards) => {
  if (!Array.isArray(discard) || !Array.isArray(cards) || !cards.length) return discard;
  const removeIds = new Set(cards.map(c => c?.id).filter(id => id != null));
  if (!removeIds.size) return discard;
  return discard.filter(c => !removeIds.has(c?.id));
};

export const getPrevLivingIndex = (players, ci) => {
  for (let step = 1; step < players.length; step++) {
    const idx = (ci - step + players.length) % players.length;
    if (idx !== ci && players[idx] && !players[idx].isDead) return idx;
  }
  return null;
};

export const getNextLivingIndex = (players, ci) => {
  for (let step = 1; step < players.length; step++) {
    const idx = (ci + step) % players.length;
    if (idx !== ci && players[idx] && !players[idx].isDead) return idx;
  }
  return null;
};

export function killPlayerState(P, i, Disc, L) {
  if (i == null || !P[i] || P[i].isDead) return;
  P[i]._pendingAnimDeath = true;
  P[i].isDead = true;
  P[i].roleRevealed = true;
  L.push(`☠ ${P[i].name}（${P[i].role}）倒下了！`);
  const { kept, destroyed } = separateBlackGoatYoung(P[i].hand);
  if (kept.length) Disc.push(...kept);
  if (destroyed.length) L.push(`${P[i].name} 的 ${destroyed.length} 张衍生牌被销毁`);
  P[i].hand = [];
  if (P[i].godZone?.length) {
    Disc.push(...P[i].godZone);
    P[i].godZone = [];
    P[i].godName = null;
    P[i].godLevel = 0;
  }
}

export function clearPendingAnimDeathFlags(players, preservePid = null) {
  return (players || []).map((p, idx) => {
    if (!p) return p;
    if (p._pendingAnimDeath && idx !== preservePid) return { ...p, _pendingAnimDeath: false };
    return { ...p };
  });
}

export function makeInspectionMeta(gs){
  return {
    inspectionDeck: gs?.inspectionDeck??[],
    inspectionDiscard: gs?.inspectionDiscard??[],
    sealLooseningCount: gs?.sealLooseningCount??0,
    houndsOfTindalosActive: gs?.houndsOfTindalosActive??false,
    houndsOfTindalosTarget: gs?.houndsOfTindalosTarget??null,
    houndsOfTindalosElapsed: gs?.houndsOfTindalosElapsed??0,
    _inspectionSeq: gs?._inspectionSeq||0,
    _inspectionCard: gs?._inspectionCard||null,
    _inspectionTarget: gs?._inspectionTarget??null,
    _inspectionPrevLogLen: gs?._inspectionPrevLogLen??null,
    _inspectionBeforePlayers: gs?._inspectionBeforePlayers??null,
    _inspectionEvents: gs?._inspectionEvents??[],
    _visualEvents: gs?._visualEvents??[],
    _statEvents: gs?._statEvents??[],
    _statEventSeq: gs?._statEventSeq||0,
  };
}

export function sortInspectionTargets(targets,startIndex,totalPlayers){
  const uniq=[...new Set((targets||[]).filter(i=>i!=null))];
  return uniq.sort((a,b)=>(((a-startIndex)+totalPlayers)%totalPlayers)-(((b-startIndex)+totalPlayers)%totalPlayers));
}
