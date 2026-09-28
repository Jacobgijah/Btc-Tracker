import { describe, it, expect } from 'vitest';
import {
  addDays,
  addMonths,
  addMonthsToMonth,
  dayKey,
  eachDay,
  isValidTimeZone,
  startOfDay,
  toRuns,
} from '../../src/lib/days.js';

describe('days', () => {
  it('finds the calendar day of an instant in a time zone', () => {
    // 22:30 UTC on 9 Jan is 01:30 on 10 Jan in Dar es Salaam (UTC+3).
    expect(dayKey('2026-01-09T22:30:00Z', 'UTC')).toBe('2026-01-09');
    expect(dayKey('2026-01-09T22:30:00Z', 'Africa/Dar_es_Salaam')).toBe('2026-01-10');
    expect(dayKey(new Date('2026-01-10T02:00:00Z'), 'America/New_York')).toBe('2026-01-09');
    expect(() => dayKey('nope')).toThrow(TypeError);
  });

  it('adds days and months across month and year ends', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2024-03-31', -1)).toBe('2024-02-29');
    expect(addMonths('2026-09-28', -12)).toBe('2025-09-28');
    expect(addMonthsToMonth('2025-12', 1)).toBe('2026-01');
  });

  it('lists days inclusively', () => {
    expect(eachDay('2026-02-27', '2026-03-02')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
    expect(eachDay('2026-03-02', '2026-03-01')).toEqual([]);
  });

  it('finds local midnight', () => {
    expect(startOfDay('2026-01-10', 'Africa/Dar_es_Salaam').toISOString()).toBe('2026-01-09T21:00:00.000Z');
    expect(startOfDay('2026-01-10', 'UTC').toISOString()).toBe('2026-01-10T00:00:00.000Z');
    // Across a DST change: New York is UTC-4 on 9 March 2026 (DST started on the 8th).
    expect(startOfDay('2026-03-09', 'America/New_York').toISOString()).toBe('2026-03-09T04:00:00.000Z');
    expect(startOfDay('2026-03-08', 'America/New_York').toISOString()).toBe('2026-03-08T05:00:00.000Z');
  });

  it('collapses days into runs', () => {
    expect(toRuns(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-05'])).toEqual([
      { from: '2026-01-01', to: '2026-01-03', days: 3 },
      { from: '2026-01-05', to: '2026-01-05', days: 1 },
    ]);
    expect(toRuns([])).toEqual([]);
  });

  it('validates time zones', () => {
    expect(isValidTimeZone('Africa/Dar_es_Salaam')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
  });
});
