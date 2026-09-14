// Approved atlas slicing only: preserve the painted RGB and dark background.
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
const master = path.join(docs, 'production-portraits-master.png');
const originalSource = 'E:/Codex/codex-home/generated_images/01a094e6-b663-7ab2-ac74-ac53e4bb49c0/exec-58c9671a-0b0d-47d0-a6e6-157eaffe9910.png';
await fs.mkdir(docs, { recursive: true });
await fs.mkdir(output, { recursive: true });
try { await fs.access(master); } catch { await fs.copyFile(process.argv[2] || originalSource, master); }
const metadata = await sharp(master).metadata();
if (metadata.width !== 1536 || metadata.height !== 1024) throw new Error('Expected the approved 1536×1024 portrait atlas.');
const slices = [];
for (let index = 0; index < 5; index++) {
  const name = index === 0 ? 'portrait-self' : `portrait-${index}`;
  const crop = { left: (index % 3) * 512 + 4, top: Math.floor(index / 3) * 512 + 4, width: 504, height: 504 };
  const target = path.join(output, `${name}.webp`);
  await sharp(master).extract(crop).resize(500, 500).removeAlpha().toColourspace('srgb').webp({ quality: 86 }).toFile(target);
  const bytes = await fs.readFile(target);
  slices.push({ file: `public/img/ui/coastal/${name}.webp`, crop, width: 500, height: 500, quality: 86, alpha: false, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await fs.writeFile(path.join(docs, 'production-portraits.json'), JSON.stringify({
  originalSource,
  master: 'production-portraits-master.png',
  masterSha256: createHash('sha256').update(await fs.readFile(master)).digest('hex'),
  prompt: 'production-portraits-prompt.json',
  policy: 'Decorative portraits assigned by presentation seat index only; no role or private game state influences image selection.',
  rerun: 'node scripts/extract-coastal-portraits.mjs',
  slices,
}, null, 2) + '\n');
console.log(`Extracted ${slices.length} portraits (${slices.reduce((sum, slice) => sum + slice.bytes, 0)} bytes).`);
