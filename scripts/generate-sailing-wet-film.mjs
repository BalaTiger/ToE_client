// Rebuild the small, static wet-film maps; no runtime noise/filter is needed.
// Black source-over equals black multiply; white source-over equals white
// screen. Both still work inside the artwork's isolated alpha-mask group.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'C:/Users/zhuzi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const width = 384, height = 512, samples = 2;
const sw = width * samples, sh = height * samples;
const out = fileURLToPath(new URL('../public/img/effects/sailing/', import.meta.url));
let seed = 0x51a71e;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
};
const wrap = (value, size) => ((value % size) + size) % size;
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (lo, hi, value) => {
  const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

function noise(cols, rows) {
  const values = Float64Array.from({ length: cols * rows }, random);
  return (x, y) => {
    const px = x * cols, py = y * rows;
    const ix = Math.floor(px), iy = Math.floor(py);
    const at = (dx, dy) => values[wrap(iy + dy, rows) * cols + wrap(ix + dx, cols)];
    return mix(mix(at(0, 0), at(1, 0), fade(px - ix)),
      mix(at(0, 1), at(1, 1), fade(px - ix)), fade(py - iy));
  };
}

// Integer torus phases keep the slanted film seamless. At 384 × 512, the
// normal of 2x+5y gives a flow tangent (-.8824,+.4706): upper right to lower
// left, matching the incoming bow spray rather than vertical dripping.
const warp = noise(3, 2), variation = noise(4, 3);
const phases = Array.from({ length: 4 }, () => random() * Math.PI * 2);
const tau = Math.PI * 2;
function field(x, y) {
  const bend = .75 * (warp(x, y) - .5);
  const across = 2 * x + 5 * y + bend;
  const along = 2 * x - y;
  // Adjacent tilted bands merge into branches. Along-flow modulation narrows
  // sections into pointed tails, instead of adding detached round specks.
  const streamPhase = wrap(along + phases[3] / tau, 1);
  // Along decreases downstream: a quick leading wet edge gives way to a
  // longer taper toward lower left, rather than symmetric oval islands.
  const tail = .24 + .76 * smooth(0, .78, streamPhase) * (1 - smooth(.78, 1, streamPhase));
  return .5 + .19 * Math.sin(tau * across + phases[0]) * tail
    + .06 * Math.sin(tau * (x + 2 * y + bend) + phases[1])
    + .05 * Math.sin(tau * (x + 3 * y + bend) + phases[3])
    + .038 * Math.sin(tau * (3 * x + 7 * y + bend) + phases[2])
    + .013 * Math.sin(tau * (5 * x + 11 * y + bend) + phases[3])
    + .045 * (variation(x, y) - .5) - .055 * (1 - tail);
}

// Check both values and slopes at each torus seam before rasterization.
const epsilon = 1e-5;
const dx = (x, y) => (field(x + epsilon, y) - field(x - epsilon, y)) / (2 * epsilon);
const dy = (x, y) => (field(x, y + epsilon) - field(x, y - epsilon)) / (2 * epsilon);
for (let i = 0; i <= 64; i++) {
  const t = i / 64;
  for (const sample of [field, dx, dy]) {
    assert(Math.abs(sample(0, t) - sample(1, t)) < 1e-8, 'horizontal seam');
    assert(Math.abs(sample(t, 0) - sample(t, 1)) < 1e-8, 'vertical seam');
  }
}

const heights = new Float64Array(sw * sh);
for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
  heights[y * sw + x] = field((x + .5) / sw, (y + .5) / sh);
}
const sorted = heights.slice().sort();
const threshold = sorted[Math.floor(sorted.length * .53)];
const at = (x, y) => heights[wrap(y, sh) * sw + wrap(x, sw)];
const dark = Buffer.alloc(sw * sh * 4), reflection = Buffer.alloc(sw * sh * 4);
let gradientXX = 0, gradientXY = 0, gradientYY = 0;
for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
  const h = at(x, y), index = (y * sw + x) * 4;
  const wet = smooth(threshold - .034, threshold + .043, h);
  const gx = (at(x + 1, y) - at(x - 1, y)) * samples / 2;
  const gy = (at(x, y + 1) - at(x, y - 1)) * samples / 2;
  gradientXX += gx * gx; gradientXY += gx * gy; gradientYY += gy * gy;
  const slope = Math.hypot(gx, gy);
  // Outward normal of the wet patch dotted with an upper-right light.
  const light = slope > 1e-7 ? Math.max(0, (-gx + gy) / (Math.SQRT2 * slope)) : 0;
  const distance = (h - threshold) / Math.max(.0002, slope);
  // FWHM ~2.5 texture pixels survives the 240/384 or 300/384 display scale.
  // The lit half has a useful floor: grazing long edges must not disappear
  // after both scene opacity and the incoming-splash position mask.
  const facing = smooth(0, .12, light) * (.5 + .5 * light);
  const breakup = smooth(.18, .32, variation((x + .5) / sw, (y + .5) / sh));
  const edge = Math.exp(-(((distance - .35) / 1.5) ** 2)) * facing * breakup * smooth(.12, .34, wet);
  // A broad reflection lives inside the same connected directional patches.
  // Edge-only subpixel outlines looked dry in the actual dark game scene.
  const sheen = smooth(threshold + .025, threshold + .175, h);
  const broad = wet * (.012 + .27 * sheen ** 2) * (.78 + .22 * light);
  dark[index + 3] = Math.round(255 * .27 * wet);
  reflection[index] = reflection[index + 1] = reflection[index + 2] = 255;
  reflection[index + 3] = Math.round(255 * Math.min(.48, .48 * edge + broad));
  if (reflection[index + 3] > 16) assert(wet > .12, 'reflection must follow the shared wet field');
}

// The smallest-gradient axis is the field's measured streak direction.
const normalAngle = .5 * Math.atan2(2 * gradientXY, gradientXX - gradientYY);
const flow = [-Math.sin(normalAngle), Math.cos(normalAngle)];
assert(flow[0] < 0 && flow[1] > 0, 'flow must point from upper right to lower left');
assert(flow[0] * -.88 + flow[1] * .47 > .995, 'film must follow the spray direction');

await mkdir(out, { recursive: true });
for (const [name, rgba, rgb] of [['dark', dark, 0], ['reflection', reflection, 255]]) {
  const file = `${out}/wet-film-${name}.webp`;
  // Area-average before encoding gives deterministic antialiasing without
  // resize-kernel ringing or non-periodic image-edge padding.
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 4;
    pixels[index] = pixels[index + 1] = pixels[index + 2] = rgb;
    let alpha = 0;
    for (let yy = 0; yy < samples; yy++) for (let xx = 0; xx < samples; xx++) {
      alpha += rgba[((y * samples + yy) * sw + x * samples + xx) * 4 + 3];
    }
    pixels[index + 3] = Math.round(alpha / (samples * samples));
  }
  await sharp(pixels, { raw: { width, height, channels: 4 } }).webp({ lossless: true, effort: 6 }).toFile(file);
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, width); assert.equal(info.height, height);
  let sum = 0, max = 0, covered = 0, strong = 0;
  const alpha = [];
  for (let i = 3; i < data.length; i += 4) {
    assert.equal(data[i], pixels[i], 'lossless alpha consistency');
    sum += data[i]; max = Math.max(max, data[i]);
    covered += data[i] >= 8; strong += data[i] >= 26; alpha.push(data[i]);
  }
  alpha.sort((a, b) => a - b);
  const count = width * height;
  const mean = sum / count / 255, p95 = alpha[Math.floor(count * .95)] / 255;
  if (name === 'dark') {
    assert(covered / count >= .45 && covered / count <= .60, 'wet coverage');
    assert(mean >= .12 && mean <= .14 && max / 255 <= .28, 'readable dark wetness');
  } else {
    // These are visible material areas, not the old nearly-zero hairline goal.
    assert(mean >= .045 && mean <= .06, 'visible broad reflection');
    assert(p95 >= .14 && p95 <= .25, 'restrained reflected film');
    assert(strong / count >= .16 && strong / count <= .25, 'connected sheen area');
    assert(max / 255 >= .4 && max / 255 <= .5, 'visible directional edge');
  }
  console.log(JSON.stringify({ file: `wet-film-${name}.webp`, width, height, bytes: (await stat(file)).size,
    revision: createHash('sha256').update(await readFile(file)).digest('hex').slice(0, 16),
    alphaMean: +(sum / count / 255).toFixed(4), alphaP95: +(alpha[Math.floor(count * .95)] / 255).toFixed(4),
    alphaPeak: +(max / 255).toFixed(4), coverageAbove3Percent: +(covered / count).toFixed(4),
    coverageAbove10Percent: +(strong / count).toFixed(4),
    flowDirection: flow.map(value => +value.toFixed(4)), seamless: true }));
}
