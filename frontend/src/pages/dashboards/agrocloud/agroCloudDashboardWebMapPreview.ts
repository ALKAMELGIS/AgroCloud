import {
  buildGisContentMapLayerPayload,
  getGisContentRowById,
  type GisContentMapLayerPayload,
} from '../../../lib/gisContentPortalStore'
import { getGisWebMapSnapshotByContentId, type GisWebMapSnapshotV1 } from '../../../lib/gisWebMapPortal'

export type DashboardWebMapPreview = {
  snapshot: GisWebMapSnapshotV1 | null
  layers: GisContentMapLayerPayload[]
}

export function resolveDashboardWebMapPreview(gisContentId: string): DashboardWebMapPreview {
  const snapshot = getGisWebMapSnapshotByContentId(gisContentId)
  if (!snapshot) return { snapshot: null, layers: [] }

  const layers = snapshot.portalLayerIds
    .map(contentId => {
      const row = getGisContentRowById(contentId)
      return row ? buildGisContentMapLayerPayload(row) : null
    })
    .filter((layer): layer is GisContentMapLayerPayload => Boolean(layer))

  return { snapshot, layers }
}
