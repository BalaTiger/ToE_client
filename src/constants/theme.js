export const DEFAULT_EXPANSION_THEME = '地神的潜影';

export const BOARD_THEME_BY_EXPANSION = {
  '地神的潜影': {
    text: '#c8a96e',
    strong: '#e8c87a',
    muted: '#a07838',
    panel: '#140f08',
    panelActive: '#1c1408',
    line: '#3a2510',
    lineDim: '#2a1a08',
    glow: '#c8a96e',
  },
  '群星呼唤': {
    text: '#9dd8f0',
    strong: '#d8f6ff',
    muted: '#6aa5c8',
    panel: '#061b26',
    panelActive: '#08283a',
    line: '#1f6f86',
    lineDim: '#124253',
    glow: '#62d5ff',
  },
};

export const BATTLE_BACKGROUND_BY_EXPANSION = {
  '地神的潜影': '/img/bg/battle/earth_shadow.webp',
  '先贤的馈赠': '/img/bg/battle/sage_gift.webp',
  '群星呼唤': '/img/bg/battle/stars_call.webp',
  '析骨为柴': '/img/bg/battle/bone_fuel.webp',
};

export const BATTLE_THEME_BY_EXPANSION = {
  '地神的潜影': {
    ...BOARD_THEME_BY_EXPANSION['地神的潜影'],
    tintTop: 'rgba(6,4,3,0.48)',
    tintBottom: 'rgba(7,4,2,0.66)',
    bg: '#0a0705',
    accent: '#7a5324',
  },
  '群星呼唤': {
    ...BOARD_THEME_BY_EXPANSION['群星呼唤'],
    tintTop: 'rgba(1,6,15,0.66)',
    tintBottom: 'rgba(0,10,20,0.84)',
    bg: '#020911',
    accent: '#78e2ff',
  },
};

export const CARD_BACK_IMAGE_BY_EXPANSION = {
  '地神的潜影': '/img/card/cardback_earth_shadow.webp',
  '先贤的馈赠': '/img/card/cardback_sage_gift.webp',
  '群星呼唤': '/img/card/cardback_stars_call.webp',
  '析骨为柴': '/img/card/cardback_bone_fuel.webp',
};

export const ANIMATED_CARD_BACK_BY_EXPANSION = {
  '地神的潜影': {
    frameDir: '/img/card/animated/earth_shadow',
    version: 'earth-noiseflow-loop-20260608',
    frameCount: 24,
    fps: 12,
    width: 392,
    height: 590,
  },
  '群星呼唤': {
    frameDir: '/img/card/animated/stars_call',
    version: 'stars-bubble-rise-20260608',
    frameCount: 24,
    fps: 12,
    width: 392,
    height: 590,
  },
};

export const BATTLE_BGM_BY_EXPANSION = {
  '地神的潜影': 'battleEarth',
  '群星呼唤': 'battleStars',
};

export const BGM_AUDIO_BY_KEY = {
  main: { path: 'sounds/BGM/mainTheme.mp3', volume: 0.32 },
  battleEarth: { path: 'sounds/BGM/battle_earth_shadow.mp3', volume: 0.24 },
  battleStars: { path: 'sounds/BGM/battle_stars_call.mp3', volume: 0.214 },
};

export const RELIEF_DISPLAY_BY_EXPANSION = {
  '地神的潜影': {
    corner: { shadowOpacity: 0.68, glowOpacity: 0.46, lineOpacity: 1 },
    hand: { shadowOpacity: 0.54, glowOpacity: 0.48, lineOpacity: 1 },
    log: { shadowOpacity: 0.38, glowOpacity: 0.13, lineOpacity: 0.32 },
    logText: {
      title: 'var(--toe-text,#c8a96e)',
      turn: 'var(--toe-strong,#e5c98b)',
      body: 'var(--toe-text,#b79658)',
    },
  },
  '群星呼唤': {
    corner: { shadowOpacity: 0.66, glowOpacity: 0.42, lineOpacity: 1 },
    hand: { shadowOpacity: 0.62, glowOpacity: 0.36, lineOpacity: 0.95 },
    log: { shadowOpacity: 0.48, glowOpacity: 0.045, lineOpacity: 0.14 },
    logText: {
      title: 'var(--toe-muted,#7aa8c8)',
      turn: 'var(--toe-strong,#b9e8ff)',
      body: 'var(--toe-line,#71a7d6)',
    },
  },
};

export function getBoardTheme(expansionKey = DEFAULT_EXPANSION_THEME) {
  return BOARD_THEME_BY_EXPANSION[expansionKey] || BOARD_THEME_BY_EXPANSION[DEFAULT_EXPANSION_THEME];
}

export function getBattleTheme(expansionKey = DEFAULT_EXPANSION_THEME) {
  return BATTLE_THEME_BY_EXPANSION[expansionKey] || BATTLE_THEME_BY_EXPANSION[DEFAULT_EXPANSION_THEME];
}

export function getBattleBackgroundImage(expansionKey = DEFAULT_EXPANSION_THEME) {
  return BATTLE_BACKGROUND_BY_EXPANSION[expansionKey] || BATTLE_BACKGROUND_BY_EXPANSION[DEFAULT_EXPANSION_THEME];
}

export function getReliefDisplayConfig(expansionKey = DEFAULT_EXPANSION_THEME) {
  return RELIEF_DISPLAY_BY_EXPANSION[expansionKey] || RELIEF_DISPLAY_BY_EXPANSION[DEFAULT_EXPANSION_THEME];
}

export function getCardBackImage(expansionKey = DEFAULT_EXPANSION_THEME) {
  return CARD_BACK_IMAGE_BY_EXPANSION[expansionKey] || CARD_BACK_IMAGE_BY_EXPANSION[DEFAULT_EXPANSION_THEME];
}

export function getAnimatedCardBack(expansionKey = DEFAULT_EXPANSION_THEME) {
  return ANIMATED_CARD_BACK_BY_EXPANSION[expansionKey] || null;
}

export function getBattleBgmKey(expansionKey = DEFAULT_EXPANSION_THEME) {
  return BATTLE_BGM_BY_EXPANSION[expansionKey] || BATTLE_BGM_BY_EXPANSION[DEFAULT_EXPANSION_THEME];
}
