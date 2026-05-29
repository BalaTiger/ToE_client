export const ENDLESS_CORRIDOR_ANIMATION_STYLES = `
  .endlessCorridorOverlay {
    animation: endlessCorridorBackdrop 2.3s cubic-bezier(.16,.84,.28,1) both;
  }
  .endlessCorridorOverlay.ending {
    animation: endlessCorridorOverlayExit .22s ease forwards;
  }
  .endlessCorridorCamera {
    transform-box: fill-box;
    transform-origin: 50% 50%;
    animation: endlessCorridorCameraDive 2.3s cubic-bezier(.16,.84,.22,1) both;
  }
  .endlessCorridorTunnel {
    transform-box: fill-box;
    transform-origin: 50% 50%;
    animation: endlessCorridorTunnelPresence 2.3s cubic-bezier(.18,.82,.22,1) both;
  }
  .endlessCorridorEntranceRays {
    opacity: 0;
    animation: endlessCorridorEntranceRays 2.3s ease both;
  }
  .endlessCorridorCore {
    transform-box: fill-box;
    transform-origin: 50% 50%;
    opacity: 0;
    animation: endlessCorridorCoreBloom 2.3s cubic-bezier(.16,.84,.22,1) both;
    mix-blend-mode: screen;
  }
  .endlessCorridorFlash {
    opacity: 0;
    animation: endlessCorridorFlashFill 2.3s ease both;
    mix-blend-mode: screen;
  }
  @keyframes endlessCorridorBackdrop {
    0% { opacity: 0; filter: brightness(.72) saturate(.8); }
    10% { opacity: 1; }
    56% { filter: brightness(.92) saturate(1.1); }
    86% { filter: brightness(1.5) saturate(1.25); }
    100% { opacity: 1; filter: brightness(2.1) saturate(.55); }
  }
  @keyframes endlessCorridorOverlayExit {
    from { opacity: 1; }
    to { opacity: 0; }
  }
  @keyframes endlessCorridorCameraDive {
    0% { transform: translateX(-145px) rotateZ(-6deg) scale(.94); }
    62% { transform: translateX(0) rotateZ(0deg) scale(1); }
    76% { transform: translateX(0) rotateZ(0deg) scale(1.06); }
    90% { transform: translateX(0) rotateZ(0deg) scale(1.44); }
    100% { transform: translateX(0) rotateZ(0deg) scale(2.5); }
  }
  @keyframes endlessCorridorTunnelPresence {
    0% { opacity: .9; transform: skewY(-5deg) scaleX(.96); }
    56% { opacity: 1; transform: skewY(-1deg) scaleX(1); }
    68% { opacity: 1; transform: skewY(0deg) scaleX(1); }
    88% { opacity: .94; transform: skewY(0deg) scale(1.1); }
    100% { opacity: .25; transform: skewY(0deg) scale(1.62); }
  }
  @keyframes endlessCorridorEntranceRays {
    0%, 58% { opacity: 0; }
    70% { opacity: .34; }
    84% { opacity: .42; }
    100% { opacity: .1; }
  }
  @keyframes endlessCorridorCoreBloom {
    0%, 56% { opacity: 0; transform: scale(.18); }
    70% { opacity: .35; transform: scale(.9); }
    84% { opacity: .86; transform: scale(2.1); }
    100% { opacity: 1; transform: scale(8.5); }
  }
  @keyframes endlessCorridorFlashFill {
    0%, 80% { opacity: 0; }
    92% { opacity: .52; }
    100% { opacity: .92; }
  }
`;
