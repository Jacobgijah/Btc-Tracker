import { ApiError } from '../../lib/api'
import type { OverSellDetails } from '../../lib/types'

/** A 422 caused by a sell exceeding holdings (vs. the missing-FX-rate 422). */
export function isOverSellError(err: unknown): err is ApiError & { details: OverSellDetails } {
  if (!(err instanceof ApiError) || err.status !== 422) return false
  const d = err.details as Partial<OverSellDetails> | undefined
  return !!d && typeof d.attemptedSats === 'string' && typeof d.availableSats === 'string'
}
