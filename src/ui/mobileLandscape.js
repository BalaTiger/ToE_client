// A persistent iframe gives CSS, portals and animation coordinates the same
// landscape viewport. Rotating a transformed React root alone would not.
export function landscapeFrameGeometry(width, height, orientation = '') {
  const landscapeWidth = Math.max(width, height);
  const landscapeHeight = Math.min(width, height);
  const scale = Math.min(1, landscapeWidth / 900, landscapeHeight / 600);
  return {
    width: Math.ceil(landscapeWidth / scale),
    height: Math.ceil(landscapeHeight / scale),
    scale,
    rotation: width >= height ? 0 : orientation === 'portrait-secondary' ? -90 : 90,
  };
}

export function mountMobileLandscape() {
  if (window.name === 'toe-landscape-game') {
    const lock = () => {
      try {
        // Either landscape direction is valid; unsupported browsers retain
        // the iframe fallback without requiring fullscreen or a reload.
        window.screen.orientation?.lock?.('landscape')?.catch(() => {});
      } catch { /* The landscape viewport remains available. */ }
    };
    document.addEventListener('pointerup', lock, { once: true });
    document.addEventListener('fullscreenchange', lock);
    return false;
  }
  const mobile = navigator.userAgentData?.mobile
    || /Android|iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    || (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 1024);
  const preview = import.meta.env.DEV && new URLSearchParams(location.search).has('mobile-landscape');
  if (!mobile && !preview) return false;

  document.documentElement.classList.add('toe-landscape-host');
  const frame = document.createElement('iframe');
  frame.name = 'toe-landscape-game';
  frame.setAttribute('data-toe-landscape-game', '');
  frame.title = '邪神的宝藏 · 横屏游戏';
  frame.allow = 'autoplay; fullscreen';
  frame.allowFullscreen = true;
  frame.src = location.href;
  const resize = () => {
    const { width, height, scale, rotation } = landscapeFrameGeometry(
      window.innerWidth, window.innerHeight, window.screen.orientation?.type,
    );
    Object.assign(frame.style, {
      width: `${width}px`, height: `${height}px`,
      transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${scale})`,
    });
    try {
      frame.contentDocument?.documentElement.style.setProperty('--toe-mobile-screen-scale', String(scale));
    } catch { /* A navigating frame may temporarily be inaccessible. */ }
  };
  frame.addEventListener('load', resize);
  resize();
  document.getElementById('root').appendChild(frame);
  window.addEventListener('resize', resize);
  window.screen.orientation?.addEventListener('change', resize);
  return true;
}
