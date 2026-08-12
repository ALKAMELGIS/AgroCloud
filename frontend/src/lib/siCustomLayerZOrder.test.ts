import { describe, expect, it } from 'vitest'
import {
  isSiBasemapStyleLayerId,
  siCustomLayersBuriedUnderBasemap,
  siParkBasemapRastersBelowOverlays,
  siRaiseCustomLayersAboveBasemap,
} from './siCustomLayerZOrder'

function fakeMap(initial: string[]) {
  let order = [...initial]
  return {
    get order() {
      return order
    },
    getStyle: () => ({ layers: order.map(id => ({ id })) }),
    getLayer: (id: string) => (order.includes(id) ? { id } : undefined),
    moveLayer: (id: string, beforeId?: string) => {
      const from = order.indexOf(id)
      if (from < 0) return
      order.splice(from, 1)
      if (!beforeId) {
        order.push(id)
        return
      }
      const to = order.indexOf(beforeId)
      if (to < 0) {
        order.push(id)
        return
      }
      order.splice(to, 0, id)
    },
  }
}

describe('siCustomLayerZOrder', () => {
  it('recognizes satellite / street basemap raster ids', () => {
    expect(isSiBasemapStyleLayerId('agrocloud-basemap-layer-0')).toBe(true)
    expect(isSiBasemapStyleLayerId('google-earth-sat-layer')).toBe(true)
    expect(isSiBasemapStyleLayerId('sat3d-base-layer')).toBe(true)
    expect(isSiBasemapStyleLayerId('custom-123-AOI_shp-fill')).toBe(false)
  })

  it('detects an imported shapefile buried under the basemap', () => {
    const map = fakeMap([
      'background',
      'custom-1-fill',
      'custom-1-line',
      'agrocloud-basemap-layer-0',
    ])
    expect(siCustomLayersBuriedUnderBasemap(map, ['custom-1'])).toBe(true)
  })

  it('raises imported fill and line above the basemap, with draw chrome on top', () => {
    const map = fakeMap([
      'background',
      'custom-1-fill',
      'custom-1-line',
      'agrocloud-basemap-layer-0',
      'drawn-index-geometry-line',
    ])
    siRaiseCustomLayersAboveBasemap(map, ['custom-1'])
    const fillIdx = map.order.indexOf('custom-1-fill')
    const lineIdx = map.order.indexOf('custom-1-line')
    const baseIdx = map.order.indexOf('agrocloud-basemap-layer-0')
    const chromeIdx = map.order.indexOf('drawn-index-geometry-line')
    expect(fillIdx).toBeGreaterThan(baseIdx)
    expect(lineIdx).toBeGreaterThan(baseIdx)
    expect(chromeIdx).toBeGreaterThan(lineIdx)
    expect(siCustomLayersBuriedUnderBasemap(map, ['custom-1'])).toBe(false)
  })

  it('raises already-unburied overlays so soft basemap swaps cannot hide AOI', () => {
    const map = fakeMap([
      'background',
      'agrocloud-basemap-layer-0',
      'custom-aoi-fill',
      'custom-aoi-line',
      'sentinel-other-raster',
    ])
    expect(siCustomLayersBuriedUnderBasemap(map, ['custom-aoi'])).toBe(false)
    siRaiseCustomLayersAboveBasemap(map, ['custom-aoi'])
    expect(map.order.indexOf('custom-aoi-line')).toBeGreaterThan(
      map.order.indexOf('sentinel-other-raster'),
    )
    expect(map.order.indexOf('custom-aoi-fill')).toBeGreaterThan(
      map.order.indexOf('agrocloud-basemap-layer-0'),
    )
  })

  it('raises overlays that sat under Google Earth / 3D satellite basemaps', () => {
    const map = fakeMap([
      'custom-shp-fill',
      'custom-shp-line',
      'google-earth-sat-layer',
      'sat3d-base-layer',
    ])
    siRaiseCustomLayersAboveBasemap(map, ['custom-shp'])
    expect(map.order.indexOf('custom-shp-line')).toBeGreaterThan(map.order.indexOf('sat3d-base-layer'))
    expect(map.order.indexOf('custom-shp-fill')).toBeGreaterThan(map.order.indexOf('google-earth-sat-layer'))
  })

  it('parks opaque basemap rasters under the first overlay even before raise', () => {
    const map = fakeMap([
      'background',
      'custom-aoi-fill',
      'custom-aoi-line',
      'agrocloud-basemap-layer-0',
    ])
    siParkBasemapRastersBelowOverlays(map)
    expect(map.order.indexOf('agrocloud-basemap-layer-0')).toBeLessThan(map.order.indexOf('custom-aoi-fill'))
    expect(map.order.indexOf('custom-aoi-line')).toBeGreaterThan(map.order.indexOf('agrocloud-basemap-layer-0'))
  })
})
