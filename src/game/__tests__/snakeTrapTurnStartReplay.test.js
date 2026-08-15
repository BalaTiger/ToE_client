import { describe, expect, it } from 'vitest';
import { buildTurnStartDrawReplayQueue } from '../turnAnimState';
import { startNextTurn } from '../turnEngine';
import { makeGs, makePlayer } from './factory';

const snakeTrapCard = () => ({
  id: 'snake-trap-1',
  name: '群蛇陷阱',
  type: 'snakePoisonTrap',
  val: 1,
  key: 'D2',
  letter: 'D',
  number: 2,
  isZone: true,
  polarity: 'negative',
  effectScope: 'all',
});

const buildAiSnakeTrapTurn = () => {
  const oldGs = makeGs({
    players: [
      makePlayer({ name: '你' }),
      makePlayer({ name: '贝拉' }),
    ],
    currentTurn: 0,
    deck: [snakeTrapCard()],
    log: [],
    debugForceCardKeepPending: 'keep',
    debugForceCardKeepTarget: 1,
  });
  const newGs = startNextTurn(oldGs);
  // App executeAiTurn 的调用形态：oldGs 从已结算的 newGs 派生，仍携带本轮
  // startNextTurn 产出的 staged _visualEvents。
  const appStyleOldGs = {
    ...newGs,
    players: newGs._playersBeforeThisDraw,
    log: (newGs.log || []).filter(line => typeof line === 'string' && line.startsWith('──')),
  };
  return { newGs, appStyleOldGs };
};

describe('AI 收入群蛇陷阱的回合开始回放', () => {
  it('以 consumed 注册表为判据时，SNAKE_TRAP 在翻牌后播放', () => {
    const { newGs, appStyleOldGs } = buildAiSnakeTrapTurn();
    const snakeEvent = newGs._visualEvents.find(event => event?.effectKey === 'snakeTrap');
    expect(snakeEvent).toBeTruthy();

    const replay = buildTurnStartDrawReplayQueue({
      oldGs: appStyleOldGs,
      newGs,
      consumedVisualEventIds: new Set(),
    });
    const snakeIdx = replay.queue.findIndex(step => step.type === 'SNAKE_TRAP');
    const drawIdx = replay.queue.findIndex(step => step.type === 'DRAW_CARD');

    expect(snakeIdx).toBeGreaterThan(-1);
    expect(snakeIdx).toBeGreaterThan(drawIdx);
  });

  it('事件已在 consumed 注册表中（已播放）时不重播', () => {
    const { newGs, appStyleOldGs } = buildAiSnakeTrapTurn();
    const snakeEvent = newGs._visualEvents.find(event => event?.effectKey === 'snakeTrap');

    const replay = buildTurnStartDrawReplayQueue({
      oldGs: appStyleOldGs,
      newGs,
      consumedVisualEventIds: new Set([snakeEvent.id]),
    });

    expect(replay.queue.some(step => step.type === 'SNAKE_TRAP')).toBe(false);
  });
});
