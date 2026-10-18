import { writeFile } from 'node:fs/promises';
import { FIXED_ZONE_CARD_VARIANTS_BY_KEY, GOD_DEFS, INSPECTION_DECK, createBlackGoatYoungCard, createTsathogguaSlimeCard, createGeomagneticRestoreCard } from '../packages/rules/src/constants/card.js';
import { createPrivateMatch, resolveCommand } from '../packages/rules/src/authority/command.js';
import { migratedActions, migrationCoverage } from '../packages/rules/src/authority/coverage.js';
import { projectMatch } from '../packages/rules/src/authority/view.js';
import { chooseAiIntent } from '../packages/rules/src/authority/policies.js';
import { executeRuleResolution } from '../packages/rules/src/execution.js';
const rows = [], failures = [];
let caseId = 0;
const zone = (id, slot = 'A1', extra = {}) => ({ id, name: 'fixture fire 火', isZone: true, key: slot, letter: slot[0],
  number: Number(slot[1]), type: 'selfHealHP', val: 0, ...extra });
const god = (id, key) => ({ ...GOD_DEFS[key], id, key, godKey: key, isGod: true, type: 'god' });
function recordFor(card, edge) {
  const id = `catalog:${++caseId}`;
  const players = ['邪祀者', '寻宝者', '追猎者', '邪祀者', '追猎者'].map((role, seat) => ({
    id: seat, name: `P${seat}`, role: edge && seat === 0 ? '寻宝者' : role, hp: 8, san: 8, isDead: edge && seat === 4,
    hand: [zone(`${id}:h${seat}:a`), zone(`${id}:h${seat}:b`, 'B2'), zone(`${id}:h${seat}:c`, 'C3')],
    godName: null, godLevel: 0, godZone: [], zoneCards: [], peekMemories: {}, godEncounters: 0, roleRevealed: false,
  }));
  if (edge) { players[4].hp = 0; players[4].hand = []; players[1].revealHand = true; }
  return createPrivateMatch({ id, seed: caseId, now: 0, state: { _isMP: true, _intentEngine: true,
    phase: card.isGod ? 'GOD_CHOICE' : 'DRAW_REVEAL', currentTurn: 0, turn: 1, _turnKey: 1, players,
    deck: Array.from({ length: 20 }, (_value, index) => index % 4 === 0 ? god(`${id}:deck${index}`, 'CTH')
      : zone(`${id}:deck${index}`, ['A1', 'B2', 'C3', 'D4'][index % 4])),
    discard: [god(`${id}:discard-god`, 'NYA'), zone(`${id}:discard-zone`, 'D4')],
    inspectionDeck: structuredClone(INSPECTION_DECK), inspectionDiscard: [], log: [], gameOver: null,
    ...(card.isGod ? { drawReveal: null, abilityData: { godCard: card, drawerIdx: 0 } }
      : { drawReveal: { card, drawerIdx: 0, needsDecision: true, forcedKeep: !!card.forced }, abilityData: {} }),
  } });
}
function apply(record, seat, type, payload, index) {
  return resolveCommand(record, { permission: 'player', seat }, { version: 2, matchId: record.id,
    revision: record.revision, decisionId: record.decision.id, actionId: `catalog:${index}`, type, payload },
  { now: index + 1, actions: migratedActions, source: 'offline' }).match;
}
function runCard(card, edge, initialIntent = null, prepare = null, group = 'catalog', expectedPhysical = 1) {
  let record = recordFor(card, edge), commands = 0;
  if (prepare) prepare(record);
  const phases = new Set([record.state.phase]), intents = [];
  try {
    record = apply(record, 0, initialIntent?.type || (card.isGod ? 'god.choose' : 'draw.keep'), initialIntent?.payload || (card.isGod ? { choice: 'worship' } : {}), commands++);
    for (; commands < 100; commands++) {
      phases.add(record.state.phase);
      if (record.state.gameOver || record.state.phase === 'ACTION') break;
      let view;
      for (let seat = 0; seat < record.state.players.length; seat++) {
        const candidate = projectMatch(record, { permission: 'player', seat }, { actions: migratedActions, handleForCard: (viewer, id) => `${viewer}:${id}` });
        if (candidate.decision.actions.length) { view = candidate; break; }
      }
      if (!view) throw new Error(`No owned action for ${record.state.phase}`);
      const draft = structuredClone(record);
      const intent = executeRuleResolution({ cursor: draft.random, now: commands, namespace: `${record.id}:policy:${commands}` }, () => chooseAiIntent(view));
      if (!intent) throw new Error(`No projected policy for ${record.state.phase}`);
      intents.push(intent.type); record = apply(draft, view.viewerSeat, intent.type, intent.payload, commands);
    }
    if (commands >= 100) throw new Error('Bounded before settling');
    const physical = [...record.state.deck, ...record.state.discard, ...record.state.players.flatMap(player => [...player.hand, ...(player.godZone || [])])]
      .filter(item => item.id === card.id).length;
    if (physical !== expectedPhysical) throw new Error(`Source card physical locations: ${physical}, expected ${expectedPhysical}`);
    rows.push({ group, card: card.name, type: card.type, key: card.key, expansion: card.expansion || 'god', edge, phases: [...phases], intents, commands, physical, supported: true });
  } catch (error) {
    const failure = { group, card: card.name, type: card.type, key: card.key, expansion: card.expansion || 'god', edge,
      phases: [...phases], phase: record.state.phase, commands, error: error.code || error.message };
    rows.push({ ...failure, supported: false }); failures.push(failure);
  }
}
for (const [slot, definitions] of Object.entries(FIXED_ZONE_CARD_VARIANTS_BY_KEY)) for (const [variant, definition] of definitions.entries()) {
  for (const edge of [false, true]) runCard({ ...definition, id: `catalog-card:${slot}:${variant}:${edge}`, key: slot,
    letter: slot[0], number: Number(slot[1]), isZone: true }, edge);
}
for (const key of Object.keys(GOD_DEFS)) for (const edge of [false, true]) runCard(god(`catalog-god:${key}:${edge}`, key), edge);
for (const key of Object.keys(GOD_DEFS)) for (const level of [1, 2]) runCard(god(`catalog-upgrade:${key}:${level}`, key), false,
  { type: 'god.choose', payload: { choice: 'upgrade' } }, record => {
    Object.assign(record.state.players[0], { godName: key, godLevel: level,
      godZone: Array.from({ length: level }, (_value, index) => god(`prior-faith:${key}:${index}`, key)) });
  }, 'god-upgrade');
for (const inspection of INSPECTION_DECK) runCard(zone(`inspection-source:${inspection.effect}`, 'A4', { type: 'selfDamageSAN', val: 2,
  name: `Inspection fixture: ${inspection.effect}` }), false, null, record => {
    record.state.inspectionDeck = [structuredClone(inspection)];
    record.state.sealLooseningCount = inspection.effect === 'sealLoosening' ? 1 : 0;
  }, 'inspection');
for (const create of [createBlackGoatYoungCard, createTsathogguaSlimeCard, createGeomagneticRestoreCard]) {
  const card = create();
  runCard(card, false, { type: 'turn.discard', payload: { cardIndices: [3] } }, record => {
    record.state.phase = 'DISCARD_PHASE'; record.state.drawReveal = null; record.state.abilityData = {};
    record.state.players[0].hand.push(card); record.state.players[0].handLimitDecrease = 1;
  }, 'derived-discard', 0);
}
const result = { note: 'Programmatic server-core catalog exercise using projected automated choices; not GUI proof or exhaustive interaction parity.',
  cards: Object.values(FIXED_ZONE_CARD_VARIANTS_BY_KEY).flat().length, gods: Object.keys(GOD_DEFS).length,
  actionRegistry: Object.keys(migratedActions), phaseCoverage: migrationCoverage, rows, failures };
await writeFile(new URL('../../security-audit/rule-catalog.json', import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ rows: rows.length, supported: rows.filter(row => row.supported).length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
