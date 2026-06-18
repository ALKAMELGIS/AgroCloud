import { resolveAgroStructuresCountry } from '../../../lib/agroStructuresPrimaryAoi'
import type { LngLatBBox } from '../../../lib/siMapViewport'
import type { AcpMapScopeMode } from './acpPlatformContext'
import {
  buildKpiTotalsFromFeatures,
  filterGeoJsonFeaturesInBBox,
  type AcpGeoFeature,
} from './acpMapSpatial'
import { ACP_WMS_FIELD_CLIP_MIN_ZOOM } from './acpWmsClip'

export type AcpMapViewSlice = {
  bbox: LngLatBBox | null
  zoom?: number | null
}

export function isAcpViewportScopeActive(
  mapView: AcpMapViewSlice,
  scopeMode: AcpMapScopeMode,
): boolean {
  return (
    scopeMode !== 'global' &&
    (mapView.zoom ?? 0) >= ACP_WMS_FIELD_CLIP_MIN_ZOOM &&
    Boolean(mapView.bbox)
  )
}

export function resolveAcpScopeGeoFeatures(
  mask: GeoJSON.FeatureCollection | null | undefined,
  mapView: AcpMapViewSlice,
  scopeMode: AcpMapScopeMode,
  countryFilter: string,
): AcpGeoFeature[] {
  if (!mask?.features?.length) return []

  let features = mask.features as AcpGeoFeature[]
  if (isAcpViewportScopeActive(mapView, scopeMode)) {
    features = filterGeoJsonFeaturesInBBox(mask, mapView.bbox)
  }

  if (countryFilter && countryFilter !== 'all') {
    features = features.filter(
      f => resolveAgroStructuresCountry(f.properties ?? {}) === countryFilter,
    )
  }

  return features
}

export function buildAcpScopeKpiTotals(
  mask: GeoJSON.FeatureCollection | null | undefined,
  mapView: AcpMapViewSlice,
  scopeMode: AcpMapScopeMode,
  countryFilter: string,
) {
  return buildKpiTotalsFromFeatures(
    resolveAcpScopeGeoFeatures(mask, mapView, scopeMode, countryFilter),
  )
}
