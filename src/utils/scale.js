export const DESIGN_WIDTH = 1200;
export const UPSCALE_WIDTH = 1920;
export const UPSCALE_HEIGHT = 1080;
export const MAX_UPSCALE = 2.5;
// 在大屏下让战斗界面放大得更明显，同时保留 1920x1080 处为 1 的基准
export const UPSCALE_AGGRESSION = 7.0;

export function computeScaleRatio(vw, vh) {
  if (vw < DESIGN_WIDTH) {
    return Math.min(vw / DESIGN_WIDTH, 1);
  }
  if (vw > UPSCALE_WIDTH && vh > UPSCALE_HEIGHT) {
    const baseRatio = Math.min(vw / UPSCALE_WIDTH, vh / UPSCALE_HEIGHT);
    // 从 1 开始按 aggression 系数额外放大，避免刚过阈值就跳跃过大
    const upscaled = 1 + (baseRatio - 1) * UPSCALE_AGGRESSION;
    return Math.min(upscaled, MAX_UPSCALE);
  }
  return 1;
}

export function getFontZoomCompensate(scaleRatio) {
  return scaleRatio && scaleRatio < 1 ? 1 / scaleRatio : 1;
}
