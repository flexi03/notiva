import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Offline support for the PWA (not inside Electron, which loads files locally anyway).
if (
  'serviceWorker' in navigator &&
  import.meta.env.PROD &&
  location.protocol === 'https:' &&
  !window.notiva
) {
  void navigator.serviceWorker.register('./sw.js')
}
