export const SMOKE_COLS=[
  {x:'12%', d1:0,    d2:0.22},
  {x:'26%', d1:0.10, d2:0.30},
  {x:'41%', d1:0.05, d2:0.26},
  {x:'57%', d1:0.18, d2:0.38},
  {x:'72%', d1:0.08, d2:0.28},
];

export const FLOWER_CONFIGS=[
  // [side(-1=left,1=right), xOff, yOff, scale, hue, petals, delay, variant]
  // ── LEFT side ──
  [-1,  52,  15, 1.00, 340,  6, 1.22, 0],  // rose-pink, 6p
  [-1,  95, -28, 0.82, 310,  5, 1.38, 1],  // lavender,  5p
  [-1,  70,  52, 0.92, 355,  7, 1.50, 2],  // warm white,7p
  [-1, 130,  18, 0.75, 290,  5, 1.62, 1],  // lilac,     5p
  [-1,  48, -55, 0.88, 0,    6, 1.72, 0],  // blush,     6p
  [-1, 115, -52, 0.70, 320,  8, 1.85, 2],  // mauve,     8p
  // ── RIGHT side ──
  [ 1,  52,  15, 1.00, 340,  6, 1.28, 0],
  [ 1,  95, -28, 0.85, 30,   5, 1.42, 1],  // peach
  [ 1,  72,  52, 0.90, 355,  7, 1.55, 2],
  [ 1, 132,  18, 0.78, 290,  5, 1.66, 1],
  [ 1,  50, -55, 0.86, 8,    6, 1.78, 0],
  [ 1, 117, -52, 0.72, 320,  8, 1.90, 2],
];

export const DICE_FACES=['⚀','⚁','⚂','⚃','⚄','⚅'];

export const ANIM_CFG={
  // HP_DAMAGE handled via per-character KnifeEffect, no fullscreen overlay needed
  // SAN_DAMAGE: per-panel only, no fullscreen cfg
  HP_HEAL:      {overlay:'rgba(3,12,3,0.90)', accent:'#4ade80', icon:'✚',  title:'创伤愈合',  shake:false},
  SAN_HEAL:     {overlay:'rgba(8,3,18,0.90)', accent:'#a78bfa', icon:'☯',  title:'心神平复',  shake:false},
  // SKILL_SWAP/HUNT/BEWITCH use dedicated overlay components, not GenericAnimOverlay
  // DISCARD uses DiscardMoveOverlay, not GenericAnimOverlay
  DEATH:        {overlay:'rgba(12,2,2,0.96)', accent:'#ff2020', icon:'☠',  title:'死亡降临',  shake:false},
  EARTHQUAKE:   {overlay:'rgba(10,8,5,0.92)', accent:'#d4b468', icon:'⚡',  title:'地动山摇',  shake:true},
};
