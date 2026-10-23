const list = value => Array.isArray(value) ? value : [];

/** Stable ordering of explicit canonical cue edges, inside fixed stat slots.
 * The slots are facts supplied by stat identities, not a type-priority table.
 * A bad producer must not silently put a consequence before its cause.
 */
export function orderPresentationEntries(entries) {
  const byId = new Map(entries.map((entry, index) => [entry.sourceEventId, index]));
  const outgoing = entries.map(() => new Set()), incoming = entries.map(() => 0);
  const edge = (from, to) => {
    if (from === undefined || to === undefined || from === to) return;
    if (entries[from].slot > entries[to].slot) throw new TypeError('Conflicting presentation stat/cue order');
    if (entries[from].slot !== entries[to].slot || outgoing[from].has(to)) return;
    outgoing[from].add(to); incoming[to] += 1;
  };
  entries.forEach((entry, index) => {
    list(entry.beforeEventIds).forEach(id => edge(index, byId.get(id)));
    list(entry.afterEventIds).forEach(id => edge(byId.get(id), index));
  });
  const remaining = new Set(entries.map((_, index) => index)), result = [];
  while (remaining.size) {
    const next = [...remaining].find(index => incoming[index] === 0);
    if (next === undefined) throw new TypeError('Cyclic presentation cue order');
    remaining.delete(next); result.push(entries[next]);
    outgoing[next].forEach(index => { incoming[index] -= 1; });
  }
  return result;
}
