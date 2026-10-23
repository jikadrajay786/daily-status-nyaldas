import './assets/main.css'
// Bundled locally: the CSP blocks font CDNs and the app must work offline. The editor uses all four faces.
import '@fontsource/opendyslexic/400.css'
import '@fontsource/opendyslexic/400-italic.css'
import '@fontsource/opendyslexic/700.css'
import '@fontsource/opendyslexic/700-italic.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initAppearance } from './lib/appearance'
import { initScrollbars } from './lib/scrollbars'

initAppearance()
initScrollbars()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
