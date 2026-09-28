import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from './AuthContext'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  const location = useLocation()
  if (!token) {
    const here = location.pathname + location.search
    const to = here === '/' ? '/login' : `/login?next=${encodeURIComponent(here)}`
    return <Navigate to={to} replace />
  }
  return children
}

