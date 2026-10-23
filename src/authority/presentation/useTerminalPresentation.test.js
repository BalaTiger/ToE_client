import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthorityPresentation } from './model';
import { terminalScenes, useTerminalPresentation } from './useTerminalPresentation';

const hooks = vi.hoisted(() => ({ slots: [], cursor: 0 }));
vi.mock('react', () => ({
  useState(initial) {
    const index = hooks.cursor++;
    hooks.slots[index] ||= { value: typeof initial === 'function' ? initial() : initial };
    return [hooks.slots[index].value, update => {
      hooks.slots[index].value = typeof update === 'function' ? update(hooks.slots[index].value) : update;
    }];
  },
  useCallback: callback => callback,
}));
const faces = seat => [{ id: `public-${seat}`, name: `获胜牌${seat}`, letter: 'A', number: 1 }];
function view() {
  return { version: 2, matchId: 'terminal', viewerSeat: 1, decision: { actions: [] },
    players: [0, 1, 2].map(seat => ({ seat, name: `玩家${seat}`, handCount: 5 })),
    gameOver: { winner: '寻宝者', winnerIdx: 0, winnerIdx2: 1 },
    treasureWinners: [1, 2, 0].map(seat => ({ seat, cards: faces(seat) })) };
}
function mount(initialView, freshStart = false) {
  let current = initialView;
  return (next = current, ready = true) => {
    current = next; hooks.cursor = 0;
    return useTerminalPresentation({ view: current, model: createAuthorityPresentation(current), freshStart, ready });
  };
}
beforeEach(() => { hooks.slots = []; });
describe('terminal presentation settlement', () => {
  it('uses only announced winners and public DTO cards in canonical winner order, with viewer-relative anchors', () => {
    const current = view(), model = createAuthorityPresentation(current);
    const scenes = terminalScenes(current, model);
    expect(scenes.map(scene => [scene.id, scene.displaySeat, scene.cards])).toEqual([
      ['treasure:0', 2, faces(0)], ['treasure:1', 0, faces(1)],
    ]);
    expect(model.players[2].hand.every(card => card._back)).toBe(true);
  });
  it('does not substitute private hands when the terminal public DTO is absent', () => {
    const current = view(); delete current.treasureWinners;
    current.players[1].hand = [{ id: 'secret', name: '未用于获胜的手牌' }];
    expect(terminalScenes(current, createAuthorityPresentation(current))).toEqual([]);
  });
  it('deduplicates a repeated winner seat', () => {
    const current = view(); current.gameOver.winnerIdx2 = 0;
    expect(terminalScenes(current, createAuthorityPresentation(current))).toHaveLength(1);
  });
  it.each(['邪神复活，全员落败', '邪神苏醒，全员落败'])('retains the original resurrection predicate for LOSE_ALL: %s', reason => {
    const current = view(); current.gameOver = { winner: 'LOSE_ALL', reason };
    expect(terminalScenes(current, createAuthorityPresentation(current))).toEqual([{ id: 'god', type: 'god' }]);
  });
  it('does not resurrect for unrelated all-player loss', () => {
    const current = view(); current.gameOver = { winner: 'LOSE_ALL', reason: '所有角色死亡' };
    expect(terminalScenes(current, createAuthorityPresentation(current))).toEqual([]);
  });
  it('waits for ordinary playback, then settles both maps; a repeated first confirmation cannot skip the second', () => {
    const current = view(), render = mount({ ...current, gameOver: null }); render();
    expect(render(current, false).scene).toBeNull();
    const first = render(); expect(first.scene.id).toBe('treasure:0');
    first.finish(); const second = render(); expect(second.scene.id).toBe('treasure:1');
    first.finish(); expect(render().scene.id).toBe('treasure:1');
    second.finish(); expect(render().scene).toBeUndefined();
  });
  it('does not replay an already-ended restored baseline even if public cards arrive later', () => {
    const current = view(), render = mount({ ...current, treasureWinners: [] });
    expect(render().scene).toBeNull(); expect(render(current).scene).toBeNull();
  });
  it('allows a marked fresh terminal view to finish its scene', () => {
    const render = mount(view(), true);
    expect(render().scene.id).toBe('treasure:0');
  });
});
