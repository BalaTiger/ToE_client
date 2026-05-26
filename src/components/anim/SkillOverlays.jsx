import React from 'react';

function PaperCupSVG({glow}){
  return(
    <svg width="52" height="58" viewBox="0 0 52 58" style={{filter:`drop-shadow(0 0 10px ${glow||'#40c8f8'})`}}>
      {/* Cup body — trapezoid: narrow at top (base), wide at bottom (open mouth) */}
      <polygon points="14,4 38,4 46,54 6,54"
        fill="none" stroke="#a8d8f0" strokeWidth="2.2" strokeLinejoin="round"/>
      {/* Rim at bottom (open end) */}
      <ellipse cx="26" cy="54" rx="20" ry="4"
        fill="none" stroke="#a8d8f0" strokeWidth="2" />
      {/* Flat base at top */}
      <ellipse cx="26" cy="4" rx="12" ry="2.5"
        fill="#c8eaf8" stroke="#a8d8f0" strokeWidth="1.5" opacity="0.7"/>
      {/* Horizontal band lines on body */}
      <line x1="10" y1="22" x2="42" y2="22" stroke="#6ab8d8" strokeWidth="1" opacity="0.55"/>
      <line x1="8"  y1="38" x2="44" y2="38" stroke="#6ab8d8" strokeWidth="1" opacity="0.55"/>
    </svg>
  );
}
function SwapCupOverlay({active,casterName,targetName}){
  if(!active)return null;
  return(
    <div style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:600,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{position:'absolute',inset:0,background:'rgba(2,8,14,0.72)',animation:'swapBgFade 0.8s ease both'}}/>
      {/* Left cup */}
      <div style={{position:'relative',zIndex:1,animation:'swapCupL 0.8s cubic-bezier(0.4,0,0.2,1) both'}}>
        <PaperCupSVG glow="#40c8f8"/>
      </div>
      {/* Centre label */}
      <div style={{
        position:'relative',zIndex:1,
        fontFamily:"'Cinzel',serif",fontSize:14,letterSpacing:3,
        color:'#40c8f8',textShadow:'0 0 12px #40c8f8',
        margin:'0 22px',
        animation:'swapLabelPop 0.3s ease-out 0.35s both',
      }}>⇌</div>
      {/* Right cup */}
      <div style={{position:'relative',zIndex:1,animation:'swapCupR 0.8s cubic-bezier(0.4,0,0.2,1) both'}}>
        <PaperCupSVG glow="#40c8f8"/>
      </div>
      {/* Action text */}
      {casterName&&targetName&&(
        <div style={{
          position:'absolute',bottom:'38%',left:0,right:0,
          textAlign:'center',zIndex:2,
          fontFamily:"'Noto Serif SC','Cinzel',serif",
          fontSize:22,fontWeight:700,letterSpacing:4,
          color:'#40c8f8',
          textShadow:'0 0 18px #40c8f8, 0 2px 8px rgba(0,0,0,0.9)',
          animation:'swapLabelPop 0.35s ease-out 0.15s both',
        }}>{(casterName||'').replace(/（.*?）/g,'')}（寻宝者）对 {targetName} 掉包中…</div>
      )}
    </div>
  );
}

// ── Hunt Scope Overlay ────────────────────────────────────────
// Receives exact pixel coords measured from actual DOM panel position.
function HuntScopeOverlay({active,cx,cy}){
  if(!active)return null;
  // cx, cy are the exact viewport pixel centre of the target panel
  // Vignette centre tracks the target so the darkening focus matches the reticle
  const vx=cx!=null?(cx/window.innerWidth*100).toFixed(1)+'%':'50%';
  const vy=cy!=null?(cy/window.innerHeight*100).toFixed(1)+'%':'50%';
  return(
    <div style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:600}}>
      {/* Crimson vignette — centred on target, not screen centre */}
      <div style={{
        position:'absolute',inset:0,
        background:`radial-gradient(ellipse at ${vx} ${vy}, transparent 28%, rgba(60,0,0,0.55) 62%, rgba(15,0,0,0.88) 100%)`,
        animation:'huntVigFade 1.2s ease both',
      }}/>
      {/* Scope frame — starts offset from centre, wobbles, then locks dead-centre */}
      <div style={{
        position:'absolute',
        left:cx,top:cy,
        width:110,height:110,
        marginLeft:-55,marginTop:-55,
        animation:'huntScopeMove 1.2s ease-out both',
      }}>
        {[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx,sy],ci)=>(
          <div key={ci} style={{
            position:'absolute',
            left:sx===-1?0:'auto',right:sx===1?0:'auto',
            top:sy===-1?0:'auto',bottom:sy===1?0:'auto',
            width:22,height:22,
            borderTop:sy===-1?'2.5px solid rgba(220,40,40,0.92)':'none',
            borderLeft:sx===-1?'2.5px solid rgba(220,40,40,0.92)':'none',
            borderBottom:sy===1?'2.5px solid rgba(220,40,40,0.92)':'none',
            borderRight:sx===1?'2.5px solid rgba(220,40,40,0.92)':'none',
            boxShadow:'0 0 8px rgba(220,40,40,0.70)',
          }}/>
        ))}
        <div style={{
          position:'absolute',top:'50%',left:'50%',
          width:8,height:8,marginLeft:-4,marginTop:-4,
          borderRadius:'50%',
          background:'rgba(255,50,50,0.95)',
          boxShadow:'0 0 10px rgba(255,50,50,0.90)',
          animation:'huntDotPulse 0.25s ease-in-out 0.9s both',
        }}/>
        <div style={{position:'absolute',top:'50%',left:0,right:0,height:1,marginTop:-0.5,background:'rgba(220,40,40,0.50)'}}/>
        <div style={{position:'absolute',left:'50%',top:0,bottom:0,width:1,marginLeft:-0.5,background:'rgba(220,40,40,0.50)'}}/>
      </div>
    </div>
  );
}

// ── Bewitch Eye Overlay — Hunt-style scope with Horus eye ────────
function BewitchEyeOverlay({active,cx,cy}){
  if(!active)return null;
  const vx=cx!=null?(cx/window.innerWidth*100).toFixed(1)+'%':'50%';
  const vy=cy!=null?(cy/window.innerHeight*100).toFixed(1)+'%':'50%';
  return(
    <div style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:600}}>
      {/* Vignette centred on target */}
      <div style={{
        position:'absolute',inset:0,
        background:`radial-gradient(ellipse at ${vx} ${vy}, transparent 28%, rgba(40,0,60,0.55) 62%, rgba(8,0,18,0.88) 100%)`,
        animation:'huntVigFade 1.2s ease both',
      }}/>
      {/* Horus eye — tracks to target centre, same motion as hunt scope */}
      <div style={{
        position:'absolute',
        left:cx,top:cy,
        width:110,height:110,
        marginLeft:-55,marginTop:-55,
        display:'flex',alignItems:'center',justifyContent:'center',
        animation:'huntScopeMove 1.2s ease-out both',
      }}>
        <div style={{
          fontSize:64,lineHeight:1,
          color:'rgba(200,100,255,0.97)',
          textShadow:'0 0 20px rgba(180,60,255,1), 0 0 40px rgba(140,30,255,0.70)',
          filter:'drop-shadow(0 0 12px rgba(200,80,255,0.90))',
          animation:'bewitchEyePulse 0.28s ease-in-out 0.88s both',
          display:'inline-block',
          transformOrigin:'50% 50%',
        }}>𓂀</div>
      </div>
      {/* Ghost echo — stationary at target centre, spawns when eye locks, expands and fades */}
      <div style={{
        position:'absolute',
        left:cx,top:cy,
        width:110,height:110,
        marginLeft:-55,marginTop:-55,
        display:'flex',alignItems:'center',justifyContent:'center',
        pointerEvents:'none',
      }}>
        <div style={{
          fontSize:64,lineHeight:1,
          color:'rgba(220,120,255,0.85)',
          filter:'drop-shadow(0 0 28px rgba(180,60,255,0.80))',
          animation:'bewitchEyeGhost 0.65s ease-out 0.90s both',
          display:'inline-block',
          transformOrigin:'50% 50%',
          opacity:0,
        }}>𓂀</div>
      </div>
    </div>
  );
}

// ── SanMistOverlay: DOM-measured targeting ──────────────────────
// SanMistOverlay accepts pre-measured positions from parent useEffect
// (same timing pattern as SKILL_HUNT / SKILL_BEWITCH — avoids grid-layout race)
function SanMistOverlay({targets}){
  if(!targets||!targets.length)return null;
  return(
    <div style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:490,overflow:'hidden'}}>
      {targets.map(({pi,cx,cy,startX,startY,animKey},boltIdx)=>{
        const txPx=cx-startX;
        const tyPx=cy-startY;
        const delay=(boltIdx*0.07).toFixed(2)+'s';
        const hitDelay=(boltIdx*0.07+0.46).toFixed(2)+'s';
        return(
          <React.Fragment key={animKey||pi}>
            <div style={{
              position:'absolute',left:startX,top:startY,
              width:100,height:90,marginLeft:-50,marginTop:-45,
              background:'radial-gradient(ellipse at 50% 50%,rgba(240,120,255,1) 0%,rgba(170,40,250,0.92) 36%,rgba(120,10,210,0.60) 65%,transparent 100%)',
              filter:'blur(6px)',
              '--tx':`${txPx}px`,'--ty':`${tyPx}px`,
              animation:`sanMistBolt 0.52s cubic-bezier(0.10,0,0.35,1) ${delay} both, sanMistMorph 0.45s ease-in-out ${delay} both`,
              zIndex:492,
            }}/>
            <div style={{
              position:'absolute',left:startX,top:startY,
              width:90,height:80,marginLeft:-45,marginTop:-40,
              background:'radial-gradient(ellipse at 50% 50%,rgba(210,80,255,0.55) 0%,rgba(140,20,230,0.30) 50%,transparent 80%)',
              filter:'blur(10px)',
              '--tx':`${txPx}px`,'--ty':`${tyPx}px`,
              animation:`sanMistBolt 0.52s cubic-bezier(0.10,0,0.35,1) calc(${delay} + 0.06s) both`,
              zIndex:491,
            }}/>
            <div style={{
              position:'absolute',left:startX,top:startY,
              width:80,height:70,marginLeft:-40,marginTop:-35,
              background:'radial-gradient(ellipse at 50% 50%,rgba(185,60,255,0.30) 0%,rgba(120,0,210,0.15) 50%,transparent 80%)',
              filter:'blur(14px)',
              '--tx':`${txPx}px`,'--ty':`${tyPx}px`,
              animation:`sanMistBolt 0.52s cubic-bezier(0.10,0,0.35,1) calc(${delay} + 0.12s) both`,
              zIndex:490,
            }}/>
            <div style={{
              position:'absolute',left:startX,top:startY,
              width:150,height:130,marginLeft:-75,marginTop:-65,
              background:'radial-gradient(circle,rgba(180,50,255,0.18) 0%,transparent 70%)',
              filter:'blur(18px)',
              '--tx':`${txPx}px`,'--ty':`${tyPx}px`,
              animation:`sanMistBolt 0.56s cubic-bezier(0.12,0,0.38,1) calc(${delay} + 0.08s) both`,
              zIndex:489,
            }}/>
            <div style={{
              position:'absolute',left:cx,top:cy,
              width:180,height:180,marginLeft:-90,marginTop:-90,
              borderRadius:'50%',
              background:'radial-gradient(circle,rgba(240,100,255,0.88) 0%,rgba(155,30,235,0.60) 32%,transparent 68%)',
              filter:'blur(12px)',
              animation:`sanMistImpact 0.30s ease-out ${hitDelay} both`,
              zIndex:493,
            }}/>
            <div style={{
              position:'absolute',left:cx,top:cy,
              width:20,height:20,marginLeft:-10,marginTop:-10,
              borderRadius:'50%',
              border:'3px solid rgba(220,90,255,0.90)',
              boxShadow:'0 0 12px rgba(200,60,255,0.70), inset 0 0 8px rgba(200,60,255,0.50)',
              animation:`sanMistShockwave 0.38s ease-out ${hitDelay} both`,
              zIndex:494,
            }}/>
            <div style={{
              position:'absolute',left:cx,top:cy,
              width:20,height:20,marginLeft:-10,marginTop:-10,
              borderRadius:'50%',
              border:'2px solid rgba(200,70,255,0.55)',
              animation:`sanMistShockwave 0.42s ease-out calc(${hitDelay} + 0.06s) both`,
              zIndex:493,
            }}/>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export { PaperCupSVG, SwapCupOverlay, HuntScopeOverlay, BewitchEyeOverlay, SanMistOverlay };
