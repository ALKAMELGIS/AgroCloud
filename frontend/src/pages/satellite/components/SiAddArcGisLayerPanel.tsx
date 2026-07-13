import { useCallback, useEffect, useId, useState } from 'react'
import { SiAddSourceAnchoredPanel } from './SiAddSourceAnchoredPanel'
import {
  arcGisServiceTypeLabel,
  validateAndFetchArcGisLayerMetadata,
  type ArcGisLayerMetadata,
  type ArcGisServiceType,
} from '../../../lib/arcgisDynamicLayer'

export type SiAddArcGisLayerPanelProps = {
  open: boolean
  onClose: () => void
  onAdd: (payload: {
    name: string
    url: string
    serviceType: ArcGisServiceType
    visible: boolean
    mapOpacity: number
    metadata: ArcGisLayerMetadata
  }) => Promise<void>
  defaultToken?: string
  anchorId?: string
}

export function SiAddArcGisLayerPanel({
  open,
  onClose,
  onAdd,
  defaultToken = '',
  anchorId = 'map-toolbox-add-arcgis-layer-btn',
}: SiAddArcGisLayerPanelProps) {
  const titleId = useId()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [visible, setVisible] = useState(true)
  const [opacityPct, setOpacityPct] = useState(100)
  const [serviceType, setServiceType] = useState<ArcGisServiceType>('unknown')
  const [status, setStatus] = useState('')
  const [detecting, setDetecting] = useState(false)
  const [adding, setAdding] = useState(false)
  const [metadataPreview, setMetadataPreview] = useState<{
    geometryType?: string
    wkid?: number
    fieldCount?: number
    extent?: string
  } | null>(null)

  const resetForm = useCallback(() => {
    setName('')
    setUrl('')
    setVisible(true)
    setOpacityPct(100)
    setServiceType('unknown')
    setStatus('')
    setMetadataPreview(null)
  }, [])

  useEffect(() => {
    if (!open) {
      resetForm()
    }
  }, [open, resetForm])

  const runDetect = useCallback(async () => {
    const trimmed = url.trim()
    if (!trimmed) {
      setStatus('Enter an ArcGIS REST service URL.')
      setServiceType('unknown')
      setMetadataPreview(null)
      return
    }
    setDetecting(true)
    setStatus('Validating ArcGIS service…')
    try {
      const meta = await validateAndFetchArcGisLayerMetadata(trimmed, defaultToken || undefined)
      setServiceType(meta.serviceType)
      if (!name.trim()) setName(meta.name)
      const wkid = meta.spatialReference?.latestWkid ?? meta.spatialReference?.wkid
      const bbox = meta.fullExtent ?? meta.extent
      setMetadataPreview({
        geometryType: meta.geometryType,
        wkid,
        fieldCount: meta.fields?.length,
        extent: bbox
          ? `${bbox.xmin?.toFixed?.(3) ?? bbox.xmin}, ${bbox.ymin?.toFixed?.(3) ?? bbox.ymin} → ${bbox.xmax?.toFixed?.(3) ?? bbox.xmax}, ${bbox.ymax?.toFixed?.(3) ?? bbox.ymax}`
          : undefined,
      })
      setStatus(`Detected ${arcGisServiceTypeLabel(meta.serviceType)} — ${meta.name}`)
    } catch (err) {
      setServiceType('unknown')
      setMetadataPreview(null)
      setStatus(err instanceof Error ? err.message : 'Could not validate ArcGIS URL.')
    } finally {
      setDetecting(false)
    }
  }, [url, defaultToken, name])

  const handleAdd = useCallback(async () => {
    const trimmedUrl = url.trim()
    if (!trimmedUrl) {
      setStatus('Enter an ArcGIS REST service URL.')
      return
    }
    setAdding(true)
    setStatus('Adding ArcGIS layer…')
    try {
      const meta = await validateAndFetchArcGisLayerMetadata(trimmedUrl, defaultToken || undefined)
      const layerName = name.trim() || meta.name
      const mapOpacity = Math.min(1, Math.max(0.05, opacityPct / 100))
      await onAdd({
        name: layerName,
        url: meta.layerUrl,
        serviceType: meta.serviceType,
        visible,
        mapOpacity,
        metadata: meta,
      })
      onClose()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to add ArcGIS layer.')
    } finally {
      setAdding(false)
    }
  }, [url, defaultToken, name, visible, opacityPct, onAdd, onClose])

  return (
    <SiAddSourceAnchoredPanel
      open={open}
      onClose={onClose}
      anchorId={anchorId}
      wide
      panelClassName="si-add-arcgis-layer-panel"
      ariaLabelledBy={titleId}
    >
      <div className="si-add-arcgis-layer-panel__header">
        <h3 id={titleId} className="si-add-arcgis-layer-panel__title">
          Add ArcGIS Layer
        </h3>
        <p className="si-add-arcgis-layer-panel__hint">
          Paste any ArcGIS Online or Enterprise REST endpoint — Feature, Map, Vector Tile, or Image service.
        </p>
      </div>

      <label className="si-add-arcgis-layer-panel__field">
        <span>Layer name</span>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Auto-filled from service"
          autoComplete="off"
        />
      </label>

      <label className="si-add-arcgis-layer-panel__field">
        <span>ArcGIS REST URL</span>
        <input
          type="url"
          value={url}
          onChange={e => {
            setUrl(e.target.value)
            setServiceType('unknown')
            setMetadataPreview(null)
          }}
          onBlur={() => {
            if (url.trim()) void runDetect()
          }}
          placeholder="https://services.arcgis.com/…/FeatureServer/0"
          autoComplete="off"
        />
      </label>

      <div className="si-add-arcgis-layer-panel__row">
        <label className="si-add-arcgis-layer-panel__field si-add-arcgis-layer-panel__field--compact">
          <span>Layer type</span>
          <input type="text" readOnly value={arcGisServiceTypeLabel(serviceType)} />
        </label>
        <button
          type="button"
          className="si-add-arcgis-layer-panel__detect-btn"
          onClick={() => void runDetect()}
          disabled={detecting || !url.trim()}
        >
          {detecting ? 'Detecting…' : 'Auto detect'}
        </button>
      </div>

      {metadataPreview ? (
        <dl className="si-add-arcgis-layer-panel__meta">
          {metadataPreview.geometryType ? (
            <>
              <dt>Geometry</dt>
              <dd>{metadataPreview.geometryType}</dd>
            </>
          ) : null}
          {metadataPreview.wkid ? (
            <>
              <dt>Spatial ref</dt>
              <dd>WKID {metadataPreview.wkid}</dd>
            </>
          ) : null}
          {typeof metadataPreview.fieldCount === 'number' ? (
            <>
              <dt>Fields</dt>
              <dd>{metadataPreview.fieldCount}</dd>
            </>
          ) : null}
          {metadataPreview.extent ? (
            <>
              <dt>Extent</dt>
              <dd>{metadataPreview.extent}</dd>
            </>
          ) : null}
        </dl>
      ) : null}

      <label className="si-add-arcgis-layer-panel__check">
        <input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} />
        <span>Visible on map</span>
      </label>

      <label className="si-add-arcgis-layer-panel__field">
        <span>Opacity ({opacityPct}%)</span>
        <input
          type="range"
          min={5}
          max={100}
          step={5}
          value={opacityPct}
          onChange={e => setOpacityPct(Number(e.target.value))}
        />
      </label>

      {status ? <p className="si-add-arcgis-layer-panel__status">{status}</p> : null}

      <div className="si-add-arcgis-layer-panel__actions">
        <button type="button" className="si-add-arcgis-layer-panel__cancel" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="si-add-arcgis-layer-panel__submit"
          onClick={() => void handleAdd()}
          disabled={adding || !url.trim()}
        >
          {adding ? 'Adding…' : 'Add layer'}
        </button>
      </div>
    </SiAddSourceAnchoredPanel>
  )
}
