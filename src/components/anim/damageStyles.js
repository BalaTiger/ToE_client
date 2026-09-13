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
  @keyframes petrifySnapshotSettle {
    0%   {filter:brightness(0.92) contrast(1.08);transform:scale(1)}
    42%  {filter:brightness(1.02) contrast(1.18);transform:scale(1.012)}
    100% {filter:brightness(0.78) contrast(1.24) saturate(0.86);transform:scale(1)}
  }
  @keyframes petrifyDustBloom {
    0%,38% {opacity:0;transform:scale(0.9)}
    64%    {opacity:0.30;transform:scale(1.04)}
    100%   {opacity:0.18;transform:scale(1.18)}
  }
  .petrify-snapshot-panel {
    animation:petrifySnapshotSettle 2.35s ease-out forwards;
  }
  .petrify-snapshot-dust {
    position:absolute;
    inset:-10%;
    pointer-events:none;
    background:
      repeating-radial-gradient(circle at 30% 24%, rgba(190,198,178,0.18) 0 1px, transparent 1px 9px),
      repeating-radial-gradient(circle at 76% 68%, rgba(22,31,29,0.34) 0 1px, transparent 1px 11px);
    mix-blend-mode:multiply;
    animation:petrifyDustBloom 2.35s ease-out forwards;
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
  @keyframes sliceLineFade {
    0%,30%{opacity:1}
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
