import React from 'react';
import { createPortal } from 'react-dom';
import { getGameLayerTarget } from '../../ui/gameLayers';
import { GOD_DEFS } from '../../constants/card';
import { getBoardTheme } from '../../constants/theme';
import { RINFO } from '../../game';
import { isBlackGoatYoung, isTsathogguaSlime } from '../../game/coreUtils';
import { AnimatedCardBack, AreaTooltip, CardFaceImage, DDCard, DDCardBack, GodTooltip } from '../cards';
import { CARD_FACE_RATIO, CARD_FACE_WIDTH, CARD_FACE_HEIGHT } from '../cards/CardFaceAssets';
import { useCardHoverTooltip } from '../cards/useCardHoverTooltip';
import { ThemeCornerOrnament } from '../theme/ThemeOrnaments';
import { DiceFace } from '../anim/DiceFace';
import { GodHighlightBurst } from '../anim/GodHighlightBurst';
import { PlayerStatusTags } from '../playerStatus/PlayerStatusTags';
import { EncounterSkulls } from '../playerStatus/EncounterSkulls';
import { getFontZoomCompensate } from '../../utils/scale';
import { _getZoomCompensatedRect } from '../../utils/dom';
import { PILE_CARD_TILT } from '../../utils/cardPlane';
import { PanelFrame } from '../battle/PanelFrame';
import { useUiAppearance } from '../../ui/UiAppearance';
import { buildPublicUrl } from '../../utils/url';
import '../battle/coastal-panels.css';
import './compact-player-panel.css';

function CoastalPortrait({ playerIndex = 0, framed = false }) {
  // Portraits are decoration, never a signal of a player's hidden role.
  const portrait = playerIndex === 0 ? 'self' : ((playerIndex - 1) % 4) + 1;
  return <div className={`toe-coastal-portrait${framed ? ' toe-coastal-portrait-framed' : ''}`} aria-hidden="true"
    style={framed ? { backgroundImage: `url('${buildPublicUrl('/img/ui/coastal/hand-count.webp')}')` } : undefined}>
    <img src={buildPublicUrl(`/img/ui/coastal/portrait-${portrait}${framed && playerIndex > 0 ? '-gray' : ''}.webp`)} alt="" draggable="false" />
  </div>;
}

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
  const statFont=`clamp(${10*fontZoom}px, 1.7vw, ${12*fontZoom}px)`;
  const barHeight=`clamp(${8*fontZoom}px, 1.6vw, ${10*fontZoom}px)`;
  const columnGap=isNarrowViewport?'clamp(5px, 1.2vw, 7px)':'clamp(4px, 1vw, 6px)';
  const labelPaddingRight=isNarrowViewport?Math.ceil(2*fontZoom):0;
  return(
    <div data-stat-label={label} data-stat-low={val<=3} style={{display:'grid',gridTemplateColumns:`${labelCol} minmax(0,1fr) ${valueCol}`,alignItems:'center',columnGap:columnGap,marginBottom:4,width:rowWidth,marginLeft:'auto',marginRight:'auto',boxSizing:'border-box',overflow:'visible'}}>
      <span className="toe-stat-value" style={{fontFamily:"var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)",color:labelColor,fontSize:statFont,fontWeight:700,letterSpacing:0.3,textAlign:'left',whiteSpace:'nowrap',minWidth:0,paddingRight:labelPaddingRight}}>{label}</span>
      <div className="toe-stat-track" style={{height:barHeight,'--toe-stat-track-color':trackColor||'#110804','--toe-stat-line-color':lineColor,minWidth:0,width:'100%'}}>
        <div className="toe-stat-fill" style={{height:'100%',width:`${Math.min(10,val)*10}%`,backgroundColor:color,transition:'width .35s'}}/>
        {label === 'SAN' && (
          <div className="toe-san-threshold" aria-hidden="true" style={{left:'60%'}}/>
        )}
      </div>
      <span className="toe-stat-value" style={{fontFamily:"var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)",color:val<=3?'#e09b87':valueColor,fontVariantNumeric:'tabular-nums',fontSize:statFont,textAlign:'right',fontWeight:700,whiteSpace:'nowrap',minWidth:0,justifySelf:'end'}}>{val}</span>
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
      <div style={{fontFamily:"var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)",fontSize:10,letterSpacing:1,color:'#f2a28e'}}>猎犬</div>
      <div style={{fontFamily:"var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)",fontWeight:700,fontSize:20,color:secondsLeft<=5?'#ff7056':'#ffd7b0',textShadow:'0 0 12px currentColor'}}>{secondsLeft}</div>
    </div>
  );
}

const CARD_W=36,CARD_H=CARD_W*CARD_FACE_RATIO;
const PILE_CARD_SHADOW='0 1px 0 rgba(151,133,99,0.52), 0 3px 0 rgba(20,19,17,0.9), 0 7px 9px rgba(0,0,0,0.48), inset 0 0 8px rgba(0,0,0,0.35)';
const CARD_BACK_STYLE={
  width:CARD_W,height:CARD_H,borderRadius:3,
  aspectRatio:`${CARD_FACE_WIDTH}/${CARD_FACE_HEIGHT}`,boxSizing:'border-box',
  background:'#100c08',
  border:'none',
  boxShadow:PILE_CARD_SHADOW,
  position:'absolute',
};
function pileCardPlane(rotation=0, depth=0){
  return {
    '--toe-card-rotation':`${rotation}deg`,
    '--toe-card-depth':`${depth}px`,
    transform:`translateZ(${depth}px) rotate(${rotation}deg)`,
    transformOrigin:'center center',
    transformStyle:'preserve-3d',
  };
}
function pileDepth(count, cardWidth){
  return Math.min(18,Math.max(8,cardWidth*.14),Math.max(0,count)*.6);
}
function PileCardSurface({cardW,cardH,index,isTop,rotation=0,depth=0,thickness=0,style,children,cardRef,...events}){
  const paper='repeating-linear-gradient(0deg,#504735 0px,#b0a07b .65px,#76664e 1.1px,#433b2e 1.6px)';
  const sidePaper='repeating-linear-gradient(90deg,#504735 0px,#a39270 .65px,#716248 1.1px,#433b2e 1.6px)';
  const edgeStyle={position:'absolute',pointerEvents:'none',backfaceVisibility:'hidden'};
  return <div ref={cardRef} data-pile-card={index} data-pile-card-top={isTop || undefined}
    style={{...CARD_BACK_STYLE,width:cardW,height:cardH,...pileCardPlane(rotation,depth),...style}} {...events}>
    {children}
    {thickness>0 && <>
      <div data-pile-edge="front" aria-hidden="true" style={{...edgeStyle,left:0,top:cardH,width:cardW,height:thickness,background:paper,transformOrigin:'center top',transform:'rotateX(-90deg)'}} />
      <div data-pile-edge="left" aria-hidden="true" style={{...edgeStyle,left:-thickness,top:0,width:thickness,height:cardH,background:sidePaper,transformOrigin:'right center',transform:'rotateY(-90deg)'}} />
      <div data-pile-edge="right" aria-hidden="true" style={{...edgeStyle,left:cardW,top:0,width:thickness,height:cardH,background:sidePaper,transformOrigin:'left center',transform:'rotateY(90deg)'}} />
    </>}
  </div>;
}
// Inspection cards use their own physical deck and back artwork. Keeping this
// lightweight marker here lets AnimatedCardBack select that artwork without
// coupling the pile to an actual inspection card instance.
const INSPECTION_CARD_BACK={effect:'inspectionCardBack'};
const DISCARD_ROTATIONS=[-14,-6,10,3,-18,7,-3,12,-9,5,-15,8];
const DISCARD_OFFSETS=[
  {x:0,y:0},{x:4,y:-3},{x:-3,y:2},{x:6,y:1},{x:-5,y:-4},{x:2,y:5},
  {x:-4,y:3},{x:5,y:-2},{x:-2,y:4},{x:3,y:-5},{x:-6,y:1},{x:1,y:3},
];
function getCardBackFrameColors(expansionKey){
  const theme=getBoardTheme(expansionKey);
  return {
    border: theme.line,
    shadow: PILE_CARD_SHADOW,
  };
}

function PileCardFaceImage({card,cardW,cardH,boxShadow='none'}){
  if(!card)return null;
  const faceW=Math.min(cardW,cardH/CARD_FACE_RATIO);
  return(
    <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
      <CardFaceImage
        card={card}
        width={faceW}
        style={{
          borderRadius:3,
          boxShadow,
        }}
      />
    </div>
  );
}

function ZhuLitMiniCard({lit,deckIndex,cardW,cardH,left,top,zIndex,hidden,depth,thickness,interactive}){
  const {hover,tooltipPosition,cardRef,handleMouseEnter,handleMouseMove,handleMouseLeave}=useCardHoverTooltip();
  React.useEffect(()=>{
    if(hover&&(hidden||!interactive))handleMouseLeave();
  },[hover,hidden,interactive,handleMouseLeave]);
  const litCard=lit?.card;
  // Fit the complete buried face beneath the covering card. Uniform scaling
  // preserves its proportions; the other three corners stay inside the pile.
  const buriedWidth=cardW*.88;
  const buriedHeight=cardH*.88;
  const cornerShort=cardW*.215;
  const cornerAngle=12*Math.PI/180;
  // Cancel the table pitch's depth parallax so lower layers don't expose
  // their bottom edges or form a progressively wider fan.
  const depthInset=deckIndex*thickness*Math.tan(PILE_CARD_TILT*Math.PI/180);
  if(hidden){
    return <PileCardSurface index={deckIndex} isTop={deckIndex===0} cardW={cardW} cardH={cardH} depth={depth} thickness={thickness} style={{left,top,zIndex,opacity:0,pointerEvents:'none'}}/>;
  }
  return(
    <>
      <PileCardSurface
        cardRef={cardRef} index={deckIndex} isTop={deckIndex===0}
        cardW={cardW} cardH={cardH} depth={depth} thickness={thickness}
        data-zhu-lit-interactive={interactive?'true':'false'}
        onMouseEnter={interactive?handleMouseEnter:undefined}
        onMouseMove={interactive?handleMouseMove:undefined}
        onMouseLeave={interactive?handleMouseLeave:undefined}
        style={{
          left,top,zIndex,
          background:'transparent',
          border:'none',
          pointerEvents:interactive?'auto':'none',
        }}
      >
        {deckIndex===0?<PileCardFaceImage card={litCard} cardW={cardW} cardH={cardH}/>:<div data-zhu-lit-peek style={{
          position:'absolute',left:-cornerShort*Math.cos(cornerAngle),top:buriedWidth*Math.sin(cornerAngle)+cardW*.008-depthInset,
          width:buriedWidth,height:buriedHeight,transform:'rotate(-12deg)',transformOrigin:'top left',
          pointerEvents:interactive?'auto':'none',
        }}>
          <div style={{position:'absolute',inset:0,
            '--zhu-pop-x':`${cardW/16}px`,animation:'zhuLitCardPop 0.42s cubic-bezier(0.22,1,0.36,1) both',
          }}>
            <PileCardFaceImage card={litCard} cardW={buriedWidth} cardH={buriedHeight}/>
            {interactive&&<svg data-zhu-lit-corner aria-hidden="true" width={buriedWidth} height={buriedHeight}
              style={{position:'absolute',inset:0,overflow:'visible',pointerEvents:'none'}}>
              <polyline points={`${buriedWidth},0 0,0 0,${buriedHeight}`} fill="none"
                stroke={GOD_DEFS.ZHU.col} strokeWidth={1.4} strokeLinejoin="round"
                style={{filter:`drop-shadow(0 0 2px ${GOD_DEFS.ZHU.col}cc) drop-shadow(0 0 4px ${GOD_DEFS.ZHU.col}80)`}}/>
            </svg>}
          </div>
        </div>}
      </PileCardSurface>
      {interactive&&hover&&litCard?.isGod&&<GodTooltip def={GOD_DEFS[litCard.godKey]} godLevel={1} position={tooltipPosition}/>}
      {interactive&&hover&&litCard&&!litCard.isGod&&<AreaTooltip card={litCard} position={tooltipPosition}/>}
    </>
  );
}

function DiscardPile({count,topCard,scale=1,expansionKey='地神的潜影',compactStack=false,stackPadding=20}){
  const vis=Math.min(count,7);
  const frameColors=getCardBackFrameColors(expansionKey);
  const cardW=Math.round(CARD_W*scale);
  const cardH=cardW*CARD_FACE_RATIO;
  const offsetScale=compactStack?1:scale;
  const verticalPadding=compactStack?stackPadding:20*scale;
  const outerW=cardW+Math.round(30*offsetScale);
  const outerH=cardH+Math.round(verticalPadding);
  const thickness=vis>0?pileDepth(count,cardW)/vis:0;
  if(vis===0) return(
    <div style={{width:outerW,height:outerH,display:'flex',alignItems:'center',justifyContent:'center',transformStyle:'preserve-3d'}}>
      <PileCardSurface index="empty" isTop cardW={cardW} cardH={cardH} style={{position:'relative',border:'1px dashed #2a1a08',background:'transparent',boxShadow:'none'}}/>
    </div>
  );
  return(
    <div style={{width:outerW,height:outerH,position:'relative',flexShrink:0,transformStyle:'preserve-3d'}}>
      {Array(vis).fill(0).map((_,i)=>{
        const rot=DISCARD_ROTATIONS[i%DISCARD_ROTATIONS.length]*(compactStack ? .35*stackPadding/20 : 1);
        const off=DISCARD_OFFSETS[i%DISCARD_OFFSETS.length];
        const isTop=i===vis-1;
        const style={
            left:Math.round((15+off.x)*offsetScale),top:Math.round((10+off.y)*verticalPadding/20),
            ...(isTop&&topCard?{
              background:'transparent',
              border:'none',
              boxShadow:PILE_CARD_SHADOW,
            }:{
              border:'none',
              boxShadow:frameColors.shadow,
            }),
            zIndex:i,
          };
        if(isTop&&topCard){
          return(
            <PileCardSurface key={i} index={i} isTop={isTop} cardW={cardW} cardH={cardH} rotation={rot} depth={(i+1)*thickness} thickness={thickness} style={style}>
              <PileCardFaceImage card={topCard} cardW={cardW} cardH={cardH} boxShadow="none"/>
            </PileCardSurface>
          );
        }
        return(
          <PileCardSurface key={i} index={i} isTop={isTop} cardW={cardW} cardH={cardH} rotation={rot} depth={(i+1)*thickness} thickness={thickness} style={style}>
            <AnimatedCardBack expansionKey={expansionKey} style={{position:'absolute',inset:0,borderRadius:3}}/>
          </PileCardSurface>
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
const CROSS_SIZES=CROSS_POSITIONS.map((_,index)=>6+(index*3)%5);
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

function DeckPile({count,scale=1,expansionKey='地神的潜影',zhuLitCards=[],zhuHiddenCardId=null,compactStack=false}){
  const vis=Math.min(count,7);
  const frameColors=getCardBackFrameColors(expansionKey);
  const cardW=Math.round(CARD_W*scale);
  const cardH=cardW*CARD_FACE_RATIO;
  const offsetScale=compactStack?1:scale;
  const outerW=cardW+Math.round(12*offsetScale);
  const outerH=cardH+Math.round(12*offsetScale);
  const thickness=vis>0?pileDepth(count,cardW)/vis:0;
  // Preserve the top-card anchor while aligning every paper layer beneath it.
  const cardLeft=Math.round(Math.max(0,vis-1)*1.4*offsetScale);
  const litByDeckIndex=new Map((zhuLitCards||[]).map(item=>[item.deckIndex,item]));
  const topLitIndex=Math.min(...[...litByDeckIndex]
    .filter(([index,lit])=>index>=0&&index<vis&&lit?.card&&lit.card.id!==zhuHiddenCardId)
    .map(([index])=>index));
  if(vis===0) return(
    <div style={{width:outerW,height:outerH,display:'flex',alignItems:'center',justifyContent:'center',transformStyle:'preserve-3d'}}>
      <PileCardSurface index="empty" isTop cardW={cardW} cardH={cardH} style={{position:'relative',border:'1px dashed #2a1a08',background:'transparent',boxShadow:'none'}}/>
    </div>
  );
  return(
    <div style={{width:outerW,height:outerH,position:'relative',flexShrink:0,transformStyle:'preserve-3d'}}>
      {Array(vis).fill(0).map((_,i)=>{
        const deckIndex=vis-1-i;
        const lit=litByDeckIndex.get(deckIndex);
        const litCard=lit?.card;
        if(litCard){
          return(
            <ZhuLitMiniCard
              key={`zhu-lit-${litCard.id||deckIndex}-${lit.lightNonce||0}`}
              lit={lit}
              deckIndex={deckIndex}
              cardW={cardW}
              cardH={cardH}
              depth={(i+1)*thickness}
              thickness={thickness}
              // All lit cards share one small peek; only the nearest visible
              // card owns its corner highlight and hover target.
              left={cardLeft}
              top={0}
              zIndex={i}
              hidden={litCard.id===zhuHiddenCardId}
              interactive={deckIndex===topLitIndex}
            />
          );
        }
        const style={
          left:cardLeft,top:0,
          zIndex:i,
          border:'none',
          boxShadow:frameColors.shadow,
        };
        return(
          <PileCardSurface key={i} index={i} isTop={deckIndex===0} cardW={cardW} cardH={cardH} depth={(i+1)*thickness} thickness={thickness} style={style}>
            <AnimatedCardBack expansionKey={expansionKey} style={{position:'absolute',inset:0,borderRadius:3}} />
          </PileCardSurface>
        );
      })}
    </div>
  );
}

function InspectionPile({count,scale=1,compactStack=false}){
  const vis=Math.min(Math.max(count,0),5);
  const cardW=Math.round(CARD_W*scale);
  const cardH=cardW*CARD_FACE_RATIO;
  const offsetScale=compactStack?1:scale;
  const outerW=cardW+Math.round(10*offsetScale);
  const outerH=cardH+Math.round(10*offsetScale);
  const thickness=vis>0?pileDepth(count,cardW)/vis:0;
  const cardLeft=Math.round(Math.max(0,vis-1)*1.2*offsetScale);
  return(
    <div style={{width:outerW,height:outerH,position:'relative',flexShrink:0,transformStyle:'preserve-3d'}}>
      {Array(Math.max(vis,1)).fill(0).map((_,i)=>{
        const style={
          left:cardLeft,top:0,
          zIndex:i,
          background:'transparent',
          border:'none',
          boxShadow:PILE_CARD_SHADOW,
        };
        return(
          <PileCardSurface key={i} index={i} isTop={i===Math.max(vis,1)-1} cardW={cardW} cardH={cardH} depth={(i+1)*thickness} thickness={thickness} style={style}>
            <AnimatedCardBack card={INSPECTION_CARD_BACK} animated={false} style={{position:'absolute',inset:0,borderRadius:3}}/>
          </PileCardSurface>
        );
      })}
    </div>
  );
}

function DiscardOverlay({cards,onClose}){
  if(!cards||!cards.length)return null;
  // Keep the full-screen gallery outside the board's zoom and screen shake.
  return createPortal(
    <div onClick={onClose} style={{
      position:'fixed',inset:0,zIndex:99999,
      background:'rgba(0,0,0,0.85)',
      display:'flex',alignItems:'center',justifyContent:'center',
      padding:'40px 20px',
    }}>
      <div className="toe-dialog toe-discard-gallery" role="dialog" aria-modal="true" aria-label="弃牌堆" onClick={event=>event.stopPropagation()} style={{
        maxWidth:900,width:'100%',maxHeight:'85vh',
        display:'flex',flexDirection:'column',alignItems:'center',gap:16,
      }}>
        <div onClick={e=>e.stopPropagation()} style={{fontFamily:"var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)",fontSize:18,color:'#c8a96e',letterSpacing:2,textShadow:'0 0 12px #000'}}>弃牌堆 · {cards.length} 张</div>
        <div style={{
          display:'flex',flexWrap:'wrap',justifyContent:'center',gap:10,
          overflowY:'auto',padding:'10px 6px',width:'100%',
        }}>
          {[...cards].reverse().map((c,i)=>(
            <div key={c.id||`disc-${i}`} onClick={e=>e.stopPropagation()}>
              <CardFaceImage
                card={c}
                width={118}
                style={{borderRadius:4,boxShadow:'0 8px 18px rgba(0,0,0,0.55)'}}
              />
            </div>
          ))}
        </div>
        <div style={{fontFamily:"var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)",fontSize:12,color:'#b8aa8c',marginTop:4}}>点击空白区域关闭</div>
        <button className="toe-button" onClick={onClose} style={{padding:'8px 24px'}}>返回对局</button>
      </div>
    </div>,
    getGameLayerTarget('overlay'),
  );
}

function PetrifyingFormulaDie({ state, fontSize, inline = false }) {
  if (!state?.active || !Number.isFinite(state.progress)) return null;
  const dots = Math.max(1, Math.min(6, state.progress));
  return (
    <div className="toe-petrifying-formula" title={`石化配方进度：${dots}`} style={{ position: 'absolute', left: 16, bottom: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, pointerEvents: 'none', zIndex: 2 }}>
      <DiceFace value={dots} size={42} />
      {inline ? <div className="toe-board-effect-copy"><span>石化配方</span><strong>进度 {dots}</strong></div>
        : <div style={{ fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Songti SC', 'SimSun', serif)", fontSize: fontSize(10), color: '#c8c5ab', fontWeight: 700, textShadow: '0 1px 3px #000', whiteSpace: 'nowrap' }}>石化配方进度</div>}
    </div>
  );
}

function PileDisplay({deckCount,discardCount,discardTop,discardCards,inspectionCount,compact,baseHeight=null,cardWidth=null,deckRef,discardRef,scaleRatio,expansionKey='地神的潜影',zhuLitCards=[],zhuHiddenCardId=null,petrifyingFormula=null}){
  const coastal = useUiAppearance().appearance.battleLayout === 'coastal';
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
  const widthFitPileScale=((coastal?3.0:effectiveCompact?1.5:2.0)+Math.min(effectiveCompact?0.3:0.6,widthBonus/(effectiveCompact?320:480))) * fontZoom;
  // Captions and paper offsets keep their own size instead of growing with the
  // card. The shortest 113px row can still show a 51px-wide middle-distance card.
  const pileExtraHeight=coastal?28:12+7+2+15*fontZoom;
  const heightFitPileScale=baseHeight ? Math.max(1,Math.floor((baseHeight*fontZoom-pileExtraHeight)/CARD_FACE_RATIO)/CARD_W) : widthFitPileScale;
  const pileScale=coastal&&cardWidth ? cardWidth/CARD_W : Math.min(widthFitPileScale,heightFitPileScale);
  const pileMinHeight=baseHeight ? Math.round(baseHeight * fontZoom) : (effectiveCompact ? 140 : 220);
  const visualCardWidth=Math.round(CARD_W*pileScale);
  const captionHeight=15*fontZoom;
  const captionStyle={fontFamily:"var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)",fontSize:_(11),lineHeight:1.25,whiteSpace:'nowrap',flexShrink:0,fontWeight:700,letterSpacing:1,textAlign:'center',textShadow:`0 0 10px ${theme.glow}55,0 0 8px #000000`};
  return(
    <div ref={pileWrapRef} className="toe-pile-display" style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',position:'relative',minWidth:0,minHeight:pileMinHeight}}>
      <ThemeCornerOrnament expansionKey={expansionKey} corner="tl" size={56} opacity={0.28}/>
      <ThemeCornerOrnament expansionKey={expansionKey} corner="tr" size={56} opacity={0.28}/>
      <div data-pile-camera style={{position:'absolute',left:0,top:0,width:'100%',height:coastal?'100%':`calc(100% - ${captionHeight+2}px)`,perspective:Math.max(600,pileWrapWidth*1.6),perspectiveOrigin:'50% 50%'}}>
      <div data-pile-table style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:coastal?'space-around':'center',gap:coastal?14:0,transform:`rotateX(${PILE_CARD_TILT}deg)`,transformOrigin:'center center',transformStyle:'preserve-3d','--toe-table-tilt':`${PILE_CARD_TILT}deg`}}>
      {/* Inspection deck — top-left corner */}
      <div data-inspection-pile aria-label={`检定牌堆，${inspectionCount}张`} style={{position:coastal?'relative':'absolute',top:coastal?undefined:4,left:coastal?undefined:8,flexShrink:0,order:0,transformStyle:'preserve-3d'}}>
        <InspectionPile count={inspectionCount} scale={pileScale} compactStack/>
      </div>
      {/* Deck — top-right corner */}
      <div ref={deckRef} data-deck-pile aria-label={`牌堆，${deckCount}张`} style={{position:coastal?'relative':'absolute',top:coastal?undefined:4,right:coastal?undefined:8,flexShrink:0,order:2,transformStyle:'preserve-3d'}}>
        <DeckPile count={deckCount} scale={pileScale} expansionKey={expansionKey} zhuLitCards={zhuLitCards} zhuHiddenCardId={zhuHiddenCardId} compactStack/>
      </div>
      {/* Discard — center */}
      <div
        ref={discardRef}
        data-discard-pile
        aria-label={`弃牌堆，${discardCount}张，点击查看`}
        onMouseEnter={()=>{if(discardCards&&discardCards.length>0)setDiscardHover(true);}}
        onMouseLeave={()=>setDiscardHover(false)}
        onClick={()=>{if(discardCards&&discardCards.length>0)setShowDiscardOverlay(true);}}
        style={{
          flexShrink:0,order:1,transformStyle:'preserve-3d',
          cursor:discardCards&&discardCards.length?'pointer':'default',
          padding:'2px',borderRadius:6,
          border:discardHover?`1.5px solid ${theme.glow}`:'1.5px solid transparent',
          boxShadow:discardHover?`0 0 14px ${theme.glow}66,inset 0 0 12px ${theme.glow}22`:'none',
          transition:'all .18s',
          position:'relative',
        }}
      >
        <DiscardPile count={discardCount} topCard={discardTop} scale={pileScale} expansionKey={expansionKey} compactStack stackPadding={coastal?20:12}/>
      </div>
      </div>
      </div>
      {!coastal && <PetrifyingFormulaDie state={petrifyingFormula} fontSize={_}/>}
      {!coastal && <div data-pile-captions style={{position:'absolute',left:0,right:0,bottom:0,height:captionHeight}}>
        <div style={{...captionStyle,position:'absolute',left:8,width:visualCardWidth+10,color:'#90a8d8'}}>检定:{inspectionCount}</div>
        <div style={{...captionStyle,position:'absolute',right:8,width:visualCardWidth+12,color:theme.text}}>牌堆:{deckCount}</div>
        <div data-discard-caption onClick={()=>{if(discardCards?.length)setShowDiscardOverlay(true);}}
          onMouseEnter={()=>{if(discardCards?.length)setDiscardHover(true);}} onMouseLeave={()=>setDiscardHover(false)}
          style={{...captionStyle,position:'absolute',left:'50%',transform:'translateX(-50%)',fontSize:_(12),color:theme.text,cursor:discardCards?.length?'pointer':'default'}}>
          弃牌堆:{discardCount}
          {discardHover&&discardCards?.length>0&&<span style={{position:'absolute',top:'100%',left:'50%',transform:'translateX(-50%)',fontSize:10,pointerEvents:'none'}}>点击查看</span>}
        </div>
      </div>}
      {showDiscardOverlay&&(
        <DiscardOverlay cards={discardCards} onClose={()=>setShowDiscardOverlay(false)}/>
      )}
    </div>
  );
}

function GodPowerBadge({player,playerIndex,pendant=false}){
  const {hover,tooltipPosition,cardRef,handleMouseEnter,handleMouseMove,handleMouseLeave}=useCardHoverTooltip();
  const def=GOD_DEFS[player.godName];
  if(!def)return null;
  return(
    <>
      <span
        ref={cardRef}
        data-god-power-badge={playerIndex}
        title={pendant ? `${def.power} Lv.${player.godLevel || 1}` : undefined}
        aria-label={pendant ? `${def.power}，等级 ${player.godLevel || 1}` : undefined}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          position:'relative',overflow:'hidden',
          '--god-power-col':def.col||'#c06020',
          '--god-power-chevron-scale':'8.5',
          fontSize:8,color:def.col||'#c06020',
          background:'#100808',border:`1px solid ${def.col||'#c06020'}44`,
          borderRadius:2,padding:'1px 4px',fontFamily:"var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)",letterSpacing:0.5,
        }}
      >
        {pendant ? `${def.power} · ${player.godLevel || 1}` : `${def.power} Lv.${player.godLevel}`}
        {/* 信仰/升级瞬间：CSS 绘制的单枚箭头横向拉伸并向上滚动（key 变化触发重播） */}
        <span
          key={`${player.godName}-${player.godLevel}`}
          className="god-power-chevron-layer"
          aria-hidden
        >
          {[0,1,2,3,4].map(r=>(
            <span key={r} className="god-power-chevron-row">
              <span className="god-power-chevron-glyph" />
            </span>
          ))}
        </span>
      </span>
      {hover&&<GodTooltip def={def} godLevel={player.godLevel||1} position={tooltipPosition}/>}
    </>
  );
}

// ── PlayerPanel ─────────────────────────────────────────────────
function PlayerPanel({player,playerIndex,isCurrentTurn,isSelectable,onSelect,showFaceUp,onCardSelect,isBeingHit,isSanHit,isHpHeal,isSanHeal,isBeingGuillotined,displayStats,scaleRatio,viewportWidth,expansionKey='地神的潜影',blackGoatPulseActive=false,godHighlightBurst=null,simplified=false}){
  const coastal = useUiAppearance().appearance.battleLayout === 'coastal';
  const ri=RINFO[player.role];
  const theme=getBoardTheme(expansionKey);
  const fontZoom = getFontZoomCompensate(scaleRatio);
  const _ = (px) => px * fontZoom;
  const selectableColor='#4ade80';
  const borderColor=isBeingHit?'#cc2222':isSanHit?'#8840cc':isSelectable?selectableColor:isCurrentTurn?theme.glow:theme.line;
  const handCards=showFaceUp?player.hand:player.hand.map((c,ci)=>isBlackGoatYoung(c)||isTsathogguaSlime(c)?c:{id:`back-${playerIndex}-${ci}`,_back:true});
  const HAND_CARD_WIDTH=showFaceUp?44:36;
  const HAND_CARD_HEIGHT=HAND_CARD_WIDTH*CARD_FACE_RATIO;
  const HAND_CARD_GAP=3;
  const shouldFillFlatHand=handCards.length===4;
  const stretchedHandSlotWidth=`calc((100% - ${HAND_CARD_GAP*3}px) / 4)`;
  const handStripRef=React.useRef(null);
  const [handStripWidth,setHandStripWidth]=React.useState(0);
  const [handStripVisualWidth,setHandStripVisualWidth]=React.useState(0);
  React.useLayoutEffect(()=>{
    const el=handStripRef.current;
    if(!el)return;
    const update=()=>{
      setHandStripWidth(el.clientWidth||0);
      // 棋盘外层有 CSS zoom，clientWidth 是未缩放的布局宽度；用 zoom 补偿后的矩形得到真实可见宽度，
      // 否则放大屏上即便卡牌可见宽度已 >90px，布局宽度仍偏小，阈值无法触发完整卡图。
      const r=_getZoomCompensatedRect(el);
      setHandStripVisualWidth(r?.width||el.clientWidth||0);
    };
    update();
    if(typeof ResizeObserver==='undefined')return;
    const ro=new ResizeObserver(update);
    ro.observe(el);
    return()=>ro.disconnect();
  },[simplified]);
  const computedCardWidth=handStripWidth>0
    ? Math.max(0,(handStripWidth-(HAND_CARD_GAP*3))/4)
    : HAND_CARD_WIDTH;
  // Hidden opponent hands still reveal derivative cards. Their outer slot is
  // responsive, so size the transparent token face from that slot instead of
  // leaving it at DDCard's fixed 44x58 "small" dimensions.
  const hiddenDerivedFaceWidth=Math.max(
    1,
    Math.min(
      computedCardWidth,
      Math.round((computedCardWidth*HAND_CARD_HEIGHT/HAND_CARD_WIDTH)/CARD_FACE_RATIO)
    )
  );
  // 卡牌的真实可见宽度（已考虑棋盘缩放），用于决定是否升级为带描述的完整卡图。
  const visualCardWidth=handStripWidth>0
    ? computedCardWidth*(handStripVisualWidth/handStripWidth)
    : computedCardWidth;
  // 完整卡图(82px) / 紧凑卡图(62px) 的自然宽度，与 DDCard 内部一致。
  const FULL_NATURAL_W=82,COMPACT_NATURAL_W=62;
  // 可见宽度足够（约等于自己手牌区完整卡图）时用带描述的完整卡图，否则退化为紧凑卡图。
  // ponytail: 阈值取完整卡自然宽度附近；描述放得下才升级。
  const FULL_REVEAL_CARD_MIN_VISUAL_WIDTH=80;
  const useFullRevealCards=showFaceUp&&handStripWidth>0&&visualCardWidth>=FULL_REVEAL_CARD_MIN_VISUAL_WIDTH;
  // 亮明手牌整体用 CSS zoom 缩放到槽位宽度（与玩家自己手牌区一致），字号/字位随之等比缩放，避免与自己手牌区差异过大。
  const revealCardZoom=computedCardWidth>0
    ? computedCardWidth/(useFullRevealCards?FULL_NATURAL_W:COMPACT_NATURAL_W)
    : 1;
  const filledHandFrameStyle={width:'100%',minWidth:'100%',height:'auto',aspectRatio:`${CARD_FACE_WIDTH}/${CARD_FACE_HEIGHT}`};
  const sharedHandFrameStyle=filledHandFrameStyle;
  const handOverlap=handCards.length>4
    ? Math.min(
      Math.max(0, computedCardWidth - 12),
      Math.max(0, Math.ceil(((handCards.length*computedCardWidth)-handStripWidth)/(handCards.length-1)))
    )
    : 0;
  const statusTags = <PlayerStatusTags
    player={player}
    playerIndex={playerIndex}
    variant={coastal ? 'pendant' : 'compact'}
    renderGodPower={presentationPlayer => (
      <span data-god-power-anchor={playerIndex} style={{display:'inline-flex',alignItems:'center'}}>
        <GodPowerBadge player={presentationPlayer} playerIndex={playerIndex} pendant={coastal}/>
      </span>
    )}
  />;
  const zones = <div className="toe-opponent-zones" style={{display:'flex',flexWrap:'wrap',gap:3,marginTop:5,minWidth:0}}>
    {(player.zoneCards||[]).map((c,ci)=><DDCard key={c.id||`zone-${playerIndex}-${ci}`} card={c} small holderId={playerIndex}/>)}
  </div>;
  return(
    <div className="toe-battle-panel toe-player-panel toe-opponent-panel" data-current-turn={isCurrentTurn} data-opponent-simplified={simplified} data-death-panel={playerIndex} aria-label={simplified?player.name:undefined} onClick={isSelectable?onSelect:undefined} style={{
      width:'100%',
      '--toe-panel-frame-color':isBeingHit?'#cc2222':isSanHit?'#8840cc':isSelectable?selectableColor:isCurrentTurn?'#d6ae51':'#8e7446',
      '--toe-coastal-opponent-frame':`url('${buildPublicUrl('/img/ui/coastal/opponent-frame.webp')}')`,
      '--toe-encounter-skull-rows':Math.ceil((player.godEncounters||0)/8),
      backgroundColor:isCurrentTurn?theme.panelActive:theme.panel,
      border:`1.5px solid ${borderColor}`,
      boxShadow:isSelectable?`0 0 14px ${selectableColor}88,inset 0 0 12px ${selectableColor}22`:isCurrentTurn?`0 0 20px ${theme.glow}28,inset 0 0 16px ${theme.glow}10`:'none',
      borderRadius:3,padding:'8px 9px',
      cursor:isSelectable?'pointer':'default',
      opacity: isBeingGuillotined ? 0 : (player.isDead ? 0.32 : 1),
      filter: player.isDead ? 'grayscale(0.85) brightness(0.6)' : 'none',
      transition:'all .2s',
      position:'relative',
      overflow:'visible',
    }}>
      {!simplified && <PanelFrame />}
      {!simplified && <ThemeCornerOrnament
        expansionKey={expansionKey}
        corner="tr"
        size={154}
        opacity={0.16}
        style={{top:-8,right:-8}}
      />}
      {godHighlightBurst?.godKey&&(
        <GodHighlightBurst
          key={godHighlightBurst.key}
          godKey={godHighlightBurst.godKey}
          fit="contain"
          panel
          delayMs={0}
          durationMs={920}
          intensity={1.08}
          style={{inset:-3}}
        />
      )}
      {(isHpHeal||isSanHeal)&&<HealCrossEffect color={isSanHeal?'#a78bfa':'#4ade80'}/>}
      {simplified && <div className="toe-opponent-compact-core">
        <div className="toe-opponent-compact-portrait">
          <CoastalPortrait playerIndex={playerIndex} framed />
          <EncounterSkulls count={player.godEncounters} playerIndex={playerIndex} variant="portrait-arc"/>
        </div>
        <div className="toe-opponent-hand-count" data-player-hand-strip={playerIndex} data-hand-card-width={28} ref={handStripRef} aria-label={`手牌 ${player.hand.length} 张`}>
          <svg viewBox="0 0 28 23" aria-hidden="true" focusable="false">
            <path d="M7 19 2 6l7-3 5 14ZM21 19l5-13-7-3-5 14Z" />
            <rect x="8.5" y="2" width="11" height="17" rx="1" />
            <path d="m14 7 2 3-2 3-2-3Z" />
          </svg>
          <span>{player.hand.length}</span>
        </div>
        <div className="toe-opponent-compact-stats" role="img" aria-label={`生命 HP ${displayStats?.[playerIndex]?.hp ?? player.hp}/10，理智 SAN ${displayStats?.[playerIndex]?.san ?? player.san}/10`}>
          <StatBar label="HP" val={displayStats?.[playerIndex]?.hp ?? player.hp} color="#a54138" trackColor="#1a0808" scaleRatio={scaleRatio} viewportWidth={viewportWidth} labelColor={theme.muted} valueColor={theme.text} lineColor={theme.lineDim}/>
          <StatBar label="SAN" val={displayStats?.[playerIndex]?.san ?? player.san} color="#3e9195" trackColor="#081b1e" scaleRatio={scaleRatio} viewportWidth={viewportWidth} labelColor={theme.muted} valueColor={theme.text} lineColor={theme.lineDim}/>
        </div>
      </div>}
      {!simplified && <div className="toe-opponent-core">
      {coastal && <CoastalPortrait playerIndex={playerIndex} framed />}
      {/* Name plate */}
      <div className="toe-opponent-heading" style={{
        display:'flex',alignItems:'center',gap:6,marginBottom:6,
        borderBottom:`1px solid ${theme.lineDim}`,paddingBottom:5,
      }}>
        <span className="toe-opponent-name" title={player.name} style={{fontFamily:"var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)",fontWeight:700,fontSize:_(12),color:isCurrentTurn?theme.strong:theme.text,letterSpacing:1}}>{player.name}</span>
        {(player.roleRevealed||player.isDead)&&<span className="toe-opponent-role" title={player.role} aria-label={player.role} style={{fontSize:_(10),color:ri.col,'--toe-role-color': player.role === '邪祀者' ? '#BA9BCB' : ri.col,fontFamily:"var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)",letterSpacing:1,marginLeft:2}}>{ri.icon} {player.role}</span>}
        {player.isDead&&<span style={{fontSize:_(11),color:'#882020',marginLeft:'auto'}}>☠</span>}
        {!coastal&&player.isResting&&!player.isDead&&<span data-resting-marker={playerIndex} style={{fontSize:_(9),color:'#4ade80',marginLeft:'auto',letterSpacing:1,filter:'drop-shadow(0 0 4px #4ade80)'}}>♥ 翻面中</span>}
        {isCurrentTurn&&!player.isDead&&!player.isResting&&<span className="toe-turn-marker" style={{fontSize:_(9),color:theme.text,marginLeft:'auto',letterSpacing:1}}>▸ 行动</span>}
      </div>
      <StatBar label="HP"  val={displayStats?.[playerIndex]?.hp ?? player.hp}  color="#a54138" trackColor="#1a0808" scaleRatio={scaleRatio} viewportWidth={viewportWidth} labelColor={theme.muted} valueColor={theme.text} lineColor={theme.lineDim}/>
      <StatBar label="SAN" val={displayStats?.[playerIndex]?.san ?? player.san} color="#76609b" trackColor="#120820" scaleRatio={scaleRatio} viewportWidth={viewportWidth} labelColor={theme.muted} valueColor={theme.text} lineColor={theme.lineDim}/>
      {!coastal && <>{statusTags}{zones}</>}
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
            <div
              key={card.id||`hand-${playerIndex}-${ci}`}
              data-player-hand-card
              data-player-hand-card-id={card.id}
              data-player-hand-card-pid={playerIndex}
              className={blackGoatPulseActive&&isBlackGoatYoung(card)?'black-goat-card-pulse':''}
              style={{
              marginLeft,
              flex:'0 0 auto',
              width,
              position:'relative',
              // Keep the whole hand in natural left-to-right stacking order. A revealed
              // derivative card may overlap the card on its left, but card backs to its
              // right must still cover it just like any other card in the hand.
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
                :<DDCard card={card} small={!showFaceUp} compact={showFaceUp&&!useFullRevealCards} onClick={onCardSelect?()=>onCardSelect(ci):undefined} highlight={!!onCardSelect} holderId={playerIndex} hideCssFrame={isBlackGoatYoung(card)||isTsathogguaSlime(card)} tokenFaceWidth={!showFaceUp&&(isBlackGoatYoung(card)||isTsathogguaSlime(card))?hiddenDerivedFaceWidth:undefined} frameStyle={showFaceUp?{zoom:revealCardZoom}:(shouldFillFlatHand?filledHandFrameStyle:sharedHandFrameStyle)}/>}
            </div>
          );
        })}
      </div>
      </div>}
      {!simplified && <EncounterSkulls count={player.godEncounters} playerIndex={playerIndex}/>}
      {!simplified && coastal && <div className="toe-opponent-pendants">
        {player.isResting&&!player.isDead&&<span data-resting-marker={playerIndex} style={{color:'#a7b79b'}}>♥ 翻面中</span>}
        {statusTags}{zones}
      </div>}
    </div>
  );
}

export { HoundsTimerBadge, StatBar, DiscardPile, HealCrossEffect, DeckPile, InspectionPile, PileDisplay, PlayerPanel, DiscardOverlay, CoastalPortrait, PetrifyingFormulaDie };

