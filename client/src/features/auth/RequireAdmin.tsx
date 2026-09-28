import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from './AuthContext'

/** Assumes it's nested inside <RequireAuth>, so a token is already present. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  // user is still loading (post-reload /auth/me hasn't returned yet): render nothing rather
  // than bounce a genuine admin to "/" before we know their role.
  if (!user) return null
  if (user.role !== 'ADMIN') return <Navigate to="/" replace />
  return children
}
