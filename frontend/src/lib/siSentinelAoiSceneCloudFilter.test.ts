import { describe, expect, it } from 'vitest'
import { aoiCloudCoverPctFromMaskRgba } from './siSentinelAoiSceneCloudFilter'
import { buildStacSearchBodyForAoi } from './siSentinelLatestScene'

function rgba(w: number, h: number, pixels: Array<[number, number, number, number]>): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let p = 0; p < pixels.length; p += 1) {
    const [r, g, b, a] = pixels[p]!
    const i = p * 4
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = a
  }
  return data
}

describe('siSentinelAoiSceneCloudFilter', () => {
  it('aoiCloudCoverPctFromMaskRgba counts green clear vs red cloud inside AOI', () => {
    const data = rgba(2, 2, [
      [0, 255, 0, 255],
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 255, 0, 255],
    ])
    expect(aoiCloudCoverPctFromMaskRgba(data)).toBe(25)
  })

  it('aoiCloudCoverPctFromMaskRgba returns null when no classified pixels', () => {
    const data = rgba(2, 2, [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    expect(aoiCloudCoverPctFromMaskRgba(data)).toBeNull()
  })
})

describe('siSentinelLatestScene STAC body', () => {
  it('buildStacSearchBodyForAoi does not apply granule eo:cloud_cover filter', () => {
    const body = buildStacSearchBodyForAoi(
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [55.0, 25.0],
              [55.1, 25.0],
              [55.1, 25.1],
              [55.0, 25.1],
              [55.0, 25.0],
            ],
          ],
        },
      },
      { cloudCoverMax: 20 },
    )
    expect(body?.query).toBeUndefined()
  })
})
