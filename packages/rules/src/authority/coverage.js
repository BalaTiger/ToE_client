import { reactionActions } from './reactions.js';
import { publicChoiceActions } from './publicChoices.js';
import { drawActions } from './draw.js';
import { turnActions } from './turn.js';
import { privateChoiceActions } from './privateChoices.js';
import { targetActions } from './targets.js';
import { godActions } from './gods.js';
import { zhuActions } from './zhu.js';
import { sphinxActions } from './sphinx.js';
import { cardChoiceActions } from './cardChoices.js';
import { buryActions } from './bury.js';
import { skillActions } from './skills.js';
import { huntActions } from './hunt.js';
import { bewitchActions } from './bewitch.js';

export const migratedActions = Object.freeze({ ...reactionActions, ...publicChoiceActions, ...drawActions, ...turnActions, ...privateChoiceActions, ...targetActions, ...godActions, ...zhuActions, ...sphinxActions, ...cardChoiceActions, ...buryActions, ...skillActions, ...huntActions, ...bewitchActions });
export const migrationCoverage = Object.freeze({
  protocolVersion: 2,
  complete: true,
  mainMultiplayerSwitched: true,
  phases: Object.freeze(Object.entries(migratedActions).reduce((phases, [type, action]) => {
    for (const phase of action.phases) (phases[phase] ||= []).push(type);
    return phases;
  }, {})),
  retiredPhases: {
    AI_TURN: 'AI uses the same decision phases and validated intents as humans.',
    AI_GOD_CHOICE: 'God decisions use GOD_CHOICE for every seat.',
    PLAYER_REVEAL_FOR_HUNT: 'All hunt targets use HUNT_WAIT_REVEAL.',
    DRAW_SELECT_TARGET: 'Skill and card targets have explicit action-specific phases.',
    CAVE_DUEL_WAIT_REVEAL: 'Both sealed submissions settle atomically; public event owns presentation only.',
    ANIMATION_QUEUE_PHASE: 'Presentation never owns canonical rule progress.',
    PLAYER_WIN_PENDING: 'The host commits the final outcome before animation.',
    GOD_RESURRECTION: 'Inspection resurrection is a committed terminal outcome; presentation is local.',
  },
  pendingFamilies: [],
});
