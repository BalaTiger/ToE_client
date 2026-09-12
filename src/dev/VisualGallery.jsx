import { useEffect, useMemo, useState } from 'react';
import { BattleScreen } from '../components/battle/BattleScreen';
import { RoomModal, LobbyModal, PrivacyToggleModal, TutorialOverlay, ConnectionErrorModal, DebugControls } from '../components/lobby';
import { AboutModal, RoadmapModal, FullLogModal } from '../components/modals';
import { GLOBAL_STYLES } from '../components/GlobalStyles';
import { CARD_FACE_RATIO } from '../components/cards/CardFaceAssets';
import { CardFaceTooltip, DDCard } from '../components/cards';
import { DiscardOverlay } from '../components/board';
import { OnlineOptionsDialog } from '../components/start/OnlineOptionsDialog';
import { GameResultScreen } from '../components/result/GameResultScreen';
import { GodResurrectionAnim, TreasureMapAnim, RoleRevealAnim } from '../components/anim/WinAnims';
import { FIXED_ZONE_CARD_VARIANTS_BY_KEY, GOD_DEFS, INSPECTION_DECK, createBlackGoatYoungCard, createTsathogguaSlimeCard } from '../constants/card';
import { getBattleTheme, getBattleBackgroundImage } from '../constants/theme';
import { RINFO } from '../game/setup';
import { buildPhaseUiState } from '../game/phaseUi';
import { TUTORIAL_FLOW, getTutorialStep } from '../game/tutorialScenario';
import { useBattleResponsiveLayout } from '../hooks/useBattleResponsiveLayout';
import { buildPublicUrl } from '../utils/url';
import './VisualGallery.css';

const SCENES = [
  ['battle', '行动阶段', '对局'],
  ['role', '选择本局身份', '对局'],
  ['battle-mp', '联机行动与倒计时', '对局'],
  ['battle-spectate', '死亡旁观', '对局'],
  ['battle-status', '信仰、翻面与状态标记', '对局'],
  ['battle-ai', '等待其他旅者行动', '对局', 'AI_TURN'],
  ['battle-empty', '空手牌', '对局'],
  ['discard', '超出手牌上限 · 选择弃牌', '对局', 'DISCARD_PHASE'],
  ['hunt-reveal', '追捕 · 亮出手牌', '对局', 'PLAYER_REVEAL_FOR_HUNT'],
  ['hunt-wait', '追捕 · 等待亮牌', '对局', 'HUNT_WAIT_REVEAL'],
  ['hunt-confirm', '追捕 · 匹配与放弃', '对局', 'HUNT_CONFIRM'],
  ['bury-alive', '活埋 · 手牌选择', '对局', 'BURY_ALIVE_SELECT'],
  ['ignite-torch', '引燃火炬 · 手牌选择', '对局', 'IGNITE_TORCH_DISCARD'],
  ['albino-creature', '白化生物 · 火焰牌响应', '对局', 'ALBINO_CREATURE_SELECT_CARD'],
  ['cave-duel-card', '穴居人战争 · 手牌选择', '对局', 'CAVE_DUEL_SELECT_CARD'],
  ['cave-duel-wait', '穴居人战争 · 等待亮牌', '对局', 'CAVE_DUEL_WAIT_REVEAL'],
  ['swap-give', '掉包 · 交回一张牌', '对局', 'SWAP_GIVE_CARD'],
  ['bewitch-card', '蛊惑 · 选择手牌', '对局', 'BEWITCH_SELECT_CARD'],
  ['pause', '单人暂停', '系统'],
  ['exit', '退出对局确认', '系统'],
  ['reconnect', '恢复当前对局连接', '系统'],
  ['connection-error', '连接失败', '系统'],
  ['settings', '视听设置', '系统'],
  ['emoji', '联机表情选择', '系统'],
  ['announcement', '服务器公告', '系统'],
  ['online', '联机入口 · 创建与加入', '联机'],
  ['online-loading', '联机入口 · 连接中', '联机'],
  ['online-rename', '联机用户名编辑', '联机'],
  ['online-rename-cooldown', '联机改名 · 冷却中', '联机'],
  ['online-special-name', '联机用户名 · 特殊名字', '联机'],
  ['lobby', '游戏大厅 · 房间列表', '联机'],
  ['lobby-empty', '游戏大厅 · 暂无房间', '联机'],
  ['lobby-loading', '游戏大厅 · 加载中', '联机'],
  ['room', '联机房间 · 房主未准备', '联机'],
  ['room-ready', '联机房间 · 已准备', '联机'],
  ['room-member', '联机房间 · 成员视角', '联机'],
  ['room-private', '联机房间 · 私密', '联机'],
  ['room-start', '联机房间 · 开始倒计时', '联机'],
  ['room-kick', '联机房间 · 准备截止倒计时', '联机'],
  ['privacy', '公开房间确认', '联机'],
  ['draw', '区域探寻 · 取舍', '决策', 'DRAW_REVEAL'],
  ['draw-wait', '区域探寻 · 等待他人', '决策', 'DRAW_REVEAL'],
  ['draw-error', '区域探寻 · 可重试错误', '决策', 'DRAW_REVEAL'],
  ['god', '邪神降临 · 信仰', '决策', 'GOD_CHOICE'],
  ['god-keep', '邪祀者 · 邪神收入手牌', '决策', 'GOD_CHOICE'],
  ['god-upgrade', '邪神之力升级', '决策', 'GOD_CHOICE'],
  ['god-convert', '改信新神', '决策', 'GOD_CHOICE'],
  ['god-forced', '被迫改信', '决策', 'GOD_CHOICE'],
  ['god-wait', '邪神降临 · 等待他人', '决策', 'GOD_CHOICE'],
  ['dodge', '寻宝者闪避选择', '决策', 'TREASURE_DODGE_DECISION'],
  ['dodge-aoe', '群体效果闪避', '决策', 'TREASURE_AOE_DODGE_DECISION'],
  ['dodge-wait', '群体效果 · 等待闪避', '决策', 'TREASURE_AOE_DODGE_DECISION'],
  ['nya-borrow', '千人千貌 · 借用身份', '决策', 'NYA_BORROW'],
  ['zhu-hide', '衔烛照幽 · 藏到牌底', '决策'],
  ['zhu-wait', '衔烛照幽 · 等待他人', '决策'],
  ['slime', '赐福黏液 · HP/SAN 平分', '决策', 'TSG_SLIME_BALANCE'],
  ['slime-wait', '赐福黏液 · 等待他人', '决策', 'TSG_SLIME_BALANCE'],
  ['etherealize', '半物质化 · 转移伤害', '决策', 'ETHEREALIZE_DECISION'],
  ['etherealize-chain', '半物质化 · 连续转移', '决策', 'ETHEREALIZE_DECISION'],
  ['etherealize-wait', '半物质化 · 等待他人', '决策', 'ETHEREALIZE_DECISION'],
  ['tortoise', '灵龟卜祝 · 选择编号', '决策', 'TORTOISE_ORACLE_SELECT'],
  ['tortoise-wait', '灵龟卜祝 · 等待他人', '决策', 'TORTOISE_ORACLE_SELECT'],
  ['peek', '血之窥探', '决策'],
  ['first-come', '先到先得 · 选牌', '决策', 'FIRST_COME_PICK_SELECT'],
  ['first-come-wait', '先到先得 · 等待他人', '决策', 'FIRST_COME_PICK_SELECT'],
  ['grave-dig', '掘墓 · 选邪神牌', '决策', 'GRAVE_DIG_SELECT'],
  ['grave-dig-wait', '掘墓 · 等待他人', '决策', 'GRAVE_DIG_SELECT'],
  ['same-abyss', '同归深渊 · 手牌或 HP', '决策', 'SAME_ABYSS_SELECT'],
  ['same-abyss-wait', '同归深渊 · 等待他人', '决策', 'SAME_ABYSS_SELECT'],
  ['sphinx', '斯芬克斯 · 猜测牌堆', '决策', 'SPHINX_GUESS'],
  ['sphinx-wait', '斯芬克斯 · 等待他人', '决策', 'SPHINX_GUESS'],
  ['decipher', '解读石刻 · 卡牌分配', '决策', 'DECIPHER_STONE_CARVING'],
  ['decipher-wait', '解读石刻 · 等待他人', '决策', 'DECIPHER_STONE_CARVING'],
  ['swap-blind', '掉包 · 暗抽选择', '目标'],
  ['swap-shuffle', '掉包 · 洗牌', '目标'],
  ['swap-public', '掉包 · 公开手牌选择', '目标', 'SWAP_SELECT_TARGET_CARD'],
  ['hunt-public', '追捕 · 死者手牌选择', '目标', 'HUNT_SELECT_CARD_FROM_PUBLIC'],
  ...[
    ['swap', '掉包', 'SWAP_SELECT_TARGET'], ['hunt', '追捕', 'HUNT_SELECT_TARGET'],
    ['bewitch', '蛊惑', 'BEWITCH_SELECT_TARGET'], ['zone-swap', '交换手牌', 'ZONE_SWAP_SELECT_TARGET'],
    ['peek', '血之窥探', 'PEEK_HAND_SELECT_TARGET'], ['cave-duel', '穴居人战争', 'CAVE_DUEL_SELECT_TARGET'],
    ['damage-link', '两人一绳', 'DAMAGE_LINK_SELECT_TARGET'], ['rose-thorn', '玫瑰倒刺', 'ROSE_THORN_SELECT_TARGET'],
    ['multiply', '繁衍', 'MULTIPLY_SELECT_TARGET'], ['shu', '黑山羊幼仔', 'SHU_SELECT_TARGET'],
    ['etherealize', '半物质化', 'ETHEREALIZE_SELECT_TARGET'],
  ].map(([id, title, phase]) => [`target-${id}`, `${title} · 目标选择`, '目标', phase]),
  ['about', '关于游戏与规则', '信息'],
  ['roadmap', '版本更新计划', '信息'],
  ['full-log', '完整游戏日志', '信息'],
  ['full-log-empty', '完整游戏日志 · 空状态', '信息'],
  ['discard-pile', '弃牌堆浏览', '信息'],
  ['card-zone-detail', '区域牌详情', '信息'],
  ['card-god-detail', '邪神牌详情与等级', '信息'],
  ['card-clarity', '卡牌清晰度 · 82 / 124 / 196 / 300 px', '信息'],
  ['tutorial-welcome', '教学欢迎', '教学'],
  ['soft-rest', '休息提示', '教学'],
  ['soft-flip', '翻面提示', '教学'],
  ...Object.values(TUTORIAL_FLOW).filter(step => {
    const definition = getTutorialStep(step);
    return definition?.id === step && !definition.auto;
  }).map(step => [`tutorial-${step}`, getTutorialStep(step).title, '教学', null, step]),
  ['treasure-win', '寻宝者 · 藏宝图揭示', '演出'],
  ['treasure-wait', '藏宝图 · 等待获胜者', '演出'],
  ['resurrection', '邪神复活', '演出'],
  ...Object.keys(RINFO).map((role, i) => [`role-reveal-${i}`, `身份揭示 · ${role}`, '演出']),
  ['result-treasure', '结算 · 寻宝者获胜', '结算'],
  ['result-treasure-other', '结算 · 其他寻宝者获胜', '结算'],
  ['result-treasure-joint', '结算 · 两名寻宝者共同获胜', '结算'],
  ['result-hunter', '结算 · 追猎者获胜', '结算'],
  ['result-cultist', '结算 · 邪祀者获胜', '结算'],
  ['result-other-team', '结算 · 其他阵营获胜', '结算'],
  ['result-defeat', '结算 · 英魂殒落', '结算'],
  ['result-all-dead', '结算 · 全员覆灭', '结算'],
  ['result-mp', '结算 · 返回联机房间', '结算'],
  ['debug-settings', '本地调试设置', '开发'],
];

const LOG = [
  '游戏开始。每人获得四张初始手牌。', '── 第 3 回合 · 你 ──',
  '你摸到了【A2 神圣菇肉】。', '你选择收入手牌。', '你恢复了 3 HP。',
  '艾伦信仰了克苏鲁，获得邪神之力 Lv.1。', '贝拉已亮明追猎者身份。',
  '你发动【掉包】，从艾伦的手牌中暗抽一张。', '轮到你行动了。',
];
const noop = () => {};
const truth = () => true;
const localSeat = index => index === 0;
const godCard = (key, index = 0) => ({ id: `gallery-god-${key}-${index}`, isGod: true, godKey: key, name: GOD_DEFS[key].name, power: GOD_DEFS[key].power });
const ZONES = Object.entries(FIXED_ZONE_CARD_VARIANTS_BY_KEY).map(([key, variants], i) => ({
  ...variants.find(card => card.expansion === '地神的潜影'), key, letter: key[0], num: Number(key[1]), id: `gallery-zone-${i}`,
}));
const GODS = ['CTH', 'NYA', 'ZHU'].map(godCard);

function makeState(scene, expansionKey) {
  const id = scene[0];
  const waiting = id.endsWith('-wait');
  const tutorial = scene[4] ? getTutorialStep(scene[4]) : null;
  const phase = scene[3] || ({ drawRevealKeepButton: 'DRAW_REVEAL', godKeepHandButton: 'GOD_CHOICE', dodgeRollButton: 'TREASURE_DODGE_DECISION' }[tutorial?.highlight]) || 'ACTION';
  const players = ['你', '艾伦', '贝拉', '卡洛斯', '黛安娜'].map((name, i) => ({
    id: i, name, role: ['寻宝者', '邪祀者', '追猎者', '寻宝者', '邪祀者'][i],
    hp: [7, 8, 10, 5, 6][i], san: [8, 5, 6, 9, 7][i], roleRevealed: i === 2,
    hand: [...ZONES.slice(i, i + 3), godCard(i === 0 ? 'CTH' : 'NYA', i)],
    zoneCards: [], godZone: [], isDead: false, isResting: false, godEncounters: 2,
    godEncounterCount: 2, godName: i === 1 ? 'CTH' : null, godLevel: i === 1 ? 1 : 0,
    hasBelievedGod: i === 1, peekMemories: {}, handLimitDecrease: 0,
  }));
  if (id === 'god-keep') players[0].role = '邪祀者';
  if (scene[4]?.startsWith('hunter')) players[0].role = '追猎者';
  if (scene[4]?.startsWith('cultist')) players[0].role = '邪祀者';
  if (id === 'god-upgrade') Object.assign(players[0], { godName: 'CTH', godLevel: 1 });
  if (id === 'god-convert' || id === 'god-forced') Object.assign(players[0], { godName: 'NYA', godLevel: 1 });
  if (id === 'nya-borrow') {
    Object.assign(players[0], { godName: 'NYA', godLevel: 2 });
    players[2].isDead = true;
    players[3].isDead = true;
  }
  if (id === 'battle-spectate') players[0].isDead = true;
  if (id === 'battle-empty') players[0].hand = [];
  if (id === 'battle-status') {
    players[0].hand = [...players[0].hand, { ...createBlackGoatYoungCard(), id: 'gallery-young' }, { ...createTsathogguaSlimeCard(), id: 'gallery-slime' }];
    players[1].isResting = true;
    Object.assign(players[2], { disableSkill: true, godName: 'ZHU', godLevel: 2 });
    Object.assign(players[3], { isDead: true, hp: 0, roleRevealed: true });
  }
  if (id === 'discard') players[0].hand.push(...ZONES.slice(8, 11));
  if (id === 'swap-public' || id === 'hunt-public') players[1].revealHand = true;
  const targetIdx = waiting ? 1 : 0;
  return {
    players, phase, expansionKey, currentTurn: waiting || id === 'battle-ai' ? 1 : 0, turn: 3, turnDirection: 1,
    deck: ZONES, discard: [...ZONES.slice(9, 13), GODS[1]], inspectionDeck: INSPECTION_DECK,
    inspectionDiscard: [], log: LOG, skillUsed: false, restUsed: false, multiplyUsed: false,
    huntAbandoned: [], godFromHandUsed: false, godTriggeredThisTurn: false, selectedCard: 0,
    _isMP: waiting || ['battle-mp', 'emoji', 'exit', 'reconnect'].includes(id),
    drawReveal: { card: ZONES[0], needsDecision: true, drawerName: waiting ? '艾伦' : '你', drawerIdx: targetIdx },
    abilityData: {
      godCard: GODS[0], drawerIdx: targetIdx, forcedConvert: id === 'god-forced',
      targetIdx, playerIndex: targetIdx, actorIdx: 1, afterHp: 4, afterSan: 8, lostHp: 3, lostSan: 1,
      ...(id === 'etherealize-chain' ? { viaEtherealizeFrom: 2 } : {}),
      revealedCards: ZONES.slice(0, 3), selectableKeys: ['A', '2'], pickOrder: [targetIdx, 2, 3], pickIndex: 0,
      godCards: GODS, targetHandCount: 6, actorHandCount: 3, discardCount: 3,
      discardSelected: id === 'discard' ? [1, 2] : [], buryAliveSelectedIndex: 1, igniteTorchSelectedIndex: 2,
      fireCardIds: [ZONES[0].id], bewitchCard: GODS[0], swapTi: 1, huntTi: 1, revCard: ZONES[0],
      takenCard: ZONES[3], caveDuelSource: 1, caveDuelTarget: 0, targets: [0, 1, 2], targetIndex: 0,
    },
  };
}

const CALLBACK_NAMES = `handleUiSfxCapture leaveMultiplayerMatchToStart handleAIClick handleMyCardClick useAbility doRest endTurn cancelAction huntConfirm confirmDiscard confirmBuryAliveSelection confirmIgniteTorchDiscard handleZhuHideDrawnCard handleZhuHideGodCard handleZhuHideTopCardDuringSphinx handleZhuHideAiDrawCard handleDrawKeepFromModal handleDrawDiscardFromModal handleTreasureDodgeRoll handleTreasureDodgeSkip handleTreasureAOEDodgeRoll handleTreasureAOEDodgeSkip resolveTsathogguaSlimeBalance resolveEtherealizeRedirect firstComePickSelectCard graveDigSelectGod sameAbyssSelect sphinxGuess tortoiseOracleSelect decipherStoneCarvingConfirm swapSelectTargetCard huntSelectCardFromPublic handleSwapBlindDrawSelect confirmRoleSelection resetDisconnectedToStart setPrivatePeek setEmojiButtonPos setShowEmojiPicker handleEmojiClick godResolvePlayer nyaBorrow nyaSkip setGs setAnim setPreparingSoftGuideId setPendingSoftGuideId setSoftGuideSpotlights setTutorialStep advanceTutorialStep handleTutorialResultNext completeTutorial _onRoleRevealDone handleGamma handleMusicVolume handleSfxVolume handleTutorialTreasureMapConfirm markLocalTreasureMapShown setLocalDebugMode`.split(' ');

function BattleFixture({ scene, expansionKey, onAction, onScene }) {
  const layout = useBattleResponsiveLayout();
  const state = useMemo(() => makeState(scene, expansionKey), [scene, expansionKey]);
  const [rects, setRects] = useState({});
  const [preferences, setPreferences] = useState({ gamma: 1, musicVolume: 0.6, sfxVolume: 0.8 });
  const [refs] = useState(() => ({
    ...Object.fromEntries(['skillButtonRef', 'drawRevealKeepButtonRef', 'godKeepHandButtonRef', 'dodgeRollButtonRef', 'swapBlindHandRef'].map(name => [name, { current: null }])),
    mobileGodCardRefs: { current: new Map() }, animQueueRef: { current: [] }, pendingGsRef: { current: null },
  }));
  const id = scene[0];
  const waiting = id.endsWith('-wait');
  const theme = getBattleTheme(expansionKey);
  const callbacks = Object.fromEntries(CALLBACK_NAMES.map(name => [name, () => onAction(`已确认「${scene[1]}」`)]));
  const phaseUi = buildPhaseUiState({
    gs: state, phase: state.phase, me: state.players[0], currentTurnPlayer: state.players[state.currentTurn],
    effectiveHandLimit: 5, isSpectating: id === 'battle-spectate', isVisualPlayerTurn: !waiting,
    localCurrentTurn: state.currentTurn === 0, decisionContext: { localCanAct: !waiting, ownerSeats: [state.currentTurn] },
    local: Object.fromEntries('swapGive huntConfirm huntTarget treasureDodge igniteTorch decipherStone albinoCreature slimeBalance etherealizeDecision etherealizeTarget godChoice nyaBorrow drawDecision caveDuel graveDig buryAlive sameAbyss sphinxGuess damageLinkSelect'.split(' ').map(key => [key, !waiting])),
  });

  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      const selectors = {
        panelRect: '[data-pid="0"]', roleTextRect: '[data-pid="0"]', handAreaRect: '[data-hand-area]',
        tutorialHandCardRect: '[data-self-hand-card]', handCardsRect: '[data-self-hand-strip]',
        aiPanelAreaRect: '[data-pid="1"]', opponentSanBarRect: '[data-pid="1"]', opponentHpBarRect: '[data-pid="1"]',
        singleOpponentRect: '[data-pid="1"]', opponentGodStatusRect: '[data-pid="1"]', deckAreaRect: '[data-deck-pile]',
      };
      setRects(Object.fromEntries(Object.entries(selectors).map(([name, selector]) => [name, document.querySelector(selector)?.getBoundingClientRect()])));
      setRects(old => ({ ...old, ...Object.fromEntries(['skillButton', 'drawRevealKeepButton', 'godKeepHandButton', 'dodgeRollButton', 'swapBlindHand'].map(name => [`${name}Rect`, refs[`${name}Ref`].current?.getBoundingClientRect()])) }));
    });
    return () => cancelAnimationFrame(handle);
  }, [scene, layout.vw, layout.vh, refs]);

  const baseProps = {
    ...layout, ...callbacks, ...refs, ...rects,
    gs: state, me: state.players[0], visualMe: state.players[0], visualPlayers: state.players,
    visualDiscard: state.discard, visualCurrentTurn: state.currentTurn, currentTurnPlayer: state.players[state.currentTurn],
    displayStats: Object.fromEntries(state.players.map(player => [player.id, { hp: player.hp, san: player.san }])),
    visibleLog: LOG, ri: RINFO[state.players[0].role], skillRi: RINFO[state.players[0].role],
    phase: state.phase, myTurn: !waiting, isVisualPlayerTurn: !waiting, isMultiplayer: state._isMP,
    isSpectating: id === 'battle-spectate', decisionContext: { localCanAct: !waiting, presentation: waiting ? 'waiting' : 'interactive' },
    isActionControlsHidden: waiting, canShowEndTurnButton: true, effectiveHandLimit: 5,
    effectiveSkillName: RINFO[state.players[0].role].skillName, isSelfDeadPanelDimmed: id === 'battle-spectate',
    displayPhaseLabel: scene[1], cardHintText: '选择手牌或行动按钮',
    promptWarningTextColor: '#e7a48b', promptActiveTextColor: '#e3cf9a', promptCautionTextColor: '#cfaa6b',
    promptSafeTextColor: '#a9bc92', promptMutedTextColor: '#a59475',
    hitIndices: [], sanHitIndices: [], hpHealIndices: [], sanHealIndices: [], guillotinedPids: new Set(),
    godHighlightPanelBursts: {}, damageLinkGhosts: [], damageLinkEstablishAnims: [], huntAbandoned: [],
    isLocalSeatIndex: localSeat, isLocalCurrentTurn: () => !waiting, isLocalNyaBorrowPhase: truth,
    isLocalTortoiseSelectPhase: () => !waiting, isLocalGodChoice: !waiting, isLocalDrawDecision: !waiting,
    isLocalTreasureDodgePhase: () => !waiting, isLocalTreasureAoEDodgePhase: () => !waiting,
    isLocalFirstComePicker: () => !waiting, isLocalSameAbyssTargetPhase: () => !waiting, isLocalSphinxGuessPhase: () => !waiting,
    isTutorialActionAllowed: truth, hasHuntRevealableCard: truth, isMyCardClickable: truth,
    canPlayerRespondWithAnyHandCard: truth, canPlayerRespondWithFireHandCard: truth, cardsHuntMatch: (a, b) => a.key === b.key,
    canShowTurnDecisionModal: true, runDecision: (_key, fn) => fn(),
    selectingOther: id.startsWith('target-'), canLocalTargetSelect: id.startsWith('target-'),
    cancelable: id.startsWith('target-') || id === 'hunt-confirm', showCancelBtn: id.startsWith('target-'),
    isDiscardPhasePromptActive: id === 'discard', isLocalHuntRevealPrompt: id === 'hunt-reveal',
    pendingRoleSelection: id === 'role', isDisconnected: id === 'reconnect', isSoloPaused: id === 'pause',
    exitMatchConfirm: id === 'exit' ? { message: '对局还在进行中，是否退出对局并离开房间？' } : null,
    decisionError: id === 'draw-error' ? new Error('Gallery retry state') : null,
    pendingZhuDrawCard: id === 'zhu-hide' ? ZONES[0] : null, pendingZhuAnyCard: id === 'zhu-wait',
    privatePeek: id === 'peek' ? { card: ZONES[3], targetName: '艾伦' } : null,
    showTutorial: !!scene[4], tutorialStep: scene[4] || null,
    pendingSoftGuideId: id === 'soft-rest' ? 'rest' : id === 'soft-flip' ? 'flip' : null,
    softGuideSpotlights: rects.panelRect ? [{ id: 'self', rect: rects.panelRect.toJSON() }] : [],
    showEmojiPicker: id === 'emoji', emojiButtonPos: { top: 150, right: 30 },
    gamma: 1, musicVolume: 0.6, sfxVolume: 0.8,
    settingsDefaultOpen: id === 'settings',
    mpTurnSec: 36, mpDiscardSec: 12, mpHuntSec: 18, mpDecisionSec: 20,
    houndsTimerVisible: id === 'battle-status', houndsSecLeft: 17,
    serverAnnouncement: id === 'announcement' ? '服务器将于 10 分钟后维护，请在当前对局结束后返回主界面。' : null,
    globalStyles: GLOBAL_STYLES,
    battleBackgroundStyle: {
      ...Object.fromEntries(Object.entries(theme).filter(([key]) => ['text', 'strong', 'muted', 'panel', 'panelActive', 'line', 'lineDim', 'glow'].includes(key)).map(([key, value]) => [`--toe-${key.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}`, value])),
      backgroundImage: `linear-gradient(${theme.tintTop},${theme.tintBottom}),url('${buildPublicUrl(getBattleBackgroundImage(expansionKey))}')`,
      backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: theme.bg,
    },
    returnToMainMenu: () => onScene('battle'), setIsSoloPaused: paused => onScene(paused ? 'pause' : 'battle'),
    setExitMatchConfirm: value => onScene(value ? 'exit' : 'battle-mp'),
    swapBlindDraw: ['swap-blind', 'swap-shuffle', 'tutorial-treasureStealCard'].includes(id) ? {
      targetPi: 1, phase: id === 'swap-shuffle' ? 'shuffling' : 'selecting',
      handSnapshot: state.players[1].hand.map((card, idx) => ({ idx, card, isFaceUp: false })),
    } : null,
    swapBlindCardLayout: { width: 110, height: 110 * CARD_FACE_RATIO, scale: 110 / 82, gap: 18, spacing: 128, maxWidth: '92vw', titleFontSize: 22, nameFontSize: 12, hintFontSize: 14 },
    ...phaseUi,
    ...preferences,
    handleUiSfxCapture: noop,
    handleGamma: gamma => setPreferences(old => ({ ...old, gamma })),
    handleMusicVolume: musicVolume => setPreferences(old => ({ ...old, musicVolume })),
    handleSfxVolume: sfxVolume => setPreferences(old => ({ ...old, sfxVolume })),
    advanceTutorialStep: () => {
      const next = getTutorialStep(scene[4])?.next;
      onScene(next && SCENES.some(item => item[0] === `tutorial-${next}`) ? `tutorial-${next}` : 'battle');
    },
    completeTutorial: () => onScene('battle'),
  };
  return <BattleScreen {...baseProps} />;
}

function LobbyFixture({ scene, onAction, onScene }) {
  const [ready, setReady] = useState(scene[0] === 'room-ready' || scene[0] === 'room-start');
  const [dontShow, setDontShow] = useState(false);
  const id = scene[0];
  const room = { roomId: '873261', owner: id === 'room-member' ? 'other' : 'local', isPrivate: id === 'room-private', count: 4, max: 12,
    players: [{ uuid: 'local', username: '你', ready }, { uuid: 'other', username: '雾港来客', ready: true }, { uuid: 'third', username: '旧日调查员', ready: id === 'room-start' }, { uuid: 'fourth', username: '艾伦', isAI: true, ready: true }] };
  return <>
    <div className="gallery-lobby-background" />
    {id.startsWith('room') && <RoomModal roomModal={room} playerUUID="local" cdType={id === 'room-start' ? 'start' : id === 'room-kick' ? 'kick' : null} cdSecondsLeft={8} onClose={() => onScene('lobby')} onTogglePrivacy={() => onScene('privacy')} onSetReady={setReady} onCopyRoomId={() => onAction('房间号：873261')} />}
    {id.startsWith('lobby') && <LobbyModal lobbyModal lobbyLoading={id === 'lobby-loading'} lobbyRooms={id === 'lobby-empty' ? [] : [{ roomId: '873261', count: 4, max: 12 }, { roomId: '204839', count: 2, max: 12 }, { roomId: '651927', count: 8, max: 12 }]} onClose={() => onScene('battle')} onRefresh={() => onAction('已刷新固定样板房间')} onJoinRoom={() => onScene('room')} />}
    {id === 'privacy' && <PrivacyToggleModal show dontShowAgain={dontShow} onChangeDontShow={setDontShow} onConfirm={() => onScene('room')} onCancel={() => onScene('room-private')} />}
    {id === 'connection-error' && <ConnectionErrorModal show onClose={() => onScene('battle')} />}
    {id === 'tutorial-welcome' && <TutorialOverlay show step={1} onStart={() => onScene('tutorial-intro')} onComplete={() => onScene('battle')} />}
  </>;
}

function OnlineFixture({ scene, onAction, onScene }) {
  const [joinRoomInput, setJoinRoomInput] = useState('');
  const [renameInputVisible, setRenameInputVisible] = useState(scene[0].startsWith('online-rename'));
  const [playerUsername, setPlayerUsername] = useState('雾港来客');
  const [renameInput, setRenameInput] = useState('雾港来客');
  return <>
    <div className="gallery-lobby-background" />
    <OnlineOptionsDialog open onClose={() => onScene('battle')} multiLoading={scene[0] === 'online-loading'}
      handleCreateRoom={() => onScene('room')} handleOpenLobby={() => onScene('lobby')}
      joinRoomInput={joinRoomInput} setJoinRoomInput={setJoinRoomInput}
      handleJoinRoom={() => joinRoomInput.length === 6 ? onScene('room-member') : onAction('请输入 6 位房间号')}
      renameInputVisible={renameInputVisible} setRenameInputVisible={setRenameInputVisible}
      renameInput={renameInput} setRenameInput={setRenameInput} handleRename={() => setPlayerUsername(renameInput)}
      handleRandomUsername={() => setRenameInput('旧日调查员')} renameCdActive={scene[0] === 'online-rename-cooldown'}
      playerUsername={playerUsername} playerUsernameSpecial={scene[0] === 'online-special-name'} />
  </>;
}

function ResultFixture({ scene, expansionKey, onAction, onScene }) {
  const id = scene[0];
  const players = makeState(scene, expansionKey).players;
  const winner = id === 'result-hunter' || id === 'result-other-team' ? '追猎者'
    : id === 'result-cultist' ? '邪祀者' : id === 'result-defeat' ? 'LOSE' : id === 'result-all-dead' ? 'LOSE_ALL' : '寻宝者';
  const iWon = !['result-treasure-other', 'result-other-team', 'result-defeat', 'result-all-dead'].includes(id);
  if (iWon) players[0].role = winner;
  if (id === 'result-defeat') Object.assign(players[0], { isDead: true, hp: 0 });
  if (id === 'result-all-dead') players.forEach(player => Object.assign(player, { isDead: true, hp: 0 }));
  const reason = { '寻宝者': '集齐全部字母与数字编号，寻得遗迹深处的宝藏。', '追猎者': '所有非追猎者均已倒下。', '邪祀者': '最后的封印崩塌，邪神自深渊中复苏。', LOSE: '你的探索到此终结。', LOSE_ALL: '遗迹吞噬了最后一位探索者。' }[winner];
  return <GameResultScreen players={players} gameOver={{ winner, winnerIdx: id === 'result-treasure-other' ? 3 : 0, winnerIdx2: id === 'result-treasure-joint' ? 3 : undefined, reason }}
    iWon={iWon} isMultiplayer={id === 'result-mp'} onReturnRoom={() => onScene('room')} onRestart={() => onScene('role')}
    onHome={() => onScene('battle')} onShowLog={() => onScene('full-log')}
    onClickCapture={event => { if (event.target.closest('.surveyMascot')) { event.stopPropagation(); onAction('问卷入口'); } }} />;
}

function DebugFixture({ onAction }) {
  const [settings, setSettings] = useState({ debugForceCard: true, debugForceCardTarget: 'player', debugForceCardKeep: 'auto', debugForceCardType: 'zone', debugForceZoneCardKey: 'A1', debugForceZoneCardName: '坠落', debugForceGodCardKey: 'CTH', debugTutorialPromptMode: 'auto', debugExpansionKey: '地神的潜影', debugRoleCompositionKey: 'random' });
  const setters = Object.fromEntries(Object.keys(settings).map(key => [`set${key[0].toUpperCase()}${key.slice(1)}`, value => setSettings(old => ({ ...old, [key]: value }))]));
  return <DebugControls isLocalTestMode localDebugMode showSettings {...settings} {...setters} onToggleDebugMode={() => onAction('切换调试开关')} onToggleShowSettings={() => onAction('关闭开发设置')} />;
}

function CardClarityFixture() {
  const zone = {
    ...FIXED_ZONE_CARD_VARIANTS_BY_KEY.C1.find(card => card.name === '石化配方'),
    key: 'C1', letter: 'C', num: 1, id: 'gallery-clarity-zone',
  };
  const token = { ...createBlackGoatYoungCard(), id: 'gallery-clarity-token' };
  return <main className="gallery-card-clarity">
    <header>
      <div className="toe-subtitle">图片卡面 · 手牌接入样板</div>
      <h1 className="toe-title">卡牌清晰度对照</h1>
      <p>同一张长说明区域牌，以四种实际宽度呈现。小手牌保留卡面外的编号与牌名，悬停可查看放大详情。</p>
    </header>
    <section className="gallery-clarity-panel" aria-label="同一张区域牌的四种尺寸">
      <h2>C1 · 石化配方</h2>
      <div className="gallery-clarity-row">
        {[82, 124, 196, 300].map(width => <figure key={width} data-clarity-width={width} style={{ width }}>
          <figcaption>{width} px 宽</figcaption>
          <DDCard card={zone} frameStyle={{ width }} />
        </figure>)}
      </div>
      <p className="gallery-clarity-description">{zone.desc}</p>
    </section>
    <section className="gallery-clarity-panel" aria-label="邪神牌与衍生牌对照">
      <h2>邪神牌与衍生牌</h2>
      <div className="gallery-clarity-row">
        <figure style={{ width: 82 }}><figcaption>邪神 · 82 px</figcaption><DDCard card={GODS[0]} godLevel={2} /></figure>
        <figure style={{ width: 196 }}><figcaption>邪神 · 196 px · Lv.2</figcaption><DDCard card={GODS[0]} godLevel={2} frameStyle={{ width: 196 }} /></figure>
        <figure style={{ width: 82 }}><figcaption>衍生牌 · 82 px</figcaption><DDCard card={token} /></figure>
        <figure style={{ width: 196 }}><figcaption>衍生牌 · 196 px</figcaption><DDCard card={token} frameStyle={{ width: 196 }} /></figure>
      </div>
    </section>
  </main>;
}

export function GalleryScenePreview({ scene, expansionKey, onAction, onScene }) {
  const id = scene[0];
  const close = () => onScene('battle');
  if (id === 'card-clarity') return <CardClarityFixture />;
  if (id.startsWith('online')) return <OnlineFixture scene={scene} onAction={onAction} onScene={onScene} />;
  if (scene[2] === '结算') return <ResultFixture scene={scene} expansionKey={expansionKey} onAction={onAction} onScene={onScene} />;
  if (scene[2] === '联机' || ['connection-error', 'tutorial-welcome'].includes(id)) return <LobbyFixture scene={scene} onAction={onAction} onScene={onScene} />;
  return <>
    <BattleFixture scene={scene} expansionKey={expansionKey} onAction={onAction} onScene={onScene} />
    {id === 'about' && <AboutModal onClose={close} />}
    {id === 'roadmap' && <RoadmapModal onClose={close} />}
    {id.startsWith('full-log') && <FullLogModal log={id === 'full-log-empty' ? [] : LOG} onClose={close} />}
    {id === 'discard-pile' && <DiscardOverlay cards={[...ZONES.slice(0, 8), ...GODS]} onClose={close} />}
    {(id === 'card-zone-detail' || id === 'card-god-detail') && <CardFaceTooltip card={id === 'card-god-detail' ? GODS[0] : ZONES[0]} godLevel={2} position={{ left: 120, top: 400, width: 82, height: 82 * CARD_FACE_RATIO }} />}
    {id === 'treasure-win' && <TreasureMapAnim hand={ZONES} onConfirm={() => onAction('宣布胜利')} />}
    {id === 'treasure-wait' && <TreasureMapAnim hand={ZONES} subtitle="艾伦集齐了全部编号" waitingLabel="正在等待艾伦宣布胜利…" />}
    {id === 'resurrection' && <GodResurrectionAnim onDone={noop} />}
    {id.startsWith('role-reveal-') && <RoleRevealAnim role={Object.keys(RINFO)[Number(id.at(-1))]} onDone={noop} />}
    {id === 'debug-settings' && <DebugFixture onAction={onAction} />}
  </>;
}

export default function VisualGallery() {
  const params = new URLSearchParams(window.location.search);
  const [sceneId, setSceneId] = useState(params.get('scene') || 'role');
  const [expansionKey, setExpansionKey] = useState(params.get('expansion') || '地神的潜影');
  const [toast, setToast] = useState('');
  const scene = SCENES.find(item => item[0] === sceneId) || SCENES[0];
  const clean = params.get('clean') === '1';
  function selectScene(id) {
    const next = new URL(window.location.href);
    next.searchParams.set('scene', id);
    window.history.replaceState(null, '', next);
    setSceneId(id);
    setToast('');
  }
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(''), 2400);
    return () => clearTimeout(timeout);
  }, [toast]);
  return <div data-ui-gallery-scene={scene[0]} className="toe-visual-gallery">
    <style>{GLOBAL_STYLES}</style>
    <GalleryScenePreview key={`${scene[0]}-${expansionKey}`} scene={scene} expansionKey={expansionKey} onAction={message => setToast(`样板反馈 · ${message}`)} onScene={selectScene} />
    {!clean && <nav className="gallery-toolbar" aria-label="界面样板导航">
      <strong>界面样板</strong>
      <select aria-label="选择功能界面" value={scene[0]} onChange={event => selectScene(event.target.value)}>
        {[...new Set(SCENES.map(item => item[2]))].map(group => <optgroup key={group} label={group}>{SCENES.filter(item => item[2] === group).map(item => <option key={item[0]} value={item[0]}>{item[1]}</option>)}</optgroup>)}
      </select>
      <select aria-label="选择扩展主题" value={expansionKey} onChange={event => setExpansionKey(event.target.value)}>
        {['地神的潜影', '先贤的馈赠', '群星呼唤', '析骨为柴'].map(key => <option key={key}>{key}</option>)}
      </select>
      <span>{SCENES.length} 个固定状态 · 真实组件 · 本地交互</span>
      <a href={`?ui-gallery=1&scene=${encodeURIComponent(scene[0])}&expansion=${encodeURIComponent(expansionKey)}&clean=1`}>纯净截图</a>
    </nav>}
    {toast && <output className="gallery-toast">{toast}</output>}
  </div>;
}

// Read-only catalog shared with the render smoke check and contact-sheet export.
VisualGallery.scenes = SCENES;
