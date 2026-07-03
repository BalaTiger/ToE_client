import React from 'react';
import { buildPublicUrl } from '../../utils/url';
import { _getZoomCompensatedRect } from '../../utils/dom';

const DREAM_IMAGE = buildPublicUrl('img/effects/R’lyeh_dream.png');
const DREAM_WIDTH_RATIO = 0.48;
const DREAM_HEIGHT_RATIO = 0.43;
const DREAM_MAX_WIDTH = 620;
const DREAM_MAX_HEIGHT = 430;

const BUBBLES = [
  { x: -34, y: 22, dx: -22, size: 8, delay: 0.02, dur: 2.6 },
  { x: -18, y: 8, dx: -12, size: 5, delay: 0.24, dur: 2.1 },
  { x: 8, y: 24, dx: 9, size: 7, delay: 0.12, dur: 2.4 },
  { x: 26, y: 4, dx: 20, size: 10, delay: 0.34, dur: 2.8 },
  { x: 40, y: 30, dx: 30, size: 6, delay: 0.48, dur: 2.2 },
  { x: -42, y: -6, dx: -28, size: 4, delay: 0.58, dur: 2.5 },
  { x: -6, y: -18, dx: -5, size: 9, delay: 0.42, dur: 2.7 },
  { x: 19, y: -14, dx: 14, size: 5, delay: 0.72, dur: 2.3 },
  { x: 2, y: 38, dx: 4, size: 12, delay: 0.84, dur: 2.9 },
  { x: 34, y: -22, dx: 26, size: 7, delay: 0.98, dur: 2.4 },
  { x: -25, y: 34, dx: -18, size: 6, delay: 1.1, dur: 2.6 },
  { x: 14, y: 12, dx: 11, size: 4, delay: 1.22, dur: 2.05 },
];

const EDGE_CLOUDS = [
  { x: 18, y: 20, w: 34, h: 24, delay: -0.2, dur: 3.2, rot: -14 },
  { x: 66, y: 10, w: 38, h: 28, delay: -1.0, dur: 3.8, rot: 18 },
  { x: 82, y: 48, w: 30, h: 42, delay: -0.5, dur: 3.4, rot: 42 },
  { x: 60, y: 82, w: 44, h: 24, delay: -1.6, dur: 4.0, rot: -8 },
  { x: 22, y: 72, w: 36, h: 34, delay: -0.9, dur: 3.6, rot: -34 },
  { x: 6, y: 42, w: 28, h: 40, delay: -1.3, dur: 3.7, rot: 28 },
];

function getDreamFrame() {
  const width = Math.min(window.innerWidth * DREAM_WIDTH_RATIO, DREAM_MAX_WIDTH);
  const height = Math.min(window.innerHeight * DREAM_HEIGHT_RATIO, DREAM_MAX_HEIGHT);
  return {
    cx: window.innerWidth / 2,
    cy: window.innerHeight / 2,
    width,
    height,
    rx: width * 0.46,
    ry: height * 0.42,
  };
}

function getFacingRectEdge(rect, targetX, targetY) {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = targetX - centerX;
  const dy = targetY - centerY;
  const tx = dx === 0 ? Infinity : (rect.width / 2) / Math.abs(dx);
  const ty = dy === 0 ? Infinity : (rect.height / 2) / Math.abs(dy);

  if (tx < ty) {
    const x = dx >= 0 ? rect.right : rect.left;
    return {
      a: { x, y: rect.top },
      b: { x, y: rect.bottom },
      mid: { x, y: centerY },
    };
  }
  const y = dy >= 0 ? rect.bottom : rect.top;
  return {
    a: { x: rect.left, y },
    b: { x: rect.right, y },
    mid: { x: centerX, y },
  };
}

function getEllipseSupportValue(ellipse, normal) {
  const radius = Math.hypot(ellipse.rx * normal.x, ellipse.ry * normal.y);
  return ellipse.cx * normal.x + ellipse.cy * normal.y + radius;
}

function getEllipseSupportPoint(ellipse, normal) {
  const radius = Math.hypot(ellipse.rx * normal.x, ellipse.ry * normal.y);
  if (radius <= 0.0001) return { x: ellipse.cx, y: ellipse.cy };
  return {
    x: ellipse.cx + (ellipse.rx * ellipse.rx * normal.x) / radius,
    y: ellipse.cy + (ellipse.ry * ellipse.ry * normal.y) / radius,
  };
}

function getSourceEllipse(rect) {
  const padding = 2;
  return {
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2,
    rx: rect.width / 2 + padding,
    ry: rect.height / 2 + padding,
  };
}

function getCommonExternalEllipseTangents(sourceEllipse, targetEllipse) {
  const delta = (theta) => {
    const normal = { x: Math.cos(theta), y: Math.sin(theta) };
    return getEllipseSupportValue(sourceEllipse, normal) - getEllipseSupportValue(targetEllipse, normal);
  };
  const normalizeAngle = (theta) => {
    const full = Math.PI * 2;
    return ((theta % full) + full) % full;
  };
  const hasRootNear = (roots, theta) => roots.some(root => {
    const diff = Math.abs(normalizeAngle(root - theta));
    return Math.min(diff, Math.PI * 2 - diff) < 0.001;
  });
  const pushRoot = (roots, theta) => {
    const normalized = normalizeAngle(theta);
    if (!hasRootNear(roots, normalized)) roots.push(normalized);
  };

  const roots = [];
  const samples = 720;
  let prevTheta = 0;
  let prevValue = delta(prevTheta);
  for (let i = 1; i <= samples; i += 1) {
    const theta = (Math.PI * 2 * i) / samples;
    const value = delta(theta);
    if (Math.abs(prevValue) < 0.0001) {
      pushRoot(roots, prevTheta);
    } else if (prevValue * value < 0) {
      let lo = prevTheta;
      let hi = theta;
      let loValue = prevValue;
      for (let step = 0; step < 26; step += 1) {
        const mid = (lo + hi) / 2;
        const midValue = delta(mid);
        if (loValue * midValue <= 0) {
          hi = mid;
        } else {
          lo = mid;
          loValue = midValue;
        }
      }
      pushRoot(roots, (lo + hi) / 2);
    }
    prevTheta = theta;
    prevValue = value;
  }

  if (roots.length < 2) return null;

  const centerVector = {
    x: targetEllipse.cx - sourceEllipse.cx,
    y: targetEllipse.cy - sourceEllipse.cy,
  };
  const sideAxis = { x: -centerVector.y, y: centerVector.x };
  const tangentPairs = roots
    .map((theta) => {
      const normal = { x: Math.cos(theta), y: Math.sin(theta) };
      return {
        source: getEllipseSupportPoint(sourceEllipse, normal),
        target: getEllipseSupportPoint(targetEllipse, normal),
      };
    })
    .sort((a, b) => {
      const ap = a.source.x * sideAxis.x + a.source.y * sideAxis.y;
      const bp = b.source.x * sideAxis.x + b.source.y * sideAxis.y;
      return ap - bp;
    })
    .slice(0, 2);

  return {
    source: {
      a: tangentPairs[0].source,
      b: tangentPairs[1].source,
      mid: {
        x: (tangentPairs[0].source.x + tangentPairs[1].source.x) / 2,
        y: (tangentPairs[0].source.y + tangentPairs[1].source.y) / 2,
      },
    },
    target: {
      a: tangentPairs[0].target,
      b: tangentPairs[1].target,
      mid: {
        x: (tangentPairs[0].target.x + tangentPairs[1].target.x) / 2,
        y: (tangentPairs[0].target.y + tangentPairs[1].target.y) / 2,
      },
    },
  };
}

function isUsableGodPowerRect(rect) {
  return rect
    && rect.width >= 18
    && rect.height >= 8
    && rect.width <= 280
    && rect.height <= 90;
}

function getGodPowerSourceElement(targetPid) {
  const badge = document.querySelector(`[data-god-power-badge="${targetPid}"]`);
  if (isUsableGodPowerRect(_getZoomCompensatedRect(badge))) return badge;

  const anchor = document.querySelector(`[data-god-power-anchor="${targetPid}"]`);
  if (isUsableGodPowerRect(_getZoomCompensatedRect(anchor))) return anchor;

  return null;
}

function getComputedPixelValue(style, prop, fallback = '0px') {
  const value = style?.getPropertyValue?.(prop) || style?.[prop];
  return value && value !== 'normal' ? value : fallback;
}

function scaleCssPx(value, scale, fallback = value) {
  if (!value || value === 'normal') return fallback;
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric) || !value.trim().endsWith('px')) return value;
  return `${(numeric * scale).toFixed(2)}px`;
}

function scaleCssPxList(value, scale, fallback = value) {
  if (!value) return fallback;
  return value
    .split(/\s+/)
    .map(part => scaleCssPx(part, scale, part))
    .join(' ');
}

function getSourcePanelLines(element, scale = 1) {
  const children = [...(element?.children || [])].filter(child => {
    const text = (child.innerText || child.textContent || '').trim();
    return text && child instanceof HTMLElement;
  });
  const lineElements = children.length ? children : element ? [element] : [];
  return lineElements.map((child) => {
    const style = window.getComputedStyle(child);
    return {
      text: (child.innerText || child.textContent || '').trim(),
      color: style.color,
      fontFamily: style.fontFamily,
      fontSize: scaleCssPx(style.fontSize, scale),
      fontStyle: style.fontStyle,
      fontWeight: style.fontWeight,
      letterSpacing: scaleCssPx(getComputedPixelValue(style, 'letter-spacing', '0px'), scale, '0px'),
      lineHeight: scaleCssPx(getComputedPixelValue(style, 'line-height', '1.35'), scale, getComputedPixelValue(style, 'line-height', '1.35')),
      marginTop: scaleCssPx(getComputedPixelValue(style, 'margin-top', '0px'), scale, '0px'),
      textShadow: style.textShadow,
    };
  });
}

function getBeamSourceInfo(targetPid, dream) {
  const element = getGodPowerSourceElement(targetPid);
  const rect = _getZoomCompensatedRect(element);
  if (isUsableGodPowerRect(rect)) {
    const style = window.getComputedStyle(element);
    const layoutWidth = element.offsetWidth || element.getBoundingClientRect()?.width || rect.width;
    const layoutHeight = element.offsetHeight || element.getBoundingClientRect()?.height || rect.height;
    const styleScale = Math.max(
      layoutWidth > 0 ? rect.width / layoutWidth : 1,
      layoutHeight > 0 ? rect.height / layoutHeight : 1,
    );
    return {
      rect,
      text: (element.innerText || element.textContent || '').trim(),
      lines: getSourcePanelLines(element, styleScale),
      color: style.color || 'rgba(194,255,255,0.9)',
      borderColor: style.borderColor || 'rgba(116,226,238,0.7)',
      background: style.backgroundColor || 'rgba(6,18,28,0.72)',
      borderRadius: scaleCssPxList(style.borderRadius, styleScale, '3px'),
      padding: scaleCssPxList(style.padding, styleScale, '3px 6px'),
      fontFamily: style.fontFamily || "'Microsoft YaHei','SimHei',sans-serif",
    };
  }

  const fallbackRect = {
    left: Math.max(8, dream.cx - dream.width * 0.82),
    right: Math.max(8, dream.cx - dream.width * 0.82) + 82,
    top: Math.max(8, dream.cy - dream.height * 0.38),
    bottom: Math.max(8, dream.cy - dream.height * 0.38) + 16,
    width: 82,
    height: 16,
  };
  return {
    rect: fallbackRect,
    text: '',
    lines: [],
    color: 'rgba(194,255,255,0.9)',
    borderColor: 'rgba(116,226,238,0.7)',
    background: 'rgba(6,18,28,0.72)',
    borderRadius: '3px',
    padding: '3px 6px',
    fontFamily: "'Microsoft YaHei','SimHei',sans-serif",
  };
}

function getEllipseTangentPoint(point, dream, preferUpper) {
  const px = (point.x - dream.cx) / dream.rx;
  const py = (point.y - dream.cy) / dream.ry;
  const d2 = px * px + py * py;
  if (d2 <= 1.0001) {
    return { x: dream.cx - dream.rx, y: dream.cy + (preferUpper ? -dream.ry * 0.58 : dream.ry * 0.58) };
  }
  const root = Math.sqrt(d2 - 1);
  const candidates = [-1, 1].map((sign) => {
    const ux = (px - sign * py * root) / d2;
    const uy = (py + sign * px * root) / d2;
    return {
      x: dream.cx + ux * dream.rx,
      y: dream.cy + uy * dream.ry,
    };
  });
  return candidates.sort((a, b) => preferUpper ? a.y - b.y : b.y - a.y)[0];
}

function getDreamTangents(source, dream) {
  const a = getEllipseTangentPoint(source.a, dream, true);
  const b = getEllipseTangentPoint(source.b, dream, false);
  return { a, b, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

function formatSvgPoints(points) {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

export function CthRlyehDreamOverlay({ anim, exiting }) {
  const targetPid = anim?.targetPid ?? 0;
  const [beam, setBeam] = React.useState(null);
  const filterId = React.useId().replace(/:/g, '');

  React.useLayoutEffect(() => {
    const measure = () => {
      const dream = getDreamFrame();
      const sourceInfo = getBeamSourceInfo(targetPid, dream);
      const r = sourceInfo.rect;
      const sourceEllipse = getSourceEllipse(r);
      const tangentBeam = getCommonExternalEllipseTangents(sourceEllipse, dream);
      const source = tangentBeam?.source || getFacingRectEdge(r, dream.cx, dream.cy);
      const target = tangentBeam?.target || getDreamTangents(source, dream);
      setBeam({
        source,
        sourceClipRect: r,
        sourceText: sourceInfo.text,
        sourceLines: sourceInfo.lines,
        sourceColor: sourceInfo.color,
        sourceBorderColor: sourceInfo.borderColor,
        sourceBackground: sourceInfo.background,
        sourceBorderRadius: sourceInfo.borderRadius,
        sourcePadding: sourceInfo.padding,
        sourceFontFamily: sourceInfo.fontFamily,
        targetA: target.a,
        targetB: target.b,
        targetMid: target.mid,
        dream,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [targetPid]);

  return (
    <div
      className="cth-rlyeh-dream"
      style={{ animation: exiting ? 'cthDreamExit .22s ease-in forwards' : undefined }}
      aria-hidden
    >
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <clipPath id={`${filterId}-blob-a`} clipPathUnits="objectBoundingBox">
          <path d="M0.045,0.55 C0.025,0.43 0.075,0.34 0.155,0.305 C0.145,0.175 0.3,0.12 0.405,0.15 C0.48,0.045 0.68,0.065 0.72,0.18 C0.84,0.14 0.95,0.27 0.925,0.405 C0.985,0.5 0.925,0.63 0.845,0.635 C0.855,0.785 0.7,0.87 0.585,0.825 C0.49,0.96 0.31,0.925 0.29,0.785 C0.15,0.795 0.08,0.68 0.045,0.55 Z">
            <animate attributeName="d" dur="3.4s" repeatCount="indefinite"
              values="
                M0.045,0.55 C0.025,0.43 0.075,0.34 0.155,0.305 C0.145,0.175 0.3,0.12 0.405,0.15 C0.48,0.045 0.68,0.065 0.72,0.18 C0.84,0.14 0.95,0.27 0.925,0.405 C0.985,0.5 0.925,0.63 0.845,0.635 C0.855,0.785 0.7,0.87 0.585,0.825 C0.49,0.96 0.31,0.925 0.29,0.785 C0.15,0.795 0.08,0.68 0.045,0.55 Z;
                M0.065,0.495 C0.035,0.38 0.115,0.29 0.2,0.31 C0.17,0.17 0.35,0.075 0.455,0.13 C0.555,0.035 0.715,0.1 0.725,0.245 C0.865,0.19 0.965,0.355 0.895,0.47 C0.975,0.57 0.875,0.705 0.765,0.68 C0.76,0.825 0.575,0.915 0.49,0.815 C0.38,0.93 0.22,0.84 0.235,0.71 C0.105,0.695 0.09,0.59 0.065,0.495 Z;
                M0.035,0.565 C0.065,0.45 0.045,0.335 0.17,0.27 C0.18,0.135 0.325,0.145 0.38,0.205 C0.465,0.055 0.645,0.045 0.76,0.155 C0.81,0.25 0.945,0.255 0.91,0.405 C0.99,0.505 0.94,0.66 0.82,0.655 C0.83,0.79 0.665,0.845 0.565,0.79 C0.49,0.965 0.285,0.91 0.305,0.765 C0.16,0.83 0.07,0.705 0.035,0.565 Z;
                M0.045,0.55 C0.025,0.43 0.075,0.34 0.155,0.305 C0.145,0.175 0.3,0.12 0.405,0.15 C0.48,0.045 0.68,0.065 0.72,0.18 C0.84,0.14 0.95,0.27 0.925,0.405 C0.985,0.5 0.925,0.63 0.845,0.635 C0.855,0.785 0.7,0.87 0.585,0.825 C0.49,0.96 0.31,0.925 0.29,0.785 C0.15,0.795 0.08,0.68 0.045,0.55 Z" />
          </path>
        </clipPath>
        <clipPath id={`${filterId}-blob-b`} clipPathUnits="objectBoundingBox">
          <path d="M0.025,0.54 C0.045,0.37 0.085,0.25 0.22,0.255 C0.225,0.085 0.425,0.085 0.485,0.155 C0.59,0.04 0.795,0.125 0.81,0.265 C0.955,0.255 0.98,0.45 0.91,0.54 C0.965,0.68 0.79,0.825 0.66,0.755 C0.56,0.94 0.36,0.91 0.325,0.765 C0.165,0.82 0.065,0.68 0.025,0.54 Z">
            <animate attributeName="d" dur="3.9s" repeatCount="indefinite"
              values="
                M0.025,0.54 C0.045,0.37 0.085,0.25 0.22,0.255 C0.225,0.085 0.425,0.085 0.485,0.155 C0.59,0.04 0.795,0.125 0.81,0.265 C0.955,0.255 0.98,0.45 0.91,0.54 C0.965,0.68 0.79,0.825 0.66,0.755 C0.56,0.94 0.36,0.91 0.325,0.765 C0.165,0.82 0.065,0.68 0.025,0.54 Z;
                M0.055,0.48 C0.02,0.34 0.155,0.22 0.25,0.29 C0.26,0.12 0.455,0.045 0.535,0.165 C0.635,0.075 0.82,0.18 0.79,0.335 C0.945,0.36 0.94,0.56 0.84,0.625 C0.905,0.78 0.71,0.885 0.61,0.765 C0.485,0.91 0.285,0.85 0.305,0.705 C0.145,0.745 0.09,0.6 0.055,0.48 Z;
                M0.025,0.54 C0.045,0.37 0.085,0.25 0.22,0.255 C0.225,0.085 0.425,0.085 0.485,0.155 C0.59,0.04 0.795,0.125 0.81,0.265 C0.955,0.255 0.98,0.45 0.91,0.54 C0.965,0.68 0.79,0.825 0.66,0.755 C0.56,0.94 0.36,0.91 0.325,0.765 C0.165,0.82 0.065,0.68 0.025,0.54 Z" />
          </path>
        </clipPath>
        <filter id={`${filterId}-distort`} x="-14%" y="-14%" width="128%" height="128%">
          <feTurbulence type="fractalNoise" baseFrequency="0.01 0.03" numOctaves="3" seed="27" result="noise">
            <animate attributeName="baseFrequency" dur="2.8s" values="0.009 0.026;0.017 0.038;0.011 0.03" repeatCount="indefinite" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="10" xChannelSelector="R" yChannelSelector="G">
            <animate attributeName="scale" dur="2.6s" values="5;12;8;10" repeatCount="indefinite" />
          </feDisplacementMap>
        </filter>
        <filter id={`${filterId}-edge`} x="-24%" y="-24%" width="148%" height="148%">
          <feTurbulence type="fractalNoise" baseFrequency="0.018 0.055" numOctaves="4" seed="71" result="edgeNoise">
            <animate attributeName="baseFrequency" dur="3.2s" values="0.014 0.045;0.026 0.064;0.018 0.055" repeatCount="indefinite" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="edgeNoise" scale="28" xChannelSelector="R" yChannelSelector="B">
            <animate attributeName="scale" dur="3s" values="16;34;22;28" repeatCount="indefinite" />
          </feDisplacementMap>
        </filter>
      </svg>
      <style>{`
        .cth-rlyeh-dream {
          position: fixed;
          inset: 0;
          z-index: 1840;
          pointer-events: none;
          overflow: hidden;
          background:
            radial-gradient(circle at 50% 50%, rgba(7,45,62,0.24), rgba(2,8,16,0.68) 58%, rgba(0,0,0,0.2));
          animation: cthDreamStage 2.35s cubic-bezier(.16,.84,.2,1) both;
        }
        .cth-rlyeh-dream__beam-svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          overflow: visible;
          mix-blend-mode: screen;
        }
        .cth-rlyeh-dream__beam-soft {
          opacity: 0;
          filter: blur(11px) saturate(1.35);
          animation: cthDreamBeam 1.48s ease-out .06s both;
        }
        .cth-rlyeh-dream__beam-body {
          opacity: 0;
          filter: blur(2px) saturate(1.18);
          animation: cthDreamBeam 1.34s ease-out .08s both;
        }
        .cth-rlyeh-dream__source-panel-glow {
          opacity: 0;
          filter: blur(8px) saturate(1.3);
          animation: cthDreamSourcePanel 1.55s ease-out .04s both;
        }
        .cth-rlyeh-dream__source-panel {
          opacity: 0;
          animation: cthDreamSourcePanel 1.55s ease-out .04s both;
        }
        .cth-rlyeh-dream__source-panel-html {
          box-sizing: border-box;
          width: 100%;
          height: 100%;
          overflow: hidden;
          border: 1px solid rgba(172,252,255,0.62);
          border-radius: 3px;
          background: rgba(4,12,22,0.62);
          box-shadow:
            0 0 18px rgba(134,239,255,0.42),
            inset 0 0 18px rgba(160,244,255,0.14);
          color: rgba(215,255,255,0.94);
          font-family: 'Microsoft YaHei','SimHei',sans-serif;
          text-shadow: 0 0 8px rgba(144,245,255,0.8), 0 0 6px #000;
          white-space: normal;
          mix-blend-mode: screen;
        }
        .cth-rlyeh-dream__source-panel-line {
          display: block;
          overflow: hidden;
          text-overflow: clip;
          white-space: nowrap;
        }
        .cth-rlyeh-dream__window {
          position: absolute;
          left: 50%;
          top: 50%;
          width: min(48vw, 620px);
          height: min(43vh, 430px);
          transform: translate(-50%, -50%);
          opacity: 0;
          overflow: visible;
          filter: drop-shadow(0 0 42px rgba(116,226,238,0.48));
          animation: cthDreamWindow 2.1s cubic-bezier(.16,.86,.18,1) .18s both;
        }
        .cth-rlyeh-dream__window::before {
          content: "";
          position: absolute;
          inset: -28%;
          background: radial-gradient(ellipse at 50% 50%, rgba(160,250,255,0.24), rgba(82,203,226,0.12) 32%, transparent 66%);
          filter: blur(18px);
          mix-blend-mode: screen;
          animation: cthDreamBeamBloom 2.1s ease-in-out both;
        }
        .cth-rlyeh-dream__image {
          position: absolute;
          inset: -3%;
          z-index: 1;
          clip-path: url(#${filterId}-blob-a);
          background-image:
            radial-gradient(circle at 48% 44%, rgba(118,241,242,0.09), transparent 34%),
            linear-gradient(180deg, rgba(0,12,20,0.02), rgba(0,4,12,0.16)),
            url("${DREAM_IMAGE}");
          background-size: cover;
          background-position: center;
          transform: scale(1.03);
          filter: url(#${filterId}-distort) contrast(1.08) brightness(.96) saturate(1.12);
          -webkit-mask-image: radial-gradient(ellipse at 50% 50%, #000 0%, #000 56%, rgba(0,0,0,.82) 68%, rgba(0,0,0,.32) 82%, transparent 94%);
          mask-image: radial-gradient(ellipse at 50% 50%, #000 0%, #000 56%, rgba(0,0,0,.82) 68%, rgba(0,0,0,.32) 82%, transparent 94%);
          animation: cthDreamDrift 2.5s ease-in-out both;
        }
        .cth-rlyeh-dream__edge {
          position: absolute;
          inset: -16%;
          z-index: 3;
          clip-path: url(#${filterId}-blob-b);
          background:
            radial-gradient(ellipse at 16% 44%, rgba(124,231,232,0.34), transparent 25%),
            radial-gradient(ellipse at 82% 38%, rgba(99,200,220,0.3), transparent 24%),
            radial-gradient(ellipse at 56% 86%, rgba(48,165,196,0.24), transparent 28%),
            radial-gradient(ellipse at 36% 13%, rgba(169,255,247,0.22), transparent 26%);
          filter: url(#${filterId}-edge) blur(18px);
          mix-blend-mode: screen;
          opacity: .78;
          -webkit-mask-image: radial-gradient(ellipse at 50% 50%, transparent 0%, transparent 52%, rgba(0,0,0,.7) 67%, #000 78%, transparent 93%);
          mask-image: radial-gradient(ellipse at 50% 50%, transparent 0%, transparent 52%, rgba(0,0,0,.7) 67%, #000 78%, transparent 93%);
          animation: cthDreamEdgeSwim 3.2s ease-in-out infinite;
        }
        .cth-rlyeh-dream__edge-cloud {
          position: absolute;
          z-index: 4;
          left: calc(var(--x) * 1%);
          top: calc(var(--y) * 1%);
          width: calc(var(--w) * 1%);
          height: calc(var(--h) * 1%);
          transform: translate(-50%, -50%) rotate(calc(var(--rot) * 1deg));
          border-radius: 48% 52% 44% 56% / 54% 42% 58% 46%;
          background:
            radial-gradient(ellipse at 46% 48%, rgba(159,252,250,0.28), rgba(76,196,218,0.16) 42%, transparent 72%);
          filter: url(#${filterId}-edge) blur(13px);
          mix-blend-mode: screen;
          opacity: .7;
          animation: cthDreamEdgeCloud calc(var(--dur) * 1s) ease-in-out calc(var(--delay) * 1s) infinite alternate;
        }
        .cth-rlyeh-dream__caustics {
          position: absolute;
          inset: -3%;
          z-index: 5;
          clip-path: url(#${filterId}-blob-a);
          background:
            repeating-radial-gradient(ellipse at 46% 56%, rgba(122,236,240,0.12) 0 1px, transparent 2px 14px),
            linear-gradient(112deg, transparent 0%, rgba(98,219,230,0.11) 42%, transparent 60%);
          mix-blend-mode: screen;
          filter: blur(1px);
          -webkit-mask-image: radial-gradient(ellipse at 50% 50%, #000 0%, #000 55%, rgba(0,0,0,.45) 78%, transparent 92%);
          mask-image: radial-gradient(ellipse at 50% 50%, #000 0%, #000 55%, rgba(0,0,0,.45) 78%, transparent 92%);
          animation: cthDreamCaustics 1.65s linear infinite;
        }
        .cth-rlyeh-dream__bubble {
          position: absolute;
          left: calc(50% + var(--x) * 1%);
          top: calc(50% + var(--y) * 1%);
          width: calc(var(--s) * 1px);
          height: calc(var(--s) * 1px);
          border-radius: 50%;
          border: 1px solid rgba(198,252,255,0.48);
          background: radial-gradient(circle at 35% 28%, rgba(255,255,255,0.74), rgba(142,235,244,0.2) 32%, rgba(34,154,190,0.04) 70%);
          box-shadow: 0 0 10px rgba(104,220,237,0.34);
          opacity: 0;
          animation: cthDreamBubble calc(var(--dur) * 1s) ease-out calc(var(--delay) * 1s) both;
        }
        @keyframes cthDreamStage {
          0% { opacity: 0; }
          16%, 78% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes cthDreamExit {
          to { opacity: 0; filter: blur(8px); }
        }
        @keyframes cthDreamBeam {
          0% { opacity: 0; }
          28% { opacity: .95; }
          78% { opacity: .52; }
          100% { opacity: 0; }
        }
        @keyframes cthDreamSourcePanel {
          0% { opacity: 0; }
          18%, 78% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes cthDreamWindow {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(.72) rotate(-1.6deg); filter: drop-shadow(0 0 36px rgba(52,184,212,0.22)) brightness(.68); }
          20% { opacity: .96; }
          54% { opacity: 1; transform: translate(-50%, -50%) scale(1.02) rotate(.4deg); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.16) rotate(1.2deg); filter: drop-shadow(0 0 64px rgba(52,184,212,0.28)) brightness(.78); }
        }
        @keyframes cthDreamBeamBloom {
          0% { opacity: 0; transform: scale(.74); }
          24% { opacity: .9; transform: scale(1.02); }
          76% { opacity: .62; }
          100% { opacity: 0; transform: scale(1.18); }
        }
        @keyframes cthDreamDrift {
          0% { transform: scale(1.065) translate3d(-1.2%, 1%, 0); }
          55% { transform: scale(1.025) translate3d(1%, -0.6%, 0); }
          100% { transform: scale(1.07) translate3d(1.7%, -1.3%, 0); }
        }
        @keyframes cthDreamEdgeSwim {
          0% { opacity: .5; transform: scale(.98) rotate(-2deg) translate3d(-1.2%, .8%, 0); }
          48% { opacity: .85; transform: scale(1.04) rotate(2.4deg) translate3d(1.4%, -1%, 0); }
          100% { opacity: .58; transform: scale(1.01) rotate(-1deg) translate3d(.8%, 1.1%, 0); }
        }
        @keyframes cthDreamEdgeCloud {
          0% {
            opacity: .38;
            transform: translate(-50%, -50%) rotate(calc(var(--rot) * 1deg)) scale(.82, .9);
            border-radius: 48% 52% 44% 56% / 54% 42% 58% 46%;
          }
          100% {
            opacity: .78;
            transform: translate(-50%, -50%) rotate(calc((var(--rot) + 18) * 1deg)) scale(1.18, 1.05);
            border-radius: 58% 42% 54% 46% / 43% 57% 39% 61%;
          }
        }
        @keyframes cthDreamCaustics {
          from { transform: translate3d(-2%, 1%, 0) rotate(0deg); opacity: .2; }
          50% { opacity: .5; }
          to { transform: translate3d(2%, -2%, 0) rotate(3deg); opacity: .22; }
        }
        @keyframes cthDreamBubble {
          0% { opacity: 0; transform: translate3d(0, 0, 0) scale(.34); }
          14% { opacity: .74; }
          100% { opacity: 0; transform: translate3d(calc(var(--dx) * 1vw), -68vh, 0) scale(1.35); }
        }
      `}</style>
      {beam && (
        <svg
          className="cth-rlyeh-dream__beam-svg"
          viewBox={`0 0 ${beam.viewportWidth} ${beam.viewportHeight}`}
          preserveAspectRatio="none"
        >
          <defs>
            <mask
              id={`${filterId}-beam-source-mask`}
              maskUnits="userSpaceOnUse"
              x="0"
              y="0"
              width={beam.viewportWidth}
              height={beam.viewportHeight}
            >
              <rect x="0" y="0" width={beam.viewportWidth} height={beam.viewportHeight} fill="white" />
              <rect
                x={beam.sourceClipRect.left}
                y={beam.sourceClipRect.top}
                width={beam.sourceClipRect.width}
                height={beam.sourceClipRect.height}
                rx="3"
                ry="3"
                fill="black"
              />
            </mask>
            <linearGradient
              id={`${filterId}-beam-gradient`}
              gradientUnits="userSpaceOnUse"
              x1={beam.source.mid.x}
              y1={beam.source.mid.y}
              x2={beam.targetMid.x}
              y2={beam.targetMid.y}
            >
              <stop offset="0%" stopColor="rgba(184,252,255,0.82)" />
              <stop offset="42%" stopColor="rgba(85,203,230,0.34)" />
              <stop offset="100%" stopColor="rgba(124,228,238,0.08)" />
            </linearGradient>
          </defs>
          <polygon
            className="cth-rlyeh-dream__beam-soft"
            points={formatSvgPoints([beam.source.a, beam.targetA, beam.targetB, beam.source.b])}
            fill={`url(#${filterId}-beam-gradient)`}
            mask={`url(#${filterId}-beam-source-mask)`}
          />
          <polygon
            className="cth-rlyeh-dream__beam-body"
            points={formatSvgPoints([beam.source.a, beam.targetA, beam.targetB, beam.source.b])}
            fill={`url(#${filterId}-beam-gradient)`}
            mask={`url(#${filterId}-beam-source-mask)`}
          />
          <rect
            className="cth-rlyeh-dream__source-panel-glow"
            x={beam.sourceClipRect.left - 2}
            y={beam.sourceClipRect.top - 2}
            width={beam.sourceClipRect.width + 4}
            height={beam.sourceClipRect.height + 4}
            rx="4"
            ry="4"
            fill="rgba(155,246,255,0.42)"
          />
          <foreignObject
            className="cth-rlyeh-dream__source-panel"
            x={beam.sourceClipRect.left}
            y={beam.sourceClipRect.top}
            width={beam.sourceClipRect.width}
            height={beam.sourceClipRect.height}
          >
            <div
              xmlns="http://www.w3.org/1999/xhtml"
              className="cth-rlyeh-dream__source-panel-html"
              style={{
                color: beam.sourceColor,
                borderColor: beam.sourceBorderColor,
                backgroundColor: beam.sourceBackground,
                borderRadius: beam.sourceBorderRadius,
                padding: beam.sourcePadding,
                fontFamily: beam.sourceFontFamily,
              }}
            >
              {(beam.sourceLines?.length ? beam.sourceLines : [{ text: beam.sourceText, color: beam.sourceColor }]).map((line, index) => (
                <div
                  key={index}
                  className="cth-rlyeh-dream__source-panel-line"
                  style={{
                    color: line.color || beam.sourceColor,
                    fontFamily: line.fontFamily || beam.sourceFontFamily,
                    fontSize: line.fontSize,
                    fontStyle: line.fontStyle,
                    fontWeight: line.fontWeight,
                    letterSpacing: line.letterSpacing,
                    lineHeight: line.lineHeight,
                    marginTop: index === 0 ? 0 : line.marginTop,
                    textShadow: [
                      line.textShadow && line.textShadow !== 'none' ? line.textShadow : null,
                      '0 0 8px rgba(144,245,255,0.82)',
                      '0 0 14px rgba(80,210,255,0.5)',
                      '0 0 6px #000',
                    ].filter(Boolean).join(', '),
                  }}
                >
                  {line.text}
                </div>
              ))}
            </div>
          </foreignObject>
        </svg>
      )}
      <div
        className="cth-rlyeh-dream__window"
        style={beam ? { width: beam.dream.width, height: beam.dream.height } : undefined}
      >
        <div className="cth-rlyeh-dream__edge" />
        {EDGE_CLOUDS.map((cloud, index) => (
          <span
            key={index}
            className="cth-rlyeh-dream__edge-cloud"
            style={{
              '--x': cloud.x,
              '--y': cloud.y,
              '--w': cloud.w,
              '--h': cloud.h,
              '--delay': cloud.delay,
              '--dur': cloud.dur,
              '--rot': cloud.rot,
            }}
          />
        ))}
        <div className="cth-rlyeh-dream__image" />
        <div className="cth-rlyeh-dream__caustics" />
      </div>
      {BUBBLES.map((bubble, index) => (
        <span
          key={index}
          className="cth-rlyeh-dream__bubble"
          style={{
            '--x': bubble.x,
            '--y': bubble.y,
            '--dx': bubble.dx,
            '--s': bubble.size,
            '--delay': bubble.delay,
            '--dur': bubble.dur,
          }}
        />
      ))}
    </div>
  );
}
