export const AREA_CARD_ANIMATION_STYLES = `
  @keyframes caveDuelCardPath {
    0% { transform: translate(var(--fromX), var(--fromY)) rotate(-9deg) scale(0.92); opacity: 0; }
    12% { opacity: 1; }
    38% { transform: translate(var(--midX), var(--midY)) rotate(0deg) scale(1.04); opacity: 1; }
    68% { transform: translate(var(--midX), var(--midY)) rotate(0deg) scale(1.04); opacity: 1; }
    100% { transform: translate(var(--toX), var(--toY)) rotate(6deg) scale(0.95); opacity: 1; }
  }
  @keyframes caveDuelScorePop {
    0% { opacity: 0; transform: translateY(10px) scale(0.7); }
    35% { opacity: 1; transform: translateY(0) scale(1.08); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes caveDuelVsPop {
    0% { opacity: 0; transform: translateX(-50%) scale(0.4); }
    40% { opacity: 1; transform: translateX(-50%) scale(1.12); }
    100% { opacity: 0.92; transform: translateX(-50%) scale(1); }
  }
  @keyframes caveDuelDancePop {
    0% { opacity: 0; transform: translateY(10px) rotate(-8deg) scale(0.6); }
    30% { opacity: 1; transform: translateY(0) rotate(8deg) scale(1.12); }
    55% { opacity: 1; transform: translateY(-2px) rotate(-7deg) scale(1); }
    80% { opacity: 1; transform: translateY(0) rotate(7deg) scale(1.04); }
    100% { opacity: 0.96; transform: translateY(0) rotate(-4deg) scale(1); }
  }
`;
