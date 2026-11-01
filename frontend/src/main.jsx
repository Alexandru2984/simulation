import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { buildIdFromUrl, installErrorReporting } from './utils/errorReporter'

// Before the first render, so a crash during boot is reported too.
if (import.meta.env.PROD) installErrorReporting({ build: buildIdFromUrl(import.meta.url) })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
