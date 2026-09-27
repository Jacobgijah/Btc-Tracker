import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
// Poppins, self-hosted (no request to Google). Only the weights the app uses:
// normal, font-medium, font-semibold, font-bold.
import '@fontsource/poppins/400.css'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'
import './index.css'
import { AppRoutes } from './App'
import { AppProviders } from './providers'
import { createQueryClient } from './lib/queryClient'

const queryClient = createQueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProviders client={queryClient}>
        <AppRoutes />
      </AppProviders>
    </BrowserRouter>
  </StrictMode>,
)
