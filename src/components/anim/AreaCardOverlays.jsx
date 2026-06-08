import React, { useEffect } from 'react';
import { DDCard } from '../../components/cards';
import { _getZoomCompensatedRect, getPileAnchorCenter, getPlayerHandAnchorCenter } from '../../utils/dom';

function GeomagneticReversalAnim({anim,exiting}){
  const msgs=(anim?.msgs||[]).slice(-3);
  return(
    <div style={{
      position:'fixed',inset:0,zIndex:1200,pointerEvents:'none',overflow:'hidden',
      background:'radial-gradient(circle at 50% 45%, rgba(19,43,48,0.42), rgba(3,5,8,0.94) 72%)',
      animation:exiting?'animFadeOut 0.18s ease-in forwards':'animFadeIn 0.12s ease-out forwards',
    }}>
      <div className="geomagnetic-field geomagnetic-field-a"/>
      <div className="geomagnetic-field geomagnetic-field-b"/>
      <div className="geomagnetic-noise"/>
      <div className="geomagnetic-title">地磁反转</div>
      <div className="geomagnetic-compass">
        <div className="geomagnetic-compass-glow"/>
        <svg viewBox="-120 -120 240 240" width="240" height="240" className="geomagnetic-dial" aria-hidden="true">
          <defs>
            <radialGradient id="geomagneticDial" cx="50%" cy="48%" r="58%">
              <stop offset="0%" stopColor="#162c30"/>
              <stop offset="62%" stopColor="#0c171b"/>
              <stop offset="100%" stopColor="#030608"/>
            </radialGradient>
          </defs>
          <circle cx="0" cy="0" r="105" fill="url(#geomagneticDial)" stroke="#93f0dc" strokeWidth="2.2" opacity="0.92"/>
          <circle cx="0" cy="0" r="84" fill="none" stroke="#d6a84b" strokeWidth="1.2" opacity="0.72"/>
          <circle cx="0" cy="0" r="62" fill="none" stroke="#5eead4" strokeWidth="0.8" opacity="0.38"/>
          {Array.from({length:32}).map((_,i)=>(
            <line key={i} x1="0" y1="-96" x2="0" y2={i%4===0?'-82':'-88'} stroke={i%4===0?'#e8c87a':'#7dd3c7'} strokeWidth={i%4===0?2:1} opacity={i%4===0?0.92:0.52} transform={`rotate(${i*11.25})`}/>
          ))}
          {['N','E','S','W'].map((label,i)=>(
            <text key={label} x="0" y="-68" textAnchor="middle" fontFamily="Cinzel,serif" fontSize="18" fill={label==='N'?'#f87171':'#c8a96e'} transform={`rotate(${i*90})`}>{label}</text>
          ))}
        </svg>
        <svg viewBox="-88 -88 176 176" width="176" height="176" className="geomagnetic-needle" aria-hidden="true">
          <polygon points="0,-78 12,0 0,12 -12,0" fill="#ef4444" stroke="#ffd1d1" strokeWidth="1.2"/>
          <polygon points="0,78 12,0 0,-12 -12,0" fill="#60a5fa" stroke="#d5e7ff" strokeWidth="1.2"/>
          <circle cx="0" cy="0" r="12" fill="#0a0e12" stroke="#f1d68a" strokeWidth="2"/>
          <circle cx="0" cy="0" r="4" fill="#e8c87a"/>
        </svg>
      </div>
      {msgs.length>0&&(
        <div className="geomagnetic-msgs">
          {msgs.map((msg,i)=><div key={i}>{msg}</div>)}
        </div>
      )}
    </div>
  );
}

function GeomagneticRestoreShuffleAnim({anim,exiting}){
  const [path,setPath]=React.useState(null);
  useEffect(()=>{
    const measure=()=>{
      const from=getPlayerHandAnchorCenter(anim?.actorIdx??0);
      const to=getPileAnchorCenter('[data-discard-pile]',{x:window.innerWidth*0.35,y:window.innerHeight*0.50});
      setPath({
        left:from.x-42,
        top:from.y-59,
        '--gm-restore-tx':`${to.x-from.x}px`,
        '--gm-restore-ty':`${to.y-from.y}px`,
      });
    };
    requestAnimationFrame(()=>requestAnimationFrame(measure));
  },[anim?.actorIdx]);
  const msgs=(anim?.msgs||[]).slice(-3);
  return(
    <div className={`geomagnetic-restore-overlay${exiting?' geomagnetic-restore-exiting':''}`}>
      <div className="geomagnetic-restore-vignette"/>
      <div className="geomagnetic-restore-card" style={path||undefined}>
        <DDCard card={anim?.restoreCard||anim?.card||{name:'反转复原',key:'GMR',letter:'R',number:0,type:'geomagneticRestore'}} compact/>
      </div>
      <div className="geomagnetic-restore-ripple" style={path||undefined}/>
      {msgs.length>0&&(
        <div className="geomagnetic-msgs geomagnetic-restore-msgs">
          {msgs.map((msg,i)=><div key={i}>{msg}</div>)}
        </div>
      )}
    </div>
  );
}

function VolcanoAnim({anim,exiting}){
  const [impacts,setImpacts]=React.useState(null);
  useEffect(()=>{
    const measure=()=>{
      const deck=getPileAnchorCenter('[data-deck-pile]',{x:window.innerWidth*0.94-35,y:window.innerHeight*0.08});
      const discard=getPileAnchorCenter('[data-discard-pile]',{x:window.innerWidth*0.72,y:window.innerHeight*0.46});
      const hand=getPlayerHandAnchorCenter(0);
      const center={x:window.innerWidth*0.50,y:window.innerHeight*0.45};
      const raw=[
        {x:deck.x-38,y:deck.y+54,fromX:-window.innerWidth*0.55,fromY:-window.innerHeight*0.55,delay:0.10,scale:0.92,rot:-28},
        {x:center.x-165,y:center.y-48,fromX:-window.innerWidth*0.68,fromY:-window.innerHeight*0.44,delay:0.22,scale:0.74,rot:-22},
        {x:discard.x+30,y:discard.y+18,fromX:window.innerWidth*0.48,fromY:-window.innerHeight*0.58,delay:0.34,scale:0.84,rot:30},
        {x:center.x+145,y:center.y-88,fromX:window.innerWidth*0.62,fromY:-window.innerHeight*0.42,delay:0.46,scale:0.68,rot:24},
        {x:hand.x-132,y:Math.min(window.innerHeight-112,hand.y-42),fromX:-window.innerWidth*0.54,fromY:-window.innerHeight*0.34,delay:0.58,scale:0.78,rot:-18},
        {x:center.x+15,y:center.y+78,fromX:window.innerWidth*0.16,fromY:-window.innerHeight*0.62,delay:0.70,scale:0.64,rot:8},
        {x:hand.x+112,y:Math.min(window.innerHeight-96,hand.y-26),fromX:window.innerWidth*0.54,fromY:-window.innerHeight*0.36,delay:0.82,scale:0.82,rot:34},
      ];
      setImpacts(raw.map((p,idx)=>({
        ...p,
        x:Math.max(54,Math.min(window.innerWidth-54,p.x)),
        y:Math.max(76,Math.min(window.innerHeight-54,p.y)),
        seed:idx,
      })));
    };
    requestAnimationFrame(()=>requestAnimationFrame(measure));
  },[]);
  const msgs=(anim?.msgs||[]).slice(-3);
  const meteorImpacts=impacts||[
    {x:'72vw',y:'25vh',fromX:'-58vw',fromY:'-55vh',delay:0.1,scale:0.9,rot:-28,seed:0},
    {x:'42vw',y:'42vh',fromX:'-60vw',fromY:'-40vh',delay:0.28,scale:0.74,rot:-22,seed:1},
    {x:'66vw',y:'52vh',fromX:'48vw',fromY:'-58vh',delay:0.46,scale:0.82,rot:26,seed:2},
    {x:'50vw',y:'68vh',fromX:'18vw',fromY:'-62vh',delay:0.64,scale:0.66,rot:8,seed:3},
  ];
  return(
    <div className={`volcano-overlay${exiting?' volcano-exiting':''}`}>
      <div className="volcano-vignette"/>
      <div className="volcano-shake-layer">
        {meteorImpacts.map((impact,idx)=>(
          <div
            key={idx}
            className="volcano-impact"
            style={{
              left:typeof impact.x==='number'?`${impact.x}px`:impact.x,
              top:typeof impact.y==='number'?`${impact.y}px`:impact.y,
              '--volcano-from-x':typeof impact.fromX==='number'?`${impact.fromX}px`:impact.fromX,
              '--volcano-from-y':typeof impact.fromY==='number'?`${impact.fromY}px`:impact.fromY,
              '--volcano-delay':`${impact.delay}s`,
              '--volcano-scale':impact.scale,
              '--volcano-rot':`${impact.rot}deg`,
              '--volcano-lava-rot':`${(impact.seed%2?1:-1)*(5+impact.seed*2)}deg`,
            }}
          >
            <div className="volcano-meteor">
              <div className="volcano-meteor-tail"/>
              <div className="volcano-meteor-rock"/>
            </div>
            <div className="volcano-impact-flash"/>
            <div className="volcano-lava-field">
              <svg viewBox="-120 -90 240 180" width="240" height="180" aria-hidden="true">
                <path className="volcano-lava-shape volcano-lava-outer" d="M-104,-4 C-86,-54 -33,-71 11,-54 C55,-88 118,-42 101,13 C122,51 64,86 20,62 C-19,92 -95,58 -77,22 C-123,17 -134,-17 -104,-4Z"/>
                <path className="volcano-lava-shape volcano-lava-inner" d="M-58,0 C-44,-26 -12,-32 14,-20 C37,-42 70,-15 61,16 C72,36 32,53 5,37 C-17,55 -57,32 -46,12 C-72,11 -78,-8 -58,0Z"/>
                <path className="volcano-crack" d="M-86,4 C-50,-8 -34,12 -7,2 C20,-8 43,-2 72,-18"/>
                <path className="volcano-crack volcano-crack-b" d="M-38,38 C-19,22 -1,29 20,17 C41,5 54,12 83,4"/>
              </svg>
            </div>
            <div className="volcano-embers">
              {Array.from({length:8}).map((_,i)=>(
                <span key={i} style={{
                  '--ember-x':`${(i%4-1.5)*(16+idx*1.5)}px`,
                  '--ember-y':`${-28-Math.floor(i/4)*24}px`,
                  '--ember-delay':`${impact.delay+0.5+i*0.025}s`,
                }}/>
              ))}
            </div>
          </div>
        ))}
      </div>
      {msgs.length>0&&(
        <div className="volcano-msgs">
          {msgs.map((msg,i)=><div key={i}>{msg}</div>)}
        </div>
      )}
    </div>
  );
}

function CaveDuelAnim({anim,exiting}){
  const {sourceIdx,targetIdx,sourceCard,targetCard,winnerIdx}=anim||{};
  const [pts,setPts]=React.useState(null);
  useEffect(()=>{
    const measure=()=>{
      const srcEl=document.querySelector(`[data-pid="${sourceIdx}"]`);
      const tgtEl=document.querySelector(`[data-pid="${targetIdx}"]`);
      const srcR=_getZoomCompensatedRect(srcEl);
      const tgtR=_getZoomCompensatedRect(tgtEl);
      const centerX=window.innerWidth/2;
      const centerY=window.innerHeight*0.44;
      const srcX=srcR?srcR.left+srcR.width/2:centerX-180;
      const srcY=srcR?srcR.top+srcR.height*0.7:centerY+80;
      const tgtX=tgtR?tgtR.left+tgtR.width/2:centerX+180;
      const tgtY=tgtR?tgtR.top+tgtR.height*0.7:centerY+80;
      const winnerEl=winnerIdx!=null?document.querySelector(`[data-pid="${winnerIdx}"]`):null;
      const winnerR=_getZoomCompensatedRect(winnerEl);
      const winX=winnerR?winnerR.left+winnerR.width/2:(winnerIdx===sourceIdx?srcX:(winnerIdx===targetIdx?tgtX:centerX));
      const winY=winnerR?winnerR.top+winnerR.height*0.72:(winnerIdx===sourceIdx?srcY:(winnerIdx===targetIdx?tgtY:centerY+120));
      setPts({centerX,centerY,srcX,srcY,tgtX,tgtY,winX,winY});
    };
    requestAnimationFrame(()=>requestAnimationFrame(measure));
  },[sourceIdx,targetIdx,winnerIdx]);
  if(!anim||!pts)return null;
  const makeStyle=(fromX,fromY,midX,midY,toX,toY,delay=0)=>({
    position:'absolute',
    left:pts.centerX-36,
    top:pts.centerY-52,
    width:72,
    height:104,
    '--fromX':`${fromX}px`,
    '--fromY':`${fromY}px`,
    '--midX':`${midX}px`,
    '--midY':`${midY}px`,
    '--toX':`${toX}px`,
    '--toY':`${toY}px`,
    animation:`caveDuelCardPath 2.35s cubic-bezier(.2,.7,.2,1) ${delay}s both`,
  });
  const srcFromX=pts.srcX-pts.centerX;
  const srcFromY=pts.srcY-pts.centerY;
  const tgtFromX=pts.tgtX-pts.centerX;
  const tgtFromY=pts.tgtY-pts.centerY;
  const srcToX=(winnerIdx==null?pts.srcX:pts.winX)-pts.centerX-24;
  const srcToY=(winnerIdx==null?pts.srcY:pts.winY)-pts.centerY;
  const tgtToX=(winnerIdx==null?pts.tgtX:pts.winX)-pts.centerX+24;
  const tgtToY=(winnerIdx==null?pts.tgtY:pts.winY)-pts.centerY;
  const srcNum=sourceCard?.isGod?0:(sourceCard?.number||0);
  const tgtNum=targetCard?.isGod?0:(targetCard?.number||0);
  const winnerLabel=winnerIdx==null?'平局':winnerIdx===sourceIdx?'左侧胜出':'右侧胜出';
  return(
    <div style={{
      position:'fixed',inset:0,zIndex:1200,pointerEvents:'none',
      background:'radial-gradient(circle at 50% 45%, rgba(40,24,8,0.25), rgba(0,0,0,0.78))',
      animation:exiting?'animFadeOut 0.18s ease-in forwards':'animFadeIn 0.12s ease-out forwards',
    }}>
      <div style={{position:'absolute',left:'50%',top:'14%',transform:'translateX(-50%)',textAlign:'center'}}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:16,letterSpacing:3,color:'#d8b66a',textShadow:'0 0 12px #d8b66a88'}}>── 穴居人战争 ──</div>
        <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',fontSize:13,color:'#c8a96e',marginTop:8,opacity:.92}}>{winnerLabel}</div>
      </div>
      <div style={{position:'absolute',left:pts.centerX-70,top:pts.centerY-10,width:140,height:56,borderRadius:'50%',background:'radial-gradient(circle, #2c1a0acc 0%, #12090400 72%)',filter:'blur(4px)',opacity:.85}}/>
      <div style={makeStyle(srcFromX,srcFromY,-56,-10,srcToX,srcToY,0)}>
        <DDCard card={sourceCard} compact/>
      </div>
      <div style={makeStyle(tgtFromX,tgtFromY,56,-10,tgtToX,tgtToY,0.04)}>
        <DDCard card={targetCard} compact/>
      </div>
      <div style={{position:'absolute',left:pts.centerX-118,top:pts.centerY+56,width:92,textAlign:'center',fontFamily:"'Cinzel',serif",fontSize:26,color:'#e8c87a',opacity:0,animation:'caveDuelScorePop 1.1s ease-out .9s forwards'}}>{srcNum}</div>
      <div style={{position:'absolute',left:pts.centerX+26,top:pts.centerY+56,width:92,textAlign:'center',fontFamily:"'Cinzel',serif",fontSize:26,color:'#e8c87a',opacity:0,animation:'caveDuelScorePop 1.1s ease-out .95s forwards'}}>{tgtNum}</div>
      <div style={{position:'absolute',left:'50%',top:`${pts.centerY+48}px`,transform:'translateX(-50%)',fontSize:34,opacity:0,animation:'caveDuelVsPop 1s ease-out .82s forwards'}}>⚔</div>
      {winnerIdx!=null&&(
        <div style={{
          position:'absolute',
          left:winnerIdx===sourceIdx?pts.centerX-92:pts.centerX+52,
          top:pts.centerY-70,
          fontSize:28,
          opacity:0,
          animation:'caveDuelDancePop 1.1s ease-out 1.38s forwards',
          filter:'drop-shadow(0 0 10px #f0d080aa)',
        }}>🕺</div>
      )}
    </div>
  );
}

export { CaveDuelAnim, GeomagneticReversalAnim, GeomagneticRestoreShuffleAnim, VolcanoAnim };
