export const DESIGN_WIDTH = 1200;
export const DESIGN_HEIGHT = 720;
export const UPSCALE_WIDTH = 1920;
export const UPSCALE_HEIGHT = 1080;
export const MAX_UPSCALE = 3.0;
export const UPSCALE_VIEWPORT_PADDING_X = 96;
export const UPSCALE_VIEWPORT_PADDING_Y = 64;
// 在大屏下让战斗界面放大得更明显，同时保留 1920x1080 处为 1 的基准
export const UPSCALE_AGGRESSION = 5.0;

export function computeScaleRatio(vw, vh) {
  if (vw < DESIGN_WIDTH) {
    return Math.min(vw / DESIGN_WIDTH, 1);
  }
  if (vw > UPSCALE_WIDTH && vh > UPSCALE_HEIGHT) {
    const viewportFit = Math.min(
      Math.max(1, (vw - UPSCALE_VIEWPORT_PADDING_X) / DESIGN_WIDTH),
      Math.max(1, (vh - UPSCALE_VIEWPORT_PADDING_Y) / DESIGN_HEIGHT),
      MAX_UPSCALE,
    );
    const triggerRatio = Math.min(vw / UPSCALE_WIDTH, vh / UPSCALE_HEIGHT);
    const progress = 1 - Math.exp(-(triggerRatio - 1) * UPSCALE_AGGRESSION);
    return Math.min(1 + (viewportFit - 1) * progress, viewportFit);
  }
  return 1;
}

export function getFontZoomCompensate(scaleRatio) {
  return scaleRatio && scaleRatio < 1 ? 1 / scaleRatio : 1;
}
