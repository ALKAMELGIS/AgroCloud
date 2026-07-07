import { useEffect, useMemo, useRef, useState } from 'react'
import type { CropAlertFieldInput } from '../../../lib/siCropAlertEngine'
import {
  buildImageryIndexInterpretation,
  type ImageryIndexInterpretation,
} from '../../../lib/imageryIndexInterpretationEngine'
import { fetchLayerClassAreas, layerSupportsClassArea } from '../../../lib/siLayerClassAreaEngine'
import type { LayerClassAreaResult } from '../../../lib/siLayerClassAreaEngine'
import type { SentinelHubDailyIndexMeans } from '../../../lib/sentinelHubStatisticsApi'

export type UseImageryIndexInterpretationOptions = {
  field: CropAlertFieldInput | null
  layerId: string
  sceneDate: string
  dailyRows: SentinelHubDailyIndexMeans[]
  chartLabels: string[]
  chartValues: number[]
  enabled: boolean
}

export function useImageryIndexInterpretation({
  field,
  layerId,
  sceneDate,
  dailyRows,
  chartLabels,
  chartValues,
  enabled,
}: UseImageryIndexInterpretationOptions): {
  interpretation: ImageryIndexInterpretation | null
  loadingAreas: boolean
} {
  const [histogram, setHistogram] = useState<LayerClassAreaResult | null>(null)
  const [loadingAreas, setLoadingAreas] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const primaryLayerId = layerId.trim().toUpperCase()
  const date = sceneDate.trim().slice(0, 10)

  useEffect(() => {
    abortRef.current?.abort()
    setHistogram(null)
    if (!enabled || !field?.geometry || !primaryLayerId || !date) {
      setLoadingAreas(false)
      return
    }
    if (!layerSupportsClassArea(primaryLayerId)) {
      setLoadingAreas(false)
      return
    }

    const ac = new AbortController()
    abortRef.current = ac
    setLoadingAreas(true)

    void fetchLayerClassAreas({
      geometry: field.geometry,
      layerId: primaryLayerId,
      sceneDate: date,
      signal: ac.signal,
    })
      .then(result => {
        if (!ac.signal.aborted) setHistogram(result)
      })
      .catch(() => {
        if (!ac.signal.aborted) setHistogram(null)
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoadingAreas(false)
      })

    return () => ac.abort()
  }, [enabled, field?.fieldKey, field?.geometry, primaryLayerId, date])

  const interpretation = useMemo(() => {
    if (!enabled || !primaryLayerId || !date) return null
    return buildImageryIndexInterpretation({
      layerId: primaryLayerId,
      sceneDate: date,
      geometry: field?.geometry,
      dailyRows,
      chartLabels,
      chartValues,
      histogram,
    })
  }, [
    enabled,
    primaryLayerId,
    date,
    field?.geometry,
    dailyRows,
    chartLabels,
    chartValues,
    histogram,
  ])

  return { interpretation, loadingAreas }
}
