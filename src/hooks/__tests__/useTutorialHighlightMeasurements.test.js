import { describe, expect, it } from 'vitest';
import { getTutorialHighlightMeasureDelays } from '../useTutorialHighlightMeasurements';

describe('tutorial highlight measurement scheduling', () => {
  it.each(['drawRevealKeepButton', 'godKeepHandButton', 'dodgeRollButton'])(
    'remeasures %s after the modal scale transition',
    highlight => expect(getTutorialHighlightMeasureDelays(highlight)).toEqual([220, 320]),
  );

  it('preserves delayed measurements for late-mounted controls', () => {
    expect(getTutorialHighlightMeasureDelays('skillButton')).toEqual([50]);
    expect(getTutorialHighlightMeasureDelays('swapBlindHand', true)).toEqual([1200]);
    expect(getTutorialHighlightMeasureDelays('swapBlindHand', false)).toEqual([]);
  });

  it('does not schedule retries for stable highlights', () => {
    expect(getTutorialHighlightMeasureDelays('selfPanel')).toEqual([]);
  });
});
