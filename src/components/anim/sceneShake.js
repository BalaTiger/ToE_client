export const EARTHQUAKE_SHAKE_CYCLE_MS = 1250;
export const EARTHQUAKE_SHAKE_DURATION_MS = 2500;

export const EARTHQUAKE_SHAKE_STEPS = Object.freeze([
  [0, 0],
  [6.67, -5],
  [13.33, 5],
  [20, 0],
  [26.67, 4],
  [33.33, -4],
  [40, 0],
  [46.67, -5],
  [53.33, 5],
  [60, 0],
  [66.67, 4],
  [73.33, -4],
  [80, 0],
  [86.67, -3],
  [93.33, 3],
  [100, 0],
].map(step => Object.freeze(step)));

const DAMAGE_SHAKE_STEPS = [
  [0, 0], [15, -6], [30, 8], [50, -5], [70, 6], [85, -3], [100, 0],
];

const GUILLOTINE_SHAKE_STEPS = [
  [0, 0, 0], [4, -14, -10], [8, 18, 12], [13, -12, -16],
  [18, 20, 8], [24, -16, -10], [30, 14, 14], [38, -10, -8],
  [46, 12, 6], [55, -8, -4], [65, 6, 8], [75, -5, -3],
  [85, 4, 4], [93, -2, -2], [100, 0, 0],
];

function buildKeyframes(steps, easing = 'linear') {
  return Object.freeze(steps.map(([percent, x, y = 0]) => Object.freeze({
    offset: percent / 100,
    transform: `translate(${x}px, ${y}px)`,
    easing,
  })));
}

const DAMAGE_KEYFRAMES = buildKeyframes(DAMAGE_SHAKE_STEPS, 'ease-in-out');
const GUILLOTINE_KEYFRAMES = buildKeyframes(GUILLOTINE_SHAKE_STEPS, 'ease-in-out');
const EARTHQUAKE_KEYFRAMES = buildKeyframes(EARTHQUAKE_SHAKE_STEPS);

function buildSpec(keyframes, duration, activeDuration, delay = 0) {
  return Object.freeze({
    keyframes,
    timing: Object.freeze({
      duration,
      // SAN and guillotine intentionally stop before their full curve finishes.
      iterations: activeDuration / duration,
      delay,
      // CSS eased each keyframe interval, not the entire iteration timeline.
      easing: 'linear',
      fill: 'none',
    }),
  });
}

const HP_DAMAGE_SHAKE = buildSpec(DAMAGE_KEYFRAMES, 380, 380);
const SAN_DAMAGE_SHAKE = buildSpec(DAMAGE_KEYFRAMES, 380, 280);
const GUILLOTINE_SHAKE = buildSpec(GUILLOTINE_KEYFRAMES, 2000, 220, 120);
const EARTHQUAKE_SHAKE = buildSpec(EARTHQUAKE_KEYFRAMES, EARTHQUAKE_SHAKE_CYCLE_MS, EARTHQUAKE_SHAKE_DURATION_MS);
const BURROWING_WORM_SHAKE = buildSpec(EARTHQUAKE_KEYFRAMES, EARTHQUAKE_SHAKE_CYCLE_MS, 1620);

export function getSceneShakeSpec(anim, guillotineReady = true) {
  switch (anim?.type) {
    case 'HP_DAMAGE':
      return anim.hitIndices?.length ? HP_DAMAGE_SHAKE : null;
    case 'SAN_DAMAGE':
      return anim.hitIndices?.length ? SAN_DAMAGE_SHAKE : null;
    case 'GUILLOTINE':
      return anim.hitIndices?.length && guillotineReady ? GUILLOTINE_SHAKE : null;
    case 'EARTHQUAKE':
      return EARTHQUAKE_SHAKE;
    case 'BURROWING_WORM':
      return BURROWING_WORM_SHAKE;
    default:
      return null;
  }
}
