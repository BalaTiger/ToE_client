import {
  FIXED_ZONE_CARD_VARIANTS_BY_KEY,
  LETTERS,
  NUMS,
  GOD_DEFS,
} from '../../constants/card';
import {
  ROLE_TREASURE,
  ROLE_HUNTER,
  ROLE_CULTIST,
} from '../coreUtils';

let _testId = 0;
export function nextId() {
  return _testId++;
}

export function resetIds() {
  _testId = 0;
}

export function makePlayer(overrides = {}) {
  return {
    id: `p-${nextId()}`,
    name: `测试角色${nextId()}`,
    role: ROLE_TREASURE,
    hp: 10,
    san: 10,
    hand: [],
    godZone: [],
    zoneCards: [],
    peekMemories: {},
    godName: null,
    godLevel: 0,
    hasBelievedGod: false,
    isDead: false,
    roleRevealed: false,
    revealHand: false,
    isResting: false,
    damageLink: null,
    disableRestNextTurn: false,
    disableSkillNextTurn: false,
    handLimitDecreaseNextTurn: 0,
    ...overrides,
  };
}

export function makeZoneCard(slotKey, variantIndex = 0, overrides = {}) {
  const variants = FIXED_ZONE_CARD_VARIANTS_BY_KEY[slotKey];
  if (!variants || !variants[variantIndex]) {
    throw new Error(`Unknown zone card key ${slotKey} variant ${variantIndex}`);
  }
  const def = variants[variantIndex];
  const [letter, ...numParts] = slotKey;
  const number = parseInt(numParts.join(''), 10);
  return {
    ...def,
    id: nextId(),
    key: slotKey,
    letter,
    number,
    isZone: true,
    ...overrides,
  };
}

export function makeGodCard(godKey = 'NYA', overrides = {}) {
  return {
    id: nextId(),
    isGod: true,
    godKey,
    key: godKey,
    type: 'god',
    needsTarget: false,
    ...GOD_DEFS[godKey],
    ...overrides,
  };
}

export function makeBlankZoneCard(overrides = {}) {
  return {
    id: nextId(),
    name: '空白区域牌',
    type: 'blankZone',
    isZone: true,
    letter: 'A',
    number: 1,
    key: 'A1',
    polarity: 'neutral',
    ...overrides,
  };
}

export function makeGs(overrides = {}) {
  return {
    players: [],
    deck: [],
    discard: [],
    currentTurn: 0,
    phase: 'ACTION',
    drawReveal: null,
    abilityData: {},
    gameOver: null,
    log: [],
    turn: 1,
    ...overrides,
  };
}

export function makeFullDeck() {
  const deck = [];
  for (const slotKey of Object.keys(FIXED_ZONE_CARD_VARIANTS_BY_KEY)) {
    const variants = FIXED_ZONE_CARD_VARIANTS_BY_KEY[slotKey];
    for (const def of variants) {
      const [letter, ...numParts] = slotKey;
      const number = parseInt(numParts.join(''), 10);
      deck.push({
        ...def,
        id: nextId(),
        key: slotKey,
        letter,
        number,
        isZone: true,
      });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push(makeGodCard('NYA'));
  }
  for (let i = 0; i < 4; i++) {
    deck.push(makeGodCard('CTH'));
  }
  return deck;
}

export function makeStandardPlayers(count = 5, overrides = []) {
  const roles = [ROLE_TREASURE, ROLE_HUNTER, ROLE_CULTIST];
  const players = [];
  for (let i = 0; i < count; i++) {
    players.push(makePlayer({
      role: roles[i % roles.length],
      ...(overrides[i] || {}),
    }));
  }
  return players;
}
