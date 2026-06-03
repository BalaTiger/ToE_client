import React from 'react';
import { CardFlipAnim } from './CardFlipAnim';
import { DiceRollAnim, GenericAnimOverlay, YourTurnAnim } from './GenericAnimOverlay';
import { BuryToDeckOverlay, DiscardMoveOverlay, HuntRevealCardOverlay, ZhuHideCardOverlay } from './MoveOverlays';
import { CaveDuelAnim } from './AreaCardOverlays';
import { ApophisEclipseAnim } from './ApophisOverlays';
import { EndlessCorridorTunnelAnim } from './EndlessCorridorOverlay';
import { RandomTargetOverlay } from './RandomTargetOverlay';

const NO_OVERLAY_TYPES = new Set([
  'CARD_TRANSFER',
  'TURN_BOUNDARY_PAUSE',
  'HP_DAMAGE',
  'HP_HEAL',
  'SAN_HEAL',
  'SAN_DAMAGE',
]);

const ANIM_RENDERERS = {
  YOUR_TURN: ({ anim }) => <YourTurnAnim name={anim.name} />,
  DRAW_CARD: ({ anim, exiting, expansionKey }) => (
    <CardFlipAnim
      card={anim.card}
      triggerName={anim.triggerName}
      targetPid={anim.targetPid ?? 0}
      exiting={exiting}
      skipTravel={!!anim.skipTravel}
      guessCorrect={anim.guessCorrect}
      expansionKey={expansionKey}
    />
  ),
  DICE_ROLL: ({ anim, exiting }) => <DiceRollAnim anim={anim} exiting={exiting} />,
  HUNT_REVEAL_CARD: ({ anim, exiting }) => <HuntRevealCardOverlay anim={anim} exiting={exiting} />,
  DISCARD: ({ anim, exiting, expansionKey }) => <DiscardMoveOverlay anim={anim} exiting={exiting} expansionKey={expansionKey} />,
  BURY_TO_DECK: ({ anim, exiting, expansionKey }) => <BuryToDeckOverlay anim={anim} exiting={exiting} expansionKey={expansionKey} />,
  ZHU_HIDE_CARD: ({ anim, exiting }) => <ZhuHideCardOverlay anim={anim} exiting={exiting} />,
  CAVE_DUEL: ({ anim, exiting }) => <CaveDuelAnim anim={anim} exiting={exiting} />,
  RANDOM_TARGET: ({ anim, exiting }) => <RandomTargetOverlay anim={anim} exiting={exiting} />,
  APOPHIS_ECLIPSE: ({ exiting }) => <ApophisEclipseAnim exiting={exiting} />,
  ENDLESS_CORRIDOR_TUNNEL: ({ exiting }) => <EndlessCorridorTunnelAnim exiting={exiting} />,
};

function AnimOverlay({ anim, exiting, expansionKey = 'temporary' }) {
  if (!anim || NO_OVERLAY_TYPES.has(anim.type)) return null;
  const render = ANIM_RENDERERS[anim.type];
  if (render) return render({ anim, exiting, expansionKey });
  return <GenericAnimOverlay anim={anim} exiting={exiting} />;
}


export { AnimOverlay };
