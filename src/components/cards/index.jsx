import React from 'react';
import { createPortal } from 'react-dom';
import { CS, GOD_CS, GOD_DEFS } from '../../constants/card';

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

function GodTooltip({def,godLevel,position}){
  const lvIdx=Math.max(0,(godLevel||1)-1);
  if(!position) return null;
  
  const tooltipWidth=214;
  const tooltipHeight=def.levels.length*80+40;
  const viewW=window.innerWidth;
  const viewH=window.innerHeight;
  
  let left,top;
  if(position.right+tooltipWidth+6<=viewW){
    left=position.right+6;
  }else if(position.left-tooltipWidth-6>=0){
    left=position.left-tooltipWidth-6;
  }else{
    left=Math.max(4,Math.min(position.left,viewW-tooltipWidth-4));
  }
  
  if(position.bottom+tooltipHeight+4<=viewH){
    top=position.top;
  }else if(position.top-tooltipHeight-4>=0){
    top=position.top-tooltipHeight;
  }else{
    top=Math.max(4,Math.min(position.top,viewH-tooltipHeight-4));
  }
  
  return createPortal(
    <div style={{
      position:'fixed',left:`${left}px`,top:`${top}px`,zIndex:99999,
      background:'#0a0412',border:`1.5px solid ${def.col}`,borderRadius:4,
      padding:'12px 15px',width:200,pointerEvents:'none',
      boxShadow:`0 0 20px ${def.col}55`,
      opacity:1,
      filter:'none',
    }}>
      <div style={{fontFamily:"'Cinzel',serif",fontSize:10,color:def.col,letterSpacing:1,marginBottom:5}}>{def.power}</div>
      {def.levels.map((lv,i)=>(
        <div key={i} style={{marginBottom:6}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:i===lvIdx?def.col:'#3a2510',letterSpacing:0.5,marginBottom:3}}>Lv.{i+1}{i===lvIdx?' ★':''}</div>
          <div style={{fontFamily:"'IM Fell English',serif",fontStyle:'italic',fontSize:11,color:i===lvIdx?'#b09080':'#5a4030',lineHeight:1.5}}>{lv.desc}</div>
        </div>
      ))}
    </div>,
    document.body
  );
}

function AreaTooltip({card,position}){
  const s=CS[card.letter]||GOD_CS;
  if(!position) return null;
  
  const tooltipWidth=214;
  const tooltipHeight=100;
  const viewW=window.innerWidth;
  const viewH=window.innerHeight;
  
  let left,top;
  if(position.right+tooltipWidth+6<=viewW){
    left=position.right+6;
  }else if(position.left-tooltipWidth-6>=0){
    left=position.left-tooltipWidth-6;
  }else{
    left=Math.max(4,Math.min(position.left,viewW-tooltipWidth-4));
  }
  
  if(position.bottom+tooltipHeight+4<=viewH){
    top=position.top;
  }else if(position.top-tooltipHeight-4>=0){
    top=position.top-tooltipHeight;
  }else{
    top=Math.max(4,Math.min(position.top,viewH-tooltipHeight-4));
  }
  
  return createPortal(
    <div style={{
      position:'fixed',left:`${left}px`,top:`${top}px`,zIndex:99999,
      background:'#0a0705',border:`1.5px solid ${s.borderBright}`,borderRadius:4,
      padding:'12px 15px',width:200,pointerEvents:'none',
      boxShadow:`0 0 20px ${s.glow}55`,
      opacity:1,
      filter:'none',
    }}>
      <div style={{fontFamily:"'Cinzel',serif",fontSize:10,color:s.text,letterSpacing:1,marginBottom:5}}>{card.key}</div>
      <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontSize:11,color:'#e8cc88',fontWeight:600,marginBottom:5}}>{card.name}</div>
      <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',fontSize:11,color:'#d4b468',lineHeight:1.5}}>{card.desc}</div>
    </div>,
    document.body
  );
}

function useCardHoverTooltip() {
  const [hover, setHover] = React.useState(false);
  const [tooltipPosition, setTooltipPosition] = React.useState(null);
  const cardRef = React.useRef(null);

  const handleMouseEnter = () => {
    setHover(true);
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      setTooltipPosition(rect);
    }
  };

  const handleMouseLeave = () => {
    setHover(false);
    setTooltipPosition(null);
  };

  return { hover, tooltipPosition, cardRef, handleMouseEnter, handleMouseLeave };
}

function GodDDCard({card,onClick,disabled,selected,highlight,small,compact,godLevel,frameStyle}){
  const def=GOD_DEFS[card.godKey];if(!def)return null;
  const { hover, tooltipPosition, cardRef, handleMouseEnter, handleMouseLeave } = useCardHoverTooltip();
  const w=small?44:compact?62:82,h=small?58:compact?82:108;
  const col=def.col;
  // fit text: long subtitle gets smaller font
  const nameLen=def.name.length;
  const subLen=def.subtitle.length;
  const nameFsz=small?7:nameLen>6?10:12;
  const subFsz=small?6:subLen>10?8:9;
  
  return(
    <>
      <div
        ref={cardRef}
        onClick={disabled?undefined:onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          width:w,minWidth:w,height:h,flexShrink:0,
          background:def.bgCol,
          border:`1.5px solid ${selected?'#c8a96e':highlight?col:col+'88'}`,
          boxShadow:selected?`0 0 14px #c8a96e88,inset 0 0 12px #c8a96e22`:hover?`0 0 14px ${col}88`:`0 0 6px ${col}44`,
          borderRadius:3,
          cursor:(onClick&&!disabled)?'pointer':'default',
          opacity:disabled?0.35:1,
          transform:selected?'translateY(-5px)':undefined,
          transition:'all .14s',
          display:'flex',flexDirection:'column',
          padding:small?'3px 2px':compact?'5px 4px':'6px 6px',
          userSelect:'none',
          position:'relative',
          overflow:'visible',
          ...frameStyle,
        }}
      >
        {/* Top: god name */}
        <div style={{
          fontFamily:"'Cinzel',serif",
          fontWeight:700,
          fontSize:nameFsz,
          color:col,
          lineHeight:1.15,
          textShadow:`0 0 8px ${col}66`,
          wordBreak:'break-word',
          overflowWrap:'anywhere',
          whiteSpace:'normal',
          textAlign:'center',
          maxWidth:'100%'
        }}>{def.name}</div>
        {/* Subtitle */}
        {!small&&<div style={{
          fontFamily:"'IM Fell English',serif",
          fontStyle:'italic',
          fontSize:subFsz,
          color:col,
          lineHeight:1.15,
          marginTop:2,
          wordBreak:'break-word',
          overflowWrap:'anywhere',
          whiteSpace:'normal',
          textAlign:'center',
          maxWidth:'100%',
          opacity:0.85
        }}>{def.subtitle}</div>}
        {/* Divider */}
        {!small&&!compact&&<div style={{height:1,background:`linear-gradient(90deg,${col}88,transparent)`,margin:'4px 0'}}/>}
        {/* God power name small */}
        {!small&&!compact&&<div style={{fontFamily:"'Cinzel',serif",fontSize:7.5,color:col,letterSpacing:0.5,lineHeight:1.3,opacity:0.9}}>「{def.power}」</div>}
        {/* Octopus bottom-left */}
        {!small&&!compact&&(
          <div style={{position:'absolute',bottom:2,left:2}}>
            <OctopusSVG col={col} size={28}/>
          </div>
        )}
      </div>
      {/* Hover tooltip */}
      {!small&&hover&&<GodTooltip def={def} godLevel={godLevel||1} position={tooltipPosition}/>}
    </>
  );
}

function DDCard({card,onClick,disabled,selected,highlight,small,compact,godLevel,holderId,frameStyle}){
  if(!card)return null;
  if(card.isGod) return <GodDDCard card={card} onClick={onClick} disabled={disabled} selected={selected} highlight={highlight} small={small} compact={compact} godLevel={godLevel} frameStyle={frameStyle}/>;
  if(card.type==='blankZone'){
    const w=small?44:compact?62:82,h=small?58:compact?82:108;
    return(
      <div
        onClick={disabled?undefined:onClick}
        style={{
          width:w,minWidth:w,height:h,flexShrink:0,
          background:'linear-gradient(160deg,#1a150f,#120d08)',
          border:`1.5px dashed ${selected?'#f4d27a':highlight?'#d8b45a':'#8a6a2a'}`,
          boxShadow:selected?'0 0 14px #c8a96e88,inset 0 0 12px #c8a96e22':highlight?'0 0 10px #d8b45a66':'inset 0 1px 0 #8a6a2a44',
          borderRadius:3,cursor:(onClick&&!disabled)?'pointer':'default',opacity:disabled?0.35:1,
          transform:selected?'translateY(-5px)':undefined,transition:'all .14s',
          display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
           padding:small?'4px 3px':compact?'5px 5px':'7px 8px',userSelect:'none',position:'relative',overflow:'hidden',
           ...frameStyle,
         }}
      >
        <div style={{fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:small?11:compact?13:16,color:'#f1d28b',letterSpacing:1}}>BLANK</div>
        <div style={{fontSize:small?14:compact?18:22,color:'#d8b45a',textShadow:'0 0 10px #d8b45a88'}}>◇</div>
        {!small&&<div style={{fontFamily:"'IM Fell English','Georgia',serif",fontSize:compact?9:10,color:'#c5a86a',fontStyle:'italic',lineHeight:1.35,textAlign:'center'}}>任意字母与数字</div>}
      </div>
    );
  }
  const { hover, tooltipPosition, cardRef, handleMouseEnter, handleMouseLeave } = useCardHoverTooltip();
  const s=CS[card.letter]||GOD_CS;
  const w=small?44:compact?62:82,h=small?58:compact?82:108;
  const isRoseThornMarked=card?.roseThornHolderId!=null&&holderId===card.roseThornHolderId;
  const nameLen=card.name?.length||0;
  const nameFontSize=small?12:compact?(nameLen>10?8.1:nameLen>7?8.8:9.5):(nameLen>18?7.8:nameLen>14?8.5:nameLen>10?9.2:10.5);
  const descLen=(card.desc||'').length;
  const descFontSize=compact?(descLen>28?8.1:descLen>20?8.7:9.4):(descLen>34?8.1:descLen>26?8.8:9.5);
  
  return(
    <>
      <div 
        ref={cardRef}
        onClick={disabled?undefined:onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          width:w,minWidth:w,height:h,flexShrink:0,
          background:s.bg,
          border:`1.5px solid ${selected?'#c8a96e':isRoseThornMarked?'#ff7a9a':highlight?s.borderBright:s.border}`,
          boxShadow:selected?`0 0 14px #c8a96e88,inset 0 0 12px #c8a96e22`:isRoseThornMarked?'0 0 18px rgba(255,90,130,0.35), inset 0 0 16px rgba(255,90,130,0.16)':highlight?`0 0 10px ${s.glow}88`:`inset 0 1px 0 ${s.border}44`,
          borderRadius:3,
          cursor:(onClick&&!disabled)?'pointer':'default',
          opacity:disabled?0.35:1,
          transform:selected?'translateY(-5px)':undefined,
          transition:'all .14s',
          display:'flex',flexDirection:'column',
          padding:small?'4px 3px':compact?'5px 4px':'7px 6px',
          userSelect:'none',
          position:'relative',
          overflow:'visible',
          ...frameStyle,
        }}
      >
        {/* Corner ornament */}
        {!small&&!compact&&<div style={{position:'absolute',top:3,right:5,color:s.border,fontSize:9,opacity:0.7}}>✦</div>}
        {isRoseThornMarked&&!small&&<div style={{position:'absolute',top:3,left:5,color:'#ff9ab2',fontSize:compact?8:9,opacity:0.92,textShadow:'0 0 8px rgba(255,90,130,0.55)',fontFamily:"'Cinzel',serif"}}>倒刺</div>}
        <div style={{color:s.text,fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:small?12:compact?15:18,lineHeight:1,textShadow:`0 0 6px ${s.text}55`}}>{card.key}</div>
        {!small&&<div style={{color:'#e8cc88',fontFamily:"'IM Fell English','Georgia',serif",fontSize:nameFontSize,fontWeight:600,marginTop:compact?1:2,lineHeight:1.12,wordBreak:'break-word'}}>{card.name}</div>}
        {!small&&!compact&&<div style={{color:'#d4b468',fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',fontSize:descFontSize,marginTop:'auto',lineHeight:1.25,wordBreak:'break-word'}}>{card.desc}</div>}
        {/* Bottom ornament */}
        {!small&&!compact&&<div style={{position:'absolute',bottom:3,left:'50%',transform:'translateX(-50%)',color:s.border,fontSize:8,opacity:0.5}}>— ✦ —</div>}
      </div>
      {/* Hover tooltip */}
      {!small&&hover&&<AreaTooltip card={card} position={tooltipPosition}/>}
    </>
  );
}

function DDCardBack({small,frameStyle}){
  return(
    <div style={{
      width:small?36:50,height:small?50:68,flexShrink:0,
      background:'#100c08',
      border:'1.5px solid #3a2510',
      boxShadow:'inset 0 0 8px #0a0600',
      borderRadius:3,
      display:'flex',alignItems:'center',justifyContent:'center',
      ...frameStyle,
    }}>
      <div style={{color:'#7a5a2a',fontSize:small?14:18,fontFamily:"serif"}}>✦</div>
    </div>
  );
}

function GodCardDisplay({card,level=1}){
  if(!card||!card.isGod)return null;
  const def=GOD_DEFS[card.godKey];if(!def)return null;
  const lvDef=def.levels[Math.max(0,(level||1)-1)];
  return(
    <div style={{
      background:def.bgCol,border:`2px solid ${def.col}`,borderRadius:6,
      padding:'14px 18px',maxWidth:300,textAlign:'center',
      boxShadow:`0 0 30px ${def.col}66`,
    }}>
      <div style={{fontFamily:"'Cinzel Decorative','Cinzel',serif",fontSize:11,color:def.col,letterSpacing:2,marginBottom:2}}>{def.name}</div>
      <div style={{fontFamily:"'IM Fell English',serif",fontStyle:'italic',fontSize:10,color:'#b89090',marginBottom:10}}>{def.subtitle}</div>
      <div style={{width:'80%',height:1,background:`linear-gradient(90deg,transparent,${def.col},transparent)`,margin:'0 auto 10px'}}/>
      <div style={{fontFamily:"'Cinzel',serif",fontSize:10,color:def.col,letterSpacing:1,marginBottom:6}}>{def.power}</div>
      <div style={{fontFamily:"'IM Fell English',serif",fontStyle:'italic',fontSize:11,color:'#b09080',lineHeight:1.6}}>{lvDef?.desc}</div>
    </div>
  );
}
export { GodTooltip, AreaTooltip, useCardHoverTooltip, GodDDCard, DDCard, DDCardBack, GodCardDisplay, OctopusSVG };
