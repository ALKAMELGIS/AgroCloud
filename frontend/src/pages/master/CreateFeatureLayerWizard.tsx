import React, { useCallback, useMemo, useRef, useState } from 'react'
import { GisUploadCloudSources } from '../../components/GisUploadCloudSources'
import type { GisHostedFeatureLayerGeoJson } from '../../lib/gisHostedFeatureLayerPortal'
import { fetchHostedFeatureLayerGeoJsonFromServiceUrl } from '../../lib/gisHostedFeatureLayerPortal'
import {
  mergeShpLikeToFeatureCollection,
  normalizeGeoJsonEnvelope,
  parseFile,
} from '../../utils/FileLoader'
import { resolveArcGisLayerTitleFromUrl } from '../../lib/arcgisFeatureServiceUrl'
import {
  GIS_ARCGIS_URL_PLACEHOLDER,
  GIS_EXISTING_FEATURE_LAYERS,
  GIS_FEATURE_LAYER_GEOMETRY_TYPES,
  GIS_FEATURE_LAYER_METHODS,
  GIS_FEATURE_LAYER_TEMPLATES,
  GIS_SUPPORTED_UPLOAD_TYPES,
  type FeatureLayerGeometryType,
  type FeatureLayerMethod,
  type GisExistingFeatureLayer,
} from './gisFeatureLayerWizardData'
import type { CloudUploadSourceId } from '../../lib/cloudFilePickerConfig'

export type CreateFeatureLayerResult = {
  method: FeatureLayerMethod
  title: string
  geometryType?: FeatureLayerGeometryType
  sourceId?: string
  url?: string
  fileName?: string
  geojson?: GisHostedFeatureLayerGeoJson
  options: {
    gpsMetadata: boolean
    zValues: boolean
    mValues: boolean
  }
}

type WizardView = 'method' | 'details'

type CreateFeatureLayerWizardProps = {
  onBack: () => void
  onClose: () => void
  onComplete: (result: CreateFeatureLayerResult) => void
  initialMethod?: FeatureLayerMethod
  startOnDetails?: boolean
}

function LayerThumb({ variant }: { variant: GisExistingFeatureLayer['thumbVariant'] }) {
  return <span className={`gis-fl-wizard__thumb gis-fl-wizard__thumb--${variant}`} aria-hidden />
}

export function CreateFeatureLayerWizard({
  onBack,
  onClose,
  onComplete,
  initialMethod = 'define-own',
  startOnDetails = false,
}: CreateFeatureLayerWizardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [view, setView] = useState<WizardView>(startOnDetails ? 'details' : 'method')
  const [method, setMethod] = useState<FeatureLayerMethod>(initialMethod)
  const [layerName, setLayerName] = useState('Layer_1')
  const [geometryType, setGeometryType] = useState<FeatureLayerGeometryType>('point')
  const [gpsMetadata, setGpsMetadata] = useState(false)
  const [zValues, setZValues] = useState(false)
  const [mValues, setMValues] = useState(false)
  const [selectedLayerId, setSelectedLayerId] = useState(GIS_EXISTING_FEATURE_LAYERS[0]?.id ?? '')
  const [arcgisUrl, setArcgisUrl] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [listSearch, setListSearch] = useState('')
  const [listScope, setListScope] = useState('my-content')
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSource, setUploadSource] = useState<CloudUploadSourceId>('device')

  const listItems = useMemo(() => {
    const base = method === 'template' ? GIS_FEATURE_LAYER_TEMPLATES : GIS_EXISTING_FEATURE_LAYERS
    const q = listSearch.trim().toLowerCase()
    if (!q) return base
    return base.filter(item => item.title.toLowerCase().includes(q))
  }, [listSearch, method])

  const selectedListItem = useMemo(
    () => listItems.find(item => item.id === selectedLayerId) ?? listItems[0],
    [listItems, selectedLayerId],
  )

  const canProceed = useMemo(() => {
    if (view === 'method') return true
    switch (method) {
      case 'define-own':
        return layerName.trim().length > 0
      case 'existing':
      case 'template':
        return Boolean(selectedListItem)
      case 'arcgis-url':
        return /^https?:\/\/.+/i.test(arcgisUrl.trim())
      case 'upload':
        return uploadFile != null
      default:
        return false
    }
  }, [view, method, layerName, selectedListItem, arcgisUrl, uploadFile])

  const handleBack = () => {
    if (view === 'details') {
      setView('method')
      return
    }
    onBack()
  }

  const finishWizard = (payload: CreateFeatureLayerResult) => {
    onComplete(payload)
  }

  const handleNext = async () => {
    if (view === 'method') {
      setView('details')
      if (method === 'existing' || method === 'template') {
        const first = (method === 'template' ? GIS_FEATURE_LAYER_TEMPLATES : GIS_EXISTING_FEATURE_LAYERS)[0]
        if (first) setSelectedLayerId(first.id)
      }
      return
    }

    const title =
      method === 'define-own'
        ? layerName.trim()
        : method === 'existing' || method === 'template'
          ? selectedListItem?.title ?? 'Feature layer'
          : method === 'arcgis-url'
            ? resolveArcGisLayerTitleFromUrl(arcgisUrl.trim())
            : uploadFile?.name.replace(/\.[^.]+$/, '') ?? 'Uploaded layer'

    if (method === 'upload' && uploadFile) {
      setUploadBusy(true)
      setUploadError(null)
      try {
        const parsed = await parseFile(uploadFile)
        if (parsed.type !== 'geojson') throw new Error('File must contain GIS features (GeoJSON/KML/KMZ/Shapefile zip).')
        let geojson: any = parsed.data
        if (Array.isArray(geojson)) geojson = geojson[0]
        const normalized = normalizeGeoJsonEnvelope(mergeShpLikeToFeatureCollection(geojson))
        if (!normalized.features.length) throw new Error('No drawable features found in the uploaded file.')
        finishWizard({
          method,
          title,
          fileName: uploadFile.name,
          geojson: normalized as GisHostedFeatureLayerGeoJson,
          options: { gpsMetadata, zValues, mValues },
        })
      } catch (e: unknown) {
        setUploadError(e instanceof Error ? e.message : 'Failed to read uploaded file.')
      } finally {
        setUploadBusy(false)
      }
      return
    }

    if (method === 'arcgis-url') {
      const url = arcgisUrl.trim()
      if (!url) {
        setUploadError('Enter an ArcGIS FeatureServer layer URL.')
        return
      }
      setUploadBusy(true)
      setUploadError(null)
      try {
        const geojson = await fetchHostedFeatureLayerGeoJsonFromServiceUrl(url)
        if (!geojson.features.length) throw new Error('No drawable features returned from the ArcGIS service.')
        finishWizard({
          method,
          title,
          url,
          geojson,
          options: { gpsMetadata, zValues, mValues },
        })
      } catch (e: unknown) {
        setUploadError(e instanceof Error ? e.message : 'Failed to load ArcGIS layer.')
      } finally {
        setUploadBusy(false)
      }
      return
    }

    finishWizard({
      method,
      title,
      geometryType: method === 'define-own' ? geometryType : undefined,
      sourceId: method === 'existing' || method === 'template' ? selectedListItem?.id : undefined,
      url: undefined,
      fileName: uploadFile?.name,
      options: { gpsMetadata, zValues, mValues },
    })
  }

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const onFileChosen = (file: File | null) => {
    if (!file) return
    setUploadFile(file)
    setUploadSource('device')
  }

  return (
    <div
      className="gis-fl-wizard"
      role="dialog"
      aria-labelledby="gis-fl-wizard-title"
      onClick={e => e.stopPropagation()}
    >
      <header className="gis-fl-wizard__header">
        <h2 id="gis-fl-wizard-title" className="gis-fl-wizard__title">
          Create a feature layer
        </h2>
        <button type="button" className="gis-fl-wizard__icon-btn" aria-label="Close" onClick={onClose}>
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>

      <div className="gis-fl-wizard__body">
        {view === 'method' ? (
          <>
            <p className="gis-fl-wizard__lead">Select an option to create an empty feature layer.</p>
            <ul className="gis-fl-wizard__method-list">
              {GIS_FEATURE_LAYER_METHODS.map(opt => (
                <li key={opt.id}>
                  <label
                    className={`gis-fl-wizard__method${method === opt.id ? ' gis-fl-wizard__method--selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="fl-method"
                      value={opt.id}
                      checked={method === opt.id}
                      onChange={() => setMethod(opt.id)}
                    />
                    <span className="gis-fl-wizard__method-icon">
                      <i className={opt.icon} aria-hidden />
                    </span>
                    <span className="gis-fl-wizard__method-text">
                      <span className="gis-fl-wizard__method-title">{opt.title}</span>
                      <span className="gis-fl-wizard__method-desc">{opt.description}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {view === 'details' && method === 'define-own' ? (
          <>
            <section className="gis-fl-wizard__section">
              <h3 className="gis-fl-wizard__section-title">Specify name and type</h3>
              <div className="gis-fl-wizard__layer-row">
                <label className="gis-fl-wizard__field">
                  <span className="visually-hidden">Layer name</span>
                  <input
                    type="text"
                    value={layerName}
                    onChange={e => setLayerName(e.target.value)}
                    aria-label="Layer name"
                  />
                </label>
                <label className="gis-fl-wizard__field gis-fl-wizard__field--select">
                  <span className="gis-fl-wizard__select-icon">
                    <i
                      className={
                        GIS_FEATURE_LAYER_GEOMETRY_TYPES.find(g => g.id === geometryType)?.icon ??
                        'fa-solid fa-location-crosshairs'
                      }
                      aria-hidden
                    />
                  </span>
                  <select
                    value={geometryType}
                    onChange={e => setGeometryType(e.target.value as FeatureLayerGeometryType)}
                    aria-label="Layer type"
                  >
                    {GIS_FEATURE_LAYER_GEOMETRY_TYPES.map(g => (
                      <option key={g.id} value={g.id}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button type="button" className="gis-fl-wizard__link-btn">
                <i className="fa-solid fa-plus" aria-hidden /> Add
              </button>
            </section>
            <section className="gis-fl-wizard__section">
              <h3 className="gis-fl-wizard__section-title">Options</h3>
              <ToggleRow
                title="Add GPS metadata fields"
                description="Add fields to layers that support capturing GPS receiver information."
                checked={gpsMetadata}
                onChange={setGpsMetadata}
              />
              <ToggleRow
                title="Enable Z-values"
                description="Allows modeling point, polyline, and polygon features in 3D."
                checked={zValues}
                onChange={setZValues}
              />
              <ToggleRow
                title="Enable M-values"
                description="Allows storing a measure or value at each vertex for a geometry."
                checked={mValues}
                onChange={setMValues}
              />
            </section>
          </>
        ) : null}

        {view === 'details' && (method === 'existing' || method === 'template') ? (
          <>
            <div className="gis-fl-wizard__toolbar">
              <label className="gis-fl-wizard__scope">
                <select value={listScope} onChange={e => setListScope(e.target.value)} aria-label="Content scope">
                  <option value="my-content">My content</option>
                  <option value="org">My organization</option>
                  <option value="groups">My groups</option>
                </select>
                <i className="fa-solid fa-chevron-down" aria-hidden />
              </label>
              <label className="gis-fl-wizard__search">
                <i className="fa-solid fa-magnifying-glass" aria-hidden />
                <input
                  type="search"
                  placeholder="Search All my content"
                  value={listSearch}
                  onChange={e => setListSearch(e.target.value)}
                />
              </label>
            </div>
            <div className="gis-fl-wizard__list-meta">
              <span>
                1–{listItems.length} of {listItems.length}
              </span>
              <button type="button" className="gis-fl-wizard__sort-btn">
                Date modified
                <i className="fa-solid fa-bars-sort" aria-hidden />
              </button>
            </div>
            <ul className="gis-fl-wizard__pick-list">
              {listItems.map(item => (
                <li key={item.id}>
                  <label
                    className={`gis-fl-wizard__pick-card${
                      selectedLayerId === item.id ? ' gis-fl-wizard__pick-card--selected' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="fl-pick"
                      value={item.id}
                      checked={selectedLayerId === item.id}
                      onChange={() => setSelectedLayerId(item.id)}
                    />
                    <div className="gis-fl-wizard__pick-main">
                      <div className="gis-fl-wizard__pick-head">
                        <div>
                          <div className="gis-fl-wizard__pick-title">{item.title}</div>
                          <div className="gis-fl-wizard__pick-meta">
                            <i className="fa-solid fa-layer-group" aria-hidden />
                            Feature layer | Item updated: {item.modified}
                          </div>
                        </div>
                        <LayerThumb variant={item.thumbVariant} />
                      </div>
                      <div className="gis-fl-wizard__pick-foot">
                        <span className="gis-fl-wizard__pick-owner">
                          <span className="gis-fl-wizard__owner-dot" aria-hidden />
                          {item.owner}
                        </span>
                        <button
                          type="button"
                          className="gis-fl-wizard__preview-btn"
                          onClick={e => {
                            e.preventDefault()
                            e.stopPropagation()
                          }}
                        >
                          Preview
                        </button>
                      </div>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {view === 'details' && method === 'arcgis-url' ? (
          <section className="gis-fl-wizard__section gis-fl-wizard__section--url">
            <h3 className="gis-fl-wizard__section-title">URL</h3>
            <p className="gis-fl-wizard__lead">Specify a URL to a feature service</p>
            <input
              type="url"
              className="gis-fl-wizard__url-input"
              placeholder={GIS_ARCGIS_URL_PLACEHOLDER}
              value={arcgisUrl}
              onChange={e => setArcgisUrl(e.target.value)}
              aria-label="Feature service URL"
            />
          </section>
        ) : null}

        {view === 'details' && method === 'upload' ? (
          <section className="gis-fl-wizard__section gis-fl-wizard__section--upload">
            <div
              className="gis-fl-wizard__upload-zone"
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault()
                const file = e.dataTransfer.files?.[0]
                if (file) onFileChosen(file)
              }}
            >
              <i className="fa-regular fa-file-arrow-up gis-fl-wizard__upload-icon" aria-hidden />
              <p className="gis-fl-wizard__upload-title">Drag and drop your file or choose an option</p>
              <a
                className="gis-fl-wizard__upload-help"
                href={GIS_SUPPORTED_UPLOAD_TYPES}
                target="_blank"
                rel="noopener noreferrer"
              >
                Learn more about the supported file types
                <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden />
              </a>
              {uploadFile ? (
                <p className="gis-fl-wizard__upload-file">
                  <i className="fa-solid fa-file" aria-hidden /> {uploadFile.name}
                </p>
              ) : null}
              <GisUploadCloudSources
                className="gis-upload-cloud-sources--four gis-fl-wizard__upload-sources"
                includeDevice
                activeSource={uploadSource}
                onActiveSourceChange={setUploadSource}
                onDeviceClick={openFilePicker}
                onFile={file => onFileChosen(file)}
              />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="visually-hidden"
              accept=".csv,.xlsx,.xls,.zip,.shp,.geojson,.json,.kml,.kmz,.gpkg"
              onChange={e => onFileChosen(e.target.files?.[0] ?? null)}
            />
          </section>
        ) : null}
      </div>

      <footer className="gis-fl-wizard__footer">
        <button type="button" className="gis-fl-wizard__btn gis-fl-wizard__btn--back" onClick={handleBack}>
          Back
        </button>
        <div className="gis-fl-wizard__footer-right">
          <button type="button" className="gis-fl-wizard__btn gis-fl-wizard__btn--cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="gis-fl-wizard__btn gis-fl-wizard__btn--primary"
            disabled={!canProceed || uploadBusy}
            onClick={handleNext}
          >
            {uploadBusy ? 'Publishing…' : 'Next'}
          </button>
        </div>
      </footer>
    </div>
  )
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="gis-fl-wizard__toggle-row">
      <div>
        <div className="gis-fl-wizard__toggle-title">{title}</div>
        <div className="gis-fl-wizard__toggle-desc">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`gis-fl-wizard__switch${checked ? ' on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="gis-fl-wizard__switch-knob" />
      </button>
    </div>
  )
}
