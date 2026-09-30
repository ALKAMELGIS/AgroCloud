import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildAgroStructuresLayerAoiMask,
  fetchAgroStructuresGeoJson,
} from '@/modules/remote-sensing/imagery/agroStructuresPrimaryAoi'
import {
  DEFAULT_CROP_ALERT_ENGINE_SETTINGS,
  extractCropAlertFieldsFromMask,
  runCropAlertEngine,
  type CropAlertEngineSettings,
  type CropAlertFieldResult,
} from '@/modules/remote-sensing/indices/siCropAlertEngine'
import {
  buildSnapshotsFromSentinelSeries,
  fetchCropAlertSentinelLiveBatch,
} from '@/modules/remote-sensing/indices/siCropAlertSentinelLive'
import { buildCropAlertImageryContext } from '@/modules/remote-sensing/indices/siCropAlertImageryValidation'
import { localIsoDate } from '@/modules/remote-sensing/imagery/siSentinelImageryDate'

export function useCropAlertDashboard(analysisDate: string, settings?: Partial<CropAlertEngineSettings>) {
  const [aoiMask, setAoiMask] = useState<GeoJSON.FeatureCollection | null>(null)
  const [results, setResults] = useState<CropAlertFieldResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const runSeq = useRef(0)

  const engineSettings: CropAlertEngineSettings = {
    ...DEFAULT_CROP_ALERT_ENGINE_SETTINGS,
    ...settings,
    enabled: true,
  }

  const refresh = useCallback(async () => {
    const seq = ++runSeq.current
    setLoading(true)
    setError(null)
    try {
      const geojson = await fetchAgroStructuresGeoJson()
      const mask = buildAgroStructuresLayerAoiMask(geojson)
      if (seq !== runSeq.current) return
      setAoiMask(mask)
      const fields = extractCropAlertFieldsFromMask(mask)
      if (!fields.length) {
        setResults([])
        return
      }
      const date = analysisDate || localIsoDate()
      const imageryContext = buildCropAlertImageryContext(date, date, true)
      const sentinelBatch = await fetchCropAlertSentinelLiveBatch(fields, imageryContext)
      if (seq !== runSeq.current) return
      const snapshots = buildSnapshotsFromSentinelSeries(sentinelBatch)
      const engineResults = await runCropAlertEngine({
        fields,
        snapshots,
        settings: engineSettings,
        imageryContext,
      })
      if (seq !== runSeq.current) return
      setResults(engineResults)
    } catch (e) {
      if (seq !== runSeq.current) return
      setError(e instanceof Error ? e.message : 'Crop alert engine failed')
      setResults([])
    } finally {
      if (seq === runSeq.current) setLoading(false)
    }
  }, [analysisDate, engineSettings])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { aoiMask, results, loading, error, refresh }
}
