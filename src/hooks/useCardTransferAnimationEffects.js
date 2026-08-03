import { useCallback, useEffect, useRef, useState } from 'react';
import { ANIM_STEP_GAP } from '../components/anim/constants';
import { _getZoomCompensatedRect, getGodChoiceAnchorCenter, getPileAnchorCenter, getPlayerAreaAnchorCenter, getPlayerGodPowerAnchorCenter, getPlayerHandAnchorCenter } from '../utils/dom';

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

    const resolveSourcePos = (transfer) => {
      if (transfer?.sourcePoint && Number.isFinite(transfer.sourcePoint.x) && Number.isFinite(transfer.sourcePoint.y)) {
        return transfer.sourcePoint;
      }
      const transferFromPid = transfer?.fromPid;
      const transferSourceAnchor = transfer?.sourceAnchor;
      return transferSourceAnchor === 'reveal'
        ? { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 }
        : transferSourceAnchor === 'godPower'
        ? getPlayerGodPowerAnchorCenter(transferFromPid)
        : transferSourceAnchor === 'playerArea'
          ? getPlayerAreaAnchorCenter(transferFromPid)
          : transferSourceAnchor === 'godChoice'
            ? getGodChoiceAnchorCenter()
            : getPlayerHandAnchorCenter(transferFromPid);
    };

    const resolveDestPos = (transfer, srcPos) => {
      const transferDest = transfer?.dest;
      if (transfer?.destPoint && Number.isFinite(transfer.destPoint.x) && Number.isFinite(transfer.destPoint.y)) {
        return transfer.destPoint;
      }
      if (transferDest === 'discard') {
        return getPileAnchorCenter(
          '[data-discard-pile]',
          { x: window.innerWidth * 0.45, y: window.innerHeight * 0.45 }
        );
      }
      if (transferDest === 'deck' || transferDest === 'deckTop' || transferDest === 'deckBottom') {
        const deckPos = getPileAnchorCenter(
          '[data-deck-pile]',
          { x: window.innerWidth * 0.94 - 35, y: window.innerHeight * 0.08 }
        );
        const deckOffset = transferDest === 'deckTop' ? -7 : transferDest === 'deckBottom' ? 7 : 0;
        return { x: deckPos.x, y: deckPos.y + deckOffset };
      }
      if (transferDest === 'player') {
        return getPlayerHandAnchorCenter(transfer?.toPid);
      }
      const srcPanelEl = document.querySelector(`[data-pid="${transfer?.fromPid}"]`);
      const srcPanelRect = _getZoomCompensatedRect(srcPanelEl);
      return {
        x: srcPos.x,
        y: srcPanelRect ? srcPanelRect.top + srcPanelRect.height * 0.25 : srcPos.y * 0.5,
      };
    };

    const buildTransfer = (transfer, idx = 0) => {
      const srcPos = resolveSourcePos(transfer);
      const destPos = resolveDestPos(transfer, srcPos);
      const key = `${transfer?.fromPid ?? 'x'}-${transfer?.dest ?? 'x'}-${transfer?.toPid ?? 'x'}-${Date.now()}-${idx}`;
      return {
        srcX: srcPos.x,
        srcY: srcPos.y,
        destX: destPos.x,
        destY: destPos.y,
        count: transfer?.count ?? 1,
        key,
        effect: transfer?.effect,
        cards: transfer?.cards,
        faceUp: transfer?.faceUp,
      };
    };

    const { fromPid, dest, toPid, count, sourceAnchor, effect, cards, faceUp } = anim;
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
      const transfers = Array.isArray(anim.transfers) && anim.transfers.length
        ? anim.transfers.map((transfer, idx) => buildTransfer({
          fromPid,
          dest,
          toPid,
          count,
          sourceAnchor,
          effect,
          cards,
          faceUp,
          ...transfer,
        }, idx))
        : [buildTransfer({ fromPid, dest, toPid, count, sourceAnchor, effect, cards })];
      const cleanupMs = Number.isFinite(anim.durationMs)
        ? anim.durationMs + ANIM_STEP_GAP + 100
        : effect === 'blackGoat' ? 1700 : effect === 'tsgSlime' ? 950 : 750;
      setCardTransfers(prev => [...prev, ...transfers]);
      const timer = setTimeout(() => {
        const transferKeys = new Set(transfers.map(t => t.key));
        setCardTransfers(prev => prev.filter(t => !transferKeys.has(t.key)));
        cardTransferTimersRef.current.delete(timer);
      }, cleanupMs);
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
