import { Children, cloneElement, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getOpponentRosterLayout } from './opponentRosterLayout';
import './opponent-roster.css';

export function OpponentRoster({ children, currentTurn, layout = 'coastal', ref }) {
  const areaRef = useRef(null);
  const [width, setWidth] = useState(layout === 'coastal' ? 630 : 1180);
  const [opened, setOpened] = useState(null);
  const openPid = opened?.pid;
  const [currentHeight, setCurrentHeight] = useState(0);
  const panels = Children.toArray(children);
  const fullWidth = layout === 'coastal' ? 154 : 220;
  const geometry = getOpponentRosterLayout({ count: panels.length, currentTurn, expandedPid: openPid, width, fullWidth, compactWidth: 64, arc: layout === 'arch' });

  useLayoutEffect(() => {
    const element = areaRef.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth || 630);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, []);

  useLayoutEffect(() => {
    const seat = areaRef.current?.querySelector('[data-current-turn="true"].toe-opponent-roster-seat');
    const surface = seat?.firstElementChild;
    const measure = () => setCurrentHeight(surface ? Math.ceil(surface.offsetHeight + (layout === 'arch' ? 22 : 0)) : 0);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (surface) observer?.observe(surface);
    return () => observer?.disconnect();
  }, [currentTurn, layout]);

  useEffect(() => {
    if (openPid == null) return;
    const closeOutside = event => {
      if (!areaRef.current?.contains(event.target)) setOpened(null);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [openPid]);

  return <div ref={element => {
    areaRef.current = element;
    if (typeof ref === 'function') ref(element);
    else if (ref) ref.current = element;
  }} className="toe-opponent-roster" data-opponent-count={panels.length} role="region" aria-label="其他角色"
    style={{ height: Math.max(geometry.height, currentHeight) }}>
    {panels.map((panel, index) => {
      const pid = panel.props['data-pid'];
      const current = pid === currentTurn;
      const expanded = !current && openPid === pid;
      const child = Children.only(panel.props.children);
      const seat = geometry.seats[index];
      const entry = expanded ? opened?.entry : null;
      const clearEntry = () => {
        if (entry) setOpened(previous => previous?.pid === pid ? { pid } : previous);
      };
      return cloneElement(panel, {
        className: 'toe-opponent-roster-seat',
        'data-current-turn': current,
        'data-opponent-collapsible': !current,
        'data-opponent-expanded': expanded,
        tabIndex: 0,
        'aria-label': `${child.props.player.name}，${current || expanded ? '完整角色区域' : '简化角色区域，悬停或按回车展开'}`,
        'aria-expanded': current || expanded,
        onPointerEnter: event => {
          if (event.pointerType !== 'touch' && openPid !== pid) setOpened({ pid, entry: current ? null : seat });
        },
        onPointerLeave: event => { if (event.pointerType !== 'touch') setOpened(previous => previous?.pid === pid ? null : previous); },
        onFocusCapture: event => { if (event.target.matches(':focus-visible')) setOpened({ pid }); },
        onBlurCapture: event => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOpened(previous => previous?.pid === pid ? null : previous);
        },
        onKeyDown: event => {
          if (event.key === 'Escape') { event.stopPropagation(); setOpened(null); }
          else if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault(); setOpened({ pid });
          }
        },
        onClickCapture: event => {
          // A first touch opens the panel; a second can select its live contents.
          if (!current && !expanded) { event.stopPropagation(); setOpened({ pid }); }
        },
        style: { ...panel.props.style, position: 'absolute', left: seat.x, top: seat.y, width: seat.width,
          zIndex: openPid === pid ? 500 : current ? 300 : index + 1 },
        children: <>
        {entry && <div className="toe-opponent-entry-bridge" aria-hidden="true" style={{
          left: Math.min(0, entry.x - seat.x), top: Math.min(0, entry.y - seat.y),
          width: Math.max(seat.width, entry.x + entry.width - seat.x) - Math.min(0, entry.x - seat.x),
          height: 118 + Math.abs(entry.y - seat.y),
        }} />}
        <div className="toe-opponent-roster-surface" onPointerEnter={clearEntry} onPointerMove={clearEntry}>
          {cloneElement(child, { simplified: !current && !expanded })}
        </div></>,
      });
    })}
  </div>;
}
