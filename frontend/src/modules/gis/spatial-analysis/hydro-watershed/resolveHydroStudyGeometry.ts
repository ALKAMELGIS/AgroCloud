import { getDrawnGeometry } from '@/modules/remote-sensing/imagery/sentinelHubWmsAoiClip'

export type HydroStudyGeometry =
  | GeoJSON.Geometry
  | GeoJSON.Feature
  | GeoJSON.FeatureCollection

/** Map sketch first; otherwise Layer settings → AOI mask from an added layer. */
export function resolveHydroStudyGeometry(
  drawnGeometry: unknown,
  layersAoiEnabled: boolean,
  layersMask: GeoJSON.FeatureCollection | null | undefined,
): HydroStudyGeometry | null {
  const drawn = getDrawnGeometry(drawnGeometry)
  if (drawn) return drawn
  if (layersAoiEnabled && layersMask?.features?.length) return layersMask
  return null
}

/** Single geometry for DOCX report (merges layer AOI polygons when needed). */
export function hydroReportGeometryFromStudy(
  study: HydroStudyGeometry | null | undefined,
): GeoJSON.Geometry | null {
  if (!study) return null
  return getDrawnGeometry(study)
}
