import { useCallback, useEffect, useState } from 'react';

export const MUSIC_VOLUME_KEY = 'cthulhu_music_volume';
export const SFX_VOLUME_KEY = 'cthulhu_sfx_volume';
export const GAMMA_KEY = 'cthulhu_gamma';

export function clampPreference(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

export function readStoredPreference(storage, key, { min, max, fallback }) {
  try {
    const raw = storage?.getItem(key);
    if (raw == null) return fallback;
    return clampPreference(raw, min, max, fallback);
  } catch {
    return fallback;
  }
}

export function persistPreference(storage, key, value) {
  try {
    storage?.setItem(key, String(value));
  } catch {
    // Storage can be unavailable in sandboxed/private browsing contexts.
  }
}

export function buildGammaFilter(gamma) {
  if (gamma === 1) return '';
  return `brightness(${gamma.toFixed(2)}) contrast(${(1 + (gamma - 1) * 0.3).toFixed(2)})`;
}

function getLocalStorage() {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function useGamePreferences() {
  const [musicVolume, setMusicVolume] = useState(() => readStoredPreference(
    getLocalStorage(),
    MUSIC_VOLUME_KEY,
    { min: 0, max: 1, fallback: 1 },
  ));
  const [sfxVolume, setSfxVolume] = useState(() => readStoredPreference(
    getLocalStorage(),
    SFX_VOLUME_KEY,
    { min: 0, max: 1, fallback: 1 },
  ));
  const [gamma, setGamma] = useState(() => readStoredPreference(
    getLocalStorage(),
    GAMMA_KEY,
    { min: 0.5, max: 2, fallback: 1 },
  ));

  const handleMusicVolume = useCallback(value => {
    const next = clampPreference(value, 0, 1, 1);
    setMusicVolume(next);
    persistPreference(getLocalStorage(), MUSIC_VOLUME_KEY, next);
  }, []);

  const handleSfxVolume = useCallback(value => {
    const next = clampPreference(value, 0, 1, 1);
    setSfxVolume(next);
    persistPreference(getLocalStorage(), SFX_VOLUME_KEY, next);
  }, []);

  const handleGamma = useCallback(value => {
    const next = clampPreference(value, 0.5, 2, 1);
    setGamma(next);
    persistPreference(getLocalStorage(), GAMMA_KEY, next);
  }, []);

  const gammaFilter = buildGammaFilter(gamma);
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    // Applying the filter to a React container changes the containing block for
    // fixed overlays. The body is viewport-sized and preserves their positioning.
    document.body.style.filter = gammaFilter;
    return () => {
      document.body.style.filter = '';
    };
  }, [gammaFilter]);

  return {
    gamma,
    musicVolume,
    sfxVolume,
    handleGamma,
    handleMusicVolume,
    handleSfxVolume,
  };
}
