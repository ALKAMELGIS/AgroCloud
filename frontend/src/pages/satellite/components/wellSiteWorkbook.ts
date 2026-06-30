import * as XLSX from 'xlsx'
import type { WellSiteAttributes, WellSiteResult } from '../../../lib/hydroWatershed/hydroEngine'

/** Ordered attribute columns (Shapefile-style) with human labels for the workbook. */
const COLUMNS: Array<{ key: keyof WellSiteAttributes; label: string; numeric: boolean }> = [
  { key: 'well_name', label: 'Well name', numeric: false },
  { key: 'rank', label: 'Rank', numeric: true },
  { key: 'longitude', label: 'Longitude', numeric: true },
  { key: 'latitude', label: 'Latitude', numeric: true },
  { key: 'elev_m', label: 'Elevation (m)', numeric: true },
  { key: 'slope_pc', label: 'Slope (%)', numeric: true },
  { key: 'flow_acc', label: 'Flow accumulation (cells)', numeric: true },
  { key: 'twi', label: 'TWI', numeric: true },
  { key: 'aq_prob', label: 'Aquifer probability', numeric: true },
  { key: 'aq_type', label: 'Aquifer type', numeric: false },
  { key: 'water_table_m', label: 'Water table depth (m)', numeric: true },
  { key: 'depth_m', label: 'Expected drill depth (m)', numeric: true },
  { key: 'yield_m3d', label: 'Expected yield (m³/day)', numeric: true },
  { key: 'soil_perm', label: 'Soil permeability', numeric: false },
  { key: 'soil_type', label: 'Soil type', numeric: false },
  { key: 'infil_rate', label: 'Infiltration rate (mm/hr)', numeric: true },
  { key: 'rch_dist_m', label: 'Recharge distance (m)', numeric: true },
  { key: 'rain_mm', label: 'Rainfall (mm)', numeric: true },
  { key: 'runoff_idx', label: 'Runoff index', numeric: true },
  { key: 'well_score', label: 'Suitability score', numeric: true },
  { key: 'confidence', label: 'Confidence', numeric: false },
  { key: 'risk_lvl', label: 'Risk level', numeric: false },
]

/** Numeric columns that carry analytical meaning (coordinates / rank excluded). */
const STAT_KEYS: Array<keyof WellSiteAttributes> = [
  'elev_m',
  'slope_pc',
  'flow_acc',
  'twi',
  'aq_prob',
  'water_table_m',
  'depth_m',
  'yield_m3d',
  'infil_rate',
  'rch_dist_m',
  'rain_mm',
  'runoff_idx',
  'well_score',
]

const CATEGORY_KEYS: Array<keyof WellSiteAttributes> = [
  'aq_type',
  'soil_perm',
  'soil_type',
  'confidence',
  'risk_lvl',
]

const LABEL_BY_KEY = new Map(COLUMNS.map(c => [c.key, c.label]))

function round(v: number, d = 2): number {
  const f = 10 ** d
  return Math.round(v * f) / f
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN
  if (sorted.length === 1) return sorted[0]!
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]!
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo)
}

type NumericStats = {
  count: number
  min: number
  max: number
  mean: number
  median: number
  std: number
  p25: number
  p75: number
  range: number
}

function describe(values: number[]): NumericStats {
  const arr = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b)
  const count = arr.length
  if (!count) {
    return { count: 0, min: NaN, max: NaN, mean: NaN, median: NaN, std: NaN, p25: NaN, p75: NaN, range: NaN }
  }
  const sum = arr.reduce((s, v) => s + v, 0)
  const mean = sum / count
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / count
  const min = arr[0]!
  const max = arr[count - 1]!
  return {
    count,
    min,
    max,
    mean,
    median: percentile(arr, 0.5),
    std: Math.sqrt(variance),
    p25: percentile(arr, 0.25),
    p75: percentile(arr, 0.75),
    range: max - min,
  }
}

/**
 * Build and download a multi-sheet Excel workbook for the Well Site
 * Recommendation result:
 *   • "Recommended Wells" — every well with the full Shapefile-style attributes
 *   • "Statistical Analysis" — professional descriptive stats per numeric field,
 *      a focused Water Table analysis, and categorical distributions.
 */
export function exportWellSiteWorkbook(result: WellSiteResult): boolean {
  const points = result.points
  if (!points.length) return false
  const rows = points.map(p => p.attributes)

  // ── Sheet 1: data ──
  const dataAoa: (string | number)[][] = [
    COLUMNS.map(c => c.label),
    ...rows.map(r => COLUMNS.map(c => (r[c.key] as string | number) ?? '')),
  ]
  const dataSheet = XLSX.utils.aoa_to_sheet(dataAoa)
  dataSheet['!cols'] = COLUMNS.map(c => ({ wch: Math.max(c.label.length + 2, 12) }))

  // ── Sheet 2: statistics ──
  const n = rows.length
  const stats: (string | number)[][] = []
  stats.push(['Well Site Recommendation — Statistical Analysis'])
  stats.push(['Generated', new Date().toISOString()])
  stats.push(['Wells analysed', n])
  stats.push([])
  stats.push(['Descriptive statistics (per attribute)'])
  stats.push(['Attribute', 'Count', 'Min', 'Max', 'Mean', 'Median', 'Std Dev', 'P25', 'P75', 'Range'])
  for (const key of STAT_KEYS) {
    const s = describe(rows.map(r => Number(r[key])))
    stats.push([
      LABEL_BY_KEY.get(key) ?? String(key),
      s.count,
      round(s.min),
      round(s.max),
      round(s.mean),
      round(s.median),
      round(s.std),
      round(s.p25),
      round(s.p75),
      round(s.range),
    ])
  }

  // Focused Water Table analysis.
  const wt = describe(rows.map(r => Number(r.water_table_m)))
  const shallow = rows.filter(r => Number(r.water_table_m) <= 10).length
  const deep = rows.filter(r => Number(r.water_table_m) >= 40).length
  stats.push([])
  stats.push(['Water Table Analysis (depth to water table, m)'])
  stats.push(['Metric', 'Value'])
  stats.push(['Wells', wt.count])
  stats.push(['Shallowest (m)', round(wt.min, 1)])
  stats.push(['Deepest (m)', round(wt.max, 1)])
  stats.push(['Mean depth (m)', round(wt.mean, 1)])
  stats.push(['Median depth (m)', round(wt.median, 1)])
  stats.push(['Std deviation (m)', round(wt.std, 1)])
  stats.push(['Shallow wells (≤10 m)', shallow])
  stats.push(['Deep wells (≥40 m)', deep])
  stats.push(['Note', 'Estimated from terrain proxies (TWI, elevation, slope, flow). Validate with field survey.'])

  // Categorical distributions.
  stats.push([])
  stats.push(['Categorical distributions'])
  for (const key of CATEGORY_KEYS) {
    const counts = new Map<string, number>()
    for (const r of rows) {
      const v = String(r[key] ?? '—')
      counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    stats.push([LABEL_BY_KEY.get(key) ?? String(key), 'Count', 'Share'])
    for (const [value, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      stats.push([value, count, `${round((count / n) * 100, 1)}%`])
    }
    stats.push([])
  }

  const statSheet = XLSX.utils.aoa_to_sheet(stats)
  statSheet['!cols'] = [{ wch: 34 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, dataSheet, 'Recommended Wells')
  XLSX.utils.book_append_sheet(wb, statSheet, 'Statistical Analysis')
  XLSX.writeFile(wb, 'well-site-recommendations.xlsx')
  return true
}
