import { describe, expect, it } from 'vitest'
import {
  buildChirpsAnalytics,
  rainfallAnomalyIndex,
  rainfallDistributionIndex,
  rainfallTrendIndex,
  standardizedPrecipitationIndex,
  totalPrecipitation,
  waterAvailabilityIndex,
} from './chirpsIndices'

describe('chirpsIndices', () => {
  it('sums total precipitation', () => {
    expect(
      totalPrecipitation([
        { date: '2024-01-01', rainfallMm: 2 },
        { date: '2024-01-02', rainfallMm: 3 },
        { date: '2024-01-03', rainfallMm: null },
      ]),
    ).toBe(5)
  })

  it('computes RAI, SPI, RDI, RTI, WAI', () => {
    expect(rainfallAnomalyIndex(120, 100)).toBeCloseTo(20)
    expect(standardizedPrecipitationIndex(20, 10, 5)).toBeCloseTo(2)
    expect(rainfallDistributionIndex(80, 100)).toBeCloseTo(0.8)
    const rti = rainfallTrendIndex([
      { date: 'a', rainfallMm: 1 },
      { date: 'b', rainfallMm: 2 },
      { date: 'c', rainfallMm: 3 },
      { date: 'd', rainfallMm: 4 },
    ])
    expect(rti).toBeCloseTo(1, 5)
    const wai = waterAvailabilityIndex({ rainfallMm: 25, ndmi: 0.2, ndwi: 0.1, rainfallRefMm: 50 })
    expect(wai).toBeGreaterThan(0)
    expect(wai!).toBeLessThanOrEqual(1)
  })

  it('builds analytics bundle', () => {
    const a = buildChirpsAnalytics(
      [
        { date: '2024-01-01', rainfallMm: 10 },
        { date: '2024-02-01', rainfallMm: 20 },
        { date: '2024-03-01', rainfallMm: 30 },
      ],
      { ndmi: 0.1, ndwi: 0 },
    )
    expect(a.totalMm).toBe(60)
    expect(a.meanMm).toBe(20)
    expect(a.spi).not.toBeNull()
    expect(a.spiLabel).toBeTruthy()
  })
})
