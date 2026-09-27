import { z } from 'zod';

const DAY_MS = 24 * 60 * 60 * 1000;
// Allow a little client/server clock skew before calling a date "in the future".
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

const isDateOnly = (v) => z.string().date().safeParse(v).success;
const isDateTime = (v) => z.string().datetime({ offset: true }).safeParse(v).success;

const isoString = z
  .string()
  .trim()
  .refine(
    (v) => isDateOnly(v) || isDateTime(v),
    'must be an ISO date (YYYY-MM-DD) or datetime (e.g. 2026-01-10T14:30:00Z)',
  );

/** ISO datetime with offset, or a plain YYYY-MM-DD (taken as 00:00 UTC). */
export const isoDate = isoString.transform((v) => new Date(v));

/** Upper bound for filters: a plain date means "through the end of that day" (UTC). */
export const endOfDayBound = isoString.transform((v) =>
  isDateOnly(v) ? new Date(new Date(v).getTime() + DAY_MS - 1) : new Date(v),
);

export const pastIsoDate = isoDate.refine(
  (d) => d.getTime() <= Date.now() + FUTURE_TOLERANCE_MS,
  'date cannot be in the future',
);

/** Strict YYYY-MM-DD, not in the future. */
export const pastDay = z
  .string()
  .trim()
  .date('must be a date in YYYY-MM-DD format')
  .transform((v) => new Date(v))
  .refine((d) => d.getTime() <= Date.now() + FUTURE_TOLERANCE_MS, 'date cannot be in the future');
