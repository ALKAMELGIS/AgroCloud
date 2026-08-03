/**
 * Single resolver for Satellite Intelligence active AOI clip geometry.
 * Priority (fixed): Drawn sketch > Layers AOI mask (when enabled) > Agro fallback.
 * Pure helpers only — no React.
 */

import { agroStructuresLayerAoiSignature } from './agroStructuresPrimaryAoi'
import { siAoiLayerGeoJsonCacheSig } from './siAoiLayerModeClipCache'
import { drawnAoiClipSignature } from '../pages/satellite/siDrawnAoiLiveIndex'

export type SiActiveAoiSource = 'draw' | 'layers' | 'agro'

export type SiActiveAoiGeometry = GeoJSON.FeatureCollection | { type: 'FeatureCollection'; features: unknown[] }

export type SiActiveAoi = {
  geometry: SiActiveAoiGeometry | null
  key: string
  source: SiActiveAoiSource | null
}

export type ResolveSiActiveAoiInput = {
  drawnClip?: SiActiveAoiGeometry | null
  layersEnabled?: boolean
  layersMask?: SiActiveAoiGeometry | null
  /** Optional settings pin (e.g. siAoiLayerModeSettingsPinKey) for a stable layers key. */
  layersPinKey?: string | null
  agroMask?: SiActiveAoiGeometry | null
}

function hasClipFeatures(fc: SiActiveAoiGeometry | null | undefined): fc is SiActiveAoiGeometry {
  return Boolean(fc && Array.isArray(fc.features) && fc.features.length > 0)
}

function layersMaskKey(mask: SiActiveAoiGeometry, layersPinKey?: string | null): string {
  const pin = String(layersPinKey ?? '').trim()
  if (pin) return `layers:${pin}`
  const geoSig = siAoiLayerGeoJsonCacheSig({ id: 'layers-aoi', geojson: mask })
  return `layers:${geoSig}`
}

/**
 * Resolve the single active AOI geometry + stable invalidate key for live index WMS.
 * Drawn sketch wins when present; otherwise Layers mask when enabled; else Agro mask.
 */
export function resolveSiActiveAoi(input: ResolveSiActiveAoiInput): SiActiveAoi {
  const { drawnClip, layersEnabled, layersMask, layersPinKey, agroMask } = input

  if (hasClipFeatures(drawnClip)) {
    return {
      geometry: drawnClip,
      key: drawnAoiClipSignature(drawnClip as GeoJSON.FeatureCollection),
      source: 'draw',
    }
  }

  if (layersEnabled && hasClipFeatures(layersMask)) {
    return {
      geometry: layersMask,
      key: layersMaskKey(layersMask, layersPinKey),
      source: 'layers',
    }
  }

  if (hasClipFeatures(agroMask)) {
    return {
      geometry: agroMask,
      key: `agro:${agroStructuresLayerAoiSignature(agroMask)}`,
      source: 'agro',
    }
  }

  return { geometry: null, key: '', source: null }
}
