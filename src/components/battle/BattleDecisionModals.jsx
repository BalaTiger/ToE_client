import React from 'react';
import { GOD_DEFS } from '../../constants/card';
import { cardLogText } from '../../game';
import { isAiSeat } from '../../game/rotateState';
import { TUTORIAL_FLOW } from '../../game/tutorialScenario';
import { DDCard } from '../cards';
import {
  NyaBorrowModal,
  TreasureDodgeModal,
  TortoiseOracleModal,
  PeekHandModal,
} from '../modals';
import { DecipherStoneCarvingOverlay } from '../modals/DecipherStoneCarvingOverlay';

export function BattleDecisionModals({
  gs,
  me,
  phase,
  decisionContext,
  canShowTurnDecisionModal,
  decisionError,
  runDecision,
  isLocalNyaBorrowPhase,
  isLocalTortoiseSelectPhase,
  isLocalTreasureDodgePhase,
  isLocalTreasureAoEDodgePhase,
  isLocalSeatIndex,
  isLocalFirstComePicker,
  isLocalSameAbyssTargetPhase,
  isLocalSphinxGuessPhase,
  isMobile,
  visualMe,
  tutorialStep,
  isScriptedTutorial,
  pendingZhuDrawCard,
  pendingZhuGodCard,
  pendingZhuSphinxCard,
  pendingZhuAiDrawCard,
  pendingZhuAnyCard,
  pendingZhuSphinxAnyCard,
  privatePeek,
  scaleRatio,
  dodgeRollButtonRef,
  nyaBorrow,
  nyaSkip,
  handleZhuHideDrawnCard,
  handleZhuHideGodCard,
  handleZhuHideTopCardDuringSphinx,
  handleZhuHideAiDrawCard,
  handleTreasureDodgeRoll,
  handleTreasureDodgeSkip,
  handleTreasureAOEDodgeRoll,
  handleTreasureAOEDodgeSkip,
  resolveTsathogguaSlimeBalance,
  resolveEtherealizeRedirect,
  tortoiseOracleSelect,
  setPrivatePeek,
  firstComePickSelectCard,
  graveDigSelectGod,
  sameAbyssSelect,
  sphinxGuess,
  decipherStoneCarvingConfirm,
}) {
  const pendingZhuCard = pendingZhuDrawCard || pendingZhuGodCard || pendingZhuSphinxCard || pendingZhuAiDrawCard;

  return (
    <>
      {decisionError && canShowTurnDecisionModal && !['DRAW_REVEAL', 'GOD_CHOICE'].includes(phase) && (
        <div role="alert" style={{ position: 'fixed', top: '8vh', left: '50%', transform: 'translateX(-50%)', zIndex: 1200, padding: '8px 14px', border: '1px solid #a64f4f', borderRadius: 3, background: '#2a1111ee', color: '#e8a0a0', fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontSize: 12, letterSpacing: 1, pointerEvents: 'none' }}>
          结算准备失败，请重试。
        </div>
      )}
      {/* NYA borrow modal */}
      {canShowTurnDecisionModal && phase === 'NYA_BORROW' && isLocalNyaBorrowPhase(gs) && (() => {
        const deadOthers = gs.players.filter((p, i) => i > 0 && p.isDead);
        return (<NyaBorrowModal
          deadPlayers={deadOthers}
          godLevel={me.godLevel}
          onBorrow={deadPlayer => runDecision(`nya-borrow:${deadPlayer?.role || 'unknown'}`, () => nyaBorrow(deadPlayer))}
          onSkip={() => runDecision('nya-borrow:skip', nyaSkip)}
        />);
      })()}

      {/* Zhu hide card modal */}
      {canShowTurnDecisionModal && pendingZhuCard && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 520, pointerEvents: 'none' }}>
          <div className="toe-dialog" style={{ padding: '22px 26px', maxWidth: 520, width: '92%', textAlign: 'center', pointerEvents: 'auto' }}>
            <div style={{ fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", color: GOD_DEFS.ZHU.col, fontSize: 16, letterSpacing: 2, marginBottom: 12 }}>── 衔烛照幽 ──</div>
            <div style={{ fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontStyle: 'normal', color: '#d8c078', fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>
              是否将 {cardLogText(pendingZhuCard, { alwaysShowName: true })} 藏到牌堆底？
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="toe-button"
                onClick={() => runDecision(`zhu-hide:${phase}:yes`, () => pendingZhuDrawCard ? handleZhuHideDrawnCard(true) : pendingZhuGodCard ? handleZhuHideGodCard(true) : pendingZhuSphinxCard ? handleZhuHideTopCardDuringSphinx(true) : handleZhuHideAiDrawCard(true))}
                style={{ padding: '8px 18px', fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontSize: 13, cursor: 'pointer' }}
              >藏到牌堆底</button>
              <button className="toe-button"
                onClick={() => runDecision(`zhu-hide:${phase}:no`, () => pendingZhuDrawCard ? handleZhuHideDrawnCard(false) : pendingZhuGodCard ? handleZhuHideGodCard(false) : pendingZhuSphinxCard ? handleZhuHideTopCardDuringSphinx(false) : handleZhuHideAiDrawCard(false))}
                style={{ padding: '8px 18px', fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontSize: 13, cursor: 'pointer' }}
              >不藏牌</button>
            </div>
          </div>
        </div>
      )}

      {/* Zhu hide: waiting for other players */}
      {gs._isMP && pendingZhuAnyCard && visualMe?.godName !== 'ZHU' && (
        <div className="toe-dialog" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',    padding: '18px 22px',  fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontSize: 14, letterSpacing: 1, zIndex: 519, pointerEvents: 'none' }}>
          请等待其他玩家选择…
        </div>
      )}

      {/* Treasure hunter dodge modal */}
      {canShowTurnDecisionModal && phase === 'TREASURE_DODGE_DECISION' && gs.drawReveal && isLocalTreasureDodgePhase(gs) && (
        <TreasureDodgeModal
          drawReveal={gs.drawReveal}
          onRoll={() => runDecision('treasure-dodge:roll', handleTreasureDodgeRoll)}
          onSkip={() => runDecision('treasure-dodge:skip', handleTreasureDodgeSkip)}
          rollButtonRef={dodgeRollButtonRef}
          canSkip={!isScriptedTutorial || tutorialStep !== TUTORIAL_FLOW.TREASURE_DODGE_PROMPT}
          scaleRatio={scaleRatio}
        />
      )}

      {/* Treasure hunter AOE dodge modal */}
      {canShowTurnDecisionModal && phase === 'TREASURE_AOE_DODGE_DECISION' && gs.drawReveal && isLocalTreasureAoEDodgePhase(gs) && (
        <TreasureDodgeModal
          drawReveal={gs.drawReveal}
          onRoll={() => runDecision('treasure-dodge:aoe-roll', handleTreasureAOEDodgeRoll)}
          onSkip={() => runDecision('treasure-dodge:aoe-skip', handleTreasureAOEDodgeSkip)}
          thinkingText={gs._isMP && !isLocalTreasureAoEDodgePhase(gs) ? `其他玩家思考中…` : ''}
          rollButtonRef={dodgeRollButtonRef}
          canSkip={true}
          scaleRatio={scaleRatio}
        />
      )}

      {/* Other players see thinking text during AOE dodge */}
      {phase === 'TREASURE_AOE_DODGE_DECISION' && gs.drawReveal && !isLocalTreasureAoEDodgePhase(gs) && gs._isMP && (
        <div className="toe-dialog" style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          padding: '20px',
          color: '#c8a96e',
          fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)",
          fontSize: '16px',
          zIndex: 1000
        }}>
          其他玩家思考中…
        </div>
      )}

      {/* Tsathoggua slime balance decision */}
      {canShowTurnDecisionModal && phase === 'TSG_SLIME_BALANCE' && gs.abilityData && (isLocalSeatIndex(gs.abilityData?.targetIdx) || gs._isMP) && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 430, pointerEvents: 'none' }}>
          <div className="toe-dialog" style={{ padding: '22px 26px', maxWidth: 540, width: '92%', textAlign: 'center', pointerEvents: 'auto' }}>
            <div style={{ fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", color: '#9ed27f', fontSize: 16, letterSpacing: 2, marginBottom: 12 }}>── 赐福黏液 ──</div>
            <div style={{ fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontStyle: 'normal', color: '#d8c078', fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>
              {isLocalSeatIndex(gs.abilityData?.targetIdx)
                ? `是否牺牲撒托古亚的赐福黏液，将当前 HP/SAN（${gs.abilityData?.afterHp ?? '?'} / ${gs.abilityData?.afterSan ?? '?'}）平分？`
                : `等待 ${gs.players[gs.abilityData?.targetIdx]?.name || '目标'} 选择是否牺牲黏液…`}
            </div>
            {isLocalSeatIndex(gs.abilityData?.targetIdx) ? (
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="toe-button toe-button-primary" onClick={() => runDecision('tsg-slime:yes', () => resolveTsathogguaSlimeBalance(true))} style={{ padding: '8px 18px', fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontSize: 13, cursor: 'pointer' }}>牺牲黏液</button>
                <button className="toe-button" onClick={() => runDecision('tsg-slime:no', () => resolveTsathogguaSlimeBalance(false))} style={{ padding: '8px 18px', fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontSize: 13, cursor: 'pointer' }}>保留黏液</button>
              </div>
            ) : (
              <div style={{ fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontSize: 12, color: '#a07838', letterSpacing: 1 }}>
                请等待其他玩家选择…
              </div>
            )}
          </div>
        </div>
      )}

      {/* Etherealize decision —— AI 的决策弹窗不对玩家展示 */}
      {canShowTurnDecisionModal && phase === 'ETHEREALIZE_DECISION' && gs.abilityData && (isLocalSeatIndex(gs.abilityData?.targetIdx) || (gs._isMP && !isAiSeat(gs, gs.abilityData?.targetIdx))) && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 430, pointerEvents: 'none' }}>
          <div className="toe-dialog" style={{ padding: '22px 26px', maxWidth: 540, width: '92%', textAlign: 'center', pointerEvents: 'auto' }}>
            <div style={{ fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", color: '#b9d8f0', fontSize: 16, letterSpacing: 2, marginBottom: 12 }}>── 半物质化 ──</div>
            <div style={{ fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontStyle: 'normal', color: '#d8c078', fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>
              {isLocalSeatIndex(gs.abilityData?.targetIdx)
                ? (gs.abilityData?.viaEtherealizeFrom != null
                  ? `${gs.players[gs.abilityData.viaEtherealizeFrom]?.name || '有角色'} 通过虚化将即将失去的 ${gs.abilityData?.lostHp || 0} HP / ${gs.abilityData?.lostSan || 0} SAN 转移给了你！是否消耗1层虚化，将其继续转移？`
                  : `是否消耗1层虚化，转移即将失去的 ${gs.abilityData?.lostHp || 0} HP / ${gs.abilityData?.lostSan || 0} SAN？`)
                : `等待 ${gs.players[gs.abilityData?.targetIdx]?.name || '目标'} 选择是否消耗虚化…`}
            </div>
            {isLocalSeatIndex(gs.abilityData?.targetIdx) ? (
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="toe-button toe-button-primary" onClick={() => runDecision('etherealize:yes', () => resolveEtherealizeRedirect(true))} style={{ padding: '8px 18px', fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontSize: 13, cursor: 'pointer' }}>消耗虚化并转移</button>
                <button className="toe-button" onClick={() => runDecision('etherealize:no', () => resolveEtherealizeRedirect(false))} style={{ padding: '8px 18px', fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontSize: 13, cursor: 'pointer' }}>承受损失</button>
              </div>
            ) : (
              <div style={{ fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontSize: 12, color: '#a07838', letterSpacing: 1 }}>
                请等待其他玩家选择…
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tortoise oracle select */}
      {canShowTurnDecisionModal && phase === 'TORTOISE_ORACLE_SELECT' && gs.abilityData && (
        <TortoiseOracleModal
          abilityData={gs.abilityData}
          onSelect={key => runDecision(`tortoise-oracle:${key}`, () => tortoiseOracleSelect(key))}
          canPick={isLocalTortoiseSelectPhase(gs) && decisionContext?.presentation === 'interactive'}
          expansionKey={gs.expansionKey}
        />
      )}

      {/* Private peek */}
      {privatePeek && (
        <PeekHandModal
          card={privatePeek.card}
          targetName={privatePeek.targetName}
          onClose={() => setPrivatePeek(null)}
        />
      )}

      {/* First come pick select */}
      {canShowTurnDecisionModal && phase === 'FIRST_COME_PICK_SELECT' && gs.abilityData && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: isMobile ? '7vh' : '5vh', zIndex: 400, pointerEvents: 'none' }}>
          <div className="toe-dialog" style={{ padding: '20px 24px', maxWidth: 720, width: '92%', textAlign: 'center', pointerEvents: 'auto' }}>
            <div style={{ fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", color: '#e6c577', fontSize: 16, letterSpacing: 2, marginBottom: 10 }}>── 先到先得 ──</div>
            <div style={{ fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontStyle: 'normal', color: '#b09090', fontSize: 14, marginBottom: 18, lineHeight: 1.5 }}>
              {gs.players[gs.abilityData?.pickOrder?.[gs.abilityData?.pickIndex || 0]]?.name || '当前角色'} 选择一张翻开的牌收入手牌
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
              {(gs.abilityData?.revealedCards || []).map((card, index) => {
                const pickerIdx = gs.abilityData?.pickOrder?.[gs.abilityData?.pickIndex || 0];
                const canPick = isLocalFirstComePicker(gs);
                return (
                  <DDCard
                    key={card.id ?? `${card.key}-${index}`}
                    card={card}
                    compact={isMobile}
                    onClick={canPick ? () => runDecision(`first-come:${index}`, () => firstComePickSelectCard(index)) : undefined}
                    disabled={!canPick}
                    highlight={canPick}
                    holderId={pickerIdx}
                  />
                );
              })}
            </div>
            {!isLocalFirstComePicker(gs) && (
              <div style={{ fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontSize: 12, color: '#a07838', letterSpacing: 1 }}>
                其他角色选择中…
              </div>
            )}
          </div>
        </div>
      )}

      {/* Grave dig select */}
      {canShowTurnDecisionModal && phase === 'GRAVE_DIG_SELECT' && gs.abilityData && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: isMobile ? '7vh' : '5vh', zIndex: 400, pointerEvents: 'none' }}>
          <div className="toe-dialog" style={{ padding: '20px 24px', maxWidth: 720, width: '92%', textAlign: 'center', pointerEvents: 'auto' }}>
            <div style={{ fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", color: '#e6c577', fontSize: 16, letterSpacing: 2, marginBottom: 10 }}>── 掘墓 ──</div>
            <div style={{ fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontStyle: 'normal', color: '#b09090', fontSize: 14, marginBottom: 18, lineHeight: 1.5 }}>
              从弃牌堆中选择一张邪神牌放入你的手牌
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
              {(gs.abilityData?.godCards || []).map((card, index) => {
                const canPick = isLocalSeatIndex(gs.abilityData?.playerIndex);
                return (
                  <DDCard
                    key={card.id ?? `${card.godKey}-${index}`}
                    card={card}
                    compact={isMobile}
                    onClick={canPick ? () => runDecision(`grave-dig:${index}`, () => graveDigSelectGod(index)) : undefined}
                    disabled={!canPick}
                    highlight={canPick}
                    holderId={gs.abilityData?.playerIndex}
                  />
                );
              })}
            </div>
            {!isLocalSeatIndex(gs.abilityData?.playerIndex) && (
              <div style={{ fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontSize: 12, color: '#a07838', letterSpacing: 1 }}>
                等待 {gs.players[gs.abilityData?.playerIndex]?.name || '目标'} 做出选择…
              </div>
            )}
          </div>
        </div>
      )}

      {/* Same abyss select */}
      {canShowTurnDecisionModal && phase === 'SAME_ABYSS_SELECT' && gs.abilityData && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: isMobile ? '7vh' : '5vh', zIndex: 400, pointerEvents: 'none' }}>
          <div className="toe-dialog" style={{ padding: '20px 24px', maxWidth: 560, width: '92%', textAlign: 'center', pointerEvents: 'auto' }}>
            <div style={{ fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", color: '#e6c577', fontSize: 16, letterSpacing: 2, marginBottom: 10 }}>── 同归深渊 ──</div>
            <div style={{ fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontStyle: 'normal', color: '#b09090', fontSize: 14, marginBottom: 18, lineHeight: 1.5 }}>
              你手牌最多（{gs.abilityData?.targetHandCount ?? gs.players[gs.abilityData?.targetIdx]?.hand?.length ?? 0} 张）。将手牌弃至与 {gs.players[gs.abilityData?.actorIdx ?? gs.currentTurn]?.name || '对方'} 数量相等（{gs.abilityData?.actorHandCount || 0} 张），或者失去 4 HP。
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {isLocalSameAbyssTargetPhase(gs) ? (
                <>
                  <button className="toe-button" onClick={() => runDecision('same-abyss:discard', () => sameAbyssSelect('discard'))} style={{ padding: '8px 16px', fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontSize: 13, cursor: 'pointer' }}>
                    {(gs.abilityData?.discardCount || 0) > 0 ? '弃置手牌至' : '不弃牌，保持'} {gs.abilityData?.actorHandCount || 0} 张
                  </button>
                  <button className="toe-button toe-button-danger" onClick={() => runDecision('same-abyss:hp', () => sameAbyssSelect('hp'))} style={{ padding: '8px 16px', fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontSize: 13, cursor: 'pointer' }}>
                    失去 4 HP
                  </button>
                </>
              ) : (
                <div style={{ fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontSize: 12, color: '#a07838', letterSpacing: 1 }}>
                  等待 {gs.players[gs.abilityData?.targetIdx]?.name || '目标'} 做出选择…
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sphinx guess */}
      {!pendingZhuSphinxAnyCard && canShowTurnDecisionModal && phase === 'SPHINX_GUESS' && gs.abilityData && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: isMobile ? '7vh' : '5vh', zIndex: 400, pointerEvents: 'none' }}>
          <div className="toe-dialog" style={{ padding: '20px 24px', maxWidth: 560, width: '92%', textAlign: 'center', pointerEvents: 'auto' }}>
            <div style={{ fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", color: '#e6c577', fontSize: 16, letterSpacing: 2, marginBottom: 10 }}>── 斯芬克斯 ──</div>
            <div style={{ fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontStyle: 'normal', color: '#b09090', fontSize: 14, marginBottom: 18, lineHeight: 1.5 }}>
              猜测牌堆顶的牌是否是区域牌。若猜对，收入这张牌；若猜错，失去 3 HP。
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {isLocalSphinxGuessPhase(gs) ? (
                <>
                  <button className="toe-button" onClick={() => runDecision('sphinx:true', () => sphinxGuess(true))} style={{ padding: '8px 16px', fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontSize: 13, cursor: 'pointer' }}>
                    是区域牌
                  </button>
                  <button className="toe-button" onClick={() => runDecision('sphinx:false', () => sphinxGuess(false))} style={{ padding: '8px 16px', fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontSize: 13, cursor: 'pointer' }}>
                    不是区域牌
                  </button>
                </>
              ) : (
                <div style={{ fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontSize: 12, color: '#a07838', letterSpacing: 1 }}>
                  等待 {gs.players[gs.currentTurn]?.name || '对方'} 做出猜测…
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Decipher stone carving */}
      {canShowTurnDecisionModal && phase === 'DECIPHER_STONE_CARVING' && gs.abilityData && (
        <DecipherStoneCarvingOverlay
          key={(gs.abilityData?.revealedCards || []).map(card => card?.id).join('|')}
          revealedCards={gs.abilityData?.revealedCards || []}
          actorName={isLocalSeatIndex(gs.abilityData?.playerIndex) ? '你' : (gs.players?.[gs.abilityData?.playerIndex]?.name || '该玩家')}
          readOnly={!isLocalSeatIndex(gs.abilityData?.playerIndex)}
          expansionKey={gs.expansionKey}
          onConfirm={payload => runDecision('decipher-stone', () => decipherStoneCarvingConfirm(payload))}
        />
      )}
    </>
  );
}
