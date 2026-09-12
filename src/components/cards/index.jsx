import React from 'react';
import { createPortal } from 'react-dom';
import { CS, GOD_CS, GOD_DEFS, getCardDisplayKey, getGodDisplaySubtitle } from '../../constants/card';
import { AnimatedCardBack } from './AnimatedCardBack';
import { CardFaceImage } from './CardFaceImage';
import { CARD_FACE_RATIO } from './CardFaceAssets';
import { useCardHoverTooltip } from './useCardHoverTooltip';

function OctopusSVG({col,size=32}){
  return(
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke={col} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{opacity:0.55}}>
      {/* head dome */}
      <path d="M12 26 Q12 10 24 9 Q36 10 36 26"/>
      {/* mantle bump */}
      <path d="M16 22 Q24 18 32 22"/>
      {/* eyes */}
      <circle cx="19" cy="20" r="2"/>
      <circle cx="29" cy="20" r="2"/>
      {/* tentacles — 8 sinuous lines */}
      <path d="M13 27 Q9 32 11 38 Q13 44 10 47"/>
      <path d="M16 28 Q13 34 14 40 Q15 45 13 48"/>
      <path d="M20 29 Q18 35 19 41 Q20 46 18 48"/>
      <path d="M24 29 Q24 35 24 41 Q24 46 23 48"/>
      <path d="M28 29 Q29 35 29 41 Q29 46 30 48"/>
      <path d="M32 28 Q34 34 33 40 Q32 45 34 48"/>
      <path d="M35 27 Q38 32 36 38 Q34 44 37 47"/>
      <path d="M13 27 Q9 30 8 36"/>
    </svg>
  );
}

function getCardTooltipSize(){
  if(typeof window==='undefined')return{width:300,height:300*CARD_FACE_RATIO};
  const gap=Math.max(6,Math.min(20,window.innerWidth*0.012));
  const maxByHeight=Math.max(1,window.innerHeight-24)/CARD_FACE_RATIO;
  const maxByWidth=window.innerWidth<640?window.innerWidth-24:window.innerWidth/2-gap-16;
  const width=Math.max(1,Math.floor(Math.min(maxByHeight,maxByWidth)));
  return{width,height:width*CARD_FACE_RATIO};
}

function CardFaceTooltip({card,godLevel=1,position}){
  if(!position||!card)return null;
  const {width,height}=getCardTooltipSize();
  const viewW=typeof window==='undefined'?1280:window.innerWidth;
  const viewH=typeof window==='undefined'?720:window.innerHeight;
  const targetCenterX=position.left+(position.width/2);
  const targetCenterY=position.top+(position.height/2);
  const originCenterX=position.originCenterX??targetCenterX;
  const originCenterY=position.originCenterY??targetCenterY;
  const side=targetCenterX<viewW/2?'right':'left';
  const pointerX=position.pointerX||0;
  const pointerY=position.pointerY||0;
  // ponytail: gentle tilt that respects perspective. Was rotateY 34° under perspective(460px)
  // (viewer closer than the card is tall) → fish-eye "矮胖" squash.
  const baseRotateY=side==='right'?-24:24;
  const rotateY=baseRotateY+(pointerX*4);
  const rotateX=-pointerY*3;
  const rotateZ=(side==='right'?1:-1)+(pointerX*0.5);
  const transformOrigin=side==='right'?'left center':'right center';
  const centerGap=Math.max(6,Math.min(20,viewW*0.012));
  // Anchor the inner edge near the screen centre line; the card extends outward toward the edge.
  const finalLeft=viewW<640?(viewW-width)/2:side==='right'
    ?viewW/2+centerGap
    :viewW/2-centerGap-width;
  const finalTop=Math.max(12,Math.min(viewH-height-12,(viewH-height)/2));
  const startX=originCenterX-(finalLeft+width/2);
  const startY=originCenterY-(finalTop+height/2);
  const extract={
    startX,
    startY,
    pullX:startX*0.72,
    pullY:startY*0.74,
    midX:startX*0.28,
    midY:startY*0.34,
    overshootX:startX*-0.035,
    overshootY:startY*-0.025,
  };
  return createPortal(
    <>
      <style>{`
        @keyframes toeCardHoverExtract {
          0% {
            opacity: 0;
            transform: translate3d(var(--toe-start-x), var(--toe-start-y), 0) scale(0.12) rotateZ(var(--toe-start-rot));
            animation-timing-function: cubic-bezier(0.12, 0.78, 0.18, 1);
          }
          14% {
            opacity: 0.82;
            transform: translate3d(var(--toe-pull-x), var(--toe-pull-y), 0) scale(0.46) rotateZ(var(--toe-mid-rot));
            animation-timing-function: cubic-bezier(0.18, 0.72, 0.2, 1);
          }
          34% {
            opacity: 0.92;
            transform: translate3d(var(--toe-mid-x), var(--toe-mid-y), 0) scale(0.84) rotateZ(var(--toe-mid-rot));
            animation-timing-function: cubic-bezier(0.16, 0.84, 0.18, 1);
          }
          68% {
            opacity: 1;
            transform: translate3d(var(--toe-overshoot-x), var(--toe-overshoot-y), 0) scale3d(1.025, 1.025, 1) rotateZ(-0.55deg);
            animation-timing-function: cubic-bezier(0.22, 0.76, 0.24, 1);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale3d(1, 1, 1) rotateZ(0deg);
          }
        }
      `}</style>
      <div style={{
        position:'fixed',
        left:finalLeft,
        top:finalTop,
        width,
        height,
        zIndex:99999,
        pointerEvents:'none',
        '--toe-start-x':`${extract.startX.toFixed(1)}px`,
        '--toe-start-y':`${extract.startY.toFixed(1)}px`,
        '--toe-pull-x':`${extract.pullX.toFixed(1)}px`,
        '--toe-pull-y':`${extract.pullY.toFixed(1)}px`,
        '--toe-mid-x':`${extract.midX.toFixed(1)}px`,
        '--toe-mid-y':`${extract.midY.toFixed(1)}px`,
        '--toe-overshoot-x':`${extract.overshootX.toFixed(1)}px`,
        '--toe-overshoot-y':`${extract.overshootY.toFixed(1)}px`,
        '--toe-start-rot':side==='right'?'-9deg':'9deg',
        '--toe-mid-rot':side==='right'?'-4deg':'4deg',
        animation:'toeCardHoverExtract 620ms linear both',
        transformOrigin:'center',
        willChange:'transform, opacity',
      }}>
        <div style={{
          width,height,
          // ponytail: no infinite animation — a permanently-animating layer is rasterized at
          // 1× CSS res and upscaled to device px, blurring the 1448px art on hi-DPI screens.
          transformOrigin:'center',
          transformStyle:'preserve-3d',
        }}>
          <div style={{
            width,height,
            transform:viewW<640?'none':`perspective(1500px) translateZ(8px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) rotateZ(${rotateZ.toFixed(2)}deg)`,
            transformStyle:'preserve-3d',
            transformOrigin,
            transition:'transform 90ms ease-out',
          }}>
            <CardFaceImage
              card={card}
              godLevel={godLevel}
              width={width}
              style={{boxShadow:'0 18px 34px rgba(0,0,0,0.72), 0 0 28px rgba(185,145,82,0.22)'}}
            />
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

function GodTooltip({def,godLevel,position}){
  if(!def)return null;
  const card={isGod:true,godKey:def.godKey,name:def.name,subtitle:getGodDisplaySubtitle(def),power:def.power};
  return <CardFaceTooltip card={card} godLevel={godLevel||1} position={position}/>;
}

function AreaTooltip({card,position}){
  return <CardFaceTooltip card={card} position={position}/>;
}

function CardCodeLabel({card,scale=1,color,textShadow,fontSize,letterSpacing,style}){
  const isGod=!!card?.isGod;
  const code=getCardDisplayKey(card);
  return(
    <div style={{
      fontFamily:"'Cinzel',serif",
      fontWeight:700,
      color:color||(card?(isGod?GOD_CS:(CS[card.letter]||GOD_CS)).text:GOD_CS.text),
      fontSize:fontSize??Math.max(6,Math.round((isGod?8.5:9.5)*scale)),
      lineHeight:1,
      letterSpacing:letterSpacing??(isGod?0.5:0),
      textShadow:textShadow,
      ...style,
    }}>
      {code}
    </div>
  );
}

function MiniCardFace({card,width=70,frameStyle}){
  if(!card)return null;
  const faceWidth=typeof frameStyle?.width==='number'?frameStyle.width:width;
  return(
    <div style={{
      display:'flex',
      alignItems:'center',
      justifyContent:'center',
      position:'relative',
      ...frameStyle,
      width:faceWidth,
      minWidth:faceWidth,
      height:faceWidth*CARD_FACE_RATIO,
      minHeight:0,
      maxHeight:'none',
      aspectRatio:'392 / 590',
      padding:0,
      border:'none',
      overflow:'visible',
    }}>
      <CardFaceImage
        card={card}
        width={faceWidth}
        style={{
          borderRadius:frameStyle?.borderRadius??4,
          boxShadow:frameStyle?.boxShadow??'0 0 22px rgba(200,169,110,0.28), 0 8px 26px rgba(0,0,0,0.72)',
        }}
      />
    </div>
  );
}

function PreviewCard({card,minWidth=120,codeFontSize=51,frameStyle,desc,hideIdentity=false,scale=1}){
  if(!card)return null;
  const s=card.isGod?GOD_CS:(CS[card.letter]||GOD_CS);
  const bodyText=hideIdentity?'':(desc??(card.isGod?(getGodDisplaySubtitle(card)||card.power||''):(card.desc||'')));
  const uiScale=Math.max(0.58,scale||1);
  return(
    <div style={{
      background:s.bg,
      border:`2px solid ${s.borderBright}`,
      borderRadius:4,
      padding:`${18*uiScale}px ${22*uiScale}px`,
      display:'inline-flex',
      flexDirection:'column',
      alignItems:'center',
      minWidth:minWidth*uiScale,
      marginBottom:16*uiScale,
      boxShadow:`0 0 30px ${s.glow}55`,
      ...frameStyle,
    }}>
      <CardCodeLabel card={card} fontSize={codeFontSize*uiScale}/>
      {!hideIdentity&&<div style={{fontFamily:"'Cinzel',serif",color:'#e8cc88',fontSize:19.5*uiScale,fontWeight:600,marginTop:6*uiScale,textAlign:'center'}}>{card.name}</div>}
      {!!bodyText&&(
        <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#d4b468',fontSize:16.5*uiScale,marginTop:8*uiScale,lineHeight:1.4,maxWidth:200*uiScale,textAlign:'center'}}>
          {bodyText}
        </div>
      )}
    </div>
  );
}

function ImageCard({card,onClick,disabled,selected,highlight,small,compact,godLevel=1,holderId,frameStyle,hideCssFrame=false,tokenFaceWidth}){
  const { hover, tooltipPosition, cardRef, handleMouseEnter, handleMouseMove, handleMouseLeave } = useCardHoverTooltip();
  if(!card)return null;
  const def=card.isGod?GOD_DEFS[card.godKey]:null;
  if(card.isGod&&!def)return null;
  const faceCard=card.type==='blankZone'?{...card,key:'BLANK',desc:card.desc||'任意字母与数字'}:card;
  const theme=CS[card.letter]||GOD_CS;
  const isToken=card.isBlackGoatYoung||card.isTsathogguaSlime;
  const isRoseThornMarked=card.roseThornHolderId!=null&&holderId===card.roseThornHolderId;
  const color=selected?'#c8a96e':isRoseThornMarked?'#ff7a9a':isToken?'#93bd91':def?.col||theme.borderBright;
  const naturalWidth=small?44:compact?62:82;
  const faceWidth=typeof frameStyle?.width==='number'?frameStyle.width:tokenFaceWidth??naturalWidth;
  const width=frameStyle?.width??faceWidth;
  // Explicit animation/stack slots own their labels; hand cards keep readable live text below the artwork.
  const showCaption=!small&&frameStyle?.height==null;
  const canClick=!!onClick&&!disabled;
  return(
    <>
      <div
        ref={cardRef}
        data-card-face-box
        data-rendered-card-id={card.id}
        data-card-kind={card.isGod?'god':isToken?'token':card.type||'zone'}
        role={onClick?'button':undefined}
        tabIndex={canClick?0:undefined}
        aria-label={getCardDisplayKey(faceCard)+' · '+(def?.name||card.name||'卡牌')}
        aria-disabled={onClick?!!disabled:undefined}
        aria-pressed={onClick?!!selected:undefined}
        onClick={disabled?undefined:onClick}
        onKeyDown={canClick?event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onClick(event);}}:undefined}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          flexShrink:0,
          position:'relative',
          cursor:canClick?'pointer':'default',
          opacity:disabled?0.35:1,
          transform:selected?'translateY(-5px)':undefined,
          transition:'transform .14s, opacity .14s, box-shadow .14s',
          userSelect:'none',
          background:'transparent',
          borderRadius:hideCssFrame?0:3,
          outline:(selected||highlight||isRoseThornMarked)?'1.5px solid '+color:'none',
          boxShadow:selected||highlight||isRoseThornMarked?'0 0 15px '+color+'77':hover?'0 0 12px '+color+'55':'none',
          marginBottom:showCaption?34:0,
          ...frameStyle,
          width,
          minWidth:width,
          height:typeof width==='number'?width*CARD_FACE_RATIO:'auto',
          minHeight:0,
          maxHeight:'none',
          aspectRatio:'392 / 590',
          padding:0,
          border:'none',
          overflow:'visible',
        }}
      >
        <CardFaceImage card={faceCard} godLevel={Math.max(1,godLevel||1)} width={faceWidth} style={{boxShadow:'none',borderRadius:hideCssFrame?0:3}}/>
        {isRoseThornMarked&&<span style={{position:'absolute',top:3,left:3,padding:'2px 4px',background:'#241015',border:'1px solid #b95671',color:'#ffb2c5',fontSize:small?9:11,lineHeight:1.2}}>倒刺</span>}
        {showCaption&&(
          <div data-card-caption title={getCardDisplayKey(faceCard)+' · '+(def?.name||card.name||'')} style={{position:'absolute',top:'calc(100% + 4px)',left:0,right:0,fontSize:12,lineHeight:1.3,color:'#e5d5b4',textAlign:'center',fontFamily:"var(--toe-ui-font, 'Noto Serif SC', serif)",display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>
            <strong style={{color:card.isGod?def.col:'#cbb481'}}>{getCardDisplayKey(faceCard)}</strong> · {def?.name||card.name}
          </div>
        )}
      </div>
      {hover&&<CardFaceTooltip card={faceCard} godLevel={Math.max(1,godLevel||1)} position={tooltipPosition}/>}
    </>
  );
}

function GodDDCard(props){
  return <ImageCard {...props}/>;
}

function DDCard(props){
  return <ImageCard {...props}/>;
}

function DDCardBack({small,frameStyle,expansionKey='地神的潜影'}){
  const width=frameStyle?.width??(small?36:50);
  return(
    <AnimatedCardBack expansionKey={expansionKey} style={{
      flexShrink:0,
      boxShadow:'0 1px 5px rgba(0,0,0,0.45), inset 0 0 8px rgba(0,0,0,0.45)',
      borderRadius:3,
      ...frameStyle,
      width,
      minWidth:width,
      height:typeof width==='number'?width*CARD_FACE_RATIO:'auto',
      minHeight:0,
      maxHeight:'none',
      aspectRatio:'392 / 590',
      border:'none',
      padding:0,
    }}/>
  );
}

function GodCardDisplay({card,level=1,scale=1}){
  if(!card||!card.isGod)return null;
  const def=GOD_DEFS[card.godKey];if(!def)return null;
  const lvDef=def.levels[Math.max(0,(level||1)-1)];
  const uiScale=Math.max(0.58,scale||1);
  const subtitle=getGodDisplaySubtitle(def);
  return(
    <div style={{
      background:def.bgCol,border:`2px solid ${def.col}`,borderRadius:6,
      padding:`${14*uiScale}px ${18*uiScale}px`,maxWidth:300*uiScale,textAlign:'center',
      boxShadow:`0 0 30px ${def.col}66`,
    }}>
      <div style={{fontFamily:"'Cinzel Decorative','Cinzel',serif",fontSize:12*uiScale,color:def.col,letterSpacing:2,marginBottom:3*uiScale}}>{def.name}</div>
      {subtitle&&<div style={{fontFamily:"'IM Fell English',serif",fontStyle:'italic',fontSize:11.5*uiScale,color:'#c79d9d',marginBottom:10*uiScale}}>{subtitle}</div>}
      <div style={{width:'80%',height:1,background:`linear-gradient(90deg,transparent,${def.col},transparent)`,margin:`0 auto ${10*uiScale}px`}}/>
      <div style={{fontFamily:"'Cinzel',serif",fontSize:11.5*uiScale,color:def.col,letterSpacing:1,marginBottom:6*uiScale}}>{def.power}</div>
      <div style={{fontFamily:"'IM Fell English',serif",fontStyle:'italic',fontSize:12.5*uiScale,color:'#c6a090',lineHeight:1.6}}>{lvDef?.desc}</div>
    </div>
  );
}
export { CardCodeLabel, MiniCardFace, PreviewCard, GodTooltip, AreaTooltip, GodDDCard, DDCard, DDCardBack, GodCardDisplay, OctopusSVG, AnimatedCardBack, CardFaceImage, CardFaceTooltip };
