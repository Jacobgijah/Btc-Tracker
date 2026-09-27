import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
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
