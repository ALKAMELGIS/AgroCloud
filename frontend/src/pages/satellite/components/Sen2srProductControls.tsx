/**
 * Shared SEN2SR product-mode controls (status chip, RAW vs SEN2SR, optional 1m display).
 * Used by Agri Field Boundary and Remote Sensing toolbox panels.
 */

import { useEffect, useRef } from 'react'
import {
  formatSen2srStatusLabel,
  type Sen2srProductMode,
  type Sen2srStatus,
} from '../../../lib/agriFieldBoundary/sen2srClient'
import './Sen2srProductControls.css'

export type Sen2srProductControlsProps = {
  status: Sen2srStatus | null
  productMode: Sen2srProductMode
  onProductModeChange: (mode: Sen2srProductMode) => void
  display1m: boolean
  onDisplay1mChange: (checked: boolean) => void
  /** When true, show GeoTIFF picker (SEN2SR mode only). */
  showFilePicker?: boolean
  geotiffFileName?: string | null
  onPickGeotiff?: (file: File | null) => void
  /** Drone RGB / GeoTIFF upload when product mode is drone. */
  droneFileName?: string | null
  onPickDroneImage?: (file: File | null) => void
  /** Dedicated enhance action — detection / WMS stay independent. */
  onEnhance?: () => void
  canEnhance?: boolean
  enhanceBusy?: boolean
  enhanceError?: string | null
  enhanceNotice?: string | null
  disabled?: boolean
  /** Extra copy under RAW mode (e.g. WMS stays native 10 m). */
  rawHint?: string | null
  /** Extra copy when SEN2SR is selected but no file yet. */
  sen2srHint?: string | null
  basemapHint?: string | null
  droneHint?: string | null
}

export function Sen2srProductControls({
  status,
  productMode,
  onProductModeChange,
  display1m,
  onDisplay1mChange,
  showFilePicker = false,
  geotiffFileName = null,
  onPickGeotiff,
  droneFileName = null,
  onPickDroneImage,
  onEnhance,
  canEnhance = false,
  enhanceBusy = false,
  enhanceError = null,
  enhanceNotice = null,
  disabled = false,
  rawHint = '',
  sen2srHint = 'Upload a Sentinel-2 L2A GeoTIFF to run neural super-resolution (2.5 m). Does not rewrite WMS as native 2.5 m.',
  basemapHint = 'Uses Esri / Google basemap RGB from the current map as capture imagery.',
  droneHint = 'Upload a drone RGB / GeoTIFF / PNG / JPEG for field detection.',
}: Sen2srProductControlsProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const droneFileRef = useRef<HTMLInputElement>(null)
  const available = Boolean(status?.available)
  const chipTitle =
    status?.error || `device=${status?.device || 'unknown'} · out=${status?.output_resolution || '2.5m'}`

  useEffect(() => {
    if (productMode !== 'sen2sr' && fileRef.current) fileRef.current.value = ''
    if (productMode !== 'drone' && droneFileRef.current) droneFileRef.current.value = ''
  }, [productMode])

  const openPicker = () => {
    const el = fileRef.current
    if (!el) return
    el.value = ''
    el.click()
  }

  const openDronePicker = () => {
    const el = droneFileRef.current
    if (!el) return
    el.value = ''
    el.click()
  }

  return (
    <div className="si-sen2sr" data-mode={productMode}>
      {/* Only the ready state is worth a badge — the offline one just adds noise. */}
      {available ? (
        <div className="si-sen2sr__head">
          <span
            className="si-sen2sr__chip is-available"
            title={chipTitle}
            role="status"
            aria-live="polite"
          >
            {formatSen2srStatusLabel(status)}
          </span>
        </div>
      ) : null}

      <label className="si-sen2sr__row">
        <span className="si-sen2sr__label">Product mode</span>
        <select
          className="si-sen2sr__select"
          value={productMode}
          disabled={disabled || enhanceBusy}
          aria-label="Sentinel-2 product mode"
          onChange={e => onProductModeChange(e.target.value as Sen2srProductMode)}
        >
          <option value="raw">RAW SENTINEL-2 — Native 10 m</option>
          <option value="sen2sr">AI SUPER-RESOLUTION — SEN2SR 2.5 m</option>
          <option value="basemap">BASEMAP — Esri / Google map RGB</option>
          <option value="drone">DRONE — Upload RGB / GeoTIFF imagery</option>
        </select>
      </label>

      {productMode === 'raw' ? (
        rawHint ? (
          <p className="si-sen2sr__hint" role="note">
            {rawHint}
          </p>
        ) : null
      ) : null}

      {productMode === 'basemap' ? (
        basemapHint ? (
          <p className="si-sen2sr__hint" role="note">
            {basemapHint}
          </p>
        ) : null
      ) : null}

      {productMode === 'drone' ? (
        <>
          {onPickDroneImage ? (
            <div className="si-sen2sr__upload">
              <input
                ref={droneFileRef}
                type="file"
                className="si-sen2sr__file-input"
                accept=".tif,.tiff,.png,.jpg,.jpeg,image/tiff,image/png,image/jpeg"
                disabled={disabled || enhanceBusy}
                tabIndex={-1}
                aria-hidden
                onChange={e => {
                  const file = e.target.files?.[0] ?? null
                  onPickDroneImage(file)
                }}
              />
              <button
                type="button"
                className="si-sen2sr__btn"
                disabled={disabled || enhanceBusy}
                onClick={openDronePicker}
                title="Browse for a drone RGB / GeoTIFF / PNG / JPEG"
              >
                <i className="fa-solid fa-folder-open" aria-hidden />{' '}
                {droneFileName ? 'Change drone image' : 'Browse drone imagery…'}
              </button>
              {droneFileName ? (
                <span className="si-sen2sr__file-name" title={droneFileName}>
                  <i className="fa-solid fa-image" aria-hidden /> {droneFileName}
                  <button
                    type="button"
                    className="si-sen2sr__file-clear"
                    disabled={disabled || enhanceBusy}
                    aria-label="Remove drone image"
                    onClick={() => onPickDroneImage(null)}
                  >
                    ×
                  </button>
                </span>
              ) : (
                <span className="si-sen2sr__file-hint">Drone RGB / GeoTIFF / PNG / JPEG</span>
              )}
            </div>
          ) : null}
          {droneHint && !droneFileName ? (
            <p className="si-sen2sr__hint" role="note">
              {droneHint}
            </p>
          ) : null}
        </>
      ) : null}

      {productMode === 'sen2sr' ? (
        <>
          <label className="si-sen2sr__row si-sen2sr__row--check">
            <span className="si-sen2sr__label">AI Enhanced 1m Display</span>
            <input
              type="checkbox"
              checked={display1m}
              disabled={disabled || enhanceBusy || !available}
              title="Resample the neural 2.5 m product to 1 m for display only — never labeled as native 1 m Sentinel-2"
              aria-label="Generate AI Enhanced 1m Display"
              onChange={e => onDisplay1mChange(e.target.checked)}
            />
          </label>

          {showFilePicker && onPickGeotiff ? (
            <div className="si-sen2sr__upload">
              <input
                ref={fileRef}
                type="file"
                className="si-sen2sr__file-input"
                accept=".tif,.tiff,image/tiff"
                disabled={disabled || enhanceBusy}
                tabIndex={-1}
                aria-hidden
                onChange={e => {
                  const file = e.target.files?.[0] ?? null
                  onPickGeotiff(file)
                }}
              />
              <button
                type="button"
                className="si-sen2sr__btn"
                disabled={disabled || enhanceBusy}
                onClick={openPicker}
                title="Browse for a local Sentinel-2 L2A GeoTIFF"
              >
                <i className="fa-solid fa-folder-open" aria-hidden />{' '}
                {geotiffFileName ? 'Change L2A GeoTIFF' : 'Browse L2A GeoTIFF…'}
              </button>
              {geotiffFileName ? (
                <span className="si-sen2sr__file-name" title={geotiffFileName}>
                  <i className="fa-solid fa-image" aria-hidden /> {geotiffFileName}
                  <button
                    type="button"
                    className="si-sen2sr__file-clear"
                    disabled={disabled || enhanceBusy}
                    aria-label="Remove GeoTIFF"
                    onClick={() => onPickGeotiff(null)}
                  >
                    ×
                  </button>
                </span>
              ) : (
                <span className="si-sen2sr__file-hint">Sentinel-2 L2A GeoTIFF required</span>
              )}
            </div>
          ) : null}

          {sen2srHint && !geotiffFileName ? (
            <p className="si-sen2sr__hint" role="note">
              {sen2srHint}
            </p>
          ) : null}

          {onEnhance ? (
            <button
              type="button"
              className="si-sen2sr__btn si-sen2sr__btn--primary"
              disabled={disabled || enhanceBusy || !canEnhance || !available}
              onClick={onEnhance}
              title={
                !available
                  ? 'SEN2SR unavailable — start agri-field-boundary with model loaded'
                  : !canEnhance
                    ? 'Select a Sentinel-2 L2A GeoTIFF first'
                    : 'Run SEN2SRLite neural super-resolution (10 m → 2.5 m)'
              }
            >
              {enhanceBusy ? (
                <i className="fa-solid fa-circle-notch fa-spin" aria-hidden />
              ) : (
                <i className="fa-solid fa-wand-magic-sparkles" aria-hidden />
              )}{' '}
              {enhanceBusy ? 'Enhancing…' : 'Enhance with SEN2SR'}
            </button>
          ) : null}

          {enhanceError ? (
            <p className="si-sen2sr__error" role="alert">
              {enhanceError}
            </p>
          ) : null}
          {enhanceNotice && !enhanceError ? (
            <p className="si-sen2sr__notice" role="status">
              {enhanceNotice}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
