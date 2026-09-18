import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import * as game from '../index';
import * as helpers from '../animQueueHelpers';
import * as animLogs from '../animLogs';
import { isAiSeat } from '../rotateState';
import { createBlackGoatYoungCard } from '../../constants/card';
import { makeGs, makePlayer, makeZoneCard } from './factory';

const hand = count => Array.from({ length: count }, () => makeZoneCard('B2'));
const abyss = () => makeZoneCard('D4', 0, { id: 'abyss', name: '同归深渊', type: 'sameAbyssChoice', hpVal: 2 });

function localDecision(gs, choice) {
  const source = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('  function sameAbyssSelect(');
  const end = /\n {2}}\r?\n/.exec(source.slice(start));
  const context = { ...game, ...helpers, ...animLogs, isAiSeat, gs,
    isLocalSameAbyssTargetPhase: () => true,
    finishTargetContinuation: result => { context.result = result.nextGs; } };
  runInNewContext(source.slice(start, start + end.index + end[0].length), context);
  context.sameAbyssSelect(choice);
  return context.result;
}

describe('same-abyss live and headless policy integration', () => {
  it.each([10, 5, 4])('discards down to the source current four cards and preserves %i HP', hp => {
    const card = abyss();
    const players = [makePlayer({ hand: hand(4) }), makePlayer({ name: '艾伦', hp, hand: hand(5) })];
    const result = game.applyFx(card, 0, null, players, [], [], makeGs({ players }), true);
    expect(result.P[1]).toMatchObject({ hp, isDead: false });
    expect(result.P[1].hand).toHaveLength(4);
    expect(result.msgs.some(line => line.includes('选择承受伤害'))).toBe(false);
  });

  it('prefers removing a harmful derived card over losing four HP above the old threshold', () => {
    const players = [makePlayer({ hand: hand(4) }), makePlayer({ hp: 6, hand: [...hand(5), createBlackGoatYoungCard()] })];
    const result = game.applyFx(abyss(), 0, null, players, [], [], makeGs({ players }), true);
    expect(result.P[1].hp).toBe(6);
    expect(result.P[1].hand).toHaveLength(4);
    expect(result.P[1].hand.some(card => card.isBlackGoatYoung)).toBe(false);
  });

  it('uses the same zero-cost choice in local resolution and the simulator', () => {
    const players = [makePlayer({ hp: 4, hand: hand(5) }), makePlayer({ hand: hand(5) })];
    const gs = makeGs({ players, currentTurn: 1, phase: 'SAME_ABYSS_SELECT',
      abilityData: { actorIdx: 1, targetIdx: 0, actorHandCount: 5, discardCount: 0, _turnOwner: 1 } });
    const local = localDecision(gs, 'discard');
    const headless = game.resolveHeadlessSameAbyss(gs);
    expect(local.players[0].hp).toBe(4);
    expect(headless.players[0].hp).toBe(4);
    expect(local.players[0].hand).toEqual(headless.players[0].hand);
  });

  it('does not double-count a triggering card with numeric identity zero', () => {
    const card = { ...abyss(), id: 0 };
    const players = [makePlayer({ hand: [...hand(3), card] }), makePlayer({ hand: hand(5), hp: 4 })];
    const result = game.applyFx(card, 0, null, players, [], [], makeGs({ players }), true);
    expect(result.P[1].hand).toHaveLength(4);
    expect(result.P[1].hp).toBe(4);
  });
});
