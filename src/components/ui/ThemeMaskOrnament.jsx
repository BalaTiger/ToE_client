import React from 'react';

export function ThemeMaskOrnament({
  mask,
  width,
  height,
  opacity = 0.3,
  position = {},
  style = {},
  maskStyle = {},
  colors,
  layerOpacity,
}) {
  const sharedMaskStyle = {
    position: 'absolute',
    inset: 0,
    WebkitMaskImage: `url("${mask}")`,
    maskImage: `url("${mask}")`,
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskSize: '100% 100%',
    maskSize: '100% 100%',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
    ...maskStyle,
  };
  return (
    <div style={{
      position: 'absolute',
      width,
      height,
      pointerEvents: 'none',
      opacity,
      ...position,
      ...style,
    }}>
      <div style={{ ...sharedMaskStyle, backgroundColor: colors.shadow, transform: 'translate(1px,1px)', opacity: layerOpacity.shadow }} />
      <div style={{ ...sharedMaskStyle, backgroundColor: colors.glow, transform: 'translate(-0.7px,-0.7px)', opacity: layerOpacity.glow }} />
      <div style={{ ...sharedMaskStyle, backgroundColor: colors.line, opacity: layerOpacity.line }} />
    </div>
  );
}
