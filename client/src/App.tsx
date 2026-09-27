import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { AppLayout } from './components/AppLayout'
import { LinkButton, Skeleton } from './components/ui'
import { LoginPage } from './features/auth/LoginPage'
import { RequireAuth } from './features/auth/RequireAuth'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { TransactionsPage } from './features/transactions/TransactionsPage'
import { EditTransactionPage, NewTransactionPage } from './features/transactions/TransactionFormPage'
import { SettingsPage } from './features/settings/SettingsPage'

// Recharts is big: the charts load as their own chunk.
const ChartsPage = lazy(() => import('./features/charts/ChartsPage').then((m) => ({ default: m.ChartsPage })))

/** Route table. Providers and the router itself are set up by the caller (main.tsx / tests). */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route
          path="charts"
          element={
            <Suspense fallback={<PageLoading />}>
              <ChartsPage />
            </Suspense>
          }
        />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="transactions/new" element={<NewTransactionPage />} />
        <Route path="transactions/:id/edit" element={<EditTransactionPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

function PageLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-72 w-full" />
    </div>
  )
}

function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <LinkButton to="/" className="mt-6">
        Go to dashboard
      </LinkButton>
    </div>
  )
}
