import React from 'react';

function HorusEyeSVG() {
  return (
    <svg width="72" height="56" viewBox="0 0 84 64" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 29Q39 0 78 28Q42 53 6 29Z" fill="#171322" fillOpacity="0.7" />
      <path d="M10 17Q41 -2 74 16M40 40V60M43 43Q58 64 70 50M30 40L18 54" />
      <circle cx="43" cy="28" r="10" />
      <circle cx="43" cy="28" r="3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PaperCupSVG({glow}){
  return(
    <svg width="52" height="58" viewBox="0 0 52 58" style={{filter:`drop-shadow(0 2px 5px ${glow||'#92bdb5'})`}}>
      {/* Cup body — trapezoid: narrow at top (base), wide at bottom (open mouth) */}
      <polygon points="14,4 38,4 46,54 6,54"
        fill="#121d19" stroke="#b5c7b8" strokeWidth="1.5" strokeLinejoin="round"/>
      {/* Rim at bottom (open end) */}
      <ellipse cx="26" cy="54" rx="20" ry="4"
        fill="none" stroke="#b5c7b8" strokeWidth="2" />
      {/* Flat base at top */}
      <ellipse cx="26" cy="4" rx="12" ry="2.5"
        fill="#e1ddbc" stroke="#b5c7b8" strokeWidth="1.5" opacity="0.7"/>
      {/* Horizontal band lines on body */}
      <line x1="10" y1="22" x2="42" y2="22" stroke="#8e9f87" strokeWidth="1" opacity="0.55"/>
      <line x1="8"  y1="38" x2="44" y2="38" stroke="#8e9f87" strokeWidth="1" opacity="0.55"/>
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
        <PaperCupSVG glow="#92bdb5"/>
      </div>
      {/* Centre label */}
      <div style={{
        position:'relative',zIndex:1,
        fontFamily:"var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)",fontSize:14,letterSpacing:3,
        color:'#92bdb5',textShadow:'0 1px 4px #000',
        margin:'0 22px',
        animation:'swapLabelPop 0.3s ease-out 0.35s both',
      }}>⇌</div>
      {/* Right cup */}
      <div style={{position:'relative',zIndex:1,animation:'swapCupR 0.8s cubic-bezier(0.4,0,0.2,1) both'}}>
        <PaperCupSVG glow="#92bdb5"/>
      </div>
      {/* Action text */}
      {casterName&&targetName&&(
        <div style={{
          position:'absolute',bottom:'38%',left:0,right:0,
          textAlign:'center',zIndex:2,
          fontFamily:"var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)",
          fontSize:22,fontWeight:700,letterSpacing:4,
          color:'#92bdb5',
          textShadow:'0 2px 6px rgba(0,0,0,0.9)',
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
            borderTop:sy===-1?'1.5px solid rgba(195,114,90,0.92)':'none',
            borderLeft:sx===-1?'1.5px solid rgba(195,114,90,0.92)':'none',
            borderBottom:sy===1?'1.5px solid rgba(195,114,90,0.92)':'none',
            borderRight:sx===1?'1.5px solid rgba(195,114,90,0.92)':'none',
            boxShadow:'0 0 5px rgba(195,114,90,0.35)',
          }}/>
        ))}
        <div style={{
          position:'absolute',top:'50%',left:'50%',
          width:8,height:8,marginLeft:-4,marginTop:-4,
          borderRadius:'50%',
          background:'rgba(218,155,119,0.95)',
          boxShadow:'0 0 10px rgba(218,155,119,0.90)',
          animation:'huntDotPulse 0.25s ease-in-out 0.9s both',
        }}/>
        <div style={{position:'absolute',top:'50%',left:0,right:0,height:1,marginTop:-0.5,background:'rgba(195,114,90,0.50)'}}/>
        <div style={{position:'absolute',left:'50%',top:0,bottom:0,width:1,marginLeft:-0.5,background:'rgba(195,114,90,0.50)'}}/>
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
          color:'rgba(195,174,214,0.97)',
          textShadow:'0 2px 4px #000',
          filter:'drop-shadow(0 0 8px rgba(150,124,173,0.55))',
          animation:'bewitchEyePulse 0.28s ease-in-out 0.88s both',
          display:'inline-block',
          transformOrigin:'50% 50%',
        }}><HorusEyeSVG /></div>
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
          color:'rgba(195,174,214,0.7)',
          filter:'drop-shadow(0 0 14px rgba(150,124,173,0.5))',
          animation:'bewitchEyeGhost 0.65s ease-out 0.90s both',
          display:'inline-block',
          transformOrigin:'50% 50%',
          opacity:0,
        }}><HorusEyeSVG /></div>
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
              background:'radial-gradient(ellipse at 50% 50%,rgba(185,163,212,0.9) 0%,rgba(122,95,155,0.72) 36%,rgba(72,54,97,0.48) 65%,transparent 100%)',
              filter:'blur(6px)',
              '--tx':`${txPx}px`,'--ty':`${tyPx}px`,
              animation:`sanMistBolt 0.52s cubic-bezier(0.10,0,0.35,1) ${delay} both, sanMistMorph 0.45s ease-in-out ${delay} both`,
              zIndex:492,
            }}/>
            <div style={{
              position:'absolute',left:startX,top:startY,
              width:90,height:80,marginLeft:-45,marginTop:-40,
              background:'radial-gradient(ellipse at 50% 50%,rgba(159,130,183,0.45) 0%,rgba(98,74,125,0.28) 50%,transparent 80%)',
              filter:'blur(10px)',
              '--tx':`${txPx}px`,'--ty':`${tyPx}px`,
              animation:`sanMistBolt 0.52s cubic-bezier(0.10,0,0.35,1) calc(${delay} + 0.06s) both`,
              zIndex:491,
            }}/>
            <div style={{
              position:'absolute',left:startX,top:startY,
              width:80,height:70,marginLeft:-40,marginTop:-35,
              background:'radial-gradient(ellipse at 50% 50%,rgba(138,115,161,0.26) 0%,rgba(89,67,112,0.15) 50%,transparent 80%)',
              filter:'blur(14px)',
              '--tx':`${txPx}px`,'--ty':`${tyPx}px`,
              animation:`sanMistBolt 0.52s cubic-bezier(0.10,0,0.35,1) calc(${delay} + 0.12s) both`,
              zIndex:490,
            }}/>
            <div style={{
              position:'absolute',left:startX,top:startY,
              width:150,height:130,marginLeft:-75,marginTop:-65,
              background:'radial-gradient(circle,rgba(147,121,171,0.16) 0%,transparent 70%)',
              filter:'blur(18px)',
              '--tx':`${txPx}px`,'--ty':`${tyPx}px`,
              animation:`sanMistBolt 0.56s cubic-bezier(0.12,0,0.38,1) calc(${delay} + 0.08s) both`,
              zIndex:489,
            }}/>
            <div style={{
              position:'absolute',left:cx,top:cy,
              width:180,height:180,marginLeft:-90,marginTop:-90,
              borderRadius:'50%',
              background:'radial-gradient(circle,rgba(200,181,218,0.75) 0%,rgba(121,95,148,0.5) 32%,transparent 68%)',
              filter:'blur(12px)',
              animation:`sanMistImpact 0.30s ease-out ${hitDelay} both`,
              zIndex:493,
            }}/>
            <div style={{
              position:'absolute',left:cx,top:cy,
              width:20,height:20,marginLeft:-10,marginTop:-10,
              borderRadius:'50%',
              border:'3px solid rgba(192,170,209,0.8)',
              boxShadow:'0 0 12px rgba(148,120,174,0.45), inset 0 0 8px rgba(148,120,174,0.35)',
              animation:`sanMistShockwave 0.38s ease-out ${hitDelay} both`,
              zIndex:494,
            }}/>
            <div style={{
              position:'absolute',left:cx,top:cy,
              width:20,height:20,marginLeft:-10,marginTop:-10,
              borderRadius:'50%',
              border:'2px solid rgba(172,144,192,0.5)',
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
