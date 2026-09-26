import { describe, expect, it } from 'vitest'
import type { DemGrid } from '../hydroWatershed/terrainTiles'
import { worldPxToLngLat } from '../treeDetection/webMercatorTiles'
import { sampleCutFillAtLngLat } from './cutFillMapSample'
import type { CutFillAnalysisResult } from './cutFillTypes'

function demAt(zoom: number, originX: number, originY: number, w: number, h: number): DemGrid {
  return {
    width: w,
    height: h,
    elev: new Float32Array(w * h),
    bbox: { west: 0, east: 1, south: 0, north: 1 },
    zoom,
    originWorldPxX: originX,
    originWorldPxY: originY,
    metersPerPixel: 10,
    cornerCoords: [
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ],
    tilesLoaded: 1,
    tilesTotal: 1,
    pxToLngLat: (px, py) => worldPxToLngLat(originX + px, originY + py, zoom),
  }
}

function resultFor(dem: DemGrid): CutFillAnalysisResult {
  const n = dem.width * dem.height
  const difference = new Float32Array(n).fill(NaN)
  const classification = new Uint8Array(n)
  const existingElev = new Float32Array(n)
  const designElev = new Float32Array(n)
  const i = 3 * dem.width + 2
  difference[i] = 1.5
  classification[i] = 1
  existingElev[i] = 110
  designElev[i] = 108.5
  return {
    dem,
    existingElev,
    designElev,
    difference,
    classification,
    summary: {
      cutVolumeM3: 150,
      fillVolumeM3: 0,
      netVolumeM3: 150,
      cutAreaM2: 100,
      fillAreaM2: 0,
      noChangeAreaM2: 0,
      maxCutM: 1.5,
      maxFillM: 0,
      avgAbsDiffM: 1.5,
      cellAreaM2: 100,
      activeCellCount: 1,
    },
    rows: [],
    parameters: {
      verticalToleranceM: 0.15,
      contourIntervalM: 5,
      crsLabel: 'EPSG:32636',
      verticalDatumLabel: 'Ellipsoidal',
    },
    diffLayer: { dataUrl: '', coordinates: dem.cornerCoords, opacity: 1 },
    classLayer: { dataUrl: '', coordinates: dem.cornerCoords, opacity: 1 },
  }
}

describe('sampleCutFillAtLngLat', () => {
  it('returns ΔZ, elevations, area, and volume for the clicked CUT cell', () => {
    const dem = demAt(14, 4000, 5000, 8, 8)
    const result = resultFor(dem)
    const [lng, lat] = worldPxToLngLat(4000 + 2.4, 5000 + 3.2, 14)
    const hit = sampleCutFillAtLngLat(result, lng, lat)
    expect(hit).not.toBeNull()
    expect(hit?.type).toBe('CUT')
    expect(hit?.existingZ).toBe(110)
    expect(hit?.designZ).toBe(108.5)
    expect(hit?.difference).toBe(1.5)
    expect(hit?.areaM2).toBe(100)
    expect(hit?.volumeM3).toBe(150)
    expect(hit?.ring).toHaveLength(5)
  })

  it('returns null outside the analysed grid', () => {
    const dem = demAt(14, 4000, 5000, 8, 8)
    const result = resultFor(dem)
    const [lng, lat] = worldPxToLngLat(10, 10, 14)
    expect(sampleCutFillAtLngLat(result, lng, lat)).toBeNull()
  })
})
