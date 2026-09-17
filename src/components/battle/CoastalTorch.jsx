import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import TorchFlame from '../effects/TorchFlame';
import { GameLayerPortal } from '../../ui/GameLayerPortal';
import { subscribeOverlayPresence } from '../../ui/gameLayers';
import { buildPublicUrl } from '../../utils/url';

// The hand stays in scene Gamma; the matched flame is a viewport sibling above
// ordinary gameplay, below the overlay host. Both are in the landscape iframe.
export function CoastalTorch({ paused = false, sceneShake }) {
  const anchorRef = useRef(null);
  const viewportRef = useRef(null);
  const flamePositionRef = useRef(null);
  const [occluded, setOccluded] = useState(false);
  useEffect(() => subscribeOverlayPresence(setOccluded), []);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const viewport = anchor?.closest('.toe-battle-root');
    const board = anchor?.closest('.toe-board-composition-coastal');
    const lightViewport = viewportRef.current;
    const lightPosition = flamePositionRef.current;
    if (!anchor || !viewport || !lightViewport || !lightPosition) return;
    let last = '', frame;
    const measure = () => {
      const area = viewport.getBoundingClientRect(), flame = anchor.getBoundingClientRect();
      const values = [area.left, area.top, area.width, area.height,
        flame.left - area.left, flame.top - area.top, flame.width, flame.height];
      const key = values.map(value => value.toFixed(2)).join(',');
      if (key === last) return;
      last = key;
      Object.assign(lightViewport.style, { left: `${area.left}px`, top: `${area.top}px`,
        width: `${area.width}px`, height: `${area.height}px`, visibility: 'visible' });
      Object.assign(lightPosition.style, { left: `${values[4]}px`, top: `${values[5]}px`,
        width: `${flame.width}px`, height: `${flame.height}px` });
    };
    measure();
    const observer = new ResizeObserver(measure);
    [anchor, viewport, board].filter(Boolean).forEach(element => observer.observe(element));
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    // WAAPI shakes do not trigger ResizeObserver. Track only their bounded
    // lifetime; a stationary board needs no permanent layout-polling loop.
    if (sceneShake && !paused) {
      const timing = sceneShake.timing || {};
      const duration = Number(timing.duration) || 1000;
      const until = performance.now() + duration * (Number(timing.iterations) || 1) + (Number(timing.delay) || 0) + 100;
      const followShake = () => {
        measure();
        if (performance.now() < until) frame = requestAnimationFrame(followShake);
      };
      frame = requestAnimationFrame(followShake);
    }
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [paused, sceneShake]);

  return <>
    <div className="toe-coastal-torch" aria-hidden="true">
      <img src={buildPublicUrl('/img/ui/coastal/torch-hand.webp')} alt="" width="768" height="1152" />
      <span ref={anchorRef} className="toe-coastal-torch-flame-anchor" />
    </div>
    <GameLayerPortal layer="flame">
      <div ref={viewportRef} className="toe-coastal-torch-light-viewport" aria-hidden="true">
        <div ref={flamePositionRef} className="toe-coastal-torch-light-position">
          <TorchFlame paused={paused} occluded={occluded} style={{ inset: 0, width: '100%', height: '100%' }} />
        </div>
      </div>
    </GameLayerPortal>
  </>;
}
