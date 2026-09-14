// Deterministic extraction only: remove the generated checkerboard matte, retain
// the original painted RGB, and export the approved coastal UI as alpha WebP.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'C:/Users/zhuzi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = path.join(root, 'docs/layout-3-dlc-proposals-2026-09-14');
const output = path.join(root, 'public/img/ui/coastal');
const generated = process.argv[2] || 'E:/Codex/codex-home/generated_images/01a094e6-b663-7ab2-ac74-ac53e4bb49c0';
const sources = {
  panels: 'exec-2599d90f-9db2-4dab-8b0a-8582c672480b.png',
  controls: 'exec-5c6ea1e6-096a-47b0-b0da-9ece1eb7db03.png',
  foreground: 'exec-1584fad8-a64f-4bd5-997e-1d6350116892.png',
};
const slices = [
  ['self-frame', 'panels', 24, 14, 830, 379],
  ['opponent-frame', 'panels', 939, 10, 482, 393],
  ['faith-banner', 'panels', 204, 405, 389, 614],
  ['log-banner', 'panels', 935, 409, 450, 612],
  ['action-skill', 'controls', 0, 0, 740, 174],
  ['action-rest', 'controls', 0, 174, 740, 164],
  ['action-multiply', 'controls', 0, 338, 740, 169],
  ['action-end', 'controls', 0, 507, 740, 168],
  ['prompt', 'controls', 0, 675, 740, 128],
  ['counter', 'controls', 0, 803, 740, 190],
  ['turn-dial', 'controls', 750, 0, 786, 530],
  ['hand-count', 'controls', 925, 503, 450, 459],
  ['foreground', 'foreground', 0, 0, 1536, 1024],
];
await fs.mkdir(output, { recursive: true });
await fs.mkdir(docs, { recursive: true });
const archived = {};
for (const [name, filename] of Object.entries(sources)) {
  archived[name] = path.join(docs, `production-${name}-master.png`);
  try { await fs.access(archived[name]); } catch { await fs.copyFile(path.join(generated, filename), archived[name]); }
}

function components(mask, width, height) {
  const seen = new Uint8Array(mask.length);
  const groups = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const group = [start];
    seen[start] = 1;
    for (let cursor = 0; cursor < group.length; cursor++) {
      const i = group[cursor];
      const x = i % width;
      for (const next of [x ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width]) {
        if (next < 0 || next >= width * height || seen[next] || !mask[next]) continue;
        seen[next] = 1;
        group.push(next);
      }
    }
    groups.push(group);
  }
  return groups;
}

function extractAlpha(rgb, width, height, keepFullCanvas) {
  const count = width * height;
  const candidate = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const values = rgb.subarray(i * 3, i * 3 + 3);
    candidate[i] = Math.min(...values) >= 130 && Math.max(...values) - Math.min(...values) <= 22 ? 1 : 0;
  }
  const visible = new Uint8Array(count).fill(1);
  let clearedComponents = 0;
  for (const group of components(candidate, width, height)) {
    let border = false, low = 255, high = 0;
    for (const i of group) {
      const x = i % width;
      border ||= x === 0 || x === width - 1 || i < width || i >= count - width;
      low = Math.min(low, rgb[i * 3]);
      high = Math.max(high, rgb[i * 3]);
    }
    // Enclosed checkerboard holes alternate between light and dark neutral
    // squares. Small enclosed candle cores and metal glints remain opaque.
    if (border || (group.length >= 32 && high - low >= 38)) {
      group.forEach(i => { visible[i] = 0; });
      clearedComponents++;
    }
  }
  if (!keepFullCanvas) {
    const groups = components(visible, width, height).sort((a, b) => b.length - a.length);
    visible.fill(0);
    groups[0]?.forEach(i => { visible[i] = 1; });
  } else {
    // Remove isolated matte specks, while retaining detached painted flame tips.
    for (const group of components(visible, width, height)) {
      if (group.length < 12) group.forEach(i => { visible[i] = 0; });
    }
  }
  const rgba = Buffer.alloc(count * 4);
  let left = width, top = height, right = 0, bottom = 0;
  for (let i = 0; i < count; i++) {
    if (!visible[i]) continue;
    const x = i % width, y = Math.floor(i / width);
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
    rgba.set(rgb.subarray(i * 3, i * 3 + 3), i * 4);
    rgba[i * 4 + 3] = 255;
    // Decontaminate the one-pixel boundary with nearby original foreground
    // color. This removes pale checkerboard anti-aliasing without dark outlines.
    const neighbor = [x ? i - 1 : i, x < width - 1 ? i + 1 : i, y ? i - width : i, y < height - 1 ? i + width : i];
    if (!neighbor.some(next => !visible[next])) continue;
    const current = [...rgb.subarray(i * 3, i * 3 + 3)];
    if (Math.min(...current) < 90 || Math.max(...current) - Math.min(...current) > 55) continue;
    let nearest = null, nearestDistance = Infinity;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const nx = x + dx, ny = y + dy, distance = dx * dx + dy * dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || !distance || distance >= nearestDistance) continue;
      const next = ny * width + nx;
      if (!visible[next]) continue;
      const color = [...rgb.subarray(next * 3, next * 3 + 3)];
      if (Math.min(...color) < 70 || Math.max(...color) - Math.min(...color) > 55) {
        nearest = color; nearestDistance = distance;
      }
    }
    if (!nearest) continue;
    const estimates = current.map((value, channel) => (225 - value) / (225 - nearest[channel])).filter(Number.isFinite);
    const alpha = Math.max(0.25, Math.min(1, estimates.sort((a, b) => a - b)[1]));
    rgba.set(nearest, i * 4);
    rgba[i * 4 + 3] = Math.round(alpha * 255);
  }
  if (!right || !bottom) throw new Error('Matte removal produced an empty asset');
  const trim = keepFullCanvas ? { left: 0, top: 0, width, height } : {
    left: Math.max(0, left - 2), top: Math.max(0, top - 2),
    width: Math.min(width, right + 2) - Math.max(0, left - 2),
    height: Math.min(height, bottom + 2) - Math.max(0, top - 2),
  };
  return { rgba, trim, clearedComponents };
}

const records = [];
for (const [name, source, left, top, width, height] of slices) {
  const crop = { left, top, width, height };
  const rgb = await sharp(archived[source]).extract(crop).removeAlpha().toColourspace('srgb').raw().toBuffer();
  const { rgba, trim, clearedComponents } = extractAlpha(rgb, width, height, name === 'foreground');
  const file = path.join(output, `${name}.webp`);
  await sharp(rgba, { raw: { width, height, channels: 4 } }).extract(trim).webp({ quality: 94, alphaQuality: 100, effort: 6 }).toFile(file);
  const data = await fs.readFile(file);
  const metadata = await sharp(data).metadata();
  if (!metadata.hasAlpha) throw new Error(`${name} lost alpha`);
  records.push({ name, path: path.relative(root, file).replaceAll('\\', '/'), source: sources[source], archivedSource: path.relative(root, archived[source]).replaceAll('\\', '/'), crop, trim, size: [metadata.width, metadata.height], hasAlpha: metadata.hasAlpha, clearedComponents, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
}
await fs.writeFile(path.join(docs, 'production-assets.json'), `${JSON.stringify({
  generator: 'scripts/extract-coastal-assets.mjs',
  originalSourceDirectory: generated.replaceAll('\\', '/'),
  processing: { operation: 'Deterministic extraction of generated artwork; no repainting or recoloring', neutralMatte: { minChannel: 130, maxChannelSpread: 22 }, enclosedCheckerboard: { minArea: 32, minLuminanceRange: 38 }, alpha: 'Exterior/checked-hole removal, largest connected subject except full foreground, one-pixel edge decontamination', trimPadding: 2, webp: { quality: 94, alphaQuality: 100, effort: 6 } },
  assets: records,
}, null, 2)}\n`);

const composites = [];
for (let i = 0; i < records.length - 1; i++) {
  const record = records[i];
  const tile = await sharp(path.join(root, record.path)).resize(492, 316, { fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
  composites.push({ input: tile.data, left: (i % 3) * 512 + Math.floor((512 - tile.info.width) / 2), top: Math.floor(i / 3) * 360 + 36 + Math.floor((316 - tile.info.height) / 2) });
  const label = Buffer.from(`<svg width="512" height="34"><text x="16" y="24" fill="#b8b0a0" font-size="20" font-family="sans-serif">${record.name} · ${record.size.join(' × ')}</text></svg>`);
  composites.push({ input: label, left: (i % 3) * 512, top: Math.floor(i / 3) * 360 });
}
composites.push({ input: path.join(output, 'foreground.webp'), left: 0, top: 1440 });
await sharp({ create: { width: 1536, height: 2464, channels: 3, background: '#112327' } }).composite(composites).png().toFile(path.join(docs, 'production-assets-dark-preview.png'));
console.log(JSON.stringify(records.map(({ name, size, bytes }) => ({ name, size, bytes })), null, 2));
