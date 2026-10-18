import { createRandomCursor, nextRandom } from '../packages/rules/src/runtime.js';
import assert from 'node:assert/strict';
import { writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { FIXED_ZONE_CARD_VARIANTS_BY_KEY, GOD_DEFS, INSPECTION_DECK, createTsathogguaSlimeCard } from '../packages/rules/src/constants/card.js';
import { createPrivateMatch, resolveCommand } from '../packages/rules/src/authority/command.js';
import { migratedActions, migrationCoverage } from '../packages/rules/src/authority/coverage.js';
import { projectMatch } from '../packages/rules/src/authority/view.js';
import { chooseAiIntent } from '../packages/rules/src/authority/policies.js';
import { executeRuleResolution } from '../packages/rules/src/execution.js';
const rows = [], failures = [];
const properties={commands:0,duplicate:0,stale:0,observer:0,extraState:0,targetBranches:0,resources:0,projections:0};
let lastStep=null;
let caseId = 0;
let currentSettings=null;
const zone = (id, slot = 'A1', extra = {}) => ({ id, name: 'fixture fire 火', isZone: true, key: slot, letter: slot[0],
  number: Number(slot[1]), type: 'selfHealHP', val: 0, ...extra });
const god = (id, key) => ({ ...GOD_DEFS[key], id, key, godKey: key, isGod: true, type: 'god' });
function recordFor(card, edge) {
  const id = `catalog:${++caseId}`;
  const players = ['邪祀者', '寻宝者', '追猎者', '邪祀者', '追猎者'].map((role, seat) => ({
    id: seat, name: `P${seat}`, role: (edge & 1) && seat === 0 ? '寻宝者' : role, hp: 8, san: 8, isDead: !!(edge & 4) && seat === 4,
    hand: [zone(`${id}:h${seat}:a`), zone(`${id}:h${seat}:b`, 'B2'), zone(`${id}:h${seat}:c`, 'C3')],
    godName: null, godLevel: 0, godZone: [], zoneCards: [], peekMemories: {}, godEncounters: 0, roleRevealed: false,
  }));
  if(edge & 4){players[4].hp=0;players[4].hand=[];}
  players[1].revealHand=!!(edge & 2);
  if(currentSettings){
   players[0].hp=currentSettings.hp;players[0].san=currentSettings.san;
   if(currentSettings.god){players[1].godName=currentSettings.god;players[1].godLevel=1;players[1].godZone=[god(id+':faith',currentSettings.god)];}
   if(currentSettings.god==='TSG')players[1].hand.push(createTsathogguaSlimeCard());
  }
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
 const command={version:2,matchId:record.id,revision:record.revision,decisionId:record.decision.id,actionId:'bounded:'+index,type,payload};
 const options={now:index+1,actions:migratedActions,source:'offline'},before=structuredClone(record);
 lastStep={record:before,seat,command,options:{now:index+1,source:'offline'}};
 for(const [field,bad] of [['decisionId','expired-window'],['gs',{}]]) {
  assert.throws(()=>resolveCommand(record,{permission:'player',seat},{...command,[field]:bad},options));
  assert.deepEqual(record,before);properties[field==='gs'?'extraState':'stale']++;
 }
 assert.throws(()=>resolveCommand(record,{permission:'observer'},command,options),{code:'read_only'});properties.observer++;
 const desc=migratedActions[type].describe?.(record.state,seat)||{};
 if(Array.isArray(desc.targetSeats)&&Object.hasOwn(payload,'targetSeat'))for(const targetSeat of [-1,...record.state.players.map((_p,i)=>i),record.state.players.length]){
  const branch={...command,payload:{...payload,targetSeat}};
  if(desc.targetSeats.includes(targetSeat)) resolveCommand(record,{permission:'player',seat},branch,options);
  else assert.throws(()=>resolveCommand(record,{permission:'player',seat},branch,options));
  assert.deepEqual(record,before);properties.targetBranches++;
 }
 const result=resolveCommand(record,{permission:'player',seat},command,options),next=result.match;
 const duplicate=resolveCommand(next,{permission:'player',seat},command,options);
 assert.equal(duplicate.match,next);assert.equal(duplicate.acknowledgement.duplicate,true);properties.duplicate++;
 for(const player of next.state.players){assert.ok(Number.isFinite(player.hp)&&player.hp>=0&&player.hp<=10,'HP bounds');assert.ok(Number.isFinite(player.san)&&player.san>=0&&player.san<=10,'SAN bounds');properties.resources++;}
 const physical=[...next.state.deck,...next.state.discard,...next.state.players.flatMap(p=>[...p.hand,...(p.godZone||[])])];
 const ids=physical.map(card=>card.id);assert.equal(new Set(ids).size,ids.length,'Duplicate physical card id');
 for(const viewer of [null,...next.state.players.map((_p,i)=>i)]){
  const view=projectMatch(next,viewer===null?{permission:'observer'}:{permission:'player',seat:viewer},{actions:migratedActions,handleForCard:(v,id)=>'opaque:'+v+':'+id});
  for(const key of ['random','seed','deck','log','abilityData','_visualEvents'])assert.equal(Object.hasOwn(view,key),false);
  properties.projections++;
 }
 properties.commands++;return next;
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
    const failure = { minimalStep: lastStep, group, card: card.name, type: card.type, key: card.key, expansion: card.expansion || 'god', edge,
      phases: [...phases], phase: record.state.phase, commands, error: error.code || error.message };
    rows.push({ ...failure, supported: false }); failures.push(failure);
  }
}
const selection=createRandomCursor(9501),pick=items=>items[Math.floor(nextRandom(selection)*items.length)];
const variants=Object.entries(FIXED_ZONE_CARD_VARIANTS_BY_KEY).flatMap(([slot,defs])=>defs.map(def=>({slot,def})));
for(let index=0;index<96;index++){
 const {slot,def}=pick(variants);currentSettings={seed:9501,sample:index,hp:pick([1,2,6,10]),san:pick([1,2,6,10]),god:pick([null,'TSG','VRI'])};
 runCard({...def,id:'sample-card:'+index,key:slot,letter:slot[0],number:Number(slot[1]),isZone:true},pick([0,1,2,3,4,5,6,7]));
 rows.at(-1).sampleSettings={...currentSettings};
}
const result = { properties, domain: { samples:96, selectionSeed:9501, hp:[1,2,6,10], san:[1,2,6,10], targetGod:[null,"TSG","VRI"], maxCommandsPerCase:100, targetBranches:'every described target plus -1 and player count' }, note: 'Programmatic server-core catalog exercise using projected automated choices; not GUI proof or exhaustive interaction parity.',
  cards: Object.values(FIXED_ZONE_CARD_VARIANTS_BY_KEY).flat().length, gods: Object.keys(GOD_DEFS).length,
  actionRegistry: Object.keys(migratedActions), phaseCoverage: migrationCoverage, rows, failures };
const evidenceDir=process.env.TOE_TEST_EVIDENCE_DIR || await mkdtemp(path.join(tmpdir(),'toe-card-samples-'));
await mkdir(evidenceDir,{recursive:true});
await writeFile(new URL('rare-card-samples.json',pathToFileURL(path.resolve(evidenceDir)+path.sep)), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ properties, rows: rows.length, supported: rows.filter(row => row.supported).length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
