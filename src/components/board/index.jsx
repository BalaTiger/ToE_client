import React from 'react';
import { CS, GOD_CS, GOD_DEFS } from '../../constants/card';
import { getBoardTheme } from '../../constants/theme';
import { RINFO } from '../../game';
import { isBlackGoatYoung, isTsathogguaSlime } from '../../game/coreUtils';
import { AnimatedCardBack, AreaTooltip, CardCodeLabel, DDCard, DDCardBack, GodTooltip } from '../cards';
import { useCardHoverTooltip } from '../cards/useCardHoverTooltip';
import { ThemeCornerOrnament } from '../theme/ThemeOrnaments';
import { getFontZoomCompensate } from '../../utils/scale';

function StatBar({label,val,color,trackColor,scaleRatio,viewportWidth,labelColor='var(--toe-muted,#a07838)',valueColor='var(--toe-text,#c8a96e)',lineColor='var(--toe-line-dim,#2a1a08)'}){
  const fontZoom = getFontZoomCompensate(scaleRatio);
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
    <div data-stat-label={label} style={{display:'grid',gridTemplateColumns:`${labelCol} minmax(0,1fr) ${valueCol}`,alignItems:'center',columnGap:columnGap,marginBottom:4,width:rowWidth,marginLeft:'auto',marginRight:'auto',boxSizing:'border-box',overflow:'visible'}}>
      <span style={{fontFamily:"'Cinzel',serif",color:labelColor,fontSize:statFont,fontWeight:700,letterSpacing:0.3,textAlign:'left',whiteSpace:'nowrap',minWidth:0,paddingRight:labelPaddingRight}}>{label}</span>
      <div style={{height:barHeight,background:trackColor||'#110804',border:`1.2px solid ${lineColor}`,borderRadius:2,overflow:'visible',position:'relative',minWidth:0,width:'100%'}}>
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
      <span style={{fontFamily:"'Cinzel',serif",color:val<=3?'#cc3333':valueColor,fontSize:statFont,textAlign:'right',fontWeight:700,whiteSpace:'nowrap',minWidth:0,justifySelf:'end'}}>{val}</span>
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
function getCardBackFrameColors(expansionKey){
  const theme=getBoardTheme(expansionKey);
  return {
    border: theme.line,
    shadow: '0 1px 5px rgba(0,0,0,0.45), inset 0 0 8px rgba(0,0,0,0.45)',
  };
}

function MiniCardLabel({card,scale=1,glowColor='#c8a96e',ambient=true}){
  if(!card)return null;
  const name=card.name||'';
  return(
    <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:`${Math.max(2,Math.round(3*scale))}px ${Math.max(2,Math.round(2*scale))}px`,textAlign:'center',lineHeight:1.05,background:ambient?'radial-gradient(circle at 45% 35%,rgba(255,230,120,0.14),rgba(0,0,0,0) 72%)':'transparent'}}>
      <CardCodeLabel card={card} scale={scale} textShadow={`0 0 8px ${glowColor}`}/>
      {name&&(
        <div style={{marginTop:Math.max(1,Math.round(2*scale)),fontFamily:"'IM Fell English','Georgia',serif",fontWeight:600,color:'#e8cc88',fontSize:Math.max(5,Math.round((name.length>6?4.2:4.8)*scale)),lineHeight:1.02,wordBreak:'break-word',overflowWrap:'anywhere',maxWidth:'100%'}}>
          {name}
        </div>
      )}
    </div>
  );
}

function ZhuLitMiniCard({lit,deckIndex,scale,cardW,cardH,left,top,zIndex,hidden}){
  const {hover,tooltipPosition,cardRef,handleMouseEnter,handleMouseLeave}=useCardHoverTooltip();
  const litCard=lit?.card;
  const s=litCard?.isGod?GOD_CS:(CS[litCard?.letter]||GOD_CS);
  if(hidden){
    return <div style={{...CARD_BACK_STYLE,width:cardW,height:cardH,left,top,zIndex,opacity:0,pointerEvents:'none'}}/>;
  }
  return(
    <>
      <div
        ref={cardRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          ...CARD_BACK_STYLE,
          width:cardW,height:cardH,
          left,top,zIndex,
          background:s.bg,
          border:`1.5px solid ${s.borderBright}`,
          boxShadow:`0 0 ${Math.round(12*scale)}px ${GOD_DEFS.ZHU.col}88, inset 0 0 10px rgba(255,220,120,0.18)`,
          '--zhu-rot':`${-5+deckIndex*1.5}deg`,
          animation:`zhuLitCardPop 0.42s cubic-bezier(0.22,1,0.36,1) both`,
          pointerEvents:'auto',
        }}
      >
        <MiniCardLabel card={litCard} scale={scale} glowColor={GOD_DEFS.ZHU.col}/>
      </div>
      {hover&&litCard?.isGod&&<GodTooltip def={GOD_DEFS[litCard.godKey]} godLevel={1} position={tooltipPosition}/>}
      {hover&&litCard&&!litCard.isGod&&<AreaTooltip card={litCard} position={tooltipPosition}/>}
    </>
  );
}

function DiscardPile({count,topCard,scale=1,expansionKey='地神的潜影'}){
  const vis=Math.min(count,7);
  const frameColors=getCardBackFrameColors(expansionKey);
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
        const style={
            ...CARD_BACK_STYLE,
            width:cardW,height:cardH,
            left:Math.round((15+off.x)*scale),top:Math.round((10+off.y)*scale),
            transform:`rotate(${rot}deg)`,
            ...(isTop&&topCard?{
              background:s.bg,
              border:`1.5px solid ${s.border}`,
              boxShadow:'0 1px 5px rgba(0,0,0,0.5), inset 0 0 8px rgba(0,0,0,0.35)',
            }:{
              border:`1.5px solid ${frameColors.border}`,
              boxShadow:frameColors.shadow,
            }),
            zIndex:i,
          };
        if(isTop&&topCard){
          return(
            <div key={i} style={style}>
              <MiniCardLabel card={topCard} scale={scale} glowColor="rgba(0,0,0,0.65)" ambient={false}/>
            </div>
          );
        }
        return(
          <AnimatedCardBack key={i} expansionKey={expansionKey} style={style}/>
        );
      })}
    </div>
  );
}

// ── Green cross heal particles ──────────────────────────────────
const CROSS_POSITIONS=[
  [18,65],[32,50],[50,72],[65,42],[80,60],[22,38],[70,28],[45,82],[55,18],[35,78],
  [75,52],[12,55],[88,35],[42,25],[60,68],
];
const CROSS_SIZES=CROSS_POSITIONS.map(()=>6+(Math.random()*5|0));
function HealCrossEffect({color='#4ade80'}){
  return(
    <div style={{position:'absolute',inset:0,overflow:'hidden',pointerEvents:'none',zIndex:50}}>
      {CROSS_POSITIONS.map(([lp,tp],i)=>{
        const sz=CROSS_SIZES[i];
        const delay=(0.05*i).toFixed(2);
        return(
          <div key={i} style={{
            position:'absolute',
            left:`${lp}%`,top:`${tp}%`,
            width:sz,height:sz,
            opacity:0,
            animation:`healCross 1.2s ease-out ${delay}s both`,
          }}>
            {/* Horizontal bar */}
            <div style={{position:'absolute',top:'33%',left:0,right:0,height:'34%',background:color,borderRadius:1,boxShadow:`0 0 4px ${color}`}}/>
            {/* Vertical bar */}
            <div style={{position:'absolute',left:'33%',top:0,bottom:0,width:'34%',background:color,borderRadius:1,boxShadow:`0 0 4px ${color}`}}/>
          </div>
        );
      })}
    </div>
  );
}

// ── Deck / Inspection / PileDisplay ─────────────────────────────

function DeckPile({count,scale=1,expansionKey='地神的潜影',zhuLitCards=[],zhuHiddenCardId=null}){
  const vis=Math.min(count,7);
  const frameColors=getCardBackFrameColors(expansionKey);
  const cardW=Math.round(CARD_W*scale);
  const cardH=Math.round(CARD_H*scale);
  const outerW=Math.round((CARD_W+12)*scale);
  const outerH=Math.round((CARD_H+12)*scale);
  const litByDeckIndex=new Map((zhuLitCards||[]).map(item=>[item.deckIndex,item]));
  if(vis===0) return(
    <div style={{width:outerW,height:outerH,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{width:cardW,height:cardH,borderRadius:3,border:'1px dashed #2a1a08',background:'transparent'}}/>
    </div>
  );
  return(
    <div style={{width:outerW,height:outerH,position:'relative',flexShrink:0}}>
      {Array(vis).fill(0).map((_,i)=>{
        const deckIndex=vis-1-i;
        const lit=litByDeckIndex.get(deckIndex);
        const litCard=lit?.card;
        if(litCard){
          const pull=Math.round((18+deckIndex*3)*scale);
          return(
            <ZhuLitMiniCard
              key={`zhu-lit-${litCard.id||deckIndex}-${lit.lightNonce||0}`}
              lit={lit}
              deckIndex={deckIndex}
              scale={scale}
              cardW={cardW}
              cardH={cardH}
              left={Math.round(i*1.4*scale)-pull}
              top={Math.round((vis-1-i)*1.4*scale)}
              zIndex={i}
              hidden={litCard.id===zhuHiddenCardId}
            />
          );
        }
        const style={
          ...CARD_BACK_STYLE,
          width:cardW,height:cardH,
          left:Math.round(i*1.4*scale),top:Math.round((vis-1-i)*1.4*scale),
          zIndex:i,
          border:`1.5px solid ${frameColors.border}`,
          boxShadow:frameColors.shadow,
        };
        return(
          <AnimatedCardBack key={i} expansionKey={expansionKey} style={style} />
        );
      })}
    </div>
  );
}

function InspectionPile({count,scale=1}){
  const vis=Math.min(Math.max(count,0),5);
  const cardW=Math.round(CARD_W*scale);
  const cardH=Math.round(CARD_H*scale);
  const outerW=Math.round((CARD_W+10)*scale);
  const outerH=Math.round((CARD_H+10)*scale);
  return(
    <div style={{width:outerW,height:outerH,position:'relative',flexShrink:0}}>
      {Array(Math.max(vis,1)).fill(0).map((_,i)=>{
        const style={
          ...CARD_BACK_STYLE,
          width:cardW,height:cardH,
          left:Math.round(i*1.2*scale),top:Math.round((Math.max(vis,1)-1-i)*1.2*scale),
          zIndex:i,
          background:'linear-gradient(135deg,#151c28,#090d15)',
          border:'1.5px solid #6a7fa8',
          boxShadow:'0 0 16px #6a7fa833,inset 0 0 8px #00000088',
        };
        return(
          <div key={i} style={style}>
            <div style={{position:'absolute',inset:0,borderRadius:3,
              background:'repeating-linear-gradient(45deg,#8ca4d220 0px,#8ca4d220 1px,transparent 1px,transparent 4px)'}}/>
            {i===Math.max(vis,1)-1&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,color:'#d7e6ff',textShadow:'0 0 10px #9dc1ff'}}>◈</div>}
          </div>
        );
      })}
    </div>
  );
}

function DiscardOverlay({cards,onClose}){
  if(!cards||!cards.length)return null;
  return(
    <div onClick={onClose} style={{
      position:'fixed',inset:0,zIndex:99999,
      background:'rgba(0,0,0,0.85)',
      display:'flex',alignItems:'center',justifyContent:'center',
      padding:'40px 20px',
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        maxWidth:900,width:'100%',maxHeight:'85vh',
        display:'flex',flexDirection:'column',alignItems:'center',gap:16,
      }}>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:18,color:'#c8a96e',letterSpacing:2,textShadow:'0 0 12px #000'}}>弃牌堆 ({cards.length}张)</div>
        <div style={{
          display:'flex',flexWrap:'wrap',justifyContent:'center',gap:10,
          overflowY:'auto',padding:'10px 6px',width:'100%',
        }}>
          {[...cards].reverse().map((c,i)=>(
            <DDCard key={c.id||`disc-${i}`} card={c}/>
          ))}
        </div>
        <div style={{fontFamily:"'Microsoft YaHei','SimHei',sans-serif",fontSize:12,color:'#7a5a2a',marginTop:4}}>点击任意位置关闭</div>
      </div>
    </div>
  );
}

function PetrifyingFormulaDie({ state, fontSize }) {
  if (!state?.active || !Number.isFinite(state.progress)) return null;
  const dots = Math.max(1, Math.min(6, state.progress));
  const pipLayouts = {
    1: [[50, 50]],
    2: [[32, 32], [68, 68]],
    3: [[30, 30], [50, 50], [70, 70]],
    4: [[30, 30], [70, 30], [30, 70], [70, 70]],
    5: [[30, 30], [70, 30], [50, 50], [30, 70], [70, 70]],
    6: [[30, 26], [70, 26], [30, 50], [70, 50], [30, 74], [70, 74]],
  };
  const dieSize = 42;
  const faceRadius = 7;
  return (
    <div
      title={`石化配方进度：${dots}`}
      style={{
        position: 'absolute',
        left: 16,
        bottom: 12,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 5,
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      <div style={{
        position: 'relative',
        width: dieSize,
        height: dieSize,
        filter: 'drop-shadow(0 4px 8px #00000088) drop-shadow(0 0 10px #9fb6a855)',
      }}>
        <div style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: dieSize,
          height: dieSize,
          borderRadius: faceRadius,
          background: 'linear-gradient(145deg,#eef4e8 0%,#c2d0c2 58%,#8fa197 100%)',
          border: '1.5px solid #dce7db',
          boxShadow: 'inset -5px -5px 10px #64766b88,inset 4px 4px 9px #ffffffaa',
        }}>
          {(pipLayouts[dots] || pipLayouts[1]).map(([x, y], idx) => (
            <span key={idx} style={{
              position: 'absolute',
              left: `${x}%`,
              top: `${y}%`,
              width: 8.5,
              height: 8.5,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 35%,#3b4b42,#111b17 72%)',
              boxShadow: 'inset 1px 1px 2px #000000cc,0 0 2px #ffffff55',
              transform: 'translate(-50%,-50%)',
            }}/>
          ))}
        </div>
      </div>
      <div style={{
        fontFamily: "'Microsoft YaHei','SimHei',sans-serif",
        fontSize: fontSize(10),
        color: '#b9c8bc',
        fontWeight: 700,
        textShadow: '0 0 8px #000',
        whiteSpace: 'nowrap',
      }}>石化配方进度</div>
    </div>
  );
}

function PileDisplay({deckCount,discardCount,discardTop,discardCards,inspectionCount,compact,deckRef,discardRef,scaleRatio,expansionKey='地神的潜影',zhuLitCards=[],zhuHiddenCardId=null,petrifyingFormula=null}){
  const theme=getBoardTheme(expansionKey);
  const fontZoom = getFontZoomCompensate(scaleRatio);
  const _ = (px) => px * fontZoom;
  const pileWrapRef=React.useRef(null);
  const [pileWrapWidth,setPileWrapWidth]=React.useState(0);
  const [discardHover,setDiscardHover]=React.useState(false);
  const [showDiscardOverlay,setShowDiscardOverlay]=React.useState(false);
  React.useLayoutEffect(()=>{
    const el=pileWrapRef.current;
    if(!el)return;
    const update=()=>setPileWrapWidth(el.clientWidth||0);
    update();
    if(typeof ResizeObserver==='undefined')return;
    const ro=new ResizeObserver(update);
    ro.observe(el);
    return()=>ro.disconnect();
  },[]);
  const effectiveCompact=compact&&pileWrapWidth<320;
  const widthBonus=Math.max(0,pileWrapWidth-(effectiveCompact?240:320));
  const pileScale=(effectiveCompact?1.5:2.0)+Math.min(effectiveCompact?0.3:0.6,widthBonus/(effectiveCompact?320:480));
  const pileMinHeight=effectiveCompact ? 140 : 220;
  return(
    <div ref={pileWrapRef} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',position:'relative',minWidth:0,minHeight:pileMinHeight}}>
      <ThemeCornerOrnament expansionKey={expansionKey} corner="tl" size={56} opacity={0.28}/>
      <ThemeCornerOrnament expansionKey={expansionKey} corner="tr" size={56} opacity={0.28}/>
      {/* Inspection deck — top-left corner */}
      <div data-inspection-pile style={{position:'absolute',top:4,left:8,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
        <InspectionPile count={inspectionCount} scale={pileScale}/>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:_(11),color:'#90a8d8',fontWeight:700,letterSpacing:1,textAlign:'center',textShadow:'0 0 8px #000000'}}>检定:{inspectionCount}</div>
      </div>
      {/* Deck — top-right corner */}
      <div ref={deckRef} data-deck-pile style={{position:'absolute',top:4,right:8,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
        <DeckPile count={deckCount} scale={pileScale} expansionKey={expansionKey} zhuLitCards={zhuLitCards} zhuHiddenCardId={zhuHiddenCardId}/>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:_(11),color:theme.text,fontWeight:700,letterSpacing:1,textAlign:'center',textShadow:`0 0 10px ${theme.glow}55,0 0 8px #000000`}}>牌堆:{deckCount}</div>
      </div>
      <PetrifyingFormulaDie state={petrifyingFormula} fontSize={_}/>
      {/* Discard — center */}
      <div
        ref={discardRef}
        data-discard-pile
        onMouseEnter={()=>{if(discardCards&&discardCards.length>0)setDiscardHover(true);}}
        onMouseLeave={()=>setDiscardHover(false)}
        onClick={()=>{if(discardCards&&discardCards.length>0)setShowDiscardOverlay(true);}}
        style={{
          display:'flex',flexDirection:'column',alignItems:'center',gap:4,
          cursor:discardCards&&discardCards.length?'pointer':'default',
          padding:'6px 10px',borderRadius:6,
          border:discardHover?`1.5px solid ${theme.glow}`:'1.5px solid transparent',
          boxShadow:discardHover?`0 0 14px ${theme.glow}66,inset 0 0 12px ${theme.glow}22`:'none',
          transition:'all .18s',
          position:'relative',
        }}
      >
        <DiscardPile count={discardCount} topCard={discardTop} scale={pileScale} expansionKey={expansionKey}/>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:_(12),color:theme.text,fontWeight:700,letterSpacing:1,textAlign:'center',textShadow:`0 0 10px ${theme.glow}55,0 0 10px #000000`}}>弃牌堆:{discardCount}</div>
        {discardHover&&discardCards&&discardCards.length>0&&(
          <div style={{
            position:'absolute',bottom:'-18px',left:'50%',transform:'translateX(-50%)',
            fontFamily:"'Microsoft YaHei','SimHei',sans-serif",fontSize:10,color:theme.text,
            whiteSpace:'nowrap',textShadow:'0 0 6px #000',pointerEvents:'none',
          }}>点击查看</div>
        )}
      </div>
      {showDiscardOverlay&&(
        <DiscardOverlay cards={discardCards} onClose={()=>setShowDiscardOverlay(false)}/>
      )}
    </div>
  );
}

// ── PlayerPanel ─────────────────────────────────────────────────
function PlayerPanel({player,playerIndex,isCurrentTurn,isSelectable,onSelect,showFaceUp,onCardSelect,isBeingHit,isSanHit,isHpHeal,isSanHeal,isBeingGuillotined,displayStats,scaleRatio,viewportWidth,expansionKey='地神的潜影',blackGoatPulseActive=false}){
  const ri=RINFO[player.role];
  const theme=getBoardTheme(expansionKey);
  const fontZoom = getFontZoomCompensate(scaleRatio);
  const _ = (px) => px * fontZoom;
  const borderColor=isBeingHit?'#cc2222':isSanHit?'#8840cc':isCurrentTurn?theme.glow:isSelectable?ri.col:theme.line;
  const handCards=showFaceUp?player.hand:player.hand.map((c,ci)=>isBlackGoatYoung(c)||isTsathogguaSlime(c)?c:{id:`back-${playerIndex}-${ci}`,_back:true});
  const HAND_CARD_WIDTH=showFaceUp?44:36;
  const HAND_CARD_HEIGHT=showFaceUp?58:50;
  const HAND_CARD_GAP=3;
  const shouldFillFlatHand=handCards.length===4;
  const stretchedHandSlotWidth=`calc((100% - ${HAND_CARD_GAP*3}px) / 4)`;
  const handStripRef=React.useRef(null);
  const [handStripWidth,setHandStripWidth]=React.useState(0);
  React.useLayoutEffect(()=>{
    const el=handStripRef.current;
    if(!el)return;
    const update=()=>setHandStripWidth(el.clientWidth||0);
    update();
    if(typeof ResizeObserver==='undefined')return;
    const ro=new ResizeObserver(update);
    ro.observe(el);
    return()=>ro.disconnect();
  },[]);
  const computedCardWidth=handStripWidth>0
    ? Math.max(0,(handStripWidth-(HAND_CARD_GAP*3))/4)
    : HAND_CARD_WIDTH;
  const filledHandFrameStyle={width:'100%',minWidth:'100%',height:'auto',aspectRatio:`${HAND_CARD_WIDTH}/${HAND_CARD_HEIGHT}`};
  const sharedHandFrameStyle=filledHandFrameStyle;
  const handOverlap=handCards.length>4
    ? Math.min(
      Math.max(0, computedCardWidth - 12),
      Math.max(0, Math.ceil(((handCards.length*computedCardWidth)-handStripWidth)/(handCards.length-1)))
    )
    : 0;
  return(
    <div data-death-panel={playerIndex} onClick={isSelectable?onSelect:undefined} style={{
      width:'100%',
      background:isCurrentTurn?theme.panelActive:theme.panel,
      border:`1.5px solid ${borderColor}`,
      boxShadow:isCurrentTurn?`0 0 20px ${theme.glow}28,inset 0 0 16px ${theme.glow}10`:isSelectable?`0 0 14px ${ri.col}44`:'none',
      borderRadius:3,padding:'8px 9px',
      cursor:isSelectable?'pointer':'default',
      opacity: isBeingGuillotined ? 0 : (player.isDead && !player._pendingAnimDeath ? 0.32 : 1),
      filter: player.isDead && !player._pendingAnimDeath ? 'grayscale(0.85) brightness(0.6)' : 'none',
      transition:'all .2s',
      position:'relative',
      overflow:'hidden',
    }}>
      <ThemeCornerOrnament
        expansionKey={expansionKey}
        corner="tr"
        size={154}
        opacity={0.36}
        style={{top:-8,right:-8}}
      />
      {(isHpHeal||isSanHeal)&&<HealCrossEffect color={isSanHeal?'#a78bfa':'#4ade80'}/>}
      {/* Name plate */}
      <div style={{
        display:'flex',alignItems:'center',gap:6,marginBottom:6,
        borderBottom:`1px solid ${theme.lineDim}`,paddingBottom:5,
      }}>
        <span style={{fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:_(11),color:isCurrentTurn?theme.strong:theme.text,letterSpacing:1}}>{player.name}</span>
        {(player.roleRevealed||player.isDead)&&<span style={{fontSize:_(10),color:ri.col,fontFamily:"'Cinzel',serif",letterSpacing:1,marginLeft:2}}>{ri.icon} {player.role}</span>}
        {player.isDead&&<span style={{fontSize:_(11),color:'#882020',marginLeft:'auto'}}>☠</span>}
        {player.isResting&&!player.isDead&&<span data-resting-marker={playerIndex} style={{fontSize:_(9),color:'#4ade80',marginLeft:'auto',letterSpacing:1,filter:'drop-shadow(0 0 4px #4ade80)'}}>♥ 翻面中</span>}
        {isCurrentTurn&&!player.isDead&&!player.isResting&&<span style={{fontSize:_(9),color:theme.text,marginLeft:'auto',letterSpacing:1}}>▸ 行动</span>}
      </div>
      <StatBar label="HP"  val={displayStats?.[playerIndex]?.hp ?? player.hp}  color="#8b1515" trackColor="#1a0808" scaleRatio={scaleRatio} viewportWidth={viewportWidth} labelColor={theme.muted} valueColor={theme.text} lineColor={theme.lineDim}/>
      <StatBar label="SAN" val={displayStats?.[playerIndex]?.san ?? player.san} color="#4a1080" trackColor="#120820" scaleRatio={scaleRatio} viewportWidth={viewportWidth} labelColor={theme.muted} valueColor={theme.text} lineColor={theme.lineDim}/>
      {/* Skull counter + god zone */}
      {((player.godEncounters||0)>0||(player.godZone||[]).length>0||(player.etherealizeStacks||0)>0||(player.poisonStacks||0)>0)&&(
        <div data-player-god-status={playerIndex} style={{display:'flex',alignItems:'center',gap:4,marginTop:4,flexWrap:'wrap'}}>
          {(player.godEncounters||0)>0&&(
            <span style={{fontSize:9,color:'#8b6060',letterSpacing:1,fontFamily:"'Cinzel',serif"}}>
              {'💀'.repeat(Math.min(player.godEncounters,6))}{player.godEncounters>6?`×${player.godEncounters}`:''}
            </span>
          )}
          {(player.godZone||[]).length>0&&player.godName&&(
            <span data-god-power-badge={playerIndex} style={{
              fontSize:8,color:GOD_DEFS[player.godName]?.col||'#c06020',
              background:'#100808',border:`1px solid ${GOD_DEFS[player.godName]?.col||'#c06020'}44`,
              borderRadius:2,padding:'1px 4px',fontFamily:"'Cinzel',serif",letterSpacing:0.5,
            }}>
              {GOD_DEFS[player.godName]?.power} Lv.{player.godLevel}
            </span>
          )}
          {(player.etherealizeStacks||0)>0&&(
            <span
              title="虚化：回合外即将失去 HP/SAN 时，可消耗 1 层令相邻角色失去"
              style={{
                fontSize:10,color:'#b9d8f0',
                background:'#0c1118',border:'1px solid #87a9c866',
                borderRadius:3,padding:'2px 6px',fontFamily:"'Cinzel',serif",letterSpacing:0.5,
                lineHeight:1.2,
                boxShadow:'0 0 8px #87a9c822',
              }}
            >
              虚化 {player.etherealizeStacks}
            </span>
          )}
          {(player.poisonStacks||0)>0&&(
            <span
              title="中毒：回合开始时失去等同层数的 HP，并消耗 1 层"
              style={{
                fontSize:10,color:'#b7f5a8',
                background:'#0d160a',border:'1px solid #74c36566',
                borderRadius:3,padding:'2px 6px',fontFamily:"'Cinzel',serif",letterSpacing:0.5,
                lineHeight:1.2,
                boxShadow:'0 0 8px #74c36522',
              }}
            >
              中毒 {player.poisonStacks}
            </span>
          )}
        </div>
      )}
      <div style={{display:'flex',flexWrap:'wrap',gap:3,marginTop:5,minWidth:0}}>
        {(player.zoneCards||[]).map((c,ci)=><DDCard key={c.id||`zone-${playerIndex}-${ci}`} card={c} small holderId={playerIndex}/>)}
      </div>
      <div style={{
        display:shouldFillFlatHand?'grid':'flex',
        gridTemplateColumns:shouldFillFlatHand?'repeat(4, minmax(0, 1fr))':undefined,
        gap:shouldFillFlatHand?HAND_CARD_GAP:undefined,
        alignItems:'flex-start',
        marginTop:5,
        minWidth:0,
        width:'100%',
        maxWidth:'100%',
        overflow:blackGoatPulseActive?'visible':'hidden',
      }} data-player-hand-strip={playerIndex} ref={handStripRef}>
        {handCards.map((card,ci)=>{
          const marginLeft=shouldFillFlatHand?0:(ci===0?0:(handOverlap>0?-handOverlap:HAND_CARD_GAP));
          const width=shouldFillFlatHand?undefined:(handStripWidth>0?computedCardWidth:stretchedHandSlotWidth);
          return(
            <div key={card.id||`hand-${playerIndex}-${ci}`} className={blackGoatPulseActive&&isBlackGoatYoung(card)?'black-goat-card-pulse':''} style={{
              marginLeft,
              flex:'0 0 auto',
              width,
              position:'relative',
              zIndex:ci+1
            }}>
              {card._back
                ?<div
                  onClick={onCardSelect?()=>onCardSelect(ci):undefined}
                  style={{
                    cursor:onCardSelect?'pointer':'default',
                    outline:onCardSelect?`1px solid ${theme.glow}88`:'none',
                    boxShadow:onCardSelect?`0 0 10px ${theme.glow}44`:'none',
                    borderRadius:3,
                  }}
                ><DDCardBack small expansionKey={expansionKey} frameStyle={shouldFillFlatHand?filledHandFrameStyle:sharedHandFrameStyle}/></div>
                :<DDCard card={card} small onClick={onCardSelect?()=>onCardSelect(ci):undefined} highlight={!!onCardSelect} holderId={playerIndex} frameStyle={shouldFillFlatHand?filledHandFrameStyle:sharedHandFrameStyle}/>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { HoundsTimerBadge, StatBar, DiscardPile, HealCrossEffect, DeckPile, InspectionPile, PileDisplay, PlayerPanel };

