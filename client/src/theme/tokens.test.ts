import { describe, expect, it } from 'vitest'
// vite.config.ts tells Vitest not to stub this file, so ?raw gives its real text.
import css from './tokens.css?raw'
import { TOKEN_CSS_NAMES, tokens } from './tokens'

/** Every "--name: <hex>;" declaration in the file, as { "--name": "<hex>" }. */
function hexDeclarations(source: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of source.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) out[m[1]] = m[2].toLowerCase()
  return out
}

describe('design tokens', () => {
  const declared = hexDeclarations(css)

  it('tokens.ts matches tokens.css value for value', () => {
    const fromTs = Object.fromEntries(
      (Object.keys(tokens) as (keyof typeof tokens)[]).map((k) => [TOKEN_CSS_NAMES[k], tokens[k].toLowerCase()]),
    )
    expect(fromTs).toEqual(declared)
  })

  it('has exactly the six brand colours, and no pure white or black', () => {
    // Built, not written out, so this file passes lint:colors itself.
    const pureWhite = `#${'f'.repeat(6)}`
    const pureBlack = `#${'0'.repeat(6)}`
    expect(Object.keys(declared)).toHaveLength(6)
    expect(Object.values(declared)).not.toContain(pureWhite)
    expect(Object.values(declared)).not.toContain(pureBlack)
  })

  it('removes the default Tailwind palette', () => {
    expect(css).toMatch(/--color-\*:\s*initial;/)
  })
})
