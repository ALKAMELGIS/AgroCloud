/**

 * FTW global PMTiles on Mapbox GL JS (no addProtocol — loads MVT tiles into GeoJSON).

 */



import mapboxgl from 'mapbox-gl'

import { VectorTile } from '@mapbox/vector-tile'

import Protobuf from 'pbf'

import { PMTiles } from 'pmtiles'

import {

  FTW_GLOBAL_FIELD_MIN_ZOOM,

  FTW_GLOBAL_FILL_ID,

  FTW_GLOBAL_LINE_ID,

  FTW_GLOBAL_SEAMLESS_LAYER_ID,

  FTW_GLOBAL_SEAMLESS_SOURCE_ID,

  FTW_GLOBAL_SOURCE_ID,

  ftwThresholdToRaw,

  getFtwGlobalPmtilesUrl,

  getFtwGlobalSourceLayer,

  type FtwGlobalLayerSettings,

} from './ftwGlobalConfig'

import { clipFeatureCollectionToAoi } from '../trainingAi/clipResultsToAoi'

import { buildFtwVisualSeamlessRaster } from './ftwGlobalVisualSeamless'
import { hideFtwTileBoundariesOnly } from './ftwHideTileBoundaries'
import { dedupeFtwTileFeatures } from './ftwGlobalTileDedupe'
import type { FtwGlobalYear } from './ftwGlobalConfig'



type MapboxMap = mapboxgl.Map



type MapRuntime = {

  moveEndHandler: () => void

  zoomEndHandler: () => void

  debounceId: number | null

  abort: AbortController | null

  pmtiles: PMTiles | null

  pmtilesUrl: string

  loadSeq: number

  settings: FtwGlobalLayerSettings

  moveBound: boolean

  interacting: boolean

}



const mapRuntime = new WeakMap<MapboxMap, MapRuntime>()

const sharedPmtilesByUrl = new Map<string, PMTiles>()

const MAX_TILES_PER_VIEW = 48

const MAX_FEATURES_PER_VIEW = 12_000

const MOVEEND_DEBOUNCE_MS = 140

const INITIAL_LOAD_DEBOUNCE_MS = 0



function lonToTileX(lon: number, z: number): number {

  return Math.floor(((lon + 180) / 360) * 2 ** z)

}



function latToTileY(lat: number, z: number): number {

  const rad = (lat * Math.PI) / 180

  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z)

}



function tileRangeForBounds(

  bounds: mapboxgl.LngLatBounds,

  z: number,

): Array<{ z: number; x: number; y: number }> {

  const west = bounds.getWest()

  const east = bounds.getEast()

  const south = bounds.getSouth()

  const north = bounds.getNorth()

  const xMin = lonToTileX(west, z)

  const xMax = lonToTileX(east, z)

  const yMin = latToTileY(north, z)

  const yMax = latToTileY(south, z)

  const tiles: Array<{ z: number; x: number; y: number }> = []

  for (let x = xMin; x <= xMax; x++) {

    for (let y = yMin; y <= yMax; y++) {

      tiles.push({ z, x, y })

      if (tiles.length >= MAX_TILES_PER_VIEW) return tiles

    }

  }

  return tiles

}



function confidenceExpr(): mapboxgl.Expression {

  return ['to-number', ['get', 'confidence_mean']] as mapboxgl.Expression

}



function buildFilter(thresholdPct: number): mapboxgl.Expression {

  return ['>=', confidenceExpr(), ftwThresholdToRaw(thresholdPct)] as mapboxgl.Expression

}



function buildLineColor(): mapboxgl.Expression {

  const t70 = ftwThresholdToRaw(70)

  const t80 = ftwThresholdToRaw(80)

  const t100 = ftwThresholdToRaw(100)

  return [

    'interpolate',

    ['linear'],

    confidenceExpr(),

    0,

    '#d7191c',

    t70,

    '#fec379',

    t80,

    '#cfecb0',

    t100,

    '#33a02c',

  ] as mapboxgl.Expression

}



function layerVisibility(visible: boolean): 'visible' | 'none' {

  return visible ? 'visible' : 'none'

}



function paintOpacities(opacityPct: number): { lineOpacity: number; fillOpacity: number } {

  const lineOpacity = Math.max(0, Math.min(1, opacityPct / 100))

  return { lineOpacity, fillOpacity: lineOpacity * 0.45 }

}



/** Vector tiles paint immediately; seamless raster replaces them when ready. */
function hideVectorDisplayLayers(map: MapboxMap): void {

  for (const layerId of [FTW_GLOBAL_FILL_ID, FTW_GLOBAL_LINE_ID]) {

    if (!map.getLayer(layerId)) continue

    map.setLayoutProperty(layerId, 'visibility', 'none')

  }

}

function showVectorDisplayLayers(map: MapboxMap, settings: FtwGlobalLayerSettings): void {

  if (!settings.visible) {

    hideVectorDisplayLayers(map)

    return

  }

  for (const layerId of [FTW_GLOBAL_FILL_ID, FTW_GLOBAL_LINE_ID]) {

    if (!map.getLayer(layerId)) continue

    map.setLayoutProperty(layerId, 'visibility', 'visible')

  }

}



function clearSeamlessRaster(map: MapboxMap): void {

  if (map.getLayer(FTW_GLOBAL_SEAMLESS_LAYER_ID)) {

    map.setLayoutProperty(FTW_GLOBAL_SEAMLESS_LAYER_ID, 'visibility', 'none')

  }

  const src = map.getSource(FTW_GLOBAL_SEAMLESS_SOURCE_ID) as mapboxgl.ImageSource | undefined

  if (src) {

    src.updateImage({ url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', coordinates: [

      [0, 1],

      [1, 1],

      [1, 0],

      [0, 0],

    ] })

  }

}



function updateSeamlessRasterDisplay(

  map: MapboxMap,

  settings: FtwGlobalLayerSettings,

  features: GeoJSON.Feature[],

  bounds: mapboxgl.LngLatBounds,

): void {

  if (!settings.visible) {

    clearSeamlessRaster(map)

    return

  }



  const bbox: [number, number, number, number] = [

    bounds.getWest(),

    bounds.getSouth(),

    bounds.getEast(),

    bounds.getNorth(),

  ]

  const raster = buildFtwVisualSeamlessRaster(features, bbox)

  const { fillOpacity } = paintOpacities(settings.opacityPct)

  const src = map.getSource(FTW_GLOBAL_SEAMLESS_SOURCE_ID) as mapboxgl.ImageSource | undefined



  if (!raster) {

    clearSeamlessRaster(map)

    return

  }



  if (src) {

    src.updateImage({ url: raster.dataUrl, coordinates: raster.coordinates })

  }



  if (map.getLayer(FTW_GLOBAL_SEAMLESS_LAYER_ID)) {

    map.setLayoutProperty(

      FTW_GLOBAL_SEAMLESS_LAYER_ID,

      'visibility',

      layerVisibility(settings.visible),

    )

    map.setPaintProperty(FTW_GLOBAL_SEAMLESS_LAYER_ID, 'raster-opacity', fillOpacity)

  }

}



function getOrCreateSharedPmtiles(url: string): PMTiles {
  let pm = sharedPmtilesByUrl.get(url)
  if (!pm) {
    pm = new PMTiles(url)
    sharedPmtilesByUrl.set(url, pm)
    void pm.getHeader().catch(() => {})
  }
  return pm
}

/** Prefetch PMTiles header so the first viewport paint is faster. */
export function warmFtwGlobalPmtiles(year: FtwGlobalYear): void {
  getOrCreateSharedPmtiles(getFtwGlobalPmtilesUrl(year))
}

function getRuntime(map: MapboxMap): MapRuntime {

  let rt = mapRuntime.get(map)

  if (!rt) {

    rt = {

      moveEndHandler: () => {},

      zoomEndHandler: () => {},

      debounceId: null,

      abort: null,

      pmtiles: null,

      pmtilesUrl: '',

      loadSeq: 0,

      settings: { visible: false, year: 2025, thresholdPct: 70, opacityPct: 90 },

      moveBound: false,

      interacting: false,

    }

    mapRuntime.set(map, rt)

  }

  return rt

}



function parseTileFeatures(

  data: ArrayBuffer,

  z: number,

  x: number,

  y: number,

  sourceLayer: string,

  thresholdRaw: number,

): GeoJSON.Feature[] {

  const tile = new VectorTile(new Protobuf(data))

  const layer = tile.layers[sourceLayer]

  if (!layer) return []

  const out: GeoJSON.Feature[] = []

  for (let i = 0; i < layer.length; i++) {

    const feature = layer.feature(i)

    const geo = feature.toGeoJSON(x, y, z) as GeoJSON.Feature

    const props = (geo.properties ?? {}) as Record<string, unknown>

    const conf = Number(props.confidence_mean ?? props.confidence ?? 0)

    if (!Number.isFinite(conf) || conf < thresholdRaw) continue

    geo.properties = {

      ...props,

      confidence_mean: conf,

      source: 'ftw-global',

    }

    out.push(geo)

  }

  return out

}



async function loadViewportTiles(

  map: MapboxMap,

  settings: FtwGlobalLayerSettings,

  rt: MapRuntime,

): Promise<void> {

  if (!settings.visible || rt.interacting) return

  const zoom = map.getZoom()

  if (zoom < FTW_GLOBAL_FIELD_MIN_ZOOM) {

    const src = map.getSource(FTW_GLOBAL_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined

    src?.setData({ type: 'FeatureCollection', features: [] })

    clearSeamlessRaster(map)

    return

  }



  const z = Math.min(14, Math.max(FTW_GLOBAL_FIELD_MIN_ZOOM, Math.floor(zoom)))

  const bounds = map.getBounds()

  if (!bounds) return



  const url = getFtwGlobalPmtilesUrl(settings.year)

  const pm = getOrCreateSharedPmtiles(url)

  rt.pmtiles = pm

  rt.pmtilesUrl = url



  rt.abort?.abort()

  const abort = new AbortController()

  rt.abort = abort

  const seq = ++rt.loadSeq

  const sourceLayer = getFtwGlobalSourceLayer(settings.year)

  const thresholdRaw = ftwThresholdToRaw(settings.thresholdPct)

  const tiles = tileRangeForBounds(bounds, z)



  const featureBatches = await Promise.all(

    tiles.map(async ({ z: tz, x, y }) => {

      if (abort.signal.aborted) return [] as GeoJSON.Feature[]

      try {

        const resp = await pm.getZxy(tz, x, y, abort.signal)

        if (!resp?.data) return []

        return parseTileFeatures(resp.data, tz, x, y, sourceLayer, thresholdRaw)

      } catch (err) {

        if ((err as Error)?.name === 'AbortError') return []

        return []

      }

    }),

  )



  if (abort.signal.aborted || seq !== rt.loadSeq || rt.interacting) return

  const features = featureBatches.flat().slice(0, MAX_FEATURES_PER_VIEW)

  const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features }

  const clipped =

    settings.aoiMask?.features?.length

      ? clipFeatureCollectionToAoi(fc, settings.aoiMask)

      : fc



  const quickFeatures = dedupeFtwTileFeatures(clipped.features ?? [])

  const quickFc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: quickFeatures }

  const src = map.getSource(FTW_GLOBAL_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined

  src?.setData(quickFc)

  showVectorDisplayLayers(map, settings)

  const boundsSnapshot = bounds

  const settingsSnapshot = settings

  window.requestAnimationFrame(() => {

    if (abort.signal.aborted || seq !== rt.loadSeq || rt.interacting) return

    const seamHidden = hideFtwTileBoundariesOnly(quickFeatures, z)

    updateSeamlessRasterDisplay(map, settingsSnapshot, seamHidden, boundsSnapshot)

    hideVectorDisplayLayers(map)

  })

}



function scheduleViewportLoad(

  map: MapboxMap,

  settings: FtwGlobalLayerSettings,

  debounceMs = MOVEEND_DEBOUNCE_MS,

): void {

  const rt = getRuntime(map)

  if (rt.interacting) return

  if (rt.debounceId != null) window.clearTimeout(rt.debounceId)

  rt.debounceId = window.setTimeout(() => {

    rt.debounceId = null

    void loadViewportTiles(map, settings, rt)

  }, debounceMs)

}



function ensureLayers(map: MapboxMap, settings: FtwGlobalLayerSettings): void {

  const visibility = layerVisibility(settings.visible)

  const { lineOpacity, fillOpacity } = paintOpacities(settings.opacityPct)

  const filter = buildFilter(settings.thresholdPct)



  if (!map.getSource(FTW_GLOBAL_SOURCE_ID)) {

    map.addSource(FTW_GLOBAL_SOURCE_ID, {

      type: 'geojson',

      data: { type: 'FeatureCollection', features: [] },

    })

  }



  if (!map.getLayer(FTW_GLOBAL_FILL_ID)) {

    map.addLayer({

      id: FTW_GLOBAL_FILL_ID,

      type: 'fill',

      source: FTW_GLOBAL_SOURCE_ID,

      minzoom: FTW_GLOBAL_FIELD_MIN_ZOOM,

      filter,

      layout: { visibility: 'none' },

      paint: {

        'fill-color': buildLineColor(),

        'fill-opacity': fillOpacity,

        'fill-outline-color': 'rgba(0,0,0,0)',

      },

    })

  }



  if (!map.getLayer(FTW_GLOBAL_LINE_ID)) {

    map.addLayer({

      id: FTW_GLOBAL_LINE_ID,

      type: 'line',

      source: FTW_GLOBAL_SOURCE_ID,

      minzoom: FTW_GLOBAL_FIELD_MIN_ZOOM,

      filter,

      layout: {

        visibility: 'none',

        'line-join': 'round',

        'line-cap': 'round',

      },

      paint: {

        'line-color': buildLineColor(),

        'line-width': 1.2,

        'line-opacity': lineOpacity,

      },

    })

  }



  if (!map.getSource(FTW_GLOBAL_SEAMLESS_SOURCE_ID)) {

    map.addSource(FTW_GLOBAL_SEAMLESS_SOURCE_ID, {

      type: 'image',

      url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',

      coordinates: [

        [0, 1],

        [1, 1],

        [1, 0],

        [0, 0],

      ],

    })

  }



  if (!map.getLayer(FTW_GLOBAL_SEAMLESS_LAYER_ID)) {

    map.addLayer({

      id: FTW_GLOBAL_SEAMLESS_LAYER_ID,

      type: 'raster',

      source: FTW_GLOBAL_SEAMLESS_SOURCE_ID,

      minzoom: FTW_GLOBAL_FIELD_MIN_ZOOM,

      layout: { visibility },

      paint: {

        'raster-opacity': fillOpacity,

        'raster-fade-duration': 0,

      },

    })

  }



  hideVectorDisplayLayers(map)

}



function attachViewportHandlers(map: MapboxMap): void {

  const rt = getRuntime(map)

  if (rt.moveBound) return



  rt.moveEndHandler = () => scheduleViewportLoad(map, rt.settings)

  rt.zoomEndHandler = () => scheduleViewportLoad(map, rt.settings, 60)



  map.on('moveend', rt.moveEndHandler)

  map.on('zoomend', rt.zoomEndHandler)

  rt.moveBound = true

}



function updateLayerPaint(map: MapboxMap, settings: FtwGlobalLayerSettings): void {

  const visibility = layerVisibility(settings.visible)

  const { lineOpacity, fillOpacity } = paintOpacities(settings.opacityPct)

  const filter = buildFilter(settings.thresholdPct)



  for (const layerId of [FTW_GLOBAL_FILL_ID, FTW_GLOBAL_LINE_ID]) {

    if (!map.getLayer(layerId)) continue

    map.setLayoutProperty(layerId, 'visibility', 'none')

    map.setFilter(layerId, filter)

  }

  if (map.getLayer(FTW_GLOBAL_FILL_ID)) {

    map.setPaintProperty(FTW_GLOBAL_FILL_ID, 'fill-color', buildLineColor())

    map.setPaintProperty(FTW_GLOBAL_FILL_ID, 'fill-opacity', fillOpacity)

  }

  if (map.getLayer(FTW_GLOBAL_LINE_ID)) {

    map.setPaintProperty(FTW_GLOBAL_LINE_ID, 'line-color', buildLineColor())

    map.setPaintProperty(FTW_GLOBAL_LINE_ID, 'line-opacity', lineOpacity)

    map.setPaintProperty(FTW_GLOBAL_LINE_ID, 'line-width', 1.2)

  }

  if (map.getLayer(FTW_GLOBAL_SEAMLESS_LAYER_ID)) {

    map.setLayoutProperty(FTW_GLOBAL_SEAMLESS_LAYER_ID, 'visibility', visibility)

    map.setPaintProperty(FTW_GLOBAL_SEAMLESS_LAYER_ID, 'raster-opacity', fillOpacity)

  }

  hideVectorDisplayLayers(map)

}



/** Lighten FTW paint while the camera moves so pan/zoom stays responsive. */

export function setFtwGlobalInteractionMode(

  map: MapboxMap | null | undefined,

  interacting: boolean,

  opacityPct = 90,

): void {

  if (!map?.getLayer) return

  const rt = getRuntime(map)

  rt.interacting = interacting



  if (interacting) {

    rt.abort?.abort()

    if (rt.debounceId != null) {

      window.clearTimeout(rt.debounceId)

      rt.debounceId = null

    }

  }



  const { lineOpacity, fillOpacity } = paintOpacities(opacityPct)

  if (map.getLayer(FTW_GLOBAL_SEAMLESS_LAYER_ID)) {

    map.setPaintProperty(

      FTW_GLOBAL_SEAMLESS_LAYER_ID,

      'raster-opacity',

      interacting ? fillOpacity * 0.25 : fillOpacity,

    )

  }

  if (map.getLayer(FTW_GLOBAL_FILL_ID)) {

    map.setPaintProperty(

      FTW_GLOBAL_FILL_ID,

      'fill-opacity',

      interacting ? fillOpacity * 0.25 : fillOpacity,

    )

  }

  if (map.getLayer(FTW_GLOBAL_LINE_ID)) {

    map.setPaintProperty(

      FTW_GLOBAL_LINE_ID,

      'line-opacity',

      interacting ? lineOpacity * 0.45 : lineOpacity,

    )

    map.setPaintProperty(FTW_GLOBAL_LINE_ID, 'line-width', interacting ? 0.7 : 1.2)

  }



  if (!interacting && rt.settings.visible) {

    scheduleViewportLoad(map, rt.settings, 80)

  }

}



export function syncFtwGlobalMapLayer(map: MapboxMap | null | undefined, settings: FtwGlobalLayerSettings): void {

  if (!map?.addSource) return



  const rt = getRuntime(map)

  rt.settings = settings



  ensureLayers(map, settings)

  attachViewportHandlers(map)

  updateLayerPaint(map, settings)

  if (!rt.interacting) {

    scheduleViewportLoad(map, settings, INITIAL_LOAD_DEBOUNCE_MS)

  }

}



export function removeFtwGlobalMapLayer(map: MapboxMap | null | undefined): void {

  if (!map?.getSource) return

  const rt = mapRuntime.get(map)

  if (rt) {

    rt.abort?.abort()

    if (rt.debounceId != null) window.clearTimeout(rt.debounceId)

    if (rt.moveBound) {

      try {

        map.off('moveend', rt.moveEndHandler)

        map.off('zoomend', rt.zoomEndHandler)

      } catch {

        /* ignore */

      }

    }

    mapRuntime.delete(map)

  }

  if (map.getLayer(FTW_GLOBAL_LINE_ID)) map.removeLayer(FTW_GLOBAL_LINE_ID)

  if (map.getLayer(FTW_GLOBAL_FILL_ID)) map.removeLayer(FTW_GLOBAL_FILL_ID)

  if (map.getLayer(FTW_GLOBAL_SEAMLESS_LAYER_ID)) map.removeLayer(FTW_GLOBAL_SEAMLESS_LAYER_ID)

  if (map.getSource(FTW_GLOBAL_SEAMLESS_SOURCE_ID)) map.removeSource(FTW_GLOBAL_SEAMLESS_SOURCE_ID)

  if (map.getSource(FTW_GLOBAL_SOURCE_ID)) map.removeSource(FTW_GLOBAL_SOURCE_ID)

}


