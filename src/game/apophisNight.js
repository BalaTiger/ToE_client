import { GOD_DEFS } from '../constants/card';
import { buildStatEvents } from './statEvents';
import { copyPlayers, formatSanLoss, makeInspectionMeta } from './coreUtils';
import { applyInspectionForSanLoss, submitDamageEvents } from './effectEngine';
import { hasGodPowerImmunity } from './godPowerImmunity';
import { createApophisTargetVisualEvent } from './visualEvents';

export function getApophisNightForLevel(level = 1) {
  const idx = Math.max(0, Math.min(2, (level || 1) - 1));
  const threshold = GOD_DEFS.APO?.levels?.[idx]?.nightThreshold || 2;
  return { active: true, threshold, count: 0, limit: 12 };
}

export function buildApophisNightLog() {
  return '【噬日灭世】黑夜降临，选中目标累计12次后结束';
}

export function resolveApophisTarget({
  gs,
  players,
  deck,
  discard,
  log,
  actorIdx,
  selectedIdx,
  legalTargets,
  label = '选中目标',
}) {
  const night = gs?.apophisNight;
  if (!night?.active || actorIdx == null || selectedIdx == null || !Array.isArray(legalTargets) || !legalTargets.includes(selectedIdx)) {
    return { players, deck, discard, log, targetIdx: selectedIdx, apophisNight: night, statePatch: { apophisNight: night } };
  }
  if (hasGodPowerImmunity(players?.[actorIdx])) {
    return { players, deck, discard, log, targetIdx: selectedIdx, apophisNight: night, statePatch: { apophisNight: night } };
  }

  let P = players;
  let D = deck;
  let Disc = discard;
  let L = log;
  const nextCount = (night.count || 0) + 1;
  let nextNight = { ...night, count: nextCount };
  const roll = 1 + (Math.random() * 6 | 0);
  let targetIdx = selectedIdx;
  let statPatch = {};
  let statSeq = null;
  let inspectionPatch = {};
  let playersAfterNightSan = null;
  const alternatives = legalTargets.filter(i => i !== selectedIdx && P[i] && !P[i].isDead);
  const eventSeq = (gs?._apophisTargetSeq || 0) + 1;
  let eventLog = '';

  if (roll <= night.threshold && alternatives.length) {
    targetIdx = alternatives[Math.floor(Math.random() * alternatives.length)];
    const beforePlayers = copyPlayers(P);
    const damage = submitDamageEvents({
      players: P, deck: D, discard: Disc, log: L, currentTurn: gs?.currentTurn ?? actorIdx,
      events: [{ targetIdx: actorIdx, lostSan: 1, source: '黑夜' }],
    });
    eventLog = `【黑夜】${P[actorIdx].name} ${label}掷出 ${roll}，目标由 ${P[selectedIdx].name} 错乱为 ${P[targetIdx].name}，${formatSanLoss(1)}`;
    L = [...L, eventLog];
    const statEventSeq = (gs?._statEventSeq || 0) + 1;
    statSeq = statEventSeq;
    const statEvents = buildStatEvents(beforePlayers, P, [L[L.length - 1]], { reason: '黑夜', seq: statEventSeq });
    if (statEvents.length) {
      statPatch = { _statEvents: [...(gs?._statEvents || []), ...statEvents], _statEventSeq: statEventSeq };
    }
    playersAfterNightSan = copyPlayers(P);
    let inspectionMeta = {
      ...makeInspectionMeta(gs),
      ...statPatch,
    };
    if (damage.abilityData) {
      inspectionMeta = {
        ...inspectionMeta,
        abilityData: {
          ...damage.abilityData,
          ...(damage.phase === 'TSG_SLIME_BALANCE' ? {
            pendingSanInspection: {
              targetIndex: actorIdx,
              startIndex: gs?.currentTurn ?? actorIdx,
              reason: '黑夜',
            },
          } : {}),
        },
        ...(damage.phase ? { phase: damage.phase } : {}),
      };
    } else {
      const inspected = applyInspectionForSanLoss(
        actorIdx,
        P[actorIdx]?.san,
        gs?.currentTurn ?? actorIdx,
        P,
        D,
        Disc,
        L,
        inspectionMeta,
      );
      P = inspected.P;
      D = inspected.D;
      Disc = inspected.Disc;
      L = inspected.log;
      inspectionMeta = inspected.inspectionMeta;
    }
    inspectionPatch = inspectionMeta;
    statPatch = {
      _statEvents: inspectionMeta._statEvents || statPatch._statEvents || [],
      _statEventSeq: inspectionMeta._statEventSeq ?? statPatch._statEventSeq ?? (gs?._statEventSeq || 0),
      ...(inspectionMeta.abilityData ? { abilityData: inspectionMeta.abilityData } : {}),
      ...(inspectionMeta.phase ? { phase: inspectionMeta.phase } : {}),
    };
  } else {
    eventLog = `【黑夜】${P[actorIdx].name} ${label}掷出 ${roll}，目标未偏移`;
    L = [...L, eventLog];
  }

  if (nextCount >= (night.limit || 12)) {
    nextNight = null;
    L = [...L, '【黑夜】选中目标累计12次，黑夜结束'];
  }

  const apophisTargetEvent = {
    seq: eventSeq,
    actorIdx,
    actorName: P[actorIdx]?.name || '',
    selectedIdx,
    selectedName: P[selectedIdx]?.name || '',
    targetIdx,
    targetName: P[targetIdx]?.name || '',
    roll,
    threshold: night.threshold,
    changed: targetIdx !== selectedIdx,
    label,
    log: eventLog,
    apophisNight: nextNight,
    statSeq,
  };
  const apophisVisualEvent = createApophisTargetVisualEvent(apophisTargetEvent, {
    playersAfter: playersAfterNightSan || P,
    statEvents: statPatch._statEvents?.filter(event => event?.seq === statSeq) || [],
  });
  const priorVisualEvents = gs?._visualEvents || [];
  const inspectionVisualEvents = (inspectionPatch._visualEvents || []).slice(priorVisualEvents.length);
  return {
    players: P,
    deck: D,
    discard: Disc,
    log: L,
    targetIdx,
    apophisNight: nextNight,
    apophisTargetEvent,
    statePatch: {
      apophisNight: nextNight,
      _apophisTargetSeq: eventSeq,
      _apophisTargetEvent: apophisTargetEvent,
      ...inspectionPatch,
      ...statPatch,
      _visualEvents: [
        ...priorVisualEvents,
        ...(apophisVisualEvent ? [apophisVisualEvent] : []),
        ...inspectionVisualEvents,
      ],
    },
  };
}
