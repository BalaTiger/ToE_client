export const DAMAGE_LINK_ANIMATION_STYLES = `
  @keyframes chainMove    { 0%{stroke-dashoffset: 20} 100%{stroke-dashoffset: 0} }
  @keyframes chainLinkDrift { 0%{transform:rotate(-3deg)} 100%{transform:rotate(3deg)} }
  @keyframes chainBindGrow {
    0%{opacity:0;transform:scale(0.35) rotate(-16deg);filter:brightness(0.7)}
    72%{opacity:1;transform:scale(1.08) rotate(4deg);filter:brightness(1.35)}
    100%{opacity:1;transform:scale(1) rotate(0deg);filter:brightness(1)}
  }
  @keyframes chainPathShadowIn {
    0%{opacity:0}
    35%{opacity:0.25}
    100%{opacity:1}
  }
  @keyframes chainPathEstablish {
    0%{opacity:0;stroke-dashoffset:100}
    12%{opacity:1}
    78%{stroke-dashoffset:0}
    100%{opacity:1;stroke-dashoffset:0}
  }
  @keyframes chainLinkArrive {
    0%{opacity:0;transform:scale(0.2) rotate(-24deg);filter:brightness(0.8)}
    55%{opacity:1;transform:scale(1.22) rotate(6deg);filter:brightness(1.45)}
    100%{opacity:1;transform:scale(1) rotate(0deg);filter:brightness(1)}
  }
  @keyframes chainBreakFade { 0%{opacity:1} 35%{opacity:1} 100%{opacity:0} }
  @keyframes chainExpireFade { 0%{opacity:1} 100%{opacity:0} }
  @keyframes chainMainSnap { 0%{transform:scaleX(1)} 35%{transform:scaleX(0.88)} 100%{transform:scaleX(0.18);opacity:0} }
  @keyframes chainBindSnap { 0%{transform:translateX(0)} 20%{transform:translateX(-2px)} 40%{transform:translateX(2px)} 70%{transform:translateX(-1px)} 100%{transform:translateX(0);opacity:0} }
`;
