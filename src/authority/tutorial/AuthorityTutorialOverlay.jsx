import { useMemo, useState } from 'react';
import InGameTutorialOverlay from '../../components/tutorial/InGameTutorialOverlay';
import { useTutorialHighlightMeasurements } from '../../hooks/useTutorialHighlightMeasurements';
import { getTutorialStep } from '../../game/tutorialScenario';

const RECT_KEYS = ['panel', 'roleText', 'handArea', 'tutorialHandCard', 'handCards', 'aiPanelArea', 'opponentSanBar',
  'opponentHpBar', 'singleOpponent', 'opponentGodStatus', 'drawRevealKeepButton', 'godKeepHandButton', 'deckArea',
  'dodgeRollButton', 'skillButton', 'swapBlindHand'];
export function AuthorityTutorialOverlay({ view, session, refs, layout, busy, onComplete, report }) {
  const [rects, setRects] = useState({});
  const step = view.tutorial.step;
  const stepDef = useMemo(() => {
    const definition = getTutorialStep(step), id = definition.allowedAction?.cardId;
    return typeof id === 'string' ? { ...definition, allowedAction: { ...definition.allowedAction, cardId: `local:0:${id}` } } : definition;
  }, [step]);
  const setters = useMemo(() => Object.fromEntries(RECT_KEYS.map(key => [key, update => setRects(previous => {
    const next = update(previous[key]); return next === previous[key] ? previous : { ...previous, [key]: next };
  })])), []);
  const targets = useMemo(() => ({ ...Object.fromEntries(Object.entries(refs).map(([key, ref]) => [key.replace(/Ref$/, ''), ref])),
    swapBlindHand: { get current() { return document.querySelector('[data-player-hand-strip="1"]'); } },
  }), [refs]);
  const visible = !busy && !view.tutorial.waiting && !view.status?.paused;
  useTutorialHighlightMeasurements({ enabled: visible, step, stepDef, gameState: view, targets, setRects: setters });
  const run = callback => { try { callback(); } catch (error) { report?.(error); } };
  return <InGameTutorialOverlay showTutorial={visible} tutorialStep={step}
    {...Object.fromEntries(Object.entries(rects).map(([key, rect]) => [`${key}Rect`, rect]))}
    vw={layout.vw || window.innerWidth} scaleRatio={layout.scaleRatio || 1} baseBodyFontSize={14}
    advanceTutorialStep={next => run(() => session.advanceTutorialStep(next))} completeTutorial={() => run(onComplete)} />;
}
