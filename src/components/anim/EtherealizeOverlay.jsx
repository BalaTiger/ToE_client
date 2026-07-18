import React from 'react';
import { _getZoomCompensatedRect } from '../../utils/dom';

const SLICE_COUNT = 6;
const PARTICLES_PER_SLICE = 30;
const CHARGE_PARTICLE_COUNT = 34;
const SNAP_PARTICLE_COUNT = 46;
const BURST_PARTICLE_COUNT = 54;
const BURST_SMOKE_COUNT = 16;
const THEME_VAR_NAMES = [
  '--toe-bg',
  '--toe-text',
  '--toe-strong',
  '--toe-muted',
  '--toe-panel',
  '--toe-panel-active',
  '--toe-line',
  '--toe-line-dim',
  '--toe-glow',
  '--toe-accent',
];

function makeRand(seed) {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    state ^= state >>> 16;
    return (state >>> 0) / 4294967296;
  };
}

function getPanelElement(actorIdx) {
  const root = document.querySelector(`[data-pid="${actorIdx}"]`);
  if (!root) return null;
  if (actorIdx === 0) return root;
  return root.firstElementChild || root;
}

function getEtherealizeBadgeElement(actorIdx) {
  return document.querySelector(`[data-etherealize-badge="${actorIdx}"]`);
}

function readThemeVars(el) {
  const root = el?.closest?.('.toe-battle-root') || document.querySelector('.toe-battle-root') || el;
  if (!root || typeof window === 'undefined') return {};
  const computed = window.getComputedStyle(root);
  const vars = THEME_VAR_NAMES.reduce((acc, name) => {
    const value = computed.getPropertyValue(name).trim();
    if (value) acc[name] = value;
    return acc;
  }, {});
  if (computed.color) vars.color = computed.color;
  if (computed.fontFamily) vars.fontFamily = computed.fontFamily;
  return vars;
}

function makeDissolveMaskVars(sliceIndex, stackCount) {
  const rand = makeRand(0xd1550a + sliceIndex * 131 + (stackCount || 0) * 29);
  const x0 = Math.round(rand() * 256);
  const y0 = Math.round(rand() * 256);
  const dx = Math.round((rand() - 0.5) * 180);
  const dy = Math.round((rand() - 0.5) * 180);
  return {
    '--noise-x0': `${x0}px`,
    '--noise-y0': `${y0}px`,
    '--noise-x35': `${Math.round(x0 + dx * 0.35)}px`,
    '--noise-y35': `${Math.round(y0 + dy * 0.35)}px`,
    '--noise-x68': `${Math.round(x0 + dx * 0.68)}px`,
    '--noise-y68': `${Math.round(y0 + dy * 0.68)}px`,
    '--noise-x100': `${x0 + dx}px`,
    '--noise-y100': `${y0 + dy}px`,
    '--noise-x125': `${Math.round(x0 + dx * 1.25)}px`,
    '--noise-y125': `${Math.round(y0 + dy * 1.25)}px`,
    '--dissolve-angle': `${130 + (rand() - 0.5) * 16}deg`,
  };
}

function makeSliceOffsets(rect, vw, vh, targetScale) {
  const scaledWidth = rect.width * targetScale;
  const scaledHeight = rect.height * targetScale;
  const hoverLeft = vw * 0.5 - scaledWidth / 2;
  const hoverTop = vh * 0.42 - scaledHeight / 2;
  const edgePad = Math.max(18, Math.min(34, vw * 0.026));
  const leftRoom = Math.max(180, (hoverLeft - edgePad) / targetScale);
  const rightRoom = Math.max(180, (vw - edgePad - (hoverLeft + scaledWidth)) / targetScale);
  const topRoom = Math.max(80, (hoverTop - edgePad) / targetScale);
  const bottomRoom = Math.max(80, (vh - edgePad - (hoverTop + scaledHeight)) / targetScale);
  const farX = Math.max(280, Math.min(680, Math.min(leftRoom, rightRoom)));
  const farY = Math.max(70, Math.min(220, Math.min(topRoom, bottomRoom, farX * 0.3)));
  const farZ = Math.max(420, Math.min(760, Math.min(vw, vh) * 0.82));
  return Array.from({ length: SLICE_COUNT }, (_, index) => {
    const signed = SLICE_COUNT <= 1 ? 0 : (index - (SLICE_COUNT - 1) / 2) / ((SLICE_COUNT - 1) / 2);
    const magnitude = Math.pow(Math.abs(signed), 1.06);
    const offset = Math.sign(signed) * magnitude;
    return {
      x: farX * offset,
      y: farY * offset,
      z: farZ * offset,
    };
  });
}

function makeChargeParticles(rect, stackCount) {
  const rand = makeRand(0xcca6e0 + (stackCount || 0) * 43);
  return Array.from({ length: CHARGE_PARTICLE_COUNT }, (_, i) => {
    const side = Math.floor(rand() * 4);
    const edgePad = 8 + rand() * 26;
    const x = side === 0 ? -edgePad : side === 1 ? rect.width + edgePad : rand() * rect.width;
    const y = side === 2 ? -edgePad : side === 3 ? rect.height + edgePad : rand() * rect.height;
    const tx = rect.width * (0.45 + (rand() - 0.5) * 0.26) - x;
    const ty = rect.height * (0.43 + (rand() - 0.5) * 0.26) - y;
    const size = Math.max(2, Math.min(5, rect.width * (0.008 + rand() * 0.01)));
    return {
      id: `charge-${i}`,
      x,
      y,
      tx,
      ty,
      size,
      delay: 0.42 + rand() * 0.2,
      color: rand() > 0.35 ? 'rgba(201,239,255,0.9)' : 'rgba(117,179,235,0.78)',
    };
  });
}

function normalizeVector(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

function makeBurstAxis(sliceOffsets) {
  const last = sliceOffsets?.[sliceOffsets.length - 1] || { x: 1, y: 0.25, z: 1.4 };
  return normalizeVector(last);
}

function makeNormalTangents(axis) {
  const tangentA = normalizeVector({ x: -axis.y, y: axis.x, z: 0.08 });
  const tangentB = normalizeVector({
    x: axis.y * tangentA.z - axis.z * tangentA.y,
    y: axis.z * tangentA.x - axis.x * tangentA.z,
    z: axis.x * tangentA.y - axis.y * tangentA.x,
  });
  return { tangentA, tangentB };
}

function makeSnapParticles(rect, stackCount, sliceOffsets) {
  const rand = makeRand(0x5a9f01 + (stackCount || 0) * 53);
  const axis = makeBurstAxis(sliceOffsets);
  const { tangentA, tangentB } = makeNormalTangents(axis);
  return Array.from({ length: SNAP_PARTICLE_COUNT }, (_, i) => {
    const side = i % 2 === 0 ? 1 : -1;
    const dist = 180 + Math.pow(rand(), 0.8) * 460;
    const spread = Math.pow(rand(), 3.4) * (10 + rand() * 38);
    const twist = rand() * Math.PI * 2;
    const tangentX = Math.cos(twist) * tangentA.x + Math.sin(twist) * tangentB.x;
    const tangentY = Math.cos(twist) * tangentA.y + Math.sin(twist) * tangentB.y;
    const tangentZ = Math.cos(twist) * tangentA.z + Math.sin(twist) * tangentB.z;
    const centerJitter = 0.035;
    const size = Math.max(2, Math.min(8, rect.width * (0.01 + rand() * 0.019)));
    return {
      id: `snap-${i}`,
      x: rect.width * (0.5 + (rand() - 0.5) * centerJitter),
      y: rect.height * (0.5 + (rand() - 0.5) * centerJitter),
      dx: axis.x * dist * side + tangentX * spread,
      dy: axis.y * dist * side + tangentY * spread,
      dz: axis.z * dist * side + tangentZ * spread,
      size,
      rotX: Math.round(rand() * 360 - 180),
      rotY: Math.round(rand() * 360 - 180),
      delay: 1.69 + rand() * 0.025,
      color: rand() > 0.32 ? 'rgba(238,253,255,1)' : 'rgba(136,207,255,0.96)',
    };
  });
}

function makeBurstParticles(rect, stackCount, sliceOffsets) {
  const rand = makeRand(0xb1257a + (stackCount || 0) * 59);
  const axis = makeBurstAxis(sliceOffsets);
  const { tangentA, tangentB } = makeNormalTangents(axis);
  return Array.from({ length: BURST_PARTICLE_COUNT }, (_, i) => {
    const side = i % 2 === 0 ? 1 : -1;
    const dist = 120 + Math.pow(rand(), 0.72) * 330;
    const spread = Math.pow(rand(), 2.25) * (46 + rand() * 120);
    const twist = rand() * Math.PI * 2;
    const x = rect.width * (0.48 + (rand() - 0.5) * 0.26);
    const y = rect.height * (0.42 + (rand() - 0.5) * 0.26);
    const tangentX = Math.cos(twist) * tangentA.x + Math.sin(twist) * tangentB.x;
    const tangentY = Math.cos(twist) * tangentA.y + Math.sin(twist) * tangentB.y;
    const tangentZ = Math.cos(twist) * tangentA.z + Math.sin(twist) * tangentB.z;
    const dx = axis.x * dist * side + tangentX * spread;
    const dy = axis.y * dist * side + tangentY * spread;
    const dz = axis.z * dist * side + tangentZ * spread;
    const size = Math.max(2, Math.min(7, rect.width * (0.009 + rand() * 0.017)));
    return {
      id: `burst-${i}`,
      x,
      y,
      dx,
      dy,
      dz,
      size,
      rotX: Math.round(rand() * 420 - 210),
      rotY: Math.round(rand() * 420 - 210),
      delay: 1.86 + rand() * 0.08,
      color: rand() > 0.42 ? 'rgba(225,250,255,0.96)' : 'rgba(129,198,255,0.84)',
    };
  });
}

function makeBurstSmoke(rect, stackCount, sliceOffsets) {
  const rand = makeRand(0x5a10ce + (stackCount || 0) * 67);
  const axis = makeBurstAxis(sliceOffsets);
  const { tangentA, tangentB } = makeNormalTangents(axis);
  return Array.from({ length: BURST_SMOKE_COUNT }, (_, i) => {
    const side = i % 2 === 0 ? 1 : -1;
    const dist = 76 + rand() * 210;
    const spread = Math.pow(rand(), 1.8) * (36 + rand() * 92);
    const twist = rand() * Math.PI * 2;
    const tangentX = Math.cos(twist) * tangentA.x + Math.sin(twist) * tangentB.x;
    const tangentY = Math.cos(twist) * tangentA.y + Math.sin(twist) * tangentB.y;
    const tangentZ = Math.cos(twist) * tangentA.z + Math.sin(twist) * tangentB.z;
    const size = Math.max(28, Math.min(86, rect.width * (0.13 + rand() * 0.18)));
    return {
      id: `smoke-${i}`,
      x: rect.width * (0.48 + (rand() - 0.5) * 0.18),
      y: rect.height * (0.44 + (rand() - 0.5) * 0.18),
      dx: axis.x * dist * side + tangentX * spread,
      dy: axis.y * dist * side + tangentY * spread,
      dz: axis.z * dist * side + tangentZ * spread,
      size,
      delay: 1.9 + rand() * 0.12,
      rot: Math.round(rand() * 220 - 110),
    };
  });
}

function makeParticles(rect, stackCount) {
  const rand = makeRand(0x51ee7a + (stackCount || 0) * 37);
  return Array.from({ length: SLICE_COUNT }).flatMap((_, sliceIndex) =>
    Array.from({ length: PARTICLES_PER_SLICE }, (_, i) => {
      const sliceSigned = SLICE_COUNT <= 1 ? 0 : (sliceIndex - (SLICE_COUNT - 1) / 2) / ((SLICE_COUNT - 1) / 2);
      const progress = 0.18 + Math.pow(rand(), 0.82) * 0.72;
      const edgeT = rand();
      const topReach = (0.16 + progress * 0.86) * rect.width;
      const leftReach = (0.16 + progress * 0.86) * rect.height;
      const edgeNoise = Math.max(5, Math.min(20, rect.width * (0.035 + rand() * 0.035)));
      const x = Math.max(0, Math.min(rect.width, topReach * edgeT + (rand() - 0.5) * edgeNoise));
      const y = Math.max(0, Math.min(rect.height, leftReach * (1 - edgeT) + (rand() - 0.5) * edgeNoise));
      const axisPush = Math.sign(sliceSigned || (rand() - 0.5)) || 1;
      const dx = axisPush * (80 + rand() * 190) + (rand() - 0.5) * 92;
      const dy = axisPush * (22 + rand() * 90) + (rand() - 0.5) * 126;
      const dz = axisPush * (80 + rand() * 230);
      const size = Math.max(3, Math.min(11, rect.width * (0.016 + rand() * 0.026)));
      return {
        id: `${sliceIndex}-${i}`,
        sliceIndex,
        x,
        y,
        dx,
        dy,
        dz,
        size,
        rotX: Math.round(rand() * 360 - 180),
        rotY: Math.round(rand() * 420 - 210),
        delay: 1.95 + sliceIndex * 0.055 + progress * 0.34 + rand() * 0.05,
        color: rand() > 0.28 ? 'rgba(226,250,255,0.98)' : 'rgba(119,190,255,0.94)',
      };
    })
  );
}

function EtherealizeGainAnim({ anim, exiting }) {
  const actorIdx = anim?.actorIdx ?? 0;
  const stackCount = Math.max(1, anim?.stackCount || 1);
  const [snapshot, setSnapshot] = React.useState(null);
  const [released, setReleased] = React.useState(false);
  const restorePanelRef = React.useRef(null);
  const releaseAtMs = React.useMemo(() => {
    const timeline = Array.isArray(anim?.visualTimeline) ? anim.visualTimeline : [];
    const finalPatchAt = timeline.reduce((max, item) => Math.max(max, item?.atMs || 0), 0);
    return finalPatchAt > 0 ? finalPatchAt : 3600;
  }, [anim?.visualTimeline]);

  const restorePanel = React.useCallback(() => {
    restorePanelRef.current?.();
    restorePanelRef.current = null;
  }, []);

  React.useLayoutEffect(() => {
    let rafId = 0;
    const measure = () => {
      const el = getPanelElement(actorIdx);
      const rect = _getZoomCompensatedRect(el);
      if (!el || !rect) return;
      const html = el.outerHTML;
      const vw = window.innerWidth || 1280;
      const vh = window.innerHeight || 720;
      const targetScale = Math.min(1.18, Math.max(0.86, Math.min(vw * 0.34 / rect.width, vh * 0.42 / rect.height)));
      const hoverX = vw * 0.5 - (rect.left + rect.width / 2);
      const hoverY = vh * 0.42 - (rect.top + rect.height / 2);
      const sliceOffsets = makeSliceOffsets(rect, vw, vh, targetScale);
      const measured = {
        rect,
        html,
        themeVars: readThemeVars(el),
        targetScale,
        hoverX,
        hoverY,
        sliceOffsets,
        chargeParticles: makeChargeParticles(rect, stackCount),
        snapParticles: makeSnapParticles(rect, stackCount, sliceOffsets),
        burstParticles: makeBurstParticles(rect, stackCount, sliceOffsets),
        burstSmoke: makeBurstSmoke(rect, stackCount, sliceOffsets),
        particles: makeParticles(rect, stackCount),
        dissolveMasks: Array.from({ length: SLICE_COUNT }, (_, index) => makeDissolveMaskVars(index, stackCount)),
      };
      setSnapshot(measured);
      const prevVisibility = el.style.visibility;
      el.style.visibility = 'hidden';
      restorePanelRef.current = () => {
        el.style.visibility = prevVisibility;
      };
    };
    rafId = requestAnimationFrame(() => {
      rafId = requestAnimationFrame(measure);
    });
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      restorePanel();
    };
  }, [actorIdx, restorePanel, stackCount]);

  React.useEffect(() => {
    setReleased(false);
  }, [actorIdx, stackCount, releaseAtMs]);

  React.useEffect(() => {
    if (!snapshot) return undefined;
    const timer = setTimeout(() => {
      restorePanel();
      setReleased(true);
    }, Math.max(0, releaseAtMs));
    return () => clearTimeout(timer);
  }, [releaseAtMs, restorePanel, snapshot]);

  React.useEffect(() => {
    if (!exiting) return;
    restorePanel();
    setReleased(true);
  }, [exiting, restorePanel]);

  if (!snapshot) return null;
  const { rect } = snapshot;
  const slices = Array.from({ length: SLICE_COUNT }, (_, index) => index);

  return (
    <div
      className={`etherealize-overlay${exiting ? ' etherealize-exiting' : ''}${released ? ' etherealize-released' : ''}`}
      style={snapshot.themeVars}
      aria-hidden
    >
      <div
        className="etherealize-backlight"
        style={{
          left: rect.left + rect.width / 2 + snapshot.hoverX,
          top: rect.top + rect.height / 2 + snapshot.hoverY,
          width: Math.max(rect.width, rect.height) * 1.15,
          height: Math.max(rect.width, rect.height) * 1.15,
        }}
      />
      <div
        className="etherealize-stage"
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          '--ethereal-hover-x': `${snapshot.hoverX}px`,
          '--ethereal-hover-y': `${snapshot.hoverY}px`,
          '--ethereal-scale': snapshot.targetScale,
          '--ethereal-scale-in': snapshot.targetScale * 0.98,
          '--ethereal-scale-burst': snapshot.targetScale * 1.03,
        }}
      >
        <div className="etherealize-stack">
          {slices.map(index => (
            <div
              key={index}
              className="etherealize-slice"
              style={{
                '--slice-index': index,
                '--slice-z': `${snapshot.sliceOffsets[index].z}px`,
                '--slice-x': `${snapshot.sliceOffsets[index].x}px`,
                '--slice-y': `${snapshot.sliceOffsets[index].y}px`,
                '--slice-delay': `${1.95 + index * 0.06}s`,
                '--slice-alpha': 1 - index * 0.07,
                '--slice-alpha-mid': (1 - index * 0.07) * 0.8,
                '--slice-alpha-low': (1 - index * 0.07) * 0.27,
                '--slice-bright': 1.04 + index * 0.045,
                ...snapshot.dissolveMasks[index],
              }}
            >
              <div
                className="etherealize-panel-html"
                dangerouslySetInnerHTML={{ __html: snapshot.html }}
              />
            </div>
          ))}
          <div className="etherealize-unified-panel">
            <div
              className="etherealize-panel-html"
              dangerouslySetInnerHTML={{ __html: snapshot.html }}
            />
          </div>
          {snapshot.chargeParticles.map(particle => (
            <div
              key={particle.id}
              className="etherealize-charge-particle"
              style={{
                left: particle.x,
                top: particle.y,
                width: particle.size,
                height: particle.size,
                background: particle.color,
                '--charge-tx': `${particle.tx}px`,
                '--charge-ty': `${particle.ty}px`,
                '--charge-delay': `${particle.delay}s`,
              }}
            />
          ))}
          {snapshot.burstParticles.map(particle => (
            <div
              key={particle.id}
              className="etherealize-burst-particle"
              style={{
                left: particle.x,
                top: particle.y,
                width: particle.size,
                height: particle.size,
                background: particle.color,
                '--burst-dx': `${particle.dx}px`,
                '--burst-dy': `${particle.dy}px`,
                '--burst-dz': `${particle.dz}px`,
                '--burst-rx': `${particle.rotX}deg`,
                '--burst-ry': `${particle.rotY}deg`,
                '--burst-delay': `${particle.delay}s`,
              }}
            />
          ))}
          {snapshot.snapParticles.map(particle => (
            <div
              key={particle.id}
              className="etherealize-snap-particle"
              style={{
                left: particle.x,
                top: particle.y,
                width: particle.size,
                height: particle.size,
                background: particle.color,
                '--snap-dx': `${particle.dx}px`,
                '--snap-dy': `${particle.dy}px`,
                '--snap-dz': `${particle.dz}px`,
                '--snap-rx': `${particle.rotX}deg`,
                '--snap-ry': `${particle.rotY}deg`,
                '--snap-delay': `${particle.delay}s`,
              }}
            />
          ))}
          {snapshot.burstSmoke.map(smoke => (
            <div
              key={smoke.id}
              className="etherealize-burst-smoke"
              style={{
                left: smoke.x,
                top: smoke.y,
                width: smoke.size,
                height: smoke.size,
                '--smoke-dx': `${smoke.dx}px`,
                '--smoke-dy': `${smoke.dy}px`,
                '--smoke-dz': `${smoke.dz}px`,
                '--smoke-rot': `${smoke.rot}deg`,
                '--smoke-delay': `${smoke.delay}s`,
              }}
            />
          ))}
          {snapshot.particles.map(particle => (
            <div
              key={particle.id}
              className="etherealize-cube"
              style={{
                left: particle.x,
                top: particle.y,
                width: particle.size,
                height: particle.size,
                background: particle.color,
                '--cube-dx': `${particle.dx}px`,
                '--cube-dy': `${particle.dy}px`,
                '--cube-dz': `${particle.dz}px`,
                '--cube-dx-mid': `${particle.dx * 0.86}px`,
                '--cube-dy-mid': `${particle.dy * 0.86}px`,
                '--cube-dz-mid': `${particle.dz * 0.86}px`,
                '--cube-rx': `${particle.rotX}deg`,
                '--cube-ry': `${particle.rotY}deg`,
                '--cube-rx-mid': `${particle.rotX * 0.75}deg`,
                '--cube-ry-mid': `${particle.rotY * 0.75}deg`,
                '--cube-delay': `${particle.delay}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// 消耗 1 层虚化时，在虚化标签上方跳出 "-1" 浮动字样（标签层数变化由 statePatch 驱动，
// 层数变化本身会触发标签内置的 chevron 重播动画）
function EtherealizeConsumeAnim({ anim }) {
  const targetIdx = anim?.targetIdx ?? 0;
  const [anchor, setAnchor] = React.useState(null);

  React.useLayoutEffect(() => {
    let rafId = 0;
    const measure = () => {
      const el = getEtherealizeBadgeElement(targetIdx) || getPanelElement(targetIdx);
      if (!el) return;
      const rect = _getZoomCompensatedRect(el);
      if (!rect) return;
      setAnchor({ cx: rect.left + rect.width / 2, top: rect.top });
    };
    rafId = requestAnimationFrame(() => {
      rafId = requestAnimationFrame(measure);
    });
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [targetIdx]);

  if (!anchor) return null;
  return (
    <div
      className="etherealize-consume-float"
      style={{ left: anchor.cx, top: anchor.top }}
      aria-hidden
    >
      -1
    </div>
  );
}

export { EtherealizeGainAnim, EtherealizeConsumeAnim };
