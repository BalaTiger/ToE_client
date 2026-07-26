import React from 'react';
import { CS, GOD_CS } from '../../constants/card';
import { CardBackLayer } from '../cards/AnimatedCardBack';
import { CardCodeLabel, CardFaceImage } from '../cards';
import { getZoneCardPolarity } from '../../game/coreUtils';
import { getPileAnchorCenter, getPlayerHandAnchorCenter } from '../../utils/dom';
import { SMOKE_COLS, FLOWER_CONFIGS } from './data';
import { getInspectionCardDesc, getInspectionCardPolarity, petalPath } from './utils';
import { GodHighlightBurst } from './GodHighlightBurst';

function FlowerSVG({petals,hue,variant,size}){
  const r=size*0.44;
  const shapes=petalPath(petals,r,variant);
  const petalFill=`hsla(${hue},70%,88%,0.92)`;
  const petalStroke=`hsla(${hue},55%,72%,0.60)`;
  const centerFill=`hsla(${hue+20},80%,96%,1)`;
  const glowFill=`hsla(${hue},60%,95%,0.50)`;
  return(
    <svg viewBox={`${-size/2} ${-size/2} ${size} ${size}`}
      width={size} height={size} style={{overflow:'visible'}}>
      <circle cx="0" cy="0" r={r*1.35}
        fill={glowFill} style={{filter:'blur(8px)'}}/>
      {shapes.map((d,i)=>(
        <path key={i} d={d}
          fill={petalFill} stroke={petalStroke} strokeWidth="0.8"
          style={{filter:'blur(0.4px)'}}/>
      ))}
      <circle cx="0" cy="0" r={r*0.22}
        fill={centerFill}
        stroke={`hsla(${hue+10},60%,78%,0.70)`} strokeWidth="0.8"/>
      <circle cx="0" cy="0" r={r*0.10} fill={`hsla(${hue+30},90%,98%,1)`}/>
    </svg>
  );
}

function FlowerBloom(){
  return(
    <>
      {FLOWER_CONFIGS.map(([side,xOff,yOff,scale,hue,petals,delay,variant],i)=>{
        const size=Math.round(72*scale);
        const left=side===-1
          ?`calc(50% - 60px - ${xOff}px)`
          :`calc(50% + 60px + ${xOff - size}px)`;
        const top=`calc(50% + ${yOff - size/2}px)`;
        const bloomDur=0.55;
        const holdDur=0.70;
        const fadeDur=0.40;
        return(
          <div key={i} style={{
            position:'absolute',
            left, top,
            width:size, height:size,
            opacity:0,
            transformOrigin:'center center',
            animation:`flowerBloom ${bloomDur}s cubic-bezier(0.34,1.56,0.64,1) ${delay}s both,
                       flowerFade  ${fadeDur}s ease-in ${delay+bloomDur+holdDur}s both`,
            pointerEvents:'none',
          }}>
            <FlowerSVG petals={petals} hue={hue} variant={variant} size={size}/>
          </div>
        );
      })}
    </>
  );
}

function CardFlipAnim({card,triggerName,targetPid,exiting,skipTravel=false,travelOnly=false,guessCorrect,expansionKey='地神的潜影',sourcePile='deck',onSettled}){
  const [traveled,setTraveled]=React.useState(skipTravel);
  const settledRef=React.useRef(false);
  const settleDelay=card?.isGod?2650:1250;
  React.useEffect(()=>{
    if(skipTravel){setTraveled(true);return undefined;}
    const t=setTimeout(()=>setTraveled(true),650);
    return()=>clearTimeout(t);
  },[skipTravel]);
  React.useEffect(()=>{
    if(!traveled||!onSettled||settledRef.current)return undefined;
    const t=setTimeout(()=>{
      settledRef.current=true;
      onSettled();
    },settleDelay);
    return()=>clearTimeout(t);
  },[traveled,onSettled,settleDelay]);

  const isInspection=!!card?.effect;
  if(!card) return null;
  const hideZoneIdentity=!!card.blindZoneIdentity&&!isInspection;
  const displayTriggerName=isInspection&&(targetPid??0)===0?'你':triggerName;
  const inspectionTone=isInspection?getInspectionCardPolarity(card):null;
  const s=isInspection
    ?({
      bg:inspectionTone==='positive'?'linear-gradient(135deg,#11331d,#08160d)':inspectionTone==='neutral'?'linear-gradient(135deg,#1a1d24,#0b0e13)':'linear-gradient(135deg,#241126,#0f0713)',
      borderBright:inspectionTone==='positive'?'#56d184':inspectionTone==='neutral'?'#7b889b':'#d16acb',
      border:inspectionTone==='positive'?'#3da865':inspectionTone==='neutral'?'#5d6978':'#9e4a92',
      text:inspectionTone==='positive'?'#b8ffd1':inspectionTone==='neutral'?'#d7e0ef':'#ffd0ff',
      glow:inspectionTone==='positive'?'#49d17d':inspectionTone==='neutral'?'#91a1c2':'#b24ad1',
    })
    :(CS[card.letter]||GOD_CS);
  const cardPolarity=isInspection?inspectionTone:(card.isGod?'negative':getZoneCardPolarity(card));
  const isEvil=cardPolarity==='negative';
  const isNeutralCard=cardPolarity==='neutral';
  const isNeutralInspection=isInspection&&inspectionTone==='neutral';
  const isPositiveInspection=isInspection&&inspectionTone==='positive';
  const showAtmosphereEffects=true;
  const viewportScale=Math.min(window.innerWidth/1280,window.innerHeight/720);
  const cardScale=Math.max(1.08,Math.min(1.85,viewportScale));
  const travelScale=Math.max(1,Math.min(1.35,viewportScale));
  const travelW=Math.round(70*travelScale);
  const travelH=Math.round(94*travelScale);
  const flipW=Math.round(208*cardScale);
  const flipH=Math.round(flipW*590/392);
  const px=value=>Math.round(value*cardScale);
  // Keep every atmosphere effect anchored to the card rather than the viewport.
  // The unscaled frame is enlarged around the card, then scales with cardScale.
  const atmosphereFrameStyle={
    position:'absolute',
    left:'50%',
    top:'50%',
    width:320,
    height:208*590/392,
    pointerEvents:'none',
    transform:`translate(-50%,-50%) scale(${cardScale})`,
    transformOrigin:'center',
  };

  const getSourceCenter=()=>{
    if(!isInspection&&sourcePile==='discard'){
      return getPileAnchorCenter(
        '[data-discard-pile]',
        {x:window.innerWidth*0.35,y:window.innerHeight*0.50}
      );
    }
    return getPileAnchorCenter(
      isInspection?'[data-inspection-pile]':'[data-deck-pile]',
      isInspection
      ?{x:window.innerWidth*0.10,y:window.innerHeight*0.14}
      :{x:window.innerWidth*0.94-35,y:window.innerHeight*0.08}
    );
  };
  const getHandCenter=pid=>{
    return getPlayerHandAnchorCenter(pid);
  };
  const destStyle=(()=>{
    const src=getSourceCenter();
    const dest=getHandCenter(targetPid??0);
    return{'--dest-x':`${dest.x-travelW/2}px`,'--dest-y':`${dest.y-travelH/2}px`,'--src-x':`${src.x-travelW/2}px`,'--src-y':`${src.y-travelH/2}px`};
  })();

  if(!traveled) return(
    <div style={{position:'fixed',inset:0,zIndex:999,background:'rgba(4,4,2,0)',pointerEvents:'none'}}>
      <div style={{
        position:'absolute',
        width:travelW,height:travelH,borderRadius:4,
        backgroundColor:'#100c08',
        boxShadow:'0 4px 18px rgba(0,0,0,0.7)',
        overflow:'hidden',
        ...destStyle,
        animation:'cardTravelToPlayer 0.65s cubic-bezier(0.3,0,0.2,1) forwards',
      }}>
        <CardBackLayer expansionKey={expansionKey} card={card}/>
      </div>
    </div>
  );

  // 暗抽直接落入手牌，不展示中央翻牌阶段。
  if(travelOnly)return null;

  const spirits=!showAtmosphereEffects||card.isGod
    ?[]
    :isEvil
    ?SMOKE_COLS.flatMap((col,i)=>[
      <div key={`${i}a`} style={{
        position:'absolute',left:col.x,bottom:'4%',
        width:18,height:140,
        borderRadius:'44% 56% 40% 60% / 8% 14% 86% 92%',
        background:'linear-gradient(180deg,rgba(200,100,255,0) 0%,rgba(170,45,240,0.68) 18%,rgba(125,18,195,0.90) 45%,rgba(85,5,145,0.80) 70%,rgba(48,1,88,0.58) 88%,rgba(20,0,45,0) 100%)',
        filter:'blur(8px)',opacity:0,
        animation:`smokeRise${i} 1.4s cubic-bezier(0.15,0,0.45,1) ${1.2+col.d1}s both`,
        transformOrigin:'50% 100%',
      }}/>,
      <div key={`${i}b`} style={{
        position:'absolute',left:`calc(${col.x} - 18px)`,bottom:'2%',
        width:54,height:170,
        borderRadius:'50%/8% 8% 92% 92%',
        background:'linear-gradient(180deg,rgba(165,65,255,0) 0%,rgba(130,22,215,0.28) 28%,rgba(92,7,168,0.40) 52%,rgba(58,2,115,0.30) 76%,rgba(22,0,52,0) 100%)',
        filter:'blur(20px)',opacity:0,
        animation:`smokeRise${i} 1.4s cubic-bezier(0.15,0,0.45,1) ${1.2+col.d2}s both`,
        transformOrigin:'50% 100%',
      }}/>,
      <div key={`${i}c`} style={{
        position:'absolute',left:col.x,bottom:'4%',
        width:36,height:36,marginLeft:-9,
        opacity:0,
        animation:`ghostFace${i} 1.4s ease-out ${1.2+col.d1}s both`,
        pointerEvents:'none',
      }}>
        <svg viewBox="0 0 36 36" width="36" height="36" style={{overflow:'visible'}}>
          <ellipse cx="18" cy="14" rx="11" ry="13"
            fill="rgba(210,140,255,0.72)"
            style={{filter:'blur(1px)'}}/>
          <ellipse cx="13" cy="11" rx="3.5" ry="4.5"
            fill="rgba(15,2,30,0.90)"/>
          <ellipse cx="23" cy="11" rx="3.5" ry="4.5"
            fill="rgba(15,2,30,0.90)"/>
          <ellipse cx="13" cy="11" rx="1.5" ry="2"
            fill="rgba(180,80,255,0.85)"/>
          <ellipse cx="23" cy="11" rx="1.5" ry="2"
            fill="rgba(180,80,255,0.85)"/>
          <ellipse cx="18" cy="20" rx="4" ry="3"
            fill="rgba(10,1,20,0.92)"/>
          <path d="M 7,24 Q 10,30 14,27 Q 18,32 22,27 Q 26,30 29,24"
            fill="rgba(185,110,255,0.55)" style={{filter:'blur(1.5px)'}}/>
          <ellipse cx="18" cy="15" rx="14" ry="16"
            fill="none" stroke="rgba(200,120,255,0.35)" strokeWidth="3"
            style={{filter:'blur(2px)'}}/>
        </svg>
      </div>
    ])
    :[...'✦✦✦✦'].map((_,i)=>(
      <div key={i} style={{
        position:'absolute',fontSize:18,color:'#fffbe8',
        left:`${20+i*17}%`,bottom:'10%',
        animation:`particleRise 1.0s ease-out ${1.2+i*0.09}s both`,
        opacity:0,
        filter:'drop-shadow(0 0 10px #fffbe8) drop-shadow(0 0 4px #c8a96e)',
      }}>✦</div>
    ));

  return(
    <div style={{
      position:'fixed',inset:0,zIndex:999,
      background:isEvil?'rgba(8,2,14,0.93)':'rgba(4,4,2,0.91)',
      display:'flex',alignItems:'center',justifyContent:'center',
      animation:exiting?'animFadeOut 0.18s ease-in forwards':'animFadeIn 0.12s ease-out forwards',
      overflow:'visible',
    }}>
      {showAtmosphereEffects&&(
        <div style={{
          position:'absolute',width:px(320),height:px(320),borderRadius:'50%',
          background:isNeutralCard
            ?'radial-gradient(circle,rgba(140,155,180,0.12) 0%,rgba(70,80,98,0.08) 40%,transparent 70%)'
            :isEvil
            ?'radial-gradient(circle,#7010aa44 0%,#3a0060 40%,transparent 70%)'
            :'radial-gradient(circle,#e8c87a33 0%,#c8a96e22 40%,transparent 70%)',
          animation:'burstPulse 1.0s ease-out 1.15s both',
          pointerEvents:'none',
        }}/>
      )}

      {showAtmosphereEffects&&cardPolarity==='positive'&&(
        <div style={atmosphereFrameStyle}>
          <FlowerBloom/>
        </div>
      )}

      {triggerName==='斯芬克斯'&&guessCorrect!==undefined&&(
        <div style={{
          position:'absolute',
          left:0,right:0,
          top:'calc(50% - 170px)',
          display:'flex',
          justifyContent:'center',
          pointerEvents:'none',
          zIndex:1000,
        }}>
          <div style={{
            fontFamily:"'Cinzel Decorative','Cinzel',serif",
            fontSize:32,
            fontWeight:700,
            letterSpacing:2,
            color:guessCorrect?'#4ade80':'#ef4444',
            textShadow:guessCorrect
              ?'0 0 10px rgba(74,222,128,0.7), 0 0 22px rgba(74,222,128,0.4)'
              :'0 0 10px rgba(239,68,68,0.7), 0 0 22px rgba(239,68,68,0.4)',
            animation:'animPop 0.5s cubic-bezier(0.34,1.56,0.64,1) 1.0s both',
          }}>
            {guessCorrect?'猜对了！':'猜错了！'}
          </div>
        </div>
      )}

      <div data-card-flip-atmosphere={cardPolarity} style={atmosphereFrameStyle}>{spirits}</div>

      {displayTriggerName&&(
        <div style={{
          position:'absolute',bottom:'12%',left:'50%',transform:'translateX(-50%)',
          fontFamily:"'Cinzel',serif",fontWeight:700,letterSpacing:3,fontSize:13,
          color:isInspection?(inspectionTone==='positive'?'#7ef2aa':inspectionTone==='neutral'?'#c7d3e8':'#e28cff'):(cardPolarity==='negative'?'#c060dd':cardPolarity==='neutral'?'#c7d3e8':'#c8a96e'),
          textShadow:isInspection?(inspectionTone==='positive'?'0 0 16px #2dbf6688':inspectionTone==='neutral'?'0 0 16px #8fa0bf66':'0 0 16px #9020cc88'):(cardPolarity==='negative'?'0 0 16px #9020cc88':cardPolarity==='neutral'?'0 0 16px #8fa0bf66':'0 0 16px #c8a96e88'),
          textTransform:'uppercase',whiteSpace:'nowrap',
          animation:'animFadeIn 0.4s ease-out 1.2s both',
        }}>{displayTriggerName} 翻开卡牌</div>
      )}

      <div
        data-inspection-flip-card={isInspection ? 'true' : undefined}
        style={{
          position:'relative',
          width:flipW,
          height:flipH,
          animation:'cardRise 1.2s cubic-bezier(0.15,0,0.35,1) forwards',
          perspective:700,
          overflow:'visible',
        }}
      >
        <div style={{
          width:flipW,height:flipH,position:'relative',
          transformStyle:'preserve-3d',
          animation:'cardFlip 1.2s cubic-bezier(0.2,0,0.3,1) forwards',
        }}>
          <div style={{
            position:'absolute',inset:0,backfaceVisibility:'hidden',transform:'rotateY(180deg)',
            backgroundColor:'#100c08',
            borderRadius:5,
            display:'flex',alignItems:'center',justifyContent:'center',
            boxShadow:'0 0 20px #0a0600',
            overflow:'hidden',
          }}>
            <CardBackLayer expansionKey={expansionKey} card={card}/>
          </div>
          {!hideZoneIdentity?(
            <div style={{
              position:'absolute',inset:0,backfaceVisibility:'hidden',
              borderRadius:5,
              boxShadow:(isNeutralCard)?'0 0 18px rgba(120,136,155,0.22)':`0 0 30px ${s.glow}88, 0 0 60px ${isEvil?'#6010aa':'#c8a96e'}44`,
            }}>
              <CardFaceImage card={card} godLevel={1} width={flipW} style={{borderRadius:5,boxShadow:'none'}}/>
            </div>
          ):(
            <div style={{
              position:'absolute',inset:0,backfaceVisibility:'hidden',
              background:s.bg,border:`2px solid ${s.borderBright}`,borderRadius:5,
              padding:`${px(12)}px ${px(10)}px`,
              boxShadow:(isInspection||isNeutralCard)?'0 0 18px rgba(120,136,155,0.22)':`0 0 30px ${s.glow}88, 0 0 60px ${isEvil?'#6010aa':'#c8a96e'}44`,
            }}>
              <div style={{position:'absolute',top:px(4),right:px(6),fontSize:px(8),color:s.border,opacity:0.7}}>✦</div>
              {isInspection
                ? <div style={{fontFamily:"'Cinzel',serif",fontWeight:700,color:s.text,fontSize:px(18),lineHeight:1,letterSpacing:2}}>检定</div>
                : <CardCodeLabel card={card} fontSize={px(28)} letterSpacing={0}/>
              }
              {!hideZoneIdentity&&<div style={{fontFamily:"'Cinzel',serif",color:isInspection?s.text:'#c8a96e',fontSize:isInspection?px(16):px(11.5),fontWeight:600,marginTop:px(6),lineHeight:1.3}}>{card.name}</div>}
              {!hideZoneIdentity&&<div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:isInspection?(inspectionTone==='positive'?'#aeeac0':inspectionTone==='neutral'?'#b8c4d8':'#e2a8e8'):'#b89858',fontSize:px(9.5),marginTop:px(8),lineHeight:1.4}}>{isInspection?getInspectionCardDesc(card):card.desc}</div>}
              {isInspection&&(
                <div style={{position:'absolute',left:px(10),bottom:px(10),fontSize:px(9),color:s.border,letterSpacing:2,fontFamily:"'Cinzel',serif"}}>
                  {inspectionTone==='positive'?'正面检定':inspectionTone==='neutral'?'中性检定':'负面检定'}
                </div>
              )}
              <div style={{position:'absolute',bottom:px(4),left:'50%',transform:'translateX(-50%)',color:s.border,fontSize:px(7),opacity:0.5}}>— ✦ —</div>
            </div>
          )}
        </div>
        {card?.isGod&&(
          <GodHighlightBurst
            godKey={card.godKey}
            delayMs={1260}
            durationMs={1320}
            intensity={0.92}
            style={{inset:0,zIndex:4}}
          />
        )}
      </div>
    </div>
  );
}

export { FlowerBloom, CardFlipAnim };

