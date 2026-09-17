// Production cutout of generated matte assets; the unchanged right foreground
// comes from the original alpha artwork, not the model's redraw.
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'C:/Users/zhuzi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = path.join(root, 'docs/torch-implementation-2026-09-16');
const out = path.join(root, 'public/img/ui/coastal');
const generated = process.argv[2] || 'E:/Codex/codex-home/generated_images/01a094e6-b663-7ab2-ac74-ac53e4bb49c0';
await fs.mkdir(docs, { recursive: true });

const masters = {
  'torch-hand-master.png': 'exec-0b88f6b9-8a28-480f-9c64-ba3f2ec82202.png',
  'foreground-clean-master.png': 'exec-54bb670f-875d-427a-bbd0-5aadf2bc4440.png',
};
for (const [name, file] of Object.entries(masters)) {
  try { await fs.access(path.join(docs, name)); }
  catch { await fs.copyFile(path.join(generated, file), path.join(docs, name)); }
}

// The image generator returned RGB with a neutral exterior matte. Only remove
// neutral pixels connected to the image boundary, preserving enclosed details.
async function exteriorMatte(file, minLight, maxChroma) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const seen = new Uint8Array(width * height), queue = new Uint32Array(width * height);
  let end = 0;
  const visit = i => {
    if (i < 0 || i >= seen.length || seen[i]) return;
    seen[i] = 1;
    const p = i * 4, lo = Math.min(data[p], data[p + 1], data[p + 2]);
    const hi = Math.max(data[p], data[p + 1], data[p + 2]);
    if (!data[p + 3] || (lo >= minLight && hi - lo <= maxChroma)) {
      data[p + 3] = 0;
      queue[end++] = i;
    }
  };
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  for (let cursor = 0; cursor < end; cursor++) {
    const i = queue[cursor], x = i % width;
    if (x) visit(i - 1);
    if (x + 1 < width) visit(i + 1);
    visit(i - width); visit(i + width);
  }
  return { data, width, height, removed: end };
}

const hand = await exteriorMatte(path.join(docs, 'torch-hand-master.png'), 135, 36);
await sharp(hand.data, { raw: { width: hand.width, height: hand.height, channels: 4 } })
  .resize(768, 1152).webp({ quality: 94, alphaQuality: 100 }).toFile(path.join(out, 'torch-hand.webp'));

const cleaned = await exteriorMatte(path.join(docs, 'foreground-clean-master.png'), 72, 25);
const original = await sharp(path.join(out, 'foreground.webp')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (original.info.width !== cleaned.width || original.info.height !== cleaned.height) throw new Error('Foreground master dimensions changed');
for (let y = 0; y < cleaned.height; y++) {
  // Replace only the skull/pedestal footprint; retain every original pixel to its right.
  const row = y * cleaned.width * 4;
  cleaned.data.copy(original.data, row, row, row + 440 * 4);
}
await sharp(original.data, { raw: { width: cleaned.width, height: cleaned.height, channels: 4 } })
  .webp({ lossless: true }).toFile(path.join(out, 'foreground-torch.webp'));

for (const name of ['torch-hand', 'foreground-torch']) {
  await sharp(path.join(out, `${name}.webp`)).flatten({ background: '#102021' }).resize({ width: 768 })
    .png().toFile(path.join(docs, `${name}-alpha-check.png`));
}
console.log({ handMattePixels: hand.removed, foregroundMattePixels: cleaned.removed, files: ['torch-hand.webp', 'foreground-torch.webp'] });
