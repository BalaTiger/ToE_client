import { CARD_FLIGHT_POSE } from './cardSizing';

export const MOVE_ANIMATION_STYLES = `
  @keyframes cardDrawTurn {
    from { transform: rotateX(-180deg); }
    to { transform: rotateX(-42deg); }
  }
  @keyframes cardTravelToPlayer {
    0%   {left:var(--src-x);top:var(--src-y);transform:${CARD_FLIGHT_POSE.from};opacity:1}
    30%  {opacity:1}
    55%  {left:calc(var(--src-x) * .45 + var(--dest-x) * .55);top:calc(var(--src-y) * .45 + var(--dest-y) * .55 - 20px);transform:${CARD_FLIGHT_POSE.mid};opacity:1}
    100% {left:var(--dest-x);top:var(--dest-y);transform:${CARD_FLIGHT_POSE.to};opacity:1}
  }
  @keyframes discardCardFlyCustom {
    0%   {transform:translate(-50%, -50%) ${CARD_FLIGHT_POSE.from};opacity:1}
    55%  {transform:translate(calc(-50% + var(--tx) * 0.55), calc(-50% + var(--ty) * 0.55 - 18px)) ${CARD_FLIGHT_POSE.mid};opacity:1}
    100% {transform:translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) ${CARD_FLIGHT_POSE.to};opacity:0.7}
  }
  @keyframes discardBgFade {
    0%   {opacity:0}
    20%  {opacity:1}
    80%  {opacity:0.8}
    100% {opacity:0}
  }
  @keyframes cardTransferFly {
    0%   { transform: translate(0,0) ${CARD_FLIGHT_POSE.from}; opacity:1 }
    55%  { transform: translate(calc(var(--tx)*0.55), calc(var(--ty)*0.55 - 16px)) ${CARD_FLIGHT_POSE.mid}; opacity:1 }
    88%  { opacity:1 }
    100% { transform: translate(var(--tx), var(--ty)) ${CARD_FLIGHT_POSE.to}; opacity:0 }
  }
  @keyframes huntRevealCardFly {
    0%   { transform: translate(0,0) ${CARD_FLIGHT_POSE.from}; opacity:0; }
    16%  { opacity:1; }
    32%  { transform: translate(calc(var(--tx) * .55),calc(var(--ty) * .55 - 18px)) ${CARD_FLIGHT_POSE.mid}; opacity:1; }
    58%, 100% { transform: translate(var(--tx),var(--ty)) ${CARD_FLIGHT_POSE.to}; opacity:1; }
  }
  @keyframes moveOverlayBgFade {
    0% { opacity: 0; }
    18% { opacity: 1; }
    100% { opacity: 0; }
  }
  @keyframes buryToDeckPath {
    0% { opacity: 1; transform: translate(0,0) ${CARD_FLIGHT_POSE.from}; }
    55% { opacity: 1; transform: translate(calc(var(--tx) * 0.55),calc(var(--ty) * 0.55 - 26px)) ${CARD_FLIGHT_POSE.mid}; }
    90% { opacity: 1; }
    100% { opacity: 0; transform: translate(var(--tx),var(--ty)) ${CARD_FLIGHT_POSE.to}; }
  }
  @keyframes buryToDeckDepth {
    0%, 56% { z-index: 6; }
    57%, 100% { z-index: 2; }
  }
  @keyframes buryToDeckOverlayDepth {
    0%, 56% { z-index: 992; }
    57%, 100% { z-index: 1; }
  }
`;
