import { describe, it, expect } from 'vitest';
import { createAuthorityAnimationTransaction } from '../src/authority/presentationEvents';
import { prepareAnimationQueueSteps } from '../src/game/animationStepSchema';
import { resolveAnimationStepTiming, buildAnimationPlaybackCues } from '../src/game/animationTiming';
import { ANIM_DURATION, ANIM_SPEED_SCALE, ANIM_STEP_GAP, CARD_REVEAL_DURATION } from '../src/components/anim/constants';
import { presentationBudget } from '@toe-authority/presentationTiming';

const card = { id: 'public-card', name: 'Public card', key: 'A1', type: 'selfHealHP', val: 1 };
const slime = { ...card, id: 'slime', isTsathogguaSlime: true };
const goat = { ...card, id: 'goat', isBlackGoatYoung: true };
const players = Array.from({ length: 3 }, (_, id) => ({ id, seat: id, name: `P${id}`, hp: 8, san: 8,
  hand: [card, slime, goat], handCount: 3, godZone: [], zoneCards: [] }));
const model = { me: players[0], gs: { phase: 'ACTION', players, discard: [card] }, toDisplaySeat: seat => seat ?? null };
const rows = [
  { type: 'turnStarted', seat: 0 },
  ...['swap', 'hunt', 'bewitch'].map(kind => ({ type: 'skillStarted', kind, sourceSeat: 0, targetSeat: 1 })),
  ...['draw', 'hunt', 'discard', 'keep', 'destroyed'].map(reason => ({ type: 'cardRevealed', seat: 0, card, reason })),
  { type: 'sphinxRevealed', seat: 0, card },
  { type: 'inspectionRevealed', seat: 0, inspectionCard: { name: 'Inspection', effect: 'drawCard' }, hiddenDrawCount: 2 },
  { type: 'inspectionRevealed', seat: 0, inspectionCard: { name: 'Inspection', effect: 'discardCard' },
    discards: [0, 1, 2].map(seat => ({ seat, card, destination: 'discard' })) },
  { type: 'bewitchGiven', sourceSeat: 0, targetSeat: 1, card },
  { type: 'huntAttack', sourceSeat: 0, targetSeat: 1, card },
  { type: 'huntResolved', sourceSeat: 0, targetSeat: 1, outcome: 'survived' },
  { type: 'restRolled', seat: 0, d1: 2, d2: 4 },
  { type: 'diceRolled', seat: 0, roll: 4 },
  { type: 'caveDuelRevealed', sourceSeat: 0, targetSeat: 1, sourceCard: card, targetCard: card, winnerSeat: 0 },
  { type: 'damageLinkEstablished', sourceSeat: 0, targetSeat: 1 },
  { type: 'damageLinkExpired', pair: [0, 1] },
  ...['blackGoat', 'tsathogguaSlime'].map(kind => ({ type: 'publicTokensGranted', seat: 0, kind, cards: [kind === 'blackGoat' ? goat : slime] })),
  { type: 'tsgSlimePopped', seat: 0, poppedCards: [slime], fromHp: 8, hp: 9, fromSan: 8, san: 9 },
  { type: 'publicCardRetrieved', seat: 0, source: 'discard', card },
  { type: 'hiddenHandTransferred', sourceSeat: 0, targetSeat: 1, count: 2, sourceCount: 1, targetCount: 5 },
  { type: 'handsSwapped', sourceSeat: 0, targetSeat: 1, sourceCount: 3, targetCount: 3 },
  { type: 'handsSwapped', sourceSeat: 0, targetSeat: 1, sourceCount: 0, targetCount: 0 },
  { type: 'publicCardsDiscarded', seat: 0, source: 'godZone', cards: [card] },
  { type: 'etherealizeConsumed', sourceSeat: 0, stacksAfter: 0 },
  { type: 'swapCommitted', sourceSeat: 0, targetSeat: 1, count: 1, sourceCount: 3, targetCount: 3 },
  ...['hand', 'discard', 'zone', 'godZone'].map(destination => ({ type: 'cardIncomeCommitted', seat: 0, source: 'reveal', destination, card })),
  { type: 'deathCardsRemoved', seat: 0, discardedCards: [card], destroyedCount: 2 },
  ...['earthquake', 'forcedRandomDiscard'].map(kind => ({ type: 'cardsDiscarded', kind,
    discards: [0, 1, 2].map(seat => ({ seat, card, destination: 'discard' })) })),
  ...['undergroundSpring', 'startledBats', 'nightWind', 'volcano', 'etherealizeGain'].map(kind => ({ type: 'areaEffectStarted', kind, seat: 0, stackCount: 2 })),
  { type: 'areaEffectStarted', kind: 'geomagneticReversal', seat: 0, restoreCard: card },
  { type: 'areaEffectStarted', kind: 'snakeTrap', seat: 0, rayCount: 3, assignments: [{ seat: 0, count: 8 }], hits: [0] },
  { type: 'immortalRevealed', seat: 0, cards: [card], succeeded: true },
  ...['burrowingWorm', 'apophisEclipse', 'cthulhuDream', 'endlessCorridorStarted', 'godPowerBlocked'].map(type => ({ type, seat: 0 })),
  { type: 'burrowingWormTarget', sourceSeat: 0, targetSeat: 1 },
  { type: 'throwStone', sourceSeat: 0, targetSeat: 1, roll: 4, distance: 1, damage: 3 },
  { type: 'apophisTarget', sourceSeat: 0, roll: 4, changed: true },
  { type: 'godStatusChanged', seat: 0, godKey: 'ZHU', godLevel: 1 },
  { type: 'deckReshuffled' },
  { type: 'deckReshuffled', count: 12 },
  ...[true, false].map(isResting => ({ type: 'playerRestChanged', seat: 0, isResting })),
  ...[card, { _back: true }].map(face => ({ type: 'buriedToDeck', seat: 0, destination: 'deckBottom',
    count: 1, sourceCount: 2, cards: [face] })),
  ...[card, { _back: true }].map(face => ({ type: 'zhuCardHidden', seat: 0, card: face })),
  ...[1, 6].map(count => ({ type: 'blackGoatPulse', seat: 0, count })),
  ...['handLimit', 'torch'].map(kind => ({ type: 'cardsDiscarded', kind,
    discards: [{ seat: 0, card, destination: 'discard' }, { seat: 0, card: goat, destination: 'destroyed' }] })),
  { type: 'stoneCardsArranged', seat: 0, keptCard: { _back: true }, handCount: 4, returnedCount: 2 },
  { type: 'stoneCardsArranged', seat: 0, keptCard: card, handCount: 4, returnedCount: 2,
    topCards: [slime], bottomCards: [goat] },
  { type: 'stoneCardsArranged', seat: 1, keptCard: { _back: true }, handCount: 4, returnedCount: 0 },
  { type: 'targetSelected', seat: 0, targetSeat: 1, reason: 'albinoCreature' },
  { type: 'targetSelected', seat: 0, targetSeat: 1 },
  ...['HP_LOSS', 'SAN_LOSS', 'HP_SAN_LOSS', 'HP_GAIN', 'SAN_GAIN', 'HP_SAN_GAIN'].map(kind => ({
    type: 'statChanged', seat: 0, kind, fromHp: 8, hp: kind.includes('HP') ? (kind.includes('LOSS') ? 6 : 9) : 8,
    fromSan: 8, san: kind.includes('SAN') ? (kind.includes('LOSS') ? 6 : 9) : 8,
  })),
  ...['hpDepleted', 'petrification'].map(cause => ({ type: 'statChanged', seat: 0, kind: 'PLAYER_DEFEATED', cause, hp: 0, san: 8 })),
];
describe('server public budget covers the original timed presentation before the explicit 60s cap', () => {
  it.each([true, false])('public swap-give phase covers the private take flight, blind=%s', blind => {
    const transaction = createAuthorityAnimationTransaction([{ id: 'private-take', type: 'swapTakeCommitted',
      sourceSeat: 0, targetSeat: 1, card, sourceCount: 4, targetCount: 2, blind }], model);
    expect(transaction.queue).toHaveLength(1);
    const timed = resolveAnimationStepTiming(transaction.queue[0], { durationByType: ANIM_DURATION,
      speedScale: ANIM_SPEED_SCALE, cardRevealDuration: CARD_REVEAL_DURATION });
    expect(timed.durationMs).toBe(700);
    const duration = Math.max(...buildAnimationPlaybackCues(timed, ANIM_STEP_GAP).map(cue => cue.atMs));
    const allowance = presentationBudget([], 60000, {
      fromPhase: blind ? 'SWAP_STEAL_CARD' : 'SWAP_SELECT_TARGET_CARD', toPhase: 'SWAP_GIVE_CARD',
    });
    expect(allowance).toBe(1620);
    expect(allowance).toBeGreaterThanOrEqual(duration);
    expect(presentationBudget([], 60000, { fromPhase: 'SWAP_GIVE_CARD', toPhase: 'SWAP_GIVE_CARD' })).toBe(0);
  });
  it.each(rows.map((event, index) => [index, event]))('public fixture %i %j', (index, event) => {
    const packet = { ...event, id: `parity-${index}` };
    const transaction = createAuthorityAnimationTransaction([packet], model);
    const preparation = prepareAnimationQueueSteps(transaction.queue);
    expect(preparation.issues).toEqual([]);
    const steps = preparation.steps.flatMap(step => step.type === 'DRAW_CARD' && !step.card?.effect && !step.disableDrawBackgroundCamera
      ? [{ type: 'DRAW_BACKGROUND_CAMERA_PRE' }, step] : [step]);
    expect(steps.length).toBeGreaterThan(0);
    const duration = steps.filter(step => step.type !== 'STATE_PATCH').reduce((total, step) => {
      const timed = resolveAnimationStepTiming(step, { durationByType: ANIM_DURATION, speedScale: ANIM_SPEED_SCALE,
        cardRevealDuration: CARD_REVEAL_DURATION });
      return total + (step.type === 'GUILLOTINE' ? 2500 : 0)
        + Math.max(...buildAnimationPlaybackCues(timed, ANIM_STEP_GAP).map(cue => cue.atMs));
    }, 0);
    expect(presentationBudget([packet]), JSON.stringify({ event, steps: steps.map(step => step.type), duration }))
      .toBeGreaterThanOrEqual(duration);
  });
});
