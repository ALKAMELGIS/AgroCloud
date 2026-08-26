import type { GeoAiMapLayer } from './geoExplorerLayerContext'
import { geometryMetrics, type GeoAiLiveMapState } from './geoAiLiveMapContext'
import type { GeoAiChatContext } from './geoAiChatService'

export type BuildGeoAiChatContextInput = {
  liveMapState: GeoAiLiveMapState | null | undefined
  aoiLabel?: string | null
  aoiId?: string | null
  activeLayerId?: string | null
  activeLayerName?: string | null
  sceneDate?: string | null
  vectorLayers?: GeoAiMapLayer[]
  zonalStats?: GeoAiChatContext['zonalStats']
}

function extractGeometry(raw: GeoAiLiveMapState['aoiGeometry']): GeoJSON.Geometry | null {
  if (!raw) return null
  const g = raw as GeoJSON.Geometry & { geometry?: GeoJSON.Geometry }
  if (g.type === 'Feature' && g.geometry) return g.geometry
  if (g.type && g.type !== 'Feature') return g as GeoJSON.Geometry
  return null
}

export function buildGeoAiChatContext(input: BuildGeoAiChatContextInput): GeoAiChatContext {
  const state = input.liveMapState
  const geom = extractGeometry(state?.aoiGeometry)
  const metrics = geom ? geometryMetrics(geom) : null
  const areaHa = metrics?.areaM2 ? metrics.areaM2 / 10_000 : null

  const activeAnalysis = state?.activeAnalysis ?? null
  const layerId =
    input.activeLayerId?.trim() ||
    activeAnalysis?.label?.trim() ||
    null
  const layerName = input.activeLayerName?.trim() || activeAnalysis?.label?.trim() || layerId

  const visibleLayers = (input.vectorLayers ?? state?.layers ?? [])
    .filter(l => l.visible !== false)
    .slice(0, 24)
    .map(l => ({
      id: l.clientLayerId || l.name,
      name: l.name,
      type: l.source || 'vector',
      visible: l.visible !== false,
    }))

  const cam = state?.camera
  const center =
    cam?.longitude != null && cam?.latitude != null
      ? { lng: cam.longitude, lat: cam.latitude }
      : metrics?.centroid
        ? { lng: metrics.centroid[0], lat: metrics.centroid[1] }
        : null

  return {
    selectedAOI: geom
      ? {
          id: input.aoiId ?? null,
          name: input.aoiLabel?.trim() || 'AOI',
          geometry: geom,
          areaHa,
        }
      : null,
    activeLayer: layerId
      ? {
          id: layerId,
          name: layerName || layerId,
          type: 'index',
          sceneDate: input.sceneDate || activeAnalysis?.acquisitionDate || null,
          resolutionM: activeAnalysis?.resolutionMeters ?? null,
          meanValue: activeAnalysis?.meanValue ?? null,
        }
      : null,
    visibleLayers,
    map: {
      center,
      zoom: cam?.zoom ?? null,
      bearing: cam?.bearing ?? null,
      pitch: cam?.pitch ?? null,
    },
    activeAnalysis,
    zonalStats: input.zonalStats,
  }
}
