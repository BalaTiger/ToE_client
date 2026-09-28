import { useEffect, useMemo, useRef, useState } from 'react';
import { getAnimatedCardBack, getBattleBackgroundImage, getCardBackImage } from '../constants/theme';
import { isLocalTestHost } from '../utils/runtime';
import { buildPublicUrl } from '../utils/url';

const RESOURCE_LOAD_TIMEOUT_MS = 8000;
const BOOTSTRAP_IMAGE_PATHS = new Set([
  '/bg.webp', '/favicon.png', '/img/bg/bg_main.webp', '/img/loading.webp',
  '/img/title/texture_toehp.webp', '/img/line/line_split-no-bg.webp',
  '/img/line/line_titleguard-no-bg.webp', '/img/deco/deco_cth-no-bg.webp',
  '/img/logo/logo_tr-no-bg.webp', '/img/logo/logo_hu-no-bg.webp', '/img/logo/logo_cu-no-bg.webp',
  '/img/btn/btn_author.webp', '/img/btn/btn_roadmap.webp',
  '/img/ui/interface/panel-surface.webp', '/img/ui/interface/panel-frame.webp',
]);
const LOBBY_AUDIO_PATHS = new Set([
  '/sounds/SE/common/ui/open.mp3', '/sounds/SE/common/ui/close.mp3',
]);
const EXPANSION_SOUND_DIRECTORY_BY_KEY = {
  '地神的潜影': '/sounds/SE/earthShadow/',
  '群星呼唤': '/sounds/SE/starsCall/',
};
const FALLBACK_MANIFEST = {
  resources: [
    { path: '/bg.webp', type: 'image', size: 179356 },
    { path: '/img/bg/bg_main.webp', type: 'image', size: 199160 },
    { path: '/img/loading.webp', type: 'image', size: 10968 },
  ],
};

export function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

export function selectBootstrapResources(manifest, pixelRatio = 1) {
  const density = pixelRatio > 1 ? '2x' : '1x';
  return manifest.resources.filter(resource => resource.type === 'image' && (
    BOOTSTRAP_IMAGE_PATHS.has(resource.path)
    || /^\/img\/ui\/start\/frame-(?:tl|tr|bl|br|top|bottom|left|right)\.webp$/.test(resource.path)
    || (/^\/img\/ui\/start\/(?:role-(?:treasure|hunter|cultist)|rules-table|action-(?:solo|online))-v3-/.test(resource.path)
      && resource.path.endsWith('-' + density + '.webp'))
  ));
}

export function selectDeferredResources(manifest, loadBattleResources, activeExpansionKey) {
  const background = getBattleBackgroundImage(activeExpansionKey);
  const cardBack = getCardBackImage(activeExpansionKey);
  const frameDir = getAnimatedCardBack(activeExpansionKey)?.frameDir;
  const soundDirectory = EXPANSION_SOUND_DIRECTORY_BY_KEY[activeExpansionKey]
    || EXPANSION_SOUND_DIRECTORY_BY_KEY['地神的潜影'];
  return manifest.resources.filter(resource => {
    const path = resource.path;
    if (LOBBY_AUDIO_PATHS.has(path)) return true;
    if (!loadBattleResources) return false;
    if (resource.type === 'audio') {
      // Long BGM tracks stream through the active audio player instead of downloading twice.
      return path.startsWith('/sounds/SE/common/') || path.startsWith(soundDirectory);
    }
    if (resource.type !== 'image') return false;
    // Card illustrations and rare effects are requested by their actual consumers.
    return path === background || path === cardBack
      || (frameDir && path.startsWith(frameDir + '/frame_'))
      || path.startsWith('/img/ui/coastal/') || path.startsWith('/img/ui/theme_relief/')
      || path.startsWith('/img/card/cardbg_') || path.startsWith('/img/card/highlight/')
      || path === '/img/card/cardback_sancheck.png' || path === '/img/card/cardback_token.png';
  }).sort((a, b) => Number(a.type === 'audio') - Number(b.type === 'audio'));
}

function getConnectionProfile() {
  const connection = typeof navigator === 'undefined' ? null
    : navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return {
    deferMedia: !!connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType),
    concurrency: connection?.effectiveType === '3g' ? 1 : 2,
  };
}

async function loadManifest(signal) {
  try {
    const response = await fetch(buildPublicUrl('/resource-manifest.json'), { cache: 'no-cache', signal });
    if (!response.ok) throw new Error('manifest ' + response.status);
    const manifest = await response.json();
    if (!Array.isArray(manifest.resources)) throw new Error('manifest resources missing');
    return manifest;
  } catch (error) {
    if (signal.aborted) return null;
    console.warn('Resource manifest unavailable, using fallback.', error);
    return FALLBACK_MANIFEST;
  }
}

function loadResource(resource, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let img;
    const controller = new AbortController();
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      if (img) {
        img.onload = img.onerror = null;
        if (error) img.removeAttribute('src');
      }
      if (error) {
        controller.abort();
        reject(error);
      } else resolve();
    };
    const abort = () => finish(new DOMException('Resource preload cancelled', 'AbortError'));
    const timeout = setTimeout(() => finish(new Error(resource.path)), resource.type === 'audio' ? 60000 : RESOURCE_LOAD_TIMEOUT_MS);
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    const url = buildPublicUrl(resource.path);
    if (resource.type === 'image') {
      img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => finish();
      img.onerror = () => finish(new Error(resource.path));
      img.src = url;
    } else {
      // Consume the whole response to warm the HTTP cache, not just audio metadata.
      fetch(url, { signal: controller.signal }).then(async response => {
        if (!response.ok) throw new Error(resource.path + ': ' + response.status);
        await response.arrayBuffer();
      }).then(() => finish(), finish);
    }
  });
}

export async function loadConcurrent(resources, concurrency, signal, onSettled) {
  let cursor = 0;
  async function worker() {
    while (!signal.aborted && cursor < resources.length) {
      const resource = resources[cursor++];
      let error = null;
      try {
        await loadResource(resource, signal);
      } catch (cause) {
        error = cause;
      }
      if (!signal.aborted) onSettled?.(resource, error);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
}

export function useResourcePreload({ loadBattleResources = false, activeExpansionKey = '地神的潜影' } = {}) {
  const [isLoading, setIsLoading] = useState(() => !isLocalTestHost());
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingError, setLoadingError] = useState(null);
  const [currentFile, setCurrentFile] = useState('');
  const [totalSize, setTotalSize] = useState(0);
  const [loadedSize, setLoadedSize] = useState(0);
  const [manifest, setManifest] = useState(null);
  const completedPaths = useRef(new Set());
  const networkProfile = useMemo(() => getConnectionProfile(), []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const run = async () => {
      const nextManifest = await loadManifest(signal);
      if (!nextManifest || signal.aborted) return;
      const resources = selectBootstrapResources(nextManifest, window.devicePixelRatio || 1);
      const totalBytes = resources.reduce((sum, resource) => sum + (resource.size || 0), 0);
      let settledBytes = 0;
      setTotalSize(totalBytes);
      // HTTP / service-worker caches handle repeat visits, even after browser eviction.
      await loadConcurrent(resources, 5, signal, (resource, error) => {
        if (error) setLoadingError(prev => prev || '图片加载失败: ' + resource.path);
        else completedPaths.current.add(resource.path);
        settledBytes += resource.size || 0;
        setCurrentFile(resource.path.split('/').pop());
        setLoadedSize(settledBytes);
        setLoadingProgress(totalBytes ? Math.min(100, settledBytes / totalBytes * 100) : 100);
      });
      if (signal.aborted) return;
      setManifest(nextManifest);
      setIsLoading(false);
    };
    run();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!manifest || networkProfile.deferMedia) return;
    const controller = new AbortController();
    const resources = selectDeferredResources(manifest, loadBattleResources, activeExpansionKey)
      .filter(resource => !completedPaths.current.has(resource.path));
    const run = () => loadConcurrent(resources, networkProfile.concurrency, controller.signal, (resource, error) => {
      if (!error) completedPaths.current.add(resource.path);
      else console.warn('Deferred resource failed: ' + resource.path, error);
    });
    const idle = typeof window.requestIdleCallback === 'function';
    const timer = idle ? window.requestIdleCallback(run, { timeout: 3000 }) : setTimeout(run, 0);
    return () => {
      controller.abort();
      if (idle) window.cancelIdleCallback(timer);
      else clearTimeout(timer);
    };
  }, [activeExpansionKey, loadBattleResources, manifest, networkProfile]);

  return { isLoading, loadingProgress, loadingError, currentFile, totalSize, loadedSize };
}
