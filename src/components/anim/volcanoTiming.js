export const VOLCANO_METEOR_DELAYS = [0.10, 0.22, 0.34, 0.46, 0.58, 0.70, 0.82];

function volcanoRand(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function getVolcanoMeteorFall(seed) {
  return 0.68 + volcanoRand(seed + 4) * 0.16;
}

export function getVolcanoImpactTimes() {
  return VOLCANO_METEOR_DELAYS.map((delay, seed) => {
    const fall = getVolcanoMeteorFall(seed);
    return {
      seed,
      delay,
      fall,
      impactAt: delay + fall,
    };
  });
}
