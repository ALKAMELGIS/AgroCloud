import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./fieldBoundaryClient', () => ({
  fetchFowFieldBoundaries: vi.fn(),
}))

import { fetchFowFieldBoundaries } from './fieldBoundaryClient'
import type { FieldBoundaryResult } from './fieldBoundaryClient'
import {
  detectionIsFowCatalog,
  fetchFowValidationReference,
  shouldFetchFowValidationReference,
} from './fowValidationReference'

const fetchFowMock = vi.mocked(fetchFowFieldBoundaries)

function fowResult(features: GeoJSON.Feature[]): FieldBoundaryResult {
  return {
    geojson: { type: 'FeatureCollection', features },
    count: features.length,
    score: 1,
    engine: 'fow',
    device: 'cpu',
    stats: { field: features.length },
    aoiApplied: true,
  }
}

const square: GeoJSON.Feature = {
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [0.01, 0],
        [0.01, 0.01],
        [0, 0.01],
        [0, 0],
      ],
    ],
  },
}

describe('detectionIsFowCatalog', () => {
  it('detects FoW engine / source variants', () => {
    expect(detectionIsFowCatalog('fow')).toBe(true)
    expect(detectionIsFowCatalog('Fields-of-the-World')).toBe(true)
    expect(detectionIsFowCatalog('ftw-live', 'fow')).toBe(true)
    expect(detectionIsFowCatalog('ftw-live', 'ftw')).toBe(false)
    expect(detectionIsFowCatalog('ftw-live', 'ftw_live')).toBe(false)
    expect(detectionIsFowCatalog('delineate-anything')).toBe(false)
  })
})

describe('shouldFetchFowValidationReference', () => {
  it('skips when there is no detection', () => {
    expect(shouldFetchFowValidationReference({ hasDetection: false })).toEqual({
      ok: false,
      notice: null,
    })
  })

  it('skips self-compare when detection is FoW catalog', () => {
    const out = shouldFetchFowValidationReference({
      hasDetection: true,
      engine: 'fow',
      source: 'fow',
      adminIso: 'FR',
    })
    expect(out.ok).toBe(false)
    expect(out.notice).toBeNull()
  })

  it('skips when country catalog is missing (AE)', () => {
    const out = shouldFetchFowValidationReference({
      hasDetection: true,
      engine: 'ftw-live',
      adminIso: 'AE',
    })
    expect(out.ok).toBe(false)
    expect(out.notice).toBeNull()
  })

  it('allows FTW live / Delineate when FoW catalog exists', () => {
    expect(
      shouldFetchFowValidationReference({
        hasDetection: true,
        engine: 'ftw-live',
        source: 'ftw_live',
        adminIso: 'FR',
      }),
    ).toEqual({ ok: true, notice: null })
  })
})

describe('fetchFowValidationReference', () => {
  beforeEach(() => {
    fetchFowMock.mockReset()
  })

  it('returns polygon FeatureCollection and label on success', async () => {
    fetchFowMock.mockResolvedValue(
      fowResult([
        square,
        { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } },
      ]),
    )

    const out = await fetchFowValidationReference({
      bbox: [0, 0, 1, 1],
      adminIso: 'FR',
    })
    expect(out.geojson?.features).toHaveLength(1)
    expect(out.label).toMatch(/FoW \/ FTW dataset · 1 polygon/)
    expect(out.notice).toBeNull()
  })

  it('returns notice when FoW has no polygons in AOI', async () => {
    fetchFowMock.mockResolvedValue(fowResult([]))

    const out = await fetchFowValidationReference({
      bbox: [0, 0, 1, 1],
      adminIso: 'FR',
    })
    expect(out.geojson).toBeNull()
    expect(out.notice).toMatch(/no field polygons/i)
  })

  it('returns notice when country catalog is missing without calling API', async () => {
    const out = await fetchFowValidationReference({
      bbox: [0, 0, 1, 1],
      adminIso: 'AE',
    })
    expect(fetchFowMock).not.toHaveBeenCalled()
    expect(out.notice).toBeNull()
  })

  it('maps fetch errors to a notice', async () => {
    fetchFowMock.mockRejectedValue(new Error('network down'))
    const out = await fetchFowValidationReference({
      bbox: [0, 0, 1, 1],
      adminIso: 'FR',
    })
    expect(out.geojson).toBeNull()
    expect(out.notice).toMatch(/network down/)
  })
})
