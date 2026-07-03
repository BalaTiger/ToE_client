import React from 'react';
import { AnimOverlay } from './AnimOverlay';

export function GlobalAnimLayer({
  anim,
  animExiting,
  expansionKey = '地神的潜影',
  disabled = false,
  playEndlessCorridorTunnelSound,
}) {
  if (disabled) return null;
  return (
    <AnimOverlay
      anim={anim}
      exiting={animExiting}
      expansionKey={expansionKey}
      playEndlessCorridorTunnelSound={playEndlessCorridorTunnelSound}
    />
  );
}
