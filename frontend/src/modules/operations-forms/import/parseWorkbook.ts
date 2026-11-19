/**
 * Reads the farm's Excel / CSV forms into records for one operations form.
 *
 * - Finds the header row in each sheet by matching cells against the form's field aliases (the
 *   forms put headers on rows 2–9 under a company banner), maps columns to fields and reads rows.
 * - Sheet-level values ("EAG Farm Name: Al Maha NH 1") fill the farm when there is no farm column.
 * - The date is filled down when the sheet only writes it on the first row of a group (EC/pH).
 * - Wide layouts: Irrigation & Fertigation (a 5-column block per location) and Fertilizer Issue
 *   (one column per fertilizer) are unpivoted into one record per location / fertilizer.
 * - Sheets that lack a required column are skipped and reported (e.g. summary sheets).
 * - Locations are normalised (NH 1 / NH-01 → NH 01) so every form groups the same way.
 * Values are converted for display; the server validates and recalculates everything again.
 */
import * as XLSX from 'xlsx'

import type { OpsForm, OpsField } from '../api'

export type ParsedSheet = {
  name: string
  status: 'imported' | 'skipped'
  reason?: string
  headerRow?: number
  mapped: { field: string; column: string; header: string }[]
  rows: number
}

export type ParsedWorkbook = {
  rows: Record<string, unknown>[]
  sheets: ParsedSheet[]
}

type Grid = unknown[][]

const norm = (v: unknown) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const pad2 = (n: number) => String(n).padStart(2, '0')

export function excelSerialToIsoDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null
  const ms = Math.round((Math.floor(serial) - 25569) * 86400 * 1000)
  return new Date(ms).toISOString().slice(0, 10)
}

export function toIsoDate(v: unknown): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return excelSerialToIsoDate(v)
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  const s = String(v).trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (m) return `${m[1]}-${pad2(Number(m[2]))}-${pad2(Number(m[3]))}`
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s)
  if (m) return `${m[3]!.length === 2 ? `20${m[3]}` : m[3]}-${pad2(Number(m[2]))}-${pad2(Number(m[1]))}`
  return null
}

export function toTime(v: unknown): string | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') {
    const frac = v - Math.floor(v)
    const mins = Math.round(frac * 24 * 60)
    return `${pad2(Math.floor(mins / 60) % 24)}:${pad2(mins % 60)}`
  }
  const m = /(\d{1,2})[:.](\d{2})/.exec(String(v))
  return m ? `${pad2(Number(m[1]))}:${m[2]}` : null
}

/** NH 1 / NH-01 / nh01 → "NH 01"; BL 2 ( V6- V10) → "BL 02 (V6-V10)"; other names trimmed. */
export function normalizeLocation(v: unknown): string | null {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return null
  const m = /^(NH|GH|BL)\s*-?\s*0*(\d+)\s*(.*)$/i.exec(s)
  if (!m) return s
  const rest = m[3]!
    .replace(/\(\s*/g, '(')
    .replace(/\s*\)/g, ')')
    .replace(/\s*-\s*/g, '-')
    .replace(/\bv(\d)/gi, 'V$1')
    .trim()
  return `${m[1]!.toUpperCase()} ${pad2(Number(m[2]))}${rest ? ` ${rest}` : ''}`
}

/** "Al Maha NH 1" / "Al Maha Net House" / "Al- Maha" → "Al Maha". */
export function normalizeFarm(v: unknown): string | null {
  let s = String(v ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return null
  s = s.replace(/-\s+/g, ' ')
  s = s.replace(/\s+(?:NH|GH|BL)\s*-?\s*\d+\w*$/i, '')
  s = s.replace(/\s+(?:net ?house|green ?house|glass ?house|open field)$/i, '')
  return s.trim() || null
}

function cellText(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).replace(/\s+/g, ' ').trim()
  if (!s || /^#(N\/A|REF!|VALUE!|NAME\?|DIV\/0!)$/i.test(s)) return null
  return s
}

function convert(field: OpsField, v: unknown): unknown {
  switch (field.type) {
    case 'date':
      return toIsoDate(v) ?? cellText(v)
    case 'time':
      return toTime(v) ?? cellText(v)
    case 'number':
    case 'integer': {
      if (typeof v === 'number') return v
      const t = cellText(v)
      if (t == null) return null
      const n = Number(t.replace(/,/g, ''))
      return Number.isFinite(n) ? n : t
    }
    default: {
      const t = typeof v === 'number' ? String(v) : cellText(v)
      if (t == null) return null
      if (field.key === 'location') return normalizeLocation(t)
      if (field.key === 'farm') return normalizeFarm(t)
      return t
    }
  }
}

/** Best alias match of a header cell → field key (longest alias wins). */
function matchHeader(form: OpsForm, header: string): { key: string; score: number } | null {
  const h = norm(header)
  if (!h) return null
  let best: { key: string; score: number } | null = null
  for (const f of form.fields) {
    for (const alias of f.aliases ?? []) {
      const a = alias.toLowerCase()
      const hit = h === a ? a.length + 100 : h.startsWith(a) || h.includes(a) ? a.length : 0
      if (hit && (!best || hit > best.score)) best = { key: f.key, score: hit }
    }
  }
  return best
}

function colName(i: number) {
  return XLSX.utils.encode_col(i)
}

function findHeaderRow(form: OpsForm, grid: Grid, maxScan = 15): { row: number; map: Map<number, string> } | null {
  let best: { row: number; map: Map<number, string>; count: number } | null = null
  for (let r = 0; r < Math.min(maxScan, grid.length); r++) {
    const row = grid[r] ?? []
    const chosen = new Map<string, { col: number; score: number }>()
    row.forEach((cell, c) => {
      if (typeof cell !== 'string') return
      const m = matchHeader(form, cell)
      if (!m) return
      const prev = chosen.get(m.key)
      if (!prev || m.score > prev.score) chosen.set(m.key, { col: c, score: m.score })
    })
    if (chosen.size >= 2 && (!best || chosen.size > best.count)) {
      best = { row: r, map: new Map([...chosen].map(([key, v]) => [v.col, key])), count: chosen.size }
    }
  }
  return best ? { row: best.row, map: best.map } : null
}

/** "EAG Farm Name | Al Maha NH 1" style banner values above the header. */
function sheetContext(grid: Grid, headerRow: number): { farm?: string } {
  for (let r = 0; r < headerRow; r++) {
    const row = grid[r] ?? []
    for (let c = 0; c < row.length; c++) {
      if (!/farm name|farm and country/i.test(String(row[c] ?? ''))) continue
      for (let k = c + 1; k < row.length; k++) {
        const v = cellText(row[k])
        if (v) return { farm: normalizeFarm(v) ?? undefined }
      }
    }
  }
  return {}
}

/**
 * Shrink the sheet range to cells that hold values. Formatting applied to whole columns makes some
 * sheets claim 1,048,576 rows, which turned a 2-second read into a 30-second one.
 */
export function trimSheetRange(ws: XLSX.WorkSheet): void {
  let maxR = -1
  let maxC = -1
  let minR = Infinity
  let minC = Infinity
  for (const key of Object.keys(ws)) {
    if (key.charCodeAt(0) === 33) continue // '!ref', '!merges'…
    const cell = ws[key] as XLSX.CellObject | undefined
    if (!cell || cell.v === undefined || cell.v === null || cell.v === '') continue
    const { r, c } = XLSX.utils.decode_cell(key)
    if (r > maxR) maxR = r
    if (c > maxC) maxC = c
    if (r < minR) minR = r
    if (c < minC) minC = c
  }
  ws['!ref'] = maxR < 0 ? 'A1:A1' : XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } })
}

function readGrid(ws: XLSX.WorkSheet): Grid {
  trimSheetRange(ws)
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true })
}

function parseStandardSheet(form: OpsForm, name: string, grid: Grid): { sheet: ParsedSheet; rows: Record<string, unknown>[] } {
  const header = findHeaderRow(form, grid)
  if (!header) return { sheet: { name, status: 'skipped', reason: 'No matching column headers', mapped: [], rows: 0 }, rows: [] }
  const ctx = sheetContext(grid, header.row)
  const mappedKeys = new Set(header.map.values())
  const missing = form.fields.filter(f => f.required && !mappedKeys.has(f.key) && !(f.key === 'farm' && ctx.farm))
  const mapped = [...header.map].map(([c, key]) => ({ field: key, column: colName(c), header: String(grid[header.row]?.[c] ?? '') }))
  if (missing.length) {
    return {
      sheet: { name, status: 'skipped', reason: `Missing required column(s): ${missing.map(f => f.label.en).join(', ')}`, headerRow: header.row + 1, mapped, rows: 0 },
      rows: [],
    }
  }
  const fieldsByKey = new Map(form.fields.map(f => [f.key, f]))
  const headerTexts = new Set([...header.map.keys()].map(c => norm(grid[header.row]?.[c])))
  const rows: Record<string, unknown>[] = []
  let lastDate: unknown = null
  for (let r = header.row + 1; r < grid.length; r++) {
    const line = grid[r] ?? []
    const rec: Record<string, unknown> = {}
    let filled = 0
    for (const [c, key] of header.map) {
      const field = fieldsByKey.get(key)!
      if (field.computed) continue
      const v = convert(field, line[c])
      if (v != null && v !== '') {
        rec[key] = v
        if (key !== form.dateField) filled++
      }
    }
    if (!filled) continue
    // A header row repeated inside the data (printed forms repeat it per page).
    if (line.filter(c => typeof c === 'string' && headerTexts.has(norm(c))).length >= 2) continue
    if (rec[form.dateField]) lastDate = rec[form.dateField]
    else if (lastDate) rec[form.dateField] = lastDate
    // Rows without a real date are totals / notes / allocation tables, not records.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(rec[form.dateField] ?? ''))) continue
    if (!rec.farm && ctx.farm) rec.farm = ctx.farm
    rows.push(rec)
  }
  return { sheet: { name, status: rows.length ? 'imported' : 'skipped', reason: rows.length ? undefined : 'No data rows', headerRow: header.row + 1, mapped, rows: rows.length }, rows }
}

/** Irrigation & Fertigation Record: common columns, then a 5-column block per location. */
function parseIrrigationWide(form: OpsForm, name: string, grid: Grid): { sheet: ParsedSheet; rows: Record<string, unknown>[] } {
  let headerRow = -1
  for (let r = 0; r < Math.min(20, grid.length); r++) {
    const row = (grid[r] ?? []).map(norm)
    if (row.includes('week no') && row.some(c => c.startsWith('date')) && row.includes('location id')) {
      headerRow = r
      break
    }
  }
  if (headerRow < 0) return parseStandardSheet(form, name, grid)
  const head = grid[headerRow] ?? []
  const col = (re: RegExp) => head.findIndex(c => re.test(norm(c)))
  const common = {
    week: col(/^week no/),
    date: col(/^date/),
    method: col(/method/),
    flow: col(/flow rate/),
    operator: col(/operator/),
    authorized: col(/authori[sz]ed/),
  }
  const blocks: { start: number; location: string }[] = []
  head.forEach((c, i) => {
    if (norm(c) === 'location id') {
      const loc = normalizeLocation(head[i + 1])
      if (loc) blocks.push({ start: i, location: loc })
    }
  })
  const ctx = sheetContext(grid, headerRow)
  const rows: Record<string, unknown>[] = []
  for (let r = headerRow + 2; r < grid.length; r++) {
    const line = grid[r] ?? []
    const date = toIsoDate(line[common.date])
    if (!date) continue
    for (const b of blocks) {
      const water = typeof line[b.start] === 'number' ? (line[b.start] as number) : Number(line[b.start])
      const fertQty = typeof line[b.start + 4] === 'number' ? (line[b.start + 4] as number) : Number(line[b.start + 4])
      const hasWater = Number.isFinite(water) && water > 0
      const hasFert = Number.isFinite(fertQty) && fertQty > 0
      if (!hasWater && !hasFert) continue
      rows.push({
        record_date: date,
        farm: ctx.farm,
        location: b.location,
        method: cellText(line[common.method]),
        flow_rate_m3: typeof line[common.flow] === 'number' ? line[common.flow] : null,
        operator: cellText(line[common.operator]),
        authorized_by: cellText(line[common.authorized]),
        water_qty_m3: hasWater ? water : null,
        frequency: typeof line[b.start + 1] === 'number' ? line[b.start + 1] : null,
        fertilizer_type: cellText(line[b.start + 3]),
        fertilizer_qty: hasFert ? fertQty : null,
      })
    }
  }
  return {
    sheet: { name, status: rows.length ? 'imported' : 'skipped', reason: rows.length ? undefined : 'No irrigation entries', headerRow: headerRow + 1, mapped: blocks.map(b => ({ field: 'location', column: colName(b.start), header: b.location })), rows: rows.length },
    rows,
  }
}

/** Fertilizer Issue: Date | Farm | Pump Room | one column per fertilizer (names row + units row). */
function parseFertilizerIssueWide(form: OpsForm, name: string, grid: Grid): { sheet: ParsedSheet; rows: Record<string, unknown>[] } {
  let headerRow = -1
  for (let r = 0; r < Math.min(10, grid.length); r++) {
    const row = (grid[r] ?? []).map(norm)
    if (row.some(c => c.startsWith('date')) && row.some(c => c === 'pump room')) {
      headerRow = r
      break
    }
  }
  if (headerRow < 0) return parseStandardSheet(form, name, grid)
  const head = (grid[headerRow] ?? []).map(norm)
  const dateCol = head.findIndex(c => c.startsWith('date'))
  const farmCol = head.indexOf('farm')
  const pumpCol = head.indexOf('pump room')
  const firstFert = pumpCol + 1
  // Names row: the first row below the header with several text cells from firstFert on.
  let namesRow = -1
  let unitsRow = -1
  for (let r = headerRow + 1; r < Math.min(headerRow + 6, grid.length); r++) {
    const cells = (grid[r] ?? []).slice(firstFert)
    const texts = cells.filter(c => typeof c === 'string' && c.trim().length > 2)
    const units = cells.filter(c => typeof c === 'string' && /^(l|kg|g|ml)$/i.test(c.trim()))
    if (units.length >= 3 && unitsRow < 0) unitsRow = r
    else if (texts.length >= 3 && namesRow < 0) namesRow = r
  }
  if (namesRow < 0) return { sheet: { name, status: 'skipped', reason: 'Fertilizer names row not found', mapped: [], rows: 0 }, rows: [] }
  const names = grid[namesRow] ?? []
  const units = unitsRow >= 0 ? grid[unitsRow] ?? [] : []
  const fertCols: { col: number; name: string; uom: string | null }[] = []
  for (let c = firstFert; c < names.length; c++) {
    const n = cellText(names[c])
    if (n && !/^\d+(\.\d+)?$/.test(n)) fertCols.push({ col: c, name: n, uom: cellText(units[c]) })
  }
  const rows: Record<string, unknown>[] = []
  for (let r = Math.max(namesRow, unitsRow) + 1; r < grid.length; r++) {
    const line = grid[r] ?? []
    const date = toIsoDate(line[dateCol])
    if (!date) continue
    for (const f of fertCols) {
      const q = line[f.col]
      const qty = typeof q === 'number' ? q : Number(q)
      if (!Number.isFinite(qty) || qty <= 0) continue
      rows.push({
        issue_date: date,
        farm: farmCol >= 0 ? normalizeFarm(line[farmCol]) : null,
        pump_room: cellText(line[pumpCol]),
        fertilizer: f.name,
        quantity: qty,
        uom: f.uom,
      })
    }
  }
  return {
    sheet: { name, status: rows.length ? 'imported' : 'skipped', reason: rows.length ? undefined : 'No issued quantities', headerRow: headerRow + 1, mapped: fertCols.map(f => ({ field: 'fertilizer', column: colName(f.col), header: f.name })), rows: rows.length },
    rows,
  }
}

export function parseWorkbookData(form: OpsForm, data: ArrayBuffer | Uint8Array, fileName = 'file'): ParsedWorkbook {
  const isCsv = /\.csv$/i.test(fileName)
  const wb = isCsv
    ? XLSX.read(new TextDecoder().decode(data instanceof Uint8Array ? data : new Uint8Array(data)), { type: 'string', raw: false })
    : XLSX.read(data, { type: 'array', cellDates: false, cellStyles: false, cellNF: false, sheetStubs: false })
  const sheets: ParsedSheet[] = []
  const rows: Record<string, unknown>[] = []
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    if (!ws) continue
    if ((wb.Workbook?.Sheets ?? []).find(s => s.name === name)?.Hidden) {
      sheets.push({ name, status: 'skipped', reason: 'Hidden sheet', mapped: [], rows: 0 })
      continue
    }
    const grid = readGrid(ws)
    const parsed =
      form.importLayout === 'irrigation-wide'
        ? parseIrrigationWide(form, name, grid)
        : form.importLayout === 'fertilizer-issue-wide'
          ? parseFertilizerIssueWide(form, name, grid)
          : parseStandardSheet(form, name, grid)
    sheets.push(parsed.sheet)
    rows.push(...parsed.rows)
  }
  return { rows, sheets }
}

export async function parseWorkbookFile(form: OpsForm, file: File): Promise<ParsedWorkbook> {
  return parseWorkbookData(form, await file.arrayBuffer(), file.name)
}
