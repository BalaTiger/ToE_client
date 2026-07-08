/* eslint-disable react-hooks/immutability */
// ^ Audio element property mutations (currentTime, volume, pause) are DOM operations,
//   not React state mutations. The immutability rule falsely flags them because they
//   are reached via refs (bgmRefs / sfxRefs).
import { useState, useEffect, useRef, useCallback } from 'react';
import { BGM_AUDIO_BY_KEY, getBattleBgmKey } from '../constants/theme';
import { buildPublicUrl } from '../utils/url';

const ENDLESS_CORRIDOR_TUNNEL_VOLUME = 0.58;
const ENDLESS_CORRIDOR_TUNNEL_STOP_MS = 2900;
const EARTHQUAKE_VOLUME = 0.66;
const EARTHQUAKE_STOP_MS = 2500;
const EARTHQUAKE_FADE_MS = 220;
const GEOMAGNETIC_REVERSAL_VOLUME = 0.62;
const GEOMAGNETIC_REVERSAL_STOP_MS = 2450;
const GEOMAGNETIC_REVERSAL_FADE_MS = 260;
const STARTLED_BATS_VOLUME = 0.52;
const STARTLED_BATS_STOP_MS = 1050;
const STARTLED_BATS_FADE_MS = 180;
const NIGHT_WIND_VOLUME = 0.46;
const NIGHT_WIND_STOP_MS = 1650;
const IGNITE_TORCH_FIRE_VOLUME = 0.28;
const IGNITE_TORCH_FIRE_STOP_MS = 760;
const IGNITE_TORCH_FIRE_FADE_MS = 140;
const IGNITE_TORCH_FIRE_PLAYBACK_RATE = 1.35;
const IGNITE_TORCH_FIRE_VARIANTS = [
  { start: 0.45 },
  { start: 4.68 },
];
const ROPE_VOLUME = 0.48;
const DROPLET_VOLUME = 0.38;
const DROPLET_IMPACT_MS = 280;
const DROPLET_FADE_MS = 180;
const DROPLET_SEGMENT_GUARD_MS = 35;
const DROPLET_VARIANTS = [
  { start: 0, end: 1.416, impactMs: 520 },
  { start: 1.416, end: 2.832, impactMs: 330 },
  { start: 2.832, end: 4.248, impactMs: 310 },
  { start: 4.248, end: 5.664, impactMs: 310 },
  { start: 5.664, end: 7.08, impactMs: 295 },
];
const VOLCANO_BG_VOLUME = 0.22;
const VOLCANO_BG_FADE_MS = 320;
const VOLCANO_METEOR_VOLUME = 0.34;
const VOLCANO_METEOR_LEAD_MS = 520;
const VOLCANO_METEOR_TAIL_MS = 760;
const VOLCANO_METEOR_FADE_MS = 260;
const VOLCANO_METEOR_IMPACT_OFFSET_MS = {
  meteor1: 7200,
  meteor2: 6680,
};
const VOLCANO_COOLDOWN_VOLUME = 0.16;
const VOLCANO_COOLDOWN_DELAY_MS = 90;
const VOLCANO_COOLDOWN_START_AT = 0.18;
const VOLCANO_COOLDOWN_FADE_DELAY_MS = 180;
const VOLCANO_COOLDOWN_FADE_MS = 780;
const VOLCANO_AUDIO_POOL_SIZE = 7;
const SEMI_MATERIAL_BG_VOLUME = 0.9;
const SEMI_MATERIAL_BG_STOP_MS = 2830;
const SEMI_MATERIAL_BG_FADE_MS = 380;
const SEMI_MATERIAL_CHARGE_VOLUME = 0.82;
const SEMI_MATERIAL_CHARGE_DELAY_MS = 360;
const SEMI_MATERIAL_CHARGE_START_AT = 0;
const SEMI_MATERIAL_CHARGE_PLAYBACK_RATE = 1.25;
const SEMI_MATERIAL_CHARGE_STOP_MS = 1320;
const SEMI_MATERIAL_CHARGE_FADE_MS = 260;
const SEMI_MATERIAL_GLASS_VOLUME = 0.42;
const SEMI_MATERIAL_GLASS_DELAY_MS = 1690;
const SEMI_MATERIAL_BG_DELAY_MS = SEMI_MATERIAL_GLASS_DELAY_MS + 80;

export function useGameAudio(isBattleScreen, expansionKey = '地神的潜影') {
  const [audioReady, setAudioReady] = useState(false);
  const readyRef = useRef(false);
  const bgmRefs = useRef({ main: null, battleEarth: null, battleStars: null });
  const sfxRefs = useRef({ open: null, close: null, hpDamage: [], sanDamage: [], hpRecover: [], sanRecover: [], apophisEclipse: null, throwStoneThrow: null, throwStoneRolling: null, endlessCorridorTunnel: null, earthquake: null, geomagneticReversal: null, startledBats: null, nightWind: [], igniteTorchFire: null, rope: null, droplet: null, volcano: null, semiMaterial: null });
  const sfxStopTimersRef = useRef({});
  const sfxFadeFramesRef = useRef({});
  const sfxSequenceCleanupsRef = useRef({});
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
    const endlessCorridorTunnel = new Audio(buildPublicUrl('sounds/SE/tunnel-wind.mp3'));
    const earthquake = new Audio(buildPublicUrl('sounds/SE/earthquake.mp3'));
    const geomagneticReversal = new Audio(buildPublicUrl('sounds/SE/magnet.mp3'));
    const startledBats = new Audio(buildPublicUrl('sounds/SE/bat-colony.mp3'));
    const nightWindVariants = [
      new Audio(buildPublicUrl('sounds/SE/nightWind/nightWind1.mp3')),
      new Audio(buildPublicUrl('sounds/SE/nightWind/nightWind2.mp3')),
    ];
    const igniteTorchFire = new Audio(buildPublicUrl('sounds/SE/fire.mp3'));
    const rope = new Audio(buildPublicUrl('sounds/SE/rope.mp3'));
    const droplet = new Audio(buildPublicUrl('sounds/SE/droplet.mp3'));
    const semiMaterialBg = new Audio(buildPublicUrl('sounds/SE/semiMaterial/semiMaterial_bg.mp3'));
    const semiMaterialCharge = new Audio(buildPublicUrl('sounds/SE/semiMaterial/semiMaterial_charge.mp3'));
    const semiMaterialGlass = new Audio(buildPublicUrl('sounds/SE/semiMaterial/semiMaterial_glass.mp3'));
    const volcanoBg = new Audio(buildPublicUrl('sounds/SE/volcano/volcano_bg.mp3'));
    const volcanoMeteorPlayers = Array.from({ length: VOLCANO_AUDIO_POOL_SIZE }, () => ({
      meteor1: new Audio(buildPublicUrl('sounds/SE/volcano/volcano_meteor1.mp3')),
      meteor2: new Audio(buildPublicUrl('sounds/SE/volcano/volcano_meteor2.mp3')),
    }));
    const volcanoCooldownPlayers = Array.from({ length: VOLCANO_AUDIO_POOL_SIZE }, () =>
      new Audio(buildPublicUrl('sounds/SE/volcano/volcano_cooldown.mp3'))
    );
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
    endlessCorridorTunnel.preload = 'auto';
    endlessCorridorTunnel.volume = ENDLESS_CORRIDOR_TUNNEL_VOLUME;
    earthquake.preload = 'auto';
    earthquake.volume = EARTHQUAKE_VOLUME;
    geomagneticReversal.preload = 'auto';
    geomagneticReversal.volume = GEOMAGNETIC_REVERSAL_VOLUME;
    startledBats.preload = 'auto';
    startledBats.volume = STARTLED_BATS_VOLUME;
    nightWindVariants.forEach(audio => {
      audio.preload = 'auto';
      audio.volume = NIGHT_WIND_VOLUME;
    });
    igniteTorchFire.preload = 'auto';
    igniteTorchFire.volume = IGNITE_TORCH_FIRE_VOLUME;
    rope.preload = 'auto';
    rope.volume = ROPE_VOLUME;
    droplet.preload = 'auto';
    droplet.volume = DROPLET_VOLUME;
    semiMaterialBg.preload = 'auto';
    semiMaterialBg.volume = SEMI_MATERIAL_BG_VOLUME;
    semiMaterialCharge.preload = 'auto';
    semiMaterialCharge.volume = SEMI_MATERIAL_CHARGE_VOLUME;
    semiMaterialGlass.preload = 'auto';
    semiMaterialGlass.volume = SEMI_MATERIAL_GLASS_VOLUME;
    const volcanoAudios = [
      volcanoBg,
      ...volcanoMeteorPlayers.flatMap(player => [player.meteor1, player.meteor2]),
      ...volcanoCooldownPlayers,
    ];
    volcanoAudios.forEach(audio => {
      audio.preload = 'auto';
      audio.volume = 0;
    });
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
    sfxRefs.current = {
      open,
      close,
      hpDamage: hpDamageVariants,
      sanDamage: sanDamageVariants,
      hpRecover: hpRecoverVariants,
      sanRecover: sanRecoverVariants,
      apophisEclipse,
      throwStoneThrow,
      throwStoneRolling,
      endlessCorridorTunnel,
      earthquake,
      geomagneticReversal,
      startledBats,
      nightWind: nightWindVariants,
      igniteTorchFire,
      rope,
      droplet,
      semiMaterial: {
        bg: semiMaterialBg,
        charge: semiMaterialCharge,
        glass: semiMaterialGlass,
      },
      volcano: {
        bg: volcanoBg,
        meteorPlayers: volcanoMeteorPlayers,
        cooldownPlayers: volcanoCooldownPlayers,
      },
    };
    return () => {
      Object.values(sfxSequenceCleanupsRef.current).forEach(cleanup => {
        try { cleanup?.(); } catch { /* ignore */ }
      });
      sfxSequenceCleanupsRef.current = {};
      Object.values(sfxStopTimersRef.current).forEach(timer => clearTimeout(timer));
      sfxStopTimersRef.current = {};
      Object.values(sfxFadeFramesRef.current).forEach(frame => cancelAnimationFrame(frame));
      sfxFadeFramesRef.current = {};
      [main, battleEarth, battleStars, open, close, apophisEclipse, throwStoneThrow, throwStoneRolling, endlessCorridorTunnel, earthquake, geomagneticReversal, startledBats, ...nightWindVariants, igniteTorchFire, rope, droplet, semiMaterialBg, semiMaterialCharge, semiMaterialGlass, ...volcanoAudios, ...hpDamageVariants, ...sanDamageVariants.map(({ audio }) => audio), ...hpRecoverVariants, ...sanRecoverVariants].forEach(audio => {
        try {
          audio.pause();
          audio.currentTime = 0;
          audio.playbackRate = 1;
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
  const playEndlessCorridorTunnelSound = useCallback(() => {
    noteUserGesture();
    const audio = sfxRefs.current.endlessCorridorTunnel;
    if (!audio) return;
    clearTimeout(sfxStopTimersRef.current.endlessCorridorTunnel);
    try {
      audio.pause();
      audio.volume = ENDLESS_CORRIDOR_TUNNEL_VOLUME;
      audio.currentTime = 0;
      audio.play().catch(error => {
        console.warn('[audio] endless corridor tunnel sound blocked', error);
      });
      sfxStopTimersRef.current.endlessCorridorTunnel = setTimeout(() => {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch { /* ignore */ }
      }, ENDLESS_CORRIDOR_TUNNEL_STOP_MS);
    } catch { /* ignore */ }
  }, [noteUserGesture]);
  const fadeOutAudio = useCallback((audio, key, fadeMs, resetVolume = 0) => {
    if (!audio) return;
    if (sfxFadeFramesRef.current[key]) {
      cancelAnimationFrame(sfxFadeFramesRef.current[key]);
      sfxFadeFramesRef.current[key] = null;
    }
    const startVolume = audio.volume || resetVolume;
    const start = performance.now();
    const step = now => {
      const progress = Math.min((now - start) / Math.max(1, fadeMs), 1);
      try { audio.volume = startVolume * (1 - progress); } catch { /* ignore */ }
      if (progress < 1) {
        sfxFadeFramesRef.current[key] = requestAnimationFrame(step);
        return;
      }
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = resetVolume;
      } catch { /* ignore */ }
      sfxFadeFramesRef.current[key] = null;
    };
    sfxFadeFramesRef.current[key] = requestAnimationFrame(step);
  }, []);
  const playStartledBatsSound = useCallback(() => {
    noteUserGesture();
    const audio = sfxRefs.current.startledBats;
    if (!audio) return undefined;
    const fadeKey = 'startledBats';
    clearTimeout(sfxStopTimersRef.current.startledBats);
    if (sfxFadeFramesRef.current[fadeKey]) {
      cancelAnimationFrame(sfxFadeFramesRef.current[fadeKey]);
      sfxFadeFramesRef.current[fadeKey] = null;
    }
    try {
      audio.pause();
      audio.volume = STARTLED_BATS_VOLUME;
      audio.currentTime = 0;
      audio.play().catch(() => { });
      sfxStopTimersRef.current.startledBats = setTimeout(() => {
        fadeOutAudio(audio, fadeKey, STARTLED_BATS_FADE_MS, STARTLED_BATS_VOLUME);
      }, Math.max(0, STARTLED_BATS_STOP_MS - STARTLED_BATS_FADE_MS));
    } catch { /* ignore */ }
    return () => {
      clearTimeout(sfxStopTimersRef.current.startledBats);
      if (sfxFadeFramesRef.current[fadeKey]) {
        cancelAnimationFrame(sfxFadeFramesRef.current[fadeKey]);
        sfxFadeFramesRef.current[fadeKey] = null;
      }
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = STARTLED_BATS_VOLUME;
      } catch { /* ignore */ }
    };
  }, [fadeOutAudio, noteUserGesture]);
  const playNightWindSound = useCallback(() => {
    noteUserGesture();
    const variants = sfxRefs.current.nightWind || [];
    if (!variants.length) return undefined;
    clearTimeout(sfxStopTimersRef.current.nightWind);
    variants.forEach(audio => {
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = NIGHT_WIND_VOLUME;
      } catch { /* ignore */ }
    });
    const audio = variants[Math.floor(Math.random() * variants.length)] || variants[0];
    try {
      audio.currentTime = 0;
      audio.volume = NIGHT_WIND_VOLUME;
      audio.play().catch(() => { });
      sfxStopTimersRef.current.nightWind = setTimeout(() => {
        try {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = NIGHT_WIND_VOLUME;
        } catch { /* ignore */ }
      }, NIGHT_WIND_STOP_MS + 80);
    } catch { /* ignore */ }
    return () => {
      clearTimeout(sfxStopTimersRef.current.nightWind);
      variants.forEach(item => {
        try {
          item.pause();
          item.currentTime = 0;
          item.volume = NIGHT_WIND_VOLUME;
        } catch { /* ignore */ }
      });
    };
  }, [noteUserGesture]);
  const playIgniteTorchFireSound = useCallback(({ durationMs = IGNITE_TORCH_FIRE_STOP_MS } = {}) => {
    noteUserGesture();
    const audio = sfxRefs.current.igniteTorchFire;
    if (!audio) return undefined;
    const variant = IGNITE_TORCH_FIRE_VARIANTS[Math.floor(Math.random() * IGNITE_TORCH_FIRE_VARIANTS.length)] || IGNITE_TORCH_FIRE_VARIANTS[0];
    const fadeKey = 'igniteTorchFire';
    clearTimeout(sfxStopTimersRef.current.igniteTorchFire);
    if (sfxFadeFramesRef.current[fadeKey]) {
      cancelAnimationFrame(sfxFadeFramesRef.current[fadeKey]);
      sfxFadeFramesRef.current[fadeKey] = null;
    }
    try {
      audio.pause();
      audio.volume = IGNITE_TORCH_FIRE_VOLUME;
      audio.playbackRate = IGNITE_TORCH_FIRE_PLAYBACK_RATE;
      audio.currentTime = variant.start;
      audio.play().catch(() => { });
      sfxStopTimersRef.current.igniteTorchFire = setTimeout(() => {
        fadeOutAudio(audio, fadeKey, IGNITE_TORCH_FIRE_FADE_MS, IGNITE_TORCH_FIRE_VOLUME);
      }, Math.max(0, durationMs - IGNITE_TORCH_FIRE_FADE_MS));
    } catch { /* ignore */ }
    return () => {
      clearTimeout(sfxStopTimersRef.current.igniteTorchFire);
      if (sfxFadeFramesRef.current[fadeKey]) {
        cancelAnimationFrame(sfxFadeFramesRef.current[fadeKey]);
        sfxFadeFramesRef.current[fadeKey] = null;
      }
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.playbackRate = 1;
        audio.volume = IGNITE_TORCH_FIRE_VOLUME;
      } catch { /* ignore */ }
    };
  }, [fadeOutAudio, noteUserGesture]);
  const playGeomagneticReversalSound = useCallback(() => {
    noteUserGesture();
    const audio = sfxRefs.current.geomagneticReversal;
    if (!audio) return undefined;
    const fadeKey = 'geomagneticReversal';
    clearTimeout(sfxStopTimersRef.current.geomagneticReversal);
    if (sfxFadeFramesRef.current[fadeKey]) {
      cancelAnimationFrame(sfxFadeFramesRef.current[fadeKey]);
      sfxFadeFramesRef.current[fadeKey] = null;
    }
    try {
      audio.pause();
      audio.volume = GEOMAGNETIC_REVERSAL_VOLUME;
      audio.currentTime = 0;
      audio.play().catch(() => { });
      sfxStopTimersRef.current.geomagneticReversal = setTimeout(() => {
        fadeOutAudio(audio, fadeKey, GEOMAGNETIC_REVERSAL_FADE_MS, GEOMAGNETIC_REVERSAL_VOLUME);
      }, Math.max(0, GEOMAGNETIC_REVERSAL_STOP_MS - GEOMAGNETIC_REVERSAL_FADE_MS));
    } catch { /* ignore */ }
    return () => {
      clearTimeout(sfxStopTimersRef.current.geomagneticReversal);
      if (sfxFadeFramesRef.current[fadeKey]) {
        cancelAnimationFrame(sfxFadeFramesRef.current[fadeKey]);
        sfxFadeFramesRef.current[fadeKey] = null;
      }
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = GEOMAGNETIC_REVERSAL_VOLUME;
      } catch { /* ignore */ }
    };
  }, [fadeOutAudio, noteUserGesture]);
  const stopEarthquakeSound = useCallback(({ fade = true } = {}) => {
    const audio = sfxRefs.current.earthquake;
    if (!audio) return;
    clearTimeout(sfxStopTimersRef.current.earthquake);
    if (sfxFadeFramesRef.current.earthquake) {
      cancelAnimationFrame(sfxFadeFramesRef.current.earthquake);
      sfxFadeFramesRef.current.earthquake = null;
    }
    if (!fade) {
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = EARTHQUAKE_VOLUME;
      } catch { /* ignore */ }
      return;
    }
    const startVolume = audio.volume || EARTHQUAKE_VOLUME;
    const start = performance.now();
    const step = now => {
      const progress = Math.min((now - start) / EARTHQUAKE_FADE_MS, 1);
      try { audio.volume = startVolume * (1 - progress); } catch { /* ignore */ }
      if (progress < 1) {
        sfxFadeFramesRef.current.earthquake = requestAnimationFrame(step);
        return;
      }
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = EARTHQUAKE_VOLUME;
      } catch { /* ignore */ }
      sfxFadeFramesRef.current.earthquake = null;
    };
    sfxFadeFramesRef.current.earthquake = requestAnimationFrame(step);
  }, []);
  const playEarthquakeSound = useCallback(({ durationMs = EARTHQUAKE_STOP_MS } = {}) => {
    noteUserGesture();
    const audio = sfxRefs.current.earthquake;
    if (!audio) return undefined;
    clearTimeout(sfxStopTimersRef.current.earthquake);
    if (sfxFadeFramesRef.current.earthquake) {
      cancelAnimationFrame(sfxFadeFramesRef.current.earthquake);
      sfxFadeFramesRef.current.earthquake = null;
    }
    try {
      audio.pause();
      audio.volume = EARTHQUAKE_VOLUME;
      audio.currentTime = 0;
      audio.play().catch(() => { });
      sfxStopTimersRef.current.earthquake = setTimeout(() => {
        stopEarthquakeSound({ fade: true });
      }, Math.max(0, durationMs - EARTHQUAKE_FADE_MS));
    } catch { /* ignore */ }
    return () => stopEarthquakeSound({ fade: false });
  }, [noteUserGesture, stopEarthquakeSound]);
  const playRopeSound = useCallback(() => {
    noteUserGesture();
    const audio = sfxRefs.current.rope;
    if (!audio) return;
    try {
      audio.pause();
      audio.volume = ROPE_VOLUME;
      audio.currentTime = 0;
      audio.play().catch(() => { });
    } catch { /* ignore */ }
  }, [noteUserGesture]);
  const playUndergroundSpringDropletSound = useCallback(() => {
    noteUserGesture();
    const audio = sfxRefs.current.droplet;
    if (!audio) return undefined;
    const variant = DROPLET_VARIANTS[Math.floor(Math.random() * DROPLET_VARIANTS.length)] || DROPLET_VARIANTS[0];
    const fadeKey = 'droplet';
    clearTimeout(sfxStopTimersRef.current.droplet);
    if (sfxFadeFramesRef.current[fadeKey]) {
      cancelAnimationFrame(sfxFadeFramesRef.current[fadeKey]);
      sfxFadeFramesRef.current[fadeKey] = null;
    }
    try {
      audio.pause();
      audio.volume = DROPLET_VOLUME;
      const startAt = variant.start + Math.max(0, (variant.impactMs - DROPLET_IMPACT_MS) / 1000);
      const remainingMs = Math.max(
        DROPLET_FADE_MS,
        ((variant.end ?? (variant.start + 1.416)) - startAt) * 1000 - DROPLET_SEGMENT_GUARD_MS
      );
      audio.currentTime = startAt;
      audio.play().catch(() => { });
      sfxStopTimersRef.current.droplet = setTimeout(() => {
        fadeOutAudio(audio, fadeKey, DROPLET_FADE_MS, DROPLET_VOLUME);
      }, Math.max(0, remainingMs - DROPLET_FADE_MS));
    } catch { /* ignore */ }
    return () => {
      clearTimeout(sfxStopTimersRef.current.droplet);
      if (sfxFadeFramesRef.current[fadeKey]) {
        cancelAnimationFrame(sfxFadeFramesRef.current[fadeKey]);
        sfxFadeFramesRef.current[fadeKey] = null;
      }
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = DROPLET_VOLUME;
      } catch { /* ignore */ }
    };
  }, [fadeOutAudio, noteUserGesture]);
  const playVolcanoSound = useCallback(({ impactTimes = [], durationMs = 2500 } = {}) => {
    noteUserGesture();
    const volcano = sfxRefs.current.volcano;
    if (!volcano) return undefined;
    sfxSequenceCleanupsRef.current.volcano?.();
    const timers = [];
    const fadeKeys = new Set();
    const sequenceKey = Date.now();
    const addTimer = (timer) => timers.push(timer);
    const addFadeKey = (key) => fadeKeys.add(key);
    const stopAudio = (audio, resetVolume = 0) => {
      if (!audio) return;
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = resetVolume;
      } catch { /* ignore */ }
    };
    const stopAll = () => {
      timers.forEach(timer => clearTimeout(timer));
      fadeKeys.forEach(key => {
        if (sfxFadeFramesRef.current[key]) {
          cancelAnimationFrame(sfxFadeFramesRef.current[key]);
          sfxFadeFramesRef.current[key] = null;
        }
      });
      stopAudio(volcano.bg, VOLCANO_BG_VOLUME);
      (volcano.meteorPlayers || []).forEach(player => {
        stopAudio(player.meteor1, VOLCANO_METEOR_VOLUME);
        stopAudio(player.meteor2, VOLCANO_METEOR_VOLUME);
      });
      (volcano.cooldownPlayers || []).forEach(audio => stopAudio(audio, VOLCANO_COOLDOWN_VOLUME));
      if (sfxSequenceCleanupsRef.current.volcano === stopAll) delete sfxSequenceCleanupsRef.current.volcano;
    };
    sfxSequenceCleanupsRef.current.volcano = stopAll;
    try {
      volcano.bg.pause();
      volcano.bg.currentTime = 0;
      volcano.bg.volume = VOLCANO_BG_VOLUME;
      volcano.bg.play().catch(() => { });
      const bgFadeKey = `volcano-bg-${sequenceKey}`;
      addFadeKey(bgFadeKey);
      addTimer(setTimeout(() => {
        fadeOutAudio(volcano.bg, bgFadeKey, VOLCANO_BG_FADE_MS, VOLCANO_BG_VOLUME);
      }, Math.max(0, durationMs - VOLCANO_BG_FADE_MS)));
    } catch { /* ignore */ }
    const impacts = impactTimes.length ? impactTimes : [];
    impacts.forEach((impact, idx) => {
      const impactMs = Math.max(0, (impact?.impactAt || 0) * 1000);
      const meteorPlayer = volcano.meteorPlayers?.[idx % (volcano.meteorPlayers?.length || 1)];
      const cooldownAudio = volcano.cooldownPlayers?.[idx % (volcano.cooldownPlayers?.length || 1)];
      addTimer(setTimeout(() => {
        const variant = Math.random() < 0.5 ? 'meteor1' : 'meteor2';
        const audio = meteorPlayer?.[variant];
        if (!audio) return;
        const fadeKey = `volcano-meteor-${sequenceKey}-${idx}`;
        addFadeKey(fadeKey);
        try {
          audio.pause();
          audio.volume = VOLCANO_METEOR_VOLUME;
          audio.currentTime = Math.max(0, (VOLCANO_METEOR_IMPACT_OFFSET_MS[variant] - VOLCANO_METEOR_LEAD_MS) / 1000);
          audio.play().catch(() => { });
          addTimer(setTimeout(() => {
            fadeOutAudio(audio, fadeKey, VOLCANO_METEOR_FADE_MS, VOLCANO_METEOR_VOLUME);
          }, VOLCANO_METEOR_LEAD_MS + VOLCANO_METEOR_TAIL_MS));
        } catch { /* ignore */ }
      }, Math.max(0, impactMs - VOLCANO_METEOR_LEAD_MS)));
      addTimer(setTimeout(() => {
        if (!cooldownAudio) return;
        const fadeKey = `volcano-cooldown-${sequenceKey}-${idx}`;
        addFadeKey(fadeKey);
        try {
          cooldownAudio.pause();
          cooldownAudio.volume = VOLCANO_COOLDOWN_VOLUME;
          cooldownAudio.currentTime = VOLCANO_COOLDOWN_START_AT;
          cooldownAudio.play().catch(() => { });
          addTimer(setTimeout(() => {
            fadeOutAudio(cooldownAudio, fadeKey, VOLCANO_COOLDOWN_FADE_MS, VOLCANO_COOLDOWN_VOLUME);
          }, VOLCANO_COOLDOWN_FADE_DELAY_MS));
        } catch { /* ignore */ }
      }, impactMs + VOLCANO_COOLDOWN_DELAY_MS));
    });
    addTimer(setTimeout(stopAll, durationMs + 360));
    return stopAll;
  }, [fadeOutAudio, noteUserGesture]);
  const playSemiMaterialSound = useCallback(() => {
    noteUserGesture();
    const semiMaterial = sfxRefs.current.semiMaterial;
    if (!semiMaterial) return undefined;
    sfxSequenceCleanupsRef.current.semiMaterial?.();
    const timers = [];
    const fadeKeys = new Set();
    const sequenceKey = Date.now();
    const addTimer = timer => timers.push(timer);
    const addFadeKey = key => fadeKeys.add(key);
    const stopAudio = (audio, resetVolume) => {
      if (!audio) return;
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.playbackRate = 1;
        audio.volume = resetVolume;
      } catch { /* ignore */ }
    };
    const stopAll = () => {
      timers.forEach(timer => clearTimeout(timer));
      fadeKeys.forEach(key => {
        if (sfxFadeFramesRef.current[key]) {
          cancelAnimationFrame(sfxFadeFramesRef.current[key]);
          sfxFadeFramesRef.current[key] = null;
        }
      });
      stopAudio(semiMaterial.charge, SEMI_MATERIAL_CHARGE_VOLUME);
      stopAudio(semiMaterial.bg, SEMI_MATERIAL_BG_VOLUME);
      stopAudio(semiMaterial.glass, SEMI_MATERIAL_GLASS_VOLUME);
      if (sfxSequenceCleanupsRef.current.semiMaterial === stopAll) delete sfxSequenceCleanupsRef.current.semiMaterial;
    };
    sfxSequenceCleanupsRef.current.semiMaterial = stopAll;
    addTimer(setTimeout(() => {
      try {
        const chargeFadeKey = `semi-material-charge-${sequenceKey}`;
        addFadeKey(chargeFadeKey);
        semiMaterial.charge.pause();
        semiMaterial.charge.currentTime = SEMI_MATERIAL_CHARGE_START_AT;
        semiMaterial.charge.playbackRate = SEMI_MATERIAL_CHARGE_PLAYBACK_RATE;
        semiMaterial.charge.volume = SEMI_MATERIAL_CHARGE_VOLUME;
        semiMaterial.charge.play().catch(() => { });
        addTimer(setTimeout(() => {
          fadeOutAudio(semiMaterial.charge, chargeFadeKey, SEMI_MATERIAL_CHARGE_FADE_MS, SEMI_MATERIAL_CHARGE_VOLUME);
        }, Math.max(0, SEMI_MATERIAL_CHARGE_STOP_MS - SEMI_MATERIAL_CHARGE_FADE_MS)));
      } catch { /* ignore */ }
    }, SEMI_MATERIAL_CHARGE_DELAY_MS));
    addTimer(setTimeout(() => {
      try {
        semiMaterial.glass.pause();
        semiMaterial.glass.currentTime = 0;
        semiMaterial.glass.volume = SEMI_MATERIAL_GLASS_VOLUME;
        semiMaterial.glass.play().catch(() => { });
      } catch { /* ignore */ }
    }, SEMI_MATERIAL_GLASS_DELAY_MS));
    addTimer(setTimeout(() => {
      try {
        const bgFadeKey = `semi-material-bg-${sequenceKey}`;
        addFadeKey(bgFadeKey);
        semiMaterial.bg.pause();
        semiMaterial.bg.currentTime = 0;
        semiMaterial.bg.volume = SEMI_MATERIAL_BG_VOLUME;
        semiMaterial.bg.play().catch(() => { });
        addTimer(setTimeout(() => {
          fadeOutAudio(semiMaterial.bg, bgFadeKey, SEMI_MATERIAL_BG_FADE_MS, SEMI_MATERIAL_BG_VOLUME);
        }, Math.max(0, SEMI_MATERIAL_BG_STOP_MS - SEMI_MATERIAL_BG_FADE_MS)));
      } catch { /* ignore */ }
    }, SEMI_MATERIAL_BG_DELAY_MS));
    addTimer(setTimeout(stopAll, SEMI_MATERIAL_BG_DELAY_MS + SEMI_MATERIAL_BG_STOP_MS + 360));
    return stopAll;
  }, [fadeOutAudio, noteUserGesture]);

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
    playEndlessCorridorTunnelSound,
    playEarthquakeSound,
    playGeomagneticReversalSound,
    playStartledBatsSound,
    playNightWindSound,
    playIgniteTorchFireSound,
    playRopeSound,
    playUndergroundSpringDropletSound,
    playVolcanoSound,
    playSemiMaterialSound,
  };
}
