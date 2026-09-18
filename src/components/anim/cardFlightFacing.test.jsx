import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardDrawFlight, CardFlipAnim } from './CardFlipAnim';
import { CardTransferOverlay } from './MoveOverlays';
import { MOVE_ANIMATION_STYLES } from './moveStyles';
import { getPileCardAnchor, getPlayerHandCardAnchor, getRevealCardAnchor } from '../../utils/dom';

const anchors = vi.hoisted(() => ({
  deck: { x: 240, y: 120, width: 100, tilt: 45, rotation: 8 },
  discard: { x: 360, y: 160, width: 100, tilt: 45, rotation: -8 },
  reveal: { x: 640, y: 360, width: 208, tilt: 0, rotation: 0 },
  hand: { x: 640, y: 640, width: 160, tilt: 0, rotation: 0 },
}));

vi.mock('../../utils/dom', async importOriginal => ({
  ...await importOriginal(),
  getPileCardAnchor: vi.fn(selector => selector === '[data-discard-pile]' ? anchors.discard : anchors.deck),
  getPlayerHandCardAnchor: vi.fn(() => anchors.hand),
  getRevealCardAnchor: vi.fn(() => anchors.reveal),
}));
vi.mock('../../hooks/useWindowSize', () => ({
  useWindowSize: () => ({ w: window.innerWidth, h: window.innerHeight }),
}));

const card = { id: 'ordinary', isZone: true, key: 'A1', letter: 'A', name: '不应公开的普通牌', type: 'selfDamageHP', val: 1 };
const inspection = { id: 'inspection', name: '揭开真相', effect: 'drawCard', type: 'positive' };
const hiddenDraw = { id: 'hidden-draw', hiddenDraw: true };

beforeEach(() => {
  vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 720, __PUBLIC_BASE__: '/' });
  vi.clearAllMocks();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('draw flight facing', () => {
  it('turns a two-sided self draw more gently without ending fully face-on', () => {
    const markup = renderToString(<CardDrawFlight card={card} targetPid={0} from={anchors.deck} to={anchors.reveal} />);
    expect(markup).toContain('data-card-draw-flight="reveal-front"');
    expect(markup).toContain('data-card-flight-side="back"');
    expect(markup).toContain('data-card-flight-side="front"');
    expect(markup).toContain('data-card-face-id="ordinary"');
    expect(markup).toContain('cardDrawTurn 0.65s linear');
    expect(markup).toContain('--from-tilt:45deg');
    expect(markup).toContain('--to-tilt:18deg');
    expect(MOVE_ANIMATION_STYLES).toMatch(/@keyframes cardDrawTurn\s*\{\s*from\s*\{\s*transform: rotateX\(-180deg\);\s*\}\s*to\s*\{\s*transform: rotateX\(-42deg\);/);
  });

  it.each([
    ['opponent', card, 1],
    ['inspection', inspection, 0],
    ['hidden draw', hiddenDraw, 0],
  ])('keeps the %s draw flight on its back without rendering a face', (_, drawnCard, targetPid) => {
    const markup = renderToString(<CardFlipAnim card={drawnCard} targetPid={targetPid} travelOnly={drawnCard.hiddenDraw} />);
    expect(markup).toContain('data-card-draw-flight="back"');
    expect(markup).toContain('data-card-back');
    expect(markup).not.toContain('data-card-face');
    expect(markup).not.toContain('data-card-draw-turn');
    expect(markup).not.toContain(card.name);
    if (targetPid === 1) expect(markup).toContain('--to-tilt:18deg');
  });

  it('uses the discard source for reversal draws and the hand destination for hidden gains', () => {
    renderToString(<CardFlipAnim card={card} targetPid={0} sourcePile="discard" />);
    expect(getPileCardAnchor).toHaveBeenCalledWith('[data-discard-pile]', expect.any(Object));
    expect(getRevealCardAnchor).toHaveBeenCalled();
    renderToString(<CardFlipAnim card={hiddenDraw} targetPid={0} travelOnly />);
    expect(getPlayerHandCardAnchor).toHaveBeenCalledWith(0, hiddenDraw);
  });

  it('keeps the Blind Fish mask over the front during the self draw', () => {
    const markup = renderToString(<CardFlipAnim card={{ ...card, blindZoneIdentity: true }} targetPid={0} />);
    expect(markup).toContain('data-card-flight-side="front"');
    expect(markup).toContain('blindFishScotomaDrift');
    expect(markup).toContain('mask-image:linear-gradient');
  });

  it('starts the original rise and full spin after the self draw flight', () => {
    vi.spyOn(React, 'useState').mockReturnValueOnce([true, vi.fn()]);
    const markup = renderToString(<CardFlipAnim card={card} targetPid={0} />);
    expect(markup).toContain('data-card-reveal');
    expect(markup).toContain('data-card-face-id="ordinary"');
    expect(markup).toContain('animation:cardRise 1.2s cubic-bezier(0.15,0,0.35,1) forwards');
    expect(markup).toContain('animation:cardFlip 1.2s cubic-bezier(0.2,0,0.3,1) forwards');
  });

  it.each([
    ['skipTravel', card, 0, true],
    ['opponent', card, 1, false],
    ['inspection', inspection, 0, false],
  ])('preserves the public central reveal for %s', (_, drawnCard, targetPid, skipTravel) => {
    vi.spyOn(React, 'useState').mockReturnValueOnce([true, vi.fn()]);
    const markup = renderToString(<CardFlipAnim card={drawnCard} targetPid={targetPid} skipTravel={skipTravel} />);
    expect(markup).toContain(`data-card-face-id="${drawnCard.id}"`);
    expect(markup).toContain('animation:cardRise');
    expect(markup).toContain('animation:cardFlip');
  });

  it('ends hidden travel without mounting a central reveal', () => {
    vi.spyOn(React, 'useState').mockReturnValueOnce([true, vi.fn()]);
    expect(renderToString(<CardFlipAnim card={hiddenDraw} targetPid={0} travelOnly />)).toBe('');
  });
});

describe('income flight facing', () => {
  it('honors each mixed-batch facing even when the shared faceUp fallback is true', () => {
    const cards = [card, { id: 'goat', isBlackGoatYoung: true, name: '黑山羊幼仔' }, { id: 'slime', isTsathogguaSlime: true, name: '撒托古亚黏液' }];
    const markup = renderToString(<CardTransferOverlay transfers={[{
      key: 'mixed', count: cards.length, cards, faceUp: true, cardFaceUp: [false, true, true], keepFacing: true,
      paths: cards.map(() => ({ from: anchors.deck, to: anchors.hand })),
    }]} />);
    expect(markup.match(/data-card-transfer-side="back"/g)).toHaveLength(1);
    expect(markup.match(/data-card-transfer-side="front"/g)).toHaveLength(2);
    expect(markup).not.toContain('data-card-face-id="ordinary"');
    expect(markup).not.toContain(card.name);
    expect(markup).toContain('data-card-face-id="goat"');
    expect(markup).toContain('data-card-face-id="slime"');
    for (const stage of ['from', 'mid', 'to']) expect(markup.match(new RegExp(`--${stage}-tilt:0deg`, 'g'))).toHaveLength(3);
    expect(markup.match(/--flight-bank:0deg/g)).toHaveLength(3);
  });

  it.each([true, false])('renders a known income card according to faceUp=%s', faceUp => {
    const markup = renderToString(<CardTransferOverlay transfers={[{
      key: 'income', effect: 'draw', count: 1, cards: [card], cardFaceUp: [faceUp], keepFacing: true,
      paths: [{ from: anchors.reveal, to: anchors.hand }],
    }]} />);
    expect(markup).toContain(`data-card-transfer-side="${faceUp ? 'front' : 'back'}"`);
    expect(markup.includes('data-card-face-id="ordinary"')).toBe(faceUp);
    expect(markup.includes(card.name)).toBe(faceUp);
  });
});

describe('retained reveal decisions', () => {
  it.each([
    ['draw-reveal', card],
    ['god-choice', { id: 'god', isGod: true, godKey: 'CTH', name: '克苏鲁' }],
  ])('holds the exact last frame for %s without replaying entry or reveal effects', (decisionKind, revealedCard) => {
    const markup = renderToString(<CardFlipAnim card={revealedCard} targetPid={0} settled decisionKind={decisionKind}>
      <button>收入手牌</button>
    </CardFlipAnim>);
    expect(markup).toContain(`data-ui-dialog="${decisionKind}"`);
    expect(markup).toContain('data-card-reveal-settled="true"');
    expect(markup).toContain('data-card-reveal-options');
    expect(markup).toContain('transform:translateY(0)');
    expect(markup).toContain('transform:rotateY(1080deg)');
    expect(markup).toContain('width:225px');
    expect(markup).not.toContain('animation:cardRise');
    expect(markup).not.toContain('animation:cardFlip');
    expect(markup).not.toContain('animFadeIn');
    expect(markup).not.toContain('data-card-draw-flight');
    expect(markup).not.toContain('burstPulse');
    expect(markup).not.toContain('smokeRise');
    expect(markup).not.toContain('flowerBloom');
  });

  it('keeps the Blind Fish scotoma in the decision frame', () => {
    const markup = renderToString(<CardFlipAnim card={{ ...card, blindZoneIdentity: true }} targetPid={0} settled decisionKind="draw-reveal" />);
    expect(markup).toContain('blindFishScotomaDrift');
    expect(markup).toContain('data-card-flip-atmosphere="neutral"');
    expect(markup).not.toContain('smokeRise');
  });

  it('keeps the settled card visible without dimming queued stat effects behind it', () => {
    const markup = renderToString(<CardFlipAnim card={card} targetPid={0} settled showBackdrop={false} decisionKind="draw-reveal" />);
    expect(markup).toContain('data-card-reveal-settled="true"');
    expect(markup).toContain('data-card-face-id="ordinary"');
    const overlay = markup.match(/<div data-ui-dialog="draw-reveal"[^>]+>/)?.[0];
    expect(overlay).toContain('background:transparent');
    expect(overlay).not.toContain('background:rgba(');
    expect(markup).not.toContain('animation:cardRise');
    expect(markup).not.toContain('animation:cardFlip');
  });

  it('suppresses only the requested exit fade while the queue finishes', () => {
    const retained = renderToString(<CardFlipAnim card={card} skipTravel exiting preserveOnExit />);
    expect(retained).not.toContain('animFadeOut');
    expect(retained).toContain('animation:cardRise');
    const ordinary = renderToString(<CardFlipAnim card={card} skipTravel exiting />);
    expect(ordinary).toContain('animFadeOut');
  });

  it('does not arm travel or early-action timers when mounted directly at a decision', () => {
    const effects = [];
    vi.spyOn(React, 'useEffect').mockImplementation(effect => { effects.push(effect); });
    vi.spyOn(globalThis, 'setTimeout');
    renderToString(<CardFlipAnim card={card} settled earlyActions />);
    // The first two component effects own travel and early decision controls.
    expect(effects.length).toBeGreaterThanOrEqual(2);
    effects.slice(0, 2).forEach(effect => effect());
    expect(setTimeout).not.toHaveBeenCalled();
  });
});
