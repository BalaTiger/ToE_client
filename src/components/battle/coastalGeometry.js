import { CARD_FACE_RATIO } from '../cards/CardFaceAssets';

export const COASTAL_HAND_HOVER = 22;
export const COASTAL_HAND_SELECTED_LIFT = 5;
export const COASTAL_PILE_CLEARANCE = 4;
export const COASTAL_PILE_DEPTH_RATIO = .68;
// Compact piles reserve only the real stack offsets and discard hit-area.
export const COASTAL_PILE_EXTRA_HEIGHT = 28;

// Header artwork and viewport-fixed controls use the same unscaled coordinates.
export const COASTAL_CORNER = {
  width: 292, top: -3, right: -22,
  controlsTop: 14, controlsRight: 32, controlSize: 54, controlGap: 8,
  logTop: 92, logRight: -12, logWidth: 224, logRatio: 975 / 1407,
};

// Bounds include the rotated corners, not just the untransformed card boxes.
function handFan(cardWidth, count) {
  const cardHeight = cardWidth * CARD_FACE_RATIO;
  const step = cardWidth * .8;
  const halfSpan = Math.max(0, count - 1) * step / 2;
  const radius = Math.max(900, halfSpan * halfSpan / 64);
  const lift = halfSpan * halfSpan / (2 * radius);
  let minY = 0, maxY = cardHeight;
  for (let index = 0; index < count; index++) {
    const x = (index - (count - 1) / 2) * step;
    const angle = Math.atan(x / radius);
    const y = -lift + x * x / (2 * radius);
    const cornerRise = Math.abs(Math.sin(angle)) * cardWidth / 2;
    minY = Math.min(minY, y - cornerRise);
    maxY = Math.max(maxY, y + Math.cos(angle) * cardHeight + cornerRise);
  }
  return { cardWidth, cardHeight, step, radius, lift, minY, maxY, height: maxY - minY, width: count ? cardWidth + Math.max(0, count - 1) * step : 0 };
}

export function getCoastalGeometry({ width = 1200, height = 620, handCount = 5, rolesBottom = 190, centerX = null, controlsHeight = 0, controlsBottom = 24, effectsHeight = 0 } = {}) {
  const handLeft = width * .15;
  const actionsWidth = width * .19;
  const rightInset = width * .04;
  const actionsLeft = width - rightInset - actionsWidth;
  const handRight = actionsLeft - 16;
  const availableWidth = handRight - handLeft;
  const bottomInset = 18;
  const effectsTop = rolesBottom + 12;
  // Persistent effects now share the central axis above the piles. Their old
  // left column is occupied by the torch, whose light must never cover text.
  const pileTopLimit = rolesBottom + 18;
  // Preserve card sizing; positioning uses the tighter clearance below.
  const separation = COASTAL_HAND_HOVER + COASTAL_HAND_SELECTED_LIFT + 20;
  const handOffsetY = bottomInset + 16;
  const logTop = COASTAL_CORNER.logTop;
  // Extra-tall role content may extend the board instead of covering live cards.
  const boardHeight = Math.max(height, pileTopLimit + Math.max(108, effectsHeight) + separation + 185 + bottomInset,
    logTop + 160 + 4 + controlsHeight + controlsBottom + bottomInset);
  const verticalRoom = boardHeight - bottomInset - pileTopLimit - separation;
  const reservedPileHeight = Math.max(effectsHeight, Math.min(170, Math.max(108, verticalRoom * .34)));
  const handBudget = verticalRoom - reservedPileHeight;
  let low = 0;
  let high = Math.min(200, availableWidth / (1 + Math.max(0, handCount - 1) * .8));
  // Fan rotation makes its height nonlinear; a bounded fit avoids resize feedback.
  for (let iteration = 0; iteration < 20; iteration++) {
    const candidate = (low + high) / 2;
    if (handFan(candidate, handCount).height <= handBudget) low = candidate;
    else high = candidate;
  }
  const fan = handFan(low, handCount);
  const handHeight = handCount ? fan.height : 110;
  const handBottom = boardHeight - bottomInset + handOffsetY;
  const handTop = handBottom - handHeight;
  const pileBottomLimit = handTop - handOffsetY - separation;
  const pileWidth = handRight - width * .27;
  const pileLeft = Number.isFinite(centerX) ? centerX - pileWidth / 2 : width * .27;
  const pileCardWidth = Math.floor(Math.min(
    fan.cardWidth * COASTAL_PILE_DEPTH_RATIO,
    (pileBottomLimit - pileTopLimit - COASTAL_PILE_EXTRA_HEIGHT) / CARD_FACE_RATIO,
    (pileWidth - 90) / 3,
  ));
  // The 45-degree table occupies less screen height than an upright card.
  // Reserve a little beyond its projected height for perspective and loose discards.
  const pileHeight = Math.max(108, pileCardWidth * CARD_FACE_RATIO * .75 + COASTAL_PILE_EXTRA_HEIGHT);
  // Anchor the shared pile plane toward the hand, keeping its hover clearance.
  const pileTop = handTop - COASTAL_HAND_HOVER - COASTAL_HAND_SELECTED_LIFT - COASTAL_PILE_CLEARANCE - pileHeight;
  const controlsTop = boardHeight - bottomInset - controlsBottom - controlsHeight;
  // Keep the complete book at its native ratio behind the foreground. Extra
  // actions shorten only the writing area, never the paper or its round clasps.
  const bookHeight = COASTAL_CORNER.logWidth / COASTAL_CORNER.logRatio;
  const logHeight = Math.min(bookHeight, controlsTop - logTop - 4);
  return {
    width, height: boardHeight, rolesBottom,
    hand: { ...fan, height: handHeight, left: handLeft, right: handRight, top: handTop, bottom: handBottom, offsetY: handOffsetY,
      paddingTop: handCount ? -fan.minY : 0, paddingBottom: handCount ? fan.maxY - fan.cardHeight : 0,
      countLeft: handRight - Math.max(fan.width, 150) - 40 },
    actions: { left: actionsLeft, width: actionsWidth, rightInset, gap: 16, top: controlsTop },
    log: { top: logTop, right: COASTAL_CORNER.logRight, width: COASTAL_CORNER.logWidth, height: logHeight, bookHeight },
    piles: { left: pileLeft, top: pileTop, width: pileWidth, height: pileHeight, cardWidth: pileCardWidth, centerX: pileLeft + pileWidth / 2 },
    effects: { left: pileLeft, width: pileWidth, top: effectsTop, height: effectsHeight },
    bottomInset,
  };
}
