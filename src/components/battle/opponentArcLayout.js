// All seats use one rigid frame. Only the position and whole-frame rotation vary.
export function getOpponentArcLayout(count, availableWidth, compact = false, minimumPanelWidth = 0) {
  if (count < 1) return { panelWidth: 0, step: 0, depth: 0, seats: [] };
  const width = Math.max(1, availableWidth);
  const usableWidth = Math.max(1, width - (compact ? 20 : 40));
  const panelWidth = Math.max(1, minimumPanelWidth, Math.min(count > 5 ? 202 : 254,
    count > 5 ? usableWidth / (1 + (count - 1) * 0.94) : (usableWidth - (count - 1) * 10) / count));
  const step = count > 1 ? Math.min(panelWidth + 10, (usableWidth - panelWidth) / (count - 1)) : 0;
  const halfSpan = step * (count - 1) / 2;
  const depth = count > 1 ? Math.min(compact ? Math.max(22, minimumPanelWidth * 0.16) : 43, halfSpan * 0.075) : 0;
  return {
    panelWidth,
    step,
    depth,
    seats: Array.from({ length: count }, (_, index) => {
      const x = step * index - halfSpan;
      return {
        y: halfSpan ? depth * (x / halfSpan) ** 2 : 0,
        rotation: halfSpan ? Math.atan2(2 * depth * x, halfSpan ** 2) * 180 / Math.PI : 0,
      };
    }),
  };
}
