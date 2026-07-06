import { useCardHoverTooltip } from '../cards/useCardHoverTooltip';
import { GodTooltip } from '../cards';

export function LocalGodPowerTag({ def, godLevel, playerIndex = 0, children }) {
  const { hover, tooltipPosition, cardRef, handleMouseEnter, handleMouseMove, handleMouseLeave } = useCardHoverTooltip();
  if (!def) return null;
  return (
    <>
      <div
        ref={cardRef}
        data-god-power-badge={playerIndex}
        data-god-power-anchor={playerIndex}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          marginTop: 4,
          padding: '3px 6px',
          background: def.bgCol || '#100808',
          border: `1px solid ${def.col || '#c06020'}88`,
          borderRadius: 3,
          cursor: 'default',
        }}
      >
        {children}
      </div>
      {hover && <GodTooltip def={def} godLevel={godLevel || 1} position={tooltipPosition} />}
    </>
  );
}
