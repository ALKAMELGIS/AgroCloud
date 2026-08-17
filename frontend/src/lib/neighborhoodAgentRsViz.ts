/**
 * Neighborhood Agent — remote-sensing (NDVI/…) visual lift: pie + bar from class areas.
 */

import type { GeoExplorerDataTablePayload } from './geoExplorerGemini'

export type NeighborhoodAgentRsClass = {
  name: string
  areaHa: number | null
  pct: number | null
}

export type NeighborhoodAgentRsLift = {
  indexLabel: string
  sceneDate?: string
  resolutionMeters?: number
  meanValue?: number
  lead: string
  classes: NeighborhoodAgentRsClass[]
  shareTable: GeoExplorerDataTablePayload | null
  areaTable: GeoExplorerDataTablePayload | null
}

/** Luxe NDVI spectrum: deep water → stress ambers → emerald vigor. */
export const NAC_RS_CLASS_COLORS: ReadonlyArray<string> = [
  '#1e4d6b', // water / bare
  '#7f1d1d', // very low
  '#b91c1c', // high stress
  '#c2410c', // crop stress
  '#d97706', // early watch
  '#ca8a04', // watch
  '#65a30d', // moderate
  '#16a34a', // good
  '#15803d', // strong
  '#14532d', // very dense
  '#0f766e', // extra
  '#0e7490', // extra
]

const INDEX_RE = /\b(NDVI|NDWI|NDMI|SAVI|EVI|GNDVI|NBR|NDRE|BSI|MNDWI|LST|NDSI|ET|ISS|WDSI|WAPI|DSI|DRA)\b/i

export function colorForRsClass(name: string, index: number): string {
  const n = name.toLowerCase()
  if (/water|no\s*veg|bare|open\s*water/.test(n)) return '#1e4d6b'
  if (/very\s*low|dead|barren/.test(n)) return '#7f1d1d'
  if (/high\s*stress/.test(n)) return '#b91c1c'
  if (/crop\s*stress|severe/.test(n)) return '#c2410c'
  if (/early\s*watch/.test(n)) return '#d97706'
  if (/\bwatch\b/.test(n) && !/early/.test(n)) return '#ca8a04'
  if (/moderate/.test(n)) return '#65a30d'
  if (/good/.test(n)) return '#16a34a'
  if (/strong/.test(n)) return '#15803d'
  if (/very\s*dense|vigorous|healthy\s*dense/.test(n)) return '#14532d'
  if (/healthy/.test(n)) return '#22c55e'
  // Stable by class name so pie / bar / legend always match (not series row index).
  let hash = 0
  for (let i = 0; i < n.length; i++) hash = (hash * 31 + n.charCodeAt(i)) >>> 0
  return NAC_RS_CLASS_COLORS[(hash || index) % NAC_RS_CLASS_COLORS.length]!
}

function parseClassLine(line: string): NeighborhoodAgentRsClass | null {
  const cleaned = line
    .replace(/^\s*[-*•]\s*/, '')
    .replace(/^\s*\d+[.)]\s*/, '')
    .trim()
  if (!cleaned || cleaned.length < 2) return null

  // "Name · 12.3 ha · 4.5%" or "Name · 4.5%" or pipe table cells
  const parts = cleaned.split(/\s*[·|]\s*/).map(p => p.trim()).filter(Boolean)
  if (parts.length < 2) {
    // "Name: 12.3 ha (4.5%)"
    const m = cleaned.match(/^(.+?)\s*[:：]\s*(.+)$/)
    if (!m) return null
    return parseClassFromNameAndTail(m[1]!.trim(), m[2]!.trim())
  }
  const name = parts[0]!.replace(/\*\*/g, '').trim()
  if (name.length < 2 || /^(class|name|group|live)/i.test(name)) return null
  let areaHa: number | null = null
  let pct: number | null = null
  for (const p of parts.slice(1)) {
    const ha = p.match(/([\d.,]+)\s*ha\b/i)
    if (ha) {
      const n = Number(ha[1]!.replace(/,/g, ''))
      if (Number.isFinite(n)) areaHa = n
      continue
    }
    const pc = p.match(/([\d.,]+)\s*%/)
    if (pc) {
      const n = Number(pc[1]!.replace(/,/g, ''))
      if (Number.isFinite(n)) pct = n
      continue
    }
    const bare = Number(p.replace(/,/g, ''))
    if (Number.isFinite(bare) && !p.includes('%') && areaHa == null && bare > 1) areaHa = bare
    else if (Number.isFinite(bare) && pct == null && bare <= 100) pct = bare
  }
  if (areaHa == null && pct == null) return null
  return { name: name.slice(0, 48), areaHa, pct }
}

function parseClassFromNameAndTail(name: string, tail: string): NeighborhoodAgentRsClass | null {
  const areaHaM = tail.match(/([\d.,]+)\s*ha/i)
  const pctM = tail.match(/([\d.,]+)\s*%/)
  const areaHa = areaHaM ? Number(areaHaM[1]!.replace(/,/g, '')) : null
  const pct = pctM ? Number(pctM[1]!.replace(/,/g, '')) : null
  if ((areaHa == null || !Number.isFinite(areaHa)) && (pct == null || !Number.isFinite(pct))) return null
  return {
    name: name.replace(/\*\*/g, '').trim().slice(0, 48),
    areaHa: areaHa != null && Number.isFinite(areaHa) ? areaHa : null,
    pct: pct != null && Number.isFinite(pct) ? pct : null,
  }
}

function buildShareTable(classes: NeighborhoodAgentRsClass[], title: string): GeoExplorerDataTablePayload | null {
  const rows = classes
    .map(c => {
      const pct =
        c.pct != null && Number.isFinite(c.pct)
          ? c.pct
          : null
      if (pct == null) return null
      return {
        values: { class: c.name, share: Math.round(pct * 10) / 10 } as Record<string, string | number>,
      }
    })
    .filter(Boolean) as GeoExplorerDataTablePayload['rows']
  if (rows.length < 2) return null
  return {
    kind: 'markdown',
    title: `${title} share %`,
    columns: [
      { key: 'class', label: 'Class', align: 'left' },
      { key: 'share', label: 'Share %', align: 'right' },
    ],
    rows,
  }
}

function buildAreaTable(classes: NeighborhoodAgentRsClass[], title: string): GeoExplorerDataTablePayload | null {
  const rows = classes
    .map(c => {
      if (c.areaHa == null || !Number.isFinite(c.areaHa)) return null
      return {
        values: {
          class: c.name,
          area: Math.round(c.areaHa * 100) / 100,
          ...(c.pct != null ? { share: Math.round(c.pct * 10) / 10 } : {}),
        } as Record<string, string | number>,
      }
    })
    .filter(Boolean) as GeoExplorerDataTablePayload['rows']
  if (rows.length < 2) return null
  const hasShare = rows.some(r => r.values.share != null)
  return {
    kind: 'markdown',
    title: `${title} area`,
    columns: [
      { key: 'class', label: 'Class', align: 'left' },
      { key: 'area', label: 'Area ha', align: 'right' },
      ...(hasShare ? [{ key: 'share', label: 'Share %', align: 'right' as const }] : []),
    ],
    rows,
  }
}

function buildLead(indexLabel: string, classes: NeighborhoodAgentRsClass[], sceneDate?: string): string {
  const ranked = [...classes]
    .filter(c => (c.pct != null && c.pct > 0) || (c.areaHa != null && c.areaHa > 0))
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0) || (b.areaHa ?? 0) - (a.areaHa ?? 0))
  const top = ranked[0]
  const dateBit = sceneDate ? ` (${sceneDate})` : ''
  if (!top) return `${indexLabel} is on the map for the current AOI${dateBit}.`
  const pctBit = top.pct != null ? ` (~${top.pct.toFixed(1)}%)` : ''
  return `${indexLabel}${dateBit}: ${top.name} dominates the AOI${pctBit}.`
}

/**
 * Detect and lift RS / NDVI class-area dumps into chart-ready tables.
 */
export function liftRsAnalysisFromText(text: string): NeighborhoodAgentRsLift | null {
  const raw = String(text || '').trim()
  if (!raw) return null
  if (!INDEX_RE.test(raw) && !/active\s+analysis|per-class|live\s+per-class|remote\s*sensing/i.test(raw)) {
    return null
  }

  const indexMatch = raw.match(/Active\s+analysis:\s*([^\n]+)/i) || raw.match(INDEX_RE)
  const indexLabel = (indexMatch?.[1] || indexMatch?.[0] || 'NDVI').trim().replace(/\s+/g, ' ').slice(0, 24)

  const dateM = raw.match(/(?:Scene\s*\/\s*imagery\s*date|imagery\s*date|scene\s*date)\s*:\s*([^\n]+)/i)
  const sceneDate = dateM?.[1]?.trim()

  const resM = raw.match(/Resolution\s*:\s*([\d.]+)\s*m/i)
  const resolutionMeters = resM ? Number(resM[1]) : undefined

  const meanM = raw.match(/(?:AOI\s+)?mean\s*:\s*([-\d.]+)/i)
  const meanValue = meanM ? Number(meanM[1]) : undefined

  const classes: NeighborhoodAgentRsClass[] = []
  const lines = raw.split(/\r?\n/)
  let inClassBlock = false
  for (const line of lines) {
    if (/live\s+per-class|per-class\s+areas|class\s+areas|breakdown/i.test(line)) {
      inClassBlock = true
      continue
    }
    if (inClassBlock && /^\s*$/.test(line)) {
      if (classes.length) break
      continue
    }
    if (inClassBlock || /^\s*[-*•]\s+.+\s*[·:].*%/.test(line) || /^\s*[-*•]\s+.+\s+[\d.]+\s*ha/i.test(line)) {
      const cl = parseClassLine(line)
      if (cl) {
        classes.push(cl)
        inClassBlock = true
      } else if (inClassBlock && classes.length && !/^\s*[-*•]/.test(line) && !/^\s*\|/.test(line)) {
        // left the class list
        if (!/showing|opened|references/i.test(line)) break
      }
    }
    // Markdown pipe rows: | Early watch | 904.64 | 61.2% |
    if (/^\s*\|/.test(line) && !/^\s*\|?\s*:?-+:?\s*\|/.test(line)) {
      const cells = line
        .split('|')
        .map(c => c.trim())
        .filter(Boolean)
      if (cells.length >= 2 && !/^(class|name|group|share|area)/i.test(cells[0]!)) {
        const cl = parseClassFromNameAndTail(
          cells[0]!,
          cells.slice(1).join(' · '),
        )
        if (cl) classes.push(cl)
      }
    }
  }

  if (classes.length < 2) return null

  const shareTable = buildShareTable(classes, indexLabel)
  const areaTable = buildAreaTable(classes, indexLabel)
  if (!shareTable && !areaTable) return null

  return {
    indexLabel,
    sceneDate,
    resolutionMeters: resolutionMeters != null && Number.isFinite(resolutionMeters) ? resolutionMeters : undefined,
    meanValue: meanValue != null && Number.isFinite(meanValue) ? meanValue : undefined,
    lead: buildLead(indexLabel, classes, sceneDate),
    classes,
    shareTable,
    areaTable,
  }
}

/** Persistable markdown so the transcript can re-lift charts. */
export function formatRsLiftAsMarkdown(lift: NeighborhoodAgentRsLift): string {
  const lines: string[] = [lift.lead, '', `Active analysis: ${lift.indexLabel}`]
  if (lift.sceneDate) lines.push(`Scene / imagery date: ${lift.sceneDate}`)
  if (lift.resolutionMeters != null) lines.push(`Resolution: ${lift.resolutionMeters} m/px`)
  if (lift.meanValue != null) lines.push(`AOI mean: ${lift.meanValue.toFixed(4)}`)
  lines.push('', 'Live per-class areas:')
  for (const c of lift.classes) {
    const bits = [c.name]
    if (c.areaHa != null) bits.push(`${c.areaHa.toFixed(2)} ha`)
    if (c.pct != null) bits.push(`${c.pct.toFixed(1)}%`)
    lines.push(`  - ${bits.join(' · ')}`)
  }
  if (lift.shareTable?.rows.length) {
    lines.push('', `| Class | Share % |`, `| --- | ---: |`)
    for (const r of lift.shareTable.rows) {
      lines.push(`| ${r.values.class} | ${r.values.share} |`)
    }
  }
  return lines.join('\n')
}

export function isRsShareTable(table: GeoExplorerDataTablePayload): boolean {
  const title = `${table.title || ''}`.toLowerCase()
  const cols = table.columns.map(c => c.label.toLowerCase()).join(' ')
  return /share\s*%|ndvi|ndwi|ndmi|class/.test(`${title} ${cols}`) && /%|share|percent/.test(cols + title)
}

export function isRsAreaTable(table: GeoExplorerDataTablePayload): boolean {
  const title = `${table.title || ''}`.toLowerCase()
  const cols = table.columns.map(c => `${c.label} ${c.key}`.toLowerCase()).join(' ')
  return /\b(area|ha)\b/.test(cols + title) && /class|ndvi|ndwi|ndmi|vegetation/.test(title + cols)
}

/**
 * “Compare last breakdown / dominant share” follow-ups about AOI RS classes —
 * must NOT route to loaded vector-layer stats (e.g. 532 records dumps).
 */
export function isAoiRsBreakdownFollowUpQuestion(userMessage: string): boolean {
  const t = userMessage.trim()
  if (!t) return false
  if (
    /\b(on\s+(this\s+)?layer|loaded\s+layers?|attribute\s+table|feature\s+code|this\s+layer|gis\s+layer|طبقة|على\s+الطبقة|من\s+الطبقة)\b/i.test(
      t,
    )
  ) {
    return false
  }
  if (/\b(last\s+breakdown|your\s+last\s+breakdown|from\s+your\s+last)\b/i.test(t)) return true
  if (/\bdominant\s+share\b/i.test(t)) return true
  if (
    /\b(compare|highlight).{0,80}(categor(?:y|ies)|classes|class\s+areas|shares?|groups?)\b/i.test(t) &&
    !/\b(parcel|feature\s+code|records?)\b/i.test(t)
  ) {
    return true
  }
  if (
    /\b(ndvi|ndwi|ndmi|savi|evi|vegetation|aoi|remote\s*sensing|index\s+class).{0,100}(categor|class|share|breakdown|compare|table)\b/i.test(
      t,
    )
  ) {
    return true
  }
  if (/(آخر\s+تفصيل|الحصة\s+(?:الأكبر|الاكبر)|قارن\s+الفئات|من\s+آخر\s+تفصيل)/.test(t)) return true
  return false
}

/**
 * “Analyze this AOI / Deeper AOI analysis” — drawn AOI + RS, never loaded GIS layer dumps.
 */
export function isDrawnAoiAnalysisQuestion(userMessage: string): boolean {
  const t = userMessage.trim()
  if (!t) return false
  if (
    /\b(on\s+(this\s+)?layer|loaded\s+layers?|attribute\s+table|feature\s+code|this\s+layer|على\s+الطبقة|من\s+الطبقة)\b/i.test(
      t,
    )
  ) {
    // Explicit layer ask wins only when not primarily “analyze AOI”.
    if (!/\b(analy[sz]e\s+(this\s+)?aoi|deeper\s+aoi|aoi\s+analysis)\b/i.test(t)) return false
  }
  if (/\b(deeper\s+aoi|aoi\s+analysis|analy[sz]e\s+(this\s+)?aoi|analy[sz]e\s+this\s+area)\b/i.test(t)) {
    return true
  }
  if (/\bin\s+more\s+depth\b/i.test(t) && /\baoi\b/i.test(t)) return true
  if (/(تحليل\s+(?:أعمق|اعمق)\s+(?:ل?منطقة|ل?الـ?\s*AOI)|حلّل\s+منطقة\s+الاهتمام)/.test(t)) {
    return true
  }
  return false
}
