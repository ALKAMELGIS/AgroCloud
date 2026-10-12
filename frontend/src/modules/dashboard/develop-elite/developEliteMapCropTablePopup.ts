import type { ArcGisTableRow, DevelopEliteLayerMeta } from './developEliteArcgisFetch'
import {
  readArcGisField,
  resolveCropLabel,
  resolveCodedFieldLabel,
  resolveDevelopEliteFieldDomainLabels,
} from './developEliteChartAggregate'
import {
  formatDevelopEliteCropHarvestDate,
  formatDevelopEliteCropPlantingDate,
} from './developEliteArcgisDate'
import { normalizeDevelopEliteJoinKey } from './developEliteLayerJoin'

export type DevelopEliteFormattedTableRow = Record<string, string> & {
  _rowId: string
  _fieldKey?: string
}

export type DevelopEliteCropTablePopupLink = {
  joinField: string
  tableColumns: string[]
  cropRows: ArcGisTableRow[]
  formattedTableRows: DevelopEliteFormattedTableRow[]
  cropMeta: DevelopEliteLayerMeta
}

function readFeatureProp(props: Record<string, unknown>, key: string): string {
  const raw = readArcGisField(props as ArcGisTableRow, key)
  return raw != null && raw !== '' ? String(raw).trim() : ''
}

export function findDevelopEliteCropRowByFarmCode(
  link: DevelopEliteCropTablePopupLink,
  farmCode: string,
): ArcGisTableRow | null {
  const code = farmCode.trim() ? normalizeDevelopEliteJoinKey(farmCode) : ''
  if (!code) return null
  const joinField = link.joinField.trim() || 'Farm_Code'
  for (const row of link.cropRows) {
    const raw = readArcGisField(row, joinField)
    if (raw == null || raw === '') continue
    if (normalizeDevelopEliteJoinKey(String(raw)) === code) return row
  }
  return null
}

export function formatDevelopEliteCropTablePopupValue(
  row: ArcGisTableRow,
  col: string,
  meta: DevelopEliteLayerMeta,
  displayIndex?: number,
): string {
  if (col === 'OBJECTID') return displayIndex != null ? String(displayIndex + 1) : String(readArcGisField(row, 'OBJECTID') ?? '')
  if (col === 'Crop_Type') return resolveCropLabel(row, meta, col)
  if (resolveDevelopEliteFieldDomainLabels(meta, col)) {
    return resolveCodedFieldLabel(row, meta, col)
  }
  if (col === 'Planting_Date') return formatDevelopEliteCropPlantingDate(row)
  if (col === 'Harvest_Date') return formatDevelopEliteCropHarvestDate(row)
  const v = readArcGisField(row, col)
  return v != null && v !== '' ? String(v) : ''
}

/** Merge crop table attributes into map identify props (Farm_Code join). Table wins on conflicts. */
export function mergeDevelopEliteCropTableIntoPopupProps(
  featureProps: Record<string, unknown>,
  link: DevelopEliteCropTablePopupLink | null | undefined,
): { props: Record<string, unknown>; cropLinked: boolean } {
  if (!link?.cropRows?.length) return { props: featureProps, cropLinked: false }
  const joinField = link.joinField.trim() || 'Farm_Code'
  const farmCode =
    readFeatureProp(featureProps, joinField) ||
    readFeatureProp(featureProps, 'Farm_Code') ||
    readFeatureProp(featureProps, 'FARM_CODE')
  const cropRow = findDevelopEliteCropRowByFarmCode(link, farmCode)
  if (!cropRow) return { props: featureProps, cropLinked: false }

  const merged: Record<string, unknown> = { ...featureProps }
  link.tableColumns.forEach((col, i) => {
    const formatted = formatDevelopEliteCropTablePopupValue(cropRow, col, link.cropMeta, i)
    if (formatted !== '') merged[col] = formatted
  })
  if (farmCode) merged.Farm_Code = farmCode
  return { props: merged, cropLinked: true }
}

export function developEliteTableRowIdForFieldKey(
  link: DevelopEliteCropTablePopupLink,
  fieldKey: string,
): string | null {
  const key = fieldKey.trim()
  if (!key) return null
  const hit = link.formattedTableRows.find(r => r._fieldKey?.trim() === key)
  return hit?._rowId ?? null
}

export function developEliteTableRowIdForFarmCode(
  link: DevelopEliteCropTablePopupLink,
  farmCode: string,
): string | null {
  const code = farmCode.trim() ? normalizeDevelopEliteJoinKey(farmCode) : ''
  if (!code) return null
  const joinField = link.joinField.trim() || 'Farm_Code'
  const hit = link.formattedTableRows.find(r => {
    const raw = r[joinField] ?? r.Farm_Code ?? ''
    return raw.trim() && normalizeDevelopEliteJoinKey(raw) === code
  })
  return hit?._rowId ?? null
}
