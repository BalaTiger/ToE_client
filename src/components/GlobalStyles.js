import { buildPublicUrl } from '../utils/url';
import { DAMAGE_LINK_ANIMATION_STYLES } from './anim/damageLinkStyles';
import { EARTHQUAKE_ANIMATION_STYLES } from './anim/earthquakeStyles';
import { MOVE_ANIMATION_STYLES } from './anim/moveStyles';
import { GOD_POWER_ANIMATION_STYLES } from './anim/godPowerStyles';
import { GOD_HIGHLIGHT_ANIMATION_STYLES } from './anim/godHighlightStyles';
import { SKILL_ANIMATION_STYLES } from './anim/skillStyles';
import { AREA_CARD_ANIMATION_STYLES } from './anim/areaCardStyles';
import { DAMAGE_ANIMATION_STYLES } from './anim/damageStyles';
import { APOPHIS_ANIMATION_STYLES } from './anim/apophisStyles';
import { SNAKE_TRAP_ANIMATION_STYLES } from './anim/snakeTrapStyles';
import { ENDLESS_CORRIDOR_ANIMATION_STYLES } from './anim/endlessCorridorStyles';

export const GLOBAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700&family=Cinzel:wght@400;600;700&family=IM+Fell+English:ital@0;1&display=swap');
  * { box-sizing:border-box; scrollbar-width:thin; scrollbar-color:var(--toe-line,#3a2510) var(--toe-bg,#0a0705); }
  ::-webkit-scrollbar{width:5px;height:5px;}
  ::-webkit-scrollbar-track{background:var(--toe-bg,#0a0705);}
  ::-webkit-scrollbar-thumb{background:var(--toe-line,#3a2510);border-radius:2px;}
  [data-log-panel]::-webkit-scrollbar-track{background:var(--toe-panel,#0e0904);}
  [data-log-panel]{scrollbar-color:var(--toe-line,#3a2510) var(--toe-panel,#0e0904);}
  html,body{ overflow-x:hidden; }
  .toe-battle-root {
    background-color:var(--toe-bg,#0a0705);
  }
  .toe-battle-root::before,
  .toe-battle-root::after {
    content:"";
    position:fixed;
    inset:-5vmax;
    pointer-events:none;
    background-image:var(--toe-battle-bg-image);
    background-size:var(--toe-battle-bg-size);
    background-position:var(--toe-battle-bg-position);
    background-repeat:var(--toe-battle-bg-repeat);
    background-attachment:var(--toe-battle-bg-attachment);
    transform:translate3d(0,0,0) scale(1);
    transform-origin:50% 48%;
    will-change:transform, opacity;
  }
  .toe-battle-root::before {
    z-index:0;
  }
  .toe-battle-root::after {
    z-index:1;
    opacity:0;
  }
  .toe-battle-root > * {
    position:relative;
    z-index:2;
  }
  .toe-battle-root.toe-draw-camera-active::after {
    animation:toeDrawBackgroundWalk 0.92s cubic-bezier(0.34,0,0.24,1) 3 both;
  }
  @keyframes toeDrawBackgroundWalk {
    0% {
      opacity:0;
      transform:translate3d(0,0,0) scale(1);
    }
    12% {
      opacity:1;
      transform:translate3d(0,2px,0) scale(1.028);
    }
    42% {
      opacity:1;
      transform:translate3d(0,8px,0) scale(1.06);
    }
    58% {
      opacity:0.88;
      transform:translate3d(0,-4px,0) scale(1.1);
    }
    68% {
      opacity:0.62;
      transform:translate3d(0,-6px,0) scale(1.12);
    }
    86% {
      opacity:0.26;
      transform:translate3d(0,5px,0) scale(1.15);
    }
    100% {
      opacity:0;
      transform:translate3d(0,5px,0) scale(1.16);
    }
  }
  @keyframes scrollLeft {
    0% { transform: translateX(100%); }
    100% { transform: translateX(-100%); }
  }
  /* 信仰瞬间：邪神之力标签内 ^ 形箭头向上连续滚动 */
  @keyframes godWorshipChevron {
    0%   { transform: translateY(125%); opacity: 0; }
    18%  { opacity: 0.9; }
    82%  { opacity: 0.9; }
    100% { transform: translateY(-125%); opacity: 0; }
  }
  .god-power-chevron-layer {
    position:absolute;
    inset:0;
    overflow:hidden;
    pointer-events:none;
    display:flex;
    flex-direction:column;
    align-items:stretch;
    justify-content:flex-start;
    animation:godWorshipChevron 1.05s ease-out forwards;
  }
  .god-power-chevron-row {
    position:relative;
    display:block;
    width:100%;
    height:7px;
    flex:0 0 7px;
  }
  .god-power-chevron-glyph {
    position:absolute;
    left:50%;
    top:50%;
    width:14px;
    height:8px;
    color:#ffe9b0;
    transform:translate(-50%,-50%) scaleX(var(--god-power-chevron-scale, 8));
    transform-origin:center;
    filter:
      drop-shadow(0 0 5px var(--god-power-col,#c06020))
      drop-shadow(0 0 2px #fff);
  }
  .god-power-chevron-glyph::before,
  .god-power-chevron-glyph::after {
    content:"";
    position:absolute;
    top:3px;
    width:8px;
    height:2px;
    background:currentColor;
    border-radius:999px;
    box-shadow:0 0 4px var(--god-power-col,#c06020);
  }
  .god-power-chevron-glyph::before {
    right:50%;
    transform-origin:100% 50%;
    transform:rotate(-30deg);
  }
  .god-power-chevron-glyph::after {
    left:50%;
    transform-origin:0 50%;
    transform:rotate(30deg);
  }
  .etherealize-chevron-layer {
    animation-duration:0.92s;
    mix-blend-mode:screen;
  }
  .etherealize-chevron-layer .god-power-chevron-glyph {
    color:#d9f3ff;
    filter:
      drop-shadow(0 0 6px #87a9c8)
      drop-shadow(0 0 2px #fff);
  }
  .etherealize-consume-float {
    position:fixed;
    transform:translate(-50%,-100%);
    z-index:470;
    pointer-events:none;
    font-family:'Cinzel',serif;
    font-size:22px;
    font-weight:700;
    letter-spacing:1px;
    color:#d9f3ff;
    text-shadow:
      0 0 10px #87a9c8,
      0 0 3px #fff,
      0 2px 6px #000;
    animation:etherealizeConsumeFloat 0.9s ease-out forwards;
  }
  @keyframes etherealizeConsumeFloat {
    0%   { transform:translate(-50%,-100%) scale(0.6); opacity:0; }
    18%  { transform:translate(-50%,-130%) scale(1.15); opacity:1; }
    55%  { transform:translate(-50%,-170%) scale(1); opacity:1; }
    100% { transform:translate(-50%,-240%) scale(0.92); opacity:0; }
  }

  /* ── Mobile / small-screen overrides ── */
  @media (max-width:580px){
    /* Tighten global padding */
    body { font-size:13px; }
    /* Modals stay within viewport */
    [data-modal]{max-width:calc(100vw - 24px)!important;padding:20px 16px!important;}
    /* Phase bar text wrap */
    [data-phasebar]{font-size:10px!important;}
    /* Hand area tighter padding */
    [data-handarea]{padding:8px 9px!important;}
    /* Phase/status tooltip fit */
    [data-tooltip]{max-width:calc(100vw - 32px)!important;}
  }

  /* ── Prevent fixed overlays from cutting off on very small screens ── */
  @media (max-width:400px){
    body{font-size:12px;}
  }

  @keyframes animFadeIn  { from{opacity:0} to{opacity:1} }
  @keyframes animFadeOut { from{opacity:1} to{opacity:0} }
  @keyframes animPop     { 0%{transform:scale(0.5);opacity:0} 60%{transform:scale(1.1)} 100%{transform:scale(1);opacity:1} }
  @keyframes spinLoader  { to{transform:rotate(360deg)} }
  @keyframes toastIn     { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes animShake   { 0%,100%{transform:translateX(0)} 15%{transform:translateX(-12px)} 35%{transform:translateX(14px)} 55%{transform:translateX(-9px)} 75%{transform:translateX(9px)} }
  @keyframes swapBlindShuffleIn {
    0%   { transform: translate(var(--start-x,0), var(--start-y,0)) rotateZ(var(--start-rz,0deg)) rotateY(var(--start-ry,0deg)) scale(0.7); opacity: 0; }
    40%  { opacity: 1; }
    70%  { transform: translate(var(--pile-x,0), var(--pile-y,0)) rotateZ(0deg) rotateY(var(--pile-ry,0deg)) scale(1); }
    100% { transform: translate(var(--final-x,0), var(--final-y,0)) rotateZ(0deg) rotateY(var(--final-ry,0deg)) scale(1); opacity: 1; }
  }
  @keyframes swapBlindFlyCard {
    0%   { transform: translate(0,0) scale(1); opacity: 1; }
    100% { transform: translate(var(--fly-tx,0), var(--fly-ty,0)) scale(0.55); opacity: 0; }
  }
  @keyframes swapBlindGlowPulse {
    0%,100% { box-shadow: 0 0 12px rgba(200,169,110,0.25); }
    50%     { box-shadow: 0 0 28px rgba(200,169,110,0.55); }
  }
  @keyframes animVig     { 0%,100%{opacity:0} 50%{opacity:1} }
  @keyframes animGlow    { 0%,100%{box-shadow:0 0 8px #c8a96e33} 50%{box-shadow:0 0 22px #c8a96e88} }
  @keyframes blackGoatCardHop {
    0%{transform:translateY(0) scale(1);filter:brightness(1) drop-shadow(0 0 0 rgba(74,222,128,0));}
    18%{transform:translateY(-7px) scale(1.02);filter:brightness(1.22) drop-shadow(0 0 8px rgba(74,222,128,.38));}
    46%{transform:translateY(-20px) scale(1.045);filter:brightness(1.72) drop-shadow(0 0 18px rgba(74,222,128,.72));}
    72%{transform:translateY(3px) scale(.995);filter:brightness(1.08) drop-shadow(0 0 5px rgba(74,222,128,.24));}
    86%{transform:translateY(-2px) scale(1.005);filter:brightness(1.04) drop-shadow(0 0 4px rgba(74,222,128,.18));}
    100%{transform:translateY(0) scale(1);filter:brightness(1) drop-shadow(0 0 0 rgba(74,222,128,0));}
  }
  @keyframes blackGoatCardAura {
    0%{opacity:0;transform:scale(.74);}
    38%{opacity:.95;transform:scale(1.05);}
    100%{opacity:0;transform:scale(1.32);}
  }
  @keyframes blackGoatCardSparks {
    0%{opacity:0;transform:translateY(4px) scale(.6);}
    44%{opacity:1;transform:translateY(-13px) scale(1);}
    100%{opacity:0;transform:translateY(-28px) scale(.72);}
  }
  .black-goat-card-pulse{
    position:relative;
    animation:blackGoatCardHop .76s cubic-bezier(.22,.82,.28,1.18) both;
    z-index:80!important;
  }
  .black-goat-card-pulse::before{
    content:'';
    position:absolute;
    inset:-9px;
    border-radius:8px;
    pointer-events:none;
    background:radial-gradient(circle,rgba(74,222,128,.24),rgba(74,222,128,.08) 42%,transparent 68%);
    box-shadow:0 0 18px rgba(74,222,128,.45),inset 0 0 12px rgba(190,255,205,.2);
    animation:blackGoatCardAura .76s ease-out both;
  }
  .black-goat-card-pulse::after{
    content:'';
    position:absolute;
    left:50%;
    top:42%;
    width:4px;
    height:4px;
    border-radius:50%;
    pointer-events:none;
    background:#9dffb2;
    box-shadow:-18px -2px 0 #4ade80,16px -7px 0 #b7ffbf,-8px 14px 0 #6ee78f,21px 11px 0 #4ade80,0 -20px 0 #d6ffd8;
    animation:blackGoatCardSparks .76s ease-out both;
  }
  [data-self-hand-card-id][data-ignite-torch-flame="true"]{
    filter:drop-shadow(0 0 12px rgba(255,128,24,.82)) drop-shadow(0 0 24px rgba(255,70,12,.46));
  }
  .ignite-torch-flame-layer{
    position:absolute;
    left:var(--ignite-flame-left, 0px);
    top:var(--ignite-flame-top, 0px);
    width:var(--ignite-flame-w, 100%);
    height:var(--ignite-flame-h, 74px);
    border-radius:6px;
    pointer-events:none;
    z-index:22;
    background-image:url('${buildPublicUrl('/img/effects/ignite_torch_flame_sweep_spritesheet.webp')}');
    background-size:3200% 100%;
    background-repeat:no-repeat;
    background-position:0 0;
    mix-blend-mode:screen;
    transform-origin:50% 100%;
    filter:saturate(1.08) contrast(1.08) drop-shadow(0 0 8px rgba(255,162,40,.7));
    animation:
      igniteTorchFlameFrames .76s steps(31,end) both,
      igniteTorchFlameRise .76s linear both,
      igniteTorchFlameVisibility .76s ease-out both;
  }
  .ignite-torch-ember-layer{
    position:absolute;
    left:var(--ignite-ember-left, -34px);
    top:var(--ignite-ember-top, 0px);
    width:var(--ignite-ember-w, calc(100% + 68px));
    height:var(--ignite-ember-h, calc(var(--ignite-card-h, 160px) + 82px));
    border-radius:6px;
    pointer-events:none;
    z-index:23;
    background:
      radial-gradient(circle at 18% 74%,rgba(255,238,136,.88) 0 1.5px,transparent 3.5px),
      radial-gradient(circle at 34% 56%,rgba(255,172,54,.76) 0 2px,transparent 4.5px),
      radial-gradient(circle at 55% 38%,rgba(255,226,118,.7) 0 1.5px,transparent 4px),
      radial-gradient(circle at 77% 58%,rgba(255,86,20,.66) 0 2px,transparent 5px),
      radial-gradient(circle at 88% 30%,rgba(255,202,80,.58) 0 1.5px,transparent 4px);
    mix-blend-mode:screen;
    animation:igniteTorchEmbers .76s ease-out both;
  }
  @keyframes igniteTorchFlameFrames {
    0%{background-position:0% 0;}
    100%{background-position:100% 0;}
  }
  @keyframes igniteTorchFlameRise {
    0%,18%{transform:translate3d(0,0,0);}
    100%{transform:translate3d(0,var(--ignite-card-rise, -160px),0);}
  }
  @keyframes igniteTorchFlameVisibility {
    0%{opacity:0;}
    8%,84%{opacity:.98;}
    100%{opacity:0;}
  }
  @keyframes igniteTorchEmbers {
    0%{opacity:0;transform:translate3d(-18%,24px,0) scale(.72);}
    18%{opacity:0;transform:translate3d(-18%,24px,0) scale(.72);}
    32%{opacity:.92;}
    62%{opacity:.72;transform:translate3d(4%,var(--ignite-ember-mid-rise, -50px),0) scale(1.04);}
    100%{opacity:0;transform:translate3d(18%,var(--ignite-ember-rise, -120px),0) scale(1.2);}
  }
  @keyframes surveyMascotEnter {
    0% { opacity:0; transform:translateX(135%) translateY(16px) rotate(-5deg); }
    72% { opacity:1; transform:translateX(-8px) translateY(0) rotate(2deg); }
    100% { opacity:1; transform:translateX(0) translateY(0) rotate(0deg); }
  }
  @keyframes surveyMascotFloat {
    0%,100% { transform:translateY(0); }
    50% { transform:translateY(-5px); }
  }
  .surveyMascot {
    position:fixed;
    right:16px;
    bottom:16px;
    z-index:4;
    display:flex;
    align-items:flex-end;
    gap:10px;
    border:0;
    background:transparent;
    padding:0;
    cursor:pointer;
    color:#e8c87a;
    font-family:'IM Fell English','Georgia',serif;
    opacity:0;
    transform:translateX(135%) translateY(16px);
    animation:surveyMascotEnter .55s cubic-bezier(.2,.9,.2,1.1) 1s forwards;
  }
  .surveyMascot:hover .surveyMascotBody { filter:drop-shadow(0 0 16px #d8b86899) brightness(1.08); }
  .surveyMascotBubble {
    max-width:170px;
    margin-bottom:18px;
    padding:9px 11px;
    border:1.5px solid #7a5720;
    border-radius:8px;
    background:linear-gradient(180deg,#211407,#120a04);
    color:#e8c87a;
    font-size:13px;
    line-height:1.35;
    letter-spacing:.5px;
    box-shadow:0 6px 18px #00000088,0 0 16px #c8a96e22 inset;
    text-align:left;
  }
  .surveyMascotBody {
    position:relative;
    width:76px;
    height:96px;
    border-radius:36px 36px 20px 20px;
    background:linear-gradient(160deg,#4b2748 0%,#25102f 52%,#0f0718 100%);
    border:2px solid #8a6228;
    box-shadow:0 10px 24px #000000aa,0 0 18px #9060cc55 inset;
    animation:surveyMascotFloat 2.4s ease-in-out 1.65s infinite;
  }
  .surveyMascotFace {
    position:absolute;
    left:16px;
    top:18px;
    width:44px;
    height:38px;
    border-radius:50% 50% 45% 45%;
    background:#d8b868;
    box-shadow:0 0 12px #f0d89055;
  }
  .surveyMascotEye {
    position:absolute;
    top:13px;
    width:5px;
    height:7px;
    border-radius:50%;
    background:#160b10;
  }
  .surveyMascotEyeLeft { left:12px; }
  .surveyMascotEyeRight { right:12px; }
  .surveyMascotSmile {
    position:absolute;
    left:15px;
    top:23px;
    width:14px;
    height:7px;
    border-bottom:2px solid #160b10;
    border-radius:0 0 12px 12px;
  }
  .surveyMascotBook {
    position:absolute;
    left:15px;
    bottom:15px;
    width:46px;
    height:25px;
    border-radius:4px;
    background:linear-gradient(90deg,#6a1f1f 0 48%,#3a1218 49% 51%,#7a2720 52% 100%);
    border:1px solid #c8a96e;
    box-shadow:0 0 10px #c8a96e44;
  }
  @media (max-width:580px){
    .surveyMascot { right:10px; bottom:10px; transform:scale(.88) translateX(135%); transform-origin:right bottom; }
    .surveyMascotBubble { max-width:138px; font-size:12px; }
    .surveyMascotBody { width:66px; height:86px; }
  }
  ${DAMAGE_LINK_ANIMATION_STYLES}
  ${EARTHQUAKE_ANIMATION_STYLES}
  ${MOVE_ANIMATION_STYLES}
  ${GOD_POWER_ANIMATION_STYLES}
  ${GOD_HIGHLIGHT_ANIMATION_STYLES}
  ${SKILL_ANIMATION_STYLES}
  ${AREA_CARD_ANIMATION_STYLES}
  ${DAMAGE_ANIMATION_STYLES}
  ${APOPHIS_ANIMATION_STYLES}
  ${SNAKE_TRAP_ANIMATION_STYLES}
  ${ENDLESS_CORRIDOR_ANIMATION_STYLES}
  /* Card flip animation */
  @keyframes cardRise {
    0%   { transform:translateY(90px); opacity:0; }
    15%  { opacity:1; }
    75%  { transform:translateY(-4px); }
    100% { transform:translateY(0); opacity:1; }
  }
  @keyframes cardFlip {
    0%   { transform:rotateY(0deg); }
    25%  { transform:rotateY(480deg); }
    55%  { transform:rotateY(840deg); }
    80%  { transform:rotateY(1020deg); }
    100% { transform:rotateY(1080deg); }
  }
  @keyframes burstPulse {
    0%   { transform:scale(0.2); opacity:0; }
    30%  { opacity:1; }
    70%  { transform:scale(1.6); opacity:0.8; }
    100% { transform:scale(2.2); opacity:0; }
  }

  /* animPopInner — scale only (no translate), safe for flex-centered children */
  @keyframes animPopInner { 0%{transform:scale(0.5);opacity:0} 60%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }

  /* Benign sparkle particles */
  @keyframes particleRise { 0%{opacity:0;transform:translateY(0) scale(0.4)} 30%{opacity:0.9;} 100%{opacity:0;transform:translateY(-140px) scale(1.4)} }
  @keyframes blindFishScotomaDrift {
    0% { transform:translate3d(-2%, -1%, 0) scale(1.02) rotate(-1deg); opacity:0.58; }
    100% { transform:translate3d(3%, 2%, 0) scale(1.09) rotate(1.5deg); opacity:0.88; }
  }
  @keyframes blindFishScotomaPulse {
    0% { transform:scale(1.02, 0.98); opacity:0.78; }
    100% { transform:scale(0.96, 1.05) translate3d(1%, -1%, 0); opacity:0.96; }
  }

  /* ── SMOKE SOULS: S-curve sway + widen as they rise ──
     translateX oscillates: 0→+12→-14→+8→0  (S-shape)
     scaleX grows (smoke disperses), translateY climbs, opacity fades */
  @keyframes smokeRise0 {
    0%  {opacity:0; transform:translateY(0)    translateX(0px)  scaleX(0.20) scaleY(0.3)}
    8%  {opacity:0.88;}
    22% {          transform:translateY(-190px) translateX(12px) scaleX(0.45) scaleY(0.72)}
    45% {          transform:translateY(-390px) translateX(-14px)scaleX(0.78) scaleY(0.90)}
    68% {opacity:0.55; transform:translateY(-570px) translateX(9px) scaleX(1.05) scaleY(1.0)}
    100%{opacity:0; transform:translateY(-800px) translateX(0px)  scaleX(1.60) scaleY(1.0)}
  }
  @keyframes smokeRise1 {
    0%  {opacity:0; transform:translateY(0)    translateX(0px)  scaleX(0.22) scaleY(0.28)}
    9%  {opacity:0.85;}
    24% {          transform:translateY(-210px) translateX(-13px)scaleX(0.50) scaleY(0.75)}
    48% {          transform:translateY(-420px) translateX(15px) scaleX(0.82) scaleY(0.92)}
    70% {opacity:0.52; transform:translateY(-605px) translateX(-8px)scaleX(1.10) scaleY(1.0)}
    100%{opacity:0; transform:translateY(-840px) translateX(0px)  scaleX(1.65) scaleY(1.0)}
  }
  @keyframes smokeRise2 {
    0%  {opacity:0; transform:translateY(0)    translateX(0px)  scaleX(0.18) scaleY(0.32)}
    7%  {opacity:0.90;}
    20% {          transform:translateY(-175px) translateX(14px) scaleX(0.42) scaleY(0.68)}
    44% {          transform:translateY(-370px) translateX(-12px)scaleX(0.74) scaleY(0.88)}
    66% {opacity:0.58; transform:translateY(-545px) translateX(7px) scaleX(0.98) scaleY(1.0)}
    100%{opacity:0; transform:translateY(-770px) translateX(0px)  scaleX(1.52) scaleY(1.0)}
  }
  @keyframes smokeRise3 {
    0%  {opacity:0; transform:translateY(0)    translateX(0px)  scaleX(0.25) scaleY(0.30)}
    10% {opacity:0.86;}
    26% {          transform:translateY(-215px) translateX(-15px)scaleX(0.54) scaleY(0.78)}
    50% {          transform:translateY(-445px) translateX(13px) scaleX(0.88) scaleY(0.93)}
    72% {opacity:0.50; transform:translateY(-635px) translateX(-9px)scaleX(1.12) scaleY(1.0)}
    100%{opacity:0; transform:translateY(-875px) translateX(0px)  scaleX(1.68) scaleY(1.0)}
  }
  @keyframes smokeRise4 {
    0%  {opacity:0; transform:translateY(0)    translateX(0px)  scaleX(0.21) scaleY(0.29)}
    8%  {opacity:0.87;}
    23% {          transform:translateY(-198px) translateX(11px) scaleX(0.48) scaleY(0.74)}
    46% {          transform:translateY(-400px) translateX(-13px)scaleX(0.80) scaleY(0.91)}
    69% {opacity:0.54; transform:translateY(-585px) translateX(8px) scaleX(1.06) scaleY(1.0)}
    100%{opacity:0; transform:translateY(-825px) translateX(0px)  scaleX(1.58) scaleY(1.0)}
  }

  /* Ghost faces: ride up with the smoke, appear at mid-point, vanish near top */
  /* Each tracks the same translateX S-wave as its smoke column */
  @keyframes ghostFace0 {
    0%  {opacity:0; transform:translateY(0)    translateX(0px)}
    10% {opacity:0;}
    32% {opacity:0; transform:translateY(-350px) translateX(-14px)}
    50% {opacity:0.70; transform:translateY(-540px) translateX(9px)}
    72% {opacity:0.55; transform:translateY(-680px) translateX(-5px)}
    100%{opacity:0; transform:translateY(-800px) translateX(0px)}
  }
  @keyframes ghostFace1 {
    0%  {opacity:0; transform:translateY(0)    translateX(0px)}
    12% {opacity:0;}
    35% {opacity:0; transform:translateY(-375px) translateX(15px)}
    52% {opacity:0.68; transform:translateY(-560px) translateX(-8px)}
    74% {opacity:0.52; transform:translateY(-700px) translateX(5px)}
    100%{opacity:0; transform:translateY(-840px) translateX(0px)}
  }
  @keyframes ghostFace2 {
    0%  {opacity:0; transform:translateY(0)    translateX(0px)}
    9%  {opacity:0;}
    30% {opacity:0; transform:translateY(-320px) translateX(-12px)}
    48% {opacity:0.72; transform:translateY(-510px) translateX(7px)}
    70% {opacity:0.56; transform:translateY(-660px) translateX(-4px)}
    100%{opacity:0; transform:translateY(-770px) translateX(0px)}
  }
  @keyframes ghostFace3 {
    0%  {opacity:0; transform:translateY(0)    translateX(0px)}
    13% {opacity:0;}
    36% {opacity:0; transform:translateY(-390px) translateX(13px)}
    54% {opacity:0.66; transform:translateY(-575px) translateX(-9px)}
    76% {opacity:0.50; transform:translateY(-725px) translateX(6px)}
    100%{opacity:0; transform:translateY(-875px) translateX(0px)}
  }
  @keyframes ghostFace4 {
    0%  {opacity:0; transform:translateY(0)    translateX(0px)}
    11% {opacity:0;}
    33% {opacity:0; transform:translateY(-355px) translateX(-11px)}
    51% {opacity:0.69; transform:translateY(-550px) translateX(8px)}
    73% {opacity:0.53; transform:translateY(-690px) translateX(-5px)}
    100%{opacity:0; transform:translateY(-825px) translateX(0px)}
  }

  /* ── FLOWER BLOOM — staggered scale+opacity per flower ── */
  @keyframes flowerBloom {
    0%   {opacity:0;   transform:scale(0) rotate(0deg)}
    40%  {opacity:1;   transform:scale(1.12) rotate(6deg)}
    65%  {opacity:0.98;transform:scale(0.96) rotate(-2deg)}
    80%  {opacity:0.97;transform:scale(1.04) rotate(1deg)}
    100% {opacity:0.90;transform:scale(1.0)  rotate(0deg)}
  }
  @keyframes flowerFade {
    0%  {opacity:0.90}
    60% {opacity:0.85}
    100%{opacity:0}
  }

  @keyframes tentacleEmerge {
    0%   {transform:translate(-50%, 0) scaleY(0); opacity:0}
    100% {transform:translate(-50%, 0) scaleY(1); opacity:1}
  }
  @keyframes pulse {
    0%,100% {opacity:0.6; transform:scale(1)}
    50%     {opacity:1;   transform:scale(1.1)}
  }

  /* Turn indicator */
  @keyframes turnIndicatorFade {
    from{opacity:0;transform:translateX(-50%) translateY(-8px)}
    to  {opacity:1;transform:translateX(-50%) translateY(0)}
  }
  @keyframes yourTurnFade {
    0%  {opacity:0; transform:scale(0.88)}
    18% {opacity:1; transform:scale(1.04)}
    38% {opacity:1; transform:scale(1.0)}
    75% {opacity:1; transform:scale(1.0)}
    100%{opacity:0; transform:scale(1.05)}
  }
  @keyframes treasureAssemble {
    0%   {opacity:0; transform:translate(var(--ox),var(--oy)) scale(0.55) rotate(-8deg)}
    60%  {opacity:1; transform:translate(0,0) scale(1.06) rotate(1deg)}
    100% {opacity:1; transform:translate(0,0) scale(1) rotate(0deg)}
  }
  @keyframes treasureScatter {
    0%,100% {opacity:0; transform:translate(var(--ox),var(--oy)) scale(0.5)}
  }
  @keyframes turnIndicatorPulse {
    0%,100%{opacity:0.55;filter:brightness(0.85)}
    50%    {opacity:1;   filter:brightness(1.35)}
  }

  /* God Resurrection — blood drip text effect */
  .blood-drip-text {
    position: relative;
  }
  .blood-drop {
    position: absolute;
    bottom: -8px;
    width: 6px;
    height: 12px;
    background: linear-gradient(180deg, #8a1a1a 0%, #c01030 50%, #600000 100%);
    border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
    opacity: 0;
    animation: bloodDripFall 2s ease-in infinite;
    box-shadow: 0 0 8px #c0103088;
  }
  @keyframes bloodDripFall {
    0%   { opacity: 0; transform: translateY(0) scale(0.5); }
    10%  { opacity: 1; transform: translateY(5px) scale(1); }
    60%  { opacity: 0.8; transform: translateY(35px) scale(0.9); }
    90%  { opacity: 0.3; transform: translateY(55px) scale(0.6); }
    100% { opacity: 0; transform: translateY(70px) scale(0.3); }
  }
  @keyframes zhuLitCardPop {
    0% { opacity: 0.25; transform: translateX(18px) rotate(0deg) scale(0.98); filter: brightness(0.8); }
    64% { opacity: 1; transform: translateX(-5px) rotate(calc(var(--zhu-rot) - 3deg)) scale(1.02); filter: brightness(1.35); }
    100% { opacity: 1; transform: translateX(0) rotate(var(--zhu-rot)) scale(1); filter: brightness(1); }
  }
`;
