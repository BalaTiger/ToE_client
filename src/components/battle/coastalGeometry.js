import { CARD_FACE_RATIO } from '../cards/CardFaceAssets';

export const COASTAL_HAND_HOVER = 22;
export const COASTAL_HAND_SELECTED_LIFT = 5;
export const COASTAL_PILE_CLEARANCE = 20;

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

export function getCoastalGeometry({ width = 1200, height = 620, handCount = 5, rolesBottom = 190, controlsHeight = 0, controlsBottom = 24 } = {}) {
  const handLeft = width * .15;
  const actionsWidth = width * .19;
  const rightInset = width * .04;
  const actionsLeft = width - rightInset - actionsWidth;
  const handRight = actionsLeft - 16;
  const availableWidth = handRight - handLeft;
  const bottomInset = 18;
  const pileTopLimit = rolesBottom + 18;
  const separation = COASTAL_HAND_HOVER + COASTAL_HAND_SELECTED_LIFT + COASTAL_PILE_CLEARANCE;
  const logTop = 164;
  // Extra-tall role content may extend the board instead of covering live cards.
  const boardHeight = Math.max(height, pileTopLimit + 108 + separation + 185 + bottomInset,
    logTop + 100 + 12 + controlsHeight + controlsBottom + bottomInset);
  const verticalRoom = boardHeight - bottomInset - pileTopLimit - separation;
  const reservedPileHeight = Math.min(170, Math.max(108, verticalRoom * .34));
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
  const handBottom = boardHeight - bottomInset;
  const handTop = handBottom - handHeight;
  const pileBottomLimit = handTop - separation;
  const pileHeight = Math.min(170, pileBottomLimit - pileTopLimit);
  const pileTop = pileTopLimit + (pileBottomLimit - pileTopLimit - pileHeight) / 2;
  const controlsTop = boardHeight - bottomInset - controlsBottom - controlsHeight;
  return {
    width, height: boardHeight, rolesBottom,
    hand: { ...fan, height: handHeight, left: handLeft, right: handRight, top: handTop, bottom: handBottom,
      paddingTop: handCount ? -fan.minY : 0, paddingBottom: handCount ? fan.maxY - fan.cardHeight : 0,
      countLeft: handRight - Math.max(fan.width, 150) - 40 },
    actions: { left: actionsLeft, width: actionsWidth, rightInset, gap: 16, top: controlsTop },
    log: { top: logTop, height: Math.min(175, controlsTop - logTop - 12) },
    piles: { left: width * .27, top: pileTop, width: handRight - width * .27, height: pileHeight },
    bottomInset,
  };
}
