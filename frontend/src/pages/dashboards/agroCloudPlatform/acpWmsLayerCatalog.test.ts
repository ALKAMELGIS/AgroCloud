import { describe, expect, it } from 'vitest'
import {
  buildAcpWmsChunkLayerKey,
  normalizeActiveAcpWmsLayers,
  resolveAcpWmsLayerOpacity,
  toggleActiveAcpWmsLayer,
} from './acpWmsLayerCatalog'

describe('acpWmsLayerCatalog', () => {
  it('namespaces chunk keys per index layer', () => {
    expect(buildAcpWmsChunkLayerKey('ndvi', 'p-0')).toBe('NDVI__p-0')
  })

  it('keeps at least one active layer', () => {
    expect(toggleActiveAcpWmsLayer(['NDVI'], 'NDVI')).toBeNull()
    expect(toggleActiveAcpWmsLayer(['NDVI', 'NDMI'], 'NDVI')).toEqual(['NDMI'])
  })

  it('normalizes active layer list', () => {
    expect(normalizeActiveAcpWmsLayers(['ndvi', 'NDVI', ''], 'NDMI')).toEqual(['NDVI'])
    expect(normalizeActiveAcpWmsLayers([], 'NDMI')).toEqual(['NDMI'])
  })

  it('assigns primary full opacity and secondary blend opacity', () => {
    expect(resolveAcpWmsLayerOpacity('NDVI', 'NDVI', true)).toBe(1)
    expect(resolveAcpWmsLayerOpacity('NDMI', 'NDVI', true)).toBe(0.52)
    expect(resolveAcpWmsLayerOpacity('NDMI', 'NDVI', false)).toBe(0)
  })
})
