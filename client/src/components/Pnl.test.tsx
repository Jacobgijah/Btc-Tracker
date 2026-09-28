import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Pnl } from './ui'

const arrow = (el: HTMLElement) => {
  const svg = el.querySelector('svg')
  if (!svg) return null
  return { up: svg.querySelector('path')!.getAttribute('d')!.startsWith('M5 1.5'), className: svg.getAttribute('class') }
}

describe('Pnl colouring', () => {
  it('gain: gold text, + sign from the formatter, gold ▲', () => {
    render(<Pnl value="27.20">+$27.20</Pnl>)
    const el = screen.getByText('+$27.20')
    expect(el.className).toMatch(/\btext-gain\b/)
    expect(arrow(el)).toMatchObject({ up: true, className: expect.stringMatching(/\btext-gain\b/) })
  })

  it('small loss: white text, only the ▼ is blue', () => {
    render(<Pnl value="-25000">−TSh 25,000</Pnl>)
    const el = screen.getByText('−TSh 25,000')
    expect(el.className).toMatch(/\btext-text\b/)
    expect(el.className).not.toMatch(/\btext-loss\b/)
    expect(arrow(el)).toMatchObject({ up: false, className: expect.stringMatching(/\btext-loss\b/) })
  })

  it('large loss (headline): blue text too', () => {
    render(
      <Pnl value="-25000" size="lg">
        −TSh 25,000
      </Pnl>,
    )
    expect(screen.getByText('−TSh 25,000').className).toMatch(/\btext-loss\b/)
  })

  it('zero and null: cool-gray, no icon', () => {
    render(
      <>
        <Pnl value="0.00">$0.00</Pnl>
        <Pnl value={null}>—</Pnl>
        <Pnl value="-0.001">$0.00 again</Pnl>
      </>,
    )
    for (const text of ['$0.00', '—', '$0.00 again']) {
      const el = screen.getByText(text)
      expect(el.className).toMatch(/\btext-text-muted\b/)
      expect(arrow(el)).toBeNull()
    }
  })

  it('can leave the icon off a secondary figure', () => {
    render(
      <Pnl value="8.64" icon={false}>
        (+8.64%)
      </Pnl>,
    )
    expect(arrow(screen.getByText('(+8.64%)'))).toBeNull()
  })
})
