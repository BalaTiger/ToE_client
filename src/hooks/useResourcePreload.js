import { useEffect, useState } from "react";
import { buildPublicUrl } from "../utils/url";

const AUDIO_FILES = [
  '/sounds/BGM/mainTheme.mp3',
  '/sounds/BGM/battle.mp3',
  '/sounds/SE/hpDamageVariants/hpDamage1.mp3',
  '/sounds/SE/hpDamageVariants/hpDamage2.mp3',
  '/sounds/SE/hpDamageVariants/hpDamage3.mp3',
  '/sounds/SE/hpDamageVariants/hpDamage4.mp3',
  '/sounds/SE/hpDamageVariants/hpDamage5.mp3',
  '/sounds/SE/hpDamageVariants/hpDamage6.mp3',
];

const VIDEO_FILES = [
  '/videos/ancient_god_tentacles.mp4',
];

const IMAGE_FILES = [
  '/img/bg/bg_main.png',
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
  '/img/bg/battle/earth_shadow.png',
  '/img/bg/battle/sage_gift.png',
  '/img/bg/battle/stars_call.png',
  '/img/bg/battle/bone_fuel.png',
];

const RESOURCE_FILES = [
  ...AUDIO_FILES.map(path => ({ path, type: 'audio' })),
  ...VIDEO_FILES.map(path => ({ path, type: 'video' })),
  ...IMAGE_FILES.map(path => ({ path, type: 'image' })),
];

const RESOURCE_CACHE_VERSION = '2026-05-22-battle-bg-v1';
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

async function getResourceSize(resource) {
  try {
    const response = await fetch(buildPublicUrl(resource.path), { method: 'HEAD' });
    return parseInt(response.headers.get('content-length') || '0', 10) || 0;
  } catch (error) {
    console.error(`Failed to get size for ${resource.path}`, error);
    return 0;
  }
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
