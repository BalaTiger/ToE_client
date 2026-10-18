// Synchronous rule host ports. A server transaction supplies its own private
// random stream and clock; previews nest a separate stream without changing
// JavaScript globals or consuming the enclosing match's randomness.
let current = null;
export function withRuleContext(ports, callback) {
  if (typeof callback !== 'function' || callback.constructor?.name === 'AsyncFunction') {
    throw new TypeError('Rule resolutions must be synchronous');
  }
  const previous = current;
  current = { ...previous, ...ports };
  try {
    const result = callback();
    if (result?.then) throw new TypeError('Rule resolutions must not return a promise');
    return result;
  } finally { current = previous; }
}
export function ruleRandom() {
  const value = (current?.random || Math.random)();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Invalid rule random value');
  return value;
}
export function ruleNow() { return (current?.now || Date.now)(); }
export function ruleNamespace(fallback = 'local') { return current?.namespace || fallback; }
export function ruleScopedId(kind, sequence) {
  return `${kind}-${current?.namespace ? `${current.namespace}-` : ''}${sequence}`;
}

// Serializable deterministic cursor for offline saves and rule fixtures.
// Online hosts supply a CSPRNG port instead and retain no replayable cursor.
export function createRandomCursor(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new TypeError('Expected uint32 seed');
  return { algorithm: 'mulberry32-v1', value: seed >>> 0, draws: 0 };
}
export function nextRandom(cursor) {
  if (cursor?.algorithm !== 'mulberry32-v1' || !Number.isInteger(cursor.value)
    || cursor.value < 0 || cursor.value > 0xffffffff || !Number.isSafeInteger(cursor.draws) || cursor.draws < 0) {
    throw new TypeError('Invalid random cursor');
  }
  cursor.value = (cursor.value + 0x6D2B79F5) >>> 0;
  cursor.draws += 1;
  let mixed = Math.imul(cursor.value ^ (cursor.value >>> 15), cursor.value | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
}
