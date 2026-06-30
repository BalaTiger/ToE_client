import React from 'react';

export function useCardHoverTooltip() {
  const [hover, setHover] = React.useState(false);
  const [tooltipPosition, setTooltipPosition] = React.useState(null);
  const cardRef = React.useRef(null);
  const hoverOriginRef = React.useRef(null);

  const getPositionFromEvent = (event, originCenter = hoverOriginRef.current) => {
    if (!cardRef.current) return null;
    const rect = cardRef.current.getBoundingClientRect();
    const clientX = event?.clientX ?? rect.left + rect.width / 2;
    const clientY = event?.clientY ?? rect.top + rect.height / 2;
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
    setHover(true);
    const position = getPositionFromEvent(event);
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
    const position = getPositionFromEvent(event);
    if (position) setTooltipPosition(position);
  };

  const handleMouseLeave = () => {
    setHover(false);
    setTooltipPosition(null);
    hoverOriginRef.current = null;
  };

  return { hover, tooltipPosition, cardRef, handleMouseEnter, handleMouseMove, handleMouseLeave };
}
