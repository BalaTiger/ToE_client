import { afterEach, expect, it, vi } from 'vitest';
import { BGM_AUDIO_BY_KEY } from '../constants/theme';
import { buildPublicUrl } from '../utils/url';
import { useGameAudio } from './useGameAudio';

const effects = vi.hoisted(() => []);
vi.mock('react', () => ({
  useState: initial => [initial, vi.fn()],
  useRef: initial => ({ current: initial }),
  useCallback: callback => callback,
  useEffect: effect => { effects.push(effect); },
}));

afterEach(() => {
  effects.length = 0;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('leaves idle audio to the resource loader and still plays requested sounds on demand', async () => {
  vi.useFakeTimers();
  const audios = [];
  const AudioMock = vi.fn(function () {
    const audio = {
      preload: 'auto',
      volume: 1,
      currentTime: 0,
      playbackRate: 1,
      pause: vi.fn(),
      play: vi.fn(() => Promise.resolve()),
      set src(url) {
        this.url = url;
        this.preloadWhenSourceAssigned = this.preload;
      },
    };
    audios.push(audio);
    return audio;
  });
  vi.stubGlobal('Audio', AudioMock);
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());

  const hook = useGameAudio(false);
  const cleanups = effects.map(effect => effect());
  const audioFor = path => audios.find(audio => audio.url === buildPublicUrl(path));
  try {
    expect(audios.length).toBeGreaterThan(3);
    // A URL passed into new Audio() can begin loading before preload is set.
    expect(AudioMock.mock.calls.every(args => args.length === 0)).toBe(true);
    expect(audios.every(audio => audio.preloadWhenSourceAssigned === 'none')).toBe(true);
    expect(audios.every(audio => audio.preload === 'none')).toBe(true);
    expect(audios.filter(audio => audio.play.mock.calls.length).map(audio => audio.url))
      .toEqual([buildPublicUrl(BGM_AUDIO_BY_KEY.main.path)]);
    expect(window.addEventListener.mock.calls.map(([event]) => event))
      .toEqual(['pointerdown', 'keydown', 'touchstart']);

    hook.playOpenSound();
    expect(audioFor('sounds/SE/common/ui/open.mp3').play).toHaveBeenCalledOnce();
    hook.playCthRlyehDreamSound();
    expect(audioFor('sounds/SE/starsCall/cth/dive.mp3').play).toHaveBeenCalledOnce();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    hook.playIgniteTorchFireSound();
    expect(audioFor('sounds/SE/earthShadow/torch/fire.mp3')).toMatchObject({
      currentTime: 0.45,
      playbackRate: 1.35,
    });
    expect(audioFor('sounds/SE/earthShadow/torch/fire.mp3').play).toHaveBeenCalledOnce();
    expect(audioFor(BGM_AUDIO_BY_KEY.battleEarth.path).play).not.toHaveBeenCalled();
    expect(audioFor(BGM_AUDIO_BY_KEY.battleStars.path).play).not.toHaveBeenCalled();
    await Promise.resolve();
  } finally {
    cleanups.forEach(cleanup => cleanup?.());
  }
});
