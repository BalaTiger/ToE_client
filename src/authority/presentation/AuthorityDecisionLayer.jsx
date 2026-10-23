import { useState } from 'react';
import { DDCard, DDCardBack } from '../../components/cards';
import { CardFlipAnim } from '../../components/anim/CardFlipAnim';
import { DrawRevealActions, GodChoiceActions } from '../../components/battle/RevealDecisionActions';
import { NyaBorrowModal, TreasureDodgeModal, TortoiseOracleModal } from '../../components/modals';
import { DecipherStoneCarvingOverlay } from '../../components/modals/DecipherStoneCarvingOverlay';
import { BattleDecisionModals } from '../../components/battle/BattleDecisionModals';

import { ACTION_LABELS } from './actionLabels';
const CHOICES = { worship: '信仰／改信', upgrade: '升级神力', keepHand: '收入手牌', discard: '弃置', accept: '接受改信', damage: '承受伤害' };
const BOOLS = {
  'slime.answer': ['use', '使用黏液平衡', '不使用黏液'], 'etherealize.answer': ['use', '使用虚化', '承受损失'],
  'treasureDodge.reply': ['use', '掷骰尝试规避', '直接触发'], 'sphinx.dodge': ['use', '掷骰尝试规避', '直接触发'],
  'sphinx.guess': ['isZone', '是区域牌', '不是区域牌'], 'zhu.hide': ['hide', '藏到牌堆底', '正常翻开'],
  'zhu.hideSphinx': ['hide', '藏到牌堆底', '允许翻开'],
};
const BOARD_ACTIONS = new Set(['skill.begin', 'skill.cancel', 'turn.rest', 'turn.end', 'multiply.begin', 'god.useHand',
  'turn.discard', 'swap.give', 'hunt.reveal', 'hunt.attack', 'bewitch.chooseCard', 'caveDuel.commit', 'bury.commit', 'torch.discard', 'albino.reveal']);

export function AuthorityDialog({ title, children }) {
  return <div className="toe-dialog-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 520, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050403bb', padding: 16 }}>
    <section className="toe-dialog toe-dialog--decision" role="dialog" aria-label={title} style={{ width: 'min(680px,94vw)', maxHeight: '90dvh', overflowY: 'auto', padding: '24px 28px', textAlign: 'center' }}>
      <h2 className="toe-title" style={{ marginTop: 0 }}>{title}</h2>{children}
    </section>
  </div>;
}
function Choice({ children, onClick, disabled }) {
  return <button className="toe-button toe-option" disabled={disabled} onClick={onClick} style={{ padding: '10px 18px', margin: 6 }}>{children}</button>;
}
function CardChoice({ card, selected, onClick }) {
  return <div style={{ display: 'inline-block', margin: 8 }}>
    {card?._back || !card ? <button className="toe-button" onClick={onClick}><DDCardBack /></button>
      : <DDCard card={card} selected={selected} onClick={onClick} frameStyle={{ width: 110 }} />}
  </div>;
}
function PublicCardChoice({ action, model, send }) {
  const [selected, setSelected] = useState([]);
  const type = action.type;
  const cards = type === 'swap.takeVisible' ? model.players[model.gs.abilityData.swapTi]?.hand
    : type === 'hunt.loot' ? model.players[model.gs.abilityData.huntTi]?.hand : model.view.publicReveals;
  const multiple = type === 'hunt.loot';
  return <AuthorityDialog title={ACTION_LABELS[type]}>
    <div>{action.cardIndices.map(index => <CardChoice key={index} card={cards?.[index]} selected={selected.includes(index)} onClick={() => {
      if (!multiple) send(type, { cardIndex: index });
      else setSelected(previous => previous.includes(index) ? previous.filter(i => i !== index) : previous.length < action.count ? [...previous, index] : previous);
    }} />)}</div>
    {multiple && <Choice disabled={selected.length !== action.count} onClick={() => send(type, { cardIndices: selected })}>确认选择（{selected.length}/{action.count}）</Choice>}
  </AuthorityDialog>;
}

/** The original modal/card components receive only recipient-visible data and intent callbacks. */
export function AuthorityDecisionLayer({ model, send, busy, publicCardsOnBoard = false, tutorialRefs = {} }) {
  const view = model.view, actions = view.decision.actions;
  if (busy || view.gameOver) return null;
  const get = type => actions.find(action => action.type === type);
  const draw = get('draw.keep') || get('draw.discard');
  const god = get('god.choose');
  if (draw && view.draw) {
    if (view.draw.hidden) return <AuthorityDialog title="暗牌抉择"><DDCardBack expansionKey={model.expansionKey} />
      {get('draw.keep') && <Choice onClick={() => send('draw.keep')}>收入手牌</Choice>}
      {get('draw.discard') && <Choice onClick={() => send('draw.discard')}>弃置此牌</Choice>}
    </AuthorityDialog>;
    return <CardFlipAnim card={view.draw.card} targetPid={model.toDisplaySeat(view.draw.owner)} skipTravel settled expansionKey={model.expansionKey} decisionKind="draw-reveal">
      <DrawRevealActions drawReveal={{ card: view.draw.card }} canChoose canKeep={!!get('draw.keep')} canDiscard={!!get('draw.discard')}
        keepButtonRef={tutorialRefs.drawRevealKeepButtonRef} onKeep={() => send('draw.keep')} onDiscard={() => send('draw.discard')} />
    </CardFlipAnim>;
  }
  if (god && view.godEncounter) {
    const choices = god.choices || [];
    return <CardFlipAnim card={view.godEncounter.card} targetPid={model.toDisplaySeat(view.godEncounter.owner)} skipTravel settled expansionKey={model.expansionKey} decisionKind="god-choice">
      <GodChoiceActions godCard={view.godEncounter.card} player={model.me} forcedConvert={view.godEncounter.forcedConvert} legalChoices={choices}
        isConvert={!!model.me.godName && model.me.godName !== view.godEncounter.card.godKey} canChoose
        allowWorship={choices.some(choice => ['worship', 'upgrade', 'accept'].includes(choice))} allowKeepHand={choices.includes('keepHand')} allowDiscard={choices.includes('discard')}
        onWorship={() => send('god.choose', { choice: choices.find(choice => ['upgrade', 'worship', 'accept'].includes(choice)) })}
        keepButtonRef={tutorialRefs.godKeepHandButtonRef} onKeepHand={() => send('god.choose', { choice: 'keepHand' })} onDiscard={() => send('god.choose', { choice: 'discard' })} />
    </CardFlipAnim>;
  }
  const stone = get('stone.arrange');
  if (stone) return <DecipherStoneCarvingOverlay revealedCards={view.privateReveals} expansionKey={model.expansionKey}
    onConfirm={({ handCard, deckTopCards, deckBottomCards }) => {
      const index = card => view.privateReveals.findIndex(item => item.id === card.id);
      send('stone.arrange', { handIndex: index(handCard), topIndices: deckTopCards.map(index), bottomIndices: deckBottomCards.map(index) });
    }} />;
  const tortoise = get('tortoise.choose');
  if (tortoise) return <TortoiseOracleModal abilityData={{ revealedCards: view.publicReveals || [], selectableKeys: tortoise.keys }} canPick expansionKey={model.expansionKey} onSelect={key => send('tortoise.choose', { key })} />;
  const nya = get('nya.borrow');
  if (nya) return <NyaBorrowModal deadPlayers={(nya.targetSeats || nya.targets || []).map(seat => model.players[model.toDisplaySeat(seat)])} godLevel={model.me.godLevel}
    onBorrow={player => send('nya.borrow', { targetSeat: player.seat })} onSkip={() => send('nya.borrow', { targetSeat: null })} />;
  const dodge = get('treasureDodge.reply') || get('sphinx.dodge');
  const dodgeCard = view.draw?.card || (dodge?.type === 'sphinx.dodge' ? view.events?.findLast(event => event.type === 'sphinxRevealed' && event.seat === view.viewerSeat)?.card : null);
  if (dodge && dodgeCard && (dodge.choices || [false, true]).includes(true)) return <TreasureDodgeModal drawReveal={{ card: dodgeCard }}
    rollButtonRef={tutorialRefs.dodgeRollButtonRef}
    canSkip={(dodge.choices || [false, true]).includes(false)} onRoll={() => send(dodge.type, { use: true })} onSkip={() => send(dodge.type, { use: false })} />;
  const zhu = get('zhu.hide') || get('zhu.hideSphinx');
  const zhuCard = zhu && view.litDeck?.find(item => item.deckIndex === 0)?.card;
  if (zhuCard) return <BattleDecisionModals gs={model.gs} me={model.me} visualMe={model.me} phase={view.phase} canShowTurnDecisionModal
    pendingZhuAiDrawCard={zhuCard} pendingZhuSphinxAnyCard={zhu.type === 'zhu.hideSphinx'}
    handleZhuHideAiDrawCard={hide => send(zhu.type, { hide })} runDecision={(_key, callback) => callback()} />;
  const originalModal = ['slime.answer', 'etherealize.answer', 'sphinx.guess', 'publicPick.choose', 'grave.choose', 'sameAbyss.choose'].find(type => get(type));
  if (originalModal) {
    const actorIdx = model.gs.abilityData.actorIdx ?? model.currentTurn;
    const actorHandCount = model.players[actorIdx]?.handCount || 0;
    const gs = { ...model.gs, abilityData: { ...model.gs.abilityData, playerIndex: 0, pickOrder: [0], pickIndex: 0,
      actorIdx, actorHandCount, targetHandCount: model.me.handCount, discardCount: Math.max(0, model.me.handCount - actorHandCount) } };
    return <BattleDecisionModals gs={gs} me={model.me} visualMe={model.me} phase={view.phase} canShowTurnDecisionModal
      legalActions={model.actionByType} decisionContext={{ localCanAct: true, presentation: 'interactive' }} runDecision={(_key, callback) => callback()}
      isLocalSeatIndex={index => index === 0} isLocalSphinxGuessPhase={() => !!get('sphinx.guess')} isLocalFirstComePicker={() => !!get('publicPick.choose')}
      isLocalSameAbyssTargetPhase={() => !!get('sameAbyss.choose')}
      resolveTsathogguaSlimeBalance={use => send('slime.answer', { use })} resolveEtherealizeRedirect={use => send('etherealize.answer', { use })}
      sphinxGuess={isZone => send('sphinx.guess', { isZone })} firstComePickSelectCard={cardIndex => send('publicPick.choose', { cardIndex })}
      graveDigSelectGod={cardIndex => send('grave.choose', { cardIndex })} sameAbyssSelect={choice => send('sameAbyss.choose', { choice: choice === 'hp' ? 'damage' : choice })} />;
  }
  const publicCards = actions.find(action => ['swap.takeVisible', 'hunt.loot'].includes(action.type));
  if (publicCardsOnBoard && (publicCards || get('swap.takeBlind'))) return null;
  if (publicCards) return <PublicCardChoice key={`${view.decision.id}:${publicCards.type}`} action={publicCards} model={model} send={send} />;
  const boolean = actions.find(action => BOOLS[action.type]);
  if (boolean) {
    const [key, yes, no] = BOOLS[boolean.type];
    return <AuthorityDialog title={ACTION_LABELS[boolean.type] || '请选择'}>{(boolean.choices || [false, true]).map(value =>
      <Choice key={String(value)} onClick={() => send(boolean.type, { [key]: value })}>{value ? yes : no}</Choice>)}</AuthorityDialog>;
  }
  const remaining = actions.filter(action => !BOARD_ACTIONS.has(action.type) && !(action.targetSeats || action.targets));
  if (!remaining.length) return null;
  return <AuthorityDialog title={ACTION_LABELS[remaining[0].type] || '请选择操作'}>{remaining.map(action => {
    if (action.choices) return action.choices.map(choice => <Choice key={`${action.type}:${choice}`} onClick={() => send(action.type, { choice })}>{CHOICES[choice] || choice}</Choice>);
    if (action.cardIndices) return action.cardIndices.map(index => <CardChoice key={`${action.type}:${index}`} card={model.me.hand[index]} onClick={() => send(action.type, { cardIndex: index })} />);
    return <Choice key={action.type} onClick={() => send(action.type)}>{ACTION_LABELS[action.type] || action.type}</Choice>;
  })}</AuthorityDialog>;
}
