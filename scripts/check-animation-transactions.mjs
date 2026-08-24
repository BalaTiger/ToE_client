import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const sourceRoot = path.resolve('src');
const legacyBaseline = new Map([
  ['game/animationQueuePolicy.js', 3],
  ['game/animationTransaction.js', 1],
  ['game/visualEventTransactionCompiler.js', 3],
  ['game/visualEvents.js', 1],
]);
const legacyVisualStateFields = [
  '_inspectionEvents',
  '_randomTargetEvents',
  '_tsgSlimeGrantEvents',
  '_turnDrawEvents',
];
const legacyVisualFieldPattern = new RegExp(`\\b(?:${legacyVisualStateFields.join('|')})\\b`);
const migrationBaselines = [
  {
    label: 'buildAnimQueue call',
    pattern: /\bbuildAnimQueue\s*\(/g,
    allowed: new Map([
      ['App.jsx', 52],
      ['game/aiTurnPresentation.js', 2],
      ['game/animQueueCore.js', 1],
      ['game/animQueueHelpers.js', 5],
      ['game/handLimitDiscard.js', 1],
      ['game/proliferatingZFlow.js', 1],
      ['game/restTurnPresentation.js', 1],
      ['game/turnStartPresentation.js', 1],
      ['game/visualEventTransactionCompiler.js', 1],
    ]),
  },
  {
    label: 'buildInspectionAwareAnimQueue call',
    pattern: /\bbuildInspectionAwareAnimQueue\s*\(/g,
    allowed: new Map([
      ['App.jsx', 10],
      ['game/animQueueHelpers.js', 1],
      ['game/animReplayEvents.js', 1],
      ['game/treasureDodgePresentation.js', 1],
    ]),
  },
  {
    label: 'hand-delta animation inference',
    pattern: /\bbuildHandDeltaInferenceQueue\s*\(/g,
    allowed: new Map([['game/animQueueCore.js', 2]]),
  },
  {
    label: 'legacy visual-event promotion',
    pattern: /\bpromoteLegacyVisualEvents\s*\(/g,
    allowed: new Map([['game/visualEvents.js', 2]]),
  },
  {
    label: 'presentation log inference',
    pattern: /\b(?:newMsgs|logDelta|actionMsgs)\.(?:find|filter|some)\s*\(/g,
    allowed: new Map([
      ['App.jsx', 10],
      ['game/animQueueCore.js', 3],
      ['game/multiplayerRemoteReplay.js', 6],
    ]),
  },
  {
    label: 'terminal state-diff replay',
    pattern: /newGs\.gameOver\s*&&\s*newGs\.currentTurn\s*!==\s*oldGs\.currentTurn/g,
    allowed: new Map([['game/animQueueCore.js', 1]]),
  },
  {
    label: 'caller-side buildAnimQueue filtering',
    pattern: /buildAnimQueue[^\r\n]*\.filter\s*\(/g,
    allowed: new Map([['App.jsx', 13]]),
  },
];

function collectSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : collectSourceFiles(absolute);
    if (!/\.(?:js|jsx)$/.test(entry.name) || /\.(?:test|spec)\.(?:js|jsx)$/.test(entry.name)) return [];
    return [absolute];
  });
}

const actual = new Map();
const legacyStatTargetProducers = [];
const legacySphinxHintProducers = [];
const legacyVisualFieldReferences = [];
const presentationStatDiffFallbacks = [];
const migrationCounts = migrationBaselines.map(guard => ({ guard, actual: new Map() }));
for (const file of collectSourceFiles(sourceRoot)) {
  const relative = path.relative(sourceRoot, file).split(path.sep).join('/');
  const source = fs.readFileSync(file, 'utf8');
  if (/buildStatEventsFromPlayerSnapshots|remote-snapshot-compat|legacy-state-diff/.test(source)) {
    presentationStatDiffFallbacks.push(relative);
  }
  const matches = source.match(/legacyMerge|LEGACY_MERGE/g) || [];
  if (matches.length) actual.set(relative, matches.length);
  migrationCounts.forEach(({ guard, actual: counts }) => {
    const count = (source.match(guard.pattern) || []).length;
    if (count) counts.set(relative, count);
  });
  if (relative !== 'game/rotateState.js') {
    source.split(/\r?\n/).forEach((line, index) => {
      if (legacyVisualFieldPattern.test(line)) {
        legacyVisualFieldReferences.push(`${relative}:${index + 1}: ${line.trim()}`);
      }
      if (/\btargetStats\s*:/.test(line)) {
        legacyStatTargetProducers.push(`${relative}:${index + 1}`);
      }
      if (/\b_animSphinxReveal\s*:/.test(line)
        && relative !== 'game/visualEvents.js'
        && relative !== 'game/aiTurnPresentation.js') {
        legacySphinxHintProducers.push(`${relative}:${index + 1}`);
      }
    });
  }
}

const issues = [];
legacyVisualFieldReferences.forEach(location => {
  issues.push(`${location}: legacy visual fields are forbidden; emit and consume canonical _visualEvents`);
});
legacyStatTargetProducers.forEach(location => {
  issues.push(`${location}: production targetStats payloads are forbidden; emit statEvents instead`);
});
legacySphinxHintProducers.forEach(location => {
  issues.push(`${location}: production _animSphinxReveal hints are forbidden; emit sphinxResult visualEvents instead`);
});
presentationStatDiffFallbacks.forEach(relative => {
  issues.push(`${relative}: presentation-layer HP/SAN snapshot diff fallback is forbidden; consume canonical statEvents`);
});
migrationCounts.forEach(({ guard, actual: counts }) => {
  counts.forEach((count, file) => {
    const allowed = guard.allowed.get(file) || 0;
    if (count > allowed) {
      issues.push(`${file}: ${guard.label} baseline grew from ${allowed} to ${count}`);
    }
  });
});
for (const [file, count] of actual) {
  const allowed = legacyBaseline.get(file);
  if (allowed == null) issues.push(`${file}: introduced ${count} legacyMerge reference(s)`);
  else if (count > allowed) issues.push(`${file}: legacyMerge references grew from ${allowed} to ${count}`);
}
for (const [file, allowed] of legacyBaseline) {
  const count = actual.get(file) || 0;
  if (count > allowed) issues.push(`${file}: expected at most ${allowed}, found ${count}`);
}

const appSource = fs.readFileSync(path.join(sourceRoot, 'App.jsx'), 'utf8');
if (/resolveActionQueueMeta/.test(appSource)) {
  issues.push('App.jsx: generic resolveActionQueueMeta is forbidden; use strictActionQueueMeta or the tutorial-only router');
}
const animationQueuePolicySource = fs.readFileSync(path.join(sourceRoot, 'game/animationQueuePolicy.js'), 'utf8');
const tutorialResolverRefs = animationQueuePolicySource.match(/resolveTutorialQueueMeta\s*\(/g) || [];
if (tutorialResolverRefs.length !== 2) {
  issues.push(`game/animationQueuePolicy.js: resolveTutorialQueueMeta must only appear in its definition and tutorial router (found ${tutorialResolverRefs.length})`);
}
appSource.split(/\r?\n/).forEach((line, index) => {
  if (!line.includes('actionQueueMetaForMode(') || line.includes('function actionQueueMetaForMode(')) return;
  if (!line.includes('tutorial:')) {
    issues.push(`App.jsx:${index + 1}: tutorial router call must declare tutorial:true or tutorial:showTutorial explicitly`);
  }
});

if (issues.length) {
  console.error('[animation-transaction-gate] failed');
  issues.forEach(issue => console.error(`- ${issue}`));
  process.exitCode = 1;
} else {
  const remaining = [...actual.values()].reduce((sum, count) => sum + count, 0);
  const migrationRemaining = migrationCounts.reduce((sum, { actual: counts }) => (
    sum + [...counts.values()].reduce((subtotal, count) => subtotal + count, 0)
  ), 0);
  console.log(`[animation-transaction-gate] passed; legacy-merge baseline=${remaining}; migration debt=${migrationRemaining}, no growth`);
}
