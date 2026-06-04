import { statePatchStep } from './animQueueHelpers';

const DEFAULT_FINAL_FIELDS = ['players', 'discard', 'log'];

export function finalStatePatch(state, fields = DEFAULT_FINAL_FIELDS) {
  if (!state) return statePatchStep();
  const patch = {};
  fields.forEach(field => {
    if (state[field] !== undefined) patch[field] = state[field];
  });
  return statePatchStep(patch);
}

export function appendFinalStatePatch(queue, state, fields = DEFAULT_FINAL_FIELDS) {
  if (!Array.isArray(queue) || !queue.length) return queue || [];
  return [...queue, finalStatePatch(state, fields)];
}
