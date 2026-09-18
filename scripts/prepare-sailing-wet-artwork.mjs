// ImageGen supplies the approved wet material. This step only registers,
// extracts and encodes it; no procedural reflections are drawn here.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'C:/Users/zhuzi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = fileURLToPath(new URL('../', import.meta.url));
const input = `${root}docs/sailing-wet-lookdev-2026-09-18/assets/`;
const output = `${root}public/img/effects/sailing/`;
await mkdir(output, { recursive: true });
const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const records = [];
async function save(name, pixels, width, height) {
  const file = `${output}${name}.webp`;
  await sharp(pixels, { raw: { width, height, channels: 4 } })
    .webp({ quality: 93, alphaQuality: 100, effort: 6 }).toFile(file);
  const decoded = await sharp(file).ensureAlpha().raw().toBuffer();
  for (let i = 3; i < pixels.length; i += 4) assert.equal(decoded[i], pixels[i], 'native alpha must survive encoding');
  const data = await readFile(file);
  records.push({ name, width, height, bytes: data.length,
    sha256: createHash('sha256').update(data).digest('hex') });
}

// Keep the old bronze silhouette/rails visible. The generated material covers
// only the flat plate; top/bottom ornaments and circles can never crossfade
// between subtly different AI-redrawn shapes. A soft four-pixel inset follows
// the original inner plate, not the wetting front used at runtime.
const panelWidth = 622, panelHeight = 1536;
const panel = await sharp(`${input}panel-wet-generated.png`).resize(panelWidth, panelHeight).ensureAlpha().raw().toBuffer();
const panelDry = await sharp(`${input}panel-dry-template.png`).ensureAlpha().raw().toBuffer();
assert.equal(panel.length, panelDry.length);
for (let y = 0; y < panelHeight; y++) for (let x = 0; x < panelWidth; x++) {
  const i = (y * panelWidth + x) * 4;
  const radius = 24;
  const qx = Math.abs(x - 311) - (245 - radius);
  const qy = Math.abs(y - 763) - (687 - radius);
  const distance = Math.hypot(Math.max(0, qx), Math.max(0, qy)) + Math.min(Math.max(qx, qy), 0) - radius;
  panel[i + 3] = Math.round(panelDry[i + 3] * smooth(0, 4, -distance));
}
for (const [part, top, height] of [['top', 0, 137], ['rail', 137, 1262], ['bottom', 1399, 137]]) {
  await save(`panel-wet-${part}`, panel.subarray(top * panelWidth * 4, (top + height) * panelWidth * 4), panelWidth, height);
}

// The new sprite has the same canvas/pose. Copy the original alpha exactly;
// retain its outermost RGB fringe as well, preventing a generated warm halo
// or tiny silhouette drift from appearing during a half-wet blend.
const width = 768, height = 1152;
const dry = await sharp(`${root}public/img/ui/coastal/torch-hand.webp`).ensureAlpha().raw().toBuffer();
const wet = await sharp(`${input}torch-wet-generated.png`).resize(width, height).ensureAlpha().raw().toBuffer();
assert.equal(dry.length, wet.length);
const alphaAt = (x, y) => x < 0 || y < 0 || x >= width || y >= height ? 0 : dry[(y * width + x) * 4 + 3];
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const i = (y * width + x) * 4;
  let inset = 1;
  for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) inset = Math.min(inset, alphaAt(x + dx, y + dy) / 255);
  for (let c = 0; c < 3; c++) wet[i + c] = Math.round(dry[i + c] + (wet[i + c] - dry[i + c]) * inset);
  wet[i + 3] = dry[i + 3];
}
await save('torch-hand-wet', wet, width, height);
const revision = createHash('sha256').update(records.map(record => record.sha256).join('')).digest('hex').slice(0, 16);
await writeFile(`${input}prepared-assets.json`, JSON.stringify({ revision, records }, null, 2) + '\n');
console.log(JSON.stringify({ revision, totalBytes: records.reduce((sum, record) => sum + record.bytes, 0), records }, null, 2));
