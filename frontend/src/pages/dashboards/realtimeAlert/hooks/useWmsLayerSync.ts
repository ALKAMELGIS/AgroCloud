import { useCallback, useState } from 'react'
import { bumpWmsCacheKey, syncRealtimeAlertWmsLayer } from '../../../lib/realtimeAlert/wmsLayerSync'

export function useWmsLayerSync() {
  const [wmsCacheKey, setWmsCacheKey] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const syncLayer = useCallback(async (layerId: string) => {
    setSyncing(true)
    setError(null)
    try {
      const result = await syncRealtimeAlertWmsLayer(layerId)
      setWmsCacheKey(k => bumpWmsCacheKey(k))
      setLastSyncAt(result.syncedAt)
      return result
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed')
      throw e
    } finally {
      setSyncing(false)
    }
  }, [])

  return { wmsCacheKey, syncing, lastSyncAt, error, syncLayer, bumpCache: () => setWmsCacheKey(k => bumpWmsCacheKey(k)) }
}
