import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import InGameTutorialOverlay from './InGameTutorialOverlay';
import { TUTORIAL_FLOW } from '../../game/tutorialScenario';

afterEach(() => vi.unstubAllGlobals());

function render(props) {
  vi.stubGlobal('window', { innerWidth: 844, innerHeight: 390 });
  vi.stubGlobal('document', { querySelector: () => null });
  return renderToStaticMarkup(<InGameTutorialOverlay showTutorial vw={844} {...props} />);
}

it('shows the tutorial above the real flip decision without blocking its keep button', () => {
  const markup = render({ tutorialStep: TUTORIAL_FLOW.TREASURE_DRAW_REVEAL,
    drawRevealKeepButtonRect: { left: 315, right: 425, top: 280, bottom: 330 } });
  expect(markup).toContain('z-index:1100;pointer-events:none');
  expect(markup).toContain('data-ui-dialog="tutorial"');
  expect(markup).toContain('max-height:370px;overflow-y:auto');
});

it('waits for actual action controls instead of highlighting a stale hand rectangle', () => {
  expect(render({ tutorialStep: TUTORIAL_FLOW.TREASURE_USE_SKILL,
    handAreaRect: { left: 200, right: 650, top: 210, bottom: 390 } })).toBe('');
});

it('has no retired numeric overlay or overlay during automatic playback', () => {
  expect(render({ tutorialStep: 7 })).toBe('');
  expect(render({ tutorialStep: TUTORIAL_FLOW.CULTIST_GOD_CONVERT_RESOLVE })).toBe('');
});
