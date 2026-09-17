import React from 'react';
import { GOD_DEFS } from '../../constants/card';
import { ROLE_CULTIST, isRevealedCultist } from '../../game/coreUtils';
import { getLatestGodEncounterProgress } from '../../game/balancePatches';
import { buildPublicUrl } from '../../utils/url';
import { ActionIcon } from './ActionIcon';
import './reveal-decision-actions.css';

function RevealChoiceButton({ children, kind, tone = 'skill', disabled = false, onClick, buttonRef }) {
  return (
    <button
      className={`toe-button toe-turn-plaque toe-turn-${tone} toe-reveal-choice`}
      type="button"
      ref={buttonRef}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      style={{ '--toe-action-image': `url('${buildPublicUrl(`/img/ui/coastal/action-${tone}-b.webp`)}')` }}
    >
      <ActionIcon kind={kind} />
      <span className="toe-reveal-choice-label">{children}</span>
    </button>
  );
}

function DecisionError({ error }) {
  return error ? <div className="toe-reveal-decision-error" role="alert">结算准备失败，请重试。</div> : null;
}

export function DrawRevealActions({
  drawReveal,
  onKeep,
  onDiscard,
  canChoose,
  thinkingText,
  decisionError = null,
  canKeep = true,
  canDiscard = true,
  keepButtonRef,
}) {
  if (!drawReveal?.card) return null;
  return (
    <div className="toe-reveal-decision-actions" data-reveal-actions="draw">
      {!canChoose ? (
        <div className="toe-reveal-decision-note" role="status">{thinkingText || '等待探索者作出决定…'}</div>
      ) : (
        <>
          <div className="toe-reveal-decision-buttons" role="group" aria-label="区域牌决策">
            <RevealChoiceButton kind="confirm" disabled={!canKeep} onClick={onKeep} buttonRef={keepButtonRef}>收入手牌</RevealChoiceButton>
            <RevealChoiceButton kind="cancel" tone="end" disabled={!canDiscard} onClick={onDiscard}>弃置此牌</RevealChoiceButton>
          </div>
          {decisionError ? <DecisionError error={decisionError} />
            : <div className="toe-reveal-decision-note">收入手牌将触发效果</div>}
        </>
      )}
    </div>
  );
}

export function GodChoiceActions({
  godCard,
  player,
  onWorship,
  onKeepHand,
  onDiscard,
  isConvert,
  forcedConvert,
  canChoose = true,
  thinkingText = '',
  allowWorship = true,
  allowKeepHand = true,
  allowDiscard = true,
  keepButtonRef = null,
  decisionError = null,
}) {
  if (!godCard) return null;
  const def = GOD_DEFS[godCard.godKey];
  const alreadyWorship = player.godName === godCard.godKey;
  const canUpgrade = alreadyWorship && (player.godLevel || 0) < 3;
  const worshipLabel = forcedConvert ? '接受改信' : canUpgrade ? '升级邪神之力' : isConvert ? '改信新神' : '信仰邪神';
  const powerNote = canUpgrade
    ? `升级后：${def.power} Lv.${(player.godLevel || 0) + 1}`
    : alreadyWorship ? `${def.power}已达 Lv.3` : `信仰后：${def.power} Lv.1`;
  const encounter = getLatestGodEncounterProgress(player);
  const encounterNote = isRevealedCultist(player) ? '遭遇伤害免疫' : encounter.sanLoss > 0 ? `遭遇 −${encounter.sanLoss} SAN` : '';
  return (
    <div className="toe-reveal-decision-actions" data-reveal-actions="god">
      {!canChoose ? (
        <div className="toe-reveal-decision-note" role="status">{thinkingText || '等待对方回应邪神…'}</div>
      ) : (
        <>
          <div className="toe-reveal-decision-buttons" role="group" aria-label="邪神牌决策">
            <RevealChoiceButton kind="cult" disabled={!allowWorship} onClick={onWorship}>{worshipLabel}</RevealChoiceButton>
            {!alreadyWorship && !forcedConvert && player.role === ROLE_CULTIST && allowKeepHand && (
              <RevealChoiceButton kind="confirm" tone="rest" onClick={onKeepHand} buttonRef={keepButtonRef}>收入手牌</RevealChoiceButton>
            )}
            {!forcedConvert && (
              <RevealChoiceButton kind="cancel" tone="end" disabled={!allowDiscard} onClick={onDiscard}>放弃</RevealChoiceButton>
            )}
          </div>
          {decisionError ? <DecisionError error={decisionError} /> : <div className="toe-reveal-decision-note">
            {encounterNote && <span>{encounterNote} · </span>}
            {forcedConvert ? '邪祀者强制改信' : powerNote}
            {isConvert && !forcedConvert && <span className="toe-reveal-convert-cost"> · 改信失去 1 SAN</span>}
          </div>}
        </>
      )}
    </div>
  );
}
