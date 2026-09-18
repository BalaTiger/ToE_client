import { buildPublicUrl } from '../../utils/url';
import './encounter-skulls.css';

// This is the accumulated skull count, not the distinct god-encounter counter.
export function EncounterSkulls({ count, playerIndex, dimmed = false, variant = 'frame' }) {
  const skullCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (!skullCount) return null;
  const portraitArc = variant === 'portrait-arc';
  const arcRadius = 22;
  const arcStep = Math.min(28, 130 / Math.max(1, skullCount - 1)) * Math.PI / 180;
  // All skulls stay on the same left rim. Shrink with the available chord
  // spacing instead of wrapping into another arc or hiding accumulated skulls.
  const arcSize = skullCount <= 5 ? 10 : 2 * arcRadius * Math.sin(arcStep / 2) * 0.9;
  return (
    <div
      className="toe-encounter-skulls"
      data-encounter-skulls={playerIndex}
      data-skull-layout={variant}
      role="img"
      aria-label={`骷髅标记：${skullCount} 枚`}
      style={{ '--toe-skull-columns': Math.min(skullCount, 8), opacity: dimmed ? 0.32 : undefined, filter: dimmed ? 'grayscale(0.85) brightness(0.6)' : undefined }}
    >
      {Array.from({ length: skullCount }, (_, index) => {
        const angle = (index - (skullCount - 1) / 2) * arcStep;
        return <img key={index} src={buildPublicUrl('/img/ui/coastal/encounter-skull.webp')} alt="" draggable={false}
          style={portraitArc ? {
            left: `${(25 - Math.cos(angle) * arcRadius) * 2}%`,
            top: `${(25.5 + Math.sin(angle) * arcRadius) / 51 * 100}%`,
            width: `${arcSize * 2}%`,
          } : undefined} />;
      })}
    </div>
  );
}
