import { Fragment, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import './RasterGeoreferenceRibbon.css'
import type { GeorefMode } from '../../../../lib/raster/rasterGeorefPlacement'
import type { UseRasterGeoreferenceToolReturn } from './useRasterGeoreferenceTool'
import { searchCrs, type CrsSearchResult } from '../../../../lib/raster/crsCatalog'
import type { ServerRasterLayerConfig } from '../../../../lib/raster/siRasterTileService'
const RASTER_ACCEPT =
  '.tif,.tiff,.geotiff,.jp2,.j2k,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tfw,.pgw,.jgw,.jpgw,.wld,.prj,.xml,image/tiff,image/png,image/jpeg'

/** Georeferencing transformation models → the engine's placement mode. */
const TRANSFORMATIONS: Array<{ id: GeorefMode; label: string }> = [
  { id: 'bbox', label: 'North-up (bounding box)' },
  { id: 'corners', label: 'Affine (4 corners)' },
  { id: 'gcps', label: 'Polynomial (control points)' },
  { id: 'draw', label: 'Draw rectangle on map' },
  { id: 'view', label: 'Fit to current view' },
]

export type RasterGeoreferenceRibbonProps = {
  tool: UseRasterGeoreferenceToolReturn
  hasDrawnGeometry?: boolean
  /** Rasters already on the map (layer list) that can be picked as the georeference target. */
  existingRasters?: ServerRasterLayerConfig[]
  /** Pan/zoom the map (used by Locate and Zoom To). */
  onFlyTo?: (lon: number, lat: number, zoom?: number) => void
  onClose?: () => void
  /**
   * 'panel' (default) stacks vertically for the side dock; 'bar' lays the ribbon groups
   * out horizontally for a floating ArcGIS-style toolbar across the top of the map.
   */
  variant?: 'panel' | 'bar'
}

type RibbonTool = {
  id: string
  label: string
  icon: string
  onClick?: () => void
  disabled?: boolean
  active?: boolean
  danger?: boolean
  /** Marks tools that have no backend yet. */
  soon?: boolean
  title?: string
}

function ToolButton({ t }: { t: RibbonTool }) {
  return (
    <button
      type="button"
      className={
        'si-grb__tool' +
        (t.active ? ' si-grb__tool--active' : '') +
        (t.danger ? ' si-grb__tool--danger' : '')
      }
      onClick={t.onClick}
      disabled={t.disabled || t.soon || !t.onClick}
      title={t.title ?? (t.soon ? `${t.label} — coming soon` : t.label)}
      aria-pressed={t.active}
    >
      <i className={`fa-solid ${t.icon}`} aria-hidden />
      <span>{t.label}</span>
      {t.soon ? <span className="si-grb__tool-badge">soon</span> : null}
    </button>
  )
}

function RibbonGroup({ label, tools }: { label: string; tools: RibbonTool[] }) {
  return (
    <div className="si-grb__group">
      <div className="si-grb__group-body">
        {tools.map(t => (
          <ToolButton key={t.id} t={t} />
        ))}
      </div>
      <span className="si-grb__group-label">{label}</span>
    </div>
  )
}

export function RasterGeoreferenceRibbon({
  tool,
  hasDrawnGeometry = false,
  existingRasters = [],
  onFlyTo,
  onClose,
  variant = 'panel',
}: RasterGeoreferenceRibbonProps) {
  const {
    raster,
    busy,
    error,
    statusMessage,
    uploadRaster,
    selectExistingRaster,
    clearRaster,
    georefPending,
    georefBusy,
    georefMode,
    setGeorefMode,
    georefBbox,
    setGeorefBboxField,
    georefCorners,
    setGeorefCornerField,
    georefGcps,
    addGeorefGcp,
    updateGeorefGcp,
    removeGeorefGcp,
    captureGcpMapPoint,
    gcpPicking,
    gcpPickPhase,
    startGcpPicking,
    stopGcpPicking,
    gcpRms,
    undoGcp,
    redoGcp,
    canUndoGcp,
    canRedoGcp,
    applyGcps,
    applyGeoreference,
    applyGeoreferenceFromDrawn,
    placeAtCurrentView,
    cancelGeoreference,
    manipMode,
    setManipMode,
    flipRaster,
    resetRasterNorth,
    autoGeoreference,
    smartBusy,
    runSmartAutoGeoreferenceDirect,
    importGcpsFromFile,
    assignCrs,
    assigningCrs,
    exportGeoTiff,
    exportWorldFile,
    exporting,
  } = tool

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const cpFileInputRef = useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [activePanel, setActivePanel] = useState<'srs' | null>(null)
  const [autoApply, setAutoApply] = useState(false)
  const [showTable, setShowTable] = useState(true)
  const [selectedGcpId, setSelectedGcpId] = useState<string | null>(null)

  const pending = !!georefPending
  const hasGcps = georefGcps.length > 0
  const hasRaster = !!raster
  const transformBusy = georefBusy

  const runApply = () => {
    if (georefMode === 'draw') void applyGeoreferenceFromDrawn()
    else if (georefMode === 'view') void placeAtCurrentView()
    else void applyGeoreference()
  }

  // Auto Apply: re-run placement (debounced) whenever inputs change while enabled.
  // Control points (gcps mode) are live-applied by the hook itself, so skip them here.
  useEffect(() => {
    if (!autoApply || !pending || georefBusy) return
    if (georefMode === 'gcps') return
    if (georefMode === 'draw' && !hasDrawnGeometry) return
    const t = setTimeout(() => {
      if (georefMode === 'draw') void applyGeoreferenceFromDrawn()
      else if (georefMode === 'view') void placeAtCurrentView()
      else void applyGeoreference()
    }, 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoApply, pending, georefMode, georefBbox, georefCorners, georefGcps, hasDrawnGeometry])

  const onPickFiles = (files: FileList | null) => {
    if (!files || !files.length) return
    void uploadRaster(Array.from(files))
  }
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    onPickFiles(e.dataTransfer?.files ?? null)
  }

  const exportControlPoints = () => {
    const header = 'index,col,row,lon,lat'
    const lines = georefGcps.map((g, i) => `${i + 1},${g.col},${g.row},${g.lon},${g.lat}`)
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${raster?.name ?? 'raster'}-control-points.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const deleteSelectedGcp = () => {
    if (!selectedGcpId) return
    removeGeorefGcp(selectedGcpId)
    setSelectedGcpId(null)
  }
  const deleteAllGcps = () => {
    georefGcps.forEach(g => removeGeorefGcp(g.id))
    setSelectedGcpId(null)
  }

  const locate = () => {
    if (!onFlyTo) return
    const input = window.prompt('Go to coordinate — enter "lat, lon":', '')
    if (!input) return
    const parts = input.split(/[\s,;]+/).map(Number).filter(Number.isFinite)
    if (parts.length < 2) {
      window.alert('Enter two numbers as "lat, lon".')
      return
    }
    onFlyTo(parts[1], parts[0], 14)
  }

  const zoomTo = () => {
    if (!onFlyTo) return
    const selected = georefGcps.find(g => g.id === selectedGcpId)
    if (selected) {
      const lon = Number(selected.lon)
      const lat = Number(selected.lat)
      if (Number.isFinite(lon) && Number.isFinite(lat)) {
        onFlyTo(lon, lat, 16)
        return
      }
    }
    const b = raster?.bboxWgs84
    if (b) onFlyTo((b.west + b.east) / 2, (b.south + b.north) / 2)
  }

  const generateReport = () => {
    const b = raster?.bboxWgs84
    const lines: string[] = [
      'Georeferencing Report',
      '=====================',
      `Raster: ${raster?.name ?? '—'}`,
      `CRS: ${raster?.crsInfo?.name ? `${raster.crsInfo.name} (${raster.crs})` : raster?.crs ?? '—'}`,
      `Dimensions: ${raster?.widthPx ?? '—'} × ${raster?.heightPx ?? '—'} px`,
      `Extent (WGS84): ${b ? `${b.west.toFixed(6)}, ${b.south.toFixed(6)} → ${b.east.toFixed(6)}, ${b.north.toFixed(6)}` : '—'}`,
      `Control points: ${georefGcps.length}`,
      '',
      'index,col,row,lon,lat',
      ...georefGcps.map((g, i) => `${i + 1},${g.col},${g.row},${g.lon},${g.lat}`),
      '',
      `Generated: ${new Date().toISOString()}`,
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${raster?.name ?? 'raster'}-georef-report.txt`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const prepareTools: RibbonTool[] = [
    {
      id: 'locate',
      label: 'Locate',
      icon: 'fa-location-dot',
      disabled: !onFlyTo,
      onClick: locate,
    },
    {
      id: 'set-srs',
      label: 'Set SRS',
      icon: 'fa-globe',
      active: activePanel === 'srs',
      disabled: !raster,
      onClick: () => setActivePanel(p => (p === 'srs' ? null : 'srs')),
    },
    {
      id: 'fit-display',
      label: 'Fit to Display',
      icon: 'fa-expand',
      disabled: (!pending && !hasRaster) || georefBusy,
      onClick: () => void autoGeoreference(),
    },
    {
      id: 'move',
      label: 'Move',
      icon: 'fa-up-down-left-right',
      active: manipMode === 'move',
      disabled: (!hasRaster && !pending) || transformBusy,
      title: 'Move — drag the raster directly on the map',
      onClick: () => setManipMode(manipMode === 'move' ? null : 'move'),
    },
    {
      id: 'scale',
      label: 'Scale',
      icon: 'fa-up-right-and-down-left-from-center',
      active: manipMode === 'scale',
      disabled: (!hasRaster && !pending) || transformBusy,
      title: 'Scale — drag on the map to resize the raster about its centre',
      onClick: () => setManipMode(manipMode === 'scale' ? null : 'scale'),
    },
    {
      id: 'rotate',
      label: 'Rotate',
      icon: 'fa-rotate',
      active: manipMode === 'rotate',
      disabled: (!hasRaster && !pending) || transformBusy,
      title: 'Rotate — drag on the map to spin the raster about its centre',
      onClick: () => setManipMode(manipMode === 'rotate' ? null : 'rotate'),
    },
    {
      id: 'flip-h',
      label: 'Flip H',
      icon: 'fa-left-right',
      disabled: (!hasRaster && !pending) || transformBusy,
      title: 'Flip the raster horizontally (applied immediately)',
      onClick: () => void flipRaster('h'),
    },
    {
      id: 'flip-v',
      label: 'Flip V',
      icon: 'fa-up-down',
      disabled: (!hasRaster && !pending) || transformBusy,
      title: 'Flip the raster vertically (applied immediately)',
      onClick: () => void flipRaster('v'),
    },
    {
      id: 'fixed-rotate',
      label: 'Reset North',
      icon: 'fa-compass',
      disabled: (!hasRaster && !pending) || transformBusy,
      onClick: () => void resetRasterNorth(),
    },
  ]

  const adjustTools: RibbonTool[] = [
    {
      id: 'auto-georef',
      label: 'Auto Georeference',
      icon: 'fa-wand-magic-sparkles',
      active: smartBusy,
      disabled: !hasRaster || smartBusy,
      title: 'Auto Georeference — match the image to the basemap and reposition it automatically',
      onClick: () => void runSmartAutoGeoreferenceDirect(),
    },
    {
      id: 'fit-view',
      label: 'Fit to View',
      icon: 'fa-expand',
      disabled: (!pending && !hasRaster) || georefBusy,
      title: 'Place the raster to fill the current map view (coarse fit)',
      onClick: () => void autoGeoreference(),
    },
    {
      id: 'import-cp',
      label: 'Import Control Points',
      icon: 'fa-file-import',
      disabled: !pending && !hasRaster,
      onClick: () => cpFileInputRef.current?.click(),
    },
    {
      id: 'add-cp',
      label: 'Add Control Points',
      icon: 'fa-thumbtack',
      active: gcpPicking,
      disabled: !pending && !hasRaster,
      title:
        'Add control points: click a point on the source image, then click the matching location on the reference map. Repeat to improve accuracy.',
      onClick: () => {
        if (gcpPicking) {
          stopGcpPicking()
          return
        }
        startGcpPicking()
        setShowTable(true)
      },
    },
    {
      id: 'apply',
      label: 'Apply',
      icon: 'fa-check',
      disabled: !pending || georefBusy || autoApply || (georefMode === 'draw' && !hasDrawnGeometry),
      onClick: runApply,
    },
    {
      id: 'auto-apply',
      label: 'Auto Apply',
      icon: 'fa-bolt',
      active: autoApply,
      disabled: !pending,
      onClick: () => setAutoApply(v => !v),
    },
    {
      id: 'reset',
      label: 'Reset',
      icon: 'fa-arrow-rotate-left',
      disabled: !pending && !hasRaster,
      onClick: () => {
        deleteAllGcps()
        if (hasRaster) void resetRasterNorth()
      },
    },
  ]

  const reviewTools: RibbonTool[] = [
    {
      id: 'cpt',
      label: 'Control Point Table',
      icon: 'fa-table',
      active: showTable,
      disabled: georefMode !== 'gcps',
      onClick: () => setShowTable(v => !v),
    },
    {
      id: 'zoom-to',
      label: 'Zoom To',
      icon: 'fa-magnifying-glass-plus',
      disabled: !onFlyTo || (!selectedGcpId && !hasRaster),
      onClick: zoomTo,
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: 'fa-trash',
      danger: true,
      disabled: !selectedGcpId,
      onClick: deleteSelectedGcp,
    },
    {
      id: 'delete-all',
      label: 'Delete All',
      icon: 'fa-trash-can',
      danger: true,
      disabled: !hasGcps,
      onClick: deleteAllGcps,
    },
  ]

  const saveTools: RibbonTool[] = [
    {
      id: 'save-new',
      label: 'Save as New',
      icon: 'fa-file-export',
      disabled: !raster || pending || exporting,
      onClick: () => void exportGeoTiff(),
      title: 'Export a new GeoTIFF with the georeference written into the image',
    },
    {
      id: 'save-georef',
      label: 'Save Georeferencing',
      icon: 'fa-floppy-disk',
      disabled: !hasRaster || pending,
      onClick: () => exportWorldFile(),
      title: 'Write a world file (.wld) + .prj sidecar next to the source image (ArcGIS-style)',
    },
    {
      id: 'export-cp',
      label: 'Export Control Points',
      icon: 'fa-file-arrow-down',
      disabled: !hasGcps,
      onClick: exportControlPoints,
    },
    {
      id: 'report',
      label: 'Generate Report',
      icon: 'fa-file-lines',
      disabled: !hasRaster,
      onClick: generateReport,
    },
  ]

  const closeTools: RibbonTool[] = [
    {
      id: 'close',
      label: 'Close Georeference',
      icon: 'fa-xmark',
      danger: true,
      onClick: onClose,
    },
  ]

  let body: ReactNode = null
  // In the floating bar, only surface the raster picker when there ARE existing map
  // rasters — otherwise the bar stays a clean toolbar with nothing below it.
  const showBodyCard = !raster && !pending && (variant !== 'bar' || existingRasters.length > 0)
  if (showBodyCard) {
    body = (
      <section className="si-grb__card">
        {existingRasters.length > 0 ? (
          <div className="si-grb__pick">
            <span className="si-grb__label">Georeference a map raster</span>
            <select
              className="si-grb__select"
              value=""
              onChange={e => {
                const cfg = existingRasters.find(r => r.rasterId === e.target.value)
                if (cfg) selectExistingRaster(cfg)
              }}
            >
              <option value="">Select a raster layer…</option>
              {existingRasters.map(r => (
                <option key={r.rasterId} value={r.rasterId}>
                  {r.name}
                </option>
              ))}
            </select>
            {variant !== 'bar' ? <small className="si-grb__pick-or">or add a new image</small> : null}
          </div>
        ) : null}
        {/* Drag & drop upload only in the tall panel — the floating bar stays a clean
            toolbar; add imagery via the Data Manager, then pick it above. */}
        {variant !== 'bar' ? (
          <>
            <span className="si-grb__label">Add raster layer</span>
            <div
              className={'si-grb__drop' + (dragOver ? ' si-grb__drop--over' : '')}
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
              <span>{busy ? 'Uploading…' : 'Drag & drop or click to choose imagery'}</span>
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
          </>
        ) : null}
      </section>
    )
  }

  return (
    <div className={'si-grb' + (variant === 'bar' ? ' si-grb--bar' : '')}>
      {/* Header (title + close) sits above the tools in both layouts, ArcGIS-style. */}
      <div className="si-grb__head">
        <div className="si-grb__title">
          <i className="fa-solid fa-map-location-dot" aria-hidden />
          <span>Georeference</span>
        </div>
        {onClose ? (
          <button type="button" className="si-grb__icon-btn" title="Close" onClick={onClose}>
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        ) : null}
      </div>

      {/* Ribbon — compact single row (icons + tooltips) in bar mode; grouped in panel mode. */}
      {variant === 'bar' ? (
        <div className="si-grb__ribbon si-grb__ribbon--compact" role="toolbar" aria-label="Georeference tools">
          {[
            { label: 'Prepare', tools: prepareTools },
            { label: 'Adjust', tools: adjustTools },
            { label: 'Review', tools: reviewTools },
            { label: 'Save', tools: saveTools },
            { label: 'Close', tools: closeTools },
          ].map((g, gi, arr) => (
            <Fragment key={g.label}>
              {g.tools.map(t => (
                <ToolButton key={t.id} t={t} />
              ))}
              {gi < arr.length - 1 ? <span className="si-grb__divider" aria-hidden /> : null}
            </Fragment>
          ))}
        </div>
      ) : (
        <div className="si-grb__ribbon">
          <RibbonGroup label="Prepare" tools={prepareTools} />
          <RibbonGroup label="Adjust" tools={adjustTools} />
          <RibbonGroup label="Review" tools={reviewTools} />
          <RibbonGroup label="Save" tools={saveTools} />
          <RibbonGroup label="Close" tools={closeTools} />
        </div>
      )}

      {/* Status / error text is chrome — hidden in the thin bar layout. */}
      {variant !== 'bar' && statusMessage ? <p className="si-grb__status">{statusMessage}</p> : null}
      {variant !== 'bar' && error ? (
        <p className="si-grb__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="si-grb__body">
        {/* Hidden picker for Import Control Points (CSV/TSV: col,row,lon,lat). */}
        <input
          ref={cpFileInputRef}
          type="file"
          accept=".csv,.tsv,.txt,.points,.gcp"
          hidden
          onChange={e => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void importGcpsFromFile(file)
          }}
        />
        {body}

        {/* Set SRS */}
        {activePanel === 'srs' && raster ? (
          <SetSrsPanel onAssign={code => void assignCrs(code)} busy={assigningCrs} />
        ) : null}

        {/* Direct-manipulation hint (interaction happens on the map canvas, ArcGIS-style) */}
        {manipMode && variant !== 'bar' ? (
          <div className="si-grb__manip-hint" role="status">
            <i
              className={
                'fa-solid ' +
                (manipMode === 'move'
                  ? 'fa-up-down-left-right'
                  : manipMode === 'rotate'
                    ? 'fa-rotate'
                    : 'fa-up-right-and-down-left-from-center')
              }
              aria-hidden
            />
            {manipMode === 'move'
              ? 'Drag the raster on the map to move it.'
              : manipMode === 'rotate'
                ? 'Drag on the map to rotate the raster.'
                : 'Drag on the map to scale the raster.'}
            {transformBusy ? <i className="fa-solid fa-spinner fa-spin" aria-hidden /> : null}
          </div>
        ) : null}

        {/* Transformation + placement inputs — tall panel only. In the floating bar,
            placement happens directly on the map via the tools (no input card). */}
        {pending && variant !== 'bar' ? (
          <section className="si-grb__card">
            <label className="si-grb__label" htmlFor="si-grb-transform">
              Transformation
            </label>
            <select
              id="si-grb-transform"
              className="si-grb__select"
              value={georefMode}
              onChange={e => setGeorefMode(e.target.value as GeorefMode)}
            >
              {TRANSFORMATIONS.map(t => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>

            {georefMode === 'bbox' ? (
              <div className="si-grb__grid">
                {(['north', 'west', 'east', 'south'] as const).map(key => (
                  <label key={key} className="si-grb__input">
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
              <div className="si-grb__grid">
                {(['nw', 'ne', 'se', 'sw'] as const).map(corner => (
                  <div key={corner} className="si-grb__corner">
                    <span className="si-grb__corner-label">{corner.toUpperCase()}</span>
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

            {georefMode === 'draw' ? (
              <p className="si-grb__hint">Draw a rectangle on the map, then Apply.</p>
            ) : null}
            {georefMode === 'view' ? (
              <p className="si-grb__hint">Frame the image in the current view, then Apply.</p>
            ) : null}

            <div className="si-grb__row si-grb__row--actions">
              <button
                type="button"
                className="si-grb__btn si-grb__btn--primary si-grb__btn--full si-grb__btn--iconized"
                disabled={georefBusy || (georefMode === 'draw' && !hasDrawnGeometry)}
                onClick={runApply}
                title={georefBusy ? 'Placing…' : 'Apply placement'}
              >
                {georefBusy ? (
                  <i className="fa-solid fa-spinner fa-spin" aria-hidden />
                ) : (
                  <i className="fa-solid fa-check" aria-hidden />
                )}
                <span>{georefBusy ? 'Placing…' : 'Apply placement'}</span>
              </button>
              <button
                type="button"
                className="si-grb__btn si-grb__btn--iconized"
                onClick={cancelGeoreference}
                disabled={georefBusy}
                title="Cancel"
              >
                <i className="fa-solid fa-xmark" aria-hidden />
                <span>Cancel</span>
              </button>
            </div>
          </section>
        ) : null}

        {/*
          ArcGIS-style control-point capture. While picking, we show ONLY a small floating
          HUD (count · RMS + Undo/Redo/Delete/Apply/Auto/Finish); the whole interaction
          happens directly on the map canvas. The table is kept for manual entry when NOT picking.
        */}
        {gcpPicking ? (
          <div className="si-grb__cp-hud" role="group" aria-label="Control points">
            <div className="si-grb__cp-hud-stats">
              <div className="si-grb__cp-hud-stat">
                <span className="si-grb__cp-hud-num">{georefGcps.length}</span>
                <span className="si-grb__cp-hud-cap">CP</span>
              </div>
              <div className="si-grb__cp-hud-stat">
                <span className="si-grb__cp-hud-num">{gcpRms != null ? gcpRms.toFixed(2) : '—'}</span>
                <span className="si-grb__cp-hud-cap">RMS m</span>
              </div>
            </div>
            <span className={'si-grb__cp-hud-phase' + (gcpPickPhase === 'to' ? ' is-to' : '')}>
              <i className={'fa-solid ' + (gcpPickPhase === 'from' ? 'fa-image' : 'fa-map-location-dot')} aria-hidden />
              {gcpPickPhase === 'from' ? 'Click source image' : 'Click reference map'}
            </span>
            <div className="si-grb__cp-hud-actions">
              <button type="button" className="si-grb__cp-hud-btn" onClick={undoGcp} disabled={!canUndoGcp} title="Undo last control point">
                <i className="fa-solid fa-rotate-left" aria-hidden />
              </button>
              <button type="button" className="si-grb__cp-hud-btn" onClick={redoGcp} disabled={!canRedoGcp} title="Redo control point">
                <i className="fa-solid fa-rotate-right" aria-hidden />
              </button>
              <button
                type="button"
                className="si-grb__cp-hud-btn"
                onClick={() => {
                  const last = georefGcps[georefGcps.length - 1]
                  if (last) removeGeorefGcp(last.id)
                }}
                disabled={!hasGcps}
                title="Delete last control point"
              >
                <i className="fa-solid fa-trash" aria-hidden />
              </button>
              <button
                type="button"
                className="si-grb__cp-hud-btn si-grb__cp-hud-btn--primary"
                onClick={() => void applyGcps()}
                disabled={!hasGcps || georefBusy}
                title="Apply control points (warp the raster)"
              >
                {georefBusy ? <i className="fa-solid fa-spinner fa-spin" aria-hidden /> : <i className="fa-solid fa-check" aria-hidden />}
              </button>
              <button
                type="button"
                className="si-grb__cp-hud-btn"
                onClick={() => void autoGeoreference()}
                disabled={georefBusy}
                title="Auto-detect control points"
              >
                <i className="fa-solid fa-wand-magic-sparkles" aria-hidden />
              </button>
              <button type="button" className="si-grb__cp-hud-btn si-grb__cp-hud-btn--finish" onClick={stopGcpPicking} title="Finish">
                <i className="fa-solid fa-flag-checkered" aria-hidden />
              </button>
            </div>
          </div>
        ) : (pending && georefMode === 'gcps' && showTable) ? (
          <section className="si-grb__card">
            <div className="si-grb__row si-grb__row--between">
              <span className="si-grb__label">Control points ({georefGcps.length})</span>
              <div className="si-grb__row">
                <button
                  type="button"
                  className="si-grb__btn"
                  onClick={() => {
                    startGcpPicking()
                    setShowTable(true)
                  }}
                  title="Pick a point on the image, then on the map"
                >
                  <i className="fa-solid fa-crosshairs" aria-hidden /> Pick on map
                </button>
                <button type="button" className="si-grb__btn" onClick={addGeorefGcp} title="Add an empty row to type values">
                  <i className="fa-solid fa-plus" aria-hidden /> Row
                </button>
              </div>
            </div>
            {hasGcps ? (
              <table className="si-grb__cpt">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>col</th>
                    <th>row</th>
                    <th>lon</th>
                    <th>lat</th>
                    <th></th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {georefGcps.map((g, i) => (
                    <tr
                      key={g.id}
                      data-selected={g.id === selectedGcpId}
                      onClick={() => setSelectedGcpId(g.id)}
                    >
                      <td>{i + 1}</td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          value={g.col}
                          onChange={e => updateGeorefGcp(g.id, 'col', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          value={g.row}
                          onChange={e => updateGeorefGcp(g.id, 'row', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          value={g.lon}
                          onChange={e => updateGeorefGcp(g.id, 'lon', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          value={g.lat}
                          onChange={e => updateGeorefGcp(g.id, 'lat', e.target.value)}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="si-grb__cpt-row-btn"
                          title="Use last map click for lon/lat"
                          onClick={e => {
                            e.stopPropagation()
                            captureGcpMapPoint(g.id)
                          }}
                        >
                          <i className="fa-solid fa-location-crosshairs" aria-hidden />
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="si-grb__cpt-row-btn"
                          title="Remove point"
                          onClick={e => {
                            e.stopPropagation()
                            removeGeorefGcp(g.id)
                          }}
                        >
                          <i className="fa-solid fa-xmark" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="si-grb__hint">
                Add ≥1 point: image pixel (col,row) ↔ map (lon,lat). 1 point shifts, 2 add
                scale/rotation, 3+ fit a full affine. Use <strong>Pick on map</strong> to click the
                source image then its true location.
              </p>
            )}
            {hasGcps ? (
              <div className="si-grb__row si-grb__cp-apply">
                <button
                  type="button"
                  className="si-grb__btn si-grb__btn--primary si-grb__btn--wide"
                  disabled={georefBusy}
                  onClick={() => void applyGcps()}
                  title="Warp the raster onto the control points"
                >
                  {georefBusy ? (
                    <><i className="fa-solid fa-spinner fa-spin" aria-hidden /> Applying…</>
                  ) : (
                    <><i className="fa-solid fa-check" aria-hidden /> Apply control points ({georefGcps.length})</>
                  )}
                </button>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  )
}

/** Typeahead CRS/EPSG search to assign or override a raster's coordinate system. */
function SetSrsPanel({ onAssign, busy }: { onAssign: (code: string) => void; busy: boolean }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<CrsSearchResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!q.trim()) {
      setResults([])
      return
    }
    const ctl = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        setResults(await searchCrs(q, 12, ctl.signal))
      } catch {
        /* aborted */
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
    <section className="si-grb__card">
      <span className="si-grb__label">Set coordinate system (SRS)</span>
      <input
        className="si-grb__text"
        type="text"
        value={q}
        placeholder='Search "UTM Zone 40N", "EPSG:32640", "WGS84"…'
        onChange={e => setQ(e.target.value)}
        disabled={busy}
      />
      {loading ? <p className="si-grb__hint">Searching…</p> : null}
      {results.length ? (
        <ul className="si-grb__crs-results">
          {results.map(r => (
            <li key={r.code}>
              <button
                type="button"
                onClick={() => {
                  setQ('')
                  setResults([])
                  onAssign(r.code)
                }}
                disabled={busy}
              >
                <span>{r.name}</span>
                <span className="si-grb__crs-meta">
                  {r.code}
                  {r.units ? ` · ${r.units}` : ''}
                  {r.accuracy != null ? ` · ±${r.accuracy} m` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
