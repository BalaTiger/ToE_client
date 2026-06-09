export const SNAKE_TRAP_ANIMATION_STYLES = `
  @keyframes snakeTrapFadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }

  @keyframes snakeTrapVignette {
    0% { opacity: 0; }
    18% { opacity: 1; }
    58% { opacity: 0.72; }
    100% { opacity: 0; }
  }

  @keyframes snakeTrapNestPulse {
    0% { opacity: 0; transform: translate(-50%, -50%) scale(0.45); }
    22% { opacity: 0.8; transform: translate(-50%, -50%) scale(1.05); }
    58% { opacity: 0.5; transform: translate(-50%, -50%) scale(1.2); }
    100% { opacity: 0; transform: translate(-50%, -50%) scale(0.72); }
  }

  @keyframes snakeTrapCrawl {
    0% {
      opacity: 0;
      stroke-dashoffset: 1260;
      filter: drop-shadow(0 0 2px rgba(170, 245, 130, 0.2));
    }
    10% {
      opacity: 1;
    }
    76% {
      opacity: 1;
      stroke-dashoffset: 0;
      filter: drop-shadow(0 0 9px rgba(135, 228, 105, 0.62));
    }
    100% {
      opacity: 0;
      stroke-dashoffset: -260;
      filter: drop-shadow(0 0 1px rgba(135, 228, 105, 0));
    }
  }

  @keyframes snakeTrapWrithe {
    0%, 100% { transform: translate(0, 0); }
    35% { transform: translate(2px, -2px); }
    68% { transform: translate(-2px, 2px); }
  }

  @keyframes snakeTrapBite {
    0%, 100% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.35) rotate(-8deg);
    }
    18% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1.08) rotate(0deg);
    }
    38% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(0.92) rotate(0deg);
    }
    72% {
      opacity: 0.38;
      transform: translate(-50%, -50%) scale(1.26) rotate(5deg);
    }
  }

  @keyframes snakeTrapBiteBurst {
    0% { opacity: 0; transform: translate(-50%, -50%) scale(0.25); }
    24% { opacity: 0.85; transform: translate(-50%, -50%) scale(1); }
    100% { opacity: 0; transform: translate(-50%, -50%) scale(1.85); }
  }

  @keyframes snakeTrapVenomDrop {
    0% { opacity: 0; transform: translate(0, 0) scale(0.2); }
    28% { opacity: 1; transform: translate(var(--venom-x), var(--venom-y)) scale(1); }
    100% { opacity: 0; transform: translate(calc(var(--venom-x) * 1.45), calc(var(--venom-y) * 1.45)) scale(0.35); }
  }

  .snake-trap-overlay {
    color: #b8f0a4;
  }

  .snake-trap-vignette {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 50% 48%, rgba(42, 87, 42, 0.16), rgba(5, 18, 5, 0.34) 46%, rgba(0, 0, 0, 0.46) 100%);
    animation: snakeTrapVignette 3.1s linear both;
  }

  .snake-trap-nest {
    position: absolute;
    width: 112px;
    height: 112px;
    border-radius: 50%;
    background:
      radial-gradient(circle, rgba(165, 244, 139, 0.42) 0%, rgba(71, 143, 67, 0.2) 36%, transparent 70%);
    box-shadow: 0 0 22px rgba(125, 220, 96, 0.22);
    animation: snakeTrapNestPulse 1.45s ease-out both;
  }

  .snake-trap-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .snake-trap-snake {
    animation: snakeTrapWrithe 0.38s ease-in-out var(--snake-delay) 4;
  }

  .snake-trap-snake path {
    stroke-dasharray: 260 1000;
    stroke-dashoffset: 1260;
    animation: snakeTrapCrawl 1.38s cubic-bezier(0.2, 0.62, 0.22, 1) var(--snake-delay) both;
  }

  .snake-trap-fang-bite {
    position: absolute;
    width: 108px;
    height: 108px;
    opacity: 0;
    transform: translate(-50%, -50%);
    animation: snakeTrapBite 0.52s cubic-bezier(0.18, 0.9, 0.26, 1) var(--bite-delay) both;
    filter: drop-shadow(0 0 12px rgba(179, 255, 124, 0.78));
  }

  .snake-trap-bite-burst {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 92px;
    height: 92px;
    border-radius: 50%;
    border: 3px solid rgba(174, 255, 126, 0.74);
    background: radial-gradient(circle, rgba(176, 255, 124, 0.28), rgba(56, 142, 60, 0.14) 48%, transparent 70%);
    transform: translate(-50%, -50%);
    animation: snakeTrapBiteBurst 0.48s ease-out var(--bite-delay) both;
  }

  .snake-trap-fang {
    position: absolute;
    top: 16px;
    width: 0;
    height: 0;
    border-left: 13px solid transparent;
    border-right: 13px solid transparent;
    border-top: 56px solid rgba(244, 255, 229, 0.96);
    filter: drop-shadow(0 0 6px rgba(191, 255, 135, 0.9));
  }

  .snake-trap-fang-left {
    left: 23px;
    transform: rotate(18deg);
  }

  .snake-trap-fang-right {
    right: 23px;
    transform: rotate(-18deg);
  }

  .snake-trap-venom-drop {
    position: absolute;
    left: 50%;
    top: 58%;
    width: 12px;
    height: 12px;
    margin-left: -6px;
    margin-top: -6px;
    border-radius: 50% 50% 50% 12%;
    background: radial-gradient(circle at 35% 30%, #e2ff9e, #6dce57 55%, #27672f);
    animation: snakeTrapVenomDrop 0.48s ease-out var(--bite-delay) both;
  }

  .snake-trap-venom-drop-a {
    --venom-x: -32px;
    --venom-y: 20px;
  }

  .snake-trap-venom-drop-b {
    --venom-x: 28px;
    --venom-y: 26px;
  }

  .snake-trap-venom-drop-c {
    --venom-x: 3px;
    --venom-y: 39px;
  }
`;
