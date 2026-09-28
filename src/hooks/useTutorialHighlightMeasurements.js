import { useEffect } from 'react';
import { _getZoomCompensatedRect } from '../utils/dom';

export function unionTutorialRects(rects) {
  const visible = rects.filter(rect => rect?.width > 0 && rect?.height > 0);
  if (!visible.length) return null;
  const top = Math.min(...visible.map(rect => rect.top));
  const left = Math.min(...visible.map(rect => rect.left));
  const right = Math.max(...visible.map(rect => rect.right));
  const bottom = Math.max(...visible.map(rect => rect.bottom));
  return { top, left, right, bottom, width: right - left, height: bottom - top };
}

export function useTutorialHighlightMeasurements({ enabled, step, stepDef, gameState, targets, setRects }) {
  useEffect(() => {
    if (!enabled || typeof step !== 'string' || stepDef?.auto) return undefined;
    const highlight = stepDef?.highlight;
    if (!highlight || ['center', 'noSpotlight'].includes(highlight)) return undefined;
    const observed = new Set();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => update());
    const measure = (key, ...elements) => {
      elements.filter(Boolean).forEach(element => {
        if (observed.has(element)) return;
        observed.add(element);
        observer?.observe(element);
      });
      const rect = unionTutorialRects(elements.filter(Boolean).map(_getZoomCompensatedRect));
      setRects[key](previous => (
        (!previous && !rect) || (previous && rect && Object.keys(rect).every(prop => Math.abs(rect[prop] - previous[prop]) < .25))
          ? previous : rect
      ));
    };
    const update = () => {
      const self = targets.selfPanel.current;
      const hand = targets.handArea.current;
      const opponents = targets.aiPanelArea.current;
      const opponent = opponents?.querySelector('[data-pid="1"]');
      if (highlight === 'selfPanel') {
        const stats = self?.querySelector('.toe-self-stats');
        // The left sidebar now continues through the faith description. The
        // introduction needs only the portrait, identity and stats.
        measure('panel', ...(stats ? [self.querySelector('.toe-coastal-portrait'), self.querySelector('.toe-self-title'), stats] : [self]));
      }
      if (highlight === 'roleText') measure('roleText', targets.roleText.current?.closest('.toe-self-title') || targets.roleText.current);
      if (['handArea', 'handCard', 'handCards'].includes(highlight)) {
        const cards = [...(hand?.querySelectorAll('[data-self-hand-card]') || [])];
        measure('handArea', ...(cards.length ? cards : [hand]));
        if (highlight === 'handCards') measure('handCards', ...cards);
        if (highlight === 'handCard') measure('tutorialHandCard', cards.find(element => element.dataset.selfHandCardId === stepDef?.allowedAction?.cardId));
      }
      if (highlight === 'opponentPanel') measure('aiPanelArea', opponents);
      if (['opponentSanBar', 'opponentSanAndGodStatus'].includes(highlight)) measure('opponentSanBar', opponent?.querySelector('[data-stat-label="SAN"]'));
      if (highlight === 'opponentHpBar') measure('opponentHpBar', opponent?.querySelector('[data-stat-label="HP"]'));
      if (highlight === 'singleOpponent') measure('singleOpponent', opponent);
      if (['opponentGodStatus', 'opponentSanAndGodStatus'].includes(highlight)) {
        measure('opponentGodStatus', opponent?.querySelector('[data-player-god-status="1"]'), opponent?.querySelector('[data-encounter-skulls="1"]'));
      }
      if (['drawRevealKeepButton', 'godKeepHandButton', 'dodgeRollButton', 'skillButton', 'swapBlindHand', 'deckArea'].includes(highlight)) {
        measure(highlight, targets[highlight].current);
      }
    };

    update();
    // Real flip decisions mount independently of game-state commits. Observe
    // their mount and final geometry rather than guessing old modal delays.
    const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver(update);
    mutations?.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    document.addEventListener('animationend', update, true);
    document.addEventListener('transitionend', update, true);
    return () => {
      observer?.disconnect();
      mutations?.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      document.removeEventListener('animationend', update, true);
      document.removeEventListener('transitionend', update, true);
    };
  }, [enabled, step, stepDef, gameState, targets, setRects]);
}
