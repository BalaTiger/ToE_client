import React from 'react';
import { buildPublicUrl } from '../utils/url';

function LoadingPentagramSpinner({
  size = 20,
  imageSize = 16,
  duration = '1s',
  style,
  imageStyle,
}) {
  return (
    <span
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: `spinLoader ${duration} linear infinite`,
        transformOrigin: 'center',
        flexShrink: 0,
        ...style,
      }}
      aria-hidden
    >
      <img
        src={buildPublicUrl('/img/loading.webp')}
        style={{
          width: imageSize,
          height: imageSize,
          objectFit: 'contain',
          display: 'block',
          filter: 'invert(60%) sepia(30%) saturate(300%) hue-rotate(30deg)',
          ...imageStyle,
        }}
        alt=""
      />
    </span>
  );
}

export { LoadingPentagramSpinner };
