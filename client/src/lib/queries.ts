import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type TransactionFilters } from './api'
import type { Currency, HistoryRange, Settings } from './types'

export const queryKeys = {
  me: ['me'] as const,
  users: ['users'] as const,
  settings: ['settings'] as const,
  portfolio: ['portfolio'] as const,
  // Under "portfolio" so every ledger or settings change refreshes the charts too.
  history: (range: HistoryRange, currency: Currency) => ['portfolio', 'history', range, currency] as const,
  monthly: (currency: Currency) => ['portfolio', 'monthly', currency] as const,
  ledger: ['portfolio', 'ledger'] as const,
  transactions: ['transactions'] as const,
  transactionList: (filters: TransactionFilters) => ['transactions', 'list', filters] as const,
  transaction: (id: number) => ['transactions', 'one', id] as const,
  fx: (date: string) => ['fx', date] as const,
}

export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: api.getSettings, staleTime: 5 * 60_000 })
}

/** The display currency chosen in settings (TZS until settings load). */
export function useDisplayCurrency(): Currency {
  return useSettings().data?.displayCurrency ?? 'TZS'
}

/** PATCH /settings with an optimistic update; cost-method changes refetch the portfolio. */
export function useUpdateSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.updateSettings,
    onMutate: async (patch: Partial<Settings>) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.settings })
      const previous = queryClient.getQueryData<Settings>(queryKeys.settings)
      if (previous) queryClient.setQueryData(queryKeys.settings, { ...previous, ...patch })
      return { previous }
    },
    onError: (_err, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.settings, context.previous)
    },
    onSuccess: (settings, patch) => {
      queryClient.setQueryData(queryKeys.settings, settings)
      if (patch.costMethod) queryClient.invalidateQueries({ queryKey: queryKeys.portfolio })
    },
  })
}

export function usePortfolio() {
  return useQuery({ queryKey: queryKeys.portfolio, queryFn: api.portfolioSummary })
}

export function useHistory(range: HistoryRange, currency: Currency) {
  return useQuery({
    queryKey: queryKeys.history(range, currency),
    queryFn: () => api.portfolioHistory(range, currency),
    // Keep the previous range on screen while the next one loads.
    placeholderData: keepPreviousData,
  })
}

export function useMonthly(currency: Currency) {
  return useQuery({ queryKey: queryKeys.monthly(currency), queryFn: () => api.portfolioMonthly(currency) })
}

export function useLedger() {
  return useQuery({ queryKey: queryKeys.ledger, queryFn: api.portfolioLedger })
}

/** After any ledger change, everything derived from transactions is stale. */
export function invalidateLedger(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.transactions }),
    queryClient.invalidateQueries({ queryKey: queryKeys.portfolio }),
  ])
}

export function useUsers() {
  return useQuery({ queryKey: queryKeys.users, queryFn: api.listUsers })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.createUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.users }),
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Parameters<typeof api.updateUser>[1] }) =>
      api.updateUser(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.users }),
  })
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) => api.resetUserPassword(id, password),
  })
}
