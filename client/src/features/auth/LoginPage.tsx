import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, Bitcoin, LogIn } from 'lucide-react'
import { useAuth } from './AuthContext'
import { Button } from '../../components/ui'
import { TextField } from '../../components/fields'
import { errorMessage } from '../../lib/api'
import { safeNext } from '../../lib/nav'

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})
type LoginValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const { token, login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })

  if (token) return <Navigate to={next} replace />

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setServerError(null)
    try {
      await login(email, password)
      navigate(next, { replace: true })
    } catch (err) {
      // e.g. "Invalid email or password" or "Too many login attempts, please try again later"
      setServerError(errorMessage(err))
    }
  })

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-btc text-slate-950 shadow-sm">
            <Bitcoin className="size-8" aria-hidden />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">BTC Tracker</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Sign in to see your savings.</p>
        </div>

        <form
          onSubmit={onSubmit}
          noValidate
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          {serverError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950/50 dark:text-red-100"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {serverError}
            </div>
          )}
          <TextField
            label="Email"
            type="email"
            autoComplete="username"
            inputMode="email"
            autoFocus
            error={errors.email?.message}
            {...register('email')}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <Button type="submit" variant="primary" className="w-full" disabled={isSubmitting}>
            <LogIn className="size-4" aria-hidden />
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </main>
  )
}
