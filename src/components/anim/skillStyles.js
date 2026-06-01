export const SKILL_ANIMATION_STYLES = `
  @keyframes swapBgFade {
    0%  {opacity:0} 15% {opacity:1} 75% {opacity:1} 100% {opacity:0}
  }
  @keyframes swapCupL {
    0%   {transform:translateX(0)}
    20%  {transform:translateX(60px)}
    45%  {transform:translateX(60px) translateY(-30px)}
    70%  {transform:translateX(-60px) translateY(-30px)}
    85%  {transform:translateX(-60px)}
    100% {transform:translateX(0)}
  }
  @keyframes swapCupR {
    0%   {transform:translateX(0)}
    20%  {transform:translateX(-60px)}
    45%  {transform:translateX(-60px) translateY(30px)}
    70%  {transform:translateX(60px) translateY(30px)}
    85%  {transform:translateX(60px)}
    100% {transform:translateX(0)}
  }
  @keyframes swapLabelPop {
    0% {opacity:0;transform:scale(0.5)} 40% {opacity:1;transform:scale(1.2)} 100% {opacity:1;transform:scale(1)}
  }
  @keyframes huntVigFade {
    0% {opacity:0} 18% {opacity:1} 80% {opacity:1} 100% {opacity:0}
  }
  @keyframes huntScopeMove {
    0%   {transform:translate(calc(var(--wobX,18px)),calc(var(--wobY,-22px)))}
    15%  {transform:translate(-16px, 20px)}
    30%  {transform:translate(12px, -14px)}
    50%  {transform:translate(-8px, 10px)}
    70%  {transform:translate(4px, -5px)}
    85%  {transform:translate(0px, 0px)}
    100% {transform:translate(0px, 0px)}
  }
  @keyframes huntDotPulse {
    0%  {transform:scale(1);opacity:1}
    50% {transform:scale(2.2);opacity:0.8}
    100%{transform:scale(1);opacity:1}
  }
  @keyframes bewitchEyePulse {
    0%  {transform:scale(1);opacity:1}
    50% {transform:scale(1.45);opacity:0.9;filter:drop-shadow(0 0 22px rgba(220,110,255,1)) drop-shadow(0 0 40px rgba(180,60,255,0.8))}
    100%{transform:scale(1);opacity:1}
  }
  @keyframes bewitchEyeGhost {
    0%  {transform:scale(1);   opacity:0}
    8%  {transform:scale(1.05);opacity:0.80}
    30% {transform:scale(1.8); opacity:0.55}
    100%{transform:scale(4.5); opacity:0}
  }
`;
