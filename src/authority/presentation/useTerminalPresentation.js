import { useCallback, useState } from 'react';
import { shouldPlayGodResurrection } from '../../game/gameOverPresentation';

export function terminalScenes(view, model) {
  if (shouldPlayGodResurrection(view.gameOver)) return [{ id: 'god', type: 'god' }];
  if (view.gameOver?.winner !== '寻宝者') return [];
  return [...new Set([view.gameOver.winnerIdx, view.gameOver.winnerIdx2])]
    .filter(Number.isInteger).flatMap(seat => {
      const displaySeat = model.toDisplaySeat(seat);
      const cards = view.treasureWinners?.find(entry => entry.seat === seat)?.cards;
      // Only the recipient's explicit public winning-card DTO can supply this scene.
      if (displaySeat === null || !cards?.length) return [];
      return [{ id: `treasure:${seat}`, type: 'treasure', displaySeat, cards,
        name: model.players[displaySeat].name }];
    });
}

/** Mounted ended baselines do not replay; live terminal scenes settle one winner at a time. */
export function useTerminalPresentation({ view, model, freshStart, ready }) {
  const [skipBaseline] = useState(() => !!view.gameOver && !freshStart);
  const [completed, setCompleted] = useState([]);
  const scene = !skipBaseline && ready ? terminalScenes(view, model).find(item => !completed.includes(item.id)) : null;
  const id = scene?.id;
  const finish = useCallback(() => {
    if (id) setCompleted(previous => previous.includes(id) ? previous : [...previous, id]);
  }, [id]);
  return { scene, finish };
}
