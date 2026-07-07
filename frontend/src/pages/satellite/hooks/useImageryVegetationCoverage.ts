import { useEffect, useMemo, useRef, useState } from 'react'
import type { CropAlertFieldInput } from '../../../lib/siCropAlertEngine'
import {
  buildVegetationCoverageComparison,
  buildVegetationCoverageFromHistogram,
  buildVegetationCoverageInsights,
  buildVegetationCoverageTrend,
  estimateVegetationCoverageFromMean,
  type VegetationCoverageComparison,
  type VegetationCoverageInsights,
  type VegetationCoverageSummary,
  type VegetationCoverageTrendPoint,
} from '../../../lib/vegetationCoverageEngine'
import { fetchLayerClassAreas, layerSupportsClassArea } from '../../../lib/siLayerClassAreaEngine'
import type { LayerClassAreaResult } from '../../../lib/siLayerClassAreaEngine'
import { geodesicAreaM2 } from '../../../lib/siLayerClassAreaEngine'

export type UseImageryVegetationCoverageOptions = {
  field: CropAlertFieldInput | null
  layerId: string
  sceneDate: string
  chartLabels: string[]
  chartValues: number[]
  enabled: boolean
}

export function useImageryVegetationCoverage({
  field,
  layerId,
  sceneDate,
  chartLabels,
  chartValues,
  enabled,
}: UseImageryVegetationCoverageOptions): {
  summary: VegetationCoverageSummary | null
  comparison: VegetationCoverageComparison | null
  trend: VegetationCoverageTrendPoint[]
  insights: VegetationCoverageInsights | null
  loading: boolean
  supported: boolean
} {
  const [histogram, setHistogram] = useState<LayerClassAreaResult | null>(null)
  const [compareHistograms, setCompareHistograms] = useState<LayerClassAreaResult[]>([])
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const primaryLayerId = layerId.trim().toUpperCase()
  const date = sceneDate.trim().slice(0, 10)
  const isNdvi = primaryLayerId === 'NDVI'
  const supported = isNdvi && layerSupportsClassArea('NDVI')

  const compareDates = useMemo(() => {
    if (!enabled || chartLabels.length < 2) return [] as string[]
    const first = chartLabels[0]!
    const last = chartLabels[chartLabels.length - 1]!
    const unique = [first]
    if (last !== first) unique.push(last)
    return unique.filter(d => d !== date)
  }, [enabled, chartLabels, date])

  useEffect(() => {
    abortRef.current?.abort()
    setHistogram(null)
    setCompareHistograms([])

    if (!enabled || !field?.geometry || !date || !supported) {
      setLoading(false)
      return
    }

    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true)

    const datesToFetch = [date, ...compareDates]
    void Promise.all(
      datesToFetch.map(d =>
        fetchLayerClassAreas({
          geometry: field.geometry!,
          layerId: 'NDVI',
          sceneDate: d,
          signal: ac.signal,
        }).catch(() => null),
      ),
    )
      .then(results => {
        if (ac.signal.aborted) return
        const primary = results[0]
        setHistogram(primary)
        setCompareHistograms(results.slice(1).filter(Boolean) as LayerClassAreaResult[])
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false)
      })

    return () => ac.abort()
  }, [enabled, field?.fieldKey, field?.geometry, date, supported, compareDates.join('|')])

  const summary = useMemo((): VegetationCoverageSummary | null => {
    if (!enabled || !date || !isNdvi) return null
    if (histogram?.rows?.length) {
      return buildVegetationCoverageFromHistogram(histogram, field?.geometry, date)
    }
    const idx = chartLabels.indexOf(date)
    const mean = idx >= 0 ? chartValues[idx] : chartValues[chartValues.length - 1]
    if (mean != null && Number.isFinite(mean)) {
      return estimateVegetationCoverageFromMean(mean, field?.geometry, date)
    }
    return null
  }, [enabled, date, isNdvi, histogram, field?.geometry, chartLabels, chartValues])

  const comparison = useMemo((): VegetationCoverageComparison | null => {
    if (!enabled || !summary || compareDates.length === 0) return null
    const summaries: VegetationCoverageSummary[] = [summary]
    for (let i = 0; i < compareDates.length; i += 1) {
      const hist = compareHistograms[i]
      const compareDate = compareDates[i]!
      if (hist?.rows?.length) {
        summaries.push(buildVegetationCoverageFromHistogram(hist, field?.geometry, compareDate))
      }
    }
    if (summaries.length < 2) return null
    summaries.sort((a, b) => a.sceneDate.localeCompare(b.sceneDate))
    return buildVegetationCoverageComparison(summaries)
  }, [enabled, summary, compareDates, compareHistograms, field?.geometry])

  const trend = useMemo((): VegetationCoverageTrendPoint[] => {
    if (!enabled || !isNdvi) return []
    const totalAoiHa = geodesicAreaM2(field?.geometry) / 10_000
    return buildVegetationCoverageTrend(chartLabels, chartValues, totalAoiHa)
  }, [enabled, isNdvi, field?.geometry, chartLabels, chartValues])

  const insights = useMemo(
    () => (summary ? buildVegetationCoverageInsights(summary) : null),
    [summary],
  )

  return { summary, comparison, trend, insights, loading, supported }
}
