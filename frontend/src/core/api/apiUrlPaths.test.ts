import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every backend route lives under /api, so a literal `apiUrl('/…')` path without that prefix is a
 * request that can only 404. (The GFS weather raster layer never loaded because of one.)
 */
const SRC = join(__dirname, '..', '..')

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name !== 'node_modules') yield* sourceFiles(p)
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      yield p
    }
  }
}

describe('apiUrl() paths', () => {
  it('all literal paths start with /api/', () => {
    const offenders: string[] = []
    const call = /apiUrl\(\s*(['"`])(\/[^'"`]*)\1?/g
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(call)) {
        const path = m[2]!
        if (!path.startsWith('/api/') && path !== '/api') {
          const line = text.slice(0, m.index).split('\n').length
          offenders.push(`${relative(SRC, file)}:${line} → ${path}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
