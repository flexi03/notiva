import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/index.css'

// Lets CSS adapt to the desktop shell (e.g. macOS traffic lights in the title bar area).
if (window.notiva) document.documentElement.dataset.shell = `electron-${window.notiva.platform}`

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
