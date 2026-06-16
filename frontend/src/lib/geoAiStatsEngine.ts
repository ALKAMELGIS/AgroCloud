import type { GeoExplorerDataTablePayload, GeoExplorerDataTableRow, GeoExplorerMapLink } from './geoExplorerGemini'
import type { GeoAiMapLayer } from './geoExplorerLayerContext'
import { extractGeoExplorerLayerHint, geoAiFeatureCentroid, normalizeLayerName } from './geoExplorerLayerContext'
import { computeStableGisFeatureKey } from './gisFeatureStableKey'
import { featureIntersectsMask, featureWithinMask } from './geoAiGeoJsonSpatial'
import { evalWhereExpr, extractWhereFromQuery, hasSqlWhereIntent } from './geoAiSqlWhere'

type GeoFeature = { id?: unknown; properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown } }

type ScopedFeatureRow = {
  layerName: string
  clientLayerId?: string
  featureIndex: number
  properties: Record<string, unknown>
  rawFeature: GeoFeature
}

type ScopedData = {
  layers: GeoAiMapLayer[]
  features: ScopedFeatureRow[]
  fields: string[]
}

type Comparison = {
  field: string
  op: '>' | '<' | '>=' | '<=' | '=' | '!='
  value: number
}

export type GeoAiMapFirstSelection = { layerId: string; featureKey: string }

export type GeoAiStatsResult = {
  handled: boolean
  reply: string
  table?: GeoExplorerDataTablePayload
  /** Map-first: zoom, highlight, popup — attribute table only when user asks for it. */
  mapFirstSync?: { selections: GeoAiMapFirstSelection[] }
}

function userWantsAttributeTableExplicitly(query: string): boolean {
  return /\b(attribute\s*table|open\s+table|show\s+table|table\s+view|full\s+table|data\s+table|layer\s+data|all\s+rows|rows\s+and\s+columns|spreadsheet|data\s+grid|browse\s+rows)\b/i.test(
    query,
  )
}

/** Prefer map + popup over an immediate Geo AI data table (unless user asks for a table). */
function userWantsMapFirstLayerBrowse(query: string, lookupTokens: string[], hasNumericComparison: boolean): boolean {
  if (userWantsAttributeTableExplicitly(query)) return false
  if (/\b(sum|average|mean|total|min|max|group\s*by|median|stdev|stddev|statistics|statistic|calculate\s+field|count\s+of\b)/i.test(query))
    return false
  const explicitMapIntent = /\b(on\s+the\s+map|on\s+map|show\s+.+\bmap\b|map\s+for|fly\s+to|zoom\s+to|center\s+on|pin\b|highlight\s+on\s+the\s+map)\b/i.test(
    query,
  )
  const narrowed = lookupTokens.length > 0 || hasNumericComparison
  /** Obvious structure/plot code in the same sentence as “on map” — still narrow even if token regex misses. */
  const looseCodeTail = /\b[A-Za-z]\d{2,}[A-Za-z0-9_-]*\b/i.test(query)
  if (!narrowed) {
    if (explicitMapIntent && looseCodeTail) return true
    return false
  }
  if (explicitMapIntent) return true
  if (lookupTokens.length && /\b(find|search|show|display|where\s+is|locate|highlight|pin|zoom)\b/i.test(query)) return true
  if (
    lookupTokens.length &&
    query.trim().split(/\s+/).length <= 4 &&
    !/\b(sum|average|mean|total|min|max|group|calculate|statistics|tabular)\b/i.test(query)
  )
    return true
  return false
}

function mapFirstSelectionsFromRows(rows: ScopedFeatureRow[]): GeoAiMapFirstSelection[] {
  const out: GeoAiMapFirstSelection[] = []
  for (const r of rows) {
    const id = r.clientLayerId
    if (!id) continue
    const key = computeStableGisFeatureKey(r.rawFeature, r.featureIndex)
    if (key) out.push({ layerId: id, featureKey: key })
  }
  return out
}

const TABLE_ROW_CAP = 250

function fcFromLayer(layer: GeoAiMapLayer): { features: GeoFeature[] } | null {
  const g = layer.geojson
  if (g && g.type === 'FeatureCollection' && Array.isArray(g.features)) return { features: g.features }
  const d = layer.data as { type?: string; features?: GeoFeature[] } | undefined
  if (d && d.type === 'FeatureCollection' && Array.isArray(d.features)) return { features: d.features }
  return null
}

function collectMaskGeometries(
  maskName: string,
  layers: GeoAiMapLayer[],
): Array<{ type?: string; coordinates?: unknown }> {
  const hn = normalizeLayerName(maskName)
  const geoms: Array<{ type?: string; coordinates?: unknown }> = []
  for (const l of layers) {
    const ln = normalizeLayerName(l.name)
    if (!(ln === hn || ln.includes(hn) || hn.includes(ln))) continue
    const fc = fcFromLayer(l)
    if (!fc?.features?.length) continue
    for (const f of fc.features) {
      const g = f.geometry as { type?: string; coordinates?: unknown } | undefined
      if (g && typeof g === 'object') geoms.push(g)
    }
  }
  return geoms
}

/** “Select by location” — target scope from layer hint; mask layer name from phrase. */
function parseSelectByLocationQuery(
  query: string,
  layers: GeoAiMapLayer[],
): null | { relation: 'within' | 'intersects'; maskName: string } {
  const q = query.trim()
  if (!layers.length) return null

  const relFromQuery = (): 'within' | 'intersects' => {
    if (/\b(?:intersect|overlap)\b/i.test(q)) return 'intersects'
    return 'within'
  }

  const q1 = q.match(
    /\b(?:within|inside|intersect(?:s|ing)?|overlap)\s+(?:with\s+)?(?:the\s+)?(?:layer\s+)?["']([^"'\n]+)["']/i,
  )
  if (q1?.[1]?.trim()) return { relation: relFromQuery(), maskName: q1[1].trim() }

  const q2 = q.match(
    /\b(?:within|inside|intersect(?:s|ing)?|overlap)\s+(?:with\s+)?(?:the\s+)?(?:layer\s+)([\w][\w\s-]{1,80})/i,
  )
  if (q2?.[1]?.trim()) return { relation: relFromQuery(), maskName: q2[1].trim() }

  const ar = q.match(/(?:داخل|ضمن)\s+(?:طبقة\s+)?["']?([^"'\n;]{2,80})["']?/i)
  if (ar?.[1]?.trim()) return { relation: 'within', maskName: ar[1].trim() }

  if (/\bselect\s+by\s+location\b/i.test(q)) {
    const m =
      q.match(/\b(?:using|from|with)\s+["']?([^"'\n;]{2,80})["']?/i) ?? q.match(/\b(?:mask|boundary)\s+["']?([^"'\n;]{2,80})["']?/i)
    if (m?.[1]?.trim()) return { relation: 'within', maskName: m[1].trim() }
  }

  return null
}

function collectScope(query: string, layers: GeoAiMapLayer[]): ScopedData {
  const hint = extractGeoExplorerLayerHint(query, layers)
  let scoped = layers
  if (hint) {
    const hn = normalizeLayerName(hint)
    const subset = layers.filter(l => {
      const ln = normalizeLayerName(l.name)
      return ln === hn || ln.includes(hn) || hn.includes(ln)
    })
    if (subset.length) scoped = subset
  }

  const features: ScopedFeatureRow[] = []
  const fieldSet = new Set<string>()
  for (const l of scoped) {
    const fc = fcFromLayer(l)
    if (!fc?.features?.length) continue
    fc.features.forEach((f, featureIndex) => {
      const props = f.properties
      if (!props || typeof props !== 'object') return
      const p = props as Record<string, unknown>
      features.push({
        layerName: l.name,
        clientLayerId: l.clientLayerId,
        featureIndex,
        properties: p,
        rawFeature: f,
      })
      for (const k of Object.keys(p)) fieldSet.add(k)
    })
  }

  return { layers: scoped, features, fields: [...fieldSet] }
}

function findField(query: string, fields: string[]): string | null {
  const explicit =
    query.match(/\b(?:field|column|attribute)\s+([A-Za-z_][A-Za-z0-9_]*)\b/i)?.[1] ??
    query.match(/(?:حقل|عمود|سمة)\s+([A-Za-z_][A-Za-z0-9_]*)/i)?.[1] ??
    null
  if (explicit) {
    const f = fields.find(x => x.toLowerCase() === explicit.toLowerCase())
    if (f) return f
  }
  const q = query.toLowerCase()
  let best: string | null = null
  for (const f of fields) {
    const fl = f.toLowerCase()
    if (!fl || fl.length < 2) continue
    if (q.includes(fl) && (!best || fl.length > best.length)) best = f
  }
  return best
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.trim().replace(/,/g, ''))
    if (Number.isFinite(n)) return n
  }
  return null
}

function formatCell(v: unknown): string | number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  const s = String(v)
  return s.length > 120 ? `${s.slice(0, 117)}…` : s
}

function mapLinkFor(row: ScopedFeatureRow): GeoExplorerMapLink | undefined {
  if (row.clientLayerId) {
    return {
      type: 'feature',
      layerId: row.clientLayerId,
      featureKey: computeStableGisFeatureKey(row.rawFeature, row.featureIndex),
    }
  }
  const cen = geoAiFeatureCentroid(row.rawFeature)
  if (cen) return { type: 'coords', lng: cen[0], lat: cen[1], layerName: row.layerName }
  return undefined
}

/** Codes like MH101 or quoted fragments — narrows attribute queries without SQL. */
function extractLookupTokens(query: string): string[] {
  const tokens = new Set<string>()
  const q = query.trim()
  for (const m of q.matchAll(/\bMH\d+\b/gi)) tokens.add(m[0].toUpperCase())
  for (const m of q.matchAll(/\b[A-Z]{2,}\d{2,}[A-Z0-9-]*\b/g)) {
    const t = m[0].toUpperCase()
    if (t.length >= 4 && !/^SELECT$/i.test(t)) tokens.add(t)
  }
  /** Single letter + digits (e.g. M101, P42) — common farm/structure plot codes. */
  for (const m of q.matchAll(/\b[A-Za-z]\d{2,}[A-Za-z0-9_-]*\b/g)) {
    const t = m[0].toUpperCase()
    if (!/^SELECT$/i.test(t)) tokens.add(t)
  }
  /** Hyphenated variants (e.g. M-101). */
  for (const m of q.matchAll(/\b[A-Za-z]{1,3}-\d{2,}[A-Za-z0-9_-]*\b/gi)) {
    const t = m[0].replace(/-/g, '').toUpperCase()
    if (t.length >= 3 && !/^SELECT$/i.test(t)) tokens.add(t)
    tokens.add(m[0].toUpperCase())
  }
  for (const m of q.matchAll(/["']([^"'<>]{2,48})["']/g)) {
    const inner = m[1].trim()
    if (inner.length >= 2) tokens.add(inner)
  }
  return [...tokens]
}

function rowMatchesLookupTokens(row: ScopedFeatureRow, tokens: string[]): boolean {
  if (!tokens.length) return true
  return tokens.some(tok => {
    const tl = tok.toLowerCase()
    for (const v of Object.values(row.properties)) {
      if (v == null) continue
      const s = String(v).toLowerCase()
      if (s === tl || s.includes(tl)) return true
    }
    return false
  })
}

function pickDisplayColumns(fields: string[], max = 6): string[] {
  const prio = [
    'ZONE_ID',
    'zone_id',
    'ProjectCode',
    'projectcode',
    'Farm_Code',
    'farm_code',
    'OBJECTID',
    'objectid',
    'FID',
    'fid',
    'NAME',
    'Name',
    'name',
    'Id',
    'ID',
    'id',
  ]
  const picked: string[] = []
  for (const p of prio) {
    const hit = fields.find(x => x === p || x.toLowerCase() === p.toLowerCase())
    if (hit && !picked.includes(hit)) picked.push(hit)
  }
  for (const f of fields.sort()) {
    if (picked.length >= max) break
    if (!picked.includes(f)) picked.push(f)
  }
  return picked.slice(0, max)
}

function parseComparison(query: string, fields: string[]): Comparison | null {
  const sym = query.match(/([A-Za-z_][A-Za-z0-9_]*)\s*(>=|<=|!=|=|>|<)\s*(-?\d+(?:\.\d+)?)/)
  if (sym) {
    const field = fields.find(f => f.toLowerCase() === sym[1].toLowerCase())
    if (field) return { field, op: sym[2] as Comparison['op'], value: Number(sym[3]) }
  }

  const ar =
    query.match(/([A-Za-z_][A-Za-z0-9_]*)\s*(?:أكبر من أو يساوي|اكبر من او يساوي)\s*(-?\d+(?:\.\d+)?)/i) ??
    query.match(/([A-Za-z_][A-Za-z0-9_]*)\s*(?:أصغر من أو يساوي|اصغر من او يساوي)\s*(-?\d+(?:\.\d+)?)/i) ??
    query.match(/([A-Za-z_][A-Za-z0-9_]*)\s*(?:أكبر من|اكبر من)\s*(-?\d+(?:\.\d+)?)/i) ??
    query.match(/([A-Za-z_][A-Za-z0-9_]*)\s*(?:أصغر من|اصغر من)\s*(-?\d+(?:\.\d+)?)/i)
  if (ar) {
    const field = fields.find(f => f.toLowerCase() === ar[1].toLowerCase())
    if (!field) return null
    const raw = ar[0]
    const op: Comparison['op'] = /يساوي/i.test(raw) ? (/أصغر|اصغر/i.test(raw) ? '<=' : '>=') : /أصغر|اصغر/i.test(raw) ? '<' : '>'
    return { field, op, value: Number(ar[2]) }
  }
  return null
}

function cmp(n: number, c: Comparison): boolean {
  if (c.op === '>') return n > c.value
  if (c.op === '<') return n < c.value
  if (c.op === '>=') return n >= c.value
  if (c.op === '<=') return n <= c.value
  if (c.op === '=') return n === c.value
  return n !== c.value
}

function selectRows(scope: ScopedData, comparison: Comparison | null) {
  if (!comparison) return scope.features
  return scope.features.filter(r => {
    const n = toNumber(r.properties[comparison.field])
    if (n == null) return false
    return cmp(n, comparison)
  })
}

function safeEvalExpr(expr: string, props: Record<string, unknown>): number | null {
  const safe = expr.trim()
  if (!/^[A-Za-z0-9_+\-*/().\s]+$/.test(safe)) return null
  const replaced = safe.replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, token => {
    const n = toNumber(props[token])
    return n == null ? '0' : String(n)
  })
  try {
    const out = Function(`"use strict"; return (${replaced});`)()
    return typeof out === 'number' && Number.isFinite(out) ? out : null
  } catch {
    return null
  }
}

function queryFeaturesTable(
  selected: ScopedFeatureRow[],
  scopeFields: string[],
  title = 'Query results',
): GeoExplorerDataTablePayload {
  const priority = pickDisplayColumns(scopeFields, 7)
  const prioritySet = new Set(priority)
  const extra = scopeFields.filter(f => !prioritySet.has(f)).slice(0, 28)
  const allFieldKeys = [...priority, ...extra]
  const columns: GeoExplorerDataTablePayload['columns'] = [
    { key: 'layer', label: 'Layer', align: 'left', defaultVisible: true },
    ...allFieldKeys.map(f => ({
      key: f,
      label: f,
      align: 'left' as const,
      defaultVisible: prioritySet.has(f),
    })),
  ]
  const slice = selected.slice(0, TABLE_ROW_CAP)
  const rows: GeoExplorerDataTableRow[] = slice.map(r => {
    const values: Record<string, string | number | null> = { layer: r.layerName }
    for (const f of allFieldKeys) values[f] = formatCell(r.properties[f])
    return { values, mapLink: mapLinkFor(r) }
  })
  return {
    kind: 'query',
    title,
    columns,
    rows,
    foot:
      selected.length > TABLE_ROW_CAP
        ? {
            Summary: `Showing ${TABLE_ROW_CAP} of ${selected.length} rows`,
            Fields: `${priority.length} key columns shown by default · ${extra.length} more in “More fields”`,
          }
        : {
            Summary: `${selected.length} row(s)`,
            Fields: `${priority.length} key columns by default · ${extra.length} optional`,
          },
  }
}

export function runGeoAiStatsCommand(query: string, layers: GeoAiMapLayer[]): GeoAiStatsResult | null {
  const q = query.trim()
  if (!q) return null
  const lookupTokensEarly = extractLookupTokens(q)
  const shortCodeLookup =
    lookupTokensEarly.length > 0 &&
    q.length <= 72 &&
    q.split(/\s+/).filter(Boolean).length <= 8 &&
    !/\b(sum|average|mean|total|min|max|group\s*by)\b/i.test(q)
  const spatialSpecEarly = parseSelectByLocationQuery(q, layers)
  const sqlWhereEarly = extractWhereFromQuery(q)
  const hasSqlWhereClause = Boolean(sqlWhereEarly && hasSqlWhereIntent(q))
  const hasStatIntent =
    /\b(sum|total|average|mean|min|max|count|group\s*by|statistics|stat\b|summary|tabular|table|spreadsheet|calculate field|select|selection|query)\b/i.test(q) ||
    /\b(show\s+me|find|display|list|records|features|locate|highlight)\b/i.test(q) ||
    /(?:مجموع|اجمالي|متوسط|أكبر|اكبر|أصغر|اصغر|عدد|إحصاء|احصاء|تحليل|تحديد|استعلام|جدول|ملخص|اعرض|أظهر|اظهر|ابحث|عرض|group by|calculate field)/i.test(q) ||
    shortCodeLookup ||
    spatialSpecEarly != null ||
    hasSqlWhereClause
  if (!hasStatIntent) return null

  const scope = collectScope(q, layers)
  if (!scope.features.length) {
    return { handled: true, reply: 'No loaded layer records are available for statistical analysis right now.' }
  }

  let workingFeatures = scope.features
  const spatialSpec = spatialSpecEarly
  if (spatialSpec) {
    const maskGeoms = collectMaskGeometries(spatialSpec.maskName, layers)
    if (!maskGeoms.length) {
      return {
        handled: true,
        reply: `Select by location: no polygon/line geometries found on mask layer **${spatialSpec.maskName}**. Add or show that layer, then try again.`,
      }
    }
    const hint = extractGeoExplorerLayerHint(q, layers)
    const hintN = hint ? normalizeLayerName(hint) : ''
    const maskN = normalizeLayerName(spatialSpec.maskName)
    if (hintN && hintN === maskN && scope.layers.length < 2) {
      return {
        handled: true,
        reply:
          'Select by location needs **two different layers**: scope the target layer in your question (e.g. layer name in quotes) and name another layer as the mask/boundary.',
      }
    }
    workingFeatures = workingFeatures.filter(row =>
      spatialSpec.relation === 'within'
        ? featureWithinMask(row.rawFeature, maskGeoms)
        : featureIntersectsMask(row.rawFeature, maskGeoms),
    )
  }

  if (hasSqlWhereClause && sqlWhereEarly) {
    workingFeatures = workingFeatures.filter(r => evalWhereExpr(sqlWhereEarly, r.properties) === true)
  }

  const effectiveScope: ScopedData = { ...scope, features: workingFeatures }

  const lookupTokens = extractLookupTokens(q)
  const comparison = parseComparison(q, effectiveScope.fields)
  let selected = selectRows(effectiveScope, comparison)
  if (lookupTokens.length) {
    selected = selected.filter(r => rowMatchesLookupTokens(r, lookupTokens))
  }
  const selectedCount = selected.length
  const mapFirst =
    userWantsMapFirstLayerBrowse(q, lookupTokens, comparison != null) ||
    Boolean(spatialSpec) ||
    hasSqlWhereClause
  const mapSync = mapFirst && selectedCount > 0 ? { selections: mapFirstSelectionsFromRows(selected) } : undefined

  const calc = q.match(/calculate\s+field\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Za-z0-9_+\-*/().\s]+)/i)
  if (calc) {
    const outField = calc[1]
    const expr = calc[2]
    const pairs: Array<{ row: ScopedFeatureRow; value: number }> = []
    for (const r of selected) {
      const v = safeEvalExpr(expr, r.properties)
      if (v != null) pairs.push({ row: r, value: v })
    }
    const previewSlice = pairs.slice(0, TABLE_ROW_CAP)
    const colsPick = pickDisplayColumns(effectiveScope.fields, 4)
    const columns = [
      { key: 'row_num', label: '#', align: 'right' as const },
      { key: 'layer', label: 'Layer', align: 'left' as const },
      ...colsPick.map(c => ({ key: c, label: c, align: 'left' as const })),
      { key: 'computed', label: outField, align: 'right' as const },
    ]
    const rows: GeoExplorerDataTableRow[] = previewSlice.map((p, i) => {
      const values: Record<string, string | number | null> = {
        row_num: i + 1,
        layer: p.row.layerName,
        computed: p.value,
      }
      for (const c of colsPick) values[c] = formatCell(p.row.properties[c])
      return { values, mapLink: mapLinkFor(p.row) }
    })
    const table: GeoExplorerDataTablePayload = {
      kind: 'calculateField',
      title: `Calculate field preview (${outField})`,
      columns,
      rows,
      foot: {
        Summary: `${pairs.length}/${selectedCount} rows · ${outField} = ${expr}`,
      },
    }
    return {
      handled: true,
      reply: `Calculate Field preview (not persisted). Expression **${outField}** = \`${expr}\`. Rows evaluated: **${pairs.length}** / ${selectedCount}. Use the table for sorting, export, and map links.`,
      table,
    }
  }

  const groupByField =
    q.match(/\bgroup\s*by\s+([A-Za-z_][A-Za-z0-9_]*)/i)?.[1] ??
    q.match(/(?:حسب|تجميع حسب)\s+([A-Za-z_][A-Za-z0-9_]*)/i)?.[1] ??
    null
  if (groupByField) {
    const gb = effectiveScope.fields.find(f => f.toLowerCase() === groupByField.toLowerCase())
    if (!gb) return { handled: true, reply: `Group field "${groupByField}" was not found.` }
    const buckets = new Map<string, number>()
    for (const r of selected) {
      const k = String(r.properties[gb] ?? 'NULL')
      buckets.set(k, (buckets.get(k) ?? 0) + 1)
    }
    const sorted = [...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, TABLE_ROW_CAP)
    const rows: GeoExplorerDataTableRow[] = sorted.map(([value, count]) => ({
      values: { [gb]: value, count },
      mapLink: undefined,
    }))
    const table: GeoExplorerDataTablePayload = {
      kind: 'groupBy',
      title: `Group by ${gb}`,
      columns: [
        { key: gb, label: gb, align: 'left' },
        { key: 'count', label: 'Count', align: 'right' },
      ],
      rows,
      foot: { Summary: `${selectedCount} source rows · ${buckets.size} groups` },
    }
    return {
      handled: true,
      reply: `Group By **${gb}** over **${selectedCount}** rows (${buckets.size} groups). Interactive table below.`,
      table,
    }
  }

  const op =
    /\b(sum|total|مجموع|اجمالي)\b/i.test(q) ? 'sum' :
    /\b(average|mean|متوسط)\b/i.test(q) ? 'avg' :
    /\b(min|minimum|أصغر|اصغر|ادنى)\b/i.test(q) ? 'min' :
    /\b(max|maximum|أكبر|اكبر|اعلى)\b/i.test(q) ? 'max' :
    'count'

  const field = findField(q, effectiveScope.fields)

  if (op === 'count' && !field) {
    const whereTxt = comparison ? ` · Numeric filter: ${comparison.field} ${comparison.op} ${comparison.value}` : ''
    const tokTxt = lookupTokens.length ? ` · Codes/text: ${lookupTokens.join(', ')}` : ''
    if (!selectedCount) {
      return {
        handled: true,
        reply: `No matching records (${lookupTokens.length ? `tokens ${lookupTokens.join(', ')}` : 'current filters'}).`,
        table: mapFirst ? undefined : queryFeaturesTable([], effectiveScope.fields, 'Query results'),
      }
    }
    if (mapFirst && mapSync?.selections.length) {
      return {
        handled: true,
        reply: `Matched **${selectedCount}** record(s)${tokTxt}${whereTxt}. Map highlights synced — use **Camera** in Geo AI (Explore / Fit all / Focus first) to control zoom and popups.`,
        mapFirstSync: mapSync,
      }
    }
    const table = queryFeaturesTable(
      selected,
      effectiveScope.fields,
      lookupTokens.length ? `Matches: ${lookupTokens.join(', ')}` : 'Layer records',
    )
    const shown = Math.min(TABLE_ROW_CAP, selected.length)
    return {
      handled: true,
      reply: `**${selectedCount}** record(s)${tokTxt}${whereTxt}.\n\n• Table: sort, search, paginate, export.\n• Row click / Map column: **highlight** on the map; use **Table** in the map column to open the attribute dock.`,
      table,
    }
  }

  if (!field) {
    if (lookupTokens.length && selectedCount > 0) {
      if (mapFirst && mapSync?.selections.length) {
        return {
          handled: true,
          reply: `Found **${selectedCount}** feature(s) for **${lookupTokens.join(', ')}**. Map highlights synced — adjust **Camera** mode if you want a softer map (no forced zoom to one feature).`,
          mapFirstSync: mapSync,
        }
      }
      const table = queryFeaturesTable(selected, effectiveScope.fields, `Matches: ${lookupTokens.join(', ')}`)
      return {
        handled: true,
        reply: `Found **${selectedCount}** feature(s) for **${lookupTokens.join(', ')}**. Use the table below — row click highlights on the map; use **Table** in the map column to open the attribute dock.`,
        table,
      }
    }
    return { handled: true, reply: 'Please specify a field name for this statistical operation.' }
  }

  const nums = selected.map(r => toNumber(r.properties[field])).filter((v): v is number => v != null)
  if (!nums.length) {
    return { handled: true, reply: `No numeric values found in field "${field}" for the current selection.` }
  }
  const sum = nums.reduce((a, b) => a + b, 0)
  const avg = sum / nums.length
  const min = Math.min(...nums)
  const max = Math.max(...nums)

  const statLabel =
    op === 'sum' ? `SUM(${field})` :
    op === 'avg' ? `AVG(${field})` :
    op === 'min' ? `MIN(${field})` :
    op === 'max' ? `MAX(${field})` :
    `COUNT(${field})`

  const primaryVal =
    op === 'sum' ? sum :
    op === 'avg' ? avg :
    op === 'min' ? min :
    op === 'max' ? max :
    nums.length

  const summaryTable: GeoExplorerDataTablePayload = {
    kind: 'statistics',
    title: 'Statistics summary',
    columns: [
      { key: 'metric', label: 'Metric', align: 'left' },
      { key: 'value', label: 'Value', align: 'right' },
      { key: 'note', label: 'Note', align: 'left' },
    ],
    rows: [
      { values: { metric: statLabel, value: primaryVal, note: `${nums.length} numeric values / ${selectedCount} rows` } },
      { values: { metric: 'SUM', value: sum, note: '—' } },
      { values: { metric: 'AVG', value: avg, note: '—' } },
      { values: { metric: 'MIN', value: min, note: '—' } },
      { values: { metric: 'MAX', value: max, note: '—' } },
    ],
    foot: {
      Summary: `${field} · ${nums.length} numeric / ${selectedCount} rows${comparison ? ` · filter ${comparison.field} ${comparison.op} ${comparison.value}` : ''}`,
    },
  }

  if (op === 'sum')
    return {
      handled: true,
      reply: `**SUM(${field})** = **${sum}** (${nums.length}/${selectedCount} rows). See summary table for full statistics.`,
      table: summaryTable,
    }
  if (op === 'avg')
    return {
      handled: true,
      reply: `**AVG(${field})** = **${avg}** (${nums.length}/${selectedCount} rows). See summary table for full statistics.`,
      table: summaryTable,
    }
  if (op === 'min')
    return {
      handled: true,
      reply: `**MIN(${field})** = **${min}** (${nums.length}/${selectedCount} rows). See summary table for full statistics.`,
      table: summaryTable,
    }
  if (op === 'max')
    return {
      handled: true,
      reply: `**MAX(${field})** = **${max}** (${nums.length}/${selectedCount} rows). See summary table for full statistics.`,
      table: summaryTable,
    }

  return {
    handled: true,
    reply: `Statistics on **${field}**: COUNT=${nums.length}, SUM=${sum}, AVG=${avg}, MIN=${min}, MAX=${max}. Selection: ${selectedCount} rows.`,
    table: summaryTable,
  }
}
