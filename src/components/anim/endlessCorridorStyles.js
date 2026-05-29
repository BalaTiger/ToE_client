export const ENDLESS_CORRIDOR_ANIMATION_STYLES = `
  .endlessCorridorOverlay {
    position: fixed;
    inset: 0;
    z-index: 940;
    pointer-events: none;
    overflow: hidden;
    background: radial-gradient(circle at 50% 50%, rgba(13,35,38,.18) 0%, rgba(4,10,16,.9) 58%, rgba(0,0,0,.98) 100%);
    animation: endlessCorridorBackdrop 2.3s cubic-bezier(.16,.84,.28,1) both;
  }
  .endlessCorridorOverlay.ending {
    animation: endlessCorridorOverlayExit .22s ease forwards;
  }
  .endlessCorridorStage {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 1000px;
    height: 700px;
    transform: translate(-50%, -50%);
    perspective: 980px;
    perspective-origin: 50% 50%;
  }
  .endlessCorridorCamera {
    position: absolute;
    inset: 0;
    transform-style: preserve-3d;
    animation: endlessCorridorCameraDive 2.3s cubic-bezier(.18,.72,.18,1) both;
  }
  .endlessCorridorTunnel {
    position: absolute;
    inset: 0;
    transform-style: preserve-3d;
    animation: endlessCorridorTunnelPresence 2.3s cubic-bezier(.18,.72,.18,1) both;
  }
  .endlessCorridorRing {
    position: absolute;
    left: 50%;
    top: 50%;
    width: var(--ring-w);
    height: var(--ring-h);
    border: var(--ring-stroke) solid rgba(184,255,233,.72);
    border-radius: 8px;
    box-shadow: 0 0 10px rgba(95,231,208,.32), inset 0 0 8px rgba(65,189,168,.16);
    opacity: var(--ring-opacity);
    transform:
      translate3d(calc(-50% + var(--cluster-x)), calc(-50% + var(--cluster-y)), var(--cluster-z));
    animation: endlessCorridorRingSpread 2.3s cubic-bezier(.18,.72,.18,1) both;
    will-change: transform, opacity;
  }
  .endlessCorridorLine {
    position: absolute;
    display: block;
    background: linear-gradient(90deg, rgba(95,231,208,0), rgba(216,255,242,.72), rgba(95,231,208,0));
    opacity: .38;
    filter: blur(.2px);
    transform-origin: 0 50%;
  }
  .endlessCorridorLineTop,
  .endlessCorridorLineMid,
  .endlessCorridorLineBottom {
    left: 4%;
    width: 92%;
    height: 1px;
    transform: skewX(-24deg);
  }
  .endlessCorridorLineTop { top: 16%; }
  .endlessCorridorLineMid { top: 50%; opacity: .24; }
  .endlessCorridorLineBottom { top: 84%; }
  .endlessCorridorLineLeft,
  .endlessCorridorLineRight {
    top: 9%;
    width: 1px;
    height: 82%;
    background: linear-gradient(180deg, rgba(95,231,208,0), rgba(216,255,242,.55), rgba(95,231,208,0));
    transform: skewY(-10deg);
    opacity: .22;
  }
  .endlessCorridorLineLeft { left: 24%; }
  .endlessCorridorLineRight { right: 24%; }
  .endlessCorridorEntranceRays {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 1px;
    height: 1px;
    opacity: 0;
    animation: endlessCorridorEntranceRays 2.3s ease both;
  }
  .endlessCorridorEntranceRays span {
    position: absolute;
    left: 0;
    top: 0;
    width: 160px;
    height: 1px;
    background: linear-gradient(90deg, rgba(184,255,233,.72), rgba(184,255,233,0));
    transform-origin: 0 50%;
  }
  .endlessCorridorEntranceRays span:nth-child(1) { transform: rotate(34deg); }
  .endlessCorridorEntranceRays span:nth-child(2) { transform: rotate(-34deg); }
  .endlessCorridorEntranceRays span:nth-child(3) { transform: rotate(146deg); }
  .endlessCorridorEntranceRays span:nth-child(4) { transform: rotate(-146deg); }
  .endlessCorridorCore {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 60px;
    height: 60px;
    margin: -30px 0 0 -30px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(239,255,245,.98) 0%, rgba(184,255,233,.7) 16%, rgba(65,189,168,.22) 48%, rgba(4,16,24,0) 100%);
    opacity: 0;
    mix-blend-mode: screen;
    animation: endlessCorridorCoreBloom 2.3s cubic-bezier(.16,.84,.22,1) both;
  }
  .endlessCorridorFlash {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 90px;
    height: 90px;
    margin: -45px 0 0 -45px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(239,255,245,1) 0%, rgba(239,255,245,.96) 42%, rgba(184,255,233,.72) 68%, rgba(184,255,233,0) 100%);
    opacity: 0;
    mix-blend-mode: screen;
    transform: scale(.08);
    animation: endlessCorridorFlashFill 2.3s cubic-bezier(.16,.72,.18,1) both;
  }
  .endlessCorridorOverlay.ending .endlessCorridorFlash {
    animation: endlessCorridorFlashExit .22s ease forwards;
  }
  .endlessCorridorOverlay.ending .endlessCorridorCamera,
  .endlessCorridorOverlay.ending .endlessCorridorTunnel,
  .endlessCorridorOverlay.ending .endlessCorridorRing,
  .endlessCorridorOverlay.ending .endlessCorridorCore {
    visibility: hidden;
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
  @keyframes endlessCorridorRingSpread {
    0% {
      transform:
        translate3d(calc(-50% + var(--cluster-x)), calc(-50% + var(--cluster-y)), var(--cluster-z));
    }
    38% {
      transform:
        translate3d(-50%, -50%, var(--depth-z));
    }
    100% {
      transform:
        translate3d(-50%, -50%, var(--depth-z));
    }
  }
  @keyframes endlessCorridorCameraDive {
    0% { transform: translateX(-70px) rotateZ(-4deg) translateZ(0) scale(.96); }
    22% { transform: translateX(-58px) rotateZ(-3.2deg) translateZ(0) scale(.965); }
    58% { transform: translateX(-18px) rotateZ(-1deg) translateZ(16px) scale(.99); }
    76% { transform: translateX(-4px) rotateZ(-.2deg) translateZ(96px) scale(1.06); }
    90% { transform: translateX(0) rotateZ(0deg) translateZ(320px) scale(1.3); }
    100% { transform: translateX(0) rotateZ(0deg) translateZ(580px) scale(1.62); }
  }
  @keyframes endlessCorridorTunnelPresence {
    0% { transform: rotateY(-72deg) skewY(-2deg) scaleX(.96); }
    22% { transform: rotateY(-65deg) skewY(-1.7deg) scaleX(.965); }
    58% { transform: rotateY(-30deg) skewY(-.8deg) scaleX(.985); }
    78% { transform: rotateY(-6deg) skewY(-.15deg) scale(1.01); }
    90% { transform: rotateY(0deg) skewY(0deg) scale(1.08); }
    100% { transform: rotateY(0deg) skewY(0deg) scale(1.16); }
  }
  @keyframes endlessCorridorEntranceRays {
    0%, 66% { opacity: 0; }
    78% { opacity: .32; }
    90% { opacity: .42; }
    100% { opacity: .16; }
  }
  @keyframes endlessCorridorCoreBloom {
    0%, 66% { opacity: 0; transform: scale(.18); }
    80% { opacity: .34; transform: scale(.8); }
    92% { opacity: .76; transform: scale(2.15); }
    100% { opacity: .54; transform: scale(4.8); }
  }
  @keyframes endlessCorridorFlashFill {
    0%, 78% { opacity: 0; transform: scale(.08); }
    88% { opacity: .36; transform: scale(2.8); }
    96% { opacity: .86; transform: scale(16); }
    100% { opacity: .9; transform: scale(24); }
  }
  @keyframes endlessCorridorFlashExit {
    from { opacity: .9; transform: scale(24); }
    to { opacity: 0; transform: scale(26); }
  }
`;
