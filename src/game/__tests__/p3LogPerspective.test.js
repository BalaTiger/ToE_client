import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import * as game from '../index';
import * as animQueueHelpers from '../animQueueHelpers';
import * as huntTransactions from '../identitySkillVisualTransaction';
import * as rotateState from '../rotateState';
import { bindAnimLogChunks, prepareAnimQueueLogs, splitAnimBoundLogs } from '../animLogs';
import { buryToDeckStep } from '../animQueueHelpers';
import { normalizeLogForViewer, normalizeLogLineForViewer } from '../logPerspective';
import { rotateGsForViewer } from '../rotateState';
import { createAnimTransactionEvent } from '../visualEvents';
import { compileFreshVisualEventQueue } from '../visualEventTransactionCompiler';
import { consumeVisualLogEntries } from '../visualEventLogs';
import { applyFx } from '../effectEngine';
import { buildProliferatingZDrawFlow } from '../proliferatingZFlow';
import { createTsathogguaSlimeCard } from '../../constants/card';
import { makeGodCard, makeGs, makeStandardPlayers, makeZoneCard } from './factory';

const appSource = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
function handlerSource(name) {
  let start = appSource.indexOf(`  function ${name}(`);
  if (start < 0) start = appSource.indexOf(`  async function ${name}(`);
  const closing = /\n {2}}\r?\n/.exec(appSource.slice(start));
  if (start < 0 || !closing) throw new Error(`Missing App handler: ${name}`);
  return appSource.slice(start, start + closing.index + closing[0].length);
}

function actionContext(overrides = {}) {
  const gs = makeGs({
    _isMP: true, currentTurn: 0, _visualEvents: [], log: [], globalOnlySwapOwner: null,
    players: makeStandardPlayers(3, [
      { name: 'END-B', role: '追猎者', hand: [makeZoneCard('A1')] },
      { name: 'END-A', role: '寻宝者', hand: [makeZoneCard('B2'), makeZoneCard('C4')] },
      { name: 'END-C', role: '邪祀者' },
    ]), ...overrides,
  });
  const context = {
    ...game, ...animQueueHelpers, ...huntTransactions, ...rotateState, gs,
    bindAnimLogChunks, splitAnimBoundLogs,
    Math: Object.assign(Object.create(Math), { random: () => 0 }),
    isTutorialActionAllowed: () => true, getNextTutorialStepForAction: () => null,
    showTutorial: false, tutorialStepDef: null,
    consumedVisualEventIdsRef: { current: new Set() },
    isLocalSeatIndex: index => index === 0,
    setGs: state => { context.result = { state, queue: [] }; },
    setGsWithApophisTargetAnim: state => { context.result = { state, queue: [] }; },
    apophisNightPatch: () => ({}),
    resolveApophisTarget: ({ players, deck, discard, log, selectedIdx }) => ({ players, deck, discard, log, targetIdx: selectedIdx }),
    broadcastAnimTransaction: () => true,
    buildTargetContinuationGs: patch => ({ ...gs, ...patch, phase: 'ACTION', abilityData: {} }),
    finishTargetContinuation: ({ queue, nextGs }) => { context.result = { state: nextGs, queue }; },
    triggerAnimQueue: (queue, state) => { context.result = { state, queue }; },
    triggerSyncedAnimTransaction: (queue, state) => { context.result = { state, queue }; },
    finishTutorialActionWithState: (state, _next, queue) => { context.result = { state, queue }; },
  };
  return context;
}

function runHandler(context, name, args = []) {
  const before = JSON.stringify(context.gs);
  const lootBoundary = appSource.match(/^function shouldDelayHuntLootSelection\([\s\S]*?\n}/m)[0];
  runInNewContext(`${lootBoundary}\n${handlerSource(name)}\n${name}(...actionArgs);`, { ...context, actionArgs: args });
  expect(JSON.stringify(context.gs)).toBe(before);
  expect(context.result).toBeTruthy();
  return context.result;
}

async function runAsyncHandler(context, name, args = []) {
  const before = JSON.stringify(context.gs);
  await runInNewContext(`${handlerSource(name)}\n${name}(...actionArgs);`, { ...context, actionArgs: args });
  expect(JSON.stringify(context.gs)).toBe(before);
  expect(context.result).toBeTruthy();
  return context.result;
}

function assertFullHistoryAcrossViewers(state, expected) {
  expect(state.log).toEqual(expected);
  const packet = JSON.parse(JSON.stringify(state));
  // A reconnect/terminal history must remain correct without live event metadata.
  packet._visualEvents = [];
  for (let viewer = 0; viewer < 3; viewer++) {
    const rotated = rotateGsForViewer(packet, viewer);
    const ownName = rotated.players[0].name;
    expect(normalizeLogForViewer(rotated.log, { isMultiplayer: true, myName: ownName, playerNames: rotated.players.map(player => player.name) }))
      .toEqual(expected.map(line => line.replaceAll(ownName, '你')));
  }
}

const players = ['END-B', 'END-A', 'END-C'].map(name => ({
  name, hp: 10, san: 10, hand: [], godZone: [], isDead: false,
}));

function replayForViewer(queue, viewer) {
  const event = createAnimTransactionEvent({ actorIdx: 0, actorName: 'END-B', queue });
  const packet = { players, currentTurn: 0, _isMP: true, log: queue.flatMap(step => step.msgs || []), _visualEvents: [event] };
  const before = JSON.stringify(packet);
  const state = rotateGsForViewer(packet, viewer);
  const compiled = compileFreshVisualEventQueue({ ...state, _visualEvents: [] }, state);
  const prepared = prepareAnimQueueLogs(compiled, state);
  const consumed = new Set();
  const live = prepared.flatMap(step => consumeVisualLogEntries(step.logEntries, consumed));
  expect(prepared.flatMap(step => consumeVisualLogEntries(step.logEntries, consumed))).toEqual([]);
  expect(JSON.stringify(packet)).toBe(before);
  return normalizeLogForViewer(live, { isMultiplayer: true, myName: state.players[0].name, playerNames: state.players.map(player => player.name) });
}

describe('TOE011 event-owned display perspective', () => {
  it.each([0, 1, 2])('projects the UI-reproduced pending negative-effect actor in live and reconnected history for viewer %s', viewer => {
    const template = appSource.match(/`你即将承受 \$\{cardLogText\(resolutionCard,[^\n]+?`/)[0];
    const hint = runInNewContext(template, { cardLogText: game.cardLogText, resolutionCard: makeZoneCard('C4', 2) });
    expect(hint).toBe('你即将承受 [C4] 夜风呼啸 的负面效果！是否掷骰子尝试规避？');
    const targetLine = '你的手牌[B2] 旧牌被暗抽';
    const expectedHint = hint.replace(/^你/, viewer === 0 ? '你' : 'END-B');
    expect(replayForViewer([{ type: 'LOG', msgs: [hint, targetLine] }], viewer)).toEqual([expectedHint, targetLine]);
    const packet = JSON.parse(JSON.stringify({ players, currentTurn: 0, _isMP: true, _visualEvents: [], log: ['── END-B 的回合开始 ──', hint, targetLine] }));
    const rotated = rotateGsForViewer(packet, viewer);
    expect(normalizeLogForViewer(rotated.log, { isMultiplayer: true, myName: rotated.players[0].name, playerNames: rotated.players.map(player => player.name) }))
      .toEqual([`── ${viewer === 0 ? '你' : 'END-B'} 的回合开始 ──`, expectedHint, targetLine]);
    expect(normalizeLogForViewer(packet.log, { isMultiplayer: false, myName: 'END-A' })).toEqual(packet.log);
  });

  it.each([0, 1, 2])('keeps both bury responders distinct for viewer %s without a turn heading', viewer => {
    const queue = [
      buryToDeckStep({ fromPid: 0, msgs: ['【活埋】你 将 [C4] 半物质化 放到了牌堆底'] }),
      buryToDeckStep({ fromPid: 1, msgs: ['【活埋】END-A 将 [A1] 解读石刻 放到了牌堆底'] }),
    ];
    expect(replayForViewer(queue, viewer)).toEqual([
      `【活埋】${viewer === 0 ? '你' : 'END-B'} 将 [C4] 半物质化 放到了牌堆底`,
      `【活埋】${viewer === 1 ? '你' : 'END-A'} 将 [A1] 解读石刻 放到了牌堆底`,
    ]);
  });

  it.each([0, 1, 2])('keeps the remote hunter separate from the local target for viewer %s', viewer => {
    const queue = [{ type: 'LOG', msgs: [
      '你从 END-A 的手牌中暗抽了一张 [B2] 旧牌！',
      '你夺取了 END-A 的全部公开手牌（2 张）！',
    ] }];
    expect(replayForViewer(queue, viewer)).toEqual([
      `${viewer === 0 ? '你' : 'END-B'}从 ${viewer === 1 ? '你' : 'END-A'} 的手牌中暗抽了一张 [B2] 旧牌！`,
      `${viewer === 0 ? '你' : 'END-B'}夺取了 ${viewer === 1 ? '你' : 'END-A'} 的全部公开手牌（2 张）！`,
    ]);
  });

  it('preserves private target wording and leaves an unowned responder unresolved', () => {
    const msgs = ['你的手牌[B2] 旧牌被暗抽', '【活埋】你 将 [A1] 解读石刻 放到了牌堆底'];
    const state = { players, currentTurn: 0, _isMP: true, _visualEvents: [] };
    const prepared = prepareAnimQueueLogs([{ type: 'LOG', msgs }], state);
    expect(prepared[0]._logChunk).toEqual(msgs);
  });

  it('replaces complete player references while preserving other names and card titles', () => {
    const log = [
      '── 新鲜空气娜 的回合开始 ──',
      '你从 新鲜空气 的手牌中暗抽了一张 [B2] 新鲜空气！',
      '新鲜空气娜（追猎者）追捕 新鲜空气，等待对方亮出一张手牌…',
      '新鲜空气 收入了 [B2] 新鲜空气',
      '拿走 暗抽牌，还给 新鲜空气 [B2] 新鲜空气',
    ];
    expect(normalizeLogForViewer(log, { isMultiplayer: true, myName: '新鲜空气', playerNames: ['新鲜空气', '新鲜空气娜'] })).toEqual([
      log[0],
      '新鲜空气娜从 你 的手牌中暗抽了一张 [B2] 新鲜空气！',
      '新鲜空气娜（追猎者）追捕 你，等待对方亮出一张手牌…',
      '你 收入了 [B2] 新鲜空气',
      '拿走 暗抽牌，还给 你 [B2] 新鲜空气',
    ]);
  });

  it('projects the real snake-trap assignment list without replacing a longer player name', () => {
    const assignedPlayers = makeStandardPlayers(3, [
      { name: '贝拉' }, { name: '诺亚' }, { name: '贝拉娜' },
    ]);
    const random = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0).mockReturnValueOnce(0.34).mockReturnValueOnce(0.67);
    let result;
    try {
      result = applyFx(makeZoneCard('D2', 2), 0, null, assignedPlayers, [], [], makeGs({ players: assignedPlayers }));
    } finally {
      random.mockRestore();
    }
    expect(result.msgs).toEqual(['【群蛇陷阱】分配了 3 层中毒：贝拉+1、诺亚+1、贝拉娜+1']);
    expect(normalizeLogForViewer(result.msgs, { isMultiplayer: true, myName: '贝拉', playerNames: assignedPlayers.map(player => player.name) }))
      .toEqual(['【群蛇陷阱】分配了 3 层中毒：你+1、诺亚+1、贝拉娜+1']);
    expect(normalizeLogForViewer(result.msgs, { isMultiplayer: true, myName: '诺亚', playerNames: assignedPlayers.map(player => player.name) }))
      .toEqual(['【群蛇陷阱】分配了 3 层中毒：贝拉+1、你+1、贝拉娜+1']);
    expect(normalizeLogForViewer(result.msgs, { isMultiplayer: false, myName: '贝拉' })).toEqual(result.msgs);
  });

  it.each([
    { gainOwnerIdx: 0, drawerIdx: 0, expected: '【增殖的Z】因你获得阿波菲斯，你摸1张牌' },
    { gainOwnerIdx: 1, drawerIdx: 0, expected: '【增殖的Z】因贝拉娜获得阿波菲斯，你摸1张牌' },
    { gainOwnerIdx: 0, drawerIdx: 1, expected: '【增殖的Z】因你获得阿波菲斯，贝拉娜摸1张牌' },
  ])('projects real proliferating-Z owner/drawer slots while preserving card names ($gainOwnerIdx/$drawerIdx)', ({ gainOwnerIdx, drawerIdx, expected }) => {
    const state = makeGs({
      players: makeStandardPlayers(2, [{ name: '贝拉' }, { name: '贝拉娜' }]),
      proliferatingZQueue: [{ drawerIdx, gainOwnerIdx, gainedCardNames: ['阿波菲斯'] }],
    });
    const result = buildProliferatingZDrawFlow(state, {
      copyPlayers: game.copyPlayers,
      localDisplayName: (_idx, name) => name,
      isAiSeat: () => false,
      playerDrawCard: (P, D, Disc) => ({ P, D, Disc, drawnCard: null }),
      hasEffectDecisionState: () => false,
      statePatchStep: animQueueHelpers.statePatchStep,
    });
    expect(normalizeLogForViewer(result.state.log, { isMultiplayer: true, myName: '贝拉', playerNames: state.players.map(player => player.name) })).toEqual([expected]);
    expect(normalizeLogForViewer(result.state.log, { isMultiplayer: false, myName: '贝拉' })).toEqual(result.state.log);
    expect(state.log).toEqual([]);
  });

  it('preserves existing rest, target-list and random-target player references with legal bracketed names', () => {
    const log = [
      '贝拉进入休息状态', '贝拉离开休息状态',
      '【黑夜】目标错乱为 贝拉', '诺亚、贝拉 失去 2SAN',
      'A[B]从 贝拉 的手牌中暗抽了一张 [B2]！',
    ];
    expect(normalizeLogForViewer(log, { isMultiplayer: true, myName: '贝拉', playerNames: ['贝拉', '诺亚', 'A[B]'] }))
      .toEqual(log.map(line => line.replaceAll('贝拉', '你')));
  });

  it('uses actor and responder names as literal text, including replacement-string tokens', () => {
    expect(normalizeLogLineForViewer('你从 贝拉 的公开手牌中选择了 [B2]！', { isMultiplayer: true, turnOwner: '$&', myName: '诺亚' }))
      .toBe('$&从 贝拉 的公开手牌中选择了 [B2]！');
    expect(normalizeLogLineForViewer('【活埋】你 将 [B2] 新鲜空气 放到了牌堆底', { isMultiplayer: true, responderName: '$&', myName: '诺亚' }))
      .toBe('【活埋】$& 将 [B2] 新鲜空气 放到了牌堆底');
  });
});

describe('TOE011 canonical text from real App producers', () => {
  it.each([
    { multiplayer: false, outcome: 'correct', role: '寻宝者', guessYes: false },
    { multiplayer: true, outcome: 'correct', role: '寻宝者', guessYes: false },
    { multiplayer: false, outcome: 'wrongDamage', role: '追猎者', guessYes: true },
    { multiplayer: true, outcome: 'wrongDamage', role: '追猎者', guessYes: true },
    { multiplayer: false, outcome: 'wrongDodge', role: '寻宝者', guessYes: true },
    { multiplayer: true, outcome: 'wrongDodge', role: '寻宝者', guessYes: true },
  ])('keeps the UI-reproduced sphinx actor canonical in MP=$multiplayer/$outcome', ({ multiplayer, outcome, role, guessYes }) => {
    const topCard = makeGodCard('NYA');
    const context = actionContext({ _isMP: multiplayer, phase: 'SPHINX_GUESS', abilityData: { playerIndex: 0 }, deck: [topCard] });
    context.gs.players[0].role = role;
    const { state, queue } = runHandler(context, 'sphinxGuess', [guessYes]);
    const actorLabel = multiplayer ? 'END-B ' : '你';
    expect(state.log[0]).toBe(`${actorLabel}猜测牌堆顶的牌${guessYes ? '是' : '不是'}区域牌`);
    expect(state.log[1]).toBe(outcome === 'correct'
      ? `猜测正确！${actorLabel}收入了 伏行之混沌`
      : `猜测错误！${actorLabel}${outcome === 'wrongDodge' ? '即将失去' : '失去'} 3 HP`);
    if (multiplayer) {
      assertFullHistoryAcrossViewers(state, state.log);
      let packet;
      runInNewContext(`${handlerSource('broadcastAnimTransaction')}\nbroadcastAnimTransaction(state, queue, options);`, {
        ...game, ...animQueueHelpers, state, queue,
        options: { context: 'sphinxResult', msgs: state.log, beforePlayers: context.gs.players, beforeDiscard: context.gs.discard },
        broadcastMpStateBeforeLocalReplay: emittedState => { packet = emittedState; return true; },
      });
      expect(packet).toBeTruthy();
      for (let viewer = 0; viewer < 3; viewer++) {
        const ownName = state.players[viewer].name;
        const rotated = rotateGsForViewer(packet, viewer);
        const prepared = prepareAnimQueueLogs(compileFreshVisualEventQueue(rotateGsForViewer(context.gs, viewer), rotated), rotated);
        const consumed = new Set();
        const live = prepared.flatMap(step => consumeVisualLogEntries(step.logEntries, consumed));
        const projected = normalizeLogForViewer(live, { isMultiplayer: true, myName: ownName, playerNames: state.players.map(player => player.name) });
        const expected = state.log.map(line => line.replaceAll(ownName, '你'));
        if (outcome === 'wrongDamage') {
          // TOE026 separately records the suspected duplicate damage message.
          // TOE011 verifies every emitted occurrence still names the right actor.
          expect(projected).toEqual(expect.arrayContaining(expected));
          expect(projected.every(line => expected.includes(line))).toBe(true);
          expect(projected.filter(line => line === expected[1])).toHaveLength(2);
        } else expect(projected).toEqual(expected);
      }
    }
    expect(state.deck).toHaveLength(0);
    expect(state.players[0].hand).toHaveLength(outcome === 'correct' ? 2 : 1);
    expect(state.discard).toHaveLength(outcome === 'correct' ? 0 : 1);
    expect([state.players[0].hp, state.players[0].san]).toEqual([outcome === 'wrongDamage' ? 7 : 10, 10]);
    expect(state.currentTurn).toBe(0);
    expect(state.phase).toBe(outcome === 'wrongDodge' ? 'TREASURE_DODGE_DECISION' : 'ACTION');
  });

  it.each([false, true])('keeps the actual first-come picker canonical in MP=%s', multiplayer => {
    const chosenCard = makeZoneCard('B2');
    const context = actionContext({ _isMP: multiplayer, phase: 'FIRST_COME_PICK_SELECT', abilityData: { revealedCards: [chosenCard], pickOrder: [0], pickIndex: 0, pickSource: 0 } });
    const { state } = runHandler(context, 'firstComePickSelectCard', [0]);
    const expected = `【先到先得】${multiplayer ? 'END-B ' : '你'}选择了 [B2] 新鲜空气`;
    if (multiplayer) assertFullHistoryAcrossViewers(state, [expected]);
    else expect(state.log).toEqual([expected]);
    expect(state.players[0].hand).toContainEqual(chosenCard);
    expect(state.players.map(player => [player.hp, player.san])).toEqual([[10, 10], [10, 10], [10, 10]]);
  });

  it.each([
    { multiplayer: false, useSlime: false, hasSlime: true }, { multiplayer: true, useSlime: false, hasSlime: true },
    { multiplayer: false, useSlime: true, hasSlime: true }, { multiplayer: true, useSlime: true, hasSlime: true },
    { multiplayer: false, useSlime: true, hasSlime: false }, { multiplayer: true, useSlime: true, hasSlime: false },
  ])('keeps the actual slime responder canonical in MP=$multiplayer/use=$useSlime/present=$hasSlime', ({ multiplayer, useSlime, hasSlime }) => {
    const context = actionContext({ _isMP: multiplayer, phase: 'TSG_SLIME_BALANCE', abilityData: { targetIdx: 0, afterHp: 6, afterSan: 4 } });
    context.gs.players[0].hp = 6;
    context.gs.players[0].san = 4;
    context.gs.players[0].hand = hasSlime ? [createTsathogguaSlimeCard()] : [];
    context.broadcastEndTurnDecisionAnimTransaction = () => false;
    const { state } = runHandler(context, 'resolveTsathogguaSlimeBalance', [useSlime]);
    const action = !useSlime ? '没有牺牲黏液' : hasSlime ? '牺牲黏液，将HP/SAN平分为 5/5' : '已没有可牺牲的黏液';
    const expected = `【撒托古亚的赐福黏液】${multiplayer ? 'END-B' : '你'} ${action}`;
    if (multiplayer) assertFullHistoryAcrossViewers(state, [expected]);
    else expect(state.log).toEqual([expected]);
    expect([state.players[0].hp, state.players[0].san]).toEqual(useSlime && hasSlime ? [5, 5] : [6, 4]);
    expect(state.players[0].hand).toHaveLength(hasSlime && !useSlime ? 1 : 0);
  });

  it.each([false, true])('keeps the actual torch owner canonical in MP=%s', async multiplayer => {
    const context = actionContext({ _isMP: multiplayer, phase: 'IGNITE_TORCH_DISCARD', abilityData: { playerIndex: 0 } });
    context.igniteTorchFlamingCardIdsRef = { current: new Set() };
    context.playIgniteTorchCardFlameEffect = async () => {};
    context.playIgniteTorchFireSound = () => {};
    const { state } = await runAsyncHandler(context, 'igniteTorchDiscardCard', [0]);
    const expected = `【引燃火把】${multiplayer ? 'END-B' : '你'} 本回合不受邪神之力影响`;
    expect(state.log.at(-1)).toBe(expected);
    if (multiplayer) assertFullHistoryAcrossViewers(state, state.log);
    expect(state.players[0].hand).toHaveLength(0);
    expect(state.discard).toHaveLength(1);
    expect(state.players.map(player => [player.hp, player.san])).toEqual([[10, 10], [10, 10], [10, 10]]);
  });

  it.each([false, true])('keeps the UI-reproduced decipher-stone actor canonical in MP=%s', multiplayer => {
    const chosenCard = makeZoneCard('D2', 2);
    const context = actionContext({ _isMP: multiplayer, phase: 'DECIPHER_STONE_CARVING', abilityData: { playerIndex: 0, revealedCards: [chosenCard] } });
    context.document = { querySelectorAll: () => [] };
    context.getCardElementAnchor = () => null;
    const { state } = runHandler(context, 'decipherStoneCarvingConfirm', [{ handCard: chosenCard, deckTopCards: [], deckBottomCards: [] }]);
    const expected = `【解读石刻】${multiplayer ? 'END-B' : '你'} 选择将 [D2] 群蛇陷阱 收入手牌`;
    if (multiplayer) assertFullHistoryAcrossViewers(state, [expected]);
    else expect(state.log).toEqual([expected]);
    expect(state.players[0].hand).toContainEqual(chosenCard);
    expect(state.players.map(player => [player.hp, player.san])).toEqual([[10, 10], [10, 10], [10, 10]]);
  });

  it.each([false, true])('separates a hunter named 安 from another player named 安从 (public=%s)', revealed => {
    const context = actionContext({
      phase: revealed ? 'HUNT_SELECT_CARD_FROM_PUBLIC' : 'HUNT_CONFIRM',
      abilityData: revealed ? { huntTi: 2, maxToTake: 3 } : { huntTi: 2, revCard: makeZoneCard('A1') },
      players: makeStandardPlayers(3, [
        { name: '安', role: '追猎者', hand: [makeZoneCard('A1')] },
        { name: '安从', role: '邪祀者' },
        { name: '贝拉', role: '寻宝者', hp: 3, hand: [makeZoneCard('B2')] },
      ]),
    });
    const { state } = runHandler(context, revealed ? 'huntSelectCardFromPublic' : 'huntConfirm', [0]);
    const expected = revealed
      ? '安 从 贝拉 的公开手牌中选择了 [B2]！'
      : '安 从 贝拉 的手牌中暗抽了一张 [B2]！';
    expect(state.log).toContain(expected);
    assertFullHistoryAcrossViewers(state, state.log);
  });

  it('separates a blind-swap actor named 安 from a player named 安暗抽', () => {
    const context = actionContext({
      phase: 'SWAP_STEAL_CARD', abilityData: { swapTi: 2 },
      players: makeStandardPlayers(3, [
        { name: '安', role: '寻宝者', hand: [makeZoneCard('A1')] },
        { name: '安暗抽', role: '邪祀者' },
        { name: '贝拉', role: '追猎者', hand: [makeZoneCard('B2')] },
      ]),
    });
    const { state } = runHandler(context, 'swapSelectTargetCard', [0]);
    assertFullHistoryAcrossViewers(state, ['安 暗抽了1张牌']);
  });

  it('persists both shared bury responders by name for terminal and reconnect history', () => {
    const context = actionContext({ phase: 'BURY_ALIVE_SELECT' });
    context.gs.abilityData = { source: 0, targets: [0, 1], buryAliveChoices: [
      { cardId: context.gs.players[0].hand[0].id, cardIndex: 0 },
      { cardId: context.gs.players[1].hand[0].id, cardIndex: 0 },
      null,
    ] };
    const originalDeckCount = context.gs.deck.length;
    const { state, queue } = runHandler(context, 'resolveSharedBuryAlive', [context.gs]);
    assertFullHistoryAcrossViewers(state, [
      '【活埋】END-B 将 [A1] 坠落 放到了牌堆底',
      '【活埋】END-A 将 [B2] 新鲜空气 放到了牌堆底',
    ]);
    expect(queue.filter(step => step.type === 'BURY_TO_DECK').map(step => step.fromPid)).toEqual([0, 1]);
    expect(state.players.map(player => player.hand.length)).toEqual([0, 1, 0]);
    expect(state.deck).toHaveLength(originalDeckCount + 2);
    expect(state.players.map(player => [player.hp, player.san])).toEqual([[10, 10], [10, 10], [10, 10]]);
  });

  it.each([false, true])('keeps the swap introduction canonical in MP=%s', multiplayer => {
    const context = actionContext({ _isMP: multiplayer, phase: 'SWAP_SELECT_TARGET' });
    const { state } = runHandler(context, 'swapSelectTarget', [1]);
    const expected = `${multiplayer ? 'END-B ' : '你'}（寻宝者）对 END-A 【掉包】，请选择要抽取的牌`;
    if (multiplayer) assertFullHistoryAcrossViewers(state, [expected]);
    else expect(state.log).toEqual([expected]);
    expect(state.phase).toBe('SWAP_STEAL_CARD');
    expect(state.players.map(player => player.hand.length)).toEqual([1, 2, 0]);
  });

  it.each([false, true])('keeps a blind swap card hidden while naming its actor in MP=%s', multiplayer => {
    const context = actionContext({ _isMP: multiplayer, phase: 'SWAP_STEAL_CARD', abilityData: { swapTi: 1 } });
    const { state } = runHandler(context, 'swapSelectTargetCard', [0]);
    const expected = `${multiplayer ? 'END-B ' : '你'}暗抽了1张牌`;
    if (multiplayer) assertFullHistoryAcrossViewers(state, [expected]);
    else expect(state.log).toEqual([expected]);
    expect(state.log.join('\n')).not.toContain('[B2]');
    expect(state.players.map(player => player.hand.length)).toEqual([2, 1, 0]);
    expect(state.skillUsed).toBe(true);
    expect(state.phase).toBe('SWAP_GIVE_CARD');
  });

  it.each([false, true])('keeps a public hunter loot choice canonical in MP=%s', multiplayer => {
    const context = actionContext({ _isMP: multiplayer, phase: 'HUNT_SELECT_CARD_FROM_PUBLIC', abilityData: { huntTi: 1, maxToTake: 3 } });
    const { state } = runHandler(context, 'huntSelectCardFromPublic', [0]);
    const expected = `${multiplayer ? 'END-B ' : '你'}从 END-A 的公开手牌中选择了 [B2]！`;
    if (multiplayer) assertFullHistoryAcrossViewers(state, [expected]);
    else expect(state.log).toEqual([expected]);
    expect(state.players.map(player => player.hand.length)).toEqual([2, 1, 0]);
    expect(state.phase).toBe('HUNT_SELECT_CARD_FROM_PUBLIC');
  });

  it.each([
    { multiplayer: false, revealed: false }, { multiplayer: true, revealed: false },
    { multiplayer: false, revealed: true }, { multiplayer: true, revealed: true },
  ])('keeps lethal hunt loot text canonical in MP=$multiplayer, revealed=$revealed', ({ multiplayer, revealed }) => {
    const context = actionContext({ _isMP: multiplayer, phase: 'HUNT_CONFIRM', abilityData: { huntTi: 1, revCard: makeZoneCard('A1') } });
    context.gs.players[1].hp = 3;
    context.gs.players[1].revealHand = revealed;
    const { state } = runHandler(context, 'huntConfirm', [0]);
    const actor = multiplayer ? 'END-B ' : '你';
    const loot = revealed
      ? [`${actor}夺取了 END-A 的全部公开手牌（2 张）！`]
      : [`${actor}从 END-A 的手牌中暗抽了一张 [B2]！`, `${actor}从 END-A 的手牌中暗抽了一张 [C4]！`];
    expect(state.log.filter(line => /夺取了|暗抽了一张/.test(line))).toEqual(loot);
    if (multiplayer) assertFullHistoryAcrossViewers(state, state.log);
    expect(state.players.map(player => player.hand.length)).toEqual([2, 0, 0]);
    expect(state.players[1].hp).toBe(0);
    expect(state.players[1].isDead).toBe(true);
    expect(state.discard).toHaveLength(1);
  });
});
