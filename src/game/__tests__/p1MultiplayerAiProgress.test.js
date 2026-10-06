import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import * as takeover from '../multiplayerAiTakeover';
import { rotateGsForViewer } from '../rotateState';
import { startNextTurn } from '../turnEngine';
import { ROLE_CULTIST, ROLE_HUNTER, ROLE_TREASURE } from '../coreUtils';
import { makeBlankZoneCard, makeGs, makePlayer, makeZoneCard } from './factory';

const dependencies = { getHandLimitForPlayer: () => 4 };

function makeMatch() {
  const food = makeBlankZoneCard({
    id: 'takeover-food', name: '霉变食物', type: 'moldyFood', polarity: 'positive',
  });
  const room = {
    roomId: 'local-regression',
    aiAuthorityUuid: 'a',
    players: [
      { uuid: 'a', isAI: false },
      { uuid: 'b', isAI: false },
      { uuid: 'c', isAI: true },
    ],
  };
  const gs = makeGs({
    _isMP: true,
    _turnKey: 2,
    currentTurn: 1,
    phase: 'ACTION',
    players: [
      makePlayer({ name: 'A', role: ROLE_TREASURE }),
      makePlayer({ name: 'B', role: ROLE_HUNTER }),
      makePlayer({ name: 'C', role: ROLE_CULTIST, hp: 6 }),
    ],
    deck: [food, makeBlankZoneCard({ id: 'following-draw' })],
  });
  return { gs, room, food };
}

function candidate(gs, room, options = {}) {
  expect(typeof takeover.getMpAiProgressCandidate).toBe('function');
  return takeover.getMpAiProgressCandidate({
    gs, room, playerUUID: 'a', myPlayerIndex: 0, blocked: false, ...options,
  });
}

describe('TOE016 continuous multiplayer AI takeover', () => {
  it('drives a committed later AI draw through the actual App effect without another disconnect event', () => {
    const { gs, room } = makeMatch();
    const source = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
    const marker = source.indexOf('    const pendingTakeover=pendingMpAiTakeoverRef.current;');
    const start = source.lastIndexOf('  useEffect(()=>{', marker);
    const closing = /\n {2}},\[[^\r\n]*\]\);/.exec(source.slice(start));
    if (marker < 0 || start < 0 || !closing) throw new Error('Missing App takeover effect');
    const handleMpAiTakeover = vi.fn();
    runInNewContext(source.slice(start, start + closing.index + closing[0].length), {
      useEffect: effect => effect(), roleRevealAnim: null, anim: null, animExiting: false,
      animQueueRef: { current: [] }, pendingGsRef: { current: null },
      pendingMpAiTakeoverRef: { current: null },
      pendingMpRawQueueRef: { current: [] }, pendingMpLatestStateRawRef: { current: null },
      gameOverPresentationFrozenRef: { current: false }, isMultiplayerRef: { current: true },
      myPlayerIndexRef: { current: 0 }, gs: startNextTurn(gs), roomModal: room, playerUUID: 'a',
      getMpAiProgressCandidate: takeover.getMpAiProgressCandidate, handleMpAiTakeover,
    });
    expect(handleMpAiTakeover).toHaveBeenCalledExactlyOnceWith({
      roomId: room.roomId, authorityUuid: 'a', playerIndex: 2,
    });
  });
  it('waits for the human cave-duel opponent after the AI has chosen once', () => {
    const { gs, room } = makeMatch();
    gs.players[2].hand = [makeZoneCard('A2')];
    gs.players[1].hand = [makeZoneCard('B3')];
    const pending = { ...gs, phase: 'CAVE_DUEL_WAIT_REVEAL',
      abilityData: { caveDuelSource: 2, caveDuelTarget: 1 } };
    expect(candidate(pending, room)).toBe(2);
    const chosen = takeover.resolveMpAiTakeoverState(pending, 2, dependencies);
    expect(chosen.abilityData.sourceCard).toEqual(gs.players[2].hand[0]);
    expect(chosen.abilityData.targetCard).toBeUndefined();
    expect(candidate(chosen, room)).toBeNull();
    expect(takeover.resolveMpAiTakeoverState(chosen, 2, dependencies)).toBeNull();
  });

  it('waits for a human hunt target even when the hunter is an AI seat', () => {
    const { gs, room } = makeMatch();
    const pending = { ...gs, currentTurn: 2, phase: 'HUNT_WAIT_REVEAL',
      abilityData: { huntTi: 1, huntPromptId: 'human-answer' } };
    expect(candidate(pending, room)).toBeNull();
    expect(takeover.resolveMpAiTakeoverState(pending, 2, dependencies)).toBeNull();
  });
  it('an AI target with no revealable cards fails the hunt without ending the human hunter turn', () => {
    const { gs, room } = makeMatch();
    const pending = { ...gs, phase: 'HUNT_WAIT_REVEAL', abilityData: { huntTi: 2, huntPromptId: 'empty-ai' } };
    pending.players[2].hand = [];
    const next = takeover.resolveMpAiTakeoverState(pending, candidate(pending, room), dependencies);
    expect(next.phase).toBe('ACTION');
    expect(next.currentTurn).toBe(pending.currentTurn);
    expect(next._turnKey).toBe(pending._turnKey);
    expect(next._visualEvents.some(event => event.type === 'logOnly' && event.msgs.some(line => line.includes('追捕失败')))).toBe(true);
  });
  it('needs another decision request when a previously irrelevant seat gets its later draw', () => {
    const { gs, food } = makeMatch();
    const original = structuredClone(gs);
    expect(takeover.resolveMpAiTakeoverState(gs, 2, dependencies)).toBeNull();

    const pendingDraw = startNextTurn(gs);
    expect(pendingDraw.currentTurn).toBe(2);
    expect(pendingDraw.phase).toBe('DRAW_REVEAL');
    expect(pendingDraw.drawReveal).toMatchObject({ card: food, needsDecision: true, drawerIdx: 2 });

    const progressed = takeover.resolveMpAiTakeoverState(pendingDraw, 2, dependencies);
    expect(progressed.currentTurn).toBe(0);
    expect(progressed.discard.filter(card => card.id === food.id)).toHaveLength(1);
    expect(progressed.players[2].hp).toBe(6);
    expect(pendingDraw.discard).toEqual([]);
    expect(gs).toEqual(original);
  });

  it('selects the offline AI on its later draw without a second takeover event', () => {
    const { gs, room, food } = makeMatch();
    expect(candidate(gs, room)).toBeNull();
    const pendingDraw = startNextTurn(gs);
    expect(candidate(pendingDraw, room)).toBe(2);
    const progressed = takeover.resolveMpAiTakeoverState(pendingDraw, candidate(pendingDraw, room), dependencies);
    expect(progressed.currentTurn).toBe(0);
    expect(progressed.discard.filter(card => card.id === food.id)).toHaveLength(1);
    expect(candidate(progressed, room)).toBeNull();
  });

  it('uses server authority when an earlier human seat is offline during its grace period', () => {
    const { gs, room } = makeMatch();
    const pendingDraw = startNextTurn(gs);
    const graceRoom = { ...room, aiAuthorityUuid: 'b' };
    // Public players deliberately still say A is human; only the server knows A's socket is absent.
    expect(candidate(pendingDraw, graceRoom)).toBeNull();
    expect(candidate(rotateGsForViewer(pendingDraw, 1), graceRoom, {
      playerUUID: 'b', myPlayerIndex: 1,
    })).toBe(1);
  });

  it('can resume a restored snapshot using room metadata alone', () => {
    const { gs, room } = makeMatch();
    const restoredDraw = structuredClone(startNextTurn(gs));
    expect(candidate(restoredDraw, structuredClone(room))).toBe(2);
    expect(candidate(restoredDraw, { ...room, aiAuthorityUuid: null })).toBeNull();
    expect(candidate(restoredDraw, { ...room, aiAuthorityUuid: 'b' })).toBeNull();
  });

  it('waits for replay/animation commit and leaves terminal or single-player states alone', () => {
    const { gs, room } = makeMatch();
    const pendingDraw = startNextTurn(gs);
    expect(candidate(pendingDraw, room, { blocked: true })).toBeNull();
    expect(candidate(pendingDraw, room, { blocked: false })).toBe(2);
    expect(candidate({ ...pendingDraw, gameOver: { winner: ROLE_HUNTER } }, room)).toBeNull();
    expect(candidate({ ...pendingDraw, _isMP: false }, room)).toBeNull();
  });

  it('never takes a human decision or runs on a non-authority client', () => {
    const { gs, room } = makeMatch();
    const pendingDraw = startNextTurn(gs);
    expect(candidate(pendingDraw, {
      ...room, players: room.players.map(player => ({ ...player, isAI: false })),
    })).toBeNull();
    expect(candidate(rotateGsForViewer(pendingDraw, 1), room, {
      playerUUID: 'b', myPlayerIndex: 1,
    })).toBeNull();
  });

  it('selects an AI decision target during a human turn without stealing that turn', () => {
    const { gs, room } = makeMatch();
    const revealCard = makeZoneCard('B2', 0, { id: 'offline-hunt-reveal' });
    const pendingHunt = {
      ...gs, phase: 'HUNT_WAIT_REVEAL', abilityData: { huntTi: 2 },
      players: gs.players.map((player, index) => index === 2 ? { ...player, hand: [revealCard] } : player),
    };
    expect(candidate(pendingHunt, room)).toBe(2);
    const progressed = takeover.resolveMpAiTakeoverState(pendingHunt, 2, dependencies);
    expect(progressed.phase).toBe('HUNT_CONFIRM');
    expect(progressed.currentTurn).toBe(1);
    expect(progressed.abilityData.revCard).toBe(revealCard);
    expect(candidate(progressed, room)).toBeNull();
  });
});
