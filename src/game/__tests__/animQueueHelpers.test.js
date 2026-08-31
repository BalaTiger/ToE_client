import { describe, expect, it } from 'vitest';
import {
  CARD_ACQUISITION_STAGE,
  buildBewitchForcedCardQueue,
  buildSphinxResultQueue,
  buildFullHandSwapStepsFromLogs,
  buildInspectionEventFlow,
  getFreshInspectionReplayEvents,
  buildWorshipReplayBaselinePlayers,
  buryToDeckStep,
  cardTransferStep,
  dedupeInferredDiscardTransfers,
  fullHandSwapSteps,
  insertHuntResolutionStatePatch,
  mergePlayerStatsIntoSnapshot,
  consumeRetainedRandomTargetEvents,
  discardStep,
  deriveHandTransferSnapshot,
  prepareWorshipHighlight,
  resolveTurnHighlightForStep,
  swapCardsSteps,
  zhuHideCardStep,
} from '../animQueueHelpers';
import {
  compileFreshVisualEventQueue as buildAnimQueue,
  compileFreshVisualEventReplay,
} from '../visualEventTransactionCompiler';
import { copyPlayers, ROLE_CULTIST, ROLE_TREASURE } from '../coreUtils';
import { createCardEffectEvent, createGodStatusChangedEvent, createInspectionVisualEvent, createRandomTargetVisualEvent, createStatEventsEvent, VISUAL_EVENT } from '../visualEvents';
import { resolveAiGodChoiceTransition } from '../aiDecisionState';
import { scopeAiReplayMetadataBeforeInspection } from '../aiTurnPresentation';
import { resolveGodEncounterForAI, startNextTurn } from '../turnEngine';
import { makeGodCard, makeGs, makePlayer, makeZoneCard } from './factory';

describe('animQueueHelpers', () => {
  it('AI 蛊惑鼠群时自残扣血紧跟对应检定翻牌', () => {
    const gift = makeZoneCard('D3', 0, { id: 'rat-swarm', name: '鼠群' });
    const playersBeforeRatSwarm = [
      makePlayer({ name: '黛安娜', hp: 10, san: 6 }),
      makePlayer({ name: '卡洛斯', hp: 10, san: 6 }),
      makePlayer({ name: '艾伦', hp: 10, san: 6 }),
      makePlayer({ name: '贝拉', hp: 10, san: 6 }),
    ];
    const afterRatSwarm = copyPlayers(playersBeforeRatSwarm);
    afterRatSwarm.forEach(player => { player.san = 5; });
    const afterSelfHarm = copyPlayers(afterRatSwarm);
    afterSelfHarm[2].hp = 8;
    const bewitchLog = '卡洛斯（邪祀者）对 黛安娜 【蛊惑】，赠予 [D3] 鼠群';
    const ratSwarmLog = '全体存活角色失去 1 SAN';
    const prefix = [bewitchLog, ratSwarmLog];
    const ratSwarmStats = playersBeforeRatSwarm.map((player, target) => ({
      seq: 1,
      type: 'SAN_LOSS',
      target,
      from: { hp: player.hp, san: player.san, isDead: false },
      to: { hp: player.hp, san: afterRatSwarm[target].san, isDead: false },
      reason: '鼠群',
      logHint: ratSwarmLog,
    }));
    const selfHarmLog = '艾伦 自残，失去 2 HP';
    const selfHarmStat = {
      seq: 2,
      type: 'HP_LOSS',
      target: 2,
      from: { hp: 10, san: 5, isDead: false },
      to: { hp: 8, san: 5, isDead: false },
      reason: '自残',
      logHint: selfHarmLog,
    };
    const inspections = [
      {
        seq: 1,
        card: { id: 'insomnia', name: '失眠', effect: 'disableRest' },
        target: 1,
        beforePlayers: afterRatSwarm,
        afterPlayers: afterRatSwarm,
        beforeLog: prefix,
        afterLog: [...prefix, '卡洛斯 的SAN检定结果为"失眠"', '卡洛斯 失眠，下一回合禁用休息'],
        beforeStatEventSeq: 1,
        statEvents: [],
      },
      {
        seq: 2,
        card: { id: 'self-harm', name: '自残', effect: 'selfDamageHP', value: 2 },
        target: 2,
        beforePlayers: afterRatSwarm,
        afterPlayers: afterSelfHarm,
        beforeLog: [...prefix, '卡洛斯 的SAN检定结果为"失眠"', '卡洛斯 失眠，下一回合禁用休息'],
        afterLog: [...prefix, '卡洛斯 的SAN检定结果为"失眠"', '卡洛斯 失眠，下一回合禁用休息', '艾伦 的SAN检定结果为"自残"', selfHarmLog],
        revealMsgs: ['艾伦 的SAN检定结果为"自残"'],
        effectMsgs: [selfHarmLog],
        beforeStatEventSeq: 1,
        statEvents: [selfHarmStat],
        statEventSeq: 2,
      },
      {
        seq: 3,
        card: { id: 'fatigue', name: '乏力', effect: 'handLimitDecrease' },
        target: 3,
        beforePlayers: afterSelfHarm,
        afterPlayers: afterSelfHarm,
        beforeLog: [...prefix, '卡洛斯 的SAN检定结果为"失眠"', '卡洛斯 失眠，下一回合禁用休息', '艾伦 的SAN检定结果为"自残"', selfHarmLog],
        afterLog: [...prefix, '卡洛斯 的SAN检定结果为"失眠"', '卡洛斯 失眠，下一回合禁用休息', '艾伦 的SAN检定结果为"自残"', selfHarmLog, '贝拉 的SAN检定结果为"乏力"', '贝拉 乏力，下一回合手牌上限-1'],
        beforeStatEventSeq: 2,
        statEvents: [],
      },
    ];
    const actionMetadata = scopeAiReplayMetadataBeforeInspection({
      statEvents: [...ratSwarmStats, selfHarmStat],
      statEventSeq: 2,
    }, inspections[0]);
    const actionPrelude = buildAnimQueue(
      { players: playersBeforeRatSwarm, log: [], _statEvents: [], _statEventSeq: 0 },
      { players: afterRatSwarm, log: prefix, _statEvents: actionMetadata.statEvents, _statEventSeq: actionMetadata.statEventSeq },
    );
    const inspectionFlow = buildInspectionEventFlow(
      { players: afterRatSwarm, log: prefix, _statEvents: ratSwarmStats, _statEventSeq: 1 },
      inspections,
      { buildAnimQueue, copyPlayers },
    );
    const queue = buildBewitchForcedCardQueue(
      1,
      0,
      gift,
      '黛安娜',
      [...actionPrelude, ...inspectionFlow.queue],
      [bewitchLog],
    );
    const selfHarmRevealIdx = queue.findIndex(step => step.type === 'DRAW_CARD' && step.card === inspections[1].card);
    const selfHarmDamageIdx = queue.findIndex(step => step.type === 'HP_DAMAGE');
    const fatigueRevealIdx = queue.findIndex(step => step.type === 'DRAW_CARD' && step.card === inspections[2].card);

    expect(actionPrelude.some(step => step.type === 'HP_DAMAGE')).toBe(false);
    expect(selfHarmRevealIdx).toBeGreaterThan(-1);
    expect(selfHarmDamageIdx).toBeGreaterThan(selfHarmRevealIdx);
    expect(selfHarmDamageIdx).toBeLessThan(fatigueRevealIdx);
    expect(queue[selfHarmDamageIdx]).toMatchObject({
      hitIndices: [2],
      msgs: [selfHarmLog],
    });
  });

  it('追捕响应动画完成后在同一队列内退出旧交互阶段', () => {
    const discard={type:'DISCARD',card:{id:'hunter-card'}};
    const damage={type:'HP_DAMAGE',hitIndices:[0]};
    const source=[discard,damage];

    const queue=insertHuntResolutionStatePatch(source,{
      phase:'AI_TURN',
      currentTurn:1,
      abilityData:{},
    });

    expect(source).toEqual([discard,damage]);
    expect(queue).toEqual([
      discard,
      {type:'STATE_PATCH',phase:'AI_TURN',currentTurn:1,abilityData:{}},
      damage,
    ]);
  });

  it('多人追捕结算没有弃牌步骤时也会在首个可见动画后清理确认态', () => {
    expect(insertHuntResolutionStatePatch([
      {type:'VISUAL_LOCK',players:[]},
      {type:'TURN_BOUNDARY_PAUSE'},
    ],{phase:'ACTION',abilityData:{}})).toEqual([
      {type:'VISUAL_LOCK',players:[]},
      {type:'TURN_BOUNDARY_PAUSE'},
      {type:'STATE_PATCH',phase:'ACTION',abilityData:{}},
    ]);
  });

  it('AI_GOD_CHOICE 收入邪神馈赠时由新的结果事件统一生成飞牌和落点状态', () => {
    const godCard = makeGodCard('NYA', { id: 'deferred-god-gift-keep' });
    const pendingGs = startNextTurn(makeGs({
      players: [
        makePlayer({ name: '你' }),
        makePlayer({ name: '艾伦', role: '邪祀者', roleRevealed: true, hand: [] }),
      ],
      currentTurn: 0,
      deck: [godCard],
      log: [],
    }));
    const drawEvent = pendingGs._visualEvents.find(event => (
      event?.type === VISUAL_EVENT.DRAW_CARD && event.card?.id === godCard.id
    ));

    expect(pendingGs.phase).toBe('AI_GOD_CHOICE');
    expect(pendingGs.abilityData.drawEventId).toBe(drawEvent.id);

    const transition = resolveAiGodChoiceTransition(pendingGs);
    const keepEvent = transition.state._visualEvents.find(event => (
      event?.type === VISUAL_EVENT.GOD_GIFT_KEEP
    ));
    const replay = compileFreshVisualEventReplay(
      pendingGs,
      transition.state,
    );
    const ownedSteps = replay.queue.filter(step => step?.visualEventId === keepEvent.id);

    expect(keepEvent).toMatchObject({
      drawEventId: drawEvent.id,
      drawerIdx: 1,
      card: expect.objectContaining({ id: godCard.id }),
    });
    expect(ownedSteps.map(step => step.type)).toEqual(['CARD_TRANSFER', 'STATE_PATCH']);
    expect(ownedSteps[0]).toMatchObject({
      fromPid: 1,
      toPid: 1,
      dest: 'player',
      sourceAnchor: 'playerArea',
      cards: [expect.objectContaining({ id: godCard.id })],
    });
    expect(ownedSteps[1].players[1].hand).toContainEqual(expect.objectContaining({ id: godCard.id }));
  });

  it('邪神馈赠收入事件在同批SAN检定完成后才飞入手牌', () => {
    const godCard = makeGodCard('NYA', { id: 'inspected-god-gift-keep' });
    const inspectionCard = { id: 'calm-after-god', name: '暂时的平静', effect: 'nothing', value: 0, type: 'neutral' };
    const pendingGs = startNextTurn(makeGs({
      players: [
        makePlayer({ name: '你' }),
        makePlayer({ name: '艾伦', role: '邪祀者', roleRevealed: false, san: 6, hand: [] }),
      ],
      currentTurn: 0,
      deck: [godCard],
      inspectionDeck: [inspectionCard],
      inspectionDiscard: [],
      log: [],
    }));
    const transition = resolveAiGodChoiceTransition(pendingGs);
    const keepEvent = transition.state._visualEvents.find(event => event?.type === VISUAL_EVENT.GOD_GIFT_KEEP);
    const replay = compileFreshVisualEventReplay(
      pendingGs,
      transition.state,
    );
    const inspectionIdx = replay.queue.findIndex(step => (
      step?.type === 'DRAW_CARD' && step.card?.id === inspectionCard.id
    ));
    const transferIdx = replay.queue.findIndex(step => (
      step?.type === 'CARD_TRANSFER' && step.visualEventId === keepEvent.id
    ));

    expect(keepEvent.presentAfterInspectionSeq).toBeGreaterThan(0);
    expect(inspectionIdx).toBeGreaterThan(-1);
    expect(transferIdx).toBeGreaterThan(inspectionIdx);
  });

  it('AI 摸神牌抢夺信仰时按结算子阶段推进且旧信徒状态不回退', () => {
    const drawnGod = makeGodCard('TSG', { id: 'new-tsg' });
    const abandonedGod = makeGodCard('TSG', { id: 'old-tsg' });
    const inspectionCard = { id: 'insomnia', name: '失眠', effect: 'disableRest', value: 1, type: 'negative' };
    const pendingGs = startNextTurn(makeGs({
      players: [
        makePlayer({ name: '你' }),
        makePlayer({ name: '卡洛斯', san: 10 }),
        makePlayer({ name: '艾伦', san: 7, godName: 'TSG', godLevel: 1, godZone: [abandonedGod] }),
      ],
      currentTurn: 0,
      deck: [drawnGod],
      inspectionDeck: [inspectionCard],
      inspectionDiscard: [],
      log: [],
    }));
    const transition = resolveAiGodChoiceTransition(pendingGs);
    const replay = compileFreshVisualEventReplay(pendingGs, transition.state);
    const queue = replay.queue;
    const highlightIndices = queue
      .map((step, index) => step?.type === 'GOD_HIGHLIGHT' && step?.targetPid === 1 ? index : -1)
      .filter(index => index >= 0);
    const abandonIndices = queue
      .map((step, index) => step?.effect === 'godAbandon' && step?.fromPid === 2 ? index : -1)
      .filter(index => index >= 0);
    const abandonSanIdx = queue.findIndex(step => (
      step?.type === 'SAN_DAMAGE' && step?.hitIndices?.includes(2)
    ));
    const inspectionIdx = queue.findIndex(step => step?.inspectionSeq != null && step?.targetPid === 2);

    expect(highlightIndices).toHaveLength(1);
    expect(abandonIndices).toHaveLength(1);
    expect(abandonIndices[0]).toBeGreaterThan(highlightIndices[0]);
    expect(abandonSanIdx).toBeGreaterThan(abandonIndices[0]);
    expect(inspectionIdx).toBeGreaterThan(abandonSanIdx);

    expect(queue[highlightIndices[0]].visualTimeline.at(-1).patch.players[2]).toMatchObject({
      godName: 'TSG',
      godLevel: 1,
      godZone: [abandonedGod],
    });
    expect(queue[abandonIndices[0]].visualTimeline.at(-1).patch.players[2]).toMatchObject({
      godName: null,
      godLevel: 0,
      godZone: [],
    });

    const stepsAfterAbandon = queue.slice(abandonIndices[0] + 1);
    const playerSnapshots = [
      queue[abandonIndices[0]].visualTimeline.at(-1).patch.players,
      ...stepsAfterAbandon.flatMap(step => [
      step?.players,
      step?.visualSetupPatch?.players,
      ...(step?.visualTimeline || []).map(frame => frame?.patch?.players),
      ]),
    ].filter(Array.isArray);
    expect(playerSnapshots.every(players => (
      players[2]?.godName == null && players[2]?.godLevel === 0 && players[2]?.godZone?.length === 0
    ))).toBe(true);
  });

  it('AI 摸神牌抢夺信仰时会暂停并让回合外旧信徒决定虚化', () => {
    const drawnGod = makeGodCard('TSG', { id: 'new-tsg-etherealize' });
    const abandonedGod = makeGodCard('TSG', { id: 'old-tsg-etherealize' });
    const pendingGs = startNextTurn(makeGs({
      players: [
        makePlayer({ name: '你', hp: 8, san: 8 }),
        makePlayer({ name: '贝拉', hp: 8, san: 8 }),
        makePlayer({
          name: '艾伦',
          hp: 8,
          san: 8,
          etherealizeStacks: 1,
          godName: 'TSG',
          godLevel: 1,
          godZone: [abandonedGod],
        }),
      ],
      currentTurn: 0,
      deck: [drawnGod],
      log: [],
    }));

    const transition = resolveAiGodChoiceTransition(pendingGs);

    expect(transition.state.phase).toBe('ETHEREALIZE_DECISION');
    expect(transition.state.abilityData).toMatchObject({
      type: 'etherealizeRedirect',
      targetIdx: 2,
      lostSan: 1,
      _turnOwner: 1,
    });
    expect(transition.state.players[2]).toMatchObject({
      san: 8,
      etherealizeStacks: 1,
      godName: null,
    });
    expect(transition.state.log).toContain('艾伦 被邪神抛弃，即将失去 1 SAN');
  });

  it('改信者先退出旧信仰并完成 SAN 检定，再建立并高亮新信仰', () => {
    const oldGod = makeGodCard('NYA', { id: 'old-nya' });
    const newGod = makeGodCard('TSG', { id: 'new-tsg-convert' });
    const inspectionCard = { id: 'fatigue', name: '乏力', effect: 'handLimitDecrease', value: 1, type: 'negative' };
    const oldGs = makeGs({
      players: [
        makePlayer({ name: '你' }),
        makePlayer({ name: '卡洛斯', san: 7, godName: 'NYA', godLevel: 1, godZone: [oldGod] }),
      ],
      currentTurn: 1,
      inspectionDeck: [inspectionCard],
      inspectionDiscard: [],
      log: [],
    });
    const result = resolveGodEncounterForAI(
      1,
      newGod,
      copyPlayers(oldGs.players),
      [],
      [],
      oldGs,
      true,
    );
    const newGs = {
      ...oldGs,
      players: result.P,
      deck: result.D,
      discard: result.Disc,
      log: result.msgs,
      ...result.inspectionMeta,
      ...result.statePatch,
    };
    const queue = compileFreshVisualEventReplay(oldGs, newGs).queue;
    const exitIdx = queue.findIndex(step => step?.effect === 'godConvertDiscard' && step?.fromPid === 1);
    const sanIdx = queue.findIndex(step => step?.type === 'SAN_DAMAGE' && step?.hitIndices?.includes(1));
    const inspectionIdx = queue.findIndex(step => step?.inspectionSeq != null && step?.targetPid === 1);
    const highlightIdx = queue.findIndex(step => step?.type === 'GOD_HIGHLIGHT' && step?.targetPid === 1);

    expect(exitIdx).toBeGreaterThanOrEqual(0);
    expect(sanIdx).toBeGreaterThan(exitIdx);
    expect(inspectionIdx).toBeGreaterThan(sanIdx);
    expect(highlightIdx).toBeGreaterThan(inspectionIdx);
    expect(queue.filter(step => step?.effect === 'godConvertDiscard')).toHaveLength(1);
    expect(queue.filter(step => step?.type === 'GOD_HIGHLIGHT' && step?.targetPid === 1)).toHaveLength(1);
    expect(queue[highlightIdx].visualEventId).toBeTruthy();
    expect(queue[exitIdx].visualTimeline.at(-1).patch.players[1]).toMatchObject({
      godName: null,
      godLevel: 0,
      godZone: [],
      san: 7,
    });
    expect(queue[highlightIdx].visualSetupPatch.players[1]).toMatchObject({ godName: null, godLevel: 0 });
    expect(queue[highlightIdx].visualTimeline.at(-1).patch.players[1]).toMatchObject({ godName: 'TSG', godLevel: 1 });
  });

  it('遭遇与改信连续检定时只播放一次旧神牌弃置且保持正面', () => {
    const oldGod = makeGodCard('NYA', { id: 'reported-old-god' });
    const forestLord = makeGodCard('SHU', { id: 'reported-forest-lord' });
    const truthGain = makeZoneCard('A1', 0, { id: 'reported-truth-gain' });
    const truth = { id: 'reported-truth', name: '揭开真相', effect: 'drawCard', value: 1, type: 'positive' };
    const selfHarm = { id: 'reported-self-harm', name: '自残', effect: 'selfDamageHP', value: 2, type: 'negative' };
    const base = makeGs({
      players: [
        makePlayer({ name: '你', role: ROLE_CULTIST }),
        makePlayer({
          name: '贝拉', role: ROLE_TREASURE, hp: 10, san: 7, godEncounters: 2,
          godName: 'NYA', godLevel: 1, godZone: [oldGod],
        }),
      ],
      currentTurn: 0,
      deck: [forestLord, truthGain],
      inspectionDeck: [truth, selfHarm],
      inspectionDiscard: [],
      log: [],
    });
    const pending = startNextTurn(base);
    const transition = resolveAiGodChoiceTransition(pending);
    const queue = compileFreshVisualEventReplay(
      pending,
      transition.state,
    ).queue;
    const faithDiscards = queue.filter(step => (
      step?.type === 'CARD_TRANSFER'
      && ['godConvertDiscard', 'godAbandon'].includes(step?.effect)
      && step?.fromPid === 1
    ));
    const truthIdx = queue.findIndex(step => step?.type === 'DRAW_CARD' && step?.card?.id === truth.id);
    const discardIdx = queue.indexOf(faithDiscards[0]);
    const convertSanIdx = queue.findIndex((step, index) => (
      index > discardIdx && step?.type === 'SAN_DAMAGE'
      && step?.hitIndices?.includes(1)
    ));
    const selfHarmIdx = queue.findIndex((step, index) => (
      index > convertSanIdx
      && step?.type === 'DRAW_CARD'
      && step?.targetPid === 1
      && step?.inspectionSeq != null
    ));

    expect(faithDiscards).toHaveLength(1);
    expect(faithDiscards[0]).toMatchObject({
      effect: 'godConvertDiscard',
      cards: [oldGod],
      dest: 'discard',
      faceUp: true,
    });
    expect(truthIdx).toBeLessThan(discardIdx);
    expect(discardIdx).toBeLessThan(convertSanIdx);
    expect(convertSanIdx).toBeLessThan(selfHarmIdx);
  });

  it('改信 SAN 不触发检定时仍在新信仰 highlight 之前结算', () => {
    const oldGod = makeGodCard('NYA', { id: 'old-nya-no-inspection' });
    const newGod = makeGodCard('TSG', { id: 'new-tsg-no-inspection' });
    const oldGs = makeGs({
      players: [
        makePlayer({ name: '你' }),
        makePlayer({ name: '卡洛斯', san: 9, godName: 'NYA', godLevel: 1, godZone: [oldGod] }),
      ],
      currentTurn: 1,
      log: [],
    });
    const result = resolveGodEncounterForAI(1, newGod, copyPlayers(oldGs.players), [], [], oldGs, true);
    const newGs = {
      ...oldGs,
      players: result.P,
      deck: result.D,
      discard: result.Disc,
      log: result.msgs,
      ...result.inspectionMeta,
      ...result.statePatch,
    };
    const queue = compileFreshVisualEventReplay(oldGs, newGs).queue;
    const exitIdx = queue.findIndex(step => step?.effect === 'godConvertDiscard' && step?.fromPid === 1);
    const sanIdx = queue.findIndex(step => step?.type === 'SAN_DAMAGE' && step?.hitIndices?.includes(1));
    const highlightIdx = queue.findIndex(step => step?.type === 'GOD_HIGHLIGHT' && step?.targetPid === 1);

    expect([exitIdx, sanIdx, highlightIdx].every(index => index >= 0)).toBe(true);
    expect(exitIdx).toBeLessThan(sanIdx);
    expect(sanIdx).toBeLessThan(highlightIdx);
    expect(queue[sanIdx].visualSetupPatch.players[1]).toMatchObject({
      godName: null,
      godLevel: 0,
      godZone: [],
      san: 9,
    });
    expect(queue[sanIdx].visualTimeline.at(-1).patch.players[1]).toMatchObject({
      godName: null,
      godLevel: 0,
      godZone: [],
      san: 8,
    });
    expect(queue[highlightIdx].visualSetupPatch.players[1]).toMatchObject({ godName: null, godLevel: 0, san: 8 });
  });

  it('被抛弃 SAN 不触发检定时仍在 APO 即时神力之前结算', () => {
    const newGod = makeGodCard('APO', { id: 'new-apo-no-inspection' });
    const followerGod = makeGodCard('APO', { id: 'old-apo-no-inspection' });
    const oldGs = makeGs({
      players: [
        makePlayer({ name: '你' }),
        makePlayer({ name: '卡洛斯', san: 9 }),
        makePlayer({ name: '艾伦', san: 9, godName: 'APO', godLevel: 1, godZone: [followerGod] }),
      ],
      currentTurn: 1,
      log: [],
    });
    const result = resolveGodEncounterForAI(1, newGod, copyPlayers(oldGs.players), [], [], oldGs, true);
    const newGs = {
      ...oldGs,
      players: result.P,
      deck: result.D,
      discard: result.Disc,
      log: result.msgs,
      ...result.inspectionMeta,
      ...result.statePatch,
    };
    const queue = compileFreshVisualEventReplay(oldGs, newGs).queue;
    const highlightIdx = queue.findIndex(step => step?.type === 'GOD_HIGHLIGHT' && step?.targetPid === 1);
    const exitIdx = queue.findIndex(step => step?.effect === 'godAbandon' && step?.fromPid === 2);
    const sanIdx = queue.findIndex(step => step?.type === 'SAN_DAMAGE' && step?.hitIndices?.includes(2));
    const powerIdx = queue.findIndex(step => step?.type === 'APOPHIS_ECLIPSE');

    expect([highlightIdx, exitIdx, sanIdx, powerIdx].every(index => index >= 0)).toBe(true);
    expect(highlightIdx).toBeLessThan(exitIdx);
    expect(exitIdx).toBeLessThan(sanIdx);
    expect(sanIdx).toBeLessThan(powerIdx);
    expect(queue[exitIdx].visualTimeline.at(-1).patch.players[2]).toMatchObject({
      godName: null,
      godLevel: 0,
      godZone: [],
      san: 9,
    });
    expect(queue[sanIdx].visualSetupPatch.players[2]).toMatchObject({ godName: null, godLevel: 0, san: 9 });
    expect(queue[sanIdx].visualTimeline.at(-1).patch.players[2]).toMatchObject({
      godName: null,
      godLevel: 0,
      godZone: [],
      san: 8,
    });
  });

  it('改信与旧信徒被抛弃各自拥有独立的退出、SAN 与检定子阶段', () => {
    const oldGod = makeGodCard('NYA', { id: 'actor-old-nya' });
    const newGod = makeGodCard('TSG', { id: 'actor-new-tsg' });
    const followerGod = makeGodCard('TSG', { id: 'follower-old-tsg' });
    const inspectionCards = [
      { id: 'insomnia-1', name: '失眠', effect: 'disableRest', value: 1, type: 'negative' },
      { id: 'insomnia-2', name: '失眠', effect: 'disableRest', value: 1, type: 'negative' },
    ];
    const oldGs = makeGs({
      players: [
        makePlayer({ name: '你' }),
        makePlayer({ name: '卡洛斯', san: 7, godName: 'NYA', godLevel: 1, godZone: [oldGod] }),
        makePlayer({ name: '艾伦', san: 7, godName: 'TSG', godLevel: 1, godZone: [followerGod] }),
      ],
      currentTurn: 1,
      inspectionDeck: inspectionCards,
      inspectionDiscard: [],
      log: [],
    });
    const result = resolveGodEncounterForAI(1, newGod, copyPlayers(oldGs.players), [], [], oldGs, true);
    const newGs = {
      ...oldGs,
      players: result.P,
      deck: result.D,
      discard: result.Disc,
      log: result.msgs,
      ...result.inspectionMeta,
      ...result.statePatch,
    };
    const queue = compileFreshVisualEventReplay(oldGs, newGs).queue;
    const actorExitIdx = queue.findIndex(step => step?.effect === 'godConvertDiscard' && step?.fromPid === 1);
    const actorSanIdx = queue.findIndex(step => step?.type === 'SAN_DAMAGE' && step?.hitIndices?.includes(1));
    const actorInspectionIdx = queue.findIndex(step => step?.inspectionSeq != null && step?.targetPid === 1);
    const highlightIdx = queue.findIndex(step => step?.type === 'GOD_HIGHLIGHT' && step?.targetPid === 1);
    const followerExitIdx = queue.findIndex(step => step?.effect === 'godAbandon' && step?.fromPid === 2);
    const followerSanIdx = queue.findIndex(step => step?.type === 'SAN_DAMAGE' && step?.hitIndices?.includes(2));
    const followerInspectionIdx = queue.findIndex(step => step?.inspectionSeq != null && step?.targetPid === 2);

    const orderedFaithSettlementIndices = [
      actorExitIdx,
      actorSanIdx,
      actorInspectionIdx,
      highlightIdx,
      followerExitIdx,
      followerSanIdx,
      followerInspectionIdx,
    ];
    expect(orderedFaithSettlementIndices.every(index => index >= 0)).toBe(true);
    expect(orderedFaithSettlementIndices).toEqual([...orderedFaithSettlementIndices].sort((a, b) => a - b));
    expect(queue.filter(step => step?.effect === 'godConvertDiscard')).toHaveLength(1);
    expect(queue.filter(step => step?.effect === 'godAbandon')).toHaveLength(1);
    expect(queue.filter(step => step?.type === 'GOD_HIGHLIGHT' && step?.targetPid === 1)).toHaveLength(1);

    const snapshotsAfterFollowerExit = [
      queue[followerExitIdx].visualTimeline.at(-1).patch.players,
      ...queue.slice(followerExitIdx + 1).flatMap(step => [
        step?.players,
        step?.visualSetupPatch?.players,
        ...(step?.visualTimeline || []).map(frame => frame?.patch?.players),
      ]),
    ].filter(Array.isArray);
    expect(snapshotsAfterFollowerExit.every(players => (
      players[2]?.godName == null && players[2]?.godLevel === 0 && players[2]?.godZone?.length === 0
    ))).toBe(true);
  });

  it('does not collapse consecutive explicit god status events for one player', () => {
    const levelOne = { type: 'GOD_HIGHLIGHT', targetPid: 1, godKey: 'TSG', godLevel: 1, visualEventId: 'god:1' };
    const levelTwo = { type: 'GOD_HIGHLIGHT', targetPid: 1, godKey: 'TSG', godLevel: 2, visualEventId: 'god:2' };

    const queue = prepareWorshipHighlight([levelOne, levelTwo, { ...levelTwo }], { targetPid: 1, godKey: 'TSG' });

    expect(queue.filter(step => step.type === 'GOD_HIGHLIGHT')).toEqual([levelOne, levelTwo]);
  });

  it('从手牌升级时在 GOD_HIGHLIGHT 前保持原邪神之力 tag', () => {
    const oldGod = makeGodCard('TSG', { id: 'tsg-lv1' });
    const upgradeGod = makeGodCard('TSG', { id: 'tsg-lv2' });
    const remainingCard = makeZoneCard('A1', 0);
    const before = [makePlayer({
      name: '艾伦',
      hand: [remainingCard, upgradeGod],
      godName: 'TSG',
      godLevel: 1,
      godZone: [oldGod],
    })];
    const after = [makePlayer({
      ...before[0],
      hand: [remainingCard],
      godName: 'TSG',
      godLevel: 2,
      godZone: [oldGod, upgradeGod],
    })];

    const baseline = buildWorshipReplayBaselinePlayers(before, after, 0);
    const upgradeEvent = createGodStatusChangedEvent({
      playerIdx: 0,
      playerName: '艾伦',
      godKey: 'TSG',
      godLevel: 2,
      msgs: ['艾伦 从手牌升级邪神之力至 Lv.2'],
      playersBefore: before,
      playersAfter: after,
    });
    const oldGs = makeGs({ players: baseline, log: [] });
    const newGs = {
      ...oldGs,
      players: after,
      log: upgradeEvent.msgs,
      _visualEvents: [upgradeEvent],
    };
    const queue = prepareWorshipHighlight(
      compileFreshVisualEventReplay(oldGs, newGs).queue,
      { targetPid: 0, godKey: 'TSG', players: after },
    );
    const highlight = queue.find(step => step.type === 'GOD_HIGHLIGHT');

    expect(baseline[0]).toMatchObject({
      hand: [remainingCard],
      godName: 'TSG',
      godLevel: 1,
      godZone: [oldGod],
    });
    expect(highlight.visualSetupPatch.players[0]).toMatchObject({ godName: 'TSG', godLevel: 1 });
    expect(highlight.visualTimeline.at(-1).patch.players[0]).toMatchObject({ godName: 'TSG', godLevel: 2 });
    expect(after[0]).toMatchObject({ godName: 'TSG', godLevel: 2 });
  });

  it('斯芬克斯猜对后把同一张明牌从揭示区收入手牌', () => {
    const card = makeZoneCard('B1', 0);
    const playersAfterResult = [makePlayer({ name: '你' }), makePlayer({ name: '贝拉', hand: [card] })];
    const queue = buildSphinxResultQueue({
      card,
      actorIdx: 2,
      guessCorrect: true,
      msgs: ['贝拉猜测牌堆顶的牌是区域牌', '猜测正确！贝拉收入了 [B1]'],
      playersAfterResult,
    });

    expect(queue.map(step => step.type)).toEqual(['DRAW_CARD', 'CARD_TRANSFER', 'STATE_PATCH']);
    expect(queue[0]).toMatchObject({
      card,
      triggerName: '斯芬克斯',
      targetPid: 2,
      skipTravel: true,
      guessCorrect: true,
    });
    expect(queue[1]).toMatchObject({
      dest: 'player',
      toPid: 2,
      sourceAnchor: 'reveal',
      effect: 'sphinxResult',
      cards: [card],
    });
    expect(queue[2]).toMatchObject({ type: 'STATE_PATCH', players: playersAfterResult });
  });

  it('斯芬克斯猜错后先把同一张明牌移入弃牌堆，再播放伤害', () => {
    const card = makeZoneCard('C2', 0);
    const queue = buildSphinxResultQueue({
      card,
      actorIdx: 1,
      guessCorrect: false,
      msgs: ['艾伦猜测牌堆顶的牌不是区域牌', '猜测错误！艾伦失去 3 HP'],
      resultQueue: [
        { type: 'DRAW_CARD', card },
        { type: 'CARD_TRANSFER', dest: 'discard' },
        { type: 'HP_DAMAGE', hitIndices: [1] },
      ],
    });

    expect(queue.map(step => step.type)).toEqual(['DRAW_CARD', 'CARD_TRANSFER', 'HP_DAMAGE']);
    expect(queue[1]).toMatchObject({
      dest: 'discard',
      sourceAnchor: 'reveal',
      effect: 'sphinxResult',
      cards: [card],
    });
  });

  it('本地信仰阿波菲斯时先提交邪神标签且只播放一次高亮，再进入日食', () => {
    const players = [makePlayer({ name: '你', godName: 'APO', godLevel: 1 })];
    const firstHighlight = { type: 'GOD_HIGHLIGHT', targetPid: 0, godKey: 'APO', msgs: ['你 从手牌信仰 阿波菲斯'] };
    const queue = prepareWorshipHighlight([
      firstHighlight,
      { type: 'APOPHIS_ECLIPSE', msgs: ['【噬日灭世】黑夜降临'] },
      { type: 'GOD_HIGHLIGHT', targetPid: 0, godKey: 'APO', msgs: [] },
      { type: 'SAN_DAMAGE', hitIndices: [0], visualSetupPatch: { players: [makePlayer({ name: '你', san: 10 })] } },
    ], { targetPid: 0, godKey: 'APO', players });

    expect(queue.map(step => step.type)).toEqual(['GOD_HIGHLIGHT', 'APOPHIS_ECLIPSE', 'SAN_DAMAGE']);
    expect(queue[0]).toMatchObject({
      targetPid: 0,
      godKey: 'APO',
      visualSetupPatch: { players },
    });
    expect(queue[2].visualSetupPatch.players[0]).toMatchObject({
      godName: 'APO',
      godLevel: 1,
      san: 10,
    });
  });

  it('蛊惑中间快照保留牌区外观但使用结算后的 HP/SAN', () => {
    const oldGod = { id: 'old-god', godKey: 'VRI' };
    const newGod = { id: 'new-god', godKey: 'ZHU' };
    const visualSnapshot = [
      makePlayer({ name: '贝拉', hand: [{ id: 'gift' }], san: 9 }),
      makePlayer({ name: '艾伦', hand: [{ id: 'keep' }], san: 9, godName: 'VRI', godZone: [oldGod] }),
    ];
    const resolvedPlayers = [
      makePlayer({ name: '贝拉', hand: [], san: 8 }),
      makePlayer({ name: '艾伦', hand: [{ id: 'keep' }], san: 6, godName: 'ZHU', godZone: [newGod] }),
    ];

    const merged = mergePlayerStatsIntoSnapshot(visualSnapshot, resolvedPlayers);

    expect(merged.map(player => player.san)).toEqual([8, 6]);
    expect(merged[1].godName).toBe('VRI');
    expect(merged[1].godZone).toEqual([oldGod]);
    expect(visualSnapshot.map(player => player.san)).toEqual([9, 9]);
  });

  it('AI 行动基线将已保留的随机目标事件视为已消费', () => {
    const state = consumeRetainedRandomTargetEvents({
      _randomTargetSeq: 1,
      _visualEvents: [
        createRandomTargetVisualEvent({ seq: 4, sourceIdx: 0, targetIdx: 1 }),
        createRandomTargetVisualEvent({ seq: 2, sourceIdx: 1, targetIdx: 0 }),
      ],
    });

    expect(state._randomTargetSeq).toBe(4);
  });

  it('从中文回合开始日志解析当前角色高亮', () => {
    const step = { type: 'YOUR_TURN', msgs: ['── 测试角色B 的回合开始 ──'] };
    const players = [makePlayer({ name: '测试角色A' }), makePlayer({ name: '测试角色B' })];

    expect(resolveTurnHighlightForStep(step, { players })).toBe(1);
  });

  it('通用移动动画步骤携带各自的视觉预锁', () => {
    const players = [makePlayer({ hand: [{ id: 'old-card' }] })];

    expect(zhuHideCardStep({ id: 'zhu-card' })).toMatchObject({
      type: 'ZHU_HIDE_CARD',
      visualSetupPatch: { hiddenZhuCardId: 'zhu-card' },
    });
    expect(buryToDeckStep({ fromPid: 0, msgs: ['活埋'], players })).toMatchObject({
      type: 'BURY_TO_DECK',
      fromPid: 0,
      msgs: ['活埋'],
      visualSetupPatch: { players },
    });
    expect(cardTransferStep({ fromPid: 0, dest: 'player', toPid: 1, count: 1 })).toEqual({
      type: 'CARD_TRANSFER',
      fromPid: 0,
      dest: 'player',
      toPid: 1,
      count: 1,
    });
    expect(cardTransferStep()).toEqual({ type: 'CARD_TRANSFER' });
    expect(cardTransferStep({ dest: 'discard' })).toEqual({
      type: 'CARD_TRANSFER',
      dest: 'discard',
      faceUp: true,
    });
  });

  it('飞牌步骤携带 before/after 快照时自动生成起始锁与飞行中段提交', () => {
    const before = [makePlayer({ name: '你', hand: [{ id: 'a' }] }), makePlayer({ name: '艾伦', hand: [] })];
    const after = [makePlayer({ name: '你', hand: [] }), makePlayer({ name: '艾伦', hand: [{ id: 'a' }] })];

    expect(cardTransferStep({
      fromPid: 0, dest: 'player', toPid: 1, count: 1,
      playersBefore: before, playersAfter: after,
    })).toEqual({
      type: 'CARD_TRANSFER',
      fromPid: 0,
      dest: 'player',
      toPid: 1,
      count: 1,
      visualSetupTiming: 'stepStart',
      visualSetupPatch: { players: before },
      visualTimeline: [{ atMs: 360, patch: { players: after } }],
    });
  });

  it('弃牌步骤只提交手牌变化,不会提前泄漏事件终态', () => {
    const discarded = { id: 'discarded' };
    const before = [makePlayer({ name: '你', hp: 4, san: 8, hand: [discarded, { id: 'keep' }] })];
    const finalPlayers = [makePlayer({ name: '你', hp: 0, san: 2, isDead: true, hand: [] })];
    const step = discardStep({
      card: discarded,
      targetPid: 0,
      playersBefore: before,
      playersAfter: finalPlayers,
      discardBefore: [],
      discardAfter: [discarded],
    });

    expect(step.visualSetupPatch.players[0].hand.map(card => card.id)).toEqual(['discarded', 'keep']);
    expect(step.visualTimeline).toHaveLength(1);
    expect(step.visualTimeline[0].atMs).toBe(360);
    expect(step.visualTimeline[0].patch.players[0].hand.map(card => card.id)).toEqual(['keep']);
    expect(step.visualTimeline[0].patch.players[0]).toMatchObject({ hp: 4, san: 8, isDead: false });
  });

  it('弃牌 before 快照优先级高于残留 setup patch,避免起始态回退到终态', () => {
    const discarded = { id: 'discarded-setup' };
    const before = [makePlayer({ hand: [discarded, { id: 'keep' }], hp: 8 })];
    const leaked = [makePlayer({ hand: [{ id: 'keep' }], hp: 0, isDead: true })];
    const step = discardStep({
      card: discarded,
      targetPid: 0,
      playersBefore: before,
      visualSetupPatch: { players: leaked },
    });

    expect(step.visualSetupPatch.players[0]).toMatchObject({ hp: 8, isDead: false });
    expect(step.visualSetupPatch.players[0].hand.map(card => card.id)).toEqual(['discarded-setup', 'keep']);
  });

  it('转移作用域快照只应用换牌本身,不带入后续结算', () => {
    const gift = { id: 'echo', name: '空谷传音' };
    const before = [
      makePlayer({ name: '你', san: 10, hand: [gift, { id: 'keep' }] }),
      makePlayer({ name: '艾伦', san: 10, hand: [{ id: 'ai-card' }] }),
    ];

    const snapshot = deriveHandTransferSnapshot(before, { fromPid: 0, toPid: 1, card: gift });
    expect(snapshot[0].hand.map(card => card.id)).toEqual(['keep']);
    expect(snapshot[1].hand.map(card => card.id)).toEqual(['ai-card', 'echo']);
    expect(snapshot[0].san).toBe(10);
    expect(snapshot[1].san).toBe(10);
    // 原快照不被修改
    expect(before[0].hand).toHaveLength(2);

    // god 牌被蛊惑后直接遭遇,不进入目标手牌
    const godSnapshot = deriveHandTransferSnapshot(before, { fromPid: 0, toPid: 1, card: gift, toHand: false });
    expect(godSnapshot[0].hand.map(card => card.id)).toEqual(['keep']);
    expect(godSnapshot[1].hand.map(card => card.id)).toEqual(['ai-card']);
  });

  it('整手交换 helper 可统一生成视觉锁和双向飞牌', () => {
    const players = [
      makePlayer({ name: '你', hand: [{ id: 'a' }, { id: 'b' }] }),
      makePlayer({ name: '艾伦', hand: [{ id: 'c' }] }),
    ];

    expect(fullHandSwapSteps({
      fromPid: 0,
      toPid: 1,
      fromCount: 2,
      toCount: 1,
      msgs: ['交换完成'],
      playersBefore: players,
      zhuLight: { owner: 0 },
    })).toEqual([
      { type: 'VISUAL_LOCK', players, zhuLight: { owner: 0 } },
      { type: 'CARD_TRANSFER', fromPid: 0, dest: 'player', toPid: 1, count: 2 },
      { type: 'CARD_TRANSFER', fromPid: 1, dest: 'player', toPid: 0, count: 1, msgs: ['交换完成'] },
    ]);
  });

  it('掉包单牌交换 helper 先播放目标牌飞向掉包者，再播放还牌飞回目标', () => {
    const players = [makePlayer({ name: '你' }), makePlayer({ name: '艾伦' })];
    const takenCard = { id: 'taken' };
    const givenCard = { id: 'given' };

    expect(swapCardsSteps({
      sourceIdx: 1,
      targetIdx: 0,
      sourceCount: 1,
      targetCount: 1,
      takenCard,
      givenCard,
      msgs: ['艾伦（寻宝者）对 你 【掉包】'],
      playersBefore: players,
    })).toEqual([
      { type: 'VISUAL_LOCK', players, zhuLight: null },
      { type: 'CARD_TRANSFER', fromPid: 0, dest: 'player', toPid: 1, count: 1, cards: [takenCard] },
      { type: 'CARD_TRANSFER', fromPid: 1, dest: 'player', toPid: 0, count: 1, cards: [givenCard], msgs: ['艾伦（寻宝者）对 你 【掉包】'] },
    ]);
  });

  it('可从交换全部手牌日志解析整手交换步骤', () => {
    const players = [
      makePlayer({ name: '你', hand: [{ id: 'a' }] }),
      makePlayer({ name: '艾伦', hand: [{ id: 'b' }, { id: 'c' }] }),
    ];

    const queue = buildFullHandSwapStepsFromLogs(
      ['你 与 艾伦 交换了全部手牌（1 张 ↔ 2 张）'],
      players,
      { playersBefore: players }
    );

    expect(queue.map(step => step.type)).toEqual(['VISUAL_LOCK', 'CARD_TRANSFER', 'CARD_TRANSFER']);
    expect(queue[1]).toMatchObject({ fromPid: 0, toPid: 1, count: 1 });
    expect(queue[2]).toMatchObject({ fromPid: 1, toPid: 0, count: 2 });
  });

  it('显式弃牌动画会覆盖同一来源的自动推断弃牌转移', () => {
    const queue = [
      { type: 'DISCARD', card: { id: 'a' }, targetPid: 1 },
      { type: 'CARD_TRANSFER', fromPid: 1, dest: 'discard', count: 1, inferredHandLoss: true },
      { type: 'HP_DAMAGE', hitIndices: [1] },
    ];

    expect(dedupeInferredDiscardTransfers(queue).map(step => step.type)).toEqual(['DISCARD', 'HP_DAMAGE']);
  });

  it('自动推断弃牌转移在没有显式动画时保留兜底能力', () => {
    const queue = [
      { type: 'CARD_TRANSFER', fromPid: 1, dest: 'discard', count: 1, inferredHandLoss: true },
    ];

    expect(dedupeInferredDiscardTransfers(queue)).toEqual(queue);
  });

  it('黏液爆裂动画会覆盖同一来源的自动推断弃牌转移', () => {
    const queue = [
      { type: 'TSG_SLIME_POP', targetPid: 2, count: 1 },
      { type: 'CARD_TRANSFER', fromPid: 2, dest: 'discard', count: 1, inferredHandLoss: true },
    ];

    expect(dedupeInferredDiscardTransfers(queue).map(step => step.type)).toEqual(['TSG_SLIME_POP']);
  });

  it('蛊惑强制赠牌动画先播放技能，再飞牌入目标手牌，最后播放结算状态', () => {
    const gift = makeZoneCard('A1', 0);
    const queue = buildBewitchForcedCardQueue(0, 2, gift, '目标角色', [
      { type: 'CARD_TRANSFER', fromPid: 2, dest: 'discard' },
      { type: 'YOUR_TURN', name: '目标角色' },
      { type: 'DRAW_CARD', card: { id: 'stale-draw', name: '残留摸牌' } },
      { type: 'DAMAGE', targetPid: 2 },
    ], ['邪祀者对目标角色【蛊惑】']);

    expect(queue.map(step => step.type)).toEqual([
      'SKILL_BEWITCH',
      'CARD_TRANSFER',
      'DRAW_CARD',
      'DAMAGE',
    ]);
    expect(queue[1]).toMatchObject({ fromPid: 0, toPid: 2, dest: 'player' });
    expect(queue[2]).toMatchObject({
      card: gift,
      triggerName: '目标角色',
      targetPid: 2,
      skipTravel: true,
      disableDrawBackgroundCamera: true,
    });
  });

  it('蛊惑赠牌后可先提交施法者手牌中间态，再继续目标结算', () => {
    const gift = makeZoneCard('A1', 0);
    const beforeSkillPlayers = [
      makePlayer({ name: '你', san: 9 }),
      makePlayer({ name: '贝拉', san: 9 }),
      makePlayer({ name: '目标角色', san: 9 }),
    ];
    const sourceAfterGift = makePlayer({ name: '贝拉', hand: [makeZoneCard('B1', 0)] });
    const queue = buildBewitchForcedCardQueue(1, 2, gift, '目标角色', [
      { type: 'TURN_BOUNDARY_PAUSE', msgs: ['目标结算'] },
    ], ['贝拉（邪祀者）对目标角色【蛊惑】'], {
      skillVisualSetupPatch: { players: beforeSkillPlayers },
      afterGiftPatch: { players: [makePlayer({ name: '你' }), sourceAfterGift, makePlayer({ name: '目标角色' })] },
    });

    expect(queue.map(step => step.type)).toEqual([
      'SKILL_BEWITCH',
      'CARD_TRANSFER',
      'STATE_PATCH',
      'DRAW_CARD',
      'TURN_BOUNDARY_PAUSE',
    ]);
    expect(queue[0].visualSetupPatch.players.map(player => player.san)).toEqual([9, 9, 9]);
    expect(queue[2]).toMatchObject({ players: expect.any(Array) });
    expect(queue[2].players[1].hand).toHaveLength(1);
  });

  it('蛊惑强制结算时保留带语义的连锁飞牌动画', () => {
    const gift = { id: 'shu-1', name: '森之领主', isGod: true };
    const queue = buildBewitchForcedCardQueue(0, 3, gift, '黛安娜', [
      { type: 'CARD_TRANSFER', fromPid: 3, dest: 'discard' },
      cardTransferStep({
        fromPid: 0,
        dest: 'player',
        toPid: 2,
        count: 1,
        sourceAnchor: 'godPower',
        effect: 'blackGoat',
        durationMs: 1500,
        msgs: ['【黑暗子嗣】卡洛斯 获得1张黑山羊幼仔'],
      }),
      cardTransferStep({
        fromPid: 1,
        dest: 'player',
        toPid: 0,
        count: 1,
        sourceAnchor: 'chainEffect',
        effect: 'futureChain',
        msgs: ['未来连锁飞牌'],
      }),
      { type: 'SAN_DAMAGE', hitIndices: [1] },
    ], ['你对 黛安娜 【蛊惑】，赠予 森之领主']);

    expect(queue.map(step => step.type)).toEqual([
      'SKILL_BEWITCH',
      'CARD_TRANSFER',
      'DRAW_CARD',
      'CARD_TRANSFER',
      'CARD_TRANSFER',
      'SAN_DAMAGE',
    ]);
    expect(queue[3]).toMatchObject({
      effect: 'blackGoat',
      sourceAnchor: 'godPower',
      toPid: 2,
      msgs: ['【黑暗子嗣】卡洛斯 获得1张黑山羊幼仔'],
    });
    expect(queue[4]).toMatchObject({
      effect: 'futureChain',
      sourceAnchor: 'chainEffect',
      msgs: ['未来连锁飞牌'],
    });
  });

  it('蛊惑邪神牌时 SAN_DAMAGE 在 GOD_HIGHLIGHT 之前，APOPHIS_ECLIPSE 在之后', () => {
    const apoCard = makeGodCard('APO');
    const playersAfter = [
      makePlayer({ name: '艾伦' }),
      makePlayer({ name: '你', godName: 'APO', godLevel: 1, hasBelievedGod: true }),
    ];
    const queue = buildBewitchForcedCardQueue(
      0,
      1,
      apoCard,
      '你',
      [
        { type: 'GOD_HIGHLIGHT', targetPid: 1, godKey: 'APO' },
        { type: 'APOPHIS_ECLIPSE' },
        { type: 'SAN_DAMAGE', hitIndices: [1] },
      ],
      ['艾伦（邪祀者）对你【蛊惑】，赠予阿波菲斯'],
      { playersAfter },
    );

    expect(queue.map(step => step.type)).toEqual([
      'SKILL_BEWITCH',
      'CARD_TRANSFER',
      'DRAW_CARD',
      'SAN_DAMAGE',
      'GOD_HIGHLIGHT',
      'APOPHIS_ECLIPSE',
    ]);
  });

  it('蛊惑森之领主时黑山羊幼仔飞牌排在 GOD_HIGHLIGHT 之后', () => {
    const shuCard = makeGodCard('SHU');
    const playersAfter = [
      makePlayer({ name: '艾伦' }),
      makePlayer({ name: '你', godName: 'SHU', godLevel: 1, hasBelievedGod: true }),
    ];
    const queue = buildBewitchForcedCardQueue(
      0,
      1,
      shuCard,
      '你',
      [
        { type: 'GOD_HIGHLIGHT', targetPid: 1, godKey: 'SHU' },
        cardTransferStep({
          fromPid: 1,
          dest: 'player',
          toPid: 2,
          count: 1,
          sourceAnchor: 'godPower',
          effect: 'blackGoat',
          durationMs: 1500,
        }),
        { type: 'SAN_DAMAGE', hitIndices: [1] },
      ],
      ['艾伦（邪祀者）对你【蛊惑】，赠予森之领主'],
      { playersAfter },
    );

    const highlightIdx = queue.findIndex(step => step.type === 'GOD_HIGHLIGHT' && step.targetPid === 1);
    const blackGoatIdx = queue.findIndex(
      step => step.type === 'CARD_TRANSFER' && step.effect === 'blackGoat',
    );
    expect(highlightIdx).toBeGreaterThan(-1);
    expect(blackGoatIdx).toBeGreaterThan(highlightIdx);
  });

  it('蛊惑烛九阴时牌堆点亮在 GOD_HIGHLIGHT 之后提交', () => {
    const zhuCard = makeGodCard('ZHU');
    const playersAfter = [
      makePlayer({ name: '艾伦' }),
      makePlayer({ name: '你', godName: 'ZHU', godLevel: 1, godZone: [zhuCard], hasBelievedGod: true }),
    ];
    const zhuLightAfter = { ownerIdx: 1, level: 1, cardIds: ['lit-1'], lightNonce: 2 };
    const queue = buildBewitchForcedCardQueue(
      0,
      1,
      zhuCard,
      '你',
      [],
      ['艾伦（邪祀者）对你【蛊惑】，赠予烛九阴'],
      { playersAfter, zhuLightBefore: null, zhuLightAfter },
    );

    const highlightIdx = queue.findIndex(step => step.type === 'GOD_HIGHLIGHT');
    const zhuLightIdx = queue.findIndex(step => step.type === 'STATE_PATCH' && step.zhuLight === zhuLightAfter);
    expect(highlightIdx).toBeGreaterThan(-1);
    expect(zhuLightIdx).toBeGreaterThan(highlightIdx);
    expect(queue[zhuLightIdx]).toMatchObject({
      players: playersAfter,
      cardAcquisitionStage: CARD_ACQUISITION_STAGE.ON_WORSHIP_POWER,
    });
  });

  it('蛊惑信仰时邪神之力被阻止的反馈排在 GOD_HIGHLIGHT 之后', () => {
    const apoCard = makeGodCard('APO');
    const playersAfter = [
      makePlayer({ name: '艾伦' }),
      makePlayer({ name: '你', godName: 'APO', godLevel: 1, godZone: [apoCard], hasBelievedGod: true }),
    ];
    const queue = buildBewitchForcedCardQueue(
      0,
      1,
      apoCard,
      '你',
      [
        { type: 'GOD_POWER_BLOCKED', targetPid: 1 },
        { type: 'GOD_HIGHLIGHT', targetPid: 1, godKey: 'APO' },
      ],
      [],
      { playersAfter },
    );

    expect(queue.map(step => step.type).slice(-2)).toEqual(['GOD_HIGHLIGHT', 'GOD_POWER_BLOCKED']);
    expect(queue.at(-1).cardAcquisitionStage).toBe(CARD_ACQUISITION_STAGE.ON_WORSHIP_POWER);
  });

  it('蛊惑邪神牌时 GOD_HIGHLIGHT 不重复且即时神力 snapshot 保留邪神徽章', () => {
    const apoCard = makeGodCard('APO');
    const playersAfter = [
      makePlayer({ name: '艾伦' }),
      makePlayer({
        name: '你',
        godName: 'APO',
        godLevel: 1,
        hasBelievedGod: true,
        godZone: [apoCard],
      }),
    ];
    const queue = buildBewitchForcedCardQueue(
      0,
      1,
      apoCard,
      '你',
      [
        { type: 'GOD_HIGHLIGHT', targetPid: 1, godKey: 'APO' },
        { type: 'GOD_HIGHLIGHT', targetPid: 1, godKey: 'APO' },
        { type: 'APOPHIS_ECLIPSE' },
        { type: 'SAN_DAMAGE', hitIndices: [1] },
        {
          type: 'STATE_PATCH',
          players: playersAfter.map(player => ({ ...player, godName: null })),
          cardAcquisitionStage: CARD_ACQUISITION_STAGE.ON_WORSHIP_POWER,
        },
      ],
      ['艾伦（邪祀者）对你【蛊惑】，赠予阿波菲斯'],
      { playersAfter },
    );

    expect(queue.filter(step => step.type === 'GOD_HIGHLIGHT' && step.targetPid === 1).length).toBe(1);
    const highlightIdx = queue.findIndex(step => step.type === 'GOD_HIGHLIGHT');
    const statePatchAfterHighlight = queue.find((step, idx) => idx > highlightIdx && step.type === 'STATE_PATCH');
    expect(statePatchAfterHighlight.players[1].godName).toBe('APO');
    expect(statePatchAfterHighlight.players[1].godLevel).toBe(1);
  });

  it('蛊惑邪神的遭遇与信仰结算保持检定链原子顺序', () => {
    const apoCard = makeGodCard('APO');
    const beforePlayers = [makePlayer({ name: '艾伦' }), makePlayer({ name: '你' })];
    const playersAfter = [
      beforePlayers[0],
      makePlayer({ name: '你', godName: 'APO', godLevel: 1, godZone: [apoCard], hasBelievedGod: true }),
    ];
    const encounterQueue = [
      { type: 'SAN_DAMAGE', marker: 'encounterDamage', hitIndices: [1] },
      { type: 'VISUAL_LOCK', marker: 'inspectionLock', players: beforePlayers },
      { type: 'DRAW_CARD', marker: 'inspectionReveal', card: makeZoneCard('B2'), triggerName: '检定牌', inspectionSeq: 1 },
      { type: 'HP_DAMAGE', marker: 'inspectionResult', hitIndices: [1] },
      { type: 'STATE_PATCH', marker: 'inspectionCommit', players: beforePlayers },
    ];
    const acceptanceQueue = [
      { type: 'STATE_PATCH', marker: 'faithCommit', players: playersAfter },
      { type: 'GOD_HIGHLIGHT', targetPid: 1, godKey: 'APO' },
      { type: 'APOPHIS_ECLIPSE' },
    ];
    const queue = buildBewitchForcedCardQueue(
      0,
      1,
      apoCard,
      '你',
      [...acceptanceQueue,...encounterQueue],
      ['艾伦（邪祀者）对你【蛊惑】，赠予阿波菲斯'],
      { playersAfter, encounterQueue, acceptanceQueue },
    );

    const markers = queue.filter(step => step.marker).map(step => step.marker);
    expect(markers).toEqual([
      'encounterDamage',
      'inspectionLock',
      'inspectionReveal',
      'inspectionResult',
      'inspectionCommit',
      'faithCommit',
    ]);
    const highlightIdx = queue.findIndex(step => step.type === 'GOD_HIGHLIGHT');
    const inspectionCommitIdx = queue.findIndex(step => step.marker === 'inspectionCommit');
    const eclipseIdx = queue.findIndex(step => step.type === 'APOPHIS_ECLIPSE');
    expect(highlightIdx).toBeGreaterThan(inspectionCommitIdx);
    expect(eclipseIdx).toBeGreaterThan(highlightIdx);
    expect(queue.slice(0, 3).every(step => step.cardAcquisitionStage === CARD_ACQUISITION_STAGE.ACQUISITION)).toBe(true);
    expect(queue.filter(step => step.marker?.startsWith('inspection') || step.marker === 'encounterDamage')
      .every(step => step.cardAcquisitionStage === CARD_ACQUISITION_STAGE.GOD_ENCOUNTER)).toBe(true);
    expect(queue.find(step => step.marker === 'faithCommit').cardAcquisitionStage).toBe(CARD_ACQUISITION_STAGE.ACCEPTANCE);
    expect(queue[highlightIdx].cardAcquisitionStage).toBe(CARD_ACQUISITION_STAGE.ACCEPTANCE);
    expect(queue[eclipseIdx].cardAcquisitionStage).toBe(CARD_ACQUISITION_STAGE.ON_WORSHIP_POWER);
  });

  it('遭遇检定后首次信仰时，抛弃信徒的 SAN 事件不被状态差分吞掉', () => {
    const godCard = makeGodCard('CTH', { id: 'cth-draw', name: '拉莱耶之主' });
    const oldFollowerGod = makeGodCard('CTH', { id: 'cth-bella' });
    const oldPlayers = [
      makePlayer({ name: '你' }),
      makePlayer({ name: '黛安娜', role: ROLE_TREASURE, san: 5 }),
      makePlayer({
        name: '贝拉',
        role: ROLE_TREASURE,
        san: 10,
        godName: 'CTH',
        godLevel: 1,
        godZone: [oldFollowerGod],
      }),
    ];
    const pendingState = makeGs({
      players: oldPlayers,
      currentTurn: 1,
      phase: 'AI_GOD_CHOICE',
      deck: [],
      discard: [],
      inspectionDeck: [{ id: 'seal-loosened', name: '封印松动', effect: 'nothing' }],
      inspectionDiscard: [],
      log: ['黛安娜 遭遇邪神 拉莱耶之主！（第1次）失去 1 SAN'],
      _statEvents: [{
        target: 1,
        from: { hp: 10, san: 6, isDead: false },
        to: { hp: 10, san: 5, isDead: false },
        reason: '邪神遭遇',
        logHint: '黛安娜 遭遇邪神 拉莱耶之主！（第1次）失去 1 SAN',
        seq: 1,
        type: 'SAN_LOSS',
      }],
      _statEventSeq: 1,
      _inspectionSeq: 0,
      abilityData: {
        playerIndex: 1,
        godCard,
        pendingEncounterInspection: true,
      },
    });
    const resolved = resolveAiGodChoiceTransition(pendingState).state;
    const queue = compileFreshVisualEventReplay(
      pendingState,
      resolved,
    ).queue;
    const inspectionIdx = queue.findIndex(step => step?.type === 'DRAW_CARD' && step?.inspectionSeq != null);
    const highlightIdx = queue.findIndex(step => step?.type === 'GOD_HIGHLIGHT');
    const abandonIdx = queue.findIndex(step => step?.effect === 'godAbandon');
    const sanIdx = queue.findIndex(step => step?.type === 'SAN_DAMAGE' && step?.hitIndices?.includes(2));

    expect([inspectionIdx, highlightIdx, abandonIdx, sanIdx].every(index => index >= 0)).toBe(true);
    expect([inspectionIdx, highlightIdx, abandonIdx, sanIdx]).toEqual(
      [...[inspectionIdx, highlightIdx, abandonIdx, sanIdx]].sort((a, b) => a - b),
    );
    expect(queue[sanIdx].statEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ target: 2, seq: 2, type: 'SAN_LOSS' }),
    ]));
  });

  it('普通蛊惑不因邪神牌后处理改变顺序', () => {
    const zoneCard = makeZoneCard('A1');
    const playersAfter = [makePlayer({ name: '艾伦' }), makePlayer({ name: '你' })];
    const queue = buildBewitchForcedCardQueue(
      0,
      1,
      zoneCard,
      '你',
      [{ type: 'SAN_DAMAGE', hitIndices: [1] }],
      ['艾伦（邪祀者）对你【蛊惑】，赠予空气'],
      { playersAfter },
    );

    expect(queue.map(step => step.type)).toEqual([
      'SKILL_BEWITCH',
      'CARD_TRANSFER',
      'DRAW_CARD',
      'SAN_DAMAGE',
    ]);
  });

  it('检定事件流只消费事件自带的翻牌与效果事实', () => {
    const card = makeZoneCard('B2', 0);
    const basePlayers = [makePlayer({ name: '玩家', hp: 10, san: 10 })];
    const beforePlayers = copyPlayers(basePlayers);
    beforePlayers[0].san = 8;
    const afterPlayers = copyPlayers(beforePlayers);
    afterPlayers[0].hp = 7;
    const events = [{
      card,
      target: 0,
      beforePlayers,
      beforeLog: ['蛊惑发动'],
      afterPlayers,
      afterLog: ['蛊惑发动', '检定导致伤害'],
      revealMsgs: ['玩家 的SAN检定结果为"伤害"'],
      effectMsgs: ['检定导致伤害'],
      statEvents: [{
        type: 'HP_LOSS', target: 0,
        from: { hp: 10, san: 8 }, to: { hp: 7, san: 8 },
        reason: '检定', seq: 1,
      }],
      statEventSeq: 1,
    }];

    const flow = buildInspectionEventFlow(
      { players: basePlayers, log: [] },
      events,
      { copyPlayers },
    );

    expect(flow.queue.map(step => step.type)).toEqual([
      'VISUAL_LOCK',
      'DRAW_CARD',
      'HP_DAMAGE',
      'STATE_PATCH',
    ]);
    expect(flow.queue[0].players[0]).toMatchObject({ id: basePlayers[0].id, hand: basePlayers[0].hand });
    expect(flow.queue[1]).toMatchObject({ triggerName: '检定牌', card, targetPid: 0 });
    expect(flow.queue[2]).toMatchObject({ hitIndices: [0], msgs: ['检定导致伤害'] });
  });

  it('检定效果动画优先使用显式 statEvents', () => {
    const card = { name: '超人意志', effect: 'healSAN', value: 1 };
    const beforePlayers = [makePlayer({ name: '玩家', hp: 10, san: 5 })];
    const afterPlayers = copyPlayers(beforePlayers);
    afterPlayers[0].san = 6;
    const events = [{
      card,
      target: 0,
      beforePlayers,
      beforeLog: ['玩家 的SAN检定结果为"超人意志"'],
      afterPlayers,
      afterLog: ['玩家 的SAN检定结果为"超人意志"', '检定结算完成'],
      statEventSeq: 7,
      statEvents: [{
        type: 'SAN_GAIN',
        target: 0,
        from: { hp: 10, san: 5, isDead: false },
        to: { hp: 10, san: 6, isDead: false },
        reason: '超人意志',
        seq: 7,
      }],
    }];

    const flow = buildInspectionEventFlow(
      { players: beforePlayers, log: [] },
      events,
      { buildAnimQueue, copyPlayers },
    );

    expect(flow.queue.map(step => step.type)).toEqual(['VISUAL_LOCK', 'DRAW_CARD', 'SAN_HEAL', 'STATE_PATCH']);
    expect(flow.queue[2]).toMatchObject({ hitIndices: [0] });
    expect(flow.queue[2].statEvents).toMatchObject([{ type: 'SAN_GAIN', seq: 7 }]);
    expect(flow.statEventSeq).toBe(7);
  });

  it('全体 SAN 扣减后的多名检定牌翻牌排在 SAN 扣减动画之后', () => {
    const calmCard = { name: '暂时的平静', effect: 'calm' };
    const amnesiaCard = { name: '失忆', effect: 'amnesia' };
    const oldPlayers = [
      makePlayer({ name: '诺亚', hp: 9, san: 7 }),
      makePlayer({ name: '奥托', hp: 10, san: 7 }),
    ];
    const afterSanPlayers = copyPlayers(oldPlayers);
    afterSanPlayers[0].san = 6;
    afterSanPlayers[1].san = 6;
    const afterNoahInspectionPlayers = copyPlayers(afterSanPlayers);
    const finalPlayers = copyPlayers(afterNoahInspectionPlayers);
    finalPlayers[1].skillDisabledNextTurn = true;
    const newLog = [
      '你 收入了 [D3] 鼠群',
      '全体存活角色失去 1 SAN',
      '诺亚 的SAN检定结果为"暂时的平静"',
      '奥托 的SAN检定结果为"失忆"',
      '奥托 失忆，下一回合禁用技能',
    ];
    const result = compileFreshVisualEventReplay(
      {
        players: oldPlayers,
        log: [],
        _statEventSeq: 0,
        _inspectionSeq: 0,
      },
      {
        players: finalPlayers,
        log: newLog,
        _statEventSeq: 1,
        _statEvents: [{
          seq: 1,
          type: 'SAN_LOSS',
          target: 0,
          from: { hp: 9, san: 7, isDead: false },
          to: { hp: 9, san: 6, isDead: false },
          reason: '鼠群',
        }, {
          seq: 1,
          type: 'SAN_LOSS',
          target: 1,
          from: { hp: 10, san: 7, isDead: false },
          to: { hp: 10, san: 6, isDead: false },
          reason: '鼠群',
        }],
        _inspectionSeq: 2,
        _visualEvents: [createStatEventsEvent({ statEvents: [{
          seq: 1,
          type: 'SAN_LOSS',
          target: 0,
          from: { hp: 9, san: 7, isDead: false },
          to: { hp: 9, san: 6, isDead: false },
          reason: '鼠群',
        }, {
          seq: 1,
          type: 'SAN_LOSS',
          target: 1,
          from: { hp: 10, san: 7, isDead: false },
          to: { hp: 10, san: 6, isDead: false },
          reason: '鼠群',
        }] }), {
          ...createInspectionVisualEvent({
          seq: 1,
          card: calmCard,
          target: 0,
          beforePlayers: afterSanPlayers,
          beforeLog: newLog.slice(0, 2),
          afterPlayers: afterNoahInspectionPlayers,
          afterLog: newLog.slice(0, 3),
          beforeStatEventSeq: 1,
          statEvents: [],
          statEventSeq: null,
          }),
        }, {
          ...createInspectionVisualEvent({
          seq: 2,
          card: amnesiaCard,
          target: 1,
          beforePlayers: afterNoahInspectionPlayers,
          beforeLog: newLog.slice(0, 3),
          afterPlayers: finalPlayers,
          afterLog: newLog,
          beforeStatEventSeq: 1,
          statEvents: [],
          statEventSeq: null,
          }),
        }],
      },
    );

    const sanIdx = result.queue.findIndex(step => step.type === 'SAN_DAMAGE');
    const drawIdxs = result.queue
      .map((step, idx) => (step.type === 'DRAW_CARD' ? idx : -1))
      .filter(idx => idx >= 0);
    expect(sanIdx).toBeGreaterThanOrEqual(0);
    expect(drawIdxs).toHaveLength(2);
    expect(drawIdxs[0]).toBeGreaterThan(sanIdx);
    expect(result.queue[drawIdxs[0]]).toMatchObject({ card: calmCard, triggerName: '检定牌', targetPid: 0 });
    expect(result.queue[drawIdxs[1]]).toMatchObject({ card: amnesiaCard, triggerName: '检定牌', targetPid: 1 });
  });

  it('决策后续播剩余 SAN 检定时不会重播检定前的夜风呼啸', () => {
    const nightWind = { id: 'night-wind', name: '夜风呼啸', key: 'C4', type: 'allDamageBoth' };
    const inspectionCard = { id: 'amnesia', name: '失忆', effect: 'disableSkill' };
    const beforePlayers = [
      makePlayer({ name: '你', hp: 9, san: 6 }),
      makePlayer({ name: '艾伦', hp: 9, san: 6 }),
    ];
    const afterPlayers = copyPlayers(beforePlayers);
    afterPlayers[1].disableSkillNextTurn = true;
    const nightWindEvent = createCardEffectEvent({
      effectKey: 'nightWind',
      card: nightWind,
      actorIdx: 0,
      beforePlayers,
      afterPlayers: beforePlayers,
      msgs: ['全体存活角色失去 1 HP 和 SAN'],
    });
    const inspectionEvent = {
      seq: 2,
      card: inspectionCard,
      target: 1,
      beforePlayers,
      beforeLog: ['全体存活角色失去 1 HP 和 SAN'],
      afterPlayers,
      afterLog: [
        '全体存活角色失去 1 HP 和 SAN',
        '艾伦 的SAN检定结果为"失忆"',
        '艾伦 失忆，下一回合禁用技能',
      ],
      statEvents: [],
      statEventSeq: null,
    };
    const baseState = {
      players: beforePlayers,
      log: inspectionEvent.beforeLog,
      _inspectionSeq: 1,
      _visualEvents: [nightWindEvent],
    };
    const resolvedState = {
      ...baseState,
      players: afterPlayers,
      log: inspectionEvent.afterLog,
      _inspectionSeq: 2,
      _visualEvents: [nightWindEvent, createInspectionVisualEvent(inspectionEvent)],
    };

    const result = compileFreshVisualEventReplay(
      baseState,
      resolvedState,
    );

    expect(result.queue.filter(step => step.type === 'NIGHT_WIND')).toHaveLength(0);
    expect(result.queue.filter(step => step.type === 'DRAW_CARD')).toEqual([
      expect.objectContaining({ card: inspectionCard, targetPid: 1 }),
    ]);
  });

  it('分阶段结算第二次 SAN 检定时不重播旧状态已有的第一次检定', () => {
    const insomnia = { name: '失眠' };
    const amnesia = { name: '失忆' };
    const players = [makePlayer({ name: '艾伦', san: 5 })];
    const firstEvent = {
      seq: 1,
      card: insomnia,
      target: 0,
      beforePlayers: players,
      beforeLog: [],
      afterPlayers: players,
      afterLog: ['艾伦 的SAN检定结果为"失眠"'],
    };
    const secondEvent = {
      seq: 2,
      card: amnesia,
      target: 0,
      beforePlayers: players,
      beforeLog: firstEvent.afterLog,
      afterPlayers: players,
      afterLog: [...firstEvent.afterLog, '艾伦 的SAN检定结果为"失忆"'],
    };
    const firstVisualEvent = createInspectionVisualEvent(firstEvent);
    const secondVisualEvent = createInspectionVisualEvent(secondEvent);

    const result = compileFreshVisualEventReplay(
      {
        players,
        log: firstEvent.afterLog,
        _inspectionSeq: 1,
        _visualEvents: [firstVisualEvent],
      },
      {
        players,
        log: secondEvent.afterLog,
        _inspectionSeq: 2,
        _visualEvents: [
          firstVisualEvent,
          secondVisualEvent,
        ],
      },
    );

    const inspectionCards = result.queue
      .filter(step => step.type === 'DRAW_CARD' && step.triggerName === '检定牌')
      .map(step => step.card.name);
    expect(inspectionCards).toEqual(['失忆']);
    expect(result.inspectionSeq).toBe(2);
  });

  it('检定后的尾队列不会重放检定前已经存在的 HP statEvent', () => {
    const oldHpEvent = {
      type: 'HP_LOSS',
      target: 1,
      from: { hp: 10, san: 10, isDead: false },
      to: { hp: 8, san: 10, isDead: false },
      reason: '旧伤害',
      seq: 3,
    };
    const card = { name: '乏力', effect: 'handLimitDecrease', type: 'negative' };
    const beforePlayers = [
      makePlayer({ name: '卡洛斯', hp: 10, san: 3 }),
      makePlayer({ name: '贝拉', hp: 8, san: 10 }),
    ];
    const afterPlayers = copyPlayers(beforePlayers);
    afterPlayers[0].handLimitDecreaseNextTurn = 1;
    const events = [{
      card,
      target: 0,
      beforePlayers,
      beforeLog: ['卡洛斯 的SAN检定结果为"乏力"'],
      afterPlayers,
      afterLog: ['卡洛斯 的SAN检定结果为"乏力"', '卡洛斯 乏力，下一回合手牌上限-1'],
      statEventSeq: null,
      statEvents: [],
    }];
    const flow = buildInspectionEventFlow(
      { players: beforePlayers, log: [], _statEventSeq: 3 },
      events,
      { buildAnimQueue, copyPlayers },
    );
    const tailQueue = buildAnimQueue(
      { players: flow.players, log: flow.log, _statEventSeq: flow.statEventSeq },
      {
        players: afterPlayers,
        log: flow.log,
        _statEvents: [oldHpEvent],
        _statEventSeq: 3,
      },
    );

    expect(flow.queue.map(step => step.type)).toEqual(['VISUAL_LOCK', 'DRAW_CARD', 'STATE_PATCH']);
    expect(tailQueue.some(step => step.type === 'HP_DAMAGE')).toBe(false);
  });

  it('检定事件流不会从外部 stat 水位捞取改信伤害', () => {
    const encounterSanEvent = {
      seq: 1,
      type: 'SAN_LOSS',
      target: 0,
      from: { hp: 10, san: 8, isDead: false },
      to: { hp: 10, san: 6, isDead: false },
      reason: '邪神遭遇',
    };
    const convertSanEvent = {
      seq: 2,
      type: 'SAN_LOSS',
      target: 0,
      from: { hp: 10, san: 6, isDead: false },
      to: { hp: 10, san: 5, isDead: false },
      reason: '改信新神',
    };
    const beforeFirst = [makePlayer({ name: '你', hp: 10, san: 6, hand: [{ id: 'discard-me' }] })];
    const afterFirst = [makePlayer({ name: '你', hp: 10, san: 6, hand: [] })];
    const beforeSecond = [makePlayer({ name: '你', hp: 10, san: 5, hand: [], godName: 'VRI', godLevel: 1 })];
    const afterSecond = [makePlayer({
      name: '你',
      hp: 10,
      san: 5,
      hand: [],
      godName: 'VRI',
      godLevel: 1,
      handLimitDecreaseNextTurn: 1,
    })];
    const firstLog = [
      '你 遭遇邪神 弗栗多！（第2次）失去 2 SAN',
      '你 的SAN检定结果为"迫害妄想"',
      '你 迫害妄想，弃置了一张牌',
    ];
    const secondBeforeLog = [...firstLog, '你 被迫改信新神，失去 1 SAN'];
    const secondAfterLog = [
      ...secondBeforeLog,
      '你 的SAN检定结果为"乏力"',
      '你 乏力，下一回合手牌上限-1',
    ];
    const flow = buildInspectionEventFlow(
      {
        players: beforeFirst,
        log: [],
        _statEventSeq: 1,
        _statEvents: [encounterSanEvent, convertSanEvent],
      },
      [
        {
          seq: 1,
          card: { name: '迫害妄想', effect: 'discardRandom' },
          target: 0,
          beforePlayers: beforeFirst,
          beforeLog: firstLog.slice(0, 1),
          beforeStatEventSeq: 1,
          afterPlayers: afterFirst,
          afterLog: firstLog,
          statEvents: [],
          statEventSeq: null,
        },
        {
          seq: 2,
          card: { name: '乏力', effect: 'handLimitDecrease' },
          target: 0,
          beforePlayers: beforeSecond,
          beforeLog: secondBeforeLog,
          beforeStatEventSeq: 2,
          afterPlayers: afterSecond,
          afterLog: secondAfterLog,
          statEvents: [],
          statEventSeq: null,
        },
      ],
      { buildAnimQueue, copyPlayers },
    );
    const tailQueue = buildAnimQueue(
      { players: flow.players, log: flow.log, _statEventSeq: flow.statEventSeq },
      {
        players: afterSecond,
        log: [...secondAfterLog, '你 信仰了 弗栗多，获得不灭之躯(Lv.1)'],
        _statEvents: [encounterSanEvent, convertSanEvent],
        _statEventSeq: 2,
        _inspectionSeq: 2,
        _visualEvents: [createGodStatusChangedEvent({
          playerIdx: 0,
          playerName: '你',
          godKey: 'VRI',
          godLevel: 1,
          msgs: ['你 信仰了 弗栗多，获得不灭之躯(Lv.1)'],
          playersBefore: beforeSecond,
          playersAfter: afterSecond,
          presentAfterInspectionSeq: 2,
        })],
      },
    );

    expect(flow.statEventSeq).toBe(2);
    expect(flow.queue.filter(step => step.type === 'SAN_DAMAGE')).toHaveLength(0);
    expect(tailQueue.some(step => step.type === 'GOD_HIGHLIGHT')).toBe(true);
    expect(tailQueue.some(step => step.type === 'SAN_DAMAGE')).toBe(false);
  });

  it('迫害妄想弃置黏液时显式播放 DISCARD，不误播黏液消失', () => {
    const slime = { id: 'inspection-slime', name: '赐福黏液', type: 'tsathogguaSlime', isTsathogguaSlime: true };
    const beforePlayers = [makePlayer({ name: '你', hand: [slime] })];
    const afterPlayers = [makePlayer({ name: '你', hand: [] })];
    const beforeLog = ['你 的SAN检定结果为"迫害妄想"'];
    const afterLog = [...beforeLog, '你 迫害妄想，弃置了一张牌', '你的衍生牌被销毁'];

    const flow = buildInspectionEventFlow(
      { players: beforePlayers, discard: [], log: [] },
      [{
        seq: 1,
        card: { name: '迫害妄想', effect: 'discardRandom' },
        target: 0,
        beforePlayers,
        beforeDiscard: [],
        beforeLog,
        afterPlayers,
        afterDiscard: [],
        afterLog,
        discardEvents: [{ playerIndex: 0, card: slime, afterPlayers, afterDiscard: [] }],
      }],
      { buildAnimQueue, copyPlayers },
    );

    expect(flow.queue).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'DISCARD', card: slime, targetPid: 0 }),
    ]));
    expect(flow.queue.some(step => step.type === 'TSG_SLIME_POP')).toBe(false);
    expect(flow.queue.some(step => step.type === 'CARD_TRANSFER' && step.dest === 'discard')).toBe(false);
  });

  it('揭开真相的额外摸牌保留暗抽飞牌，但去除背景运镜与翻牌', () => {
    const inspectionCard = { id: 'truth', name: '揭开真相', effect: 'drawCard' };
    const actualCard = { id: 'vri', name: '弗栗多', godKey: 'VRI', isGod: true, type: 'god' };
    const gainedCard = { id: 'hidden-draw', hiddenDraw: true };
    const beforePlayers = [makePlayer({ name: '贝拉', hand: [] })];
    const afterPlayers = [makePlayer({ name: '贝拉', hand: [actualCard] })];
    const gainedCardLog = '贝拉 揭开真相，直接摸1张牌收入手牌（不触发效果）';

    const flow = buildInspectionEventFlow(
      { players: beforePlayers, log: [] },
      [{
        seq: 3,
        card: inspectionCard,
        target: 0,
        beforePlayers,
        beforeLog: ['贝拉 的SAN检定结果为"揭开真相"'],
        afterPlayers,
        afterLog: ['贝拉 的SAN检定结果为"揭开真相"', gainedCardLog],
        gainedCard,
        gainedCardLog,
      }],
      { buildAnimQueue, copyPlayers },
    );

    const draws = flow.queue.filter(step => step.type === 'DRAW_CARD');
    expect(draws).toHaveLength(2);
    expect(draws[0]).toMatchObject({ card: inspectionCard, triggerName: '检定牌', inspectionSeq: 3 });
    expect(draws[1]).toMatchObject({
      card: gainedCard,
      triggerName: '贝拉',
      targetPid: 0,
      inspectionGainSeq: 3,
      travelOnly: true,
      disableDrawBackgroundCamera: true,
      durationMs: 700,
      msgs: [gainedCardLog],
    });
  });

  it('检定回放只读取规范视觉事件并保留事件阶段', () => {
    const second = { seq: 2, target: 0, card: { id: 'second', name: '检定二' } };
    const explicitSecond = {
      ...createInspectionVisualEvent(second),
      turnStartStage: 'turnStart',
    };
    const events = getFreshInspectionReplayEvents({
      _visualEvents: [explicitSecond],
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: explicitSecond.id, legacySeq: 2, turnStartStage: 'turnStart' });
    expect(events.filter(event => (event.legacySeq ?? event.seq) === 2)).toHaveLength(1);
  });

  it('蛊惑分段回放不会重复播放同一个属性事件', () => {
    const repeatedEvent = {
      seq: 7,
      type: 'SAN_LOSS',
      target: 2,
      from: { hp: 10, san: 1 },
      to: { hp: 10, san: 0 },
      logHint: '黛安娜 被迫改信新神，失去 1 SAN',
    };
    const makeSanStep = () => ({
      type: 'SAN_DAMAGE',
      hitIndices: [2],
      statEvents: [repeatedEvent],
    });

    const queue = buildBewitchForcedCardQueue(
      1,
      2,
      makeGodCard('SHU'),
      '黛安娜',
      [makeSanStep(), { type: 'STATE_PATCH', players: [] }, makeSanStep()],
      ['艾伦 对 黛安娜 【蛊惑】，赠予 森之领主'],
    );

    expect(queue.filter(step => step.type === 'SAN_DAMAGE')).toHaveLength(1);
    expect(queue.some(step => step.type === 'STATE_PATCH')).toBe(true);
  });

  it('蛊惑属性事件去重不会吞掉同一事件的另一种动画', () => {
    const combinedEvent = {
      seq: 8,
      type: 'HP_SAN_LOSS',
      target: 2,
      from: { hp: 3, san: 2 },
      to: { hp: 2, san: 1 },
    };
    const queue = buildBewitchForcedCardQueue(1, 2, null, '黛安娜', [
      { type: 'HP_DAMAGE', hitIndices: [2], statEvents: [combinedEvent] },
      { type: 'SAN_DAMAGE', hitIndices: [2], statEvents: [combinedEvent] },
    ], []);

    expect(queue.filter(step => step.type === 'HP_DAMAGE')).toHaveLength(1);
    expect(queue.filter(step => step.type === 'SAN_DAMAGE')).toHaveLength(1);
  });
});
