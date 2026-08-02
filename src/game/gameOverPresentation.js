import { ROLE_CULTIST } from './coreUtils';

export function shouldPlayGodResurrection(gameOver) {
  if (!gameOver) return false;
  if (gameOver.winner === ROLE_CULTIST) return true;
  return gameOver.winner === 'LOSE_ALL' && /邪神(?:复活|苏醒)/.test(gameOver.reason || '');
}

