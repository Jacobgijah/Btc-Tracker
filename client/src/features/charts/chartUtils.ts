import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'

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

// Palette: validated with the dataviz skill's validate_palette.js against the card
// surfaces (#ffffff light, slate-900 #0f172a dark). Value/price is always blue and
// cost always orange-red across charts; buy/sell markers also differ by shape
// (▲/▼), so colour is never the only cue. Bitcoin orange stays a UI accent.
export interface ChartColors {
  value: string
  cost: string
  buy: string
  sell: string
  sats: string
  grid: string
  axis: string
  surface: string
  cursor: string
}

const LIGHT: ChartColors = {
  value: '#2a78d6',
  cost: '#eb6834',
  buy: '#008300',
  sell: '#e34948',
  sats: '#1baf7a',
  grid: '#e2e8f0',
  axis: '#64748b',
  surface: '#ffffff',
  cursor: '#94a3b8',
}

const DARK: ChartColors = {
  value: '#3987e5',
  cost: '#d95926',
  buy: '#0ca30c',
  sell: '#e66767',
  sats: '#199e70',
  grid: '#1e293b',
  axis: '#94a3b8',
  surface: '#0f172a',
  cursor: '#475569',
}

const DARK_QUERY = '(prefers-color-scheme: dark)'

function subscribeToScheme(onChange: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mql = window.matchMedia(DARK_QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

const prefersDark = () => typeof window !== 'undefined' && !!window.matchMedia?.(DARK_QUERY).matches

/** Chart colours for the current light/dark setting (the app follows the system). */
export function useChartColors(): ChartColors {
  return useSyncExternalStore(subscribeToScheme, prefersDark, () => false) ? DARK : LIGHT
}

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
