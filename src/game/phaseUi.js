import { cardLogText, isZoneCard } from './coreUtils.js';

export const CARD_HINT_TEXT = '鼠标悬停查看卡牌详情（移动端请点击卡牌）';

export function getPhasePromptColors(expansionKey) {
  const isStarsCallTheme = expansionKey === '群星呼唤';
  return {
    warning: isStarsCallTheme ? '#ff7d8a' : '#cc3030',
    active: isStarsCallTheme ? '#9dd8f0' : '#836934',
    caution: isStarsCallTheme ? '#ffd27a' : '#9d5d26',
    safe: isStarsCallTheme ? '#8de6b8' : '#577457',
    muted: isStarsCallTheme ? '#4f89a6' : '#3a2510',
  };
}

const BASE_CANCELABLE_PHASES = new Set([
  'SWAP_SELECT_TARGET',
  'SWAP_STEAL_CARD',
  'SWAP_SELECT_TARGET_CARD',
  'SWAP_GIVE_CARD',
  'HUNT_SELECT_TARGET',
  'ZONE_SWAP_SELECT_TARGET',
  'PEEK_HAND_SELECT_TARGET',
  'CAVE_DUEL_SELECT_TARGET',
  'DAMAGE_LINK_SELECT_TARGET',
  'TORTOISE_ORACLE_SELECT',
  'ROSE_THORN_SELECT_TARGET',
  'MULTIPLY_SELECT_TARGET',
  'SHU_SELECT_TARGET',
  'SAME_ABYSS_SELECT',
  'SPHINX_GUESS',
  'GRAVE_DIG_SELECT',
  'BEWITCH_SELECT_CARD',
  'BEWITCH_SELECT_TARGET',
]);

export function isCancelablePhase(phase, { isMultiplayer = false, localCurrentTurn = false } = {}) {
  if (BASE_CANCELABLE_PHASES.has(phase)) return true;
  if (phase !== 'HUNT_CONFIRM') return false;
  return !(isMultiplayer && !localCurrentTurn);
}

export function buildPhaseUiState({
  gs,
  phase,
  me = {},
  visualMe = me,
  currentTurnPlayer = null,
  effectiveHandLimit = 0,
  isSpectating = false,
  softGuidePauseActive = false,
  anim = null,
  animExiting = null,
  animQueueLength = 0,
  hasPendingGs = false,
  pendingAfterDiscardGs = null,
  isDiscardPhaseResolving = false,
  isLocalHuntRevealPrompt = false,
  isScriptedTutorial = false,
  isBlocked = false,
  isVisualPlayerTurn = false,
  localCurrentTurn = false,
  committedTargetAction = false,
  committedAction = false,
  local = {},
} = {}) {
  const players = gs?.players || [];
  const abilityData = gs?.abilityData || {};
  const canShowTurnDecisionModal = !isSpectating && !softGuidePauseActive && !anim && !animExiting && animQueueLength === 0;
  const isPhaseWarningText = (!isDiscardPhaseResolving && ['DISCARD_PHASE', 'PLAYER_REVEAL_FOR_HUNT', 'CAVE_DUEL_SELECT_CARD', 'CAVE_DUEL_WAIT_REVEAL'].includes(phase)) || isLocalHuntRevealPrompt;
  const promptColors = getPhasePromptColors(gs?.expansionKey);
  const isMultiplayer = !!gs?._isMP;
  const thinkingText = idx => `${players[idx]?.name || '目标'} 正在思考…`;

  const label = (() => {
    switch (phase) {
      case 'ACTION':
        return localCurrentTurn ? '你的回合 — 可发动技能、休息，或结束回合' : '等候其他旅者…';
      case 'SWAP_SELECT_TARGET':
        return '【掉包】选择目标角色';
      case 'SWAP_STEAL_CARD':
        return `【掉包】从 ${players[abilityData.swapTi]?.name} 的手牌中暗抽一张`;
      case 'SWAP_SELECT_TARGET_CARD':
        return `【掉包】${players[abilityData.swapTi]?.name}的手牌已公开，请选择要抽取的牌`;
      case 'SWAP_GIVE_CARD':
        return local.swapGive
          ? `${players[abilityData.swapTi]?.revealHand ? '抽到' : '暗抽到'} ${cardLogText(abilityData.takenCard)}，选一张手牌还给对方`
          : '等待掉包者归还手牌…';
      case 'HUNT_SELECT_TARGET':
        return '【追捕】选择猎物';
      case 'HUNT_CONFIRM':
        return local.huntConfirm
          ? `${cardLogText(abilityData.revCard, { alwaysShowName: true })} 已亮出！${abilityData.revCard && !isZoneCard(abilityData.revCard) ? '弃出任意手牌' : '弃出匹配手牌'}造成3HP，或放弃`
          : (isMultiplayer ? '请等待追猎者做出选择…' : `${cardLogText(abilityData.revCard, { alwaysShowName: true })} 已亮出`);
      case 'HUNT_SELECT_CARD_FROM_PUBLIC':
        return `【追捕】从 ${players[abilityData.huntTi]?.name} 的公开手牌中选择一张`;
      case 'PLAYER_REVEAL_FOR_HUNT':
        return `⚠ ${abilityData.aiHunterName || '追猎者'} 正在追捕你！请选择一张手牌亮出`;
      case 'HUNT_WAIT_REVEAL':
        if (localCurrentTurn) return `等待 ${players[abilityData.huntTi ?? 1]?.name || '对方'} 亮出手牌…`;
        return local.huntTarget
          ? '⚠ 追猎者正在追捕你！请选择一张手牌亮出（20秒）'
          : `等待 ${players[abilityData.huntTi ?? 1]?.name || '对方'} 亮出手牌…`;
      case 'TREASURE_DODGE_DECISION':
        return local.treasureDodge
          ? (canShowTurnDecisionModal ? '【寻宝者】触发负面区域牌！是否掷骰子规避？' : '规避判定中…')
          : (isMultiplayer ? `等候 ${players[gs?.currentTurn]?.name} 做出选择…` : `${players[gs?.currentTurn]?.name} 正在思考…`);
      case 'BEWITCH_SELECT_CARD':
        return '【蛊惑】选择要赠送的手牌';
      case 'MULTIPLY_SELECT_TARGET':
        return '【繁衍】选择另一名角色传播黑山羊幼仔';
      case 'SHU_SELECT_TARGET':
        return '【黑暗子嗣】选择一名角色获得黑山羊幼仔';
      case 'IGNITE_TORCH_DISCARD':
        return local.igniteTorch ? '【引燃火把】选择一张手牌弃置' : (isMultiplayer ? '请等待其他玩家选择…' : thinkingText(abilityData.playerIndex));
      case 'DECIPHER_STONE_CARVING':
        return local.decipherStone ? '【解读石刻】拖动卡牌到对应区域' : (isMultiplayer ? '请等待其他玩家解读石刻…' : thinkingText(abilityData.playerIndex));
      case 'ALBINO_CREATURE_SELECT_CARD':
        return local.albinoCreature ? '【白化生物】选择一张带"火"字的手牌亮出' : (isMultiplayer ? '请等待其他玩家选择…' : thinkingText(abilityData.playerIndex));
      case 'TSG_SLIME_BALANCE':
        return local.slimeBalance
          ? '【赐福黏液】是否牺牲黏液平分HP和SAN？'
          : (isMultiplayer ? '请等待其他玩家选择…' : thinkingText(abilityData.targetIdx));
      case 'ETHEREALIZE_DECISION':
        return local.etherealizeDecision ? '【半物质化】是否消耗1层虚化转移伤害？' : (isMultiplayer ? '请等待其他玩家选择…' : thinkingText(abilityData.targetIdx));
      case 'ETHEREALIZE_SELECT_TARGET':
        return local.etherealizeTarget ? '【半物质化】选择相邻角色承受伤害' : (isMultiplayer ? '请等待其他玩家选择…' : thinkingText(abilityData.targetIdx));
      case 'GOD_CHOICE':
        return local.godChoice
          ? (canShowTurnDecisionModal ? '邪神降临！选择如何回应' : '面临抉择中…')
          : (isMultiplayer ? `等候 ${players[gs?.currentTurn]?.name} 回应邪神…` : '邪神降临！选择如何回应');
      case 'ZHU_HIDE_AI_DRAW':
        return visualMe?.godName === 'ZHU'
          ? (canShowTurnDecisionModal ? '【衔烛照幽】是否藏牌？' : '衔烛照幽判定中…')
          : (isMultiplayer ? '请等待其他玩家选择…' : thinkingText(gs?.currentTurn));
      case 'NYA_BORROW':
        return local.nyaBorrow
          ? (canShowTurnDecisionModal ? '「千人千貌」——借用已死角色的身份？' : '身份借用中…')
          : (isMultiplayer ? `等候 ${players[gs?.currentTurn]?.name} 借用身份…` : '「千人千貌」——借用已死角色的身份？');
      case 'DISCARD_PHASE': {
        if (isDiscardPhaseResolving) {
          const pendingTurn = pendingAfterDiscardGs?.currentTurn;
          const pendingPlayer = pendingAfterDiscardGs?.players?.[pendingTurn];
          if (pendingAfterDiscardGs?.phase === 'DRAW_REVEAL') return pendingTurn === 0 ? '你的回合即将开始…' : `等候 ${pendingPlayer?.name || '当前玩家'} 摸牌…`;
          if (pendingAfterDiscardGs?.phase === 'AI_TURN') return pendingPlayer ? `${pendingPlayer.name} 正在行动…` : '下一回合准备中…';
          return pendingTurn === 0 ? '你的回合即将开始…' : `等候 ${pendingPlayer?.name || '下一名玩家'} 行动…`;
        }
        if (!localCurrentTurn) return `等待 ${currentTurnPlayer?.name || '当前玩家'} 弃牌…`;
        const selected = abilityData.discardSelected || [];
        const need = Math.max(0, (me.hand?.length || 0) - effectiveHandLimit);
        return `手牌超限 (${me.hand?.length || 0}/${effectiveHandLimit}) — 需弃 ${need} 张，已选 ${selected.length}/${need}`;
      }
      case 'AI_TURN':
        return isMultiplayer ? `等候 ${players[gs?.currentTurn]?.name} 行动…` : `${players[gs?.currentTurn]?.name} 正在行动…`;
      case 'PLAYER_WIN_PENDING':
        return '✦ 你已集齐全部编号！';
      case 'MP_PLAYER_WIN_WAIT':
        return '等待其他玩家……';
      case 'DRAW_REVEAL':
        return local.drawDecision
          ? (canShowTurnDecisionModal ? '摸牌 — 请确认' : '摸牌中…')
          : (isMultiplayer ? `等候 ${players[gs?.currentTurn]?.name} 摸牌…` : '');
      case 'TREASURE_WIN':
        return '✦ 你已集齐全部编号！';
      case 'ZONE_SWAP_SELECT_TARGET':
        return '【触底反弹】选择要交换全部手牌的目标';
      case 'DAMAGE_LINK_SELECT_TARGET':
        return '请选择绳索连接目标';
      case 'CAVE_DUEL_SELECT_TARGET':
        return '请选择“穴居人战争”的目标';
      case 'CAVE_DUEL_SELECT_CARD':
        return local.caveDuel
          ? `⚠ 和${players[abilityData.caveDuelSource]?.name || '对手'}来一场穴居人式的对决！无编号可赢4但会输给1~3，如果落败将失去这张牌`
          : '等待穴居人战争双方亮牌…';
      case 'CAVE_DUEL_WAIT_REVEAL':
        return local.caveDuel
          ? '⚠ 请选择穴居人战争要亮出的手牌（20秒）'
          : '等待穴居人战争双方亮牌…';
      case 'ROSE_THORN_SELECT_TARGET':
        return '【玫瑰倒刺】选择承受倒刺的目标';
      case 'GRAVE_DIG_SELECT':
        return local.graveDig ? '【掘墓】从弃牌堆选择一张邪神牌' : (isMultiplayer ? '等待掘墓选择…' : thinkingText(abilityData.playerIndex));
      case 'BURY_ALIVE_SELECT': {
        const target = abilityData.targets?.[abilityData.targetIndex || 0];
        return local.buryAlive ? '【活埋】选择一张手牌放到牌堆底' : (isMultiplayer ? `等待 ${players[target]?.name || '目标'} 选择活埋手牌…` : thinkingText(target));
      }
      case 'FIRST_COME_PICK_SELECT':
        return `【先到先得】${players[abilityData.pickOrder?.[abilityData.pickIndex || 0]]?.name || '当前角色'} 请选择一张牌`;
      case 'SAME_ABYSS_SELECT':
        return local.sameAbyss ? '【同归深渊】你手牌最多，须做出选择' : (isMultiplayer ? '等待同归深渊目标做出选择…' : thinkingText(abilityData.targetIdx));
      case 'SPHINX_GUESS':
        return local.sphinxGuess ? '【斯芬克斯】猜测牌堆顶的牌是否是区域牌' : (isMultiplayer ? '等待斯芬克斯猜测…' : thinkingText(gs?.currentTurn));
      default:
        return '';
    }
  })();

  const cancelable = isCancelablePhase(phase, { isMultiplayer, localCurrentTurn });
  const showCancelBtn = !!(
    !isScriptedTutorial &&
    cancelable &&
    !committedTargetAction &&
    !committedAction &&
    phase !== 'HUNT_CONFIRM' &&
    !isSpectating &&
    localCurrentTurn &&
    (!(phase || '').includes('DAMAGE_LINK') || local.damageLinkSelect) &&
    !anim
  );
  const canShowEndTurnButton = !!(
    phase === 'ACTION' &&
    isVisualPlayerTurn &&
    !isBlocked &&
    !isScriptedTutorial &&
    !animExiting &&
    animQueueLength === 0 &&
    !hasPendingGs
  );

  return {
    cardHintText: CARD_HINT_TEXT,
    canShowTurnDecisionModal,
    cancelable,
    canShowEndTurnButton,
    displayPhaseLabel: isSpectating ? '观战中……' : label,
    isPhaseWarningText,
    phaseLabel: label,
    promptColors,
    showCancelBtn,
  };
}
