import { useCallback, useEffect, useMemo, useState } from 'react'
import { getGisContentMapRegistry, useGisContentPortal } from '../../../lib/gisContentPortalStore'

export type RealtimeAlertLayerEntry = {
  id: string
  title: string
  kind: 'portal' | 'wms'
  pendingUpdate?: boolean
  layerRevision?: string | null
}

export function useLayerRegistry() {
  useGisContentPortal()
  const [revision, setRevision] = useState(0)

  const layers = useMemo((): RealtimeAlertLayerEntry[] => {
    const registry = getGisContentMapRegistry()
    const portal = (registry ?? []).map(row => ({
      id: row.id,
      title: row.title || row.id,
      kind: 'portal' as const,
      pendingUpdate: Boolean((row as { pendingUpdate?: boolean }).pendingUpdate),
      layerRevision: (row as { layerRevision?: string }).layerRevision ?? null,
    }))
    const wms: RealtimeAlertLayerEntry[] = [
      { id: 'wms-ndvi', title: 'NDVI', kind: 'wms' },
      { id: 'wms-chas', title: 'CHAS', kind: 'wms' },
      { id: 'wms-chas-alert', title: 'CHAS Alert', kind: 'wms' },
    ]
    return [...portal, ...wms]
  }, [revision])

  const refresh = useCallback(() => setRevision(r => r + 1), [])

  useEffect(() => {
    const onStorage = () => refresh()
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [refresh])

  return { layers, refresh }
}
