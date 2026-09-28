const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Measure the real tooltip height: long CJK explanations must not cover the
// action they explain, especially on a short landscape phone viewport.
export function getTutorialTooltipPosition({ rect, width, height, vw, vh, avoid = [], centered = false }) {
  const margin = 10, gap = 14;
  const w = Math.min(width, vw - margin * 2), h = Math.min(height, vh - margin * 2);
  const fit = ({ left, top }) => ({
    left: clamp(left, margin, Math.max(margin, vw - w - margin)),
    top: clamp(top, margin, Math.max(margin, vh - h - margin)),
  });
  if (!rect || centered) return fit({ left: (vw - w) / 2, top: (vh - h) / 2 });
  const cx = (rect.left + rect.right) / 2, cy = (rect.top + rect.bottom) / 2;
  const candidates = [
    { left: rect.right + gap, top: cy - h / 2 },
    { left: rect.left - w - gap, top: cy - h / 2 },
    { left: cx - w / 2, top: rect.top - h - gap },
    { left: cx - w / 2, top: rect.bottom + gap },
    { left: margin, top: margin },
    { left: vw - w - margin, top: margin },
    { left: margin, top: vh - h - margin },
    { left: vw - w - margin, top: vh - h - margin },
  ].map(fit);
  const overlap = (pos, target) => Math.max(0, Math.min(pos.left + w, target.right + gap) - Math.max(pos.left, target.left - gap))
    * Math.max(0, Math.min(pos.top + h, target.bottom + gap) - Math.max(pos.top, target.top - gap));
  const score = pos => overlap(pos, rect) * 10 + avoid.reduce((sum, target) => sum + overlap(pos, target), 0);
  return candidates.reduce((best, candidate) => score(candidate) < score(best) ? candidate : best);
}
