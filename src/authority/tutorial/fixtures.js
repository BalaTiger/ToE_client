import { createTutorialScenario } from '../../game/tutorialScenario.js';
import { createRandomCursor } from '../../../packages/rules/src/runtime.js';
import { executeRuleResolution } from '../../../packages/rules/src/execution.js';
import { createPrivateMatch } from '../../../packages/rules/src/authority/command.js';
import { encodeOfflineSave } from '../../../packages/rules/src/offline.js';

export const TUTORIAL_CHAPTERS = Object.freeze(['treasure', 'hunter', 'cultistZone', 'cultistGod']);
// Seed 8 produces the authored six and D4 through ordinary offline randomness.
// This is a local lesson fixture, never an online setup option or a forced result.
const SEEDS = Object.freeze({ treasure: 8, hunter: 1, cultistZone: 1, cultistGod: 1 });

export function createTutorialRecord(chapter, { id = `offline:tutorial:${chapter}`, now = 0 } = {}) {
  if (!TUTORIAL_CHAPTERS.includes(chapter) || !id.startsWith('offline:tutorial:')) throw new TypeError('Invalid tutorial chapter');
  const random = createRandomCursor(SEEDS[chapter]);
  const state = executeRuleResolution({ cursor: random, now, namespace: id }, () => createTutorialScenario(chapter));
  state._intentEngine = true;
  delete state._isTutorial;
  // The first demonstrated turn starts by the opponent ending their turn.
  if (chapter === 'treasure') state.currentTurn = 1;
  const record = { ...createPrivateMatch({ id, state, random, now }), origin: 'offline' };
  encodeOfflineSave(record);
  return record;
}
