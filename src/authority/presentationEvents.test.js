import { describe, expect, it, vi } from 'vitest';
import { createAuthorityAnimationTransaction, createAuthorityEventBuffer } from './presentationEvents';
import { applyStatAnimationImpact, primeDisplayStatsForStatQueue } from '../game/statEvents';
import { useAnimationQueue } from '../hooks/useAnimationQueue';
import { prepareAnimQueueLogs } from '../game/animLogs';
import { assertPreparedAnimationTransaction } from '../game/animationTransaction';
import { prepareAnimationQueueSteps } from '../game/animationStepSchema';

vi.mock('react', () => ({
  useRef: value => ({ current: value }), useState: value => [value, vi.fn()],
  useEffect: vi.fn(), useCallback: fn => fn,
}));

const players = [{ id: 0, seat: 1, name: '本方', hp: 4, san: 5, hand: [], godZone: [] },
  { id: 1, seat: 0, name: '对方', hp: 6, san: 6, hand: [], godZone: [] }];
const model = { me: players[0], gs: { phase: 'ACTION', players, discard: [] },
  toDisplaySeat: seat => Number.isInteger(seat) ? [1, 0][seat] : null };
const baseline = { version: 2, matchId: 'm', revision: 0, viewerSeat: 1, players,
  events: [{ id: 'old', type: 'turnStarted', seat: 0 }] };
const loss = { id: 'loss', type: 'statChanged', seat: 1, kind: 'HP_LOSS', fromHp: 6, hp: 4, fromSan: 5, san: 5 };

describe('safe authority events to original animation queue', () => {
  it.each(['deck', 'discard'])('preserves the explicit %s draw origin for the original card-flight renderer', sourcePile => {
    const card = { id: 'public-draw', name: 'Public card' };
    const transaction = createAuthorityAnimationTransaction([
      { id: `draw-${sourcePile}`, type: 'cardRevealed', seat: 0, reason: 'draw', sourcePile, card },
    ], model);
    expect(transaction.queue[0]).toMatchObject({ type: 'DRAW_CARD', sourcePile, card, targetPid: 1 });
    expect(transaction.queue[0]).not.toHaveProperty('skipTravel');
    expect(prepareAnimationQueueSteps(transaction.queue).issues).toEqual([]);
  });

  it('uses explicit discard/keep reasons without replaying a draw reveal', () => {
    const card = { id: 'public-card', name: '活死人哨兵' };
    const discard = createAuthorityAnimationTransaction([{ id: 'discard', type: 'cardRevealed', seat: 1, card, reason: 'discard' }], model);
    expect(discard.queue.map(step => step.type)).toEqual(['DISCARD']);
    expect(discard.queue[0]).toMatchObject({ sourceAnchor: 'reveal' });
    expect(discard.queue[0]).not.toHaveProperty('targetPid');
    const keep = createAuthorityAnimationTransaction([{ id: 'keep', type: 'cardRevealed', seat: 1, card, reason: 'keep' }], model);
    expect(keep.queue.map(step => step.type)).toEqual(['TURN_BOUNDARY_PAUSE']);
    expect(keep.queue[0].msgs[0]).toContain('保留');
  });

  it('plays inspection, hidden income and immortality from explicit safe event facts', () => {
    const transaction = createAuthorityAnimationTransaction([
      { id: 'inspection', type: 'inspectionRevealed', seat: 1, inspectionCard: { name: '揭开真相', effect: 'drawCard' }, hiddenDrawCount: 1 },
      { id: 'immortal', type: 'immortalRevealed', seat: 0, cards: [{ name: '公开牌' }], succeeded: true },
    ], model);
    expect(transaction.queue.map(step => step.type)).toEqual(['DRAW_CARD', 'CARD_TRANSFER', 'VRI_IMMORTAL_REVEAL']);
    expect(transaction.queue[0]).toMatchObject({ sourcePile: 'inspection', targetPid: 0 });
    expect(transaction.queue[1]).toMatchObject({ sourceAnchor: 'deck', toPid: 0, faceUp: false });
    expect(transaction.queue[1]).not.toHaveProperty('cards');
    expect(transaction.queue[2]).toMatchObject({ targetPid: 1, success: true });
  });

  it('breaks only the explicitly named public link and leaves HP impact-owned', () => {
    const prior = { ...model.gs, players: players.map((player, index) => ({ ...player,
      damageLinks: [{ id: 'public-link', partner: 1 - index, active: true }] })) };
    const transaction = createAuthorityAnimationTransaction([
      { id: 'break', type: 'damageLinkBroken', pair: [0, 1] }, loss,
    ], model, prior);
    expect(transaction.queue[0]).toMatchObject({ type: 'TURN_BOUNDARY_PAUSE', durationMs: 560, damageLinkBreak: { a: 1, b: 0 } });
    expect(transaction.queue[0].visualSetupPatch.players.every(player => player.damageLinks.length === 0)).toBe(true);
    expect(transaction.queue[0].visualSetupPatch).not.toHaveProperty('displayStats');
    expect(prior.players[0].damageLinks).toHaveLength(1);
  });
  it('uses explicit event baselines and changes HP only at its impact', () => {
    const transaction = createAuthorityAnimationTransaction([loss], model);
    expect(assertPreparedAnimationTransaction(transaction)).toBe(transaction);
    expect(transaction.queue[0]).toMatchObject({ type: 'HP_DAMAGE', hitIndices: [0],
      statEvents: [{ id: 'loss', target: 0, from: { hp: 6, san: 5 }, to: { hp: 4, san: 5 } }] });
    const primed = primeDisplayStatsForStatQueue([{ hp: 4, san: 5 }], transaction.queue);
    expect(primed[0]).toEqual({ hp: 6, san: 5 });
    expect(applyStatAnimationImpact(primed, transaction.queue[0])[0]).toEqual({ hp: 4, san: 5 });
  });

  it('preserves sequential damage, recovery, and combined-resource order', () => {
    const recovery = { ...loss, id: 'recovery', kind: 'HP_GAIN', fromHp: 4, hp: 5 };
    const combined = { ...loss, id: 'both', kind: 'HP_SAN_LOSS', fromHp: 5, hp: 3, fromSan: 5, san: 2 };
    const transaction = createAuthorityAnimationTransaction([loss, recovery, combined], model);
    expect(transaction.queue.map(step => step.type)).toEqual(['HP_DAMAGE', 'HP_HEAL', 'HP_DAMAGE', 'SAN_DAMAGE']);
    let stats = primeDisplayStatsForStatQueue([{ hp: 3, san: 2 }], transaction.queue);
    expect(stats[0]).toEqual({ hp: 6, san: 5 });
    for (const step of transaction.queue) stats = applyStatAnimationImpact(stats, step);
    expect(stats[0]).toEqual({ hp: 3, san: 2 });
  });

  it('rejects missing or discontinuous explicit stat payloads instead of using snapshot deltas', () => {
    expect(() => createAuthorityAnimationTransaction([{ ...loss, fromHp: undefined }], model)).toThrow('from/to');
    expect(() => createAuthorityAnimationTransaction([loss, { ...loss, id: 'bad', fromHp: 5, hp: 2 }], model)).toThrow('Discontinuous');
    expect(createAuthorityAnimationTransaction([], model).queue).toEqual([]);
    expect(createAuthorityAnimationTransaction([{ id: 'legacy', type: 'playerStatsChanged', seat: 1, hp: 0, san: 0 }], model).queue).toEqual([]);
  });

  it('uses only public revealed cards and never animates unknown hands from counts', () => {
    const publicCard = { id: 'opaque', name: '公开牌', number: 3 };
    const transaction = createAuthorityAnimationTransaction([
      { id: 'count', type: 'cardCountChanged', seat: 0, count: 3 },
      { id: 'draw', type: 'cardRevealed', reason: 'draw', seat: 0, card: publicCard },
    ], model);
    expect(transaction.queue[0]).not.toHaveProperty('card');
    expect(transaction.queue[1]).toMatchObject({ type: 'DRAW_CARD', targetPid: 1, card: publicCard });
    expect(transaction.eventIds).toEqual(['count', 'draw']);
  });

  it('does not invent a dice outcome and rotates public duel participants', () => {
    const transaction = createAuthorityAnimationTransaction([
      { id: 'dice', type: 'diceRolled', seat: 1, roll: 5, purpose: 'sphinxDodge' },
      { id: 'duel', type: 'caveDuelRevealed', sourceSeat: 0, targetSeat: 1, winnerSeat: 1,
        sourceCard: { id: 'a' }, targetCard: { id: 'b' } },
    ], model);
    expect(transaction.queue[0]).toMatchObject({ type: 'DICE_ROLL', d1: 5, publicOnly: true });
    expect(transaction.queue[0]).not.toHaveProperty('dodgeSuccess');
    expect(transaction.queue[1]).toMatchObject({ type: 'CAVE_DUEL', sourceIdx: 1, targetIdx: 0, winnerIdx: 0 });
  });

  it('reuses the original two-dice rest animation before its explicit recovery', () => {
    const transaction = createAuthorityAnimationTransaction([
      { id: 'rest', type: 'restRolled', seat: 1, d1: 2, d2: 5 },
      { ...loss, id: 'heal', kind: 'HP_GAIN', fromHp: 4, hp: 9 },
    ], model);
    expect(transaction.queue.map(step => step.type)).toEqual(['DICE_ROLL', 'HP_HEAL']);
    expect(transaction.queue[0]).toMatchObject({ d1: 2, d2: 5, rollerName: '本方' });
  });

  it('reuses skill and face-down card-flight steps for committed swaps and hidden loot', () => {
    const transaction = createAuthorityAnimationTransaction([
      { id: 'skill', type: 'skillStarted', kind: 'swap', sourceSeat: 1, targetSeat: 0 },
      { id: 'swap', type: 'swapCommitted', sourceSeat: 1, targetSeat: 0, count: 1 },
      { id: 'loot', type: 'huntLootTransferred', sourceSeat: 0, targetSeat: 1, count: 3 },
    ], model);
    expect(transaction.queue.map(step => step.type)).toEqual(['SKILL_SWAP', 'CARD_TRANSFER', 'CARD_TRANSFER']);
    expect(transaction.queue[1].transfers).toEqual([
      { fromPid: 0, toPid: 1, dest: 'player', count: 1, faceUp: false },
      { fromPid: 1, toPid: 0, dest: 'player', count: 1, faceUp: false },
    ]);
    expect(transaction.queue[2].transfers).toHaveLength(3);
    expect(transaction.queue[2].transfers.every(item => item.fromPid === 1 && item.toPid === 0 && item.faceUp === false && item.count === 1)).toBe(true);
    expect(transaction.queue[2]).not.toHaveProperty('cards');
  });

  it('plays a public bewitch gift through the original skill, movement and reveal before damage', () => {
    const gift = { id: 'gift', name: '公开赠牌' };
    const transaction = createAuthorityAnimationTransaction([
      { id: 'bewitch', type: 'bewitchGiven', sourceSeat: 0, targetSeat: 1, card: gift }, loss,
    ], model);
    expect(transaction.queue.map(step => step.type)).toEqual(['SKILL_BEWITCH', 'CARD_TRANSFER', 'DRAW_CARD', 'HP_DAMAGE']);
    expect(transaction.queue[1]).toMatchObject({ fromPid: 1, toPid: 0, cards: [gift], faceUp: true });
  });

  it('marks received public events consumed only after the original queue commits', () => {
    const consumed = { current: new Set() }, setGs = vi.fn(), appendVisibleLog = vi.fn();
    const runtime = useAnimationQueue({ gs: model.gs, copyPlayers: value => value.map(player => ({ ...player })),
      setGs, setDisplayStats: vi.fn(), setVisualDiscard: vi.fn(), restoreVisibleLog: vi.fn(), appendVisibleLog,
      getVisualDiscardForState: state => state.discard, resolveTurnHighlightForStep: () => null, prepareAnimQueueLogs,
      visibleLogRef: { current: [] }, visibleLogEntryIdsRef: { current: new Set() },
      visualStateLocks: { lock: vi.fn(), clear: vi.fn() }, suppressNextBroadcastRef: { current: false },
      receivedGsRef: { current: false }, consumedVisualEventIdsRef: consumed, ANIM_DURATION: {}, ANIM_SPEED_SCALE: 1 });
    runtime.playAnimationTransaction(createAuthorityAnimationTransaction([loss,
      { ...loss, id: 'gain', kind: 'HP_GAIN', fromHp: 4, hp: 6 }], model));
    expect(consumed.current.size).toBe(0);
    expect(setGs).not.toHaveBeenCalled();
    runtime.advanceQueue();
    expect(consumed.current.size).toBe(0);
    runtime.advanceQueue();
    expect([...consumed.current]).toEqual(['loss', 'gain']);
    expect(setGs).toHaveBeenCalledOnce();
  });
});

describe('explicit authority receipts preserve the hand/stat presentation boundary', () => {
  const card = { id: 'attack', name: 'Public attack', number: 2 };
  const other = { id: 'other', name: 'Other card' };
  const back = id => ({ id, _back: true, _authorityHidden: true });
  const stateWithHands = hands => ({ ...model.gs, players: players.map((player, index) => ({ ...player,
    hand: hands[index], handCount: hands[index].length, handVisible: index === 0, isDead: false })) });
  const after = step => step.visualTimeline.at(-1).patch;
  const assertValid = transaction => expect(prepareAnimationQueueSteps(transaction.queue).issues).toEqual([]);

  it('commits the named hunt attack before damage without copying terminal snapshot values', () => {
    const prior = stateWithHands([[card, other], [back('opponent')]]);
    const final = { ...model, gs: { ...model.gs, players: players.map(player => ({ ...player, hp: 0, isDead: true, hand: [] })) } };
    const transaction = createAuthorityAnimationTransaction([
      { id: 'attack-discard', type: 'huntAttack', sourceSeat: 1, targetSeat: 0, card }, loss,
    ], final, prior);
    expect(transaction.queue.map(step => step.type)).toEqual(['DISCARD', 'HP_DAMAGE']);
    expect(transaction.queue[0].visualSetupPatch.players[0].hand).toEqual([card, other]);
    expect(after(transaction.queue[0]).players[0]).toMatchObject({ hand: [other], handCount: 1, hp: 4, isDead: false });
    expect(after(transaction.queue[0]).discard).toEqual([card]);
    expect(after(transaction.queue[0])).not.toHaveProperty('displayStats');
    expect(prior.players[0].hand).toEqual([card, other]);
    assertValid(transaction);
  });

  it('removes one anonymous opponent slot for an explicitly revealed attack', () => {
    const prior = stateWithHands([[other], [back('a'), back('b')]]);
    const transaction = createAuthorityAnimationTransaction([
      { id: 'opponent-attack', type: 'huntAttack', sourceSeat: 0, targetSeat: 1, card }, loss,
    ], model, prior);
    expect(after(transaction.queue[0]).players[1].hand).toEqual([back('b')]);
    expect(after(transaction.queue[0]).players[1].handCount).toBe(1);
    assertValid(transaction);
  });

  it('does not remove a hand card for a discard explicitly coming from the reveal', () => {
    const prior = stateWithHands([[card], []]);
    const transaction = createAuthorityAnimationTransaction([
      { id: 'reveal-discard', type: 'cardRevealed', seat: 1, card, reason: 'discard' }, loss,
    ], model, prior);
    expect(transaction.queue[0]).toMatchObject({ sourceAnchor: 'reveal' });
    expect(transaction.queue[0]).not.toHaveProperty('targetPid');
    expect(transaction.queue[0]).not.toHaveProperty('fromPid');
    expect(after(transaction.queue[0]).discard).toEqual([card]);
    expect(after(transaction.queue[0])).not.toHaveProperty('players');
    assertValid(transaction);
  });

  it('commits the bewitch giver hand but waits for an explicit receipt to populate the recipient', () => {
    const prior = stateWithHands([[other], [card, back('b')]]);
    const transaction = createAuthorityAnimationTransaction([
      { id: 'gift', type: 'bewitchGiven', sourceSeat: 0, targetSeat: 1, card }, loss,
      { id: 'gift-income', type: 'cardIncomeCommitted', seat: 1, source: 'reveal', destination: 'hand', card },
    ], model, prior);
    expect(after(transaction.queue[1]).players[0].hand).toEqual([other]);
    expect(after(transaction.queue[1]).players[1].hand).toEqual([back('b')]);
    expect(after(transaction.queue.at(-1)).players[0].hand).toEqual([other, card]);
    assertValid(transaction);
  });

  it('commits inspection income and hidden loot before any next stat cue', () => {
    const prior = stateWithHands([[other], []]);
    const transaction = createAuthorityAnimationTransaction([
      { id: 'inspection-receipt', type: 'inspectionRevealed', seat: 1, inspectionCard: card, hiddenDrawCount: 2 },
      { id: 'loot-receipt', type: 'huntLootTransferred', sourceSeat: 0, targetSeat: 1, count: 3 }, loss,
    ], model, prior);
    expect(after(transaction.queue[1]).players[0].hand).toHaveLength(3);
    expect(after(transaction.queue[2]).players[0].hand).toHaveLength(6);
    expect(after(transaction.queue[2]).players[0].hand.slice(1).every(item => item._back && !item.name)).toBe(true);
    assertValid(transaction);
  });

  it('reveals a public income flight but conceals its slot in a private opponent hand', () => {
    const prior = stateWithHands([[other], [back('b')]]);
    const transaction = createAuthorityAnimationTransaction([
      { id: 'income', type: 'cardIncomeCommitted', seat: 0, source: 'reveal', destination: 'hand', card }, loss,
    ], model, prior);
    expect(transaction.queue[0]).toMatchObject({ type: 'CARD_TRANSFER', sourceAnchor: 'reveal', dest: 'player',
      toPid: 1, cards: [card], faceUp: true });
    const received = after(transaction.queue[0]).players[1].hand[1];
    expect(received._back).toBe(true);
    expect(received).not.toHaveProperty('name');
    assertValid(transaction);
  });

  it('routes terminal income to discard without creating a hand card or early death', () => {
    const prior = stateWithHands([[other], []]);
    const transaction = createAuthorityAnimationTransaction([
      { id: 'terminal-income', type: 'cardIncomeCommitted', seat: 1, source: 'reveal', destination: 'discard', card }, loss,
    ], model, prior);
    expect(transaction.queue[0]).toMatchObject({ dest: 'discard', sourceAnchor: 'reveal' });
    expect(after(transaction.queue[0]).players[0]).toMatchObject({ isDead: false, hand: [other] });
    expect(after(transaction.queue[0]).discard).toEqual([card]);
    assertValid(transaction);
  });

  it('commits only the new public link without replacing player HP or hands', () => {
    const prior = stateWithHands([[other], []]);
    const transaction = createAuthorityAnimationTransaction([
      { id: 'link', type: 'damageLinkEstablished', sourceSeat: 1, targetSeat: 0 }, loss,
    ], model, prior);
    expect(after(transaction.queue[0]).players[0]).toMatchObject({ hand: [other], hp: 4,
      damageLinks: [{ partner: 1, active: true }] });
    assertValid(transaction);
  });

  it('does not replay the already presented take for the swap initiator', () => {
    const prior = stateWithHands([[other, card], []]);
    const transaction = createAuthorityAnimationTransaction([
      { id: 'swap-source', type: 'swapCommitted', sourceSeat: 1, targetSeat: 0, count: 1,
        sourceCount: 1, targetCount: 1, takeAlreadyPresented: true, takenCard: card, givenCard: other }, loss,
    ], model, prior);
    expect(transaction.queue[0].transfers).toHaveLength(1);
    expect(after(transaction.queue[0]).players[0].hand).toEqual([card]);
    expect(after(transaction.queue[0]).players[1].hand).toHaveLength(1);
    expect(after(transaction.queue[0]).players[1].hand[0]._back).toBe(true);
    assertValid(transaction);
  });

  it('exchanges both explicit cards from the target private-swap checkpoint', () => {
    const prior = stateWithHands([[card], [back('source')]]);
    const transaction = createAuthorityAnimationTransaction([
      { id: 'swap-target', type: 'swapCommitted', sourceSeat: 0, targetSeat: 1, count: 1,
        sourceCount: 1, targetCount: 1, takeAlreadyPresented: false, takenCard: card, givenCard: other }, loss,
    ], model, prior);
    expect(transaction.queue[0].transfers).toHaveLength(2);
    expect(after(transaction.queue[0]).players[0].hand).toEqual([other]);
    expect(after(transaction.queue[0]).players[1].hand[0]._back).toBe(true);
    assertValid(transaction);
  });

  it('keeps observer swap flights and resulting slots anonymous', () => {
    const observer = { ...model, me: null };
    const prior = stateWithHands([[back('a')], [back('b')]]);
    const transaction = createAuthorityAnimationTransaction([
      { id: 'swap-observer', type: 'swapCommitted', sourceSeat: 1, targetSeat: 0, count: 1,
        sourceCount: 1, targetCount: 1, takeAlreadyPresented: false }, loss,
    ], observer, prior);
    expect(transaction.queue[0].transfers.every(item => item.faceUp === false && !item.cards)).toBe(true);
    expect(after(transaction.queue[0]).players.every(player => player.hand.length === 1 && player.hand[0]._back)).toBe(true);
    assertValid(transaction);
  });
});

describe('explicit area effects reuse original overlay contracts', () => {
  it.each(['earthquake', 'forcedRandomDiscard'])('commits explicit %s discards and destruction before its stat batch', kind => {
    const discarded = { id: 'public-discard', letter: 'A', number: 1 };
    const destroyed = { id: 'public-destroyed', letter: 'Z', number: 1 };
    const prior = { ...model.gs, players: players.map((player, index) => ({ ...player,
      hand: index === 0 ? [discarded] : [{ id: 'unknown', _back: true }], handCount: 1, isDead: false })) };
    const transaction = createAuthorityAnimationTransaction([
      { id: kind, type: 'cardsDiscarded', kind, discards: [
        { seat: 1, card: discarded, destination: 'discard' }, { seat: 0, card: destroyed, destination: 'destroyed' },
      ] }, loss,
    ], model, prior);
    const effects = transaction.queue.slice(0, -1);
    const last = effects.at(-1).visualTimeline.at(-1).patch;
    expect(last.players.map(player => player.handCount)).toEqual([0, 0]);
    expect(last.discard).toEqual([discarded]);
    expect(last.players.every(player => player.isDead === false)).toBe(true);
    expect(transaction.queue.at(-1).type).toBe('HP_DAMAGE');
    if (kind === 'earthquake') {
      expect(effects).toHaveLength(1);
      expect(effects[0].type).toBe('EARTHQUAKE');
      expect(effects[0].discardEvents.map(item => item.destination)).toEqual(['discard', 'destroyed']);
      expect(effects[0].visualTimeline[1].patch.players[1].handCount).toBe(1);
    } else expect(effects.map(step => step.destination)).toEqual(['discard', 'destroyed']);
    expect(prepareAnimationQueueSteps(transaction.queue).issues).toEqual([]);
    expect(prior.players.every(player => player.handCount === 1)).toBe(true);
  });

  it('plays explicit reveal destruction without a hand transfer or discard-pile insertion', () => {
    const transaction = createAuthorityAnimationTransaction([
      { id: 'destroy', type: 'cardRevealed', reason: 'destroyed', seat: 1, card: { id: 'destroyed' } }, loss,
    ], model);
    expect(transaction.queue[0]).toMatchObject({ type: 'DISCARD', sourceAnchor: 'reveal', destination: 'destroyed' });
    expect(transaction.queue[0]).not.toHaveProperty('targetPid');
    expect(transaction.queue[0]).not.toHaveProperty('visualTimeline');
    expect(prepareAnimationQueueSteps(transaction.queue).issues).toEqual([]);
  });
  it.each([
    ['undergroundSpring', 'UNDERGROUND_SPRING'], ['startledBats', 'STARTLED_BATS'],
    ['nightWind', 'NIGHT_WIND'], ['volcano', 'VOLCANO'],
  ])('preserves %s before its stat event', (kind, type) => {
    const transaction = createAuthorityAnimationTransaction([{ id: kind, type: 'areaEffectStarted', seat: 1, kind }, loss], model);
    expect(transaction.queue.map(step => step.type)).toEqual([type, 'HP_DAMAGE']);
    expect(transaction.queue[0]).not.toHaveProperty('statEvents');
    expect(prepareAnimationQueueSteps(transaction.queue).issues).toEqual([]);
  });

  it('restores only the explicitly supplied geomagnetic card after the reversal', () => {
    const restoreCard = { id: 'public-restore', name: 'Restore card' };
    const transaction = createAuthorityAnimationTransaction([
      { id: 'geomagnetic', type: 'areaEffectStarted', seat: 0, kind: 'geomagneticReversal', restoreCard }, loss,
    ], model);
    expect(transaction.queue.map(step => step.type)).toEqual(['GEOMAGNETIC_REVERSAL', 'GEOMAGNETIC_RESTORE_SHUFFLE', 'HP_DAMAGE']);
    expect(transaction.queue[1]).toMatchObject({ actorIdx: 1, restoreCard });
    expect(prepareAnimationQueueSteps(transaction.queue).issues).toEqual([]);
    const withoutCard = createAuthorityAnimationTransaction([
      { id: 'geomagnetic-empty', type: 'areaEffectStarted', seat: 0, kind: 'geomagneticReversal' },
    ], model);
    expect(withoutCard.queue.map(step => step.type)).toEqual(['GEOMAGNETIC_REVERSAL']);
  });

  it('passes explicit etherealize stacks and rotates the effect actor', () => {
    const transaction = createAuthorityAnimationTransaction([
      { id: 'etherealize', type: 'areaEffectStarted', seat: 0, kind: 'etherealizeGain', stackCount: 3 },
    ], model);
    expect(transaction.queue[0]).toMatchObject({ type: 'ETHEREALIZE_GAIN', actorIdx: 1, stackCount: 3 });
    expect(prepareAnimationQueueSteps(transaction.queue).issues).toEqual([]);
  });

  it('uses explicit snake rays and ordered hits instead of final living player counts', () => {
    const transaction = createAuthorityAnimationTransaction([
      { id: 'snakes', type: 'areaEffectStarted', seat: 1, kind: 'snakeTrap', rayCount: 4,
        assignments: [{ seat: 0, count: 2 }, { seat: 1, count: 1 }], hits: [0, 1, 0] }, loss,
    ], model);
    expect(transaction.queue[0]).toMatchObject({ type: 'SNAKE_TRAP', rayAngles: [0, 90, 180, 270], durationMs: 3200,
      assignmentList: [{ idx: 1, count: 2 }, { idx: 0, count: 1 }],
      assignmentHits: [{ idx: 1 }, { idx: 0 }, { idx: 1 }] });
    expect(prepareAnimationQueueSteps(transaction.queue).issues).toEqual([]);
  });

  it('maps explicit petrification cause without inferring it from a dead snapshot', () => {
    const transaction = createAuthorityAnimationTransaction([
      { id: 'petrified', type: 'statChanged', seat: 1, kind: 'PLAYER_DEFEATED', cause: 'petrification' },
    ], model);
    expect(transaction.queue.some(step => step.type === 'PETRIFY_DEATH')).toBe(true);
    expect(prepareAnimationQueueSteps(transaction.queue).issues).toEqual([]);
  });
});

describe('authority view event buffering and restoration', () => {
  it('starts from a snapshot baseline, reserves duplicates, and keeps unseen arrival order', () => {
    const buffer = createAuthorityEventBuffer(baseline);
    expect(buffer.receive({ ...baseline })).toBeNull();
    const next = { ...baseline, revision: 1, events: [...baseline.events, loss] };
    expect(buffer.receive(next)).toEqual({ restore: false, events: [loss] });
    expect(buffer.receive({ ...next })).toBeNull();
    const turn = { id: 'turn', type: 'turnStarted', seat: 1 };
    expect(buffer.receive({ ...next, revision: 2, events: [loss, turn] })).toEqual({ restore: false, events: [turn] });
    expect(buffer.receive(next)).toBeNull();
  });

  it('clears buffered private presentation immediately on a same-revision revocation', () => {
    const privateView = { ...baseline, players: [{ ...players[0], hand: [{ id: 'private', name: '不得滞留' }] }, players[1]] };
    const buffer = createAuthorityEventBuffer(privateView);
    expect(buffer.receive(baseline)).toEqual({ restore: true, events: [] });
    expect(buffer.receive({ ...baseline })).toBeNull();
  });

  it.each(['peeks', 'privateReveals', 'litDeck'])('plays new facts when a later decision expires %s grants', grant => {
    const buffer = createAuthorityEventBuffer({ ...baseline, [grant]: [{ id: 'expired-secret' }] });
    const received = buffer.receive({ ...baseline, revision: 1, [grant]: [], events: [loss] });
    expect(received).toEqual({ restore: false, events: [loss] });
    expect(JSON.stringify(received)).not.toContain('expired-secret');
    const transaction = createAuthorityAnimationTransaction(received.events, model, model.gs);
    expect(transaction.queue.map(step => step.type)).toEqual(['HP_DAMAGE']);
    expect(JSON.stringify(transaction)).not.toContain('expired-secret');
  });

  it('still restores when a later revision revokes hand visibility', () => {
    const hidden = createAuthorityEventBuffer(baseline);
    expect(hidden.receive({ ...baseline, revision: 1, players: [players[0], { ...players[1], hand: undefined }] }))
      .toEqual({ restore: true, events: [] });
  });

  it('treats a new match or viewer as restoration, never replaying retained historical events', () => {
    const buffer = createAuthorityEventBuffer(baseline);
    expect(buffer.receive({ ...baseline, viewerSeat: null })).toEqual({ restore: true, events: [] });
    expect(buffer.receive({ ...baseline, matchId: 'another' })).toEqual({ restore: true, events: [] });
  });
});
