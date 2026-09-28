import React from 'react';
import { getPileCardAnchor } from '../../utils/dom';
import { CARD_FLIGHT_POSE, getCardFlightStyle } from './cardSizing';
import { GenericAnimOverlay } from './GenericAnimOverlay';
import { CardBackLayer } from '../cards/AnimatedCardBack';

const BROADCAST_MS = 720;

export function DeckReshuffleOverlay({ anim, exiting, expansionKey = '地神的潜影' }) {
  const [showTransfer, setShowTransfer] = React.useState(false);
  const [path, setPath] = React.useState(null);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setShowTransfer(true), BROADCAST_MS);
    return () => window.clearTimeout(timer);
  }, []);

  React.useLayoutEffect(() => {
    const measure = () => {
      const from = getPileCardAnchor('[data-discard-pile]', {
        x: window.innerWidth * 0.58,
        y: window.innerHeight * 0.48,
      });
      const to = getPileCardAnchor('[data-deck-pile]', {
        x: window.innerWidth * 0.42,
        y: window.innerHeight * 0.48,
      });
      const flight = getCardFlightStyle(from, to);
      setPath({
        ...flight,
        left: from.x - flight.width / 2,
        top: from.y - flight.height / 2,
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  if (!showTransfer) return <GenericAnimOverlay anim={anim} exiting={false} />;

  return (
    <div className={`deck-reshuffle-transfer${exiting ? ' deck-reshuffle-transfer-exiting' : ''}`}>
      <style>{`
        @keyframes deckReshuffleFly {
          0% { opacity: 0; transform: translate3d(0,0,0) ${CARD_FLIGHT_POSE.from}; }
          12% { opacity: 1; }
          55% { opacity: 1; transform: translate3d(calc(var(--tx) * .55),calc(var(--ty) * .55),0) ${CARD_FLIGHT_POSE.mid}; }
          78% { opacity: 1; }
          100% { opacity: 0; transform: translate3d(var(--tx),var(--ty),0) ${CARD_FLIGHT_POSE.to}; }
        }
        @keyframes deckReshuffleCaption {
          0% { opacity: 0; transform: translateY(8px); }
          18%, 78% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; }
        }
      `}</style>
      {path && Array.from({ length: 7 }).map((_, index) => (
        <div
          key={index}
          className="deck-reshuffle-flying-card"
          style={{
            ...path,
            borderRadius: 7,
            overflow: 'hidden',
            '--mid-rotation': `${(index - 3) * 5}deg`,
            animationDelay: `${index * 55}ms`,
          }}
        >
          <CardBackLayer expansionKey={expansionKey}/>
        </div>
      ))}
      <div className="deck-reshuffle-caption">弃牌堆洗回牌堆</div>
    </div>
  );
}
