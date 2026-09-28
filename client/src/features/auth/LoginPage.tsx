import { useId, useState, type ComponentProps, type ReactNode } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowRight, Circle, CircleCheck, XCircle } from 'lucide-react'
import { useAuth } from './AuthContext'
import { Notice } from '../../components/ui'
import { errorMessage } from '../../lib/api'
import { safeNext } from '../../lib/nav'
import { cx } from '../../lib/cx'
import { LoginArtLeft, LoginArtRight } from './LoginIllustrations'

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})
type LoginValues = z.infer<typeof loginSchema>

const INPUT =
  'block h-12 w-full rounded-lg border bg-bg pl-5 pr-16 text-[15px] text-text placeholder:text-text-muted ' +
  'focus:border-accent focus:outline-2 focus:outline-offset-0 focus:outline-accent'

/** Placeholder-style input from the design; the label stays for screen readers (and tests). */
function LoginField({
  label,
  error,
  aside,
  ...props
}: { label: string; error?: string; aside?: ReactNode } & ComponentProps<'input'>) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cx(INPUT, error ? 'border-error ring-1 ring-error' : 'border-border-strong')}
          {...props}
        />
        {aside && <div className="absolute inset-y-0 right-4 flex items-center">{aside}</div>}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-text">
          <XCircle className="mt-0.5 size-4 shrink-0 text-error" aria-hidden />
          {error}
        </p>
      )}
    </div>
  )
}

export function LoginPage() {
  const { token, login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })

  const emailLooksValid = loginSchema.shape.email.safeParse(useWatch({ control, name: 'email' })).success

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
    <div className="flex min-h-dvh flex-col overflow-x-hidden">
      <header className="mx-auto w-full max-w-[1240px] px-4 pt-7 sm:px-6">
        <p className="text-2xl font-bold tracking-tight">BTC Tracker</p>
        <div className="mt-4 h-px w-32 bg-text-muted" />
        <p className="mt-3 flex w-32 items-center justify-between text-[13px] text-text">
          Stack sats
          <ArrowRight className="size-3.5" aria-hidden />
        </p>
      </header>

      <main className="relative mx-auto flex w-full max-w-[1240px] flex-1 flex-col items-center px-4 pt-10 pb-8 sm:px-6 lg:pt-10">
        <div className="relative w-full">
          {/* Ground line the illustrations stand on, 80px above the card's bottom edge. */}
          <div className="absolute inset-x-0 bottom-20 hidden h-px bg-border-strong lg:block" aria-hidden />
          <LoginArtLeft className="absolute bottom-20 left-[5%] hidden w-[250px] lg:block xl:left-[7%] xl:w-[290px]" />
          <LoginArtRight className="absolute right-0 bottom-20 hidden w-[330px] lg:block xl:w-[385px]" />

          <section className="relative z-10 mx-auto w-full max-w-[466px] rounded-[2rem] border border-border bg-surface px-6 pt-14 pb-14 sm:px-[50px]">
            <div className="text-center">
              <h1 className="text-[28px] font-bold tracking-tight">Account Login</h1>
              <p className="mx-auto mt-4 max-w-72 text-[17px] leading-relaxed text-text">
                Hey, enter your details to sign in to your account
              </p>
            </div>

            <form onSubmit={onSubmit} noValidate className="mt-10">
              {serverError && (
                <Notice tone="error" role="alert" className="mb-4">
                  {serverError}
                </Notice>
              )}
              <div className="space-y-3">
                <LoginField
                  label="Email"
                  type="email"
                  placeholder="Enter Email"
                  autoComplete="username"
                  inputMode="email"
                  autoFocus
                  error={errors.email?.message}
                  aside={
                    emailLooksValid ? (
                      <CircleCheck className="size-5 text-accent" aria-hidden />
                    ) : (
                      <Circle className="size-5 text-text-muted" aria-hidden />
                    )
                  }
                  {...register('email')}
                />
                <LoginField
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  autoComplete="current-password"
                  error={errors.password?.message}
                  aside={
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      className="rounded text-xs font-semibold text-text hover:underline"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  }
                  {...register('password')}
                />
              </div>

              <button
                type="button"
                onClick={() => setShowHelp((v) => !v)}
                aria-expanded={showHelp}
                className="mt-7 rounded text-sm font-medium text-text hover:underline"
              >
                Having trouble signing in?
              </button>
              {showHelp && (
                <Notice tone="info" className="mt-3">
                  Accounts are created and reset by your admin. Ask them to reset your password or re-enable your
                  account.
                </Notice>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-7 flex h-12 w-full items-center justify-center rounded-lg bg-accent text-sm font-semibold text-on-accent transition-colors hover:bg-accent/90 active:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <p className="mt-8 text-center text-[13px] text-text-muted">
              Don&apos;t have an account? <span className="font-semibold text-text">Ask your admin</span>
            </p>
          </section>
        </div>

        <footer className="mt-9 text-center text-sm text-text">Copyright © {new Date().getFullYear()} BTC Tracker</footer>
      </main>
    </div>
  )
}
