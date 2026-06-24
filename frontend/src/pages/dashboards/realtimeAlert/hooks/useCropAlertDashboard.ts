import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildAgroStructuresLayerAoiMask,
  fetchAgroStructuresGeoJson,
} from '../../../lib/agroStructuresPrimaryAoi'
import {
  extractCropAlertFieldsFromMask,
  runCropAlertEngine,
  type CropAlertEngineSettings,
  type CropAlertFieldResult,
} from '../../../lib/siCropAlertEngine'
import {
  buildSnapshotsFromSentinelSeries,
  fetchCropAlertSentinelLiveBatch,
} from '../../../lib/siCropAlertSentinelLive'
import { buildCropAlertImageryContext } from '../../../lib/siCropAlertImageryValidation'
import { localIsoDate } from '../../../lib/siSentinelImageryDate'
import { DEFAULT_CROP_ALERT_ENGINE_SETTINGS } from '../../../lib/siCropAlertEngineDefaults'

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
