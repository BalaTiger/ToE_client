import { useCallback, useEffect, useRef, useState } from 'react';
import { _getZoomCompensatedRect } from '../utils/dom';
import { captureDeathPanelSnapshot, DEATH_SNAPSHOT_TIMEOUT_MS } from '../utils/deathPanelSnapshot';
import { useTimerSet } from './useTimerSet';

const PETRIFY_PANEL_CLEAR_MS = 3800;

export function useDamageAnimationEffects({ anim, paused = false, onGuillotineReady, playHpDamageSound, playSanDamageSound, playHpRecoverSound, playSanRecoverSound, playGuillotineDeathSound, playPetrifyDeathSound }) {
  const [hitIndices, setHitIndices] = useState([]);
  const [knifeTargets, setKnifeTargets] = useState([]);
  const [sanHitIndices, setSanHitIndices] = useState([]);
  const [sanTargets, setSanTargets] = useState([]);
  const [guillotineTargets, setGuillotineTargets] = useState([]);
  const [petrifyTargets, setPetrifyTargets] = useState([]);
  const [hpHealIndices, setHpHealIndices] = useState([]);
  const [sanHealIndices, setSanHealIndices] = useState([]);
  const [preparedGuillotine, setPreparedGuillotine] = useState(null);
  const deathCaptureAbortRef = useRef(null);
  const guillotineStartedRef = useRef(null);
  const { addTimer, clearTimers } = useTimerSet();

  const clearDamageAnimations = useCallback(() => {
    deathCaptureAbortRef.current?.abort();
    deathCaptureAbortRef.current = null;
    guillotineStartedRef.current = null;
    clearTimers();
    setHitIndices([]);
    setKnifeTargets([]);
    setSanHitIndices([]);
    setSanTargets([]);
    setGuillotineTargets([]);
    setPetrifyTargets([]);
    setHpHealIndices([]);
    setSanHealIndices([]);
    setPreparedGuillotine(null);
  }, [clearTimers]);

  useEffect(() => clearDamageAnimations, [clearDamageAnimations]);

  useEffect(() => {
    let cancelled = false;
    let raf1 = 0;
    let raf2 = 0;
    const schedule = (fn) => {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          if (!cancelled) fn();
        });
      });
    };
    const cleanupRaf = () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };

    if (!anim) {
      schedule(clearDamageAnimations);
      return cleanupRaf;
    }

    if (anim.type === 'HP_DAMAGE' && anim.hitIndices?.length) {
      playHpDamageSound();
      schedule(() => {
        const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const pts = anim.hitIndices.map((pi, idx) => {
          const el = document.querySelector(`[data-pid="${pi}"]`);
          if (el) {
            const r = _getZoomCompensatedRect(el);
            return { pi, cx: r.left + r.width / 2, cy: r.top + r.height / 2, animKey: `${stamp}-${pi}-${idx}` };
          }
          return { pi, cx: window.innerWidth / 2, cy: window.innerHeight * 0.3, animKey: `${stamp}-${pi}-${idx}` };
        });
        setHitIndices(anim.hitIndices);
        setKnifeTargets(pts);
      });
      return cleanupRaf;
    }

    if (anim.type === 'SAN_DAMAGE' && anim.hitIndices?.length) {
      const cancelSanDamageSound = playSanDamageSound?.({ impactDelayMs: anim.impactAtMs ?? 460 });
      schedule(() => {
        const srcEl = document.querySelector('[data-pid="0"]');
        const srcR = srcEl
          ? _getZoomCompensatedRect(srcEl)
          : { left: window.innerWidth * 0.5, top: window.innerHeight * 0.7, width: 0, height: 0 };
        const srcX = srcR.left + srcR.width / 2;
        const srcY = srcR.top + srcR.height / 2;
        const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const pts = anim.hitIndices.map((pi, idx) => {
          const el = document.querySelector(`[data-pid="${pi}"]`);
          if (el) {
            const r = _getZoomCompensatedRect(el);
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            const ox = ((pi * 17 + 5) % 22) - 11;
            const oy = ((pi * 13 + 7) % 16) - 8;
            return { pi, cx, cy, startX: srcX + ox, startY: srcY + oy, animKey: `${stamp}-${pi}-${idx}` };
          }
          return { pi, cx: window.innerWidth / 2, cy: window.innerHeight * 0.3, startX: srcX, startY: srcY, animKey: `${stamp}-${pi}-${idx}` };
        });
        setSanHitIndices(anim.hitIndices);
        setSanTargets(pts);
        addTimer(() => setSanHitIndices([]), 850);
        addTimer(() => setSanTargets([]), 900);
      });
      return () => {
        cleanupRaf();
        cancelSanDamageSound?.();
      };
    }

    if (anim.type === 'HP_HEAL' && anim.hitIndices?.length) {
      playHpRecoverSound?.();
      schedule(() => {
        setHpHealIndices(anim.hitIndices);
        addTimer(() => setHpHealIndices([]), 1300);
      });
      return cleanupRaf;
    }

    if (anim.type === 'SAN_HEAL' && anim.hitIndices?.length) {
      playSanRecoverSound?.();
      schedule(() => {
        setSanHealIndices(anim.hitIndices);
        addTimer(() => setSanHealIndices([]), 1300);
      });
      return cleanupRaf;
    }

    if (anim.type === 'HP_SAN_HEAL' && anim.hitIndices?.length) {
      playHpRecoverSound?.();
      playSanRecoverSound?.();
      schedule(() => {
        setHpHealIndices(anim.hitIndices);
        setSanHealIndices(anim.hitIndices);
        addTimer(() => setHpHealIndices([]), 1300);
        addTimer(() => setSanHealIndices([]), 1300);
      });
      return cleanupRaf;
    }

    if (anim.type === 'GUILLOTINE' && anim.hitIndices?.length) {
      const abort = new AbortController();
      deathCaptureAbortRef.current = abort;
      schedule(async () => {
        const pts = await Promise.all(anim.hitIndices.map(idx => captureDeathPanelSnapshot(idx, {
          signal: abort.signal,
          timeoutMs: DEATH_SNAPSHOT_TIMEOUT_MS,
        })));
        if (!cancelled && !abort.signal.aborted) {
          setPreparedGuillotine({ anim, targets: pts.filter(Boolean), signal: abort.signal });
        }
      });
      return () => {
        cleanupRaf();
        abort.abort();
        if (deathCaptureAbortRef.current === abort) deathCaptureAbortRef.current = null;
      };
    }

    if (anim.type === 'PETRIFY_DEATH' && anim.hitIndices?.length) {
      playPetrifyDeathSound?.();
      schedule(async () => {
        const pts = await Promise.all(anim.hitIndices.map(idx => captureDeathPanelSnapshot(idx)));
        if (!cancelled) setPetrifyTargets(pts.filter(Boolean));
        addTimer(() => setPetrifyTargets([]), PETRIFY_PANEL_CLEAR_MS);
      });
      return cleanupRaf;
    }

    if (anim.type === 'DEATH') {
      schedule(() => {
        setGuillotineTargets([]);
        setPetrifyTargets([]);
      });
      return cleanupRaf;
    }

    return cleanupRaf;
  }, [anim, playHpDamageSound, playSanDamageSound, playHpRecoverSound, playSanRecoverSound, playPetrifyDeathSound, addTimer, clearDamageAnimations]);

  useEffect(() => {
    if (anim?.type !== 'GUILLOTINE' || preparedGuillotine?.anim !== anim || paused) return;
    if (guillotineStartedRef.current === anim || preparedGuillotine.signal.aborted) return;
    // The panel stays visible during capture. Start the cut, sound and queue
    // clock together only after the image (or bounded failure fallback) exists.
    const frame = requestAnimationFrame(() => {
      if (preparedGuillotine.signal.aborted) return;
      guillotineStartedRef.current = anim;
      setGuillotineTargets(preparedGuillotine.targets);
      try {
        playGuillotineDeathSound?.();
      } catch (err) {
        console.warn('[death-snapshot] death sound failed', err);
      }
      onGuillotineReady?.(anim);
    });
    return () => cancelAnimationFrame(frame);
  }, [anim, preparedGuillotine, paused, playGuillotineDeathSound, onGuillotineReady]);

  return {
    hitIndices,
    knifeTargets,
    sanHitIndices,
    sanTargets,
    guillotineTargets,
    petrifyTargets,
    hpHealIndices,
    sanHealIndices,
    clearDamageAnimations,
  };
}
