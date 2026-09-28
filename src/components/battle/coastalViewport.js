import { DESIGN_WIDTH } from '../../utils/scale';

export const COASTAL_MIN_ASPECT = 16 / 10;
export const COASTAL_MAX_ASPECT = 19 / 10;

// Fit one bounded composition into the window; margins are ordinary HTML.
export function getCoastalViewport(viewportWidth = 1200, viewportHeight = 675) {
  const availableWidth = Math.max(1, viewportWidth);
  const availableHeight = Math.max(1, viewportHeight);
  const aspect = Math.max(COASTAL_MIN_ASPECT, Math.min(COASTAL_MAX_ASPECT, availableWidth / availableHeight));
  const width = Math.min(availableWidth, availableHeight * aspect);
  const height = width / aspect;
  return {
    width, height,
    left: (availableWidth - width) / 2,
    top: (availableHeight - height) / 2,
    scale: width / DESIGN_WIDTH,
    boardHeight: DESIGN_WIDTH / aspect,
  };
}
