import { describe, expect, it } from 'vitest'
import { runGeoAiStatsCommand } from './geoAiStatsEngine'
import type { GeoAiMapLayer } from './geoExplorerLayerContext'

/** One polygon layer named "Parcels" with two coded features. */
const parcelsLayer: GeoAiMapLayer = {
  name: 'Parcels',
  clientLayerId: 'lyr-parcels',
  data: {
    type: 'FeatureCollection',
    features: [
      {
        properties: { Farm_Code: 'MH101', Area_ha: 12 },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] },
      },
      {
        properties: { Farm_Code: 'MH102', Area_ha: 30 },
        geometry: { type: 'Polygon', coordinates: [[[2, 2], [2, 3], [3, 3], [2, 2]]] },
      },
    ],
  },
}

describe('runGeoAiStatsCommand — world place vs. layer routing', () => {
  it('defers world place navigation to the geocoder (returns null)', () => {
    // The reported bug: this was wrongly answered with a layer-stats table.
    expect(runGeoAiStatsCommand('Show me Dubai in map', [parcelsLayer])).toBeNull()
    expect(runGeoAiStatsCommand('show me Riyadh', [parcelsLayer])).toBeNull()
    expect(runGeoAiStatsCommand('اعرض دبي على الخريطة', [parcelsLayer])).toBeNull()
    expect(runGeoAiStatsCommand('where is Paris', [parcelsLayer])).toBeNull()
  })

  it('defers world place navigation even when no layers are loaded', () => {
    expect(runGeoAiStatsCommand('Show me Dubai in map', [])).toBeNull()
  })

  it('keeps a query LOCAL when a code token matches a loaded feature', () => {
    const res = runGeoAiStatsCommand('show me MH101 on map', [parcelsLayer])
    expect(res?.handled).toBe(true)
  })

  it('keeps a query LOCAL when it names a loaded layer', () => {
    const res = runGeoAiStatsCommand('show me Parcels', [parcelsLayer])
    expect(res?.handled).toBe(true)
  })

  it('keeps analytical queries LOCAL (not treated as place navigation)', () => {
    const res = runGeoAiStatsCommand('show me parcels where Area_ha > 20', [parcelsLayer])
    expect(res?.handled).toBe(true)
  })
})
