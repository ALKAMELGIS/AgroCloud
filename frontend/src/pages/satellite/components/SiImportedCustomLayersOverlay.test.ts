import { describe, expect, it } from 'vitest'
import {
  resolveImportedLayerPaint,
  shouldPaintImportedLayerCircles,
} from './SiImportedCustomLayersOverlay'

describe('shouldPaintImportedLayerCircles', () => {
  it('paints circles only for point layers', () => {
    expect(shouldPaintImportedLayerCircles('point')).toBe(true)
  })

  it('hides circles for polygon, line, mixed, raster, and unknown', () => {
    expect(shouldPaintImportedLayerCircles('polygon')).toBe(false)
    expect(shouldPaintImportedLayerCircles('line')).toBe(false)
    expect(shouldPaintImportedLayerCircles('mixed')).toBe(false)
    expect(shouldPaintImportedLayerCircles('raster')).toBe(false)
    expect(shouldPaintImportedLayerCircles('unknown')).toBe(false)
    expect(shouldPaintImportedLayerCircles(null)).toBe(false)
    expect(shouldPaintImportedLayerCircles(undefined)).toBe(false)
  })
})

describe('resolveImportedLayerPaint', () => {
  const geojson = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { 'Actual ET (ETa)': 2.5, crop: 'Wheat' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
        },
      },
      {
        type: 'Feature',
        properties: { 'Actual ET (ETa)': 8, crop: 'Corn' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [2, 0],
              [3, 0],
              [3, 1],
              [2, 1],
              [2, 0],
            ],
          ],
        },
      },
      {
        type: 'Feature',
        properties: { 'Actual ET (ETa)': 12, crop: 'Barley' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [4, 0],
              [5, 0],
              [5, 1],
              [4, 1],
              [4, 0],
            ],
          ],
        },
      },
    ],
  }

  it('applies graduated colors for Actual ET field on outline-only layers', () => {
    const paint = resolveImportedLayerPaint({
      id: 'fields',
      name: 'Field boundaries',
      geojson,
      visible: true,
      source: 'upload',
      color: '#ef4444',
      fillColor: '#ef4444',
      weight: 1.5,
      polygonFillAlpha: 0,
      symbology: {
        useArcGisOnline: false,
        style: 'color',
        field: 'Actual ET (ETa)',
        classes: 3,
        method: 'equal_interval',
        colorRamp: 'viridis',
      },
    })
    expect(JSON.stringify(paint.fill['fill-color'])).toContain('step')
    expect(JSON.stringify(paint.fill['fill-color'])).toContain('Actual ET (ETa)')
    expect(Number(paint.fill['fill-opacity'])).toBeGreaterThan(0)
    expect(JSON.stringify(paint.line['line-color'])).toContain('step')
  })

  it('applies unique-value match colors with class overrides', () => {
    const paint = resolveImportedLayerPaint({
      id: 'fields',
      name: 'Field boundaries',
      geojson,
      visible: true,
      source: 'upload',
      color: '#ef4444',
      polygonFillAlpha: 0,
      symbology: {
        useArcGisOnline: false,
        style: 'unique',
        field: 'crop',
        classes: 8,
        colorRamp: 'viridis',
        classOverrides: { Wheat: { color: '#ff00aa' } },
      },
    })
    expect(JSON.stringify(paint.fill['fill-color'])).toContain('match')
    expect(JSON.stringify(paint.fill['fill-color'])).toContain('#ff00aa')
  })

  it('paints simple upload AOI polygons with a black outline', () => {
    const paint = resolveImportedLayerPaint({
      id: 'aoi-1',
      name: 'AOI',
      geojson: {
        type: 'FeatureCollection',
        features: [geojson.features[0]],
      },
      visible: true,
      source: 'upload',
      color: '#000000',
      fillColor: '#000000',
      weight: 2.5,
      polygonFillAlpha: 0,
    })
    expect(paint.line['line-color']).toBe('#000000')
    expect(paint.line['line-width']).toBeTruthy()
    expect(Number(paint.fill['fill-opacity'])).toBe(0)
  })
})
