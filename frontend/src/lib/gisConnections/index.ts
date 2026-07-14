export type {
  GisConnectionKind,
  GisDbConnectionProfile,
  GisDbTableInfo,
  GisDbTablesResult,
  GisDbTestResult,
  GisDbTestStatus,
  GisWebServiceKind,
  GisWebServiceProfile,
  GisCloudProvider,
  GisCloudConnection,
} from './types'

export {
  GIS_DB_CONNECTIONS_LS_KEY,
  listDbConnections,
  saveDbConnection,
  deleteDbConnection,
  updateDbConnectionTest,
  testDbConnection,
  fetchDbTables,
} from './dbConnectionStore'

export {
  GIS_WEB_SERVICES_LS_KEY,
  listWebServices,
  saveWebService,
  deleteWebService,
  suggestServiceKindFromUrl,
} from './webServiceStore'

export type { RecentSource } from './recentFavoritesStore'
export {
  GIS_RECENT_LS_KEY,
  GIS_FAVORITES_LS_KEY,
  listRecent,
  pushRecent,
  listFavorites,
  toggleFavorite,
  isFavorite,
} from './recentFavoritesStore'

export type { WfsLayerInfo, WfsCapabilities, WfsGetFeatureOpts } from './ogcWfsClient'
export {
  parseWfsGetCapabilities,
  buildWfsGetFeatureUrl,
  fetchWfsGeoJson,
} from './ogcWfsClient'
