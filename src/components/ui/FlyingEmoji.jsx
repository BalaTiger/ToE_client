import { useRef, useEffect } from 'react';

export function FlyingEmoji({ id, emoji, startX, startY, endX, endY, arcHeight, durationMs, onDone }) {
  const ref = useRef(null);
  useEffect(() => {
    const t0 = performance.now();
    let raf;
    function frame(now) {
      const t = Math.min((now - t0) / durationMs, 1);
      const x = startX + (endX - startX) * t;
      const y = startY + (endY - startY) * t - arcHeight * 4 * t * (1 - t);
      const opacity = t < 0.65 ? 1 : Math.max(0, 1 - (t - 0.65) / 0.35);
      const scale = 0.7 + 0.6 * Math.sin(Math.PI * t);
      if (ref.current) {
        ref.current.style.left = x + 'px';
        ref.current.style.top = y + 'px';
        ref.current.style.opacity = opacity;
        ref.current.style.transform = `translate(-50%,-50%) scale(${scale})`;
      }
      if (t < 1) { raf = requestAnimationFrame(frame); }
      else { onDone(id); }
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [arcHeight, durationMs, endX, endY, id, onDone, startX, startY]);
  return (
    <div ref={ref} style={{
      position: 'fixed', left: startX, top: startY, fontSize: 26,
      pointerEvents: 'none', zIndex: 5000,
      transform: 'translate(-50%,-50%)', userSelect: 'none',
      willChange: 'left,top,opacity,transform',
    }}>{emoji}</div>
  );
}
