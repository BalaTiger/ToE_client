export function buildPublicUrl(path) {
  const fallbackBase = typeof __TOE_PUBLIC_BASE__ !== 'undefined' ? __TOE_PUBLIC_BASE__ : '/';
  const base = ((window.__PUBLIC_BASE__) || fallbackBase).replace(/\/?$/, '/');
  return `${base}${String(path).replace(/^\/+/, '')}`;
}
