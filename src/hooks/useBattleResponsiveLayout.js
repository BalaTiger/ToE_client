import { useCallback, useMemo } from 'react';
import { computeScaleRatio, getFontZoomCompensate } from '../utils/scale.js';
import { useWindowSize } from './useWindowSize.js';

export function buildBattleResponsiveLayout(vw, vh) {
  const isMobile = vw < 580;
  const isMobileLandscape = vw >= 580 && vh < 580;
  const isVerySmall = vw < 480;
  const scaledAreaSafeInsetX = isMobile ? 24 : 12;
  const narrowDesktopClipFix = vw <= 1220;
  const globalShiftX = narrowDesktopClipFix ? Math.min(12, Math.round((1220 - vw) * 0.5)) : 0;
  const scaleRatio = computeScaleRatio(vw, vh);
  const rawMobileCompensate = scaleRatio < 1 ? 1 / scaleRatio : 1;
  const mobileZoomCompensate = isMobile
    ? rawMobileCompensate
    : isMobileLandscape
      ? Math.min(rawMobileCompensate, 1.14)
      : 1;
  const layoutScaleRatio = (isMobile || isMobileLandscape) && mobileZoomCompensate > 1
    ? 1 / mobileZoomCompensate
    : scaleRatio;
  const rem = 16;
  const baseFontSizes = {
    title: isMobile ? 0.75 * rem : isMobileLandscape ? 0.76 * rem : isVerySmall ? 0.75 * rem : 0.875 * rem,
    subtitle: isMobile ? 0.5 * rem : isMobileLandscape ? 0.52 * rem : isVerySmall ? 0.5 * rem : 0.625 * rem,
    body: isMobile ? 0.625 * rem : isMobileLandscape ? 0.62 * rem : isVerySmall ? 0.625 * rem : 0.6875 * rem,
    small: isMobile ? 0.5 * rem : isMobileLandscape ? 0.5 * rem : isVerySmall ? 0.5 * rem : 0.5625 * rem,
    tiny: isMobile ? 0.4375 * rem : isMobileLandscape ? 0.45 * rem : isVerySmall ? 0.4375 * rem : 0.5 * rem,
  };
  const interactionBaseFontSizes = {
    title: baseFontSizes.title,
    subtitle: baseFontSizes.subtitle,
    body: isMobile ? 0.84 * rem : baseFontSizes.body,
    small: isMobile ? 0.72 * rem : baseFontSizes.small,
    tiny: isMobile ? 0.62 * rem : baseFontSizes.tiny,
  };
  const fontZoomCompensate = getFontZoomCompensate(layoutScaleRatio);
  const scaleFontSet = (sizes) => ({
    title: sizes.title * fontZoomCompensate,
    subtitle: sizes.subtitle * fontZoomCompensate,
    body: sizes.body * fontZoomCompensate,
    small: sizes.small * fontZoomCompensate,
    tiny: sizes.tiny * fontZoomCompensate,
  });
  const fontSizes = scaleFontSet(baseFontSizes);
  const interactionFontSizes = scaleFontSet(interactionBaseFontSizes);
  const middleRowHeight = isMobile ? 292 : isMobileLandscape ? 150 : 282;
  const desktopBoardScaleRatio = scaleRatio < 1 ? Math.sqrt(scaleRatio) : scaleRatio;

  return {
    isMobile,
    isMobileLandscape,
    scaleRatio,
    layoutScaleRatio,
    mobileZoomCompensate,
    baseFontSizes,
    fontSizes,
    interactionFontSizes,
    scaledAreaSafeInsetX,
    globalShiftX,
    middleRowHeight,
    boardScaleRatio: isMobileLandscape ? layoutScaleRatio : isMobile ? scaleRatio : desktopBoardScaleRatio,
    compactBoardScaleRatio: isMobile && !isMobileLandscape ? 1 : isMobileLandscape ? layoutScaleRatio : desktopBoardScaleRatio,
    mobileHandUsesCompact: isMobileLandscape,
    selfHandCardScale: (isMobile || isMobileLandscape) ? mobileZoomCompensate : 1,
  };
}

export function useBattleResponsiveLayout() {
  const { w: vw, h: vh } = useWindowSize();
  const layout = useMemo(() => buildBattleResponsiveLayout(vw, vh), [vw, vh]);
  const mobileCssPx = useCallback(
    (px) => Math.round(px * layout.mobileZoomCompensate),
    [layout.mobileZoomCompensate],
  );
  const boardCssPx = useCallback(
    (px) => layout.isMobileLandscape ? Math.round(px * layout.mobileZoomCompensate) : px,
    [layout.isMobileLandscape, layout.mobileZoomCompensate],
  );

  return {
    vw,
    vh,
    ...layout,
    mobileCssPx,
    boardCssPx,
  };
}
