import {
  FIXED_ZONE_CARD_VARIANTS_BY_KEY,
  LETTERS,
  NUMS,
  GOD_DEFS,
  EXPANSIONS,
  INSPECTION_DECK,
} from '../constants/card';
import { shuffle, ROLE_TREASURE, ROLE_HUNTER, ROLE_CULTIST } from './coreUtils';

export const EXPANSION_RANDOM_KEY = 'random_battle_expansion';
export const DEFAULT_EXPANSION_KEY = '地神的潜影';
export const STARS_CALL_KEY = '群星呼唤';
const STARS_CALL_TEMP_REPLACEMENT_CHANCE = 0.5;

function createGodCards(godKey, count, startId = 0) {
  const def = GOD_DEFS[godKey];
  if (!def) return [];
  return Array.from({ length: count }, (_, offset) => ({
    id: startId + offset,
    isGod: true,
    godKey,
    key: godKey,
    type: 'god',
    needsTarget: false,
    ...def,
  }));
}

export function resolveBattleExpansionPlan(expansionKey = EXPANSION_RANDOM_KEY) {
  if (typeof expansionKey === 'object' && expansionKey) {
    const resolvedExpansionKey = EXPANSIONS[expansionKey.expansionKey]
      ? expansionKey.expansionKey
      : DEFAULT_EXPANSION_KEY;
    const resolvedDeckExpansionKey = EXPANSIONS[expansionKey.deckExpansionKey]
      ? expansionKey.deckExpansionKey
      : (resolvedExpansionKey === STARS_CALL_KEY ? DEFAULT_EXPANSION_KEY : resolvedExpansionKey);
    return {
      expansionKey: resolvedExpansionKey,
      deckExpansionKey: resolvedDeckExpansionKey,
      temporaryStarsCall: !!expansionKey.temporaryStarsCall,
    };
  }
  if (expansionKey === EXPANSION_RANDOM_KEY || expansionKey == null) {
    if (Math.random() < STARS_CALL_TEMP_REPLACEMENT_CHANCE) {
      return {
        expansionKey: STARS_CALL_KEY,
        deckExpansionKey: DEFAULT_EXPANSION_KEY,
        temporaryStarsCall: true,
      };
    }
    return {
      expansionKey: DEFAULT_EXPANSION_KEY,
      deckExpansionKey: DEFAULT_EXPANSION_KEY,
      temporaryStarsCall: false,
    };
  }
  const resolvedExpansionKey = EXPANSIONS[expansionKey] ? expansionKey : DEFAULT_EXPANSION_KEY;
  return {
    expansionKey: resolvedExpansionKey,
    deckExpansionKey: resolvedExpansionKey,
    temporaryStarsCall: false,
  };
}

export function mkDeck(expansionKey = '地神的潜影') {
  const resolvedExpansionKey = EXPANSIONS[expansionKey] ? expansionKey : DEFAULT_EXPANSION_KEY;
  const expansion = EXPANSIONS[resolvedExpansionKey];
  let id = 0;
  const zoneCards = [];

  LETTERS.forEach(letter => {
    NUMS.forEach(number => {
      const key = `${letter}${number}`;
      const variants = FIXED_ZONE_CARD_VARIANTS_BY_KEY[key] || [];
      variants.forEach(cardDef => {
        if (cardDef.expansion !== resolvedExpansionKey) {
          return;
        }
        zoneCards.push({
          ...cardDef,
          id: id++,
          key,
          letter,
          number,
          isZone: true,
        });
      });
    });
  });

  const godCards = [];
  (expansion.godCardKeys || []).forEach(godKey => {
    const def = GOD_DEFS[godKey];
    if (def) {
      const copies = expansion.godCopies || 4;
      for (let i = 0; i < copies; i++) {
        godCards.push({
          id: id++,
          isGod: true,
          godKey,
          key: godKey,
          type: 'god',
          needsTarget: false,
          ...def,
        });
      }
    }
  });

  return shuffle([...zoneCards, ...godCards]);
}

export function applyTemporaryStarsCallDeckReplacement(deck = [], replacedGodKey = null) {
  const earthGodKeys = EXPANSIONS[DEFAULT_EXPANSION_KEY]?.godCardKeys || [];
  const replacementCandidates = earthGodKeys.filter(godKey => godKey !== 'CTH');
  const targetGodKey = replacementCandidates.includes(replacedGodKey)
    ? replacedGodKey
    : replacementCandidates[Math.floor(Math.random() * replacementCandidates.length)];
  const keptDeck = deck.filter(card => !(card?.isGod && card.godKey === targetGodKey));
  const replacementCount = (EXPANSIONS[DEFAULT_EXPANSION_KEY]?.godCopies || 4);
  const nextId = nextDebugCardId(keptDeck);
  const cthCards = createGodCards('CTH', replacementCount, nextId);
  return {
    deck: shuffle([...keptDeck, ...cthCards]),
    replacedGodKey: targetGodKey,
    insertedGodKey: 'CTH',
  };
}

export function mkRoles(N = 5, isSinglePlayer = false, forcedPlayerRole = null) {
  if (N < 2) throw new Error('游戏人数不能少于2人');

  if (N === 2) {
    const baseRoles = [ROLE_TREASURE, ROLE_HUNTER, ROLE_CULTIST];
    if (isSinglePlayer && forcedPlayerRole && baseRoles.includes(forcedPlayerRole)) {
      const remaining = shuffle(baseRoles.filter(role => role !== forcedPlayerRole));
      return [forcedPlayerRole, remaining[0]];
    }
    return shuffle(baseRoles).slice(0, 2);
  }

  const roles = [ROLE_TREASURE, ROLE_HUNTER, ROLE_CULTIST];
  const counts = { [ROLE_TREASURE]: 1, [ROLE_HUNTER]: 1, [ROLE_CULTIST]: 1 };
  const limit = Math.floor(N / 2);

  let playerRoleProbabilities = { [ROLE_TREASURE]: 1, [ROLE_HUNTER]: 1, [ROLE_CULTIST]: 1 };
  let playerRole = null;

  if (isSinglePlayer) {
    try {
      const storedData = localStorage.getItem('cthulhu_role_streaks');
      if (storedData) {
        const streaks = JSON.parse(storedData);
        Object.keys(streaks).forEach(role => {
          playerRoleProbabilities[role] = Math.max(0, 1 - (streaks[role] * 0.1));
        });
      }
    } catch {
      // Ignore localStorage issues and fall back to default weights.
    }
  }

  for (let i = 3; i < N; i++) {
    const available = [ROLE_TREASURE];
    if (counts[ROLE_HUNTER] < limit) available.push(ROLE_HUNTER);
    if (counts[ROLE_CULTIST] < limit) available.push(ROLE_CULTIST);

    let pick;
    if (isSinglePlayer && i === 3) {
      const weights = available.map(role => playerRoleProbabilities[role]);
      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

      if (totalWeight > 0) {
        let random = Math.random() * totalWeight;
        for (let j = 0; j < available.length; j++) {
          random -= weights[j];
          if (random <= 0) {
            pick = available[j];
            break;
          }
        }
      } else {
        pick = available[Math.floor(Math.random() * available.length)];
      }

      playerRole = pick;
    } else {
      pick = available[Math.floor(Math.random() * available.length)];
    }

    roles.push(pick);
    counts[pick]++;
  }

  if (isSinglePlayer && playerRole) {
    try {
      const storedData = localStorage.getItem('cthulhu_role_streaks');
      const streaks = storedData
        ? JSON.parse(storedData)
        : { [ROLE_TREASURE]: 0, [ROLE_HUNTER]: 0, [ROLE_CULTIST]: 0 };

      Object.keys(streaks).forEach(role => {
        streaks[role] = 0;
      });
      streaks[playerRole] = (streaks[playerRole] || 0) + 1;

      localStorage.setItem('cthulhu_role_streaks', JSON.stringify(streaks));
    } catch {
      // Ignore localStorage issues.
    }
  }

  return shuffle(roles);
}

// ══════════════════════════════════════════════════════════════
//  INSPECTION DECK
// ══════════════════════════════════════════════════════════════

const AI_NAMES = ['艾伦','贝拉','卡洛斯','黛安娜'];
const RINFO = {
  '寻宝者':{icon:'✦',col:'#7ecfd4',dim:'#2a6068',goal:'集齐宝藏',skillName:'掉包',skillLimited:true},
  '追猎者':{icon:'☩',col:'#cc4444',dim:'#6a1a1a',goal:'消灭所有非追猎者',skillName:'追捕',skillLimited:false},
  '邪祀者':{icon:'☽',col:'#9060cc',dim:'#3a1060',goal:'复活邪神',skillName:'蛊惑',skillLimited:true},
};

export { AI_NAMES, RINFO };

export const INITIAL_HAND_SIZE = 4;

const zhCount = (count) => ({
  1: '一',
  2: '两',
  3: '三',
  4: '四',
  5: '五',
}[count] || String(count));

function isDebugForceCardTargetAllowed(target, isSinglePlayer) {
  if (target === 'player') return true;
  return isSinglePlayer && /^ai[1-4]$/.test(target || '');
}

function nextDebugCardId(deck) {
  return deck.reduce((max, card) => Math.max(max, Number.isFinite(card?.id) ? card.id : -1), -1) + 1;
}

function createDebugZoneCard(deck, key, name, expansionKey = '地神的潜影') {
  const variants = FIXED_ZONE_CARD_VARIANTS_BY_KEY[key] || [];
  const cardDef = variants.find(card => card.name === name && card.expansion === expansionKey);
  if (!cardDef) return null;
  const letter = key?.[0];
  const number = Number(key?.slice(1));
  return {
    ...cardDef,
    id: nextDebugCardId(deck),
    key,
    letter,
    number,
    isZone: true,
  };
}

function createDebugGodCard(deck, godKey, expansionKey = '地神的潜影') {
  const expansion = EXPANSIONS[expansionKey] || EXPANSIONS['地神的潜影'];
  if (!(expansion.godCardKeys || []).includes(godKey)) return null;
  const def = GOD_DEFS[godKey];
  if (!def) return null;
  return {
    id: nextDebugCardId(deck),
    isGod: true,
    godKey,
    key: godKey,
    type: 'god',
    needsTarget: false,
    ...def,
  };
}

// ══════════════════════════════════════════════════════════════
//  INIT GAME
// ══════════════════════════════════════════════════════════════

export function initGame(
  playerNames,
  debugForceCard,
  debugForceCardTarget,
  debugForceCardKeep,
  debugForceCardType,
  debugForceZoneCardKey,
  debugForceZoneCardName,
  debugForceGodCardKey,
  debugPlayerRole,
  startNextTurn,
  expansionKey = EXPANSION_RANDOM_KEY
) {
  const names = playerNames || ['你', ...AI_NAMES];
  const N = names.length;
  const isSinglePlayer = !playerNames;
  const expansionPlan = resolveBattleExpansionPlan(expansionKey);
  let deck = mkDeck(expansionPlan.deckExpansionKey);
  let temporaryStarsCallReplacement = null;
  if (expansionPlan.temporaryStarsCall) {
    const replacement = applyTemporaryStarsCallDeckReplacement(deck);
    deck = replacement.deck;
    temporaryStarsCallReplacement = {
      replacedGodKey: replacement.replacedGodKey,
      insertedGodKey: replacement.insertedGodKey,
    };
  }

  // Debug: 强制摸牌
  let targetCard = null;
  if (isSinglePlayer && (debugForceCard || (debugForceCardType && (debugForceZoneCardKey || debugForceGodCardKey))) && isDebugForceCardTargetAllowed(debugForceCardTarget, isSinglePlayer)) {

    if (debugForceCardType === 'zone' && debugForceZoneCardKey && debugForceZoneCardName) {
      // 查找指定编号和牌面的区域牌
      targetCard = deck.find(card => card.key === debugForceZoneCardKey && card.name === debugForceZoneCardName)
        || createDebugZoneCard(deck, debugForceZoneCardKey, debugForceZoneCardName, expansionPlan.deckExpansionKey);
    } else if (debugForceCardType === 'god' && debugForceGodCardKey) {
      // 查找指定类型的神牌
      targetCard = deck.find(card => card.isGod && card.godKey === debugForceGodCardKey)
        || createDebugGodCard(deck, debugForceGodCardKey, expansionPlan.deckExpansionKey);
    } else if (debugForceCard) {
      // 兼容旧的设置方式
      targetCard = deck.find(card => card.key === debugForceCard);
    }

    if (targetCard) {
      // 从牌堆中移除目标牌，暂时保留
      deck = deck.filter(card => card.id !== targetCard.id);
    }
  }

  const roles = mkRoles(N, isSinglePlayer);
  if (
    isSinglePlayer &&
    [ROLE_TREASURE, ROLE_HUNTER, ROLE_CULTIST].includes(debugPlayerRole)
  ) {
    roles[0] = debugPlayerRole;
  }
  const players = names.map((name, i) => ({
    id: i,
    name,
    role: roles[i],
    roleRevealed: false,
    hp: 10,
    san: 10,
    hand: [],
    zoneCards: [],
    isDead: false,
    isResting: false,
    godEncounters: 0,
    godZone: [],
    godName: null,
    godLevel: 0,
    peekMemories: {},
    disableRest: false,
    disableSkill: false,
    handLimitDecrease: 0,
    disableRestNextTurn: false,
    disableSkillNextTurn: false,
    handLimitDecreaseNextTurn: 0
  }));

  // 发初始手牌
  for (let r = 0; r < INITIAL_HAND_SIZE; r++) players.forEach(p => p.hand.push(deck.shift()));

  const inspectionDeck = shuffle([...INSPECTION_DECK]);
  const base = {
    players, deck, discard: [], inspectionDeck, inspectionDiscard: [], currentTurn: -1, phase: 'DRAW_REVEAL', drawReveal: null, selectedCard: null, abilityData: {}, log: [`游戏开始。每人获得${zhCount(INITIAL_HAND_SIZE)}张初始手牌。`], gameOver: null, skillUsed: false, restUsed: false, multiplyUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, globalOnlySwapOwner: null, geomagneticReversalActive: false, apophisNight: null, expansionKey: expansionPlan.expansionKey, deckExpansionKey: expansionPlan.deckExpansionKey, temporaryStarsCallReplacement, _turnKey: 0, _isMP: !!playerNames, turn: 0, turnDirection: 1, sealLooseningCount: 0, houndsOfTindalosActive: false, houndsOfTindalosTarget: null, houndsOfTindalosElapsed: 0, debugForceCard: targetCard, debugForceCardTarget
  };
  base.debugForceCardKeep = playerNames ? 'auto' : debugForceCardKeep;
  return startNextTurn(base);
}
