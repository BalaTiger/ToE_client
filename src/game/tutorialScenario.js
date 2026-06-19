import {
  FIXED_ZONE_CARD_VARIANTS_BY_KEY,
  GOD_DEFS,
  INSPECTION_DECK,
} from '../constants/card';
import { DEFAULT_EXPANSION_KEY, mkDeck } from './setup';
import { ROLE_CULTIST, ROLE_HUNTER, ROLE_TREASURE, copyPlayers, shuffle } from './coreUtils';

// 引导文本中的术语高亮标记（渲染时由 InGameTutorialOverlay 替换为 React 元素）
const HP = '[HP]';
const SAN = '[SAN]';
const CULTIST = '[邪祀者]';
const TREASURE = '[寻宝者]';
const HUNTER = '[追猎者]';
const SWAP = '[掉包]';
const HUNT = '[追捕]';
const BEWITCH = '[蛊惑]';
const SKILL = '[技能]';
const GOLD = (text) => `[${text}]`;
const GOD = (text) => `[${text}]`;

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
  TREASURE_START_TURN: 'treasureStartTurn',
  TREASURE_DRAW_CARD: 'treasureDrawCard',
  TREASURE_DRAW_REVEAL: 'treasureDrawReveal',
  TREASURE_DODGE_PROMPT: 'treasureDodgePrompt',
  TREASURE_DODGE_ROLL: 'treasureDodgeRoll',
  TREASURE_DODGE_RESULT: 'treasureDodgeResult',
  TREASURE_USE_SKILL: 'treasureUseSkill',
  TREASURE_SELECT_TARGET: 'treasureSelectTarget',
  TREASURE_STEAL_CARD: 'treasureStealCard',
  TREASURE_GIVE_CARD: 'treasureGiveCard',
  TREASURE_MAP_ANIM: 'treasureMapAnim',
  TREASURE_RESULT: 'treasureResult',
  HUNTER_INTRO: 'hunterIntro',
  HUNTER_USE_SKILL: 'hunterUseSkill',
  HUNTER_SELECT_TARGET: 'hunterSelectTarget',
  HUNTER_REVEAL: 'hunterReveal',
  HUNTER_CONFIRM_CARD: 'hunterConfirmCard',
  HUNTER_SECOND_HUNT_INTRO: 'hunterSecondHuntIntro',
  HUNTER_USE_SKILL_2: 'hunterUseSkill2',
  HUNTER_SELECT_TARGET_2: 'hunterSelectTarget2',
  HUNTER_REVEAL_2: 'hunterReveal2',
  HUNTER_CONFIRM_CARD_2: 'hunterConfirmCard2',
  HUNTER_RESULT: 'hunterResult',
  CULTIST_ZONE_INTRO: 'cultistZoneIntro',
  CULTIST_ZONE_USE_SKILL: 'cultistZoneUseSkill',
  CULTIST_ZONE_SELECT_CARD: 'cultistZoneSelectCard',
  CULTIST_ZONE_SELECT_TARGET: 'cultistZoneSelectTarget',
  CULTIST_ZONE_RESULT: 'cultistZoneResult',
  CULTIST_GOD_INTRO: 'cultistGodIntro',
  CULTIST_GOD_STATUS_MARKERS: 'cultistGodStatusMarkers',
  CULTIST_GOD_OPPONENT_DRAW_START: 'cultistGodOpponentDrawStart',
  CULTIST_GOD_OPPONENT_DRAW: 'cultistGodOpponentDraw',
  CULTIST_GOD_CHECK_INTRO: 'cultistGodCheckIntro',
  CULTIST_GOD_CONVERT_CHECK: 'cultistGodConvertCheck',
  CULTIST_GOD_CONVERT_RESOLVE: 'cultistGodConvertResolve',
  CULTIST_GOD_PLAYER_DRAW: 'cultistGodPlayerDraw',
  CULTIST_GOD_KEEP_HAND: 'cultistGodKeepHand',
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
      `这里会显示你的当前状态，当${HP}归零，你就会倒下。`,
    ],
    highlight: 'selfPanel',
    lock: true,
    next: TUTORIAL_FLOW.BOARD_SELF,
  },
  {
    id: TUTORIAL_FLOW.BOARD_SELF,
    title: '心智',
    body: `${HP}下方是你的${SAN}值，象征心智。`,
    highlight: 'selfPanel',
    lock: true,
    next: TUTORIAL_FLOW.BOARD_STATS,
  },
  {
    id: TUTORIAL_FLOW.BOARD_STATS,
    title: '丧失心智',
    body: [
      '当一个人完全丧失心智，被遗迹里那些邪祟占据身体，所有人都会大祸临头！',
      `哦，不过${CULTIST}可能会挺高兴…`,
    ],
    highlight: 'selfPanel',
    lock: true,
    next: TUTORIAL_FLOW.BOARD_ROLE,
  },
  {
    id: TUTORIAL_FLOW.BOARD_ROLE,
    title: '身份',
    body: [
      `说到${CULTIST}，你知道你这次的${GOLD('身份')}吗？`,
      `每次探索中你的${GOLD('身份')}都有可能不一样。不知道的话，你可要记好了：`,
    ],
    highlight: 'roleText',
    lock: true,
    next: TUTORIAL_FLOW.BOARD_HAND,
  },
  {
    id: TUTORIAL_FLOW.BOARD_HAND,
    title: '寻宝者',
    body: [
      `首先是${TREASURE}。他们贪婪、无惧危险，进入遗迹只为独占${GOLD('宝藏')}。他们不会跟任何人合作，包括其他${TREASURE}。`,
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
      `你问我如何寻得${GOLD('宝藏')}？翻遍所有地方，就这么简单。`,
      `先驱在遗迹地图上标记了ABCD四列、1234四行。如果你是${TREASURE}，手牌中有${GOLD('所有列和所有行')}的编号，你就赢了。`,
    ],
    highlight: 'handArea',
    lock: true,
    next: TUTORIAL_FLOW.CARD_TYPES,
  },
  {
    id: TUTORIAL_FLOW.CARD_TYPES,
    title: '追猎者',
    body: [
      `接着是${HUNTER}，他们${GOLD('团结一心')}，是遗迹的卫士。`,
      '所有闯入者，都是他们的敌人，是可能复活邪神的潜在威胁。',
    ],
    highlight: 'center',
    lock: true,
    next: TUTORIAL_FLOW.HUNTER_GOAL,
  },
  {
    id: TUTORIAL_FLOW.HUNTER_GOAL,
    title: '肃清',
    body: `如果你是${HUNTER}，你要肃清所有非${HUNTER}角色，将他们的${HP}全部清零，就能获胜。`,
    highlight: 'opponentPanel',
    lock: true,
    next: TUTORIAL_FLOW.CULTIST_INTRO_RULES,
  },
  {
    id: TUTORIAL_FLOW.CULTIST_INTRO_RULES,
    title: '邪祀者',
    body: `最后是${CULTIST}，他们一心复活邪神，基于利害关系相互合作，精于算计他人。`,
    highlight: 'center',
    lock: true,
    next: TUTORIAL_FLOW.CULTIST_GOAL_RULES,
  },
  {
    id: TUTORIAL_FLOW.CULTIST_GOAL_RULES,
    title: '复苏',
    body: [
      `如果你是${CULTIST}，你要专注于腐化一名角色的心智。当他${SAN}值清零，被邪神占据身体，你就赢了。`,
      '当然，如果你准备自己丧失心智，成为邪神的宿主…那也未尝不可。',
    ],
    highlight: 'opponentSanBar',
    lock: true,
    next: TUTORIAL_FLOW.DRAW_ZONE_CARD,
  },
  {
    id: TUTORIAL_FLOW.DRAW_ZONE_CARD,
    title: '探索',
    body: `每回合你将从${GOLD('牌堆')}摸一张牌并翻开，探索一个新区域，同时也会发生${GOLD('随机事件')}。`,
    highlight: 'deckArea',
    lock: true,
    next: TUTORIAL_FLOW.DRAW_GOD_CARD,
  },
  {
    id: TUTORIAL_FLOW.DRAW_GOD_CARD,
    title: '邪神化身',
    body: [
      `也有可能，你遇到的不是新区域，而是${GOD('邪神的化身')}。`,
      `是否${GOD('信仰')}祂，分享祂的权能，取决于你。小心越陷越深。`,
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
    body: [
      `接下来，我将教你如何用各身份的${SKILL}取得胜利。`,
      `你现在扮演${TREASURE}。注意你手中已经有A～C、1～3的编号，只差字母D和数字4。如果得到D4区域牌，你就赢了。`,
    ],
    highlight: 'handArea',
    lock: true,
    next: TUTORIAL_FLOW.TREASURE_START_TURN,
  },
  {
    id: TUTORIAL_FLOW.TREASURE_START_TURN,
    title: '回合开始',
    body: '轮到你的回合了。回合开始时会自动摸牌。',
    highlight: 'deckArea',
    lock: true,
    next: TUTORIAL_FLOW.TREASURE_DRAW_CARD,
  },
  {
    id: TUTORIAL_FLOW.TREASURE_DRAW_CARD,
    title: '自动摸牌',
    body: '',
    highlight: 'deckArea',
    lock: true,
    auto: true,
    next: TUTORIAL_FLOW.TREASURE_DRAW_REVEAL,
  },
  {
    id: TUTORIAL_FLOW.TREASURE_DRAW_REVEAL,
    title: '收入手牌',
    body: '哦，真可惜，不是D4。但我仍然推荐你收入这张牌，接下来自有妙用。',
    highlight: 'drawRevealKeepButton',
    lock: false,
    allowedAction: { type: 'drawKeep' },
    next: TUTORIAL_FLOW.TREASURE_DODGE_PROMPT,
  },
  {
    id: TUTORIAL_FLOW.TREASURE_DODGE_PROMPT,
    title: '求生技能',
    body: [
      `你可能奇怪为什么要拿一张负面效果牌。别忘了，${TREASURE}的目标是集齐${GOLD('宝藏')}，自然要承担一点探索的风险。`,
      `更何况，作为${TREASURE}，我们还有${GOLD('求生')}技能。现在掷出骰子。`,
    ],
    highlight: 'dodgeRollButton',
    lock: false,
    allowedAction: { type: 'dodgeRoll' },
  },
  {
    id: TUTORIAL_FLOW.TREASURE_DODGE_RESULT,
    title: '求生成功',
    body: '看，你的运气很不错，有惊无险。当你掷出4~6点时，你可以收入区域牌而不承担负面效果。',
    highlight: 'noSpotlight',
    lock: true,
    next: TUTORIAL_FLOW.TREASURE_USE_SKILL,
  },
  {
    id: TUTORIAL_FLOW.TREASURE_USE_SKILL,
    title: '发动掉包',
	body: [
      `寻宝者的${SWAP}技能可以与其他人交换已经探索过的卡牌————不管他愿不愿意。`,
      `不同于摸牌，这是另一种集齐${GOLD('宝藏')}的手段。试试吧。`,
    ],
    highlight: 'skillButton',
    lock: false,
    allowedAction: { type: 'useSkill' },
  },
  {
    id: TUTORIAL_FLOW.TREASURE_SELECT_TARGET,
    title: '选择目标',
    body: '选择一个倒霉蛋下手吧。',
    highlight: 'singleOpponent',
    lock: false,
    allowedAction: { type: 'selectTarget', pid: 1 },
  },
  {
    id: TUTORIAL_FLOW.TREASURE_STEAL_CARD,
    title: '抽取对手手牌',
	body: `掉包中只能${GOLD('暗抽')}————就像偷偷把手伸进别人包里。能否拿到你要的牌，就看运气了。`,
    highlight: 'swapBlindHand',
    lock: false,
    allowedAction: { type: 'swapSteal', cardIndex: 0 },
  },
  {
    id: TUTORIAL_FLOW.TREASURE_GIVE_CARD,
    title: '交还一张牌',
	body: [
      `这正是我们要的D4！不过${SWAP}不是抢劫，你需要还一张牌。`,
      `刚才摸到的那张B3没有用，就选它了。`,
    ],
    highlight: 'handArea',
    lock: false,
    allowedAction: { type: 'handCard', cardId: 'tut-treasure-forced-draw' },
  },
  {
    id: TUTORIAL_FLOW.TREASURE_MAP_ANIM,
    title: '',
    body: '',
    highlight: 'noSpotlight',
    lock: false,
    auto: true,
  },
  {
    id: TUTORIAL_FLOW.TREASURE_RESULT,
    title: '宝藏完成',
	body: [
      `这是最理想的情况：换到缺失编号，立即胜利。`,
	  `但即使你的手牌离胜利尚远，只要有没用的牌，也可以积极使用${SWAP}，没准就离宝藏更近一步了。`,
      `接下来继续教你其他身份。`,
    ],
    highlight: 'handArea',
    lock: true,
    next: TUTORIAL_FLOW.HUNTER_INTRO,
  },
  {
    id: TUTORIAL_FLOW.HUNTER_INTRO,
    title: '追猎者：连续进攻',
	body: [
      `准备好扮演${HUNTER}了吗？`,
	  `对手的${HP}依然充足，你要在一回合内将其消灭，守护遗迹。`,
    ],
    highlight: 'opponentHpBar',
    lock: true,
    next: TUTORIAL_FLOW.HUNTER_USE_SKILL,
    setup: 'hunter',
  },
  {
    id: TUTORIAL_FLOW.HUNTER_USE_SKILL,
    title: '发动追捕',
    body: `追猎者的${HUNT}技能可以直接造成伤害。让我们小试牛刀。`,
    highlight: 'skillButton',
    lock: false,
    allowedAction: { type: 'useSkill' },
  },
  {
    id: TUTORIAL_FLOW.HUNTER_SELECT_TARGET,
    title: '选择猎物',
    body: '你需要选择追捕目标。请点击对手。',
    highlight: 'singleOpponent',
    lock: false,
    allowedAction: { type: 'selectTarget', pid: 1 },
  },
  {
    id: TUTORIAL_FLOW.HUNTER_REVEAL,
    title: '对手亮牌',
    body: `对手亮出了A1区域牌。`,
    highlight: 'singleOpponent',
    lock: true,
    next: TUTORIAL_FLOW.HUNTER_CONFIRM_CARD,
  },
  {
    id: TUTORIAL_FLOW.HUNTER_CONFIRM_CARD,
    title: '弃牌造成伤害',
    body: `你手中带有编号A或1的区域牌都能匹配对手亮出的牌，并造成伤害。请点击一张。`,
    highlight: 'handCards',
    lock: false,
    allowedAction: { type: 'handCard', cardId: ['tut-hunter-match-a1', 'tut-hunter-match-d1'] },
  },
  {
    id: TUTORIAL_FLOW.HUNTER_SECOND_HUNT_INTRO,
    title: '继续追捕',
    body: `对手失去了3${HP}，但还没倒下。`,
    highlight: 'opponentHpBar',
    lock: true,
    next: TUTORIAL_FLOW.HUNTER_USE_SKILL_2,
  },
  {
    id: TUTORIAL_FLOW.HUNTER_USE_SKILL_2,
    title: '再次发动追捕',
	body: [
      `与寻宝者、邪祀者不同，追猎者的${HUNT}只要成功造成伤害，就能在本回合内继续使用。`,
	  `请再次点击。`,
    ],
    highlight: 'skillButton',
    lock: false,
    allowedAction: { type: 'useSkill' },
  },
  {
    id: TUTORIAL_FLOW.HUNTER_SELECT_TARGET_2,
    title: '选择猎物',
    body: '请点击对手。',
    highlight: 'singleOpponent',
    lock: false,
    allowedAction: { type: 'selectTarget', pid: 1 },
  },
  {
    id: TUTORIAL_FLOW.HUNTER_REVEAL_2,
    title: '对手亮牌',
    body: `对手再次亮出 A1。`,
    highlight: 'singleOpponent',
    lock: true,
    next: TUTORIAL_FLOW.HUNTER_CONFIRM_CARD_2,
  },
  {
    id: TUTORIAL_FLOW.HUNTER_CONFIRM_CARD_2,
    title: '完成击杀',
	body: `再弃一张带有编号A或1的区域牌，对手就会命丧你的剑下！`,
    highlight: 'handCards',
    lock: false,
    allowedAction: { type: 'handCard', cardId: ['tut-hunter-match-a1', 'tut-hunter-match-d1'] },
  },
  {
    id: TUTORIAL_FLOW.HUNTER_RESULT,
    title: '猎物倒下',
	body: [
      `收缴战利品的时间到了。${HUNT}成功击杀后，可以随机夺取最多3张手牌。只要策略合理，一回合横扫全场也是可能的。`,
	  `反过来说，如果对手亮出卡牌，你却放弃追捕，滚雪球的势头就会被打断。`,
	  `想要成为优秀的追猎者，时机和目标的选择至关重要。`,
    ],
    highlight: 'handArea',
    lock: true,
    next: TUTORIAL_FLOW.CULTIST_ZONE_INTRO,
  },
  {
    id: TUTORIAL_FLOW.CULTIST_ZONE_INTRO,
    title: '邪祀者：蛊惑区域牌',
    body: `最后你将扮演${CULTIST}。对手的${SAN}已如风中残烛，我先教你${BEWITCH}的基础用法。`,
    highlight: 'opponentSanBar',
    lock: true,
    next: TUTORIAL_FLOW.CULTIST_ZONE_USE_SKILL,
    setup: 'cultistZone',
  },
  {
    id: TUTORIAL_FLOW.CULTIST_ZONE_USE_SKILL,
    title: '发动蛊惑',
    body: `点击${BEWITCH}。`,
    highlight: 'skillButton',
    lock: false,
    allowedAction: { type: 'useSkill' },
  },
  {
    id: TUTORIAL_FLOW.CULTIST_ZONE_SELECT_CARD,
    title: '选择蛊惑牌',
    body: `选择“幽闭恐惧”这张区域牌，它能造成${SAN}伤害。`,
    highlight: 'handCard',
    lock: false,
    allowedAction: { type: 'handCard', cardId: 'tut-cult-zone' },
  },
  {
    id: TUTORIAL_FLOW.CULTIST_ZONE_SELECT_TARGET,
    title: '选择目标',
	body: [
      `大部分区域牌只在被收入手中的瞬间产生效果。但邪祀者的${BEWITCH}可以在把手牌送给对手的同时，迫使对手${GOLD('重新触发')}卡牌效果。`,
	  `现在，把这张牌送给对手。`,
    ],
    highlight: 'singleOpponent',
    lock: false,
    allowedAction: { type: 'selectTarget', pid: 1 },
  },
  {
    id: TUTORIAL_FLOW.CULTIST_ZONE_RESULT,
    title: 'SAN 归零',
    body: `对手只剩2${SAN}，摸到“幽闭恐惧”并重新触发后${SAN}刚好归零，邪神复活。`,
    highlight: 'opponentSanBar',
    lock: true,
    next: TUTORIAL_FLOW.CULTIST_GOD_INTRO,
  },
  {
    id: TUTORIAL_FLOW.CULTIST_GOD_INTRO,
    title: '邪神牌、骷髅头与改信',
	body: [
      `现在我们换个对手，通过观察对手回合了解${GOLD('邪神牌')}的机制。`,
	  `寻宝者和追猎者当然可以不了解邪神————但${CULTIST}可不行。`,
    ],
    highlight: 'singleOpponent',
    lock: true,
    next: TUTORIAL_FLOW.CULTIST_GOD_STATUS_MARKERS,
    setup: 'cultistGod',
  },
  {
    id: TUTORIAL_FLOW.CULTIST_GOD_STATUS_MARKERS,
    title: '骷髅与邪神之力',
	body: [
      `注意到这个${GOLD('骷髅标记')}了吗？它的数量代表了对手在这次探险中信仰邪神的次数。`,
	  `而旁边的标签，则表示对手此刻正在信仰一位邪神，并接受祂的赐福。`,
	  `这两个信息的用处，你待会自会明白。`,
    ],
    highlight: 'opponentGodStatus',
    lock: true,
    next: TUTORIAL_FLOW.CULTIST_GOD_OPPONENT_DRAW_START,
  },
  {
    id: TUTORIAL_FLOW.CULTIST_GOD_OPPONENT_DRAW_START,
    title: '',
    body: '',
    highlight: 'noSpotlight',
    lock: false,
    auto: true,
  },
  {
    id: TUTORIAL_FLOW.CULTIST_GOD_OPPONENT_DRAW,
    title: '遭遇邪神',
	body: [
      `还记得刚才对手有7点${SAN}吗？`,
	  `因为再次遭遇邪神，对手的骷髅数增长至2，并且失去了等同于骷髅数的${SAN}。`,
	  `不仅如此，注意到${SAN}条上的刻度线了吗？这次结算后对手${SAN}低于刻度线，会发生什么呢？`,
    ],
    highlight: 'opponentSanBar',
    lock: true,
    next: TUTORIAL_FLOW.CULTIST_GOD_CHECK_INTRO,
  },
  {
    id: TUTORIAL_FLOW.CULTIST_GOD_CHECK_INTRO,
    title: '检定牌',
    body: `就是这样！每次${SAN}降至6或以下时，都需要进行检定，触发随机效果。`,
    highlight: 'inspectionFlipCard',
    lock: true,
    next: TUTORIAL_FLOW.CULTIST_GOD_CONVERT_CHECK,
  },
  {
    id: TUTORIAL_FLOW.CULTIST_GOD_CONVERT_CHECK,
    title: '改信代价',
	body: [
      `注意到邪神之力标签的变化了吗？对手放弃了原有的信仰，${GOLD('改信')}刚刚遭遇的“弗栗多”。`,
	  `${GOLD('改信')}者需要额外失去 1${SAN}。让我们看看这次${SAN}检定的结果……`,
    ],
    highlight: 'opponentSanAndGodStatus',
    lock: true,
    next: TUTORIAL_FLOW.CULTIST_GOD_CONVERT_RESOLVE,
  },
  {
    id: TUTORIAL_FLOW.CULTIST_GOD_CONVERT_RESOLVE,
    title: '',
    body: '',
    highlight: 'noSpotlight',
    lock: false,
    auto: true,
  },
  {
    id: TUTORIAL_FLOW.CULTIST_GOD_PLAYER_DRAW,
    title: '轮到你',
    body: `对手没有继续行动，回合结束。现在轮到你：你会摸到一张邪神牌。作为${CULTIST}，你可以不信仰它，而是秘密收入手牌。`,
    highlight: 'deckArea',
    lock: true,
    next: TUTORIAL_FLOW.CULTIST_GOD_KEEP_HAND,
    auto: true,
  },
  {
    id: TUTORIAL_FLOW.CULTIST_GOD_KEEP_HAND,
    title: '收入邪神牌',
    body: `点击“秘密收入手牌”。这张邪神牌会成为你接下来${BEWITCH}的弹药。`,
    highlight: 'noSpotlight',
    lock: false,
    allowedAction: { type: 'godKeepHand' },
    next: TUTORIAL_FLOW.CULTIST_GOD_SELECT_CARD,
  },
  {
    id: TUTORIAL_FLOW.CULTIST_GOD_SELECT_CARD,
    title: '蛊惑邪神牌',
    body: `点击“${BEWITCH}”，选择刚才收入手牌的邪神牌。`,
    highlight: 'handCard',
    lock: false,
    allowedAction: { type: 'useSkillOrHandCard', cardId: 'tut-cult-god' },
  },
  {
    id: TUTORIAL_FLOW.CULTIST_GOD_SELECT_TARGET,
    title: '强迫改信',
    body: `把邪神牌蛊惑给对手。第 3 个骷髅头会让他先失去 3${SAN}，随后强制改信再失去 1${SAN}。`,
    highlight: 'singleOpponent',
    lock: false,
    allowedAction: { type: 'selectTarget', pid: 1 },
  },
  {
    id: TUTORIAL_FLOW.CULTIST_GOD_RESULT,
    title: '邪神复苏',
    body: `这次归零来自“骷髅头遭遇损失 + 检定牌风险 + 改信损失”的合计。正式对局中，${CULTIST}要主动制造这种临界点。`,
    highlight: 'opponentSanBar',
    lock: true,
    next: TUTORIAL_FLOW.COMPLETE,
  },
  {
    id: TUTORIAL_FLOW.COMPLETE,
    title: '开始正式对局',
    body: `三种${GOLD('身份')}的关键行动已经演示完毕。接下来进入完整五人对局，真正的试探才刚开始。`,
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

function safeTutorialInspectionDeck() {
  const blocked = new Set(['超人意志', '揭开真相', '封印松动', '廷达罗斯猎犬']);
  return INSPECTION_DECK
    .filter(card => !blocked.has(card.name))
    .map((card, idx) => ({ ...card, id: `tut-inspection-${idx}` }));
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
      { ...zoneCard('A1', '霉变食物', 'tut-hunter-match-a1'), id: 'tut-hunter-match-a1' },
      { ...zoneCard('B2', '新鲜空气', 'tut-hunter-nonmatch-1'), id: 'tut-hunter-nonmatch-1' },
      { ...zoneCard('C3', '引燃火把', 'tut-hunter-nonmatch-2'), id: 'tut-hunter-nonmatch-2' },
      { ...zoneCard('D1', '钻地魔虫', 'tut-hunter-match-d1'), id: 'tut-hunter-match-d1' },
    ];
    opponent.hp = 6;
    opponent.hand = [
      { ...zoneCard('A1', '解读石刻', 'tut-hunter-target-a1-1'), id: 'tut-hunter-target-a1-1' },
      { ...zoneCard('A1', '霉变食物', 'tut-hunter-target-a1-2'), id: 'tut-hunter-target-a1-2' },
      { ...zoneCard('A1', '神圣菇肉', 'tut-hunter-target-a1-3'), id: 'tut-hunter-target-a1-3' },
    ];
    return baseTutorialState([player, opponent], ['教学局：你现在扮演追猎者。对手有 6 HP，需要连续追捕两次才能击杀。']);
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
    const nya = godCard('NYA', 'tut-target-nya');
    const opponentDrawGod = { ...godCard('VRI', 'tut-opponent-draw-god'), id: 'tut-opponent-draw-god' };
    const playerDrawGod = { ...godCard('ZHU', 'tut-cult-god'), id: 'tut-cult-god' };
    player.hand = [
      zoneCard('B2', '新鲜空气', 'tut-cult-god-extra'),
    ];
    opponent.san = 7;
    opponent.godEncounters = 1;
    opponent.godName = 'NYA';
    opponent.godLevel = 1;
    opponent.godZone = [nya];
    opponent.hand = [zoneCard('C4', '夜风呼啸', 'tut-cult-god-target')];
    const state = baseTutorialState([player, opponent], ['教学局：对手已有 1 个骷髅头、7 SAN，并正在信仰伏行之混沌。']);
    state.deck = [
      opponentDrawGod,
      playerDrawGod,
      ...state.deck.filter(card => card.id !== opponentDrawGod.id && card.id !== playerDrawGod.id),
    ];
    state.inspectionDeck = safeTutorialInspectionDeck();
    state.inspectionDiscard = [];
    return state;
  }

  const player = playerBase(0, '你', ROLE_TREASURE);
  const opponent = playerBase(1, '贝拉', ROLE_HUNTER);
  player.hand = [
    zoneCard('A1', '霉变食物', 'tut-treasure-a1'),
    zoneCard('B2', '新鲜空气', 'tut-treasure-b2'),
    zoneCard('C3', '引燃火把', 'tut-treasure-c3'),
  ];
  opponent.hand = [
    zoneCard('D4', '斯芬克斯', 'tut-treasure-target-d4'),
    zoneCard('B1', '圣甲虫', 'tut-treasure-target-extra'),
  ];
  const state = baseTutorialState([player, opponent], ['教学局：你现在扮演寻宝者，手中已有 A~C、1~3 编号。']);
  // 将牌堆中的 B3「封入石棺」固定置于牌堆顶作为教学摸牌（带负面效果，不是 D4）
  const forcedDrawIdx = state.deck.findIndex(card => card.key === 'B3' && card.name === '封入石棺');
  if (forcedDrawIdx >= 0) {
    const [forcedDraw] = state.deck.splice(forcedDrawIdx, 1);
    forcedDraw.id = 'tut-treasure-forced-draw';
    state.deck.unshift(forcedDraw);
  }
  return state;
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
  if (allowed.cardId != null) {
    const allowedIds = Array.isArray(allowed.cardId) ? allowed.cardId : [allowed.cardId];
    if (!allowedIds.includes(action.cardId)) return false;
  }
  return true;
}

export function nextTutorialStepAfterAction(stepId, action) {
  if (stepId === TUTORIAL_FLOW.TREASURE_DRAW_REVEAL && action.type === 'drawKeep') return TUTORIAL_FLOW.TREASURE_DODGE_PROMPT;
  if (stepId === TUTORIAL_FLOW.TREASURE_DODGE_PROMPT && action.type === 'dodgeRoll') return TUTORIAL_FLOW.TREASURE_DODGE_RESULT;
  if (stepId === TUTORIAL_FLOW.TREASURE_USE_SKILL && action.type === 'useSkill') return TUTORIAL_FLOW.TREASURE_SELECT_TARGET;
  if (stepId === TUTORIAL_FLOW.TREASURE_SELECT_TARGET && action.type === 'selectTarget') return TUTORIAL_FLOW.TREASURE_STEAL_CARD;
  if (stepId === TUTORIAL_FLOW.TREASURE_STEAL_CARD && action.type === 'swapSteal') return TUTORIAL_FLOW.TREASURE_GIVE_CARD;
  if (stepId === TUTORIAL_FLOW.TREASURE_GIVE_CARD && action.type === 'handCard') return TUTORIAL_FLOW.TREASURE_MAP_ANIM;
  if (stepId === TUTORIAL_FLOW.HUNTER_USE_SKILL && action.type === 'useSkill') return TUTORIAL_FLOW.HUNTER_SELECT_TARGET;
  if (stepId === TUTORIAL_FLOW.HUNTER_SELECT_TARGET && action.type === 'selectTarget') return TUTORIAL_FLOW.HUNTER_REVEAL;
  if (stepId === TUTORIAL_FLOW.HUNTER_CONFIRM_CARD && action.type === 'handCard') return TUTORIAL_FLOW.HUNTER_SECOND_HUNT_INTRO;
  if (stepId === TUTORIAL_FLOW.HUNTER_USE_SKILL_2 && action.type === 'useSkill') return TUTORIAL_FLOW.HUNTER_SELECT_TARGET_2;
  if (stepId === TUTORIAL_FLOW.HUNTER_SELECT_TARGET_2 && action.type === 'selectTarget') return TUTORIAL_FLOW.HUNTER_REVEAL_2;
  if (stepId === TUTORIAL_FLOW.HUNTER_CONFIRM_CARD_2 && action.type === 'handCard') return TUTORIAL_FLOW.HUNTER_RESULT;
  if (stepId === TUTORIAL_FLOW.CULTIST_ZONE_USE_SKILL && action.type === 'useSkill') return TUTORIAL_FLOW.CULTIST_ZONE_SELECT_CARD;
  if (stepId === TUTORIAL_FLOW.CULTIST_ZONE_SELECT_CARD && action.type === 'handCard') return TUTORIAL_FLOW.CULTIST_ZONE_SELECT_TARGET;
  if (stepId === TUTORIAL_FLOW.CULTIST_ZONE_SELECT_TARGET && action.type === 'selectTarget') return TUTORIAL_FLOW.CULTIST_ZONE_RESULT;
  if (stepId === TUTORIAL_FLOW.CULTIST_GOD_KEEP_HAND && action.type === 'godKeepHand') return TUTORIAL_FLOW.CULTIST_GOD_SELECT_CARD;
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
