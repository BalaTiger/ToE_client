import { useEffect, useRef } from 'react';
import { buildPublicUrl } from '../../utils/url';
import { TORCH_FLAME_SOURCE, canUseFlameHdr, createHdrFlameRenderer, createSdrFlameRenderer,
  flameBackingSize, flameFrameAt, flamePlaybackState } from './torchFlameRuntime';

// Mount in the unfiltered flame portal, not inside a filtered game ancestor.
// Position/size belong to the parent so the canvas follows the torch artwork.
export default function TorchFlame({ className = '', style, paused = false, occluded = false,
  fullyCovered = false, intensity = 1, enableHdr = true, source = TORCH_FLAME_SOURCE }) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const optionsRef = useRef({ paused, occluded, fullyCovered, intensity });
  useEffect(() => {
    optionsRef.current = { paused, occluded, fullyCovered, intensity };
    playerRef.current?.refresh();
  }, [paused, occluded, fullyCovered, intensity]);

  useEffect(() => {
    const host = hostRef.current;
    let disposed = false;
    let visible = true;
    let renderer;
    let canvas;
    let timer;
    let elapsed = 0;
    let lastTime = performance.now();
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const image = new Image();
    image.decoding = 'async';
    const still = new Image();
    still.alt = '';
    Object.assign(still.style, { display: 'block', width: '100%', height: '100%', objectFit: 'contain' });
    if (source.stillUrl) still.src = buildPublicUrl(source.stillUrl);
    const showStill = () => {
      window.clearTimeout(timer);
      renderer?.destroy(); renderer = null;
      host.replaceChildren(...(source.stillUrl ? [still] : []));
      still.style.opacity = String(flamePlaybackState(optionsRef.current).opacity);
      host.dataset.flameRenderer = source.stillUrl ? 'still' : 'unavailable';
    };
    showStill();

    const playback = () => flamePlaybackState({ ...optionsRef.current,
      hidden: document.hidden, reducedMotion: motion.matches, visible });
    const frameDelay = () => 1000 / (optionsRef.current.occluded ? Math.min(12, source.fps) : source.fps);
    const draw = () => {
      if (renderer && canvas?.width && canvas?.height) {
        const frame = flameFrameAt(elapsed, source), state = playback();
        renderer.draw(frame, state.opacity);
        if (import.meta.env.DEV) {
          host.dataset.flameFrame = String(frame);
          host.dataset.flameAnimating = String(state.animate);
          host.dataset.flameOpacity = String(state.opacity);
        }
      }
    };
    const tick = () => {
      timer = undefined;
      if (disposed || !renderer || !playback().animate) return;
      const now = performance.now();
      elapsed += Math.min(250, now - lastTime);
      lastTime = now;
      try { draw(); } catch { activateSdr(); return; }
      if (!disposed && playback().animate) timer = window.setTimeout(tick, frameDelay());
    };
    const refresh = () => {
      window.clearTimeout(timer);
      timer = undefined;
      lastTime = performance.now();
      if (disposed) return;
      still.style.opacity = String(playback().opacity);
      if (!renderer) return;
      try { draw(); } catch { activateSdr(); return; }
      if (playback().animate) timer = window.setTimeout(tick, frameDelay());
    };
    const resize = () => {
      if (!canvas) return;
      const rect = host.getBoundingClientRect();
      // The mobile landscape iframe exposes its outer CSS scale. Its inner
      // layout pixels must not be mistaken for physical screen pixels.
      const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--toe-mobile-screen-scale')) || 1;
      const size = flameBackingSize(rect.width, rect.height, window.devicePixelRatio || 1, scale, source);
      if (canvas.width !== size.width || canvas.height !== size.height) {
        canvas.width = size.width; canvas.height = size.height;
      }
      refresh();
    };
    const newCanvas = () => {
      const next = document.createElement('canvas');
      next.setAttribute('aria-hidden', 'true');
      Object.assign(next.style, { display: 'block', width: '100%', height: '100%', pointerEvents: 'none' });
      return next;
    };
    const install = (nextCanvas, nextRenderer) => {
      renderer?.destroy();
      renderer = nextRenderer; canvas = nextCanvas;
      host.replaceChildren(canvas);
      host.dataset.flameRenderer = renderer.mode;
      resize();
    };
    function activateSdr() {
      if (disposed || !image.complete || !image.naturalWidth) return;
      if (renderer?.mode === 'sdr') {
        window.clearTimeout(timer);
        return;
      }
      const next = newCanvas();
      try { install(next, createSdrFlameRenderer(next, image, source)); }
      catch { showStill(); }
    }
    image.onload = async () => {
      if (disposed) return;
      activateSdr();
      if (!canUseFlameHdr({ enabled: enableHdr, secure: window.isSecureContext, gpu: navigator.gpu,
        highDynamicRange: window.matchMedia('(dynamic-range: high)').matches })) return;
      const hdrCanvas = newCanvas();
      try {
        const hdr = await createHdrFlameRenderer(hdrCanvas, image, source, activateSdr);
        if (disposed) hdr.destroy();
        else install(hdrCanvas, hdr);
      } catch { /* The already-running SDR canvas is the supported fallback. */ }
    };
    image.onerror = () => { if (!disposed) showStill(); };
    image.src = buildPublicUrl(source.url);
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    const intersection = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
      visible = entries[0]?.isIntersecting ?? true; refresh();
    }) : null;
    intersection?.observe(host);
    motion.addEventListener('change', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('resize', resize);
    const player = { refresh };
    playerRef.current = player;
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      observer.disconnect(); intersection?.disconnect();
      motion.removeEventListener('change', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('resize', resize);
      image.onload = null; image.onerror = null;
      renderer?.destroy(); host.replaceChildren();
      if (playerRef.current === player) playerRef.current = null;
    };
  }, [source, enableHdr]);

  return <div ref={hostRef} aria-hidden="true" className={`toe-torch-flame ${className}`}
    style={{ position: 'absolute', aspectRatio: `${source.frameWidth} / ${source.frameHeight}`, pointerEvents: 'none', ...style }} />;
}
