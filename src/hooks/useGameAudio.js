/* eslint-disable react-hooks/immutability */
// ^ Audio element property mutations (currentTime, volume, pause) are DOM operations,
//   not React state mutations. The immutability rule falsely flags them because they
//   are reached via refs (bgmRefs / sfxRefs).
import { useState, useEffect, useRef, useCallback } from 'react';
import { buildPublicUrl } from '../utils/url';

export function useGameAudio(isBattleScreen) {
  const [audioReady, setAudioReady] = useState(false);
  const readyRef = useRef(false);
  const bgmRefs = useRef({ main: null, battle: null });
  const sfxRefs = useRef({ open: null, close: null, hpDamage: [], apophisEclipse: null });
  const currentTrackRef = useRef(null);
  const fadeTokenRef = useRef(0);
  const targetVolumesRef = useRef({ main: 0.32, battle: 0.24 });

  useEffect(() => {
    const main = new Audio(buildPublicUrl('sounds/BGM/mainTheme.mp3'));
    const battle = new Audio(buildPublicUrl('sounds/BGM/battle.mp3'));
    const open = new Audio(buildPublicUrl('sounds/SE/open.mp3'));
    const close = new Audio(buildPublicUrl('sounds/SE/close.mp3'));
    const apophisEclipse = new Audio(buildPublicUrl('sounds/SE/apophisEclipseDrums.mp3'));
    const hpDamageVariants = Array.from({ length: 6 }, (_, i) =>
      new Audio(buildPublicUrl(`sounds/SE/hpDamageVariants/hpDamage${i + 1}.mp3`))
    );
    [main, battle].forEach(audio => {
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
    hpDamageVariants.forEach(audio => {
      audio.preload = 'auto';
      audio.volume = 0.7;
    });
    bgmRefs.current = { main, battle };
    sfxRefs.current = { open, close, hpDamage: hpDamageVariants, apophisEclipse };
    return () => {
      [main, battle, open, close, apophisEclipse, ...hpDamageVariants].forEach(audio => {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch { /* ignore */ }
      });
    };
  }, []);

  const syncTrack = useCallback((instant = false) => {
    if (!audioReady) return;
    const nextKey = isBattleScreen ? 'battle' : 'main';
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
  }, [audioReady, isBattleScreen]);

  useEffect(() => {
    syncTrack(false);
  }, [audioReady, isBattleScreen, syncTrack]);

  useEffect(() => {
    if (audioReady) return;
    const preview = isBattleScreen ? bgmRefs.current.battle : bgmRefs.current.main;
    if (!preview) return;
    try {
      preview.loop = true;
      preview.volume = targetVolumesRef.current[isBattleScreen ? 'battle' : 'main'];
      preview.play().then(() => {
        if (!readyRef.current) {
          readyRef.current = true;
          setAudioReady(true);
          currentTrackRef.current = isBattleScreen ? 'battle' : 'main';
        }
      }).catch(() => { });
    } catch { /* ignore */ }
  }, [audioReady, isBattleScreen]);

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

  const playHpDamageSound = useCallback(() => {
    noteUserGesture();
    const variants = sfxRefs.current.hpDamage || [];
    if (!variants.length) return;
    const audio = variants[Math.floor(Math.random() * variants.length)];
    if (!audio) return;
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.play().catch(() => { });
    } catch { /* ignore */ }
  }, [noteUserGesture]);

  const playOpenSound = useCallback(() => playSfx('open'), [playSfx]);
  const playCloseSound = useCallback(() => playSfx('close'), [playSfx]);
  const playApophisEclipseSound = useCallback(() => playSfx('apophisEclipse'), [playSfx]);

  return {
    noteUserGesture,
    playOpenSound,
    playCloseSound,
    playTickSound,
    playHpDamageSound,
    playApophisEclipseSound,
  };
}
