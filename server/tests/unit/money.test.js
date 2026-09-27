import { describe, it, expect } from 'vitest';
import { toDec, formatFiat, formatPct, satsToBtc, btcToSats } from '../../src/lib/money.js';

describe('money helpers', () => {
  it('rounds half up (away from zero) to 2 dp', () => {
    expect(formatFiat('0.005')).toBe('0.01');
    expect(formatFiat('0.0049999')).toBe('0.00');
    expect(formatFiat('-0.005')).toBe('-0.01');
    expect(formatPct('2.105')).toBe('2.11');
  });

  it('never prints negative zero', () => {
    expect(formatFiat('-0.001')).toBe('0.00');
    expect(formatFiat('-0')).toBe('0.00');
  });

  it('refuses JS floats', () => {
    expect(() => toDec(0.1)).toThrow(TypeError);
    expect(toDec(25).toString()).toBe('25');
  });

  it('converts between sats and btc exactly', () => {
    expect(satsToBtc(1n)).toBe('0.00000001');
    expect(satsToBtc(2_100_000_000_000_000n)).toBe('21000000.00000000');
    expect(btcToSats('0.00000001')).toBe(1n);
    expect(btcToSats('0.012')).toBe(1_200_000n);
    expect(btcToSats('21000000')).toBe(2_100_000_000_000_000n);
  });
});
