import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  FIXED_ZONE_CARD_VARIANTS_BY_KEY,
  GOD_DEFS,
} from '../src/constants/card.js';
import {
  GOD_CARD_FLAVOR_TEXT_BY_KEY,
  ZONE_CARD_FLAVOR_TEXT_BY_NAME,
} from '../src/constants/cardFlavorText.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(root, 'docs', 'card-flavor-template.tsv');

function clean(value) {
  return String(value ?? '').replaceAll('\t', ' ').replaceAll('\r', ' ').replaceAll('\n', ' ');
}

function toTsvLine(values) {
  return values.map(clean).join('\t');
}

const rows = [
  ['kind', 'id', 'name', 'expansion', 'slot', 'polarity', 'flavorText'],
];

const seenZoneNames = new Set();
Object.entries(FIXED_ZONE_CARD_VARIANTS_BY_KEY)
  .sort(([a], [b]) => a.localeCompare(b))
  .forEach(([slotKey, cards]) => {
    cards.forEach(card => {
      if (seenZoneNames.has(card.name)) return;
      seenZoneNames.add(card.name);
      rows.push([
        'zone',
        card.name,
        card.name,
        card.expansion || '',
        slotKey,
        card.polarity || '',
        ZONE_CARD_FLAVOR_TEXT_BY_NAME[card.name] || '',
      ]);
    });
  });

Object.entries(GOD_DEFS)
  .sort(([a], [b]) => a.localeCompare(b))
  .forEach(([godKey, god]) => {
    rows.push([
      'god',
      godKey,
      god.name || godKey,
      '',
      godKey,
      '',
      GOD_CARD_FLAVOR_TEXT_BY_KEY[godKey] || '',
    ]);
  });

await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, `${rows.map(toTsvLine).join('\n')}\n`, 'utf8');
console.log(`Wrote ${path.relative(root, outFile)} (${rows.length - 1} cards)`);
