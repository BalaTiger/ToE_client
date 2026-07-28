import { describe, expect, it } from 'vitest';
import { canLocalActOnTargetSelectionPhase, derotateGs, rotateGsForViewer } from '../rotateState';

function player(name, hand = []) {
  return { name, hp: 10, san: 10, hand };
}

function names(players) {
  return players.map(p => p.name);
}

describe('rotateGsForViewer', () => {
  it('rotates swap before/after player snapshots with the viewer seat', () => {
    const gs = {
      players: [player('p0'), player('p1'), player('p2')],
      currentTurn: 1,
      abilityData: {},
      _visualEvents: [{
        type: 'swapCards',
        sourceIdx: 1,
        targetIdx: 0,
        beforePlayers: [player('before0'), player('before1'), player('before2')],
        afterPlayers: [player('after0'), player('after1'), player('after2')],
      }],
    };

    const rotated = rotateGsForViewer(gs, 2);

    expect(rotated._visualEvents[0]).toMatchObject({ sourceIdx: 2, targetIdx: 1 });
    expect(names(rotated._visualEvents[0].beforePlayers)).toEqual(['before2', 'before0', 'before1']);
    expect(names(rotated._visualEvents[0].afterPlayers)).toEqual(['after2', 'after0', 'after1']);
  });

  it('rotates top-level animation player snapshots for the viewer', () => {
    const gs = {
      players: [player('你'), player('艾伦'), player('贝拉')],
      currentTurn: 2,
      abilityData: { playerIndex: 0, source: 2, shuChooserIdx: 1, _turnOwner: 2, targets: [0, 2] },
      _playersBeforeThisDraw: [player('draw0'), player('draw1'), player('draw2')],
      _preTurnPlayers: [player('turn0'), player('turn1'), player('turn2')],
      _earthquakeBeforePlayers: [player('quake0'), player('quake1'), player('quake2')],
      _playersBeforeNextDraw: [player('next0'), player('next1'), player('next2')],
      _playersBeforeSkillAction: [player('skill0'), player('skill1'), player('skill2')],
      _playersBeforeCthDraws: [player('cth0'), player('cth1'), player('cth2')],
      _aiHandLimitBeforePlayers: [player('limit0'), player('limit1'), player('limit2')],
    };

    const rotated = rotateGsForViewer(gs, 1);

    expect(names(rotated.players)).toEqual(['艾伦', '贝拉', '你']);
    expect(rotated.currentTurn).toBe(1);
    expect(rotated.abilityData).toEqual({ playerIndex: 2, source: 1, shuChooserIdx: 0, _turnOwner: 1, targets: [2, 1] });
    expect(names(rotated._playersBeforeThisDraw)).toEqual(['draw1', 'draw2', 'draw0']);
    expect(names(rotated._preTurnPlayers)).toEqual(['turn1', 'turn2', 'turn0']);
    expect(names(rotated._earthquakeBeforePlayers)).toEqual(['quake1', 'quake2', 'quake0']);
    expect(names(rotated._playersBeforeNextDraw)).toEqual(['next1', 'next2', 'next0']);
    expect(names(rotated._playersBeforeSkillAction)).toEqual(['skill1', 'skill2', 'skill0']);
    expect(names(rotated._playersBeforeCthDraws)).toEqual(['cth1', 'cth2', 'cth0']);
    expect(names(rotated._aiHandLimitBeforePlayers)).toEqual(['limit1', 'limit2', 'limit0']);
  });

  it('rotates animation event seat indices and embedded player snapshots', () => {
    const gs = {
      players: [player('你'), player('艾伦'), player('贝拉'), player('卡洛斯')],
      _earthquakeDiscardEvents: [
        {
          playerIndex: 0,
          card: { name: '地动山摇' },
          afterPlayers: [player('q0'), player('q1'), player('q2'), player('q3')],
        },
      ],
      _statEvents: [
        { type: 'SAN_LOSS', target: 1, from: { san: 8 }, to: { san: 6 }, seq: 4 },
      ],
      _inspectionTarget: 1,
      _inspectionBeforePlayers: [player('ib0'), player('ib1'), player('ib2'), player('ib3')],
      _inspectionEvents: [
        {
          seq: 2,
          target: 1,
          beforePlayers: [player('insB0'), player('insB1'), player('insB2'), player('insB3')],
          afterPlayers: [player('insA0'), player('insA1'), player('insA2'), player('insA3')],
          statEvents: [
            { type: 'HP_LOSS', target: 1, from: { hp: 10 }, to: { hp: 9 }, seq: 5 },
          ],
        },
      ],
      _aiHuntEvents: [
        {
          hunterIdx: 3,
          targetIdx: 1,
          sourceCardIndex: 2,
          targetCardIndex: 0,
          apophisTargetEvent: { seq: 2, actorIdx: 3, selectedIdx: 1, targetIdx: 1 },
          beforePlayers: [player('b0'), player('b1'), player('b2'), player('b3')],
          afterDiscardPlayers: [player('d0'), player('d1'), player('d2'), player('d3')],
          afterPlayers: [player('a0'), player('a1'), player('a2'), player('a3')],
        },
      ],
      _randomTargetEvents: [
        { seq: 1, sourceIdx: 3, targetIdx: 1, label: '投掷石块' },
      ],
      _tsgSlimeGrantEvents: [
        {
          ownerIdx: 0,
          count: 1,
          playersBefore: [player('tsgB0'), player('tsgB1'), player('tsgB2'), player('tsgB3')],
          playersAfter: [player('tsgA0'), player('tsgA1'), player('tsgA2'), player('tsgA3')],
        },
      ],
      _animMultiplyEvent: { fromIdx: 1, toIdx: 3, sourceCardIndex: 4 },
      _animSphinxReveal: { actorIdx: 0, card: { name: '斯芬克斯' } },
      _visualEvents: [
        { type: 'turnStart', playerIdx: 3 },
        { type: 'drawCard', playerIdx: 1, card: { name: '测试牌' } },
        { type: 'timedOutDrawDiscard', drawerIdx: 0, card: { name: '弃牌' } },
        { type: 'bewitchGift', sourceIdx: 3, targetIdx: 1, card: { name: '蛊惑牌' } },
        { type: 'huntTarget', sourceIdx: 0, targetIdx: 3 },
        { type: 'huntReveal', sourceIdx: 3, targetIdx: 0, card: { name: '亮出牌' } },
        {
          type: 'huntResult',
          sourceIdx: 3,
          hunterIdx: 3,
          targetIdx: 1,
          beforePlayers: [player('hrB0'), player('hrB1'), player('hrB2'), player('hrB3')],
          afterDiscardPlayers: [player('hrD0'), player('hrD1'), player('hrD2'), player('hrD3')],
          afterDamagePlayers: [player('hrM0'), player('hrM1'), player('hrM2'), player('hrM3')],
          afterPlayers: [player('hrA0'), player('hrA1'), player('hrA2'), player('hrA3')],
        },
        {
          type: 'sphinxResult',
          actorIdx: 2,
          card: { name: '斯芬克斯牌' },
          guessCorrect: true,
          msgs: ['猜测正确'],
        },
        {
          type: 'statEvents',
          statEvents: [
            { type: 'HP_LOSS', target: 1, from: { hp: 10 }, to: { hp: 8 } },
            { type: 'DAMAGE_LINK_BREAK', pair: [0, 3], players: [player('v0'), player('v1'), player('v2'), player('v3')] },
          ],
        },
        {
          type: 'earthquake',
          beforePlayers: [player('eq0'), player('eq1'), player('eq2'), player('eq3')],
          beforeDiscard: [{ name: 'oldDiscard' }],
          discardEvents: [
            {
              playerIndex: 3,
              card: { name: '地动山摇弃牌' },
              afterPlayers: [player('eqA0'), player('eqA1'), player('eqA2'), player('eqA3')],
            },
          ],
        },
        {
          type: 'cardEffect',
          effectKey: 'earthquake',
          actorIdx: 0,
          beforePlayers: [player('ce0'), player('ce1'), player('ce2'), player('ce3')],
          afterPlayers: [player('ceF0'), player('ceF1'), player('ceF2'), player('ceF3')],
          discardEvents: [
            {
              playerIndex: 1,
              card: { name: '通用卡效弃牌' },
              afterPlayers: [player('ceA0'), player('ceA1'), player('ceA2'), player('ceA3')],
            },
          ],
          statEvents: [{ type: 'HP_LOSS', target: 3, from: { hp: 10 }, to: { hp: 8 } }],
          payload: { sourceIdx: 3, targetIdx: 1, players: [player('ceP0'), player('ceP1'), player('ceP2'), player('ceP3')] },
        },
        {
          type: 'endlessCorridorReplay',
          actorIdx: 3,
          beforePlayers: [player('ecB0'), player('ecB1'), player('ecB2'), player('ecB3')],
          queue: [
            { type: 'DRAW_CARD', targetPid: 3, card: { name: '通道牌' } },
            {
              type: 'SAN_DAMAGE',
              hitIndices: [1],
              targetStats: [
                { hp: 10, san: 10 },
                { hp: 10, san: 8 },
                { hp: 10, san: 10 },
                { hp: 10, san: 10 },
              ],
              statEvents: [{ type: 'SAN_LOSS', target: 1, from: { san: 10 }, to: { san: 8 } }],
            },
            { type: 'STATE_PATCH', players: [player('ec0'), player('ec1'), player('ec2'), player('ec3')] },
          ],
        },
      ],
    };

    const rotated = rotateGsForViewer(gs, 2);

    expect(rotated._earthquakeDiscardEvents[0].playerIndex).toBe(2);
    expect(names(rotated._earthquakeDiscardEvents[0].afterPlayers)).toEqual(['q2', 'q3', 'q0', 'q1']);
    expect(rotated._statEvents[0].target).toBe(3);
    expect(rotated._inspectionTarget).toBe(3);
    expect(names(rotated._inspectionBeforePlayers)).toEqual(['ib2', 'ib3', 'ib0', 'ib1']);
    expect(rotated._inspectionEvents[0].target).toBe(3);
    expect(names(rotated._inspectionEvents[0].beforePlayers)).toEqual(['insB2', 'insB3', 'insB0', 'insB1']);
    expect(names(rotated._inspectionEvents[0].afterPlayers)).toEqual(['insA2', 'insA3', 'insA0', 'insA1']);
    expect(rotated._inspectionEvents[0].statEvents[0].target).toBe(3);
    expect(rotated._aiHuntEvents[0].hunterIdx).toBe(1);
    expect(rotated._aiHuntEvents[0].targetIdx).toBe(3);
    expect(rotated._aiHuntEvents[0].sourceCardIndex).toBe(2);
    expect(rotated._aiHuntEvents[0].targetCardIndex).toBe(0);
    expect(rotated._aiHuntEvents[0].apophisTargetEvent).toMatchObject({ actorIdx: 1, selectedIdx: 3, targetIdx: 3 });
    expect(names(rotated._aiHuntEvents[0].beforePlayers)).toEqual(['b2', 'b3', 'b0', 'b1']);
    expect(names(rotated._aiHuntEvents[0].afterDiscardPlayers)).toEqual(['d2', 'd3', 'd0', 'd1']);
    expect(names(rotated._aiHuntEvents[0].afterPlayers)).toEqual(['a2', 'a3', 'a0', 'a1']);
    expect(rotated._randomTargetEvents[0]).toMatchObject({ sourceIdx: 1, targetIdx: 3, label: '投掷石块' });
    expect(rotated._tsgSlimeGrantEvents[0].ownerIdx).toBe(2);
    expect(names(rotated._tsgSlimeGrantEvents[0].playersBefore)).toEqual(['tsgB2', 'tsgB3', 'tsgB0', 'tsgB1']);
    expect(names(rotated._tsgSlimeGrantEvents[0].playersAfter)).toEqual(['tsgA2', 'tsgA3', 'tsgA0', 'tsgA1']);
    expect(rotated._animMultiplyEvent).toMatchObject({ fromIdx: 3, toIdx: 1, sourceCardIndex: 4 });
    expect(rotated._animSphinxReveal).toMatchObject({ actorIdx: 2 });
    expect(rotated._visualEvents[0].playerIdx).toBe(1);
    expect(rotated._visualEvents[1].playerIdx).toBe(3);
    expect(rotated._visualEvents[2].drawerIdx).toBe(2);
    expect(rotated._visualEvents[3]).toMatchObject({ sourceIdx: 1, targetIdx: 3 });
    expect(rotated._visualEvents[4]).toMatchObject({ sourceIdx: 2, targetIdx: 1 });
    expect(rotated._visualEvents[5]).toMatchObject({ sourceIdx: 1, targetIdx: 2 });
    expect(rotated._visualEvents[6]).toMatchObject({ sourceIdx: 1, hunterIdx: 1, targetIdx: 3 });
    expect(names(rotated._visualEvents[6].beforePlayers)).toEqual(['hrB2', 'hrB3', 'hrB0', 'hrB1']);
    expect(names(rotated._visualEvents[6].afterDiscardPlayers)).toEqual(['hrD2', 'hrD3', 'hrD0', 'hrD1']);
    expect(names(rotated._visualEvents[6].afterDamagePlayers)).toEqual(['hrM2', 'hrM3', 'hrM0', 'hrM1']);
    expect(names(rotated._visualEvents[6].afterPlayers)).toEqual(['hrA2', 'hrA3', 'hrA0', 'hrA1']);
    expect(rotated._visualEvents[7]).toMatchObject({ actorIdx: 0, guessCorrect: true });
    expect(rotated._visualEvents[8].statEvents[0].target).toBe(3);
    expect(rotated._visualEvents[8].statEvents[1].pair).toEqual([2, 1]);
    expect(names(rotated._visualEvents[8].statEvents[1].players)).toEqual(['v2', 'v3', 'v0', 'v1']);
    expect(names(rotated._visualEvents[9].beforePlayers)).toEqual(['eq2', 'eq3', 'eq0', 'eq1']);
    expect(rotated._visualEvents[9].discardEvents[0].playerIndex).toBe(1);
    expect(names(rotated._visualEvents[9].discardEvents[0].afterPlayers)).toEqual(['eqA2', 'eqA3', 'eqA0', 'eqA1']);
    expect(rotated._visualEvents[10]).toMatchObject({ type: 'cardEffect', effectKey: 'earthquake', actorIdx: 2 });
    expect(names(rotated._visualEvents[10].beforePlayers)).toEqual(['ce2', 'ce3', 'ce0', 'ce1']);
    expect(names(rotated._visualEvents[10].afterPlayers)).toEqual(['ceF2', 'ceF3', 'ceF0', 'ceF1']);
    expect(rotated._visualEvents[10].discardEvents[0].playerIndex).toBe(3);
    expect(names(rotated._visualEvents[10].discardEvents[0].afterPlayers)).toEqual(['ceA2', 'ceA3', 'ceA0', 'ceA1']);
    expect(rotated._visualEvents[10].statEvents[0].target).toBe(1);
    expect(rotated._visualEvents[10].payload).toMatchObject({ sourceIdx: 1, targetIdx: 3 });
    expect(names(rotated._visualEvents[10].payload.players)).toEqual(['ceP2', 'ceP3', 'ceP0', 'ceP1']);
    expect(rotated._visualEvents[11].actorIdx).toBe(1);
    expect(names(rotated._visualEvents[11].beforePlayers)).toEqual(['ecB2', 'ecB3', 'ecB0', 'ecB1']);
    expect(rotated._visualEvents[11].queue[0].targetPid).toBe(1);
    expect(rotated._visualEvents[11].queue[1].hitIndices).toEqual([3]);
    expect(rotated._visualEvents[11].queue[1].statEvents[0].target).toBe(3);
    expect(rotated._visualEvents[11].queue[1].targetStats.map(stat => stat.san)).toEqual([10, 10, 10, 8]);
    expect(names(rotated._visualEvents[11].queue[2].players)).toEqual(['ec2', 'ec3', 'ec0', 'ec1']);
  });

  it('derotates rotated animation snapshots back to host order', () => {
    const gs = {
      players: [player('你'), player('艾伦'), player('贝拉')],
      currentTurn: 1,
      drawReveal: { drawerIdx: 2 },
      abilityData: { huntTi: 0, pickOrder: [2, 1] },
      zhuLight: { ownerIdx: 1 },
      _playersBeforeThisDraw: [player('draw0'), player('draw1'), player('draw2')],
      _earthquakeDiscardEvents: [
        { playerIndex: 2, afterPlayers: [player('q0'), player('q1'), player('q2')] },
      ],
      _statEvents: [{ type: 'SAN_LOSS', target: 2, seq: 1 }],
      _inspectionTarget: 2,
      _inspectionBeforePlayers: [player('ib0'), player('ib1'), player('ib2')],
      _inspectionEvents: [
        {
          target: 2,
          beforePlayers: [player('insB0'), player('insB1'), player('insB2')],
          afterPlayers: [player('insA0'), player('insA1'), player('insA2')],
          statEvents: [{ type: 'HP_LOSS', target: 2, seq: 2 }],
        },
      ],
      _aiHuntEvents: [
        { hunterIdx: 1, targetIdx: 0, apophisTargetEvent: { seq: 1, actorIdx: 1, selectedIdx: 0, targetIdx: 0 }, beforePlayers: [player('b0'), player('b1'), player('b2')] },
      ],
      _randomTargetEvents: [
        { seq: 1, sourceIdx: 1, targetIdx: 0, label: '投掷石块' },
      ],
      _animMultiplyEvent: { fromIdx: 0, toIdx: 2 },
      _animSphinxReveal: { actorIdx: 1 },
      _visualEvents: [
        {
          type: 'earthquake',
          beforePlayers: [player('eq0'), player('eq1'), player('eq2')],
          discardEvents: [
            { playerIndex: 2, afterPlayers: [player('eqA0'), player('eqA1'), player('eqA2')] },
          ],
        },
      ],
    };

    const restored = derotateGs(rotateGsForViewer(gs, 1), 1);

    expect(restored.currentTurn).toBe(gs.currentTurn);
    expect(names(restored.players)).toEqual(names(gs.players));
    expect(restored.drawReveal.drawerIdx).toBe(gs.drawReveal.drawerIdx);
    expect(restored.abilityData).toEqual(gs.abilityData);
    expect(restored.zhuLight.ownerIdx).toBe(gs.zhuLight.ownerIdx);
    expect(names(restored._playersBeforeThisDraw)).toEqual(names(gs._playersBeforeThisDraw));
    expect(restored._earthquakeDiscardEvents[0].playerIndex).toBe(2);
    expect(names(restored._earthquakeDiscardEvents[0].afterPlayers)).toEqual(['q0', 'q1', 'q2']);
    expect(restored._statEvents[0].target).toBe(2);
    expect(restored._inspectionTarget).toBe(2);
    expect(names(restored._inspectionBeforePlayers)).toEqual(['ib0', 'ib1', 'ib2']);
    expect(restored._inspectionEvents[0].target).toBe(2);
    expect(names(restored._inspectionEvents[0].beforePlayers)).toEqual(['insB0', 'insB1', 'insB2']);
    expect(names(restored._inspectionEvents[0].afterPlayers)).toEqual(['insA0', 'insA1', 'insA2']);
    expect(restored._inspectionEvents[0].statEvents[0].target).toBe(2);
    expect(restored._aiHuntEvents[0].hunterIdx).toBe(1);
    expect(restored._aiHuntEvents[0].targetIdx).toBe(0);
    expect(restored._aiHuntEvents[0].apophisTargetEvent).toMatchObject({ actorIdx: 1, selectedIdx: 0, targetIdx: 0 });
    expect(names(restored._aiHuntEvents[0].beforePlayers)).toEqual(['b0', 'b1', 'b2']);
    expect(restored._randomTargetEvents[0]).toMatchObject({ sourceIdx: 1, targetIdx: 0, label: '投掷石块' });
    expect(restored._animMultiplyEvent).toEqual(gs._animMultiplyEvent);
    expect(restored._animSphinxReveal).toEqual(gs._animSphinxReveal);
    expect(names(restored._visualEvents[0].beforePlayers)).toEqual(['eq0', 'eq1', 'eq2']);
    expect(restored._visualEvents[0].discardEvents[0].playerIndex).toBe(2);
    expect(names(restored._visualEvents[0].discardEvents[0].afterPlayers)).toEqual(['eqA0', 'eqA1', 'eqA2']);
  });

  it('SHU_SELECT_TARGET 的行动权跟随黑暗子嗣选择者旋转', () => {
    const gs = {
      players: [player('房主'), player('被蛊惑者'), player('旁观者')],
      currentTurn: 0,
      phase: 'SHU_SELECT_TARGET',
      abilityData: { shuChooserIdx: 1, shuOffspringCount: 1 },
    };

    const targetView = rotateGsForViewer(gs, 1);
    const hostView = rotateGsForViewer(gs, 0);

    expect(targetView.abilityData.shuChooserIdx).toBe(0);
    expect(canLocalActOnTargetSelectionPhase(targetView)).toBe(true);
    expect(canLocalActOnTargetSelectionPhase(hostView)).toBe(false);
  });
});
