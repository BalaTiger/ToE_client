import { describe, expect, it } from 'vitest';
import { initGame } from '../setup';
import { copyPlayers, ROLE_CULTIST, ROLE_HUNTER, ROLE_TREASURE } from '../coreUtils';
import { grantTsathogguaSlimeAtEndTurn, startNextTurn } from '../turnEngine';
import { buildTurnStartDrawReplayQueue, buildTurnStartPreDrawEffectQueue } from '../turnAnimState';
import { derotateGs, rotateGsForViewer } from '../rotateState';
import { buildMpRemoteReplayAction, MP_REMOTE_REPLAY } from '../multiplayerRemoteReplay';
import {
  compileFreshVisualEventQueue,
  getVisualEventIdsCoveredByAnimationQueue,
} from '../visualEventTransactionCompiler';
import { createAnimTransactionEvent, createTsathogguaSlimePopEvent, getVisualEvents, VISUAL_EVENT } from '../visualEvents';
import { getDecisionContext } from '../decisionContext';

const clone = value => JSON.parse(JSON.stringify(value));
const playerIds = players => players.map(player => player.id);
const handIds = player => player.hand.map(card => card.id);

// Legal controlled C6 -> A7 prior state, rather than a reconstruction of the
// unavailable original packet. Real initGame supplies each physical card;
// the rule helper creates the slime. No incorrect seat-order array is seeded.
function beforeSlimeTurn(sender = 2, { publicOtherHand = false } = {}) {
  const owner = (sender + 1) % 3;
  const other = (owner + 1) % 3;
  const state = initGame(['D34A', 'D34B', 'D34C'], undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, base => base, '地神的潜影',
    { roleCounts: { 追猎者: 1, 邪祀者: 1, 寻宝者: 1 } });
  const pool = [...state.deck, ...state.players.flatMap(player => player.hand)].sort((a, b) => a.id - b.id);
  const take = name => {
    const index = pool.findIndex(card => card.name === name || card.godKey === name);
    if (index < 0) throw new Error(`Missing real fixture card: ${name}`);
    return pool.splice(index, 1)[0];
  };
  const hands = [];
  hands[owner] = ['惊扰蝙蝠', '地刺陷阱', '鼠群', '斯芬克斯'].map(take);
  hands[other] = ['石化配方', '新鲜空气', '猎获穴兽', '掘墓'].map(take);
  hands[sender] = ['落井下石', '夜风呼啸', '触底反弹', '活死人哨兵'].map(take);
  const tsg = take('TSG'), vri = take('VRI');
  const nextDraws = ['钻地魔虫', '蚂蚁虽小'].map(take);
  const discard = [take('秤心仪式'), take('活火山')];
  const players = state.players.map((player, seat) => ({
    ...player,
    uuid: `toe034-test-user-${seat}`,
    role: seat === owner ? ROLE_HUNTER : seat === other ? ROLE_CULTIST : ROLE_TREASURE,
    hp: seat === other ? 3 : 6, san: seat === sender ? 10 : 9,
    hand: hands[seat], godZone: seat === owner ? [tsg] : seat === other ? [vri] : [],
    godName: seat === owner ? 'TSG' : seat === other ? 'VRI' : null,
    godLevel: seat === sender ? 0 : 1, hasBelievedGod: seat !== sender,
    isDead: false, isResting: false, revealHand: seat === other && publicOtherHand,
  }));
  const log = ['C6 has kept and discarded the volcano; A7 is next.'];
  expect(grantTsathogguaSlimeAtEndTurn(players, owner, log, [])).toBeTruthy();
  return { ...state, players, deck: [...nextDraws, ...pool], discard, currentTurn: sender,
    turn: 6, _turnKey: 6, phase: 'ACTION', abilityData: {}, drawReveal: null,
    gameOver: null, _isMP: true, log, _visualEvents: [], _statEvents: [], _statEventSeq: 0 };
}

function makePacket(sender = 2, options) {
  const previous = beforeSlimeTurn(sender, options);
  const localPrevious = rotateGsForViewer(clone(previous), sender);
  const next = startNextTurn(localPrevious);
  expect(next.turn).toBe(7);
  expect(next.drawReveal.card.name).toBe('钻地魔虫');
  const replay = buildTurnStartDrawReplayQueue({ oldGs: localPrevious, newGs: next });
  const transaction = createAnimTransactionEvent({
    actorIdx: next.currentTurn, actorName: next.players[next.currentTurn].name,
    queue: replay.queue, context: 'turnStartDraw', barrier: 'decision',
    beforePlayers: localPrevious.players, beforeDiscard: localPrevious.discard,
    coveredEventIds: getVisualEventIdsCoveredByAnimationQueue(next, replay.queue),
  });
  // Same queue/event/rotation helpers used by App.broadcastAnimTransaction.
  const raw = clone(derotateGs({ ...next, _visualEvents: [transaction, ...next._visualEvents] }, sender));
  return { previous, localPrevious, next, replay, raw };
}

function remoteAction(raw, previous, viewer, consumedVisualEventIds) {
  return buildMpRemoteReplayAction({
    rotated: rotateGsForViewer(clone(raw), viewer),
    previousGs: rotateGsForViewer(clone(previous), viewer),
    roleRevealed: true, compileFreshVisualEventQueue, consumedVisualEventIds,
  });
}

function visualSnapshots(action) {
  const snapshots = [];
  if (action.visualLock?.players) snapshots.push(action.visualLock.players);
  const visit = step => {
    if (step?.players) snapshots.push(step.players);
    if (step?.beforePlayers) snapshots.push(step.beforePlayers);
    if (step?.visualSetupPatch?.players) snapshots.push(step.visualSetupPatch.players);
    for (const cue of step?.visualTimeline || []) {
      if (cue.patch?.players) snapshots.push(cue.patch.players);
    }
    for (const child of step?.steps || []) visit(child);
  };
  action.queue.forEach(visit);
  if (action.pendingGs?.players) snapshots.push(action.pendingGs.players);
  return snapshots;
}

function expectPrivateHandIdentity(action, previous, viewer) {
  const expected = rotateGsForViewer(previous, viewer).players;
  const snapshots = visualSnapshots(action);
  expect(snapshots.length).toBeGreaterThan(3);
  for (const players of snapshots) {
    expect(playerIds(players)).toEqual(playerIds(expected));
    expect(players.map(player => player.uuid)).toEqual(expected.map(player => player.uuid));
    for (let seat = 0; seat < players.length; seat++) {
      expect(players[seat].name).toBe(expected[seat].name);
      expect(players[seat].revealHand).toBe(expected[seat].revealHand);
      // The pop only removes its owner's derived slime. Every ordinary card
      // must remain with its real owner, including the always face-up self hand.
      expect(handIds(players[seat]).filter(id => typeof id === 'number'))
        .toEqual(handIds(expected[seat]).filter(id => typeof id === 'number'));
    }
  }
}

describe('TOE034 slime projection and event ownership', () => {
  it('derotates rule-produced standalone snapshots into the same canonical order as the state', () => {
    const { raw, previous } = makePacket();
    const event = raw._visualEvents.find(event => event.type === VISUAL_EVENT.TSG_SLIME_POP);
    expect(event.playerIdx).toBe(0);
    expect(playerIds(event.playersBefore)).toEqual(playerIds(previous.players));
    expect(playerIds(event.playersAfter)).toEqual(playerIds(previous.players));
    expect(event.playersBefore[0].hand.length - event.playersAfter[0].hand.length).toBe(1);
  });

  it.each([0, 1, 2])('sender %i keeps each receiver identity through every visual phase and plays one pop', sender => {
    const { raw, previous } = makePacket(sender);
    const pop = raw._visualEvents.find(event => event.type === VISUAL_EVENT.TSG_SLIME_POP);
    const wrapper = raw._visualEvents.find(event => event.type === VISUAL_EVENT.ANIM_TRANSACTION);
    expect(wrapper.coveredEventIds).toContain(pop.id);
    for (const viewer of [0, 1, 2]) {
      const action = remoteAction(raw, previous, viewer);
      expect(action.type).toBe(MP_REMOTE_REPLAY.ANIM_QUEUE);
      const pops = action.queue.filter(step => step.type === 'TSG_SLIME_POP');
      expect(pops).toHaveLength(1);
      expect(pops[0].visualEventId).toBe(pop.id);
      expect(action.consumedVisualEventIds).toContain(pop.id);
      expectPrivateHandIdentity(action, previous, viewer);
    }
  });

  it('retains a legitimate standalone pop when no exact transaction represents it', () => {
    const { raw, previous } = makePacket();
    raw._visualEvents = raw._visualEvents.filter(event => event.type === VISUAL_EVENT.TSG_SLIME_POP);
    raw.phase = 'ACTION'; raw.drawReveal = null; raw._turnStartLogs = []; raw._drawLogs = [];
    for (const viewer of [0, 1, 2]) {
      const action = remoteAction(raw, previous, viewer);
      expect(action.queue.filter(step => step.type === 'TSG_SLIME_POP')).toHaveLength(1);
      expectPrivateHandIdentity(action, previous, viewer);
    }
  });

  it('rotates independent and nested pop references/snapshots identically without changing stable identities', () => {
    const state = beforeSlimeTurn();
    state.players[0].damageLink = { partner: 1, expiryOwner: 0, active: true };
    const event = { id: 'pop:reference', type: VISUAL_EVENT.TSG_SLIME_POP,
      playerIdx: 0, targetPid: 0, turnOwner: 0,
      playersBefore: copyPlayers(state.players), playersAfter: copyPlayers(state.players),
      cards: [state.players[0].hand.at(-1)] };
    state._visualEvents = [event, { id: 'draw:nested', type: VISUAL_EVENT.DRAW_CARD, playerIdx: 0, slimePop: event }];
    for (const viewer of [0, 1, 2]) {
      const rotated = rotateGsForViewer(clone(state), viewer);
      const [standalone, draw] = rotated._visualEvents;
      expect(standalone.playerIdx).toBe((3 - viewer) % 3);
      expect(standalone.targetPid).toBe(standalone.playerIdx);
      expect(standalone.turnOwner).toBe(standalone.playerIdx);
      expect(standalone.playersBefore).toEqual(draw.slimePop.playersBefore);
      expect(standalone.playersAfter).toEqual(draw.slimePop.playersAfter);
      expect(playerIds(standalone.playersBefore)).toEqual(playerIds(rotated.players));
      expect(standalone.playersBefore[standalone.playerIdx].damageLink.partner).toBe((4 - viewer) % 3);
      expect(standalone.cards[0].id).toBe(event.cards[0].id);
      expect(standalone.id).toBe(event.id);
      expect(derotateGs(rotated, viewer)._visualEvents[0]).toEqual(event);
    }
    const minimal = { id: 'pop:legacy-minimal', type: VISUAL_EVENT.TSG_SLIME_POP, targetPid: -1 };
    const rotated = rotateGsForViewer({ ...state, _visualEvents: [minimal] }, 1)._visualEvents[0];
    expect(rotated).toEqual(minimal);
    expect(Object.hasOwn(rotated, 'playersBefore')).toBe(false);
    expect(Object.hasOwn(rotated, 'playersAfter')).toBe(false);
    expect(Object.hasOwn(rotated, 'playerIdx')).toBe(false);
  });

  it.each(['set', 'array'])('skips only a consumed real owner (%s); another identical-looking event and an idless save still play', registry => {
    const { localPrevious, next } = makePacket();
    const first = { ...next._visualEvents.find(event => event.type === VISUAL_EVENT.TSG_SLIME_POP), turnStartStage: 'turnStart' };
    const second = { ...createTsathogguaSlimePopEvent({ ...first }), turnStartStage: 'turnStart' };
    const legacy = { ...first }; delete legacy.id;
    const state = { ...next, _visualEvents: [first, second, legacy] };
    const consumed = registry === 'set' ? new Set([first.id]) : [first.id];
    const queue = buildTurnStartPreDrawEffectQueue({ oldGs: localPrevious, newGs: state, consumedVisualEventIds: consumed });
    const pops = queue.filter(step => step.type === 'TSG_SLIME_POP');
    expect(pops).toHaveLength(2);
    expect(pops[0].visualEventId).toBe(second.id);
    // getVisualEvents already normalizes old save identities. Propagate that
    // existing compatibility owner rather than inventing a new producer ID.
    expect(pops[1].visualEventId).toBe(getVisualEvents(state)[2].id);
    expect(pops[1].cards).toEqual(first.cards);
  });

  it('does not replay a consumed draw-bound pop while its still-fresh draw remains visible', () => {
    const { next, localPrevious } = makePacket();
    const pop = next._visualEvents.find(event => event.type === VISUAL_EVENT.TSG_SLIME_POP);
    const replay = buildTurnStartDrawReplayQueue({ oldGs: localPrevious, newGs: next, consumedVisualEventIds: new Set([pop.id]) });
    expect(replay.queue.filter(step => step.type === 'TSG_SLIME_POP')).toHaveLength(0);
    expect(replay.queue.filter(step => step.type === 'DRAW_CARD')).toHaveLength(1);
  });

  it('still plays a legacy draw descriptor without creating an owner that the descriptor did not supply', () => {
    const { next, localPrevious } = makePacket();
    const draw = next._visualEvents.find(event => event.type === VISUAL_EVENT.DRAW_CARD && event.slimePop);
    delete draw.slimePop.id;
    const replay = buildTurnStartDrawReplayQueue({ oldGs: localPrevious, newGs: next });
    const pops = replay.queue.filter(step => step.type === 'TSG_SLIME_POP');
    expect(pops).toHaveLength(1);
    expect(Object.hasOwn(pops[0], 'visualEventId')).toBe(false);
  });

  it('plays another uncovered event once even when its card and message match the already owned pop', () => {
    const { raw, previous } = makePacket();
    const first = raw._visualEvents.find(event => event.type === VISUAL_EVENT.TSG_SLIME_POP);
    const second = createTsathogguaSlimePopEvent({ ...first });
    raw._visualEvents.push(second);
    const action = remoteAction(raw, previous, 0);
    const pops = action.queue.filter(step => step.type === 'TSG_SLIME_POP');
    expect(pops.map(step => step.visualEventId)).toEqual([first.id, second.id]);
    expect(action.consumedVisualEventIds).toEqual(expect.arrayContaining([first.id, second.id]));
  });

  it('preserves public hand flags and a spectator read-only decision without swapping identity', () => {
    const { raw, previous } = makePacket(2, { publicOtherHand: true });
    for (const viewer of [0, 1, 2]) {
      const action = remoteAction(raw, previous, viewer);
      expectPrivateHandIdentity(action, previous, viewer);
      const visiblePublicHand = visualSnapshots(action).map(players => players.find(player => player.uuid === 'toe034-test-user-1'));
      expect(visiblePublicHand.every(player => player.revealHand && player.hand.length === 4)).toBe(true);
      const spectatorState = action.pendingGs;
      expect(getDecisionContext(spectatorState, { isSpectating: true })).toMatchObject({ localCanAct: false, presentation: 'readOnly' });
      expect(getDecisionContext(spectatorState).ownerSeats).toEqual([(3 - viewer) % 3]);
    }
  });

  it('keeps restored UUID/seat and consumes an earlier packet without dropping a future fresh pop', () => {
    const { raw, previous } = makePacket();
    const first = remoteAction(raw, previous, 1);
    const consumed = new Set(first.consumedVisualEventIds);
    const restored = { ...raw, phase: 'ACTION', drawReveal: null, _turnStartLogs: [], _drawLogs: [] };
    const duplicate = remoteAction(restored, restored, 1, consumed);
    expect(duplicate.type).toBe(MP_REMOTE_REPLAY.SET_STATE);
    expect(duplicate.gs.players[0].uuid).toBe('toe034-test-user-1');
    const fresh = makePacket();
    const replay = remoteAction(fresh.raw, fresh.previous, 1, consumed);
    expect(replay.queue.filter(step => step.type === 'TSG_SLIME_POP')).toHaveLength(1);
    expectPrivateHandIdentity(replay, fresh.previous, 1);
  });
});
