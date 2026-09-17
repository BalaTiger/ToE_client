// Production slicing only: remove the generated exterior matte, preserve artwork.
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'C:/Users/zhuzi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = path.join(root, 'docs/coastal-action-proposals-2026-09-16');
const output = path.join(root, 'public/img/ui/coastal');
const generated = process.argv[2] || 'E:/Codex/codex-home/generated_images/01a094e6-b663-7ab2-ac74-ac53e4bb49c0';

// Flood only light neutral pixels connected to the outside. Bone highlights
// and metal rivets enclosed inside the artwork must remain opaque.
async function cutout(file, rect) {
  const { data, info } = await sharp(file).extract(rect).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const seen = new Uint8Array(width * height), queue = [];
  const visit = i => {
    if (i < 0 || i >= seen.length || seen[i]) return;
    seen[i] = 1;
    const [r, g, b, a] = data.subarray(i * 4, i * 4 + 4);
    if (a === 0 || (Math.min(r, g, b) >= 130 && Math.max(r, g, b) - Math.min(r, g, b) <= 24)) {
      data[i * 4 + 3] = 0;
      queue.push(i);
    }
  };
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const i = queue[cursor], x = i % width;
    if (x) visit(i - 1);
    if (x + 1 < width) visit(i + 1);
    visit(i - width); visit(i + width);
  }
  return sharp(data, { raw: { width, height, channels: 4 } });
}

await fs.mkdir(docs, { recursive: true });
await fs.mkdir(output, { recursive: true });
const masters = {
  'buttons-b-master.png': 'exec-f9985c7d-a78e-466d-9b8e-25f952299418.png',
  'encounter-skull-master.png': 'exec-c7e028a2-02c3-4b03-81df-4d2f03b35aee.png',
  'option-b-skull-mockup.png': 'exec-718fbe22-8187-45d0-8e8c-1c8d477259f8.png',
};
for (const [archive, source] of Object.entries(masters)) {
  try { await fs.access(path.join(docs, archive)); }
  catch { await fs.copyFile(path.join(generated, source), path.join(docs, archive)); }
}
const records = [];
for (const [row, name] of ['skill', 'rest', 'multiply', 'end'].entries()) {
  const rect = { left: 58, top: 96 + row * 278, width: 1140, height: 242 };
  const file = path.join(output, `action-${name}-b.webp`);
  await (await cutout(path.join(docs, 'buttons-b-master.png'), rect)).webp({ quality: 94, alphaQuality: 100 }).toFile(file);
  records.push({ file: path.relative(root, file), rect, width: 1140, height: 242 });
}
const skull = path.join(output, 'encounter-skull.webp');
await (await cutout(path.join(docs, 'encounter-skull-master.png'), { left: 0, top: 0, width: 1254, height: 1254 }))
  .resize(256, 256).webp({ quality: 94, alphaQuality: 100 }).toFile(skull);
records.push({ file: path.relative(root, skull), width: 256, height: 256 });
for (const record of records) {
  const file = path.join(root, record.file);
  const metadata = await sharp(file).metadata();
  if (!metadata.hasAlpha) throw new Error(`${record.file}: missing alpha`);
  const pixels = await sharp(file).ensureAlpha().raw().toBuffer();
  for (const index of [0, record.width - 1, (record.height - 1) * record.width, record.width * record.height - 1]) {
    if (pixels[index * 4 + 3] !== 0) throw new Error(`${record.file}: exterior matte remains`);
  }
  record.bytes = (await fs.stat(file)).size;
}
await fs.writeFile(path.join(docs, 'production-assets.json'), JSON.stringify({ masters, records }, null, 2) + '\n');
console.log(records);
