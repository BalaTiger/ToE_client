import { GOD_DEFS } from '../../constants/card';
import { isBlackGoatYoung, isTsathogguaSlime } from '../../game';
import { getRestActionBlockReason } from '../../game/interactionAvailability';
import { TUTORIAL_FLOW } from '../../game/tutorialScenario';
import { DDCard, GodTooltip } from '../cards';
import { ThemeEdgeRelief } from '../theme/ThemeOrnaments';

export function HandArea({
  handAreaRef,
  skillButtonRef,
  restButtonRef,
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
  getButtonStyle,
  anim,
}) {
  return (
    <div
      ref={handAreaRef}
      className="toe-battle-panel toe-hand-area"
      data-hand-area
      data-main-actions={!isSpectating && phase === 'ACTION' && isVisualPlayerTurn && !isActionControlsHidden}
      style={{
        '--toe-action-scale': 1 / scaleRatio,
        backgroundColor: 'var(--toe-panel,#120900)',
        border: `1.5px solid ${myTurn ? 'var(--toe-line,#3a2010)' : 'var(--toe-line-dim,#2a1a08)'}`,
        borderRadius: 3,
        padding: isMobile
          ? `${mobileCssPx(10)}px ${mobileCssPx(10)}px`
          : isMobileLandscape
          ? `${mobileCssPx(5)}px ${mobileCssPx(8)}px`
          : '11px 13px',
        position: 'relative',
        overflow: 'visible',
      }}
    >
      <ThemeEdgeRelief expansionKey={gs.expansionKey} side="right" opacity={0.12} style={{ height: '100%' }} />
      <div
        className="toe-hand-heading"
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: isMobile || isMobileLandscape ? mobileCssPx(9) : 9,
          gap: isMobile || isMobileLandscape ? mobileCssPx(8) : 8,
        }}
      >
        <span
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
        </span>
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
                          <span className="toe-turn-icon" aria-hidden="true">{skillRi.icon || ri.icon}</span>
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
                          <span className="toe-turn-icon" aria-hidden="true">☕︎</span>
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
                          <span className="toe-turn-icon" aria-hidden="true">☣︎</span>
                          <span className="toe-turn-label">繁衍
                            {multiplyLimited && <small>已用</small>}
                          </span>
                        </button>
                      )}
                      {canShowEndTurnButton && (
                        <button className="toe-button toe-turn-plaque toe-turn-end"
                          onClick={endTurn}
                        >
                          <span className="toe-turn-icon" aria-hidden="true">⌛︎</span>
                          <span className="toe-turn-label">结束回合</span>
                        </button>
                      )}
                    </div>
                  </>
                );
              })()}
            {showCancelBtn && (
              <button className="toe-button" onClick={cancelAction} style={getButtonStyle({ enabled: true })}>
                ✕ 取消
              </button>
            )}
            {phase === 'HUNT_CONFIRM' && !isScriptedTutorial && decisionContext?.localCanAct && !anim && (
              <button className="toe-button" onClick={() => huntConfirm(-1)} style={getButtonStyle({ enabled: true })}>
                ✕ 放弃追捕
              </button>
            )}
          </div>
        )}
        {phase === 'DISCARD_PHASE' && !isDiscardPhaseResolving && isLocalCurrentTurn(gs) && !isBlocked && (
          <button className="toe-button toe-button-danger"
            onClick={confirmDiscard}
            disabled={!(gs.abilityData.discardSelected || []).length}
            style={getButtonStyle({ enabled: !!(gs.abilityData.discardSelected || []).length, tone: 'danger', marginLeft: 'auto' })}
          >
            确认弃牌{(gs.abilityData.discardSelected || []).length > 0 ? ` (${(gs.abilityData.discardSelected || []).length})` : ''}
          </button>
        )}
        {phase === 'BURY_ALIVE_SELECT' && canPlayerRespondWithAnyHandCard() && (
          <button className="toe-button"
            onClick={confirmBuryAliveSelection}
            disabled={gs.abilityData?.buryAliveSelectedIndex == null}
            style={getButtonStyle({ enabled: gs.abilityData?.buryAliveSelectedIndex != null, marginLeft: 'auto' })}
          >
            确认活埋
          </button>
        )}
        {phase === 'IGNITE_TORCH_DISCARD' && canPlayerRespondWithAnyHandCard() && (
          <button className="toe-button toe-button-danger"
            onClick={confirmIgniteTorchDiscard}
            disabled={gs.abilityData?.igniteTorchSelectedIndex == null}
            style={getButtonStyle({ enabled: gs.abilityData?.igniteTorchSelectedIndex != null, tone: 'danger', marginLeft: 'auto' })}
          >
            确认引燃
          </button>
        )}
      </div>
      <div
        className="toe-hand-card-strip"
        data-self-hand-strip
        data-hand-fanned={!isMobile && !isMobileLandscape && visualMe.hand.length > 1 && visualMe.hand.length <= 8}
        style={{
          display: 'flex',
          gap: isMobile || isMobileLandscape ? mobileCssPx(7) : 6,
          flexWrap: 'wrap',
          justifyContent: !isMobile && !isMobileLandscape ? 'center' : undefined,
        }}
      >
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
          const fanEnabled = !isMobile && !isMobileLandscape && visualMe.hand.length > 1 && visualMe.hand.length <= 8;
          const fanCenter = (visualMe.hand.length - 1) / 2;
          const fanOffset = fanEnabled ? (i - fanCenter) / fanCenter : 0;
          const fanAngle = fanOffset * Math.min(6, (visualMe.hand.length - 1) * 1.5);
          return (
            <div
              key={c.id}
              data-self-hand-card
              data-self-hand-card-id={c.id}
              data-hand-fan-card={fanEnabled ? '' : undefined}
              ref={el => {
                if (el) mobileGodCardRefs.current.set(i, el);
                else mobileGodCardRefs.current.delete(i);
              }}
              className={isBlackGoatPulsing ? 'black-goat-card-pulse' : ''}
              style={{
                position: 'relative',
                display: 'inline-block',
                flexShrink: 0,
                '--toe-hand-angle': `${fanAngle}deg`,
                // Individual transforms preserve the existing hop/melt animations.
                rotate: fanEnabled ? `${fanAngle}deg` : undefined,
                translate: fanEnabled ? `0 ${-3 * (1 - fanOffset * fanOffset)}px` : undefined,
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
                hideCssFrame={isBlackGoatYoung(c) || isTsathogguaSlime(c)}
                frameStyle={isMobile || isMobileLandscape ? { zoom: selfHandCardScale } : { width: 82 * selfHandCardScale }}
              />
              {canUpgradeNow && (
                <div
                  data-hand-card-hint
                  style={{
                    position: 'absolute',
                    top: -7,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)",
                    fontSize: 8,
                    color: '#c8a96e',
                    background: '#0a0705',
                    border: '1px solid #8a6020',
                    borderRadius: 2,
                    padding: '1px 4px',
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                    zIndex: 10,
                  }}
                >
                  ⬆ 升级邪神之力
                </div>
              )}
              {showWorshipHint && (
                <div
                  data-hand-card-hint
                  style={{
                    position: 'absolute',
                    top: -7,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)",
                    fontSize: 8,
                    color: '#b080e0',
                    background: '#0a0412',
                    border: '1px solid #7040aa',
                    borderRadius: 2,
                    padding: '1px 4px',
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                    zIndex: 10,
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
      {isMobile && mobileArmedGodCard?.isGod && mobileArmedGodTooltipRect && (
        <GodTooltip def={GOD_DEFS[mobileArmedGodCard.godKey]} godLevel={1} position={mobileArmedGodTooltipRect} />
      )}
    </div>
  );
}
