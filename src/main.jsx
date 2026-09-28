import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { buildPublicUrl } from './utils/url'
import { UiAppearanceProvider } from './ui/UiAppearance.jsx'
import { mountMobileLandscape } from './ui/mobileLandscape.js'
import { mountGameLayers } from './ui/gameLayers.js'
import './ui/game-layers.css'

document.body.style.setProperty('--toe-html-bg', `url('${buildPublicUrl('/bg.webp')}')`)

const VisualGallery = import.meta.env.DEV && new URLSearchParams(window.location.search).has('ui-gallery')
  ? lazy(() => import('./dev/VisualGallery.jsx'))
  : null;

const mobileLandscapeHost = mountMobileLandscape();
if (!mobileLandscapeHost) mountGameLayers();
if (!mobileLandscapeHost) createRoot(document.getElementById('root')).render(
  <StrictMode>
    <UiAppearanceProvider>
      {VisualGallery ? <Suspense fallback={null}><VisualGallery /></Suspense> : <App />}
    </UiAppearanceProvider>
  </StrictMode>,
)

if (
  import.meta.env.PROD &&
  typeof window !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  !mobileLandscapeHost &&
  'serviceWorker' in navigator &&
  typeof __TOE_H5_BUILD__ !== 'undefined' &&
  !__TOE_H5_BUILD__ &&
  window.location.protocol !== 'file:'
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(buildPublicUrl('/sw.js')).catch(error => {
      console.warn('Service worker registration failed.', error);
    });
  });
}

// Development assets are edited in place. Retire only this app's old worker;
// let the next navigation release its controller without interrupting a game.
if (import.meta.env.DEV && !mobileLandscapeHost && 'serviceWorker' in navigator) {
  const workerUrl = new URL(buildPublicUrl('/sw.js'), window.location.href).href;
  navigator.serviceWorker.getRegistration(workerUrl).then(registration => {
    const workers = [registration?.active, registration?.waiting, registration?.installing];
    if (workers.some(worker => worker?.scriptURL === workerUrl)) return registration.unregister();
  }).catch(error => console.warn('Development service worker cleanup failed.', error));
}
