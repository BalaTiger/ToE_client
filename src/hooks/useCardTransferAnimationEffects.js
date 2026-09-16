import { useCallback, useEffect, useRef, useState } from 'react';
import { ANIM_STEP_GAP } from '../components/anim/constants';
import { getGodChoiceCardAnchor, getPileCardAnchor, getPlayerAreaCardAnchor, getPlayerGodPowerAnchorCenter, getPlayerHandCardAnchor, getRevealCardAnchor } from '../utils/dom';

export function resolveCardTransferFaceUp(transfer = {}, card = transfer.cards?.[0]) {
  if (transfer.faceUp != null) return transfer.faceUp;
  if (transfer.dest === 'discard') return true;
  if (!card || card._back) return false;
  if (transfer.dest !== 'player') return true;
  return transfer.toPid === 0 || !!(card.isBlackGoatYoung || card.isTsathogguaSlime);
}

export function resolveCardTransferAnchors(transfer, card) {
  const hand = getPlayerHandCardAnchor(transfer.fromPid ?? 0, card);
  const source = transfer.sourceAnchor === 'reveal' ? getRevealCardAnchor()
    : transfer.sourceAnchor === 'discard' ? getPileCardAnchor('[data-discard-pile]')
    : transfer.sourceAnchor === 'deck' ? getPileCardAnchor('[data-deck-pile]')
    : transfer.sourceAnchor === 'godPower' ? { ...hand, ...getPlayerGodPowerAnchorCenter(transfer.fromPid) }
    : transfer.sourceAnchor === 'playerArea' ? getPlayerAreaCardAnchor(transfer.fromPid ?? 0, card, transfer.effect === 'draw')
    : transfer.sourceAnchor === 'godChoice' ? getGodChoiceCardAnchor(card)
    : hand;
  const from = Number.isFinite(transfer.sourcePoint?.x) && Number.isFinite(transfer.sourcePoint?.y)
    ? { ...source, ...transfer.sourcePoint } : source;
  const destination = transfer.dest === 'discard' ? getPileCardAnchor('[data-discard-pile]')
    : ['deck', 'deckTop', 'deckBottom'].includes(transfer.dest) ? getPileCardAnchor('[data-deck-pile]')
    : transfer.dest === 'player' ? getPlayerHandCardAnchor(transfer.toPid ?? 0, card)
    : getPlayerAreaCardAnchor(transfer.fromPid ?? 0);
  const to = Number.isFinite(transfer.destPoint?.x) && Number.isFinite(transfer.destPoint?.y)
    ? { ...destination, ...transfer.destPoint } : destination;
  return { from, to };
}

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

    const buildTransfer = (transfer, idx = 0) => {
      const paths = Array.from({ length: Math.max(1, transfer.count ?? 1) }, (_, cardIndex) => resolveCardTransferAnchors(transfer, transfer.cards?.[cardIndex]));
      const { from: srcPos, to: destPos } = paths[0];
      const key = `${transfer?.fromPid ?? 'x'}-${transfer?.dest ?? 'x'}-${transfer?.toPid ?? 'x'}-${Date.now()}-${idx}`;
      return {
        srcX: srcPos.x,
        srcY: srcPos.y,
        destX: destPos.x,
        destY: destPos.y,
        srcWidth: srcPos.width, destWidth: destPos.width,
        srcRotation: srcPos.rotation, destRotation: destPos.rotation,
        srcTilt: srcPos.tilt, destTilt: destPos.tilt,
        srcProjection: srcPos.projection, destProjection: destPos.projection,
        paths,
        count: transfer?.count ?? 1,
        key,
        effect: transfer?.effect,
        cards: transfer?.cards,
        keepFacing: transfer.dest === 'player',
        // Resolve per card so public tokens do not reveal ordinary cards in a batch.
        cardFaceUp: paths.map((_, cardIndex) => resolveCardTransferFaceUp(transfer, transfer.cards?.[cardIndex] ?? null)),
        faceUp: resolveCardTransferFaceUp(transfer),
      };
    };

    const { fromPid, toPid, effect } = anim;
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
          ...anim,
          ...transfer,
        }, idx))
        : [buildTransfer(anim)];
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
