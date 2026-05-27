import { GOD_DEFS } from '../constants/card';
import { buildStatEvents } from './statEvents';
import { clamp, copyPlayers } from './coreUtils';

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

  let P = players;
  const D = deck;
  const Disc = discard;
  let L = log;
  const nextCount = (night.count || 0) + 1;
  let nextNight = { ...night, count: nextCount };
  const roll = 1 + (Math.random() * 6 | 0);
  let targetIdx = selectedIdx;
  let statPatch = {};
  const alternatives = legalTargets.filter(i => i !== selectedIdx && P[i] && !P[i].isDead);

  if (roll < night.threshold && alternatives.length) {
    targetIdx = alternatives[Math.floor(Math.random() * alternatives.length)];
    const beforePlayers = copyPlayers(P);
    P[actorIdx].san = clamp((P[actorIdx].san || 0) - 1);
    L = [...L, `【黑夜】${P[actorIdx].name} ${label}掷出 ${roll}，目标由 ${P[selectedIdx].name} 错乱为 ${P[targetIdx].name}，失去1SAN`];
    const statEventSeq = (gs?._statEventSeq || 0) + 1;
    const statEvents = buildStatEvents(beforePlayers, P, [L[L.length - 1]], { reason: '黑夜', seq: statEventSeq });
    if (statEvents.length) {
      statPatch = { _statEvents: [...(gs?._statEvents || []), ...statEvents], _statEventSeq: statEventSeq };
    }
  } else {
    L = [...L, `【黑夜】${P[actorIdx].name} ${label}掷出 ${roll}，目标未偏移`];
  }

  if (nextCount >= (night.limit || 12)) {
    nextNight = null;
    L = [...L, '【黑夜】选中目标累计12次，黑夜结束'];
  }

  return {
    players: P,
    deck: D,
    discard: Disc,
    log: L,
    targetIdx,
    apophisNight: nextNight,
    statePatch: { apophisNight: nextNight, ...statPatch },
  };
}
