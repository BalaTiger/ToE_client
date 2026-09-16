// Deterministic production slicing; the matte rules are the same as
// extract-coastal-assets.mjs. No generated artwork is repainted or stretched.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'C:/Users/zhuzi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const script = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(script), '..');
const docs = path.join(root, 'docs/coastal-corner-b-2026-09-16');
const output = path.join(root, 'public/img/ui/coastal');
const generated = process.argv[2] || 'E:/Codex/codex-home/generated_images/01a094e6-b663-7ab2-ac74-ac53e4bb49c0';
const sources = [
  { name: 'corner-b-header', file: 'exec-d386509c-0beb-4f3e-a850-988d56d0756f.png' },
  { name: 'corner-b-journal', file: 'exec-c8849fcf-0d37-4d7c-845a-b2c2eddfc424.png', clearEnclosedMatte: false },
  { name: 'corner-b-control', file: 'exec-367d2b9a-d69b-453e-9d86-8e8cd6cb863e.png', square: true },
];

function components(mask, width, height) {
  const seen = new Uint8Array(mask.length);
  const groups = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const group = [start];
    seen[start] = 1;
    for (let cursor = 0; cursor < group.length; cursor++) {
      const i = group[cursor], x = i % width;
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

function extractAlpha(rgb, width, height, matteMinChannel = 130, clearEnclosedMatte = true) {
  const count = width * height;
  const candidate = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const values = rgb.subarray(i * 3, i * 3 + 3);
    candidate[i] = Math.min(...values) >= matteMinChannel && Math.max(...values) - Math.min(...values) <= 22 ? 1 : 0;
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
    if (border || (clearEnclosedMatte && group.length >= 32 && high - low >= 38)) {
      group.forEach(i => { visible[i] = 0; });
      clearedComponents++;
    }
  }
  const groups = components(visible, width, height).sort((a, b) => b.length - a.length);
  visible.fill(0);
  groups[0]?.forEach(i => { visible[i] = 1; });
  const rgba = Buffer.alloc(count * 4);
  let left = width, top = height, right = 0, bottom = 0;
  for (let i = 0; i < count; i++) {
    if (!visible[i]) continue;
    const x = i % width, y = Math.floor(i / width);
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
    rgba.set(rgb.subarray(i * 3, i * 3 + 3), i * 4);
    rgba[i * 4 + 3] = 255;
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
  const trim = {
    left: Math.max(0, left - 2), top: Math.max(0, top - 2),
    width: Math.min(width, right + 2) - Math.max(0, left - 2),
    height: Math.min(height, bottom + 2) - Math.max(0, top - 2),
  };
  return { rgba, trim, alphaBounds: { left, top, width: right - left, height: bottom - top }, clearedComponents };
}

await fs.mkdir(docs, { recursive: true });
await fs.mkdir(output, { recursive: true });
const records = [];
for (const source of sources) {
  const archive = path.join(docs, `${source.name}-master.png`);
  try { await fs.access(archive); } catch { await fs.copyFile(path.join(generated, source.file), archive); }
  const original = await fs.readFile(archive);
  const sourceMetadata = await sharp(original).metadata();
  if (sourceMetadata.hasAlpha) throw new Error(`${source.name}: preserve native alpha instead of running this RGB-matte extraction`);
  const { data: rgb, info } = await sharp(original).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  const { rgba, trim, alphaBounds, clearedComponents } = extractAlpha(rgb, info.width, info.height, source.matteMinChannel, source.clearEnclosedMatte);
  const side = Math.max(trim.width, trim.height);
  const extension = source.square ? {
    left: Math.floor((side - trim.width) / 2), right: Math.ceil((side - trim.width) / 2),
    top: Math.floor((side - trim.height) / 2), bottom: Math.ceil((side - trim.height) / 2),
  } : { left: 0, right: 0, top: 0, bottom: 0 };
  const file = path.join(output, `${source.name}.webp`);
  await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract(trim).extend({ ...extension, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 94, alphaQuality: 100, effort: 6 }).toFile(file);
  const data = await fs.readFile(file);
  const metadata = await sharp(data).metadata();
  if (!metadata.hasAlpha || (source.square && metadata.width !== metadata.height)) throw new Error(`${source.name}: invalid output shape/alpha`);
  const decoded = await sharp(data).ensureAlpha().raw().toBuffer();
  const corners = [0, metadata.width - 1, (metadata.height - 1) * metadata.width, metadata.width * metadata.height - 1];
  if (corners.some(index => decoded[index * 4 + 3] !== 0)) throw new Error(`${source.name}: matte remains at a canvas corner`);
  if (source.name === 'corner-b-journal') {
    for (let y = 170; y <= 1175; y += 5) for (let x = 255; x <= 860; x += 5) {
      if (decoded[(y * metadata.width + x) * 4 + 3] !== 255) throw new Error('Journal text-safe paper was incorrectly made transparent');
    }
  }
  records.push({
    name: source.name, path: path.relative(root, file).replaceAll('\\', '/'),
    source: source.file, archivedSource: path.relative(root, archive).replaceAll('\\', '/'),
    sourceSize: [info.width, info.height], sourceHasAlpha: sourceMetadata.hasAlpha,
    sourceSha256: createHash('sha256').update(original).digest('hex'),
    alphaBounds, trim, extension, matteMinChannel: source.matteMinChannel ?? 130, clearEnclosedMatte: source.clearEnclosedMatte ?? true,
    size: [metadata.width, metadata.height], aspectRatio: metadata.width / metadata.height,
    hasAlpha: metadata.hasAlpha, clearedComponents, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'),
  });
}
await fs.copyFile(script, path.join(docs, 'extract-coastal-corner-b-assets.mjs'));
await fs.writeFile(path.join(docs, 'production-assets.json'), `${JSON.stringify({
  generator: 'scripts/extract-coastal-corner-b-assets.mjs',
  generationMode: 'Built-in image_gen; original generated masters archived unmodified',
  originalSourceDirectory: generated.replaceAll('\\', '/'),
  processing: {
    operation: 'Deterministic matte extraction only, preserving the generated painted RGB and native geometry',
    basedOn: 'scripts/extract-coastal-assets.mjs',
    neutralMatte: { minChannel: 130, maxChannelSpread: 22 },
    enclosedCheckerboard: { minArea: 32, minLuminanceRange: 38 },
    alpha: 'Exterior matte removal, optional checked-hole removal except journal paper, largest connected subject, one-pixel edge decontamination',
    trimPadding: 2, circularCanvas: 'Transparent padding only; no resampling or nonuniform scaling',
    webp: { quality: 94, alphaQuality: 100, effort: 6 },
  }, assets: records,
}, null, 2)}\n`);

const previewWidth = 1440, previewHeight = 1230;
const composites = [];
for (const [index, record] of records.entries()) {
  const box = index === 0 ? { left: 20, top: 45, width: 1400, height: 345 } :
    index === 1 ? { left: 40, top: 455, width: 570, height: 745 } : { left: 730, top: 495, width: 620, height: 620 };
  const tile = await sharp(path.join(root, record.path)).resize(box.width, box.height, { fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
  composites.push({ input: tile.data, left: box.left + Math.floor((box.width - tile.info.width) / 2), top: box.top + Math.floor((box.height - tile.info.height) / 2) });
  const label = Buffer.from(`<svg width="700" height="36"><text x="0" y="26" fill="#b8b0a0" font-size="22" font-family="sans-serif">${record.name} · ${record.size.join(' × ')}</text></svg>`);
  composites.push({ input: label, left: index === 2 ? 730 : 30, top: index === 0 ? 6 : 411 });
}
await sharp({ create: { width: previewWidth, height: previewHeight, channels: 3, background: '#102125' } })
  .composite(composites).png().toFile(path.join(docs, 'production-assets-dark-preview.png'));
console.log(JSON.stringify(records, null, 2));
