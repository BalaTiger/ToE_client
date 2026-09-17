import { buildPublicUrl } from '../../utils/url';
import './encounter-skulls.css';

// This is the accumulated skull count, not the distinct god-encounter counter.
export function EncounterSkulls({ count, playerIndex, dimmed = false }) {
  const skullCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (!skullCount) return null;
  return (
    <div
      className="toe-encounter-skulls"
      data-encounter-skulls={playerIndex}
      role="img"
      aria-label={`骷髅标记：${skullCount} 枚`}
      style={{ '--toe-skull-columns': Math.min(skullCount, 8), opacity: dimmed ? 0.32 : undefined, filter: dimmed ? 'grayscale(0.85) brightness(0.6)' : undefined }}
    >
      {Array.from({ length: skullCount }, (_, index) => (
        <img key={index} src={buildPublicUrl('/img/ui/coastal/encounter-skull.webp')} alt="" draggable={false} />
      ))}
    </div>
  );
}
