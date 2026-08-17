import { describe, expect, it } from 'vitest'
import {
  dedupeTreeCrowns,
  extractModeForOutputType,
  isParcelExtractMode,
  isTreeSampleClass,
  metersPerPixelFromBbox,
  nmsTreeBoxes,
  parcelLayerTitle,
  pxToLonLat,
  treeCrownsFromSamples,
} from './extractFieldsTrees'

describe('extractFieldsTrees helpers', () => {
  it('isParcelExtractMode covers fields / trees / seg / OD', () => {
    expect(isParcelExtractMode('fields')).toBe(true)
    expect(isParcelExtractMode('trees')).toBe(true)
    expect(isParcelExtractMode('fields_trees')).toBe(true)
    expect(isParcelExtractMode('segmentation')).toBe(true)
    expect(isParcelExtractMode('object_detection')).toBe(true)
    expect(isParcelExtractMode('classification')).toBe(false)
  })

  it('extractModeForOutputType splits fields vs YOLO trees', () => {
    expect(extractModeForOutputType('fields')).toBe('fields')
    expect(extractModeForOutputType('segmentation')).toBe('fields')
    expect(extractModeForOutputType('trees')).toBe('trees')
    expect(extractModeForOutputType('object_detection')).toBe('trees')
    expect(extractModeForOutputType('fields_trees')).toBe('both')
  })

  it('parcelLayerTitle includes counts', () => {
    expect(parcelLayerTitle('fields', 12, 0)).toContain('12 fields')
    expect(parcelLayerTitle('trees', 0, 40)).toContain('40 trees')
    expect(parcelLayerTitle('segmentation', 3, 0)).toMatch(/Fields \(FTW\)/)
    expect(parcelLayerTitle('object_detection', 0, 1)).toMatch(/Trees \(YOLO\)/)
  })

  it('isTreeSampleClass matches Tree labels', () => {
    expect(isTreeSampleClass('Tree')).toBe(true)
    expect(isTreeSampleClass('trees')).toBe(true)
    expect(isTreeSampleClass('tree-detection')).toBe(true)
    expect(isTreeSampleClass('Field Boundaries')).toBe(false)
  })

  it('nmsTreeBoxes drops overlapping lower scores', () => {
    const kept = nmsTreeBoxes(
      [
        { xmin: 0, ymin: 0, xmax: 10, ymax: 10, score: 0.9, label: 'Tree' },
        { xmin: 1, ymin: 1, xmax: 11, ymax: 11, score: 0.4, label: 'Tree' },
        { xmin: 50, ymin: 50, xmax: 60, ymax: 60, score: 0.7, label: 'Tree' },
      ],
      0.3,
    )
    expect(kept).toHaveLength(2)
    expect(kept.map(b => b.score).sort()).toEqual([0.7, 0.9])
  })

  it('metersPerPixelFromBbox and pxToLonLat are coherent', () => {
    const bbox: [number, number, number, number] = [10, 20, 10.01, 20.01]
    const mpp = metersPerPixelFromBbox(bbox, 100, 100)
    expect(mpp).toBeGreaterThan(0.5)
    expect(mpp).toBeLessThan(20)
    const [lon, lat] = pxToLonLat(0, 0, bbox, 100, 100)
    expect(lon).toBeCloseTo(10, 5)
    expect(lat).toBeCloseTo(20.01, 5)
  })

  it('treeCrownsFromSamples builds Point crowns inside bbox', () => {
    const bbox: [number, number, number, number] = [0, 0, 1, 1]
    const crowns = treeCrownsFromSamples(
      [
        { class_name: 'Tree', geometry: { type: 'Point', coordinates: [0.5, 0.5] } },
        { class_name: 'Tree', geometry: { type: 'Point', coordinates: [5, 5] } },
        { class_name: 'Soil', geometry: { type: 'Point', coordinates: [0.2, 0.2] } },
      ],
      bbox,
      { radiusM: 5 },
    )
    expect(crowns).toHaveLength(1)
    expect(crowns[0].geometry?.type).toBe('Polygon')
    expect(crowns[0].properties?.source).toBe('sample')
  })

  it('dedupeTreeCrowns keeps highest confidence', () => {
    const near = (lon: number, lat: number, conf: number): GeoJSON.Feature => ({
      type: 'Feature',
      properties: { confidence: conf, class_name: 'Tree' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [lon, lat],
            [lon + 0.00001, lat],
            [lon + 0.00001, lat + 0.00001],
            [lon, lat + 0.00001],
            [lon, lat],
          ],
        ],
      },
    })
    const out = dedupeTreeCrowns([near(10, 10, 0.5), near(10.000001, 10, 0.9)], 20)
    expect(out).toHaveLength(1)
    expect(out[0].properties?.confidence).toBe(0.9)
  })
})
