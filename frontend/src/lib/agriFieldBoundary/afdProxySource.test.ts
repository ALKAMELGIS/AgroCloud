/**
 * Proxy helpers: Agricultural Field Delineation does not require a client image.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const proxyPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../backend/server/agriFieldBoundaryProxy.js',
)

describe('agriFieldBoundaryProxy AFD sources', () => {
  it('treats agricultural-field-delineation as image-optional in source', () => {
    const src = readFileSync(proxyPath, 'utf8')
    expect(src).toMatch(/agricultural-field-delineation/)
    expect(src).toMatch(/AFD_SOURCES/)
    expect(src).toMatch(/isImageOptionalSource/)
  })
})
