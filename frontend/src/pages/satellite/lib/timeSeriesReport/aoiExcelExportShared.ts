/** Shared helpers for AOI Excel exports — date alignment, plot IDs, Excel-safe text. */

export const AOI_EXCEL_NO_DATA = 'No Data'

/** ASCII-safe placeholders so Windows Excel never shows mojibake (â€”, mÂ², …). */
export function excelSafeText(value: unknown): string {
  if (value == null) return AOI_EXCEL_NO_DATA
  return String(value)
    .replace(/\u2014|\u2013|\u2212/g, '-') // em/en/minus dashes
    .replace(/\u00A0/g, ' ') // nbsp
    .replace(/m\u00B2/gi, 'm2')
    .replace(/m²/gi, 'm2')
    .replace(/ha\u00B2/gi, 'ha')
    .replace(/\u2026/g, '...')
    .replace(/[^\S\n]+/g, ' ')
    .trim()
}

export function excelMissing(value: number | null | undefined): number | typeof AOI_EXCEL_NO_DATA {
  if (value == null || !Number.isFinite(value)) return AOI_EXCEL_NO_DATA
  return value
}

/** True when a label looks like an upload filename / layer system id, not a plot name. */
export function looksLikeLayerFileId(value: string): boolean {
  const s = String(value || '').trim()
  if (!s) return true
  if (/\.(zip|shp|dbf|shx|kml|kmz|geojson|json|gpkg|tif|tiff)$/i.test(s)) return true
  if (/^custom-\d+/i.test(s)) return true
  if (/^vl:/i.test(s)) return true
  return false
}

/** Strip common AOI layer prefixes for cleaner Plot_T-32 sheet / column names. */
export function cleanAoiPlotDisplayId(raw: string): string {
  let s = String(raw || '').trim()
  s = s.replace(/^AOI\s*:\s*/i, '')
  const colon = s.indexOf(':')
  if (colon > 0 && colon < 40) {
    s = s.slice(colon + 1).trim()
  }
  if (looksLikeLayerFileId(s)) {
    const hash = s.match(/#\s*(\d+)\s*$/)
    if (hash) return `Plot ${hash[1]}`
    const tail = s.match(/-(\d+)\s*$/)
    if (tail && !/\.zip/i.test(tail[0])) return `Plot ${tail[1]}`
    return 'Plot'
  }
  return s || 'Plot'
}

/**
 * Union of all acquisition dates that have at least one finite index on any plot.
 * Every plot sheet must use this same list (missing → "No Data").
 */
export function collectMasterAcquisitionDates(
  dailyByPlot: Iterable<Array<{ date?: string; [k: string]: unknown }>>,
  fromDate: string,
  toDate: string,
  hasFiniteObservation: (row: { date?: string; [k: string]: unknown }) => boolean,
): string[] {
  const from = fromDate.slice(0, 10)
  const to = toDate.slice(0, 10)
  const set = new Set<string>()
  for (const rows of dailyByPlot) {
    for (const row of rows) {
      const d = String(row.date || '').trim().slice(0, 10)
      if (!d || d < from || d > to) continue
      if (hasFiniteObservation(row)) set.add(d)
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}
