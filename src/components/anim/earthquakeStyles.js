import { CARD_FLIGHT_POSE } from './cardSizing';

export const EARTHQUAKE_ANIMATION_STYLES = `
  @keyframes earthquakeBlackout {
    0%, 2%, 6%, 10%, 39%, 45%, 100% {opacity:0}
    4%, 8% {opacity:0.86; background:#000}
    42% {opacity:0.56; background:#000}
  }
  @keyframes earthquakeWhiteFlash {
    0%, 18%, 24%, 66%, 72%, 100% {opacity:0}
    21% {opacity:0.86; background:#fff}
    69% {opacity:0.52; background:#fff}
  }
  @keyframes earthquakePebble {
    0% {opacity:0; transform:translate(0,0) rotate(0deg) scale(0.72)}
    8% {opacity:0.95}
    34% {opacity:0.95; transform:translate(var(--pebble-mid-dx),calc(-1 * var(--pebble-lift))) rotate(calc(var(--pebble-rot) * 0.36)) scale(1)}
    100% {opacity:0; transform:translate(var(--pebble-dx),var(--pebble-drop)) rotate(var(--pebble-rot)) scale(0.88)}
  }
  @keyframes earthquakeDiscardFly {
    0% {opacity:0; transform:translate(0,0) ${CARD_FLIGHT_POSE.from}}
    8% {opacity:1}
    56% {opacity:1; transform:translate(var(--mid-tx),var(--mid-ty)) ${CARD_FLIGHT_POSE.mid}}
    100% {opacity:0; transform:translate(var(--tx),var(--ty)) ${CARD_FLIGHT_POSE.to}}
  }
`;
