import { useEffect } from 'react';
import { _getZoomCompensatedRect } from '../utils/dom';

const toRect = rect => rect && ({
  top: rect.top,
  left: rect.left,
  right: rect.right,
  bottom: rect.bottom,
  width: rect.width,
  height: rect.height,
});

export function getTutorialHighlightMeasureDelays(highlight, hasSwapBlindHand = false) {
  if (['drawRevealKeepButton', 'godKeepHandButton', 'dodgeRollButton'].includes(highlight)) return [220, 320];
  if (highlight === 'skillButton') return [50];
  if (highlight === 'swapBlindHand' && hasSwapBlindHand) return [1200];
  return [];
}

export function useTutorialHighlightMeasurements({ enabled, step, stepDef, gameState, targets, setRects }) {
  useEffect(() => {
    const update = () => {
      const highlight = typeof step === 'string' ? stepDef?.highlight : null;
      const measure = (key, element) => {
        const rect = element ? _getZoomCompensatedRect(element) : null;
        if (rect) setRects[key](toRect(rect));
      };

      if (enabled && ((step >= 2 && step <= 4) || highlight === 'selfPanel')) measure('panel', targets.selfPanel.current);
      if (enabled && (step === 5 || highlight === 'roleText')) measure('roleText', targets.roleText.current);
      if (enabled && (step === 7 || step === 15 || ['handArea', 'handCard', 'skillButton'].includes(highlight))) measure('handArea', targets.handArea.current);
      if (enabled && highlight === 'handCards' && targets.handArea.current) {
        const cardEls = targets.handArea.current.querySelectorAll('[data-self-hand-card]');
        let top = Infinity, left = Infinity, right = -Infinity, bottom = -Infinity;
        cardEls.forEach(element => {
          const rect = _getZoomCompensatedRect(element);
          if (!rect) return;
          top = Math.min(top, rect.top); left = Math.min(left, rect.left);
          right = Math.max(right, rect.right); bottom = Math.max(bottom, rect.bottom);
        });
        if (top !== Infinity) setRects.handCards({ top, left, right, bottom, width: right - left, height: bottom - top });
      }
      if (enabled && highlight === 'handCard' && targets.handArea.current) {
        const cardId = stepDef?.allowedAction?.cardId;
        const element = [...targets.handArea.current.querySelectorAll('[data-self-hand-card-id]')]
          .find(candidate => candidate.dataset.selfHandCardId === cardId);
        setRects.tutorialHandCard(toRect(element ? _getZoomCompensatedRect(element) : null));
      }
      if (enabled && (step === 9 || step === 11 || ['opponentPanel', 'swapBlind'].includes(highlight))) measure('aiPanelArea', targets.aiPanelArea.current);
      if (enabled && ['opponentSanBar', 'opponentSanAndGodStatus'].includes(highlight)) measure('opponentSanBar', targets.aiPanelArea.current?.querySelector('[data-stat-label="SAN"]'));
      if (enabled && highlight === 'opponentHpBar') measure('opponentHpBar', targets.aiPanelArea.current?.querySelector('[data-stat-label="HP"]'));
      if (enabled && highlight === 'singleOpponent') measure('singleOpponent', targets.aiPanelArea.current?.querySelector('[data-pid="1"]'));
      if (enabled && ['opponentGodStatus', 'opponentSanAndGodStatus'].includes(highlight)) measure('opponentGodStatus', targets.aiPanelArea.current?.querySelector('[data-player-god-status="1"]'));
      if (enabled && highlight === 'drawRevealKeepButton') measure('drawRevealKeepButton', targets.drawRevealKeepButton.current);
      if (enabled && highlight === 'godKeepHandButton') measure('godKeepHandButton', targets.godKeepHandButton.current);
      if (enabled && highlight === 'dodgeRollButton') measure('dodgeRollButton', targets.dodgeRollButton.current);
      if (enabled && highlight === 'skillButton') measure('skillButton', targets.skillButton.current);
      if (enabled && highlight === 'swapBlindHand') measure('swapBlindHand', targets.swapBlindHand.current);
      if (enabled && (step === 12 || step === 13 || highlight === 'deckArea')) measure('deckArea', targets.deckArea.current);
    };

    update();
    const highlight = typeof step === 'string' ? stepDef?.highlight : null;
    const timeoutIds = getTutorialHighlightMeasureDelays(highlight, !!targets.swapBlindHand.current)
      .map(delay => setTimeout(update, delay));
    if (!enabled) return undefined;
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      timeoutIds.forEach(clearTimeout);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [enabled, step, stepDef, gameState, targets, setRects]);
}
