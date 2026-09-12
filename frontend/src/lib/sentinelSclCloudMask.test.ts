import { describe, expect, it } from 'vitest'
import {
  aoiCloudMaskStatsFromRgba,
  buildSentinelSceneCloudLogEntry,
  SI_SENTINEL_MIN_AOI_CLEAR_FRACTION,
} from './sentinelSclCloudMask'

describe('sentinelSclCloudMask', () => {
  it('aoiCloudMaskStatsFromRgba computes clear vs cloud pixel counts', () => {
    const data = new Uint8ClampedArray([
      0, 255, 0, 255, // clear
      255, 0, 0, 255, // cloud
      0, 255, 0, 255, // clear
      0, 255, 0, 255, // clear
    ])
    const stats = aoiCloudMaskStatsFromRgba(data)
    expect(stats.validCount).toBe(3)
    expect(stats.maskedCount).toBe(1)
    expect(stats.aoiCloudCoverPct).toBe(25)
    expect(stats.aoiClearCoverPct).toBe(75)
  })

  it('buildSentinelSceneCloudLogEntry marks partial cloud scenes usable', () => {
    const entry = buildSentinelSceneCloudLogEntry(
      '2024-06-01',
      {
        clearCount: 70,
        cloudCount: 30,
        maskedCount: 30,
        validCount: 70,
        aoiCloudCoverPct: 30,
        aoiClearCoverPct: 70,
      },
      { originalCloudCoverage: 45 },
    )
    expect(entry.usable).toBe(true)
    expect(entry.status).toBe('partial_cloud_masked')
    expect(entry.originalCloudCoverage).toBe(45)
  })

  it('rejects only when clear fraction below minimum floor', () => {
    const entry = buildSentinelSceneCloudLogEntry('2024-06-02', {
      clearCount: 0,
      cloudCount: 100,
      maskedCount: 100,
      validCount: 0,
      aoiCloudCoverPct: 100,
      aoiClearCoverPct: 0,
    })
    expect(entry.usable).toBe(false)
    expect(entry.status).toBe('no_clear_pixels')
    expect(SI_SENTINEL_MIN_AOI_CLEAR_FRACTION).toBeLessThan(0.01)
  })
})
