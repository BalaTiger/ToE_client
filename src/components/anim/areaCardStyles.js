export const AREA_CARD_ANIMATION_STYLES = `
  .etherealize-overlay {
    position: fixed;
    inset: 0;
    z-index: 1850;
    pointer-events: none;
    overflow: hidden;
    perspective: 1100px;
    background:
      radial-gradient(circle at 50% 42%, rgba(120,176,225,0.12), rgba(2,6,14,0.34) 54%, rgba(0,0,0,0.08));
    animation: animFadeIn 0.1s ease-out both;
  }
  .etherealize-overlay.etherealize-exiting {
    animation: animFadeOut 0.18s ease-in forwards;
  }
  .etherealize-overlay.etherealize-released {
    background: transparent;
  }
  .etherealize-overlay.etherealize-released .etherealize-stage,
  .etherealize-overlay.etherealize-released .etherealize-backlight {
    opacity: 0;
  }
  .etherealize-stage {
    position: absolute;
    z-index: 2;
    --ethereal-panel-bleed: 28px;
    transform-style: preserve-3d;
    transform-origin: 50% 50%;
    animation: etherealizePanelFlight 3.6s cubic-bezier(.16,.78,.18,1) both;
    will-change: transform, opacity, filter;
  }
  .etherealize-stack {
    position: absolute;
    inset: 0;
    transform-style: preserve-3d;
    animation: etherealizeStackPulse 3.6s linear both;
  }
  .etherealize-slice {
    position: absolute;
    inset: calc(0px - var(--ethereal-panel-bleed));
    overflow: hidden;
    border-radius: 4px;
    z-index: 1;
    opacity: var(--slice-alpha, 1);
    transform-style: preserve-3d;
    transform: translateZ(0);
    filter:
      drop-shadow(0 0 12px rgba(141,206,255,0.18))
      brightness(var(--slice-bright, 1.08));
    animation:
      etherealizeSliceSeparate 3.6s cubic-bezier(.16,.84,.22,1) both,
      etherealizeSliceDissolve 1.12s cubic-bezier(.2,.72,.18,1) both;
    animation-delay: 0s, var(--slice-delay, .72s);
    --dissolve-cut: -38%;
    --dissolve-mid: -30%;
    --dissolve-end: -12%;
    --dissolve-noise-alpha: .88;
    -webkit-mask-image:
      linear-gradient(var(--dissolve-angle, 135deg),
        transparent var(--dissolve-cut),
        rgba(0,0,0,.28) var(--dissolve-mid),
        #000 var(--dissolve-end)),
      url('/img/effects/noise/effect_noise_flow_256.webp');
    mask-image:
      linear-gradient(var(--dissolve-angle, 135deg),
        transparent var(--dissolve-cut),
        rgba(0,0,0,.28) var(--dissolve-mid),
        #000 var(--dissolve-end)),
      url('/img/effects/noise/effect_noise_flow_256.webp');
    -webkit-mask-size: 180% 180%, 168px 168px;
    mask-size: 180% 180%, 168px 168px;
    -webkit-mask-position: 0 0, var(--noise-x0, 0px) var(--noise-y0, 0px);
    mask-position: 0 0, var(--noise-x0, 0px) var(--noise-y0, 0px);
    -webkit-mask-repeat: no-repeat, repeat;
    mask-repeat: no-repeat, repeat;
    -webkit-mask-mode: alpha, luminance;
    mask-mode: alpha, luminance;
    -webkit-mask-composite: source-in;
    mask-composite: intersect;
  }
  .etherealize-unified-panel {
    position: absolute;
    inset: calc(0px - var(--ethereal-panel-bleed));
    z-index: 2;
    overflow: hidden;
    border-radius: 4px;
    opacity: 0;
    transform: translateZ(0);
    filter: drop-shadow(0 0 14px rgba(190,235,255,0.24));
    animation: etherealizeUnifiedPanel 3.6s linear both;
  }
  .etherealize-panel-html {
    position: absolute;
    left: var(--ethereal-panel-bleed);
    top: var(--ethereal-panel-bleed);
    width: calc(100% - var(--ethereal-panel-bleed) - var(--ethereal-panel-bleed));
    height: calc(100% - var(--ethereal-panel-bleed) - var(--ethereal-panel-bleed));
    transform-origin: 0 0;
  }
  .etherealize-panel-html [data-pid],
  .etherealize-panel-html [data-death-panel] {
    pointer-events: none !important;
    width: 100% !important;
    min-width: 100% !important;
    max-width: 100% !important;
    flex-basis: auto !important;
    box-sizing: border-box !important;
  }
  .etherealize-cube {
    position: absolute;
    z-index: 4;
    border-radius: 1px;
    opacity: 0;
    transform-style: preserve-3d;
    box-shadow:
      0 0 10px rgba(202,244,255,0.9),
      0 0 20px rgba(92,178,255,0.48),
      inset -1px -1px 2px rgba(20,45,72,0.78),
      inset 1px 1px 2px rgba(244,254,255,0.72);
    animation: etherealizeCubeScatter .92s cubic-bezier(.16,.78,.28,1) var(--cube-delay, .9s) both;
  }
  .etherealize-charge-particle,
  .etherealize-snap-particle,
  .etherealize-burst-particle {
    position: absolute;
    z-index: 3;
    border-radius: 1px;
    opacity: 0;
    transform-style: preserve-3d;
    box-shadow:
      0 0 8px rgba(178,232,255,0.78),
      0 0 16px rgba(92,166,236,0.34);
    mix-blend-mode: screen;
  }
  .etherealize-charge-particle {
    animation: etherealizeChargeParticle .88s cubic-bezier(.34,0,.18,1) var(--charge-delay, .42s) both;
  }
  .etherealize-snap-particle {
    z-index: 5;
    box-shadow:
      0 0 12px rgba(230,252,255,1),
      0 0 24px rgba(104,190,255,0.72),
      inset -1px -1px 2px rgba(28,62,96,0.72),
      inset 1px 1px 2px rgba(255,255,255,0.86);
    animation: etherealizeSnapParticle .36s cubic-bezier(.05,.82,.18,1) var(--snap-delay, 1.69s) both;
  }
  .etherealize-burst-particle {
    animation: etherealizeBurstParticle .72s cubic-bezier(.12,.74,.28,1) var(--burst-delay, .62s) both;
  }
  .etherealize-burst-smoke {
    position: absolute;
    z-index: 2;
    border-radius: 50%;
    opacity: 0;
    transform: translate(-50%, -50%);
    background:
      radial-gradient(circle, rgba(192,232,255,0.18), rgba(118,170,224,0.09) 42%, transparent 72%),
      repeating-conic-gradient(from 17deg, rgba(230,250,255,0.16) 0deg 9deg, rgba(82,132,190,0.05) 9deg 20deg, transparent 20deg 31deg);
    filter: blur(9px) saturate(1.2);
    mix-blend-mode: screen;
    animation: etherealizeBurstSmoke 1.05s cubic-bezier(.14,.64,.3,1) var(--smoke-delay, 1.9s) both;
  }
  .etherealize-backlight {
    position: absolute;
    z-index: 4;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    background:
      radial-gradient(circle, rgba(218,245,255,0.88) 0 5%, rgba(133,205,255,0.34) 18%, rgba(64,121,206,0.16) 42%, transparent 70%);
    filter: blur(12px) saturate(1.2);
    mix-blend-mode: screen;
    opacity: 0;
    animation: etherealizeBacklight 3.6s ease-in-out both;
  }
  @keyframes etherealizePanelFlight {
    0% {
      opacity: 1;
      transform: translate3d(0,0,0) scale(1) rotateX(0deg) rotateY(0deg) rotateZ(0deg);
      filter: brightness(1);
    }
    20% {
      opacity: 1;
      transform:
        translate3d(var(--ethereal-hover-x), var(--ethereal-hover-y), 92px)
        scale(var(--ethereal-scale-in, 1))
        rotateX(14deg) rotateY(-27deg) rotateZ(-2.2deg);
      filter: brightness(1.08) saturate(1.08);
    }
    32%, 76% {
      opacity: 1;
      transform:
        translate3d(var(--ethereal-hover-x), var(--ethereal-hover-y), 138px)
        scale(var(--ethereal-scale, 1))
        rotateX(16deg) rotateY(-31deg) rotateZ(-2.4deg);
      filter: brightness(1.18) saturate(1.15);
    }
    86% {
      opacity: 1;
      transform:
        translate3d(var(--ethereal-hover-x), var(--ethereal-hover-y), 150px)
        scale(var(--ethereal-scale-burst, 1.03))
        rotateX(8deg) rotateY(-17deg) rotateZ(-1deg);
      filter: brightness(1.65) saturate(1.4);
    }
    100% {
      opacity: 1;
      transform: translate3d(0,0,0) scale(1) rotateX(0deg) rotateY(0deg) rotateZ(0deg);
      filter: brightness(1);
    }
  }
  @keyframes etherealizeStackPulse {
    0%, 16% {
      transform: translate3d(0,0,0) translateZ(0) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1);
      filter: brightness(1);
    }
    20% {
      transform: translate3d(-1px,1px,0) translateZ(0) rotateX(.7deg) rotateY(-1.1deg) rotateZ(.35deg) scale(.998);
      filter: brightness(1.06);
    }
    24% {
      transform: translate3d(2px,-1px,0) translateZ(0) rotateX(-1.1deg) rotateY(.8deg) rotateZ(-.45deg) scale(.994);
      filter: brightness(1.12);
    }
    28% {
      transform: translate3d(-2px,-1px,0) translateZ(0) rotateX(.9deg) rotateY(1.2deg) rotateZ(.5deg) scale(.99);
      filter: brightness(1.18);
    }
    32% {
      transform: translate3d(1px,2px,0) translateZ(0) rotateX(-.7deg) rotateY(-1.4deg) rotateZ(-.4deg) scale(.986);
      filter: brightness(1.24);
    }
    37% {
      transform: translate3d(-1px,0,0) translateZ(0) rotateX(.45deg) rotateY(.7deg) rotateZ(.25deg) scale(.99);
      filter: brightness(1.2);
    }
    43% {
      transform: translate3d(0,0,0) translateZ(0) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1.014);
      filter: brightness(1.38);
    }
    53%, 70% {
      transform: translate3d(0,0,0) translateZ(36px) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1.006);
      filter: brightness(1.05);
    }
    86% {
      transform: translate3d(0,0,0) translateZ(8px) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1.018);
      filter: brightness(1.2);
    }
    100% {
      transform: translateZ(0) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1);
    }
  }
  @keyframes etherealizeSliceSeparate {
    0%, 47% {
      transform: translate3d(0,0,0) translateZ(0);
      box-shadow: 0 0 0 rgba(140,210,255,0);
    }
    53%, 72% {
      transform:
        translate3d(var(--slice-x, 0px), var(--slice-y, 0px), var(--slice-z, 0px));
      box-shadow: -22px 15px 34px rgba(3,8,18,0.26), 0 0 28px rgba(148,220,255,0.2);
    }
    86%, 100% {
      transform: translate3d(0,0,0) translateZ(0);
      box-shadow: 0 0 0 rgba(140,210,255,0);
    }
  }
  @keyframes etherealizeSliceDissolve {
    0%, 8% {
      opacity: var(--slice-alpha, 1);
      --dissolve-cut: -38%;
      --dissolve-mid: -31%;
      --dissolve-end: -12%;
      -webkit-mask-position: 0 0, var(--noise-x0, 0px) var(--noise-y0, 0px);
      mask-position: 0 0, var(--noise-x0, 0px) var(--noise-y0, 0px);
      filter:
        drop-shadow(0 0 12px rgba(141,206,255,0.18))
        brightness(1.08) saturate(1.1);
    }
    28% {
      opacity: var(--slice-alpha, 1);
      --dissolve-cut: 18%;
      --dissolve-mid: 27%;
      --dissolve-end: 50%;
      -webkit-mask-position: 0 0, var(--noise-x35, 0px) var(--noise-y35, 0px);
      mask-position: 0 0, var(--noise-x35, 0px) var(--noise-y35, 0px);
      filter:
        drop-shadow(-5px 4px 5px rgba(184,235,255,0.58))
        drop-shadow(0 0 14px rgba(92,166,236,0.34))
        brightness(1.22) saturate(1.18) blur(0.18px);
    }
    52% {
      opacity: var(--slice-alpha-mid, .8);
      --dissolve-cut: 56%;
      --dissolve-mid: 66%;
      --dissolve-end: 90%;
      -webkit-mask-position: 0 0, var(--noise-x68, 0px) var(--noise-y68, 0px);
      mask-position: 0 0, var(--noise-x68, 0px) var(--noise-y68, 0px);
      filter:
        drop-shadow(-7px 5px 7px rgba(204,245,255,0.7))
        drop-shadow(0 0 18px rgba(96,178,255,0.46))
        brightness(1.5) saturate(1.28) blur(0.28px);
    }
    74% {
      opacity: var(--slice-alpha-low, .27);
      --dissolve-cut: 92%;
      --dissolve-mid: 104%;
      --dissolve-end: 130%;
      -webkit-mask-position: 0 0, var(--noise-x100, 0px) var(--noise-y100, 0px);
      mask-position: 0 0, var(--noise-x100, 0px) var(--noise-y100, 0px);
      filter:
        drop-shadow(-7px 5px 8px rgba(224,252,255,0.72))
        drop-shadow(0 0 20px rgba(96,178,255,0.5))
        brightness(1.85) saturate(1.38) blur(0.48px);
    }
    92%, 100% {
      opacity: 0;
      --dissolve-cut: 138%;
      --dissolve-mid: 150%;
      --dissolve-end: 176%;
      -webkit-mask-position: 0 0, var(--noise-x125, 0px) var(--noise-y125, 0px);
      mask-position: 0 0, var(--noise-x125, 0px) var(--noise-y125, 0px);
    }
  }
  @keyframes etherealizeUnifiedPanel {
    0%, 88% {
      opacity: 0;
      clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%);
      filter: brightness(1.18) saturate(1.1);
    }
    91% {
      opacity: 1;
      clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%);
      filter: brightness(2.35) saturate(1.48);
    }
    94% {
      opacity: 1;
      clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%);
      filter: brightness(1.16) saturate(1.08);
    }
    100% {
      opacity: 1;
      clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%);
      filter: brightness(1) saturate(1);
    }
  }
  @keyframes etherealizeCubeScatter {
    0% {
      opacity: 0;
      transform: translate3d(0,0,0) rotateX(0deg) rotateY(0deg) scale(.42);
    }
    10% { opacity: 1; }
    74% {
      opacity: .92;
      transform:
        translate3d(var(--cube-dx-mid), var(--cube-dy-mid), var(--cube-dz-mid))
        rotateX(var(--cube-rx-mid))
        rotateY(var(--cube-ry-mid))
        scale(1.12);
    }
    100% {
      opacity: 0;
      transform:
        translate3d(var(--cube-dx), var(--cube-dy), var(--cube-dz))
        rotateX(var(--cube-rx))
        rotateY(var(--cube-ry))
        scale(.62);
    }
  }
  @keyframes etherealizeSnapParticle {
    0% {
      opacity: 0;
      transform: translate3d(0,0,0) rotateX(0deg) rotateY(0deg) scale(.38);
      filter: brightness(1.7);
    }
    5% {
      opacity: 1;
    }
    58% {
      opacity: .92;
      transform:
        translate3d(var(--snap-dx), var(--snap-dy), var(--snap-dz))
        rotateX(var(--snap-rx))
        rotateY(var(--snap-ry))
        scale(1.05);
      filter: brightness(1.35);
    }
    100% {
      opacity: 0;
      transform:
        translate3d(var(--snap-dx), var(--snap-dy), var(--snap-dz))
        rotateX(var(--snap-rx))
        rotateY(var(--snap-ry))
        scale(.35);
      filter: brightness(.9) blur(.35px);
    }
  }
  @keyframes etherealizeBurstSmoke {
    0% {
      opacity: 0;
      transform: translate(-50%, -50%) translate3d(0,0,0) rotate(0deg) scale(.35);
      filter: blur(6px) saturate(1.15);
    }
    12% { opacity: .44; }
    64% {
      opacity: .3;
      transform:
        translate(-50%, -50%)
        translate3d(var(--smoke-dx), var(--smoke-dy), var(--smoke-dz))
        rotate(var(--smoke-rot))
        scale(1.12);
      filter: blur(12px) saturate(1.2);
    }
    100% {
      opacity: 0;
      transform:
        translate(-50%, -50%)
        translate3d(var(--smoke-dx), var(--smoke-dy), var(--smoke-dz))
        rotate(var(--smoke-rot))
        scale(1.45);
      filter: blur(18px) saturate(1.05);
    }
  }
  @keyframes etherealizeChargeParticle {
    0% {
      opacity: 0;
      transform: translate3d(0,0,70px) scale(.55) rotateZ(0deg);
      filter: blur(.5px);
    }
    18% { opacity: .9; }
    76% {
      opacity: .92;
      transform: translate3d(var(--charge-tx), var(--charge-ty), 24px) scale(1.12) rotateZ(120deg);
      filter: blur(0);
    }
    100% {
      opacity: 0;
      transform: translate3d(var(--charge-tx), var(--charge-ty), 0) scale(.28) rotateZ(180deg);
      filter: blur(1px);
    }
  }
  @keyframes etherealizeBurstParticle {
    0% {
      opacity: 0;
      transform: translate3d(0,0,0) rotateX(0deg) rotateY(0deg) scale(.5);
    }
    8% { opacity: .98; }
    72% {
      opacity: .82;
      transform:
        translate3d(var(--burst-dx), var(--burst-dy), var(--burst-dz))
        rotateX(var(--burst-rx))
        rotateY(var(--burst-ry))
        scale(1);
    }
    100% {
      opacity: 0;
      transform:
        translate3d(var(--burst-dx), var(--burst-dy), var(--burst-dz))
        rotateX(var(--burst-rx))
        rotateY(var(--burst-ry))
        scale(.42);
    }
  }
  @keyframes etherealizeBacklight {
    0%, 12% {
      opacity: 0;
      transform: translate(-50%, -50%) translate3d(0,0,0) scale(.36);
    }
    34% {
      opacity: .42;
      transform: translate(-50%, -50%) translate3d(0,0,0) scale(.96);
    }
    78% {
      opacity: .72;
      transform: translate(-50%, -50%) translate3d(0,0,0) scale(1.76);
    }
    88%, 94% {
      opacity: 1;
      transform: translate(-50%, -50%) translate3d(0,0,0) scale(3.1);
      filter: blur(8px) saturate(1.5) brightness(1.8);
    }
    97% {
      opacity: 0;
      transform: translate(-50%, -50%) translate3d(0,0,0) scale(2.25);
      filter: blur(12px) saturate(1.35) brightness(1.35);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -50%) translate3d(0,0,0) scale(.72);
    }
  }
  .night-wind-overlay {
    position: fixed;
    inset: 0;
    z-index: 1200;
    pointer-events: none;
    overflow: hidden;
    background:
      radial-gradient(circle at 48% 52%, rgba(112,86,51,0.08), rgba(4,6,11,0.58) 72%),
      linear-gradient(180deg, rgba(2,4,9,0.28), rgba(83,57,27,0.18));
    animation: animFadeIn 0.12s ease-out both;
  }
  .night-wind-overlay.night-wind-exiting {
    animation: animFadeOut 0.18s ease-in forwards;
  }
  .night-wind-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .burrowing-worm-overlay {
    position: fixed;
    inset: 0;
    z-index: 1220;
    pointer-events: none;
    overflow: hidden;
    background:
      radial-gradient(circle at 50% 54%, rgba(88,56,28,0.12), rgba(4,3,2,0.28) 58%, rgba(0,0,0,0.34));
    animation: animFadeIn 0.1s ease-out both;
  }
  .burrowing-worm-overlay.burrowing-worm-exiting {
    animation: animFadeOut 0.18s ease-in forwards;
  }
  .burrowing-worm-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .volcano-overlay {
    position: fixed;
    inset: 0;
    z-index: 1200;
    pointer-events: none;
    overflow: hidden;
    background:
      radial-gradient(circle at 50% 48%, rgba(105,35,8,0.11), rgba(5,2,1,0.42) 72%),
      linear-gradient(180deg, rgba(46,13,4,0.09), rgba(0,0,0,0.16));
    animation: animFadeIn 0.16s ease-out both;
  }
  .volcano-overlay.volcano-exiting {
    animation: animFadeOut 0.18s ease-in forwards;
  }
  .volcano-vignette {
    position: absolute;
    inset: 0;
    box-shadow: inset 0 0 120px rgba(255,96,16,0.12);
    background:
      radial-gradient(circle at 24% 34%, rgba(255,174,66,0.06), transparent 18%),
      radial-gradient(circle at 70% 44%, rgba(255,102,26,0.07), transparent 22%),
      linear-gradient(180deg, rgba(46,13,4,0.08), rgba(0,0,0,0.12));
  }
  .volcano-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    mix-blend-mode: screen;
  }
  .geomagnetic-title {
    position: absolute;
    left: 50%;
    top: 12%;
    transform: translateX(-50%);
    font-family: 'Cinzel Decorative','Cinzel',serif;
    font-size: 24px;
    font-weight: 700;
    letter-spacing: 6px;
    color: #9ff6e8;
    text-shadow: 0 0 14px #5eead4, 0 0 34px #0f766e;
    animation: geomagneticTitleFlicker 2.2s linear both;
  }
  .geomagnetic-compass {
    position: absolute;
    left: 50%;
    top: 45%;
    width: 252px;
    height: 252px;
    margin-left: -126px;
    margin-top: -126px;
    animation: geomagneticDialShake 0.16s steps(2,end) 0.12s 15 both;
  }
  .geomagnetic-compass-glow {
    position: absolute;
    inset: -46px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(94,234,212,0.22), rgba(20,184,166,0.12) 36%, rgba(6,78,59,0) 70%);
    filter: blur(4px);
    animation: geomagneticPulse 0.48s ease-in-out 0.1s 5 alternate both;
  }
  .geomagnetic-dial {
    position: absolute;
    left: 6px;
    top: 6px;
    filter: drop-shadow(0 0 16px rgba(94,234,212,0.48)) drop-shadow(0 0 36px rgba(8,145,178,0.28));
  }
  .geomagnetic-needle {
    position: absolute;
    left: 38px;
    top: 38px;
    transform-origin: 50% 50%;
    animation: geomagneticNeedleSpin 0.34s linear 0.12s 7 both;
    filter: drop-shadow(0 0 12px rgba(248,113,113,0.7)) drop-shadow(0 0 18px rgba(96,165,250,0.5));
  }
  .geomagnetic-field {
    position: absolute;
    left: 50%;
    top: 45%;
    width: 520px;
    height: 290px;
    margin-left: -260px;
    margin-top: -145px;
    border-radius: 50%;
    border: 1px solid rgba(94,234,212,0.28);
    box-shadow: 0 0 42px rgba(94,234,212,0.18), inset 0 0 32px rgba(45,212,191,0.12);
    animation: geomagneticFieldWarp 0.72s ease-in-out 0.05s 4 alternate both;
  }
  .geomagnetic-field-b {
    width: 390px;
    height: 470px;
    margin-left: -195px;
    margin-top: -235px;
    border-color: rgba(232,200,122,0.2);
    animation-delay: 0.18s;
    animation-direction: alternate-reverse;
  }
  .geomagnetic-noise {
    position: absolute;
    inset: 0;
    background:
      repeating-linear-gradient(90deg, rgba(94,234,212,0.03) 0 1px, transparent 1px 14px),
      repeating-linear-gradient(0deg, rgba(232,200,122,0.025) 0 1px, transparent 1px 18px);
    opacity: 0;
    animation: geomagneticNoise 2.2s linear both;
  }
  .geomagnetic-restore-overlay {
    position: fixed;
    inset: 0;
    z-index: 1200;
    pointer-events: none;
    overflow: hidden;
    animation: animFadeIn 0.12s ease-out forwards;
  }
  .geomagnetic-restore-overlay.geomagnetic-restore-exiting {
    animation: animFadeOut 0.18s ease-in forwards;
  }
  .geomagnetic-restore-vignette {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 50% 70%, rgba(94,234,212,0.12), transparent 38%),
      linear-gradient(180deg, rgba(2,8,10,0.2), rgba(2,8,10,0.48));
  }
  .geomagnetic-restore-card {
    position: absolute;
    left: 50%;
    top: 78%;
    width: 84px;
    height: 118px;
    margin-left: -42px;
    margin-top: -59px;
    opacity: 0;
    animation: geomagneticRestoreFly 1.05s cubic-bezier(0.25,0,0.28,1) both;
    filter: drop-shadow(0 0 12px rgba(94,234,212,0.72));
  }
  .geomagnetic-restore-ripple {
    position: absolute;
    left: 50%;
    top: 78%;
    width: 84px;
    height: 118px;
    margin-left: -42px;
    margin-top: -59px;
    border-radius: 8px;
    border: 1px solid rgba(94,234,212,0.55);
    opacity: 0;
    box-shadow: 0 0 28px rgba(94,234,212,0.36), inset 0 0 18px rgba(94,234,212,0.24);
    animation: geomagneticRestoreRipple 1.05s cubic-bezier(0.25,0,0.28,1) both;
  }
  .geomagnetic-restore-msgs {
    animation-delay: 0.2s;
  }
  .geomagnetic-msgs {
    position: absolute;
    left: 50%;
    bottom: 11%;
    transform: translateX(-50%);
    width: min(520px, calc(100vw - 40px));
    padding: 10px 18px;
    border: 1px solid rgba(94,234,212,0.28);
    border-radius: 4px;
    background: rgba(2,8,10,0.62);
    color: #c8a96e;
    font-family: 'IM Fell English','Georgia',serif;
    font-size: 13px;
    line-height: 1.7;
    text-align: center;
    box-shadow: 0 0 22px rgba(15,118,110,0.2);
    animation: animFadeIn 0.35s ease-out 0.9s both;
  }
  @keyframes geomagneticTitleFlicker {
    0%, 100% { opacity: 0.98; transform: translateX(-50%) translateY(0); }
    8%, 22%, 49%, 72% { opacity: 0.62; transform: translateX(-50%) translateY(-1px); }
    14%, 31%, 56%, 84% { opacity: 1; }
  }
  @keyframes geomagneticDialShake {
    0% { transform: translate(0,0) rotate(0deg); }
    20% { transform: translate(-6px,3px) rotate(-2.4deg); }
    40% { transform: translate(5px,-4px) rotate(2.8deg); }
    60% { transform: translate(-3px,-5px) rotate(-1.6deg); }
    80% { transform: translate(6px,4px) rotate(2.2deg); }
    100% { transform: translate(0,0) rotate(0deg); }
  }
  @keyframes geomagneticNeedleSpin {
    0% { transform: rotate(0deg) scale(1); }
    50% { transform: rotate(810deg) scale(1.06); }
    100% { transform: rotate(1440deg) scale(1); }
  }
  @keyframes geomagneticPulse {
    from { opacity: 0.34; transform: scale(0.82); }
    to { opacity: 0.92; transform: scale(1.16); }
  }
  @keyframes geomagneticFieldWarp {
    from { opacity: 0.28; transform: rotate(-8deg) scale(0.82); filter: blur(0px); }
    to { opacity: 0.86; transform: rotate(16deg) scale(1.22); filter: blur(2px); }
  }
  @keyframes geomagneticNoise {
    0% { opacity: 0; transform: translateY(0); }
    16%, 78% { opacity: 0.78; }
    100% { opacity: 0; transform: translateY(12px); }
  }
  @keyframes geomagneticRestoreFly {
    0% { opacity: 0; transform: translate(0,0) rotate(-8deg) scale(0.78); }
    16% { opacity: 1; transform: translate(0,-18px) rotate(4deg) scale(0.98); }
    58% { opacity: 1; transform: translate(calc(var(--gm-restore-tx, -220px) * 0.56), calc(var(--gm-restore-ty, -120px) * 0.42 - 34px)) rotate(178deg) scale(0.88); }
    100% { opacity: 0.2; transform: translate(var(--gm-restore-tx, -220px), var(--gm-restore-ty, -120px)) rotate(360deg) scale(0.48); }
  }
  @keyframes geomagneticRestoreRipple {
    0%, 62% { opacity: 0; transform: translate(var(--gm-restore-tx, -220px), var(--gm-restore-ty, -120px)) scale(0.28); }
    74% { opacity: 0.82; transform: translate(var(--gm-restore-tx, -220px), var(--gm-restore-ty, -120px)) scale(0.58); }
    100% { opacity: 0; transform: translate(var(--gm-restore-tx, -220px), var(--gm-restore-ty, -120px)) scale(1.25); }
  }
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
