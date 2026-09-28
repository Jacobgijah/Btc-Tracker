import { NavLink, Outlet } from 'react-router'
import { Bitcoin, ChartLine, LayoutDashboard, List, LogOut, Plus, Settings } from 'lucide-react'
import { LogoutButton } from '../features/auth/LogoutButton'
import { CurrencyToggle } from './CurrencyToggle'
import { LinkButton } from './ui'
import { cx } from '../lib/cx'

const NAV = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard, end: true },
  { to: '/charts', label: 'Charts', Icon: ChartLine, end: true },
  { to: '/transactions', label: 'Transactions', Icon: List, end: true },
  { to: '/settings', label: 'Settings', Icon: Settings, end: true },
]

export function AppLayout() {
  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-text focus:ring-2 focus:ring-accent"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-border bg-overlay pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 md:h-16">
          <NavLink to="/" className="flex items-center gap-2 rounded-lg font-bold text-text">
            <span className="grid size-8 place-items-center rounded-full bg-accent text-on-accent">
              <Bitcoin className="size-5" aria-hidden />
            </span>
            <span className="hidden sm:inline">BTC Tracker</span>
          </NavLink>

          <nav aria-label="Main" className="ml-4 hidden items-center gap-1 md:flex">
            {NAV.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cx(
                    'relative rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'text-accent after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:rounded-full after:bg-accent'
                      : 'text-text-muted hover:bg-hover hover:text-text',
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <CurrencyToggle className="w-32" />
            {/* Mobile has the Add button in the bottom nav. */}
            <div className="hidden md:block">
              <LinkButton to="/transactions/new" variant="primary">
                <Plus className="size-4" aria-hidden />
                Add
              </LinkButton>
            </div>
            <LogoutButton
              label="Log out"
              className="grid size-11 place-items-center rounded-xl text-text-muted hover:bg-hover hover:text-text"
            >
              <LogOut className="size-5" aria-hidden />
            </LogoutButton>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pt-8 md:pb-12">
        <Outlet />
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-overlay pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-5">
          {[NAV[0], NAV[1], NAV[2]].map((item) => (
            <BottomNavItem key={item.to} {...item} />
          ))}
          <li>
            <NavLink
              to="/transactions/new"
              className={({ isActive }) =>
                cx(
                  'flex h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium',
                  isActive ? 'text-accent' : 'text-text-muted',
                )
              }
            >
              <span className="grid size-8 place-items-center rounded-full bg-accent text-on-accent">
                <Plus className="size-5" aria-hidden />
              </span>
              Add
            </NavLink>
          </li>
          <BottomNavItem {...NAV[3]} />
        </ul>
      </nav>
    </div>
  )
}

function BottomNavItem({ to, label, Icon, end }: (typeof NAV)[number]) {
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          cx(
            'flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium',
            isActive ? 'text-accent' : 'text-text-muted',
          )
        }
      >
        {({ isActive }) => (
          <>
            <Icon className={cx('size-6', isActive && 'text-accent')} aria-hidden />
            {label}
          </>
        )}
      </NavLink>
    </li>
  )
}
