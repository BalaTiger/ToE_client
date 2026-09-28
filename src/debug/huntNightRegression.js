import { FIXED_ZONE_CARD_VARIANTS_BY_KEY } from '../constants/card';
import { aiStep } from '../game/aiTurn';
import { getApophisNightForLevel } from '../game/apophisNight';
import { buildAiHuntWaitPresentation, buildScopedAiActionReplayState, scopeAiActionReplayMetadata } from '../game/aiTurnPresentation';
import { compileRuleVisualEventsToAnimTransaction } from '../game/visualEventTransactionCompiler';
import { getTurnStartDrawBaselineLog } from '../game/turnAnimState';

// A deterministic rule input for the DEV browser regression controls. Card
// definitions and settlement/presentation code are the normal game modules.
export function createHuntNightRegressionState() {
  let nextCardId = 0;
  const card = key => ({
    ...FIXED_ZONE_CARD_VARIANTS_BY_KEY[key][0],
    id: `hunt-regression-card-${nextCardId++}`,
    key, letter: key[0], number: Number(key.slice(1)), isZone: true,
  });
  const seats = [
    { name: '你', role: '寻宝者', hp: 10, hand: [card('D1')] },
    { name: '卡洛斯', role: '追猎者', hp: 10, hand: ['A1', 'D2', 'B2'].map(card) },
    { name: '黛安娜', role: '邪祀者', hp: 6, hand: Array.from({ length: 3 }, () => card('A2')) },
    { name: '艾伦', role: '寻宝者', hp: 9, hand: [card('B3')] },
  ];
  const players = seats.map((seat, id) => ({
    id, san: 10, roleRevealed: true, zoneCards: [], godZone: [],
    godName: null, godLevel: 0, hasBelievedGod: false, peekMemories: {},
    isDead: false, isResting: false, revealHand: false, damageLink: null,
    godEncounters: 0, godEncounterCount: 0,
    disableRest: false, disableSkill: false, handLimitDecrease: 0,
    disableRestNextTurn: false, disableSkillNextTurn: false, handLimitDecreaseNextTurn: 0,
    ...seat,
  }));
  return {
    players, deck: [], discard: [], inspectionDeck: [], inspectionDiscard: [],
    currentTurn: 1, phase: 'AI_TURN', drawReveal: null, selectedCard: null,
    abilityData: {}, gameOver: null, turn: 1, turnDirection: 1, _turnKey: 1,
    skillUsed: false, restUsed: false, multiplyUsed: false, huntAbandoned: [],
    godFromHandUsed: false, godTriggeredThisTurn: false, _isMP: false,
    _aiTurnIntroShown: true, _visualEvents: [], _statEvents: [], _statEventSeq: 0,
    expansionKey: '地神的潜影', deckExpansionKey: '地神的潜影',
    log: ['浏览器回归：卡洛斯连续追捕黛安娜，随后黑夜偏移到你。'],
    apophisNight: getApophisNightForLevel(1),
  };
}

export function resolveHuntNightRegression(previousState) {
  // This synchronous scope includes AI target tie breaks and loot draws. No
  // asynchronous browser work runs before the original RNG is restored.
  const random = Math.random;
  let seed = 565;
  let result;
  try {
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    result = aiStep(previousState);
  } finally {
    Math.random = random;
  }
  const targets = result._aiHuntEvents?.map(event => event.targetIdx);
  const rolls = result._visualEvents?.filter(event => event.type === 'apophisTarget').map(event => event.roll);
  if (result.phase !== 'PLAYER_REVEAL_FOR_HUNT'
    || targets?.join(',') !== '2,2,0' || rolls?.join(',') !== '6,6,1') {
    throw new Error(`Hunt regression input changed: ${result.phase}; targets=${targets}; rolls=${rolls}`);
  }
  const presentation = buildAiHuntWaitPresentation({
    previousState, rawResult: result, nextState: result,
    isDrawnCardActuallyDiscarded: () => false,
    buildActorTurnStartReplay: () => null,
    buildTurnStartIntroQueue: () => [],
  });
  return presentation;
}

export function createAiSwapNightRegressionState() {
  const base = createHuntNightRegressionState();
  let nextCardId = 0;
  const card = key => ({
    ...FIXED_ZONE_CARD_VARIANTS_BY_KEY[key][0],
    id: `swap-regression-card-${nextCardId++}`,
    key, letter: key[0], number: Number(key.slice(1)), isZone: true,
  });
  return {
    ...base,
    players: base.players.slice(0, 3).map(player => ({
      ...player, hp: 10, san: 10, role: '寻宝者', roleRevealed: false,
      hand: [card('A1'), card('B1')],
    })),
    deck: [card('B3'), card('B3')],
    globalOnlySwapOwner: null,
    _apophisTargetSeq: 0,
    log: ['浏览器回归：黑夜使卡洛斯掉包目标偏移到黛安娜，双方暗中交换手牌。'],
  };
}

export function resolveAiSwapNightRegression(previousState) {
  const random = Math.random;
  let result;
  try {
    Math.random = () => 0.01;
    result = aiStep(previousState);
  } finally {
    Math.random = random;
  }
  const metadata = scopeAiActionReplayMetadata(result);
  const swap = metadata.visualEvents.find(event => event.type === 'swapCards');
  const night = metadata.visualEvents.find(event => event.type === 'apophisTarget');
  if (swap?.sourceIdx !== 1 || swap?.targetIdx !== 2 || !night?.changed) {
    throw new Error(`AI swap regression input changed: source=${swap?.sourceIdx}; target=${swap?.targetIdx}; shifted=${night?.changed}`);
  }
  const state = { ...result, _visualEvents: metadata.visualEvents, _statEvents: metadata.statEvents };
  const queue = compileRuleVisualEventsToAnimTransaction(state, previousState, {
    hidePrivateCards: true,
  }).queue;
  const transfers = queue.filter(step => step.type === 'CARD_TRANSFER');
  if (transfers.length !== 2 || transfers.some(step => step.cards?.length)) {
    throw new Error('AI swap regression must contain both private card transfers');
  }
  // The browser exercise ends at this action boundary. The rule engine has
  // also resolved the next AI draw; keep that separate from this replay.
  const nextState = {
    ...buildScopedAiActionReplayState({
      state: result, metadata,
      players: result._playersBeforeNextDraw,
      discard: result._discardBeforeNextDraw || result.discard,
      log: getTurnStartDrawBaselineLog(result),
    }),
    deck: [...previousState.deck], currentTurn: 0, phase: 'ACTION',
    drawReveal: null, abilityData: {}, _playersBeforeThisDraw: null,
    _preTurnPlayers: null, _aiDrawnCard: null, _drawnCard: null,
    _endTurnReplay: null, _aiTurnIntroShown: true,
  };
  return {
    queue, nextState,
    eventIds: metadata.visualEvents.map(event => event.id),
    externalVisualLocks: [], inspectionEvents: [], roseThornSnapshot: null,
  };
}
