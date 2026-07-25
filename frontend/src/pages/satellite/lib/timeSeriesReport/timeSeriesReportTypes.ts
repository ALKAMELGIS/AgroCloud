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
  /** Period key → representative scene date (YYYY-MM-DD) for weather↔index alignment. */
  periodAnchorDates?: Record<string, string>
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

/** Per-class LULC composition for one year (Word charts + tables). */
export type LulcYearClassStat = {
  key: string
  name: string
  color: string
  pct: number
  areaHa: number
}

export type LulcYearComposition = {
  year: number
  sceneDate: string
  totalAreaHa: number
  classes: LulcYearClassStat[]
}

/** Consecutive-year LULC change (Δha / Δ percentage points). */
export type LulcChangeClassStat = {
  key: string
  name: string
  color: string
  areaHaFrom: number
  areaHaTo: number
  pctFrom: number
  pctTo: number
  deltaHa: number
  deltaPctPoints: number
}

export type LulcChangePairComposition = {
  yearFrom: number
  yearTo: number
  classes: LulcChangeClassStat[]
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
  interpretation: string
  valueHeaders: string[]
  valueRows: string[][]
  /** Paired XY points for native Word scatter charts. */
  points?: Array<{ date: string; x: number; y: number }>
  /** Linear fit endpoints for native Word scatter. */
  fitLine?: Array<{ x: number; y: number }>
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
  /** LULC five-year atlas + consecutive-year change detection pairs. */
  lulcMapSnapshotGroups: TimeSeriesMapSnapshotGroup[]
  /** Yearly LULC class areas (%) and ha for charts/tables under maps. */
  lulcYearCompositions: LulcYearComposition[]
  /** Consecutive-year LULC change stats for change-detection sections. */
  lulcChangeCompositions: LulcChangePairComposition[]
  /** Per-index start→end change detection map pairs. */
  changeDetectionMapSnapshotGroups: TimeSeriesMapSnapshotGroup[]
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
