import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BattlePhaseBar } from './BattlePhaseBar';

const defaults = {
  myTurn: true, phase: 'ACTION', isMobile: false,
  baseFontSizes: { body: 12, small: 11 }, displayPhaseLabel: '请选择行动',
  cardHintText: '', isMultiplayer: true, isSpectating: false,
  mpCthSec: null, mpTurnSec: null, mpDiscardSec: null, mpHuntSec: null, mpDecisionSec: null,
  colors: { warning: 'red', active: 'white', caution: 'orange', safe: 'green', muted: 'gray' },
};
const render = props => renderToStaticMarkup(<BattlePhaseBar {...defaults} {...props} />);

describe('phase prompt and multiplayer clocks', () => {
  it.each([false, true])('keeps solo and spectator prompts free of clocks (spectator=%s)', spectator => {
    const html = render({ isMultiplayer: spectator, isSpectating: spectator, mpTurnSec: 10 });
    expect(html).toContain('请选择行动');
    expect(html).not.toContain('class="toe-phase-timers"');
  });

  it.each([
    [{ mpTurnSec: 0 }, '回合剩余 0 秒'],
    [{ mpCthSec: 8, isMpCthDecisionPhase: true }, '抉择剩余 8 秒'],
    [{ phase: 'DISCARD_PHASE', mpDiscardSec: 4 }, '弃牌剩余 4 秒'],
    [{ phase: 'HUNT_WAIT_REVEAL', mpHuntSec: 12 }, '亮牌剩余 12 秒'],
    [{ mpDecisionSec: 6, isLocalMpDecisionActive: true }, '选择剩余 6 秒'],
  ])('retains the active phase clock, including zero: %s', (props, label) => {
    const html = render(props);
    expect(html).toContain(`aria-label="${label}"`);
    expect(html.match(/class="toe-phase-timer"/g)).toHaveLength(1);
  });

  it('keeps clocks outside the full-width prompt frame and preserves a long instruction', () => {
    const instruction = '请选择仍存活的目标角色，再从手牌中选择一张符合条件的区域牌交给对方。';
    const html = render({ displayPhaseLabel: instruction, mpTurnSec: 20 });
    const frame = html.slice(html.indexOf('class="toe-battle-panel toe-phase-bar"'));
    expect(frame).toContain(instruction);
    expect(frame).not.toContain('class="toe-phase-timer"');
  });

  it('does not show missing clocks or a discard clock during resolution', () => {
    expect(render({ mpTurnSec: undefined })).not.toContain('class="toe-phase-timers"');
    expect(render({ phase: 'DISCARD_PHASE', mpDiscardSec: 4, isDiscardPhaseResolving: true }))
      .not.toContain('class="toe-phase-timers"');
  });
});
