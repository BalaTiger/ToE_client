export const MOVE_ANIMATION_STYLES = `
  @keyframes cardTravelToDeck {
    0%   {top:8%;right:6%;transform:scale(0.85);opacity:0.9}
    30%  {opacity:1}
    100% {top:50%;right:50%;transform:translate(50%,-50%) scale(1.1);opacity:1}
  }
  @keyframes cardTravelToPlayer {
    0%   {left:var(--src-x);top:var(--src-y);transform:translate(0,0) scale(0.85);opacity:0.9}
    30%  {opacity:1}
    100% {left:var(--dest-x);top:var(--dest-y);transform:translate(0,0) scale(1.0);opacity:1}
  }
  @keyframes discardCardFly {
    0%   {bottom:14%;left:50%;transform:translateX(-50%) scale(1);opacity:1}
    40%  {bottom:36%;left:38%;transform:translateX(-50%) scale(1.08) rotate(-8deg);opacity:1}
    100% {bottom:44%;left:28%;transform:translateX(-50%) scale(0.85) rotate(-18deg);opacity:0.7}
  }
  @keyframes discardCardFlyFromAI {
    0%   {transform:translate(-50%, -50%) scale(1);opacity:1}
    40%  {transform:translate(calc(-50% - 12vw), calc(-50% - 22vh)) scale(1.08) rotate(-8deg);opacity:1}
    100% {transform:translate(calc(-50% - 22vw), calc(-50% - 30vh)) scale(0.85) rotate(-18deg);opacity:0.7}
  }
  @keyframes discardCardFlyCustom {
    0%   {transform:translate(-50%, -50%) scale(1) rotate(0deg);opacity:1}
    40%  {transform:translate(calc(-50% + var(--tx) * 0.4), calc(-50% + var(--ty) * 0.4)) scale(1.08) rotate(-8deg);opacity:1}
    100% {transform:translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(0.85) rotate(-18deg);opacity:0.7}
  }
  @keyframes discardBgFade {
    0%   {opacity:0}
    20%  {opacity:1}
    80%  {opacity:0.8}
    100% {opacity:0}
  }
  @keyframes cardTransferFly {
    0%   { transform: translate(0,0) scale(1)   rotate(0deg);   opacity:1 }
    45%  { transform: translate(calc(var(--tx)*0.55), calc(var(--ty)*0.55)) scale(1.12) rotate(-12deg); opacity:1 }
    100% { transform: translate(var(--tx), var(--ty)) scale(0.72) rotate(-22deg); opacity:0 }
  }
  @keyframes zhuHideBgFade {
    0% { opacity: 0; }
    18% { opacity: 1; }
    100% { opacity: 0; }
  }
  @keyframes zhuHideCardPath {
    0% { opacity: 0; transform: translate(0,0) rotate(0deg) scale(0.88); }
    14% { opacity: 1; transform: translate(var(--pull-x),var(--pull-y)) rotate(-7deg) scale(1); }
    54% { opacity: 1; transform: translate(calc(var(--pull-x) * 0.72),calc(var(--bottom-y) * 0.55)) rotate(-2deg) scale(1.03); }
    82% { opacity: 1; transform: translate(var(--bottom-x),var(--bottom-y)) rotate(5deg) scale(0.92); }
    100% { opacity: 0; transform: translate(4px,34px) rotate(0deg) scale(0.62); }
  }
  @keyframes buryToDeckPath {
    0% { opacity: 0; transform: translate(0,0) rotate(0deg) scale(0.86); }
    12% { opacity: 1; transform: translate(calc(var(--tx) * 0.18),calc(var(--ty) * 0.18 - 26px)) rotate(-8deg) scale(1.03); }
    54% { opacity: 1; transform: translate(calc(var(--tx) * 0.68),calc(var(--ty) * 0.68 - 18px)) rotate(-2deg) scale(1.02); }
    82% { opacity: 1; transform: translate(var(--tx),var(--ty)) rotate(5deg) scale(0.84); }
    100% { opacity: 0; transform: translate(calc(var(--tx) + 4px),calc(var(--ty) + 34px)) rotate(0deg) scale(0.58); }
  }
  @keyframes buryToDeckDepth {
    0%, 56% { z-index: 6; }
    57%, 100% { z-index: 2; }
  }
  @keyframes buryToDeckOverlayDepth {
    0%, 56% { z-index: 992; }
    57%, 100% { z-index: 1; }
  }
  @keyframes zhuHideDepth {
    0%, 14% { z-index: 6; }
    15%, 100% { z-index: 2; }
  }
  @keyframes zhuHideOverlayDepth {
    0%, 14% { z-index: 992; }
    15%, 100% { z-index: 1; }
  }
  @keyframes zhuHideGlow {
    0% { opacity: 0; transform: scale(0.6); }
    20% { opacity: 1; transform: scale(1); }
    78% { opacity: 0.8; transform: scale(1.12); }
    100% { opacity: 0; transform: scale(0.45); }
  }
`;
