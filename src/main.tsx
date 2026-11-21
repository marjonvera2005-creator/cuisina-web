import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyDisplay } from './lib/display'

// Text size and high contrast saved in this browser (account menu > Accessibility & display).
applyDisplay()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
