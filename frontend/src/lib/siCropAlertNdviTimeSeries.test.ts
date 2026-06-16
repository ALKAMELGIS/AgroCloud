import { describe, expect, it } from 'vitest'
import { analyzeNdviSceneSeries, pickLastNdviScenes } from './siCropAlertNdviTimeSeries'
import type { SentinelHubDailyIndexMeans } from './sentinelHubStatisticsApi'

describe('siCropAlertNdviTimeSeries', () => {
  const daily: SentinelHubDailyIndexMeans[] = [
    { date: '2026-05-15', ndvi: 0.55, ndwi: 0.1, ndmi: 0.2 },
    { date: '2026-05-20', ndvi: 0.88, ndwi: 0.2, ndmi: 0.3 },
    { date: '2026-05-27', ndvi: 0.86, ndwi: 0.19, ndmi: 0.29 },
    { date: '2026-06-03', ndvi: 0.78, ndwi: 0.18, ndmi: 0.28 },
  ]

  it('pickLastNdviScenes returns newest first up to 3', () => {
    const scenes = pickLastNdviScenes(daily, '2026-06-08', 3)
    expect(scenes.map(s => s.ndvi)).toEqual([0.78, 0.86, 0.88])
    expect(scenes.map(s => s.date)).toEqual(['2026-06-03', '2026-05-27', '2026-05-20'])
  })

  it('analyzeNdviSceneSeries computes mean and 2-scene delta at adaptive anchor', () => {
    const analysis = analyzeNdviSceneSeries(daily, '2026-06-08', { maxScenes: 3 })
    expect(analysis?.anchorDate).toBe('2026-06-03')
    expect(analysis?.ndviMean3).toBeCloseTo(0.84, 2)
    expect(analysis?.ndviChangePct2).toBeCloseTo(-9.3, 1)
    expect(analysis?.ndviDelta2).toBeCloseTo(-0.08, 2)
  })

  it('preferLatestAvailable anchors on newest valid scene and previous temporal scene', () => {
    const sparse: SentinelHubDailyIndexMeans[] = [
      { date: '2026-06-06', ndvi: 0.82, ndwi: 0.2, ndmi: 0.3 },
      { date: '2026-05-30', ndvi: 0.78, ndwi: 0.19, ndmi: 0.29 },
    ]
    const analysis = analyzeNdviSceneSeries(sparse, '2026-06-01', {
      preferLatestAvailable: true,
      maxScenes: 2,
    })
    expect(analysis?.currentDate).toBe('2026-06-06')
    expect(analysis?.scenes.map(s => s.date)).toEqual(['2026-06-06', '2026-05-30'])
    expect(analysis?.ndviChangePct2).toBeCloseTo(5.1, 0)
  })
})
