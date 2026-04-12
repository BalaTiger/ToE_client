import {
  FIXED_ZONE_EFFECTS_BY_FACE,
  ZONE_FACE_ORDER,
  LETTERS,
  NUMS,
  GOD_DEFS,
  ROLE_TREASURE,
  ROLE_HUNTER,
  ROLE_CULTIST,
} from "../constants/card";

export const shuffle=a=>{const b=[...a];for(let i=b.length-1;i>0;i--){const j=0|Math.random()*(i+1);[b[i],b[j]]=[b[j],b[i]];}return b;};
export const clamp=(v,lo=0,hi=10)=>Math.max(lo,Math.min(hi,v));
export const copyPlayers=ps=>ps.map(p=>({
  ...p,
  hand:[...p.hand],
  godZone:[...(p.godZone||[])],
  zoneCards:[...(p.zoneCards||[])],
  peekMemories:Object.fromEntries(Object.entries(p.peekMemories||{}).map(([k,v])=>[k,[...(v||[])]])),
  disableRestNextTurn:!!p.disableRestNextTurn,
  disableSkillNextTurn:!!p.disableSkillNextTurn,
  handLimitDecreaseNextTurn:p.handLimitDecreaseNextTurn||0
}));
export const isZoneCard=c=>!!c?.isZone;
export const isBlankZoneCard=c=>c?.type==='blankZone';

const FACE_POLARITY={positive:'positive',negativeSelf:'negative',negativeAll:'negative'};
const FACE_SCOPE={positive:'self',negativeSelf:'self',negativeAll:'all'};

export const getZoneCardPolarity=c=>c?.polarity||FACE_POLARITY[c?.face]||'neutral';
export const getZoneCardEffectScope=c=>c?.effectScope||FACE_SCOPE[c?.face]||'self';
export const isNegativeZoneCard=c=>!!c&&isZoneCard(c)&&getZoneCardPolarity(c)==='negative';
export const isPositiveZoneCard=c=>!!c&&isZoneCard(c)&&getZoneCardPolarity(c)==='positive';
export const isNeutralZoneCard=c=>!!c&&isZoneCard(c)&&getZoneCardPolarity(c)==='neutral';

export const cardLogText=(card,opts={})=>{
  if(!card)return '';
  const {alwaysShowName=false}=opts;
  const base=`[${card.key}]`;
  if(card.isGod){
    return `${base} ${card.name}${card.subtitle?` ${card.subtitle}`:''}`;
  }
  return alwaysShowName?`${base} ${card.name}`:base;
};

export const cardsHuntMatch=(a,b)=>{
  if(!a||!b)return false;
  if(isBlankZoneCard(a)||isBlankZoneCard(b))return true;
  return a.letter===b.letter||a.number===b.number;
};

export function mkDeck(){
  let id=0;
  const zoneCards=LETTERS.flatMap(L=>NUMS.flatMap(N=>{
    const key=`${L}${N}`;
    return ZONE_FACE_ORDER.map(face=>({
      id:id++,
      key,
      letter:L,
      number:N,
      face,
      isZone:true,
      ...FIXED_ZONE_EFFECTS_BY_FACE[key][face],
    }));
  }));
  const godCards=[
    ...Array(4).fill(0).map(()=>({id:id++,isGod:true,godKey:'NYA',key:'NYA',type:'god',needsTarget:false,...GOD_DEFS.NYA})),
    ...Array(4).fill(0).map(()=>({id:id++,isGod:true,godKey:'CTH',key:'CTH',type:'god',needsTarget:false,...GOD_DEFS.CTH})),
  ];
  return shuffle([...zoneCards,...godCards]);
}

export function mkRoles(N=5, isSinglePlayer=false) {
  if (N < 2) throw new Error('游戏人数不能少于2人');
  if (N === 2) {
    const baseRoles = [ROLE_TREASURE, ROLE_HUNTER, ROLE_CULTIST];
    return shuffle(baseRoles).slice(0, 2);
  }
  const roles = [ROLE_TREASURE, ROLE_HUNTER, ROLE_CULTIST];
  const counts = { [ROLE_TREASURE]: 1, [ROLE_HUNTER]: 1, [ROLE_CULTIST]: 1 };
  const limit = Math.floor(N / 2);
  let playerRoleProbabilities = { [ROLE_TREASURE]: 1, [ROLE_HUNTER]: 1, [ROLE_CULTIST]: 1 };
  let playerRole = null;

  if (isSinglePlayer) {
    try {
      const storedData = localStorage.getItem('cthulhu_role_streaks');
      if (storedData) {
        const streaks = JSON.parse(storedData);
        Object.keys(streaks).forEach(role => {
          playerRoleProbabilities[role] = Math.max(0, 1 - (streaks[role] * 0.1));
        });
      }
    } catch (e) {}
  }

  for (let i = 3; i < N; i++) {
    const available = [ROLE_TREASURE];
    if (counts[ROLE_HUNTER] < limit) available.push(ROLE_HUNTER);
    if (counts[ROLE_CULTIST] < limit) available.push(ROLE_CULTIST);

    let pick;
    if (isSinglePlayer && i === 3) {
      const weights = available.map(role => playerRoleProbabilities[role]);
      const totalWeight = weights.reduce((sum, w) => sum + w, 0);
      if (totalWeight > 0) {
        let random = Math.random() * totalWeight;
        for (let j = 0; j < available.length; j++) {
          random -= weights[j];
          if (random <= 0) {
            pick = available[j];
            break;
          }
        }
      } else {
        pick = available[Math.floor(Math.random() * available.length)];
      }
      playerRole = pick;
    } else {
      pick = available[Math.floor(Math.random() * available.length)];
    }

    roles.push(pick);
    counts[pick]++;
  }

  if (isSinglePlayer && playerRole) {
    try {
      const storedData = localStorage.getItem('cthulhu_role_streaks');
      let streaks = storedData ? JSON.parse(storedData) : { [ROLE_TREASURE]: 0, [ROLE_HUNTER]: 0, [ROLE_CULTIST]: 0 };
      Object.keys(streaks).forEach(role => {
        streaks[role] = 0;
      });
      streaks[playerRole] = (streaks[playerRole] || 0) + 1;
      localStorage.setItem('cthulhu_role_streaks', JSON.stringify(streaks));
    } catch (e) {}
  }

  return shuffle(roles);
}

export const isWinHand=h=>{
  const blanks=h.filter(isBlankZoneCard).length;
  const ls=new Set(h.map(c=>c.letter).filter(Boolean));
  const ns=new Set(h.map(c=>c.number).filter(n=>n!=null));
  const missingLetters=LETTERS.filter(l=>!ls.has(l)).length;
  const missingNumbers=NUMS.filter(n=>!ns.has(n)).length;
  return Math.max(missingLetters,missingNumbers)<=blanks;
};

export function moveEligibleBlankZones(players,log=[]){
  let changed=false;
  const P=copyPlayers(players);
  const L=[...log];
  P.forEach(player=>{
    if(!player||player.isDead)return;
    const blankZones=(player.zoneCards||[]).filter(isBlankZoneCard);
    if(!blankZones.length)return;
    if(player.hand.length<=3){
      blankZones.forEach(blank=>{
        player.hand.push(blank);
        L.push(`${player.name} 手牌不大于3张，将空白区域牌收入手牌`);
      });
      player.zoneCards=(player.zoneCards||[]).filter(c=>!isBlankZoneCard(c));
      changed=true;
    }
  });
  return changed?{players:P,log:L}:null;
}

export function killPlayerState(P,i,Disc,L){
  if(i==null||!P[i]||P[i].isDead)return;
  P[i].isDead=true;
  P[i].roleRevealed=true;
  L.push(`☠ ${P[i].name}（${P[i].role}）倒下了！`);
  Disc.push(...P[i].hand);
  P[i].hand=[];
  if(P[i].godZone?.length){
    Disc.push(...P[i].godZone);
    P[i].godZone=[];
    P[i].godName=null;
    P[i].godLevel=0;
  }
}

export function removeCardsFromDiscard(discard,cards){
  if(!Array.isArray(discard)||!Array.isArray(cards)||!cards.length)return discard;
  const removeIds=new Set(cards.map(c=>c?.id).filter(id=>id!=null));
  if(!removeIds.size)return discard;
  return discard.filter(c=>!removeIds.has(c?.id));
}

export function applyHpDamageWithLink(P,i,amount,Disc,L){
  if(i==null||!P[i]||P[i].isDead||!(amount>0))return;
  P[i].hp=clamp(P[i].hp-amount);
  if(P[i].damageLink?.active){
    const partnerIdx=P[i].damageLink.partner;
    if(partnerIdx!=null&&P[partnerIdx]&&!P[partnerIdx].isDead){
      P[i].damageLink.active=false;
      if(P[partnerIdx].damageLink)P[partnerIdx].damageLink.active=false;
      const linkDamage=3;
      P[i].hp=clamp(P[i].hp-linkDamage);
      P[partnerIdx].hp=clamp(P[partnerIdx].hp-linkDamage);
      L.push(`【两人一绳】绳索断裂！${P[i].name} 和 ${P[partnerIdx].name} 各失去 ${linkDamage} HP`);
      if(P[i].hp<=0)killPlayerState(P,i,Disc,L);
      if(P[partnerIdx].hp<=0)killPlayerState(P,partnerIdx,Disc,L);
    }
  }
  if(P[i].hp<=0)killPlayerState(P,i,Disc,L);
}

export function getLivingPlayerOrder(players,startIdx){
  const aliveOrder=[];
  for(let step=0;step<players.length;step++){
    const idx=(startIdx+step)%players.length;
    if(players[idx]&&!players[idx].isDead)aliveOrder.push(idx);
  }
  return aliveOrder;
}
