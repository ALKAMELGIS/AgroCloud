import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import { fetchBatchEt0ByField, resolvePlotCentroidLonLat } from './waterRequirementEt0'

vi.mock('../../../../lib/openMeteoEt0Api', () => ({
  fetchOpenMeteoEt0Batch: vi.fn(async (entries: Array<{ fieldKey: string }>) => {
    const out = new Map<string, number>()
    for (const e of entries) out.set(e.fieldKey, 4.2)
    return out
  }),
}))

vi.mock('../../../../lib/openMeteoWeather', () => ({
  fetchOpenMeteoHistoryRange: vi.fn(async () => ({
    timezone: 'UTC',
    startDate: '2024-06-01',
    endDate: '2024-06-30',
    points: [
      {
        time: '2024-06-15T12:00',
        et0Mm: 3.5,
        precipitationMm: 0,
        temperatureC: 20,
        weatherCode: 0,
        humidityPct: 50,
        windSpeedKmh: 10,
        windDirectionDeg: 0,
        pressureHpa: 1010,
        snowfallCm: null,
        shortwaveRadiationWm2: null,
      },
    ],
  })),
}))

const poly: GeoJSON.Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [20.4, 44.8],
      [20.41, 44.8],
      [20.41, 44.81],
      [20.4, 44.81],
      [20.4, 44.8],
    ],
  ],
}

function makePlot(partial: Partial<CropAlertFieldInput> & { fieldKey: string }): CropAlertFieldInput {
  return {
    fieldKey: partial.fieldKey,
    objectId: partial.objectId ?? '1',
    farmName: partial.farmName ?? 'Plot',
    farmCode: '',
    structureType: 'AOI',
    country: '',
    city: '',
    centroid: partial.centroid ?? [0, 0],
    geometry: partial.geometry,
  }
}

describe('resolvePlotCentroidLonLat', () => {
  it('computes centroid from geometry when plot centroid is missing', () => {
    const plot = makePlot({ fieldKey: 'a', geometry: poly, centroid: [0, 0] })
    const point = resolvePlotCentroidLonLat(plot)
    expect(point).not.toBeNull()
    expect(point!.lon).toBeCloseTo(20.405, 2)
    expect(point!.lat).toBeCloseTo(44.805, 2)
  })
})

describe('fetchBatchEt0ByField', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns ET0 keyed by fieldKey via backend proxy', async () => {
    const plot = makePlot({ fieldKey: 'field-a', geometry: poly, centroid: [20.405, 44.805] })
    const map = await fetchBatchEt0ByField(
      [{ fieldKey: 'field-a', plot, observationDate: '2024-06-15' }],
      '2024-06-01',
      '2024-06-30',
    )
    expect(map.get('field-a')).toBe(4.2)
  })
})
