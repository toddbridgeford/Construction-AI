import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App'
import './index.css'

const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Intentionally silent: dashboard must boot even when SW registration fails.
    })
  })
}

registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
