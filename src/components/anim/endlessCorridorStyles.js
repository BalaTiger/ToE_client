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
    width: 100%;
    height: 100%;
    transform: translate(-50%, -50%);
  }
  .endlessCorridorCanvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    mix-blend-mode: screen;
  }
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
  .endlessCorridorExposure,
  .endlessCorridorFlash {
    position: absolute;
    left: 50%;
    top: 50%;
    /* 用 vmax 而非固定 px，缩放到 24 倍后半径(约264vmax)远超任何分辨率的画面对角(≤71vmax)，
       超大分辨率也能完整覆盖；亮白核心(0~28%)即可盖住四角，柔和渐隐边缘落在画面之外。 */
    width: 22vmax;
    height: 22vmax;
    margin: -11vmax 0 0 -11vmax;
    border-radius: 50%;
    opacity: 0;
    transform: scale(.08);
  }
  .endlessCorridorExposure {
    background: radial-gradient(circle, rgba(248,255,250,.46) 0%, rgba(236,255,246,.24) 42%, rgba(210,255,240,.08) 68%, rgba(190,255,236,0) 100%);
    backdrop-filter: brightness(1) contrast(1) saturate(1);
    -webkit-backdrop-filter: brightness(1) contrast(1) saturate(1);
    mix-blend-mode: color-dodge;
    animation: endlessCorridorExposureFill 2.3s linear both;
  }
  .endlessCorridorFlash {
    width: 36vmax;
    height: 36vmax;
    margin: -18vmax 0 0 -18vmax;
    display: block;
    object-fit: fill;
    background: radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,255,255,.96) 34%, rgba(246,255,250,.58) 64%, rgba(190,255,236,0) 100%);
    mix-blend-mode: screen;
    image-rendering: auto;
    filter: blur(1.4px);
    animation: endlessCorridorFlashFill 2.3s linear both;
  }
  .endlessCorridorOverlay.ending .endlessCorridorExposure,
  .endlessCorridorTopLight.ending .endlessCorridorFlash {
    animation: endlessCorridorFlashExit .22s ease forwards;
  }
  .endlessCorridorOverlay.ending .endlessCorridorCanvas,
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
  @keyframes endlessCorridorEntranceRays {
    0%, 76% { opacity: 0; }
    86% { opacity: .3; }
    94% { opacity: .42; }
    100% { opacity: .16; }
  }
  @keyframes endlessCorridorCoreBloom {
    0%, 76% { opacity: 0; transform: scale(.18); }
    86% { opacity: .28; transform: scale(.72); }
    94% { opacity: .72; transform: scale(2); }
    100% { opacity: .54; transform: scale(4.8); }
  }
  @keyframes endlessCorridorExposureFill {
    0%, 86% {
      opacity: 0;
      transform: scale(.08);
    }
    90% {
      opacity: .42;
      transform: scale(.9);
      backdrop-filter: brightness(1.45) contrast(.9) saturate(.82);
      -webkit-backdrop-filter: brightness(1.45) contrast(.9) saturate(.82);
    }
    94% {
      opacity: .82;
      transform: scale(5.8);
      backdrop-filter: brightness(2.8) contrast(.72) saturate(.48);
      -webkit-backdrop-filter: brightness(2.8) contrast(.72) saturate(.48);
    }
    98% {
      opacity: 1;
      transform: scale(17);
      backdrop-filter: brightness(5) contrast(.48) saturate(.22);
      -webkit-backdrop-filter: brightness(5) contrast(.48) saturate(.22);
    }
    100% {
      opacity: 1;
      transform: scale(30);
      backdrop-filter: brightness(8) contrast(.32) saturate(.08);
      -webkit-backdrop-filter: brightness(8) contrast(.32) saturate(.08);
    }
  }
  @keyframes endlessCorridorFlashFill {
    0%, 88% { opacity: 0; transform: scale(.08); }
    90% { opacity: .04; transform: scale(.45); }
    92% { opacity: .12; transform: scale(1.6); }
    94% { opacity: .26; transform: scale(3.8); }
    96% { opacity: .5; transform: scale(7.4); }
    98% { opacity: .8; transform: scale(12.6); }
    100% { opacity: 1; transform: scale(18); }
  }
  @keyframes endlessCorridorFlashExit {
    from { opacity: 1; transform: scale(18); }
    to { opacity: 0; transform: scale(19); }
  }
`;
