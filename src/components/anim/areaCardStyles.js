export const AREA_CARD_ANIMATION_STYLES = `
  .volcano-overlay {
    position: fixed;
    inset: 0;
    z-index: 1200;
    pointer-events: none;
    overflow: hidden;
    background: radial-gradient(circle at var(--volcano-impact-x, 72vw) var(--volcano-impact-y, 25vh), rgba(105,35,8,0.36), rgba(5,2,1,0.82) 70%);
    animation: volcanoScreenQuake 0.42s cubic-bezier(0.28,0,0.2,1) 0.72s both;
  }
  .volcano-overlay.volcano-exiting {
    animation: volcanoScreenQuake 0.42s cubic-bezier(0.28,0,0.2,1) 0.72s both, animFadeOut 0.18s ease-in forwards;
  }
  .volcano-vignette {
    position: absolute;
    inset: 0;
    box-shadow: inset 0 0 120px rgba(255,96,16,0.22);
    background:
      radial-gradient(circle at var(--volcano-impact-x, 72vw) var(--volcano-impact-y, 25vh), rgba(255,174,66,0.22), transparent 24%),
      linear-gradient(180deg, rgba(46,13,4,0.18), rgba(0,0,0,0.16));
  }
  .volcano-meteor {
    position: absolute;
    left: var(--volcano-impact-x, 72vw);
    top: var(--volcano-impact-y, 25vh);
    width: 76px;
    height: 76px;
    margin-left: -38px;
    margin-top: -38px;
    transform: translate(var(--volcano-from-x, -58vw), var(--volcano-from-y, -55vh)) rotate(-28deg) scale(1.05);
    animation: volcanoMeteorFall 0.82s cubic-bezier(0.1,0.82,0.18,1) both;
  }
  .volcano-meteor-tail {
    position: absolute;
    left: -186px;
    top: 18px;
    width: 228px;
    height: 28px;
    border-radius: 50%;
    background: linear-gradient(90deg, rgba(255,59,10,0), rgba(255,110,21,0.22), rgba(255,205,96,0.92));
    filter: blur(7px);
    transform: rotate(-12deg);
    transform-origin: 100% 50%;
    animation: volcanoTailPulse 0.82s ease-out both;
  }
  .volcano-meteor-rock {
    position: absolute;
    left: 18px;
    top: 18px;
    width: 42px;
    height: 42px;
    border-radius: 46% 54% 41% 59% / 48% 38% 62% 52%;
    background:
      radial-gradient(circle at 32% 28%, #ffe08a 0 8%, #ff7a18 9% 24%, #53200b 58%, #160905 100%);
    box-shadow: 0 0 20px rgba(255,120,24,0.9), 0 0 44px rgba(248,65,12,0.56);
  }
  .volcano-impact-flash {
    position: absolute;
    left: var(--volcano-impact-x, 72vw);
    top: var(--volcano-impact-y, 25vh);
    width: 24px;
    height: 24px;
    margin-left: -12px;
    margin-top: -12px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255,242,184,1), rgba(255,135,30,0.72) 35%, rgba(255,64,12,0) 72%);
    opacity: 0;
    animation: volcanoImpactFlash 0.42s ease-out 0.72s both;
  }
  .volcano-lava-field {
    position: absolute;
    left: var(--volcano-impact-x, 72vw);
    top: var(--volcano-impact-y, 25vh);
    width: 240px;
    height: 180px;
    margin-left: -120px;
    margin-top: -90px;
    opacity: 0;
    transform-origin: 50% 50%;
    animation: volcanoLavaShrink 2s cubic-bezier(0.12,0.62,0.22,1) 0.78s both;
    filter: drop-shadow(0 0 16px rgba(255,90,20,0.66));
  }
  .volcano-lava-shape {
    transform-origin: center;
  }
  .volcano-lava-outer {
    fill: rgba(101,24,8,0.96);
    stroke: rgba(255,138,42,0.76);
    stroke-width: 4;
  }
  .volcano-lava-inner {
    fill: rgba(255,113,18,0.78);
    stroke: rgba(255,222,112,0.82);
    stroke-width: 2;
    animation: volcanoLavaPulse 0.34s ease-in-out 0.8s 4 alternate both;
  }
  .volcano-crack {
    fill: none;
    stroke: rgba(255,226,118,0.9);
    stroke-width: 5;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: blur(0.6px);
  }
  .volcano-crack-b {
    stroke-width: 3;
    opacity: 0.72;
  }
  .volcano-embers {
    position: absolute;
    left: var(--volcano-impact-x, 72vw);
    top: var(--volcano-impact-y, 25vh);
  }
  .volcano-embers span {
    position: absolute;
    left: 0;
    top: 0;
    width: 6px;
    height: 6px;
    margin-left: -3px;
    margin-top: -3px;
    border-radius: 50%;
    background: radial-gradient(circle, #fff4b8, #ff8a1c 48%, rgba(255,61,12,0) 76%);
    box-shadow: 0 0 10px rgba(255,125,28,0.88);
    opacity: 0;
    animation: volcanoEmberBurst 0.92s ease-out var(--ember-delay, 0.78s) both;
  }
  .volcano-msgs {
    position: absolute;
    left: 50%;
    bottom: 11%;
    transform: translateX(-50%);
    width: min(520px, calc(100vw - 40px));
    padding: 10px 18px;
    border: 1px solid rgba(255,130,42,0.32);
    border-radius: 4px;
    background: rgba(20,5,2,0.66);
    color: #f4c978;
    font-family: 'IM Fell English','Georgia',serif;
    font-size: 13px;
    line-height: 1.7;
    text-align: center;
    box-shadow: 0 0 22px rgba(255,92,20,0.22);
    animation: animFadeIn 0.3s ease-out 0.72s both;
  }
  @keyframes volcanoMeteorFall {
    0% { opacity: 0; transform: translate(var(--volcano-from-x, -58vw), var(--volcano-from-y, -55vh)) rotate(-28deg) scale(1.05); }
    12% { opacity: 1; }
    86% { opacity: 1; transform: translate(-8px,-8px) rotate(10deg) scale(1); }
    100% { opacity: 0; transform: translate(0,0) rotate(18deg) scale(0.38); }
  }
  @keyframes volcanoTailPulse {
    0% { opacity: 0; transform: rotate(-12deg) scaleX(0.3); }
    18% { opacity: 0.95; }
    100% { opacity: 0; transform: rotate(-12deg) scaleX(1.05); }
  }
  @keyframes volcanoScreenQuake {
    0%, 68% { transform: translate(0,0); }
    72% { transform: translate(-7px,4px); }
    77% { transform: translate(6px,-5px); }
    82% { transform: translate(-4px,-3px); }
    88% { transform: translate(5px,3px); }
    94%, 100% { transform: translate(0,0); }
  }
  @keyframes volcanoImpactFlash {
    0% { opacity: 0; transform: scale(0.3); }
    24% { opacity: 1; transform: scale(5.2); }
    100% { opacity: 0; transform: scale(9); }
  }
  @keyframes volcanoLavaShrink {
    0% { opacity: 0; transform: scale(0.55) rotate(-5deg); }
    12% { opacity: 1; transform: scale(1.06) rotate(2deg); }
    58% { opacity: 0.92; transform: scale(0.72) rotate(-2deg); }
    100% { opacity: 0; transform: scale(0.08) rotate(4deg); }
  }
  @keyframes volcanoLavaPulse {
    from { opacity: 0.64; transform: scale(0.94); }
    to { opacity: 1; transform: scale(1.08); }
  }
  @keyframes volcanoEmberBurst {
    0% { opacity: 0; transform: translate(0,0) scale(0.5); }
    16% { opacity: 1; }
    100% { opacity: 0; transform: translate(var(--ember-x), var(--ember-y)) scale(0.15); }
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
    left: calc(50% - 42px);
    top: calc(78% - 59px);
    width: 84px;
    height: 118px;
    opacity: 0;
    animation: geomagneticRestoreFly 1.05s cubic-bezier(0.25,0,0.28,1) both;
    filter: drop-shadow(0 0 12px rgba(94,234,212,0.72));
  }
  .geomagnetic-restore-ripple {
    position: absolute;
    left: calc(50% - 42px);
    top: calc(78% - 59px);
    width: 84px;
    height: 118px;
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
