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
      const from={x:window.innerWidth*0.50,y:window.innerHeight*0.45};
      const to=getPileAnchorCenter('[data-discard-pile]',{x:window.innerWidth*0.72,y:window.innerHeight*0.46});
      setPath({
        left:from.x-42,
        top:from.y-59,
        '--gm-restore-tx':`${to.x-from.x}px`,
        '--gm-restore-ty':`${to.y-from.y}px`,
      });
    };
    requestAnimationFrame(()=>requestAnimationFrame(measure));
  },[]);
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
  const canvasRef=React.useRef(null);
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
  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas||!impacts?.length)return undefined;
    const ctx=canvas.getContext('2d');
    let raf=0;
    const dpr=Math.min(window.devicePixelRatio||1,2);
    const resize=()=>{
      const w=window.innerWidth;
      const h=window.innerHeight;
      canvas.style.width=`${w}px`;
      canvas.style.height=`${h}px`;
      canvas.width=Math.floor(w*dpr);
      canvas.height=Math.floor(h*dpr);
      ctx.setTransform(dpr,0,0,dpr,0,0);
    };
    const rand=seed=>{
      let x=Math.sin(seed*127.1+311.7)*43758.5453;
      return x-Math.floor(x);
    };
    const easeOutQuad=x=>1-(1-x)*(1-x);
    const clamp01=x=>Math.max(0,Math.min(1,x));
    const specs=impacts.map((impact,idx)=>{
      const x=typeof impact.x==='number'?impact.x:window.innerWidth*(parseFloat(impact.x)||50)/100;
      const y=typeof impact.y==='number'?impact.y:window.innerHeight*(parseFloat(impact.y)||50)/100;
      const fromX=typeof impact.fromX==='number'?impact.fromX:window.innerWidth*(parseFloat(impact.fromX)||0)/100;
      const fromY=typeof impact.fromY==='number'?impact.fromY:window.innerHeight*(parseFloat(impact.fromY)||0)/100;
      const seed=impact.seed??idx;
      const scale=impact.scale||1;
      const fall=0.68+rand(seed+4)*0.16;
      const delay=impact.delay||0;
      const debris=Array.from({length:18},(_,i)=>{
        const a=-Math.PI*0.95+rand(seed*31+i)*Math.PI*1.9;
        const speed=(42+rand(seed*67+i)*96)*scale;
        return {
          a,
          speed,
          size:1.6+rand(seed*83+i)*4.8,
          life:0.42+rand(seed*109+i)*0.62,
          color:rand(seed*127+i)>.42?'#ff9a22':'#ffd26d',
        };
      });
      const smoke=Array.from({length:16},(_,i)=>({
        ox:(rand(seed*151+i)-0.5)*48*scale,
        oy:(rand(seed*163+i)-0.5)*28*scale,
        vx:(rand(seed*181+i)-0.5)*44*scale,
        vy:-(18+rand(seed*191+i)*58)*scale,
        r:14+rand(seed*211+i)*34,
        life:0.7+rand(seed*229+i)*0.82,
      }));
      const lava=Array.from({length:28},(_,i)=>{
        const a=(i/28)*Math.PI*2;
        return {
          a,
          r:0.68+rand(seed*241+i)*0.58,
        };
      });
      const noise=Array.from({length:64},(_,i)=>({
        x:(rand(seed*263+i)-0.5)*1.95,
        y:(rand(seed*281+i)-0.5)*1.18,
        r:0.02+rand(seed*307+i)*0.065,
        a:0.08+rand(seed*313+i)*0.18,
      }));
      return {
        ...impact,
        x,
        y,
        startX:x+fromX,
        startY:y+fromY,
        delay,
        fall,
        impactAt:delay+fall,
        scale,
        seed,
        debris,
        smoke,
        lava,
        noise,
      };
    });
    const drawGlow=(x,y,r,color,alpha=1)=>{
      const g=ctx.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,`rgba(${color},${alpha})`);
      g.addColorStop(0.34,`rgba(${color},${alpha*0.42})`);
      g.addColorStop(1,`rgba(${color},0)`);
      ctx.fillStyle=g;
      ctx.beginPath();
      ctx.arc(x,y,r,0,Math.PI*2);
      ctx.fill();
    };
    const drawLavaPool=(impact,age)=>{
      const grow=clamp01(age/0.24);
      const fade=1-clamp01((age-0.52)/1.18);
      if(fade<=0)return;
      const baseR=(54+impact.seed*4+18*rand(impact.seed+20))*impact.scale;
      const r=baseR*(0.36+0.92*easeOutQuad(grow))*(1-0.34*clamp01((age-0.58)/1.05));
      const makeLavaPath=(radius, xScale=1.38, yScale=0.78, wobble=1)=>{
        ctx.beginPath();
        impact.lava.forEach((pt,i)=>{
          const rr=radius*pt.r*(1+0.08*wobble*Math.sin(age*9+i));
          const px=Math.cos(pt.a)*rr*xScale;
          const py=Math.sin(pt.a)*rr*yScale;
          if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
        });
        ctx.closePath();
      };
      ctx.save();
      ctx.translate(impact.x,impact.y);
      ctx.rotate((impact.seed%2?-1:1)*(0.12+age*0.18));
      ctx.globalAlpha=fade;
      for(let layer=5;layer>=1;layer--){
        makeLavaPath(r*(1+layer*0.09),1.4+layer*0.015,0.8+layer*0.01,0.45);
        ctx.fillStyle=`rgba(255,${70+layer*18},18,${0.03*fade*(6-layer)})`;
        ctx.fill();
      }
      makeLavaPath(r);
      const outerGrad=ctx.createRadialGradient(0,0,r*0.12,0,0,r*1.45);
      outerGrad.addColorStop(0,'rgba(58,8,4,0.98)');
      outerGrad.addColorStop(0.42,'rgba(96,18,5,0.94)');
      outerGrad.addColorStop(0.78,'rgba(186,47,8,0.78)');
      outerGrad.addColorStop(1,'rgba(255,144,34,0.26)');
      ctx.fillStyle=outerGrad;
      ctx.fill();
      ctx.lineWidth=(8+3*Math.sin(age*8))*impact.scale;
      ctx.strokeStyle=`rgba(255,130,28,${0.14*fade})`;
      ctx.stroke();
      ctx.save();
      ctx.clip();
      impact.noise.forEach(n=>{
        const nx=n.x*r*0.78;
        const ny=n.y*r*0.54;
        const dist=Math.sqrt((nx/(r*1.2))**2+(ny/(r*0.72))**2);
        if(dist>1)return;
        const flicker=0.65+0.35*Math.sin(age*12+n.x*9+n.y*7);
        ctx.globalAlpha=n.a*fade*flicker;
        ctx.fillStyle=dist<0.42?'rgba(28,5,3,1)':'rgba(255,104,18,1)';
        ctx.beginPath();
        ctx.ellipse(nx,ny,n.r*r*(1.4-dist*0.5),n.r*r*(0.6+dist*0.3),n.x*2.2,0,Math.PI*2);
        ctx.fill();
      });
      ctx.restore();
      makeLavaPath(r*(0.42+0.08*Math.sin(age*9)),1.18,0.58,1.1);
      const innerGrad=ctx.createRadialGradient(0,0,0,0,0,r*0.72);
      innerGrad.addColorStop(0,`rgba(46,5,3,${0.88*fade})`);
      innerGrad.addColorStop(0.45,`rgba(91,13,4,${0.72*fade})`);
      innerGrad.addColorStop(0.82,`rgba(255,82,12,${0.44*fade})`);
      innerGrad.addColorStop(1,`rgba(255,212,86,${0.22*fade})`);
      ctx.fillStyle=innerGrad;
      ctx.fill();
      ctx.strokeStyle=`rgba(255,231,126,${0.18*fade})`;
      ctx.lineWidth=3.2*impact.scale;
      ctx.stroke();
      ctx.restore();
    };
    const drawMeteor=(impact,time)=>{
      const local=time-impact.delay;
      if(local<0||local>impact.fall)return;
      const p=clamp01(local/impact.fall);
      const accelP=0.18*p+0.82*p*p;
      const x=impact.startX+(impact.x-impact.startX)*accelP;
      const y=impact.startY+(impact.y-impact.startY)*accelP;
      const prevP=clamp01((local-0.05)/impact.fall);
      const prevAccelP=0.18*prevP+0.82*prevP*prevP;
      const px=impact.startX+(impact.x-impact.startX)*prevAccelP;
      const py=impact.startY+(impact.y-impact.startY)*prevAccelP;
      const angle=Math.atan2(y-py,x-px);
      const speedScale=0.64+0.78*Math.min(1,p*1.18);
      ctx.save();
      ctx.translate(x,y);
      ctx.rotate(angle);
      const tailLen=(180+80*impact.scale)*speedScale;
      const tailGrad=ctx.createLinearGradient(-tailLen,0,10,0);
      tailGrad.addColorStop(0,'rgba(60,25,18,0)');
      tailGrad.addColorStop(0.28,'rgba(132,54,25,0.16)');
      tailGrad.addColorStop(0.68,'rgba(255,78,18,0.46)');
      tailGrad.addColorStop(1,'rgba(255,225,122,0.95)');
      ctx.globalCompositeOperation='lighter';
      ctx.fillStyle=tailGrad;
      ctx.beginPath();
      ctx.ellipse(-tailLen*0.5,0,tailLen*0.52,18*impact.scale,0,0,Math.PI*2);
      ctx.fill();
      ctx.fillStyle='rgba(64,40,35,0.22)';
      for(let i=0;i<6;i++){
        const jitter=(rand(impact.seed*331+i)-0.5)*38*impact.scale;
        ctx.beginPath();
        ctx.ellipse(-tailLen*(0.18+i*0.12),jitter,42+rand(impact.seed+i)*45,10+rand(impact.seed*17+i)*15,0,0,Math.PI*2);
        ctx.fill();
      }
      const coreR=(18+8*impact.scale)*(1-0.22*p);
      drawGlow(0,0,coreR*3.4,'255,96,20',0.58);
      const coreGrad=ctx.createRadialGradient(-coreR*0.28,-coreR*0.34,1,0,0,coreR);
      coreGrad.addColorStop(0,'#fff0a6');
      coreGrad.addColorStop(0.28,'#ff8f1e');
      coreGrad.addColorStop(0.66,'#5b210b');
      coreGrad.addColorStop(1,'#140805');
      ctx.fillStyle=coreGrad;
      ctx.beginPath();
      for(let i=0;i<9;i++){
        const a=(i/9)*Math.PI*2;
        const rr=coreR*(0.78+rand(impact.seed*401+i)*0.34);
        const vx=Math.cos(a)*rr;
        const vy=Math.sin(a)*rr;
        if(i===0)ctx.moveTo(vx,vy);else ctx.lineTo(vx,vy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    const drawImpact=(impact,time)=>{
      const age=time-impact.impactAt;
      if(age<0)return;
      if(age<0.26){
        const f=1-clamp01(age/0.26);
        drawGlow(impact.x,impact.y,(120+190*(1-f))*impact.scale,'255,225,128',0.9*f);
        drawGlow(impact.x,impact.y,(62+148*(1-f))*impact.scale,'255,74,12',0.72*f);
      }
      drawLavaPool(impact,age);
      impact.debris.forEach((d,i)=>{
        if(age>d.life)return;
        const p=age/d.life;
        const x=impact.x+Math.cos(d.a)*d.speed*p;
        const y=impact.y+Math.sin(d.a)*d.speed*p+90*p*p;
        ctx.globalAlpha=(1-p)*0.95;
        ctx.fillStyle=d.color;
        ctx.beginPath();
        ctx.arc(x,y,d.size*(1-p*0.5),0,Math.PI*2);
        ctx.fill();
      });
      impact.smoke.forEach((s,i)=>{
        if(age>s.life)return;
        const p=age/s.life;
        const x=impact.x+s.ox+s.vx*p;
        const y=impact.y+s.oy+s.vy*p-12*Math.sin(p*Math.PI);
        ctx.globalAlpha=(1-p)*0.26;
        ctx.fillStyle='rgba(95,74,62,1)';
        ctx.beginPath();
        ctx.ellipse(x,y,s.r*(0.55+p),s.r*(0.28+p*0.44),0,0,Math.PI*2);
        ctx.fill();
      });
      ctx.globalAlpha=1;
    };
    const started=performance.now();
    const render=now=>{
      const time=(now-started)/1000;
      const w=window.innerWidth;
      const h=window.innerHeight;
      ctx.clearRect(0,0,w,h);
      ctx.globalCompositeOperation='source-over';
      ctx.fillStyle='rgba(30,7,2,0.08)';
      ctx.fillRect(0,0,w,h);
      const shake=specs.reduce((sum,impact)=>{
        const age=time-impact.impactAt;
        if(age<0||age>0.22)return sum;
        return sum+(1-age/0.22)*impact.scale;
      },0);
      ctx.save();
      if(shake>0)ctx.translate(Math.sin(time*178)*shake*5.8,Math.cos(time*151)*shake*4.2);
      specs.forEach(impact=>drawMeteor(impact,time));
      specs.forEach(impact=>drawImpact(impact,time));
      ctx.restore();
      if(time<2.7&&!exiting)raf=requestAnimationFrame(render);
    };
    resize();
    window.addEventListener('resize',resize);
    raf=requestAnimationFrame(render);
    return()=>{
      cancelAnimationFrame(raf);
      window.removeEventListener('resize',resize);
    };
  },[impacts,exiting]);
  return(
    <div className={`volcano-overlay${exiting?' volcano-exiting':''}`}>
      <div className="volcano-vignette"/>
      <canvas ref={canvasRef} className="volcano-canvas" aria-hidden="true"/>
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
