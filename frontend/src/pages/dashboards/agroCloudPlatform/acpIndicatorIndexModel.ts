import { estimateSaviFromNdvi, resolveDchasOrbPresentation } from '../../../lib/siCropAlertDchasBeacon'
import {
  listPopupSceneDates,
  resolveCropAlertIndexSceneValues,
  resolveIndexTrendFromSeries,
  resolveIndexTrendPresentation,
  resolveLayerLiveIndexMinMaxMean,
  type IndexMinMaxMean,
  type IndexTrendDirection,
  type IndexTrendPresentation,
} from '../../../lib/siCropAlertMapPopupModel'
import type { CropAlertFieldResult } from '../../../lib/siCropAlertEngine'
import type { AcpFieldTableRow } from './acpMapSpatial'

export type AcpIndicatorIndexCode = 'NDVI' | 'NDMI' | 'NDWI' | 'SAVI' | 'EVI' | 'LST' | 'CHAS' | 'DCHAS'

export type AcpIndicatorIndexCard = {
  code: AcpIndicatorIndexCode
  stats: IndexMinMaxMean
  digits: number
  trend: IndexTrendPresentation
}

type SceneIndexKey = 'ndvi' | 'ndmi' | 'ndwi' | 'savi' | 'evi' | 'lst'

function meanFinite(values: number[]): number | null {
  const nums = values.filter(v => Number.isFinite(v))
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function aggregateIndexStats(list: IndexMinMaxMean[], trend: IndexTrendDirection): IndexMinMaxMean {
  const valid = list.filter(s => Number.isFinite(s.mean))
  if (!valid.length) return { min: 0, max: 0, mean: 0, trend: 'flat' }
  const mins = valid.map(s => s.min)
  const maxs = valid.map(s => s.max)
  const means = valid.map(s => s.mean)
  const mean = means.reduce((a, b) => a + b, 0) / means.length
  return {
    min: Number(Math.min(...mins).toFixed(3)),
    max: Number(Math.max(...maxs).toFixed(3)),
    mean: Number(mean.toFixed(3)),
    trend,
  }
}

function scalarStats(values: number[], trend: IndexTrendDirection, digits = 3): IndexMinMaxMean {
  const nums = values.filter(v => Number.isFinite(v))
  if (!nums.length) return { min: 0, max: 0, mean: 0, trend: 'flat' }
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length
  return {
    min: Number(min.toFixed(digits)),
    max: Number(max.toFixed(digits)),
    mean: Number(mean.toFixed(digits)),
    trend,
  }
}

function fieldIndexAtScene(result: CropAlertFieldResult, index: SceneIndexKey, sceneIdx: number): number | null {
  const ndvi = result.ndviSceneValues?.[sceneIdx]
  const z = result.layerLiveZonal

  if (sceneIdx === 0 && z) {
    switch (index) {
      case 'ndvi':
        return z.ndvi.mean
      case 'ndmi':
        return z.ndmi.mean
      case 'ndwi':
        return z.ndwi.mean
      case 'savi':
        return estimateSaviFromNdvi(z.ndvi.mean)
      case 'evi':
        return z.evi?.mean ?? z.ndvi.mean * 1.05
      case 'lst':
        return Number((38 - z.ndvi.mean * 12).toFixed(1))
      default:
        break
    }
  }

  if (ndvi == null || !Number.isFinite(ndvi)) return null

  switch (index) {
    case 'ndvi':
      return ndvi
    case 'ndmi':
      return resolveCropAlertIndexSceneValues(result, 'ndmi')[sceneIdx] ?? null
    case 'ndwi':
      return resolveCropAlertIndexSceneValues(result, 'ndwi')[sceneIdx] ?? null
    case 'savi':
      return estimateSaviFromNdvi(ndvi)
    case 'evi':
      return ndvi * 1.05
    case 'lst':
      return Number((38 - ndvi * 12).toFixed(1))
    default:
      return null
  }
}

function buildViewportSceneSeries(results: CropAlertFieldResult[], index: SceneIndexKey): number[] {
  const maxScenes = Math.max(...results.map(r => r.ndviSceneValues?.length ?? 0), 0)
  const series: number[] = []
  for (let i = 0; i < maxScenes; i += 1) {
    const vals = results
      .map(r => fieldIndexAtScene(r, index, i))
      .filter((v): v is number => v != null && Number.isFinite(v))
    const m = meanFinite(vals)
    if (m != null) series.push(m)
  }
  return series
}

function buildChasSceneSeries(results: CropAlertFieldResult[]): number[] {
  const current = meanFinite(results.map(r => resolveDchasOrbPresentation(r).chasCurrent))
  const previous = meanFinite(
    results
      .map(r => resolveDchasOrbPresentation(r).chasPrevious)
      .filter((v): v is number => v != null && Number.isFinite(v)),
  )
  const series: number[] = []
  if (current != null) series.push(current)
  if (previous != null) series.push(previous)
  return series
}

function resolveViewportSceneDates(results: CropAlertFieldResult[]): string[] {
  const dates = new Set<string>()
  for (const r of results) {
    for (const d of listPopupSceneDates(r)) dates.add(d)
  }
  return [...dates].sort((a, b) => b.localeCompare(a))
}

function makeCard(
  code: AcpIndicatorIndexCode,
  stats: IndexMinMaxMean,
  digits: number,
  sceneDate: string | null,
  previousSceneDate: string | null,
): AcpIndicatorIndexCard {
  return {
    code,
    stats,
    digits,
    trend: resolveIndexTrendPresentation(stats.trend, sceneDate, previousSceneDate),
  }
}

/** Layer Live index cards for map viewport / scoped fields (same indices as crop alert popup). */
export function buildAcpIndicatorIndexCards(rows: AcpFieldTableRow[]): {
  cards: AcpIndicatorIndexCard[]
  sceneDate: string | null
  previousSceneDate: string | null
} {
  const withResults = rows.filter(r => r.result)
  if (!withResults.length) return { cards: [], sceneDate: null, previousSceneDate: null }

  const results = withResults.map(r => r.result!)
  const cropStatuses = results.map(r => resolveLayerLiveIndexMinMaxMean(r))
  const sceneDates = resolveViewportSceneDates(results)
  const sceneDate = sceneDates[0] ?? null
  const previousSceneDate = sceneDates[1] ?? null

  const ndviTrend = resolveIndexTrendFromSeries(buildViewportSceneSeries(results, 'ndvi'))
  const ndmiTrend = resolveIndexTrendFromSeries(buildViewportSceneSeries(results, 'ndmi'))
  const ndwiTrend = resolveIndexTrendFromSeries(buildViewportSceneSeries(results, 'ndwi'))
  const saviTrend = resolveIndexTrendFromSeries(buildViewportSceneSeries(results, 'savi'))
  const eviTrend = resolveIndexTrendFromSeries(buildViewportSceneSeries(results, 'evi'))
  const lstTrend = resolveIndexTrendFromSeries(buildViewportSceneSeries(results, 'lst'))
  const chasTrend = resolveIndexTrendFromSeries(buildChasSceneSeries(results))

  const chasValues = withResults
    .map(r => r.chas)
    .filter((v): v is number => v != null && Number.isFinite(v))
  const deltaValues = withResults
    .map(r => r.deltaChas)
    .filter((v): v is number => v != null && Number.isFinite(v))

  const cards: AcpIndicatorIndexCard[] = [
    makeCard(
      'NDVI',
      aggregateIndexStats(
        cropStatuses.map(c => c.ndvi),
        ndviTrend,
      ),
      2,
      sceneDate,
      previousSceneDate,
    ),
    makeCard(
      'NDMI',
      aggregateIndexStats(
        cropStatuses.map(c => c.ndmi),
        ndmiTrend,
      ),
      2,
      sceneDate,
      previousSceneDate,
    ),
    makeCard(
      'NDWI',
      aggregateIndexStats(
        cropStatuses.map(c => c.ndwi),
        ndwiTrend,
      ),
      2,
      sceneDate,
      previousSceneDate,
    ),
    makeCard(
      'SAVI',
      aggregateIndexStats(
        cropStatuses.map(c => c.savi),
        saviTrend,
      ),
      2,
      sceneDate,
      previousSceneDate,
    ),
    makeCard(
      'EVI',
      aggregateIndexStats(
        cropStatuses.map(c => c.evi),
        eviTrend,
      ),
      2,
      sceneDate,
      previousSceneDate,
    ),
    makeCard(
      'LST',
      aggregateIndexStats(
        cropStatuses.map(c => c.lst),
        lstTrend,
      ),
      1,
      sceneDate,
      previousSceneDate,
    ),
    makeCard('CHAS', scalarStats(chasValues, chasTrend, 3), 3, sceneDate, previousSceneDate),
    makeCard('DCHAS', scalarStats(deltaValues, chasTrend, 3), 3, sceneDate, previousSceneDate),
  ]

  return { cards, sceneDate, previousSceneDate }
}
