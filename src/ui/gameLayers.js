import { createPortal } from 'react-dom';

export const GAME_LAYER_IDS = Object.freeze({
  scene: 'toe-scene-layer',
  flame: 'toe-flame-layer',
  overlay: 'toe-overlay-layer',
});

// These hosts belong to the current document, including the mobile landscape
// iframe. A filtered ancestor cannot be escaped by a child's filter:none.
export function mountGameLayers(doc = document) {
  const app = doc.getElementById('root');
  if (!app || doc.getElementById(GAME_LAYER_IDS.scene)) return;
  for (const layer of Object.keys(GAME_LAYER_IDS)) {
    const host = doc.createElement('div');
    host.id = GAME_LAYER_IDS[layer];
    host.dataset.gameLayer = layer;
    if (layer === 'flame') host.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(host);
    if (layer === 'scene') host.appendChild(app);
  }
}

export function getGameLayerTarget(layer = 'scene') {
  if (typeof document === 'undefined') return null;
  return document.getElementById?.(GAME_LAYER_IDS[layer]) || document.body;
}

// Isolated component tests and static rendering have no hosts and keep their
// existing element tree. Runtime portals preserve React context and events.
export function renderGameLayer(children, layer = 'overlay') {
  const host = typeof document === 'undefined' ? null : document.getElementById?.(GAME_LAYER_IDS[layer]);
  return host ? createPortal(children, host) : children;
}

export function applyGameGamma(filter, doc = document) {
  doc.body.style.filter = '';
  doc.documentElement.style.setProperty('--toe-scene-gamma', filter || 'none');
}

// Only actual rendered overlay content counts; components returning null and
// stylesheet nodes must not keep a decorative flame in its occluded mode.
export function subscribeOverlayPresence(onChange) {
  const host = typeof document === 'undefined' ? null : document.getElementById?.(GAME_LAYER_IDS.overlay);
  const notify = () => onChange(!!host && [...host.children].some(node => node.tagName !== 'STYLE'));
  notify();
  if (!host || typeof MutationObserver === 'undefined') return () => {};
  const observer = new MutationObserver(notify);
  observer.observe(host, { childList: true });
  return () => observer.disconnect();
}
