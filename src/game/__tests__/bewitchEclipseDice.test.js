import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiStep } from '../aiTurn';
import { compileFreshVisualEventQueue as buildAnimQueue } from '../visualEventTransactionCompiler';
import { buildBewitchGiftReplay } from '../animReplayEvents';
import { mergeApophisTargetQueue } from '../apophisAnimQueue';
import { scopeAiActionReplayMetadata, buildScopedAiActionReplayState } from '../aiTurnPresentation';
import { splitTransitionLogs } from '../animLogs';
import { getApophisNightForLevel } from '../apophisNight';
import {
  buildTurnStartDrawReplayQueue,
  getTurnStartDrawBaselineLog,
  scopeTurnStartVisualEvents,
} from '../turnAnimState';
import { copyPlayers, ROLE_CULTIST } from '../coreUtils';
import { makeGs, makePlayer, makeGodCard, makeZoneCard } from './factory';

afterEach(() => vi.restoreAllMocks());

describe('AI 黑夜蛊惑阿波菲斯（日食）队列', () => {
  it('黑夜骰子只在蛊惑前播放一次，日食后的下一回合队列不重播', () => {
    const apoCard = makeGodCard('APO', { id: 'apo-gift' });
    const vritraCard = makeGodCard('VRI', { id: 'vri-draw' });
    const selfHarmCard = { id: 'inspection-self-harm', name: '自残', effect: 'selfDamageHP', value: 2, type: 'negative' };
    const players = [
      // 你：已信仰阿波菲斯（黑夜由此而来），蛊惑成功后会“被邪神抛弃”
      makePlayer({ name: '你', godName: 'APO', godLevel: 1, hasBelievedGod: true, godZone: [makeGodCard('APO', { id: 'apo-mine' })] }),
      // 贝拉：邪祀者，手牌有阿波菲斯
      makePlayer({ name: '贝拉', role: ROLE_CULTIST, roleRevealed: true, hand: [apoCard, vritraCard, makeZoneCard('B3', 0), makeZoneCard('C2', 0)] }),
      // 艾伦：已信仰弗栗多（将被“被迫改信”）
      makePlayer({
        name: '艾伦',
        san: 8,
        godEncounters: 1,
        godEncounterCount: 1,
        godName: 'VRI',
        godLevel: 1,
        hasBelievedGod: true,
        godZone: [makeGodCard('VRI', { id: 'vri-a' })],
      }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 1,
      phase: 'AI_TURN',
      apophisNight: getApophisNightForLevel(1),
      _apophisTargetSeq: 0,
      log: [
        '── 贝拉 的回合开始 ──',
        '贝拉 遭遇邪神 弗栗多！（第1次）失去 1 SAN',
        '贝拉（邪祀者）将邪神牌收入手牌',
      ],
      deck: [makeZoneCard('B3', 0), makeZoneCard('C1', 0)],
      inspectionDeck: [selfHarmCard],
      inspectionDiscard: [],
    });

    // 固定所有随机选择；黑夜骰为 4，目标不偏移，AI 稳定执行蛊惑。
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const rawResult = aiStep({
      ...gs,
      players: copyPlayers(gs.players),
      deck: [...gs.deck],
      discard: [...gs.discard],
      log: [...gs.log],
    }, {});
    const newGs = rawResult;
    expect(newGs.log).toContain('【黑夜】贝拉 选择【蛊惑】目标掷出 4，目标未偏移');
    expect(newGs.log.some(line => line.includes('贝拉（邪祀者）对 艾伦 【蛊惑】'))).toBe(true);
    expect(newGs.log).toContain('艾伦 遭遇邪神 阿波菲斯！（第2次）失去 2 SAN');
    expect(newGs.log).toContain('艾伦 的SAN检定结果为"自残"');
    expect(newGs.log).toContain('艾伦 自残，失去 2 HP');
    expect(newGs.log.some(line => line.includes('【噬日灭世】黑夜降临'))).toBe(true);

    // —— 以下为 executeAiTurn 蛊惑分支的同构组装 ——
    const oldLog = gs.log;
    const nextLog = newGs.log;
    const { currentTurnLogs: actionMsgs } = splitTransitionLogs(oldLog, nextLog);
    const actionLog = [...oldLog, ...actionMsgs];
    const actionReplayMetadata = scopeAiActionReplayMetadata(newGs);
    const bewitchEvent = actionReplayMetadata.visualEvents.find(e => e?.type === 'bewitchGift');
    expect(bewitchEvent).toBeTruthy();
    const P_actionEnd = rawResult._playersBeforeNextDraw || newGs.players;
    const fakeGs = (ps, log = gs.log) => ({ ...gs, players: ps, log, _statEvents: gs._statEvents || [], _statEventSeq: gs._statEventSeq || 0 });
    const actionOldGsForApophis = fakeGs(P_actionEnd, actionLog);
    const replayNewGs = buildScopedAiActionReplayState({
      state: { ...fakeGs(P_actionEnd, actionLog), deck: newGs.deck },
      players: P_actionEnd,
      discard: newGs.discard,
      log: actionLog,
      inspectionEvents: (newGs._inspectionEvents || []),
      metadata: actionReplayMetadata,
    });
    const bewitchReplay = buildBewitchGiftReplay({
      oldGs: actionOldGsForApophis,
      newGs: replayNewGs,
      bewitchEvent,
      logDelta: actionMsgs,
      buildAnimQueue,
      copyPlayers,
    });
    const assembled = bewitchReplay.queue;
    const actionQueue = mergeApophisTargetQueue(assembled, gs, newGs);
    const isNightDice = step => step?.type === 'DICE_ROLL' && step?.diceMode === 'apophisNight';
    const actionDice = actionQueue.filter(isNightDice);
    const diceIdx = actionQueue.findIndex(isNightDice);
    const bewitchIdx = actionQueue.findIndex(step => step?.type === 'SKILL_BEWITCH');
    const eclipseIdx = actionQueue.findIndex(step => step?.type === 'APOPHIS_ECLIPSE');

    expect(actionDice).toHaveLength(1);
    expect(diceIdx).toBeLessThan(bewitchIdx);
    expect(bewitchIdx).toBeLessThan(eclipseIdx);

    // executeAiTurn 会在动作队列尚未提交、consumed 集合仍为空时预构建
    // 下一名 AI 的回合开始队列；这里必须证明 action-owned 黑夜事件不会泄漏进去。
    const turnStartVisualEvents = scopeTurnStartVisualEvents(newGs._visualEvents);
    expect(turnStartVisualEvents.some(event => event?.type === 'apophisTarget')).toBe(false);
    expect(turnStartVisualEvents.some(event => event?.type === 'bewitchGift')).toBe(false);
    expect(turnStartVisualEvents.some(event => event?.type === 'turnStart')).toBe(true);
    expect(turnStartVisualEvents.some(event => event?.type === 'drawCard')).toBe(true);

    const nextTurnState = { ...newGs, _visualEvents: turnStartVisualEvents };
    const nextTurnOldGs = {
      ...newGs,
      players: rawResult._playersBeforeNextDraw || newGs._playersBeforeThisDraw || newGs.players,
      discard: [...(rawResult._discardBeforeNextDraw || newGs.discard || [])],
      log: getTurnStartDrawBaselineLog(newGs),
      _visualEvents: turnStartVisualEvents,
    };
    const nextTurnReplay = buildTurnStartDrawReplayQueue({
      oldGs: nextTurnOldGs,
      effectOldGs: nextTurnOldGs,
      newGs: nextTurnState,
      consumedVisualEventIds: new Set(),
      buildQueue: buildAnimQueue,
    });

    expect(nextTurnReplay.queue.filter(isNightDice)).toHaveLength(0);
    expect([...actionQueue, ...nextTurnReplay.queue].filter(isNightDice)).toHaveLength(1);
  });
});
