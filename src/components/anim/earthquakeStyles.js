export const EARTHQUAKE_ANIMATION_STYLES = `
  @keyframes earthquakeSceneShake {
    0%, 100% {transform:translateX(0)}
    6.67% {transform:translateX(-5px)}
    13.33% {transform:translateX(5px)}
    20% {transform:translateX(0)}
    26.67% {transform:translateX(4px)}
    33.33% {transform:translateX(-4px)}
    40% {transform:translateX(0)}
    46.67% {transform:translateX(-5px)}
    53.33% {transform:translateX(5px)}
    60% {transform:translateX(0)}
    66.67% {transform:translateX(4px)}
    73.33% {transform:translateX(-4px)}
    80% {transform:translateX(0)}
    86.67% {transform:translateX(-3px)}
    93.33% {transform:translateX(3px)}
  }
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
    0% {opacity:0; transform:translate(0,0) rotate(-4deg) scale(0.96)}
    8% {opacity:1}
    56% {opacity:1; transform:translate(var(--mid-tx),var(--mid-ty)) rotate(8deg) scale(1.04)}
    100% {opacity:0; transform:translate(var(--tx),var(--ty)) rotate(16deg) scale(0.72)}
  }
`;
