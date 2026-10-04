import type { PathOptions } from 'leaflet'
import {
  collectUniqueValueMatchKeys,
  flattenArcgisUniqueValueInfos,
  normalizeUniqueValueKey,
  pickRendererPrimaryField,
  sanitizeArcgisDrawingInfoForClient,
} from './arcgisDrawingInfoMapbox'
import { parseEsriPointSymbol, parseEsriSfsSymbol, type ArcgisPointSymbolPreview } from './arcgisPointSymbol'

const FALLBACK: PathOptions = {
  color: '#64748b',
  weight: 1,
  fillColor: '#94a3b8',
  fillOpacity: 0.35,
}

function propertyKeyVariants(field: string): string[] {
  const f = field.trim()
  if (!f) return []
  const underscored = f.replace(/\s+/g, '_')
  const noSpace = f.replace(/\s+/g, '')
  return Array.from(
    new Set([f, underscored, noSpace, f.toLowerCase(), underscored.toLowerCase(), noSpace.toLowerCase()]),
  ).filter(Boolean)
}

function readProperty(props: Record<string, unknown>, field: string): unknown {
  for (const key of propertyKeyVariants(field)) {
    if (!Object.prototype.hasOwnProperty.call(props, key)) continue
    const v = props[key]
    if (v !== null && v !== undefined && v !== '') return v
  }
  return undefined
}

function featureValueMatchKeys(raw: unknown): Set<string> {
  const keys = new Set<string>()
  for (const k of collectUniqueValueMatchKeys(normalizeUniqueValueKey(raw), typeof raw === 'string' ? raw : undefined)) {
    keys.add(k)
  }
  const num = Number(raw)
  if (Number.isFinite(num)) {
    for (const k of collectUniqueValueMatchKeys(String(num), undefined)) keys.add(k)
    if (Number.isInteger(num)) {
      for (const k of collectUniqueValueMatchKeys(num, undefined)) keys.add(k)
    }
  }
  return keys
}

function symbolsMatch(uvi: { value?: unknown; label?: unknown }, featureKeys: Set<string>): boolean {
  const label = String(uvi?.label ?? '').trim()
  const uviKeys = collectUniqueValueMatchKeys(normalizeUniqueValueKey(uvi?.value), label || undefined)
  return uviKeys.some(k => featureKeys.has(k))
}

export function esriPolygonSymbolToLeafletPathOptions(symbol: unknown, layerOpacity = 1): PathOptions {
  const preview = parseEsriSfsSymbol(symbol, layerOpacity)
  if (!preview) return FALLBACK
  const hollow = preview.fillColor === 'transparent'
  return {
    color: preview.strokeColor,
    weight: preview.strokeWidth,
    fillColor: hollow ? preview.strokeColor : preview.fillColor,
    fillOpacity: hollow ? 0 : preview.opacity,
    opacity: 1,
  }
}

function resolveRendererSymbol(renderer: unknown, props: Record<string, unknown>): unknown {
  if (!renderer || typeof renderer !== 'object') return null
  const ren = renderer as Record<string, unknown>
  const t = String(ren.type || '')

  if (t === 'simple') return ren.symbol ?? null

  if (t === 'uniqueValue') {
    const f1 = typeof ren.field1 === 'string' ? ren.field1.trim() : ''
    const f2 = typeof ren.field2 === 'string' ? ren.field2.trim() : ''
    const f3 = typeof ren.field3 === 'string' ? ren.field3.trim() : ''
    const fields = [f1, f2, f3].filter(Boolean)
    const delim =
      typeof ren.fieldDelimiter === 'string' && ren.fieldDelimiter.length ? ren.fieldDelimiter : '|'

    if (fields.length > 1) {
      const composite = fields
        .map(f => normalizeUniqueValueKey(readProperty(props, f)))
        .filter(Boolean)
        .join(delim)
      const infos = flattenArcgisUniqueValueInfos(ren)
      const hit = infos.find(uvi => normalizeUniqueValueKey(uvi?.value) === composite)
      if (hit?.symbol) return hit.symbol
      return ren.defaultSymbol ?? null
    }

    const field = fields[0] || pickRendererPrimaryField(ren)
    const raw = field ? readProperty(props, field) : undefined
    const featureKeys = featureValueMatchKeys(raw)
    const infos = flattenArcgisUniqueValueInfos(ren)
    for (const uvi of infos) {
      if (symbolsMatch(uvi, featureKeys)) return uvi.symbol
    }
    return ren.defaultSymbol ?? infos[infos.length - 1]?.symbol ?? null
  }

  if (t === 'classBreaks') {
    const field = pickRendererPrimaryField(ren)
    if (!field) return ren.defaultSymbol ?? null
    const raw = readProperty(props, field)
    const num = Number(raw)
    if (!Number.isFinite(num)) return ren.defaultSymbol ?? null
    const infos = (Array.isArray(ren.classBreakInfos) ? ren.classBreakInfos : [])
      .filter((br: { maxValue?: unknown }) => Number.isFinite(Number(br?.maxValue)))
      .sort((a: { minValue?: unknown }, b: { minValue?: unknown }) => Number(a?.minValue) - Number(b?.minValue))
    for (const br of infos) {
      const min = Number(br?.minValue)
      const max = Number(br?.maxValue)
      if (num >= min && num <= max) return br?.symbol ?? ren.defaultSymbol
    }
    return ren.defaultSymbol ?? null
  }

  return ren.symbol ?? null
}

export function layerOpacityFromDrawingInfo(drawingInfo: unknown): number {
  const di = drawingInfo as { transparency?: unknown } | null
  const t = Number(di?.transparency)
  if (!Number.isFinite(t)) return 1
  return Math.max(0, Math.min(1, 1 - t / 100))
}

export function arcgisFeaturePointSymbolPreview(
  drawingInfo: unknown,
  properties: GeoJSON.GeoJsonProperties | null | undefined,
  options?: { layerOpacity?: number },
): ArcgisPointSymbolPreview | null {
  const layerOpacity = options?.layerOpacity ?? layerOpacityFromDrawingInfo(drawingInfo)
  const sanitized = sanitizeArcgisDrawingInfoForClient(drawingInfo) ?? drawingInfo
  const ren = (sanitized as { renderer?: unknown } | null)?.renderer
  const props =
    properties && typeof properties === 'object' && !Array.isArray(properties)
      ? (properties as Record<string, unknown>)
      : {}
  const symbol = resolveRendererSymbol(ren, props)
  if (!symbol) return null
  return parseEsriPointSymbol(symbol, layerOpacity)
}

export function arcgisFeatureToLeafletPathOptions(
  drawingInfo: unknown,
  properties: GeoJSON.GeoJsonProperties | null | undefined,
  options?: { layerOpacity?: number; highlighted?: boolean },
): PathOptions {
  const layerOpacity = options?.layerOpacity ?? layerOpacityFromDrawingInfo(drawingInfo)
  const sanitized = sanitizeArcgisDrawingInfoForClient(drawingInfo) ?? drawingInfo
  const ren = (sanitized as { renderer?: unknown } | null)?.renderer
  const props =
    properties && typeof properties === 'object' && !Array.isArray(properties)
      ? (properties as Record<string, unknown>)
      : {}
  const symbol = resolveRendererSymbol(ren, props)
  const base = esriPolygonSymbolToLeafletPathOptions(symbol, layerOpacity)
  if (options?.highlighted) {
    const fill = base.fillColor ?? '#4ce600'
    return {
      ...base,
      color: '#39ff14',
      weight: Math.max((base.weight ?? 1) + 2.5, 4),
      fillColor: fill,
      fillOpacity: Math.min(0.72, Math.max(base.fillOpacity ?? 0.2, 0.38) + 0.22),
      opacity: 1,
    }
  }
  return base
}
