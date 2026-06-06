export const SNAKE_TRAP_ANIMATION_STYLES = `
  @keyframes snakeCrawl {
    0% { opacity: 0; transform: translate(0, 0) scale(0.3); }
    12% { opacity: 1; transform: translate(var(--snake-mid-tx, 0), var(--snake-mid-ty, 0)) scale(0.85) rotate(6deg); }
    55% { opacity: 1; transform: translate(var(--snake-tx, 0), var(--snake-ty, 0)) scale(1) rotate(-3deg); }
    82% { opacity: 0.65; transform: translate(var(--snake-tx, 0), var(--snake-ty, 0)) scale(0.55) rotate(0deg); }
    100% { opacity: 0; transform: translate(var(--snake-tx, 0), var(--snake-ty, 0)) scale(0.2) rotate(0deg); }
  }
  @keyframes snakeTrail {
    0% { opacity: 0; transform: rotate(var(--snake-angle, 0deg)) scaleY(0.2); }
    25% { opacity: 0.55; }
    60% { opacity: 0.35; transform: rotate(var(--snake-angle, 0deg)) scaleY(1); }
    100% { opacity: 0; transform: rotate(var(--snake-angle, 0deg)) scaleY(0.4); }
  }
  @keyframes snakeTrapBgIn {
    0% { opacity: 0; }
    100% { opacity: 1; }
  }
  @keyframes snakeTrapCenterPulse {
    0% { opacity: 0; transform: scale(0.4); }
    30% { opacity: 1; transform: scale(1.15); }
    55% { opacity: 0.75; transform: scale(0.92); }
    100% { opacity: 0.45; transform: scale(1.05); }
  }
  @keyframes snakeTrapWhiteFlash {
    0%, 100% { opacity: 0; }
    3% { opacity: 0.72; }
    8% { opacity: 0; }
    28% { opacity: 0; }
    30% { opacity: 0.45; }
    34% { opacity: 0; }
    52% { opacity: 0; }
    54% { opacity: 0.38; }
    58% { opacity: 0; }
    72% { opacity: 0; }
    74% { opacity: 0.28; }
    78% { opacity: 0; }
  }
  @keyframes snakeTrapBlackFlash {
    0%, 100% { opacity: 0; }
    12% { opacity: 0; }
    15% { opacity: 0.55; }
    20% { opacity: 0; }
    38% { opacity: 0; }
    40% { opacity: 0.42; }
    44% { opacity: 0; }
    60% { opacity: 0; }
    62% { opacity: 0.32; }
    66% { opacity: 0; }
    80% { opacity: 0; }
    82% { opacity: 0.22; }
    86% { opacity: 0; }
  }
  @keyframes snakeTrapQuake {
    0%, 100% { transform: translate(0, 0); }
    3% { transform: translate(2px, -1px); }
    6% { transform: translate(-2px, 2px); }
    9% { transform: translate(1px, -2px); }
    12% { transform: translate(-1px, 1px); }
    15% { transform: translate(3px, 0); }
    18% { transform: translate(-2px, -1px); }
    21% { transform: translate(1px, 2px); }
    24% { transform: translate(0, 0); }
    30% { transform: translate(-3px, 1px); }
    33% { transform: translate(2px, -2px); }
    36% { transform: translate(-1px, 2px); }
    39% { transform: translate(1px, -1px); }
    42% { transform: translate(-2px, 0); }
    45% { transform: translate(0, 0); }
    54% { transform: translate(2px, 1px); }
    57% { transform: translate(-1px, -2px); }
    60% { transform: translate(1px, 1px); }
    63% { transform: translate(0, 0); }
    74% { transform: translate(-2px, 1px); }
    77% { transform: translate(1px, -1px); }
    80% { transform: translate(0, 0); }
  }
  @keyframes biteParticle {
    0% { opacity: 0; transform: translate(0, 0) scale(0.2); }
    18% { opacity: 1; transform: translate(var(--bite-tx, 0), var(--bite-ty, 0)) scale(1); }
    55% { opacity: 0.55; transform: translate(calc(var(--bite-tx, 0) * 1.15), calc(var(--bite-ty, 0) * 1.15)) scale(0.72); }
    100% { opacity: 0; transform: translate(calc(var(--bite-tx, 0) * 1.35), calc(var(--bite-ty, 0) * 1.35)) scale(0.2); }
  }
  @keyframes fangFlash {
    0% { opacity: 0; transform: scale(0.3); }
    35% { opacity: 1; transform: scale(1.15); }
    65% { opacity: 0.65; transform: scale(0.9); }
    100% { opacity: 0; transform: scale(0.5); }
  }
  @keyframes snakeTrapCountIn {
    0% { opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
    100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  }
  @keyframes snakeTrapMsgsIn {
    0% { opacity: 0; transform: translateX(-50%) translateY(12px); }
    100% { opacity: 0.92; transform: translateX(-50%) translateY(0); }
  }
  @keyframes snakeTrapFadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
`;
