import { useCallback, useEffect, useRef, useState } from 'react';
import { _getZoomCompensatedRect } from '../utils/dom';
import { useTimerSet } from './useTimerSet';

export function getSkillTargetCenter(targetIdx) {
  const panel = document.querySelector(`[data-pid="${targetIdx}"]`);
  // Coastal self panels include the entire tall faith sidebar. Aim at the
  // visible portrait instead of its empty middle; classic portraits are hidden.
  const portraitRect = _getZoomCompensatedRect(panel?.querySelector('.toe-coastal-portrait'));
  const rect = portraitRect?.width > 0 && portraitRect?.height > 0
    ? portraitRect
    : _getZoomCompensatedRect(panel);
  // size lets overlays scale to the target: opponent portraits are ~56px while
  // the self portrait grows with the container, so a fixed pixel scope reads
  // large on opponents and small on the player.
  return rect?.width > 0 && rect?.height > 0
    ? { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, size: Math.max(rect.width, rect.height) }
    : { cx: window.innerWidth / 2, cy: window.innerHeight * 0.25, size: 0 };
}

export function useSkillAnimationEffects({ anim, huntVignetteHold = false }) {
  const [swapAnim, setSwapAnim] = useState(false);
  const [huntAnim, setHuntAnim] = useState(null);
  const [bewitchAnim, setBewitchAnim] = useState(null);
  const { addTimer, clearTimers } = useTimerSet();
  const huntVignetteHoldRef = useRef(huntVignetteHold);

  // The lingering red frame survives the scope animation only while the local
  // player still owes a reveal. Confirming (or the phase moving on, e.g. the
  // 20s timeout) drops the hold; the consumer gates the scopeDone overlay on
  // huntVignetteHold, so no state cleanup is needed here.
  useEffect(() => {
    huntVignetteHoldRef.current = huntVignetteHold;
  }, [huntVignetteHold]);

  const clearSkillAnimations = useCallback(() => {
    clearTimers();
    setSwapAnim(false);
    setHuntAnim(null);
    setBewitchAnim(null);
  }, [clearTimers]);

  useEffect(() => clearSkillAnimations, [clearSkillAnimations]);

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

    if (!anim) return cleanupRaf;

    if (anim.type === 'SKILL_SWAP') {
      schedule(() => {
        const swapMsg = anim.msgs?.find(m => m.includes('掉包'));
        const swapMatch = swapMsg?.match(/^(.+?)对 (.+?) 【掉包】/);
        setSwapAnim({ casterName: swapMatch?.[1] || '', targetName: swapMatch?.[2] || '' });
        addTimer(() => setSwapAnim(null), 900);
      });
      return cleanupRaf;
    }

    if (anim.type === 'SKILL_HUNT') {
      const ti = anim.targetIdx ?? 1;
      schedule(() => {
        setHuntAnim(getSkillTargetCenter(ti));
        if (ti === 0) {
          // Local player is the prey: once the scope locks, keep only the red
          // edge frame until the reveal is confirmed (hold flag clears it).
          // Fires at 1.05s so the persistent frame crossfades with the animated
          // vignette's 0.96–1.2s fade-out instead of blinking after it.
          addTimer(() => setHuntAnim(prev => (
            prev && huntVignetteHoldRef.current ? { ...prev, scopeDone: true } : null
          )), 1050);
        } else {
          addTimer(() => setHuntAnim(null), 1300);
        }
      });
      return cleanupRaf;
    }

    if (anim.type === 'SKILL_BEWITCH') {
      const bti = anim.targetIdx ?? 1;
      schedule(() => {
        setBewitchAnim(getSkillTargetCenter(bti));
        addTimer(() => setBewitchAnim(null), 1200);
      });
      return cleanupRaf;
    }

    return cleanupRaf;
  }, [anim, addTimer]);

  return {
    swapAnim,
    huntAnim,
    bewitchAnim,
    clearSkillAnimations,
  };
}
