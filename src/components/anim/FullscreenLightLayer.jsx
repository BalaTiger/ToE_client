import React from 'react';
import { createPortal } from 'react-dom';

// Fullscreen light flashes must sit above every interactive or diagnostic UI.
// Keep the animation body on its original layer and portal only the light itself.
export const FULLSCREEN_LIGHT_Z_INDEX = 2147483000;

export function FullscreenLightLayer({ children, className, style }) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={className}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: FULLSCREEN_LIGHT_Z_INDEX,
        pointerEvents: 'none',
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
