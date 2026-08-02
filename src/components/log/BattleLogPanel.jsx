import React from 'react';
import { getReliefDisplayConfig } from '../../constants/theme';
import { buildPublicUrl } from '../../utils/url';
import { getFontZoomCompensate } from '../../utils/scale';
import { normalizeLogForViewer } from '../../game/logPerspective';

function getLogPatternBackground(expansionKey = '地神的潜影') {
  const suffix = expansionKey === '群星呼唤' ? 'stars' : 'earth';
  return buildPublicUrl(`/img/ui/theme_relief/log_relief_${suffix}.webp`);
}

function getLogReliefLayers(expansionKey = '地神的潜影') {
  const { log } = getReliefDisplayConfig(expansionKey);
  return [
    { color: '#030201', dx: 1, dy: 1, opacity: log.shadowOpacity },
    { color: 'var(--toe-glow,#c8a96e)', dx: -0.8, dy: -0.8, opacity: log.glowOpacity },
    { color: 'var(--toe-line,#3a2510)', dx: 0, dy: 0, opacity: log.lineOpacity },
  ];
}

function getLogReliefMaskStyle(isMobile) {
  if (isMobile) {
    return {
      WebkitMaskSize: '188px auto',
      maskSize: '188px auto',
      WebkitMaskRepeat: 'repeat',
      maskRepeat: 'repeat',
      WebkitMaskPosition: 'center top',
      maskPosition: 'center top',
    };
  }
  return {
    WebkitMaskSize: '232px auto',
    maskSize: '232px auto',
    WebkitMaskRepeat: 'repeat-y',
    maskRepeat: 'repeat-y',
    WebkitMaskPosition: 'right -2px top 6px',
    maskPosition: 'right -2px top 6px',
  };
}

export function BattleLogPanel({
  logRef,
  visibleLog,
  players,
  isMultiplayer,
  expansionKey,
  isMobile,
  middleRowHeight,
  fontSizes,
  scaleRatio = 1,
}) {
  const reliefConfig = getReliefDisplayConfig(expansionKey);
  const allLogLines = Array.isArray(visibleLog) ? visibleLog : [];
  const myName = players?.[0]?.name;
  // Normalize before truncating so the current turn owner is still known when
  // a long turn pushes its heading outside the last 50 visible entries.
  const allNormalizedLines = normalizeLogForViewer(allLogLines, { isMultiplayer, myName });
  const logLines = allLogLines.slice(-50);
  const normalizedLines = allNormalizedLines.slice(-50);
  const displayLogLines = logLines.map((line, index) => ({ line, display: normalizedLines[index] }));
  const fontZoom = getFontZoomCompensate(scaleRatio);
  const mobileLogHeight = Math.round(132 * fontZoom);
  const reliefMaskStyle = getLogReliefMaskStyle(isMobile);

  return (
    <div ref={logRef} data-log-panel style={{
      width: isMobile ? '100%' : 218,
      flexBasis: isMobile ? '100%' : undefined,
      flexShrink: 0,
      backgroundColor: 'var(--toe-panel,#0e0904)',
      border: '1.5px solid var(--toe-line-dim,#2a1a08)',
      borderRadius: 3,
      padding: '8px 10px',
      overflowY: 'auto',
      minHeight: isMobile ? mobileLogHeight : middleRowHeight,
      maxHeight: isMobile ? mobileLogHeight : middleRowHeight,
      position: 'relative',
      overflowX: 'hidden',
      scrollbarGutter: 'stable',
    }}>
      <div style={{
        position: 'sticky',
        top: 0,
        height: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}>
        <div style={{
          position: 'absolute',
          top: -8,
          left: -10,
          right: isMobile ? -10 : -18,
          height: isMobile ? mobileLogHeight : middleRowHeight,
        }}>
          {getLogReliefLayers(expansionKey).map((layer, idx) => (
            <div key={idx} style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: layer.color,
              transform: `translate(${layer.dx}px,${layer.dy}px)`,
              opacity: layer.opacity,
              WebkitMaskImage: `url("${getLogPatternBackground(expansionKey)}")`,
              maskImage: `url("${getLogPatternBackground(expansionKey)}")`,
              ...reliefMaskStyle,
            }} />
          ))}
        </div>
      </div>
      <div style={{
        fontFamily: "'Cinzel',serif",
        color: reliefConfig.logText.title,
        fontSize: fontSizes.small,
        letterSpacing: 2,
        marginBottom: 5,
        textTransform: 'uppercase',
        position: 'relative',
      }}>— 冒险日志 —</div>
      {displayLogLines.map(({ line, display }, i) => {
        return (
          <div key={i} style={{
            fontFamily: "'IM Fell English','Georgia',serif",
            fontStyle: 'italic',
            fontSize: fontSizes.body,
            lineHeight: 1.7,
            color: line.includes('──') ? reliefConfig.logText.turn
              : line.includes('☠') || line.includes('死亡') || line.includes('倒下') ? '#882020'
                : line.includes('获胜') || line.includes('集齐') ? 'var(--toe-strong,#c8a96e)'
                  : reliefConfig.logText.body,
            fontWeight: line.includes('──') ? 700 : 400,
            position: 'relative',
          }}>{display}</div>
        );
      })}
    </div>
  );
}
