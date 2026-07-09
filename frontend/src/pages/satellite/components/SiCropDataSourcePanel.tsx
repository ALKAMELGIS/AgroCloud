import { useCallback, useRef, useState } from 'react'
import {
  acceptExtensionsForProvider,
  formatDatasetPixelSize,
  parseCropImageryDataset,
  type CropImageryDataset,
} from '../../../lib/cropSupervised/cropImageryDataset'
import {
  CROP_DATA_PROVIDERS,
  cropProviderDef,
  cropProviderRequiresUpload,
  normalizeCropDataProvider,
  type CropDataProviderId,
} from '../../../lib/cropSupervised/cropDataProvider'

export type SiCropDataSourcePanelProps = {
  dataProvider: CropDataProviderId
  onDataProviderChange: (id: CropDataProviderId) => void
  dataset: CropImageryDataset | null
  onDatasetChange: (dataset: CropImageryDataset | null) => void
  disabled?: boolean
  imagePlacementBounds?: { west: number; south: number; east: number; north: number }
}

export function SiCropDataSourcePanel({
  dataProvider,
  onDataProviderChange,
  dataset,
  onDatasetChange,
  disabled,
  imagePlacementBounds,
}: SiCropDataSourcePanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [dropActive, setDropActive] = useState(false)

  const normalizedProvider = normalizeCropDataProvider(dataProvider)
  const providerMeta = cropProviderDef(dataProvider)
  const needsUpload = cropProviderRequiresUpload(dataProvider)
  const accept = acceptExtensionsForProvider(dataProvider)

  const handleFiles = useCallback(
    async (files: FileList | File[] | null) => {
      const list = files ? Array.from(files) : []
      const file = list[0]
      if (!file) return
      setParsing(true)
      setParseError(null)
      try {
        const parsed = await parseCropImageryDataset(file, normalizedProvider, {
          imagePlacementBounds,
          onProgress: () => {},
        })
        onDatasetChange(parsed)
      } catch (err) {
        setParseError(String((err as Error)?.message || err))
      } finally {
        setParsing(false)
        if (inputRef.current) inputRef.current.value = ''
      }
    },
    [imagePlacementBounds, normalizedProvider, onDatasetChange],
  )

  const clearDataset = () => {
    onDatasetChange(null)
    setParseError(null)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDropActive(false)
    if (disabled || parsing) return
    void handleFiles(e.dataTransfer.files)
  }

  return (
    <div className="prithvi-tool__section prithvi-datasource">
      <div className="prithvi-tool__section-title">Data Source &amp; Analysis Input</div>

      <label className="prithvi-tool__stack" htmlFor="crop-data-provider">
        <span className="prithvi-tool__provider-label">Data provider</span>
        <select
          id="crop-data-provider"
          className="prithvi-tool__provider-select"
          value={normalizedProvider}
          disabled={disabled}
          onChange={e => onDataProviderChange(e.target.value as CropDataProviderId)}
        >
          <optgroup label="Satellite imagery">
            {CROP_DATA_PROVIDERS.filter(p => p.group === 'satellite').map(p => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Upload / high-resolution">
            {CROP_DATA_PROVIDERS.filter(p => p.group === 'upload').map(p => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </optgroup>
        </select>
      </label>

      <p className="prithvi-tool__sub">{providerMeta.description}</p>

      {needsUpload ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            disabled={disabled || parsing}
            style={{ display: 'none' }}
            onChange={e => void handleFiles(e.target.files)}
          />

          <div
            className={`prithvi-datasource__drop${dropActive ? ' is-active' : ''}${dataset ? ' has-file' : ''}`}
            onDragEnter={e => {
              e.preventDefault()
              if (!disabled) setDropActive(true)
            }}
            onDragOver={e => e.preventDefault()}
            onDragLeave={() => setDropActive(false)}
            onDrop={onDrop}
            role="button"
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
            }}
          >
            {dataset ? (
              <div className="prithvi-datasource__preview">
                {dataset.previewUrl ? (
                  <img src={dataset.previewUrl} alt="" className="prithvi-datasource__thumb" />
                ) : (
                  <div className="prithvi-datasource__thumb prithvi-datasource__thumb--icon">
                    <i className="fa-solid fa-cloud" aria-hidden />
                  </div>
                )}
                <div className="prithvi-datasource__meta">
                  <strong>{dataset.metadata.fileName}</strong>
                  <span>{dataset.metadata.format}</span>
                </div>
              </div>
            ) : (
              <div className="prithvi-datasource__empty">
                <i className="fa-solid fa-cloud-arrow-up" aria-hidden />
                <span>Drag &amp; drop dataset here</span>
                <span className="prithvi-datasource__hint">or use Upload dataset below</span>
              </div>
            )}
          </div>

          <div className="prithvi-tool__row">
            <button
              type="button"
              className="prithvi-tool__btn"
              disabled={disabled || parsing}
              onClick={() => inputRef.current?.click()}
            >
              <i className="fa-solid fa-upload" aria-hidden />{' '}
              {parsing ? 'Reading…' : 'Upload dataset'}
            </button>
            {dataset ? (
              <button type="button" className="prithvi-tool__btn" disabled={disabled} onClick={clearDataset}>
                Remove
              </button>
            ) : null}
          </div>

          {parseError ? <div className="prithvi-tool__error">{parseError}</div> : null}

          {dataset ? (
            <dl className="prithvi-datasource__details">
              <div>
                <dt>Resolution</dt>
                <dd>
                  {dataset.metadata.widthPx && dataset.metadata.heightPx
                    ? `${dataset.metadata.widthPx}×${dataset.metadata.heightPx} px`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt>Pixel size</dt>
                <dd>{formatDatasetPixelSize(dataset.metadata.pixelSizeM)}</dd>
              </div>
              <div>
                <dt>CRS</dt>
                <dd>{dataset.metadata.crs || '—'}</dd>
              </div>
              <div>
                <dt>Bands</dt>
                <dd>{dataset.metadata.bands ?? '—'}</dd>
              </div>
              <div>
                <dt>Spectral</dt>
                <dd>{dataset.metadata.spectralType ?? 'unknown'}</dd>
              </div>
              <div>
                <dt>Acquired</dt>
                <dd>{dataset.metadata.acquisitionDate || '—'}</dd>
              </div>
            </dl>
          ) : null}
        </>
      ) : (
        <div className="prithvi-tool__note">
          <i className="fa-solid fa-satellite" aria-hidden /> Satellite scenes are fetched automatically for your AOI
          and season window — no file upload required.
        </div>
      )}
    </div>
  )
}

export default SiCropDataSourcePanel
