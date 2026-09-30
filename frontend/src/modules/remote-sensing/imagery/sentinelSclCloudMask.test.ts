import { describe, expect, it } from 'vitest'
import {
  aoiCloudMaskStatsFromRgba,
  buildSentinelCloudRgbFallbackFunctions,
  buildSentinelSceneCloudLogEntry,
  isSentinelCloudPixel,
  SENTINEL_SCL_CLOUD_MASK_EXPR,
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

  it('treats only SCL cloud classes and high CLP as clouds', () => {
    expect(isSentinelCloudPixel(9, 0)).toBe(true)
    expect(isSentinelCloudPixel(8, 0)).toBe(true)
    expect(isSentinelCloudPixel(10, 10)).toBe(true)
    expect(isSentinelCloudPixel(1, 180)).toBe(true)
    expect(isSentinelCloudPixel(1, 0.7)).toBe(true)
  })

  it('never treats vegetation, soil, water, shadows or snow as clouds', () => {
    const clpHigh = 200
    expect(isSentinelCloudPixel(2, clpHigh)).toBe(false)
    expect(isSentinelCloudPixel(3, clpHigh)).toBe(false)
    expect(isSentinelCloudPixel(4, clpHigh)).toBe(false)
    expect(isSentinelCloudPixel(5, clpHigh)).toBe(false)
    expect(isSentinelCloudPixel(6, clpHigh)).toBe(false)
    expect(isSentinelCloudPixel(7, clpHigh)).toBe(false)
    expect(isSentinelCloudPixel(11, clpHigh)).toBe(false)
    expect(isSentinelCloudPixel(4, 0.9)).toBe(false)
    expect(isSentinelCloudPixel(1, 25)).toBe(false)
  })

  it('evalscript mask excludes valid surfaces and does not use CLM dilation', () => {
    expect(SENTINEL_SCL_CLOUD_MASK_EXPR).toContain('scl == 8 || scl == 9 || scl == 10')
    expect(SENTINEL_SCL_CLOUD_MASK_EXPR).toContain('scl == 3')
    expect(SENTINEL_SCL_CLOUD_MASK_EXPR).toContain('scl == 4')
    expect(SENTINEL_SCL_CLOUD_MASK_EXPR).toContain('scl == 6')
    expect(SENTINEL_SCL_CLOUD_MASK_EXPR).toMatch(/^!/)
    expect(SENTINEL_SCL_CLOUD_MASK_EXPR).not.toContain('CLM')
    const fns = buildSentinelCloudRgbFallbackFunctions()
    expect(fns).toContain('if (scl == 2 || scl == 3 || scl == 4 || scl == 5 || scl == 6 || scl == 7 || scl == 11) return false')
    expect(fns).toContain('if (scl == 8 || scl == 9 || scl == 10) return true')
    expect(fns).not.toContain('CLM')
  })
})
