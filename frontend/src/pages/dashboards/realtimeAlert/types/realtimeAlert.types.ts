export type RealtimeAlertKpiMetric =
  | 'field_count'
  | 'alert_count'
  | 'critical_count'
  | 'weather_risk'
  | 'coverage_pct'

export type RealtimeAlertKpiElement = {
  id: string
  label: string
  metric: RealtimeAlertKpiMetric
  visible: boolean
}

export type RealtimeAlertDashboardConfig = {
  schemaVersion: number
  title: string
  theme: { primary: string; radius: number }
  kpiElements: RealtimeAlertKpiElement[]
  map: { defaultLayer: string; showZones: boolean; showAlertOrbs: boolean }
  charts: { pestEtl: boolean; diseaseEtl: boolean; zonePie: boolean }
  alerts: {
    indices: Record<string, boolean>
    chasFormulaDoc: string
  }
}

export type RealtimeAlertContext = {
  farms: Array<{ id: string; label: string; country?: string }>
  crops: Array<{ id: string; label: string }>
  locations: Array<{ id: string; label: string }>
  defaults: {
    farmId?: string
    cropId?: string
    locationId?: string
    sowingDate?: string
    analysisDate?: string
  }
}

export type RealtimeAlertKpiPayload = {
  fieldCount: number | null
  alertCount: number | null
  criticalCount: number | null
  weatherRisk: string | null
  coveragePct: number | null
  updatedAt?: string
}

export type RealtimeAlertIssue = {
  id: string
  zone: string
  severity: string
  title: string
  fieldName: string
}

export type RealtimeAlertTraceRow = {
  id: string
  batchId: string
  fieldName: string
  zone: string
  action: string
  status: string
  recordedAt: string
  operator: string
}

export type RealtimeAlertTimeseries = {
  metric: string
  etl: number
  eil: number
  series: Array<{ date: string; value: number }>
}

export type RealtimeAlertLayerRailId =
  | 'Satellite'
  | 'NDVI'
  | 'NDMI'
  | 'RGB'
  | 'Thermal'
  | 'Alerts'
  | 'CHAS'
  | 'CHAS_ALERT'

export type RealtimeAlertMapLayerState = {
  activeLayer: RealtimeAlertLayerRailId
  wmsCacheKey: number
  syncing: boolean
  lastSyncAt: string | null
}

export type RealtimeAlertFarmSelection = {
  farmId: string
  cropId: string
  locationId: string
  sowingDate: string
  analysisDate: string
}
