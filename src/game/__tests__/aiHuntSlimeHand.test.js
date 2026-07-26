import { describe, expect, it } from 'vitest';
import { ROLE_CULTIST, ROLE_HUNTER, ROLE_TREASURE, isTsathogguaSlime } from '../coreUtils';
import { startNextTurn } from '../turnEngine';
import { aiStep } from '../aiTurn';
import { buildTurnStartDrawReplayQueue, getTurnStartDrawBaselineLog } from '../turnAnimState';
import { buildAiHuntEventAnimQueue } from '../animQueueCore';
import { dedupeInferredDiscardTransfers } from '../animQueueHelpers';
import { makeGs, makePlayer, makeZoneCard } from './factory';
import { createTsathogguaSlimeCard } from '../../constants/card';

// 复现：AI（追猎者 + 撒托古亚黏液）在摸牌阶段消耗完全部黏液后开始追捕，
// 播放追捕瞄准镜（SKILL_HUNT）时手牌仍显示已消失的黏液牌。
describe('AI 黏液消耗后追捕时的手牌视觉状态', () => {
  it('SKILL_HUNT 步骤期间猎人手牌不应再包含已消耗的黏液', () => {
    const slime1 = createTsathogguaSlimeCard();
    const players = [
      makePlayer({ name: '你', role: ROLE_TREASURE, hp: 8, hand: [] }),
      makePlayer({
        name: '黛安娜',
        role: ROLE_HUNTER,
        godName: 'TSG',
        godLevel: 1,
        hand: [
          slime1,
          makeZoneCard('A3', 3), // 无尽通道
          makeZoneCard('A2', 0), // 蚂蚁虽小
        ],
      }),
      makePlayer({ name: '贝拉', role: ROLE_CULTIST, hand: [makeZoneCard('D3', 0)] }),
      makePlayer({ name: '卡洛斯', role: ROLE_TREASURE, hand: [makeZoneCard('C2', 0)] }),
      makePlayer({ name: '艾伦', role: ROLE_CULTIST, hand: [makeZoneCard('A4', 0)] }),
    ];
    const deck = [
      makeZoneCard('D2', 2), // 群蛇陷阱（黏液额外摸牌，AI 弃置）
      makeZoneCard('D2', 1), // 荆棘山路（固定摸牌，AI 弃置）
      makeZoneCard('A1', 0),
      makeZoneCard('A1', 0),
      makeZoneCard('A1', 0),
      makeZoneCard('A1', 0),
    ];
    const gs = makeGs({
      players,
      deck,
      discard: [],
      currentTurn: 0,
      phase: 'ACTION',
      log: [],
      skillUsed: true,
      restUsed: false,
      huntAbandoned: [],
      apophisNight: { active: true, threshold: 2, count: 0, limit: 12 },
    });

    const gs2 = startNextTurn(gs);
    expect(gs2.currentTurn).toBe(1);
    expect(gs2.phase).toBe('AI_TURN');
    // 摸牌阶段结束后黏液已消耗
    expect(gs2.players[1].hand.filter(isTsathogguaSlime)).toHaveLength(0);
    expect(gs2.log.filter(l => l.includes('黏液消失'))).toHaveLength(1);

    const rawResult = aiStep(gs2);
    expect((rawResult._aiHuntEvents || []).length).toBeGreaterThan(0);

    // ── 按 App.jsx 的 AI 回合动画队列拼装（抽丝剥茧版） ──
    const baselineLog = getTurnStartDrawBaselineLog(gs2);
    const replayOldGs = { ...gs2, players: gs2._playersBeforeThisDraw, log: baselineLog };
    const replay = buildTurnStartDrawReplayQueue({
      oldGs: replayOldGs,
      effectOldGs: replayOldGs,
      newGs: gs2,
    });
    const huntQ = (rawResult._aiHuntEvents || [])
      .flatMap(evt => buildAiHuntEventAnimQueue(evt, '黛安娜'));
    const huntSteps = huntQ.filter(step => step.type === 'SKILL_HUNT');
    expect(huntSteps.length).toBeGreaterThan(0);
    huntSteps.forEach((step, i) => {
      const dianaHand = step.visualSetupPatch?.players?.[1]?.hand || [];
      expect(
        dianaHand.filter(isTsathogguaSlime),
        `第 ${i + 1} 次追捕必须显式绑定已消耗黏液后的手牌快照`,
      ).toHaveLength(0);
    });
    const queue = dedupeInferredDiscardTransfers([...replay.queue, ...huntQ]);
    try {
      console.log('[Q]', queue.map(s => {
        const patchPlayers = s?.visualSetupPatch?.players || (s?.type === 'STATE_PATCH' ? s?.players : null);
        const diana = patchPlayers?.[1];
        return `${s?.type}${patchPlayers ? `[hand:${(diana?.hand || []).map(c => c.name).join('|')}]` : ''}`;
      }).join(' → '));
    } catch { /* noop */ }

    // ── 模拟 useAnimationQueue 的视觉补丁语义 ──
    // visualPlayers 渲染优先级：earthquakeVisualPlayers（最近 applyVisualPatch/STATE_PATCH）
    // → visualPlayersLockRef（动画期间的锁）→ gs.players
    let override = null;             // earthquakeVisualPlayers
    let lock = gs2._playersBeforeThisDraw || null; // aiTurnStartReplay.visualLock
    const setupStep = queue.find(s => s?.visualSetupPatch && s.visualSetupTiming === 'queueStart');
    if (setupStep?.visualSetupPatch?.players) override = setupStep.visualSetupPatch.players;
    const skillHuntSnapshots = [];
    for (const step of queue) {
      if (!step) continue;
      if (step.type === 'STATE_PATCH') {
        lock = null;
        if (Object.prototype.hasOwnProperty.call(step, 'players')) override = step.players;
        continue;
      }
      if (step.type === 'VISUAL_LOCK') {
        if (step.players) lock = step.players;
        continue;
      }
      if (step.visualSetupPatch?.players) {
        override = step.visualSetupPatch.players;
        lock = step.visualSetupPatch.players;
      }
      const timeline = Array.isArray(step.visualTimeline) ? step.visualTimeline : [];
      for (const item of timeline) {
        if (item?.patch?.players) override = item.patch.players;
      }
      if (step.type === 'SKILL_HUNT') {
        skillHuntSnapshots.push(override || lock || gs2.players);
      }
    }

    expect(skillHuntSnapshots.length).toBeGreaterThan(0);
    skillHuntSnapshots.forEach((snapshot, i) => {
      const dianaHand = snapshot?.[1]?.hand || [];
      const slimes = dianaHand.filter(isTsathogguaSlime);
      expect(
        slimes,
        `第 ${i + 1} 个 SKILL_HUNT 步骤期间黛安娜手牌仍显示 ${slimes.length} 张黏液`,
      ).toHaveLength(0);
    });
  });
});
