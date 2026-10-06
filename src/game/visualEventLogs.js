// A message belongs to an event, not to a position in the mutable state.log.
// Occurrence indices preserve two identical messages within one event while
// keeping their identity stable when its animation is split or replayed.
export function createVisualLogEntries(ownerId, msgs = []) {
  const occurrences = new Map();
  return (Array.isArray(msgs) ? msgs : []).filter(msg => typeof msg === 'string' && msg.length).map(text => {
    const occurrence = occurrences.get(text) || 0;
    occurrences.set(text, occurrence + 1);
    return { id: JSON.stringify([ownerId, text, occurrence]), text };
  });
}

// Project authored occurrence identities onto one animation step. Shared
// projections keep their identities; unmatched reactions keep their owner.
export function selectVisualLogEntries(ownerId, msgs = [], entries = []) {
  const byText = new Map();
  for (const entry of entries || []) {
    if (!entry?.id || typeof entry.text !== 'string') continue;
    const matches = byText.get(entry.text) || [];
    matches.push(entry);
    byText.set(entry.text, matches);
  }
  const occurrences = new Map();
  return createVisualLogEntries(ownerId, msgs).map(entry => {
    const occurrence = occurrences.get(entry.text) || 0;
    occurrences.set(entry.text, occurrence + 1);
    return byText.get(entry.text)?.[occurrence] || entry;
  });
}

export function consumeVisualLogEntries(entries, consumedIds) {
  const fresh = [];
  for (const entry of entries || []) {
    if (!entry?.id || typeof entry.text !== 'string' || consumedIds.has(entry.id)) continue;
    consumedIds.add(entry.id);
    fresh.push(entry.text);
  }
  return fresh;
}
