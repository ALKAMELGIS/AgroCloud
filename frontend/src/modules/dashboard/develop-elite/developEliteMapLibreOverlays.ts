import type { GeoJSONSource, Map as MaplibreMap, StyleSpecification } from 'maplibre-gl'
import type { DevelopEliteMapDataLayerId } from './developEliteDashboardConfig'
import {
  developEliteMapDataLayerOpacityValue,
  isDevelopEliteMapDataLayerVisible,
} from './developEliteMapDataLayers'
import { isDevelopEliteMapPortfolio3dActive } from './developEliteMapViewport'
import { layerOpacityFromDrawingInfo } from '@/modules/gis/layers/arcgisDrawingInfoLeaflet'
import {
  DE_MAPLIBRE_LINE_FILTER,
  DE_MAPLIBRE_POINT_FILTER,
  DE_MAPLIBRE_POLY_FILTER,
  DE_MAPLIBRE_POLY_LINE_FILTER,
  developEliteMapLibreHiddenHitFillPaint,
  developEliteMapLibreInvisibleCircleHitPaint,
  developEliteMapLibrePointCirclePaint,
  developEliteMapLibrePointIconLayout,
  developEliteMapLibrePreparePointIcons,
  developEliteMapLibreScalePaintOpacity,
  developEliteMapLibreStructuresExtrusionPaint,
  developEliteMapLibreStructuresPaint,
  developEliteMapLibreWorldCountriesLinePaint,
  type DevelopElitePointIconLayerKey,
} from './developEliteMapLibreArcgisSymbology'
import {
  buildDevelopEliteMainPipeArrowGeoJson,
  developEliteMapLibreMainPipeLinePaint,
  LAYER_IRRIGATION_MAIN_PIPE_ARROWS,
  syncDevelopEliteMainPipeArrowLayer,
} from './developEliteMapLibreIrrigationMainPipe'
import {
  developEliteMapLibreHasLayer,
  developEliteMapLibreRunIfStyleReady,
  isDevelopEliteMapLibreStyleReady,
} from './developEliteMapLibreStyle'
import {
  buildDevelopEliteTreeExtrusionGeoJson,
  developEliteMapLibreTreeExtrusionPaint,
} from './developEliteMapLibreTreeExtrusion'

const SRC_WORLD = 'de-world-countries'
const LAYER_WORLD_LINE = 'de-world-countries-line'
const SRC_STRUCTURES = 'de-agro-structures'
const LAYER_STRUCTURES_FILL = 'de-agro-structures-fill'
const LAYER_STRUCTURES_EXTRUDE = 'de-agro-structures-extrude'
const LAYER_STRUCTURES_LINE = 'de-agro-structures-line'
const SRC_PORTFOLIO = 'de-portfolio-extent'
const LAYER_PORTFOLIO_LINE = 'de-portfolio-extent-line'
const SRC_TREES = 'de-trees'
const LAYER_TREES_CIRCLE = 'de-trees-circle'
const LAYER_TREES_ICON = 'de-trees-icon'
const SRC_TREES_EXTRUDE = 'de-trees-extrude'
const LAYER_TREES_EXTRUDE = 'de-trees-extrude'
const SRC_IRRIGATION_VALVES = 'de-irrigation-valves'
const LAYER_IRRIGATION_VALVES_CIRCLE = 'de-irrigation-valves-circle'
const LAYER_IRRIGATION_VALVES_ICON = 'de-irrigation-valves-icon'
const SRC_IRRIGATION_MAIN_PIPE = 'de-irrigation-main-pipe'
const LAYER_IRRIGATION_MAIN_PIPE_LINE = 'de-irrigation-main-pipe-line'
const SRC_AGRI_LOCATION = 'de-agri-location'
const LAYER_AGRI_LOCATION_CIRCLE = 'de-agri-location-circle'
const LAYER_AGRI_LOCATION_ICON = 'de-agri-location-icon'

/** Interactive overlay layers for identify / popups (excludes portfolio extent). */
export const DE_MAPLIBRE_POPUP_QUERY_LAYER_IDS = [
  LAYER_STRUCTURES_FILL,
  LAYER_STRUCTURES_EXTRUDE,
  LAYER_STRUCTURES_LINE,
  LAYER_TREES_CIRCLE,
  LAYER_TREES_ICON,
  LAYER_TREES_EXTRUDE,
  LAYER_IRRIGATION_VALVES_CIRCLE,
  LAYER_IRRIGATION_VALVES_ICON,
  LAYER_IRRIGATION_MAIN_PIPE_LINE,
  LAYER_IRRIGATION_MAIN_PIPE_ARROWS,
  LAYER_AGRI_LOCATION_CIRCLE,
  LAYER_AGRI_LOCATION_ICON,
] as const

export const DE_MAPLIBRE_OVERLAY_LAYER_IDS = [
  LAYER_WORLD_LINE,
  LAYER_STRUCTURES_FILL,
  LAYER_STRUCTURES_EXTRUDE,
  LAYER_STRUCTURES_LINE,
  LAYER_PORTFOLIO_LINE,
  LAYER_TREES_CIRCLE,
  LAYER_TREES_ICON,
  LAYER_TREES_EXTRUDE,
  LAYER_IRRIGATION_VALVES_CIRCLE,
  LAYER_IRRIGATION_VALVES_ICON,
  LAYER_IRRIGATION_MAIN_PIPE_LINE,
  LAYER_IRRIGATION_MAIN_PIPE_ARROWS,
  LAYER_AGRI_LOCATION_CIRCLE,
  LAYER_AGRI_LOCATION_ICON,
] as const

const overlayVisibilityBeforePause = new WeakMap<MaplibreMap, Map<string, string>>()

/** Hide vector overlays while panning/zooming so the GL canvas stays responsive. */
export function setDevelopEliteMapLibreOverlaysInteractionPaused(
  map: MaplibreMap,
  paused: boolean,
): void {
  if (!isDevelopEliteMapLibreStyleReady(map)) return
  if (paused) {
    const snapshot = new Map<string, string>()
    for (const id of DE_MAPLIBRE_OVERLAY_LAYER_IDS) {
      if (!developEliteMapLibreHasLayer(map, id)) continue
      try {
        const vis = map.getLayoutProperty(id, 'visibility')
        snapshot.set(id, typeof vis === 'string' ? vis : 'visible')
        map.setLayoutProperty(id, 'visibility', 'none')
      } catch {
        /* layer race during style swap */
      }
    }
    overlayVisibilityBeforePause.set(map, snapshot)
    return
  }
  const snapshot = overlayVisibilityBeforePause.get(map)
  overlayVisibilityBeforePause.delete(map)
  for (const id of DE_MAPLIBRE_OVERLAY_LAYER_IDS) {
    if (!developEliteMapLibreHasLayer(map, id)) continue
    const restore = snapshot?.get(id) ?? 'visible'
    try {
      map.setLayoutProperty(id, 'visibility', restore)
    } catch {
      /* ignore */
    }
  }
}

const DATA_LAYER_STACK: Record<
  DevelopEliteMapDataLayerId,
  { sourceId: string; layerIds: string[] }
> = {
  'world-countries': { sourceId: SRC_WORLD, layerIds: [LAYER_WORLD_LINE] },
  'agro-structures': {
    sourceId: SRC_STRUCTURES,
    layerIds: [LAYER_STRUCTURES_FILL, LAYER_STRUCTURES_EXTRUDE, LAYER_STRUCTURES_LINE],
  },
  trees: {
    sourceId: SRC_TREES,
    layerIds: [LAYER_TREES_CIRCLE, LAYER_TREES_ICON, LAYER_TREES_EXTRUDE],
  },
  'irrigation-valves': {
    sourceId: SRC_IRRIGATION_VALVES,
    layerIds: [LAYER_IRRIGATION_VALVES_CIRCLE, LAYER_IRRIGATION_VALVES_ICON],
  },
  'irrigation-main-pipe': {
    sourceId: SRC_IRRIGATION_MAIN_PIPE,
    layerIds: [LAYER_IRRIGATION_MAIN_PIPE_LINE, LAYER_IRRIGATION_MAIN_PIPE_ARROWS],
  },
  'agri-location': { sourceId: SRC_AGRI_LOCATION, layerIds: [LAYER_AGRI_LOCATION_CIRCLE, LAYER_AGRI_LOCATION_ICON] },
}

function emptyFc(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] }
}

function ensureGeoJsonSource(map: MaplibreMap, id: string, data: GeoJSON.FeatureCollection) {
  const existing = map.getSource(id) as GeoJSONSource | undefined
  if (existing?.setData) {
    existing.setData(data)
    return
  }
  if (map.getSource(id)) map.removeSource(id)
  map.addSource(id, { type: 'geojson', data })
}

type LayerFilter = readonly unknown[]

function ensureLineLayer(
  map: MaplibreMap,
  id: string,
  source: string,
  paint: Record<string, unknown>,
  filter?: LayerFilter,
  beforeId?: string,
) {
  if (developEliteMapLibreHasLayer(map, id)) {
    Object.entries(paint).forEach(([k, v]) => map.setPaintProperty(id, k, v))
    return
  }
  map.addLayer(
    {
      id,
      type: 'line',
      source,
      filter: filter as Parameters<MaplibreMap['setFilter']>[1],
      paint,
    },
    beforeId,
  )
}

function ensureFillExtrusionLayer(
  map: MaplibreMap,
  id: string,
  source: string,
  paint: Record<string, unknown>,
  filter?: LayerFilter,
  beforeId?: string,
) {
  if (developEliteMapLibreHasLayer(map, id)) {
    Object.entries(paint).forEach(([k, v]) => map.setPaintProperty(id, k, v))
    return
  }
  map.addLayer(
    {
      id,
      type: 'fill-extrusion',
      source,
      filter: filter as Parameters<MaplibreMap['setFilter']>[1],
      paint,
    },
    beforeId,
  )
}

function ensureFillLayer(
  map: MaplibreMap,
  id: string,
  source: string,
  paint: Record<string, unknown>,
  filter?: LayerFilter,
  beforeId?: string,
) {
  if (developEliteMapLibreHasLayer(map, id)) {
    Object.entries(paint).forEach(([k, v]) => map.setPaintProperty(id, k, v))
    return
  }
  map.addLayer(
    {
      id,
      type: 'fill',
      source,
      filter: filter as Parameters<MaplibreMap['setFilter']>[1],
      paint,
    },
    beforeId,
  )
}

function ensureCircleLayer(
  map: MaplibreMap,
  id: string,
  source: string,
  paint: Record<string, unknown>,
  filter?: LayerFilter,
  beforeId?: string,
) {
  if (developEliteMapLibreHasLayer(map, id)) {
    Object.entries(paint).forEach(([k, v]) => map.setPaintProperty(id, k, v))
    return
  }
  map.addLayer(
    {
      id,
      type: 'circle',
      source,
      filter: filter as Parameters<MaplibreMap['setFilter']>[1],
      paint,
    },
    beforeId,
  )
}

function ensureSymbolLayer(
  map: MaplibreMap,
  id: string,
  source: string,
  layout: Record<string, unknown>,
  paint: Record<string, unknown>,
  filter?: LayerFilter,
  beforeId?: string,
) {
  if (developEliteMapLibreHasLayer(map, id)) {
    Object.entries(layout).forEach(([k, v]) => map.setLayoutProperty(id, k, v))
    Object.entries(paint).forEach(([k, v]) => map.setPaintProperty(id, k, v))
    return
  }
  map.addLayer(
    {
      id,
      type: 'symbol',
      source,
      filter: filter as Parameters<MaplibreMap['setFilter']>[1],
      layout,
      paint,
    },
    beforeId,
  )
}

/** Panel order is top → bottom; bottom layers are stacked first, then each `moveLayer` to top. */
function applyDataLayerZOrder(map: MaplibreMap, mapDataLayerOrder: DevelopEliteMapDataLayerId[]) {
  const bottomToTop = [...mapDataLayerOrder].reverse()
  for (const dataLayerId of bottomToTop) {
    const stack = DATA_LAYER_STACK[dataLayerId]
    if (!stack) continue
    for (const layerId of stack.layerIds) {
      if (!developEliteMapLibreHasLayer(map, layerId)) continue
      try {
        map.moveLayer(layerId)
      } catch {
        /* style swap race */
      }
    }
  }
  if (developEliteMapLibreHasLayer(map, LAYER_PORTFOLIO_LINE)) {
    try {
      map.moveLayer(LAYER_PORTFOLIO_LINE)
    } catch {
      /* ignore */
    }
  }
}

function syncArcgisPointLayer(
  map: MaplibreMap,
  opts: {
    sourceId: string
    circleLayerId: string
    iconLayerId: string
    layerSafeId: string
    layerKey: DevelopElitePointIconLayerKey
    drawingInfo: Record<string, unknown> | null | undefined
    data: GeoJSON.FeatureCollection
    visible: boolean
    /** Flat picture/simple markers — off in 3D when extrusion columns replace crowns. */
    iconsVisible?: boolean
    mapZoom: number
    userOpacityScale?: number
    fallback: { color: string; stroke: string; radius: number }
    onArcgisIconsLoaded?: () => void
  },
) {
  ensureGeoJsonSource(map, opts.sourceId, opts.data)
  const userScale = opts.userOpacityScale ?? 1
  const layerOpacity = layerOpacityFromDrawingInfo(opts.drawingInfo) * userScale
  const { spec, iconsReady, iconSize } = developEliteMapLibrePreparePointIcons(
    map,
    opts.layerSafeId,
    opts.drawingInfo,
    opts.layerKey,
    opts.mapZoom,
    () => opts.onArcgisIconsLoaded?.(),
  )
  const iconsOn = opts.iconsVisible !== false
  const pictureMarkerRenderer = Boolean(spec?.entries?.length)
  const showPictureIcons = iconsOn && pictureMarkerRenderer && iconsReady

  const invisibleHitRadius =
    opts.layerKey === 'irrigation-valves' ? 10 : opts.layerKey === 'trees' ? 8 : 7

  if (showPictureIcons) {
    /** esriPMS picture markers only — no esriSMS fallback circles (purple/yellow halos). */
    ensureCircleLayer(
      map,
      opts.circleLayerId,
      opts.sourceId,
      developEliteMapLibreInvisibleCircleHitPaint(invisibleHitRadius),
      DE_MAPLIBRE_POINT_FILTER,
    )
    map.setLayoutProperty(opts.circleLayerId, 'visibility', opts.visible ? 'visible' : 'none')

    const { layout, paint } = developEliteMapLibrePointIconLayout(spec!, iconSize, opts.visible, layerOpacity)
    ensureSymbolLayer(map, opts.iconLayerId, opts.sourceId, layout, paint, DE_MAPLIBRE_POINT_FILTER)
    map.setLayoutProperty(opts.iconLayerId, 'visibility', opts.visible ? 'visible' : 'none')
    return
  }

  if (pictureMarkerRenderer) {
    /** Icons still loading — hide SMS halos until real PMS symbols are ready. */
    if (developEliteMapLibreHasLayer(map, opts.circleLayerId)) {
      map.setLayoutProperty(opts.circleLayerId, 'visibility', 'none')
    }
    if (developEliteMapLibreHasLayer(map, opts.iconLayerId)) {
      map.setLayoutProperty(opts.iconLayerId, 'visibility', 'none')
    }
    return
  }

  /** esriSMS / simple marker symbology — circle layer is the authored style. */
  const circlePaint = developEliteMapLibrePointCirclePaint(opts.drawingInfo, opts.fallback)
  ensureCircleLayer(map, opts.circleLayerId, opts.sourceId, circlePaint, DE_MAPLIBRE_POINT_FILTER)
  map.setLayoutProperty(opts.circleLayerId, 'visibility', opts.visible ? 'visible' : 'none')
  if (developEliteMapLibreHasLayer(map, opts.iconLayerId)) {
    map.setLayoutProperty(opts.iconLayerId, 'visibility', 'none')
  }
}

export { isDevelopEliteMapLibreStyleReady } from './developEliteMapLibreStyle'

export type DevelopEliteMapLibreOverlaySyncOpts = {
  mapDataLayerOrder: DevelopEliteMapDataLayerId[]
  mapLayerVisibility: Record<DevelopEliteMapDataLayerId, boolean>
  mapDataLayerOpacity?: Record<DevelopEliteMapDataLayerId, number>
  mapZoom: number
  viewMode3d: boolean
  structuresDrawingInfo?: Record<string, unknown> | null
  worldCountriesDrawingInfo?: Record<string, unknown> | null
  treesDrawingInfo?: Record<string, unknown> | null
  irrigationValvesDrawingInfo?: Record<string, unknown> | null
  irrigationMainPipeDrawingInfo?: Record<string, unknown> | null
  agriLocationDrawingInfo?: Record<string, unknown> | null
  onArcgisIconsLoaded?: () => void
  worldCountries: GeoJSON.FeatureCollection | null
  structures: GeoJSON.FeatureCollection | null
  portfolioExtent: GeoJSON.FeatureCollection | null
  trees: GeoJSON.FeatureCollection | null
  irrigationValves: GeoJSON.FeatureCollection | null
  irrigationMainPipe: GeoJSON.FeatureCollection | null
  agriLocation: GeoJSON.FeatureCollection | null
}

export function syncDevelopEliteMapLibreOverlays(map: MaplibreMap, opts: DevelopEliteMapLibreOverlaySyncOpts): void {
  developEliteMapLibreRunIfStyleReady(map, map => {
  const showWorld = isDevelopEliteMapDataLayerVisible(opts.mapLayerVisibility, 'world-countries')
  const showStructures = isDevelopEliteMapDataLayerVisible(opts.mapLayerVisibility, 'agro-structures')
  const showTrees = isDevelopEliteMapDataLayerVisible(opts.mapLayerVisibility, 'trees')
  const showValves = isDevelopEliteMapDataLayerVisible(opts.mapLayerVisibility, 'irrigation-valves')
  const showPipe = isDevelopEliteMapDataLayerVisible(opts.mapLayerVisibility, 'irrigation-main-pipe')
  const showAgri = isDevelopEliteMapDataLayerVisible(opts.mapLayerVisibility, 'agri-location')

  const layerUserOpacity = (id: DevelopEliteMapDataLayerId) =>
    developEliteMapDataLayerOpacityValue(opts.mapDataLayerOpacity ?? {}, id)

  const extrude3d = isDevelopEliteMapPortfolio3dActive(opts.viewMode3d)

  const world =
    showWorld && opts.worldCountries?.features?.length ? opts.worldCountries : emptyFc()
  ensureGeoJsonSource(map, SRC_WORLD, world)
  ensureLineLayer(
    map,
    LAYER_WORLD_LINE,
    SRC_WORLD,
    developEliteMapLibreScalePaintOpacity(
      developEliteMapLibreWorldCountriesLinePaint(opts.worldCountriesDrawingInfo),
      layerUserOpacity('world-countries'),
    ),
    DE_MAPLIBRE_POLY_LINE_FILTER,
  )
  map.setLayoutProperty(LAYER_WORLD_LINE, 'visibility', showWorld ? 'visible' : 'none')

  const structures =
    showStructures && opts.structures?.features?.length ? opts.structures : emptyFc()
  const structuresOp = layerUserOpacity('agro-structures')
  const structuresPaintRaw = developEliteMapLibreStructuresPaint(opts.structuresDrawingInfo)
  const structuresPaint = {
    fill: developEliteMapLibreScalePaintOpacity(structuresPaintRaw.fill, structuresOp),
    line: developEliteMapLibreScalePaintOpacity(structuresPaintRaw.line, structuresOp),
  }
  const structuresExtrusionPaint = developEliteMapLibreScalePaintOpacity(
    developEliteMapLibreStructuresExtrusionPaint(opts.structuresDrawingInfo),
    structuresOp,
  )
  const structures3d = Boolean(extrude3d && showStructures)
  ensureGeoJsonSource(map, SRC_STRUCTURES, structures)
  ensureFillLayer(map, LAYER_STRUCTURES_FILL, SRC_STRUCTURES, structuresPaint.fill, DE_MAPLIBRE_POLY_FILTER)
  if (developEliteMapLibreHasLayer(map, LAYER_STRUCTURES_EXTRUDE)) {
    Object.entries(structuresExtrusionPaint).forEach(([k, v]) => map.setPaintProperty(LAYER_STRUCTURES_EXTRUDE, k, v))
  } else {
    ensureFillExtrusionLayer(
      map,
      LAYER_STRUCTURES_EXTRUDE,
      SRC_STRUCTURES,
      structuresExtrusionPaint,
      DE_MAPLIBRE_POLY_FILTER,
    )
  }
  ensureLineLayer(map, LAYER_STRUCTURES_LINE, SRC_STRUCTURES, structuresPaint.line, DE_MAPLIBRE_POLY_LINE_FILTER)
  const structuresFillPaint =
    showStructures && structures3d
      ? developEliteMapLibreHiddenHitFillPaint(structuresPaint.fill)
      : structuresPaint.fill
  Object.entries(structuresFillPaint).forEach(([key, value]) => {
    map.setPaintProperty(LAYER_STRUCTURES_FILL, key, value)
  })
  map.setLayoutProperty(LAYER_STRUCTURES_FILL, 'visibility', showStructures ? 'visible' : 'none')
  map.setLayoutProperty(LAYER_STRUCTURES_EXTRUDE, 'visibility', structures3d ? 'visible' : 'none')
  map.setLayoutProperty(LAYER_STRUCTURES_LINE, 'visibility', showStructures ? 'visible' : 'none')

  const trees = showTrees && opts.trees?.features?.length ? opts.trees : emptyFc()
  const trees3d = Boolean(extrude3d && showTrees)
  const treeExtrusions =
    trees3d && trees.features.length
      ? buildDevelopEliteTreeExtrusionGeoJson(trees, opts.treesDrawingInfo)
      : emptyFc()
  ensureGeoJsonSource(map, SRC_TREES_EXTRUDE, treeExtrusions)
  ensureFillExtrusionLayer(
    map,
    LAYER_TREES_EXTRUDE,
    SRC_TREES_EXTRUDE,
    developEliteMapLibreTreeExtrusionPaint(),
    DE_MAPLIBRE_POLY_FILTER,
  )
  map.setLayoutProperty(
    LAYER_TREES_EXTRUDE,
    'visibility',
    trees3d && treeExtrusions.features.length ? 'visible' : 'none',
  )

  const hideTreeIconsFor3dExtrusion = trees3d && treeExtrusions.features.length > 0

  syncArcgisPointLayer(map, {
    sourceId: SRC_TREES,
    circleLayerId: LAYER_TREES_CIRCLE,
    iconLayerId: LAYER_TREES_ICON,
    layerSafeId: SRC_TREES,
    layerKey: 'trees',
    drawingInfo: opts.treesDrawingInfo,
    data: trees,
    visible: showTrees,
    iconsVisible: !hideTreeIconsFor3dExtrusion,
    mapZoom: opts.mapZoom,
    userOpacityScale: layerUserOpacity('trees'),
    fallback: { color: '#39ff14', stroke: '#7ee787', radius: 5 },
    onArcgisIconsLoaded: opts.onArcgisIconsLoaded,
  })

  const valves =
    showValves && opts.irrigationValves?.features?.length ? opts.irrigationValves : emptyFc()
  syncArcgisPointLayer(map, {
    sourceId: SRC_IRRIGATION_VALVES,
    circleLayerId: LAYER_IRRIGATION_VALVES_CIRCLE,
    iconLayerId: LAYER_IRRIGATION_VALVES_ICON,
    layerSafeId: SRC_IRRIGATION_VALVES,
    layerKey: 'irrigation-valves',
    drawingInfo: opts.irrigationValvesDrawingInfo,
    data: valves,
    visible: showValves,
    mapZoom: opts.mapZoom,
    userOpacityScale: layerUserOpacity('irrigation-valves'),
    fallback: { color: '#38bdf8', stroke: '#0ea5e9', radius: 6 },
    onArcgisIconsLoaded: opts.onArcgisIconsLoaded,
  })

  const pipe =
    showPipe && opts.irrigationMainPipe?.features?.length ? opts.irrigationMainPipe : emptyFc()
  ensureGeoJsonSource(map, SRC_IRRIGATION_MAIN_PIPE, pipe)
  ensureLineLayer(
    map,
    LAYER_IRRIGATION_MAIN_PIPE_LINE,
    SRC_IRRIGATION_MAIN_PIPE,
    developEliteMapLibreScalePaintOpacity(
      developEliteMapLibreMainPipeLinePaint(opts.irrigationMainPipeDrawingInfo, opts.mapZoom),
      layerUserOpacity('irrigation-main-pipe'),
    ),
    DE_MAPLIBRE_LINE_FILTER,
  )
  map.setLayoutProperty(LAYER_IRRIGATION_MAIN_PIPE_LINE, 'visibility', showPipe ? 'visible' : 'none')
  const pipeArrows = buildDevelopEliteMainPipeArrowGeoJson(
    pipe,
    opts.irrigationMainPipeDrawingInfo,
    opts.mapZoom,
    map.getCenter().lat,
  )
  syncDevelopEliteMainPipeArrowLayer(map, pipeArrows, showPipe)

  const agri = showAgri && opts.agriLocation?.features?.length ? opts.agriLocation : emptyFc()
  syncArcgisPointLayer(map, {
    sourceId: SRC_AGRI_LOCATION,
    circleLayerId: LAYER_AGRI_LOCATION_CIRCLE,
    iconLayerId: LAYER_AGRI_LOCATION_ICON,
    layerKey: 'agri-location',
    layerSafeId: SRC_AGRI_LOCATION,
    drawingInfo: opts.agriLocationDrawingInfo,
    data: agri,
    visible: showAgri,
    mapZoom: opts.mapZoom,
    userOpacityScale: layerUserOpacity('agri-location'),
    fallback: { color: '#fbbf24', stroke: '#fef3c7', radius: 7 },
    onArcgisIconsLoaded: opts.onArcgisIconsLoaded,
  })

  const portfolio = opts.portfolioExtent?.features?.length ? opts.portfolioExtent : emptyFc()
  ensureGeoJsonSource(map, SRC_PORTFOLIO, portfolio)
  ensureLineLayer(map, LAYER_PORTFOLIO_LINE, SRC_PORTFOLIO, {
    'line-color': '#7dd87d',
    'line-width': 1,
    'line-dasharray': [2, 2],
    'line-opacity': 0.65,
  })

  applyDataLayerZOrder(map, opts.mapDataLayerOrder)
  })
}

export type DevelopEliteMapLibreStyle = StyleSpecification | string
