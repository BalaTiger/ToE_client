import React from 'react';
import { getFontZoomCompensate } from '../../utils/scale';
import './battle-phase-bar.css';

function TimerText({ label, seconds, color }) {
  return (
    <div className="toe-phase-timer" aria-label={`${label}剩余 ${seconds} 秒`} style={{ color }}>
      <span aria-hidden="true">⏱</span>
      <span>{label}</span>
      <span className="toe-phase-timer-value">{seconds}<span aria-hidden="true">s</span></span>
    </div>
  );
}

export function BattlePhaseBar({
  myTurn,
  phase,
  isMobile,
  baseFontSizes,
  displayPhaseLabel,
  cardHintText,
  isPhaseWarningText,
  isSpectating,
  isMultiplayer,
  isMpCthDecisionPhase,
  isLocalMpDecisionActive,
  isDiscardPhaseResolving,
  isBlocked,
  mpCthSec,
  mpTurnSec,
  mpDiscardSec,
  mpHuntSec,
  mpDecisionSec,
  colors,
  scaleRatio = 1,
}) {
  const {
    warning,
    active,
    caution,
    safe,
    muted,
  } = colors;
  const fontZoom = getFontZoomCompensate(scaleRatio);
  const timers = [
    { label: '抉择', seconds: mpCthSec, active: isMpCthDecisionPhase, color: mpCthSec <= 5 ? warning : mpCthSec <= 10 ? caution : active },
    { label: '回合', seconds: mpTurnSec, active: myTurn && phase !== 'AI_TURN' && phase !== 'HUNT_WAIT_REVEAL' && !isMpCthDecisionPhase && !isLocalMpDecisionActive, color: mpTurnSec <= 10 ? warning : mpTurnSec <= 20 ? caution : safe },
    { label: '弃牌', seconds: mpDiscardSec, active: phase === 'DISCARD_PHASE' && !isDiscardPhaseResolving && !isBlocked, color: mpDiscardSec <= 5 ? warning : caution },
    { label: '亮牌', seconds: mpHuntSec, active: phase === 'HUNT_WAIT_REVEAL', color: mpHuntSec <= 5 ? warning : mpHuntSec <= 10 ? caution : active },
    { label: '选择', seconds: mpDecisionSec, active: isLocalMpDecisionActive, color: mpDecisionSec <= 5 ? warning : mpDecisionSec <= 10 ? caution : active },
  ].filter(timer => isMultiplayer && !isSpectating && timer.active && Number.isFinite(timer.seconds));

  return (
    <div className="toe-phase-status">
      {timers.length > 0 && (
        <div className="toe-phase-timers" aria-label="联机倒计时">
          {timers.map(timer => <TimerText key={timer.label} {...timer} />)}
        </div>
      )}
    <div className="toe-battle-panel toe-phase-bar" data-phase-warning={!!isPhaseWarningText && !isSpectating} style={{
      backgroundColor: 'var(--toe-panel,#120900)',
      border: `1px solid ${myTurn && !['AI_TURN'].includes(phase) ? 'var(--toe-line,#5a3010)' : 'var(--toe-line-dim,#2a1a08)'}`,
      borderRadius: 3,
      padding: isMobile ? `${5 * fontZoom}px ${10 * fontZoom}px` : '7px 14px',
      minHeight: isMobile ? 38 * fontZoom : 38,
      display: 'flex',
      alignItems: 'center',
      gap: isMobile ? 10 * fontZoom : 10,
      flexWrap: 'wrap',
    }}>
      <div style={{
        flex: 1,
        minWidth: 0,
        overflowWrap: 'anywhere',
        fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)",
        color: isPhaseWarningText && !isSpectating ? warning : displayPhaseLabel ? active : muted,
        fontSize: baseFontSizes.body,
        letterSpacing: isMobile ? 0.5 : 1,
      }}>
        <div>{displayPhaseLabel}</div>
        {phase === 'ACTION' && !isSpectating && (
          <div style={{ fontSize: baseFontSizes.small, color: 'var(--toe-muted,#5a4a3a)', marginTop: 2 }}>
            {cardHintText}
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
