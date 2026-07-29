import React from 'react';
import { GOD_DEFS } from '../../constants/card';
import { cardLogText } from '../../game';
import { isAiSeat } from '../../game/rotateState';
import { TUTORIAL_FLOW } from '../../game/tutorialScenario';
import { DDCard } from '../cards';
import {
  GodChoiceModal,
  NyaBorrowModal,
  DrawRevealModal,
  TreasureDodgeModal,
  TortoiseOracleModal,
  PeekHandModal,
} from '../modals';
import { DecipherStoneCarvingOverlay } from '../modals/DecipherStoneCarvingOverlay';

export function BattleDecisionModals({
  gs,
  me,
  phase,
  myTurn,
  suppressAnim,
  canShowTurnDecisionModal,
  isLocalGodChoice,
  isLocalDrawDecision,
  isLocalNyaBorrowPhase,
  isLocalTreasureDodgePhase,
  isLocalTreasureAoEDodgePhase,
  isLocalSeatIndex,
  isLocalFirstComePicker,
  isLocalSameAbyssTargetPhase,
  isLocalSphinxGuessPhase,
  isMobile,
  visualMe,
  showTutorial,
  tutorialStep,
  isTutorialActionAllowed,
  isTutorialDrawKeepStep,
  isScriptedTutorial,
  pendingZhuDrawCard,
  pendingZhuGodCard,
  pendingZhuSphinxCard,
  pendingZhuAiDrawCard,
  pendingZhuAnyCard,
  pendingZhuDrawAnyCard,
  pendingZhuGodAnyCard,
  pendingZhuSphinxAnyCard,
  privatePeek,
  scaleRatio,
  drawRevealKeepButtonRef,
  godKeepHandButtonRef,
  dodgeRollButtonRef,
  godResolvePlayer,
  nyaBorrow,
  nyaSkip,
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
      {/* God choice modal */}
      {!pendingZhuGodAnyCard && canShowTurnDecisionModal && phase === 'GOD_CHOICE' && gs.abilityData?.godCard && (isLocalGodChoice || gs._isMP) && (() => {
        const godCard = gs.abilityData.godCard;
        const actorIdx = gs.abilityData?.drawerIdx ?? gs.currentTurn ?? 0;
        const actor = gs.players[actorIdx] || me;
        const canChooseGod = isLocalGodChoice && actorIdx === 0;
        const gk = godCard.godKey;
        const alreadyWorship = actor.godName === gk;
        const isConvert = !!(actor.godName && actor.godName !== gk);
        const forcedConvert = gs.abilityData?.forcedConvert || false;
        const canUpgrade = alreadyWorship && (actor.godLevel || 0) < 3;
        const thinkingText = gs._isMP && !canChooseGod ? `${actor.name || '对方'}正在回应邪神…` : '';
        const lockTutorialGodKeep = showTutorial && tutorialStep === TUTORIAL_FLOW.CULTIST_GOD_KEEP_HAND;
        return (
          <GodChoiceModal
            godCard={godCard} player={actor}
            isConvert={isConvert} forcedConvert={forcedConvert}
            canChoose={canChooseGod}
            thinkingText={thinkingText}
            allowWorship={!lockTutorialGodKeep}
            allowKeepHand={!lockTutorialGodKeep || isTutorialActionAllowed({ type: 'godKeepHand' })}
            allowDiscard={!lockTutorialGodKeep}
            onWorship={() => godResolvePlayer(alreadyWorship && canUpgrade ? 'upgrade' : isConvert ? 'worship' : 'worship')}
            onKeepHand={() => godResolvePlayer('keepHand')}
            onDiscard={() => godResolvePlayer('discard')}
            keepButtonRef={godKeepHandButtonRef}
            scaleRatio={scaleRatio}
          />
        );
      })()}

      {/* NYA borrow modal */}
      {phase === 'NYA_BORROW' && isLocalNyaBorrowPhase(gs) && (() => {
        const deadOthers = gs.players.filter((p, i) => i > 0 && p.isDead);
        return (<NyaBorrowModal deadPlayers={deadOthers} godLevel={me.godLevel} onBorrow={nyaBorrow} onSkip={nyaSkip} />);
      })()}

      {/* Zhu hide card modal */}
      {!suppressAnim && canShowTurnDecisionModal && pendingZhuCard && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 520, pointerEvents: 'none' }}>
          <div style={{ background: '#130f07f2', border: `2px solid ${GOD_DEFS.ZHU.col}`, boxShadow: `0 0 60px ${GOD_DEFS.ZHU.col}44,0 0 120px #000c`, borderRadius: 4, padding: '22px 26px', maxWidth: 520, width: '92%', textAlign: 'center', pointerEvents: 'auto' }}>
            <div style={{ fontFamily: "'Cinzel',serif", color: GOD_DEFS.ZHU.col, fontSize: 16, letterSpacing: 2, marginBottom: 12 }}>── 衔烛照幽 ──</div>
            <div style={{ fontFamily: "'IM Fell English','Georgia',serif", fontStyle: 'italic', color: '#d8c078', fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>
              是否将 {cardLogText(pendingZhuCard, { alwaysShowName: true })} 藏到牌堆底？
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => pendingZhuDrawCard ? handleZhuHideDrawnCard(true) : pendingZhuGodCard ? handleZhuHideGodCard(true) : pendingZhuSphinxCard ? handleZhuHideTopCardDuringSphinx(true) : handleZhuHideAiDrawCard(true)}
                style={{ padding: '8px 18px', background: '#1b1408', border: `1.5px solid ${GOD_DEFS.ZHU.col}`, color: '#f2df8a', fontFamily: "'Cinzel',serif", fontSize: 13, cursor: 'pointer', borderRadius: 3 }}
              >是</button>
              <button
                onClick={() => pendingZhuDrawCard ? handleZhuHideDrawnCard(false) : pendingZhuGodCard ? handleZhuHideGodCard(false) : pendingZhuSphinxCard ? handleZhuHideTopCardDuringSphinx(false) : handleZhuHideAiDrawCard(false)}
                style={{ padding: '8px 18px', background: '#100c08', border: '1.5px solid #6a5430', color: '#c8a96e', fontFamily: "'Cinzel',serif", fontSize: 13, cursor: 'pointer', borderRadius: 3 }}
              >否</button>
            </div>
          </div>
        </div>
      )}

      {/* Zhu hide: waiting for other players */}
      {!suppressAnim && gs._isMP && pendingZhuAnyCard && visualMe?.godName !== 'ZHU' && (
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(0,0,0,0.82)', border: '1.5px solid #6a5430', borderRadius: 4, padding: '18px 22px', color: '#c8a96e', fontFamily: "'Cinzel',serif", fontSize: 14, letterSpacing: 1, zIndex: 519, pointerEvents: 'none' }}>
          请等待其他玩家选择…
        </div>
      )}

      {/* Draw reveal modal */}
      {!pendingZhuDrawAnyCard && !suppressAnim && canShowTurnDecisionModal && phase === 'DRAW_REVEAL' && gs.drawReveal && gs.drawReveal.needsDecision && (
        <DrawRevealModal
          drawReveal={gs.drawReveal}
          onKeep={handleDrawKeepFromModal}
          onDiscard={handleDrawDiscardFromModal}
          canChoose={isLocalDrawDecision}
          thinkingText={gs._isMP && !isLocalDrawDecision ? `${gs.drawReveal.drawerName || gs.players[gs.currentTurn]?.name || '对方'}正在思考…` : ''}
          canKeep={!isTutorialDrawKeepStep || isTutorialActionAllowed({ type: 'drawKeep' })}
          canDiscard={!isTutorialDrawKeepStep}
          keepButtonRef={drawRevealKeepButtonRef}
          scaleRatio={scaleRatio}
        />
      )}

      {/* Treasure hunter dodge modal */}
      {!suppressAnim && phase === 'TREASURE_DODGE_DECISION' && gs.drawReveal && isLocalTreasureDodgePhase(gs) && (
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
      {!suppressAnim && phase === 'TREASURE_AOE_DODGE_DECISION' && gs.drawReveal && isLocalTreasureAoEDodgePhase(gs) && (
        <TreasureDodgeModal
          drawReveal={gs.drawReveal}
          onRoll={handleTreasureAOEDodgeRoll}
          onSkip={handleTreasureAOEDodgeSkip}
          thinkingText={gs._isMP && !isLocalTreasureAoEDodgePhase(gs) ? `其他玩家思考中…` : ''}
          rollButtonRef={dodgeRollButtonRef}
          canSkip={true}
          scaleRatio={scaleRatio}
        />
      )}

      {/* Other players see thinking text during AOE dodge */}
      {!suppressAnim && phase === 'TREASURE_AOE_DODGE_DECISION' && gs.drawReveal && !isLocalTreasureAoEDodgePhase(gs) && gs._isMP && (
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

      {/* Tsathoggua slime balance decision */}
      {!suppressAnim && canShowTurnDecisionModal && phase === 'TSG_SLIME_BALANCE' && gs.abilityData && (isLocalSeatIndex(gs.abilityData?.targetIdx) || gs._isMP) && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 430, pointerEvents: 'none' }}>
          <div style={{ background: '#101608f2', border: '2px solid #5f8f4a', boxShadow: '0 0 60px #5f8f4a33, 0 0 120px #000c', borderRadius: 4, padding: '22px 26px', maxWidth: 540, width: '92%', textAlign: 'center', pointerEvents: 'auto' }}>
            <div style={{ fontFamily: "'Cinzel',serif", color: '#9ed27f', fontSize: 16, letterSpacing: 2, marginBottom: 12 }}>── 赐福黏液 ──</div>
            <div style={{ fontFamily: "'IM Fell English','Georgia',serif", fontStyle: 'italic', color: '#d8c078', fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>
              {isLocalSeatIndex(gs.abilityData?.targetIdx)
                ? `是否牺牲撒托古亚的赐福黏液，将当前 HP/SAN（${gs.abilityData?.afterHp ?? '?'} / ${gs.abilityData?.afterSan ?? '?'}）平分？`
                : `等待 ${gs.players[gs.abilityData?.targetIdx]?.name || '目标'} 选择是否牺牲黏液…`}
            </div>
            {isLocalSeatIndex(gs.abilityData?.targetIdx) ? (
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => resolveTsathogguaSlimeBalance(true)} style={{ padding: '8px 18px', background: '#17220e', border: '1.5px solid #5f8f4a', color: '#d8f0bd', fontFamily: "'Cinzel',serif", fontSize: 13, cursor: 'pointer', borderRadius: 3 }}>是</button>
                <button onClick={() => resolveTsathogguaSlimeBalance(false)} style={{ padding: '8px 18px', background: '#100c08', border: '1.5px solid #6a5430', color: '#c8a96e', fontFamily: "'Cinzel',serif", fontSize: 13, cursor: 'pointer', borderRadius: 3 }}>否</button>
              </div>
            ) : (
              <div style={{ fontFamily: "'Cinzel',serif", fontSize: 12, color: '#a07838', letterSpacing: 1 }}>
                请等待其他玩家选择…
              </div>
            )}
          </div>
        </div>
      )}

      {/* Etherealize decision —— AI 的决策弹窗不对玩家展示 */}
      {!suppressAnim && canShowTurnDecisionModal && phase === 'ETHEREALIZE_DECISION' && gs.abilityData && (isLocalSeatIndex(gs.abilityData?.targetIdx) || (gs._isMP && !isAiSeat(gs, gs.abilityData?.targetIdx))) && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 430, pointerEvents: 'none' }}>
          <div style={{ background: '#0c1118f2', border: '2px solid #87a9c8', boxShadow: '0 0 60px #87a9c833, 0 0 120px #000c', borderRadius: 4, padding: '22px 26px', maxWidth: 540, width: '92%', textAlign: 'center', pointerEvents: 'auto' }}>
            <div style={{ fontFamily: "'Cinzel',serif", color: '#b9d8f0', fontSize: 16, letterSpacing: 2, marginBottom: 12 }}>── 半物质化 ──</div>
            <div style={{ fontFamily: "'IM Fell English','Georgia',serif", fontStyle: 'italic', color: '#d8c078', fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>
              {isLocalSeatIndex(gs.abilityData?.targetIdx)
                ? (gs.abilityData?.viaEtherealizeFrom != null
                  ? `${gs.players[gs.abilityData.viaEtherealizeFrom]?.name || '有角色'} 通过虚化将即将失去的 ${gs.abilityData?.lostHp || 0} HP / ${gs.abilityData?.lostSan || 0} SAN 转移给了你！是否消耗1层虚化，将其继续转移？`
                  : `是否消耗1层虚化，转移即将失去的 ${gs.abilityData?.lostHp || 0} HP / ${gs.abilityData?.lostSan || 0} SAN？`)
                : `等待 ${gs.players[gs.abilityData?.targetIdx]?.name || '目标'} 选择是否消耗虚化…`}
            </div>
            {isLocalSeatIndex(gs.abilityData?.targetIdx) ? (
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => resolveEtherealizeRedirect(true)} style={{ padding: '8px 18px', background: '#101a22', border: '1.5px solid #87a9c8', color: '#d9efff', fontFamily: "'Cinzel',serif", fontSize: 13, cursor: 'pointer', borderRadius: 3 }}>是</button>
                <button onClick={() => resolveEtherealizeRedirect(false)} style={{ padding: '8px 18px', background: '#100c08', border: '1.5px solid #6a5430', color: '#c8a96e', fontFamily: "'Cinzel',serif", fontSize: 13, cursor: 'pointer', borderRadius: 3 }}>否</button>
              </div>
            ) : (
              <div style={{ fontFamily: "'Cinzel',serif", fontSize: 12, color: '#a07838', letterSpacing: 1 }}>
                请等待其他玩家选择…
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tortoise oracle select */}
      {!suppressAnim && phase === 'TORTOISE_ORACLE_SELECT' && gs.abilityData && (
        <TortoiseOracleModal abilityData={gs.abilityData} onSelect={tortoiseOracleSelect} myTurn={myTurn} expansionKey={gs.expansionKey} />
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
      {!suppressAnim && canShowTurnDecisionModal && phase === 'FIRST_COME_PICK_SELECT' && gs.abilityData && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: isMobile ? '7vh' : '5vh', zIndex: 400, pointerEvents: 'none' }}>
          <div style={{ background: '#150e07ee', border: '2px solid #d7b46a', boxShadow: '0 0 60px #d7b46a33, 0 0 120px #000a', borderRadius: 4, padding: '20px 24px', maxWidth: 720, width: '92%', textAlign: 'center', pointerEvents: 'auto' }}>
            <div style={{ fontFamily: "'Cinzel',serif", color: '#e6c577', fontSize: 16, letterSpacing: 2, marginBottom: 10 }}>── 先到先得 ──</div>
            <div style={{ fontFamily: "'IM Fell English','Georgia',serif", fontStyle: 'italic', color: '#b09090', fontSize: 14, marginBottom: 18, lineHeight: 1.5 }}>
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
                    onClick={canPick ? () => firstComePickSelectCard(index) : undefined}
                    disabled={!canPick}
                    highlight={canPick}
                    holderId={pickerIdx}
                  />
                );
              })}
            </div>
            {!isLocalFirstComePicker(gs) && (
              <div style={{ fontFamily: "'Cinzel',serif", fontSize: 12, color: '#a07838', letterSpacing: 1 }}>
                其他角色选择中…
              </div>
            )}
          </div>
        </div>
      )}

      {/* Grave dig select */}
      {!suppressAnim && canShowTurnDecisionModal && phase === 'GRAVE_DIG_SELECT' && gs.abilityData && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: isMobile ? '7vh' : '5vh', zIndex: 400, pointerEvents: 'none' }}>
          <div style={{ background: '#150e07ee', border: '2px solid #d7b46a', boxShadow: '0 0 60px #d7b46a33, 0 0 120px #000a', borderRadius: 4, padding: '20px 24px', maxWidth: 720, width: '92%', textAlign: 'center', pointerEvents: 'auto' }}>
            <div style={{ fontFamily: "'Cinzel',serif", color: '#e6c577', fontSize: 16, letterSpacing: 2, marginBottom: 10 }}>── 掘墓 ──</div>
            <div style={{ fontFamily: "'IM Fell English','Georgia',serif", fontStyle: 'italic', color: '#b09090', fontSize: 14, marginBottom: 18, lineHeight: 1.5 }}>
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
                    onClick={canPick ? () => graveDigSelectGod(index) : undefined}
                    disabled={!canPick}
                    highlight={canPick}
                    holderId={gs.abilityData?.playerIndex}
                  />
                );
              })}
            </div>
            {!isLocalSeatIndex(gs.abilityData?.playerIndex) && (
              <div style={{ fontFamily: "'Cinzel',serif", fontSize: 12, color: '#a07838', letterSpacing: 1 }}>
                等待 {gs.players[gs.abilityData?.playerIndex]?.name || '目标'} 做出选择…
              </div>
            )}
          </div>
        </div>
      )}

      {/* Same abyss select */}
      {!suppressAnim && phase === 'SAME_ABYSS_SELECT' && gs.abilityData && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: isMobile ? '7vh' : '5vh', zIndex: 400, pointerEvents: 'none' }}>
          <div style={{ background: '#150e07ee', border: '2px solid #d7b46a', boxShadow: '0 0 60px #d7b46a33, 0 0 120px #000a', borderRadius: 4, padding: '20px 24px', maxWidth: 560, width: '92%', textAlign: 'center', pointerEvents: 'auto' }}>
            <div style={{ fontFamily: "'Cinzel',serif", color: '#e6c577', fontSize: 16, letterSpacing: 2, marginBottom: 10 }}>── 同归深渊 ──</div>
            <div style={{ fontFamily: "'IM Fell English','Georgia',serif", fontStyle: 'italic', color: '#b09090', fontSize: 14, marginBottom: 18, lineHeight: 1.5 }}>
              你手牌最多（{gs.abilityData?.targetHandCount ?? gs.players[gs.abilityData?.targetIdx]?.hand?.length ?? 0} 张）。将手牌弃至与 {gs.players[gs.abilityData?.actorIdx ?? gs.currentTurn]?.name || '对方'} 数量相等（{gs.abilityData?.actorHandCount || 0} 张），或者失去 4 HP。
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {isLocalSameAbyssTargetPhase(gs) ? (
                <>
                  <button onClick={() => sameAbyssSelect('discard')} style={{ padding: '8px 16px', background: '#1a1008', border: '1.5px solid #8a6a3a', color: '#c8a96e', fontFamily: "'Cinzel',serif", fontSize: 13, cursor: 'pointer', borderRadius: 3 }}>
                    {(gs.abilityData?.discardCount || 0) > 0 ? '弃置手牌至' : '不弃牌，保持'} {gs.abilityData?.actorHandCount || 0} 张
                  </button>
                  <button onClick={() => sameAbyssSelect('hp')} style={{ padding: '8px 16px', background: '#1a1008', border: '1.5px solid #8a3a3a', color: '#c87878', fontFamily: "'Cinzel',serif", fontSize: 13, cursor: 'pointer', borderRadius: 3 }}>
                    失去 4 HP
                  </button>
                </>
              ) : (
                <div style={{ fontFamily: "'Cinzel',serif", fontSize: 12, color: '#a07838', letterSpacing: 1 }}>
                  等待 {gs.players[gs.abilityData?.targetIdx]?.name || '目标'} 做出选择…
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sphinx guess */}
      {!pendingZhuSphinxAnyCard && !suppressAnim && phase === 'SPHINX_GUESS' && gs.abilityData && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: isMobile ? '7vh' : '5vh', zIndex: 400, pointerEvents: 'none' }}>
          <div style={{ background: '#150e07ee', border: '2px solid #d7b46a', boxShadow: '0 0 60px #d7b46a33, 0 0 120px #000a', borderRadius: 4, padding: '20px 24px', maxWidth: 560, width: '92%', textAlign: 'center', pointerEvents: 'auto' }}>
            <div style={{ fontFamily: "'Cinzel',serif", color: '#e6c577', fontSize: 16, letterSpacing: 2, marginBottom: 10 }}>── 斯芬克斯 ──</div>
            <div style={{ fontFamily: "'IM Fell English','Georgia',serif", fontStyle: 'italic', color: '#b09090', fontSize: 14, marginBottom: 18, lineHeight: 1.5 }}>
              猜测牌堆顶的牌是否是区域牌。若猜对，收入这张牌；若猜错，失去 3 HP。
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              {isLocalSphinxGuessPhase(gs) ? (
                <>
                  <button onClick={() => sphinxGuess(true)} style={{ padding: '8px 16px', background: '#1a1008', border: '1.5px solid #8a6a3a', color: '#c8a96e', fontFamily: "'Cinzel',serif", fontSize: 13, cursor: 'pointer', borderRadius: 3 }}>
                    是区域牌
                  </button>
                  <button onClick={() => sphinxGuess(false)} style={{ padding: '8px 16px', background: '#1a1008', border: '1.5px solid #8a6a3a', color: '#c8a96e', fontFamily: "'Cinzel',serif", fontSize: 13, cursor: 'pointer', borderRadius: 3 }}>
                    不是区域牌
                  </button>
                </>
              ) : (
                <div style={{ fontFamily: "'Cinzel',serif", fontSize: 12, color: '#a07838', letterSpacing: 1 }}>
                  等待 {gs.players[gs.currentTurn]?.name || '对方'} 做出猜测…
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Decipher stone carving */}
      {!suppressAnim && phase === 'DECIPHER_STONE_CARVING' && gs.abilityData && (
        <DecipherStoneCarvingOverlay
          key={(gs.abilityData?.revealedCards || []).map(card => card?.id).join('|')}
          revealedCards={gs.abilityData?.revealedCards || []}
          actorName={isLocalSeatIndex(gs.abilityData?.playerIndex) ? '你' : (gs.players?.[gs.abilityData?.playerIndex]?.name || '该玩家')}
          readOnly={!isLocalSeatIndex(gs.abilityData?.playerIndex)}
          expansionKey={gs.expansionKey}
          onConfirm={decipherStoneCarvingConfirm}
        />
      )}
    </>
  );
}
