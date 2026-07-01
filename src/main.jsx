import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { buildPublicUrl } from './utils/url'

document.body.style.setProperty('--toe-html-bg', `url('${buildPublicUrl('/bg.webp')}')`)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
