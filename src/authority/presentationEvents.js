import { createQueueAnimationTransaction } from '../game/animationTransaction';
import { statEventsToAnimQueue, validateStatAnimationContinuity } from '../game/statEvents';
import { createVisualLogEntries } from '../game/visualEventLogs';
import { buildEarthquakeAnimStep } from '../game/visualEvents';

const STAT_KINDS = new Set(['HP_LOSS', 'HP_GAIN', 'SAN_LOSS', 'SAN_GAIN', 'HP_SAN_LOSS', 'HP_SAN_GAIN', 'PLAYER_DEFEATED']);
const nameAt = (players, seat) => players[seat]?.name || '角色';

const hiddenCard = (eventId, slot) => ({ id: `authority-event:${eventId}:${slot}`, _back: true, _authorityHidden: true });

// Mutate only the hand facts named by a receipt. Never copy the final player:
// it may already contain later damage, defeat, or another card acquisition.
function updateHand(players, seat, { eventId, removeCard, removeCount = 0, addCard, addCount = 0, exactCount, ownSeat }) {
  return players.map((player, index) => {
    if (index !== seat) return player;
    let hand = [...(player.hand || [])];
    for (let i = 0; i < removeCount; i += 1) {
      const known = removeCard?.id == null ? -1 : hand.findIndex(card => card.id === removeCard.id);
      const slot = known >= 0 ? known : hand.findIndex(card => card._back);
      if (slot >= 0) hand.splice(slot, 1);
      // An unidentified transfer cannot select an arbitrary visible face.
      else if (!removeCard && removeCount >= hand.length) hand = [];
    }
    for (let i = 0; i < addCount; i += 1) {
      const visible = player.handVisible === true || index === ownSeat
        || addCard?.isBlackGoatYoung || addCard?.isTsathogguaSlime;
      hand.push(addCard && visible ? addCard : hiddenCard(eventId, i));
    }
    if (Number.isInteger(exactCount) && exactCount >= 0 && hand.length !== exactCount) {
      // A count-only receipt proves the size, but not which visible token moved.
      // Conceal unresolved slots until the committed safe snapshot replaces them.
      hand = Array.from({ length: exactCount }, (_, i) => hiddenCard(eventId, i));
    }
    return { ...player, hand, handCount: hand.length,
      publicTokens: hand.filter(card => card.isBlackGoatYoung || card.isTsathogguaSlime) };
  });
}

function commitTransfer(step, before, after, { discardBefore, discardAfter, atMs = 360 } = {}) {
  return { ...step, visualSetupTiming: 'stepStart',
    visualSetupPatch: { players: before, ...(discardBefore ? { discard: discardBefore } : {}) },
    visualTimeline: [{ atMs, patch: { players: after, ...(discardAfter ? { discard: discardAfter } : {}) } }] };
}

function receivedHand(event, seat, incoming, count, ownSeat, toDisplaySeat) {
  const visible = ownSeat !== null && seat === ownSeat && toDisplaySeat(event.receivedSeat) === ownSeat
    && Array.isArray(event.receivedCards) ? event.receivedCards : null;
  return Array.from({ length: count }, (_, index) => visible?.[index]
    || (incoming?.[index]?.isBlackGoatYoung || incoming?.[index]?.isTsathogguaSlime ? incoming[index] : hiddenCard(`${event.id}:${seat}`, index)));
}

function continuitySteps(queue) {
  return queue.flatMap(step => {
    if (step.type !== 'TSG_SLIME_POP' || !step.statPresentation) return [step];
    const { target, from, to } = step.statPresentation;
    return ['hp', 'san'].filter(field => from[field] !== to[field]).map(field => {
      const gain = to[field] > from[field], resource = field.toUpperCase();
      return { type: `${resource}_${gain ? 'HEAL' : 'DAMAGE'}`, statEvents: [{ id: `${step.visualEventId}:${field}`,
        type: `${resource}_${gain ? 'GAIN' : 'LOSS'}`, target, from, to }] };
    });
  });
}

const AREA_EFFECTS = {
  undergroundSpring: ['UNDERGROUND_SPRING', '地下泉'],
  startledBats: ['STARTLED_BATS', '惊飞的蝙蝠'],
  nightWind: ['NIGHT_WIND', '夜风'],
  volcano: ['VOLCANO', '火山'],
  geomagneticReversal: ['GEOMAGNETIC_REVERSAL', '地磁反转'],
  etherealizeGain: ['ETHEREALIZE_GAIN', '虚化'],
  snakeTrap: ['SNAKE_TRAP', '蛇陷阱'],
};

// This adapter only consumes the already-redacted protocol. It never inspects
// authoritative rule state or derives a missing event from a player snapshot.
export function createAuthorityAnimationTransaction(events, model, previousState) {
  const players = model.gs.players;
  let presentationPlayers = previousState?.players || players;
  let presentationDiscard = previousState?.discard || model.gs.discard || [];
  const ownSeat = model.me?.id ?? null;
  const hand = (seat, changes) => {
    presentationPlayers = updateHand(presentationPlayers, seat, { ownSeat, ...changes });
  };
  const queue = [];
  const eventIds = [];
  for (const event of events) {
    if (!event?.id) continue;
    const seat = model.toDisplaySeat(event.seat);
    const name = nameAt(players, seat);
    let steps = [], message = '';
    if (event.type === 'statChanged' && STAT_KINDS.has(event.kind)) {
      if (!Number.isInteger(seat) || !players[seat]) throw new TypeError('Invalid public stat target');
      if (event.kind !== 'PLAYER_DEFEATED') {
        const resources = event.kind.startsWith('HP_SAN') ? ['Hp', 'San'] : [event.kind.startsWith('HP') ? 'Hp' : 'San'];
        if (resources.some(resource => !Number.isFinite(event[`from${resource}`]) || !Number.isFinite(event[resource.toLowerCase()]))) {
          throw new TypeError('Public stat event is missing its explicit from/to values');
        }
      }
      const stat = { id: event.id, type: event.kind, target: seat, cause: event.cause,
        from: { hp: event.fromHp, san: event.fromSan }, to: { hp: event.hp, san: event.san } };
      if (event.kind === 'PLAYER_DEFEATED') {
        stat.playersBefore = presentationPlayers;
        presentationPlayers = presentationPlayers.map((player, index) => index === seat
          ? { ...player, isDead: true,
            ...(typeof event.revealedRole === 'string' ? { role: event.revealedRole, roleKnown: true, roleRevealed: true } : {}),
            ...(!event.cardSettlementPending ? { hand: [], handCount: 0, publicTokens: [] } : {}) } : player);
        stat.playersAfter = presentationPlayers;
        stat.to.isDead = true;
        message = `${name} 倒下了`;
      } else {
        const changes = [['HP', event.fromHp, event.hp], ['SAN', event.fromSan, event.san]]
          .filter(([resource, from, to]) => event.kind.includes(resource) && Number.isFinite(from) && Number.isFinite(to) && from !== to)
          .map(([resource, from, to]) => `${resource} ${from} → ${to}`);
        message = `${name}：${changes.join('，')}`;
      }
      steps = statEventsToAnimQueue([stat], players, [message]);
    } else if (event.type === 'playerRestChanged' && typeof event.isResting === 'boolean' && players[seat]) {
      const before = presentationPlayers;
      presentationPlayers = presentationPlayers.map((player, index) => index === seat ? { ...player, isResting: event.isResting } : player);
      steps = [commitTransfer({ type: 'TURN_BOUNDARY_PAUSE', durationMs: 0 }, before, presentationPlayers, { atMs: 0 })];
    } else if (event.type === 'buriedToDeck' && event.destination === 'deckBottom' && players[seat]) {
      const before = presentationPlayers;
      const cards = (event.cards || []).map((card, index) => card?._back ? hiddenCard(event.id, index) : card).filter(Boolean);
      if (event.count !== 1 || cards.length !== 1) continue;
      cards.forEach((card, index) => hand(seat, { eventId: `${event.id}:${index}`, removeCard: card, removeCount: 1 }));
      hand(seat, { eventId: event.id, exactCount: event.sourceCount });
      const step = commitTransfer({ type: 'BURY_TO_DECK', fromPid: seat, card: cards[0], cards,
        count: 1, sourceAnchor: 'hand', dest: 'deckBottom' }, before, presentationPlayers, { atMs: 1150 });
      steps = [step];
    } else if (event.type === 'zhuCardHidden' && event.card && players[seat]) {
      steps = [{ type: 'ZHU_HIDE_CARD', targetPid: seat,
        card: event.card._back ? hiddenCard(event.id, 0) : event.card }];
    } else if (event.type === 'blackGoatPulse' && players[seat] && Number.isInteger(event.count) && event.count > 0) {
      steps = [{ type: 'BLACK_GOAT_PULSE', targetPid: seat, count: event.count }];
    } else if (event.type === 'turnStarted' && players[seat]) {
      message = `── ${name} 的回合开始 ──`;
      steps = [{ type: 'YOUR_TURN', name, local: seat === 0 && model.me !== null, targetPid: seat }];
    } else if (['burrowingWorm', 'apophisEclipse', 'cthulhuDream', 'endlessCorridorStarted', 'godPowerBlocked'].includes(event.type)) {
      const types = { burrowingWorm: 'BURROWING_WORM', apophisEclipse: 'APOPHIS_ECLIPSE',
        cthulhuDream: 'CTH_RLYEH_DREAM', endlessCorridorStarted: 'ENDLESS_CORRIDOR_TUNNEL', godPowerBlocked: 'GOD_POWER_BLOCKED' };
      steps = [{ type: types[event.type], ...(players[seat] ? { targetPid: seat } : {}) }];
      if (event.type === 'endlessCorridorStarted' && players[seat] && Array.isArray(event.cards)) {
        const before = presentationPlayers;
        presentationPlayers = presentationPlayers.map((player, index) => index === seat
          ? { ...player, hand: event.cards, handCount: event.cards.length, handVisible: true, revealHand: true,
            publicTokens: event.cards.filter(card => card.isBlackGoatYoung || card.isTsathogguaSlime) } : player);
        steps = [commitTransfer(steps[0], before, presentationPlayers, { atMs: 0 })];
      }
    } else if (event.type === 'etherealizeConsumed') {
      const source = model.toDisplaySeat(event.sourceSeat);
      if (!players[source] || !Number.isInteger(event.stacksAfter) || event.stacksAfter < 0) continue;
      const before = presentationPlayers;
      presentationPlayers = presentationPlayers.map((player, index) => index === source
        ? { ...player, etherealizeStacks: event.stacksAfter } : player);
      steps = [commitTransfer({ type: 'ETHEREALIZE_CONSUME', targetIdx: source }, before, presentationPlayers, { atMs: 0 })];
    } else if (event.type === 'burrowingWormTarget') {
      const sourceIdx = model.toDisplaySeat(event.sourceSeat), targetIdx = model.toDisplaySeat(event.targetSeat);
      if (!players[sourceIdx] || !players[targetIdx]) continue;
      message = `${nameAt(players, targetIdx)} 成为钻地魔虫的目标`;
      steps = [{ type: 'RANDOM_TARGET', sourceIdx, targetIdx, players: presentationPlayers, label: '钻地魔虫' }];
    } else if (event.type === 'throwStone') {
      const sourceIdx = model.toDisplaySeat(event.sourceSeat), targetIdx = model.toDisplaySeat(event.targetSeat);
      if (!players[sourceIdx] || !players[targetIdx] || !Number.isInteger(event.roll) || event.roll < 1 || event.roll > 6
        || !Number.isFinite(event.distance) || !Number.isFinite(event.damage)) continue;
      message = `${nameAt(players, sourceIdx)} 投掷石块：${event.roll} − ${event.distance} = ${event.damage} HP`;
      steps = [{ type: 'DICE_ROLL', diceMode: 'throwStone', d1: event.roll, d2: 0, rollerName: nameAt(players, sourceIdx) },
        { type: 'RANDOM_TARGET', sourceIdx, targetIdx, players: presentationPlayers, label: '投掷石块',
          roll: event.roll, distance: event.distance, damage: event.damage },
        { type: 'THROW_STONE', sourceIdx, targetIdx, damage: event.damage }];
    } else if (event.type === 'apophisTarget') {
      const sourceIdx = model.toDisplaySeat(event.sourceSeat);
      if (!players[sourceIdx] || !Number.isInteger(event.roll) || event.roll < 1 || event.roll > 6 || typeof event.changed !== 'boolean') continue;
      message = `${nameAt(players, sourceIdx)} 的目标${event.changed ? '发生偏移' : '未偏移'}`;
      steps = [{ type: 'DICE_ROLL', diceMode: 'apophisNight', d1: event.roll, d2: 0,
        rollerName: nameAt(players, sourceIdx), apophisChanged: event.changed }];
    } else if (event.type === 'godStatusChanged' && players[seat] && typeof event.godKey === 'string') {
      const before = presentationPlayers;
      presentationPlayers = presentationPlayers.map((player, index) => index === seat
        ? { ...player, godName: event.godKey, godLevel: event.godLevel,
          ...(Array.isArray(event.godZoneCards) ? { godZone: event.godZoneCards } : {}) } : player);
      steps = [commitTransfer({ type: 'GOD_HIGHLIGHT', targetPid: seat, godKey: event.godKey, godLevel: event.godLevel },
        before, presentationPlayers, { atMs: 0 })];
    } else if (event.type === 'deckReshuffled') {
      const discardBefore = presentationDiscard;
      presentationDiscard = [];
      steps = [{ type: 'DECK_RESHUFFLE' }];
      if (Number.isInteger(event.count) && event.count > 0) steps.push(commitTransfer({ type: 'CARD_TRANSFER', sourceAnchor: 'discard', dest: 'deck',
        count: event.count, faceUp: false }, presentationPlayers, presentationPlayers,
      { discardBefore, discardAfter: presentationDiscard }));
      else steps[0] = { ...steps[0], visualTimeline: [{ atMs: 0, patch: { discard: [] } }] };
    } else if (event.type === 'tsgSlimePopped' && players[seat]) {
      const cards = (event.poppedCards || []).filter(card => card.isTsathogguaSlime);
      if (!cards.length) continue;
      const before = presentationPlayers;
      cards.forEach((card, index) => hand(seat, { eventId: `${event.id}:${index}`, removeCard: card, removeCount: 1 }));
      const hasStats = ['fromHp', 'hp', 'fromSan', 'san'].some(field => event[field] !== undefined);
      if (hasStats && !['fromHp', 'hp', 'fromSan', 'san'].every(field => Number.isFinite(event[field]))) {
        throw new TypeError('Slime balance event is missing its explicit from/to values');
      }
      steps = [commitTransfer({ type: 'TSG_SLIME_POP', targetPid: seat, cards, count: cards.length,
        ...(hasStats ? { statPresentation: { target: seat, from: { hp: event.fromHp, san: event.fromSan },
          to: { hp: event.hp, san: event.san } } } : {}) }, before, presentationPlayers, { atMs: 350 })];
    } else if (event.type === 'skillStarted' && ['swap', 'hunt', 'bewitch'].includes(event.kind)) {
      const source = model.toDisplaySeat(event.sourceSeat), target = model.toDisplaySeat(event.targetSeat);
      const label = { swap: '掉包', hunt: '追捕', bewitch: '蛊惑' }[event.kind];
      message = `${nameAt(players, source)}对 ${nameAt(players, target)} 【${label}】`;
      steps = [{ type: { swap: 'SKILL_SWAP', hunt: 'SKILL_HUNT', bewitch: 'SKILL_BEWITCH' }[event.kind], targetIdx: target }];
    } else if (event.type === 'damageLinkEstablished') {
      const source = model.toDisplaySeat(event.sourceSeat), target = model.toDisplaySeat(event.targetSeat);
      message = `${nameAt(players, source)} 与 ${nameAt(players, target)} 建立伤害联结`;
      const before = presentationPlayers;
      presentationPlayers = presentationPlayers.map((player, index) => index === source || index === target
        ? { ...player, damageLinks: [...(player.damageLinks || []),
          { id: event.linkId || `public-link:${event.id}`, partner: index === source ? target : source, active: true }] } : player);
      steps = [commitTransfer({ type: 'CARD_TRANSFER', effect: 'damageLink', fromPid: source, toPid: target, durationMs: 1900 },
        before, presentationPlayers, { atMs: 1900 })];
    } else if (['damageLinkBroken', 'damageLinkExpired'].includes(event.type) && event.pair?.length === 2) {
      const [a, b] = event.pair.map(model.toDisplaySeat);
      if (a === null || b === null || a === b) continue;
      message = `${nameAt(players, a)} 与 ${nameAt(players, b)} 的伤害联结断裂`;
      presentationPlayers = presentationPlayers.map((player, index) => index === a || index === b
        ? { ...player, damageLinks: (player.damageLinks || []).filter(link => event.linkId
          ? link.id !== event.linkId : link.partner !== (index === a ? b : a)) } : player);
      if (event.type === 'damageLinkExpired') message = `${nameAt(players, a)} 与 ${nameAt(players, b)} 的伤害链接到期结束`;
      steps = [{ type: 'TURN_BOUNDARY_PAUSE', durationMs: event.type === 'damageLinkExpired' ? 720 : 560,
        damageLinkBreak: { a, b, mode: event.type === 'damageLinkExpired' ? 'fade' : 'break' },
        visualSetupPatch: { players: presentationPlayers } }];
    } else if (event.type === 'deathCardsRemoved' && players[seat]) {
      const cards = (event.discardedCards || []).filter(Boolean);
      const before = presentationPlayers, discardBefore = presentationDiscard;
      const destroyedCount = Number.isInteger(event.destroyedCount) && event.destroyedCount > 0 ? event.destroyedCount : 0;
      for (const card of cards) {
        const inGodZone = presentationPlayers[seat].godZone?.some(item => item.id === card.id);
        if (inGodZone) presentationPlayers = presentationPlayers.map((player, index) => index === seat
          ? { ...player, godZone: player.godZone.filter(item => item.id !== card.id) } : player);
        else hand(seat, { eventId: event.id, removeCard: card, removeCount: 1 });
      }
      presentationDiscard = [...presentationDiscard, ...cards];
      const afterPublicDiscard = presentationPlayers;
      presentationPlayers = presentationPlayers.map((player, index) => index === seat
        ? { ...player, hand: [], handCount: 0, publicTokens: [], godZone: [] } : player);
      if (cards.length) steps.push(commitTransfer({ type: 'DISCARD', targetPid: seat, sourceAnchor: 'hand',
        cards, card: cards[0], count: cards.length, destination: 'discard' }, before,
      destroyedCount ? afterPublicDiscard : presentationPlayers, { discardBefore, discardAfter: presentationDiscard }));
      if (destroyedCount) {
        const hidden = Array.from({ length: destroyedCount }, (_, index) => hiddenCard(event.id, index));
        steps.push(commitTransfer({ type: 'DISCARD', targetPid: seat, sourceAnchor: 'hand', destination: 'destroyed',
          cards: hidden, count: destroyedCount }, cards.length ? afterPublicDiscard : before, presentationPlayers));
      }
      if (!steps.length) steps = [commitTransfer({ type: 'TURN_BOUNDARY_PAUSE', durationMs: 0 }, before, presentationPlayers, { atMs: 0 })];
      message = `${name} 的死亡牌结算完成`;
    } else if (event.type === 'inspectionRevealed' && event.inspectionCard && players[seat]) {
      message = `${name} 检定：${event.inspectionCard.name || '检定牌'}`;
      steps = [{ type: 'DRAW_CARD', card: event.inspectionCard, targetPid: seat, triggerName: name,
        sourcePile: 'inspection', inspectionSeq: event.id, disableDrawBackgroundCamera: true }];
      if (Number.isInteger(event.hiddenDrawCount) && event.hiddenDrawCount > 0) {
        const before = presentationPlayers;
        hand(seat, { eventId: event.id, addCount: event.hiddenDrawCount });
        steps.push(commitTransfer({ type: 'CARD_TRANSFER', sourceAnchor: 'deck', toPid: seat, dest: 'player',
          count: event.hiddenDrawCount, faceUp: false }, before, presentationPlayers));
      }
      for (const [index, item] of (event.discards || []).entries()) {
        const target = model.toDisplaySeat(item.seat);
        if (!players[target] || !item.card || !['discard', 'destroyed'].includes(item.destination)) continue;
        const before = presentationPlayers, discardBefore = presentationDiscard;
        hand(target, { eventId: `${event.id}:discard:${index}`, removeCard: item.card, removeCount: 1 });
        if (item.destination === 'discard') presentationDiscard = [...presentationDiscard, item.card];
        steps.push(commitTransfer({ type: 'DISCARD', targetPid: target, sourceAnchor: 'hand',
          card: item.card, cards: [item.card], count: 1, destination: item.destination }, before, presentationPlayers,
        { discardBefore, discardAfter: presentationDiscard }));
      }
    } else if (event.type === 'cardsDiscarded' && ['earthquake', 'forcedRandomDiscard', 'handLimit', 'torch'].includes(event.kind)) {
      const beforePlayers = presentationPlayers, beforeDiscard = presentationDiscard;
      const discardEvents = [];
      for (const [index, item] of (event.discards || []).entries()) {
        const target = model.toDisplaySeat(item.seat);
        if (!players[target] || !item.card || !['discard', 'destroyed'].includes(item.destination)) continue;
        const before = presentationPlayers, discardBefore = presentationDiscard;
        hand(target, { eventId: `${event.id}:${index}`, removeCard: item.card, removeCount: 1 });
        if (item.destination === 'discard') presentationDiscard = [...presentationDiscard, item.card];
        discardEvents.push({ playerIndex: target, card: item.card, destination: item.destination,
          afterPlayers: presentationPlayers, afterDiscard: presentationDiscard });
        if (event.kind !== 'earthquake') steps.push(commitTransfer({ type: 'DISCARD', targetPid: target,
          sourceAnchor: 'hand', card: item.card, cards: [item.card], count: 1, destination: item.destination },
        before, presentationPlayers, { discardBefore, discardAfter: presentationDiscard }));
      }
      message = event.kind === 'earthquake' ? '地动山摇' : event.kind === 'handLimit' ? '手牌上限弃牌'
        : event.kind === 'torch' ? '点燃火炬 · 弃牌' : '随机弃牌';
      if (event.kind === 'earthquake') steps = [buildEarthquakeAnimStep({ beforePlayers, beforeDiscard, discardEvents })];
    } else if (event.type === 'areaEffectStarted' && AREA_EFFECTS[event.kind]) {
      const [type, label] = AREA_EFFECTS[event.kind];
      message = `${name}：${label}`;
      steps = [{ type }];
      if (event.kind === 'geomagneticReversal' && event.restoreCard && players[seat]) {
        steps.push({ type: 'GEOMAGNETIC_RESTORE_SHUFFLE', actorIdx: seat, restoreCard: event.restoreCard });
      } else if (event.kind === 'etherealizeGain') {
        if (!players[seat] || !Number.isInteger(event.stackCount) || event.stackCount < 1) continue;
        steps[0] = { type, actorIdx: seat, stackCount: event.stackCount };
      } else if (event.kind === 'snakeTrap') {
        if (!Number.isInteger(event.rayCount) || event.rayCount < 1) continue;
        const assignmentList = (event.assignments || []).map(item => ({ idx: model.toDisplaySeat(item.seat), count: item.count }))
          .filter(item => players[item.idx] && Number.isInteger(item.count) && item.count > 0)
          .map(item => ({ ...item, name: nameAt(players, item.idx) }));
        const assignmentHits = (event.hits || []).map(model.toDisplaySeat).filter(index => players[index])
          .map(idx => ({ idx, name: nameAt(players, idx) }));
        const totalLayers = assignmentList.reduce((total, item) => total + item.count, 0);
        steps[0] = { type, assignmentList, assignmentHits,
          rayAngles: Array.from({ length: event.rayCount }, (_, index) => index * 360 / event.rayCount),
          durationMs: Math.max(3200, 1900 + totalLayers * 340) };
      }
    } else if (event.type === 'immortalRevealed' && event.cards?.length && players[seat]) {
      message = `${name} 的不死检定${event.succeeded ? '成功' : '失败'}`;
      steps = [{ type: 'VRI_IMMORTAL_REVEAL', targetPid: seat, cards: event.cards,
        succeeded: event.succeeded === true, success: event.succeeded === true }];
    } else if (event.type === 'swapTakeCommitted' && event.card && typeof event.blind === 'boolean') {
      const source = model.toDisplaySeat(event.sourceSeat), target = model.toDisplaySeat(event.targetSeat);
      if (ownSeat === null || source !== ownSeat || !players[source] || !players[target]
        || ![event.sourceCount, event.targetCount].every(count => Number.isInteger(count) && count >= 0)) continue;
      const before = presentationPlayers;
      hand(target, { eventId: `${event.id}:target`, removeCard: event.card, removeCount: 1, exactCount: event.targetCount });
      hand(source, { eventId: `${event.id}:source`, addCard: event.card, addCount: 1, exactCount: event.sourceCount });
      const flightCard = event.blind ? hiddenCard(event.id, 'take') : event.card;
      message = `${nameAt(players, source)} 取得一张掉包手牌`;
      steps = [commitTransfer({ type: 'CARD_TRANSFER', fromPid: target, toPid: source, sourceAnchor: 'hand',
        dest: 'player', cards: [flightCard], count: 1, faceUp: !event.blind, durationMs: 700, flightDurationMs: 700 },
      before, presentationPlayers, { atMs: 700 })];
    } else if (event.type === 'swapCommitted') {
      const source = model.toDisplaySeat(event.sourceSeat), target = model.toDisplaySeat(event.targetSeat);
      message = `${nameAt(players, source)} 与 ${nameAt(players, target)} 完成掉包`;
      const before = presentationPlayers;
      hand(source, { eventId: `${event.id}:source`, removeCard: event.givenCard, removeCount: event.count,
        ...(!event.takeAlreadyPresented ? { addCard: event.takenCard, addCount: event.count } : {}), exactCount: event.sourceCount });
      hand(target, { eventId: `${event.id}:target`, addCard: event.givenCard, addCount: event.count,
        ...(!event.takeAlreadyPresented ? { removeCard: event.takenCard, removeCount: event.count } : {}), exactCount: event.targetCount });
      const transfers = [{ fromPid: source, toPid: target, dest: 'player', count: event.count,
        faceUp: !!event.givenCard, ...(event.givenCard ? { cards: [event.givenCard] } : {}) }];
      if (!event.takeAlreadyPresented) transfers.push({ fromPid: target, toPid: source, dest: 'player', count: event.count,
        faceUp: !!event.takenCard, ...(event.takenCard ? { cards: [event.takenCard] } : {}) });
      steps = [commitTransfer(transfers.length ? { type: 'CARD_TRANSFER', transfers }
        : { type: 'TURN_BOUNDARY_PAUSE', durationMs: 0 }, before, presentationPlayers,
      { atMs: transfers.length ? 360 : 0 })];
    } else if (event.type === 'publicCardsDiscarded' && event.source === 'godZone' && players[seat]) {
      const cards = (event.cards || []).filter(Boolean);
      if (!cards.length) continue;
      const before = presentationPlayers, discardBefore = presentationDiscard;
      const ids = new Set(cards.map(card => card.id));
      presentationPlayers = presentationPlayers.map((player, index) => index === seat
        ? { ...player, godZone: (player.godZone || []).filter(card => !ids.has(card.id)) } : player);
      presentationDiscard = [...presentationDiscard, ...cards];
      steps = [commitTransfer({ type: 'CARD_TRANSFER', sourceAnchor: 'godPower', fromPid: seat,
        dest: 'discard', cards, count: cards.length, faceUp: true }, before, presentationPlayers,
      { discardBefore, discardAfter: presentationDiscard })];
    } else if (event.type === 'bewitchGiven' && event.card) {
      const source = model.toDisplaySeat(event.sourceSeat), target = model.toDisplaySeat(event.targetSeat);
      message = `${nameAt(players, source)} 将 ${event.card.name || '公开牌'} 蛊惑给 ${nameAt(players, target)}`;
      const before = presentationPlayers;
      hand(source, { eventId: event.id, removeCard: event.card, removeCount: 1 });
      steps = [{ type: 'SKILL_BEWITCH', targetIdx: target },
        commitTransfer({ type: 'CARD_TRANSFER', fromPid: source, toPid: target, dest: 'reveal', count: 1,
          cards: [event.card], faceUp: true }, before, presentationPlayers),
        { type: 'DRAW_CARD', card: event.card, targetPid: target, triggerName: nameAt(players, target), skipTravel: true,
          disableDrawBackgroundCamera: true }];
    } else if (event.type === 'huntAttack' && event.card) {
      const source = model.toDisplaySeat(event.sourceSeat);
      message = `${nameAt(players, source)} 弃出 ${event.card.name || '公开牌'} 发起追捕攻击`;
      const before = presentationPlayers, discardBefore = presentationDiscard;
      hand(source, { eventId: event.id, removeCard: event.card, removeCount: 1 });
      presentationDiscard = [...presentationDiscard, event.card];
      steps = [commitTransfer({ type: 'DISCARD', card: event.card, cards: [event.card], count: 1,
        targetPid: source, sourceAnchor: 'hand', triggerName: nameAt(players, source) }, before, presentationPlayers,
      { discardBefore, discardAfter: presentationDiscard })];
    } else if (event.type === 'huntResolved') {
      const source = model.toDisplaySeat(event.sourceSeat), target = model.toDisplaySeat(event.targetSeat);
      message = event.outcome === 'abandoned' ? `${nameAt(players, source)} 放弃追捕`
        : event.outcome === 'defeated' ? `${nameAt(players, target)} 在追捕中败北`
          : `${nameAt(players, target)} 在追捕后存活`;
    } else if (event.type === 'huntLootTransferred' && event.count > 0) {
      const source = model.toDisplaySeat(event.sourceSeat), target = model.toDisplaySeat(event.targetSeat);
      if (!players[source] || !players[target]) continue;
      message = `${nameAt(players, target)} 获得 ${event.count} 张战利品`;
      const before = presentationPlayers;
      const cards = Array.from({ length: event.count }, (_, index) => event.cards?.[index] || hiddenCard(event.id, index));
      const received = ownSeat !== null && target === ownSeat && Array.isArray(event.receivedCards) ? event.receivedCards : cards;
      cards.forEach((card, index) => {
        const removed = source === ownSeat ? event.sentCards?.[index] || card : card;
        hand(source, { eventId: `${event.id}:source:${index}`, removeCard: removed, removeCount: 1 });
        hand(target, { eventId: `${event.id}:target:${index}`, addCard: received[index], addCount: 1 });
      });
      hand(source, { eventId: `${event.id}:source`, exactCount: event.sourceCount });
      hand(target, { eventId: `${event.id}:target`, exactCount: event.targetCount });
      steps = [commitTransfer({ type: 'CARD_TRANSFER', transfers: cards.map(card => ({ fromPid: source, toPid: target,
        dest: 'player', count: 1, cards: [card], faceUp: !card._back })) }, before, presentationPlayers)];
    } else if (event.type === 'cardRevealed' && event.card && event.reason === 'discard' && players[seat]) {
      message = `${name} 弃置 ${event.card.name || '公开牌'}`;
      const discardBefore = presentationDiscard;
      presentationDiscard = [...presentationDiscard, event.card];
      steps = [{ type: 'DISCARD', card: event.card, cards: [event.card], count: 1,
        sourceAnchor: 'reveal', triggerName: name, visualSetupTiming: 'stepStart',
        visualSetupPatch: { discard: discardBefore }, visualTimeline: [{ atMs: 360, patch: { discard: presentationDiscard } }] }];
    } else if (event.type === 'publicTokensGranted' && ['blackGoat', 'tsathogguaSlime'].includes(event.kind)) {
      const source = model.toDisplaySeat(event.sourceSeat ?? event.seat), target = model.toDisplaySeat(event.targetSeat ?? event.seat);
      const cards = (event.cards || []).filter(card => event.kind === 'blackGoat' ? card.isBlackGoatYoung : card.isTsathogguaSlime);
      if (!players[source] || !players[target] || !cards.length) continue;
      const before = presentationPlayers;
      cards.forEach((card, index) => hand(target, { eventId: `${event.id}:${index}`, addCard: card, addCount: 1 }));
      message = `${nameAt(players, target)} 获得 ${cards.length} 张${event.kind === 'blackGoat' ? '黑山羊幼崽' : '黏液'}`;
      steps = [commitTransfer({ type: 'CARD_TRANSFER', fromPid: source, toPid: target, dest: 'player',
        sourceAnchor: event.kind === 'tsathogguaSlime' ? 'playerArea' : 'godPower',
        effect: event.kind === 'blackGoat' ? 'blackGoat' : 'tsgSlime', cards, count: cards.length, faceUp: true,
        durationMs: event.kind === 'blackGoat' ? 1500 : 950 }, before, presentationPlayers)];
    } else if (event.type === 'publicCardRetrieved' && event.card && event.source === 'discard' && players[seat]) {
      const before = presentationPlayers, discardBefore = presentationDiscard;
      presentationDiscard = presentationDiscard.filter(card => card.id !== event.card.id);
      hand(seat, { eventId: event.id, addCard: event.card, addCount: 1 });
      message = `${name} 从弃牌堆取回 ${event.card.name || '牌'}`;
      steps = [commitTransfer({ type: 'CARD_TRANSFER', toPid: seat, dest: 'player', sourceAnchor: 'discard',
        effect: 'graveDig', cards: [event.card], count: 1, faceUp: true, durationMs: 1200 }, before, presentationPlayers,
      { discardBefore, discardAfter: presentationDiscard, atMs: 400 })];
    } else if (event.type === 'hiddenHandTransferred' && Number.isInteger(event.count) && event.count > 0) {
      const source = model.toDisplaySeat(event.sourceSeat), target = model.toDisplaySeat(event.targetSeat);
      if (!players[source] || !players[target] || source === target) continue;
      const before = presentationPlayers;
      const cards = receivedHand(event, target, before[source].hand, event.count, ownSeat, model.toDisplaySeat);
      hand(source, { eventId: `${event.id}:source`, removeCount: event.count, exactCount: event.sourceCount });
      cards.forEach((card, index) => hand(target, { eventId: `${event.id}:target:${index}`, addCard: card, addCount: 1 }));
      hand(target, { eventId: `${event.id}:target`, exactCount: event.targetCount });
      message = `${nameAt(players, source)} 向 ${nameAt(players, target)} 转移 ${event.count} 张手牌`;
      steps = [commitTransfer({ type: 'CARD_TRANSFER', fromPid: source, toPid: target, dest: 'player',
        cards, count: event.count, faceUp: false }, before, presentationPlayers)];
    } else if (event.type === 'handsSwapped') {
      const source = model.toDisplaySeat(event.sourceSeat), target = model.toDisplaySeat(event.targetSeat);
      if (!players[source] || !players[target] || source === target
        || ![event.sourceCount, event.targetCount].every(count => Number.isInteger(count) && count >= 0)) continue;
      const before = presentationPlayers;
      const sourceHand = receivedHand(event, source, before[target].hand, event.sourceCount, ownSeat, model.toDisplaySeat);
      const targetHand = receivedHand(event, target, before[source].hand, event.targetCount, ownSeat, model.toDisplaySeat);
      presentationPlayers = before.map((player, index) => {
        const nextHand = index === source ? sourceHand : index === target ? targetHand : null;
        return nextHand ? { ...player, hand: nextHand, handCount: nextHand.length,
          publicTokens: nextHand.filter(card => card.isBlackGoatYoung || card.isTsathogguaSlime) } : player;
      });
      const transfers = [
        { fromPid: source, toPid: target, dest: 'player', count: event.targetCount, faceUp: false },
        { fromPid: target, toPid: source, dest: 'player', count: event.sourceCount, faceUp: false },
      ].filter(transfer => transfer.count > 0);
      message = `${nameAt(players, source)} 与 ${nameAt(players, target)} 交换全部手牌`;
      steps = [commitTransfer(transfers.length ? { type: 'CARD_TRANSFER', transfers }
        : { type: 'TURN_BOUNDARY_PAUSE', durationMs: 0 }, before, presentationPlayers,
      { atMs: transfers.length ? 360 : 0 })];
    } else if (event.type === 'stoneCardsArranged' && event.keptCard && players[seat]
      && Number.isInteger(event.returnedCount) && event.returnedCount >= 0) {
      const before = presentationPlayers;
      const kept = event.keptCard._back ? hiddenCard(event.id, 'kept') : event.keptCard;
      hand(seat, { eventId: event.id, addCard: kept, addCount: 1, exactCount: event.handCount });
      const transfer = (card, dest) => ({ fromPid: seat, toPid: seat, sourceAnchor: 'reveal',
        dest, count: 1, cards: [card], faceUp: !card._back, effect: 'decipherStone' });
      // The private arrangement is only present for its owner. Other viewers
      // see the public return count without learning top/bottom distribution.
      const returns = seat === ownSeat && Array.isArray(event.topCards) && Array.isArray(event.bottomCards)
        ? [...event.topCards.map(card => transfer(card, 'deckTop')), ...event.bottomCards.map(card => transfer(card, 'deckBottom'))]
        : Array.from({ length: event.returnedCount }, (_, index) => transfer(hiddenCard(event.id, `return:${index}`), 'deck'));
      message = `${name} 完成石刻整理，收入一张牌`;
      steps = [commitTransfer({ type: 'CARD_TRANSFER', durationMs: 780,
        transfers: [transfer(kept, 'player'), ...returns] }, before, presentationPlayers, { atMs: 780 })];
    } else if (event.type === 'cardIncomeCommitted' && event.card && ['reveal', 'generated', 'hand'].includes(event.source) && players[seat]
      && ['hand', 'discard', 'zone', 'godZone'].includes(event.destination)) {
      const before = presentationPlayers, discardBefore = presentationDiscard;
      if (event.source === 'hand') hand(seat, { eventId: `${event.id}:source`, removeCard: event.card, removeCount: 1 });
      if (event.destination === 'hand') hand(seat, { eventId: event.id, addCard: event.card, addCount: 1 });
      else if (event.destination === 'discard') presentationDiscard = [...presentationDiscard, event.card];
      else {
        const field = event.destination === 'zone' ? 'zoneCards' : 'godZone';
        presentationPlayers = presentationPlayers.map((player, index) => index === seat
          ? { ...player, [field]: [...(player[field] || []), event.card] } : player);
      }
      message = `${name} 的 ${event.card.name || '牌'} ${
        { hand: '收入手牌', discard: '进入弃牌堆', zone: '进入区域', godZone: '进入邪神区' }[event.destination]}`;
      steps = [commitTransfer({ type: 'CARD_TRANSFER',
        sourceAnchor: event.source === 'reveal' ? 'reveal' : event.source === 'generated' ? 'playerArea' : 'hand',
        fromPid: seat, dest: event.destination === 'hand' ? 'player' : event.destination,
        toPid: seat, count: 1, cards: [event.card], faceUp: true },
      before, presentationPlayers, { discardBefore, discardAfter: presentationDiscard })];
    } else if (event.type === 'cardRevealed' && event.card && event.reason === 'destroyed' && players[seat]) {
      message = `${name} 的 ${event.card.name || '牌'} 消散`;
      steps = [{ type: 'DISCARD', sourceAnchor: 'reveal', destination: 'destroyed', card: event.card, cards: [event.card], count: 1 }];
    } else if (event.type === 'cardRevealed' && event.card && event.reason === 'keep' && players[seat]) {
      // keep can suspend for a further rule decision before income, so a keep
      // announcement alone does not authorize a premature flight into a hand.
      message = `${name} ${event.reason === 'keep' ? '保留' : '销毁'} ${event.card.name || '公开牌'}`;
    } else if (['cardRevealed', 'sphinxRevealed'].includes(event.type) && event.card && players[seat]) {
      message = `${name} 亮出 ${event.card.name || event.card.key || '一张牌'}`;
      steps = [{ type: event.reason === 'hunt' ? 'HUNT_REVEAL_CARD' : 'DRAW_CARD', card: event.card, triggerName: name, targetPid: seat,
        ...(['deck', 'discard'].includes(event.sourcePile) ? { sourcePile: event.sourcePile } : {}),
        ...(event.reason !== 'draw' ? { skipTravel: true, disableDrawBackgroundCamera: true } : {}) }];
    } else if (event.type === 'restRolled' && [event.d1, event.d2].every(die => Number.isInteger(die) && die >= 1 && die <= 6)) {
      message = `${name} 选择休息，掷出 ${event.d1}、${event.d2} 点`;
      steps = [{ type: 'DICE_ROLL', d1: event.d1, d2: event.d2, rollerName: name }];
    } else if (event.type === 'diceRolled' && Number.isInteger(event.roll) && event.roll >= 1 && event.roll <= 6) {
      message = `${name} 掷出 ${event.roll} 点`;
      steps = [{ type: 'DICE_ROLL', d1: event.roll, d2: 0, rollerName: name, publicOnly: true }];
    } else if (event.type === 'caveDuelRevealed' && event.sourceCard && event.targetCard) {
      const sourceIdx = model.toDisplaySeat(event.sourceSeat), targetIdx = model.toDisplaySeat(event.targetSeat);
      const winnerIdx = Number.isInteger(event.winnerSeat) ? model.toDisplaySeat(event.winnerSeat) : null;
      message = `洞穴对决：${nameAt(players, sourceIdx)} 与 ${nameAt(players, targetIdx)} 亮牌`;
      steps = [{ type: 'CAVE_DUEL', sourceIdx, targetIdx, winnerIdx, sourceCard: event.sourceCard, targetCard: event.targetCard }];
      if (players[sourceIdx] && players[targetIdx] && players[winnerIdx]
        && [event.sourceCount, event.targetCount].every(count => Number.isInteger(count) && count >= 0)) {
        const before = presentationPlayers;
        hand(sourceIdx, { eventId: `${event.id}:source`, removeCard: event.sourceCard, removeCount: 1 });
        hand(targetIdx, { eventId: `${event.id}:target`, removeCard: event.targetCard, removeCount: 1 });
        hand(winnerIdx, { eventId: `${event.id}:winner-a`, addCard: event.sourceCard, addCount: 1 });
        hand(winnerIdx, { eventId: `${event.id}:winner-b`, addCard: event.targetCard, addCount: 1 });
        hand(sourceIdx, { eventId: `${event.id}:source-count`, exactCount: event.sourceCount });
        hand(targetIdx, { eventId: `${event.id}:target-count`, exactCount: event.targetCount });
        // Original duel paths last 2.35s, with the second card delayed 40ms.
        // That overlay already owns both flights; commit only their landing.
        steps = [commitTransfer(steps[0], before, presentationPlayers, { atMs: 2390 })];
      }
    } else if (event.type === 'targetSelected') {
      const targetIdx = model.toDisplaySeat(event.targetSeat);
      message = `${name} 选择了 ${nameAt(players, targetIdx)}`;
      if (event.reason === 'albinoCreature' && players[seat] && players[targetIdx]) {
        steps = [{ type: 'RANDOM_TARGET', sourceIdx: seat, targetIdx, players: presentationPlayers, label: '白化生物' }];
      }
    } else if (event.type === 'cardCountChanged') {
      message = `${name} 的手牌数为 ${event.count}`;
    } else if (event.type === 'cardsMoved') {
      message = `${nameAt(players, model.toDisplaySeat(event.fromSeat))} 向 ${nameAt(players, model.toDisplaySeat(event.toSeat))} 转移了 ${event.count} 张牌`;
    }
    // A count-only event has no card face or route to animate. Its public log
    // still has an owned queue step; it is never treated as a hidden-card reveal.
    if (!steps.length && message) steps = [{ type: 'TURN_BOUNDARY_PAUSE', durationMs: 0 }];
    if (!steps.length) continue;
    const logEntries = createVisualLogEntries(event.id, message ? [message] : []);
    queue.push(...steps.map(step => ({ ...step, msgs: step.msgs || (message ? [message] : []), visualEventId: event.id, logEntries })));
    eventIds.push(event.id);
  }
  const continuityIssues = validateStatAnimationContinuity(continuitySteps(queue));
  if (continuityIssues.length) throw new TypeError('Discontinuous public HP/SAN event sequence');
  return createQueueAnimationTransaction({ queue, nextState: model.gs, eventIds,
    preserveQueueOrder: true, context: 'authority:public-events' });
}

function visibilitySignature(view) {
  return JSON.stringify([view.viewerSeat, view.players.map(player => [player.role, player.hand]),
    view.peeks, view.privateReveals, view.litDeck]);
}

function losesPrivateVisibility(before, after) {
  return before.players.some((player, index) => {
    const next = after.players[index];
    return !next || Array.isArray(player.hand) && !Array.isArray(next.hand)
      || typeof player.role === 'string' && typeof next.role !== 'string';
  });
}

// Received ids reserve a place in the buffer; only useAnimationQueue marks ids
// consumed after commit. A reconnect restoration never replays old history.
export function createAuthorityEventBuffer(initialView) {
  let last = initialView;
  let visibility = visibilitySignature(initialView);
  let received = new Set((initialView.events || []).map(event => event.id));
  return {
    receive(view) {
      if (view === last || view.matchId === last.matchId && view.revision < last.revision) return null;
      const signature = visibilitySignature(view);
      const restore = view.matchId !== last.matchId || view.viewerSeat !== last.viewerSeat
        || losesPrivateVisibility(last, view)
        || view.revision === last.revision && signature !== visibility;
      // A newer decision normally expires peek/stone/ZHU grants. Their UI
      // reads the latest view; expiration must not discard this revision's
      // independent, explicitly projected damage and movement receipts.
      const events = restore ? [] : (view.events || []).filter(event => event.id && !received.has(event.id));
      // The server retains a rolling event window. Older revisions cannot
      // reserve or replay a dropped id, so keep only the current window here.
      received = new Set((view.events || []).map(event => event.id).filter(Boolean));
      const changed = restore || view.revision !== last.revision || events.length > 0;
      last = view;
      visibility = signature;
      return changed ? { restore, events } : null;
    },
  };
}
