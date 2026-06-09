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

  .snake-trap-overlay {
    color: #b8f0a4;
  }

  .snake-trap-vignette {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 50% 48%, rgba(42, 87, 42, 0.12), rgba(5, 18, 5, 0.26) 46%, rgba(0, 0, 0, 0.34) 100%);
    animation: snakeTrapVignette 3.1s linear both;
  }

  .snake-trap-nest {
    position: absolute;
    width: 112px;
    height: 112px;
    border-radius: 50%;
    background:
      radial-gradient(circle, rgba(165, 244, 139, 0.38) 0%, rgba(71, 143, 67, 0.18) 36%, transparent 70%);
    box-shadow: 0 0 22px rgba(125, 220, 96, 0.22);
    animation: snakeTrapNestPulse 1.45s ease-out both;
  }

  .snake-trap-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
`;
