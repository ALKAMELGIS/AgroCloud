import { describe, expect, it } from 'vitest'
import {
  buildDevelopEliteSpaceStarCatalog,
  __developEliteSpaceStarCatalogForTests,
} from './developEliteMapSpaceStarfieldCanvas'

describe('developEliteMapSpaceStarfieldCanvas', () => {
  it('builds a stable dense star catalog', () => {
    const a = buildDevelopEliteSpaceStarCatalog(500)
    const b = buildDevelopEliteSpaceStarCatalog(500)
    expect(a).toHaveLength(500)
    expect(a[0]?.dir).toEqual(b[0]?.dir)
    expect(__developEliteSpaceStarCatalogForTests().length).toBeGreaterThan(2000)
  })
})
