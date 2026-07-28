import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  buildArcgisUniqueValueLegendItems,
  resolveLayerArcgisDrawingInfo,
} from '../../../lib/arcgisDrawingInfoMapbox'
import type { ArcgisLayerDefLite } from '../../../lib/arcgisAttributeDisplay'
import './SiLayerLegendFloatingPanel.css'

export type SiLayerLegendRow = { label: string; color: string }

export type SiLayerLegendLayer = {
  id: string
  name: string
  color?: string
  fillColor?: string
  useArcGisSymbology?: boolean
  symbology?: { useArcGisOnline?: boolean } | null
  arcgisDrawingInfo?: Record<string, unknown> | null
  arcgisDrawingInfoService?: Record<string, unknown> | null
  arcgisLayerDefinition?: ArcgisLayerDefLite | null
  source?: string
  sourceUrl?: string
}

type Props = {
  layer: SiLayerLegendLayer
  container: HTMLElement | null
  onClose: () => void
  /** Optional precomputed ArcGIS class-break / unique rows (e.g. from symbology bake). */
  extraRows?: SiLayerLegendRow[]
}

function wantsArcgisLegend(layer: SiLayerLegendLayer): boolean {
  if (layer.symbology?.useArcGisOnline === false) return false
  if (layer.useArcGisSymbology === false) return false
  return Boolean(
    resolveLegendDrawingInfo(layer) ||
      layer.source === 'arcgis' ||
      (typeof layer.sourceUrl === 'string' && /FeatureServer|MapServer/i.test(layer.sourceUrl)),
  )
}

function esriColorToCss(raw: unknown): string | null {
  if (!Array.isArray(raw) || raw.length < 3) return null
  const r = Math.max(0, Math.min(255, Number(raw[0]) || 0))
  const g = Math.max(0, Math.min(255, Number(raw[1]) || 0))
  const b = Math.max(0, Math.min(255, Number(raw[2]) || 0))
  const aRaw = raw.length >= 4 ? Number(raw[3]) : 255
  const a = Number.isFinite(aRaw) ? (aRaw <= 1 ? aRaw : aRaw / 255) : 1
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a))})`
}

function resolveLegendDrawingInfo(layer: SiLayerLegendLayer): Record<string, unknown> | null {
  const resolved = resolveLayerArcgisDrawingInfo(layer)
  if (resolved) return resolved
  // Legend preview: also accept client drawingInfo when service DI is missing.
  const direct = layer.arcgisDrawingInfo
  if (direct && typeof direct === 'object') return direct as Record<string, unknown>
  const service = layer.arcgisDrawingInfoService
  if (service && typeof service === 'object') return service as Record<string, unknown>
  const embedded = (layer.arcgisLayerDefinition as { drawingInfo?: unknown } | null)?.drawingInfo
  if (embedded && typeof embedded === 'object') return embedded as Record<string, unknown>
  return null
}

/** Build color-key rows for a GIS layer legend panel. */
export function buildSiLayerLegendRows(
  layer: SiLayerLegendLayer,
  extraRows?: SiLayerLegendRow[],
): SiLayerLegendRow[] {
  if (extraRows?.length) return extraRows

  const fallbackColor = layer.fillColor || layer.color || '#22c55e'

  if (wantsArcgisLegend(layer)) {
    const di = resolveLegendDrawingInfo(layer)
    const uv = buildArcgisUniqueValueLegendItems(di)
    if (uv.length) {
      return uv.slice(0, 40).map(item => ({
        label: item.label || item.value || 'Class',
        color: item.hollow ? item.outlineColor : item.fillColor || item.outlineColor,
      }))
    }
    const ren = (di as { renderer?: any } | null)?.renderer
    if (ren && String(ren.type || '') === 'classBreaks') {
      const raw = Array.isArray(ren.classBreakInfos) ? ren.classBreakInfos : []
      if (raw.length) {
        return raw.slice(0, 40).map((br: any) => ({
          label:
            String(br?.label ?? '').trim() ||
            `${br?.minValue ?? ''} – ${br?.maxValue ?? ''}`.trim() ||
            'Class',
          color:
            esriColorToCss(br?.symbol?.color) ||
            esriColorToCss(br?.symbol?.outline?.color) ||
            'rgba(148, 163, 184, 0.45)',
        }))
      }
    }
    if (ren && String(ren.type || '') === 'simple') {
      const color =
        esriColorToCss(ren.symbol?.color) ||
        esriColorToCss(ren.symbol?.outline?.color) ||
        fallbackColor
      return [{ label: layer.name || 'Symbol', color }]
    }
  }

  return [{ label: layer.name || 'Layer', color: fallbackColor }]
}

export function SiLayerLegendFloatingPanel({ layer, container, onClose, extraRows }: Props) {
  const rows = useMemo(() => buildSiLayerLegendRows(layer, extraRows), [layer, extraRows])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!container) return null

  const node = (
    <aside
      className="si-layer-legend-float"
      role="complementary"
      aria-label={`Legend — ${layer.name}`}
    >
      <header className="si-layer-legend-float__head">
        <div className="si-layer-legend-float__titles">
          <span className="si-layer-legend-float__title">Legend</span>
          <span className="si-layer-legend-float__sub" title={layer.name}>
            {layer.name}
          </span>
        </div>
        <button
          type="button"
          className="si-layer-legend-float__close"
          onClick={onClose}
          aria-label="Close legend"
          title="Close"
        >
          ×
        </button>
      </header>
      <ul className="si-layer-legend-float__list">
        {rows.map((row, i) => (
          <li key={`${row.label}-${i}`} className="si-layer-legend-float__row">
            <span
              className="si-layer-legend-float__swatch"
              style={{ background: row.color }}
              aria-hidden
            />
            <span className="si-layer-legend-float__label" title={row.label}>
              {row.label}
            </span>
          </li>
        ))}
      </ul>
      {rows.length >= 40 ? (
        <p className="si-layer-legend-float__more">Showing first 40 classes…</p>
      ) : null}
    </aside>
  )

  return createPortal(node, container)
}

export default SiLayerLegendFloatingPanel
