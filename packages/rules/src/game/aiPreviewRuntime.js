import { withDerivedCardIdentityScope } from '../constants/card.js';
import { withVisualEventIdentityScope } from './visualEvents.js';
import { withStatEventIdentityScope } from './statEventIdentity.js';
import { withRuleContext } from '../runtime.js';

// Synchronous previews have private random streams and event identities.
// Preview events and generated cards must never enter the live game.
export function runAiPreview(callback, { seed = 1 } = {}) {
  let value = Number(seed) >>> 0;
  const random = () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
  return withRuleContext({ random }, () => {
    return withDerivedCardIdentityScope(() => withVisualEventIdentityScope(() => (
      withStatEventIdentityScope(() => {
        const result = callback();
        if (result?.then) throw new TypeError('AI rule previews must be synchronous');
        return result;
      })
    )));
  });
}
