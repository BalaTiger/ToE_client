import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAnimationQueue } from '../hooks/useAnimationQueue';
import { useDamageAnimationEffects } from '../hooks/useDamageAnimationEffects';
import { useAnimationAudioEffects } from '../hooks/useAnimationAudioEffects';
import { useSkillAnimationEffects } from '../hooks/useSkillAnimationEffects';
import { useCardTransferAnimationEffects } from '../hooks/useCardTransferAnimationEffects';
import { useGlobalShakeEffects } from '../hooks/useGlobalShakeEffects';
import { prepareAnimQueueLogs } from '../game/animLogs';
import { ANIM_DURATION, ANIM_SPEED_SCALE, ANIM_STEP_GAP, CARD_REVEAL_DURATION } from '../components/anim/constants';
import { createAuthorityAnimationTransaction, createAuthorityEventBuffer } from './presentationEvents';
import { presentationDeadline, presentationReadyPayload } from './presentationClock';
import { createAuthorityPresentation } from './presentation/model';

const copyPlayers = players => players.map(player => ({ ...player,
  hand: [...(player.hand || [])], godZone: [...(player.godZone || [])], zoneCards: [...(player.zoneCards || [])] }));
const statsOf = gs => gs.players.map(player => ({ hp: player.hp, san: player.san }));
const discardOf = gs => gs?.discard || [];
const highlightFor = step => step.type === 'YOUR_TURN' ? step.targetPid : null;
const stamp = (gs, view) => ({ ...gs, _authorityRevision: view.revision, _authorityMatchId: view.matchId });

export function useAuthorityPresentation({ view, model, paused = false, audio = {}, session,
  freshStart = false, openingBlocked = false }) {
  const clock = useMemo(() => {
    const receivedAt = performance.now();
    return { receivedAt, serverNow: view.serverNow, deadline: presentationDeadline(view, receivedAt) };
  }, [view]);
  const playbackDeadlineMs = clock.deadline;
  const estimatedServerNow = Number.isFinite(clock.serverNow)
    ? clock.serverNow + Math.max(0, performance.now() - clock.receivedAt) : null;
  const [gs, setGs] = useState(() => {
    if (!freshStart) return stamp(model.gs, view);
    const opening = view.openingPlayers ? createAuthorityPresentation({ ...view, players: view.openingPlayers },
      { offline: model.gs._isMP === false }).gs : model.gs;
    return { ...stamp(opening, view), _authorityRevision: -1, phase: 'ACTION', drawReveal: null, abilityData: {} };
  });
  const [displayStats, setDisplayStats] = useState(() => statsOf(gs));
  const [visualPlayersOverride, setVisualPlayersOverride] = useState(null);
  const [visualDiscard, setVisualDiscard] = useState(() => discardOf(model.gs));
  const [visualTurnHighlight, setVisualTurnHighlight] = useState(null);
  const [visibleLog, setVisibleLog] = useState([]);
  const [error, setError] = useState(null);
  const buffer = useRef(null);
  const frames = useRef([]);
  const consumedVisualEventIdsRef = useRef(new Set());
  const visibleLogRef = useRef([]);
  const visibleLogEntryIdsRef = useRef(new Set());
  const suppressNextBroadcastRef = useRef(false);
  const receivedGsRef = useRef(false);
  const appendVisibleLog = useCallback(lines => {
    visibleLogRef.current = [...visibleLogRef.current, ...lines].slice(-256);
    setVisibleLog(visibleLogRef.current);
  }, []);
  const restoreVisibleLog = useCallback(lines => {
    visibleLogRef.current = [...lines];
    setVisibleLog(visibleLogRef.current);
  }, []);
  const visualStateLocks = useMemo(() => ({
    lock(patch) {
      if (Object.hasOwn(patch, 'players')) setVisualPlayersOverride(patch.players);
      if (Object.hasOwn(patch, 'turnHighlight')) setVisualTurnHighlight(patch.turnHighlight);
    },
    clear(patch) {
      if (patch.players) setVisualPlayersOverride(null);
      if (patch.turnHighlight) setVisualTurnHighlight(null);
    },
  }), []);
  const queue = useAnimationQueue({ gs, copyPlayers, setGs, setDisplayStats, setVisualPlayersOverride,
    setVisualDiscard, restoreVisibleLog, appendVisibleLog, getVisualDiscardForState: discardOf,
    resolveTurnHighlightForStep: highlightFor, prepareAnimQueueLogs,
    visibleLogRef, visibleLogEntryIdsRef, visualStateLocks, suppressNextBroadcastRef, receivedGsRef,
    consumedVisualEventIdsRef, ANIM_DURATION, ANIM_SPEED_SCALE, ANIM_STEP_GAP, CARD_REVEAL_DURATION, paused,
    playbackDeadlineMs });
  const damage = useDamageAnimationEffects({ ...audio, anim: queue.anim, paused, onGuillotineReady: queue.markGuillotineReady });
  const skill = useSkillAnimationEffects({ anim: queue.anim,
    huntVignetteHold: model.hasAction?.('hunt.reveal') || false });
  const transfer = useCardTransferAnimationEffects({ anim: queue.anim });
  useAnimationAudioEffects({ ...audio, anim: queue.anim });
  const godHighlightPanelBursts = queue.anim?.type === 'GOD_HIGHLIGHT'
    && Number.isInteger(queue.anim.targetPid) && queue.anim.godKey ? {
      [queue.anim.targetPid]: { key: queue.anim._playbackId || queue.anim.visualEventId, godKey: queue.anim.godKey },
    } : {};
  const { playGodHighlightSound } = audio;
  useEffect(() => {
    if (queue.anim?.type === 'GOD_HIGHLIGHT') playGodHighlightSound?.();
  }, [queue.anim, playGodHighlightSound]);
  const { sceneShake } = useGlobalShakeEffects({ anim: queue.anim, guillotineReady: queue.guillotineReady,
    localDebugMode: false, visibleLogRef, setVisibleLog });
  const damageLinkGhosts = queue.anim?.damageLinkBreak ? [{
    id: queue.anim.visualEventId, key: queue.anim.visualEventId, ...queue.anim.damageLinkBreak,
    mode: queue.anim.damageLinkBreak.mode === 'fade' ? 'fade' : 'break',
  }] : [];

  useLayoutEffect(() => {
    if (!buffer.current) {
      buffer.current = createAuthorityEventBuffer(view);
      if (freshStart) frames.current.push({ events: view.events || [], model, view });
      else return;
    }
    const incoming = buffer.current.receive(view);
    const restore = () => {
      queue.resetAnimationQueue();
      damage.clearDamageAnimations();
      skill.clearSkillAnimations();
      transfer.clearCardTransferAnimations();
      frames.current = [];
      consumedVisualEventIdsRef.current.clear();
      visibleLogEntryIdsRef.current.clear();
      setVisualPlayersOverride(null);
      setVisualTurnHighlight(null);
      setVisualDiscard(discardOf(model.gs));
      setDisplayStats(statsOf(model.gs));
      setGs(stamp(model.gs, view));
      restoreVisibleLog([]);
    };
    if (incoming?.restore) {
      restore();
      return;
    }
    if (incoming) frames.current.push({ events: incoming.events, model, view });
    if (openingBlocked) return;
    if (queue.anim || queue.pendingGsRef.current || queue.animQueueRef.current.length) return;
    let frame;
    if (playbackDeadlineMs != null && performance.now() >= playbackDeadlineMs && frames.current.length > 1) {
      const pending = frames.current.splice(0), latest = pending[pending.length - 1];
      frame = { ...latest, events: pending.flatMap(item => item.events) };
    } else frame = frames.current.shift();
    if (!frame) return;
    try {
      const transaction = createAuthorityAnimationTransaction(frame.events,
        { ...frame.model, gs: stamp(frame.model.gs, frame.view) }, gs);
      setError(null);
      queue.playAnimationTransaction(transaction);
    } catch (cause) {
      // An invalid presentation is an explicit restoration boundary, never a
      // reason to run local rules or fabricate damage from the final snapshot.
      restore();
      setError(cause);
    }
    // The queue methods intentionally capture its latest rendered presentation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, model, gs, queue.anim, openingBlocked]);

  const busy = !!queue.anim || gs._authorityMatchId !== view.matchId || gs._authorityRevision !== view.revision;
  useEffect(() => {
    if (busy || paused || !session?.presentationReady || !presentationReadyPayload(view)
      || queue.pendingGsRef.current || queue.animQueueRef.current.length || frames.current.length) return;
    let disposed = false, timer;
    const ready = () => session.presentationReady(view).catch(failure => {
      // A missing receipt may be retried; it cannot create or extend a buffer.
      if (!disposed && (failure.uncertain || failure.message === 'not_connected')
        && performance.now() < playbackDeadlineMs) timer = setTimeout(ready, 500);
    });
    ready();
    return () => { disposed = true; clearTimeout(timer); };
    // Queue refs are checked only after the matching visual revision commits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, paused, session, view, playbackDeadlineMs]);

  useEffect(() => {
    if (busy) return;
    // Completed historical IDs are no longer needed by the rolling event wire
    // window. Pending IDs remain owned by the queue until their commit.
    for (const ids of [consumedVisualEventIdsRef.current, visibleLogEntryIdsRef.current]) {
      while (ids.size > 1024) ids.delete(ids.values().next().value);
    }
  }, [busy, gs]);

  return { gs, displayStats, visualPlayers: visualPlayersOverride || gs.players,
    visualDiscard, visualTurnHighlight, visibleLog, error, damageLinkGhosts, godHighlightPanelBursts, sceneShake,
    blackGoatPulsePid: queue.anim?.type === 'BLACK_GOAT_PULSE' ? queue.anim.targetPid : null,
    busy, serverNow: estimatedServerNow,
    buffering: playbackDeadlineMs != null && performance.now() < playbackDeadlineMs,
    anim: queue.anim, animExiting: queue.animExiting,
    canFinishRevealEarly: queue.canFinishRevealEarly, finishRevealEarly: queue.finishRevealEarly,
    ...damage, ...skill, ...transfer };
}
