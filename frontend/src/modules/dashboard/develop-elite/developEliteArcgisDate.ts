import type { ArcGisTableRow } from './developEliteArcgisFetch'
import { readArcGisField, readArcGisNumber } from './developEliteChartAggregate'

export function arcGisDateToEpochMs(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  const s = String(raw).trim()
  if (!s) return null
  if (/^\d{11,}$/.test(s)) {
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }
  const parsed = Date.parse(s)
  return Number.isNaN(parsed) ? null : parsed
}

export function formatDevelopEliteArcGisDate(raw: unknown): string {
  const ms = arcGisDateToEpochMs(raw)
  if (ms == null) return ''
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Layer 1 `Planting_Date`, or harvest minus `Duration_Days` when planting is empty. */
export function resolveDevelopEliteCropPlantingDateRaw(row: ArcGisTableRow): unknown {
  const planting = readArcGisField(row, 'Planting_Date')
  if (planting != null && planting !== '') return planting
  const harvest = readArcGisField(row, 'Harvest_Date')
  const durationDays = readArcGisNumber(row, 'Duration_Days')
  if (harvest == null || harvest === '' || durationDays == null || durationDays <= 0) return null
  const harvestMs = arcGisDateToEpochMs(harvest)
  if (harvestMs == null) return null
  return harvestMs - durationDays * 86_400_000
}

export function formatDevelopEliteCropPlantingDate(row: ArcGisTableRow): string {
  return formatDevelopEliteArcGisDate(resolveDevelopEliteCropPlantingDateRaw(row))
}

export function formatDevelopEliteCropHarvestDate(row: ArcGisTableRow): string {
  return formatDevelopEliteArcGisDate(readArcGisField(row, 'Harvest_Date'))
}
