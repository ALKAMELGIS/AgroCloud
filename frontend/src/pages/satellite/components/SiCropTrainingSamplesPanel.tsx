import { useCallback, useRef, useState } from 'react'
import { parseTrainingSampleFiles } from '../../../lib/cropSupervised/trainingSampleParser'
import { validateTrainingSamples } from '../../../lib/cropSupervised/trainingSampleValidator'
import type { CropTrainingSample, TrainingSampleValidation } from '../../../lib/cropSupervised/types'

export type SiCropTrainingSamplesPanelProps = {
  samples: CropTrainingSample[]
  onSamplesChange: (samples: CropTrainingSample[]) => void
  aoiGeometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null
  disabled?: boolean
}

export function SiCropTrainingSamplesPanel({
  samples,
  onSamplesChange,
  aoiGeometry,
  disabled,
}: SiCropTrainingSamplesPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [dropActive, setDropActive] = useState(false)

  const validation: TrainingSampleValidation = validateTrainingSamples(samples, aoiGeometry)

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return
      setParsing(true)
      setParseError(null)
      try {
        const parsed = await parseTrainingSampleFiles(Array.from(files))
        if (!parsed.length) {
          setParseError('No labelled geometries found. Use a class/crop/label property in your file.')
          return
        }
        onSamplesChange([...samples, ...parsed])
      } catch (err) {
        setParseError(String((err as Error)?.message || err))
      } finally {
        setParsing(false)
        if (inputRef.current) inputRef.current.value = ''
      }
    },
    [onSamplesChange, samples],
  )

  const clearAll = () => {
    onSamplesChange([])
    setParseError(null)
  }

  return (
    <div className="prithvi-tool__section prithvi-supervised-samples">
      <div className="prithvi-tool__legend-title">Training samples (ground truth)</div>
      <p className="prithvi-tool__sub">
        Upload SHP/ZIP, GeoJSON, KML/KMZ, CSV (lat/lng + class), or raster labels. Each feature needs a crop class label.
      </p>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".zip,.shp,.geojson,.json,.kml,.kmz,.csv,.gpkg,.tif,.tiff"
        disabled={disabled || parsing}
        style={{ display: 'none' }}
        onChange={e => void handleFiles(e.target.files)}
      />

      <div
        className={`prithvi-datasource__drop prithvi-supervised-samples__drop${dropActive ? ' is-active' : ''}`}
        onDragEnter={e => {
          e.preventDefault()
          if (!disabled) setDropActive(true)
        }}
        onDragOver={e => e.preventDefault()}
        onDragLeave={() => setDropActive(false)}
        onDrop={e => {
          e.preventDefault()
          setDropActive(false)
          if (!disabled && !parsing) void handleFiles(e.dataTransfer.files)
        }}
      >
        <i className="fa-solid fa-cloud-arrow-up" aria-hidden />
        <span>Drag &amp; drop training files</span>
      </div>

      <div className="prithvi-tool__row">
        <button
          type="button"
          className="prithvi-tool__btn"
          disabled={disabled || parsing}
          onClick={() => inputRef.current?.click()}
        >
          <i className="fa-solid fa-upload" aria-hidden />{' '}
          {parsing ? 'Parsing…' : 'Upload samples'}
        </button>
        {samples.length ? (
          <button type="button" className="prithvi-tool__btn" disabled={disabled} onClick={clearAll}>
            Clear
          </button>
        ) : null}
      </div>

      {parseError ? <div className="prithvi-tool__error">{parseError}</div> : null}

      {samples.length ? (
        <div className="prithvi-supervised-samples__summary">
          <span className="prithvi-tool__chip is-ok">
            {samples.length} sample{samples.length === 1 ? '' : 's'} · {Object.keys(validation.classCounts).length} classes
          </span>
          <ul className="prithvi-supervised-samples__classes">
            {Object.entries(validation.classCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([name, count]) => (
                <li key={name}>
                  <strong>{name}</strong> · {count}
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      {validation.errors.map(msg => (
        <div key={msg} className="prithvi-tool__error">
          {msg}
        </div>
      ))}
      {validation.warnings.map(msg => (
        <div key={msg} className="prithvi-tool__note">
          {msg}
        </div>
      ))}
    </div>
  )
}

export default SiCropTrainingSamplesPanel
