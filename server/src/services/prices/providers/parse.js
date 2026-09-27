import { z } from 'zod';
import { D } from '../../../lib/money.js';

/** Validates a provider response, throwing a readable error if the shape changed. */
export function parseResponse(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`unexpected response shape: ${issues}`);
  }
  return result.data;
}

/**
 * Prices some APIs send as JSON numbers (e.g. 84721 or 2656.348863).
 * String() yields the shortest representation that round-trips, i.e. the digits
 * the provider sent, so no binary float error leaks into the Decimal.
 */
export const jsonNumber = z
  .number()
  .finite()
  .positive()
  .transform((n) => new D(String(n)));

/** Prices other APIs send as strings (e.g. "84736.785"). */
export const decimalString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'expected a decimal string')
  .transform((s) => new D(s))
  .refine((d) => d.gt(0), 'must be greater than 0');
