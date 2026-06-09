export const DAMAGE_ANIMATION_STYLES = `
  @keyframes sanMistMorph {
    0%   {border-radius:58% 42% 65% 35% / 48% 55% 45% 52%}
    18%  {border-radius:42% 58% 38% 62% / 62% 40% 60% 38%}
    35%  {border-radius:70% 30% 52% 48% / 38% 64% 36% 62%}
    52%  {border-radius:36% 64% 70% 30% / 55% 45% 58% 42%}
    68%  {border-radius:55% 45% 40% 60% / 42% 60% 40% 58%}
    85%  {border-radius:48% 52% 58% 42% / 65% 35% 62% 38%}
    100% {border-radius:52% 48% 45% 55% / 50% 55% 45% 50%}
  }
  @keyframes sanMistBolt {
    0%   {transform:translate(0,0) scaleX(1.0);                opacity:1}
    78%  {transform:translate(var(--tx),var(--ty)) scaleX(2.2);opacity:1}
    100% {transform:translate(var(--tx),var(--ty)) scaleX(0.3);opacity:0}
  }
  @keyframes sanMistImpact {
    0%   {opacity:0;   transform:scale(0.06)}
    32%  {opacity:1;   transform:scale(1.28)}
    65%  {opacity:0.85;transform:scale(1.00)}
    100% {opacity:0;   transform:scale(1.65)}
  }
  @keyframes sanMistShockwave {
    0%   {opacity:0.95; transform:scale(1)}
    55%  {opacity:0.60; transform:scale(6)}
    100% {opacity:0;    transform:scale(12)}
  }
  @keyframes healCross {
    0%   {opacity:0;   transform:translateY(0)   scale(0.4)}
    20%  {opacity:1;   transform:translateY(-4px) scale(1.1)}
    70%  {opacity:0.8; transform:translateY(-10px) scale(1.0)}
    100% {opacity:0;   transform:translateY(-18px) scale(0.7)}
  }
  @keyframes knifeStrike {
    0%   {transform:translate(0,0) rotate(-45deg); opacity:1;}
    70%  {transform:translate(-60px,60px) rotate(-45deg) scale(1.15); opacity:1;}
    80%  {transform:translate(-64px,64px) rotate(-45deg) scale(1.1); opacity:1;}
    100% {transform:translate(-64px,64px) rotate(-45deg) scale(0.9); opacity:0;}
  }
  @keyframes knifeStrikeGlobal {
    0%   {transform:translate(0,0) rotate(var(--angle)); opacity:1;}
    70%  {transform:translate(var(--tx),var(--ty)) rotate(var(--angle)) scale(1.15); opacity:1;}
    80%  {transform:translate(var(--tx),var(--ty)) rotate(var(--angle)) scale(1.1); opacity:1;}
    100% {transform:translate(var(--tx),var(--ty)) rotate(var(--angle)) scale(0.9); opacity:0;}
  }
  @keyframes hitFlash { 0%{opacity:0} 20%{opacity:1} 100%{opacity:0} }
  @keyframes hitFlashGlobal { 0%{opacity:0} 20%{opacity:1} 100%{opacity:0} }
  @keyframes bloodDrop {
    0%   {opacity:0; transform:translateY(-12px) scale(0);}
    25%  {opacity:1; transform:translateY(0) scale(1);}
    70%  {opacity:0.8;}
    100% {opacity:0; transform:translateY(16px) scale(0.6);}
  }
  @keyframes screenShakeAnim {
    0%,100%{transform:translateX(0)}
    15%{transform:translateX(-6px)}
    30%{transform:translateX(8px)}
    50%{transform:translateX(-5px)}
    70%{transform:translateX(6px)}
    85%{transform:translateX(-3px)}
  }
  @keyframes deathShakeAnim {
    0%,100%{transform:translate(0,0)}
    4%  {transform:translate(-14px,-10px)}
    8%  {transform:translate(18px,12px)}
    13% {transform:translate(-12px,-16px)}
    18% {transform:translate(20px,8px)}
    24% {transform:translate(-16px,-10px)}
    30% {transform:translate(14px,14px)}
    38% {transform:translate(-10px,-8px)}
    46% {transform:translate(12px,6px)}
    55% {transform:translate(-8px,-4px)}
    65% {transform:translate(6px,8px)}
    75% {transform:translate(-5px,-3px)}
    85% {transform:translate(4px,4px)}
    93% {transform:translate(-2px,-2px)}
  }
  @keyframes guillotineFall {
    0%   {transform:translateY(0)}
    100% {transform:translateY(var(--blade-dy))}
  }
  @keyframes guillotineFlash {
    0%   {opacity:1;transform:scale(1.08)}
    100% {opacity:0;transform:scale(0.96)}
  }
  @keyframes guillotineBloodFlash {
    0%   {opacity:1}
    60%  {opacity:0.6}
    100% {opacity:0}
  }
  @keyframes deathScreenShake {
    0%   {transform:translate(0,0) rotate(0deg)}
    8%   {transform:translate(-6px,-4px) rotate(-0.4deg)}
    16%  {transform:translate(7px,5px) rotate(0.5deg)}
    24%  {transform:translate(-8px,3px) rotate(-0.6deg)}
    32%  {transform:translate(6px,-6px) rotate(0.4deg)}
    40%  {transform:translate(-5px,4px) rotate(-0.3deg)}
    50%  {transform:translate(4px,-3px) rotate(0.25deg)}
    60%  {transform:translate(-3px,2px) rotate(-0.15deg)}
    75%  {transform:translate(2px,-1px) rotate(0.1deg)}
    100% {transform:translate(0,0) rotate(0deg)}
  }
  @keyframes deathFragmentFly {
    0%   {transform:translate(0,0) rotate(0deg) scale(1);opacity:1}
    18%  {opacity:1}
    100% {transform:translate(var(--stx),var(--sty)) rotate(var(--srot)) scale(0.22);opacity:0}
  }
  @keyframes deathSparkFly {
    0%   {transform:translate(0,0) scale(0.7);opacity:0}
    15%  {transform:translate(calc(var(--stx) * 0.18),calc(var(--sty) * 0.18)) scale(1);opacity:1}
    100% {transform:translate(var(--stx),var(--sty)) scale(0.2);opacity:0}
  }
  @keyframes deathShockRing {
    0%   {transform:scale(0.16);opacity:0.95}
    55%  {opacity:0.64}
    100% {transform:scale(7.4);opacity:0}
  }
  @keyframes deathDustBloom {
    0%   {transform:scale(0.72);opacity:0.9}
    60%  {opacity:0.42}
    100% {transform:scale(1.34);opacity:0}
  }
  @keyframes panelRupture {
    0%   {opacity:1;transform:scale(1)}
    18%  {opacity:1;transform:scale(1.04) rotate(-0.6deg)}
    45%  {opacity:0.88;transform:scale(0.98) rotate(0.9deg)}
    100% {opacity:0;transform:scale(0.86) rotate(-1.4deg)}
  }
  @keyframes guillotineVig {
    0%   {background:rgba(0,0,0,0)}
    20%  {background:rgba(0,0,0,0.45)}
    50%  {background:rgba(10,0,0,0.55)}
    100% {background:rgba(0,0,0,0)}
  }
  @keyframes sliceEffect {
    0%{transform:rotate(calc(var(--slice-angle,30deg) + var(--cut-tilt,0deg) * 0.35)) translateX(-100%)}
    50%{transform:rotate(calc(var(--slice-angle,30deg) + var(--cut-tilt,0deg) * 0.35)) translateX(0%)}
    100%{transform:rotate(calc(var(--slice-angle,30deg) + var(--cut-tilt,0deg) * 0.35)) translateX(100%)}
  }
  @keyframes sliceFlash {
    0%{opacity:0}
    50%{opacity:1}
    100%{opacity:0}
  }
  @keyframes bloodSpread {
    0%{opacity:0; transform:scale(0.8)}
    50%{opacity:1; transform:scale(1.2)}
    100%{opacity:0; transform:scale(1.5)}
  }
  @keyframes slideUp {
    0%{transform:rotate(0deg) translateY(0);opacity:1;filter:brightness(1)}
    28%{transform:rotate(calc(var(--pivot-rot) * 0.4)) translateY(-10px);opacity:0.96;filter:brightness(1.12)}
    100%{transform:rotate(var(--pivot-rot)) translateY(-30px);opacity:0;filter:brightness(0.55)}
  }
  @keyframes slideDown {
    0%{transform:rotate(0deg) translateY(0);opacity:1;filter:brightness(1)}
    24%{transform:rotate(calc(var(--pivot-rot) * 0.4)) translateY(10px);opacity:0.97;filter:brightness(1.14)}
    100%{transform:rotate(var(--pivot-rot)) translateY(30px);opacity:0;filter:brightness(0.55)}
  }
`;
