// Full panels reserve their space; only neighbouring compact panels can overlap.
export function getOpponentRosterLayout({ count, currentTurn, expandedPid = null, width, fullWidth = 154, compactWidth = 64, arc = false }) {
  if (!count) return { seats: [], height: 0 };
  const full = Array.from({ length: count }, (_, index) => index + 1 === currentTurn || index + 1 === expandedPid);
  const widths = full.map(isFull => isFull ? fullWidth : compactWidth);
  const total = widths.reduce((sum, value) => sum + value, 0);
  // 16px also clears the full coastal portrait's 6cqw left overhang.
  const protectedEdges = full.slice(1).map((value, index) => value || full[index]);
  const fullGaps = protectedEdges.filter(Boolean).length;
  const compactGaps = count - 1 - fullGaps;
  const compactGap = compactGaps ? Math.max(1 - compactWidth, Math.min(6, (width - total - fullGaps * 16) / compactGaps)) : 0;
  const gaps = protectedEdges.map(protectedEdge => protectedEdge ? 16 : compactGap);
  const span = total + gaps.reduce((sum, gap) => sum + gap, 0);
  let left = Math.max(0, (width - span) / 2);
  const seats = widths.map((seatWidth, index) => {
    const x = left;
    left += seatWidth + (gaps[index] || 0);
    const y = arc ? 22 * ((x + seatWidth / 2 - width / 2) / Math.max(1, span / 2)) ** 2 : 0;
    return { x, y, width: seatWidth };
  });
  return { seats, height: Math.max(118, fullWidth * 390 / 458) + (arc ? 22 : 0) };
}
