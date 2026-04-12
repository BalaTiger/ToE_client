import {
  ROLE_TREASURE,
  ROLE_HUNTER,
  ROLE_CULTIST,
} from "../constants/card";
import {
  isZoneCard,
  isBlankZoneCard,
  isNegativeZoneCard,
  isPositiveZoneCard,
  isNeutralZoneCard,
  isWinHand,
} from "./coreUtils";

export function getPrevLivingIndex(players,ci){
  for(let step=1;step<players.length;step++){
    const idx=(ci-step+players.length)%players.length;
    if(idx!==ci&&!players[idx].isDead)return idx;
  }
  return null;
}

export function getNextLivingIndex(players,ci){
  for(let step=1;step<players.length;step++){
    const idx=(ci+step)%players.length;
    if(idx!==ci&&!players[idx].isDead)return idx;
  }
  return null;
}

export function getAdjacentTargets(players,ci){
  return [getPrevLivingIndex(players,ci),getNextLivingIndex(players,ci)].filter((idx,pos,arr)=>idx!==null&&arr.indexOf(idx)===pos);
}

export function getLivingAdjacentTargets(players,ci){
  return getAdjacentTargets(players,ci).filter((idx,pos,arr)=>idx!==ci&&idx!=null&&players[idx]&&!players[idx].isDead&&arr.indexOf(idx)===pos);
}

export function zoneCardHasGuaranteedHpLoss(card){
  if(!card||card.isGod)return false;
  return ['selfDamageHP','selfDamageHPSAN','selfDamageDiscardHP','selfDamageRestHP','selfDamageHPCond','adjDamageHP','adjDamageBoth','allDamageHP','allDamageBoth','allDamageHPRandomExtra','selfDamageAdjDamageHP','selfDamageAdjDamageBoth','selfDamageHPPeek'].includes(card.type);
}

export function zoneCardHasGuaranteedSanLoss(card){
  if(!card||card.isGod)return false;
  return ['selfDamageSAN','selfDamageHPSAN','selfDamageDiscardSAN','selfDamageRestSAN','selfDamageSANCond','adjDamageSAN','adjDamageBoth','allDamageSAN','allDamageBoth','selfDamageAdjDamageBoth'].includes(card.type);
}

export function zoneCardIsSacrificeStyle(card){
  return !!card?.type&&['sacHealSelfSANCultist','selfBerserk'].includes(card.type);
}

export function zoneCardAppliesWidePressure(card){
  return !!card?.type&&['allDamageHP','allDamageSAN','allDamageBoth','allDiscard','adjDamageHP','adjDamageSAN','adjDamageBoth','adjRest','allDamageHPRandomExtra'].includes(card.type);
}

export function zoneCardProvidesGuaranteedCardGain(card){
  return !!card?.type&&['placeBlankZone','revealTopCards','firstComePick'].includes(card.type);
}

export function zoneCardUsesTargetInteraction(card){
  return !!card?.type && ['swapAllHands','caveDuel','damageLink','roseThornGiftAllHand','globalOnlySwap'].includes(card.type);
}

export function estimateHunterZoneCardScore(card,self,players,ci){
  if(!card)return -99;
  if(card.isGod){
    if(self.godName===card.godKey)return (self.godLevel||0)<3?7.5:2.5;
    if(!self.godName)return 6.5;
    return 2.8;
  }
  let score=0;
  const hp=self.hp||0;
  const san=self.san||0;
  const woundedEnemies=players.filter((p,i)=>i!==ci&&!p.isDead&&p.role!==ROLE_HUNTER&&p.hp<=3).length;
  const allEnemies=players.filter((p,i)=>i!==ci&&!p.isDead&&p.role!==ROLE_HUNTER);
  const adjacent=getLivingAdjacentTargets(players,ci);
  switch(card.type){
    case 'adjDamageHP':
      score+=adjacent.reduce((sum,idx)=>sum+(players[idx]?.role!==ROLE_HUNTER?2.4:0),0)+(woundedEnemies?1.4:0);
      break;
    case 'allDamageHP':
      score+=allEnemies.length*2.1+(woundedEnemies?1.6:0);
      break;
    case 'allDamageBoth':
      score+=allEnemies.length*2.3;
      break;
    case 'allDamageHPRandomExtra':
      score+=allEnemies.length*2.0+1.0;
      break;
    case 'adjDamageBoth':
      score+=adjacent.reduce((sum,idx)=>sum+(players[idx]?.role!==ROLE_HUNTER?2.0:0),0);
      break;
    case 'selfDamageAdjDamageHP':
      score+=adjacent.reduce((sum,idx)=>sum+(players[idx]?.role!==ROLE_HUNTER?1.8:0),0)-(hp<=4?4.0:1.3);
      break;
    case 'selfDamageAdjDamageBoth':
      score+=adjacent.reduce((sum,idx)=>sum+(players[idx]?.role!==ROLE_HUNTER?2.0:0),0)-(hp<=4?4.3:1.6);
      break;
    case 'damageLink':{
      let best=0;
      players.forEach((p,i)=>{
        if(i===ci||p.isDead)return;
        if(p.role===ROLE_HUNTER)return;
        const pressure=(p.hp<=5?3.0:1.8)+(p.san<=3?0.6:0);
        if(pressure>best)best=pressure;
      });
      score+=best;
      break;
    }
    case 'caveDuel':{
      const zoneCards=(self.hand||[]).filter(isZoneCard);
      const bestNumber=Math.max(0,...zoneCards.map(c=>c.isGod?0:(c.number||0)));
      score+=bestNumber>=3?3.2:1.2;
      break;
    }
    case 'swapAllHands':{
      let best=0;
      players.forEach((p,i)=>{
        if(i===ci||p.isDead)return;
        if(p.role===ROLE_HUNTER)return;
        const val=(p.hand?.length||0)-(self.hand?.length||0)+(p.hp<=4?1.2:0);
        if(val>best)best=val;
      });
      score+=best;
      break;
    }
    case 'roseThornGiftAllHand':{
      const handCount=(self.hand||[]).length;
      const aliveOthers=players.filter((p,i)=>i!==ci&&!p.isDead).length;
      score+=handCount>=3?2.6:1.0;
      if(aliveOthers<=1)score-=0.8;
      break;
    }
    case 'selfHealHP':
      score+=hp<=5?1.6:0.7;
      break;
    case 'selfHealBoth':
      score+=hp<=6||san<=5?1.8:0.9;
      break;
    case 'selfHealAdjDamageHP':
      score+=adjacent.reduce((sum,idx)=>sum+(players[idx]?.role!==ROLE_HUNTER?1.4:0),0)+(hp<=6?0.8:0.2);
      break;
    case 'selfBerserk':
      score+=hp>=5?1.5:0.2;
      break;
    case 'selfRevealHandHP':
      score+=(hp<=5?1.6:0.3)-((self.revealHand||false)?0.6:0);
      break;
    default:
      if(zoneCardHasGuaranteedHpLoss(card))score-=hp<=4?4.0:1.4;
      if(zoneCardHasGuaranteedSanLoss(card))score-=san<=3?2.1:0.7;
      if(zoneCardAppliesWidePressure(card))score+=0.5;
      if(zoneCardProvidesGuaranteedCardGain(card))score+=1.0;
      if(zoneCardUsesTargetInteraction(card))score+=0.8;
      break;
  }
  if(isNegativeZoneCard(card))score-=0.4;
  if(isPositiveZoneCard(card))score+=0.2;
  return score;
}

export function estimateTreasureZoneCardScore(card,self,players,ci){
  if(!card)return -99;
  if(card.isGod){
    if(self.godName===card.godKey)return (self.godLevel||0)<3?6.8:2.2;
    if(!self.godName)return 5.4;
    return 1.6;
  }
  let score=0;
  const hp=self.hp||0;
  const san=self.san||0;
  const hand=self.hand||[];
  const adjacent=getLivingAdjacentTargets(players,ci);
  switch(card.type){
    case 'placeBlankZone':
      score+=4.5;
      break;
    case 'revealTopCards':
      score+=3.9;
      break;
    case 'firstComePick':
      score+=3.4;
      break;
    case 'swapAllHands':{
      let best=0;
      players.forEach((p,i)=>{
        if(i===ci||p.isDead)return;
        const enemyProgress=(p.hand||[]).length;
        const myProgress=hand.length;
        const val=enemyProgress>myProgress?2.6:0.8;
        if(val>best)best=val;
      });
      score+=best;
      break;
    }
    case 'globalOnlySwap':
      score+=2.2;
      break;
    case 'selfHealHP':
      score+=hp<=5?1.6:0.4;
      break;
    case 'selfHealSAN':
      score+=san<=4?1.8:0.5;
      break;
    case 'selfHealBoth':
      score+=(hp<=6?1.0:0.3)+(san<=5?1.0:0.3);
      break;
    case 'selfRevealHandHP':
      score+=isWinHand(hand)?3.2:1.0;
      break;
    case 'caveDuel':{
      const zoneCards=hand.filter(isZoneCard);
      const bestNumber=Math.max(0,...zoneCards.map(c=>c.isGod?0:(c.number||0)));
      score+=bestNumber>=3?2.2:0.9;
      break;
    }
    case 'damageLink':{
      let best=0;
      players.forEach((p,i)=>{
        if(i===ci||p.isDead)return;
        const threat=(p.hp<=4?2.0:1.0)+(p.role===ROLE_HUNTER?0.8:0);
        if(threat>best)best=threat;
      });
      score+=best;
      break;
    }
    case 'roseThornGiftAllHand':
      score+=(hand.length>=4?1.7:0.8);
      break;
    default:
      if(zoneCardProvidesGuaranteedCardGain(card))score+=1.6;
      if(zoneCardUsesTargetInteraction(card))score+=0.7;
      if(zoneCardHasGuaranteedHpLoss(card))score-=hp<=4?4.4:1.8;
      if(zoneCardHasGuaranteedSanLoss(card))score-=san<=3?3.6:1.4;
      if(zoneCardAppliesWidePressure(card))score-=1.0;
      break;
  }
  if(isPositiveZoneCard(card))score+=0.4;
  if(isNegativeZoneCard(card))score-=0.7;
  return score;
}

export function estimateCultistZoneCardScore(card,self,players,ci){
  if(!card)return -99;
  if(card.isGod){
    if(self.godName===card.godKey)return (self.godLevel||0)<3?8.0:2.8;
    if(!self.godName)return 7.2;
    return 3.5;
  }
  let score=0;
  const hp=self.hp||0;
  const san=self.san||0;
  const adjacent=getLivingAdjacentTargets(players,ci);
  switch(card.type){
    case 'allDamageSAN':
      score+=players.reduce((sum,p,i)=>sum+(i!==ci&&!p.isDead?(p.role===ROLE_HUNTER?2.2:1.3):0),0);
      break;
    case 'adjDamageSAN':
      score+=adjacent.reduce((sum,idx)=>sum+(players[idx]?.role===ROLE_HUNTER?2.0:1.1),0);
      break;
    case 'allDamageBoth':
      score+=players.reduce((sum,p,i)=>sum+(i!==ci&&!p.isDead?(p.role===ROLE_HUNTER?2.0:1.0):0),0);
      break;
    case 'adjDamageBoth':
      score+=adjacent.reduce((sum,idx)=>sum+(players[idx]?.role===ROLE_HUNTER?1.9:0.9),0);
      break;
    case 'selfDamageSAN':
      score-=san<=3?3.5:1.2;
      break;
    case 'selfDamageHPSAN':
      score-=(hp<=4?2.8:1.1)+(san<=3?2.8:1.0);
      break;
    case 'selfRenounceGod':
      score-=self.godName?2.5:0.2;
      break;
    case 'selfBerserk':
      score+=1.2;
      break;
    case 'revealTopCards':
      score+=2.2;
      break;
    case 'firstComePick':
      score+=2.0;
      break;
    case 'caveDuel':{
      const zoneCards=(self.hand||[]).filter(isZoneCard);
      const bestNumber=Math.max(0,...zoneCards.map(c=>c.isGod?0:(c.number||0)));
      score+=bestNumber>=3?2.4:0.7;
      break;
    }
    case 'damageLink':{
      let best=0;
      players.forEach((p,i)=>{
        if(i===ci||p.isDead)return;
        const pressure=(p.role===ROLE_HUNTER?2.3:1.0)+(p.hp<=5?0.7:0);
        if(pressure>best)best=pressure;
      });
      score+=best;
      break;
    }
    case 'roseThornGiftAllHand':
      score+=(self.hand||[]).length>=3?2.0:0.8;
      break;
    default:
      if(zoneCardHasGuaranteedSanLoss(card))score+=0.8;
      if(zoneCardHasGuaranteedHpLoss(card)&&self.role===ROLE_CULTIST)score+=0.3;
      if(zoneCardUsesTargetInteraction(card))score+=0.8;
      if(zoneCardProvidesGuaranteedCardGain(card))score+=0.8;
      break;
  }
  if(isNegativeZoneCard(card))score+=0.2;
  if(isPositiveZoneCard(card))score+=0.2;
  if(isNeutralZoneCard(card))score+=0.1;
  return score;
}

export function estimateZoneCardKeepScore(card,ci,players){
  const self=players?.[ci];
  if(!self||self.isDead)return -99;
  if(self.role===ROLE_HUNTER)return estimateHunterZoneCardScore(card,self,players,ci);
  if(self.role===ROLE_CULTIST)return estimateCultistZoneCardScore(card,self,players,ci);
  return estimateTreasureZoneCardScore(card,self,players,ci);
}

export function chooseFirstComePickForAI(cards,ci,players){
  if(!cards?.length)return 0;
  const scored=cards.map((card,index)=>({
    index,
    score:estimateZoneCardKeepScore(card,ci,players)+(isZoneCard(card)?0.5:0),
  }));
  scored.sort((a,b)=>b.score-a.score);
  return scored[0].index;
}

export function aiChooseRevealCard(targetHand, hunterName, log=[], knownHunterCards=[]){
  const zoneCards=targetHand.filter(isZoneCard);
  if(!zoneCards.length)return targetHand[0];
  const hunterLogPrefixes=[
    `${hunterName} `,
    `${hunterName}（追猎者）`,
    `${hunterName}（寻宝者）`,
    `${hunterName}（邪祀者）`,
  ];
  const isHunterEntry=entry=>hunterLogPrefixes.some(prefix=>entry.startsWith(prefix));
  const parseCardFromBracket=text=>{
    const match=text?.match(/\[([A-D][1-4]|NYA|CTH)\]/);
    if(!match)return null;
    const key=match[1];
    if(key==='NYA'||key==='CTH')return {key,isGod:true};
    return {key,letter:key[0],number:Number(key[1]),isGod:false};
  };
  const hunterCardsInHand=[];
  log.forEach(entry=>{
    if(!isHunterEntry(entry)||!entry.includes('摸到')||!entry.includes('[')||!entry.includes(']'))return;
    const parsed=parseCardFromBracket(entry);
    if(!parsed)return;
    const wasDiscarded=log.some(logEntry=>isHunterEntry(logEntry)&&logEntry.includes(`弃 [${parsed.key}]`));
    if(!wasDiscarded)hunterCardsInHand.push(parsed);
  });
  const failedMatches=new Set();
  log.forEach((entry,index)=>{
    if(hunterName==='你'){
      const match=entry.match(/^你（追猎者）追捕 (.+?)，.+?亮出 \[(.*?)\]/);
      if(!match)return;
      const [,targetName,revealedKey]=match;
      const laterFailure=log.slice(index+1).some(nextEntry=>nextEntry===`放弃追捕 ${targetName}`);
      if(laterFailure)failedMatches.add(revealedKey);
    }else{
      const escapedHunterName=hunterName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const match=entry.match(new RegExp(`^${escapedHunterName}（追猎者）对 (.+?) 【追捕】，亮出 \\[(.*?)\\]`));
      if(!match)return;
      const [,targetName,revealedKey]=match;
      const laterFailure=log.slice(index+1).some(nextEntry=>nextEntry===`无匹配手牌，放弃追捕 ${targetName}`);
      if(laterFailure)failedMatches.add(revealedKey);
    }
  });
  const scored=zoneCards.map(card=>{
    let score=0;
    const isSimilarToHunterCard=hunterCardsInHand.some(hc=>hc.letter===card.letter||hc.number===card.number);
    if(!isSimilarToHunterCard){
      score+=3.5;
    }else{
      score-=1.5;
    }
    if(failedMatches.has(card.key))score+=2.4;
    const discardedHunterCards=[];
    log.forEach(entry=>{
      if(isHunterEntry(entry)&&entry.includes('弃 [')&&entry.includes(']')){
        const parsed=parseCardFromBracket(entry);
        if(parsed)discardedHunterCards.push(parsed);
      }
    });
    discardedHunterCards.forEach(cardInfo=>{
      if(cardInfo.letter===card.letter||cardInfo.number===card.number)score+=0.9;
    });
    knownHunterCards.forEach(cardInfo=>{
      if(cardInfo?.letter===card.letter||cardInfo?.number===card.number)score-=2.2;
    });
    if(card.face==='negativeAll')score+=0.4;
    if(card.face==='positive')score-=0.2;
    return {card,score};
  }).sort((a,b)=>b.score-a.score);
  return scored[0]?.card||zoneCards[0];
}

export function aiChooseHunterLootCards(targetHand,hunterHand,maxToTake=3){
  const chosen=[];
  const hunterLetters=new Set(hunterHand.filter(c=>c?.letter).map(c=>c.letter));
  const hunterNumbers=new Set(hunterHand.filter(c=>c?.number!=null).map(c=>c.number));
  const pool=[...targetHand];
  while(pool.length&&chosen.length<maxToTake){
    const scored=pool.map(card=>{
      let score=0;
      const hasLetter=card.letter!=null;
      const hasNumber=card.number!=null;
      const missingLetter=hasLetter&&!hunterLetters.has(card.letter);
      const missingNumber=hasNumber&&!hunterNumbers.has(card.number);
      if(missingLetter)score+=2.4;
      if(missingNumber)score+=2.4;
      if(card.isGod)score+=1.0;
      if(score===0)score+=0.3;
      return {card,score};
    }).sort((a,b)=>b.score-a.score);
    const pick=scored[0]?.card;
    if(!pick)break;
    chosen.push(pick);
    const idx=pool.findIndex(c=>c.id===pick.id);
    if(idx>=0)pool.splice(idx,1);
    if(pick.letter!=null)hunterLetters.add(pick.letter);
    if(pick.number!=null)hunterNumbers.add(pick.number);
  }
  return chosen;
}

export function shouldHunterKeepChasing(players,hunterIdx,huntAbandoned=[]){
  const hunter=players[hunterIdx];
  if(!hunter||hunter.isDead)return false;
  const hunterZoneCards=(hunter.hand||[]).filter(isZoneCard);
  const hunterHandLimit=hunter._nyaHandLimit??4;
  const hunterOverLimit=hunterZoneCards.length>hunterHandLimit;
  const someoneWounded=players.some((p,i)=>i!==hunterIdx&&!p.isDead&&p.hp<10);
  return hunterZoneCards.length>0 && getHunterChaseTargets(players,hunterIdx,huntAbandoned).length>0 && (hunterOverLimit||someoneWounded);
}

export function getHunterChaseTargets(players,hunterIdx,huntAbandoned=[]){
  return players
    .map((player,idx)=>({player,idx}))
    .filter(({player,idx})=>!player.isDead && idx!==hunterIdx && player.role!==ROLE_HUNTER && !huntAbandoned.includes(idx))
    .sort((a,b)=>(a.player.hp-b.player.hp)||(a.player.san-b.player.san))
    .map(({idx})=>idx);
}

export function aiShouldKeepZoneCard(card,ci,players,forced=false){
  if(!card||card.isGod)return true;
  if(forced)return true;
  return estimateZoneCardKeepScore(card,ci,players)>=0.8;
}
