function legacyLinkId(players, playerIdx, link) {
  const partnerIdx = link?.partner;
  const a = Math.min(playerIdx, partnerIdx);
  const b = Math.max(playerIdx, partnerIdx);
  const expiry = link?.expiryOwner ?? link?.expiryTurn ?? 'x';
  return `legacy:${a}:${b}:${expiry}`;
}

function rawPlayerLinks(players, playerIdx) {
  const player = players?.[playerIdx];
  if (!player) return [];
  if (Array.isArray(player.damageLinks)) return player.damageLinks;
  if (player.damageLink) {
    return [{
      ...player.damageLink,
      id: player.damageLink.id || legacyLinkId(players, playerIdx, player.damageLink),
      createdSeq: player.damageLink.createdSeq ?? 0,
    }];
  }
  return [];
}

export function getPlayerDamageLinks(players, playerIdx, { activeOnly = false } = {}) {
  return rawPlayerLinks(players, playerIdx)
    .filter(link => link?.partner != null && (!activeOnly || link.active))
    .map(link => ({ ...link }));
}

export function getAllDamageLinks(players = [], { activeOnly = false, reciprocalOnly = true } = {}) {
  const seen = new Set();
  const links = [];
  players.forEach((_, playerIdx) => {
    rawPlayerLinks(players, playerIdx).forEach(link => {
      if (!link || link.partner == null || (activeOnly && !link.active)) return;
      const partnerLinks = rawPlayerLinks(players, link.partner);
      const reciprocal = partnerLinks.find(other => (
        other?.partner === playerIdx
        && (other.id || legacyLinkId(players, link.partner, other)) === link.id
        && (!activeOnly || other.active)
      ));
      if (reciprocalOnly && !reciprocal) return;
      const id = link.id || legacyLinkId(players, playerIdx, link);
      if (seen.has(id)) return;
      seen.add(id);
      links.push({
        ...link,
        id,
        a: Math.min(playerIdx, link.partner),
        b: Math.max(playerIdx, link.partner),
        sourceIdx: link.sourceIdx ?? link.expiryOwner ?? playerIdx,
        createdSeq: link.createdSeq ?? reciprocal?.createdSeq ?? 0,
      });
    });
  });
  return links.sort((a, b) => (
    (a.createdSeq ?? 0) - (b.createdSeq ?? 0)
    || String(a.id).localeCompare(String(b.id))
  ));
}

export function getActiveDamageLinksForPlayer(players, playerIdx) {
  return getAllDamageLinks(players, { activeOnly: true })
    .filter(link => link.a === playerIdx || link.b === playerIdx);
}

export function hasActiveDamageLink(players, playerIdx) {
  return getActiveDamageLinksForPlayer(players, playerIdx).length > 0;
}

export function normalizeDamageLinks(players = []) {
  const allLinks = getAllDamageLinks(players, { reciprocalOnly: true });
  players.forEach(player => {
    if (!player) return;
    player.damageLinks = [];
    delete player.damageLink;
  });
  allLinks.forEach(link => {
    const endpoint = idx => ({
      id: link.id,
      partner: idx === link.a ? link.b : link.a,
      active: !!link.active,
      expiryOwner: link.expiryOwner,
      ...(link.expiryTurn != null ? { expiryTurn: link.expiryTurn } : {}),
      sourceIdx: link.sourceIdx,
      createdSeq: link.createdSeq ?? 0,
    });
    if (players[link.a]) players[link.a].damageLinks.push(endpoint(link.a));
    if (players[link.b]) players[link.b].damageLinks.push(endpoint(link.b));
  });
  return players;
}

export function addDamageLink(players, sourceIdx, targetIdx, options = {}) {
  normalizeDamageLinks(players);
  const existing = getAllDamageLinks(players);
  const createdSeq = options.createdSeq ?? (Math.max(0, ...existing.map(link => link.createdSeq || 0)) + 1);
  const id = options.id || `damage-link:${createdSeq}:${sourceIdx}:${targetIdx}`;
  const common = {
    id,
    active: true,
    expiryOwner: options.expiryOwner ?? sourceIdx,
    sourceIdx,
    createdSeq,
  };
  players[sourceIdx].damageLinks.push({ ...common, partner: targetIdx });
  players[targetIdx].damageLinks.push({ ...common, partner: sourceIdx });
  return { ...common, a: Math.min(sourceIdx, targetIdx), b: Math.max(sourceIdx, targetIdx) };
}

export function setDamageLinkActive(players, linkId, active) {
  let changed = false;
  players.forEach((player, playerIdx) => {
    const links = rawPlayerLinks(players, playerIdx);
    links.forEach(link => {
      const effectiveId = link?.id || legacyLinkId(players, playerIdx, link);
      if (effectiveId === linkId && link.active !== active) {
        if (Array.isArray(player.damageLinks)) link.active = active;
        else if (player.damageLink) player.damageLink.active = active;
        changed = true;
      }
    });
  });
  return changed;
}

export function removeDamageLink(players, linkId) {
  normalizeDamageLinks(players);
  players.forEach(player => {
    if (!player) return;
    player.damageLinks = (player.damageLinks || []).filter(link => link.id !== linkId);
  });
}

export function removeDamageLinks(players, linkIds = []) {
  const ids = new Set(linkIds);
  if (!ids.size) return;
  normalizeDamageLinks(players);
  players.forEach(player => {
    if (!player) return;
    player.damageLinks = (player.damageLinks || []).filter(link => !ids.has(link.id));
  });
}

export function rotatePlayerDamageLinks(player, rotateIndex) {
  if (!player) return player;
  if (Array.isArray(player.damageLinks)) {
    return {
      ...player,
      damageLinks: player.damageLinks.map(link => ({
        ...link,
        partner: rotateIndex(link.partner),
        expiryOwner: rotateIndex(link.expiryOwner),
        sourceIdx: rotateIndex(link.sourceIdx),
      })),
    };
  }
  if (player.damageLink) {
    return {
      ...player,
      damageLink: {
        ...player.damageLink,
        partner: rotateIndex(player.damageLink.partner),
        expiryOwner: rotateIndex(player.damageLink.expiryOwner),
        sourceIdx: rotateIndex(player.damageLink.sourceIdx),
      },
    };
  }
  return player;
}
