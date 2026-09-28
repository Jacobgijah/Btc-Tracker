import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { KeyRound, Plus, ShieldOff, UserCheck } from 'lucide-react'
import { Button, ErrorState, Notice, PageHeader, Skeleton } from '../../components/ui'
import { SelectField, TextField } from '../../components/fields'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { FormDialog } from '../../components/FormDialog'
import { useToast } from '../../components/Toast'
import { ApiError, errorMessage } from '../../lib/api'
import { formatDate } from '../../lib/format'
import { useCreateUser, useResetUserPassword, useUpdateUser, useUsers } from '../../lib/queries'
import type { AdminUser, UserRole } from '../../lib/types'
import { useAuth } from '../auth/AuthContext'

const createUserSchema = z.object({
  email: z.string().trim().min(1, 'Enter an email').email('Enter a valid email address'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  role: z.enum(['ADMIN', 'USER']),
})
type CreateUserValues = z.infer<typeof createUserSchema>

const resetPasswordSchema = z.object({
  password: z.string().min(12, 'Password must be at least 12 characters'),
})
type ResetPasswordValues = z.infer<typeof resetPasswordSchema>

export function AdminUsersPage() {
  const { user: me } = useAuth()
  const list = useUsers()
  const [creating, setCreating] = useState(false)
  const [toDeactivate, setToDeactivate] = useState<AdminUser | null>(null)
  const [toResetPassword, setToResetPassword] = useState<AdminUser | null>(null)

  return (
    <>
      <PageHeader
        title="Users"
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden /> Add user
          </Button>
        }
      />

      {list.isPending ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading users">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : list.isError ? (
        <ErrorState title="Couldn't load users" error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <>
          <UserTable users={list.data} meId={me?.id} onDeactivate={setToDeactivate} onResetPassword={setToResetPassword} />
          <UserCards users={list.data} meId={me?.id} onDeactivate={setToDeactivate} onResetPassword={setToResetPassword} />
        </>
      )}

      <CreateUserDialog open={creating} onClose={() => setCreating(false)} />
      <DeactivateDialog user={toDeactivate} onClose={() => setToDeactivate(null)} />
      <ResetPasswordDialog user={toResetPassword} onClose={() => setToResetPassword(null)} />
    </>
  )
}

// ---------------------------------------------------------------------------

interface RowsProps {
  users: AdminUser[]
  meId: number | undefined
  onDeactivate: (u: AdminUser) => void
  onResetPassword: (u: AdminUser) => void
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span className={isActive ? 'text-gain' : 'text-text-muted'}>{isActive ? 'Active' : 'Disabled'}</span>
  )
}

function UserTable({ users, meId, onDeactivate, onResetPassword }: RowsProps) {
  return (
    <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface md:block">
      <table className="w-full text-sm">
        <caption className="sr-only">Users</caption>
        <thead className="border-b border-border text-left text-xs font-medium text-text-muted">
          <tr>
            <th scope="col" className="px-4 py-3">Email</th>
            <th scope="col" className="px-4 py-3">Role</th>
            <th scope="col" className="px-4 py-3">Status</th>
            <th scope="col" className="px-4 py-3">Created</th>
            <th scope="col" className="px-4 py-3 text-right"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {users.map((u) => (
            <tr key={u.id} className="hover:bg-hover">
              <td className="max-w-64 truncate px-4 py-3" title={u.email}>
                {u.email}
                {u.id === meId && <span className="ml-2 text-xs text-text-muted">(you)</span>}
              </td>
              <td className="px-4 py-3">{roleLabel(u.role)}</td>
              <td className="px-4 py-3"><StatusBadge isActive={u.isActive} /></td>
              <td className="px-4 py-3 whitespace-nowrap">{formatDate(u.createdAt)}</td>
              <td className="px-2 py-1 text-right whitespace-nowrap">
                <RowActions user={u} onDeactivate={onDeactivate} onResetPassword={onResetPassword} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function UserCards({ users, meId, onDeactivate, onResetPassword }: RowsProps) {
  return (
    <ul className="space-y-3 md:hidden" aria-label="Users">
      {users.map((u) => (
        <li key={u.id} className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold">
                {u.email}
                {u.id === meId && <span className="ml-2 text-xs font-normal text-text-muted">(you)</span>}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {roleLabel(u.role)} · <StatusBadge isActive={u.isActive} /> · {formatDate(u.createdAt)}
              </p>
            </div>
            <RowActions user={u} onDeactivate={onDeactivate} onResetPassword={onResetPassword} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function roleLabel(role: UserRole) {
  return role === 'ADMIN' ? 'Admin' : 'User'
}

function RowActions({
  user,
  onDeactivate,
  onResetPassword,
}: {
  user: AdminUser
  onDeactivate: (u: AdminUser) => void
  onResetPassword: (u: AdminUser) => void
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => onResetPassword(user)}
        className="grid size-11 place-items-center rounded-xl text-text-muted hover:bg-hover hover:text-text"
        aria-label={`Reset password for ${user.email}`}
        title="Reset password"
      >
        <KeyRound className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => onDeactivate(user)}
        className="grid size-11 place-items-center rounded-xl text-text-muted hover:bg-hover hover:text-text"
        aria-label={user.isActive ? `Deactivate ${user.email}` : `Reactivate ${user.email}`}
        title={user.isActive ? 'Deactivate' : 'Reactivate'}
      >
        {user.isActive ? <ShieldOff className="size-4" aria-hidden /> : <UserCheck className="size-4" aria-hidden />}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------

function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateUser()
  const toast = useToast()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { email: '', password: '', role: 'USER' },
  })

  const close = () => {
    create.reset()
    reset()
    onClose()
  }

  const onSubmit = handleSubmit((values) => {
    create.mutate(values, {
      onSuccess: () => {
        toast.success(`${values.email} created`)
        close()
      },
    })
  })

  return (
    <FormDialog
      open={open}
      title="Add user"
      submitLabel="Create"
      busy={create.isPending}
      onSubmit={onSubmit}
      onClose={close}
    >
      {create.error && !(create.error instanceof ApiError && create.error.status === 400) && (
        <Notice tone="error" role="alert">
          {errorMessage(create.error)}
        </Notice>
      )}
      <TextField
        label="Email"
        type="email"
        autoComplete="off"
        autoFocus
        error={fieldError(errors.email?.message, create.error, 'email')}
        {...register('email')}
      />
      <TextField
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 12 characters. Share it with the user directly."
        error={fieldError(errors.password?.message, create.error, 'password')}
        {...register('password')}
      />
      <SelectField label="Role" error={errors.role?.message} {...register('role')}>
        <option value="USER">User</option>
        <option value="ADMIN">Admin</option>
      </SelectField>
    </FormDialog>
  )
}

function DeactivateDialog({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const update = useUpdateUser()
  const toast = useToast()

  const close = () => {
    update.reset()
    onClose()
  }

  const nextActive = user ? !user.isActive : true

  return (
    <ConfirmDialog
      open={user !== null}
      title={`${nextActive ? 'Reactivate' : 'Deactivate'} this user?`}
      confirmLabel={nextActive ? 'Reactivate' : 'Deactivate'}
      confirmVariant={nextActive ? 'primary' : 'danger'}
      busy={update.isPending}
      onConfirm={() =>
        user &&
        update.mutate(
          { id: user.id, patch: { isActive: nextActive } },
          {
            onSuccess: () => {
              toast.success(`${user.email} ${nextActive ? 'reactivated' : 'deactivated'}`)
              close()
            },
          },
        )
      }
      onClose={close}
    >
      {user && (
        <p>
          {nextActive ? 'They will be able to sign in again.' : "They won't be able to sign in until reactivated."}
        </p>
      )}
      {update.error && (
        <Notice tone="error" role="alert">
          {errorMessage(update.error)}
        </Notice>
      )}
    </ConfirmDialog>
  )
}

function ResetPasswordDialog({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const reset_ = useResetUserPassword()
  const toast = useToast()
  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors },
  } = useForm<ResetPasswordValues>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: '' } })

  const close = () => {
    reset_.reset()
    resetForm()
    onClose()
  }

  const onSubmit = handleSubmit((values) => {
    if (!user) return
    reset_.mutate(
      { id: user.id, password: values.password },
      {
        onSuccess: () => {
          toast.success(`Password reset for ${user.email}`)
          close()
        },
      },
    )
  })

  return (
    <FormDialog
      open={user !== null}
      title={user ? `Reset password for ${user.email}` : 'Reset password'}
      submitLabel="Reset password"
      busy={reset_.isPending}
      onSubmit={onSubmit}
      onClose={close}
    >
      {reset_.error && (
        <Notice tone="error" role="alert">
          {errorMessage(reset_.error)}
        </Notice>
      )}
      <TextField
        label="New password"
        type="password"
        autoComplete="new-password"
        autoFocus
        hint="At least 12 characters. Share it with the user directly."
        error={errors.password?.message}
        {...register('password')}
      />
    </FormDialog>
  )
}

/** Maps an ApiError's fieldErrors onto a specific form field, falling back to the client-side zod message. */
function fieldError(zodMessage: string | undefined, err: unknown, field: string): string | undefined {
  if (zodMessage) return zodMessage
  if (err instanceof ApiError) return err.fieldErrors[field]?.[0]
  return undefined
}
