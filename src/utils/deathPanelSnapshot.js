import { _getZoomCompensatedRect } from './dom';

export const DEATH_SNAPSHOT_TIMEOUT_MS = 2500;

export function captureDeathPanelSnapshot(idx, { signal, timeoutMs = null } = {}) {
  let el;
  let target;
  try {
    el = document.querySelector(`[data-death-panel="${idx}"]`);
    if (!el || signal?.aborted) return Promise.resolve(null);
    const r = _getZoomCompensatedRect(el);
    const panelStyle = window.getComputedStyle(el);
    target = {
      pi: idx,
      x: r.left, y: r.top, w: r.width, h: r.height,
      cx: r.left + r.width / 2, cy: r.top + r.height / 2,
      snapshotUrl: null,
      panelBackground: panelStyle.background,
      panelBorderColor: panelStyle.borderTopColor,
      panelBoxShadow: panelStyle.boxShadow,
    };
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
        const inZoomContainer = !!el.closest?.('[data-zoom-container]');
        const canvas = await html2canvas(el, {
          backgroundColor: null,
          useCORS: true,
          logging: false,
          scale: Math.min(2, Math.max(1, window.devicePixelRatio || 1)),
          width: el.offsetWidth || undefined,
          height: el.offsetHeight || undefined,
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
