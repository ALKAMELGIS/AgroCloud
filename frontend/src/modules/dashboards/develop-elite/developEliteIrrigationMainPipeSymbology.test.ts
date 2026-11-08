import { describe, expect, it } from 'vitest'
import {
  collectIrrigationMainPipeArrowPlacements,
  irrigationMainPipeArrowSpacingMeters,
  irrigationMainPipeLineWeight,
  irrigationMainPipePathOptions,
} from './developEliteIrrigationMainPipeSymbology'

const DRAWING_INFO = {
  renderer: {
    type: 'uniqueValue',
    field1: 'SUBTYPE',
    uniqueValueInfos: [
      {
        value: '1',
        label: 'Distribution Main',
        symbol: { type: 'esriSLS', style: 'esriSLSSolid', color: [0, 77, 168, 255], width: 14 },
      },
    ],
  },
}

describe('irrigationMainPipeLineWeight', () => {
  it('increases stroke weight when zooming in', () => {
    const far = irrigationMainPipeLineWeight(14, 14)
    const near = irrigationMainPipeLineWeight(14, 18)
    expect(near).toBeGreaterThan(far)
  })
})

describe('irrigationMainPipePathOptions', () => {
  it('uses zoom-aware weight for SUBTYPE lines', () => {
    const low = irrigationMainPipePathOptions(DRAWING_INFO, { SUBTYPE: 1 }, 14)
    const high = irrigationMainPipePathOptions(DRAWING_INFO, { SUBTYPE: 1 }, 18)
    expect(low.color).toBe('#004da8')
    expect(high.weight).toBeGreaterThan(low.weight ?? 0)
    expect(high.lineCap).toBe('round')
  })
})

describe('collectIrrigationMainPipeArrowPlacements', () => {
  it('places arrows along a line string', () => {
    const geometry: GeoJSON.LineString = {
      type: 'LineString',
      coordinates: [
        [54.69, 24.61],
        [54.691, 24.612],
        [54.692, 24.614],
      ],
    }
    const spacing = irrigationMainPipeArrowSpacingMeters(17, 24.61)
    const arrows = collectIrrigationMainPipeArrowPlacements(geometry, spacing)
    expect(arrows.length).toBeGreaterThan(0)
    expect(arrows[0]?.bearingDeg).toBeTypeOf('number')
  })
})
