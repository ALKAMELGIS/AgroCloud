import { useEffect, useRef, useState, type DragEvent } from 'react'
import './RasterGeoreferencePanel.css'
import type { GeorefMode } from '../../../../lib/raster/rasterGeorefPlacement'
import type { UseRasterGeoreferenceToolReturn } from './useRasterGeoreferenceTool'
import { searchCrs, type CrsSearchResult } from '../../../../lib/raster/crsCatalog'

const RASTER_ACCEPT =
  '.tif,.tiff,.geotiff,.jp2,.j2k,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tfw,.pgw,.jgw,.jpgw,.wld,.prj,.xml,image/tiff,image/png,image/jpeg'

const GEOREF_MODES: Array<{ id: GeorefMode; label: string; icon: string; hint: string }> = [
  { id: 'bbox', label: 'Bounds', icon: 'fa-vector-square', hint: 'North-up bounding box (W/S/E/N)' },
  { id: 'corners', label: 'Corners', icon: 'fa-crop-simple', hint: 'Four corner coordinates (supports rotation)' },
  { id: 'gcps', label: 'GCPs', icon: 'fa-thumbtack', hint: 'Ground control points (>= 3)' },
  { id: 'draw', label: 'Draw', icon: 'fa-draw-polygon', hint: 'Draw a rectangle on the map' },
  { id: 'view', label: 'View', icon: 'fa-expand', hint: 'Fit to the current map view' },
]

function describeGeorefSource(source: string): string {
  if (source === 'dimap') return 'Auto-detected from DIMAP metadata (DIM_*.XML)'
  if (source === 'worldfile') return 'Auto-detected from world file'
  if (source === 'embedded') return 'Detected from embedded projection'
  if (source.startsWith('manual:')) {
    const mode = source.slice('manual:'.length)
    const label =
      mode === 'corners' ? 'corner coordinates' : mode === 'gcps' ? 'ground control points' : 'bounding box'
    return `Placed manually via ${label}`
  }
  return 'Georeferenced'
}

function formatBytes(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let v = bytes
  let u = 0
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024
    u += 1
  }
  return `${v.toFixed(v < 10 && u > 0 ? 1 : 0)} ${units[u]}`
}

/** Typeahead search over the EPSG database to assign/override a raster's CRS. */
function CrsSearchRow({
  onAssign,
  busy,
}: {
  onAssign: (code: string) => void
  busy: boolean
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<CrsSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!q.trim()) {
      setResults([])
      setOpen(false)
      return
    }
    const ctl = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const rows = await searchCrs(q, 12, ctl.signal)
        setResults(rows)
        setOpen(true)
      } catch {
        /* aborted or failed — keep prior results */
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => {
      ctl.abort()
      clearTimeout(t)
    }
  }, [q])

  return (
    <div className="si-rgt__crs">
      <span className="si-rgt__label">Coordinate system</span>
      <div className="si-rgt__crs-search">
        <i className="fa-solid fa-magnifying-glass" aria-hidden />
        <input
          type="text"
          value={q}
          placeholder='Search "UTM Zone 40N", "EPSG:32640", "WGS84"…'
          onChange={e => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          disabled={busy}
        />
        {loading ? <i className="fa-solid fa-spinner fa-spin" aria-hidden /> : null}
      </div>
      {open && results.length ? (
        <ul className="si-rgt__crs-results">
          {results.map(r => (
            <li key={r.code}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setQ('')
                  onAssign(r.code)
                }}
                disabled={busy}
              >
                <span className="si-rgt__crs-name">{r.name}</span>
                <span className="si-rgt__crs-meta">
                  {r.code}
                  {r.units ? ` · ${r.units}` : ''}
                  {r.accuracy != null ? ` · ±${r.accuracy} m` : ''}
                </span>
                {r.areaOfUse ? <span className="si-rgt__crs-area">{r.areaOfUse}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export type RasterGeoreferencePanelProps = {
  tool: UseRasterGeoreferenceToolReturn
  hasDrawnGeometry?: boolean
  onClose?: () => void
}

export function RasterGeoreferencePanel({ tool, hasDrawnGeometry = false, onClose }: RasterGeoreferencePanelProps) {
  const {
    raster,
    busy,
    error,
    statusMessage,
    uploadRaster,
    clearRaster,
    georefPending,
    georefBusy,
    georefMode,
    setGeorefMode,
    georefSourceDetected,
    georefBbox,
    setGeorefBboxField,
    georefCorners,
    setGeorefCornerField,
    georefGcps,
    addGeorefGcp,
    updateGeorefGcp,
    removeGeorefGcp,
    captureGcpMapPoint,
    applyGeoreference,
    applyGeoreferenceFromDrawn,
    placeAtCurrentView,
    cancelGeoreference,
    display,
    setDisplayField,
    resetDisplay,
    rotateTo,
    resetNorth,
    assignCrs,
    assigningCrs,
    exportGeoTiff,
    exporting,
    projects,
    currentProject,
    newProject,
    openProject,
    saveCurrentProject,
    renameCurrentProject,
    deleteCurrentProject,
  } = tool

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const onPickFiles = (files: FileList | null) => {
    if (!files || !files.length) return
    void uploadRaster(Array.from(files))
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    onPickFiles(e.dataTransfer?.files ?? null)
  }

  const bbox = raster?.bboxWgs84
  const extentText = bbox
    ? `${bbox.west.toFixed(5)}, ${bbox.south.toFixed(5)} -> ${bbox.east.toFixed(5)}, ${bbox.north.toFixed(5)}`
    : '—'

  return (
    <div className="si-rgt">
      <div className="si-rgt__head">
        <div className="si-rgt__title">
          <i className="fa-solid fa-layer-group" aria-hidden />
          <span>Raster &amp; Georeferencing</span>
        </div>
        {onClose ? (
          <button type="button" className="si-rgt__icon-btn" title="Close" onClick={onClose}>
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        ) : null}
      </div>

      {/* Project bar */}
      <section className="si-rgt__card">
        <div className="si-rgt__row">
          <label className="si-rgt__project-select">
            <span className="si-rgt__label">Project</span>
            <select
              value={currentProject?.id ?? ''}
              onChange={e => {
                if (e.target.value) void openProject(e.target.value)
              }}
            >
              <option value="">{currentProject ? currentProject.name : 'No project'}</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.rasters.length})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="si-rgt__project-actions">
          <button
            type="button"
            className="si-rgt__btn"
            onClick={() => {
              const name = window.prompt('New project name', 'Untitled project')
              if (name != null) newProject(name)
            }}
          >
            <i className="fa-solid fa-plus" aria-hidden /> New
          </button>
          <button
            type="button"
            className="si-rgt__btn"
            disabled={!currentProject}
            onClick={saveCurrentProject}
          >
            <i className="fa-solid fa-floppy-disk" aria-hidden /> Save
          </button>
          <button
            type="button"
            className="si-rgt__btn"
            disabled={!currentProject}
            onClick={() => {
              if (!currentProject) return
              const name = window.prompt('Rename project', currentProject.name)
              if (name != null) renameCurrentProject(name)
            }}
          >
            <i className="fa-solid fa-pen" aria-hidden /> Rename
          </button>
          <button
            type="button"
            className="si-rgt__btn si-rgt__btn--danger"
            disabled={!currentProject}
            onClick={() => {
              if (currentProject && window.confirm(`Delete project "${currentProject.name}"?`)) {
                deleteCurrentProject()
              }
            }}
          >
            <i className="fa-solid fa-trash" aria-hidden /> Delete
          </button>
        </div>
      </section>

      {/* Add raster */}
      <section className="si-rgt__card">
        <span className="si-rgt__label">Add raster layer</span>
        <div
          className={'si-rgt__drop' + (dragOver ? ' si-rgt__drop--over' : '')}
          onDragOver={e => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
          }}
        >
          <i className="fa-solid fa-cloud-arrow-up" aria-hidden />
          <span>{busy ? 'Uploading…' : 'Drag &amp; drop or click to choose imagery'}</span>
          <small>GeoTIFF, COG, JP2, PNG, JPEG, drone / Google Earth (+ world file / DIMAP sidecars)</small>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={RASTER_ACCEPT}
          hidden
          onChange={e => onPickFiles(e.target.files)}
        />
      </section>

      {statusMessage ? <p className="si-rgt__status">{statusMessage}</p> : null}
      {error ? (
        <p className="si-rgt__error" role="alert">
          {error}
        </p>
      ) : null}

      {/* Georeference */}
      {georefPending ? (
        <section className="si-rgt__card si-rgt__georef">
          <div className="si-rgt__georef-head">
            <i className="fa-solid fa-crosshairs" aria-hidden />
            <span>Georeference “{georefPending.name}”</span>
          </div>
          <p className="si-rgt__georef-sub">
            {georefPending.widthPx}×{georefPending.heightPx}px, no spatial reference. Set its true location,
            preview the footprint, then apply.
          </p>

          <div className="si-rgt__georef-modes" role="tablist" aria-label="Georeferencing mode">
            {GEOREF_MODES.map(m => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={georefMode === m.id}
                title={m.hint}
                className={'si-rgt__georef-mode' + (georefMode === m.id ? ' si-rgt__georef-mode--active' : '')}
                onClick={() => setGeorefMode(m.id)}
              >
                <i className={`fa-solid ${m.icon}`} aria-hidden /> {m.label}
              </button>
            ))}
          </div>

          {georefMode === 'bbox' ? (
            <div className="si-rgt__grid">
              {(['north', 'west', 'east', 'south'] as const).map(key => (
                <label key={key} className="si-rgt__input">
                  <span>{key[0].toUpperCase() + key.slice(1)}</span>
                  <input
                    type="number"
                    step="any"
                    value={georefBbox[key]}
                    onChange={e => setGeorefBboxField(key, e.target.value)}
                  />
                </label>
              ))}
            </div>
          ) : null}

          {georefMode === 'corners' ? (
            <div className="si-rgt__grid si-rgt__grid--corners">
              {(['nw', 'ne', 'se', 'sw'] as const).map(corner => (
                <div key={corner} className="si-rgt__corner">
                  <span className="si-rgt__corner-label">{corner.toUpperCase()}</span>
                  <input
                    type="number"
                    step="any"
                    placeholder="lon"
                    value={georefCorners[corner].lon}
                    onChange={e => setGeorefCornerField(corner, 'lon', e.target.value)}
                  />
                  <input
                    type="number"
                    step="any"
                    placeholder="lat"
                    value={georefCorners[corner].lat}
                    onChange={e => setGeorefCornerField(corner, 'lat', e.target.value)}
                  />
                </div>
              ))}
            </div>
          ) : null}

          {georefMode === 'gcps' ? (
            <div className="si-rgt__gcps">
              <p className="si-rgt__georef-sub">
                Add ≥3 points: image pixel (col,row) ↔ map (lon,lat). Click the map, then “Use map point”.
              </p>
              {georefGcps.map((g, i) => (
                <div key={g.id} className="si-rgt__gcp">
                  <span className="si-rgt__gcp-idx">{i + 1}</span>
                  <input type="number" step="any" placeholder="col" value={g.col} onChange={e => updateGeorefGcp(g.id, 'col', e.target.value)} />
                  <input type="number" step="any" placeholder="row" value={g.row} onChange={e => updateGeorefGcp(g.id, 'row', e.target.value)} />
                  <input type="number" step="any" placeholder="lon" value={g.lon} onChange={e => updateGeorefGcp(g.id, 'lon', e.target.value)} />
                  <input type="number" step="any" placeholder="lat" value={g.lat} onChange={e => updateGeorefGcp(g.id, 'lat', e.target.value)} />
                  <button type="button" className="si-rgt__gcp-btn" title="Use last map click" onClick={() => captureGcpMapPoint(g.id)}>
                    <i className="fa-solid fa-location-crosshairs" aria-hidden />
                  </button>
                  <button type="button" className="si-rgt__gcp-btn si-rgt__gcp-btn--del" title="Remove point" onClick={() => removeGeorefGcp(g.id)}>
                    <i className="fa-solid fa-xmark" aria-hidden />
                  </button>
                </div>
              ))}
              <button type="button" className="si-rgt__btn si-rgt__btn--ghost" onClick={addGeorefGcp} disabled={georefBusy}>
                <i className="fa-solid fa-plus" aria-hidden /> Add point
              </button>
            </div>
          ) : null}

          {georefMode === 'draw' ? (
            <p className="si-rgt__georef-sub">Draw a rectangle on the map with the draw tool, then apply.</p>
          ) : null}
          {georefMode === 'view' ? (
            <p className="si-rgt__georef-sub">Place across the current map view (aspect-preserving). Frame it first.</p>
          ) : null}

          <div className="si-rgt__georef-actions">
            <button
              type="button"
              className="si-rgt__btn si-rgt__btn--primary"
              onClick={() => {
                if (georefMode === 'draw') void applyGeoreferenceFromDrawn()
                else if (georefMode === 'view') void placeAtCurrentView()
                else void applyGeoreference()
              }}
              disabled={georefBusy || (georefMode === 'draw' && !hasDrawnGeometry)}
            >
              {georefBusy ? 'Placing…' : 'Apply placement'}
            </button>
            <button type="button" className="si-rgt__btn si-rgt__btn--ghost" onClick={cancelGeoreference} disabled={georefBusy}>
              Cancel
            </button>
          </div>
          <button type="button" className="si-rgt__btn si-rgt__btn--ghost si-rgt__ai" disabled title="AI auto-alignment is coming in a future update">
            <i className="fa-solid fa-wand-magic-sparkles" aria-hidden /> AI auto-align (coming soon)
          </button>
        </section>
      ) : null}

      {/* Raster info + display controls */}
      {raster && !georefPending ? (
        <>
          <section className="si-rgt__card">
            <div className="si-rgt__info-head">
              <span className="si-rgt__label">{raster.name}</span>
              <button type="button" className="si-rgt__icon-btn" title="Remove raster" onClick={clearRaster}>
                <i className="fa-solid fa-xmark" aria-hidden />
              </button>
            </div>
            {georefSourceDetected ? (
              <p className="si-rgt__georef-note">
                <i className="fa-solid fa-circle-check" aria-hidden /> {describeGeorefSource(georefSourceDetected)}
              </p>
            ) : null}
            <dl className="si-rgt__info">
              <div><dt>CRS</dt><dd>{raster.crsInfo?.name ? `${raster.crsInfo.name} (${raster.crs})` : raster.crs || '—'}</dd></div>
              <div><dt>Extent</dt><dd>{extentText}</dd></div>
              <div><dt>Pixel size</dt><dd>{raster.pixelSizeMeters ? `${raster.pixelSizeMeters.toFixed(2)} m` : '—'}</dd></div>
              <div><dt>Dimensions</dt><dd>{raster.widthPx && raster.heightPx ? `${raster.widthPx} × ${raster.heightPx}px` : '—'}</dd></div>
              <div><dt>Bands</dt><dd>{raster.bands || '—'}</dd></div>
              <div><dt>File size</dt><dd>{formatBytes(raster.byteSize)}{raster.isCog ? ' · COG' : ''}</dd></div>
            </dl>
            <CrsSearchRow onAssign={code => void assignCrs(code)} busy={assigningCrs} />
            {assigningCrs ? <p className="si-rgt__status">Re-projecting to the new coordinate system…</p> : null}
          </section>

          {raster.crsValidation ? (
            <section className="si-rgt__card si-rgt__valid">
              <span className="si-rgt__label">
                <i className="fa-solid fa-clipboard-check" aria-hidden /> GIS validation
              </span>
              <dl className="si-rgt__info">
                <div><dt>Raster CRS</dt><dd>{raster.crsValidation.sourceName || raster.crsValidation.sourceCrs} ({raster.crsValidation.sourceCrs})</dd></div>
                <div><dt>Source datum</dt><dd>{raster.crsValidation.sourceDatum || '—'}</dd></div>
                <div><dt>Display CRS</dt><dd>{raster.crsValidation.targetName || raster.crsValidation.targetCrs} ({raster.crsValidation.targetCrs})</dd></div>
                <div><dt>Transformation</dt><dd>{raster.crsValidation.transformationApplied || '—'}</dd></div>
                <div><dt>Units</dt><dd>{raster.crsValidation.units || '—'}</dd></div>
                <div><dt>Accuracy</dt><dd>{raster.crsValidation.accuracy != null ? `±${raster.crsValidation.accuracy} m` : '—'}</dd></div>
              </dl>
              {raster.crsValidation.warnings.length ? (
                <ul className="si-rgt__warnings">
                  {raster.crsValidation.warnings.map((w, i) => (
                    <li key={i}>
                      <i className="fa-solid fa-triangle-exclamation" aria-hidden /> {w}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="si-rgt__valid-ok">
                  <i className="fa-solid fa-circle-check" aria-hidden /> No projection warnings.
                </p>
              )}
            </section>
          ) : null}

          <section className="si-rgt__card">
            <div className="si-rgt__row si-rgt__row--between">
              <span className="si-rgt__label">Display</span>
              <button type="button" className="si-rgt__btn si-rgt__btn--ghost si-rgt__btn--sm" onClick={resetDisplay}>
                Reset
              </button>
            </div>
            <label className="si-rgt__slider">
              <span>Opacity / compare</span>
              <input type="range" min={0} max={1} step={0.01} value={display.opacity} onChange={e => setDisplayField('opacity', Number(e.target.value))} />
              <em>{Math.round(display.opacity * 100)}%</em>
            </label>
            <label className="si-rgt__slider">
              <span>Brightness</span>
              <input type="range" min={0} max={1} step={0.01} value={display.brightness} onChange={e => setDisplayField('brightness', Number(e.target.value))} />
              <em>{Math.round(display.brightness * 100)}%</em>
            </label>
            <label className="si-rgt__slider">
              <span>Contrast</span>
              <input type="range" min={-1} max={1} step={0.01} value={display.contrast} onChange={e => setDisplayField('contrast', Number(e.target.value))} />
              <em>{display.contrast.toFixed(2)}</em>
            </label>
            <label className="si-rgt__slider">
              <span>Saturation</span>
              <input type="range" min={-1} max={1} step={0.01} value={display.saturation} onChange={e => setDisplayField('saturation', Number(e.target.value))} />
              <em>{display.saturation.toFixed(2)}</em>
            </label>
            <label className="si-rgt__slider">
              <span>Hue</span>
              <input type="range" min={0} max={359} step={1} value={display.hue} onChange={e => setDisplayField('hue', Number(e.target.value))} />
              <em>{display.hue}°</em>
            </label>
            <div className="si-rgt__row si-rgt__row--between">
              <label className="si-rgt__slider si-rgt__slider--inline">
                <span>Rotate</span>
                <input type="range" min={0} max={359} step={1} defaultValue={0} onChange={e => rotateTo(Number(e.target.value))} />
              </label>
              <button type="button" className="si-rgt__btn si-rgt__btn--ghost si-rgt__btn--sm" onClick={resetNorth}>
                <i className="fa-solid fa-compass" aria-hidden /> North
              </button>
            </div>
          </section>

          <section className="si-rgt__card">
            <button type="button" className="si-rgt__btn si-rgt__btn--primary si-rgt__export" onClick={() => void exportGeoTiff()} disabled={exporting}>
              <i className="fa-solid fa-file-export" aria-hidden /> {exporting ? 'Exporting…' : 'Save As GeoTIFF'}
            </button>
          </section>
        </>
      ) : null}
    </div>
  )
}
