import { initGame } from './game/setup.js';
import { startNextTurn } from './game/turnEngine.js';
import { createRandomCursor } from './runtime.js';
import { executeRuleResolution } from './execution.js';
import { advanceAutomaticRules } from './authority/automatic.js';

export function initializeRules({ mode, names, seed, random: randomPort, now, namespace, expansionKey, roleCounts }) {
  if (!['offline', 'online'].includes(mode)) throw new TypeError('Unknown game host mode');
  if (mode === 'online' && typeof randomPort !== 'function') throw new TypeError('Online initialization requires host randomness');
  if (mode === 'online' && (!Array.isArray(names) || names.length < 2 || names.length > 12
    || names.some(name => typeof name !== 'string' || !name || name.length > 32))) throw new TypeError('Invalid online players');
  const random = randomPort === undefined ? createRandomCursor(seed) : null;
  const state = executeRuleResolution({ cursor: random, random: randomPort, now, namespace }, () => advanceAutomaticRules(initGame(
    mode === 'online' ? names : null, null, null, 'auto', null, null, null, null, startNextTurn, expansionKey,
    { intentDriven: true, roleCounts },
  )));
  return { state, random };
}
