import { describe, expect, it } from 'vitest'
import { buildFtwVisualSeamlessRaster } from './ftwGlobalVisualSeamless'

describe('buildFtwVisualSeamlessRaster', () => {
  it('returns null when no features are present', () => {
    expect(buildFtwVisualSeamlessRaster([], [0, 0, 1, 1])).toBeNull()
  })
})
