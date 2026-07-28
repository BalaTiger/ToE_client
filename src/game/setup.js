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
export const TEMPORARY_STARS_CALL_KEY = 'temporary_stars_call';
const STARS_CALL_TEMP_REPLACEMENT_CHANCE = 0.5;
const ROLE_KEYS = [ROLE_TREASURE, ROLE_HUNTER, ROLE_CULTIST];

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
  if (expansionKey === TEMPORARY_STARS_CALL_KEY) {
    return {
      expansionKey: STARS_CALL_KEY,
      deckExpansionKey: DEFAULT_EXPANSION_KEY,
      temporaryStarsCall: true,
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

export function normalizeRoleCounts(roleCounts, N = 5) {
  if (!roleCounts || typeof roleCounts !== 'object') return null;
  const normalized = Object.fromEntries(ROLE_KEYS.map(role => [role, Number(roleCounts[role] || 0)]));
  if (ROLE_KEYS.some(role => !Number.isInteger(normalized[role]) || normalized[role] < 0)) return null;
  if (ROLE_KEYS.reduce((sum, role) => sum + normalized[role], 0) !== N) return null;
  const baseCount = Math.floor(N / 3);
  if (normalized[ROLE_CULTIST] !== baseCount) return null;
  if (normalized[ROLE_TREASURE] < baseCount || normalized[ROLE_HUNTER] < baseCount) return null;
  if (Math.abs(normalized[ROLE_TREASURE] - normalized[ROLE_HUNTER]) > 1) return null;
  return normalized;
}

export function applySelectedLocalRole(state, selectedRole) {
  if (!state || selectedRole === 'random' || !ROLE_KEYS.includes(selectedRole)) return state;
  const previousRole = state.players?.[0]?.role;
  const swapIdx = state.debugFixedRoleCounts && previousRole !== selectedRole
    ? state.players.findIndex((player, index) => index > 0 && player?.role === selectedRole)
    : -1;
  const applyRole = players => Array.isArray(players)
    ? players.map((player, index) => {
      if (index === 0) return { ...player, role: selectedRole };
      if (index === swapIdx) return { ...player, role: previousRole };
      return player;
    })
    : players;
  return {
    ...state,
    players: applyRole(state.players),
    _playersBeforeThisDraw: applyRole(state._playersBeforeThisDraw),
    _preTurnPlayers: applyRole(state._preTurnPlayers),
    _playersBeforeCthDraws: applyRole(state._playersBeforeCthDraws),
  };
}

export function mkRoles(N = 5, isSinglePlayer = false, forcedPlayerRole = null, forcedRoleCounts = null) {
  if (N < 2) throw new Error('游戏人数不能少于2人');

  const normalizedForcedCounts = normalizeRoleCounts(forcedRoleCounts, N);
  if (normalizedForcedCounts) {
    return shuffle(ROLE_KEYS.flatMap(role => Array(normalizedForcedCounts[role]).fill(role)));
  }

  const baseCount = Math.floor(N / 3);
  const remainder = N % 3;
  const counts = {
    [ROLE_TREASURE]: baseCount,
    [ROLE_HUNTER]: baseCount,
    [ROLE_CULTIST]: baseCount,
  };
  if (remainder === 1) {
    const bonusRole = Math.random() < 0.5 ? ROLE_TREASURE : ROLE_HUNTER;
    counts[bonusRole]++;
  } else if (remainder === 2) {
    counts[ROLE_TREASURE]++;
    counts[ROLE_HUNTER]++;
  }
  const shuffledRoles = shuffle(ROLE_KEYS.flatMap(role => Array(counts[role]).fill(role)));
  if (isSinglePlayer && forcedPlayerRole && ROLE_KEYS.includes(forcedPlayerRole)) {
    const forcedIndex = shuffledRoles.indexOf(forcedPlayerRole);
    if (forcedIndex > 0) {
      [shuffledRoles[0], shuffledRoles[forcedIndex]] = [shuffledRoles[forcedIndex], shuffledRoles[0]];
    }
  }
  return shuffledRoles;
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

function isDebugForceCardSwitchEnabled(debugForceCard) {
  if (debugForceCard === true) return true;
  if (typeof debugForceCard !== 'string') return false;
  return ['1', 'true', 'on', 'enabled', 'force'].includes(debugForceCard.trim().toLowerCase());
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
  startNextTurn,
  expansionKey = EXPANSION_RANDOM_KEY,
  options = {}
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
  const structuredDebugForceEnabled = isDebugForceCardSwitchEnabled(debugForceCard);
  const legacyDebugForceCardKey = !structuredDebugForceEnabled && typeof debugForceCard === 'string'
    ? debugForceCard.trim()
    : '';
  if (isSinglePlayer && (structuredDebugForceEnabled || legacyDebugForceCardKey) && isDebugForceCardTargetAllowed(debugForceCardTarget, isSinglePlayer)) {

    if (structuredDebugForceEnabled && debugForceCardType === 'zone' && debugForceZoneCardKey && debugForceZoneCardName) {
      // 查找指定编号和牌面的区域牌
      targetCard = deck.find(card => card.key === debugForceZoneCardKey && card.name === debugForceZoneCardName)
        || createDebugZoneCard(deck, debugForceZoneCardKey, debugForceZoneCardName, expansionPlan.deckExpansionKey);
    } else if (structuredDebugForceEnabled && debugForceCardType === 'god' && debugForceGodCardKey) {
      // 查找指定类型的神牌
      targetCard = deck.find(card => card.isGod && card.godKey === debugForceGodCardKey)
        || createDebugGodCard(deck, debugForceGodCardKey, expansionPlan.deckExpansionKey);
    } else if (legacyDebugForceCardKey) {
      // 兼容旧的设置方式
      targetCard = deck.find(card => card.key === legacyDebugForceCardKey);
    }

    if (targetCard) {
      // 从牌堆中移除目标牌，暂时保留
      deck = deck.filter(card => card.id !== targetCard.id);
    }
  }

  const debugFixedRoleCounts = normalizeRoleCounts(options.roleCounts, N);
  const roles = mkRoles(N, isSinglePlayer, null, debugFixedRoleCounts);
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
    hasBelievedGod: false,
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
    players, deck, discard: [], inspectionDeck, inspectionDiscard: [], currentTurn: -1, phase: 'DRAW_REVEAL', drawReveal: null, selectedCard: null, abilityData: {}, log: [`游戏开始。每人获得${zhCount(INITIAL_HAND_SIZE)}张初始手牌。`], gameOver: null, skillUsed: false, restUsed: false, multiplyUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, globalOnlySwapOwner: null, geomagneticReversalActive: false, apophisNight: null, expansionKey: expansionPlan.expansionKey, deckExpansionKey: expansionPlan.deckExpansionKey, temporaryStarsCallReplacement, debugFixedRoleCounts, _turnKey: 0, _isMP: !!playerNames, turn: 0, turnDirection: 1, sealLooseningCount: 0, houndsOfTindalosActive: false, houndsOfTindalosTarget: null, houndsOfTindalosElapsed: 0, debugForceCard: targetCard, debugForceCardTarget
  };
  base.debugForceCardKeep = playerNames ? 'auto' : debugForceCardKeep;
  return startNextTurn(base, options.turnOptions || {});
}
