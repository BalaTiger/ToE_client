import React, { useState, useEffect, useRef } from 'react';
import { CS, GOD_CS, RINFO } from '../../constants/card';

function GodResurrectionAnim({onDone}){
  const [textPhase, setTextPhase] = useState(0); // 0: black, 1: transitioning, 2: red with blood
  
  useEffect(()=>{
    // 文字动画时序：0.5秒后开始从黑变红，2秒后显示滴血效果
    const textTimer1 = setTimeout(() => setTextPhase(1), 500);
    const textTimer2 = setTimeout(() => setTextPhase(2), 2000);
    
    // 视频播放完成后自动调用onDone
    const videoElement=document.getElementById('god-resurrection-video');
    if(videoElement){
      videoElement.onended=()=>{
        onDone&&onDone();
      };
      
      // 8秒后如果视频还没结束，强制调用onDone（给视频足够播放时间）
      const timeoutId=setTimeout(()=>{
        onDone&&onDone();
      },8000);
      
      return()=>{
        clearTimeout(timeoutId);
        clearTimeout(textTimer1);
        clearTimeout(textTimer2);
      };
    }
  },[onDone]);
  
  // 文字颜色根据阶段变化
  const getTitleColor = () => {
    if (textPhase === 0) return '#1a0a0a';
    if (textPhase === 1) return '#5a1a1a';
    return '#c01030';
  };
  
  const getSubtitleColor = () => {
    if (textPhase === 0) return '#0a0505';
    if (textPhase === 1) return '#3a1010';
    return '#e03050';
  };
  
  return(
    <div style={{position:'fixed',inset:0,zIndex:4000,display:'flex',flexDirection:'column',
      alignItems:'center',justifyContent:'center',
      background:'rgba(0,0,0,0.95)',
      backdropFilter:'blur(2px)',
      animation:'animFadeIn 0.35s ease-out'}}>
      {/* 视频背景 */}
      <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
        <video 
          id="god-resurrection-video"
          src="/videos/ancient_god_tentacles.mp4" 
          autoPlay 
          muted
          playsInline
          style={{
            width:'100vw',
            height:'100vh',
            objectFit:'cover',
            filter:'brightness(0.7) contrast(1.2)'
          }}
        />
      </div>
      
      {/* 文字叠加 */}
      <div style={{position:'relative',zIndex:1,textAlign:'center',animation:'animFadeIn 0.5s 0.1s both'}}>
        <div 
          className={textPhase === 2 ? 'blood-drip-text' : ''}
          style={{
            fontFamily:"'Cinzel Decorative','Cinzel',serif",
            fontSize:48,
            fontWeight:700,
            letterSpacing:4,
            color:getTitleColor(),
            textShadow:textPhase === 2 ? '0 0 40px #b0306088, 0 4px 8px rgba(0,0,0,0.8)' : '0 0 40px #b0306088',
            marginBottom:16,
            animation:'animPop 0.8s ease-out',
            transition:'color 1.5s ease-in-out, text-shadow 0.5s ease',
            position:'relative'
          }}
        >
          ✦ 邪神复活 ✦
          {textPhase === 2 && (
            <>
              <span className="blood-drop" style={{left:'20%'}} />
              <span className="blood-drop" style={{left:'50%', animationDelay:'0.3s'}} />
              <span className="blood-drop" style={{left:'80%', animationDelay:'0.6s'}} />
            </>
          )}
        </div>
        <div style={{
          fontFamily:"'IM Fell English','Georgia',serif",
          fontStyle:'italic',
          color:getSubtitleColor(),
          fontSize:20,
          letterSpacing:1,
          textShadow:'0 0 20px #d0609066',
          animation:'animFadeIn 1s 0.5s both',
          transition:'color 1.5s ease-in-out'
        }}>
          邪祀者的献祭唤醒了古神！
        </div>
      </div>
    </div>
  );
}

// ── Treasure Map Win Animation (寻宝者 win, single unified impl) ─────────────
function TreasureMapAnim({hand,onConfirm}){
  // Compute the minimal ordered set of cards that covers all 4 letters AND 4 numbers
  const LETTERS_ALL=['A','B','C','D'],NUMS_ALL=[1,2,3,4];
  function pickWinCards(h){
    const nonGod=h.filter(c=>!c.isGod);
    const chosen=[];
    const ls=new Set(),ns=new Set();
    // Greedy: repeatedly pick card with most new coverage
    const rem=[...nonGod];
    while((ls.size<4||ns.size<4)&&rem.length){
      let bestIdx=0,bestScore=-1;
      rem.forEach((c,i)=>{
        const gain=(!ls.has(c.letter)?1:0)+(!ns.has(c.number)?1:0);
        if(gain>bestScore){bestScore=gain;bestIdx=i;}
      });
      const pick=rem.splice(bestIdx,1)[0];
      chosen.push(pick);
      ls.add(pick.letter);ns.add(pick.number);
    }
    return chosen;
  }
  const winCards=pickWinCards(hand);
  const N=winCards.length; // 4 to 8
  // Phase: 0=init, 1..N = card N flies in, N+1=all in (glow builds), N+2=flash, N+3=map revealed, N+4=button shown
  const [phase,setPhase]=useState(0);
  const [fired,setFired]=useState(false);
  useEffect(()=>{
    if(fired)return;setFired(true);
    const ts=[];
    let t=300;
    for(let i=1;i<=N;i++){const _i=i;ts.push(setTimeout(()=>setPhase(_i),t));t+=350;}
    ts.push(setTimeout(()=>setPhase(N+1),t));t+=800; // all assembled, glow
    ts.push(setTimeout(()=>setPhase(N+2),t));t+=500; // flash
    ts.push(setTimeout(()=>setPhase(N+3),t));t+=600; // map
    ts.push(setTimeout(()=>setPhase(N+4),t));        // button
    return()=>ts.forEach(clearTimeout);
  },[fired,N]);
  // Layout: cards in a grid, max 4 per row
  const COLS=Math.min(N,4),ROWS=Math.ceil(N/COLS);
  const CW=72,CH=96,GAP=8;
  const gridW=COLS*(CW+GAP)-GAP, gridH=ROWS*(CH+GAP)-GAP;
  // Scatter origins (8 corners/edges)
  const origins=[
    {x:-220,y:-170},{x:220,y:-170},{x:-220,y:170},{x:220,y:170},
    {x:0,y:-190},{x:0,y:190},{x:-200,y:0},{x:200,y:0},
  ];
  const allIn=phase>N;
  const glowing=phase===N+1;
  const flashing=phase===N+2;
  const mapRevealed=phase>=N+3;
  const btnVisible=phase>=N+4;
  return(
    <div style={{position:'fixed',inset:0,zIndex:4000,display:'flex',flexDirection:'column',
      alignItems:'center',justifyContent:'center',
      background:flashing?'rgba(255,240,200,0.92)':'rgba(4,3,1,0.92)',
      backdropFilter:'blur(2px)',transition:'background 0.35s ease',
      animation:'animFadeIn 0.35s ease-out'}}>
      <div style={{textAlign:'center',marginBottom:22,animation:'animFadeIn 0.5s 0.1s both'}}>
        <div style={{fontFamily:"'Cinzel Decorative','Cinzel',serif",fontSize:22,fontWeight:700,
          letterSpacing:4,color:'#c8a96e',textShadow:'0 0 40px #c8a96e88',marginBottom:6}}>
          ✦ 藏宝图已完整 ✦
        </div>
        <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',
          color:'#b89858',fontSize:13,letterSpacing:1}}>
          遗迹的秘密，尽在掌中
        </div>
      </div>
      {/* Card grid / Map area */}
      <div style={{position:'relative',width:gridW,height:gridH,marginBottom:32}}>
        {/* Glow overlay on grid */}
        {(glowing||flashing)&&(
          <div style={{position:'absolute',inset:-12,borderRadius:8,pointerEvents:'none',
            background:flashing?'rgba(255,240,180,0.85)':'rgba(200,169,110,0.10)',
            boxShadow:glowing?'0 0 60px #c8a96ecc, 0 0 120px #c8a96e66':
              flashing?'0 0 120px #fff8e0ff, 0 0 200px #ffffffcc':'none',
            transition:'all 0.5s ease',animation:glowing?'animPop 0.4s ease-out':undefined,
            zIndex:10}}/>
        )}
        {/* Cards */}
        {!mapRevealed&&winCards.map((card,i)=>{
          const col=i%COLS,row=Math.floor(i/COLS);
          const tx=col*(CW+GAP),ty=row*(CH+GAP);
          const arrived=phase>i;
          const orig=origins[i%origins.length];
          const s=CS[card.letter]||GOD_CS;
          return(
            <div key={card.id} style={{
              position:'absolute',left:tx,top:ty,width:CW,height:CH,
              transform:arrived?'translate(0,0)':`translate(${orig.x}px,${orig.y}px)`,
              opacity:arrived?1:0,
              transition:'transform 0.55s cubic-bezier(0.22,1.1,0.36,1), opacity 0.4s ease',
              borderRadius:5,background:s.bg,
              border:`1.5px solid ${allIn?'#c8a96e':s.borderBright}`,
              boxShadow:allIn?`0 0 14px #c8a96e99, 0 0 4px ${s.glow}`:`0 0 4px ${s.glow}`,
              display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
              transition2:'border-color 0.4s, box-shadow 0.4s',
            }}>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:20,fontWeight:700,
                color:s.text,textShadow:`0 0 10px ${s.glow}`}}>{card.letter}{card.number}</div>
              <div style={{fontSize:8,color:s.text,opacity:0.88,fontFamily:"'IM Fell English',serif",
                fontStyle:'italic',textAlign:'center',padding:'0 5px',marginTop:3,lineHeight:1.4}}>
                {card.name}
              </div>
            </div>
          );
        })}
        {/* Treasure map revealed */}
        {mapRevealed&&(
          <div style={{
            position:'absolute',inset:0,borderRadius:8,
            background:'linear-gradient(135deg,#3a2508 0%,#6b4010 35%,#8b5a18 55%,#5a3808 80%,#2a1804 100%)',
            border:'2px solid #c8a96e',
            boxShadow:'0 0 40px #c8a96e88, inset 0 0 30px rgba(0,0,0,0.6)',
            display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
            animation:'animPop 0.5s ease-out',
            overflow:'hidden',
          }}>
            {/* Map decorations */}
            <div style={{position:'absolute',inset:0,opacity:0.15,
              backgroundImage:'repeating-linear-gradient(0deg,transparent,transparent 18px,#c8a96e22 18px,#c8a96e22 19px),repeating-linear-gradient(90deg,transparent,transparent 18px,#c8a96e22 18px,#c8a96e22 19px)'}}/>
            <div style={{position:'absolute',top:8,left:12,right:12,bottom:8,
              border:'1px solid #c8a96e44',borderRadius:4,pointerEvents:'none'}}/>
            <div style={{fontSize:48,opacity:0.6,color:'#c8a96e',
              filter:'drop-shadow(0 0 10px #c8a96eaa)',marginBottom:6}}>✦</div>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:11,color:'#c8a96e',
              letterSpacing:3,opacity:0.8}}>TREASURE MAP</div>
            <div style={{marginTop:10,display:'flex',gap:5,flexWrap:'wrap',justifyContent:'center'}}>
              {['A1','B2','C3','D4'].map(k=>(
                <div key={k} style={{fontFamily:"'Cinzel',serif",fontSize:9,color:'#8a6020',
                  border:'1px solid #6a4010',borderRadius:2,padding:'1px 5px',background:'#1a0e04'}}>
                  {k}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {btnVisible&&(
        <button onClick={onConfirm}
          style={{padding:'12px 44px',background:'#1c1008',border:'2px solid #c8a96e',
            color:'#e8c87a',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:14,
            borderRadius:2,cursor:'pointer',letterSpacing:3,textTransform:'uppercase',
            boxShadow:'0 0 30px #c8a96e55',animation:'animPop 0.35s ease-out',
            transition:'all .2s'}}
          onMouseEnter={e=>{e.currentTarget.style.background='#2a1a08';e.currentTarget.style.boxShadow='0 0 50px #c8a96e88';}}
          onMouseLeave={e=>{e.currentTarget.style.background='#1c1008';e.currentTarget.style.boxShadow='0 0 30px #c8a96e55';}}
        >✦ 宣布胜利</button>
      )}
    </div>
  );
}

// ── Cthulhu Resurrection Animation (邪祀者 win) ─────────────
function CthulhuResurrectionAnim({onConfirm}){
  // Phase: 0=init, 1=darkness, 2=tentacles emerge, 3=cthulhu appears, 4=glow, 5=button shown
  const [phase,setPhase]=useState(0);
  const [fired,setFired]=useState(false);
  useEffect(()=>{
    if(fired)return;setFired(true);
    const ts=[];
    let t=300;
    ts.push(setTimeout(()=>setPhase(1),t));t+=1000; // darkness
    ts.push(setTimeout(()=>setPhase(2),t));t+=1200; // tentacles emerge
    ts.push(setTimeout(()=>setPhase(3),t));t+=1000; // cthulhu appears
    ts.push(setTimeout(()=>setPhase(4),t));t+=800;  // glow
    ts.push(setTimeout(()=>setPhase(5),t));        // button
    return()=>ts.forEach(clearTimeout);
  },[fired]);
  const darkness=phase>=1;
  const tentacles=phase>=2;
  const cthulhu=phase>=3;
  const glowing=phase>=4;
  const btnVisible=phase>=5;
  return(
    <div style={{position:'fixed',inset:0,zIndex:4000,display:'flex',flexDirection:'column',
      alignItems:'center',justifyContent:'center',
      background:darkness?'rgba(0,0,0,0.95)':'rgba(4,3,1,0.92)',
      backdropFilter:'blur(3px)',transition:'background 0.5s ease',
      animation:'animFadeIn 0.35s ease-out'}}>
      <div style={{textAlign:'center',marginBottom:32,animation:'animFadeIn 0.5s 0.1s both'}}>
        <div style={{fontFamily:"'Cinzel Decorative','Cinzel',serif",fontSize:22,fontWeight:700,
          letterSpacing:4,color:'#9060cc',textShadow:'0 0 40px #9060cc88',marginBottom:6}}>
          {phase===1?'✦ 黑暗降临 ✦':phase>=2?'✦ 邪神苏醒 ✦':'✦ 邪祀者获胜 ✦'}
        </div>
        <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',
          color:'#7040aa',fontSize:13,letterSpacing:1}}>
          {phase===1?'世界陷入黑暗...':phase>=2?'古老的存在正在苏醒...':'邪祀者的召唤成功了！'}
        </div>
      </div>
      
      {/* Cthulhu resurrection effect */}
      <div style={{position:'relative',width:300,height:300,marginBottom:32}}>
        {/* Tentacles */}
        {tentacles&&(
          <div style={{position:'absolute',inset:0}}>
            {[...Array(8)].map((_,i)=>{
              const angle=(i/8)*Math.PI*2;
              const x=Math.cos(angle)*120+150;
              const y=Math.sin(angle)*120+150;
              return(
                <div key={i} style={{
                  position:'absolute',left:x,top:y,width:40,height:120,
                  background:'linear-gradient(to top, #3a1a5a, #5a2a8a, #7a3aab)',
                  borderRadius:'50% 50% 20% 20%',
                  transformOrigin:'50% 100%',
                  transform:`translate(-50%, 0) rotate(${angle}rad) scaleY(0)`,
                  animation:`tentacleEmerge 1s ease-out ${i*0.1}s forwards`,
                  boxShadow:'0 0 20px #9060cc88',
                }}/>
              );
            })}
          </div>
        )}
        
        {/* Cthulhu head */}
        {cthulhu&&(
          <div style={{
            position:'absolute',left:'50%',top:'50%',
            transform:'translate(-50%, -50%) scale(0)',
            animation:'animPop 0.8s ease-out forwards',
            textAlign:'center',
          }}>
            <div style={{fontSize:120,filter:'drop-shadow(0 0 30px #9060ccaa)'}}>👁️</div>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:18,color:'#9060cc',
              textShadow:'0 0 20px #9060cc88',marginTop:10}}>克苏鲁</div>
          </div>
        )}
        
        {/* Glow */}
        {glowing&&(
          <div style={{position:'absolute',inset:-50,borderRadius:'50%',pointerEvents:'none',
            background:'radial-gradient(circle, rgba(144,96,204,0.2) 0%, rgba(58,26,90,0.1) 40%, rgba(0,0,0,0) 76%)',
            boxShadow:'0 0 80px #9060cc88, 0 0 160px #9060cc44',
            animation:'pulse 2s ease-in-out infinite',
          }}/>
        )}
      </div>
      
      {btnVisible&&(
        <button onClick={onConfirm}
          style={{padding:'12px 44px',background:'#1a0d2e',border:'2px solid #9060cc',
            color:'#c8a0e8',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:14,
            borderRadius:2,cursor:'pointer',letterSpacing:3,textTransform:'uppercase',
            boxShadow:'0 0 30px #9060cc55',animation:'animPop 0.35s ease-out',
            transition:'all .2s'}}
          onMouseEnter={e=>{e.currentTarget.style.background='#2a1a3e';e.currentTarget.style.boxShadow='0 0 50px #9060cc88';}}
          onMouseLeave={e=>{e.currentTarget.style.background='#1a0d2e';e.currentTarget.style.boxShadow='0 0 30px #9060cc55';}}
        >✦ 见证胜利</button>
      )}
    </div>
  );
}

// ── Master Anim Dispatcher ────────────────────────────────────
function AnimOverlay({anim,exiting}){
  if(!anim) return null;
  if(anim.type==='YOUR_TURN') return <YourTurnAnim name={anim.name}/>;
  if(anim.type==='DRAW_CARD') return <CardFlipAnim card={anim.card} triggerName={anim.triggerName} targetPid={anim.targetPid??0} exiting={exiting} skipTravel={!!anim.skipTravel}/>;
  if(anim.type==='DICE_ROLL') return <DiceRollAnim anim={anim} exiting={exiting}/>;
  if(anim.type==='DISCARD') return <DiscardMoveOverlay anim={anim} exiting={exiting}/>
  if(anim.type==='CARD_TRANSFER') return null; // rendered via cardTransfers state
  if(anim.type==='CAVE_DUEL') return <CaveDuelAnim anim={anim} exiting={exiting}/>;
  if(anim.type==='TURN_BOUNDARY_PAUSE') return null;
  if(['HP_DAMAGE','HP_HEAL','SAN_HEAL','SAN_DAMAGE'].includes(anim.type)) return null;
  return <GenericAnimOverlay anim={anim} exiting={exiting}/>;
}

// ── Role Reveal Animation (slot-machine, shown at every game start) ──────────
function RoleRevealAnim({role,onDone}){
  const [offset,setOffset]=useState(0);
  const onDoneRef=useRef(onDone);
  const ITEM_H=46, BEFORE=9;
  const ROLES_CYCLE=['寻宝者','追猎者','邪祀者','邪祀者','寻宝者','追猎者','寻宝者','邪祀者','追猎者'];
  const items=[...ROLES_CYCLE.slice(0,BEFORE),role];
  const ri=RINFO[role];
  useEffect(()=>{
    onDoneRef.current=onDone;
  },[onDone]);
  useEffect(()=>{
    const t1=setTimeout(()=>setOffset(-(BEFORE*ITEM_H)),120);
    const t2=setTimeout(()=>onDoneRef.current&&onDoneRef.current(),2500);
    return()=>{clearTimeout(t1);clearTimeout(t2);};
  },[]);
  return(
    <div style={{position:'fixed',inset:0,zIndex:3000,background:'linear-gradient(160deg,#060402 0%,#0e0804 100%)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',animation:'animFadeIn 0.3s ease-out'}}>
      <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at center,transparent 35%,#000000bb 100%)',pointerEvents:'none'}}/>
      <div style={{position:'relative',zIndex:1,textAlign:'center'}}>
        {/* Line 1 */}
        <div style={{fontFamily:"'Cinzel Decorative','Cinzel',serif",fontSize:26,fontWeight:700,letterSpacing:6,color:'#c8a96e',marginBottom:22,textShadow:'0 0 40px #c8a96e55',animation:'animFadeIn 0.5s 0.15s both'}}>
          探索开始
        </div>
        <div style={{width:180,height:1,background:'linear-gradient(90deg,transparent,#5a4020,transparent)',margin:'0 auto 26px',animation:'animFadeIn 0.5s 0.3s both'}}/>
        {/* Line 2: label + slot */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,animation:'animFadeIn 0.5s 0.4s both'}}>
          <span style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#b89858',fontSize:14,whiteSpace:'nowrap'}}>
            你本局的身份：
          </span>
          {/* Slot window */}
          <div style={{overflow:'hidden',height:ITEM_H,minWidth:108,background:'#080502',padding:'0 10px',display:'flex',alignItems:'flex-start'}}>
            <div style={{
              transform:`translateY(${offset}px)`,
              transition:offset===0?'none':`transform 2.0s cubic-bezier(0.04,0.0,0.1,1.0)`,
              willChange:'transform',
            }}>
              {items.map((r,i)=>{
                const rr=RINFO[r];
                const isTarget=i===BEFORE;
                return(
                  <div key={i} style={{height:ITEM_H,display:'flex',alignItems:'center',justifyContent:'center',gap:5,fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:15,letterSpacing:1,color:isTarget?ri.col:'#3a2810',textShadow:isTarget?`0 0 18px ${ri.col}99`:'none'}}>
                    <span>{rr.icon}</span><span>{r}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


export { GodResurrectionAnim, TreasureMapAnim, CthulhuResurrectionAnim, RoleRevealAnim };
