// The brand palette for places CSS variables can't reach reliably (SVG attributes
// in Recharts). Must match src/theme/tokens.css exactly; tokens.test.ts checks it.

export const tokens = {
  blackSpace: '#131313',
  blackSpaceSoft: '#1a1a1a',
  coolGray: '#7e8893',
  white: '#e9e8e8',
  gold: '#d4af35',
  blue: '#4a7abd',
} as const

/** tokens key -> the CSS custom property it mirrors. */
export const TOKEN_CSS_NAMES: Record<keyof typeof tokens, string> = {
  blackSpace: '--color-black-space',
  blackSpaceSoft: '--color-black-space-soft',
  coolGray: '--color-cool-gray',
  white: '--color-white',
  gold: '--color-gold',
  blue: '--color-blue',
}
