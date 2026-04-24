import React from 'react';
import { CardFlipAnim } from './CardFlipAnim';
import { DiceRollAnim, GenericAnimOverlay, YourTurnAnim } from './GenericAnimOverlay';
import { DiscardMoveOverlay } from './MoveOverlays';
import { CaveDuelAnim } from './SkillOverlays';

function AnimOverlay({anim,exiting}){
  if(!anim) return null;
  if(anim.type==='YOUR_TURN') return <YourTurnAnim name={anim.name}/>;
  if(anim.type==='DRAW_CARD') return <CardFlipAnim card={anim.card} triggerName={anim.triggerName} targetPid={anim.targetPid??0} exiting={exiting} skipTravel={!!anim.skipTravel}/>;
  if(anim.type==='DICE_ROLL') return <DiceRollAnim anim={anim} exiting={exiting}/>;
  if(anim.type==='DISCARD') return <DiscardMoveOverlay anim={anim} exiting={exiting}/>
  if(anim.type==='CARD_TRANSFER') return null; // rendered via cardTransfers state
  if(anim.type==='CAVE_DUEL') return <CaveDuelAnim anim={anim} exiting={exiting}/>;
  if(anim.type==='TURN_BOUNDARY_PAUSE') return null;
  if(['HP_DAMAGE','HP_HEAL','SAN_HEAL','SAN_DAMAGE'].includes(anim.type)) return null;
  return <GenericAnimOverlay anim={anim} exiting={exiting}/>;
}


export { AnimOverlay };
