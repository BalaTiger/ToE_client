import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { buildPublicUrl } from './utils/url'

document.body.style.setProperty('--toe-html-bg', `url('${buildPublicUrl('/bg.webp')}')`)

const VisualGallery = import.meta.env.DEV && new URLSearchParams(window.location.search).has('ui-gallery')
  ? lazy(() => import('./dev/VisualGallery.jsx'))
  : null;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {VisualGallery ? <Suspense fallback={null}><VisualGallery /></Suspense> : <App />}
  </StrictMode>,
)

if (
  typeof window !== 'undefined' &&
  typeof navigator !== 'undefined' &&
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
