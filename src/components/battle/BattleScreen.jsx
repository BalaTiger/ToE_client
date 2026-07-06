import { createPortal } from 'react-dom';
import { GOD_DEFS } from '../../constants/card';
import {
  RINFO,
  ROLE_TREASURE,
  ROLE_HUNTER,
  ROLE_CULTIST,
  cardLogText,
} from '../../game';
import { TUTORIAL_FLOW } from '../../game/tutorialScenario';
import { SOFT_GUIDE_DEFS } from '../../game/softGuides';
import { DESIGN_WIDTH } from '../../utils/scale';
import { DDCard, DDCardBack, GodTooltip } from '../cards';
import { PlayerPanel, PileDisplay, HoundsTimerBadge } from '../board';
import { BattleLogPanel } from '../log/BattleLogPanel';
import { BattlePhaseBar } from '../phase/BattlePhaseBar';
import {
  GodChoiceModal,
  NyaBorrowModal,
  DrawRevealModal,
  TreasureDodgeModal,
  PeekHandModal,
  TortoiseOracleModal,
} from '../modals';
import { DecipherStoneCarvingOverlay } from '../modals/DecipherStoneCarvingOverlay';
import { TargetSelectOverlay } from '../ui/TargetSelectOverlay';
import { GammaSlider } from '../ui/GammaSlider';
import { EMOJI_LIST } from '../ui/emojiData';
import { DamageLinkOverlay } from '../anim/DamageLinkOverlay';
import { RoleRevealAnim, TreasureMapAnim } from '../anim/WinAnims';
import { ApophisNightBadge } from '../anim/ApophisOverlays';
import { ThemeEdgeRelief } from '../theme/ThemeOrnaments';
import InGameTutorialOverlay from '../tutorial/InGameTutorialOverlay';
import SoftGuideOverlay from '../tutorial/SoftGuideOverlay';
import { HandArea } from './HandArea';
import { SelfPlayerPanel } from './SelfPlayerPanel';

function getPhaseActionButtonStyle({
  isMobile,
  isMobileLandscape,
  mobileCssPx,
  interactionFontSizes,
  enabled = true,
  tone = 'amber',
  marginLeft,
}) {
  const activeColors =
    tone === 'danger'
      ? { bg: '#3a1008', border: '#882020', color: '#dd6060', shadow: '#88202044' }
      : { bg: '#1a0c04', border: '#d4832a', color: '#f0a855', shadow: '#d4832a66' };
  const disabledColors = { bg: '#180e08', border: '#3a2510', color: '#3a2510', shadow: 'transparent' };
  const c = enabled ? activeColors : disabledColors;
  return {
    marginLeft,
    padding: isMobile || isMobileLandscape ? `${mobileCssPx(5)}px ${mobileCssPx(10)}px` : '6px 18px',
    background: c.bg,
    border: `1.5px solid ${c.border}`,
    color: c.color,
    fontFamily: "'Cinzel',serif",
    fontWeight: 700,
    fontSize: interactionFontSizes.body,
    borderRadius: 2,
    cursor: enabled ? 'pointer' : 'not-allowed',
    letterSpacing: isMobile ? 0.5 : 1,
    textTransform: 'uppercase',
    opacity: enabled ? 1 : 0.42,
    boxShadow: enabled ? `0 0 12px ${c.shadow},inset 0 0 6px ${c.shadow}` : 'none',
    position: 'relative',
    zIndex: 200,
  };
}

export function BattleScreen(props) {
  const {
    vw,
    isMobile,
    isMobileLandscape,
    scaleRatio,
    layoutScaleRatio,
    boardScaleRatio,
    compactBoardScaleRatio,
    mobileZoomCompensate,
    baseFontSizes,
    fontSizes,
    interactionFontSizes,
    scaledAreaSafeInsetX,
    globalShiftX,
    middleRowHeight,
    mobileHandUsesCompact,
    selfHandCardScale,
    mobileCssPx,
    boardCssPx,
    gs,
    me,
    visualMe,
    visualPlayers,
    visualDiscard,
    visualCurrentTurn,
    currentTurnPlayer,
    displayStats,
    visibleLog,
    ri,
    phase,
    myTurn,
    isVisualPlayerTurn,
    isActionControlsHidden,
    cancelable,
    showCancelBtn,
    canShowEndTurnButton,
    isDiscardPhaseResolving,
    isDiscardPhasePromptActive,
    isBlocked,
    isSpectating,
    isMultiplayer,
    displayPhaseLabel,
    cardHintText,
    isPhaseWarningText,
    isLocalHuntRevealPrompt,
    promptWarningTextColor,
    promptActiveTextColor,
    mpCthSec,
    mpTurnSec,
    mpDiscardSec,
    mpHuntSec,
    mpDecisionSec,
    isMpCthDecisionPhase,
    isLocalMpDecisionActive,
    houndsTimerVisible,
    houndsSecLeft,
    anim,
    suppressAnim,
    hitIndices,
    sanHitIndices,
    hpHealIndices,
    sanHealIndices,
    guillotinedPids,
    blackGoatPulsePid,
    godHighlightPanelBursts,
    damageLinkGhosts,
    damageLinkEstablishAnims,
    deathShake,
    earthquakeShake,
    screenShake,
    selectingOther,
    canLocalTargetSelect,
    effectiveHandLimit,
    mobileArmedGodCardIdx,
    mobileArmedGodCard,
    mobileArmedGodTooltipRect,
    mobileGodCardRefs,
    isLocalSeatIndex,
    isLocalNyaBorrowPhase,
    hasHuntRevealableCard,
    isLocalCurrentTurn,
    pendingZhuDrawCard,
    pendingZhuGodCard,
    pendingZhuSphinxCard,
    pendingZhuAiDrawCard,
    pendingZhuAnyCard,
    canShowTurnDecisionModal,
    pendingZhuDrawAnyCard,
    pendingZhuGodAnyCard,
    pendingZhuSphinxAnyCard,
    isLocalGodChoice,
    isLocalDrawDecision,
    isLocalTreasureDodgePhase,
    isLocalTreasureAoEDodgePhase,
    isLocalFirstComePicker,
    isLocalSameAbyssTargetPhase,
    isLocalSphinxGuessPhase,
    showTutorial,
    tutorialStep,
    isTutorialActionAllowed,
    isTutorialDrawKeepStep,
    isScriptedTutorial,
    pendingSoftGuideId,
    tutorialOverlayHidden,
    tutorialDiceResultPending,
    tutorialDiceResultResuming,
    tutorialInspectionPending,
    tutorialInspectionResuming,
    battleBackgroundStyle,
    drawBackgroundCameraActive,
    globalStyles,
    selfPanelRef,
    roleTextRef,
    handAreaRef,
    emojiButtonRef,
    aiPanelAreaRef,
    deckAreaRef,
    discardPileRef,
    logRef,
    skillButtonRef,
    restButtonRef,
    drawRevealKeepButtonRef,
    godKeepHandButtonRef,
    dodgeRollButtonRef,
    swapBlindHandRef,
    animQueueRef,
    pendingGsRef,
    pendingRoleSelection,
    isDisconnected,
    exitMatchConfirm,
    privatePeek,
    showEmojiPicker,
    zhuHiddenCardId,
    promptCautionTextColor,
    promptSafeTextColor,
    promptMutedTextColor,
    softGuideSpotlights,
    panelRect,
    roleTextRect,
    handAreaRect,
    tutorialHandCardRect,
    handCardsRect,
    aiPanelAreaRect,
    opponentSanBarRect,
    opponentHpBarRect,
    singleOpponentRect,
    opponentGodStatusRect,
    drawRevealKeepButtonRect,
    godKeepHandButtonRect,
    deckAreaRect,
    dodgeRollButtonRect,
    skillButtonRect,
    swapBlindHandRect,
    isArtifact,
    isH5Package,
    smallBtnStyle,
    handleUiSfxCapture,
    returnToMainMenu,
    setExitMatchConfirm,
    leaveMultiplayerMatchToStart,
    handleAIClick,
    handleMyCardClick,
    useAbility,
    doRest,
    endTurn,
    cancelAction,
    huntConfirm,
    confirmDiscard,
    confirmBuryAliveSelection,
    handleZhuHideDrawnCard,
    handleZhuHideGodCard,
    handleZhuHideTopCardDuringSphinx,
    handleZhuHideAiDrawCard,
    handleDrawKeepFromModal,
    handleDrawDiscardFromModal,
    handleTreasureDodgeRoll,
    handleTreasureDodgeSkip,
    handleTreasureAOEDodgeRoll,
    handleTreasureAOEDodgeSkip,
    resolveTsathogguaSlimeBalance,
    resolveEtherealizeRedirect,
    firstComePickSelectCard,
    graveDigSelectGod,
    sameAbyssSelect,
    sphinxGuess,
    tortoiseOracleSelect,
    decipherStoneCarvingConfirm,
    swapSelectTargetCard,
    huntSelectCardFromPublic,
    handleSwapBlindDrawSelect,
    confirmRoleSelection,
    resetDisconnectedToStart,
    setPrivatePeek,
    setEmojiButtonPos,
    setShowEmojiPicker,
    handleEmojiClick,
    godResolvePlayer,
    nyaBorrow,
    nyaSkip,
    setGs,
    setAnim,
    setPreparingSoftGuideId,
    setPendingSoftGuideId,
    setSoftGuideSpotlights,
    setTutorialStep,
    advanceTutorialStep,
    handleTutorialResultNext,
    completeTutorial,
    _onRoleRevealDone,
    handleGamma,
    handleTutorialTreasureMapConfirm,
    roleRevealAnim,
    swapBlindDraw,
    swapBlindCardLayout,
    zhuLitCardsForView,
    canPlayerRespondWithAnyHandCard,
    canPlayerRespondWithFireHandCard,
    cardsHuntMatch,
    isMyCardClickable,
    skillLimited,
    skillRi,
    effectiveSkillName,
    isSelfDeadPanelDimmed,
    huntAbandoned,
    gamma,
    isLocalTestMode,
    localDebugMode,
    setLocalDebugMode,
    serverAnnouncement,
    emojiButtonPos
  } = props;

  const getButtonStyle = (opts) =>
    getPhaseActionButtonStyle({ isMobile, isMobileLandscape, mobileCssPx, interactionFontSizes, ...opts });

  return (
    <>
    <div className={`toe-battle-root${drawBackgroundCameraActive?' toe-draw-camera-active':''}`} onClickCapture={handleUiSfxCapture} style={{minHeight:isMobileLandscape?'100dvh':'100vh',height:isMobileLandscape?'100dvh':undefined,width:globalShiftX?`calc(100% - ${globalShiftX}px)`:'100%',boxSizing:'border-box',...battleBackgroundStyle,color:'var(--toe-text,#c8a96e)',fontFamily:"'IM Fell English','Georgia',serif",display:'flex',flexDirection:'column',gap:isMobile?5:isMobileLandscape?4:7,padding:isMobile?'6px 8px':isMobileLandscape?'4px 6px':'8px 10px',position:'relative',isolation:'isolate',left:globalShiftX||undefined,overflowX:'hidden',overflowY:isMobileLandscape?'hidden':'auto',scrollbarGutter:isMobileLandscape?undefined:'stable',
    animation:deathShake?'deathShakeAnim 2.0s ease-in-out':earthquakeShake?'earthquakeSceneShake 1.25s linear 2':screenShake?'screenShakeAnim 0.38s ease-in-out':undefined,
    }}>
      {/* Global vignette */}
      <div style={{position:'fixed',inset:0,background:'radial-gradient(ellipse at 50% 50%,transparent 40%,#00000099 100%)',pointerEvents:'none',zIndex:3}}/>
      {pendingRoleSelection&&(
        <div style={{position:'fixed',inset:0,zIndex:9998,background:'rgba(8,5,3,0.94)',display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
          <div style={{width:'min(480px,92vw)',background:'#120b06',border:'2px solid #5a3010',borderRadius:4,boxShadow:'0 0 60px #000c',padding:'28px 26px',textAlign:'center'}}>
            <h2 style={{fontFamily:"'Cinzel Decorative','Cinzel',serif",fontSize:20,color:'#e8c87a',margin:'0 0 8px',letterSpacing:2}}>选择本局身份</h2>
            <p style={{fontFamily:"'IM Fell English','Georgia',serif",fontSize:13,color:'#a07838',margin:'0 0 24px',fontStyle:'italic'}}>命运尚未落笔，由你决定扮演何人</p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:14}}>
              {[
                {key:ROLE_TREASURE,...RINFO[ROLE_TREASURE]},
                {key:ROLE_HUNTER,...RINFO[ROLE_HUNTER]},
                {key:ROLE_CULTIST,...RINFO[ROLE_CULTIST]},
                {key:'random',icon:'?',col:'#a07838',dim:'#5a4020',goal:'听凭命运安排',skillName:'随机身份'},
              ].map(role=>(
                <button
                  key={role.key}
                  type="button"
                  onClick={()=>confirmRoleSelection(role.key)}
                  style={{
                    background:'#1a1208',border:`1.5px solid ${role.dim}`,borderRadius:4,
                    padding:'18px 12px',cursor:'pointer',color:'#c8a96e',
                    fontFamily:"'Cinzel',serif",display:'flex',flexDirection:'column',alignItems:'center',gap:6,
                    transition:'all 0.15s ease',
                  }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=role.col;e.currentTarget.style.boxShadow=`0 0 18px ${role.col}44`;}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=role.dim;e.currentTarget.style.boxShadow='none';}}
                >
                  <span style={{fontSize:30,color:role.col,filter:`drop-shadow(0 0 8px ${role.col}66)`}}>{role.icon}</span>
                  <span style={{fontSize:14,letterSpacing:1,fontWeight:700}}>{role.key==='random'?'随机身份':role.key}</span>
                  <span style={{fontSize:10,color:'#806040',letterSpacing:0.5}}>{role.goal}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* ── 断线遮罩（游戏内）── */}
      {isDisconnected&&(
        <div onClick={resetDisconnectedToStart}
          style={{position:'fixed',inset:0,background:'#000000dd',zIndex:9999,
            display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
          <div style={{textAlign:'center',color:'#c8a0e8',fontFamily:"'Cinzel Decorative','Cinzel',serif",
            padding:'36px 48px',background:'#0e0a14',border:'2px solid #7a50b0',borderRadius:6,
            boxShadow:'0 0 60px #5a3a8066',animation:'animPop 0.25s ease-out',pointerEvents:'none'}}>
            <div style={{fontSize:48,marginBottom:16,filter:'drop-shadow(0 0 20px #a080d0)'}}>📡</div>
            <div style={{fontSize:16,letterSpacing:2,marginBottom:8}}>连接已断开</div>
            <div style={{fontSize:12,color:'#8060a0',letterSpacing:1,fontFamily:"'Cinzel',serif",fontStyle:'italic'}}>
              您已断线，点击任意位置返回主界面
            </div>
          </div>
        </div>
      )}
      {exitMatchConfirm&&(
        <div style={{position:'fixed',inset:0,zIndex:10020,background:'rgba(0,0,0,0.78)',display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
          <div style={{width:'min(420px,92vw)',background:'#120b06',border:'2px solid #5a3010',borderRadius:4,boxShadow:'0 0 50px #000c',padding:'22px 24px',textAlign:'center'}}>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:15,color:'#c8a96e',letterSpacing:2,marginBottom:14}}>退出对局</div>
            <div style={{fontFamily:"'Microsoft YaHei','SimHei',sans-serif",fontSize:14,color:'#b89858',lineHeight:1.6,marginBottom:20}}>
              {exitMatchConfirm.message}
            </div>
            <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
              <button onClick={leaveMultiplayerMatchToStart} style={{padding:'8px 20px',background:'#2a0c08',border:'1.5px solid #8a3028',color:'#e08070',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:12,borderRadius:2,cursor:'pointer',letterSpacing:1}}>确认退出</button>
              <button onClick={()=>setExitMatchConfirm(null)} style={{padding:'8px 20px',background:'#1a1008',border:'1.5px solid #5a4020',color:'#c8a96e',fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:12,borderRadius:2,cursor:'pointer',letterSpacing:1}}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Animations rendered outside the zoom container, see Fragment below */}
      {/* Target selection mask + floating prompt */}
      <TargetSelectOverlay drawReveal={gs.drawReveal} phase={isVisualPlayerTurn?phase:null} bewitchCard={gs.abilityData?.bewitchCard}/>

      {/* God choice modal */}
      {!pendingZhuGodAnyCard&&canShowTurnDecisionModal&&phase==='GOD_CHOICE'&&gs.abilityData?.godCard&&(isLocalGodChoice||gs._isMP)&&(()=>{
        const godCard=gs.abilityData.godCard;
        const actorIdx=gs.abilityData?.drawerIdx??gs.currentTurn??0;
        const actor=gs.players[actorIdx]||me;
        const canChooseGod=isLocalGodChoice&&actorIdx===0;
        const gk=godCard.godKey;
        const alreadyWorship=actor.godName===gk;
        const isConvert=!!(actor.godName&&actor.godName!==gk);
        const forcedConvert=gs.abilityData?.forcedConvert||false;
        const canUpgrade=alreadyWorship&&(actor.godLevel||0)<3;
        const thinkingText=gs._isMP&&!canChooseGod?`${actor.name||'对方'}正在回应邪神…`:'';
        const lockTutorialGodKeep=showTutorial&&tutorialStep===TUTORIAL_FLOW.CULTIST_GOD_KEEP_HAND;
        return(
          <GodChoiceModal
            godCard={godCard} player={actor}
            isConvert={isConvert} forcedConvert={forcedConvert}
            canChoose={canChooseGod}
            thinkingText={thinkingText}
            allowWorship={!lockTutorialGodKeep}
            allowKeepHand={!lockTutorialGodKeep||isTutorialActionAllowed({type:'godKeepHand'})}
            allowDiscard={!lockTutorialGodKeep}
            onWorship={()=>godResolvePlayer(alreadyWorship&&canUpgrade?'upgrade':isConvert?'worship':'worship')}
            onKeepHand={()=>godResolvePlayer('keepHand')}
            onDiscard={()=>godResolvePlayer('discard')}
            keepButtonRef={godKeepHandButtonRef}
            scaleRatio={scaleRatio}
          />
        );
      })()}
      {/* NYA borrow modal */}
      {phase==='NYA_BORROW'&&isLocalNyaBorrowPhase(gs)&&(()=>{
        const deadOthers=gs.players.filter((p,i)=>i>0&&p.isDead);
        return(<NyaBorrowModal deadPlayers={deadOthers} godLevel={me.godLevel} onBorrow={nyaBorrow} onSkip={nyaSkip}/>);
      })()}
      {!suppressAnim&&canShowTurnDecisionModal&&(pendingZhuDrawCard||pendingZhuGodCard||pendingZhuSphinxCard||pendingZhuAiDrawCard)&&(
        <div style={{position:'fixed',inset:0,display:'flex',alignItems:'center',justifyContent:'center',zIndex:520,pointerEvents:'none'}}>
          <div style={{background:'#130f07f2',border:`2px solid ${GOD_DEFS.ZHU.col}`,boxShadow:`0 0 60px ${GOD_DEFS.ZHU.col}44,0 0 120px #000c`,borderRadius:4,padding:'22px 26px',maxWidth:520,width:'92%',textAlign:'center',pointerEvents:'auto'}}>
            <div style={{fontFamily:"'Cinzel',serif",color:GOD_DEFS.ZHU.col,fontSize:16,letterSpacing:2,marginBottom:12}}>── 衔烛照幽 ──</div>
            <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#d8c078',fontSize:14,lineHeight:1.6,marginBottom:18}}>
              是否将 {cardLogText(pendingZhuDrawCard||pendingZhuGodCard||pendingZhuSphinxCard||pendingZhuAiDrawCard,{alwaysShowName:true})} 藏到牌堆底？
            </div>
            <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
              <button onClick={()=>pendingZhuDrawCard?handleZhuHideDrawnCard(true):pendingZhuGodCard?handleZhuHideGodCard(true):pendingZhuSphinxCard?handleZhuHideTopCardDuringSphinx(true):handleZhuHideAiDrawCard(true)} style={{padding:'8px 18px',background:'#1b1408',border:`1.5px solid ${GOD_DEFS.ZHU.col}`,color:'#f2df8a',fontFamily:"'Cinzel',serif",fontSize:13,cursor:'pointer',borderRadius:3}}>是</button>
              <button onClick={()=>pendingZhuDrawCard?handleZhuHideDrawnCard(false):pendingZhuGodCard?handleZhuHideGodCard(false):pendingZhuSphinxCard?handleZhuHideTopCardDuringSphinx(false):handleZhuHideAiDrawCard(false)} style={{padding:'8px 18px',background:'#100c08',border:'1.5px solid #6a5430',color:'#c8a96e',fontFamily:"'Cinzel',serif",fontSize:13,cursor:'pointer',borderRadius:3}}>否</button>
            </div>
          </div>
        </div>
      )}
      {!suppressAnim&&gs._isMP&&pendingZhuAnyCard&&visualMe?.godName!=='ZHU'&&(
        <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%, -50%)',background:'rgba(0,0,0,0.82)',border:'1.5px solid #6a5430',borderRadius:4,padding:'18px 22px',color:'#c8a96e',fontFamily:"'Cinzel',serif",fontSize:14,letterSpacing:1,zIndex:519,pointerEvents:'none'}}>
          请等待其他玩家选择…
        </div>
      )}
      {/* Draw reveal modal */}
      {!pendingZhuDrawAnyCard&&!suppressAnim&&canShowTurnDecisionModal&&phase==='DRAW_REVEAL'&&gs.drawReveal&&gs.drawReveal.needsDecision&&(
        <DrawRevealModal
          drawReveal={gs.drawReveal}
          onKeep={handleDrawKeepFromModal}
          onDiscard={handleDrawDiscardFromModal}
          canChoose={isLocalDrawDecision}
          thinkingText={gs._isMP&&!isLocalDrawDecision?`${gs.drawReveal.drawerName||gs.players[gs.currentTurn]?.name||'对方'}正在思考…`:''}
          canKeep={!isTutorialDrawKeepStep||isTutorialActionAllowed({type:'drawKeep'})}
          canDiscard={!isTutorialDrawKeepStep}
          keepButtonRef={drawRevealKeepButtonRef}
          scaleRatio={scaleRatio}
        />
      )}
      {/* Treasure hunter dodge modal */}
      {!suppressAnim&&phase==='TREASURE_DODGE_DECISION'&&gs.drawReveal&&isLocalTreasureDodgePhase(gs)&&(
        <TreasureDodgeModal
          drawReveal={gs.drawReveal}
          onRoll={handleTreasureDodgeRoll}
          onSkip={handleTreasureDodgeSkip}
          rollButtonRef={dodgeRollButtonRef}
          canSkip={!isScriptedTutorial || tutorialStep !== TUTORIAL_FLOW.TREASURE_DODGE_PROMPT}
          scaleRatio={scaleRatio}
        />
      )}
      {/* Treasure hunter AOE dodge modal */}
      {!suppressAnim&&phase==='TREASURE_AOE_DODGE_DECISION'&&gs.drawReveal&&isLocalTreasureAoEDodgePhase(gs)&&(
        <TreasureDodgeModal
          drawReveal={gs.drawReveal}
          onRoll={handleTreasureAOEDodgeRoll}
          onSkip={handleTreasureAOEDodgeSkip}
          thinkingText={gs._isMP&&!isLocalTreasureAoEDodgePhase(gs)?`其他玩家思考中…`:''}
          rollButtonRef={dodgeRollButtonRef}
          canSkip={true}
          scaleRatio={scaleRatio}
        />
      )}
      {/* Other players see thinking text during AOE dodge */}
      {!suppressAnim&&phase==='TREASURE_AOE_DODGE_DECISION'&&gs.drawReveal&&!isLocalTreasureAoEDodgePhase(gs)&&gs._isMP&&(
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(0, 0, 0, 0.8)',
          padding: '20px',
          borderRadius: '5px',
          color: '#c8a96e',
          fontFamily: "'Cinzel', serif",
          fontSize: '16px',
          zIndex: 1000
        }}>
          其他玩家思考中…
        </div>
      )}

      {!suppressAnim&&canShowTurnDecisionModal&&phase==='TSG_SLIME_BALANCE'&&gs.abilityData&&(isLocalSeatIndex(gs.abilityData?.targetIdx)||gs._isMP)&&(
        <div style={{position:'fixed',inset:0,display:'flex',alignItems:'center',justifyContent:'center',zIndex:430,pointerEvents:'none'}}>
          <div style={{background:'#101608f2',border:'2px solid #5f8f4a',boxShadow:'0 0 60px #5f8f4a33, 0 0 120px #000c',borderRadius:4,padding:'22px 26px',maxWidth:540,width:'92%',textAlign:'center',pointerEvents:'auto'}}>
            <div style={{fontFamily:"'Cinzel',serif",color:'#9ed27f',fontSize:16,letterSpacing:2,marginBottom:12}}>── 赐福黏液 ──</div>
            <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#d8c078',fontSize:14,lineHeight:1.6,marginBottom:18}}>
              {isLocalSeatIndex(gs.abilityData?.targetIdx)
                ? `是否牺牲撒托古亚的赐福黏液，将当前 HP/SAN（${gs.abilityData?.afterHp ?? '?'} / ${gs.abilityData?.afterSan ?? '?'}）平分？`
                : `等待 ${gs.players[gs.abilityData?.targetIdx]?.name||'目标'} 选择是否牺牲黏液…`}
            </div>
            {isLocalSeatIndex(gs.abilityData?.targetIdx)?(
              <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
                <button onClick={()=>resolveTsathogguaSlimeBalance(true)} style={{padding:'8px 18px',background:'#17220e',border:'1.5px solid #5f8f4a',color:'#d8f0bd',fontFamily:"'Cinzel',serif",fontSize:13,cursor:'pointer',borderRadius:3}}>是</button>
                <button onClick={()=>resolveTsathogguaSlimeBalance(false)} style={{padding:'8px 18px',background:'#100c08',border:'1.5px solid #6a5430',color:'#c8a96e',fontFamily:"'Cinzel',serif",fontSize:13,cursor:'pointer',borderRadius:3}}>否</button>
              </div>
            ):(
              <div style={{fontFamily:"'Cinzel',serif",fontSize:12,color:'#a07838',letterSpacing:1}}>
                请等待其他玩家选择…
              </div>
            )}
          </div>
        </div>
      )}

      {!suppressAnim&&canShowTurnDecisionModal&&phase==='ETHEREALIZE_DECISION'&&gs.abilityData&&(
        <div style={{position:'fixed',inset:0,display:'flex',alignItems:'center',justifyContent:'center',zIndex:430,pointerEvents:'none'}}>
          <div style={{background:'#0c1118f2',border:'2px solid #87a9c8',boxShadow:'0 0 60px #87a9c833, 0 0 120px #000c',borderRadius:4,padding:'22px 26px',maxWidth:540,width:'92%',textAlign:'center',pointerEvents:'auto'}}>
            <div style={{fontFamily:"'Cinzel',serif",color:'#b9d8f0',fontSize:16,letterSpacing:2,marginBottom:12}}>── 半物质化 ──</div>
            <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#d8c078',fontSize:14,lineHeight:1.6,marginBottom:18}}>
              {isLocalSeatIndex(gs.abilityData?.targetIdx)
                ? `是否消耗1层虚化，转移即将失去的 ${gs.abilityData?.lostHp||0} HP / ${gs.abilityData?.lostSan||0} SAN？`
                : `等待 ${gs.players[gs.abilityData?.targetIdx]?.name||'目标'} 选择是否消耗虚化…`}
            </div>
            {isLocalSeatIndex(gs.abilityData?.targetIdx)?(
              <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
                <button onClick={()=>resolveEtherealizeRedirect(true)} style={{padding:'8px 18px',background:'#101a22',border:'1.5px solid #87a9c8',color:'#d9efff',fontFamily:"'Cinzel',serif",fontSize:13,cursor:'pointer',borderRadius:3}}>是</button>
                <button onClick={()=>resolveEtherealizeRedirect(false)} style={{padding:'8px 18px',background:'#100c08',border:'1.5px solid #6a5430',color:'#c8a96e',fontFamily:"'Cinzel',serif",fontSize:13,cursor:'pointer',borderRadius:3}}>否</button>
              </div>
            ):(
              <div style={{fontFamily:"'Cinzel',serif",fontSize:12,color:'#a07838',letterSpacing:1}}>
                请等待其他玩家选择…
              </div>
            )}
          </div>
        </div>
      )}

      {!suppressAnim&&phase==='TORTOISE_ORACLE_SELECT'&&gs.abilityData&&(
        <TortoiseOracleModal abilityData={gs.abilityData} onSelect={tortoiseOracleSelect} myTurn={myTurn} expansionKey={gs.expansionKey}/>
      )}
      {privatePeek&&(
        <PeekHandModal
          card={privatePeek.card}
          targetName={privatePeek.targetName}
          onClose={()=>setPrivatePeek(null)}
        />
      )}

      {!suppressAnim&&canShowTurnDecisionModal&&phase==='FIRST_COME_PICK_SELECT'&&gs.abilityData&&(
        <div style={{position:'fixed',inset:0,display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:isMobile?'7vh':'5vh',zIndex:400,pointerEvents:'none'}}>
          <div style={{background:'#150e07ee',border:'2px solid #d7b46a',boxShadow:'0 0 60px #d7b46a33, 0 0 120px #000a',borderRadius:4,padding:'20px 24px',maxWidth:720,width:'92%',textAlign:'center',pointerEvents:'auto'}}>
            <div style={{fontFamily:"'Cinzel',serif",color:'#e6c577',fontSize:16,letterSpacing:2,marginBottom:10}}>── 先到先得 ──</div>
            <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#b09090',fontSize:14,marginBottom:18,lineHeight:1.5}}>
              {gs.players[gs.abilityData?.pickOrder?.[gs.abilityData?.pickIndex||0]]?.name||'当前角色'} 选择一张翻开的牌收入手牌
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap',marginBottom:16}}>
              {(gs.abilityData?.revealedCards||[]).map((card,index)=>{
                const pickerIdx=gs.abilityData?.pickOrder?.[gs.abilityData?.pickIndex||0];
                const canPick=isLocalFirstComePicker(gs);
                return (
                  <DDCard
                    key={card.id??`${card.key}-${index}`}
                    card={card}
                    compact={isMobile}
                    onClick={canPick?()=>firstComePickSelectCard(index):undefined}
                    disabled={!canPick}
                    highlight={canPick}
                    holderId={pickerIdx}
                  />
                );
              })}
            </div>
            {!isLocalFirstComePicker(gs)&&(
              <div style={{fontFamily:"'Cinzel',serif",fontSize:12,color:'#a07838',letterSpacing:1}}>
                其他角色选择中…
              </div>
            )}
          </div>
        </div>
      )}

      {!suppressAnim&&canShowTurnDecisionModal&&phase==='GRAVE_DIG_SELECT'&&gs.abilityData&&(
        <div style={{position:'fixed',inset:0,display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:isMobile?'7vh':'5vh',zIndex:400,pointerEvents:'none'}}>
          <div style={{background:'#150e07ee',border:'2px solid #d7b46a',boxShadow:'0 0 60px #d7b46a33, 0 0 120px #000a',borderRadius:4,padding:'20px 24px',maxWidth:720,width:'92%',textAlign:'center',pointerEvents:'auto'}}>
            <div style={{fontFamily:"'Cinzel',serif",color:'#e6c577',fontSize:16,letterSpacing:2,marginBottom:10}}>── 掘墓 ──</div>
            <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#b09090',fontSize:14,marginBottom:18,lineHeight:1.5}}>
              从弃牌堆中选择一张邪神牌放入你的手牌
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap',marginBottom:16}}>
              {(gs.abilityData?.godCards||[]).map((card,index)=>{
                const canPick=isLocalSeatIndex(gs.abilityData?.playerIndex);
                return (
                  <DDCard
                    key={card.id??`${card.godKey}-${index}`}
                    card={card}
                    compact={isMobile}
                    onClick={canPick?()=>graveDigSelectGod(index):undefined}
                    disabled={!canPick}
                    highlight={canPick}
                    holderId={gs.abilityData?.playerIndex}
                  />
                );
              })}
            </div>
            {!isLocalSeatIndex(gs.abilityData?.playerIndex)&&(
              <div style={{fontFamily:"'Cinzel',serif",fontSize:12,color:'#a07838',letterSpacing:1}}>
                等待 {gs.players[gs.abilityData?.playerIndex]?.name||'目标'} 做出选择…
              </div>
            )}
          </div>
        </div>
      )}

      {/* 同归深渊选择 modal */}
      {!suppressAnim&&phase==='SAME_ABYSS_SELECT'&&gs.abilityData&&(
        <div style={{position:'fixed',inset:0,display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:isMobile?'7vh':'5vh',zIndex:400,pointerEvents:'none'}}>
          <div style={{background:'#150e07ee',border:'2px solid #d7b46a',boxShadow:'0 0 60px #d7b46a33, 0 0 120px #000a',borderRadius:4,padding:'20px 24px',maxWidth:560,width:'92%',textAlign:'center',pointerEvents:'auto'}}>
            <div style={{fontFamily:"'Cinzel',serif",color:'#e6c577',fontSize:16,letterSpacing:2,marginBottom:10}}>── 同归深渊 ──</div>
            <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#b09090',fontSize:14,marginBottom:18,lineHeight:1.5}}>
              你手牌最多（{gs.abilityData?.targetHandCount??gs.players[gs.abilityData?.targetIdx]?.hand?.length??0} 张）。将手牌弃至与 {gs.players[gs.abilityData?.actorIdx??gs.currentTurn]?.name||'对方'} 数量相等（{gs.abilityData?.actorHandCount||0} 张），或者失去 4 HP。
            </div>
            <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
              {isLocalSameAbyssTargetPhase(gs)?(
                <>
                  <button onClick={()=>sameAbyssSelect('discard')} style={{padding:'8px 16px',background:'#1a1008',border:'1.5px solid #8a6a3a',color:'#c8a96e',fontFamily:"'Cinzel',serif",fontSize:13,cursor:'pointer',borderRadius:3}}>
                    {(gs.abilityData?.discardCount||0)>0?'弃置手牌至':'不弃牌，保持'} {gs.abilityData?.actorHandCount||0} 张
                  </button>
                  <button onClick={()=>sameAbyssSelect('hp')} style={{padding:'8px 16px',background:'#1a1008',border:'1.5px solid #8a3a3a',color:'#c87878',fontFamily:"'Cinzel',serif",fontSize:13,cursor:'pointer',borderRadius:3}}>
                    失去 4 HP
                  </button>
                </>
              ):(
                <div style={{fontFamily:"'Cinzel',serif",fontSize:12,color:'#a07838',letterSpacing:1}}>
                  等待 {gs.players[gs.abilityData?.targetIdx]?.name||'目标'} 做出选择…
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 斯芬克斯猜测 modal */}
      {!pendingZhuSphinxAnyCard&&!suppressAnim&&phase==='SPHINX_GUESS'&&gs.abilityData&&(
        <div style={{position:'fixed',inset:0,display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:isMobile?'7vh':'5vh',zIndex:400,pointerEvents:'none'}}>
          <div style={{background:'#150e07ee',border:'2px solid #d7b46a',boxShadow:'0 0 60px #d7b46a33, 0 0 120px #000a',borderRadius:4,padding:'20px 24px',maxWidth:560,width:'92%',textAlign:'center',pointerEvents:'auto'}}>
            <div style={{fontFamily:"'Cinzel',serif",color:'#e6c577',fontSize:16,letterSpacing:2,marginBottom:10}}>── 斯芬克斯 ──</div>
            <div style={{fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',color:'#b09090',fontSize:14,marginBottom:18,lineHeight:1.5}}>
              猜测牌堆顶的牌是否是区域牌。若猜对，收入这张牌；若猜错，失去 3 HP。
            </div>
            <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
              {isLocalSphinxGuessPhase(gs)?(
                <>
                  <button onClick={()=>sphinxGuess(true)} style={{padding:'8px 16px',background:'#1a1008',border:'1.5px solid #8a6a3a',color:'#c8a96e',fontFamily:"'Cinzel',serif",fontSize:13,cursor:'pointer',borderRadius:3}}>
                    是区域牌
                  </button>
                  <button onClick={()=>sphinxGuess(false)} style={{padding:'8px 16px',background:'#1a1008',border:'1.5px solid #8a6a3a',color:'#c8a96e',fontFamily:"'Cinzel',serif",fontSize:13,cursor:'pointer',borderRadius:3}}>
                    不是区域牌
                  </button>
                </>
              ):(
                <div style={{fontFamily:"'Cinzel',serif",fontSize:12,color:'#a07838',letterSpacing:1}}>
                  等待 {gs.players[gs.currentTurn]?.name||'对方'} 做出猜测…
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {!suppressAnim&&phase==='DECIPHER_STONE_CARVING'&&gs.abilityData&&(
        <DecipherStoneCarvingOverlay
          revealedCards={gs.abilityData?.revealedCards||[]}
          actorName={isLocalSeatIndex(gs.abilityData?.playerIndex)?'你':(gs.players?.[gs.abilityData?.playerIndex]?.name||'该玩家')}
          readOnly={!isLocalSeatIndex(gs.abilityData?.playerIndex)}
          expansionKey={gs.expansionKey}
          onConfirm={decipherStoneCarvingConfirm}
        />
      )}

      <div style={{position:'relative',zIndex:2,display:'flex',flexDirection:'column',gap:isMobileLandscape?mobileCssPx(4):7}}>
        {/* Header */}
        {(()=>{
          const headerScale=scaleRatio>1?scaleRatio:1;
          const headerFontScale=isMobileLandscape?mobileZoomCompensate:headerScale;
          const hp=scale=>`${Math.round(scale*(isMobileLandscape?mobileZoomCompensate:headerScale))}px`;
          return(
            <div style={{display:'flex',alignItems:'center',gap:hp(10),borderBottom:'1px solid var(--toe-line-dim,#2a1a08)',paddingBottom:hp(6)}}>
              <div style={{fontFamily:"'Cinzel Decorative','Cinzel',serif",fontSize:baseFontSizes.title*headerFontScale,fontWeight:700,color:'var(--toe-strong,#c8a96e)',letterSpacing:isMobile?1:2}}>邪神的宝藏</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:baseFontSizes.subtitle*headerFontScale,color:'var(--toe-muted,#b89858)',letterSpacing:isMobile?1:2,marginTop:1}}>Treasures of Evils</div>
              {isMultiplayer?(
                <button
                  onClick={()=>setExitMatchConfirm({
                    message:isSpectating
                      ?'你将离开游戏房间，确定要退出吗？'
                      :'对局还在进行中，是否退出对局并离开房间？',
                  })}
                  style={{
                    marginLeft:'auto',
                    padding:isMobile?`${hp(4)} ${hp(10)}`:`${hp(5)} ${hp(12)}`,
                    background:'#2a0c08',
                    border:'1.5px solid #c2412f',
                    color:'#ffb199',
                    fontFamily:"'Cinzel',serif",
                    fontWeight:700,
                    fontSize:baseFontSizes.small*headerFontScale,
                    borderRadius:3,
                    cursor:'pointer',
                    letterSpacing:isMobile?0.5:1,
                    textTransform:'uppercase',
                    boxShadow:'0 0 12px rgba(194,65,47,0.34)',
                  }}
                >
                  退出对局
                </button>
              ):(
                <button
                  onClick={showTutorial?undefined:returnToMainMenu}
                  disabled={showTutorial}
                  title={showTutorial?'教学中不可返回主界面':undefined}
                  style={{
                    marginLeft:'auto',
                    padding:isMobile?`${hp(4)} ${hp(10)}`:`${hp(5)} ${hp(12)}`,
                    background:'#2a0c08',
                    border:'1.5px solid #c2412f',
                    color:'#ffb199',
                    fontFamily:"'Cinzel',serif",
                    fontWeight:700,
                    fontSize:baseFontSizes.small*headerFontScale,
                    borderRadius:3,
                    cursor:showTutorial?'not-allowed':'pointer',
                    opacity:showTutorial?0.45:1,
                    letterSpacing:isMobile?0.5:1,
                    textTransform:'uppercase',
                    boxShadow:'0 0 12px rgba(194,65,47,0.34)',
                  }}
                >
                  返回主界面
                </button>
              )}
            </div>
          );
        })()}

        {/* Scaled player areas wrapper */}
        <div style={{overflow:'visible',width:'100%',display:'flex',justifyContent:'center'}}>
          <div data-zoom-container style={{
            zoom:scaleRatio!==1?scaleRatio:'normal',
            width:DESIGN_WIDTH,
            flexShrink:0,
            transformOrigin:'top center'
          }}>
            <div style={{width:'100%',boxSizing:'border-box',padding:`0 ${(isMobile||isMobileLandscape)?boardCssPx(scaledAreaSafeInsetX):scaledAreaSafeInsetX}px`}}>

        {/* AI panels */}
        <div ref={aiPanelAreaRef} style={{
          display:'grid',
          gridTemplateColumns:'repeat(4,1fr)',
          gap:isMobile?boardCssPx(6):isMobileLandscape?boardCssPx(4):8,
          justifyContent:'center',
          width:'100%'
        }}>
          {visualPlayers.slice(1).map((p,i)=>{
            const pi=i+1;
            const isTutorialTargetAllowed=!isScriptedTutorial||isTutorialActionAllowed({type:'selectTarget',pid:pi});
            const isSel=selectingOther&&!p.isDead&&!isBlocked&&isTutorialTargetAllowed&&!(phase==='HUNT_SELECT_TARGET'&&(!hasHuntRevealableCard(p)||huntAbandoned.includes(pi)));
            // 掉包：公开手牌时正面选择；暗抽时改为全屏遮罩选择，不再点击手牌区
            const isSwapPublicTargetCardPhase=phase==='SWAP_SELECT_TARGET_CARD'&&myTurn&&gs.abilityData?.swapTi===pi;
            // 在HUNT_SELECT_CARD_FROM_PUBLIC阶段，如果这是死者玩家，显示其手牌并允许选择
            const isHuntCardFromPublicPhase=phase==='HUNT_SELECT_CARD_FROM_PUBLIC'&&myTurn&&gs.abilityData?.huntTi===pi;
            const showFaceUpForSwap=isSwapPublicTargetCardPhase||isHuntCardFromPublicPhase||p.revealHand;
            const onCardSelectForSwap=isSwapPublicTargetCardPhase?((cardIdx)=>swapSelectTargetCard(cardIdx)):isHuntCardFromPublicPhase?((cardIdx)=>huntSelectCardFromPublic(cardIdx)):null;
              return(
                <div key={p.id} data-pid={pi} style={{position:'relative',zIndex:isSel?101:undefined,alignSelf:'start'}}>
                <PlayerPanel player={p} playerIndex={pi} isCurrentTurn={visualCurrentTurn===pi} isSelectable={isSel} showFaceUp={showFaceUpForSwap} onSelect={()=>handleAIClick(pi)} onCardSelect={onCardSelectForSwap} isBeingHit={hitIndices.includes(pi)} isSanHit={sanHitIndices.includes(pi)} isHpHeal={hpHealIndices.includes(pi)} isSanHeal={sanHealIndices.includes(pi)} isBeingGuillotined={guillotinedPids.has(pi)} displayStats={displayStats} scaleRatio={boardScaleRatio} viewportWidth={vw} expansionKey={gs.expansionKey} blackGoatPulseActive={blackGoatPulsePid===pi} godHighlightBurst={godHighlightPanelBursts[pi]}/>
                </div>
              );
            })}
        </div>

        {/* Middle: self info + deck/discard piles + log */}
        <div style={{display:'flex',gap:isMobile?boardCssPx(6):isMobileLandscape?boardCssPx(6):10,flexWrap:'wrap',alignItems:'stretch',width:'100%',justifyContent:'flex-start'}}>
          <SelfPlayerPanel
            selfPanelRef={selfPanelRef}
            roleTextRef={roleTextRef}
            emojiButtonRef={emojiButtonRef}
            me={me}
            visualMe={visualMe}
            displayStats={displayStats}
            ri={ri}
            phase={phase}
            isBlocked={isBlocked}
            canLocalTargetSelect={canLocalTargetSelect}
            suppressAnim={suppressAnim}
            tutorialStep={tutorialStep}
            isMobile={isMobile}
            isMobileLandscape={isMobileLandscape}
            boardCssPx={boardCssPx}
            middleRowHeight={middleRowHeight}
            fontSizes={fontSizes}
            boardScaleRatio={boardScaleRatio}
            vw={vw}
            expansionKey={gs.expansionKey}
            hitIndices={hitIndices}
            sanHitIndices={sanHitIndices}
            hpHealIndices={hpHealIndices}
            sanHealIndices={sanHealIndices}
            guillotinedPids={guillotinedPids}
            godHighlightPanelBursts={godHighlightPanelBursts}
            isSelfDeadPanelDimmed={isSelfDeadPanelDimmed}
            isMultiplayer={isMultiplayer}
            showEmojiPicker={showEmojiPicker}
            setShowEmojiPicker={setShowEmojiPicker}
            setEmojiButtonPos={setEmojiButtonPos}
            handleAIClick={handleAIClick}
          />
          {/* Center: deck/discard piles */}
        <PileDisplay deckCount={gs.deck.length} discardCount={visualDiscard.length} discardTop={visualDiscard[visualDiscard.length-1]||null} discardCards={visualDiscard} inspectionCount={gs.inspectionDeck.length+(gs.houndsOfTindalosActive?0:0)} compact={vw<430} baseHeight={middleRowHeight} deckRef={deckAreaRef} discardRef={discardPileRef} scaleRatio={compactBoardScaleRatio} expansionKey={gs.expansionKey} zhuLitCards={zhuLitCardsForView} zhuHiddenCardId={zhuHiddenCardId} petrifyingFormula={gs.petrifyingFormula}/>
          {/* Log — narrow, right-aligned */}
          <BattleLogPanel
            logRef={logRef}
            visibleLog={visibleLog}
            players={gs.players}
            isMultiplayer={!!gs._isMP}
            expansionKey={gs.expansionKey}
            isMobile={isMobile}
            middleRowHeight={middleRowHeight}
            fontSizes={fontSizes}
            scaleRatio={layoutScaleRatio}
          />
        </div>

        {/* Phase bar */}
        <div data-prompt-panel>
          <BattlePhaseBar
            myTurn={myTurn}
            phase={phase}
            isMobile={isMobile}
            baseFontSizes={interactionFontSizes}
            scaleRatio={layoutScaleRatio}
            displayPhaseLabel={displayPhaseLabel}
            cardHintText={cardHintText}
            isPhaseWarningText={isPhaseWarningText}
            isSpectating={isSpectating}
            isMultiplayer={isMultiplayer}
            isMpCthDecisionPhase={isMpCthDecisionPhase}
            isLocalMpDecisionActive={isLocalMpDecisionActive}
            isDiscardPhaseResolving={isDiscardPhaseResolving}
            isBlocked={isBlocked}
            mpCthSec={mpCthSec}
            mpTurnSec={mpTurnSec}
            mpDiscardSec={mpDiscardSec}
            mpHuntSec={mpHuntSec}
            mpDecisionSec={mpDecisionSec}
            colors={{
              warning: promptWarningTextColor,
              active: promptActiveTextColor,
              caution: promptCautionTextColor,
              safe: promptSafeTextColor,
              muted: promptMutedTextColor,
            }}
          />
        </div>

        <DamageLinkOverlay
          visualPlayers={visualPlayers}
          damageLinkGhosts={damageLinkGhosts}
          damageLinkEstablishAnims={damageLinkEstablishAnims}
        />

        {/* Hand area */}
        <HandArea
          handAreaRef={handAreaRef}
          skillButtonRef={skillButtonRef}
          restButtonRef={restButtonRef}
          gs={gs}
          me={me}
          visualMe={visualMe}
          ri={ri}
          phase={phase}
          myTurn={myTurn}
          isSpectating={isSpectating}
          isVisualPlayerTurn={isVisualPlayerTurn}
          isActionControlsHidden={isActionControlsHidden}
          cancelable={cancelable}
          showCancelBtn={showCancelBtn}
          canShowEndTurnButton={canShowEndTurnButton}
          isDiscardPhaseResolving={isDiscardPhaseResolving}
          isDiscardPhasePromptActive={isDiscardPhasePromptActive}
          isLocalHuntRevealPrompt={isLocalHuntRevealPrompt}
          isLocalCurrentTurn={isLocalCurrentTurn}
          currentTurnPlayer={currentTurnPlayer}
          isBlocked={isBlocked}
          isScriptedTutorial={isScriptedTutorial}
          isTutorialActionAllowed={isTutorialActionAllowed}
          tutorialStep={tutorialStep}
          effectiveHandLimit={effectiveHandLimit}
          skillLimited={skillLimited}
          skillRi={skillRi}
          effectiveSkillName={effectiveSkillName}
          isMyCardClickable={isMyCardClickable}
          canPlayerRespondWithAnyHandCard={canPlayerRespondWithAnyHandCard}
          canPlayerRespondWithFireHandCard={canPlayerRespondWithFireHandCard}
          cardsHuntMatch={cardsHuntMatch}
          mobileArmedGodCardIdx={mobileArmedGodCardIdx}
          mobileArmedGodCard={mobileArmedGodCard}
          mobileArmedGodTooltipRect={mobileArmedGodTooltipRect}
          mobileGodCardRefs={mobileGodCardRefs}
          blackGoatPulsePid={blackGoatPulsePid}
          promptWarningTextColor={promptWarningTextColor}
          promptActiveTextColor={promptActiveTextColor}
          isMobile={isMobile}
          isMobileLandscape={isMobileLandscape}
          mobileCssPx={mobileCssPx}
          interactionFontSizes={interactionFontSizes}
          mobileHandUsesCompact={mobileHandUsesCompact}
          selfHandCardScale={selfHandCardScale}
          handleMyCardClick={handleMyCardClick}
          useAbility={useAbility}
          doRest={doRest}
          endTurn={endTurn}
          cancelAction={cancelAction}
          huntConfirm={huntConfirm}
          confirmDiscard={confirmDiscard}
          confirmBuryAliveSelection={confirmBuryAliveSelection}
          setGs={setGs}
          getButtonStyle={getButtonStyle}
          anim={anim}
        />
            </div>
          </div>
        </div>
      </div>
      {/* ── Overlays ── */}
      {createPortal(
        <>
          {!showTutorial&&anim?.type!=='APOPHIS_ECLIPSE'&&<ApophisNightBadge night={anim?._apophisNight||gs?.apophisNight}/>}
          {!showTutorial&&<HoundsTimerBadge active={houndsTimerVisible} secondsLeft={houndsSecLeft}/>}
          {!showTutorial&&pendingSoftGuideId&&<SoftGuideOverlay
            guide={SOFT_GUIDE_DEFS[pendingSoftGuideId]}
            spotlights={softGuideSpotlights}
            onClose={()=>{
              setPreparingSoftGuideId(null);
              setPendingSoftGuideId(null);
              setSoftGuideSpotlights([]);
            }}
          />}
          {!tutorialOverlayHidden&&!tutorialDiceResultPending&&!tutorialDiceResultResuming&&!tutorialInspectionPending&&!tutorialInspectionResuming&&<InGameTutorialOverlay
            showTutorial={showTutorial}
            tutorialStep={tutorialStep}
            vw={vw}
            panelRect={panelRect}
            roleTextRect={roleTextRect}
            handAreaRect={handAreaRect}
            tutorialHandCardRect={tutorialHandCardRect}
            handCardsRect={handCardsRect}
            aiPanelAreaRect={aiPanelAreaRect}
            opponentSanBarRect={opponentSanBarRect}
            opponentHpBarRect={opponentHpBarRect}
            singleOpponentRect={singleOpponentRect}
            opponentGodStatusRect={opponentGodStatusRect}
            drawRevealKeepButtonRect={drawRevealKeepButtonRect}
            godKeepHandButtonRect={godKeepHandButtonRect}
            deckAreaRect={deckAreaRect}
            dodgeRollButtonRect={dodgeRollButtonRect}
            skillButtonRect={skillButtonRect}
            swapBlindHandRect={swapBlindHandRect}
            isArtifact={isArtifact}
            isH5Package={isH5Package}
            scaleRatio={scaleRatio}
            baseBodyFontSize={baseFontSizes.body}
            setTutorialStep={setTutorialStep}
            advanceTutorialStep={advanceTutorialStep}
            onTutorialResultNext={handleTutorialResultNext}
            completeTutorial={completeTutorial}
          />}
        </>,document.body)}
      {roleRevealAnim&&<RoleRevealAnim role={roleRevealAnim.role} onDone={()=>_onRoleRevealDone(roleRevealAnim.pendingGs)}/>}

      {/* ── Swap Blind-Draw Overlay ── */}
      {swapBlindDraw&&(
        <div style={{
          position:'fixed',inset:0,zIndex:550,
          background:'rgba(5,3,1,0.88)',
          display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:Math.max(18,swapBlindCardLayout.gap*2),
          animation:'animFadeIn 0.25s ease both',
        }}>
          {/* 标题 */}
          <div style={{
            fontFamily:"'Cinzel',serif",color:'#c8a96e',fontSize:swapBlindCardLayout.titleFontSize,letterSpacing:2,textAlign:'center',
            textShadow:'0 0 20px rgba(200,169,110,0.3)',
            maxWidth:'92vw',
          }}>
            从 {gs.players[swapBlindDraw.targetPi]?.name} 的手牌中暗抽一张
          </div>
          {/* 牌区域 */}
          <div ref={swapBlindHandRef} style={{
            display:'flex',gap:swapBlindCardLayout.gap,alignItems:'center',justifyContent:'center',
            flexWrap:'wrap',maxWidth:swapBlindCardLayout.maxWidth,perspective:'1200px',
          }}>
            {swapBlindDraw.handSnapshot.map(({idx,card,isFaceUp})=>{
              const isShuffling=swapBlindDraw.phase==='shuffling';
              const isSelecting=swapBlindDraw.phase==='selecting';
              const isFlying=swapBlindDraw.phase==='flying'&&swapBlindDraw.selectedIdx===idx;
              const isOtherFlying=swapBlindDraw.phase==='flying'&&swapBlindDraw.selectedIdx!==idx;
              const seed=idx*137+idx*31;
              const startX=`${(Math.sin(seed)*220).toFixed(1)}px`;
              const startY=`${(Math.cos(seed*1.3)*180-80).toFixed(1)}px`;
              const startRz=`${(Math.sin(seed*0.7)*35).toFixed(1)}deg`;
              const pileX=`${(Math.sin(seed*2.1)*8).toFixed(1)}px`;
              const pileY=`${(Math.cos(seed*1.7)*6).toFixed(1)}px`;
              const handCount=swapBlindDraw.handSnapshot.length;
              const cardSpacing=swapBlindCardLayout.spacing;
              const totalWidth=(handCount-1)*cardSpacing;
              const finalX=`${(idx*cardSpacing-totalWidth/2).toFixed(1)}px`;
              const finalY='0px';
              return(
                <div
                  key={idx}
                  onClick={isSelecting?()=>handleSwapBlindDrawSelect(idx):undefined}
                  style={{
                    position:'relative',
                    width:swapBlindCardLayout.width,height:swapBlindCardLayout.height,
                    cursor:isSelecting?'pointer':'default',
                    transformStyle:'preserve-3d',
                    transition:isSelecting?'transform 0.18s ease':'none',
                    ...(isShuffling?{
                      '--start-x':startX,'--start-y':startY,'--start-rz':startRz,
                      '--pile-x':pileX,'--pile-y':pileY,
                      '--final-x':finalX,'--final-y':finalY,
                      '--final-ry':isFaceUp?'0deg':'180deg',
                      '--pile-ry':isFaceUp?'0deg':`${(Math.sin(seed)*20).toFixed(1)}deg`,
                      animation:'swapBlindShuffleIn 1.2s cubic-bezier(0.25,0,0.35,1) both',
                      animationDelay:`${(idx*0.09).toFixed(2)}s`,
                    }:isFlying?{
                      '--fly-tx':`${(swapBlindDraw.flyTo?.x||0)-(swapBlindDraw.flyFrom?.x||0)}px`,
                      '--fly-ty':`${(swapBlindDraw.flyTo?.y||0)-(swapBlindDraw.flyFrom?.y||0)}px`,
                      animation:'swapBlindFlyCard 0.7s cubic-bezier(0.25,0,0.35,1) forwards',
                      zIndex:100,
                    }:isOtherFlying?{
                      opacity:0,transition:'opacity 0.15s',
                    }:{}),
                  }}
                >
                  {/* 正面 */}
                  <div style={{
                    position:'absolute',inset:0,backfaceVisibility:'hidden',
                    transform:isFaceUp?'none':'rotateY(180deg)',
                    borderRadius:3,overflow:'hidden',
                  }}>
                    <DDCard
                      card={card}
                      holderId={swapBlindDraw.targetPi}
                      frameStyle={{
                        transform:`scale(${swapBlindCardLayout.scale})`,
                        transformOrigin:'top left',
                      }}
                    />
                  </div>
                  {/* 背面 */}
                  <div style={{
                    position:'absolute',inset:0,backfaceVisibility:'hidden',
                    transform:isFaceUp?'rotateY(180deg)':'none',
                    borderRadius:3,overflow:'hidden',
                  }}>
                    <DDCardBack
                      expansionKey={gs.expansionKey}
                      frameStyle={{
                        width:swapBlindCardLayout.width,
                        height:swapBlindCardLayout.height,
                      }}
                    />
                  </div>
                  {/* 悬停提示（选择阶段） */}
                  {isSelecting&&isFaceUp&&<div style={{
                    position:'absolute',bottom:-Math.max(20,Math.round(swapBlindCardLayout.height*0.22)),left:'50%',transform:'translateX(-50%)',
                    fontSize:swapBlindCardLayout.nameFontSize,color:'#c8a96e',fontFamily:"'Cinzel',serif",
                    whiteSpace:'nowrap',pointerEvents:'none',opacity:0.8,
                  }}>{card.name}</div>}
                </div>
              );
            })}
          </div>
          {/* 底部提示 */}
          {swapBlindDraw.phase==='selecting'&&<div style={{
            fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',
            color:'#7a5a2a',fontSize:swapBlindCardLayout.hintFontSize,letterSpacing:1,
            animation:'animFadeIn 0.4s ease 0.6s both',
          }}>点击一张牌进行暗抽</div>}
          {swapBlindDraw.phase==='shuffling'&&<div style={{
            fontFamily:"'IM Fell English','Georgia',serif",fontStyle:'italic',
            color:'#5a4020',fontSize:swapBlindCardLayout.hintFontSize,letterSpacing:1,
          }}>洗牌中…</div>}
        </div>
      )}

      {phase==='PLAYER_WIN_PENDING'&&(
        <TreasureMapAnim hand={me.hand} onConfirm={showTutorial?handleTutorialTreasureMapConfirm:()=>{
          animQueueRef.current=[];
          pendingGsRef.current=null;
          setAnim(null);
          setGs({...gs,
            players:gs.players.map((p,i)=>i===0?{...p,roleRevealed:true,revealHand:true}:p),
            gameOver:{winner:'寻宝者',reason:gs.abilityData?.winReason||'你集齐了全部编号并获胜！',winnerIdx:0}});
        }}/>
      )}
      <style>{globalStyles}</style>
    </div>
    {/* GammaSlider, emoji picker, and combat overlays all outside the filtered container
         so that position:fixed uses the true viewport (filter on ancestor breaks fixed positioning) */}
    <GammaSlider gamma={gamma} onChange={handleGamma}/>
    {isLocalTestMode&&(
      <button
        type="button"
        onClick={()=>setLocalDebugMode(v=>!v)}
        style={{
          ...smallBtnStyle,
          position:'fixed',
          top:14,
          left:14,
          zIndex:120,
          fontSize:11,
          padding:'6px 10px',
          background:localDebugMode?'#2a1608':'#140e08',
          color:localDebugMode?'#f0cb7a':'#9b7641',
          borderColor:localDebugMode?'#7a5324':'#3a2510',
          boxShadow:localDebugMode?'0 0 14px #7a532455':'none',
        }}
      >
        {localDebugMode?'Debug: 开':'Debug: 关'}
      </button>
    )}
    {isMultiplayer&&showEmojiPicker&&createPortal(
      <>
        <div onClick={()=>setShowEmojiPicker(false)} style={{position:'fixed',inset:0,zIndex:49}}/>
        <div style={{
          position:'fixed',
          top:emojiButtonPos.top,
          right:emojiButtonPos.right,
          background:'#140e04',border:'1.5px solid #4a3010',borderRadius:4,
          padding:6,display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:3,
          boxShadow:'0 4px 20px #00000088',zIndex:50,
        }}>
          {EMOJI_LIST.map(e=>(
            <button key={e} onClick={ev=>{ev.stopPropagation();handleEmojiClick(e);}} style={{
              background:'none',border:'none',fontSize:20,cursor:'pointer',
              padding:'3px 2px',borderRadius:3,lineHeight:1,
              transition:'background 0.1s',
            }}
            onMouseEnter={ev=>ev.currentTarget.style.background='#3a2010'}
            onMouseLeave={ev=>ev.currentTarget.style.background='none'}
            >{e}</button>
          ))}
        </div>
      </>,
      document.body
    )}
    {/* 停服更新公告 */}
    {serverAnnouncement&&(
      <div style={{
        position: 'fixed',
        top: '10%',
        left: 0,
        right: 0,
        zIndex: 2000,
        textAlign: 'center',
        pointerEvents: 'none'
      }}>
        <div style={{
          display: 'inline-block',
          background: 'rgba(0, 0, 0, 0.8)',
          color: '#ff8000',
          padding: '8px 20px',
          borderRadius: '4px',
          fontFamily: "'Cinzel', serif",
          fontSize: '14px',
          whiteSpace: 'nowrap',
          animation: 'scrollLeft 30s linear infinite'
        }}>
          {serverAnnouncement}
        </div>
      </div>
    )}
</>
  );
}

