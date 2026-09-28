import { describe, expect, it } from 'vitest'
import { D } from './money'
import {
  DASH,
  formatAxisDay,
  formatBTC,
  formatCompactBTC,
  formatCompactFiat,
  formatCompactSats,
  formatDateTime,
  formatDay,
  formatMonth,
  formatFiat,
  formatPct,
  formatRate,
  formatRelativeTime,
  formatSats,
  formatTZS,
  formatUSD,
  plTone,
} from './format'

describe('formatTZS', () => {
  it('uses TSh, thousands separators and no decimals', () => {
    expect(formatTZS('1234567')).toBe('TSh 1,234,567')
    expect(formatTZS('1234567.00')).toBe('TSh 1,234,567')
    expect(formatTZS('0')).toBe('TSh 0')
    expect(formatTZS('999')).toBe('TSh 999')
  })

  it('rounds half up', () => {
    expect(formatTZS('1234567.49')).toBe('TSh 1,234,567')
    expect(formatTZS('1234567.50')).toBe('TSh 1,234,568')
    expect(formatTZS('273373333.33')).toBe('TSh 273,373,333')
  })

  it('formats large values exactly (beyond float precision)', () => {
    expect(formatTZS('297000000000.00')).toBe('TSh 297,000,000,000')
    expect(formatTZS('123456789012345678.50')).toBe('TSh 123,456,789,012,345,679')
  })

  it('shows negatives with a minus sign and optional plus for positives', () => {
    expect(formatTZS('-46430.00')).toBe('−TSh 46,430')
    expect(formatTZS('283520.00', { signed: true })).toBe('+TSh 283,520')
    expect(formatTZS('-283520.00', { signed: true })).toBe('−TSh 283,520')
    expect(formatTZS('0.00', { signed: true })).toBe('TSh 0')
    // rounds to zero: no sign
    expect(formatTZS('-0.4', { signed: true })).toBe('TSh 0')
  })

  it('shows a dash for null/invalid', () => {
    expect(formatTZS(null)).toBe(DASH)
    expect(formatTZS(undefined)).toBe(DASH)
    expect(formatTZS('')).toBe(DASH)
    expect(formatTZS('abc')).toBe(DASH)
  })
})

describe('formatUSD', () => {
  it('uses $, separators and 2 decimals', () => {
    expect(formatUSD('1234.56')).toBe('$1,234.56')
    expect(formatUSD('1234.5')).toBe('$1,234.50')
    expect(formatUSD('0')).toBe('$0.00')
    expect(formatUSD('110000')).toBe('$110,000.00')
    expect(formatUSD('0.005')).toBe('$0.01')
  })

  it('handles negatives, signs and null', () => {
    expect(formatUSD('-27.2')).toBe('−$27.20')
    expect(formatUSD('27.2', { signed: true })).toBe('+$27.20')
    expect(formatUSD('-0.001', { signed: true })).toBe('$0.00')
    expect(formatUSD(null)).toBe(DASH)
  })

  it('accepts decimal.js values', () => {
    expect(formatUSD(new D('1').div(3))).toBe('$0.33')
  })
})

describe('formatFiat', () => {
  it('dispatches on currency', () => {
    expect(formatFiat('2500000.00', 'TZS')).toBe('TSh 2,500,000')
    expect(formatFiat('600.00', 'USD')).toBe('$600.00')
    expect(formatFiat('-3.80', 'USD', { signed: true })).toBe('−$3.80')
    expect(formatFiat(null, 'TZS')).toBe(DASH)
  })
})

describe('formatBTC / formatSats', () => {
  it('always shows 8 decimals', () => {
    expect(formatBTC('0.012')).toBe('0.01200000 BTC')
    expect(formatBTC('0.01200000')).toBe('0.01200000 BTC')
    expect(formatBTC('1')).toBe('1.00000000 BTC')
    expect(formatBTC('21000000')).toBe('21,000,000.00000000 BTC')
    expect(formatBTC('0.00000001')).toBe('0.00000001 BTC')
  })

  it('handles negatives and null', () => {
    expect(formatBTC('-0.003')).toBe('−0.00300000 BTC')
    expect(formatBTC(null)).toBe(DASH)
  })

  it('formats sats with separators', () => {
    expect(formatSats('1200000')).toBe('1,200,000 sats')
    expect(formatSats(1n)).toBe('1 sats')
    expect(formatSats('2100000000000000')).toBe('2,100,000,000,000,000 sats')
    expect(formatSats('-300000')).toBe('−300,000 sats')
    expect(formatSats(null)).toBe(DASH)
  })
})

describe('formatPct', () => {
  it('always carries a sign', () => {
    expect(formatPct('8.64')).toBe('+8.64%')
    expect(formatPct('-2.10')).toBe('−2.10%')
    expect(formatPct('-2.1')).toBe('−2.10%')
    expect(formatPct('0')).toBe('0.00%')
    expect(formatPct('0.004')).toBe('0.00%')
    expect(formatPct('1234.5')).toBe('+1,234.50%')
  })

  it('shows a dash for null', () => {
    expect(formatPct(null)).toBe(DASH)
  })
})

describe('plTone', () => {
  it('is positive/negative/neutral', () => {
    expect(plTone('27.20')).toBe('positive')
    expect(plTone('-0.01')).toBe('negative')
    expect(plTone('0.00')).toBe('neutral')
    expect(plTone(null)).toBe('neutral')
    expect(plTone(undefined)).toBe('neutral')
    // Rounds like the displayed value: "$0.00" has no sign, so it isn't a loss either
    expect(plTone('-0.001')).toBe('neutral')
    expect(plTone('-0.4', 0)).toBe('neutral')
  })
})

describe('formatRate', () => {
  it('shows 2 dp by default with separators', () => {
    expect(formatRate('2656.3489')).toBe('2,656.35')
    expect(formatRate('2656.3489', 4)).toBe('2,656.3489')
    expect(formatRate(null)).toBe(DASH)
  })
})

describe('formatCompactFiat', () => {
  it('abbreviates with K/M/B and at most 3 significant figures', () => {
    expect(formatCompactFiat('3564000.00', 'TZS')).toBe('TSh 3.6M')
    expect(formatCompactFiat('3500000', 'TZS')).toBe('TSh 3.5M')
    expect(formatCompactFiat('1234.56', 'USD')).toBe('$1.2K')
    expect(formatCompactFiat('12345', 'USD')).toBe('$12.3K')
    expect(formatCompactFiat('123456', 'USD')).toBe('$123K')
    expect(formatCompactFiat('297000000', 'TZS')).toBe('TSh 297M')
    expect(formatCompactFiat('1500000000', 'TZS')).toBe('TSh 1.5B')
    expect(formatCompactFiat('2000000000000', 'TZS')).toBe('TSh 2T')
    expect(formatCompactFiat('1000', 'USD')).toBe('$1K')
  })

  it('keeps small values readable', () => {
    expect(formatCompactFiat('950', 'USD')).toBe('$950')
    expect(formatCompactFiat('27.20', 'USD')).toBe('$27.2')
    expect(formatCompactFiat('0.5', 'USD')).toBe('$0.5')
    expect(formatCompactFiat('0', 'TZS')).toBe('TSh 0')
  })

  it('rolls over to the next unit instead of showing 1000K', () => {
    expect(formatCompactFiat('999950', 'TZS')).toBe('TSh 1M')
    expect(formatCompactFiat('999.6', 'USD')).toBe('$1K')
    expect(formatCompactFiat('999999999', 'TZS')).toBe('TSh 1B')
    expect(formatCompactFiat('99960', 'USD')).toBe('$100K')
  })

  it('signs negatives with a minus and positives on request', () => {
    expect(formatCompactFiat('-25000', 'TZS')).toBe('−TSh 25K')
    expect(formatCompactFiat('283520', 'TZS', { signed: true })).toBe('+TSh 284K')
    expect(formatCompactFiat('-0.001', 'USD', { signed: true })).toBe('$0')
    expect(formatCompactFiat(null, 'USD')).toBe(DASH)
  })

  it('accepts chart tick numbers and decimal.js values', () => {
    expect(formatCompactFiat(2500000, 'TZS')).toBe('TSh 2.5M')
    expect(formatCompactFiat(new D('1').div(3), 'USD')).toBe('$0.33')
  })
})

describe('formatCompactSats / formatCompactBTC', () => {
  it('abbreviates sats', () => {
    expect(formatCompactSats('1200000')).toBe('1.2M sats')
    expect(formatCompactSats('500')).toBe('500 sats')
    expect(formatCompactSats(null)).toBe(DASH)
  })

  it('drops trailing zeros from BTC', () => {
    expect(formatCompactBTC('0.01200000')).toBe('0.012 BTC')
    expect(formatCompactBTC('1')).toBe('1 BTC')
    expect(formatCompactBTC('0.00000001')).toBe('0.00000001 BTC')
    expect(formatCompactBTC('0')).toBe('0 BTC')
  })
})

describe('day and month formats', () => {
  it('formats calendar days without shifting them by time zone', () => {
    expect(formatDay('2026-01-10')).toBe('10 Jan 2026')
    expect(formatDay('2026-12-31')).toBe('31 Dec 2026')
    expect(formatDay('nope')).toBe(DASH)
    expect(formatMonth('2026-01')).toBe('Jan 2026')
    expect(formatMonth('2026-01', { short: true })).toBe('Jan')
  })

  it('picks axis detail from the visible span', () => {
    expect(formatAxisDay('2026-01-10', 30)).toBe('10 Jan')
    expect(formatAxisDay('2026-01-10', 365)).toBe('Jan')
    expect(formatAxisDay('2026-01-10', 900)).toBe('Jan 2026')
    expect(formatAxisDay('bad', 30)).toBe('')
  })
})

describe('formatRelativeTime', () => {
  const now = Date.parse('2026-09-27T12:00:00Z')
  it('describes how long ago', () => {
    expect(formatRelativeTime('2026-09-27T11:59:30Z', now)).toBe('just now')
    expect(formatRelativeTime('2026-09-27T11:55:00Z', now)).toBe('5 min ago')
    expect(formatRelativeTime('2026-09-27T09:00:00Z', now)).toBe('3 h ago')
    expect(formatRelativeTime('2026-09-26T12:00:00Z', now)).toBe('1 day ago')
    expect(formatRelativeTime('2026-09-24T12:00:00Z', now)).toBe('3 days ago')
    expect(formatRelativeTime(null, now)).toBe(DASH)
  })
})

describe('formatDateTime', () => {
  it('formats valid dates and dashes invalid ones', () => {
    expect(formatDateTime('2026-01-10T14:30:00Z')).toMatch(/2026/)
    expect(formatDateTime('nope')).toBe(DASH)
    expect(formatDateTime(null)).toBe(DASH)
  })
})
