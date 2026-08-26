import { useEffect, useMemo, useState } from 'react'
import type { CropAlertFieldInput } from '../../../lib/siCropAlertEngine'
import { resolvePlotCentroidLonLat, fetchBatchEt0ByField } from '../lib/timeSeriesReport/waterRequirementEt0'
import { fetchWaporAetBatch } from '../../../lib/waporAetApi'
import type { FieldSummaryModel } from '../lib/timeSeriesReport/buildFieldSummaryModel'
import { buildWaterRequirementForSummary } from '../lib/timeSeriesReport/productionEstimationSheet'
import {
  classifyIndexWaterStress,
  type FieldWaterRequirementResult,
} from '../lib/timeSeriesReport/waterRequirementService'

export type WaterStressUiLevel = 'Low' | 'Moderate' | 'High' | 'Severe' | 'Unknown'

export const WATER_STRESS_THRESHOLDS = {
  moderatePct: 25,
  highPct: 50,
  severePct: 75,
} as const

export function mapWaterStressUiLevel(input: {
  waterStressPercent: number | null
  indexStress: ReturnType<typeof classifyIndexWaterStress>
}): WaterStressUiLevel {
  const pct = input.waterStressPercent
  if (pct != null && Number.isFinite(pct)) {
    if (pct >= WATER_STRESS_THRESHOLDS.severePct) return 'Severe'
    if (pct >= WATER_STRESS_THRESHOLDS.highPct) return 'High'
    if (pct >= WATER_STRESS_THRESHOLDS.moderatePct) return 'Moderate'
    return 'Low'
  }
  const idx = input.indexStress
  if (idx === 'Severe') return 'Severe'
  if (idx === 'High') return 'High'
  if (idx === 'Moderate') return 'Moderate'
  if (idx === 'Low') return 'Low'
  return 'Unknown'
}

async function fetchEt0MmDayForPlot(
  plot: CropAlertFieldInput,
  observationDate: string,
  fromDate: string,
  toDate: string,
): Promise<number | null> {
  const map = await fetchBatchEt0ByField(
    [{ fieldKey: plot.fieldKey, plot, observationDate }],
    fromDate,
    toDate,
  )
  return map.get(plot.fieldKey) ?? null
}

export function useFieldWaterRequirement(input: {
  plot: CropAlertFieldInput | null
  summary: FieldSummaryModel | null
  fromDate: string
  toDate: string
  enabled?: boolean
}): {
  water: FieldWaterRequirementResult | null
  uiStress: WaterStressUiLevel
  loading: boolean
} {
  const [et0MmDay, setEt0MmDay] = useState<number | null>(null)
  const [aetMmDay, setAetMmDay] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const plot = input.plot
  const summary = input.summary
  const obs = summary?.sceneDate?.slice(0, 10) || input.toDate.slice(0, 10)

  useEffect(() => {
    if (!input.enabled || !plot || !summary) {
      setEt0MmDay(null)
      setAetMmDay(null)
      setLoading(false)
      return
    }
    const point = resolvePlotCentroidLonLat(plot)
    if (!point) return

    let cancelled = false
    setLoading(true)
    void (async () => {
      const [et0, aetMap] = await Promise.all([
        fetchEt0MmDayForPlot(plot, obs, input.fromDate, input.toDate),
        fetchWaporAetBatch([
          {
            fieldKey: plot.fieldKey,
            lon: point.lon,
            lat: point.lat,
            observationDate: obs,
          },
        ]).catch(() => new Map<string, number>()),
      ])
      if (cancelled) return
      setEt0MmDay(et0)
      setAetMmDay(aetMap.get(plot.fieldKey) ?? null)
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [input.enabled, plot, summary, obs, input.fromDate, input.toDate])

  const water = useMemo(() => {
    if (!summary) return null
    return buildWaterRequirementForSummary(summary, {
      et0MmDay,
      aetMmDay,
      aetSource: aetMmDay != null ? 'FAO WaPOR AETI (satellite ET product)' : undefined,
    })
  }, [summary, et0MmDay, aetMmDay])

  const uiStress = useMemo(
    () =>
      mapWaterStressUiLevel({
        waterStressPercent: water?.waterStressPercent ?? null,
        indexStress: classifyIndexWaterStress(summary?.ndmi ?? null, summary?.ndwi ?? null),
      }),
    [water?.waterStressPercent, summary?.ndmi, summary?.ndwi],
  )

  return { water, uiStress, loading }
}
