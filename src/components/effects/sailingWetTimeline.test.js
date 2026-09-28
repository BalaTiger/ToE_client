import { describe, expect, it } from 'vitest';
import { SAILING_WET_COVERAGE } from '../../constants/theme';
import coverageRegions from '../../constants/sailingWetRegions.json';
import { createWetPlan, remainingWetDrying, staticWetRegions } from './sailingWetTimeline';

const surfaces = ['panel', 'torch'];
const nearlyOne = 1 - Number.EPSILON;
const footprint = frame => frame.maskImage.match(/url\(['"]?([^'")]+)['"]?\)/)[1];
const chosenPaths = region => [...new Set(region.frames.map(footprint))];
const timedFrames = (plan, region) => region.frames.map(frame => ({ ...frame, time: frame.offset * plan.duration }));

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// Sample the emitted linear WAAPI curve, independently of the planner's windows.
function opacityAt(plan, region, time) {
  const frames = timedFrames(plan, region);
  const next = frames.findIndex(frame => frame.time > time + 1e-7);
  if (next === -1) return frames.at(-1).opacity;
  if (next === 0) return frames[0].opacity;
  const a = frames[next - 1], b = frames[next];
  return a.opacity + (b.opacity - a.opacity) * (time - a.time) / (b.time - a.time);
}

// Interpret the actual CSS radial stops. Ignore the common footprint/front:
// treating those as fully opaque is the worst case for duplicate coverage.
function ownershipAt(maskImage, x, y) {
  const radial = /radial-gradient\(ellipse ([\d.]+)% ([\d.]+)% at ([\d.]+)% ([\d.]+)%, (transparent|#000) ([\d.]+)%, (transparent|#000) ([\d.]+)%\)/g;
  return [...maskImage.matchAll(radial)].reduce((alpha, match) => {
    const [, rx, ry, cx, cy, from, start, to, end] = match;
    const distance = Math.hypot((x - Number(cx) / 100) / (Number(rx) / 100), (y - Number(cy) / 100) / (Number(ry) / 100));
    const t = Math.max(0, Math.min(1, (distance * 100 - Number(start)) / (Number(end) - Number(start))));
    const a = from === '#000' ? 1 : 0, b = to === '#000' ? 1 : 0;
    return alpha * (a + (b - a) * t);
  }, 1);
}

describe.each(surfaces)('%s local wetting timeline', surface => {
  const paths = SAILING_WET_COVERAGE[surface];

  it('shares one footprint per wave, picks three distinct shapes, and excludes the previous visible shape', () => {
    for (const previous of paths) {
      // getComputedStyle serializes URLs as absolute, unlike the source constants.
      const previousMask = `url("https://example.test${previous}"), linear-gradient(#000, transparent)`;
      const plan = createWetPlan(surface, paths, previousMask, seeded(17));
      const selected = chosenPaths(plan.regions[0]);
      expect(selected).toHaveLength(3);
      expect(selected).not.toContain(previous);
      for (const region of plan.regions) expect(chosenPaths(region)).toEqual(selected);
      for (const path of selected) expect(paths).toContain(path);
    }
  });

  it('changes a footprint only while all three local regions are invisible', () => {
    const plan = createWetPlan(surface, paths, '', seeded(41));
    for (const region of plan.regions) {
      const frames = timedFrames(plan, region);
      const switches = frames.slice(1).flatMap((frame, index) => footprint(frame) !== footprint(frames[index]) ? [[frames[index], frame]] : []);
      expect(switches).toHaveLength(2);
      for (const [before, after] of switches) {
        expect(before.opacity).toBe(0);
        expect(after.opacity).toBe(0);
        for (const local of plan.regions) {
          expect(opacityAt(plan, local, (before.time + after.time) / 2)).toBeCloseTo(0);
          expect(opacityAt(plan, local, after.time)).toBeCloseTo(0);
        }
      }
    }
  });

  it('has visible intervals where the central patch wets first and later dries before its neighbours', () => {
    let centralFirst = 0, otherFirst = 0;
    for (const random of [() => 0, () => nearlyOne, seeded(73)]) {
      const plan = createWetPlan(surface, paths, '', random);
      const [main, early, tail] = plan.regions;
      for (let wave = 0; wave < 3; wave++) {
        const neighboursArrive = Math.min(main.windows[wave].arrive, tail.windows[wave].arrive);
        const alone = (early.windows[wave].arrive + neighboursArrive) / 2;
        if (early.windows[wave].arrive < neighboursArrive) {
          centralFirst++;
          expect(opacityAt(plan, early, alone)).toBeGreaterThan(.1);
          expect(opacityAt(plan, main, alone)).toBeCloseTo(0);
          expect(opacityAt(plan, tail, alone)).toBeCloseTo(0);
        } else {
          otherFirst++;
          expect(opacityAt(plan, early, alone)).toBeCloseTo(0);
          expect(Math.max(opacityAt(plan, main, alone), opacityAt(plan, tail, alone))).toBeGreaterThan(0);
        }
        const dried = early.windows[wave].dryEnd + 1;
        expect(opacityAt(plan, early, dried)).toBeCloseTo(0);
        expect(opacityAt(plan, main, dried)).toBeGreaterThan(.05);
      }
    }
    expect(centralFirst).toBeGreaterThan(0);
    expect(otherFirst).toBeGreaterThan(0);
  });

  it('preserves each interrupted patch\'s remaining drying life and does not restart an already-dry patch', () => {
    const plan = createWetPlan(surface, paths, '', seeded(101));
    for (const region of plan.regions) {
      for (const window of region.windows) {
        const holding = (window.arrive + window.dryStart) / 2;
        const held = remainingWetDrying(region, holding);
        expect(held.duration).toBeCloseTo(window.dryEnd - window.dryStart);
        expect(held.closedClip).toBe(window.closedClip);
        for (const progress of [.1, .5, .95]) {
          const now = window.dryStart + progress * window.dryDuration;
          const remaining = remainingWetDrying(region, now);
          expect(now + remaining.duration).toBeCloseTo(window.dryEnd);
          expect(remaining.closedClip).toBe(window.closedClip);
        }
        const after = window.dryEnd + 1;
        expect(opacityAt(plan, region, after)).toBeCloseTo(0);
        expect(remainingWetDrying(region, after).duration).toBeLessThanOrEqual(1);
      }
    }
    expect(remainingWetDrying()).toMatchObject({ duration: expect.any(Number), closedClip: expect.any(String) });
  });

  it('keeps finite ordered keyframes and drying windows across random extrema and varied seeds', () => {
    let index = 0;
    const randoms = [() => 0, () => nearlyOne, () => index++ % 2 ? nearlyOne : 0,
      ...Array.from({ length: 32 }, (_, seed) => seeded(seed + 1))];
    for (const random of randoms) {
      const plan = createWetPlan(surface, paths, `url('${paths[0]}')`, random);
      expect(Number.isFinite(plan.duration)).toBe(true);
      expect(plan.duration).toBeGreaterThan(2760);
      for (const region of plan.regions) {
        expect(region.frames[0].offset).toBe(0);
        expect(region.frames.at(-1).offset).toBe(1);
        expect(region.frames.at(-1).opacity).toBe(0);
        region.frames.forEach((frame, i) => {
          expect(Number.isFinite(frame.offset)).toBe(true);
          expect(frame.offset).toBeGreaterThanOrEqual(i ? region.frames[i - 1].offset : 0);
          expect(frame.offset).toBeLessThanOrEqual(1);
          expect(frame.opacity).toBeGreaterThanOrEqual(0);
          expect(frame.opacity).toBeLessThanOrEqual(.8);
          expect(frame.maskImage + frame.clipPath).not.toMatch(/undefined|NaN|Infinity/);
        });
        for (const window of region.windows) {
          expect(window.arrive).toBeGreaterThan(window.start);
          expect(window.dryStart).toBeGreaterThan(window.arrive);
          expect(window.dryEnd).toBeGreaterThan(window.dryStart);
        }
      }
    }
  });
});

it('keeps each main directional spread at 184ms and the panel impact exactly 18.4ms behind the torch', () => {
  const torch = createWetPlan('torch', SAILING_WET_COVERAGE.torch, '', seeded(311));
  const panel = createWetPlan('panel', SAILING_WET_COVERAGE.panel, '', seeded(311));
  for (const plan of [torch, panel]) {
    const main = plan.regions[0];
    const frames = timedFrames(plan, main);
    for (let wave = 0; wave < 3; wave++) {
      const start = main.windows[wave].arrive;
      const peak = frames.find(frame => frame.time > start && Math.abs(frame.opacity - .8) < 1e-8);
      expect(peak.time - start).toBeCloseTo(184);
      expect(peak.maskPosition).toMatch(/100% 100%$/);
    }
  }
  for (let region = 0; region < 3; region++) {
    for (let wave = 0; wave < 3; wave++) {
      expect(panel.regions[region].windows[wave].arrive - torch.regions[region].windows[wave].arrive).toBeCloseTo(18.4);
    }
  }
});

it('wets raised surfaces from lower-right to upper-left in screen space', () => {
  // Resolve the emitted CSS gradient in its 300% mask box, not just its angle:
  // mask-position moves a larger image in the opposite direction to its value.
  const frontAlpha = (frame, x, y, height) => {
    const angle = Number(frame.maskImage.match(/linear-gradient\(([\d.]+)deg/)[1]) * Math.PI / 180;
    const [px, py] = frame.maskPosition.split(',').at(-1).match(/[\d.]+/g).map(Number);
    const dx = Math.sin(angle), dy = -Math.cos(angle);
    const length = Math.abs(dx) * 3 + Math.abs(dy) * height * 3;
    const t = .5 + (dx * (x + 2 * px / 100 - 1.5) + dy * height * (y + 2 * py / 100 - 1.5)) / length;
    return Math.max(0, Math.min(1, (.54 - t) / .08));
  };
  for (const surface of surfaces) {
    const height = surface === 'panel' ? 2 : 1.5;
    const { regions: [main] } = createWetPlan(surface, SAILING_WET_COVERAGE[surface], '', seeded(11));
    const progressing = main.frames[2];
    expect(frontAlpha(progressing, .34, .7, height)).toBeGreaterThan(frontAlpha(progressing, .34, .2, height));
    expect(frontAlpha(progressing, .7, .34, height)).toBeGreaterThan(frontAlpha(progressing, .2, .34, height));
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      expect(frontAlpha(main.frames[0], x, y, height)).toBe(0);
      expect(frontAlpha(main.frames[3], x, y, height)).toBe(1);
    }
    for (const variant of coverageRegions.variants) {
      const { impact, early, tail } = variant[surface];
      for (const area of [early, tail]) {
        expect(area.x).toBeLessThan(impact[0]);
      }
      // The middle of the main finger rises; a bent lateral finger may
      // briefly dip before its tip rises (validated by the generator).
      expect(early.y).toBeLessThan(impact[1]);
    }
  }
});

it('partitions ownership without gaps or excessive alpha across all variant anchors and jittered masks', () => {
  for (const surface of surfaces) {
    const paths = SAILING_WET_COVERAGE[surface];
    const sets = paths.map((path, variant) => staticWetRegions(surface, path, variant));
    for (const random of [() => 0, () => nearlyOne]) {
      const plan = createWetPlan(surface, paths, '', random);
      for (const path of chosenPaths(plan.regions[0])) {
        sets.push(plan.regions.map(region => region.frames.find(frame => footprint(frame) === path)));
      }
    }
    const points = Array.from({ length: 21 * 21 }, (_, i) => [i % 21 / 20, Math.floor(i / 21) / 20]);
    for (const variant of coverageRegions.variants) {
      for (const area of [variant[surface].early, variant[surface].tail]) {
        for (const distance of [0, .7, .8, .9, 1]) {
          points.push([area.x + area.rx * distance, area.y], [area.x, area.y + area.ry * distance]);
        }
      }
    }
    for (const masks of sets) {
      expect(masks[0].maskImage).toContain('radial-gradient(');
      for (const [x, y] of points) {
        const weights = masks.map(frame => ownershipAt(frame.maskImage, x, y));
        expect(weights.reduce((sum, alpha) => sum + alpha, 0)).toBeCloseTo(1, 9);
        // Source-over compositing of identical artwork must not exceed a
        // single .8-strength wet layer, including the feathered boundaries.
        const composed = 1 - weights.reduce((dry, alpha) => dry * (1 - .8 * alpha), 1);
        expect(composed).toBeLessThanOrEqual(.8 + 1e-12);
      }
    }
  }
});
