/* eslint-disable react-hooks/immutability */
// ^ Audio element property mutations (currentTime, volume, pause) are DOM operations,
//   not React state mutations. The immutability rule falsely flags them because they
//   are reached via refs (bgmRefs / sfxRefs).
import { useState, useEffect, useRef, useCallback } from 'react';
import { BGM_AUDIO_BY_KEY, getBattleBgmKey } from '../constants/theme';
import { buildPublicUrl } from '../utils/url';

export function useGameAudio(isBattleScreen, expansionKey = '地神的潜影') {
  const [audioReady, setAudioReady] = useState(false);
  const readyRef = useRef(false);
  const bgmRefs = useRef({ main: null, battleEarth: null, battleStars: null });
  const sfxRefs = useRef({ open: null, close: null, hpDamage: [], sanDamage: [], hpRecover: [], sanRecover: [], apophisEclipse: null, throwStoneThrow: null, throwStoneRolling: null });
  const currentTrackRef = useRef(null);
  const fadeTokenRef = useRef(0);
  const targetVolumesRef = useRef(Object.fromEntries(Object.entries(BGM_AUDIO_BY_KEY).map(([key, config]) => [key, config.volume])));

  useEffect(() => {
    const main = new Audio(buildPublicUrl(BGM_AUDIO_BY_KEY.main.path));
    const battleEarth = new Audio(buildPublicUrl(BGM_AUDIO_BY_KEY.battleEarth.path));
    const battleStars = new Audio(buildPublicUrl(BGM_AUDIO_BY_KEY.battleStars.path));
    const open = new Audio(buildPublicUrl('sounds/SE/open.mp3'));
    const close = new Audio(buildPublicUrl('sounds/SE/close.mp3'));
    const apophisEclipse = new Audio(buildPublicUrl('sounds/SE/apophisEclipseDrums.mp3'));
    const throwStoneThrow = new Audio(buildPublicUrl('sounds/SE/throw.mp3'));
    const throwStoneRolling = new Audio(buildPublicUrl('sounds/SE/rolling-down.mp3'));
    const hpDamageVariants = Array.from({ length: 6 }, (_, i) =>
      new Audio(buildPublicUrl(`sounds/SE/hpDamageVariants/hpDamage${i + 1}.mp3`))
    );
    const hpRecoverVariants = Array.from({ length: 5 }, (_, i) =>
      new Audio(buildPublicUrl(`sounds/SE/hpRecoverVariants/hpRecover${i + 1}.mp3`))
    );
    const sanDamageConfigs = [
      { path: 'sounds/SE/sanDamageVariants/sanDamage1.mp3', impactOffsetMs: 800 },
      { path: 'sounds/SE/sanDamageVariants/sanDamage2.mp3', impactOffsetMs: 90 },
    ];
    const sanDamageVariants = sanDamageConfigs.map(config => ({
      ...config,
      audio: new Audio(buildPublicUrl(config.path)),
    }));
    const sanRecoverVariants = Array.from({ length: 4 }, (_, i) =>
      new Audio(buildPublicUrl(`sounds/SE/sanRecoverVariants/sanRecover${i + 1}.mp3`))
    );
    [main, battleEarth, battleStars].forEach(audio => {
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = 0;
    });
    [open, close].forEach(audio => {
      audio.preload = 'auto';
      audio.volume = 0.6;
    });
    apophisEclipse.preload = 'auto';
    apophisEclipse.volume = 0.68;
    throwStoneThrow.preload = 'auto';
    throwStoneThrow.volume = 0.95;
    throwStoneRolling.preload = 'auto';
    throwStoneRolling.volume = 0.22;
    hpDamageVariants.forEach(audio => {
      audio.preload = 'auto';
      audio.volume = 0.7;
    });
    sanDamageVariants.forEach(({ audio }) => {
      audio.preload = 'auto';
      audio.volume = 0.7;
    });
    hpRecoverVariants.forEach(audio => {
      audio.preload = 'auto';
      audio.volume = 0.68;
    });
    sanRecoverVariants.forEach(audio => {
      audio.preload = 'auto';
      audio.volume = 0.52;
    });
    bgmRefs.current = { main, battleEarth, battleStars };
    sfxRefs.current = { open, close, hpDamage: hpDamageVariants, sanDamage: sanDamageVariants, hpRecover: hpRecoverVariants, sanRecover: sanRecoverVariants, apophisEclipse, throwStoneThrow, throwStoneRolling };
    return () => {
      [main, battleEarth, battleStars, open, close, apophisEclipse, throwStoneThrow, throwStoneRolling, ...hpDamageVariants, ...sanDamageVariants.map(({ audio }) => audio), ...hpRecoverVariants, ...sanRecoverVariants].forEach(audio => {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch { /* ignore */ }
      });
    };
  }, []);

  const syncTrack = useCallback((instant = false) => {
    if (!audioReady) return;
    const nextKey = isBattleScreen ? getBattleBgmKey(expansionKey) : 'main';
    const prevKey = currentTrackRef.current;
    if (prevKey === nextKey) return;
    const nextAudio = bgmRefs.current[nextKey];
    const prevAudio = prevKey ? bgmRefs.current[prevKey] : null;
    if (!nextAudio) return;
    currentTrackRef.current = nextKey;
    const token = ++fadeTokenRef.current;
    const nextTarget = targetVolumesRef.current[nextKey];
    const prevStart = prevAudio?.volume ?? 0;
    const duration = instant ? 0 : 420;
    try {
      nextAudio.loop = true;
      nextAudio.volume = instant ? nextTarget : 0;
      nextAudio.play().catch(() => { });
    } catch { /* ignore */ }
    if (!prevAudio || duration === 0) {
      if (prevAudio && prevAudio !== nextAudio) {
        try {
          prevAudio.pause();
          prevAudio.currentTime = 0;
          prevAudio.volume = 0;
        } catch { /* ignore */ }
      }
      nextAudio.volume = nextTarget;
      return;
    }
    const start = performance.now();
    const step = now => {
      if (fadeTokenRef.current !== token) return;
      const progress = Math.min((now - start) / duration, 1);
      try { prevAudio.volume = prevStart * (1 - progress); } catch { /* ignore */ }
      try { nextAudio.volume = nextTarget * progress; } catch { /* ignore */ }
      if (progress < 1) {
        requestAnimationFrame(step);
        return;
      }
      try {
        prevAudio.pause();
        prevAudio.currentTime = 0;
        prevAudio.volume = 0;
      } catch { /* ignore */ }
      try { nextAudio.volume = nextTarget; } catch { /* ignore */ }
    };
    requestAnimationFrame(step);
  }, [audioReady, isBattleScreen, expansionKey]);

  useEffect(() => {
    syncTrack(false);
  }, [audioReady, isBattleScreen, expansionKey, syncTrack]);

  useEffect(() => {
    if (audioReady) return;
    const previewKey = isBattleScreen ? getBattleBgmKey(expansionKey) : 'main';
    const preview = bgmRefs.current[previewKey];
    if (!preview) return;
    try {
      preview.loop = true;
      preview.volume = targetVolumesRef.current[previewKey];
      preview.play().then(() => {
        if (!readyRef.current) {
          readyRef.current = true;
          setAudioReady(true);
          currentTrackRef.current = previewKey;
        }
      }).catch(() => { });
    } catch { /* ignore */ }
  }, [audioReady, isBattleScreen, expansionKey]);

  const noteUserGesture = useCallback(() => {
    if (!readyRef.current) {
      readyRef.current = true;
      setAudioReady(true);
      queueMicrotask(() => syncTrack(true));
    }
  }, [syncTrack]);

  useEffect(() => {
    if (audioReady) return;
    const unlock = () => noteUserGesture();
    const opts = { capture: true, once: true };
    window.addEventListener('pointerdown', unlock, opts);
    window.addEventListener('keydown', unlock, opts);
    window.addEventListener('touchstart', unlock, opts);
    return () => {
      window.removeEventListener('pointerdown', unlock, opts);
      window.removeEventListener('keydown', unlock, opts);
      window.removeEventListener('touchstart', unlock, opts);
    };
  }, [audioReady, noteUserGesture]);

  const playSfx = useCallback(kind => {
    noteUserGesture();
    const audio = sfxRefs.current[kind];
    if (!audio) return;
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.play().catch(() => { });
    } catch { /* ignore */ }
  }, [noteUserGesture]);

  const playTickSound = useCallback(() => {
    noteUserGesture();
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.05);
    } catch { /* ignore */ }
  }, [noteUserGesture]);

  const playVariantSfx = useCallback((kind, options = {}) => {
    noteUserGesture();
    const variants = sfxRefs.current[kind] || [];
    if (!variants.length) return;
    const variant = variants[Math.floor(Math.random() * variants.length)];
    const audio = variant?.audio || variant;
    if (!audio) return;
    const impactOffsetMs = Number.isFinite(variant?.impactOffsetMs) ? variant.impactOffsetMs : 0;
    const impactDelayMs = Number.isFinite(options.impactDelayMs) ? options.impactDelayMs : 0;
    const startAt = Math.max(0, (impactOffsetMs - impactDelayMs) / 1000);
    const delayMs = Math.max(0, impactDelayMs - impactOffsetMs);
    const play = () => {
      try {
        audio.pause();
        audio.currentTime = startAt;
        audio.play().catch(() => { });
      } catch { /* ignore */ }
    };
    if (delayMs > 0) {
      const timer = setTimeout(play, delayMs);
      return () => clearTimeout(timer);
    }
    play();
    return undefined;
  }, [noteUserGesture]);

  const playHpDamageSound = useCallback(() => playVariantSfx('hpDamage'), [playVariantSfx]);
  const playSanDamageSound = useCallback(options => playVariantSfx('sanDamage', options), [playVariantSfx]);
  const playHpRecoverSound = useCallback(() => playVariantSfx('hpRecover'), [playVariantSfx]);
  const playSanRecoverSound = useCallback(() => playVariantSfx('sanRecover'), [playVariantSfx]);
  const playOpenSound = useCallback(() => playSfx('open'), [playSfx]);
  const playCloseSound = useCallback(() => playSfx('close'), [playSfx]);
  const playApophisEclipseSound = useCallback(() => playSfx('apophisEclipse'), [playSfx]);
  const playThrowStoneThrowSound = useCallback(() => playSfx('throwStoneThrow'), [playSfx]);
  const playThrowStoneRollingSound = useCallback(({ hit = false } = {}) => {
    noteUserGesture();
    const audio = sfxRefs.current.throwStoneRolling;
    if (!audio) return;
    try {
      audio.pause();
      audio.volume = hit ? 0.22 : 0.42;
      audio.currentTime = hit ? 0 : 0.6;
      audio.play().catch(() => { });
    } catch { /* ignore */ }
  }, [noteUserGesture]);

  return {
    noteUserGesture,
    playOpenSound,
    playCloseSound,
    playTickSound,
    playHpDamageSound,
    playSanDamageSound,
    playHpRecoverSound,
    playSanRecoverSound,
    playApophisEclipseSound,
    playThrowStoneThrowSound,
    playThrowStoneRollingSound,
  };
}
