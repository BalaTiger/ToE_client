import { describe, expect, it } from 'vitest';
import { ROLE_HUNTER, ROLE_TREASURE } from '../coreUtils';
import { startNextTurn } from '../turnEngine';
import { buildCompleteGameOverLog } from '../turnStartPresentation';
import { makeGs, makePlayer, makeZoneCard } from './factory';

const authoredWin = '艾伦 集齐全部编号并获胜！';
const reason = '艾伦 集齐了全部编号并获胜！';
const terminal = (log, gameOver = { winner: ROLE_TREASURE, winnerIdx: 1, reason }) => ({
  log, gameOver,
});

describe('TOE010 completed victory transcript', () => {
  it('shows one victory notice after a real AI turn draws the missing numbered card', () => {
    const source = makeZoneCard('B1'); // 圣甲虫: the historical winning draw.
    const before = makeGs({
      players: [
        makePlayer({ name: '你', role: ROLE_HUNTER }),
        makePlayer({ name: '艾伦', san: 8, hand: [
          makeZoneCard('A2'), makeZoneCard('C3'), makeZoneCard('D4'),
        ] }),
        makePlayer({ name: '卡洛斯' }),
      ],
      currentTurn: 0,
      deck: [source],
      log: ['游戏开始。'],
    });
    const state = startNextTurn(before);
    expect(state.gameOver).toEqual({ winner: ROLE_TREASURE, winnerIdx: 1, reason });
    expect(state.players[1].hand).toContainEqual(source);
    expect(state.log.at(-1)).toBe(authoredWin);
    const snapshot = structuredClone(state);

    const completed = buildCompleteGameOverLog(state, state.log);
    expect(completed.filter(line => /集齐了?全部编号并获胜！$/.test(line))).toEqual([authoredWin]);
    expect(completed).toEqual(state.log);
    expect(state).toEqual(snapshot); // Presentation must not mutate rules or settlement.
    expect(buildCompleteGameOverLog({ ...state, log: completed }, completed)).toEqual(completed);
  });

  it('does not supplement an already authored equivalent terminal reason', () => {
    const state = terminal(['旧日志', authoredWin]);
    expect(buildCompleteGameOverLog(state)).toEqual(state.log);
  });

  it('recognizes the known notice with or without a separator before the local name', () => {
    const state = terminal(['你 集齐全部编号并获胜！'], {
      winner: ROLE_TREASURE, winnerIdx: 0, reason: '你集齐了全部编号并获胜！',
    });
    expect(buildCompleteGameOverLog(state)).toEqual(state.log);
  });

  it('keeps another player notice and adds the actual winner reason', () => {
    const state = terminal(['卡洛斯 集齐全部编号并获胜！']);
    expect(buildCompleteGameOverLog(state)).toEqual([...state.log, reason]);
  });

  it('keeps distinct player names containing internal whitespace', () => {
    const state = terminal(['END A 集齐全部编号并获胜！'], {
      winner: ROLE_TREASURE, reason: 'ENDA 集齐了全部编号并获胜！',
    });
    expect(buildCompleteGameOverLog(state)).toEqual([...state.log, state.gameOver.reason]);
  });

  it.each([authoredWin, reason])('does not use an earlier same-name notice to suppress this terminal reason: %s', historicalNotice => {
    const state = terminal([
      historicalNotice,
      '── 贝拉 的回合开始 ──',
      '艾伦 宣告获胜！',
    ]);
    const completed = buildCompleteGameOverLog(state);
    expect(completed).toEqual([...state.log, reason]);
    expect(buildCompleteGameOverLog({ ...state, log: completed })).toEqual(completed);
  });

  it('does not alter a nonterminal transcript even if it contains victory-like wording', () => {
    const state = { log: [authoredWin, reason], gameOver: null };
    expect(buildCompleteGameOverLog(state, ['额外可见日志'])).toBe(state.log);
  });

  it('retains authored repeated actions and repeated exact reasons', () => {
    const state = terminal(['暗抽了一张！', '暗抽了一张！', reason, reason]);
    expect(buildCompleteGameOverLog(state)).toEqual(state.log);
  });

  it('still supplements an unknown reason instead of guessing synonyms', () => {
    const state = terminal([authoredWin], { winner: ROLE_TREASURE, reason: '艾伦 宣告获胜！' });
    expect(buildCompleteGameOverLog(state)).toEqual([...state.log, state.gameOver.reason]);
  });

  it('retains a reason carrying an additional victory cause', () => {
    const state = terminal([authoredWin], {
      winner: ROLE_TREASURE, reason: '艾伦 通过掉包集齐全部编号并获胜！',
    });
    expect(buildCompleteGameOverLog(state)).toEqual([...state.log, state.gameOver.reason]);
  });

  it('does not infer treasure victory for a different winner category', () => {
    const state = terminal([authoredWin], { winner: ROLE_HUNTER, reason });
    expect(buildCompleteGameOverLog(state)).toEqual([...state.log, reason]);
  });

  it('adds a missing ordinary result and leaves a missing reason alone', () => {
    expect(buildCompleteGameOverLog(terminal(['旧日志'], {
      winner: 'LOSE', reason: '你已沉入永恒的黑暗…',
    }))).toEqual(['旧日志', '你已沉入永恒的黑暗…']);
    expect(buildCompleteGameOverLog(terminal(['旧日志'], { winner: 'LOSE' }))).toEqual(['旧日志']);
  });
});
