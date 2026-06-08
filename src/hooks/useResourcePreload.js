import { useEffect, useState } from "react";
import { ANIMATED_CARD_BACK_BY_EXPANSION, getVersionedAssetPath } from "../constants/card";
import { buildPublicUrl } from "../utils/url";

const AUDIO_FILES = [
  '/sounds/BGM/mainTheme.mp3',
  '/sounds/BGM/battle_earth_shadow.mp3',
  '/sounds/BGM/battle_stars_call.mp3',
  '/sounds/SE/hpDamageVariants/hpDamage1.mp3',
  '/sounds/SE/hpDamageVariants/hpDamage2.mp3',
  '/sounds/SE/hpDamageVariants/hpDamage3.mp3',
  '/sounds/SE/hpDamageVariants/hpDamage4.mp3',
  '/sounds/SE/hpDamageVariants/hpDamage5.mp3',
  '/sounds/SE/hpDamageVariants/hpDamage6.mp3',
  '/sounds/SE/apophisEclipseDrums.mp3',
];

const VIDEO_FILES = [
  '/videos/ancient_god_tentacles.mp4',
];

const CRITICAL_IMAGE_FILES = [
  '/img/btn/btn_author.png',
  '/img/btn/btn_bright_green.png',
  '/img/btn/btn_bright_purple.png',
  '/img/btn/btn_dark_green.png',
  '/img/btn/btn_dark_red.png',
  '/img/btn/btn_dark_purple.png',
  '/img/btn/btn_roadmap.png',
  '/img/deco/deco_cth-no-bg.png',
  '/img/line/line_split-no-bg.png',
  '/img/line/line_titleguard-no-bg.png',
  '/img/logo/logo_cu-no-bg.png',
  '/img/logo/logo_hu-no-bg.png',
  '/img/logo/logo_tr-no-bg.png',
  '/img/title/texture_toehp.png',
  '/img/loading.png',
];

const DEFERRED_IMAGE_FILES = [
  '/img/bg/bg_main.png',
  '/img/bg/battle/earth_shadow.png',
  '/img/bg/battle/sage_gift.png',
  '/img/bg/battle/stars_call.png',
  '/img/bg/battle/bone_fuel.png',
];

const ANIMATED_CARD_BACK_IMAGE_FILES = Object.values(ANIMATED_CARD_BACK_BY_EXPANSION).flatMap(anim => {
  if (anim?.sprite) return [getVersionedAssetPath(anim.sprite, anim.version)];
  if (!anim?.frameDir || !anim?.frameCount) return [];
  return Array.from({ length: anim.frameCount }, (_, index) => (
    `${anim.frameDir}/frame_${String(index).padStart(2, '0')}.png`
  ));
});

const RESOURCE_FILES = [
  ...AUDIO_FILES.map(path => ({ path, type: 'audio' })),
  ...VIDEO_FILES.map(path => ({ path, type: 'video' })),
  ...CRITICAL_IMAGE_FILES.map(path => ({ path, type: 'image' })),
];

const RESOURCE_SIZE_FALLBACK = {
  '/sounds/BGM/mainTheme.mp3': 4025782,
  '/sounds/BGM/battle_earth_shadow.mp3': 1961472,
  '/sounds/BGM/battle_stars_call.mp3': 8628480,
  '/sounds/SE/hpDamageVariants/hpDamage1.mp3': 4428,
  '/sounds/SE/hpDamageVariants/hpDamage2.mp3': 3331,
  '/sounds/SE/hpDamageVariants/hpDamage3.mp3': 3175,
  '/sounds/SE/hpDamageVariants/hpDamage4.mp3': 4478,
  '/sounds/SE/hpDamageVariants/hpDamage5.mp3': 3332,
  '/sounds/SE/hpDamageVariants/hpDamage6.mp3': 7141,
  '/sounds/SE/apophisEclipseDrums.mp3': 40773,
  '/videos/ancient_god_tentacles.mp4': 1245936,
  '/img/btn/btn_author.png': 24830,
  '/img/btn/btn_bright_green.png': 69629,
  '/img/btn/btn_bright_purple.png': 71888,
  '/img/btn/btn_dark_green.png': 77892,
  '/img/btn/btn_dark_red.png': 79375,
  '/img/btn/btn_dark_purple.png': 80330,
  '/img/btn/btn_roadmap.png': 26210,
  '/img/deco/deco_cth-no-bg.png': 21078,
  '/img/line/line_split-no-bg.png': 10753,
  '/img/line/line_titleguard-no-bg.png': 2336,
  '/img/logo/logo_cu-no-bg.png': 5277,
  '/img/logo/logo_hu-no-bg.png': 5418,
  '/img/logo/logo_tr-no-bg.png': 7888,
  '/img/title/texture_toehp.png': 278527,
  '/img/loading.png': 14538,
};

const DEFERRED_RESOURCE_FILES = [
  ...DEFERRED_IMAGE_FILES.map(path => ({ path, type: 'image' })),
  ...ANIMATED_CARD_BACK_IMAGE_FILES.map(path => ({ path, type: 'image' })),
];

const RESOURCE_CACHE_VERSION = '2026-06-08-cardback-sprite-v2';
const CACHE_VERSION_KEY = 'toe_resources_cached_version';

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
  try {
    const response = await fetch(buildPublicUrl(resource.path), { method: 'HEAD' });
    if (response.ok) {
      const headerSize = parseInt(response.headers.get('content-length') || '0', 10) || 0;
      if (headerSize > 0) return headerSize;
    }
  } catch (error) {
    // Some static hosts do not support HEAD/content-length; fallback sizes keep the UI useful.
  }
  return fallbackSize;
}

function loadResource(resource) {
  const url = buildPublicUrl(resource.path);

  if (resource.type === 'audio') {
    const audio = new Audio(url);
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    return new Promise((resolve, reject) => {
      audio.addEventListener('canplaythrough', resolve, { once: true });
      audio.addEventListener('error', reject, { once: true });
      audio.load();
    });
  }

  if (resource.type === 'video') {
    const video = document.createElement('video');
    video.src = url;
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous';
    return new Promise((resolve, reject) => {
      video.addEventListener('loadeddata', resolve, { once: true });
      video.addEventListener('error', reject, { once: true });
      video.load();
    });
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';
  return new Promise((resolve, reject) => {
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

export function useResourcePreload() {
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingError, setLoadingError] = useState(null);
  const [currentFile, setCurrentFile] = useState('');
  const [totalSize, setTotalSize] = useState(0);
  const [loadedSize, setLoadedSize] = useState(0);

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
          scheduleDeferredPreload(DEFERRED_RESOURCE_FILES);
          return;
        }
      } catch {
        // localStorage error, proceed with preloading.
      }

      let loadedCount = 0;
      let loadedBytes = 0;
      const totalFiles = RESOURCE_FILES.length;
      const resources = await Promise.all(
        RESOURCE_FILES.map(async resource => ({
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
        setSafeLoadingProgress((loadedCount / totalFiles) * 100);
      }

      try {
        localStorage.setItem(CACHE_VERSION_KEY, RESOURCE_CACHE_VERSION);
      } catch {
        // localStorage error, ignore.
      }

      setSafeIsLoading(false);
      scheduleDeferredPreload(DEFERRED_RESOURCE_FILES);
    };

    preloadResources();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    isLoading,
    loadingProgress,
    loadingError,
    currentFile,
    totalSize,
    loadedSize,
  };
}
