import { createSeatMapping } from './model.js';

const schemas = {};
function define(types, keys) { for (const type of types.split(' ')) schemas[type] = Object.freeze(keys); }
define('skill.begin skill.cancel multiply.begin swap.takeBlind draw.keep draw.discard turn.end turn.rest', []);
define('slime.answer etherealize.answer treasureDodge.reply sphinx.dodge', ['use']);
define('zhu.hide zhu.hideSphinx', ['hide']);
define('sphinx.guess', ['isZone']);
define('etherealize.redirect multiply.selectTarget caveDuel.selectTarget peek.selectTarget shu.selectTarget zoneSwap.selectTarget damageLink.selectTarget roseThorn.selectTarget nya.borrow swap.selectTarget hunt.selectTarget bewitch.selectTarget', ['targetSeat']);
define('publicPick.choose caveDuel.commit god.useHand grave.choose torch.discard albino.reveal bury.commit swap.takeVisible swap.give hunt.reveal hunt.attack bewitch.chooseCard', ['cardIndex']);
define('turn.discard hunt.loot', ['cardIndices']);
define('sameAbyss.choose god.choose', ['choice']);
define('tortoise.choose', ['key']);
define('stone.arrange', ['handIndex', 'topIndices', 'bottomIndices']);
export const AUTHORITY_PRESENTATION_COMMANDS = Object.freeze(schemas);
const reject = code => { const error = new Error(code); error.code = code; throw error; };
const uniqueIndices = (indices, legal) => Array.isArray(indices) && new Set(indices).size === indices.length
  && indices.every(index => Number.isSafeInteger(index) && legal?.includes(index));

export function createAuthorityCommandDispatcher({ getView, submit: send }) {
  if (typeof getView !== 'function' || typeof send !== 'function') throw new TypeError('Missing authority command ports');
  function submit(type, payload = {}, { decisionId } = {}) {
    const view = getView();
    if (!view || view.viewerSeat === null || view.gameOver || view.status?.paused
      || view.players?.find((player, index) => (player.seat ?? index) === view.viewerSeat)?.isDead) reject('authority_read_only');
    const action = view.decision?.actions.find(item => item.type === type);
    if (!action) reject('authority_action_unavailable');
    if (decisionId !== undefined && decisionId !== view.decision.id) reject('stale_presentation_decision');
    const keys = AUTHORITY_PRESENTATION_COMMANDS[type];
    if (!keys) reject('unsupported_presentation_action');
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(payload))
      || Object.keys(payload).length !== keys.length || keys.some(key => !Object.hasOwn(payload, key))) reject('invalid_presentation_payload');
    for (const key of keys) {
      const value = payload[key];
      if (key === 'targetSeat') {
        if (!(value === null && action.allowSkip) && !(action.targetSeats || action.targets || []).includes(value)) reject('invalid_presentation_target');
      } else if (key === 'cardIndex') {
        if (!(value === null && action.allowAbandon) && !action.cardIndices?.includes(value)) reject('invalid_presentation_card');
      } else if (key === 'cardIndices') {
        if (!uniqueIndices(value, action.cardIndices) || value.length !== action.count) reject('invalid_presentation_cards');
      } else if (key === 'choice' && !action.choices?.includes(value)) reject('invalid_presentation_choice');
      else if (key === 'key' && !action.keys?.includes(value)) reject('invalid_presentation_choice');
      else if (['use', 'hide', 'isZone'].includes(key)
        && (typeof value !== 'boolean' || action.choices && !action.choices.includes(value))) reject('invalid_presentation_choice');
    }
    if (type === 'stone.arrange') {
      const { handIndex, topIndices, bottomIndices } = payload;
      if (!Array.isArray(topIndices) || !Array.isArray(bottomIndices)
        || !uniqueIndices([handIndex, ...topIndices, ...bottomIndices], action.cardIndices)
        || 1 + topIndices.length + bottomIndices.length !== action.cardIndices.length) reject('invalid_presentation_arrangement');
    }
    // Semantic choices only. The session owns revision/action IDs and retry identity.
    return send(type, structuredClone(payload));
  }
  const target = (type, displaySeat, options) => {
    const view = getView();
    if (!view) reject('authority_read_only');
    const seat = displaySeat === null ? null : createSeatMapping(view).toServerSeat(displaySeat);
    if (seat === null && displaySeat !== null) reject('invalid_presentation_target');
    return submit(type, { targetSeat: seat }, options);
  };
  const dispatcher = {
    submit, target,
    card: (type, cardIndex, options) => submit(type, { cardIndex }, options),
    cards: (type, cardIndices, options) => submit(type, { cardIndices }, options),
    choice: (type, choice, options) => submit(type, { choice }, options),
    boolean: (type, value, options) => {
      const key = AUTHORITY_PRESENTATION_COMMANDS[type]?.[0];
      if (!['use', 'hide', 'isZone'].includes(key)) reject('invalid_presentation_boolean_action');
      return submit(type, { [key]: value }, options);
    },
  };
  dispatcher.callbacks = {
    keepDraw: () => submit('draw.keep'), discardDraw: () => submit('draw.discard'),
    useAbility: () => submit('skill.begin'), doRest: () => submit('turn.rest'),
    endTurn: () => submit('turn.end'), cancelAction: () => submit('skill.cancel'),
    multiply: () => submit('multiply.begin'), useGodCard: cardIndex => submit('god.useHand', { cardIndex }),
  };
  return Object.freeze(dispatcher);
}
