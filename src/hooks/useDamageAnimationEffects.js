import { useCallback, useEffect, useRef, useState } from 'react';
import { _getZoomCompensatedRect } from '../utils/dom';

export function useDamageAnimationEffects({ anim, playHpDamageSound }) {
  const [hitIndices, setHitIndices] = useState([]);
  const [knifeTargets, setKnifeTargets] = useState([]);
  const [sanHitIndices, setSanHitIndices] = useState([]);
  const [sanTargets, setSanTargets] = useState([]);
  const [guillotineTargets, setGuillotineTargets] = useState([]);
  const [hpHealIndices, setHpHealIndices] = useState([]);
  const [sanHealIndices, setSanHealIndices] = useState([]);
  const [screenShake, setScreenShake] = useState(false);
  const [deathShake, setDeathShake] = useState(false);
  const timersRef = useRef(new Set());
  const shakeTimerRef = useRef(null);

  const addTimer = useCallback((fn, delay) => {
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      fn();
    }, delay);
    timersRef.current.add(timer);
    return timer;
  }, []);

  const clearDamageAnimations = useCallback(() => {
    timersRef.current.forEach(timer => clearTimeout(timer));
    timersRef.current.clear();
    clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = null;
    setHitIndices([]);
    setKnifeTargets([]);
    setSanHitIndices([]);
    setSanTargets([]);
    setGuillotineTargets([]);
    setHpHealIndices([]);
    setSanHealIndices([]);
    setScreenShake(false);
    setDeathShake(false);
  }, []);

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
        setScreenShake(true);
        clearTimeout(shakeTimerRef.current);
        shakeTimerRef.current = addTimer(() => setScreenShake(false), 400);
      });
      return cleanupRaf;
    }

    if (anim.type === 'SAN_DAMAGE' && anim.hitIndices?.length) {
      schedule(() => {
        const srcEl = document.querySelector('[data-pid="0"]');
        const srcR = srcEl
          ? _getZoomCompensatedRect(srcEl)
          : { left: window.innerWidth * 0.5, top: window.innerHeight * 0.7, width: 0, height: 0 };
        const srcX = srcR.left + srcR.width / 2;
        const srcY = srcR.top + srcR.height / 2;
        const pts = anim.hitIndices.map(pi => {
          const el = document.querySelector(`[data-pid="${pi}"]`);
          if (el) {
            const r = _getZoomCompensatedRect(el);
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            const ox = ((pi * 17 + 5) % 22) - 11;
            const oy = ((pi * 13 + 7) % 16) - 8;
            return { pi, cx, cy, startX: srcX + ox, startY: srcY + oy };
          }
          return { pi, cx: window.innerWidth / 2, cy: window.innerHeight * 0.3, startX: srcX, startY: srcY };
        });
        setSanHitIndices(anim.hitIndices);
        setSanTargets(pts);
        setScreenShake(true);
        clearTimeout(shakeTimerRef.current);
        shakeTimerRef.current = addTimer(() => setScreenShake(false), 280);
        addTimer(() => setSanHitIndices([]), 850);
      });
      return cleanupRaf;
    }

    if (anim.type === 'HP_HEAL' && anim.hitIndices?.length) {
      schedule(() => {
        setHpHealIndices(anim.hitIndices);
        addTimer(() => setHpHealIndices([]), 1300);
      });
      return cleanupRaf;
    }

    if (anim.type === 'SAN_HEAL' && anim.hitIndices?.length) {
      schedule(() => {
        setSanHealIndices(anim.hitIndices);
        addTimer(() => setSanHealIndices([]), 1300);
      });
      return cleanupRaf;
    }

    if (anim.type === 'GUILLOTINE' && anim.hitIndices?.length) {
      schedule(async () => {
        const pts = await Promise.all(anim.hitIndices.map(async idx => {
          const el = document.querySelector(`[data-death-panel="${idx}"]`);
          if (!el) return null;
          const r = _getZoomCompensatedRect(el);
          let snapshotUrl = null;
          try {
            const { default: html2canvas } = await import('html2canvas');
            const canvas = await html2canvas(el, {
              backgroundColor: null,
              useCORS: true,
              logging: false,
              scale: 1,
            });
            snapshotUrl = canvas.toDataURL('image/png');
          } catch (err) {
            console.warn('[death-snapshot] capture failed for pid', idx, err);
          }
          return { pi: idx, x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2, snapshotUrl };
        }));
        if (!cancelled) setGuillotineTargets(pts.filter(Boolean));
      });
      const timers = timersRef.current;
      const shakeTimer = addTimer(() => {
        setDeathShake(true);
        clearTimeout(shakeTimerRef.current);
        shakeTimerRef.current = addTimer(() => setDeathShake(false), 220);
      }, 120);
      return () => {
        cleanupRaf();
        clearTimeout(shakeTimer);
        timers.delete(shakeTimer);
      };
    }

    if (anim.type === 'DEATH') {
      schedule(() => {
        setGuillotineTargets([]);
        setDeathShake(false);
      });
      return cleanupRaf;
    }

    return cleanupRaf;
  }, [anim, playHpDamageSound, addTimer, clearDamageAnimations]);

  return {
    hitIndices,
    knifeTargets,
    sanHitIndices,
    sanTargets,
    guillotineTargets,
    hpHealIndices,
    sanHealIndices,
    screenShake,
    deathShake,
    clearDamageAnimations,
  };
}
