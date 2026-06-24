import type { FilterSpecification } from 'maplibre-gl'
import type { GisContentMapLayerConfig } from '../../../../lib/gisContentRepository'
import type { GisContentRow } from '../../../master/gisContentPortalData'
import { resolveAcpPortalLayerPaint, type AcpPortalMapLayerPaint } from './acpPortalMapLayers'

function parseColorAlpha(color: string, fallback: string): { color: string; alpha: number } {
  const raw = color.trim() || fallback
  const rgba = raw.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i)
  if (rgba) {
    const r = Number(rgba[1])
    const g = Number(rgba[2])
    const b = Number(rgba[3])
    const a = rgba[4] != null ? Number(rgba[4]) : 1
    return { color: `rgb(${r}, ${g}, ${b})`, alpha: Number.isFinite(a) ? a : 1 }
  }
  return { color: raw, alpha: 1 }
}

export function resolveAcpPortalLayerPaintWithConfig(
  row: GisContentRow,
  config?: GisContentMapLayerConfig,
): AcpPortalMapLayerPaint & { lineOpacity: number; circleOpacity: number; minZoom?: number; maxZoom?: number } {
  const base = resolveAcpPortalLayerPaint(row)
  const style = config?.style
  const opacity = Math.max(0, Math.min(1, config?.opacity ?? 1))

  const fill = parseColorAlpha(style?.fillColor ?? base.fillColor, base.fillColor)
  const stroke = parseColorAlpha(style?.strokeColor ?? base.lineColor, base.lineColor)

  return {
    fillColor: fill.color,
    fillOpacity: fill.alpha * opacity * base.fillOpacity,
    lineColor: stroke.color,
    lineWidth: style?.strokeWidth ?? base.lineWidth,
    lineOpacity: stroke.alpha * opacity * 0.95,
    circleColor: stroke.color,
    circleRadius: style?.pointRadius ?? base.circleRadius,
    circleOpacity: stroke.alpha * opacity * 0.92,
    minZoom: config?.minZoom,
    maxZoom: config?.maxZoom,
  }
}

export type AcpPortalLayerAttributeFilter = {
  property: string
  value: string
} | null

export function buildAcpPortalAttributeFilter(
  filter: AcpPortalLayerAttributeFilter,
): FilterSpecification | undefined {
  if (!filter?.property.trim()) return undefined
  const prop = filter.property.trim()
  const val = filter.value.trim()
  if (!val) return undefined
  return ['==', ['get', prop], val]
}

export function combineAcpPortalFilters(
  geometryFilter: FilterSpecification,
  attributeFilter?: FilterSpecification,
): FilterSpecification {
  if (!attributeFilter) return geometryFilter
  return ['all', geometryFilter, attributeFilter]
}
