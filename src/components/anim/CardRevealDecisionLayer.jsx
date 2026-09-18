import { useEffect, useRef, useState } from 'react';
import { CardFlipAnim } from './CardFlipAnim';
import { DrawRevealActions, GodChoiceActions } from '../battle/RevealDecisionActions';
import { TUTORIAL_FLOW } from '../../game/tutorialScenario';
import { getDecisionContext } from '../../game/decisionContext';
import { ROLE_CULTIST } from '../../game/coreUtils';
import { isLocalDrawDecisionPhase, isLocalGodChoicePhase } from '../../game/rotateState';

import { getRevealDecision, matchesRevealDecision } from './revealDecision';

function decisionActions(decision, p, chooseEarly) {
  const { gs } = p;
  const action = (name, callback) => chooseEarly ? () => chooseEarly(name) : callback;
  if (decision.kind === 'draw-reveal') return <DrawRevealActions
    drawReveal={gs.drawReveal}
    onKeep={action('onKeep', p.handleDrawKeepFromModal)}
    onDiscard={action('onDiscard', p.handleDrawDiscardFromModal)}
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
    allowKeepHand={!alreadyWorship && !gs.abilityData.forcedConvert && actor.role === ROLE_CULTIST
      && (!tutorialKeep || p.isTutorialActionAllowed({ type: 'godKeepHand' }))}
    allowDiscard={!gs.abilityData.forcedConvert && !tutorialKeep}
    onWorship={action('onWorship', () => p.runDecision(`god-choice:worship:${godKey}`, () => p.godResolvePlayer(alreadyWorship && canUpgrade ? 'upgrade' : 'worship')))}
    onKeepHand={action('onKeepHand', () => p.runDecision(`god-choice:keep:${godKey}`, () => p.godResolvePlayer('keepHand')))}
    onDiscard={action('onDiscard', () => p.runDecision(`god-choice:discard:${godKey}`, () => p.godResolvePlayer('discard')))}
    keepButtonRef={p.godKeepHandButtonRef}
    decisionError={p.decisionError}
  />;
}

export function CardRevealDecisionLayer({ anim, exiting, expansionKey, decisionProps = {}, pendingState, canFinishRevealEarly = false, finishRevealEarly }) {
  const p = decisionProps;
  const activeDraw = anim?.type === 'DRAW_CARD' ? anim : null;
  const [lastDraw, setLastDraw] = useState(null);
  const [queuedChoice, setQueuedChoice] = useState(null);
  const choiceLocked = useRef(false);
  // Remember the actual playback identity so normal queue commit does not
  // remount the card or restart its spin. A restored snapshot needs no cache.
  if (activeDraw && activeDraw !== lastDraw && !activeDraw.card?.effect) setLastDraw(activeDraw);
  const decision = getRevealDecision(p.gs);
  const pendingDecision = getRevealDecision(pendingState);
  const zhuBlocked = decision?.kind === 'god-choice' ? p.pendingZhuGodAnyCard : p.pendingZhuDrawAnyCard;
  const visible = decision && !zhuBlocked && (decision.kind !== 'god-choice'
    || p.isLocalGodChoice || p.gs._isMP);
  const ready = !!visible && !!p.canShowTurnDecisionModal && !pendingState && !p.decisionSubmitting;
  const earlyState = pendingState || p.gs;
  const earlyDecision = pendingState ? pendingDecision : decision;
  const earlyZhuBlocked = earlyDecision && earlyState.zhuLight?.cardIds?.includes(earlyDecision.card.id)
    && !(earlyDecision.kind === 'god-choice' ? earlyState.abilityData?.zhuResolved : earlyState.drawReveal?.zhuResolved);
  const early = !!activeDraw && canFinishRevealEarly && !p.decisionSubmitting && !p.isSpectating
    && !zhuBlocked && !earlyZhuBlocked && !queuedChoice
    && earlyDecision?.kind === 'draw-reveal' && earlyDecision.actorIdx === 0
    && matchesRevealDecision(activeDraw, earlyDecision);
  const earlyProps = early ? {
    ...p, gs: earlyState, me: earlyState.players[0],
    decisionContext: getDecisionContext(earlyState),
    isLocalDrawDecision: isLocalDrawDecisionPhase(earlyState),
    isLocalGodChoice: isLocalGodChoicePhase(earlyState),
  } : null;
  useEffect(() => {
    const choice = queuedChoice;
    if (!choice) return;
    // Rules may change while required encounter/stat tails are playing. Never
    // send a saved click to a different card, owner, or restored remote phase.
    if (!matchesRevealDecision(choice.draw, earlyDecision) || choice.kind !== earlyDecision.kind
      || p.decisionSubmitting || p.isSpectating) {
      choiceLocked.current = false;
      setQueuedChoice(null);
      return;
    }
    if (!ready || activeDraw) return;
    choiceLocked.current = false;
    setQueuedChoice(null);
    const actions = decisionActions(decision, p).props;
    const permission = {
      onKeep: 'canKeep', onKeepHand: 'allowKeepHand', onWorship: 'allowWorship',
      onDiscard: decision.kind === 'draw-reveal' ? 'canDiscard' : 'allowDiscard',
    }[choice.name];
    if (actions.canChoose && actions[permission] !== false) actions[choice.name]?.();
  }, [queuedChoice, earlyDecision, decision, p, ready, activeDraw]);
  const chooseEarly = name => {
    if (choiceLocked.current || !early || typeof finishRevealEarly !== 'function') return;
    choiceLocked.current = true;
    if (finishRevealEarly(activeDraw._playbackId ?? activeDraw)) {
      setQueuedChoice({ name, draw: activeDraw, kind: earlyDecision.kind });
    } else choiceLocked.current = false;
  };
  // During resolution, pending state wins even when it no longer is a
  // decision. Never retain an obsolete card from the pre-resolution gs.
  const target = pendingState ? pendingDecision : ready || early ? decision : null;
  const draw = activeDraw || lastDraw;
  const retain = !p.decisionSubmitting && !zhuBlocked && matchesRevealDecision(draw, target);
  if (!activeDraw && !retain && !ready) return null;

  const replay = activeDraw || (matchesRevealDecision(lastDraw, target || decision) ? lastDraw : null);
  const card = activeDraw?.card || (retain ? target.card : decision.card);
  const key = replay?._playbackId ?? replay ?? `${p.gs?._turnKey || ''}:${decision?.kind}:${card.id ?? card.uid ?? card.name}`;
  // This factory only attaches chooseEarly to button callbacks; the click lock
  // is read on a user event, never while building the returned element.
  // eslint-disable-next-line react-hooks/refs
  const actions = early ? decisionActions(earlyDecision, earlyProps, chooseEarly)
    : ready && !activeDraw && !queuedChoice ? decisionActions(decision, p) : null;
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
    preserveOnExit={retain}
    settled={!activeDraw}
    showBackdrop={!anim || !!activeDraw}
    decisionKind={retain ? target.kind : ready ? decision.kind : undefined}
    earlyActions={early}
  >
    {actions}
  </CardFlipAnim>;
}
