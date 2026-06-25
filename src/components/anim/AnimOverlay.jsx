import React from 'react';
import { CardFlipAnim } from './CardFlipAnim';
import { DiceRollAnim, GenericAnimOverlay, TorchWardOverlay, YourTurnAnim } from './GenericAnimOverlay';
import { BuryToDeckOverlay, DiscardMoveOverlay, HuntRevealCardOverlay, TsathogguaSlimePopOverlay, ZhuHideCardOverlay } from './MoveOverlays';
import { CaveDuelAnim, GeomagneticReversalAnim, GeomagneticRestoreShuffleAnim, VolcanoAnim } from './AreaCardOverlays';
import { ApophisEclipseAnim } from './ApophisOverlays';
import { SnakeTrapOverlay } from './SnakeTrapOverlay';
import { EndlessCorridorTunnelAnim } from './EndlessCorridorOverlay';
import { RandomTargetOverlay } from './RandomTargetOverlay';

const NO_OVERLAY_TYPES = new Set([
  'CARD_TRANSFER',
  'TURN_BOUNDARY_PAUSE',
  'HP_DAMAGE',
  'HP_HEAL',
  'SAN_HEAL',
  'SAN_DAMAGE',
  'BLACK_GOAT_PULSE',
]);

const ANIM_RENDERERS = {
  YOUR_TURN: ({ anim }) => <YourTurnAnim name={anim.name} local={!!anim.local} />,
  DRAW_CARD: ({ anim, exiting, expansionKey }) => (
    <CardFlipAnim
      key={[
        anim.inspectionSeq ?? '',
        anim.card?.id ?? anim.card?.uid ?? anim.card?.key ?? anim.card?.name ?? 'card',
        anim.targetPid ?? 0,
        anim.triggerName ?? '',
      ].join(':')}
      card={anim.card}
      triggerName={anim.triggerName}
      targetPid={anim.targetPid ?? 0}
      exiting={exiting}
      skipTravel={!!anim.skipTravel}
      sourcePile={anim.sourcePile}
      guessCorrect={anim.guessCorrect}
      expansionKey={expansionKey}
      onSettled={anim.onSettled}
    />
  ),
  DICE_ROLL: ({ anim, exiting }) => <DiceRollAnim anim={anim} exiting={exiting} />,
  HUNT_REVEAL_CARD: ({ anim, exiting }) => <HuntRevealCardOverlay anim={anim} exiting={exiting} />,
  DISCARD: ({ anim, exiting, expansionKey }) => <DiscardMoveOverlay anim={anim} exiting={exiting} expansionKey={expansionKey} />,
  BURY_TO_DECK: ({ anim, exiting, expansionKey }) => <BuryToDeckOverlay anim={anim} exiting={exiting} expansionKey={expansionKey} />,
  ZHU_HIDE_CARD: ({ anim, exiting }) => <ZhuHideCardOverlay anim={anim} exiting={exiting} />,
  CAVE_DUEL: ({ anim, exiting }) => <CaveDuelAnim anim={anim} exiting={exiting} />,
  GEOMAGNETIC_REVERSAL: ({ anim, exiting }) => <GeomagneticReversalAnim anim={anim} exiting={exiting} />,
  GEOMAGNETIC_RESTORE_SHUFFLE: ({ anim, exiting }) => <GeomagneticRestoreShuffleAnim anim={anim} exiting={exiting} />,
  VOLCANO: ({ anim, exiting }) => <VolcanoAnim anim={anim} exiting={exiting} />,
  SNAKE_TRAP: ({ anim, exiting }) => <SnakeTrapOverlay anim={anim} exiting={exiting} />,
  RANDOM_TARGET: ({ anim, exiting }) => <RandomTargetOverlay anim={anim} exiting={exiting} />,
  APOPHIS_ECLIPSE: ({ exiting }) => <ApophisEclipseAnim exiting={exiting} />,
  ENDLESS_CORRIDOR_TUNNEL: ({ exiting }) => <EndlessCorridorTunnelAnim exiting={exiting} />,
  GOD_POWER_BLOCKED: ({ anim, exiting }) => <TorchWardOverlay anim={anim} exiting={exiting} />,
  TSG_SLIME_POP: ({ anim, exiting }) => <TsathogguaSlimePopOverlay anim={anim} exiting={exiting} />,
};

function AnimOverlay({ anim, exiting, expansionKey = '地神的潜影' }) {
  if (!anim || NO_OVERLAY_TYPES.has(anim.type)) return null;
  const render = ANIM_RENDERERS[anim.type];
  if (render) return render({ anim, exiting, expansionKey });
  return <GenericAnimOverlay anim={anim} exiting={exiting} />;
}


export { AnimOverlay };

