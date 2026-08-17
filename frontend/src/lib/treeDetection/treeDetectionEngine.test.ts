import { describe, expect, it } from 'vitest'
import {
  assembleTreeResult,
  crownsFromBoxes,
  formatTreeId,
} from './treeDetectionEngine'
import type { TreeImageryMosaic } from './webMercatorTiles'

function stubMosaic(overrides?: Partial<TreeImageryMosaic>): TreeImageryMosaic {
  const width = 10
  const height = 10
  return {
    canvas: {} as HTMLCanvasElement,
    imageData: { data: new Uint8ClampedArray(width * height * 4), width, height } as ImageData,
    width,
    height,
    zoom: 18,
    originWorldPxX: 0,
    originWorldPxY: 0,
    mapSizePx: 256 * 2 ** 18,
    bbox: { west: 55, south: 25, east: 55.001, north: 25.001 },
    metersPerPixel: 0.5,
    tilesLoaded: 1,
    tilesTotal: 1,
    contentStdDev: 0.2,
    saturationMean: 0.3,
    pxToLngLat: (px, py) => [55 + px * 0.0001, 25 + py * 0.0001],
    ...overrides,
  }
}

describe('formatTreeId', () => {
  it('pads Tree_001 style ids', () => {
    expect(formatTreeId(0)).toBe('Tree_001')
    expect(formatTreeId(4)).toBe('Tree_005')
  })
})

describe('YOLO box centre → GIS Point', () => {
  const aoi: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [54.9, 24.9],
        [55.2, 24.9],
        [55.2, 25.2],
        [54.9, 25.2],
        [54.9, 24.9],
      ],
    ],
  }

  it('writes Tree_ID X Y Confidence Date Image_Source on Point features', () => {
    const pass = crownsFromBoxes({
      boxes: [{ xmin: 2, ymin: 2, xmax: 6, ymax: 6, score: 0.91, label: 'Tree' }],
      mosaic: stubMosaic(),
      geometry: aoi,
      provider: 'esri',
    })
    const result = assembleTreeResult({
      passes: [pass],
      geometry: aoi,
      provider: 'esri',
    })
    expect(result.geojson.features).toHaveLength(1)
    const f = result.geojson.features[0]!
    expect(f.geometry?.type).toBe('Point')
    const p = f.properties as Record<string, unknown>
    expect(p.Tree_ID).toBe('Tree_001')
    expect(p.X).toBe(p.Y === undefined ? undefined : p.X)
    expect(typeof p.X).toBe('number')
    expect(typeof p.Y).toBe('number')
    expect(p.Confidence).toBe(0.91)
    expect(String(p.Date)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(p.Image_Source).toBe('Esri World Imagery')
  })
})
