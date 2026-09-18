// Static alpha only: localize the approved wet artwork, never paint material.
// Run offline; the browser intersects this footprint with its moving front.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'C:/Users/zhuzi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = `${root}public/img/effects/sailing/`;
const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const hash = (x, y, seed) => {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
function noise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), u = smooth(x - ix), v = smooth(y - iy);
  const a = hash(ix, iy, seed) * (1 - u) + hash(ix + 1, iy, seed) * u;
  const b = hash(ix, iy + 1, seed) * (1 - u) + hash(ix + 1, iy + 1, seed) * u;
  return (a * (1 - v) + b * v) * 2 - 1;
}

// Joined fingers taper downstream from one wider impact. Unequal lengths,
// bends and widths supply the splash silhouette; noise only roughens its rim.
const baseline = {
  // Screen Y increases downward. The sea is below these upright surfaces:
  // water strikes their lower-right edge and spreads toward the upper-left.
  seed: 17, direction: [.85, -.527], head: [.25, .145],
  panel: { impact: [.96, .62], scale: 1 },
  torch: { impact: [.84, .70], scale: .68 },
  fingers: [
    { length: .96, spread: .02, width: .095, bend: -.025 },
    { length: .73, spread: -.19, width: .086, bend: .012 },
    { length: .57, spread: .24, width: .085, bend: .025 },
  ],
};
function variantShape(variant, attempt) {
  let seed = (0x51a71e + Math.imul(variant, 104729) + Math.imul(attempt, 65537)) >>> 0;
  const random = (lo, hi) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return lo + (hi - lo) * seed / 0x100000000;
  };
  const angle = -random(24, 40) * Math.PI / 180;
  return {
    seed: Math.floor(random(18, 0x7fffffff)), direction: [Math.cos(angle), Math.sin(angle)],
    head: [random(.23, .28), random(.13, .165)],
    panel: { impact: [random(.88, 1.04), random(.53, .73)], scale: random(.94, 1.04) },
    torch: { impact: [random(.76, .91), random(.64, .82)], scale: random(.64, .74) },
    fingers: baseline.fingers.map((finger, index) => ({
      length: finger.length * random(.9, 1.1),
      spread: finger.spread + random(-.045, .045),
      width: finger.width * random(.85, 1.17),
      bend: finger.bend + random(-.027, .027) * (index ? 1 : .7),
    })),
  };
}
function splashDistance(u, v, surface, shape) {
  const { impact, scale } = shape[surface];
  const dx = u - impact[0], dy = v - impact[1];
  const along = -shape.direction[0] * dx + shape.direction[1] * dy;
  const across = shape.direction[1] * dx + shape.direction[0] * dy;
  let distance = Math.hypot(along / (shape.head[0] * scale), across / (shape.head[1] * scale)) - 1;
  distance *= shape.head[1] * scale;
  for (const finger of shape.fingers) {
    const length = finger.length * scale;
    const t = Math.max(0, Math.min(1, along / length));
    const center = scale * (finger.spread * t + finger.bend * Math.sin(Math.PI * t));
    const halfWidth = scale * (finger.width * Math.pow(1 - t, .7) + .006);
    const side = Math.abs(across - center) - halfWidth;
    distance = Math.min(distance, Math.max(side, along - length, -along));
  }
  return distance;
}

function rasterize(surface, shape, width) {
  const height = width * (surface === 'panel' ? 2 : 1.5);
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x / (width - 1), v = y / (height - 1);
    const distance = splashDistance(u, v, surface, shape);
    const edgeNoise = .012 * noise(u * 12, v * 18, shape.seed) + .005 * noise(u * 31 + 31, v * 47 + 7, shape.seed)
      + .002 * noise(u * 67 + 13, v * 99 + 19, shape.seed);
    const alpha = 1 - smooth((distance + edgeNoise + .004) / .008);
    const i = (y * width + x) * 4;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
    pixels[i + 3] = Math.round(255 * alpha);
  }
  return { width, height, pixels };
}

const materials = {};
async function materialFor(surface, width, height) {
  const key = `${surface}:${width}`;
  if (materials[key]) return materials[key];
  // Measure on the visible material, not the torch's mostly transparent canvas.
  const materialPath = surface === 'panel'
    ? `${root}docs/sailing-wet-lookdev-2026-09-18/assets/panel-dry-template.png`
    : `${root}public/img/ui/coastal/torch-hand.webp`;
  materials[key] = await sharp(materialPath).resize(width, height).ensureAlpha().raw().toBuffer();
  return materials[key];
}
function visibleMaterial(surface, material, width, height, x, y) {
  return material[(y * width + x) * 4 + 3] >= 128
    && !(surface === 'panel' && (x < width * .107 || x > width * .893 || y < height * .05 || y > height * .944));
}
function coverageFor(surface, raster, material) {
  const { width, height, pixels } = raster;
  let visible = 0, dry = 0, wet = 0, soft = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (!visibleMaterial(surface, material, width, height, x, y)) continue;
    visible++;
    if (pixels[i + 3] === 0) dry++;
    else if (pixels[i + 3] >= 230) wet++;
    else soft++;
  }
  return { dry: dry / visible, wet: wet / visible, soft: soft / visible };
}
function validCoverage(surface, coverage) {
  return coverage.dry >= .45 && coverage.wet >= (surface === 'torch' ? .12 : .15) && coverage.wet < .5;
}
function coverageDifference(surface, first, second, material) {
  const { width, height } = first;
  let difference = 0, count = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!visibleMaterial(surface, material, width, height, x, y)) continue;
    const i = (y * width + x) * 4 + 3;
    difference += Math.abs(first.pixels[i] - second.pixels[i]) / 255;
    count++;
  }
  return difference / count;
}

// CSS radial-gradient ownership: opaque to 70% radius, then linear fade to 0.
// Only geometry is exported; the approved wet artwork/footprints stay intact.
const regionFeather = [.7, 1];
function fingerRegion(shape, surface, fingerIndex, t, size = 1, tail = false) {
  const finger = shape.fingers[fingerIndex], { impact, scale } = shape[surface];
  const along = finger.length * scale * t;
  const across = scale * (finger.spread * t + finger.bend * Math.sin(Math.PI * t));
  const [a, b] = shape.direction, norm = a * a + b * b;
  const radii = surface === 'panel' ? (tail ? [.17, .085] : [.14, .065])
    : (tail ? [.13, .08] : [.11, .07]);
  const round = value => +value.toFixed(5);
  return {
    x: round(impact[0] + (-a * along + b * across) / norm),
    y: round(impact[1] + (b * along + a * across) / norm),
    rx: round(radii[0] * size), ry: round(radii[1] * size),
  };
}
function regionAlpha(region, u, v) {
  const radius = Math.hypot((u - region.x) / region.rx, (v - region.y) / region.ry);
  return Math.max(0, Math.min(1, (regionFeather[1] - radius) / (regionFeather[1] - regionFeather[0])));
}
function wetRegions(shape, surface, raster, material) {
  const { width, height, pixels } = raster, points = [];
  let total = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!visibleMaterial(surface, material, width, height, x, y)) continue;
    const i = (y * width + x) * 4 + 3;
    const weight = pixels[i] / 255 * material[i] / 255;
    if (weight === 0) continue;
    points.push([x / (width - 1), y / (height - 1), weight]);
    total += weight;
  }
  const sample = region => {
    const alpha = new Float64Array(points.length);
    let sum = 0;
    points.forEach(([u, v, weight], index) => { alpha[index] = regionAlpha(region, u, v); sum += alpha[index] * weight; });
    return { region, alpha, share: sum / total };
  };
  const early = [], tail = [];
  for (const size of [1, 1.12, 1.25]) {
    for (const t of [.5, .45, .55, .4, .6]) early.push({
      ...sample(fingerRegion(shape, surface, 0, t, size)), cost: Math.abs(t - .5) * 3 + (size - 1),
    });
    for (const [finger, t] of [[2, .75], [2, .68], [2, .82], [2, .6], [2, .88], [1, .75], [0, .8]]) tail.push({
      ...sample(fingerRegion(shape, surface, finger, t, size, true)),
      cost: (finger === 2 ? 0 : 1) + Math.abs(t - .75) * 3 + (size - 1),
    });
  }
  let best;
  for (const e of early) for (const l of tail) {
    if (l.share < .07 || l.share > .4 || e.share < .07) continue;
    let overlap = 0;
    points.forEach((point, index) => { overlap += e.alpha[index] * l.alpha[index] * point[2]; });
    overlap /= total;
    const shares = { main: 1 - e.share - l.share + overlap, early: e.share - overlap, tail: l.share };
    if (shares.main <= .55 || shares.early < .07) continue;
    const cost = e.cost + l.cost;
    if (!best || cost < best.cost) best = { early: e.region, tail: l.region, shares, cost };
  }
  assert(best, `${surface}/${shape.variant}: timing regions must have visible wet material`);
  assert(Math.abs(best.shares.main + best.shares.early + best.shares.tail - 1) < 1e-12, 'ownership partitions the footprint exactly');
  for (const region of [best.early, best.tail]) {
    assert(region.x >= 0 && region.x <= 1 && region.y >= 0 && region.y <= 1, 'normalized timing anchor');
  }
  return {
    // Some splash heads start just outside the panel; the runtime anchor is
    // clipped to its visible edge without moving the original footprint.
    impact: shape[surface].impact.map(value => +Math.max(0, Math.min(1, value)).toFixed(5)),
    early: best.early, tail: best.tail,
    shares: Object.fromEntries(Object.entries(best.shares).map(([key, value]) => [key, +value.toFixed(5)])),
  };
}

const records = [], shapes = [], comparisons = { panel: [], torch: [] };
for (let variant = 0; variant < 6; variant++) {
  let selected;
  // Keep visible differences on both actual materials, not just empty canvas.
  // Rejection is deterministic and offline; the game only chooses these files.
  for (let attempt = 0; attempt < 80; attempt++) {
    const shape = variant ? variantShape(variant, attempt) : baseline;
    const rasters = {}, coverage = {}, difference = {};
    let valid = true;
    for (const surface of ['panel', 'torch']) {
      const raster = rasters[surface] = rasterize(surface, shape, 256);
      const material = await materialFor(surface, raster.width, raster.height);
      coverage[surface] = coverageFor(surface, raster, material);
      difference[surface] = comparisons[surface].length ? Math.min(...comparisons[surface].map(previous =>
        coverageDifference(surface, raster, previous, material))) : 1;
      valid &&= validCoverage(surface, coverage[surface]) && difference[surface] >= .07;
    }
    if (!variant) assert(valid, `baseline coverage: ${JSON.stringify(coverage)}`);
    if (valid) { selected = { shape, rasters, attempt, difference }; break; }
  }
  assert(selected, `variant ${variant}: no clearly distinct local footprint found`);
  const { shape, rasters, attempt, difference } = selected;
  for (const surface of ['panel', 'torch']) for (let finger = 0; finger < shape.fingers.length; finger++) {
    const tip = fingerRegion(shape, surface, finger, 1);
    const [x, y] = shape[surface].impact;
    assert(tip.x < x && tip.y < y, `${surface}/${variant}: splash fingers must climb leftward from the sea`);
  }
  shapes.push({ variant, attempt, ...shape });
  for (const surface of ['panel', 'torch']) {
    comparisons[surface].push(rasters[surface]);
    // Keep the existing raster sizes. Only alpha coverage changes direction;
    // the registered dry/wet artwork is never flipped or moved.
    const raster = variant ? rasters[surface] : rasterize(surface, shape, 384);
    const { width, height, pixels } = raster;
    const material = await materialFor(surface, width, height);
    const coverage = coverageFor(surface, raster, material);
    assert(validCoverage(surface, coverage), `${surface}/${variant}: ${JSON.stringify(coverage)}`);
    const name = `${surface}-wet-coverage${variant ? `-${variant}` : ''}.webp`, path = `${output}${name}`;
    const data = await sharp(pixels, { raw: { width, height, channels: 4 } }).webp({ lossless: true, effort: 6 }).toBuffer();
    await writeFile(path, data);
    records.push({ variant, surface, name, width, height, bytes: data.length, coverage,
      minDifferenceFromEarlier: difference[surface], sha256: createHash('sha256').update(data).digest('hex') });
  }
}
const revision = createHash('sha256').update(records.map(record => record.sha256).join('')).digest('hex').slice(0, 16);
const totalBytes = records.reduce((sum, record) => sum + record.bytes, 0);
const decodedBytes = records.reduce((sum, record) => sum + record.width * record.height * 4, 0);
assert(decodedBytes < 6.5 * 1024 * 1024, 'mobile decoded coverage budget');
const variants = [];
for (const shape of shapes) {
  const regions = {};
  for (const surface of ['panel', 'torch']) {
    const raster = rasterize(surface, shape, shape.variant ? 256 : 384);
    regions[surface] = wetRegions(shape, surface, raster, await materialFor(surface, raster.width, raster.height));
  }
  variants.push(regions);
}
await writeFile(`${root}src/constants/sailingWetRegions.json`, JSON.stringify({ revision, feather: regionFeather, variants }, null, 2) + '\n');
await writeFile(`${root}docs/sailing-wet-lookdev-2026-09-18/assets/coverage-assets.json`,
  JSON.stringify({ revision, totalBytes, decodedBytes, shapes, records }, null, 2) + '\n');
console.log(JSON.stringify({ revision, totalBytes, decodedMiB: decodedBytes / 1024 / 1024, records }, null, 2));
console.log(JSON.stringify({ timingRegionShares: variants.map(regions => Object.fromEntries(
  Object.entries(regions).map(([surface, region]) => [surface, region.shares]))) }, null, 2));
