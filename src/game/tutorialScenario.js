import {
  FIXED_ZONE_CARD_VARIANTS_BY_KEY,
  GOD_DEFS,
  INSPECTION_DECK,
} from '../constants/card';
import { DEFAULT_EXPANSION_KEY, mkDeck } from './setup';
import { ROLE_CULTIST, ROLE_HUNTER, ROLE_TREASURE, copyPlayers, shuffle } from './coreUtils';

export const TUTORIAL_FLOW = {
  INTRO: 'intro',
  BOARD_SELF: 'boardSelf',
  BOARD_STATS: 'boardStats',
  BOARD_ROLE: 'boardRole',
  BOARD_HAND: 'boardHand',
  BOARD_DECKS: 'boardDecks',
  CARD_TYPES: 'cardTypes',
  HUNTER_GOAL: 'hunterGoal',
  CULTIST_INTRO_RULES: 'cultistIntroRules',
  CULTIST_GOAL_RULES: 'cultistGoalRules',
  DRAW_ZONE_CARD: 'drawZoneCard',
  DRAW_GOD_CARD: 'drawGodCard',
  TREASURE_INTRO: 'treasureIntro',
  TREASURE_USE_SKILL: 'treasureUseSkill',
  TREASURE_SELECT_TARGET: 'treasureSelectTarget',
  TREASURE_STEAL_CARD: 'treasureStealCard',
  TREASURE_GIVE_CARD: 'treasureGiveCard',
  TREASURE_RESULT: 'treasureResult',
  HUNTER_INTRO: 'hunterIntro',
  HUNTER_USE_SKILL: 'hunterUseSkill',
  HUNTER_SELECT_TARGET: 'hunterSelectTarget',
  HUNTER_REVEAL: 'hunterReveal',
  HUNTER_CONFIRM_CARD: 'hunterConfirmCard',
  HUNTER_RESULT: 'hunterResult',
  CULTIST_ZONE_INTRO: 'cultistZoneIntro',
  CULTIST_ZONE_SELECT_CARD: 'cultistZoneSelectCard',
  CULTIST_ZONE_SELECT_TARGET: 'cultistZoneSelectTarget',
  CULTIST_ZONE_RESULT: 'cultistZoneResult',
  CULTIST_GOD_INTRO: 'cultistGodIntro',
  CULTIST_GOD_SELECT_CARD: 'cultistGodSelectCard',
  CULTIST_GOD_SELECT_TARGET: 'cultistGodSelectTarget',
  CULTIST_GOD_RESULT: 'cultistGodResult',
  COMPLETE: 'complete',
};

const BASE_STEPS = [
  {
    id: TUTORIAL_FLOW.INTRO,
    title: '遗迹入口',
    body: [
      '这么说吧，你此行的目标是一个危险的遗迹，遗迹里有着…很可怕的东西。',
      '这里会显示你的当前状态，当HP归零，你就会倒下。',
    ],
    highlight: 'selfPanel',
    lock: true,
    next: TUTORIAL_FLOW.BOARD_SELF,
  },
  {
    id: TUTORIAL_FLOW.BOARD_SELF,
    title: '心智',
    body: 'HP下方是你的SAN值，象征心智。',
    highlight: 'selfPanel',
    lock: true,
    next: TUTORIAL_FLOW.BOARD_STATS,
  },
  {
    id: TUTORIAL_FLOW.BOARD_STATS,
    title: '丧失心智',
    body: [
      '当一个人完全丧失心智，被遗迹里那些邪祟占据身体，所有人都会大祸临头！',
      '哦，不过邪祀者可能会挺高兴…',
    ],
    highlight: 'selfPanel',
    lock: true,
    next: TUTORIAL_FLOW.BOARD_ROLE,
  },
  {
    id: TUTORIAL_FLOW.BOARD_ROLE,
    title: '身份',
    body: [
      '说到邪祀者，你知道你这次的身份吗？',
      '每次探索中你的身份都有可能不一样。不知道的话，你可要记好了：',
    ],
    highlight: 'roleText',
    lock: true,
    next: TUTORIAL_FLOW.BOARD_HAND,
  },
  {
    id: TUTORIAL_FLOW.BOARD_HAND,
    title: '寻宝者',
    body: [
      '首先是寻宝者。他们贪婪、无惧危险，进入遗迹只为独占宝藏。他们不会跟任何人合作，包括其他寻宝者。',
      '至于他们大闹一通后，邪恶的古神会不会第二天就复活？他们才不管。',
    ],
    highlight: 'center',
    lock: true,
    next: TUTORIAL_FLOW.BOARD_DECKS,
  },
  {
    id: TUTORIAL_FLOW.BOARD_DECKS,
    title: '宝藏',
    body: [
      '你问我如何寻得宝藏？翻遍所有地方，就这么简单。',
      '先驱在遗迹地图上标记了ABCD四列、1234四行。如果你是寻宝者，手牌中有所有列和所有行的编号，你就赢了。',
    ],
    highlight: 'handArea',
    lock: true,
    next: TUTORIAL_FLOW.CARD_TYPES,
  },
  {
    id: TUTORIAL_FLOW.CARD_TYPES,
    title: '追猎者',
    body: [
      '接着是追猎者，他们团结一心，是遗迹的卫士。',
      '所有闯入者，都是他们的敌人，是可能复活邪神的潜在威胁。',
    ],
    highlight: 'center',
    lock: true,
    next: TUTORIAL_FLOW.HUNTER_GOAL,
  },
  {
    id: TUTORIAL_FLOW.HUNTER_GOAL,
    title: '肃清',
    body: '如果你是追猎者，你要肃清所有非追猎者角色，将他们的HP全部清零，就能获胜。',
    highlight: 'opponentPanel',
    lock: true,
    next: TUTORIAL_FLOW.CULTIST_INTRO_RULES,
  },
  {
    id: TUTORIAL_FLOW.CULTIST_INTRO_RULES,
    title: '邪祀者',
    body: '最后是邪祀者，他们一心复活邪神，基于利害关系相互合作，精于算计他人。',
    highlight: 'center',
    lock: true,
    next: TUTORIAL_FLOW.CULTIST_GOAL_RULES,
  },
  {
    id: TUTORIAL_FLOW.CULTIST_GOAL_RULES,
    title: '复苏',
    body: [
      '如果你是邪祀者，你要专注于腐化一名角色的心智。当他SAN值清零，被邪神占据身体，你就赢了。',
      '当然，如果你准备自己丧失心智，成为邪神的宿主…那也未尝不可。',
    ],
    highlight: 'opponentPanel',
    lock: true,
    next: TUTORIAL_FLOW.DRAW_ZONE_CARD,
  },
  {
    id: TUTORIAL_FLOW.DRAW_ZONE_CARD,
    title: '探索',
    body: '每回合你将从牌堆摸一张牌，探索一个新区域，同时也会发生随机事件。',
    highlight: 'deckArea',
    lock: true,
    next: TUTORIAL_FLOW.DRAW_GOD_CARD,
  },
  {
    id: TUTORIAL_FLOW.DRAW_GOD_CARD,
    title: '邪神化身',
    body: [
      '也有可能，你遇到的不是新区域，而是邪神的化身。',
      '是否信仰祂，分享祂的权能，取决于你。小心越陷越深。',
    ],
    highlight: 'deckArea',
    lock: true,
    next: TUTORIAL_FLOW.TREASURE_INTRO,
    setup: 'treasure',
  },
];

const SKILL_STEPS = [
  {
    id: TUTORIAL_FLOW.TREASURE_INTRO,
    title: '寻宝者：只差一步',
    body: '你现在扮演寻宝者。你的手牌已经接近完整宝藏，只差对手手里那张编号。',
    highlight: 'handArea',
    lock: true,
    next: TUTORIAL_FLOW.TREASURE_USE_SKILL,
  },
  {
    id: TUTORIAL_FLOW.TREASURE_USE_SKILL,
    title: '发动掉包',
    body: '点击行动区的“掉包”。本教学局会固定让这次掉包集齐宝藏。',
    highlight: 'skillButton',
    lock: false,
    allowedAction: { type: 'useSkill' },
  },
  {
    id: TUTORIAL_FLOW.TREASURE_SELECT_TARGET,
    title: '选择目标',
    body: '选择对手。正式对局里你未必知道对方手里有什么，但这次目标牌已经安排好了。',
    highlight: 'opponentPanel',
    lock: false,
    allowedAction: { type: 'selectTarget', pid: 1 },
  },
  {
    id: TUTORIAL_FLOW.TREASURE_STEAL_CARD,
    title: '抽取对手手牌',
    body: '点击高亮的对手手牌。教学局中这张牌会补齐你的最后一个编号。',
    highlight: 'swapBlind',
    lock: false,
    allowedAction: { type: 'swapSteal', cardIndex: 0 },
  },
  {
    id: TUTORIAL_FLOW.TREASURE_GIVE_CARD,
    title: '交还一张牌',
    body: '掉包不是白拿。把指定手牌还给对手，完成交换。',
    highlight: 'handArea',
    lock: false,
    allowedAction: { type: 'handCard', cardId: 'tut-treasure-give' },
  },
  {
    id: TUTORIAL_FLOW.TREASURE_RESULT,
    title: '宝藏完成',
    body: '这就是寻宝者最理想的掉包：换到缺失编号并立刻完成胜利条件。教学局会继续切换到追猎者。',
    highlight: 'handArea',
    lock: true,
    next: TUTORIAL_FLOW.HUNTER_INTRO,
    setup: 'hunter',
  },
  {
    id: TUTORIAL_FLOW.HUNTER_INTRO,
    title: '追猎者：确认猎物',
    body: '现在你扮演追猎者。对手已经残血，且你手中有一张牌能匹配对手即将亮出的编号。',
    highlight: 'opponentPanel',
    lock: true,
    next: TUTORIAL_FLOW.HUNTER_USE_SKILL,
  },
  {
    id: TUTORIAL_FLOW.HUNTER_USE_SKILL,
    title: '发动追捕',
    body: '点击“追捕”。追猎者可以通过匹配编号造成伤害。',
    highlight: 'skillButton',
    lock: false,
    allowedAction: { type: 'useSkill' },
  },
  {
    id: TUTORIAL_FLOW.HUNTER_SELECT_TARGET,
    title: '选择猎物',
    body: '点击残血对手。',
    highlight: 'opponentPanel',
    lock: false,
    allowedAction: { type: 'selectTarget', pid: 1 },
  },
  {
    id: TUTORIAL_FLOW.HUNTER_REVEAL,
    title: '对手亮牌',
    body: '对手亮出了编号 A1。你需要弃出同编号手牌来完成追捕。',
    highlight: 'opponentPanel',
    lock: true,
    next: TUTORIAL_FLOW.HUNTER_CONFIRM_CARD,
  },
  {
    id: TUTORIAL_FLOW.HUNTER_CONFIRM_CARD,
    title: '弃牌造成伤害',
    body: '点击你手中的 A1。教学局中的对手 HP 已经低到会被这次追捕击倒。',
    highlight: 'handArea',
    lock: false,
    allowedAction: { type: 'handCard', cardId: 'tut-hunter-match' },
  },
  {
    id: TUTORIAL_FLOW.HUNTER_RESULT,
    title: '猎物倒下',
    body: '追捕成功会造成 HP 伤害。追猎者要不断压缩其他身份的生存空间。',
    highlight: 'opponentPanel',
    lock: true,
    next: TUTORIAL_FLOW.CULTIST_ZONE_INTRO,
    setup: 'cultistZone',
  },
  {
    id: TUTORIAL_FLOW.CULTIST_ZONE_INTRO,
    title: '邪祀者：蛊惑区域牌',
    body: '现在你扮演邪祀者。第一步先用区域牌压低对手 SAN。',
    highlight: 'handArea',
    lock: true,
    next: TUTORIAL_FLOW.CULTIST_ZONE_SELECT_CARD,
  },
  {
    id: TUTORIAL_FLOW.CULTIST_ZONE_SELECT_CARD,
    title: '选择蛊惑牌',
    body: '点击“蛊惑”，然后选择手中的幽闭恐惧。它会让相邻角色失去 SAN。',
    highlight: 'handArea',
    lock: false,
    allowedAction: { type: 'useSkillOrHandCard', cardId: 'tut-cult-zone' },
  },
  {
    id: TUTORIAL_FLOW.CULTIST_ZONE_SELECT_TARGET,
    title: '选择目标',
    body: '把这张区域牌赠予低 SAN 对手。',
    highlight: 'opponentPanel',
    lock: false,
    allowedAction: { type: 'selectTarget', pid: 1 },
  },
  {
    id: TUTORIAL_FLOW.CULTIST_ZONE_RESULT,
    title: 'SAN 归零',
    body: '区域牌也能成为蛊惑的武器。对手 SAN 被压到零时，邪祀者就接近胜利。',
    highlight: 'opponentPanel',
    lock: true,
    next: TUTORIAL_FLOW.CULTIST_GOD_INTRO,
    setup: 'cultistGod',
  },
  {
    id: TUTORIAL_FLOW.CULTIST_GOD_INTRO,
    title: '邪神牌、骷髅头与改信',
    body: '第二步演示邪神牌。对手已有信仰和骷髅头：遭遇邪神的 SAN 损失，加上改信额外 SAN-1，会刚好归零。',
    highlight: 'opponentPanel',
    lock: true,
    next: TUTORIAL_FLOW.CULTIST_GOD_SELECT_CARD,
  },
  {
    id: TUTORIAL_FLOW.CULTIST_GOD_SELECT_CARD,
    title: '蛊惑邪神牌',
    body: '点击“蛊惑”，选择手中的弗栗多。',
    highlight: 'handArea',
    lock: false,
    allowedAction: { type: 'useSkillOrHandCard', cardId: 'tut-cult-god' },
  },
  {
    id: TUTORIAL_FLOW.CULTIST_GOD_SELECT_TARGET,
    title: '强迫改信',
    body: '选择已经信仰烛九阴的对手。不同邪神会触发改信额外 SAN 损失。',
    highlight: 'opponentPanel',
    lock: false,
    allowedAction: { type: 'selectTarget', pid: 1 },
  },
  {
    id: TUTORIAL_FLOW.CULTIST_GOD_RESULT,
    title: '邪神复苏',
    body: '这次归零来自“骷髅头遭遇损失 + 改信损失”的合计。正式对局中，邪祀者要主动制造这种临界点。',
    highlight: 'opponentPanel',
    lock: true,
    next: TUTORIAL_FLOW.COMPLETE,
  },
  {
    id: TUTORIAL_FLOW.COMPLETE,
    title: '开始正式对局',
    body: '三种身份的关键行动已经演示完毕。接下来进入完整五人对局，真正的试探才刚开始。',
    highlight: 'center',
    lock: true,
    complete: true,
  },
];

export const TUTORIAL_STEPS = [...BASE_STEPS, ...SKILL_STEPS];
export const TUTORIAL_STEP_BY_ID = Object.fromEntries(TUTORIAL_STEPS.map(step => [step.id, step]));

export function getTutorialStep(id) {
  return TUTORIAL_STEP_BY_ID[id] || TUTORIAL_STEP_BY_ID[TUTORIAL_FLOW.INTRO];
}

function zoneCard(slotKey, name, id) {
  const def = (FIXED_ZONE_CARD_VARIANTS_BY_KEY[slotKey] || []).find(card => card.name === name);
  return {
    ...def,
    id,
    key: slotKey,
    letter: slotKey[0],
    number: Number(slotKey.slice(1)),
    isZone: true,
  };
}

function godCard(godKey, id) {
  return {
    ...GOD_DEFS[godKey],
    id,
    key: godKey,
    godKey,
    isGod: true,
    type: 'god',
    needsTarget: false,
  };
}

function playerBase(id, name, role) {
  return {
    id,
    name,
    role,
    roleRevealed: true,
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
    handLimitDecreaseNextTurn: 0,
  };
}

function tutorialDeck(excludedIds = []) {
  const excluded = new Set(excludedIds);
  return mkDeck(DEFAULT_EXPANSION_KEY).filter(card => !excluded.has(card.id));
}

function baseTutorialState(players, log) {
  return {
    players,
    deck: tutorialDeck(players.flatMap(p => p.hand.map(c => c.id))),
    discard: [],
    inspectionDeck: shuffle([...INSPECTION_DECK]),
    inspectionDiscard: [],
    currentTurn: 0,
    phase: 'ACTION',
    drawReveal: null,
    selectedCard: null,
    abilityData: {},
    log,
    gameOver: null,
    skillUsed: false,
    restUsed: false,
    multiplyUsed: false,
    huntAbandoned: [],
    godFromHandUsed: false,
    godTriggeredThisTurn: false,
    globalOnlySwapOwner: null,
    geomagneticReversalActive: false,
    apophisNight: null,
    expansionKey: DEFAULT_EXPANSION_KEY,
    deckExpansionKey: DEFAULT_EXPANSION_KEY,
    temporaryStarsCallReplacement: null,
    _turnKey: 1,
    _isMP: false,
    _isTutorial: true,
    turn: 1,
    turnDirection: 1,
    sealLooseningCount: 0,
    houndsOfTindalosActive: false,
    houndsOfTindalosTarget: null,
    houndsOfTindalosElapsed: 0,
  };
}

export function createTutorialScenario(kind = 'treasure') {
  if (kind === 'hunter') {
    const player = playerBase(0, '你', ROLE_HUNTER);
    const opponent = playerBase(1, '贝拉', ROLE_TREASURE);
    player.hand = [
      { ...zoneCard('A1', '霉变食物', 'tut-hunter-match'), id: 'tut-hunter-match' },
      zoneCard('B2', '新鲜空气', 'tut-hunter-extra-1'),
      zoneCard('C3', '地动山摇', 'tut-hunter-extra-2'),
    ];
    opponent.hp = 3;
    opponent.hand = [
      zoneCard('A1', '解读石刻', 'tut-hunter-reveal'),
      zoneCard('D4', '斯芬克斯', 'tut-hunter-target-extra'),
    ];
    return baseTutorialState([player, opponent], ['教学局：你现在扮演追猎者。对手 HP 已被压低。']);
  }

  if (kind === 'cultistZone') {
    const player = playerBase(0, '你', ROLE_CULTIST);
    const opponent = playerBase(1, '贝拉', ROLE_TREASURE);
    player.hand = [
      { ...zoneCard('B1', '幽闭恐惧', 'tut-cult-zone'), id: 'tut-cult-zone' },
      zoneCard('C2', '地下泉', 'tut-cult-zone-extra'),
    ];
    opponent.san = 2;
    opponent.hand = [zoneCard('D2', '荆棘山路', 'tut-cult-zone-target')];
    return baseTutorialState([player, opponent], ['教学局：你现在扮演邪祀者。对手 SAN 已进入危险区。']);
  }

  if (kind === 'cultistGod') {
    const player = playerBase(0, '你', ROLE_CULTIST);
    const opponent = playerBase(1, '贝拉', ROLE_TREASURE);
    const zhu = godCard('ZHU', 'tut-target-zhu');
    player.hand = [
      { ...godCard('VRI', 'tut-cult-god'), id: 'tut-cult-god' },
      zoneCard('B2', '新鲜空气', 'tut-cult-god-extra'),
    ];
    opponent.san = 4;
    opponent.godEncounters = 2;
    opponent.godName = 'ZHU';
    opponent.godLevel = 1;
    opponent.godZone = [zhu];
    opponent.hand = [zoneCard('C4', '夜风呼啸', 'tut-cult-god-target')];
    return baseTutorialState([player, opponent], ['教学局：对手已经信仰烛九阴，即将被迫改信。']);
  }

  const player = playerBase(0, '你', ROLE_TREASURE);
  const opponent = playerBase(1, '贝拉', ROLE_HUNTER);
  player.hand = [
    zoneCard('A1', '霉变食物', 'tut-treasure-a1'),
    zoneCard('B2', '新鲜空气', 'tut-treasure-b2'),
    zoneCard('C3', '地动山摇', 'tut-treasure-c3'),
    { ...zoneCard('A2', '蚂蚁虽小', 'tut-treasure-give'), id: 'tut-treasure-give' },
  ];
  opponent.hand = [
    zoneCard('D4', '斯芬克斯', 'tut-treasure-target-d4'),
    zoneCard('B1', '圣甲虫', 'tut-treasure-target-extra'),
  ];
  return baseTutorialState([player, opponent], ['教学局：你现在扮演寻宝者，只差 D4 就能集齐宝藏。']);
}

export function shouldAllowTutorialAction(stepId, action) {
  const step = getTutorialStep(stepId);
  const allowed = step.allowedAction;
  if (!allowed) return false;
  if (allowed.type === 'useSkillOrHandCard') {
    return action.type === 'useSkill' || (action.type === 'handCard' && action.cardId === allowed.cardId);
  }
  if (allowed.type !== action.type) return false;
  if (allowed.pid != null && allowed.pid !== action.pid) return false;
  if (allowed.cardIndex != null && allowed.cardIndex !== action.cardIndex) return false;
  if (allowed.cardId != null && allowed.cardId !== action.cardId) return false;
  return true;
}

export function nextTutorialStepAfterAction(stepId, action) {
  if (stepId === TUTORIAL_FLOW.TREASURE_USE_SKILL && action.type === 'useSkill') return TUTORIAL_FLOW.TREASURE_SELECT_TARGET;
  if (stepId === TUTORIAL_FLOW.TREASURE_SELECT_TARGET && action.type === 'selectTarget') return TUTORIAL_FLOW.TREASURE_STEAL_CARD;
  if (stepId === TUTORIAL_FLOW.TREASURE_STEAL_CARD && action.type === 'swapSteal') return TUTORIAL_FLOW.TREASURE_GIVE_CARD;
  if (stepId === TUTORIAL_FLOW.TREASURE_GIVE_CARD && action.type === 'handCard') return TUTORIAL_FLOW.TREASURE_RESULT;
  if (stepId === TUTORIAL_FLOW.HUNTER_USE_SKILL && action.type === 'useSkill') return TUTORIAL_FLOW.HUNTER_SELECT_TARGET;
  if (stepId === TUTORIAL_FLOW.HUNTER_SELECT_TARGET && action.type === 'selectTarget') return TUTORIAL_FLOW.HUNTER_REVEAL;
  if (stepId === TUTORIAL_FLOW.HUNTER_CONFIRM_CARD && action.type === 'handCard') return TUTORIAL_FLOW.HUNTER_RESULT;
  if (stepId === TUTORIAL_FLOW.CULTIST_ZONE_SELECT_CARD && action.type === 'useSkill') return stepId;
  if (stepId === TUTORIAL_FLOW.CULTIST_ZONE_SELECT_CARD && action.type === 'handCard') return TUTORIAL_FLOW.CULTIST_ZONE_SELECT_TARGET;
  if (stepId === TUTORIAL_FLOW.CULTIST_ZONE_SELECT_TARGET && action.type === 'selectTarget') return TUTORIAL_FLOW.CULTIST_ZONE_RESULT;
  if (stepId === TUTORIAL_FLOW.CULTIST_GOD_SELECT_CARD && action.type === 'useSkill') return stepId;
  if (stepId === TUTORIAL_FLOW.CULTIST_GOD_SELECT_CARD && action.type === 'handCard') return TUTORIAL_FLOW.CULTIST_GOD_SELECT_TARGET;
  if (stepId === TUTORIAL_FLOW.CULTIST_GOD_SELECT_TARGET && action.type === 'selectTarget') return TUTORIAL_FLOW.CULTIST_GOD_RESULT;
  return null;
}

export function applyTutorialStepState(currentGs, stepId) {
  const step = getTutorialStep(stepId);
  if (!step.setup) return currentGs;
  return createTutorialScenario(step.setup);
}

export function clearTutorialWinState(gs, stepId) {
  if (!gs?._isTutorial) return gs;
  const resultSteps = new Set([
    TUTORIAL_FLOW.TREASURE_RESULT,
    TUTORIAL_FLOW.HUNTER_RESULT,
    TUTORIAL_FLOW.CULTIST_ZONE_RESULT,
    TUTORIAL_FLOW.CULTIST_GOD_RESULT,
  ]);
  if (!resultSteps.has(stepId)) return gs;
  const players = copyPlayers(gs.players || []).map(player => ({ ...player, _pendingAnimDeath: false }));
  return {
    ...gs,
    players,
    gameOver: null,
    phase: 'ACTION',
    abilityData: {},
    drawReveal: null,
    skillUsed: true,
  };
}
