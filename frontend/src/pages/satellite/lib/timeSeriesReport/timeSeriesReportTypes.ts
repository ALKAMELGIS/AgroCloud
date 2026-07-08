import type { ImageryIndexInterpretation } from '../../../../lib/imageryIndexInterpretationEngine'
import type { ImageryTimeSeriesLayerSeries } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { TimeSeriesExecutiveSummary } from './timeSeriesReportExecutive'

export type TimeSeriesTrendLabel = 'Increasing' | 'Decreasing' | 'Stable'

export type TimeSeriesLayerStatistics = {
  layerId: string
  mean: number | null
  min: number | null
  max: number | null
  trend: TimeSeriesTrendLabel
}

export type TimeSeriesReportLocation = {
  fieldName: string
  fieldKey: string
  areaHa: number
  centroidLng: number | null
  centroidLat: number | null
}

export type TimeSeriesReportPeriod = {
  from: string
  to: string
  acquisitionDate: string
}

export type TimeSeriesReportCharts = {
  labels: string[]
  displayLabels: string[]
  series: ImageryTimeSeriesLayerSeries[]
}

export type TimeSeriesReportPayload = {
  projectName: string
  generatedAt: string
  generatedBy: string
  location: TimeSeriesReportLocation
  period: TimeSeriesReportPeriod
  layerIds: string[]
  charts: TimeSeriesReportCharts
  statistics: TimeSeriesLayerStatistics[]
  interpretations: ImageryIndexInterpretation[]
  primaryInterpretation: ImageryIndexInterpretation | null
  executive: TimeSeriesExecutiveSummary
  geometry: GeoJSON.Geometry | null
  mapImageDataUrl: string | null
}

export type TimeSeriesReportConfig = {
  projectName: string
  generatedBy: string
  includeMap: boolean
  includeInterpretation: boolean
}

export type TimeSeriesExportKind = 'pdf' | 'excel' | 'csv' | 'png' | 'geojson'
