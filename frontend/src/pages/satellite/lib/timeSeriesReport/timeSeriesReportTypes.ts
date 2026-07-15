import type { ImageryIndexInterpretation } from '../../../../lib/imageryIndexInterpretationEngine'
import type { ImageryTimeSeriesLayerSeries } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { EstimatedWaterLossPoint } from './estimatedWaterLossTimeline'
import type { TimeSeriesExecutiveSummary } from './timeSeriesReportExecutive'
import type { VegetationCoveragePoint } from './vegetationCoverageTimeline'
import type { TimeSeriesWeatherBlock } from './timeSeriesWeatherTimeline'

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

export type TimeSeriesMapSnapshot = {
  layerId: string
  layerLabel: string
  sceneDate: string
  periodLabel: string
  /** PNG base64 without data-URL prefix — ready for ExcelJS addImage. */
  imageBase64: string | null
  dataSource: string
  mean: number | null
  min: number | null
  max: number | null
  areaHa: number
  legendText: string
  notes: string
}

export type TimeSeriesMapSnapshotGroup = {
  layerId: string
  title: string
  snapshots: TimeSeriesMapSnapshot[]
}

export type TimeSeriesCorrelationReportBlock = {
  xLayerId: string
  yLayerId: string
  r: number
  r2: number
  n: number
  slope: number
  intercept: number
  relationshipLabel: string
  gisInsight: string
  agroInsight: string
  chartBase64: string | null
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
  mapSnapshotGroups: TimeSeriesMapSnapshotGroup[]
  /** Peak-of-period composite maps appended after the full period atlas. */
  cumulativeMapSnapshotGroups: TimeSeriesMapSnapshotGroup[]
  vegetationCoverageTimeline: VegetationCoveragePoint[]
  estimatedWaterLossTimeline: EstimatedWaterLossPoint[]
  weatherTimeline: TimeSeriesWeatherBlock | null
  correlationBlocks: TimeSeriesCorrelationReportBlock[]
  cropRecommendations: string[]
}

export type TimeSeriesReportConfig = {
  projectName: string
  generatedBy: string
  includeMap: boolean
  includeInterpretation: boolean
}

export type TimeSeriesExportKind =
  | 'pdf'
  | 'docx'
  | 'excel'
  | 'weather-excel'
  | 'csv'
  | 'png'
  | 'geojson'
