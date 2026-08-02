const TURN_START_RE = /^── (.+?) 的回合开始 ──$/;

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
      .replace(/^你(?=（|\s+(?:遭遇|信仰|放弃|摸到|选择|借用|收入|暗抽)|遭遇|信仰|放弃|摸到|选择|借用|收入|暗抽|$)/, turnOwner)
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
