import React from 'react';
import { getPileAnchorCenter } from '../../utils/dom';
import { getStandardFlyingCardSize } from './cardSizing';
import { GenericAnimOverlay } from './GenericAnimOverlay';

const BROADCAST_MS = 720;

export function DeckReshuffleOverlay({ anim, exiting }) {
  const [showTransfer, setShowTransfer] = React.useState(false);
  const [path, setPath] = React.useState(null);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setShowTransfer(true), BROADCAST_MS);
    return () => window.clearTimeout(timer);
  }, []);

  React.useLayoutEffect(() => {
    const measure = () => {
      const from = getPileAnchorCenter('[data-discard-pile]', {
        x: window.innerWidth * 0.58,
        y: window.innerHeight * 0.48,
      });
      const to = getPileAnchorCenter('[data-deck-pile]', {
        x: window.innerWidth * 0.42,
        y: window.innerHeight * 0.48,
      });
      const size = getStandardFlyingCardSize();
      setPath({
        left: from.x - size.width / 2,
        top: from.y - size.height / 2,
        width: size.width,
        height: size.height,
        '--reshuffle-x': `${to.x - from.x}px`,
        '--reshuffle-y': `${to.y - from.y}px`,
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
          0% { opacity: 0; transform: translate3d(0,0,0) rotate(var(--reshuffle-rot)) scale(.94); }
          12% { opacity: 1; }
          78% { opacity: 1; }
          100% { opacity: 0; transform: translate3d(var(--reshuffle-x),var(--reshuffle-y),0) rotate(0deg) scale(.9); }
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
            '--reshuffle-rot': `${(index - 3) * 5}deg`,
            animationDelay: `${index * 55}ms`,
          }}
        >
          <div className="deck-reshuffle-card-back">✦</div>
        </div>
      ))}
      <div className="deck-reshuffle-caption">弃牌堆洗回牌堆</div>
    </div>
  );
}
