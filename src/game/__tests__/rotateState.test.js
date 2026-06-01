import { describe, expect, it } from 'vitest';
import { derotateGs, rotateGsForViewer } from '../rotateState';

function player(name, hand = []) {
  return { name, hp: 10, san: 10, hand };
}

function names(players) {
  return players.map(p => p.name);
}

describe('rotateGsForViewer', () => {
  it('rotates top-level animation player snapshots for the viewer', () => {
    const gs = {
      players: [player('你'), player('艾伦'), player('贝拉')],
      currentTurn: 2,
      abilityData: { playerIndex: 0, source: 2, targets: [0, 2] },
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
    expect(rotated.abilityData).toEqual({ playerIndex: 2, source: 1, targets: [2, 1] });
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
      _aiHuntEvents: [
        {
          hunterIdx: 3,
          targetIdx: 1,
          sourceCardIndex: 2,
          targetCardIndex: 0,
          beforePlayers: [player('b0'), player('b1'), player('b2'), player('b3')],
          afterDiscardPlayers: [player('d0'), player('d1'), player('d2'), player('d3')],
          afterPlayers: [player('a0'), player('a1'), player('a2'), player('a3')],
        },
      ],
      _animMultiplyEvent: { fromIdx: 1, toIdx: 3, sourceCardIndex: 4 },
      _animSphinxReveal: { actorIdx: 0, card: { name: '斯芬克斯' } },
    };

    const rotated = rotateGsForViewer(gs, 2);

    expect(rotated._earthquakeDiscardEvents[0].playerIndex).toBe(2);
    expect(names(rotated._earthquakeDiscardEvents[0].afterPlayers)).toEqual(['q2', 'q3', 'q0', 'q1']);
    expect(rotated._aiHuntEvents[0].hunterIdx).toBe(1);
    expect(rotated._aiHuntEvents[0].targetIdx).toBe(3);
    expect(rotated._aiHuntEvents[0].sourceCardIndex).toBe(2);
    expect(rotated._aiHuntEvents[0].targetCardIndex).toBe(0);
    expect(names(rotated._aiHuntEvents[0].beforePlayers)).toEqual(['b2', 'b3', 'b0', 'b1']);
    expect(names(rotated._aiHuntEvents[0].afterDiscardPlayers)).toEqual(['d2', 'd3', 'd0', 'd1']);
    expect(names(rotated._aiHuntEvents[0].afterPlayers)).toEqual(['a2', 'a3', 'a0', 'a1']);
    expect(rotated._animMultiplyEvent).toMatchObject({ fromIdx: 3, toIdx: 1, sourceCardIndex: 4 });
    expect(rotated._animSphinxReveal).toMatchObject({ actorIdx: 2 });
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
      _aiHuntEvents: [
        { hunterIdx: 1, targetIdx: 0, beforePlayers: [player('b0'), player('b1'), player('b2')] },
      ],
      _animMultiplyEvent: { fromIdx: 0, toIdx: 2 },
      _animSphinxReveal: { actorIdx: 1 },
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
    expect(restored._aiHuntEvents[0].hunterIdx).toBe(1);
    expect(restored._aiHuntEvents[0].targetIdx).toBe(0);
    expect(names(restored._aiHuntEvents[0].beforePlayers)).toEqual(['b0', 'b1', 'b2']);
    expect(restored._animMultiplyEvent).toEqual(gs._animMultiplyEvent);
    expect(restored._animSphinxReveal).toEqual(gs._animSphinxReveal);
  });
});
