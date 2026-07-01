import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const outFile = path.join(publicDir, 'resource-manifest.json');
const excludedNames = new Set([
  'CNAME',
  '_headers',
  'resource-manifest.json',
  'sw.js',
]);

const typeByExt = new Map([
  ['.webp', 'image'],
  ['.svg', 'image'],
  ['.png', 'image'],
  ['.mp3', 'audio'],
  ['.mp4', 'video'],
  ['.ttf', 'font'],
  ['.woff', 'font'],
  ['.woff2', 'font'],
  ['.css', 'style'],
  ['.js', 'script'],
]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (excludedNames.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function toPublicPath(file) {
  return `/${path.relative(publicDir, file).replaceAll(path.sep, '/')}`;
}

function getType(file) {
  return typeByExt.get(path.extname(file).toLowerCase()) || 'asset';
}

async function hashFile(file) {
  const data = await readFile(file);
  return createHash('sha256').update(data).digest('hex');
}

const files = await walk(publicDir);
const resources = [];
for (const file of files.sort()) {
  const [info, hash] = await Promise.all([stat(file), hashFile(file)]);
  resources.push({
    path: toPublicPath(file),
    type: getType(file),
    size: info.size,
    revision: hash.slice(0, 16),
  });
}

const version = createHash('sha256')
  .update(resources.map(item => `${item.path}:${item.size}:${item.revision}`).join('\n'))
  .digest('hex')
  .slice(0, 16);

await writeFile(outFile, `${JSON.stringify({
  version,
  generatedAt: new Date().toISOString(),
  resources,
}, null, 2)}\n`, 'utf8');

const totals = resources.reduce((acc, item) => {
  acc[item.type] = (acc[item.type] || 0) + item.size;
  return acc;
}, {});
console.log(`resource-manifest ${version}`);
for (const [type, size] of Object.entries(totals).sort()) {
  console.log(`${type}: ${(size / 1024 / 1024).toFixed(2)} MB`);
}
