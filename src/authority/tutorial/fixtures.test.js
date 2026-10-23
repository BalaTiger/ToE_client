import { describe, expect, it, vi } from 'vitest';
import { createTutorialRecord, TUTORIAL_CHAPTERS } from './fixtures';
import { dispatchOffline, decodeOfflineSave, encodeOfflineSave } from '../../../packages/rules/src/offline.js';
import { projectMatch } from '../../../packages/rules/src/authority/view.js';
import { migratedActions } from '../../../packages/rules/src/authority/coverage.js';

function chapter(name) {
  let record = createTutorialRecord(name);
  return {
    get record() { return record; },
    view(seat = 0) { return projectMatch(record, { permission: 'player', seat }, { actions: migratedActions, now: 0,
      handleForCard: (viewer, id) => `local:${viewer}:${id}` }); },
    submit(seat, type, payload = {}) { record = dispatchOffline(record, seat, { type, payload }, { now: 0 }); },
  };
}
describe('local tutorial fixtures on the real v2 rules', () => {
  it('initializes isolated valid offline records without ambient randomness or online setup', () => {
    const ambient = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('ambient randomness'); });
    try {
      for (const name of TUTORIAL_CHAPTERS) {
        const record = createTutorialRecord(name);
        expect(decodeOfflineSave(encodeOfflineSave(record))).toEqual(record);
        expect(record.state._intentEngine).toBe(true);
        expect(record.state._isMP).toBe(false);
        expect(record.state._isTutorial).toBeUndefined();
      }
      expect(() => createTutorialRecord('treasure', { id: 'online:lesson' })).toThrow();
    } finally { ambient.mockRestore(); }
  });
  it('really rolls six, randomly takes D4 and wins after giving the drawn B3', () => {
    const game = chapter('treasure');
    game.submit(1, 'turn.end'); game.submit(0, 'draw.keep'); game.submit(0, 'treasureDodge.reply', { use: true });
    expect(game.view().events.find(event => event.type === 'diceRolled').roll).toBe(6);
    game.submit(0, 'skill.begin'); game.submit(0, 'swap.selectTarget', { targetSeat: 1 });
    const before = game.record.random.draws;
    expect(() => game.submit(0, 'swap.takeBlind', { cardIndex: 0 })).toThrow();
    game.submit(0, 'swap.takeBlind');
    expect(game.record.random.draws).toBeGreaterThan(before);
    expect(game.view().players[0].hand.at(-1).key).toBe('D4');
    game.submit(0, 'swap.give', { cardIndex: game.view().players[0].hand.findIndex(card => card.name === '封入石棺') });
    expect(game.view().gameOver).toMatchObject({ winner: '寻宝者', winnerIdx: 0 });
  });
  it.each([0, 3])('completes both hunts with either matching first card %s and keeps loot private', first => {
    const game = chapter('hunter');
    for (let hit = 0; hit < 2; hit++) {
      game.submit(0, 'skill.begin'); game.submit(0, 'hunt.selectTarget', { targetSeat: 1 });
      game.submit(1, 'hunt.reveal', { cardIndex: 0 });
      const legal = game.view().decision.actions.find(action => action.type === 'hunt.attack').cardIndices;
      game.submit(0, 'hunt.attack', { cardIndex: hit ? legal[0] : first });
      expect(game.view().players[1].hp).toBe(3 - hit * 3);
      if (!hit) expect(game.view(1).players[0].hand).toBeUndefined();
    }
    expect(game.view().gameOver.winner).toBe('追猎者');
    expect(game.view().players[0].hand.filter(card => card.id.includes('tut-hunter-target'))).toHaveLength(3);
    // Canonical terminal projection publicly reveals all hands.
    expect(game.view(1).gameOver).toBeTruthy();
  });
  it('wins the region-card chapter through a real bewitch gift', () => {
    const game = chapter('cultistZone');
    game.submit(0, 'skill.begin'); game.submit(0, 'bewitch.chooseCard', { cardIndex: 0 });
    game.submit(0, 'bewitch.selectTarget', { targetSeat: 1 });
    expect(game.view().players[1].san).toBe(0);
    expect(game.view().gameOver.winner).toBe('邪祀者');
  });
  it('settles the opponent encounter and conversion, then wins by gifting the kept god', () => {
    const game = chapter('cultistGod');
    game.submit(0, 'turn.end'); expect(game.view(1).godEncounter.card.godKey).toBe('VRI');
    game.submit(1, 'god.choose', { choice: 'worship' });
    expect(game.view().players[1]).toMatchObject({ godName: 'VRI', san: 4 });
    game.submit(1, 'turn.end'); expect(game.view().godEncounter.card.godKey).toBe('ZHU');
    game.submit(0, 'god.choose', { choice: 'keepHand' }); game.submit(0, 'skill.begin');
    game.submit(0, 'bewitch.chooseCard', { cardIndex: game.view().players[0].hand.findIndex(card => card.godKey === 'ZHU') });
    game.submit(0, 'bewitch.selectTarget', { targetSeat: 1 });
    expect(game.view().players[1]).toMatchObject({ godName: 'ZHU', san: 0 });
    expect(game.view().gameOver.winner).toBe('邪祀者');
  });
});
