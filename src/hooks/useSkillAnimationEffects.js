import { useCallback, useEffect, useState } from 'react';
import { _getZoomCompensatedRect } from '../utils/dom';
import { useTimerSet } from './useTimerSet';

export function useSkillAnimationEffects({ anim }) {
  const [swapAnim, setSwapAnim] = useState(false);
  const [huntAnim, setHuntAnim] = useState(null);
  const [bewitchAnim, setBewitchAnim] = useState(null);
  const { addTimer, clearTimers } = useTimerSet();

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
        const el = document.querySelector(`[data-pid="${ti}"]`);
        if (el) {
          const r = _getZoomCompensatedRect(el);
          setHuntAnim({ cx: r.left + r.width / 2, cy: r.top + r.height / 2 });
        } else {
          setHuntAnim({ cx: window.innerWidth / 2, cy: window.innerHeight * 0.25 });
        }
        addTimer(() => setHuntAnim(null), 1300);
      });
      return cleanupRaf;
    }

    if (anim.type === 'SKILL_BEWITCH') {
      const bti = anim.targetIdx ?? 1;
      schedule(() => {
        const bel = document.querySelector(`[data-pid="${bti}"]`);
        if (bel) {
          const br = _getZoomCompensatedRect(bel);
          setBewitchAnim({ cx: br.left + br.width / 2, cy: br.top + br.height / 2 });
        } else {
          setBewitchAnim({ cx: window.innerWidth / 2, cy: window.innerHeight * 0.25 });
        }
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
