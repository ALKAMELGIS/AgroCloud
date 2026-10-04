import { computeStableGisFeatureKey } from '@/modules/gis/layers/gisFeatureStableKey'
import { buildSiAoiFieldRecord, type SiAoiFieldRecord } from '@/modules/remote-sensing/imagery/siAoiFields'
import {
  SI_IMAGERY_COMMITTED_AOI_KEY,
  SI_IMAGERY_DRAWN_AOI_LABEL,
} from '@/modules/remote-sensing/temporal-analysis/siImageryTimeSeriesFields'

function structureLabel(properties: Record<string, unknown> | null | undefined, index: number): string {
  const p = properties ?? {}
  const candidates = [
    p.name,
    p.NAME,
    p.fieldName,
    p.FieldName,
    p.FARM_NAME,
    p.FarmName,
    p.T_100,
    p.OBJECTID,
  ]
  for (const raw of candidates) {
    const s = String(raw ?? '').trim()
    if (s) return s
  }
  return `Structure ${index + 1}`
}

export function developEliteStructuresToAoiFields(
  geojson: GeoJSON.FeatureCollection,
): SiAoiFieldRecord[] {
  const out: SiAoiFieldRecord[] = []
  geojson.features.forEach((feature, index) => {
    const geometry = feature.geometry
    if (geometry?.type !== 'Polygon' && geometry?.type !== 'MultiPolygon') return
    const id = computeStableGisFeatureKey(feature, index)
    out.push(buildSiAoiFieldRecord(geometry, structureLabel(feature.properties as Record<string, unknown>, index), index, id))
  })
  return out
}

export function developEliteCommittedAoiGeometry(
  clip: GeoJSON.FeatureCollection | null | undefined,
): GeoJSON.Geometry | null {
  if (!clip?.features?.length) return null
  for (const feature of clip.features) {
    const geometry = feature.geometry
    if (geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon') return geometry
  }
  return null
}

/** Develop Elite time series: only the user-drawn AOI (not portfolio / AgroLocation structures). */
export function developEliteDrawnAoiToAoiFields(
  clip: GeoJSON.FeatureCollection | null | undefined,
): SiAoiFieldRecord[] {
  const geometry = developEliteCommittedAoiGeometry(clip)
  if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) return []
  return [
    buildSiAoiFieldRecord(geometry, SI_IMAGERY_DRAWN_AOI_LABEL, 0, SI_IMAGERY_COMMITTED_AOI_KEY),
  ]
}
