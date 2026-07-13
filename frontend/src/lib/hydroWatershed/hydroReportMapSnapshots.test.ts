import { describe, expect, it } from 'vitest'
import {
  mapLngLatToMercatorBox,
  type LngLatBbox,
} from '../../pages/satellite/lib/timeSeriesReport/timeSeriesMapSnapshot'

describe('mapLngLatToMercatorBox', () => {
  const bbox: LngLatBbox = {
    minLng: 45.34,
    minLat: 9.31,
    maxLng: 45.54,
    maxLat: 9.5,
  }

  it('places north at the top of the map frame', () => {
    const [, northY] = mapLngLatToMercatorBox(45.44, bbox.maxLat, bbox, 0, 0, 600, 400)
    const [, southY] = mapLngLatToMercatorBox(45.44, bbox.minLat, bbox, 0, 0, 600, 400)
    expect(northY).toBeLessThan(southY)
  })

  it('maps west/east to left/right respectively', () => {
    const [westX] = mapLngLatToMercatorBox(bbox.minLng, 9.4, bbox, 0, 0, 600, 400)
    const [eastX] = mapLngLatToMercatorBox(bbox.maxLng, 9.4, bbox, 0, 0, 600, 400)
    expect(westX).toBeLessThan(eastX)
  })

  it('keeps a square AOI square on screen (no shear from linear lat mapping)', () => {
    const tl = mapLngLatToMercatorBox(45.4, bbox.maxLat, bbox, 0, 0, 600, 400)
    const tr = mapLngLatToMercatorBox(45.5, bbox.maxLat, bbox, 0, 0, 600, 400)
    const bl = mapLngLatToMercatorBox(45.4, bbox.minLat, bbox, 0, 0, 600, 400)
    const topWidth = Math.abs(tr[0] - tl[0])
    const bottomWidth = Math.abs(
      mapLngLatToMercatorBox(45.5, bbox.minLat, bbox, 0, 0, 600, 400)[0] - bl[0],
    )
    expect(Math.abs(topWidth - bottomWidth)).toBeLessThan(0.5)
  })
})
