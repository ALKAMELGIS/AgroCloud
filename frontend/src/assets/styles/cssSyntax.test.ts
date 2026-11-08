import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

/**
 * Guards every stylesheet against syntax errors. A broken file only fails at dev-server/build
 * time — and in the browser it takes down the whole app (the boot screen shows "Failed to start").
 */
const SRC = join(__dirname, '..', '..')

function cssFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) cssFiles(p, out)
    else if (p.endsWith('.css')) out.push(p)
  }
  return out
}

describe('stylesheets', () => {
  const files = cssFiles(SRC)

  it('finds the stylesheets', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('all parse without syntax errors', () => {
    const errors: string[] = []
    for (const file of files) {
      try {
        postcss.parse(readFileSync(file, 'utf8'), { from: file })
      } catch (err) {
        const e = err as { line?: number; column?: number; reason?: string }
        errors.push(`${relative(SRC, file)}:${e.line}:${e.column} ${e.reason}`)
      }
    }
    expect(errors).toEqual([])
  })

  it('never use `transition: all` (animate explicit properties only)', () => {
    const offenders = files.filter((f) => /transition:\s*all\b/.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f))
    expect(offenders).toEqual([])
  })
})
