import { useLayoutEffect, useRef, useState } from 'react'
import { tokens } from '../../theme/tokens'

/**
 * A decimal string from the API -> a number, for chart geometry ONLY (pixel
 * positions). Every value shown as text is formatted from the original string
 * via lib/format, never from this number.
 */
export function plot(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Chart colours by role, from the brand tokens (SVG attributes can't rely on CSS
 * variables). Gold = your money (value, average cost, buys, invested); blue = the
 * market / the other side (BTC price, sells, sats); cool-gray = reference lines and
 * chrome. Series that share a hue also differ by form: buy ▲ vs sell ▼, dashed
 * cost basis, bars vs line.
 */
export const CHART = {
  value: tokens.gold,
  cost: tokens.coolGray,
  price: tokens.blue,
  avgCost: tokens.gold,
  buy: tokens.gold,
  sell: tokens.blue,
  holdings: tokens.gold,
  invested: tokens.gold,
  sats: tokens.blue,
  axis: tokens.coolGray,
  grid: tokens.coolGray,
  /** Grid lines and axis rules: cool-gray at low opacity. */
  gridOpacity: 0.2,
  surface: tokens.blackSpaceSoft,
  cursor: tokens.coolGray,
} as const

export type ChartColors = typeof CHART

/** Tracks an element's width, so charts can size themselves and choose how many ticks fit. */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/** About one label per 80px, never overlapping on a 375px phone. */
export function tickCountFor(width: number, min = 2, max = 7): number {
  return Math.max(min, Math.min(max, Math.floor(width / 80)))
}

/** `count` evenly spaced values from a category axis, always including both ends. */
export function pickTicks<T>(values: T[], count: number): T[] {
  if (values.length <= count) return values
  const ticks: T[] = []
  for (let i = 0; i < count; i++) ticks.push(values[Math.round((i * (values.length - 1)) / (count - 1))])
  return ticks
}

/** Days between two "YYYY-MM-DD" strings. */
export function spanDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** Chart height for the container width: shorter on phones, taller on the charts page. */
export function chartHeight(width: number, size: 'compact' | 'full'): number {
  if (size === 'compact') return width < 480 ? 200 : 240
  return width < 480 ? 260 : 360
}
