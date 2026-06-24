import { useCallback, useMemo, useState } from 'react'
import { useGisContentPortal } from '../../../../lib/gisContentPortalStore'
import { discoverArcGisServiceLayers, type ArcGisDiscoveredLayer } from '../../../../lib/arcgisServiceDiscover'
import { GIS_CONTENT_DATA_FORMAT_LABELS } from '../../../../lib/gisContentRepository'
import { useAcpPlatform } from '../acpPlatformContext'
import { AcpMapPanel } from './AcpMapPanel'
import { isAcpExcludedPortalMapRow } from './acpPortalMapLayers'
import {
  ingestAcpLayerFromArcGisRest,
  ingestAcpLayerFromGisContent,
  ingestAcpLayerFromUpload,
  ingestAcpLayerFromUrl,
  ingestAcpWmsLayer,
  ingestAcpWmtsLayer,
} from './acpGisLayerIngest'
import './AcpAddGisLayerPanel.css'

type TabId = 'upload' | 'url' | 'rest' | 'wms' | 'wmts' | 'content'

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'upload', label: 'Upload', icon: 'fa-file-arrow-up' },
  { id: 'url', label: 'URL', icon: 'fa-link' },
  { id: 'rest', label: 'REST', icon: 'fa-server' },
  { id: 'wms', label: 'WMS', icon: 'fa-layer-group' },
  { id: 'wmts', label: 'WMTS', icon: 'fa-table-cells' },
  { id: 'content', label: 'GIS Content', icon: 'fa-folder-tree' },
]

type Props = { onClose: () => void }

export function AcpAddGisLayerPanel({ onClose }: Props) {
  const acp = useAcpPlatform()
  const portal = useGisContentPortal()
  const [tab, setTab] = useState<TabId>('upload')
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [remoteUrl, setRemoteUrl] = useState('')

  const [serviceUrl, setServiceUrl] = useState('')
  const [restToken, setRestToken] = useState('')
  const [discovered, setDiscovered] = useState<ArcGisDiscoveredLayer[]>([])
  const [selectedRestUrl, setSelectedRestUrl] = useState('')

  const [wmsUrl, setWmsUrl] = useState('')
  const [wmsLayerName, setWmsLayerName] = useState('')

  const [wmtsUrl, setWmtsUrl] = useState('')
  const [wmtsLayerName, setWmtsLayerName] = useState('')
  const [wmtsMatrixSet, setWmtsMatrixSet] = useState('EPSG:3857')

  const contentLayers = useMemo(
    () => portal.rows.filter(r => r.type === 'feature-layer' && !isAcpExcludedPortalMapRow(r)),
    [portal.rows],
  )

  const finishIngest = useCallback(
    async (runner: () => Promise<{ message: string; geojson?: GeoJSON.FeatureCollection | null; isAgroStructures?: boolean }>) => {
      setBusy(true)
      setError(null)
      setStatus(null)
      try {
        const result = await runner()
        if (result.isAgroStructures) acp.refreshEngine()
        else if (result.geojson?.features?.length) acp.mapFocusGeoJsonRef.current?.(result.geojson)
        setStatus(result.message)
        setTitle('')
        setUploadFile(null)
        setRemoteUrl('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add layer.')
      } finally {
        setBusy(false)
      }
    },
    [acp],
  )

  const onDiscoverRest = useCallback(async () => {
    setBusy(true)
    setError(null)
    setDiscovered([])
    try {
      const layers = await discoverArcGisServiceLayers(serviceUrl, restToken)
      setDiscovered(layers)
      setSelectedRestUrl(layers[0]?.url ?? '')
      if (!title.trim() && layers[0]?.name) setTitle(layers[0].name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discovery failed.')
    } finally {
      setBusy(false)
    }
  }, [restToken, serviceUrl, title])

  return (
    <AcpMapPanel title="Add GIS Layer Data" onClose={onClose} className="acp-map-panel--add-gis">
      <div className="acp-add-gis__tabs" role="tablist" aria-label="GIS data source">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className={tab === t.id ? 'is-on' : ''}
            aria-selected={tab === t.id}
            onClick={() => {
              setTab(t.id)
              setError(null)
            }}
          >
            <i className={`fa-solid ${t.icon}`} aria-hidden />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <label className="acp-add-gis__field">
        <span>Layer title</span>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Optional display name"
        />
      </label>

      {tab === 'upload' ? (
        <div className="acp-add-gis__section">
          <p className="acp-add-gis__hint">GeoJSON, Shapefile (.zip), KML, KMZ, or CSV with coordinates.</p>
          <label className="acp-add-gis__upload">
            <input
              type="file"
              className="acp-add-gis__upload-input"
              accept=".geojson,.json,.zip,.kml,.kmz,.csv"
              onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
            />
            <span className="acp-add-gis__upload-face">
              <i className="fa-solid fa-cloud-arrow-up" aria-hidden />
              <span className="acp-add-gis__upload-name">
                {uploadFile ? uploadFile.name : 'Tap to choose file…'}
              </span>
            </span>
          </label>
          <button
            type="button"
            className="acp-add-gis__submit"
            disabled={busy || !uploadFile}
            onClick={() => {
              if (!uploadFile) return
              void finishIngest(() => ingestAcpLayerFromUpload(uploadFile, title))
            }}
          >
            {busy ? 'Adding…' : 'Add to map'}
          </button>
        </div>
      ) : null}

      {tab === 'url' ? (
        <div className="acp-add-gis__section">
          <label className="acp-add-gis__field">
            <span>Data URL</span>
            <input
              type="url"
              value={remoteUrl}
              onChange={e => setRemoteUrl(e.target.value)}
              placeholder="https://…/layer.geojson"
            />
          </label>
          <button
            type="button"
            className="acp-add-gis__submit"
            disabled={busy || !remoteUrl.trim()}
            onClick={() => void finishIngest(() => ingestAcpLayerFromUrl(remoteUrl, title))}
          >
            {busy ? 'Adding…' : 'Add to map'}
          </button>
        </div>
      ) : null}

      {tab === 'rest' ? (
        <div className="acp-add-gis__section">
          <label className="acp-add-gis__field">
            <span>ArcGIS REST service URL</span>
            <input
              type="url"
              value={serviceUrl}
              onChange={e => setServiceUrl(e.target.value)}
              placeholder="https://…/FeatureServer"
            />
          </label>
          <label className="acp-add-gis__field">
            <span>Token (optional)</span>
            <input type="text" value={restToken} onChange={e => setRestToken(e.target.value)} />
          </label>
          <button type="button" className="acp-add-gis__secondary" disabled={busy || !serviceUrl.trim()} onClick={() => void onDiscoverRest()}>
            {busy ? 'Discovering…' : 'Discover layers'}
          </button>
          {discovered.length ? (
            <label className="acp-add-gis__field">
              <span>Layer</span>
              <select value={selectedRestUrl} onChange={e => setSelectedRestUrl(e.target.value)}>
                {discovered.map(layer => (
                  <option key={layer.url} value={layer.url}>
                    {layer.name} ({layer.kind})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            className="acp-add-gis__submit"
            disabled={busy || !selectedRestUrl}
            onClick={() =>
              void finishIngest(() =>
                ingestAcpLayerFromArcGisRest({
                  layerUrl: selectedRestUrl,
                  title,
                  token: restToken,
                }),
              )
            }
          >
            {busy ? 'Adding…' : 'Add to map'}
          </button>
        </div>
      ) : null}

      {tab === 'wms' ? (
        <div className="acp-add-gis__section">
          <label className="acp-add-gis__field">
            <span>WMS service URL</span>
            <input type="url" value={wmsUrl} onChange={e => setWmsUrl(e.target.value)} placeholder="https://…/wms" />
          </label>
          <label className="acp-add-gis__field">
            <span>Layer name</span>
            <input type="text" value={wmsLayerName} onChange={e => setWmsLayerName(e.target.value)} placeholder="e.g. countries" />
          </label>
          <button
            type="button"
            className="acp-add-gis__submit"
            disabled={busy || !wmsUrl.trim() || !wmsLayerName.trim()}
            onClick={() =>
              void finishIngest(async () =>
                ingestAcpWmsLayer({ serviceUrl: wmsUrl, layerName: wmsLayerName, title }),
              )
            }
          >
            {busy ? 'Adding…' : 'Add WMS layer'}
          </button>
        </div>
      ) : null}

      {tab === 'wmts' ? (
        <div className="acp-add-gis__section">
          <label className="acp-add-gis__field">
            <span>WMTS service URL</span>
            <input type="url" value={wmtsUrl} onChange={e => setWmtsUrl(e.target.value)} placeholder="https://…/wmts" />
          </label>
          <label className="acp-add-gis__field">
            <span>Layer identifier</span>
            <input type="text" value={wmtsLayerName} onChange={e => setWmtsLayerName(e.target.value)} />
          </label>
          <label className="acp-add-gis__field">
            <span>Tile matrix set</span>
            <input type="text" value={wmtsMatrixSet} onChange={e => setWmtsMatrixSet(e.target.value)} />
          </label>
          <button
            type="button"
            className="acp-add-gis__submit"
            disabled={busy || !wmtsUrl.trim() || !wmtsLayerName.trim()}
            onClick={() =>
              void finishIngest(async () =>
                ingestAcpWmtsLayer({
                  serviceUrl: wmtsUrl,
                  layerName: wmtsLayerName,
                  tileMatrixSet: wmtsMatrixSet,
                  title,
                }),
              )
            }
          >
            {busy ? 'Adding…' : 'Add WMTS layer'}
          </button>
        </div>
      ) : null}

      {tab === 'content' ? (
        <div className="acp-add-gis__section">
          <p className="acp-add-gis__hint">Hosted layers from GIS Content repository.</p>
          <ul className="acp-map-panel__add-list">
            {contentLayers.map(row => {
              const format = portal.getItemDetails(row.id)?.dataFormat
              const formatLabel = format ? GIS_CONTENT_DATA_FORMAT_LABELS[format] : row.typeLabel
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void finishIngest(() => ingestAcpLayerFromGisContent(row))}
                  >
                    <span>{row.title}</span>
                    <small>{formatLabel}</small>
                  </button>
                </li>
              )
            })}
          </ul>
          {!contentLayers.length ? <p className="acp-map-panel__empty">No hosted layers in GIS Content.</p> : null}
        </div>
      ) : null}

      {error ? (
        <p className="acp-add-gis__error" role="alert">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="acp-add-gis__status" role="status">
          {status}
        </p>
      ) : null}
    </AcpMapPanel>
  )
}
