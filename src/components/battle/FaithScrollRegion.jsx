import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import './faith-scroll-region.css';

export function FaithScrollRegion({ enabled, resetKey, children }) {
  const viewportRef = useRef(null);
  const contentRef = useRef(null);
  const [edges, setEdges] = useState({ up: false, down: false });
  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const up = viewport.scrollTop > 1;
    const down = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop > 1;
    setEdges(previous => previous.up === up && previous.down === down ? previous : { up, down });
  }, []);

  useLayoutEffect(() => {
    if (!enabled) return;
    viewportRef.current.scrollTop = 0;
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(viewportRef.current);
    observer?.observe(contentRef.current);
    return () => observer?.disconnect();
  }, [enabled, resetKey, measure]);

  if (!enabled) return <div className="toe-faith-status">{children}</div>;
  return <div className="toe-faith-scroll-region">
    <div className="toe-faith-scroll-viewport" ref={viewportRef} onScroll={measure}
      role="region" aria-label="当前信仰与状态" tabIndex={0}>
      <div className="toe-faith-status" ref={contentRef}>{children}</div>
    </div>
    {['up', 'down'].filter(direction => edges[direction]).map(direction => <button
      key={direction}
      type="button"
      className="toe-faith-scroll-arrow"
      data-direction={direction}
      aria-label={direction === 'up' ? '向上查看信仰与状态' : '向下查看信仰与状态'}
      onClick={event => {
        event.stopPropagation();
        const viewport = viewportRef.current;
        viewport.scrollBy({
          top: viewport.clientHeight * .65 * (direction === 'up' ? -1 : 1),
          behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        });
      }}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 5 5 5 5-5" /></svg>
    </button>)}
  </div>;
}
