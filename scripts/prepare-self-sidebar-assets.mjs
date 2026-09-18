// Slice generated artwork into native-ratio end caps and an ornament-free rail.
// The small round rivets must not stretch when the sidebar height changes.
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'C:/Users/zhuzi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2];
if (!source) throw new Error('Pass the generated transparent sidebar master PNG.');
const variant = process.argv[3] || 'neutral';
const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let left = info.width, top = info.height, right = -1, bottom = -1;
for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
  if (data[(y * info.width + x) * 4 + 3] > 8) {
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
}
const width = right - left + 1, height = bottom - top + 1;
const cap = Math.round(width * .22);
const rects = {
  top: { left, top, width, height: cap },
  rail: { left, top: top + Math.round(height * .13), width, height: Math.round(height * .07) },
  bottom: { left, top: bottom - cap + 1, width, height: cap },
};
const docs = path.join(root, 'docs/opponent-collapse-2026-09-17');
const master = path.join(docs, `sidebar-${variant}-master.png`);
if (path.resolve(source) !== master) await fs.copyFile(source, master);
if (variant === 'warm') {
  // Bake the directional light into one native-ratio RGBA decal. html2canvas
  // cannot capture CSS masks, and repeating warm rails repeats their rivets.
  const rect = { left, top, width, height: Math.ceil(height / 2) };
  const rgba = await sharp(source).extract(rect).ensureAlpha().raw().toBuffer();
  for (let y = 0; y < rect.height; y++) for (let x = 0; x < width; x++) {
    const radius = Math.hypot(x / (width - 1) - 1, (y / (rect.height - 1) - .2) / .7);
    const alpha = radius < .38 ? 1 - radius / .38 * (1 - 11 / 15)
      : Math.max(0, (1 - (radius - .38) / (.85 - .38)) * 11 / 15);
    const index = (y * width + x) * 4 + 3;
    rgba[index] = Math.round(rgba[index] * alpha);
  }
  await sharp(rgba, { raw: { width, height: rect.height, channels: 4 } })
    .webp({ quality: 94, alphaQuality: 100 })
    .toFile(path.join(root, 'public/img/ui/coastal/self-sidebar-warm-light.webp'));
  await fs.writeFile(path.join(docs, 'sidebar-warm-slices.json'), JSON.stringify({ source, width, height, rect,
    alpha: { center: [1, .2], radius: [1, .7], stops: [[0, 1], [.38, 11 / 15], [.85, 0]] },
    output: 'self-sidebar-warm-light.webp' }, null, 2) + '\n');
} else {
  for (const [part, rect] of Object.entries(rects)) {
    await sharp(source).extract(rect).webp({ quality: 94, alphaQuality: 100 })
      .toFile(path.join(root, `public/img/ui/coastal/self-sidebar-${variant}-${part}.webp`));
  }
  // A straight part of the same bronze top rail; no rivet or circular ornament.
  await sharp(source).extract({ left: left + Math.round(width * .2), top: top + 24, width: Math.round(width * .14), height: 32 })
    .webp({ quality: 94, alphaQuality: 100 }).toFile(path.join(root, 'public/img/ui/coastal/self-sidebar-divider.webp'));
  await fs.writeFile(path.join(docs, `sidebar-${variant}-slices.json`), JSON.stringify({ source, width, height, rects }, null, 2) + '\n');
}
console.log({ variant, width, height, output: variant === 'warm' ? 'self-sidebar-warm-light.webp' : rects });
