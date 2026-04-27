import { useEffect, useState } from "react";

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
  '/img/title/title_rule.png',
  '/img/title/texture_toehp.png',
];

const RESOURCE_CACHE_VERSION = '2026-04-24-mainui-v1';
const CACHE_VERSION_KEY = 'toe_resources_cached_version';

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function useResourcePreload() {
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingError] = useState(null);
  const [currentFile, setCurrentFile] = useState('');
  const [totalSize, setTotalSize] = useState(0);
  const [loadedSize, setLoadedSize] = useState(0);

  useEffect(() => {
    const preloadResources = async () => {
      try {
        const cachedVersion = localStorage.getItem(CACHE_VERSION_KEY);
        if (cachedVersion === RESOURCE_CACHE_VERSION) {
          setIsLoading(false);
          return;
        }
      } catch {
        // localStorage error, proceed with preloading
      }

      let loadedCount = 0;
      const totalFiles = AUDIO_FILES.length + VIDEO_FILES.length + IMAGE_FILES.length;
      let totalBytes = 0;
      let loadedBytes = 0;

      const calculateTotalSize = async () => {
        let total = 0;
        for (const file of [...AUDIO_FILES, ...VIDEO_FILES, ...IMAGE_FILES]) {
          try {
            const response = await fetch(file, { method: 'HEAD' });
            const size = parseInt(response.headers.get('content-length') || '0', 10);
            total += size;
          } catch (error) {
            console.error(`Failed to get size for ${file}`, error);
          }
        }
        return total;
      };

      totalBytes = await calculateTotalSize();
      setTotalSize(totalBytes);

      for (const file of AUDIO_FILES) {
        try {
          setCurrentFile(file.split('/').pop());
          const audio = new Audio(file);
          audio.crossOrigin = 'anonymous';

          let fileSize = 0;
          try {
            const response = await fetch(file, { method: 'HEAD' });
            fileSize = parseInt(response.headers.get('content-length') || '0', 10);
          } catch (error) {
            console.error(`Failed to get size for ${file}`, error);
          }

          await new Promise((resolve, reject) => {
            audio.addEventListener('canplaythrough', () => {
              loadedBytes += fileSize;
              setLoadedSize(loadedBytes);
              resolve();
            });
            audio.addEventListener('error', reject);
            audio.load();
          });
          loadedCount++;
          setLoadingProgress((loadedCount / totalFiles) * 100);
        } catch (error) {
          console.error(`Failed to load audio: ${file}`, error);
          loadedCount++;
          setLoadingProgress((loadedCount / totalFiles) * 100);
        }
      }

      for (const file of VIDEO_FILES) {
        try {
          setCurrentFile(file.split('/').pop());
          const video = document.createElement('video');
          video.src = file;
          video.preload = 'metadata';
          video.crossOrigin = 'anonymous';

          let fileSize = 0;
          try {
            const response = await fetch(file, { method: 'HEAD' });
            fileSize = parseInt(response.headers.get('content-length') || '0', 10);
          } catch (error) {
            console.error(`Failed to get size for ${file}`, error);
          }

          await new Promise((resolve, reject) => {
            video.addEventListener('loadeddata', () => {
              loadedBytes += fileSize;
              setLoadedSize(loadedBytes);
              resolve();
            });
            video.addEventListener('error', reject);
            video.load();
          });
          loadedCount++;
          setLoadingProgress((loadedCount / totalFiles) * 100);
        } catch (error) {
          console.error(`Failed to load video: ${file}`, error);
          loadedCount++;
          setLoadingProgress((loadedCount / totalFiles) * 100);
        }
      }

      for (const file of IMAGE_FILES) {
        try {
          setCurrentFile(file.split('/').pop());
          const img = new Image();
          img.crossOrigin = 'anonymous';

          let fileSize = 0;
          try {
            const response = await fetch(file, { method: 'HEAD' });
            fileSize = parseInt(response.headers.get('content-length') || '0', 10);
          } catch (error) {
            console.error(`Failed to get size for ${file}`, error);
          }

          await new Promise((resolve, reject) => {
            img.onload = () => {
              loadedBytes += fileSize;
              setLoadedSize(loadedBytes);
              resolve();
            };
            img.onerror = reject;
            img.src = file;
          });
          loadedCount++;
          setLoadingProgress((loadedCount / totalFiles) * 100);
        } catch (error) {
          console.error(`Failed to load image: ${file}`, error);
          loadedCount++;
          setLoadingProgress((loadedCount / totalFiles) * 100);
        }
      }

      try {
        localStorage.setItem(CACHE_VERSION_KEY, RESOURCE_CACHE_VERSION);
      } catch {
        // localStorage error, ignore
      }

      setIsLoading(false);
    };

    preloadResources();
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
