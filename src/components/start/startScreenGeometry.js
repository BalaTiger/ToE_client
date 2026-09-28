export const START_SCREEN_WIDTH = 1490;
export const START_SCREEN_HEIGHT = 1056;
export const START_SCREEN_CONTENT_WIDTH = 960;

// One scale applies to the entire composition, including artwork and text.
export function getStartScreenScale(vw, vh) {
  const width = Number.isFinite(vw) && vw > 0 ? vw : START_SCREEN_WIDTH;
  const height = Number.isFinite(vh) && vh > 0 ? vh : START_SCREEN_HEIGHT;
  const footerClearance = 26 + 57.37 * getStartScreenControlScale(width, height);
  // Fit the visible content, not the stage's empty 265px side margins.
  return Math.min(
    Math.max(1, width - 32) / START_SCREEN_CONTENT_WIDTH,
    height / START_SCREEN_HEIGHT,
    // Content ends at y=935, 407px below the stage center. Keep it above the footer.
    Math.max(1, height / 2 - footerClearance) / 407,
  );
}

export function getStartScreenControlScale(vw, vh) {
  const width = Number.isFinite(vw) && vw > 0 ? vw : START_SCREEN_WIDTH;
  const height = Number.isFinite(vh) && vh > 0 ? vh : START_SCREEN_HEIGHT;
  const preferred = Math.max(0.92, Math.min(1.12, 0.9 + Math.min(width, height) / 10000));
  // Keep corner controls legible; only very narrow windows require a smaller fit.
  return Math.min(preferred, Math.max(1, width - 40) / 520);
}
