import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateMatch } from '../src/authority/command.js';
import { advanceRuleTime } from '../src/authority/time.js';
import { projectMatch } from '../src/authority/view.js';
import { migratedActions } from '../src/authority/coverage.js';
import { INSPECTION_DECK } from '../src/constants/card.js';

for (const isGod of [false, true]) {
  test(`lethal offline hounds commit the actual pending ${isGod ? 'god' : 'draw'} discard after damage exactly once`, () => {
    const card = { id: 'public-pending', name: 'Pending', ...(isGod ? { isGod: true, godKey: 'VRI' }
      : { isZone: true, type: 'selfHealHP', val: 1 }) };
    const first = createPrivateMatch({ id: `clock-income-${isGod}`, seed: 17, now: 100, state: {
      _isMP: false, _intentEngine: true, currentTurn: 0, turn: 1, _turnKey: 1,
      phase: isGod ? 'GOD_CHOICE' : 'DRAW_REVEAL',
      players: ['寻宝者', '追猎者', '邪祀者'].map((role, id) => ({ id, role, name: `P${id}`,
        hp: id === 0 ? 4 : 10, san: 10, isDead: false, hand: [], godZone: [], zoneCards: [], peekMemories: {} })),
      deck: [{ id: 'private-deck-canary', name: 'PRIVATE-CANARY' }], discard: [],
      inspectionDeck: [INSPECTION_DECK.find(item => item.effect === 'houndsOfTindalos')], inspectionDiscard: [],
      abilityData: isGod ? { godCard: card, drawerIdx: 0 } : {},
      drawReveal: isGod ? null : { card, drawerIdx: 0, needsDecision: true },
      houndsOfTindalosActive: true, log: [],
    } });
    const saved = structuredClone(first), done = advanceRuleTime(first, 15100);
    assert.deepEqual(first, saved);
    assert.equal(done.state.players[0].isDead, true);
    assert.equal(done.state.gameOver.winner, 'LOSE');
    assert.equal(done.state.discard.filter(item => item.id === card.id).length, 1);
    assert.equal(done.random.draws, first.random.draws);
    assert.deepEqual(done.random, first.random);
    assert.equal(advanceRuleTime(done, 99999), done);
    for (const seat of [0, 1, null]) {
      const view = projectMatch(done, seat === null ? { permission: 'observer' } : { permission: 'player', seat },
        { actions: migratedActions, handleForCard: (viewer, id) => `opaque:${viewer}:${id}` });
      const incomes = view.events.filter(event => event.type === 'cardIncomeCommitted');
      assert.equal(incomes.length, 1);
      assert.equal(incomes[0].destination, 'discard'); assert.equal(incomes[0].source, 'reveal');
      assert.equal(incomes[0].card.id, `opaque:${seat}:${card.id}`);
      assert.ok(view.events.indexOf(incomes[0]) > view.events.findIndex(event => event.kind === 'HP_LOSS'));
      assert.equal(JSON.stringify(view).includes('PRIVATE-CANARY'), false);
      assert.equal(JSON.stringify(incomes).includes('presentationAfterStatIds'), false);
    }
  });
}
