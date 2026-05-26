import { useCallback, useEffect, useRef, useState } from 'react';
import { ANIM_STEP_GAP } from '../components/anim/constants';
import { _getZoomCompensatedRect, getPileAnchorCenter, getPlayerAreaAnchorCenter, getPlayerHandAnchorCenter } from '../utils/dom';

export function useCardTransferAnimationEffects({ anim }) {
  const [cardTransfers, setCardTransfers] = useState([]);
  const [damageLinkEstablishAnims, setDamageLinkEstablishAnims] = useState([]);
  const cardTransferTimersRef = useRef(new Set());
  const damageLinkEstablishTimersRef = useRef(new Map());

  const clearCardTransferAnimations = useCallback(() => {
    cardTransferTimersRef.current.forEach(timer => clearTimeout(timer));
    cardTransferTimersRef.current.clear();
    damageLinkEstablishTimersRef.current.forEach(timer => clearTimeout(timer));
    damageLinkEstablishTimersRef.current.clear();
    setCardTransfers([]);
    setDamageLinkEstablishAnims([]);
  }, []);

  useEffect(() => clearCardTransferAnimations, [clearCardTransferAnimations]);

  useEffect(() => {
    if (!anim || anim.type !== 'CARD_TRANSFER') return;

    const { fromPid, dest, toPid, count, sourceAnchor, effect } = anim;
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
    if (effect === 'damageLink' && fromPid != null && toPid != null) {
      const key = `damage-link-${fromPid}-${toPid}-${Date.now()}`;
      schedule(() => {
        setDamageLinkEstablishAnims(prev => [...prev, { id: key, key, a: fromPid, b: toPid, mode: 'establish' }]);
        const establishDuration = Number.isFinite(anim.durationMs) ? anim.durationMs : 1900;
        const timer = setTimeout(() => {
          setDamageLinkEstablishAnims(prev => prev.filter(link => link.id !== key));
          damageLinkEstablishTimersRef.current.delete(key);
        }, establishDuration + ANIM_STEP_GAP + 260);
        damageLinkEstablishTimersRef.current.set(key, timer);
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }

    schedule(() => {
      const srcPos = sourceAnchor === 'playerArea'
        ? getPlayerAreaAnchorCenter(fromPid)
        : getPlayerHandAnchorCenter(fromPid);
      const srcX = srcPos.x;
      const srcY = srcPos.y;

      let destX;
      let destY;
      if (dest === 'discard') {
        const discardPos = getPileAnchorCenter(
          '[data-discard-pile]',
          { x: window.innerWidth * 0.45, y: window.innerHeight * 0.45 }
        );
        destX = discardPos.x;
        destY = discardPos.y;
      } else if (dest === 'player') {
        const destPos = getPlayerHandAnchorCenter(toPid);
        destX = destPos.x;
        destY = destPos.y;
      } else {
        const srcPanelEl = document.querySelector(`[data-pid="${fromPid}"]`);
        const srcPanelRect = _getZoomCompensatedRect(srcPanelEl);
        destX = srcX;
        destY = srcPanelRect ? srcPanelRect.top + srcPanelRect.height * 0.25 : srcY * 0.5;
      }

      const key = `${fromPid}-${dest}-${toPid ?? 'x'}-${Date.now()}`;
      setCardTransfers(prev => [...prev, { srcX, srcY, destX, destY, count, key, effect }]);
      const timer = setTimeout(() => {
        setCardTransfers(prev => prev.filter(t => t.key !== key));
        cardTransferTimersRef.current.delete(timer);
      }, effect === 'blackGoat' ? 1700 : 750);
      cardTransferTimersRef.current.add(timer);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [anim, clearCardTransferAnimations]);

  return {
    cardTransfers,
    damageLinkEstablishAnims,
    clearCardTransferAnimations,
  };
}
