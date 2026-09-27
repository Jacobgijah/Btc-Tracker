import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, getToken, onUnauthorized, setToken } from '../../lib/api'

interface AuthState {
  token: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [token, setTokenState] = useState<string | null>(() => getToken())

  // Any 401 from the API (expired/invalid token) signs out; RequireAuth then
  // redirects to /login, remembering the current page.
  useEffect(
    () =>
      onUnauthorized(() => {
        setTokenState(null)
        queryClient.clear()
      }),
    [queryClient],
  )

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.login(email, password)
      queryClient.clear()
      setToken(res.token)
      setTokenState(res.token)
    },
    [queryClient],
  )

  const logout = useCallback(() => {
    setToken(null)
    setTokenState(null)
    queryClient.clear()
  }, [queryClient])

  const value = useMemo(() => ({ token, login, logout }), [token, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
