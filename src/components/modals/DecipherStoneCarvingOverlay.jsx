import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DDCard, DDCardBack } from '../cards';
import { CARD_FACE_RATIO } from '../cards/CardFaceAssets';

const CARD_W = 82;
const CARD_H = CARD_W * CARD_FACE_RATIO;
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
    <div style={{ position: 'relative', width: 104, height: CARD_H + 24 }}>
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} style={{ position: 'absolute', left: i * 3, top: i * 4, zIndex: i }}>
          <DDCardBack expansionKey={expansionKey} frameStyle={{ width: CARD_W, height: CARD_H }} />
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

  const zonePositions = [
    { key: 'bottom', label: '牌堆底', style: { gridColumn: 1, gridRow: 1 } },
    { key: 'top', label: '牌堆顶', style: { gridColumn: 3, gridRow: 1 } },
    { key: 'hand', label: '收入手牌 · 选择 1 张', style: { gridColumn: '1 / -1', gridRow: 2 } },
  ];

  function handleDragStart(card, sourceZone, idx, e) {
    if (readOnly) return;
    e.preventDefault();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;
    setDragging({ card, sourceZone, idx, offsetX: 0, offsetY: 0 });
    setDragPos({ x: clientX, y: clientY });
  }

  const moveCard = useCallback((cardId, fromZone, toZone, insertIndex = null) => {
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
  }, []);

  const getInsertIndex = useCallback((zoneEl, zoneKey, clientX) => {
    const cardEls = [...zoneEl.querySelectorAll('[data-card-id]')].filter(el => el.dataset.cardId !== dragging?.card?.id);
    if (!cardEls.length) return zones[zoneKey]?.length || 0;
    for (let i = 0; i < cardEls.length; i++) {
      const rect = cardEls[i].getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) return i;
    }
    return cardEls.length;
  }, [dragging?.card?.id, zones]);

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
  }, [dragging, getInsertIndex, moveCard]);

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
      className="toe-dialog-backdrop"
      ref={containerRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        userSelect: 'none',
      }}
      onMouseMove={e => dragging && setDragPos({ x: e.clientX, y: e.clientY })}
    >
      <div className="toe-dialog" data-ui-dialog="decipher" role="dialog" aria-label="解读石刻" style={{ width: 'min(94vw, 980px)', maxHeight: '94dvh', overflowY: 'auto', padding: '24px clamp(14px, 3vw, 32px)', textAlign: 'center' }}>
      <div className="toe-title" style={{
        fontSize: 24, letterSpacing: 3, marginBottom: 12,
      }}>
        {actorName} 解读石刻
      </div>
      <div className="toe-subtitle" style={{
        fontSize: 14, lineHeight: 1.7, marginBottom: 24,
      }}>
        {readOnly ? '正在解读石刻。你可以观察其安排。' : '将 1 张牌拖入“收入手牌”，其余牌拖入“牌堆顶”或“牌堆底”'}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', gap: '20px 12px', width: '100%' }}>
        {zonePositions.map(({ key, label, style }) => (
          <div
            className="toe-panel toe-decipher-zone"
            key={key}
            data-zone={key}
            style={{
              ...style,
              borderStyle: 'dashed', minWidth: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
              paddingTop: 14,
              transition: 'background 0.15s',
            }}
          >
            <div className="toe-subtitle" style={{
              fontSize: 13, letterSpacing: 2, marginBottom: 12,
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
          gridColumn: 2, gridRow: 1, alignSelf: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <DeckStackImage expansionKey={expansionKey} />
          <span className="toe-subtitle" style={{ fontSize: 12, letterSpacing: 2, marginTop: 8 }}>牌堆</span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 24 }}>
        <button
          className="toe-button toe-button-primary"
          type="button"
          onClick={handleConfirm}
          disabled={!canConfirm || readOnly}
          style={{
            minWidth: 220, padding: '12px 28px', fontSize: 16, letterSpacing: 2,
          }}
        >{readOnly ? '等待确认' : '确认'}</button>
      </div>
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
