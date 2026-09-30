/** Supported database / warehouse connection kinds for the GIS Data Manager. */
export type GisConnectionKind =
  | 'postgres'
  | 'sqlserver'
  | 'oracle'
  | 'mysql'
  | 'mariadb'
  | 'sqlite'
  | 'duckdb'
  | 'mongodb'
  | 'bigquery'
  | 'snowflake'
  | 'saphana'

export type GisDbTestStatus = 'ok' | 'fail' | 'untested'

/** Saved database connection profile (credentials may be stored locally). */
export type GisDbConnectionProfile = {
  id: string
  name: string
  kind: GisConnectionKind
  host: string
  port: number
  database: string
  username: string
  password?: string
  ssl: boolean
  savedAt: string
  lastTestStatus?: GisDbTestStatus
  lastTestMessage?: string
}

/** Web / OGC service kinds connectable from the Data Manager. */
export type GisWebServiceKind =
  | 'arcgis'
  | 'wms'
  | 'wmts'
  | 'wfs'
  | 'ogc-features'
  | 'xyz'
  | 'stac'
  | 'pmtiles'

/** Saved web / OGC service connection. */
export type GisWebServiceProfile = {
  id: string
  name: string
  kind: GisWebServiceKind
  url: string
  token?: string
  savedAt: string
}

export type GisCloudProvider =
  | 'onedrive'
  | 'gdrive'
  | 'dropbox'
  | 's3'
  | 'azure'
  | 'gcs'
  | 'r2'

/** Saved cloud / object-storage connection metadata. */
export type GisCloudConnection = {
  id: string
  name: string
  provider: GisCloudProvider
  endpoint?: string
  bucket?: string
  savedAt: string
}

/** Result of a DB connection test (local validation and/or R4 gateway). */
export type GisDbTestResult = {
  ok: boolean
  message: string
}

/** Table listing from the R4 GIS DB gateway. */
export type GisDbTableInfo = {
  name: string
  schema?: string
}

export type GisDbTablesResult = {
  tables: GisDbTableInfo[]
  message?: string
}
