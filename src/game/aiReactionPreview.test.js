import { describe, expect, it } from 'vitest';
import { createAiObservationState, evaluateAiState } from './aiPolicy';
import { chooseAiDamageReaction, createAiReactionObservation, resolveAiReactionPreview } from './aiReactionPreview';
import { resolveHeadlessEtherealize } from './headlessSimulator';
import { ROLE_CULTIST, ROLE_HUNTER } from './coreUtils';
import { makeGs, makeGodCard, makePlayer } from './__tests__/factory';
import { createTsathogguaSlimeCard } from '../constants/card';

describe('AI reaction rule previews', () => {
  it('does not treat the hidden immortality deck as a guaranteed cultist victory', () => {
    const state = makeGs({
      currentTurn: 1, phase: 'ETHEREALIZE_DECISION',
      players: [
        makePlayer({ role: ROLE_CULTIST, roleRevealed: true, hp: 1, san: 1,
          godName: 'VRI', godLevel: 1, etherealizeStacks: 1 }),
        makePlayer({ role: ROLE_HUNTER, roleRevealed: true }),
      ],
      deck: [makeGodCard('NYA')],
      abilityData: {
        type: 'etherealizeRedirect', targetIdx: 0, lostHp: 1, lostSan: 1,
        adjacentTargets: [1], pendingIndex: 0, _turnOwner: 1,
        pendingLosses: [{ targetIdx: 0, lostHp: 1, lostSan: 1, source: '封入石棺', order: 0 }],
      },
    });
    const actual = resolveHeadlessEtherealize(state, { useEtherealize: false });
    expect(actual.players[0]).toMatchObject({ hp: 0, san: 1, isDead: true });
    expect(actual.gameOver.winner).toBe(ROLE_HUNTER);

    const observation = createAiObservationState(state, 0);
    observation.abilityData = structuredClone(state.abilityData);
    const preview = resolveAiReactionPreview(observation, 0);
    expect(evaluateAiState(preview, 0)[0]).toBe(0);
    expect(preview.gameOver).toBeNull();
    expect(chooseAiDamageReaction(state)).toEqual({ useEtherealize: true, redirectTargetIdx: 1 });
  });

  it('retains and resolves a pending SAN inspection after slime balancing', () => {
    const state = makeGs({
      currentTurn: 1, phase: 'TSG_SLIME_BALANCE',
      players: [
        makePlayer({ role: ROLE_HUNTER, hp: 4, san: 4, hand: [createTsathogguaSlimeCard()] }),
        makePlayer({ role: ROLE_CULTIST, roleRevealed: true }),
      ],
      abilityData: {
        type: 'tsgSlimeBalance', targetIdx: 0, afterHp: 4, afterSan: 4, lostSan: 1, _turnOwner: 1,
        pendingSanInspection: { targetIndex: 0, startIndex: 1, reason: 'SAN损失', hiddenCard: { name: 'SECRET' } },
      },
    });
    const observation = createAiReactionObservation(state, 0);
    expect(observation.abilityData.pendingSanInspection).toEqual({ targetIndex: 0, startIndex: 1, reason: 'SAN损失' });
    const result = resolveAiReactionPreview(observation, 0);
    expect(result._inspectionSeq).toBeGreaterThan(0);
    expect(result._aiPreviewIncomplete).toBe(true);
    expect(result.gameOver).toBeNull();
  });

  it('leaves remaining inspection targets explicitly unresolved after a damage reaction', () => {
    const state = makeGs({
      currentTurn: 1, phase: 'ETHEREALIZE_DECISION',
      players: [makePlayer({ role: ROLE_HUNTER }), makePlayer({ role: ROLE_CULTIST, roleRevealed: true })],
      abilityData: {
        type: 'etherealizeRedirect', targetIdx: 0, lostHp: 1, adjacentTargets: [1], pendingIndex: 0,
        pendingLosses: [{ targetIdx: 0, lostHp: 1, lostSan: 0, order: 0 }], _turnOwner: 1,
        pendingInspectionContinuation: { targets: [1], startIndex: 1, hiddenDeck: [{ name: 'SECRET' }] },
      },
    });
    const observation = createAiReactionObservation(state, 0);
    expect(observation.abilityData.pendingInspectionContinuation).toEqual({ targets: [1], startIndex: 1 });
    const result = resolveAiReactionPreview(observation, 0);
    expect(result._aiPreviewIncomplete).toBe(true);
    expect(result._aiPendingResolution).toBe('reactionContinuation');
  });

  it('does not copy or execute hidden draw/god continuation payloads', () => {
    const state = makeGs({
      currentTurn: 1, phase: 'ETHEREALIZE_DECISION', deck: [makeGodCard('NYA', { name: 'SECRET_DECK' })],
      players: [makePlayer({ role: ROLE_HUNTER, poisonStacks: 3 }), makePlayer({ role: ROLE_CULTIST, roleRevealed: true })],
      abilityData: {
        type: 'etherealizeRedirect', targetIdx: 0, lostHp: 1, adjacentTargets: [1], pendingIndex: 0,
        pendingLosses: [{ targetIdx: 0, lostHp: 1, lostSan: 0, order: 0 }], _turnOwner: 1,
        continueTurnStartDraw: true,
        pendingGodChoice: { godCard: { name: 'SECRET_GOD' }, players: [{ hand: [{ name: 'SECRET_HAND' }] }] },
      },
    });
    const before = structuredClone(state);
    const observation = createAiReactionObservation(state, 0);
    expect(JSON.stringify(observation)).not.toContain('SECRET');
    expect(observation.players[0].poisonStacks).toBe(3);
    const result = resolveAiReactionPreview(observation, 0);
    expect(result.players[0].hand).toEqual([]);
    expect(result.deck).toEqual([]);
    expect(result.deckCount).toBe(1);
    expect(result._aiPreviewIncomplete).toBe(true);
    expect(result._aiPendingResolution).toBe('reactionContinuation');
    expect(state).toEqual(before);
  });

  it('retains opaque continuation markers attached to a queued slime decision', () => {
    const state = makeGs({
      currentTurn: 1, phase: 'TSG_SLIME_BALANCE',
      players: [makePlayer({ role: ROLE_HUNTER }), makePlayer({ role: ROLE_CULTIST, roleRevealed: true })],
      abilityData: {
        targetIdx: 0, afterHp: 10, afterSan: 10, _turnOwner: 1,
        pendingSlimeBalanceDecisions: [{
          targetIdx: 1, afterHp: 10, afterSan: 10, _turnOwner: 1,
          pendingGodChoice: { godCard: { name: 'SECRET_GOD' } },
        }],
      },
    });
    const observation = createAiReactionObservation(state, 0);
    expect(JSON.stringify(observation)).not.toContain('SECRET');
    const result = resolveAiReactionPreview(observation, 0);
    expect(result._aiPreviewIncomplete).toBe(true);
    expect(result._aiPendingResolution).toBe('reactionContinuation');
  });
});
