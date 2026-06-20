import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { type Map as MaplibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { CropAlertFieldResult } from '../../../../lib/siCropAlertEngine'
import {
  SENTINEL_HUB_WMS_TILE_PIXELS,
  sentinelHubWmsMinZoomForLatitude,
} from '../../../../lib/sentinelHubWmsLayers'
import { geometryBBox } from '../../../../lib/geoAiGeoJsonSpatial'
import { useAcpPortalMapLayers } from '../hooks/useAcpPortalMapLayers'
import { useAcpPlatform } from '../acpPlatformContext'
import type { AcpMapLayerVisibility } from '../acpMapLayerVisibility'
import {
  applyAcpPortalLayerVisibility,
  syncAcpPortalMapLayers,
} from './acpPortalMapLayers'
import {
  buildAcpWmsSpecCacheKey,
  buildAcpWmsPersistentRecord,
  loadAcpWmsIdbCache,
  loadAcpWmsSpecCache,
  persistAcpWmsSpecCache,
} from '../acpWmsSpecCache'
import {
  buildAcpWmsSessionClipSignature,
  buildAcpWmsExtentTileSignature,
  resolveAcpWmsClipForMapView,
} from '../acpWmsClip'
import { buildAcpAoiSyncSignature, emitAcpAoiSync } from '../acpAoiSyncBus'
import { geojsonCollectionSignature } from '../acpStructuresLoadPolicy'
import {
  buildAcpWmsChunkTileEntries,
  wmsLayerIdForChunk,
  wmsSourceIdForChunk,
  type AcpWmsTileEntry,
} from '../acpWmsViewportEngine'
import type { LngLatBBox } from '../../../../lib/siMapViewport'
import {
  debounceAcpMap,
  restoreAcpMapHeavyOverlays,
  suspendAcpMapHeavyOverlays,
  type AcpMapSuspendSnapshot,
} from './acpMapInteraction'
import {
  buildAcpMapViewPublishSignature,
  quantizeAcpMapViewBbox,
} from './acpMapViewPublish'
import { AcpAlertMarkersLayer } from './AcpAlertMarkersLayer'
import { AcpWeatherAlertMarkersLayer } from './AcpWeatherAlertMarkersLayer'
import { useAcpWeatherFieldData } from './AcpWeatherFieldProvider'
import { patchAoiWeatherOnMap, applyAoiWeatherFillPaint } from './acpWeatherAoiPaint'
import { syncAcpCountryBoundaryLayers } from './acpCountryBoundaries'
import {
  ACP_BASEMAP_LAYER_CAP,
  resolveAcpBasemapRasterLayers,
} from '../acpBasemap'
import {
  isAgroStructuresMapOutlineStructureType,
} from '../../../../lib/agroStructuresPrimaryAoi'
import {
  ACP_DEFAULT_MAP_CENTER,
  ACP_INITIAL_MAP_ZOOM,
  ACP_FIELD_LOCATE_MIN_ZOOM,
  applyAcpMapFocusTarget,
  resolveAcpMapFocusTargetFromGeoJson,
  resolveAcpMapHomeTarget,
  resolveAcpFieldLocateCenter,
} from '../acpMapSpatial'
import {
  ACP_AOI_FILL_OPACITY_EXPRESSION,
  ACP_AOI_FILL_SUPPRESSED_OPACITY_EXPRESSION,
  resolveAcpMapDrawGeoJson,
} from './acpMapDrawGeoJson'

const ACP_SOURCE_AOI = 'acp-aoi'
const ACP_LAYER_AOI_FILL = 'acp-aoi-fill'
const ACP_LAYER_AOI_LINE = 'acp-aoi-line'
const ACP_WMS_PREFIX = 'acp-sentinel-wms-'
const ACP_WMS_LEGACY_INDEX_CAP = 48
const WMS_TARGET_OPACITY = 1

function layerSourceId(layer: maplibregl.LayerSpecification): string {
  return 'source' in layer && typeof layer.source === 'string' ? layer.source : ''
}

function setMapLayerDisplay(map: MaplibreMap, layerId: string, visible: boolean) {
  if (!map.getLayer(layerId)) return
  map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
}

function setAllWmsRasterLayersDisplay(map: MaplibreMap, visible: boolean) {
  const vis = visible ? 'visible' : 'none'
  for (const layer of map.getStyle()?.layers ?? []) {
    if (layer.id.startsWith(ACP_WMS_PREFIX) && layer.id.endsWith('-raster')) {
      map.setLayoutProperty(layer.id, 'visibility', vis)
    }
  }
}

function applyAcpMapLayerVisibility(
  map: MaplibreMap,
  visibility: AcpMapLayerVisibility,
  portalLayerIds: string[],
) {
  setMapLayerDisplay(map, ACP_LAYER_AOI_FILL, visibility.aoi)
  setMapLayerDisplay(map, ACP_LAYER_AOI_LINE, visibility.aoi)
  setAllWmsRasterLayersDisplay(map, visibility.sentinelWms)
  applyAcpPortalLayerVisibility(map, visibility, portalLayerIds)
}

type SessionClipRef = {
  aoiFeatureCount: number
  clipSignature: string
  extentTileSignature: string
}

type RasterSourceMutable = maplibregl.RasterTileSource & {
  setTiles?: (tiles: string[]) => void
  setBounds?: (b: [number, number, number, number] | null) => void
}

function boundsToBBox(bounds: maplibregl.LngLatBounds): LngLatBBox {
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]
}

function readMapViewFromMap(map: MaplibreMap) {
  const b = map.getBounds()
  return {
    bbox: boundsToBBox(b),
    zoom: map.getZoom(),
    center: [map.getCenter().lng, map.getCenter().lat] as [number, number],
  }
}

function resolveWmsClipFromMap(
  aoiMask: GeoJSON.FeatureCollection,
  countryFilter: string,
  map: MaplibreMap,
  maxWmsLayers: number,
) {
  const view = readMapViewFromMap(map)
  return resolveAcpWmsClipForMapView(aoiMask, {
    countryFilter,
    zoom: view.zoom,
    bbox: view.bbox,
    center: view.center,
    maxWmsLayers,
  })
}

function featureCollectionBounds(
  fc: GeoJSON.FeatureCollection,
): [[number, number], [number, number]] | null {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const f of fc.features) {
    const bb = geometryBBox(f.geometry as { type?: string; coordinates?: unknown })
    if (!bb) continue
    west = Math.min(west, bb[0])
    south = Math.min(south, bb[1])
    east = Math.max(east, bb[2])
    north = Math.max(north, bb[3])
  }
  if (!Number.isFinite(west)) return null
  return [
    [west, south],
    [east, north],
  ]
}

function buildInitialBasemapStyle(basemapId: string): maplibregl.StyleSpecification {
  const layers = resolveAcpBasemapRasterLayers(basemapId)
  const sources: Record<string, maplibregl.SourceSpecification> = {}
  const styleLayers: maplibregl.LayerSpecification[] = []
  for (const spec of layers) {
    sources[spec.sourceId] = {
      type: 'raster',
      tiles: spec.tiles,
      tileSize: spec.tileSize,
      attribution: spec.attribution,
    }
    styleLayers.push({
      id: spec.layerId,
      type: 'raster',
      source: spec.sourceId,
      paint: {
        'raster-opacity': spec.opacity,
        'raster-fade-duration': 0,
      },
    })
  }
  return { version: 8, sources, layers: styleLayers }
}

function firstOverlayLayerId(map: MaplibreMap): string | undefined {
  for (const layer of map.getStyle()?.layers ?? []) {
    if (!layer.id.startsWith('acp-basemap-layer-')) return layer.id
  }
  return undefined
}

function syncBasemapLayers(map: MaplibreMap, basemapId: string) {
  const specs = resolveAcpBasemapRasterLayers(basemapId)
  const beforeId = firstOverlayLayerId(map)

  for (let index = 0; index < specs.length; index++) {
    const spec = specs[index]!
    const existing = map.getSource(spec.sourceId) as RasterSourceMutable | undefined

    if (existing && typeof existing.setTiles === 'function') {
      existing.setTiles(spec.tiles)
      if (map.getLayer(spec.layerId)) {
        map.setPaintProperty(spec.layerId, 'raster-opacity', spec.opacity)
      } else {
        map.addLayer(
          {
            id: spec.layerId,
            type: 'raster',
            source: spec.sourceId,
            paint: { 'raster-opacity': spec.opacity, 'raster-fade-duration': 0 },
          },
          beforeId,
        )
      }
      continue
    }

    if (map.getLayer(spec.layerId)) map.removeLayer(spec.layerId)
    if (map.getSource(spec.sourceId)) map.removeSource(spec.sourceId)

    map.addSource(spec.sourceId, {
      type: 'raster',
      tiles: spec.tiles,
      tileSize: spec.tileSize,
      attribution: spec.attribution,
    })
    map.addLayer(
      {
        id: spec.layerId,
        type: 'raster',
        source: spec.sourceId,
        paint: { 'raster-opacity': spec.opacity, 'raster-fade-duration': 0 },
      },
      beforeId,
    )
  }

  for (let index = specs.length; index < ACP_BASEMAP_LAYER_CAP; index++) {
    const sourceId = `acp-basemap-${index}`
    const layerId = `acp-basemap-layer-${index}`
    if (map.getLayer(layerId)) map.removeLayer(layerId)
    if (map.getSource(sourceId)) map.removeSource(sourceId)
  }
}

function resolveWmsBeforeLayerId(map: MaplibreMap): string | undefined {
  if (map.getLayer(ACP_LAYER_AOI_LINE)) return ACP_LAYER_AOI_LINE
  if (map.getLayer(ACP_LAYER_AOI_FILL)) return ACP_LAYER_AOI_FILL
  for (const layer of map.getStyle()?.layers ?? []) {
    if (!layer.id.startsWith('acp-basemap-layer-')) return layer.id
  }
  return undefined
}

function padEntryBounds(bounds: LngLatBBox): LngLatBBox {
  const [west, south, east, north] = bounds
  const padX = Math.max((east - west) * 0.12, 4e-4)
  const padY = Math.max((north - south) * 0.12, 4e-4)
  return [west - padX, south - padY, east + padX, north + padY]
}

function setAoiFillSuppressed(map: MaplibreMap, suppressed: boolean) {
  if (!map.getLayer(ACP_LAYER_AOI_FILL)) return
  map.setPaintProperty(
    ACP_LAYER_AOI_FILL,
    'fill-opacity',
    suppressed ? ACP_AOI_FILL_SUPPRESSED_OPACITY_EXPRESSION : ACP_AOI_FILL_OPACITY_EXPRESSION,
  )
  if (map.getLayer(ACP_LAYER_AOI_LINE)) {
    map.setPaintProperty(ACP_LAYER_AOI_LINE, 'line-opacity', suppressed ? 1 : 0.95)
  }
}

function resolveWmsZoomOk(map: MaplibreMap, mapViewZoom: number | undefined): boolean {
  const minZoom = sentinelHubWmsMinZoomForLatitude(map.getCenter().lat)
  const zoom = mapViewZoom ?? map.getZoom()
  return zoom >= minZoom
}

function clearLegacyWmsIndexLayers(map: MaplibreMap) {
  for (let index = 0; index < ACP_WMS_LEGACY_INDEX_CAP; index++) {
    const lid = `${ACP_WMS_PREFIX}${index}-raster`
    const sid = `${ACP_WMS_PREFIX}${index}`
    if (map.getLayer(lid)) map.removeLayer(lid)
    if (map.getSource(sid)) map.removeSource(sid)
  }
}

function clearLegacyWmsRasterLayers(map: MaplibreMap) {
  clearLegacyWmsIndexLayers(map)
  for (const layer of [...(map.getStyle()?.layers ?? [])]) {
    if (!layer.id.startsWith(ACP_WMS_PREFIX) || !layer.id.endsWith('-raster')) continue
    if (layer.id.includes('-c-')) continue
    const sid = layerSourceId(layer)
    if (map.getLayer(layer.id)) map.removeLayer(layer.id)
    if (sid && map.getSource(sid)) map.removeSource(sid)
  }
}

function wmsRasterPaint(initialOpacity: number): maplibregl.RasterLayerSpecification['paint'] {
  return {
    'raster-opacity': initialOpacity,
    'raster-fade-duration': 0,
    'raster-resampling': 'linear',
  }
}

function wmsChunkLayersPresent(map: MaplibreMap): boolean {
  for (const layer of map.getStyle()?.layers ?? []) {
    if (layer.id.startsWith(`${ACP_WMS_PREFIX}c-`) && layer.id.endsWith('-raster')) return true
  }
  return false
}

function boundsTupleFromBBox(bounds: LngLatBBox | null | undefined): [number, number, number, number] | undefined {
  if (!bounds) return undefined
  return [bounds[0], bounds[1], bounds[2], bounds[3]]
}

function resolveEntryRasterBounds(entry: AcpWmsTileEntry): [number, number, number, number] | undefined {
  const raw = entry.bounds ?? entry.spec.boundsLngLat
  if (!raw) return undefined
  return boundsTupleFromBBox(padEntryBounds(raw))
}

function syncWmsChunkLayers(
  map: MaplibreMap,
  entries: AcpWmsTileEntry[],
  beforeLayerId: string | undefined,
  urlByChunk: globalThis.Map<string, string>,
  minZoom: number,
) {
  const activeKeys = new Set(entries.map(entry => entry.layerKey))

  for (const entry of entries) {
    const spec = entry.spec
    const sid = wmsSourceIdForChunk(entry.layerKey)
    const lid = wmsLayerIdForChunk(entry.layerKey)
    const prevUrl = urlByChunk.get(entry.layerKey)
    const urlChanged = prevUrl !== spec.url
    const boundsTuple = resolveEntryRasterBounds(entry)
    const existing = map.getSource(sid) as RasterSourceMutable | undefined

    if (existing && typeof existing.setTiles === 'function') {
      if (urlChanged) {
        existing.setTiles([spec.url])
        urlByChunk.set(entry.layerKey, spec.url)
      }
      if (typeof existing.setBounds === 'function') {
        existing.setBounds(boundsTuple ?? null)
      }
      if (!map.getLayer(lid)) {
        map.addLayer(
          {
            id: lid,
            type: 'raster',
            source: sid,
            paint: wmsRasterPaint(WMS_TARGET_OPACITY),
          },
          beforeLayerId,
        )
      } else {
        map.setPaintProperty(lid, 'raster-opacity', WMS_TARGET_OPACITY)
        map.setPaintProperty(lid, 'raster-fade-duration', 0)
        map.setPaintProperty(lid, 'raster-resampling', 'linear')
        if (beforeLayerId && map.getLayer(beforeLayerId)) {
          map.moveLayer(lid, beforeLayerId)
        }
      }
      continue
    }

    if (map.getLayer(lid)) map.removeLayer(lid)
    if (map.getSource(sid)) map.removeSource(sid)

    map.addSource(sid, {
      type: 'raster',
      tiles: [spec.url],
      tileSize: SENTINEL_HUB_WMS_TILE_PIXELS,
      scheme: 'xyz',
      minzoom: minZoom,
      ...(boundsTuple ? { bounds: boundsTuple } : {}),
    })
    map.addLayer(
      {
        id: lid,
        type: 'raster',
        source: sid,
        paint: wmsRasterPaint(WMS_TARGET_OPACITY),
      },
      beforeLayerId,
    )
    urlByChunk.set(entry.layerKey, spec.url)
  }

  for (const [layerKey] of [...urlByChunk.entries()]) {
    if (activeKeys.has(layerKey)) continue
    const sid = wmsSourceIdForChunk(layerKey)
    const lid = wmsLayerIdForChunk(layerKey)
    if (map.getLayer(lid)) map.removeLayer(lid)
    if (map.getSource(sid)) map.removeSource(sid)
    urlByChunk.delete(layerKey)
  }
}

function syncAoiLayers(
  map: MaplibreMap,
  aoiMask: GeoJSON.FeatureCollection,
  selectedObjectId: string,
  countryFilter: string,
  fitOnceRef: { current: boolean },
  onInitialFitComplete?: () => void,
  aoiSyncRef?: { signature: string; selectedKey: string },
) {
  const syncState = aoiSyncRef ?? { signature: '', selectedKey: '' }
  const signature = geojsonCollectionSignature(aoiMask)
  const sourceMissing = !map.getSource(ACP_SOURCE_AOI)
  const geometryChanged = signature !== syncState.signature || sourceMissing

  if (geometryChanged) {
    syncState.signature = signature
    emitAcpAoiSync({
      reason: 'map',
      signature: buildAcpAoiSyncSignature(aoiMask),
    })
    const enriched = {
      ...aoiMask,
      features: aoiMask.features.map((f, i) => {
        const props = (f as { properties?: Record<string, unknown> }).properties ?? {}
        const key = String(props.OBJECTID ?? props.objectid ?? i)
        const outlineRole = isAgroStructuresMapOutlineStructureType(props) ? 'greenhouse' : 'mask'
        return {
          ...(f as object),
          properties: { ...props, __acpFieldKey: key, __acpOutlineRole: outlineRole },
        }
      }),
    }

    if (map.getSource(ACP_SOURCE_AOI)) {
      ;(map.getSource(ACP_SOURCE_AOI) as maplibregl.GeoJSONSource).setData(
        enriched as unknown as GeoJSON.FeatureCollection,
      )
    } else {
      map.addSource(ACP_SOURCE_AOI, {
        type: 'geojson',
        data: enriched as unknown as GeoJSON.FeatureCollection,
      })
      map.addLayer({
        id: ACP_LAYER_AOI_FILL,
        type: 'fill',
        source: ACP_SOURCE_AOI,
        paint: {
          'fill-color': [
            'match',
            ['get', '__acpOutlineRole'],
            'greenhouse',
            '#38bdf8',
            '#39ff14',
          ],
          'fill-opacity': ACP_AOI_FILL_OPACITY_EXPRESSION,
        },
      })
      map.addLayer({
        id: ACP_LAYER_AOI_LINE,
        type: 'line',
        source: ACP_SOURCE_AOI,
        paint: {
          'line-color': [
            'match',
            ['get', '__acpOutlineRole'],
            'greenhouse',
            '#0284c7',
            '#39ff14',
          ],
          'line-width': ['case', ['==', ['get', '__acpFieldKey'], selectedObjectId], 3, 1.75],
          'line-opacity': 0.95,
        },
      })
    }
  }

  if (geometryChanged || selectedObjectId !== syncState.selectedKey) {
    syncState.selectedKey = selectedObjectId
    if (map.getLayer(ACP_LAYER_AOI_LINE)) {
      map.setPaintProperty(ACP_LAYER_AOI_LINE, 'line-width', [
        'case',
        ['==', ['get', '__acpFieldKey'], selectedObjectId],
        3,
        1.75,
      ])
    }
  }

  if (!fitOnceRef.current) {
    fitOnceRef.current = true
    applyAcpMapFocusTarget(map, resolveAcpMapHomeTarget(aoiMask, countryFilter), {
      onSettled: onInitialFitComplete,
    })
  }
}

export function AcpMapCanvas() {
  const acp = useAcpPlatform()
  const { entries: weatherEntries } = useAcpWeatherFieldData()
  const acpRef = useRef(acp)
  acpRef.current = acp
  const weatherEntriesRef = useRef(weatherEntries)
  weatherEntriesRef.current = weatherEntries

  const containerRef = useRef<HTMLDivElement>(null)
  const mapShellRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MaplibreMap | null>(null)
  const [mapInstance, setMapInstance] = useState<MaplibreMap | null>(null)
  const [mapInteractEpoch, setMapInteractEpoch] = useState(0)
  const { layers: portalLayers } = useAcpPortalMapLayers()
  const portalLayersSignature = useMemo(
    () =>
      portalLayers
        .map(pl => `${pl.row.id}:${pl.geojson.features?.length ?? 0}:${pl.config.visible}`)
        .join('|'),
    [portalLayers],
  )
  const applyPortalLayersRef = useRef<(map: MaplibreMap) => void>(() => {})
  const portalAppliedSigRef = useRef('')
  const wmsKeyRef = useRef('')
  const wmsUrlByChunkRef = useRef(new globalThis.Map<string, string>())
  const wmsRevisionRef = useRef(-1)
  const sessionClipRef = useRef<SessionClipRef | null>(null)
  const lastPublishedViewSigRef = useRef<string | null>(null)
  const mapFitReadyRef = useRef(false)
  const fitOnceRef = useRef(false)
  const aoiSyncRef = useRef({ signature: '', selectedKey: '' })
  const mapGenerationRef = useRef(0)
  const mapInteractingRef = useRef(false)
  const suspendSnapRef = useRef<AcpMapSuspendSnapshot | null>(null)
  const zoomOkRef = useRef<boolean | null>(null)
  const portalLayerIdsRef = useRef<string[]>([])
  const setWmsLoadingRef = useRef<(loading: boolean) => void>(() => {})
  const [wmsLoading, setWmsLoading] = useState(false)
  setWmsLoadingRef.current = setWmsLoading


  const handleAlertSelect = useCallback((fieldKey: string) => {
    acpRef.current.setSelectedFieldKey(fieldKey)
    acpRef.current.setScopeMode('selection')
  }, [])

  const applyAoiLayers = useCallback((map: MaplibreMap) => {
    const snap = acpRef.current
    const mapOutline = resolveAcpMapDrawGeoJson(
      snap.aoiMask,
      snap.structureMapOutline,
      snap.countryFilter,
    )
    if (!mapOutline?.features?.length) return
    const selectedObjectId = snap.selectedFieldKey
      ? String(
          snap.allResults.find(r => r.fieldKey === snap.selectedFieldKey)?.objectId ??
            snap.selectedFieldKey,
        )
      : ''
    syncAoiLayers(
      map,
      mapOutline,
      selectedObjectId,
      snap.countryFilter,
      fitOnceRef,
      () => {
        mapFitReadyRef.current = true
        applyWmsRef.current(map, true)
        applyPortalLayersRef.current(map)
      },
      aoiSyncRef,
    )
    setMapLayerDisplay(map, ACP_LAYER_AOI_FILL, snap.layerVisibility.aoi)
    setMapLayerDisplay(map, ACP_LAYER_AOI_LINE, snap.layerVisibility.aoi)
    const wmsOn =
      snap.layerVisibility.sentinelWms && resolveWmsZoomOk(map, map.getZoom())
    setAoiFillSuppressed(map, wmsOn)
    if (mapOutline?.features.length) {
      patchAoiWeatherOnMap(
        map,
        mapOutline,
        weatherEntriesRef.current,
        snap.layerVisibility.weatherAlerts,
      )
    } else {
      applyAoiWeatherFillPaint(map, snap.layerVisibility.weatherAlerts)
    }
  }, [])

  const applyAoiLayersRef = useRef(applyAoiLayers)
  applyAoiLayersRef.current = applyAoiLayers

  const applyPortalLayers = useCallback(
    (map: MaplibreMap) => {
      if (portalAppliedSigRef.current === portalLayersSignature) return
      portalAppliedSigRef.current = portalLayersSignature
      const snap = acpRef.current
      syncAcpPortalMapLayers(
        map,
        portalLayers.map(pl => ({
          row: pl.row,
          geojson: pl.geojson as GeoJSON.FeatureCollection,
          visible: pl.config.visible,
        })),
        snap.layerVisibility,
        {
          beforeLayerId: map.getLayer(ACP_LAYER_AOI_FILL) ? ACP_LAYER_AOI_FILL : undefined,
          suppressAgroStructuresFill: snap.layerVisibility.aoi,
        },
      )
    },
    [portalLayersSignature, portalLayers],
  )

  applyPortalLayersRef.current = applyPortalLayers

  const applyWmsLayers = useCallback((map: MaplibreMap, force = false) => {
    const snap = acpRef.current
    if (!snap.aoiMask?.features.length) return
    if (!map.isStyleLoaded()) return

    const wmsVisible = snap.layerVisibility.sentinelWms
    const zoomOk = resolveWmsZoomOk(map, map.getZoom())
    const wmsOnMap = wmsVisible && zoomOk

    if (!wmsVisible) {
      setAllWmsRasterLayersDisplay(map, false)
      setAoiFillSuppressed(map, false)
      setWmsLoadingRef.current(false)
      return
    }

    const wms = snap.wmsParams
    if (wms.revision !== wmsRevisionRef.current) {
      wmsRevisionRef.current = wms.revision
      wmsKeyRef.current = ''
    }

    // Extent definition query + full dataMask polygons per loaded AOI.
    const wmsClip = resolveWmsClipFromMap(
      snap.aoiMask,
      snap.countryFilter,
      map,
      snap.config.maxWmsLayers,
    )
    if (!wmsClip.features.length) {
      setAllWmsRasterLayersDisplay(map, false)
      setWmsLoadingRef.current(false)
      return
    }

    const previewEntries = buildAcpWmsChunkTileEntries(
      wmsClip,
      wms.layerId,
      wms.startDate,
      wms.endDate,
      wms.cloudCoverage,
      snap.config.maxWmsLayers,
    )
    if (!previewEntries.length) {
      setAllWmsRasterLayersDisplay(map, false)
      setAoiFillSuppressed(map, false)
      setWmsLoadingRef.current(false)
      return
    }

    const clipSignature = buildAcpWmsSessionClipSignature(wmsClip)
    const view = readMapViewFromMap(map)
    const extentTileSignature = buildAcpWmsExtentTileSignature(view.bbox, view.zoom)
    sessionClipRef.current = {
      aoiFeatureCount: snap.aoiMask.features.length,
      clipSignature,
      extentTileSignature,
    }

    const cacheKey = buildAcpWmsSpecCacheKey({
      wmsLayer: wms.layerId,
      startDate: wms.startDate,
      endDate: wms.endDate,
      cloudCoverage: wms.cloudCoverage,
      clipSignature,
    })

    const needsSync = force || cacheKey !== wmsKeyRef.current || !wmsChunkLayersPresent(map)
    if (!needsSync) {
      setAllWmsRasterLayersDisplay(map, wmsOnMap)
      setAoiFillSuppressed(map, wmsOnMap)
      return
    }

    wmsKeyRef.current = cacheKey
    const beforeId = resolveWmsBeforeLayerId(map)
    const urlByChunk = wmsUrlByChunkRef.current

    const applyEntries = (entries: AcpWmsTileEntry[], showLoading: boolean) => {
      if (!entries.length) {
        setWmsLoadingRef.current(false)
        setAoiFillSuppressed(map, false)
        return
      }
      const minZoom = sentinelHubWmsMinZoomForLatitude(map.getCenter().lat)
      syncWmsChunkLayers(map, entries, beforeId, urlByChunk, minZoom)
      if (showLoading) {
        setWmsLoadingRef.current(true)
        map.once('idle', () => setWmsLoadingRef.current(false))
      } else {
        setWmsLoadingRef.current(false)
      }
      setAllWmsRasterLayersDisplay(map, wmsOnMap)
      setAoiFillSuppressed(map, wmsOnMap)
    }

    const cachedSync = loadAcpWmsSpecCache(cacheKey)
    if (cachedSync?.entries.length) {
      applyEntries(cachedSync.entries, false)
      return
    }

    void (async () => {
      const requestKey = cacheKey
      let cached = loadAcpWmsSpecCache(requestKey)
      if (!cached) cached = await loadAcpWmsIdbCache(requestKey)
      if (wmsKeyRef.current !== requestKey) return

      if (cached?.entries.length) {
        applyEntries(cached.entries, false)
        return
      }

      setWmsLoadingRef.current(true)
      const entries = previewEntries
      if (wmsKeyRef.current !== requestKey) return
      if (!entries.length) {
        setWmsLoadingRef.current(false)
        setAoiFillSuppressed(map, false)
        return
      }

      applyEntries(entries, true)
      persistAcpWmsSpecCache(
        buildAcpWmsPersistentRecord({
          cacheKey: requestKey,
          wmsLayer: wms.layerId,
          startDate: wms.startDate,
          endDate: wms.endDate,
          cloudCoverage: wms.cloudCoverage,
          aoiFeatureCount: sessionClipRef.current?.aoiFeatureCount ?? snap.aoiMask.features.length,
          entries,
        }),
      )
    })()
  }, [])

  const applyWmsRef = useRef(applyWmsLayers)
  applyWmsRef.current = applyWmsLayers

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const generation = ++mapGenerationRef.current
    wmsKeyRef.current = ''
    wmsUrlByChunkRef.current = new globalThis.Map()
    wmsRevisionRef.current = -1
    sessionClipRef.current = null
    lastPublishedViewSigRef.current = null
    mapFitReadyRef.current = false
    fitOnceRef.current = false
    aoiSyncRef.current = { signature: '', selectedKey: '' }

    const container = containerRef.current
    const initialBasemapId = acpRef.current.config.basemapId
    const map = new maplibregl.Map({
      container,
      style: buildInitialBasemapStyle(initialBasemapId),
      center: ACP_DEFAULT_MAP_CENTER,
      zoom: ACP_INITIAL_MAP_ZOOM,
      attributionControl: false,
      fadeDuration: 0,
      preserveDrawingBuffer: false,
      renderWorldCopies: false,
      maxPitch: 0,
      antialias: false,
    } as maplibregl.MapOptions & { preserveDrawingBuffer?: boolean })

    map.dragRotate.disable()
    map.touchZoomRotate.disableRotation()

    const publishView = () => {
      const b = map.getBounds()
      const rawBbox = boundsToBBox(b)
      const zoom = map.getZoom()
      const center: [number, number] = [map.getCenter().lng, map.getCenter().lat]
      const bbox = quantizeAcpMapViewBbox(rawBbox)
      const sig = buildAcpMapViewPublishSignature(rawBbox, zoom)
      if (sig === lastPublishedViewSigRef.current) return
      lastPublishedViewSigRef.current = sig
      acpRef.current.setMapView({ bbox, zoom, center })
    }

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'bottom-right')

    const onLoad = () => {
      if (generation !== mapGenerationRef.current) return
      map.resize()
      publishView()
      clearLegacyWmsRasterLayers(map)
      applyAoiLayersRef.current(map)
      map.once('idle', () => {
        if (generation !== mapGenerationRef.current) return
        mapFitReadyRef.current = true
        applyWmsRef.current(map, true)
      })
    }

    map.on('load', onLoad)

    const onMoveStart = () => {
      if (generation !== mapGenerationRef.current) return
      if (!map.isStyleLoaded()) return
      mapInteractingRef.current = true
      mapShellRef.current?.classList.add('acp-map--interacting')
      suspendSnapRef.current = suspendAcpMapHeavyOverlays(map, portalLayerIdsRef.current)
    }

    const debouncedMoveEnd = debounceAcpMap(() => {
      if (generation !== mapGenerationRef.current) return
      mapShellRef.current?.classList.remove('acp-map--interacting')
      if (!map.isStyleLoaded()) {
        mapInteractingRef.current = false
        setMapInteractEpoch(epoch => epoch + 1)
        return
      }
      mapInteractingRef.current = false
      publishView()
      const snap = acpRef.current
      const zoomOk = resolveWmsZoomOk(map, map.getZoom())
      const prevZoomOk = zoomOkRef.current
      zoomOkRef.current = zoomOk
      const wmsOnMap = snap.layerVisibility.sentinelWms && zoomOk
      restoreAcpMapHeavyOverlays(
        map,
        snap.layerVisibility,
        portalLayerIdsRef.current,
        wmsOnMap,
        suspendSnapRef.current,
      )
      suspendSnapRef.current = null
      if (snap.aoiMask?.features.length && snap.layerVisibility.sentinelWms) {
        const view = readMapViewFromMap(map)
        const wmsClip = resolveWmsClipFromMap(
          snap.aoiMask,
          snap.countryFilter,
          map,
          snap.config.maxWmsLayers,
        )
        const clipSignature = buildAcpWmsSessionClipSignature(wmsClip)
        const extentTileSignature = buildAcpWmsExtentTileSignature(view.bbox, view.zoom)
        const prev = sessionClipRef.current
        const loadSig = `${extentTileSignature}|${clipSignature}`
        const prevSig = prev ? `${prev.extentTileSignature}|${prev.clipSignature}` : null
        if (loadSig !== prevSig) {
          applyWmsRef.current(map, true)
        } else if (prevZoomOk !== null && prevZoomOk !== zoomOk) {
          applyWmsRef.current(map, false)
        } else {
          setAllWmsRasterLayersDisplay(map, wmsOnMap)
          setAoiFillSuppressed(map, wmsOnMap)
        }
      } else if (prevZoomOk !== null && prevZoomOk !== zoomOk) {
        applyWmsRef.current(map, false)
      } else if (snap.layerVisibility.sentinelWms) {
        setAllWmsRasterLayersDisplay(map, wmsOnMap)
        setAoiFillSuppressed(map, wmsOnMap)
      }
      setMapInteractEpoch(epoch => epoch + 1)
    }, 320)

    map.on('movestart', onMoveStart)
    map.on('moveend', debouncedMoveEnd)
    map.on('click', ACP_LAYER_AOI_FILL, e => {
      const f = e.features?.[0]
      if (!f?.properties) return
      const objectId = String(f.properties.__acpFieldKey ?? f.properties.OBJECTID ?? '')
      if (!objectId) return
      const hit = acpRef.current.allResults.find(r => String(r.objectId) === objectId)
      if (hit?.fieldKey) handleAlertSelect(hit.fieldKey)
    })

    mapRef.current = map
    setMapInstance(map)

    const ro = new ResizeObserver(() => map.resize())
    ro.observe(container)

    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
      setMapInstance(null)
    }
  }, [handleAlertSelect])

  useEffect(() => {
    acp.mapHomeRef.current = () => {
      const map = mapRef.current
      const aoi = acpRef.current.structureMapOutline ?? acpRef.current.aoiMask
      if (!map || !aoi) return
      applyAcpMapFocusTarget(map, resolveAcpMapHomeTarget(aoi, acpRef.current.countryFilter))
    }
    acp.mapFocusGeoJsonRef.current = (geojson: GeoJSON.FeatureCollection) => {
      const map = mapRef.current
      if (!map) return
      const target = resolveAcpMapFocusTargetFromGeoJson(geojson)
      if (target) applyAcpMapFocusTarget(map, target)
    }
    return () => {
      acp.mapHomeRef.current = null
      acp.mapFocusGeoJsonRef.current = null
    }
  }, [acp.mapHomeRef, acp.mapFocusGeoJsonRef, acp.aoiMask, acp.structureMapOutline, mapInstance])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    syncBasemapLayers(map, acp.config.basemapId)
  }, [acp.config.basemapId, mapInstance])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    syncAcpCountryBoundaryLayers(map, null)
  }, [mapInstance])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    applyAoiLayers(map)
  }, [applyAoiLayers, acp.aoiMask, acp.structureMapOutline, acp.selectedFieldKey, acp.countryFilter, mapInstance])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const snap = acpRef.current
    const mapOutline = resolveAcpMapDrawGeoJson(
      snap.aoiMask,
      snap.structureMapOutline,
      snap.countryFilter,
    )
    if (!mapOutline?.features.length) {
      applyAoiWeatherFillPaint(map, snap.layerVisibility.weatherAlerts)
      return
    }
    patchAoiWeatherOnMap(
      map,
      mapOutline,
      weatherEntries,
      snap.layerVisibility.weatherAlerts,
    )
  }, [
    weatherEntries,
    acp.layerVisibility.weatherAlerts,
    acp.aoiMask,
    acp.structureMapOutline,
    acp.countryFilter,
    mapInstance,
  ])

  useEffect(() => {
    portalLayerIdsRef.current = portalLayers.map(pl => pl.row.id)
  }, [portalLayersSignature, portalLayers])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    applyWmsLayers(map, false)
  }, [applyWmsLayers, acp.wmsParams, acp.layerVisibility.sentinelWms, acp.config.maxWmsLayers, mapInstance])

  const mapViewWmsExtentSig = useMemo(
    () => buildAcpWmsExtentTileSignature(acp.mapView.bbox, acp.mapView.zoom ?? 0),
    [acp.mapView.bbox, acp.mapView.zoom],
  )

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded() || mapInteractingRef.current) return
    if (!acp.aoiMask?.features.length || !acp.layerVisibility.sentinelWms) return
    applyWmsRef.current(map, true)
  }, [mapViewWmsExtentSig, acp.aoiMask, acp.layerVisibility.sentinelWms, mapInstance])

  useEffect(() => {
    sessionClipRef.current = null
    wmsKeyRef.current = ''
  }, [acp.aoiMask, acp.countryFilter, acp.wmsParams.revision])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded() || !acp.aoiSyncRevision) return
    sessionClipRef.current = null
    wmsKeyRef.current = ''
    applyAoiLayersRef.current(map)
    const snap = acpRef.current
    if (snap.aoiMask?.features.length && snap.layerVisibility.sentinelWms) {
      applyWmsRef.current(map, true)
    }
  }, [acp.aoiSyncRevision, mapInstance])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded() || !acp.aoiMask?.features.length) return
    applyWmsRef.current(map, true)
  }, [acp.countryFilter, acp.aoiMask, acp.wmsParams.revision, mapInstance])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const sync = () => applyPortalLayers(map)
    if (map.isStyleLoaded()) sync()
    else map.once('load', sync)
  }, [applyPortalLayers, mapInstance, acp.layerVisibility, portalLayersSignature])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    applyAcpMapLayerVisibility(
      map,
      acp.layerVisibility,
      portalLayers.map(pl => pl.row.id),
    )
  }, [acp.layerVisibility, portalLayers, mapInstance])

  useEffect(() => {
    const map = mapRef.current
    const snap = acpRef.current
    if (!map || !snap.selectedFieldKey) return
    const center = resolveAcpFieldLocateCenter(snap.selectedFieldKey, {
      aoiMask: snap.aoiMask,
      allResults: snap.allResults,
      weatherPoints: weatherEntries,
    })
    if (!center) return
    map.flyTo({
      center,
      zoom: Math.max(map.getZoom(), ACP_FIELD_LOCATE_MIN_ZOOM),
      duration: 800,
    })
  }, [
    acp.selectedFieldKey,
    acp.locateFieldSeq,
    acp.allResults,
    acp.weatherTickerFocusFieldKey,
    acp.aoiMask,
    weatherEntries,
    mapInstance,
  ])

  const alertResults = acp.allResults

  return (
    <div
      ref={mapShellRef}
      className={`acp-map${wmsLoading ? ' acp-map--wms-loading' : ''}`}
    >
      <div ref={containerRef} className="acp-map__canvas" />
      <AcpWeatherAlertMarkersLayer
        map={mapInstance}
        entries={weatherEntries}
        tickerFocusFieldKey={acp.weatherTickerFocusFieldKey}
        viewportBbox={acp.mapView.bbox}
        enabled={acp.layerVisibility.weatherAlerts}
        interactionSuspendedRef={mapInteractingRef}
        mapInteractEpoch={mapInteractEpoch}
      />
      <AcpAlertMarkersLayer
        map={mapInstance}
        results={alertResults}
        selectedFieldKey={acp.selectedFieldKey}
        viewportBbox={acp.mapView.bbox}
        enabled={acp.layerVisibility.liveChas}
        interactionSuspendedRef={mapInteractingRef}
        mapInteractEpoch={mapInteractEpoch}
        onSelect={handleAlertSelect}
      />
      <div className="acp-map__scope">
        <button
          type="button"
          className={acp.scopeMode === 'viewport' ? 'is-on' : ''}
          onClick={() => acp.setScopeMode('viewport')}
        >
          Viewport
        </button>
        <button
          type="button"
          className={acp.scopeMode === 'global' ? 'is-on' : ''}
          onClick={() => {
            acp.setScopeMode('global')
            acp.setSelectedFieldKey(null)
            acp.mapHomeRef.current?.()
          }}
        >
          Global
        </button>
      </div>
    </div>
  )
}
