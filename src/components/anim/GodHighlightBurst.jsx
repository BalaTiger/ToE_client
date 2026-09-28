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

// Highlights are GPU-heavy because they use expanding, blended image layers.
// A single global channel prevents two independently mounted UI areas (the
// card reveal and a player panel) from compositing them at the same time.
let activeHighlightId = null;
const highlightChannelListeners = new Set();

function activateHighlight(id) {
  activeHighlightId = id;
  highlightChannelListeners.forEach(listener => listener(id));
}

function releaseHighlight(id) {
  if (activeHighlightId !== id) return;
  activeHighlightId = null;
  highlightChannelListeners.forEach(listener => listener(null));
}

function subscribeHighlightChannel(listener) {
  highlightChannelListeners.add(listener);
  return () => highlightChannelListeners.delete(listener);
}

function getGodHighlightPath(godKey) {
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
  const instanceId = React.useId();
  const [isPlaying, setIsPlaying] = React.useState(false);

  React.useEffect(() => {
    if (!path) return undefined;
    const id = instanceId;
    const unsubscribe = subscribeHighlightChannel(activeId => {
      if (activeId !== id) setIsPlaying(false);
    });
    const startTimer = setTimeout(() => {
      activateHighlight(id);
      setIsPlaying(true);
    }, Math.max(0, delayMs));
    const stopTimer = setTimeout(() => {
      releaseHighlight(id);
      setIsPlaying(false);
    }, Math.max(0, delayMs) + durationMs);
    return () => {
      clearTimeout(startTimer);
      clearTimeout(stopTimer);
      unsubscribe();
      releaseHighlight(id);
    };
  }, [delayMs, durationMs, instanceId, path]);

  if (!path) return null;
  if (!isPlaying) return null;

  const src = buildPublicUrl(path);
  const aspectRatio = '4 / 3';
  const layers = panel
    ? [
        { scale: 1.14, opacity: 0.22, blur: 0.45, delay: 0 },
        { scale: 1.92, opacity: 0.14, blur: 1.55, delay: 180 },
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
          animation: `toeGodHighlightBurstCore ${durationMs}ms cubic-bezier(0.16,0.92,0.28,1) both`,
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
            className="toe-god-highlight-blend"
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
              // The art is already alpha-cut; masking and drop-shadowing each
              // expanding layer forced separate, large offscreen paint passes.
              // Keep the color treatment and the outer-layer blur, while the
              // shared radial core supplies the soft glow.
              filter: `brightness(${1.28 + index * 0.1}) saturate(${1.24 + index * 0.1})${layer.blur > 0.5 ? ` blur(${layer.blur}px)` : ''}`,
              willChange: 'transform, opacity',
              backfaceVisibility: 'hidden',
              animation: `toeGodHighlightBurstLayer ${durationMs}ms cubic-bezier(0.13,0.85,0.25,1) ${layer.delay}ms both`,
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
