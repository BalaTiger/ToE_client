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
  const aspectRatio = '4 / 3';
  const layers = panel
    ? [
        { scale: 1.14, opacity: 0.22, blur: 0.45, delay: 0 },
        { scale: 1.78, opacity: 0.15, blur: 1.25, delay: 170 },
        { scale: 2.62, opacity: 0.09, blur: 2.55, delay: 380 },
      ]
    : [
        { scale: 1.08, opacity: 0.26, blur: 0.4, delay: 0 },
        { scale: 1.72, opacity: 0.13, blur: 1.45, delay: 230 },
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
      <span
        className="toe-god-highlight-blend toe-god-highlight-soft-edge"
        style={{
          position: 'absolute',
          inset: panel ? '-54%' : '-42%',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.16) 0%, rgba(247,213,139,0.11) 28%, rgba(160,66,255,0.07) 52%, transparent 76%)',
          opacity: 0,
          transformOrigin: 'center',
          willChange: 'transform, opacity',
          animation: `toeGodHighlightBurstCore ${durationMs}ms cubic-bezier(0.16,0.92,0.28,1) ${delayMs}ms both`,
          '--toe-god-highlight-intensity': intensity,
        }}
      />
      {layers.map((layer, index) => (
        <span
          key={index}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            height: panel ? '184%' : '156%',
            aspectRatio,
            transform: 'translate3d(-50%,-50%,0)',
            transformOrigin: 'center',
            overflow: 'visible',
          }}
        >
          <img
            className="toe-god-highlight-blend toe-god-highlight-soft-edge"
            src={src}
            alt=""
            draggable={false}
            decoding="async"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: fit,
              objectPosition: 'center',
              opacity: 0,
              transformOrigin: 'center',
              filter: `brightness(${1.28 + index * 0.1}) saturate(${1.24 + index * 0.1}) blur(${layer.blur}px) drop-shadow(0 0 ${panel ? 14 : 22}px rgba(255,226,160,0.28))`,
              willChange: 'transform, opacity',
              animation: `toeGodHighlightBurstLayer ${durationMs}ms cubic-bezier(0.13,0.85,0.25,1) ${delayMs + layer.delay}ms both`,
              '--toe-god-highlight-scale': layer.scale,
              '--toe-god-highlight-opacity': layer.opacity,
              '--toe-god-highlight-intensity': intensity,
            }}
          />
        </span>
      ))}
    </div>
  );
}

export { GodHighlightBurst };
