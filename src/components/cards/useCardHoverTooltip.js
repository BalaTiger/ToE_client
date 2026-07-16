import React from 'react';

export function useCardHoverTooltip() {
  const [hover, setHover] = React.useState(false);
  const [tooltipPosition, setTooltipPosition] = React.useState(null);
  const cardRef = React.useRef(null);
  const hoverOriginRef = React.useRef(null);
  const hoverRectRef = React.useRef(null);
  const pointerRef = React.useRef(null);
  const frameRef = React.useRef(0);

  const getPosition = (rect, clientX, clientY, originCenter = hoverOriginRef.current) => {
    if (!rect) return null;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      originCenterX: originCenter?.x ?? centerX,
      originCenterY: originCenter?.y ?? centerY,
      pointerX: rect.width ? Math.max(-1, Math.min(1, ((clientX - rect.left) / rect.width) * 2 - 1)) : 0,
      pointerY: rect.height ? Math.max(-1, Math.min(1, ((clientY - rect.top) / rect.height) * 2 - 1)) : 0,
    };
  };

  const handleMouseEnter = event => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    hoverRectRef.current = rect;
    setHover(true);
    const position = getPosition(rect, event?.clientX, event?.clientY);
    if (position) {
      hoverOriginRef.current = {
        x: position.left + position.width / 2,
        y: position.top + position.height / 2,
      };
      setTooltipPosition({
        ...position,
        originCenterX: hoverOriginRef.current.x,
        originCenterY: hoverOriginRef.current.y,
      });
    }
  };

  const handleMouseMove = event => {
    if (!hover) return;
    pointerRef.current = { clientX: event.clientX, clientY: event.clientY };
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      const pointer = pointerRef.current;
      const position = getPosition(
        hoverRectRef.current,
        pointer?.clientX,
        pointer?.clientY,
      );
      if (position) setTooltipPosition(position);
    });
  };

  const handleMouseLeave = () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    setHover(false);
    setTooltipPosition(null);
    hoverOriginRef.current = null;
    hoverRectRef.current = null;
    pointerRef.current = null;
  };

  React.useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
  }, []);

  return { hover, tooltipPosition, cardRef, handleMouseEnter, handleMouseMove, handleMouseLeave };
}
