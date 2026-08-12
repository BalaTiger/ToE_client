/* eslint-disable react-hooks/immutability */
// ^ Audio element property mutations (currentTime, volume, pause) are DOM operations,
//   not React state mutations. The immutability rule falsely flags them because they
//   are reached via refs (bgmRefs / sfxRefs).
import { useState, useEffect, useRef, useCallback } from 'react';
import { BGM_AUDIO_BY_KEY, getBattleBgmKey } from '../constants/theme';
import { buildPublicUrl } from '../utils/url';
import {
  CAVE_DUEL_SOUND_TIMING,
  startCaveDuelSoundSequence,
} from '../audio/caveDuelSoundSequence';
import { startTrackEndFadeMonitor } from '../audio/trackEndFadeMonitor';

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
const NIGHT_WIND_FADE_MS = 1750;
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
const BURROWING_WORM_EARTH_VOLUME = 0.34;
const BURROWING_WORM_DRILL_VOLUME = 0.78;
const BURROWING_WORM_BURROW_LEAD_MS = 120;
const BURROWING_WORM_BURROW_DURATION_MS = 760;
const BURROWING_WORM_BURROWS = [
  { delayMs: 120, drillStartAt: 2.02, earthStartAt: 2.1 },
  { delayMs: 580, drillStartAt: 2.48, earthStartAt: 1.95 },
  { delayMs: 1040, drillStartAt: 3.12, earthStartAt: 2.02 },
];
const BURROWING_WORM_ATTACK_VOLUME = 0.42;
const BURROWING_WORM_ATTACK_DELAY_MS = 1445;
const BURROWING_WORM_ATTACK_PLAYBACK_RATE = 1.19;
const BURROWING_WORM_ATTACK_STOP_MS = 1280;
const BURROWING_WORM_ATTACK_FADE_MS = 180;
const SNAKE_TRAP_HISS_VOLUME = 0.18;
const SNAKE_TRAP_HISS_STOP_MS = 1550;
const SNAKE_TRAP_HISS_FADE_MS = 220;
const SNAKE_TRAP_ATTACK_VOLUME = 0.48;
const SNAKE_TRAP_ATTACK_START_DELAY_MS = 1750;
const SNAKE_TRAP_ATTACK_INTERVAL_MS = 320;
const SNAKE_TRAP_ATTACK_POOL_SIZE = 4;
const CTH_RLYEH_DREAM_VOLUME = 0.42;
const CTH_RLYEH_DREAM_STOP_MS = 2950;
const GOD_POWER_BLOCKED_VOLUME = 0.56;
const GOD_POWER_BLOCKED_STOP_MS = 1790;
const TSG_SLIME_POP_VOLUME = 0.34;
const TSG_SLIME_POP_DELAY_MS = 140;
const TSG_SLIME_POP_STOP_MS = 1500;
const TSG_SLIME_POP_VARIANT_COUNT = 4;
const TSG_SLIME_CREATE_VOLUME = 0.4;
const TSG_SLIME_CREATE_VARIANT_COUNT = 4;
const ONE_CARD_SHIFT_VARIANTS = [
  { path: 'sounds/SE/common/card/one_card_shift1.mp3', volume: 0.72 },
  { path: 'sounds/SE/common/card/one_card_shift2.mp3', volume: 0.32 },
];
const MULTI_CARD_SHIFT_VOLUME = 0.42;
const DICE_ROLL_VOLUME = 0.46;
const DICE_ROLL_STOP_MS = 1200;
const DICE_ROLL_FADE_MS = 120;
const TURN_START_VOLUME = 0.72;
const TURN_START_FALLBACK_DURATION_MS = 3600;
const TURN_START_FADE_MS = 900;
const SKILL_HUNT_VOLUME = 0.55;
const SKILL_HUNT_STOP_MS = 1250;
const SKILL_SWAP_VOLUME = 0.62;
const SKILL_SWAP_STOP_MS = 1300;
const SKILL_BEWITCH_VOLUME = 0.64;
const SKILL_BEWITCH_STOP_MS = 2200;
const GOD_HIGHLIGHT_VOLUME = 0.64;
const GOD_HIGHLIGHT_STOP_MS = 6400;
// The heartbeat source is mastered about 7–8 dB hotter than the other
// cinematic SFX, so keep it deliberately below the highlight/turn stingers.
const VRI_IMMORTAL_REVEAL_VOLUME = 0.28;
const VRI_IMMORTAL_REVEAL_STOP_MS = 2300;
const VRI_IMMORTAL_REVEAL_FADE_MS = 420;
const POSITIVE_CARD_FLIP_VOLUME = 0.58;
const POSITIVE_CARD_FLIP_STOP_MS = 2700;
const NEUTRAL_CARD_FLIP_VOLUME = 0.5;
const NEUTRAL_CARD_FLIP_STOP_MS = 3000;
const NEGATIVE_CARD_FLIP_VOLUME = 0.5;
const NEGATIVE_CARD_FLIP_FALLBACK_DURATION_MS = 2160;
const NEGATIVE_CARD_FLIP_FADE_MS = 620;
// Finish the programmatic fade just before the encoded track ends, so the
// browser never cuts a still-audible sample at its natural end.
const TRACK_END_FADE_GUARD_MS = 40;
const WHEEL_SPIN_VOLUME = 0.46;
const WHEEL_SPIN_STOP_MS = 2240;
const WHEEL_SPIN_FADE_MS = 160;
const BLACK_GOAT_RUN_VOLUME = 0.82;
const BLACK_GOAT_RUN_DEFAULT_DURATION_MS = 1280;
const BLACK_GOAT_RUN_FADE_MS = 150;
const BLACK_GOAT_PULSE_VOLUME = 0.78;
const BLACK_GOAT_PULSE_VARIANT_COUNT = 5;
const BLACK_GOAT_PULSE_STOP_MS = 820;
// death2 averages about 1.9 dB quieter, so its gain is raised to match death1.
const GUILLOTINE_DEATH_VARIANTS = [
  { path: 'sounds/SE/common/death/death1.mp3', volume: 0.38 },
  { path: 'sounds/SE/common/death/death2.mp3', volume: 0.47 },
];
const GUILLOTINE_DEATH_STOP_MS = 2500;
const GUILLOTINE_DEATH_FADE_MS = 220;
const PETRIFY_DEATH_VOLUME = 0.58;
const PETRIFY_DEATH_VARIANT_COUNT = 4;
const PETRIFY_DEATH_STOP_MS = 2350;
const PETRIFY_DEATH_FADE_MS = 220;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep01(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function distanceAttenuation(distance, rolloff = 1.55, minGain = 0.38) {
  const d = Math.max(0, distance);
  return Math.max(minGain, 1 / (1 + rolloff * d * d));
}

function distanceAudioProfile({ distance, closeness, rolloff = 1.55, minGain = 0.38, rateFar = 1, rateNear = 1, volumeFloor = 1, volumePeak = 1 }) {
  const near = clamp01(closeness ?? (1 - distance));
  const gain = distanceAttenuation(distance, rolloff, minGain);
  return {
    playbackRate: rateFar + near * (rateNear - rateFar),
    volumeScale: gain * (volumeFloor + near * (volumePeak - volumeFloor)),
  };
}

function circularSeatDistance(a, b, seatCount = 4) {
  const total = Math.max(1, seatCount || 4);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return total / 2;
  const direct = Math.abs(a - b) % total;
  return Math.min(direct, total - direct);
}

function seatPathDistanceState({ fromPid, toPid, progress, listenerPid = 0, seatCount = 4 }) {
  const total = Math.max(1, seatCount || 4);
  const maxDistance = Math.max(1, total / 2);
  const fromDistance = circularSeatDistance(listenerPid, fromPid, total);
  const toDistance = circularSeatDistance(listenerPid, toPid, total);
  const eased = smoothstep01(progress);
  const distance = fromDistance + (toDistance - fromDistance) * eased;
  const closeness = 1 - clamp01(distance / maxDistance);
  return { distance, closeness };
}

function burrowDistanceState(progress) {
  const surfaceAt = 0.38;
  const closeness = progress < surfaceAt
    ? smoothstep01(progress / surfaceAt)
    : 1 - smoothstep01((progress - surfaceAt) / (1 - surfaceAt));
  const distance = 0.1 + (1 - closeness) * 1.05;
  return { distance, closeness };
}

function setAudioPlaybackRate(audio, playbackRate) {
  audio.playbackRate = playbackRate;
  try { audio.preservesPitch = false; } catch { /* ignore */ }
  try { audio.mozPreservesPitch = false; } catch { /* ignore */ }
  try { audio.webkitPreservesPitch = false; } catch { /* ignore */ }
}

function collectAudioElements(value, result = [], seen = new Set()) {
  if (!value || seen.has(value)) return result;
  if (typeof value === 'object') seen.add(value);
  if (typeof value?.play === 'function' && typeof value?.pause === 'function' && typeof value?.volume === 'number') {
    result.push(value);
  } else if (Array.isArray(value)) {
    value.forEach(item => collectAudioElements(item, result, seen));
  } else if (typeof value === 'object') {
    Object.values(value).forEach(item => collectAudioElements(item, result, seen));
  }
  return result;
}

function refreshAudioVolumeScale(audio) {
  Reflect.set(audio, 'volume', audio.volume);
}

function bindAudioVolumeScale(audio, scaleRef) {
  let owner = audio;
  let descriptor = null;
  while (owner && !descriptor) {
    descriptor = Object.getOwnPropertyDescriptor(owner, 'volume');
    owner = Object.getPrototypeOf(owner);
  }
  if (!descriptor?.get || !descriptor?.set) return () => {};
  let baseVolume = descriptor.get.call(audio);
  try {
    Object.defineProperty(audio, 'volume', {
      configurable: true,
      get: () => baseVolume,
      set: value => {
        baseVolume = clamp01(Number(value) || 0);
        descriptor.set.call(audio, baseVolume * scaleRef.current);
      },
    });
    audio.volume = baseVolume;
  } catch {
    return () => {};
  }
  return () => {
    try {
      const effectiveVolume = baseVolume * scaleRef.current;
      delete audio.volume;
      descriptor.set.call(audio, effectiveVolume);
    } catch { /* ignore */ }
  };
}

export function useGameAudio(isBattleScreen, expansionKey = '地神的潜影', { musicVolume = 1, sfxVolume = 1 } = {}) {
  const [audioReady, setAudioReady] = useState(false);
  const readyRef = useRef(false);
  const bgmRefs = useRef({ main: null, battleEarth: null, battleStars: null });
  const sfxRefs = useRef({ open: null, close: null, hpDamage: [], sanDamage: [], hpRecover: [], sanRecover: [], apophisEclipse: null, throwStoneThrow: null, throwStoneRolling: null, endlessCorridorTunnel: null, earthquake: null, geomagneticReversal: null, startledBats: null, nightWind: [], igniteTorchFire: null, rope: null, droplet: null, volcano: null, semiMaterial: null, burrowingWorm: null, snakeTrap: null, cthRlyehDream: null, godPowerBlocked: null, tsgSlimePop: [], tsgSlimeCreate: [], oneCardShift: [], multiCardShift: null, diceRoll: null, turnStart: null, skillHunt: null, skillSwap: null, skillBewitch: null, godHighlight: null, vritraImmortalReveal: null, positiveCardFlip: null, neutralCardFlip: null, negativeCardFlip: null, caveDuel: null, wheelSpin: null, blackGoatRun: null, blackGoatPulse: [], guillotineDeath: [], petrifyDeath: [] });
  const sfxStopTimersRef = useRef({});
  const sfxFadeFramesRef = useRef({});
  const sfxSequenceCleanupsRef = useRef({});
  const turnStartPlaybackTokenRef = useRef(0);
  const turnStartMonitorCleanupRef = useRef(null);
  const currentTrackRef = useRef(null);
  const fadeTokenRef = useRef(0);
  const targetVolumesRef = useRef(Object.fromEntries(Object.entries(BGM_AUDIO_BY_KEY).map(([key, config]) => [key, config.volume])));
  const musicVolumeRef = useRef(musicVolume);
  const sfxVolumeRef = useRef(sfxVolume);
  musicVolumeRef.current = musicVolume;
  sfxVolumeRef.current = sfxVolume;

  useEffect(() => {
    const main = new Audio(buildPublicUrl(BGM_AUDIO_BY_KEY.main.path));
    const battleEarth = new Audio(buildPublicUrl(BGM_AUDIO_BY_KEY.battleEarth.path));
    const battleStars = new Audio(buildPublicUrl(BGM_AUDIO_BY_KEY.battleStars.path));
    const open = new Audio(buildPublicUrl('sounds/SE/common/ui/open.mp3'));
    const close = new Audio(buildPublicUrl('sounds/SE/common/ui/close.mp3'));
    const apophisEclipse = new Audio(buildPublicUrl('sounds/SE/earthShadow/gods/apophis/apophisEclipseDrums.mp3'));
    const throwStoneThrow = new Audio(buildPublicUrl('sounds/SE/earthShadow/throwStone/throw.mp3'));
    const throwStoneRolling = new Audio(buildPublicUrl('sounds/SE/earthShadow/throwStone/rolling-down.mp3'));
    const endlessCorridorTunnel = new Audio(buildPublicUrl('sounds/SE/earthShadow/endlessCorridor/tunnel-wind.mp3'));
    const earthquake = new Audio(buildPublicUrl('sounds/SE/earthShadow/earthquake/earthquake.mp3'));
    const geomagneticReversal = new Audio(buildPublicUrl('sounds/SE/earthShadow/geomagnetic/magnet.mp3'));
    const startledBats = new Audio(buildPublicUrl('sounds/SE/earthShadow/bats/bat-colony.mp3'));
    const nightWindVariants = [
      new Audio(buildPublicUrl('sounds/SE/earthShadow/nightWind/nightWind1.mp3')),
      new Audio(buildPublicUrl('sounds/SE/earthShadow/nightWind/nightWind2.mp3')),
    ];
    const igniteTorchFire = new Audio(buildPublicUrl('sounds/SE/earthShadow/torch/fire.mp3'));
    const rope = new Audio(buildPublicUrl('sounds/SE/earthShadow/rope/rope.mp3'));
    const droplet = new Audio(buildPublicUrl('sounds/SE/earthShadow/spring/droplet.mp3'));
    const semiMaterialBg = new Audio(buildPublicUrl('sounds/SE/earthShadow/semiMaterial/semiMaterial_bg.mp3'));
    const semiMaterialCharge = new Audio(buildPublicUrl('sounds/SE/earthShadow/semiMaterial/semiMaterial_charge.mp3'));
    const semiMaterialGlass = new Audio(buildPublicUrl('sounds/SE/earthShadow/semiMaterial/semiMaterial_glass.mp3'));
    const burrowingWormEarthPlayers = BURROWING_WORM_BURROWS.map(() =>
      new Audio(buildPublicUrl('sounds/SE/earthShadow/earthquake/earthquake.mp3'))
    );
    const burrowingWormDrillPlayers = BURROWING_WORM_BURROWS.map(() =>
      new Audio(buildPublicUrl('sounds/SE/earthShadow/worm/worm_drill.mp3'))
    );
    const burrowingWormAttack = new Audio(buildPublicUrl('sounds/SE/earthShadow/worm/worm_attack.mp3'));
    const snakeTrapHiss = new Audio(buildPublicUrl('sounds/SE/earthShadow/snake/snake_hiss.mp3'));
    const snakeTrapAttackPlayers = Array.from({ length: SNAKE_TRAP_ATTACK_POOL_SIZE }, () => [
      new Audio(buildPublicUrl('sounds/SE/earthShadow/snake/snake_attack_1.mp3')),
      new Audio(buildPublicUrl('sounds/SE/earthShadow/snake/snake_attack_2.mp3')),
    ]);
    const cthRlyehDream = new Audio(buildPublicUrl('sounds/SE/starsCall/cth/dive.mp3'));
    const godPowerBlocked = new Audio(buildPublicUrl('sounds/SE/earthShadow/godPowerBlocked/god-power-blocked.mp3'));
    const tsgSlimePopVariants = Array.from({ length: TSG_SLIME_POP_VARIANT_COUNT }, (_, i) =>
      new Audio(buildPublicUrl(`sounds/SE/earthShadow/gods/tsathoggua/slime_pop_${i + 1}.mp3`))
    );
    const tsgSlimeCreateVariants = Array.from({ length: TSG_SLIME_CREATE_VARIANT_COUNT }, (_, i) =>
      new Audio(buildPublicUrl(`sounds/SE/earthShadow/gods/tsathoggua/slime_create_${i + 1}.mp3`))
    );
    const oneCardShiftVariants = ONE_CARD_SHIFT_VARIANTS.map(config => ({
      ...config,
      audio: new Audio(buildPublicUrl(config.path)),
    }));
    const multiCardShift = new Audio(buildPublicUrl('sounds/SE/common/card/multi_card_shift.mp3'));
    const diceRoll = new Audio(buildPublicUrl('sounds/SE/common/dice/roll-dice.mp3'));
    const turnStart = new Audio(buildPublicUrl('sounds/SE/common/turn/turn-start.mp3'));
    const skillHunt = new Audio(buildPublicUrl('sounds/SE/common/skills/skill-hunt.mp3'));
    const skillSwap = new Audio(buildPublicUrl('sounds/SE/common/skills/skill-swap.mp3'));
    const skillBewitch = new Audio(buildPublicUrl('sounds/SE/common/skills/skill-bewitch.mp3'));
    const godHighlight = new Audio(buildPublicUrl('sounds/SE/common/encounter/god_highlight.mp3'));
    const vritraImmortalReveal = new Audio(buildPublicUrl('sounds/SE/earthShadow/gods/vritra/heartbeat.mp3'));
    const positiveCardFlip = new Audio(buildPublicUrl('sounds/SE/common/encounter/positive-card-flip.mp3'));
    const neutralCardFlip = new Audio(buildPublicUrl('sounds/SE/common/encounter/neutral-card-flip.mp3'));
    const negativeCardFlip = new Audio(buildPublicUrl('sounds/SE/common/encounter/negative-card-flip.mp3'));
    const caveDuelBg = new Audio(buildPublicUrl('sounds/SE/earthShadow/caveDuel/caveDuel_bg.mp3'));
    const caveDuelWin = new Audio(buildPublicUrl('sounds/SE/earthShadow/caveDuel/caveDuel_win.mp3'));
    const caveDuelLose = new Audio(buildPublicUrl('sounds/SE/earthShadow/caveDuel/caveDuel_lose.mp3'));
    const wheelSpin = new Audio(buildPublicUrl('sounds/SE/common/dice/wheel-spin.mp3'));
    const blackGoatRun = new Audio(buildPublicUrl('sounds/SE/earthShadow/gods/blackGoat/blackGoat_run_transfer.mp3'));
    const blackGoatPulseVariants = Array.from({ length: BLACK_GOAT_PULSE_VARIANT_COUNT }, (_, i) =>
      new Audio(buildPublicUrl(`sounds/SE/earthShadow/gods/blackGoat/blackGoat_pulse_${i + 1}.mp3`))
    );
    const guillotineDeathVariants = GUILLOTINE_DEATH_VARIANTS.map(config => ({
      ...config,
      audio: new Audio(buildPublicUrl(config.path)),
    }));
    const petrifyDeathVariants = Array.from({ length: PETRIFY_DEATH_VARIANT_COUNT }, (_, i) =>
      new Audio(buildPublicUrl(`sounds/SE/earthShadow/petrifyingFormula/petrify_${i + 1}.mp3`))
    );
    const volcanoBg = new Audio(buildPublicUrl('sounds/SE/earthShadow/volcano/volcano_bg.mp3'));
    const volcanoMeteorPlayers = Array.from({ length: VOLCANO_AUDIO_POOL_SIZE }, () => ({
      meteor1: new Audio(buildPublicUrl('sounds/SE/earthShadow/volcano/volcano_meteor1.mp3')),
      meteor2: new Audio(buildPublicUrl('sounds/SE/earthShadow/volcano/volcano_meteor2.mp3')),
    }));
    const volcanoCooldownPlayers = Array.from({ length: VOLCANO_AUDIO_POOL_SIZE }, () =>
      new Audio(buildPublicUrl('sounds/SE/earthShadow/volcano/volcano_cooldown.mp3'))
    );
    const hpDamageVariants = Array.from({ length: 6 }, (_, i) =>
      new Audio(buildPublicUrl(`sounds/SE/common/combat/hpDamageVariants/hpDamage${i + 1}.mp3`))
    );
    const hpRecoverVariants = Array.from({ length: 5 }, (_, i) =>
      new Audio(buildPublicUrl(`sounds/SE/common/combat/hpRecoverVariants/hpRecover${i + 1}.mp3`))
    );
    const sanDamageConfigs = [
      { path: 'sounds/SE/common/combat/sanDamageVariants/sanDamage1.mp3', impactOffsetMs: 800 },
      { path: 'sounds/SE/common/combat/sanDamageVariants/sanDamage2.mp3', impactOffsetMs: 90 },
    ];
    const sanDamageVariants = sanDamageConfigs.map(config => ({
      ...config,
      audio: new Audio(buildPublicUrl(config.path)),
    }));
    const sanRecoverVariants = Array.from({ length: 4 }, (_, i) =>
      new Audio(buildPublicUrl(`sounds/SE/common/combat/sanRecoverVariants/sanRecover${i + 1}.mp3`))
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
    burrowingWormEarthPlayers.forEach(audio => {
      audio.preload = 'auto';
      audio.volume = BURROWING_WORM_EARTH_VOLUME;
    });
    burrowingWormDrillPlayers.forEach(audio => {
      audio.preload = 'auto';
      audio.volume = BURROWING_WORM_DRILL_VOLUME;
    });
    burrowingWormAttack.preload = 'auto';
    burrowingWormAttack.volume = BURROWING_WORM_ATTACK_VOLUME;
    snakeTrapHiss.preload = 'auto';
    snakeTrapHiss.volume = SNAKE_TRAP_HISS_VOLUME;
    snakeTrapAttackPlayers.flat().forEach(audio => {
      audio.preload = 'auto';
      audio.volume = SNAKE_TRAP_ATTACK_VOLUME;
    });
    cthRlyehDream.preload = 'auto';
    cthRlyehDream.volume = CTH_RLYEH_DREAM_VOLUME;
    godPowerBlocked.preload = 'auto';
    godPowerBlocked.volume = GOD_POWER_BLOCKED_VOLUME;
    tsgSlimePopVariants.forEach(audio => {
      audio.preload = 'auto';
      audio.volume = TSG_SLIME_POP_VOLUME;
    });
    tsgSlimeCreateVariants.forEach(audio => {
      audio.preload = 'auto';
      audio.volume = TSG_SLIME_CREATE_VOLUME;
    });
    oneCardShiftVariants.forEach(({ audio, volume }) => {
      audio.preload = 'auto';
      audio.volume = volume;
    });
    multiCardShift.preload = 'auto';
    multiCardShift.volume = MULTI_CARD_SHIFT_VOLUME;
    diceRoll.preload = 'auto';
    diceRoll.volume = DICE_ROLL_VOLUME;
    turnStart.preload = 'auto';
    turnStart.volume = TURN_START_VOLUME;
    skillHunt.preload = 'auto';
    skillHunt.volume = SKILL_HUNT_VOLUME;
    skillSwap.preload = 'auto';
    skillSwap.volume = SKILL_SWAP_VOLUME;
    skillBewitch.preload = 'auto';
    skillBewitch.volume = SKILL_BEWITCH_VOLUME;
    godHighlight.preload = 'auto';
    godHighlight.volume = GOD_HIGHLIGHT_VOLUME;
    vritraImmortalReveal.preload = 'auto';
    vritraImmortalReveal.volume = VRI_IMMORTAL_REVEAL_VOLUME;
    positiveCardFlip.preload = 'auto';
    positiveCardFlip.volume = POSITIVE_CARD_FLIP_VOLUME;
    neutralCardFlip.preload = 'auto';
    neutralCardFlip.volume = NEUTRAL_CARD_FLIP_VOLUME;
    negativeCardFlip.preload = 'auto';
    negativeCardFlip.volume = NEGATIVE_CARD_FLIP_VOLUME;
    caveDuelBg.preload = 'auto';
    caveDuelBg.volume = CAVE_DUEL_SOUND_TIMING.bgVolume;
    caveDuelWin.preload = 'auto';
    caveDuelWin.volume = CAVE_DUEL_SOUND_TIMING.winVolume;
    caveDuelLose.preload = 'auto';
    caveDuelLose.volume = CAVE_DUEL_SOUND_TIMING.loseVolume;
    wheelSpin.preload = 'auto';
    wheelSpin.volume = WHEEL_SPIN_VOLUME;
    blackGoatRun.preload = 'auto';
    blackGoatRun.volume = BLACK_GOAT_RUN_VOLUME;
    blackGoatPulseVariants.forEach(audio => {
      audio.preload = 'auto';
      audio.volume = BLACK_GOAT_PULSE_VOLUME;
    });
    guillotineDeathVariants.forEach(({ audio, volume }) => {
      audio.preload = 'auto';
      audio.volume = volume;
    });
    petrifyDeathVariants.forEach(audio => {
      audio.preload = 'auto';
      audio.volume = PETRIFY_DEATH_VOLUME;
    });
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
      burrowingWorm: {
        earthPlayers: burrowingWormEarthPlayers,
        drillPlayers: burrowingWormDrillPlayers,
        attack: burrowingWormAttack,
      },
      snakeTrap: {
        hiss: snakeTrapHiss,
        attackPlayers: snakeTrapAttackPlayers,
      },
      cthRlyehDream,
      godPowerBlocked,
      tsgSlimePop: tsgSlimePopVariants,
      tsgSlimeCreate: tsgSlimeCreateVariants,
      oneCardShift: oneCardShiftVariants,
      multiCardShift,
      diceRoll,
      turnStart,
      skillHunt,
      skillSwap,
      skillBewitch,
      godHighlight,
      vritraImmortalReveal,
      positiveCardFlip,
      neutralCardFlip,
      negativeCardFlip,
      caveDuel: {
        bg: caveDuelBg,
        win: caveDuelWin,
        lose: caveDuelLose,
      },
      wheelSpin,
      blackGoatRun,
      blackGoatPulse: blackGoatPulseVariants,
      guillotineDeath: guillotineDeathVariants,
      petrifyDeath: petrifyDeathVariants,
      volcano: {
        bg: volcanoBg,
        meteorPlayers: volcanoMeteorPlayers,
        cooldownPlayers: volcanoCooldownPlayers,
      },
    };
    const volumeScaleCleanups = [
      ...collectAudioElements(bgmRefs.current).map(audio => bindAudioVolumeScale(audio, musicVolumeRef)),
      ...collectAudioElements(sfxRefs.current).map(audio => bindAudioVolumeScale(audio, sfxVolumeRef)),
    ];
    return () => {
      turnStartPlaybackTokenRef.current += 1;
      turnStartMonitorCleanupRef.current?.();
      turnStartMonitorCleanupRef.current = null;
      Object.values(sfxSequenceCleanupsRef.current).forEach(cleanup => {
        try { cleanup?.(); } catch { /* ignore */ }
      });
      sfxSequenceCleanupsRef.current = {};
      Object.values(sfxStopTimersRef.current).forEach(timer => clearTimeout(timer));
      sfxStopTimersRef.current = {};
      Object.values(sfxFadeFramesRef.current).forEach(frame => cancelAnimationFrame(frame));
      sfxFadeFramesRef.current = {};
      [main, battleEarth, battleStars, open, close, apophisEclipse, throwStoneThrow, throwStoneRolling, endlessCorridorTunnel, earthquake, geomagneticReversal, startledBats, ...nightWindVariants, igniteTorchFire, rope, droplet, semiMaterialBg, semiMaterialCharge, semiMaterialGlass, ...burrowingWormEarthPlayers, ...burrowingWormDrillPlayers, burrowingWormAttack, snakeTrapHiss, ...snakeTrapAttackPlayers.flat(), cthRlyehDream, godPowerBlocked, ...tsgSlimePopVariants, ...tsgSlimeCreateVariants, ...oneCardShiftVariants.map(({ audio }) => audio), multiCardShift, diceRoll, turnStart, skillHunt, skillSwap, skillBewitch, godHighlight, vritraImmortalReveal, positiveCardFlip, neutralCardFlip, negativeCardFlip, caveDuelBg, caveDuelWin, caveDuelLose, wheelSpin, blackGoatRun, ...blackGoatPulseVariants, ...guillotineDeathVariants.map(({ audio }) => audio), ...petrifyDeathVariants, ...volcanoAudios, ...hpDamageVariants, ...sanDamageVariants.map(({ audio }) => audio), ...hpRecoverVariants, ...sanRecoverVariants].forEach(audio => {
        try {
          audio.pause();
          audio.currentTime = 0;
          audio.playbackRate = 1;
        } catch { /* ignore */ }
      });
      volumeScaleCleanups.forEach(cleanup => cleanup());
    };
  }, []);

  useEffect(() => {
    collectAudioElements(bgmRefs.current).forEach(refreshAudioVolumeScale);
  }, [musicVolume, audioReady]);

  useEffect(() => {
    collectAudioElements(sfxRefs.current).forEach(refreshAudioVolumeScale);
  }, [sfxVolume, audioReady]);

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

  const tickAudioContextRef = useRef(null);
  const playTickSound = useCallback(() => {
    noteUserGesture();
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const existing = tickAudioContextRef.current;
      const ctx = existing && existing.state !== 'closed'
        ? existing
        : new AudioContextClass();
      tickAudioContextRef.current = ctx;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
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
  const fadeOutAudio = useCallback((audio, key, fadeMs, resetVolume = 0, smooth = false) => {
    if (!audio) return;
    if (sfxFadeFramesRef.current[key]) {
      cancelAnimationFrame(sfxFadeFramesRef.current[key]);
      sfxFadeFramesRef.current[key] = null;
    }
    const startVolume = audio.volume || resetVolume;
    const start = performance.now();
    const step = now => {
      const progress = Math.min((now - start) / Math.max(1, fadeMs), 1);
      const gain = smooth ? 1 - smoothstep01(progress) : 1 - progress;
      try { audio.volume = startVolume * gain; } catch { /* ignore */ }
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
  const scheduleFadeOutAtTrackEnd = useCallback((audio, timerKey, fadeKey, fadeMs, resetVolume, fallbackDurationMs, smooth = false) => {
    if (!audio) return;
    clearTimeout(sfxStopTimersRef.current[timerKey]);
    const metadataDurationMs = Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.duration * 1000
      : fallbackDurationMs;
    const fadeDelayMs = Math.max(0, metadataDurationMs - fadeMs - TRACK_END_FADE_GUARD_MS);
    sfxStopTimersRef.current[timerKey] = setTimeout(() => {
      fadeOutAudio(audio, fadeKey, fadeMs, resetVolume, smooth);
    }, fadeDelayMs);
  }, [fadeOutAudio]);
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
    variants.forEach((audio, index) => {
      const fadeKey = `nightWind-${index}`;
      if (sfxFadeFramesRef.current[fadeKey]) {
        cancelAnimationFrame(sfxFadeFramesRef.current[fadeKey]);
        sfxFadeFramesRef.current[fadeKey] = null;
      }
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = NIGHT_WIND_VOLUME;
      } catch { /* ignore */ }
    });
    const audio = variants[Math.floor(Math.random() * variants.length)] || variants[0];
    const activeIndex = Math.max(0, variants.indexOf(audio));
    const activeFadeKey = `nightWind-${activeIndex}`;
    try {
      audio.currentTime = 0;
      audio.volume = NIGHT_WIND_VOLUME;
      audio.play().catch(() => { });
      sfxStopTimersRef.current.nightWind = setTimeout(() => {
        fadeOutAudio(audio, activeFadeKey, NIGHT_WIND_FADE_MS, NIGHT_WIND_VOLUME, true);
      }, NIGHT_WIND_STOP_MS);
    } catch { /* ignore */ }
    return () => {
      clearTimeout(sfxStopTimersRef.current.nightWind);
      variants.forEach((item, index) => {
        const fadeKey = `nightWind-${index}`;
        if (sfxFadeFramesRef.current[fadeKey]) {
          cancelAnimationFrame(sfxFadeFramesRef.current[fadeKey]);
          sfxFadeFramesRef.current[fadeKey] = null;
        }
        try {
          item.pause();
          item.currentTime = 0;
          item.volume = NIGHT_WIND_VOLUME;
        } catch { /* ignore */ }
      });
    };
  }, [fadeOutAudio, noteUserGesture]);
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
  const playBurrowingWormSound = useCallback(() => {
    noteUserGesture();
    const burrowingWorm = sfxRefs.current.burrowingWorm;
    if (!burrowingWorm) return undefined;
    sfxSequenceCleanupsRef.current.burrowingWorm?.();
    const timers = [];
    const fadeKeys = new Set();
    const sequenceKey = Date.now();
    const addTimer = timer => timers.push(timer);
    const addFadeKey = key => fadeKeys.add(key);
    const stopAudio = (audio, resetVolume, resetRate = 1) => {
      if (!audio) return;
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.playbackRate = resetRate;
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
      (burrowingWorm.earthPlayers || []).forEach(audio => stopAudio(audio, BURROWING_WORM_EARTH_VOLUME));
      (burrowingWorm.drillPlayers || []).forEach(audio => stopAudio(audio, BURROWING_WORM_DRILL_VOLUME));
      stopAudio(burrowingWorm.attack, BURROWING_WORM_ATTACK_VOLUME);
      if (sfxSequenceCleanupsRef.current.burrowingWorm === stopAll) delete sfxSequenceCleanupsRef.current.burrowingWorm;
    };
    sfxSequenceCleanupsRef.current.burrowingWorm = stopAll;
    BURROWING_WORM_BURROWS.forEach((burrow, index) => {
      addTimer(setTimeout(() => {
        const drill = burrowingWorm.drillPlayers?.[index % (burrowingWorm.drillPlayers?.length || 1)];
        const earth = burrowingWorm.earthPlayers?.[index % (burrowingWorm.earthPlayers?.length || 1)];
        const started = performance.now();
        const animateDistanceLayer = ({ audio, key, sourceStartAt, baseVolume, resetVolume, rolloff, minGain, rateFar, rateNear, volumeFloor, volumePeak }) => {
          if (!audio) return;
          try {
            addFadeKey(key);
            audio.pause();
            audio.currentTime = sourceStartAt;
            audio.volume = 0;
            setAudioPlaybackRate(audio, rateFar);
            audio.play().catch(() => { });
          } catch { /* ignore */ }
          const step = now => {
            const progress = clamp01((now - started) / BURROWING_WORM_BURROW_DURATION_MS);
            const { distance, closeness } = burrowDistanceState(progress);
            const fadeIn = smoothstep01(progress / 0.1);
            const fadeOut = 1 - smoothstep01((progress - 0.82) / 0.18);
            const profile = distanceAudioProfile({
              distance,
              closeness,
              rolloff,
              minGain,
              rateFar,
              rateNear,
              volumeFloor,
              volumePeak,
            });
            try {
              audio.volume = baseVolume * profile.volumeScale * fadeIn * fadeOut;
              setAudioPlaybackRate(audio, profile.playbackRate);
            } catch { /* ignore */ }
            if (progress < 1) {
              sfxFadeFramesRef.current[key] = requestAnimationFrame(step);
              return;
            }
            try {
              audio.pause();
              audio.currentTime = 0;
              audio.volume = resetVolume;
              setAudioPlaybackRate(audio, 1);
            } catch { /* ignore */ }
            sfxFadeFramesRef.current[key] = null;
          };
          sfxFadeFramesRef.current[key] = requestAnimationFrame(step);
        };
        animateDistanceLayer({
          audio: earth,
          key: `burrowing-worm-earth-${sequenceKey}-${index}`,
          sourceStartAt: burrow.earthStartAt,
          baseVolume: BURROWING_WORM_EARTH_VOLUME,
          resetVolume: BURROWING_WORM_EARTH_VOLUME,
          rolloff: 4.8,
          minGain: 0.24,
          rateFar: 0.66,
          rateNear: 1,
          volumeFloor: 0.7,
          volumePeak: 1.35,
        });
        animateDistanceLayer({
          audio: drill,
          key: `burrowing-worm-drill-${sequenceKey}-${index}`,
          sourceStartAt: burrow.drillStartAt,
          baseVolume: BURROWING_WORM_DRILL_VOLUME,
          resetVolume: BURROWING_WORM_DRILL_VOLUME,
          rolloff: 2.6,
          minGain: 0.34,
          rateFar: 0.74,
          rateNear: 1.12,
          volumeFloor: 0.54,
          volumePeak: 1.02,
        });
      }, Math.max(0, burrow.delayMs - BURROWING_WORM_BURROW_LEAD_MS)));
    });
    addTimer(setTimeout(() => {
      try {
        const attackFadeKey = `burrowing-worm-attack-${sequenceKey}`;
        addFadeKey(attackFadeKey);
        burrowingWorm.attack.pause();
        burrowingWorm.attack.currentTime = 0;
        burrowingWorm.attack.playbackRate = BURROWING_WORM_ATTACK_PLAYBACK_RATE;
        burrowingWorm.attack.volume = BURROWING_WORM_ATTACK_VOLUME;
        burrowingWorm.attack.play().catch(() => { });
        addTimer(setTimeout(() => {
          fadeOutAudio(burrowingWorm.attack, attackFadeKey, BURROWING_WORM_ATTACK_FADE_MS, BURROWING_WORM_ATTACK_VOLUME);
        }, Math.max(0, BURROWING_WORM_ATTACK_STOP_MS - BURROWING_WORM_ATTACK_FADE_MS)));
      } catch { /* ignore */ }
    }, BURROWING_WORM_ATTACK_DELAY_MS));
    addTimer(setTimeout(stopAll, BURROWING_WORM_ATTACK_DELAY_MS + BURROWING_WORM_ATTACK_STOP_MS + 360));
    return stopAll;
  }, [fadeOutAudio, noteUserGesture]);
  const playSnakeTrapSound = useCallback(({ attackCount = 1 } = {}) => {
    noteUserGesture();
    const snakeTrap = sfxRefs.current.snakeTrap;
    if (!snakeTrap) return undefined;
    sfxSequenceCleanupsRef.current.snakeTrap?.();
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
      stopAudio(snakeTrap.hiss, SNAKE_TRAP_HISS_VOLUME);
      (snakeTrap.attackPlayers || []).flat().forEach(audio => stopAudio(audio, SNAKE_TRAP_ATTACK_VOLUME));
      if (sfxSequenceCleanupsRef.current.snakeTrap === stopAll) delete sfxSequenceCleanupsRef.current.snakeTrap;
    };
    sfxSequenceCleanupsRef.current.snakeTrap = stopAll;
    try {
      const hissFadeKey = `snake-trap-hiss-${sequenceKey}`;
      addFadeKey(hissFadeKey);
      snakeTrap.hiss.pause();
      snakeTrap.hiss.currentTime = 0;
      snakeTrap.hiss.volume = SNAKE_TRAP_HISS_VOLUME;
      snakeTrap.hiss.play().catch(() => { });
      addTimer(setTimeout(() => {
        fadeOutAudio(snakeTrap.hiss, hissFadeKey, SNAKE_TRAP_HISS_FADE_MS, SNAKE_TRAP_HISS_VOLUME);
      }, Math.max(0, SNAKE_TRAP_HISS_STOP_MS - SNAKE_TRAP_HISS_FADE_MS)));
    } catch { /* ignore */ }
    const count = Math.max(0, Math.min(12, Math.floor(attackCount || 0)));
    for (let i = 0; i < count; i += 1) {
      addTimer(setTimeout(() => {
        const pair = snakeTrap.attackPlayers?.[i % (snakeTrap.attackPlayers?.length || 1)] || [];
        const audio = pair[Math.floor(Math.random() * pair.length)] || pair[0];
        if (!audio) return;
        try {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = SNAKE_TRAP_ATTACK_VOLUME;
          audio.play().catch(() => { });
        } catch { /* ignore */ }
      }, SNAKE_TRAP_ATTACK_START_DELAY_MS + i * SNAKE_TRAP_ATTACK_INTERVAL_MS));
    }
    addTimer(setTimeout(stopAll, SNAKE_TRAP_ATTACK_START_DELAY_MS + Math.max(1, count) * SNAKE_TRAP_ATTACK_INTERVAL_MS + 1500));
    return stopAll;
  }, [fadeOutAudio, noteUserGesture]);
  const playCthRlyehDreamSound = useCallback(() => {
    noteUserGesture();
    const audio = sfxRefs.current.cthRlyehDream;
    if (!audio) return undefined;
    clearTimeout(sfxStopTimersRef.current.cthRlyehDream);
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = CTH_RLYEH_DREAM_VOLUME;
      audio.playbackRate = 1;
      audio.play().catch(() => { });
      sfxStopTimersRef.current.cthRlyehDream = setTimeout(() => {
        try {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = CTH_RLYEH_DREAM_VOLUME;
        } catch { /* ignore */ }
      }, CTH_RLYEH_DREAM_STOP_MS + 80);
    } catch { /* ignore */ }
    return () => {
      clearTimeout(sfxStopTimersRef.current.cthRlyehDream);
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = CTH_RLYEH_DREAM_VOLUME;
      } catch { /* ignore */ }
    };
  }, [noteUserGesture]);
  const playGodPowerBlockedSound = useCallback(() => {
    noteUserGesture();
    const audio = sfxRefs.current.godPowerBlocked;
    if (!audio) return undefined;
    clearTimeout(sfxStopTimersRef.current.godPowerBlocked);
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = GOD_POWER_BLOCKED_VOLUME;
      audio.playbackRate = 1;
      audio.play().catch(() => { });
      sfxStopTimersRef.current.godPowerBlocked = setTimeout(() => {
        try {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = GOD_POWER_BLOCKED_VOLUME;
        } catch { /* ignore */ }
      }, GOD_POWER_BLOCKED_STOP_MS + 80);
    } catch { /* ignore */ }
    return () => {
      clearTimeout(sfxStopTimersRef.current.godPowerBlocked);
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = GOD_POWER_BLOCKED_VOLUME;
      } catch { /* ignore */ }
    };
  }, [noteUserGesture]);
  const playTsgSlimePopSound = useCallback(() => {
    noteUserGesture();
    const variants = sfxRefs.current.tsgSlimePop || [];
    if (!variants.length) return undefined;
    clearTimeout(sfxStopTimersRef.current.tsgSlimePopDelay);
    clearTimeout(sfxStopTimersRef.current.tsgSlimePopStop);
    const audio = variants[Math.floor(Math.random() * variants.length)] || variants[0];
    const play = () => {
      try {
        variants.forEach(item => {
          if (item !== audio) {
            item.pause();
            item.currentTime = 0;
            item.volume = TSG_SLIME_POP_VOLUME;
            item.playbackRate = 1;
          }
        });
        audio.pause();
        audio.currentTime = 0;
        audio.volume = TSG_SLIME_POP_VOLUME;
        audio.playbackRate = 1;
        audio.play().catch(() => { });
        sfxStopTimersRef.current.tsgSlimePopStop = setTimeout(() => {
          try {
            audio.pause();
            audio.currentTime = 0;
            audio.volume = TSG_SLIME_POP_VOLUME;
          } catch { /* ignore */ }
        }, TSG_SLIME_POP_STOP_MS);
      } catch { /* ignore */ }
    };
    sfxStopTimersRef.current.tsgSlimePopDelay = setTimeout(play, TSG_SLIME_POP_DELAY_MS);
    return () => {
      clearTimeout(sfxStopTimersRef.current.tsgSlimePopDelay);
      clearTimeout(sfxStopTimersRef.current.tsgSlimePopStop);
      try {
        variants.forEach(item => {
          item.pause();
          item.currentTime = 0;
          item.volume = TSG_SLIME_POP_VOLUME;
          item.playbackRate = 1;
        });
      } catch { /* ignore */ }
    };
  }, [noteUserGesture]);
  const playTsgSlimeCreateSound = useCallback(() => {
    noteUserGesture();
    const variants = sfxRefs.current.tsgSlimeCreate || [];
    if (!variants.length) return undefined;
    const audio = variants[Math.floor(Math.random() * variants.length)] || variants[0];
    try {
      variants.forEach(item => {
        item.pause();
        item.currentTime = 0;
        item.volume = TSG_SLIME_CREATE_VOLUME;
        item.playbackRate = 1;
      });
      audio.play().catch(() => { });
    } catch { /* ignore */ }
    return undefined;
  }, [noteUserGesture]);
  const playOneCardShiftSound = useCallback(() => {
    noteUserGesture();
    const variants = sfxRefs.current.oneCardShift || [];
    if (!variants.length) return undefined;
    const variant = variants[Math.floor(Math.random() * variants.length)] || variants[0];
    const audio = variant.audio;
    if (!audio) return undefined;
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = variant.volume ?? 0.4;
      audio.playbackRate = 1;
      audio.play().catch(() => { });
    } catch { /* ignore */ }
    return undefined;
  }, [noteUserGesture]);
  const playMultiCardShiftSound = useCallback(() => {
    noteUserGesture();
    const audio = sfxRefs.current.multiCardShift;
    if (!audio) return undefined;
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = MULTI_CARD_SHIFT_VOLUME;
      audio.playbackRate = 1;
      audio.play().catch(() => { });
    } catch { /* ignore */ }
    return undefined;
  }, [noteUserGesture]);
  const playDiceRollSound = useCallback(() => {
    noteUserGesture();
    const audio = sfxRefs.current.diceRoll;
    if (!audio) return undefined;
    const fadeKey = 'diceRoll';
    clearTimeout(sfxStopTimersRef.current.diceRoll);
    if (sfxFadeFramesRef.current[fadeKey]) {
      cancelAnimationFrame(sfxFadeFramesRef.current[fadeKey]);
      sfxFadeFramesRef.current[fadeKey] = null;
    }
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = DICE_ROLL_VOLUME;
      audio.playbackRate = 1;
      audio.play().catch(() => { });
      sfxStopTimersRef.current.diceRoll = setTimeout(() => {
        fadeOutAudio(audio, fadeKey, DICE_ROLL_FADE_MS, DICE_ROLL_VOLUME);
      }, Math.max(0, DICE_ROLL_STOP_MS - DICE_ROLL_FADE_MS));
    } catch { /* ignore */ }
    return () => {
      clearTimeout(sfxStopTimersRef.current.diceRoll);
      if (sfxFadeFramesRef.current[fadeKey]) {
        cancelAnimationFrame(sfxFadeFramesRef.current[fadeKey]);
        sfxFadeFramesRef.current[fadeKey] = null;
      }
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.playbackRate = 1;
        audio.volume = DICE_ROLL_VOLUME;
      } catch { /* ignore */ }
    };
  }, [fadeOutAudio, noteUserGesture]);
  const playTurnStartSound = useCallback(() => {
    noteUserGesture();
    const audio = sfxRefs.current.turnStart;
    if (!audio) return undefined;
    const fadeKey = 'turnStart';
    const token = ++turnStartPlaybackTokenRef.current;
    turnStartMonitorCleanupRef.current?.();
    turnStartMonitorCleanupRef.current = null;
    clearTimeout(sfxStopTimersRef.current.turnStart);
    if (sfxFadeFramesRef.current[fadeKey]) {
      cancelAnimationFrame(sfxFadeFramesRef.current[fadeKey]);
      sfxFadeFramesRef.current[fadeKey] = null;
    }
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = TURN_START_VOLUME;
      audio.playbackRate = 1;
      Promise.resolve(audio.play()).then(() => {
        if (turnStartPlaybackTokenRef.current !== token) return;
        turnStartMonitorCleanupRef.current = startTrackEndFadeMonitor({
          audio,
          baseVolume: TURN_START_VOLUME,
          fallbackDurationMs: TURN_START_FALLBACK_DURATION_MS,
          fadeMs: TURN_START_FADE_MS,
          guardMs: TRACK_END_FADE_GUARD_MS,
          smooth: true,
          isCurrent: () => turnStartPlaybackTokenRef.current === token,
          onComplete: () => {
            if (turnStartPlaybackTokenRef.current !== token) return;
            try {
              audio.pause();
              audio.currentTime = 0;
              audio.volume = TURN_START_VOLUME;
            } catch { /* ignore */ }
            turnStartMonitorCleanupRef.current = null;
          },
        });
      }).catch(() => { });
    } catch { /* ignore */ }
    return () => {
      if (turnStartPlaybackTokenRef.current !== token) return;
      turnStartPlaybackTokenRef.current += 1;
      turnStartMonitorCleanupRef.current?.();
      turnStartMonitorCleanupRef.current = null;
      clearTimeout(sfxStopTimersRef.current.turnStart);
      if (sfxFadeFramesRef.current[fadeKey]) {
        cancelAnimationFrame(sfxFadeFramesRef.current[fadeKey]);
        sfxFadeFramesRef.current[fadeKey] = null;
      }
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.playbackRate = 1;
        audio.volume = TURN_START_VOLUME;
      } catch { /* ignore */ }
    };
  }, [noteUserGesture]);
  const playSkillHuntSound = useCallback(() => {
    noteUserGesture();
    const audio = sfxRefs.current.skillHunt;
    if (!audio) return undefined;
    clearTimeout(sfxStopTimersRef.current.skillHunt);
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = SKILL_HUNT_VOLUME;
      audio.playbackRate = 1;
      audio.play().catch(() => { });
      sfxStopTimersRef.current.skillHunt = setTimeout(() => {
        try {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = SKILL_HUNT_VOLUME;
        } catch { /* ignore */ }
      }, SKILL_HUNT_STOP_MS);
    } catch { /* ignore */ }
    return () => {
      clearTimeout(sfxStopTimersRef.current.skillHunt);
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.playbackRate = 1;
        audio.volume = SKILL_HUNT_VOLUME;
      } catch { /* ignore */ }
    };
  }, [noteUserGesture]);
  const playSkillSwapSound = useCallback(() => {
    noteUserGesture();
    const audio = sfxRefs.current.skillSwap;
    if (!audio) return undefined;
    clearTimeout(sfxStopTimersRef.current.skillSwap);
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = SKILL_SWAP_VOLUME;
      audio.playbackRate = 1;
      audio.play().catch(() => { });
      sfxStopTimersRef.current.skillSwap = setTimeout(() => {
        try {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = SKILL_SWAP_VOLUME;
        } catch { /* ignore */ }
      }, SKILL_SWAP_STOP_MS);
    } catch { /* ignore */ }
    return () => {
      clearTimeout(sfxStopTimersRef.current.skillSwap);
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.playbackRate = 1;
        audio.volume = SKILL_SWAP_VOLUME;
      } catch { /* ignore */ }
    };
  }, [noteUserGesture]);
  const playSkillBewitchSound = useCallback(() => {
    noteUserGesture();
    const audio = sfxRefs.current.skillBewitch;
    if (!audio) return undefined;
    clearTimeout(sfxStopTimersRef.current.skillBewitch);
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = SKILL_BEWITCH_VOLUME;
      audio.playbackRate = 1;
      audio.play().catch(() => { });
      sfxStopTimersRef.current.skillBewitch = setTimeout(() => {
        try {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = SKILL_BEWITCH_VOLUME;
        } catch { /* ignore */ }
      }, SKILL_BEWITCH_STOP_MS);
    } catch { /* ignore */ }
    return () => {
      clearTimeout(sfxStopTimersRef.current.skillBewitch);
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.playbackRate = 1;
        audio.volume = SKILL_BEWITCH_VOLUME;
      } catch { /* ignore */ }
    };
  }, [noteUserGesture]);
  const playCaveDuelSound = useCallback(({ localLost = false } = {}) => {
    noteUserGesture();
    const caveDuel = sfxRefs.current.caveDuel;
    if (!caveDuel?.bg || !caveDuel?.win || !caveDuel?.lose) return undefined;
    sfxSequenceCleanupsRef.current.caveDuel?.();
    let cleanup;
    cleanup = startCaveDuelSoundSequence({
      caveDuel,
      localLost,
      fadeFrames: sfxFadeFramesRef.current,
      fadeOutAudio,
      onCleanup: () => {
        if (sfxSequenceCleanupsRef.current.caveDuel === cleanup) {
          delete sfxSequenceCleanupsRef.current.caveDuel;
        }
      },
    });
    if (cleanup) sfxSequenceCleanupsRef.current.caveDuel = cleanup;
    return cleanup;
  }, [fadeOutAudio, noteUserGesture]);
  const playWheelSpinSound = useCallback(() => {
    noteUserGesture();
    const audio = sfxRefs.current.wheelSpin;
    if (!audio) return undefined;
    const fadeKey = 'wheel-spin';
    clearTimeout(sfxStopTimersRef.current.wheelSpin);
    if (sfxFadeFramesRef.current[fadeKey]) {
      cancelAnimationFrame(sfxFadeFramesRef.current[fadeKey]);
      sfxFadeFramesRef.current[fadeKey] = null;
    }
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = WHEEL_SPIN_VOLUME;
      audio.playbackRate = 1;
      audio.play().catch(() => { });
      sfxStopTimersRef.current.wheelSpin = setTimeout(() => {
        fadeOutAudio(audio, fadeKey, WHEEL_SPIN_FADE_MS, WHEEL_SPIN_VOLUME);
      }, Math.max(0, WHEEL_SPIN_STOP_MS - WHEEL_SPIN_FADE_MS));
    } catch { /* ignore */ }
    return () => {
      clearTimeout(sfxStopTimersRef.current.wheelSpin);
      if (sfxFadeFramesRef.current[fadeKey]) {
        cancelAnimationFrame(sfxFadeFramesRef.current[fadeKey]);
        sfxFadeFramesRef.current[fadeKey] = null;
      }
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.playbackRate = 1;
        audio.volume = WHEEL_SPIN_VOLUME;
      } catch { /* ignore */ }
    };
  }, [fadeOutAudio, noteUserGesture]);
  const playBlackGoatRunSound = useCallback(({ fromPid = 0, toPid = 0, durationMs = BLACK_GOAT_RUN_DEFAULT_DURATION_MS, seatCount = 4 } = {}) => {
    noteUserGesture();
    const audio = sfxRefs.current.blackGoatRun;
    if (!audio) return undefined;
    sfxSequenceCleanupsRef.current.blackGoatRun?.();
    const key = `black-goat-run-${Date.now()}`;
    const totalSeats = Math.max(
      4,
      Number.isFinite(seatCount) ? seatCount : 4,
      Number.isFinite(fromPid) ? fromPid + 1 : 0,
      Number.isFinite(toPid) ? toPid + 1 : 0
    );
    const duration = Number.isFinite(durationMs)
      ? Math.max(480, Math.min(durationMs, BLACK_GOAT_RUN_DEFAULT_DURATION_MS))
      : BLACK_GOAT_RUN_DEFAULT_DURATION_MS;
    const fadeOutStart = clamp01((duration - BLACK_GOAT_RUN_FADE_MS) / duration);
    const stopAll = () => {
      if (sfxFadeFramesRef.current[key]) {
        cancelAnimationFrame(sfxFadeFramesRef.current[key]);
        sfxFadeFramesRef.current[key] = null;
      }
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = BLACK_GOAT_RUN_VOLUME;
        setAudioPlaybackRate(audio, 1);
      } catch { /* ignore */ }
      if (sfxSequenceCleanupsRef.current.blackGoatRun === stopAll) delete sfxSequenceCleanupsRef.current.blackGoatRun;
    };
    sfxSequenceCleanupsRef.current.blackGoatRun = stopAll;
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 0;
      setAudioPlaybackRate(audio, 0.96);
      audio.play().catch(() => { });
    } catch { /* ignore */ }
    const started = performance.now();
    const step = now => {
      const progress = clamp01((now - started) / duration);
      const { distance, closeness } = seatPathDistanceState({ fromPid, toPid, progress, seatCount: totalSeats });
      const fadeIn = smoothstep01(progress / 0.12);
      const fadeOut = 1 - smoothstep01((progress - fadeOutStart) / Math.max(0.01, 1 - fadeOutStart));
      const profile = distanceAudioProfile({
        distance,
        closeness,
        rolloff: 0.42,
        minGain: 0.42,
        rateFar: 0.88,
        rateNear: 1.08,
        volumeFloor: 0.56,
        volumePeak: 1.08,
      });
      try {
        audio.volume = BLACK_GOAT_RUN_VOLUME * profile.volumeScale * fadeIn * fadeOut;
        setAudioPlaybackRate(audio, profile.playbackRate);
      } catch { /* ignore */ }
      if (progress < 1) {
        sfxFadeFramesRef.current[key] = requestAnimationFrame(step);
        return;
      }
      stopAll();
    };
    sfxFadeFramesRef.current[key] = requestAnimationFrame(step);
    return stopAll;
  }, [noteUserGesture]);
  const playBlackGoatPulseSound = useCallback(() => {
    noteUserGesture();
    const variants = sfxRefs.current.blackGoatPulse || [];
    if (!variants.length) return undefined;
    const audio = variants[Math.floor(Math.random() * variants.length)];
    if (!audio) return undefined;
    clearTimeout(sfxStopTimersRef.current.blackGoatPulse);
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = BLACK_GOAT_PULSE_VOLUME;
      setAudioPlaybackRate(audio, 1);
      audio.play().catch(() => { });
      sfxStopTimersRef.current.blackGoatPulse = setTimeout(() => {
        try {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = BLACK_GOAT_PULSE_VOLUME;
          setAudioPlaybackRate(audio, 1);
        } catch { /* ignore */ }
      }, BLACK_GOAT_PULSE_STOP_MS);
    } catch { /* ignore */ }
    return () => {
      clearTimeout(sfxStopTimersRef.current.blackGoatPulse);
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = BLACK_GOAT_PULSE_VOLUME;
        setAudioPlaybackRate(audio, 1);
      } catch { /* ignore */ }
    };
  }, [noteUserGesture]);
  const playGuillotineDeathSound = useCallback(() => {
    noteUserGesture();
    const variants = sfxRefs.current.guillotineDeath || [];
    if (!variants.length) return undefined;
    const fadeKey = 'guillotineDeath';
    clearTimeout(sfxStopTimersRef.current.guillotineDeath);
    if (sfxFadeFramesRef.current[fadeKey]) {
      cancelAnimationFrame(sfxFadeFramesRef.current[fadeKey]);
      sfxFadeFramesRef.current[fadeKey] = null;
    }
    variants.forEach(({ audio, volume }) => {
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = volume;
        setAudioPlaybackRate(audio, 1);
      } catch { /* ignore */ }
    });
    const selected = variants[Math.floor(Math.random() * variants.length)];
    if (!selected?.audio) return undefined;
    const { audio, volume } = selected;
    try {
      audio.play().catch(() => { });
      sfxStopTimersRef.current.guillotineDeath = setTimeout(() => {
        fadeOutAudio(audio, fadeKey, GUILLOTINE_DEATH_FADE_MS, volume);
      }, Math.max(0, GUILLOTINE_DEATH_STOP_MS - GUILLOTINE_DEATH_FADE_MS));
    } catch { /* ignore */ }
    return () => {
      clearTimeout(sfxStopTimersRef.current.guillotineDeath);
      if (sfxFadeFramesRef.current[fadeKey]) {
        cancelAnimationFrame(sfxFadeFramesRef.current[fadeKey]);
        sfxFadeFramesRef.current[fadeKey] = null;
      }
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = volume;
        setAudioPlaybackRate(audio, 1);
      } catch { /* ignore */ }
    };
  }, [fadeOutAudio, noteUserGesture]);
  const playPetrifyDeathSound = useCallback(() => {
    noteUserGesture();
    const variants = sfxRefs.current.petrifyDeath || [];
    if (!variants.length) return undefined;
    const audio = variants[Math.floor(Math.random() * variants.length)];
    if (!audio) return undefined;
    const fadeKey = 'petrifyDeath';
    clearTimeout(sfxStopTimersRef.current.petrifyDeath);
    if (sfxFadeFramesRef.current[fadeKey]) {
      cancelAnimationFrame(sfxFadeFramesRef.current[fadeKey]);
      sfxFadeFramesRef.current[fadeKey] = null;
    }
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = PETRIFY_DEATH_VOLUME;
      setAudioPlaybackRate(audio, 1);
      audio.play().catch(() => { });
      sfxStopTimersRef.current.petrifyDeath = setTimeout(() => {
        fadeOutAudio(audio, fadeKey, PETRIFY_DEATH_FADE_MS, PETRIFY_DEATH_VOLUME);
      }, Math.max(0, PETRIFY_DEATH_STOP_MS - PETRIFY_DEATH_FADE_MS));
    } catch { /* ignore */ }
    return () => {
      clearTimeout(sfxStopTimersRef.current.petrifyDeath);
      if (sfxFadeFramesRef.current[fadeKey]) {
        cancelAnimationFrame(sfxFadeFramesRef.current[fadeKey]);
        sfxFadeFramesRef.current[fadeKey] = null;
      }
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = PETRIFY_DEATH_VOLUME;
        setAudioPlaybackRate(audio, 1);
      } catch { /* ignore */ }
    };
  }, [fadeOutAudio, noteUserGesture]);
  const playGodHighlightSound = useCallback(() => {
    noteUserGesture();
    const audio = sfxRefs.current.godHighlight;
    if (!audio) return undefined;
    clearTimeout(sfxStopTimersRef.current.godHighlight);
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = GOD_HIGHLIGHT_VOLUME;
      setAudioPlaybackRate(audio, 1);
      audio.play().catch(() => { });
      sfxStopTimersRef.current.godHighlight = setTimeout(() => {
        try {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = GOD_HIGHLIGHT_VOLUME;
        } catch { /* ignore */ }
      }, GOD_HIGHLIGHT_STOP_MS);
    } catch { /* ignore */ }
    return () => {
      clearTimeout(sfxStopTimersRef.current.godHighlight);
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = GOD_HIGHLIGHT_VOLUME;
        setAudioPlaybackRate(audio, 1);
      } catch { /* ignore */ }
    };
  }, [noteUserGesture]);
  const playVritraImmortalRevealSound = useCallback(() => {
    noteUserGesture();
    const audio = sfxRefs.current.vritraImmortalReveal;
    if (!audio) return undefined;
    const fadeKey = 'vritraImmortalReveal';
    clearTimeout(sfxStopTimersRef.current.vritraImmortalReveal);
    if (sfxFadeFramesRef.current[fadeKey]) {
      cancelAnimationFrame(sfxFadeFramesRef.current[fadeKey]);
      sfxFadeFramesRef.current[fadeKey] = null;
    }
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = VRI_IMMORTAL_REVEAL_VOLUME;
      audio.playbackRate = 1;
      audio.play().catch(() => { });
      sfxStopTimersRef.current.vritraImmortalReveal = setTimeout(() => {
        fadeOutAudio(audio, fadeKey, VRI_IMMORTAL_REVEAL_FADE_MS, VRI_IMMORTAL_REVEAL_VOLUME, true);
      }, Math.max(0, VRI_IMMORTAL_REVEAL_STOP_MS - VRI_IMMORTAL_REVEAL_FADE_MS));
    } catch { /* ignore */ }
    return () => {
      clearTimeout(sfxStopTimersRef.current.vritraImmortalReveal);
      if (sfxFadeFramesRef.current[fadeKey]) {
        cancelAnimationFrame(sfxFadeFramesRef.current[fadeKey]);
        sfxFadeFramesRef.current[fadeKey] = null;
      }
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = VRI_IMMORTAL_REVEAL_VOLUME;
        audio.playbackRate = 1;
      } catch { /* ignore */ }
    };
  }, [fadeOutAudio, noteUserGesture]);
  const playPositiveCardFlipSound = useCallback(() => {
    noteUserGesture();
    const audio = sfxRefs.current.positiveCardFlip;
    if (!audio) return undefined;
    clearTimeout(sfxStopTimersRef.current.positiveCardFlip);
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = POSITIVE_CARD_FLIP_VOLUME;
      audio.playbackRate = 1;
      audio.play().catch(() => { });
      sfxStopTimersRef.current.positiveCardFlip = setTimeout(() => {
        try {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = POSITIVE_CARD_FLIP_VOLUME;
        } catch { /* ignore */ }
      }, POSITIVE_CARD_FLIP_STOP_MS);
    } catch { /* ignore */ }
    return () => {
      clearTimeout(sfxStopTimersRef.current.positiveCardFlip);
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = POSITIVE_CARD_FLIP_VOLUME;
        audio.playbackRate = 1;
      } catch { /* ignore */ }
    };
  }, [noteUserGesture]);
  const playNeutralCardFlipSound = useCallback(() => {
    noteUserGesture();
    const audio = sfxRefs.current.neutralCardFlip;
    if (!audio) return undefined;
    clearTimeout(sfxStopTimersRef.current.neutralCardFlip);
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = NEUTRAL_CARD_FLIP_VOLUME;
      audio.playbackRate = 1;
      audio.play().catch(() => { });
      sfxStopTimersRef.current.neutralCardFlip = setTimeout(() => {
        try {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = NEUTRAL_CARD_FLIP_VOLUME;
        } catch { /* ignore */ }
      }, NEUTRAL_CARD_FLIP_STOP_MS);
    } catch { /* ignore */ }
    return () => {
      clearTimeout(sfxStopTimersRef.current.neutralCardFlip);
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = NEUTRAL_CARD_FLIP_VOLUME;
        audio.playbackRate = 1;
      } catch { /* ignore */ }
    };
  }, [noteUserGesture]);
  const playNegativeCardFlipSound = useCallback(() => {
    noteUserGesture();
    const audio = sfxRefs.current.negativeCardFlip;
    if (!audio) return undefined;
    const fadeKey = 'negativeCardFlip';
    clearTimeout(sfxStopTimersRef.current.negativeCardFlip);
    if (sfxFadeFramesRef.current[fadeKey]) {
      cancelAnimationFrame(sfxFadeFramesRef.current[fadeKey]);
      sfxFadeFramesRef.current[fadeKey] = null;
    }
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = NEGATIVE_CARD_FLIP_VOLUME;
      audio.playbackRate = 1;
      audio.play().catch(() => { });
      scheduleFadeOutAtTrackEnd(
        audio,
        'negativeCardFlip',
        fadeKey,
        NEGATIVE_CARD_FLIP_FADE_MS,
        NEGATIVE_CARD_FLIP_VOLUME,
        NEGATIVE_CARD_FLIP_FALLBACK_DURATION_MS,
      );
    } catch { /* ignore */ }
    return () => {
      clearTimeout(sfxStopTimersRef.current.negativeCardFlip);
      if (sfxFadeFramesRef.current[fadeKey]) {
        cancelAnimationFrame(sfxFadeFramesRef.current[fadeKey]);
        sfxFadeFramesRef.current[fadeKey] = null;
      }
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.playbackRate = 1;
        audio.volume = NEGATIVE_CARD_FLIP_VOLUME;
      } catch { /* ignore */ }
    };
  }, [noteUserGesture, scheduleFadeOutAtTrackEnd]);

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
    playBurrowingWormSound,
    playSnakeTrapSound,
    playCthRlyehDreamSound,
    playGodPowerBlockedSound,
    playTsgSlimePopSound,
    playTsgSlimeCreateSound,
    playOneCardShiftSound,
    playMultiCardShiftSound,
    playDiceRollSound,
    playTurnStartSound,
    playSkillHuntSound,
    playSkillSwapSound,
    playSkillBewitchSound,
    playCaveDuelSound,
    playWheelSpinSound,
    playBlackGoatRunSound,
    playBlackGoatPulseSound,
    playGuillotineDeathSound,
    playPetrifyDeathSound,
    playGodHighlightSound,
    playVritraImmortalRevealSound,
    playPositiveCardFlipSound,
    playNeutralCardFlipSound,
    playNegativeCardFlipSound,
  };
}
