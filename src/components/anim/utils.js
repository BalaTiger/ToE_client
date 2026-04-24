export function getInspectionCardDesc(card){
  switch(card?.effect){
    case 'adjacentDamageHP': return '相邻角色失去 1 HP';
    case 'selfDamageHP': return '失去 1 HP';
    case 'disableRest': return '下一回合禁用“休息”';
    case 'nothing': return '什么也不做';
    case 'flip': return '翻面';
    case 'discardRandom': return '随机弃一张牌';
    case 'disableSkill': return '下一回合禁用技能';
    case 'handLimitDecrease': return '下一回合手牌上限 -1';
    case 'healSAN': return '恢复 1 SAN';
    case 'drawCard': return '从牌堆摸一张牌';
    case 'sealLoosening': return '连续翻出两次时邪神复活';
    case 'houndsOfTindalos': return '首个超时超过 15 秒的回合失去 4 HP';
    default: return '';
  }
}

// Feather path helper — BLADE shape.
// Leading edge (px+) runs nearly straight to the tip.
// Trailing edge (px-) tapers inward from the 50% midpoint so the second half
// narrows like a blade.  Tip: small rounded cap (radius = w*0.22) so no sharp point.
export function fp(x0,y0,x1,y1,w){
  w=w*2.8;                                      // base width scale
  const dx=x1-x0,dy=y1-y0,len=Math.sqrt(dx*dx+dy*dy);
  const px=-dy/len,py=dx/len;                   // perpendicular (leading-edge direction)

  // ── Root edge points ────────────────────────────────────────
  const rlx=x0+px*w*0.5,  rly=y0+py*w*0.5;     // leading-edge root
  const rrx=x0-px*w*0.5,  rry=y0-py*w*0.5;     // trailing-edge root

  // ── Leading edge: gentle outward bulge at 35%, stays near ±w/2 all the way ─
  const lbx=x0+dx*0.35+px*w*0.56, lby=y0+dy*0.35+py*w*0.56;  // leading belly

  // ── Trailing edge: full width to 50%, then curves inward toward shaft ────────
  const rbx=x0+dx*0.35-px*w*0.56, rby=y0+dy*0.35-py*w*0.56;  // trailing belly (mirror)
  // Midpoint trailing — starts tapering here
  const rmx=x0+dx*0.50-px*w*0.50, rmy=y0+dy*0.50-py*w*0.50;
  // Shoulder: trailing edge has come close to shaft (w*0.08 offset = almost on axis)
  const rsx=x0+dx*0.82-px*w*0.08, rsy=y0+dy*0.82-py*w*0.08;

  // ── Leading edge pre-tip: still reasonably wide at shoulder ─────────────────
  const lsx=x0+dx*0.82+px*w*0.40, lsy=y0+dy*0.82+py*w*0.40;

  // ── Rounded tip cap ──────────────────────────────────────────────────────────
  // Cap radius: half of the remaining width at the shoulder (leading offset w*0.40)
  const cr=w*0.22;
  // Tip anchor: slightly beyond actual tip along shaft direction
  const tipx=x1+dx*0.04, tipy=y1+dy*0.04;
  // Left/right of cap
  const clx=tipx+px*cr, cly=tipy+py*cr;
  const crx=tipx-px*cr, cry=tipy-py*cr;

  return[
    // Start at leading-edge root
    `M${rlx.toFixed(1)},${rly.toFixed(1)}`,
    // Leading edge belly → shoulder (stays wide)
    `Q${lbx.toFixed(1)},${lby.toFixed(1)} ${lsx.toFixed(1)},${lsy.toFixed(1)}`,
    // Leading edge → left cap point
    `Q${(x1+px*w*0.32).toFixed(1)},${(y1+py*w*0.32).toFixed(1)} ${clx.toFixed(1)},${cly.toFixed(1)}`,
    // Rounded cap arc over tip
    `Q${(tipx+dx*0.08).toFixed(1)},${(tipy+dy*0.08).toFixed(1)} ${crx.toFixed(1)},${cry.toFixed(1)}`,
    // Trailing edge: cap → shoulder (already tapered in)
    `Q${(x1-px*w*0.06).toFixed(1)},${(y1-py*w*0.06).toFixed(1)} ${rsx.toFixed(1)},${rsy.toFixed(1)}`,
    // Trailing taper: shoulder → midpoint → belly → root
    `Q${rmx.toFixed(1)},${rmy.toFixed(1)} ${rbx.toFixed(1)},${rby.toFixed(1)}`,
    `Q${(x0+dx*0.12-px*w*0.50).toFixed(1)},${(y0+dy*0.12-py*w*0.50).toFixed(1)} ${rrx.toFixed(1)},${rry.toFixed(1)} Z`
  ].join(' ');
}

export function petalPath(n,r,variant){
  const paths=[];
  for(let i=0;i<n;i++){
    const a=(i/n)*Math.PI*2;
    const tip_r=r;
    const ctrl_r=r*0.62;
    const hw=variant===2?0.38:variant===1?0.44:0.50; // half-width angle
    const left_a=a-hw;const right_a=a+hw;
    const tx=Math.cos(a)*tip_r, ty=Math.sin(a)*tip_r;
    const c1x=Math.cos(left_a)*ctrl_r, c1y=Math.sin(left_a)*ctrl_r;
    const c2x=Math.cos(right_a)*ctrl_r, c2y=Math.sin(right_a)*ctrl_r;
    // Round petal: two cubics from origin → tip (via control points)
    paths.push(`M0,0 Q${c1x.toFixed(2)},${c1y.toFixed(2)} ${tx.toFixed(2)},${ty.toFixed(2)} Q${c2x.toFixed(2)},${c2y.toFixed(2)} 0,0`);
  }
  return paths;
}
