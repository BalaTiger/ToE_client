// Deterministic matte extraction only; retain the generated icon painting.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'C:/Users/zhuzi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = path.join(root, 'docs/layout-3-dlc-proposals-2026-09-14');
const output = path.join(root, 'public/img/ui/coastal');
const generated = process.argv[2] || 'E:/Codex/codex-home/generated_images/01a094e6-b663-7ab2-ac74-ac53e4bb49c0';
const sources = {
  'system-pause': 'exec-82bcad05-e2dd-4ecb-9e6e-b0cbff8b3e27.png',
  'system-settings': 'exec-7b4d56f8-9b97-4581-84bf-44553eef5dd0.png',
};
const sha256 = data => createHash('sha256').update(data).digest('hex');
const relative = file => path.relative(root, file).replaceAll('\\', '/');

function components(mask, width) {
  const seen = new Uint8Array(mask.length), groups = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const group = [start];
    seen[start] = 1;
    for (let cursor = 0; cursor < group.length; cursor++) {
      const i = group[cursor], x = i % width;
      for (const next of [x ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width]) {
        if (next < 0 || next >= mask.length || seen[next] || !mask[next]) continue;
        seen[next] = 1;
        group.push(next);
      }
    }
    groups.push(group);
  }
  return groups;
}

function extractAlpha(rgb, width, height) {
  const count = width * height, neutral = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const color = rgb.subarray(i * 3, i * 3 + 3);
    neutral[i] = Math.min(...color) >= 130 && Math.max(...color) - Math.min(...color) <= 22 ? 1 : 0;
  }
  const visible = new Uint8Array(count).fill(1);
  for (const group of components(neutral, width)) {
    if (group.some(i => i < width || i >= count - width || i % width === 0 || i % width === width - 1)) {
      group.forEach(i => { visible[i] = 0; });
    }
  }
  const foreground = components(visible, width).sort((a, b) => b.length - a.length)[0];
  assert(foreground?.length > count * 0.4, 'Expected one substantial painted icon');
  visible.fill(0);
  foreground.forEach(i => { visible[i] = 1; });
  const rgba = Buffer.alloc(count * 4);
  let left = width, top = height, right = 0, bottom = 0;
  for (const i of foreground) {
    const x = i % width, y = Math.floor(i / width);
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
    rgba.set(rgb.subarray(i * 3, i * 3 + 3), i * 4);
    rgba[i * 4 + 3] = 255;
    if (![i - 1, i + 1, i - width, i + width].some(next => !visible[next])) continue;
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
    const estimates = current.map((value, channel) => (225 - value) / (225 - nearest[channel])).sort((a, b) => a - b);
    rgba.set(nearest, i * 4);
    rgba[i * 4 + 3] = Math.round(Math.max(0.25, Math.min(1, estimates[1])) * 255);
  }
  return { rgba, trim: {
    left: Math.max(0, left - 2), top: Math.max(0, top - 2),
    width: Math.min(width, right + 2) - Math.max(0, left - 2),
    height: Math.min(height, bottom + 2) - Math.max(0, top - 2),
  } };
}

await fs.mkdir(output, { recursive: true });
await fs.mkdir(docs, { recursive: true });
const records = [], preview = [];
for (const [name, source] of Object.entries(sources)) {
  const archived = path.join(docs, `production-${name}-master.png`);
  try { await fs.access(archived); } catch { await fs.copyFile(path.join(generated, source), archived); }
  const original = await fs.readFile(archived);
  const { data: rgb, info } = await sharp(original).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  const { rgba, trim } = extractAlpha(rgb, info.width, info.height);
  const file = path.join(output, `${name}.webp`);
  await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract(trim).resize(256, 256, { fit: 'contain', background: '#00000000' })
    .webp({ quality: 94, alphaQuality: 100, effort: 6 }).toFile(file);
  const data = await fs.readFile(file), metadata = await sharp(data).metadata();
  const alpha = await sharp(data).extractChannel('alpha').raw().toBuffer();
  const transparentPixels = alpha.filter(value => value === 0).length;
  assert(metadata.hasAlpha && metadata.width === 256 && metadata.height === 256);
  assert([0, 255, 65280, 65535].every(i => alpha[i] === 0), 'Icon corners must be transparent');
  assert(alpha[128 * 256 + 128] === 255, 'Painted icon center must remain opaque');
  assert(transparentPixels > alpha.length * 0.15 && transparentPixels < alpha.length * 0.4);
  records.push({ name, path: relative(file), source, archivedSource: relative(archived),
    sourceSize: [info.width, info.height], sourceSha256: sha256(original), trim,
    size: [metadata.width, metadata.height], hasAlpha: metadata.hasAlpha, transparentPixels,
    bytes: data.length, sha256: sha256(data) });
  const x = (records.length - 1) * 384;
  preview.push({ input: data, left: x + 64, top: 24 });
  preview.push({ input: await sharp(data).resize(48, 48).png().toBuffer(), left: x + 168, top: 308 });
}
await sharp({ create: { width: 768, height: 384, channels: 3, background: '#0b171b' } })
  .composite(preview).png().toFile(path.join(docs, 'system-icons-dark-preview.png'));
await fs.writeFile(path.join(docs, 'production-system-icons.json'), `${JSON.stringify({
  generator: 'scripts/extract-coastal-system-icons.mjs',
  processing: { operation: 'Exterior neutral-checkerboard flood fill; largest connected painted subject; boundary decontamination from adjacent original colors; no repainting or recoloring',
    neutralMatte: { minChannel: 130, maxChannelSpread: 22 }, trimPadding: 2,
    resize: { width: 256, height: 256, fit: 'contain', background: 'transparent' },
    webp: { quality: 94, alphaQuality: 100, effort: 6 } },
  preview: 'docs/layout-3-dlc-proposals-2026-09-14/system-icons-dark-preview.png', assets: records,
}, null, 2)}\n`);
console.log(JSON.stringify(records, null, 2));
