import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'
import { initWebBridge } from './lib/web-bridge'

// In web mode (no Electron preload), install the HTTP/WS bridge
initWebBridge()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
