import type { LayerData } from '../pages/satellite/components/LayerManager'
import { gisContentAppFormatRowMeta } from '../pages/master/gisContentPortalData'
import {
  getGisContentItemDetails,
  updateGisContentItemDetails,
  type GisContentItemDetails,
} from './gisContentPortalStore'
import { GIS_CONTENT_DEFAULT_OWNER, type GisContentRow } from '../pages/master/gisContentPortalData'
import { parseGisContentPortalLayerUrl } from './gisContentPortalTableUtils'

export type GisWebMapSnapshotV1 = {
  version: 1
  exportedAt: string
  basemap: string
  projection: '2d' | 'globe'
  center?: { lat: number; lng: number } | null
  zoom?: number | null
  view?: {
    longitude: number
    latitude: number
    zoom: number
    pitch?: number
    bearing?: number
  }
  portalLayerIds: string[]
}

export type GisWebMapGlobeView = {
  longitude: number
  latitude: number
  zoom: number
  pitch?: number
  bearing?: number
}

export function buildGisWebMapSnapshot(input: {
  basemap: string
  projection: '2d' | 'globe'
  globeViewState?: GisWebMapGlobeView
  mapCenterZoom?: { lat: number; lng: number; zoom: number } | null
  layers: LayerData[]
}): GisWebMapSnapshotV1 {
  const portalLayerIds = [
    ...new Set(
      input.layers
        .map(layer => parseGisContentPortalLayerUrl(String(layer.url || '')))
        .filter((id): id is string => Boolean(id)),
    ),
  ]

  const base: GisWebMapSnapshotV1 = {
    version: 1,
    exportedAt: new Date().toISOString(),
    basemap: input.basemap,
    projection: input.projection,
    portalLayerIds,
  }

  if (input.projection === 'globe' && input.globeViewState) {
    return { ...base, view: { ...input.globeViewState } }
  }

  if (input.mapCenterZoom) {
    return {
      ...base,
      center: { lat: input.mapCenterZoom.lat, lng: input.mapCenterZoom.lng },
      zoom: input.mapCenterZoom.zoom,
    }
  }

  return { ...base, center: null, zoom: null }
}

export function readGisWebMapSnapshot(details: GisContentItemDetails | undefined): GisWebMapSnapshotV1 | null {
  const raw = details?.webMap
  if (!raw || typeof raw !== 'object' || (raw as GisWebMapSnapshotV1).version !== 1) return null
  return raw as GisWebMapSnapshotV1
}

/** Persist Web Map row + snapshot into GIS Content portal store cache (via store upsert). */
export function mergeGisWebMapPortalRow(
  rows: GisContentRow[],
  itemDetails: Record<string, GisContentItemDetails>,
  input: {
    id?: string
    title: string
    snapshot: GisWebMapSnapshotV1
    sharing?: GisContentRow['sharing']
    folderId?: string
  },
): { rows: GisContentRow[]; itemDetails: Record<string, GisContentItemDetails>; row: GisContentRow } {
  const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const id = input.id?.trim() || `webmap-${Date.now()}`
  const existing = rows.find(r => r.id === id)
  const typeMeta = gisContentAppFormatRowMeta('web-map')
  const row: GisContentRow = {
    id,
    title: input.title.trim() || 'Untitled map',
    ...typeMeta,
    modified: now,
    created: existing?.created ?? now,
    sharing: input.sharing ?? existing?.sharing ?? 'organization',
    folderId: input.folderId ?? existing?.folderId ?? 'all',
    owner: existing?.owner ?? GIS_CONTENT_DEFAULT_OWNER,
  }
  const nextRows = existing ? rows.map(r => (r.id === id ? row : r)) : [...rows, row]
  const nextDetails = {
    ...itemDetails,
    [id]: {
      ...(itemDetails[id] ?? {}),
      appFormat: 'web-map' as const,
      webMap: input.snapshot,
      description: `Web map saved from Map Viewer on ${now}.`,
    },
  }
  return { rows: nextRows, itemDetails: nextDetails, row }
}

export function getGisWebMapSnapshotByContentId(contentId: string): GisWebMapSnapshotV1 | null {
  return readGisWebMapSnapshot(getGisContentItemDetails(contentId))
}

export function patchGisWebMapItemDetails(contentId: string, snapshot: GisWebMapSnapshotV1): void {
  updateGisContentItemDetails(contentId, {
    appFormat: 'web-map',
    webMap: snapshot,
  })
}
