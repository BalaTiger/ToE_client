import { describe, expect, it, vi } from 'vitest';
import { migratedActions } from '../../../packages/rules/src/authority/coverage.js';
import { AUTHORITY_PRESENTATION_COMMANDS, createAuthorityCommandDispatcher } from './commands.js';

const fixture = actions => ({ version: 2, viewerSeat: 2, players: [{ seat: 0 }, { seat: 1 }, { seat: 2 }],
  decision: { id: 'd1', actions }, revision: 1 });
function setup(actions) {
  let view = fixture(actions);
  const send = vi.fn().mockResolvedValue({ ok: true });
  return { send, dispatcher: createAuthorityCommandDispatcher({ getView: () => view, submit: send }),
    update: next => { view = next; } };
}

describe('authority presentation command boundary', () => {
  it('covers the complete current semantic command schema without importing reducers at runtime', () => {
    expect(Object.keys(AUTHORITY_PRESENTATION_COMMANDS).sort()).toEqual(Object.keys(migratedActions).sort());
    for (const [type, action] of Object.entries(migratedActions)) expect(AUTHORITY_PRESENTATION_COMMANDS[type]).toEqual(action.payloadKeys);
  });

  it('maps display targets back to server seats and forwards only a semantic choice', async () => {
    const { send, dispatcher } = setup([{ type: 'swap.selectTarget', targetSeats: [0, 1] }]);
    await dispatcher.target('swap.selectTarget', 1);
    expect(send).toHaveBeenCalledExactlyOnceWith('swap.selectTarget', { targetSeat: 0 });
    expect(() => dispatcher.target('swap.selectTarget', 0)).toThrow('invalid_presentation_target');
    expect(() => dispatcher.target('swap.selectTarget', 99)).toThrow('invalid_presentation_target');
  });

  it('preserves canonical hand indices, validates multi-select size and blocks extra state', async () => {
    const { send, dispatcher } = setup([{ type: 'turn.discard', cardIndices: [0, 2, 3], count: 2 }]);
    await dispatcher.cards('turn.discard', [3, 0]);
    expect(send).toHaveBeenCalledWith('turn.discard', { cardIndices: [3, 0] });
    for (const indices of [[0, 0], [1, 2], [0]]) expect(() => dispatcher.cards('turn.discard', indices)).toThrow('invalid_presentation_cards');
    expect(() => dispatcher.submit('turn.discard', { cardIndices: [0, 2], state: {} })).toThrow('invalid_presentation_payload');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('uses the latest decision and can reject a stale UI selection explicitly', () => {
    const { send, dispatcher, update } = setup([{ type: 'turn.end' }]);
    update({ ...fixture([{ type: 'draw.keep' }]), decision: { id: 'd2', actions: [{ type: 'draw.keep' }] } });
    expect(() => dispatcher.callbacks.endTurn()).toThrow('authority_action_unavailable');
    expect(() => dispatcher.submit('draw.keep', {}, { decisionId: 'd1' })).toThrow('stale_presentation_decision');
    expect(send).not.toHaveBeenCalled();
  });

  it.each([view => ({ ...view, viewerSeat: null }), view => ({ ...view, gameOver: {} }),
    view => ({ ...view, status: { paused: 'rule_error' } }),
    view => ({ ...view, players: [{ seat: 0 }, { seat: 1 }, { seat: 2, isDead: true }] })])('blocks read-only recipients', change => {
    const { dispatcher, update, send } = setup([{ type: 'turn.end' }]);
    update(change(fixture([{ type: 'turn.end' }])));
    expect(() => dispatcher.submit('turn.end')).toThrow('authority_read_only');
    expect(send).not.toHaveBeenCalled();
  });

  it('only permits the offered boolean/choice values and advertised skip/abandon', async () => {
    const { dispatcher, send } = setup([{ type: 'slime.answer', choices: [false] },
      { type: 'god.choose', choices: ['discard'] }, { type: 'nya.borrow', allowSkip: true, targetSeats: [0] },
      { type: 'hunt.attack', allowAbandon: true, cardIndices: [1] }]);
    expect(() => dispatcher.boolean('slime.answer', true)).toThrow('invalid_presentation_choice');
    expect(() => dispatcher.choice('god.choose', 'worship')).toThrow('invalid_presentation_choice');
    await dispatcher.boolean('slime.answer', false);
    await dispatcher.target('nya.borrow', null);
    await dispatcher.card('hunt.attack', null);
    expect(send.mock.calls).toEqual([['slime.answer', { use: false }], ['nya.borrow', { targetSeat: null }], ['hunt.attack', { cardIndex: null }]]);
  });

  it('requires stone placement to partition the authorized cards once', async () => {
    const { dispatcher, send } = setup([{ type: 'stone.arrange', cardIndices: [0, 1, 2] }]);
    await dispatcher.submit('stone.arrange', { handIndex: 1, topIndices: [2], bottomIndices: [0] });
    expect(() => dispatcher.submit('stone.arrange', { handIndex: 1, topIndices: [1], bottomIndices: [0] })).toThrow('invalid_presentation_arrangement');
    expect(() => dispatcher.submit('stone.arrange', { handIndex: 1, topIndices: [], bottomIndices: [0] })).toThrow('invalid_presentation_arrangement');
    expect(send).toHaveBeenCalledTimes(1);
  });
});
