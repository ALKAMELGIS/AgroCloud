import { DEVELOP_ELITE_TABLE_ROW_FLASH_MS } from './developEliteTableRowFlash'

/** Distinctive yellow flash outline + soft glow (pie, bar, table). */
export const DEVELOP_ELITE_CHART_FLASH_OUTLINE = 'rgba(250, 204, 21, 0.96)'
export const DEVELOP_ELITE_CHART_FLASH_OUTLINE_SOFT = 'rgba(253, 224, 71, 0.55)'
export const DEVELOP_ELITE_CHART_FLASH_GLOW = 'rgba(253, 224, 71, 0.42)'
export const DEVELOP_ELITE_CHART_FLASH_FILL = 'rgba(253, 224, 71, 0.16)'

export function resolveDevelopEliteChartSelectionCropLabel(
  tableRows: ReadonlyArray<Record<string, string>>,
  tableHighlightRowId: string | null | undefined,
): string | null {
  if (!tableHighlightRowId) return null
  const row = tableRows.find(r => r._rowId === tableHighlightRowId)
  const crop = row?.Crop_Type?.trim()
  return crop || null
}

export function resolveDevelopEliteChartFlashCropLabel(
  tableRows: ReadonlyArray<Record<string, string>>,
  tableFlashRowId: string | null | undefined,
): string | null {
  if (!tableFlashRowId) return null
  const row = tableRows.find(r => r._rowId === tableFlashRowId)
  const crop = row?.Crop_Type?.trim()
  return crop || null
}

export const DEVELOP_ELITE_CHART_SLICE_FLASH_MS = DEVELOP_ELITE_TABLE_ROW_FLASH_MS
