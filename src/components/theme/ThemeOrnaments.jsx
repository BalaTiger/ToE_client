import React from 'react';
import { getBoardTheme, getReliefDisplayConfig } from '../../constants/theme';
import { ThemeMaskOrnament } from '../ui/ThemeMaskOrnament';

export function getThemeReliefMask(expansionKey = '地神的潜影', kind = 'panel_corner') {
  const suffix = expansionKey === '群星呼唤' ? 'stars' : 'earth';
  return `/img/ui/theme_relief/${kind}_${suffix}.png`;
}

function getCornerPosition(corner, inset) {
  return {
    tl: { top: inset, left: inset, transform: 'scaleX(-1)' },
    tr: { top: inset, right: inset },
    bl: { bottom: inset, left: inset, transform: 'scale(-1,-1)' },
    br: { bottom: inset, right: inset, transform: 'scaleY(-1)' },
  }[corner] || { top: inset, right: inset };
}

export function ThemeCornerOrnament({
  expansionKey = '地神的潜影',
  corner = 'tl',
  size = 52,
  opacity = 0.3,
  inset = 4,
  style = {},
  useCssVars = false,
}) {
  const theme = getBoardTheme(expansionKey);
  const reliefCfg = getReliefDisplayConfig(expansionKey).corner;
  return (
    <ThemeMaskOrnament
      mask={getThemeReliefMask(expansionKey, 'panel_corner')}
      width={size}
      height={size}
      opacity={opacity}
      position={getCornerPosition(corner, inset)}
      style={style}
      colors={{
        shadow: '#030201',
        glow: useCssVars ? 'var(--toe-glow,#c8a96e)' : theme.glow,
        line: useCssVars ? 'var(--toe-line,#3a2510)' : theme.line,
      }}
      layerOpacity={{
        shadow: reliefCfg.shadowOpacity,
        glow: reliefCfg.glowOpacity,
        line: reliefCfg.lineOpacity,
      }}
    />
  );
}

export function ThemeEdgeRelief({
  expansionKey = '地神的潜影',
  side = 'right',
  opacity = 0.28,
  style = {},
}) {
  const reliefCfg = getReliefDisplayConfig(expansionKey).hand;
  const pos = side === 'right'
    ? { top: 0, bottom: 0, right: 0 }
    : { top: 0, bottom: 0, left: 0, transform: 'scaleX(-1)' };
  const maskStyle = {
    WebkitMaskSize: '100% auto',
    maskSize: '100% auto',
    WebkitMaskPosition: 'right bottom',
    maskPosition: 'right bottom',
  };
  return (
    <ThemeMaskOrnament
      mask={getThemeReliefMask(expansionKey, 'hand_edge')}
      width={320}
      opacity={opacity}
      position={pos}
      style={style}
      maskStyle={maskStyle}
      colors={{
        shadow: '#030201',
        glow: 'var(--toe-glow,#c8a96e)',
        line: 'var(--toe-line,#3a2510)',
      }}
      layerOpacity={{
        shadow: reliefCfg.shadowOpacity,
        glow: reliefCfg.glowOpacity,
        line: reliefCfg.lineOpacity,
      }}
    />
  );
}
