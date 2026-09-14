import { Children, cloneElement, useLayoutEffect, useRef, useState } from 'react';
import { getOpponentArcLayout } from './opponentArcLayout';
import { _getZoomCompensatedRect } from '../../utils/dom';
import './arc-panels.css';

export function OpponentArc({ children, currentTurn, compact = false, ref }) {
  const areaRef = useRef(null);
  const [measurement, setMeasurement] = useState({ width: 1180, zoom: 1 });
  const lastCenteredTurn = useRef(null);
  useLayoutEffect(() => {
    const element = areaRef.current;
    if (!element) return;
    const update = () => {
      const width = element.clientWidth || 1180;
      const zoom = _getZoomCompensatedRect(element).width / width || 1;
      setMeasurement(previous => previous.width === width && previous.zoom === zoom ? previous : { width, zoom });
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const panels = Children.toArray(children);
  const minimumPanelWidth = compact ? 136 / measurement.zoom : 0;
  const fittingWidth = panels.length > 5
    ? minimumPanelWidth * (1 + (panels.length - 1) * 0.94) + 20
    : minimumPanelWidth * panels.length + (panels.length - 1) * 10 + 20;
  const contentWidth = Math.max(measurement.width, fittingWidth);
  const layout = getOpponentArcLayout(panels.length, contentWidth, compact, minimumPanelWidth);
  useLayoutEffect(() => {
    const element = areaRef.current;
    // Center once on a presented turn change. Manual browsing during that turn
    // stays put, so revealed cards remain reachable while choosing a target.
    if (!compact || !element || lastCenteredTurn.current === currentTurn || element.scrollWidth <= element.clientWidth) return;
    const active = element.querySelector('.toe-opponent-seat[data-current-turn="true"]');
    if (!active) return;
    const area = _getZoomCompensatedRect(element);
    const seat = _getZoomCompensatedRect(active);
    element.scrollTo({ left: element.scrollLeft + (seat.left + seat.width / 2 - area.left - area.width / 2) / measurement.zoom });
    lastCenteredTurn.current = currentTurn;
  }, [compact, currentTurn, measurement, contentWidth]);
  return (
    <div
      ref={element => {
        areaRef.current = element;
        if (typeof ref === 'function') ref(element);
        else if (ref) ref.current = element;
      }}
      className="toe-opponent-scroll"
      data-compact={compact}
      role={compact ? 'region' : undefined}
      aria-label={compact ? '其他角色，左右滚动查看' : undefined}
      tabIndex={compact ? 0 : undefined}
    >
    <div
      className="toe-opponent-arc"
      data-opponent-count={panels.length}
      data-crowded={panels.length > 5}
      data-compact={compact}
      style={{ '--toe-opponent-arc-depth': `${layout.depth}px`, '--toe-opponent-content-width': `${contentWidth}px` }}
    >
      {panels.map((panel, index) => cloneElement(panel, {
        className: [panel.props.className, 'toe-opponent-seat'].filter(Boolean).join(' '),
        'data-current-turn': panel.props['data-pid'] === currentTurn,
        style: {
          ...panel.props.style,
          '--toe-opponent-width': `${layout.panelWidth}px`,
          '--toe-opponent-overlap': index ? `${layout.step - layout.panelWidth}px` : '0px',
          '--toe-opponent-y': `${layout.seats[index].y}px`,
          '--toe-opponent-rotation': `${layout.seats[index].rotation}deg`,
          '--toe-opponent-z': panel.props['data-pid'] === currentTurn ? 200 : panel.props.style?.zIndex ?? index + 1,
        },
      }))}
    </div>
    </div>
  );
}
