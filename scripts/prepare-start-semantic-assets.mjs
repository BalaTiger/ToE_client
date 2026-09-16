import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'C:/Users/zhuzi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = path.resolve(import.meta.dirname, '..');
const docs = path.join(root, 'docs/start-semantic-art-2026-09-16');
const { assets } = JSON.parse(await fs.readFile(path.join(docs, 'generation.json'), 'utf8'));
await fs.mkdir(path.join(docs, 'sources'), { recursive: true });
for (const asset of assets) {
  const archived = path.join(docs, 'sources', `${asset.name}.png`);
  try { await fs.access(archived); } catch { await fs.copyFile(asset.source, archived); }
  const logicalWidth = asset.logicalWidth;
  // Prefilter fine etched detail before the entire menu is transformed down.
  for (const density of [1, 2]) {
    const output = asset.output.replace('.webp', `-${density}x.webp`);
    await sharp(archived).resize({ width: logicalWidth * density, withoutEnlargement: true })
      .webp({ quality: 94, effort: 6 }).toFile(path.join(root, output));
    const { width, height } = await sharp(path.join(root, output)).metadata();
    console.log(`${output}: ${width}x${height}`);
  }
}
