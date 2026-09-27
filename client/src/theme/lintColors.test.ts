// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { findColorViolations } from '../../scripts/lint-colors.mjs'

// Bad samples are assembled at runtime so this file passes lint:colors itself.
const hash = '#'
const rules = (text: string) => findColorViolations(text).map((v) => v.rule)

describe('lint:colors', () => {
  it('flags colour literals and colour functions', () => {
    expect(rules(`fill="${hash}fff"`)).toEqual(['colour literal'])
    expect(rules(`color: ${hash}131313;`)).toEqual(['colour literal'])
    expect(rules(`background: ${'rgb'}a(0, 0, 0, .5)`)).toEqual(['colour function'])
    expect(rules(`stroke: ${'hsl'}(10 20% 30%)`)).toEqual(['colour function'])
    expect(rules(`stroke={'${'whi'}te'}`)).toEqual(['named colour'])
  })

  it('flags default Tailwind palette classes', () => {
    const samples = 'bg/red/500 text/slate/600 border/emerald/200 hover:bg/blue/50 fill/gray/400'.split(' ')
    for (const sample of samples) {
      expect(rules(`className="${sample.replaceAll('/', '-')}"`)).toContain('default Tailwind palette class')
    }
  })

  it('flags raw token or white/black classes where an alias exists', () => {
    for (const cls of 'bg/white text/black text/gold border/cool-gray bg/black-space-soft/50'.split(' ').map((s) => s.replace('/', '-'))) {
      expect(rules(`className="${cls}"`)).toEqual(['raw token class (use the alias)'])
    }
  })

  it('flags dark: variants and the old bitcoin-orange classes', () => {
    expect(rules(`className="${'dark'}:bg-surface"`)).toEqual(['dark: variant'])
    expect(rules(`className="${'bg-'}btc"`)).toEqual(['old bitcoin-orange class'])
  })

  it('accepts the semantic aliases, transparent and currentColor', () => {
    const ok =
      'className="bg-bg bg-surface text-text text-text-muted border-border border-border-strong bg-accent ' +
      'text-on-accent text-info text-gain text-loss border-error ring-accent bg-hover bg-skeleton bg-transparent ' +
      'text-current fill-current hover:bg-accent/90" href="#main" aria-label="Sell #3"'
    expect(findColorViolations(ok)).toEqual([])
  })

  it('reports line and column', () => {
    expect(findColorViolations(`ok\n  x ${hash}abcdef`)).toMatchObject([{ line: 2, column: 5 }])
  })
})
