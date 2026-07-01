import { useEffect, useMemo, useRef, useState } from "react";
import { getAnimatedCardBackFramePaths } from "../constants/card";
import { CARD_FACE_BACKGROUND_FILES, scheduleCardIllustrationIdleDownload } from "../components/cards/CardFaceAssets";
import { buildPublicUrl } from "../utils/url";

const BOOTSTRAP_AUDIO_FILES = [
  '/sounds/BGM/mainTheme.mp3',
  '/sounds/BGM/battle_earth_shadow.mp3',
  '/sounds/SE/hpDamageVariants/hpDamage1.mp3',
  '/sounds/SE/hpDamageVariants/hpDamage2.mp3',
  '/sounds/SE/hpDamageVariants/hpDamage3.mp3',
  '/sounds/SE/hpDamageVariants/hpDamage4.mp3',
  '/sounds/SE/hpDamageVariants/hpDamage5.mp3',
  '/sounds/SE/hpDamageVariants/hpDamage6.mp3',
  '/sounds/SE/apophisEclipseDrums.mp3',
];

const DEFERRED_AUDIO_FILES = [
  '/sounds/BGM/battle_stars_call.mp3',
];

const VIDEO_FILES = [
  '/videos/ancient_god_tentacles.mp4',
];

const CRITICAL_IMAGE_FILES = [
  '/img/btn/btn_author.webp',
  '/img/btn/btn_bright_green.webp',
  '/img/btn/btn_bright_purple.webp',
  '/img/btn/btn_dark_green.webp',
  '/img/btn/btn_dark_red.webp',
  '/img/btn/btn_dark_purple.webp',
  '/img/btn/btn_roadmap.webp',
  '/img/deco/deco_cth-no-bg.webp',
  '/img/line/line_split-no-bg.webp',
  '/img/line/line_titleguard-no-bg.webp',
  '/img/logo/logo_cu-no-bg.webp',
  '/img/logo/logo_hu-no-bg.webp',
  '/img/logo/logo_tr-no-bg.webp',
  '/img/title/texture_toehp.webp',
  '/img/loading.webp',
  ...CARD_FACE_BACKGROUND_FILES,
];

const EARTH_ANIMATED_CARD_BACK_IMAGE_FILES = getAnimatedCardBackFramePaths('地神的潜影', true);
const STARS_ANIMATED_CARD_BACK_IMAGE_FILES = getAnimatedCardBackFramePaths('群星呼唤', true);

// Resource groups are intentionally domain-based:
// - bootstrap: first paint and first interaction
// - earthTheme: first-match default theme
// - otherThemes: assets only needed after the first match or multiplayer entry
const RESOURCE_GROUPS = {
  bootstrapAudio: BOOTSTRAP_AUDIO_FILES.map(path => ({ path, type: 'audio' })),
  deferredAudio: DEFERRED_AUDIO_FILES.map(path => ({ path, type: 'audio' })),
  bootstrapVideo: VIDEO_FILES.map(path => ({ path, type: 'video' })),
  criticalUiImage: CRITICAL_IMAGE_FILES.map(path => ({ path, type: 'image' })),
  earthTheme: [
    '/img/bg/bg_main.webp',
    '/img/bg/battle/earth_shadow.webp',
    '/img/card/cardback_earth_shadow.webp',
    '/img/ui/theme_relief/panel_corner_earth.webp',
    '/img/ui/theme_relief/log_relief_earth.webp',
    '/img/ui/theme_relief/hand_edge_earth.webp',
    ...EARTH_ANIMATED_CARD_BACK_IMAGE_FILES,
  ].map(path => ({ path, type: 'image' })),
  otherThemes: [
    '/img/bg/battle/sage_gift.webp',
    '/img/bg/battle/stars_call.webp',
    '/img/bg/battle/bone_fuel.webp',
    '/img/card/cardback_sage_gift.webp',
    '/img/card/cardback_stars_call.webp',
    '/img/card/cardback_bone_fuel.webp',
    '/img/ui/theme_relief/panel_corner_stars.webp',
    '/img/ui/theme_relief/log_relief_stars.webp',
    '/img/ui/theme_relief/hand_edge_stars.webp',
    ...STARS_ANIMATED_CARD_BACK_IMAGE_FILES,
  ].map(path => ({ path, type: 'image' })),
};

// Profiles describe *when* groups should be loaded, not what they mean semantically.
const PRELOAD_PROFILES = {
  bootstrap: [
    ...RESOURCE_GROUPS.criticalUiImage,
  ],
  earthDeferred: [
    ...RESOURCE_GROUPS.bootstrapAudio,
    ...RESOURCE_GROUPS.bootstrapVideo,
    ...RESOURCE_GROUPS.earthTheme,
  ],
  allDeferred: [
    ...RESOURCE_GROUPS.bootstrapAudio,
    ...RESOURCE_GROUPS.bootstrapVideo,
    ...RESOURCE_GROUPS.deferredAudio,
    ...RESOURCE_GROUPS.earthTheme,
    ...RESOURCE_GROUPS.otherThemes,
  ],
};

const RESOURCE_SIZE_FALLBACK = {
  '/sounds/BGM/mainTheme.mp3': 2517204,
  '/sounds/BGM/battle_earth_shadow.mp3': 1226925,
  '/sounds/BGM/battle_stars_call.mp3': 5393805,
  '/sounds/SE/hpDamageVariants/hpDamage1.mp3': 4428,
  '/sounds/SE/hpDamageVariants/hpDamage2.mp3': 3331,
  '/sounds/SE/hpDamageVariants/hpDamage3.mp3': 3175,
  '/sounds/SE/hpDamageVariants/hpDamage4.mp3': 4478,
  '/sounds/SE/hpDamageVariants/hpDamage5.mp3': 3332,
  '/sounds/SE/hpDamageVariants/hpDamage6.mp3': 7141,
  '/sounds/SE/apophisEclipseDrums.mp3': 40773,
  '/videos/ancient_god_tentacles.mp4': 1245936,
  '/img/btn/btn_author.webp': 6544,
  '/img/btn/btn_bright_green.webp': 7300,
  '/img/btn/btn_bright_purple.webp': 7254,
  '/img/btn/btn_dark_green.webp': 6736,
  '/img/btn/btn_dark_red.webp': 6016,
  '/img/btn/btn_dark_purple.webp': 6646,
  '/img/btn/btn_roadmap.webp': 7898,
  '/img/deco/deco_cth-no-bg.webp': 7784,
  '/img/line/line_split-no-bg.webp': 3830,
  '/img/line/line_titleguard-no-bg.webp': 944,
  '/img/logo/logo_cu-no-bg.webp': 1682,
  '/img/logo/logo_hu-no-bg.webp': 2108,
  '/img/logo/logo_tr-no-bg.webp': 2910,
  '/img/title/texture_toehp.webp': 19544,
  '/img/loading.webp': 10968,
  '/img/card/cardbg_zone.webp': 145436,
  '/img/card/cardbg_god.webp': 133576,
};

const RESOURCE_CACHE_VERSION = '2026-07-01-webp-assets';
const CACHE_VERSION_KEY = 'toe_resources_cached_version';
const RESOURCE_HEAD_TIMEOUT_MS = 3000;
const RESOURCE_LOAD_TIMEOUT_MS = 8000;

const LOAD_ERROR_LABELS = {
  audio: '音频加载失败',
  video: '视频加载失败',
  image: '图片加载失败',
};

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFallbackResourceSize(resource) {
  return RESOURCE_SIZE_FALLBACK[resource.path] || 0;
}

async function getResourceSize(resource) {
  const fallbackSize = getFallbackResourceSize(resource);
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), RESOURCE_HEAD_TIMEOUT_MS)
    : null;
  try {
    const response = await fetch(buildPublicUrl(resource.path), {
      method: 'HEAD',
      signal: controller?.signal,
    });
    if (response.ok) {
      const headerSize = parseInt(response.headers.get('content-length') || '0', 10) || 0;
      if (headerSize > 0) return headerSize;
    }
  } catch {
    // Some static hosts do not support HEAD/content-length; fallback sizes keep the UI useful.
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
  return fallbackSize;
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

  const img = new Image();
  img.crossOrigin = 'anonymous';
  return withTimeout((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = url;
  });
}

function scheduleDeferredPreload(resources) {
  const run = async () => {
    for (const resource of resources) {
      try {
        await loadResource(resource);
      } catch (error) {
        console.warn(`Deferred resource failed: ${resource.path}`, error);
      }
    }
  };

  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 3000 });
  } else {
    setTimeout(run, 0);
  }
}

export function useResourcePreload({ loadAllThemes = false } = {}) {
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingError, setLoadingError] = useState(null);
  const [currentFile, setCurrentFile] = useState('');
  const [totalSize, setTotalSize] = useState(0);
  const [loadedSize, setLoadedSize] = useState(0);
  const deferredStageRef = useRef('none');
  const deferredResources = useMemo(
    () => (loadAllThemes ? PRELOAD_PROFILES.allDeferred : PRELOAD_PROFILES.earthDeferred),
    [loadAllThemes]
  );

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
      try {
        const cachedVersion = localStorage.getItem(CACHE_VERSION_KEY);
        if (cachedVersion === RESOURCE_CACHE_VERSION) {
          setSafeIsLoading(false);
          deferredStageRef.current = loadAllThemes ? 'all' : 'earth';
          scheduleDeferredPreload(deferredResources);
          scheduleCardIllustrationIdleDownload();
          return;
        }
      } catch {
        // localStorage error, proceed with preloading.
      }

      let loadedCount = 0;
      let loadedBytes = 0;
      const totalFiles = PRELOAD_PROFILES.bootstrap.length;
      const resources = await Promise.all(
        PRELOAD_PROFILES.bootstrap.map(async resource => ({
          ...resource,
          size: await getResourceSize(resource),
        }))
      );
      const totalBytes = resources.reduce((sum, resource) => sum + resource.size, 0);
      setSafeTotalSize(totalBytes);

      for (const resource of resources) {
        if (cancelled) return;
        try {
          setSafeCurrentFile(resource.path.split('/').pop());
          await loadResource(resource);
        } catch (error) {
          console.error(`Failed to load ${resource.type}: ${resource.path}`, error);
          const errorLabel = LOAD_ERROR_LABELS[resource.type] || '资源加载失败';
          setSafeLoadingError(prev => prev || (error?.message ? `${errorLabel}: ${error.message}` : errorLabel));
        }

        loadedBytes += resource.size;
        loadedCount++;
        setSafeLoadedSize(loadedBytes);
        setSafeLoadingProgress(totalBytes > 0
          ? Math.min(100, (loadedBytes / totalBytes) * 100)
          : (loadedCount / totalFiles) * 100);
      }

      try {
        localStorage.setItem(CACHE_VERSION_KEY, RESOURCE_CACHE_VERSION);
      } catch {
        // localStorage error, ignore.
      }

      setSafeIsLoading(false);
      deferredStageRef.current = loadAllThemes ? 'all' : 'earth';
      scheduleDeferredPreload(deferredResources);
      scheduleCardIllustrationIdleDownload();
    };

    preloadResources();
    return () => {
      cancelled = true;
    };
  }, [deferredResources, loadAllThemes]);

  useEffect(() => {
    if (isLoading) return;
    const nextStage = loadAllThemes ? 'all' : 'earth';
    if (deferredStageRef.current === nextStage) return;
    if (deferredStageRef.current === 'all') return;
    deferredStageRef.current = nextStage;
    scheduleDeferredPreload(deferredResources);
  }, [deferredResources, isLoading, loadAllThemes]);

  return {
    isLoading,
    loadingProgress,
    loadingError,
    currentFile,
    totalSize,
    loadedSize,
  };
}
