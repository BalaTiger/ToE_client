import React from 'react';
import { _getZoomCompensatedRect } from '../../utils/dom';
import {
  createEffectNoiseOrigin,
  createEffectNoiseSampler,
  drawNoiseDisplacedCoverImage,
  loadEffectImage,
  loadEffectNoiseTexture,
} from './effectNoise';

const DREAM_IMAGE_PATH = 'img/effects/R’lyeh_dream.png';
const DREAM_WIDTH_RATIO = 0.48;
const DREAM_HEIGHT_RATIO = 0.43;
const DREAM_MAX_WIDTH = 620;
const DREAM_MAX_HEIGHT = 430;
const DREAM_EDGE_CANVAS_SCALE = 2.2;
const DREAM_CORE_MASK = `
  radial-gradient(ellipse 39% 34% at 51% 50%, #000 0%, #000 56%, rgba(0,0,0,.64) 67%, rgba(0,0,0,.08) 80%, transparent 91%),
  radial-gradient(ellipse 20% 24% at 23% 48%, #000 0%, #000 43%, rgba(0,0,0,.52) 61%, rgba(0,0,0,.07) 77%, transparent 88%),
  radial-gradient(ellipse 24% 19% at 36% 30%, #000 0%, #000 39%, rgba(0,0,0,.46) 59%, rgba(0,0,0,.06) 77%, transparent 88%),
  radial-gradient(ellipse 21% 25% at 58% 23%, #000 0%, #000 41%, rgba(0,0,0,.48) 60%, rgba(0,0,0,.06) 78%, transparent 89%),
  radial-gradient(ellipse 25% 21% at 77% 46%, #000 0%, #000 42%, rgba(0,0,0,.5) 61%, rgba(0,0,0,.07) 79%, transparent 90%),
  radial-gradient(ellipse 24% 18% at 65% 75%, #000 0%, #000 39%, rgba(0,0,0,.46) 59%, rgba(0,0,0,.055) 76%, transparent 87%),
  radial-gradient(ellipse 20% 19% at 39% 78%, #000 0%, #000 39%, rgba(0,0,0,.44) 58%, rgba(0,0,0,.05) 75%, transparent 86%)
`;
const DREAM_CAUSTIC_BANDS = [
  { y: 0.18, amp: 0.032, tilt: -0.028, freqA: 2.1, freqB: 5.9, phase: 0.2, speed: 0.82, width: 0.012, alpha: 0.25 },
  { y: 0.3, amp: 0.042, tilt: 0.04, freqA: 2.7, freqB: 6.2, phase: 1.5, speed: -0.64, width: 0.016, alpha: 0.34 },
  { y: 0.43, amp: 0.038, tilt: -0.052, freqA: 3.4, freqB: 7.6, phase: 2.7, speed: 0.7, width: 0.014, alpha: 0.31 },
  { y: 0.56, amp: 0.048, tilt: 0.024, freqA: 2.45, freqB: 8.4, phase: 4.1, speed: -0.76, width: 0.018, alpha: 0.4 },
  { y: 0.69, amp: 0.036, tilt: -0.038, freqA: 3.0, freqB: 6.8, phase: 5.4, speed: 0.58, width: 0.014, alpha: 0.3 },
];
const DREAM_CAUSTIC_ARCS = [
  { x: 0.2, y: 0.32, w: 0.22, h: 0.11, rot: -0.18, phase: 0.4, alpha: 0.16 },
  { x: 0.42, y: 0.23, w: 0.27, h: 0.14, rot: 0.2, phase: 1.7, alpha: 0.15 },
  { x: 0.66, y: 0.38, w: 0.3, h: 0.13, rot: -0.26, phase: 2.6, alpha: 0.18 },
  { x: 0.76, y: 0.59, w: 0.24, h: 0.15, rot: 0.24, phase: 3.8, alpha: 0.15 },
  { x: 0.45, y: 0.72, w: 0.34, h: 0.12, rot: -0.12, phase: 4.5, alpha: 0.2 },
];
const BUBBLES = [
  { x: -0.72, y: -0.7, dx: -7.8, dy: -5.4, size: 4, end: 3.2, blur: 2.5, delay: 0.02, dur: 1.28, sway: -0.7 },
  { x: -0.69, y: -0.73, dx: -8.6, dy: -5.8, size: 6, end: 5.1, blur: 2.1, delay: 0.16, dur: 1.42, sway: 0.5 },
  { x: -0.66, y: -0.69, dx: -7.2, dy: -5.0, size: 3, end: 4.0, blur: 2.8, delay: 0.29, dur: 1.18, sway: -0.3 },
  { x: -0.62, y: -0.72, dx: -9.4, dy: -6.1, size: 8, end: 6.6, blur: 1.9, delay: 0.42, dur: 1.5, sway: 0.8, front: true },
  { x: 0.04, y: -1.04, dx: 0.6, dy: -8.4, size: 5, end: 2.7, blur: 2.4, delay: 0.04, dur: 1.58 },
  { x: 0.14, y: -1.0, dx: 1.9, dy: -7.5, size: 11, end: 4.9, blur: 1.7, delay: 0.24, dur: 1.7, front: true },
  { x: 0.31, y: -0.95, dx: 4.6, dy: -7.1, size: 4, end: 5.8, blur: 2.6, delay: 0.58, dur: 1.24 },
  { x: 0.9, y: -0.35, dx: 10.8, dy: -3.0, size: 6, end: 3.8, blur: 2.0, delay: 0.08, dur: 1.44, sway: 0.9 },
  { x: 0.94, y: -0.27, dx: 12.6, dy: -2.2, size: 9, end: 7.1, blur: 1.8, delay: 0.2, dur: 1.34, sway: -0.4, front: true },
  { x: 0.98, y: -0.2, dx: 11.4, dy: -1.7, size: 5, end: 4.5, blur: 2.2, delay: 0.34, dur: 1.2, sway: 0.2 },
  { x: 0.88, y: 0.34, dx: 10.6, dy: 3.2, size: 7, end: 4.0, blur: 2.1, delay: 0.46, dur: 1.62, sway: -0.9 },
  { x: 0.56, y: 0.78, dx: 7.6, dy: 7.0, size: 13, end: 3.4, blur: 1.5, delay: 0.12, dur: 1.82 },
  { x: 0.5, y: 0.83, dx: 6.7, dy: 8.5, size: 5, end: 7.8, blur: 2.6, delay: 0.36, dur: 1.36, front: true },
  { x: 0.42, y: 0.89, dx: 5.2, dy: 9.2, size: 10, end: 5.3, blur: 1.8, delay: 0.5, dur: 1.48 },
  { x: -0.12, y: 1.03, dx: -1.5, dy: 9.8, size: 4, end: 6.4, blur: 2.9, delay: 0.1, dur: 1.22 },
  { x: -0.18, y: 1.0, dx: -2.8, dy: 10.6, size: 15, end: 4.6, blur: 1.4, delay: 0.28, dur: 1.74, front: true },
  { x: -0.25, y: 0.96, dx: -3.8, dy: 8.8, size: 6, end: 8.9, blur: 2.8, delay: 0.52, dur: 1.3, front: true },
  { x: -0.86, y: 0.36, dx: -10.2, dy: 3.5, size: 5, end: 3.6, blur: 2.3, delay: 0.18, dur: 1.68 },
  { x: -0.9, y: 0.26, dx: -11.8, dy: 2.4, size: 12, end: 6.9, blur: 1.7, delay: 0.4, dur: 1.38, sway: 0.6, front: true },
  { x: -0.96, y: 0.18, dx: -12.5, dy: 1.6, size: 4, end: 5.0, blur: 2.7, delay: 0.55, dur: 1.15, sway: -0.8 },
  { x: -0.98, y: -0.08, dx: -10.4, dy: -0.8, size: 7, end: 2.6, blur: 2.2, delay: 0.7, dur: 1.78 },
  { x: -0.34, y: -0.95, dx: -4.1, dy: -7.4, size: 18, end: 7.4, blur: 2.3, delay: 0.32, dur: 1.2, front: true },
  { x: 0.73, y: 0.58, dx: 12.4, dy: 8.6, size: 20, end: 3.1, blur: 2.0, delay: 0.62, dur: 1.46, front: true },
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

function clamp01(value) {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function interpolateKeyframes(frames, progress) {
  if (progress <= frames[0].t) return frames[0].value;
  for (let i = 1; i < frames.length; i += 1) {
    const prev = frames[i - 1];
    const next = frames[i];
    if (progress <= next.t) {
      const local = (progress - prev.t) / (next.t - prev.t);
      const eased = 1 - Math.pow(1 - local, 3);
      return prev.value + (next.value - prev.value) * eased;
    }
  }
  return frames[frames.length - 1].value;
}

function getBubbleFrame(bubble, index, progress, width, height) {
  const sway = bubble.sway ?? ((index % 3) - 1);
  const twist = (index % 2 === 0 ? -1 : 1) * (18 + (index % 5) * 9);
  const startX = width / 2 + bubble.x * Math.min(width * 0.225, 292);
  const startY = height / 2 + bubble.y * Math.min(height * 0.185, 188);
  const x = startX + interpolateKeyframes([
    { t: 0, value: 0 },
    { t: 0.24, value: (bubble.dx * 0.2 + sway * 0.28) * width * 0.01 },
    { t: 0.45, value: (bubble.dx * 0.56 - sway * 0.42) * width * 0.01 },
    { t: 0.66, value: (bubble.dx * 0.95 + sway * 0.34) * width * 0.01 },
    { t: 0.84, value: (bubble.dx * 1.26 - sway * 0.2) * width * 0.01 },
    { t: 1, value: bubble.dx * 1.48 * width * 0.01 },
  ], progress);
  const y = startY + interpolateKeyframes([
    { t: 0, value: 0 },
    { t: 0.24, value: (bubble.dy * 0.17 - sway * 0.1) * height * 0.01 },
    { t: 0.45, value: (bubble.dy * 0.51 + sway * 0.16) * height * 0.01 },
    { t: 0.66, value: (bubble.dy * 0.86 - sway * 0.12) * height * 0.01 },
    { t: 0.84, value: (bubble.dy * 1.14 + sway * 0.08) * height * 0.01 },
    { t: 1, value: bubble.dy * 1.34 * height * 0.01 },
  ], progress);
  const scale = interpolateKeyframes([
    { t: 0, value: 0.055 },
    { t: 0.24, value: bubble.end * 0.13 },
    { t: 0.45, value: bubble.end * 0.3 },
    { t: 0.66, value: bubble.end * 0.68 },
    { t: 0.84, value: bubble.end * 1.08 },
    { t: 1, value: bubble.end * 1.45 },
  ], progress);
  const opacity = interpolateKeyframes([
    { t: 0, value: 0 },
    { t: 0.09, value: 0.1 + (bubble.front ? 0.04 : 0) },
    { t: 0.24, value: 0.19 + (bubble.front ? 0.07 : 0) },
    { t: 0.45, value: 0.27 + (bubble.front ? 0.1 : 0) },
    { t: 0.66, value: 0.24 + (bubble.front ? 0.08 : 0) },
    { t: 0.84, value: 0.13 + (bubble.front ? 0.06 : 0) },
    { t: 1, value: 0 },
  ], progress);
  const wobble = Math.sin((progress * Math.PI * 2.4) + index) * 0.075;
  return {
    x,
    y,
    radius: Math.max(0.4, bubble.size * scale * 0.5),
    opacity,
    twist: (twist * Math.PI / 180) * (0.15 + progress * 0.42),
    stretchX: 1 + wobble,
    stretchY: 1 - wobble * 0.65,
  };
}

function drawCanvasBubble(ctx, frame, bubble) {
  if (frame.opacity <= 0.002 || frame.radius <= 0.5) return;
  const radius = frame.radius;
  ctx.save();
  ctx.globalAlpha = frame.opacity;
  ctx.translate(frame.x, frame.y);
  ctx.rotate(frame.twist);
  ctx.scale(frame.stretchX, frame.stretchY);

  const shell = ctx.createRadialGradient(-radius * 0.28, -radius * 0.32, radius * 0.08, 0, 0, radius);
  shell.addColorStop(0, 'rgba(255,255,255,0.34)');
  shell.addColorStop(0.18, 'rgba(191,249,255,0.08)');
  shell.addColorStop(0.56, 'rgba(72,215,236,0.025)');
  shell.addColorStop(0.72, 'rgba(225,255,255,0.15)');
  shell.addColorStop(1, 'rgba(120,234,246,0.02)');
  ctx.fillStyle = shell;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = bubble.front ? 1.15 : 0.8;
  ctx.strokeStyle = bubble.front ? 'rgba(226,255,255,0.34)' : 'rgba(215,253,255,0.25)';
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = Math.max(0.7, radius * 0.075);
  ctx.strokeStyle = 'rgba(235,255,255,0.42)';
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.78, Math.PI * 1.1, Math.PI * 1.48);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.58)';
  ctx.beginPath();
  ctx.ellipse(-radius * 0.34, -radius * 0.34, radius * 0.15, radius * 0.1, -0.55, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawSoftEllipse(ctx, x, y, rx, ry, rotation, innerColor, outerColor) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(rx, ry);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  gradient.addColorStop(0, innerColor);
  gradient.addColorStop(0.48, outerColor);
  gradient.addColorStop(1, 'rgba(80,220,230,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function makeDreamEdgePath(ctx, cx, cy, rx, ry, time, wobbleScale = 1) {
  const points = 92;
  ctx.beginPath();
  for (let i = 0; i <= points; i += 1) {
    const angle = (i / points) * Math.PI * 2;
    const warp = 1
      + Math.sin(angle * 3.1 + time * 1.1) * 0.052 * wobbleScale
      + Math.sin(angle * 6.7 - time * 0.85) * 0.036 * wobbleScale
      + Math.sin(angle * 11.3 + time * 0.48) * 0.022 * wobbleScale;
    const x = cx + Math.cos(angle) * rx * warp;
    const y = cy + Math.sin(angle) * ry * warp;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawDreamEdgeCanvas(ctx, width, height, time) {
  const innerWidth = width / DREAM_EDGE_CANVAS_SCALE;
  const innerHeight = height / DREAM_EDGE_CANVAS_SCALE;
  const edgePad = (DREAM_EDGE_CANVAS_SCALE - 1) / 2;
  const cx = width / 2;
  const cy = height / 2;
  const rx = innerWidth * 0.49;
  const ry = innerHeight * 0.44;
  const pulse = 0.5 + 0.5 * Math.sin(time * 1.9);

  ctx.clearRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'lighter';

  drawSoftEllipse(
    ctx,
    cx,
    cy,
    rx * (1.22 + pulse * 0.05),
    ry * (1.2 + pulse * 0.04),
    Math.sin(time * 0.55) * 0.08,
    'rgba(128,244,246,0.11)',
    'rgba(65,188,218,0.055)',
  );

  EDGE_CLOUDS.forEach((cloud, index) => {
    const drift = time * (0.42 + index * 0.035) + cloud.delay;
    const x = (edgePad + cloud.x / 100) * innerWidth + Math.sin(drift * 1.7) * innerWidth * 0.018;
    const y = (edgePad + cloud.y / 100) * innerHeight + Math.cos(drift * 1.45) * innerHeight * 0.015;
    const cloudRx = innerWidth * cloud.w * 0.009 * (1.12 + 0.12 * Math.sin(drift));
    const cloudRy = innerHeight * cloud.h * 0.01 * (1.06 + 0.1 * Math.cos(drift * 1.2));
    drawSoftEllipse(
      ctx,
      x,
      y,
      cloudRx * 1.9,
      cloudRy * 1.9,
      (cloud.rot + Math.sin(drift) * 12) * Math.PI / 180,
      index % 2
        ? 'rgba(158,255,250,0.22)'
        : 'rgba(92,218,232,0.2)',
      'rgba(75,196,222,0.08)',
    );
  });

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  [
    { width: 18, alpha: 0.016 },
    { width: 9, alpha: 0.026 },
    { width: 3.5, alpha: 0.04 },
  ].forEach((stroke, index) => {
    makeDreamEdgePath(ctx, cx, cy, rx * (1.012 + index * 0.014), ry * (1.005 + index * 0.012), time + index * 0.4, 1);
    ctx.strokeStyle = `rgba(140,248,250,${stroke.alpha})`;
    ctx.lineWidth = stroke.width;
    ctx.stroke();
  });

  makeDreamEdgePath(ctx, cx, cy, rx * 0.972, ry * 0.948, time * 0.66, 0.5);
  ctx.strokeStyle = `rgba(58,220,236,${0.105 + pulse * 0.03})`;
  ctx.lineWidth = 16;
  ctx.stroke();

  makeDreamEdgePath(ctx, cx, cy, rx * 0.965, ry * 0.941, time * 0.68, 0.47);
  ctx.strokeStyle = `rgba(126,248,255,${0.2 + pulse * 0.05})`;
  ctx.lineWidth = 7;
  ctx.stroke();

  makeDreamEdgePath(ctx, cx, cy, rx * 0.958, ry * 0.934, time * 0.7, 0.44);
  ctx.save();
  ctx.shadowColor = 'rgba(126,248,255,0.72)';
  ctx.shadowBlur = 12;
  ctx.strokeStyle = `rgba(238,255,255,${0.9 + pulse * 0.08})`;
  ctx.lineWidth = 2.7;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.72)';
  ctx.lineWidth = 1.15;
  ctx.stroke();
  ctx.restore();

  makeDreamEdgePath(ctx, cx, cy, rx * 0.925, ry * 0.902, time * 0.76, 0.36);
  ctx.strokeStyle = 'rgba(122,242,248,0.18)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  ctx.globalCompositeOperation = 'source-over';
}

function drawCausticCurve(ctx, points) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i += 1) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
}

function drawDreamCausticsTexture(ctx, width, height, time) {
  ctx.clearRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const shimmer = 0.72 + Math.sin(time * 4.6) * 0.14 + Math.sin(time * 7.1) * 0.05;
  const driftX = Math.sin(time * 0.47) * width * 0.014;
  const driftY = Math.cos(time * 0.38) * height * 0.01;

  DREAM_CAUSTIC_BANDS.forEach((band, index) => {
    const points = [];
    const steps = 28;
    const phase = band.phase + time * band.speed;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const local = t * Math.PI * 2;
      const cross = t - 0.5;
      const x = width * (-0.08 + t * 1.16) + driftX * (1 + index * 0.05);
      const wave = Math.sin(local * band.freqA + phase) * band.amp
        + Math.sin(local * band.freqB - phase * 0.72) * band.amp * 0.42
        + Math.sin(local * 10.4 + phase * 1.35) * band.amp * 0.13;
      const y = height * (band.y + wave + cross * band.tilt) + driftY;
      points.push({ x, y });
    }

    const bandWidth = Math.max(3, height * band.width);
    drawCausticCurve(ctx, points);
    ctx.strokeStyle = `rgba(48,177,205,${0.16 * band.alpha * shimmer})`;
    ctx.lineWidth = bandWidth * 2.8;
    ctx.stroke();

    drawCausticCurve(ctx, points);
    ctx.strokeStyle = `rgba(202,255,248,${0.34 * band.alpha * shimmer})`;
    ctx.lineWidth = Math.max(0.75, bandWidth * 0.4);
    ctx.stroke();
  });

  DREAM_CAUSTIC_ARCS.forEach((arc, index) => {
    const pulse = 0.72 + 0.28 * Math.sin(time * (1.55 + index * 0.17) + arc.phase);
    const cx = width * (arc.x + Math.sin(time * 0.32 + arc.phase) * 0.014);
    const cy = height * (arc.y + Math.cos(time * 0.28 + arc.phase) * 0.011);
    const rx = width * arc.w * (0.72 + pulse * 0.18);
    const ry = height * arc.h * (0.7 + pulse * 0.2);
    const start = Math.PI * (0.12 + 0.08 * Math.sin(time + arc.phase));
    const end = Math.PI * (0.82 + 0.1 * Math.cos(time * 0.8 + arc.phase));

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(arc.rot + Math.sin(time * 0.36 + arc.phase) * 0.1);
    ctx.scale(1, 0.74 + Math.sin(time * 0.45 + arc.phase) * 0.07);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, start, end);
    ctx.strokeStyle = `rgba(76,215,230,${arc.alpha * 0.28 * pulse})`;
    ctx.lineWidth = Math.max(2.4, height * 0.008);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 0.98, ry * 0.94, 0, start + 0.04, end - 0.03);
    ctx.strokeStyle = `rgba(232,255,252,${arc.alpha * 0.38 * pulse})`;
    ctx.lineWidth = Math.max(0.65, height * 0.0024);
    ctx.stroke();
    ctx.restore();
  });

  ctx.globalCompositeOperation = 'source-over';
}

function drawDreamBackgroundCanvas(ctx, width, height, time, image, sampler, causticSampler, causticCanvas) {
  ctx.clearRect(0, 0, width, height);

  drawNoiseDisplacedCoverImage(ctx, image, sampler, width, height, time, {
    cols: 20,
    rows: 15,
    strength: Math.min(width, height) * 0.027,
    baseAlpha: 0.42,
    displacedAlpha: 0.96,
    overlap: 2,
  });

  if (causticCanvas) {
    const textureWidth = Math.max(1, Math.round(width * 0.62));
    const textureHeight = Math.max(1, Math.round(height * 0.62));
    if (causticCanvas.width !== textureWidth || causticCanvas.height !== textureHeight) {
      causticCanvas.width = textureWidth;
      causticCanvas.height = textureHeight;
    }
    const causticCtx = causticCanvas.getContext('2d', { alpha: true });
    drawDreamCausticsTexture(causticCtx, textureWidth, textureHeight, time);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    drawNoiseDisplacedCoverImage(ctx, causticCanvas, causticSampler, width, height, time * 1.12, {
      cols: 16,
      rows: 12,
      strength: Math.min(width, height) * 0.018,
      baseAlpha: 0,
      displacedAlpha: 0.74,
      overlap: 1.5,
    });
    ctx.restore();
  }

  const pulse = 0.5 + 0.5 * Math.sin(time * 2.2);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  let wash = ctx.createRadialGradient(width * 0.48, height * 0.44, 0, width * 0.5, height * 0.5, Math.max(width, height) * 0.62);
  wash.addColorStop(0, `rgba(118,246,244,${0.1 + pulse * 0.035})`);
  wash.addColorStop(0.38, 'rgba(62,198,218,0.052)');
  wash.addColorStop(1, 'rgba(24,120,160,0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);

  ctx.globalCompositeOperation = 'source-over';
  const shade = ctx.createLinearGradient(0, 0, 0, height);
  shade.addColorStop(0, 'rgba(0,12,20,0.02)');
  shade.addColorStop(0.62, 'rgba(0,8,16,0.08)');
  shade.addColorStop(1, 'rgba(0,3,11,0.18)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

export function CthRlyehDreamOverlay({ anim, exiting }) {
  const targetPid = anim?.targetPid ?? 0;
  const [beam, setBeam] = React.useState(null);
  const bubbleCanvasRef = React.useRef(null);
  const dreamImageCanvasRef = React.useRef(null);
  const dreamEdgeCanvasRef = React.useRef(null);
  const dreamNoiseOriginRef = React.useRef(null);
  const dreamCausticNoiseOriginRef = React.useRef(null);
  const dreamCausticTextureRef = React.useRef(null);
  const filterId = React.useId().replace(/:/g, '');

  if (!dreamNoiseOriginRef.current) {
    dreamNoiseOriginRef.current = createEffectNoiseOrigin();
  }
  if (!dreamCausticNoiseOriginRef.current) {
    dreamCausticNoiseOriginRef.current = createEffectNoiseOrigin();
  }

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

  React.useEffect(() => {
    const canvas = bubbleCanvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !ctx) return undefined;

    let frameId = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    const startedAt = performance.now();
    const maxDuration = Math.max(...BUBBLES.map(bubble => bubble.delay + bubble.dur)) * 1000 + 120;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.35);
      canvas.width = Math.ceil(width * dpr);
      canvas.height = Math.ceil(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now) => {
      const elapsed = now - startedAt;
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';
      BUBBLES.forEach((bubble, index) => {
        const progress = clamp01((elapsed / 1000 - bubble.delay) / bubble.dur);
        if (progress <= 0 || progress >= 1) return;
        drawCanvasBubble(ctx, getBubbleFrame(bubble, index, progress, width, height), bubble);
      });
      ctx.globalCompositeOperation = 'source-over';
      if (elapsed < maxDuration) frameId = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener('resize', resize);
    frameId = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(frameId);
    };
  }, []);

  React.useEffect(() => {
    const canvas = dreamEdgeCanvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !ctx) return undefined;

    let frameId = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let lastDraw = 0;
    const startedAt = performance.now();
    const maxDuration = 2550;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 1.05);
      canvas.width = Math.ceil(width * dpr);
      canvas.height = Math.ceil(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now) => {
      const elapsed = now - startedAt;
      if (now - lastDraw >= 33 || lastDraw === 0) {
        lastDraw = now;
        drawDreamEdgeCanvas(ctx, width, height, elapsed / 1000);
      }
      if (elapsed < maxDuration) frameId = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener('resize', resize);
    frameId = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(frameId);
    };
  }, [beam?.dream?.width, beam?.dream?.height]);

  React.useEffect(() => {
    const canvas = dreamImageCanvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !ctx) return undefined;

    let frameId = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let lastDraw = 0;
    const startedAt = performance.now();
    const maxDuration = 2550;
    let disposed = false;
    let image = null;
    let sampler = null;
    let causticSampler = null;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 1.05);
      canvas.width = Math.ceil(width * dpr);
      canvas.height = Math.ceil(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (now) => {
      const elapsed = now - startedAt;
      if (now - lastDraw >= 33 || lastDraw === 0) {
        lastDraw = now;
        drawDreamBackgroundCanvas(
          ctx,
          width,
          height,
          elapsed / 1000,
          image,
          sampler,
          causticSampler,
          dreamCausticTextureRef.current,
        );
      }
      if (elapsed < maxDuration) frameId = requestAnimationFrame(draw);
    };

    window.addEventListener('resize', resize);
    Promise.all([
      loadEffectImage(DREAM_IMAGE_PATH),
      loadEffectNoiseTexture(),
    ]).then(([loadedImage, noiseTexture]) => {
      if (disposed) return;
      image = loadedImage;
      sampler = createEffectNoiseSampler(noiseTexture, {
        origin: dreamNoiseOriginRef.current,
        scale: 1.12,
        velocity: { x: 0.052, y: -0.034 },
      });
      causticSampler = createEffectNoiseSampler(noiseTexture, {
        origin: dreamCausticNoiseOriginRef.current,
        scale: 1.5,
        velocity: { x: -0.068, y: 0.046 },
      });
      dreamCausticTextureRef.current = dreamCausticTextureRef.current || document.createElement('canvas');
      resize();
      frameId = requestAnimationFrame(draw);
    }).catch(() => {
      if (!disposed) resize();
    });

    return () => {
      disposed = true;
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(frameId);
    };
  }, [beam?.dream?.width, beam?.dream?.height]);

  return (
    <div
      className="cth-rlyeh-dream"
      style={{ animation: exiting ? 'cthDreamExit .22s ease-in forwards' : undefined }}
      aria-hidden
    >
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
        .cth-rlyeh-dream__image-canvas {
          position: absolute;
          inset: -8%;
          width: 116%;
          height: 116%;
          z-index: 1;
          transform: scale(1.03);
          filter: contrast(1.08) brightness(.96) saturate(1.12) blur(.18px);
          -webkit-mask-image: ${DREAM_CORE_MASK};
          mask-image: ${DREAM_CORE_MASK};
          -webkit-mask-size: 100% 100%;
          mask-size: 100% 100%;
          -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
          animation: cthDreamDrift 2.5s ease-in-out both;
        }
        .cth-rlyeh-dream__edge-canvas {
          position: absolute;
          inset: -60%;
          width: 220%;
          height: 220%;
          z-index: 3;
          mix-blend-mode: screen;
          opacity: .92;
        }
        .cth-rlyeh-dream__bubble-canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 8;
          mix-blend-mode: screen;
          opacity: .92;
        }
        @keyframes cthDreamStage {
          0% { opacity: 0; }
          16%, 100% { opacity: 1; }
        }
        @keyframes cthDreamExit {
          from { opacity: 1; filter: blur(0); }
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
          0% { transform: scale(1.075) translate3d(-1.8%, 1.2%, 0) rotate(-.35deg); }
          32% { transform: scale(1.035) translate3d(.8%, -.9%, 0) rotate(.18deg); }
          68% { transform: scale(1.065) translate3d(2.1%, .5%, 0) rotate(-.12deg); }
          100% { transform: scale(1.09) translate3d(2.6%, -1.7%, 0) rotate(.32deg); }
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
        <canvas ref={dreamEdgeCanvasRef} className="cth-rlyeh-dream__edge-canvas" />
        <canvas ref={dreamImageCanvasRef} className="cth-rlyeh-dream__image-canvas" />
      </div>
      <canvas ref={bubbleCanvasRef} className="cth-rlyeh-dream__bubble-canvas" />
    </div>
  );
}
