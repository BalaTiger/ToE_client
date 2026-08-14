import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const sourceRoot = path.resolve('src');
const legacyBaseline = new Map([
  ['App.jsx', 3],
  ['game/animationTransaction.js', 1],
  ['game/visualEventTransactionCompiler.js', 3],
  ['game/visualEvents.js', 1],
]);

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
for (const file of collectSourceFiles(sourceRoot)) {
  const relative = path.relative(sourceRoot, file).split(path.sep).join('/');
  const source = fs.readFileSync(file, 'utf8');
  const matches = source.match(/legacyMerge|LEGACY_MERGE/g) || [];
  if (matches.length) actual.set(relative, matches.length);
  if (relative !== 'game/rotateState.js') {
    source.split(/\r?\n/).forEach((line, index) => {
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
legacyStatTargetProducers.forEach(location => {
  issues.push(`${location}: production targetStats payloads are forbidden; emit statEvents instead`);
});
legacySphinxHintProducers.forEach(location => {
  issues.push(`${location}: production _animSphinxReveal hints are forbidden; emit sphinxResult visualEvents instead`);
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
const tutorialResolverRefs = appSource.match(/resolveTutorialQueueMeta\s*\(/g) || [];
if (tutorialResolverRefs.length !== 2) {
  issues.push(`App.jsx: resolveTutorialQueueMeta must only appear in its definition and tutorial router (found ${tutorialResolverRefs.length})`);
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
  console.log(`[animation-transaction-gate] passed; legacy baseline=${remaining}, no growth`);
}
