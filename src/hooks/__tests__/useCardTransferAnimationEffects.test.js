import { describe, expect, it } from 'vitest';
import { resolveCardTransferFaceUp } from '../useCardTransferAnimationEffects';

describe('resolveCardTransferFaceUp', () => {
  const card = { id: 'zone-card', isZone: true };

  it('原始弃牌堆转移未显式标记时也默认正面', () => {
    expect(resolveCardTransferFaceUp({ type: 'CARD_TRANSFER', dest: 'discard' })).toBe(true);
  });

  it('保留显式朝向并且不影响非弃牌转移', () => {
    expect(resolveCardTransferFaceUp({ dest: 'discard', faceUp: false })).toBe(false);
    expect(resolveCardTransferFaceUp({ dest: 'player' })).toBe(false);
    expect(resolveCardTransferFaceUp({ dest: 'player', toPid: 0, faceUp: false, cards: [card] })).toBe(false);
    expect(resolveCardTransferFaceUp({ dest: 'player', toPid: 1, faceUp: true, cards: [card] })).toBe(true);
    expect(resolveCardTransferFaceUp({ dest: 'player', toPid: 1, faceUp: false }, { isTsathogguaSlime: true })).toBe(false);
  });

  it.each(['draw', 'godKeepHand', 'sphinxResult', 'decipherStone', 'roseThornGiftAllHand'])('按接收者决定%s收入的已知牌朝向', effect => {
    expect(resolveCardTransferFaceUp({ dest: 'player', toPid: 0, effect, cards: [card] })).toBe(true);
    expect(resolveCardTransferFaceUp({ dest: 'player', toPid: 1, effect, cards: [card] })).toBe(false);
  });

  it('缺失或未公开的牌身份保持背面', () => {
    expect(resolveCardTransferFaceUp({ dest: 'player', toPid: 0 })).toBe(false);
    expect(resolveCardTransferFaceUp({ dest: 'player', toPid: 0 }, { id: 'back-0', _back: true })).toBe(false);
    expect(resolveCardTransferFaceUp({ dest: 'player', toPid: 0, cards: [card] }, null)).toBe(false);
    expect(resolveCardTransferFaceUp({ dest: 'player', cards: [card] })).toBe(false);
  });

  it('同批收入逐张保留公开衍生物，不公开普通牌', () => {
    const transfer = {
      dest: 'player', toPid: 2,
      cards: [card, { isBlackGoatYoung: true }, { isTsathogguaSlime: true }, null],
    };
    expect(transfer.cards.map(item => resolveCardTransferFaceUp(transfer, item))).toEqual([false, true, true, false]);
  });

  it('非手牌目的地保留已有已知牌正面，未知牌背面', () => {
    expect(resolveCardTransferFaceUp({ dest: 'deckTop', cards: [card] })).toBe(true);
    expect(resolveCardTransferFaceUp({ dest: 'deckTop' })).toBe(false);
    expect(resolveCardTransferFaceUp({ dest: 'discard', cards: [card] })).toBe(true);
  });
});
