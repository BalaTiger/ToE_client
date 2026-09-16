import { CARD_FACE_RATIO } from '../cards/CardFaceAssets';
import { getPileCardAnchor } from '../../utils/dom';
import { CARD_PERSPECTIVE_RATIO } from '../../utils/cardPlane';

// Screen translation stays outside this fragment. Scaling before perspective
// keeps the same projected silhouette when one sprite serves two native sizes.
export const CARD_FLIGHT_POSE = Object.fromEntries(['from', 'mid', 'to'].map(stage => [stage,
  `scale(var(--${stage}-scale,1)) ${stage === 'mid'
    ? 'perspective(var(--flight-perspective,1200px)) translateZ(var(--flight-depth,0px)) rotateX(var(--mid-tilt,0deg)) rotateY(var(--flight-bank,0deg)) rotateZ(var(--mid-rotation,0deg))'
    : `var(--${stage}-plane,perspective(var(--flight-perspective,1200px)) rotateX(var(--${stage}-tilt,0deg)) rotateZ(var(--${stage}-rotation,0deg)))`}`,
]));

function endpointPlane(anchor, scale) {
  if (!anchor.projection) return undefined;
  const { a, b, c, d, e, f } = anchor.projection;
  // The outer scale serves a common sprite size; adjust the perspective row
  // so it still projects native card coordinates at this endpoint.
  return `matrix3d(${a},${e},0,${c * scale},${b},${f},0,${d * scale},0,0,1,0,0,0,0,1)`;
}

export function getStandardFlyingCardSize() {
  const width = typeof window === 'undefined' ? 120 : getPileCardAnchor('[data-deck-pile]').width;
  return { width, height: width * CARD_FACE_RATIO, scale: width / 82 };
}

// Income keeps its visible side facing the camera; draw/discard pitch follows
// the measured endpoint planes instead of guessing from the change in size.
export function getCardFlightStyle(from, to, minimumWidth = 0, pitch = 'arc') {
  const fromWidth = from.width || getStandardFlyingCardSize().width;
  const toWidth = to.width || fromWidth;
  const width = Math.max(fromWidth, toWidth, minimumWidth);
  const direction = Math.abs(toWidth - fromWidth) > width * .08 ? Math.sign(toWidth - fromWidth) : 0;
  const fromTilt = pitch === 'camera' ? 0 : from.tilt || 0;
  const toTilt = pitch === 'camera' ? 0 : to.tilt || 0;
  return {
    width, height: width * CARD_FACE_RATIO,
    aspectRatio: '392 / 590', boxSizing: 'border-box',
    '--tx': `${to.x - from.x}px`, '--ty': `${to.y - from.y}px`,
    '--from-scale': fromWidth / width, '--to-scale': toWidth / width,
    '--from-plane': pitch === 'camera' ? undefined : endpointPlane(from, fromWidth / width),
    '--to-plane': pitch === 'camera' ? undefined : endpointPlane(to, toWidth / width),
    '--mid-scale': (fromWidth + (toWidth - fromWidth) * .55) / width,
    '--from-rotation': `${from.rotation || 0}deg`, '--to-rotation': `${to.rotation || 0}deg`,
    '--mid-rotation': `${((from.rotation || 0) + (to.rotation || 0)) / 2}deg`,
    '--flight-perspective': `${width * CARD_PERSPECTIVE_RATIO}px`,
    '--flight-depth': `${width * (direction < 0 ? -.5 : .65)}px`,
    '--flight-bank': `${pitch === 'arc' ? Math.max(-6, Math.min(6, (to.x - from.x) / width * 2)) : 0}deg`,
    '--from-tilt': `${fromTilt}deg`, '--to-tilt': `${toTilt}deg`,
    '--mid-tilt': `${pitch === 'arc'
      ? Math.max(-16, Math.min(32, (fromTilt + toTilt) / 2 + (direction < 0 ? 16 : -12)))
      : fromTilt + (toTilt - fromTilt) * .55}deg`,
  };
}
