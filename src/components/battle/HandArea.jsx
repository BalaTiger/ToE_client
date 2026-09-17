import { useLayoutEffect, useRef, useState } from 'react';
import { GOD_DEFS } from '../../constants/card';
import { isBlackGoatYoung, isTsathogguaSlime } from '../../game';
import { getRestActionBlockReason } from '../../game/interactionAvailability';
import { TUTORIAL_FLOW } from '../../game/tutorialScenario';
import { DDCard, GodTooltip } from '../cards';
import { useUiAppearance } from '../../ui/UiAppearance';
import { buildPublicUrl } from '../../utils/url';
import { HandTableDecor, HandTableSurface } from './HandTableDecor';
import { ActionIcon } from './ActionIcon';
import './hand-composition.css';
import './coastal-hand.css';

export function HandArea({
  handAreaRef,
  skillButtonRef,
  restButtonRef,
  phasePrompt,
  coastalGeometry,
  gs,
  me,
  visualMe,
  ri,
  phase,
  myTurn,
  decisionContext,
  isSpectating,
  isVisualPlayerTurn,
  isActionControlsHidden,
  cancelable,
  showCancelBtn,
  canShowEndTurnButton,
  isDiscardPhaseResolving,
  isDiscardPhasePromptActive,
  isLocalHuntRevealPrompt,
  isLocalCurrentTurn,
  currentTurnPlayer,
  isBlocked,
  isScriptedTutorial,
  isTutorialActionAllowed,
  tutorialStep,
  effectiveHandLimit,
  skillLimited,
  skillRi,
  effectiveSkillName,
  isMyCardClickable,
  canPlayerRespondWithAnyHandCard,
  canPlayerRespondWithFireHandCard,
  cardsHuntMatch,
  mobileArmedGodCardIdx,
  mobileArmedGodCard,
  mobileArmedGodTooltipRect,
  mobileGodCardRefs,
  blackGoatPulsePid,
  promptWarningTextColor,
  promptActiveTextColor,
  isMobile,
  isMobileLandscape,
  mobileCssPx,
  interactionFontSizes,
  mobileHandUsesCompact,
  selfHandCardScale,
  scaleRatio = 1,
  handleMyCardClick,
  useAbility,
  doRest,
  endTurn,
  cancelAction,
  huntConfirm,
  confirmDiscard,
  confirmBuryAliveSelection,
  confirmIgniteTorchDiscard,
  setGs,
  anim,
}) {
  const { appearance } = useUiAppearance();
  const skillIcon = skillRi?.icon || ri?.icon;
  const coastalHand = appearance.battleLayout === 'coastal';
  const integratedHand = appearance.battleLayout === 'arch' || coastalHand;
  const stripRef = useRef(null);
  const leftReliefRef = useRef(null);
  const rightReliefRef = useRef(null);
  const [handSpace, setHandSpace] = useState({ betweenReliefs: 620, stripWidth: 1150 });
  const desktopHand = !isMobile && !isMobileLandscape;
  useLayoutEffect(() => {
    if (!desktopHand || coastalGeometry) return;
    const strip = stripRef.current;
    const left = leftReliefRef.current;
    const right = rightReliefRef.current;
    if (!strip || (!coastalHand && (!left || !right))) return;
    const measure = () => {
      const zoom = strip.getBoundingClientRect().width / strip.offsetWidth;
      if (!zoom) return;
      const betweenReliefs = coastalHand ? strip.clientWidth
        : (right.getBoundingClientRect().left - left.getBoundingClientRect().right) / zoom;
      const stripWidth = strip.offsetWidth;
      setHandSpace(previous => Math.abs(previous.betweenReliefs - betweenReliefs) < .5 && previous.stripWidth === stripWidth
        ? previous : { betweenReliefs, stripWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    (coastalHand ? [strip] : [strip, left, right]).forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [desktopHand, coastalHand, coastalGeometry]);
  const fanEnabled = desktopHand && visualMe.hand.length > 1;
  const mobileCardScale = integratedHand && isMobileLandscape ? Math.max(selfHandCardScale, 1 / scaleRatio) : selfHandCardScale;
  // Single/very small hands stop at a readable portrait size rather than filling the screen vertically.
  const cardWidth = desktopHand
    ? coastalGeometry?.hand.cardWidth ?? Math.min(coastalHand ? 200 : 240, handSpace.betweenReliefs / (1 + Math.max(0, visualMe.hand.length - 1) * .8))
    : (mobileHandUsesCompact ? 62 : 82) * mobileCardScale;
  const fanStep = cardWidth * .8;
  const fanHalfSpan = Math.max(0, visualMe.hand.length - 1) * fanStep / 2;
  // The table and card top edges share y = x² / (2R), in board pixels.
  const fanRadius = coastalGeometry?.hand.radius ?? Math.max(900, fanHalfSpan * fanHalfSpan / 64);
  const fanLift = coastalGeometry?.hand.lift ?? fanHalfSpan * fanHalfSpan / (2 * fanRadius);
  const badgeX = handSpace.betweenReliefs / 2 + 20;
  const handCardHintStyle = {
    position: 'absolute',
    top: 0,
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)",
    // Compensate both the board and the outer mobile landscape frame.
    fontSize: `calc(${Math.max(12, 12 / scaleRatio)}px / var(--toe-mobile-screen-scale, 1))`,
    lineHeight: 1.25,
    borderRadius: 3,
    padding: '3px 6px',
    width: 'max-content',
    maxWidth: 'calc(100% - 8px)',
    boxSizing: 'border-box',
    textAlign: 'center',
    pointerEvents: 'none',
    whiteSpace: 'normal',
    zIndex: 10,
  };
  const handCount = integratedHand && (
    <div
      className="toe-hand-count"
      data-over-limit={visualMe.hand.length > effectiveHandLimit}
      role="status"
      aria-label={`手牌 ${visualMe.hand.length} 张，上限 ${effectiveHandLimit} 张`}
    >
      <svg viewBox="0 0 38 24" aria-hidden="true" focusable="false">
        <rect x="4" y="5" width="10" height="15" rx="1" transform="rotate(-21 9 12.5)" />
        <rect x="24" y="5" width="10" height="15" rx="1" transform="rotate(21 29 12.5)" />
        <rect x="14" y="3" width="10" height="17" rx="1" />
      </svg>
      <span className="toe-hand-count-label" aria-hidden="true">手牌</span>
      <span className="toe-hand-count-value" aria-hidden="true"><strong>{visualMe.hand.length}</strong><span> / {effectiveHandLimit}</span></span>
    </div>
  );
  return (
    <div
      ref={handAreaRef}
      className="toe-hand-area"
      data-hand-area
      data-hand-empty={visualMe.hand.length === 0}
      data-current-turn={myTurn}
      data-main-actions={!isSpectating && phase === 'ACTION' && isVisualPlayerTurn && !isActionControlsHidden}
      data-hand-layout={desktopHand ? 'desktop' : isMobileLandscape ? 'landscape' : 'portrait'}
      data-hand-composition={coastalHand ? 'coastal' : undefined}
      style={{
        '--toe-action-scale': coastalHand && desktopHand ? 1 : 1 / scaleRatio,
        '--toe-hand-space': `${handSpace.betweenReliefs}px`,
        '--toe-hand-badge-y': `${56 - fanLift + 10 + badgeX * badgeX / (2 * fanRadius) + 25}px`,
        ...(coastalHand ? {
          '--toe-coastal-prompt-image': `url('${buildPublicUrl('/img/ui/coastal/prompt.webp')}')`,
          '--toe-coastal-count-image': `url('${buildPublicUrl('/img/ui/coastal/hand-count.webp')}')`,
        } : {}),
        padding: isMobile
          ? `${mobileCssPx(10)}px ${mobileCssPx(10)}px`
          : isMobileLandscape
          ? `${mobileCssPx(5)}px ${mobileCssPx(8)}px`
          : '11px 13px',
        position: 'relative',
        overflow: 'visible',
      }}
    >
      {!coastalHand && <HandTableDecor hideSurface={desktopHand} leftRef={leftReliefRef} rightRef={rightReliefRef} />}
      <div
        className="toe-hand-heading"
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: isMobile || isMobileLandscape ? mobileCssPx(9) : 9,
          gap: isMobile || isMobileLandscape ? mobileCssPx(8) : 8,
        }}
      >
        {integratedHand && phasePrompt && <div className="toe-hand-prompt" data-prompt-panel>{phasePrompt}</div>}
        {!integratedHand && <span
          style={{
            fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)",
            color:
              !isSpectating && (isDiscardPhasePromptActive || phase === 'PLAYER_REVEAL_FOR_HUNT' || isLocalHuntRevealPrompt)
                ? promptWarningTextColor
                : promptActiveTextColor,
            fontSize: interactionFontSizes.body,
            letterSpacing: isMobile ? 0.5 : 1,
          }}
        >
          {isSpectating
            ? `手牌 (${visualMe.hand.length}/${effectiveHandLimit})`
            : isDiscardPhasePromptActive
            ? isLocalCurrentTurn(gs)
              ? `⚠ 手牌超限 (${visualMe.hand.length}/${effectiveHandLimit})`
              : `等待 ${currentTurnPlayer?.name || '当前玩家'} 弃牌…`
            : phase === 'PLAYER_REVEAL_FOR_HUNT'
            ? '⚠ 选择亮出一张手牌'
            : isLocalHuntRevealPrompt
            ? '⚠ 选择亮出一张手牌'
            : `手牌 (${visualMe.hand.length}/${effectiveHandLimit})`}
        </span>}
        <div className="toe-hand-controls">
        {!isSpectating && ((phase === 'ACTION' && isVisualPlayerTurn && !isActionControlsHidden) || cancelable) && (
          <div className="toe-turn-actions">
            {phase === 'ACTION' &&
              isVisualPlayerTurn &&
              !isActionControlsHidden &&
              (() => {
                const skillRole = gs.globalOnlySwapOwner != null ? '寻宝者' : me.role;
                const isHunter = skillRole === '追猎者';
                const skillDisabled = !!me.disableSkill;
                const restBlockReason = getRestActionBlockReason({ phase, isBlocked, gs, player: me });
                const restLimited = !!restBlockReason;
                const skillRestLimited =
                  skillDisabled || (isHunter ? gs.restUsed || gs.multiplyUsed : skillLimited || gs.restUsed || gs.skillUsed || gs.multiplyUsed);
                const hasBgy = me.hand.some(isBlackGoatYoung);
                const multiplyLimited = gs.skillUsed || gs.restUsed || gs.multiplyUsed;
                const showTutorialSkillButton = !isScriptedTutorial || isTutorialActionAllowed({ type: 'useSkill' });
                const showTutorialRestButton = !isScriptedTutorial;
                const showTutorialMultiplyButton = !isScriptedTutorial;
                return (
                  <>
                    <div className="toe-main-actions" role="group" aria-label="回合行动">
                      {showTutorialSkillButton && (
                        <button className="toe-button toe-turn-plaque toe-turn-skill"
                          ref={skillButtonRef}
                          onClick={useAbility}
                          disabled={skillRestLimited}
                        >
                          <ActionIcon kind={skillIcon === '☩' ? 'hunt' : skillIcon === '☽' ? 'cult' : 'treasure'} />
                          <span className="toe-turn-label">{effectiveSkillName}
                            {skillRestLimited && (
                              <small>{skillDisabled ? '技能受限' : gs.restUsed ? '已休息' : '已用'}</small>
                            )}
                          </span>
                        </button>
                      )}
                      {showTutorialRestButton && (
                        <button className="toe-button toe-turn-plaque toe-turn-rest"
                          ref={restButtonRef}
                          onClick={doRest}
                          disabled={restLimited}
                        >
                          <ActionIcon kind="rest" />
                          <span className="toe-turn-label">休息
                            {restLimited && (
                              <small>{restBlockReason === 'disableRest' ? '失眠' : '已用'}</small>
                            )}
                          </span>
                        </button>
                      )}
                      {hasBgy && showTutorialMultiplyButton && (
                        <button className="toe-button toe-turn-plaque toe-turn-multiply"
                          onClick={() => setGs({ ...gs, phase: 'MULTIPLY_SELECT_TARGET', abilityData: { ...gs.abilityData } })}
                          disabled={multiplyLimited}
                        >
                          <ActionIcon kind="multiply" />
                          <span className="toe-turn-label">繁衍
                            {multiplyLimited && <small>已用</small>}
                          </span>
                        </button>
                      )}
                      {canShowEndTurnButton && (
                        <button className="toe-button toe-turn-plaque toe-turn-end"
                          onClick={endTurn}
                        >
                          <ActionIcon kind="end" />
                          <span className="toe-turn-label">结束回合</span>
                        </button>
                      )}
                    </div>
                  </>
                );
              })()}
            {showCancelBtn && (
              <button className="toe-button toe-turn-plaque toe-turn-rest" onClick={cancelAction}>
                <ActionIcon kind="cancel" /><span className="toe-turn-label">取消</span>
              </button>
            )}
            {phase === 'HUNT_CONFIRM' && !isScriptedTutorial && decisionContext?.localCanAct && !anim && (
              <button className="toe-button toe-turn-plaque toe-turn-rest toe-phase-plaque" onClick={() => huntConfirm(-1)}>
                <ActionIcon kind="cancel" /><span className="toe-turn-label">放弃追捕</span>
              </button>
            )}
          </div>
        )}
        <div className="toe-turn-actions toe-phase-actions" role="group" aria-label="阶段确认">
        {phase === 'DISCARD_PHASE' && !isDiscardPhaseResolving && isLocalCurrentTurn(gs) && !isBlocked && (
          <button className="toe-button toe-turn-plaque toe-turn-end toe-phase-plaque"
            onClick={confirmDiscard}
            disabled={!(gs.abilityData.discardSelected || []).length}
          >
            <ActionIcon kind="confirm" /><span className="toe-turn-label">确认弃牌{(gs.abilityData.discardSelected || []).length > 0 ? ` (${(gs.abilityData.discardSelected || []).length})` : ''}</span>
          </button>
        )}
        {phase === 'BURY_ALIVE_SELECT' && canPlayerRespondWithAnyHandCard() && (
          <button className="toe-button toe-turn-plaque toe-turn-skill toe-phase-plaque"
            onClick={confirmBuryAliveSelection}
            disabled={gs.abilityData?.buryAliveSelectedIndex == null}
          >
            <ActionIcon kind="confirm" /><span className="toe-turn-label">确认活埋</span>
          </button>
        )}
        {phase === 'IGNITE_TORCH_DISCARD' && canPlayerRespondWithAnyHandCard() && (
          <button className="toe-button toe-turn-plaque toe-turn-end toe-phase-plaque"
            onClick={confirmIgniteTorchDiscard}
            disabled={gs.abilityData?.igniteTorchSelectedIndex == null}
          >
            <ActionIcon kind="confirm" /><span className="toe-turn-label">确认引燃</span>
          </button>
        )}
        </div>
        </div>
      </div>
      <div
        className="toe-hand-card-strip"
        ref={stripRef}
          data-self-hand-strip
          data-hand-card-width={cardWidth}
        data-hand-fanned={fanEnabled}
        style={{
          display: 'flex',
          gap: 0,
          flexWrap: 'nowrap',
          justifyContent: desktopHand ? coastalHand ? 'flex-end' : 'center' : undefined,
        }}
      >
        {desktopHand && !coastalHand && <HandTableSurface fan={{ radius: fanRadius, lift: fanLift, width: handSpace.stripWidth, top: 56, height: 56 + cardWidth * 590 / 392 + 8 }} />}
        {!coastalHand && handCount}
        {visualMe.hand.map((c, i) => {
          const clickable = isMyCardClickable(c, i);
          const isMobileArmedGod = isMobile && mobileArmedGodCardIdx === i;
          const isBuryAliveSelected =
            phase === 'BURY_ALIVE_SELECT' && canPlayerRespondWithAnyHandCard() && gs.abilityData?.buryAliveSelectedIndex === i;
          const isIgniteTorchSelected =
            phase === 'IGNITE_TORCH_DISCARD' && canPlayerRespondWithAnyHandCard() && gs.abilityData?.igniteTorchSelectedIndex === i;
          const isSel =
            (phase === 'DISCARD_PHASE' && !isBlocked && isLocalCurrentTurn(gs) && (gs.abilityData.discardSelected || []).includes(i)) ||
            isMobileArmedGod ||
            isBuryAliveSelected ||
            isIgniteTorchSelected;
          const isMatch = phase === 'HUNT_CONFIRM' && gs.abilityData?.revCard && cardsHuntMatch(c, gs.abilityData.revCard);
          const isAlbinoFireCard =
            phase === 'ALBINO_CREATURE_SELECT_CARD' &&
            canPlayerRespondWithFireHandCard() &&
            (gs.abilityData?.fireCardIds || []).includes(c?.id);
          const isGodUpgrade = c.isGod && visualMe.godName === c.godKey && (visualMe.godLevel || 0) < 3;
          const canUpgradeNow = isGodUpgrade && phase === 'ACTION' && isVisualPlayerTurn;
          const canWorshipNow = c.isGod && !isGodUpgrade && phase === 'ACTION' && isVisualPlayerTurn;
          const showWorshipHint = canWorshipNow && (!isMobile || isMobileArmedGod);
          const isBlackGoatPulsing = blackGoatPulsePid === 0 && isBlackGoatYoung(c);
          const visuallyDisabled = !clickable && tutorialStep !== TUTORIAL_FLOW.CULTIST_ZONE_SELECT_CARD;
          const fanX = (i - (visualMe.hand.length - 1) / 2) * fanStep;
          const fanAngle = fanEnabled ? Math.atan(fanX / fanRadius) * 180 / Math.PI : 0;
          const cardLift = fanLift - fanX * fanX / (2 * fanRadius);
          return (
            <div
              key={c.id}
              data-self-hand-card
              data-self-hand-card-id={c.id}
              data-hand-fan-card={desktopHand ? '' : undefined}
              ref={el => {
                if (el) mobileGodCardRefs.current.set(i, el);
                else mobileGodCardRefs.current.delete(i);
              }}
              className={isBlackGoatPulsing ? 'black-goat-card-pulse' : ''}
              style={{
                position: 'relative',
                display: 'inline-block',
                flexShrink: 0,
                marginLeft: i > 0 ? fanStep - cardWidth : undefined,
                '--toe-hand-angle': `${fanAngle}deg`,
                '--toe-hand-rest-y': `${fanEnabled ? -cardLift : 0}px`,
                // Individual transforms preserve the existing hop/melt animations.
                rotate: fanEnabled ? `${fanAngle}deg` : undefined,
                zIndex: isSel ? 30 : undefined,
              }}
            >
              <DDCard
                card={c}
                onClick={clickable ? () => handleMyCardClick(i) : undefined}
                disabled={visuallyDisabled}
                selected={isSel}
                highlight={isMatch || canWorshipNow || canUpgradeNow || isAlbinoFireCard}
                godLevel={visualMe.godName === c.godKey ? visualMe.godLevel : 0}
                compact={mobileHandUsesCompact}
                holderId={0}
                showCaption={false}
                hoverPreview={false}
                hideCssFrame={isBlackGoatYoung(c) || isTsathogguaSlime(c)}
                frameStyle={isMobile || isMobileLandscape ? { zoom: mobileCardScale } : { width: cardWidth }}
              />
              {canUpgradeNow && (
                <div
                  data-hand-card-hint
                  style={{
                    ...handCardHintStyle,
                    color: '#c8a96e',
                    background: '#0a0705',
                    border: '1px solid #8a6020',
                  }}
                >
                  ⬆ 升级邪神之力
                </div>
              )}
              {showWorshipHint && (
                <div
                  data-hand-card-hint
                  style={{
                    ...handCardHintStyle,
                    color: '#cdb0ea',
                    background: '#0a0412',
                    border: '1px solid #7040aa',
                  }}
                >
                  ⛧ 点击信仰
                </div>
              )}
            </div>
          );
        })}
        {visualMe.hand.length === 0 && (
          <div style={{ fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontStyle: 'normal', color: '#7a5a2a', fontSize: 13, padding: '22px 10px' }}>
            手中空空如也
          </div>
        )}
      </div>
      {coastalHand && handCount}
      {isMobile && mobileArmedGodCard?.isGod && mobileArmedGodTooltipRect && (
        <GodTooltip def={GOD_DEFS[mobileArmedGodCard.godKey]} godLevel={1} position={mobileArmedGodTooltipRect} />
      )}
    </div>
  );
}
