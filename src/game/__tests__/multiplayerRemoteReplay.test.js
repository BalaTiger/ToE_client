import { describe, expect, it, vi } from 'vitest';
import { buildMpRemoteReplayAction, MP_REMOTE_REPLAY } from '../multiplayerRemoteReplay';

const card = { id: 'c1', name: '测试牌', type: 'zone' };

function player(name) {
  return { name, hand: [], hp: 10, san: 10 };
}

function makeState(patch = {}) {
  return {
    players: [player('你'), player('艾伦'), player('贝拉')],
    currentTurn: 1,
    phase: 'ACTION',
    log: [],
    abilityData: {},
    drawReveal: null,
    discard: [],
    ...patch,
  };
}

function buildAction(rotated, extra = {}) {
  return buildMpRemoteReplayAction({
    rotated,
    previousGs: makeState({ currentTurn: 0 }),
    roleRevealed: true,
    buildAnimQueue: vi.fn(() => []),
    buildFullHandSwapTransferQueueFromLogs: vi.fn(() => []),
    ...extra,
  });
}

describe('buildMpRemoteReplayAction', () => {
  it('requests role reveal for the first non-game-over state', () => {
    const rotated = makeState({ players: [{ ...player('你'), role: '寻宝者' }, player('艾伦')] });
    const action = buildMpRemoteReplayAction({
      rotated,
      previousGs: null,
      roleRevealed: false,
      buildAnimQueue: vi.fn(),
      buildFullHandSwapTransferQueueFromLogs: vi.fn(),
    });

    expect(action.type).toBe(MP_REMOTE_REPLAY.ROLE_REVEAL);
    expect(action.role).toBe('寻宝者');
    expect(action.maskedGs).toMatchObject({ phase: 'ACTION', drawReveal: null, abilityData: {} });
  });

  it('turns remote dice logs into a dice animation action', () => {
    const action = buildAction(makeState({ log: ['艾伦 掷出 5 点'] }));

    expect(action.type).toBe(MP_REMOTE_REPLAY.DICE_ROLL);
    expect(action.anim).toMatchObject({ type: 'DICE_ROLL', d1: 5, rollerName: '艾伦', dodgeSuccess: true });
    expect(action.pendingGs.log).toEqual(['艾伦 掷出 5 点']);
  });

  it('builds a remote draw animation queue without exposing the decision phase first', () => {
    const buildAnimQueue = vi.fn(() => [{ type: 'HP_DAMAGE', target: 1 }]);
    const action = buildAction(
      makeState({
        phase: 'DRAW_REVEAL',
        drawReveal: { card, drawerIdx: 1, needsDecision: true },
        _drawLogs: ['艾伦 摸到 测试牌'],
        _statLogs: ['艾伦 失去 1 HP'],
        _playersBeforeThisDraw: [player('你-before'), player('艾伦-before'), player('贝拉-before')],
      }),
      { buildAnimQueue },
    );

    expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
    expect(action.maskedGs).toMatchObject({ phase: 'ACTION', drawReveal: null, abilityData: {} });
    expect(action.queue[0]).toMatchObject({ type: 'DRAW_CARD', card, triggerName: '艾伦', targetPid: 1 });
    expect(action.queue.at(-1)).toMatchObject({ type: 'STATE_PATCH' });
    expect(action.visualLock.players[1].name).toBe('艾伦-before');
    expect(buildAnimQueue).toHaveBeenCalledOnce();
  });

  it('builds a local draw animation after role reveal without exposing the decision phase first', () => {
    const action = buildAction(makeState({
      currentTurn: 0,
      phase: 'DRAW_REVEAL',
      drawReveal: { card, drawerIdx: 0, needsDecision: true },
      _turnStartLogs: ['── 你 的回合开始 ──'],
      _drawLogs: ['你 摸到 测试牌'],
      _playersBeforeThisDraw: [player('你-before'), player('艾伦-before'), player('贝拉-before')],
    }));

    expect(action.type).toBe(MP_REMOTE_REPLAY.START_ANIM);
    expect(action.maskedGs).toMatchObject({ phase: 'ACTION', drawReveal: null, abilityData: {} });
    expect(action.anim).toMatchObject({ type: 'YOUR_TURN', msgs: ['── 你 的回合开始 ──'] });
    expect(action.queue[0]).toMatchObject({ type: 'DRAW_CARD', card, triggerName: '你', targetPid: 0 });
    expect(action.pendingGs.phase).toBe('DRAW_REVEAL');
  });

  it('masks discard phase for non-active remote players', () => {
    const action = buildAction(makeState({ phase: 'DISCARD_PHASE', currentTurn: 1, abilityData: { discardSelected: [] } }));

    expect(action.type).toBe(MP_REMOTE_REPLAY.SET_STATE);
    expect(action.gs).toMatchObject({ phase: 'ACTION', abilityData: {} });
  });
});
