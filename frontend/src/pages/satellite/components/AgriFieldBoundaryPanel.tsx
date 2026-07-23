import { useRef } from 'react'
import type { FieldBoundaryPhase } from './useAgriFieldBoundary'
import {
  acceptForFieldSource,
  isFieldFileSource,
} from './useAgriFieldBoundary'
import type { FieldImagerySource } from '../../../lib/agriFieldBoundary/fieldBoundaryClient'
import './AgriFieldBoundaryPanel.css'

export type AgriFieldBoundaryPanelProps = {
  hasAoi: boolean
  source: FieldImagerySource
  onSourceChange: (s: FieldImagerySource) => void
  sourceOptions: Array<{ id: FieldImagerySource; label: string }>
  uploadedFileName?: string | null
  onUploadImageFile: (file: File | null) => void | Promise<void>
  onClearUploadedImage?: () => void
  minConfidence: number
  onMinConfidenceChange: (v: number) => void
  minAreaM2: number
  onMinAreaM2Change: (v: number) => void
  fillOpacity: number
  onFillOpacityChange: (v: number) => void
  phase: FieldBoundaryPhase
  progress: number
  busy: boolean
  error: string | null
  offline: boolean
  fieldCount: number
  totalAreaHa: number
  engine: string | null
  score?: number | null
  hasResult: boolean
  onRun: () => void
  onReset: () => void
  onExportGeojson: () => void
  onExportShapefile: () => void
  onAddToLayers?: () => void
}

const PHASE_LABEL: Record<FieldBoundaryPhase, string> = {
  idle: 'Ready — draw an AOI, then Detect Fields',
  capturing: 'Capturing high-res AOI imagery…',
  detecting: 'High-accuracy field delineation…',
  done: 'Field polygons ready',
  error: 'Detection failed',
}

export function AgriFieldBoundaryPanel({
  hasAoi,
  source,
  onSourceChange,
  sourceOptions,
  uploadedFileName,
  onUploadImageFile,
  onClearUploadedImage,
  minConfidence,
  onMinConfidenceChange,
  minAreaM2,
  onMinAreaM2Change,
  fillOpacity,
  onFillOpacityChange,
  phase,
  progress,
  busy,
  error,
  offline,
  fieldCount,
  totalAreaHa,
  engine,
  score,
  hasResult,
  onRun,
  onReset,
  onExportGeojson,
  onExportShapefile,
  onAddToLayers,
}: AgriFieldBoundaryPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const needsUpload = isFieldFileSource(source)
  const canRun = hasAoi && !busy && (!needsUpload || Boolean(uploadedFileName))
  const pct = Math.max(0, Math.min(100, Math.round(progress)))
  const showProgress = busy && (phase === 'detecting' || phase === 'capturing')

  const openFilePicker = () => {
    const el = fileInputRef.current
    if (!el) return
    el.value = ''
    el.click()
  }

  const handleSourceChange = (next: FieldImagerySource) => {
    onSourceChange(next)
    if (isFieldFileSource(next)) {
      // Defer so the select value updates before the native dialog opens.
      requestAnimationFrame(() => openFilePicker())
    }
  }

  return (
    <div className="si-afb">
      <section className="si-afb__card">
        <label className="si-afb__row">
          <span className="si-afb__label">Imagery source</span>
          <select
            className="si-afb__select"
            value={source}
            disabled={busy}
            onChange={e => handleSourceChange(e.target.value as FieldImagerySource)}
          >
            {sourceOptions.map(o => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <input
          ref={fileInputRef}
          type="file"
          className="si-afb__file-input"
          accept={acceptForFieldSource(source)}
          disabled={busy}
          tabIndex={-1}
          aria-hidden
          onChange={e => {
            const file = e.target.files?.[0] ?? null
            void onUploadImageFile(file)
          }}
        />

        {needsUpload ? (
          <div className="si-afb__upload-row">
            <button
              type="button"
              className="si-afb__btn"
              disabled={busy}
              onClick={openFilePicker}
              title="Browse for a local image"
            >
              <i className="fa-solid fa-folder-open" aria-hidden />{' '}
              {uploadedFileName ? 'Change image' : 'Browse image…'}
            </button>
            {uploadedFileName ? (
              <span className="si-afb__file-name" title={uploadedFileName}>
                <i className="fa-solid fa-image" aria-hidden /> {uploadedFileName}
                {onClearUploadedImage ? (
                  <button
                    type="button"
                    className="si-afb__file-clear"
                    disabled={busy}
                    aria-label="Remove uploaded image"
                    onClick={onClearUploadedImage}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ) : (
              <span className="si-afb__file-hint">Select a local image for this source</span>
            )}
          </div>
        ) : null}

        <label className="si-afb__row">
          <span className="si-afb__label">
            Confidence <em>{Math.round(minConfidence * 100)}%</em>
          </span>
          <input
            type="range"
            min={0.2}
            max={0.9}
            step={0.05}
            value={minConfidence}
            disabled={busy}
            onChange={e => onMinConfidenceChange(Number(e.target.value))}
          />
        </label>

        <label className="si-afb__row">
          <span className="si-afb__label">
            Min area <em>{minAreaM2} m²</em>
          </span>
          <input
            type="range"
            min={50}
            max={5000}
            step={50}
            value={minAreaM2}
            disabled={busy}
            onChange={e => onMinAreaM2Change(Number(e.target.value))}
          />
        </label>

        <label className="si-afb__row">
          <span className="si-afb__label">
            Overlay opacity <em>{Math.round(fillOpacity * 100)}%</em>
          </span>
          <input
            type="range"
            min={0.1}
            max={0.85}
            step={0.05}
            value={fillOpacity}
            onChange={e => onFillOpacityChange(Number(e.target.value))}
          />
        </label>

        {!hasAoi ? (
          <p className="si-afb__warn">
            <i className="fa-solid fa-draw-polygon" aria-hidden /> Draw an AOI on the map (polygon /
            rectangle) to run AOI-wide field detection.
          </p>
        ) : null}

        <div className="si-afb__actions">
          <button
            type="button"
            className="si-afb__btn si-afb__btn--primary"
            disabled={!canRun}
            onClick={onRun}
            title="Run Mask R-CNN field boundary detection across the AOI"
          >
            <i className="fa-solid fa-crop-simple" aria-hidden />{' '}
            {busy ? 'Detecting…' : 'Detect Fields'}
          </button>
          <button type="button" className="si-afb__btn si-afb__btn--ghost" disabled={busy} onClick={onReset}>
            Reset
          </button>
        </div>

        {hasResult ? (
          <div className="si-afb__stats" aria-label="Field statistics">
            <span>
              <strong>{fieldCount}</strong> fields
            </span>
            <span>
              <strong>{totalAreaHa.toFixed(2)}</strong> ha
            </span>
            {engine ? (
              <span className="si-afb__engine" title="Detection engine">
                {engine}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="si-afb__actions si-afb__actions--export">
          <button
            type="button"
            className="si-afb__btn"
            disabled={!hasResult}
            onClick={onExportGeojson}
            title="Export GeoJSON (QGIS / ArcGIS / GeoPackage workflow)"
          >
            <i className="fa-solid fa-file-code" aria-hidden /> GeoJSON
          </button>
          <button
            type="button"
            className="si-afb__btn"
            disabled={!hasResult}
            onClick={() => void onExportShapefile()}
            title="Export Shapefile ZIP"
          >
            <i className="fa-solid fa-file-zipper" aria-hidden /> Shapefile
          </button>
          {onAddToLayers ? (
            <button
              type="button"
              className="si-afb__btn"
              disabled={!hasResult}
              onClick={onAddToLayers}
              title="Add field polygons to map Layers"
            >
              <i className="fa-solid fa-layer-group" aria-hidden /> Add layer
            </button>
          ) : null}
        </div>

        <div className={`si-afb__status is-${phase}`}>
          {phase === 'error' ? (
            <>
              <i className="fa-solid fa-triangle-exclamation" aria-hidden /> {error || PHASE_LABEL[phase]}
              {offline ? (
                <span className="si-afb__hint-inline">
                  {' '}
                  Start: <code>uvicorn app:app --port 8092</code> in{' '}
                  <code>backend/services/agri-field-boundary</code>
                </span>
              ) : null}
            </>
          ) : (
            <>
              {busy ? <i className="fa-solid fa-circle-notch fa-spin" aria-hidden /> : null}{' '}
              {PHASE_LABEL[phase]}
              {phase === 'detecting' && showProgress ? (
                <span className="si-afb__hint-inline"> · {pct}%</span>
              ) : null}
              {phase === 'done' && typeof score === 'number' ? (
                <span className="si-afb__hint-inline"> · quality {(score * 100).toFixed(0)}%</span>
              ) : null}
            </>
          )}
          {showProgress && phase === 'detecting' ? (
            <div className="si-afb__progress" aria-hidden>
              <div className="si-afb__progress-track">
                <div className="si-afb__progress-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
