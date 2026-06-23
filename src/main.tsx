import { Buffer } from 'buffer'
// Polyfill Buffer for Stellar SDK
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).Buffer = Buffer
  ;(window as unknown as Record<string, unknown>).global = window
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
