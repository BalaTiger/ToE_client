import { getCardFlightStyle } from './cardSizing';

export function getCaveDuelCardStyle(from, middle, to, delay = 0) {
  const flight = getCardFlightStyle(from, to, middle.width);
  const { width, height } = flight;
  const legPoses = {};
  for (const [leg, start, end] of [['in', from, middle], ['out', middle, to]]) {
    const pose = getCardFlightStyle(start, end, width);
    const prefix = `--duel-${leg}-`;
    // Both legs share one sprite, including when the central reveal is largest.
    for (const name of ['mid-scale', 'flight-perspective', 'flight-depth', 'mid-tilt', 'flight-bank', 'mid-rotation']) {
      legPoses[`${prefix}${name}`] = pose[`--${name}`];
    }
  }
  return {
    ...flight,
    ...legPoses,
    position: 'absolute',
    left: from.x - width / 2,
    top: from.y - height / 2,
    '--duel-mid-scale': middle.width / width,
    '--midX': `${middle.x - from.x}px`,
    '--midY': `${middle.y - from.y}px`,
    animation: `caveDuelCardPath 2.35s cubic-bezier(.2,.7,.2,1) ${delay}s both`,
  };
}
