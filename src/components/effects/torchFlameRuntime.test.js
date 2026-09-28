import { describe, expect, it } from 'vitest';
import { TORCH_FLAME_SOURCE, canUseFlameHdr, flameBackingSize, flameFrameAt, flamePlaybackState } from './torchFlameRuntime';

describe('torch flame runtime budget and playback', () => {
  it('caps backing pixels and accounts for the scaled mobile iframe', () => {
    expect(flameBackingSize(400, 800, 3)).toEqual({ width: 256, height: 512 });
    expect(flameBackingSize(200, 400, 2, .3)).toEqual({ width: 120, height: 240 });
    expect(flameBackingSize(0, 0)).toEqual({ width: 1, height: 1 });
  });
  it('loops the atlas by elapsed time rather than by screen refresh rate', () => {
    expect(flameFrameAt(0, TORCH_FLAME_SOURCE)).toBe(0);
    expect(flameFrameAt(1000, TORCH_FLAME_SOURCE)).toBe(24);
    expect(flameFrameAt(2000, TORCH_FLAME_SOURCE)).toBe(0);
    expect(flameFrameAt(-30, TORCH_FLAME_SOURCE)).toBe(0);
  });
  it('requires HDR display, GPU and a secure context; SDR remains the default fallback', () => {
    expect(canUseFlameHdr({ secure: true, gpu: {}, highDynamicRange: true })).toBe(true);
    expect(canUseFlameHdr({ secure: true, gpu: {}, highDynamicRange: false })).toBe(false);
    expect(canUseFlameHdr({ secure: true, highDynamicRange: true })).toBe(false);
    expect(canUseFlameHdr({ secure: false, gpu: {}, highDynamicRange: true })).toBe(false);
  });
  it('stops invisible or paused loops, but leaves overlay dimming to the actual backdrop', () => {
    for (const reason of ['hidden', 'paused', 'reducedMotion', 'fullyCovered']) {
      expect(flamePlaybackState({ [reason]: true }).animate).toBe(false);
    }
    expect(flamePlaybackState({ visible: false }).animate).toBe(false);
    expect(flamePlaybackState({ occluded: true })).toEqual({ animate: true, opacity: 1 });
    expect(flamePlaybackState({})).toEqual({ animate: true, opacity: 1 });
    expect(flamePlaybackState({ occluded: true, intensity: .6 })).toEqual(flamePlaybackState({ intensity: .6 }));
  });
});
