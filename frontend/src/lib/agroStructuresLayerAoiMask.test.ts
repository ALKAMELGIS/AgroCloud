import { describe, expect, it } from 'vitest'
import {
  agroStructuresLayerAoiSignature,
  buildAgroStructuresLayerAoiMask,
  countAgroStructuresPolygons,
  isAgroStructuresSentinelMaskStructureType,
  resolveAgroStructuresStructureTypeLabel,
} from './agroStructuresPrimaryAoi'
import {
  buildSentinelHubWmsAoiClipChunks,
  buildSentinelHubWmsDisplayChunks,
  getDrawnGeometry,
} from './sentinelHubWmsAoiClip'

const poly = (id: number, structureType: number, ring: [number, number][]) => ({
  type: 'Feature',
  properties: { OBJECTID: id, Farm_Name: `F${id}`, Structure_Type: structureType },
  geometry: { type: 'Polygon', coordinates: [ring] },
})

const ring: [number, number][] = [
  [55.1, 25.1],
  [55.11, 25.1],
  [55.11, 25.11],
  [55.1, 25.11],
  [55.1, 25.1],
]

describe('layer-wide Agro_Structures AOI mask', () => {
  it('resolves Structure_Type codes to Farm Plots / PIVOT labels', () => {
    expect(resolveAgroStructuresStructureTypeLabel({ Structure_Type: 1007 })).toBe('Farm Plots')
    expect(resolveAgroStructuresStructureTypeLabel({ Structure_Type: 1006 })).toBe('PIVOT')
    expect(resolveAgroStructuresStructureTypeLabel({ Structure_Type: 1000 })).toBe('Greenhouse')
    expect(resolveAgroStructuresStructureTypeLabel({ Structure_Type: 1001 })).toBe('Nethouse')
    expect(isAgroStructuresSentinelMaskStructureType({ Structure_Type: 1000 })).toBe(false)
    expect(isAgroStructuresSentinelMaskStructureType({ Structure_Type: 'PIVOT' })).toBe(true)
  })

  it('builds mask only from Farm Plots and PIVOT polygons', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        poly(1, 1007, ring),
        poly(2, 1006, ring),
        poly(3, 1000, ring),
        poly(4, 1001, ring),
      ],
    }
    const mask = buildAgroStructuresLayerAoiMask(fc)
    expect(mask?.features).toHaveLength(2)
    expect(countAgroStructuresPolygons(fc)).toBe(2)
    expect(agroStructuresLayerAoiSignature(fc)).toContain('st:fp-pivot|n2')
  })

  it('merges filtered FeatureCollection into MultiPolygon for WMS GEOMETRY', () => {
    const fc = buildAgroStructuresLayerAoiMask({
      type: 'FeatureCollection',
      features: [poly(1, 1007, ring), poly(2, 1006, ring)],
    })
    const geom = getDrawnGeometry(fc)
    expect(geom?.type).toBe('MultiPolygon')
    const chunks = buildSentinelHubWmsAoiClipChunks(fc, 'NDVI')
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks[0]?.geometryWkt3857).toMatch(/^MULTIPOLYGON\(|^POLYGON\(/)

    const display = buildSentinelHubWmsDisplayChunks(fc, 'NDMI')
    expect(display.length).toBeGreaterThan(0)
    expect(display.every(c => c.geometryWkt3857 && c.evalscriptB64)).toBe(true)
  })
})
