import { computeStableGisFeatureKey } from '../gisFeatureStableKey'
import { evalWhereExpr } from '../geoAiSqlWhere'
import type { GisAttributeClause, GisSelectionHit, GisSelectionLayerSource } from './types'

type GeoFeature = {
  id?: unknown
  properties?: Record<string, unknown>
  geometry?: unknown
}

function evalClause(props: Record<string, unknown>, clause: GisAttributeClause): boolean {
  const raw = props[clause.field]
  const left = raw === null || raw === undefined ? '' : raw
  const op = clause.operator

  if (op === 'LIKE') {
    const pattern = String(clause.value).replace(/%/g, '.*').replace(/_/g, '.')
    return new RegExp(`^${pattern}$`, 'i').test(String(left))
  }

  if (op === 'IN') {
    const items = String(clause.value)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    return items.some(v => String(left) === v)
  }

  if (op === 'BETWEEN') {
    const n = Number(left)
    const a = Number(clause.value)
    const b = Number(clause.value2)
    return Number.isFinite(n) && Number.isFinite(a) && Number.isFinite(b) && n >= a && n <= b
  }

  const ln = Number(left)
  const rn = Number(clause.value)
  if (Number.isFinite(ln) && Number.isFinite(rn)) {
    if (op === '=') return ln === rn
    if (op === '!=') return ln !== rn
    if (op === '>') return ln > rn
    if (op === '<') return ln < rn
    if (op === '>=') return ln >= rn
    if (op === '<=') return ln <= rn
  }

  const ls = String(left)
  const rs = String(clause.value)
  if (op === '=') return ls === rs
  if (op === '!=') return ls !== rs
  return false
}

export function selectFeaturesByAttributes(
  layers: GisSelectionLayerSource[],
  selectableLayerIds: Set<string>,
  clauses: GisAttributeClause[],
  matchAll = true,
): GisSelectionHit[] {
  const hits: GisSelectionHit[] = []
  const seen = new Set<string>()

  for (const layer of layers) {
    if (!selectableLayerIds.has(String(layer.id))) continue
    const arr = layer.geojson?.features
    if (!Array.isArray(arr)) continue
    for (let i = 0; i < arr.length; i++) {
      const f = arr[i] as GeoFeature
      const props = (f.properties && typeof f.properties === 'object' ? f.properties : {}) as Record<string, unknown>
      const ok = matchAll
        ? clauses.every(c => evalClause(props, c))
        : clauses.some(c => evalClause(props, c))
      if (!ok) continue
      const featureKey = computeStableGisFeatureKey(f, i)
      const k = `${layer.id}::${featureKey}`
      if (seen.has(k)) continue
      seen.add(k)
      hits.push({
        layerId: String(layer.id),
        featureKey,
        layerName: layer.name,
        properties: props,
      })
    }
  }
  return hits
}

export function selectFeaturesBySqlExpression(
  layers: GisSelectionLayerSource[],
  selectableLayerIds: Set<string>,
  expression: string,
): GisSelectionHit[] {
  const hits: GisSelectionHit[] = []
  const seen = new Set<string>()
  const expr = expression.trim()
  if (!expr) return hits

  for (const layer of layers) {
    if (!selectableLayerIds.has(String(layer.id))) continue
    const arr = layer.geojson?.features
    if (!Array.isArray(arr)) continue
    for (let i = 0; i < arr.length; i++) {
      const f = arr[i] as GeoFeature
      const props = (f.properties && typeof f.properties === 'object' ? f.properties : {}) as Record<string, unknown>
      if (!evalWhereExpr(expr, props)) continue
      const featureKey = computeStableGisFeatureKey(f, i)
      const k = `${layer.id}::${featureKey}`
      if (seen.has(k)) continue
      seen.add(k)
      hits.push({
        layerId: String(layer.id),
        featureKey,
        layerName: layer.name,
        properties: props,
      })
    }
  }
  return hits
}
