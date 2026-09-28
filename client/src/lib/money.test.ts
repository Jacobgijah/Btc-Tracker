import { describe, expect, it } from 'vitest'
import {
  amountToSats,
  btcInputToSatsInput,
  btcToSats,
  satsInputToBtcInput,
  satsToBtc,
  satsToBtcInput,
} from './money'
import { impliedPrice } from './calc'
import { buyTx } from '../test/utils'

describe('BTC ⇄ sats conversion', () => {
  it('converts BTC strings to exact sats', () => {
    expect(btcToSats('0.012')).toBe(1_200_000n)
    expect(btcToSats('1')).toBe(100_000_000n)
    expect(btcToSats('0.00000001')).toBe(1n)
    expect(btcToSats('0.1')).toBe(10_000_000n) // no float error (0.1 * 1e8)
    expect(btcToSats('20999999.99999999')).toBe(2_099_999_999_999_999n)
  })

  it('rejects invalid BTC input', () => {
    expect(btcToSats('0.000000001')).toBeNull() // 9 dp
    expect(btcToSats('-1')).toBeNull()
    expect(btcToSats('1,5')).toBeNull()
    expect(btcToSats('')).toBeNull()
  })

  it('converts sats to BTC strings', () => {
    expect(satsToBtc(1_200_000n)).toBe('0.01200000')
    expect(satsToBtc('1')).toBe('0.00000001')
    expect(satsToBtcInput('1200000')).toBe('0.012')
    expect(satsToBtcInput(100_000_000n)).toBe('1')
    expect(satsToBtcInput('123456789')).toBe('1.23456789')
  })

  it('round-trips the form toggle', () => {
    expect(btcInputToSatsInput('0.0125')).toBe('1250000')
    expect(satsInputToBtcInput('1250000')).toBe('0.0125')
    expect(satsInputToBtcInput(btcInputToSatsInput('0.12345678')!)).toBe('0.12345678')
    expect(btcInputToSatsInput('abc')).toBeNull()
    expect(satsInputToBtcInput('1.5')).toBeNull()
  })

  it('reads the amount in either unit', () => {
    expect(amountToSats('0.5', 'BTC')).toBe(50_000_000n)
    expect(amountToSats('500', 'SATS')).toBe(500n)
    expect(amountToSats('0.5', 'SATS')).toBeNull()
  })
})

describe('impliedPrice', () => {
  it('divides fiat by BTC and converts with the transaction rate', () => {
    // 2,500,000 TZS for 0.01 BTC at 2500 TZS/USD
    expect(impliedPrice(buyTx)!.toFixed(2)).toBe('250000000.00')
    expect(impliedPrice(buyTx, 'USD')!.toFixed(2)).toBe('100000.00')
  })
})
