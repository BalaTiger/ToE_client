import { describe, expect, it } from 'vitest';
import { AnimOverlay } from './AnimOverlay';

describe('AnimOverlay turn banners', () => {
  it('gives consecutive turn banners distinct component identities', () => {
    const skippedPlayerTurn = AnimOverlay({
      anim: { type: 'YOUR_TURN', name: '你', _playbackId: 41 },
      exiting: false,
    });
    const nextAiTurn = AnimOverlay({
      anim: { type: 'YOUR_TURN', name: '艾伦', _playbackId: 42 },
      exiting: false,
    });

    expect(skippedPlayerTurn.key).toBe('41');
    expect(nextAiTurn.key).toBe('42');
    expect(nextAiTurn.key).not.toBe(skippedPlayerTurn.key);
  });
});
