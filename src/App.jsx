import { useState, useEffect, useRef } from "react";

// ══════════════════════════════════════════════════════════════
//  DATA
// ══════════════════════════════════════════════════════════════
const CARD_DEFS = {
  A1:{name:'治愈之光',  desc:'使用者回复2HP',             type:'selfHeal',        val:2, needsTarget:false},
  A2:{name:'诅咒箭矢',  desc:'目标受2HP伤害',             type:'damage',          val:2, needsTarget:true},
  A3:{name:'平静之心',  desc:'使用者回复2SAN',            type:'selfHealSAN',     val:2, needsTarget:false},
  A4:{name:'恐惧幻象',  desc:'目标失去2SAN',              type:'sanDamage',       val:2, needsTarget:true},
  B1:{name:'活力药水',  desc:'使用者回复1HP并额外摸1牌',  type:'selfHealDraw',    val:1, needsTarget:false},
  B2:{name:'穿刺',      desc:'目标受1HP伤害，使用者摸1牌',type:'damageDraw',      val:1, needsTarget:true},
  B3:{name:'定神香',    desc:'使用者回复1SAN并额外摸1牌', type:'selfHealSANDraw', val:1, needsTarget:false},
  B4:{name:'精神侵蚀',  desc:'目标失去1SAN并强制弃1牌',  type:'sanDamageDiscard',val:1, needsTarget:true},
  C1:{name:'神圣祝福',  desc:'全体回复1HP',               type:'allHeal',         val:1, needsTarget:false},
  C2:{name:'黑暗风暴',  desc:'所有他人受1HP伤害',         type:'allDamage',       val:1, needsTarget:false},
  C3:{name:'集体冥想',  desc:'全体回复1SAN',              type:'allHealSAN',      val:1, needsTarget:false},
  C4:{name:'群体恐慌',  desc:'所有他人失去1SAN',          type:'allSANDamage',    val:1, needsTarget:false},
  D1:{name:'生命奇迹',  desc:'使用者回复3HP',             type:'selfHeal',        val:3, needsTarget:false},
  D2:{name:'毁灭之力',  desc:'目标受3HP伤害',             type:'damage',          val:3, needsTarget:true},
  D3:{name:'理智堡垒',  desc:'使用者回复3SAN',            type:'selfHealSAN',     val:3, needsTarget:false},
  D4:{name:'疯狂瘟疫',  desc:'目标失去3SAN',              type:'sanDamage',       val:3, needsTarget:true},
};
const LETTERS=['A','B','C','D'], NUMS=[1,2,3,4];
const AI_NAMES=['艾伦','贝拉','卡洛斯','黛安娜'];
const ROLES=['寻宝者','追猎者','邪祀者'];
const RINFO={
  '寻宝者':{icon:'✦',col:'#7ecfd4',dim:'#2a6068',goal:'集齐A-D×1-4各一张牌',skillName:'掉包',skillLimited:true},
  '追猎者':{icon:'☩',col:'#cc4444',dim:'#6a1a1a',goal:'消灭所有非追猎者',skillName:'追捕',skillLimited:false},
  '邪祀者':{icon:'☽',col:'#9060cc',dim:'#3a1060',goal:'使任意角色SAN归零',skillName:'蛊惑',skillLimited:true},
};
// Aged-manuscript card style per letter
const CS={
  A:{bg:'#100d1a',border:'#3a2a6a',borderBright:'#6050a0',text:'#8878c0',glow:'#3a2a6a'},
  B:{bg:'#0a120a',border:'#1e4a1e',borderBright:'#3a7a3a',text:'#609060',glow:'#1e4a1e'},
  C:{bg:'#18120a',border:'#5a3a10',borderBright:'#8a6020',text:'#b08030',glow:'#5a3a10'},
  D:{bg:'#160a0a',border:'#6a1818',borderBright:'#a02828',text:'#b85050',glow:'#6a1818'},
};

// ══════════════════════════════════════════════════════════════
//  UTILITIES
// ══════════════════════════════════════════════════════════════
const shuffle=a=>{const b=[...a];for(let i=b.length-1;i>0;i--){const j=0|Math.random()*(i+1);[b[i],b[j]]=[b[j],b[i]];}return b;};
const clamp=(v,lo=0,hi=10)=>Math.max(lo,Math.min(hi,v));
const copyPlayers=ps=>ps.map(p=>({...p,hand:[...p.hand]}));
function mkDeck(){let id=0;return shuffle(LETTERS.flatMap(L=>NUMS.flatMap(N=>Array(4).fill(0).map(()=>({id:id++,key:`${L}${N}`,letter:L,number:N,...CARD_DEFS[`${L}${N}`]})))))}
function mkRoles(){return shuffle([...ROLES,...shuffle(ROLES).slice(0,2)]);}
const isWinHand=h=>{const ls=new Set(h.map(c=>c.letter)),ns=new Set(h.map(c=>c.number));return LETTERS.every(l=>ls.has(l))&&NUMS.every(n=>ns.has(n));};

// ══════════════════════════════════════════════════════════════
//  EFFECT ENGINE
// ══════════════════════════════════════════════════════════════
function applyFx(card,ci,ti,ps,deck,disc){
  let P=copyPlayers(ps),D=[...deck],Disc=[...disc],msgs=[];
  const healHP=(i,v)=>{if(i==null||!P[i])return;P[i].hp=clamp(P[i].hp+v);};
  const healSAN=(i,v)=>{if(i==null||!P[i])return;P[i].san=clamp(P[i].san+v);};
  const hurtHP=(i,v)=>{if(i==null||!P[i]||P[i].isDead)return;P[i].hp=clamp(P[i].hp-v);if(P[i].hp<=0){P[i].isDead=true;msgs.push(`☠ ${P[i].name} 倒下了！`);}};
  const hurtSAN=(i,v)=>{if(i==null||!P[i]||P[i].isDead)return;P[i].san=clamp(P[i].san-v);};
  const randDiscard=i=>{if(i==null||!P[i])return;if(P[i].hand.length){const x=0|Math.random()*P[i].hand.length;const c=P[i].hand.splice(x,1)[0];Disc.push(c);msgs.push(`${P[i].name} 失去了 [${c.key}]`);}};
  const drawDirect=i=>{if(i==null||!P[i])return;if(!D.length&&Disc.length){D=shuffle(Disc);Disc=[];msgs.push('牌堆重新洗入...');}if(D.length)P[i].hand.push(D.shift());};
  const cn=P[ci].name,tn=ti!=null?P[ti]?.name:'';
  switch(card.type){
    case 'selfHeal':       healHP(ci,card.val);  msgs.push(`${cn} 回复 ${card.val}HP`);break;
    case 'selfHealSAN':    healSAN(ci,card.val); msgs.push(`${cn} 回复 ${card.val}SAN`);break;
    case 'damage':         hurtHP(ti,card.val);  msgs.push(`${cn} → ${tn}：${card.val}HP 伤害`);break;
    case 'sanDamage':      hurtSAN(ti,card.val); msgs.push(`${cn} → ${tn}：失去 ${card.val}SAN`);break;
    case 'selfHealDraw':   healHP(ci,card.val);drawDirect(ci);msgs.push(`${cn} 回复 ${card.val}HP 并摸1牌`);break;
    case 'selfHealSANDraw':healSAN(ci,card.val);drawDirect(ci);msgs.push(`${cn} 回复 ${card.val}SAN 并摸1牌`);break;
    case 'damageDraw':     hurtHP(ti,card.val);drawDirect(ci);msgs.push(`${cn} → ${tn}：${card.val}HP 伤害，${cn} 摸1牌`);break;
    case 'sanDamageDiscard':hurtSAN(ti,card.val);randDiscard(ti);msgs.push(`${cn} → ${tn}：失去 ${card.val}SAN 并夺牌`);break;
    case 'allHeal':        P.forEach((_,i)=>{if(!P[i].isDead)healHP(i,card.val);});msgs.push(`全体回复 ${card.val}HP`);break;
    case 'allDamage':      P.forEach((_,i)=>{if(!P[i].isDead&&i!==ci)hurtHP(i,card.val);});msgs.push(`${cn} 对所有他人造成 ${card.val}HP 伤害`);break;
    case 'allHealSAN':     P.forEach((_,i)=>{if(!P[i].isDead)healSAN(i,card.val);});msgs.push(`全体回复 ${card.val}SAN`);break;
    case 'allSANDamage':   P.forEach((_,i)=>{if(!P[i].isDead&&i!==ci)hurtSAN(i,card.val);});msgs.push(`${cn} 侵蚀了所有人的理智`);break;
  }
  return{P,D,Disc,msgs};
}

// ══════════════════════════════════════════════════════════════
//  WIN CHECK
// ══════════════════════════════════════════════════════════════
function checkWin(players){
  for(const p of players)if(!p.isDead&&p.san<=0)return{winner:'邪祀者',reason:`${p.name} 的理智归零，邪神苏醒！邪祀者获胜！`};
  if(players[0].isDead)return{winner:'LOSE',reason:'你已沉入永恒的黑暗…'};
  const nh=players.filter(p=>p.role!=='追猎者');
  if(nh.length&&nh.every(p=>p.isDead))return{winner:'追猎者',reason:'异类已尽数清除！追猎者获胜！'};
  return null;
}

// ══════════════════════════════════════════════════════════════
//  AI DRAW
// ══════════════════════════════════════════════════════════════
function aiDrawAndApply(ci,ps,deck,disc){
  let P=copyPlayers(ps),D=[...deck],Disc=[...disc];
  if(!D.length&&Disc.length){D=shuffle(Disc);Disc=[];}
  if(!D.length)return{P,D,Disc,drawnCard:null,effectMsgs:[]};
  const drawnCard=D.shift();let ti=null;
  if(drawnCard.needsTarget){
    const aliveIdx=P.map((_,i)=>i).filter(i=>!P[i].isDead&&i!==ci);
    if(aliveIdx.length){
      const role=P[ci].role;let bestIdx;
      if(['damage','damageDraw'].includes(drawnCard.type))bestIdx=role==='追猎者'?aliveIdx.reduce((b,i)=>P[i].hp<P[b].hp?i:b,aliveIdx[0]):aliveIdx[0|Math.random()*aliveIdx.length];
      else bestIdx=role==='邪祀者'?aliveIdx.reduce((b,i)=>P[i].san<P[b].san?i:b,aliveIdx[0]):aliveIdx[0|Math.random()*aliveIdx.length];
      ti=bestIdx;
    }else{P[ci].hand.push(drawnCard);return{P,D,Disc,drawnCard,effectMsgs:[`${P[ci].name} 摸到 [${drawnCard.key}]（无目标，效果失效）`]};}
  }
  const res=applyFx(drawnCard,ci,ti,P,D,Disc);
  P=res.P;D=res.D;Disc=res.Disc;P[ci].hand.push(drawnCard);
  return{P,D,Disc,drawnCard,effectMsgs:[`${P[ci].name} 摸到 [${drawnCard.key}] ${drawnCard.name}`,...res.msgs]};
}

// ══════════════════════════════════════════════════════════════
//  PLAYER DRAW
// ══════════════════════════════════════════════════════════════
function playerDrawCard(ps,deck,disc){
  let P=copyPlayers(ps),D=[...deck],Disc=[...disc];
  if(!D.length&&Disc.length){D=shuffle(Disc);Disc=[];}
  if(!D.length)return{P,D,Disc,drawnCard:null,effectMsgs:[],needTarget:false};
  const drawnCard=D.shift();
  if(drawnCard.needsTarget)return{P,D,Disc,drawnCard,effectMsgs:[],needTarget:true};
  const res=applyFx(drawnCard,0,null,P,D,Disc);
  P=res.P;D=res.D;Disc=res.Disc;P[0].hand.push(drawnCard);
  return{P,D,Disc,drawnCard,effectMsgs:res.msgs,needTarget:false};
}

// ══════════════════════════════════════════════════════════════
//  TURN ADVANCE  (adds skillUsed:false reset for player turn)
// ══════════════════════════════════════════════════════════════
function startNextTurn(gs){
  let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard],L=[...gs.log];
  let next=gs.currentTurn;
  for(let i=1;i<=5;i++){next=(gs.currentTurn+i)%5;if(!P[next].isDead)break;}
  L.push(`── ${P[next].name} 的回合开始 ──`);
  if(next===0){
    const res=playerDrawCard(P,D,Disc);
    P=res.P;D=res.D;Disc=res.Disc;
    if(!res.drawnCard){L.push('牌堆耗尽！');return{...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:0,phase:'ACTION',drawReveal:null,abilityData:{},skillUsed:false};}
    const win=checkWin(P);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win};
    if(!res.needTarget&&!P[0].isDead&&P[0].role==='寻宝者'&&isWinHand(P[0].hand)){P[0].roleRevealed=true;return{...gs,players:P,deck:D,discard:Disc,log:[...L,'你摸牌后集齐了全部编号！'],gameOver:{winner:'寻宝者',reason:'你集齐了全部编号，寻宝者获胜！'}};}
    return{...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:0,skillUsed:false,
      phase:res.needTarget?'DRAW_SELECT_TARGET':'DRAW_REVEAL',
      drawReveal:{card:res.drawnCard,msgs:res.effectMsgs,needTarget:res.needTarget},
      selectedCard:null,abilityData:{}};
  }else{
    const res=aiDrawAndApply(next,P,D,Disc);
    P=res.P;D=res.D;Disc=res.Disc;if(res.effectMsgs.length)L.push(...res.effectMsgs);
    const win=checkWin(P);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win};
    if(!P[next].isDead&&P[next].role==='寻宝者'&&isWinHand(P[next].hand)){P[next].roleRevealed=true;return{...gs,players:P,deck:D,discard:Disc,log:[...L,`${P[next].name}（寻宝者）集齐获胜！`],gameOver:{winner:'寻宝者',reason:`${P[next].name} 集齐了全部编号，寻宝者获胜！`}};}
    return{...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:next,phase:'AI_TURN',drawReveal:null,selectedCard:null,abilityData:{}};
  }
}

// ══════════════════════════════════════════════════════════════
//  AI STEP
// ══════════════════════════════════════════════════════════════
function aiStep(gs){
  const{players:ps,currentTurn:ct}=gs;
  const ai=ps[ct];const alive=ps.filter((p,i)=>!p.isDead&&i!==ct);
  let P=copyPlayers(ps),D=[...gs.deck],Disc=[...gs.discard],L=[...gs.log];
  if(ai.role==='寻宝者'&&isWinHand(ai.hand)){P[ct].roleRevealed=true;return{...gs,players:P,log:[...L,`${ai.name}（寻宝者）宣告获胜！`],gameOver:{winner:'寻宝者',reason:`${ai.name} 集齐了全部编号，寻宝者获胜！`}};}
  const useSkill=Math.random()<0.35&&alive.length>0;
  if(useSkill){
    P[ct].roleRevealed=true;
    const tgt=ai.role==='追猎者'?alive.reduce((b,p)=>p.hp<b.hp?p:b,alive[0]):ai.role==='邪祀者'?alive.reduce((b,p)=>p.san<b.san?p:b,alive[0]):alive[0|Math.random()*alive.length];
    const ti=ps.indexOf(tgt);
    if(ai.role==='寻宝者'&&P[ti].hand.length&&P[ct].hand.length){
      const ri=0|Math.random()*P[ti].hand.length;const taken=P[ti].hand.splice(ri,1)[0];
      const gi=0|Math.random()*P[ct].hand.length;const given=P[ct].hand.splice(gi,1)[0];
      P[ct].hand.push(taken);P[ti].hand.push(given);
      L.push(`${ai.name}（寻宝者）对 ${tgt.name} 【掉包】`);
      if(isWinHand(P[ct].hand)){P[ct].roleRevealed=true;return{...gs,players:P,deck:D,discard:Disc,log:[...L,`${ai.name} 掉包后获胜！`],gameOver:{winner:'寻宝者',reason:`${ai.name} 通过掉包集齐全部编号！`}};}
    }else if(ai.role==='追猎者'&&P[ti].hand.length){
      const ri=0|Math.random()*P[ti].hand.length;const rc=P[ti].hand[ri];
      L.push(`${ai.name}（追猎者）对 ${tgt.name} 【追捕】，亮出 [${rc.key}]`);
      const mi=P[ct].hand.findIndex(c=>c.letter===rc.letter||c.number===rc.number);
      if(mi>=0){const dc=P[ct].hand.splice(mi,1)[0];Disc.push(dc);P[ti].hp=clamp(P[ti].hp-2);L.push(`弃 [${dc.key}] → ${tgt.name} 受 2HP 伤害！`);if(P[ti].hp<=0){P[ti].isDead=true;L.push(`☠ ${tgt.name} 倒下了！`);}}
      else L.push(`无匹配手牌，放弃追捕`);
    }else if(ai.role==='邪祀者'&&P[ct].hand.length){
      const prefer=['sanDamage','allSANDamage','sanDamageDiscard'];
      const sc=P[ct].hand.find(c=>prefer.includes(c.type))||P[ct].hand[0];
      P[ct].hand=P[ct].hand.filter(c=>c.id!==sc.id);
      L.push(`${ai.name}（邪祀者）对 ${tgt.name} 【蛊惑】，赠予 [${sc.key}]`);
      const res=applyFx(sc,ti,ti,P,D,Disc);P=res.P;D=res.D;Disc=res.Disc;L.push(...res.msgs);
    }
  }else{L.push(`${ai.name} 未使用技能，结束回合`);}
  const win=checkWin(P);if(win)return{...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win};
  while(P[ct].hand.length>4){const c=P[ct].hand.shift();Disc.push(c);L.push(`${ai.name} 弃 [${c.key}]（上限）`);}
  return startNextTurn({...gs,players:P,deck:D,discard:Disc,log:L,currentTurn:ct});
}

// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════
function initGame(){
  const deck=mkDeck(),roles=mkRoles(),names=['你',...AI_NAMES];
  const players=names.map((name,i)=>({id:i,name,role:roles[i],roleRevealed:false,hp:10,san:10,hand:[],isDead:false}));
  for(let r=0;r<4;r++)players.forEach(p=>p.hand.push(deck.shift()));
  const base={players,deck,discard:[],currentTurn:-1,phase:'DRAW_REVEAL',drawReveal:null,selectedCard:null,abilityData:{},log:['游戏开始。每人获得四张初始手牌。'],gameOver:null,skillUsed:false};
  return startNextTurn(base);
}

// ══════════════════════════════════════════════════════════════
//  ANIMATION SYSTEM
// ══════════════════════════════════════════════════════════════
const ANIM_CFG={
  DRAW_CARD:    {overlay:'rgba(5,3,2,0.94)',  accent:'#c8a96e', icon:'⚜',  title:'命运翻牌',  shake:false, purpleVig:false},
  HP_DAMAGE:    {overlay:'rgba(25,3,3,0.92)', accent:'#cc2222', icon:'⚔',  title:'鲜血流淌',  shake:true,  purpleVig:false},
  SAN_DAMAGE:   {overlay:'rgba(10,3,22,0.92)',accent:'#8840cc', icon:'👁',  title:'理智侵蚀',  shake:true,  purpleVig:true},
  HP_HEAL:      {overlay:'rgba(3,12,3,0.92)', accent:'#4ade80', icon:'✚',  title:'创伤愈合',  shake:false, purpleVig:false},
  SAN_HEAL:     {overlay:'rgba(8,3,18,0.92)', accent:'#a78bfa', icon:'☯',  title:'心神平复',  shake:false, purpleVig:false},
  SKILL_SWAP:   {overlay:'rgba(2,12,18,0.92)',accent:'#40a0b8', icon:'✦',  title:'掉包施术',  shake:false, purpleVig:false},
  SKILL_HUNT:   {overlay:'rgba(22,3,3,0.92)', accent:'#cc4444', icon:'☩',  title:'追捕猎杀',  shake:true,  purpleVig:false},
  SKILL_BEWITCH:{overlay:'rgba(16,3,28,0.92)',accent:'#9060cc', icon:'☽',  title:'邪术蛊惑',  shake:false, purpleVig:true},
  DISCARD:      {overlay:'rgba(18,10,2,0.92)',accent:'#c87030', icon:'🕯',  title:'弃置遗忘',  shake:false, purpleVig:false},
  DEATH:        {overlay:'rgba(12,2,2,0.96)', accent:'#ff2020', icon:'☠',  title:'死亡降临',  shake:true,  purpleVig:false},
};

function detectAnim(oldGs,newGs){
  if(!oldGs||!newGs)return null;
  const newMsgs=newGs.log.slice(oldGs.log.length);
  const deaths=newGs.players.filter((p,i)=>oldGs.players[i]&&!oldGs.players[i].isDead&&p.isDead);
  if(deaths.length)return{type:'DEATH',msgs:newMsgs};
  const hpHit=newGs.players.some((p,i)=>oldGs.players[i]&&p.hp<oldGs.players[i].hp);
  if(hpHit)return{type:'HP_DAMAGE',msgs:newMsgs};
  const sanHit=newGs.players.some((p,i)=>oldGs.players[i]&&p.san<oldGs.players[i].san);
  if(sanHit)return{type:'SAN_DAMAGE',msgs:newMsgs};
  const j=newMsgs.join(' ');
  if(j.includes('掉包'))return{type:'SKILL_SWAP',msgs:newMsgs};
  if(j.includes('追捕'))return{type:'SKILL_HUNT',msgs:newMsgs};
  if(j.includes('蛊惑'))return{type:'SKILL_BEWITCH',msgs:newMsgs};
  return null;
}

// ══════════════════════════════════════════════════════════════
//  UI COMPONENTS  (Darkest Dungeon aesthetic)
// ══════════════════════════════════════════════════════════════

// ── Animation Overlay ────────────────────────────────────────
function AnimOverlay({anim,exiting}){
  if(!anim)return null;
  const cfg=ANIM_CFG[anim.type]||ANIM_CFG.HP_DAMAGE;
  const msgs=(anim.msgs||[]).slice(-4);
  return(
    <div style={{
      position:'fixed',inset:0,zIndex:999,
      background:cfg.overlay,
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      animation:exiting?'animFadeOut 0.18s ease-in forwards':'animFadeIn 0.15s ease-out forwards',
    }}>
      {cfg.purpleVig&&<div style={{position:'absolute',inset:0,boxShadow:`inset 0 0 120px ${cfg.accent}55`,animation:'animVig 0.6s ease-in-out',pointerEvents:'none'}}/>}
      <div style={{
        fontSize:88,lineHeight:1,marginBottom:12,
        textShadow:`0 0 40px ${cfg.accent}, 0 0 80px ${cfg.accent}66`,
        animation:cfg.shake?'animShake 0.45s ease-in-out':'animPop 0.4s ease-out',
        filter:`drop-shadow(0 0 20px ${cfg.accent})`,
      }}>{cfg.icon}</div>
      <div style={{
        fontFamily:"'Cinzel', serif",fontWeight:700,letterSpacing:5,fontSize:22,
        color:cfg.accent,textShadow:`0 0 24px ${cfg.accent}`,
        marginBottom:20,textTransform:'uppercase',
      }}>{cfg.title}</div>
      {msgs.length>0&&(
        <div style={{
          background:'rgba(0,0,0,0.6)',border:`1px solid ${cfg.accent}44`,borderRadius:4,
          padding:'10px 24px',maxWidth:380,textAlign:'center',
        }}>
          {msgs.map((m,i)=>(
            <div key={i} style={{
              fontFamily:"'IM Fell English', 'Georgia', serif",fontStyle:'italic',
              color:'#c8a96e',fontSize:13,lineHeight:1.8,opacity:0.9,
            }}>{m}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────
function DDCard({card,onClick,disabled,selected,highlight,small}){
  if(!card)return null;
  const s=CS[card.letter];
  const w=small?44:82,h=small?58:108;
  return(
    <div onClick={disabled?undefined:onClick} style={{
      width:w,minWidth:w,height:h,flexShrink:0,
      background:s.bg,
      border:`1.5px solid ${selected?'#c8a96e':highlight?s.borderBright:s.border}`,
      boxShadow:selected?`0 0 14px #c8a96e88,inset 0 0 12px #c8a96e22`:highlight?`0 0 10px ${s.glow}88`:`inset 0 1px 0 ${s.border}44`,
      borderRadius:3,
      cursor:disabled?'default':'pointer',
      opacity:disabled?0.35:1,
      transform:selected?'translateY(-5px)':undefined,
      transition:'all .14s',
      display:'flex',flexDirection:'column',
      padding:small?'4px 3px':'7px 8px',
      userSelect:'none',
      position:'relative',
    }}>
      {/* Corner ornament */}
      {!small&&<div style={{position:'absolute',top:3,right:5,color:s.border,fontSize:9,opacity:0.7}}>✦</div>}
      <div style={{color:s.text,fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:small?12:18,lineHeight:1}}>{card.key}</div>
      {!small&&<div style={{color:'#c8a96e',fontFamily:"'IM Fell English','Georgia',serif",fontSize:10.5,fontWeight:600,marginTop:4,lineHeight:1.25}}>{card.name}</div>}
      {!small&&<div style={{color:'#7a6040',fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',fontSize:9.5,marginTop:'auto',lineHeight:1.35}}>{card.desc}</div>}
      {/* Bottom ornament */}
      {!small&&<div style={{position:'absolute',bottom:3,left:'50%',transform:'translateX(-50%)',color:s.border,fontSize:8,opacity:0.5}}>— ✦ —</div>}
    </div>
  );
}

function DDCardBack({small}){
  return(
    <div style={{
      width:small?36:50,height:small?50:68,flexShrink:0,
      background:'#100c08',
      border:'1.5px solid #3a2510',
      boxShadow:'inset 0 0 8px #0a0600',
      borderRadius:3,
      display:'flex',alignItems:'center',justifyContent:'center',
    }}>
      <div style={{color:'#3a2510',fontSize:small?14:18,fontFamily:"serif"}}>✦</div>
    </div>
  );
}

// ── Stat Bar ─────────────────────────────────────────────────
function StatBar({label,val,color,trackColor}){
  return(
    <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:4}}>
      <span style={{fontFamily:"'Cinzel',serif",color:'#5a4020',fontSize:9,width:26,letterSpacing:1}}>{label}</span>
      <div style={{flex:1,height:6,background:trackColor||'#1a1008',border:'1px solid #2a1a08',borderRadius:1,overflow:'hidden'}}>
        <div style={{height:'100%',width:`${val*10}%`,background:color,transition:'width .35s',borderRadius:1}}/>
      </div>
      <span style={{fontFamily:"'Cinzel',serif",color:val<=3?'#cc3333':'#c8a96e',fontSize:10,width:14,textAlign:'right',fontWeight:700}}>{val}</span>
    </div>
  );
}

// ── Player Panel ─────────────────────────────────────────────
function PlayerPanel({player,isCurrentTurn,isSelectable,onSelect,showFaceUp,onCardSelect}){
  const ri=RINFO[player.role];
  const borderColor=isCurrentTurn?'#c8a96e':isSelectable?ri.col:'#3a2510';
  return(
    <div onClick={!showFaceUp&&isSelectable?onSelect:undefined} style={{
      background:isCurrentTurn?'#1c1408':'#140f08',
      border:`1.5px solid ${borderColor}`,
      boxShadow:isCurrentTurn?`0 0 20px #c8a96e22,inset 0 0 16px #c8a96e08`:isSelectable?`0 0 14px ${ri.col}44`:'none',
      borderRadius:3,padding:'8px 9px',
      cursor:isSelectable&&!showFaceUp?'pointer':'default',
      opacity:player.isDead?0.32:1,
      transition:'all .2s',
      position:'relative',
    }}>
      {/* Name plate */}
      <div style={{
        display:'flex',alignItems:'center',gap:6,marginBottom:6,
        borderBottom:'1px solid #2a1a08',paddingBottom:5,
      }}>
        <span style={{fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:11,color:isCurrentTurn?'#e8c87a':'#c8a96e',letterSpacing:1}}>{player.name}</span>
        {player.roleRevealed&&<span style={{fontSize:10,color:ri.col,fontFamily:"'Cinzel',serif",letterSpacing:1,marginLeft:2}}>{ri.icon} {player.role}</span>}
        {player.isDead&&<span style={{fontSize:11,color:'#882020',marginLeft:'auto'}}>☠</span>}
        {isCurrentTurn&&!player.isDead&&<span style={{fontSize:9,color:'#c8a96e',marginLeft:'auto',letterSpacing:1}}>▸ 行动</span>}
      </div>
      <StatBar label="HP"  val={player.hp}  color="#8b1515" trackColor="#1a0808"/>
      <StatBar label="SAN" val={player.san} color="#4a1080" trackColor="#120820"/>
      <div style={{display:'flex',flexWrap:'wrap',gap:3,marginTop:5}}>
        {showFaceUp
          ?player.hand.map((c,ci)=><DDCard key={c.id} card={c} small onClick={onCardSelect?()=>onCardSelect(ci):undefined} disabled={!onCardSelect} highlight={!!onCardSelect}/>)
          :player.hand.map((_,ci)=><DDCardBack key={ci} small/>)
        }
      </div>
    </div>
  );
}

// ── Draw Reveal Modal ─────────────────────────────────────────
function DrawRevealModal({drawReveal,onConfirm}){
  if(!drawReveal?.card)return null;
  const{card,msgs}=drawReveal;
  const s=CS[card.letter];
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(2,1,0,0.88)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300}}>
      <div style={{
        background:'#150e07',
        border:`2px solid ${s.border}`,
        boxShadow:`0 0 60px ${s.glow}44, 0 0 120px #000a`,
        borderRadius:4,padding:'28px 34px',maxWidth:320,width:'92%',textAlign:'center',
        animation:'animPop 0.22s ease-out',
      }}>
        <div style={{fontFamily:"'Cinzel',serif",color:'#5a4020',fontSize:10,letterSpacing:3,marginBottom:16,textTransform:'uppercase'}}>── 命运降临 ──</div>
        {/* Big card */}
        <div style={{
          background:s.bg,border:`2px solid ${s.borderBright}`,
          borderRadius:4,padding:'18px 22px',display:'inline-flex',flexDirection:'column',alignItems:'center',
          minWidth:120,marginBottom:16,boxShadow:`0 0 30px ${s.glow}55`,
        }}>
          <div style={{fontFamily:"'Cinzel',serif",fontWeight:700,color:s.text,fontSize:34,lineHeight:1}}>{card.key}</div>
          <div style={{fontFamily:"'Cinzel',serif",color:'#c8a96e',fontSize:13,fontWeight:600,marginTop:6}}>{card.name}</div>
          <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#7a6040',fontSize:11,marginTop:8,lineHeight:1.4,maxWidth:140}}>{card.desc}</div>
        </div>
        {/* Effect results */}
        {msgs.length>0&&(
          <div style={{background:'#0c0800',border:'1px solid #2a1a08',borderRadius:2,padding:'8px 14px',marginBottom:16,textAlign:'left'}}>
            <div style={{fontFamily:"'Cinzel',serif",color:'#3a2510',fontSize:9,letterSpacing:2,marginBottom:6,textTransform:'uppercase'}}>效果结算</div>
            {msgs.map((m,i)=>(
              <div key={i} style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',fontSize:12,color:'#c8a96e',lineHeight:1.7,opacity:0.85}}>{m}</div>
            ))}
          </div>
        )}
        <button onClick={onConfirm} style={{
          padding:'10px 36px',
          background:'#1c1008',
          border:'1.5px solid #7a5020',
          color:'#c8a96e',
          fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:13,
          borderRadius:2,cursor:'pointer',letterSpacing:2,
          boxShadow:'0 0 16px #7a502044',
          textTransform:'uppercase',
          transition:'all .15s',
        }}>收入手牌</button>
      </div>
    </div>
  );
}

// ── Draw Target Banner ────────────────────────────────────────
function DrawTargetBanner({drawReveal}){
  if(!drawReveal?.card)return null;
  const{card}=drawReveal;
  const s=CS[card.letter];
  return(
    <div style={{
      position:'fixed',top:0,left:0,right:0,
      background:'#100900',borderBottom:`2px solid ${s.borderBright}`,
      padding:'10px 18px',zIndex:300,
      display:'flex',alignItems:'center',gap:14,
      boxShadow:`0 4px 30px ${s.glow}44`,
    }}>
      <div style={{
        background:s.bg,border:`1.5px solid ${s.border}`,borderRadius:3,
        padding:'5px 10px',display:'flex',alignItems:'center',gap:8,flexShrink:0,
      }}>
        <span style={{fontFamily:"'Cinzel',serif",fontWeight:700,color:s.text,fontSize:16}}>{card.key}</span>
        <div>
          <div style={{fontFamily:"'Cinzel',serif",color:'#c8a96e',fontSize:11,fontWeight:600}}>{card.name}</div>
          <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#7a6040',fontSize:10}}>{card.desc}</div>
        </div>
      </div>
      <div style={{fontFamily:"'Cinzel',serif",color:'#c8a96e',fontSize:12,letterSpacing:2,textTransform:'uppercase'}}>
        ↑ 点击目标以施加效果
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  MAIN GAME
// ══════════════════════════════════════════════════════════════
export default function Game(){
  const[gs,setGs]=useState(null);
  const[anim,setAnim]=useState(null);
  const[animExiting,setAnimExiting]=useState(false);
  const pendingGsRef=useRef(null);
  const timerRef=useRef(null);
  const logRef=useRef(null);

  useEffect(()=>{if(logRef.current)logRef.current.scrollTop=logRef.current.scrollHeight;},[gs?.log?.length]);

  // Animation lifecycle: show 600ms then fade out
  useEffect(()=>{
    if(!anim)return;
    const t1=setTimeout(()=>{
      setAnimExiting(true);
      const t2=setTimeout(()=>{
        const next=pendingGsRef.current;
        pendingGsRef.current=null;
        setAnim(null);setAnimExiting(false);
        if(next)setGs(next);
      },180);
      return()=>clearTimeout(t2);
    },600);
    return()=>clearTimeout(t1);
  },[anim]);

  function triggerAnim(type,msgs,nextGs){
    pendingGsRef.current=nextGs;
    setAnim({type,msgs});
  }

  // AI turn
  useEffect(()=>{
    if(!gs||gs.phase!=='AI_TURN'||gs.gameOver||anim)return;
    timerRef.current=setTimeout(()=>{
      const newGs=aiStep(gs);
      const animData=detectAnim(gs,newGs);
      if(animData)triggerAnim(animData.type,animData.msgs,newGs);
      else setGs(newGs);
    },700);
    return()=>clearTimeout(timerRef.current);
  },[gs?.currentTurn,gs?.phase,anim]);

  // ── Start Screen ───────────────────────────────────────────
  if(!gs){
    return(
      <div style={{minHeight:'100vh',background:'#0a0705',color:'#c8a96e',fontFamily:"'IM Fell English','Georgia',serif",display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',textAlign:'center',padding:24,position:'relative',overflow:'hidden'}}>
        {/* Vignette */}
        <div style={{position:'fixed',inset:0,background:'radial-gradient(ellipse at center,transparent 30%,#000000bb 100%)',pointerEvents:'none'}}/>
        <div style={{position:'relative',zIndex:1}}>
          <div style={{fontSize:11,letterSpacing:6,color:'#5a4020',fontFamily:"'Cinzel',serif",marginBottom:10,textTransform:'uppercase'}}>— Descent into Darkness —</div>
          <h1 style={{fontFamily:"'Cinzel Decorative','Cinzel',serif",fontSize:34,fontWeight:700,letterSpacing:3,marginBottom:6,color:'#e8c87a',textShadow:'0 0 40px #c8a96e44,0 2px 0 #0a0705'}}>克苏鲁卡牌对战</h1>
          <div style={{width:200,height:1,background:'linear-gradient(90deg,transparent,#5a4020,transparent)',margin:'0 auto 28px'}}/>
          <p style={{color:'#7a6040',maxWidth:380,marginBottom:32,lineHeight:1.9,fontSize:14,fontStyle:'italic'}}>
            "古神沉眠之时，五名旅者聚于此地。寻宝者寻觅遗物，追猎者猎杀异类，邪祀者企图唤醒邪神。各怀秘密，命运共织。"
          </p>
          {/* Role cards */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14,maxWidth:500,width:'100%',margin:'0 auto 28px'}}>
            {Object.entries(RINFO).map(([role,r])=>(
              <div key={role} style={{background:'#140f08',border:`1.5px solid ${r.dim}`,borderRadius:3,padding:'16px 12px',textAlign:'center',boxShadow:`0 0 20px ${r.dim}33`}}>
                <div style={{fontSize:22,marginBottom:6,color:r.col,textShadow:`0 0 12px ${r.col}`}}>{r.icon}</div>
                <div style={{fontFamily:"'Cinzel',serif",fontWeight:700,color:r.col,fontSize:12,letterSpacing:2,marginBottom:8}}>{role}</div>
                <div style={{color:'#5a4020',fontSize:11,lineHeight:1.6,fontStyle:'italic'}}>{r.goal}</div>
              </div>
            ))}
          </div>
          {/* Rules */}
          <div style={{background:'#140f08',border:'1.5px solid #2a1a08',borderRadius:3,padding:'16px 22px',maxWidth:420,width:'100%',margin:'0 auto 32px',textAlign:'left'}}>
            <div style={{fontFamily:"'Cinzel',serif",color:'#7a5020',fontSize:10,letterSpacing:3,marginBottom:10,textTransform:'uppercase'}}>— 规则要点 —</div>
            {[
              '游戏身份随机分配',
              '每人初始 HP / SAN 各 10，上限 10',
              '每回合开始摸 1 张牌，牌效果立即生效后收入手牌',
              '可发动身份技能或直接结束回合',
              '掉包与蛊惑每回合各限使用一次',
              '手牌上限 4 张，超出须在回合结束前弃牌',
            ].map((t,i)=>(
              <div key={i} style={{display:'flex',gap:8,marginBottom:6,alignItems:'flex-start'}}>
                <span style={{color:'#5a4020',fontSize:9,marginTop:2}}>✦</span>
                <span style={{color:'#c8a96e',fontSize:12,lineHeight:1.7,fontStyle:'italic'}}>{t}</span>
              </div>
            ))}
          </div>
          <button onClick={()=>setGs(initGame())} style={{
            padding:'13px 52px',
            background:'#1c1008',
            border:'2px solid #7a5020',
            color:'#c8a96e',
            fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:15,
            borderRadius:2,cursor:'pointer',letterSpacing:3,
            boxShadow:'0 0 30px #7a502044',
            textTransform:'uppercase',
            transition:'all .2s',
          }}>踏入黑暗</button>
        </div>
        <style>{GLOBAL_STYLES}</style>
      </div>
    );
  }

  // ── Game Over ──────────────────────────────────────────────
  if(gs.gameOver){
    const{winner,reason}=gs.gameOver;
    const myRole=gs.players[0].role;
    const iWon=winner===myRole;
    const isLose=winner==='LOSE';
    return(
      <div style={{minHeight:'100vh',background:'#0a0705',color:'#c8a96e',fontFamily:"'IM Fell English','Georgia',serif",display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',textAlign:'center',padding:24,position:'relative'}}>
        <div style={{position:'fixed',inset:0,background:'radial-gradient(ellipse at center,transparent 20%,#000000cc 100%)',pointerEvents:'none'}}/>
        <div style={{position:'relative',zIndex:1}}>
          <div style={{fontSize:72,marginBottom:14,filter:`drop-shadow(0 0 30px ${iWon?'#c8a96e':isLose?'#882020':'#9060cc'})`,animation:'animPop 0.4s ease-out'}}>{isLose?'☠':iWon?'✦':'⚔'}</div>
          <h2 style={{fontFamily:"'Cinzel Decorative','Cinzel',serif",fontSize:26,fontWeight:700,marginBottom:10,color:iWon?'#e8c87a':isLose?'#882020':'#a07090',textShadow:`0 0 30px ${iWon?'#c8a96e44':'#88202044'}`}}>
            {isLose?'英魂殒落':iWon?'胜利归你':'——  '+winner+'获胜  ——'}
          </h2>
          <div style={{width:180,height:1,background:'linear-gradient(90deg,transparent,#5a4020,transparent)',margin:'0 auto 12px'}}/>
          <p style={{color:'#7a6040',marginBottom:28,fontSize:13,fontStyle:'italic',maxWidth:340}}>{reason}</p>
          {/* Player results */}
          <div style={{display:'flex',gap:10,marginBottom:36,flexWrap:'wrap',justifyContent:'center'}}>
            {gs.players.map(p=>{
              const r=RINFO[p.role];
              return(
                <div key={p.id} style={{background:'#140f08',border:`1.5px solid ${r.dim}`,borderRadius:3,padding:'10px 14px',textAlign:'center',minWidth:76}}>
                  <div style={{fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:11,color:'#c8a96e',letterSpacing:1}}>{p.name}</div>
                  <div style={{fontSize:11,color:r.col,margin:'4px 0',fontFamily:"'Cinzel',serif",letterSpacing:1}}>{r.icon} {p.role}</div>
                  <div style={{fontSize:10,color:'#5a4020'}}>HP:{p.hp} SAN:{p.san}</div>
                  {p.isDead&&<div style={{fontSize:12,color:'#882020',marginTop:3}}>☠</div>}
                </div>
              );
            })}
          </div>
          <button onClick={()=>setGs(initGame())} style={{
            padding:'11px 40px',background:'#1c1008',border:'2px solid #5a3010',
            color:'#c8a96e',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:13,
            borderRadius:2,cursor:'pointer',letterSpacing:2,textTransform:'uppercase',
          }}>再次降临</button>
        </div>
        <style>{GLOBAL_STYLES}</style>
      </div>
    );
  }

  // ── Main Game ──────────────────────────────────────────────
  const me=gs.players[0];
  const myTurn=gs.currentTurn===0;
  const canWin=me.role==='寻宝者'&&isWinHand(me.hand);
  const phase=gs.phase;
  const ri=RINFO[me.role];
  const isBlocked=!!anim; // block all interaction during animation

  // ── Action handlers ────────────────────────────────────────
  function handleDrawConfirm(){setGs(p=>p?{...p,phase:'ACTION',drawReveal:null}:p);}

  function handleDrawSelectTarget(ti){
    const dr=gs.drawReveal;if(!dr)return;
    let P=copyPlayers(gs.players),D=[...gs.deck],Disc=[...gs.discard];
    const res=applyFx(dr.card,0,ti,P,D,Disc);
    P=res.P;D=res.D;Disc=res.Disc;P[0].hand.push(dr.card);
    const L=[...gs.log,`你摸到 [${dr.card.key}] ${dr.card.name}，目标→${gs.players[ti].name}`,...res.msgs];
    const win=checkWin(P);if(win){setGs({...gs,players:P,deck:D,discard:Disc,log:L,gameOver:win});return;}
    const newGs={...gs,players:P,deck:D,discard:Disc,log:L,phase:'ACTION',drawReveal:null,abilityData:{}};
    const ad=detectAnim(gs,newGs);
    if(ad)triggerAnim(ad.type,ad.msgs,newGs);else setGs(newGs);
  }

  function useAbility(){
    if(phase!=='ACTION'||isBlocked)return;
    if(me.role==='寻宝者')setGs({...gs,phase:'SWAP_SELECT_TARGET'});
    else if(me.role==='追猎者')setGs({...gs,phase:'HUNT_SELECT_TARGET'});
    else setGs({...gs,phase:'BEWITCH_SELECT_CARD'});
  }

  function swapSelectTarget(ti){
    if(!gs.players[ti].hand.length)return;
    let P=copyPlayers(gs.players);P[0].roleRevealed=true;
    const ri2=0|Math.random()*P[ti].hand.length;
    const taken=P[ti].hand.splice(ri2,1)[0];
    setGs({...gs,players:P,phase:'SWAP_GIVE_CARD',
      abilityData:{swapTi:ti,takenCard:taken},
      log:[...gs.log,`你（寻宝者）对 ${gs.players[ti].name} 【掉包】，暗抽了1张牌`]});
  }
  function swapGiveCard(idx){
    const{swapTi,takenCard}=gs.abilityData;
    let P=copyPlayers(gs.players);
    const given=P[0].hand.splice(idx,1)[0];
    P[0].hand.push(takenCard);P[swapTi].hand.push(given);
    const L=[...gs.log,`拿走 [${takenCard.key}]，还给 ${P[swapTi].name} [${given.key}]`];
    if(isWinHand(P[0].hand)){
      setGs({...gs,players:P,log:[...L,'你亮出获胜手牌！'],abilityData:{},
        gameOver:{winner:'寻宝者',reason:'你通过掉包集齐了全部编号！'}});
      return;
    }
    const win=checkWin(P);
    const newGs={...gs,players:P,log:L,abilityData:{},phase:'ACTION',skillUsed:true,...(win?{gameOver:win}:{})};
    triggerAnim('SKILL_SWAP',L.slice(-2),newGs);
  }

  function huntSelectTarget(ti){setGs({...gs,phase:'HUNT_REVEAL_CARD',abilityData:{huntTi:ti},log:[...gs.log,`你（追猎者）对 ${gs.players[ti].name} 发起【追捕】`]});}
  function huntRevealCard(tgtCardIdx){
    let P=copyPlayers(gs.players);P[0].roleRevealed=true;
    const rc=P[gs.abilityData.huntTi].hand[tgtCardIdx];
    setGs({...gs,players:P,phase:'HUNT_CONFIRM',abilityData:{...gs.abilityData,revCard:rc},
      log:[...gs.log,`亮出 ${P[gs.abilityData.huntTi].name} 的 [${rc.key}] ${rc.name}`]});
  }
  function huntConfirm(myCardIdx){
    const{huntTi,revCard}=gs.abilityData;
    let P=copyPlayers(gs.players),Disc=[...gs.discard];const L=[...gs.log];
    if(myCardIdx>=0){
      const dc=P[0].hand.splice(myCardIdx,1)[0];Disc.push(dc);
      P[huntTi].hp=clamp(P[huntTi].hp-2);L.push(`弃 [${dc.key}] → ${P[huntTi].name} 受 2HP 伤害`);
      if(P[huntTi].hp<=0){P[huntTi].isDead=true;L.push(`☠ ${P[huntTi].name} 倒下了！`);}
    }else L.push('放弃追捕');
    const win=checkWin(P);
    const newGs={...gs,players:P,discard:Disc,log:L,abilityData:{},phase:'ACTION',...(win?{gameOver:win}:{})};
    const ad=detectAnim(gs,newGs);
    if(ad)triggerAnim(ad.type,ad.msgs,newGs);else setGs(newGs);
  }

  function bewitchSelectCard(idx){
    const card=me.hand[idx];
    setGs({...gs,phase:'BEWITCH_SELECT_TARGET',abilityData:{bewitchCard:card,bewitchIdx:idx},
      log:[...gs.log,`你（邪祀者）准备【蛊惑】，赠 [${card.key}] ${card.name}`]});
  }
  function bewitchSelectTarget(ti){
    const{bewitchCard,bewitchIdx}=gs.abilityData;
    let P=copyPlayers(gs.players);P[0].roleRevealed=true;P[0].hand.splice(bewitchIdx,1);
    const L=[...gs.log,`你对 ${P[ti].name} 【蛊惑】，赠 [${bewitchCard.key}]`];
    const res=applyFx(bewitchCard,ti,ti,P,[...gs.deck],[...gs.discard]);L.push(...res.msgs);
    const win=checkWin(res.P);
    const newGs={...gs,players:res.P,deck:res.D,discard:res.Disc,log:L,abilityData:{},phase:'ACTION',skillUsed:true,...(win?{gameOver:win}:{})};
    const ad=detectAnim(gs,newGs);
    if(ad)triggerAnim(ad.type,ad.msgs,newGs);
    else triggerAnim('SKILL_BEWITCH',L.slice(-3),newGs);
  }

  // Multi-select discard
  function toggleDiscardSelect(idx){
    const prev=gs.abilityData.discardSelected||[];
    const maxSelect=me.hand.length-4;
    if(prev.includes(idx))setGs({...gs,abilityData:{...gs.abilityData,discardSelected:prev.filter(i=>i!==idx)}});
    else if(prev.length<maxSelect)setGs({...gs,abilityData:{...gs.abilityData,discardSelected:[...prev,idx]}});
  }
  function confirmDiscard(){
    const selected=gs.abilityData.discardSelected||[];if(!selected.length)return;
    let P=copyPlayers(gs.players);
    const sorted=[...selected].sort((a,b)=>b-a);const discarded=[];
    sorted.forEach(i=>{const c=P[0].hand.splice(i,1)[0];discarded.push(c);});
    const Disc=[...gs.discard,...discarded];
    const L=[...gs.log,`弃置：${discarded.map(c=>`[${c.key}]`).join(' ')}`];
    const newGs=P[0].hand.length>4
      ?{...gs,players:P,discard:Disc,log:L,abilityData:{discardSelected:[]}}
      :startNextTurn({...gs,players:P,discard:Disc,log:L,currentTurn:0,abilityData:{}});
    triggerAnim('DISCARD',L.slice(-1),newGs);
  }

  function endTurn(){
    if(isBlocked)return;
    if(me.hand.length>4){setGs({...gs,phase:'DISCARD_PHASE',abilityData:{discardSelected:[]}});return;}
    const newGs=startNextTurn({...gs,currentTurn:0});
    // Show DRAW_CARD animation before applying new state (which shows reveal modal)
    if(newGs.currentTurn===0&&newGs.drawReveal){
      triggerAnim('DRAW_CARD',[],newGs);
    }else setGs(newGs);
  }

  function cancelAction(){
    let ng={...gs,phase:'ACTION',abilityData:{}};
    if(gs.phase==='SWAP_GIVE_CARD'&&gs.abilityData.takenCard){
      let P=copyPlayers(gs.players);P[gs.abilityData.swapTi].hand.push(gs.abilityData.takenCard);
      ng={...ng,players:P};
    }
    setGs(ng);
  }

  function revealWin(){
    if(!canWin||isBlocked)return;
    setGs({...gs,players:gs.players.map((p,i)=>i===0?{...p,roleRevealed:true}:p),
      log:[...gs.log,'你亮出手牌，宣告胜利！'],
      gameOver:{winner:'寻宝者',reason:'你集齐了全部编号，寻宝者获胜！'}});
  }

  // Phase labels
  const phaseLabel={
    ACTION:               myTurn?'你的回合 — 可发动技能，或结束回合':'等候其他旅者…',
    DRAW_SELECT_TARGET:   `[${gs.drawReveal?.card?.key}] 需选定目标，请点击上方角色`,
    SWAP_SELECT_TARGET:   '【掉包】选择目标角色',
    SWAP_GIVE_CARD:       `暗抽到 [${gs.abilityData?.takenCard?.key}]，选一张手牌还给对方`,
    HUNT_SELECT_TARGET:   '【追捕】选择猎物',
    HUNT_REVEAL_CARD:     `选择亮出 ${gs.players[gs.abilityData?.huntTi??0]?.name} 的哪张牌`,
    HUNT_CONFIRM:         `[${gs.abilityData?.revCard?.key}] 已亮出！弃出匹配手牌以造成2HP，或放弃`,
    BEWITCH_SELECT_CARD:  '【蛊惑】选择要赠送的手牌',
    BEWITCH_SELECT_TARGET:`将赠 [${gs.abilityData?.bewitchCard?.key}]，点击蛊惑对象`,
    DISCARD_PHASE:(()=>{const sel=gs.abilityData.discardSelected||[];const need=me.hand.length-4;return`手牌超限 (${me.hand.length}/4) — 需弃 ${need} 张，已选 ${sel.length}/${need}`;})(),
    AI_TURN:`${gs.players[gs.currentTurn]?.name} 正在行动…`,
  }[phase]||'';

  const selectingOther=['DRAW_SELECT_TARGET','SWAP_SELECT_TARGET','HUNT_SELECT_TARGET','BEWITCH_SELECT_TARGET'].includes(phase);
  const cancelable=['SWAP_SELECT_TARGET','SWAP_GIVE_CARD','HUNT_SELECT_TARGET','HUNT_REVEAL_CARD','HUNT_CONFIRM','BEWITCH_SELECT_CARD','BEWITCH_SELECT_TARGET'].includes(phase);

  function handleAIClick(pi,cardIdx){
    if(gs.players[pi].isDead||isBlocked)return;
    if(phase==='DRAW_SELECT_TARGET')handleDrawSelectTarget(pi);
    else if(phase==='SWAP_SELECT_TARGET')swapSelectTarget(pi);
    else if(phase==='HUNT_SELECT_TARGET')huntSelectTarget(pi);
    else if(phase==='BEWITCH_SELECT_TARGET')bewitchSelectTarget(pi);
    else if(phase==='HUNT_REVEAL_CARD'&&gs.abilityData?.huntTi===pi&&cardIdx!=null)huntRevealCard(cardIdx);
  }
  function handleMyCardClick(idx){
    if(isBlocked)return;
    if(phase==='SWAP_GIVE_CARD')swapGiveCard(idx);
    else if(phase==='BEWITCH_SELECT_CARD')bewitchSelectCard(idx);
    else if(phase==='DISCARD_PHASE')toggleDiscardSelect(idx);
    else if(phase==='HUNT_CONFIRM'){const c=me.hand[idx],rc=gs.abilityData?.revCard;if(rc&&(c.letter===rc.letter||c.number===rc.number))huntConfirm(idx);}
  }
  function isMyCardClickable(c,idx){
    if(isBlocked)return false;
    if(phase==='SWAP_GIVE_CARD')return true;
    if(phase==='BEWITCH_SELECT_CARD')return true;
    if(phase==='DISCARD_PHASE'){const sel=gs.abilityData.discardSelected||[];const max=me.hand.length-4;return sel.includes(idx)||sel.length<max;}
    if(phase==='HUNT_CONFIRM'){const rc=gs.abilityData?.revCard;return!!(rc&&(c.letter===rc.letter||c.number===rc.number));}
    return false;
  }

  const skillLimited=gs.skillUsed&&ri.skillLimited;

  return(
    <div style={{minHeight:'100vh',background:'#0a0705',color:'#c8a96e',fontFamily:"'IM Fell English','Georgia',serif",display:'flex',flexDirection:'column',gap:7,padding:'8px 10px',position:'relative'}}>
      {/* Global vignette */}
      <div style={{position:'fixed',inset:0,background:'radial-gradient(ellipse at 50% 50%,transparent 40%,#00000099 100%)',pointerEvents:'none',zIndex:1}}/>

      {/* Animation overlay */}
      <AnimOverlay anim={anim} exiting={animExiting}/>

      {/* Modals */}
      {phase==='DRAW_REVEAL'&&gs.drawReveal&&<DrawRevealModal drawReveal={gs.drawReveal} onConfirm={handleDrawConfirm}/>}
      {phase==='DRAW_SELECT_TARGET'&&gs.drawReveal&&<DrawTargetBanner drawReveal={gs.drawReveal}/>}

      <div style={{position:'relative',zIndex:2,display:'flex',flexDirection:'column',gap:7,paddingTop:phase==='DRAW_SELECT_TARGET'?62:0,transition:'padding .18s'}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',gap:10,borderBottom:'1px solid #2a1a08',paddingBottom:6}}>
          <div style={{fontFamily:"'Cinzel Decorative','Cinzel',serif",fontSize:14,fontWeight:700,color:'#c8a96e',letterSpacing:2}}>克苏鲁卡牌对战</div>
          <span style={{marginLeft:'auto',fontFamily:"'Cinzel',serif",color:'#3a2510',fontSize:10,letterSpacing:1}}>牌堆:{gs.deck.length} · 弃牌:{gs.discard.length}</span>
        </div>

        {/* AI panels */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:7}}>
          {gs.players.slice(1).map((p,i)=>{
            const pi=i+1;
            const isSel=selectingOther&&!p.isDead&&!isBlocked;
            const showFaceUp=phase==='HUNT_REVEAL_CARD'&&gs.abilityData?.huntTi===pi;
            return(<PlayerPanel key={p.id} player={p} isCurrentTurn={gs.currentTurn===pi} isSelectable={isSel} showFaceUp={showFaceUp} onSelect={()=>handleAIClick(pi)} onCardSelect={showFaceUp?(ci2=>handleAIClick(pi,ci2)):null}/>);
          })}
        </div>

        {/* Middle: self info + log */}
        <div style={{display:'flex',gap:7}}>
          {/* Self panel */}
          <div style={{background:'#180f07',border:'1.5px solid #3a2510',borderRadius:3,padding:'12px 13px',width:155,flexShrink:0,display:'flex',flexDirection:'column',gap:9}}>
            <div>
              <div style={{fontFamily:"'Cinzel',serif",color:'#3a2510',fontSize:9,letterSpacing:2,marginBottom:3,textTransform:'uppercase'}}>你的身份</div>
              <div style={{fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:13,color:ri.col,textShadow:`0 0 12px ${ri.col}66`,letterSpacing:1}}>{ri.icon} {me.role}</div>
              <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#5a4020',fontSize:10,marginTop:4,lineHeight:1.6}}>{ri.goal}</div>
            </div>
            <div style={{borderTop:'1px solid #2a1a08',paddingTop:8}}>
              <StatBar label="HP"  val={me.hp}  color="#7a1515" trackColor="#1a0808"/>
              <StatBar label="SAN" val={me.san} color="#3a1078" trackColor="#120820"/>
            </div>
            {canWin&&(
              <button onClick={revealWin} style={{
                padding:'7px 4px',background:'#1c1208',border:'1.5px solid #c8a96e',
                color:'#e8c87a',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:11,
                borderRadius:2,cursor:'pointer',letterSpacing:1,
                boxShadow:'0 0 16px #c8a96e44',animation:'animGlow 1.5s ease-in-out infinite',
                textTransform:'uppercase',
              }}>✦ 亮牌获胜</button>
            )}
          </div>
          {/* Log */}
          <div ref={logRef} style={{flex:1,background:'#0e0904',border:'1.5px solid #2a1a08',borderRadius:3,padding:'8px 12px',overflowY:'auto',maxHeight:148}}>
            <div style={{fontFamily:"'Cinzel',serif",color:'#2a1a08',fontSize:9,letterSpacing:2,marginBottom:5,textTransform:'uppercase'}}>— 冒险日志 —</div>
            {gs.log.slice(-50).map((line,i)=>(
              <div key={i} style={{
                fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',
                fontSize:11.5,lineHeight:1.7,
                color:line.includes('──')?'#7a5020':
                      line.includes('☠')||line.includes('死')||line.includes('倒')?'#882020':
                      line.includes('获胜')||line.includes('集齐')?'#c8a96e':
                      line.includes('掉包')||line.includes('追捕')||line.includes('蛊惑')?'#8060a0':
                      '#5a4020',
                fontWeight:line.includes('──')?700:400,
              }}>{line}</div>
            ))}
          </div>
        </div>

        {/* Phase bar */}
        <div style={{
          background:'#120900',
          border:`1px solid ${myTurn&&!['AI_TURN'].includes(phase)?'#5a3010':'#2a1a08'}`,
          borderRadius:3,padding:'7px 14px',minHeight:38,
          display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',
        }}>
          <div style={{flex:1,fontFamily:"'Cinzel',serif",color:myTurn&&phase!=='AI_TURN'?'#a08040':'#3a2510',fontSize:11,letterSpacing:1}}>{phaseLabel}</div>
          {phase==='HUNT_CONFIRM'&&(
            <button onClick={()=>huntConfirm(-1)} style={smallBtnStyle}>放弃追捕</button>
          )}
          {cancelable&&(
            <button onClick={cancelAction} style={smallBtnStyle}>取消</button>
          )}
        </div>

        {/* Hand area */}
        <div style={{background:'#120900',border:`1.5px solid ${myTurn?'#3a2010':'#2a1a08'}`,borderRadius:3,padding:'11px 13px'}}>
          <div style={{display:'flex',alignItems:'center',marginBottom:9,gap:8}}>
            <span style={{fontFamily:"'Cinzel',serif",color:phase==='DISCARD_PHASE'?'#882020':'#3a2510',fontSize:10,letterSpacing:1}}>
              {phase==='DISCARD_PHASE'?`⚠ 手牌超限 (${me.hand.length}/4)`:`手牌 (${me.hand.length}/4)`}
            </span>
            {phase==='ACTION'&&myTurn&&!isBlocked&&(
              <div style={{display:'flex',gap:8,marginLeft:'auto',flexWrap:'wrap'}}>
                <button onClick={useAbility} disabled={skillLimited}
                  style={{
                    padding:'6px 16px',background:'#1c1208',
                    border:`1.5px solid ${skillLimited?'#3a2510':ri.col}`,
                    color:skillLimited?'#3a2510':ri.col,
                    fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:11,
                    borderRadius:2,cursor:skillLimited?'not-allowed':'pointer',letterSpacing:1,
                    boxShadow:skillLimited?'none':`0 0 10px ${ri.col}44`,
                    textTransform:'uppercase',opacity:skillLimited?0.4:1,
                    position:'relative',
                  }}>
                  {ri.icon} {ri.skillName}
                  {skillLimited&&<span style={{fontSize:9,marginLeft:4,color:'#5a3020'}}>(已用)</span>}
                </button>
                <button onClick={endTurn} style={{
                  padding:'6px 16px',background:'#180e08',
                  border:'1.5px solid #3a2510',color:'#5a4020',
                  fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:11,
                  borderRadius:2,cursor:'pointer',letterSpacing:1,textTransform:'uppercase',
                }}>结束回合</button>
              </div>
            )}
            {phase==='DISCARD_PHASE'&&(
              <button onClick={confirmDiscard}
                disabled={!(gs.abilityData.discardSelected||[]).length}
                style={{
                  marginLeft:'auto',padding:'6px 18px',
                  background:(gs.abilityData.discardSelected||[]).length?'#3a1008':'#180e08',
                  border:`1.5px solid ${(gs.abilityData.discardSelected||[]).length?'#882020':'#3a2510'}`,
                  color:(gs.abilityData.discardSelected||[]).length?'#dd6060':'#3a2510',
                  fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:11,
                  borderRadius:2,cursor:'pointer',letterSpacing:1,textTransform:'uppercase',
                  opacity:(gs.abilityData.discardSelected||[]).length?1:0.4,
                }}>
                确认弃牌{(gs.abilityData.discardSelected||[]).length>0?` (${(gs.abilityData.discardSelected||[]).length})`:''}</button>
            )}
          </div>
          <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
            {me.hand.map((c,i)=>{
              const clickable=isMyCardClickable(c,i);
              const isSel=phase==='DISCARD_PHASE'&&(gs.abilityData.discardSelected||[]).includes(i);
              const isMatch=phase==='HUNT_CONFIRM'&&gs.abilityData?.revCard&&(c.letter===gs.abilityData.revCard.letter||c.number===gs.abilityData.revCard.number);
              return(<DDCard key={c.id} card={c} onClick={clickable?()=>handleMyCardClick(i):undefined} disabled={!clickable} selected={isSel} highlight={isMatch}/>);
            })}
            {me.hand.length===0&&<div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#2a1a08',fontSize:13,padding:'22px 10px'}}>手中空空如也</div>}
          </div>
        </div>
      </div>
      <style>{GLOBAL_STYLES}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  STYLES
// ══════════════════════════════════════════════════════════════
const smallBtnStyle={
  padding:'4px 12px',background:'#180e08',
  border:'1px solid #3a2510',color:'#5a4020',
  fontFamily:"'Cinzel',serif",fontSize:10,borderRadius:2,cursor:'pointer',letterSpacing:1,
};

const GLOBAL_STYLES=`
  @import url('https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700&family=Cinzel:wght@400;600;700&family=IM+Fell+English:ital@0;1&display=swap');
  * { box-sizing:border-box; scrollbar-width:thin; scrollbar-color:#3a2510 #0a0705; }
  ::-webkit-scrollbar{width:5px;height:5px;}
  ::-webkit-scrollbar-track{background:#0a0705;}
  ::-webkit-scrollbar-thumb{background:#3a2510;border-radius:2px;}

  @keyframes animFadeIn  { from{opacity:0;transform:scale(0.96)} to{opacity:1;transform:scale(1)} }
  @keyframes animFadeOut { from{opacity:1;transform:scale(1)}    to{opacity:0;transform:scale(1.02)} }
  @keyframes animPop     { 0%{transform:scale(0.5);opacity:0} 60%{transform:scale(1.1)} 100%{transform:scale(1);opacity:1} }
  @keyframes animShake   { 0%,100%{transform:translateX(0) rotate(0)} 15%{transform:translateX(-10px) rotate(-3deg)} 35%{transform:translateX(12px) rotate(3deg)} 55%{transform:translateX(-8px) rotate(-2deg)} 75%{transform:translateX(8px) rotate(2deg)} }
  @keyframes animVig     { 0%,100%{opacity:0} 50%{opacity:1} }
  @keyframes animGlow    { 0%,100%{box-shadow:0 0 8px #c8a96e33} 50%{box-shadow:0 0 22px #c8a96e88} }
  @keyframes pulse       { 0%,100%{opacity:1} 50%{opacity:.65} }
`;
