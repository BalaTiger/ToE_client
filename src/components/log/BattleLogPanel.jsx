import React from 'react';
import { getReliefDisplayConfig } from '../../constants/theme';
import { buildPublicUrl } from '../../utils/url';
import { getFontZoomCompensate } from '../../utils/scale';

function getLogPatternBackground(expansionKey = '地神的潜影') {
  const suffix = expansionKey === '群星呼唤' ? 'stars' : 'earth';
  return buildPublicUrl(`/img/ui/theme_relief/log_relief_${suffix}.png`);
}

function getLogReliefLayers(expansionKey = '地神的潜影') {
  const { log } = getReliefDisplayConfig(expansionKey);
  return [
    { color: '#030201', dx: 1, dy: 1, opacity: log.shadowOpacity },
    { color: 'var(--toe-glow,#c8a96e)', dx: -0.8, dy: -0.8, opacity: log.glowOpacity },
    { color: 'var(--toe-line,#3a2510)', dx: 0, dy: 0, opacity: log.lineOpacity },
  ];
}

function normalizeMultiplayerLogLine(line, { isMultiplayer, logOwner, myName, players }) {
  if (!isMultiplayer || !logOwner || logOwner === myName) return line;

  const owner = players.find(p => p.name === logOwner);
  const roleTag = owner ? `${owner.name}（身份：${owner.role}）` : logOwner;
  return line
    .replace(/^你（([^）]+)）/, (_, role) => `${logOwner}（${role}）`)
    .replace(/^你的邪神之力/, `${logOwner}的邪神之力`)
    .replace(/^你遭遇/, `${logOwner}遭遇`)
    .replace(/^你信仰/, `${logOwner}信仰`)
    .replace(/^你放弃/, `${logOwner}放弃`)
    .replace(/^你摸到/, `${logOwner}摸到`)
    .replace(/^你选择/, `${logOwner}选择`)
    .replace(/^你借用/, `${logOwner}借用`)
    .replace(/^你（克苏鲁/, `${logOwner}（克苏鲁`)
    .replace(/^你$/, roleTag)
    .replace(/^你/, logOwner);
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
  const logLines = Array.isArray(visibleLog) ? visibleLog.slice(-50) : [];
  let logOwner = null;
  const myName = players?.[0]?.name;
  const fontZoom = getFontZoomCompensate(scaleRatio);
  const mobileLogHeight = Math.round(132 * fontZoom);

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
          right: -18,
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
              WebkitMaskSize: isMobile ? '188px auto' : '232px auto',
              maskSize: isMobile ? '188px auto' : '232px auto',
              WebkitMaskRepeat: 'repeat-y',
              maskRepeat: 'repeat-y',
              WebkitMaskPosition: 'right -2px top 6px',
              maskPosition: 'right -2px top 6px',
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
      {logLines.map((line, i) => {
        const turnMatch = line.match(/^── (.+?) 的回合开始 ──$/);
        if (turnMatch) logOwner = turnMatch[1];
        const display = normalizeMultiplayerLogLine(line, {
          isMultiplayer,
          logOwner,
          myName,
          players: players || [],
        });
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
