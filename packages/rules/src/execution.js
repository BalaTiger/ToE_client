import { withRuleContext, nextRandom } from './runtime.js';
import { withDerivedCardIdentityScope } from './constants/card.js';
import { withVisualEventIdentityScope } from './game/visualEvents.js';
import { withStatEventIdentityScope } from './game/statEventIdentity.js';

export function executeRuleResolution({ cursor, random, now, namespace }, callback) {
  if (!Number.isFinite(now) || typeof namespace !== 'string' || !namespace) throw new TypeError('Missing rule execution context');
  if (random !== undefined && typeof random !== 'function') throw new TypeError('Invalid host random port');
  return withRuleContext({ random: random || (() => nextRandom(cursor)), now: () => now, namespace }, () => (
    withDerivedCardIdentityScope(() => withVisualEventIdentityScope(() => (
      withStatEventIdentityScope(callback, { reset: true })
    ), { reset: true }), { reset: true })
  ));
}
