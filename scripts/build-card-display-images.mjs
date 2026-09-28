// Deterministic display mipmaps: keep the original artwork for enlarged views.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'C:/Users/zhuzi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = path.resolve(import.meta.dirname, '..');
const source = path.join(root, 'public/img/card/illustration');
const widths = {};
for (const width of [256, 512]) await fs.mkdir(path.join(source, `display-${width}`), { recursive: true });
for (const file of (await fs.readdir(source)).filter(file => file.endsWith('.webp')).sort()) {
  const original = path.join(source, file);
  widths[file] = (await sharp(original).metadata()).width;
  for (const width of [256, 512]) {
    await sharp(original).resize({ width, kernel: 'lanczos3' })
      .webp({ quality: 94, effort: 6 }).toFile(path.join(source, `display-${width}`, file));
  }
}
await fs.writeFile(path.join(root, 'src/components/cards/illustrationWidths.json'), `${JSON.stringify(widths, null, 2)}\n`);
console.log(`Prepared two display sizes for ${Object.keys(widths).length} illustrations.`);
