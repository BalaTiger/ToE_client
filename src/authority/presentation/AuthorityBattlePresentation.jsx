import { useEffect, useMemo, useRef, useState } from 'react';
import { BattleScreen } from '../../components/battle/BattleScreen';
import { GameResultScreen } from '../../components/result/GameResultScreen';
import { FullLogModal, PeekHandModal } from '../../components/modals';
import { AnimOverlay } from '../../components/anim/AnimOverlay';
import { GodResurrectionAnim, TreasureMapAnim, RoleRevealAnim } from '../../components/anim/WinAnims';
import { KnifeEffect, GuillotineAnim, PetrifyAnim } from '../../components/anim/DamageEffects';
import { SanMistOverlay, SwapCupOverlay, HuntScopeOverlay, BewitchEyeOverlay } from '../../components/anim/SkillOverlays';
import { CardTransferOverlay, HuntRevealedCardBadge } from '../../components/anim/MoveOverlays';
import { GLOBAL_STYLES } from '../../components/GlobalStyles';
import { GameLayerPortal } from '../../ui/GameLayerPortal';
import { useBattleResponsiveLayout } from '../../hooks/useBattleResponsiveLayout';
import { getBattleBackgroundStyle } from './battleBackground';
import { RINFO } from '../../game/setup';
import { createAuthorityPresentation } from './model';
import { AUTHORITY_PRESENTATION_COMMANDS, createAuthorityCommandDispatcher } from './commands';
import { useAuthorityPresentation } from '../useAuthorityPresentation';
import { useAuthorityEmoji } from '../useAuthorityEmoji';
import { FlyingEmoji } from '../../components/ui/FlyingEmoji';
import { AuthorityDecisionLayer } from './AuthorityDecisionLayer';
import { ACTION_LABELS } from './actionLabels';
import { AuthorityTutorialOverlay } from '../tutorial/AuthorityTutorialOverlay';
import { useAuthoritySoftGuides } from '../tutorial/useAuthoritySoftGuides';
import { useFreshRoleReveal } from '../useFreshRoleReveal';
import { useTerminalPresentation } from './useTerminalPresentation';

const OWN_CARD_ACTIONS = ['turn.discard', 'bury.commit', 'torch.discard', 'caveDuel.commit', 'hunt.reveal', 'hunt.attack', 'swap.give', 'bewitch.chooseCard', 'albino.reveal', 'god.useHand'];
const UNKNOWN_ROLE = { icon: '?', col: '#a69f91', dim: '#625b50', goal: '身份尚未公开', skillName: '身份技能' };
const PHASE_LABELS = { ACTION: '行动', DRAW_REVEAL: '探索抉择', GOD_CHOICE: '邪神馈赠', CAVE_DUEL_SELECT_CARD: '洞穴对决 · 秘密选牌',
  BURY_ALIVE_SELECT: '活埋 · 秘密选牌', SWAP_GIVE_CARD: '掉包 · 归还手牌', HUNT_WAIT_REVEAL: '追捕 · 等待亮牌',
  HUNT_CONFIRM: '追捕 · 选择匹配手牌', DISCARD_PHASE: '手牌超限 · 请选择弃牌', DECIPHER_STONE_CARVING: '解读石刻',
  SWAP_SELECT_TARGET: '掉包 · 选择目标', SWAP_SELECT_TARGET_CARD: '掉包 · 抽取手牌', SWAP_STEAL_CARD: '掉包 · 暗抽手牌',
  HUNT_SELECT_TARGET: '追捕 · 选择目标', HUNT_SELECT_CARD_FROM_PUBLIC: '追捕 · 选择战利品',
  BEWITCH_SELECT_CARD: '蛊惑 · 选择赠送手牌', BEWITCH_SELECT_TARGET: '蛊惑 · 选择目标', MULTIPLY_SELECT_TARGET: '增殖 · 选择目标',
  CAVE_DUEL_SELECT_TARGET: '洞穴对决 · 选择对手', PEEK_HAND_SELECT_TARGET: '血之窥探 · 选择目标',
  SHU_SELECT_TARGET: '黑暗丰穰 · 选择目标', ZONE_SWAP_SELECT_TARGET: '手牌交换 · 选择目标',
  DAMAGE_LINK_SELECT_TARGET: '痛苦一同 · 选择目标', ROSE_THORN_SELECT_TARGET: '玫瑰倒刺 · 选择目标',
  ETHEREALIZE_SELECT_TARGET: '灵化 · 选择转移目标', ETHEREALIZE_DECISION: '灵化', TSG_SLIME_BALANCE: '赐福黏液',
  FIRST_COME_PICK_SELECT: '先到先得 · 选择手牌', GRAVE_DIG_SELECT: '掘墓 · 取回邪神牌', SAME_ABYSS_SELECT: '同入深渊',
  SPHINX_GUESS: '斯芬克斯 · 回答谜题', SPHINX_DODGE: '斯芬克斯 · 尝试规避', TREASURE_DODGE_DECISION: '寻宝者天性',
  TREASURE_AOE_DODGE_DECISION: '寻宝者天性', NYA_BORROW: '千人千貌 · 借用身份', TORTOISE_ORACLE_SELECT: '龟甲占卜',
  IGNITE_TORCH_DISCARD: '点燃火炬 · 选择手牌', ALBINO_CREATURE_SELECT_CARD: '白化生物 · 亮出火牌',
  ZHU_HIDE_DRAW: '幽光回溯', ZHU_HIDE_GOD: '幽光回溯', ZHU_HIDE_AI_DRAW: '幽光回溯', ZHU_HIDE_SPHINX: '幽光回溯' };

/** Reuses the shipped coastal board. This component never creates or mutates rule state. */
export default function AuthorityBattlePresentation({ view, session, offline, onExit, onReturn, onRestart, report,
  preferences = {}, audio, onUiSfxCapture, onPresentationBusyChange, onCompleteTutorial }) {
  const model = useMemo(() => ({ ...createAuthorityPresentation(view, { offline }), view }), [view, offline]);
  const emoji = useAuthorityEmoji({ session, view, offline, toDisplaySeat: model.toDisplaySeat, report });
  const layout = useBattleResponsiveLayout();
  const [submitting, setSubmitting] = useState(false), [error, setError] = useState(null);
  const [selection, setSelection] = useState({ decisionId: null, indices: [] });
  const [exitConfirm, setExitConfirm] = useState(null), [showLog, setShowLog] = useState(false);
  const { active: roleRevealing, finish: finishRoleReveal } = useFreshRoleReveal({ view, freshStart: session.freshStart === true, offline });
  const [peekDismissed, setPeekDismissed] = useState(null);
  const [now, setNow] = useState(Date.now);
  const submittingRef = useRef(false), mobileGodCardRefs = useRef(new Map());
  const refs = useMemo(() => Object.fromEntries(['selfPanelRef', 'roleTextRef', 'handAreaRef', 'emojiButtonRef', 'aiPanelAreaRef',
    'deckAreaRef', 'discardPileRef', 'logRef', 'skillButtonRef', 'restButtonRef', 'drawRevealKeepButtonRef', 'godKeepHandButtonRef',
    'dodgeRollButtonRef', 'swapBlindHandRef'].map(key => [key, { current: null }])), []);
  const paused = !!view.status?.paused;
  const presentation = useAuthorityPresentation({ view, model, paused, audio, session,
    freshStart: session.freshStart === true, openingBlocked: roleRevealing });
  const busy = submitting || presentation.busy || paused || roleRevealing || (!offline && presentation.buffering);
  const softGuide = useAuthoritySoftGuides({ session, view, offline, busy: !!presentation.busy || roleRevealing, refs });
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const dispatcher = useMemo(() => createAuthorityCommandDispatcher({ getView: () => session.getSnapshot(), submit: (type, payload) => session.submit(type, payload) }), [session]);
  const send = async (type, payload = {}) => {
    if (submittingRef.current || busy) return;
    submittingRef.current = true; setSubmitting(true); setError(null);
    try { await dispatcher.submit(type, payload, { decisionId: view.decision.id }); }
    catch (failure) { setError(failure.message); report?.(failure); }
    finally { submittingRef.current = false; setSubmitting(false); }
  };
  const has = type => view.decision.actions.some(action => action.type === type);
  const action = type => view.decision.actions.find(item => item.type === type);
  const handAction = OWN_CARD_ACTIONS.map(action).find(Boolean);
  const publicAction = action('hunt.loot') || action('swap.takeVisible');
  const blindAction = action('swap.takeBlind');
  const blindTarget = model.gs.abilityData.swapTi;
  const targetAction = view.decision.actions.find(item => AUTHORITY_PRESENTATION_COMMANDS[item.type]?.includes('targetSeat'));
  const selected = selection.decisionId === view.decision.id ? selection.indices : [];
  const selectPublicCard = index => {
    if (!publicAction || busy || !publicAction.cardIndices.includes(index)) return;
    if (publicAction.type === 'swap.takeVisible') send(publicAction.type, { cardIndex: index });
    else setSelection({ decisionId: view.decision.id, indices: selected.includes(index) ? selected.filter(value => value !== index)
      : selected.length < publicAction.count ? [...selected, index] : selected });
  };
  const selectCard = index => {
    if (!handAction || busy || !handAction.cardIndices?.includes(index)) return;
    if (['turn.discard', 'bury.commit', 'torch.discard'].includes(handAction.type)) {
      const count = handAction.type === 'turn.discard' ? handAction.count : 1;
      setSelection({ decisionId: view.decision.id, indices: selected.includes(index) ? selected.filter(value => value !== index)
        : count === 1 ? [index] : selected.length < count ? [...selected, index] : selected });
    } else send(handAction.type, { cardIndex: index });
  };
  const targetSeats = targetAction?.targetSeats || targetAction?.targets || [];
  const targetAllowed = displaySeat => !busy && targetSeats.includes(model.toServerSeat(displaySeat));
  const selectTarget = displaySeat => {
    if (targetAction && targetAllowed(displaySeat)) send(targetAction.type, { targetSeat: model.toServerSeat(displaySeat) });
  };
  const displayGs = presentation.gs || model.gs;
  const gs = { ...displayGs, _isMP: !offline, abilityData: { ...model.gs.abilityData,
    discardSelected: selected, buryAliveSelectedIndex: selected[0], igniteTorchSelectedIndex: selected[0] } };
  const visualPlayers = presentation.visualPlayers || model.players;
  const guillotinedPids = new Set((presentation.guillotineTargets || []).map(target => target.pi).filter(index => index != null));
  const me = model.me || model.players[0], visualMe = visualPlayers[0] || me;
  const ri = RINFO[me?.role] || UNKNOWN_ROLE;
  const skillRi = RINFO[action('skill.begin')?.role || me?._nyaBorrow || me?.role] || ri;
  const phase = model.phase;
  const ownTurn = view.viewerSeat !== null && view.currentSeat === view.viewerSeat;
  const isSpectating = view.viewerSeat === null;
  // A reconnect has no reveal animation to replay: retain the current public card.
  const huntRevealBadge = phase === 'HUNT_CONFIRM' && !presentation.busy && model.hunt?.revealedCard
    && Number.isInteger(model.hunt.targetSeat) && (isSpectating || model.hunt.targetSeat !== 0) ? model.hunt : null;
  const decisionNow = !offline && Number.isFinite(presentation.serverNow) ? Math.max(presentation.serverNow, view.presentation?.notBefore || 0) : now;
  const decisionSeconds = view.decision.deadline == null ? null : Math.max(0, Math.ceil((view.decision.deadline - decisionNow) / 1000));
  const houndsSeconds = view.hounds ? Math.max(0, Math.ceil((view.hounds.deadline == null ? view.hounds.remainingMs : view.hounds.deadline - decisionNow) / 1000)) : null;
  const battleBackgroundStyle = getBattleBackgroundStyle(model.expansionKey, layout.isMobile);
  const publicHint = blindAction ? '点击对手手牌区，随机暗抽一张手牌'
    : publicAction ? `${ACTION_LABELS[publicAction.type]}：点击对手手牌${publicAction.count ? `（${selected.length}/${publicAction.count}）` : ''}` : null;
  const hint = targetAction ? `${ACTION_LABELS[targetAction.type] || '选择目标'}：点击亮起的角色面板`
    : publicHint ? publicHint : handAction ? `${ACTION_LABELS[handAction.type]}${handAction.count ? `（${selected.length}/${handAction.count}）` : '：点击手牌'}`
      : view.duel?.lockedCardIndex !== undefined || view.bury ? '已锁定选择，等待其他角色…'
        : isSpectating ? '旁观对局' : !view.decision.actions.length ? '等待其他角色…' : '请选择操作';
  const requestExit = () => setExitConfirm({ message: offline ? '当前单机对局已自动保存。返回主界面？' : isSpectating ? '退出旁观？' : '退出后本局将永久交给 AI。确认退出？' });
  const changePaused = value => {
    if (!offline || typeof session.setPaused !== 'function') { setError('当前对局不支持暂停'); return; }
    try { session.setPaused(value); } catch (failure) { setError(failure.message); report?.(failure); }
  };
  const completeSelection = type => {
    const descriptor = action(type);
    if (!descriptor) return;
    if (type === 'turn.discard' && selected.length === descriptor.count) send(type, { cardIndices: selected });
    else if (type !== 'turn.discard' && selected.length === 1) send(type, { cardIndex: selected[0] });
  };
  const result = model.gs.gameOver;
  const finished = result && !presentation.busy;
  const terminal = useTerminalPresentation({ view, model, freshStart: session.freshStart === true, ready: finished && !roleRevealing });
  const finalAnimation = terminal.scene?.type === 'god' ? <GodResurrectionAnim onDone={terminal.finish} />
    : terminal.scene?.type === 'treasure'
      ? <TreasureMapAnim key={terminal.scene.id} hand={terminal.scene.cards} sourcePlayerIndex={terminal.scene.displaySeat}
        subtitle={`${terminal.scene.name} 集齐了全部编号！`} autoConfirmMs={3000} onConfirm={terminal.finish} /> : null;
  const playing = !!presentation.busy || !!finalAnimation || roleRevealing;
  useEffect(() => { onPresentationBusyChange?.(playing, { matchId: view.matchId, revision: view.revision }); },
    [playing, view.matchId, view.revision, onPresentationBusyChange]);
  const logs = presentation.visibleLog || [];
  const peek = view.peeks?.find(item => item.cards?.length);
  if (finished && !finalAnimation && !view.tutorial) return <>
    <GameResultScreen players={model.players} gameOver={result} iWon={view.viewerSeat !== null && (result.winner === me.role && !me.isDead || result.winnerIdx === 0 || result.winnerIdx2 === 0)}
      isMultiplayer={!offline && !isSpectating} onReturnRoom={onReturn} onRestart={onRestart} onHome={onExit} onShowLog={() => setShowLog(true)} onClickCapture={onUiSfxCapture}>
      {showLog && <FullLogModal log={logs} onClose={() => setShowLog(false)} />}
    </GameResultScreen><style>{GLOBAL_STYLES}</style>
  </>;
  return <>
    <BattleScreen {...layout} {...refs} {...preferences}
      gs={gs} me={me} visualMe={visualMe} visualPlayers={visualPlayers} visualDiscard={presentation.visualDiscard || model.discard}
      visualCurrentTurn={presentation.visualTurnHighlight ?? model.currentTurn} currentTurnPlayer={visualPlayers[model.currentTurn]}
      displayStats={presentation.displayStats || model.displayStats} visibleLog={logs} ri={ri} phase={phase} myTurn={ownTurn}
      isVisualPlayerTurn={ownTurn && !presentation.busy} isSpectating={isSpectating} isMultiplayer={!offline}
      decisionContext={{ localCanAct: view.decision.actions.length > 0 && !busy }} isActionControlsHidden={busy && !softGuide.active || isSpectating}
      cancelable={has('skill.cancel') || !!action('hunt.attack')?.allowAbandon} showCancelBtn={has('skill.cancel') && !busy} canShowEndTurnButton={has('turn.end') && !busy}
      isDiscardPhaseResolving={busy} isDiscardPhasePromptActive={has('turn.discard')} isBlocked={busy}
      displayPhaseLabel={PHASE_LABELS[phase] || ACTION_LABELS[view.decision.actions[0]?.type] || '等待决策'} cardHintText={hint}
      promptWarningTextColor="#df9b76" promptActiveTextColor="#dfcf9e" promptCautionTextColor="#df9b76" promptSafeTextColor="#94c49f" promptMutedTextColor="#958b79"
      isLocalHuntRevealPrompt={has('hunt.reveal')} mpTurnSec={decisionSeconds} mpCthSec={decisionSeconds} mpDiscardSec={decisionSeconds} mpHuntSec={decisionSeconds} mpDecisionSec={decisionSeconds}
      isLocalMpDecisionActive={view.decision.actions.length > 0} isMpCthDecisionPhase={false} houndsTimerVisible={!!view.hounds} houndsSecLeft={houndsSeconds}
      anim={presentation.anim} animExiting={presentation.animExiting} sceneShake={presentation.sceneShake} hitIndices={presentation.hitIndices || []} sanHitIndices={presentation.sanHitIndices || []}
      hpHealIndices={presentation.hpHealIndices || []} sanHealIndices={presentation.sanHealIndices || []} guillotinedPids={guillotinedPids}
      godHighlightPanelBursts={presentation.godHighlightPanelBursts || {}} damageLinkGhosts={presentation.damageLinkGhosts || []} damageLinkEstablishAnims={presentation.damageLinkEstablishAnims || []} selectingOther={!!targetAction}
      blackGoatPulsePid={presentation.blackGoatPulsePid}
      canLocalTargetSelect={!!targetAction && !busy} isTargetSelectable={targetAllowed} effectiveHandLimit={me.handLimit ?? Math.max(0, (me._nyaHandLimit ?? 4) - (me.handLimitDecrease || 0))}
      mobileGodCardRefs={mobileGodCardRefs} mobileArmedGodCardIdx={null} isLocalSeatIndex={index => !isSpectating && index === 0}
      isLocalCurrentTurn={() => ownTurn} hasHuntRevealableCard={player => player.handCount > 0} huntAbandoned={model.gs.huntAbandoned || []}
      isSelfDeadPanelDimmed={!!visualMe.isDead} skillRi={skillRi} skillLimited={!has('skill.begin')} effectiveSkillName={skillRi.skillName || '身份技能'}
      isMyCardClickable={(_card, index) => !busy && !isSpectating && !!handAction?.cardIndices?.includes(index)}
      canPlayerRespondWithAnyHandCard={() => !busy && !!handAction} canPlayerRespondWithFireHandCard={() => !busy && has('albino.reveal')}
      cardsHuntMatch={card => action('hunt.attack')?.cardIndices?.includes(me.hand.findIndex(item => item.id === card.id)) || false}
      handleMyCardClick={selectCard} handleAIClick={selectTarget} useAbility={() => send('skill.begin')} doRest={() => send('turn.rest')} endTurn={() => send('turn.end')}
      cancelAction={() => send('skill.cancel')} huntConfirm={() => send('hunt.attack', { cardIndex: null })}
      confirmDiscard={() => completeSelection('turn.discard')} confirmBuryAliveSelection={() => completeSelection('bury.commit')} confirmIgniteTorchDiscard={() => completeSelection('torch.discard')}
      swapSelectTargetCard={index => send('swap.takeVisible', { cardIndex: index })}
      publicCardSelection={!busy && (publicAction || blindAction) ? { target: publicAction?.type === 'hunt.loot' ? model.gs.abilityData.huntTi : blindTarget,
        indices: publicAction?.cardIndices || model.players[blindTarget]?.hand.map((_card, index) => index) || [],
        selected, faceUp: !!publicAction, onSelect: blindAction ? () => send('swap.takeBlind') : selectPublicCard } : null}
      authorityControls={{ skill: has('skill.begin') && !busy, rest: has('turn.rest') && !busy, multiply: has('multiply.begin') && !busy,
        onMultiply: () => send('multiply.begin'), publicCardsManaged: true, canConfirmDiscard: !busy && selected.length === action('turn.discard')?.count,
        publicConfirm: publicAction?.type === 'hunt.loot' && !busy ? { selected: selected.length, count: publicAction.count,
          onConfirm: () => send('hunt.loot', { cardIndices: selected }) } : null }}
      decisionLayer={<AuthorityDecisionLayer key={view.decision.id} model={model} send={send} busy={busy || !!finalAnimation} publicCardsOnBoard tutorialRefs={refs} />}
      tutorialOverlayHidden showTutorial={false} isScriptedTutorial={false} pendingRoleSelection={false} isTutorialActionAllowed={() => true}
      globalStyles={GLOBAL_STYLES} battleBackgroundStyle={battleBackgroundStyle}
      drawBackgroundCameraActive={presentation.anim?.type === 'DRAW_BACKGROUND_CAMERA_PRE' || (presentation.anim?.type === 'DRAW_CARD' && !presentation.anim?.card?.effect && !presentation.anim?.disableDrawBackgroundCamera)} zhuLitCardsForView={view.litDeck || []}
      swapBlindCardLayout={{ width: 110, height: 166, gap: 14, maxWidth: '92vw', titleFontSize: 20, hintFontSize: 15, nameFontSize: 12 }} isDisconnected={!offline && session.socket?.connected === false}
      resetDisconnectedToStart={requestExit} exitMatchConfirm={exitConfirm} setExitMatchConfirm={setExitConfirm} requestExitMatch={requestExit} returnToMainMenu={requestExit}
      confirmExitMatch={onExit} isSoloPaused={paused && !softGuide.active} setIsSoloPaused={changePaused} pauseAvailable={offline && typeof session.setPaused === 'function'}
      handleUiSfxCapture={onUiSfxCapture} emojiEnabled={emoji.enabled} showEmojiPicker={emoji.showEmojiPicker}
      setShowEmojiPicker={emoji.setShowEmojiPicker} emojiButtonPos={emoji.emojiButtonPos} setEmojiButtonPos={emoji.setEmojiButtonPos} handleEmojiClick={emoji.handleEmojiClick} />
    <GameLayerPortal>
      {emoji.flyingEmojis.map(item => <FlyingEmoji key={item.id} {...item} onDone={emoji.onFlyingEmojiDone} />)}
      {isSpectating && <div className="toe-dialog" role="status" style={{ position: 'fixed', top: 10, left: 10, zIndex: 200, padding: '8px 14px' }}>旁观中 · 仅显示公开信息</div>}
      <AnimOverlay anim={presentation.anim} exiting={presentation.animExiting} expansionKey={model.expansionKey}
        playEndlessCorridorTunnelSound={audio?.playEndlessCorridorTunnelSound} />
      {huntRevealBadge && <HuntRevealedCardBadge card={huntRevealBadge.revealedCard} targetPid={huntRevealBadge.targetSeat} />}
      <KnifeEffect targets={presentation.knifeTargets || []} /><SanMistOverlay targets={presentation.sanTargets || []} />
      <GuillotineAnim targets={presentation.guillotineTargets || []} /><PetrifyAnim targets={presentation.petrifyTargets || []} />
      <SwapCupOverlay active={!!presentation.swapAnim} casterName={presentation.swapAnim?.casterName} targetName={presentation.swapAnim?.targetName} />
      <HuntScopeOverlay active={!!presentation.huntAnim} {...presentation.huntAnim} />
      <BewitchEyeOverlay active={!!presentation.bewitchAnim} {...presentation.bewitchAnim} />
      <CardTransferOverlay transfers={presentation.cardTransfers || []} expansionKey={model.expansionKey} paused={paused} />
      {finalAnimation}
      {roleRevealing && <RoleRevealAnim role={me.role} onDone={finishRoleReveal} />}
      {view.tutorial && <AuthorityTutorialOverlay view={view} session={session} refs={refs} layout={layout}
        busy={playing} onComplete={onCompleteTutorial} report={report} />}
      {softGuide.overlay}
      {(error || presentation.error) && <div className="toe-dialog" role="alert" style={{ position: 'fixed', left: '50%', top: 20, transform: 'translateX(-50%)', zIndex: 11000, padding: 14 }}>
        {error || presentation.error.message || String(presentation.error)} <button className="toe-button" onClick={() => setError(null)}>关闭</button>
        {String(error).includes('uncertain') && <button className="toe-button" onClick={() => session.retry().then(() => setError(null)).catch(report)}>重试同一次操作</button>}
      </div>}
      {!busy && peek && peekDismissed !== view.decision.id && <PeekHandModal card={peek.cards[0]}
        targetName={view.players[peek.targetSeat]?.name} onClose={() => setPeekDismissed(view.decision.id)} />}
    </GameLayerPortal>
  </>;
}

