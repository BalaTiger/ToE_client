import { bindAnimLogChunks } from './animLogs';
import { statePatchStep } from './animQueueHelpers';
import { isLocalCurrentTurn, isLocalSeatIndex, localDisplayName } from './rotateState';

export const MP_REMOTE_REPLAY = {
  ROLE_REVEAL: 'ROLE_REVEAL',
  SET_STATE: 'SET_STATE',
  DICE_ROLL: 'DICE_ROLL',
  ANIM_QUEUE: 'ANIM_QUEUE',
  START_ANIM: 'START_ANIM',
};

export function getTurnStartDrawBaselineLog(state) {
  const log = Array.isArray(state?.log) ? state.log : [];
  const animatedLogCount = [
    ...(state?._turnStartLogs || []),
    ...(state?._drawLogs || []),
    ...(state?._statLogs || []),
  ].length;
  return animatedLogCount > 0 ? log.slice(0, Math.max(0, log.length - animatedLogCount)) : log;
}

function getDrawnCard(state) {
  return state?.phase === 'GOD_CHOICE'
    ? state.abilityData?.godCard
    : state?.drawReveal?.card;
}

function hasDrawAnimationState(state) {
  if (state?.gameOver) return false;
  return (
    state.phase === 'DRAW_REVEAL'
    || state.phase === 'DRAW_SELECT_TARGET'
    || state.phase === 'GOD_CHOICE'
    || (
      state.phase === 'ACTION'
      && state.drawReveal?.card != null
      && state.drawReveal?.needsDecision === false
      && state.drawReveal?.drawerIdx != null
    )
  );
}

function buildMaskedActionState(state) {
  return { ...state, phase: 'ACTION', drawReveal: null, abilityData: {} };
}

function buildDrawEffectQueue({
  rotated,
  previousGs,
  buildAnimQueue,
  buildFullHandSwapTransferQueueFromLogs,
}) {
  const beforeDrawPlayers = rotated._playersBeforeThisDraw || previousGs?.players || rotated.players;
  const drawFullHandSwapQ = buildFullHandSwapTransferQueueFromLogs(
    [...(rotated._drawLogs || []), ...(rotated._statLogs || [])],
    beforeDrawPlayers,
  );
  const drawEffectQBase = bindAnimLogChunks(
    buildAnimQueue({ ...rotated, players: beforeDrawPlayers, log: getTurnStartDrawBaselineLog(rotated) }, rotated),
    { statLogs: rotated._statLogs },
  );
  const drawEffectQ = drawFullHandSwapQ.length
    ? [...drawFullHandSwapQ, ...drawEffectQBase.filter(step => step.type !== 'CARD_TRANSFER')]
    : drawEffectQBase;
  return { beforeDrawPlayers, drawEffectQ };
}

export function buildMpRemoteReplayAction({
  rotated,
  previousGs,
  roleRevealed,
  buildAnimQueue,
  buildFullHandSwapTransferQueueFromLogs,
}) {
  if (!rotated) return null;
  if (!roleRevealed && !rotated.gameOver) {
    return {
      type: MP_REMOTE_REPLAY.ROLE_REVEAL,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: rotated,
      role: rotated.players?.[0]?.role,
    };
  }

  const lastLog = rotated.log?.[rotated.log.length - 1] || '';
  const diceMatch = lastLog.match(/(.+?) 掷出 (\d+) 点/);
  const isDiceRoll = diceMatch && !rotated.gameOver && rotated.phase === 'ACTION';
  if (isDiceRoll) {
    const rollerName = diceMatch[1];
    const d1 = parseInt(diceMatch[2], 10);
    const isSelf = rollerName === '你' || rollerName === localDisplayName(0, rotated.players?.[0]?.name);
    return {
      type: MP_REMOTE_REPLAY.DICE_ROLL,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: rotated,
      anim: {
        type: 'DICE_ROLL',
        d1,
        d2: 0,
        heal: 0,
        rollerName: isSelf ? '你' : rollerName,
        dodgeSuccess: d1 >= 4,
      },
    };
  }

  const nonSelfDraw = hasDrawAnimationState(rotated) && !isLocalCurrentTurn(rotated);
  if (nonSelfDraw && !isLocalSeatIndex(rotated.drawReveal?.drawerIdx ?? rotated.currentTurn)) {
    const drawnCard = getDrawnCard(rotated);
    if (!drawnCard) return { type: MP_REMOTE_REPLAY.SET_STATE, gs: rotated };
    const drawerPid = rotated.currentTurn;
    const drawerName = rotated.players?.[drawerPid]?.name || '???';
    const { beforeDrawPlayers, drawEffectQ } = buildDrawEffectQueue({
      rotated,
      previousGs,
      buildAnimQueue,
      buildFullHandSwapTransferQueueFromLogs,
    });
    const queue = [
      { type: 'DRAW_CARD', card: drawnCard, triggerName: drawerName, targetPid: drawerPid, msgs: rotated._drawLogs },
      ...drawEffectQ,
    ];
    if (drawEffectQ.length) queue.push(statePatchStep({ players: rotated.players, discard: rotated.discard }));
    return {
      type: MP_REMOTE_REPLAY.ANIM_QUEUE,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: rotated,
      queue,
      visualLock: rotated._playersBeforeThisDraw
        ? { players: beforeDrawPlayers, zhuLight: previousGs?.zhuLight || rotated.zhuLight || null }
        : null,
    };
  }

  const localDraw = hasDrawAnimationState(rotated) && isLocalCurrentTurn(rotated);
  if (localDraw) {
    const drawnCard = getDrawnCard(rotated);
    if (!drawnCard) return { type: MP_REMOTE_REPLAY.SET_STATE, gs: rotated };
    return {
      type: MP_REMOTE_REPLAY.START_ANIM,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: rotated,
      anim: { type: 'YOUR_TURN', msgs: rotated._turnStartLogs },
      queue: [
        { type: 'DRAW_CARD', card: drawnCard, triggerName: '你', targetPid: 0, msgs: rotated._drawLogs },
        ...bindAnimLogChunks(
          buildAnimQueue({ ...previousGs, players: rotated._playersBeforeThisDraw || previousGs?.players }, rotated),
          { statLogs: rotated._statLogs },
        ),
      ],
      visualLock: rotated._playersBeforeThisDraw
        ? { players: rotated._playersBeforeThisDraw, zhuLight: previousGs?.zhuLight || rotated.zhuLight || null }
        : null,
    };
  }

  const isHuntingPlayer0 = !rotated.gameOver && rotated.phase === 'PLAYER_REVEAL_FOR_HUNT' && rotated.abilityData?.huntingAI != null;
  if (isHuntingPlayer0) {
    return {
      type: MP_REMOTE_REPLAY.START_ANIM,
      maskedGs: buildMaskedActionState(rotated),
      pendingGs: rotated,
      anim: { type: 'SKILL_HUNT', msgs: rotated.log.slice(-3), targetIdx: 0 },
      queue: [],
    };
  }

  if (rotated.phase === 'DISCARD_PHASE' && !isLocalCurrentTurn(rotated)) {
    return {
      type: MP_REMOTE_REPLAY.SET_STATE,
      gs: { ...rotated, phase: 'ACTION', abilityData: {} },
    };
  }

  return { type: MP_REMOTE_REPLAY.SET_STATE, gs: rotated };
}
