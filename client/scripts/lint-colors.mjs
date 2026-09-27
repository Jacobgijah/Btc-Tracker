#!/usr/bin/env node
// npm run lint:colors: keeps the client on-brand.
// Fails on, anywhere in src/ except the token files:
//   1. colour literals: #hex, rgb()/rgba()/hsl()/hsla()/oklch()/... and quoted CSS colour names
//   2. default Tailwind palette classes (bg-red-500, text-slate-600, ...), which no longer exist
//   3. raw brand-token or white/black classes where a semantic alias exists (text-white -> text-text)
//   4. dark: variants (the app is dark only) and the old bitcoin-orange (btc) classes

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')
export const TOKEN_FILES = ['src/theme/tokens.css', 'src/theme/tokens.ts']
const EXTENSIONS = /\.(tsx?|css|mjs|js)$/

const PREFIXES =
  'bg|text|border|ring|fill|stroke|from|to|via|outline|divide|placeholder|accent|caret|decoration|shadow|ring-offset'
const PALETTE =
  'red|green|orange|yellow|gray|slate|zinc|neutral|stone|amber|lime|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'

// Which alias to use instead of a raw token (the message only; any alias is fine).
const ALIAS_HINT = {
  white: 'text / (surface for backgrounds)',
  black: 'bg / on-accent',
  'black-space': 'bg / on-accent',
  'black-space-soft': 'surface',
  'cool-gray': 'text-muted / border-strong / border',
  gold: 'accent / gain / warning',
  blue: 'info / loss / error',
}

export const RULES = [
  {
    name: 'colour literal',
    pattern: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b(?!\s*\/\/\s*lint-colors-ok)/g,
    hint: 'use a token (CSS alias class, or src/theme/tokens.ts in charts)',
  },
  {
    name: 'colour function',
    pattern: /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/g,
    hint: 'use a token',
  },
  {
    name: 'named colour',
    pattern: /(["'`])(?:white|black|red|green|orange|yellow|gray|grey|silver|purple|pink)\1/g,
    hint: 'use a token',
  },
  {
    name: 'default Tailwind palette class',
    pattern: new RegExp(`\\b(?:${PREFIXES})-(?:${PALETTE})-\\d{2,3}\\b`, 'g'),
    hint: 'the default palette is removed; use a semantic alias',
  },
  {
    name: 'raw token class (use the alias)',
    pattern: new RegExp(
      `\\b(?:${PREFIXES})-(black-space-soft|black-space|cool-gray|white|black|gold|blue)(?![\\w-])`,
      'g',
    ),
    hint: (m) => `use an alias: ${ALIAS_HINT[m[1]]}`,
  },
  {
    name: 'dark: variant',
    pattern: /(?<![\w-])dark:[\w[]/g,
    hint: 'the app is dark only; drop the dark: variant',
  },
  {
    name: 'old bitcoin-orange class',
    pattern: new RegExp(`\\b(?:${PREFIXES}|after:bg|peer-checked:\\w+)-btc(?:-\\d+)?\\b`, 'g'),
    hint: 'bitcoin orange is gone; use accent',
  },
]

/** Violations in one file's text: [{ line, column, rule, match, hint }]. */
export function findColorViolations(text) {
  const found = []
  const lines = text.split(/\r?\n/)
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      for (const m of line.matchAll(rule.pattern)) {
        found.push({
          line: i + 1,
          column: m.index + 1,
          rule: rule.name,
          match: m[0],
          hint: typeof rule.hint === 'function' ? rule.hint(m) : rule.hint,
        })
      }
    }
  })
  return found
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) yield* walk(full)
    else if (EXTENSIONS.test(name)) yield full
  }
}

function main() {
  let count = 0
  for (const file of walk(SRC)) {
    const rel = relative(ROOT, file).split(sep).join('/')
    if (TOKEN_FILES.includes(rel)) continue
    for (const v of findColorViolations(readFileSync(file, 'utf8'))) {
      count += 1
      console.error(`${rel}:${v.line}:${v.column}  ${v.rule}: "${v.match}" - ${v.hint}`)
    }
  }
  if (count) {
    console.error(`\nlint:colors found ${count} problem${count === 1 ? '' : 's'}.`)
    process.exit(1)
  }
  console.log('lint:colors: only brand tokens in use.')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
