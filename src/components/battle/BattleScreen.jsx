import { createPortal } from 'react-dom';
import {
  RINFO,
  ROLE_TREASURE,
  ROLE_HUNTER,
  ROLE_CULTIST,
  isValidEtherealizeRedirectTarget,
} from '../../game';
import { SOFT_GUIDE_DEFS } from '../../game/softGuides';
import { DESIGN_WIDTH } from '../../utils/scale';
import { PlayerPanel, PileDisplay, HoundsTimerBadge } from '../board';
import { BattleLogPanel } from '../log/BattleLogPanel';
import { BattlePhaseBar } from '../phase/BattlePhaseBar';
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
import { BattleHeader } from './BattleHeader';
import { SwapBlindDrawOverlay } from './SwapBlindDrawOverlay';
import { BattleDecisionModals } from './BattleDecisionModals';

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
    decisionContext,
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
    isLocalTortoiseSelectPhase,
    hasHuntRevealableCard,
    isLocalCurrentTurn,
    pendingZhuDrawCard,
    pendingZhuGodCard,
    pendingZhuSphinxCard,
    pendingZhuAiDrawCard,
    pendingZhuAnyCard,
    decisionError,
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
    confirmIgniteTorchDiscard,
    handleZhuHideDrawnCard,
    handleZhuHideGodCard,
    handleZhuHideTopCardDuringSphinx,
    handleZhuHideAiDrawCard,
    handleDrawKeepFromModal,
    handleDrawDiscardFromModal,
    runDecision,
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
    handleMusicVolume,
    handleSfxVolume,
    handleTutorialTreasureMapConfirm,
    markLocalTreasureMapShown,
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
    musicVolume,
    sfxVolume,
    isLocalTestMode,
    localDebugMode,
    setLocalDebugMode,
    serverAnnouncement,
    emojiButtonPos,
    isSoloPaused,
    setIsSoloPaused,
  } = props;

  const getButtonStyle = (opts) =>
    getPhaseActionButtonStyle({ isMobile, isMobileLandscape, mobileCssPx, interactionFontSizes, ...opts });

  return (
    <>
    <div className={`toe-battle-root${drawBackgroundCameraActive?' toe-draw-camera-active':''}`} onClickCapture={handleUiSfxCapture} style={{minHeight:isMobileLandscape?'100dvh':'100vh',height:isMobileLandscape?'100dvh':undefined,width:globalShiftX?`calc(100% - ${globalShiftX}px)`:'100%',boxSizing:'border-box',...battleBackgroundStyle,color:'var(--toe-text,#c8a96e)',fontFamily:"'IM Fell English','Georgia',serif",display:'flex',flexDirection:'column',gap:isMobile?5:isMobileLandscape?4:7,padding:isMobile?'6px 8px':isMobileLandscape?'4px 6px':'8px 10px',position:'relative',isolation:'isolate',left:globalShiftX||undefined,overflowX:'hidden',overflowY:isMobileLandscape?'hidden':'auto',scrollbarGutter:isMobileLandscape?undefined:'stable',
    animation:deathShake?'deathShakeAnim 2.0s ease-in-out':earthquakeShake?'earthquakeSceneShake 1.25s linear 2':screenShake?'screenShakeAnim 0.38s ease-in-out':undefined,
    animationPlayState:isSoloPaused?'paused':undefined,
    }}>
      {isSoloPaused&&<style>{`.toe-battle-root *, .toe-battle-root *::before, .toe-battle-root *::after { animation-play-state: paused !important; }`}</style>}
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
        <div
          style={{position:'fixed',inset:0,background:'#000000dd',zIndex:9999,
            display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{textAlign:'center',color:'#c8a0e8',fontFamily:"'Cinzel Decorative','Cinzel',serif",
            padding:'36px 48px',background:'#0e0a14',border:'2px solid #7a50b0',borderRadius:6,
            boxShadow:'0 0 60px #5a3a8066',animation:'animPop 0.25s ease-out'}}>
            <div style={{fontSize:48,marginBottom:16,filter:'drop-shadow(0 0 20px #a080d0)'}}>📡</div>
            <div style={{fontSize:16,letterSpacing:2,marginBottom:8}}>正在恢复连接</div>
            <div style={{fontSize:12,color:'#8060a0',letterSpacing:1,fontFamily:"'Cinzel',serif",fontStyle:'italic'}}>
              正在尝试返回当前对局，请稍候…
            </div>
            <button onClick={resetDisconnectedToStart} style={{marginTop:20,padding:'8px 16px',background:'#1e0d36',border:'1px solid #6a4890',borderRadius:3,color:'#a888c8',fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1,cursor:'pointer'}}>放弃重连并返回主界面</button>
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
      {isSoloPaused&&(
        <div role="dialog" aria-modal="true" aria-labelledby="solo-pause-title"
          style={{position:'fixed',inset:0,zIndex:10030,background:'rgba(0,0,0,0.86)',display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
          <div style={{width:'min(420px,92vw)',background:'#120b06',border:'2px solid #9a762f',borderRadius:5,boxShadow:'0 0 60px #000, 0 0 24px #9a762f33',padding:'28px 24px',textAlign:'center'}}>
            <div id="solo-pause-title" style={{fontFamily:"'Cinzel Decorative','Cinzel',serif",fontSize:22,color:'#e8c87a',letterSpacing:3,marginBottom:8}}>游戏已暂停</div>
            <div style={{fontSize:13,color:'#9c7b43',marginBottom:24}}>对局进程已冻结</div>
            <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap'}}>
              <button type="button" autoFocus onClick={()=>setIsSoloPaused(false)} style={{padding:'9px 24px',background:'#2a200c',border:'1.5px solid #c89b3c',color:'#f0d080',fontWeight:700,fontSize:13,borderRadius:3,cursor:'pointer'}}>继续游戏</button>
              <button type="button" onClick={returnToMainMenu} style={{padding:'9px 24px',background:'#2a0c08',border:'1.5px solid #8a3028',color:'#e08070',fontWeight:700,fontSize:13,borderRadius:3,cursor:'pointer'}}>返回主界面</button>
            </div>
          </div>
        </div>
      )}

      {/* Animations rendered outside the zoom container, see Fragment below */}
      {/* Target selection mask + floating prompt */}
      <TargetSelectOverlay drawReveal={gs.drawReveal} phase={canLocalTargetSelect?phase:null} bewitchCard={gs.abilityData?.bewitchCard}/>

      <BattleDecisionModals
        gs={gs}
        me={me}
        phase={phase}
        decisionContext={decisionContext}
        suppressAnim={suppressAnim}
        canShowTurnDecisionModal={canShowTurnDecisionModal}
        decisionError={decisionError}
        runDecision={runDecision}
        isLocalGodChoice={isLocalGodChoice}
        isLocalDrawDecision={isLocalDrawDecision}
        isLocalNyaBorrowPhase={isLocalNyaBorrowPhase}
        isLocalTortoiseSelectPhase={isLocalTortoiseSelectPhase}
        isLocalTreasureDodgePhase={isLocalTreasureDodgePhase}
        isLocalTreasureAoEDodgePhase={isLocalTreasureAoEDodgePhase}
        isLocalSeatIndex={isLocalSeatIndex}
        isLocalFirstComePicker={isLocalFirstComePicker}
        isLocalSameAbyssTargetPhase={isLocalSameAbyssTargetPhase}
        isLocalSphinxGuessPhase={isLocalSphinxGuessPhase}
        isMobile={isMobile}
        visualMe={visualMe}
        showTutorial={showTutorial}
        tutorialStep={tutorialStep}
        isTutorialActionAllowed={isTutorialActionAllowed}
        isTutorialDrawKeepStep={isTutorialDrawKeepStep}
        isScriptedTutorial={isScriptedTutorial}
        pendingZhuDrawCard={pendingZhuDrawCard}
        pendingZhuGodCard={pendingZhuGodCard}
        pendingZhuSphinxCard={pendingZhuSphinxCard}
        pendingZhuAiDrawCard={pendingZhuAiDrawCard}
        pendingZhuAnyCard={pendingZhuAnyCard}
        pendingZhuDrawAnyCard={pendingZhuDrawAnyCard}
        pendingZhuGodAnyCard={pendingZhuGodAnyCard}
        pendingZhuSphinxAnyCard={pendingZhuSphinxAnyCard}
        privatePeek={privatePeek}
        scaleRatio={scaleRatio}
        drawRevealKeepButtonRef={drawRevealKeepButtonRef}
        godKeepHandButtonRef={godKeepHandButtonRef}
        dodgeRollButtonRef={dodgeRollButtonRef}
        godResolvePlayer={godResolvePlayer}
        nyaBorrow={nyaBorrow}
        nyaSkip={nyaSkip}
        handleZhuHideDrawnCard={handleZhuHideDrawnCard}
        handleZhuHideGodCard={handleZhuHideGodCard}
        handleZhuHideTopCardDuringSphinx={handleZhuHideTopCardDuringSphinx}
        handleZhuHideAiDrawCard={handleZhuHideAiDrawCard}
        handleDrawKeepFromModal={handleDrawKeepFromModal}
        handleDrawDiscardFromModal={handleDrawDiscardFromModal}
        handleTreasureDodgeRoll={handleTreasureDodgeRoll}
        handleTreasureDodgeSkip={handleTreasureDodgeSkip}
        handleTreasureAOEDodgeRoll={handleTreasureAOEDodgeRoll}
        handleTreasureAOEDodgeSkip={handleTreasureAOEDodgeSkip}
        resolveTsathogguaSlimeBalance={resolveTsathogguaSlimeBalance}
        resolveEtherealizeRedirect={resolveEtherealizeRedirect}
        tortoiseOracleSelect={tortoiseOracleSelect}
        setPrivatePeek={setPrivatePeek}
        firstComePickSelectCard={firstComePickSelectCard}
        graveDigSelectGod={graveDigSelectGod}
        sameAbyssSelect={sameAbyssSelect}
        sphinxGuess={sphinxGuess}
        decipherStoneCarvingConfirm={decipherStoneCarvingConfirm}
      />

      <div style={{position:'relative',zIndex:2,display:'flex',flexDirection:'column',gap:isMobileLandscape?mobileCssPx(4):7}}>
        {/* Header */}
        <BattleHeader
          isMultiplayer={isMultiplayer}
          isSpectating={isSpectating}
          showTutorial={showTutorial}
          baseFontSizes={baseFontSizes}
          scaleRatio={scaleRatio}
          isMobile={isMobile}
          isMobileLandscape={isMobileLandscape}
          mobileZoomCompensate={mobileZoomCompensate}
          setExitMatchConfirm={setExitMatchConfirm}
          returnToMainMenu={returnToMainMenu}
          pauseGame={()=>setIsSoloPaused(true)}
        />

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
            const isEtherealizeTargetAllowed=phase!=='ETHEREALIZE_SELECT_TARGET'||isValidEtherealizeRedirectTarget({players:visualPlayers,abilityData:gs.abilityData,targetIdx:pi});
            const isSel=selectingOther&&!p.isDead&&!isBlocked&&isTutorialTargetAllowed&&isEtherealizeTargetAllowed&&!(phase==='HUNT_SELECT_TARGET'&&(!hasHuntRevealableCard(p)||huntAbandoned.includes(pi)));
            // 掉包：公开手牌时正面选择；暗抽时改为全屏遮罩选择，不再点击手牌区
            const isSwapPublicTargetCardPhase=phase==='SWAP_SELECT_TARGET_CARD'&&decisionContext?.localCanAct&&gs.abilityData?.swapTi===pi;
            // 在HUNT_SELECT_CARD_FROM_PUBLIC阶段，如果这是死者玩家，显示其手牌并允许选择
            const isHuntCardFromPublicPhase=phase==='HUNT_SELECT_CARD_FROM_PUBLIC'&&decisionContext?.localCanAct&&gs.abilityData?.huntTi===pi;
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
            player={visualMe}
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
          decisionContext={decisionContext}
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
          confirmIgniteTorchDiscard={confirmIgniteTorchDiscard}
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
          {!showTutorial&&anim?.type!=='APOPHIS_ECLIPSE'&&<ApophisNightBadge
            night={anim&&Object.prototype.hasOwnProperty.call(anim,'_apophisNight')
              ?anim._apophisNight
              :gs?.apophisNight}
          />}
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
      <SwapBlindDrawOverlay
        swapBlindDraw={swapBlindDraw}
        swapBlindCardLayout={swapBlindCardLayout}
        targetName={gs.players[swapBlindDraw?.targetPi]?.name}
        expansionKey={gs.expansionKey}
        swapBlindHandRef={swapBlindHandRef}
        handleSwapBlindDrawSelect={handleSwapBlindDrawSelect}
      />

      {phase==='MP_PLAYER_WIN_WAIT'&&(()=>{
        // 远端玩家集齐宝藏：本地同步播放藏宝图动画，但按钮替换为等待提示，
        // 待远端点击「宣布胜利」（或其 3 秒倒计时自动点击）后由 gameOver 同步切入结算。
        const winIdx=gs?.abilityData?.winnerIdx??null;
        const winnerPlayer=winIdx!=null?gs?.players?.[winIdx]:null;
        return (
          <TreasureMapAnim
            hand={winnerPlayer?.hand||[]}
            subtitle={`${winnerPlayer?.name||'其他玩家'} 集齐了全部编号！`}
            waitingLabel={`正在等待 ${winnerPlayer?.name||'获胜者'} ……`}
          />
        );
      })()}
      {phase==='PLAYER_WIN_PENDING'&&(
        <TreasureMapAnim hand={me.hand} confirmCountdownSec={gs?._isMP?3:null} onConfirm={showTutorial?handleTutorialTreasureMapConfirm:()=>{
          markLocalTreasureMapShown?.();
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
    <GammaSlider gamma={gamma} onChange={handleGamma} musicVolume={musicVolume} onMusicVolumeChange={handleMusicVolume} sfxVolume={sfxVolume} onSfxVolumeChange={handleSfxVolume}/>
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

