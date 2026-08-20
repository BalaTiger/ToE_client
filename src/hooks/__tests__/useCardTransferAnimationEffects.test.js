import { describe, expect, it } from 'vitest';
import { resolveCardTransferFaceUp } from '../useCardTransferAnimationEffects';

describe('resolveCardTransferFaceUp', () => {
  it('原始弃牌堆转移未显式标记时也默认正面', () => {
    expect(resolveCardTransferFaceUp({ type: 'CARD_TRANSFER', dest: 'discard' })).toBe(true);
  });

  it('保留显式朝向并且不影响非弃牌转移', () => {
    expect(resolveCardTransferFaceUp({ dest: 'discard', faceUp: false })).toBe(false);
    expect(resolveCardTransferFaceUp({ dest: 'player' })).toBe(false);
  });
});
