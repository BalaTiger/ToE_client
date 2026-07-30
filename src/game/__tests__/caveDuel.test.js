import { describe, expect, it } from 'vitest';
import {
  resolveCaveDuelOutcome,
  resolveHandCardSelection,
} from '../caveDuel';

function card(id, number) {
  return {
    id,
    name: `牌${number}`,
    number,
    letter: 'A',
    isZone: true,
  };
}

function players(sourceHand, targetHand) {
  return [
    { name: '来源', hand: sourceHand, godZone: [] },
    { name: '目标', hand: targetHand, godZone: [] },
  ];
}

describe('cave duel rules', () => {
  it('uses card identity when a stored index is stale', () => {
    const expected = card('expected', 4);
    const player = { hand: [card('shifted', 1), expected] };

    expect(resolveHandCardSelection(
      player,
      0,
      { id: 'expected' }
    )).toEqual({ index: 1, card: expected });
  });

  it('moves both actual hand cards to the source winner', () => {
    const sourceCard = card('source', 4);
    const targetCard = card('target', 2);
    const originalPlayers = players(
      [card('shifted', 1), sourceCard],
      [targetCard]
    );

    const result = resolveCaveDuelOutcome({
      players: originalPlayers,
      sourceIdx: 0,
      targetIdx: 1,
      sourceCardIndex: 0,
      targetCardIndex: 0,
      sourceCard: { ...sourceCard },
      targetCard: { ...targetCard },
    });

    expect(result.winnerIdx).toBe(0);
    expect(result.gainedCard).toBe(targetCard);
    expect(result.players[0].hand.map(item => item.id)).toEqual([
      'shifted',
      'source',
      'target',
    ]);
    expect(result.players[1].hand).toEqual([]);
    expect(originalPlayers[0].hand).toHaveLength(2);
  });

  it('moves both cards to the target winner', () => {
    const sourceCard = card('source', 1);
    const targetCard = card('target', 3);
    const result = resolveCaveDuelOutcome({
      players: players([sourceCard], [targetCard]),
      sourceIdx: 0,
      targetIdx: 1,
      sourceCardIndex: 0,
      targetCardIndex: 0,
      sourceCard,
      targetCard,
    });

    expect(result.winnerIdx).toBe(1);
    expect(result.gainedCard).toBe(sourceCard);
    expect(result.players[0].hand).toEqual([]);
    expect(result.players[1].hand.map(item => item.id)).toEqual([
      'source',
      'target',
    ]);
  });

  it('leaves both hands unchanged on a tie', () => {
    const sourceCard = card('source', 2);
    const targetCard = card('target', 2);
    const result = resolveCaveDuelOutcome({
      players: players([sourceCard], [targetCard]),
      sourceIdx: 0,
      targetIdx: 1,
      sourceCardIndex: 0,
      targetCardIndex: 0,
      sourceCard,
      targetCard,
    });

    expect(result.winnerIdx).toBeNull();
    expect(result.gainedCard).toBeNull();
    expect(result.players[0].hand).toEqual([sourceCard]);
    expect(result.players[1].hand).toEqual([targetCard]);
    expect(result.logLine).toContain('平局');
  });
});
