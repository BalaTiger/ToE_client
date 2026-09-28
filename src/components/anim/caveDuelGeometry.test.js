import { describe, expect, it } from 'vitest';
import { getCaveDuelCardStyle } from './caveDuelGeometry';
import { CARD_PERSPECTIVE_RATIO, projectTableCard } from '../../utils/cardPlane';

const anchor = (x, y, width, rotation = 0) => ({ x, y, width, height: width * 590 / 392, rotation });

describe('cave duel card travel', () => {
  it.each([
    [anchor(720, 780, 240, -9), anchor(420, 120, 48)],
    [anchor(420, 120, 48), anchor(720, 780, 240, 9)],
    [anchor(420, 120, 48), anchor(420, 120, 48)],
  ])('preserves the real source, reveal and destination sizes and centers', (from, to) => {
    const middle = anchor(610, 380, 160);
    const style = getCaveDuelCardStyle(from, middle, to);
    const startX = style.left + style.width / 2;
    const startY = style.top + style.height / 2;

    expect([startX, startY]).toEqual([from.x, from.y]);
    expect([startX + Number.parseFloat(style['--midX']), startY + Number.parseFloat(style['--midY'])]).toEqual([middle.x, middle.y]);
    expect([startX + Number.parseFloat(style['--tx']), startY + Number.parseFloat(style['--ty'])]).toEqual([to.x, to.y]);
    expect(style.width * style['--from-scale']).toBeCloseTo(from.width);
    expect(style.width * style['--duel-mid-scale']).toBeCloseTo(middle.width);
    expect(style.width * style['--to-scale']).toBeCloseTo(to.width);
    expect(style.height / style.width).toBeCloseTo(590 / 392);
    expect(style['--from-rotation']).toBe(`${from.rotation}deg`);
    expect(style['--to-rotation']).toBe(`${to.rotation}deg`);
  });

  it('gives a tied card separate approaching and receding legs around the larger reveal', () => {
    const hand = anchor(420, 120, 48);
    const reveal = anchor(610, 380, 160);
    const style = getCaveDuelCardStyle(hand, reveal, hand);

    expect(Number.parseFloat(style['--duel-in-flight-depth'])).toBeGreaterThan(0);
    expect(Number.parseFloat(style['--duel-out-flight-depth'])).toBeLessThan(0);
    expect(Number.parseFloat(style['--duel-in-mid-tilt'])).toBeLessThan(0);
    expect(Number.parseFloat(style['--duel-out-mid-tilt'])).toBeGreaterThan(0);
    expect(style.width * style['--duel-in-mid-scale']).toBeCloseTo(48 + (160 - 48) * .55);
    expect(style.width * style['--duel-out-mid-scale']).toBeCloseTo(160 + (48 - 160) * .55);
    for (const name of ['--flight-perspective', '--duel-in-flight-perspective', '--duel-out-flight-perspective']) {
      expect(Number.parseFloat(style[name]) / style.width).toBeCloseTo(CARD_PERSPECTIVE_RATIO);
    }
    expect(style['--tx']).toBe('0px');
    expect(style['--ty']).toBe('0px');
  });

  it('preserves both shared-camera endpoint silhouettes when the reveal requires a larger sprite', () => {
    const source = { x: -350, y: 90, depth: 2, width: 100, rotation: -6, perspective: 1300 };
    const destination = { x: 360, y: -45, depth: 4, width: 140, rotation: 4, perspective: 1300 };
    const from = projectTableCard(source);
    const to = projectTableCard(destination);
    const style = getCaveDuelCardStyle(from, anchor(0, 0, 300), to);

    expect(style.width).toBe(300);
    for (const [stage, table] of [['from', source], ['to', destination]]) {
      const matrix = style[`--${stage}-plane`].slice('matrix3d('.length, -1).split(',').map(Number);
      const scale = style[`--${stage}-scale`];
      const centerX = style.left + style.width / 2 + (stage === 'to' ? Number.parseFloat(style['--tx']) : 0);
      const centerY = style.top + style.height / 2 + (stage === 'to' ? Number.parseFloat(style['--ty']) : 0);
      const roll = table.rotation * Math.PI / 180;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const x = sx * style.width / 2;
        const y = sy * style.height / 2;
        const denominator = matrix[3] * x + matrix[7] * y + matrix[15];
        const actualX = centerX + scale * (matrix[0] * x + matrix[4] * y) / denominator;
        const actualY = centerY + scale * (matrix[1] * x + matrix[5] * y) / denominator;
        const nativeX = sx * table.width / 2;
        const nativeY = sy * table.width * 590 / 392 / 2;
        const expected = projectTableCard({
          ...table,
          x: table.x + nativeX * Math.cos(roll) - nativeY * Math.sin(roll),
          y: table.y + nativeX * Math.sin(roll) + nativeY * Math.cos(roll),
        });
        expect(actualX).toBeCloseTo(expected.x, 8);
        expect(actualY).toBeCloseTo(expected.y, 8);
      }
    }
  });
});
