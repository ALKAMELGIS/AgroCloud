import { useCallback, useMemo, useRef, useState } from 'react'
import type { FeatureCollection } from 'geojson'
import { parseFile } from '../../../utils/FileLoader'
import {
  asFeatureCollection,
  exportVectorLayer,
  safeBaseName,
  type VectorExportFormat,
} from '../../../lib/vectorLayerExport'
import './VectorLayerExportPanel.css'

export type VectorExportLayerOption = {
  id: string
  name: string
  geojson: FeatureCollection | unknown
}

type VectorLayerExportPanelProps = {
  onClose: () => void
  /** Vector layers currently on the map (upload / Agro Structures / imports). */
  mapLayers?: VectorExportLayerOption[]
}

export function VectorLayerExportPanel({ onClose, mapLayers = [] }: VectorLayerExportPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [sourceMode, setSourceMode] = useState<'map' | 'file'>(mapLayers.length ? 'map' : 'file')
  const [selectedLayerId, setSelectedLayerId] = useState(mapLayers[0]?.id ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [fileFc, setFileFc] = useState<FeatureCollection | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Choose a map layer or upload a vector file.')
  const [error, setError] = useState<string | null>(null)

  const vectorMapLayers = useMemo(
    () =>
      mapLayers.filter(l => {
        const fc = asFeatureCollection(l.geojson)
        return fc.features.length > 0
      }),
    [mapLayers],
  )

  const activeFc = useMemo((): FeatureCollection | null => {
    if (sourceMode === 'file') return fileFc
    const hit = vectorMapLayers.find(l => l.id === selectedLayerId)
    return hit ? asFeatureCollection(hit.geojson) : null
  }, [sourceMode, fileFc, vectorMapLayers, selectedLayerId])

  const activeName = useMemo(() => {
    if (sourceMode === 'file') return file ? safeBaseName(file.name) : 'layer'
    return safeBaseName(vectorMapLayers.find(l => l.id === selectedLayerId)?.name || 'layer')
  }, [sourceMode, file, vectorMapLayers, selectedLayerId])

  const featureCount = activeFc?.features.length ?? 0

  const loadFile = useCallback(async (next: File | null) => {
    setFile(next)
    setFileFc(null)
    setError(null)
    if (!next) {
      setMessage('Choose a map layer or upload a vector file.')
      return
    }
    setBusy(true)
    setMessage(`Reading ${next.name}…`)
    try {
      const parsed = await parseFile(next)
      if (parsed.type !== 'geojson') {
        throw new Error('Only vector layers (KMZ / KML / SHP / GeoJSON) can be exported.')
      }
      const fc = asFeatureCollection(parsed.data)
      if (!fc.features.length) throw new Error('File contains no features.')
      setFileFc(fc)
      setMessage(`${fc.features.length} feature(s) ready.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setMessage('Could not read file.')
    } finally {
      setBusy(false)
    }
  }, [])

  const onExport = useCallback(
    async (format: VectorExportFormat) => {
      if (!activeFc?.features.length) {
        setError('Select a layer or upload a vector file first.')
        return
      }
      setBusy(true)
      setError(null)
      setMessage(`Exporting ${format.toUpperCase()}…`)
      try {
        await exportVectorLayer(activeFc, format, activeName)
        setMessage(`Downloaded ${activeName}.${format === 'shp' ? 'zip' : format === 'xlsx' ? 'xlsx' : 'kmz'}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setMessage('Export failed.')
      } finally {
        setBusy(false)
      }
    },
    [activeFc, activeName],
  )

  return (
    <div className="si-env-section-card si-field-analysis si-vector-export-panel si-rs-panel--glass">
      <div className="si-vector-export__head">
        <div className="si-vector-export__title">Export KMZ · SHP · XLSX</div>
        <button type="button" className="si-env-close" onClick={onClose} aria-label="Close">
          <i className="fa-solid fa-xmark" />
        </button>
      </div>

      <div className="si-vector-export__mode" role="group" aria-label="Source">
        <button
          type="button"
          className={`si-vector-export__mode-btn${sourceMode === 'map' ? ' is-on' : ''}`}
          disabled={!vectorMapLayers.length}
          onClick={() => {
            setSourceMode('map')
            setError(null)
            setMessage(
              vectorMapLayers.length
                ? `${asFeatureCollection(vectorMapLayers.find(l => l.id === selectedLayerId)?.geojson).features.length || 0} feature(s) from map.`
                : 'No vector layers on the map.',
            )
          }}
        >
          Map layer
        </button>
        <button
          type="button"
          className={`si-vector-export__mode-btn${sourceMode === 'file' ? ' is-on' : ''}`}
          onClick={() => {
            setSourceMode('file')
            setError(null)
            setMessage(fileFc ? `${fileFc.features.length} feature(s) ready.` : 'Upload a vector file.')
          }}
        >
          Upload file
        </button>
      </div>

      {sourceMode === 'map' ? (
        <label className="si-vector-export__field">
          <span>Layer</span>
          <select
            value={selectedLayerId}
            disabled={busy || !vectorMapLayers.length}
            onChange={e => {
              setSelectedLayerId(e.target.value)
              setError(null)
              const hit = vectorMapLayers.find(l => l.id === e.target.value)
              const n = hit ? asFeatureCollection(hit.geojson).features.length : 0
              setMessage(n ? `${n} feature(s) from map.` : 'Select a layer.')
            }}
          >
            {!vectorMapLayers.length ? <option value="">No vector layers</option> : null}
            {vectorMapLayers.map(l => (
              <option key={l.id} value={l.id}>
                {l.name} ({asFeatureCollection(l.geojson).features.length})
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="si-vector-export__field">
          <span>Vector file</span>
          <input
            ref={inputRef}
            type="file"
            accept=".kmz,.kml,.shp,.zip,.geojson,.json"
            disabled={busy}
            onChange={e => void loadFile(e.target.files?.[0] ?? null)}
          />
          {file ? <span className="si-vector-export__file">{file.name}</span> : null}
        </label>
      )}

      <div className="si-vector-export__msg" aria-live="polite">
        {message}
        {featureCount ? ` · ${featureCount} feature(s)` : ''}
      </div>
      {error ? <div className="si-vector-export__error">{error}</div> : null}

      <div className="si-vector-export__actions">
        <button
          type="button"
          className="si-vector-export__btn si-vector-export__btn--primary"
          disabled={busy || !featureCount}
          onClick={() => void onExport('kmz')}
        >
          <i className="fa-solid fa-file-zipper" aria-hidden /> KMZ
        </button>
        <button
          type="button"
          className="si-vector-export__btn si-vector-export__btn--primary"
          disabled={busy || !featureCount}
          onClick={() => void onExport('shp')}
        >
          <i className="fa-solid fa-map" aria-hidden /> SHP
        </button>
        <button
          type="button"
          className="si-vector-export__btn si-vector-export__btn--primary"
          disabled={busy || !featureCount}
          onClick={() => void onExport('xlsx')}
        >
          <i className="fa-solid fa-file-excel" aria-hidden /> XLSX
        </button>
      </div>
    </div>
  )
}

export default VectorLayerExportPanel
