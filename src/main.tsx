import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PartyProvider } from './context/PartyContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PartyProvider>
      <App />
    </PartyProvider>
  </StrictMode>,
)
