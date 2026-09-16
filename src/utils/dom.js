import { CARD_FACE_RATIO } from '../components/cards/CardFaceAssets';
import { projectTableCard } from './cardPlane';

const zoomRectCompensation = new WeakMap();
function needsZoomRectCompensation(zc, scale){
  const cached = zoomRectCompensation.get(zc);
  if(cached?.scale === scale)return cached.needed;
  const test=document.createElement('div');
  test.style.cssText='position:absolute;left:0;top:0;width:100px;height:1px;visibility:hidden;pointer-events:none;';
  zc.appendChild(test);
  const width=test.getBoundingClientRect().width;
  zc.removeChild(test);
  const needed = Math.abs(width-100)<1 && Math.abs(width-100*scale)>1;
  zoomRectCompensation.set(zc, { scale, needed });
  return needed;
}
export function _getZoomCompensatedRect(el){
  if(!el)return null;
  const rect=el.getBoundingClientRect();
  const zc=el.closest?.('[data-zoom-container]');
  if(!zc)return rect;
  const s=Number(zc.dataset?.boardZoom) || Number(getComputedStyle(zc).zoom) || 1;
  if(s===1)return rect;
  if(!needsZoomRectCompensation(zc,s))return rect;
  // Legacy engines omit CSS zoom from descendant rects. Preserve the board's
  // viewport origin: centered HTML margins must never be multiplied by zoom.
  const origin=zc.getBoundingClientRect();
  const left=origin.left+(rect.left-origin.left)*s;
  const top=origin.top+(rect.top-origin.top)*s;
  const width=rect.width*s;
  const height=rect.height*s;
  return{
    left,top,width,height,
    right:left+width,
    bottom:top+height,
    x:left,
    y:top,
  };
}

export function getPlayerHandAnchorRect(pid){
  const handStripEl=pid===0
    ? document.querySelector('[data-self-hand-strip]')
    : document.querySelector(`[data-player-hand-strip="${pid}"]`);
  return _getZoomCompensatedRect(handStripEl);
}

export function getPlayerHandAnchorCenter(pid){
  const cards = getHandCardElements(pid);
  if (cards.length) {
    const anchors = cards.map(getCardElementAnchor).filter(Boolean);
    if (anchors.length) return {
      x: anchors.reduce((sum, a) => sum + a.x, 0) / anchors.length,
      y: anchors.reduce((sum, a) => sum + a.y, 0) / anchors.length,
    };
  }
  if(pid===0){
    const handStripEl=document.querySelector('[data-self-hand-strip]');
    if(handStripEl){
      const r=_getZoomCompensatedRect(handStripEl);
      if(r&&r.width>0&&r.height>0){
        return {x:r.left+r.width/2,y:r.top+r.height/2};
      }
    }
    const handAreaEl=document.querySelector('[data-hand-area]');
    if(handAreaEl){
      const r=_getZoomCompensatedRect(handAreaEl);
      if(r)return {x:r.left+r.width/2,y:r.top+r.height*0.65};
    }
    return {x:window.innerWidth*0.5,y:window.innerHeight*0.8};
  }
  const handRect=getPlayerHandAnchorRect(pid);
  if(handRect&&handRect.width>0&&handRect.height>0){
    return {x:handRect.left+handRect.width/2,y:handRect.top+handRect.height/2};
  }
  const el=document.querySelector(`[data-pid="${pid}"]`);
  if(el){
    const r=_getZoomCompensatedRect(el);
    if(r)return {x:r.left+r.width/2,y:r.top+r.height*0.74};
  }
  return {x:window.innerWidth*0.5,y:window.innerHeight*0.25};
}

export function getPlayerAreaAnchorCenter(pid){
  const el=document.querySelector(`[data-pid="${pid}"]`);
  if(el){
    const r=_getZoomCompensatedRect(el);
    if(r&&r.width>0&&r.height>0){
      return {x:r.left+r.width/2,y:r.top+r.height*0.35};
    }
  }
  return getPlayerHandAnchorCenter(pid);
}

export function getPlayerGodPowerAnchorCenter(pid){
  const badgeEl=document.querySelector(`[data-god-power-badge="${pid}"]`);
  if(badgeEl){
    const r=_getZoomCompensatedRect(badgeEl);
    if(r&&r.width>0&&r.height>0){
      return {x:r.left+r.width/2,y:r.top+r.height/2};
    }
  }
  const panelEl=document.querySelector(`[data-pid="${pid}"]`);
  const panelRect=_getZoomCompensatedRect(panelEl);
  if(panelRect&&panelRect.width>0&&panelRect.height>0){
    return {x:panelRect.left+panelRect.width*0.58,y:panelRect.top+panelRect.height*0.62};
  }
  return getPlayerAreaAnchorCenter(pid);
}

export function getPileAnchorCenter(selector,fallback){
  const cardAnchor = getCardElementAnchor(document.querySelector(`${selector} [data-pile-card-top]`));
  if (cardAnchor) return { x: cardAnchor.x, y: cardAnchor.y };
  const pileEl=document.querySelector(selector);
  if(!pileEl)return fallback;
  const visualPileEl=pileEl.firstElementChild instanceof HTMLElement
    ?pileEl.firstElementChild
    :pileEl;
  const visualRect=_getZoomCompensatedRect(visualPileEl);
  const pileRect=_getZoomCompensatedRect(pileEl);
  const r=(visualRect&&visualRect.width>0&&visualRect.height>0)
    ?visualRect
    :pileRect;
  if(!r||r.width<=0||r.height<=0)return fallback;
  return {x:r.left+r.width/2,y:r.top+r.height/2};
}

// 神选弹窗（GodChoiceModal）大致位于屏幕中上方，用于“邪神牌收入手牌”飞入动画的起点
export function getGodChoiceAnchorCenter(){
  const anchor = getGodChoiceCardAnchor();
  return { x: anchor.x, y: anchor.y };
}

// Flight geometry is measured in viewport pixels, outside board zoom/shake.
// A rotated bounding box is wider than the card: recover the card's native
// width before deriving height, rather than stretching that box into a face.
export function getCardElementAnchor(element) {
  if (!element) return null;
  const pileCard = element.matches?.('[data-pile-card]') ? element : element.closest?.('[data-pile-card]');
  if (pileCard) {
    const css = getComputedStyle(pileCard);
    const camera = pileCard.closest?.('[data-pile-camera]');
    const table = pileCard.closest?.('[data-pile-table]');
    if (camera && table) {
      const cameraCss = getComputedStyle(camera);
      const cameraRect = _getZoomCompensatedRect(camera);
      const rect = _getZoomCompensatedRect(pileCard);
      const zoom = cameraRect.width / Number.parseFloat(cameraCss.width);
      const width = Number.parseFloat(css.width) * zoom;
      const perspective = Number.parseFloat(cameraCss.perspective) * zoom;
      const tilt = Number.parseFloat(getComputedStyle(table).getPropertyValue('--toe-table-tilt')) || 0;
      const rotation = Number.parseFloat(css.getPropertyValue('--toe-card-rotation')) || 0;
      const depth = (Number.parseFloat(css.getPropertyValue('--toe-card-depth')) || 0) * zoom;
      if (width > 0 && perspective > 0 && rect?.width > 0) {
        const cx = cameraRect.left + cameraRect.width / 2;
        const cy = cameraRect.top + cameraRect.height / 2;
        const sin = Math.sin(tilt * Math.PI / 180), cos = Math.cos(tilt * Math.PI / 180);
        const sr = Math.sin(rotation * Math.PI / 180), cr = Math.cos(rotation * Math.PI / 180);
        const corners = [-width / 2, width / 2].flatMap(x => [-width * CARD_FACE_RATIO / 2, width * CARD_FACE_RATIO / 2]
          .map(y => ({ x: x * cr - y * sr, y: x * sr + y * cr })));
        // Invert the top edge's projection to recover the unrounded layout
        // center. offsetLeft/offsetTop round fractional positions and drift.
        const top = rect.top - cy;
        const y = (top * (perspective - cos * depth) + perspective * sin * depth) / (perspective * cos + top * sin)
          - Math.min(...corners.map(p => p.y));
        const x = Math.max(...corners.map(p => (rect.left - cx) * (perspective - sin * (y + p.y) - cos * depth) / perspective - p.x));
        const anchor = projectTableCard({ x, y, depth, width, rotation, tilt, perspective });
        return { ...anchor, x: cx + anchor.x, y: cy + anchor.y };
      }
    }
  }
  const face = element.matches?.('[data-card-face],[data-card-back]') ? element
    : element.querySelector?.('[data-card-face],[data-card-back]') || element;
  const rect = _getZoomCompensatedRect(face);
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  let rotation = 0;
  for (let node = face; node && node !== document.documentElement; node = node.parentElement) {
    const css = getComputedStyle(node);
    rotation += Number.parseFloat(css.rotate) || 0;
    if (css.transform && css.transform !== 'none' && typeof DOMMatrixReadOnly !== 'undefined') {
      const matrix = new DOMMatrixReadOnly(css.transform);
      rotation += Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
    }
  }
  const radians = rotation * Math.PI / 180;
  const width = rect.width / (Math.abs(Math.cos(radians)) + CARD_FACE_RATIO * Math.abs(Math.sin(radians)));
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width, height: width * CARD_FACE_RATIO, rotation };
}

function getHandCardElements(pid) {
  const strip = document.querySelector(pid === 0 ? '[data-self-hand-strip]' : `[data-player-hand-strip="${pid}"]`);
  return [...(strip?.querySelectorAll?.('[data-self-hand-card],[data-player-hand-card]') || [])];
}

export function getPlayerHandCardAnchor(pid = 0, card) {
  const cards = getHandCardElements(pid);
  const matched = card?.id != null && cards.find(el => (el.dataset.selfHandCardId ?? el.dataset.playerHandCardId) === String(card.id));
  const element = matched || cards[Math.floor(cards.length / 2)];
  const anchor = getCardElementAnchor(element);
  if (anchor) return anchor;
  const center = getPlayerHandAnchorCenter(pid);
  const strip = document.querySelector(pid === 0 ? '[data-self-hand-strip]' : `[data-player-hand-strip="${pid}"]`);
  const rect = _getZoomCompensatedRect(strip);
  // Empty hands still have a destination. The strip exports its actual card
  // width, so drawing the first card does not fall back to the old tiny sprite.
  const cssWidth = Number(strip?.dataset?.handCardWidth);
  const zoom = strip?.offsetWidth > 0 && rect?.width > 0 ? rect.width / strip.offsetWidth : 1;
  const width = cssWidth > 0 ? cssWidth * zoom : pid === 0
    ? Math.min(240, window.innerWidth * .18, window.innerHeight * .32)
    : Math.max(24, Math.min(64, (rect?.width || 160) / 4));
  return { ...center, width, height: width * CARD_FACE_RATIO, rotation: 0 };
}

export function getPileCardAnchor(selector, fallback) {
  const pile = document.querySelector(selector);
  const card = pile?.querySelector('[data-pile-card-top]') || pile?.querySelector('[data-pile-card]');
  const anchor = getCardElementAnchor(card);
  if (anchor) return anchor;
  if (!pile && fallback === null) return null;
  const center = getPileAnchorCenter(selector, fallback || { x: window.innerWidth / 2, y: window.innerHeight * .45 });
  const width = Math.min(160, Math.max(76, window.innerHeight * .18));
  return { ...center, width, height: width * CARD_FACE_RATIO, rotation: 0 };
}

export function getRevealCardAnchor() {
  const anchor = getCardElementAnchor(document.querySelector('[data-card-reveal]'));
  if (anchor) return anchor;
  const scale = Math.max(1.08, Math.min(1.85, Math.min(window.innerWidth / 1280, window.innerHeight / 720)));
  const width = Math.round(208 * scale);
  return { x: window.innerWidth / 2, y: window.innerHeight / 2, width, height: width * CARD_FACE_RATIO, rotation: 0 };
}

const decisionCardAnchors = new Map();
export function captureDecisionCardAnchors() {
  for (const kind of ['draw-reveal', 'god-choice']) {
    const face = document.querySelector(`[data-ui-dialog="${kind}"] [data-card-face]`);
    const anchor = getCardElementAnchor(face);
    if (anchor) decisionCardAnchors.set(kind, { cardId: face.dataset.cardFaceId, anchor });
  }
}

function getDecisionCardAnchor(kind, card) {
  const current = getCardElementAnchor(document.querySelector(`[data-ui-dialog="${kind}"] [data-card-face]`));
  const cached = decisionCardAnchors.get(kind);
  return current || (card?.id != null && cached?.cardId === String(card.id) ? cached.anchor : null);
}

export function getGodChoiceCardAnchor(card) {
  return getDecisionCardAnchor('god-choice', card) || getRevealCardAnchor();
}

export function getPlayerAreaCardAnchor(pid = 0, card, fromReveal = false) {
  // Draws reveal in the center for every player; local draw decisions can
  // instead have a measured modal card. Other effects retain their area.
  const modal = getDecisionCardAnchor('draw-reveal', card);
  if (modal) return modal;
  if (pid === 0 || fromReveal) return getRevealCardAnchor();
  return {
    ...getPlayerHandCardAnchor(pid), ...getPlayerAreaAnchorCenter(pid),
  };
}
