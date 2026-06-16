/**
 * Layer summaries + location lookup for Geo Explorer / Geo AI (Satellite Imagery).
 * Keeps MAP_QUERY and answers aligned with Added layers + GIS Content data.
 */

import type { ArcgisLayerDefLite } from './arcgisAttributeDisplay'
import {
  buildArcFieldsByLower,
  formatFeaturePropertiesForGeoAi,
  getArcDomainForField,
} from './arcgisAttributeDisplay'
import { forEachLngLatPairInCoords } from './geoJsonCoordIterWalk'

export type GeoAiMapLayer = {
  name: string
  /** GIS Map / Satellite layer id — enables Geo AI table rows to zoom/highlight features */
  clientLayerId?: string
  visible?: boolean
  source?: string
  /** ArcGIS `?f=pjson` subset: fields, types, typeIdField — for coded-value / subtype labels in AI context */
  arcgisLayerDefinition?: ArcgisLayerDefLite | null
  /** GeoJSON FeatureCollection (Satellite custom layers) */
  geojson?: { type?: string; features?: GeoAiFeature[] } | null
  /** GIS Map / LayerData shape */
  data?: { type?: string; features?: GeoAiFeature[] } | null
}

type GeoAiFeature = {
  properties?: Record<string, unknown>
  geometry?: { type?: string; coordinates?: unknown }
}

function featureCollectionFromLayer(l: GeoAiMapLayer): { features: GeoAiFeature[] } | null {
  const g = l.geojson
  if (g && g.type === 'FeatureCollection' && Array.isArray(g.features)) return { features: g.features }
  const d = l.data as { type?: string; features?: GeoAiFeature[] } | undefined
  if (d && d.type === 'FeatureCollection' && Array.isArray(d.features)) return { features: d.features }
  return null
}

function bboxOfGeometry(geom: GeoAiFeature['geometry']): [number, number, number, number] | null {
  if (!geom) return null
  const pts: [number, number][] = []
  forEachLngLatPairInCoords((geom as { coordinates?: unknown }).coordinates, (lng, lat) => {
    pts.push([lng, lat])
  })
  if (pts.length === 0) return null
  let [minX, minY] = pts[0]
  let [maxX, maxY] = pts[0]
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = pts[i]
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return [minX, minY, maxX, maxY]
}

function featureCentroid(f: GeoAiFeature): [number, number] | null {
  const g = f.geometry
  if (!g) return null
  if (g.type === 'Point' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
    const [x, y] = g.coordinates as number[]
    if (Number.isFinite(x) && Number.isFinite(y)) return [x, y]
  }
  const b = bboxOfGeometry(g)
  if (!b) return null
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]
}

/** Public helper for Geo AI stats / tables — centroid in WGS84 [lng, lat]. */
export function geoAiFeatureCentroid(f: {
  geometry?: { type?: string; coordinates?: unknown }
  properties?: Record<string, unknown> | null
}): [number, number] | null {
  return featureCentroid(f as GeoAiFeature)
}

/** Normalized layer / hint string for matching (underscores and punctuation → spaces). */
export function normalizeLayerName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function propertyKeys(features: GeoAiFeature[], cap = 40): string[] {
  const keys = new Set<string>()
  for (const f of features.slice(0, 80)) {
    const p = f.properties
    if (p && typeof p === 'object') {
      for (const k of Object.keys(p)) keys.add(k)
      if (keys.size >= cap) break
    }
  }
  return [...keys].slice(0, cap)
}

function catalogKeyLabel(k: string): string | null {
  const n = k.replace(/\s+/g, '_')
  if (/farm.*code|^farmcode$/i.test(n)) return 'Farm_Code'
  if (/farm.*name|^farmname$/i.test(n)) return 'Farm_Name'
  if (/site.*id|plot.*id|parcel.*id/i.test(n)) return 'Site_Plot_ID'
  if (/^objectid$|^fid$/i.test(n)) return 'OBJECTID'
  if (/^globalid$/i.test(n)) return 'GlobalID'
  return null
}

function skipFieldForValueCatalog(key: string): boolean {
  const k = key.toLowerCase()
  if (/^shape|geometry|st_area|st_length|st_perimeter|shape_length|shape_area$/i.test(k)) return true
  if (k === 'objectid' || k === 'fid' || k === 'globalid') return true
  return false
}

/** Distinct values across features — canonical buckets (Farm_Code, …) plus other string fields for Geo AI. */
export function buildLayerIdValueCatalogSnippet(
  features: Array<{ properties?: Record<string, unknown> }>,
  maxChars = 2800,
): string {
  if (!Array.isArray(features) || features.length === 0) return ''

  const buckets = new Map<string, Set<string>>()
  for (const f of features) {
    const p = f.properties
    if (!p || typeof p !== 'object') continue
    for (const [k, v] of Object.entries(p)) {
      const label = catalogKeyLabel(k)
      if (!label) continue
      const s = v == null ? '' : String(v).trim()
      if (!s || s.length > 72) continue
      if (!buckets.has(label)) buckets.set(label, new Set())
      const set = buckets.get(label)!
      if (set.size >= 220) continue
      set.add(s)
    }
  }

  const parts: string[] = []
  for (const label of ['Farm_Code', 'Farm_Name', 'Site_Plot_ID', 'OBJECTID', 'GlobalID']) {
    const set = buckets.get(label)
    if (!set?.size) continue
    const vals = [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    parts.push(`${label}=[${vals.join(', ')}]`)
  }

  const fieldSets = new Map<string, Set<string>>()
  const keysSeen = new Set<string>()
  for (const f of features.slice(0, 320)) {
    const p = f.properties
    if (!p || typeof p !== 'object') continue
    for (const k of Object.keys(p)) {
      if (catalogKeyLabel(k)) continue
      if (skipFieldForValueCatalog(k)) continue
      if (k.length > 56) continue
      keysSeen.add(k)
    }
  }
  const extraKeys = [...keysSeen].sort((a, b) => a.localeCompare(b)).slice(0, 22)
  for (const key of extraKeys) {
    const set = new Set<string>()
    for (const f of features) {
      const p = f.properties
      if (!p || typeof p !== 'object') continue
      const v = p[key]
      const s = v == null ? '' : String(v).trim()
      if (!s || s.length < 2 || s.length > 80) continue
      if (set.size >= 48) break
      set.add(s)
    }
    if (set.size === 0) continue
    const vals = [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    parts.push(`${key}=[${vals.join(', ')}]`)
  }

  if (!parts.length) return ''
  let s = `Layer id catalog (${features.length} loaded features — search **all** listed fields for ids/names/codes; truncated if long): ${parts.join(' | ')}`
  if (s.length > maxChars) s = `${s.slice(0, maxChars - 24)}… [catalog truncated]`
  return s
}

/** One-line + sample for prompts (GIS-style). */
export function summarizeGeoAiMapLayer(l: GeoAiMapLayer, maxSampleChars = 400): string {
  const fc = featureCollectionFromLayer(l)
  const n = fc?.features?.length ?? 0
  const fields = fc?.features?.length ? propertyKeys(fc.features).join(', ') : '—'
  let sample = ''
  const first = fc?.features?.[0]
  const arcDef = l.arcgisLayerDefinition ?? null
  if (first?.properties && typeof first.properties === 'object') {
    const shown = arcDef
      ? formatFeaturePropertiesForGeoAi(first.properties as Record<string, unknown>, first, arcDef)
      : first.properties
    const label = arcDef ? 'example attributes (domain/subtype descriptions)' : 'example attributes'
    sample = ` | ${label}: ${JSON.stringify(shown).slice(0, maxSampleChars)}`
  }
  if (fc?.features?.length) {
    const cat = buildLayerIdValueCatalogSnippet(fc.features, 2600)
    if (cat) sample += ` | ${cat}`
  }
  const vis = l.visible === false ? 'hidden' : 'visible'
  return `- ${l.name} (features=${n}, ${vis}, source=${l.source ?? 'n/a'}) fields=[${fields || '—'}]${sample}`
}

export function summarizeGeoAiMapLayers(layers: GeoAiMapLayer[], maxChars = 28000): string {
  const lines: string[] = []
  for (const l of layers) {
    const fc = featureCollectionFromLayer(l)
    if (!fc?.features?.length) continue
    const base = summarizeGeoAiMapLayer(l)
    lines.push(l.visible === false ? `${base} [layer toggled off on map — data still listed for AI]` : base)
  }
  if (lines.length === 0) return '(no vector features in visible layers for this session.)'
  let out = lines.join('\n')
  if (out.length > maxChars) out = `${out.slice(0, maxChars)}\n[…truncated…]`
  return out
}

const LAYER_HINT_FROM_QUOTED = /(?:from|in|on)\s+["']([^"']{2,120})["']/i
/** Single path-like token after from/in/on (no greedy spaces — avoids swallowing "show … NH-23"). */
const LAYER_HINT_FROM_TOKEN = /(?:from|in|on)\s+([\w.\u0600-\u06FF-]{2,80})(?=$|\s+(?:show|tell|give|list|find|where|display|please|with|for|and|about|near|around|having|map|fly|zoom|pin)\b|[,;])/i
const LAYER_HINT_TAIL = /\b['"]?([\w][\w\s\-_]{1,62})['"]?\s+layer\b/i
const LAYER_HINT_AR = /طبقة\s+['"]?([\w\s\-_\u0600-\u06FF]{2,64})['"]?/i

/**
 * Layer name after "from / in / on …" for scoping Geo AI to one layer.
 * When `layers` is passed, prefers the longest actual layer name that prefixes the text after the preposition
 * (fixes greedy `[\w\s…]+` capturing "Agro_Structures show Nethouse…").
 */
export function extractGeoExplorerLayerHint(userText: string, layers?: readonly GeoAiMapLayer[]): string | null {
  const t = userText.trim()
  if (layers?.length) {
    const rel = t.match(/\b(?:from|in|on)\s+/i)
    if (rel && rel.index !== undefined) {
      let after = t.slice(rel.index + rel[0].length).trimStart()
      const qm = after.match(/^["']([^"']{2,120})["']/)
      if (qm?.[1]) {
        const inner = qm[1].trim()
        if (layers.some(l => l.name.toLowerCase() === inner.toLowerCase())) return inner
      }
      const names = [...layers].map(l => l.name).filter(n => n.length >= 2)
      names.sort((a, b) => b.length - a.length)
      const lowerAfter = after.toLowerCase()
      for (const name of names) {
        const ln = name.toLowerCase()
        if (lowerAfter.startsWith(ln)) {
          const rest = after.slice(name.length)
          if (rest.length === 0 || /^[\s,;:.]/.test(rest)) return name
        }
      }
    }
  }
  const mq = t.match(LAYER_HINT_FROM_QUOTED)
  if (mq?.[1]) return mq[1].trim()
  const m1 = t.match(LAYER_HINT_FROM_TOKEN)
  if (m1?.[1]) return m1[1].trim()
  const m2 = t.match(LAYER_HINT_TAIL)
  if (m2?.[1]) {
    const w = m2[1].trim().toLowerCase()
    if (!/^(the|a|an|this|that|my|your|our)$/i.test(w)) return m2[1].trim()
  }
  const m3 = t.match(LAYER_HINT_AR)
  if (m3?.[1]) return m3[1].trim()
  return null
}

function layersWhoseNameAppearsInQuery(userText: string, layers: GeoAiMapLayer[]): GeoAiMapLayer[] | null {
  const normBlob = normalizeLayerName(userText).replace(/_/g, ' ')
  const hits: GeoAiMapLayer[] = []
  for (const layer of layers) {
    const ln = normalizeLayerName(layer.name).replace(/_/g, ' ')
    if (ln.length < 3) continue
    if (normBlob.includes(ln)) hits.push(layer)
  }
  if (hits.length === 0) return null
  if (hits.length === 1) return hits
  hits.sort((a, b) => normalizeLayerName(b.name).length - normalizeLayerName(a.name).length)
  return [hits[0]]
}

function extractLayerHint(userText: string, layers?: readonly GeoAiMapLayer[]): string | null {
  return extractGeoExplorerLayerHint(userText, layers)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripLayerReferencePrefixForSearch(userText: string, layers?: readonly GeoAiMapLayer[]): string {
  let s = userText
  const hint = extractGeoExplorerLayerHint(userText, layers)
  if (hint) {
    const e = escapeRegExp(hint)
    s = s.replace(new RegExp(`\\b(?:from|in|on)\\s+(?:["']${e}["']|${e})\\b`, 'i'), ' ')
  }
  s = s.replace(LAYER_HINT_FROM_QUOTED, ' ').replace(LAYER_HINT_FROM_TOKEN, ' ')
  s = s.replace(LAYER_HINT_TAIL, ' ').replace(LAYER_HINT_AR, ' ')
  return s
}

function tokenAppearsAsWordInBlob(blob: string, tok: string): boolean {
  if (!tok || tok.length < 2) return false
  try {
    return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(tok)}(?:[^a-z0-9]|$)`, 'i').test(blob)
  } catch {
    return false
  }
}

function tokenizeForSearch(userText: string, layers?: readonly GeoAiMapLayer[]): string[] {
  let s = stripLayerReferencePrefixForSearch(userText, layers)
  const fillers =
    /\b(show|me|describe|display|visualize|visualise|highlight|outline|plot|draw|bring|pull|open|list|tell|give|put|want|need|locate|identify|select|pick|export|table|in|map|location|locaion|the|a|an|on|at|for|from|to|of|layer|layers|please|find|where|is|are|point|pin|fly|zoom|center|goto|go|can\s+you|could\s+you|would\s+you|help\s+me)\b/gi
  s = s.replace(fillers, ' ')
  const raw = s
    .split(/[^\w\-./]+/)
    .map(x => x.trim())
    .filter(Boolean)
  const tokens = new Set<string>()
  for (const t of raw) {
    if (t.length >= 2) tokens.add(t)
    const compact = t.replace(/\s+/g, '')
    if (compact.length >= 2) tokens.add(compact)
  }
  return [...tokens].sort((a, b) => b.length - a.length)
}

function propsSearchBlob(f: GeoAiFeature): string {
  try {
    return JSON.stringify(f.properties ?? {}).toLowerCase()
  } catch {
    return ''
  }
}

/** Minimum attribute-match score before we move the map pin to a layer feature (reduces wrong locations). */
export const GEO_EXPLORER_MIN_LAYER_PIN_SCORE = 34

export type LayerQueryMatch = {
  lng: number
  lat: number
  layerName: string
  matchSummary: string
  score: number
  /** Raw feature properties for map popup / UI. */
  properties: Record<string, unknown> | null
  arcgisLayerDefinition: ArcgisLayerDefLite | null
}

/** Options for {@link buildGeoAiLayerPopupAttributeRows}. */
export type BuildGeoAiLayerPopupRowsOptions = {
  maxRows?: number
  /** Last Geo AI user message: popup lists fields that match the question (labels, aliases, values). */
  queryContext?: string | null
  /** Drop lat/lon columns that duplicate the map inspect anchor. */
  inspectCoords?: { lng: number; lat: number }
}

const POPUP_QUERY_STOPWORDS = new Set(
  [
    'the',
    'a',
    'an',
    'and',
    'or',
    'to',
    'of',
    'in',
    'on',
    'at',
    'for',
    'from',
    'with',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'by',
    'as',
    'it',
    'this',
    'that',
    'these',
    'those',
    'what',
    'which',
    'who',
    'how',
    'when',
    'where',
    'why',
    'can',
    'could',
    'would',
    'should',
    'please',
    'show',
    'tell',
    'give',
    'list',
    'me',
    'my',
    'we',
    'our',
    'your',
    'map',
    'layer',
    'layers',
    'data',
    'row',
    'rows',
    'field',
    'fields',
    'attribute',
    'attributes',
    'table',
    'popup',
    'pin',
    'point',
    'click',
    'select',
    'just',
    'need',
    'want',
    'about',
    'into',
    'onto',
    'also',
    'then',
    'than',
    'there',
    'here',
    'does',
    'did',
    'do',
    'get',
    'got',
  ].map(s => s.toLowerCase()),
)

function normalizePopupRowOptions(
  options?: number | BuildGeoAiLayerPopupRowsOptions | null,
): BuildGeoAiLayerPopupRowsOptions {
  if (typeof options === 'number') return { maxRows: options }
  return options && typeof options === 'object' ? { ...options } : {}
}

function tokenizeGeoAiPopupQuery(q: string): string[] {
  const s = String(q || '')
    .toLowerCase()
    .split(/[^a-z0-9_\u0600-\u06ff]+/)
    .map(x => x.trim())
    .filter(x => x.length >= 2 && x.length <= 64 && !POPUP_QUERY_STOPWORDS.has(x))
  return [...new Set(s)]
}

function fieldAliasFromArc(arc: ArcgisLayerDefLite | null, fieldName: string): string {
  if (!arc || !Array.isArray(arc.fields)) return ''
  const f = arc.fields.find(
    (x: any) => typeof x?.name === 'string' && String(x.name).toLowerCase() === String(fieldName).toLowerCase(),
  ) as { alias?: string } | undefined
  return typeof f?.alias === 'string' && f.alias.trim() ? f.alias.trim() : ''
}

function isRedundantAnchorCoordField(key: string, val: unknown, anchor?: { lng: number; lat: number }): boolean {
  if (!anchor) return false
  const k = String(key)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  const n = typeof val === 'number' ? val : typeof val === 'string' && val.trim() !== '' ? Number(val) : NaN
  if (!Number.isFinite(n)) return false
  const latKeys = /(^|_)(lat|latitude|northing)(_|$)/.test(k) || k === 'y'
  const lngKeys = /(^|_)(lon|lng|long|longitude|easting)(_|$)/.test(k) || k === 'x'
  if (latKeys) return Math.abs(n - anchor.lat) < 1e-4
  if (lngKeys) return Math.abs(n - anchor.lng) < 1e-4
  return false
}

function scoreFieldAgainstQuery(fieldKey: string, alias: string, displayVal: string, tokens: string[]): number {
  if (!tokens.length) return 0
  const fk = fieldKey.toLowerCase()
  const al = alias.toLowerCase()
  const dv = displayVal.toLowerCase()
  let score = 0
  for (const tok of tokens) {
    if (!tok) continue
    if (fk.includes(tok) || tok.includes(fk)) score += 4
    if (al && (al.includes(tok) || tok.includes(al))) score += 4
    if (dv.includes(tok)) score += 6
  }
  return score
}

function pickCompactPopupFieldKeys(
  props: Record<string, unknown>,
  arc: ArcgisLayerDefLite | null,
  maxKeys: number,
): string[] {
  const keys = Object.keys(props).filter(k => k && !k.startsWith('mapbox_'))
  if (!keys.length) return []
  const out: string[] = []
  const seen = new Set<string>()
  const push = (k: string) => {
    if (!k || seen.has(k) || !keys.includes(k)) return
    out.push(k)
    seen.add(k)
  }
  const preferred = [
    'Farm_Name',
    'farm_name',
    'NAME',
    'Name',
    'Project_Code',
    'ProjectCode',
    'SITE_NAME',
    'Site_Name',
    'OBJECTID',
    'ObjectId',
    'objectid',
    'FID',
    'fid',
    'GlobalID',
    'globalid',
  ]
  for (const k of preferred) {
    if (out.length >= maxKeys) return out
    push(k)
  }
  if (arc?.typeIdField) {
    if (out.length >= maxKeys) return out
    push(String(arc.typeIdField))
  }
  const ft = { properties: props }
  const fl = buildArcFieldsByLower(arc)
  const codedFields = keys
    .filter(k => {
      if (seen.has(k)) return false
      const dom = arc ? getArcDomainForField(ft, k, arc, fl) : null
      return dom?.type === 'codedValue' && Array.isArray(dom.codedValues) && dom.codedValues.length
    })
    .sort((a, b) => a.localeCompare(b))
  for (const k of codedFields) {
    if (out.length >= maxKeys) break
    push(k)
  }
  if (out.length === 0) {
    return keys.sort((a, b) => a.localeCompare(b)).slice(0, Math.min(5, maxKeys))
  }
  return out.slice(0, maxKeys)
}

function selectGeoAiPopupFieldKeysForContext(
  props: Record<string, unknown>,
  arc: ArcgisLayerDefLite | null,
  displayed: Record<string, string>,
  query: string | null | undefined,
  maxRows: number,
  inspectCoords?: { lng: number; lat: number },
): string[] {
  const allKeys = Object.keys(props).filter(k => k && !k.startsWith('mapbox_'))
  const tokens = query?.trim() ? tokenizeGeoAiPopupQuery(query) : []
  const passAnchor = (k: string) => !isRedundantAnchorCoordField(k, props[k], inspectCoords)

  if (tokens.length) {
    const scored = allKeys
      .filter(passAnchor)
      .map(k => ({
        k,
        s: scoreFieldAgainstQuery(k, fieldAliasFromArc(arc, k), displayed[k] ?? '', tokens),
      }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s || a.k.localeCompare(b.k))
    if (scored.length) return scored.map(x => x.k).slice(0, maxRows)
  }

  const compact = pickCompactPopupFieldKeys(props, arc, maxRows).filter(passAnchor)
  if (compact.length) return compact.slice(0, maxRows)
  return allKeys.filter(passAnchor).sort((a, b) => a.localeCompare(b)).slice(0, Math.min(6, maxRows))
}

/**
 * Table rows for Geo AI inspect popup: domain/subtype labels when ArcGIS def is present;
 * fields filtered by chat query when provided, otherwise a compact schema-driven subset (not all columns).
 */
export function buildGeoAiLayerPopupAttributeRows(
  hit: Pick<LayerQueryMatch, 'properties' | 'arcgisLayerDefinition'>,
  options?: number | BuildGeoAiLayerPopupRowsOptions | null,
): { label: string; value: string }[] {
  const opts = normalizePopupRowOptions(options)
  const maxRows = typeof opts.maxRows === 'number' && opts.maxRows > 0 ? opts.maxRows : 26
  const p = hit.properties
  if (!p || typeof p !== 'object') return []
  const arc = hit.arcgisLayerDefinition
  const ft = { properties: p as Record<string, unknown> }
  const displayed: Record<string, string> =
    arc && Object.keys(p).length
      ? formatFeaturePropertiesForGeoAi(p as Record<string, unknown>, ft, arc)
      : Object.fromEntries(
          Object.entries(p).map(([k, v]) => [k, v === null || v === undefined ? '—' : String(v)]),
        )
  const keys = selectGeoAiPopupFieldKeysForContext(
    p as Record<string, unknown>,
    arc,
    displayed,
    opts.queryContext ?? null,
    maxRows,
    opts.inspectCoords,
  )
  return keys.map(label => {
    const raw = displayed[label]
    const v = typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw)
    return { label, value: v || '—' }
  })
}

/** One attribute row for popup / configuration (stable field key + display label). */
export type GeoAiPopupAttrRow = { key: string; label: string; value: string }

/**
 * All attribute rows (up to max) for popup configuration and “show everything” panels.
 * Unlike {@link buildGeoAiLayerPopupAttributeRows}, does not trim to a query-compact subset.
 */
export function buildGeoAiLayerPopupAllAttributeRows(
  hit: Pick<LayerQueryMatch, 'properties' | 'arcgisLayerDefinition'>,
  options?: { maxRows?: number; inspectCoords?: { lng: number; lat: number } },
): GeoAiPopupAttrRow[] {
  const cap = Math.min(600, Math.max(4, options?.maxRows ?? 320))
  const p = hit.properties
  if (!p || typeof p !== 'object') return []
  const arc = hit.arcgisLayerDefinition
  const ft = { properties: p as Record<string, unknown> }
  const displayed: Record<string, string> =
    arc && Object.keys(p).length
      ? formatFeaturePropertiesForGeoAi(p as Record<string, unknown>, ft, arc)
      : Object.fromEntries(
          Object.entries(p).map(([k, v]) => [k, v === null || v === undefined ? '—' : String(v)]),
        )
  const allKeys = Object.keys(p).filter(k => k && !k.startsWith('mapbox_'))
  const passAnchor = (k: string) =>
    !isRedundantAnchorCoordField(k, (p as Record<string, unknown>)[k], options?.inspectCoords)
  const keys = allKeys.filter(passAnchor).sort((a, b) => a.localeCompare(b)).slice(0, cap)
  return keys.map(key => {
    const alias = fieldAliasFromArc(arc, key)
    const raw = displayed[key]
    const v = typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw)
    return { key, label: (alias && alias.trim()) || key, value: v || '—' }
  })
}

/** Human-readable area / country hints from feature attributes (Geo AI map card header). */
export function pickGeoAiHumanPlaceFields(
  props: Record<string, unknown> | null | undefined,
): { areaName?: string; country?: string } {
  if (!props || typeof props !== 'object') return {}
  const str = (k: string) => {
    const v = props[k]
    if (v == null) return ''
    const s = String(v).trim()
    if (!s || /^null$/i.test(s)) return ''
    return s
  }
  const areaName =
    str('Farm_Name') ||
    str('AREA_NAME') ||
    str('Area_Name') ||
    str('area_name') ||
    str('NAME') ||
    str('Name') ||
    str('Site_Name') ||
    str('site_name') ||
    str('Location') ||
    str('location') ||
    str('Farm_Code') ||
    undefined
  let country =
    str('Country_Name') ||
    str('country_name') ||
    str('COUNTRY_NAME') ||
    str('Nation') ||
    str('Country') ||
    str('country') ||
    undefined
  if (country && /^\d+$/.test(country)) country = undefined
  return {
    ...(areaName ? { areaName } : {}),
    ...(country ? { country } : {}),
  }
}

function keyPriorityForExactAttributeMatch(key: string): number {
  const k = key.toLowerCase().replace(/\s+/g, '_')
  if (k.includes('farm') && k.includes('code')) return 0
  if (k.includes('farm') && (k.includes('name') || k.endsWith('_name'))) return 1
  if (k === 'objectid' || k === 'fid' || k.endsWith('_id')) return 2
  if (k.includes('site') || k.includes('plot') || k.includes('parcel')) return 3
  return 8
}

/**
 * Case-insensitive **full value** match on any attribute (e.g. user sends "MH105" and Farm_Code === "MH105").
 * Runs before fuzzy substring scoring so short codes pin and answer correctly.
 */
export function findExactLayerAttributeMatchInLayers(userText: string, layers: GeoAiMapLayer[]): LayerQueryMatch | null {
  const tokens = [...new Set(tokenizeForSearch(userText, layers))]
    .map(t => t.trim())
    .filter(t => t.length >= 3 && t.length <= 64)
  if (!tokens.length) return null

  const noise = /^(the|map|maps|layer|layers|show|find|where|gps|geo|json|data|row|rows)$/i
  const candidates = tokens.filter(t => !noise.test(t)).sort((a, b) => b.length - a.length)
  if (!candidates.length) return null

  let best: LayerQueryMatch | null = null
  let bestRank = Number.POSITIVE_INFINITY

  for (const layer of layers) {
    const fc = featureCollectionFromLayer(layer)
    if (!fc?.features?.length) continue
    for (const f of fc.features) {
      const p = f.properties
      if (!p || typeof p !== 'object') continue
      for (const tok of candidates) {
        const tl = tok.toLowerCase()
        let hitKey = ''
        let hitPri = 999
        for (const [key, val] of Object.entries(p)) {
          if (val == null) continue
          const vs = String(val).trim()
          if (!vs) continue
          if (vs.toLowerCase() !== tl) continue
          const pri = keyPriorityForExactAttributeMatch(key)
          if (pri < hitPri) {
            hitPri = pri
            hitKey = key
          }
        }
        if (!hitKey) continue
        const rank = hitPri * 10 + (100 - Math.min(tl.length, 40))
        const c = featureCentroid(f)
        if (!c) continue
        const arcDef = layer.arcgisLayerDefinition ?? null
        const fullprops = { ...(p as Record<string, unknown>) }
        const summary = JSON.stringify(
          arcDef ? formatFeaturePropertiesForGeoAi(fullprops, f, arcDef) : fullprops,
        ).slice(0, 4800)
        const cand: LayerQueryMatch = {
          lng: c[0],
          lat: c[1],
          layerName: layer.name,
          matchSummary: summary,
          score: 120 - hitPri,
          properties: fullprops,
          arcgisLayerDefinition: arcDef,
        }
        if (!best || rank < bestRank || (rank === bestRank && cand.score > best.score)) {
          best = cand
          bestRank = rank
        }
      }
    }
  }
  return best
}

function scoreSubstringTokenInValue(tok: string, key: string, vs: string): number {
  const tl = tok.toLowerCase()
  const vl = vs.toLowerCase()
  if (!vl.includes(tl)) return 0
  if (tl.length <= 3 && vl.length > tl.length + 28) return 0
  let sc = 44 + Math.min(tl.length, 20) * 2
  if (vl === tl) sc += 26
  else if (tokenAppearsAsWordInBlob(vl, tl)) sc += 16
  sc -= keyPriorityForExactAttributeMatch(key) * 2
  return sc
}

/** Value contains token (not only full-string equality) — e.g. "NH-23" inside Structure_Name or composite labels. */
function findBestSubstringAttributeLayerMatch(userText: string, layers: GeoAiMapLayer[]): LayerQueryMatch | null {
  const hint = extractLayerHint(userText, layers)
  const hintNorm = hint ? normalizeLayerName(hint) : ''
  const nameScoped = !hintNorm ? layersWhoseNameAppearsInQuery(userText, layers) : null
  const rawTokens = tokenizeForSearch(userText, layers)
  const noise = /^(the|map|maps|layer|layers|show|find|where|gps|geo|json|data|row|rows|please)$/i
  const candidates = [...new Set(rawTokens)]
    .filter(t => t.length >= 3 && t.length <= 64 && !noise.test(t))
    .sort((a, b) => b.length - a.length)
  if (!candidates.length) return null

  let best: LayerQueryMatch | null = null

  for (const layer of layers) {
    const fc = featureCollectionFromLayer(layer)
    if (!fc?.features?.length) continue
    const lname = normalizeLayerName(layer.name)
    if (!hintNorm && nameScoped?.length && !nameScoped.some(sl => sl.name === layer.name)) continue
    if (hintNorm) {
      const hinted =
        lname.includes(hintNorm) ||
        hintNorm.includes(lname) ||
        normalizeLayerName(layer.name.replace(/_/g, ' ')).includes(hintNorm)
      if (!hinted) continue
    }

    for (const f of fc.features) {
      const p = f.properties
      if (!p || typeof p !== 'object') continue
      let localBest = 0
      for (const tok of candidates) {
        for (const [key, val] of Object.entries(p)) {
          if (val == null) continue
          const vs = String(val).trim()
          if (vs.length < 2) continue
          const sc = scoreSubstringTokenInValue(tok, key, vs)
          if (sc > localBest) localBest = sc
        }
      }
      if (localBest < 38) continue
      const c = featureCentroid(f)
      if (!c) continue
      const arcDef = layer.arcgisLayerDefinition ?? null
      const fullprops = { ...(p as Record<string, unknown>) }
      const summary = JSON.stringify(
        arcDef ? formatFeaturePropertiesForGeoAi(fullprops, f, arcDef) : fullprops,
      ).slice(0, 4800)
      const cand: LayerQueryMatch = {
        lng: c[0],
        lat: c[1],
        layerName: layer.name,
        matchSummary: summary,
        score: localBest,
        properties: fullprops,
        arcgisLayerDefinition: arcDef,
      }
      if (!best || cand.score > best.score) best = cand
    }
  }
  return best
}

/**
 * Best-effort: find a feature whose attributes match the user's text (e.g. NH-101 in Agro_Structures).
 */
export function findLngLatFromLayerQuery(userText: string, layers: GeoAiMapLayer[]): LayerQueryMatch | null {
  const exact = findExactLayerAttributeMatchInLayers(userText, layers)
  if (exact) return exact

  const sub = findBestSubstringAttributeLayerMatch(userText, layers)
  if (sub) return sub

  const hint = extractLayerHint(userText, layers)
  const hintNorm = hint ? normalizeLayerName(hint) : ''
  const tokens = tokenizeForSearch(userText, layers)
  if (tokens.length === 0 && !hintNorm) return null

  let best: LayerQueryMatch | null = null

  const nameScoped = !hintNorm ? layersWhoseNameAppearsInQuery(userText, layers) : null

  for (const layer of layers) {
    const fc = featureCollectionFromLayer(layer)
    if (!fc?.features?.length) continue
    const lname = normalizeLayerName(layer.name)
    if (!hintNorm && nameScoped?.length && !nameScoped.some(sl => sl.name === layer.name)) continue
    if (hintNorm) {
      const hinted =
        lname.includes(hintNorm) ||
        hintNorm.includes(lname) ||
        normalizeLayerName(layer.name.replace(/_/g, ' ')).includes(hintNorm)
      if (!hinted) continue
    }

    for (const f of fc.features) {
      const blob = propsSearchBlob(f)
      if (!blob) continue
      let score = 0
      for (const tok of tokens) {
        const t = tok.toLowerCase()
        if (t.length < 2) continue
        if (!blob.includes(t)) continue
        let pts = t.length * 4
        if (tokenAppearsAsWordInBlob(blob, t)) pts += 28
        if (/^[a-z]{0,4}\d{2,8}[-_]?[a-z0-9]*$/i.test(tok) && tokenAppearsAsWordInBlob(blob, t)) pts += 36
        score += pts
      }
      if (hintNorm) score += 12
      if (score <= 0) continue
      const c = featureCentroid(f)
      if (!c) continue
      const [lng, lat] = c
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
      const arcDef = layer.arcgisLayerDefinition ?? null
      const summary =
        f.properties && typeof f.properties === 'object' && Object.keys(f.properties).length
          ? JSON.stringify(
              arcDef
                ? formatFeaturePropertiesForGeoAi(f.properties as Record<string, unknown>, f, arcDef)
                : f.properties,
            ).slice(0, 220)
          : 'geometry match'
      if (!best || score > best.score) {
        best = {
          lng,
          lat,
          layerName: layer.name,
          matchSummary: summary,
          score,
          properties:
            f.properties && typeof f.properties === 'object'
              ? { ...(f.properties as Record<string, unknown>) }
              : null,
          arcgisLayerDefinition: arcDef,
        }
      }
    }
  }

  return best
}

/**
 * GIS-style lookup: optionally constrain to one layer by name, then score features against `userQuery`
 * (same scoring stack as {@link findLngLatFromLayerQuery}).
 * Intent: `GIS.getLayer(layerName).find(userQuery)` when `layerName` matches a loaded layer; otherwise searches all layers.
 */
export function findLayerFeatureByUserQuery(
  userQuery: string,
  layers: GeoAiMapLayer[],
  layerName?: string | null,
): LayerQueryMatch | null {
  const rawName = layerName?.trim()
  if (!rawName) return findLngLatFromLayerQuery(userQuery, layers)
  const hn = normalizeLayerName(rawName)
  const subset = layers.filter(l => {
    const ln = normalizeLayerName(l.name)
    const lnSp = normalizeLayerName(l.name.replace(/_/g, ' '))
    return (
      l.name.toLowerCase() === rawName.toLowerCase() ||
      ln === hn ||
      ln.includes(hn) ||
      hn.includes(ln) ||
      lnSp.includes(hn) ||
      hn.includes(lnSp)
    )
  })
  if (subset.length === 0) return null
  return findLngLatFromLayerQuery(userQuery, subset)
}

/** True if the message mentions any loaded layer name (substring match). */
function userTextMentionsAnyLoadedLayer(userText: string, layers: GeoAiMapLayer[]): boolean {
  return Boolean(layersWhoseNameAppearsInQuery(userText, layers)?.length)
}

/** Codes / asset ids common in ag layers (e.g. NH-23, MH105, GH-02) — not bare years. */
function textContainsLikelyFeatureOrAssetId(userText: string): boolean {
  return (
    /\b[A-Za-z]{1,5}\d{2,6}(?:[-_/][A-Za-z0-9]{1,12})?\b/.test(userText) ||
    /\b\d{2,4}-\d{2,4}\b/.test(userText)
  )
}

/**
 * True when the user is asking about GIS layers / fields / stats (must be answered from layer context first;
 * do not geocode or MAP_QUERY to an unrelated world place when there is no strong layer match).
 * Hint-only patterns like "in Paris" are ignored unless the hint matches an actual layer name.
 */
export function isGisDataScopedQuestion(userText: string, layers: GeoAiMapLayer[]): boolean {
  const t = userText.trim()
  if (!t) return false
  const hasVectorData = layers.some(l => {
    const fc = featureCollectionFromLayer(l)
    return Boolean(fc?.features?.length)
  })
  if (hasVectorData && userTextMentionsAnyLoadedLayer(t, layers)) return true

  const vizVerb =
    /\b(show|describe|display|visualize|visualise|highlight|find|locate|identify|pin|zoom|fly|plot|put|open|bring|pull|list|export)\b/i.test(
      t,
    )
  /** Intent + asset-like token (e.g. NH-23) — avoids treating “describe Paris on the map” as layer-only. */
  if (hasVectorData && vizVerb && textContainsLikelyFeatureOrAssetId(t)) return true

  const KW =
    /\b(layers?|layer|field|fields|attribute|attributes|properties|features?|feature|polygon|polygons|parcel|parcels|plot|plots|geojson|shapefile|kml|kmz|how\s+many|count\b|counts|average|mean|median|min|max|sum|total|distribution|statistics|stats|percentage|proportion|tabular|records?|rows?)\b/i
  const AR = /طبقة|طبقات|حقول|حقل|سمات|خصائص|مضلع|عناصر|عدد|إحصاء|تحليل|إحصائي|البيانات\s+في|على\s+الخريطة|في\s+الخريطة/i
  if (KW.test(t) || AR.test(t)) return true
  const hint = extractGeoExplorerLayerHint(t, layers)
  if (!hint) return false
  const norm = normalizeLayerName(hint).replace(/_/g, ' ')
  if (norm.length < 3) return false
  for (const l of layers) {
    const ln = normalizeLayerName(l.name).replace(/_/g, ' ')
    if (ln.length < 3) continue
    if (ln.includes(norm) || norm.includes(ln)) return true
  }
  return false
}

/** When no strong layer match, still allow Mapbox geocode for clear world-geography / weather / routing asks. */
export function allowsGeocodeWhenNoStrongLayerHit(userText: string, layers: GeoAiMapLayer[]): boolean {
  if (!isGisDataScopedQuestion(userText, layers)) return true
  const s = userText.toLowerCase()
  if (/\b(weather|forecast|temperature|humidity|precipitation|rain|snow|wind(\s+speed)?)\b/.test(s)) return true
  if (/\b(directions?|navigate|routing|route\s+to|route\s+from|drive\s+to|walking\s+to)\b/.test(s)) return true
  if (/\b(capital of|population of|time\s*zone|timezone|utc\s*offset)\b/.test(s)) return true
  if (/^(where\s+is|where's|what\s+country|what\s+city)\b/i.test(s) && !extractGeoExplorerLayerHint(userText, layers))
    return true
  if (/أين\s+تقع|الطقس|درجة\s+الحرارة|الاتجاهات|طريق\s+إلى/i.test(userText)) return true
  return false
}
