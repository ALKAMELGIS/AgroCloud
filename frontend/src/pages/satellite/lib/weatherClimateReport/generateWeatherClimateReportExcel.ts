import type { WeatherClimateReportPayload } from './weatherClimateReportTypes'
import { climateAggregationLabel } from './weatherClimateAnalysisEngine'
import {
  buildEnterpriseWeatherWorkbook,
  enterpriseReportFilename,
  generateEnterpriseWeatherReportCsv,
  generateEnterpriseWeatherReportExcel,
} from './weatherEnterpriseExcelWriter'

/** Weather Intelligence XLSX matching the Weather-Hourly + Analysis workbook layout. */
export async function generateWeatherClimateReportExcel(payload: WeatherClimateReportPayload): Promise<void> {
  await generateEnterpriseWeatherReportExcel(payload)
}

export { buildEnterpriseWeatherWorkbook as buildWeatherClimateReportWorkbook }

export function weatherClimateReportFilename(aoiName: string, aggregation?: string): string {
  return enterpriseReportFilename(aoiName, aggregation)
}

export async function generateWeatherClimateReportCsv(payload: WeatherClimateReportPayload): Promise<void> {
  await generateEnterpriseWeatherReportCsv(payload)
}

export { climateAggregationLabel }
