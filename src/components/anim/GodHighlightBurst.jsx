import React from 'react';
import { buildPublicUrl } from '../../utils/url';

const GOD_HIGHLIGHT_KEYS = new Set([
  'APO',
  'CTH',
  'DIX',
  'GOR',
  'HAS',
  'KTH',
  'NYA',
  'ORO',
  'SHU',
  'TRA',
  'TSG',
  'VAN',
  'VRI',
  'XUA',
  'ZHU',
]);

export function getGodHighlightPath(godKey) {
  const normalized = String(godKey || '').trim().toUpperCase();
  if (!GOD_HIGHLIGHT_KEYS.has(normalized)) return null;
  return `/img/card/highlight/${normalized.toLowerCase()}.webp`;
}

function GodHighlightBurst({
  godKey,
  fit = 'cover',
  delayMs = 0,
  durationMs = 980,
  intensity = 1,
  panel = false,
  style,
}) {
  const path = getGodHighlightPath(godKey);
  if (!path) return null;

  const src = buildPublicUrl(path);
  const layers = panel
    ? [
        { scale: 1.14, opacity: 0.22, blur: 0.45, delay: 0 },
        { scale: 1.78, opacity: 0.15, blur: 1.25, delay: 170 },
        { scale: 2.62, opacity: 0.09, blur: 2.55, delay: 380 },
      ]
    : [
        { scale: 1.24, opacity: 0.27, blur: 0.4, delay: 0 },
        { scale: 1.98, opacity: 0.17, blur: 1.25, delay: 190 },
        { scale: 3.08, opacity: 0.1, blur: 2.8, delay: 430 },
      ];

  return (
    <div
      className="toe-god-highlight-burst"
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'visible',
        borderRadius: panel ? 3 : 5,
        isolation: 'isolate',
        zIndex: panel ? 7 : 12,
        ...style,
      }}
    >
      <style>{`
        @keyframes toeGodHighlightBurstLayer {
          0% { opacity: 0; transform: translate3d(0,0,0) scale(0.84); filter: brightness(1.08) saturate(1.05) blur(var(--toe-god-highlight-blur)); }
          18% { opacity: calc(var(--toe-god-highlight-opacity) * var(--toe-god-highlight-intensity)); }
          58% { opacity: calc(var(--toe-god-highlight-opacity) * 0.62 * var(--toe-god-highlight-intensity)); transform: translate3d(0,0,0) scale(var(--toe-god-highlight-scale)); filter: brightness(1.55) saturate(1.34) blur(var(--toe-god-highlight-blur)); }
          100% { opacity: 0; transform: translate3d(0,0,0) scale(calc(var(--toe-god-highlight-scale) * 1.22)); filter: brightness(1.14) saturate(1.08) blur(calc(var(--toe-god-highlight-blur) + 1.8px)); }
        }
        @keyframes toeGodHighlightBurstCore {
          0% { opacity: 0; transform: scale(0.4); }
          24% { opacity: calc(0.18 * var(--toe-god-highlight-intensity)); }
          100% { opacity: 0; transform: scale(2.18); }
        }
        .toe-god-highlight-blend { mix-blend-mode: screen; }
        @supports (mix-blend-mode: plus-lighter) {
          .toe-god-highlight-blend { mix-blend-mode: plus-lighter; }
        }
      `}</style>
      <span
        className="toe-god-highlight-blend"
        style={{
          position: 'absolute',
          inset: panel ? '-38%' : '-48%',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.16) 0%, rgba(247,213,139,0.11) 28%, rgba(160,66,255,0.07) 52%, transparent 76%)',
          opacity: 0,
          transformOrigin: 'center',
          animation: `toeGodHighlightBurstCore ${durationMs}ms cubic-bezier(0.16,0.92,0.28,1) ${delayMs}ms both`,
          '--toe-god-highlight-intensity': intensity,
        }}
      />
      {layers.map((layer, index) => (
        <img
          key={index}
          className="toe-god-highlight-blend"
          src={src}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            inset: panel ? '-22%' : '-20%',
            width: panel ? '144%' : '140%',
            height: panel ? '144%' : '140%',
            objectFit: fit,
            objectPosition: 'center',
            opacity: 0,
            transformOrigin: 'center',
            filter: `brightness(${1.2 + index * 0.08}) saturate(${1.18 + index * 0.12}) drop-shadow(0 0 ${panel ? 14 : 22}px rgba(255,226,160,0.28))`,
            animation: `toeGodHighlightBurstLayer ${durationMs}ms cubic-bezier(0.13,0.85,0.25,1) ${delayMs + layer.delay}ms both`,
            '--toe-god-highlight-scale': layer.scale,
            '--toe-god-highlight-opacity': layer.opacity,
            '--toe-god-highlight-blur': `${layer.blur}px`,
            '--toe-god-highlight-intensity': intensity,
          }}
        />
      ))}
    </div>
  );
}

export { GodHighlightBurst };
