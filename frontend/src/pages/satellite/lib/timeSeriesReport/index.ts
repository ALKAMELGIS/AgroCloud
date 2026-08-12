export type { TimeSeriesExportKind, TimeSeriesReportConfig, TimeSeriesReportPayload } from './timeSeriesReportTypes'
export { buildTimeSeriesReportPayload } from './buildTimeSeriesReportPayload'
export { buildTimeSeriesExecutiveSummary } from './timeSeriesReportExecutive'
export { generateTimeSeriesReportPdf } from './generateTimeSeriesReportPdf'
export {
  sanitizeFieldSummaryPdfFilename,
  drawFieldSummaryPage,
  drawFieldSummaryCoverPage,
  generateFieldSummaryPdf,
  generateCombinedFieldSummariesPdf,
  saveFieldSummaryPdf,
  saveCombinedFieldSummariesPdf,
} from './generateFieldSummaryPdf'
export {
  generateFieldSummaryExcel,
  buildFieldSummaryWorkbook,
  sanitizeFieldSummaryExcelFilename,
  writeFieldSummaryAnalysisSheet,
  classifyVhsHealthBand,
  FIELD_SUMMARY_YIELD_FORMULAS,
} from './generateFieldSummaryExcel'
export { generateTimeSeriesReportDocx, generateTimeSeriesLulcReportDocx } from './generateTimeSeriesReportDocx'
export {
  generateTimeSeriesReportExcel,
  buildTimeSeriesReportExcelBlob,
  sanitizeTimeSeriesReportExcelFilename,
  exportTimeSeriesCsvReport,
  exportTimeSeriesChartTimelineExcel,
  buildTimeSeriesReportWorkbook,
  buildTimeSeriesReportWorkbookSync,
} from './generateTimeSeriesReportExcel'
export type { GenerateTimeSeriesReportExcelOptions } from './generateTimeSeriesReportExcel'
export {
  isBatchDirectoryPickerSupported,
  pickBatchExportDirectory,
  writeBlobToDirectory,
  BATCH_EXPORT_CANCELLED,
  BATCH_EXPORT_FOLDER_REQUIRED,
} from './batchExportDirectory'
export {
  batchExportAnalyticsReportsExcel,
  resolveBatchPlotDisplayName,
} from './batchExportAnalyticsReportsExcel'
export type {
  BatchAnalyticsExportProgress,
  BatchAnalyticsExportResult,
  BatchExportAnalyticsReportsExcelInput,
} from './batchExportAnalyticsReportsExcel'
export { batchExportFieldSummaries, mergeFieldSummaryLayerIds } from './batchExportFieldSummaries'
export type {
  BatchFieldSummaryProgress,
  BatchFieldSummaryResult,
  BatchExportFieldSummariesInput,
  FieldSummaryExportMode,
} from './batchExportFieldSummaries'
export {
  buildFieldSummaryModel,
  aggregateFieldSummaryPortfolio,
  computeVegetationHealthScore,
  resolveFieldHarvestWindow,
  mapWaterStressToIrrigationStatus,
} from './buildFieldSummaryModel'
export type {
  FieldSummaryModel,
  FieldSummaryPortfolioStats,
  FieldHarvestWindowLabel,
  FieldIrrigationStatusLabel,
  BuildFieldSummaryModelInput,
} from './buildFieldSummaryModel'
export {
  buildProductionEstimationRows,
  buildProductionEstimationRow,
  classifyNdviStressLevel,
  estimateNdviVegetatedAreas,
  estimateHarvestProductionTons,
  NDVI_VEGETATION_THRESHOLD,
  PRODUCTION_ESTIMATION_HEADERS,
} from './productionEstimationSheet'
export type {
  ProductionEstimationRow,
  NdviStressLevel,
} from './productionEstimationSheet'
export {
  buildTimeSeriesWeatherWorkbook,
  generateTimeSeriesWeatherReportExcel,
} from './generateTimeSeriesWeatherReportExcel'
export { renderExcelTrendCharts } from './timeSeriesExcelChartRenderer'
export { generateFullTimeSeriesReport, runTimeSeriesExport } from './exportManager'
export type { TimeSeriesExportContext } from './exportManager'
export {
  mapLayerAttributesToAgriFields,
  mappedFieldsToRecord,
  classifyNdviChange,
  classifyInspectionPriority,
} from './agriculturalObjectIntelligenceMapper'
export {
  AGRI_OBJECT_FIELD_DEFS,
  AGRI_OBJECT_EXAMPLE_EXPORT_COLUMNS,
  NOT_AVAILABLE,
  REQUIRES_ET_DATASET,
  REQUIRES_CROP_MODEL,
} from './agriculturalObjectIntelligenceSchema'
export { buildAgriculturalObjectIntelligenceModel } from './buildAgriculturalObjectIntelligenceModel'
export type {
  AgriculturalObjectIntelligenceModel,
  AgriObjectSourceFeature,
} from './buildAgriculturalObjectIntelligenceModel'
export {
  generateAgriculturalObjectIntelligenceExcel,
  buildAgriculturalObjectIntelligenceWorkbook,
  sanitizeAgriculturalObjectIntelFilename,
} from './generateAgriculturalObjectIntelligenceExcel'
export { exportChartPng } from './timeSeriesReportExports'
export {
  buildPlotTimeSeriesAnalyticsModel,
  buildPlotAnalyticsRow,
  sortPlotAnalyticsRows,
} from './buildPlotTimeSeriesAnalyticsModel'
export { buildPlotTimeSeriesAnalyticsFromPlots } from './fetchPlotTimeSeriesAnalytics'
export {
  generatePlotTimeSeriesAnalyticsExcel,
  buildPlotTimeSeriesAnalyticsWorkbook,
} from './generatePlotTimeSeriesAnalyticsExcel'
export {
  generateAoiPlotRawTimeSeriesExcel,
  buildAoiPlotRawTimeSeriesWorkbook,
  excelSheetNameFromPlotId,
} from './generateAoiPlotRawTimeSeriesExcel'
export {
  generateAoiRawDataByLayerExcel,
  buildAoiRawDataByLayerWorkbook,
  classifyAoiVegetationStatus,
  cleanAoiPlotDisplayId,
} from './generateAoiRawDataByLayerExcel'
