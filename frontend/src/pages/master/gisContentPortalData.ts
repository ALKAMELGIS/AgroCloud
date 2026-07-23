export type GisPortalTopTab =
  | 'my-content'
  | 'favorites'
  | 'groups'
  | 'organization'
  | 'living-atlas'

export type GisContentItemType =
  | 'dashboard'
  | 'web-map'
  | 'feature-layer'
  | 'instant-app'
  | 'scene'
  | 'three-d-layer'
  | 'app'
  | 'storymap'
  | 'file'
  | 'tool'
  | 'notebook'
  | 'style'

/** ArcGIS-style format for saved apps (Dashboard, Web Map, StoryMap). */
export type GisContentAppFormat = 'dashboard' | 'web-map' | 'storymap'

export type GisContentTypeDisplayDetails = {
  agroCloudDashboard?: unknown
  appFormat?: GisContentAppFormat
}

export type GisContentSharing = 'private' | 'shared' | 'organization' | 'public'

export type GisContentRow = {
  id: string
  title: string
  type: GisContentItemType
  typeLabel: string
  modified: string
  /** Creation date (falls back to modified when sorting if omitted). */
  created?: string
  sharing: GisContentSharing
  folderId: string
  /** Item owner (bulk change owner). */
  owner?: string
  /** When true, item cannot be moved to Recycle bin until protection is disabled. */
  deleteProtected?: boolean
}

export type GisContentFolderColor = 'default' | 'blue' | 'green' | 'yellow'

export type GisContentFolder = {
  id: string
  name: string
  parentId: string | null
  children?: GisContentFolder[]
  /** Folder color (custom folders). */
  color?: GisContentFolderColor
}

export const GIS_FOLDER_COLOR_OPTIONS: {
  id: GisContentFolderColor
  label: string
  swatch: string
}[] = [
  { id: 'default', label: 'Default', swatch: '#4a5568' },
  { id: 'blue', label: 'Blue', swatch: '#2563eb' },
  { id: 'green', label: 'Green', swatch: '#1b5e3c' },
  { id: 'yellow', label: 'Yellow', swatch: '#eab308' },
]

export function gisContentFolderColorHex(color: GisContentFolderColor | undefined): string {
  return GIS_FOLDER_COLOR_OPTIONS.find(o => o.id === color)?.swatch ?? GIS_FOLDER_COLOR_OPTIONS[0].swatch
}

export function isGisContentPortalCustomFolderId(folderId: string): boolean {
  return folderId.startsWith('custom-')
}

/** Folders that show Edit/Delete in Folder options (excludes All my content and Recycle bin). */
export function isGisContentPortalManageableFolderId(folderId: string): boolean {
  return folderId !== 'all' && folderId !== 'recycle'
}

export const GIS_PORTAL_TOP_TABS: { id: GisPortalTopTab; label: string }[] = [
  { id: 'my-content', label: 'My content' },
  { id: 'favorites', label: 'My favorites' },
  { id: 'groups', label: 'My groups' },
  { id: 'organization', label: 'My organization' },
  { id: 'living-atlas', label: 'Living Atlas' },
]

export const GIS_ITEM_TYPE_FILTERS: { id: string; label: string }[] = [
  { id: 'maps', label: 'Maps' },
  { id: 'layers', label: 'Layers' },
  { id: 'scenes', label: 'Scenes' },
  { id: 'apps', label: 'Apps' },
  { id: 'developer-credentials', label: 'Developer credentials' },
  { id: 'tools', label: 'Tools' },
  { id: 'files', label: 'Files' },
  { id: 'styles', label: 'Styles' },
  { id: 'notebooks', label: 'Notebooks' },
  { id: 'insights', label: 'Insights' },
  { id: 'data-stores', label: 'Data stores' },
  { id: 'service-connections', label: 'Service connections' },
]

export const GIS_COLLAPSED_FILTER_SECTIONS: { id: string; label: string }[] = [
  { id: 'date-modified', label: 'Date modified' },
  { id: 'date-created', label: 'Date created' },
  { id: 'location', label: 'Location' },
  { id: 'tags', label: 'Tags' },
  { id: 'sharing', label: 'Sharing' },
  { id: 'status', label: 'Status' },
  { id: 'delete-protection', label: 'Delete protection' },
]

export const GIS_CONTENT_FOLDERS: GisContentFolder[] = [
  { id: 'all', name: 'All my content', parentId: null },
  { id: 'recycle', name: 'Recycle bin', parentId: null },
]

/** Legacy built-in folder ids removed from production portal (purged on load). */
export const GIS_CONTENT_LEGACY_SEED_FOLDER_IDS = [
  '3d-buildings',
  'agri-teach',
  'analysis',
  'field-ops',
  'hosted-feature-layers',
] as const

export const GIS_CONTENT_DEFAULT_OWNER = 'Elite Agro Projects LLC'

export const GIS_CONTENT_SHARING_OPTIONS: { id: GisContentSharing; label: string; icon: string }[] = [
  { id: 'private', label: 'Private', icon: 'fa-solid fa-lock' },
  { id: 'shared', label: 'Shared with groups', icon: 'fa-solid fa-user-group' },
  { id: 'organization', label: 'Organization', icon: 'fa-solid fa-building' },
  { id: 'public', label: 'Public', icon: 'fa-solid fa-globe' },
]

export const GIS_CONTENT_TEST_FIXTURE_ROWS: GisContentRow[] = [
  { id: '1', title: 'Elite AgroCloud — Organization overview', type: 'dashboard', typeLabel: 'Dashboard', modified: 'Jun 3, 2026', created: 'Mar 1, 2026', sharing: 'organization', folderId: 'all' },
  { id: '2', title: 'Irrigation zones — West block', type: 'web-map', typeLabel: 'Web Map', modified: 'Jun 2, 2026', created: 'Mar 10, 2026', sharing: 'shared', folderId: 'field-ops' },
  { id: '3', title: 'Soil moisture — hosted', type: 'feature-layer', typeLabel: 'Feature layer (hosted)', modified: 'May 30, 2026', created: 'Mar 20, 2026', sharing: 'private', folderId: 'analysis' },
  { id: '4', title: 'Crop health — Instant App', type: 'instant-app', typeLabel: 'Instant App', modified: 'May 28, 2026', created: 'Apr 1, 2026', sharing: 'public', folderId: 'all' },
  { id: '5', title: 'Canopy height — 3D scene', type: 'scene', typeLabel: 'Scene', modified: 'May 25, 2026', created: 'Apr 10, 2026', sharing: 'organization', folderId: '3d-buildings' },
  { id: '6', title: 'Fertigation summary', type: 'dashboard', typeLabel: 'Dashboard', modified: 'May 24, 2026', created: 'Apr 15, 2026', sharing: 'private', folderId: 'analysis' },
  { id: '7', title: 'Parcel boundaries', type: 'feature-layer', typeLabel: 'Feature layer (hosted)', modified: 'May 22, 2026', created: 'Apr 20, 2026', sharing: 'shared', folderId: 'field-ops' },
  { id: '8', title: 'Weather stations map', type: 'web-map', typeLabel: 'Web Map', modified: 'May 21, 2026', created: 'Apr 25, 2026', sharing: 'organization', folderId: 'all' },
  { id: '9', title: 'Training — Agri teach', type: 'web-map', typeLabel: 'Web Map', modified: 'May 19, 2026', created: 'May 1, 2026', sharing: 'private', folderId: 'agri-teach' },
  { id: '10', title: 'NDVI workflow app', type: 'app', typeLabel: 'Web mapping application', modified: 'May 18, 2026', created: 'Jun 1, 2026', sharing: 'shared', folderId: 'all' },
  { id: '11', title: 'Export — field samples.csv', type: 'file', typeLabel: 'CSV', modified: 'May 17, 2026', created: 'Feb 14, 2026', sharing: 'private', folderId: 'analysis' },
  { id: '12', title: 'Geoprocessing — buffer tool', type: 'tool', typeLabel: 'Geoprocessing tool', modified: 'May 16, 2026', created: 'Feb 28, 2026', sharing: 'organization', folderId: 'all' },
  { id: '13', title: 'Brand palette — Elite AgroCloud', type: 'style', typeLabel: 'Style', modified: 'May 15, 2026', created: 'Mar 5, 2026', sharing: 'organization', folderId: 'all' },
  { id: '14', title: 'Yield forecast notebook', type: 'notebook', typeLabel: 'Notebook', modified: 'May 14, 2026', created: 'Jan 20, 2026', sharing: 'private', folderId: 'analysis' },
  { id: '15', title: 'Pivot monitoring dashboard', type: 'dashboard', typeLabel: 'Dashboard', modified: 'May 12, 2026', created: 'May 5, 2026', sharing: 'shared', folderId: 'field-ops' },
  { id: '16', title: 'Satellite basemap — spring', type: 'web-map', typeLabel: 'Web Map', modified: 'May 10, 2026', created: 'Apr 8, 2026', sharing: 'public', folderId: 'all' },
  { id: '17', title: 'Greenhouse sensors layer', type: 'feature-layer', typeLabel: 'Feature layer (hosted)', modified: 'May 8, 2026', created: 'May 28, 2026', sharing: 'organization', folderId: 'field-ops' },
  { id: '18', title: 'Visitor tour — Instant App', type: 'instant-app', typeLabel: 'Instant App', modified: 'May 6, 2026', created: 'Apr 18, 2026', sharing: 'public', folderId: 'agri-teach' },
  { id: '19', title: 'Archive — 2024 harvest', type: 'file', typeLabel: 'File geodatabase', modified: 'May 4, 2026', created: 'Nov 12, 2025', sharing: 'private', folderId: 'recycle' },
  { id: '20', title: 'Organization overview', type: 'dashboard', typeLabel: 'Dashboard', modified: 'May 2, 2026', created: 'Dec 1, 2025', sharing: 'organization', folderId: 'all' },
]

/** Legacy demo item ids removed from production portal (purged on load). */
export const GIS_CONTENT_LEGACY_SEED_ROW_IDS: readonly string[] = GIS_CONTENT_TEST_FIXTURE_ROWS.map(row => row.id)

/** Default portal rows — empty; user-created items only. */
export const GIS_CONTENT_ROWS: GisContentRow[] = []

export const GIS_NEW_ITEM_SOURCES = [
  { id: 'device', label: 'Your device', icon: 'fa-solid fa-laptop' },
  { id: 'gdrive', label: 'Google Drive', icon: 'fa-brands fa-google-drive' },
  { id: 'dropbox', label: 'Dropbox', icon: 'fa-brands fa-dropbox' },
  { id: 'onedrive', label: 'OneDrive', icon: 'fa-solid fa-cloud' },
] as const

export const GIS_NEW_ITEM_TYPES: { id: string; title: string; description: string; icon: string }[] = [
  { id: 'feature-layer', title: 'Feature layer', description: 'Create an editable layer with fields copied from a template or feature layer.', icon: 'fa-solid fa-map-location-dot' },
  { id: 'url', title: 'URL', description: 'Link to an ArcGIS Server web service, CSV, OGC web service, KML, GeoJSON or a document.', icon: 'fa-solid fa-globe' },
  { id: 'developer-credentials', title: 'Developer credentials', description: 'Create API key and OAuth 2.0 credentials to build custom applications.', icon: 'fa-solid fa-key' },
  { id: 'application', title: 'Application', description: 'Link to an application on the web or create a new application.', icon: 'fa-solid fa-table-cells' },
  { id: '3d-layer', title: '3D layer', description: 'Create a fast drawing layer optimized for 3D.', icon: 'fa-solid fa-cube' },
  { id: 'locator', title: 'Locator', description: 'Find places and addresses using the ArcGIS Geocoding service or your own geocode service.', icon: 'fa-solid fa-location-dot' },
  { id: 'data-store', title: 'Data store', description: 'Add a connection to a data store you own.', icon: 'fa-solid fa-database' },
  { id: 'raster-template', title: 'Raster function template', description: 'Create a raster function template for imagery layers and raster analysis.', icon: 'fa-solid fa-file-code' },
  { id: 'data-pipeline', title: 'Data pipeline', description: 'Integrate external data, prepare it, and write to a feature layer.', icon: 'fa-solid fa-diagram-project' },
]

export type GisCreateAppOption = {
  id: string
  title: string
  description: string
  icon: string
  iconTone?: 'teal' | 'orange'
  href?: string
  external?: boolean
}

export const GIS_CREATE_APP_OPTIONS: GisCreateAppOption[] = [
  {
    id: 'storymaps',
    title: 'Elite AgroCloud StoryMaps',
    description: 'Tell a story by combining maps with narrative text and media.',
    icon: 'fa-solid fa-book-open',
    iconTone: 'teal',
    href: 'https://storymaps.arcgis.com/',
    external: true,
  },
  {
    id: 'dashboards',
    title: 'Dashboards',
    description: 'Create a dashboard with data visualizations that provide key insights.',
    icon: 'fa-solid fa-chart-column',
    iconTone: 'orange',
    href: '/dashboard/develop',
  },
]

export function gisContentTypeIcon(type: GisContentItemType): string {
  switch (type) {
    case 'dashboard':
      return 'fa-solid fa-chart-pie'
    case 'web-map':
      return 'fa-solid fa-map'
    case 'feature-layer':
      return 'fa-solid fa-layer-group'
    case 'instant-app':
      return 'fa-solid fa-bolt'
    case 'scene':
      return 'fa-solid fa-cube'
    case 'three-d-layer':
      return 'fa-solid fa-cube'
    case 'app':
      return 'fa-solid fa-table-cells'
    case 'storymap':
      return 'fa-solid fa-book-open'
    case 'file':
      return 'fa-solid fa-file'
    case 'tool':
      return 'fa-solid fa-wrench'
    case 'notebook':
      return 'fa-solid fa-book'
    case 'style':
      return 'fa-solid fa-palette'
    default:
      return 'fa-solid fa-folder'
  }
}

export function gisContentTypeTone(type: GisContentItemType): string {
  switch (type) {
    case 'dashboard':
      return 'tone-dashboard'
    case 'web-map':
      return 'tone-map'
    case 'feature-layer':
      return 'tone-layer'
    case 'instant-app':
    case 'app':
      return 'tone-app'
    case 'storymap':
      return 'tone-storymap'
    case 'scene':
      return 'tone-scene'
    case 'three-d-layer':
      return 'tone-scene'
    default:
      return 'tone-default'
  }
}

export function gisSharingIcon(sharing: GisContentSharing): string {
  switch (sharing) {
    case 'private':
      return 'fa-solid fa-user'
    case 'shared':
      return 'fa-solid fa-user-group'
    case 'organization':
      return 'fa-solid fa-building'
    case 'public':
      return 'fa-solid fa-earth-americas'
    default:
      return 'fa-solid fa-user'
  }
}

/** Portal item types that can be added to a web map from Browse layers. */
export function isGisPortalRowMapAddable(type: GisContentItemType): boolean {
  return (
    type === 'feature-layer' ||
    type === 'web-map' ||
    type === 'scene' ||
    type === 'three-d-layer' ||
    type === 'file'
  )
}

export function gisContentLayerSubtypeLabel(type: GisContentItemType): string {
  switch (type) {
    case 'feature-layer':
      return 'Polygon layer'
    case 'web-map':
      return 'Web map'
    case 'scene':
    case 'three-d-layer':
      return 'Scene layer'
    case 'dashboard':
      return 'Dashboard'
    case 'storymap':
      return 'StoryMap'
    case 'app':
      return 'App'
    case 'file':
      return 'File layer'
    default:
      return 'Layer'
  }
}

export function defaultGisContentItemDescription(row: GisContentRow): string {
  return `${row.title} represents GIS content published in Elite AgroCloud (${row.typeLabel}).`
}

export function defaultGisContentItemTags(row: GisContentRow): string[] {
  const base = [row.type.replace(/-/g, ' '), row.typeLabel.toLowerCase()]
  if (row.type === 'feature-layer') base.push('polygon', 'hosted', 'Elite AgroCloud')
  return [...new Set(base)].slice(0, 8)
}

/** Demo GeoJSON footprint for portal rows (until live ArcGIS services are wired). */
export function gisPortalRowDemoGeoJson(row: GisContentRow): {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    properties: Record<string, string>
    geometry: { type: 'Polygon'; coordinates: number[][][] }
  }>
} {
  const seed = Number.parseInt(row.id, 10) || 1
  const baseLng = 46.4 + (seed % 6) * 0.22
  const baseLat = 24.6 + Math.floor(seed / 6) * 0.16
  const w = 0.08 + (seed % 3) * 0.02
  const h = 0.06 + (seed % 4) * 0.015
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          name: row.title,
          portalId: row.id,
          portalType: row.typeLabel,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [baseLng, baseLat],
              [baseLng + w, baseLat],
              [baseLng + w, baseLat + h],
              [baseLng, baseLat + h],
              [baseLng, baseLat],
            ],
          ],
        },
      },
    ],
  }
}

export function gisSharingLabel(sharing: GisContentSharing): string {
  switch (sharing) {
    case 'private':
      return 'Private'
    case 'shared':
      return 'Shared'
    case 'organization':
      return 'Organization'
    case 'public':
      return 'Public'
    default:
      return sharing
  }
}

export type GisRowMenuAction = {
  id: string
  label: string
  dividerBefore?: boolean
  external?: boolean
  danger?: boolean
  disabled?: boolean
}

export type GisRowMenuContext = {
  isFavorite?: boolean
  isInRecycle?: boolean
}

function appendFavoriteAndLifecycleActions(
  items: GisRowMenuAction[],
  ctx: GisRowMenuContext,
): GisRowMenuAction[] {
  const out = [...items]
  if (ctx.isInRecycle) {
    out.push({ id: 'restore-item', label: 'Restore', dividerBefore: true })
    out.push({ id: 'delete-permanently', label: 'Delete permanently', danger: true })
    return out
  }
  out.push(
    ctx.isFavorite
      ? { id: 'remove-favorite', label: 'Remove from favorites', dividerBefore: true }
      : { id: 'add-favorite', label: 'Add to favorites', dividerBefore: true },
  )
  out.push(
    { id: 'move-recycle', label: 'Move to recycle bin', dividerBefore: true },
    { id: 'delete-item', label: 'Delete', danger: true },
  )
  return out
}

/** Content row ⋯ menu (View details → Map Viewer → Field Maps → favorites). */
function standardMapViewerRowMenu(ctx: GisRowMenuContext): GisRowMenuAction[] {
  const items: GisRowMenuAction[] = [
    { id: 'view-details', label: 'View details' },
    { id: 'open-map-viewer', label: 'Open in Map Viewer' },
    { id: 'open-field-maps', label: 'Open in Field Maps Designer', external: true },
  ]
  return appendFavoriteAndLifecycleActions(items, ctx)
}

/** Saved AgroCloud Dashboard items in GIS Content (user-created, not seed demo rows). */
export function isAgroCloudDashboardApp(
  row: GisContentRow,
  details?: GisContentTypeDisplayDetails | null,
): boolean {
  if (details?.agroCloudDashboard) return true
  // Legacy rows saved before format-aware portal typing
  if (row.type === 'app' && row.typeLabel === 'App') return true
  // User-saved dashboards get app-* ids from upsertGisContentPortalApp
  if (row.type === 'dashboard' && row.id.startsWith('app-')) return true
  return false
}

export function gisContentAppFormatRowMeta(format: GisContentAppFormat): Pick<GisContentRow, 'type' | 'typeLabel'> {
  switch (format) {
    case 'web-map':
      return { type: 'web-map', typeLabel: 'Web Map' }
    case 'storymap':
      return { type: 'storymap', typeLabel: 'StoryMap' }
    default:
      return { type: 'dashboard', typeLabel: 'Dashboard' }
  }
}

/** ArcGIS-style Type column label (Web Map, Dashboard, StoryMap, …). */
export function gisContentPortalDisplayTypeLabel(
  row: GisContentRow,
  details?: GisContentTypeDisplayDetails | null,
): string {
  const appFormat = details?.appFormat
  if (appFormat === 'dashboard' || details?.agroCloudDashboard) return 'Dashboard'
  if (appFormat === 'web-map') return 'Web Map'
  if (appFormat === 'storymap') return 'StoryMap'

  if (row.type === 'dashboard' || isAgroCloudDashboardApp(row, details)) return 'Dashboard'
  if (row.type === 'web-map' || row.typeLabel === 'Web map') return 'Web Map'
  if (row.type === 'storymap') return 'StoryMap'
  if (row.type === 'feature-layer' && row.typeLabel.toLowerCase().includes('hosted')) {
    return 'Hosted feature layer'
  }

  return row.typeLabel
}

/** Icon/tone type for portal table display (may differ from stored row.type for legacy apps). */
export function gisContentPortalDisplayIconType(
  row: GisContentRow,
  details?: GisContentTypeDisplayDetails | null,
): GisContentItemType {
  const label = gisContentPortalDisplayTypeLabel(row, details)
  if (label === 'Dashboard') return 'dashboard'
  if (label === 'Web Map') return 'web-map'
  if (label === 'StoryMap') return 'storymap'
  return row.type
}

/** @deprecated Use isAgroCloudDashboardApp */
/** @deprecated Use isAgroCloudDashboardApp */
export const isGeoSyntraDashboardApp = isAgroCloudDashboardApp

export function agroCloudDashboardWorkspacePath(dashboardId: string): string {
  return `/dashboard/develop/workspace/${encodeURIComponent(dashboardId)}`
}

/** @deprecated Use agroCloudDashboardWorkspacePath */
export const geosyntraDashboardWorkspacePath = agroCloudDashboardWorkspacePath

export function agroCloudDashboardEditPath(dashboardId: string): string {
  return `/dashboard/develop/edit/${encodeURIComponent(dashboardId)}`
}

/** @deprecated Use agroCloudDashboardEditPath */
export const geosyntraDashboardEditPath = agroCloudDashboardEditPath

function agroCloudDashboardAppRowMenu(ctx: GisRowMenuContext): GisRowMenuAction[] {
  const items: GisRowMenuAction[] = [
    { id: 'view-details', label: 'View details' },
    { id: 'open-dashboard', label: 'Open dashboard' },
    { id: 'edit-dashboard', label: 'Edit dashboard' },
    { id: 'share', label: 'Share' },
    { id: 'view-metadata', label: 'View metadata' },
  ]
  return appendFavoriteAndLifecycleActions(items, ctx)
}

/** Context menu options per item type (AgroCloud Content–style). */
export function getGisContentRowMenuActions(
  row: GisContentRow,
  ctx: GisRowMenuContext = {},
): GisRowMenuAction[] {
  if (isAgroCloudDashboardApp(row)) {
    return agroCloudDashboardAppRowMenu(ctx)
  }

  switch (row.type) {
    case 'app':
      return standardMapViewerRowMenu(ctx)
    case 'web-map':
    case 'instant-app':
    case 'scene':
    case 'three-d-layer':
      return standardMapViewerRowMenu(ctx)
    case 'feature-layer':
      return appendFavoriteAndLifecycleActions(
        [
          { id: 'view-details', label: 'View details' },
          { id: 'open-attribute-table', label: 'Open attribute table' },
          { id: 'open-map-viewer', label: 'Open in Map Viewer' },
          { id: 'export-layer', label: 'Export layer' },
        ],
        ctx,
      )
    case 'dashboard':
      return appendFavoriteAndLifecycleActions(
        [
          { id: 'view-details', label: 'View details' },
          { id: 'open-dashboard', label: 'Open dashboard' },
          { id: 'open-map-viewer', label: 'Open in Map Viewer' },
          { id: 'manage-sharing', label: 'Manage sharing' },
        ],
        ctx,
      )
    case 'file':
      return appendFavoriteAndLifecycleActions(
        [
          { id: 'view-details', label: 'View details' },
          { id: 'download-file', label: 'Download' },
          { id: 'view-metadata', label: 'View metadata' },
        ],
        ctx,
      )
    case 'tool':
      return appendFavoriteAndLifecycleActions(
        [
          { id: 'view-details', label: 'View details' },
          { id: 'run-tool', label: 'Run geoprocessing tool' },
        ],
        ctx,
      )
    case 'notebook':
      return appendFavoriteAndLifecycleActions(
        [
          { id: 'view-details', label: 'View details' },
          { id: 'open-notebook', label: 'Open notebook' },
          { id: 'open-map-viewer', label: 'Open in Map Viewer' },
        ],
        ctx,
      )
    case 'style':
      return appendFavoriteAndLifecycleActions(
        [
          { id: 'view-details', label: 'View details' },
          { id: 'edit-style', label: 'Edit style' },
          { id: 'preview-on-map', label: 'Preview on map' },
          { id: 'open-map-viewer', label: 'Open in Map Viewer' },
        ],
        ctx,
      )
    default:
      return standardMapViewerRowMenu(ctx)
  }
}
