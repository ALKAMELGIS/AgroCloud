import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { SiCopyTextButton } from './SiCopyTextButton'
import './MapToolboxLayerList.css'

export type MapToolboxLayerListItem = {
  id: string
  label: string
  meta?: string
  visible: boolean
  toggleable: boolean
  onToggle: () => void
  /** 'raster' | 'vector' drives the type icon and which options are offered. */
  kind?: 'raster' | 'vector'
  /** Live layer opacity (0..1). When provided with onOpacityChange a slider is shown. */
  opacity?: number
  onOpacityChange?: (value: number) => void
  /** Optional GIS export (raster layers → GeoTIFF). */
  onExport?: () => void
  /** Optional removal from the map. */
  onRemove?: () => void
  /** Optional zoom-to-extent action. */
  onZoomTo?: () => void
  /** Optional attribute table. */
  onOpenTable?: () => void
  /** Optional symbology studio. */
  onSymbology?: () => void
  /** Optional metadata / properties. */
  onProperties?: () => void
  /** Optional duplicate layer. */
  onDuplicate?: () => void
  /** Optional rename. */
  onRename?: () => void
  /** Optional AI analysis hook. */
  onAiAnalysis?: () => void
  /** Optional report generation. */
  onGenerateReport?: () => void
  /** Optional on-map label toggle (e.g. contour elevation labels). */
  labelsToggle?: { visible: boolean; onToggle: () => void; labelOn?: string; labelOff?: string }
  /** Legacy inline action buttons (kept for base-overlay rows). */
  actions?: ReactNode
  /** Modern single-control actions rendered in the header next to the toggle (e.g. ⋯ options menu). */
  headerActions?: ReactNode
  /** Visibility control style: 'switch' (pill toggle, default) or 'eye' (GIS-style eye icon). */
  toggleStyle?: 'switch' | 'eye'
  /** Hide the vector/raster type badge (used when a drag grip takes that slot). */
  showTypeIcon?: boolean
}

type MapToolboxLayerRowProps = Omit<MapToolboxLayerListItem, 'id'>

/** Floating, portal-positioned options menu (ArcGIS-style ⋯ dropdown). */
function LayerOptionsMenu({
  label,
  kind,
  visible,
  onToggle,
  opacity,
  onOpacityChange,
  onExport,
  onRemove,
  onZoomTo,
  onOpenTable,
  onSymbology,
  onProperties,
  onDuplicate,
  onRename,
  onAiAnalysis,
  onGenerateReport,
  labelsToggle,
}: {
  label: string
  kind?: 'raster' | 'vector'
  visible?: boolean
  onToggle?: () => void
  opacity?: number
  onOpacityChange?: (value: number) => void
  onExport?: () => void
  onRemove?: () => void
  onZoomTo?: () => void
  onOpenTable?: () => void
  onSymbology?: () => void
  onProperties?: () => void
  onDuplicate?: () => void
  onRename?: () => void
  onAiAnalysis?: () => void
  onGenerateReport?: () => void
  labelsToggle?: { visible: boolean; onToggle: () => void; labelOn?: string; labelOff?: string }
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  const place = useCallback(() => {
    const btn = btnRef.current
    if (!btn) return
    const r = btn.getBoundingClientRect()
    const width = 224
    let left = r.right - width
    if (left < 8) left = 8
    if (left + width > window.innerWidth - 8) left = window.innerWidth - 8 - width
    setCoords({ top: r.bottom + 6, left })
  }, [])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (popRef.current?.contains(e.target as Node)) return
      if (btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onReflow = () => place()
    // Capture phase: the dock stops pointer/mouse events in the bubble phase
    // (map-overlay isolation), so a bubble-phase document listener would never
    // see clicks inside the dock. Capture runs before that stop, so click-away
    // still closes the menu.
    document.addEventListener('mousedown', onDoc, true)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      document.removeEventListener('mousedown', onDoc, true)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open, place])

  const hasOpacity = typeof opacity === 'number' && !!onOpacityChange
  const hasMenu = !!(onRemove || onExport || onZoomTo || onOpenTable || onSymbology || onProperties || onDuplicate || onRename || onAiAnalysis || onGenerateReport || labelsToggle || hasOpacity)

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`si-mt-layer__opts-btn${open ? ' is-open' : ''}`}
        title="Layer options"
        aria-label={`Options for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <i className="fa-solid fa-ellipsis" aria-hidden />
      </button>
      {open && coords
        ? createPortal(
            <div
              ref={popRef}
              className="si-mt-layer-menu"
              role="menu"
              style={{ top: coords.top, left: coords.left }}
              onMouseDown={e => e.stopPropagation()}
            >
              <div className="si-mt-layer-menu__head">
                <span className="si-mt-layer-menu__type" aria-hidden>
                  <i className={`fa-solid ${kind === 'raster' ? 'fa-layer-group' : 'fa-draw-polygon'}`} />
                </span>
                <span className="si-mt-layer-menu__name" title={label}>
                  {label}
                </span>
              </div>

              {onZoomTo ? (
                <button
                  type="button"
                  role="menuitem"
                  className="si-mt-layer-menu__item"
                  onClick={() => {
                    onZoomTo()
                    setOpen(false)
                  }}
                >
                  <i className="fa-solid fa-magnifying-glass-location" aria-hidden />
                  <span>Zoom to layer</span>
                </button>
              ) : null}

              {onOpenTable ? (
                <button
                  type="button"
                  role="menuitem"
                  className="si-mt-layer-menu__item"
                  onClick={() => {
                    onOpenTable()
                    setOpen(false)
                  }}
                >
                  <i className="fa-solid fa-table" aria-hidden />
                  <span>Open attribute table</span>
                </button>
              ) : null}

              {onSymbology ? (
                <button
                  type="button"
                  role="menuitem"
                  className="si-mt-layer-menu__item"
                  onClick={() => {
                    onSymbology()
                    setOpen(false)
                  }}
                >
                  <i className="fa-solid fa-palette" aria-hidden />
                  <span>Symbology</span>
                </button>
              ) : null}

              {onProperties ? (
                <button
                  type="button"
                  role="menuitem"
                  className="si-mt-layer-menu__item"
                  onClick={() => {
                    onProperties()
                    setOpen(false)
                  }}
                >
                  <i className="fa-solid fa-sliders" aria-hidden />
                  <span>Properties / metadata</span>
                </button>
              ) : null}

              {onDuplicate ? (
                <button
                  type="button"
                  role="menuitem"
                  className="si-mt-layer-menu__item"
                  onClick={() => {
                    onDuplicate()
                    setOpen(false)
                  }}
                >
                  <i className="fa-regular fa-copy" aria-hidden />
                  <span>Duplicate</span>
                </button>
              ) : null}

              {onRename ? (
                <button
                  type="button"
                  role="menuitem"
                  className="si-mt-layer-menu__item"
                  onClick={() => {
                    onRename()
                    setOpen(false)
                  }}
                >
                  <i className="fa-solid fa-i-cursor" aria-hidden />
                  <span>Rename</span>
                </button>
              ) : null}

              {onAiAnalysis ? (
                <button
                  type="button"
                  role="menuitem"
                  className="si-mt-layer-menu__item"
                  onClick={() => {
                    onAiAnalysis()
                    setOpen(false)
                  }}
                >
                  <i className="fa-solid fa-brain" aria-hidden />
                  <span>AI Analysis</span>
                </button>
              ) : null}

              {onGenerateReport ? (
                <button
                  type="button"
                  role="menuitem"
                  className="si-mt-layer-menu__item"
                  onClick={() => {
                    onGenerateReport()
                    setOpen(false)
                  }}
                >
                  <i className="fa-solid fa-file-lines" aria-hidden />
                  <span>Generate report</span>
                </button>
              ) : null}

              {onToggle ? (
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={!!visible}
                  className="si-mt-layer-menu__item"
                  onClick={() => onToggle()}
                >
                  <i className={`fa-solid ${visible ? 'fa-eye' : 'fa-eye-slash'}`} aria-hidden />
                  <span>{visible ? 'Displayed on map' : 'Hidden — show on map'}</span>
                </button>
              ) : null}

              {labelsToggle ? (
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={labelsToggle.visible}
                  className="si-mt-layer-menu__item"
                  onClick={() => labelsToggle.onToggle()}
                >
                  <i className="fa-solid fa-tag" aria-hidden />
                  <span>
                    {labelsToggle.visible
                      ? labelsToggle.labelOn ?? 'Hide labels'
                      : labelsToggle.labelOff ?? 'Show labels'}
                  </span>
                </button>
              ) : null}

              {(onToggle || labelsToggle) && hasOpacity ? <div className="si-mt-layer-menu__sep" /> : null}

              {hasOpacity ? (
                <div className="si-mt-layer-menu__opacity">
                  <div className="si-mt-layer-menu__opacity-row">
                    <span>Layer opacity</span>
                    <span className="si-mt-layer-menu__opacity-val">{Math.round((opacity ?? 1) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={opacity ?? 1}
                    onChange={e => onOpacityChange?.(Number(e.target.value))}
                    aria-label={`${label} opacity`}
                  />
                </div>
              ) : null}

              {onExport || onRemove ? <div className="si-mt-layer-menu__sep" /> : null}

              {onExport ? (
                <button
                  type="button"
                  role="menuitem"
                  className="si-mt-layer-menu__item"
                  onClick={() => {
                    onExport()
                    setOpen(false)
                  }}
                >
                  <i className="fa-solid fa-file-export" aria-hidden />
                  <span>Export raster (GeoTIFF)</span>
                </button>
              ) : null}

              {onRemove ? (
                <button
                  type="button"
                  role="menuitem"
                  className="si-mt-layer-menu__item si-mt-layer-menu__item--danger"
                  onClick={() => {
                    onRemove()
                    setOpen(false)
                  }}
                >
                  <i className="fa-solid fa-trash-can" aria-hidden />
                  <span>Remove layer</span>
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

export function MapToolboxLayerRow({
  label,
  meta,
  visible,
  toggleable,
  onToggle,
  kind,
  opacity,
  onOpacityChange,
  onExport,
  onRemove,
  onZoomTo,
  onOpenTable,
  onSymbology,
  onProperties,
  onDuplicate,
  onRename,
  onAiAnalysis,
  onGenerateReport,
  labelsToggle,
  actions,
  headerActions,
  toggleStyle = 'eye',
  showTypeIcon = true,
}: MapToolboxLayerRowProps) {
  const hasMenu = !!(
    onRemove ||
    onExport ||
    onZoomTo ||
    onOpenTable ||
    onSymbology ||
    onProperties ||
    onDuplicate ||
    onRename ||
    onAiAnalysis ||
    onGenerateReport ||
    labelsToggle ||
    (typeof opacity === 'number' && onOpacityChange)
  )
  const isEyeStyle = toggleStyle === 'eye'
  return (
    <div
      className={`si-mt-layer${visible ? ' si-mt-layer--on' : ''}${!toggleable ? ' si-mt-layer--static' : ''}`}
    >
      <div className="si-mt-layer__accent" aria-hidden />
      <div className="si-mt-layer__main">
        {kind && showTypeIcon ? (
          <span
            className={`si-mt-layer__type si-mt-layer__type--${kind}`}
            title={kind === 'raster' ? 'Raster layer' : 'Vector layer'}
            aria-hidden
          >
            <i className={`fa-solid ${kind === 'raster' ? 'fa-layer-group' : 'fa-draw-polygon'}`} />
          </span>
        ) : null}
        <div className="si-mt-layer__text">
          <span className="si-mt-layer__name" title={label}>
            {label}
          </span>
          {meta ? (
            <span className="si-mt-layer__status" title={meta}>
              {meta}
            </span>
          ) : null}
        </div>
        <div className="si-mt-layer__controls">
          {toggleable ? (
            isEyeStyle ? (
              <button
                type="button"
                className={`si-mt-layer__eye${visible ? ' is-on' : ''}`}
                title={visible ? 'Hide layer' : 'Show layer'}
                aria-pressed={visible}
                aria-label={visible ? 'Hide layer' : 'Show layer'}
                onClick={() => onToggle()}
              >
                <i className={`fa-solid ${visible ? 'fa-eye' : 'fa-eye-slash'}`} aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                role="switch"
                aria-checked={visible}
                className={`si-mt-layer__switch${visible ? ' is-on' : ''}`}
                title={visible ? 'Display on — click to hide' : 'Display off — click to show'}
                aria-label={`${visible ? 'Turn off' : 'Turn on'} ${label}`}
                onClick={() => onToggle()}
              >
                <span className="si-mt-layer__switch-ui" aria-hidden />
              </button>
            )
          ) : (
            <span className="si-mt-layer__always">Always on</span>
          )}
          {headerActions ? (
            <div className="si-mt-layer__header-actions">{headerActions}</div>
          ) : hasMenu ? (
            <LayerOptionsMenu
              label={label}
              kind={kind}
              visible={visible}
              onToggle={toggleable ? onToggle : undefined}
              opacity={opacity}
              onOpacityChange={onOpacityChange}
              onExport={onExport}
              onRemove={onRemove}
              onZoomTo={onZoomTo}
              onOpenTable={onOpenTable}
              onSymbology={onSymbology}
              onProperties={onProperties}
              onDuplicate={onDuplicate}
              onRename={onRename}
              onAiAnalysis={onAiAnalysis}
              onGenerateReport={onGenerateReport}
              labelsToggle={labelsToggle}
            />
          ) : (
            <SiCopyTextButton
              text={label}
              className="si-mt-layer__copy"
              title="Copy layer name"
              ariaLabel={`Copy ${label}`}
              variant="compact"
            />
          )}
        </div>
      </div>
      {actions ? <div className="si-mt-layer__actions">{actions}</div> : null}
    </div>
  )
}

export function MapToolboxLayerList({
  layers,
  emptyMessage = 'No layers on map.',
  rowToggleStyle = 'eye',
  reorderable = false,
  onReorder,
}: {
  layers: MapToolboxLayerListItem[]
  emptyMessage?: string
  /** Default visibility-control style for every row (rows can still override per-item). */
  rowToggleStyle?: 'switch' | 'eye'
  /** Show a drag grip and allow drag/keyboard reordering of the rows. */
  reorderable?: boolean
  /** Called with (draggedId, targetId) when a row is dropped onto another. */
  onReorder?: (draggedId: string, targetId: string) => void
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropId, setDropId] = useState<string | null>(null)

  if (!layers.length) {
    return <p className="si-mt-layer-list__empty">{emptyMessage}</p>
  }

  const renderRow = (layer: MapToolboxLayerListItem, showTypeIcon = true) => (
    <MapToolboxLayerRow
      label={layer.label}
      meta={layer.meta}
      visible={layer.visible}
      toggleable={layer.toggleable}
      onToggle={layer.onToggle}
      kind={layer.kind}
      opacity={layer.opacity}
      onOpacityChange={layer.onOpacityChange}
      onExport={layer.onExport}
      onRemove={layer.onRemove}
      onZoomTo={layer.onZoomTo}
      onOpenTable={layer.onOpenTable}
      onSymbology={layer.onSymbology}
      onProperties={layer.onProperties}
      onDuplicate={layer.onDuplicate}
      onRename={layer.onRename}
      onAiAnalysis={layer.onAiAnalysis}
      onGenerateReport={layer.onGenerateReport}
      labelsToggle={layer.labelsToggle}
      actions={layer.actions}
      headerActions={layer.headerActions}
      toggleStyle={layer.toggleStyle ?? rowToggleStyle}
      showTypeIcon={showTypeIcon}
    />
  )

  if (!reorderable || !onReorder) {
    return (
      <div className="si-mt-layer-list" role="list" aria-label="Map layers">
        {layers.map(layer => (
          <div key={layer.id}>{renderRow(layer)}</div>
        ))}
      </div>
    )
  }

  const canReorder = layers.length > 1

  return (
    <div className="si-mt-layer-list si-mt-layer-list--user" role="list" aria-label="Map layers">
      {layers.map((layer, idx) => {
        const isDragging = draggingId === layer.id
        const isDrop = dropId === layer.id && draggingId !== layer.id
        return (
          <div
            key={layer.id}
            className={
              'si-env-user-layer-row' +
              (isDragging ? ' is-dragging' : '') +
              (isDrop ? ' is-drop-target' : '')
            }
            onDragOver={
              canReorder
                ? e => {
                    if (!draggingId) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    if (dropId !== layer.id) setDropId(layer.id)
                  }
                : undefined
            }
            onDrop={
              canReorder
                ? e => {
                    e.preventDefault()
                    if (draggingId && draggingId !== layer.id) onReorder(draggingId, layer.id)
                    setDraggingId(null)
                    setDropId(null)
                  }
                : undefined
            }
            onDragLeave={
              canReorder ? () => setDropId(prev => (prev === layer.id ? null : prev)) : undefined
            }
          >
            <span
              className="si-env-user-layer-grip"
              role="button"
              tabIndex={0}
              draggable
              title="Drag to reposition"
              aria-label={`Drag to reposition ${layer.label}`}
              onDragStart={e => {
                setDraggingId(layer.id)
                e.dataTransfer.effectAllowed = 'move'
                try {
                  e.dataTransfer.setData('text/plain', layer.id)
                } catch {
                  /* some browsers disallow setData here */
                }
              }}
              onDragEnd={() => {
                setDraggingId(null)
                setDropId(null)
              }}
              onKeyDown={e => {
                if (e.key === 'ArrowUp' && idx > 0) {
                  e.preventDefault()
                  onReorder(layer.id, layers[idx - 1]!.id)
                } else if (e.key === 'ArrowDown' && idx < layers.length - 1) {
                  e.preventDefault()
                  onReorder(layer.id, layers[idx + 1]!.id)
                }
              }}
            >
              <i className="fa-solid fa-grip-vertical" aria-hidden />
            </span>
            {renderRow(layer, false)}
          </div>
        )
      })}
    </div>
  )
}
