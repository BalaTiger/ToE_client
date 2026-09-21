import { cardLogText } from './coreUtils';

const TURN_START_RE = /^── (.+?) 的回合开始 ──$/;

const SWAP_TAKEN_PLACEHOLDER_PREFIX = '拿走 暗抽牌，还给';

function replaceAllLiteral(text, search, replacement) {
  if (!search || search === replacement) return text;
  return text.split(search).join(replacement);
}

/**
 * Convert canonical, actor-relative battle logs to one player's point of view.
 *
 * Game actions are authored with a leading “你” for the acting seat. In a
 * multiplayer replay that state is shared with every client, so “你” must first
 * be resolved to the owner of that turn. The local player's real name is then
 * rendered as “你” everywhere (actor, target and turn heading alike).
 */
export function normalizeLogLineForViewer(line, { isMultiplayer, turnOwner, myName } = {}) {
  if (!isMultiplayer || typeof line !== 'string') return line;

  let display = line;
  if (turnOwner && turnOwner !== myName) {
    // Only actor-relative forms are rewritten. Viewer-relative lines such as
    // “你的手牌…被暗抽” describe the local target even during another seat's
    // turn and must remain “你”.
    display = display
      .replace(/^你(?=（|\s+(?:从手牌|遭遇|信仰|放弃|摸到|选择|借用|收入|暗抽)|从手牌|遭遇|信仰|放弃|摸到|选择|借用|收入|暗抽|$)/, turnOwner)
      .replace(/^你的邪神之力/, `${turnOwner}的邪神之力`);
  }
  if (myName && myName !== '你') display = replaceAllLiteral(display, myName, '你');
  return display;
}

export function normalizeLogForViewer(log, { isMultiplayer, myName } = {}) {
  const lines = Array.isArray(log) ? log : [];
  let turnOwner = null;
  return lines.map(line => {
    const turnMatch = typeof line === 'string' ? line.match(TURN_START_RE) : null;
    if (turnMatch) turnOwner = turnMatch[1] === '你' ? myName : turnMatch[1];
    return normalizeLogLineForViewer(line, { isMultiplayer, turnOwner, myName });
  });
}

/**
 * The swap initiator is the only viewer allowed to see which blind-drawn card
 * they took. Canonical logs keep the 暗抽牌 placeholder for everyone; the
 * initiator's own view swaps in the real card text.
 */
export function revealSwapTakenCardLine(line, takenCard) {
  if (typeof line !== 'string' || !takenCard || !line.startsWith(SWAP_TAKEN_PLACEHOLDER_PREFIX)) return line;
  return `拿走 ${cardLogText(takenCard, { alwaysShowName: true })}，还给${line.slice(SWAP_TAKEN_PLACEHOLDER_PREFIX.length)}`;
}

/**
 * Reveal taken blind-draw cards in every “拿走 暗抽牌，还给 …” line that the
 * local viewer authored as swap source (rotated seat 0). Lines from remote
 * swaps keep the placeholder. Lines are paired to swap events by their exact
 * authored text so remote and local swaps can interleave in one log.
 */
export function revealLocalSwapTakenCards(log, state) {
  const lines = Array.isArray(log) ? log : [];
  const events = (Array.isArray(state?._visualEvents) ? state._visualEvents : [])
    .filter(event => event?.type === 'swapCards' && event.takenCard && event.givenCard);
  if (!events.length) return lines;
  const result = [...lines];
  const used = new Set();
  events.forEach(event => {
    const targetName = state?.players?.[event.targetIdx]?.name;
    if (!targetName) return;
    const placeholder = `${SWAP_TAKEN_PLACEHOLDER_PREFIX} ${targetName} ${cardLogText(event.givenCard, { alwaysShowName: true })}`;
    const index = result.findIndex((line, i) => !used.has(i) && line === placeholder);
    if (index < 0) return;
    used.add(index);
    if (event.sourceIdx === 0) result[index] = revealSwapTakenCardLine(result[index], event.takenCard);
  });
  return result;
}
