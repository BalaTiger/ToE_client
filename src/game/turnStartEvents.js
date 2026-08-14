import { isBlackGoatYoung } from './coreUtils';

export const TURN_START_PRIORITY = Object.freeze({
  PASSIVE_GOD: 1,
  PASSIVE_GOD_DERIVATIVE: 2,
  PASSIVE_OTHER: 3,
  ACTIVE_GOD: 4,
  ACTIVE_OTHER: 5,
});

export const TURN_START_EVENT = Object.freeze({
  BLACK_GOAT_YOUNG_DAMAGE: 'blackGoatYoungDamage',
  POISON_DAMAGE: 'poisonDamage',
  DAMAGE_LINK_HEAL: 'damageLinkHeal',
  ZHU_LIGHT: 'zhuLight',
  NYA_BORROW: 'nyaBorrow',
});

// This registry is shared by local, multiplayer and AI turns. Registration
// order breaks ties, so damage-link healing deliberately remains after every
// currently registered turn-start damage event.
const REGISTRY = Object.freeze([
  {
    id: TURN_START_EVENT.BLACK_GOAT_YOUNG_DAMAGE,
    priority: TURN_START_PRIORITY.PASSIVE_GOD_DERIVATIVE,
    shouldRegister: ({ player }) => (player?.hand || []).some(isBlackGoatYoung),
  },
  {
    id: TURN_START_EVENT.POISON_DAMAGE,
    priority: TURN_START_PRIORITY.PASSIVE_OTHER,
    shouldRegister: ({ player }) => (player?.poisonStacks || 0) > 0,
  },
  {
    id: TURN_START_EVENT.DAMAGE_LINK_HEAL,
    priority: TURN_START_PRIORITY.PASSIVE_OTHER,
    shouldRegister: ({ pendingLinkHeals }) => pendingLinkHeals.length > 0,
  },
  {
    id: TURN_START_EVENT.ZHU_LIGHT,
    priority: TURN_START_PRIORITY.ACTIVE_GOD,
    shouldRegister: ({ player }) => player?.godName === 'ZHU' && (player?.godLevel || 0) > 0,
  },
  {
    id: TURN_START_EVENT.NYA_BORROW,
    priority: TURN_START_PRIORITY.ACTIVE_GOD,
    shouldRegister: ({ player }) => player?.godName === 'NYA' && (player?.godLevel || 0) > 0,
  },
]);

export function getTurnStartEvents(players = [], actorIndex = 0, { pendingLinkHeals = [] } = {}) {
  const context = { player: players[actorIndex], pendingLinkHeals };
  return REGISTRY
    .map((entry, registrationOrder) => ({ ...entry, registrationOrder }))
    .filter(entry => entry.shouldRegister(context))
    .map(entry => {
      const event = { ...entry };
      delete event.shouldRegister;
      return event;
    })
    .sort((a, b) => a.priority - b.priority || a.registrationOrder - b.registrationOrder);
}
