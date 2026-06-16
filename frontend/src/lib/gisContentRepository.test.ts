import { describe, expect, it } from 'vitest'
import {
  defaultGisContentMapLayerConfig,
  mergeGisContentMapLayerConfig,
  resolveGisContentMapLayerConfig,
  emptyGisContentMapRegistry,
} from './gisContentRepository'

describe('gisContentRepository', () => {
  it('returns defaults when no stored config exists', () => {
    const registry = emptyGisContentMapRegistry()
    const config = resolveGisContentMapLayerConfig('layer-1', registry, 2)
    expect(config.order).toBe(2)
    expect(config.visible).toBe(true)
    expect(config.opacity).toBe(1)
  })

  it('merges style patches without dropping existing fields', () => {
    const base = defaultGisContentMapLayerConfig(0)
    const merged = mergeGisContentMapLayerConfig(base, {
      style: { strokeColor: '#ff0000' },
    })
    expect(merged.style?.strokeColor).toBe('#ff0000')
    expect(merged.style?.fillColor).toBe(base.style?.fillColor)
  })
})
