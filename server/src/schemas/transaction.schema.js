import { z } from 'zod';
import { TRANSACTION_TYPES, CURRENCIES } from '../constants.js';
import { D, MAX_SATS, btcToSats } from '../lib/money.js';
import { isoDate, endOfDayBound, pastIsoDate } from './common.js';

/**
 * Non-negative decimal given as a string or number, with at most `dp`
 * decimal places and `intDigits` integer digits (to fit the DB column);
 * `positive` also rejects zero.
 * Output: normalized decimal string (never a JS float).
 */
function decimalField({ dp, intDigits, label, positive = false }) {
  return z
    .union([z.string(), z.number()], {
      errorMap: () => ({ message: `${label} must be a number or numeric string` }),
    })
    .transform((v, ctx) => {
      const str = String(v).trim();
      if (!/^-?\d+(\.\d+)?$/.test(str)) {
        ctx.addIssue({ code: 'custom', message: `${label} must be a plain decimal number` });
        return z.NEVER;
      }
      if (str.startsWith('-')) {
        ctx.addIssue({ code: 'custom', message: `${label} cannot be negative` });
        return z.NEVER;
      }
      const [int, frac = ''] = str.split('.');
      if (frac.length > dp) {
        ctx.addIssue({ code: 'custom', message: `${label} can have at most ${dp} decimal places` });
        return z.NEVER;
      }
      if (int.replace(/^0+(?=\d)/, '').length > intDigits) {
        ctx.addIssue({ code: 'custom', message: `${label} is too large` });
        return z.NEVER;
      }
      const value = new D(str);
      if (positive && value.isZero()) {
        ctx.addIssue({ code: 'custom', message: `${label} must be greater than 0` });
        return z.NEVER;
      }
      return value.toFixed();
    });
}

const satsField = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    const str = String(v).trim();
    if (typeof v === 'number' ? !Number.isSafeInteger(v) : !/^\d+$/.test(str)) {
      ctx.addIssue({ code: 'custom', message: 'sats must be a positive whole number' });
      return z.NEVER;
    }
    const sats = BigInt(str);
    if (sats <= 0n) {
      ctx.addIssue({ code: 'custom', message: 'sats must be greater than 0' });
      return z.NEVER;
    }
    if (sats > MAX_SATS) {
      ctx.addIssue({ code: 'custom', message: 'sats exceeds the 21M BTC supply' });
      return z.NEVER;
    }
    return sats;
  });

const btcField = z
  .string({ invalid_type_error: 'btc must be a decimal string, e.g. "0.0125"' })
  .trim()
  .regex(/^\d+(\.\d{1,8})?$/, 'btc must be a positive decimal with at most 8 decimal places')
  .transform((v, ctx) => {
    const sats = btcToSats(v);
    if (sats <= 0n) {
      ctx.addIssue({ code: 'custom', message: 'btc must be greater than 0' });
      return z.NEVER;
    }
    if (sats > MAX_SATS) {
      ctx.addIssue({ code: 'custom', message: 'btc exceeds the 21M BTC supply' });
      return z.NEVER;
    }
    return sats;
  });

const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max, `must be at most ${max} characters`)
    .nullable()
    .optional()
    .transform((v) => (v === '' ? null : v));

const fields = {
  type: z.enum(TRANSACTION_TYPES),
  sats: satsField,
  btc: btcField,
  fiatAmount: decimalField({ dp: 2, intDigits: 18, label: 'fiatAmount' }),
  feeAmount: decimalField({ dp: 2, intDigits: 18, label: 'feeAmount' }),
  fiatCurrency: z.enum(CURRENCIES),
  usdTzsRate: decimalField({ dp: 4, intDigits: 10, label: 'usdTzsRate', positive: true }),
  date: pastIsoDate,
  exchange: optionalText(100),
  note: optionalText(500),
};

function checkAmountInput(data, ctx) {
  const hasSats = data.sats !== undefined;
  const hasBtc = data.btc !== undefined;
  if (hasSats && hasBtc) {
    ctx.addIssue({ code: 'custom', path: ['btc'], message: 'Provide either sats or btc, not both' });
  }
  return hasSats || hasBtc;
}

/**
 * Cross-field rules that need the complete record. Zod still runs this when a
 * field failed its own validation (passing an internal marker object instead
 * of the value), so the numeric checks only run on successfully parsed strings.
 */
function checkRecord(data, ctx) {
  if (!checkAmountInput(data, ctx)) {
    ctx.addIssue({ code: 'custom', path: ['sats'], message: 'Provide either sats or btc' });
  }
  const fiatOk = typeof data.fiatAmount === 'string';
  const feeOk = data.feeAmount === undefined || typeof data.feeAmount === 'string';
  if (!fiatOk || !feeOk) return;

  if (data.type !== 'TRANSFER_IN' && new D(data.fiatAmount).lte(0)) {
    ctx.addIssue({
      code: 'custom',
      path: ['fiatAmount'],
      message: `fiatAmount must be greater than 0 for ${data.type}`,
    });
  }
  if (data.type === 'SELL' && new D(data.feeAmount ?? 0).gte(data.fiatAmount)) {
    ctx.addIssue({
      code: 'custom',
      path: ['feeAmount'],
      message: 'feeAmount must be less than fiatAmount for a SELL',
    });
  }
}

/** { ..., btc } -> { ..., sats } */
function toRecord({ btc, ...rest }) {
  return btc === undefined ? rest : { ...rest, sats: btc };
}

export const createTransactionSchema = z
  .object({ ...fields, feeAmount: fields.feeAmount.default('0') })
  // usdTzsRate may be omitted: the service fills it in before saving.
  .partial({ sats: true, btc: true, usdTzsRate: true, exchange: true, note: true })
  .strict()
  .superRefine(checkRecord)
  .transform(toRecord);

export const patchTransactionSchema = z
  .object(fields)
  .partial()
  .strict()
  .superRefine((data, ctx) => {
    checkAmountInput(data, ctx);
    if (Object.keys(data).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Provide at least one field to update' });
    }
  })
  .transform(toRecord);

/**
 * Re-validates the cross-field rules for an existing row with a patch applied
 * (e.g. lowering fiatAmount below an existing fee on a SELL).
 */
export const mergedRecordSchema = z
  .object({
    type: fields.type,
    sats: z.bigint(),
    fiatAmount: z.string(),
    feeAmount: z.string(),
  })
  .passthrough()
  .superRefine(checkRecord);

export const idParamSchema = z.object({
  id: z.coerce.number({ invalid_type_error: 'id must be a number' }).int().positive(),
});

export const listQuerySchema = z
  .object({
    type: z.enum(TRANSACTION_TYPES).optional(),
    from: isoDate.optional(),
    to: endOfDayBound.optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
  })
  .superRefine((q, ctx) => {
    if (q.from instanceof Date && q.to instanceof Date && q.from > q.to) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: 'from must be before to' });
    }
  });
