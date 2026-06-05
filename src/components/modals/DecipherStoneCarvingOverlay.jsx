import React, { useEffect, useRef, useState } from 'react';
import { MiniCardFace } from '../cards';

export function DecipherStoneCarvingOverlay({ revealedCards, onConfirm, actorName = '你', readOnly = false }) {
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
    { key: 'bottom', label: '牌堆底', style: { left: '8%', top: '20%', width: '22%', height: '55%' } },
    { key: 'top', label: '牌堆顶', style: { right: '8%', top: '20%', width: '22%', height: '55%' } },
    { key: 'hand', label: '收入手牌', style: { left: '50%', bottom: '8%', transform: 'translateX(-50%)', width: '55%', height: '28%' } },
  ];

  useEffect(() => {
    setZones({ top: [...revealedCards], hand: [], bottom: [] });
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
        background: 'rgba(4,2,0,0.92)',
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

      <div style={{ position: 'relative', width: '92vw', maxWidth: 900, height: '72vh', maxHeight: 520 }}>
        {zonePositions.map(({ key, label, style }) => (
          <div
            key={key}
            data-zone={key}
            style={{
              position: 'absolute',
              ...style,
              border: `2px dashed ${key === 'hand' ? '#c8a96e88' : '#5a4a3a88'}`,
              borderRadius: 6,
              background: 'rgba(20,14,8,0.55)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
              paddingTop: 10,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(40,28,16,0.7)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(20,14,8,0.55)'; }}
          >
            <div style={{
              fontFamily: "'Cinzel',serif", color: '#8a7a5a', fontSize: 11, letterSpacing: 2, marginBottom: 10,
            }}>
              {label}
            </div>
            <div style={{
              display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', width: '100%', padding: '0 8px',
            }}>
              {zones[key].map((c, i) => (
                <div
                  key={c.id}
                  data-card-id={c.id}
                  style={{
                    width: 64, height: 88, flexShrink: 0,
                    opacity: dragging?.card?.id === c.id ? 0.3 : 1,
                    cursor: readOnly ? 'default' : 'grab',
                    transform: dragging?.card?.id === c.id ? 'scale(1.05)' : 'none',
                    transition: 'transform 0.12s, opacity 0.12s',
                  }}
                  onMouseDown={e => handleDragStart(c, key, i, e)}
                  onTouchStart={e => handleDragStart(c, key, i, e)}
                >
                  <MiniCardFace card={c} width={64} height={88} ambient={false} />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div style={{
          position: 'absolute', left: '50%', top: '20%', transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <div style={{
            width: 70, height: 94,
            border: '2px solid #5a4a3a',
            borderRadius: 6,
            background: 'linear-gradient(145deg, #1a1208, #0e0904)',
            boxShadow: 'inset 0 0 18px #000, 0 0 18px #3a2a1a55',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontFamily: "'Cinzel',serif", color: '#5a4a3a', fontSize: 10, letterSpacing: 1 }}>牌堆</span>
          </div>
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
            position: 'fixed', left: dragPos.x - 32, top: dragPos.y - 44,
            width: 64, height: 88, zIndex: 1000, pointerEvents: 'none',
            filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.8))',
            transform: 'scale(1.08)',
          }}
        >
          <MiniCardFace card={dragging.card} width={64} height={88} ambient={false} />
        </div>
      )}
    </div>
  );
}
