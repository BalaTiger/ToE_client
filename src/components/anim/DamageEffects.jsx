/* eslint-disable react-hooks/purity */
// ^ Angle randomization for guillotine animation is decorative visual noise.
//   Moving it out of render requires either a complex cache key scheme or
//   a PRNG, neither of which is worth the churn for a transient overlay.
import React from 'react';
import { buildPublicUrl } from '../../utils/url';
import {
  createEffectNoiseOrigin,
  createEffectNoiseSampler,
  loadEffectImage,
  loadEffectNoiseTexture,
} from './effectNoise';

const LIMESTONE_TEXTURE_URL = buildPublicUrl('/img/effects/limestone_texture.png');
const PETRIFY_DISSOLVE_SECONDS = 2.18;

function PanelSnapshotImage({src,w,h,top=0,filter,opacity=1}){
  return(
    <img
      src={src}
      alt=""
      draggable={false}
      style={{
        position:'absolute',
        left:0,
        top,
        width:w,
        height:h,
        maxWidth:'none',
        maxHeight:'none',
        display:'block',
        pointerEvents:'none',
        userSelect:'none',
        filter,
        opacity,
      }}
    />
  );
}

function PanelSliceBackground({target,top=0,height='100%',borderRadius=0}){
  return(
    <div style={{
      position:'absolute',
      left:0,
      top,
      width:'100%',
      height,
      background:target.panelBackground||'rgba(24,15,7,0.96)',
      border:`1.5px solid ${target.panelBorderColor||'rgba(58,37,16,0.86)'}`,
      boxShadow:target.panelBoxShadow||'inset 0 0 16px rgba(200,169,110,0.08)',
      borderRadius,
      boxSizing:'border-box',
      pointerEvents:'none',
    }}/>
  );
}

function makePetrifyCracks(target, variant){
  const cx=target.w/2;
  const cy=target.h/2;
  return Array.from({length:6},(_,i)=>{
    const angle=variant.phaseA+i*1.07;
    const len=(0.18+((i*17)%9)/100)*Math.min(target.w,target.h);
    const start=0.18+((i*13)%11)/100;
    const sx=cx+Math.cos(angle)*target.w*start;
    const sy=cy+Math.sin(angle)*target.h*start;
    const mx=sx+Math.cos(angle+0.28*Math.sin(i+variant.phaseB))*len*0.55;
    const my=sy+Math.sin(angle+0.28*Math.sin(i+variant.phaseB))*len*0.55;
    const ex=sx+Math.cos(angle+0.42*Math.cos(i+variant.phaseC))*len;
    const ey=sy+Math.sin(angle+0.42*Math.cos(i+variant.phaseC))*len;
    return `${sx.toFixed(1)},${sy.toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`;
  });
}

function smoothstep(edge0,edge1,value){
  const t=Math.max(0,Math.min(1,(value-edge0)/(edge1-edge0)));
  return t*t*(3-2*t);
}

function PetrifyPolarCanvas({target,variant,cracks}){
  const canvasRef=React.useRef(null);

  React.useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas)return undefined;
    let disposed=false;
    let frameId=0;
    const mountedAt=performance.now();

    Promise.all([
      target.snapshotUrl?loadEffectImage(target.snapshotUrl):Promise.resolve(null),
      loadEffectImage(LIMESTONE_TEXTURE_URL),
      loadEffectNoiseTexture(),
    ]).then(([snapshot,limestone,noiseTexture])=>{
      if(disposed)return;
      const width=Math.max(1,Math.round(target.w));
      const height=Math.max(1,Math.round(target.h));
      canvas.width=width;
      canvas.height=height;
      const ctx=canvas.getContext('2d');
      const stoneCanvas=document.createElement('canvas');
      stoneCanvas.width=width;
      stoneCanvas.height=height;
      const stoneCtx=stoneCanvas.getContext('2d');

      // Neutral limestone is the base; the blue/slate wash is deliberately subtle.
      stoneCtx.fillStyle='#777b80';
      stoneCtx.fillRect(0,0,width,height);
      if(snapshot){
        stoneCtx.save();
        stoneCtx.globalAlpha=0.78;
        stoneCtx.filter='grayscale(0.82) saturate(0.32) brightness(0.82) contrast(1.18)';
        stoneCtx.drawImage(snapshot,0,0,width,height);
        stoneCtx.restore();
      }
      stoneCtx.save();
      stoneCtx.globalAlpha=0.54;
      stoneCtx.globalCompositeOperation='overlay';
      stoneCtx.drawImage(limestone,-variant.grainX,-variant.grainY,Math.max(width*2.2,320),Math.max(height*2.2,320));
      stoneCtx.restore();
      stoneCtx.fillStyle='rgba(63,72,88,0.18)';
      stoneCtx.fillRect(0,0,width,height);
      const shade=stoneCtx.createRadialGradient(width*0.5,height*0.46,0,width*0.5,height*0.5,Math.max(width,height)*0.68);
      shade.addColorStop(0,'rgba(222,224,225,0.18)');
      shade.addColorStop(0.58,'rgba(102,107,116,0.12)');
      shade.addColorStop(1,'rgba(30,35,44,0.48)');
      stoneCtx.fillStyle=shade;
      stoneCtx.fillRect(0,0,width,height);
      cracks.forEach((points,lineIdx)=>{
        const coords=points.split(' ').map(pair=>pair.split(',').map(Number));
        stoneCtx.beginPath();
        coords.forEach(([x,y],pointIdx)=>pointIdx?stoneCtx.lineTo(x,y):stoneCtx.moveTo(x,y));
        stoneCtx.strokeStyle=lineIdx%2?'rgba(205,208,211,0.30)':'rgba(35,39,47,0.66)';
        stoneCtx.lineWidth=lineIdx%2?0.85:1.35;
        stoneCtx.lineCap='round';
        stoneCtx.lineJoin='round';
        stoneCtx.stroke();
      });

      const stonePixels=stoneCtx.getImageData(0,0,width,height).data;
      const output=ctx.createImageData(width,height);
      const sampler=createEffectNoiseSampler(noiseTexture,{
        origin:createEffectNoiseOrigin(`petrify-${target.pi}-${variant.noiseSeed}`),
        scale:1,
        velocity:{x:0,y:0},
      });
      const cx=width*0.5;
      const cy=height*0.5;
      const rx=width*0.53;
      const ry=height*0.55;
      const feather=3.2/Math.max(1,Math.min(rx,ry));
      const pixelCount=width*height;
      const radii=new Float32Array(pixelCount);
      const polarNoise=new Float32Array(pixelCount);
      const angularSampleCount=1024;
      const angularNoise=new Float32Array(angularSampleCount);
      let noiseMin=Infinity;
      let noiseMax=-Infinity;
      for(let i=0;i<angularSampleCount;i+=1){
        const u=i/angularSampleCount;
        const coarse=sampler.sample(u,0.22+variant.noiseV,0).b;
        const detail=sampler.sample(u,0.59+variant.noiseV,0).r;
        const value=coarse*0.68+detail*0.32;
        angularNoise[i]=value;
        noiseMin=Math.min(noiseMin,value);
        noiseMax=Math.max(noiseMax,value);
      }
      const noiseRange=Math.max(0.001,noiseMax-noiseMin);
      for(let i=0;i<angularSampleCount;i+=1){
        angularNoise[i]=((angularNoise[i]-noiseMin)/noiseRange)*2-1;
      }
      const sampleAngularNoise=u=>{
        const wrappedU=u-Math.floor(u);
        const noisePosition=wrappedU*angularSampleCount;
        const noiseIndex=Math.floor(noisePosition)%angularSampleCount;
        const nextNoiseIndex=(noiseIndex+1)%angularSampleCount;
        const noiseMix=noisePosition-Math.floor(noisePosition);
        return angularNoise[noiseIndex]*(1-noiseMix)+angularNoise[nextNoiseIndex]*noiseMix;
      };
      for(let y=0;y<height;y+=1){
        const ny=(y+0.5-cy)/ry;
        for(let x=0;x<width;x+=1){
          const nx=(x+0.5-cx)/rx;
          const pixel=y*width+x;
          const radius=Math.hypot(nx,ny);
          // One full turn maps continuously to noise U 0..1. The sampler wraps its
          // texture edge, so 360 degrees joins 0 degrees without a polygon seam.
          const angleU=(Math.atan2(ny,nx)+Math.PI)/(Math.PI*2);
          radii[pixel]=radius;
          polarNoise[pixel]=sampleAngularNoise(angleU);
        }
      }

      let patchState=(variant.noiseSeed>>>0)||1;
      const patchRandom=()=>{
        patchState=(Math.imul(patchState,1664525)+1013904223)>>>0;
        return patchState/4294967296;
      };
      const patchCount=4+(variant.noiseSeed%3);
      const patches=Array.from({length:patchCount},(_,patchIndex)=>{
        const centerAngle=patchRandom()*Math.PI*2;
        const centerRadius=0.12+patchRandom()*0.43;
        const centerX=Math.cos(centerAngle)*centerRadius;
        const centerY=Math.sin(centerAngle)*centerRadius;
        const start=0.16+patchIndex*0.055+patchRandom()*0.07;
        return {
          centerX,
          centerY,
          start,
          end:Math.min(0.88,start+0.38+patchRandom()*0.16),
          maxRadius:0.22+patchRandom()*0.16,
          noiseOffset:patchRandom(),
          field:new Float32Array(pixelCount),
        };
      });
      patches.forEach(patch=>{
        for(let y=0;y<height;y+=1){
          const ny=(y+0.5-cy)/ry;
          for(let x=0;x<width;x+=1){
            const nx=(x+0.5-cx)/rx;
            const dx=nx-patch.centerX;
            const dy=ny-patch.centerY;
            const localAngleU=(Math.atan2(dy,dx)+Math.PI)/(Math.PI*2);
            const edgeNoise=sampleAngularNoise(localAngleU+patch.noiseOffset);
            const effectiveRadius=patch.maxRadius*(1+edgeNoise*0.30);
            patch.field[y*width+x]=Math.hypot(dx,dy)/Math.max(0.001,effectiveRadius);
          }
        }
      });
      const startedAt=mountedAt;

      const render=now=>{
        if(disposed)return;
        const linear=Math.min(1,(now-startedAt)/(PETRIFY_DISSOLVE_SECONDS*1000));
        const progress=smoothstep(0,1,linear);
        const baseRadius=1.62*(1-progress);
        const noiseEnvelope=smoothstep(0,0.12,progress)*(1-smoothstep(0.82,1,progress));
        const noiseAmplitude=0.34*noiseEnvelope;
        for(let pixel=0;pixel<pixelCount;pixel+=1){
          const radius=radii[pixel];
          const boundary=baseRadius+polarNoise[pixel]*noiseAmplitude;
          // The stone layer grows from the noisy outer contour toward the centre.
          let alpha=linear>=1?1:smoothstep(boundary-feather,boundary+feather,radius);
          let edge=(1-smoothstep(feather*0.25,feather*3.2,Math.abs(radius-boundary)))*alpha;
          for(let patchIndex=0;patchIndex<patches.length;patchIndex+=1){
            const patch=patches[patchIndex];
            const reach=smoothstep(patch.start,patch.end,progress);
            if(reach<=0)continue;
            const patchFeather=feather*1.12/patch.maxRadius;
            const fieldValue=patch.field[pixel];
            const patchAlpha=1-smoothstep(reach-patchFeather,reach+patchFeather,fieldValue);
            const patchEdge=(1-smoothstep(patchFeather*0.22,patchFeather*2.8,Math.abs(fieldValue-reach)))*patchAlpha;
            const exposedPatchEdge=patchEdge*(1-alpha);
            edge*=1-patchAlpha;
            alpha=1-(1-alpha)*(1-patchAlpha);
            edge=Math.max(edge,exposedPatchEdge);
          }
          const edgeTone=edge*0.56;
          const offset=pixel*4;
          output.data[offset]=Math.round(stonePixels[offset]*(1-edgeTone)+183*edgeTone);
          output.data[offset+1]=Math.round(stonePixels[offset+1]*(1-edgeTone)+188*edgeTone);
          output.data[offset+2]=Math.round(stonePixels[offset+2]*(1-edgeTone)+199*edgeTone);
          output.data[offset+3]=Math.round(stonePixels[offset+3]*alpha);
        }
        ctx.putImageData(output,0,0);
        if(linear<1)frameId=requestAnimationFrame(render);
      };
      frameId=requestAnimationFrame(render);
    }).catch(()=>{});

    return()=>{
      disposed=true;
      cancelAnimationFrame(frameId);
    };
  },[cracks,target,variant]);

  return <canvas ref={canvasRef} width={Math.round(target.w)} height={Math.round(target.h)} style={{position:'absolute',inset:0,width:'100%',height:'100%',display:'block'}}/>;
}

function KnifeEffect({targets}){
  if(!targets||!targets.length)return null;
  return(
    <div style={{position:'fixed',inset:0,zIndex:485,pointerEvents:'none',overflow:'hidden'}}>
      {targets.map(({pi,cx,cy,animKey},idx)=>{
        const delay=(idx*0.08).toFixed(2)+'s';
        const hitDelay=(idx*0.08+0.28).toFixed(2)+'s';
        const startX=window.innerWidth/2;
        const startY=window.innerHeight/2;
        const txPx=cx-startX;
        const tyPx=cy-startY;
        const angle=Math.atan2(tyPx,txPx)*180/Math.PI;
        return(
          <React.Fragment key={animKey||`${pi}-${idx}`}>
            <div style={{
              position:'absolute',left:startX,top:startY,
              width:32,height:32,marginLeft:-16,marginTop:-16,
              filter:'drop-shadow(0 0 4px rgba(200,50,50,0.7))',
              '--tx':`${txPx}px`,'--ty':`${tyPx}px`,'--angle':`${angle}deg`,
              animation:`knifeStrikeGlobal 0.28s cubic-bezier(0.2,0,0.8,1) ${delay} both`,
              transformOrigin:'center center',
            }}>
              <svg viewBox="0 0 64 64" width="32" height="32" aria-hidden="true" style={{display:'block',overflow:'visible'}}>
                <path d="M62 32 L34 18 L22 32 L34 46 Z" fill="#d8dde6" stroke="#fff7e6" strokeWidth="2" strokeLinejoin="round"/>
                <path d="M22 32 L58 32" stroke="#7e8794" strokeWidth="2.5" strokeLinecap="round"/>
                <path d="M30 24 L54 32 L30 40" fill="none" stroke="#f4f0de" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.72"/>
                <path d="M24 22 L29 22 L29 42 L24 42 Z" fill="#c8a96e" stroke="#fff0a8" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M24 27 L8 27 L3 32 L8 37 L24 37 Z" fill="#5b341f" stroke="#b9824d" strokeWidth="2" strokeLinejoin="round"/>
                <path d="M8 32 L23 32" stroke="#2f1c12" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{
              position:'absolute',left:cx,top:cy,
              width:80,height:80,marginLeft:-40,marginTop:-40,
              background:'radial-gradient(circle,rgba(200,30,30,0.45) 0%,transparent 70%)',
              borderRadius:'inherit',
              animation:'hitFlashGlobal 0.3s ease-out '+hitDelay+' both',
              opacity:0,
            }}/>
            {[{x:30,y:40,s:1.1},{x:55,y:25,s:0.8},{x:70,y:55,s:1.3},{x:20,y:60,s:0.7},{x:45,y:70,s:1.0},{x:65,y:35,s:0.9}].map((d,i)=>{
              const bloodDelay=(idx*0.08+0.26+i*0.028).toFixed(2)+'s';
              return(
                <div key={i} style={{
                  position:'absolute',
                  left:cx-40+d.x*0.8,top:cy-40+d.y*0.8,
                  width:Math.round(5*d.s),height:Math.round(8*d.s),
                  borderRadius:'50% 50% 55% 55%',
                  background:'radial-gradient(ellipse,#cc1010 0%,#880808 70%)',
                  animation:`bloodDrop 0.55s ease-out ${bloodDelay} both`,
                  opacity:0,
                  transform:'translateY(-12px)',
                }}/>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}
function GuillotineAnim({targets}){
  const[phase,setPhase]=React.useState('slice'); // slice, slide

  React.useEffect(()=>{
    const t1=setTimeout(()=>setPhase('slide'),170);
    return()=>{clearTimeout(t1);};
  },[]);

  // 每局每名角色只随机一次斜角，避免 re-render 时角度跳动
  // 角度分布在 [-30,-22] ∪ [22,30]，避开接近水平的 0° 附近
  const anglesRef=React.useRef(null);
  if(targets?.length>0&&(!anglesRef.current||anglesRef.current.length!==targets.length)){
    anglesRef.current=targets.map(()=>{
      const base=22+Math.random()*8; // 22 ~ 30
      return (Math.random()<0.5?1:-1)*base;
    });
  }

  if(!targets||!targets.length)return null;
  if(!anglesRef.current||anglesRef.current.length!==targets.length){
    anglesRef.current=targets.map(()=>{
      const base=22+Math.random()*8; // 22 ~ 30
      return (Math.random()<0.5?1:-1)*base;
    });
  }

  return(
    <div style={{position:'fixed',inset:0,zIndex:1400,pointerEvents:'none',overflow:'hidden'}}>
      <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0)',animation:'guillotineVig 1.1s ease-in-out forwards'}}/>
      {targets.map((t,ti)=>{
        const hasSnapshot=!!t.snapshotUrl;
        const sliceAngle=anglesRef.current[ti];
        return(
          <React.Fragment key={ti}>
            {phase==='slice'&&(
              <div style={{
                position:'absolute',
                left:t.x,top:t.y,width:t.w,height:t.h,
                overflow:'hidden',
                borderRadius:3,
              }}>
                <PanelSliceBackground target={t} borderRadius={3}/>
                {hasSnapshot&&(
                  <PanelSnapshotImage src={t.snapshotUrl} w={t.w} h={t.h} filter="brightness(0.92) saturate(0.95)" opacity={0.96}/>
                )}
                <div style={{
                  position:'absolute',
                  left:-t.w,top:-t.h,width:t.w*3,height:t.h*3,
                  '--slice-angle': `${sliceAngle}deg`,
                  background:'linear-gradient(90deg, transparent 0%, rgba(255,0,0,0.8) 50%, transparent 100%)',
                  animation:'sliceEffect 0.11s ease-out forwards',
                }}/>
                <div style={{
                  position:'absolute',
                  left:-10,top:-10,width:t.w+20,height:t.h+20,
                  background:'radial-gradient(ellipse at center, rgba(255,255,255,0.8) 0%, rgba(255,100,100,0.6) 50%, transparent 100%)',
                  animation:'sliceFlash 0.12s ease-out forwards',
                }}/>
                <div style={{
                  position:'absolute',
                  left:-20,top:-20,width:t.w+40,height:t.h+40,
                  background:'radial-gradient(ellipse at center, rgba(180,10,10,0.4) 0%, rgba(80,0,0,0.1) 60%, transparent 100%)',
                  animation:'bloodSpread 0.42s ease-out forwards',
                }}/>
              </div>
            )}
            {phase==='slide'&&(
              <div style={{
                position:'absolute',
                left:t.cx,top:t.cy,
                width:t.w,height:t.h,
                marginLeft:-t.w/2,marginTop:-t.h/2,
                transform:`rotate(${sliceAngle}deg)`,
                transformOrigin:'center center',
              }}>
                <div style={{
                  position:'absolute',left:0,top:0,width:'100%',height:'50%',
                  overflow:'hidden',
                  borderTopLeftRadius:3,
                  borderTopRightRadius:3,
                  transformOrigin:sliceAngle>0?'0% 100%':'100% 100%',
                  '--pivot-rot':`${sliceAngle>0?-22:22}deg`,
                  animation:'slideUp 0.72s cubic-bezier(0.08,0.82,0.22,1) forwards',
                  boxShadow:hasSnapshot?'0 6px 18px rgba(0,0,0,0.28)':'none',
                }}>
                  <PanelSliceBackground target={t} height={t.h} borderRadius={'3px 3px 0 0'}/>
                  {hasSnapshot?(
                    <PanelSnapshotImage src={t.snapshotUrl} w={t.w} h={t.h}/>
                  ):(
                    <div style={{
                      position:'absolute',inset:0,
                      background:'linear-gradient(135deg, rgba(255,100,100,0.3) 0%, rgba(255,0,0,0.2) 100%)',
                    }}/>
                  )}
                </div>
                <div style={{
                  position:'absolute',left:0,top:'50%',width:'100%',height:'50%',
                  overflow:'hidden',
                  borderBottomLeftRadius:3,
                  borderBottomRightRadius:3,
                  transformOrigin:sliceAngle>0?'0% 0%':'100% 0%',
                  '--pivot-rot':`${sliceAngle>0?22:-22}deg`,
                  animation:'slideDown 0.76s cubic-bezier(0.08,0.82,0.24,1) forwards',
                  boxShadow:hasSnapshot?'0 6px 18px rgba(0,0,0,0.28)':'none',
                }}>
                  <PanelSliceBackground target={t} top={-t.h/2} height={t.h} borderRadius={'0 0 3px 3px'}/>
                  {hasSnapshot?(
                    <PanelSnapshotImage src={t.snapshotUrl} w={t.w} h={t.h} top={-t.h/2}/>
                  ):(
                    <div style={{
                      position:'absolute',inset:0,
                      background:'linear-gradient(135deg, rgba(255,100,100,0.3) 0%, rgba(255,0,0,0.2) 100%)',
                    }}/>
                  )}
                </div>
                {hasSnapshot&&(
                  <>
                    <div style={{
                      position:'absolute',left:0,top:'50%',width:'100%',height:2,
                      background:'linear-gradient(90deg, transparent 0%, rgba(255,230,230,0.95) 50%, transparent 100%)',
                      boxShadow:'0 0 12px rgba(255,80,80,0.8)',
                    }}/>
                    <div style={{
                      position:'absolute',left:-10,top:-10,
                      width:t.w+20,height:t.h+20,
                      background:'radial-gradient(ellipse at center, rgba(180,10,10,0.22) 0%, rgba(80,0,0,0.08) 58%, transparent 100%)',
                      animation:'bloodSpread 1s ease-out forwards',
                    }}/>
                  </>
                )}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function PetrifyAnim({targets}){
  const variantsRef=React.useRef(null);
  if(targets?.length>0&&(!variantsRef.current||variantsRef.current.length!==targets.length)){
    variantsRef.current=targets.map((_,idx)=>({
      phaseA:0.8+idx*0.61+Math.random()*1.2,
      phaseB:1.7+idx*0.43+Math.random()*1.6,
      phaseC:2.9+idx*0.37+Math.random()*1.4,
      grainX:Math.round(Math.random()*140),
      grainY:Math.round(Math.random()*140),
      noiseV:Math.random()*0.22,
      noiseSeed:Math.round(Math.random()*100000),
    }));
  }
  if(!targets||!targets.length)return null;
  return(
    <div style={{position:'fixed',inset:0,zIndex:1390,pointerEvents:'none',overflow:'hidden'}}>
      {targets.map((t,idx)=>{
        const variant=variantsRef.current?.[idx]||{phaseA:0,phaseB:1,phaseC:2,grainX:0,grainY:0,noiseV:0,noiseSeed:0};
        const cracks=makePetrifyCracks(t,variant);
        return(
          <div
            key={`${t.pi}-${idx}`}
            className="petrify-snapshot-panel"
            style={{
              position:'absolute',
              left:t.x,
              top:t.y,
              width:t.w,
              height:t.h,
              borderRadius:3,
              overflow:'hidden',
              border:0,
              boxShadow:'none',
              background:'transparent',
            }}
          >
            <PetrifyPolarCanvas target={t} variant={variant} cracks={cracks}/>
          </div>
        );
      })}
    </div>
  );
}

export { KnifeEffect, GuillotineAnim, PetrifyAnim };
