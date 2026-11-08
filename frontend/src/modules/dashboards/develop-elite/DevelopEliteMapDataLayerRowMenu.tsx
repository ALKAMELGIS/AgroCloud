import { useCallback, useMemo } from 'react'
import type { DevelopEliteMapDataLayerId } from './developEliteDashboardConfig'
import {
  developEliteMapDataLayerOpacityValue,
  nudgeMapDataLayerDrawOrder,
  type DevelopEliteMapDataLayerDef,
} from './developEliteMapDataLayers'
import {
  SiLayerOptionsMenuItem,
  SiLayerOptionsMenuPortal,
  SiLayerOptionsMenuSep,
} from '@/modules/gis/map/SiLayerOptionsMenuPortal'
import { copyTextToClipboard } from '@/core/utils/copyTextToClipboard'
import { developEliteMapGeoJsonForLayer, type DevelopEliteMapSearchSources } from './developEliteMapSearch'
import { useDevelopEliteMapLibre } from './developEliteMapLibreContext'
import { developEliteMapLibreFitGeoJson } from './developEliteMapLibreNavigation'
import { dispatchDevelopEliteMapFocusLegendLayer } from './developEliteDashboardEvents'
import type { DevelopEliteMapDataLayerDialogMode } from './DevelopEliteMapDataLayerActionDialogs'

export type DevelopEliteMapDataLayerRowMenuProps = {
  layer: DevelopEliteMapDataLayerDef
  open: boolean
  onToggleOpen: () => void
  onCloseMenu: () => void
  sources: DevelopEliteMapSearchSources
  serviceUrl?: string
  order: DevelopEliteMapDataLayerId[]
  onOrderChange: (order: DevelopEliteMapDataLayerId[]) => void
  layerOpacity: Record<DevelopEliteMapDataLayerId, number>
  onLayerOpacityChange: (id: DevelopEliteMapDataLayerId, opacity: number) => void
  onVisibilityChange: (id: DevelopEliteMapDataLayerId, visible: boolean) => void
  onOpenDialog: (mode: DevelopEliteMapDataLayerDialogMode, layerId: DevelopEliteMapDataLayerId) => void
  onStatus?: (message: string) => void
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function exportLayerGeoJson(layer: DevelopEliteMapDataLayerDef, fc: GeoJSON.FeatureCollection) {
  const safe = layer.label.replace(/[^\w.-]+/g, '_')
  downloadBlob(`${safe}.geojson`, new Blob([JSON.stringify(fc)], { type: 'application/json' }))
}

function exportLayerCsv(layer: DevelopEliteMapDataLayerDef, fc: GeoJSON.FeatureCollection) {
  const rows = fc.features.map((f, i) => ({ id: i, ...(f.properties ?? {}) }))
  if (!rows.length) return
  const keys = [...new Set(rows.flatMap(r => Object.keys(r)))].slice(0, 40)
  const esc = (v: unknown) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [keys.join(',')]
  for (const row of rows) {
    lines.push(keys.map(k => esc((row as Record<string, unknown>)[k])).join(','))
  }
  const safe = layer.label.replace(/[^\w.-]+/g, '_')
  downloadBlob(`${safe}.csv`, new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }))
}

export function DevelopEliteMapDataLayerRowMenu({
  layer,
  open,
  onToggleOpen,
  onCloseMenu,
  sources,
  serviceUrl,
  order,
  onOrderChange,
  layerOpacity,
  onLayerOpacityChange,
  onVisibilityChange,
  onOpenDialog,
  onStatus,
}: DevelopEliteMapDataLayerRowMenuProps) {
  const { mapRef } = useDevelopEliteMapLibre()
  const fc = useMemo(() => developEliteMapGeoJsonForLayer(sources, layer.id), [layer.id, sources])
  const featureCount = fc?.features?.length ?? 0
  const idx = order.indexOf(layer.id)
  const canForward = idx > 0
  const canBackward = idx >= 0 && idx < order.length - 1
  const currentOpacity = developEliteMapDataLayerOpacityValue(layerOpacity, layer.id)

  const closeAnd = useCallback(
    (fn: () => void) => {
      onCloseMenu()
      fn()
    },
    [onCloseMenu],
  )

  const mi = (
    label: string,
    icon: string,
    on: () => void,
    opts?: { danger?: boolean; disabled?: boolean; hint?: string },
  ) => (
    <SiLayerOptionsMenuItem
      key={label}
      label={label}
      icon={icon}
      danger={opts?.danger}
      disabled={opts?.disabled}
      hint={opts?.hint}
      onSelect={() => closeAnd(on)}
    />
  )

  return (
    <div className="si-env-layer-actions si-env-layer-actions--menu-only develop-elite-map__data-layer-actions">
      <div className="si-env-layer-actions-more-wrap">
        <SiLayerOptionsMenuPortal open={open} layerLabel={layer.label} onToggleOpen={onToggleOpen}>
          {open ? (
            <>
              {mi('Zoom to layer', 'fa-solid fa-magnifying-glass-location', () => {
                const map = mapRef.current
                if (!map || !fc?.features?.length) {
                  onStatus?.('No features to zoom to.')
                  return
                }
                if (!developEliteMapLibreFitGeoJson(map, fc, { maxZoom: 16 })) {
                  onStatus?.('Could not compute layer extent.')
                }
              }, { disabled: !featureCount, hint: !featureCount ? 'Layer has no features in view.' : undefined })}
              {mi('Layer properties', 'fa-solid fa-circle-info', () => onOpenDialog('metadata', layer.id))}
              {mi('Export GeoJSON', 'fa-solid fa-file-export', () => {
                if (!fc?.features?.length) {
                  onStatus?.('Nothing to export.')
                  return
                }
                exportLayerGeoJson(layer, fc)
                onStatus?.(`Exported ${layer.label} as GeoJSON.`)
              }, { disabled: !featureCount })}
              {mi('Export CSV (attributes)', 'fa-solid fa-table', () => {
                if (!fc?.features?.length) {
                  onStatus?.('Nothing to export.')
                  return
                }
                exportLayerCsv(layer, fc)
                onStatus?.(`Exported ${layer.label} attributes as CSV.`)
              }, { disabled: !featureCount })}
              <SiLayerOptionsMenuSep />
              {mi('Attributes', 'fa-solid fa-table-cells', () => onOpenDialog('table', layer.id), {
                disabled: !featureCount,
              })}
              {mi('Symbology', 'fa-solid fa-sliders', () => onOpenDialog('symbology', layer.id))}
              {mi('Legend', 'fa-solid fa-key', () => {
                dispatchDevelopEliteMapFocusLegendLayer(layer.id)
                onStatus?.('Legend rail updated for this layer.')
              })}
              <SiLayerOptionsMenuSep />
              {mi('Configure pop-ups', 'fa-solid fa-message', () => onOpenDialog('popups', layer.id))}
              {mi('Layer opacity...', 'fa-solid fa-droplet', () => {
                const raw = window.prompt(
                  `Layer opacity for "${layer.label}" (5–100%)`,
                  String(Math.round(currentOpacity * 100)),
                )
                if (raw === null) return
                const pct = Number.parseFloat(raw.replace('%', '').trim())
                if (!Number.isFinite(pct)) {
                  onStatus?.('Enter a number between 5 and 100.')
                  return
                }
                onLayerOpacityChange(layer.id, Math.min(1, Math.max(0.05, pct / 100)))
                onStatus?.(`Opacity set to ${Math.round(Math.min(100, Math.max(5, pct)))}%.`)
              })}
              <SiLayerOptionsMenuSep />
              {mi('Bring forward (draw order)', 'fa-solid fa-arrow-up', () => {
                onOrderChange(nudgeMapDataLayerDrawOrder(order, layer.id, 'forward'))
              }, { disabled: !canForward })}
              {mi('Send backward (draw order)', 'fa-solid fa-arrow-down', () => {
                onOrderChange(nudgeMapDataLayerDrawOrder(order, layer.id, 'backward'))
              }, { disabled: !canBackward })}
              <SiLayerOptionsMenuSep />
              {mi('Copy layer name', 'fa-solid fa-copy', () => {
                void copyTextToClipboard(layer.label).then(ok =>
                  onStatus?.(ok ? `Copied: ${layer.label}` : 'Could not copy to clipboard.'),
                )
              })}
              {serviceUrl
                ? mi('Copy service URL', 'fa-solid fa-link', () => {
                    void copyTextToClipboard(serviceUrl).then(ok =>
                      onStatus?.(ok ? 'Service URL copied.' : 'Could not copy to clipboard.'),
                    )
                  })
                : null}
              {mi('Labeling...', 'fa-solid fa-tag', () => onOpenDialog('labeling', layer.id))}
              {mi('Definition query...', 'fa-solid fa-filter', () => onOpenDialog('definitionQuery', layer.id))}
              <SiLayerOptionsMenuSep />
              {mi('Hide layer', 'fa-solid fa-eye-slash', () => onVisibilityChange(layer.id, false))}
              {mi('Remove from map', 'fa-solid fa-trash-can', () => onVisibilityChange(layer.id, false), {
                danger: true,
                hint: 'Hides this portfolio layer until you turn it back on in the list.',
              })}
            </>
          ) : null}
        </SiLayerOptionsMenuPortal>
      </div>
    </div>
  )
}
