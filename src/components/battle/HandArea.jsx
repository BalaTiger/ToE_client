import { GOD_DEFS } from '../../constants/card';
import { isBlackGoatYoung } from '../../game';
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
  handleMyCardClick,
  useAbility,
  doRest,
  endTurn,
  cancelAction,
  huntConfirm,
  confirmDiscard,
  confirmBuryAliveSelection,
  setGs,
  getButtonStyle,
  anim,
}) {
  return (
    <div
      ref={handAreaRef}
      data-hand-area
      style={{
        background: 'var(--toe-panel,#120900)',
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
      <ThemeEdgeRelief expansionKey={gs.expansionKey} side="right" opacity={0.26} style={{ height: '100%' }} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: isMobile || isMobileLandscape ? mobileCssPx(9) : 9,
          gap: isMobile || isMobileLandscape ? mobileCssPx(8) : 8,
        }}
      >
        <span
          style={{
            fontFamily: "'Cinzel',serif",
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
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexWrap: 'wrap', position: 'relative', zIndex: 200 }}>
            {phase === 'ACTION' &&
              isVisualPlayerTurn &&
              !isActionControlsHidden &&
              (() => {
                const skillRole = gs.globalOnlySwapOwner != null ? '寻宝者' : me.role;
                const isHunter = skillRole === '追猎者';
                const skillDisabled = !!me.disableSkill;
                const restLimited = gs.restUsed || gs.multiplyUsed || (isHunter ? gs.skillUsed : gs.skillUsed);
                const skillRestLimited =
                  skillDisabled || (isHunter ? gs.restUsed || gs.multiplyUsed : skillLimited || gs.restUsed || gs.skillUsed || gs.multiplyUsed);
                const hasBgy = me.hand.some(isBlackGoatYoung);
                const multiplyLimited = gs.skillUsed || gs.restUsed || gs.multiplyUsed;
                const showTutorialSkillButton = !isScriptedTutorial || isTutorialActionAllowed({ type: 'useSkill' });
                const showTutorialRestButton = !isScriptedTutorial;
                const showTutorialMultiplyButton = !isScriptedTutorial;
                return (
                  <>
                    {hasBgy && showTutorialMultiplyButton && (
                      <button
                        onClick={() => setGs({ ...gs, phase: 'MULTIPLY_SELECT_TARGET', abilityData: { ...gs.abilityData } })}
                        disabled={multiplyLimited}
                        style={{
                          padding: isMobile || isMobileLandscape ? `${mobileCssPx(5)}px ${mobileCssPx(10)}px` : '6px 14px',
                          background: multiplyLimited ? '#130a04' : '#0e1a0e',
                          border: `1.5px solid ${multiplyLimited ? 'var(--toe-line-dim,#2a1a08)' : '#2a5a2a'}`,
                          color: multiplyLimited ? 'var(--toe-line,#3a2510)' : '#4ade80',
                          fontFamily: "'Cinzel',serif",
                          fontWeight: 700,
                          fontSize: interactionFontSizes.body,
                          borderRadius: 2,
                          cursor: multiplyLimited ? 'not-allowed' : 'pointer',
                          letterSpacing: isMobile ? 0.5 : 1,
                          boxShadow: multiplyLimited ? 'none' : '0 0 10px #4ade8044',
                          textTransform: 'uppercase',
                          opacity: multiplyLimited ? 0.4 : 1,
                        }}
                      >
                        ☣ 繁衍
                        {multiplyLimited && <span style={{ fontSize: 9, marginLeft: 4, color: 'var(--toe-muted,#7a5a2a)' }}>(已用)</span>}
                      </button>
                    )}
                    {showTutorialSkillButton && (
                      <button
                        ref={skillButtonRef}
                        onClick={useAbility}
                        disabled={skillRestLimited}
                        style={{
                          padding: isMobile || isMobileLandscape ? `${mobileCssPx(5)}px ${mobileCssPx(10)}px` : '6px 16px',
                          background: '#1c1208',
                          border: `1.5px solid ${skillRestLimited ? 'var(--toe-line,#3a2510)' : skillRi.col}`,
                          color: skillRestLimited ? 'var(--toe-line,#3a2510)' : skillRi.col,
                          fontFamily: "'Cinzel',serif",
                          fontWeight: 700,
                          fontSize: interactionFontSizes.body,
                          borderRadius: 2,
                          cursor: skillRestLimited ? 'not-allowed' : 'pointer',
                          letterSpacing: isMobile ? 0.5 : 1,
                          boxShadow: skillRestLimited ? 'none' : `0 0 10px ${skillRi.col}44`,
                          textTransform: 'uppercase',
                          opacity: skillRestLimited ? 0.4 : 1,
                          position: 'relative',
                        }}
                      >
                        {skillRi.icon || ri.icon} {effectiveSkillName}
                        {skillRestLimited && (
                          <span style={{ fontSize: 9, marginLeft: 4, color: 'var(--toe-muted,#5a3020)' }}>
                            {gs.restUsed ? '(已休息)' : '(已用)'}
                          </span>
                        )}
                      </button>
                    )}
                    {showTutorialRestButton && (
                      <button
                        ref={restButtonRef}
                        onClick={doRest}
                        disabled={restLimited}
                        style={{
                          padding: isMobile || isMobileLandscape ? `${mobileCssPx(5)}px ${mobileCssPx(10)}px` : '6px 14px',
                          background: restLimited ? '#130a04' : '#0e1a0e',
                          border: `1.5px solid ${restLimited ? 'var(--toe-line-dim,#2a1a08)' : '#2a5a2a'}`,
                          color: restLimited ? 'var(--toe-line,#3a2510)' : '#4ade80',
                          fontFamily: "'Cinzel',serif",
                          fontWeight: 700,
                          fontSize: interactionFontSizes.body,
                          borderRadius: 2,
                          cursor: restLimited ? 'not-allowed' : 'pointer',
                          letterSpacing: isMobile ? 0.5 : 1,
                          boxShadow: restLimited ? 'none' : '0 0 10px #4ade8044',
                          textTransform: 'uppercase',
                          opacity: restLimited ? 0.4 : 1,
                        }}
                      >
                        ♥ 休息
                        {restLimited && <span style={{ fontSize: 9, marginLeft: 4, color: 'var(--toe-muted,#7a5a2a)' }}>(已用)</span>}
                      </button>
                    )}
                    {canShowEndTurnButton && (
                      <button
                        onClick={endTurn}
                        style={{
                          padding: isMobile || isMobileLandscape ? `${mobileCssPx(5)}px ${mobileCssPx(10)}px` : '6px 16px',
                          background: 'var(--toe-panel,#180e08)',
                          border: '1.5px solid var(--toe-line,#3a2510)',
                          color: 'var(--toe-muted,#a07838)',
                          fontFamily: "'Cinzel',serif",
                          fontWeight: 700,
                          fontSize: interactionFontSizes.body,
                          borderRadius: 2,
                          cursor: 'pointer',
                          letterSpacing: isMobile ? 0.5 : 1,
                          textTransform: 'uppercase',
                        }}
                      >
                        结束回合
                      </button>
                    )}
                  </>
                );
              })()}
            {showCancelBtn && (
              <button onClick={cancelAction} style={getButtonStyle({ enabled: true })}>
                ✕ 取消
              </button>
            )}
            {phase === 'HUNT_CONFIRM' && !isScriptedTutorial && (!gs._isMP || isVisualPlayerTurn) && !anim && (
              <button onClick={() => huntConfirm(-1)} style={getButtonStyle({ enabled: true })}>
                ✕ 放弃追捕
              </button>
            )}
          </div>
        )}
        {phase === 'DISCARD_PHASE' && !isDiscardPhaseResolving && isLocalCurrentTurn(gs) && !isBlocked && (
          <button
            onClick={confirmDiscard}
            disabled={!(gs.abilityData.discardSelected || []).length}
            style={getButtonStyle({ enabled: !!(gs.abilityData.discardSelected || []).length, tone: 'danger', marginLeft: 'auto' })}
          >
            确认弃牌{(gs.abilityData.discardSelected || []).length > 0 ? ` (${(gs.abilityData.discardSelected || []).length})` : ''}
          </button>
        )}
        {phase === 'BURY_ALIVE_SELECT' && canPlayerRespondWithAnyHandCard() && (
          <button
            onClick={confirmBuryAliveSelection}
            disabled={gs.abilityData?.buryAliveSelectedIndex == null}
            style={getButtonStyle({ enabled: gs.abilityData?.buryAliveSelectedIndex != null, marginLeft: 'auto' })}
          >
            确认活埋
          </button>
        )}
      </div>
      <div data-self-hand-strip style={{ display: 'flex', gap: isMobile || isMobileLandscape ? mobileCssPx(7) : 7, flexWrap: 'wrap' }}>
        {visualMe.hand.map((c, i) => {
          const clickable = isMyCardClickable(c, i);
          const isMobileArmedGod = isMobile && mobileArmedGodCardIdx === i;
          const isBuryAliveSelected =
            phase === 'BURY_ALIVE_SELECT' && canPlayerRespondWithAnyHandCard() && gs.abilityData?.buryAliveSelectedIndex === i;
          const isSel =
            (phase === 'DISCARD_PHASE' && !isBlocked && isLocalCurrentTurn(gs) && (gs.abilityData.discardSelected || []).includes(i)) ||
            isMobileArmedGod ||
            isBuryAliveSelected;
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
          return (
            <div
              key={c.id}
              data-self-hand-card
              data-self-hand-card-id={c.id}
              ref={el => {
                if (el) mobileGodCardRefs.current.set(i, el);
                else mobileGodCardRefs.current.delete(i);
              }}
              className={isBlackGoatPulsing ? 'black-goat-card-pulse' : ''}
              style={{ position: 'relative', display: 'inline-block' }}
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
                frameStyle={isMobile || isMobileLandscape ? { zoom: selfHandCardScale } : undefined}
              />
              {canUpgradeNow && (
                <div
                  style={{
                    position: 'absolute',
                    top: -7,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontFamily: "'Cinzel',serif",
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
                  style={{
                    position: 'absolute',
                    top: -7,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontFamily: "'Cinzel',serif",
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
          <div style={{ fontFamily: "'IM Fell English','Georgia',serif", fontStyle: 'italic', color: '#7a5a2a', fontSize: 13, padding: '22px 10px' }}>
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
