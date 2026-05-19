import React from 'react';

export function useCardHoverTooltip() {
  const [hover, setHover] = React.useState(false);
  const [tooltipPosition, setTooltipPosition] = React.useState(null);
  const cardRef = React.useRef(null);

  const handleMouseEnter = () => {
    setHover(true);
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      setTooltipPosition(rect);
    }
  };

  const handleMouseLeave = () => {
    setHover(false);
    setTooltipPosition(null);
  };

  return { hover, tooltipPosition, cardRef, handleMouseEnter, handleMouseLeave };
}
