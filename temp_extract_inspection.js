import fs from 'fs';

const appPath = 'src/App.jsx';
const coreUtilsPath = 'src/game/coreUtils.js';

const appLines = fs.readFileSync(appPath, 'utf-8').split('\n');
const coreUtilsContent = fs.readFileSync(coreUtilsPath, 'utf-8');

// makeInspectionMeta: 2400-2415 (1-based)
// sortInspectionTargets: 2417-2420 (1-based)
// We keep line 2416 blank between them, and remove up to 2420

const funcLines = appLines.slice(2400 - 1, 2420); // 0-based indices 2399-2419

// Append to coreUtils.js
const newCoreUtils = coreUtilsContent.trimEnd() + '\n\n' + funcLines.join('\n') + '\n';
fs.writeFileSync(coreUtilsPath, newCoreUtils, 'utf-8');
console.log('Appended makeInspectionMeta and sortInspectionTargets to coreUtils.js');

// Remove from App.jsx and add imports
const newAppLines = [];
for (let i = 0; i < appLines.length; i++) {
  const line = appLines[i];

  // Add imports after getNextLivingIndex
  if (line.trim() === 'getNextLivingIndex,') {
    newAppLines.push(line);
    newAppLines.push('  makeInspectionMeta,');
    newAppLines.push('  sortInspectionTargets,');
    continue;
  }

  // Skip lines 2400-2420 (0-based 2399-2419)
  if (i >= 2399 && i <= 2419) {
    continue;
  }

  newAppLines.push(line);
}

fs.writeFileSync(appPath, newAppLines.join('\n'), 'utf-8');
console.log('Removed makeInspectionMeta and sortInspectionTargets from App.jsx');
