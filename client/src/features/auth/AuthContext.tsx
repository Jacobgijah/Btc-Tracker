import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, getToken, onUnauthorized, setToken } from '../../lib/api'
import type { User } from '../../lib/types'

interface AuthState {
  token: string | null
  /** null until fetched (or before login); a page reload starts with this unset. */
  user: User | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [token, setTokenState] = useState<string | null>(() => getToken())
  const [user, setUser] = useState<User | null>(null)

  // Any 401 from the API (expired/invalid token) signs out; RequireAuth then
  // redirects to /login, remembering the current page.
  useEffect(
    () =>
      onUnauthorized(() => {
        setTokenState(null)
        setUser(null)
        queryClient.clear()
      }),
    [queryClient],
  )

  // A page reload has a token but no user yet (login's response isn't persisted).
  useEffect(() => {
    if (!token || user) return
    let cancelled = false
    api
      .me()
      .then((u) => {
        if (!cancelled) setUser(u)
      })
      .catch(() => {
        // A 401 here is already handled by the onUnauthorized listener above.
      })
    return () => {
      cancelled = true
    }
  }, [token, user])

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.login(email, password)
      queryClient.clear()
      setToken(res.token)
      setTokenState(res.token)
      setUser(res.user)
    },
    [queryClient],
  )

  const logout = useCallback(() => {
    setToken(null)
    setTokenState(null)
    setUser(null)
    queryClient.clear()
  }, [queryClient])

  const value = useMemo(() => ({ token, user, login, logout }), [token, user, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
