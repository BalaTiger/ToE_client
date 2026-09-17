import React from 'react';
import { AnimOverlay } from './AnimOverlay';
import { CardRevealDecisionLayer } from './CardRevealDecisionLayer';

export function GlobalAnimLayer({
  anim,
  animExiting,
  expansionKey = '地神的潜影',
  disabled = false,
  playEndlessCorridorTunnelSound,
  decisionProps,
  pendingState,
}) {
  return (
    <>
      <CardRevealDecisionLayer anim={disabled ? null : anim} exiting={animExiting}
        expansionKey={expansionKey} decisionProps={decisionProps} pendingState={pendingState} />
      {!disabled && anim?.type !== 'DRAW_CARD' && <AnimOverlay
        anim={anim}
        exiting={animExiting}
        expansionKey={expansionKey}
        playEndlessCorridorTunnelSound={playEndlessCorridorTunnelSound}
      />}
    </>
  );
}
