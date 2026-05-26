export const BLACK_GOAT_ANIMATION_STYLES = `
  @keyframes goatSigilPulse {
    0%   { filter:brightness(0.9); opacity:0; }
    18%  { opacity:0.92; }
    55%  { filter:brightness(1.35); opacity:0.86; }
    100% { filter:brightness(0.7); opacity:0; }
  }
  @keyframes goatRunSprite {
    0%, 14.28% { background-position: 0% 0%; }
    14.29%, 28.56% { background-position: 16.6667% 0%; }
    28.57%, 42.85% { background-position: 33.3333% 0%; }
    42.86%, 57.13% { background-position: 50% 0%; }
    57.14%, 71.42% { background-position: 66.6667% 0%; }
    71.43%, 85.70% { background-position: 83.3333% 0%; }
    85.71%, 100% { background-position: 100% 0%; }
  }
  @keyframes blackGoatParticleFly {
    0%   { transform:translate(0,0) scale(0.35); opacity:0; }
    18%  { opacity:1; }
    62%  { transform:translate(calc(var(--tx)*0.62 + var(--drift-x)), calc(var(--ty)*0.62 + var(--drift-y))) scale(1.1); opacity:0.9; }
    100% { transform:translate(calc(var(--tx) + var(--drift-x)), calc(var(--ty) + var(--drift-y))) scale(0.2); opacity:0; }
  }
`;
