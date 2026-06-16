import {
  getGisContentItemDetails,
  getGisContentPortalRows,
  updateGisContentItemDetails,
  upsertGisContentPortalApp,
} from '../../../lib/gisContentPortalStore'
import { isAgroCloudDashboardApp } from '../../master/gisContentPortalData'
import { DEFAULT_AGROCLOUD_DASHBOARD_CONFIG, type AgroCloudDashboardConfig } from './agroCloudDashboardData'
import { normalizeDashboardConfig } from './agroCloudDashboardDataSourceEngine'

/** Default GIS Content folder for user-saved dashboards (see `GIS_CONTENT_FOLDERS`). */
export const AGROCLOUD_DASHBOARD_GIS_CONTENT_FOLDER = 'dashboards'

export function saveAgroCloudDashboardAsApp(input: {
  id?: string
  title: string
  config: AgroCloudDashboardConfig
}) {
  const folderId =
    input.config.folderId && input.config.folderId !== 'all'
      ? input.config.folderId
      : AGROCLOUD_DASHBOARD_GIS_CONTENT_FOLDER

  const row = upsertGisContentPortalApp({
    id: input.id,
    title: input.title,
    sharing: input.config.sharing,
    folderId,
    format: 'dashboard',
  })
  updateGisContentItemDetails(row.id, {
    agroCloudDashboard: input.config,
    appFormat: 'dashboard',
  })
  return row
}

export function createAgroCloudDashboardFromForm(input: {
  title: string
  tags?: string[]
  summary?: string
  folderId?: string
}) {
  const row = upsertGisContentPortalApp({
    title: input.title,
    folderId: input.folderId ?? 'all',
    format: 'dashboard',
  })
  updateGisContentItemDetails(row.id, {
    agroCloudDashboard: DEFAULT_AGROCLOUD_DASHBOARD_CONFIG,
    description: input.summary,
    tags: input.tags,
  })
  return row
}

export function loadAgroCloudDashboardConfig(dashboardId: string): AgroCloudDashboardConfig | null {
  const details = getGisContentItemDetails(dashboardId) as {
    agroCloudDashboard?: AgroCloudDashboardConfig
    arcgisDashboard?: AgroCloudDashboardConfig
  }
  const raw = details.agroCloudDashboard ?? details.arcgisDashboard ?? null
  if (!raw) return null
  return normalizeDashboardConfig(raw)
}

export function listSavedAgroCloudDashboardApps() {
  return getGisContentPortalRows().filter(row => isAgroCloudDashboardApp(row, getGisContentItemDetails(row.id)))
}
