import type {
  GeoExplorerDataTableColumn,
  GeoExplorerDataTablePayload,
  GeoExplorerDataTableRow,
} from './geoExplorerGemini'

function splitPipeCells(line: string): string[] {
  const t = line.trim()
  if (!t.startsWith('|')) return []
  const core = t.endsWith('|') ? t.slice(1, -1) : t.slice(1)
  return core.split('|').map(c => c.trim())
}

function isSeparatorRow(cells: string[]): boolean {
  if (!cells.length) return false
  return cells.every(c => /^:?-{3,}:?$/.test(c.replace(/\s+/g, '')))
}

function slugColKey(label: string, idx: number): string {
  const s = label
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 48)
  return s || `col_${idx}`
}

function inferNumeric(values: string[]): boolean {
  let n = 0
  let ok = 0
  for (const v of values) {
    if (!v) continue
    n++
    const x = Number(v.replace(/,/g, ''))
    if (Number.isFinite(x)) ok++
  }
  return n >= 2 && ok / n >= 0.85
}

/** Parse a GitHub-style pipe table block into an interactive payload (no map links). */
export function pipeLinesToDataTable(lines: string[]): GeoExplorerDataTablePayload | null {
  const nonempty = lines.map(l => l.trimEnd()).filter(l => l.trim().length > 0)
  if (nonempty.length < 2) return null
  const headerCells = splitPipeCells(nonempty[0])
  if (headerCells.length < 2) return null
  let bodyStart = 1
  const maybeSep = splitPipeCells(nonempty[1])
  if (isSeparatorRow(maybeSep)) bodyStart = 2

  const columns: GeoExplorerDataTableColumn[] = headerCells.map((label, i) => {
    const key = slugColKey(label, i)
    return { key, label: label || key, align: 'left' }
  })

  const rawRows: string[][] = []
  for (let i = bodyStart; i < nonempty.length; i++) {
    const cells = splitPipeCells(nonempty[i])
    if (cells.length === 0) continue
    rawRows.push(cells)
  }
  if (!rawRows.length) return null

  for (let c = 0; c < columns.length; c++) {
    const samples = rawRows.map(r => String(r[c] ?? '').trim()).filter(Boolean)
    if (inferNumeric(samples)) columns[c] = { ...columns[c], align: 'right' }
  }

  const rows: GeoExplorerDataTableRow[] = rawRows.map(r => {
    const values: Record<string, string | number | null> = {}
    columns.forEach((col, i) => {
      const cell = String(r[i] ?? '').trim()
      if (columns[i].align === 'right') {
        const n = Number(cell.replace(/,/g, ''))
        values[col.key] = Number.isFinite(n) ? n : cell || null
      } else {
        values[col.key] = cell || null
      }
    })
    return { values }
  })

  return {
    kind: 'markdown',
    title: 'Summary table',
    columns,
    rows,
  }
}

export type GeoMarkdownSegment =
  | { type: 'text'; text: string }
  | { type: 'table'; table: GeoExplorerDataTablePayload }

/** Split assistant markdown into text + extracted pipe tables (first table wins per block; supports multiple). */
export function splitTextIntoMarkdownSegments(text: string): GeoMarkdownSegment[] {
  const lines = text.split(/\r?\n/)
  const out: GeoMarkdownSegment[] = []
  let buf: string[] = []

  const flushText = () => {
    const t = buf.join('\n').trimEnd()
    buf = []
    if (t) out.push({ type: 'text', text: t })
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim().startsWith('|') && line.includes('|')) {
      const block: string[] = []
      let j = i
      while (j < lines.length && lines[j].trim().startsWith('|')) {
        block.push(lines[j])
        j++
      }
      const tbl = pipeLinesToDataTable(block)
      if (tbl && tbl.rows.length) {
        flushText()
        out.push({ type: 'table', table: tbl })
        i = j
        continue
      }
    }
    buf.push(line)
    i++
  }
  flushText()
  return out.length ? out : [{ type: 'text', text: text.trimEnd() }]
}
