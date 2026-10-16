import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PartyProvider } from './context/PartyContext'
import { installViewportTracking } from './utils/viewport'
import { installScreenScale } from './utils/screenScale'

installScreenScale()
installViewportTracking()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PartyProvider>
      <App />
    </PartyProvider>
  </StrictMode>,
)
