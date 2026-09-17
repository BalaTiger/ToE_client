import { useState } from 'react';
import { CardFlipAnim } from './CardFlipAnim';
import { DrawRevealActions, GodChoiceActions } from '../battle/RevealDecisionActions';
import { TUTORIAL_FLOW } from '../../game/tutorialScenario';

import { getRevealDecision, matchesRevealDecision } from './revealDecision';

function decisionActions(decision, p) {
  const { gs } = p;
  if (decision.kind === 'draw-reveal') return <DrawRevealActions
    drawReveal={gs.drawReveal}
    onKeep={p.handleDrawKeepFromModal}
    onDiscard={p.handleDrawDiscardFromModal}
    decisionError={p.decisionError}
    canChoose={p.isLocalDrawDecision && p.decisionContext?.localCanAct !== false}
    thinkingText={`${gs.drawReveal.drawerName || gs.players[decision.actorIdx]?.name || '对方'}正在思考…`}
    canKeep={!p.isTutorialDrawKeepStep || p.isTutorialActionAllowed({ type: 'drawKeep' })}
    canDiscard={!p.isTutorialDrawKeepStep}
    keepButtonRef={p.drawRevealKeepButtonRef}
  />;
  const actor = gs.players[decision.actorIdx] || p.me;
  const godKey = decision.card.godKey;
  const alreadyWorship = actor.godName === godKey;
  const canUpgrade = alreadyWorship && (actor.godLevel || 0) < 3;
  const tutorialKeep = p.showTutorial && p.tutorialStep === TUTORIAL_FLOW.CULTIST_GOD_KEEP_HAND;
  return <GodChoiceActions
    godCard={decision.card} player={actor}
    isConvert={!!actor.godName && !alreadyWorship}
    forcedConvert={!!gs.abilityData.forcedConvert}
    canChoose={p.isLocalGodChoice && decision.actorIdx === 0 && p.decisionContext?.localCanAct !== false}
    thinkingText={`${actor.name || '对方'}正在回应邪神…`}
    allowWorship={!tutorialKeep}
    allowKeepHand={!tutorialKeep || p.isTutorialActionAllowed({ type: 'godKeepHand' })}
    allowDiscard={!tutorialKeep}
    onWorship={() => p.runDecision(`god-choice:worship:${godKey}`, () => p.godResolvePlayer(alreadyWorship && canUpgrade ? 'upgrade' : 'worship'))}
    onKeepHand={() => p.runDecision(`god-choice:keep:${godKey}`, () => p.godResolvePlayer('keepHand'))}
    onDiscard={() => p.runDecision(`god-choice:discard:${godKey}`, () => p.godResolvePlayer('discard'))}
    keepButtonRef={p.godKeepHandButtonRef}
    decisionError={p.decisionError}
  />;
}

export function CardRevealDecisionLayer({ anim, exiting, expansionKey, decisionProps = {}, pendingState }) {
  const p = decisionProps;
  const activeDraw = anim?.type === 'DRAW_CARD' ? anim : null;
  const [lastDraw, setLastDraw] = useState(null);
  // Remember the actual playback identity so normal queue commit does not
  // remount the card or restart its spin. A restored snapshot needs no cache.
  if (activeDraw && activeDraw !== lastDraw && !activeDraw.card?.effect) setLastDraw(activeDraw);
  const decision = getRevealDecision(p.gs);
  const pendingDecision = getRevealDecision(pendingState);
  const zhuBlocked = decision?.kind === 'god-choice' ? p.pendingZhuGodAnyCard : p.pendingZhuDrawAnyCard;
  const visible = decision && !zhuBlocked && (decision.kind === 'god-choice'
    ? p.isLocalGodChoice || p.gs._isMP : !p.suppressAnim);
  const ready = !!visible && !!p.canShowTurnDecisionModal && !pendingState && !p.decisionSubmitting;
  // During resolution, pending state wins even when it no longer is a
  // decision. Never retain an obsolete card from the pre-resolution gs.
  const target = pendingState ? pendingDecision : ready ? decision : null;
  const draw = activeDraw || lastDraw;
  const retain = !p.decisionSubmitting && !zhuBlocked && matchesRevealDecision(draw, target);
  if (!activeDraw && !retain && !ready) return null;

  const replay = activeDraw || (matchesRevealDecision(lastDraw, target || decision) ? lastDraw : null);
  const card = activeDraw?.card || (retain ? target.card : decision.card);
  const key = replay?._playbackId ?? replay ?? `${p.gs?._turnKey || ''}:${decision?.kind}:${card.id ?? card.uid ?? card.name}`;
  return <CardFlipAnim
    key={typeof key === 'object' ? `${key.inspectionSeq ?? ''}:${key.card?.id ?? key.card?.name}:${key.targetPid ?? 0}` : key}
    card={card}
    triggerName={activeDraw?.triggerName}
    targetPid={activeDraw?.targetPid ?? target?.actorIdx ?? decision?.actorIdx ?? 0}
    exiting={exiting}
    skipTravel={activeDraw ? !!activeDraw.skipTravel : true}
    travelOnly={!!activeDraw?.travelOnly}
    sourcePile={activeDraw?.sourcePile}
    guessCorrect={activeDraw?.guessCorrect}
    expansionKey={expansionKey}
    onSettled={activeDraw?.onSettled}
    preserveOnExit={retain}
    settled={!activeDraw}
    showBackdrop={!anim || !!activeDraw}
    decisionKind={retain ? target.kind : ready ? decision.kind : undefined}
  >
    {ready && !activeDraw ? decisionActions(decision, p) : null}
  </CardFlipAnim>;
}
