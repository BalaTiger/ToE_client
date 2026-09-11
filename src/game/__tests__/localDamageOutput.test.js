import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import * as game from '../index';
import * as helpers from '../animQueueHelpers';
import * as animLogs from '../animLogs';
import { isAiSeat } from '../rotateState';
import { consumeVisualLogEntries } from '../visualEventLogs';
import { createBlackGoatYoungCard } from '../../constants/card';
import { makeGs, makePlayer } from './factory';

const source = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
function handler(name) {
  const start = source.indexOf(`  function ${name}(`);
  const end = /\n {2}}\r?\n/.exec(source.slice(start));
  return source.slice(start, start + end.index + end[0].length);
}

describe('local handlers use the complete damage result', () => {
  it.each([false, true])('confirmed redirect retains damage through a later rope decision (%s)', redirectAgain => {
    const players = [makePlayer({ name: '你', hp: redirectAgain ? 10 : 2 }),
      makePlayer({ name: '艾伦', etherealizeStacks: redirectAgain ? 1 : 0 }), makePlayer({ role: '追猎者' })];
    game.addDamageLink(players, 0, 1, { expiryOwner: 1 });
    const gs = makeGs({ players: structuredClone(players), phase: 'ETHEREALIZE_DECISION', log: [] });
    const context = { ...game, ...helpers, ...animLogs, gs,
      localDisplayName: (idx, name) => idx === 0 ? '你' : name,
      buildTargetContinuationGs: args => ({ ...gs, ...args.extraPatch, players: args.players, log: args.log }),
      finishTargetContinuation: args => { context.result = args; },
      finishEtherealizeDecision: args => { context.result = { ...args, nextGs: { ...gs, players: args.players, ...args.abilityData } }; },
    };
    runInNewContext(handler('applyLossDirectly') + handler('settleEtherealizeChain'), context);
    context.settleEtherealizeChain({ players, deck: [], discard: [], log: [],
      abilityData: { _turnOwner: 0, confirmedLosses: [{ targetIdx: 0, lostHp: 1 }] } });
    const { queue, nextGs } = context.result;
    const consumed = new Set();
    const logs = animLogs.prepareAnimQueueLogs(queue, { ...nextGs, log: [] })
      .flatMap(step => consumeVisualLogEntries(step.logEntries, consumed));
    expect(logs.filter(line => line === '你 失去 1 HP')).toHaveLength(1);
    expect(logs.filter(line => line.includes('绳索断裂'))).toHaveLength(1);
    if (redirectAgain) {
      expect(nextGs.phase).toBe('ETHEREALIZE_DECISION');
      expect(nextGs.players.map(player => player.hp)).toEqual([9, 10, 10]);
    } else {
      expect(logs.filter(line => line.includes('倒下了'))).toHaveLength(1);
      expect(nextGs.players[0].isDead).toBe(true);
    }
  });

  it.each(['sameAbyssSelect', 'settleSphinxDodge'])('%s carries rope death and clear-hand messages without a transcript fallback', name => {
    const players = [makePlayer({ name: '你', hp: name === 'sameAbyssSelect' ? 5 : 4, hand: [createBlackGoatYoungCard()] }),
      makePlayer({ name: '艾伦' }), makePlayer({ name: '贝拉', role: '追猎者' })];
    game.addDamageLink(players, 0, 1, { expiryOwner: 1 });
    const gs = makeGs({ players, phase: name === 'sameAbyssSelect' ? 'SAME_ABYSS_SELECT' : 'SPHINX_DODGE',
      abilityData: { targetIdx: 0, actorHandCount: 0, discardCount: 1, _turnOwner: 0, sphinxPending: { turnOwner: 0 } },
      _visualEvents: [], _statEvents: [], _statEventSeq: 0, log: ['旧回合消息'] });
    const context = { ...game, ...helpers, ...animLogs, isAiSeat, gs,
      isLocalSameAbyssTargetPhase: () => true,
      finishTargetContinuation: args => { context.result = args; },
    };
    runInNewContext(handler(name), context);
    context[name](name === 'sameAbyssSelect' ? 'damage' : false);
    const { queue, nextGs } = context.result;
    const consumed = new Set();
    const prepared = animLogs.prepareAnimQueueLogs(queue, { ...nextGs, log: ['不可用的结算日志'] });
    const batches = prepared.map(step => consumeVisualLogEntries(step.logEntries, consumed));
    expect(batches.flat()).toEqual(nextGs.log.slice(gs.log.length));
    expect(batches[queue.findIndex(step => step.type === 'GUILLOTINE')]).toEqual(['☠ 你（寻宝者）倒下了！']);
    expect(batches[queue.findIndex(step => step.deathSettlementStep)]).toEqual(['你 的 1 张衍生牌被销毁']);
    expect(nextGs.players[0]).toMatchObject({ hp: 0, isDead: true, hand: [] });
    expect(prepared.flatMap(step => consumeVisualLogEntries(step.logEntries, consumed))).toEqual([]);
  });
});
