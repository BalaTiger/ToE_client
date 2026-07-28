import { useCallback, useEffect, useState } from 'react';
import { _getZoomCompensatedRect } from '../utils/dom';
import { useTimerSet } from './useTimerSet';

const PETRIFY_PANEL_CLEAR_MS = 3800;

async function captureDeathPanelSnapshot(idx) {
  const el = document.querySelector(`[data-death-panel="${idx}"]`);
  if (!el) return null;
  const r = _getZoomCompensatedRect(el);
  const panelStyle = window.getComputedStyle(el);
  const panelBackground = panelStyle.background;
  const panelBorderColor = panelStyle.borderTopColor;
  const panelBoxShadow = panelStyle.boxShadow;
  let snapshotUrl = null;
  try {
    const { default: html2canvas } = await import('html2canvas');
    const inZoomContainer = !!el.closest?.('[data-zoom-container]');
    const canvas = await html2canvas(el, {
      backgroundColor: null,
      useCORS: true,
      logging: false,
      scale: Math.min(2, Math.max(1, window.devicePixelRatio || 1)),
      width: el.offsetWidth || undefined,
      height: el.offsetHeight || undefined,
      windowWidth: inZoomContainer ? 1200 : window.innerWidth,
      windowHeight: window.innerHeight,
      ignoreElements: node => node?.hasAttribute?.('data-theme-ornament'),
      onclone: (doc, cloneEl) => {
        const zoomContainer = doc.querySelector('[data-zoom-container]');
        if (zoomContainer?.style) {
          zoomContainer.style.zoom = 'normal';
          zoomContainer.style.transform = 'none';
        }
        const root = cloneEl || doc.querySelector(`[data-death-panel="${idx}"]`);
        if (!root?.style) return;
        root.style.zoom = 'normal';
        root.style.transform = 'none';
        root.style.background = 'transparent';
        root.style.backgroundColor = 'transparent';
        root.style.borderColor = 'transparent';
        root.style.boxShadow = 'none';
      },
    });
    snapshotUrl = canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('[death-snapshot] capture failed for pid', idx, err);
  }
  const snapX = r.left;
  const snapY = r.top;
  const snapW = r.width;
  const snapH = r.height;
  return {
    pi: idx,
    x: snapX,
    y: snapY,
    w: snapW,
    h: snapH,
    cx: snapX + snapW / 2,
    cy: snapY + snapH / 2,
    snapshotUrl,
    panelBackground,
    panelBorderColor,
    panelBoxShadow,
  };
}

export function useDamageAnimationEffects({ anim, playHpDamageSound, playSanDamageSound, playHpRecoverSound, playSanRecoverSound, playGuillotineDeathSound, playPetrifyDeathSound }) {
  const [hitIndices, setHitIndices] = useState([]);
  const [knifeTargets, setKnifeTargets] = useState([]);
  const [sanHitIndices, setSanHitIndices] = useState([]);
  const [sanTargets, setSanTargets] = useState([]);
  const [guillotineTargets, setGuillotineTargets] = useState([]);
  const [petrifyTargets, setPetrifyTargets] = useState([]);
  const [hpHealIndices, setHpHealIndices] = useState([]);
  const [sanHealIndices, setSanHealIndices] = useState([]);
  const { addTimer, clearTimers } = useTimerSet();

  const clearDamageAnimations = useCallback(() => {
    clearTimers();
    setHitIndices([]);
    setKnifeTargets([]);
    setSanHitIndices([]);
    setSanTargets([]);
    setGuillotineTargets([]);
    setPetrifyTargets([]);
    setHpHealIndices([]);
    setSanHealIndices([]);
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
      const cancelSanDamageSound = playSanDamageSound?.({ impactDelayMs: 460 });
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
      playGuillotineDeathSound?.();
      schedule(async () => {
        const pts = await Promise.all(anim.hitIndices.map(idx => captureDeathPanelSnapshot(idx)));
        if (!cancelled) setGuillotineTargets(pts.filter(Boolean));
      });
      return () => {
        cleanupRaf();
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
  }, [anim, playHpDamageSound, playSanDamageSound, playHpRecoverSound, playSanRecoverSound, playGuillotineDeathSound, playPetrifyDeathSound, addTimer, clearDamageAnimations]);

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
