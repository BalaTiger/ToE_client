import { createServer } from 'vite';

function readIntegerArg(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readStringArg(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length) || fallback;
}

const rolePresets = {
  random: null,
  '2-2-1': { 寻宝者: 2, 追猎者: 2, 邪祀者: 1 },
};

const games = readIntegerArg('games', 100);
const seed = readIntegerArg('seed', 1);
const maxSteps = readIntegerArg('max-steps', 10000);
const roles = readStringArg('roles', 'random');
const expansionKey = readStringArg('expansion', '地神的潜影');
if (!Object.hasOwn(rolePresets, roles)) {
  throw new Error(`未知身份配比：${roles}`);
}

const vite = await createServer({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
});

try {
  const { simulateHeadlessGames } = await vite.ssrLoadModule('/src/game/headlessSimulator.js');
  const summary = simulateHeadlessGames({
    games,
    seed,
    roleCounts: rolePresets[roles],
    expansionKey,
    maxSteps,
  });
  console.log(JSON.stringify({
    games: summary.games,
    seed: summary.seed,
    roles,
    expansionKey,
    winners: summary.winners,
    statuses: summary.statuses,
    unresolvedPhases: summary.unresolvedPhases,
    failures: summary.results
      .map((result, gameIndex) => ({ result, gameIndex }))
      .filter(({ result }) => result.status !== 'complete')
      .slice(0, 20)
      .map(({ result, gameIndex }) => ({
        gameIndex,
        gameSeed: seed + gameIndex,
        status: result.status,
        unresolvedPhase: result.unresolvedPhase,
        stalledPhase: result.stalledPhase,
        turns: result.turns,
        currentTurn: result.state?.currentTurn,
        phase: result.state?.phase,
        huntAbandoned: result.state?.huntAbandoned,
        abilityData: result.state?.abilityData,
        skillUsed: result.state?.skillUsed,
        restUsed: result.state?.restUsed,
        multiplyUsed: result.state?.multiplyUsed,
        players: result.state?.players?.map(player => ({
          role: player.role,
          hp: player.hp,
          san: player.san,
          hand: player.hand?.length || 0,
          dead: !!player.isDead,
          resting: !!player.isResting,
          disabledSkill: !!player.disableSkill,
          disabledRest: !!player.disableRest,
        })),
        logTail: result.state?.log?.slice(-8),
        recentTransitions: result.recentTransitions,
      })),
  }, null, 2));
  if (
    summary.statuses.unresolved
    || summary.statuses.timeout
    || summary.statuses.stalled
    || summary.statuses.runaway
  ) {
    process.exitCode = 2;
  }
} finally {
  await vite.close();
}
