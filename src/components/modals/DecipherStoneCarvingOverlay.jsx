import React, { useEffect, useRef, useState } from 'react';
import { DDCard, DDCardBack } from '../cards';

const CARD_W = 82;
const CARD_H = 108;
const STACK_GAP = 48;

function StackedCardRow({ cards, zoneKey, dragging, readOnly, onDragStart }) {
  const count = cards.length;
  const width = count ? CARD_W + (count - 1) * STACK_GAP : CARD_W;
  return (
    <div style={{ position: 'relative', width, height: CARD_H, margin: '0 auto' }}>
      {cards.map((c, i) => (
        <div
          key={c.id}
          data-card-id={c.id}
          style={{
            position: 'absolute',
            left: i * STACK_GAP,
            top: 0,
            width: CARD_W,
            height: CARD_H,
            zIndex: i + 1,
            opacity: dragging?.card?.id === c.id ? 0.3 : 1,
            cursor: readOnly ? 'default' : 'grab',
            transition: 'transform 0.12s, opacity 0.12s',
          }}
          onMouseDown={e => onDragStart(c, zoneKey, i, e)}
          onTouchStart={e => onDragStart(c, zoneKey, i, e)}
        >
          <DDCard card={c} frameStyle={{ width: CARD_W, minWidth: CARD_W, height: CARD_H }} />
        </div>
      ))}
    </div>
  );
}

function DeckStackImage({ expansionKey }) {
  return (
    <div style={{ position: 'relative', width: 122, height: 132 }}>
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} style={{ position: 'absolute', left: i * 6, top: i * 4, zIndex: i }}>
          <DDCardBack expansionKey={expansionKey} frameStyle={{ width: 82, height: 108 }} />
        </div>
      ))}
    </div>
  );
}

export function DecipherStoneCarvingOverlay({ revealedCards, onConfirm, actorName = '你', readOnly = false, expansionKey = '地神的潜影' }) {
  const [zones, setZones] = useState({
    top: [...revealedCards],
    hand: [],
    bottom: [],
  });
  const [dragging, setDragging] = useState(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);
  const dragCardRef = useRef(null);

  const zoneLabels = {
    top: '牌堆顶',
    hand: '收入手牌',
    bottom: '牌堆底',
  };

  const zonePositions = [
    { key: 'bottom', label: '牌堆底', style: { left: '4%', top: '24%', width: '34%', height: 158 } },
    { key: 'top', label: '牌堆顶', style: { right: '4%', top: '24%', width: '34%', height: 158 } },
    { key: 'hand', label: '收入手牌', style: { left: '50%', bottom: '5%', transform: 'translateX(-50%)', width: '62%', height: 166 } },
  ];

  useEffect(() => {
    setZones({ top: [...revealedCards].reverse(), hand: [], bottom: [] });
  }, [revealedCards]);

  function findCardLocation(cardId) {
    for (const key of ['top', 'hand', 'bottom']) {
      const idx = zones[key].findIndex(c => c.id === cardId);
      if (idx >= 0) return { zone: key, idx };
    }
    return null;
  }

  function handleDragStart(card, sourceZone, idx, e) {
    if (readOnly) return;
    e.preventDefault();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;
    setDragging({ card, sourceZone, idx, offsetX: 0, offsetY: 0 });
    setDragPos({ x: clientX, y: clientY });
  }

  useEffect(() => {
    if (!dragging) return;
    function move(e) {
      const clientX = e.clientX ?? e.touches?.[0]?.clientX;
      const clientY = e.clientY ?? e.touches?.[0]?.clientY;
      setDragPos({ x: clientX, y: clientY });
    }
    function up(e) {
      const clientX = e.clientX ?? e.changedTouches?.[0]?.clientX;
      const clientY = e.clientY ?? e.changedTouches?.[0]?.clientY;
      const target = document.elementFromPoint(clientX, clientY);
      const zoneEl = target?.closest('[data-zone]');
      const targetZone = zoneEl?.dataset?.zone;
      if (targetZone) {
        const insertIndex = getInsertIndex(zoneEl, targetZone, clientX);
        moveCard(dragging.card.id, dragging.sourceZone, targetZone, insertIndex);
      }
      setDragging(null);
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
  }, [dragging]);

  function getInsertIndex(zoneEl, zoneKey, clientX) {
    const cardEls = [...zoneEl.querySelectorAll('[data-card-id]')].filter(el => el.dataset.cardId !== dragging?.card?.id);
    if (!cardEls.length) return zones[zoneKey]?.length || 0;
    for (let i = 0; i < cardEls.length; i++) {
      const rect = cardEls[i].getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) return i;
    }
    return cardEls.length;
  }

  function moveCard(cardId, fromZone, toZone, insertIndex = null) {
    setZones(prev => {
      const card = prev[fromZone]?.find(c => c.id === cardId);
      if (!card) return prev;
      const fromCards = prev[fromZone].filter(c => c.id !== cardId);
      if (toZone === 'hand' && prev.hand.filter(c => c.id !== cardId).length >= 1) return prev;
      const targetBase = fromZone === toZone ? fromCards : prev[toZone];
      const safeIndex = Math.max(0, Math.min(insertIndex ?? targetBase.length, targetBase.length));
      const targetCards = [...targetBase];
      targetCards.splice(safeIndex, 0, card);
      return {
        ...prev,
        [fromZone]: fromZone === toZone ? targetCards : fromCards,
        ...(fromZone === toZone ? {} : { [toZone]: targetCards }),
      };
    });
  }

  function handleConfirm() {
    if (zones.hand.length !== 1) return;
    onConfirm({
      handCard: zones.hand[0],
      deckTopCards: zones.top,
      deckBottomCards: zones.bottom,
    });
  }

  const canConfirm = zones.hand.length === 1;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'rgba(4,2,0,0.70)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        userSelect: 'none',
      }}
      onMouseMove={e => dragging && setDragPos({ x: e.clientX, y: e.clientY })}
    >
      <div style={{
        fontFamily: "'Cinzel',serif", color: '#e8cc88', fontSize: 16, letterSpacing: 3, marginBottom: 16,
      }}>
        {actorName} 解读石刻
      </div>
      <div style={{
        fontFamily: "'IM Fell English',serif", fontStyle: 'italic', color: '#b89858', fontSize: 12, marginBottom: 24,
      }}>
        {readOnly ? '正在解读石刻。你可以观察其安排。' : '将 1 张牌拖入“收入手牌”，其余牌拖入“牌堆顶”或“牌堆底”'}
      </div>

      <div style={{ position: 'relative', width: '94vw', maxWidth: 980, height: '72vh', maxHeight: 560, minHeight: 470 }}>
        {zonePositions.map(({ key, label, style }) => (
          <div
            key={key}
            data-zone={key}
            style={{
              position: 'absolute',
              ...style,
              border: `2px dashed ${key === 'hand' ? '#c8a96e88' : '#5a4a3a88'}`,
              borderRadius: 6,
              background: 'rgba(20,14,8,0.36)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
              paddingTop: 10,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(40,28,16,0.52)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(20,14,8,0.36)'; }}
          >
            <div style={{
              fontFamily: "'Cinzel',serif", color: '#8a7a5a', fontSize: 11, letterSpacing: 2, marginBottom: 10,
            }}>
              {label}
            </div>
            <div style={{
              width: '100%', padding: '0 8px 8px', minHeight: CARD_H, display: 'flex', alignItems: 'center', justifyContent: 'center', overflowX: 'auto', overflowY: 'visible',
            }}>
              <StackedCardRow cards={zones[key]} zoneKey={key} dragging={dragging} readOnly={readOnly} onDragStart={handleDragStart} />
            </div>
          </div>
        ))}

        <div style={{
          position: 'absolute', left: '50%', top: '17%', transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <DeckStackImage expansionKey={expansionKey} />
          <span style={{ fontFamily: "'Cinzel',serif", color: '#6f5b3a', fontSize: 10, letterSpacing: 2, marginTop: 4 }}>牌堆</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 24 }}>
        <button
          onClick={handleConfirm}
          disabled={!canConfirm || readOnly}
          style={{
            padding: '8px 22px', background: canConfirm && !readOnly ? '#1a1208' : '#0e0904',
            border: `2px solid ${canConfirm && !readOnly ? '#c8a96e' : '#5a4a3a'}`,
            color: canConfirm && !readOnly ? '#c8a96e' : '#5a4a3a',
            fontFamily: "'Cinzel',serif", fontSize: 12, letterSpacing: 1, borderRadius: 3, cursor: canConfirm && !readOnly ? 'pointer' : 'not-allowed',
          }}
        >{readOnly ? '等待确认' : '确认'}</button>
      </div>

      {dragging && (
        <div
          ref={dragCardRef}
          style={{
            position: 'fixed', left: dragPos.x - CARD_W / 2, top: dragPos.y - CARD_H / 2,
            width: CARD_W, height: CARD_H, zIndex: 1000, pointerEvents: 'none',
            filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.8))',
            transform: 'scale(1.08)',
          }}
        >
          <DDCard card={dragging.card} frameStyle={{ width: CARD_W, minWidth: CARD_W, height: CARD_H }} />
        </div>
      )}
    </div>
  );
}
