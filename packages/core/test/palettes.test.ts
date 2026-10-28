import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ACCENTS,
  cssVarName,
  PALETTES,
  uniwindThemeCss,
  withAccent,
  type Accent,
  type Palette
} from '../src/palettes'

const MAIN_CSS = new URL('../../../apps/desktop/src/renderer/src/assets/main.css', import.meta.url)

// Splits on commas outside parentheses, so light-dark(rgb(…), …) keeps its inner colour whole.
const args = (s: string): string[] => {
  const out = ['']
  let depth = 0
  for (const ch of s) {
    depth += ch === '(' ? 1 : ch === ')' ? -1 : 0
    if (ch === ',' && depth === 0) out.push('')
    else out[out.length - 1] += ch
  }
  return out.map((a) => a.trim())
}

const decls = (body: string): Record<string, string> =>
  Object.fromEntries(
    [...body.matchAll(/(--[\w-]+|color-scheme)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()])
  )

// Desktop's variables for one theme: the shared block, then the theme's overrides, with light-dark() and
// var() resolved the way the browser would.
const desktopVars = (css: string, theme: Palette, accent: Accent): Record<string, string> => {
  const block = (sel: RegExp): string => css.match(sel)?.[1] ?? ''
  const vars = {
    ...decls(block(/:root,\s*\[data-theme\]\s*\{([^}]*)\}/)),
    ...decls(block(new RegExp(`\\[data-theme='${theme}'\\]\\s*\\{([^}]*)\\}`))),
    ...decls(block(new RegExp(`\\[data-accent='${accent}'\\] \\[data-theme\\]\\s*\\{([^}]*)\\}`)))
  }
  const dark = vars['color-scheme'] === 'dark'
  const resolve = (v: string): string => {
    const ld = v.match(/^light-dark\((.*)\)$/)
    if (ld) return resolve(args(ld[1])[dark ? 1 : 0])
    const ref = v.match(/^var\((--[\w-]+)\)$/)
    return ref ? resolve(vars[ref[1]] ?? v) : v
  }
  return Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, resolve(v)]))
}

// #rrggbb, rgb(r g b / a) and rgba(r, g, b, a) all become "r,g,b,a".
const rgba = (c: string): string => {
  const hex = c.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i)
  if (hex) return [...hex.slice(1).map((h) => parseInt(h, 16)), 1].join()
  const [r, g, b, a = '1'] = c.replace(/^rgba?\(|\)$/g, '').split(/[\s,/]+/)
  return [r, g, b, a].map(Number).join()
}

// WCAG contrast ratio of two #rrggbb colours.
const contrast = (a: string, b: string): number => {
  const lum = (hex: string): number => {
    const [r, g, b] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('palettes', () => {
  const css = readFileSync(MAIN_CSS, 'utf8')

  const combos = (Object.keys(PALETTES) as Palette[]).flatMap((p) =>
    ACCENTS.map((a) => [p, a] as const)
  )

  it.each(combos)('match desktop main.css: %s + %s', (theme, accent) => {
    const desktop = desktopVars(css, theme, accent)
    const { scheme, ...colors } = withAccent(PALETTES[theme], accent)
    expect(desktop['color-scheme']).toBe(scheme)
    for (const [key, value] of Object.entries(colors))
      expect(rgba(desktop[cssVarName(key)] ?? 'missing'), `${theme} ${cssVarName(key)}`).toBe(
        rgba(value)
      )
  })

  it.each(combos)('keep the accent readable: %s + %s', (theme, accent) => {
    const c = withAccent(PALETTES[theme], accent)
    expect(contrast(c.onAccent, c.accent)).toBeGreaterThanOrEqual(4.5)
    for (const bg of [c.canvas, c.panel, c.card])
      expect(contrast(c.accentFg, bg)).toBeGreaterThanOrEqual(4.5)
  })

  it("generate mobile's Uniwind themes", async () => {
    await expect(uniwindThemeCss()).toMatchFileSnapshot('../../../apps/mobile/src/theme.gen.css')
  })
})
