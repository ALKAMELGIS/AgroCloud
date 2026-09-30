/** Central GIS repository — shared types and helpers for portal ↔ map sync. */

export type GisContentDataFormat =
  | 'vector'
  | 'raster'
  | 'geojson'
  | 'shapefile'
  | 'geotiff'
  | 'cog'
  | 'wms'
  | 'wmts'
  | 'xyz'
  | '3d-tiles'
  | 'sentinel'
  | 'analytical'

export type GisContentItemStatus = 'published' | 'draft' | 'archived'

export type GisContentMapLayerStyle = {
  fillColor?: string
  strokeColor?: string
  strokeWidth?: number
  pointRadius?: number
}

export type GisContentMapLayerConfig = {
  visible: boolean
  opacity: number
  order: number
  minZoom?: number
  maxZoom?: number
  groupId?: string
  style?: GisContentMapLayerStyle
}

export type GisContentMapLayerGroup = {
  id: string
  name: string
  collapsed?: boolean
}

export type GisContentMapRegistry = {
  /** Portal row ids currently registered for map display (stack order). */
  activeItemIds: string[]
  configs: Record<string, GisContentMapLayerConfig>
  groups: GisContentMapLayerGroup[]
}

export type GisContentItemVersion = {
  id: string
  label: string
  at: string
  note?: string
}

export type GisContentRepositoryChangeDetail = {
  scope: 'item' | 'map-registry' | 'folder' | 'bulk' | 'refresh'
  action: 'add' | 'update' | 'delete' | 'reorder' | 'restore'
  itemIds?: string[]
}

export const GIS_CONTENT_REPOSITORY_EVENT = 'gis-content-portal-changed'

export const GIS_CONTENT_DATA_FORMAT_LABELS: Record<GisContentDataFormat, string> = {
  vector: 'Vector',
  raster: 'Raster',
  geojson: 'GeoJSON',
  shapefile: 'Shapefile',
  geotiff: 'GeoTIFF',
  cog: 'Cloud Optimized GeoTIFF (COG)',
  wms: 'WMS',
  wmts: 'WMTS',
  xyz: 'XYZ tiles',
  '3d-tiles': '3D Tiles',
  sentinel: 'Sentinel',
  analytical: 'Analytical asset',
}

export const DEFAULT_GIS_CONTENT_MAP_LAYER_STYLE: GisContentMapLayerStyle = {
  fillColor: 'rgba(52, 211, 153, 0.45)',
  strokeColor: '#1b5e3c',
  strokeWidth: 1.5,
  pointRadius: 5,
}

export function emptyGisContentMapRegistry(): GisContentMapRegistry {
  return { activeItemIds: [], configs: {}, groups: [] }
}

export function defaultGisContentMapLayerConfig(order = 0): GisContentMapLayerConfig {
  return {
    visible: true,
    opacity: 1,
    order,
    style: { ...DEFAULT_GIS_CONTENT_MAP_LAYER_STYLE },
  }
}

export function resolveGisContentMapLayerConfig(
  itemId: string,
  registry: GisContentMapRegistry,
  fallbackOrder = 0,
): GisContentMapLayerConfig {
  const stored = registry.configs[itemId]
  if (!stored) return defaultGisContentMapLayerConfig(fallbackOrder)
  return {
    ...defaultGisContentMapLayerConfig(fallbackOrder),
    ...stored,
    style: {
      ...DEFAULT_GIS_CONTENT_MAP_LAYER_STYLE,
      ...(stored.style ?? {}),
    },
  }
}

export function mergeGisContentMapLayerConfig(
  base: GisContentMapLayerConfig,
  patch: Partial<GisContentMapLayerConfig>,
): GisContentMapLayerConfig {
  return {
    ...base,
    ...patch,
    style: patch.style ? { ...base.style, ...patch.style } : base.style,
  }
}
