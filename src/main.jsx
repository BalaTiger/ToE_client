import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { buildPublicUrl } from './utils/url'

document.body.style.setProperty('--toe-html-bg-preview', `url('${buildPublicUrl('/bg_preview.jpg')}')`)
document.body.style.setProperty('--toe-html-bg-full', `url('${buildPublicUrl('/bg.png')}')`)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
