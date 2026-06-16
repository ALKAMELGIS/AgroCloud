import type { GeoAiPopupAttrRow } from './geoExplorerLayerContext'
import type { SiPopupInspectPayload } from './siLayerPopupInspect'

export const NDVI_FIELD_RX = /^(NDVI|NDVI_|ndvi|NDVI_MEAN|NDVI_MAX|NDVI_MIN|NDVI_AVG|NDVI_VALUE)/i
export const AOI_FIELD_RX = /^(AOI|AOI_|aoi|AREA_NAME|Area_Name|Farm_Name|FARM_NAME|FIELD_NAME|Zone_Name|ZONE)/i

export function isEmptyAttributeValue(value: string | null | undefined): boolean {
  if (value == null) return true
  const t = String(value).trim()
  return t === '' || t === '—' || t === '-' || t === 'null' || t === 'undefined'
}

export function filterEmptyRows<T extends { value: string }>(rows: T[]): T[] {
  return rows.filter(r => !isEmptyAttributeValue(r.value))
}

export function extractNdviFromRows(rows: GeoAiPopupAttrRow[]): number | null {
  for (const r of rows) {
    if (!NDVI_FIELD_RX.test(r.key) && !NDVI_FIELD_RX.test(r.label)) continue
    const n = Number(String(r.value).replace(/[^\d.-]/g, ''))
    if (Number.isFinite(n)) return n
  }
  return null
}

export function extractAoiFromRows(rows: GeoAiPopupAttrRow[]): string | null {
  for (const r of rows) {
    if (!AOI_FIELD_RX.test(r.key) && !AOI_FIELD_RX.test(r.label)) continue
    const v = String(r.value).trim()
    if (v) return v
  }
  return null
}

export function isMediaValue(value: string): boolean {
  return /^(https?:\/\/|www\.)/i.test(value.trim()) || /\.(png|jpe?g|gif|webp|pdf|zip)(\?|$)/i.test(value.trim())
}

export function isImageUrl(value: string): boolean {
  return /^(https?:\/\/|www\.)/i.test(value.trim()) && /\.(png|jpe?g|gif|webp)(\?|$)/i.test(value.trim())
}

export function rowsToCsv(rows: { label: string; value: string }[]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
  const lines = ['Field,Value', ...rows.map(r => `${esc(r.label)},${esc(r.value)}`)]
  return lines.join('\n')
}

export function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function flattenInspectRows(inspect: SiPopupInspectPayload, hideEmpty: boolean): { label: string; value: string }[] {
  const rows = inspect.flatRows.length
    ? inspect.flatRows
    : inspect.sections.flatMap(s => s.rows.map(r => ({ label: r.label, value: r.value })))
  return hideEmpty ? filterEmptyRows(rows) : rows
}

export async function copyTextToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
}

export function ndviHealthLabel(ndvi: number): { label: string; tone: 'low' | 'mid' | 'high' } {
  if (ndvi < 0.2) return { label: 'ضعيف', tone: 'low' }
  if (ndvi < 0.45) return { label: 'متوسط', tone: 'mid' }
  return { label: 'جيد', tone: 'high' }
}

export function parseNumericFieldValue(value: string): number | null {
  const n = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}
