export function buildPublicUrl(path) {
  const base = ((window.__PUBLIC_BASE__) || '/').replace(/\/?$/, '/');
  return `${base}${String(path).replace(/^\/+/, '')}`;
}
