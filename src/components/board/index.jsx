import React from 'react';
import { CS, GOD_CS, RINFO, GOD_DEFS } from '../../constants/card';
import { DDCard, DDCardBack } from '../cards';

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

// ── Green cross heal particles ──────────────────────────────────
const CROSS_POSITIONS=[
  [18,65],[32,50],[50,72],[65,42],[80,60],[22,38],[70,28],[45,82],[55,18],[35,78],
  [75,52],[12,55],[88,35],[42,25],[60,68],
];
function HealCrossEffect({color='#4ade80'}){
  return(
    <div style={{position:'absolute',inset:0,overflow:'hidden',pointerEvents:'none',zIndex:50}}>
      {CROSS_POSITIONS.map(([lp,tp],i)=>{
        const sz=6+Math.random()*5|0;
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

function DeckPile({count,scale=1}){
  const vis=Math.min(count,7);
  const cardW=Math.round(CARD_W*scale);
  const cardH=Math.round(CARD_H*scale);
  const outerW=Math.round((CARD_W+12)*scale);
  const outerH=Math.round((CARD_H+12)*scale);
  if(vis===0) return(
    <div style={{width:outerW,height:outerH,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{width:cardW,height:cardH,borderRadius:3,border:'1px dashed #2a1a08',background:'transparent'}}/>
    </div>
  );
  return(
    <div style={{width:outerW,height:outerH,position:'relative',flexShrink:0}}>
      {Array(vis).fill(0).map((_,i)=>{
        const style={
          ...CARD_BACK_STYLE,
          width:cardW,height:cardH,
          left:Math.round(i*1.4*scale),top:Math.round((vis-1-i)*1.4*scale),
          zIndex:i,
          background:'linear-gradient(135deg,#1e1208,#0e0804)',
          border:'1.5px solid #4a3010',
        };
        return(
          <div key={i} style={style}>
            {i===vis-1&&<div style={{
              position:'absolute',inset:0,borderRadius:3,
              background:'repeating-linear-gradient(45deg,#2a1a0820 0px,#2a1a0820 1px,transparent 1px,transparent 4px)',
            }}/>}
          </div>
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

function PileDisplay({deckCount,discardCount,discardTop,inspectionCount,compact,deckRef,discardRef,scaleRatio}){
  const fontZoom = scaleRatio && scaleRatio < 1 ? 1 / scaleRatio : 1;
  const _ = (px) => px * fontZoom;
  const pileWrapRef=React.useRef(null);
  const [pileWrapWidth,setPileWrapWidth]=React.useState(0);
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
      {/* Inspection deck — top-left corner */}
      <div data-inspection-pile style={{position:'absolute',top:4,left:8,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
        <InspectionPile count={inspectionCount} scale={pileScale}/>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:_(11),color:'#90a8d8',fontWeight:700,letterSpacing:1,textAlign:'center',textShadow:'0 0 8px #000000'}}>检定:{inspectionCount}</div>
      </div>
      {/* Deck — top-right corner */}
      <div ref={deckRef} data-deck-pile style={{position:'absolute',top:4,right:8,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
        <DeckPile count={deckCount} scale={pileScale}/>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:_(11),color:'#c8a96e',fontWeight:700,letterSpacing:1,textAlign:'center',textShadow:'0 0 8px #000000'}}>牌堆:{deckCount}</div>
      </div>
      {/* Discard — center */}
      <div ref={discardRef} data-discard-pile style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
        <DiscardPile count={discardCount} topCard={discardTop} scale={pileScale}/>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:_(12),color:'#c8a96e',fontWeight:700,letterSpacing:1,textAlign:'center',textShadow:'0 0 10px #000000'}}>弃牌堆:{discardCount}</div>
      </div>
    </div>
  );
}

// ── PlayerPanel ─────────────────────────────────────────────────
function PlayerPanel({player,playerIndex,isCurrentTurn,isSelectable,onSelect,showFaceUp,onCardSelect,isBeingHit,isSanHit,isHpHeal,isSanHeal,isBeingGuillotined,displayStats,scaleRatio,viewportWidth}){
  const ri=RINFO[player.role];
  const fontZoom = scaleRatio && scaleRatio < 1 ? 1 / scaleRatio : 1;
  const _ = (px) => px * fontZoom;
  const borderColor=isBeingHit?'#cc2222':isSanHit?'#8840cc':isCurrentTurn?'#c8a96e':isSelectable?ri.col:'#3a2510';
  const handCards=showFaceUp?player.hand:player.hand.map((_,ci)=>({id:`back-${playerIndex}-${ci}`,_back:true}));
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
    ? Math.max(0, Math.ceil(((handCards.length*computedCardWidth)-handStripWidth)/(handCards.length-1)))
    : 0;
  return(
    <div onClick={isSelectable?onSelect:undefined} style={{
      width:'100%',
      background:isCurrentTurn?'#1c1408':'#140f08',
      border:`1.5px solid ${borderColor}`,
      boxShadow:isCurrentTurn?`0 0 20px #c8a96e22,inset 0 0 16px #c8a96e08`:isSelectable?`0 0 14px ${ri.col}44`:'none',
      borderRadius:3,padding:'8px 9px',
      cursor:isSelectable?'pointer':'default',
      opacity: isBeingGuillotined ? 0 : (player.isDead && !player._pendingAnimDeath ? 0.32 : 1),
      filter: player.isDead && !player._pendingAnimDeath ? 'grayscale(0.85) brightness(0.6)' : 'none',
      transition:'all .2s',
      position:'relative',
      overflow:'hidden',
    }}>
      {(isHpHeal||isSanHeal)&&<HealCrossEffect color={isSanHeal?'#a78bfa':'#4ade80'}/>}
      {/* Name plate */}
      <div style={{
        display:'flex',alignItems:'center',gap:6,marginBottom:6,
        borderBottom:'1px solid #2a1a08',paddingBottom:5,
      }}>
        <span style={{fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:_(11),color:isCurrentTurn?'#e8c87a':'#c8a96e',letterSpacing:1}}>{player.name}</span>
        {(player.roleRevealed||player.isDead)&&<span style={{fontSize:_(10),color:ri.col,fontFamily:"'Cinzel',serif",letterSpacing:1,marginLeft:2}}>{ri.icon} {player.role}</span>}
        {player.isDead&&<span style={{fontSize:_(11),color:'#882020',marginLeft:'auto'}}>☠</span>}
        {player.isResting&&!player.isDead&&<span style={{fontSize:_(9),color:'#4ade80',marginLeft:'auto',letterSpacing:1,filter:'drop-shadow(0 0 4px #4ade80)'}}>♥ 翻面中</span>}
        {isCurrentTurn&&!player.isDead&&!player.isResting&&<span style={{fontSize:_(9),color:'#c8a96e',marginLeft:'auto',letterSpacing:1}}>▸ 行动</span>}
      </div>
      <StatBar label="HP"  val={displayStats?.[playerIndex]?.hp ?? player.hp}  color="#8b1515" trackColor="#1a0808" scaleRatio={scaleRatio} viewportWidth={viewportWidth}/>
      <StatBar label="SAN" val={displayStats?.[playerIndex]?.san ?? player.san} color="#4a1080" trackColor="#120820" scaleRatio={scaleRatio} viewportWidth={viewportWidth}/>
      {/* Skull counter + god zone */}
      {((player.godEncounters||0)>0||(player.godZone||[]).length>0)&&(
        <div style={{display:'flex',alignItems:'center',gap:4,marginTop:4,flexWrap:'wrap'}}>
          {(player.godEncounters||0)>0&&(
            <span style={{fontSize:9,color:'#8b6060',letterSpacing:1,fontFamily:"'Cinzel',serif"}}>
              {'💀'.repeat(Math.min(player.godEncounters,6))}{player.godEncounters>6?`×${player.godEncounters}`:''}
            </span>
          )}
          {(player.godZone||[]).length>0&&player.godName&&(
            <span style={{
              fontSize:8,color:GOD_DEFS[player.godName]?.col||'#c06020',
              background:'#100808',border:`1px solid ${GOD_DEFS[player.godName]?.col||'#c06020'}44`,
              borderRadius:2,padding:'1px 4px',fontFamily:"'Cinzel',serif",letterSpacing:0.5,
            }}>
              {GOD_DEFS[player.godName]?.power} Lv.{player.godLevel}
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
        overflow:'hidden',
      }} data-player-hand-strip={playerIndex} ref={handStripRef}>
        {handCards.map((card,ci)=>{
          const marginLeft=shouldFillFlatHand?0:(ci===0?0:(handOverlap>0?-handOverlap:HAND_CARD_GAP));
          const width=shouldFillFlatHand?undefined:(handStripWidth>0?computedCardWidth:stretchedHandSlotWidth);
          return(
            <div key={card.id||`hand-${playerIndex}-${ci}`} style={{
              marginLeft,
              flex:'0 0 auto',
              width,
              position:'relative',
              zIndex:ci+1
            }}>
              {card._back
                ?<DDCardBack small frameStyle={shouldFillFlatHand?filledHandFrameStyle:sharedHandFrameStyle}/>
                :<DDCard card={card} small onClick={onCardSelect?()=>onCardSelect(ci):undefined} highlight={!!onCardSelect} holderId={playerIndex} frameStyle={shouldFillFlatHand?filledHandFrameStyle:sharedHandFrameStyle}/>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { HoundsTimerBadge, StatBar, DiscardPile, HealCrossEffect, DeckPile, InspectionPile, PileDisplay, PlayerPanel };
