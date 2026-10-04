import { useCallback, useEffect, useState } from 'react'
import type { AgroCloudDashboardConfig } from './agroCloudDashboardData'
import { resolveDashboardViewSettings } from './agroCloudDashboardLayout'
import { refreshGisContentHostedFeatureLayerFromSource } from '@/modules/gis/layers/gisContentPortalStore'

export function collectAgroCloudDashboardGisContentIds(config: AgroCloudDashboardConfig): string[] {
  const ids = new Set<string>()
  for (const ds of config.dataSources ?? []) {
    if (ds.gisContentId) ids.add(ds.gisContentId)
  }
  for (const el of config.elements) {
    if (el.gisContentId) ids.add(el.gisContentId)
  }
  return [...ids]
}

/** ArcGIS Dashboard–style manual refresh: reload hosted feature layers from ArcGIS services. */
export async function refreshAgroCloudDashboardData(config: AgroCloudDashboardConfig): Promise<void> {
  const ids = collectAgroCloudDashboardGisContentIds(config)
  if (!ids.length) return
  await Promise.all(
    ids.map(id =>
      refreshGisContentHostedFeatureLayerFromSource(id).catch(() => null),
    ),
  )
}

export function useAgroCloudDashboardRefresh(config: AgroCloudDashboardConfig) {
  const [busy, setBusy] = useState(false)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    setBusy(true)
    try {
      await refreshAgroCloudDashboardData(config)
      setLastRefreshedAt(new Date())
    } finally {
      setBusy(false)
    }
  }, [config])

  const viewSettings = resolveDashboardViewSettings(config)
  useEffect(() => {
    if (!viewSettings.autoRefresh) return
    const minutes = Math.max(1, viewSettings.autoRefreshMinutes)
    const id = window.setInterval(() => {
      void refresh()
    }, minutes * 60_000)
    return () => window.clearInterval(id)
  }, [refresh, viewSettings.autoRefresh, viewSettings.autoRefreshMinutes])

  return { refresh, busy, lastRefreshedAt }
}
