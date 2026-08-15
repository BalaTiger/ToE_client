import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { aiStep } from '../aiTurn';
import { buildAnimQueue } from '../animQueueCore';
import { buildBewitchGiftReplay } from '../animReplayEvents';
import { mergeApophisTargetQueue } from '../apophisAnimQueue';
import { scopeAiActionReplayMetadata, buildScopedAiActionReplayState } from '../aiTurnPresentation';
import { getApophisNightForLevel } from '../apophisNight';
import { copyPlayers } from '../coreUtils';
import { makeGs, makePlayer, makeGodCard, makeZoneCard } from './factory';

describe('AI 黑夜蛊惑阿波菲斯（日食）队列复现', () => {
  it('黑夜骰子在日食之后不应重播', () => {
    const apoCard = makeGodCard('APO', { id: 'apo-gift' });
    const players = [
      // 你：已信仰阿波菲斯（黑夜由此而来），蛊惑成功后会“被邪神抛弃”
      makePlayer({ name: '你', godName: 'APO', godLevel: 1, hasBelievedGod: true, godZone: [makeGodCard('APO', { id: 'apo-mine' })] }),
      // 贝拉：邪祀者，手牌有阿波菲斯
      makePlayer({ name: '贝拉', role: 'cultist', roleRevealed: true, hand: [apoCard, makeZoneCard('B3', 0), makeZoneCard('C2', 0)] }),
      // 艾伦：已信仰弗栗多（将被“被迫改信”）
      makePlayer({ name: '艾伦', godName: 'VUL', godLevel: 1, hasBelievedGod: true, godZone: [makeGodCard('VUL', { id: 'vul-a' })] }),
    ];
    const gs = makeGs({
      players,
      currentTurn: 1,
      phase: 'AI_TURN',
      apophisNight: getApophisNightForLevel(1),
      _apophisTargetSeq: 0,
      log: ['── 贝拉 的回合开始 ──'],
      deck: [makeZoneCard('B3', 0), makeZoneCard('C1', 0)],
    });

    const rawResult = aiStep(gs, {});
    const newGs = rawResult;
    const out = [];
    out.push('log: ' + JSON.stringify(newGs.log, null, 1));
    out.push('visualEvents: ' + JSON.stringify((newGs._visualEvents || []).map(e => ({ type: e.type, id: e.id, stage: e.turnStartStage || null })), null, 1));

    // —— 以下为 executeAiTurn 蛊惑分支的同构组装 ——
    const oldLog = gs.log;
    const nextLog = newGs.log;
    const actionMsgs = nextLog.slice(oldLog.length);
    const actionLog = [...oldLog, ...actionMsgs];
    const actionReplayMetadata = scopeAiActionReplayMetadata(newGs);
    const bewitchEvent = actionReplayMetadata.visualEvents.find(e => e?.type === 'bewitchGift');
    out.push('bewitchEvent: ' + (bewitchEvent ? bewitchEvent.id : 'null'));
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
    const finalQ = mergeApophisTargetQueue(assembled, gs, newGs);
    const summarize = q => q.map((s, i) => `${i}:${s.type}${s.diceMode ? `(${s.diceMode}#${s._apophisTargetSeq})` : ''}${s.visualEventId ? `[${s.visualEventId.slice(0, 24)}]` : ''}`);
    out.push('bewitchReplay.queue: ' + JSON.stringify(summarize(assembled), null, 1));
    out.push('finalQ: ' + JSON.stringify(summarize(finalQ), null, 1));
    const diceCount = finalQ.filter(s => s?.type === 'DICE_ROLL' && s?.diceMode === 'apophisNight').length;
    out.push('nightDiceCount: ' + diceCount);
    writeFileSync('tmp_bewitch_repro.txt', out.join('\n'), 'utf8');
  });
});
