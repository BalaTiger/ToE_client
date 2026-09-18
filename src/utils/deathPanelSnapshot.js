import { _getZoomCompensatedRect } from './dom';

export const DEATH_SNAPSHOT_TIMEOUT_MS = 2500;

export function captureDeathPanelSnapshot(idx, { signal, timeoutMs = null } = {}) {
  let el;
  let target;
  let captureArea;
  const measureTarget = () => {
    const r = _getZoomCompensatedRect(el);
    const panelStyle = window.getComputedStyle(el);
    let left = r.left, top = r.top, right = r.left + r.width, bottom = r.top + r.height;
    captureArea = { width: el.offsetWidth || undefined, height: el.offsetHeight || undefined };
    const sideTags = idx === 0 ? el.querySelector?.('.toe-self-side-tags') : null;
    if (sideTags) {
      const style = window.getComputedStyle(sideTags);
      const tags = _getZoomCompensatedRect(sideTags);
      if (style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && tags.width > 0 && tags.height > 0) {
        left = Math.min(left, tags.left);
        top = Math.min(top, tags.top);
        right = Math.max(right, tags.left + tags.width);
        bottom = Math.max(bottom, tags.top + tags.height);
        // Snapshot the hanging tabs too, without widening the live panel or
        // changing the hit/hand anchors. html2canvas's clone has no board zoom.
        const scaleX = r.width / (el.offsetWidth || r.width);
        const scaleY = r.height / (el.offsetHeight || r.height);
        captureArea = { x: (left - r.left) / scaleX, y: (top - r.top) / scaleY, width: (right - left) / scaleX, height: (bottom - top) / scaleY };
      }
    }
    return {
      pi: idx,
      x: left, y: top, w: right - left, h: bottom - top,
      cx: (left + right) / 2, cy: (top + bottom) / 2,
      snapshotUrl: null,
      panelBackground: panelStyle.background,
      panelBorderColor: panelStyle.borderTopColor,
      panelBoxShadow: panelStyle.boxShadow,
    };
  };
  try {
    el = document.querySelector(`[data-death-panel="${idx}"]`);
    if (!el || signal?.aborted) return Promise.resolve(null);
    target = measureTarget();
  } catch (err) {
    console.warn('[death-snapshot] panel unavailable for pid', idx, err);
    return Promise.resolve(null);
  }

  return new Promise(resolve => {
    let settled = false;
    let timeout;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', cancel);
      resolve(result);
    };
    const cancel = () => finish(null);
    signal?.addEventListener('abort', cancel, { once: true });
    if (Number.isFinite(timeoutMs)) timeout = setTimeout(() => finish(target), timeoutMs);
    const capture = async () => {
      try {
        const { default: html2canvas } = await import('html2canvas');
        if (settled) return;
        // Hover can expand/collapse the same root while the renderer loads.
        // Pair the captured pixels with the bounds of that actual panel state.
        target = measureTarget();
        const inZoomContainer = !!el.closest?.('[data-zoom-container]');
        const canvas = await html2canvas(el, {
          backgroundColor: null,
          useCORS: true,
          logging: false,
          scale: Math.min(2, Math.max(1, window.devicePixelRatio || 1)),
          ...captureArea,
          windowWidth: inZoomContainer ? 1200 : window.innerWidth,
          windowHeight: window.innerHeight,
          ignoreElements: node => node?.hasAttribute?.('data-theme-ornament'),
          onclone: (doc, cloneEl) => {
            const zoomContainer = doc.querySelector('[data-zoom-container]');
            if (zoomContainer?.style) {
              zoomContainer.style.zoom = 'normal';
              zoomContainer.style.transform = 'none';
            }
            const root = cloneEl || doc.querySelector(`[data-death-panel="${idx}"]`);
            if (!root?.style) return;
            root.style.zoom = 'normal';
            root.style.transform = 'none';
            root.style.background = 'transparent';
            root.style.backgroundColor = 'transparent';
            root.style.borderColor = 'transparent';
            root.style.boxShadow = 'none';
          },
        });
        if (!settled) finish({ ...target, snapshotUrl: canvas.toDataURL('image/png') });
      } catch (err) {
        if (!settled) {
          console.warn('[death-snapshot] capture failed for pid', idx, err);
          finish(target);
        }
      }
    };
    void capture();
  });
}
