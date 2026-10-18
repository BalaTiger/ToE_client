import { copyPlayers } from '../game/coreUtils.js';
import { submitLossEvents } from '../game/effectEngine.js';
import { buildStatChangeStatePatch } from '../game/statChangeEngine.js';
import { appendDecisionContinuation } from '../game/decisionContinuations.js';
export const thornSnapshot = state => (state?.players || []).map((player, seat) =>
  [...(player.hand || []), ...(player.godZone || [])].filter(card => card.roseThornHolderId === seat).map(card => card.id));
export function settleThornLosses(state, previous) {
  if (!previous || state.gameOver) return state;
  const current = thornSnapshot(state), players = copyPlayers(state.players), log = [...(state.log || [])];
  const losses = previous.flatMap((ids, seat) => {
    const count = ids.filter(id => !current[seat].includes(id)).length;
    return count && !players[seat].isDead ? [{ targetIdx: seat, lostHp: 2 * count, source: '玫瑰倒刺' }] : [];
  });
  if (!losses.length) return state;
  const deck = [...state.deck], discard = [...state.discard];
  const damage = submitLossEvents({ players, deck, discard, log, currentTurn: state.currentTurn, events: losses,
    statEventSeq: (state._statEventSeq || 0) + 1, continuation: { _turnOwner: state.currentTurn } });
  const frames = damage.phase && state.phase !== 'ACTION'
    ? appendDecisionContinuation(state, { phase: state.phase, abilityData: state.abilityData }) : state._decisionContinuations;
  return { ...state, players, deck, discard, log, ...buildStatChangeStatePatch(state, damage),
    ...(frames ? { _decisionContinuations: frames } : {}),
    ...(damage.phase ? { phase: damage.phase, abilityData: damage.abilityData } : {}) };
}
