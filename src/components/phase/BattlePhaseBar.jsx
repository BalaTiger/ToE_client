import React from 'react';
import { getFontZoomCompensate } from '../../utils/scale';

function TimerText({ label, seconds, color }) {
  return (
    <div style={{
      fontFamily: "'Cinzel',serif",
      fontSize: 11,
      color,
      letterSpacing: 1,
      flexShrink: 0,
    }}>
      ⏱ {label ? `${label} ` : ''}{seconds}s
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

  return (
    <div style={{
      background: 'var(--toe-panel,#120900)',
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
        fontFamily: "'Cinzel',serif",
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
      {isMultiplayer && !isSpectating && mpCthSec !== null && isMpCthDecisionPhase && (
        <TimerText label="抉择" seconds={mpCthSec} color={mpCthSec <= 5 ? warning : mpCthSec <= 10 ? caution : active} />
      )}
      {isMultiplayer && !isSpectating && mpTurnSec !== null && myTurn && phase !== 'AI_TURN' && phase !== 'HUNT_WAIT_REVEAL' && !isMpCthDecisionPhase && !isLocalMpDecisionActive && (
        <TimerText seconds={mpTurnSec} color={mpTurnSec <= 10 ? warning : mpTurnSec <= 20 ? caution : safe} />
      )}
      {isMultiplayer && !isSpectating && mpDiscardSec !== null && phase === 'DISCARD_PHASE' && !isDiscardPhaseResolving && !isBlocked && (
        <TimerText label="弃牌" seconds={mpDiscardSec} color={mpDiscardSec <= 5 ? warning : caution} />
      )}
      {isMultiplayer && !isSpectating && mpHuntSec !== null && phase === 'HUNT_WAIT_REVEAL' && (
        <TimerText label="亮牌" seconds={mpHuntSec} color={mpHuntSec <= 5 ? warning : mpHuntSec <= 10 ? caution : active} />
      )}
      {isMultiplayer && !isSpectating && mpDecisionSec !== null && isLocalMpDecisionActive && (
        <TimerText label="选择" seconds={mpDecisionSec} color={mpDecisionSec <= 5 ? warning : mpDecisionSec <= 10 ? caution : active} />
      )}
    </div>
  );
}
