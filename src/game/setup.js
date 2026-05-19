import {
  FIXED_ZONE_CARD_VARIANTS_BY_KEY,
  LETTERS,
  NUMS,
  GOD_DEFS,
  AI_NAMES,
  ROLE_TREASURE,
  ROLE_HUNTER,
  ROLE_CULTIST,
} from '../constants/card';
import { shuffle } from './coreUtils';

export function mkDeck() {
  let id = 0;
  const zoneCards = LETTERS.flatMap(letter => NUMS.flatMap(number => {
    const key = `${letter}${number}`;
    return (FIXED_ZONE_CARD_VARIANTS_BY_KEY[key] || []).map(cardDef => ({
      ...cardDef,
      id: id++,
      key,
      letter,
      number,
      isZone: true,
    }));
  }));

  const godCards = [
    ...Array(4).fill(0).map(() => ({
      id: id++,
      isGod: true,
      godKey: 'NYA',
      key: 'NYA',
      type: 'god',
      needsTarget: false,
      ...GOD_DEFS.NYA,
    })),
    ...Array(4).fill(0).map(() => ({
      id: id++,
      isGod: true,
      godKey: 'CTH',
      key: 'CTH',
      type: 'god',
      needsTarget: false,
      ...GOD_DEFS.CTH,
    })),
  ];

  return shuffle([...zoneCards, ...godCards]);
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

export const INSPECTION_DECK = [
  ...Array(4).fill({ name: '乱抓', effect: 'adjacentDamageHP', value: 1, type: 'negative' }),
  ...Array(4).fill({ name: '自残', effect: 'selfDamageHP', value: 1, type: 'negative' }),
  ...Array(4).fill({ name: '失眠', effect: 'disableRest', value: 1, type: 'negative' }),
  ...Array(2).fill({ name: '暂时的平静', effect: 'nothing', value: 0, type: 'neutral' }),
  ...Array(2).fill({ name: '昏睡', effect: 'flip', value: 1, type: 'negative' }),
  ...Array(2).fill({ name: '迫害妄想', effect: 'discardRandom', value: 1, type: 'negative' }),
  ...Array(2).fill({ name: '失忆', effect: 'disableSkill', value: 1, type: 'negative' }),
  ...Array(2).fill({ name: '乏力', effect: 'handLimitDecrease', value: 1, type: 'negative' }),
  { name: '超人意志', effect: 'healSAN', value: 1, type: 'positive' },
  { name: '揭开真相', effect: 'drawCard', value: 1, type: 'positive' },
  { name: '封印松动', effect: 'sealLoosening', value: 1, type: 'negative' },
  { name: '廷达罗斯猎犬', effect: 'houndsOfTindalos', value: 1, type: 'negative' }
];

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
  startNextTurn
) {
  const names = playerNames || ['你', ...AI_NAMES];
  const N = names.length;
  const isSinglePlayer = !playerNames;
  let deck = mkDeck();

  // Debug: 强制摸牌
  let targetCard = null;
  if ((debugForceCard || (debugForceCardType && (debugForceZoneCardKey || debugForceGodCardKey))) && (debugForceCardTarget === 'player' || debugForceCardTarget === 'ai1')) {

    if (debugForceCardType === 'zone' && debugForceZoneCardKey && debugForceZoneCardName) {
      // 查找指定编号和牌面的区域牌
      targetCard = deck.find(card => card.key === debugForceZoneCardKey && card.name === debugForceZoneCardName);
    } else if (debugForceCardType === 'god' && debugForceGodCardKey) {
      // 查找指定类型的神牌
      targetCard = deck.find(card => card.isGod && card.godKey === debugForceGodCardKey);
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
  for (let r = 0; r < 4; r++) players.forEach(p => p.hand.push(deck.shift()));

  const inspectionDeck = shuffle([...INSPECTION_DECK]);
  const base = {
    players, deck, discard: [], inspectionDeck, inspectionDiscard: [], currentTurn: -1, phase: 'DRAW_REVEAL', drawReveal: null, selectedCard: null, abilityData: {}, log: ['游戏开始。每人获得四张初始手牌。'], gameOver: null, skillUsed: false, restUsed: false, huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, globalOnlySwapOwner: null, _turnKey: 0, _isMP: !!playerNames, turn: 0, sealLooseningCount: 0, houndsOfTindalosActive: false, houndsOfTindalosTarget: null, houndsOfTindalosElapsed: 0, debugForceCard: targetCard, debugForceCardTarget
  };
  base.debugForceCardKeep = playerNames ? 'auto' : debugForceCardKeep;
  return startNextTurn(base);
}
