import { useMemo } from 'react'
import { ResponsiveDialog } from '@/components/overlays/ResponsiveDialog'
import type { DevelopEliteMapDataLayerId } from './developEliteDashboardConfig'
import { DEVELOP_ELITE_MAP_DATA_LAYERS } from './developEliteMapDataLayers'
import {
  buildDevelopEliteMapLegendSections,
  developEliteMapDataLayerLegendPreviews,
} from './developEliteMapLegend'
import { DevelopEliteMapLegendSwatch } from './DevelopEliteMapLegendSwatch'
import { DevelopEliteMapAttributesDock } from './DevelopEliteMapAttributesDock'
import { developEliteMapGeoJsonForLayer, type DevelopEliteMapSearchSources } from './developEliteMapSearch'
import {
  developEliteArcGisUrlShortLabel,
  developEliteDataSourceGeometryLabel,
  type DevelopEliteDataSourceDef,
} from './developEliteDataSourceRegistry'

export type DevelopEliteMapDataLayerDialogMode =
  | 'table'
  | 'symbology'
  | 'metadata'
  | 'popups'
  | 'labeling'
  | 'definitionQuery'

export type DevelopEliteMapDataLayerDialogState = {
  mode: DevelopEliteMapDataLayerDialogMode
  layerId: DevelopEliteMapDataLayerId
} | null

type Props = {
  dialog: DevelopEliteMapDataLayerDialogState
  onClose: () => void
  sources: DevelopEliteMapSearchSources
  drawingInfo?: Record<string, unknown> | null
  treesDrawingInfo?: Record<string, unknown> | null
  irrigationValvesDrawingInfo?: Record<string, unknown> | null
  irrigationMainPipeDrawingInfo?: Record<string, unknown> | null
  agriLocationDrawingInfo?: Record<string, unknown> | null
  serviceUrl?: string
  dataSourceDef?: DevelopEliteDataSourceDef | null
}

type AttrRow = { id: number; [key: string]: unknown }

export function DevelopEliteMapDataLayerActionDialogs({
  dialog,
  onClose,
  sources,
  drawingInfo = null,
  treesDrawingInfo,
  irrigationValvesDrawingInfo,
  irrigationMainPipeDrawingInfo,
  agriLocationDrawingInfo,
  serviceUrl,
  dataSourceDef,
}: Props) {
  const layerLabel = useMemo(() => {
    if (!dialog) return ''
    return DEVELOP_ELITE_MAP_DATA_LAYERS.find(l => l.id === dialog.layerId)?.label ?? dialog.layerId
  }, [dialog])

  const fc = useMemo(
    () => (dialog ? developEliteMapGeoJsonForLayer(sources, dialog.layerId) : null),
    [dialog, sources],
  )

  const legend = useMemo(
    () =>
      buildDevelopEliteMapLegendSections(
        drawingInfo,
        treesDrawingInfo,
        agriLocationDrawingInfo,
        irrigationValvesDrawingInfo,
        irrigationMainPipeDrawingInfo,
      ),
    [
      agriLocationDrawingInfo,
      drawingInfo,
      irrigationMainPipeDrawingInfo,
      irrigationValvesDrawingInfo,
      treesDrawingInfo,
    ],
  )

  const symbologyRows = dialog ? developEliteMapDataLayerLegendPreviews(dialog.layerId, legend, 32) : []

  const tableRows: AttrRow[] = useMemo(() => {
    if (!fc?.features?.length) return []
    return fc.features.slice(0, 500).map((f, i) => ({ id: i, ...(f.properties ?? {}) }))
  }, [fc])

  const tableColumns = useMemo(() => {
    if (!tableRows.length) return []
    const keys = [...new Set(tableRows.flatMap(r => Object.keys(r).filter(k => k !== 'id')))].slice(0, 10)
    return keys.map(key => ({
      id: key,
      header: key,
      mobilePrimary: key === keys[0],
      render: (row: AttrRow) => {
        const v = row[key]
        if (v == null) return '—'
        if (typeof v === 'object') return JSON.stringify(v)
        return String(v)
      },
    }))
  }, [tableRows])

  if (!dialog) return null

  const title = `${layerLabel} — ${dialog.mode}`

  if (dialog.mode === 'table') {
    return (
      <DevelopEliteMapAttributesDock
        layerLabel={layerLabel}
        rows={tableRows}
        columns={tableColumns}
        onClose={onClose}
      />
    )
  }

  if (dialog.mode === 'symbology') {
    return (
      <ResponsiveDialog open title={`${layerLabel} — Symbology`} onClose={onClose}>
        <p className="develop-elite-map__layer-dialog-hint">
          Live ArcGIS drawingInfo symbology applied on the map (unique values, markers, and line weights).
        </p>
        <ul className="develop-elite-map__legend-list develop-elite-map__layer-dialog-symbology">
          {symbologyRows.map(row => (
            <li key={row.id} className="develop-elite-map__legend-row">
              <DevelopEliteMapLegendSwatch item={row} />
              <span className="develop-elite-map__legend-label">{row.label}</span>
            </li>
          ))}
        </ul>
      </ResponsiveDialog>
    )
  }

  if (dialog.mode === 'metadata') {
    const geomTypes = new Set(fc?.features?.map(f => f.geometry?.type).filter(Boolean))
    return (
      <ResponsiveDialog open title={`${layerLabel} — Properties`} onClose={onClose}>
        <dl className="develop-elite-map__layer-meta">
          <div>
            <dt>Features loaded</dt>
            <dd>{fc?.features?.length ?? 0}</dd>
          </div>
          <div>
            <dt>Geometry</dt>
            <dd>{dataSourceDef ? developEliteDataSourceGeometryLabel(dataSourceDef.geometry) : geomTypes.size ? [...geomTypes].join(', ') : '—'}</dd>
          </div>
          {serviceUrl ? (
            <div>
              <dt>ArcGIS service</dt>
              <dd>
                <code className="develop-elite-map__layer-meta-url">{developEliteArcGisUrlShortLabel(serviceUrl)}</code>
              </dd>
            </div>
          ) : null}
        </dl>
        {serviceUrl ? (
          <p className="develop-elite-map__layer-dialog-hint develop-elite-map__layer-meta-full" title={serviceUrl}>
            {serviceUrl}
          </p>
        ) : null}
      </ResponsiveDialog>
    )
  }

  if (dialog.mode === 'popups') {
    return (
      <ResponsiveDialog open title={`${layerLabel} — Pop-ups`} onClose={onClose}>
        <p className="develop-elite-map__layer-dialog-hint">
          Identify is enabled: click a feature on the map to open an Esri-style pop-up with attributes and{' '}
          <strong>Zoom to location</strong>. Pop-up fields follow the ArcGIS layer schema (OBJECTID, farm codes, structure
          types, etc.).
        </p>
        <p className="develop-elite-map__layer-dialog-hint">
          To change which fields appear, update the ArcGIS layer pop-up configuration in your hosted feature service; the
          dashboard reads attributes from the loaded features.
        </p>
      </ResponsiveDialog>
    )
  }

  if (dialog.mode === 'labeling') {
    return (
      <ResponsiveDialog open title={`${layerLabel} — Labeling`} onClose={onClose}>
        <p className="develop-elite-map__layer-dialog-hint">
          Portfolio map layers use ArcGIS service symbology. Dynamic map labels are not edited here — configure labels in
          ArcGIS Online / Enterprise for the feature layer, then refresh the dashboard data.
        </p>
      </ResponsiveDialog>
    )
  }

  if (dialog.mode === 'definitionQuery') {
    return (
      <ResponsiveDialog open title={`${layerLabel} — Definition query`} onClose={onClose}>
        <p className="develop-elite-map__layer-dialog-hint">
          Definition queries are applied when features are fetched from the ArcGIS REST service (dashboard filters and
          portfolio scope). Use <strong>Settings → Data</strong> to point at a view definition or update the service URL;
          use map filters (country, zone) to limit what is drawn.
        </p>
      </ResponsiveDialog>
    )
  }

  return (
    <ResponsiveDialog open title={title} onClose={onClose}>
      <p className="develop-elite-map__layer-dialog-hint">No dialog for this action.</p>
    </ResponsiveDialog>
  )
}
