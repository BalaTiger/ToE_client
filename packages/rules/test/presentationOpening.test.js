import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { projectMatch } from '../src/authority/view.js';
import { createPrivateMatch } from '../src/authority/command.js';
import { collectInitialPublicRuleEvents } from '../src/authority/events.js';
import { initializeRules } from '../src/initialization.js';

const host = { handleForCard: (seat, id) => createHash('sha256').update(`${seat}:${id}`).digest('hex') };
const viewers = [0, 1, null];
function match() {
  const players = [0, 1].map(seat => ({ name: `P${seat}`, role: seat ? '追猎者' : '寻宝者', hp: 9, san: 8,
    hand: [{ id: `raw:${seat}`, name: `opening:${seat}`, privateMetadata: 'SECRET' }],
    godZone: [], zoneCards: [], privateSnapshot: 'SECRET' }));
  const record = createPrivateMatch({ id: 'opening', seed: 3, now: 0, state: {
    players: structuredClone(players), phase: 'ACTION', currentTurn: 0, turn: 1, abilityData: {},
    deck: [], discard: [], inspectionDeck: [], inspectionDiscard: [], log: [],
  } });
  record.openingPlayers = players;
  record.state.players[0].hand.push({ id: 'raw:later', name: 'later' });
  record.state.players[0].hp = 3;
  return record;
}
test('opening players use identical viewer privacy and opaque handles with the actual earlier hand and stats', () => {
  const record = match(), saved = structuredClone(record);
  for (const seat of viewers) {
    const view = projectMatch(record, seat === null ? { permission: 'observer' } : { permission: 'player', seat }, host);
    assert.equal(view.openingPlayers[0].hp, 9); assert.equal(view.players[0].hp, 3);
    assert.equal(view.openingPlayers[0].handCount, 1); assert.equal(view.players[0].handCount, 2);
    for (const index of [0, 1]) {
      assert.equal(!!view.openingPlayers[index].hand, index === seat);
      assert.equal(!!view.openingPlayers[index].role, index === seat);
      if (index === seat) assert.equal(view.openingPlayers[index].hand[0].id, view.players[index].hand[0].id);
    }
    assert.equal(JSON.stringify(view).includes('SECRET'), false); assert.equal(JSON.stringify(view).includes('raw:'), false);
  }
  assert.deepEqual(record, saved);
});
test('opening projection ignores unfinished swap baseline, disappears after revision zero and never guesses missing history', () => {
  const record = match();
  record.state._privateSwap = { source: 0, baselineHands: [[], []] };
  const view = projectMatch(record, { permission: 'observer' }, host);
  assert.equal(view.players[0].handCount, 0); assert.equal(view.openingPlayers[0].handCount, 1);
  record.revision = 1;
  assert.equal(projectMatch(record, { permission: 'observer' }, host).openingPlayers, undefined);
  record.revision = 0; delete record.openingPlayers;
  assert.equal(projectMatch(record, { permission: 'observer' }, host).openingPlayers, undefined);
});
test('fresh opening collects actual initialization causes and no synthetic cause from final snapshots', () => {
  const { state } = initializeRules({ mode: 'offline', seed: 16, now: 0, namespace: 'opening-test' });
  const events = collectInitialPublicRuleEvents(state);
  assert.ok(events.some(event => event.type === 'turnStarted'));
  assert.ok(events.some(event => event.type === 'cardRevealed'));
  const withoutJournals = { ...state, _visualEvents: [], _statEvents: [], _pendingPublicEvents: [] };
  assert.deepEqual(collectInitialPublicRuleEvents(withoutJournals), []);
});
