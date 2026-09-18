import { useEffect, useRef } from 'react';
import { buildPublicUrl } from '../../utils/url';
import { SAILING_WET_ARTWORK, SAILING_WET_COVERAGE } from '../../constants/theme';
import { createWetPlan, remainingWetDrying, staticWetRegions, WET_REGIONS } from './sailingWetTimeline';
import './sailing-wet-surface.css';

const publicPath = path => typeof window === 'undefined' ? path : buildPublicUrl(path);
const asset = path => `url('${publicPath(path)}')`;
const snapshot = node => {
  const style = getComputedStyle(node);
  return { opacity: Number.parseFloat(style.opacity) || 0, maskImage: style.maskImage,
    maskPosition: style.maskPosition, clipPath: style.clipPath };
};

// Masks only blend registered dry/wet artwork; no new water material is drawn.
// Three complementary regions have independent arrival and drying histories.
export function SailingWetSurface({ surface, active = false, paused = false, style }) {
  const hostRef = useRef(null);
  const runsRef = useRef([]);
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
    for (const run of runsRef.current) {
      const animation = run?.animation;
      if (!animation || animation.playState === 'finished') continue;
      if (paused) animation.pause();
      else animation.play();
    }
  }, [paused]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const nodes = [...host.querySelectorAll('[data-sailing-wet-region]')];
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const paths = SAILING_WET_COVERAGE[surface].map(publicPath);
    // Randomize once per exploration, never on rerender, pause or drying.
    const plan = active ? createWetPlan(surface, paths, getComputedStyle(nodes[0]).maskImage) : null;
    let firstUpdate = true;
    const update = () => {
      // Snapshot all regions before cancelling, including their shrink boundary.
      const displayed = nodes.map(snapshot);
      const previousRuns = runsRef.current;
      const remaining = previousRuns.map(run => run && remainingWetDrying(run, Number(run.animation?.currentTime) || 0));
      previousRuns.forEach(run => run?.animation?.cancel());
      runsRef.current = [];
      nodes.forEach((node, index) => {
        const current = displayed[index];
        Object.assign(node.style, current);
        if (motion?.matches || !node.animate) {
          if (active && firstUpdate) {
            const peak = plan.regions[index].frames.find(frame => frame.opacity > .5);
            Object.assign(node.style, { maskImage: peak.maskImage, clipPath: peak.clipPath,
              maskPosition: peak.maskPosition, opacity: .14 });
          } else node.style.opacity = active ? Math.min(current.opacity, .14) : 0;
          return;
        }
        if (!active && current.opacity === 0) return;
        const dry = remaining[index] || remainingWetDrying();
        const frames = active ? plan.regions[index].frames
          : [current, { ...current, opacity: 0, clipPath: dry.closedClip }];
        const duration = active ? plan.duration : dry.duration;
        const animation = node.animate(frames, { duration, iterations: 1, easing: 'linear', fill: 'forwards' });
        animation.id = `toe-sailing-wet-${surface}-${WET_REGIONS[index]}`;
        runsRef.current[index] = { animation, windows: active ? plan.regions[index].windows
          : [{ start: 0, dryStart: 0, dryEnd: duration, dryDuration: duration, closedClip: dry.closedClip }] };
        if (pausedRef.current) animation.pause();
      });
      firstUpdate = false;
    };
    update();
    motion?.addEventListener?.('change', update);
    return () => motion?.removeEventListener?.('change', update);
  }, [active, surface]);

  useEffect(() => () => runsRef.current.forEach(run => run?.animation?.cancel()), []);

  const parts = surface === 'panel' ? ['top', 'rail', 'bottom'] : ['torch'];
  const initial = staticWetRegions(surface, publicPath(SAILING_WET_COVERAGE[surface][0]));
  // html2canvas cannot capture CSS masks. Death snapshots retain dry artwork.
  return <div ref={hostRef} aria-hidden="true" data-html2canvas-ignore="true" data-sailing-wet-surface={surface}
    className={`toe-sailing-wet-surface toe-sailing-wet-${surface}`} style={style}>
    {WET_REGIONS.map((name, index) => <div key={name} data-sailing-wet-region={name}
      className="toe-sailing-wet-region" style={initial[index]}>
      {parts.map(part => <span key={part} className={`toe-sailing-wet-piece toe-sailing-wet-${part}`}
        style={{ backgroundImage: asset(SAILING_WET_ARTWORK[part]) }} />)}
    </div>)}
  </div>;
}
