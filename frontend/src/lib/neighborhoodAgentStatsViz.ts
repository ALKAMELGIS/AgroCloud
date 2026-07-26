/**
 * Helpers for Neighborhood Agent statistical replies — compact tables → bar chart series.
 */

import type { GeoExplorerDataTablePayload } from './geoExplorerGemini'

export type NeighborhoodAgentChartSeries = {
  labels: string[]
  values: number[]
  valueLabel: string
  title: string
}

/** Coordinated teal → cyan → sky → emerald stops for NAC dark chrome. */
export const NAC_BAR_GRADIENT_STOPS: ReadonlyArray<{ from: string; to: string }> = [
  { from: 'rgba(13, 148, 136, 0.35)', to: 'rgba(45, 212, 191, 0.95)' },
  { from: 'rgba(8, 145, 178, 0.35)', to: 'rgba(34, 211, 238, 0.95)' },
  { from: 'rgba(3, 105, 161, 0.35)', to: 'rgba(56, 189, 248, 0.95)' },
  { from: 'rgba(5, 150, 105, 0.35)', to: 'rgba(52, 211, 153, 0.92)' },
  { from: 'rgba(15, 118, 110, 0.35)', to: 'rgba(94, 234, 212, 0.92)' },
  { from: 'rgba(7, 89, 133, 0.35)', to: 'rgba(125, 211, 252, 0.92)' },
  { from: 'rgba(4, 120, 87, 0.35)', to: 'rgba(110, 231, 183, 0.9)' },
  { from: 'rgba(14, 116, 144, 0.35)', to: 'rgba(103, 232, 249, 0.9)' },
]

const MAX_AUTO_CHART_ROWS = 6

function cellStr(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  return String(v)
}

function asFiniteNumber(v: string | number | null | undefined): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (v == null) return null
  const n = Number(String(v).replace(/,/g, '').replace(/%/g, '').trim())
  return Number.isFinite(n) ? n : null
}

/**
 * Prefer a % / share / count / value column when several numeric columns exist.
 */
export function pickNeighborhoodAgentNumericColumn(
  table: GeoExplorerDataTablePayload,
): { labelKey: string; valueKey: string; valueLabel: string } | null {
  const cols = table.columns
  if (cols.length < 2) return null

  const labelCol = cols.find(c => c.align !== 'right') ?? cols[0]
  const numericCols = cols.filter(c => c !== labelCol && c.align === 'right')
  if (!numericCols.length) {
    for (const c of cols) {
      if (c.key === labelCol.key) continue
      const samples = table.rows.slice(0, 8).map(r => asFiniteNumber(r.values[c.key])).filter(n => n != null)
      if (samples.length >= Math.min(2, table.rows.length)) {
        return { labelKey: labelCol.key, valueKey: c.key, valueLabel: c.label }
      }
    }
    return null
  }

  const prefer = (re: RegExp) => numericCols.find(c => re.test(c.label) || re.test(c.key))
  const chosen =
    prefer(/%|percent|share|نسبة|حصة/) ||
    prefer(/count|عدد|qty|quantity/) ||
    prefer(/temp|°c|value|val|مقدار|قيمة|population|pop|million|ha|area/) ||
    numericCols[0]

  return { labelKey: labelCol.key, valueKey: chosen.key, valueLabel: chosen.label }
}

/** True when the table is a compact breakdown suitable for an auto chart (not large data dumps). */
export function shouldAutoChartNeighborhoodAgentTable(table: GeoExplorerDataTablePayload): boolean {
  if (!table.rows.length || table.rows.length > MAX_AUTO_CHART_ROWS) return false
  // Wide census-style tables stay as plain tables only.
  if (table.columns.length > 3) return false
  if (!pickNeighborhoodAgentNumericColumn(table)) return false
  const title = `${table.title || ''} ${table.columns.map(c => c.label).join(' ')}`.toLowerCase()
  // Huge absolute population dumps without share/% — table only.
  if (table.rows.length > 4 && /population|سكان/.test(title) && !/share|%|percent|نسبة|حصة|temp|°/.test(title)) {
    return false
  }
  return true
}

/** Build label/value series for Chart.js (max 12 bars). */
export function buildNeighborhoodAgentChartSeries(
  table: GeoExplorerDataTablePayload,
): NeighborhoodAgentChartSeries | null {
  const pick = pickNeighborhoodAgentNumericColumn(table)
  if (!pick) return null

  const labels: string[] = []
  const values: number[] = []
  for (const row of table.rows.slice(0, MAX_AUTO_CHART_ROWS)) {
    const n = asFiniteNumber(row.values[pick.valueKey])
    if (n == null) continue
    const lb = cellStr(row.values[pick.labelKey]).trim().slice(0, 36) || '—'
    labels.push(lb)
    values.push(n)
  }
  if (labels.length < 2) return null

  return {
    labels,
    values,
    valueLabel: pick.valueLabel,
    title: (table.title || 'Breakdown').trim() || 'Breakdown',
  }
}

function stripMdBold(s: string): string {
  return s.replace(/\*\*/g, '').replace(/__/g, '').trim()
}

function parseBulletValue(raw: string): { value: number; isPercent: boolean } | null {
  const s = raw.trim()
  const rangePct = s.match(/(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)\s*%/)
  if (rangePct) {
    const a = Number(rangePct[1])
    const b = Number(rangePct[2])
    if (Number.isFinite(a) && Number.isFinite(b)) return { value: (a + b) / 2, isPercent: true }
  }
  const pct = s.match(/(\d+(?:\.\d+)?)\s*%/)
  if (pct) {
    const n = Number(pct[1])
    if (Number.isFinite(n)) return { value: n, isPercent: true }
  }
  const million = s.match(/(?:~|≈|around|about|حوالي)?\s*(\d+(?:\.\d+)?)\s*(?:million|مليون)/i)
  if (million) {
    const n = Number(million[1])
    if (Number.isFinite(n)) return { value: n, isPercent: false }
  }
  const plain = s.match(/(?:~|≈)?\s*(\d+(?:\.\d+)?)\s*(?:people|نسمة|شخص)?/i)
  if (plain) {
    const n = Number(plain[1])
    if (Number.isFinite(n) && n >= 0) return { value: n, isPercent: false }
  }
  return null
}

/**
 * Lift “- **Label:** 12-15%” style bullets into a compact table when ≥3 numeric rows exist.
 * Prefer percent rows when mixed with absolute totals.
 */
export function liftBulletBreakdownFromText(text: string): {
  text: string
  table: GeoExplorerDataTablePayload | null
} {
  const lines = text.split(/\r?\n/)
  type Hit = { lineIdx: number; label: string; value: number; isPercent: boolean }
  const hits: Hit[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const m = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(?:\*\*|__)?([^*_:\n–—-]{1,48}?)(?:\*\*|__)?\s*[:：]\s*(.+)$/)
    if (!m) continue
    const label = stripMdBold(m[1]!).replace(/\s*\([^)]*\)\s*$/, '').trim()
    if (label.length < 2) continue
    const parsed = parseBulletValue(m[2]!)
    if (!parsed) continue
    hits.push({ lineIdx: i, label: label.slice(0, 36), value: parsed.value, isPercent: parsed.isPercent })
  }

  if (hits.length < 3) return { text, table: null }

  const pctHits = hits.filter(h => h.isPercent)
  const use = pctHits.length >= 3 ? pctHits : hits
  if (use.length < 3 || use.length > MAX_AUTO_CHART_ROWS) return { text, table: null }

  const drop = new Set(use.map(h => h.lineIdx))
  // Also drop a short title line immediately above the first lifted bullet when it looks like a heading.
  const firstIdx = Math.min(...use.map(h => h.lineIdx))
  let title = 'Breakdown'
  if (firstIdx > 0) {
    const prev = stripMdBold(lines[firstIdx - 1] || '').replace(/^#+\s*/, '')
    if (prev.length >= 3 && prev.length <= 72 && !/[.!?…]$/.test(prev) && !/^\s*[-*•]/.test(lines[firstIdx - 1]!)) {
      title = prev
      drop.add(firstIdx - 1)
    }
  }

  const kept = lines.filter((_, i) => !drop.has(i)).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  const valueLabel = use.every(h => h.isPercent) ? 'Share %' : 'Value'
  const table: GeoExplorerDataTablePayload = {
    kind: 'markdown',
    title,
    columns: [
      { key: 'group', label: 'Group', align: 'left' },
      { key: 'value', label: valueLabel, align: 'right' },
    ],
    rows: use.map(h => ({
      values: {
        group: h.label,
        value: Math.round(h.value * 10) / 10,
      },
    })),
  }
  return { text: kept, table }
}
