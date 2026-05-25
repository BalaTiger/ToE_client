import { applyFx } from './effectEngine';
import { cardLogText, copyPlayers } from './coreUtils';
import { playerDrawCard } from './turnEngine';

export function resolveMpTimeoutToAction(gs) {
  const phase = gs?.phase;
  if (phase === 'ACTION' || phase === 'DISCARD_PHASE') return gs;

  if (phase === 'DRAW_REVEAL') {
    const dr = gs.drawReveal;
    if (!dr?.card) return { ...gs, phase: 'ACTION', drawReveal: null };
    if (dr.needsDecision) {
      if (dr.forcedKeep) {
        let P = copyPlayers(gs.players);
        let D = [...gs.deck];
        let Disc = [...gs.discard];
        const drawerIdx = dr.drawerIdx ?? 0;
        const res = applyFx(dr.card, drawerIdx, null, P, D, Disc, gs);
        P = res.P;
        D = res.D;
        Disc = res.Disc;
        P[drawerIdx].hand.push(dr.card);
        return {
          ...gs,
          players: P,
          deck: D,
          discard: Disc,
          log: [
            ...gs.log,
            `(超时) ${dr.drawerName || '该玩家'}被迫收入 ${cardLogText(dr.card, { alwaysShowName: true })}`,
            ...res.msgs,
          ],
          phase: 'ACTION',
          drawReveal: null,
          abilityData: {},
          ...(res.statePatch || {}),
        };
      }
      return {
        ...gs,
        discard: [...gs.discard, dr.card],
        log: [...gs.log, `(超时) ${dr.drawerName || '该玩家'}弃置了 ${cardLogText(dr.card, { alwaysShowName: true })}`],
        phase: 'ACTION',
        drawReveal: null,
        abilityData: {},
      };
    }
    return { ...gs, phase: 'ACTION', drawReveal: null };
  }

  if (phase === 'GOD_CHOICE') {
    const godCard = gs.abilityData?.godCard;
    if (!godCard) return { ...gs, phase: 'ACTION', abilityData: {} };
    return {
      ...gs,
      discard: [...gs.discard, { ...godCard }],
      log: [...gs.log, '(超时) 放弃了邪神的馈赠'],
      phase: 'ACTION',
      abilityData: {},
    };
  }

  if (phase === 'NYA_BORROW') {
    let P = copyPlayers(gs.players);
    let D = [...gs.deck];
    let Disc = [...gs.discard];
    const res = playerDrawCard(P, D, Disc, 0, gs);
    P = res.P;
    D = res.D;
    Disc = res.Disc;
    const L = [...gs.log, '(超时) 跳过借身'];
    if (res.needGodChoice) {
      Disc.push({ ...res.drawnCard });
      return { ...gs, players: P, deck: D, discard: Disc, log: [...L, '(超时) 放弃了邪神的馈赠'], phase: 'ACTION', abilityData: {} };
    }
    if (res.needsDecision) {
      return {
        ...gs,
        players: P,
        deck: D,
        discard: [...Disc, res.drawnCard],
        log: [...L, `(超时) 弃置了 ${cardLogText(res.drawnCard, { alwaysShowName: true })}`],
        phase: 'ACTION',
        drawReveal: null,
        abilityData: {},
      };
    }
    return {
      ...gs,
      players: P,
      deck: D,
      discard: Disc,
      log: [...L, ...res.effectMsgs],
      phase: 'ACTION',
      drawReveal: res.drawnCard ? { card: res.drawnCard, msgs: res.effectMsgs, needsDecision: false } : null,
      abilityData: {},
    };
  }

  return gs;
}
