import type {
  FxRate,
  LoginResponse,
  PortfolioSummary,
  PriceSnapshot,
  Settings,
  Transaction,
  TransactionInput,
  TransactionList,
  TransactionType,
  User,
} from './types'

/** Dev: "/api" (Vite proxies it to the server). Production: VITE_API_URL. */
export const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '')

const TOKEN_KEY = 'btc-tracker.token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // storage unavailable: the session just won't survive a reload
  }
}

type UnauthorizedListener = () => void
const unauthorizedListeners = new Set<UnauthorizedListener>()

/** Called whenever an authenticated request gets a 401 (after the token is cleared). */
export function onUnauthorized(listener: UnauthorizedListener) {
  unauthorizedListeners.add(listener)
  return () => {
    unauthorizedListeners.delete(listener)
  }
}

/** An error response from the API, carrying the server's own message. */
export class ApiError extends Error {
  status: number
  fieldErrors: Record<string, string[]>
  formErrors: string[]
  details: unknown

  constructor(status: number, body: unknown) {
    const b = (body ?? {}) as {
      error?: string
      fieldErrors?: Record<string, string[]>
      formErrors?: string[]
      details?: unknown
    }
    super(b.error || defaultMessage(status))
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = b.fieldErrors ?? {}
    this.formErrors = b.formErrors ?? []
    this.details = b.details
  }
}

function defaultMessage(status: number) {
  if (status === 0) return "Can't reach the server. Check your connection and try again."
  if (status >= 500) return `The server had a problem (${status}). Please try again.`
  return `Request failed (${status})`
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Something went wrong'
}

type Query = Record<string, string | number | undefined | null>

interface RequestOptions {
  method?: string
  body?: unknown
  query?: Query
  /** Login is the only call made without a token. */
  auth?: boolean
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, auth = true } = opts
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  }
  const search = qs.toString()
  const url = `${API_BASE}${path}${search ? `?${search}` : ''}`

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = auth ? getToken() : null
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, null)
  }

  if (res.status === 204) return undefined as T

  let data: unknown = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!res.ok) {
    const error = new ApiError(res.status, data)
    if (res.status === 401 && auth) {
      setToken(null)
      unauthorizedListeners.forEach((l) => l())
    }
    throw error
  }
  return data as T
}

// ---------------------------------------------------------------------------
// Endpoints

export interface TransactionFilters {
  type?: TransactionType
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  me: () => request<User>('/auth/me'),

  listTransactions: (filters: TransactionFilters = {}) =>
    request<TransactionList>('/transactions', { query: { ...filters } }),
  getTransaction: (id: number) => request<Transaction>(`/transactions/${id}`),
  createTransaction: (input: TransactionInput) =>
    request<Transaction>('/transactions', { method: 'POST', body: input }),
  updateTransaction: (id: number, patch: Partial<TransactionInput>) =>
    request<Transaction>(`/transactions/${id}`, { method: 'PATCH', body: patch }),
  deleteTransaction: (id: number) => request<void>(`/transactions/${id}`, { method: 'DELETE' }),

  portfolioSummary: () => request<PortfolioSummary>('/portfolio/summary'),

  refreshPrices: () => request<PriceSnapshot>('/prices/refresh', { method: 'POST' }),
  fxForDate: (date: string) => request<FxRate>('/prices/fx', { query: { date } }),

  getSettings: () => request<Settings>('/settings'),
  updateSettings: (patch: Partial<Settings>) =>
    request<Settings>('/settings', { method: 'PATCH', body: patch }),
}
