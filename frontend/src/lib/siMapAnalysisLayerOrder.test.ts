import { describe, expect, it, vi } from 'vitest'
import {
  isSiAnalysisRasterMapLayerId,
  isSiCropAiPredictionRasterLayerId,
  isSiStackedAnalysisRasterMapLayerId,
  syncSiMapAnalysisLayerOrder,
} from './siMapAnalysisLayerOrder'

describe('siMapAnalysisLayerOrder', () => {
  it('treats ping-pong sentinel raster layers as analysis rasters', () => {
    expect(isSiAnalysisRasterMapLayerId('sentinel-layer-aoi-layer-0-s0')).toBe(true)
    expect(isSiAnalysisRasterMapLayerId('sentinel-draw-layer-1')).toBe(true)
    expect(isSiAnalysisRasterMapLayerId('agrocloud-basemap-layer-0')).toBe(false)
  })

  it('treats Crop AI prediction raster as a stacked analysis layer', () => {
    expect(isSiCropAiPredictionRasterLayerId('crop-ai-prediction-raster')).toBe(true)
    expect(isSiStackedAnalysisRasterMapLayerId('crop-ai-prediction-raster')).toBe(true)
    expect(isSiAnalysisRasterMapLayerId('crop-ai-prediction-raster')).toBe(false)
  })

  it('keeps drawn AOI fill under Crop AI raster and outline above it', () => {
    let order = [
      'basemap',
      'drawn-index-geometry-fill',
      'crop-ai-prediction-raster',
      'drawn-index-geometry-line',
    ]

    const map = {
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
      setPaintProperty: vi.fn(),
    }

    syncSiMapAnalysisLayerOrder(map as any, {})

    const fillIdx = order.indexOf('drawn-index-geometry-fill')
    const rasterIdx = order.indexOf('crop-ai-prediction-raster')
    const lineIdx = order.indexOf('drawn-index-geometry-line')
    expect(fillIdx).toBeLessThan(rasterIdx)
    expect(lineIdx).toBeGreaterThan(rasterIdx)
  })

  it('keeps drawn AOI fill under Sentinel WMS and outline above it', () => {
    // Simulate the previous bug order: fill ended above the raster after sync.
    let order = [
      'basemap',
      'agro-fill',
      'agro-line',
      'custom-aoi-fill',
      'custom-aoi-line',
      'drawn-index-geometry-fill',
      'sentinel-draw-layer-0',
      'drawn-index-geometry-line',
    ]

    const map = {
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
      setPaintProperty: vi.fn(),
    }

    syncSiMapAnalysisLayerOrder(map as any, {
      agroFillId: 'agro-fill',
      agroLineId: 'agro-line',
      extraFillIdsUnderRaster: ['custom-aoi-fill'],
      extraOutlineIdsAboveRaster: ['custom-aoi-line'],
      suppressAgroFillWhenWms: true,
    })

    const fillIdx = order.indexOf('drawn-index-geometry-fill')
    const customFillIdx = order.indexOf('custom-aoi-fill')
    const rasterIdx = order.indexOf('sentinel-draw-layer-0')
    const lineIdx = order.indexOf('drawn-index-geometry-line')
    const customLineIdx = order.indexOf('custom-aoi-line')
    const agroFillIdx = order.indexOf('agro-fill')
    expect(fillIdx).toBeGreaterThanOrEqual(0)
    expect(rasterIdx).toBeGreaterThan(fillIdx)
    expect(rasterIdx).toBeGreaterThan(customFillIdx)
    expect(lineIdx).toBeGreaterThan(rasterIdx)
    expect(customLineIdx).toBeGreaterThan(rasterIdx)
    expect(agroFillIdx).toBeLessThan(rasterIdx)
    expect(map.setPaintProperty).toHaveBeenCalledWith('agro-fill', 'fill-opacity', 0)
  })

  it('parks satellite basemap rasters under imported shapefile fill/line', () => {
    let order = [
      'background',
      'custom-aoi-fill',
      'custom-aoi-line',
      'agrocloud-basemap-layer-0',
    ]

    const map = {
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
      setPaintProperty: vi.fn(),
    }

    syncSiMapAnalysisLayerOrder(map as any, {})

    expect(order.indexOf('agrocloud-basemap-layer-0')).toBeLessThan(order.indexOf('custom-aoi-fill'))
    expect(order.indexOf('custom-aoi-line')).toBeGreaterThan(order.indexOf('agrocloud-basemap-layer-0'))
  })
})
