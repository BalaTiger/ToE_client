import React from 'react';
import { CS, GOD_CS } from '../../constants/card';

function StatBar({label,val,color,trackColor,scaleRatio,viewportWidth}){
  const fontZoom = scaleRatio && scaleRatio < 1 ? 1 / scaleRatio : 1;
  const isMobileNarrow=!!viewportWidth&&viewportWidth<580;
  const isNarrowViewport=!!viewportWidth&&viewportWidth<900;
  const rowWidth=isMobileNarrow?'calc(100% - 34px)':isNarrowViewport?'calc(100% - 22px)':'100%';
  const labelCol=isNarrowViewport
    ? `${Math.ceil(20*fontZoom)}px`
    : 'clamp(18px, 2.5vw, 30px)';
  const valueCol=isMobileNarrow
    ? 'clamp(18px, 4vw, 24px)'
    : isNarrowViewport
      ? 'clamp(16px, 3vw, 22px)'
      : 'clamp(14px, 2.8vw, 20px)';
  const statFont=`clamp(${8*fontZoom}px, 1.7vw, ${10*fontZoom}px)`;
  const barHeight=`clamp(${8*fontZoom}px, 1.6vw, ${10*fontZoom}px)`;
  const columnGap=isNarrowViewport?'clamp(5px, 1.2vw, 7px)':'clamp(4px, 1vw, 6px)';
  const labelPaddingRight=isNarrowViewport?Math.ceil(2*fontZoom):0;
  return(
    <div style={{display:'grid',gridTemplateColumns:`${labelCol} minmax(0,1fr) ${valueCol}`,alignItems:'center',columnGap:columnGap,marginBottom:4,width:rowWidth,marginLeft:'auto',marginRight:'auto',boxSizing:'border-box',overflow:'visible'}}>
      <span style={{fontFamily:"'Cinzel',serif",color:'#a07838',fontSize:statFont,fontWeight:700,letterSpacing:0.3,textAlign:'left',whiteSpace:'nowrap',minWidth:0,paddingRight:labelPaddingRight}}>{label}</span>
      <div style={{height:barHeight,background:trackColor||'#110804',border:'1.2px solid #2a1a08',borderRadius:2,overflow:'visible',position:'relative',minWidth:0,width:'100%'}}>
        <div style={{height:'100%',width:`${Math.min(10,val)*10}%`,background:color,transition:'width .35s',borderRadius:1}}/>
        {label === 'SAN' && (
          <div style={{
            position: 'absolute',
            left: '60%',
            top: '-3px',
            bottom: '-3px',
            width: '1px',
            zIndex: 2,
            transform: 'translateX(-50%)'
          }}>
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: '50%',
              width: 0,
              height: 0,
              borderLeft: '1px solid transparent',
              borderRight: '1px solid transparent',
              borderBottom: '12px solid #a78bfa',
              transform: 'translateX(-50%)'
            }}/>
            <div style={{
              position: 'absolute',
              top: 0,
              left: '50%',
              width: 0,
              height: 0,
              borderLeft: '1px solid transparent',
              borderRight: '1px solid transparent',
              borderTop: '12px solid #a78bfa',
              transform: 'translateX(-50%)'
            }}/>
          </div>
        )}
      </div>
      <span style={{fontFamily:"'Cinzel',serif",color:val<=3?'#cc3333':'#c8a96e',fontSize:statFont,textAlign:'right',fontWeight:700,whiteSpace:'nowrap',minWidth:0,justifySelf:'end'}}>{val}</span>
    </div>
  );
}

function HoundsTimerBadge({secondsLeft,active}){
  if(!active||secondsLeft==null)return null;
  return(
    <div style={{
      position:'fixed',top:14,left:'50%',transform:'translateX(-50%)',
      width:88,height:88,borderRadius:'50%',
      background:'radial-gradient(circle at 35% 30%,#3a0a0a 0%,#170406 58%,#090102 100%)',
      border:'2px solid #b44a3a',boxShadow:'0 0 26px #b44a3a55, inset 0 0 22px #000000bb',
      zIndex:720,pointerEvents:'none',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      color:'#f0d0c8'
    }}>
      <div style={{fontSize:22,lineHeight:1,filter:'drop-shadow(0 0 8px #ff8a6a)'}}>🐺</div>
      <div style={{fontFamily:"'Cinzel',serif",fontSize:10,letterSpacing:1,color:'#f2a28e'}}>猎犬</div>
      <div style={{fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:20,color:secondsLeft<=5?'#ff7056':'#ffd7b0',textShadow:'0 0 12px currentColor'}}>{secondsLeft}</div>
    </div>
  );
}

const CARD_W=36,CARD_H=50;
const CARD_BACK_STYLE={
  width:CARD_W,height:CARD_H,borderRadius:3,
  background:'#100c08',
  border:'1.5px solid #3a2510',
  boxShadow:'inset 0 0 8px #0a0600',
  position:'absolute',
};
const DISCARD_ROTATIONS=[-14,-6,10,3,-18,7,-3,12,-9,5,-15,8];
const DISCARD_OFFSETS=[
  {x:0,y:0},{x:4,y:-3},{x:-3,y:2},{x:6,y:1},{x:-5,y:-4},{x:2,y:5},
  {x:-4,y:3},{x:5,y:-2},{x:-2,y:4},{x:3,y:-5},{x:-6,y:1},{x:1,y:3},
];

function DiscardPile({count,topCard,scale=1}){
  const vis=Math.min(count,7);
  const cardW=Math.round(CARD_W*scale);
  const cardH=Math.round(CARD_H*scale);
  const outerW=Math.round((CARD_W+30)*scale);
  const outerH=Math.round((CARD_H+20)*scale);
  if(vis===0) return(
    <div style={{width:outerW,height:outerH,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{width:cardW,height:cardH,borderRadius:3,border:'1px dashed #2a1a08',background:'transparent'}}/>
    </div>
  );
  const s=topCard&&CS[topCard.letter]?CS[topCard.letter]:GOD_CS;
  return(
    <div style={{width:outerW,height:outerH,position:'relative',flexShrink:0}}>
      {Array(vis).fill(0).map((_,i)=>{
        const rot=DISCARD_ROTATIONS[i%DISCARD_ROTATIONS.length];
        const off=DISCARD_OFFSETS[i%DISCARD_OFFSETS.length];
        const isTop=i===vis-1;
        return(
          <div key={i} style={{
            ...CARD_BACK_STYLE,
            width:cardW,height:cardH,
            left:Math.round((15+off.x)*scale),top:Math.round((10+off.y)*scale),
            transform:`rotate(${rot}deg)`,
            ...(isTop&&topCard?{
              background:s.bg,
              border:`1.5px solid ${s.borderBright}`,
              boxShadow:`0 0 6px ${s.glow}66`,
            }:{}),
            zIndex:i,
          }}>
            {isTop&&topCard&&(
              <div style={{
                position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:`${Math.round(3*scale)}px ${Math.round(2*scale)}px`,textAlign:'center',lineHeight:1.1,
              }}>
                <div style={{
                  fontFamily:"'Cinzel',serif",fontWeight:700,color:s.text,fontSize:Math.round(topCard.isGod?10*scale:11*scale),letterSpacing:topCard.isGod?1:0,
                }}>
                  {topCard.isGod?(topCard.godKey||'GOD'):topCard.key}
                </div>
                {topCard.isGod&&topCard.name&&(
                  <div style={{
                    marginTop:Math.round(2*scale),fontFamily:"'Cinzel',serif",fontWeight:600,color:'#e8cc88',fontSize:Math.round(5*scale),
                  }}>
                    {topCard.name}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export { HoundsTimerBadge, StatBar, DiscardPile };
