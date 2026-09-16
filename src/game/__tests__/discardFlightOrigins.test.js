import { describe, expect, it } from 'vitest';
import { discardStep } from '../animQueueHelpers';
import { createDrawCardEvent, createGodGiftDiscardEvent, createHandLimitDiscardEvent, createTimedOutDrawDiscardEvent } from '../visualEvents';
import { compileVisualEventToAnimSteps } from '../visualEventTransactionCompiler';

const zone = { id: 'drawn-zone', letter: 'A', number: 1, name: '区域牌' };
const god = { id: 'drawn-god', isGod: true, godKey: 'CTH', name: '克苏鲁' };
const state = { currentTurn: 1, players: [{ name: '你', hand: [] }, { name: '艾伦', hand: [] }], discard: [] };

describe('discard flight origins', () => {
  it.each([
    [createDrawCardEvent({ playerIdx: 1, card: zone, discarded: true }), 'playerArea'],
    [createDrawCardEvent({ playerIdx: 1, card: god, discarded: true }), 'godChoice'],
    [createTimedOutDrawDiscardEvent({ drawerIdx: 1, card: zone }), 'playerArea'],
    [createGodGiftDiscardEvent({ drawerIdx: 1, card: god }), 'godChoice'],
  ])('keeps uncollected cards anchored to their reveal through transaction compilation', (event, sourceAnchor) => {
    const step = compileVisualEventToAnimSteps(event, state, state).find(item => item.type === 'DISCARD');
    expect(step).toMatchObject({ card: event.card, targetPid: 1, sourceAnchor });
  });

  it('keeps hand-limit discard anchored to the hand', () => {
    const event = createHandLimitDiscardEvent({ playerIdx: 1, cards: [zone] });
    const step = compileVisualEventToAnimSteps(event, state, state).find(item => item.type === 'DISCARD');
    expect(step).toMatchObject({ card: zone, targetPid: 1 });
    expect(step.sourceAnchor).toBeUndefined();
  });

  it('preserves a direct decision origin without changing visual timeline timing', () => {
    const original = discardStep({ card: zone, playersBefore: state.players, discardBefore: [] });
    const revealed = discardStep({ card: zone, sourceAnchor: 'playerArea', playersBefore: state.players, discardBefore: [] });
    expect(revealed).toEqual({ ...original, sourceAnchor: 'playerArea' });
  });
});
