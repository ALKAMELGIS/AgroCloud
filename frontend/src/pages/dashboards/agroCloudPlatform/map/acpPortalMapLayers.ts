import type { FilterSpecification, Map as MaplibreMap } from 'maplibre-gl'
import type { GisContentMapLayerConfig } from '../../../../lib/gisContentRepository'
import { isAgroStructuresPortalRow, isWorldCountriesPortalRow } from '../../../../lib/gisHostedFeatureLayerPortal'
import type { GisContentRow } from '../../../master/gisContentPortalData'
import type { AcpMapLayerVisibility } from '../acpMapLayerVisibility'
import {
  findWorldCountriesGisContentPortalRow,
  WORLD_COUNTRIES_GIS_CONTENT_PORTAL_ID,
} from '../../../../lib/gisContentPortalPublish'
import { unregisterGisContentMapLayer } from '../../../../lib/gisContentPortalStore'
import {
  buildAcpPortalAttributeFilter,
  combineAcpPortalFilters,
  resolveAcpPortalLayerPaintWithConfig,
  type AcpPortalLayerAttributeFilter,
} from './acpPortalLayerStyle'

export const ACP_SOURCE_PORTAL_PREFIX = 'acp-portal-'

/** World_Countries is used for filtered country outlines only — not as a portal map layer. */
export function isAcpExcludedPortalMapRow(row: GisContentRow): boolean {
  return isWorldCountriesPortalRow(row)
}

export function purgeWorldCountriesFromAcpMapRegistry(): void {
  unregisterGisContentMapLayer(WORLD_COUNTRIES_GIS_CONTENT_PORTAL_ID)
  const row = findWorldCountriesGisContentPortalRow()
  if (row?.id) unregisterGisContentMapLayer(row.id)
}

const ACP_PORTAL_LAYER_SUFFIXES = ['-fill', '-line', '-circle'] as const

const portalGeojsonSigCache = new Map<string, string>()

function portalGeojsonSignature(geojson: GeoJSON.FeatureCollection): string {
  const len = geojson.features?.length ?? 0
  const first = geojson.features?.[0]?.properties
  const last = geojson.features?.[len - 1]?.properties
  return `${len}:${String(first?.OBJECTID ?? first?.objectid ?? '')}:${String(last?.OBJECTID ?? last?.objectid ?? '')}`
}

const ACP_PORTAL_FILL_FILTER: FilterSpecification = [
  'match',
  ['geometry-type'],
  ['Polygon', 'MultiPolygon'],
  true,
  false,
]

const ACP_PORTAL_LINE_FILTER: FilterSpecification = [
  'match',
  ['geometry-type'],
  ['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'],
  true,
  false,
]

const ACP_PORTAL_POINT_FILTER: FilterSpecification = [
  'match',
  ['geometry-type'],
  ['Point', 'MultiPoint'],
  true,
  false,
]

export type AcpPortalMapLayerPaint = {
  fillColor: string
  fillOpacity: number
  lineColor: string
  lineWidth: number
  circleColor: string
  circleRadius: number
}

export function resolveAcpPortalLayerPaint(row: GisContentRow): AcpPortalMapLayerPaint {
  if (isWorldCountriesPortalRow(row)) {
    return {
      fillColor: '#fbbf24',
      fillOpacity: 0.12,
      lineColor: '#fbbf24',
      lineWidth: 1.5,
      circleColor: '#fbbf24',
      circleRadius: 4,
    }
  }
  if (isAgroStructuresPortalRow(row)) {
    return {
      fillColor: '#38bdf8',
      fillOpacity: 0.14,
      lineColor: '#38bdf8',
      lineWidth: 2,
      circleColor: '#38bdf8',
      circleRadius: 5,
    }
  }
  return {
    fillColor: '#60a5fa',
    fillOpacity: 0.16,
    lineColor: '#60a5fa',
    lineWidth: 1.6,
    circleColor: '#60a5fa',
    circleRadius: 4,
  }
}

export function acpPortalSourceId(rowId: string): string {
  return `${ACP_SOURCE_PORTAL_PREFIX}${rowId}`
}

export function acpPortalLayerIds(rowId: string): string[] {
  const sid = acpPortalSourceId(rowId)
  return ACP_PORTAL_LAYER_SUFFIXES.map(suffix => `${sid}${suffix}`)
}

function resolveInsertBeforeId(map: MaplibreMap): string | undefined {
  const layers = map.getStyle()?.layers ?? []
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    const id = layers[i]?.id
    if (!id) continue
    if (id.includes('label') || id.includes('symbol') || id.startsWith('place-')) return id
  }
  return undefined
}

function removePortalLayerStack(map: MaplibreMap, sourceId: string) {
  for (const suffix of ACP_PORTAL_LAYER_SUFFIXES) {
    const lid = `${sourceId}${suffix}`
    if (map.getLayer(lid)) map.removeLayer(lid)
  }
  if (map.getSource(sourceId)) map.removeSource(sourceId)
}

function setPortalLayerVisibility(map: MaplibreMap, rowId: string, visible: boolean) {
  const vis = visible ? 'visible' : 'none'
  for (const lid of acpPortalLayerIds(rowId)) {
    if (map.getLayer(lid)) map.setLayoutProperty(lid, 'visibility', vis)
  }
}

export type AcpPortalMapLayerEntry = {
  row: GisContentRow
  geojson: GeoJSON.FeatureCollection
  visible: boolean
  config?: GisContentMapLayerConfig
  attributeFilter?: AcpPortalLayerAttributeFilter
}

export function syncAcpPortalMapLayers(
  map: MaplibreMap,
  layers: AcpPortalMapLayerEntry[],
  visibility: AcpMapLayerVisibility,
  options?: { beforeLayerId?: string; suppressAgroStructuresFill?: boolean },
) {
  if (!map.isStyleLoaded()) return

  const beforeId = options?.beforeLayerId ?? resolveInsertBeforeId(map)
  const activeSourceIds = new Set<string>()
  const sorted = [...layers].sort((a, b) => (a.config?.order ?? 0) - (b.config?.order ?? 0))

  for (const entry of sorted) {
    const { row, geojson } = entry
    if (!geojson?.features?.length) continue

    const sourceId = acpPortalSourceId(row.id)
    activeSourceIds.add(sourceId)
    const paint = resolveAcpPortalLayerPaintWithConfig(row, entry.config)
    const fillOpacity =
      options?.suppressAgroStructuresFill && isAgroStructuresPortalRow(row) ? 0 : paint.fillOpacity
    const portalVisible = visibility.portal[row.id] !== false && entry.visible
    const attrFilter = buildAcpPortalAttributeFilter(entry.attributeFilter ?? null)

    const geojsonSig = portalGeojsonSignature(geojson)
    const existing = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined
    if (existing?.setData) {
      if (portalGeojsonSigCache.get(sourceId) !== geojsonSig) {
        existing.setData(geojson)
        portalGeojsonSigCache.set(sourceId, geojsonSig)
      }
    } else {
      removePortalLayerStack(map, sourceId)
      map.addSource(sourceId, {
        type: 'geojson',
        data: geojson,
        tolerance: 0.8,
        buffer: 64,
        maxzoom: 14,
      })
      portalGeojsonSigCache.set(sourceId, geojsonSig)
    }

    const fillId = `${sourceId}-fill`
    const lineId = `${sourceId}-line`
    const circleId = `${sourceId}-circle`
    const fillFilter = combineAcpPortalFilters(ACP_PORTAL_FILL_FILTER, attrFilter)
    const lineFilter = combineAcpPortalFilters(ACP_PORTAL_LINE_FILTER, attrFilter)
    const pointFilter = combineAcpPortalFilters(ACP_PORTAL_POINT_FILTER, attrFilter)

    if (!map.getLayer(fillId)) {
      map.addLayer(
        {
          id: fillId,
          type: 'fill',
          source: sourceId,
          filter: fillFilter,
          paint: {
            'fill-color': paint.fillColor,
            'fill-opacity': fillOpacity,
          },
          minzoom: paint.minZoom,
          maxzoom: paint.maxZoom,
        },
        beforeId,
      )
    } else {
      map.setPaintProperty(fillId, 'fill-color', paint.fillColor)
      map.setPaintProperty(fillId, 'fill-opacity', fillOpacity)
      map.setFilter(fillId, fillFilter)
      if (paint.minZoom != null) map.setLayerZoomRange(fillId, paint.minZoom, paint.maxZoom ?? 24)
    }

    if (!map.getLayer(lineId)) {
      map.addLayer(
        {
          id: lineId,
          type: 'line',
          source: sourceId,
          filter: lineFilter,
          paint: {
            'line-color': paint.lineColor,
            'line-width': paint.lineWidth,
            'line-opacity': paint.lineOpacity,
          },
          minzoom: paint.minZoom,
          maxzoom: paint.maxZoom,
        },
        beforeId,
      )
    } else {
      map.setPaintProperty(lineId, 'line-color', paint.lineColor)
      map.setPaintProperty(lineId, 'line-width', paint.lineWidth)
      map.setPaintProperty(lineId, 'line-opacity', paint.lineOpacity)
      map.setFilter(lineId, lineFilter)
      if (paint.minZoom != null) map.setLayerZoomRange(lineId, paint.minZoom, paint.maxZoom ?? 24)
    }

    if (!map.getLayer(circleId)) {
      map.addLayer(
        {
          id: circleId,
          type: 'circle',
          source: sourceId,
          filter: pointFilter,
          paint: {
            'circle-color': paint.circleColor,
            'circle-radius': paint.circleRadius,
            'circle-opacity': paint.circleOpacity,
          },
          minzoom: paint.minZoom,
          maxzoom: paint.maxZoom,
        },
        beforeId,
      )
    } else {
      map.setPaintProperty(circleId, 'circle-color', paint.circleColor)
      map.setPaintProperty(circleId, 'circle-radius', paint.circleRadius)
      map.setPaintProperty(circleId, 'circle-opacity', paint.circleOpacity)
      map.setFilter(circleId, pointFilter)
      if (paint.minZoom != null) map.setLayerZoomRange(circleId, paint.minZoom, paint.maxZoom ?? 24)
    }

    setPortalLayerVisibility(map, row.id, portalVisible)
  }

  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const rowId = sorted[i]!.row.id
    for (const lid of acpPortalLayerIds(rowId)) {
      if (!map.getLayer(lid)) continue
      try {
        map.moveLayer(lid, beforeId)
      } catch {
        /* order best-effort */
      }
    }
  }

  for (const layer of map.getStyle()?.layers ?? []) {
    if (!layer.id.startsWith(ACP_SOURCE_PORTAL_PREFIX)) continue
    const sourceId = layer.id.replace(/-(fill|line|circle)$/, '')
    if (!activeSourceIds.has(sourceId)) {
      removePortalLayerStack(map, sourceId)
      portalGeojsonSigCache.delete(sourceId)
    }
  }
}

export function applyAcpPortalLayerVisibility(
  map: MaplibreMap,
  visibility: AcpMapLayerVisibility,
  portalRowIds: string[],
) {
  for (const rowId of portalRowIds) {
    setPortalLayerVisibility(map, rowId, visibility.portal[rowId] !== false)
  }
}
