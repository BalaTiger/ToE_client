import { useEffect, useMemo, useRef, useState } from "react";
import { scheduleCardIllustrationIdleDownload } from "../components/cards/CardFaceAssets";
import { buildPublicUrl } from "../utils/url";

const RESOURCE_MANIFEST_PATH = '/resource-manifest.json';
const CACHE_VERSION_KEY = 'toe_resources_cached_version';
const RESOURCE_LOAD_TIMEOUT_MS = 8000;
const BOOTSTRAP_IMAGE_CONCURRENCY = 5;
const DEFERRED_IMAGE_CONCURRENCY = 2;

const LOAD_ERROR_LABELS = {
  audio: '音频加载失败',
  video: '视频加载失败',
  image: '图片加载失败',
  font: '字体加载失败',
  script: '脚本加载失败',
  style: '样式加载失败',
};

const FALLBACK_MANIFEST = {
  version: 'fallback-webp-assets',
  resources: [
    { path: '/bg.webp', type: 'image', size: 179356 },
    { path: '/img/bg/bg_main.webp', type: 'image', size: 199160 },
    { path: '/img/loading.webp', type: 'image', size: 10968 },
    { path: '/img/card/cardbg_zone.webp', type: 'image', size: 145436 },
    { path: '/img/card/cardbg_god.webp', type: 'image', size: 133576 },
  ],
};

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getConnectionProfile() {
  if (typeof navigator === 'undefined') {
    return { saveData: false, effectiveType: 'unknown', deferMedia: false, mediaConcurrency: 2 };
  }
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const saveData = !!connection?.saveData;
  const effectiveType = connection?.effectiveType || 'unknown';
  const slow = saveData || effectiveType === 'slow-2g' || effectiveType === '2g';
  const moderate = effectiveType === '3g';
  return {
    saveData,
    effectiveType,
    deferMedia: slow,
    mediaConcurrency: slow ? 1 : moderate ? 1 : 2,
  };
}

async function loadManifest() {
  try {
    const response = await fetch(buildPublicUrl(RESOURCE_MANIFEST_PATH), { cache: 'no-cache' });
    if (!response.ok) throw new Error(`manifest ${response.status}`);
    const manifest = await response.json();
    if (!Array.isArray(manifest.resources)) throw new Error('manifest resources missing');
    return manifest;
  } catch (error) {
    console.warn('Resource manifest unavailable, using fallback.', error);
    return FALLBACK_MANIFEST;
  }
}

function loadResource(resource, timeoutMs = RESOURCE_LOAD_TIMEOUT_MS) {
  const url = buildPublicUrl(resource.path);
  let timeoutId = null;

  const withTimeout = (start) => new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      callback(value);
    };
    timeoutId = setTimeout(() => {
      finish(reject, new Error(resource.path));
    }, timeoutMs);
    start(
      value => finish(resolve, value),
      error => finish(reject, error),
    );
  });

  if (resource.type === 'audio') {
    const audio = new Audio(url);
    audio.crossOrigin = 'anonymous';
    audio.preload = 'metadata';
    return withTimeout((resolve, reject) => {
      const cleanup = () => {
        audio.removeEventListener('canplaythrough', handleReady);
        audio.removeEventListener('canplay', handleReady);
        audio.removeEventListener('loadeddata', handleReady);
        audio.removeEventListener('loadedmetadata', handleReady);
        audio.removeEventListener('error', handleError);
      };
      const handleReady = () => {
        cleanup();
        resolve();
      };
      const handleError = () => {
        cleanup();
        reject(new Error(resource.path));
      };
      audio.addEventListener('canplaythrough', handleReady, { once: true });
      audio.addEventListener('canplay', handleReady, { once: true });
      audio.addEventListener('loadeddata', handleReady, { once: true });
      audio.addEventListener('loadedmetadata', handleReady, { once: true });
      audio.addEventListener('error', handleError, { once: true });
      audio.load();
    });
  }

  if (resource.type === 'video') {
    const video = document.createElement('video');
    video.src = url;
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous';
    return withTimeout((resolve, reject) => {
      video.addEventListener('loadeddata', resolve, { once: true });
      video.addEventListener('loadedmetadata', resolve, { once: true });
      video.addEventListener('error', reject, { once: true });
      video.load();
    });
  }

  if (resource.type === 'font' && typeof document !== 'undefined' && document.fonts) {
    return withTimeout((resolve) => {
      fetch(url).finally(resolve);
    });
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';
  return withTimeout((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = url;
  });
}

async function loadConcurrent(resources, concurrency, onSettled) {
  let cursor = 0;
  async function worker() {
    while (cursor < resources.length) {
      const resource = resources[cursor++];
      try {
        await loadResource(resource);
      } catch (error) {
        console.warn(`Resource failed: ${resource.path}`, error);
        onSettled?.(resource, error);
        continue;
      }
      onSettled?.(resource, null);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
}

function scheduleDeferredPreload(resources, concurrency) {
  const run = async () => {
    await loadConcurrent(resources, concurrency, resource => {
      // Deferred failures are non-blocking; log at low volume.
      if (!resource) return;
    });
  };

  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 3000 });
  } else {
    setTimeout(run, 0);
  }
}

function isAnimatedCardBackResource(resource) {
  return resource.path.startsWith('/img/card/animated/') && resource.path.includes('/frame_');
}

function isBootstrapImageResource(resource) {
  if (resource.type !== 'image') return false;
  if (isAnimatedCardBackResource(resource)) return false;
  return true;
}

function getDeferredConcurrency(networkProfile) {
  return Math.max(DEFERRED_IMAGE_CONCURRENCY, networkProfile.mediaConcurrency);
}

function selectBootstrapResources(manifest) {
  return manifest.resources
    .filter(isBootstrapImageResource)
    .sort((a, b) => a.path.localeCompare(b.path));
}

function selectDeferredResources(manifest, loadAllThemes) {
  const deferredImages = manifest.resources.filter(isAnimatedCardBackResource);
  const media = manifest.resources.filter(resource => resource.type === 'audio' || resource.type === 'video');
  if (loadAllThemes) return [...deferredImages, ...media];
  const baseMedia = media.filter(resource => {
    return !resource.path.includes('battle_stars_call') && resource.type !== 'video';
  });
  return [...deferredImages, ...baseMedia];
}

export function useResourcePreload({ loadAllThemes = false } = {}) {
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingError, setLoadingError] = useState(null);
  const [currentFile, setCurrentFile] = useState('');
  const [totalSize, setTotalSize] = useState(0);
  const [loadedSize, setLoadedSize] = useState(0);
  const manifestRef = useRef(null);
  const deferredStageRef = useRef('none');
  const networkProfile = useMemo(() => getConnectionProfile(), []);

  useEffect(() => {
    let cancelled = false;
    const setIfMounted = setter => value => {
      if (!cancelled) setter(value);
    };
    const setSafeIsLoading = setIfMounted(setIsLoading);
    const setSafeLoadingProgress = setIfMounted(setLoadingProgress);
    const setSafeLoadingError = setIfMounted(setLoadingError);
    const setSafeCurrentFile = setIfMounted(setCurrentFile);
    const setSafeTotalSize = setIfMounted(setTotalSize);
    const setSafeLoadedSize = setIfMounted(setLoadedSize);

    const preloadResources = async () => {
      const manifest = await loadManifest();
      manifestRef.current = manifest;
      const bootstrapResources = selectBootstrapResources(manifest);
      const deferredResources = selectDeferredResources(manifest, loadAllThemes);

      try {
        const cachedVersion = localStorage.getItem(CACHE_VERSION_KEY);
        if (cachedVersion === manifest.version) {
          setSafeIsLoading(false);
          deferredStageRef.current = loadAllThemes ? 'all' : 'base';
          if (!networkProfile.deferMedia) {
            scheduleDeferredPreload(deferredResources, getDeferredConcurrency(networkProfile));
          }
          scheduleCardIllustrationIdleDownload();
          return;
        }
      } catch {
        // localStorage error, proceed with preloading.
      }

      let loadedBytes = 0;
      const totalBytes = bootstrapResources.reduce((sum, resource) => sum + (resource.size || 0), 0);
      setSafeTotalSize(totalBytes);

      await loadConcurrent(bootstrapResources, BOOTSTRAP_IMAGE_CONCURRENCY, (resource, error) => {
        if (cancelled) return;
        if (error) {
          const errorLabel = LOAD_ERROR_LABELS[resource.type] || '资源加载失败';
          setSafeLoadingError(prev => prev || `${errorLabel}: ${resource.path}`);
        }
        setSafeCurrentFile(resource.path.split('/').pop());
        loadedBytes += resource.size || 0;
        setSafeLoadedSize(loadedBytes);
        setSafeLoadingProgress(totalBytes > 0
          ? Math.min(100, (loadedBytes / totalBytes) * 100)
          : 100);
      });

      try {
        localStorage.setItem(CACHE_VERSION_KEY, manifest.version);
      } catch {
        // localStorage error, ignore.
      }

      setSafeIsLoading(false);
      deferredStageRef.current = loadAllThemes ? 'all' : 'base';
      if (!networkProfile.deferMedia) {
        scheduleDeferredPreload(deferredResources, getDeferredConcurrency(networkProfile));
      }
      scheduleCardIllustrationIdleDownload();
    };

    preloadResources();
    return () => {
      cancelled = true;
    };
  }, [loadAllThemes, networkProfile.deferMedia, networkProfile.mediaConcurrency]);

  useEffect(() => {
    if (isLoading || !manifestRef.current) return;
    const nextStage = loadAllThemes ? 'all' : 'base';
    if (deferredStageRef.current === nextStage) return;
    if (deferredStageRef.current === 'all') return;
    deferredStageRef.current = nextStage;
    if (networkProfile.deferMedia) return;
    scheduleDeferredPreload(selectDeferredResources(manifestRef.current, loadAllThemes), getDeferredConcurrency(networkProfile));
  }, [isLoading, loadAllThemes, networkProfile.deferMedia, networkProfile.mediaConcurrency]);

  return {
    isLoading,
    loadingProgress,
    loadingError,
    currentFile,
    totalSize,
    loadedSize,
  };
}
