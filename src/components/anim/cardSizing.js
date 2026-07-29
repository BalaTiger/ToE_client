function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function getStandardFlyingCardSize() {
  if (typeof window === 'undefined') return { width: 76, height: 100, scale: 76 / 82 };
  const vw = window.innerWidth || 1280;
  const vh = window.innerHeight || 720;
  const portraitMobile = vw <= 640 && vh >= vw;
  const landscapeMobile = vh <= 520 && vw > vh;
  const largeBoost = clampNumber((vw - 1280) / 960, 0, 1);
  const rawWidth = portraitMobile
    ? clampNumber(vw * 0.145, 52, 60)
    : landscapeMobile
      ? clampNumber(vh * 0.16, 56, 66)
      : 76 + largeBoost * 42;
  const width = Math.round(rawWidth);
  const height = Math.round(width * (108 / 82));
  return { width, height, scale: width / 82 };
}
