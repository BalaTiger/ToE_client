export const APOPHIS_ANIMATION_STYLES = `
  @keyframes apophisEclipseDarken {
    0%{opacity:0;background:rgba(0,0,0,0)}
    32%{opacity:1;background:radial-gradient(circle at 50% 58px, rgba(70,16,8,0.24) 0%, rgba(8,4,10,0.72) 42%, rgba(0,0,0,0.94) 100%)}
    100%{opacity:1;background:radial-gradient(circle at 50% 58px, rgba(18,4,5,0.50) 0%, rgba(4,2,8,0.88) 42%, rgba(0,0,0,0.98) 100%)}
  }
  @keyframes apophisEclipseFadeOut { from{opacity:1} to{opacity:0} }
  @keyframes apophisLightRayFade {
    0%{opacity:.78;transform:rotate(var(--ray-angle, 0deg)) scaleY(.72)}
    28%{opacity:.62}
    58%{opacity:.22}
    100%{opacity:0;transform:rotate(var(--ray-angle, 0deg)) scaleY(.96)}
  }
  @keyframes apophisMoonCover {
    0%{transform:translateX(-155px) scale(.98);opacity:.94}
    72%{transform:translateX(0) scale(1);opacity:1}
    100%{transform:translateX(0) scale(1);opacity:1}
  }
  @keyframes apophisDiamondRing {
    0%,55%{opacity:0;transform:scale(.98) rotate(0deg)}
    69%{opacity:.34;transform:scale(1.01) rotate(1deg)}
    76%{opacity:.95;transform:scale(1.02) rotate(1deg)}
    88%{opacity:.28;transform:scale(1) rotate(0deg)}
    100%{opacity:0;transform:scale(.99) rotate(0deg)}
  }
  @keyframes apophisDiamondSpark {
    0%,58%{opacity:0;transform:scale(.2)}
    70%{opacity:.72;transform:scale(.86)}
    76%{opacity:1;transform:scale(1.28)}
    84%{opacity:.46;transform:scale(.72)}
    100%{opacity:0;transform:scale(.3)}
  }
  @keyframes apophisCorona {
    0%{opacity:0;transform:scale(.82)}
    45%{opacity:.25;transform:scale(.96)}
    72%{opacity:1;transform:scale(1.04)}
    100%{opacity:.82;transform:scale(1)}
  }
`;
