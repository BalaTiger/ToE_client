export const GOD_HIGHLIGHT_ANIMATION_STYLES = `
  @keyframes toeGodHighlightBurstLayer {
    0% { opacity:0; transform:translate3d(0,0,0) scale(0.84); }
    18% { opacity:calc(var(--toe-god-highlight-opacity) * var(--toe-god-highlight-intensity)); }
    58% { opacity:calc(var(--toe-god-highlight-opacity) * 0.62 * var(--toe-god-highlight-intensity)); transform:translate3d(0,0,0) scale(var(--toe-god-highlight-scale)); }
    100% { opacity:0; transform:translate3d(0,0,0) scale(calc(var(--toe-god-highlight-scale) * 1.22)); }
  }
  @keyframes toeGodHighlightBurstCore {
    0% { opacity:0; transform:scale(0.4); }
    24% { opacity:calc(0.18 * var(--toe-god-highlight-intensity)); }
    100% { opacity:0; transform:scale(2.18); }
  }
  .toe-god-highlight-blend { mix-blend-mode:screen; }
  @supports (mix-blend-mode:plus-lighter) {
    .toe-god-highlight-blend { mix-blend-mode:plus-lighter; }
  }
  .toe-god-highlight-soft-edge {
    -webkit-mask-image:radial-gradient(ellipse at center,#000 0%,#000 58%,rgba(0,0,0,0.72) 70%,transparent 88%);
    mask-image:radial-gradient(ellipse at center,#000 0%,#000 58%,rgba(0,0,0,0.72) 70%,transparent 88%);
  }
`;
