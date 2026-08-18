import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildTargetContinuationAbilityData,
  buildTargetContinuationState,
  getTargetContinuationRoute,
  resolveTargetContinuation,
  TARGET_CONTINUATION_ROUTE,
} from '../targetContinuation';
import { TURN_FLOW_STAGE } from '../turnFlowStages';

function createState(overrides = {}) {
  return {
    players: [
      { name: 'local', isDead: false },
      { name: 'ai', isDead: false },
    ],
    deck: ['deck'],
    discard: ['discard'],
    log: ['log'],
    currentTurn: 0,
    phase: 'TARGET',
    abilityData: {},
    _drawnCard: { id: 'drawn' },
    _turnStartLogs: ['pending animation'],
    ...overrides,
  };
}

describe('buildTargetContinuationAbilityData', () => {
  it('keeps only continuation metadata, including a zero remaining draw count', () => {
    const pendingInspectionContinuation = { kind: 'resume' };
    expect(buildTargetContinuationAbilityData({
      _turnOwner: 2,
      fromRest: true,
      fromEndTurnReplay: true,
      fromTsathogguaSlime: true,
      continueTurnStartDraw: true,
      pendingTsathogguaSlime: { targetIdx: 1 },
      pendingTsathogguaSlimes: [{ targetIdx: 2 }],
      cthDrawsRemaining: 0,
      pendingSanInspection: { targetIdx: 3 },
      pendingInspectionContinuation,
      pendingGodChoice: { godCard: { id: 'god' } },
      targetIdx: 4,
      selectedCard: { id: 'temporary' },
    })).toEqual({
      _turnOwner: 2,
      fromRest: true,
      fromEndTurnReplay: true,
      fromTsathogguaSlime: true,
      continueTurnStartDraw: true,
      pendingTsathogguaSlime: { targetIdx: 1 },
      pendingTsathogguaSlimes: [{ targetIdx: 2 }],
      cthDrawsRemaining: 0,
      pendingSanInspection: { targetIdx: 3 },
      pendingInspectionContinuation,
      pendingGodChoice: { godCard: { id: 'god' } },
    });
  });
});

describe('buildTargetContinuationState', () => {
  it('resumes an alive single-player AI seat and clears turn animation fields', () => {
    const state = createState({ currentTurn: 1 });
    const next = buildTargetContinuationState({ baseState: state });

    expect(next.phase).toBe('AI_TURN');
    expect(next._drawnCard).toBeNull();
    expect(next._turnStartLogs).toEqual([]);
  });

  it('returns to action for rest continuation or a dead AI seat', () => {
    const restState = createState({
      currentTurn: 1,
      abilityData: { fromRest: true },
    });
    expect(buildTargetContinuationState({ baseState: restState }).phase).toBe('ACTION');

    const deadPlayers = restState.players.map((player, index) => (
      index === 1 ? { ...player, isDead: true } : player
    ));
    const deadState = createState({ currentTurn: 1, players: deadPlayers });
    expect(buildTargetContinuationState({ baseState: deadState }).phase).toBe('ACTION');
  });

  it('prioritizes a pending god choice and carries its decision fields', () => {
    const godCard = { id: 'god' };
    const pendingGodChoice = {
      godCard,
      playerIdx: 1,
      fromEndTurnReplay: true,
    };
    const state = createState({
      currentTurn: 1,
      abilityData: { pendingGodChoice },
    });
    const next = buildTargetContinuationState({ baseState: state });

    expect(next.phase).toBe('GOD_CHOICE');
    expect(next.abilityData).toEqual(pendingGodChoice);
  });

  it('honors an explicit phase and can retain animation fields', () => {
    const state = createState({ currentTurn: 1 });
    const next = buildTargetContinuationState({
      baseState: state,
      phase: 'CUSTOM_PHASE',
      clearTurnAnim: false,
      extraPatch: { marker: true },
    });

    expect(next.phase).toBe('CUSTOM_PHASE');
    expect(next._drawnCard).toEqual({ id: 'drawn' });
    expect(next.marker).toBe(true);
  });

  // 回归：AI 蛊惑把引燃火把赠给本地玩家，本地玩家完成弃牌决策后，回合拥有者
  // 仍是 AI。续接必须回到 AI_TURN 让 AI 续跑剩余回合；落到 ACTION 会让 AI 回合
  // 无人驱动，被看门狗当作"回合状态异常"强制结束。
  it('resumes AI_TURN after a local ignite-torch decision during an AI turn', () => {
    const state = createState({
      currentTurn: 1,
      phase: 'IGNITE_TORCH_DISCARD',
      abilityData: { type: 'igniteTorchDiscard', playerIndex: 0 },
    });
    const next = buildTargetContinuationState({
      baseState: state,
      abilityData: state.abilityData,
      canResumeAi: true,
    });

    expect(next.phase).toBe('AI_TURN');
    expect(next.currentTurn).toBe(1);
  });

  it('still lands on ACTION for an ignite-torch decision in the local turn', () => {
    const state = createState({
      currentTurn: 0,
      phase: 'IGNITE_TORCH_DISCARD',
      abilityData: { type: 'igniteTorchDiscard', playerIndex: 0 },
    });
    const next = buildTargetContinuationState({
      baseState: state,
      abilityData: state.abilityData,
      canResumeAi: true,
    });

    expect(next.phase).toBe('ACTION');
    expect(next.currentTurn).toBe(0);
  });
});

describe('getTargetContinuationRoute', () => {
  it('keeps the continuation priority stable', () => {
    const state = createState({
      phase: 'ACTION',
      abilityData: {
        continueTurnStartDraw: true,
        fromEndTurnReplay: true,
      },
      proliferatingZQueue: [{ id: 'pending' }],
    });

    expect(getTargetContinuationRoute(state, { continueRest: true }))
      .toBe(TARGET_CONTINUATION_ROUTE.REST_DRAW);
    expect(getTargetContinuationRoute(state))
      .toBe(TARGET_CONTINUATION_ROUTE.TURN_START_DRAW);
    expect(getTargetContinuationRoute({
      ...state,
      abilityData: { fromEndTurnReplay: true },
    })).toBe(TARGET_CONTINUATION_ROUTE.END_TURN_REPLAY);
    expect(getTargetContinuationRoute({
      ...state,
      abilityData: {},
    })).toBe(TARGET_CONTINUATION_ROUTE.PROLIFERATING_Z);
  });

  it('holds a nested interaction instead of resuming replay queues', () => {
    expect(getTargetContinuationRoute(createState({
      phase: 'GOD_CHOICE',
      abilityData: { fromEndTurnReplay: true },
      proliferatingZQueue: [{ id: 'pending' }],
    }))).toBe(TARGET_CONTINUATION_ROUTE.DECISION);
  });

  it.each([
    'TSG_SLIME_BALANCE',
    'ETHEREALIZE_DECISION',
    'ETHEREALIZE_SELECT_TARGET',
  ])('keeps %s open as a decision route even when a draw continuation is pending', phase => {
    expect(getTargetContinuationRoute(createState({ phase }), {
      continueRest: true,
      continueTurnStartDraw: true,
    }))
      .toBe(TARGET_CONTINUATION_ROUTE.DECISION);
  });

  it('holds an unrelated nested decision instead of resuming a rest draw', () => {
    expect(getTargetContinuationRoute(createState({
      phase: 'SPHINX_GUESS',
      abilityData: { fromRest: true, cthDrawsRemaining: 0 },
    }), { continueRest: true })).toBe(TARGET_CONTINUATION_ROUTE.DECISION);
  });

  it('moves a completed draw event to the action stage without changing its interaction phase', () => {
    const state = createState({ phase: 'ACTION', _turnFlowStage: TURN_FLOW_STAGE.DRAW });
    const resolved = resolveTargetContinuation(state);

    expect(resolved.route).toBe(TARGET_CONTINUATION_ROUTE.APPLY_STATE);
    expect(resolved.state.phase).toBe('ACTION');
    expect(resolved.state._turnFlowStage).toBe(TURN_FLOW_STAGE.ACTION);
  });

  it('advances the end-turn scheduler when legacy continuation metadata was lost', () => {
    const state = createState({
      phase: 'ACTION',
      abilityData: {},
      _turnFlowStage: TURN_FLOW_STAGE.END_TURN,
    });
    const resolved = resolveTargetContinuation(state);

    expect(resolved.route).toBe(TARGET_CONTINUATION_ROUTE.ADVANCE_END_TURN);
    expect(resolved.state).toBe(state);
  });
});

describe('end-turn nested decision resolvers', () => {
  const appPath = fileURLToPath(new URL('../../App.jsx', import.meta.url));
  const source = fs.readFileSync(appPath, 'utf8');

  it.each([
    ['tortoiseOracleSelect', 'sameAbyssSelect'],
    ['sameAbyssSelect', 'sphinxGuess'],
    ['sphinxGuess', 'bewitchSelectTarget'],
    ['albinoCreatureSelectCard', 'decipherStoneCarvingConfirm'],
    ['decipherStoneCarvingConfirm', 'handleSwapBlindDrawSelect'],
  ])('%s keeps the end-turn draw continuation instead of settling in ACTION', (handlerName, nextHandlerName) => {
    const start = source.indexOf(`function ${handlerName}(`);
    const end = source.indexOf(`function ${nextHandlerName}(`, start);
    const handler = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(handler).toContain('finishTargetContinuation({');
    expect(handler).toContain('fromRest');
  });
});
