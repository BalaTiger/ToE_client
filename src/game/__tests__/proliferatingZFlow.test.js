import { describe, expect, it, vi } from 'vitest';
import { buildProliferatingZDrawFlow } from '../proliferatingZFlow';
import { makePlayer, makeZoneCard, makeGodCard } from './factory';

const baseDeps = overrides => ({
  copyPlayers: players => players.map(player => ({ ...player, hand: [...(player.hand || [])] })),
  localDisplayName: (_idx, name) => name,
  isAiSeat: () => false,
  aiDrawAndApply: vi.fn(),
  playerDrawCard: vi.fn(),
  drawCardDecisionText: card => card.name || card.key,
  hasEffectDecisionState: () => false,
  deriveEffectDecisionState: vi.fn(),
  splitAnimBoundLogs: () => ({ preStat: [], stat: [] }),
  bindAnimLogChunks: queue => queue,
  buildAnimQueue: () => [],
  statePatchStep: payload => ({ type: 'STATE_PATCH', ...payload }),
  ...overrides,
});

const makeState = overrides => ({
  players: [makePlayer({ name: '你' }), makePlayer({ name: '艾伦' })],
  deck: [],
  discard: [],
  log: ['旧日志'],
  abilityData: {},
  proliferatingZQueue: [{ drawerIdx: 0, gainOwnerIdx: 1, gainedCardNames: ['阿波菲斯'] }],
  ...overrides,
});

describe('proliferatingZFlow', () => {
  it('神牌摸牌结果会进入 GOD_CHOICE 并播放摸牌动画', () => {
    const godCard = makeGodCard('APO');
    const deps = baseDeps({
      playerDrawCard: vi.fn(() => ({
        P: [makePlayer({ name: '你' }), makePlayer({ name: '艾伦' })],
        D: [],
        Disc: [],
        drawnCard: godCard,
        needGodChoice: true,
        godEncounterCost: 1,
      })),
    });

    const flow = buildProliferatingZDrawFlow(makeState(), deps);

    expect(flow.action).toBe('triggerQueue');
    expect(flow.queue).toMatchObject([{ type: 'DRAW_CARD', card: godCard, targetPid: 0 }]);
    expect(flow.state).toMatchObject({
      phase: 'GOD_CHOICE',
      abilityData: { godCard, drawerIdx: 0, godEncounterCost: 1, fromProliferatingZ: true },
      proliferatingZQueue: [],
    });
  });

  it('需要收入抉择的区域牌会进入 DRAW_REVEAL', () => {
    const card = makeZoneCard('A1', 0);
    const deps = baseDeps({
      playerDrawCard: vi.fn(() => ({
        P: [makePlayer({ name: '你' }), makePlayer({ name: '艾伦' })],
        D: [],
        Disc: [],
        drawnCard: card,
        needsDecision: true,
      })),
    });

    const flow = buildProliferatingZDrawFlow(makeState(), deps);

    expect(flow.action).toBe('triggerQueue');
    expect(flow.state.phase).toBe('DRAW_REVEAL');
    expect(flow.state.drawReveal).toMatchObject({ card, drawerIdx: 0, fromProliferatingZ: true });
  });

  it('无需抉择时会组装摸牌、状态动画并要求继续队列', () => {
    const card = makeZoneCard('B1', 0);
    const playersAfter = [makePlayer({ name: '你', hp: 9 }), makePlayer({ name: '艾伦' })];
    const deps = baseDeps({
      playerDrawCard: vi.fn(() => ({
        P: playersAfter,
        D: [],
        Disc: [card],
        drawnCard: card,
        effectMsgs: ['你 失去 1 HP'],
        statePatch: {},
      })),
      buildAnimQueue: () => [{ type: 'HP_DAMAGE', hitIndices: [0] }],
    });

    const flow = buildProliferatingZDrawFlow(makeState(), deps);

    expect(flow.action).toBe('triggerQueueAndContinue');
    expect(flow.queue.map(step => step.type)).toEqual(['DRAW_CARD', 'HP_DAMAGE', 'STATE_PATCH']);
    expect(flow.state.phase).toBe('ACTION');
    expect(flow.state.log.at(-1)).toBe('你 失去 1 HP');
  });
});
